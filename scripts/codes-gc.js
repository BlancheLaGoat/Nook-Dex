// Codes d'objets d'Animal Crossing (GameCube), tirés du tableur « ACGC Hundo Helper ».
//
// Lit, sans le modifier : sources/gc/acgc_hundo_helper.xlsx (copie du tableur de la communauté speedrun)
// Écrit data/gc/codes.json : un élément par objet du tableur, relié à sa fiche du dex quand on la trouve.
//
// Lancer avec : npm run donnees:codes
//
// Rappel : un mot de passe contient le nom du joueur et le nom de la ville pour lesquels il a été créé.
// Les codes du tableur ne marchent que pour ces noms-là (voir la suite : décodage et générateur).
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { pathToFileURL } = require('url');
const { DOSSIER_DATA, DOSSIER_SOURCES, ecrireJson } = require('./lib/outils');

const FICHIER = path.join(DOSSIER_SOURCES, 'gc', 'acgc_hundo_helper.xlsx');
// Tableur GameCube déjà téléchargé par scripts/gc.js : numéro de chaque objet dans le jeu et code universel.
const TABLEUR_GC = path.join(DOSSIER_SOURCES, 'gc', 'gc.json');
const ONGLETS_GC = {
  Furniture: 'Furniture (AC)', Wallpaper: 'Wallpaper (AC)', Carpet: 'Carpet (AC)', Clothing: 'Clothing (AC)',
  Items: 'Handheld Items (AC)', Stationery: 'Stationery (AC)', Gyroids: 'Gyroids (AC)', Music: 'Music (AC)',
};

// Catégorie du tableur -> catégorie du dex GameCube.
const CATEGORIES = {
  Furniture: { dex: 'meubles', fr: 'Meubles' },
  Wallpaper: { dex: 'papiers-peints', fr: 'Papiers peints' },
  Carpet: { dex: 'sols', fr: 'Sols' },
  Clothing: { dex: 'vetements', fr: 'Vêtements' },
  Items: { dex: 'outils', fr: 'Outils' },
  Stationery: { dex: 'papeterie', fr: 'Papeterie' },
  Gyroids: { dex: 'gyroides', fr: 'Gyroïdes' },
  Music: { dex: 'kk', fr: 'Morceaux de K.K.' },
};

// Noms du tableur écrits autrement dans le dex (nom simplifié -> nom simplifié du dex).
const ALIAS = {
  senorkk: 'kkmariachi', // « Señor K.K. » dans Animal Crossing = « K.K. Mariachi » sur Nookipedia
};

// Texte d'une cellule (formules : leur résultat ; texte riche : le texte).
function texte(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('').trim();
    if (v.result !== undefined) return v.result == null ? '' : String(v.result).trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.hyperlink) return String(v.text || v.hyperlink).trim();
    return '';
  }
  return String(v).trim();
}
const formule = v => (v && typeof v === 'object' && v.formula) || '';
const simple = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

// « a w m g E E … » (avec ou sans retour à la ligne) -> 28 caractères collés, ou null si ce n'est pas un code.
function lireCode(brut) {
  const morceaux = String(brut || '').split(/\s+/).filter(Boolean);
  if (morceaux.length !== 28 || morceaux.some(m => [...m].length !== 1)) return null;
  return morceaux.join('');
}

// Plages de chaque catégorie, lues dans les formules de la ligne 2 : « =countif(E3:J603,TRUE) ».
function plagesCategories(ws) {
  const plages = [];
  ws.getRow(1).eachCell((cell, col) => {
    const nom = texte(cell.value);
    if (!CATEGORIES[nom]) return;
    const m = /([A-Z]+)(\d+):([A-Z]+)(\d+)/i.exec(formule(ws.getCell(2, col).value));
    if (m) plages.push({ nom, de: Number(m[2]), a: Number(m[4]), total_tableur: Number(texte(ws.getCell(2, col).value)) || 0 });
  });
  return plages;
}

