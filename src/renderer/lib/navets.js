// Navets de New Horizons : prédicteur de prix.
//
// D'après l'algorithme du jeu publié par Ninji (Treeki), « TurnipPrices.cpp » :
//   https://gist.github.com/Treeki/85be14d297c80c8b3c0a76375743325b
// Le calcul est réécrit ici pour Nook Dex (aucune ligne de code reprise d'un autre prédicteur).
//
// Comment le jeu fait (résumé) :
//  - Le dimanche, prix d'achat de Porcelette = prix de base (90 à 110).
//  - Le motif de la semaine dépend de celui de la semaine d'avant (TRANSITIONS).
//  - Chaque motif fabrique 12 cours (lundi matin -> samedi après-midi) à partir du prix de base :
//    des « taux » tirés au hasard, multipliés par le prix de base puis arrondis au-dessus (intceil).
//    Certains taux sont indépendants (tirés entre deux bornes), d'autres forment une suite qui baisse
//    d'un pas lui aussi tiré au hasard.
//
// Le prédicteur passe en revue toutes les variantes possibles de chaque motif (longueur des phases,
// jour du pic…), garde celles qui collent avec les cours saisis, et leur donne un poids :
//   chance du motif × chance de la variante × vraisemblance des cours observés.
// La vraisemblance suppose les taux répartis uniformément dans les intervalles possibles :
// c'est une approximation (comme dans les prédicteurs publics), pas un calcul exact.
// Les fourchettes de prix, elles, sont sûres : le vrai cours est toujours dedans.
//
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/navets.test.js.

export const MOTIFS = [
  { id: 0, nom: 'Fluctuant', aide: 'Hauts et bas toute la semaine, sans grand pic (au plus 140 % du prix d\'achat).' },
  { id: 1, nom: 'Gros pic', aide: 'Baisse, puis un pic de 200 à 600 % du prix d\'achat sur une demi-journée.' },
  { id: 2, nom: 'Décroissant', aide: 'Baisse toute la semaine : mieux vaut vendre ailleurs (ou attendre la semaine prochaine).' },
  { id: 3, nom: 'Petit pic', aide: 'Baisse, puis un pic de 140 à 200 % du prix d\'achat.' },
];

// Chance du motif de cette semaine selon le motif de la semaine dernière (lignes : 0 fluctuant, 1 gros pic,
// 2 décroissant, 3 petit pic ; colonnes : motif de cette semaine, dans le même ordre).
export const TRANSITIONS = [
  [0.20, 0.30, 0.15, 0.35],
  [0.50, 0.05, 0.20, 0.25],
  [0.25, 0.45, 0.05, 0.25],
  [0.45, 0.25, 0.15, 0.15],
];

export const DEMI_JOURNEES = ['Lun. matin', 'Lun. après-midi', 'Mar. matin', 'Mar. après-midi', 'Mer. matin', 'Mer. après-midi',
  'Jeu. matin', 'Jeu. après-midi', 'Ven. matin', 'Ven. après-midi', 'Sam. matin', 'Sam. après-midi'];
export const BASE_MIN = 90;
export const BASE_MAX = 110;

// Motif de la semaine dernière inconnu : répartition « à long terme » des motifs (état stable de TRANSITIONS).
function repartitionStable() {
  let p = [0.25, 0.25, 0.25, 0.25];
  for (let n = 0; n < 200; n++) p = [0, 1, 2, 3].map(j => p.reduce((s, x, i) => s + x * TRANSITIONS[i][j], 0));
  return p;
}
export const REPARTITION_STABLE = repartitionStable();

// Chance de départ de chaque motif. premierAchat : le jeu impose le petit pic la première fois
// qu'on achète des navets sur son île (bloc « FirstKabuPattern » du code de Ninji).
export function chancesDepart(precedent = null, premierAchat = false) {
  if (premierAchat) return [0, 0, 0, 1];
  return Number.isInteger(precedent) && TRANSITIONS[precedent] ? [...TRANSITIONS[precedent]] : [...REPARTITION_STABLE];
}

// Arrondi du jeu : (int)(x + 0.99999).
const intceil = x => Math.trunc(x + 0.99999);
const EPS = 1e-9;

// Taux qui donnent exactement ce prix : intceil(taux × base) = prix (avec un décalage pour les « - 1 » du petit pic).
function tauxPourPrix(prix, base, decalage = 0) {
  const p = prix + decalage;
  return [(p - 0.99999) / base - EPS, (p + 0.00001) / base + EPS];
}
const largeur = ([a, b]) => Math.max(0, b - a);
const inter = ([a, b], [c, d]) => [Math.max(a, c), Math.min(b, d)];

