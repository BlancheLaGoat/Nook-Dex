// Taux d'apparition de New Horizons (Switch), tirés des paramètres du jeu (fichiers BCSV
// FishAppearRiverParam, FishAppearSeaParam, InsectAppearParam, InsectStatusParam, SeafoodAppearParam,
// extraits par Ninji, version 1.4.0), recopiés dans les tableurs « ACNH Fish / Bug / Sea Creatures Spawns »
// d'asteriation.
//
// Lit, sans les modifier : sources/spawn/nh_poissons.xlsx, nh_insectes.xlsx, nh_creatures_marines.xlsx
// (téléchargés s'ils manquent, ou avec --maj).
// Écrit data/rarete/rarete_animal_crossing_nh.json, au même format que les autres jeux, avec en plus
// « hemisphere » (nord / sud) sur chaque table ; scripts/rarete.js le transforme ensuite en data/nh/rarete.json.
// Si correspondances.json n'a pas encore de bloc « nh », il est ajouté (nom anglais -> fiche du dex).
//
// Lancer avec : npm run donnees:rarete-nh   (puis npm run donnees:rarete)
//
// Comment le jeu choisit (calcul des tableurs) : chaque espèce a un poids par mois et par créneau horaire.
// La chance d'une espèce = son poids / la somme des poids des espèces possibles au même endroit, au même moment.
//  - Poissons : le lieu compte. Rivière = espèces « rivière » ; embouchure = rivière + « embouchure » ;
//    rivière en hauteur = rivière + « en hauteur » ; étang = « étang » ; mer = « mer » ; ponton = mer + « ponton ».
//    Les espèces « partout » (どこでも) s'ajoutent à chaque lieu. Le cœlacanthe n'apparaît que s'il pleut.
//  - Insectes : un seul tirage pour toute l'île (on suppose qu'elle a fleurs, arbres, souches, rochers, eau…).
//    Selon le temps : certaines espèces ne sortent pas s'il pleut, d'autres seulement s'il pleut.
//    Guêpe, fourmi et mouche ne sont pas tirées ainsi (arbre secoué, objets au sol).
//  - Créatures marines (plongée) : un seul tirage pour la mer.
//  - Les espèces qui demandent 20 ou 50 prises sont comptées comme débloquées.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { DOSSIER_DATA, DOSSIER_SOURCES, ecrireJson, telecharger } = require('./lib/outils');

const TABLEURS = {
  poissons: { fichier: path.join(DOSSIER_SOURCES, 'spawn', 'nh_poissons.xlsx'), url: 'https://docs.google.com/spreadsheets/d/1QVozmKpL6J1CyRD2LmRLpf5WuAwMlnTOc7bi2dymHTQ/export?format=xlsx' },
  insectes: { fichier: path.join(DOSSIER_SOURCES, 'spawn', 'nh_insectes.xlsx'), url: 'https://docs.google.com/spreadsheets/d/1OeQsfLGnGf3pJn_uWGqi0NjpzR5Lj9yCgWvpdE0y74Q/export?format=xlsx' },
  creatures_marines: { fichier: path.join(DOSSIER_SOURCES, 'spawn', 'nh_creatures_marines.xlsx'), url: 'https://docs.google.com/spreadsheets/d/1TsSBBZjaoyHNudFZ0yZ6PXZfJLkKQQUZhShQ08tEqEU/export?format=xlsx' },
};

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const MOIS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Créneaux du jeu (noms des colonnes des paramètres -> heures).
const CRENEAUX_EAU = { MorningAndEvening: '4h-9h et 16h-21h', Daytime: '9h-16h', Night: '21h-4h' };
const CRENEAUX_INSECTES = { Morning: '4h-8h', Daytime: '8h-16h', Evening1: '16h-17h', Evening2: '17h-19h', Night: '19h-23h', Midnight: '23h-4h' };

