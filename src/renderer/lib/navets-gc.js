// Navets du GameCube (Animal Crossing / Dōbutsu no Mori) : prédicteur de prix.
//
// D'après le code du jeu décompilé par le projet ac-decomp (licence CC0, domaine public) :
//   https://github.com/ACreTeam/ac-decomp/blob/master/src/game/m_kabu_manager.c
// Le calcul est réécrit ici pour Nook Dex.
//
// Comment le jeu fait :
//  - Dimanche : prix d'achat de Jeanne = 100 × (1 + (hasard − 0,5) × 0,6), soit 70 à 129 clochettes.
//  - Un seul prix par jour, du lundi au samedi (pas de matin / après-midi).
//  - Trois motifs, choisis selon celui de la semaine d'avant (TRANSITIONS_GC) :
//      A (pic)       : comme B, puis un jour du lundi au vendredi vaut 8 × le prix du dimanche ;
//      B (aléatoire) : chaque jour, le prix baisse (× 0,7, et au plus 80 % du dimanche) avec une chance qui
//                      commence à 10 %, ou monte (× 1,05, puis 1,06, 1,07…) ; la chance de baisse augmente de 14 %
//                      après chaque hausse et est multipliée par 0,3 (au plus 10 %) après chaque baisse ;
//      C (baisse)    : chaque jour, le prix est multiplié par un nombre tiré entre 0,80 et 0,95.
//  - Le jeu calcule en nombres à virgule « simple précision » (f32) et garde la partie entière du prix.
//
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/navets.test.js.

export const MOTIFS_GC = [
  { id: 0, nom: 'Pic', aide: "Un jour du lundi au vendredi, le prix vaut 8 fois le prix d'achat !" },
  { id: 1, nom: 'Aléatoire', aide: 'Le prix monte un peu chaque jour, avec des baisses de temps en temps.' },
  { id: 2, nom: 'Baisse', aide: 'Le prix baisse tous les jours (de 5 à 20 % par jour).' },
];
// Lignes : motif de la semaine dernière ; colonnes : chance de chaque motif cette semaine.
export const TRANSITIONS_GC = [
  [0.5, 0.3, 0.2],
  [0.6, 0.2, 0.2],
  [0.6, 0.3, 0.1],
];
export const JOURS_GC = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const ACHAT_MIN_GC = 70;
export const ACHAT_MAX_GC = 129;

const f = Math.fround; // calcul en simple précision, comme le jeu

function repartitionStable() {
  let p = [1 / 3, 1 / 3, 1 / 3];
  for (let n = 0; n < 200; n++) p = [0, 1, 2].map(j => p.reduce((s, x, i) => s + x * TRANSITIONS_GC[i][j], 0));
  return p;
}
export const REPARTITION_STABLE_GC = repartitionStable();

export function chancesDepartGC(precedent = null) {
  return Number.isInteger(precedent) && TRANSITIONS_GC[precedent] ? [...TRANSITIONS_GC[precedent]] : [...REPARTITION_STABLE_GC];
}

// Motif B : les 64 suites possibles de hausses et de baisses, avec leur chance et leurs prix.
export function suitesAleatoires(dimanche) {
  const res = [];
  for (let masque = 0; masque < 64; masque++) {
    let mult = f(1.05), chanceBaisse = f(0.1), prix = f(dimanche);
    const mini = f(f(dimanche) * f(0.8));
    let p = 1;
    const prixJours = [];
    for (let j = 0; j < 6; j++) {
      if ((masque >> j) & 1) {
        p *= chanceBaisse;
        prix = f(prix * f(0.7));
        if (prix > mini) prix = mini;
        chanceBaisse = f(chanceBaisse * f(0.3));
        if (chanceBaisse > f(0.1)) chanceBaisse = f(0.1);
      } else {
        p *= 1 - Math.min(1, chanceBaisse);
        prix = f(prix * mult);
        mult = f(mult + f(0.01));
        chanceBaisse = f(chanceBaisse + f(0.14));
      }
      prixJours.push(Math.trunc(prix));
    }
    if (p > 0) res.push({ p, prix: prixJours });
  }
  return res;
}

