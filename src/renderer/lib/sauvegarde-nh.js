// Lecture d'une sauvegarde de New Horizons (Switch, version 3.0.x) : musée, objets obtenus et recettes. LECTURE SEULE.
//
// Format, d'après NHSE (kwsch) ; seuls les faits sont repris, le code est écrit pour Nook Dex :
//  - le dossier de sauvegarde contient main.dat + mainHeader.dat, et un dossier VillagerN par joueur
//    (personal.dat + personalHeader.dat) ;
//  - chaque .dat est chiffré en AES-128-CTR ; la clé et le compteur viennent de son en-tête : deux mots de 32 bits
//    de l'en-tête (à partir de 0x100) choisissent une graine et un nombre de tirages d'un générateur
//    « XorShift128 » (celui de la bibliothèque sead de Nintendo) ;
//  - l'en-tête dit la version : 3.0.0 à 3.0.3 = Major 0xA0002, Minor 0xA0028, révision 31 à 34 ;
//  - des sommes Murmur3 protègent des zones du fichier : on les vérifie, ce qui prouve que le déchiffrement est juste ;
//  - main.dat : musée à 0x491220 (1024 objets de 8 octets à +0x1004, numéro sur 16 bits, 0xFFFE = vide) ;
//  - personal.dat : nom du joueur à 0xC268 (UTF-16, 10 caractères), objets déjà obtenus à 0x49938 (un bit par
//    numéro d'objet, 0x754 octets), recettes connues à 0x6528C (un bit par numéro de recette, 0x100 octets).
// À VÉRIFIER sur une vraie sauvegarde : testé seulement sur des sauvegardes fabriquées.
//
// Ce fichier ne fait que des calculs (pas d'affichage). Le déchiffrement utilise WebCrypto (asynchrone).

export const VERSIONS = { 31: '3.0.0', 32: '3.0.1', 33: '3.0.2', 34: '3.0.3' };
export const TAILLES = { main: 0x9B0E90, personal: 0x74A40 };
const ZONES = {
  main: [[0x1E34B0, 0x3D089C]], // la zone qui contient le musée
  personal: [[0x110, 0x37ACC], [0x37BE0, 0x3CE5C]],
};
const MUSEE = 0x110 + 0x491110;
const NOM_JOUEUR = 0x110 + 0xC138 + 0x20;
const NOM_ILE = 0x110 + 0xC138 + 0x04;
const OBTENUS = 0x37BE0 + 0x11D58;
const TAILLE_OBTENUS = 0x754;
const RECETTES = 0x37BE0 + 0x2D69C + 0x10;
const TAILLE_RECETTES = 0x100;
const VIDE = 0xFFFE;

const u16 = (o, i) => o[i] | (o[i + 1] << 8);
const u32 = (o, i) => (o[i] | (o[i + 1] << 8) | (o[i + 2] << 16) | (o[i + 3] << 24)) >>> 0;

// Générateur XorShift128 de sead, initialisé comme un Mersenne Twister.
export function xorshift128(graine) {
  const init = (x, k) => (Math.imul(0x6C078965, (x ^ (x >>> 30)) >>> 0) + k) >>> 0;
  let a = init(graine >>> 0, 1);
  let b = init(a, 2);
  let c = init(b, 3);
  let d = init(c, 4);
  return () => {
    let t = a;
    a = b; b = c; c = d;
    t = (t ^ (t << 11)) >>> 0;
    t = (t ^ (t >>> 8)) >>> 0;
    d = (t ^ d ^ (d >>> 19)) >>> 0;
    return d;
  };
}

// Clé ou compteur (16 octets) à partir des 128 mots de l'en-tête.
export function parametre(mots, index) {
  const suivant = xorshift128(mots[mots[index] & 0x7F]);
  const tirages = ((mots[mots[index + 1] & 0x7F] & 0x7F) & 0xF) + 1;
  for (let i = 0; i < tirages; i++) { suivant(); suivant(); } // Next64 = deux tirages
  const res = new Uint8Array(16);
  for (let i = 0; i < 16; i++) res[i] = suivant() >>> 24;
  return res;
}

export function motsEnTete(enTete) {
  if (enTete.length < 0x300) throw new Error("l'en-tête est trop court");
  return Array.from({ length: 128 }, (_, i) => u32(enTete, 0x100 + i * 4));
}

export async function dechiffrer(enTete, donnees) {
  const mots = motsEnTete(enTete);
  const cle = await crypto.subtle.importKey('raw', parametre(mots, 0), 'AES-CTR', false, ['decrypt']);
  const clair = await crypto.subtle.decrypt({ name: 'AES-CTR', counter: parametre(mots, 2), length: 128 }, cle, donnees);
  return new Uint8Array(clair);
}

