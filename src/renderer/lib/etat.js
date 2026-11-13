// État partagé de l'appli : jeux, profil actif, réglages, données chargées.
import { cle } from './filtres.js';

export const etat = {
  jeux: [],
  profils: [],
  profil: null,          // profil actif (avec ses coches)
  reglages: { theme: 'systeme', profilActif: null, dateSimulee: null },
  donnees: new Map(),    // "nh/poissons" -> [éléments]
  vue: { type: 'accueil' },
  filtres: {},           // filtres mémorisés par catégorie
};

const ecouteurs = new Set();
export function surChangement(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); }
export function signaler(raison, detail) { for (const f of ecouteurs) f(raison, detail); }

export function jeuActif() {
  return etat.profil ? etat.jeux.find(j => j.id === etat.profil.jeu) || null : null;
}

// Date et heure utilisées partout : celle du PC, ou la date simulée choisie dans les réglages.
export function maintenant() {
  if (etat.reglages.dateSimulee) {
    const d = new Date(etat.reglages.dateSimulee);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function donneesCategorie(jeu, categorie) {
  const k = `${jeu}/${categorie}`;
  if (!etat.donnees.has(k)) etat.donnees.set(k, await window.nook.categorie(jeu, categorie));
  return etat.donnees.get(k);
}

export async function chargerToutLeJeu(jeu) {
  await Promise.all(jeu.categories.map(c => donneesCategorie(jeu.id, c.id)));
}

export function donneesChargees(jeuId, categorie) {
  return etat.donnees.get(`${jeuId}/${categorie}`) || [];
}

// ---------------------------------------------------------------------------
// Coches
// ---------------------------------------------------------------------------
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function etatDe(categorie, id) {
  return (etat.profil && etat.profil.elements[cle(categorie, id)]) || {};
}

// champ = "obtenu" ou "musee"
export function basculer(categorie, id, champ) {
  if (!etat.profil) return;
  const k = cle(categorie, id);
  const st = { ...(etat.profil.elements[k] || {}) };
  st[champ] = !st[champ];
  if (champ === 'musee' && st.musee) st.obtenu = true;     // donné au musée = forcément attrapé
  if (champ === 'obtenu' && !st.obtenu) st.musee = false;  // on décoche tout
  if (!st.obtenu && !st.musee) delete etat.profil.elements[k];
  else {
    st.le = st.le || aujourdhui();
    if (!st.musee) delete st.musee;
    etat.profil.elements[k] = st;
  }
  planifierSauvegarde();
  signaler('coche', { categorie, id });
}

// Coche ou décoche plusieurs éléments d'un coup (bouton « tout cocher »).
export function definirPlusieurs(categorie, ids, champ, valeur) {
  if (!etat.profil) return;
  for (const id of ids) {
    const k = cle(categorie, id);
    const st = { ...(etat.profil.elements[k] || {}) };
    st[champ] = valeur;
    if (champ === 'musee' && valeur) st.obtenu = true;
    if (champ === 'obtenu' && !valeur) st.musee = false;
    if (!st.obtenu && !st.musee) delete etat.profil.elements[k];
    else { st.le = st.le || aujourdhui(); if (!st.musee) delete st.musee; etat.profil.elements[k] = st; }
  }
  planifierSauvegarde();
  signaler('coches', { categorie });
}

// ---------------------------------------------------------------------------
// Sauvegarde : quelques instants après la dernière coche (et à la fermeture).
// ---------------------------------------------------------------------------
let minuterie = null;
let enAttente = false;

export function planifierSauvegarde() {
  enAttente = true;
  clearTimeout(minuterie);
  minuterie = setTimeout(sauvegarderMaintenant, 400);
}

export async function sauvegarderMaintenant() {
  clearTimeout(minuterie);
  if (!enAttente || !etat.profil) return;
  enAttente = false;
  try {
    await window.nook.ecrireProfil(etat.profil);
    signaler('sauvegarde');
  } catch (e) {
    enAttente = true;
    signaler('erreur', `La sauvegarde a échoué : ${e.message}`);
  }
}

export function sauvegardeEnAttente() { return enAttente; }

export async function enregistrerReglages(modifs) {
  etat.reglages = await window.nook.ecrireReglages({ ...etat.reglages, ...modifs });
  appliquerTheme();
  signaler('reglages');
}

export function appliquerTheme() {
  const t = etat.reglages.theme;
  const sombre = t === 'sombre' || (t !== 'clair' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = sombre ? 'sombre' : 'clair';
}
