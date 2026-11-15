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
