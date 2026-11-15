// Tests automatiques de la rareté (taux d'apparition).
// Lancer avec : npm test   (après npm run donnees:rarete)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = f => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', f)).href);
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));
const { lirePeriode, lireCreneau } = require('../scripts/rarete.js');

// Petite catégorie inventée : 2 eaux, août coupé en deux, un ajout s'il pleut.
const cr = {
  creneaux: [{ id: '9h-16h', heures: [[9, 16]] }, { id: '16h-9h', heures: [[16, 9]] }],
  tables: [
    { mois: 7, jours: null, creneau: '9h-16h', eau: 'riviere', eau_texte: 'Rivière', especes: { a: 10 }, rien: 0 },
    { mois: 7, jours: null, creneau: '9h-16h', eau: 'bassin', eau_texte: 'Bassin', especes: { a: 30, b: 70 } },
    { mois: 8, jours: [1, 15], creneau: '9h-16h', eau: 'mer', eau_texte: 'Mer', especes: { b: 5 } },
    { mois: 8, jours: [16, 31], creneau: '9h-16h', eau: 'mer', eau_texte: 'Mer', especes: { b: 50 } },
    { mois: 8, jours: [1, 15], creneau: '16h-9h', eau: 'mer', eau_texte: 'Mer', especes: { b: 2 }, pluie: { c: 8 } },
    { mois: 8, jours: [16, 31], creneau: '16h-9h', eau: 'mer', eau_texte: 'Mer', especes: { b: 2 }, pluie: { c: 8 } },
  ],
};

test('lecture des périodes et créneaux des fichiers de rareté', () => {
  assert.deepEqual(lirePeriode({ mois: 'aout', quinzaine: '16-fin' }), { mois: 8, jours: [16, 31] });
  assert.deepEqual(lirePeriode({ periode: 'septembre 16-30' }), { mois: 9, jours: [16, 30] });
  assert.deepEqual(lirePeriode({ periode: 'janvier' }), { mois: 1, jours: null });
  assert.deepEqual(lirePeriode({ mois: 'fevrier', quinzaine: '1-15' }), { mois: 2, jours: [1, 15] });
  assert.deepEqual(lireCreneau('21h-4h'), [[21, 4]]);
  assert.deepEqual(lireCreneau('4h-9h et 16h-21h'), [[4, 9], [16, 21]]);
});

test('taux à un moment donné : meilleure eau, détail, pluie', async () => {
  const { tauxA } = await charger('rarete.js');
  const t = tauxA(cr, 'a', 7, 10, 12);
  assert.equal(t.pourcent, 30);                      // bassin (30) plutôt que rivière (10)
  assert.equal(t.details.length, 2);
  assert.equal(t.rien, null);                        // deux tirages : pas de « rien » unique
  assert.equal(tauxA(cr, 'a', 7, 10, 20).pourcent, 0); // mauvais créneau
  assert.equal(tauxA(cr, 'b', 8, 10, 12).pourcent, 5);  // 1-15 août
  assert.equal(tauxA(cr, 'b', 8, 20, 12).pourcent, 50); // 16-31 août
  const c = tauxA(cr, 'c', 8, 20, 22);
  assert.equal(c.pourcent, 0);
  assert.equal(c.pluie, 8);
});

