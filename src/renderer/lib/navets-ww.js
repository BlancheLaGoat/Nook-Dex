// Navets de Wild World : prédicteur de prix, EXACT.
//
// D'après le code du jeu décompilé par le projet acww-decomp (banatic, licence CC0, domaine public) :
//   https://github.com/banatic/acww-decomp/blob/main/clean/main/turnip_prices.c
// Le calcul est réécrit ici pour Nook Dex.
//
// Comment le jeu fait (TurnipPrices_Roll) :
//  - Le dimanche, prix d'achat de Porcella S = 90 à 110 (21 valeurs, à chances égales).
//  - 12 cours, du lundi matin au samedi après-midi. Chaque cours est tiré séparément :
//      cours = ⌊S × (part + r) / 4096⌋, avec r un entier tiré entre 0 et « écart − 1 »
//    (parts en virgule fixe 4.12 : 4096 = 1,0).
//  - 4 motifs (mêmes numéros que dans le jeu) :
//      0 fluctuant  : normal, bas, bas, bas, normal, normal, normal, bas, bas, normal, normal, normal
//                     (normal = 0,8 à 1,4 ; bas = 0,4 à 0,8) ;
//      1 gros pic   : baisse, puis normal, haut (1,4 à 2,0), PIC (2,0 à 6,1), haut, normal, puis baisse
//                     qui repart de 0,79 ; le pic tombe du jeudi matin au vendredi après-midi ;
//      2 décroissant: 0,79 × S le lundi matin, puis 0,025 de moins à chaque demi-journée (+ 0 à 0,01) ;
//      3 petit pic  : baisse, normal, normal, 1,4 à 1,7, PIC (1,7 à 2,0), 1,4 à 1,7, puis baisse ;
//                     le pic tombe du mercredi après-midi au samedi matin.
//  - Le motif dépend de celui de la semaine d'avant (TRANSITIONS_WW, un nombre de 0 à 100) ; reculer
//    l'horloge impose le motif décroissant.
//
// Comme chaque cours est tiré séparément, la chance de chaque motif se calcule exactement.
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/navets.test.js.

import { MOTIFS } from './navets.js';

export const MOTIFS_WW = MOTIFS;
export const ACHAT_MIN_WW = 90;
export const ACHAT_MAX_WW = 110;

// Ligne : motif de la semaine dernière ; colonne : chance de chaque motif cette semaine (sur 101 tirages).
export const TRANSITIONS_WW = [
  [21, 30, 15, 35],
  [45, 16, 20, 20],
  [25, 45, 6, 25],
  [45, 25, 15, 16],
].map(l => l.map(x => x / 101));

// Motif de la semaine dernière inconnu : répartition « à long terme » (état stable des transitions).
function repartitionStable() {
  let p = [0.25, 0.25, 0.25, 0.25];
  for (let n = 0; n < 300; n++) p = [0, 1, 2, 3].map(j => p.reduce((s, x, i) => s + x * TRANSITIONS_WW[i][j], 0));
  return p;
}
export const REPARTITION_STABLE_WW = repartitionStable();
export function chancesDepartWW(precedent = null) {
  return Number.isInteger(precedent) && TRANSITIONS_WW[precedent] ? [...TRANSITIONS_WW[precedent]] : [...REPARTITION_STABLE_WW];
}

// Parts du jeu (4.12) : [part, écart].
const NORMAL = [0x0ccd, 0x09c3], HAUT = [0x1666, 0x09c3], BAS = [0x0666, 0x068f];
const PIC = [0x2000, 0x419a], PETIT_PIC = [0x1b33, 0x04f6], PETIT_COTE = [0x168f, 0x04a4];
const BAISSE = 0x0ca4, BAISSE_PAS = 0x0066, BAISSE_ECART = 0x0029;

