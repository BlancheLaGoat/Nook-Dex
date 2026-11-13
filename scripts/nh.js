// Génère les données d'Animal Crossing: New Horizons dans data/nh/.
//
// Sources :
//  - « Data Spreadsheet for Animal Crossing New Horizons » (tableur communautaire, à jour 3.0.x)
//  - « ACNH String Translations » (noms officiels dans toutes les langues, dont le français d'Europe)
//
// Utilisation :
//   npm run donnees:nh            -> utilise les tableurs déjà téléchargés (sinon les télécharge)
//   npm run donnees:nh -- --maj   -> retélécharge les tableurs avant de générer
const fs = require('fs');
const path = require('path');
const { lireClasseurAvecCache } = require('./lib/xlsx');
const { DOSSIER_SOURCES, slug, majuscule, ecrireJson, telecharger, creerAttributeurIds } = require('./lib/outils');

const SOURCES = {
  tableur: {
    fichier: path.join(DOSSIER_SOURCES, 'sheet', 'acnh.xlsx'),
    url: 'https://docs.google.com/spreadsheets/d/13d_LAJPlxMa_DubPTuirkIV4DERBMXbrWQsmSh8ReK4/export?format=xlsx',
  },
  traductions: {
    fichier: path.join(DOSSIER_SOURCES, 'trad', 'trad.xlsx'),
    url: 'https://docs.google.com/spreadsheets/d/1MMbsvDfu59OY9YBEAfHhFJ6O8vRTllNFgMrX7RBZuyI/export?format=xlsx',
  },
};

// ---------------------------------------------------------------------------
// Traductions
// ---------------------------------------------------------------------------

// Construit des dictionnaires anglais -> français à partir de la feuille de traductions.
function preparerTraductions(trad) {
  const parId = new Map();      // "123" -> ligne
  const parNom = new Map();     // "anchovy" -> ligne (premier trouvé)
  const parOnglet = {};         // "Fish" -> Map(nom anglais -> ligne)
  for (const [onglet, lignes] of Object.entries(trad)) {
    if (/Readme|Catchphrase/.test(onglet)) continue;
    const variantes = /Variant|Pattern/.test(onglet);
    const m = new Map();
    for (const l of lignes) {
      if (!l.EUfr) continue;
      for (const en of [l.USen, l.EUen]) if (en) m.set(String(en).toLowerCase(), l);
      if (variantes) continue;
      if (l.Id != null && !parId.has(String(l.Id))) parId.set(String(l.Id), l);
      for (const en of [l.USen, l.EUen]) {
        if (en && !parNom.has(String(en).toLowerCase())) parNom.set(String(en).toLowerCase(), l);
      }
    }
    parOnglet[onglet] = m;
  }
  return {
    // Cherche le nom français : d'abord dans les onglets indiqués (par nom), puis par identifiant, puis partout.
    fr(nomEn, { onglets = [], id = null } = {}) {
      const cle = String(nomEn || '').toLowerCase();
      for (const o of onglets) {
        const l = parOnglet[o] && parOnglet[o].get(cle);
        if (l) return l.EUfr;
      }
      if (id != null && parId.has(String(id))) {
        const l = parId.get(String(id));
        // On vérifie que l'identifiant correspond bien au même objet (les numéros se recoupent entre onglets).
        if ([l.USen, l.EUen].some(x => String(x || '').toLowerCase() === cle)) return l.EUfr;
      }
      const l = parNom.get(cle);
      return l ? l.EUfr : null;
    },
    onglet(o) { return parOnglet[o] || new Map(); },
  };
}

// ---------------------------------------------------------------------------
// Libellés français (lieux, ombres, sources…)
// ---------------------------------------------------------------------------

const LIEUX_POISSONS = {
  'River': ['riviere', 'Rivière'],
  'River (clifftop)': ['riviere-falaise', 'Rivière (en hauteur)'],
  'River (mouth)': ['embouchure', 'Embouchure'],
  'Pond': ['etang', 'Étang'],
  'Sea': ['mer', 'Mer'],
  'Sea (rainy days)': ['mer', 'Mer'],
  'Pier': ['ponton', 'Ponton'],
};

