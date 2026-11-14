// Mots de passe d'objets d'Animal Crossing (GameCube) : création et décodage.
//
// Portage en JavaScript de src/game/m_mail_password_check.c de la décompilation ACreTeam/ac-decomp
// (https://github.com/ACreTeam/ac-decomp), avec la table de caractères du jeu (include/m_font.h).
//
// Un mot de passe = 28 caractères (2 lignes de 14) qui codent 21 octets :
//   [0]  type de code (3 bits), somme de contrôle (2 bits), « hit rate » (2 bits), type d'expéditeur (1 bit)
//   [1]  code de l'expéditeur (habitant ou personnage spécial ; 0xFF si aucun)
//   [2..9]   nom du joueur (8 caractères du jeu, complétés par des espaces)
//   [10..17] nom de la ville (8 caractères)
//   [18..19] numéro de l'objet (16 bits)
//   [20] octet de travail du chiffrement
// Le jeu n'accepte le code que si le nom et la ville sont exactement ceux du joueur (mMpswd_check_name).
//
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/motdepasse.test.js.

const LONGUEUR_DONNEES = 21;
const LONGUEUR_CODE = 28;
const LONGUEUR_NOM = 8;
const IDX_CLE = 1;          // mMpswd_PASSWORD_KEY_IDX / mMpswd_BITMIX_CODE_IDX
const IDX_RSA_PREMIER = 5;  // mMpswd_RSA_R_PRIME_IDX
const IDX_RSA_INFO = 15;    // mMpswd_RSA_INFO_IDX
const IDX_RSA_SAUVE = 20;   // mMpswd_RSA_KEYSAVE_IDX

export const TYPES_CODE = ['famicom', 'populaire', 'carte-e', 'magazine', 'joueur', 'carte-e-mini'];
export const NOMS_TYPES_CODE = {
  famicom: 'NES (Famicom)', populaire: 'Concours de popularité', 'carte-e': 'Carte e-Reader',
  magazine: 'Magazine', joueur: 'Code de joueur (Tom Nook)', 'carte-e-mini': 'Mini-carte e-Reader',
};

// Les 64 caractères utilisables dans un mot de passe (usable_to_fontnum), dans l'ordre de leur valeur sur 6 bits.
const CARACTERES_CODE = 'bKz5cqYZOdt6nlByo84Lk%AQmDPI7&RswU#r3ExMC@e9gvVGuNiXWfTJFSHp2ajh';

// Table de caractères du jeu (version européenne, include/m_font.h) : code 0-255 -> texte.
// Les cases sans équivalent simple sont notées ⟨n⟩.
const POLICE = [
  '¡', '¿', 'Ä', 'À', 'Á', 'Â', 'Ã', 'Å', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì', 'Í', 'Î',
  'Ï', 'Ð', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Œ', 'Ù', 'Ú', 'Û', 'Ü', 'ß', 'Þ', 'à',
  ' ', '!', '"', 'á', 'â', '%', '&', "'", '(', ')', '~', '♥', ',', '-', '.', '♪',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', '💧', '<', '=', '>', '?',
  '@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'ã', '💢', 'ä', 'å', '_',
  'ç', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'è', 'é', 'ê', 'ë', null,
  null, 'ì', 'í', 'î', 'ï', '·', 'ð', 'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', 'œ', 'ù', 'ú',
  '‐', 'û', 'ü', 'ý', 'ÿ', 'þ', 'Ý', '¦', '§', 'ª', 'º', '‖', 'µ', '³', '²', '¹',
  '¯', '¬', 'Æ', 'æ', '„', '«', '»', '☀', '☁', '☂', '🌬', '☃', null, null, '/', '∞',
  '○', '✕', '□', '△', '+', '⚡', '♂', '♀', '✿', '★', '☠', '😮', '😄', '😢', '😠', '😃',
  '×', '÷', '🔨', '🎀', '✉', '💰', '🐾', '🐶', '🐱', '🐰', '🐦', '🐮', '🐷', null, '🐟', '🐞',
  ';', '#', null, null, '🔑', '“', '”', '‘', '’', null, null, null, null, null, '\\',
];
while (POLICE.length < 256) POLICE.push(null);
const ESPACE = 32;
const DEPUIS_TEXTE = new Map();
POLICE.forEach((c, i) => { if (c != null && !DEPUIS_TEXTE.has(c)) DEPUIS_TEXTE.set(c, i); });