// Onglets REQUIRED_Codes / ADDITIONAL_Codes : deux blocs par ligne (gauche A-G, droite I-M) et des titres de section.
function lireListe(ws, nomListe) {
  const BLOCS = [
    { bloc: 'gauche', nom: 1, coche: 3, code: 4, info: 7 },
    { bloc: 'droite', nom: 9, coche: 11, code: 12, info: 13 },
  ];
  const titresBlocs = { gauche: texte(ws.getCell(1, 4).value), droite: texte(ws.getCell(1, 12).value) };
  const parCase = new Map(); // "C176" -> infos
  for (const b of BLOCS) {
    let section = null;
    for (let r = 2; r <= ws.rowCount; r++) {
      const nom = texte(ws.getCell(r, b.nom).value);
      if (!nom) continue;
      const code = texte(ws.getCell(r, b.code).value);
      // Titre de section : le même texte dans le nom et dans le code (« AUTUMN CLOTHING »).
      if (nom === code || (!code && nom === nom.toUpperCase() && /[A-Z]/.test(nom))) { section = nom; continue; }
      parCase.set(ws.getCell(r, b.coche).address, {
        liste: nomListe, bloc: b.bloc, titre_bloc: titresBlocs[b.bloc] || null, section, nom,
        code: lireCode(code), info: texte(ws.getCell(r, b.info).value) || null,
      });
    }
  }
  return parCase;
}

