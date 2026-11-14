// Rareté (taux d'apparition) des poissons et insectes, tirée du code des jeux.
//
// Lit, sans les modifier :
//   data/rarete/rarete_animal_crossing_<jeu>.json   tables d'apparition extraites du jeu
//   data/rarete/correspondances.json                nom dans ces tables -> fiche du dex
//   data/rarete/regles.json                         règles propres à chaque jeu
// Écrit data/<jeu>/rarete.json, dans un format commun à tous les jeux (lu par l'appli).
// Si regles.json dit « mois_selon_tables » (Wild World), corrige aussi les mois des fiches
// data/<jeu>/<catégorie>.json pour qu'ils suivent les tables (à relancer après scripts/<jeu>.js).
//
// Lancer avec : npm run donnees:rarete
//
// Formats d'entrée acceptés (pour pouvoir ajouter d'autres jeux plus tard) :
//   période  : "mois" ("aout") + "quinzaine" facultative ("1-15", "16-fin"),
//              ou "periode" ("janvier", "aout 1-15", "septembre 16-30")
//   créneau  : "21h-4h", ou plusieurs plages : "4h-9h et 16h-21h"
//   table    : [{ espece, pourcent, poids? }], et "pourcent_rien" pour les insectes
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, ecrireJson } = require('./lib/outils');
const { periodesAvecPresence } = require('./lib/ancien');

const DOSSIER = path.join(DOSSIER_DATA, 'rarete');
const lire = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const sansAccents = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const arrondi = x => Math.round(x * 100) / 100;

// Catégories des fichiers de rareté -> catégories du dex (data/<jeu>/<catégorie>.json et clés de l'appli).
const CATEGORIES = [['poissons', 'poissons'], ['insectes', 'insectes'], ['creatures_marines', 'creatures-marines']];

const TEXTES_EAU = {
  riviere: 'Rivière', mer: 'Mer', bassin: 'Bassin',
  'riviere/etang/cascade': 'Rivière, étang, cascade', 'mer/embouchure': 'Mer, embouchure',
};
const texteEau = e => TEXTES_EAU[e] || (e ? e.charAt(0).toUpperCase() + e.slice(1) : '');

// "aout" + "16-fin" -> { mois: 8, jours: [16, 31] } ; "septembre 16-30" -> { mois: 9, jours: [16, 30] }
function lirePeriode(t) {
  const texte = t.periode != null ? t.periode : `${t.mois}${t.quinzaine ? ' ' + t.quinzaine : ''}`;
  const m = /^(\S+)(?:\s+(\d+)-(\d+|fin))?$/.exec(sansAccents(texte));
  const mois = m ? MOIS.indexOf(m[1]) + 1 : 0;
  if (!mois) throw new Error(`période illisible : « ${texte} »`);
  const jours = m[2] ? [Number(m[2]), m[3] === 'fin' ? 31 : Number(m[3])] : null;
  return { mois, jours };
}

// "4h-9h et 16h-21h" -> [[4, 9], [16, 21]]
function lireCreneau(texte) {
  const plages = [...String(texte).matchAll(/(\d+)\s*h\s*-\s*(\d+)\s*h/g)].map(m => [Number(m[1]), Number(m[2])]);
  if (!plages.length) throw new Error(`créneau illisible : « ${texte} »`);
  return plages;
}

