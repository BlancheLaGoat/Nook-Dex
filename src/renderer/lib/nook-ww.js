// Magasin de Nook (Wild World) : le stock de chaque jour, recalculé comme le jeu le fait.
//
// D'après le code du jeu décompilé par le projet acww-decomp (banatic, licence CC0, domaine public) :
// nook_store.c (NookStore_Restock, les extras du jour, décembre), shop_stock.c, item_lists.c, item_group_order.c,
// date_random.c et fx_math.c. Le calcul est réécrit ici pour Nook Dex ; les données viennent de la ROM
// (data/ww/nook.json, fabriqué par scripts/nook-ww.js).
//
// Comment le jeu fait : chaque matin (à 6 h), le stock est tiré avec un générateur dont la graine mélange la date
// et des octets propres à la ville (l'ordre des groupes de rareté, un par genre d'objets). Une ville et une date
// donnent donc toujours le même stock. Les tirages dépendent aussi :
//  - du niveau du magasin (tailles des sections) ;
//  - du feng shui de la maison (pièces rouges à l'est et vertes au sud, divisé par 10), qui pèse sur les chances
//    des trois groupes de rareté : il est retrouvé en « calibrant » sur le stock lu dans la sauvegarde ;
//  - de « tous les joueurs ont fini de travailler pour Nook » : sinon, des extras du jour (un meuble échangé un
//    jour sur cinq, sauf le jour des points bonus) ; lui aussi retrouvé par la calibration.
// Vérifié : pour une vraie sauvegarde, le stock calculé est identique, case par case, au stock enregistré (37/37).
//
// Ce fichier ne fait que des calculs (pas d'affichage) : il est testé par tests/nook-ww.test.js.

export const AUCUN = 0xfff1;
export const CANNE = 0x1374;
export const PEINTURE_TOIT = 0x1521; // la première des 16 peintures de toit (la couleur suit un compteur du jeu)

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- générateur (fx_math.c) et graine (date_random.c) ----
class Hasard {
  constructor(graine) { this.s = graine >>> 0; }
  suivant() { this.s = (Math.imul(this.s, 0x19660d) + 0x3c6ef35f) >>> 0; return this.s; }
  sous(n) { return Number((BigInt(n >>> 0) * BigInt(this.suivant())) >> 32n); }
}
export function graine(ordres, annee, mois, jour) {
  const b = k => ordres[k] & 0xff;
  let packed = (annee | (jour << 11) | (mois << 7)) >>> 0;
  packed = (packed | (packed << 16)) >>> 0;
  return ((jour << 30) ^ (b(2) << 25) ^ (b(3) << 20) ^ (b(6) << 15) ^ (b(1) << 10) ^ (b(4) << 5) ^ b(0) ^ packed) >>> 0;
}

// Saison des tirages (ItemLists_Season) : printemps 0 dès le 25 février, été 1 dès le 27 mai, automne 2 dès le
// 27 août, hiver 3 dès le 27 novembre.
export function saison(mois, jour) {
  if (mois === 1) return 3; if (mois === 2) return jour > 24 ? 0 : 3; if (mois === 3 || mois === 4) return 0;
  if (mois === 5) return jour > 26 ? 1 : 0; if (mois === 6 || mois === 7) return 1; if (mois === 8) return jour > 26 ? 2 : 1;
  if (mois === 9 || mois === 10) return 2; if (mois === 11) return jour > 26 ? 3 : 2; return 3;
}

const estMeuble = c => (c >> 12) === 3 || (c >> 12) === 4;
const numMeuble = c => (c - 0x3000) >> 2;
const meme = (a, b) => (estMeuble(a) ? numMeuble(a) === numMeuble(b) : a === b);