const LIEUX_INSECTES = {
  'On trees (any kind)': ['arbres', 'Sur les arbres'],
  'On hardwood/cedar trees': ['arbres-feuillus', 'Sur les feuillus et les cèdres'],
  'On palm trees': ['cocotiers', 'Sur les cocotiers'],
  'Shaking trees (hardwood or cedar only)': ['secouer-arbres', 'En secouant les arbres (feuillus ou cèdres)'],
  'Shaking trees': ['secouer-arbres', 'En secouant les arbres'],
  'Disguised under trees': ['sous-arbres', 'Déguisé sous les arbres'],
  'On tree stumps': ['souches', 'Sur les souches'],
  'Flying near flowers': ['vol-fleurs', 'Vole près des fleurs'],
  'Flying near blue/purple/black flowers': ['vol-fleurs', 'Vole près des fleurs bleues, violettes ou noires'],
  'On flowers': ['fleurs', 'Sur les fleurs'],
  'On white flowers': ['fleurs', 'Sur les fleurs blanches'],
  'Flying': ['vol', 'En vol'],
  'Flying near water': ['vol-eau', "Vole près de l'eau"],
  'Flying near light sources': ['lumiere', 'Vole près des sources de lumière'],
  'Flying near trash (boots, tires, cans, used fountain fireworks) or rotten turnips': ['dechets', 'Vole près des déchets (bottes, pneus, canettes, feux d\'artifice usagés) ou des navets pourris'],
  'On rotten turnips or candy': ['navets-pourris', 'Sur les navets pourris ou les bonbons'],
  'On the ground': ['sol', 'Au sol'],
  'Underground (dig where noise is loudest)': ['sous-terre', 'Sous terre (creuser là où le bruit est le plus fort)'],
  'From hitting rocks': ['rochers', 'En frappant les rochers'],
  'On rocks/bushes': ['rochers', 'Sur les rochers et les buissons'],
  'On beach rocks': ['plage', 'Sur les rochers de la plage'],
  'Disguised on shoreline': ['plage', 'Déguisé sur le rivage'],
  'On rivers/ponds': ['eau', 'Sur les rivières et les étangs'],
  'Pushing snowballs': ['neige', 'En poussant les boules de neige'],
  'On villagers': ['habitants', 'Sur les habitants'],
};

// Taille d'ombre : code court + libellé (affiché dans l'appli).
const OMBRES = {
  'X-Small': '1', 'Small': '2', 'Medium': '3', 'Large': '4',
  'X-Large': '5', 'XX-Large': '6', 'X-Large w/Fin': '5-aileron', 'Long': 'longue',
};

const MOIS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Sources fréquentes. Les noms de personnages viennent de la feuille de traductions ;
// le reste est traduit ici. Ce qui n'est pas connu reste en anglais.
const SOURCES_FR = {
  'Crafting': 'Fabrication (DIY)',
  "Nook's Cranny": 'Boutique Nook',
  'Nook Shopping Daily Selection': 'Nook Shopping (sélection du jour)',
  'Nook Shopping Seasonal': 'Nook Shopping (saisonnier)',
  'Nook Shopping Promotion': 'Nook Shopping (promotion)',
  'Nook Shopping Event': 'Nook Shopping (événement)',
  'Nook Shopping Nintendo': 'Nook Shopping (Nintendo)',
  'Nook Shopping Posters': 'Nook Shopping (posters)',
  'Nook Miles Shop': 'Miles Nook',
  'Dig Spot': 'Trou à creuser',
  'Balloons': 'Ballons',
  'Message bottle': 'Bouteille à la mer',
  'All villagers': 'Habitants',
  'Picking flowers': 'Cueillette',
  'Breeding': 'Hybridation',
  'Seed bag': 'Sachet de graines',
  'K.K. concert': 'Concert de K.K.',
  'High Friendship': 'Grande amitié',
  'Assessing fossils': 'Expertise des fossiles',
  'Fishing Tourney': 'Tournoi de pêche',
  'Bug-Off': 'Chasse aux insectes',
  'Shooting stars': 'Étoiles filantes',
  'Wishing on shooting stars': 'Vœux aux étoiles filantes',
  'Mom': 'Maman',
  'Cooking': 'Cuisine',
  'Nook Miles Redemption': 'Échange de Miles Nook',
  'Town Hall': 'Mairie',
  'Resident Services': 'Services aux habitants',
  'Shaking trees': 'En secouant les arbres',
  'Hitting rocks': 'En frappant les rochers',
};

