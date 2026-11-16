// Lecture d'une sauvegarde de City Folk (Wii) : musée, encyclopédie, catalogue et morceaux de K.K. LECTURE SEULE.
//
// Format, d'après ACSE (Cuyler36, MIT) et les positions d'actoolkit-linux, vérifié sur trois vraies sauvegardes :
//  - fichier RVFOREST.DAT en clair de 0x40F340 octets (celui de SaveGame Manager GX ou de la NAND de Dolphin ;
//    le data.bin copié sur la carte SD par le menu de la Wii est chiffré et n'est pas pris en charge) ;
//  - grand-boutiste ; 4 joueurs de 0x86C0 octets à partir de 0 ;
//  - joueur : CRC32 à +0x1140 des 0x759C octets qui suivent ; nom à +0x7EFA (8 caractères UTF-16) ;
//    ville à +0x7EE4 ; catalogue à +0x841A : bit n = objet 0x9000 + 4n (octet n / 8, bit n % 8), créatures
//    attrapées comprises ; les morceaux de K.K. suivent (bits 4096 et plus) ;
//  - musée à 0x7352A (0x74 octets) : un quartet par objet = qui l'a donné (1 à 4) ; la case paire est le quartet
//    BAS de l'octet. Fossiles à +0x00, poissons à +0x1E, insectes à +0x3F, tableaux à +0x60 ; dans chaque partie,
//    les objets de la catégorie dans l'ordre de leurs numéros. Lu dans le code du jeu (main.dol US Rev 1 :
//    0x801199D8 choisit la partie, 0x80119AF4 lit la case, 0x800C2F9C donne le rang dans la catégorie) ;
//    les morceaux de K.K. ont leur propre champ de 10 octets (0x8013A40C : bit n = n-ième morceau, bit 0 en bas).
//
// Ce fichier ne fait que des calculs (pas d'affichage).
export { cochesImportWW as cochesImportCF } from './sauvegarde-ww.js';

export const TAILLE_CF = 0x40F340;
const TAILLE_JOUEUR = 0x86C0;
const CATALOGUE = 0x841A;
const BITS_CATALOGUE = 4096 + 80;
const MUSEE = 0x7352A;
const MUSEE_PARTIES = { fossiles: [0x00, 58], poissons: [0x1E, 64], insectes: [0x3F, 64], art: [0x60, 23] };

let TABLE_CRC = null;
export function crc32(o, debut, longueur) {
  if (!TABLE_CRC) {
    TABLE_CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      TABLE_CRC[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = debut; i < debut + longueur; i++) c = TABLE_CRC[(c ^ o[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const u16 = (o, i) => (o[i] << 8) | o[i + 1];
const u32 = (o, i) => ((o[i] << 24) | (o[i + 1] << 16) | (o[i + 2] << 8) | o[i + 3]) >>> 0;
function texte(o, debut, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const c = u16(o, debut + 2 * i);
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

export function lireSauvegardeCF(octets) {
  const s = octets;
  if (s.length !== TAILLE_CF) {
    throw new Error(s.length > TAILLE_CF
      ? "ce fichier n'est pas un RVFOREST.DAT en clair (le data.bin de la carte SD est chiffré)"
      : "ce fichier n'est pas une sauvegarde de City Folk (RVFOREST.DAT)");
  }
  const joueurs = [0, 1, 2, 3].map(n => {
    const p = n * TAILLE_JOUEUR;
    const nom = texte(s, p + 0x7EFA, 8);
    const intact = crc32(s, p + 0x1144, 0x759C) === u32(s, p + 0x1140);
    const catalogue = new Set();
    for (let k = 0; k < BITS_CATALOGUE; k++) if ((s[p + CATALOGUE + (k >> 3)] >> (k & 7)) & 1) catalogue.add(k);
    return { numero: n + 1, nom, ville: texte(s, p + 0x7EE4, 8), existe: nom !== '' && intact, intact, catalogue, attrapes: catalogue };
  });
  if (!joueurs.some(j => j.existe)) {
    throw new Error(joueurs.some(j => j.nom) ? 'la sauvegarde est abîmée (aucun joueur intact)' : 'aucun joueur dans cette sauvegarde de City Folk');
  }
  const musee = {};
  for (const [partie, [ofs, nb]] of Object.entries(MUSEE_PARTIES)) {
    musee[partie] = Array.from({ length: nb }, (_, i) => (s[MUSEE + ofs + (i >> 1)] >> (i & 1 ? 4 : 0)) & 0x0F);
  }
  const ville = (joueurs.find(j => j.existe) || {}).ville || '';
  return { format: 'rvforest', ville, joueurs, musee };
}

// ---------------------------------------------------------------------------
// Navets : les prix de toute la semaine sont dans la sauvegarde.
// ---------------------------------------------------------------------------
// À 0x63200 (positions d'actoolkit-linux ; motif à + 0x3C comme dans le code du jeu, voir lib/navets-cf.js) :
// 16 mots de 32 bits = prix d'achat, 14 cours (dimanche matin … samedi après-midi ; ceux du dimanche valent 100
// et ne servent pas), motif (0 fluctuant, 1 gros pic, 2 décroissant, 3 petit pic). La date qui suit (+ 0x44)
// est celle de la dernière partie, pas celle du tirage : on ne l'affiche pas.
// Vérifié sur deux vraies semaines (gros pic à 223 pour 97 ; fluctuant) : le prédicteur de City Folk retrouve
// le motif enregistré à 100 %.
const NAVETS = 0x63200;
export function navetsCF(octets) {
  if (octets.length !== TAILLE_CF) lireSauvegardeCF(octets); // même message d'erreur que l'import
  const mot = i => u32(octets, NAVETS + 4 * i);
  const cours = Array.from({ length: 12 }, (_, i) => mot(3 + i) || null);
  const motif = mot(15);
  return { achat: mot(0) || null, cours, motif: motif <= 3 ? motif : null };
}
