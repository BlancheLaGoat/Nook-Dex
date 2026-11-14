// Taux d'apparition de City Folk (Wii), tirés du tableur « Spawn rates » de la communauté
// (données de la décompilation du jeu par Cuyler : d_fish_info.cpp et d_insect_info.cpp).
//
// Lit, sans le modifier : sources/spawn/cf.xlsx (téléchargé par scripts/cf.js)
// Écrit data/rarete/rarete_animal_crossing_cf.json, au même format que les fichiers GameCube et Wild World,
// puis scripts/rarete.js le transforme en data/cf/rarete.json comme pour les autres jeux.
// Si correspondances.json n'a pas encore de bloc « cf », il est ajouté (nom anglais -> fiche du dex).
//
// Lancer avec : npm run donnees:rarete-cf   (puis npm run donnees:rarete)
//
// Comment le jeu choisit (Read Me du tableur) :
//  - Poissons : deux listes par période et créneau (rivière = toute l'eau douce, mer). Chaque entrée a une
//    borne cumulée en % ; le jeu tire 0..100. Connecté à une autre ville, il tire 0..95 : les entrées au-delà
//    de 95 (souvent les plus rares, puis les déchets) deviennent plus rares ou impossibles.
//    Une période par mois, sauf août et septembre coupés en 1-14 et 15-fin. Créneaux : 21h-4h, 4h-9h et 16h-21h, 9h-16h.
//  - Insectes : une liste par mois et créneau, tirage 0..1000 ; au-delà de la dernière entrée, aucun insecte.
//    Six créneaux : 23h-4h, 4h-8h, 8h-16h, 16h-17h, 17h-19h, 19h-23h (le tableur fusionne ceux qui sont identiques).
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { DOSSIER_DATA, DOSSIER_SOURCES, ecrireJson } = require('./lib/outils');

const FICHIER = path.join(DOSSIER_SOURCES, 'spawn', 'cf.xlsx');
const MOIS_EN = { jan: 'janvier', feb: 'fevrier', mar: 'mars', apr: 'avril', may: 'mai', jun: 'juin', jul: 'juillet', aug: 'aout', sep: 'septembre', oct: 'octobre', nov: 'novembre', dec: 'decembre' };
const TIRAGE_CONNECTE = 95;
const CRENEAUX_INSECTES = [[23, 4], [4, 8], [8, 16], [16, 17], [17, 19], [19, 23]];
const DECHETS = { 'empty can (trash)': 'Déchet (canette)', 'boot (trash)': 'Déchet (botte)', 'old tire (trash)': 'Déchet (pneu)' };

const arrondi = x => Math.round(x * 100) / 100;
const texteCellule = v => (v == null ? '' : typeof v === 'object' ? (v.richText ? v.richText.map(t => t.text).join('') : '') : String(v)).trim();

// « 09pm » -> 21 ; « 04am » -> 4 ; « 12am » -> 0
function heure(t) {
  const m = /^(\d{1,2})(am|pm)$/i.exec(t.trim());
  if (!m) throw new Error(`heure illisible : « ${t} »`);
  let h = Number(m[1]) % 12;
  if (m[2].toLowerCase() === 'pm') h += 12;
  return h;
}
// « 04am-09am & 04pm-09pm » -> [[4, 9], [16, 21]]
const plages = t => t.split('&').map(p => { const [a, b] = p.split('-'); return [heure(a), heure(b)]; });
const texteCreneau = pl => pl.map(([a, b]) => `${a}h-${b}h`).join(' et ');
// La plage [a, b] (heures, peut passer minuit) contient-elle tout le créneau [c, d] ?
function contient([a, b], [c, d]) {
  const heures = (x, y) => { const r = []; for (let h = x; h !== y; h = (h + 1) % 24) r.push(h); return r; };
  const dedans = new Set(heures(a, b));
  return heures(c, d).every(h => dedans.has(h));
}

