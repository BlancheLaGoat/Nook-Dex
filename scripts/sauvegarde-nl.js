// Correspondance entre les numéros de la sauvegarde de New Leaf (Welcome amiibo) et les fiches du dex.
//
// Sources (seuls les faits sont repris ; le code est écrit pour Nook Dex) :
//  - liste des objets du jeu (numéro -> nom anglais) : ACNL_Research de Slattz, Items_WA.txt,
//    téléchargée dans sources/nl/ (non envoyé sur GitHub) ;
//  - objets « débloqués » (joueur +0x6C20, 0x2E8 octets) : un bit par objet, bit n = objet 0x2000 + n
//    (catalogue et encyclopédie à la fois) : Slattz (garden_plus.dat.bt), Le0X8 (acnl-research) ;
//  - musée (0x6B300, 274 octets = qui l'a donné ; dates à 0x6AEB8) et ordre de ses parties : plugin Vapecord
//    (RedShyGuy) : fossiles 0x3130.., poissons 0x22E1.., créatures marines 0x232D.., insectes 0x228E..,
//    tableaux 0x30D2.., statues 0x30EB.., chacun dans l'ordre des numéros.
// Vérifié sur deux vraies sauvegardes (dépôt Le0X8/acnl-research).
//
// Écrit data/nl/sauvegarde.json. Lancer avec : npm run donnees:sauvegarde-nl   (--maj pour retélécharger la liste)
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, DOSSIER_SOURCES, slug, ecrireJson, telecharger } = require('./lib/outils');

const URL_OBJETS = 'https://raw.githubusercontent.com/Slattz/ACNL_Research/master/Random%20Code%20and%20Files/ACNL-ItemList/Items_WA.txt';
const FICHIER_OBJETS = path.join(DOSSIER_SOURCES, 'nl', 'slattz_items_wa.txt');

// Parties du musée, dans l'ordre de la sauvegarde : [catégorie du dex, premier numéro, nombre].
const MUSEE = [
  ['fossiles', 0x3130, 67],
  ['poissons', 0x22E1, 72],
  ['creatures-marines', 0x232D, 30],
  ['insectes', 0x228E, 72],
  ['art', 0x30D2, 25], // tableaux
  ['art', 0x30EB, 8],  // statues
];
const PREMIER_DEBLOQUE = 0x2000;
const NB_DEBLOQUES = 0x2E8 * 8;

const lire = f => JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, f), 'utf8'));

// Lit Items_WA.txt : « 228e common butterfly » (les titres de parties n'ont pas de numéro).
function lireObjets(texte) {
  const objets = [];
  for (const ligne of texte.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{4}) (.+)$/.exec(ligne.trim());
    if (m) objets.push({ n: parseInt(m[1], 16), nom: m[2].trim() });
  }
  return objets;
}

// Le nom du jeu, écrit comme dans le dex : « pic of Admiral » -> « Admiral's pic », « pachysaurus » -> « pachy ».
function nomDex(nom) {
  const photo = /^pic of (.+)$/i.exec(nom);
  if (photo) return `${photo[1]}'s pic`;
  return nom.replace(/^pachysaurus /i, 'pachy ');
}

async function principal() {
  if (process.argv.includes('--maj') || !fs.existsSync(FICHIER_OBJETS)) {
    console.log('Téléchargement de la liste des objets (Slattz)…');
    await telecharger(URL_OBJETS, FICHIER_OBJETS);
  }
  const objets = lireObjets(fs.readFileSync(FICHIER_OBJETS, 'utf8'));
  const parNumero = new Map(objets.map(o => [o.n, o]));
  const jeu = lire('jeux.json').find(j => j.id === 'nl');
  const erreurs = [];

  // Toutes les fiches du dex, par nom anglais simplifié (une fiche peut exister dans plusieurs catégories).
  const parSlug = new Map();
  const fiches = {};
  for (const c of jeu.categories) {
    fiches[c.id] = new Set();
    for (const e of lire(`nl/${c.id}.json`)) {
      fiches[c.id].add(e.id);
      const s = slug(e.nom.en);
      if (!parSlug.has(s)) parSlug.set(s, []);
      parSlug.get(s).push({ categorie: c.id, id: e.id });
    }
  }
  const trouver = (nom, categorie) => {
    const l = parSlug.get(slug(nomDex(nom))) || [];
    return categorie ? l.filter(x => x.categorie === categorie) : l;
  };

  // Musée : chaque case reliée à une fiche de la bonne catégorie.
  const musee = MUSEE.map(([categorie, premier, nb]) => ({
    categorie,
    ids: Array.from({ length: nb }, (_, i) => {
      const o = parNumero.get(premier + i);
      const f = o && trouver(o.nom, categorie)[0];
      if (!f) erreurs.push(`musée ${categorie} : objet 0x${(premier + i).toString(16)} (${o ? o.nom : '?'}) sans fiche`);
      return f ? f.id : null;
    }),
  }));

  // Objets débloqués : chaque numéro relié à sa fiche (les créatures et le musée viennent des plages ci-dessus).
  const plagesMusee = MUSEE.map(([categorie, premier, nb]) => [categorie, premier, premier + nb]);
  const categorieImposee = n => (plagesMusee.find(([, a, b]) => n >= a && n < b) || [])[0];
  const MUSEE_CATS = new Set(MUSEE.map(m => m[0]));
  const debloques = [];
  const ambigus = [];
  let sansFiche = 0;
  for (const o of objets) {
    if (o.n < PREMIER_DEBLOQUE || o.n >= PREMIER_DEBLOQUE + NB_DEBLOQUES) continue;
    const imposee = categorieImposee(o.n);
    let l = trouver(o.nom, imposee);
    if (!imposee) l = l.filter(x => !MUSEE_CATS.has(x.categorie)); // un fossile ou tableau hors plage = maquette, faux…
    if (!l.length) { sansFiche++; continue; }
    if (l.length > 1) ambigus.push(`0x${o.n.toString(16)} ${o.nom} -> ${l.map(x => x.categorie).join(', ')}`);
    for (const f of l) debloques.push({ bit: o.n - PREMIER_DEBLOQUE, ...f });
  }

  // Les fiches du musée doivent toutes exister.
  for (const { categorie, ids } of musee) for (const id of ids) if (id && !fiches[categorie].has(id)) erreurs.push(`${categorie} : ${id} absent`);
  if (erreurs.length) { console.error(`${erreurs.length} problème(s) :\n- ${erreurs.join('\n- ')}`); process.exit(1); }

  const f = ecrireJson('nl/sauvegarde.json', {
    _genere: 'Fichier fabriqué par scripts/sauvegarde-nl.js : ne pas modifier à la main.',
    source: 'Slattz (ACNL_Research : Items_WA.txt, garden_plus.dat.bt), Le0X8 (acnl-research), RedShyGuy (Vapecord : ordre du musée)',
    musee,
    debloques,
  });
  const parCat = debloques.reduce((m, c) => ({ ...m, [c.categorie]: (m[c.categorie] || 0) + 1 }), {});
  console.log(`musée : ${musee.reduce((n, m) => n + m.ids.length, 0)} cases ; objets débloqués reliés : ${JSON.stringify(parCat)} -> ${path.relative(process.cwd(), f)}`);
  console.log(`${sansFiche} objet(s) du jeu sans fiche dans le dex (fruits, coquillages, clochettes, etc.)`);
  if (ambigus.length) console.log(`${ambigus.length} nom(s) présent(s) dans plusieurs catégories :\n- ${ambigus.slice(0, 30).join('\n- ')}`);
}

if (require.main === module) principal().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { lireObjets, nomDex, MUSEE };
