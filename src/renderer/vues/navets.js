// Navets : prédicteur de prix de la semaine.
//   New Horizons : algorithme publié par Ninji (lib/navets.js), 12 demi-journées.
//   GameCube : code du jeu décompilé par ac-decomp (lib/navets-gc.js), un prix par jour.
//   Wild World : code du jeu décompilé par acww-decomp (lib/navets-ww.js), 12 demi-journées, calcul exact.
//   New Leaf : le même calcul que New Horizons (vérifié sur trois vraies semaines).
//   City Folk : code du jeu (main.dol, lib/navets-cf.js), même moteur que New Horizons avec d'autres taux.
// GameCube, Wild World, City Folk et New Leaf : la sauvegarde contient déjà les prix de la semaine (bouton « Prix de ma sauvegarde »).
// La semaine en cours est enregistrée dans le profil (profil.navets).
import { h, vider, ajouterA, confirmer, notifier, ouvrirFenetre } from '../lib/dom.js';
import { etat, planifierSauvegarde, maintenant } from '../lib/etat.js';
import { navetsNL } from '../lib/sauvegarde-nl.js';
import { navetsWW } from '../lib/sauvegarde-ww.js';
import { navetsGC } from '../lib/sauvegarde-gc.js';
import { navetsCF } from '../lib/sauvegarde-cf.js';
import { navetsNH } from '../lib/sauvegarde-nh.js';
import { predire, normaliserNavets, MOTIFS, DEMI_JOURNEES, BASE_MIN, BASE_MAX } from '../lib/navets.js';
import { predireGC, MOTIFS_GC, JOURS_GC, ACHAT_MIN_GC, ACHAT_MAX_GC } from '../lib/navets-gc.js';
import { predireWW, ACHAT_MIN_WW, ACHAT_MAX_WW } from '../lib/navets-ww.js';
import { predireCF } from '../lib/navets-cf.js';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const pc = x => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: x < 0.1 && x > 0 ? 1 : 0 })} %`;

// Réglages de chaque jeu.
const DEMI = { cours: 12, colonnes: DEMI_JOURNEES, lignes: ['Matin', 'Après-midi'], min: BASE_MIN, max: BASE_MAX, motifs: MOTIFS, vendeur: 'Porcelette' };
export const JEUX = {
  nh: { ...DEMI, actif: true, predire, premierAchat: true,
    lecture: { titre: 'Choisir le dossier de ma sauvegarde New Horizons', dossier: true, lire: navetsNH },
    credit: "Calcul d'après l'algorithme du jeu publié par Ninji (Treeki), « TurnipPrices.cpp ». Les fourchettes de prix sont sûres ; les pourcentages des motifs sont une estimation (le jeu tire ses taux au hasard dans des intervalles)." },
  gc: { actif: true, cours: 6, colonnes: JOURS_GC, lignes: ['Prix du jour'], min: ACHAT_MIN_GC, max: ACHAT_MAX_GC, motifs: MOTIFS_GC, vendeur: 'Porcella', predire: predireGC, premierAchat: false,
    lecture: { titre: 'Ouvrir ma sauvegarde Animal Crossing (GameCube)', jeu: 'gc', lire: navetsGC },
    credit: "Calcul d'après le code du jeu décompilé par le projet ac-decomp (m_kabu_manager.c, licence CC0). Les motifs « pic » et « aléatoire » sont calculés exactement ; le motif « baisse » par fourchettes." },
  nl: { ...DEMI, actif: true, predire, premierAchat: false, vendeur: 'Porcella',
    lecture: { titre: 'Ouvrir ma sauvegarde New Leaf (garden_plus.dat)', jeu: 'nl', lire: navetsNL },
    credit: "New Leaf utilise le même calcul que New Horizons (algorithme publié par Ninji) : trois vraies semaines lues dans des sauvegardes suivent exactement ses motifs (gros pic, fluctuant, décroissant). À vérifier sur d'autres semaines ; les pourcentages des motifs sont une estimation." },
  cf: { ...DEMI, actif: true, predire: predireCF, premierAchat: false, vendeur: 'Porcella',
    lecture: { titre: 'Ouvrir ma sauvegarde City Folk (RVFOREST.DAT)', jeu: 'cf', lire: navetsCF },
    credit: "Calcul d'après le code du jeu (main.dol) : les mêmes motifs que New Horizons, avec d'autres taux (baisse depuis 75-80 % du prix d'achat, pic entre le mardi après-midi et le jeudi après-midi). Les fourchettes de prix sont sûres ; les pourcentages des motifs sont une estimation." },
  ww: { ...DEMI, actif: true, min: ACHAT_MIN_WW, max: ACHAT_MAX_WW, predire: predireWW, premierAchat: false, vendeur: 'Porcella',
    lecture: { titre: 'Ouvrir ma sauvegarde Wild World (.sav ou .dsv)', jeu: 'ww', lire: navetsWW },
    credit: "Calcul d'après le code du jeu décompilé par le projet acww-decomp (turnip_prices.c, licence CC0) : les fourchettes ET les pourcentages des motifs sont exacts (chaque prix est tiré séparément)." },
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
        cfg.lecture ? h('button', { class: 'bouton petit', style: { marginLeft: 'auto' }, onclick: () => prixSauvegarde() }, '📥 Prix de ma sauvegarde…') : null,
        actif ? h('button', { class: 'bouton petit', style: cfg.lecture ? {} : { marginLeft: 'auto' }, onclick: async () => {
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

  // GameCube, Wild World, City Folk, New Leaf : la sauvegarde contient déjà le prix d'achat et les cours de la semaine
  // (et, selon le jeu, la date du tirage et le motif de la semaine).
  async function prixSauvegarde() {
    let fichier, s;
    try {
      fichier = cfg.lecture.dossier ? await window.nook.lireDossierNH(cfg.lecture.titre) : await window.nook.lireSauvegarde(cfg.lecture.titre, cfg.lecture.jeu);
      if (!fichier) return;
      s = await cfg.lecture.lire(fichier.octets);
    } catch (e) { notifier(`Lecture impossible : ${e.message}`, 'erreur'); return; }
    if (s.achat == null || s.cours.length !== cfg.cours || s.cours.some(c => c == null)) {
      notifier("Les prix des navets de cette sauvegarde sont illisibles (ou pas encore tirés : ouvre le jeu un dimanche, puis sauvegarde).", 'erreur');
      return;
    }
    // Cours déjà passés selon la date de Nook Dex (le dimanche, aucun) : un par jour au GameCube,
    // sinon un par demi-journée (le prix change à midi).
    const d = maintenant();
    const passes = d.getDay() === 0 ? 0 : cfg.cours === 6 ? d.getDay() : (d.getDay() - 1) * 2 + (d.getHours() >= 12 ? 2 : 1);
    const motif = Number.isInteger(s.motif) ? cfg.motifs.find(m => m.id === s.motif) : null;
    const date = s.semaine ? `${String(s.semaine.jour).padStart(2, '0')}/${String(s.semaine.mois).padStart(2, '0')}/${s.semaine.annee}` : null;
    let fermer;
    const remplir = nb => {
      n = normaliser({ ...n, achat: s.achat, cours: s.cours.map((c, i) => (i < nb ? c : null)) });
      enregistrer(); fermer();
      notifier(nb ? `Prix de la sauvegarde ajoutés (${nb} cours).` : "Prix d'achat de la sauvegarde ajouté.");
      afficherNavets(conteneur, jeu);
    };
    fermer = ouvrirFenetre('Prix de ma sauvegarde', [
      h('p', {}, `Fichier « ${fichier.nom} » : prix d'achat ${s.achat} clochettes. Ta sauvegarde contient déjà les prix de toute la semaine, du lundi au samedi : le jeu les choisit dès le dimanche.`),
      date || motif ? h('p', {}, [date ? `Semaine tirée le ${date}.` : '', motif ? [' Motif de cette semaine (lu dans le jeu) : ', h('strong', {}, motif.nom), '.'] : '']) : null,
      h('p', { class: 'aide' }, "Ce sont les prix de la semaine où la sauvegarde a été faite. Si elle date d'une autre semaine, ils ne valent pas pour ta semaine actuelle. Nook Dex ne modifie pas ta sauvegarde."),
      h('div', { class: 'actions' },
        h('button', { class: 'bouton', onclick: () => fermer() }, 'Annuler'),
        h('button', { class: 'bouton', onclick: () => remplir(passes) }, passes ? `Remplir jusqu'à maintenant (${passes} cours)` : "Seulement le prix d'achat"),
        h('button', { class: 'bouton principal', onclick: () => remplir(cfg.cours) }, 'Voir toute la semaine')),
    ]);
  }

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
