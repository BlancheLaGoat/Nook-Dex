// Correspondance entre les numéros de la sauvegarde de City Folk et les fiches du dex.
//
// Sources :
//  - liste des objets du jeu (numéro -> nom anglais) : ACSE de Cuyler36 (licence MIT), Resources/CF_Items_en.txt,
//    téléchargée dans sources/cf/ (non envoyé sur GitHub) ;
//  - organisation de la sauvegarde : ACSE (Encyclopedia.cs, SaveDataManager.cs) et les positions données par
//    actoolkit-linux ; seuls les faits sont repris, vérifiés sur trois vraies sauvegardes (deux américaines,
//    une européenne). Le code est écrit pour Nook Dex.
//  - catalogue (joueur +0x841A) : un bit par objet, bit n = (numéro - 0x9000) / 4 (octet n / 8, bit n % 8) ;
//    les créatures attrapées (encyclopédie) sont les bits des insectes (0x9960…) et des poissons (0x9AF0…) ;
//    les morceaux de K.K. suivent le catalogue : bit 4096 + k pour le k-ième morceau (0x94B0 + 4k) ;
//  - musée (0x7352A) : un quartet par objet (case paire = quartet bas) = qui l'a donné ; fossiles (+0x00),
//    poissons (+0x1E), insectes (+0x3F), tableaux (+0x60), chacun dans l'ordre des numéros d'objets.
//  Musée et morceaux de K.K. vérifiés dans le code du jeu (voir src/renderer/lib/sauvegarde-cf.js).
//
// Écrit data/cf/sauvegarde.json. Lancer avec : npm run donnees:sauvegarde-cf   (--maj pour retélécharger la liste)
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, DOSSIER_SOURCES, slug, ecrireJson, telecharger } = require('./lib/outils');
const { lireObjets } = require('./sauvegarde-ww');

const URL_OBJETS = 'https://raw.githubusercontent.com/Cuyler36/ACSE/master/ACSE.WinForms/Resources/CF_Items_en.txt';
const FICHIER_OBJETS = path.join(DOSSIER_SOURCES, 'cf', 'acse_cf_items_en.txt');

const lire = f => JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, f), 'utf8'));

// Plages de numéros du catalogue -> catégorie du dex.
const PLAGES = [
  [0x93E8, 0x9414, 'meubles'],        // meubles champignon
  [0x9640, 0x974F, 'papeterie'],
  [0x9FA0, 0xA108, 'papiers-peints'],
  [0xA2C0, 0xA420, 'sols'],
  [0xA518, 0xAFFC, 'vetements'],      // hauts, parapluies, chapeaux, accessoires
  [0xB3F0, 0xB5EC, 'gyroides'],
  [0xB710, 0xC244, 'meubles'],
  [0xCC28, 0xCD0C, 'fossiles'],
  [0xCE80, 0xCF54, 'outils'],
];
const INSECTES = 0x9960, POISSONS = 0x9AF0, FOSSILES = 0xCC28, TABLEAUX = 0xCD40, KK = 0x94B0;
const bitDe = n => (n - 0x9000) >> 2;

// Objets d'ACSE dont le nom ne donne pas directement la fiche : nom -> [catégorie, identifiant].
const ALIAS = {
  'Miyama Stag': ['insectes', 'miyama-stag-beetle'],
  'Forest Wall': ['papiers-peints', 'forest-wall'],   // rangés parmi les meubles champignon dans le jeu
  'Forest Floor': ['sols', 'forest-floor'],
};
// Absents du dex de City Folk (parapluies, papeterie et décors des magasins…) : ignorés sans le signaler.

