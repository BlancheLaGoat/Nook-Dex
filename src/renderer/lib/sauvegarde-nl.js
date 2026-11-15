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

// ---------------------------------------------------------------------------
// Fleurs de la ville et leurs gènes.
// ---------------------------------------------------------------------------
// Objets de la carte : 5 × 4 acres de 16 × 16 cases à partir de 0x534D8 (données de la ville à 0x53424, + 0xB4),
// rangés acre par acre (acre 0 = en haut à gauche, puis vers la droite). Chaque objet fait 4 octets :
// identifiant (u16), octet des gènes, octet de drapeaux (arrosé = bit 6, enterré = bit 7). Case vide : 0x7FFE.
// Octet des gènes : 2 bits par gène, du premier au dernier gène (R, Y, W puis S pour les roses), 00 = 0, 01 = 1, 11 = 2,
// soit la même notation que les gènes de New Horizons (rose rouge des graines : 0xC1 = « 2001 »).
// Vérifié sur trois vraies villes : pour les 156 tulipes, pensées, cosmos et lys et les roses venues du jeu, la couleur
// donnée par les gènes est celle de l'objet. Les fleurs posées par un éditeur de sauvegarde ont souvent un octet à 0.
export const ACRES_LARGEUR = 5, ACRES_HAUTEUR = 4;
const OBJETS_VILLE = 0x534D8;
const VIDE = 0x7FFE;
// Objets fleurs, à partir de 0x9F (les mêmes fanées à + 0x2F) : espèce (identifiant de New Horizons) et couleurs dans l'ordre.
const OBJETS_FLEURS = [
  ['tulipes', ['rouge', 'blanc', 'jaune', 'rose', 'violet', 'noir', 'orange']],
  ['pensees', ['blanc', 'jaune', 'rouge', 'violet', 'orange', 'bleu']],
  ['cosmos', ['blanc', 'rouge', 'jaune', 'rose', 'orange', 'noir']],
  ['roses', ['rouge', 'blanc', 'jaune', 'rose', 'orange', 'violet', 'noir', 'bleu', 'or']],
  ['oeillets', ['rouge', 'rose', 'blanc']],
  ['lys', ['blanc', 'jaune', 'rouge', 'orange', 'rose', 'noir']],
  ['violettes', ['violet', 'bleu', 'blanc', 'jaune']],
];
const FLEURS = new Map();
{
  let id = 0x9F;
  for (const [espece, couleurs] of OBJETS_FLEURS) for (const couleur of couleurs) { FLEURS.set(id, { espece, couleur }); id++; }
}
const NB_OBJETS_FLEURS = FLEURS.size;
// Nombre de gènes par espèce (roses : 4 ; œillets : 2 ; les autres : 3).
export const NB_GENES = { roses: 4, oeillets: 2 };

// Octet des gènes -> notation « 2001 » (null si un gène vaut 10, qui n'existe pas).
export function genesDepuisOctet(octet, n) {
  let g = '';
  for (let k = n - 1; k >= 0; k--) {
    const v = (octet >> (2 * k)) & 3;
    if (v === 2) return null;
    g += v === 3 ? '2' : String(v);
  }
  return g;
}

// Objets de la ville : { largeur: 80, hauteur: 64, cases: [null | { objet: id } | { espece, couleur, fanee, arrosee, octet, g }] }
// (cases rangées ligne par ligne sur toute la carte ; une case avec seulement « objet » est occupée par autre chose qu'une fleur).
export function fleursVilleNL(octets) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  if (o.length !== TAILLE_WA) throw new Error("Ce fichier n'est pas une sauvegarde de New Leaf - Welcome amiibo (« garden_plus.dat »).");
  const largeur = ACRES_LARGEUR * 16, hauteur = ACRES_HAUTEUR * 16;
  const cases = Array.from({ length: largeur * hauteur }, () => null);
  for (let i = 0; i < largeur * hauteur; i++) {
    const p = OBJETS_VILLE + i * 4;
    const id = u16(o, p);
    if (id === VIDE || (o[p + 3] >> 7) & 1) continue; // vide, ou objet enterré (la surface est libre)
    const acre = i >> 8, dans = i & 0xFF;
    const x = (acre % ACRES_LARGEUR) * 16 + (dans & 15), y = Math.floor(acre / ACRES_LARGEUR) * 16 + (dans >> 4);
    const fanee = id >= 0x9F + 0x2F && id < 0x9F + 0x2F + NB_OBJETS_FLEURS;
    const fleur = FLEURS.get(fanee ? id - 0x2F : id);
    cases[y * largeur + x] = fleur
      ? { ...fleur, fanee, arrosee: ((o[p + 3] >> 6) & 1) === 1, octet: o[p + 2], g: genesDepuisOctet(o[p + 2], NB_GENES[fleur.espece] || 3) }
      : { objet: id };
  }
  return { largeur, hauteur, cases };
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