test('transition GC : du 26 au 6 entre deux mois, du 11 au 21 à la quinzaine', async () => {
  const { tauxMaintenant } = await charger('rarete.js');
  const tr = { ...cr, transition: { position: 'fin', decalage_max: 5, mois: { du: 26, au: 6 }, quinzaine: { du: 11, au: 21 } } };
  // 26 juillet : la table d'août est déjà possible
  const f = tauxMaintenant(tr, 'b', new Date(2026, 6, 26, 12));
  assert.equal(f.pourcent, 70);
  assert.deepEqual([f.transition.type, f.transition.sens, f.transition.mois, f.transition.pourcent], ['mois', 'suivant', 8, 5]);
  assert.deepEqual([f.transition.du, f.transition.au], [{ mois: 7, jour: 26 }, { mois: 8, jour: 6 }]);
  assert.equal(tauxMaintenant(tr, 'b', new Date(2026, 6, 25, 12)).transition, undefined);
  // 6 août : la table de juillet peut encore servir ; le 7, plus de transition
  const d = tauxMaintenant(tr, 'b', new Date(2026, 7, 6, 12));
  assert.equal(d.pourcent, 5);
  assert.deepEqual([d.transition.sens, d.transition.mois, d.transition.pourcent], ['precedent', 7, 70]);
  assert.equal(tauxMaintenant(tr, 'b', new Date(2026, 7, 7, 12)).transition, undefined);
  // Quinzaine d'août : 11 → 21, seulement si les deux tables diffèrent pour l'espèce
  const q1 = tauxMaintenant(tr, 'b', new Date(2026, 7, 11, 12));
  assert.deepEqual([q1.pourcent, q1.transition.type, q1.transition.quinzaine, q1.transition.pourcent], [5, 'quinzaine', 2, 50]);
  const q2 = tauxMaintenant(tr, 'b', new Date(2026, 7, 21, 12));
  assert.deepEqual([q2.pourcent, q2.transition.quinzaine, q2.transition.pourcent], [50, 1, 5]);
  assert.equal(tauxMaintenant(tr, 'b', new Date(2026, 7, 22, 12)).transition, undefined);
  assert.equal(tauxMaintenant(tr, 'b', new Date(2026, 7, 15, 22)).transition, undefined); // 2 % dans les deux quinzaines
  // Sans quinzaine (insectes GC) : rien au milieu du mois
  const sansQ = { ...cr, transition: { decalage_max: 5, mois: { du: 26, au: 6 } } };
  assert.equal(tauxMaintenant(sansQ, 'b', new Date(2026, 7, 15, 12)).transition, undefined);
  // Sans transition (WW) : la table change pile le 1er
  assert.equal(tauxMaintenant(cr, 'b', new Date(2026, 6, 31, 12)).transition, undefined);
});

test('cœlacanthe (seulement s\'il pleut) : taux du mois, étoiles sur la moyenne', async () => {
  const { pluieDuMois, maxAnnee } = await charger('rarete.js');
  const crPluie = { ...cr, pluie_seulement: { c: { sauf_creneaux: ['9h-16h'] } } };
  assert.deepEqual(pluieDuMois(crPluie, 'c', 8, 3), { pourcent: 8, sauf_creneaux: ['9h-16h'] });
  assert.deepEqual(pluieDuMois(crPluie, 'c', 7, 3), { pourcent: 0, sauf_creneaux: ['9h-16h'] });
  assert.equal(pluieDuMois(crPluie, 'b', 8, 3), null);
  const gc = lire('data/gc/rarete.json').categories.poissons;
  const m = maxAnnee(gc, 'coelacanth');
  assert.equal(m.pluie, true);
  assert.equal(m.max, 8);
  assert.ok(m.moyenne > 4 && m.moyenne < 7, `moyenne ${m.moyenne}`);
  assert.equal(m.note, m.moyenne);
  assert.equal(pluieDuMois(gc, 'coelacanth', 1, 10).pourcent, 8);
  assert.equal(pluieDuMois(gc, 'coelacanth', 8, 20).pourcent, 2.17);
});

test('info-bulle du rang de la ville : poissons et insectes GC, sauf bonbons/déchets', async () => {
  const { texteRangVille } = await charger('rarete.js');
  const gc = lire('data/gc/rarete.json').categories;
  assert.match(texteRangVille(gc.poissons, 'sea-bass'), /rang 3 ou plus.*0,5 au rang 0, 0,75 au rang 1, 0,875 au rang 2/);
  assert.match(texteRangVille(gc.insectes, 'common-butterfly'), /rang 3/);
  assert.equal(texteRangVille(gc.insectes, 'cockroach'), null);
  assert.equal(texteRangVille(gc.insectes, 'ant'), null);
  assert.equal(texteRangVille(lire('data/ww/rarete.json').categories.poissons, 'shark'), null);
});

