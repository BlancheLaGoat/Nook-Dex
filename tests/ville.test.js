// Tests de l'outil « Ville parfaite et arrosoir en or » (Wild World).
// Lancer avec : npm test   (après npm run donnees:arrosoir)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'ville.js')).href);
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));
const regles = lire('data/arrosoir/regles.json');
const { lireIdentifiant, traduireEtiquette } = require('../scripts/arrosoir.js');

const acre = (extra = {}) => ({ modele: null, changements: {}, mauvaises_herbes: 0, objets_au_sol: 0, dechets: 0, rafflesia: 0, maisons_sur_panneaux: false, cible_arbres: null, cible_fleurs: null, ...extra });
// Acre sans modèle avec n arbres et f fleurs posés à la main.
function acreAvec(n, f, extra = {}) {
  const changements = {};
  let k = 0;
  for (let i = 0; i < n; i++, k++) changements[`${k % 16},${Math.floor(k / 16)}`] = { o: 'arbre' };
  for (let i = 0; i < f; i++, k++) changements[`${k % 16},${Math.floor(k / 16)}`] = { o: 'fleur', couleur: 'rouge', type: 'tulipe' };
  return acre({ changements, ...extra });
}

test('score d\'une acre : règles de regles.json', async () => {
  const { compterAcre, scoreAcre } = await charger();
  const score = a => scoreAcre(compterAcre(null, a), a, regles).total;
  assert.equal(score(acreAvec(13, 0)), 100);              // arbres dans la plage, rien d'autre
  assert.equal(score(acreAvec(12, 2)), 100);              // 2 fleurs tolérées : pas de bonus
  assert.equal(score(acreAvec(15, 5)), 103);              // +1 par fleur au-delà de 2
  assert.equal(score(acreAvec(10, 0)), 96);               // −2 par arbre manquant
  assert.equal(score(acreAvec(17, 0)), 96);               // −2 par arbre en trop
  assert.equal(score(acreAvec(13, 0, { mauvaises_herbes: 5 })), 97); // 3 au-delà de 2
  assert.equal(score(acreAvec(13, 0, { objets_au_sol: 3 })), 99);
  assert.equal(score(acreAvec(13, 0, { dechets: 2 })), 80);
  assert.equal(score(acreAvec(13, 0, { rafflesia: 1 })), 50);
});

test('rang d\'une acre', async () => {
  const { rangAcre } = await charger();
  const cas = [[74, 0], [75, 1], [79, 1], [80, 2], [94, 2], [95, 3], [100, 3], [101, 4], [130, 4]];
  for (const [s, r] of cas) assert.equal(rangAcre(s, regles), r, `score ${s}`);
});

test('rang de la ville : tests dans l\'ordre', async () => {
  const { rangVille } = await charger();
  const r = l => rangVille(l, regles).rang;
  assert.equal(r(Array(16).fill(0)), 0);
  assert.equal(r([1, ...Array(15).fill(4)]), 1);
  assert.equal(r([0, ...Array(15).fill(4)]), 1);
  assert.equal(r([2, ...Array(15).fill(4)]), 2);
  assert.equal(r([...Array(7).fill(4), ...Array(9).fill(3)]), 3);
  assert.equal(r([...Array(8).fill(4), ...Array(8).fill(3)]), 4);
  assert.equal(r(Array(16).fill(4)), 4);
});

test('cibles et ce qui manque, en clair', async () => {
  const { bilanAcre } = await charger();
  const b = bilanAcre(null, acreAvec(10, 1), regles);
  assert.equal(b.cibles.arbres, 12);
  assert.equal(b.cibles.fleurs, 3);
  assert.deepEqual(b.actions, ['+2 arbres', '+2 fleurs']);
  const herbes = bilanAcre(null, acreAvec(13, 3, { mauvaises_herbes: 3 }), regles);
  assert.equal(herbes.cibles.fleurs, 4);                  // 3 + 1 pénalité à compenser
  assert.deepEqual(herbes.actions, ['+1 fleur']);
  assert.deepEqual(herbes.enlever, ['−1 mauvaise herbe']);
  const trop = bilanAcre(null, acreAvec(16, 3), regles);
  assert.deepEqual(trop.actions, ['−1 arbre']);
  // Valeurs forcées à la main, et calcul du tableur (idéal − actuel = à planter).
  const force = bilanAcre(null, acreAvec(9, 0, { cible_arbres: 14, cible_fleurs: 5 }), regles);
  assert.equal(force.cibles.arbres, 14);
  assert.deepEqual(force.tableur, { ideal: 14, actuel: 9, a_planter: 5 });
  assert.deepEqual(force.actions, ['+5 arbres', '+5 fleurs']);
});

