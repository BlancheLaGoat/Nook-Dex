// Règles de croisement des fleurs de City Folk, avec leurs chances, tirées du code du jeu (main.dol).
//
// Ce qui a été trouvé dans main.dol de la version américaine Rev 1 (RUUE01, disque « Rev 1 ») :
//  - sur le plan de la ville, une fleur est notée par son rang dans la table des objets posés (0x804DFFC0,
//    enregistrements de 0x20 octets nommés « flw_tulip_rd »…) : tulipes 0x9E-0xA3, pensées 0xA4-0xA9,
//    cosmos 0xAA-0xAF, roses 0xB0-0xB8 (0xB8 = dorée), œillets 0xB9-0xBB, lys 0xBC ; fanées : + 0x20 ;
//  - 0x80096594 : l'espèce d'une fleur (0 tulipe, 1 pensée, 2 cosmos, 3 rose, 4 œillet) ;
//    0x80096768 : sa couleur dans l'espèce (code − premier code de l'espèce ; rose dorée = 8) ;
//  - 0x800968E0 : l'enfant de deux fleurs. Un nombre au hasard entre 0 et 100 (0x8009E308) ; on ajoute une à une
//    les chances de la liste table[couleur de la fleur tirée][couleur de la voisine] jusqu'à le dépasser.
//    La table de pointeurs est à 0x804E1A88 : tulipes (+0x000, 6 × 6), pensées (+0x090), cosmos (+0x120),
//    roses (+0x1B0, 8 × 8, rien de tiré = dorée), œillets (+0x2B0, 3 × 3, rien de tiré = lys) ;
//  - les listes de chances (nombres à virgule, en pour cent) sont remplies au démarrage par le constructeur
//    statique 0x8009FFEC : ce script rejoue ses instructions (lis, addi, lfs, stfs…) pour les retrouver.
//  - la rose dorée a la couleur 8, mais la grille des roses n'a que 8 lignes (0 à 7) : le jeu lit alors la case
//    suivante en mémoire (le début de la grille des œillets). Le résultat dépend donc de la fleur d'où part le
//    jeu ; les deux cas sont donnés dans la note de la règle, et les chances affichées sont leur moyenne.
//  - mécanique (0x80096284, appelé chaque jour) : 5 essais par jour ; chacun tire une acre de la ville, puis
//    une case de cette acre portant une fleur non fanée et marquée (drapeau par case, 0x80081178 ; l'arrosage
//    d'après Nookipedia). La partenaire est la première voisine qui convient, dans l'ordre haut-gauche, haut,
//    haut-droite, gauche, droite, bas-gauche, bas, bas-droite ; l'enfant pousse sur une case libre autour.
//
// Écrit data/cf/fleurs-regles.json. Lancer avec : npm run donnees:fleurs-cf -- "chemin/vers/main.dol"
// (main.dol se sort du disque avec Dolphin : clic droit sur le jeu > Propriétés > Système de fichiers >
// Extraire les données système ; ou par défaut sources/cf/main.dol, non envoyé sur GitHub).
const fs = require('fs');
const path = require('path');
const { DOSSIER_SOURCES, ecrireJson } = require('./lib/outils');

const COULEURS = {
  Tulipes: ['rouge', 'blanc', 'jaune', 'rose', 'violet', 'noir'],
  Pensées: ['blanc', 'jaune', 'rouge', 'violet', 'orange', 'bleu'],
  Cosmos: ['blanc', 'rouge', 'jaune', 'rose', 'orange', 'noir'],
  Roses: ['rouge', 'blanc', 'jaune', 'rose', 'orange', 'violet', 'noir', 'bleu'],
  Œillets: ['rouge', 'rose', 'blanc'],
};
const TABLE = 0x804E1A88;
const GRILLES = [['Tulipes', 0x000, null], ['Pensées', 0x090, null], ['Cosmos', 0x120, null], ['Roses', 0x1B0, 'or'], ['Œillets', 0x2B0, 'lys']];
const CONSTRUCTEUR = 0x8009FFEC;
const R2 = 0x80757FC0; // base des petites constantes (_SDA2_BASE_, posée au démarrage en 0x80004224)

