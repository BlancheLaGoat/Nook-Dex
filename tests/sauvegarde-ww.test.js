// Tests automatiques de la lecture des sauvegardes de Wild World (src/renderer/lib/sauvegarde-ww.js).
// La sauvegarde est fabriquée ici octet par octet (aucun fichier du jeu dans le dépôt).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'sauvegarde-ww.js')).href);
const corr = require(path.join(RACINE, 'data', 'ww', 'sauvegarde.json'));
const { bitCatalogue } = require(path.join(RACINE, 'scripts', 'sauvegarde-ww.js'));

const TAILLE = 0x15FE0;
const P1 = 0x0C, P2 = 0x0C + 0x228C;
const lettres = t => [...t].map(c => (c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 64 : c >= 'a' && c <= 'z' ? c.charCodeAt(0) - 70 : 0x35 + Number(c)));
const mettreBit = (o, debut, n) => { o[debut + (n >> 3)] |= 1 << (n & 7); };

// Ville de test, avec une somme de contrôle juste (mot à 0x15FDC, comme le jeu).
function ville(remplir) {
  const s = new Uint8Array(TAILLE);
  remplir(s);
  let somme = 0;
  for (let i = 0; i < TAILLE; i += 2) if (i !== 0x15FDC) somme = (somme + (s[i] | (s[i + 1] << 8))) & 0xFFFF;
  const v = (0x10000 - somme) & 0xFFFF;
  s[0x15FDC] = v & 0xFF; s[0x15FDD] = v >> 8;
  return s;
}
const villeTest = () => ville(s => {
  s.set(lettres('Blanche'), P1 + 0x2282); s[P1 + 0x2280] = 0x77; s[P1 + 0x2281] = 0xC9;
  s.set(lettres('Lou2'), P2 + 0x2282); s[P2 + 0x2280] = 0x01;
  mettreBit(s, P1 + 0x1BDD, 1);     // 1er insecte attrapé
  mettreBit(s, P1 + 0x1BDD, 57);    // 1er poisson attrapé
  mettreBit(s, P1 + 0x1BDD, 112);   // dernier poisson (cœlacanthe)
  mettreBit(s, P1 + 0x1B48, corr.catalogue[0].bit);
  s[0x15D50] = 0x21;                // fossile 0 : joueur 1, fossile 1 : joueur 2
  s[0x15D50 + 0x1B] = 0x30;         // poisson 1 : joueur 3
  s[0x15D50 + 0x38] = 0x04;         // insecte 0 : joueur 4
  s[0x15D50 + 0x55 + 9] = 0x50;     // tableau 19 : ancien habitant
});
function sav(v, copie = 0) {
  const o = new Uint8Array(0x40000);
  o.set(v, copie);
  return o;
}
function dsv(o) {
  const pied = '|<--Snip above here to create a raw sav by excluding this DeSmuME savedata footer:';
  const fin = new Uint8Array(pied.length + 24 + 16);
  for (let i = 0; i < pied.length; i++) fin[i] = pied.charCodeAt(i);
  fin[pied.length + 2] = 0x04; // taille 0x40000
  const marque = '|-DESMUME SAVE-|';
  for (let i = 0; i < 16; i++) fin[fin.length - 16 + i] = marque.charCodeAt(i);
  const r = new Uint8Array(o.length + fin.length);
  r.set(o); r.set(fin, o.length);
  return r;
}

test('lit une sauvegarde .sav : joueurs, encyclopédie, catalogue et musée', async () => {
  const { lireSauvegardeWW } = await charger();
  const s = lireSauvegardeWW(sav(villeTest()));
  assert.strictEqual(s.format, 'sav');
  assert.strictEqual(s.copie, 'principale');
  assert.deepStrictEqual(s.joueurs.map(j => [j.nom, j.existe]), [['Blanche', true], ['Lou2', true], ['', false], ['', false]]);
  assert.deepStrictEqual([...s.joueurs[0].attrapes].sort((a, b) => a - b), [1, 57, 112]);
  assert.ok(s.joueurs[0].catalogue.has(corr.catalogue[0].bit));
  assert.deepStrictEqual(s.musee.fossiles.slice(0, 3), [1, 2, 0]);
  assert.deepStrictEqual(s.musee.poissons.slice(0, 2), [0, 3]);
  assert.strictEqual(s.musee.insectes[0], 4);
  assert.strictEqual(s.musee.art[19], 5);
  assert.deepStrictEqual(Object.values(s.musee).map(l => l.length), [52, 56, 56, 20]);
});

