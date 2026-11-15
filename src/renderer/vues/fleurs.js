// Fleurs hybrides (New Horizons) : onglets Croisement et Glossaire.
// Les calculs sont dans lib/fleurs.js ; les données dans data/nh/fleurs-genetique.json (recherches d'Aeter).
import { h, vider, image, ajouterA, confirmer } from '../lib/dom.js';
import { etat, donneesCategorie, planifierSauvegarde } from '../lib/etat.js';
import { enLettres, resultatCroisement, genotypesDeCouleur, origine, couleursEspece, rechercherChemins, etapesChemin, champVide, normaliserChamp, bilanChamp, CHAMP_MAX, hypotheses, meilleursTests, miseAJour } from '../lib/fleurs.js';

const ONGLETS = [['croisement', '🧪 Croisement'], ['obtenir', '🔎 Comment obtenir…'], ['champ', '🌱 Champ'], ['identifier', '🧬 Identifier'], ['glossaire', '📖 Glossaire']];
// Choix gardés le temps de la session.
const choix = { onglet: 'croisement', espece: 'roses', a: null, b: null, glossaire: 'roses', obtenir: { espece: 'roses', couleur: 'bleu', iles: false }, champ: { outil: 'fleur', espece: 'roses', g: null },
  identifier: { espece: 'roses', couleur: 'rouge', origine: 'inconnue', parents: null, iles: true, test: null } };

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
    else if (choix.onglet === 'obtenir') dessinerObtenir();
    else if (choix.onglet === 'champ') dessinerChamp();
    else if (choix.onglet === 'identifier') dessinerIdentifier();
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

  // ---- Comment obtenir… ----
  function dessinerObtenir() {
    const o = choix.obtenir;
    const esp = espece(o.espece);
    const couleurs = couleursEspece(esp).map(c => c.couleur);
    if (!couleurs.includes(o.couleur)) o.couleur = couleurs.find(c => !esp.graines[c]) || couleurs[0];
    const zone = h('div', { class: 'section' }, h('p', { class: 'aide' }, 'Calcul des chemins…'));
    ajouterA(corps,
      h('div', { class: 'filtres statique' },
        h('select', { onchange: e => { o.espece = e.target.value; dessiner(); } }, especes.map(e => h('option', { value: e.id, selected: e.id === esp.id }, e.nom))),
        h('select', { onchange: e => { o.couleur = e.target.value; dessiner(); } }, couleurs.map(c => h('option', { value: c, selected: c === o.couleur }, majuscule(c)))),
        h('label', { class: 'ligne' }, h('input', { type: 'checkbox', checked: o.iles, onchange: e => { o.iles = e.target.checked; dessiner(); } }), ' Partir aussi des fleurs des îles')),
      zone);
    // Le calcul prend jusqu'à une seconde : on laisse d'abord l'écran s'afficher.
    setTimeout(() => {
      if (!zone.isConnected) return;
      const chemins = rechercherChemins(esp, o.couleur, { iles: o.iles });
      vider(zone);
      if (!chemins.length) { zone.append(h('p', { class: 'note' }, 'Aucun chemin trouvé en 4 générations.')); return; }
      chemins.forEach((lot, i) => {
        const etapes = etapesChemin(lot);
        const numero = new Map(etapes.map((e, k) => [e.lot.id, k + 1]));
        const nom = l => (l.depart ? `${majuscule(l.couleur)} (${TEXTE_ORIGINE[l.depart]})` : `${majuscule(l.couleur)} (étape ${numero.get(l.id)})`);
        const genes = l => [...l.dist].sort((a, b) => b[1] - a[1]).map(([g, p]) => `${g}${l.dist.size > 1 ? ` ${pc(p)}` : ''}`).join(' · ');
        zone.append(h('div', { class: 'carte chemin' },
          h('h3', {}, vignette(esp, lot.couleur), lot.generation === 0
            ? `${majuscule(lot.couleur)} : directement ${lot.depart === 'iles' ? 'sur les îles' : 'en graines'}`
            : `Chemin ${i + 1} : environ ${Math.round(lot.cout).toLocaleString('fr-FR')} croisements en moyenne, ${lot.generation} génération${lot.generation > 1 ? 's' : ''}`),
          etapes.length ? h('ol', { class: 'etapes-chemin' }, etapes.map(e => h('li', {},
            h('span', {}, `${nom(e.parents[0])} × ${nom(e.parents[1])} → `), vignette(esp, e.lot.couleur), h('strong', {}, majuscule(e.lot.couleur)),
            h('span', { class: 'aide' }, ` · ${pc(e.lot.p)} par croisement · gènes possibles : ${genes(e.lot)}`)))) : null));
      });
      zone.append(h('p', { class: 'aide' }, "Les chances supposent qu'on ne connaît pas les gènes exacts des fleurs obtenues (seulement leur couleur). ",
        "En identifiant les bonnes fleurs par des croisements tests, on peut faire mieux. « Environ N croisements » = 1 / chance du dernier croisement, plus le plus long chemin de ses parents."));
    }, 30);
  }

  // ---- Champ ----
  function dessinerChamp() {
    const profil = etat.profil;
    const champ = normaliserChamp(profil.champFleurs, especes);
    const enregistrer = () => { profil.champFleurs = champ; planifierSauvegarde(); };
    const o = choix.champ;
    const esp = espece(o.espece);
    if (!o.g || !esp.couleurs[o.g]) o.g = Object.values(esp.graines)[2];
    const couleurOutil = esp.couleurs[o.g];
    const nomCase = i => `${String.fromCharCode(65 + (i % champ.largeur))}${Math.floor(i / champ.largeur) + 1}`;
    const nomFleur = c => `${espece(c.espece).nom.toLowerCase()} ${espece(c.espece).couleurs[c.g]} (${c.g})`;
    const taille = (val, surChange) => h('select', { onchange: e => surChange(Number(e.target.value)) },
      Array.from({ length: CHAMP_MAX - 2 }, (_, k) => k + 3).map(n => h('option', { value: String(n), selected: n === val }, String(n))));
    const redimensionner = (l, ht) => {
      const nouveau = champVide(l, ht);
      champ.cases.forEach((c, i) => { const x = i % champ.largeur, y = Math.floor(i / champ.largeur); if (x < l && y < ht) nouveau.cases[y * l + x] = c; });
      profil.champFleurs = nouveau; planifierSauvegarde(); dessiner();
    };
    ajouterA(corps,
      h('div', { class: 'filtres statique' },
        h('select', { onchange: e => { o.outil = e.target.value; dessiner(); } },
          [['fleur', '🌸 Planter'], ['bloque', '⬛ Case bloquée'], ['gomme', '🧽 Effacer']].map(([v, t]) => h('option', { value: v, selected: o.outil === v }, t))),
        o.outil === 'fleur' ? [
          h('select', { onchange: e => { o.espece = e.target.value; o.g = null; dessiner(); } }, especes.map(e => h('option', { value: e.id, selected: e.id === esp.id }, e.nom))),
          h('select', { onchange: e => { o.g = genotypesDeCouleur(esp, e.target.value)[0]; dessiner(); } },
            couleursEspece(esp).map(c => h('option', { value: c.couleur, selected: c.couleur === couleurOutil }, majuscule(c.couleur)))),
          h('select', { onchange: e => { o.g = e.target.value; dessiner(); } },
            genotypesDeCouleur(esp, couleurOutil).map(g => { const x = origine(esp, g); return h('option', { value: g, selected: g === o.g }, `${g}${x ? ` · ${TEXTE_ORIGINE[x]}` : ''}`); })),
        ] : null,
        h('label', {}, 'Largeur ', taille(champ.largeur, v => redimensionner(v, champ.hauteur))),
        h('label', {}, 'Hauteur ', taille(champ.hauteur, v => redimensionner(champ.largeur, v))),
        h('button', { class: 'bouton petit', onclick: async () => {
          if (!(await confirmer('Vider le champ', 'Retirer toutes les fleurs et les cases bloquées ?', 'Vider'))) return;
          profil.champFleurs = champVide(champ.largeur, champ.hauteur); planifierSauvegarde(); dessiner();
        } }, 'Vider')));

    const bilan = bilanChamp(champ, especes);
    const infoFleur = new Map(bilan.fleurs.map(f => [f.i, f]));
    const grille = h('div', { class: 'champ-grille', style: { gridTemplateColumns: `repeat(${champ.largeur}, 48px)` } },
      champ.cases.map((c, i) => {
        const f = infoFleur.get(i);
        const classes = ['champ-case', c && c.bloque ? 'bloque' : '', f && f.libres === 0 ? 'sans-place' : '', f && f.clone ? 'clone' : ''].filter(Boolean).join(' ');
        const titre = !c ? `${nomCase(i)} : libre` : c.bloque ? `${nomCase(i)} : bloquée`
          : `${nomCase(i)} : ${nomFleur(c)}${f.clone ? ' — pas de voisine de son espèce (clone)' : ''}${f.libres === 0 ? " — aucune case libre autour : pas d'enfant possible" : ''}`;
        return h('button', { class: classes, title: titre, onclick: () => {
          champ.cases[i] = o.outil === 'gomme' ? null : o.outil === 'bloque' ? { bloque: true } : { espece: esp.id, g: o.g };
          enregistrer(); dessiner();
        } }, c && !c.bloque ? vignette(espece(c.espece), espece(c.espece).couleurs[c.g]) : '');
      }));
    const sansPlace = bilan.fleurs.filter(f => f.libres === 0).map(f => nomCase(f.i));
    const clones = bilan.fleurs.filter(f => f.clone).map(f => nomCase(f.i));
    ajouterA(corps, h('div', { class: 'champ-zone' }, grille,
      h('div', { class: 'champ-bilan' },
        h('h3', {}, `Couples possibles (${bilan.couples.length})`),
        bilan.couples.length ? h('ul', { class: 'liste-conditions' }, bilan.couples.map(cp => h('li', {},
          `${nomCase(cp.a)} × ${nomCase(cp.b)} (${espece(cp.espece).nom.toLowerCase()}) → `,
          h('span', { class: 'aide' }, cp.resultat.couleurs.map(x => `${x.couleur} ${pc(x.p)}`).join(' · ')))))
          : h('p', { class: 'aide' }, 'Place deux fleurs de la même espèce côte à côte (y compris en diagonale).'),
        sansPlace.length ? h('p', { class: 'note' }, `⚠️ Sans case libre autour, pas d'enfant : ${sansPlace.join(', ')}.`) : null,
        clones.length ? h('p', { class: 'aide' }, `Sans voisine de leur espèce (elles ne peuvent que se cloner) : ${clones.join(', ')}.`) : null)),
      h('p', { class: 'aide' }, "Clique sur une case pour planter, bloquer ou effacer. Une fleur peut se croiser avec une voisine de son espèce sur les 8 cases autour ; l'enfant a besoin d'une case libre à côté. Le champ est enregistré dans ton profil."));
  }

  // ---- Identifier ----
  function dessinerIdentifier() {
    const o = choix.identifier;
    const esp = espece(o.espece);
    const couleurs = couleursEspece(esp).map(c => c.couleur);
    if (!couleurs.includes(o.couleur)) o.couleur = couleurs[0];
    if (!o.parents || !esp.couleurs[o.parents[0]] || !esp.couleurs[o.parents[1]]) o.parents = [Object.values(esp.graines)[2], Object.values(esp.graines)[2]];
    const choixGenes = k => h('select', { onchange: e => { o.parents[k] = e.target.value; o.test = null; dessiner(); } },
      couleursEspece(esp).flatMap(c => c.genotypes.map(g => { const x = origine(esp, g); return h('option', { value: g, selected: g === o.parents[k] }, `${majuscule(c.couleur)} · ${g}${x ? ` · ${TEXTE_ORIGINE[x]}` : ''}`); })));
    ajouterA(corps,
      h('div', { class: 'filtres statique' },
        h('select', { onchange: e => { o.espece = e.target.value; o.parents = null; o.test = null; dessiner(); } }, especes.map(e => h('option', { value: e.id, selected: e.id === esp.id }, e.nom))),
        h('select', { onchange: e => { o.couleur = e.target.value; o.test = null; dessiner(); } }, couleurs.map(c => h('option', { value: c, selected: c === o.couleur }, `Ma fleur : ${c}`))),
        h('select', { onchange: e => { o.origine = e.target.value; o.test = null; dessiner(); } },
          [['inconnue', 'Origine inconnue'], ['croisement', "Née d'un croisement connu"]].map(([v, t]) => h('option', { value: v, selected: o.origine === v }, t))),
        o.origine === 'croisement' ? [h('span', {}, 'Parents :'), choixGenes(0), h('span', {}, '×'), choixGenes(1)] : null,
        h('label', { class: 'ligne' }, h('input', { type: 'checkbox', checked: o.iles, onchange: e => { o.iles = e.target.checked; dessiner(); } }), ' Témoins des îles aussi')));

    let hyps = hypotheses(esp, o.couleur, { parents: o.origine === 'croisement' ? o.parents : null });
    if (!hyps.length) { corps.append(h('p', { class: 'note' }, "Ce croisement ne peut pas donner cette couleur : vérifie les parents.")); return; }
    if (o.test && o.test.obtenus.length) hyps = miseAJour(esp, hyps, o.test.g, o.test.obtenus);
    const listeHyps = hs => h('ul', { class: 'liste-conditions' }, hs.map(x => h('li', {}, h('span', { class: 'genotype connu' }, x.g), ` ${enLettres(x.g)} — ${pc(x.p)}`, origine(esp, x.g) ? h('span', { class: 'aide' }, ` (comme les ${TEXTE_ORIGINE[origine(esp, x.g)]})`) : null)));
    ajouterA(corps, h('div', { class: 'section' },
      h('h2', {}, hyps.length === 1 ? '✅ Gènes trouvés' : `Gènes possibles (${hyps.length})`), listeHyps(hyps)));
    if (!hyps.length) return;

    // Croisement test en cours : couleurs des enfants obtenus.
    if (o.test) {
      const t = o.test;
      ajouterA(corps, h('div', { class: 'carte' },
        h('h3', {}, `Test en cours : × ${t.couleur} (${TEXTE_ORIGINE[t.depart]}, ${t.g})`),
        h('p', {}, 'Enfants obtenus : ', t.obtenus.length ? t.obtenus.map(c => majuscule(c)).join(', ') : 'aucun pour l\'instant'),
        h('div', { class: 'fleur-ligne' }, 'Ajouter un enfant :', couleurs.map(c => h('button', { class: 'bouton petit', onclick: () => { t.obtenus.push(c); dessiner(); } }, vignette(esp, c), majuscule(c)))),
        h('button', { class: 'bouton petit', onclick: () => { o.test = null; dessiner(); } }, 'Arrêter ce test')));
      if (hyps.length === 0) corps.append(h('p', { class: 'note' }, 'Aucune hypothèse ne colle : vérifie les couleurs saisies.'));
      if (hyps.length <= 1) return;
    }
    const tests = meilleursTests(esp, hyps, { iles: o.iles });
    if (!tests.length) return;
    ajouterA(corps, h('div', { class: 'section' }, h('h2', {}, o.test ? 'Pour aller plus loin' : 'Meilleurs croisements tests'),
      tests.map(t => {
        const cols = [...new Set(t.table.flatMap(r => [...r.couleurs.keys()]))];
        return h('div', { class: 'carte chemin' },
          h('h3', {}, vignette(esp, t.testeur.couleur), `Croise-la avec une ${esp.nom.toLowerCase().replace(/s$/, '')} ${t.testeur.couleur} (${TEXTE_ORIGINE[t.testeur.depart]}, ${t.testeur.g})`,
            h('button', { class: 'bouton petit', style: { marginLeft: 'auto' }, onclick: () => { o.test = { ...t.testeur, obtenus: [] }; dessiner(); } }, 'Faire ce test')),
          h('p', { class: 'aide' }, t.decisives.length ? `Couleurs qui tranchent : ${t.decisives.join(', ')}.` : 'Aucune couleur ne tranche à coup sûr : il faudra plusieurs enfants.'),
          h('div', { class: 'navets-cadre' }, h('table', { class: 'navets-fourchettes' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Si ses gènes sont…'), cols.map(c => h('th', { class: t.decisives.includes(c) ? 'meilleur' : '' }, c)))),
            h('tbody', {}, t.table.map(r => h('tr', {}, h('th', {}, `${r.g} (${pc(r.p)})`), cols.map(c => h('td', {}, r.couleurs.get(c) ? pc(r.couleurs.get(c)) : '—'))))))));
      })));
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