export function murmur3(o, debut, longueur) {
  let h = 0;
  for (let i = debut; i < debut + longueur; i += 4) {
    let k = u32(o, i);
    k = Math.imul(k, 0xCC9E2D51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1B873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xE6546B64) | 0;
  }
  h ^= longueur;
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
  h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Version de la sauvegarde d'après un en-tête (non chiffré au début) ; null si ce n'est pas la 3.0.x.
export function versionEnTete(enTete) {
  if (!enTete || enTete.length < 0x10) return null;
  if (u32(enTete, 0) !== 0xA0002 || u32(enTete, 4) !== 0xA0028) return null;
  return VERSIONS[u16(enTete, 0x0E)] || null;
}

function verifierSommes(o, type, quoi) {
  for (const [ofs, longueur] of ZONES[type]) {
    if (u32(o, ofs) !== murmur3(o, ofs + 4, longueur)) {
      throw new Error(`${quoi} : la somme de contrôle est fausse (fichier abîmé, ou version du jeu pas encore prise en charge).`);
    }
  }
}

function texteUtf16(o, debut, n) {
  let s = '';
  for (let i = 0; i < n; i++) { const c = u16(o, debut + i * 2); if (!c) break; s += String.fromCharCode(c); }
  return s.trim();
}

async function ouvrir(enTete, donnees, type, quoi) {
  if (!versionEnTete(enTete)) {
    throw new Error(`${quoi} : Nook Dex ne lit que les sauvegardes de la version 3.0 du jeu (mets le jeu à jour, joue un instant, puis exporte à nouveau).`);
  }
  if (donnees.length !== TAILLES[type]) throw new Error(`${quoi} : taille inattendue pour la version 3.0.`);
  const clair = await dechiffrer(enTete, donnees);
  verifierSommes(clair, type, quoi);
  return clair;
}

// fichiers = { mainHeader, main, joueurs: [{ dossier, header, personal }] } (octets bruts du dossier de sauvegarde).
export async function lireSauvegardeNH(fichiers) {
  if (!fichiers || !fichiers.main || !fichiers.mainHeader) throw new Error("Ce dossier n'est pas une sauvegarde de New Horizons : il doit contenir main.dat et mainHeader.dat.");
  const main = await ouvrir(fichiers.mainHeader, fichiers.main, 'main', 'main.dat');
  const musee = [];
  for (let i = 0; i < 1024; i++) {
    const n = u16(main, MUSEE + 0x1004 + i * 8);
    if (n !== VIDE && n !== 0xFFFF) musee.push(n);
  }
  const joueurs = [];
  for (const [i, j] of (fichiers.joueurs || []).entries()) {
    const p = await ouvrir(j.header, j.personal, 'personal', `${j.dossier}/personal.dat`);
    const obtenus = new Set();
    for (let k = 0; k < TAILLE_OBTENUS * 8; k++) if ((p[OBTENUS + (k >> 3)] >> (k & 7)) & 1) obtenus.add(k);
    const recettes = new Set();
    for (let k = 0; k < TAILLE_RECETTES * 8; k++) if ((p[RECETTES + (k >> 3)] >> (k & 7)) & 1) recettes.add(k);
    joueurs.push({ numero: i + 1, dossier: j.dossier, nom: texteUtf16(p, NOM_JOUEUR, 10), ile: texteUtf16(p, NOM_ILE, 10), existe: true, obtenus, recettes });
  }
  if (!joueurs.length) throw new Error("Aucun joueur dans ce dossier (dossiers Villager0, Villager1… introuvables).");
  return { version: versionEnTete(fichiers.mainHeader), joueurs, musee };
}

// Navets : la semaine est tirée d'avance et rangée dans main.dat (TurnipStonk de NHSE, « GSaveShopKabu », à
// 0x110 + 0x48D920 + 0x2D40) : prix d'achat, 14 prix (dimanche matin … samedi après-midi), motif (0 fluctuant,
// 1 gros pic, 2 décroissant, 3 petit pic), tous en entiers de 32 bits. La zone est dans celle que la somme Murmur3 vérifie.
// À VÉRIFIER sur une vraie sauvegarde, comme le reste de la lecture de New Horizons.
const NAVETS = 0x110 + 0x48D920 + 0x2D40;
export async function navetsNH(fichiers) {
  if (!fichiers || !fichiers.main || !fichiers.mainHeader) throw new Error("Ce dossier n'est pas une sauvegarde de New Horizons : il doit contenir main.dat et mainHeader.dat.");
  const main = await ouvrir(fichiers.mainHeader, fichiers.main, 'main', 'main.dat');
  const prix = v => (v > 0 && v < 10000 ? v : null);
  const motif = u32(main, NAVETS + 0x3C);
  return {
    achat: prix(u32(main, NAVETS)),
    cours: Array.from({ length: 12 }, (_, i) => prix(u32(main, NAVETS + 4 + (i + 2) * 4))),
    motif: motif <= 3 ? motif : null,
  };
}

// Ce que l'import cocherait (seulement des ajouts) : [{ categorie, id, obtenu: true, musee?: true }].
export function cochesImportNH(save, correspondance, numeroJoueur) {
  const parNumero = new Map(correspondance.objets.map(([n, categorie, id]) => [n, { categorie, id }]));
  const museeCats = new Set(correspondance.musee);
  const res = new Map();
  const ajouter = (categorie, id, musee) => {
    const k = `${categorie}:${id}`;
    const x = res.get(k) || { categorie, id, obtenu: true };
    if (musee) x.musee = true;
    res.set(k, x);
  };
  for (const n of save.musee) {
    const f = parNumero.get(n);
    if (f && museeCats.has(f.categorie)) ajouter(f.categorie, f.id, true);
  }
  const joueur = save.joueurs.find(j => j.numero === numeroJoueur);
  if (joueur) {
    for (const n of joueur.obtenus) { const f = parNumero.get(n); if (f) ajouter(f.categorie, f.id, false); }
    for (const [n, id] of correspondance.recettes) if (joueur.recettes.has(n)) ajouter('recettes', id, false);
  }
  return [...res.values()];
}
