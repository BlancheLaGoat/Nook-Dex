// Tests automatiques de la synchro en ligne (src/renderer/lib/synchro.js) : code, chiffrement, fusion à trois,
// et deux appareils (PC, téléphone) qui se synchronisent par un faux serveur qui se comporte comme le Worker de Coffre.
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { createHash } = require('crypto');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'synchro.js')).href);

test('code de synchro : 32 caractères, fautes de frappe courantes tolérées', async () => {
  const { nouveauCode, normaliserCode, codeLisible } = await charger();
  const c = nouveauCode();
  assert.match(c, /^[0-9A-HJKMNP-TV-Z]{32}$/);
  assert.strictEqual(normaliserCode(codeLisible(c).toLowerCase()), c);
  assert.strictEqual(normaliserCode('O'.repeat(32)), '0'.repeat(32));
  assert.strictEqual(normaliserCode('IL'.repeat(16)), '1'.repeat(32));
  assert.strictEqual(normaliserCode('ABC'), '');
  assert.strictEqual(codeLisible('0123456789ABCDEFGHJKMNPQRSTVWXYZ'), '0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ');
});

test('chiffrement : aller-retour, illisible avec un autre code, identifiant distinct de Coffre', async () => {
  const { sceller, ouvrir, identifiantDe, nouveauCode } = await charger();
  const code = nouveauCode();
  const objet = { v: 1, profils: { 'p-1': { id: 'p-1', nom: 'Blanche', elements: { 'insectes:x': { obtenu: true } } } } };
  const scelle = await sceller(code, objet);
  assert.match(scelle, /^1\./);
  assert.ok(!scelle.includes('Blanche'));
  assert.deepStrictEqual(await ouvrir(code, scelle), objet);
  await assert.rejects(ouvrir(nouveauCode(), scelle));
  const coffre = createHash('sha256').update(`coffre-id:${code}`).digest('hex');
  assert.notStrictEqual(await identifiantDe(code), coffre);
  assert.match(await identifiantDe(code), /^[0-9a-f]{64}$/);
});

test('fusion à trois : coches des deux côtés, décochage, réglages, conflit', async () => {
  const { fusionnerProfil, empreinte } = await charger();
  const base = { id: 'p', nom: 'Ville', navets: { achat: 100 }, elements: { a: { obtenu: true }, b: { obtenu: true }, c: { obtenu: true } } };
  const local = { id: 'p', nom: 'Ville', navets: { achat: 95 }, elements: { a: { obtenu: true }, c: { obtenu: true, musee: true }, d: { obtenu: true } } };
  const distant = { id: 'p', nom: 'Mon bourg', navets: { achat: 100 }, elements: { b: { obtenu: true }, c: { obtenu: true }, e: { obtenu: true } } };
  const r = fusionnerProfil(base, local, distant);
  assert.strictEqual(r.nom, 'Mon bourg');                 // changé en ligne seulement
  assert.deepStrictEqual(r.navets, { achat: 95 });        // changé ici seulement
  assert.deepStrictEqual(Object.keys(r.elements).sort(), ['c', 'd', 'e']);   // a décoché en ligne, b décoché ici
  assert.deepStrictEqual(r.elements.c, { obtenu: true, musee: true });
  // Conflit (même coche changée des deux côtés) : la version de l'appareil qui synchronise gagne.
  const r2 = fusionnerProfil({ id: 'p', elements: { a: { obtenu: true } } }, { id: 'p', elements: { a: { obtenu: true, musee: true } } }, { id: 'p', elements: {} });
  assert.deepStrictEqual(r2.elements.a, { obtenu: true, musee: true });
  // L'ordre des clés ne compte pas.
  assert.strictEqual(empreinte({ x: 1, y: { b: 2, a: 1 } }), empreinte({ y: { a: 1, b: 2 }, x: 1 }));
});

test('fusion des profils : création et suppression se propagent, sans perdre de coches', async () => {
  const { fusionnerProfils } = await charger();
  const P = (id, el = {}) => ({ id, nom: id, elements: el });
  const base = { a: P('a'), b: P('b'), c: P('c') };
  const local = { a: P('a'), c: P('c', { x: { obtenu: true } }), n: P('n') };   // b supprimé ici, c modifié, n créé
  const distant = { a: P('a'), b: P('b'), m: P('m') };                           // c supprimé en ligne, m créé
  const r = fusionnerProfils(base, local, distant);
  assert.deepStrictEqual(Object.keys(r).sort(), ['a', 'c', 'm', 'n']);
  assert.ok(r.c.elements.x);
  // Supprimé en ligne et pas touché ici : il disparaît.
  assert.deepStrictEqual(Object.keys(fusionnerProfils({ a: P('a') }, { a: P('a') }, {})), []);
});

