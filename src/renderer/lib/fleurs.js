// Fleurs hybrides de New Horizons : croisements, recherche inverse, identification, champ.
//
// Données : data/nh/fleurs-genetique.json (recherches d'Aeter, extraites du jeu).
// Un génotype s'écrit avec un chiffre par gène, dans l'ordre R, Y, W (et S pour les roses) :
// 0, 1 ou 2 = nombre de copies du gène. Ex. "2001" = RR yy ww Ss.
// Croisement (hérédité classique, dite « de Mendel ») : pour chaque gène, chaque parent donne une de ses
// deux copies au hasard (un parent « 1 » donne la copie forte une fois sur deux).
//
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/fleurs.test.js.

export const LETTRES = ['R', 'Y', 'W', 'S'];

// "2001" -> "RR yy ww Ss"
export function enLettres(g) {
  return [...g].map((v, i) => {
    const L = LETTRES[i], l = L.toLowerCase();
    return v === '2' ? L + L : v === '1' ? L + l : l + l;
  }).join(' ');
}

// Toutes les combinaisons de gènes possibles pour n gènes : "000", "001", … "222".
export function tousLesGenotypes(n) {
  let res = [''];
  for (let i = 0; i < n; i++) res = res.flatMap(g => ['0', '1', '2'].map(v => g + v));
  return res;
}

// Un gène de l'enfant : distribution { 0, 1, 2 } selon les valeurs des deux parents.
function geneEnfant(a, b) {
  const pa = Number(a) / 2, pb = Number(b) / 2;
  return [(1 - pa) * (1 - pb), pa * (1 - pb) + pb * (1 - pa), pa * pb];
}

// Croisement de deux génotypes : Map(génotype de l'enfant -> probabilité).
export function croiser(g1, g2) {
  if (g1.length !== g2.length) throw new Error(`gènes de longueurs différentes : ${g1} × ${g2}`);
  let res = new Map([['', 1]]);
  for (let i = 0; i < g1.length; i++) {
    const d = geneEnfant(g1[i], g2[i]);
    const suivant = new Map();
    for (const [g, p] of res) d.forEach((q, v) => { if (q > 0) suivant.set(g + v, (suivant.get(g + v) || 0) + p * q); });
    res = suivant;
  }
  return res;
}

// Résultat d'un croisement pour une espèce : par couleur et par génotype, triés du plus probable au moins probable.
//   { couleurs: [{ couleur, p, genotypes: [{ g, p }] }], genotypes: [{ g, couleur, p }] }
export function resultatCroisement(espece, g1, g2) {
  const parCouleur = new Map();
  const genotypes = [];
  for (const [g, p] of croiser(g1, g2)) {
    const couleur = espece.couleurs[g];
    genotypes.push({ g, couleur, p });
    if (!parCouleur.has(couleur)) parCouleur.set(couleur, { couleur, p: 0, genotypes: [] });
    const c = parCouleur.get(couleur);
    c.p += p;
    c.genotypes.push({ g, p });
  }
  const tri = (a, b) => b.p - a.p;
  return {
    couleurs: [...parCouleur.values()].map(c => ({ ...c, genotypes: c.genotypes.sort(tri) })).sort(tri),
    genotypes: genotypes.sort(tri),
  };
}

// Génotypes qui donnent cette couleur, dans l'ordre (graines et îles d'abord).
export function genotypesDeCouleur(espece, couleur) {
  const connus = [...Object.entries(espece.graines), ...Object.entries(espece.iles)].filter(([c]) => c === couleur).map(([, g]) => g);
  const autres = Object.keys(espece.couleurs).filter(g => espece.couleurs[g] === couleur && !connus.includes(g));
  return [...connus, ...autres];
}

// D'où vient une fleur de ce génotype : 'graines', 'iles' ou null (seulement par croisement).
export function origine(espece, g) {
  if (Object.values(espece.graines).includes(g)) return 'graines';
  if (Object.values(espece.iles).includes(g)) return 'iles';
  return null;
}

// Couleurs d'une espèce, avec leurs génotypes et leur origine (glossaire).
export function couleursEspece(espece) {
  const res = new Map();
  for (const [g, c] of Object.entries(espece.couleurs)) {
    if (!res.has(c)) res.set(c, { couleur: c, genotypes: [], graines: null, iles: [] });
    res.get(c).genotypes.push(g);
  }
  for (const [c, g] of Object.entries(espece.graines)) res.get(c).graines = g;
  for (const [c, g] of Object.entries(espece.iles)) res.get(c).iles.push(g);
  return [...res.values()];
}
