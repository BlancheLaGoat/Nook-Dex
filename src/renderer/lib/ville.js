// Ville parfaite de Wild World : score des acres, rangs, cibles et suggestions.
//
// Toutes les valeurs viennent de data/arrosoir/regles.json (règles lues dans le code du jeu) :
// ce fichier ne contient aucun nombre du jeu écrit en dur. Il ne fait que des calculs (pas d'affichage)
// et il est testé par tests/ville.test.js.
//
// Une acre de la carte, telle qu'elle est enregistrée dans le profil :
//   { modele: "草原|14|C2" (clé du modèle) ou null,
//     changements: { "x,y": objet | null },   // objet ajouté, ou null = objet du modèle retiré
//     mauvaises_herbes, objets_au_sol, dechets, rafflesia,   // nombres saisis à la main
//     maisons_sur_panneaux: false,             // true = les arbres « conditionnels » ne poussent pas
//     cible_arbres: null, cible_fleurs: null } // valeurs forcées à la main (sinon calculées)

export const NB_ACRES = 16;

export function acreVide() {
  return { modele: null, changements: {}, mauvaises_herbes: 0, objets_au_sol: 0, dechets: 0, rafflesia: 0, maisons_sur_panneaux: false, cible_arbres: null, cible_fleurs: null };
}

export function villeVide() {
  return { acres: Array.from({ length: NB_ACRES }, acreVide), jours: [] };
}

// Ramène une ville lue dans un profil ou un fichier importé à une forme sûre.
export function normaliserVille(v) {
  const res = villeVide();
  if (!v || typeof v !== 'object') return res;
  const entier = (x, max = 999) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(max, Math.round(Number(x)))) : 0);
  const facultatif = x => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : entier(x));
  (Array.isArray(v.acres) ? v.acres : []).slice(0, NB_ACRES).forEach((a, i) => {
    if (!a || typeof a !== 'object') return;
    const changements = {};
    for (const [k, o] of Object.entries(a.changements || {})) {
      if (!/^\d{1,2},\d{1,2}$/.test(k)) continue;
      if (o === null) changements[k] = null;
      else if (o && typeof o.o === 'string') changements[k] = o.o === 'fleur' ? { o: 'fleur', couleur: String(o.couleur || ''), type: String(o.type || '') } : { o: o.o };
    }
    res.acres[i] = {
      modele: typeof a.modele === 'string' ? a.modele : null,
      changements,
      mauvaises_herbes: entier(a.mauvaises_herbes), objets_au_sol: entier(a.objets_au_sol),
      dechets: entier(a.dechets), rafflesia: entier(a.rafflesia, 1),
      maisons_sur_panneaux: !!a.maisons_sur_panneaux,
      cible_arbres: facultatif(a.cible_arbres), cible_fleurs: facultatif(a.cible_fleurs),
    };
  });
  res.jours = [...new Set((Array.isArray(v.jours) ? v.jours : []).filter(j => /^\d{4}-\d{2}-\d{2}$/.test(j)))].sort();
  return res;
}

const estArbre = o => o === 'arbre' || o === 'fruitier' || o === 'arbre-conditionnel' || o === 'fruitier-conditionnel';
const estConditionnel = o => o === 'arbre-conditionnel' || o === 'fruitier-conditionnel';

// Objets présents dans l'acre : ceux du modèle, avec les changements de la joueuse.
// Map "x,y" -> objet. Les arbres conditionnels disparaissent si une maison est construite sur le panneau.
export function objetsAcre(modele, acre) {
  const res = new Map();
  if (modele) for (const ob of modele.objets) res.set(`${ob.x},${ob.y}`, ob);
  for (const [k, o] of Object.entries(acre.changements || {})) {
    if (o === null) res.delete(k);
    else { const [x, y] = k.split(',').map(Number); res.set(k, { x, y, ...o }); }
  }
  if (acre.maisons_sur_panneaux) for (const [k, o] of res) if (estConditionnel(o.o)) res.delete(k);
  return res;
}

