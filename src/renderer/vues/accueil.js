// Tableau de bord du profil : progression globale, par catégorie, et créatures du moment.
import { h, vider, image, ajouterA } from '../lib/dom.js';
import { etat, donneesChargees, etatDe, maintenant, surChangement } from '../lib/etat.js';
import { progression, estActif } from '../lib/filtres.js';
import { estDisponible, partBientot, arriveCeMois, NOMS_MOIS } from '../lib/dispo.js';
import { ouvrirFiche } from './fiche.js';

export function afficherAccueil(conteneur, jeu, allerVers) {
  let noteJeu = null;
  const dessiner = () => {
    vider(conteneur);
    const hemi = etat.profil.hemisphere;
    const date = maintenant();
    const mois = date.getMonth() + 1;

    // Progression globale
    let total = 0, obtenus = 0, musee = 0, totalMusee = 0;
    const parCat = jeu.categories
      .filter(c => !c.ext || etat.profil.extensions.includes(c.ext))
      .map(c => {
        const p = progression(donneesChargees(jeu.id, c.id), etat.profil, c.id);
        total += p.total; obtenus += p.obtenus; musee += p.musee; totalMusee += p.totalMusee;
        return { c, p };
      });
    const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0);

    ajouterA(conteneur, 
      h('div', { class: 'titre-page' },
        h('h1', {}, etat.profil.nom),
        h('span', { class: 'sous-titre' }, jeu.nom, jeu.hemispheres ? ` · hémisphère ${hemi}` : '',
          etat.profil.extensions.length ? ` · ${etat.profil.extensions.map(x => (jeu.extensions.find(e => e.id === x) || {}).nom || x).join(', ')}` : '')),
      h('div', { class: 'bandeau' },
        h('div', { class: 'bloc' },
          h('div', { class: 'grand-chiffre' }, `${pc(obtenus, total)} %`),
          h('div', {}, `${obtenus.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} éléments obtenus`),
          h('div', { class: 'barre grosse', style: { marginTop: '8px' } }, h('div', { style: { width: `${pc(obtenus, total)}%` } }))),
        h('div', { class: 'bloc' },
          h('div', { class: 'grand-chiffre' }, `${pc(musee, totalMusee)} %`),
          h('div', {}, `${musee} / ${totalMusee} dons au musée`),
          h('div', { class: 'barre grosse musee', style: { marginTop: '8px' } }, h('div', { style: { width: `${pc(musee, totalMusee)}%` } })))),
    );

    if (noteJeu) conteneur.append(h('p', { class: 'note' }, 'ℹ️ ', noteJeu));

    // Créatures du moment
    const creatures = jeu.categories.filter(c => c.type === 'creature');
    if (creatures.length) {
      const maintenantListe = [], partListe = [], arriveListe = [];
      for (const c of creatures) {
        for (const e of donneesChargees(jeu.id, c.id)) {
          if (!estActif(e, etat.profil.extensions)) continue;
          const st = etatDe(c.id, e.id);
          if (st.musee) continue; // déjà au musée : rien à faire
          if (estDisponible(e, hemi, date)) maintenantListe.push([c, e, st]);
          if (partBientot(e, hemi, mois)) partListe.push([c, e, st]);
          if (arriveCeMois(e, hemi, mois)) arriveListe.push([c, e, st]);
        }
      }
      const puces = liste => h('div', { class: 'liste-mini' }, liste.map(([c, e, st]) =>
        h('button', { class: `puce-element${st.obtenu ? ' obtenu' : ''}`, title: `${c.nom} — ${e.lieu_texte || ''}`, onclick: () => ouvrirFiche(jeu, c, e) },
          image(e.image, ''), e.nom.fr)));
      const section = (titre, liste, vide) => h('div', { class: 'section' },
        h('h2', {}, titre, h('span', { class: 'compte' }, `${liste.length}`)),
        liste.length ? puces(liste) : h('p', { class: 'aide' }, vide));
      ajouterA(conteneur, 
        section(`⏰ À attraper maintenant (${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`, maintenantListe, 'Tout ce qui est disponible maintenant est déjà au musée. Bravo !'),
        section(`🍂 Part à la fin de ${NOMS_MOIS[mois - 1]}`, partListe, 'Rien ne part à la fin du mois (ou tout est déjà au musée).'),
        section(`🌱 Arrivé en ${NOMS_MOIS[mois - 1]}`, arriveListe, 'Pas de nouvelle créature ce mois-ci à donner au musée.'),
      );
    }

    // Cartes par catégorie
    ajouterA(conteneur, h('div', { class: 'section' }, h('h2', {}, 'Catégories'),
      h('div', { class: 'grille-cartes' }, parCat.map(({ c, p }) => h('div', { class: 'carte cliquable', onclick: () => allerVers(c.id) },
        h('h3', {}, c.icone, c.nom),
        h('div', { class: 'barre' }, h('div', { style: { width: `${pc(p.obtenus, p.total)}%` } })),
        c.musee ? h('div', { class: 'barre musee' }, h('div', { style: { width: `${pc(p.musee, p.totalMusee)}%` } })) : null,
        h('div', { class: 'chiffres' },
          h('span', {}, `${p.obtenus} / ${p.total}`),
          c.musee ? h('span', {}, `🏛 ${p.musee} / ${p.totalMusee}`) : h('span', {}, `${pc(p.obtenus, p.total)} %`)))))));
  };

  dessiner();
  // Note propre au jeu (par ex. les différences avec les versions japonaises du GameCube).
  window.nook.infosDonnees(jeu.id).then(infos => {
    if (infos && infos.note && conteneur.isConnected) {
      noteJeu = infos.note;
      conteneur.querySelector('.bandeau')?.after(h('p', { class: 'note' }, 'ℹ️ ', noteJeu));
    }
  });
  return surChangement(raison => {
    if (['coche', 'coches', 'heure', 'reglages', 'profil'].includes(raison)) dessiner();
  });
}