// Les cases du jeu : 0-1 dimanche, 2-13 = lundi matin … samedi après-midi (cours 0 à 11 ici).
// Une variante = 12 tirages [part, écart] (cours 0 à 11) et sa chance au sein du motif.
function baisse(t, debut, fin) {
  let part = BAISSE;
  for (let i = debut; i < fin; i++) { t[i - 2] = [part, BAISSE_ECART]; part -= BAISSE_PAS; }
}
export function variantesWW(motif) {
  const res = [];
  if (motif === 0) {
    const N = NORMAL, B = BAS;
    res.push({ poids: 1, tirages: [N, B, B, B, N, N, N, B, B, N, N, N] });
  } else if (motif === 1) {
    for (let pic = 8; pic < 12; pic++) {
      const t = new Array(12);
      baisse(t, 2, pic - 2);
      t[pic - 4] = NORMAL; t[pic - 3] = HAUT; t[pic - 2] = PIC; t[pic - 1] = HAUT; t[pic] = NORMAL;
      baisse(t, pic + 3, 14);
      res.push({ poids: 1 / 4, pic: pic - 2, tirages: t });
    }
  } else if (motif === 2) {
    const t = new Array(12);
    baisse(t, 2, 14);
    res.push({ poids: 1, tirages: t });
  } else if (motif === 3) {
    for (let pic = 7; pic < 13; pic++) {
      const t = new Array(12);
      baisse(t, 2, pic - 3);
      t[pic - 5] = NORMAL; t[pic - 4] = NORMAL;
      t[pic - 3] = PETIT_COTE; t[pic - 2] = PETIT_PIC; t[pic - 1] = PETIT_COTE;
      baisse(t, pic + 2, 14);
      res.push({ poids: 1 / 6, pic: pic - 2, tirages: t });
    }
  }
  return res;
}

// Répartition exacte d'un cours : Map(prix -> chance), pour un prix d'achat S et un tirage [part, écart].
const cache = new Map();
export function repartition(S, [part, ecart]) {
  const k = `${S}:${part}:${ecart}`;
  if (!cache.has(k)) {
    const m = new Map();
    for (let r = 0; r < ecart; r++) {
      const prix = Math.floor((S * (part + r)) / 4096);
      m.set(prix, (m.get(prix) || 0) + 1 / ecart);
    }
    cache.set(k, { m, min: Math.min(...m.keys()), max: Math.max(...m.keys()) });
  }
  return cache.get(k);
}

// Prédiction. achat : prix du dimanche (90 à 110) ou null (tous essayés) ; cours : 12 prix (null = pas encore vu).
// Renvoie { possible, motifs: [{ id, nom, aide, chance, mins, maxs }], mins, maxs, meilleur } (12 demi-journées),
// comme le prédicteur de New Horizons.
export function predireWW({ achat = null, cours = [], precedent = null } = {}) {
  const obs = Array.from({ length: 12 }, (_, i) => (Number.isFinite(cours[i]) && cours[i] > 0 ? cours[i] : null));
  const achats = achat != null ? [achat] : Array.from({ length: ACHAT_MAX_WW - ACHAT_MIN_WW + 1 }, (_, i) => ACHAT_MIN_WW + i);
  const depart = chancesDepartWW(precedent);
  const calcules = MOTIFS.map(m => {
    let poids = 0;
    const mins = new Array(12).fill(Infinity), maxs = new Array(12).fill(-Infinity);
    if (depart[m.id] > 0) {
      for (const va of variantesWW(m.id)) {
        for (const S of achats) {
          let v = depart[m.id] * va.poids / achats.length;
          const reps = va.tirages.map(t => repartition(S, t));
          for (let i = 0; i < 12 && v > 0; i++) if (obs[i] != null) v *= reps[i].m.get(obs[i]) || 0;
          if (v <= 0) continue;
          poids += v;
          reps.forEach((r, i) => {
            mins[i] = Math.min(mins[i], obs[i] ?? r.min);
            maxs[i] = Math.max(maxs[i], obs[i] ?? r.max);
          });
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
  const dernierVu = obs.reduce((d, x, i) => (x != null ? i : d), -1);
  let meilleur = null;
  for (let i = dernierVu + 1; i < 12 && res.possible; i++) if (!meilleur || res.maxs[i] > meilleur.max) meilleur = { indice: i, max: res.maxs[i] };
  res.meilleur = meilleur;
  return res;
}
