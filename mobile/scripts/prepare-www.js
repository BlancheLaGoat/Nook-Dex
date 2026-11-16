// Prépare le dossier www/ de l'appli Android à partir de l'interface du PC.
// L'interface (src/renderer) est partagée : une modif sur PC arrive aussi sur le téléphone.
// Seul le « pont » change : mobile/src/mobile.js remplace src/preload.js + src/main.js.
const fs = require('fs');
const path = require('path');

const M = path.join(__dirname, '..');
const RACINE = path.join(M, '..');
const R = path.join(RACINE, 'src', 'renderer');
const WWW = path.join(M, 'www');

const copierDossier = (de, vers) => {
  fs.mkdirSync(vers, { recursive: true });
  for (const e of fs.readdirSync(de, { withFileTypes: true })) {
    const s = path.join(de, e.name), d = path.join(vers, e.name);
    if (e.isDirectory()) copierDossier(s, d); else fs.copyFileSync(s, d);
  }
};

fs.rmSync(WWW, { recursive: true, force: true });
copierDossier(R, WWW);
copierDossier(path.join(RACINE, 'data'), path.join(WWW, 'data'));
fs.copyFileSync(path.join(RACINE, 'NOUVEAUTES.md'), path.join(WWW, 'NOUVEAUTES.md'));
fs.copyFileSync(path.join(RACINE, 'src', 'shared', 'profil.js'), path.join(WWW, 'profil.js'));
for (const f of fs.readdirSync(path.join(M, 'src'))) fs.copyFileSync(path.join(M, 'src', f), path.join(WWW, f));

// Version de l'appli = version du PC (package.json à la racine).
const version = process.env.APP_VERSION || require(path.join(RACINE, 'package.json')).version;
fs.writeFileSync(path.join(WWW, 'version.js'), `window.NOOK_VERSION = ${JSON.stringify(version)};\n`);

let html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
html = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.github.com">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#fbf8ef">`)
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="mobile.css">')
  .replace('<script type="module" src="app.js"></script>',
    `<script src="version.js"></script>
  <script src="profil.js"></script>
  <script src="zip.js"></script>
  <script src="mobile.js"></script>
  <script type="module" src="app.js"></script>`);
if (!html.includes('mobile.js') || !html.includes('mobile.css') || !html.includes('viewport')) throw new Error("index.html n'a pas pu être adapté");
fs.writeFileSync(path.join(WWW, 'index.html'), html);
console.log(`www prêt : version ${version}`);
