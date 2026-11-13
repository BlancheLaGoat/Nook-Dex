// Point d'entrée de l'interface : en-tête, menu, navigation entre les vues.
import { h, vider, notifier } from './lib/dom.js';
import {
  etat, jeuActif, maintenant, surChangement, signaler, chargerToutLeJeu, donneesChargees,
  enregistrerReglages, appliquerTheme, sauvegarderMaintenant, sauvegardeEnAttente,
} from './lib/etat.js';
import { progression } from './lib/filtres.js';
import { afficherAccueil } from './vues/accueil.js';
import { afficherCollection } from './vues/collection.js';
import { fermerFiche } from './vues/fiche.js';
import { afficherCalendrier } from './vues/calendrier.js';
import { afficherEspeces } from './vues/especes.js';
import { fenetreProfils, fenetreNouveauProfil, fenetreReglages } from './vues/fenetres.js';

const $ = id => document.getElementById(id);
let nettoyerVue = null;
let etatMaj = null;

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
async function afficherVue(vue) {
  etat.vue = vue;
  if (nettoyerVue) { nettoyerVue(); nettoyerVue = null; }
  fermerFiche();
  const contenu = $('contenu');
  contenu.scrollTop = 0;
  dessinerMenu();
  const jeu = jeuActif();
  if (!jeu) return afficherBienvenue();
  if (vue.type === 'accueil') {
    nettoyerVue = afficherAccueil(contenu, jeu, id => afficherVue({ type: 'categorie', id }));
  } else if (vue.type === 'categorie') {
    const cat = jeu.categories.find(c => c.id === vue.id);
    if (!cat) return afficherVue({ type: 'accueil' });
    nettoyerVue = await afficherCollection(contenu, jeu, cat);
  } else if (vue.type === 'calendrier') {
    nettoyerVue = await afficherCalendrier(contenu, jeu);
  } else if (vue.type === 'especes') {
    nettoyerVue = await afficherEspeces(contenu);
  }
}

function afficherBienvenue() {
  const contenu = vider($('contenu'));
  vider($('menu'));
  contenu.append(h('div', { class: 'bienvenue' },
    h('div', { class: 'grand' }, '🍃'),
    h('h1', {}, 'Bienvenue dans Nook Dex !'),
    h('p', {}, 'Pour commencer, crée un profil : il correspond à une partie dans un jeu (par exemple ton île de New Horizons). Tes coches y seront sauvegardées automatiquement.'),
    h('button', { class: 'bouton principal', onclick: () => fenetreNouveauProfil(p => choisirProfil(p.id)) }, '+ Créer mon premier profil'),
    etat.profils.length ? h('p', {}, h('button', { class: 'bouton', onclick: () => fenetreProfils(choisirProfil) }, 'Choisir un profil existant')) : null,
    h('p', { class: 'aide' }, 'Tu as déjà un fichier exporté ? ', h('button', { class: 'bouton petit', onclick: () => fenetreProfils(choisirProfil) }, 'Importer'))));
  dessinerEntete();
}

// ---------------------------------------------------------------------------
// Menu de gauche : catégories avec barres de progression
// ---------------------------------------------------------------------------
function dessinerMenu() {
  const menu = vider($('menu'));
  const jeu = jeuActif();
  if (!jeu) return;
  const lien = (actif, icone, nom, compte, surClic, barres = []) => h('button', { class: `menu-lien${actif ? ' actif' : ''}`, onclick: surClic },
    h('div', { class: 'menu-ligne' }, h('span', { class: 'menu-icone' }, icone), h('span', { class: 'menu-nom' }, nom), compte ? h('span', { class: 'menu-compte' }, compte) : null),
    barres);
  menu.append(
    h('div', { class: 'menu-titre' }, jeu.court),
    lien(etat.vue.type === 'accueil', '🏡', 'Tableau de bord', null, () => afficherVue({ type: 'accueil' })),
    h('div', { class: 'menu-titre' }, 'Collection'),
  );
  for (const c of jeu.categories) {
    if (c.ext && !etat.profil.extensions.includes(c.ext)) continue;
    const p = progression(donneesChargees(jeu.id, c.id), etat.profil, c.id);
    const pc = (a, b) => `${b ? (a / b) * 100 : 0}%`;
    menu.append(lien(etat.vue.type === 'categorie' && etat.vue.id === c.id, c.icone, c.nom, `${p.obtenus}/${p.total}`,
      () => afficherVue({ type: 'categorie', id: c.id }),
      [h('div', { class: 'barre' }, h('div', { style: { width: pc(p.obtenus, p.total) } })),
        c.musee ? h('div', { class: 'barre musee' }, h('div', { style: { width: pc(p.musee, p.totalMusee) } })) : null]));
  }
  menu.append(
    h('div', { class: 'menu-titre' }, 'Outils'),
    lien(etat.vue.type === 'calendrier', '📅', 'Calendrier', null, () => afficherVue({ type: 'calendrier' })),
    lien(etat.vue.type === 'especes', '🔎', 'Par espèce (tous les jeux)', null, () => afficherVue({ type: 'especes' })),
  );
}

