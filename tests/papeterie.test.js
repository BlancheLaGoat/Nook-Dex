// Papeterie de Wild World, City Folk et New Leaf (même format que le GameCube).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));

test('papeterie : WW 63, CF 64, NL 68, GC 64 (tables Nookipedia = tableurs des jeux)', () => {
  const attendus = { ww: 63, cf: 64, nl: 68, gc: 64 };
  const jeux = lire('data/jeux.json');
  for (const [jeu, n] of Object.entries(attendus)) {
    const liste = lire(`data/${jeu}/papeterie.json`);
    assert.equal(liste.length, n, jeu);
    assert.ok(jeux.find(j => j.id === jeu).categories.some(c => c.id === 'papeterie'), `${jeu} : catégorie absente de jeux.json`);
    assert.equal(new Set(liste.map(e => e.id)).size, n, `${jeu} : identifiants en double`);
    const sansFr = liste.filter(e => e.a_verifier && e.a_verifier.includes('nom.fr'));
    assert.equal(sansFr.length, 0, `${jeu} : sans nom français : ${sansFr.map(e => e.nom.en).join(', ')}`);
  }
});

test('Wild World : sous-catégorie des hauts en français', () => {
  assert.ok(!lire('data/ww/vetements.json').some(e => e.sous === 'Tops'));
});