function convertirJeu(jeu, corresp, regles) {
  const brut = lire(path.join(DOSSIER, corresp.fichier));
  const erreurs = [];
  const corrections = []; // fiches à réécrire (mois corrigés d'après les tables)
  const sortie = {
    _genere: 'Fichier fabriqué par scripts/rarete.js à partir de data/rarete/ : ne pas modifier à la main.',
    jeu, titre: brut.jeu, source: brut.source, notes: brut.notes || [],
    categories: {},
  };

  for (const [cat, catDex] of CATEGORIES) {
    if (!Array.isArray(brut[cat])) continue;
    const table = corresp[cat] || {};
    const ignorer = new Set((corresp.ignorer && corresp.ignorer[cat]) || []);
    const dex = lire(path.join(DOSSIER_DATA, jeu, `${catDex}.json`));
    const idsDex = new Set(dex.map(e => e.id));
    const regle = (regles && regles[cat]) || {};
    const nonRelies = new Set();

    for (const [nom, id] of Object.entries(table)) {
      if (!idsDex.has(id)) erreurs.push(`${jeu}/${cat} : « ${nom} » est relié à « ${id} », qui n'existe pas dans data/${jeu}/${catDex}.json`);
    }

    const creneaux = [];
    const tables = brut[cat].map(t => {
      const { mois, jours } = lirePeriode(t);
      if (!creneaux.some(c => c.id === t.creneau)) creneaux.push({ id: t.creneau, heures: lireCreneau(t.creneau) });
      const especes = {};
      const connecte = {}; // taux quand on est connecté à une autre ville (City Folk), si le fichier les donne
      for (const e of t.table) {
        if (ignorer.has(e.espece)) continue;
        const id = table[e.espece];
        if (!id) { nonRelies.add(e.espece); continue; }
        // Même espèce deux fois dans un tirage (deux zones, ou SALMON + SALMON2) : on additionne.
        especes[id] = arrondi((especes[id] || 0) + e.pourcent);
        if (e.pourcent_connecte != null) connecte[id] = arrondi((connecte[id] || 0) + e.pourcent_connecte);
      }
      const total = t.table.reduce((s, e) => s + e.pourcent, 0);
      const sortieTable = { mois, jours, creneau: t.creneau };
      if (t.eau) { sortieTable.eau = t.eau; sortieTable.eau_texte = texteEau(t.eau); }
      sortieTable.especes = especes;
      if (Object.keys(connecte).length) sortieTable.connecte = connecte;
      // Chance qu'il n'y ait rien : donnée par le fichier (insectes, même 0 %), sinon le reste jusqu'à 100 %.
      if (t.pourcent_rien != null) sortieTable.rien = t.pourcent_rien;
      else if (arrondi(100 - total) > 0) sortieTable.rien = arrondi(100 - total);

      // Espèce ajoutée seulement s'il pleut (cœlacanthe du GameCube).
      for (const a of regle.ajout_pluie || []) {
        if (t.eau !== a.eau || (a.sauf_creneaux || []).includes(t.creneau)) continue;
        const poidsTotal = t.table.reduce((s, e) => s + (e.poids != null ? e.poids : e.pourcent), 0);
        sortieTable.pluie = { ...(sortieTable.pluie || {}), [a.id]: arrondi((a.poids / (poidsTotal + a.poids)) * 100) };
      }
      return sortieTable;
    });

    for (const n of nonRelies) erreurs.push(`${jeu}/${cat} : « ${n} » n'est pas dans correspondances.json (ni dans « ignorer »)`);
    for (const a of regle.ajout_pluie || []) if (!idsDex.has(a.id)) erreurs.push(`${jeu}/${cat} : ajout_pluie « ${a.id} » n'existe pas dans le dex`);

    const sortieCat = { creneaux, tables };
    for (const k of ['transition', 'rang_ville', 'facteurs_rang']) if (regle[k] != null) sortieCat[k] = regle[k];
    if (regle.rang_ville_sauf && regle.rang_ville_sauf.length) sortieCat.rang_ville_sauf = regle.rang_ville_sauf;
    // Conditions des espèces ajoutées seulement s'il pleut (pour l'affichage : « hors 9h-16h »).
    for (const a of regle.ajout_pluie || []) {
      sortieCat.pluie_seulement = { ...(sortieCat.pluie_seulement || {}), [a.id]: { sauf_creneaux: a.sauf_creneaux || [] } };
    }
    // Espèces des tables normales qui n'apparaissent que par un certain temps (cœlacanthe : pluie ou neige).
    if (regle.meteo_seulement && Object.keys(regle.meteo_seulement).length) {
      for (const id of Object.keys(regle.meteo_seulement)) if (!idsDex.has(id)) erreurs.push(`${jeu}/${cat} : meteo_seulement « ${id} » n'existe pas dans le dex`);
      sortieCat.meteo_seulement = regle.meteo_seulement;
    }
    if (regle.a_verifier && Object.keys(regle.a_verifier).length) sortieCat.a_verifier = regle.a_verifier;
    if (regle.infos && regle.infos.length) sortieCat.infos = regle.infos;
    // Espèces volontairement sans taux (île, autre mécanisme) : la raison s'affiche sur leur fiche.
    if (regle.sans_taux && Object.keys(regle.sans_taux).length) {
      for (const id of Object.keys(regle.sans_taux)) if (!idsDex.has(id)) erreurs.push(`${jeu}/${cat} : sans_taux « ${id} » n'existe pas dans le dex`);
      sortieCat.sans_taux = regle.sans_taux;
    }
    sortie.categories[catDex] = sortieCat;

    const presents = new Set(tables.flatMap(t => [...Object.keys(t.especes), ...Object.keys(t.pluie || {})]));
    console.log(`  ${cat} : ${presents.size} espèces avec taux, ${tables.length} tables, ${creneaux.length} créneaux`);

    // ---- Les tables font foi : on corrige les mois des fiches ----
    if (regle.mois_selon_tables) {
      const changements = [];
      for (const e of dex) {
        if (!presents.has(e.id) || !e.dispo || !e.dispo.tous) continue;
        const avant = e.dispo.tous;
        const apres = periodesSelonTables(avant, tables, e.id);
        if (canonique(avant) === canonique(apres)) continue;
        e.dispo.tous = apres;
        const note = "Mois corrigés d'après les tables d'apparition du jeu.";
        if (!(e.notes || []).includes(note)) e.notes = [...(e.notes || []), note];
        changements.push(`${e.nom.fr} (${e.id}) : ${textePeriodes(avant)} -> ${textePeriodes(apres)}`);
      }
      if (changements.length) {
        corrections.push({ fichier: `${jeu}/${catDex}.json`, dex });
        console.log(`    mois des fiches corrigés d'après les tables :\n      - ${changements.join('\n      - ')}`);
      }
    }

    // ---- Rapport : fiches sans taux, et mois qui ne collent pas avec les fiches ----
    const sansTaux = dex.filter(e => !presents.has(e.id));
    if (sansTaux.length) console.log(`    fiches sans taux (« rareté inconnue ») : ${sansTaux.map(e => `${e.nom.fr} (${e.id})`).join(', ')}`);
    const ecarts = [];
    const enTransition = [];
    // Sans transition (la table change pile le 1er et le 16), on compare à la quinzaine près.
    if (!regle.transition) {
      const quinzaines = (liste, jours) => new Set(liste.flatMap(x => (jours(x) ? [`${x.m}.${jours(x)[0] > 1 ? 2 : 1}`] : [`${x.m}.1`, `${x.m}.2`])));
      const nomQ = k => { const [m, q] = k.split('.'); return `${MOIS_COURTS[m - 1]} ${q === '1' ? '1re quinzaine' : '2e quinzaine'}`; };
      for (const e of dex) {
        if (!presents.has(e.id) || !e.dispo || !e.dispo.tous) continue;
        const qt = quinzaines(tables.filter(t => t.especes[e.id] || (t.pluie && t.pluie[e.id])).map(t => ({ m: t.mois, j: t.jours })), x => x.j);
        const qf = quinzaines(e.dispo.tous.flatMap(p => p.mois.map(m => ({ m, j: p.jours }))), x => x.j);
        const plus = [...qt].filter(k => !qf.has(k)), moins = [...qf].filter(k => !qt.has(k));
        if (plus.length || moins.length) {
          ecarts.push(`${e.nom.fr} : ${plus.length ? `dans les tables mais pas sur la fiche en ${plus.map(nomQ).join(', ')}` : ''}${plus.length && moins.length ? ' ; ' : ''}${moins.length ? `sur la fiche mais pas dans les tables en ${moins.map(nomQ).join(', ')}` : ''}`);
        }
      }
    }
    for (const e of regle.transition ? dex : []) {
      if (!presents.has(e.id) || !e.dispo) continue;
      const moisTables = new Set(tables.filter(t => (t.especes[e.id] || (t.pluie && t.pluie[e.id]))).map(t => t.mois));
      const moisFiche = new Set((e.dispo.tous || e.dispo.nord || []).flatMap(p => p.mois));
      const enPlus = [...moisTables].filter(m => !moisFiche.has(m));
      let enMoins = [...moisFiche].filter(m => !moisTables.has(m));
      // Avec une transition entre les mois, l'espèce peut apparaître à la fin du mois qui précède
      // sa table, ou au début du mois qui suit : ce n'est pas une erreur de la fiche.
      if (regle.transition && regle.transition.mois) {
        const tr = enMoins.filter(m => moisTables.has(moisSuivant(m)) || moisTables.has(moisPrecedent(m)));
        if (tr.length) enTransition.push(`${e.nom.fr} : ${tr.map(m => `${MOIS[m - 1]} (${moisTables.has(moisSuivant(m)) ? 'fin du mois' : 'début du mois'})`).join(', ')}`);
        enMoins = enMoins.filter(m => !tr.includes(m));
      }
      if (enPlus.length || enMoins.length) {
        ecarts.push(`${e.nom.fr} : ${enPlus.length ? `dans les tables mais pas sur la fiche en ${enPlus.map(m => MOIS[m - 1]).join(', ')}` : ''}${enPlus.length && enMoins.length ? ' ; ' : ''}${enMoins.length ? `sur la fiche mais pas dans les tables en ${enMoins.map(m => MOIS[m - 1]).join(', ')}` : ''}`);
      }
    }
    if (enTransition.length) console.log(`    mois « en transition » (normal : changement de table décalé) : ${enTransition.length} fiche(s)\n      - ${enTransition.join('\n      - ')}`);
    if (ecarts.length) console.log(`    mois différents entre les tables et les fiches (à regarder) :\n      - ${ecarts.join('\n      - ')}`);
  }
  return { sortie, erreurs, corrections };
}