const PREMIERS = [
  17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
  101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193,
  197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307,
  311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421,
  431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547,
  557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659,
  661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797,
  809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929,
  937, 941, 947, 953, 967, 971, 977, 983, 991, 997, 1009, 1013, 1019, 1021, 1031, 1033, 1039, 1049, 1051,
  1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109, 1117, 1123, 1129, 1151, 1153, 1163, 1171, 1181, 1187, 1193,
  1201, 1213, 1217, 1223, 1229, 1231, 1237, 1249, 1259, 1277, 1279, 1283, 1289, 1291, 1297, 1301, 1303, 1307, 1319,
  1321, 1327, 1361, 1367, 1373, 1381, 1399, 1409, 1423, 1427, 1429, 1433, 1439, 1447, 1451, 1453, 1459, 1471, 1481,
  1483, 1487, 1489, 1493, 1499, 1511, 1523, 1531, 1543, 1549, 1553, 1559, 1567, 1571, 1579, 1583, 1597, 1601, 1607,
  1609, 1613, 1619, 1621, 1627, 1637, 1657, 1663, 1667,
];

// Chaînes du chiffrement par transposition (noms des développeurs dans le code du jeu).
const TRANSPOSITION = [
  ['NiiMasaru', 'KomatsuKunihiro', 'TakakiGentarou', 'MiyakeHiromichi', 'HayakawaKenzo', 'KasamatsuShigehiro',
    'SumiyoshiNobuhiro', 'NomaTakafumi', 'EguchiKatsuya', 'NogamiHisashi', 'IidaToki', 'IkegawaNoriko',
    'KawaseTomohiro', 'BandoTaro', 'TotakaKazuo', 'WatanabeKunio'],
  ['RichAmtower', 'KyleHudson', 'MichaelKelbaugh', 'RaycholeLAneff', 'LeslieSwan', 'YoshinobuMantani',
    'KirkBuchanan', 'TimOLeary', 'BillTrinen', 'nAkAyOsInoNyuuSankin', 'zendamaKINAKUDAMAkin',
    'OishikutetUYOKUNARU', 'AsetoAminofen', 'fcSFCn64GCgbCGBagbVB', 'YossyIsland', 'KedamonoNoMori'],
].map(liste => liste.map(s => [...s].map(c => c.charCodeAt(0))));
const CLE_TRANSPOSITION = [18, 9];

const SUBSTITUTION = [
  0xf0, 0x83, 0xfd, 0x62, 0x93, 0x49, 0x0d, 0x3e, 0xe1, 0xa4, 0x2b, 0xaf, 0x3a, 0x25, 0xd0, 0x82, 0x7f, 0x97, 0xd2,
  0x03, 0xb2, 0x32, 0xb4, 0xe6, 0x09, 0x42, 0x57, 0x27, 0x60, 0xea, 0x76, 0xab, 0x2d, 0x65, 0xa8, 0x4d, 0x8b, 0x95,
  0x01, 0x37, 0x59, 0x79, 0x33, 0xac, 0x2f, 0xae, 0x9f, 0xfe, 0x56, 0xd9, 0x04, 0xc6, 0xb9, 0x28, 0x06, 0x5c, 0x54,
  0x8d, 0xe5, 0x00, 0xb3, 0x7b, 0x5e, 0xa7, 0x3c, 0x78, 0xcb, 0x2e, 0x6d, 0xe4, 0xe8, 0xdc, 0x40, 0xa0, 0xde, 0x2c,
  0xf5, 0x1f, 0xcc, 0x85, 0x71, 0x3d, 0x26, 0x74, 0x9c, 0x13, 0x7d, 0x7e, 0x66, 0xf2, 0x9e, 0x02, 0xa1, 0x53, 0x15,
  0x4f, 0x51, 0x20, 0xd5, 0x39, 0x1a, 0x67, 0x99, 0x41, 0xc7, 0xc3, 0xa6, 0xc4, 0xbc, 0x38, 0x8c, 0xaa, 0x81, 0x12,
  0xdd, 0x17, 0xb7, 0xef, 0x2a, 0x80, 0x9d, 0x50, 0xdf, 0xcf, 0x89, 0xc8, 0x91, 0x1b, 0xbb, 0x73, 0xf8, 0x14, 0x61,
  0xc2, 0x45, 0xc5, 0x55, 0xfc, 0x8e, 0xe9, 0x8a, 0x46, 0xdb, 0x4e, 0x05, 0xc1, 0x64, 0xd1, 0xe0, 0x70, 0x16, 0xf9,
  0xb6, 0x36, 0x44, 0x8f, 0x0c, 0x29, 0xd3, 0x0e, 0x6f, 0x7c, 0xd7, 0x4a, 0xff, 0x75, 0x6c, 0x11, 0x10, 0x77, 0x3b,
  0x98, 0xba, 0x69, 0x5b, 0xa3, 0x6a, 0x72, 0x94, 0xd6, 0xd4, 0x22, 0x08, 0x86, 0x31, 0x47, 0xbe, 0x87, 0x63, 0x34,
  0x52, 0x3f, 0x68, 0xf6, 0x0f, 0xbf, 0xeb, 0xc0, 0xce, 0x24, 0xa5, 0x9a, 0x90, 0xed, 0x19, 0xb8, 0xb5, 0x96, 0xfa,
  0x88, 0x6e, 0xfb, 0x84, 0x23, 0x5d, 0xcd, 0xee, 0x92, 0x58, 0x4c, 0x0b, 0xf7, 0x0a, 0xb1, 0xda, 0x35, 0x5f, 0x9b,
  0xc9, 0xa9, 0xe7, 0x07, 0x1d, 0x18, 0xf3, 0xe3, 0xf1, 0xf4, 0xca, 0xb0, 0x6b, 0x30, 0xec, 0x4b, 0x48, 0x1c, 0xad,
  0xe2, 0x21, 0x1e, 0xa2, 0xbd, 0x5a, 0xd8, 0x43, 0x7a,
];
const SUBSTITUTION_INVERSE = new Array(256);
SUBSTITUTION.forEach((v, i) => { SUBSTITUTION_INVERSE[v] = i; });

