// Index global « par espèce » : relie une même créature d'un jeu à l'autre.
// Écrit data/especes.json : [{ id, nom: { fr, en }, categorie, jeux: { nh: { categorie, id }, … } }]
//
// Les créatures sont reconnues par leur nom anglais (un peu simplifié). Quelques espèces ont été
// renommées entre les jeux : elles sont reliées par la table ALIAS ci-dessous (cas vérifiés uniquement).
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, ecrireJson } = require('./lib/outils');

const ORDRE_JEUX = ['nh', 'nl', 'cf', 'ww', 'gc'];   // du plus récent au plus ancien
const CATEGORIES = ['insectes', 'poissons', 'creatures-marines'];

const simplifier = nom => String(nom).toLowerCase()
  .replace(/\s*(beetle|butterfly)$/, '')
  .replace(/[^a-z]/g, '');

// Même espèce, nom anglais différent selon le jeu.
const ALIAS = {
  rajabrooke: 'rajahbrookesbirdwing',
  rajab: 'rajahbrookesbirdwing',
  rajahbrookesbirdwing: 'rajahbrookesbirdwing',
  giantpetaltail: 'petaltail',
  petaltaildragonfly: 'petaltail',
  bee: 'wasp',                 // « bee » des anciens jeux = « wasp » de New Horizons
  earshell: 'abalone',         // « ear shell » (New Leaf) = « abalone » (New Horizons)
  shark: 'greatwhiteshark',    // « shark » = « great white shark » (New Horizons)
  cyclommatus: 'cyclommatusstag',
};
const cleEspece = nom => { const s = simplifier(nom); return ALIAS[s] || s; };

const especes = new Map();
for (const jeu of ORDRE_JEUX) {
  for (const categorie of CATEGORIES) {
    const fichier = path.join(DOSSIER_DATA, jeu, `${categorie}.json`);
    if (!fs.existsSync(fichier)) continue;
    for (const e of JSON.parse(fs.readFileSync(fichier, 'utf8'))) {
      const cle = cleEspece(e.nom.en);
      if (!especes.has(cle)) {
        // Le nom affiché est celui du jeu le plus récent où l'espèce existe.
        especes.set(cle, { id: cle, nom: { fr: e.nom.fr, en: e.nom.en }, categorie, image: e.image, jeux: {} });
      }
      const sp = especes.get(cle);
      if (!sp.jeux[jeu]) sp.jeux[jeu] = { categorie, id: e.id };
    }
  }
}

const liste = [...especes.values()].sort((a, b) => a.nom.fr.localeCompare(b.nom.fr, 'fr'));
ecrireJson('especes.json', liste);
const parNombre = {};
for (const s of liste) { const n = Object.keys(s.jeux).length; parNombre[n] = (parNombre[n] || 0) + 1; }
console.log(`especes.json : ${liste.length} espèces (présentes dans 1/2/3/4/5 jeux : ${[1, 2, 3, 4, 5].map(n => parNombre[n] || 0).join('/')})`);
