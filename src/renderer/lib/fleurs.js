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

// ---------------------------------------------------------------------------
// Champ : grille où l'on place des fleurs et des cases bloquées.
// ---------------------------------------------------------------------------
// Une case : null (libre), { bloque: true }, ou { espece: 'roses', g: '2001' }.
// Dans le jeu, une fleur arrosée peut se reproduire avec une fleur de la même espèce sur une des 8 cases
// autour d'elle ; l'enfant pousse sur une case libre voisine. Sans voisine de son espèce, elle peut se cloner.
export const CHAMP_MAX = 16;

export function champVide(largeur = 8, hauteur = 6) {
  return { largeur, hauteur, cases: Array.from({ length: largeur * hauteur }, () => null) };
}

// Champ lu dans un profil, ramené à une forme sûre (espèces et gènes vérifiés).
export function normaliserChamp(c, especes) {
  const taille = (x, defaut) => Math.max(2, Math.min(CHAMP_MAX, Number.isInteger(x) ? x : defaut));
  const largeur = taille(c && c.largeur, 8), hauteur = taille(c && c.hauteur, 6);
  const res = champVide(largeur, hauteur);
  if (!c || !Array.isArray(c.cases) || c.largeur !== largeur) return res;
  c.cases.slice(0, largeur * hauteur).forEach((x, i) => {
    if (!x || typeof x !== 'object') return;
    if (x.bloque === true) res.cases[i] = { bloque: true };
    const e = especes.find(s => s.id === x.espece);
    if (e && typeof x.g === 'string' && e.couleurs[x.g]) res.cases[i] = { espece: e.id, g: x.g };
  });
  return res;
}

const VOISINS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
export function voisins(champ, i) {
  const x = i % champ.largeur, y = Math.floor(i / champ.largeur);
  return VOISINS.map(([dx, dy]) => [x + dx, y + dy])
    .filter(([a, b]) => a >= 0 && b >= 0 && a < champ.largeur && b < champ.hauteur)
    .map(([a, b]) => b * champ.largeur + a);
}

// Bilan du champ :
//   couples : [{ a, b, espece, resultat }] (chaque paire de voisines de la même espèce, une seule fois)
//   fleurs : [{ i, partenaires: [indices], libres: nombre de cases libres autour, clone: true si pas de partenaire }]
export function bilanChamp(champ, especes) {
  const espece = id => especes.find(e => e.id === id);
  const couples = [];
  const fleurs = [];
  champ.cases.forEach((c, i) => {
    if (!c || c.bloque) return;
    const v = voisins(champ, i);
    const partenaires = v.filter(j => champ.cases[j] && champ.cases[j].espece === c.espece);
    const libres = v.filter(j => !champ.cases[j]).length;
    fleurs.push({ i, partenaires, libres, clone: partenaires.length === 0 });
    for (const j of partenaires) {
      if (j <= i) continue;
      const e = espece(c.espece);
      couples.push({ a: i, b: j, espece: c.espece, resultat: resultatCroisement(e, c.g, champ.cases[j].g) });
    }
  });
  return { couples, fleurs };
}

// Prévisions du champ : pour chaque case libre, les enfants qui peuvent y pousser.
// Modèle (estimation) : une fleur qui se reproduit choisit au hasard une de ses voisines de la même espèce
// (sans voisine, elle se clone), et l'enfant pousse sur une de SES cases libres voisines, au hasard.
// Une case reçoit donc les enfants de chaque fleur qui la touche ; on pèse chaque possibilité
// par 1 / (nombre de partenaires de la fleur) × 1 / (nombre de cases libres autour d'elle).
//   Map(indice de la case libre -> [{ espece, couleurs: [{ couleur, p }], genotypes: [{ g, p }], couples: [[a, b]], clones: [a] }])
//   (une entrée par espèce qui peut pousser là ; p = probabilité de chaque couleur si un enfant de cette espèce pousse ici)
export function previsionsChamp(champ, especes) {
  const espece = id => especes.find(e => e.id === id);
  return previsionsGeneriques(champ, {
    enfants: (c, d) => croiserMemo(c.g, d.g),
    cle: c => c.g,
    couleur: (idEspece, g) => espece(idEspece).couleurs[g],
  });
}