// Les genres tirés « par lots » (table data_020ccab0) : 0 meubles, 1 papeterie, 3 moquettes, 4 papiers peints.
function genres(d) {
  if (d._genres) return d._genres;
  const g = {
    0: { nb: 0x6e9, code: j => 0x3000 + j * 4, desc: j => [d.meubles[j], -1] },
    1: { nb: 64, code: j => 0x1003 + j * 4, desc: j => d.papeterie[j] },
    3: { nb: 0x44, code: j => 0x1144 + j, desc: j => d.moquettes[j] },
    4: { nb: 0x44, code: j => 0x1100 + j, desc: j => d.papiers[j] },
    // Doigts de fée : 2 vêtements, 5 accessoires, 6 chapeaux, 7 parapluies, 8 casquettes.
    2: { nb: 0x100, code: j => 0x11a8 + j, desc: j => d.vetements[j] },
    5: { nb: 0x40, code: j => 0x1431 + j, desc: j => d.accessoires[j] },
    6: { nb: 0x40, code: j => 0x13c8 + j, desc: j => d.chapeaux[j] },
    7: { nb: 0x20, code: j => 0x1380 + j, desc: j => d.parapluies[j] },
    8: { nb: 0x20, code: j => 0x13a8 + j, desc: j => d.casquettes[j] },
  };
  for (const k of Object.values(g)) k.cache = new Map();
  Object.defineProperty(d, '_genres', { value: g, enumerable: false });
  return g;
}
// Codes d'un genre d'un groupe, tirables en cette saison (dans l'ordre des numéros).
function candidats(K, groupe, s) {
  const cle = `${groupe}:${s}`;
  if (!K.cache.has(cle)) {
    const l = [];
    for (let j = 0; j < K.nb; j++) { const [g, sa] = K.desc(j); if (g === groupe && (sa === -1 || sa === 4 || sa === s)) l.push(K.code(j)); }
    K.cache.set(cle, l);
  }
  return K.cache.get(cle);
}

// ---- ordre des groupes (item_group_order.c) ----
function groupeDuPoids(d, ordre, poids) { const i = d.ordres[ordre % 6].indexOf(poids); return i >= 0 ? i + 1 : 1; }
function choisirGroupe(d, ordre, place, h, dixieme) {
  const first = (60 - dixieme) & 0xff, third = (70 - first) & 0xff, second = 30;
  if (place === 0) {
    const roll = h.sous(100);
    return choisirGroupe(d, ordre, roll < first ? 1 : roll < first + third ? 3 : 2, h, dixieme);
  }
  let poids;
  if (place === 1) poids = first >= second && first >= third ? 60 : first <= second && third <= second ? 30 : 10;
  else if (place === 2) poids = (first <= second && first >= third) || (first >= second && first <= third) ? 60
    : (first >= second && third <= second) || (first <= second && third >= second) ? 30 : 10;
  else if (place === 3) poids = first <= second && first <= third ? 60 : first >= second && third >= second ? 30 : 10;
  else return place;
  return groupeDuPoids(d, ordre, poids);
}

// ---- tirages (item_lists.c) ----
// Codes tirés dans une plage (ItemLists_PickRange) : ici des numéros (outils, douze) ou quelques codes spéciaux.
function tirerPlage(d, premier, nombre, deja, h) {
  const tirable = (c, ignorer) => {
    if (!ignorer && deja.some(x => meme(c, x))) return false;
    const g = (c >> 12) === 1 ? (d.speciaux[c.toString(16)] ?? 0) : 0;
    return g !== 0x18 && g !== 0x19;
  };
  let passent = 0;
  for (let i = 0; i < nombre; i++) if (tirable(premier + i, false)) passent++;
  let tous = false;
  if (passent === 0) { tous = true; passent = nombre; }
  const choix = h.sous(passent);
  let vu = 0;
  for (let i = 0; i < nombre; i++) {
    if (!tirable(premier + i, tous)) continue;
    if (choix === vu) return premier + i;
    vu++;
  }
  return AUCUN;
}
function tirerPlages(d, n, premier, nombre, h) { const res = []; for (let i = 0; i < n; i++) res.push(tirerPlage(d, premier, nombre, res, h)); return res; }
// Objets tirés dans un lot (ItemLists_PickMany avec une seule liste, le groupe « tourné » par l'ordre de la ville).
function tirerLot(d, n, genre, groupe, ordres, s, h, dixieme) {
  const K = genres(d)[genre];
  const res = [];
  while (res.length < n) {
    h.sous(1); // la liste, tirée parmi une seule
    const g = choisirGroupe(d, ordres[genre], groupe, h, dixieme);
    const cand = candidats(K, g, s);
    const libres = cand.filter(c => !res.some(x => meme(c, x)));
    if (libres.length) { res.push(libres[h.sous(libres.length)]); continue; }
    const choix = h.sous(K.nb); // aucun : n'importe lequel du groupe, déjà tirés compris
    res.push(choix < cand.length ? cand[choix] : K.code(0));
  }
  return res;
}

