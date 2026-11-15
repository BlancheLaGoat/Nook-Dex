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

export function lireSauvegardeWW(octets) {
  const { donnees, format } = extraireSauvegarde(octets);
  if (donnees.length < 2 * TAILLE_VILLE) {
    throw new Error("Ce fichier n'est pas une sauvegarde d'Animal Crossing: Wild World : choisis le .sav (ou le .dsv de DeSmuME / RetroArch) du jeu.");
  }
  const valides = COPIES.filter(c => somme16(donnees, c, TAILLE_VILLE) === 0);
  if (!valides.length) throw new Error("La sauvegarde est abîmée, ou ce n'est pas une sauvegarde de Wild World (somme de contrôle fausse sur les deux copies) : rien ne peut être importé.");
  const base = valides[0];
  const s = donnees.subarray(base, base + TAILLE_VILLE);
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