const SELECTION = [
  [17, 11, 0, 10, 12, 6, 8, 4], [3, 8, 11, 16, 4, 6, 9, 19], [9, 14, 17, 18, 11, 10, 12, 2], [0, 2, 1, 4, 18, 10, 12, 8],
  [17, 19, 16, 7, 12, 8, 2, 9], [16, 3, 1, 8, 18, 4, 7, 6], [19, 6, 10, 17, 3, 16, 8, 9], [17, 7, 18, 16, 12, 2, 11, 0],
  [6, 2, 12, 1, 8, 14, 0, 16], [19, 16, 11, 8, 17, 3, 6, 14], [18, 12, 2, 7, 10, 11, 1, 14], [8, 0, 14, 2, 7, 11, 12, 17],
  [9, 3, 2, 0, 11, 8, 14, 10], [10, 11, 12, 16, 19, 7, 17, 8], [19, 8, 6, 1, 17, 9, 14, 10], [9, 7, 17, 12, 19, 10, 1, 11],
];

// ---------- Étapes du chiffrement (dans l'ordre du code du jeu) ----------

// Les 20 octets de travail = tous sauf l'octet clé (index 1).
const sansCle = p => [p[0], ...p.slice(2, LONGUEUR_DONNEES)];
const remettreSansCle = (p, buf) => { p[0] = buf[0] & 0xff; for (let i = 1; i < LONGUEUR_DONNEES - 1; i++) p[i + 1] = buf[i] & 0xff; };

function decalageBits(p, decalage) { // mMpswd_bit_shift
  const n = LONGUEUR_DONNEES - 1;
  const buf = sansCle(p);
  const res = new Array(n).fill(0);
  let octets = Math.trunc(Math.abs(decalage) / 8);
  const bits = Math.abs(decalage) % 8;
  while (octets > n) octets -= n;
  let masque = 0;
  for (let i = 0; i < bits; i++) masque = masque * 2 + 1;
  if (decalage > 0) {
    let octet = (buf[bits === 0 ? 0 : n - 1] >> (8 - bits)) & masque;
    let dst = octets;
    for (let i = 0; i < n; i++) {
      res[dst] = (octet | (buf[i] << bits)) & 0xff;
      octet = (buf[i] >> (8 - bits)) & masque;
      dst = (dst + 1) % n;
    }
  } else if (decalage < 0) {
    let octet = buf[bits === 0 ? n - 1 : 0];
    octet = ((octet & masque) << (8 - bits)) & 0xff;
    let idx = (n - 1 - octets) % n;
    for (let i = n - 1; i >= 0; i--) {
      res[idx] = (octet | (buf[i] >> bits)) & 0xff;
      octet = ((buf[i] & masque) << (8 - bits)) & 0xff;
      idx--;
      if (idx < 0) idx = n - 1;
    }
  } else {
    for (let i = 0; i < n; i++) res[i] = buf[i];
  }
  remettreSansCle(p, res);
}

