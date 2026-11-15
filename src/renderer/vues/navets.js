// Navets : prédicteur de prix de la semaine.
//   New Horizons : algorithme publié par Ninji (lib/navets.js), 12 demi-journées.
//   GameCube : code du jeu décompilé par ac-decomp (lib/navets-gc.js), un prix par jour.
//   New Leaf, City Folk, Wild World : même écran, désactivé (« bientôt »), en attendant un algorithme sûr.
// La semaine en cours est enregistrée dans le profil (profil.navets).
import { h, vider, ajouterA, confirmer } from '../lib/dom.js';
import { etat, planifierSauvegarde } from '../lib/etat.js';
import { predire, normaliserNavets, MOTIFS, DEMI_JOURNEES, BASE_MIN, BASE_MAX } from '../lib/navets.js';
import { predireGC, MOTIFS_GC, JOURS_GC, ACHAT_MIN_GC, ACHAT_MAX_GC } from '../lib/navets-gc.js';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const pc = x => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: x < 0.1 && x > 0 ? 1 : 0 })} %`;

// Réglages de chaque jeu.
const DEMI = { cours: 12, colonnes: DEMI_JOURNEES, lignes: ['Matin', 'Après-midi'], min: BASE_MIN, max: BASE_MAX, motifs: MOTIFS, vendeur: 'Porcelette' };
export const JEUX = {
  nh: { ...DEMI, actif: true, predire, premierAchat: true,
    credit: "Calcul d'après l'algorithme du jeu publié par Ninji (Treeki), « TurnipPrices.cpp ». Les fourchettes de prix sont sûres ; les pourcentages des motifs sont une estimation (le jeu tire ses taux au hasard dans des intervalles)." },
  gc: { actif: true, cours: 6, colonnes: JOURS_GC, lignes: ['Prix du jour'], min: ACHAT_MIN_GC, max: ACHAT_MAX_GC, motifs: MOTIFS_GC, vendeur: 'Jeanne', predire: predireGC, premierAchat: false,
    credit: "Calcul d'après le code du jeu décompilé par le projet ac-decomp (m_kabu_manager.c, licence CC0). Les motifs « pic » et « aléatoire » sont calculés exactement ; le motif « baisse » par fourchettes." },
  nl: { ...DEMI, actif: false, vendeur: 'Porcelette' },
  cf: { ...DEMI, actif: false, vendeur: 'Jeanne' },
  ww: { ...DEMI, actif: false, vendeur: 'Jeanne' },
};

export function afficherNavets(conteneur, jeu) {
  vider(conteneur);
  const cfg = JEUX[jeu.id];
  const actif = cfg.actif;
  ajouterA(conteneur, h('div', { class: 'titre-page' },
    h('h1', {}, '🥬 Navets'),
    h('span', { class: 'sous-titre' }, actif ? 'Prédicteur de prix de la semaine' : 'Bientôt')));
  if (!actif) {
    conteneur.append(h('p', { class: 'note' }, `🚧 Bientôt : l'algorithme des navets de ${jeu.nom} n'est pas encore dans Nook Dex (aucun chiffre n'est inventé en attendant).`));
  }

  const profil = etat.profil;
  const normaliser = x => normaliserNavets(x, { cours: cfg.cours, min: cfg.min, max: cfg.max, motifs: cfg.motifs.length });
  let n = normaliser(profil.navets);
  const enregistrer = () => { profil.navets = n; planifierSauvegarde(); };
  const resultats = h('div', { class: 'navets-resultats' });

  const champPrix = (valeur, surChange, attrs = {}) => h('input', {
    type: 'number', min: '1', max: '9999', step: '1', inputmode: 'numeric', value: valeur == null ? '' : String(valeur), disabled: !actif,
    oninput: e => surChange(e.target.value), ...attrs,
  });

  // ---- Saisie ----
  const achat = champPrix(n.achat, v => { n = normaliser({ ...n, achat: v }); enregistrer(); dessinerResultats(); },
    { min: String(cfg.min), max: String(cfg.max), placeholder: `${cfg.min} à ${cfg.max}`, title: `Prix d'achat chez ${cfg.vendeur}, le dimanche` });
  const precedent = h('select', { disabled: !actif, onchange: e => { n = { ...n, precedent: e.target.value === '' ? null : Number(e.target.value) }; enregistrer(); dessinerResultats(); } },
    h('option', { value: '', selected: n.precedent == null }, 'Je ne sais pas'),
    cfg.motifs.map(m => h('option', { value: String(m.id), selected: n.precedent === m.id }, m.nom)));
  const premier = cfg.premierAchat
    ? h('input', { type: 'checkbox', checked: n.premierAchat, disabled: !actif, onchange: e => { n = { ...n, premierAchat: e.target.checked }; enregistrer(); dessinerResultats(); } })
    : null;
  const cases = cfg.colonnes.map((nom, i) => champPrix(n.cours[i], v => {
    const cours = [...n.cours]; cours[i] = v; n = normaliser({ ...n, cours }); enregistrer(); dessinerResultats();
  }, { title: nom, 'aria-label': nom }));
  const parLigne = cfg.lignes.length;

  ajouterA(conteneur,
    h('div', { class: 'carte navets-saisie' },
      h('div', { class: 'navets-ligne' },
        h('label', {}, "Prix d'achat (dimanche) ", achat),
        h('label', {}, 'Motif de la semaine dernière ', precedent),
        premier ? h('label', { class: 'ligne' }, premier, ' Premier achat de navets sur mon île') : null,
        actif ? h('button', { class: 'bouton petit', style: { marginLeft: 'auto' }, onclick: async () => {
          if (!(await confirmer('Nouvelle semaine', "Effacer le prix d'achat et les cours de cette semaine ?", 'Effacer'))) return;
          // Le motif de la semaine qui se termine devient « la semaine dernière » s'il est sûr à 100 %.
          const p = cfg.predire(n);
          const sur = p.possible ? p.motifs.find(m => m.chance > 0.999) : null;
          n = normaliser({ precedent: sur ? sur.id : null });
          enregistrer();
          afficherNavets(conteneur, jeu);
        } }, '🗓️ Nouvelle semaine') : null),
      h('table', { class: 'navets-grille' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), JOURS.map(j => h('th', {}, j)))),
        h('tbody', {}, cfg.lignes.map((ligne, l) => h('tr', {}, h('th', {}, ligne), JOURS.map((_, j) => h('td', {}, cases[j * parLigne + l]))))))),
    resultats,
    cfg.credit ? h('p', { class: 'aide credits' }, cfg.credit) : null);

  function dessinerResultats() {
    vider(resultats);
    if (!actif) return;
    const p = cfg.predire(n);
    if (!p.possible) {
      resultats.append(h('p', { class: 'note verifier' }, `⚠️ Ces cours ne correspondent à aucun motif du jeu. Vérifie la saisie (le prix d'achat de ${cfg.vendeur}${parLigne > 1 ? ', et le matin / l\'après-midi de chaque jour' : ''}).`));
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
      p.meilleur ? h('p', { class: 'aide' }, `Prix le plus haut encore possible : ${p.meilleur.max.toLocaleString('fr-FR')} clochettes (${cfg.colonnes[p.meilleur.indice].toLowerCase()}).`) : null,
      h('div', { class: 'section' }, h('h2', {}, 'Fourchettes de prix'),
        h('div', { class: 'navets-cadre' }, h('table', { class: 'navets-fourchettes' },
          h('thead', {}, h('tr', {}, h('th', {}, ''), cfg.colonnes.map((d, i) => h('th', { class: p.meilleur && p.meilleur.indice === i ? 'meilleur' : '' }, d)))),
          h('tbody', {},
            ligne('Tous les motifs', p.mins, p.maxs, true),
            possibles.map(m => ligne(`${m.nom} (${pc(m.chance)})`, m.mins, m.maxs, false)))))));
  }
  dessinerResultats();
  return () => {};
}