const moisSuivant = m => (m % 12) + 1;
const moisPrecedent = m => ((m + 10) % 12) + 1;

// ---- Correction des mois d'une fiche d'après les tables ----
// Pour chaque mois où l'espèce est présente : null (mois entier) ou une seule moitié, avec les jours
// de la table du jeu (ex. [1, 15] et [16, 31] dans Wild World, [1, 14] et [15, 31] dans City Folk).
function presenceSelonTables(tables, id) {
  const parMois = new Map();
  for (const t of tables) {
    if (!t.especes[id] && !(t.pluie && t.pluie[id])) continue;
    if (!parMois.has(t.mois)) parMois.set(t.mois, new Map());
    parMois.get(t.mois).set(t.jours ? t.jours[0] : 0, t.jours || null);
  }
  const res = new Map();
  for (const [mois, moities] of parMois) {
    const moitiesDuMois = new Set(tables.filter(t => t.mois === mois).map(t => (t.jours ? t.jours[0] : 0)));
    const partout = [...moitiesDuMois].every(d => moities.has(d));
    const jours = [...moities.values()][0];
    res.set(mois, partout || moities.size > 1 || !jours ? null : [jours[0], jours[1] >= 28 ? 31 : jours[1]]);
  }
  return res;
}

function periodesSelonTables(periodes, tables, id) {
  return periodesAvecPresence(periodes, presenceSelonTables(tables, id));
}