async function principal() {
  if (!fs.existsSync(FICHIER)) {
    console.error(`Tableur introuvable : ${path.relative(process.cwd(), FICHIER)}`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FICHIER);
  const ws = wb.getWorksheet('TRACKER');
  const listes = new Map([
    ['REQUIRED_Codes', lireListe(wb.getWorksheet('REQUIRED_Codes'), 'REQUIRED')],
    ['ADDITIONAL_Codes', lireListe(wb.getWorksheet('ADDITIONAL_Codes'), 'ADDITIONAL')],
  ]);

  // Objets « obtenus par défaut » (onglet Default : deux colonnes de noms).
  const defaut = new Set();
  const wd = wb.getWorksheet('Default');
  for (let r = 1; r <= wd.rowCount; r++) for (const c of [1, 6]) { const n = texte(wd.getCell(r, c).value); if (n) defaut.add(simple(n)); }

  // Fiches du dex, par catégorie et par nom anglais simplifié.
  const dex = {};
  for (const { dex: cat } of Object.values(CATEGORIES)) {
    const liste = JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, 'gc', `${cat}.json`), 'utf8'));
    dex[cat] = new Map(liste.map(e => [simple(e.nom.en), e]));
  }
  const trouverFiche = (cat, nom) => {
    const cle = ALIAS[simple(nom)] || simple(nom);
    const e = dex[cat].get(cle);
    if (e) return { categorie: cat, id: e.id, nom_fr: e.nom.fr };
    for (const [autre, m] of Object.entries(dex)) if (m.has(cle)) return { categorie: autre, id: m.get(cle).id, nom_fr: m.get(cle).nom.fr };
    return null;
  };

  // Numéros des objets (« ID (AC) », en hexadécimal) et codes universels, par catégorie et nom anglais.
  const numeros = {};
  if (fs.existsSync(TABLEUR_GC)) {
    const gc = JSON.parse(fs.readFileSync(TABLEUR_GC, 'utf8'));
    for (const [cat, onglet] of Object.entries(ONGLETS_GC)) {
      numeros[cat] = new Map((gc[onglet] || []).map(x => [simple(x['Name (English)']), {
        numero: x['ID (AC)'] ? String(x['ID (AC)']).toUpperCase() : null,
        universel: lireCode([...String(x['Universal Code (AC)'] || '')].join(' ')),
      }]));
    }
  } else console.log("⚠ sources/gc/gc.json absent (lancer npm run donnees:gc) : pas de numéros d'objets.");

  const { decoder } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'motdepasse-gc.js')).href);
  const numerosCorriges = [];
  const plages = plagesCategories(ws);
  const objets = [];
  const sansFiche = [];
  const sansCode = [];
  for (const p of plages) {
    for (let r = p.de; r <= p.a; r++) {
      const n = texte(ws.getCell(r, 1).value);
      const nom = texte(ws.getCell(r, 2).value);
      if (!nom || !/^\d+$/.test(n)) continue;
      const brut = texte(ws.getCell(r, 6).value);
      const code = lireCode(brut);
      const o = { n, nom_en: nom, categorie: p.nom, ligne_tableur: r, provenance: texte(ws.getCell(r, 4).value) || null, code };
      if (!code) { o.sans_code = brut || 'vide'; sansCode.push(`${nom} (${brut || 'vide'})`); }
      // Les deux colonnes « 1st Line Value » du tableur ; une seule fois si elles sont identiques (« Y2 » et non « Y2 / Y2 »).
      const l1 = [...new Set([texte(ws.getCell(r, 7).value), texte(ws.getCell(r, 8).value)].filter(x => x && x !== 'N/A'))];
      if (l1.length) o.premiere_ligne = l1;
      const info = texte(ws.getCell(r, 9).value);
      if (info && info !== 'N/A') o.info = info;
      // Lien vers l'onglet de codes : « =REQUIRED_Codes!K62 » en colonne J (case à cocher de cet objet).
      const lien = /^(\w+)!\$?([A-Z]+)\$?(\d+)$/.exec(formule(ws.getCell(r, 10).value));
      if (lien && listes.has(lien[1])) {
        const x = listes.get(lien[1]).get(`${lien[2]}${lien[3]}`);
        if (x) {
          o.liste = { nom: x.liste, bloc: x.bloc, section: x.section, titre_bloc: x.titre_bloc };
          if (x.code && x.code !== code) o.code_liste = x.code;
          if (x.info && x.info !== 'N/A' && x.info !== o.info) o.liste.info = x.info;
        }
      }
      if (defaut.has(simple(nom))) o.defaut = true;
      const num = numeros[p.nom] && numeros[p.nom].get(simple(nom));
      if (num && num.numero) o.numero = num.numero;
      if (num && num.universel) {
        o.code_universel = num.universel;
        // Le code universel est un vrai code qui marche : s'il désigne un autre objet que le numéro du tableur,
        // c'est le numéro du tableur qui est faux (cas des outils en or : 0x2239 dans le tableur, 0x251F dans le jeu).
        const d = decoder(num.universel);
        const n = o.numero ? parseInt(o.numero, 16) : null;
        const meuble = x => (x >= 0x1000 && x < 0x2000) || (x >= 0x3000 && x < 0x4000);
        if (d && d.sommeOk && n != null && d.objet !== n && !(meuble(n) && (d.objet & ~3) === (n & ~3))) {
          o.numero_tableur_gc = o.numero;
          o.numero = d.objet.toString(16).toUpperCase();
          numerosCorriges.push(`${nom} : ${o.numero_tableur_gc} -> ${o.numero}`);
        }
      }
      const fiche = trouverFiche(CATEGORIES[p.nom].dex, nom);
      if (fiche) o.fiche = fiche;
      else sansFiche.push(`${p.nom} : ${nom}`);
      objets.push(o);
    }
  }

  const resources = wb.getWorksheet('Resources');
  const credits = [];
  for (let r = 1; r <= resources.rowCount; r++) {
    const c = resources.getCell(r, 1);
    const t = texte(c.value);
    const lienCredit = (c.value && c.value.hyperlink) || c.hyperlink || null;
    if (t) credits.push(lienCredit ? { texte: t, lien: lienCredit } : { texte: t });
  }
  const log = wb.getWorksheet('update log');
  const version = texte(log.getCell(log.actualRowCount, 1).value) || null;

  const sortie = {
    _genere: 'Fichier fabriqué par scripts/codes-gc.js à partir de sources/gc/acgc_hundo_helper.xlsx : ne pas modifier à la main.',
    source: { nom: 'ACGC Hundo Helper', version },
    credits_courts: [
      'Cuyler : programme de génération des codes rapides',
      'BrianMp16 : route 100 % et nouveaux codes rapides',
    ],
    credits,
    categories: Object.fromEntries(plages.map(p => [p.nom, {
      dex: CATEGORIES[p.nom].dex, fr: CATEGORIES[p.nom].fr,
      objets: objets.filter(o => o.categorie === p.nom).length,
      total_tableur: p.total_tableur,
    }])),
    objets,
  };
  const fichier = ecrireJson('gc/codes.json', sortie);

  console.log(`${objets.length} objets, ${objets.filter(o => o.code).length} avec un code, ${objets.filter(o => o.fiche).length} reliés à une fiche du dex, ${objets.filter(o => o.numero).length} avec leur numéro dans le jeu.`);
  for (const c of Object.values(sortie.categories)) console.log(`  ${c.fr.padEnd(18)} ${String(c.objets).padStart(4)} objets`);
  console.log(`Listes : ${objets.filter(o => o.liste && o.liste.nom === 'REQUIRED').length} REQUIRED, ${objets.filter(o => o.liste && o.liste.nom === 'ADDITIONAL').length} ADDITIONAL, ${objets.filter(o => !o.liste).length} sans liste ; ${objets.filter(o => o.defaut).length} par défaut.`);
  if (numerosCorriges.length) console.log(`Numéros corrigés d'après le code universel (${numerosCorriges.length}) : ${numerosCorriges.join(', ')}`);
  if (sansCode.length) console.log(`Sans code (${sansCode.length}) : ${sansCode.join(', ')}`);
  if (sansFiche.length) console.log(`Pas de fiche trouvée dans le dex (${sansFiche.length}) :\n  - ${sansFiche.join('\n  - ')}`);
  console.log(`-> ${path.relative(process.cwd(), fichier)}`);
}

if (require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { lireCode, simple };