test('mois des fiches recalculés d\'après les tables (quinzaines comprises)', () => {
  const { periodesSelonTables } = require('../scripts/rarete.js');
  const tables = [
    { mois: 8, jours: null, especes: { x: 1 } },
    { mois: 9, jours: [1, 15], especes: { x: 1 } },
    { mois: 9, jours: [16, 30], especes: { y: 1 } },
    { mois: 10, jours: null, especes: { y: 1 } },
  ];
  assert.deepEqual(periodesSelonTables([{ mois: [8, 9], heures: [[16, 9]] }], tables, 'x'),
    [{ mois: [8], heures: [[16, 9]] }, { mois: [9], heures: [[16, 9]], jours: [1, 15] }]);
  // Mois ajouté : il prend les horaires du mois le plus proche
  assert.deepEqual(periodesSelonTables([{ mois: [10], heures: [[4, 21]] }], tables, 'y'),
    [{ mois: [10], heures: [[4, 21]] }, { mois: [9], heures: [[4, 21]], jours: [16, 31] }]);
});

test('WW : les fiches suivent les tables (requins et lune de mer en septembre)', () => {
  const dex = lire('data/ww/poissons.json');
  const mois = id => new Set(dex.find(e => e.id === id).dispo.tous.flatMap(p => p.mois));
  for (const id of ['ocean-sunfish', 'hammerhead-shark', 'shark']) assert.ok(mois(id).has(9), `${id} en septembre`);
  const ww = lire('data/ww/rarete.json').categories.poissons;
  assert.equal(ww.transition, undefined);
});

test('GC : les mois des fiches absents des tables sont marqués « en transition »', async () => {
  const { grilleEspece } = await charger('rarete.js');
  const gc = lire('data/gc/rarete.json').categories.poissons;
  const avril = grilleEspece(gc, 'catfish').lignes.find(l => l.mois === 4); // Silure : tables à partir de mai
  assert.deepEqual(avril.transition, ['fin']);
  assert.equal(grilleEspece(gc, 'catfish').lignes.find(l => l.mois === 2).transition, undefined);
});

test('étoiles selon les seuils', async () => {
  const { etoilesPour, maxAnnee } = await charger('rarete.js');
  const seuils = lire('data/rarete/etoiles.json').seuils;
  assert.equal(etoilesPour(40, seuils).etoiles, 1);
  assert.equal(etoilesPour(15, seuils).etoiles, 1);
  assert.equal(etoilesPour(10, seuils).etoiles, 2);
  assert.equal(etoilesPour(5, seuils).etoiles, 3);
  assert.equal(etoilesPour(3, seuils).etoiles, 4);
  assert.equal(etoilesPour(1, seuils).etoiles, 5);
  assert.equal(etoilesPour(null, seuils), null);
  assert.deepEqual(maxAnnee(cr, 'b'), { max: 70, pluie: false, moyenne: 42.38, note: 70 });
  assert.deepEqual(maxAnnee(cr, 'c'), { max: 8, pluie: true, moyenne: 8, note: 8 });
  assert.equal(maxAnnee(cr, 'inconnue'), null);
});

test('tableau mois × créneau : août coupé en deux seulement si les moitiés diffèrent', async () => {
  const { grilleEspece } = await charger('rarete.js');
  const gb = grilleEspece(cr, 'b');
  assert.equal(gb.lignes.filter(l => l.mois === 8).length, 2);
  assert.equal(gb.lignes.length, 13);
  const gc = grilleEspece(cr, 'c');
  assert.equal(gc.lignes.filter(l => l.mois === 8).length, 1); // mêmes valeurs les deux moitiés
  const aout = gc.lignes.find(l => l.mois === 8);
  assert.equal(aout.cases[0], null);
  assert.equal(aout.cases[1].pluie, true);
});

