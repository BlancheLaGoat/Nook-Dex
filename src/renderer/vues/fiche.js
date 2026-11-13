// Fiche détaillée d'un élément (panneau qui glisse depuis la droite).
import { h, vider, image, clochettes, ajouterA } from '../lib/dom.js';
import { etat, etatDe, basculer, maintenant, surChangement } from '../lib/etat.js';
import { periodes, moisDisponibles, heuresDuMois, formaterMois, formaterHeures, MOIS_COURTS, estDisponible, partBientot, arriveCeMois, partieDuMois } from '../lib/dispo.js';
import { OMBRES, VITESSES, texteCondition, CHAMPS_A_VERIFIER, COULEURS_FLEURS } from '../lib/libelles.js';

let courant = null; // { jeu, cat, e }

const panneau = () => document.getElementById('fiche');

// L'élément dont la fiche est ouverte est entouré dans la liste.
function marquerSelection(id) {
  for (const el of document.querySelectorAll('.element.selectionne')) el.classList.remove('selectionne');
  if (!id) return null;
  const carte = document.querySelector(`.element[data-id="${CSS.escape(id)}"]`);
  if (carte) carte.classList.add('selectionne');
  return carte;
}

export function fermerFiche() {
  panneau().classList.remove('ouverte');
  panneau().setAttribute('aria-hidden', 'true');
  // La liste reprend toute la largeur.
  document.body.classList.remove('fiche-ouverte');
  marquerSelection(null);
  courant = null;
}

export function ouvrirFiche(jeu, cat, e) {
  if (courant && courant.cat.id === cat.id && courant.e.id === e.id && courant.jeu.id === jeu.id) {
    fermerFiche();
    return;
  }
  courant = { jeu, cat, e };
  dessiner();
  panneau().classList.add('ouverte');
  panneau().setAttribute('aria-hidden', 'false');
  panneau().scrollTop = 0;
  // La liste se resserre à gauche au lieu d'être cachée par la fiche.
  document.body.classList.add('fiche-ouverte');
  const carte = marquerSelection(e.id);
  // Une fois la liste resserrée, on garde l'élément cliqué visible.
  if (carte) setTimeout(() => carte.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 240);
}

document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && courant && !document.querySelector('.fond-fenetre')) fermerFiche(); });

surChangement((raison, detail) => {
  if (!courant) return;
  if (raison === 'coche' && detail.categorie === courant.cat.id && detail.id === courant.e.id) dessiner();
  else if (raison === 'coches' || raison === 'heure' || raison === 'reglages' || raison === 'profil') dessiner();
});

const ligne = (titre, valeur) => (valeur === null || valeur === undefined || valeur === '' ? null : h('tr', {}, h('td', {}, titre), h('td', {}, valeur)));

