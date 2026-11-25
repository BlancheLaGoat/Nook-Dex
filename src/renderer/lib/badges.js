// Badges de New Leaf (remis par Hélium) : progression lue dans la sauvegarde, palier suivant et ce qu'il manque.
//
// Les badges sont décrits dans data/nl/badges.json (seuils, unité, d'où vient la progression). La lecture de la
// sauvegarde est dans lib/sauvegarde-nl.js (badgesNL) ; elle est gardée dans le profil (profil.badges) :
//   { lu_le: 'AAAA-MM-JJ', joueur: 1-4, nom, niveaux: [24 × 0-3 | null], valeurs: [24 × nombre | null] }
// où chaque valeur est déjà dans l'unité du badge (heures, espèces, %, clochettes…). null = progression inconnue.
//
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/badges.test.js.
// Aucun chiffre n'est inventé : une valeur illisible reste « progression inconnue ».

export const NB_BADGES = 24;
export const NOMS_NIVEAUX = ['aucun', 'bronze', 'argent', 'or'];
export const MEDAILLES = ['▫️', '🥉', '🥈', '🥇'];
const AVEC_ARTICLE = ['', 'le bronze', "l'argent", "l'or"];
const CREATURES = ['poissons', 'insectes', 'creatures-marines'];

const entierOuNull = v => (Number.isInteger(v) && v >= 0 ? v : null);
const dateLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Lecture de la sauvegarde → ce qui est gardé dans le profil, pour le joueur choisi.
//   save = lireSauvegardeNL(...), badges = badgesNL(...), correspondance = data/nl/sauvegarde.json.
export function lectureBadges(defs, save, badges, correspondance, numero, date = new Date()) {
  const j = badges.find(x => x.numero === numero);
  if (!j) throw new Error(`Pas de joueur ${numero} dans cette sauvegarde.`);
  const joueur = save.joueurs.find(x => x.numero === numero);
  const debloques = (joueur && joueur.debloques) || new Set();
  const especes = categorie => correspondance.debloques.filter(d => d.categorie === categorie && debloques.has(d.bit)).length;
  // Catalogue : part des objets du catalogue débloqués (le total exact du jeu n'est pas connu : pourcentage approché).
  const catalogue = correspondance.debloques.filter(d => !CREATURES.includes(d.categorie));
  const pourcentCatalogue = catalogue.length ? Math.floor((100 * catalogue.filter(d => debloques.has(d.bit)).length) / catalogue.length) : null;
  const valeurs = Array(NB_BADGES).fill(null);
  for (const def of defs) {
    const pr = def.progression;
    let v = null;
    if (pr.type === 'compteur') v = j.compteurs[pr.case];
    else if (pr.type === 'banque') v = j.banque;
    else if (pr.type === 'navets') v = j.navets;
    else if (pr.type === 'temps') v = j.temps == null ? null : Math.floor(j.temps / 3600);
    else if (pr.type === 'hha') v = j.hha;
    else if (pr.type === 'encyclopedie') v = especes(pr.categorie);
    else if (pr.type === 'catalogue') v = pourcentCatalogue;
    valeurs[def.case] = entierOuNull(v);
  }
  return { lu_le: dateLocale(date), joueur: numero, nom: j.nom, niveaux: j.niveaux.slice(0, NB_BADGES), valeurs, manuel: false };
}