function inverserBits(p) { // mMpswd_bit_reverse
  for (let i = 0; i < LONGUEUR_DONNEES; i++) if (i !== IDX_CLE) p[i] ^= 0xff;
}

function retournerOrdre(p) { // mMpswd_bit_arrange_reverse
  const buf = sansCle(p);
  const res = [];
  for (let i = buf.length - 1; i >= 0; i--) {
    let r = 0;
    for (let b = 7; b >= 0; b--) r |= ((buf[i] >> b) & 1) << (7 - b);
    res.push(r);
  }
  remettreSansCle(p, res);
}

function cleRSA(p) { // mMpswd_get_RSA_key_code
  const info = p[IDX_RSA_INFO];
  let ip = info & 3;
  let iq = (info >> 2) & 3;
  if (ip === 3) { ip = (ip ^ iq) & 3; if (ip === 3) ip = 0; }
  if (iq === 3) { iq = (ip + 1) & 3; if (iq === 3) iq = 1; }
  if (ip === iq) { iq = (ip + 1) & 3; if (iq === 3) iq = 1; }
  return { p: PREMIERS[ip], q: PREMIERS[iq], r: PREMIERS[p[IDX_RSA_PREMIER]], selection: SELECTION[(info >> 4) & 0xf] };
}

function chiffrerRSA(p) { // mMpswd_chg_RSA_cipher
  const { p: P, q: Q, r, selection } = cleRSA(p);
  const pq = P * Q;
  let sauve = 0;
  for (let i = 0; i < 8; i++) {
    const idx = selection[i];
    const b = p[idx];
    let c = b;
    for (let k = r - 1; k > 0; k--) c = (c * b) % pq;
    p[idx] = c & 0xff;
    sauve |= ((c >> 8) & 1) << i;
  }
  p[IDX_RSA_SAUVE] = sauve & 0xff;
}

function dechiffrerRSA(p) { // mMpswd_decode_RSA_cipher
  const { p: P, q: Q, r, selection } = cleRSA(p);
  const pq = P * Q;
  let d = r;
  for (let k = 1; ; k++) {
    const n = k * ((P - 1) * (Q - 1)) + 1;
    if (n % r === 0) { d = n / r; break; }
  }
  const sauve = p[IDX_RSA_SAUVE];
  for (let i = 0; i < 8; i++) {
    const idx = selection[i];
    const b = p[idx] | (((sauve >> i) & 1) << 8);
    let m = b;
    for (let k = d - 1; k > 0; k--) m = (m * b) % pq;
    p[idx] = m & 0xff;
  }
}

function melangerBits(p) { // mMpswd_bit_mix_code
  const c = p[IDX_CLE] & 0xf;
  if (c > 12) { retournerOrdre(p); inverserBits(p); decalageBits(p, c * 3); }
  else if (c > 8) { retournerOrdre(p); decalageBits(p, -c * 5); }
  else if (c > 4) { decalageBits(p, -c * 5); inverserBits(p); }
  else { decalageBits(p, c * 3); retournerOrdre(p); }
}

function demelangerBits(p) { // mMpswd_decode_bit_code
  const c = p[IDX_CLE] & 0xf;
  if (c > 12) { decalageBits(p, -c * 3); inverserBits(p); retournerOrdre(p); }
  else if (c > 8) { decalageBits(p, c * 5); retournerOrdre(p); }
  else if (c > 4) { inverserBits(p); decalageBits(p, c * 5); }
  else { retournerOrdre(p); decalageBits(p, -c * 3); }
}

function transposer(p, sens, table) { // mMpswd_transposition_cipher (sens 1 = soustraire)
  const cle = CLE_TRANSPOSITION[table];
  const chaine = TRANSPOSITION[table][p[cle] & 0xf];
  const m = sens === 1 ? -1 : 1;
  let j = 0;
  for (let i = 0; i < LONGUEUR_DONNEES; i++) {
    if (i === cle) continue;
    p[i] = (p[i] + chaine[j++] * m) & 0xff;
    if (j >= chaine.length) j = 0;
  }
}

