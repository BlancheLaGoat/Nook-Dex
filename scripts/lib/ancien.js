// Outils communs aux anciens jeux (GameCube, Wild World, City Folk, New Leaf).
// Source principale : les tables « Cargo » de Nookipedia (même format pour tous les jeux).
// Les noms français viennent des tableurs communautaires de chaque jeu ou des tables de traductions.
const crypto = require('crypto');
const { slug, majuscule, creerAttributeurIds } = require('./outils');
const { lireHeures } = require('../nh');

// ---------------------------------------------------------------------------
// Images : Nookipedia (MediaWiki) range un fichier selon l'empreinte MD5 de son nom.
// ---------------------------------------------------------------------------
function imageWiki(fichier) {
  if (!fichier) return null;
  if (/^https?:\/\//.test(fichier)) return fichier;
  let n = String(fichier).trim().replace(/ /g, '_');
  n = n.charAt(0).toUpperCase() + n.slice(1);
  const h = crypto.createHash('md5').update(n).digest('hex');
  return `https://dodo.ac/np/images/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(n).replace(/%2C/g, ',')}`;
}

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------
const LIEUX = {
  'River': 'Rivière',
  'River pool': 'Bassin de rivière',
  'River Pool': 'Bassin de rivière',
  'River (mouth)': 'Embouchure',
  'Waterfall': 'Cascade',
  'Pond': 'Étang',
  'Lake': 'Lac',
  'Sea': 'Mer',
  'Sea (raining)': 'Mer (quand il pleut)',
  'Sea (raining or snowing)': 'Mer (quand il pleut ou neige)',
  'Tortimer Island': "Île de Tortimer",
  'Animal Island': 'Île des animaux',
  'Flying near flowers': 'Vole près des fleurs',
  'Flying near red and pink flowers': 'Vole près des fleurs rouges et roses',
  'Flying near blue, purple, and black flowers': 'Vole près des fleurs bleues, violettes et noires',
  'On flowers': 'Sur les fleurs',
  'On flowers (raining)': 'Sur les fleurs (quand il pleut)',
  'On white flowers': 'Sur les fleurs blanches',
  'On Hibiscus Bushes (raining)': 'Sur les hibiscus (quand il pleut)',
  'Flying': 'En vol',
  'Flying around trees': 'Vole autour des arbres',
  'Flying around non-palm trees': 'Vole autour des arbres (sauf cocotiers)',
  'Flying near water': "Vole près de l'eau",
  'Flying near freshwater': "Vole près de l'eau douce",
  'Near freshwater': "Près de l'eau douce",
  'Flying near light sources': 'Vole près des lumières',
  'Near outdoor lights': 'Près des lampadaires',
  'Flying near rafflesia, trash, or rotten turnips/fruit': 'Vole près des rafflésias, des déchets ou des navets et fruits pourris',
  'Flying near rafflesia, trash, or rotten turnips': 'Vole près des rafflésias, des déchets ou des navets pourris',
  'Flying near rafflesia, trash, or spoiled turnips': 'Vole près des rafflésias, des déchets ou des navets pourris',
  'On spoiled turnips/candy (Any weather except rain)': 'Sur les navets pourris ou les bonbons (pas sous la pluie)',
  'On spoiled turnips/candy': 'Sur les navets pourris ou les bonbons',
  'On spoiled turnips': 'Sur les navets pourris',
  'On candy': 'Sur les bonbons',
  'On the ground': 'Au sol',
  'Underground': 'Sous terre',
  'Under rocks': 'Sous les rochers',
  'From hitting rocks': 'En frappant les rochers',
  'On tree stumps': 'Sur les souches',
  'On trees': 'Sur les arbres',
  'In trees': 'Dans les arbres',
  'On trees (any kind)': 'Sur les arbres',
  'On trees (hardwood and cedar)': 'Sur les feuillus et les cèdres',
  'On non-palm trees': 'Sur les arbres (sauf cocotiers)',
  'On palm trees': 'Sur les cocotiers',
  'On fruitless palm trees (not on Animal Island)': "Sur les cocotiers sans fruits (pas sur l'île des animaux)",
  'Shaking trees': 'En secouant les arbres',
  'Shaking trees (hardwood and cedar)': 'En secouant les arbres (feuillus et cèdres)',
  'In bushes': 'Dans les buissons',
  'On rivers and ponds': 'Sur les rivières et les étangs',
  'On the lake': 'Sur le lac',
  'On ponds': 'Sur les étangs',
  'On freshwater': "Sur l'eau douce",
  'On beach': 'Sur la plage',
  'On the beach': 'Sur la plage',
  'Pushing snowballs': 'En poussant les boules de neige',
  'Pushing balls': 'En poussant les ballons',
  'On villagers': 'Sur les habitants',
};

const OMBRES = { Tiny: '1', Small: '2', Medium: '3', Large: '4', 'Very large': '5', Huge: '6', 'Huge (finned)': '6-aileron', Long: 'longue' };

const MOIS_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const nettoyerWiki = s => String(s || '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim();

// ---------------------------------------------------------------------------
// Disponibilité depuis une ligne Cargo (m1…m12, avec août et septembre en deux moitiés)
// ---------------------------------------------------------------------------
const COLONNES = [
  ['m1', 1], ['m2', 2], ['m3', 3], ['m4', 4], ['m5', 5], ['m6', 6], ['m7', 7],
  ['m8_1', 8, 1], ['m8_2', 8, 2], ['m9_1', 9, 1], ['m9_2', 9, 2],
  ['m10', 10], ['m11', 11], ['m12', 12],
];

// coupure = dernier jour de la première moitié du mois (15 en général, 14 dans City Folk).
function periodesCargo(l, coupure, aVerifier) {
  const segments = [];
  for (const [col, mois, moitie] of COLONNES) {
    if (String(l[col]) !== '1') continue;
    let heures = lireHeures(l[`${col}_time`]);
    if (!heures) heures = lireHeures(l.time);
    if (!heures) { aVerifier.add('heures'); heures = [[0, 24]]; }
    segments.push({ mois, moitie, heures });
  }
  // Une moitié de mois seule devient une période avec des jours ; deux moitiés identiques = mois entier.
  const parMois = new Map();
  for (const s of segments) {
    if (!parMois.has(s.mois)) parMois.set(s.mois, []);
    parMois.get(s.mois).push(s);
  }
  const brut = [];
  for (const [mois, liste] of parMois) {
    if (liste.length === 2 && JSON.stringify(liste[0].heures) === JSON.stringify(liste[1].heures)) {
      brut.push({ mois, heures: liste[0].heures });
      continue;
    }
    for (const s of liste) {
      const p = { mois, heures: s.heures };
      if (s.moitie === 1) p.jours = [1, coupure];
      if (s.moitie === 2) p.jours = [coupure + 1, 31];
      brut.push(p);
    }
  }
  // Regroupe les mois qui ont exactement les mêmes horaires (et pas de jours particuliers).
  const groupes = new Map();
  for (const p of brut) {
    const cleP = JSON.stringify([p.heures, p.jours || null]);
    if (!groupes.has(cleP)) groupes.set(cleP, { mois: [], heures: p.heures, ...(p.jours ? { jours: p.jours } : {}) });
    groupes.get(cleP).mois.push(p.mois);
  }
  return [...groupes.values()].map(g => ({ ...g, mois: g.mois.sort((a, b) => a - b) }));
}

const moisDe = periodes => new Set(periodes.flatMap(p => p.mois));

// "Mar - Jun; Sep", "Jun - Sep 15", "Feb 24 - Oct 31", "All year" -> ensemble des mois touchés.
function moisDepuisTexte(texte) {
  const s = String(texte || '').toLowerCase();
  if (!s.trim() || s === '-' || s === 'na') return null;
  if (/all year|year-round|toute/.test(s)) return new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const res = new Set();
  for (const morceau of s.split(/[;,&]|\band\b/)) {
    const m = [...morceau.matchAll(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/g)].map(x => MOIS_EN[x[1]]);
    if (!m.length) continue;
    if (m.length === 1) { res.add(m[0]); continue; }
    for (let x = m[0]; ; x = (x % 12) + 1) { res.add(x); if (x === m[m.length - 1]) break; }
  }
  return res.size ? res : null;
}

function texteMois(ensemble) {
  const l = [...ensemble].sort((a, b) => a - b);
  if (l.length === 12) return "toute l'année";
  return l.map(m => NOMS_MOIS[m - 1]).join(', ');
}

// ---------------------------------------------------------------------------
// Créatures
// ---------------------------------------------------------------------------
/**
 * @param lignes   lignes Cargo (nl_fish, ww_bug, pg_fish…)
 * @param o.frDe   (nomAnglais) -> nom français officiel du jeu, ou null
 * @param o.coupure  dernier jour de la 1re moitié d'août/septembre
 * @param o.controle (ligne) -> { mois: Set, source: "…" } d'une 2e source, pour comparer
 * @param o.prix   (ligne) -> { vente, … }
 * @param o.complement (ligne, element, aVerifier) -> modifications propres au jeu
 */
function creatures(lignes, o) {
  const ids = creerAttributeurIds();
  const res = [];
  for (const l of lignes) {
    if (o.filtre && !o.filtre(l)) continue;
    const aVerifier = new Set();
    const nomEn = l.name;
    const fr = o.frDe(nomEn);
    if (!fr) aVerifier.add('nom.fr');
    const e = {
      id: ids(slug(nomEn), l.number || 'x'),
      nom: { fr: majuscule(fr || nomEn), en: majuscule(nomEn) },
      n: l.number != null ? Number(l.number) : undefined,
      image: imageWiki(l.image_url || l.icon_url || l.image || l.icon),
      espece: slug(o.espece ? o.espece(l) : nomEn),
    };

    const lieux = [l.location, l.location2, l.location3].filter(Boolean).map(nettoyerWiki);
    const textes = lieux.map(x => LIEUX[x] || x);
    if (lieux.some(x => !LIEUX[x])) aVerifier.add('lieu');
    if (lieux.length) { e.lieu = slug(textes[0]); e.lieu_texte = textes.join(' ou '); }

    if (l.shadow_size) {
      e.ombre = OMBRES[l.shadow_size] || l.shadow_size;
      if (!OMBRES[l.shadow_size]) aVerifier.add('ombre');
    }
    if (l.shadow_movement) e.vitesse = l.shadow_movement;

    const conditions = [];
    const meteo = [l.weather, l.weather2].filter(Boolean).join(' ');
    const tout = `${lieux.join(' ')} ${meteo}`;
    if (/raining or snowing/i.test(tout)) conditions.push('pluie-neige');
    else if (/rain only|\(raining\)/i.test(tout)) conditions.push('pluie');
    else if (/any except rain/i.test(meteo) && !/On trees: Any weather/i.test(meteo)) conditions.push('sans-pluie');
    if (conditions.length) e.conditions = conditions;

    e.dispo = { tous: periodesCargo(l, o.coupure, aVerifier) };
    if (o.ajusterPeriodes) e.dispo.tous = o.ajusterPeriodes(l, e.dispo.tous);
    if (!e.dispo.tous.length) aVerifier.add('mois');

    // Comparaison avec une 2e source : si elles ne sont pas d'accord, on le signale.
    if (o.controle) {
      const c = o.controle(l);
      if (c && c.mois) {
        const a = moisDe(e.dispo.tous);
        const differents = a.size !== c.mois.size || [...a].some(m => !c.mois.has(m));
        if (differents) {
          aVerifier.add('mois');
          e.notes = [...(e.notes || []), `Les sources ne sont pas d'accord sur les mois. Nookipedia : ${texteMois(a)}. ${c.source} : ${texteMois(c.mois)}.`];
        }
      }
    }

    e.prix = o.prix ? o.prix(l) : { vente: l.sell != null ? Number(l.sell) : null };
    e.musee = true;
    if (o.complement) o.complement(l, e, aVerifier);
    if (aVerifier.size) e.a_verifier = [...aVerifier].sort();
    res.push(e);
  }
  return res.sort((a, b) => (a.n ?? 999) - (b.n ?? 999));
}

// ---------------------------------------------------------------------------
// Objets (meubles, vêtements, gyroïdes…)
// ---------------------------------------------------------------------------
const SOURCES_FR = {
  "Nook's Cranny": 'Boutique Nook',
  "Nookington's": 'Nookington',
  "Nook 'n' Go": "Nook'n'Go",
  'Nook Homes': 'Nook Homes',
  'Villagers': 'Habitants',
  'Villager': 'Habitants',
  'Balloon': 'Ballons',
  'Balloons': 'Ballons',
  'Fortune cookie': 'Biscuit chinois',
  'Fossil': 'Fossile',
  'Dig spot': 'Trou à creuser',
  'Lost and found': 'Objets trouvés',
  'Lottery': 'Loterie',
  'Mail': 'Courrier',
  'Event': 'Événement',
  'Fishing Tourney': 'Tournoi de pêche',
  'Bug-Off': 'Chasse aux insectes',
  'Island': 'Île',
  'Default': 'Par défaut',
  'Nintendo': 'Distribution Nintendo',
};

function sourcesDe(l) {
  const res = [];
  for (const k of ['availability1', 'availability2', 'availability3', 'availability4', 'availability_other',
    'availability_pg', 'availability_pg_2', 'availability_pg_3', 'availability_pg_4', 'availability_pg_other']) {
    if (!l[k]) continue;
    for (const s of String(l[k]).split(/;|<br\s*\/?>/i).map(x => nettoyerWiki(x)).filter(Boolean)) {
      res.push(SOURCES_FR[s] || s);
    }
  }
  return [...new Set(res)];
}

/**
 * @param o.frDe     (ligne) -> nom français ou null
 * @param o.nomEn    (ligne) -> nom anglais (par défaut en_name || name)
 * @param o.image    (ligne) -> nom de fichier ou url
 * @param o.sous     (ligne) -> sous-catégorie (texte)
 * @param o.complement (ligne, element, aVerifier)
 */
function objets(lignes, o) {
  const ids = creerAttributeurIds();
  const vus = new Set();
  const res = [];
  for (const l of lignes) {
    if (o.filtre && !o.filtre(l)) continue;
    const nomEn = String((o.nomEn ? o.nomEn(l) : l.en_name || l.name) || '').replace(/}$/, '').trim();
    if (!nomEn) continue;
    // Certaines tables listent un objet une fois par variante : on n'en garde qu'un.
    const cleUnique = (o.cle ? o.cle(l) : nomEn).toLowerCase();
    if (vus.has(cleUnique)) continue;
    vus.add(cleUnique);
    const aVerifier = new Set();
    const fr = o.frDe(l, nomEn);
    // Pour les musiques de K.K., le nom français est souvent le même qu'en anglais.
    if (!fr && !o.nomEnParDefaut) aVerifier.add('nom.fr');
    const e = {
      id: ids(slug(nomEn), slug(l.identifier || l.catalog_num || 'x')),
      nom: { fr: majuscule(fr || nomEn), en: majuscule(nomEn) },
      image: imageWiki(o.image ? o.image(l) : (l.image_url || l.image || l.texture)),
    };
    const sous = o.sous ? o.sous(l) : null;
    if (sous) e.sous = sous;
    const nombre = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
    const achat = nombre(l.buy ?? l.buy1_price ?? l.buy_price);
    const monnaie = l.buy_currency || l.buy1_currency || 'Bells';
    e.prix = { achat: achat > 0 && monnaie === 'Bells' ? achat : null, vente: nombre(l.sell ?? l.sell_price) };
    const sources = sourcesDe(l);
    if (sources.length) e.sources = sources;
    if (o.complement) o.complement(l, e, aVerifier);
    if (aVerifier.size) e.a_verifier = [...aVerifier].sort();
    res.push(e);
  }
  return res;
}

// Dictionnaire anglais -> français à partir d'une table *_language_name de Nookipedia.
function dicoLangue(lignes) {
  const m = new Map();
  for (const x of lignes) {
    if (!x.fr_name) continue;
    for (const k of [x.identifier, x.en_name, x.engb_name]) {
      if (k) { const c = String(k).replace(/}$/, '').toLowerCase().trim(); if (!m.has(c)) m.set(c, x.fr_name); }
    }
  }
  return m;
}