function creerTraducteurSources(tr) {
  const pnj = tr.onglet('Special NPCs');
  const evenements = tr.onglet('Event Names');
  return (sources) => {
    if (!sources) return [];
    return String(sources).split(';').map(s => s.trim()).filter(Boolean).map(s => {
      if (SOURCES_FR[s]) return SOURCES_FR[s];
      const p = pnj.get(s.toLowerCase());
      if (p) return p.EUfr;
      const e = evenements.get(s.toLowerCase());
      if (e) return majuscule(e.EUfr);
      return s;
    });
  };
}

// ---------------------------------------------------------------------------
// Horaires
// ---------------------------------------------------------------------------

// "4 AM – 9 PM" -> [[4, 21]] ; "All day" -> [[0, 24]] ; "9 AM – 4 PM; 9 PM – 4 AM" -> [[9,16],[21,4]]
function lireHeures(texte) {
  if (!texte) return null;
  const s = String(texte);
  if (/all day/i.test(s)) return [[0, 24]];
  const plages = [];
  const re = /(\d{1,2})\s*(AM|PM)\s*[–-]\s*(\d{1,2})\s*(AM|PM)/gi;
  let m;
  while ((m = re.exec(s))) {
    const h = (n, ap) => (Number(n) % 12) + (ap.toUpperCase() === 'PM' ? 12 : 0);
    plages.push([h(m[1], m[2]), h(m[3], m[4])]);
  }
  return plages.length ? plages : undefined; // undefined = format inconnu
}

// Regroupe les 12 colonnes "NH Jan".."NH Dec" en périodes { mois: [...], heures: [[a,b]] }.
function lirePeriodes(ligne, prefixe, aVerifier) {
  const parHoraire = new Map();
  MOIS_EN.forEach((mo, i) => {
    const brut = ligne[`${prefixe} ${mo}`];
    const heures = lireHeures(brut);
    if (heures === null) return;
    if (heures === undefined) { aVerifier.add('heures'); return; }
    const cle = JSON.stringify(heures);
    if (!parHoraire.has(cle)) parHoraire.set(cle, { mois: [], heures });
    parHoraire.get(cle).mois.push(i + 1);
  });
  return [...parHoraire.values()];
}

// ---------------------------------------------------------------------------
// Construction des catégories
// ---------------------------------------------------------------------------

const HHP_SOURCES = new Set(['HHP Office', 'Wardell', 'HHP Café', 'Niko', 'HHP island bottles', 'HHP Apparel Shop', 'Paradise Planning']);
function estHhp(sources) {
  const liste = String(sources || '').split(';').map(s => s.trim()).filter(Boolean);
  return liste.length > 0 && liste.every(s => HHP_SOURCES.has(s));
}

function nombre(v) {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== '' ? n : null;
}

// Base commune à tous les éléments.
function elementDeBase(ids, nomEn, nomFr, extra = {}) {
  const aVerifier = new Set(extra.aVerifier || []);
  if (!nomFr) aVerifier.add('nom.fr');
  const id = ids(slug(nomEn), extra.suffixe ?? 'x');
  const e = {
    id,
    nom: { fr: nomFr ? majuscule(nomFr) : majuscule(nomEn), en: majuscule(nomEn) },
  };
  return { e, aVerifier };
}

function finaliser(e, aVerifier) {
  if (aVerifier.size) e.a_verifier = [...aVerifier].sort();
  return e;
}

