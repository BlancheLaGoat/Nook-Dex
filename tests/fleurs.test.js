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

test('identifier : hypothèses, meilleur test, mise à jour', async () => {
  const { hypotheses, meilleursTests, miseAJour, croiser } = await charger();
  const r = espece('roses');
  // Rose rouge d'origine inconnue : tous les génotypes rouges, à égalité.
  const rouges = Object.keys(r.couleurs).filter(g => r.couleurs[g] === 'rouge');
  const h0 = hypotheses(r, 'rouge');
  assert.equal(h0.length, rouges.length);
  assert.ok(Math.abs(h0.reduce((s, x) => s + x.p, 0) - 1) < 1e-12);
  // Rose noire née de rouge × rouge (graines) : un seul génotype possible.
  assert.deepEqual(hypotheses(r, 'noir', { parents: [r.graines.rouge, r.graines.rouge] }), [{ g: '2000', p: 1 }]);
  // Rose orange née de blanc(0110) × orange(1100) : 3 génotypes, aux chances du croisement.
  const ho = hypotheses(r, 'orange', { parents: ['0110', '1100'] });
  const attendu = [...croiser('0110', '1100')].filter(([g]) => r.couleurs[g] === 'orange');
  assert.equal(ho.length, attendu.length);
  // Meilleurs tests : triés par gain, chaque table couvre toutes les hypothèses.
  const tests = meilleursTests(r, h0);
  assert.ok(tests.length >= 1);
  for (let i = 1; i < tests.length; i++) assert.ok(tests[i - 1].gain >= tests[i].gain);
  assert.equal(tests[0].table.length, h0.length);
  // Une seule hypothèse : rien à tester.
  assert.deepEqual(meilleursTests(r, [{ g: '2001', p: 1 }]), []);
  // Mise à jour : une couleur impossible pour une hypothèse l'écarte ; les chances refont 100 %.
  const t = tests[0];
  const c = t.decisives[0];
  const apres = miseAJour(r, h0, t.testeur.g, [c]);
  assert.ok(apres.length < h0.length);
  assert.ok(apres.every(x => t.table.find(row => row.g === x.g).couleurs.get(c) > 0));
  assert.ok(Math.abs(apres.reduce((s, x) => s + x.p, 0) - 1) < 1e-12);
});

test('anciens jeux : règles connues (jeu ou Nookipedia), aux couleurs existantes', () => {
  for (const jeu of ['ww', 'cf', 'nl']) {
    const d = JSON.parse(fs.readFileSync(path.join(RACINE, 'data', jeu, 'fleurs-regles.json'), 'utf8'));
    assert.ok(typeof d.source === 'string' && d.source, jeu);
    for (const r of d.regles) {
      const e = d.especes.find(x => x.nom === r.espece);
      assert.ok(e, `${jeu} : espèce ${r.espece}`);
      assert.ok(['texte', 'images', 'jeu'].includes(r.fiabilite), `${jeu} : fiabilité`);
      // Une règle tirée du jeu a une chance par enfant, et elles font 100.
      if (r.fiabilite === 'jeu') {
        assert.equal(r.chances.length, r.enfants.length, `${jeu} ${r.espece} ${r.parents}`);
        assert.equal(r.chances.reduce((s, x) => s + x, 0), 100, `${jeu} ${r.espece} ${r.parents}`);
      }
      const couleurs = new Set(e.couleurs.map(c => c.couleur));
      for (const x of [...r.enfants]) assert.ok(couleurs.has(x.replace(' « spécial »', '')), `${jeu} ${r.espece} : couleur ${x}`);
    }
  }
});

test('champ : prévisions des enfants sur les cases libres', async () => {
  const { champVide, previsionsChamp, resultatCroisement } = await charger();
  const r = espece('roses');
  // Une rose rouge (0) et une rose blanche (1) côte à côte, une tulipe isolée loin (11), sur un champ 4 × 3.
  const c = champVide(4, 3);
  c.cases[0] = { espece: 'roses', g: r.graines.rouge };
  c.cases[1] = { espece: 'roses', g: r.graines.blanc };
  c.cases[11] = { espece: 'tulipes', g: espece('tulipes').graines.jaune };
  const prev = previsionsChamp(c, donnees.especes);
  // Case 4 (sous la rouge, à côté de la blanche) : uniquement les enfants du couple rouge × blanche.
  const attendu = resultatCroisement(r, r.graines.rouge, r.graines.blanc).couleurs;
  const ici = prev.get(4);
  assert.equal(ici.length, 1);
  assert.equal(ici[0].espece, 'roses');
  for (const x of attendu) assert.ok(Math.abs(ici[0].couleurs.find(y => y.couleur === x.couleur).p - x.p) < 1e-9, x.couleur);
  assert.deepEqual(ici[0].couples, [[0, 1]]);
  // Case 10 (à côté de la tulipe seule) : un clone, donc 100 % jaune.
  assert.deepEqual(prev.get(10)[0].couleurs, [{ couleur: 'jaune', p: 1 }]);
  assert.deepEqual(prev.get(10)[0].clones, [11]);
  // Les cases occupées n'ont pas de prévision ; la somme des chances d'une case vaut 1.
  assert.equal(prev.has(0), false);
  for (const l of prev.values()) for (const x of l) assert.ok(Math.abs(x.couleurs.reduce((s, y) => s + y.p, 0) - 1) < 1e-9);
});

