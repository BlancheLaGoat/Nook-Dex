// Nook Dex — serveur de synchro en ligne (Cloudflare Worker + Durable Object « Synchro »).
//
// Il garde une sauvegarde par « code de synchro », et prévient tout de suite les appareils connectés quand elle change.
// Tout est chiffré sur l'appareil avant l'envoi : le serveur (et donc la personne qui l'héberge) ne peut pas lire
// les profils. L'appareil envoie un identifiant tiré du code ; le serveur range chaque sauvegarde dans un
// Durable Object nommé d'après une empreinte de cet identifiant.
//
//   GET    /v1/s/<id>    → { ver, data, at }   (404 si rien n'est encore enregistré)
//   PUT    /v1/s/<id>    ← { ver, data }       (ver = version lue avant ; 409 si quelqu'un a écrit entre-temps)
//   DELETE /v1/s/<id>    → supprime la sauvegarde
//   GET    /v1/ws/<id>   → WebSocket : le serveur envoie { t: 'maj', ver, source } à chaque nouvelle version
//                          (« source » = l'appareil qui l'a envoyée, en-tête X-Appareil du PUT) ;
//                          « ping » reçoit « pong » sans réveiller le Durable Object.
import { DurableObject } from 'cloudflare:workers';

const MAX_OCTETS = 1900000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-NookDex, X-Appareil',
  'Access-Control-Max-Age': '86400',
};
const json = (objet, status = 200) => new Response(JSON.stringify(objet), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
});
async function sha256Hex(texte) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Une sauvegarde (un code de synchro) = un Durable Object : stockage et appareils connectés au même endroit.
export class Synchro extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Garder la connexion ouverte sans réveiller l'objet (et sans rien facturer) : « ping » → « pong ».
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/v1/ws/')) {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'WebSocket attendu' }, 426);
      const [client, serveur] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(serveur);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (req.method === 'GET') {
      const s = await this.ctx.storage.get('sauvegarde');
      return s ? json(s) : json({ error: 'vide' }, 404);
    }
    if (req.method === 'DELETE') {
      await this.ctx.storage.deleteAll();
      return json({ ok: true });
    }
    if (req.method === 'PUT') {
      if (Number(req.headers.get('Content-Length') || 0) > MAX_OCTETS) return json({ error: 'trop gros' }, 413);
      const corps = await req.text();
      if (corps.length > MAX_OCTETS) return json({ error: 'trop gros' }, 413);
      let o;
      try { o = JSON.parse(corps); } catch (e) { return json({ error: 'JSON invalide' }, 400); }
      if (!o || typeof o.data !== 'string' || !o.data || !Number.isInteger(o.ver) || o.ver < 0) return json({ error: 'requête invalide' }, 400);
      // Les requêtes d'un même Durable Object passent une par une : lire puis écrire ne peut pas être interrompu.
      const actuelle = await this.ctx.storage.get('sauvegarde');
      if ((actuelle ? actuelle.ver : 0) !== o.ver) return json({ error: 'conflit' }, 409);
      const s = { ver: o.ver + 1, data: o.data, at: Date.now() };
      await this.ctx.storage.put('sauvegarde', s);
      const message = JSON.stringify({ t: 'maj', ver: s.ver, source: String(req.headers.get('X-Appareil') || '').slice(0, 40) });
      for (const ws of this.ctx.getWebSockets()) { try { ws.send(message); } catch (e) { /* appareil parti */ } }
      return json({ ver: s.ver, at: s.at });
    }
    return json({ error: 'méthode non prise en charge' }, 405);
  }

  // Messages des appareils : seul « ping » est attendu (réglé plus haut, sans réveil) ; le reste est ignoré.
  async webSocketMessage() {}
  async webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'fin'); } catch (e) { /* déjà fermée */ } }
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/v1') return json({ ok: true, app: 'nookdex-sync', v: 1, direct: true });
    const m = url.pathname.match(/^\/v1\/(s|ws)\/([a-f0-9]{64})$/);
    if (!m) return json({ error: 'introuvable' }, 404);
    // Un navigateur ne peut pas ajouter d'en-tête à une connexion WebSocket : la vérification ne vaut que pour HTTP.
    if (m[1] === 's' && req.headers.get('X-NookDex') !== '1') return json({ error: 'client inconnu' }, 400);
    const nom = await sha256Hex(`nookdex-sync:${m[2]}`);
    return env.SYNCHRO.get(env.SYNCHRO.idFromName(nom)).fetch(req);
  },
};