function creatures(lignes, { tr, onglet, type, pnj }) {
  const ids = creerAttributeurIds();
  return lignes.map(l => {
    const { e, aVerifier } = elementDeBase(ids, l.Name, tr.fr(l.Name, { onglets: [onglet], id: l['Internal ID'] }), { suffixe: l['Internal ID'] });
    e.n = nombre(l['#']);
    e.image = l['Icon Image'];
    e.espece = slug(l.Name);

    if (type === 'poissons') {
      const lieu = LIEUX_POISSONS[l['Where/How']];
      if (lieu) { e.lieu = lieu[0]; e.lieu_texte = lieu[1]; } else { e.lieu_texte = l['Where/How']; aVerifier.add('lieu'); }
    } else if (type === 'insectes') {
      const lieu = LIEUX_INSECTES[l['Where/How']];
      if (lieu) { e.lieu = lieu[0]; e.lieu_texte = lieu[1]; } else { e.lieu_texte = l['Where/How']; aVerifier.add('lieu'); }
    } else {
      e.lieu = 'mer-plongee';
      e.lieu_texte = 'En mer (plongée)';
    }

    if (l.Shadow) {
      e.ombre = OMBRES[l.Shadow] || l.Shadow;
      if (!OMBRES[l.Shadow]) aVerifier.add('ombre');
    }
    if (l['Movement Speed']) e.vitesse = l['Movement Speed'];

    const conditions = [];
    if (l['Where/How'] === 'Sea (rainy days)') conditions.push('pluie-neige');
    if (l.Weather === 'Rain only') conditions.push('pluie');
    if (l.Weather === 'Any except rain') conditions.push('sans-pluie');
    const prises = nombre(l['Total Catches to Unlock']);
    if (prises) conditions.push(`apres-${prises}-prises`);
    if (conditions.length) e.conditions = conditions;

    e.dispo = {
      nord: lirePeriodes(l, 'NH', aVerifier),
      sud: lirePeriodes(l, 'SH', aVerifier),
    };

    const vente = nombre(l.Sell);
    e.prix = { vente };
    if (pnj && vente != null) e.prix.special = { prix: Math.round(vente * 1.5), acheteur: pnj };
    e.musee = true;
    e.v = l['Version Added'] || undefined;
    return finaliser(e, aVerifier);
  });
}

function fossiles(lignes, { tr, sources }) {
  const ids = creerAttributeurIds();
  return lignes.map(l => {
    const { e, aVerifier } = elementDeBase(ids, l.Name, tr.fr(l.Name, { onglets: ['Fossils'], id: l['Internal ID'] }), { suffixe: l['Internal ID'] });
    e.image = l.Image;
    const groupe = l['Fossil Group'];
    if (groupe) {
      const fr = tr.fr(groupe, { onglets: ['Fossil Groups'] });
      e.groupe = { id: slug(groupe), fr: majuscule(fr || groupe), en: groupe };
      if (!fr) aVerifier.add('groupe');
    }
    e.salle = l.Museum ? l.Museum.replace('Room', 'Salle') : undefined;
    e.prix = { vente: nombre(l.Sell) };
    e.sources = sources(l.Source);
    e.musee = true;
    return finaliser(e, aVerifier);
  });
}

function art(lignes, { tr, sources }) {
  const ids = creerAttributeurIds();
  const vraies = lignes.filter(l => l.Genuine === 'Yes');
  const fausses = new Map(lignes.filter(l => l.Genuine === 'No').map(l => [l.Name, l]));
  return vraies.map(l => {
    const { e, aVerifier } = elementDeBase(ids, l.Name, tr.fr(l.Name, { onglets: ['Art'], id: l['Internal ID'] }), { suffixe: l['Internal ID'] });
    e.image = l.Image;
    e.oeuvre = { titre: l['Real Artwork Title'], artiste: l.Artist };
    e.sous = /statue/i.test(l.Name) ? 'Statue' : 'Tableau';
    const faux = fausses.get(l.Name);
    e.faux = faux ? { image: faux.Image } : null;
    e.prix = { achat: nombre(l.Buy), vente: nombre(l.Sell) };
    e.sources = sources(l.Source);
    e.musee = true;
    return finaliser(e, aVerifier);
  });
}

