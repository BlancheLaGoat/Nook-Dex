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