// Dictionnaire anglais -> français à partir d'un onglet de tableur (colonnes au choix).
function dicoTableur(lignes, colEn, colsFr) {
  const m = new Map();
  for (const x of lignes || []) {
    const en = x[colEn];
    const fr = colsFr.map(c => x[c]).find(v => v && v !== '-');
    if (en && fr) m.set(String(en).toLowerCase().trim(), String(fr).trim());
  }
  return m;
}

module.exports = { imageWiki, creatures, objets, dicoLangue, dicoTableur, periodesCargo, moisDepuisTexte, nettoyerWiki, SOURCES_FR, LIEUX };

// Écrit toutes les catégories d'un jeu dans data/<jeu>/ et affiche un résumé.
function ecrireJeu(jeu, categories, sources) {
  const { ecrireJson } = require('./outils');
  console.log('');
  for (const [id, liste] of Object.entries(categories)) {
    ecrireJson(`${jeu}/${id}.json`, liste);
    const sansFr = liste.filter(e => e.a_verifier && e.a_verifier.includes('nom.fr')).length;
    const autres = liste.filter(e => e.a_verifier && e.a_verifier.some(a => a !== 'nom.fr')).length;
    console.log(`${id.padEnd(18)} ${String(liste.length).padStart(5)} éléments`
      + (sansFr ? `  · ${sansFr} sans nom français` : '') + (autres ? `  · ${autres} autres à vérifier` : ''));
  }
  ecrireJson(`${jeu}/_infos.json`, { genere_le: new Date().toISOString().slice(0, 10), sources });
}

