// Correspondance entre les numéros de la sauvegarde de Wild World et les fiches du dex.
//
// Sources :
//  - liste des objets du jeu (numéro -> nom anglais) : ACSE de Cuyler36 (licence MIT), Resources/WW_Items_en.txt,
//    téléchargée dans sources/ww/ (non envoyé sur GitHub) ;
//  - organisation de la sauvegarde : ACSE et la documentation de Leaflet (oddnebula/leaflet-wild-world, licence MIT),
//    reprise de la décompilation du jeu. Seuls les faits sont repris ; le code est écrit pour Nook Dex.
//  - musée (ville +0x15D50) : un quartet par objet = qui l'a donné ; fossiles (+0x00), poissons (+0x1B),
//    insectes (+0x38), tableaux (+0x55), chacun dans l'ordre des numéros d'objets ;
//  - encyclopédie (joueur +0x1BDD) : bit 1 à 56 = insectes, 57 à 112 = poissons, dans l'ordre des numéros ;
//  - catalogue (joueur +0x1B48) : meubles par index ((n - 0x3000) / 4), puis papiers peints (octet 0x100),
//    sols (0x109), morceaux de K.K. (0x112), papeterie (0x11B).
//
// Écrit data/ww/sauvegarde.json. Lancer avec : npm run donnees:sauvegarde-ww   (--maj pour retélécharger la liste)
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, DOSSIER_SOURCES, slug, ecrireJson, telecharger } = require('./lib/outils');

const URL_OBJETS = 'https://raw.githubusercontent.com/Cuyler36/ACSE/master/ACSE.WinForms/Resources/WW_Items_en.txt';
const FICHIER_OBJETS = path.join(DOSSIER_SOURCES, 'ww', 'acse_ww_items_en.txt');

const lire = f => JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, f), 'utf8'));

// Objets d'ACSE dont le nom ne donne pas directement la fiche : nom -> [catégorie, identifiant].
// (Rangés parmi les meubles dans le jeu, mais ce sont des vêtements dans le dex.)
const ALIAS = {
  "Burgler's Shirt": ['vetements', 'burglars-shirt'],
  'Scale Armor': ['vetements', 'scale-armor-suit'],
  'Gold Armor': ['vetements', 'gold-armor-suit'],
  'White Veil #1': ['vetements', 'white-veil'],
  'Post-Op Patch': ['vetements', 'post-op-patch'],
  'Mini-Mustache': ['vetements', 'mini-mustache'],
  'Mario Mustache': ['vetements', 'big-bro-mustache'],
};

// Lit WW_Items_en.txt : « 0x12B0, Common Butterfly », regroupés sous des titres « //Insects ».
function lireObjets(texte) {
  const objets = [];
  let groupe = '';
  for (const ligne of texte.replace(/^﻿/, '').split(/\r?\n/)) {
    const t = ligne.trim();
    if (t.startsWith('//')) { groupe = t.slice(2).trim(); continue; }
    const m = /^0x([0-9A-Fa-f]{4}),\s*(.+)$/.exec(t);
    if (m) objets.push({ n: parseInt(m[1], 16), nom: m[2].trim(), groupe });
  }
  return objets;
}

// Bit du catalogue d'un objet (null : pas dans le catalogue).
function bitCatalogue(n) {
  if (n >= 0x3000 && n < 0x5000) return (n - 0x3000) >> 2;
  if (n >= 0x1100 && n <= 0x1143) return 0x100 * 8 + (n - 0x1100);
  if (n >= 0x1144 && n <= 0x1187) return 0x109 * 8 + (n - 0x1144);
  if (n >= 0x1323 && n <= 0x1368) return 0x112 * 8 + (n - 0x1323);
  if (n >= 0x1000 && n <= 0x10FF && (n & 3) === 0) return 0x11B * 8 + ((n - 0x1000) >> 2);
  return null;
}

