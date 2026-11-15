// « Que faire maintenant ? » : les créatures qui me manquent et que je peux attraper tout de suite,
// les plus faciles d'abord (ou les plus rares), avec le lieu, la chance par tirage et quand elles partent.
// Les calculs sont dans lib/a-faire.js ; sans taux pour le jeu, on n'affiche que la disponibilité.
import { h, vider, image, ajouterA } from '../lib/dom.js';
import { etat, donneesChargees, etatDe, maintenant, surChangement, rareteDe } from '../lib/etat.js';
import { listeAFaire, texteDepart, UNITE_TIRAGE } from '../lib/a-faire.js';
import { formaterPourcent } from '../lib/rarete.js';
import { ouvrirFiche } from './fiche.js';

// Réglages de la page, gardés le temps de la session.
const choixPage = { manque: 'obtenu', ordre: 'faciles', categorie: '' };

// Les lignes de la liste pour le profil actif (utilisé aussi par le tableau de bord).
export function lignesAFaire(jeu, options = {}) {
  const cats = jeu.categories.filter(c => c.type === 'creature' && (!c.ext || etat.profil.extensions.includes(c.ext)));
  return listeAFaire(
    cats.filter(c => !options.categorie || c.id === options.categorie).map(cat => ({ cat, elements: donneesChargees(jeu.id, cat.id), cr: rareteDe(cat.id) })),
    { hemisphere: etat.profil.hemisphere, date: maintenant(), extensions: etat.profil.extensions, etatDe, manque: options.manque || 'obtenu', ordre: options.ordre || 'faciles' },
  );
}

// Morceaux de texte d'une ligne : chance (« 12 % par tirage · Rivière »), tirages (« environ 8 ombres »).
export function texteChance(l) {
  const c = l.chance;
  if (!c) return null;
  if (c.pourcent > 0) return `${formaterPourcent(c.pourcent)} par tirage${c.lieu ? ` · ${c.lieu}` : ''}`;
  if (c.pluie) return `${formaterPourcent(c.pluie)} par tirage, seulement s'il pleut${c.lieu ? ` · ${c.lieu}` : ''}`;
  return null;
}
// Sans chiffre : on dit pourquoi (jamais de chiffre inventé).
function texteSansChance(l) {
  const cr = rareteDe(l.cat.id);
  const raison = cr && cr.sans_taux && cr.sans_taux[l.e.id];
  if (raison) return h('span', { class: 'aide', title: raison }, "Pas de taux : apparaît d'une autre façon");
  if (l.chance) return h('span', { class: 'aide' }, "Pas dans les tables du jeu à ce créneau");
  return h('span', { class: 'aide' }, cr ? "Pas de taux pour cette espèce" : 'Disponible maintenant');
}
export const texteTirages = l => (l.tirages ? `environ ${l.tirages.toLocaleString('fr-FR')} ${UNITE_TIRAGE[l.cat.id] || 'tirages'}` : null);

export function afficherAFaire(conteneur, jeu) {
  const dessiner = () => {
    const defilement = conteneur.scrollTop;
    requestAnimationFrame(() => { conteneur.scrollTop = defilement; });
    vider(conteneur);
    const date = maintenant();
    const cats = jeu.categories.filter(c => c.type === 'creature' && (!c.ext || etat.profil.extensions.includes(c.ext)));
    const avecMusee = cats.some(c => c.musee);
    if (!avecMusee) choixPage.manque = 'obtenu';
    if (choixPage.categorie && !cats.some(c => c.id === choixPage.categorie)) choixPage.categorie = '';
    const lignes = lignesAFaire(jeu, choixPage);
    const avecTaux = cats.some(c => rareteDe(c.id));

    const choix = (valeur, options, surChoix) => h('select', { onchange: e => { surChoix(e.target.value); dessiner(); } },
      options.map(([v, t]) => h('option', { value: v, selected: v === valeur }, t)));

    ajouterA(conteneur,
      h('div', { class: 'titre-page' },
        h('h1', {}, '🎯 Que faire maintenant ?'),
        h('span', { class: 'sous-titre' },
          date.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
          etat.reglages.dateSimulee ? ' (simulée)' : '', jeu.hemispheres ? ` · hémisphère ${etat.profil.hemisphere}` : '')),
      h('div', { class: 'filtres statique' },
        avecMusee ? choix(choixPage.manque, [['obtenu', 'Pas encore attrapé'], ['musee', 'Pas encore au musée']], v => { choixPage.manque = v; }) : null,
        choix(choixPage.categorie, [['', 'Toutes les créatures'], ...cats.map(c => [c.id, c.nom])], v => { choixPage.categorie = v; }),
        avecTaux ? choix(choixPage.ordre, [['faciles', 'Les plus faciles d\'abord'], ['rares', 'Les plus rares d\'abord']], v => { choixPage.ordre = v; }) : null),
      h('p', { class: 'aide' }, avecTaux
        ? 'Chance par tirage = la chance que le jeu choisisse cette espèce quand il fait apparaître une ombre ou un insecte, au meilleur endroit. « Environ N » = le nombre moyen de tirages pour tomber dessus (1 / chance).'
        : "Pas de taux d'apparition pour ce jeu : la liste montre seulement ce qui est disponible maintenant."),
    );

    if (!lignes.length) {
      conteneur.append(h('p', { class: 'note' }, choixPage.manque === 'musee'
        ? 'Tout ce qui est disponible maintenant est déjà au musée. Bravo !'
        : 'Tout ce qui est disponible maintenant est déjà attrapé. Bravo !'));
      return;
    }
    conteneur.append(h('p', { class: 'aide' }, `${lignes.length} créature${lignes.length > 1 ? 's' : ''} à chercher maintenant.`));
    conteneur.append(h('div', { class: 'liste-a-faire' }, lignes.map(l => {
      const chance = texteChance(l);
      const tirages = texteTirages(l);
      const autres = l.chance && l.chance.autres.length ? `Ailleurs : ${l.chance.autres.map(a => `${a.lieu} ${formaterPourcent(a.pourcent)}`).join(' · ')}` : null;
      const st = etatDe(l.cat.id, l.e.id);
      return h('button', { class: `ligne-a-faire${st.obtenu ? ' obtenu' : ''}`, onclick: () => ouvrirFiche(jeu, l.cat, l.e), title: 'Ouvrir la fiche' },
        image(l.e.image, '', 'vignette petite'),
        h('div', { class: 'a-faire-nom' },
          h('strong', {}, l.e.nom.fr),
          h('span', { class: 'aide' }, `${l.cat.icone || ''} ${l.e.lieu_texte || l.cat.nom}`)),
        h('div', { class: 'a-faire-chance' },
          chance ? h('span', { class: 'grand' }, chance) : texteSansChance(l),
          tirages ? h('span', { class: 'aide' }, tirages) : null,
          autres ? h('span', { class: 'aide' }, autres) : null),
        h('div', { class: 'a-faire-depart' },
          h('span', { class: l.depart && l.depart.jours <= 7 ? 'urgent' : '' }, texteDepart(l.depart)),
          l.finCreneau != null ? h('span', { class: 'aide' }, `aujourd'hui jusqu'à ${l.finCreneau} h`) : null));
    })));
  };

  dessiner();
  return surChangement(raison => {
    if (['coche', 'coches', 'heure', 'reglages', 'profil'].includes(raison)) dessiner();
  });
}
