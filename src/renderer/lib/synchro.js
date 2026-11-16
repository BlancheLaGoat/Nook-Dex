// Synchro en ligne entre le PC et le téléphone, sans compte : un « code de synchro » partagé entre tes appareils.
//
// Le serveur est celui de Coffre (Cloudflare Worker, dépôt BlancheLaGoat/Coffre, cloud/worker.js), réutilisé tel quel :
// il garde un bloc par identifiant, sans pouvoir le lire. Nook Dex tire son identifiant et sa clé du code avec le
// préfixe « nookdex- » (Coffre utilise « coffre- ») : les deux applis ne se mélangent jamais, même avec le même code.
// Les profils sont compressés (gzip) puis chiffrés ici (AES-GCM) avant l'envoi.
//
// Fusion « à trois » : chaque appareil garde la dernière version synchronisée (« base »). Pour chaque coche et chaque
// réglage d'un profil, ce que CET appareil a changé depuis la base gagne ; sinon on prend la version en ligne.
// Les décochages et les profils supprimés se propagent donc aussi. Si la même coche a changé des deux côtés entre
// deux synchros, la version de l'appareil qui synchronise gagne.
//
// Ce fichier ne touche pas à l'affichage : la synchro reçoit de quoi lire et écrire les profils (testable seule).

export const URL_SERVEUR = 'https://coffre-sync.ixaglax.workers.dev';

// ---------- Code de synchro : 20 octets au hasard → 32 caractères (base 32 de Crockford, sans I, L, O, U) ----------
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function nouveauCode(hasard = n => crypto.getRandomValues(new Uint8Array(n))) {
  let bits = 0, val = 0, code = '';
  for (const o of hasard(20)) {
    val = (val << 8) | o; bits += 8;
    while (bits >= 5) { code += ALPHABET[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return code;
}
// Code tapé ou collé → code propre, ou '' s'il n'est pas valable (O se lit 0, I et L se lisent 1).
export function normaliserCode(texte) {
  const t = String(texte || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^A-Z0-9]/g, '');
  return t.length === 32 && [...t].every(c => ALPHABET.includes(c)) ? t : '';
}
export const codeLisible = c => c.match(/.{1,4}/g).join('-');

// ---------- Chiffrement ----------
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = texte => crypto.subtle.digest('SHA-256', enc.encode(texte));
const cles = new Map();
async function clesDe(code) {
  if (!cles.has(code)) {
    cles.set(code, {
      id: hex(await sha(`nookdex-id:${code}`)),
      aes: await crypto.subtle.importKey('raw', await sha(`nookdex-key:${code}`), 'AES-GCM', false, ['encrypt', 'decrypt']),
    });
  }
  return cles.get(code);
}
export const identifiantDe = async code => (await clesDe(code)).id;
const versB64 = o => { let s = ''; for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode.apply(null, o.subarray(i, i + 0x8000)); return btoa(s); };
const depuisB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const passer = async (octets, flux) => new Uint8Array(await new Response(new Blob([octets]).stream().pipeThrough(flux)).arrayBuffer());

export async function sceller(code, objet) {
  const { aes } = await clesDe(code);
  const octets = await passer(enc.encode(JSON.stringify(objet)), new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, octets));
  const tout = new Uint8Array(12 + chiffre.length); tout.set(iv); tout.set(chiffre, 12);
  return `1.${versB64(tout)}`;
}
export async function ouvrir(code, texte) {
  const { aes } = await clesDe(code);
  const [marque, corps] = String(texte).split('.');
  if (marque !== '1') throw new Error('format inconnu');
  const tout = depuisB64(corps || '');
  const octets = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: tout.subarray(0, 12) }, aes, tout.subarray(12)));
  return JSON.parse(dec.decode(await passer(octets, new DecompressionStream('gzip'))));
}

// ---------- Fusion ----------
// Ce qui se synchronise dans un profil (pas « modifie_le » ni « schema », propres à chaque appareil).
export const CHAMPS_PROFIL = ['nom', 'jeu', 'hemisphere', 'extensions', 'joueur', 'region', 'navets', 'ville', 'champFleurs', 'cree_le'];
// JSON aux clés triées : deux objets égaux donnent toujours le même texte, quel que soit l'ordre des clés.
export function empreinte(x) {
  if (x === undefined) return 'undefined';
  return JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));
}
// Profil → forme synchronisée.
export function versSynchro(p) {
  const o = { id: p.id };
  for (const c of CHAMPS_PROFIL) if (p[c] !== undefined) o[c] = p[c];
  o.elements = p.elements || {};
  return o;
}
// Une clé : ce que cet appareil a changé depuis la base gagne, sinon la version en ligne.
const choisir = (base, local, distant) => (empreinte(local) !== empreinte(base) ? local : distant);
export function fusionnerProfil(base = {}, local, distant) {
  const r = { id: local.id };
  for (const c of CHAMPS_PROFIL) {
    const v = choisir(base[c], local[c], distant[c]);
    if (v !== undefined) r[c] = v;
  }
  const b = base.elements || {}, l = local.elements || {}, d = distant.elements || {};
  r.elements = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(d), ...Object.keys(b)])) {
    const v = choisir(b[k], l[k], d[k]);
    if (v !== undefined) r.elements[k] = v;
  }
  return r;
}
// Tous les profils : { [id]: profil synchronisé }. Un profil supprimé d'un côté et pas modifié de l'autre disparaît ;
// modifié de l'autre côté, il est gardé (on ne perd jamais des coches).
export function fusionnerProfils(base = {}, local = {}, distant = {}) {
  const r = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(distant)])) {
    const B = base[id], L = local[id], D = distant[id];
    if (L && D) r[id] = fusionnerProfil(B, L, D);
    else if (L) { if (!B || empreinte(L) !== empreinte(B)) r[id] = L; }      // supprimé en ligne : gardé seulement si modifié ici
    else if (D) { if (!B || empreinte(D) !== empreinte(B)) r[id] = D; }      // supprimé ici : gardé seulement si modifié ailleurs
  }
  return r;
}