// En-tête de colonne : « Aug 1-14\n09pm-04am » -> { mois, quinzaine, plages }
function lireEntete(t) {
  const m = /^([A-Za-z]{3})(?:\s+(\d+)-(\d+))?\s+(.+)$/s.exec(String(t).replace(/\s+/g, ' ').trim());
  if (!m || !MOIS_EN[m[1].toLowerCase()]) return null;
  const quinzaine = m[2] ? `${m[2]}-${Number(m[3]) >= 28 ? 'fin' : m[3]}` : null;
  return { mois: MOIS_EN[m[1].toLowerCase()], quinzaine, plages: plages(m[4]) };
}

// Bornes cumulées d'une case de poisson : « (MIN(18,…)-MIN(0,…))/… » -> [0, 18]
function bornes(cell) {
  const f = cell.formula;
  if (!f) return null;
  const m = /MIN\((\d+),[^)]*\)\)-MIN\((\d+),/.exec(f);
  return m ? [Number(m[2]), Number(m[1])] : null;
}

function lirePoissons(ws, eau) {
  const entetes = ws.getRow(2).values;
  const tables = [];
  for (let c = 3; c < entetes.length; c++) {
    const e = lireEntete(entetes[c]);
    if (!e) continue;
    const table = [];
    for (let r = 3; r <= ws.rowCount; r++) {
      const nom = texteCellule(ws.getCell(r, 1).value);
      if (!nom) continue;
      const b = bornes(ws.getCell(r, c));
      if (!b) continue;
      const [bas, haut] = b;
      const connecte = (Math.min(haut, TIRAGE_CONNECTE) - Math.min(bas, TIRAGE_CONNECTE)) / TIRAGE_CONNECTE * 100;
      table.push({ espece: DECHETS[nom.toLowerCase()] || nom, zone: texteCellule(ws.getCell(r, 2).value), pourcent: haut - bas, pourcent_connecte: arrondi(connecte), borne: haut });
    }
    if (!table.length) continue;
    // Contrôle : la dernière borne vaut 100 (liste complète).
    table.sort((a, b) => a.borne - b.borne);
    const fin = table[table.length - 1].borne;
    if (fin !== 100) throw new Error(`${ws.name}, colonne ${c} : la liste finit à ${fin} au lieu de 100`);
    tables.push({ mois: e.mois, ...(e.quinzaine ? { quinzaine: e.quinzaine } : {}), eau, creneau: texteCreneau(e.plages), table: table.map(({ borne, ...x }) => x) });
  }
  return tables;
}

// Part d'une case d'insecte, calculée depuis sa formule (l'export ne garde pas toujours le résultat quand il vaut 0) :
// « (120-0)/$B$1 » -> 0,12 ; « ($B$1-930)/$B$1 » (aucun insecte) -> 0,07.
function partInsecte(cell, total) {
  const f = cell.formula || '';
  let m = /\((\d+)-(\d+)\)\/\$B\$1/.exec(f);
  if (m) return (Number(m[1]) - Number(m[2])) / total;
  m = /\(\$B\$1-(\d+)\)\/\$B\$1/.exec(f);
  if (m) return (total - Number(m[1])) / total;
  const v = cell.value;
  return typeof v === 'number' ? v : v && typeof v.result === 'number' ? v.result : null;
}

