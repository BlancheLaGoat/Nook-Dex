// Tests automatiques de la lecture des sauvegardes de New Horizons (src/renderer/lib/sauvegarde-nh.js).
// La sauvegarde est fabriquée ici, chiffrée comme le fait le jeu (aucun fichier du jeu dans le dépôt).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'sauvegarde-nh.js')).href);
const corr = require(path.join(RACINE, 'data', 'nh', 'sauvegarde.json'));

const ecrire32 = (o, i, v) => { o[i] = v & 0xFF; o[i + 1] = (v >>> 8) & 0xFF; o[i + 2] = (v >>> 16) & 0xFF; o[i + 3] = v >>> 24; };
const ecrire16 = (o, i, v) => { o[i] = v & 0xFF; o[i + 1] = v >> 8; };

// ---- Deuxième lecture de l'algorithme, en BigInt (pour vérifier la version en nombres 32 bits) ----
function xorshiftBig(graine) {
  const M = 0xFFFFFFFFn;
  const init = (x, k) => ((0x6C078965n * (x ^ (x >> 30n))) + k) & M;
  let a = init(BigInt(graine), 1n), b = init(a, 2n), c = init(b, 3n), d = init(c, 4n);
  return () => { let t = a; a = b; b = c; c = d; t ^= (t << 11n) & M; t ^= t >> 8n; d = (t ^ d ^ (d >> 19n)) & M; return Number(d); };
}
function murmurBig(octets) {
  const M = 0xFFFFFFFFn, mul = (x, y) => (x * y) & M, rotl = (x, r) => ((x << BigInt(r)) | (x >> BigInt(32 - r))) & M;
  let h = 0n;
  for (let i = 0; i < octets.length; i += 4) {
    let k = BigInt(octets[i] | (octets[i + 1] << 8) | (octets[i + 2] << 16)) + (BigInt(octets[i + 3]) << 24n);
    k = mul(rotl(mul(k, 0xCC9E2D51n), 15), 0x1B873593n);
    h = (mul(rotl(h ^ k, 13), 5n) + 0xE6546B64n) & M;
  }
  h ^= BigInt(octets.length);
  h ^= h >> 16n; h = mul(h, 0x85EBCA6Bn); h ^= h >> 13n; h = mul(h, 0xC2B2AE35n); h ^= h >> 16n;
  return Number(h);
}

// En-tête comme le jeu le fabrique : 0x100 octets de version, puis 128 mots tirés d'une graine.
function enTete(lib, graine, revision = 31) {
  const o = new Uint8Array(0x300);
  ecrire32(o, 0, 0xA0002); ecrire32(o, 4, 0xA0028); ecrire16(o, 8, 2); ecrire16(o, 0x0C, 2); ecrire16(o, 0x0E, revision);
  const suivant = lib.xorshift128(graine);
  for (let i = 0; i < 128; i++) ecrire32(o, 0x100 + i * 4, suivant());
  return o;
}
async function chiffrer(lib, entete, clair) {
  const mots = lib.motsEnTete(entete);
  const cle = await crypto.subtle.importKey('raw', lib.parametre(mots, 0), 'AES-CTR', false, ['encrypt']);
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CTR', counter: lib.parametre(mots, 2), length: 128 }, cle, clair));
}
function signer(lib, o, zones) { for (const [ofs, n] of zones) ecrire32(o, ofs, lib.murmur3(o, ofs + 4, n)); }

const parFiche = (cat, id) => corr.objets.find(([, c, i]) => c === cat && i === id)[0];

