// Navets : prédicteur de prix (New Horizons). New Leaf : même écran, désactivé (« bientôt »).
// La semaine en cours est enregistrée dans le profil (profil.navets) ; les calculs sont dans lib/navets.js.
import { h, vider, ajouterA, confirmer } from '../lib/dom.js';
import { etat, planifierSauvegarde } from '../lib/etat.js';
import { predire, normaliserNavets, MOTIFS, DEMI_JOURNEES, BASE_MIN, BASE_MAX } from '../lib/navets.js';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const pc = x => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: x < 0.1 && x > 0 ? 1 : 0 })} %`;

export function afficherNavets(conteneur, jeu) {
  vider(conteneur);
  const actif = jeu.id === 'nh';
  ajouterA(conteneur, h('div', { class: 'titre-page' },
    h('h1', {}, '🥬 Navets'),
    h('span', { class: 'sous-titre' }, actif ? 'Prédicteur de prix de la semaine' : 'Bientôt')));

  if (!actif) {
    conteneur.append(h('p', { class: 'note' }, "🚧 Bientôt : l'algorithme des navets de New Leaf n'est pas encore dans Nook Dex. L'écran sera le même que pour New Horizons."));
  }

  const profil = etat.profil;
  let n = normaliserNavets(profil.navets);
  const enregistrer = () => { profil.navets = n; planifierSauvegarde(); };
  const resultats = h('div', { class: 'navets-resultats' });

  const champPrix = (valeur, surChange, attrs = {}) => h('input', {
    type: 'number', min: '1', max: '999', step: '1', inputmode: 'numeric', value: valeur == null ? '' : String(valeur), disabled: !actif,
    oninput: e => surChange(e.target.value), ...attrs,
  });

  // ---- Saisie ----
  const achat = champPrix(n.achat, v => { n = normaliserNavets({ ...n, achat: v }); enregistrer(); dessinerResultats(); },
    { min: String(BASE_MIN), max: String(BASE_MAX), placeholder: `${BASE_MIN} à ${BASE_MAX}`, title: "Prix d'achat chez Porcelette, le dimanche matin" });
  const precedent = h('select', { disabled: !actif, onchange: e => { n = { ...n, precedent: e.target.value === '' ? null : Number(e.target.value) }; enregistrer(); dessinerResultats(); } },
    h('option', { value: '', selected: n.precedent == null }, 'Je ne sais pas'),
    MOTIFS.map(m => h('option', { value: String(m.id), selected: n.precedent === m.id }, m.nom)));
  const premier = h('input', { type: 'checkbox', checked: n.premierAchat, disabled: !actif, onchange: e => { n = { ...n, premierAchat: e.target.checked }; enregistrer(); dessinerResultats(); } });
  const cases = DEMI_JOURNEES.map((nom, i) => champPrix(n.cours[i], v => {
    const cours = [...n.cours]; cours[i] = v; n = normaliserNavets({ ...n, cours }); enregistrer(); dessinerResultats();
  }, { title: nom, 'aria-label': nom }));

  ajouterA(conteneur,
    h('div', { class: 'carte navets-saisie' },
      h('div', { class: 'navets-ligne' },
        h('label', {}, "Prix d'achat (dimanche) ", achat),
        h('label', {}, 'Motif de la semaine dernière ', precedent),
        h('label', { class: 'ligne' }, premier, ' Premier achat de navets sur mon île'),
        actif ? h('button', { class: 'bouton petit', style: { marginLeft: 'auto' }, onclick: async () => {
          if (!(await confirmer('Nouvelle semaine', "Effacer le prix d'achat et les cours de cette semaine ?", 'Effacer'))) return;
          // Le motif de la semaine qui se termine devient « la semaine dernière » s'il est sûr à 100 %.
          const p = predire(n);
          const sur = p.possible ? p.motifs.find(m => m.chance > 0.999) : null;
          n = normaliserNavets({ precedent: sur ? sur.id : null });
          enregistrer();
          afficherNavets(conteneur, jeu);
        } }, '🗓️ Nouvelle semaine') : null),
      h('table', { class: 'navets-grille' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), JOURS.map(j => h('th', {}, j)))),
        h('tbody', {},
          h('tr', {}, h('th', {}, 'Matin'), JOURS.map((_, j) => h('td', {}, cases[j * 2]))),
          h('tr', {}, h('th', {}, 'Après-midi'), JOURS.map((_, j) => h('td', {}, cases[j * 2 + 1])))))),
    resultats,
    h('p', { class: 'aide credits' },
      "Calcul d'après l'algorithme du jeu publié par Ninji (Treeki), « TurnipPrices.cpp ». ",
      'Les fourchettes de prix sont sûres ; les pourcentages des motifs sont une estimation (le jeu tire ses taux au hasard dans des intervalles).'));

  function dessinerResultats() {
    vider(resultats);
    if (!actif) return;
    const p = predire(n);
    if (!p.possible) {
      resultats.append(h('p', { class: 'note verifier' }, "⚠️ Ces cours ne correspondent à aucun motif du jeu. Vérifie la saisie : le prix d'achat de Porcelette, et le matin / l'après-midi de chaque jour (les cours changent à midi)."));
      return;
    }
    const possibles = p.motifs.filter(m => m.chance > 0).sort((a, b) => b.chance - a.chance);
    const ligne = (titre, mins, maxs, tous) => h('tr', { class: tous ? 'tous' : '' }, h('th', {}, titre), mins.map((mi, i) => {
      if (n.cours[i] != null) return h('td', { class: 'vu' }, String(n.cours[i]));
      return h('td', { class: tous && p.meilleur && p.meilleur.indice === i ? 'meilleur' : '' }, mi === maxs[i] ? String(mi) : `${mi}–${maxs[i]}`);
    }));
    ajouterA(resultats,
      h('div', { class: 'section' }, h('h2', {}, 'Motifs possibles'),
        h('div', { class: 'navets-motifs' }, possibles.map(m => h('div', { class: 'navets-motif', title: m.aide },
          h('div', { class: 'navets-motif-tete' }, h('strong', {}, m.nom), h('span', {}, pc(m.chance))),
          h('div', { class: 'barre' }, h('div', { style: { width: `${m.chance * 100}%` } })),
          h('span', { class: 'aide' }, m.aide))))),
      p.meilleur ? h('p', { class: 'aide' }, `Prix le plus haut encore possible : ${p.meilleur.max.toLocaleString('fr-FR')} clochettes (${DEMI_JOURNEES[p.meilleur.indice].toLowerCase()}).`) : null,
      h('div', { class: 'section' }, h('h2', {}, 'Fourchettes de prix'),
        h('div', { class: 'navets-cadre' }, h('table', { class: 'navets-fourchettes' },
          h('thead', {}, h('tr', {}, h('th', {}, ''), DEMI_JOURNEES.map((d, i) => h('th', { class: p.meilleur && p.meilleur.indice === i ? 'meilleur' : '' }, d)))),
          h('tbody', {},
            ligne('Tous les motifs', p.mins, p.maxs, true),
            possibles.map(m => ligne(`${m.nom} (${pc(m.chance)})`, m.mins, m.maxs, false)))))));
  }
  dessinerResultats();
  return () => {};
}
