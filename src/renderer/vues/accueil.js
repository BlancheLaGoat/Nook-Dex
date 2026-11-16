// Tableau de bord du profil : progression globale, par catégorie, et créatures du moment.
import { h, vider, image, ajouterA } from '../lib/dom.js';
import { etat, donneesChargees, etatDe, maintenant, surChangement } from '../lib/etat.js';
import { progression, estActif } from '../lib/filtres.js';
import { estDisponible, partBientot, arriveCeMois, NOMS_MOIS } from '../lib/dispo.js';
import { ouvrirFiche } from './fiche.js';
import { prochains, formaterPeriode } from '../lib/evenements.js';
import { donneesCategorie, rareteDe } from '../lib/etat.js';
import { maxAnnee, tauxMaintenant, valeurMaintenant, formaterPourcent } from '../lib/rarete.js';
import { lignesAFaire, texteChance, texteTirages } from './a-faire.js';
import { texteDepart } from '../lib/a-faire.js';
import { fenetreImportSauvegarde, JEUX_AVEC_SAUVEGARDE } from './sauvegarde.js';

const AIDE_SAUVEGARDE = {
  gc: 'Coche ce que contient ta sauvegarde (.gci ou carte mémoire .raw de Dolphin)',
  ww: 'Coche ce que contient ta sauvegarde (.sav, ou .dsv de DeSmuME / RetroArch)',
  cf: 'Coche ce que contient ta sauvegarde (RVFOREST.DAT, exporté avec SaveGame Manager GX ou copié depuis Dolphin)',
  nl: 'Coche ce que contient ta sauvegarde (garden_plus.dat, exporté avec Checkpoint, JKSM ou Citra)',
  nh: 'Coche ce que contient ta sauvegarde (dossier exporté avec JKSV ou Checkpoint, version 3.0)',
};

export function afficherAccueil(conteneur, jeu, allerVers) {
  let noteJeu = null;
  let evenements = [];
  donneesCategorie(jeu.id, 'evenements').then(l => { evenements = l || []; if (conteneur.isConnected) dessiner(); }).catch(() => {});
  const dessiner = () => {
    // On garde la position de défilement quand la page se redessine (après une coche).
    const defilement = conteneur.scrollTop;
    requestAnimationFrame(() => { conteneur.scrollTop = defilement; });
    vider(conteneur);
    const hemi = etat.profil.hemisphere;
    const date = maintenant();
    const mois = date.getMonth() + 1;
    const versAujourdhui = `${date.getFullYear()}-${String(mois).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

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

    if (JEUX_AVEC_SAUVEGARDE.includes(jeu.id)) {
      conteneur.append(h('div', { class: 'actions', style: { justifyContent: 'flex-start' } },
        h('button', { class: 'bouton', title: AIDE_SAUVEGARDE[jeu.id], onclick: () => fenetreImportSauvegarde(jeu) }, '💾 Importer ma sauvegarde du jeu…')));
    }

    if (noteJeu) conteneur.append(h('p', { class: 'note' }, 'ℹ️ ', noteJeu));

    // Prochains événements (14 jours) et anniversaires (aujourd'hui et demain)
    if (evenements.length) {
      const fetes = prochains(evenements, date, 14, hemi, e => e.type === 'evenement');
      const anniv = prochains(evenements, date, 1, hemi, e => e.type === 'anniversaire');
      ajouterA(conteneur, h('div', { class: 'section' },
        h('h2', {}, '📆 À venir', h('span', { class: 'compte' }, 'les 14 prochains jours'),
          h('button', { class: 'bouton petit', style: { marginLeft: 'auto' }, onclick: () => allerVers('evenements') }, 'Voir le calendrier')),
        fetes.length ? h('div', { class: 'liste-mini' }, fetes.slice(0, 12).map(o => h('span', { class: `puce-element${o.enCours ? ' en-cours' : ''}`, title: o.e.regle || '' },
          '🎉 ', o.e.nom.fr, h('span', { class: 'aide' }, ` — ${o.enCours && o.debut !== o.fin ? "en cours jusqu'au " + formaterPeriode({ debut: o.fin, fin: o.fin }) : formaterPeriode(o)}`))))
          : h('p', { class: 'aide' }, 'Aucun événement dans les 14 prochains jours.'),
        anniv.length ? h('div', { class: 'liste-mini', style: { marginTop: '8px' } }, anniv.map(o => h('span', { class: 'puce-element' },
          o.e.image ? image(o.e.image, '') : '🎂 ', o.e.nom.fr, h('span', { class: 'aide' }, ` — ${o.debut === versAujourdhui ? "aujourd'hui" : 'demain'}`)))) : null));
    }

    // Créatures du moment
    const creatures = jeu.categories.filter(c => c.type === 'creature');
    // « Que faire maintenant ? » : les 3 meilleures pistes, et un lien vers la page complète.
    if (creatures.length) {
      const pistes = lignesAFaire(jeu).slice(0, 3);
      ajouterA(conteneur, h('div', { class: 'section' },
        h('h2', {}, '🎯 Que faire maintenant ?',
          h('button', { class: 'bouton petit', style: { marginLeft: 'auto' }, onclick: () => allerVers('a-faire') }, 'Voir toute la liste')),
        pistes.length
          ? h('div', { class: 'liste-mini' }, pistes.map(l => h('button', { class: 'puce-element', title: texteDepart(l.depart), onclick: () => ouvrirFiche(jeu, l.cat, l.e) },
            image(l.e.image, ''), l.e.nom.fr,
            h('span', { class: 'aide' }, ` ${[texteChance(l), texteTirages(l)].filter(Boolean).join(' · ') || 'disponible maintenant'}`))))
          : h('p', { class: 'aide' }, 'Tout ce qui est disponible maintenant est déjà attrapé. Bravo !')));
    }
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
      // Avec les taux d'apparition : les plus rares du moment d'abord, avec leur pourcentage.
      const tauxDe = new Map();
      for (const [c, e] of maintenantListe) {
        const cr = rareteDe(c.id);
        if (cr && maxAnnee(cr, e.id)) tauxDe.set(e, valeurMaintenant(tauxMaintenant(cr, e.id, date)));
      }
      if (tauxDe.size) {
        const cleTri = e => (tauxDe.has(e) && tauxDe.get(e) > 0 ? tauxDe.get(e) : Infinity);
        maintenantListe.sort((a, b) => cleTri(a[1]) - cleTri(b[1]) || a[1].nom.fr.localeCompare(b[1].nom.fr, 'fr'));
      }
      const puces = liste => h('div', { class: 'liste-mini' }, liste.map(([c, e, st]) =>
        h('button', { class: `puce-element${st.obtenu ? ' obtenu' : ''}`, title: `${c.nom} — ${e.lieu_texte || ''}`, onclick: () => ouvrirFiche(jeu, c, e) },
          image(e.image, ''), e.nom.fr,
          liste === maintenantListe && tauxDe.has(e) ? h('span', { class: 'aide' }, ` ${formaterPourcent(tauxDe.get(e))}`) : null)));
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