// Lieux de pêche : quelles zones des paramètres y sont possibles (どこでも = partout s'ajoute toujours).
const LIEUX_POISSONS = [
  { eau: 'riviere', feuille: 'FishAppearRiverParam', zones: ['川'] },
  { eau: 'embouchure', feuille: 'FishAppearRiverParam', zones: ['川', '汽水池'] },
  { eau: 'riviere-hauteur', feuille: 'FishAppearRiverParam', zones: ['川', '川：崖上'] },
  { eau: 'etang', feuille: 'FishAppearRiverParam', zones: ['池'] },
  { eau: 'mer', feuille: 'FishAppearSeaParam', zones: ['海'] },
  { eau: 'ponton', feuille: 'FishAppearSeaParam', zones: ['海', '海：桟橋'] },
];
const PARTOUT = 'どこでも';
// Poissons qui n'apparaissent que s'il pleut (colonne « Rain » du tableur).
const POISSONS_PLUIE = ['coelacanth'];
// Insectes tirés autrement (colonne « Special » du tableur) : pas dans le tirage.
const INSECTES_A_PART = ['wasp', 'ant', 'fly'];
const METEO = { '雨天時は発生しない': 'sec', '天気によらず発生': 'tous', '雨天時のみ発生': 'pluie', '積雪期間のみ発生': 'neige' };

const texteCellule = v => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.result !== undefined) return String(v.result);
    return '';
  }
  return String(v);
};
const nombre = v => { const n = Number(texteCellule(v)); return Number.isFinite(n) ? n : 0; };
const simple = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Lit une feuille de paramètres : [{ nom, zone, hemisphere, poids: { "mois|créneau": n } }]
// « ProbJanDaytime », « ProbFebruayEvening1 » (sic) -> mois 1..12 et nom du créneau.
function lireParametres(ws, creneaux, { colZone = null } = {}) {
  const entetes = ws.getRow(1).values.map(texteCellule);
  const colonnes = [];
  entetes.forEach((t, c) => {
    const m = /^Prob([A-Za-z]+?)(MorningAndEvening|Daytime|Evening1|Evening2|Midnight|Morning|Night)$/.exec(t);
    if (!m) return;
    const mois = MOIS_EN.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (!mois || !creneaux[m[2]]) throw new Error(`${ws.name} : colonne « ${t} » illisible`);
    colonnes.push({ c, mois, creneau: creneaux[m[2]] });
  });
  const attendu = 12 * Object.keys(creneaux).length;
  if (colonnes.length !== attendu) throw new Error(`${ws.name} : ${colonnes.length} colonnes de poids au lieu de ${attendu}`);
  const cZone = colZone ? entetes.indexOf(colZone) : -1;
  const cHemi = entetes.indexOf('AppearArea');
  const lignes = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const nom = texteCellule(row.getCell(1).value).trim();
    if (!nom) continue;
    const h = texteCellule(row.getCell(cHemi).value);
    const hemisphere = /^(0|.*North.*)$/.test(h) ? 'nord' : /^(1|.*South.*)$/.test(h) ? 'sud' : null;
    if (!hemisphere) throw new Error(`${ws.name}, ligne ${r} : hémisphère illisible (« ${h} »)`);
    const poids = {};
    for (const { c, mois, creneau } of colonnes) poids[`${mois}|${creneau}`] = nombre(row.getCell(c).value);
    lignes.push({ nom, zone: cZone > 0 ? texteCellule(row.getCell(cZone).value).trim() : null, hemisphere, poids });
  }
  return lignes;
}

