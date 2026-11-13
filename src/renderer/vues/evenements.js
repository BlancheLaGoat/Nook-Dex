// Vue « événements » : calendrier des fêtes, saisons et anniversaires du jeu du profil actif.
import { h, vider, image, ajouterA } from '../lib/dom.js';
import { etat, donneesCategorie, maintenant, surChangement } from '../lib/etat.js';
import { simplifier } from '../lib/filtres.js';
import { NOMS_MOIS, MOIS_COURTS } from '../lib/dispo.js';
import { occurrencesDuMois, sansJourCeMois, versIso, formaterJour, formaterPeriode } from '../lib/evenements.js';

const ICONES = { evenement: '🎉', saison: '🌸', anniversaire: '🎂' };
let choix = null; // { annee, mois }
const montrer = { evenement: true, saison: true, anniversaire: true };
let recherche = '';

export async function afficherEvenements(conteneur, jeu) {
  const evenements = await donneesCategorie(jeu.id, 'evenements');
  if (!choix) { const d = maintenant(); choix = { annee: d.getFullYear(), mois: d.getMonth() + 1 }; }

  const dessiner = () => {
    const defilement = conteneur.scrollTop;
    requestAnimationFrame(() => { conteneur.scrollTop = defilement; });
    vider(conteneur);
    const hemi = etat.profil.hemisphere;
    const aujourdhui = versIso(maintenant());
    const { annee, mois } = choix;
    const prefixeMois = `${annee}-${String(mois).padStart(2, '0')}`;
    const texte = simplifier(recherche).trim();
    const visibles = evenements.filter(e => montrer[e.type] && (!texte || simplifier(`${e.nom.fr} ${e.nom.en} ${e.personnage || ''}`).includes(texte)));

    // Occurrences du mois, regroupées par jour (le premier jour dans le mois).
    const parJour = new Map();
    const saisons = [];
    const sansJour = [];
    for (const e of visibles) {
      if (sansJourCeMois(e, mois)) { sansJour.push(e); continue; }
      for (const o of occurrencesDuMois(e, annee, mois, hemi)) {
        if (e.type === 'saison') { saisons.push({ e, ...o }); continue; }
        const jour = o.debut.startsWith(prefixeMois) ? o.debut : `${prefixeMois}-01`;
        if (!parJour.has(jour)) parJour.set(jour, []);
        parJour.get(jour).push({ e, ...o });
      }
    }
    const jours = [...parJour.keys()].sort();

    const changerMois = delta => {
      let m = mois + delta, a = annee;
      if (m < 1) { m = 12; a--; }
      if (m > 12) { m = 1; a++; }
      choix = { annee: a, mois: m };
      dessiner();
    };
    const interrupteur = (type, texteBouton) => h('label', { class: `interrupteur${montrer[type] ? ' actif' : ''}` },
      h('input', { type: 'checkbox', checked: montrer[type], onchange: ev => { montrer[type] = ev.target.checked; dessiner(); } }), texteBouton);

    const ligneEvenement = ({ e, debut, fin }) => h('div', { class: `ligne-evenement type-${e.type}${debut && debut <= aujourdhui && aujourdhui <= fin ? ' aujourdhui' : ''}` },
      e.image ? image(e.image, '', 'vignette petite') : h('span', { class: 'icone-evenement' }, ICONES[e.type]),
      h('div', { class: 'texte' },
        h('div', { class: 'nom' }, e.nom.fr, ' ', e.a_verifier ? h('span', { class: 'badge verifier', title: (e.notes || []).join(' ') || 'Information incertaine' }, 'à vérifier') : null),
        h('div', { class: 'aide' }, [
          debut && debut !== fin ? formaterPeriode({ debut, fin }) : '',
          e.horaires || '',
          e.regle || '',
          ...(e.notes || []),
        ].filter(Boolean).join(' · '))));

    ajouterA(conteneur,
      h('div', { class: 'titre-page' },
        h('h1', {}, '📆 Événements'),
        h('span', { class: 'sous-titre' }, jeu.nom, jeu.hemispheres ? ` · hémisphère ${hemi}` : '')),
      h('div', { class: 'navigation-annee' },
        h('button', { class: 'bouton petit', onclick: () => changerMois(-1), title: 'Mois précédent' }, '◀'),
        h('strong', {}, `${NOMS_MOIS[mois - 1]} ${annee}`),
        h('button', { class: 'bouton petit', onclick: () => changerMois(1), title: 'Mois suivant' }, '▶'),
        h('button', { class: 'bouton petit', onclick: () => { const d = maintenant(); choix = { annee: d.getFullYear(), mois: d.getMonth() + 1 }; dessiner(); } }, "Aujourd'hui")),
      h('div', { class: 'onglets-mois' }, MOIS_COURTS.map((m, i) => h('button', {
        class: `onglet-mois${i + 1 === mois ? ' actif' : ''}`, onclick: () => { choix = { annee, mois: i + 1 }; dessiner(); },
      }, m))),
      h('div', { class: 'filtres statique' },
        h('input', { class: 'champ-recherche', type: 'search', id: 'recherche', placeholder: 'Rechercher un événement ou un personnage…', value: recherche, oninput: ev => { recherche = ev.target.value; dessinerBientot(); } }),
        interrupteur('evenement', '🎉 Événements'),
        jeu.id === 'nh' ? interrupteur('saison', '🌸 Saisons') : null,
        jeu.id !== 'gc' ? interrupteur('anniversaire', '🎂 Anniversaires') : null),
    );

    if (saisons.length) {
      ajouterA(conteneur, h('div', { class: 'section' }, h('h2', {}, '🌸 Saisons ce mois-ci'),
        h('div', { class: 'liste-mini' }, saisons.map(({ e, debut, fin }) => h('span', { class: 'puce-element' }, e.nom.fr, h('span', { class: 'aide' }, ` (${formaterPeriode({ debut, fin })})`))))));
    }
    if (sansJour.length) {
      ajouterA(conteneur, h('div', { class: 'section' }, h('h2', {}, '❓ Ce mois-ci, jour variable'),
        h('div', { class: 'liste-evenements' }, sansJour.map(e => ligneEvenement({ e, debut: '', fin: '' })))));
    }
    if (!jours.length && !sansJour.length && !saisons.length) {
      ajouterA(conteneur, h('div', { class: 'vide' }, h('span', { class: 'grand' }, '🍃'), 'Rien de prévu ce mois-ci.'));
    }
    for (const jour of jours) {
      const liste = parJour.get(jour).sort((a, b) => (a.e.type === 'anniversaire') - (b.e.type === 'anniversaire') || a.e.nom.fr.localeCompare(b.e.nom.fr, 'fr'));
      ajouterA(conteneur, h('div', { class: `jour-evenements${jour === aujourdhui ? ' aujourdhui' : ''}` },
        h('h3', {}, formaterJour(jour), jour === aujourdhui ? h('span', { class: 'badge nouveau' }, "aujourd'hui") : null),
        h('div', { class: 'liste-evenements' }, liste.map(ligneEvenement))));
    }
  };

  let attente = null;
  const dessinerBientot = () => {
    clearTimeout(attente);
    attente = setTimeout(() => {
      dessiner();
      const r = document.getElementById('recherche');
      if (r) { r.focus(); r.setSelectionRange(r.value.length, r.value.length); }
    }, 200);
  };

  dessiner();
  return surChangement(raison => { if (raison === 'reglages' || raison === 'profil') dessiner(); });
}
