// Tests automatiques de la lecture des sauvegardes du GameCube (src/renderer/lib/sauvegarde-gc.js).
// La sauvegarde est fabriquée ici octet par octet (aucun fichier du jeu dans le dépôt).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'sauvegarde-gc.js')).href);
const corr = require(path.join(RACINE, 'data', 'gc', 'sauvegarde.json'));
const { champCatalogue } = require(path.join(RACINE, 'scripts', 'sauvegarde-gc.js'));

const ecrire = (o, i, txt) => { for (let k = 0; k < txt.length; k++) o[i + k] = txt.charCodeAt(k); };
const ecrire32 = (o, i, v) => { o[i] = v >>> 24; o[i + 1] = (v >>> 16) & 0xFF; o[i + 2] = (v >>> 8) & 0xFF; o[i + 3] = v & 0xFF; };

// Fabrique la ville (0x26000 octets), puis règle un mot pour que la somme des mots de 16 bits vaille 0.
function ville(remplir) {
  const s = new Uint8Array(0x26000);
  remplir(s);
  let somme = 0;
  for (let i = 0; i < s.length; i += 2) if (i !== 0x12) somme = (somme + ((s[i] << 8) | s[i + 1])) & 0xFFFF;
  const v = (0x10000 - somme) & 0xFFFF;
  s[0x12] = v >> 8; s[0x13] = v & 0xFF;
  return s;
}
function gci(villeOctets, { code = 'GAFP', copie = 0x26000 } = {}) {
  const o = new Uint8Array(0x40 + 0x72000);
  ecrire(o, 0, code + '01'); ecrire(o, 0x08, 'DobutsunomoriP_MURA');
  o.set(villeOctets, 0x40 + copie);
  return o;
}
const P1 = 0x20; // joueur 1
const villeTest = () => ville(s => {
  ecrire(s, P1, 'Blanche'); s[P1 + 0x1086] = 1;
  ecrire32(s, P1 + 0x1108, (1 << 0x1B)); // meuble d'index 0x1B (2e mot non utilisé)
  ecrire32(s, P1 + 0x1108 + 4, 1);       // index 32
  s[0x213A8 + 0x00] = 0x21;              // fossile 0 donné par le joueur 1, fossile 1 par le joueur 2
  s[0x213A8 + 0x15] = 0x03;              // poisson 0 donné par le joueur 3
  s[0x213A8 + 0x2A] = 0x40;              // insecte 1 donné par le joueur 4
});

test('lit une sauvegarde .gci : joueurs, catalogue et musée', async () => {
  const { lireSauvegardeGC } = await charger();
  const s = lireSauvegardeGC(gci(villeTest()));
  assert.strictEqual(s.code, 'GAFP');
  assert.strictEqual(s.region, 'européenne');
  assert.strictEqual(s.copie, 'principale');
  assert.strictEqual(s.joueurs[0].nom, 'Blanche');
  assert.strictEqual(s.joueurs[0].existe, true);
  assert.strictEqual(s.joueurs[1].existe, false);
  assert.deepStrictEqual([...s.joueurs[0].catalogue.meubles].sort((a, b) => a - b), [0x1B, 32]);
  assert.deepStrictEqual(s.musee.fossiles.slice(0, 3), [1, 2, 0]);
  assert.strictEqual(s.musee.poissons[0], 3);
  assert.deepStrictEqual(s.musee.insectes.slice(0, 2), [0, 4]);
  assert.strictEqual(s.musee.art.length, 15);
});

test('prend la copie de secours si la principale est abîmée, refuse si les deux le sont', async () => {
  const { lireSauvegardeGC } = await charger();
  const o = gci(villeTest(), { copie: 0x4C000 });
  o[0x40 + 0x26000 + 5] = 1; // copie principale non nulle -> somme fausse
  assert.strictEqual(lireSauvegardeGC(o).copie, 'secours');
  o[0x40 + 0x4C000 + 0x100] ^= 0xFF;
  assert.throws(() => lireSauvegardeGC(o), /abîmée/);
});

test('refuse les fichiers qui ne sont pas une sauvegarde, et la version japonaise', async () => {
  const { lireSauvegardeGC } = await charger();
  assert.throws(() => lireSauvegardeGC(new Uint8Array(1000)), /pas une sauvegarde/);
  assert.throws(() => lireSauvegardeGC(gci(villeTest(), { code: 'GAFJ' })), /japonaise/);
});

