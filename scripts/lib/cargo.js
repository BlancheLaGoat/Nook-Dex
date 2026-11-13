// Téléchargement des tables « Cargo » de Nookipedia (données structurées du wiki).
// Les résultats sont gardés dans sources/cargo/<table>.json pour ne pas réinterroger le wiki à chaque fois.
//
// Nookipedia demande d'être cité comme source : c'est fait dans data/<jeu>/_infos.json et dans l'appli.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { DOSSIER_SOURCES } = require('./outils');

const API = 'https://nookipedia.com/w/api.php';
const PAR_PAGE = 500;

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'NookDex-scripts (collection tracker; fan project)' } }, res => {
      let s = '';
      res.setEncoding('utf8');
      res.on('data', d => { s += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
        try { resolve(JSON.parse(s)); } catch (e) { reject(new Error(`Réponse illisible pour ${url}`)); }
      });
    }).on('error', reject);
  });
}

const pause = ms => new Promise(r => setTimeout(r, ms));

// Les noms de champs reviennent avec des espaces ("m9 1") : on remet des "_" ("m9_1").
function normaliser(ligne) {
  const o = {};
  for (const [k, v] of Object.entries(ligne)) {
    const val = typeof v === 'string' ? v.replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim() : v;
    o[k.replace(/ /g, '_')] = val === '' ? null : val;
  }
  return o;
}

async function champsDe(table) {
  const j = await getJson(`${API}?action=cargofields&table=${encodeURIComponent(table)}&format=json`);
  if (!j.cargofields) throw new Error(`Table Cargo inconnue : ${table}`);
  return Object.keys(j.cargofields);
}

// Récupère toutes les lignes d'une table (tous les champs), avec cache.
async function tableCargo(table, { maj = false } = {}) {
  const cache = path.join(DOSSIER_SOURCES, 'cargo', `${table}.json`);
  if (!maj && fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const champs = await champsDe(table);
  const lignes = [];
  for (let decalage = 0; ; decalage += PAR_PAGE) {
    const params = new URLSearchParams({
      action: 'cargoquery', format: 'json', tables: table,
      fields: champs.join(','), limit: String(PAR_PAGE), offset: String(decalage),
    });
    const j = await getJson(`${API}?${params}`);
    if (j.error) throw new Error(`Cargo ${table} : ${j.error.info}`);
    const page = (j.cargoquery || []).map(x => normaliser(x.title));
    lignes.push(...page);
    if (page.length < PAR_PAGE) break;
    await pause(400); // on reste poli avec le serveur du wiki
  }
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify(lignes));
  console.log(`  Nookipedia ${table} : ${lignes.length} lignes`);
  return lignes;
}

module.exports = { tableCargo };