test('anciens jeux : champ selon les règles (chances du jeu pour Wild World, parts égales sinon)', async () => {
  const { champVide, previsionsChampRegles, enfantsSelonRegles, chancesSelonRegles, reglesAvecChances, couleursPlantables, normaliserChampRegles } = await charger();
  const ww = require(path.join(__dirname, '..', 'data', 'ww', 'fleurs-regles.json'));
  const cf = require(path.join(__dirname, '..', 'data', 'cf', 'fleurs-regles.json'));
  assert.equal(reglesAvecChances(ww.regles), true);
  // Une règle marche dans les deux sens.
  assert.deepEqual(enfantsSelonRegles(ww.regles, 'Roses', 'blanc', 'rouge'), enfantsSelonRegles(ww.regles, 'Roses', 'rouge', 'blanc'));
  // Table du jeu : rose rouge × rouge = 80 % rouge, 20 % noire ; violette × noire = 40 / 40 / 20 % bleue.
  assert.deepEqual(chancesSelonRegles(ww.regles, 'Roses', 'rouge', 'rouge'), [{ couleur: 'rouge', p: 0.8 }, { couleur: 'noir', p: 0.2 }]);
  assert.deepEqual(chancesSelonRegles(ww.regles, 'Roses', 'noir', 'violet').find(x => x.couleur === 'bleu'), { couleur: 'bleu', p: 0.2 });
  const c = champVide(4, 3);
  c.cases[0] = { espece: 'Roses', couleur: 'rouge' };
  c.cases[1] = { espece: 'Roses', couleur: 'blanc' };
  const ici = previsionsChampRegles(c, ww.regles).get(4)[0];
  for (const x of chancesSelonRegles(ww.regles, 'Roses', 'rouge', 'blanc')) assert.ok(Math.abs(ici.couleurs.find(y => y.couleur === x.couleur).p - x.p) < 1e-9, x.couleur);
  // City Folk : table du jeu aussi (main.dol), presque la même que Wild World, avec les œillets en plus.
  assert.equal(reglesAvecChances(cf.regles), true);
  assert.deepEqual(chancesSelonRegles(cf.regles, 'Roses', 'rouge', 'blanc'), chancesSelonRegles(ww.regles, 'Roses', 'rouge', 'blanc'));
  assert.deepEqual(chancesSelonRegles(cf.regles, 'Cosmos', 'noir', 'rouge'), [{ couleur: 'rouge', p: 0.8 }, { couleur: 'noir', p: 0.2 }]);
  assert.deepEqual(chancesSelonRegles(cf.regles, 'Œillets', 'rose', 'rouge'), [{ couleur: 'rouge', p: 0.4 }, { couleur: 'rose', p: 0.4 }, { couleur: 'blanc', p: 0.2 }]);
  assert.deepEqual(chancesSelonRegles(cf.regles, 'Roses', 'or', 'or'), [{ couleur: 'jaune', p: 1 }]);
  // Sans chances (règles de Nookipedia) : parts égales.
  const sansChances = ww.regles.map(r => ({ espece: r.espece, parents: r.parents, enfants: r.enfants }));
  const enf = enfantsSelonRegles(sansChances, 'Roses', 'rouge', 'blanc');
  const iciSans = previsionsChampRegles(c, sansChances).get(4)[0];
  for (const x of iciSans.couleurs) assert.ok(Math.abs(x.p - 1 / enf.length) < 1e-9);
  // Un couple sans règle connue n'invente rien : il est signalé.
  const d = champVide(3, 3);
  d.cases[0] = { espece: 'Roses', couleur: 'or' };
  d.cases[1] = { espece: 'Roses', couleur: 'bleu' };
  assert.equal(enfantsSelonRegles(ww.regles, 'Roses', 'or', 'bleu'), null);
  const p2 = previsionsChampRegles(d, ww.regles).get(3)[0];
  assert.deepEqual(p2.couleurs, []);
  assert.deepEqual(p2.inconnus, [[0, 1]]);
  // Couleurs plantables : pas l'arrosoir ; champ normalisé (espèce ou couleur inconnues écartées).
  const roses = ww.especes.find(e => e.nom === 'Roses');
  assert.ok(!couleursPlantables(roses, ww.regles).some(x => /arrosoir/.test(x)));
  const n = normaliserChampRegles({ largeur: 3, hauteur: 3, cases: [{ espece: 'Roses', couleur: 'rouge' }, { espece: 'Roses', couleur: 'arc-en-ciel' }, { espece: 'X', couleur: 'rouge' }] }, ww.especes, ww.regles);
  assert.deepEqual(n.cases.slice(0, 3), [{ espece: 'Roses', couleur: 'rouge' }, null, null]);
});

test('New Leaf : violettes et œillets (tables du code du jeu), fleurs de départ et violette bleue', async () => {
  const { rechercherChemins, couleursEspece } = await charger();
  const nl = JSON.parse(fs.readFileSync(path.join(RACINE, 'data', 'nl', 'fleurs-genetique.json'), 'utf8'));
  const vio = nl.especes.find(e => e.id === 'violettes'), oei = nl.especes.find(e => e.id === 'oeillets');
  assert.equal(Object.keys(vio.couleurs).length, 27);
  assert.equal(Object.keys(oei.couleurs).length, 9);
  assert.deepEqual(couleursEspece(vio).map(c => c.couleur).sort(), ['blanc', 'bleu', 'jaune', 'violet']);
  assert.deepEqual(couleursEspece(oei).map(c => c.couleur).sort(), ['blanc', 'rose', 'rouge']);
  for (const e of [vio, oei]) for (const [c, g] of Object.entries(e.graines)) assert.equal(e.couleurs[g], c, `${e.id} ${c}`);
  // Codes lus dans de vraies sauvegardes : violettes 001 blanche, 020 violette, 100 jaune ; œillets du courrier 11 rose, 21 rouge.
  assert.equal(oei.depart, 'courrier');
  const bleue = rechercherChemins(vio, 'bleu');
  assert.ok(bleue.length && bleue[0].generation === 1);
});