// ---- Variantes de chaque motif : liste de 12 « étapes » ----
//   { t: 'u', lo, hi }               taux indépendant tiré entre lo et hi
//   { t: 'd', debut: [lo, hi], pas } début d'une suite qui baisse (pas = [min, max] retiré à chaque demi-journée)
//   { t: 'd', pas }                  suite de la suite en cours
//   { t: 'flanc' } / { t: 'sommet' } pic du petit pic : sommet = taux R (1,4 à 2), flancs = taux entre 1,4 et R, moins 1
const U = (lo, hi) => ({ t: 'u', lo, hi });
const suite = (n, debut, pas) => Array.from({ length: n }, (_, i) => (i === 0 ? { t: 'd', debut, pas } : { t: 'd', pas }));
const HAUT = () => U(0.9, 1.4);

export function variantes(motif) {
  const res = [];
  if (motif === 0) {
    for (const dec1 of [3, 2]) {
      for (let hi1 = 0; hi1 <= 6; hi1++) {
        for (let hi3 = 0; hi3 <= 6 - hi1; hi3++) {
          const etapes = [
            ...Array.from({ length: hi1 }, HAUT),
            ...suite(dec1, [0.6, 0.8], [0.04, 0.10]),
            ...Array.from({ length: 7 - hi1 - hi3 }, HAUT),
            ...suite(5 - dec1, [0.6, 0.8], [0.04, 0.10]),
            ...Array.from({ length: hi3 }, HAUT),
          ];
          res.push({ poids: 0.5 * (1 / 7) * (1 / (7 - hi1)), etapes });
        }
      }
    }
  } else if (motif === 1) {
    // Le pic (taux 2 à 6) arrive deux demi-journées après le début de la hausse (peakStart = 3 à 9).
    for (let debut = 3; debut <= 9; debut++) {
      const etapes = [...suite(debut - 2, [0.85, 0.9], [0.03, 0.05]), U(0.9, 1.4), U(1.4, 2.0), U(2.0, 6.0), U(1.4, 2.0), U(0.9, 1.4),
        ...Array.from({ length: 9 - debut }, () => U(0.4, 0.9))];
      res.push({ poids: 1 / 7, etapes });
    }
  } else if (motif === 2) {
    res.push({ poids: 1, etapes: suite(12, [0.85, 0.9], [0.03, 0.05]) });
  } else if (motif === 3) {
    for (let debut = 2; debut <= 9; debut++) {
      const etapes = [...suite(debut - 2, [0.4, 0.9], [0.03, 0.05]), HAUT(), HAUT(), { t: 'flanc' }, { t: 'sommet' }, { t: 'flanc' },
        ...suite(9 - debut, [0.4, 0.9], [0.03, 0.05])];
      res.push({ poids: 1 / 8, etapes });
    }
  }
  for (const v of res) if (v.etapes.length !== 12) throw new Error(`motif ${motif} : ${v.etapes.length} demi-journées au lieu de 12`);
  return res;
}

// Vraisemblance des cours observés pour une variante et un prix de base, et fourchette de chaque demi-journée.
// cours : 12 nombres ou null. Renvoie { vraisemblance, mins, maxs } ou null si impossible.
export function evaluer(etapes, base, cours) {
  let v = 1;
  const mins = new Array(12), maxs = new Array(12);
  let taux = null; // intervalle du taux de la suite en cours
  // Petit pic : on traite d'abord le sommet et ses deux flancs (le sommet R borne les flancs).
  const sommet = etapes.findIndex(e => e.t === 'sommet');
  let R = [1.4, 2.0];
  if (sommet >= 0) {
    if (cours[sommet] != null) {
      const r = inter(R, tauxPourPrix(cours[sommet], base));
      if (largeur(r) <= 0) return null;
      v *= largeur(r) / 0.6;
      R = r;
    }
    for (const i of [sommet - 1, sommet + 1]) {
      if (cours[i] == null) continue;
      const x = inter([1.4, R[1]], tauxPourPrix(cours[i], base, etapes[i].moins ?? 1));
      if (largeur(x) <= 0) return null;
      // Le flanc est tiré entre 1,4 et R : R est au moins aussi haut que lui.
      R = [Math.max(R[0], x[0]), R[1]];
      if (R[1] < R[0]) return null;
      v *= Math.min(1, largeur(x) / Math.max((R[0] + R[1]) / 2 - 1.4, 1e-6));
    }
  }
  for (let i = 0; i < 12; i++) {
    const e = etapes[i];
    if (e.t === 'sommet' || e.t === 'flanc') {
      if (cours[i] != null) { mins[i] = maxs[i] = cours[i]; continue; }
      // Flanc : moins 1 dans New Horizons (moins = 1 par défaut), rien de retiré dans City Folk (moins = 0).
      const moins = e.moins ?? 1;
      mins[i] = e.t === 'sommet' ? intceil(R[0] * base) : intceil(1.4 * base) - moins;
      maxs[i] = e.t === 'sommet' ? intceil(R[1] * base) : intceil(R[1] * base) - moins;
      continue;
    }
    let possible = e.t === 'u' ? [e.lo, e.hi] : (e.debut ? [...e.debut] : [taux[0], taux[1]]);
    if (cours[i] != null) {
      const r = inter(possible, tauxPourPrix(cours[i], base));
      if (largeur(r) <= 0) return null;
      v *= largeur(possible) > 0 ? largeur(r) / largeur(possible) : 1;
      possible = r;
      mins[i] = maxs[i] = cours[i];
    } else {
      mins[i] = intceil(possible[0] * base);
      maxs[i] = intceil(possible[1] * base);
    }
    const suivante = etapes[i + 1];
    if (e.t === 'd' && suivante && suivante.t === 'd' && !suivante.debut) taux = [possible[0] - suivante.pas[1], possible[1] - suivante.pas[0]];
  }
  return v > 0 ? { vraisemblance: v, mins, maxs } : null;
}

