// Génétique des fleurs de New Horizons, d'après les recherches publiques d'Aeter
// (tableaux extraits du jeu : https://aiterusawato.github.io/satogu/acnh/flowers/genotypes.html et tiers.html).
// Seuls les faits du jeu sont repris (gènes -> couleur, gènes des fleurs de graines et des îles) ;
// ni les textes ni les images du guide.
//
// Lit, sans le modifier : sources/fleurs/genotypes.md et tiers.md (téléchargés s'ils manquent, ou avec --maj).
// Écrit data/nh/fleurs-genetique.json :
//   { especes: [{ id, nom, sous, genes: 3 | 4, couleurs: { "0010": "blanc", … }, graines: { blanc: "0010", … },
//                 iles: { rose: "2022", … }, fiches: { blanc: "white-rose-plant", … } }] }
// Notation des gènes (celle d'Aeter) : un chiffre par gène, dans l'ordre R (rouge), Y (jaune), W (blanc), S (roses) ;
// 0, 1 ou 2 = nombre de copies « fortes » du gène (ex. "2001" : RR yy ww Ss).
//
// Lancer avec : npm run donnees:fleurs
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, DOSSIER_SOURCES, ecrireJson, telecharger } = require('./lib/outils');

const RACINE_AETER = 'https://raw.githubusercontent.com/aiterusawato/satogu/gh-pages/acnh/flowers/';
const PAGES = ['genotypes', 'tiers'];

// Lettres du guide -> espèce de Nook Dex (« sous » = sous-catégorie de data/nh/fleurs.json ; « anglais » = nom dans le guide).
const ESPECES = {
  R: { id: 'roses', nom: 'Roses', sous: 'Roses', anglais: 'Rose', genes: 4 },
  T: { id: 'tulipes', nom: 'Tulipes', sous: 'Tulipes', anglais: 'Tulip', genes: 3 },
  P: { id: 'pensees', nom: 'Pensées', sous: 'Pensées', anglais: 'Pansy', genes: 3 },
  C: { id: 'cosmos', nom: 'Cosmos', sous: 'Cosmos', anglais: 'Cosmos', genes: 3 },
  L: { id: 'lys', nom: 'Lys', sous: 'Lys', anglais: 'Lily', genes: 3 },
  H: { id: 'jacinthes', nom: 'Jacinthes', sous: 'Jacinthes', anglais: 'Hyacinth', genes: 3 },
  W: { id: 'anemones', nom: 'Anémones', sous: 'Anémones', anglais: 'Windflower', genes: 3 },
  M: { id: 'chrysanthemes', nom: 'Chrysanthèmes', sous: 'Chrysanthèmes', anglais: 'Mum', genes: 3 },
};
// Première lettre d'une icône du guide -> couleur (français, et anglais de data/nh/fleurs.json).
const COULEURS = {
  W: ['blanc', 'white'], R: ['rouge', 'red'], Y: ['jaune', 'yellow'], P: ['rose', 'pink'], O: ['orange', 'orange'],
  L: ['violet', 'purple'], B: ['noir', 'black'], U: ['bleu', 'blue'], G: ['vert', 'green'],
};
// Colonnes du tableau des génotypes, après G1 G2 G3 : roses (G4 = 0, 1, 2) puis les 7 autres espèces.
const COLONNES = [['R', '0'], ['R', '1'], ['R', '2'], ['T'], ['P'], ['C'], ['L'], ['H'], ['W'], ['M']];

const icone = cellule => {
  const m = /!\[([A-Z])([A-Z])\]/.exec(cellule);
  if (!m) throw new Error(`cellule illisible : « ${cellule} »`);
  if (!COULEURS[m[1]]) throw new Error(`couleur inconnue : « ${m[1]} »`);
  return { couleur: m[1], espece: m[2] };
};

function lireGenotypes(md) {
  const res = Object.fromEntries(Object.keys(ESPECES).map(k => [k, {}]));
  let lignes = 0;
  for (const ligne of md.split('\n')) {
    const c = ligne.split('|').slice(1, -1).map(x => x.trim());
    if (c.length !== 13 || !/^[0-2]$/.test(c[0])) continue;
    lignes++;
    const g = c.slice(0, 3).join('');
    COLONNES.forEach(([esp, g4], i) => {
      const { couleur, espece } = icone(c[3 + i]);
      if (espece !== esp) throw new Error(`colonne ${i} : espèce « ${espece} » au lieu de « ${esp} »`);
      res[esp][g + (g4 || '')] = COULEURS[couleur][0];
    });
  }
  if (lignes !== 27) throw new Error(`tableau des génotypes : ${lignes} lignes au lieu de 27`);
  return res;
}

