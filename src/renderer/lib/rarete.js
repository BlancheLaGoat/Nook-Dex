// Rareté : « quelle chance ai-je de tomber sur cette créature à telle date, telle heure ? »
//
// Les données viennent de data/<jeu>/rarete.json (fabriqué par scripts/rarete.js) :
//   categories.poissons = {
//     creneaux: [{ id: "21h-4h", heures: [[21, 4]] }, …],
//     tables: [{ mois: 8, jours: [16, 31] | null, creneau: "21h-4h", eau: "mer", eau_texte: "Mer",
//                especes: { "sea-bass": 87, … }, rien: 40, pluie: { coelacanth: 8 } }, …],
//     transition: { decalage_max: 5, mois: { du: 26, au: 6 }, quinzaine: { du: 11, au: 21 } },
//     rang_ville, facteurs_rang, rang_ville_sauf, pluie_seulement: { coelacanth: { sauf_creneaux } },
//     a_verifier, infos
//   }
// Chaque table est un tirage : pour une eau (rivière, mer…), un mois (ou une moitié de mois)
// et un créneau horaire. « pluie » = espèces ajoutées seulement s'il pleut.
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/rarete.test.js.
import { heureDansPlage } from './dispo.js';

export const SEUILS_DEFAUT = [
  { a_partir_de: 15, etoiles: 1, nom: 'Très courant' },
  { a_partir_de: 8, etoiles: 2, nom: 'Courant' },
  { a_partir_de: 4, etoiles: 3, nom: 'Peu courant' },
  { a_partir_de: 2, etoiles: 4, nom: 'Rare' },
  { a_partir_de: 0, etoiles: 5, nom: 'Très rare' },
];

// Données de rareté d'une catégorie (null si le jeu ou la catégorie n'en a pas).
export function rareteCategorie(rarete, categorie) {
  return (rarete && rarete.categories && rarete.categories[categorie]) || null;
}

const jourDansTable = (t, jour) => !t.jours || (jour >= t.jours[0] && jour <= t.jours[1]);

// Créneau horaire qui contient cette heure (ex. 21 h -> "21h-4h").
export function creneauA(cr, heure) {
  return cr.creneaux.find(c => c.heures.some(pl => heureDansPlage(pl, heure))) || null;
}

// Ce que vaut une espèce dans une liste de tables : { pourcent, pluie, details } ou null si absente.
function lireTables(tables, id) {
  const details = [];
  for (const t of tables) {
    // connecte : taux quand on est connecté à une autre ville (City Folk), null si le jeu n'en a pas.
    if (t.especes[id]) details.push({ eau_texte: t.eau_texte || '', pourcent: t.especes[id], pluie: false, connecte: t.connecte ? (t.connecte[id] || 0) : null });
    else if (t.pluie && t.pluie[id]) details.push({ eau_texte: t.eau_texte || '', pourcent: t.pluie[id], pluie: true });
  }
  return details;
}

// Taux d'une espèce pour un mois, un jour et une heure donnés.
// Renvoie { pourcent, pluie, details: [{ eau_texte, pourcent, pluie }], rien, creneau }.
//   pourcent : meilleur taux parmi les eaux (0 si absente) ; pluie : taux s'il pleut (ou null).
export function tauxA(cr, id, mois, jour, heure) {
  const c = creneauA(cr, heure);
  const tables = c ? cr.tables.filter(t => t.mois === mois && jourDansTable(t, jour) && t.creneau === c.id) : [];
  const details = lireTables(tables, id);
  const normaux = details.filter(d => !d.pluie).map(d => d.pourcent);
  const pluies = details.filter(d => d.pluie).map(d => d.pourcent);
  const connectes = details.filter(d => d.connecte != null).map(d => d.connecte);
  return {
    pourcent: normaux.length ? Math.max(...normaux) : 0,
    pluie: pluies.length ? Math.max(...pluies) : null,
    connecte: connectes.length ? Math.max(...connectes) : null,
    details,
    // « Aucune créature » n'a de sens que s'il n'y a qu'un tirage à ce moment (insectes).
    rien: tables.length === 1 && tables[0].rien != null ? tables[0].rien : null,
    creneau: c ? c.id : null,
  };
}

const moisSuivant = m => (m % 12) + 1;
const moisPrecedent = m => ((m + 10) % 12) + 1;
const memeTaux = (a, b) => a.pourcent === b.pourcent && a.pluie === b.pluie;