test('objets d\'une acre : modèle + changements + arbres conditionnels', async () => {
  const { objetsAcre, compterAcre } = await charger();
  const modele = { objets: [{ x: 0, y: 0, o: 'arbre' }, { x: 1, y: 0, o: 'arbre-conditionnel' }, { x: 2, y: 0, o: 'fleur', couleur: 'jaune', type: 'rose' }] };
  assert.equal(compterAcre(modele, acre()).arbres, 2);
  assert.equal(compterAcre(modele, acre({ maisons_sur_panneaux: true })).arbres, 1);
  const a = acre({ changements: { '0,0': null, '5,5': { o: 'fleur', couleur: 'blanc', type: 'pensee' } } });
  assert.equal(objetsAcre(modele, a).size, 3);
  assert.deepEqual(compterAcre(modele, a), { arbres: 1, fleurs: 2, detailFleurs: { 'rose|jaune': 1, 'pensee|blanc': 1 } });
});

test('ville d\'exemple parfaite : 8 acres au rang 4, aucune sous le rang 3', async () => {
  const { bilanVille, villeVide } = await charger();
  const ville = villeVide();
  ville.acres = ville.acres.map((_, i) => acreAvec(13, i < 8 ? 3 : 0));
  const b = bilanVille(new Map(), ville, regles);
  assert.equal(b.auRang4, 8);
  assert.equal(b.rang, 4);
  // Une acre de moins au rang 4 : ville au rang 3, et la suggestion propose les 8 plus faciles.
  ville.acres[0] = acreAvec(13, 2);
  const b2 = bilanVille(new Map(), ville, regles);
  assert.equal(b2.rang, 3);
  assert.equal(b2.suggestion.length, 8);
  assert.ok(b2.suggestion.includes(0));
});

test('compteur des 15 jours d\'affilée', async () => {
  const { joursDAffilee } = await charger();
  assert.equal(joursDAffilee([]).serie, 0);
  assert.equal(joursDAffilee(['2026-11-01', '2026-11-02', '2026-11-03']).serie, 3);
  assert.equal(joursDAffilee(['2026-11-01', '2026-11-03', '2026-11-04']).serie, 2);   // trou le 2
  assert.equal(joursDAffilee(['2026-10-31', '2026-11-01']).serie, 2);                // changement de mois
  assert.equal(regles.arrosoir_or.jours, 15);
});

test('normalisation d\'une ville importée', async () => {
  const { normaliserVille } = await charger();
  const v = normaliserVille({ acres: [{ modele: 'x', mauvaises_herbes: '4', rafflesia: 7, changements: { '1,2': { o: 'arbre' }, 'pirate': {} } }], jours: ['2026-11-14', 'n\'importe quoi', '2026-11-14'] });
  assert.equal(v.acres.length, 16);
  assert.equal(v.acres[0].mauvaises_herbes, 4);
  assert.equal(v.acres[0].rafflesia, 1);
  assert.deepEqual(Object.keys(v.acres[0].changements), ['1,2']);
  assert.deepEqual(v.jours, ['2026-11-14']);
});

test('bibliothèque des modèles d\'acres (data/arrosoir/modeles.json)', () => {
  const d = lire('data/arrosoir/modeles.json');
  assert.equal(d.modeles.length, 246);
  const cles = new Set();
  for (const m of d.modeles) {
    assert.equal(m.terrain.length, 16, m.cle);
    for (const r of m.terrain) assert.equal(r.length, 16, m.cle);
    assert.match(m.id, /^[0-9A-F]{1,2}$/, m.cle);
    assert.ok(!cles.has(m.cle), `clé en double ${m.cle}`);
    cles.add(m.cle);
    for (const o of m.objets) assert.ok(o.x >= 0 && o.x < 16 && o.y >= 0 && o.y < 16);
  }
  // Même compte que les formules COUNTIF(木)+COUNTIF(果) du tableur, sur un modèle connu (建物 1A : 9 木 + 2 果).
  const a1 = d.modeles.find(m => m.onglet === '建物' && m.id === '1A');
  assert.equal(a1.objets.filter(o => /arbre|fruitier/.test(o.o)).length, 11);
  assert.equal(a1.etiquette_fr, 'Portail');
  // Identifiants convertis en nombres par Excel : relus comme du texte.
  assert.ok(d.modeles.some(m => m.onglet === '草原' && m.id === '14'));
  assert.equal(lireIdentifiant(14), '14');
  assert.equal(lireIdentifiant('1E'), '1E');
  assert.equal(lireIdentifiant('木'), null);
  assert.equal(traduireEtiquette('池　┃型'), 'Étang, forme ┃');
  // La rose jaune écrite « ｷﾊﾞ » est bien lue.
  assert.ok(d.modeles.some(m => m.objets.some(o => o.o === 'fleur' && o.couleur === 'jaune' && o.type === 'rose')));
});