// ---- le stock (NookStore_Restock, puis les extras du jour et décembre) ----
// ville = { ordres: [9 octets], niveau: 0-3 } ; options = { dixieme (feng shui), extras (bool) }.
// Renvoie { objets: [{ code, section, incertain?, ajout? }], soldes } (soldes : l'heure des soldes, 0 sans).
// incertain : le jeu y met parfois autre chose (place de la canne au niveau 0, jour des points bonus, couleur de la
// peinture de toit) ; ajout : un objet en vente qui n'occupe pas une place à lui (la canne du niveau 0).
// bonus : ce jour est le jour des points bonus de Nook (un samedi ou un dimanche) : pas de meuble échangé, et le
// tirage du meuble échangé n'est pas fait (ce qui décale l'objet de décembre).
export function stock(d, ville, date, { dixieme = 0, extras = false, bonus = false } = {}) {
  const [annee, mois, jour] = [date.getFullYear() - 2000, date.getMonth() + 1, date.getDate()];
  const niv = Math.max(0, Math.min(3, ville.niveau | 0));
  const t = k => d.tailles[k][niv];
  const h = new Hasard(graine(ville.ordres, annee, mois, jour));
  const s = saison(mois, jour);
  const res = [];
  const ajouter = (codes, section) => codes.forEach(code => res.push({ code, section }));

  // Outils (au niveau 0, des quatre premiers seulement ; sans canne, le jeu en met une à l'une des deux premières
  // places, au hasard : ces deux places sont incertaines).
  const outils = tirerPlages(d, t('outils'), 0, niv === 0 ? 4 : 7, h).map(i => d.outils[i]);
  ajouter(outils, 'outils');
  if (niv === 0 && !outils.includes(CANNE)) {
    for (let i = 0; i < Math.min(2, outils.length); i++) res[i].incertain = 'canne';
    res.push({ code: CANNE, section: 'outils', ajout: true });
  }
  ajouter(tirerLot(d, t('meubles'), 0, 0, ville.ordres, s, h, dixieme), 'meubles');
  ajouter(tirerPlages(d, t('douze'), 0, 12, h).map(i => d.douze[i]), 'graines');
  ajouter(tirerPlages(d, t('pousses'), 0x151d, 2, h), 'pousses');
  ajouter(tirerLot(d, t('papiers'), 4, 0, ville.ordres, s, h, dixieme), 'papiers');
  ajouter(tirerLot(d, t('moquettes'), 3, 0, ville.ordres, s, h, dixieme), 'moquettes');
  ajouter(tirerLot(d, t('papeterie'), 1, 0, ville.ordres, s, h, dixieme), 'papeterie');
  for (let i = 0; i < t('toit'); i++) res.push({ code: PEINTURE_TOIT, section: 'toit', incertain: 'couleur' });
  ajouter(tirerPlages(d, t('bouteille'), 0x151f, 1, h), 'bouteille');
  ajouter(tirerPlages(d, 1, 0x155e, 1, h), 'medicament');

  // Extras du jour (seulement si un joueur n'a pas fini de travailler pour Nook) : les soldes d'une heure un jour sur
  // 14, sinon (et pas le jour des points bonus) un meuble échangé contre un du lot (0, 4) un jour sur 5.
  let soldes = 0;
  if (extras) {
    h.sous(2); // pour choisir le prochain jour des points bonus (samedi ou dimanche)
    if (h.sous(14) === 0) soldes = h.sous(4) + 17;
    if (!soldes && !bonus && h.sous(5) === 0) {
      const i = res.findIndex(x => estMeuble(x.code));
      if (i >= 0) {
        const [nouveau] = tirerLot(d, 1, 0, 4, ville.ordres, s, h, dixieme);
        res[i] = { code: nouveau, section: 'meubles', echange: true };
      }
    }
  }
  // Décembre : le deuxième meuble devient un objet de saison (du 10 au 24, puis du 26 au 31).
  if (mois === 12 && ((jour >= 10 && jour <= 24) || (jour >= 26 && jour <= 31))) {
    const places = res.map((x, i) => (estMeuble(x.code) ? i : -1)).filter(i => i >= 0);
    if (places.length > 1) {
      const [noel] = tirerLot(d, 1, 0, jour <= 24 ? 0x2b : 0x2c, ville.ordres, s, h, dixieme);
      res[places[1]] = { code: noel, section: 'meubles', saisonnier: true };
    }
  }
  return { objets: res, soldes };
}

