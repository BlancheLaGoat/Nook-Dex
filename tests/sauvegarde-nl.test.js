// Tests automatiques de la lecture des sauvegardes de New Leaf - Welcome amiibo (src/renderer/lib/sauvegarde-nl.js).
// La sauvegarde est fabriquée ici octet par octet (aucun fichier du jeu dans le dépôt).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'sauvegarde-nl.js')).href);
const corr = require(path.join(RACINE, 'data', 'nl', 'sauvegarde.json'));
const { nomDex } = require(path.join(RACINE, 'scripts', 'sauvegarde-nl.js'));

const P1 = 0xA0, P2 = 0xA0 + 0xA480;
const utf16 = (o, i, t) => { for (let k = 0; k < t.length; k++) { o[i + k * 2] = t.charCodeAt(k) & 0xFF; o[i + k * 2 + 1] = t.charCodeAt(k) >> 8; } };
const debloquer = (o, p, n) => { const b = n - 0x2000; o[p + 0x6C20 + (b >> 3)] |= 1 << (b & 7); };

function ville() {
  const o = new Uint8Array(0x89B00);
  o[P1 + 0x55A6] = 0x34; o[P1 + 0x55A7] = 0x12; utf16(o, P1 + 0x55A8, 'Blanche');
  o[P2 + 0x55A6] = 0x01; utf16(o, P2 + 0x55A8, 'Lou');
  debloquer(o, P1, 0x228E);   // papillon commun attrapé
  debloquer(o, P1, 0x22E1);   // bouvière attrapée
  debloquer(o, P1, 0x314F);   // fossile : torse de smilodon
  o[0x6B300 + 0] = 1;          // 1er fossile (ambre) donné par le joueur 1
  o[0x6B300 + 0x43] = 2;       // 1er poisson donné par le joueur 2
  o[0x6B300 + 0x10A] = 1;      // 1re statue
  return o;
}

test('lit garden_plus.dat : joueurs, objets débloqués et musée', async () => {
  const { lireSauvegardeNL } = await charger();
  const s = lireSauvegardeNL(ville());
  assert.deepStrictEqual(s.joueurs.map(j => [j.nom, j.existe]), [['Blanche', true], ['Lou', true], ['', false], ['', false]]);
  assert.deepStrictEqual([...s.joueurs[0].debloques].sort((a, b) => a - b), [0x28E, 0x2E1, 0x114F]);
  assert.strictEqual(s.musee.length, 274);
});

test('refuse garden.dat (avant Welcome amiibo) et les autres fichiers', async () => {
  const { lireSauvegardeNL } = await charger();
  assert.throws(() => lireSauvegardeNL(new Uint8Array(0x7FA00)), /garden\.dat/);
  assert.throws(() => lireSauvegardeNL(new Uint8Array(1000)), /pas une sauvegarde/);
  assert.throws(() => lireSauvegardeNL(new Uint8Array(0x89B00)), /aucun joueur/);
});

test('cochesImportNL : musée dans le bon ordre, objets du joueur choisi', async () => {
  const { lireSauvegardeNL, cochesImportNL } = await charger();
  const s = lireSauvegardeNL(ville());
  const c = new Map(cochesImportNL(s, corr, 1).map(x => [`${x.categorie}:${x.id}`, x]));
  assert.ok(c.get('fossiles:amber').musee);
  assert.ok(c.get('poissons:bitterling').musee);
  assert.ok(c.get(`art:${corr.musee[5].ids[0]}`).musee);
  assert.strictEqual(c.get('insectes:common-butterfly').obtenu, true);
  assert.strictEqual(c.get('insectes:common-butterfly').musee, undefined);
  assert.strictEqual(c.get('fossiles:sabertooth-torso').obtenu, true);
  assert.ok(cochesImportNL(s, corr, 2).every(x => x.musee));
});