async function principal() {
  if (process.argv.includes('--maj') || !fs.existsSync(FICHIER_OBJETS)) {
    console.log('Téléchargement de la liste des objets (ACSE)…');
    await telecharger(URL_OBJETS, FICHIER_OBJETS);
  }
  const objets = lireObjets(fs.readFileSync(FICHIER_OBJETS, 'utf8'));
  const parNumero = new Map(objets.map(o => [o.n, o]));
  const erreurs = [];
  const manquants = [];

  // Fiches du dex, par nom anglais simplifié.
  const index = {};
  const fiches = cat => {
    if (!index[cat]) {
      index[cat] = new Map();
      for (const e of lire(`ww/${cat}.json`)) {
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
  const suite = (debut, nb, pas, cat) => Array.from({ length: nb }, (_, i) => {
    const o = parNumero.get(debut + i * pas);
    if (!o) { erreurs.push(`${cat} : pas d'objet n° 0x${(debut + i * pas).toString(16)}`); return null; }
    const r = relier(cat, o.nom, true);
    return r && r.id;
  });

  const musee = {
    fossiles: suite(0x450C, 52, 4, 'fossiles'),
    poissons: suite(0x12E8, 56, 1, 'poissons'),
    insectes: suite(0x12B0, 56, 1, 'insectes'),
    art: suite(0x3894, 20, 4, 'art'),
  };
  const encyclopedie = { insectes: { premier: 1, ids: musee.insectes }, poissons: { premier: 57, ids: musee.poissons } };

  // Catalogue : la catégorie d'un meuble se devine par son « jumeau » hors des meubles (vêtement, parapluie…).
  const jumeaux = new Map(objets.filter(o => o.n >= 0x1000 && o.n < 0x1600).map(o => [o.nom, o.groupe]));
  const fossiles = new Set(musee.fossiles.map((_, i) => parNumero.get(0x450C + i * 4).nom));
  const catalogue = [];
  for (const o of objets) {
    const bit = bitCatalogue(o.n);
    if (bit === null) continue;
    let cat = null;
    if (o.n >= 0x3000) {
      if (o.n >= 0x42A4 && o.n <= 0x4463) continue; // maquettes de poissons et d'insectes : bits de l'encyclopédie
      const j = jumeaux.get(o.nom);
      if (o.nom === 'Garbage' || j === 'Flowers' || /\(fake\)$|^Forged Painting$/.test(o.nom)) continue;
      if (['Shirts', 'Umbrellas', 'Hats', 'Glasses/Masks'].includes(j)) cat = 'vetements';
      else if (fossiles.has(o.nom)) cat = 'fossiles';
      else if (o.n >= 0x3850 && o.n <= 0x38E0 && /Painting$|^Portrait$/.test(o.nom)) cat = 'art';
      else if (/oid$/.test(o.nom)) cat = 'gyroides';
      else if (/'s Pic$/i.test(o.nom)) cat = 'photos';
      else cat = 'meubles';
    } else if (o.n <= 0x10FF) cat = 'papeterie';
    else if (o.n <= 0x1143) cat = 'papiers-peints';
    else if (o.n <= 0x1187) cat = 'sols';
    else cat = 'kk';
    const r = relier(cat, o.nom, false);
    if (r) catalogue.push({ bit, ...r });
  }
  catalogue.sort((a, b) => a.bit - b.bit);

  if (erreurs.length) { console.error(`${erreurs.length} problème(s) :\n- ${erreurs.join('\n- ')}`); process.exit(1); }
  const f = ecrireJson('ww/sauvegarde.json', {
    _genere: 'Fichier fabriqué par scripts/sauvegarde-ww.js : ne pas modifier à la main.',
    source: 'ACSE (Cuyler36, MIT) : WW_Items_en.txt, Catalog.cs, Museum.cs ; Leaflet (oddnebula, MIT) : organisation de la sauvegarde',
    musee, encyclopedie, catalogue,
  });
  const parCat = catalogue.reduce((m, c) => ({ ...m, [c.categorie]: (m[c.categorie] || 0) + 1 }), {});
  console.log(`musée : 52 fossiles, 56 poissons, 56 insectes, 20 tableaux ; catalogue : ${JSON.stringify(parCat)} -> ${path.relative(process.cwd(), f)}`);
  if (manquants.length) console.log(`${manquants.length} objet(s) du catalogue sans fiche :\n- ${manquants.join('\n- ')}`);
}

if (require.main === module) principal().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { bitCatalogue, lireObjets };
