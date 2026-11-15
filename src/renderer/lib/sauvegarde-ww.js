// Lecture d'une sauvegarde de Wild World (Nintendo DS) : musée, encyclopédie et catalogue. LECTURE SEULE.
//
// Format, d'après ACSE (Cuyler36, MIT) et la documentation de Leaflet (oddnebula, MIT) :
//  - fichier .sav brut de 256 Kio (ou plus) ; un .dsv de DeSmuME / RetroArch, c'est le même avec un pied de page
//    « |<--Snip above here… |-DESMUME SAVE-| » à la fin, qu'on ignore ;
//  - la ville fait 0x15FE0 octets ; elle est à 0, et sa copie de secours juste derrière (0x15FE0) ;
//  - une copie est valable si la somme de ses mots de 16 bits (petit-boutiste) vaut 0 ;
//  - joueurs : 4 × 0x228C octets à partir de 0x0C ; identifiant à +0x2280 (0 ou 0xFFFF = pas de joueur),
//    nom à +0x2282 (8 caractères du jeu) ; catalogue à +0x1B48 (bit n = octet n / 8, bit n % 8) ;
//    encyclopédie (créatures attrapées) à +0x1BDD : bits 1 à 56 = insectes, 57 à 112 = poissons ;
//  - musée à 0x15D50 : un quartet par objet (le bas d'abord) = qui l'a donné (1 à 4, 5 = ancien habitant).
// Vérifié sur une vraie ville européenne (musée complet, catalogue de 1 500 objets).
//
// Ce fichier ne fait que des calculs (pas d'affichage).

export const TAILLE_VILLE = 0x15FE0;
const COPIES = [0, TAILLE_VILLE];
const TAILLE_JOUEUR = 0x228C;
const DEBUT_JOUEURS = 0x0C;
const MUSEE = 0x15D50;
const CATALOGUE = 0x1B48;
const ENCYCLOPEDIE = 0x1BDD;
const MUSEE_PARTIES = { fossiles: [0x00, 52], poissons: [0x1B, 56], insectes: [0x38, 56], art: [0x55, 20] };
const PIED_DESMUME = '|-DESMUME SAVE-|';

// Caractères du jeu (version occidentale), d'après ACSE ; « ? » pour ceux qu'on ne sait pas afficher.
const CARACTERES = [...('\0ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789⨍'
  + 'sŒŽšœžŸÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏĐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùú'
  + 'ûüýþÿ  !“#$%&´()*+,-./:;<=>?@[{]|_}、˷…~£†‡^‰⟨`”•‒\'—"™⟩ ˜¥╎§¡¢£¨©')];

const u16 = (o, i) => o[i] | (o[i + 1] << 8);

export function somme16(o, debut, longueur) {
  let s = 0;
  for (let i = debut; i < debut + longueur; i += 2) s = (s + u16(o, i)) & 0xFFFF;
  return s;
}

export function nomDuJeu(o, debut, n = 8) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const c = o[debut + i];
    if (!c) break;
    s += CARACTERES[c] || '?';
  }
  return s.trim();
}

// Enlève le pied de page de DeSmuME s'il y en a un.
export function extraireSauvegarde(octets) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let fin = o.length;
  const queue = String.fromCharCode(...o.subarray(Math.max(0, o.length - PIED_DESMUME.length)));
  if (queue === PIED_DESMUME) {
    const debut = [...'|<--Snip'].map(c => c.charCodeAt(0));
    for (let i = o.length - PIED_DESMUME.length; i >= Math.max(0, o.length - 0x200); i--) {
      if (debut.every((c, k) => o[i + k] === c)) { fin = i; break; }
    }
    return { donnees: o.subarray(0, fin), format: 'dsv' };
  }
  return { donnees: o, format: 'sav' };
}

// Copie valide de la ville (la principale si elle est bonne, sinon celle de secours).
function villeValide(octets) {
  const { donnees, format } = extraireSauvegarde(octets);
  if (donnees.length < 2 * TAILLE_VILLE) {
    throw new Error("Ce fichier n'est pas une sauvegarde d'Animal Crossing: Wild World : choisis le .sav (ou le .dsv de DeSmuME / RetroArch) du jeu.");
  }
  const valides = COPIES.filter(c => somme16(donnees, c, TAILLE_VILLE) === 0);
  if (!valides.length) throw new Error("La sauvegarde est abîmée, ou ce n'est pas une sauvegarde de Wild World (somme de contrôle fausse sur les deux copies) : rien ne peut être importé.");
  const base = valides[0];
  return { s: donnees.subarray(base, base + TAILLE_VILLE), format, base };
}

