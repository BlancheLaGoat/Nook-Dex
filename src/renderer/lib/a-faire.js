// « Que faire maintenant ? » : les créatures qui me manquent et que je peux attraper tout de suite,
// avec la chance par tirage (taux réels des fichiers de rareté), le lieu, et quand elles partent.
//
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/a-faire.test.js.
// Aucun chiffre n'est inventé : sans taux pour le jeu ou l'espèce, chance = null (on n'affiche que la disponibilité).
import { estDisponible, periodes, jourDansPeriode, heureDansPlage, NOMS_MOIS } from './dispo.js';
import { tauxMaintenant, maxAnnee } from './rarete.js';

// Présente ce jour-là (mois et moitié de mois), à n'importe quelle heure ? null si l'élément n'a pas de dates.
export function presenteCeJour(element, hemisphere, date) {
  const p = periodes(element, hemisphere);
  if (!p) return null;
  const mois = date.getMonth() + 1;
  const jour = date.getDate();
  return p.some(per => per.mois.includes(mois) && jourDansPeriode(per, jour));
}

const jourPlus = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

// Quand l'espèce part : { jours, revient: { mois, jour } | null }, ou null si elle est là toute l'année.
//   jours = 1 : aujourd'hui est son dernier jour ; jours = 5 : elle n'est plus là dans 5 jours.
//   revient = premier jour où elle est de nouveau là.
export function depart(element, hemisphere, date) {
  if (!presenteCeJour(element, hemisphere, date)) return null;
  for (let i = 1; i <= 366; i++) {
    if (presenteCeJour(element, hemisphere, jourPlus(date, i))) continue;
    for (let k = i + 1; k <= i + 366; k++) {
      const r = jourPlus(date, k);
      if (presenteCeJour(element, hemisphere, r)) return { jours: i, revient: { mois: r.getMonth() + 1, jour: r.getDate() } };
    }
    return { jours: i, revient: null };
  }
  return null;
}

// Heure à laquelle le créneau en cours se termine aujourd'hui (ex. 16 pour « jusqu'à 16 h »),
// ou null si l'espèce est là toute la journée (ou pas là maintenant).
export function finDuCreneau(element, hemisphere, date) {
  const p = periodes(element, hemisphere);
  if (!p) return null;
  const mois = date.getMonth() + 1;
  const jour = date.getDate();
  const heure = date.getHours();
  for (const per of p) {
    if (!per.mois.includes(mois) || !jourDansPeriode(per, jour)) continue;
    for (const pl of per.heures) {
      if (!heureDansPlage(pl, heure)) continue;
      const [debut, fin] = pl;
      if (debut === fin || (debut === 0 && fin === 24)) return null;
      return fin % 24;
    }
  }
  return null;
}

// Chance par tirage maintenant, d'après les taux du jeu :
//   { pourcent, lieu, autres: [{ lieu, pourcent }], pluie } ou null si le jeu n'a pas de taux pour cette espèce.
//   pourcent = meilleur lieu ; pluie = taux s'il pleut pour une espèce qui ne sort que sous la pluie (sinon null).
//   pourcent = 0 et pluie = null : l'espèce a des taux, mais aucun à ce créneau (on n'affiche pas de chiffre).
export function chanceMaintenant(cr, id, date) {
  if (!cr || !maxAnnee(cr, id)) return null;
  const t = tauxMaintenant(cr, id, date);
  const lieux = t.details.filter(d => !d.pluie).map(d => ({ lieu: d.eau_texte || '', pourcent: d.pourcent })).sort((a, b) => b.pourcent - a.pourcent);
  const pluie = t.pourcent > 0 ? null : t.pluie;
  const lieuPluie = pluie ? (t.details.find(d => d.pluie && d.pourcent === pluie) || {}).eau_texte || '' : '';
  return {
    pourcent: t.pourcent,
    lieu: lieux.length ? lieux[0].lieu : lieuPluie,
    autres: lieux.slice(1),
    pluie,
  };
}

// Nombre moyen de tirages pour tomber dessus : 1 / probabilité (25 % -> 4). null si pas de chance connue.
export const tiragesMoyens = pourcent => (pourcent > 0 ? Math.max(1, Math.round(100 / pourcent)) : null);

// Ce qu'on compte pour « environ N … » selon la catégorie.
export const UNITE_TIRAGE = { poissons: 'ombres', 'creatures-marines': 'ombres', insectes: 'insectes' };

// Valeur servant au tri : la chance du moment (ou s'il pleut), -1 si aucune chance connue.
const chanceTri = l => (l.chance ? (l.chance.pourcent || l.chance.pluie || -1) : -1);

// Liste « Que faire maintenant ? ».
//   categories : [{ cat, elements, cr }]   (cr = rareté de la catégorie, ou null)
//   options : { hemisphere, date, extensions, etatDe(categorie, id), manque: 'obtenu' | 'musee', ordre: 'faciles' | 'rares' }
// Renvoie [{ cat, e, chance, tirages, depart, finCreneau }], disponibles maintenant et pas encore obtenus
// (ou pas encore au musée). Tri : les espèces avec une chance d'abord (plus faciles ou plus rares d'abord),
// puis celles sans chiffre, par nom.
export function listeAFaire(categories, { hemisphere, date, extensions = [], etatDe, manque = 'obtenu', ordre = 'faciles' }) {
  const lignes = [];
  for (const { cat, elements, cr } of categories) {
    for (const e of elements) {
      if (e.ext && !extensions.includes(e.ext)) continue;
      const st = etatDe(cat.id, e.id) || {};
      if (manque === 'musee' ? st.musee : st.obtenu) continue;
      if (estDisponible(e, hemisphere, date) !== true) continue;
      const chance = chanceMaintenant(cr, e.id, date);
      lignes.push({
        cat, e, chance,
        tirages: chance ? tiragesMoyens(chance.pourcent || chance.pluie) : null,
        depart: depart(e, hemisphere, date),
        finCreneau: finDuCreneau(e, hemisphere, date),
      });
    }
  }
  const sens = ordre === 'rares' ? -1 : 1;
  return lignes.sort((a, b) => {
    const ca = chanceTri(a), cb = chanceTri(b);
    if ((ca > 0) !== (cb > 0)) return ca > 0 ? -1 : 1;
    if (ca > 0 && ca !== cb) return sens * (cb - ca);
    return a.e.nom.fr.localeCompare(b.e.nom.fr, 'fr');
  });
}

const jourFr = j => (j === 1 ? '1er' : String(j));

// Texte du départ : « part dans 5 jours · n'apparaît plus avant juin », « dernier jour aujourd'hui », « là toute l'année ».
export function texteDepart(d) {
  if (!d) return "là toute l'année";
  const quand = d.jours === 1 ? "dernier jour aujourd'hui" : `part dans ${d.jours} jours`;
  if (!d.revient) return quand;
  const retour = d.revient.jour === 1 ? NOMS_MOIS[d.revient.mois - 1] : `le ${jourFr(d.revient.jour)} ${NOMS_MOIS[d.revient.mois - 1]}`;
  return `${quand} · n'apparaît plus avant ${retour}`;
}
