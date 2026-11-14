// Tests de la lecture de NOUVEAUTES.md (fenêtre « Quoi de neuf ? »).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const RACINE = path.join(__dirname, '..');
const charger = () => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', 'nouveautes.js')).href);

test('découpage : partie d\'une version, titres, listes, gras', async () => {
  const { partieVersion, blocs, morceaux, versions } = await charger();
  const md = '# Titre\n\n## 1.2.0\n### A\n- un\n- **deux**\n\n## 1.1.0\nTexte\n';
  assert.deepEqual(versions(md), ['1.2.0', '1.1.0']);
  assert.equal(partieVersion(md, '1.1.0'), 'Texte');
  assert.equal(partieVersion(md, '9.9.9'), null);
  assert.deepEqual(blocs(partieVersion(md, '1.2.0')), [{ type: 'titre', texte: 'A' }, { type: 'liste', elements: ['un', '**deux**'] }]);
  assert.deepEqual(morceaux('un **mot** ici'), [{ texte: 'un ' }, { texte: 'mot', gras: true }, { texte: ' ici' }]);
});

test('NOUVEAUTES.md a une partie pour la version de package.json', async () => {
  const { partieVersion, blocs } = await charger();
  const version = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).version;
  const partie = partieVersion(fs.readFileSync(path.join(RACINE, 'NOUVEAUTES.md'), 'utf8'), version);
  assert.ok(partie, `NOUVEAUTES.md n'a pas de partie « ## ${version} »`);
  assert.ok(blocs(partie).some(b => b.type === 'titre'));
  // L'installateur doit embarquer le fichier.
  assert.ok(JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8')).build.files.includes('NOUVEAUTES.md'));
});