// Saisie à la main d'un badge (joueurs sur console, sans lecture de la sauvegarde) : renvoie une nouvelle lecture où
// seul le badge « cas » change. modifs = { niveau?: 0-3, valeur?: nombre | texte ('' = progression inconnue) }.
// Une valeur fausse (niveau hors 0-3, nombre négatif ou pas un nombre) est ignorée. La lecture d'avant n'est pas touchée.
// Sans lecture, on part de « aucun badge » partout et de compteurs inconnus (aucun chiffre inventé).
// Si rien n'est accepté, la lecture d'avant est renvoyée telle quelle (elle ne devient pas « retouchée à la main »).
const VALEUR_MAX = 0xFFFFFFFF;   // le jeu range ses compteurs sur 32 bits
export function saisirBadge(lecture, cas, modifs, date = new Date()) {
  const base = normaliserBadges(lecture)
    || { lu_le: '', joueur: 1, nom: '', niveaux: Array(NB_BADGES).fill(0), valeurs: Array(NB_BADGES).fill(null), manuel: true };
  const niveaux = base.niveaux.slice(), valeurs = base.valeurs.slice();
  let change = false;
  if ('niveau' in modifs) {
    const n = Number(modifs.niveau);
    if ([0, 1, 2, 3].includes(n)) { niveaux[cas] = n; change = true; }
  }
  if ('valeur' in modifs) {
    const t = String(modifs.valeur ?? '').trim().replace(/[\s  ]/g, '');
    if (t === '') { valeurs[cas] = null; change = true; } else if (/^\d+$/.test(t) && Number(t) <= VALEUR_MAX) { valeurs[cas] = Number(t); change = true; }
  }
  if (!change) return lecture;
  return { ...base, lu_le: dateLocale(date), niveaux, valeurs, manuel: true };
}

// Lecture gardée dans le profil (synchro, fichier) → lecture propre, ou null si elle est inutilisable.
export function normaliserBadges(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  if (!Array.isArray(x.niveaux) || x.niveaux.length !== NB_BADGES || !Array.isArray(x.valeurs) || x.valeurs.length !== NB_BADGES) return null;
  return {
    lu_le: typeof x.lu_le === 'string' ? x.lu_le.slice(0, 10) : '',
    joueur: [1, 2, 3, 4].includes(x.joueur) ? x.joueur : 1,
    nom: typeof x.nom === 'string' ? [...x.nom].slice(0, 8).join('') : '',
    niveaux: x.niveaux.map(n => ([0, 1, 2, 3].includes(n) ? n : null)),
    valeurs: x.valeurs.map(entierOuNull),
    manuel: x.manuel === true,   // saisi ou retouché à la main depuis le dernier import
  };
}

// État de chaque badge : { def, lu, niveau, valeur, connu, atteints, aRecuperer, cible, seuil, manque, avance }.
//   atteints = paliers dont le seuil est atteint d'après la valeur ; aRecuperer = palier atteint mais pas encore remis
//   par Hélium (0 sinon) ; cible = prochain palier à viser (1-3, null si l'or est atteint) ; manque = ce qu'il reste
//   pour la cible ; avance = part du chemin vers la cible (0 à 1).
export function etatBadges(defs, lecture) {
  const l = lecture ? normaliserBadges(lecture) : null;
  return defs.map(def => {
    const niveau = l ? l.niveaux[def.case] : null;
    const valeur = l ? l.valeurs[def.case] : null;
    const connu = valeur !== null;
    const atteints = connu ? def.seuils.filter(s => valeur >= s).length : 0;
    const acquis = Math.max(niveau || 0, atteints);
    // Niveau illisible : on ne peut pas dire qu'un badge attend chez Hélium.
    const aRecuperer = connu && niveau !== null && atteints > niveau ? atteints : 0;
    const cible = acquis < 3 ? acquis + 1 : null;
    const seuil = cible ? def.seuils[cible - 1] : null;
    const manque = connu && cible ? seuil - valeur : null;
    const avance = connu && cible ? valeur / seuil : null;
    return { def, lu: !!l, niveau, valeur, connu, atteints, aRecuperer, cible, seuil, manque, avance };
  });
}

const nombre = n => n.toLocaleString('fr-FR');
const unite = (def, n) => def.unite[n > 1 ? 1 : 0];

// Phrase courte sous le badge : « encore 312 poissons pour l'or », « bronze à récupérer auprès d'Hélium »…
export function texteProgression(e) {
  if (!e.lu) return 'pas encore lu dans la sauvegarde';
  if (e.aRecuperer) return `${NOMS_NIVEAUX[e.aRecuperer]} à récupérer auprès d'Hélium`;
  if (e.niveau === 3) return 'or obtenu';
  if (e.niveau === null) return e.connu ? `niveau illisible (${nombre(e.valeur)} ${unite(e.def, e.valeur)})` : 'niveau et progression illisibles';
  if (!e.connu) return 'progression inconnue';
  const u = unite(e.def, e.manque);
  return `encore ${nombre(e.manque)}${u === '%' ? ' %' : ` ${u}`} pour ${AVEC_ARTICLE[e.cible]}`;
}

