// Calendrier des événements et anniversaires de chaque jeu -> data/<jeu>/evenements.json
//
// Format d'un événement :
//   { id, nom: { fr, en }, type: "evenement" | "saison" | "anniversaire",
//     fixe: [mois, jour]                      -> même date chaque année (anniversaires, Halloween…)
//     dates: { tous|nord|sud: { "2026": [["2026-01-17", "2026-01-17"], …] } }  -> dates calculées année par année
//     mois: [6, 7, 8, 9]                      -> a lieu dans ces mois, jour inconnu
//     regle: "3e samedi de janvier", image, notes: [], a_verifier: [] }
//
// Sources : onglets « Seasons and Events » (NH), « Events » (NL, CF, WW, GC) et « Villagers » des tableurs
// communautaires. Les dates qui changent chaque année sont calculées ici de ANNEE_DEBUT à ANNEE_FIN.
const path = require('path');
const { lireClasseurAvecCache } = require('./lib/xlsx');
const { DOSSIER_SOURCES, slug, majuscule, ecrireJson, creerAttributeurIds } = require('./lib/outils');

const ANNEE_DEBUT = 2024;
const ANNEE_FIN = 2040;
const ANNEES = Array.from({ length: ANNEE_FIN - ANNEE_DEBUT + 1 }, (_, i) => ANNEE_DEBUT + i);

const MOIS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const RANGS = { '1st': 1, first: 1, '2nd': 2, second: 2, '3rd': 3, third: 3, '4th': 4, fourth: 4, last: -1 };
const RANGS_FR = { 1: '1er', 2: '2e', 3: '3e', 4: '4e', '-1': 'dernier' };
// « de avril » -> « d'avril », « de Alice » -> « d'Alice »
const de = mot => (/^[aeiouyàâéèêîôûAEIOUYÉÈÊ]/.test(String(mot)) ? `d'${mot}` : `de ${mot}`);

// ---------------------------------------------------------------------------
// Petits calculs de dates
// ---------------------------------------------------------------------------
const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
const dernierJour = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const plusJours = (a, m, j, n) => { const d = new Date(Date.UTC(a, m - 1, j + n)); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };

// n-ième jour de la semaine d'un mois (rang -1 = le dernier)
function nieme(a, m, jourSemaine, rang) {
  if (rang === -1) {
    for (let j = dernierJour(a, m); j > 0; j--) if (new Date(Date.UTC(a, m - 1, j)).getUTCDay() === jourSemaine) return j;
  }
  let n = 0;
  for (let j = 1; j <= dernierJour(a, m); j++) {
    if (new Date(Date.UTC(a, m - 1, j)).getUTCDay() === jourSemaine && ++n === rang) return j;
  }
  return null;
}
const tousLes = (a, m, jourSemaine) => Array.from({ length: dernierJour(a, m) }, (_, i) => i + 1).filter(j => new Date(Date.UTC(a, m - 1, j)).getUTCDay() === jourSemaine);

// Dimanche de Pâques (calcul grégorien de Meeus/Jones/Butcher)
function paques(a) {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4;
  const g = Math.floor((c + 8) / 25), h = Math.floor((c - g + 1) / 3), i = (19 * b + c - e - h + 15) % 30;
  const k = Math.floor(d / 4), l = (32 + 2 * f + 2 * k - i - (d % 4)) % 7;
  const m = Math.floor((b + 11 * i + 22 * l) / 451);
  return [Math.floor((i + l - 7 * m + 114) / 31), ((i + l - 7 * m + 114) % 31) + 1];
}

// Pleine lune la plus proche d'une date (calcul approché à ±1 jour, suffisant pour un calendrier de jeu).
function pleineLuneProche(a, m, j) {
  const reference = Date.UTC(2000, 0, 21, 4, 40); // pleine lune du 21 janvier 2000
  const lunaison = 29.530588853 * 86400000;
  const cible = Date.UTC(a, m - 1, j);
  const n = Math.round((cible - reference) / lunaison);
  const d = new Date(reference + n * lunaison);
  return [d.getUTCMonth() + 1, d.getUTCDate()];
}

// ---------------------------------------------------------------------------
// Lecture des règles écrites en anglais dans les tableurs
// ---------------------------------------------------------------------------
const moisDe = t => MOIS[String(t).slice(0, 3).toLowerCase()];