// Taux « maintenant », avec la période de transition si le jeu en a une.
// Le jeu change de table avec un décalage (0 à decalage_max jours) tiré au hasard pour chaque
// sauvegarde : on ne peut pas savoir quel jour exact, donc sur toute la fenêtre possible
// (ex. du 26 au 6 du mois suivant) on donne aussi le taux de l'autre table dans « transition » :
//   { type: 'mois' | 'quinzaine', sens: 'suivant' | 'precedent', mois, quinzaine?,
//     du: { mois, jour }, au: { mois, jour }, pourcent, pluie, details, … }
// Au changement de mois, la transition est toujours signalée ; à la quinzaine, seulement si les
// deux tables donnent un taux différent pour cette espèce.
export function tauxMaintenant(cr, id, date) {
  const mois = date.getMonth() + 1;
  const jour = date.getDate();
  const heure = date.getHours();
  const base = tauxA(cr, id, mois, jour, heure);
  const tr = cr.transition;
  if (!tr) return base;
  if (tr.mois && jour >= tr.mois.du) {
    const m = moisSuivant(mois);
    base.transition = { type: 'mois', sens: 'suivant', mois: m, du: { mois, jour: tr.mois.du }, au: { mois: m, jour: tr.mois.au }, ...tauxA(cr, id, m, 1, heure) };
  } else if (tr.mois && jour <= tr.mois.au) {
    const m = moisPrecedent(mois);
    base.transition = { type: 'mois', sens: 'precedent', mois: m, du: { mois: m, jour: tr.mois.du }, au: { mois, jour: tr.mois.au }, ...tauxA(cr, id, m, 28, heure) };
  } else if (tr.quinzaine && jour >= tr.quinzaine.du && jour <= tr.quinzaine.au) {
    const premiere = jour <= 15;
    const autre = tauxA(cr, id, mois, premiere ? 16 : 15, heure);
    if (!memeTaux(autre, base)) {
      base.transition = {
        type: 'quinzaine', sens: premiere ? 'suivant' : 'precedent', mois, quinzaine: premiere ? 2 : 1,
        du: { mois, jour: tr.quinzaine.du }, au: { mois, jour: tr.quinzaine.au }, ...autre,
      };
    }
  }
  return base;
}

// Espèce ajoutée seulement s'il pleut (cœlacanthe du GameCube) : son taux ce mois-ci, quel que soit
// le créneau, et les créneaux où elle n'apparaît jamais. null pour les autres espèces.
export function pluieDuMois(cr, id, mois, jour) {
  const regle = cr.pluie_seulement && cr.pluie_seulement[id];
  if (!regle) return null;
  const valeurs = cr.tables.filter(t => t.mois === mois && jourDansTable(t, jour) && t.pluie && t.pluie[id]).map(t => t.pluie[id]);
  return { pourcent: valeurs.length ? Math.max(...valeurs) : 0, sauf_creneaux: regle.sauf_creneaux || [] };
}

const nombreFr = x => x.toLocaleString('fr-FR');

// Texte de l'info-bulle « rang de la ville », ou null si le jeu (ou l'espèce) n'est pas concerné.
export function texteRangVille(cr, id) {
  if (!cr || !cr.rang_ville || (cr.rang_ville_sauf || []).includes(id)) return null;
  const f = cr.facteurs_rang || [];
  const detail = f.length ? ` (chances multipliées par ${f.map((x, i) => `${nombreFr(x)} au rang ${i}`).join(', ')})` : '';
  return `Pourcentages pour une ville de rang ${cr.rang_ville} ou plus : en dessous, le jeu réduit les chances${detail}.`;
}

// Valeur servant à trier « maintenant » : le taux actuel, ou le taux s'il pleut à défaut.
export const valeurMaintenant = t => (t.pourcent || t.pluie || 0);

