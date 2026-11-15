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
export function stock(d, ville, date, { dixieme = 0, extras = false } = {}) {
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
  // 14, sinon un meuble échangé contre un du lot (0, 4) un jour sur 5, sauf le jour des points bonus (un samedi ou
  // un dimanche, choisi par le jeu au fil des jours : incertain).
  let soldes = 0;
  if (extras) {
    h.sous(2); // le jour des points bonus (samedi ou dimanche)
    if (h.sous(14) === 0) soldes = h.sous(4) + 17;
    if (!soldes && h.sous(5) === 0) {
      const i = res.findIndex(x => estMeuble(x.code));
      if (i >= 0) {
        const [nouveau] = tirerLot(d, 1, 0, 4, ville.ordres, s, h, dixieme);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        res[i] = { code: nouveau, section: 'meubles', echange: true, ...(weekend ? { incertain: 'bonus' } : {}) };
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
export function stockPossible(d, ville, date, reglages) {
  const stocks = reglages.map(r => stock(d, ville, date, r));
  const parCode = new Map();
  stocks.forEach(st => st.objets.forEach(x => {
    const e = parCode.get(x.code) || { ...x, fois: 0 };
    e.fois++;
    if (x.incertain) e.incertain = x.incertain;
    parCode.set(x.code, e);
  }));
  const objets = [...parCode.values()].map(e => ({ ...e, sur: e.fois === stocks.length && !e.incertain }));
  const soldes = stocks.every(st => st.soldes === stocks[0].soldes) ? stocks[0].soldes : null;
  return { objets, soldes };
}

// ---- quand Nook vendra-t-il ces objets ? ----
// Renvoie Map(code -> [{ date, sur }]) sur `jours` jours à partir de `depuis`.
export function prochainesVentes(d, ville, depuis, jours, reglages) {
  const res = new Map();
  for (let k = 0; k < jours; k++) {
    const date = new Date(depuis.getFullYear(), depuis.getMonth(), depuis.getDate() + k);
    for (const x of stockPossible(d, ville, date, reglages).objets) {
      if (!res.has(x.code)) res.set(x.code, []);
      res.get(x.code).push({ date, sur: x.sur });
    }
  }
  return res;
}