// mMpswd_bit_shuffle : étape 0 sans les octets 13 et 20, étape 1 sans l'octet 2.
function prepaMelange(p, etape) {
  const cle = etape === 0 ? 13 : 2;
  const nombre = etape === 0 ? LONGUEUR_DONNEES - 2 : LONGUEUR_DONNEES - 1;
  const buf = [...p.slice(0, cle), ...p.slice(cle + 1, LONGUEUR_DONNEES)];
  return { cle, nombre, buf, selection: SELECTION[p[cle] & 3] };
}
function reposerMelange(p, cle, res) {
  for (let i = 0; i < cle; i++) p[i] = res[i] & 0xff;
  for (let i = cle; i < LONGUEUR_DONNEES - 1; i++) p[i + 1] = (res[i] || 0) & 0xff;
}
function battreBits(p, etape) {
  const { cle, nombre, buf, selection } = prepaMelange(p, etape);
  const res = new Array(LONGUEUR_DONNEES - 1).fill(0);
  for (let i = 0; i < nombre; i++) {
    for (let bit = 0; bit < 8; bit++) {
      let dst = i + selection[bit];
      if (dst >= nombre) dst -= nombre;
      res[dst] |= ((buf[i] >> bit) & 1) << bit;
    }
  }
  if (etape === 0) res[LONGUEUR_DONNEES - 2] = buf[LONGUEUR_DONNEES - 2]; // octet 20 : non battu
  reposerMelange(p, cle, res);
}
function rebattreBits(p, etape) { // mMpswd_decode_bit_shuffle
  const { cle, nombre, buf, selection } = prepaMelange(p, etape);
  const res = new Array(LONGUEUR_DONNEES - 1).fill(0);
  for (let i = 0; i < nombre; i++) {
    for (let bit = 0; bit < 8; bit++) {
      let src = i + selection[bit];
      if (src >= nombre) src -= nombre;
      res[i] |= ((buf[src] >> bit) & 1) << bit;
    }
  }
  if (etape === 0) res[LONGUEUR_DONNEES - 2] = buf[LONGUEUR_DONNEES - 2];
  reposerMelange(p, cle, res);
}

function versSixBits(octets) { // mMpswd_chg_6bits_code
  const res = [];
  let bitHuit = 0, bitSix = 0, valeur = 0, k = 0;
  while (res.length < LONGUEUR_CODE) {
    valeur |= ((octets[k] >> bitHuit) & 1) << bitSix;
    bitHuit++; bitSix++;
    if (bitSix >= 6) { res.push(valeur); valeur = 0; bitSix = 0; }
    if (bitHuit >= 8) { bitHuit = 0; k++; }
  }
  return res;
}

function versHuitBits(six) { // mMpswd_chg_8bits_code
  const res = [];
  let bitSix = 0, bitHuit = 0, valeur = 0, k = 0;
  while (res.length < LONGUEUR_DONNEES) {
    valeur |= ((six[k] >> bitSix) & 1) << bitHuit;
    bitSix++; bitHuit++;
    if (bitHuit >= 8) { res.push(valeur); valeur = 0; bitHuit = 0; }
    if (bitSix >= 6) { bitSix = 0; k++; }
  }
  return res;
}

// ---------- Noms (texte <-> caractères du jeu) ----------

// "Blanche" -> 8 codes du jeu (complété par des espaces). Erreur si un caractère n'existe pas dans le jeu.
export function nomVersOctets(texte) {
  const car = [...String(texte || '')];
  if (car.length > LONGUEUR_NOM) throw new Error(`« ${texte} » : 8 caractères au plus.`);
  const res = car.map(c => {
    if (!DEPUIS_TEXTE.has(c)) throw new Error(`« ${c} » n'existe pas dans le jeu.`);
    return DEPUIS_TEXTE.get(c);
  });
  while (res.length < LONGUEUR_NOM) res.push(ESPACE);
  return res;
}

// 8 codes du jeu -> texte (espaces de fin enlevés).
export function octetsVersNom(octets) {
  return octets.map(o => (POLICE[o] != null ? POLICE[o] : `⟨${o}⟩`)).join('').replace(/ +$/, '');
}

// Le texte peut-il s'écrire dans le jeu ? (null si oui, sinon le message d'erreur)
export function erreurNom(texte) {
  if (!String(texte || '').trim()) return 'Nom vide.';
  try { nomVersOctets(texte); return null; } catch (e) { return e.message; }
}

// ---------- Création et décodage ----------

// « a w m g … », retours à la ligne compris -> 28 caractères ; 0 -> O et 1 -> l comme le jeu.
export function nettoyerCode(code) {
  return String(code || '').replace(/\s+/g, '').replace(/0/g, 'O').replace(/1/g, 'l');
}

export const sommeControle = (nom, ville, objet, octetExpediteur) =>
  ([...nom, ...ville].reduce((s, o) => s + o, 0) + objet + octetExpediteur) & 3;

