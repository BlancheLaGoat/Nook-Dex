// Tests automatiques de la version Android : lecture des .zip (mobile/src/zip.js) et « pont » (mobile/src/mobile.js),
// exécuté ici dans un faux navigateur (stockage en mémoire, données lues dans data/).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const zlib = require('zlib');

const RACINE = path.join(__dirname, '..');
const { lireZip, sauvegardeNHDepuisZip } = require(path.join(RACINE, 'mobile', 'src', 'zip.js'));
const Profil = require(path.join(RACINE, 'src', 'shared', 'profil.js'));
// Les objets du faux navigateur viennent d'un autre « monde » (vm) : on compare leur forme en JSON.
const plat = x => JSON.parse(JSON.stringify(x));

// Petite archive .zip fabriquée ici : chaque fichier « stocké » (méthode 0) ou compressé (méthode 8).
function fabriquerZip(fichiers) {
  const locaux = [], centraux = [];
  let decalage = 0;
  for (const [nom, contenu, compresser] of fichiers) {
    const n = Buffer.from(nom, 'utf8');
    const donnees = compresser ? zlib.deflateRawSync(contenu) : Buffer.from(contenu);
    const crc = zlib.crc32(contenu) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034B50, 0); local.writeUInt16LE(compresser ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(donnees.length, 18); local.writeUInt32LE(contenu.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014B50, 0); central.writeUInt16LE(compresser ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(donnees.length, 20); central.writeUInt32LE(contenu.length, 24);
    central.writeUInt16LE(n.length, 28); central.writeUInt32LE(decalage, 42);
    locaux.push(local, n, donnees); centraux.push(central, n);
    decalage += 30 + n.length + donnees.length;
  }
  const rep = Buffer.concat(centraux);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054B50, 0); fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(rep.length, 12); fin.writeUInt32LE(decalage, 16);
  return new Uint8Array(Buffer.concat([...locaux, rep, fin]));
}

test('zip : fichiers stockés et compressés, dossiers ignorés', async () => {
  const gros = Buffer.alloc(5000, 7);
  const z = fabriquerZip([['a.txt', Buffer.from('bonjour'), false], ['dossier/', Buffer.alloc(0), false], ['dossier/b.bin', gros, true]]);
  const f = await lireZip(z);
  assert.deepStrictEqual([...f.keys()], ['a.txt', 'dossier/b.bin']);
  assert.strictEqual(Buffer.from(f.get('a.txt')).toString(), 'bonjour');
  assert.ok(Buffer.from(f.get('dossier/b.bin')).equals(gros));
  await assert.rejects(lireZip(new Uint8Array(100)), /pas une archive/);
});

test('zip : sauvegarde New Horizons dans un sous-dossier, même forme que sur PC', async () => {
  const z = fabriquerZip([
    ['ile/main.dat', Buffer.alloc(64, 1), true], ['ile/mainHeader.dat', Buffer.alloc(16, 2), false],
    ['ile/Villager0/personal.dat', Buffer.alloc(32, 3), true], ['ile/Villager0/personalHeader.dat', Buffer.alloc(8, 4), false],
    ['ile/Villager1/personal.dat', Buffer.alloc(32, 5), true], // sans personalHeader : ignoré
    ['ile/landname.dat', Buffer.alloc(4), false],
  ]);
  const s = await sauvegardeNHDepuisZip(z, 'MonIle.zip');
  assert.strictEqual(s.nom, 'MonIle');
  assert.strictEqual(s.octets.main.length, 64);
  assert.strictEqual(s.octets.mainHeader[0], 2);
  assert.deepStrictEqual(s.octets.joueurs.map(j => j.dossier), ['Villager0']);
  assert.strictEqual(s.octets.joueurs[0].personal[0], 3);
  await assert.rejects(sauvegardeNHDepuisZip(fabriquerZip([['x.dat', Buffer.alloc(2), false]])), /main\.dat introuvable/);
});

// Faux navigateur : localStorage en mémoire, fetch qui lit data/ et NOUVEAUTES.md, document minimal.
function navigateur() {
  const memoire = new Map();
  const localStorage = {
    getItem: k => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => memoire.set(k, String(v)),
    removeItem: k => memoire.delete(k), key: i => [...memoire.keys()][i], get length() { return memoire.size; },
  };
  const fetch = async url => {
    const f = path.join(RACINE, url);
    if (!fs.existsSync(f)) return { ok: false, status: 404 };
    const t = fs.readFileSync(f, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t };
  };
  const document = { addEventListener() {}, querySelector: () => null, getElementById: () => null, body: { classList: { add() {}, remove() {}, contains: () => false } } };
  const fenetre = { NOOK_VERSION: '1.6.0', NookProfil: Profil, localStorage, fetch, document, console, setTimeout, setInterval, URL, Blob };
  fenetre.window = fenetre;
  const ctx = vm.createContext(fenetre);
  // Object.keys(localStorage) donne les clés, comme dans un navigateur.
  vm.runInContext('Object.keys = (k => o => (o === localStorage ? [...Array(o.length).keys()].map(i => o.key(i)) : k(o)))(Object.keys);', ctx);
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'mobile', 'src', 'mobile.js'), 'utf8'), ctx);
  return { nook: fenetre.nook, memoire };
}

