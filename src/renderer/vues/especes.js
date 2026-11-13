// Vue « par espèce » : une même créature dans tous les jeux, côte à côte,
// avec l'état (attrapée / au musée) dans chacun de tes profils.
import { h, vider, image, ajouterA, clochettes } from '../lib/dom.js';
import { etat, donneesCategorie } from '../lib/etat.js';
import { simplifier } from '../lib/filtres.js';
import { periodes, moisDisponibles, formaterMois, formaterHeures } from '../lib/dispo.js';
import { OMBRES } from '../lib/libelles.js';

const ORDRE = ['gc', 'ww', 'cf', 'nl', 'nh']; // ordre de sortie des jeux
const NOMS_CATEGORIES = { insectes: '🐞 Insectes', poissons: '🐟 Poissons', 'creatures-marines': '🐙 Créatures marines' };

let filtre = { texte: '', categorie: '', jeux: '' };
let ouverte = null;

export async function afficherEspeces(conteneur) {
  vider(conteneur).append(h('p', { class: 'aide' }, 'Chargement de tous les jeux…'));
  const especes = await window.nook.especes();
  const jeux = ORDRE.map(id => etat.jeux.find(j => j.id === id)).filter(j => j && j.disponible);

  // Données de tous les jeux + tous les profils (pour savoir où chaque espèce est déjà attrapée).
  const parJeu = {};
  for (const j of jeux) {
    parJeu[j.id] = {};
    for (const c of j.categories.filter(x => x.type === 'creature')) {
      parJeu[j.id][c.id] = new Map((await donneesCategorie(j.id, c.id)).map(e => [e.id, e]));
    }
  }
  const profils = [];
  for (const p of await window.nook.listerProfils()) {
    const complet = etat.profil && etat.profil.id === p.id ? etat.profil : await window.nook.lireProfil(p.id);
    if (complet) profils.push(complet);
  }

  const elementDe = (sp, jeuId) => {
    const ref = sp.jeux[jeuId];
    return ref && parJeu[jeuId] && parJeu[jeuId][ref.categorie] ? parJeu[jeuId][ref.categorie].get(ref.id) : null;
  };

  const zoneListe = h('div', { class: 'liste-especes' });

  const dessinerListe = () => {
    const texte = simplifier(filtre.texte).trim();
    const liste = especes.filter(sp => {
      if (filtre.categorie && sp.categorie !== filtre.categorie) return false;
      if (filtre.jeux === 'tous' && jeux.some(j => !sp.jeux[j.id])) return false;
      if (filtre.jeux === 'un' && Object.keys(sp.jeux).length !== 1) return false;
      if (texte) {
        const noms = jeux.map(j => elementDe(sp, j.id)).filter(Boolean).flatMap(e => [e.nom.fr, e.nom.en]).join(' ');
        if (!texte.split(/\s+/).every(m => simplifier(noms).includes(m))) return false;
      }
      return true;
    });
    vider(zoneListe);
    ajouterA(zoneListe, h('p', { class: 'resultats' }, `${liste.length} espèce${liste.length > 1 ? 's' : ''}`));
    for (const sp of liste) {
      const pastilles = jeux.map(j => {
        const present = !!sp.jeux[j.id];
        const e = elementDe(sp, j.id);
        const pris = present && e && profils.some(p => p.jeu === j.id && p.elements[`${sp.jeux[j.id].categorie}:${e.id}`]?.musee);
        return h('span', { class: `pastille-jeu${present ? '' : ' absent'}${pris ? ' pris' : ''}`, title: `${j.court} : ${present ? (pris ? 'au musée dans un de tes profils' : 'présente') : 'absente'}` }, j.sigle);
      });
      const ligne = h('div', { class: `ligne-espece${ouverte === sp.id ? ' ouverte' : ''}` },
        h('button', { class: 'entete-espece', onclick: () => { ouverte = ouverte === sp.id ? null : sp.id; dessinerListe(); } },
          image(sp.image, '', 'vignette petite'),
          h('div', { class: 'texte' }, h('div', { class: 'nom' }, sp.nom.fr), h('div', { class: 'aide' }, `${sp.nom.en} · ${NOMS_CATEGORIES[sp.categorie] || ''}`)),
          h('div', { class: 'pastilles' }, pastilles)),
        ouverte === sp.id ? comparaison(sp) : null);
      zoneListe.append(ligne);
    }
  };

  // Tableau comparatif : une colonne par jeu.
  const comparaison = sp => {
    const colonnes = jeux.filter(j => sp.jeux[j.id]);
    const cellule = (j, contenu) => h('td', {}, contenu);
    const ligneInfo = (titre, f) => h('tr', {}, h('th', {}, titre), colonnes.map(j => cellule(j, f(j, elementDe(sp, j.id)))));
    const moisTexte = (j, e) => {
      if (!e) return '—';
      if (j.hemispheres) return [h('div', {}, `Nord : ${formaterMois(moisDisponibles(e, 'nord'))}`), h('div', { class: 'aide' }, `Sud : ${formaterMois(moisDisponibles(e, 'sud'))}`)];
      const parties = (periodes(e, 'tous') || []).filter(p => p.jours).map(p => `${p.mois.map(m => m).join(', ')} : du ${p.jours[0]} au ${p.jours[1] >= 30 ? 'dernier jour' : p.jours[1]}`);
      return [h('div', {}, formaterMois(moisDisponibles(e, 'tous'))), parties.length ? h('div', { class: 'aide' }, `(mois partiels — ${parties.join(' ; ')})`) : null];
    };
    const heuresTexte = (j, e) => {
      if (!e) return '—';
      const p = periodes(e, j.hemispheres ? 'nord' : 'tous') || [];
      return [...new Set(p.map(x => formaterHeures(x.heures)))].join(' / ');
    };
    const etatProfils = (j, e) => {
      if (!e) return '—';
      const ps = profils.filter(p => p.jeu === j.id);
      if (!ps.length) return h('span', { class: 'aide' }, 'Aucun profil');
      return ps.map(p => {
        const st = p.elements[`${sp.jeux[j.id].categorie}:${e.id}`] || {};
        return h('div', {}, st.musee ? '🏛 ' : st.obtenu ? '✓ ' : '· ', p.nom);
      });
    };
    return h('div', { class: 'comparaison-especes' }, h('table', { class: 'tableau-comparaison' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), colonnes.map(j => h('th', {}, j.court)))),
      h('tbody', {},
        h('tr', {}, h('th', {}, ''), colonnes.map(j => h('td', {}, image(elementDe(sp, j.id)?.image, '', 'vignette')))),
        ligneInfo('Nom', (j, e) => (e ? [h('strong', {}, e.nom.fr), e.a_verifier?.includes('nom.fr') ? h('span', { class: 'badge verifier' }, 'à vérifier') : null] : '—')),
        ligneInfo('Lieu', (j, e) => (e && e.lieu_texte) || '—'),
        ligneInfo('Ombre', (j, e) => (e && e.ombre ? OMBRES[e.ombre] || e.ombre : '—')),
        ligneInfo('Mois', moisTexte),
        ligneInfo('Heures', heuresTexte),
        ligneInfo('Prix', (j, e) => (e && e.prix ? clochettes(e.prix.vente) : '—')),
        ligneInfo('Mes profils', etatProfils))));
  };

  const champ = h('input', { class: 'champ-recherche', type: 'search', id: 'recherche', placeholder: 'Rechercher une espèce (nom français ou anglais, tous jeux)…', value: filtre.texte, oninput: e => { filtre.texte = e.target.value; dessinerListe(); } });
  const choix = (valeur, options, f) => h('select', { onchange: e => { f(e.target.value); dessinerListe(); } }, options.map(([v, t]) => h('option', { value: v, selected: v === valeur }, t)));

  vider(conteneur);
  ajouterA(conteneur,
    h('div', { class: 'titre-page' }, h('h1', {}, '🔎 Par espèce'), h('span', { class: 'sous-titre' }, 'Une même créature dans tous les jeux, côte à côte')),
    h('div', { class: 'filtres' },
      champ,
      choix(filtre.categorie, [['', 'Toutes les créatures'], ['insectes', 'Insectes'], ['poissons', 'Poissons'], ['creatures-marines', 'Créatures marines']], v => { filtre.categorie = v; }),
      choix(filtre.jeux, [['', 'Tous'], ['tous', 'Présentes dans les 5 jeux'], ['un', "Présentes dans un seul jeu"]], v => { filtre.jeux = v; })),
    h('p', { class: 'aide' }, 'Les pastilles indiquent les jeux où l\'espèce existe (en vert : déjà au musée dans un de tes profils). Clique sur une espèce pour comparer.'),
    zoneListe);
  dessinerListe();
  return () => {};
}