// Prédiction complète.
//   achat : prix d'achat du dimanche (90 à 110), ou null si inconnu (tous les prix de base sont essayés)
//   cours : 12 cours (null = pas encore vu)
//   precedent : motif de la semaine dernière (0 à 3) ou null ; premierAchat : première fois sur l'île
// Renvoie { possible, motifs: [{ id, nom, aide, chance, mins, maxs }], mins, maxs, meilleur }.
//   meilleur = { indice, max } : la demi-journée encore à venir où le prix le plus haut est possible.
// modele : fonction qui donne les variantes de chaque motif (par défaut celles de New Horizons ; City Folk a les siennes).
export function predire({ achat = null, cours = [], precedent = null, premierAchat = false, modele = variantes } = {}) {
  const obs = Array.from({ length: 12 }, (_, i) => (Number.isFinite(cours[i]) && cours[i] > 0 ? cours[i] : null));
  const bases = achat != null ? [achat] : Array.from({ length: BASE_MAX - BASE_MIN + 1 }, (_, i) => BASE_MIN + i);
  const depart = chancesDepart(precedent, premierAchat);
  const calcules = MOTIFS.map(m => {
    let poids = 0;
    const mins = new Array(12).fill(Infinity), maxs = new Array(12).fill(-Infinity);
    if (depart[m.id] > 0) {
      for (const va of modele(m.id)) {
        for (const b of bases) {
          const r = evaluer(va.etapes, b, obs);
          if (!r) continue;
          poids += depart[m.id] * va.poids * (1 / bases.length) * r.vraisemblance;
          for (let i = 0; i < 12; i++) { mins[i] = Math.min(mins[i], r.mins[i]); maxs[i] = Math.max(maxs[i], r.maxs[i]); }
        }
      }
    }
    return { ...m, poids, mins, maxs };
  });
  const total = calcules.reduce((s, m) => s + m.poids, 0);
  const possibles = calcules.filter(m => m.poids > 0);
  const res = {
    possible: total > 0,
    motifs: calcules.map(({ poids, mins, maxs, ...m }) => ({ ...m, chance: total > 0 ? poids / total : 0, mins: poids > 0 ? mins : null, maxs: poids > 0 ? maxs : null })),
    mins: Array.from({ length: 12 }, (_, i) => (possibles.length ? Math.min(...possibles.map(m => m.mins[i])) : null)),
    maxs: Array.from({ length: 12 }, (_, i) => (possibles.length ? Math.max(...possibles.map(m => m.maxs[i])) : null)),
  };
  // Demi-journée encore à venir (après le dernier cours saisi) avec le prix le plus haut possible.
  const dernierVu = obs.reduce((d, x, i) => (x != null ? i : d), -1);
  let meilleur = null;
  for (let i = dernierVu + 1; i < 12 && res.possible; i++) if (!meilleur || res.maxs[i] > meilleur.max) meilleur = { indice: i, max: res.maxs[i] };
  res.meilleur = meilleur;
  return res;
}

// Semaine de navets enregistrée dans le profil, ramenée à une forme sûre.
// Options (par défaut, New Horizons) : nombre de cours, bornes du prix d'achat, nombre de motifs.
export function normaliserNavets(n, { cours: nb = 12, min = BASE_MIN, max = BASE_MAX, motifs = 4 } = {}) {
  const x = n && typeof n === 'object' ? n : {};
  const prix = v => (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 10000 ? Math.round(Number(v)) : null);
  const achat = prix(x.achat);
  return {
    achat: achat != null && achat >= min && achat <= max ? achat : null,
    cours: Array.from({ length: nb }, (_, i) => prix(Array.isArray(x.cours) ? x.cours[i] : null)),
    precedent: Number.isInteger(x.precedent) && x.precedent >= 0 && x.precedent < motifs ? x.precedent : null,
    premierAchat: x.premierAchat === true,
  };
}
