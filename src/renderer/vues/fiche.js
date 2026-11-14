// Fiche détaillée d'un élément (panneau qui glisse depuis la droite).
import { h, vider, image, clochettes, ajouterA } from '../lib/dom.js';
import { etat, etatDe, basculer, maintenant, surChangement, rareteDe, seuilsEtoiles, codeDe } from '../lib/etat.js';
import { periodes, moisDisponibles, heuresDuMois, formaterMois, formaterHeures, MOIS_COURTS, NOMS_MOIS, estDisponible, partBientot, arriveCeMois, partieDuMois } from '../lib/dispo.js';
import { maxAnnee, tauxMaintenant, etoilesPour, texteEtoiles, grilleEspece, formaterPourcent, pluieDuMois, texteRangVille } from '../lib/rarete.js';
import { OMBRES, VITESSES, texteCondition, CHAMPS_A_VERIFIER, COULEURS_FLEURS } from '../lib/libelles.js';
import { decoder, creer, formaterCode, nomVersOctets, erreurNom, NOMS_TYPES_CODE } from '../lib/motdepasse-gc.js';

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

// ---------- Rareté (taux d'apparition tirés du code du jeu) ----------
// « un poisson », « aucun insecte », « une créature marine » : nom avec ses articles.
const NOMS_CREATURES = { insectes: ['un insecte', 'aucun insecte'], poissons: ['un poisson', 'aucun poisson'], 'creatures-marines': ['une créature marine', 'aucune créature marine'] };
const nomCreature = (cat, aucun = false) => (NOMS_CREATURES[cat.id] || ['une créature', 'aucune créature'])[aucun ? 1 : 0];

// Valeurs (hors cases vides) du tableau mois × créneau d'une espèce.
const grilleValeurs = (cr, id) => grilleEspece(cr, id).lignes.flatMap(l => l.cases.filter(Boolean).map(c => c.pourcent));

