// Tests du tableur des codes d'objets GameCube (data/gc/codes.json).
// Lancer avec : npm test   (après npm run donnees:codes)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));
const { lireCode } = require('../scripts/codes-gc.js');

test('lecture d\'un code : 28 caractères, espaces et retours à la ligne enlevés', () => {
  assert.equal(lireCode('a w m g E E E E E E E E E E e e e e e e e e e e e e e e'), 'awmgEEEEEEEEEEeeeeeeeeeeeeee');
  assert.equal(lireCode('w B y u n X Q W X & X @ K K\nX 9 l j T W 4 T C F b G W y'), 'wByunXQWX&X@KKX9ljTW4TCFbGWy');
  assert.equal(lireCode('NO DATA'), null);
  assert.equal(lireCode('a b c'), null);
});

test('codes.json : chaque objet a sa fiche, chaque code fait 28 caractères', () => {
  const c = lire('data/gc/codes.json');
  assert.ok(c.objets.length > 1200);
  const dex = {};
  for (const o of c.objets) {
    assert.ok(o.fiche, `${o.nom_en} : pas de fiche`);
    dex[o.fiche.categorie] = dex[o.fiche.categorie] || new Set(lire(`data/gc/${o.fiche.categorie}.json`).map(e => e.id));
    assert.ok(dex[o.fiche.categorie].has(o.fiche.id), `${o.nom_en} -> ${o.fiche.id} introuvable`);
    if (o.code) assert.equal([...o.code].length, 28, o.nom_en);
    else assert.ok(o.sans_code, o.nom_en);
  }
  // Les 8 catégories du tableur, avec leur catégorie du dex.
  assert.deepEqual(Object.keys(c.categories), ['Furniture', 'Wallpaper', 'Carpet', 'Clothing', 'Items', 'Stationery', 'Gyroids', 'Music']);
  assert.equal(c.categories.Furniture.objets, 601);
  // Crédits gardés pour l'appli.
  assert.ok(c.credits_courts.some(t => t.includes('Cuyler')) && c.credits_courts.some(t => t.includes('BrianMp16')));
});

test('codes.json : exemples tirés du tableur', () => {
  const c = lire('data/gc/codes.json');
  const lit = c.objets.find(o => o.nom_en === 'Blue Bed');
  assert.equal(lit.code, 'awmgEEEEEEEEEEeeeeeeeeeeeeee');
  assert.equal(lit.provenance, 'Rounard'); // « Redd's » traduit par scripts/sources-fr.js
  assert.equal(lit.fiche.id, 'blue-bed');
  assert.equal(c.objets.find(o => o.nom_en === 'Señor K.K.').fiche.id, 'kk-mariachi');
  assert.ok(c.objets.find(o => o.nom_en === 'Net').defaut);
  assert.match(c.objets.find(o => o.nom_en === 'Golden Axe').sans_code, /BANNED/);
});

test("saisie rapide : une valeur identique n'est pas affichée deux fois (« Y2 » et non « Y2 / Y2 »)", () => {
  const c = lire("data/gc/codes.json");
  for (const o of c.objets) if (o.premiere_ligne) assert.equal(new Set(o.premiere_ligne).size, o.premiere_ligne.length, o.nom_en);
  assert.deepEqual(c.objets.find(o => o.nom_en === "Blue Bench").premiere_ligne, ["Y1"]);
});
