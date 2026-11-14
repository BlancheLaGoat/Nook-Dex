// Tests de la traduction des façons d'obtenir les objets (scripts/sources-fr.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { creerTraducteur, couper, recoller, TERMES } = require('../scripts/sources-fr.js');

test('découpage : virgules des milliers et parenthèses respectées', () => {
  assert.deepEqual(couper('Save 10,000,000 Bells'), ['Save 10,000,000 Bells']);
  assert.deepEqual(couper('tree (good luck), any villager'), ['tree (good luck)', ',', ' any villager']);
  assert.deepEqual(recoller(['dump, Gracie (fail', 'common)']), ['dump, Gracie (fail, common)']);
});

test('traduction : termes, noms propres, précisions entre parenthèses', () => {
  const { texte } = creerTraducteur({ ...TERMES, Gracie: 'Carla', Wisp: 'Follet', Booker: 'Chausset' });
  assert.equal(texte("Tom Nook's store"), 'Magasin de Tom Nook');
  assert.equal(texte('dump, Booker (Common), Birthday, Mom, Wisp, Sale Day, Gracie (fail, common)'),
    "Décharge, Chausset (courant), Anniversaire, Maman, Follet, Jour des soldes, Carla (en cas d'échec, courant)");
  assert.equal(texte('Save 10,000,000 Bells'), 'Économiser 10 000 000 clochettes');
  assert.equal(texte('100,000 HRA Points'), '100 000 points HRA');
  assert.equal(texte("Nook's (House 2)"), 'Magasin de Tom Nook (maison 2)');
  assert.equal(texte('fortune #12'), 'Biscuit chinois n° 12');
  assert.equal(texte('Happy Room Academy (HRA)'), 'Happy Room Academy (HRA)');
  // Déjà en français : inchangé (on peut relancer la traduction sans risque).
  assert.equal(texte("Décharge, Chausset (courant), Carla (en cas d'échec, courant)"), "Décharge, Chausset (courant), Carla (en cas d'échec, courant)");
});

test('données : plus de termes anglais courants dans les façons d\'obtenir', () => {
  const RACINE = path.join(__dirname, '..');
  const jeux = JSON.parse(fs.readFileSync(path.join(RACINE, 'data', 'jeux.json'), 'utf8')).filter(j => j.disponible);
  const anglais = /\b(Tom Nook's store|Able Sisters|Crazy Redd's|any villager|dig spot|Lost and found|Birthday|balloons?)\b/;
  for (const j of jeux) for (const c of j.categories) {
    const f = path.join(RACINE, 'data', j.id, `${c.id}.json`);
    if (!fs.existsSync(f)) continue;
    for (const e of JSON.parse(fs.readFileSync(f, 'utf8'))) for (const s of e.sources || []) assert.ok(!anglais.test(s), `${j.id}/${c.id}/${e.id} : « ${s} »`);
  }
});

test('une seule traduction : les noms anglais qui sont aussi des noms français ne sont pas retraduits', () => {
  const RACINE = path.join(__dirname, '..');
  const lire = x => JSON.parse(fs.readFileSync(path.join(RACINE, x), 'utf8'));
  // « Caroline » se traduit « Isabelle » ; « Isabelle » (Marie en français) ne doit pas être retraduit derrière.
  assert.deepEqual(lire('data/nl/photos.json').find(e => e.id === 'carolines-pic').sources, ['Amitié', 'Isabelle']);
  for (const j of ['nh', 'nl', 'cf', 'ww', 'gc']) assert.equal(lire(`data/${j}/_infos.json`).sources_traduites, true, j);
  assert.equal(lire('data/gc/codes.json').provenances_traduites, true);
});
