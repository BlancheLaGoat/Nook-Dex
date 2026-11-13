// Vue « calendrier » : pour le jeu du profil actif, ce qui est disponible chaque mois.
import { h, vider, image, ajouterA } from '../lib/dom.js';
import { etat, donneesCategorie, etatDe, maintenant, surChangement } from '../lib/etat.js';
import { estActif } from '../lib/filtres.js';
import { periodes, disponibleEnMois, partBientot, arriveCeMois, partieDuMois, formaterHeures, NOMS_MOIS, MOIS_COURTS } from '../lib/dispo.js';
import { ouvrirFiche } from './fiche.js';

let moisChoisi = null;
let seulementManquants = false;

export async function afficherCalendrier(conteneur, jeu) {
  const cats = jeu.categories.filter(c => c.type === 'creature');
  const donnees = {};
  for (const c of cats) donnees[c.id] = await donneesCategorie(jeu.id, c.id);
  if (!moisChoisi) moisChoisi = maintenant().getMonth() + 1;

  const dessiner = () => {
    // On garde la position de défilement quand la page se redessine (après une coche).
    const defilement = conteneur.scrollTop;
    requestAnimationFrame(() => { conteneur.scrollTop = defilement; });
    vider(conteneur);
    const hemi = etat.profil.hemisphere;
    const moisCourant = maintenant().getMonth() + 1;

    ajouterA(conteneur,
      h('div', { class: 'titre-page' },
        h('h1', {}, '📅 Calendrier'),
        h('span', { class: 'sous-titre' }, jeu.nom, jeu.hemispheres ? ` · hémisphère ${hemi}` : '')),
      h('div', { class: 'onglets-mois' }, MOIS_COURTS.map((m, i) => h('button', {
        class: `onglet-mois${i + 1 === moisChoisi ? ' actif' : ''}${i + 1 === moisCourant ? ' courant' : ''}`,
        title: i + 1 === moisCourant ? 'Mois en cours' : NOMS_MOIS[i],
        onclick: () => { moisChoisi = i + 1; dessiner(); },
      }, m))),
      h('div', { class: 'filtres statique' },
        h('label', { class: `interrupteur${seulementManquants ? ' actif' : ''}` },
          h('input', { type: 'checkbox', checked: seulementManquants, onchange: e => { seulementManquants = e.target.checked; dessiner(); } }),
          '🏛 Seulement ce qui manque au musée'),
        h('span', { class: 'aide' }, '🍂 part à la fin du mois · 🌱 arrive ce mois-ci · ½ seulement une partie du mois')),
    );

    for (const c of cats) {
      const liste = donnees[c.id]
        .filter(e => estActif(e, etat.profil.extensions) && periodes(e, hemi) && disponibleEnMois(e, hemi, moisChoisi))
        .filter(e => !seulementManquants || !etatDe(c.id, e.id).musee)
        .map(e => ({ e, part: partBientot(e, hemi, moisChoisi), arrive: arriveCeMois(e, hemi, moisChoisi) }))
        // D'abord ce qui part (à ne pas rater), puis les nouveautés, puis le reste.
        .sort((a, b) => (b.part - a.part) || (b.arrive - a.arrive) || a.e.nom.fr.localeCompare(b.e.nom.fr, 'fr'));

      ajouterA(conteneur, h('div', { class: 'section' },
        h('h2', {}, c.icone, ` ${c.nom} en ${NOMS_MOIS[moisChoisi - 1]}`, h('span', { class: 'compte' }, String(liste.length))),
        liste.length ? h('div', { class: 'grille-calendrier' }, liste.map(({ e, part, arrive }) => {
          const st = etatDe(c.id, e.id);
          const partie = partieDuMois(e, hemi, moisChoisi);
          const plages = (periodes(e, hemi) || []).filter(p => p.mois.includes(moisChoisi)).map(p => formaterHeures(p.heures));
          return h('button', { class: `carte-calendrier${st.musee ? ' fait' : st.obtenu ? ' obtenu' : ''}`, onclick: () => ouvrirFiche(jeu, c, e) },
            image(e.image, '', 'vignette petite'),
            h('div', { class: 'texte' },
              h('div', { class: 'nom' }, e.nom.fr, ' ', part ? h('span', { title: 'Part à la fin du mois' }, '🍂') : null, arrive ? h('span', { title: 'Arrive ce mois-ci' }, '🌱') : null),
              h('div', { class: 'aide' }, [...new Set(plages)].join(' / '), partie ? ` · ½ ${partie}` : '', e.lieu_texte ? ` · ${e.lieu_texte}` : '')),
            h('span', { class: 'etat' }, st.musee ? '🏛' : st.obtenu ? '✓' : ''));
        })) : h('p', { class: 'aide' }, seulementManquants ? 'Tout ce qui est disponible ce mois-ci est déjà au musée. Bravo !' : 'Rien ce mois-ci.')));
    }
  };

  dessiner();
  return surChangement(raison => {
    if (['coche', 'coches', 'reglages', 'profil'].includes(raison)) dessiner();
  });
}