test('accepte le .dsv de DeSmuME / RetroArch et la copie de secours', async () => {
  const { lireSauvegardeWW, extraireSauvegarde } = await charger();
  const o = dsv(sav(villeTest(), TAILLE));
  assert.strictEqual(extraireSauvegarde(o).donnees.length, 0x40000);
  o[5] = 1; // copie principale (vide) abîmée
  const s = lireSauvegardeWW(o);
  assert.strictEqual(s.format, 'dsv');
  assert.strictEqual(s.copie, 'secours');
  assert.strictEqual(s.joueurs[0].nom, 'Blanche');
});

test('refuse un fichier trop petit ou abîmé', async () => {
  const { lireSauvegardeWW } = await charger();
  assert.throws(() => lireSauvegardeWW(new Uint8Array(1000)), /pas une sauvegarde/);
  const o = sav(villeTest());
  o[0x100] ^= 0xFF; o[TAILLE + 1] = 1;
  assert.throws(() => lireSauvegardeWW(o), /abîmée/);
});

test("cochesImportWW : musée pour toute la ville, encyclopédie et catalogue du joueur choisi", async () => {
  const { lireSauvegardeWW, cochesImportWW } = await charger();
  const s = lireSauvegardeWW(sav(villeTest()));
  const c = new Map(cochesImportWW(s, corr, 1).map(x => [`${x.categorie}:${x.id}`, x]));
  assert.ok(c.get(`fossiles:${corr.musee.fossiles[0]}`).musee);
  assert.ok(c.get(`fossiles:${corr.musee.fossiles[1]}`).musee);
  assert.ok(c.get(`poissons:${corr.musee.poissons[1]}`).musee);
  assert.ok(c.get(`art:${corr.musee.art[19]}`).musee);
  const ins = c.get(`insectes:${corr.musee.insectes[0]}`);
  assert.ok(ins.musee && ins.obtenu);
  assert.strictEqual(c.get(`poissons:${corr.musee.poissons[0]}`).obtenu, true);   // attrapé, pas donné
  assert.strictEqual(c.get(`poissons:${corr.musee.poissons[0]}`).musee, undefined);
  assert.strictEqual(c.get('poissons:coelacanth').obtenu, true);
  assert.strictEqual(c.get(`${corr.catalogue[0].categorie}:${corr.catalogue[0].id}`).obtenu, true);
  assert.ok(cochesImportWW(s, corr, 2).every(x => x.musee));
});

test('correspondance : musée et encyclopédie reliés à des fiches existantes, sans doublon', () => {
  assert.deepStrictEqual(Object.values(corr.musee).map(l => l.length), [52, 56, 56, 20]);
  for (const [cat, ids] of Object.entries(corr.musee)) {
    const fiches = new Set(require(path.join(RACINE, 'data', 'ww', `${cat}.json`)).map(e => e.id));
    for (const id of ids) assert.ok(fiches.has(id), `${cat} : ${id}`);
    assert.strictEqual(new Set(ids).size, ids.length, `${cat} : doublon`);
  }
  assert.strictEqual(corr.musee.poissons[55], 'coelacanth');
  assert.strictEqual(corr.encyclopedie.poissons.premier, 57);
  const bits = corr.catalogue.map(c => c.bit);
  assert.strictEqual(new Set(bits).size, bits.length, 'deux fiches sur le même bit du catalogue');
  for (const c of corr.catalogue) {
    const fiches = require(path.join(RACINE, 'data', 'ww', `${c.categorie}.json`));
    assert.ok(fiches.some(e => e.id === c.id), `${c.categorie} : ${c.id}`);
  }
});

