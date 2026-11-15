// Fleurs hybrides (New Horizons) : onglets Croisement et Glossaire.
// Les calculs sont dans lib/fleurs.js ; les données dans data/nh/fleurs-genetique.json (recherches d'Aeter).
import { h, vider, image, ajouterA } from '../lib/dom.js';
import { donneesCategorie } from '../lib/etat.js';
import { enLettres, resultatCroisement, genotypesDeCouleur, origine, couleursEspece } from '../lib/fleurs.js';

const ONGLETS = [['croisement', '🧪 Croisement'], ['glossaire', '📖 Glossaire']];
// Choix gardés le temps de la session.
const choix = { onglet: 'croisement', espece: 'roses', a: null, b: null, glossaire: 'roses' };

const pc = p => `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: p < 0.1 ? 2 : 1 })} %`;
const TEXTE_ORIGINE = { graines: 'graines', iles: 'îles' };
const majuscule = s => s.charAt(0).toUpperCase() + s.slice(1);

export async function afficherFleurs(conteneur, jeu) {
  vider(conteneur);
  const [genetique, fiches] = await Promise.all([donneesCategorie(jeu.id, 'fleurs-genetique'), donneesCategorie(jeu.id, 'fleurs')]);
  if (!genetique || !genetique.especes) {
    conteneur.append(h('p', { class: 'note' }, 'Données des fleurs introuvables : lance « npm run donnees:fleurs ».'));
    return () => {};
  }
  const especes = genetique.especes;
  const ficheDe = id => (fiches || []).find(f => f.id === id);
  const vignette = (esp, couleur) => { const f = ficheDe(esp.fiches[couleur]); return f ? image(f.image, '', 'vignette petite') : null; };
  const espece = id => especes.find(e => e.id === id) || especes[0];

  const corps = h('div', {});
  const dessiner = () => {
    vider(corps);
    ajouterA(corps, h('div', { class: 'onglets' }, ONGLETS.map(([id, nom]) =>
      h('button', { class: `onglet${choix.onglet === id ? ' actif' : ''}`, onclick: () => { choix.onglet = id; dessiner(); } }, nom))));
    if (choix.onglet === 'croisement') dessinerCroisement();
    else dessinerGlossaire();
    corps.append(h('p', { class: 'aide credits' },
      "Génétique des fleurs d'après les recherches d'Aeter (données extraites du jeu). ",
      'Notation : un chiffre par gène (R, Y, W, et S pour les roses), 0, 1 ou 2 copies du gène ; ex. 2001 = RR yy ww Ss.'));
  };

  // ---- Croisement ----
  function choixParent(esp, cle, titre) {
    const actuel = choix[cle] && esp.couleurs[choix[cle]] ? choix[cle] : Object.values(esp.graines)[cle === 'a' ? 2 : 0];
    choix[cle] = actuel;
    const couleur = esp.couleurs[actuel];
    const couleurs = couleursEspece(esp).map(c => c.couleur);
    return h('div', { class: 'carte fleur-parent' },
      h('h3', {}, titre),
      h('div', { class: 'fleur-ligne' }, vignette(esp, couleur),
        h('select', { onchange: e => { choix[cle] = genotypesDeCouleur(esp, e.target.value)[0]; dessiner(); } },
          couleurs.map(c => h('option', { value: c, selected: c === couleur }, majuscule(c))))),
      h('select', { onchange: e => { choix[cle] = e.target.value; dessiner(); } },
        genotypesDeCouleur(esp, couleur).map(g => {
          const o = origine(esp, g);
          return h('option', { value: g, selected: g === actuel }, `${g} · ${enLettres(g)}${o ? ` · ${TEXTE_ORIGINE[o]}` : ''}`);
        })));
  }

  function dessinerCroisement() {
    const esp = espece(choix.espece);
    ajouterA(corps,
      h('div', { class: 'filtres statique' },
        h('select', { onchange: e => { choix.espece = e.target.value; choix.a = choix.b = null; dessiner(); } },
          especes.map(e => h('option', { value: e.id, selected: e.id === esp.id }, e.nom)))),
      h('div', { class: 'fleur-parents' }, choixParent(esp, 'a', 'Fleur 1'), h('div', { class: 'fleur-fois' }, '×'), choixParent(esp, 'b', 'Fleur 2')));
    const res = resultatCroisement(esp, choix.a, choix.b);
    ajouterA(corps, h('div', { class: 'section' }, h('h2', {}, 'Enfants possibles'),
      h('div', { class: 'fleur-resultats' }, res.couleurs.map(c => h('div', { class: 'fleur-resultat' },
        h('div', { class: 'fleur-ligne' }, vignette(esp, c.couleur), h('strong', {}, majuscule(c.couleur)), h('span', { class: 'fleur-pc' }, pc(c.p))),
        h('div', { class: 'barre' }, h('div', { style: { width: `${c.p * 100}%` } })),
        h('ul', { class: 'liste-conditions' }, c.genotypes.map(g => {
          const o = origine(esp, g.g);
          return h('li', { class: 'aide' }, `${g.g} · ${enLettres(g.g)} — ${pc(g.p)}${o ? ` (comme les ${TEXTE_ORIGINE[o]})` : ''}`);
        })))))),
      h('p', { class: 'aide' }, "Chaque jour, une fleur arrosée peut se reproduire avec une fleur de la même espèce sur une des 8 cases autour d'elle ; l'enfant pousse sur une case libre voisine. Sans voisine, elle se clone (même couleur, mêmes gènes)."));
  }

  // ---- Glossaire ----
  function dessinerGlossaire() {
    const esp = espece(choix.glossaire);
    ajouterA(corps,
      h('div', { class: 'filtres statique' },
        h('select', { onchange: e => { choix.glossaire = e.target.value; dessiner(); } },
          especes.map(e => h('option', { value: e.id, selected: e.id === esp.id }, e.nom)))),
      h('table', { class: 'tableau-glossaire' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Couleur'), h('th', {}, 'Où la trouver'), h('th', {}, 'Génotypes'))),
        h('tbody', {}, couleursEspece(esp).map(c => h('tr', {},
          h('td', {}, vignette(esp, c.couleur)),
          h('th', {}, majuscule(c.couleur)),
          h('td', {}, [c.graines ? `Graines (${c.graines})` : null, c.iles.length ? `Îles (${c.iles.join(', ')})` : null].filter(Boolean).join(' · ') || 'Croisement seulement'),
          h('td', {}, h('div', { class: 'genotypes' }, c.genotypes.map(g => h('span', { class: `genotype${origine(esp, g) ? ' connu' : ''}`, title: enLettres(g) }, g)))))))),
      esp.id === 'roses' ? h('p', { class: 'aide' }, "🌟 Rose dorée : elle n'a pas de gènes à elle. Arrose une rose noire avec l'arrosoir en or : le lendemain, une rose dorée peut pousser à côté.") : null,
      h('p', { class: 'aide' }, 'Survole un génotype pour le voir en lettres. En gras : les génotypes des fleurs de graines et des îles.'));
  }

  conteneur.append(h('div', { class: 'titre-page' }, h('h1', {}, '🌷 Fleurs hybrides'), h('span', { class: 'sous-titre' }, jeu.nom)), corps);
  dessiner();
  return () => {};
}