function dessiner() {
  const { cat, e } = courant;
  const st = etatDe(cat.id, e.id);
  const hemi = etat.profil.hemisphere;
  const creature = cat.type === 'creature';

  const coche = (champ, oui, non) => h('button', {
    class: `coche grande ${champ}${st[champ] ? ' oui' : ''}`,
    onclick: () => basculer(cat.id, e.id, champ),
  }, st[champ] ? oui : non);

  const entete = h('div', { class: 'fiche-entete' },
    h('button', { class: 'bouton-icone fiche-fermer', title: 'Fermer', onclick: fermerFiche }, '✕'),
    image(e.image, e.nom.fr),
    h('h2', {}, e.nom.fr),
    h('div', { class: 'nom-en' }, `${e.nom.en}${e.n != null ? ` · n° ${e.n}` : ''}`),
    h('div', { class: 'fiche-coches' },
      coche('obtenu', creature ? '✓ Attrapé' : '✓ Obtenu', creature ? 'Pas encore attrapé' : 'Pas encore obtenu'),
      cat.musee ? coche('musee', '🏛 Donné au musée', 'Pas encore au musée') : null),
    st.le ? h('div', { class: 'aide', style: { marginTop: '8px' } }, `Coché le ${new Date(st.le).toLocaleDateString('fr-FR')}`) : null,
  );

  const corps = h('div', { class: 'fiche-corps' });

  if (e.a_verifier) {
    ajouterA(corps, h('div', { class: 'note verifier' },
      '⚠️ À vérifier : ', e.a_verifier.map(a => CHAMPS_A_VERIFIER[a] || a).join(', '), '. ',
      e.a_verifier.includes('nom.fr') ? 'Le nom français officiel n\'est pas encore connu : le nom anglais est affiché à la place.' : 'Cette information est incertaine dans les sources.'));
  }

  // ---------- Créatures : où, quand, comment ----------
  if (creature) {
    const infos = h('table', { class: 'tableau-infos' },
      ligne('Lieu', e.lieu_texte),
      ligne("Taille de l'ombre", e.ombre ? OMBRES[e.ombre] || e.ombre : null),
      ligne('Déplacement', e.vitesse ? VITESSES[e.vitesse] || e.vitesse : null),
      ligne('Prix de vente', e.prix && clochettes(e.prix.vente)),
      ligne('Prix (version américaine)', e.prix && e.prix.vente_na != null && e.prix.vente_na !== e.prix.vente ? clochettes(e.prix.vente_na) : null),
      ligne(e.prix && e.prix.special ? `Prix chez ${e.prix.special.acheteur}` : null, e.prix && e.prix.special ? clochettes(e.prix.special.prix) : null),
    );
    ajouterA(corps, h('h3', {}, 'Informations'), infos);

    if (e.conditions && e.conditions.length) {
      ajouterA(corps, h('h3', {}, 'Conditions spéciales'), h('ul', { class: 'liste-conditions' }, e.conditions.map(c => h('li', {}, texteCondition(c)))));
    }

    const p = periodes(e, hemi);
    if (p) {
      const date = maintenant();
      const moisCourant = date.getMonth() + 1;
      const mois = moisDisponibles(e, hemi);
      const titreHemi = etat.jeux.find(j => j.id === etat.profil.jeu)?.hemispheres ? ` (hémisphère ${hemi})` : '';
      const dispo = estDisponible(e, hemi, date);
      ajouterA(corps, 
        h('h3', {}, `Disponibilité${titreHemi}`),
        h('div', { style: { marginBottom: '8px' } },
          dispo ? h('span', { class: 'badge nouveau' }, '⏰ Disponible maintenant') : h('span', { class: 'badge' }, 'Pas disponible en ce moment'), ' ',
          partBientot(e, hemi, moisCourant) ? h('span', { class: 'badge verifier' }, 'Part à la fin du mois !') : null,
          arriveCeMois(e, hemi, moisCourant) ? h('span', { class: 'badge ext' }, 'Arrivé ce mois-ci') : null),
        h('div', { class: 'mois-grille' }, MOIS_COURTS.map((m, i) => {
          const partie = mois.has(i + 1) ? partieDuMois(e, hemi, i + 1) : null;
          return h('div', { class: `mois-case${mois.has(i + 1) ? ' oui' : ''}${partie ? ' partiel' : ''}${i + 1 === moisCourant ? ' courant' : ''}`, title: partie ? `Seulement ${partie}` : '' }, m, partie ? '½' : '');
        })),
        h('p', { class: 'aide' }, `Mois : ${formaterMois(mois)}`),
      );
      // Horaires : une ligne par période (les horaires peuvent changer selon le mois dans certains jeux).
      for (const per of p) {
        const heures = heuresDuMois(e, hemi, per.mois[0]);
        ajouterA(corps, 
          p.length > 1 ? h('div', { class: 'aide' }, formaterMois(new Set(per.mois)), per.jours ? ` (du ${per.jours[0]} au ${per.jours[1] >= 30 ? 'dernier jour' : per.jours[1]})` : '') : null,
          h('div', { class: 'heures-barre', title: formaterHeures(per.heures) },
            Array.from({ length: 24 }, (_, i) => h('div', { class: `${heures.has(i) ? 'oui' : ''}${i === date.getHours() && per.mois.includes(moisCourant) ? ' courant' : ''}`, title: `${i} h` }))),
          h('div', { class: 'heures-legende' }, h('span', {}, '0 h'), h('span', {}, '6 h'), h('span', {}, '12 h'), h('span', {}, '18 h'), h('span', {}, '24 h')),
          h('p', { class: 'aide' }, `Heures : ${formaterHeures(per.heures)}`),
        );
      }
    }
  }

  // ---------- Œuvres d'art : la vraie et la fausse ----------
  if (cat.type === 'art') {
    ajouterA(corps, h('h3', {}, 'Œuvre réelle'), h('table', { class: 'tableau-infos' },
      ligne('Titre', e.oeuvre && e.oeuvre.titre),
      ligne('Artiste', e.oeuvre && e.oeuvre.artiste),
      ligne('Type', e.sous)));
    if (e.faux && e.faux.image) {
      ajouterA(corps, h('h3', {}, 'Vraie ou fausse ?'),
        h('div', { class: 'comparaison' },
          h('figure', {}, image(e.image, 'Vraie', 'vignette'), h('figcaption', {}, '✅ Vraie')),
          h('figure', {}, image(e.faux.image, 'Fausse', 'vignette'), h('figcaption', {}, '❌ Fausse'))),
        h('p', { class: 'aide' }, 'Compare les deux images : la fausse a un détail différent.'));
    } else if (e.faux) {
      ajouterA(corps, h('p', { class: 'note' }, e.faux.indiscernable
        ? '⚠️ Cette œuvre peut être vraie ou fausse, et rien ne permet de les distinguer.'
        : '⚠️ Il existe une fausse version de cette œuvre.'));
    } else if (e.faux === null) {
      ajouterA(corps, h('p', { class: 'note' }, "✅ Cette œuvre n'existe qu'en version authentique : pas de piège possible."));
    }
  }

  // ---------- Fossiles ----------
  if (cat.type === 'fossile' && e.groupe) {
    const freres = (etat.donnees.get(`${courant.jeu.id}/${cat.id}`) || []).filter(x => x.groupe && x.groupe.id === e.groupe.id);
    if (freres.length > 1) {
      const faits = freres.filter(x => etatDe(cat.id, x.id).musee).length;
      ajouterA(corps, h('h3', {}, `${e.groupe.fr} : ${faits} / ${freres.length} parties au musée`),
        h('div', { class: 'liste-mini' }, freres.map(x => h('button', {
          class: `puce-element${etatDe(cat.id, x.id).obtenu ? ' obtenu' : ''}`,
          onclick: () => ouvrirFiche(courant.jeu, cat, x),
        }, image(x.image, ''), x.nom.fr))));
    }
  }

  // ---------- Recettes ----------
  if (cat.type === 'recette' && e.materiaux) {
    ajouterA(corps, h('h3', {}, 'Matériaux'), h('table', { class: 'tableau-infos' },
      e.materiaux.map(m => ligne(m.fr, `× ${m.n}`))));
  }

  // ---------- Résidences de vacances (Happy Home Paradise) ----------
  if (cat.type === 'vacances') {
    ajouterA(corps, h('h3', {}, 'Demande'), h('p', {}, `« ${e.bulle || e.demande} »`),
      h('table', { class: 'tableau-infos' }, ligne('Thème', e.demande), ligne('Musique', e.chanson)),
      e.meubles && e.meubles.length ? h('p', { class: 'aide' }, `Objets demandés : ${e.meubles.join(', ')}`) : null);
  }

  // ---------- Objets : infos générales ----------
  if (!creature) {
    const prix = e.prix || {};
    const t = h('table', { class: 'tableau-infos' },
      ligne('Sous-catégorie', cat.type === 'art' ? null : e.sous),
      ligne('Groupe', e.groupe ? e.groupe.fr : null),
      ligne('Couleur', cat.type === 'fleur' ? COULEURS_FLEURS[e.couleur] || e.couleur : null),
      ligne('Hybride', cat.type === 'fleur' ? (e.hybride ? 'Oui (s\'obtient en croisant des fleurs)' : 'Non (fleur de base)') : null),
      ligne('Salle du musée', e.salle),
      ligne("Prix d'achat", prix.achat != null ? clochettes(prix.achat) : null),
      ligne('Prix de vente', prix.vente != null ? clochettes(prix.vente) : null),
      ligne('Échange', prix.echange ? `${prix.echange.prix} ${prix.echange.monnaie}` : null),
      ligne('Variantes', e.variantes ? `${e.variantes} (couleurs ou motifs)` : null),
      ligne('Fabrication', e.diy ? 'Oui (recette DIY)' : null),
      ligne('Événement', e.evenement),
      ligne('Extension', e.ext ? ((courant.jeu.extensions || []).find(x => x.id === e.ext) || {}).nom || e.ext : null),
      ligne('Ajouté en', e.v ? `version ${e.v}` : null),
    );
    if (t.children.length) ajouterA(corps, h('h3', {}, 'Informations'), t);
  }

  if (e.versions) {
    ajouterA(corps, h('h3', {}, 'Versions du jeu'), h('p', {}, e.versions.join(' · ')));
  }
  if (e.notes && e.notes.length) {
    ajouterA(corps, h('h3', {}, 'À savoir'), h('ul', { class: 'liste-conditions' }, e.notes.map(n => h('li', {}, `• ${n}`))));
  }

  if (e.sources && e.sources.length) {
    ajouterA(corps, h('h3', {}, "Comment l'obtenir"), h('ul', { class: 'liste-conditions' }, e.sources.map(s => h('li', {}, `• ${s}`))));
    if (e.notes_source) ajouterA(corps, h('p', { class: 'aide' }, e.notes_source));
  }

  ajouterA(corps, h('h3', {}, 'En savoir plus'),
    h('button', { class: 'bouton petit', onclick: () => window.nook.ouvrirLien(`https://nookipedia.com/wiki/Special:Search?search=${encodeURIComponent(e.nom.en)}`) }, 'Ouvrir sur Nookipedia (anglais)'));

  vider(panneau()).append(entete, corps);
}
