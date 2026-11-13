// Tests automatiques de la logique de disponibilité et des filtres.
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const charger = f => import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'lib', f)).href);

// Un poisson-chat : de mai à octobre (nord), de 16 h à 9 h.
const poissonChat = {
  id: 'catfish', nom: { fr: 'Poisson-chat', en: 'Catfish' }, musee: true,
  dispo: {
    nord: [{ mois: [5, 6, 7, 8, 9, 10], heures: [[16, 9]] }],
    sud: [{ mois: [11, 12, 1, 2, 3, 4], heures: [[16, 9]] }],
  },
};
const toujours = { id: 'x', nom: { fr: 'X', en: 'X' }, dispo: { tous: [{ mois: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], heures: [[0, 24]] }] } };

test('plages horaires qui passent minuit', async () => {
  const { heureDansPlage } = await charger('dispo.js');
  assert.equal(heureDansPlage([16, 9], 23), true);
  assert.equal(heureDansPlage([16, 9], 3), true);
  assert.equal(heureDansPlage([16, 9], 9), false);
  assert.equal(heureDansPlage([16, 9], 12), false);
  assert.equal(heureDansPlage([4, 21], 20), true);
  assert.equal(heureDansPlage([4, 21], 21), false);
  assert.equal(heureDansPlage([0, 24], 0), true);
  assert.equal(heureDansPlage([0, 24], 23), true);
});

test('disponible selon la date et l\'hémisphère', async () => {
  const { estDisponible } = await charger('dispo.js');
  assert.equal(estDisponible(poissonChat, 'nord', new Date(2026, 6, 10, 22)), true);   // juillet, 22 h
  assert.equal(estDisponible(poissonChat, 'nord', new Date(2026, 6, 10, 12)), false);  // juillet, midi
  assert.equal(estDisponible(poissonChat, 'nord', new Date(2026, 0, 10, 22)), false);  // janvier
  assert.equal(estDisponible(poissonChat, 'sud', new Date(2026, 0, 10, 22)), true);
  assert.equal(estDisponible({ id: 'chaise' }, 'nord', new Date()), null);
  assert.equal(estDisponible(toujours, 'sud', new Date(2026, 3, 1, 5)), true);         // jeu sans hémisphères
});

test('part bientôt / arrive ce mois-ci', async () => {
  const { partBientot, arriveCeMois } = await charger('dispo.js');
  assert.equal(partBientot(poissonChat, 'nord', 10), true);
  assert.equal(partBientot(poissonChat, 'nord', 9), false);
  assert.equal(arriveCeMois(poissonChat, 'nord', 5), true);
  assert.equal(arriveCeMois(poissonChat, 'nord', 6), false);
  assert.equal(partBientot(poissonChat, 'sud', 4), true);
  assert.equal(arriveCeMois(poissonChat, 'sud', 11), true);
  assert.equal(partBientot(toujours, 'nord', 12), false);
});

test('textes des mois et des heures', async () => {
  const { formaterMois, formaterHeures } = await charger('dispo.js');
  assert.equal(formaterMois(new Set([5, 6, 7, 8, 9, 10])), 'mai à octobre');
  assert.equal(formaterMois(new Set([11, 12, 1, 2, 3, 4])), 'novembre à avril');
  assert.equal(formaterMois(new Set([1, 2, 3, 9, 10, 11, 12])), 'septembre à mars');
  assert.equal(formaterMois(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), "Toute l'année");
  assert.equal(formaterMois(new Set([6, 10])), 'juin, octobre');
  assert.equal(formaterHeures([[0, 24]]), 'Toute la journée');
  assert.equal(formaterHeures([[9, 16], [21, 4]]), '9 h – 16 h et 21 h – 4 h');
});

test('filtres et progression', async () => {
  const { filtrer, progression, simplifier } = await charger('filtres.js');
  const elements = [
    poissonChat,
    { id: 'bar', nom: { fr: 'Bar commun', en: 'Sea bass' }, musee: true },
    { id: 'hhp-objet', nom: { fr: 'Objet HHP', en: 'HHP item' }, ext: 'hhp' },
  ];
  const profil = { hemisphere: 'nord', extensions: [], elements: { 'poissons:catfish': { obtenu: true, musee: false } } };
  const ctx = { profil, categorie: 'poissons', maintenant: new Date(2026, 6, 10, 22) };
  assert.equal(simplifier('Écrevisse Œil'), 'ecrevisse oeil');
  assert.deepEqual(filtrer(elements, { texte: 'poisson' }, ctx).map(e => e.id), ['catfish']);
  assert.deepEqual(filtrer(elements, { texte: 'sea bass' }, ctx).map(e => e.id), ['bar']);
  assert.deepEqual(filtrer(elements, { obtenu: 'non' }, ctx).map(e => e.id), ['bar']);
  assert.deepEqual(filtrer(elements, { musee: 'non' }, ctx).map(e => e.id), ['catfish', 'bar']);
  assert.deepEqual(filtrer(elements, { maintenant: true }, ctx).map(e => e.id), ['catfish']);
  assert.deepEqual(filtrer(elements, { mois: '1' }, ctx).map(e => e.id), []);
  // Les objets d'une extension non activée sont cachés et ne comptent pas.
  assert.deepEqual(progression(elements, profil, 'poissons'), { total: 2, obtenus: 1, musee: 0, totalMusee: 2 });
  const avecHhp = { ...profil, extensions: ['hhp'] };
  assert.equal(progression(elements, avecHhp, 'poissons').total, 3);
});

test('demi-mois des anciens jeux (août et septembre coupés en deux)', async () => {
  const { estDisponible, partieDuMois, moisDisponibles } = await charger('dispo.js');
  // Disponible de juin au 15 septembre, toute la journée.
  const algue = { id: 'sea-grapes', dispo: { tous: [{ mois: [6, 7, 8], heures: [[0, 24]] }, { mois: [9], jours: [1, 15], heures: [[0, 24]] }] } };
  assert.equal(estDisponible(algue, 'nord', new Date(2026, 8, 10, 12)), true);   // 10 septembre
  assert.equal(estDisponible(algue, 'nord', new Date(2026, 8, 20, 12)), false);  // 20 septembre
  assert.equal(partieDuMois(algue, 'nord', 9), 'du 1er au 15');
  assert.equal(partieDuMois(algue, 'nord', 7), null);
  assert.deepEqual([...moisDisponibles(algue, 'nord')].sort((a, b) => a - b), [6, 7, 8, 9]);
  // Commence le 24 février (GameCube).
  const papillon = { id: 'x', dispo: { tous: [{ mois: [3, 4], heures: [[8, 16]] }, { mois: [2], jours: [24, 31], heures: [[8, 16]] }] } };
  assert.equal(estDisponible(papillon, 'nord', new Date(2026, 1, 25, 10)), true);
  assert.equal(estDisponible(papillon, 'nord', new Date(2026, 1, 10, 10)), false);
  assert.equal(partieDuMois(papillon, 'nord', 2), 'du 24 à la fin du mois');
});