// Fabrique les tables : pour chaque hémisphère, mois et créneau, part de chaque espèce candidate.
// candidat(ligne) -> true si l'espèce fait partie du tirage ;
// seulementPluie(ligne) -> true si elle n'y est que s'il pleut ; absentePluie(ligne) -> true si elle n'y est pas s'il pleut.
function fabriquerTables(lignes, creneaux, { eau = null, candidat = () => true, seulementPluie = () => false, absentePluie = () => false }) {
  const tables = [];
  for (const hemisphere of ['nord', 'sud']) {
    const duCote = lignes.filter(l => l.hemisphere === hemisphere && candidat(l));
    for (let mois = 1; mois <= 12; mois++) {
      for (const creneau of Object.values(creneaux)) {
        const cle = `${mois}|${creneau}`;
        const presents = duCote.filter(l => l.poids[cle] > 0);
        const sec = presents.filter(l => !seulementPluie(l));
        const humide = presents.filter(l => !absentePluie(l));
        const somme = liste => liste.reduce((s, l) => s + l.poids[cle], 0);
        const totalSec = somme(sec), totalPluie = somme(humide);
        if (!totalSec && !totalPluie) continue;
        const t = { mois: MOIS[mois - 1], hemisphere, creneau };
        if (eau) t.eau = eau;
        // Les parts ne sont pas arrondies ici (scripts/rarete.js le fait) : leur somme reste 100.
        t.table = sec.map(l => ({ espece: l.nom, pourcent: (l.poids[cle] / totalSec) * 100, poids: l.poids[cle] }));
        const pluie = humide.filter(l => seulementPluie(l));
        if (pluie.length) t.table_pluie = pluie.map(l => ({ espece: l.nom, pourcent: (l.poids[cle] / totalPluie) * 100, poids: l.poids[cle] }));
        tables.push(t);
      }
    }
  }
  return tables;
}

async function classeur(fichier) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fichier);
  return wb;
}

