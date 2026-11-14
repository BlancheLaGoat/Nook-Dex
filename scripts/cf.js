// Génère les données d'Animal Crossing: Let's Go to the City / City Folk (Wii) dans data/cf/.
//
// Sources :
//  - Nookipedia (tables Cargo cf_*) : créatures, fossiles, art, meubles, vêtements…
//  - « Data Spreadsheet for Animal Crossing: City Folk » : noms français (créatures, musiques).
//  - « Fish and Insect Spawn Rates » (City Folk, tiré du code du jeu) : 2e source pour les mois.
//  - Table cf_language_name : noms français des objets.
//
// Dans City Folk, août et septembre sont coupés en deux : du 1er au 14, puis du 15 à la fin.
//
// Utilisation : npm run donnees:cf   (ajouter -- --maj pour tout retélécharger)
const fs = require('fs');
const path = require('path');
const { lireClasseurAvecCache } = require('./lib/xlsx');
const { tableCargo } = require('./lib/cargo');
const { DOSSIER_SOURCES, telecharger, majuscule, slug } = require('./lib/outils');
const { creatures, objets, dicoLangue, ecrireJeu, nommerGroupesFossiles } = require('./lib/ancien');

const TABLEURS = {
  donnees: { fichier: path.join(DOSSIER_SOURCES, 'cf', 'cf.xlsx'), url: 'https://docs.google.com/spreadsheets/d/1gnVVn8JeP4KHAvjxoBC8I8TK4mBcrbzwdpFzTaw20s8/export?format=xlsx' },
  apparitions: { fichier: path.join(DOSSIER_SOURCES, 'spawn', 'cf.xlsx'), url: 'https://docs.google.com/spreadsheets/d/10TjNaIYM7ovXduUfZP_69MezpM0Vc8K9nzljgUrxO48/export?format=xlsx' },
};

const MOIS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

// Feuille des apparitions (tirée du code du jeu) : une colonne par « mois (ou demi-mois) + tranche horaire »,
// par ex. "Aug 1-14\n09pm-04am". Une valeur > 0 = l'espèce peut apparaître à ce moment-là.
// On en déduit directement les périodes de disponibilité : c'est la source la plus fiable pour City Folk.
function heuresDeTranche(texte) {
  const heures = new Set();
  const h = (n, ap) => (Number(n) % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0);
  for (const m of String(texte).matchAll(/(\d{1,2})\s*(am|pm)\s*-\s*(\d{1,2})\s*(am|pm)/gi)) {
    const debut = h(m[1], m[2]);
    const fin = h(m[3], m[4]);
    for (let x = debut; x !== fin; x = (x + 1) % 24) heures.add(x);
  }
  return heures;
}

// {16..23, 0..8} -> [[16, 9]] (plages d'heures, qui peuvent passer minuit)
function plagesDe(heures) {
  if (heures.size >= 24) return [[0, 24]];
  const res = [];
  for (let x = 0; x < 24; x++) {
    if (!heures.has(x) || heures.has((x + 23) % 24)) continue;
    let fin = x;
    while (heures.has((fin + 1) % 24)) fin = (fin + 1) % 24;
    res.push([x, (fin + 1) % 24 || 24]);
  }
  return res.sort((a, b) => a[0] - b[0]);
}

function periodesDesApparitions(lignes) {
  const parNom = new Map();
  for (const l of lignes || []) {
    const nom = String(l.Name || '').toLowerCase();
    if (!nom) continue;
    if (!parNom.has(nom)) parNom.set(nom, new Map());
    const cases = parNom.get(nom);
    for (const [col, val] of Object.entries(l)) {
      const [partieMois, tranche] = String(col).split('\n');
      const mois = MOIS[String(partieMois).slice(0, 3)];
      if (!mois || !tranche || typeof val !== 'number' || val <= 0) continue;
      const j = /(\d+)-(\d+)/.exec(partieMois);
      const cle = mois + '|' + (j ? j[1] + '-' + j[2] : '');
      if (!cases.has(cle)) cases.set(cle, new Set());
      for (const x of heuresDeTranche(tranche)) cases.get(cle).add(x);
    }
  }
  const res = new Map();
  for (const [nom, cases] of parNom) {
    // Deux moitiés de mois identiques = mois entier.
    for (const mois of [8, 9]) {
      const premiere = [...cases.keys()].find(k => k.startsWith(mois + '|1-'));
      const seconde = [...cases.keys()].find(k => k.startsWith(mois + '|15-'));
      const a = premiere && cases.get(premiere);
      const b = seconde && cases.get(seconde);
      if (a && b && a.size === b.size && [...a].every(x => b.has(x))) {
        cases.delete(premiere); cases.delete(seconde);
        cases.set(mois + '|', a);
      }
    }
    const groupes = new Map();
    for (const [cle, heures] of cases) {
      const [mois, jours] = cle.split('|');
      const plages = plagesDe(heures);
      const j = jours ? jours.split('-').map(Number) : null;
      if (j && j[1] >= 30) j[1] = 31;
      const k = JSON.stringify([plages, j]);
      if (!groupes.has(k)) groupes.set(k, { mois: [], heures: plages, ...(j ? { jours: j } : {}) });
      groupes.get(k).mois.push(Number(mois));
    }
    res.set(nom, [...groupes.values()].map(g => ({ ...g, mois: g.mois.sort((a, b) => a - b) })));
  }
  return res;
}