function sectionRarete(cat, e) {
  const titre = h('h3', {}, 'Rareté');
  const cr = rareteDe(cat.id);
  if (!cr) return [titre, h('p', { class: 'note' }, "❔ Rareté inconnue : pas encore de taux d'apparition pour ce jeu.")];
  const m = maxAnnee(cr, e.id);
  if (!m) {
    // Raison donnée par data/rarete/regles.json (île de Tortimer, autre mécanisme), sinon le texte général.
    const raison = cr.sans_taux && cr.sans_taux[e.id];
    return [titre, h('p', { class: 'note' }, raison
      ? `❔ Rareté inconnue (île / autre mécanisme) : ${raison}`
      : "❔ Rareté inconnue : cette espèce n'est pas dans les tables d'apparition au hasard du jeu (elle apparaît d'une autre façon).")];
  }

  const fmt = formaterPourcent;
  const note = etoilesPour(m.note, seuilsEtoiles());
  const texteRang = texteRangVille(cr, e.id);
  const bulle = () => (texteRang ? h('span', { class: 'info-bulle', title: texteRang, tabindex: '0', 'aria-label': texteRang }, 'ⓘ') : null);
  const date = maintenant();
  const t = tauxMaintenant(cr, e.id, date);
  // Espèce qui n'apparaît que s'il pleut (cœlacanthe GC) : taux du mois en cours, même hors créneau.
  const pluieSeule = pluieDuMois(cr, e.id, date.getMonth() + 1, date.getDate());
  const condPluie = pluieSeule ? `seulement s'il pleut${pluieSeule.sauf_creneaux.length ? `, hors ${pluieSeule.sauf_creneaux.join(', ')}` : ''}` : '';
  const quand = date.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  // Espèce dans les tables normales, mais que le jeu ne fait apparaître que par un certain temps (cœlacanthe : pluie ou neige).
  const meteo = cr.meteo_seulement && cr.meteo_seulement[e.id];

  // Valeur du moment
  const morceaux = [];
  if (t.pourcent > 0) morceaux.push(meteo ? `${fmt(t.pourcent)} 🌧❄️` : fmt(t.pourcent));
  if (pluieSeule) { if (pluieSeule.pourcent) morceaux.push(`${fmt(pluieSeule.pourcent)} 🌧`); }
  else if (t.pluie) morceaux.push(`${fmt(t.pluie)} s'il pleut 🌧`);
  const valeur = morceaux.length ? morceaux.join(' · ') : '0 %';
  const details = t.details.filter(d => d.eau_texte).map(d => `${d.eau_texte} : ${fmt(d.pourcent)}${d.pluie ? " s'il pleut" : ''}`);

  const blocs = [titre,
    h('div', { class: 'rarete-note', title: pluieSeule
      ? `Calculée sur le pourcentage moyen des mois où l'espèce est présente, s'il pleut (seuils dans data/rarete/etoiles.json)`
      : `Calculée sur le pourcentage le plus haut de l'année (seuils dans data/rarete/etoiles.json)` },
      h('span', { class: 'etoiles' }, texteEtoiles(note.etoiles)), ' ', h('strong', {}, note.nom, pluieSeule ? ' sous la pluie' : meteo ? ` (${meteo})` : ''),
      h('span', { class: 'aide' }, pluieSeule
        ? ` · en moyenne ${fmt(m.moyenne)}, ${condPluie} (de ${fmt(Math.min(...grilleValeurs(cr, e.id)))} à ${fmt(m.max)} selon le mois)`
        : ` · au plus ${fmt(m.max)} dans l'année${m.pluie ? " (s'il pleut)" : ''}`), ' ', bulle()),
  ];
  if (cr.a_verifier && cr.a_verifier[e.id]) blocs.push(h('div', { class: 'note verifier' }, '⚠️ À vérifier : ', cr.a_verifier[e.id]));
  if (meteo) blocs.push(h('div', { class: 'note' }, `🌧❄️ Seulement ${meteo} : les pourcentages ci-dessous ne valent que ces jours-là. Par beau temps, il n'apparaît pas (0 %).`));

  blocs.push(h('div', { class: 'rarete-maintenant' },
    h('span', { class: `grand-pourcent${morceaux.length ? '' : ' absent'}` }, valeur), ' ',
    h('span', { class: 'aide' }, pluieSeule
      ? `ce mois-ci, ${condPluie} (${quand}, créneau ${t.creneau || '?'})`
      : `maintenant (${quand}, créneau ${t.creneau || '?'})`), ' ', bulle()));
  if (pluieSeule && pluieSeule.pourcent && !t.pluie) blocs.push(h('p', { class: 'aide' }, `Pas à ce créneau-ci : jamais entre ${pluieSeule.sauf_creneaux.join(', ')}.`));
  if (!morceaux.length) blocs.push(h('p', { class: 'aide' }, `Absent des tables du jeu à ce moment-là.`));
  if (details.length) blocs.push(h('p', { class: 'aide' }, details.join(' · ')));
  if (t.connecte != null && t.connecte !== t.pourcent) {
    blocs.push(h('p', { class: 'aide' }, `🌐 Connecté à une autre ville : ${t.connecte > 0 ? fmt(t.connecte) : 'impossible'} (le jeu tire sur 95 au lieu de 100).`));
  }
  if (t.rien != null && cat.id === 'insectes') {
    blocs.push(h('p', { class: 'aide' }, `À ce créneau, ${fmt(t.rien)} de chance qu'${nomCreature(cat, true)} n'apparaisse.`));
  }
  if (t.transition) {
    const tr = t.transition;
    const valeurDe = x => [x.pourcent > 0 ? fmt(x.pourcent) : null, x.pluie ? `${fmt(x.pluie)} s'il pleut` : null].filter(Boolean).join(' · ') || '0 %';
    const jourFr = j => (j === 1 ? '1er' : j);
    const fenetre = tr.du.mois === tr.au.mois
      ? `du ${jourFr(tr.du.jour)} au ${tr.au.jour} ${NOMS_MOIS[tr.au.mois - 1]}`
      : `du ${jourFr(tr.du.jour)} ${NOMS_MOIS[tr.du.mois - 1]} au ${tr.au.jour} ${NOMS_MOIS[tr.au.mois - 1]}`;
    const autreTable = tr.type === 'mois'
      ? `Table de ${NOMS_MOIS[tr.mois - 1]} (mois ${tr.sens === 'suivant' ? 'suivant' : 'précédent'})`
      : `Table de la ${tr.quinzaine === 2 ? '2e' : '1re'} quinzaine`;
    const tableActuelle = tr.type === 'mois'
      ? `Table de ${NOMS_MOIS[date.getMonth()]} (mois en cours)`
      : `Table de la ${tr.quinzaine === 2 ? '1re' : '2e'} quinzaine (en cours)`;
    const decalage = (cr.transition && cr.transition.decalage_max) || 0;
    blocs.push(h('div', { class: 'note' },
      h('strong', {}, '🔄 Transition possible'), ` (${fenetre}) : le jeu change de table avec un décalage de 0 à ${decalage} jours, tiré au hasard pour chaque sauvegarde. `,
      "Impossible de savoir laquelle sert aujourd'hui :",
      h('ul', { class: 'liste-conditions' },
        h('li', {}, `• ${tableActuelle} : ${valeurDe(t)}`),
        h('li', {}, `• ${autreTable} : ${valeurDe(tr)}`))));
  }

  // Tableau mois × créneau
  const g = grilleEspece(cr, e.id);
  const mois = date.getMonth() + 1;
  const jour = date.getDate();
  blocs.push(h('div', { class: 'grille-rarete-cadre' }, h('table', { class: 'grille-rarete' },
    h('thead', {}, h('tr', {}, h('th', {}, ''), g.colonnes.map(c => h('th', { class: c === t.creneau ? 'courant' : '' }, c.replace(' et ', ' + '))))),
    h('tbody', {}, g.lignes.map(l => {
      const ligneCourante = l.mois === mois && (!l.jours || (jour >= l.jours[0] && jour <= l.jours[1]));
      if (l.transition) {
        const ouQuand = l.transition.length === 2 ? 'au début ou à la fin du mois' : l.transition[0] === 'debut' ? 'en début de mois' : 'en fin de mois';
        return h('tr', { class: ligneCourante ? 'courant' : '' },
          h('th', {}, l.libelle),
          h('td', { colspan: String(l.cases.length), class: 'en-transition', title: 'Le jeu change de table avec un décalage tiré au hasard : la table du mois voisin peut servir.' },
            `🔄 en transition : possible ${ouQuand}`));
      }
      return h('tr', { class: ligneCourante ? 'courant' : '' },
        h('th', {}, l.libelle),
        l.cases.map((c, i) => {
          const ici = ligneCourante && g.colonnes[i] === t.creneau;
          if (!c) return h('td', { class: `vide${ici ? ' ici' : ''}`, title: 'Absent' }, '');
          const n = etoilesPour(c.pourcent, seuilsEtoiles());
          return h('td', {
            class: `n${n.etoiles}${ici ? ' ici' : ''}`,
            title: c.details.map(d => `${d.eau_texte ? d.eau_texte + ' : ' : ''}${fmt(d.pourcent)}${d.pluie ? " s'il pleut" : ''}${d.connecte != null && d.connecte !== d.pourcent ? ` (connecté : ${fmt(d.connecte)})` : ''}`).join('\n'),
          }, fmt(c.pourcent).replace(' %', ''), c.pluie ? '🌧' : '');
        }));
    })))));
  blocs.push(h('p', { class: 'aide' },
    `En %, la chance que le jeu choisisse cette espèce quand il fait apparaître ${nomCreature(cat)}. Case vide = absent. `,
    g.lignes.some(l => l.cases.some(c => c && c.pluie)) ? `🌧 = ${condPluie || "seulement s'il pleut"}. ` : '',
    'Plus la case est foncée, plus c\'est rare. ', bulle()));
  for (const i of cr.infos || []) blocs.push(h('p', { class: 'aide' }, `ℹ️ ${i}`));

  const r = etat.rarete && etat.rarete.donnees;
  if (r && (r.notes.length || r.source)) {
    blocs.push(h('details', { class: 'rarete-source' },
      h('summary', {}, 'À propos de ces chiffres'),
      r.titre ? h('p', { class: 'aide' }, r.titre) : null,
      r.source ? h('p', { class: 'aide' }, `Source : ${r.source}`) : null,
      h('ul', { class: 'liste-conditions' }, r.notes.map(n => h('li', { class: 'aide' }, `• ${n}`)))));
  }
  return blocs;
}

