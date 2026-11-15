// Tests automatiques de « Que faire maintenant ? » (src/renderer/lib/a-faire.js).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'a-faire.js')).href);
const chargerRarete = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'rarete.js')).href);
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));

// Petites créatures inventées (jeu sans hémisphère).
const ete = { id: 'ete', nom: { fr: 'Été' }, dispo: { tous: [{ mois: [6, 7, 8], heures: [[16, 9]] }] } };
const toujours = { id: 'toujours', nom: { fr: 'Toujours' }, dispo: { tous: [{ mois: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], heures: [[0, 24]] }] } };
const fin = { id: 'fin', nom: { fr: 'Fin août' }, dispo: { tous: [{ mois: [8], jours: [16, 31], heures: [[0, 24]] }, { mois: [9], jours: [1, 15], heures: [[0, 24]] }] } };
const cr = {
  creneaux: [{ id: '9h-16h', heures: [[9, 16]] }, { id: '16h-9h', heures: [[16, 9]] }],
  tables: [
    { mois: 8, jours: null, creneau: '16h-9h', eau: 'riviere', eau_texte: 'Rivière', especes: { ete: 20, toujours: 5 } },
    { mois: 8, jours: null, creneau: '16h-9h', eau: 'mer', eau_texte: 'Mer', especes: { ete: 4 } },
    { mois: 8, jours: null, creneau: '9h-16h', eau: 'mer', eau_texte: 'Mer', especes: { toujours: 50 } },
  ],
};

test('départ : jours restants et date de retour', async () => {
  const { depart, texteDepart } = await charger();
  // 29 août : l'espèce d'été est encore là le 30 et le 31, absente à partir du 1er septembre (dans 3 jours).
  assert.deepEqual(depart(ete, 'tous', new Date(2026, 7, 29, 20)), { jours: 3, revient: { mois: 6, jour: 1 } });
  assert.equal(texteDepart(depart(ete, 'tous', new Date(2026, 7, 29, 20))), "part dans 3 jours · n'apparaît plus avant juin");
  // 31 août : dernier jour.
  assert.equal(depart(ete, 'tous', new Date(2026, 7, 31, 20)).jours, 1);
  assert.match(texteDepart(depart(ete, 'tous', new Date(2026, 7, 31, 20))), /^dernier jour aujourd'hui/);
  // Moitiés de mois : présente du 16 août au 15 septembre ; le 14 septembre, part dans 2 jours, revient le 16 août.
  assert.deepEqual(depart(fin, 'tous', new Date(2026, 8, 14, 12)), { jours: 2, revient: { mois: 8, jour: 16 } });
  assert.equal(texteDepart(depart(fin, 'tous', new Date(2026, 8, 14, 12))), "part dans 2 jours · n'apparaît plus avant le 16 août");
  // Toute l'année : pas de départ.
  assert.equal(depart(toujours, 'tous', new Date(2026, 7, 29, 20)), null);
  assert.equal(texteDepart(null), "là toute l'année");
});

test('fin du créneau : « jusqu\'à 9 h », rien si toute la journée', async () => {
  const { finDuCreneau } = await charger();
  assert.equal(finDuCreneau(ete, 'tous', new Date(2026, 7, 10, 22)), 9);
  assert.equal(finDuCreneau(ete, 'tous', new Date(2026, 7, 10, 3)), 9);
  assert.equal(finDuCreneau(toujours, 'tous', new Date(2026, 7, 10, 3)), null);
});

test('chance par tirage, meilleur lieu, nombre moyen de tirages', async () => {
  const { chanceMaintenant, tiragesMoyens } = await charger();
  const c = chanceMaintenant(cr, 'ete', new Date(2026, 7, 10, 20));
  assert.equal(c.pourcent, 20);
  assert.equal(c.lieu, 'Rivière');
  assert.deepEqual(c.autres, [{ lieu: 'Mer', pourcent: 4 }]);
  // Pas de taux pour cette espèce (ou ce jeu) : null, jamais de chiffre inventé.
  assert.equal(chanceMaintenant(cr, 'inconnue', new Date(2026, 7, 10, 20)), null);
  assert.equal(chanceMaintenant(null, 'ete', new Date(2026, 7, 10, 20)), null);
  assert.equal(tiragesMoyens(20), 5);
  assert.equal(tiragesMoyens(3), 33);
  assert.equal(tiragesMoyens(150), 1);
  assert.equal(tiragesMoyens(0), null);
});

test('liste : seulement ce qui manque et qui est là maintenant, triée', async () => {
  const { listeAFaire } = await charger();
  const cat = { id: 'poissons' };
  const sansTaux = { id: 'sans-taux', nom: { fr: 'Sans taux' }, dispo: toujours.dispo };
  const coches = { 'poissons:toujours': { obtenu: true } };
  const etatDe = (c, id) => coches[`${c}:${id}`] || {};
  const options = { hemisphere: 'tous', date: new Date(2026, 7, 10, 20), etatDe };
  const ids = l => l.map(x => x.e.id);
  // « toujours » est déjà attrapé ; « fin » n'est pas là le 10 août ; « sans-taux » vient après, sans chiffre.
  assert.deepEqual(ids(listeAFaire([{ cat, elements: [toujours, ete, fin, sansTaux], cr }], options)), ['ete', 'sans-taux']);
  // Critère « pas au musée » : « toujours » revient (attrapé mais pas donné).
  const musee = listeAFaire([{ cat, elements: [toujours, ete, sansTaux], cr }], { ...options, manque: 'musee' });
  assert.deepEqual(ids(musee), ['ete', 'toujours', 'sans-taux']);
  assert.deepEqual(ids(listeAFaire([{ cat, elements: [toujours, ete, sansTaux], cr }], { ...options, manque: 'musee', ordre: 'rares' })), ['toujours', 'ete', 'sans-taux']);
  const ligne = musee.find(x => x.e.id === 'ete');
  assert.equal(ligne.tirages, 5);
  assert.equal(ligne.finCreneau, 9);
  assert.deepEqual(ligne.depart, { jours: 22, revient: { mois: 6, jour: 1 } });
  assert.equal(musee.find(x => x.e.id === 'sans-taux').chance, null);
  // Élément d'une extension non activée : ignoré.
  assert.deepEqual(ids(listeAFaire([{ cat, elements: [{ ...ete, ext: 'x' }], cr }], options)), []);
});

test('données réelles : New Horizons sud, 10 décembre à 20 h', async () => {
  const { listeAFaire } = await charger();
  const { rareteCategorie } = await chargerRarete();
  const r = lire('data/nh/rarete.json');
  const cats = ['insectes', 'poissons', 'creatures-marines'].map(id => ({ cat: { id }, elements: lire(`data/nh/${id}.json`), cr: rareteCategorie(r, id, 'sud') }));
  const liste = listeAFaire(cats, { hemisphere: 'sud', date: new Date(2026, 11, 10, 20), etatDe: () => ({}) });
  assert.ok(liste.length > 30);
  const luciole = liste.find(x => x.e.id === 'firefly');
  assert.ok(luciole && luciole.chance.pourcent > 20);
  assert.equal(luciole.tirages, Math.round(100 / luciole.chance.pourcent));
  // Les plus faciles d'abord.
  const chances = liste.filter(x => x.chance && x.chance.pourcent > 0).map(x => x.chance.pourcent);
  assert.deepEqual(chances, [...chances].sort((a, b) => b - a));
  // Les poissons ont un lieu (rivière, mer, étang…).
  assert.ok(liste.filter(x => x.cat.id === 'poissons' && x.chance && x.chance.pourcent > 0).every(x => x.chance.lieu));
});
