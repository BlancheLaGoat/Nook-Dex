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

// ---------------------------------------------------------------------------
// Recherche inverse : « comment obtenir une rose bleue ? »
// ---------------------------------------------------------------------------
// Un « lot » = des fleurs qu'on sait obtenir : leur couleur et la répartition possible de leurs gènes
// (une fleur née d'un croisement peut avoir plusieurs génotypes pour la même couleur).
//   { id, couleur, dist: Map(g -> p), generation, p (chance par croisement), cout, parents: [lotA, lotB] | null, depart }
// cout = nombre moyen de croisements pour l'obtenir : 1 / p, plus le plus long des chemins de ses deux parents
// (qu'on peut faire pousser en même temps). Fleurs de départ : 0. Plus c'est bas, plus le chemin est facile.
// Plusieurs chemins peuvent mener au même lot (même couleur, mêmes gènes possibles) : on garde le moins coûteux.

const cacheCroisements = new Map();
function croiserMemo(g1, g2) {
  const k = g1 < g2 ? `${g1}×${g2}` : `${g2}×${g1}`;
  if (!cacheCroisements.has(k)) cacheCroisements.set(k, croiser(g1, g2));
  return cacheCroisements.get(k);
}

// Croisement de deux lots : Map(génotype -> probabilité) pour l'enfant.
export function croiserLots(distA, distB) {
  const res = new Map();
  for (const [a, pa] of distA) for (const [b, pb] of distB) {
    for (const [g, p] of croiserMemo(a, b)) res.set(g, (res.get(g) || 0) + pa * pb * p);
  }
  return res;
}

const signature = (couleur, dist) => `${couleur}:${[...dist].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([g, p]) => `${g}=${p.toFixed(6)}`).join(',')}`;

// Lots de départ : fleurs de graines (et des îles si demandé), aux gènes connus.
export function lotsDeDepart(espece, { iles = false } = {}) {
  const lots = Object.entries(espece.graines).map(([c, g]) => ({ couleur: c, g, depart: 'graines' }));
  if (iles) lots.push(...Object.entries(espece.iles).map(([c, g]) => ({ couleur: c, g, depart: 'iles' })));
  return lots.map((x, i) => ({ id: `d${i}`, couleur: x.couleur, dist: new Map([[x.g, 1]]), generation: 0, p: 1, cout: 0, parents: null, depart: x.depart }));
}

// Chemins pour obtenir une couleur. Renvoie les meilleurs lots de cette couleur (au plus « nombre »),
// du plus facile au plus difficile. Options : iles (partir aussi des fleurs des îles), generationsMax,
// parCouleur (lots gardés par couleur à chaque génération : plus c'est grand, plus c'est complet mais lent).
export function rechercherChemins(espece, cible, { iles = false, generationsMax = 4, parCouleur = 16, nombre = 3 } = {}) {
  let lots = lotsDeDepart(espece, { iles });
  const vus = new Map(lots.map(l => [signature(l.couleur, l.dist), l]));
  let n = lots.length;
  const trouves = lots.filter(l => l.couleur === cible);
  for (let gen = 1; gen <= generationsMax; gen++) {
    const nouveaux = new Map(); // signature -> meilleur lot de cette génération
    for (let i = 0; i < lots.length; i++) {
      for (let j = i; j < lots.length; j++) {
        const A = lots[i], B = lots[j];
        if (A.generation < gen - 1 && B.generation < gen - 1) continue; // déjà essayé à la génération d'avant
        const enfant = croiserLots(A.dist, B.dist);
        const parCouleurEnfant = new Map();
        for (const [g, p] of enfant) {
          const c = espece.couleurs[g];
          if (!parCouleurEnfant.has(c)) parCouleurEnfant.set(c, new Map());
          parCouleurEnfant.get(c).set(g, p);
        }
        for (const [c, dist] of parCouleurEnfant) {
          const p = [...dist.values()].reduce((s, x) => s + x, 0);
          for (const [g, x] of dist) dist.set(g, x / p);
          const sig = signature(c, dist);
          const cout = 1 / p + Math.max(A.cout, B.cout);
          const deja = vus.get(sig) || nouveaux.get(sig);
          // Déjà connu par un chemin moins coûteux : on garde l'ancien.
          if (deja && deja.cout <= cout) continue;
          nouveaux.set(sig, { id: deja ? deja.id : `l${n++}`, couleur: c, dist, generation: gen, p, cout, parents: [A, B] });
        }
      }
    }
    for (const [sig, l] of nouveaux) vus.set(sig, l);
    // On ne garde que les meilleurs lots de chaque couleur pour la génération suivante.
    const parC = new Map();
    for (const l of [...nouveaux.values()].sort((a, b) => a.cout - b.cout)) {
      if (!parC.has(l.couleur)) parC.set(l.couleur, []);
      if (parC.get(l.couleur).length < parCouleur) parC.get(l.couleur).push(l);
    }
    for (const l of nouveaux.values()) if (l.couleur === cible) { const i = trouves.findIndex(t => t.id === l.id); if (i >= 0) trouves[i] = l; else trouves.push(l); }
    lots = [...lots, ...[...parC.values()].flat()];
  }
  return trouves.sort((a, b) => a.cout - b.cout).slice(0, nombre);
}

// Étapes d'un chemin, dans l'ordre où les faire : [{ lot, parents: [A, B] }] (sans les fleurs de départ).
export function etapesChemin(lot) {
  const etapes = [];
  const faits = new Set();
  const visiter = l => {
    if (!l.parents || faits.has(l.id)) return;
    l.parents.forEach(visiter);
    faits.add(l.id);
    etapes.push({ lot: l, parents: l.parents });
  };
  visiter(lot);
  return etapes;
}
