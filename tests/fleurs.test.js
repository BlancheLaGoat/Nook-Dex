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

test('recherche inverse : la rose bleue, en étapes dans le bon ordre', async () => {
  const { rechercherChemins, etapesChemin } = await charger();
  const r = espece('roses');
  const [bleu] = rechercherChemins(r, 'bleu');
  assert.ok(bleu, 'un chemin vers la rose bleue');
  assert.equal(bleu.couleur, 'bleu');
  assert.ok(bleu.generation <= 4 && bleu.p > 0);
  assert.deepEqual([...bleu.dist.keys()], ['2220']); // la seule rose bleue
  const etapes = etapesChemin(bleu);
  assert.equal(etapes[etapes.length - 1].lot, bleu);
  // Chaque parent est une fleur de départ, ou a été obtenu à une étape d'avant.
  const obtenus = new Set();
  for (const e of etapes) {
    for (const p of e.parents) assert.ok(p.depart || obtenus.has(p.id), `parent ${p.couleur} pas encore obtenu`);
    obtenus.add(e.lot.id);
  }
  // Le coût est cohérent : 1 / chance du dernier croisement + le plus long chemin des parents.
  assert.ok(Math.abs(bleu.cout - (1 / bleu.p + Math.max(...bleu.parents.map(p => p.cout)))) < 1e-9);
});

test('recherche inverse : chaque couleur de chaque espèce a un chemin depuis les graines', async () => {
  const { rechercherChemins } = await charger();
  for (const e of donnees.especes) {
    for (const c of new Set(Object.values(e.couleurs))) {
      const [l] = rechercherChemins(e, c, { parCouleur: 6 });
      assert.ok(l, `${e.nom} ${c}`);
      if (e.graines[c]) assert.equal(l.generation, 0, `${e.nom} ${c} : déjà en graines`);
    }
  }
});

test('recherche inverse : partir aussi des fleurs des îles', async () => {
  const { rechercherChemins } = await charger();
  const t = espece('tulipes');
  // Tulipe noire : déjà sur les îles (génération 0) si on les autorise.
  assert.equal(rechercherChemins(t, 'noir', { iles: true })[0].generation, 0);
  assert.ok(rechercherChemins(t, 'noir')[0].generation >= 1);
});

test('champ : voisines, couples, cases libres, clones', async () => {
  const { champVide, voisins, bilanChamp, normaliserChamp } = await charger();
  const c = champVide(4, 3);
  assert.equal(c.cases.length, 12);
  assert.deepEqual(voisins(c, 0).sort((a, b) => a - b), [1, 4, 5]); // coin : 3 voisines
  assert.equal(voisins(c, 5).length, 8);                            // milieu : 8 voisines
  const r = espece('roses');
  // Deux roses rouges côte à côte (0 et 1), une tulipe en 5, une case bloquée en 4, une rose isolée en 11.
  c.cases[0] = { espece: 'roses', g: r.graines.rouge };
  c.cases[1] = { espece: 'roses', g: r.graines.rouge };
  c.cases[5] = { espece: 'tulipes', g: espece('tulipes').graines.rouge };
  c.cases[4] = { bloque: true };
  c.cases[11] = { espece: 'roses', g: r.graines.blanc };
  const b = bilanChamp(c, donnees.especes);
  assert.equal(b.couples.length, 1);
  assert.deepEqual([b.couples[0].a, b.couples[0].b], [0, 1]);
  assert.equal(b.couples[0].resultat.couleurs.find(x => x.couleur === 'noir').p, 0.25);
  const fleur = i => b.fleurs.find(f => f.i === i);
  assert.equal(fleur(0).libres, 0);       // voisines de 0 : 1 (rose), 4 (bloquée), 5 (tulipe)
  assert.equal(fleur(5).clone, true);     // la tulipe n'a pas de voisine de son espèce
  assert.equal(fleur(11).clone, true);
  // Normalisation : espèce inconnue ou gènes faux ignorés, cases bloquées gardées.
  const n = normaliserChamp({ largeur: 4, hauteur: 3, cases: [{ espece: 'roses', g: '9999' }, { espece: 'x', g: '000' }, { bloque: true }] }, donnees.especes);
  assert.deepEqual(n.cases.slice(0, 3), [null, null, { bloque: true }]);
  assert.equal(normaliserChamp(null, donnees.especes).cases.length, 48);
});