/**
 * Transforme une règle (« 3rd Saturday in January », « 2021-02-14 », « Every Sunday in August »…)
 * en { fixe } ou { calcul(annee) -> [[debutISO, finISO]] } ou { mois } ou null (inconnu).
 */
function lireRegle(texte, nomEn) {
  const t = String(texte || '').trim();
  const nom = String(nomEn || '').toLowerCase();

  // Dates qui dépendent de Pâques ou de la lune : reconnues par le nom de l'événement.
  if (/bunny day/.test(nom)) return { calcul: a => { const [m, j] = paques(a); return [[iso(a, m, j), iso(a, m, j)]]; }, regle: 'dimanche de Pâques' };
  if (/festivale/.test(nom)) return { calcul: a => { const [m, j] = paques(a); const [a2, m2, j2] = plusJours(a, m, j, -47); return [[iso(a2, m2, j2), iso(a2, m2, j2)]]; }, regle: 'Mardi gras (47 jours avant Pâques)' };
  if (/autumn moon|harvest moon/.test(nom)) return { calcul: a => { const [m, j] = pleineLuneProche(a, 9, 22); return [[iso(a, m, j), iso(a, m, j)]]; }, regle: "nuit de pleine lune proche de l'équinoxe d'automne", approx: true };

  if (!t || t === '-' || /player's set|weekly slot|^varies$/i.test(t)) return null;

  // « 2021-02-14 » : seule la date compte (l'année n'est qu'un exemple)
  let x = /^\d{4}-(\d{2})-(\d{2})$/.exec(t);
  if (x) return { fixe: [Number(x[1]), Number(x[2])] };
  // « January 1 », « December 24 »
  x = /^([A-Za-z]+)\s+(\d{1,2})$/.exec(t);
  if (x && moisDe(x[1])) return { fixe: [moisDe(x[1]), Number(x[2])] };
  // « April 5-7 »
  x = /^([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})$/.exec(t);
  if (x && moisDe(x[1])) { const m = moisDe(x[1]); return { calcul: a => [[iso(a, m, Number(x[2])), iso(a, m, Number(x[3]))]], regle: `du ${x[2]} au ${x[3]} ${NOMS_MOIS[m - 1]}` }; }
  // « Every day July 25 - August 31 »
  x = /every day\s+([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s+(\d{1,2})/i.exec(t);
  if (x) return { calcul: a => [[iso(a, moisDe(x[1]), Number(x[2])), iso(a, moisDe(x[3]), Number(x[4]))]], regle: `tous les jours du ${x[2]} ${NOMS_MOIS[moisDe(x[1]) - 1]} au ${x[4]} ${NOMS_MOIS[moisDe(x[3]) - 1]}` };
  // Équinoxes
  if (/spring equinox/i.test(t)) return { calcul: a => [[iso(a, 3, 20), iso(a, 3, 20)]], regle: 'équinoxe de printemps (20 ou 21 mars)', approx: true };
  if (/autumn equinox/i.test(t)) return { calcul: a => [[iso(a, 9, 22 + (a % 4 === 3 ? 1 : 0)), iso(a, 9, 22 + (a % 4 === 3 ? 1 : 0))]], regle: "équinoxe d'automne (22 ou 23 septembre)", approx: true };
  // « Last Day of every Month »
  if (/last day of every month/i.test(t)) return { calcul: a => Array.from({ length: 12 }, (_, i) => iso(a, i + 1, dernierJour(a, i + 1))).map(d => [d, d]), regle: 'le dernier jour de chaque mois' };
  // « Monthly (June - Sep) », « Monthly », « Random day in July »
  x = /monthly\s*\(([A-Za-z]+)\s*-\s*([A-Za-z]+)\)/i.exec(t);
  if (x) { const res = []; for (let m = moisDe(x[1]); ; m = (m % 12) + 1) { res.push(m); if (m === moisDe(x[2])) break; } return { mois: res, regle: 'une fois par mois (jour variable)' }; }
  if (/^monthly$/i.test(t)) return { mois: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], regle: 'une fois par mois (jour variable)' };
  x = /random day in ([A-Za-z]+)/i.exec(t);
  if (x) return { mois: [moisDe(x[1])], regle: `un jour au hasard en ${NOMS_MOIS[moisDe(x[1]) - 1]}` };
  // « 2nd week of February » (dimanche au samedi de la 2e semaine : on retient du 8 au 14)
  x = /(1st|2nd|3rd|4th) week of ([A-Za-z]+)/i.exec(t);
  if (x) { const r = RANGS[x[1].toLowerCase()]; const m = moisDe(x[2]); return { calcul: a => [[iso(a, m, 1 + (r - 1) * 7), iso(a, m, r * 7)]], regle: `la ${RANGS_FR[r] === '1er' ? '1re' : RANGS_FR[r]} semaine ${de(NOMS_MOIS[m - 1])}`, approx: true }; }
  // « Day after 1st Monday in November »
  x = /day after (.+)$/i.exec(t);
  if (x) {
    const base = /harvest festival/i.test(x[1]) ? lireRegle('4th Thursday in November') : lireRegle(x[1]);
    if (base && base.calcul) return { calcul: a => base.calcul(a).map(([d]) => { const [y, m, j] = d.split('-').map(Number); const [a2, m2, j2] = plusJours(y, m, j, 1); return [iso(a2, m2, j2), iso(a2, m2, j2)]; }), regle: `le lendemain du ${base.regle}` };
  }
  // « Every Sunday in August », « Every Saturday of August »
  x = /every (sunday|monday|tuesday|wednesday|thursday|friday|saturday) (?:in|of) ([A-Za-z]+)/i.exec(t);
  if (x) { const js = JOURS[x[1].toLowerCase()]; const m = moisDe(x[2]); return { calcul: a => tousLes(a, m, js).map(j => [iso(a, m, j), iso(a, m, j)]), regle: `chaque ${NOMS_JOURS[js]} ${de(NOMS_MOIS[m - 1])}` }; }
  // « 3rd Saturday in January », « 4th Sunday of February, April, May; 3rd Sunday of November »
  const morceaux = t.split(';').map(s => s.trim()).filter(Boolean);
  const regles = [];
  for (const mo of morceaux) {
    const y = /(1st|2nd|3rd|4th|last|first)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:in|of)\s+(.+)$/i.exec(mo);
    if (!y) return null;
    const liste = y[3].split(/,|and/).map(s => moisDe(s.trim())).filter(Boolean);
    if (!liste.length) return null;
    regles.push({ rang: RANGS[y[1].toLowerCase()], js: JOURS[y[2].toLowerCase()], mois: liste });
  }
  if (!regles.length) return null;
  return {
    calcul: a => regles.flatMap(r => r.mois.map(m => { const j = nieme(a, m, r.js, r.rang); return [iso(a, m, j), iso(a, m, j)]; })),
    regle: regles.map(r => `${RANGS_FR[r.rang]} ${NOMS_JOURS[r.js]} ${de(r.mois.map(m => NOMS_MOIS[m - 1]).join(', '))}`).join(' ; '),
  };
}

// Construit l'événement final à partir d'une règle lue.
function avecDates(base, regle, cleDates = 'tous') {
  if (!regle) return { ...base, a_verifier: [...(base.a_verifier || []), 'date'] };
  const e = { ...base };
  if (regle.fixe) e.fixe = regle.fixe;
  if (regle.mois) e.mois = regle.mois;
  if (regle.calcul) {
    e.dates = { [cleDates]: {} };
    for (const a of ANNEES) e.dates[cleDates][a] = regle.calcul(a);
  }
  if (regle.regle) e.regle = regle.regle;
  if (regle.approx) e.notes = [...(e.notes || []), 'Date calculée de façon approchée (à un jour près).'];
  return e;
}

// « March 9 », « 8/11 », « 2021-03-09 » -> [mois, jour]
function lireAnniversaire(t) {
  const s = String(t || '').trim();
  let x = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (x) return [Number(x[1]), Number(x[2])];
  x = /^\d{4}-(\d{2})-(\d{2})$/.exec(s);
  if (x) return [Number(x[1]), Number(x[2])];
  x = /^([A-Za-z]+)\s+(\d{1,2})/.exec(s);
  if (x && moisDe(x[1])) return [moisDe(x[1]), Number(x[2])];
  return null;
}

function anniversaires(villageois, { nom, nomFr, image, ids }) {
  const res = [];
  for (const v of villageois || []) {
    const date = lireAnniversaire(v.Birthday);
    const en = nom(v);
    if (!date || !en) continue;
    const fr = nomFr(v);
    res.push({
      id: ids(`anniversaire-${slug(en)}`, slug(en)),
      nom: { fr: `Anniversaire ${de(fr || en)}`, en: `${en}'s birthday` },
      personnage: fr || en,
      type: 'anniversaire',
      fixe: date,
      image: image(v) || undefined,
      ...(fr ? {} : { a_verifier: ['nom.fr'] }),
    });
  }
  return res;
}

// ---------------------------------------------------------------------------
// Jeux
// ---------------------------------------------------------------------------
// Saisons de New Horizons : ce sont des repères (pas des objets), on les nomme simplement en français.
const NOMS_SAISONS_NH = {
  spring: 'Printemps', summer: 'Été', fall: 'Automne', winter: 'Hiver',
  aries: 'Bélier', taurus: 'Taureau', gemini: 'Gémeaux', cancer: 'Cancer', leo: 'Lion', virgo: 'Vierge',
  libra: 'Balance', scorpio: 'Scorpion', sagittarius: 'Sagittaire', capricorn: 'Capricorne', aquarius: 'Verseau', pisces: 'Poissons',
  azalea: 'Floraison des azalées', camellia: 'Floraison des camélias', hibiscus: 'Floraison des hibiscus', holly: 'Fruits du houx',
  hydrangea: 'Floraison des hortensias', plumeria: 'Floraison des frangipaniers', 'tea olive': 'Floraison des osmanthes',
  'cherry-blossom petals': 'Saison des pétales de cerisier', 'maple leaves': "Saison des feuilles d'érable", mushrooms: 'Saison des champignons',
  snowflakes: 'Saison des flocons de neige', ornaments: 'Saison des boules de Noël', 'summer shells': "Saison des coquillages d'été",
  'young spring bamboo': 'Saison des pousses de bambou', 'acorns and pine cones': 'Saison des glands et des pommes de pin',
};

async function newHorizons() {
  const t = await lireClasseurAvecCache(path.join(DOSSIER_SOURCES, 'sheet', 'acnh.xlsx'));
  const trad = await lireClasseurAvecCache(path.join(DOSSIER_SOURCES, 'trad', 'trad.xlsx'));
  const frParLabel = new Map((trad['Event Names'] || []).map(x => [x.Id, x.EUfr]));
  const frEvenement = new Map((trad['Event Names'] || []).map(x => [String(x.USen || x.EUen).toLowerCase(), x.EUfr]));
  const nl = await nomsNewLeaf();
  const frVillageois = new Map((trad.Villagers || []).map(x => [x.Id, x.EUfr]));
  const frPnj = new Map((trad['Special NPCs'] || []).map(x => [String(x.USen).toLowerCase(), x.EUfr]));
  const ids = creerAttributeurIds();
  const TYPES = { 'Basegame event': 'evenement', 'Special event': 'evenement', 'Nook Shopping event': 'evenement', 'Calendar season': 'saison', 'Blooming season': 'saison', 'Crafting season': 'saison', 'Zodiac season': 'saison' };
  const res = [];
  const plage = (texte, a) => {
    // « Feb 25 – May 31 », « Jan 17 », « Mar 1 – Mar 2 ; … »
    const out = [];
    for (const morceau of String(texte || '').split(/;|,(?=\s*[A-Z][a-z]{2}\s+\d)/)) {
      const x = /([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:\s*[–-]\s*([A-Za-z]{3})[a-z]*\s+(\d{1,2}))?/.exec(morceau);
      if (!x) continue;
      const m1 = moisDe(x[1]); const j1 = Number(x[2]);
      const m2 = x[3] ? moisDe(x[3]) : m1; const j2 = x[4] ? Number(x[4]) : j1;
      const a2 = m2 < m1 ? a + 1 : a; // une saison qui passe le 31 décembre
      out.push([iso(a, m1, j1), iso(a2, m2, Math.min(j2, dernierJour(a2, m2)))]);
    }
    return out;
  };
  const parNom = new Map();
  for (const ev of t['Seasons and Events'] || []) {
    if (!ev.Name || !TYPES[ev.Type] || /^birthday$/i.test(ev.Name)) continue; // l'anniversaire du joueur n'a pas de date fixe
    // On garde l'événement lui-même, pas ses phases de préparation (« days before », « day after »…).
    if (/((days before|weeks before|day after|shopping))/i.test(ev.Name)) continue;
    const en = ev['Display Name'] || ev.Name;
    const type = TYPES[ev.Type];
    const cle = `${type}|${en}`;
    let e = parNom.get(cle);
    if (!e) {
      let fr = frParLabel.get(ev['Internal Label']) || frEvenement.get(String(en).toLowerCase()) || NOMS_SAISONS_NH[String(en).toLowerCase()];
      let repris = false;
      if (!fr && nl.get(String(en).toLowerCase())) { fr = nl.get(String(en).toLowerCase()); repris = true; }
      // Les tournois de pêche ont un nom par saison : on garde le nom commun.
      if (/^fishing tourney$/i.test(en)) fr = 'Tournoi de pêche';
      e = { id: ids(slug(en), slug(ev.Name)), nom: { fr: majuscule(fr || en), en }, type, dates: { nord: {}, sud: {} } };
      for (const a of ANNEES) { e.dates.nord[a] = []; e.dates.sud[a] = []; }
      if (!fr) e.a_verifier = ['nom.fr'];
      if (repris) { e.a_verifier = ['nom.fr']; e.notes = ['Nom français repris de New Leaf (peut être différent dans New Horizons).']; }
      if (ev['Start Time'] && ev['Start Time'] !== '5:00 AM') e.horaires = `${ev['Start Time']} – ${ev['End Time']}`;
      parNom.set(cle, e);
      res.push(e);
    }
    for (const a of ANNEES) {
      e.dates.nord[a].push(...plage(ev[`${a} NH`], a));
      e.dates.sud[a].push(...plage(ev[`${a} SH`], a));
    }
  }
  res.push(...anniversaires(t.Villagers, { ids, nom: v => v.Name, nomFr: v => frVillageois.get(v.Filename), image: v => v['Icon Image'] }));
  res.push(...anniversaires(t['Special NPCs'], { ids, nom: v => v.Name, nomFr: v => frPnj.get(String(v.Name).toLowerCase()), image: v => v['Icon Image'] }));
  return res;
}

// Noms français des événements de New Leaf (pour reprendre les mêmes dans les jeux plus anciens, « à vérifier »).
let frNewLeaf = null;
async function nomsNewLeaf() {
  if (frNewLeaf) return frNewLeaf;
  const d = await lireClasseurAvecCache(path.join(DOSSIER_SOURCES, 'nl', 'donnees.xlsx'));
  frNewLeaf = new Map((d.Events || []).filter(e => e.Event && e['Name (French EU)']).map(e => [String(e.Event).toLowerCase().replace(/fool's/, "fools'"), e['Name (French EU)']]));
  return frNewLeaf;
}

async function newLeaf() {
  const d = await lireClasseurAvecCache(path.join(DOSSIER_SOURCES, 'nl', 'donnees.xlsx'));
  const ids = creerAttributeurIds();
  const res = [];
  for (const ev of d.Events || []) {
    if (!ev.Event || /^(birthday|town anniversary)$/i.test(ev.Event)) continue;
    const regions = String(ev.Regions || '');
    if (!/EU/.test(regions)) continue; // version européenne uniquement
    const regle = lireRegle(ev['Date (EU)'], ev.Event);
    const e = avecDates({ id: ids(slug(ev.Event), 'x'), nom: { fr: majuscule(ev['Name (French EU)'] || ev.Event), en: ev.Event }, type: 'evenement' }, regle);
    // Contrôle : notre calcul doit retrouver la date 2026 donnée par le tableur.
    const ref = ev['2026 Date (EU)'];
    if (regle && regle.calcul && ref && /^[A-Za-z]+ \d{1,2}$/.test(ref)) {
      const [m, j] = [moisDe(ref.split(' ')[0]), Number(ref.split(' ')[1])];
      if (!e.dates.tous[2026].some(([deb]) => deb === iso(2026, m, j))) {
        e.a_verifier = [...(e.a_verifier || []), 'date'];
        e.notes = [...(e.notes || []), `Le tableur donne le ${j} ${NOMS_MOIS[m - 1]} 2026.`];
      }
    }
    if (!ev['Name (French EU)']) e.a_verifier = [...(e.a_verifier || []), 'nom.fr'];
    res.push(e);
  }
  res.push(...anniversaires(d.Villagers, { ids, nom: v => v.Name, nomFr: v => v['Name (French EU)'], image: v => v.Icon || v.Image }));
  return fusionnerDoublons(res);
}

// Le tableur de New Leaf liste le tournoi de pêche une fois par mois : on regroupe en un seul événement.
function fusionnerDoublons(liste) {
  const parNom = new Map();
  const res = [];
  for (const e of liste) {
    const cle = `${e.type}|${e.nom.en}`;
    const deja = parNom.get(cle);
    if (deja && deja.dates && e.dates) {
      for (const a of ANNEES) deja.dates.tous[a].push(...e.dates.tous[a]);
      deja.regle = [deja.regle, e.regle].filter(Boolean).join(' ; ');
      continue;
    }
    if (!deja) { parNom.set(cle, e); res.push(e); }
  }
  return res;
}

// Derniers recours pour les noms d'événements des anciens jeux (toujours marqués « à vérifier »).
const NOMS_COURANTS = { 'flea market': 'Marché aux puces', "new year's eve": 'Réveillon du nouvel an' };

async function ancienJeu(jeu, fichier, ongletEvenements, { filtre, colonneDate, nomVillageois, imageVillageois, frVillageois }) {
  const d = await lireClasseurAvecCache(path.join(DOSSIER_SOURCES, jeu, fichier));
  const noms = await nomsNewLeaf();
  const trad = await lireClasseurAvecCache(path.join(DOSSIER_SOURCES, 'trad', 'trad.xlsx'));
  const nomsNH = new Map((trad['Event Names'] || []).map(x => [String(x.USen).toLowerCase(), x.EUfr]));
  const ids = creerAttributeurIds();
  const res = [];
  for (const ev of d[ongletEvenements] || []) {
    if (!ev.Event || (filtre && !filtre(ev))) continue;
    const en = String(ev.Event).trim();
    if (/^(birthday|raffle|one day sale)$/i.test(en)) continue;
    const regle = lireRegle(colonneDate(ev), en);
    const fr = noms.get(en.toLowerCase()) || noms.get(en.toLowerCase().replace(/fool's/, "fools'"))
      || nomsNH.get(en.toLowerCase()) || NOMS_COURANTS[en.toLowerCase()];
    const e = avecDates({ id: ids(slug(en), 'x'), nom: { fr: majuscule(fr || en), en }, type: 'evenement' }, regle);
    // Les jeux anciens n'ont pas de noms français d'événements dans les sources : on reprend ceux de New Leaf.
    e.a_verifier = [...(e.a_verifier || []), 'nom.fr'];
    if (fr) e.notes = [...(e.notes || []), "Nom français repris d'un autre jeu (peut être différent dans celui-ci)."];
    res.push(e);
  }
  if (d.Villagers && nomVillageois) {
    res.push(...anniversaires(d.Villagers, { ids, nom: nomVillageois, nomFr: frVillageois, image: imageVillageois }));
  }
  return res;
}

async function main() {
  const jeux = {
    nh: await newHorizons(),
    nl: await newLeaf(),
    cf: await ancienJeu('cf', 'cf.xlsx', 'Events', {
      // Version européenne : on écarte les événements propres au Japon, à la Corée ou à l'Amérique.
      filtre: ev => /EU/.test(String(ev.Regions || '')),
      colonneDate: ev => ev.Date,
      nomVillageois: v => v.Name, frVillageois: v => v['Name (French)'], imageVillageois: v => v.Image,
    }),
    ww: await ancienJeu('ww', 'ww.xlsx', 'Events', {
      colonneDate: ev => ev.Date,
      nomVillageois: v => v.Name, frVillageois: v => v['Name (French)'], imageVillageois: v => v.Image,
    }),
    gc: await ancienJeu('gc', 'gc.xlsx', 'Events (AC)', {
      colonneDate: ev => (ev['Date (Europe)'] && ev['Date (Europe)'] !== '-' ? ev['Date (Europe)'] : ev.Date),
    }),
  };
  for (const [jeu, liste] of Object.entries(jeux)) {
    liste.sort((a, b) => a.type.localeCompare(b.type) || a.nom.fr.localeCompare(b.nom.fr, 'fr'));
    ecrireJson(`${jeu}/evenements.json`, liste);
    const n = t => liste.filter(e => e.type === t).length;
    const sansDate = liste.filter(e => e.a_verifier && e.a_verifier.includes('date')).map(e => e.nom.en);
    console.log(`${jeu} : ${n('evenement')} événements, ${n('saison')} saisons, ${n('anniversaire')} anniversaires` + (sansDate.length ? ` · date à vérifier : ${sansDate.join(', ')}` : ''));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