// ---- les Doigts de fée (tailor_stock.c) ----
// Six objets par jour, tirés avec le même hasard daté (même graine que Nook) : un parapluie, trois vêtements (groupe
// de rareté selon le feng shui, comme les meubles), un chapeau ou une casquette (au prorata de leur nombre dans le
// lot des Doigts de fée), un accessoire. Pas d'extras ni de niveau.
const LOT_FEE = 0x1d;
export function stockFee(d, ville, date, { dixieme = 0 } = {}) {
  const [annee, mois, jour] = [date.getFullYear() - 2000, date.getMonth() + 1, date.getDate()];
  const h = new Hasard(graine(ville.ordres, annee, mois, jour));
  const s = saison(mois, jour);
  const dans = l => l.filter(([g]) => g === LOT_FEE).length;
  const objets = [];
  const ajouter = (codes, section) => codes.forEach(code => objets.push({ code, section }));
  ajouter(tirerLot(d, 1, 7, LOT_FEE, ville.ordres, s, h, dixieme), 'parapluies');
  ajouter(tirerLot(d, 3, 2, 0, ville.ordres, s, h, dixieme), 'vetements');
  const chapeaux = dans(d.chapeaux), casquettes = dans(d.casquettes);
  const genre = h.sous(chapeaux + casquettes) < chapeaux ? 6 : 8;
  ajouter(tirerLot(d, 1, genre, LOT_FEE, ville.ordres, s, h, dixieme), 'chapeaux');
  ajouter(tirerLot(d, 1, 5, LOT_FEE, ville.ordres, s, h, dixieme), 'accessoires');
  return { objets };
}
// Les codes du stock des Doigts de fée tels que la sauvegarde les garde (codes « posés dans une pièce »), ramenés aux
// codes des objets (ItemForm_ToCarried).
const FORMES_PIECE = [[0x3984, 0x3d83, 0x11a8], [0x3e24, 0x3ea3, 0x1380], [0x3fa4, 0x40a3, 0x13c8], [0x40a4, 0x4123, 0x13a8], [0x4124, 0x4223, 0x1431]];
export function codeObjet(c) {
  for (const [premier, dernier, objet] of FORMES_PIECE) if (c >= premier && c <= dernier) return objet + ((c - premier) >> 2);
  return c;
}
// Et l'inverse : le code « posé » d'un objet (pour retrouver sa place dans le catalogue de la sauvegarde).
export function codePiece(c) {
  for (const [premier, dernier, objet] of FORMES_PIECE) if (c >= objet && c <= objet + ((dernier - premier) >> 2)) return premier + (c - objet) * 4;
  return c;
}
// Les valeurs de feng shui qui redonnent le stock des Doigts de fée lu dans la sauvegarde.
export function calibrerFee(d, ville, date, stockLu) {
  const lu = stockLu.map(codeObjet);
  const ok = [];
  for (let dixieme = 0; dixieme <= 60; dixieme++) {
    const calc = stockFee(d, ville, date, { dixieme }).objets;
    if (calc.length === lu.length && calc.every((x, i) => x.code === lu[i])) ok.push(dixieme);
  }
  return ok;
}

