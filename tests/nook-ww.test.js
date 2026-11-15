// Tests automatiques du stock du magasin de Nook (src/renderer/lib/nook-ww.js).
// La vraie vérification (37 places sur 37 retrouvées pour une vraie sauvegarde européenne) a été faite à la main ;
// ces tests gardent les propriétés du calcul. Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'nook-ww.js')).href);
const d = require(path.join(RACINE, 'data', 'ww', 'nook.json'));
const VILLE = { ordres: [0, 2, 2, 3, 3, 5, 1, 2, 5], niveau: 3 };

test('Nook (Wild World) : données de la ROM et tailles du stock par niveau', async () => {
  const { stock } = await charger();
  assert.equal(d.meubles.length, 0x6e9);
  assert.equal(d.ordres.length, 6);
  assert.deepEqual(d.tailles.meubles, [2, 3, 5, 8]);
  // Places de chaque niveau : sections + médicament (+ la canne du niveau 0, qui ne prend pas de place à elle).
  for (const [niveau, places] of [[0, 10], [1, 15], [2, 24], [3, 37]]) {
    const s = stock(d, { ...VILLE, niveau }, new Date(2026, 1, 17), { dixieme: 15 }).objets.filter(x => !x.ajout);
    assert.equal(s.length, places, `niveau ${niveau}`);
  }
});

test('Nook (Wild World) : une ville et une date donnent toujours le même stock', async () => {
  const { stock } = await charger();
  const a = stock(d, VILLE, new Date(2026, 1, 17), { dixieme: 15 }).objets.map(x => x.code);
  const b = stock(d, VILLE, new Date(2026, 1, 17), { dixieme: 15 }).objets.map(x => x.code);
  const c = stock(d, VILLE, new Date(2026, 1, 18), { dixieme: 15 }).objets.map(x => x.code);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  // Stock de la vraie ville vérifiée (sauvegarde du 17/02/2026) : ses premiers objets.
  assert.deepEqual(a.slice(0, 8), [0x1374, 0x1369, 0x136b, 0x137a, 0x1378, 0x156c, 0x373c, 0x3064]);
  // Décembre : un objet de saison parmi les meubles, du 10 au 24.
  assert.ok(stock(d, VILLE, new Date(2026, 11, 15), { dixieme: 15 }).objets.some(x => x.saisonnier));
});

test('Nook (Wild World) : la calibration retrouve le feng shui, les prévisions trouvent les dates', async () => {
  const { stock, calibrer, prochainesVentes, stockPossible } = await charger();
  const date = new Date(2026, 1, 17);
  const lu = stock(d, VILLE, date, { dixieme: 15 }).objets.map(x => x.code);
  const r = calibrer(d, VILLE, date, lu);
  assert.ok(r.some(x => x.dixieme === 15 && !x.extras));
  assert.ok(r.every(x => stock(d, VILLE, date, x).objets.every((y, i) => y.code === lu[i] || y.incertain)));
  const ventes = prochainesVentes(d, VILLE, date, 30, r);
  assert.ok(ventes.get(0x373c).some(x => x.date.getTime() === date.getTime()));
  const p = stockPossible(d, VILLE, date, r);
  assert.ok(p.objets.filter(x => x.sur).length >= 30);
});

test('Doigts de fée (Wild World) : stock de la ville vérifiée et codes de la sauvegarde', async () => {
  const { stockFee, codeObjet, codePiece, calibrerFee, prochainesVentes } = await charger();
  const date = new Date(2026, 1, 17);
  // Stock lu dans la vraie sauvegarde du 17/02/2026 (6 sur 6 retrouvés) : parapluie, trois vêtements, chapeau, accessoire.
  const attendu = [0x1383, 0x11c2, 0x1203, 0x11ad, 0x13f9, 0x1442];
  assert.deepEqual(stockFee(d, VILLE, date, { dixieme: 15 }).objets.map(x => x.code), attendu);
  // La sauvegarde les garde en codes « posés » : aller-retour exact.
  const lus = [0x3e30, 0x39ec, 0x3af0, 0x3998, 0x4068, 0x4168];
  assert.deepEqual(lus.map(codeObjet), attendu);
  assert.deepEqual(attendu.map(codePiece), lus);
  assert.ok(calibrerFee(d, VILLE, date, lus).includes(15));
  assert.equal(calibrerFee(d, VILLE, new Date(2026, 1, 18), lus).length, 0);
  // Les vêtements entrent dans les prévisions.
  assert.ok(prochainesVentes(d, VILLE, date, 1, [{ dixieme: 15, extras: false }]).has(0x11c2));
});

test('Feng shui (Wild World) : rouges à l\'est, verts au sud, arrondi du jeu', async () => {
  const { fengShui, tailleSol } = await charger();
  // Tailles des sols : pièce principale 4, 6 puis 8 ; les autres 6 × 6 une fois construites.
  assert.deepEqual([0, 1, 2, 6].map(t => tailleSol(0, t)), [4, 6, 8, 8]);
  assert.deepEqual([2, 3, 6].map(t => tailleSol(1, t)), [0, 6, 6]);
  assert.equal(tailleSol(4, 5), 0);
  // Un meuble d'une case, rouge (couleur A) et sans autre couleur ; un vert.
  const n = couleur => d.fengShui.findIndex(([a, b, forme]) => a === couleur && b !== 2 && b !== 4 && forme === 0);
  const rouge = 0x3000 + n(2) * 4, vert = 0x3000 + n(4) * 4;
  const vide = () => Array(512).fill(0xfff1);
  const pieces = [vide(), vide(), vide(), vide(), vide()];
  // Pièce principale 8 × 8 (x 4-11, z 6-13) : un rouge dans la colonne x 11, un autre au milieu (ne compte pas), un vert en z 13.
  pieces[0][6 * 16 + 11] = rouge;
  pieces[0][8 * 16 + 7] = rouge;
  pieces[0][13 * 16 + 5] = vert;
  assert.deepEqual(fengShui(d, pieces, 6), { rouge: 1, vert: 1, dixieme: 0 });
  // Les deux rangées du sud en vert (16 cases) et la colonne x 10 en rouge (z 6 à 12, dont la case (10, 12) prise
  // aux verts) : 8 rouges, 15 verts ; 23 ÷ 10 arrondi = 2.
  for (let x = 4; x <= 11; x++) { pieces[0][12 * 16 + x] = vert; pieces[0][13 * 16 + x] = vert; }
  for (let z = 6; z <= 12; z++) pieces[0][z * 16 + 10] = rouge;
  const r = fengShui(d, pieces, 6);
  assert.deepEqual(r, { rouge: 8, vert: 15, dixieme: 2 });
  // Arrondi de FX_Div au plus proche, la moitié vers le haut : 25 points donnent 3, 24 en donnent 2.
  pieces[0][6 * 16 + 4] = rouge; // hors des bandes : ne compte pas
  pieces[0][7 * 16 + 11] = rouge;
  assert.equal(fengShui(d, pieces, 6).dixieme, 2);
  pieces[0][9 * 16 + 11] = rouge;
  assert.deepEqual(fengShui(d, pieces, 6), { rouge: 10, vert: 15, dixieme: 3 });
  pieces[0][9 * 16 + 11] = 0xfff1;
  // Une pièce non construite ne compte pas.
  const avant = fengShui(d, pieces, 5);
  pieces[4][13 * 16 + 8] = vert;
  assert.deepEqual(fengShui(d, pieces, 5), avant);
  assert.equal(fengShui(d, pieces, 6).vert, avant.vert + 1);
});