async function sauvegarde(lib, { revision = 31 } = {}) {
  const main = new Uint8Array(lib.TAILLES.main);
  const MUSEE = 0x110 + 0x491110 + 0x1004;
  for (let i = 0; i < 1024; i++) ecrire16(main, MUSEE + i * 8, 0xFFFE);
  ecrire16(main, MUSEE, parFiche('poissons', 'coelacanth'));
  ecrire16(main, MUSEE + 8, parFiche('fossiles', 'amber'));
  signer(lib, main, [[0x1E34B0, 0x3D089C]]);
  const personal = new Uint8Array(lib.TAILLES.personal);
  const nom = 'Blanche';
  for (let k = 0; k < nom.length; k++) ecrire16(personal, 0x110 + 0xC138 + 0x20 + k * 2, nom.charCodeAt(k));
  const bit = (debut, n) => { personal[debut + (n >> 3)] |= 1 << (n & 7); };
  bit(0x37BE0 + 0x11D58, parFiche('insectes', 'common-butterfly'));
  bit(0x37BE0 + 0x2D69C + 0x10, corr.recettes[0][0]);
  signer(lib, personal, [[0x110, 0x37ACC], [0x37BE0, 0x3CE5C]]);
  const hMain = enTete(lib, 0x12345678, revision), hPerso = enTete(lib, 0xCAFEBABE, revision);
  return {
    mainHeader: hMain, main: await chiffrer(lib, hMain, main),
    joueurs: [{ dossier: 'Villager0', header: hPerso, personal: await chiffrer(lib, hPerso, personal) }],
  };
}

test('XorShift128 et Murmur3 : deux lectures de l\'algorithme donnent les mêmes nombres', async () => {
  const lib = await charger();
  for (const graine of [0, 1, 0xDEADBEEF, 0xFFFFFFFF]) {
    const a = lib.xorshift128(graine), b = xorshiftBig(graine);
    for (let i = 0; i < 50; i++) assert.strictEqual(a(), b());
  }
  const o = new Uint8Array(4096).map((_, i) => (i * 37 + 11) & 0xFF);
  assert.strictEqual(lib.murmur3(o, 0, o.length), murmurBig(o));
  assert.strictEqual(lib.murmur3(new TextEncoder().encode('test'), 0, 4), 0xBA6BD213); // valeur de référence de Murmur3
});

test('déchiffre une sauvegarde 3.0 et lit musée, objets obtenus et recettes', async () => {
  const lib = await charger();
  const s = await lib.lireSauvegardeNH(await sauvegarde(lib));
  assert.strictEqual(s.version, '3.0.0');
  assert.strictEqual(s.joueurs[0].nom, 'Blanche');
  assert.deepStrictEqual(s.musee, [parFiche('poissons', 'coelacanth'), parFiche('fossiles', 'amber')]);
  const c = new Map(lib.cochesImportNH(s, corr, 1).map(x => [`${x.categorie}:${x.id}`, x]));
  assert.ok(c.get('poissons:coelacanth').musee);
  assert.ok(c.get('fossiles:amber').musee);
  assert.strictEqual(c.get('insectes:common-butterfly').obtenu, true);
  assert.strictEqual(c.get('insectes:common-butterfly').musee, undefined);
  assert.strictEqual(c.get(`recettes:${corr.recettes[0][1]}`).obtenu, true);
});

test('refuse les autres versions et les fichiers abîmés', async () => {
  const lib = await charger();
  const f = await sauvegarde(lib, { revision: 30 }); // 2.0.8
  await assert.rejects(lib.lireSauvegardeNH(f), /version 3\.0/);
  const g = await sauvegarde(lib);
  g.main[0x200000] ^= 0xFF; // un octet change dans la zone du musée
  await assert.rejects(lib.lireSauvegardeNH(g), /somme de contrôle/);
  await assert.rejects(lib.lireSauvegardeNH({}), /main\.dat/);
});

test('correspondance : chaque fiche du musée et chaque recette a son numéro, sans doublon', () => {
  const nums = corr.objets.map(o => o[0]);
  assert.strictEqual(new Set(nums).size, nums.length);
  for (const cat of corr.musee) {
    const fiches = require(path.join(RACINE, 'data', 'nh', `${cat}.json`));
    const relies = new Set(corr.objets.filter(o => o[1] === cat).map(o => o[2]));
    assert.strictEqual(relies.size, fiches.length, cat);
  }
  assert.strictEqual(corr.recettes.length, require(path.join(RACINE, 'data', 'nh', 'recettes.json')).length);
  assert.ok(corr.recettes.every(([n]) => n >= 0 && n < 0x800));
});
