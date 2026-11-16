// Tests automatiques de la lecture des sauvegardes de City Folk (src/renderer/lib/sauvegarde-cf.js).
// La sauvegarde est fabriquée ici octet par octet (aucun fichier du jeu dans le dépôt).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'sauvegarde-cf.js')).href);
const corr = require(path.join(RACINE, 'data', 'cf', 'sauvegarde.json'));

const TAILLE = 0x40F340, JOUEUR = 0x86C0, CATALOGUE = 0x841A, MUSEE = 0x7352A;
const bit = n => (n - 0x9000) / 4;
const ecrireNom = (o, p, nom) => [...nom].forEach((c, i) => { o[p + 2 * i + 1] = c.charCodeAt(0); });
const mettreBit = (o, debut, n) => { o[debut + (n >> 3)] |= 1 << (n & 7); };
// CRC32 du joueur (à +0x1140, grand-boutiste), comme le jeu.
function signer(o, n) {
  const p = n * JOUEUR;
  const c = zlib.crc32(o.subarray(p + 0x1144, p + 0x1144 + 0x759C)) >>> 0;
  o[p + 0x1140] = c >>> 24; o[p + 0x1141] = (c >>> 16) & 0xFF; o[p + 0x1142] = (c >>> 8) & 0xFF; o[p + 0x1143] = c & 0xFF;
}

function sauvegardeTest() {
  const o = new Uint8Array(TAILLE);
  ecrireNom(o, 0x7EFA, 'Blanche'); ecrireNom(o, 0x7EE4, 'Bourg');
  ecrireNom(o, JOUEUR + 0x7EFA, 'Lou');
  mettreBit(o, CATALOGUE, bit(0x9960));            // papillon commun attrapé
  mettreBit(o, CATALOGUE, bit(0x9BEC));            // cœlacanthe attrapé
  mettreBit(o, CATALOGUE, bit(0xB710));            // premier meuble : lit exotique
  mettreBit(o, CATALOGUE, bit(0x9644));            // papier avion (les 4 quantités ont le même bit)
  mettreBit(o, CATALOGUE, 4096);                   // premier morceau de K.K.
  mettreBit(o, JOUEUR + CATALOGUE, bit(0xCE80));   // joueur 2 : la hache
  // Musée (comme le jeu) : case paire = quartet bas ; fossiles +0x00, poissons +0x1E, insectes +0x3F, tableaux +0x60.
  o[MUSEE] = 0x21;              // fossile 0 : joueur 1, fossile 1 : joueur 2
  o[MUSEE + 0x1E] = 0x03;       // poisson 0 : joueur 3
  o[MUSEE + 0x3F + 31] = 0x40;  // insecte 63 : joueur 4
  o[MUSEE + 0x60 + 11] = 0x02;  // tableau 22 : joueur 2
  o[MUSEE + 0x3E] = 0x55;       // dernier octet des poissons (cases 64-65, vides) : ne doit pas compter pour les insectes
  for (let n = 0; n < 4; n++) signer(o, n);
  return o;
}

test('le CRC32 maison donne le même résultat que zlib', async () => {
  const { crc32 } = await charger();
  const o = new TextEncoder().encode('Nook Dex City Folk');
  assert.strictEqual(crc32(o, 0, o.length), zlib.crc32(o) >>> 0);
});

test('lit une sauvegarde : joueurs, ville, catalogue, musée', async () => {
  const { lireSauvegardeCF } = await charger();
  const s = lireSauvegardeCF(sauvegardeTest());
  assert.strictEqual(s.ville, 'Bourg');
  assert.deepStrictEqual(s.joueurs.map(j => [j.nom, j.existe]), [['Blanche', true], ['Lou', true], ['', false], ['', false]]);
  assert.ok(s.joueurs[0].catalogue.has(600) && s.joueurs[0].catalogue.has(4096));
  assert.deepStrictEqual(s.musee.fossiles.slice(0, 3), [1, 2, 0]);
  assert.strictEqual(s.musee.poissons[0], 3);
  assert.strictEqual(s.musee.insectes[63], 4);
  assert.deepStrictEqual(s.musee.insectes.slice(0, 2), [0, 0]);
  assert.strictEqual(s.musee.art[22], 2);
});

