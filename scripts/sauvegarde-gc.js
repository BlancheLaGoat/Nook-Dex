// Correspondance entre les numéros de la sauvegarde du GameCube et les fiches du dex.
//
// D'après le code du jeu décompilé par le projet ac-decomp (licence CC0) :
//  - musée (m_museum_display.h) : 4 bits par objet ; fossiles et tableaux dans l'ordre de la liste des meubles
//    (m_ftr_def.h, de FTR_DIN_TRIKERA_HEAD à FTR_DIN_TRILOBITE et de FTR_SUM_ART01 à FTR_SUM_ART15),
//    poissons et insectes dans l'ordre de leurs objets (ITM_FISH00.., ITM_INSECT00.., soit aGYO_TYPE_* et aINS_INSECT_TYPE_*) ;
//  - catalogue (m_private.h, m_shop.c) : un bit par objet, index calculé depuis le numéro de l'objet.
// Les numéros d'objets viennent de data/gc/codes.json (tableur « ACGC Hundo Helper »).
//
// Écrit data/gc/sauvegarde.json. Lancer avec : npm run donnees:sauvegarde-gc
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, ecrireJson } = require('./lib/outils');

const lire = f => JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, f), 'utf8'));

// Ordre des 40 poissons et 40 insectes dans le jeu (ac_gyoei.h, ac_insect_h.h).
const POISSONS = ['CRUCIAN_CARP', 'BROOK_TROUT', 'CARP', 'KOI', 'CATFISH', 'SMALL_BASS', 'BASS', 'LARGE_BASS', 'BLUEGILL', 'GIANT_CATFISH',
  'GIANT_SNAKEHEAD', 'BARBEL_STEED', 'DACE', 'PALE_CHUB', 'BITTERLING', 'LOACH', 'POND_SMELT', 'SWEETFISH', 'CHERRY_SALMON', 'LARGE_CHAR',
  'RAINBOW_TROUT', 'STRINGFISH', 'SALMON', 'GOLDFISH', 'PIRANHA', 'AROWANA', 'EEL', 'FRESHWATER_GOBY', 'ANGELFISH', 'GUPPY',
  'POPEYED_GOLDFISH', 'COELACANTH', 'CRAWFISH', 'FROG', 'KILLIFISH', 'JELLYFISH', 'SEA_BASS', 'RED_SNAPPER', 'BARRED_KNIFEJAW', 'ARAPAIMA'];
const INSECTES = ['COMMON_BUTTERFLY', 'YELLOW_BUTTERFLY', 'TIGER_BUTTERFLY', 'PURPLE_BUTTERFLY', 'ROBUST_CICADA', 'WALKER_CICADA', 'EVENING_CICADA',
  'BROWN_CICADA', 'BEE', 'COMMON_DRAGONFLY', 'RED_DRAGONFLY', 'DARNER_DRAGONFLY', 'BANDED_DRAGONFLY', 'LONG_LOCUST', 'MIGRATORY_LOCUST', 'CRICKET',
  'GRASSHOPPER', 'BELL_CRICKET', 'PINE_CRICKET', 'DRONE_BEETLE', 'DYNASTID_BEETLE', 'FLAT_STAG_BEETLE', 'JEWEL_BEETLE', 'LONGHORN_BEETLE', 'LADYBUG',
  'SPOTTED_LADYBUG', 'MANTIS', 'FIREFLY', 'COCKROACH', 'SAW_STAG_BEETLE', 'MOUNTAIN_BEETLE', 'GIANT_BEETLE', 'SNAIL', 'MOLE_CRICKET', 'POND_SKATER',
  'BAGWORM', 'PILL_BUG', 'SPIDER', 'ANT', 'MOSQUITO'];
// Fossiles, dans l'ordre du jeu (m_ftr_def.h) -> fiche. TRIKERA = tricératops, BRONT = apatosaure, HUTABA = plésiosaure.
// STUMP : seul nom qui ne se traduit pas directement ; il est à la place de l'empreinte de dinosaure dans la liste.
const FOSSILES = [
  ['TRIKERA_HEAD', 'tricera-skull'], ['TRIKERA_TAIL', 'tricera-tail'], ['TRIKERA_BODY', 'tricera-torso'],
  ['TREX_HEAD', 't-rex-skull'], ['TREX_TAIL', 't-rex-tail'], ['TREX_BODY', 't-rex-torso'],
  ['BRONT_HEAD', 'apato-skull'], ['BRONT_TAIL', 'apato-tail'], ['BRONT_BODY', 'apato-torso'],
  ['STEGO_HEAD', 'stego-skull'], ['STEGO_TAIL', 'stego-tail'], ['STEGO_BODY', 'stego-torso'],
  ['PTERA_HEAD', 'ptera-skull'], ['PTERA_RWING', 'ptera-right-wing'], ['PTERA_LWING', 'ptera-left-wing'],
  ['HUTABA_HEAD', 'plesio-skull'], ['HUTABA_NECK', 'plesio-neck'], ['HUTABA_BODY', 'plesio-torso'],
  ['MAMMOTH_HEAD', 'mammoth-skull'], ['MAMMOTH_BODY', 'mammoth-torso'],
  ['AMBER', 'amber'], ['STUMP', 'dinosaur-track'], ['AMMONITE', 'ammonite'], ['EGG', 'dinosaur-egg'], ['TRILOBITE', 'trilobite'],
];
const ART01 = 0x12AC; // FTR_SUM_ART01, orienté vers le sud ; les 15 tableaux se suivent de 4 en 4

