// Bibliothèque des modèles d'acres de Wild World, tirée du tableur japonais « 金ジョウロ用おい森マッピングシート ».
//
// Lit, sans le modifier : sources/arrosoir/arrosoir_or_ww.xlsx
// Écrit data/arrosoir/modeles.json, utilisé par l'outil « Ville parfaite et arrosoir en or ».
//
// Lancer avec : npm run donnees:arrosoir
//
// Dans le tableur, chaque onglet (sauf la carte complète et sa copie de secours) est une bibliothèque
// de modèles : un identifiant d'acre (« 1A », « 4B »…) au-dessus d'un bloc de 16 × 16 cases.
// Le terrain est codé par la COULEUR DE FOND des cases, les objets par leur texte :
//   木 arbre, 果 arbre fruitier, 看 emplacement de panneau (maison possible),
//   fleurs = couleur (ｱ rouge, ｷ jaune, ｼ blanc) + type (ﾛ ou ﾊﾞ rose, ｺ cosmos, ﾝ pensée, ﾁ tulipe).
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { DOSSIER_SOURCES, ecrireJson } = require('./lib/outils');

const FICHIER = path.join(DOSSIER_SOURCES, 'arrosoir', 'arrosoir_or_ww.xlsx');
const TAILLE = 16;

// Couleur de fond -> terrain (une lettre par case). Les modèles utilisent parfois les couleurs du thème
// Excel (th5 = orange des bâtiments, th6 = gris des rochers) au lieu des couleurs exactes de la légende.
const TERRAINS = {
  FFED7D31: 'B', th5: 'B',          // 建物 bâtiment
  FFF7CAAC: 'C', FFF8CBAD: 'C',     // 建物のコア cœur du bâtiment (les panneaux 看 ont aussi cette couleur)
  FFD6DCE4: '=',                    // 石畳 pavés
  FFA5A5A5: 'R', th6: 'R',          // 岩/橋 rocher ou pont
  FF7F7F7F: 'R',                    // gris foncé (4 cases, onglets rivière) : traité comme rocher
  FF66FFFF: '~',                    // 水 eau
  FF33CCCC: 's',                    // 波打ち際 rivage
  FF0000FF: 'H',                    // maison d'habitant (couleur absente de la légende)
  FFA4C2F4: 'h',                    // porte de la maison (couleur absente de la légende)
};
// Couleurs « de fond d'objet » : la case est de l'herbe, l'objet est dans le texte.
const FONDS_OBJETS = { FF92D050: 'arbre', FFFF99FF: 'fleur', FFFFFF00: 'arbre-conditionnel', FFFFFFFF: null };

const LEGENDE = {
  '.': { fr: 'Herbe', couleur: '#cfe8b4' },
  B: { fr: 'Bâtiment', couleur: '#ed7d31' },
  C: { fr: 'Cœur du bâtiment', couleur: '#f7caac' },
  '=': { fr: 'Pavés', couleur: '#d6dce4' },
  R: { fr: 'Rocher ou pont', couleur: '#a5a5a5' },
  '~': { fr: 'Eau', couleur: '#66ffff' },
  s: { fr: 'Rivage', couleur: '#33cccc' },
  H: { fr: "Maison d'habitant", couleur: '#3b6fd6' },
  h: { fr: 'Porte de la maison', couleur: '#a4c2f4' },
};

const COULEURS_FLEURS = { 'ｱ': 'rouge', 'ｷ': 'jaune', 'ｼ': 'blanc' };
const TYPES_FLEURS = { 'ﾛ': 'rose', 'ﾊﾞ': 'rose', 'ｺ': 'cosmos', 'ﾝ': 'pensee', 'ﾁ': 'tulipe' };

