// Événements du jeu : quand ont-ils lieu ?
//
// Un événement a l'une de ces formes (voir scripts/evenements.js) :
//   fixe: [mois, jour]                                  -> chaque année à la même date
//   dates: { tous|nord|sud: { "2026": [["2026-01-17", "2026-01-17"], …] } }
//   mois: [6, 7, 8, 9]                                  -> dans ces mois, jour inconnu

const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
const dernierJour = (a, m) => new Date(a, m, 0).getDate();
const estBissextile = a => new Date(a, 1, 29).getDate() === 29;

export function versIso(date) {
  return iso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

// Toutes les périodes [debut, fin] (texte AAAA-MM-JJ) d'un événement qui touchent l'année donnée.
export function periodesAnnee(e, annee, hemisphere = 'nord') {
  if (e.fixe) {
    let [m, j] = e.fixe;
    if (m === 2 && j === 29 && !estBissextile(annee)) j = 28; // né un 29 février : fêté le 28
    return [[iso(annee, m, j), iso(annee, m, j)]];
  }
  if (e.dates) {
    const parAnnee = e.dates[hemisphere] || e.dates.tous || e.dates.nord || {};
    // On prend aussi l'année d'avant : une saison peut commencer en décembre et finir en février.
    return [...(parAnnee[annee - 1] || []), ...(parAnnee[annee] || [])]
      .filter(([deb, fin]) => fin >= iso(annee, 1, 1) && deb <= iso(annee, 12, 31));
  }
  return [];
}

// Les occurrences d'un événement pendant un mois : [{ debut, fin }] (dates texte), ou [] si aucune.
export function occurrencesDuMois(e, annee, mois, hemisphere) {
  const debutMois = iso(annee, mois, 1);
  const finMois = iso(annee, mois, dernierJour(annee, mois));
  return periodesAnnee(e, annee, hemisphere)
    .filter(([deb, fin]) => fin >= debutMois && deb <= finMois)
    .map(([debut, fin]) => ({ debut, fin }));
}

// A-t-il lieu ce mois-ci sans jour précis ? (« une fois par mois, jour variable »)
export function sansJourCeMois(e, mois) {
  return !e.fixe && !e.dates && Array.isArray(e.mois) && e.mois.includes(mois);
}

// L'événement a-t-il lieu ce jour-là ?
export function aLieuLe(e, date, hemisphere) {
  const jour = versIso(date);
  return periodesAnnee(e, date.getFullYear(), hemisphere).some(([deb, fin]) => deb <= jour && jour <= fin);
}

// Prochaines occurrences à partir d'une date, sur un nombre de jours donné.
export function prochains(evenements, depuis, nbJours, hemisphere, filtre = () => true) {
  const debut = versIso(depuis);
  const limite = new Date(depuis.getFullYear(), depuis.getMonth(), depuis.getDate() + nbJours);
  const fin = versIso(limite);
  const res = [];
  for (const e of evenements) {
    if (!filtre(e)) continue;
    const annees = new Set([depuis.getFullYear(), limite.getFullYear()]);
    for (const a of annees) {
      for (const [deb, f] of periodesAnnee(e, a, hemisphere)) {
        if (f >= debut && deb <= fin) res.push({ e, debut: deb < debut ? debut : deb, fin: f, enCours: deb <= debut });
      }
    }
  }
  // Une même occurrence peut apparaître deux fois (année d'avant + année en cours) : on dédoublonne.
  const vus = new Set();
  return res
    .filter(o => { const k = `${o.e.id}|${o.debut}`; if (vus.has(k)) return false; vus.add(k); return true; })
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.e.nom.fr.localeCompare(b.e.nom.fr, 'fr'));
}

// « 2026-01-17 » -> « samedi 17 janvier »
export function formaterJour(texte, { annee = false } = {}) {
  const [a, m, j] = texte.split('-').map(Number);
  return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(annee ? { year: 'numeric' } : {}) });
}

export function formaterPeriode({ debut, fin }) {
  if (debut === fin) return formaterJour(debut);
  const court = t => { const [a, m, j] = t.split('-').map(Number); return new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); };
  return `du ${court(debut)} au ${court(fin)}`;
}