// Pour les onglets où chaque variante (couleur) est une ligne : on garde une ligne par nom.
function regrouperVariantes(lignes) {
  const m = new Map();
  for (const l of lignes) {
    const g = m.get(l.Name);
    if (g) { g.variantes++; continue; }
    m.set(l.Name, { ligne: l, variantes: 1 });
  }
  return [...m.values()];
}

function objets(onglets, { tr, sources, ongletsTrad, champImage = 'Image', sousCategories = {} }) {
  const ids = creerAttributeurIds();
  const res = [];
  for (const [onglet, lignes] of onglets) {
    for (const { ligne: l, variantes } of regrouperVariantes(lignes)) {
      const idInterne = l['Internal ID'] ?? l['Clothing Group ID'];
      const fr = tr.fr(l.Name, { onglets: ongletsTrad, id: idInterne });
      const { e, aVerifier } = elementDeBase(ids, l.Name, fr, { suffixe: idInterne ?? slug(onglet) });
      const champs = Array.isArray(champImage) ? champImage : [champImage];
      e.image = champs.map(c => l[c]).find(Boolean) || null;
      if (sousCategories[onglet]) e.sous = sousCategories[onglet];
      if (variantes > 1) e.variantes = variantes;
      const achat = nombre(l.Buy);
      e.prix = { achat: achat > 0 ? achat : null, vente: nombre(l.Sell) };
      if (l['Exchange Price'] && l['Exchange Currency']) e.prix.echange = { prix: nombre(l['Exchange Price']), monnaie: l['Exchange Currency'] };
      e.sources = sources(l.Source);
      if (l['Source Notes']) e.notes_source = l['Source Notes'];
      if (l.DIY === 'Yes') e.diy = true;
      if (l['Season/Event']) e.evenement = l['Season/Event'];
      if (estHhp(l.Source)) e.ext = 'hhp';
      e.v = l['Version Added'] || undefined;
      res.push(finaliser(e, aVerifier));
    }
  }
  return res;
}

const CATEGORIES_RECETTES = {
  Housewares: 'Mobilier', Miscellaneous: 'Divers', 'Wall-mounted': 'Objets muraux', 'Ceiling Decor': 'Plafonniers',
  Wallpaper: 'Papiers peints', Floors: 'Sols', Rugs: 'Tapis', Equipment: 'Vêtements et accessoires',
  Tools: 'Outils', Savory: 'Cuisine salée', Sweet: 'Cuisine sucrée', Other: 'Autres',
};

function recettes(lignes, { tr, sources, nomsObjets }) {
  const ids = creerAttributeurIds();
  return lignes.map(l => {
    const fr = tr.fr(l.Name, { id: l['Crafted Item Internal ID'] }) || nomsObjets.get(l.Name.toLowerCase());
    const { e, aVerifier } = elementDeBase(ids, l.Name, fr, { suffixe: l['Internal ID'] });
    e.image = l.Image;
    e.sous = CATEGORIES_RECETTES[l.Category] || l.Category || undefined;
    const materiaux = [];
    for (let i = 1; i <= 6; i++) {
      const m = l[`Material ${i}`];
      if (!m) continue;
      const mfr = tr.fr(m, { onglets: ['Crafting Items', 'Etc', 'Plants', 'Shells', 'Fish', 'Bugs', 'Sea Creatures', 'Furniture'] });
      materiaux.push({ n: nombre(l[`#${i}`]), fr: majuscule(mfr || m), en: m });
    }
    e.materiaux = materiaux;
    e.prix = { vente: nombre(l.Sell) };
    e.sources = sources(l.Source);
    if (l['Source Notes']) e.notes_source = l['Source Notes'];
    if (l['Season/Event']) e.evenement = l['Season/Event'];
    if (estHhp(l.Source)) e.ext = 'hhp';
    e.v = l['Version Added'] || undefined;
    return finaliser(e, aVerifier);
  });
}