function lireInsectes(ws) {
  const entetes = ws.getRow(2).values;
  const total = Number(ws.getCell(1, 2).value) || 1000;
  const tables = [];
  for (let c = 2; c < entetes.length; c++) {
    const e = lireEntete(entetes[c]);
    if (!e) continue;
    const table = [];
    let rien = null;
    for (let r = 3; r <= ws.rowCount; r++) {
      const nom = texteCellule(ws.getCell(r, 1).value);
      const p = partInsecte(ws.getCell(r, c), total);
      if (!nom || p == null) continue;
      if (nom.toLowerCase() === 'no insect') rien = arrondi(p * 100);
      else if (p > 0) table.push({ espece: nom, pourcent: arrondi(p * 100) });
    }
    // Une colonne peut couvrir plusieurs des six créneaux du jeu (le tableur fusionne ceux qui sont identiques).
    const couverts = CRENEAUX_INSECTES.filter(cr => e.plages.some(pl => contient(pl, cr)));
    if (!couverts.length) throw new Error(`Insectes : colonne « ${entetes[c]} » ne correspond à aucun créneau`);
    for (const cr of couverts) tables.push({ mois: e.mois, creneau: texteCreneau([cr]), table, pourcent_rien: rien });
  }
  for (const mois of Object.values(MOIS_EN)) {
    const n = tables.filter(t => t.mois === mois).length;
    if (n !== CRENEAUX_INSECTES.length) throw new Error(`Insectes : ${mois} a ${n} créneaux au lieu de ${CRENEAUX_INSECTES.length}`);
  }
  return { tables, total };
}

async function principal() {
  if (!fs.existsSync(FICHIER)) { console.error(`Tableur introuvable : ${FICHIER} (lancer npm run donnees:cf)`); process.exit(1); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FICHIER);
  const poissons = [...lirePoissons(wb.getWorksheet('River'), 'riviere'), ...lirePoissons(wb.getWorksheet('Sea'), 'mer')];
  const { tables: insectes, total } = lireInsectes(wb.getWorksheet('Insects'));
  const sortie = {
    jeu: "Animal Crossing: Let's Go to the City / City Folk (Wii)",
    source: 'cf-decomp (Cuyler), src/dol/game/d_fish_info.cpp + d_insect_info.cpp, via le tableur « City Folk spawn rates » de la communauté',
    notes: [
      'Poissons : tirage 0..100 sur une liste cumulée ; les 3 dernières entrées sont des déchets (canette, botte, pneu).',
      `Poissons : connecté à une autre ville, le tirage se fait sur 0..${TIRAGE_CONNECTE} (pourcent_connecte).`,
      'Poissons : août et septembre changent de liste le 15 ; les autres mois ont une seule liste.',
      `Insectes : tirage 0..${total} ; au-delà de la dernière entrée, aucun insecte n'apparaît (pourcent_rien).`,
      "Insectes : l'abeille, la fourmi et la mouche ne sont pas dans les listes (ruche, objets au sol).",
    ],
    poissons,
    insectes,
  };
  const fichier = ecrireJson('rarete/rarete_animal_crossing_cf.json', sortie);
  console.log(`${poissons.length} tables de poissons, ${insectes.length} tables d'insectes -> ${path.relative(process.cwd(), fichier)}`);

  // Bloc « cf » de correspondances.json (ajouté une seule fois ; ensuite, il se modifie à la main).
  const fCorr = path.join(DOSSIER_DATA, 'rarete', 'correspondances.json');
  const corr = JSON.parse(fs.readFileSync(fCorr, 'utf8'));
  if (!corr.cf) {
    const simple = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const bloc = { fichier: 'rarete_animal_crossing_cf.json', poissons: {}, insectes: {}, ignorer: { poissons: Object.values(DECHETS), insectes: [] } };
    const manquants = [];
    for (const cat of ['poissons', 'insectes']) {
      const dex = new Map(JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, 'cf', `${cat}.json`), 'utf8')).map(e => [simple(e.nom.en), e.id]));
      const noms = new Set(sortie[cat].flatMap(t => t.table.map(e => e.espece)));
      for (const n of [...noms].sort()) {
        if (bloc.ignorer[cat].includes(n)) continue;
        const id = dex.get(simple(n));
        if (id) bloc[cat][n] = id; else manquants.push(`${cat} : ${n}`);
      }
    }
    corr.cf = bloc;
    fs.writeFileSync(fCorr, `${JSON.stringify(corr, null, 2)}\n`);
    console.log(`Bloc « cf » ajouté à correspondances.json${manquants.length ? ` — à relier à la main : ${manquants.join(', ')}` : ' (tout est relié)'}`);
  }
}

if (require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { lireEntete, plages, contient };