// Images d'animalcrossing-online.com (pages Poissons et Insectes de Let's Go to the City),
// rangées par nom français.
const SITE_ACO = 'https://www.animalcrossing-online.com/let-s-go-to-the-city-wii/';
const ALIAS_SITE = { 'poisson clown': 'poisson-clown', 'p. chirurgien': 'poisson chirurgien', "brocatelle d'or": 'papillon jaune', 'scarab. elephant': 'scarabee elephant' };
const simple = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').trim();
function imagesDuSite(fichier) {
  const m = new Map();
  if (!fs.existsSync(fichier)) return m;
  const html = fs.readFileSync(fichier, 'utf8');
  for (const x of html.matchAll(/<img src="(img\/(?:poissons|insectes)\/[^"]+)" alt="([^"]+?) - Animal Crossing/g)) {
    const cle = simple(x[2]);
    if (!m.has(cle)) m.set(cle, SITE_ACO + encodeURI(x[1]));
  }
  return m;
}
async function pageDuSite(page, fichier, maj) {
  if (!maj && fs.existsSync(fichier)) return;
  for (let essai = 1; essai <= 4; essai++) {
    try { await telecharger(SITE_ACO + page, fichier, 5, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'); return; } catch (e) {
      console.log('  ' + page + ' : essai ' + essai + ' raté (' + e.message + ')');
      await new Promise(r => setTimeout(r, 2000 * essai));
    }
  }
}

// Noms français absents des sources mais confirmés (version européenne du jeu).
const NOMS_FR = { 'miyama stag beetle': 'Cervus' };

const TYPES_VETEMENTS = { Shirts: 'Hauts', Tops: 'Hauts', Hats: 'Chapeaux', Helmets: 'Casques', Accessories: 'Accessoires', Umbrellas: 'Parapluies' };

async function main() {
  const maj = process.argv.includes('--maj');
  for (const s of Object.values(TABLEURS)) if (maj || !fs.existsSync(s.fichier)) { console.log('Téléchargement de', s.url); await telecharger(s.url, s.fichier); }
  const d = await lireClasseurAvecCache(TABLEURS.donnees.fichier);
  const sp = await lireClasseurAvecCache(TABLEURS.apparitions.fichier);
  const c = async n => tableCargo(n, { maj });

  const langue = dicoLangue(await c('cf_language_name'));
  const frObjet = nom => langue.get(String(nom).toLowerCase()) || null;

  const parNom = onglet => new Map((d[onglet] || []).map(x => [String(x.Name).toLowerCase(), x]));
  const periodesPoissons = periodesDesApparitions([...(sp.River || []), ...(sp.Sea || [])]);
  const periodesInsectes = periodesDesApparitions(sp.Insects);
  await pageDuSite('poissons.php', path.join(DOSSIER_SOURCES, 'aco', 'cf-poissons.html'), maj);
  await pageDuSite('insectes.php', path.join(DOSSIER_SOURCES, 'aco', 'cf-insectes.html'), maj);
  const imagesSite = new Map([
    ...imagesDuSite(path.join(DOSSIER_SOURCES, 'aco', 'cf-poissons.html')),
    ...imagesDuSite(path.join(DOSSIER_SOURCES, 'aco', 'cf-insectes.html')),
  ]);

  const optionsCreatures = (onglet, apparitions) => {
    const tab = parNom(onglet);
    return {
      coupure: 14,
      frDe: nom => {
        if (NOMS_FR[nom.toLowerCase()]) return NOMS_FR[nom.toLowerCase()];
        const x = tab.get(nom.toLowerCase());
        return (x && (x['Name (French EU)'] || x['Name (French NA)'])) || frObjet(nom);
      },
      // Mois, demi-mois et heures tirés du code du jeu quand l'espèce y figure (sinon : Nookipedia).
      ajusterPeriodes: (l, periodes) => apparitions.get(String(l.name).toLowerCase()) || periodes,
      complement: (l, e) => {
        const cle = simple(e.nom.fr);
        const img = imagesSite.get(simple(ALIAS_SITE[cle] || cle));
        if (img) e.image = img;
        if (apparitions.has(String(l.name).toLowerCase())) e.notes = [...(e.notes || []), "Mois et heures tirés du code du jeu (taux d'apparition)."];
      },
    };
  };

  const cats = {};
  cats.insectes = creatures(await c('cf_bug'), optionsCreatures('Bugs', periodesInsectes));
  cats.poissons = creatures(await c('cf_fish'), optionsCreatures('Fish', periodesPoissons));

  const fossilesTableur = parNom('Fossils');
  cats.fossiles = nommerGroupesFossiles(objets(await c('cf_fossil'), {
    nomEn: l => l.name,
    frDe: (l, nom) => { const x = fossilesTableur.get(nom.toLowerCase()); return (x && x['Name (French EU)']) || frObjet(nom); },
    complement: (l, e, av) => {
      if (l.fossil_group) {
        const fr = frObjet(l.fossil_group);
        e.groupe = { id: slug(l.fossil_group), fr: majuscule(fr || l.fossil_group), en: l.fossil_group };
        if (!fr) av.add('groupe');
      }
      e.musee = true;
    },
  }));

  // Art : dans City Folk, Rounard peut vendre des faux (pas d'image de faux disponible).
  cats.art = objets(await c('cf_art'), {
    nomEn: l => l.name,
    frDe: (l, nom) => frObjet(nom),
    complement: (l, e) => {
      e.sous = /statue/i.test(l.name) ? 'Statue' : 'Tableau';
      e.faux = l.has_fake === '1' ? { image: null } : null;
      if (/always be a forgery/i.test(l.authenticity || '')) e.notes = ['Chez Rounard, cette œuvre est toujours un faux. La vraie s\'obtient ailleurs (Boutique Nook, habitants…).'];
      else if (l.has_fake === '1') e.notes = ['Rounard peut vendre un faux de cette œuvre.'];
      e.prix = { achat: l.buy_price ? Number(l.buy_price) : null, vente: l.sell ? Number(l.sell) : null };
      e.musee = true;
    },
  });

  cats.meubles = objets(await c('cf_furniture'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier) });
  const interieur = await c('cf_interior');
  cats['papiers-peints'] = objets(interieur.filter(l => l.category === 'Wallpaper'), { frDe: (l, nom) => frObjet(nom) });
  cats.sols = objets(interieur.filter(l => l.category === 'Carpet'), { frDe: (l, nom) => frObjet(nom) });
  cats.vetements = objets(await c('cf_clothing'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier), sous: l => TYPES_VETEMENTS[l.type] || l.type });

  const musiques = parNom('Music');
  cats.kk = objets((await c('song')).filter(s => s.cf === '1'), {
    nomEn: l => l.name,
    nomEnParDefaut: true,
    frDe: (l, nom) => { const x = musiques.get(nom.toLowerCase()); return (x && (x['Name (French EU)'] || x['Name (French NA)'])) || frObjet(nom); },
    // Le tableur n'a qu'une icône générique : on prend la pochette de l'album (la même dans tous les jeux).
    image: l => l.image_url,
  });

  cats.gyroides = objets(await c('cf_gyroid'), { frDe: (l, nom) => frObjet(nom) });
  cats.outils = objets((await c('cf_tool')).filter(l => l.type !== 'Umbrella'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier) });
  // Papeterie : table Nookipedia cf_stationery ; noms français de l'onglet Stationery du tableur, sinon des traductions du jeu.
  const papeterieTableur = parNom('Stationery');
  cats.papeterie = objets(await c('cf_stationery'), {
    frDe: (l, nom) => { const x = papeterieTableur.get(nom.toLowerCase()); return (x && x['Name (French EU)']) || frObjet(nom) || frObjet(l.identifier); },
  });

  ecrireJeu('cf', cats, [
    { nom: 'Nookipedia', url: 'https://nookipedia.com' },
    { nom: 'Data Spreadsheet for Animal Crossing: City Folk', url: 'https://nookipedia.com/wiki/Community:ACCF_Spreadsheet' },
    { nom: 'Fish and Insect Spawn Rates (City Folk)', url: 'https://docs.google.com/spreadsheets/d/10TjNaIYM7ovXduUfZP_69MezpM0Vc8K9nzljgUrxO48' },
  ]);
}

main().catch(err => { console.error(err); process.exit(1); });
