// Écran « Badges d'Hélium » (New Leaf) : les 24 badges, leur niveau et ce qu'il manque pour le palier suivant.
// Rien n'est lu en direct : la lecture vient de l'import de la sauvegarde, ou d'une saisie à la main (joueurs sur
// console) ; elle est gardée dans profil.badges et synchronisée. Les calculs sont dans lib/badges.js.
import { h, vider, ajouterA } from '../lib/dom.js';
import { etat, donneesCategorie, surChangement, planifierSauvegarde, signaler } from '../lib/etat.js';
import { etatBadges, texteProgression, normaliserBadges, saisirBadge, NOMS_NIVEAUX, MEDAILLES } from '../lib/badges.js';
import { fenetreImportSauvegarde } from './sauvegarde.js';

// Réglages de la page, gardés le temps de la session.
const choixPage = { filtre: 'tous', saisie: false };

// D'où vient la lecture, en quelques mots (en-tête de l'écran et « Que faire maintenant ? »).
export function origineBadges(lecture, dateFr) {
  if (!lecture) return null;
  const quand = lecture.lu_le ? ` le ${dateFr(lecture.lu_le)}` : '';
  if (lecture.manuel && !lecture.nom) return `Saisis à la main${quand}`;
  const qui = lecture.nom || `le joueur ${lecture.joueur}`;
  return lecture.manuel ? `Lus pour ${qui}, retouchés à la main${quand}` : `Lus${quand} pour ${qui}`;
}

// Change un badge à la main, l'enregistre (et la synchro suit), puis redessine les écrans.
// Saisie refusée (ex. « 1.5 ») : rien n'est enregistré, le redessin remet l'ancienne valeur dans le champ.
function saisir(cas, modifs) {
  const avant = etat.profil.badges;
  const apres = saisirBadge(avant, cas, modifs);
  if (apres !== avant) { etat.profil.badges = apres; planifierSauvegarde(); }
  // Après que le focus est passé au champ suivant (touche Tab) : le redessin le remet au même endroit.
  setTimeout(() => signaler('badges'), 0);
}