// Badges à aller chercher (« Que faire maintenant ? ») : d'abord ceux à récupérer auprès d'Hélium, puis ceux dont la
// progression est connue, du plus proche au plus loin de leur palier suivant. Pas les badges devenus impossibles.
export function badgesAFaire(etats, n = 3) {
  const aRecuperer = etats.filter(e => e.aRecuperer);
  const enCours = etats
    .filter(e => !e.aRecuperer && e.connu && e.cible && e.def.obtenable !== false)
    .sort((a, b) => b.avance - a.avance);
  return [...aRecuperer, ...enCours].slice(0, n);
}

// Ce que l'import va changer : { premiere, joueurChange, niveaux: [{ def, de, a }], progressions }.
export function changementsBadges(defs, ancien, nouveau) {
  const a = ancien ? normaliserBadges(ancien) : null;
  const n = normaliserBadges(nouveau);
  if (!a) return { premiere: true, joueurChange: false, remplaceSaisie: false, niveaux: [], progressions: 0 };
  const niveaux = defs.filter(d => a.niveaux[d.case] !== n.niveaux[d.case]).map(d => ({ def: d, de: a.niveaux[d.case], a: n.niveaux[d.case] }));
  const progressions = defs.filter(d => a.valeurs[d.case] !== n.valeurs[d.case]).length;
  // Une saisie faite seulement à la main n'a pas de joueur : ce n'est pas « un autre joueur ».
  const saisieSansJoueur = a.manuel && !a.nom;
  const joueurChange = !saisieSansJoueur && (a.joueur !== n.joueur || a.nom !== n.nom);
  return { premiere: false, joueurChange, remplaceSaisie: a.manuel && !n.manuel, niveaux, progressions };
}

// « Poissons pêchés : argent, Plongée : bronze… » (5 au plus).
function listeNiveaux(liste) {
  const noms = liste.slice(0, 5).map(x => `${x.def.groupe} : ${x.a === null ? 'illisible' : NOMS_NIVEAUX[x.a]}`).join(', ');
  return liste.length > 5 ? `${noms}…` : noms;
}
const pluriel = (n, mot, s = 's') => `${n} ${mot}${n > 1 ? s : ''}`;

// Ligne « Badges : … » de la fenêtre d'import (null s'il n'y a rien de nouveau).
export function texteChangementsBadges(c, nouveau) {
  if (c.premiere) {
    const obtenus = nouveau.niveaux.filter(n => n > 0).length;
    return `lus pour la première fois (${obtenus} badge${obtenus > 1 ? 's' : ''} obtenu${obtenus > 1 ? 's' : ''})`;
  }
  const saisie = c.remplaceSaisie ? 'remplace ce que tu as saisi à la main' : null;
  if (c.joueurChange) return [`lus pour ${nouveau.nom || `le joueur ${nouveau.joueur}`} (un autre joueur que la dernière fois)`, saisie].filter(Boolean).join(', ');
  const morceaux = [];
  const montes = c.niveaux.filter(x => x.a !== null && x.a > (x.de || 0));
  const autres = c.niveaux.filter(x => !montes.includes(x));
  if (montes.length) morceaux.push(`${montes.length} ${montes.length > 1 ? 'nouveaux niveaux' : 'nouveau niveau'} (${listeNiveaux(montes)})`);
  if (autres.length) morceaux.push(`${pluriel(autres.length, 'niveau', 'x')} plus bas qu'avant (${listeNiveaux(autres)})`);
  if (c.progressions) morceaux.push('progression mise à jour');
  if (saisie) morceaux.push(saisie);
  return morceaux.length ? morceaux.join(', ') : null;
}