test('bitCatalogue : meubles, papiers peints, sols, morceaux de K.K. et papeterie', () => {
  assert.strictEqual(bitCatalogue(0x3000), 0);
  assert.strictEqual(bitCatalogue(0x3894), (0x3894 - 0x3000) / 4);
  assert.strictEqual(bitCatalogue(0x1100), 0x800);
  assert.strictEqual(bitCatalogue(0x1144), 0x848);
  assert.strictEqual(bitCatalogue(0x1323), 0x890);
  assert.strictEqual(bitCatalogue(0x1004), 0x8D9);
  assert.strictEqual(bitCatalogue(0x1005), null);
  assert.strictEqual(bitCatalogue(0x12B0), null);
});

test('fleursVilleWW : fleurs de la carte (acre par acre), assoiffées, arrosées, rose dorée', async () => {
  const { fleursVilleWW } = await charger();
  // Objet (acre 0 à 15, 4 par ligne ; case x, y dans l'acre).
  const poser = (s, acre, x, y, id) => { const p = 0xC354 + (acre * 256 + y * 16 + x) * 2; s[p] = id & 0xFF; s[p + 1] = id >> 8; };
  const v = fleursVilleWW(sav(ville(s => {
    for (let i = 0; i < 4096; i++) poser(s, i >> 8, i & 15, (i >> 4) & 15, 0xFFF1); // carte vide
    s.set(lettres('Blanche'), P1 + 0x2282); s[P1 + 0x2280] = 0x77;
    poser(s, 0, 0, 0, 0x12);            // A1 : rose rouge
    poser(s, 0, 1, 0, 0x19 + 0x6E);     // A1 : rose bleue assoiffée
    poser(s, 5, 2, 3, 0x0B + 0x8A);     // B2 : pensée bleue arrosée
    poser(s, 15, 15, 15, 0x1C);         // D4 : rose dorée
    poser(s, 5, 3, 3, 0x1A);            // B2 : échelle de Jacob (pas une fleur à croiser)
  })));
  const a = (x, y) => v.cases[y * 64 + x];
  assert.deepStrictEqual([v.largeur, v.hauteur], [64, 64]);
  assert.deepStrictEqual(a(0, 0), { espece: 'Roses', couleur: 'rouge', etat: 'normale' });
  assert.deepStrictEqual(a(1, 0), { espece: 'Roses', couleur: 'bleu', etat: 'assoiffee' });
  assert.deepStrictEqual(a(16 + 2, 16 + 3), { espece: 'Pensées', couleur: 'bleu', etat: 'arrosee' });
  assert.deepStrictEqual(a(63, 63), { espece: 'Roses', couleur: 'or', etat: 'normale' });
  assert.deepStrictEqual(a(16 + 3, 16 + 3), { objet: 0x1A });
  assert.strictEqual(a(5, 5), null);
  assert.strictEqual(v.cases.filter(c => c && c.espece).length, 4);
});

test('navetsWW : prix d\'achat, 12 cours (le pic à part), motif et date', async () => {
  const { navetsWW } = await charger();
  const p = 0x15F4C;
  const v = navetsWW(sav(ville(s => {
    s.set(lettres('Blanche'), P1 + 0x2282); s[P1 + 0x2280] = 0x77;
    s[p] = 17; s[p + 1] = 2; s[p + 2] = 26;            // 17/02/2026
    s[p + 8] = 0x58; s[p + 9] = 0x02;                  // pic : 600
    s.set([100, 100, 79, 76, 74, 71, 99, 150, 0, 160, 110, 78, 76, 73], p + 0x0A);
    s[p + 0x18] = 1;                                   // gros pic
  })));
  assert.deepStrictEqual(v, { semaine: { jour: 17, mois: 2, annee: 2026 }, achat: 100, cours: [79, 76, 74, 71, 99, 150, 600, 160, 110, 78, 76, 73], motif: 1 });
});