// Index du catalogue (m_shop.c : mSP_CollectCheck) selon le numéro de l'objet.
function champCatalogue(n) {
  const type = (n & 0xF000) >> 12;
  if (type === 1) return { champ: 'meubles', index: (n - 0x1000) >> 2 };
  if (type === 3) return { champ: 'meubles', index: 0x400 + ((n - 0x3000) >> 2) };
  if (n >= 0x2000 && n < 0x2100) return { champ: 'papeterie', index: (n - 0x2000) % 64 };
  if (n >= 0x2600 && n < 0x2700) return { champ: 'sols', index: n - 0x2600 };
  if (n >= 0x2700 && n < 0x2800) return { champ: 'papiers-peints', index: n - 0x2700 };
  if (n >= 0x2A00 && n < 0x2B00) return { champ: 'kk', index: n - 0x2A00 };
  return null; // vêtements, outils, gyroïdes… : pas dans le catalogue du jeu
}

function principal() {
  const corr = lire('rarete/correspondances.json').gc;
  const ids = cat => new Set(lire(`gc/${cat}.json`).map(e => e.id));
  const erreurs = [];
  // Nom absent des tables de rareté (cœlacanthe, ajouté seulement s'il pleut ; abeille…) : relié par son nom anglais.
  const relier = (liste, table, cat) => liste.map(nom => {
    const slug = nom.toLowerCase().replace(/_/g, '-');
    const id = table[nom] || (ids(cat).has(slug) ? slug : null);
    if (!id) erreurs.push(`${cat} : « ${nom} » n'est relié à aucune fiche`);
    else if (!ids(cat).has(id)) erreurs.push(`${cat} : la fiche « ${id} » n'existe pas`);
    return id || null;
  });
  // Insectes absents des tables de rareté (abeille, fourmi…) : reliés par leur nom anglais.
  const insectesDex = lire('gc/insectes.json');
  const tableInsectes = { ...corr.insectes };
  for (const nom of INSECTES) {
    if (tableInsectes[nom]) continue;
    const f = insectesDex.find(e => e.id === nom.toLowerCase().replace(/_/g, '-'));
    if (f) tableInsectes[nom] = f.id;
  }
  const codes = lire('gc/codes.json').objets;
  const parNumero = new Map(codes.filter(o => o.numero && o.fiche).map(o => [parseInt(o.numero, 16), o.fiche]));
  const art = Array.from({ length: 15 }, (_, i) => {
    const f = parNumero.get(ART01 + i * 4);
    if (!f) { erreurs.push(`art : pas de code pour le tableau n° ${i + 1}`); return null; }
    if (!ids('art').has(f.id)) { erreurs.push(`art : la fiche « ${f.id} » n'existe pas dans data/gc/art.json`); return null; }
    return f.id;
  });
  const fossilesDex = ids('fossiles');
  for (const [, id] of FOSSILES) if (!fossilesDex.has(id)) erreurs.push(`fossiles : la fiche « ${id} » n'existe pas`);

  // Catalogue : chaque objet des codes qui a une place dans le catalogue du jeu.
  const catalogue = [];
  const deja = new Set();
  for (const [n, fiche] of parNumero) {
    const c = champCatalogue(n);
    if (!c) continue;
    const cle = `${c.champ}:${c.index}`;
    if (deja.has(cle)) continue;
    deja.add(cle);
    catalogue.push({ champ: c.champ, index: c.index, categorie: fiche.categorie, id: fiche.id });
  }
  catalogue.sort((a, b) => a.champ.localeCompare(b.champ) || a.index - b.index);

  if (erreurs.length) { console.error(`${erreurs.length} problème(s) :\n- ${erreurs.join('\n- ')}`); process.exit(1); }
  const sortie = {
    _genere: 'Fichier fabriqué par scripts/sauvegarde-gc.js : ne pas modifier à la main.',
    source: 'ac-decomp (licence CC0) : m_museum_display.h, m_private.h, m_shop.c, m_ftr_def.h, ac_gyoei.h, ac_insect_h.h ; numéros des objets : data/gc/codes.json',
    musee: {
      poissons: relier(POISSONS, corr.poissons, 'poissons'),
      insectes: relier(INSECTES, tableInsectes, 'insectes'),
      fossiles: FOSSILES.map(([, id]) => id),
      art,
    },
    catalogue,
  };
  if (erreurs.length) { console.error(`${erreurs.length} problème(s) :\n- ${erreurs.join('\n- ')}`); process.exit(1); }
  const f = ecrireJson('gc/sauvegarde.json', sortie);
  const parChamp = catalogue.reduce((m, c) => ({ ...m, [`${c.champ}→${c.categorie}`]: (m[`${c.champ}→${c.categorie}`] || 0) + 1 }), {});
  console.log(`musée : 40 poissons, 40 insectes, 25 fossiles, 15 tableaux ; catalogue : ${JSON.stringify(parChamp)} -> ${path.relative(process.cwd(), f)}`);
}

if (require.main === module) principal();
module.exports = { champCatalogue };
