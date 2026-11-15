// Tests automatiques des fleurs hybrides de New Horizons (src/renderer/lib/fleurs.js et data/nh/fleurs-genetique.json).
// Lancer avec : npm test   (après npm run donnees:fleurs)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'fleurs.js')).href);
const donnees = JSON.parse(fs.readFileSync(path.join(RACINE, 'data', 'nh', 'fleurs-genetique.json'), 'utf8'));
const espece = id => donnees.especes.find(e => e.id === id);
const pc = (res, couleur) => Math.round(((res.couleurs.find(c => c.couleur === couleur) || { p: 0 }).p) * 1000) / 10;

test('données : 8 espèces, 81 génotypes pour les roses et 27 pour les autres, graines et îles cohérentes', () => {
  assert.equal(donnees.especes.length, 8);
  for (const e of donnees.especes) {
    assert.equal(Object.keys(e.couleurs).length, 3 ** e.genes, e.nom);
    assert.deepEqual(Object.keys(e.graines).sort(), e.id === 'anemones' ? ['blanc', 'orange', 'rouge'] : ['blanc', 'jaune', 'rouge'], e.nom);
    for (const [c, g] of Object.entries({ ...e.graines, ...e.iles })) assert.equal(e.couleurs[g], c, `${e.nom} ${c}`);
    for (const c of new Set(Object.values(e.couleurs))) assert.ok(e.fiches[c], `${e.nom} ${c} : fiche du dex`);
  }
  assert.equal(espece('roses').genes, 4);
});

test('notation : chiffres -> lettres', async () => {
  const { enLettres, tousLesGenotypes } = await charger();
  assert.equal(enLettres('2001'), 'RR yy ww Ss');
  assert.equal(enLettres('120'), 'Rr YY ww');
  assert.equal(tousLesGenotypes(3).length, 27);
  assert.equal(tousLesGenotypes(4).length, 81);
});

test('croisement : les probabilités font 100 %, gène par gène', async () => {
  const { croiser, tousLesGenotypes } = await charger();
  for (const a of tousLesGenotypes(3)) {
    for (const b of tousLesGenotypes(3)) {
      const total = [...croiser(a, b).values()].reduce((s, p) => s + p, 0);
      assert.ok(Math.abs(total - 1) < 1e-12, `${a} × ${b}`);
    }
  }
  // Rr × Rr : 25 % RR, 50 % Rr, 25 % rr.
  assert.deepEqual(Object.fromEntries(croiser('1', '1')), { 0: 0.25, 1: 0.5, 2: 0.25 });
  // RR × rr : toujours Rr.
  assert.deepEqual(Object.fromEntries(croiser('2', '0')), { 1: 1 });
});

test('croisements connus des fleurs de graines', async () => {
  const { resultatCroisement } = await charger();
  const r = espece('roses'), t = espece('tulipes');
  // Rose rouge × rose rouge (graines) : 25 % de noires.
  assert.equal(pc(resultatCroisement(r, r.graines.rouge, r.graines.rouge), 'noir'), 25);
  // Rose blanche × rose blanche : 25 % de violettes.
  assert.equal(pc(resultatCroisement(r, r.graines.blanc, r.graines.blanc), 'violet'), 25);
  // Rose rouge × rose jaune : 50 % d'orange.
  assert.equal(pc(resultatCroisement(r, r.graines.rouge, r.graines.jaune), 'orange'), 50);
  // Tulipe rouge × tulipe rouge : 25 % de noires ; rouge × jaune : 50 % d'orange.
  assert.equal(pc(resultatCroisement(t, t.graines.rouge, t.graines.rouge), 'noir'), 25);
  assert.equal(pc(resultatCroisement(t, t.graines.rouge, t.graines.jaune), 'orange'), 50);
  // Les couleurs sont triées de la plus probable à la moins probable, et chaque couleur détaille ses génotypes.
  const res = resultatCroisement(r, r.graines.rouge, r.graines.rouge);
  assert.deepEqual(res.couleurs.map(c => c.couleur), ['rouge', 'noir', 'rose']);
  assert.ok(Math.abs(res.couleurs.reduce((s, c) => s + c.p, 0) - 1) < 1e-12);
});

test('glossaire : génotypes de chaque couleur, origine', async () => {
  const { genotypesDeCouleur, origine, couleursEspece } = await charger();
  const r = espece('roses');
  assert.equal(genotypesDeCouleur(r, 'rouge')[0], r.graines.rouge);
  assert.ok(genotypesDeCouleur(r, 'bleu').length >= 1);
  assert.equal(origine(r, r.graines.blanc), 'graines');
  assert.equal(origine(r, r.iles.rose), 'iles');
  assert.equal(origine(r, '2220'), null);
  const total = couleursEspece(r).reduce((s, c) => s + c.genotypes.length, 0);
  assert.equal(total, 81);
});
