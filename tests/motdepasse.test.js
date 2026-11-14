// Tests du portage des mots de passe GameCube (src/renderer/lib/motdepasse-gc.js).
// Lancer avec : npm test   (après npm run donnees:codes)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'motdepasse-gc.js')).href);
const codes = JSON.parse(fs.readFileSync(path.join(RACINE, 'data', 'gc', 'codes.json'), 'utf8'));

// Dans le jeu, un meuble a 4 numéros qui se suivent (ses 4 orientations) : 0x1358 à 0x135B = Lit bleu.
// Les meubles sont dans les plages 0x1000-0x1FFF et 0x3000-0x3FFF.
const estMeuble = n => (n >= 0x1000 && n < 0x2000) || (n >= 0x3000 && n < 0x4000);
const memeObjet = (decode, attendu) => decode === attendu || (estMeuble(attendu) && (decode & ~3) === (attendu & ~3));

test('décode TOUS les codes du tableur : somme de contrôle juste et bon objet', async () => {
  const { decoder } = await charger();
  const echecs = [];
  let n = 0;
  for (const o of codes.objets) {
    for (const code of [o.code, o.code_liste].filter(Boolean)) {
      n++;
      const d = decoder(code);
      const attendu = parseInt(o.numero, 16);
      if (!d) echecs.push(`${o.nom_en} : code illisible`);
      else if (!d.sommeOk) echecs.push(`${o.nom_en} : somme de contrôle fausse`);
      else if (!memeObjet(d.objet, attendu)) echecs.push(`${o.nom_en} : objet ${d.objet.toString(16)} au lieu de ${o.numero}`);
    }
  }
  assert.ok(n >= 1281, `${n} codes testés`);
  assert.deepEqual(echecs, []);
});

test('codes universels du tableur GameCube : décodés, puis recréés à l\'identique', async () => {
  const { decoder, creer } = await charger();
  let n = 0;
  for (const o of codes.objets) {
    if (!o.code_universel) continue;
    n++;
    const d = decoder(o.code_universel);
    assert.ok(d && d.sommeOk, o.nom_en);
    assert.ok(memeObjet(d.objet, parseInt(o.numero, 16)), o.nom_en);
    const refait = creer({ nom: d.nomOctets, ville: d.villeOctets, objet: d.objet, typeCode: d.typeCode, hitRate: d.hitRate, typeExpediteur: Math.max(0, d.typeExpediteur), codeExpediteur: d.octetExpediteur });
    assert.equal(refait, o.code_universel, `${o.nom_en} : création différente du code d'origine`);
  }
  assert.ok(n > 1200);
});

test('noms contenus dans les codes qui vérifient le nom du joueur', async () => {
  const { decoder } = await charger();
  const noms = new Set();
  for (const o of codes.objets) {
    if (!o.code) continue;
    const d = decoder(o.code);
    if (['joueur', 'famicom', 'populaire'].includes(d.type)) noms.add(`${d.nom} / ${d.ville}`);
  }
  assert.deepEqual([...noms], ['! / !']);
});

test('créer un code pour « Blanche » : chaque objet se redécode avec les bons noms', async () => {
  const { creer, decoder } = await charger();
  for (const o of codes.objets) {
    const objet = parseInt(o.numero, 16);
    for (const typeCode of [3, 4]) {
      const code = creer({ nom: 'Blanche', ville: 'Testcity', objet, typeCode, hitRate: 4 });
      assert.match(code, /^[A-Za-z0-9%&#@]{28}$/);
      const d = decoder(code);
      assert.equal(d.nom, 'Blanche');
      assert.equal(d.ville, 'Testcity');
      assert.equal(d.objet, objet);
      assert.equal(d.typeCode, typeCode);
      assert.ok(d.sommeOk);
    }
  }
});

test('noms : caractères du jeu, 8 au plus', async () => {
  const { nomVersOctets, octetsVersNom, erreurNom } = await charger();
  assert.deepEqual(nomVersOctets('Blanche'), [66, 108, 97, 110, 99, 104, 101, 32]);
  assert.equal(octetsVersNom(nomVersOctets('Éloïse')), 'Éloïse');
  assert.equal(erreurNom('Blanche'), null);
  assert.match(erreurNom('Anticonstitution'), /8 caractères/);
  assert.match(erreurNom('Bl€nche'), /n'existe pas/);
  assert.match(erreurNom('  '), /vide/);
});