// ---------------------------------------------------------------------------
// Fleurs de la ville.
// ---------------------------------------------------------------------------
// Objets de la carte à 0xC354 (ACSE) : 4 × 4 acres de 16 × 16 cases, rangés acre par acre (acre 0 = en haut à gauche,
// puis vers la droite ; vérifié sur une vraie ville : les maisons y forment des rectangles). Chaque objet fait 2 octets :
// son identifiant, rien d'autre. Il n'y a donc pas de gènes : un enfant ne dépend que de la couleur de ses parents.
// Case vide : 0xFFF1. Fleurs : 0x00 à 0x19 (puis échelle de Jacob et rafflesia), assoiffées à + 0x6E, arrosées à + 0x8A ;
// rose dorée : 0x1C.
export const ACRES_WW = 4;
const OBJETS_VILLE = 0xC354;
const VIDE = 0xFFF1;
const FLEURS = [
  ['Tulipes', ['rouge', 'blanc', 'jaune', 'rose', 'violet', 'noir']],
  ['Pensées', ['blanc', 'jaune', 'rouge', 'violet', 'orange', 'bleu']],
  ['Cosmos', ['blanc', 'rouge', 'jaune', 'rose', 'orange', 'noir']],
  ['Roses', ['rouge', 'blanc', 'jaune', 'rose', 'orange', 'violet', 'noir', 'bleu']],
].flatMap(([espece, couleurs]) => couleurs.map(couleur => ({ espece, couleur })));

function fleurWW(id) {
  if (id === 0x1C) return { espece: 'Roses', couleur: 'or', etat: 'normale' };
  for (const [decalage, etat] of [[0, 'normale'], [0x6E, 'assoiffee'], [0x8A, 'arrosee']]) {
    const f = FLEURS[id - decalage];
    if (id >= decalage && f) return { ...f, etat };
  }
  return null;
}

// Objets de la ville : { largeur: 64, hauteur: 64, cases: [null | { objet: id } | { espece, couleur, etat }] }
// (espece et couleur comme dans data/ww/fleurs-regles.json ; cases rangées ligne par ligne sur toute la carte).
export function fleursVilleWW(octets) {
  const { s } = villeValide(octets);
  const largeur = ACRES_WW * 16, hauteur = ACRES_WW * 16;
  const cases = Array.from({ length: largeur * hauteur }, () => null);
  for (let i = 0; i < largeur * hauteur; i++) {
    const id = u16(s, OBJETS_VILLE + i * 2);
    if (id === VIDE) continue;
    const acre = i >> 8, dans = i & 0xFF;
    const x = (acre % ACRES_WW) * 16 + (dans & 15), y = Math.floor(acre / ACRES_WW) * 16 + (dans >> 4);
    cases[y * largeur + x] = fleurWW(id) || { objet: id };
  }
  return { largeur, hauteur, cases };
}

// ---------------------------------------------------------------------------
// Navets : les prix de toute la semaine sont dans la sauvegarde.
// ---------------------------------------------------------------------------
// À 0x15F4C (Leaflet ; structure TurnipPrices d'acww-decomp, 0x1A octets) : date du tirage (jour, mois, année − 2000),
// date d'achat, pic du gros pic (u16, à la place du prix 0), 14 prix d'un octet (dimanche matin … samedi après-midi),
// motif (0 fluctuant, 1 gros pic, 2 décroissant, 3 petit pic ; 0xFF = pas encore tiré).
// Vérifié sur une vraie ville européenne : achat 103, puis une baisse de 82 à 53, motif 2 (décroissant).
const NAVETS = 0x15F4C;
export function navetsWW(octets) {
  const { s } = villeValide(octets);
  const prix = Array.from(s.subarray(NAVETS + 0x0A, NAVETS + 0x18));
  const pic = u16(s, NAVETS + 0x08);
  const motif = s[NAVETS + 0x18];
  return {
    semaine: { jour: s[NAVETS], mois: s[NAVETS + 1], annee: 2000 + s[NAVETS + 2] },
    achat: prix[0] || null,
    cours: prix.slice(2).map(p => (p === 0 ? (pic || null) : p)),
    motif: motif <= 3 ? motif : null,
  };
}