// ---- le feng shui de la maison (room_score.c, item_footprint.c, item_group_order.c) ----
// Dans chaque pièce, le jeu compte les meubles rouges dans les deux colonnes de l'est et les verts dans les deux
// rangées du sud (un point par couleur A ou B qui correspond ; un meuble compte seulement si toutes ses cases sont
// dans la bande). Le « dixième » des tirages est (rouges + verts) ÷ 10, arrondi (FX_Div), gardé sur un octet.
// pieces : les 5 pièces de la maison, chacune 2 couches de 16 × 16 codes ; taille : la taille de la maison (0-6).
// Le sol d'une pièce : 4 × 4, 6 × 6 puis 8 × 8 pour la pièce principale (tailles 0, 1, 2 et plus), 6 × 6 pour les
// quatre autres, construites une à une (tailles 3 à 6) ; centré en x, contre le bas (z 13).
const CASES = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]]];
// Forme 1 (deux cases) : la deuxième case tourne avec le côté (0 à 3) ; le jeu la remet « depuis sa deuxième case,
// tournée d'un demi-tour » (room_placement.c), ce qui fixe les côtés 0 et 1 à partir des côtés 2 et 3 vus dans une
// vraie sauvegarde.
const DEUX = [[1, 0], [0, -1], [-1, 0], [0, 1]];
function casesDe(forme, cote) {
  if (forme === 1) return [[0, 0], DEUX[cote]];
  return CASES[forme] || [[0, 0]];
}
export function tailleSol(piece, taille) {
  if (piece === 0) return taille <= 0 ? 4 : taille === 1 ? 6 : 8;
  return taille >= piece + 2 ? 6 : 0;
}
export function fengShui(d, pieces, taille) {
  let rouge = 0, vert = 0;
  pieces.forEach((codes, p) => {
    const s = tailleSol(p, taille);
    if (!s) return;
    const g = 8 - s / 2, dr = 7 + s / 2, h = 14 - s, b = 13;
    const compter = (l, r, t, bo, couleur) => {
      let n = 0;
      for (let c = 0; c < 2; c++) for (let z = t; z <= bo; z++) for (let x = l; x <= r; x++) {
        const code = codes[c * 256 + z * 16 + x];
        if (!estMeuble(code)) continue;
        const [a, bb, forme] = d.fengShui[Math.min(numMeuble(code), d.fengShui.length - 1)];
        if (!casesDe(forme, code & 3).every(([dx, dz]) => x + dx >= l && x + dx <= r && z + dz >= t && z + dz <= bo)) continue;
        if (a === couleur) n++;
        if (bb === couleur) n++;
      }
      return Math.min(n, 255);
    };
    rouge = (rouge + compter(dr - 1, dr, h, b, 2)) & 0xff;
    vert = (vert + compter(g, dr, b - 1, b, 4)) & 0xff;
  });
  // FX_Div(somme, 10.0) du SDK de la DS : quotient (somme × 2^32) ÷ (10 × 4096), puis (q + 2^19) >> 20 ; coupé à un octet.
  const q = Math.floor(((rouge + vert) * 2 ** 32) / 40960);
  const dixieme = Math.floor((q + 2 ** 19) / 2 ** 20) & 0xff;
  return { rouge, vert, dixieme };
}

// ---- calibration : les réglages (feng shui, extras) qui redonnent le stock lu dans la sauvegarde ----
// stockLu : les codes des places du magasin (AUCUN pour les places vides). Renvoie [{ dixieme, extras }].
export function calibrer(d, ville, date, stockLu) {
  const ok = [];
  const lu = stockLu.filter(c => c !== AUCUN);
  for (const extras of [false, true]) {
    for (let dixieme = 0; dixieme <= 60; dixieme++) {
      const calc = stock(d, ville, date, { dixieme, extras }).objets.filter(x => !x.ajout);
      if (calc.length === lu.length && calc.every((x, i) => x.code === lu[i] || x.incertain)) ok.push({ dixieme, extras });
    }
  }
  return ok;
}