test('tri par rareté : les plus rares d\'abord, les inconnus à la fin', async () => {
  const { trier } = await charger('filtres.js');
  const el = ['x', 'y', 'z', 'w'].map(id => ({ id, nom: { fr: id, en: id } }));
  const max = { x: 20, y: 1, z: null, w: 5 };
  const actuel = { x: 3, y: 0, z: null, w: 10 };
  const rarete = { max: id => max[id], maintenant: id => actuel[id] };
  assert.deepEqual(trier(el, 'rarete', { rarete }).map(e => e.id), ['y', 'w', 'x', 'z']);
  assert.deepEqual(trier(el, 'rarete-maintenant', { rarete }).map(e => e.id), ['x', 'w', 'y', 'z']);
  assert.deepEqual(trier(el, 'rarete').map(e => e.id), ['w', 'x', 'y', 'z']); // sans données : tri par nom
});

// ---------- Vraies données (data/gc/rarete.json, data/ww/rarete.json) ----------
test('exemples réels comparés aux CSV', async () => {
  const { rareteCategorie, tauxMaintenant } = await charger('rarete.js');
  const gc = lire('data/gc/rarete.json');
  const ww = lire('data/ww/rarete.json');
  // GC Carassin, mars, 9h-16h : 22 %
  assert.equal(tauxMaintenant(rareteCategorie(gc, 'poissons'), 'crucian-carp', new Date(2026, 2, 10, 12)).pourcent, 22);
  // WW Requin, juillet, 21h-4h : 1 %
  assert.equal(tauxMaintenant(rareteCategorie(ww, 'poissons'), 'shark', new Date(2026, 6, 10, 23)).pourcent, 1);
  // WW Tarentule, juillet, 19h-23h : 1 %, et 0 % sans insecte
  const ta = tauxMaintenant(rareteCategorie(ww, 'insectes'), 'tarantula', new Date(2026, 6, 10, 20));
  assert.equal(ta.pourcent, 1);
  assert.equal(ta.rien, 0);
  // GC cœlacanthe : seulement s'il pleut, jamais entre 9 h et 16 h
  const crGc = rareteCategorie(gc, 'poissons');
  assert.ok(tauxMaintenant(crGc, 'coelacanth', new Date(2026, 0, 10, 22)).pluie > 0);
  assert.equal(tauxMaintenant(crGc, 'coelacanth', new Date(2026, 0, 10, 12)).pluie, null);
  // GC saumon : SALMON2 (embouchure, 1-15 sept.) fusionné avec SALMON (rivière, 16-fin sept.)
  assert.ok(tauxMaintenant(crGc, 'salmon', new Date(2026, 8, 5, 12)).pourcent > 80);
  assert.equal(tauxMaintenant(crGc, 'salmon', new Date(2026, 8, 20, 12)).pourcent, 50);
});

test('chaque fiche reliée existe et chaque nom des fichiers bruts est relié ou ignoré', () => {
  const corresp = lire('data/rarete/correspondances.json');
  for (const [jeu, c] of Object.entries(corresp)) {
    if (jeu.startsWith('_')) continue;
    const brut = lire(`data/rarete/${c.fichier}`);
    for (const [cat, catDex] of [['poissons', 'poissons'], ['insectes', 'insectes'], ['creatures_marines', 'creatures-marines']]) {
      if (!brut[cat]) continue;
      const ids = new Set(lire(`data/${jeu}/${catDex}.json`).map(e => e.id));
      for (const [nom, id] of Object.entries(c[cat])) assert.ok(ids.has(id), `${jeu}/${cat} : ${nom} -> ${id}`);
      const ignores = new Set(c.ignorer[cat]);
      for (const t of brut[cat]) for (const e of t.table) assert.ok(c[cat][e.espece] || ignores.has(e.espece), `${jeu}/${cat} : ${e.espece} non relié`);
    }
  }
});