// ---------------------------------------------------------------------------
// Magasin de Nook : de quoi recalculer son stock (lib/nook-ww.js).
// ---------------------------------------------------------------------------
// À 0x15DB4 (Leaflet ; NookStore d'acww-decomp) : dépensé (u32), 37 places (codes u16), date du stock (jour, mois,
// année − 2000) à + 0x4E, niveau dans les bits 9-10 du mot à + 0x5A. À 0x15FBC : les 9 octets de l'ordre des
// groupes de rareté de la ville (un par genre d'objets), qui entrent dans la graine du stock de chaque jour.
// Doigts de fée à 0x15F84 : 6 codes (u16, « posés dans une pièce »), puis la date du stock (jour, mois, année − 2000).
const NOOK = 0x15DB4, ORDRES = 0x15FBC, FEE = 0x15F84;
export function nookWW(octets) {
  const { s } = villeValide(octets);
  return {
    ordres: Array.from(s.subarray(ORDRES, ORDRES + 9)),
    niveau: (u16(s, NOOK + 0x5A) >> 9) & 3,
    stock: Array.from({ length: 37 }, (_, i) => u16(s, NOOK + 4 + i * 2)),
    date: { jour: s[NOOK + 0x4E], mois: s[NOOK + 0x4F], annee: 2000 + s[NOOK + 0x50] },
    fee: {
      stock: Array.from({ length: 6 }, (_, i) => u16(s, FEE + i * 2)),
      date: { jour: s[FEE + 12], mois: s[FEE + 13], annee: 2000 + s[FEE + 14] },
    },
  };
}

export function lireSauvegardeWW(octets) {
  const { s, format, base } = villeValide(octets);
  const bit = (debut, n) => (s[debut + (n >> 3)] >> (n & 7)) & 1;
  const joueurs = [0, 1, 2, 3].map(n => {
    const p = DEBUT_JOUEURS + n * TAILLE_JOUEUR;
    const id = u16(s, p + 0x2280);
    const catalogue = new Set();
    for (let k = 0; k < 0x124 * 8; k++) if (bit(p + CATALOGUE, k)) catalogue.add(k);
    const attrapes = new Set();
    for (let k = 1; k <= 112; k++) if (bit(p + ENCYCLOPEDIE, k)) attrapes.add(k);
    return { numero: n + 1, nom: nomDuJeu(s, p + 0x2282), existe: id !== 0 && id !== 0xFFFF, catalogue, attrapes };
  });
  const musee = {};
  for (const [partie, [ofs, nb]] of Object.entries(MUSEE_PARTIES)) {
    musee[partie] = Array.from({ length: nb }, (_, i) => (s[MUSEE + ofs + (i >> 1)] >> ((i & 1) * 4)) & 0x0F);
  }
  return { format, copie: base === COPIES[0] ? 'principale' : 'secours', joueurs, musee };
}

// Ce que l'import cocherait (seulement des ajouts) : [{ categorie, id, obtenu: true, musee?: true }].
export function cochesImportWW(save, correspondance, numeroJoueur) {
  const res = new Map();
  const ajouter = (categorie, id, musee) => {
    if (!id) return;
    const k = `${categorie}:${id}`;
    const x = res.get(k) || { categorie, id, obtenu: true };
    if (musee) x.musee = true;
    res.set(k, x);
  };
  for (const [partie, donneurs] of Object.entries(save.musee)) {
    donneurs.forEach((d, i) => { if (d >= 1 && d <= 5) ajouter(partie, correspondance.musee[partie][i], true); });
  }
  const joueur = save.joueurs.find(j => j.numero === numeroJoueur);
  if (joueur) {
    for (const [cat, { premier, ids }] of Object.entries(correspondance.encyclopedie)) {
      ids.forEach((id, i) => { if (joueur.attrapes.has(premier + i)) ajouter(cat, id, false); });
    }
    for (const c of correspondance.catalogue) if (joueur.catalogue.has(c.bit)) ajouter(c.categorie, c.id, false);
  }
  return [...res.values()];
}