// Seule la ligne de la catégorie cochée change : on la redessine sans tout reconstruire.
let menuEnAttente = null;
function rafraichirMenuBientot() {
  clearTimeout(menuEnAttente);
  menuEnAttente = setTimeout(dessinerMenu, 60);
}

// ---------------------------------------------------------------------------
// En-tête : profil, horloge, thème
// ---------------------------------------------------------------------------
function dessinerEntete() {
  const bouton = vider($('choix-profil'));
  const jeu = jeuActif();
  if (etat.profil && jeu) bouton.append(h('span', { class: 'pastille-jeu' }, jeu.sigle), etat.profil.nom, ' ▾');
  else bouton.append('Choisir un profil ▾');
  dessinerHorloge();
  const sombre = document.documentElement.dataset.theme === 'sombre';
  $('bouton-theme').textContent = sombre ? '☀️' : '🌙';
  $('bouton-theme').title = sombre ? 'Passer au thème clair' : 'Passer au thème sombre';
}

function dessinerHorloge() {
  const d = maintenant();
  const simulee = !!etat.reglages.dateSimulee;
  const el = vider($('horloge'));
  el.classList.toggle('simulee', simulee);
  el.append(simulee ? '🕰️ ' : '🕒 ', d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }), ' · ',
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), simulee ? ' (simulée)' : '');
  el.title = simulee ? 'Date simulée — clique pour la changer' : "Date et heure du PC — clique pour simuler une autre date";
}

// Toutes les 20 secondes : on met l'horloge à jour, et on prévient les vues quand l'heure change.
let derniereHeure = null;
function tic() {
  dessinerHorloge();
  const d = maintenant();
  const cleHeure = `${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
  if (derniereHeure !== null && cleHeure !== derniereHeure) signaler('heure');
  derniereHeure = cleHeure;
}

// ---------------------------------------------------------------------------
// Profils
// ---------------------------------------------------------------------------
async function choisirProfil(id) {
  await sauvegarderMaintenant();
  const p = await window.nook.lireProfil(id);
  if (!p) { notifier('Profil introuvable.', 'erreur'); return; }
  const jeu = etat.jeux.find(j => j.id === p.jeu);
  if (!jeu || !jeu.disponible) { notifier("Ce jeu n'est pas encore disponible dans cette version de Nook Dex.", 'erreur'); return; }
  etat.profil = p;
  etat.filtres = {};
  await chargerToutLeJeu(jeu);
  await enregistrerReglages({ profilActif: p.id });
  etat.profils = await window.nook.listerProfils();
  dessinerEntete();
  afficherVue({ type: 'accueil' });
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function demarrer() {
  etat.reglages = { theme: 'systeme', profilActif: null, dateSimulee: null, ...(await window.nook.lireReglages()) };
  appliquerTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { appliquerTheme(); dessinerEntete(); });
  etat.jeux = await window.nook.jeux();
  etat.profils = await window.nook.listerProfils();

  $('choix-profil').addEventListener('click', () => fenetreProfils(choisirProfil));
  $('horloge').addEventListener('click', () => fenetreReglages(etatMaj));
  $('bouton-reglages').addEventListener('click', () => fenetreReglages(etatMaj));
  $('bouton-theme').addEventListener('click', () => {
    const sombre = document.documentElement.dataset.theme === 'sombre';
    enregistrerReglages({ theme: sombre ? 'clair' : 'sombre' });
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      const r = document.getElementById('recherche');
      if (r) { e.preventDefault(); r.focus(); r.select(); }
    }
  });

  surChangement((raison, detail) => {
    if (raison === 'coche' || raison === 'coches') rafraichirMenuBientot();
    if (raison === 'reglages') { dessinerEntete(); tic(); }
    if (raison === 'erreur') notifier(detail, 'erreur');
    if (raison === 'profil-supprime') { dessinerEntete(); afficherBienvenue(); }
  });

  window.nook.surEtatMaj(m => {
    etatMaj = m;
    if (m.etat === 'prete') notifier(`La version ${m.version} est prête : elle s'installera à la fermeture de Nook Dex.`);
  });

  // À la fermeture : si une coche n'est pas encore enregistrée, on l'écrit tout de suite.
  window.addEventListener('beforeunload', () => {
    if (sauvegardeEnAttente() && etat.profil) window.nook.ecrireProfilSync(etat.profil);
  });

  setInterval(tic, 20000);
  tic();

  const choix = etat.profils.find(p => p.id === etat.reglages.profilActif) || etat.profils.find(p => (etat.jeux.find(j => j.id === p.jeu) || {}).disponible);
  if (choix) await choisirProfil(choix.id);
  else afficherBienvenue();
}

demarrer().catch(e => {
  console.error(e);
  vider($('contenu')).append(h('div', { class: 'vide' }, h('span', { class: 'grand' }, '😿'), `Un problème est survenu au démarrage : ${e.message}`));
});
