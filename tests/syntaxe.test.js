// Vérifie la syntaxe de tous les fichiers JavaScript de l'appli (src/), y compris les vues,
// que les autres tests ne chargent pas : une apostrophe oubliée suffit à empêcher l'appli de démarrer.
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = path.join(__dirname, '..', 'src');

function fichiersJs(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dossier, e.name);
    return e.isDirectory() ? fichiersJs(p) : e.name.endsWith('.js') ? [p] : [];
  });
}

test('syntaxe : tous les fichiers de src/ se lisent sans erreur', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nookdex-syntaxe-'));
  const erreurs = [];
  let n = 0;
  try {
    for (const f of fichiersJs(SRC)) {
      // L'interface (src/renderer) est en modules ES : on la vérifie comme .mjs ; le reste (main, preload) en CommonJS.
      const esm = f.includes(`${path.sep}renderer${path.sep}`);
      const copie = path.join(tmp, `${path.basename(f, '.js')}-${n++}${esm ? '.mjs' : '.cjs'}`);
      fs.copyFileSync(f, copie);
      try { execFileSync(process.execPath, ['--check', copie], { stdio: 'pipe' }); } catch (e) {
        erreurs.push(`${path.relative(SRC, f)} : ${String(e.stderr).split('\n').find(l => /Error/.test(l)) || e.message}`);
      }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  assert.ok(n > 10, `seulement ${n} fichiers trouvés`);
  assert.deepEqual(erreurs, []);
});
