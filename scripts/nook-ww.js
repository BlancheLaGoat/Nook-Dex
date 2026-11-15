// Données du magasin de Nook (Wild World) tirées de la ROM du jeu, pour prévoir son stock (src/renderer/lib/nook-ww.js).
//
// Le calcul suit le code du jeu décompilé par le projet acww-decomp (banatic, licence CC0) : nook_store.c,
// shop_stock.c, item_lists.c, item_group_order.c. Ce script ne recopie que des données de la ROM européenne :
//  - dans le programme (ARM9, compressé en BLZ) : les six ordres des groupes 1-3 (0x020CBBDC), la liste des
//    douze sacs de graines (0x020D0F5C) et les tailles des sections par niveau du magasin (0x020D0F10) ;
//  - dans les fichiers de la cartouche : /ftr_info/FRN/always.bin (groupe de tirage de chaque meuble, octet 4 de
//    chaque enregistrement de 8 octets ; couleurs et forme pour le feng shui : octets 1, 2 et 5) et /item_info/FRN/always.bin (classe, groupe et saison des autres objets,
//    octets 4, 6 et 8 des enregistrements de 12 octets). Les fichiers des autres langues sont identiques.
//
// Doigts de fée : les vêtements, accessoires, chapeaux et parapluies (mêmes fichiers item_info).
//
// Écrit data/ww/nook.json. Lancer avec : npm run donnees:nook-ww -- "chemin/vers/Animal Crossing - Wild World (Europe).nds"
const fs = require('fs');
const { ecrireJson } = require('./lib/outils');

const rom = fs.readFileSync(process.argv[2] || '');
const u32 = (b, i) => b.readUInt32LE(i), u16 = (b, i) => b.readUInt16LE(i);
if (rom.toString('latin1', 0x0C, 0x10) !== 'ADMP') throw new Error("Il faut la ROM européenne d'Animal Crossing: Wild World (code ADMP).");

// ---- programme (ARM9), décompressé (BLZ : un LZ lu à l'envers) ----
function blz(pak) {
  const n = pak.length, pied = u32(pak, n - 8), plus = u32(pak, n - 4);
  if (!plus) return pak;
  const enc = pied & 0xFFFFFF, entete = pied >>> 24, debutEnc = n - enc;
  const sortie = Buffer.alloc(n + plus);
  pak.copy(sortie, 0, 0, debutEnc);
  const src = Buffer.from(pak.subarray(debutEnc, n - entete)).reverse();
  const dst = Buffer.alloc(n + plus - debutEnc);
  let i = 0, o = 0, drapeaux = 0, masque = 0;
  while (o < dst.length && i < src.length) {
    masque >>= 1; if (!masque) { drapeaux = src[i++]; masque = 0x80; }
    if (!(drapeaux & masque)) dst[o++] = src[i++];
    else {
      const v = (src[i] << 8) | src[i + 1]; i += 2;
      const lg = (v >> 12) + 3, d = (v & 0xFFF) + 3;
      for (let k = 0; k < lg && o < dst.length; k++) { dst[o] = dst[o - d]; o++; }
    }
  }
  dst.reverse().copy(sortie, debutEnc);
  return sortie;
}
const a9 = blz(rom.subarray(u32(rom, 0x20), u32(rom, 0x20) + u32(rom, 0x2C)));
const A9 = adr => adr - 0x2000000;

// ---- fichiers de la cartouche (table des noms FNT + table d'allocation FAT) ----
function fichier(chemin) {
  const fnt = u32(rom, 0x40), fat = u32(rom, 0x48);
  let id = 0xF000;
  const parties = chemin.split('/').filter(Boolean);
  for (let k = 0; k < parties.length; k++) {
    const e = fnt + (id & 0xFFF) * 8;
    let p = fnt + u32(rom, e), premier = u16(rom, e + 4), trouve = null;
    for (;;) {
      const t = rom[p++]; if (!t) break;
      const lg = t & 0x7F, nom = rom.toString('latin1', p, p + lg); p += lg;
      if (t & 0x80) { const sous = u16(rom, p); p += 2; if (nom === parties[k] && k < parties.length - 1) { trouve = sous; break; } }
      else { if (nom === parties[k] && k === parties.length - 1) { trouve = premier; break; } premier++; }
    }
    if (trouve == null) throw new Error(`fichier introuvable : ${chemin}`);
    id = trouve;
  }
  return rom.subarray(u32(rom, fat + id * 8), u32(rom, fat + id * 8 + 4));
}
const meubles = fichier('/ftr_info/FRN/always.bin');
const objets = fichier('/item_info/FRN/always.bin');