test('correspondance : 274 cases de musée, toutes reliées, sans doublon', () => {
  const cases = corr.musee.flatMap(m => m.ids.map(id => `${m.categorie}:${id}`));
  assert.strictEqual(cases.length, 274);
  assert.ok(cases.every(c => !c.endsWith(':null')));
  assert.strictEqual(new Set(cases).size, 274);
  assert.deepStrictEqual(corr.musee.map(m => [m.categorie, m.ids.length]),
    [['fossiles', 67], ['poissons', 72], ['creatures-marines', 30], ['insectes', 72], ['art', 25], ['art', 8]]);
  for (const c of corr.debloques) assert.ok(c.bit >= 0 && c.bit < 0x2E8 * 8);
});

test('nomDex : noms du jeu écrits comme dans le dex', () => {
  assert.strictEqual(nomDex('pic of Admiral'), "Admiral's pic");
  assert.strictEqual(nomDex('pachysaurus skull'), 'pachy skull');
  assert.strictEqual(nomDex('common butterfly'), 'common butterfly');
});

// Objet de la carte : acre (0 à 19, 5 par ligne), case (x, y) dans l'acre, identifiant, octet des gènes, drapeaux.
const poser = (o, acre, x, y, id, genes = 0, drapeaux = 0) => {
  const p = 0x534D8 + (acre * 256 + y * 16 + x) * 4;
  o[p] = id & 0xFF; o[p + 1] = id >> 8; o[p + 2] = genes; o[p + 3] = drapeaux;
};
function villeFleurie() {
  const o = ville();
  for (let i = 0; i < 5120; i++) poser(o, i >> 8, i & 15, (i >> 4) & 15, 0x7FFE); // carte vide
  poser(o, 0, 0, 0, 0xB2, 0xC1);           // A1 : rose rouge des graines (2001)
  poser(o, 0, 1, 0, 0xB2, 0x54, 0x40);     // A1 : rose rouge « spéciale » 1110, arrosée
  poser(o, 6, 3, 2, 0xA7 + 0x2F, 0x0C);    // B2 : pensée jaune fanée (020)
  poser(o, 6, 4, 2, 0x0001);               // B2 : autre objet
  poser(o, 6, 5, 2, 0x0001, 0, 0x80);      // B2 : objet enterré (surface libre)
  poser(o, 19, 15, 15, 0xC4, 0x0C);        // E4 : violette violette
  return o;
}

test('genesDepuisOctet : 2 bits par gène, 00 = 0, 01 = 1, 11 = 2', async () => {
  const { genesDepuisOctet } = await charger();
  assert.strictEqual(genesDepuisOctet(0xC1, 4), '2001');
  assert.strictEqual(genesDepuisOctet(0x54, 4), '1110');
  assert.strictEqual(genesDepuisOctet(0x0D, 3), '021');
  assert.strictEqual(genesDepuisOctet(0x08, 3), null); // « 10 » n'est pas un gène
});

test('fleursVilleNL : fleurs placées sur la carte, avec leurs gènes', async () => {
  const { fleursVilleNL } = await charger();
  const v = fleursVilleNL(villeFleurie());
  assert.deepStrictEqual([v.largeur, v.hauteur], [80, 64]);
  const a = (x, y) => v.cases[y * 80 + x];
  assert.deepStrictEqual(a(0, 0), { espece: 'roses', couleur: 'rouge', fanee: false, arrosee: false, octet: 0xC1, g: '2001' });
  assert.strictEqual(a(1, 0).g, '1110');
  assert.strictEqual(a(1, 0).arrosee, true);
  assert.deepStrictEqual([a(16 + 3, 16 + 2).espece, a(16 + 3, 16 + 2).couleur, a(16 + 3, 16 + 2).fanee, a(16 + 3, 16 + 2).g], ['pensees', 'jaune', true, '020']);
  assert.deepStrictEqual(a(16 + 4, 16 + 2), { objet: 1 });
  assert.strictEqual(a(16 + 5, 16 + 2), null);
  assert.deepStrictEqual([a(79, 63).espece, a(79, 63).couleur], ['violettes', 'violet']);
  assert.strictEqual(v.cases.filter(c => c && c.espece).length, 4);
  assert.throws(() => fleursVilleNL(new Uint8Array(1000)), /garden_plus/);
});
