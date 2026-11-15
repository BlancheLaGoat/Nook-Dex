// Navets de City Folk : prédicteur de prix.
//
// D'après le code du jeu : main.dol, fonction 0x80146ED0 en version américaine (RUUE01), 0x80146CA4 en version
// européenne (RUUP01 Rev 1). Vérifié : la fonction charge exactement les constantes utilisées ici (0,02 ; 0,03 ; 0,04 ;
// 0,05 ; 0,06 ; 0,2 ; 0,8 ; 0,99999 ; 1,4 ; 2 ; 6), et le motif est rangé à + 0x3C dans la sauvegarde (comme dans ACSE).
//
// C'est le même moteur que New Horizons (lib/navets.js : taux tirés au hasard, arrondis au-dessus), avec les mêmes
// chances de passer d'un motif à l'autre, mais d'autres variantes :
//  - fluctuant  : hauts de 0,8 à 1,4 (0,9 dans New Horizons) ; 0 à 2 hauts au début et 0 à 2 à la fin ;
//  - gros pic   : baisse depuis 0,75-0,8 (moins 0,03-0,05 par demi-journée), puis 0,8-1,4 / 1,4-2,0 / 2,0-6,0 /
//                 1,4-2,0 / 0,8-1,4 ; la hausse commence entre le mardi après-midi et le jeudi après-midi,
//                 puis la baisse reprend depuis 0,75-0,8 ;
//  - décroissant: depuis 0,75-0,8, moins 0,03-0,05 par demi-journée ;
//  - petit pic  : baisse, 0,8-1,4, 0,8-1,4, puis un sommet R de 1,4 à 2,0 entouré de deux prix entre 1,4 et R
//                 (sans le « moins 1 » de New Horizons), puis la baisse reprend.
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/navets.test.js.

import { predire } from './navets.js';

const U = (lo, hi) => ({ t: 'u', lo, hi });
const suite = (n, debut, pas) => Array.from({ length: n }, (_, i) => (i === 0 ? { t: 'd', debut, pas } : { t: 'd', pas }));
const HAUT = () => U(0.8, 1.4);
const BAISSE = [0.75, 0.8], PAS = [0.03, 0.05];

// Variantes (12 demi-journées, lundi matin … samedi après-midi). « pic » = case du jeu où commence la hausse (5 à 9),
// soit 2 + le nombre de demi-journées de baisse avant elle.
export function variantesCF(motif) {
  const res = [];
  if (motif === 0) {
    for (const dec1 of [2, 3]) {
      for (let hi1 = 0; hi1 <= 2; hi1++) {
        for (let hi3 = 0; hi3 <= 2; hi3++) {
          res.push({ poids: 0.5 / 9, etapes: [
            ...Array.from({ length: hi1 }, HAUT),
            ...suite(dec1, [0.6, 0.8], [0.04, 0.10]),
            ...Array.from({ length: 7 - hi1 - hi3 }, HAUT),
            ...suite(5 - dec1, [0.6, 0.8], [0.04, 0.10]),
            ...Array.from({ length: hi3 }, HAUT),
          ] });
        }
      }
    }
  } else if (motif === 1) {
    for (let pic = 5; pic <= 9; pic++) {
      res.push({ poids: 1 / 5, etapes: [...suite(pic - 2, BAISSE, PAS), HAUT(), U(1.4, 2.0), U(2.0, 6.0), U(1.4, 2.0), HAUT(),
        ...suite(9 - pic, BAISSE, PAS)] });
    }
  } else if (motif === 2) {
    res.push({ poids: 1, etapes: suite(12, BAISSE, PAS) });
  } else if (motif === 3) {
    for (let pic = 5; pic <= 9; pic++) {
      res.push({ poids: 1 / 5, etapes: [...suite(pic - 2, BAISSE, PAS), HAUT(), HAUT(),
        { t: 'flanc', moins: 0 }, { t: 'sommet' }, { t: 'flanc', moins: 0 }, ...suite(9 - pic, BAISSE, PAS)] });
    }
  }
  for (const v of res) if (v.etapes.length !== 12) throw new Error(`motif ${motif} : ${v.etapes.length} demi-journées au lieu de 12`);
  return res;
}

export const predireCF = opts => predire({ ...opts, premierAchat: false, modele: variantesCF });