test('pont Android : données des jeux, mêmes fonctions que le pont du PC', async () => {
  const { nook } = navigateur();
  const preload = fs.readFileSync(path.join(RACINE, 'src', 'preload.js'), 'utf8');
  const fonctionsPc = [...preload.matchAll(/^ {2}(\w+):/gm)].map(m => m[1]);
  assert.ok(fonctionsPc.length > 25);
  for (const f of fonctionsPc) assert.ok(f in nook, `fonction manquante sur Android : ${f}`);
  assert.strictEqual(nook.plateforme, 'android');
  assert.ok((await nook.jeux()).some(j => j.id === 'cf'));
  assert.strictEqual((await nook.categorie('cf', 'insectes')).length, 64);
  assert.deepStrictEqual(plat(await nook.categorie('cf', 'inexistant')), []);
  await assert.rejects(nook.categorie('../x', 'insectes'), /invalide/);
  assert.ok((await nook.arrosoir()).regles);
  assert.match(await nook.nouveautes(), /^# Nouveautés de Nook Dex/);
  assert.strictEqual((await nook.infosApp()).version, '1.6.0');
});

test('pont Android : images seulement depuis les sites autorisés', () => {
  const { nook } = navigateur();
  assert.strictEqual(nook.urlImage('https://dodo.ac/np/images/a.png'), 'https://dodo.ac/np/images/a.png');
  assert.strictEqual(nook.urlImage('https://exemple.com/a.png'), '');
  assert.strictEqual(nook.urlImage('http://dodo.ac/a.png'), '');
  assert.strictEqual(nook.urlImage('pas une adresse'), '');
});

test('pont Android : profils (créer, lister, écrire, corbeille) et réglages', async () => {
  const { nook, memoire } = navigateur();
  const p = await nook.creerProfil({ nom: 'Blanche', jeu: 'cf', hemisphere: 'sud' });
  assert.match(p.id, /^p-[0-9a-f]{8}$/);
  assert.deepStrictEqual(plat(await nook.listerProfils()), [{ id: p.id, nom: 'Blanche', jeu: 'cf', hemisphere: 'sud', extensions: [], nb: 0 }]);
  await nook.ecrireProfil({ ...p, elements: { 'insectes:common-butterfly': { obtenu: true } } });
  assert.strictEqual((await nook.listerProfils())[0].nb, 1);
  assert.strictEqual((await nook.lireProfil(p.id)).elements['insectes:common-butterfly'].obtenu, true);
  await assert.rejects(nook.lireProfil('../../x'), /invalide/);
  // Aucun fichier temporaire ne reste.
  assert.ok(![...memoire.keys()].some(k => k.endsWith('.tmp')));
  // Supprimer = mettre à la corbeille.
  assert.strictEqual(await nook.supprimerProfil(p.id), true);
  assert.deepStrictEqual(plat(await nook.listerProfils()), []);
  assert.ok([...memoire.keys()].some(k => k.startsWith(`nookdex/corbeille/${p.id}-`)));
  assert.strictEqual(await nook.supprimerProfil(p.id), false);
  // Réglages : seules les valeurs connues sont gardées.
  assert.deepStrictEqual(plat(await nook.ecrireReglages({ theme: 'sombre', pirate: 1 })), { theme: 'sombre', profilActif: null, dateSimulee: null, derniereVersionVue: null });
  assert.strictEqual((await nook.lireReglages()).theme, 'sombre');
});

test("profil partagé PC / Android : vérification et nom d'export", () => {
  assert.throws(() => Profil.normaliserProfil({ nom: 'x' }), /jeu ou nom manquant/);
  assert.throws(() => Profil.normaliserProfil({ nom: 'x', jeu: 'cf', schema: 99 }), /plus récente/);
  const p = Profil.normaliserProfil({ nom: 'Lou / Bourg ?', jeu: 'nh', id: 'MAJ' }, () => 'p-00000000');
  assert.strictEqual(p.id, 'p-00000000');
  assert.strictEqual(Profil.nomExportProfil(p), 'nook-dex-nh-Lou  Bourg.json');
  assert.strictEqual(Profil.nouvelId(() => [0, 1, 0xab, 0xff]), 'p-0001abff');
});