// Arbres et fleurs de l'acre (fleurs avec le détail « type|couleur » -> nombre).
export function compterAcre(modele, acre) {
  let arbres = 0, fleurs = 0;
  const detailFleurs = {};
  for (const o of objetsAcre(modele, acre).values()) {
    if (estArbre(o.o)) arbres++;
    else if (o.o === 'fleur') {
      fleurs++;
      const k = `${o.type}|${o.couleur}`;
      detailFleurs[k] = (detailFleurs[k] || 0) + 1;
    }
  }
  return { arbres, fleurs, detailFleurs };
}

// Pénalités et bonus de chaque règle, puis le score (départ + somme).
export function scoreAcre(compte, acre, regles) {
  const s = regles.score;
  const a = s.arbres;
  const ecartArbres = compte.arbres < a.min ? a.min - compte.arbres : compte.arbres > a.max ? compte.arbres - a.max : 0;
  const auDela = (n, r) => Math.max(0, n - (r.tolere || 0));
  const parts = {
    arbres: ecartArbres * a.par_ecart,
    mauvaises_herbes: auDela(acre.mauvaises_herbes, s.mauvaises_herbes) * s.mauvaises_herbes.par_unite,
    objets_au_sol: auDela(acre.objets_au_sol, s.objets_au_sol) * s.objets_au_sol.par_unite,
    dechets: acre.dechets * s.dechets.par_unite,
    rafflesia: acre.rafflesia * s.rafflesia.par_unite,
    fleurs: auDela(compte.fleurs, s.fleurs) * s.fleurs.par_unite,
  };
  const total = s.depart + Object.values(parts).reduce((x, y) => x + y, 0);
  return { total, parts, ecartArbres };
}

export function rangAcre(score, regles) {
  for (const r of regles.rangs_acre) if (r.a_partir_de === null || score >= r.a_partir_de) return r.rang;
  return 0;
}

// Rang de la ville : les tests de regles.rang_ville, dans l'ordre ; le premier vrai donne le rang.
export function rangVille(rangs, regles) {
  for (const t of regles.rang_ville) {
    if (t.test === 'toutes_au_rang' && rangs.every(r => r === t.rang_acre)) return { rang: t.rang, raison: t.texte };
    if (t.test === 'au_moins_une_au_rang_ou_moins' && rangs.some(r => r <= t.rang_acre)) return { rang: t.rang, raison: t.texte };
    if (t.test === 'moins_de_n_au_rang' && rangs.filter(r => r >= t.rang_acre).length < t.n) return { rang: t.rang, raison: t.texte };
    if (t.test === 'sinon') return { rang: t.rang, raison: t.texte };
  }
  return { rang: 0, raison: '' };
}

// Pénalités « à compenser » : tout ce qui fait baisser le score, sauf les arbres (on les corrige en plantant ou en coupant).
const penalitesHorsArbres = sc => -(sc.parts.mauvaises_herbes + sc.parts.objets_au_sol + sc.parts.dechets + sc.parts.rafflesia);

// Cibles de l'acre : arbres entre min et max (ou la valeur forcée), fleurs = 3 + pénalités à compenser (ou forcée).
export function ciblesAcre(compte, acre, sc, regles) {
  const a = regles.cibles.arbres;
  const arbresAuto = Math.min(a.max, Math.max(a.min, compte.arbres));
  const fleursAuto = regles.cibles.fleurs_de_base + penalitesHorsArbres(sc);
  return {
    arbres: acre.cible_arbres != null ? acre.cible_arbres : arbresAuto,
    arbres_force: acre.cible_arbres != null,
    arbres_plage: [a.min, a.max],
    fleurs: acre.cible_fleurs != null ? acre.cible_fleurs : fleursAuto,
    fleurs_force: acre.cible_fleurs != null,
  };
}

const pluriel = (n, un, plusieurs) => `${n} ${Math.abs(n) > 1 ? plusieurs : un}`;
const signe = n => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