// Onglets : nom japonais -> description française (l'ordre est celui du tableur).
const ONGLETS = {
  '建物': { fr: 'Bâtiments', groupe: 'batiments' },
  '草原': { fr: 'Prairie', groupe: 'prairie' },
  '滝・池': { fr: 'Cascade et étang', groupe: 'cascade-etang' },
  '海（橋あり）': { fr: 'Mer, avec pont', groupe: 'mer' },
  '海（橋なし住０）': { fr: 'Mer, sans pont, 0 maison', groupe: 'mer' },
  '海（橋なし住１）': { fr: 'Mer, sans pont, 1 maison', groupe: 'mer' },
  '川（橋あり住０）': { fr: 'Rivière, avec pont, 0 maison', groupe: 'riviere' },
  '川（橋あり住１）': { fr: 'Rivière, avec pont, 1 maison', groupe: 'riviere' },
  '川（橋なし住０）': { fr: 'Rivière, sans pont, 0 maison', groupe: 'riviere' },
  '川（橋なし住１左）': { fr: 'Rivière, sans pont, 1 maison à gauche', groupe: 'riviere' },
  '川（橋なし住１右）': { fr: 'Rivière, sans pont, 1 maison à droite', groupe: 'riviere' },
  '川（橋なし住２）': { fr: 'Rivière, sans pont, 2 maisons', groupe: 'riviere' },
  '川分岐（住０）': { fr: 'Bifurcation de rivière, 0 maison', groupe: 'bifurcation' },
  '川分岐（住１）': { fr: 'Bifurcation de rivière, 1 maison', groupe: 'bifurcation' },
};
const ETIQUETTES = {
  '関所': 'Portail', '自宅': 'Maison du joueur', '博物館': 'Musée', '店': 'Magasin', '役場': 'Mairie',
  '民家なし': 'aucune maison construite', '左のみ': 'maison à gauche seulement', '右のみ': 'maison à droite seulement', '両方': 'maisons des deux côtés',
  '滝': 'Cascade', '池': 'Étang', '川なし': 'sans rivière',
};
const traduireEtiquette = t => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (ETIQUETTES[s]) return ETIQUETTES[s];
  // « 池　┃型 » -> « Étang, forme ┃ » ; « ┗型 » -> « forme ┗ »
  const m = /^(\S*?)\s*([┃━┗┓┛┏┣┳┻┫])型$/.exec(s);
  if (m) return `${m[1] ? `${ETIQUETTES[m[1]] || m[1]}, ` : ''}forme ${m[2]}`;
  return s;
};

const texte = v => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('').trim();
    if (v.result !== undefined) return v.result == null ? '' : String(v.result).trim();
    return '';
  }
  return String(v).trim();
};
const couleur = cell => {
  const f = cell.fill && cell.fill.fgColor;
  if (!f) return null;
  return f.argb || (f.theme != null ? `th${f.theme}` : null);
};

// Identifiant d'acre : 1 ou 2 chiffres hexadécimaux, lu comme du TEXTE (Excel a transformé « 14 » en nombre 14).
function lireIdentifiant(v) {
  if (v == null || typeof v === 'object') return null;
  const t = typeof v === 'number' ? String(Math.round(v)) : String(v).trim();
  return /^[0-9A-Fa-f]{1,2}$/.test(t) ? t.toUpperCase() : null;
}

// Une case : terrain (lettre) + objet éventuel.
function lireCase(cell, inconnus) {
  const c = couleur(cell);
  const t = texte(cell.value);
  let terrain = '.';
  let objet = null;
  if (c && TERRAINS[c]) terrain = TERRAINS[c];
  else if (c && !(c in FONDS_OBJETS)) inconnus.add(c);
  const conditionnel = c === 'FFFFFF00';
  if (t === '木') objet = { o: conditionnel ? 'arbre-conditionnel' : 'arbre' };
  else if (t === '果') objet = { o: conditionnel ? 'fruitier-conditionnel' : 'fruitier' };
  else if (t === '看') { objet = { o: 'panneau' }; terrain = '.'; }
  else if (t) {
    const coul = COULEURS_FLEURS[t[0]];
    const type = TYPES_FLEURS[t.slice(1)];
    if (coul && type) objet = { o: 'fleur', couleur: coul, type };
    else inconnus.add(`texte « ${t} »`);
  }
  return { terrain, objet };
}