// Pourcentage le plus haut de l'espèce sur toute l'année : { max, pluie, moyenne, note } ou null si elle n'est dans aucune table.
// pluie = true si ce maximum n'est atteint que s'il pleut.
// moyenne = moyenne des mois où l'espèce est présente (chaque mois = moyenne de ses tables).
// note = valeur qui sert aux étoiles et au tri : le maximum, sauf pour une espèce qui n'apparaît
// que s'il pleut (cœlacanthe GC) : sa moyenne, pour ne pas la juger sur son meilleur mois.
const cacheMax = new WeakMap();
export function maxAnnee(cr, id) {
  if (!cr) return null;
  if (!cacheMax.has(cr)) {
    const m = new Map();
    const noter = (k, v, pluie) => {
      const actuel = m.get(k);
      if (!actuel || v > actuel.max) m.set(k, { max: v, pluie });
    };
    const parMois = new Map(); // id -> Map(mois -> [valeurs])
    const ajouter = (k, mois, v) => {
      if (!parMois.has(k)) parMois.set(k, new Map());
      const pm = parMois.get(k);
      if (!pm.has(mois)) pm.set(mois, []);
      pm.get(mois).push(v);
    };
    for (const t of cr.tables) {
      for (const [k, v] of Object.entries(t.especes)) { noter(k, v, false); ajouter(k, t.mois, v); }
      for (const [k, v] of Object.entries(t.pluie || {})) { noter(k, v, true); ajouter(k, t.mois, v); }
    }
    const moyenne = l => l.reduce((a, b) => a + b, 0) / l.length;
    for (const [k, r] of m) {
      r.moyenne = Math.round(moyenne([...parMois.get(k).values()].map(moyenne)) * 100) / 100;
      r.note = r.pluie ? r.moyenne : r.max;
    }
    cacheMax.set(cr, m);
  }
  return cacheMax.get(cr).get(id) || null;
}

// 3.2 -> { etoiles: 4, nom: 'Rare' } selon les seuils (lus de haut en bas).
export function etoilesPour(pourcentMax, seuils = SEUILS_DEFAUT) {
  if (pourcentMax == null) return null;
  const liste = seuils && seuils.length ? seuils : SEUILS_DEFAUT;
  const s = liste.find(x => pourcentMax >= x.a_partir_de) || liste[liste.length - 1];
  return { etoiles: s.etoiles, nom: s.nom };
}

export const texteEtoiles = (n, total = 5) => '★'.repeat(n) + '☆'.repeat(Math.max(0, total - n));

// Tableau mois × créneau pour la fiche.
// Une ligne par mois ; deux lignes (1-15 / 16-fin) seulement si les deux moitiés diffèrent pour cette espèce.
// Chaque case : null (absente) ou { pourcent, pluie, details }.
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function grilleEspece(cr, id) {
  const colonnes = cr.creneaux.map(c => c.id);
  const lignes = [];
  const presente = mois => cr.tables.some(t => t.mois === mois && (t.especes[id] || (t.pluie && t.pluie[id])));
  for (let mois = 1; mois <= 12; mois++) {
    const duMois = cr.tables.filter(t => t.mois === mois);
    const moities = [];
    for (const t of duMois) if (!moities.some(j => String(j) === String(t.jours))) moities.push(t.jours);
    const rangees = moities.map(jours => ({
      jours,
      cases: colonnes.map(c => {
        const details = lireTables(duMois.filter(t => String(t.jours) === String(jours) && t.creneau === c), id);
        if (!details.length) return null;
        const normaux = details.filter(d => !d.pluie);
        const liste = normaux.length ? normaux : details;
        return { pourcent: Math.max(...liste.map(d => d.pourcent)), pluie: !normaux.length, details };
      }),
    }));
    // Mois sans table pour l'espèce, mais où le changement de table décalé la rend possible.
    const transition = !rangees.some(r => r.cases.some(Boolean)) && cr.transition && cr.transition.mois
      ? [presente(moisPrecedent(mois)) ? 'debut' : null, presente(moisSuivant(mois)) ? 'fin' : null].filter(Boolean)
      : [];
    const memes = rangees.length > 1 && rangees.every(r => JSON.stringify(r.cases) === JSON.stringify(rangees[0].cases));
    if (rangees.length <= 1 || memes) {
      const ligne = { mois, jours: null, libelle: MOIS_COURTS[mois - 1], cases: rangees.length ? rangees[0].cases : colonnes.map(() => null) };
      if (transition.length) ligne.transition = transition; // ['debut'] / ['fin'] / les deux
      lignes.push(ligne);
    } else {
      for (const r of rangees) {
        const j = r.jours ? ` ${r.jours[0]}-${r.jours[1] >= 30 ? 'fin' : r.jours[1]}` : '';
        lignes.push({ mois, jours: r.jours, libelle: `${MOIS_COURTS[mois - 1]}${j}`, cases: r.cases });
      }
    }
  }
  return { colonnes, lignes };
}

// 12.5 -> "12,5 %" ; 86.96 -> "87 %" ; 1.96 -> "2 %"
export function formaterPourcent(x) {
  if (x == null) return '';
  const chiffres = x < 10 && Math.round(x * 10) / 10 !== Math.round(x) ? 1 : 0;
  return `${x.toLocaleString('fr-FR', { maximumFractionDigits: chiffres })} %`;
}