// Décode un mot de passe (mMpswd_decode_code + mMpswd_password). null si un caractère est impossible, sinon :
// { type, typeCode, hitRate, typeExpediteur, codeExpediteur, octetExpediteur, nom, ville, nomOctets, villeOctets,
//   objet (numéro 16 bits), somme, sommeOk, donnees (21 octets) }
export function decoder(code) {
  const texte = nettoyerCode(code);
  if ([...texte].length !== LONGUEUR_CODE) return null;
  const six = [];
  for (const c of texte) {
    const v = CARACTERES_CODE.indexOf(c);
    if (v < 0) return null;
    six.push(v);
  }
  const p = versHuitBits(six);
  transposer(p, 1, 1);
  rebattreBits(p, 1);
  demelangerBits(p);
  dechiffrerRSA(p);
  rebattreBits(p, 0);
  transposer(p, 0, 0);
  for (let i = 0; i < LONGUEUR_DONNEES; i++) p[i] = SUBSTITUTION_INVERSE[p[i]];

  const b0 = p[0];
  const typeCode = (b0 >> 5) & 7;
  const nomOctets = p.slice(2, 10);
  const villeOctets = p.slice(10, 18);
  const objet = (p[18] << 8) + p[19];
  let hitRate = (b0 >> 1) & 3;
  let typeExpediteur = -1;
  let codeExpediteur = -1;
  if (typeCode === 1 || typeCode === 2) { typeExpediteur = b0 & 1; codeExpediteur = p[1]; }
  if (typeCode === 3) hitRate |= (b0 & 1) << 2;
  const somme = (b0 >> 3) & 3;
  // mMpswd_password_zuru_check additionne npc_code, un u8 : pour les codes sans expéditeur, -1 devient 0xFF.
  const sommeOk = typeCode < TYPES_CODE.length && sommeControle(nomOctets, villeOctets, objet, codeExpediteur & 0xff) === somme;
  return {
    type: TYPES_CODE[typeCode] || `inconnu-${typeCode}`, typeCode, hitRate, typeExpediteur, codeExpediteur,
    octetExpediteur: p[1], nom: octetsVersNom(nomOctets), ville: octetsVersNom(villeOctets), nomOctets, villeOctets,
    objet, somme, sommeOk, donnees: p,
  };
}

// Crée un mot de passe (mMpswd_make_password). nom / ville : texte ou 8 codes du jeu.
// Paramètres comme dans le jeu : typeCode (4 = code de joueur), hitRate, typeExpediteur, codeExpediteur.
export function creer({ nom, ville, objet, typeCode = 4, hitRate = 1, typeExpediteur = 0, codeExpediteur = 0xff }) {
  const n = Array.isArray(nom) ? nom : nomVersOctets(nom);
  const v = Array.isArray(ville) ? ville : nomVersOctets(ville);
  let type = typeCode;
  let hr = hitRate, te = typeExpediteur, ce = codeExpediteur;
  switch (type) {
    case 0: case 4: case 5: hr = 1; ce = 0xff; break;
    case 1: hr = 4; break;
    case 2: break;
    case 3: te = (hr >> 2) & 1; hr &= 3; ce = 0xff; break;
    default: type = 4; hr = hitRate; break;
  }
  const p = new Array(LONGUEUR_DONNEES).fill(0);
  p[0] = ((type << 5) | (hr << 1) | (te & 1)) & 0xff;
  p[1] = ce & 0xff;
  for (let i = 0; i < LONGUEUR_NOM; i++) { p[2 + i] = n[i]; p[10 + i] = v[i]; }
  p[18] = (objet >> 8) & 0xff;
  p[19] = objet & 0xff;
  p[0] |= sommeControle(n, v, objet, ce & 0xff) << 3;

  for (let i = 0; i < LONGUEUR_DONNEES; i++) p[i] = SUBSTITUTION[p[i]];
  transposer(p, 1, 0);
  battreBits(p, 0);
  chiffrerRSA(p);
  melangerBits(p);
  battreBits(p, 1);
  transposer(p, 0, 1);
  return versSixBits(p).map(x => CARACTERES_CODE[x]).join('');
}

// « abcdefghijklmnopqrstuvwxyz12 » -> deux lignes de 14, avec des espaces pour la lecture.
export function formaterCode(code) {
  const c = [...nettoyerCode(code)];
  return [c.slice(0, 14).join(' '), c.slice(14).join(' ')];
}