async function principal() {
  if (!fs.existsSync(FICHIER)) {
    console.error(`Tableur introuvable : ${path.relative(process.cwd(), FICHIER)}`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FICHIER);
  const modeles = [];
  const inconnus = new Set();
  const ongletsIgnores = [];

  wb.eachSheet(ws => {
    const nomOnglet = ws.name.trim();
    const infos = ONGLETS[nomOnglet];
    if (!infos) { ongletsIgnores.push(ws.name); return; }
    for (let r = 1; r <= ws.rowCount; r++) {
      for (let c = 2; c <= ws.columnCount; c++) {
        const id = lireIdentifiant(ws.getCell(r, c).value);
        if (!id) continue;
        // Le bloc de 16 × 16 commence une ligne plus bas et une colonne plus à gauche que l'identifiant.
        const ligne0 = r + 1, col0 = c - 1;
        const terrain = [];
        const objets = [];
        for (let y = 0; y < TAILLE; y++) {
          let rangee = '';
          for (let x = 0; x < TAILLE; x++) {
            const k = lireCase(ws.getCell(ligne0 + y, col0 + x), inconnus);
            rangee += k.terrain;
            if (k.objet) objets.push({ x, y, ...k.objet });
          }
          terrain.push(rangee);
        }
        const etiquetteJp = texte(ws.getCell(ligne0, 1).value) || texte(ws.getCell(ligne0 + 1, 1).value);
        modeles.push({
          cle: `${nomOnglet}|${id}|${ws.getCell(r, c).address}`,
          onglet: nomOnglet, onglet_fr: infos.fr, groupe: infos.groupe,
          id, etiquette: etiquetteJp, etiquette_fr: traduireEtiquette(etiquetteJp),
          terrain, objets,
        });
      }
    }
  });

  const parGroupe = {};
  for (const m of modeles) parGroupe[m.onglet_fr] = (parGroupe[m.onglet_fr] || 0) + 1;
  const compte = (m, o) => m.objets.filter(x => x.o.startsWith(o)).length;
  const sortie = {
    _genere: 'Fichier fabriqué par scripts/arrosoir.js à partir de sources/arrosoir/arrosoir_or_ww.xlsx : ne pas modifier à la main.',
    taille_acre: TAILLE,
    legende: LEGENDE,
    fleurs: { couleurs: { rouge: 'Rouge', jaune: 'Jaune', blanc: 'Blanc' }, types: { rose: 'Rose', cosmos: 'Cosmos', pensee: 'Pensée', tulipe: 'Tulipe' } },
    objets: {
      arbre: 'Arbre', fruitier: 'Arbre fruitier', panneau: 'Emplacement de panneau (maison possible)',
      'arbre-conditionnel': "Arbre qui ne pousse pas si une maison se construit sur l'emplacement de panneau",
      'fruitier-conditionnel': "Arbre fruitier qui ne pousse pas si une maison se construit sur l'emplacement de panneau",
      fleur: 'Fleur',
    },
    modeles,
  };
  const fichier = ecrireJson('arrosoir/modeles.json', sortie);
  console.log(`${modeles.length} modèles d'acres :`);
  for (const [g, n] of Object.entries(parGroupe)) console.log(`  ${g.padEnd(42)} ${String(n).padStart(3)}`);
  console.log(`Arbres : ${modeles.reduce((s, m) => s + compte(m, 'arbre') + compte(m, 'fruitier'), 0)}, panneaux : ${modeles.reduce((s, m) => s + compte(m, 'panneau'), 0)}, fleurs : ${modeles.reduce((s, m) => s + compte(m, 'fleur'), 0)}`);
  if (ongletsIgnores.length) console.log(`Onglets ignorés : ${ongletsIgnores.join(', ')}`);
  if (inconnus.size) console.log(`⚠ Couleurs ou textes inconnus : ${[...inconnus].join(', ')}`);
  console.log(`-> ${path.relative(process.cwd(), fichier)}`);
}

if (require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { lireIdentifiant, traduireEtiquette };