function fleurs(lignes, { tr, sources }) {
  const ids = creerAttributeurIds();
  const ESPECES = {
    rose: 'Roses', tulip: 'Tulipes', lily: 'Lys', pansy: 'Pensées', hyacinth: 'Jacinthes',
    cosmos: 'Cosmos', mum: 'Chrysanthèmes', windflower: 'Anémones',
  };
  const res = [];
  for (const l of lignes) {
    const m = /^([a-z]+)-(rose|tulip|lily|pansy|hyacinth|cosmos|mum|windflower) plant$/.exec(l.Name);
    const muguet = l.Name === 'lily-of-the-valley plant';
    if (!m && !muguet) continue;
    const { e, aVerifier } = elementDeBase(ids, l.Name, tr.fr(l.Name, { onglets: ['Plants'], id: l['Internal ID'] }), { suffixe: l['Internal ID'] });
    e.image = l['Inventory Image'] || l['Storage Image'];
    e.sous = muguet ? 'Muguet' : ESPECES[m[2]];
    e.couleur = muguet ? 'white' : m[1];
    const src = String(l.Source || '');
    e.hybride = /Breeding/.test(src);
    e.sources = sources(l.Source);
    if (l['Source Notes']) e.notes_source = l['Source Notes'];
    e.prix = { vente: nombre(l.Sell) };
    res.push(finaliser(e, aVerifier));
  }
  return res;
}

function gestes(lignes, { tr, sources }) {
  const ids = creerAttributeurIds();
  return lignes.map(l => {
    const { e, aVerifier } = elementDeBase(ids, l.Name, tr.fr(l.Name, { onglets: ['Reactions'], id: l['Internal ID'] }), { suffixe: l['Internal ID'] });
    e.n = nombre(l['#']);
    e.image = l.Image;
    e.sources = sources(l.Source);
    if (l['Source Notes']) e.notes_source = l['Source Notes'];
    e.v = l['Version Added'] || undefined;
    return finaliser(e, aVerifier);
  });
}

