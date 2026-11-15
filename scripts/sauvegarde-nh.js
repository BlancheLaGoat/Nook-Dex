// Correspondance entre les numéros internes de New Horizons et les fiches du dex.
//
// Source : le tableur communautaire « Data Spreadsheet for Animal Crossing New Horizons » (colonnes « Internal ID »),
// déjà téléchargé par scripts/nh.js (sources/sheet/). Les identifiants des fiches suivent la même règle que nh.js :
// nom anglais simplifié, ou nom + numéro interne quand deux objets d'une catégorie portent le même nom.
//
// Dans la sauvegarde (voir src/renderer/lib/sauvegarde-nh.js) :
//  - les objets déjà obtenus par un joueur sont un bit par numéro d'objet (créatures comprises) ;
//  - les recettes connues sont un bit par numéro de recette ;
//  - le musée est une liste de numéros d'objets.
//
// Écrit data/nh/sauvegarde.json. Lancer avec : npm run donnees:sauvegarde-nh (après npm run donnees:nh)
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, DOSSIER_SOURCES, slug, ecrireJson } = require('./lib/outils');

const FICHIER_TABLEUR = path.join(DOSSIER_SOURCES, 'sheet', 'acnh.json');
const lire = f => JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, f), 'utf8'));

// Onglets du tableur -> catégorie du dex (comme dans nh.js).
const ONGLETS = {
  insectes: ['Insects'], poissons: ['Fish'], 'creatures-marines': ['Sea Creatures'], fossiles: ['Fossils'], art: ['Artwork'],
  meubles: ['Housewares', 'Miscellaneous', 'Wall-mounted', 'Ceiling Decor', 'Interior Structures'],
  'papiers-peints': ['Wallpaper'], sols: ['Floors'], tapis: ['Rugs'],
  vetements: ['Tops', 'Bottoms', 'Dress-Up', 'Headwear', 'Accessories', 'Socks', 'Shoes', 'Bags', 'Umbrellas', 'Clothing Other'],
  kk: ['Music'], gyroides: ['Gyroids'], photos: ['Photos'], posters: ['Posters'], fleurs: ['Plants'],
  outils: ['ToolsGoods'], clotures: ['Fencing'],
};
const MUSEE = ['insectes', 'poissons', 'creatures-marines', 'fossiles', 'art'];

function principal() {
  if (!fs.existsSync(FICHIER_TABLEUR)) { console.error('Tableur absent : lance d\'abord « npm run donnees:nh ».'); process.exit(1); }
  const brut = JSON.parse(fs.readFileSync(FICHIER_TABLEUR, 'utf8'));
  const t = brut.onglets || brut;
  const erreurs = [];
  const objets = [];
  const vus = new Map();

  for (const [cat, onglets] of Object.entries(ONGLETS)) {
    const fiches = new Set(lire(`nh/${cat}.json`).map(e => e.id));
    let relies = 0;
    for (const onglet of onglets) {
      const lignes = (t[onglet] || []).filter(l => cat !== 'art' || l.Genuine === 'Yes'); // un faux ne compte pas
      if (!lignes.length) { erreurs.push(`onglet « ${onglet} » vide ou absent`); continue; }
      const premier = new Map();
      for (const l of lignes) if (!premier.has(l.Name)) premier.set(l.Name, l);
      for (const l of lignes) {
        const n = Number(l['Internal ID']);
        if (!Number.isInteger(n) || n < 0) continue;
        const p = premier.get(l.Name);
        const suffixe = p['Internal ID'] ?? p['Clothing Group ID'];
        const id = [`${slug(l.Name)}-${suffixe}`, slug(l.Name)].find(x => fiches.has(x));
        if (!id) continue; // ligne écartée par nh.js (musique d'événement, plante qui n'est pas une fleur…)
        if (vus.has(n) && vus.get(n) !== `${cat}:${id}`) { erreurs.push(`numéro ${n} relié à ${vus.get(n)} et à ${cat}:${id}`); continue; }
        if (vus.has(n)) continue;
        vus.set(n, `${cat}:${id}`);
        objets.push([n, cat, id]);
        relies++;
      }
    }
    if (MUSEE.includes(cat) && relies < fiches.size) erreurs.push(`${cat} : ${fiches.size - relies} fiche(s) du musée sans numéro`);
  }
  objets.sort((a, b) => a[0] - b[0]);

  // Recettes : numéro de recette -> fiche.
  const fichesRecettes = new Set(lire('nh/recettes.json').map(e => e.id));
  const recettes = [];
  for (const l of t.Recipes || []) {
    const n = Number(l['Internal ID']);
    const id = [`${slug(l.Name)}-${l['Internal ID']}`, slug(l.Name)].find(x => fichesRecettes.has(x));
    if (Number.isInteger(n) && id) recettes.push([n, id]);
  }
  recettes.sort((a, b) => a[0] - b[0]);
  if (recettes.length < fichesRecettes.size) erreurs.push(`recettes : ${fichesRecettes.size - recettes.length} fiche(s) sans numéro`);

  if (erreurs.length) { console.error(`${erreurs.length} problème(s) :\n- ${erreurs.join('\n- ')}`); process.exit(1); }
  const f = ecrireJson('nh/sauvegarde.json', {
    _genere: 'Fichier fabriqué par scripts/sauvegarde-nh.js : ne pas modifier à la main.',
    source: 'Data Spreadsheet for Animal Crossing New Horizons (colonnes Internal ID)',
    musee: MUSEE,
    objets,
    recettes,
  });
  const parCat = objets.reduce((m, [, c]) => ({ ...m, [c]: (m[c] || 0) + 1 }), {});
  console.log(`objets : ${JSON.stringify(parCat)} ; recettes : ${recettes.length} -> ${path.relative(process.cwd(), f)}`);
}

if (require.main === module) principal();
module.exports = { ONGLETS };