test('retrouve la sauvegarde dans une carte mémoire complète (.raw)', async () => {
  const { lireSauvegardeGC } = await charger();
  const BLOC = 0x2000, nb = 0x72000 / BLOC; // 57 blocs
  const carte = new Uint8Array(BLOC * (5 + nb + 3));
  const rep = BLOC, bat = 3 * BLOC;
  ecrire(carte, rep, 'GAFE'); ecrire(carte, rep + 0x08, 'DobutsunomoriP_MURA');
  for (let e = 1; e < 127; e++) carte[rep + e * 0x40] = 0xFF;
  carte[rep + 0x36] = 0; carte[rep + 0x37] = 5;   // premier bloc : 5
  carte[rep + 0x38] = 0; carte[rep + 0x39] = nb;
  for (let b = 2 * BLOC; b < 3 * BLOC; b++) carte[b] = 0xFF;   // copie du répertoire plus ancienne (compteur 0)
  carte[rep + 0x1FFA] = 0; carte[rep + 0x1FFB] = 1;
  carte[2 * BLOC + 0x1FFA] = 0; carte[2 * BLOC + 0x1FFB] = 0;
  carte[bat + 0x04] = 0; carte[bat + 0x05] = 1;
  for (let k = 0; k < nb; k++) { const suivant = k === nb - 1 ? 0xFFFF : 5 + k + 1; carte[bat + 0x0A + k * 2] = suivant >> 8; carte[bat + 0x0B + k * 2] = suivant & 0xFF; }
  const fichier = new Uint8Array(0x72000);
  fichier.set(villeTest(), 0x26000);
  carte.set(fichier, 5 * BLOC);
  const s = lireSauvegardeGC(carte);
  assert.strictEqual(s.format, 'carte');
  assert.strictEqual(s.code, 'GAFE');
  assert.strictEqual(s.joueurs[0].nom, 'Blanche');
});

test('cochesImport : musée pour toute la ville, catalogue du joueur choisi', async () => {
  const { lireSauvegardeGC, cochesImport } = await charger();
  const s = lireSauvegardeGC(gci(villeTest()));
  const c = cochesImport(s, corr, 1);
  const cle = x => `${x.categorie}:${x.id}`;
  const parCle = new Map(c.map(x => [cle(x), x]));
  assert.ok(parCle.get(`fossiles:${corr.musee.fossiles[0]}`).musee);
  assert.ok(parCle.get(`fossiles:${corr.musee.fossiles[1]}`).musee);
  assert.ok(parCle.get(`poissons:${corr.musee.poissons[0]}`).musee);
  assert.ok(parCle.get(`insectes:${corr.musee.insectes[1]}`).musee);
  assert.ok(!parCle.has(`insectes:${corr.musee.insectes[0]}`));
  const meubles = corr.catalogue.filter(e => e.champ === 'meubles' && (e.index === 0x1B || e.index === 32));
  for (const m of meubles) assert.strictEqual(parCle.get(`${m.categorie}:${m.id}`).obtenu, true);
  // Un autre joueur (sans catalogue) : seulement le musée.
  assert.ok(cochesImport(s, corr, 2).every(x => x.musee));
});

test('correspondance : 40 poissons, 40 insectes, 25 fossiles et 15 tableaux, tous reliés à une fiche', () => {
  assert.strictEqual(corr.musee.poissons.length, 40);
  assert.strictEqual(corr.musee.insectes.length, 40);
  assert.strictEqual(corr.musee.fossiles.length, 25);
  assert.strictEqual(corr.musee.art.length, 15);
  for (const [cat, ids] of Object.entries(corr.musee)) {
    const fiches = new Set(require(path.join(RACINE, 'data', 'gc', `${cat}.json`)).map(e => e.id));
    for (const id of ids) assert.ok(fiches.has(id), `${cat} : ${id}`);
    assert.strictEqual(new Set(ids).size, ids.length, `${cat} : doublon`);
  }
});

test('champCatalogue suit m_shop.c (mSP_CollectCheck)', () => {
  assert.deepStrictEqual(champCatalogue(0x116C), { champ: 'meubles', index: 0x5B });
  assert.deepStrictEqual(champCatalogue(0x30F8), { champ: 'meubles', index: 0x43E });
  assert.deepStrictEqual(champCatalogue(0x2703), { champ: 'papiers-peints', index: 3 });
  assert.deepStrictEqual(champCatalogue(0x2626), { champ: 'sols', index: 0x26 });
  assert.deepStrictEqual(champCatalogue(0x2A05), { champ: 'kk', index: 5 });
  assert.strictEqual(champCatalogue(0x2400), null);
});

test('navetsGC : prix d\'achat, 6 prix, motif et date de la semaine', async () => {
  const { navetsGC } = await charger();
  const p = 0x20480;
  const o = gci(ville(s => {
    [92, 96, 736, 71, 76, 82, 90].forEach((v, i) => { s[p + i * 2] = v >> 8; s[p + i * 2 + 1] = v & 0xFF; });
    s[p + 0x0F] = 0;                                   // motif 0 : pic
    s[p + 0x13] = 8; s[p + 0x15] = 7; s[p + 0x16] = 0x07; s[p + 0x17] = 0xE2; // 8/7/2018
  }));
  assert.deepStrictEqual(navetsGC(o), { semaine: { jour: 8, mois: 7, annee: 2018 }, achat: 92, cours: [96, 736, 71, 76, 82, 90], motif: 0 });
});