// ---------- Code d'objet (GameCube, tableur « ACGC Hundo Helper ») ----------
const LISTES = { REQUIRED: 'REQUIRED_Codes (route 100 %)', ADDITIONAL: 'ADDITIONAL_Codes' };
function sectionCode(cat, e) {
  const o = codeDe(cat.id, e.id);
  if (!o) return null;
  const d = etat.codes.donnees;
  const blocs = [h('h3', {}, '🔑 Code d\'objet (Tom Nook)')];
  const liste = o.liste
    ? `${LISTES[o.liste.nom] || o.liste.nom}${o.liste.section ? ` › ${o.liste.section}` : ''}${o.liste.bloc === 'droite' && o.liste.titre_bloc ? ` (colonne de droite : ${o.liste.titre_bloc})` : ''}`
    : null;
  blocs.push(h('table', { class: 'tableau-infos' },
    ligne('Provenance (tableur)', o.provenance),
    ligne('Liste du tableur', liste),
    ligne('Obtenu par défaut', o.defaut ? 'Oui (onglet Default)' : null),
    ligne('Saisie rapide (1re ligne)', o.premiere_ligne ? [...new Set(o.premiere_ligne)].join(' / ') : null),
    ligne('Info supplémentaire', [o.info, o.liste && o.liste.info].filter(Boolean).join(' · ') || null)));
  if (!o.code) {
    blocs.push(h('p', { class: 'note' }, /BANNED/i.test(o.sans_code || '')
      ? 'Pas de code dans le tableur : code interdit en speedrun (« BANNED »).'
      : "Pas de code dans le tableur pour cet objet (« NO DATA »)."));
  } else {
    blocs.push(...blocsCode(o, etat.profil));
  }
  blocs.push(h('p', { class: 'aide' }, `Source : ${d.source.nom}${d.source.version ? ` ${d.source.version}` : ''} — merci à ${d.credits_courts.join(' ; ')}.`));
  return blocs;
}