const dateFr = iso => {
  const [a, m, j] = String(iso || '').split('-').map(Number);
  return a ? new Date(a, m - 1, j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
};

export async function afficherBadges(conteneur, jeu) {
  const donnees = (await donneesCategorie(jeu.id, 'badges')) || {};
  const defs = donnees.badges || [];

  // Redessine en gardant la position dans la page et le champ de saisie actif.
  const dessiner = () => {
    const defilement = conteneur.scrollTop;
    const actif = document.activeElement && conteneur.contains(document.activeElement) ? document.activeElement.dataset.cle : null;
    dessinerPage();
    conteneur.scrollTop = defilement;
    const champ = actif && conteneur.querySelector(`[data-cle="${actif}"]`);
    if (champ) champ.focus();
  };

  const dessinerPage = () => {
    vider(conteneur);
    if (!defs.length) { conteneur.append(h('p', { class: 'note' }, 'Les données des badges sont introuvables : réinstalle Nook Dex ou mets-le à jour.')); return; }
    const lecture = normaliserBadges(etat.profil.badges);
    const etats = etatBadges(defs, lecture);
    const enOr = etats.filter(e => e.niveau === 3).length;
    ajouterA(conteneur,
      h('div', { class: 'titre-page' },
        h('h1', {}, "🎖️ Badges d'Hélium"),
        h('span', { class: 'sous-titre' }, lecture
          ? `${origineBadges(lecture, dateFr)} · ${enOr} sur ${defs.length} en or`
          : 'Pas encore lus ni saisis')),
      h('div', { class: 'filtres statique' },
        h('select', { onchange: e => { choixPage.filtre = e.target.value; dessiner(); } },
          [['tous', 'Tous les badges'], ['pas-or', 'Pas encore en or']].map(([v, t]) => h('option', { value: v, selected: v === choixPage.filtre }, t))),
        h('button', { class: 'bouton', onclick: () => fenetreImportSauvegarde(jeu) }, '💾 Lire ma sauvegarde…'),
        h('button', { class: `bouton${choixPage.saisie ? ' principal' : ''}`, onclick: () => { choixPage.saisie = !choixPage.saisie; dessiner(); } },
          choixPage.saisie ? '✔ Terminer la saisie' : '✏️ Saisir à la main')),
      h('p', { class: 'aide' }, choixPage.saisie
        ? "Choisis le niveau de chaque badge (comme sur ta carte de résident) et, si tu le connais, ton compteur. Laisse le compteur vide si tu ne le connais pas : Nook Dex n'invente rien. Tout est enregistré tout de suite."
        : lecture
          ? "Pour mettre à jour, relis ta sauvegarde (garden_plus.dat) ou corrige à la main. Nook Dex ne modifie jamais ta sauvegarde."
          : "Lis ta sauvegarde (garden_plus.dat) : Nook Dex y trouve le niveau de chaque badge et, pour la plupart, où tu en es. Tu joues sur console sans pouvoir copier ta sauvegarde ? Utilise « Saisir à la main »."),
      h('p', { class: 'note verifier' }, "⚠️ À vérifier : le niveau des 24 badges est vérifié sur de vraies sauvegardes, mais la progression ne l'est que pour 9 badges (marqués ✔). Les noms français des badges sont aussi à vérifier dans le jeu."),
    );

    // Pendant la saisie, toutes les cartes restent : choisir « or » ne fait pas disparaître le menu sous la souris.
    const visibles = etats.filter(e => choixPage.saisie || choixPage.filtre !== 'pas-or' || e.niveau !== 3);
    if (!visibles.length) { conteneur.append(h('p', { class: 'note' }, 'Tous tes badges sont en or. Bravo !')); return; }
    conteneur.append(h('div', { class: 'grille-cartes' }, visibles.map(e => {
      const d = e.def;
      const nomNiveau = e.niveau ? d.paliers[e.niveau - 1] : (e.lu || choixPage.saisie ? 'aucun badge' : '—');
      return h('div', { class: `carte badge-carte${e.aRecuperer ? ' a-recuperer' : ''}` },
        h('h3', {}, h('span', { title: e.niveau == null ? 'niveau inconnu' : NOMS_NIVEAUX[e.niveau] }, MEDAILLES[e.niveau || 0]), d.groupe),
        h('div', { class: 'badge-niveau' }, nomNiveau, e.niveau ? h('span', { class: 'aide' }, ` (${NOMS_NIVEAUX[e.niveau]})`) : null),
        e.cible && e.connu ? h('div', { class: 'barre' }, h('div', { style: { width: `${Math.min(100, Math.round(e.avance * 100))}%` } })) : null,
        h('div', { class: `badge-progression${e.aRecuperer ? ' urgent' : ''}` }, texteProgression(e)),
        choixPage.saisie ? h('div', { class: 'badge-saisie' },
          h('label', {}, 'Niveau ',
            h('select', { 'data-cle': `${d.case}-niveau`, onchange: ev => saisir(d.case, { niveau: ev.target.value }) },
              [0, 1, 2, 3].map(n => h('option', { value: String(n), selected: (e.niveau || 0) === n }, n ? `${MEDAILLES[n]} ${NOMS_NIVEAUX[n]}` : 'aucun')))),
          h('label', {}, `Compteur (${d.unite[1]}) `,
            h('input', {
              'data-cle': `${d.case}-valeur`, type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: 'inconnu',
              value: e.valeur == null ? '' : String(e.valeur),
              onchange: ev => saisir(d.case, { valeur: ev.target.value }),
            }))) : null,
        e.connu ? h('div', { class: 'aide' }, `${e.valeur.toLocaleString('fr-FR')}${d.unite[1] === '%' ? ' %' : ` ${d.unite[e.valeur > 1 ? 1 : 0]}`} · paliers ${d.seuils.map(s => s.toLocaleString('fr-FR')).join(' / ')}`) : null,
        h('div', { class: 'aide' }, d.compte, ' ', d.verifie ? h('span', { title: 'Progression vérifiée sur de vraies sauvegardes' }, '✔') : h('span', { class: 'a-verifier' }, 'à vérifier')),
        d.note ? h('div', { class: 'aide' }, `ℹ️ ${d.note}`) : null);
    })));
  };

  dessiner();
  return surChangement(raison => {
    if (['badges', 'profil'].includes(raison)) dessiner();
  });
}