test('WW : périodes lues sur animalcrossing-online.com, à la quinzaine près', () => {
  const { presenceDepuisSite } = require('../scripts/ww.js');
  const enObjet = m => Object.fromEntries(m);
  assert.deepEqual(enObjet(presenceDepuisSite('16 juin - septembre')), { 6: [16, 31], 7: null, 8: null, 9: null });
  assert.deepEqual(enObjet(presenceDepuisSite('16 décembre - août')), { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null, 12: [16, 31] });
  assert.deepEqual(enObjet(presenceDepuisSite('16 - 31 août')), { 8: [16, 31] });
  assert.deepEqual(enObjet(presenceDepuisSite('Septembre')), { 9: null });
  assert.deepEqual([...presenceDepuisSite('Mars - juillet, 16 septembre - janvier').keys()], [1, 3, 4, 5, 6, 7, 9, 10, 11, 12]);
  assert.equal(presenceDepuisSite("Toute l'année").size, 12);
  // Les fiches générées suivent le site
  const anguille = lire('data/ww/poissons.json').find(e => e.id === 'eel');
  assert.deepEqual(anguille.dispo.tous.find(p => p.mois.includes(6)).jours, [16, 31]);
});

test('City Folk : lecture du tableur des taux (en-têtes, créneaux)', () => {
  const { lireEntete, plages, contient } = require('../scripts/rarete-cf.js');
  assert.deepEqual(lireEntete('Aug 1-14\n09pm-04am'), { mois: 'aout', quinzaine: '1-14', plages: [[21, 4]] });
  assert.deepEqual(lireEntete('Sep 15-30\n09am-04pm'), { mois: 'septembre', quinzaine: '15-fin', plages: [[9, 16]] });
  assert.deepEqual(plages('04am-08am & 05pm-07pm'), [[4, 8], [17, 19]]);
  assert.ok(contient([23, 8], [23, 4]) && contient([23, 8], [4, 8]) && !contient([23, 8], [8, 16]));
});

test('City Folk : exemples réels, taux connectés et « aucun insecte »', async () => {
  const { rareteCategorie, tauxMaintenant } = await charger('rarete.js');
  const cf = lire('data/cf/rarete.json');
  const p = rareteCategorie(cf, 'poissons');
  const i = rareteCategorie(cf, 'insectes');
  // Bar commun, janvier, 21h-4h : 15 % (bornes 32 -> 47) ; à 9h-16h : 18 %, soit 18/95 = 18,95 % connecté.
  assert.equal(tauxMaintenant(p, 'sea-bass', new Date(2026, 0, 10, 22)).pourcent, 15);
  const bar = tauxMaintenant(p, 'sea-bass', new Date(2026, 0, 10, 12));
  assert.equal(bar.pourcent, 18);
  assert.equal(bar.connecte, 18.95);
  // Ombre (stringfish), janvier, nuit : borne 95 -> 96, donc impossible connecté.
  const ombre = tauxMaintenant(p, 'stringfish', new Date(2026, 0, 10, 22));
  assert.equal(ombre.pourcent, 1);
  assert.equal(ombre.connecte, 0);
  // Août coupé le 15 : deux tables différentes pour la mer.
  assert.ok(p.tables.some(t => t.mois === 8 && t.jours && t.jours[0] === 15));
  // Insectes : chaque mois a ses six créneaux, et « aucun insecte » est connu.
  for (let m = 1; m <= 12; m++) assert.equal(i.tables.filter(t => t.mois === m).length, 6);
  assert.ok(i.tables.every(t => t.rien != null));
  const tarentule = tauxMaintenant(i, 'tarantula', new Date(2026, 6, 10, 20));
  assert.ok(tarentule.pourcent > 0);
  assert.equal(tarentule.connecte, null);
});

