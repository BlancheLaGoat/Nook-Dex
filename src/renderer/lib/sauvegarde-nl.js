// Lecture d'une sauvegarde de New Leaf - Welcome amiibo (3DS) : musée et objets débloqués. LECTURE SEULE.
//
// Format (Slattz, Le0X8, plugin Vapecord de RedShyGuy) :
//  - fichier « garden_plus.dat » de 0x89B00 octets, tel que l'exportent Checkpoint, JKSM ou Citra ;
//    l'ancien « garden.dat » (jeu jamais mis à jour en 1.5) n'est pas pris en charge ;
//  - joueurs : 4 × 0xA480 octets à partir de 0xA0 ; identifiant à +0x55A6 (0 = pas de joueur), nom à +0x55A8
//    (UTF-16, 8 caractères) ; objets débloqués à +0x6C20 : bit n = objet 0x2000 + n (catalogue et encyclopédie) ;
//  - musée : 274 octets à 0x6B300 (qui l'a donné : 1 à 4), dates des dons à 0x6AEB8.
// Vérifié sur deux vraies villes (dépôt Le0X8/acnl-research).
//
// Ce fichier ne fait que des calculs (pas d'affichage).

export const TAILLE_WA = 0x89B00;
const TAILLE_ANCIENNE = 0x7FA00;
const DEBUT_JOUEURS = 0xA0;
const TAILLE_JOUEUR = 0xA480;
const DEBLOQUES = 0x6C20;
const NB_DEBLOQUES = 0x2E8 * 8;
const MUSEE = 0x6B300;
const NB_MUSEE = 274;

const u16 = (o, i) => o[i] | (o[i + 1] << 8);

function texteUtf16(o, debut, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const c = u16(o, debut + i * 2);
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

export function lireSauvegardeNL(octets) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  if (o.length === TAILLE_ANCIENNE) {
    throw new Error("C'est un « garden.dat » d'avant la mise à jour Welcome amiibo : lance le jeu à jour (1.5) une fois, puis exporte « garden_plus.dat ».");
  }
  if (o.length !== TAILLE_WA) {
    throw new Error("Ce fichier n'est pas une sauvegarde de New Leaf : choisis « garden_plus.dat » (exporté avec Checkpoint, JKSM ou Citra).");
  }
  const joueurs = [0, 1, 2, 3].map(n => {
    const p = DEBUT_JOUEURS + n * TAILLE_JOUEUR;
    const id = u16(o, p + 0x55A6);
    const debloques = new Set();
    for (let k = 0; k < NB_DEBLOQUES; k++) if ((o[p + DEBLOQUES + (k >> 3)] >> (k & 7)) & 1) debloques.add(k);
    return { numero: n + 1, nom: texteUtf16(o, p + 0x55A8, 8), existe: id !== 0 && id !== 0xFFFF, debloques };
  });
  if (!joueurs.some(j => j.existe)) throw new Error("Cette sauvegarde n'a aucun joueur : ce n'est peut-être pas une sauvegarde de New Leaf.");
  const musee = Array.from(o.subarray(MUSEE, MUSEE + NB_MUSEE));
  if (musee.some(d => d > 5)) throw new Error("Le musée de cette sauvegarde est illisible : ce n'est peut-être pas une sauvegarde de New Leaf - Welcome amiibo.");
  return { format: 'garden_plus', joueurs, musee };
}

// Ce que l'import cocherait (seulement des ajouts) : [{ categorie, id, obtenu: true, musee?: true }].
export function cochesImportNL(save, correspondance, numeroJoueur) {
  const res = new Map();
  const ajouter = (categorie, id, musee) => {
    if (!id) return;
    const k = `${categorie}:${id}`;
    const x = res.get(k) || { categorie, id, obtenu: true };
    if (musee) x.musee = true;
    res.set(k, x);
  };
  let i = 0;
  for (const { categorie, ids } of correspondance.musee) {
    for (const id of ids) { const d = save.musee[i++]; if (d >= 1 && d <= 4) ajouter(categorie, id, true); }
  }
  const joueur = save.joueurs.find(j => j.numero === numeroJoueur);
  if (joueur) for (const c of correspondance.debloques) if (joueur.debloques.has(c.bit)) ajouter(c.categorie, c.id, false);
  return [...res.values()];
}