const ordres = [...Array(6)].map((_, k) => [...a9.subarray(A9(0x20cbbdc) + k * 3, A9(0x20cbbdc) + k * 3 + 3)]);
const douze = [...Array(12)].map((_, k) => u16(a9, A9(0x20d0f5c) + k * 2));
const NOMS_TAILLES = ['moquettes', 'toit', 'papiers', 'papeterie', 'outils', 'meubles', 'douze', 'pousses', 'bouteille'];
const tailles = Object.fromEntries(NOMS_TAILLES.map((nom, k) => [nom, [...a9.subarray(A9(0x20d0f10) + k * 4, A9(0x20d0f10) + k * 4 + 4)]]));

// Contrôles : ce sont bien les tables attendues.
if (!ordres.every(r => [...r].sort((a, b) => a - b).join() === '10,30,60')) throw new Error('ordres des groupes inattendus');
if (douze[0] !== 0x14fe || douze[11] !== 0x1512) throw new Error('liste des douze inattendue');
if (tailles.meubles[3] !== 8 || tailles.outils[3] !== 6) throw new Error('tailles des sections inattendues');

// Objets décrits par item_info : groupe (du plein pour la papeterie) et saison (-1 : toute l'année).
const infoNum = c => { const n = c & 0xfff; return n >= 0x56e ? 0x56d : n; };
const rec = n => objets.subarray(n * 12, n * 12 + 12);
const decrire = c => {
  const plein = infoNum(c >= 0x1000 && c <= 0x10ff ? c | 3 : c);
  const r = rec(infoNum(c));
  return [rec(plein)[6], r[4] === 5 ? r[8] : -1];
};
const plage = (premier, nombre, pas = 1, decalage = 0) => [...Array(nombre)].map((_, j) => decrire(premier + j * pas + decalage));

ecrireJson('ww/nook.json', {
  _explication: [
    "Magasin de Nook (Wild World) : données de la ROM européenne pour recalculer son stock de chaque jour (src/renderer/lib/nook-ww.js).",
    "Fabriqué par scripts/nook-ww.js : ne pas modifier à la main. Calcul d'après le code du jeu décompilé par acww-decomp (licence CC0).",
  ],
  ordres,
  douze,
  outils: [0x1369, 0x1378, 0x1376, 0x1374, 0x156c, 0x136b, 0x137a],
  tailles,
  // Groupe de tirage de chacun des 0x6e9 meubles (code 0x3000 + 4 × numéro).
  meubles: [...Array(0x6e9)].map((_, n) => meubles[n * 8 + 4]),
  // Feng shui (room_score.c) : [couleur A, couleur B, forme au sol] de chaque meuble (octets 1, 2 et 5 ; couleurs 1 jaune,
  // 2 rouge, 4 vert ; formes 0 une case, 1 deux cases, 2 deux sur deux).
  fengShui: [...Array(0x6e9)].map((_, n) => [meubles[n * 8 + 1], meubles[n * 8 + 2], meubles[n * 8 + 5]]),
  // [groupe, saison] : papeterie (64 piles pleines, 0x1003 + 4 × n), moquettes (0x1144 + n), papiers peints (0x1100 + n).
  papeterie: plage(0x1000, 64, 4, 3),
  moquettes: plage(0x1144, 0x44),
  papiers: plage(0x1100, 0x44),
  // Doigts de fée (tailor_stock.c) : [groupe, saison] des vêtements (0x11a8 + n), accessoires (0x1431 + n), chapeaux
  // (0x13c8 + n), parapluies (0x1380 + n) et casquettes (0x13a8 + n) ; genres 2, 5, 6, 7 et 8 de la table 0x020CBBF0.
  vetements: plage(0x11a8, 0x100),
  accessoires: plage(0x1431, 0x40),
  chapeaux: plage(0x13c8, 0x40),
  parapluies: plage(0x1380, 0x20),
  casquettes: plage(0x13a8, 0x20),
  // Groupe des codes tirés « par plage » (pousses, bouteille, médicament) : 0x18 et 0x19 ne sont jamais tirés.
  speciaux: Object.fromEntries([0x151d, 0x151e, 0x151f, 0x155e].map(c => [c.toString(16), decrire(c)[0]])),
});
console.log('data/ww/nook.json écrit.');