// ---- le stock d'une date pour tous les réglages possibles : sûr, ou seulement possible ----
// reglages : la sortie de calibrer (ou [{ dixieme: 0, extras: false }] sans sauvegarde).
// Renvoie { objets: [{ code, section, sur, ... }], soldes } : un objet est « sûr » s'il est en vente quel que soit
// le réglage (et sans incertitude du jeu).
// Les objets de plusieurs stocks possibles d'un même jour, chacun une fois : « sûr » s'il est dans tous (sans incertitude
// du jeu) ; nombre : combien de fois il est en vente ce jour-là (deux pousses, par exemple), au plus.
function reunir(stocks) {
  const parCode = new Map();
  for (const st of stocks) {
    const ici = new Map();
    for (const x of st.objets) ici.set(x.code, [...(ici.get(x.code) || []), x]);
    for (const [code, l] of ici) {
      const e = parCode.get(code) || { ...l[0], fois: 0, nombre: 0 };
      e.fois++;
      e.nombre = Math.max(e.nombre, l.length);
      if (l.some(x => x.incertain)) e.incertain = l.find(x => x.incertain).incertain;
      parCode.set(code, e);
    }
  }
  return [...parCode.values()].map(e => ({ ...e, sur: e.fois === stocks.length && !e.incertain }));
}

// Le jour des points bonus : le jeu le choisit au fil des jours joués (le samedi ou le dimanche qui suit), on ne le
// connaît que s'il est déjà prévu dans la sauvegarde (ville.bonus, 'AAAA-MM-JJ', dans la semaine qui suit la sauvegarde) ; les autres
// samedis et dimanches, les deux cas sont calculés.
function casBonus(ville, date) {
  const j = date.getDay();
  if (j !== 0 && j !== 6) return [false];
  if (ville.bonus) {
    const [a, m, jj] = ville.bonus.split('-').map(Number);
    const b = new Date(a, m - 1, jj);
    const ecart = Math.round((date - b) / 86400000);
    if (Math.abs(ecart) <= 1) return [ecart === 0];
  }
  return [false, true];
}
// La peinture de toit : la couleur suit un compteur qui avance à chaque nouveau stock (un par jour joué). Le compteur
// lu dans la sauvegarde donne la couleur du jour de la sauvegarde (ville.date) et celle du prochain stock.
export const COULEURS_TOIT = ['grise', 'marron', 'rouge', 'rose', 'orange', 'jaune', 'vert clair', 'verte', 'vert foncé', 'turquoise',
  'bleu ciel', 'bleue', 'bleu marine', 'violette', 'lilas', 'rose vif'];
export function stockPossible(d, ville, date, reglages) {
  const stocks = reglages.flatMap(r => casBonus(ville, date).map(bonus => stock(d, ville, date, { ...r, bonus })));
  if (ville.peinture != null && ville.date && iso(date) === ville.date) {
    const code = PEINTURE_TOIT + ((ville.peinture + 15) % 16);
    stocks.forEach(st => st.objets.forEach(x => { if (x.section === 'toit') { x.code = code; delete x.incertain; } }));
  }
  const objets = reunir(stocks);
  const soldes = stocks.every(st => st.soldes === stocks[0].soldes) ? stocks[0].soldes : null;
  return { objets, soldes };
}

// Le stock des Doigts de fée pour tous les feng shui possibles (les extras ne les concernent pas).
export function feePossible(d, ville, date, reglages) {
  const dixiemes = [...new Set(reglages.map(r => r.dixieme))];
  return { objets: reunir(dixiemes.map(dixieme => stockFee(d, ville, date, { dixieme }))) };
}

// ---- quand Nook (ou les Doigts de fée) vendra-t-il ces objets ? ----
// Renvoie Map(code -> [{ date, sur }]) sur `jours` jours à partir de `depuis`.
export function prochainesVentes(d, ville, depuis, jours, reglages) {
  const res = new Map();
  for (let k = 0; k < jours; k++) {
    const date = new Date(depuis.getFullYear(), depuis.getMonth(), depuis.getDate() + k);
    for (const x of [...stockPossible(d, ville, date, reglages).objets, ...feePossible(d, ville, date, reglages).objets]) {
      if (!res.has(x.code)) res.set(x.code, []);
      res.get(x.code).push({ date, sur: x.sur });
    }
  }
  return res;
}