// Même calcul pour les anciens jeux (Wild World, City Folk, New Leaf), sans gènes : une case vaut { espece, couleur }
// et les enfants viennent des règles connues. Leurs chances ne sont pas connues : chaque enfant possible
// d'une règle reçoit la même part. Un couple sans règle connue ne compte pas (on ne sait pas ce qu'il donne).
//   regles : [{ espece, parents: [c1, c2], enfants: [couleurs] }] (espece = id de l'espèce dans le champ)
export function enfantsSelonRegles(regles, espece, c1, c2) {
  const r = regles.find(x => x.espece === espece && ((x.parents[0] === c1 && x.parents[1] === c2) || (x.parents[0] === c2 && x.parents[1] === c1)));
  return r ? r.enfants : null;
}

// Couleurs qu'on peut planter pour une espèce des anciens jeux : celles de la page, plus celles des règles
// (ex. « rouge « spécial » » de New Leaf), sauf ce qui n'est pas une fleur (« arrosoir en or »).
export function couleursPlantables(espece, regles) {
  const res = espece.couleurs.map(c => c.couleur);
  for (const r of regles.filter(x => x.espece === espece.nom)) {
    for (const c of [...r.parents, ...r.enfants]) if (!/arrosoir/i.test(c) && !res.includes(c)) res.push(c);
  }
  return res;
}

// Champ d'un ancien jeu lu dans un profil : cases { espece: nom, couleur } vérifiées.
export function normaliserChampRegles(c, especes, regles) {
  const taille = (x, defaut) => Math.max(2, Math.min(CHAMP_MAX, Number.isInteger(x) ? x : defaut));
  const largeur = taille(c && c.largeur, 8), hauteur = taille(c && c.hauteur, 6);
  const res = champVide(largeur, hauteur);
  if (!c || !Array.isArray(c.cases) || c.largeur !== largeur) return res;
  c.cases.slice(0, largeur * hauteur).forEach((x, i) => {
    if (!x || typeof x !== 'object') return;
    if (x.bloque === true) res.cases[i] = { bloque: true };
    const e = especes.find(s => s.nom === x.espece);
    if (e && couleursPlantables(e, regles).includes(x.couleur)) res.cases[i] = { espece: e.nom, couleur: x.couleur };
  });
  return res;
}

export function previsionsChampRegles(champ, regles) {
  return previsionsGeneriques(champ, {
    enfants: (c, d) => {
      const l = enfantsSelonRegles(regles, c.espece, c.couleur, d.couleur);
      return l ? new Map(l.map(x => [x, 1 / l.length])) : null;
    },
    cle: c => c.couleur,
    couleur: (_e, couleur) => couleur,
  });
}