// Un cours saisi colle-t-il au prix calculé ? (± 1 clochette : marge pour les arrondis des nombres à virgule)
const colle = (vu, calcule) => vu == null || Math.abs(vu - calcule) <= 1;

// Prédiction. achat : prix du dimanche (70 à 129) ou null (tous essayés) ; cours : 6 prix (null = pas encore vu).
// Renvoie { possible, motifs: [{ id, nom, aide, chance, mins, maxs }], mins, maxs, meilleur } (6 jours).
export function predireGC({ achat = null, cours = [], precedent = null } = {}) {
  const obs = Array.from({ length: 6 }, (_, i) => (Number.isFinite(cours[i]) && cours[i] > 0 ? cours[i] : null));
  const dimanches = achat != null ? [achat] : Array.from({ length: ACHAT_MAX_GC - ACHAT_MIN_GC + 1 }, (_, i) => ACHAT_MIN_GC + i);
  const depart = chancesDepartGC(precedent);
  const motifs = MOTIFS_GC.map(m => ({ ...m, poids: 0, mins: new Array(6).fill(Infinity), maxs: new Array(6).fill(-Infinity) }));
  const noter = (m, poids, mins, maxs) => {
    m.poids += poids;
    for (let i = 0; i < 6; i++) { m.mins[i] = Math.min(m.mins[i], mins[i]); m.maxs[i] = Math.max(m.maxs[i], maxs[i]); }
  };
  for (const S of dimanches) {
    const pS = 1 / dimanches.length;
    // B (aléatoire) et A (pic sur un jour du lundi au vendredi).
    for (const s of suitesAleatoires(S)) {
      if (s.prix.every((x, i) => colle(obs[i], x))) noter(motifs[1], depart[1] * pS * s.p, s.prix, s.prix);
      for (let jour = 0; jour < 5; jour++) {
        const prix = s.prix.map((x, i) => (i === jour ? Math.trunc(f(f(S) * f(8))) : x));
        if (prix.every((x, i) => colle(obs[i], x))) noter(motifs[0], depart[0] * pS * s.p / 5, prix, prix);
      }
    }
    // C (baisse) : intervalle du prix (à virgule) jour après jour ; un prix vu p veut dire « entre p et p + 1 ».
    let lo = S, hi = S, v = 1, ok = true;
    const mins = [], maxs = [];
    for (let i = 0; i < 6; i++) {
      const a = lo * 0.8, b = hi * 0.95;
      if (obs[i] != null) {
        const c = Math.max(a, obs[i] - 1e-6), d = Math.min(b, obs[i] + 1);
        if (d <= c) { ok = false; break; }
        v *= (d - c) / (b - a);
        lo = c; hi = d;
        mins.push(obs[i]); maxs.push(obs[i]);
      } else {
        lo = a; hi = b;
        mins.push(Math.trunc(a)); maxs.push(Math.trunc(b));
      }
    }
    if (ok) noter(motifs[2], depart[2] * pS * v, mins, maxs);
  }
  const total = motifs.reduce((s, m) => s + m.poids, 0);
  const possibles = motifs.filter(m => m.poids > 0);
  const res = {
    possible: total > 0,
    motifs: motifs.map(({ poids, mins, maxs, ...m }) => ({ ...m, chance: total > 0 ? poids / total : 0, mins: poids > 0 ? mins : null, maxs: poids > 0 ? maxs : null })),
    mins: Array.from({ length: 6 }, (_, i) => (possibles.length ? Math.min(...possibles.map(m => m.mins[i])) : null)),
    maxs: Array.from({ length: 6 }, (_, i) => (possibles.length ? Math.max(...possibles.map(m => m.maxs[i])) : null)),
  };
  const dernierVu = obs.reduce((d, x, i) => (x != null ? i : d), -1);
  let meilleur = null;
  for (let i = dernierVu + 1; i < 6 && res.possible; i++) if (!meilleur || res.maxs[i] > meilleur.max) meilleur = { indice: i, max: res.maxs[i] };
  res.meilleur = meilleur;
  return res;
}
