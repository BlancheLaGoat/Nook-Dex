// Lecture des tableurs Excel (.xlsx) téléchargés depuis Google Sheets.
// Chaque onglet devient une liste d'objets { "Nom de colonne": valeur }.
// Les cellules "NA" deviennent null, et les formules =IMAGE("url") deviennent l'url.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

function valeurCellule(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v.formula) {
      const m = /IMAGE\("([^"]+)"/i.exec(v.formula);
      if (m) return m[1];
      return v.result ?? null;
    }
    if (v.sharedFormula !== undefined || v.result !== undefined) return v.result ?? null;
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text !== undefined) return v.text;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.error) return null;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    return s === '' || s === 'NA' ? null : s;
  }
  return v;
}

// Lit un classeur entier et renvoie { nomOnglet: [lignes] }.
async function lireClasseur(fichier, onglets = null) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fichier);
  const res = {};
  wb.eachSheet(ws => {
    if (onglets && !onglets.includes(ws.name)) return;
    // La ligne d'en-têtes n'est pas toujours la première (certains onglets ont un titre au-dessus).
    let ligneEntetes = 1;
    for (let r = 1; r <= Math.min(4, ws.rowCount); r++) {
      const vals = ws.getRow(r).values.map(h => String(valeurCellule(h) ?? '').trim());
      if (vals.some(v => v === 'Name' || v === '#' || v.startsWith('Name ('))) { ligneEntetes = r; break; }
    }
    const entetes = ws.getRow(ligneEntetes).values.map(h => (h == null ? null : String(valeurCellule(h) ?? '').trim()));
    const lignes = [];
    ws.eachRow((row, n) => {
      if (n <= ligneEntetes) return;
      const o = {};
      let vide = true;
      entetes.forEach((h, i) => {
        if (!h) return;
        const val = valeurCellule(row.getCell(i).value);
        if (val !== null) vide = false;
        o[h] = val;
      });
      if (!vide) lignes.push(o);
    });
    res[ws.name] = lignes;
  });
  return res;
}

// Même chose, mais garde un cache JSON à côté du .xlsx (la lecture Excel est lente).
async function lireClasseurAvecCache(fichier) {
  const cache = fichier.replace(/\.xlsx$/, '.json');
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs >= fs.statSync(fichier).mtimeMs) {
    return JSON.parse(fs.readFileSync(cache, 'utf8'));
  }
  const res = await lireClasseur(fichier);
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(res));
  return res;
}

module.exports = { lireClasseur, lireClasseurAvecCache, valeurCellule };