// Ligne « | Rose | ![WR][]![YR][]![RR][]<br />`0010` `0200` `2001` | ![PR][]…<br />`2022` `2211` | … »
function lireNiveaux(md) {
  const res = {};
  for (const ligne of md.split('\n')) {
    const c = ligne.split('|').slice(1, -1).map(x => x.trim());
    const esp = Object.keys(ESPECES).find(k => ESPECES[k].anglais === c[0]);
    if (!esp || c.length < 3) continue;
    const lire = cellule => {
      const icones = [...cellule.matchAll(/!\[([A-Z])([A-Z])\]/g)].map(m => COULEURS[m[1]][0]);
      const genes = [...cellule.matchAll(/`([0-2]+)`/g)].map(m => m[1]);
      if (icones.length !== genes.length) throw new Error(`${esp} : ${icones.length} fleurs pour ${genes.length} gènes`);
      return Object.fromEntries(icones.map((col, i) => [col, genes[i]]));
    };
    res[esp] = { graines: lire(c[1]), iles: lire(c[2]) };
  }
  for (const k of Object.keys(ESPECES)) if (!res[k]) throw new Error(`tableau des niveaux : espèce ${k} absente`);
  return res;
}

async function principal() {
  const maj = process.argv.includes('--maj');
  const textes = {};
  for (const p of PAGES) {
    const f = path.join(DOSSIER_SOURCES, 'fleurs', `${p}.md`);
    if (maj || !fs.existsSync(f)) { console.log('Téléchargement de', RACINE_AETER + p + '.md'); await telecharger(RACINE_AETER + p + '.md', f); }
    textes[p] = fs.readFileSync(f, 'utf8');
  }
  const couleurs = lireGenotypes(textes.genotypes);
  const niveaux = lireNiveaux(textes.tiers);
  const fiches = JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, 'nh', 'fleurs.json'), 'utf8'));
  const enAnglais = Object.fromEntries([...Object.values(COULEURS), ['or', 'gold']]);

  const especes = Object.entries(ESPECES).map(([k, e]) => {
    const parGenes = couleurs[k];
    const attendu = 3 ** e.genes;
    if (Object.keys(parGenes).length !== attendu) throw new Error(`${e.nom} : ${Object.keys(parGenes).length} génotypes au lieu de ${attendu}`);
    // Contrôle : les gènes des fleurs de graines et des îles donnent bien leur couleur.
    for (const [col, g] of Object.entries({ ...niveaux[k].graines, ...niveaux[k].iles })) {
      if (g.length !== e.genes) throw new Error(`${e.nom} ${col} : gènes « ${g} » (${e.genes} attendus)`);
      if (parGenes[g] !== col) throw new Error(`${e.nom} ${col} : les gènes ${g} donnent « ${parGenes[g]} »`);
    }
    // Fiche du dex de chaque couleur (pour l'image et le nom).
    const lien = {};
    for (const col of new Set([...Object.values(parGenes), ...(k === 'R' ? ['or'] : [])])) {
      const f = fiches.find(x => x.sous === e.sous && x.couleur === enAnglais[col]);
      if (!f) throw new Error(`${e.nom} ${col} : pas de fiche dans data/nh/fleurs.json`);
      lien[col] = f.id;
    }
    return { id: e.id, nom: e.nom, sous: e.sous, genes: e.genes, couleurs: parGenes, graines: niveaux[k].graines, iles: niveaux[k].iles, fiches: lien };
  });

  const sortie = {
    _genere: "Fichier fabriqué par scripts/fleurs-nh.js à partir des tableaux d'Aeter : ne pas modifier à la main.",
    source: "Recherches d'Aeter (données extraites du jeu) : https://aiterusawato.github.io/satogu/acnh/flowers/genotypes.html",
    notation: "Un chiffre par gène, dans l'ordre R, Y, W (et S pour les roses) : 0, 1 ou 2 copies du gène. Ex. 2001 = RR yy ww Ss.",
    notes: [
      "Rose dorée : pas de gènes à elle ; une rose noire arrosée avec l'arrosoir en or peut en faire pousser une.",
      'Muguet : pas de croisement (il pousse seul sur une île 5 étoiles).',
    ],
    especes,
  };
  const f = ecrireJson('nh/fleurs-genetique.json', sortie);
  console.log(`${especes.length} espèces, ${especes.reduce((s, e) => s + Object.keys(e.couleurs).length, 0)} génotypes -> ${path.relative(process.cwd(), f)}`);
}

if (require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { lireGenotypes, lireNiveaux };
