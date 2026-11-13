// Vue « collection » : la liste d'une catégorie avec recherche, filtres, tri et cases à cocher.
import { h, vider, image, clochettes, confirmer, ajouterA } from '../lib/dom.js';
import { etat, donneesCategorie, etatDe, basculer, definirPlusieurs, maintenant, surChangement } from '../lib/etat.js';
import { filtrer, trier, progression, valeursDistinctes, estActif } from '../lib/filtres.js';
import { estDisponible, NOMS_MOIS } from '../lib/dispo.js';
import { OMBRES, TRIS, COULEURS_FLEURS } from '../lib/libelles.js';
import { ouvrirFiche } from './fiche.js';

const PAR_PAQUET = 160; // nombre de cartes affichées à la fois (les suivantes arrivent en descendant)

const FILTRES_DEFAUT = {
  texte: '', tri: 'nom', obtenu: '', musee: '', lieu: '', sous: '', ombre: '',
  mois: '', heure: '', maintenant: false, saison: '', hybride: '', aVerifier: false, nouveaute: '',
};

export async function afficherCollection(conteneur, jeu, cat) {
  vider(conteneur);
  const elements = await donneesCategorie(jeu.id, cat.id);
  const creature = cat.type === 'creature';
  if (!etat.filtres[cat.id]) etat.filtres[cat.id] = { ...FILTRES_DEFAUT, tri: creature ? 'numero' : 'nom' };
  const f = etat.filtres[cat.id];

  const entete = h('div', { class: 'titre-page' });
  const barreFiltres = h('div', { class: 'filtres' });
  const resume = h('div', { class: 'resultats' });
  const grille = h('div', { class: 'grille' });
  const plus = h('div');
  conteneur.append(entete, barreFiltres, resume, grille, plus);

  const cartes = new Map(); // id -> carte affichée
  // Groupes de fossiles en plusieurs parties (crâne, torse, queue…).
  const comptesGroupes = new Map();
  for (const e of elements) if (e.groupe) comptesGroupes.set(e.groupe.id, (comptesGroupes.get(e.groupe.id) || 0) + 1);
  const groupesMultiples = new Set([...comptesGroupes].filter(([, n]) => n > 1).map(([id]) => id));
  let liste = [];
  let affiches = 0;

  // ---------- En-tête : titre + progression ----------
  function majEntete() {
    const p = progression(elements, etat.profil, cat.id);
    ajouterA(vider(entete), 
      h('h1', {}, `${cat.icone} ${cat.nom}`),
      h('span', { class: 'sous-titre' },
        `${p.obtenus} / ${p.total} obtenus`,
        cat.musee ? ` · ${p.musee} / ${p.totalMusee} au musée` : ''),
    );
  }

  // ---------- Barre de filtres ----------
  const choix = (valeur, options, surChoix, titre) => h('select', { title: titre, onchange: e => surChoix(e.target.value) },
    options.map(([v, t]) => h('option', { value: v, selected: String(v) === String(valeur) }, t)));
  const interrupteur = (texte, actif, surChoix, titre) => {
    const l = h('label', { class: `interrupteur${actif ? ' actif' : ''}`, title: titre || '' },
      h('input', { type: 'checkbox', checked: actif, onchange: e => { l.classList.toggle('actif', e.target.checked); surChoix(e.target.checked); } }), texte);
    return l;
  };
  const changer = (champ, valeur) => { f[champ] = valeur; rafraichir(); };

  function construireFiltres() {
    const recherche = h('input', {
      id: 'recherche', class: 'champ-recherche', type: 'search', placeholder: 'Rechercher (nom français ou anglais)…', value: f.texte,
      oninput: e => { f.texte = e.target.value; rafraichirBientot(); },
    });
    const zone = [recherche];
    const tris = TRIS.filter(([v]) => v !== 'numero' || creature).concat(elements.some(e => e.groupe) ? [['groupe', 'Groupe']] : []);
    zone.push(choix(f.tri, tris, v => changer('tri', v), 'Trier'));
    zone.push(choix(f.obtenu, [['', 'Obtenus et manquants'], ['oui', 'Obtenus'], ['non', 'Pas encore obtenus']], v => changer('obtenu', v), 'Obtenus'));
    if (cat.musee) zone.push(choix(f.musee, [['', 'Musée : tous'], ['oui', 'Donnés au musée'], ['non', 'Pas encore donnés']], v => changer('musee', v), 'Musée'));

    // Sous-catégories (ou groupes de fossiles en plusieurs parties).
    const sous = valeursDistinctes(elements, e => (e.groupe && groupesMultiples.has(e.groupe.id) ? e.groupe.fr : e.sous));
    if (sous.length > 1) zone.push(choix(f.sous, [['', cat.type === 'fossile' ? 'Tous les fossiles' : 'Toutes les sous-catégories'], ...sous.map(s => [s, s])], v => changer('sous', v), 'Sous-catégorie'));

    if (creature) {
      const lieux = valeursDistinctes(elements, e => e.lieu_texte);
      if (lieux.length > 1) zone.push(choix(f.lieu, [['', 'Tous les lieux'], ...lieux.map(l => [l, l])], v => changer('lieu', v), 'Lieu'));
      const ombres = valeursDistinctes(elements, e => e.ombre);
      if (ombres.length > 1) zone.push(choix(f.ombre, [['', 'Toutes les ombres'], ...Object.keys(OMBRES).filter(o => ombres.includes(o)).map(o => [o, `Ombre : ${OMBRES[o]}`])], v => changer('ombre', v), "Taille de l'ombre"));
      zone.push(choix(f.mois, [['', 'Tous les mois'], ...NOMS_MOIS.map((m, i) => [String(i + 1), `En ${m}`])], v => changer('mois', v), 'Disponible ce mois-là'));
      zone.push(choix(f.heure, [['', 'Toutes les heures'], ...Array.from({ length: 24 }, (_, i) => [String(i), `À ${i} h`])], v => changer('heure', v), 'Disponible à cette heure-là (pendant le mois choisi, ou le mois en cours)'));
      zone.push(choix(f.saison, [['', 'Toute la saison'], ['part', 'Part à la fin du mois'], ['arrive', 'Arrive ce mois-ci']], v => changer('saison', v), 'Saison'));
      zone.push(interrupteur('⏰ Disponible maintenant', f.maintenant, v => changer('maintenant', v), "Selon la date et l'heure affichées en haut"));
    }
    if (cat.type === 'fleur') zone.push(choix(f.hybride, [['', 'Toutes les fleurs'], ['oui', 'Hybrides'], ['non', 'De base']], v => changer('hybride', v), 'Hybrides'));
    if (elements.some(e => e.v && e.v.startsWith('3.'))) zone.push(interrupteur('✨ Ajouts 3.0', f.nouveaute === '3.', v => changer('nouveaute', v ? '3.' : ''), 'Objets ajoutés par la mise à jour 3.0'));
    if (elements.some(e => e.a_verifier)) zone.push(interrupteur('⚠️ À vérifier', f.aVerifier, v => changer('aVerifier', v), 'Éléments dont une information est incertaine'));
    zone.push(h('button', { class: 'bouton petit', title: 'Remettre tous les filtres à zéro', onclick: () => { Object.assign(f, FILTRES_DEFAUT, { tri: f.tri }); construireFiltres(); rafraichir(); } }, 'Réinitialiser'));
    vider(barreFiltres).append(...zone);
  }

  // ---------- Cartes ----------
  function infosCarte(e) {
    if (creature) {
      const morceaux = [e.lieu_texte];
      if (e.ombre) morceaux.push(`ombre ${e.ombre === '5-aileron' ? '5 + aileron' : e.ombre}`);
      return morceaux.filter(Boolean).join(' · ');
    }
    if (cat.type === 'fleur') return [COULEURS_FLEURS[e.couleur], e.hybride ? 'hybride' : null].filter(Boolean).join(' · ');
    if (e.groupe && groupesMultiples.has(e.groupe.id)) return e.groupe.fr;
    if (e.sous) return e.sous;
    return e.prix && e.prix.vente != null ? clochettes(e.prix.vente) : '';
  }

  function creerCarte(e) {
    // Un clic sur la carte coche / décoche « obtenu » ; le bouton ⓘ ouvre la fiche.
    const carte = h('div', {
      class: 'element', tabindex: '0', dataset: { id: e.id }, role: 'button',
      title: creature ? 'Cliquer pour cocher « attrapé »' : 'Cliquer pour cocher « obtenu »',
      onclick: () => basculer(cat.id, e.id, 'obtenu'),
      onkeydown: ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); basculer(cat.id, e.id, 'obtenu'); }
        if (ev.key === 'i') ouvrirFiche(jeu, cat, e);
      },
    });
    majCarte(carte, e);
    return carte;
  }

  function majCarte(carte, e) {
    const st = etatDe(cat.id, e.id);
    carte.classList.toggle('obtenu', !!st.obtenu);
    majDispo(carte, e, st);
    const coche = (champ, texte, titre) => h('button', {
      class: `coche ${champ}${st[champ] ? ' oui' : ''}`, title: titre,
      onclick: ev => { ev.stopPropagation(); basculer(cat.id, e.id, champ); },
    }, texte);
    const badges = [];
    if (e.a_verifier) badges.push(h('span', { class: 'badge verifier', title: 'Une information est incertaine' }, 'à vérifier'));
    if (e.ext) badges.push(h('span', { class: 'badge ext' }, e.ext === 'hhp' ? 'HHP' : e.ext === 'wa' ? 'amiibo' : e.ext));
    if (e.v && e.v.startsWith('3.')) badges.push(h('span', { class: 'badge nouveau' }, '3.0'));
    ajouterA(vider(carte), 
      st.obtenu ? h('span', { class: 'marque-obtenu', title: creature ? 'Attrapé' : 'Obtenu' }, '✓') : null,
      e.n != null ? h('span', { class: 'numero' }, `n° ${e.n}`) : null,
      h('button', { class: 'bouton-info', title: 'Voir les informations', onclick: ev => { ev.stopPropagation(); ouvrirFiche(jeu, cat, e); } }, 'i'),
      image(e.image, ''),
      h('div', { class: 'nom' }, e.nom.fr),
      e.nom.en.toLowerCase() !== e.nom.fr.toLowerCase() ? h('div', { class: 'nom-en' }, e.nom.en) : null,
      h('div', { class: 'infos' }, infosCarte(e)),
      badges.length ? h('div', { class: 'badges' }, badges) : null,
      cat.musee ? h('div', { class: 'coches' }, coche('musee', st.musee ? '🏛 Au musée' : '🏛 Musée', 'Donné au musée')) : null,
    );
  }

  function majDispo(carte, e, st = etatDe(cat.id, e.id)) {
    carte.classList.toggle('dispo-maintenant', creature && !st.obtenu && estDisponible(e, etat.profil.hemisphere, maintenant()) === true);
  }

  // ---------- Affichage par paquets (pour rester fluide avec des milliers de meubles) ----------
  const observateur = new IntersectionObserver(entrees => {
    if (entrees.some(en => en.isIntersecting)) afficherPaquet();
  }, { root: conteneur, rootMargin: '600px' });

  function afficherPaquet() {
    const fin = Math.min(affiches + PAR_PAQUET, liste.length);
    const frag = document.createDocumentFragment();
    for (let i = affiches; i < fin; i++) {
      const c = creerCarte(liste[i]);
      cartes.set(liste[i].id, c);
      frag.append(c);
    }
    grille.append(frag);
    affiches = fin;
    observateur.disconnect();
    vider(plus);
    if (affiches < liste.length) {
      const suite = h('button', { class: 'bouton charger-plus', onclick: afficherPaquet }, `Afficher la suite (${liste.length - affiches} restants)`);
      plus.append(suite);
      observateur.observe(suite);
    }
  }

  function rafraichir() {
    liste = trier(filtrer(elements, f, { profil: etat.profil, categorie: cat.id, maintenant: maintenant() }), f.tri);
    cartes.clear();
    vider(grille);
    affiches = 0;
    const actifs = elements.filter(e => estActif(e, etat.profil.extensions)).length;
    vider(resume).append(`${liste.length} élément${liste.length > 1 ? 's' : ''} affiché${liste.length > 1 ? 's' : ''} sur ${actifs}`);
    if (liste.length) {
      resume.append(' · ',
        h('button', { class: 'bouton petit', title: 'Cocher « obtenu » pour tous les éléments affichés', onclick: () => toutCocher(true) }, 'Tout cocher'), ' ',
        h('button', { class: 'bouton petit', title: 'Décocher tous les éléments affichés', onclick: () => toutCocher(false) }, 'Tout décocher'));
    } else {
      grille.append(h('div', { class: 'vide', style: { gridColumn: '1 / -1' } }, h('span', { class: 'grand' }, '🍂'), 'Aucun élément ne correspond à ces filtres.'));
    }
    afficherPaquet();
    majEntete();
  }

  async function toutCocher(valeur) {
    const n = liste.length;
    const ok = await confirmer(valeur ? 'Tout cocher' : 'Tout décocher',
      `${valeur ? 'Marquer' : 'Retirer'} « obtenu » pour ${n > 1 ? `les ${n} éléments affichés` : "l'élément affiché"} ?`,
      valeur ? 'Tout cocher' : 'Tout décocher', !valeur);
    if (ok) definirPlusieurs(cat.id, liste.map(e => e.id), 'obtenu', valeur);
  }

  let attente = null;
  const rafraichirBientot = () => { clearTimeout(attente); attente = setTimeout(rafraichir, 150); };

  const desabonner = surChangement((raison, detail) => {
    if (raison === 'coche' && detail.categorie === cat.id) {
      const e = elements.find(x => x.id === detail.id);
      const c = cartes.get(detail.id);
      if (e && c) majCarte(c, e);
      majEntete();
    } else if (raison === 'coches' || raison === 'profil' || raison === 'reglages') {
      rafraichir();
    } else if (raison === 'heure' && creature) {
      // L'heure a changé : on met à jour la liste si elle dépend de l'heure, sinon juste les pastilles « Dispo ».
      if (f.maintenant || f.saison || (f.heure !== '' && !f.mois)) rafraichir();
      else for (const [id, c] of cartes) majDispo(c, elements.find(x => x.id === id));
    }
  });

  construireFiltres();
  rafraichir();
  return () => { desabonner(); observateur.disconnect(); };
}