// Calcul commun : outils.enfants(fleur, partenaire) -> Map(clé de l'enfant -> probabilité) ou null (inconnu),
// outils.cle(fleur) = clé d'un clone, outils.couleur(espèce, clé) = couleur affichée.
function previsionsGeneriques(champ, outils) {
  const cases = new Map();
  champ.cases.forEach((c, i) => {
    if (!c || c.bloque) return;
    const v = voisins(champ, i);
    const libres = v.filter(j => !champ.cases[j]);
    if (!libres.length) return;
    const partenaires = v.filter(j => champ.cases[j] && champ.cases[j].espece === c.espece);
    const couple = j => [Math.min(i, j), Math.max(i, j)];
    const issues = partenaires.length
      ? partenaires.map(j => ({ poids: 1 / partenaires.length, enfants: outils.enfants(c, champ.cases[j]), couple: couple(j) }))
      : [{ poids: 1, enfants: new Map([[outils.cle(c), 1]]), clone: i }];
    for (const j of libres) {
      if (!cases.has(j)) cases.set(j, new Map());
      const parEspece = cases.get(j);
      if (!parEspece.has(c.espece)) parEspece.set(c.espece, { poids: 0, genotypes: new Map(), couples: new Set(), clones: new Set(), inconnus: new Set() });
      const x = parEspece.get(c.espece);
      for (const issue of issues) {
        if (!issue.enfants) { x.inconnus.add(issue.couple.join('-')); continue; } // couple sans règle connue
        const w = issue.poids / libres.length;
        x.poids += w;
        for (const [g, p] of issue.enfants) x.genotypes.set(g, (x.genotypes.get(g) || 0) + w * p);
        if (issue.couple) x.couples.add(issue.couple.join('-'));
        if (issue.clone !== undefined) x.clones.add(issue.clone);
      }
    }
  });
  const res = new Map();
  for (const [j, parEspece] of cases) {
    const liste = [...parEspece].map(([id, x]) => {
      const genotypes = x.poids ? [...x.genotypes].map(([g, p]) => ({ g, p: p / x.poids })).sort((a, b) => b.p - a.p) : [];
      const parCouleur = new Map();
      for (const { g, p } of genotypes) { const k = outils.couleur(id, g); parCouleur.set(k, (parCouleur.get(k) || 0) + p); }
      return {
        espece: id,
        poids: x.poids,
        couleurs: [...parCouleur].map(([couleur, p]) => ({ couleur, p })).sort((a, b) => b.p - a.p),
        genotypes,
        couples: [...x.couples].map(k => k.split('-').map(Number)),
        clones: [...x.clones],
        inconnus: [...x.inconnus].map(k => k.split('-').map(Number)),
      };
    }).filter(x => x.couleurs.length || x.inconnus.length).sort((a, b) => b.poids - a.poids);
    if (liste.length) res.set(j, liste);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Identifier une fleur : quels gènes a-t-elle, et quel croisement test le dira ?
// ---------------------------------------------------------------------------
// Hypothèses : [{ g, p }] (génotypes possibles et leur probabilité), triées de la plus probable à la moins probable.
//   parents : [g1, g2] si la fleur vient d'un croisement connu ; sinon tous les génotypes de sa couleur, à égalité.
export function hypotheses(espece, couleur, { parents = null } = {}) {
  let liste;
  if (parents) {
    liste = [...croiser(parents[0], parents[1])].filter(([g]) => espece.couleurs[g] === couleur).map(([g, p]) => ({ g, p }));
  } else {
    liste = Object.keys(espece.couleurs).filter(g => espece.couleurs[g] === couleur).map(g => ({ g, p: 1 }));
  }
  const total = liste.reduce((s, x) => s + x.p, 0);
  return total > 0 ? liste.map(x => ({ g: x.g, p: x.p / total })).sort((a, b) => b.p - a.p) : [];
}

// Couleurs des enfants d'un croisement : Map(couleur -> p).
function couleursEnfants(espece, g1, g2) {
  const res = new Map();
  for (const [g, p] of croiserMemo(g1, g2)) res.set(espece.couleurs[g], (res.get(espece.couleurs[g]) || 0) + p);
  return res;
}

const entropie = ps => ps.reduce((s, p) => (p > 0 ? s - p * Math.log2(p) : s), 0);

// Meilleurs croisements tests avec une fleur aux gènes connus (graines, et îles si demandé).
// gain = ce qu'un enfant apprend en moyenne sur les gènes (en bits) : plus c'est haut, mieux le test départage.
// Renvoie [{ testeur: { couleur, g, depart }, gain, table: [{ g, p, couleurs: Map }], decisives: [couleurs qui écartent au moins une hypothèse] }].
export function meilleursTests(espece, hyps, { iles = true, nombre = 3 } = {}) {
  if (hyps.length < 2) return [];
  const testeurs = Object.entries(espece.graines).map(([couleur, g]) => ({ couleur, g, depart: 'graines' }));
  if (iles) testeurs.push(...Object.entries(espece.iles).map(([couleur, g]) => ({ couleur, g, depart: 'iles' })));
  const avant = entropie(hyps.map(h => h.p));
  return testeurs.map(t => {
    const table = hyps.map(h => ({ g: h.g, p: h.p, couleurs: couleursEnfants(espece, h.g, t.g) }));
    const couleurs = new Set(table.flatMap(r => [...r.couleurs.keys()]));
    let apres = 0;
    for (const c of couleurs) {
      const pc = table.reduce((s, r) => s + r.p * (r.couleurs.get(c) || 0), 0);
      if (pc > 0) apres += pc * entropie(table.map(r => (r.p * (r.couleurs.get(c) || 0)) / pc));
    }
    const decisives = [...couleurs].filter(c => table.some(r => !r.couleurs.get(c)));
    return { testeur: t, gain: avant - apres, table, decisives };
  }).filter(x => x.gain > 1e-9).sort((a, b) => b.gain - a.gain).slice(0, nombre);
}

// Mise à jour après un croisement test : couleurs des enfants obtenus avec ce testeur.
export function miseAJour(espece, hyps, testeurG, couleursObtenues) {
  const liste = hyps.map(h => {
    const d = couleursEnfants(espece, h.g, testeurG);
    return { g: h.g, p: couleursObtenues.reduce((p, c) => p * (d.get(c) || 0), h.p) };
  }).filter(h => h.p > 0);
  const total = liste.reduce((s, x) => s + x.p, 0);
  return liste.map(x => ({ g: x.g, p: x.p / total })).sort((a, b) => b.p - a.p);
}