// ---- main.dol : sections et lecture par adresse ----
function chargerDol(fichier) {
  const d = fs.readFileSync(fichier);
  const sections = [];
  for (let k = 0; k < 18; k++) {
    const off = d.readUInt32BE(k * 4), adr = d.readUInt32BE(0x48 + k * 4), taille = d.readUInt32BE(0x90 + k * 4);
    if (taille) sections.push({ off, adr, taille });
  }
  const pos = a => {
    const s = sections.find(x => a >= x.adr && a < x.adr + x.taille);
    if (!s) throw new Error(`adresse 0x${a.toString(16)} hors du programme`);
    return s.off + a - s.adr;
  };
  return { mot: a => d.readUInt32BE(pos(a)), flottant: a => d.readFloatBE(pos(a)) };
}

// ---- rejoue le constructeur statique : seules les instructions qui posent les chances comptent ----
function chancesEcrites(dol) {
  const gpr = { 2: R2 }, fpr = {}, memoire = new Map();
  const s16 = v => (v & 0x8000 ? v - 0x10000 : v);
  for (let a = CONSTRUCTEUR, n = 0; n < 20000; a += 4, n++) {
    const w = dol.mot(a);
    const op = w >>> 26, rd = (w >>> 21) & 31, ra = (w >>> 16) & 31, imm = w & 0xFFFF;
    if (w === 0x4E800020) return memoire; // blr : fin du constructeur
    if (op === 15) gpr[rd] = ra ? undefined : (imm << 16) >>> 0; // lis
    else if (op === 14) gpr[rd] = ra === 0 ? s16(imm) >>> 0 : gpr[ra] === undefined ? undefined : (gpr[ra] + s16(imm)) >>> 0; // li / addi
    else if (op === 24) gpr[ra] = gpr[rd] === undefined ? undefined : (gpr[rd] | imm) >>> 0; // ori
    else if (op === 48) fpr[rd] = gpr[ra] === undefined ? undefined : dol.flottant((gpr[ra] + s16(imm)) >>> 0); // lfs
    else if (op === 52) { if (gpr[ra] !== undefined && fpr[rd] !== undefined) memoire.set((gpr[ra] + s16(imm)) >>> 0, fpr[rd]); } // stfs
    else if (op === 31 && ((w >>> 1) & 0x3FF) === 444 && rd === ((w >>> 11) & 31)) gpr[ra] = gpr[rd]; // mr
    else if (op === 18 && (w & 1)) { for (const r of [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) delete gpr[r]; for (let r = 0; r < 14; r++) delete fpr[r]; } // bl
  }
  throw new Error('fin du constructeur introuvable');
}

const arrondi = x => Math.round(x * 1000) / 1000;

function principal() {
  const fichier = process.argv[2] || path.join(DOSSIER_SOURCES, 'cf', 'main.dol');
  if (!fs.existsSync(fichier)) throw new Error(`main.dol introuvable (${fichier}). Sors-le du disque avec Dolphin.`);
  const dol = chargerDol(fichier);
  // Garde-fou : c'est bien la fonction des couleurs de la version américaine Rev 1 (cmplwi r4, 0x9E…).
  if (dol.mot(0x800965A0) !== 0x2804009E || dol.mot(0x800968E0) !== 0x9421FFC0) {
    throw new Error("Ce main.dol n'est pas celui de City Folk version américaine Rev 1 (RUUE01) : adresses inconnues.");
  }
  const memoire = chancesEcrites(dol);
  const liste = (p, n) => Array.from({ length: n }, (_, k) => memoire.get(p + 4 + 4 * k) || 0);
  const lire = (o, x, y, n) => liste(dol.mot(TABLE + o + x * n * 4 + y * 4), n);
  const enRegle = (espece, parents, ch, reste) => {
    const coul = COULEURS[espece];
    const enfants = [], chances = [];
    ch.forEach((v, k) => { if (v > 0) { enfants.push(coul[k]); chances.push(arrondi(v)); } });
    const somme = ch.reduce((s, v) => s + v, 0);
    if (somme < 99.999) {
      if (!reste) throw new Error(`${espece} ${parents} : ${somme} % au lieu de 100`);
      enfants.push(reste); chances.push(arrondi(100 - somme));
    }
    return { espece, parents, enfants, chances, fiabilite: 'jeu' };
  };

  const regles = [];
  for (const [espece, o, reste] of GRILLES) {
    const n = COULEURS[espece].length;
    for (let x = 0; x < n; x++) {
      for (let y = x; y < n; y++) {
        const a = lire(o, x, y, n), b = lire(o, y, x, n);
        if (a.some((v, k) => Math.abs(v - b[k]) > 1e-6)) throw new Error(`${espece} : table non symétrique`);
        regles.push(enRegle(espece, [COULEURS[espece][x], COULEURS[espece][y]], a, reste));
      }
    }
  }
  // Rose dorée (couleur 8) : le jeu lit hors de la grille des roses ; deux cas selon la fleur d'où il part.
  const roses = COULEURS.Roses;
  const texteCas = r => r.enfants.map((c, i) => `${c} ${r.chances[i]} %`).join(', ');
  for (let y = 0; y <= 8; y++) {
    const autre = y < 8 ? roses[y] : 'or';
    const depuisOr = enRegle('Roses', ['or', autre], lire(0x1B0, 8, y, 8), 'or');
    const depuisAutre = enRegle('Roses', [autre, 'or'], lire(0x1B0, y, 8, 8), 'or');
    const moy = new Map();
    for (const r of [depuisOr, depuisAutre]) r.enfants.forEach((c, i) => moy.set(c, (moy.get(c) || 0) + r.chances[i] / 2));
    const enfants = [...moy.keys()];
    regles.push({
      espece: 'Roses', parents: ['or', autre], enfants, chances: enfants.map(c => arrondi(moy.get(c))), fiabilite: 'jeu',
      note: y === 8 ? 'Deux roses dorées : toujours une rose jaune.'
        : `Le jeu lit ici une case hors de sa table : si le croisement part de la rose dorée, ${texteCas(depuisOr)} ; s'il part de l'autre rose (${autre}), ${texteCas(depuisAutre)}. Chances moyennes des deux cas.`,
    });
  }
  regles.push({ espece: 'Roses', parents: ['noir', 'arrosoir en or'], enfants: ['or'], fiabilite: 'texte', note: "Arroser une rose noire fanée avec l'arrosoir en or." });

  // Vérifications : chaque règle fait 100 %, et des croisements connus sont retrouvés.
  for (const r of regles) {
    if (r.chances && Math.abs(r.chances.reduce((s, v) => s + v, 0) - 100) > 0.01) throw new Error(`somme ≠ 100 : ${r.espece} ${r.parents}`);
  }
  const regle = (e, a, b) => regles.find(r => r.espece === e && r.parents[0] === a && r.parents[1] === b);
  const attendu = (r, enfants, chances) => JSON.stringify([r.enfants, r.chances]) === JSON.stringify([enfants, chances]);
  if (!attendu(regle('Tulipes', 'rouge', 'rouge'), ['rouge', 'noir'], [80, 20])
    || !attendu(regle('Roses', 'violet', 'noir'), ['violet', 'noir', 'bleu'], [40, 40, 20])
    || !attendu(regle('Roses', 'or', 'or'), ['jaune'], [100])) throw new Error('table relue de travers (contrôles)');

  const ancien = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cf', 'fleurs-regles.json'), 'utf8'));
  const f = ecrireJson('cf/fleurs-regles.json', {
    _explication: [
      "Règles de croisement des fleurs de City Folk, avec leurs chances : la table du jeu (main.dol de la version américaine Rev 1 ; table de pointeurs à 0x804E1A88, chances posées au démarrage par 0x8009FFEC).",
      "Pour chaque espèce et chaque paire de couleurs : les enfants possibles et leur chance sur 100 (« chances », dans l'ordre de « enfants »).",
      "fiabilite : « jeu » = lu dans la table du jeu ; « texte » = écrit sur Nookipedia.",
      'Fichier fabriqué par scripts/fleurs-cf.js : ne pas modifier à la main.',
    ],
    source: "Code du jeu (Animal Crossing: City Folk, main.dol) ; Nookipedia pour l'arrosoir en or",
    a_verifier: false,
    jeu: 'City Folk',
    especes: ancien.especes,
    regles,
    mecanique: [
      "Chaque jour, le jeu fait 5 essais : il tire une acre de la ville au hasard, puis une fleur de cette acre parmi celles qui ne sont pas fanées et que le jeu a marquées (il faut les arroser, d'après Nookipedia ; arroser la case entre deux fleurs compte pour les deux).",
      "La partenaire est la première voisine qui convient (même espèce, marquée elle aussi), dans l'ordre : en haut à gauche, en haut, en haut à droite, à gauche, à droite, en bas à gauche, en bas, en bas à droite. L'enfant pousse sur une case libre autour.",
      "Les chances affichées sont celles du jeu, une fois qu'un croisement a lieu.",
    ],
  });
  console.log(`${regles.length} règles -> ${path.relative(process.cwd(), f)}`);
}

if (require.main === module) {
  try { principal(); } catch (e) { console.error(e.message); process.exit(1); }
}