async function principal() {
  const maj = process.argv.includes('--maj');
  for (const s of Object.values(TABLEURS)) {
    if (maj || !fs.existsSync(s.fichier)) { console.log('Téléchargement de', s.url); await telecharger(s.url, s.fichier); }
  }

  // ---- Poissons ----
  const wbP = await classeur(TABLEURS.poissons.fichier);
  const feuilles = {};
  for (const nom of ['FishAppearRiverParam', 'FishAppearSeaParam']) {
    const ws = wbP.getWorksheet(nom);
    if (!ws) throw new Error(`Feuille « ${nom} » introuvable dans ${TABLEURS.poissons.fichier}`);
    feuilles[nom] = lireParametres(ws, CRENEAUX_EAU, { colZone: 'Location' });
  }
  const zonesConnues = new Set([PARTOUT, ...LIEUX_POISSONS.flatMap(l => l.zones)]);
  for (const l of Object.values(feuilles).flat()) if (!zonesConnues.has(l.zone)) throw new Error(`Poisson « ${l.nom} » : zone inconnue « ${l.zone} »`);
  const pluieP = l => POISSONS_PLUIE.includes(simple(l.nom));
  const poissons = LIEUX_POISSONS.flatMap(lieu => fabriquerTables(feuilles[lieu.feuille], CRENEAUX_EAU, {
    eau: lieu.eau,
    candidat: l => l.zone === PARTOUT || lieu.zones.includes(l.zone),
    seulementPluie: pluieP,
  }));

  // ---- Insectes ----
  const wbI = await classeur(TABLEURS.insectes.fichier);
  const insectesBruts = lireParametres(wbI.getWorksheet('InsectAppearParam'), CRENEAUX_INSECTES);
  // Temps qu'il faut à chaque insecte (InsectStatusParam : colonne AppearWeather, nom anglais en dernière colonne).
  const wsS = wbI.getWorksheet('InsectStatusParam');
  const enteteS = wsS.getRow(1).values.map(texteCellule);
  const cMeteo = enteteS.indexOf('AppearWeather'), cNom = enteteS.indexOf('EN Name');
  const meteo = new Map();
  for (let r = 2; r <= wsS.rowCount; r++) {
    const nom = texteCellule(wsS.getCell(r, cNom).value).trim();
    if (!nom) continue;
    const t = texteCellule(wsS.getCell(r, cMeteo).value).trim();
    // « …期間のみ発生 » : seulement pendant une période (neige, cerisiers, feuilles d'érable) : pas des insectes du dex.
    const m = METEO[t] || (/期間のみ発生$/.test(t) ? 'saison' : null);
    if (!m) throw new Error(`Insecte « ${nom} » : temps inconnu « ${texteCellule(wsS.getCell(r, cMeteo).value)} »`);
    meteo.set(simple(nom), m);
  }
  const meteoDe = l => {
    const m = meteo.get(simple(l.nom));
    if (!m) throw new Error(`Insecte « ${l.nom} » absent de InsectStatusParam`);
    return m;
  };
  const insectes = fabriquerTables(insectesBruts, CRENEAUX_INSECTES, {
    candidat: l => !INSECTES_A_PART.includes(simple(l.nom)) && !['neige', 'saison'].includes(meteoDe(l)),
    seulementPluie: l => meteoDe(l) === 'pluie',
    absentePluie: l => meteoDe(l) === 'sec',
  });

  // ---- Créatures marines ----
  const wbM = await classeur(TABLEURS.creatures_marines.fichier);
  const marins = fabriquerTables(lireParametres(wbM.getWorksheet('SeafoodAppearParam'), CRENEAUX_EAU), CRENEAUX_EAU, { eau: 'plongee' });

  const sortie = {
    jeu: 'Animal Crossing: New Horizons (Switch, paramètres de la version 1.4.0)',
    source: 'Paramètres du jeu FishAppearRiverParam, FishAppearSeaParam, InsectAppearParam, InsectStatusParam et SeafoodAppearParam (extraits par Ninji), via les tableurs « ACNH Fish / Bug / Sea Creatures Spawns » d\'asteriation',
    notes: [
      "Chance d'une espèce = son poids / la somme des poids des espèces possibles au même endroit, au même moment.",
      'Poissons : un tirage par lieu (rivière, embouchure, rivière en hauteur, étang, mer, ponton). Le cœlacanthe ne sort que s\'il pleut (table_pluie).',
      'Insectes : un seul tirage pour une île qui a de tout (fleurs, arbres, souches, rochers, eau). Guêpe, fourmi et mouche sont à part.',
      "Insectes : table = temps sec ; table_pluie = espèces qui ne sortent que s'il pleut, avec leur part un jour de pluie.",
      'Les espèces qui demandent 20 ou 50 prises sont comptées comme débloquées.',
    ],
    poissons,
    insectes,
    creatures_marines: marins,
  };
  const fichier = ecrireJson('rarete/rarete_animal_crossing_nh.json', sortie);
  console.log(`${poissons.length} tables de poissons, ${insectes.length} tables d'insectes, ${marins.length} tables de créatures marines -> ${path.relative(process.cwd(), fichier)}`);

  // Bloc « nh » de correspondances.json (ajouté une seule fois ; ensuite, il se modifie à la main).
  const fCorr = path.join(DOSSIER_DATA, 'rarete', 'correspondances.json');
  const corr = JSON.parse(fs.readFileSync(fCorr, 'utf8'));
  if (!corr.nh) {
    const bloc = { fichier: 'rarete_animal_crossing_nh.json', poissons: {}, insectes: {}, creatures_marines: {}, ignorer: { poissons: [], insectes: [], creatures_marines: [] } };
    const manquants = [];
    for (const [cat, catDex] of [['poissons', 'poissons'], ['insectes', 'insectes'], ['creatures_marines', 'creatures-marines']]) {
      const dex = new Map(JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, 'nh', `${catDex}.json`), 'utf8')).map(e => [simple(e.nom.en), e.id]));
      const noms = new Set(sortie[cat].flatMap(t => [...t.table, ...(t.table_pluie || [])].map(e => e.espece)));
      for (const n of [...noms].sort()) {
        const id = dex.get(simple(n));
        if (id) bloc[cat][n] = id; else manquants.push(`${cat} : ${n}`);
      }
    }
    corr.nh = bloc;
    fs.writeFileSync(fCorr, `${JSON.stringify(corr, null, 2)}\n`);
    console.log(`Bloc « nh » ajouté à correspondances.json${manquants.length ? ` — à relier à la main (ou à mettre dans « ignorer ») : ${manquants.join(', ')}` : ' (tout est relié)'}`);
  }
}

if (require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { fabriquerTables, LIEUX_POISSONS };