// Ce qui manque pour atteindre les cibles, en clair : « +2 arbres », « +1 fleur », « −1 mauvaise herbe ».
// cout = nombre d'actions (pour classer les acres les plus faciles à passer au rang 4).
export function actionsAcre(compte, acre, cibles, regles) {
  const s = regles.score;
  const actions = [];
  const dArbres = cibles.arbres - compte.arbres;
  if (dArbres) actions.push(`${signe(dArbres)} ${Math.abs(dArbres) > 1 ? 'arbres' : 'arbre'}`);
  const enTrop = (n, r) => Math.max(0, n - (r.tolere || 0));
  const h = enTrop(acre.mauvaises_herbes, s.mauvaises_herbes);
  const ob = enTrop(acre.objets_au_sol, s.objets_au_sol);
  const fleursManquantes = Math.max(0, cibles.fleurs - compte.fleurs);
  if (fleursManquantes) actions.push(`+${pluriel(fleursManquantes, 'fleur', 'fleurs')}`);
  // Autre façon d'y arriver : enlever ce qui pénalise (alors fleurs_de_base fleurs suffisent).
  const enlever = [];
  if (h) enlever.push(`−${pluriel(h, 'mauvaise herbe', 'mauvaises herbes')}`);
  if (ob) enlever.push(`−${pluriel(ob, 'objet au sol', 'objets au sol')}`);
  if (acre.dechets) enlever.push(`−${pluriel(acre.dechets, 'déchet', 'déchets')}`);
  if (acre.rafflesia) enlever.push('−1 rafflésia');
  const fleursSiOnEnleve = Math.max(0, regles.cibles.fleurs_de_base - compte.fleurs);
  const cout = Math.abs(dArbres) + Math.min(fleursManquantes, h + ob + acre.dechets + acre.rafflesia + fleursSiOnEnleve);
  return { actions, enlever, fleursSiOnEnleve, cout };
}

// Tout ce qu'il faut pour une acre, en un appel.
export function bilanAcre(modele, acre, regles) {
  const compte = compterAcre(modele, acre);
  const sc = scoreAcre(compte, acre, regles);
  const rang = rangAcre(sc.total, regles);
  const cibles = ciblesAcre(compte, acre, sc, regles);
  const act = actionsAcre(compte, acre, cibles, regles);
  // Calcul du tableur japonais, à l'identique : idéal (saisi à la main) − actuel = à planter.
  const tableur = acre.cible_arbres != null ? { ideal: acre.cible_arbres, actuel: compte.arbres, a_planter: acre.cible_arbres - compte.arbres } : null;
  return { compte, score: sc, rang, cibles, ...act, tableur };
}

// La ville entière : bilan des 16 acres, rang, compteur des acres au rang 4, suggestion des 8 plus faciles.
export function bilanVille(modelesParCle, ville, regles) {
  const acres = ville.acres.map(a => bilanAcre(a.modele ? modelesParCle.get(a.modele) || null : null, a, regles));
  const rangs = acres.map(b => b.rang);
  const rv = rangVille(rangs, regles);
  const objectif = regles.ville_parfaite;
  const auRang4 = rangs.filter(r => r >= objectif.rang).length;
  const suggestion = acres.map((b, i) => ({ i, cout: b.rang >= objectif.rang ? 0 : b.cout }))
    .sort((x, y) => x.cout - y.cout || x.i - y.i).slice(0, objectif.acres_rang_4).map(x => x.i).sort((x, y) => x - y);
  const totalTableur = acres.some(b => b.tableur) ? acres.reduce((s, b) => s + (b.tableur ? b.tableur.a_planter : 0), 0) : null;
  return { acres, rang: rv.rang, raison: rv.raison, auRang4, objectif, suggestion, totalTableur };
}

// ---------- Compteur de l'arrosoir en or ----------
const jourSuivant = j => { const d = new Date(`${j}T12:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Nombre de jours d'affilée cochés, en finissant par le dernier jour coché.
export function joursDAffilee(jours) {
  const l = [...new Set(jours)].sort();
  if (!l.length) return { serie: 0, debut: null, fin: null };
  let serie = 1, debut = l[l.length - 1];
  for (let i = l.length - 1; i > 0; i--) {
    if (jourSuivant(l[i - 1]) !== l[i]) break;
    serie++;
    debut = l[i - 1];
  }
  return { serie, debut, fin: l[l.length - 1] };
}