// ---------- Échanges avec le serveur ----------
async function appeler(code, methode, corps, fetchFn = fetch) {
  const id = await identifiantDe(code);
  let rep;
  try {
    rep = await fetchFn(`${URL_SERVEUR}/v1/s/${id}`, {
      method: methode, cache: 'no-store',
      headers: { 'X-Coffre': '1', ...(corps ? { 'Content-Type': 'application/json' } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
    });
  } catch (e) {
    const err = new Error('Pas de connexion internet (ou serveur de synchro injoignable).'); err.horsLigne = true; throw err;
  }
  if (rep.status === 404 && methode === 'GET') return null;
  if (rep.status === 409) { const err = new Error('conflit'); err.conflit = true; throw err; }
  if (rep.status === 413) throw new Error('Tes profils sont trop gros pour la synchro en ligne.');
  if (!rep.ok) throw new Error(`Le serveur de synchro a répondu ${rep.status}.`);
  return rep.json();
}

// Une synchro complète.
//  acces : { lireTout() → { [id]: profil complet }, ecrire(profil), supprimer(id) } (profils de cet appareil) ;
//  etatSynchro : { code, base } (base = { [id]: profil synchronisé }, celle de la dernière synchro réussie).
//  doitExister : pour « relier un appareil » : erreur si rien n'est encore en ligne pour ce code.
// Renvoie { base, ecrits: [ids], supprimes: [ids] }.
export async function synchroniser(acces, etatSynchro, { doitExister = false, fetchFn = fetch } = {}) {
  const { code } = etatSynchro;
  for (let essai = 0; essai < 4; essai++) {
    const enLigne = await appeler(code, 'GET', null, fetchFn);
    if (!enLigne && doitExister) {
      const e = new Error("Rien n'est encore enregistré en ligne pour ce code. Vérifie-le, ou active d'abord la synchro sur l'autre appareil.");
      e.inconnu = true; throw e;
    }
    let distant = {};
    if (enLigne) {
      try { distant = (await ouvrir(code, enLigne.data)).profils || {}; } catch (e) { throw new Error('Les données en ligne sont illisibles avec ce code.'); }
    }
    const complets = await acces.lireTout();
    const local = Object.fromEntries(Object.values(complets).map(p => [p.id, versSynchro(p)]));
    // « Relier un appareil » : il n'a pas de base ; ses profils s'ajoutent à ceux en ligne.
    const fusion = fusionnerProfils(etatSynchro.base || {}, local, distant);
    // Envoi d'abord : si un autre appareil a écrit entre-temps (conflit), on recommence sans avoir rien changé ici.
    if (!enLigne || empreinte(fusion) !== empreinte(distant)) {
      try {
        await appeler(code, 'PUT', { ver: enLigne ? enLigne.ver : 0, data: await sceller(code, { v: 1, profils: fusion }) }, fetchFn);
      } catch (e) { if (e.conflit && essai < 3) continue; throw e; }
    }
    // Puis on applique la fusion ici.
    const ecrits = [], supprimes = [];
    for (const [id, p] of Object.entries(fusion)) {
      if (empreinte(p) === empreinte(local[id])) continue;
      const ancien = complets[id] || {};
      const complet = { ...ancien, ...p, elements: p.elements };
      for (const c of CHAMPS_PROFIL) if (p[c] === undefined) delete complet[c];
      await acces.ecrire(complet);
      ecrits.push(id);
    }
    for (const id of Object.keys(local)) if (!fusion[id]) { await acces.supprimer(id); supprimes.push(id); }
    return { base: fusion, ecrits, supprimes };
  }
  throw new Error('La synchro a échoué (trop de modifications en même temps). Réessaie.');
}

export async function supprimerEnLigne(code, fetchFn = fetch) {
  await appeler(code, 'DELETE', null, fetchFn);
}