module.exports.ecrireJeu = ecrireJeu;

// Les groupes de fossiles (« Ankylosaure ») ne sont pas des objets du jeu : on déduit leur nom
// français des pièces elles-mêmes (« Crâne d'ankylosaure », « Queue d'ankylosaure » -> « Ankylosaure »).
function nommerGroupesFossiles(fossiles) {
  const parGroupe = new Map();
  for (const f of fossiles) if (f.groupe) {
    if (!parGroupe.has(f.groupe.id)) parGroupe.set(f.groupe.id, []);
    parGroupe.get(f.groupe.id).push(f);
  }
  for (const pieces of parGroupe.values()) {
    if (!pieces.some(p => p.a_verifier && p.a_verifier.includes('groupe'))) continue;
    const candidats = new Map();
    for (const p of pieces) {
      if (p.a_verifier && p.a_verifier.includes('nom.fr')) continue;
      // « Crâne d'ankylosaure » (New Leaf) ou « Crâne mammouth » (anciens jeux).
      const m = /^\S+(?:\s+\S+)??\s+(?:de |d'|du |des )(.+)$/i.exec(p.nom.fr) || /^\S+\s+(.+)$/.exec(p.nom.fr);
      const c = pieces.length === 1 ? p.nom.fr : (m ? m[1] : null);
      if (c) candidats.set(c.toLowerCase(), (candidats.get(c.toLowerCase()) || 0) + 1);
    }
    const meilleur = [...candidats].sort((a, b) => b[1] - a[1])[0];
    if (!meilleur) continue;
    const nom = meilleur[0].charAt(0).toLocaleUpperCase('fr-FR') + meilleur[0].slice(1);
    for (const p of pieces) {
      p.groupe.fr = nom;
      if (p.a_verifier) {
        p.a_verifier = p.a_verifier.filter(a => a !== 'groupe');
        if (!p.a_verifier.length) delete p.a_verifier;
      }
    }
  }
  return fossiles;
}

module.exports.nommerGroupesFossiles = nommerGroupesFossiles;

// Affine des périodes « au mois » avec des dates exactes (« Feb 24 - Oct 31 ») :
// le début et la fin deviennent des demi-mois précis. Les horaires du mois voisin sont repris.
const DERNIER_JOUR = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function affinerAvecDates(periodes, texte) {
  const re = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})?\s*[-–]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})?/gi;
  const plages = [...String(texte || '').matchAll(re)].map(m => ({
    m1: MOIS_EN[m[1].toLowerCase()], j1: m[2] ? Number(m[2]) : 1,
    m2: MOIS_EN[m[3].toLowerCase()], j2: m[4] ? Number(m[4]) : 31,
  }));
  if (!plages.length) return periodes;
  let res = periodes.map(p => ({ ...p, mois: [...p.mois] }));
  const heuresPour = mois => { const p = res.find(x => x.mois.includes(mois)); return p ? p.heures : null; };
  // Retire un mois de sa période et le remet avec des jours précis.
  const restreindre = (mois, jours, heures) => {
    if (res.some(p => p.jours && p.mois.includes(mois))) return; // déjà précis
    for (const p of res) if (!p.jours) p.mois = p.mois.filter(m => m !== mois);
    res = res.filter(p => p.mois.length);
    res.push({ mois: [mois], heures, jours });
  };
  for (const { m1, j1, m2, j2 } of plages) {
    if (m1 === m2) continue;
    if (j1 > 1) {
      const h = heuresPour(m1) || heuresPour((m1 % 12) + 1);
      if (h) restreindre(m1, [j1, 31], h);
    }
    if (j2 < DERNIER_JOUR[m2 - 1] && j2 < 28) {
      const h = heuresPour(m2) || heuresPour(((m2 + 10) % 12) + 1);
      if (h) restreindre(m2, [1, j2], h);
    }
  }
  return res;
}
module.exports.affinerAvecDates = affinerAvecDates;