test("l'import coche les bonnes fiches, et seulement pour le joueur choisi", async () => {
  const { lireSauvegardeCF, cochesImportCF } = await charger();
  const s = lireSauvegardeCF(sauvegardeTest());
  const cles = c => c.filter(x => !x.musee).map(x => `${x.categorie}:${x.id}`).sort();
  assert.deepStrictEqual(cles(cochesImportCF(s, corr, 1)),
    ['insectes:common-butterfly', 'kk:kk-chorale', 'meubles:exotic-bed', 'papeterie:airmail-paper', 'poissons:coelacanth'].sort());
  assert.deepStrictEqual(cles(cochesImportCF(s, corr, 2)), ['outils:axe']);
  const musee = cochesImportCF(s, corr, 1).filter(x => x.musee).map(x => `${x.categorie}:${x.id}`).sort();
  assert.deepStrictEqual(musee, [`art:${corr.musee.art[22]}`, 'fossiles:amber', 'fossiles:ammonite',
    `insectes:${corr.musee.insectes[63]}`, 'poissons:bitterling'].sort());
});

test("correspondance : créatures dans l'ordre du jeu, morceaux de K.K. après le catalogue", () => {
  assert.strictEqual(corr.encyclopedie.insectes.premier, 600);
  assert.strictEqual(corr.encyclopedie.poissons.premier, 700);
  assert.strictEqual(corr.musee.insectes[0], 'common-butterfly');
  assert.strictEqual(corr.musee.poissons[63], 'coelacanth');
  assert.strictEqual(corr.musee.fossiles.length, 58);
  assert.ok(corr.catalogue.every(c => (c.categorie === 'kk' ? c.bit >= 4096 : c.bit < 4096)));
  assert.strictEqual(new Set(corr.catalogue.map(c => c.bit)).size, corr.catalogue.length);
});

test('refuse les fichiers qui ne sont pas un RVFOREST.DAT en clair, ou abîmés', async () => {
  const { lireSauvegardeCF } = await charger();
  assert.throws(() => lireSauvegardeCF(new Uint8Array(1000)), /pas une sauvegarde de City Folk/);
  assert.throws(() => lireSauvegardeCF(new Uint8Array(0x478B80)), /chiffré/);
  const abimee = sauvegardeTest(); abimee[0x2000] ^= 1; abimee[JOUEUR + 0x2000] ^= 1;
  assert.throws(() => lireSauvegardeCF(abimee), /abîmée/);
});

test("navets : prix d'achat, 12 cours et motif de la semaine (vraie semaine à gros pic)", async () => {
  const { navetsCF } = await charger();
  const { predireCF } = await import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'navets-cf.js')).href);
  const o = sauvegardeTest();
  // Semaine lue dans une vraie sauvegarde américaine : 16 mots de 32 bits à 0x63200.
  [97, 100, 100, 77, 74, 70, 105, 158, 223, 157, 123, 76, 73, 69, 64, 1].forEach((v, i) => {
    o[0x63200 + 4 * i + 2] = v >> 8; o[0x63200 + 4 * i + 3] = v & 0xFF;
  });
  const n = navetsCF(o);
  assert.deepStrictEqual(n, { achat: 97, cours: [77, 74, 70, 105, 158, 223, 157, 123, 76, 73, 69, 64], motif: 1 });
  const p = predireCF({ achat: n.achat, cours: n.cours, premierAchat: false, motifPrecedent: null });
  assert.strictEqual(p.motifs.find(m => m.id === n.motif).chance, 1);
  // Pas encore de prix : rien d'inventé.
  assert.deepStrictEqual(navetsCF(sauvegardeTest()), { achat: null, cours: Array(12).fill(null), motif: 0 });
  assert.throws(() => navetsCF(new Uint8Array(10)), /City Folk/);
});