async function principal() {
  if (process.argv.includes('--maj') || !fs.existsSync(FICHIER_OBJETS)) {
    console.log('Téléchargement de la liste des objets (ACSE)…');
    await telecharger(URL_OBJETS, FICHIER_OBJETS);
  }
  const objets = lireObjets(fs.readFileSync(FICHIER_OBJETS, 'utf8'));
  const parNumero = new Map(objets.map(o => [o.n, o]));
  const erreurs = [];
  const manquants = [];

  const index = {};
  const fiches = cat => {
    if (!index[cat]) {
      index[cat] = new Map();
      for (const e of lire(`cf/${cat}.json`)) {
        index[cat].set(e.id, e.id);
        index[cat].set(slug(e.nom.en), e.id);
      }
    }
    return index[cat];
  };
  // La papeterie existe en 4 quantités (« Lined Paper (1) » à « (4) ») : seul le nom compte.
  const relier = (cat, nom, obligatoire) => {
    if (ALIAS[nom]) {
      const [c, id] = ALIAS[nom];
      if (!fiches(c).has(id)) erreurs.push(`alias : la fiche « ${c}/${id} » n'existe pas`);
      return { categorie: c, id };
    }
    const id = fiches(cat).get(slug(nom.replace(/ \(\d\)$/, ''))) || null;
    if (!id) (obligatoire ? erreurs : manquants).push(`${cat} : « ${nom} »`);
    return id ? { categorie: cat, id } : null;
  };
  const suite = (debut, nb, cat) => Array.from({ length: nb }, (_, i) => {
    const o = parNumero.get(debut + i * 4);
    if (!o) { erreurs.push(`${cat} : pas d'objet n° 0x${(debut + i * 4).toString(16)}`); return null; }
    const r = relier(cat, o.nom, true);
    return r && r.id;
  });

  const musee = {
    fossiles: suite(FOSSILES, 58, 'fossiles'),
    poissons: suite(POISSONS, 64, 'poissons'),
    insectes: suite(INSECTES, 64, 'insectes'),
    art: suite(TABLEAUX, 23, 'art'),
  };
  const encyclopedie = {
    insectes: { premier: bitDe(INSECTES), ids: musee.insectes },
    poissons: { premier: bitDe(POISSONS), ids: musee.poissons },
  };

  const catalogue = [];
  const vus = new Set();
  for (const o of objets) {
    const plage = PLAGES.find(([a, b]) => o.n >= a && o.n <= b);
    if (!plage || /\[Unused\]|^Not Used$/i.test(o.nom) || vus.has(bitDe(o.n))) continue;
    const r = relier(plage[2], o.nom, false);
    if (r) { vus.add(bitDe(o.n)); catalogue.push({ bit: bitDe(o.n), ...r }); }
  }
  // Morceaux de K.K. : juste après le catalogue (bit 4096 + k).
  for (let k = 0; ; k++) {
    const o = parNumero.get(KK + 4 * k);
    if (!o || /^Not Used$/i.test(o.nom)) break;
    const r = relier('kk', o.nom, false);
    if (r) catalogue.push({ bit: 4096 + k, ...r });
  }
  catalogue.sort((a, b) => a.bit - b.bit);

  if (erreurs.length) { console.error(`${erreurs.length} problème(s) :\n- ${erreurs.join('\n- ')}`); process.exit(1); }
  const f = ecrireJson('cf/sauvegarde.json', {
    _genere: 'Fichier fabriqué par scripts/sauvegarde-cf.js : ne pas modifier à la main.',
    source: 'ACSE (Cuyler36, MIT) : CF_Items_en.txt, Encyclopedia.cs, SaveDataManager.cs ; positions vérifiées sur de vraies sauvegardes',
    musee, encyclopedie, catalogue,
  });
  const parCat = catalogue.reduce((m, c) => ({ ...m, [c.categorie]: (m[c.categorie] || 0) + 1 }), {});
  console.log(`musée : 58 fossiles, 64 poissons, 64 insectes, 23 tableaux ; catalogue : ${JSON.stringify(parCat)} -> ${path.relative(process.cwd(), f)}`);
  if (manquants.length) console.log(`${manquants.length} objet(s) du catalogue sans fiche :\n- ${manquants.join('\n- ')}`);
}

if (require.main === module) principal().catch(e => { console.error(e.message); process.exit(1); });