function vacances(lignes, { tr, villageois }) {
  const ids = creerAttributeurIds();
  return lignes.map(l => {
    const v = villageois.get(l.Filename);
    const fr = tr.fr(l.Name, { onglets: ['Villagers', 'Special NPCs'] });
    const { e, aVerifier } = elementDeBase(ids, l.Name, fr, { suffixe: l.Filename });
    e.image = v ? v['Icon Image'] : null;
    e.demande = l.Request;
    e.bulle = l['Thought bubble'];
    e.chanson = l.Song;
    e.meubles = String(l['Furniture Name List'] || '').split(';').filter(Boolean);
    e.ext = 'hhp';
    return finaliser(e, aVerifier);
  });
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

async function main() {
  const maj = process.argv.includes('--maj');
  for (const s of Object.values(SOURCES)) {
    if (maj || !fs.existsSync(s.fichier)) {
      console.log('Téléchargement de', s.url);
      await telecharger(s.url, s.fichier);
    }
  }
  console.log('Lecture des tableurs…');
  const t = await lireClasseurAvecCache(SOURCES.tableur.fichier);
  const tr = preparerTraductions(await lireClasseurAvecCache(SOURCES.traductions.fichier));
  const sources = creerTraducteurSources(tr);
  const pnj = en => majuscule(tr.fr(en, { onglets: ['Special NPCs'] }) || en);

  const MEUBLES = [['Housewares', 'Mobilier'], ['Miscellaneous', 'Divers'], ['Wall-mounted', 'Objets muraux'], ['Ceiling Decor', 'Plafonniers'], ['Interior Structures', 'Structures intérieures']];
  const VETEMENTS = [['Tops', 'Hauts'], ['Bottoms', 'Bas'], ['Dress-Up', 'Tenues'], ['Headwear', 'Couvre-chefs'], ['Accessories', 'Accessoires'], ['Socks', 'Chaussettes'], ['Shoes', 'Chaussures'], ['Bags', 'Sacs'], ['Umbrellas', 'Parapluies'], ['Clothing Other', 'Autres']];
  const ONGLETS_VETEMENTS_TRAD = ['Tops', 'Bottoms', 'Dress-Up', 'Caps', 'Helmets', 'Accessories', 'Socks', 'Shoes', 'Bags', 'Handbags', 'Umbrellas', 'Wetsuits'];
  const sousDe = liste => Object.fromEntries(liste);
  const villageois = new Map(t.Villagers.map(v => [v.Filename, v]));

  const cats = {};
  cats.insectes = creatures(t.Insects, { tr, onglet: 'Bugs', type: 'insectes', pnj: pnj('C.J.') });
  cats.poissons = creatures(t.Fish, { tr, onglet: 'Fish', type: 'poissons', pnj: pnj('Flick') });
  cats['creatures-marines'] = creatures(t['Sea Creatures'], { tr, onglet: 'Sea Creatures', type: 'mer' });
  cats.fossiles = fossiles(t.Fossils, { tr, sources });
  cats.art = art(t.Artwork, { tr, sources });
  cats.meubles = objets(MEUBLES.map(([o]) => [o, t[o]]), { tr, sources, ongletsTrad: ['Furniture', 'Dishes', 'Event Items', 'Etc'], sousCategories: sousDe(MEUBLES) });
  cats['papiers-peints'] = objets([['Wallpaper', t.Wallpaper]], { tr, sources, ongletsTrad: ['Wallpaper'] });
  cats.sols = objets([['Floors', t.Floors]], { tr, sources, ongletsTrad: ['Floors'] });
  cats.tapis = objets([['Rugs', t.Rugs]], { tr, sources, ongletsTrad: ['Rugs'] });
  cats.vetements = objets(VETEMENTS.map(([o]) => [o, t[o]]), { tr, sources, ongletsTrad: ONGLETS_VETEMENTS_TRAD, champImage: ['Closet Image', 'Storage Image'], sousCategories: sousDe(VETEMENTS) });
  const nomsObjets = new Map([...cats.meubles, ...cats.vetements, ...cats['papiers-peints'], ...cats.sols, ...cats.tapis].map(o => [o.nom.en.toLowerCase(), o.a_verifier?.includes('nom.fr') ? null : o.nom.fr]));
  cats.recettes = recettes(t.Recipes, { tr, sources, nomsObjets });
  cats.kk = objets([['Music', t.Music]], { tr, sources, ongletsTrad: ['Music'], champImage: ['Album Image', 'Framed Image'] });
  cats.gyroides = objets([['Gyroids', t.Gyroids]], { tr, sources, ongletsTrad: ['Gyroids'] });
  cats.photos = objets([['Photos', t.Photos]], { tr, sources, ongletsTrad: ['Photos'] });
  cats.posters = objets([['Posters', t.Posters]], { tr, sources, ongletsTrad: ['Posters'] });
  cats.fleurs = fleurs(t.Plants, { tr, sources });
  cats.outils = objets([['ToolsGoods', t.ToolsGoods]], { tr, sources, ongletsTrad: ['Tools', 'Etc'] });
  cats.clotures = objets([['Fencing', t.Fencing]], { tr, sources, ongletsTrad: ['Fencing'] });
  cats.gestes = gestes(t.Reactions, { tr, sources });
  cats.vacances = vacances(t['Paradise Planning'], { tr, villageois });

  // Les K.K. : on ne garde que les morceaux de K.K. Slider (pas les musiques d'événement cachées).
  cats.kk = cats.kk.filter(k => !/^Hazure/i.test(k.nom.en));

  console.log('');
  for (const [id, liste] of Object.entries(cats)) {
    ecrireJson(`nh/${id}.json`, liste);
    const sansFr = liste.filter(e => e.a_verifier?.includes('nom.fr')).length;
    console.log(`${id.padEnd(18)} ${String(liste.length).padStart(5)} éléments` + (sansFr ? `  (${sansFr} sans nom français)` : ''));
  }
  ecrireJson('nh/_infos.json', {
    genere_le: new Date().toISOString().slice(0, 10),
    sources: [
      { nom: 'Data Spreadsheet for Animal Crossing New Horizons', url: 'https://tinyurl.com/acnh-sheet' },
      { nom: 'ACNH String Translations', url: 'https://docs.google.com/spreadsheets/d/1MMbsvDfu59OY9YBEAfHhFJ6O8vRTllNFgMrX7RBZuyI' },
    ],
  });
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { lireHeures, lirePeriodes, estHhp };