test('New Leaf : poissons, créatures marines, insectes et espèces sans taux', async () => {
  const { rareteCategorie, tauxMaintenant, maxAnnee } = await charger('rarete.js');
  const nl = lire('data/nl/rarete.json');
  const p = rareteCategorie(nl, 'poissons');
  const cm = rareteCategorie(nl, 'creatures-marines');
  const i = rareteCategorie(nl, 'insectes');
  // Bouvière, novembre, 22 h (créneau 21h-4h, rivière) : 2 %.
  const bouviere = tauxMaintenant(p, 'bitterling', new Date(2026, 10, 10, 22));
  assert.equal(bouviere.pourcent, 2);
  assert.equal(bouviere.creneau, '21h-4h');
  // Ville : 14 périodes × 3 créneaux × 2 eaux ; août coupé au 16. Île de Tortimer : mêmes 14 périodes (pour garder une ligne par moitié de mois).
  assert.equal(p.tables.filter(t => !t.ile).length, 84);
  assert.equal(p.tables.filter(t => t.ile).length, 84);
  assert.ok(p.tables.some(t => t.mois === 8 && t.jours && t.jours[0] === 16));
  // Créatures marines : 14 périodes × 3 créneaux, pour la ville comme pour l'île.
  assert.equal(cm.tables.filter(t => !t.ile).length, 42);
  assert.equal(cm.tables.filter(t => t.ile).length, 42);
  assert.deepEqual(cm.creneaux.map(c => c.id).sort(), ['21h-4h', '4h-9h et 16h-21h', '9h-16h']);
  // Insectes : 12 mois × 6 créneaux, « aucun insecte » connu partout.
  assert.equal(i.tables.length, 72);
  assert.ok(i.tables.every(t => t.rien != null));
  // Déchets et « Inconnu » : ignorés dans les fiches, mais chaque tirage reste à 100 % (pas de « rien » inventé).
  const brut = lire('data/rarete/rarete_animal_crossing_nl.json');
  const ile = brut.ile_tortimer;
  for (const t of [...brut.poissons, ...brut.creatures_marines, ...ile.poissons, ...ile.creatures_marines]) assert.ok(Math.abs(t.table.reduce((a, e) => a + e.pourcent, 0) - 100) < 0.05);
  assert.ok(p.tables.every(t => t.rien == null));
  // Espèces de l'île de Tortimer : un taux toute l'année, sur la table de l'île (plus de « rareté inconnue »).
  for (const [cr, id, lieu] of [[p, 'ribbon-eel', 'mer'], [p, 'giant-trevally', 'mer'], [p, 'whale-shark', 'mer'], [cm, 'spotted-garden-eel', 'plongée'], [cm, 'chambered-nautilus', 'plongée'], [cm, 'giant-isopod', 'plongée']]) {
    assert.ok(maxAnnee(cr, id), id);
    assert.ok(!(cr.sans_taux && cr.sans_taux[id]), id);
    for (let mois = 0; mois < 12; mois++) {
      const t = tauxMaintenant(cr, id, new Date(2026, mois, 10, 12));
      assert.ok(t.pourcent > 0, `${id} en ${mois + 1}`);
      assert.ok(t.details.every(d => d.eau_texte === `Île de Tortimer (${lieu})`), id);
    }
  }
  // Dans les deux : le taux de la ville et celui de l'île s'affichent côte à côte (poisson-chirurgien, 20 août à midi : 2 % en ville, 7 % sur l'île).
  const chirurgien = tauxMaintenant(p, 'surgeonfish', new Date(2026, 7, 20, 12));
  assert.deepEqual(chirurgien.details.map(d => [d.eau_texte, d.pourcent]).sort(), [['Mer', 2], ['Île de Tortimer (mer)', 7]].sort());
  assert.equal(chirurgien.pourcent, 7);
  // Le tableau de la fiche n'a pas de ligne en double : l'île est coupée aux mêmes jours que la ville.
  const { grilleEspece } = await charger('rarete.js');
  const libelles = grilleEspece(p, 'surgeonfish').lignes.map(l => l.libelle);
  assert.equal(new Set(libelles).size, libelles.length);
  assert.equal(p.tables.filter(t => t.ile && t.mois === 9).map(t => String(t.jours)).sort().join(' '), p.tables.filter(t => !t.ile && t.mois === 9).map(t => String(t.jours)).sort().join(' '));
  for (const id of ['bee', 'ant', 'fly', 'hermit-crab']) { assert.equal(maxAnnee(i, id), null); assert.match(i.sans_taux[id], /Autre mécanisme/); }
});

