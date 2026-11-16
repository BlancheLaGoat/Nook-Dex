// Ajuste le projet Android généré par Capacitor : version, Obtainium, icône et écran de démarrage.
// Les images sont fabriquées ici (à partir de build/icon.png) : rien de binaire à garder dans mobile/.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const M = path.join(__dirname, '..');
const RACINE = path.join(M, '..');
const A = path.join(M, 'android', 'app');
const RES = path.join(A, 'src', 'main', 'res');
const version = process.env.APP_VERSION || require(path.join(RACINE, 'package.json')).version;
const [maj, min, pat] = version.split('.').map(n => parseInt(n, 10) || 0);
const versionCode = maj * 10000 + min * 100 + pat;

// 1. Android 11+ : pouvoir savoir si Obtainium est installé (mises à jour de Nook Dex par Obtainium).
const mf = path.join(A, 'src', 'main', 'AndroidManifest.xml');
let xml = fs.readFileSync(mf, 'utf8');
if (!xml.includes('dev.imranr.obtainium')) {
  xml = xml.replace('<application', '<queries>\n        <package android:name="dev.imranr.obtainium" />\n        <package android:name="dev.imranr.obtainium.fdroid" />\n        <intent>\n            <action android:name="android.intent.action.VIEW" />\n            <data android:scheme="obtainium" />\n        </intent>\n    </queries>\n\n    <application');
  if (!xml.includes('dev.imranr.obtainium')) throw new Error('AndroidManifest.xml : <queries> non ajouté');
}
// Exports dans Documents : une permission n'est nécessaire que jusqu'à Android 10 (au-delà, l'appli y crée ses fichiers).
if (!xml.includes('WRITE_EXTERNAL_STORAGE')) {
  xml = xml.replace('<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />\n    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="29" />');
  if (!xml.includes('WRITE_EXTERNAL_STORAGE')) throw new Error('AndroidManifest.xml : permission de stockage non ajoutée');
}
fs.writeFileSync(mf, xml);

// 2. Numéro de version : le même que l'appli PC.
const bg = path.join(A, 'build.gradle');
let gradle = fs.readFileSync(bg, 'utf8');
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${version}"`);
if (!gradle.includes(`versionName "${version}"`)) throw new Error('build.gradle : version introuvable');
fs.writeFileSync(bg, gradle);

// 3. Icône : celle du PC (512 × 512) dans chaque densité ; l'icône « adaptative » de Capacitor est retirée.
const icone = path.join(RACINE, 'build', 'icon.png');
for (const d of fs.readdirSync(RES).filter(n => n.startsWith('mipmap-'))) {
  if (d.startsWith('mipmap-anydpi')) { fs.rmSync(path.join(RES, d), { recursive: true, force: true }); continue; }
  for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    if (fs.existsSync(path.join(RES, d, f))) fs.copyFileSync(icone, path.join(RES, d, f));
  }
}

// 4. Écran de démarrage : un fond uni couleur crème (au lieu du logo Capacitor) ; Android 12+ y ajoute l'icône.
function pngUni(largeur, hauteur, [r, g, b]) {
  const crc = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return buf => { let c = 0xFFFFFFFF; for (const o of buf) c = t[(c ^ o) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }; })();
  const morceau = (type, data) => {
    const lg = Buffer.alloc(4); lg.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([lg, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ligne = Buffer.alloc(1 + largeur * 3); for (let x = 0; x < largeur; x++) { ligne[1 + 3 * x] = r; ligne[2 + 3 * x] = g; ligne[3 + 3 * x] = b; }
  const brut = Buffer.concat(Array.from({ length: hauteur }, () => ligne));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), morceau('IHDR', ihdr), morceau('IDAT', zlib.deflateSync(brut)), morceau('IEND', Buffer.alloc(0))]);
}
const fond = pngUni(64, 64, [0xFB, 0xF8, 0xEF]);
let ecrans = 0;
for (const d of fs.readdirSync(RES).filter(n => n.startsWith('drawable'))) {
  const f = path.join(RES, d, 'splash.png');
  if (fs.existsSync(f)) { fs.writeFileSync(f, fond); ecrans++; }
}

console.log(`Projet Android prêt : version ${version} (code ${versionCode}), ${ecrans} écrans de démarrage`);