// Même contenu (mois, jours, horaires) quel que soit le regroupement des périodes.
const canonique = periodes => JSON.stringify(periodes
  .flatMap(p => p.mois.map(m => [m, p.jours || null, p.heures]))
  .sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1]))));

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const textePeriodes = periodes => periodes
  .flatMap(p => p.mois.map(m => ({ m, t: `${MOIS_COURTS[m - 1]}${p.jours ? ` ${p.jours[0]}-${p.jours[1] >= 30 ? 'fin' : p.jours[1]}` : ''}` })))
  .sort((a, b) => a.m - b.m).map(x => x.t).join(', ') || 'aucun';

function principal() {
  const correspondances = lire(path.join(DOSSIER, 'correspondances.json'));
  const regles = lire(path.join(DOSSIER, 'regles.json'));
  const toutes = [];
  for (const [jeu, corresp] of Object.entries(correspondances)) {
    if (jeu.startsWith('_')) continue;
    console.log(`\n${jeu.toUpperCase()} (${corresp.fichier})`);
    const { sortie, erreurs, corrections } = convertirJeu(jeu, corresp, regles[jeu]);
    if (erreurs.length) { toutes.push(...erreurs); continue; }
    console.log(`  -> ${path.relative(process.cwd(), ecrireJson(`${jeu}/rarete.json`, sortie))}`);
    for (const c of corrections) console.log(`  -> ${path.relative(process.cwd(), ecrireJson(c.fichier, c.dex))} (mois corrigés)`);
  }
  if (toutes.length) {
    console.error(`\n${toutes.length} problème(s) : rien n'a été écrit pour les jeux concernés.\n- ${toutes.join('\n- ')}`);
    process.exit(1);
  }
}

if (require.main === module) principal();
module.exports = { lirePeriode, lireCreneau, periodesSelonTables };