test("cœlacanthe : seulement s'il pleut ou s'il neige (New Leaf, Wild World, City Folk)", () => {
  for (const jeu of ['nl', 'ww', 'cf']) {
    const p = lire(`data/${jeu}/rarete.json`).categories.poissons;
    assert.equal(p.meteo_seulement.coelacanth, "s'il pleut ou s'il neige", jeu);
    assert.ok(!(p.a_verifier && p.a_verifier.coelacanth), jeu);
  }
});

test('New Horizons : tables par hémisphère, filtrées selon le profil', async () => {
  const { rareteCategorie, tauxMaintenant, maxAnnee } = await charger('rarete.js');
  const r = lire('data/nh/rarete.json');
  const nord = rareteCategorie(r, 'insectes', 'nord');
  const sud = rareteCategorie(r, 'insectes', 'sud');
  assert.ok(nord.tables.length && nord.tables.every(t => t.hemisphere === 'nord'));
  assert.ok(sud.tables.length && sud.tables.every(t => t.hemisphere === 'sud'));
  // Même objet à chaque appel (les caches de maxAnnee en dépendent) ; nord par défaut.
  assert.equal(rareteCategorie(r, 'insectes', 'nord'), nord);
  assert.equal(rareteCategorie(r, 'insectes'), nord);
  // Les autres jeux n'ont pas d'hémisphère : la catégorie est rendue telle quelle.
  const nl = lire('data/nl/rarete.json');
  assert.equal(rareteCategorie(nl, 'poissons', 'sud'), nl.categories.poissons);
  // Luciole : juin à 20 h dans le nord, absente en juin dans le sud (c'est l'hiver).
  assert.ok(tauxMaintenant(nord, 'firefly', new Date(2026, 5, 10, 20)).pourcent > 0);
  assert.equal(tauxMaintenant(sud, 'firefly', new Date(2026, 5, 10, 20)).pourcent, 0);
  assert.ok(tauxMaintenant(sud, 'firefly', new Date(2026, 11, 10, 20)).pourcent > 0);
  // Guêpe, fourmi, mouche : autre mécanisme, pas de taux mais une raison.
  for (const id of ['wasp', 'ant', 'fly']) { assert.equal(maxAnnee(nord, id), null); assert.match(nord.sans_taux[id], /Autre mécanisme/); }
});

test("New Horizons : chaque tirage fait 100 %, cœlacanthe et escargot seulement s'il pleut", () => {
  const brut = lire('data/rarete/rarete_animal_crossing_nh.json');
  for (const cat of ['poissons', 'insectes', 'creatures_marines']) {
    for (const t of brut[cat]) {
      if (t.table.length) assert.ok(Math.abs(t.table.reduce((a, e) => a + e.pourcent, 0) - 100) < 1e-6, `${cat} ${t.mois} ${t.creneau}`);
      assert.ok(['nord', 'sud'].includes(t.hemisphere));
    }
  }
  assert.deepEqual([...new Set(brut.poissons.map(t => t.eau))].sort(), ['embouchure', 'etang', 'mer', 'ponton', 'riviere', 'riviere-hauteur']);
  const r = lire('data/nh/rarete.json').categories;
  for (const [cat, id] of [['poissons', 'coelacanth'], ['insectes', 'snail']]) {
    assert.ok(r[cat].pluie_seulement[id], `${cat} ${id}`);
    assert.ok(r[cat].tables.every(t => !t.especes[id]), `${cat} ${id} jamais par beau temps`);
    assert.ok(r[cat].tables.some(t => t.pluie && t.pluie[id] > 0), `${cat} ${id} s'il pleut`);
  }
  // Toutes les espèces du dex ont un taux, sauf celles qui ont une raison.
  for (const cat of ['poissons', 'insectes', 'creatures-marines']) {
    const presents = new Set(r[cat].tables.flatMap(t => [...Object.keys(t.especes), ...Object.keys(t.pluie || {})]));
    const sans = lire(`data/nh/${cat}.json`).filter(e => !presents.has(e.id)).map(e => e.id);
    assert.deepEqual(sans.sort(), Object.keys(r[cat].sans_taux || {}).sort(), cat);
  }
});