// Un code en deux lignes de 14, avec un bouton « Copier ».
function boiteCode(code, titre) {
  const [l1, l2] = formaterCode(code);
  const bouton = h('button', { class: 'bouton petit', onclick: async () => {
    await window.nook.copier(code);
    bouton.textContent = '✓ Copié';
    setTimeout(() => { bouton.textContent = 'Copier'; }, 1500);
  } }, 'Copier');
  return h('div', { class: 'code-objet' },
    titre ? h('div', { class: 'aide' }, titre) : null,
    h('pre', { class: 'code-lignes' }, `${l1}\n${l2}`), bouton);
}

// Quel code montrer pour cet objet, selon le type du code du tableur et le profil :
//  - magazine : le jeu ne vérifie pas le nom -> le code du tableur marche pour tout le monde ;
//  - mini-carte e-Reader : refusé par la version européenne -> « version US » + code universel pour l'Europe ;
//  - joueur / NES / habitant : le jeu vérifie le nom et la ville -> code créé avec les noms du profil.
// Chaque code affiché est d'abord redécodé : on ne montre rien s'il ne désigne pas le bon objet.
const NOMS_VERIFIES = ['joueur', 'famicom', 'populaire'];
const meuble = n => (n >= 0x1000 && n < 0x2000) || (n >= 0x3000 && n < 0x4000);
const bonObjet = (d, numero) => {
  const n = parseInt(numero, 16);
  return !!d && d.sommeOk && (d.objet === n || (meuble(n) && (d.objet & ~3) === (n & ~3)));
};
function blocsCode(o, profil) {
  const d = decoder(o.code);
  if (!bonObjet(d, o.numero)) return [h('p', { class: 'note verifier' }, "⚠️ Le code du tableur ne correspond pas à cet objet : il n'est pas affiché.")];
  const res = [h('p', { class: 'aide' }, `Type de code : ${NOMS_TYPES_CODE[d.type] || d.type}.`)];

  if (d.type === 'magazine') {
    res.push(boiteCode(o.code), h('p', { class: 'aide' }, '✅ Marche quel que soit ton nom et ta ville (le jeu ne les vérifie pas pour ce type de code). Version européenne et américaine.'));
    return res;
  }

  if (d.type === 'carte-e-mini' || d.type === 'carte-e') {
    const europe = !profil || profil.region !== 'us';
    res.push(boiteCode(o.code, '🇺🇸 Version américaine seulement'),
      h('p', { class: 'aide' }, "La version européenne n'a pas l'e-Reader : Tom Nook et les habitants refusent ce type de code."));
    if (o.code_universel && bonObjet(decoder(o.code_universel), o.numero)) {
      res.push(boiteCode(o.code_universel, `${europe ? '🇪🇺 Pour ta version européenne' : 'Pour la version européenne'} : code universel (type magazine, marche quel que soit ton nom)`),
        h('p', { class: 'aide' }, 'Code universel tiré du « Data Spreadsheet for Animal Crossing (GCN) ».'));
    }
    return res;
  }

  if (NOMS_VERIFIES.includes(d.type)) {
    const nom = profil && profil.joueur ? profil.joueur.nom : '';
    const ville = profil && profil.joueur ? profil.joueur.ville : '';
    res.push(h('p', { class: 'aide' }, `Le jeu vérifie le nom et la ville : le code du tableur a été fait pour « ${d.nom} » de « ${d.ville} ».`));
    if (!nom || !ville || erreurNom(nom) || erreurNom(ville)) {
      res.push(h('p', { class: 'note' }, "✏️ Indique ton nom et ta ville du jeu dans ton profil (Profils › Modifier) pour obtenir ton code."));
      return res;
    }
    const memes = JSON.stringify(nomVersOctets(nom)) === JSON.stringify(d.nomOctets) && JSON.stringify(nomVersOctets(ville)) === JSON.stringify(d.villeOctets);
    if (memes) {
      res.push(boiteCode(o.code, 'Code du tableur (fait pour ton nom et ta ville)'));
      return res;
    }
    // Même type de code, même « hit rate » et même expéditeur que le code du tableur.
    const code = creer({ nom, ville, objet: d.objet, typeCode: d.typeCode, hitRate: d.hitRate, typeExpediteur: Math.max(0, d.typeExpediteur), codeExpediteur: d.octetExpediteur });
    const verif = decoder(code);
    if (!bonObjet(verif, o.numero) || verif.nom !== nom.replace(/ +$/, '') || verif.ville !== ville.replace(/ +$/, '') || verif.typeCode !== d.typeCode) {
      res.push(h('p', { class: 'note verifier' }, "⚠️ Le code créé ne se relit pas correctement : il n'est pas affiché."));
      return res;
    }
    res.push(boiteCode(code, `Ton code, pour « ${nom} » de « ${ville} »`));
    return res;
  }

  res.push(h('p', { class: 'note' }, "Type de code non géré par Nook Dex pour l'instant."));
  return res;
}

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
    ajouterA(corps, sectionRarete(cat, e));
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

  if (courant.jeu.id === 'gc') ajouterA(corps, sectionCode(cat, e));

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