// Faux serveur : même comportement que cloud/worker.js de Coffre (version, conflit 409, 404 si vide).
function serveur() {
  const lignes = new Map();
  let ecritures = 0;
  const fetchFn = async (url, { method, headers, body }) => {
    const id = url.split('/').pop();
    const rep = (status, objet) => ({ status, ok: status >= 200 && status < 300, json: async () => objet });
    if (headers['X-Coffre'] !== '1') return rep(400, { error: 'client inconnu' });
    const l = lignes.get(id);
    if (method === 'GET') return l ? rep(200, { ...l }) : rep(404, { error: 'vide' });
    if (method === 'DELETE') { lignes.delete(id); return rep(200, { ok: true }); }
    const o = JSON.parse(body);
    if ((o.ver === 0 && l) || (o.ver > 0 && (!l || l.ver !== o.ver))) return rep(409, { error: 'conflit' });
    lignes.set(id, { ver: o.ver + 1, data: o.data, at: Date.now() });
    ecritures++;
    return rep(200, { ver: o.ver + 1 });
  };
  return { fetchFn, lignes, ecritures: () => ecritures };
}
// Un appareil : ses profils (comme les fichiers de profils) et son état de synchro.
function appareil(profils = {}) {
  const corbeille = [];
  const a = {
    profils: JSON.parse(JSON.stringify(profils)), corbeille, etat: null,
    acces: {
      lireTout: async () => JSON.parse(JSON.stringify(a.profils)),
      ecrire: async p => { a.profils[p.id] = JSON.parse(JSON.stringify(p)); },
      supprimer: async id => { corbeille.push(id); delete a.profils[id]; },
    },
  };
  return a;
}

test('deux appareils : activer, relier, cocher des deux côtés, supprimer un profil', async () => {
  const { synchroniser, nouveauCode } = await charger();
  const srv = serveur();
  const sync = async (ap, opts = {}) => { const r = await synchroniser(ap.acces, ap.etat, { fetchFn: srv.fetchFn, ...opts }); ap.etat.base = r.base; return r; };
  const pc = appareil({ 'p-pc': { id: 'p-pc', nom: 'Bourg', jeu: 'cf', hemisphere: 'nord', modifie_le: 'x', elements: { 'insectes:a': { obtenu: true, le: '2026-11-01' } } } });
  const tel = appareil({ 'p-tel': { id: 'p-tel', nom: 'Île', jeu: 'nh', elements: {} } });
  const code = nouveauCode();

  // Le téléphone ne peut pas se relier tant que rien n'est en ligne.
  tel.etat = { code, base: {} };
  await assert.rejects(sync(tel, { doitExister: true }), /Rien n'est encore enregistré/);

  pc.etat = { code, base: {} };
  await sync(pc);                                   // activer sur le PC
  await sync(tel, { doitExister: true });           // relier le téléphone : il reçoit le profil du PC, et envoie le sien
  assert.deepStrictEqual(Object.keys(tel.profils).sort(), ['p-pc', 'p-tel']);
  assert.strictEqual(tel.profils['p-pc'].elements['insectes:a'].obtenu, true);
  await sync(pc);
  assert.deepStrictEqual(Object.keys(pc.profils).sort(), ['p-pc', 'p-tel']);
  assert.strictEqual(pc.profils['p-pc'].modifie_le, 'x');   // ce qui n'est pas synchronisé n'est pas touché

  // Le PC coche un poisson ; le téléphone décoche l'insecte et coche un fossile, sans synchro entre les deux.
  pc.profils['p-pc'].elements['poissons:b'] = { obtenu: true };
  delete tel.profils['p-pc'].elements['insectes:a'];
  tel.profils['p-pc'].elements['fossiles:c'] = { obtenu: true, musee: true };
  await sync(pc); await sync(tel); await sync(pc);
  for (const ap of [pc, tel]) assert.deepStrictEqual(Object.keys(ap.profils['p-pc'].elements).sort(), ['fossiles:c', 'poissons:b']);

  // Le téléphone supprime son profil : il part à la corbeille du PC à la synchro suivante.
  delete tel.profils['p-tel'];
  await sync(tel); await sync(pc);
  assert.deepStrictEqual(Object.keys(pc.profils), ['p-pc']);
  assert.deepStrictEqual(pc.corbeille, ['p-tel']);

  // Rien de neuf : pas d'écriture sur le serveur.
  const avant = srv.ecritures();
  await sync(pc);
  assert.strictEqual(srv.ecritures(), avant);
});

test("conflit : un autre appareil écrit entre la lecture et l'envoi, la synchro recommence", async () => {
  const { synchroniser, nouveauCode } = await charger();
  const srv = serveur();
  const code = nouveauCode();
  const pc = appareil({ 'p-1': { id: 'p-1', nom: 'A', jeu: 'cf', elements: { x: { obtenu: true } } } });
  pc.etat = { code, base: {} };
  pc.etat.base = (await synchroniser(pc.acces, pc.etat, { fetchFn: srv.fetchFn })).base;
  // Un autre appareil (relié depuis le début) ajoute une coche juste avant l'envoi du PC (une seule fois).
  const tel = appareil(); tel.etat = { code, base: JSON.parse(JSON.stringify(pc.etat.base)) };
  let fois = 0;
  const fetchAvecIntrus = async (url, o) => {
    if (o.method === 'PUT' && fois++ === 0) {
      const lireTout = async () => ({ 'p-1': { id: 'p-1', nom: 'A', jeu: 'cf', elements: { x: { obtenu: true }, y: { obtenu: true } } } });
      tel.etat.base = (await synchroniser({ ...tel.acces, lireTout }, tel.etat, { fetchFn: srv.fetchFn })).base;
    }
    return srv.fetchFn(url, o);
  };
  pc.profils['p-1'].elements.z = { obtenu: true };
  const r = await synchroniser(pc.acces, pc.etat, { fetchFn: fetchAvecIntrus });
  assert.deepStrictEqual(Object.keys(r.base['p-1'].elements).sort(), ['x', 'y', 'z']);
  assert.deepStrictEqual(Object.keys(pc.profils['p-1'].elements).sort(), ['x', 'y', 'z']);
});
