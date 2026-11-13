// Disponibilité des créatures : « est-ce que je peux l'attraper à telle date, telle heure ? »
//
// Dans les données, chaque créature a :
//   dispo: { nord: [ { mois: [5,6,7], heures: [[16, 9]] } ], sud: [...] }
// ou, pour les jeux sans hémisphères :
//   dispo: { tous: [ ... ] }
// Une plage d'heures [16, 9] veut dire « de 16 h à 9 h » (elle passe minuit).
// [0, 24] veut dire « toute la journée ».

export const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function heureDansPlage([debut, fin], heure) {
  if (debut === fin) return true;
  if (debut < fin) return heure >= debut && heure < fin;
  return heure >= debut || heure < fin;
}

export function periodes(element, hemisphere) {
  const d = element && element.dispo;
  if (!d) return null;
  return d[hemisphere] || d.tous || null;
}

// Une période peut ne couvrir qu'une partie du mois : { mois: [8], jours: [16, 31], heures: … }
// (dans les anciens jeux, août et septembre sont coupés en deux).
export function jourDansPeriode(per, jour) {
  return !per.jours || (jour >= per.jours[0] && jour <= per.jours[1]);
}

// true / false, ou null si l'élément n'a pas d'horaires (meuble, fossile…).
export function estDisponible(element, hemisphere, date) {
  const p = periodes(element, hemisphere);
  if (!p) return null;
  const mois = date.getMonth() + 1;
  const jour = date.getDate();
  const heure = date.getHours();
  return p.some(per => per.mois.includes(mois) && jourDansPeriode(per, jour) && per.heures.some(pl => heureDansPlage(pl, heure)));
}

// Le mois n'est-il couvert qu'en partie ? Renvoie par ex. "du 1er au 15" ou null.
export function partieDuMois(element, hemisphere, mois) {
  const p = (periodes(element, hemisphere) || []).filter(per => per.mois.includes(mois));
  if (!p.length || p.some(per => !per.jours)) return null;
  const debut = Math.min(...p.map(per => per.jours[0]));
  const fin = Math.max(...p.map(per => per.jours[1]));
  // Deux moitiés qui se suivent = tout le mois.
  const couvert = new Set();
  for (const per of p) for (let j = per.jours[0]; j <= per.jours[1]; j++) couvert.add(j);
  if (debut === 1 && fin >= 28 && couvert.size >= fin) return null;
  return `du ${debut === 1 ? '1er' : debut} ${fin >= 30 ? 'à la fin du mois' : `au ${fin}`}`;
}

export function moisDisponibles(element, hemisphere) {
  const p = periodes(element, hemisphere);
  const s = new Set();
  if (p) for (const per of p) for (const m of per.mois) s.add(m);
  return s;
}

export function disponibleEnMois(element, hemisphere, mois) {
  return moisDisponibles(element, hemisphere).has(mois);
}

// Heures (0 à 23) où l'élément est disponible pendant un mois donné.
export function heuresDuMois(element, hemisphere, mois) {
  const p = periodes(element, hemisphere) || [];
  const heures = new Set();
  for (const per of p) {
    if (!per.mois.includes(mois)) continue;
    for (let h = 0; h < 24; h++) if (per.heures.some(pl => heureDansPlage(pl, h))) heures.add(h);
  }
  return heures;
}

const moisSuivant = m => (m % 12) + 1;
const moisPrecedent = m => ((m + 10) % 12) + 1;

// Disponible ce mois-ci mais plus le mois prochain : à attraper avant la fin du mois !
export function partBientot(element, hemisphere, mois) {
  const s = moisDisponibles(element, hemisphere);
  return s.size > 0 && s.size < 12 && s.has(mois) && !s.has(moisSuivant(mois));
}

// Disponible ce mois-ci mais pas le mois dernier : nouveauté du mois.
export function arriveCeMois(element, hemisphere, mois) {
  const s = moisDisponibles(element, hemisphere);
  return s.size > 0 && s.size < 12 && s.has(mois) && !s.has(moisPrecedent(mois));
}

export function toujoursDisponible(element, hemisphere) {
  return moisDisponibles(element, hemisphere).size === 12;
}

// [[16, 9]] -> "16 h – 9 h" ; [[0, 24]] -> "Toute la journée"
export function formaterHeures(plages) {
  if (!plages || !plages.length) return '—';
  if (plages.some(([a, b]) => (a === 0 && b === 24) || a === b)) return 'Toute la journée';
  return plages.map(([a, b]) => `${a} h – ${b % 24} h`).join(' et ');
}

// {5,6,7,8,9,10} -> "mai à octobre" ; gère les périodes qui passent par décembre/janvier.
export function formaterMois(ensemble) {
  const s = ensemble instanceof Set ? ensemble : new Set(ensemble);
  if (s.size === 0) return 'Jamais';
  if (s.size === 12) return "Toute l'année";
  // On découpe en suites de mois consécutifs, en commençant après un « trou ».
  let depart = 1;
  while (s.has(depart)) depart = moisSuivant(depart);
  const suites = [];
  let courante = null;
  for (let i = 0, m = depart; i < 12; i++, m = moisSuivant(m)) {
    if (s.has(m)) {
      if (!courante) { courante = [m, m]; suites.push(courante); } else courante[1] = m;
    } else courante = null;
  }
  return suites.map(([a, b]) => (a === b ? NOMS_MOIS[a - 1] : `${NOMS_MOIS[a - 1]} à ${NOMS_MOIS[b - 1]}`)).join(', ');
}
