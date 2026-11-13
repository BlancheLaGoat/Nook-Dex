// Petites fonctions communes à tous les scripts de données.
const fs = require('fs');
const path = require('path');
const https = require('https');

const RACINE = path.join(__dirname, '..', '..');
const DOSSIER_DATA = path.join(RACINE, 'data');
const DOSSIER_SOURCES = path.join(RACINE, 'sources');

// "T. rex skull" -> "t-rex-skull" : identifiant stable, basé sur le nom anglais.
function slug(texte) {
  return String(texte)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Première lettre en majuscule (les noms du jeu sont en minuscules : "poisson-chat").
function majuscule(s) {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1);
}

function ecrireJson(relatif, donnees) {
  const f = path.join(DOSSIER_DATA, relatif);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(donnees, null, 1) + '\n');
  return f;
}

// Télécharge une url vers un fichier (suit les redirections).
// agent : certains sites refusent les programmes et n'acceptent que les navigateurs.
function telecharger(url, destination, redirections = 5, agent = 'NookDex-scripts') {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': agent } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirections > 0) {
        res.resume();
        return resolve(telecharger(new URL(res.headers.location, url).toString(), destination, redirections - 1, agent));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const tmp = destination + '.part';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => out.close(() => { fs.renameSync(tmp, destination); resolve(destination); }));
      out.on('error', reject);
    }).on('error', reject);
  });
}

// Donne un identifiant unique dans une liste : si "chair" existe déjà, on ajoute un suffixe stable.
function creerAttributeurIds() {
  const vus = new Set();
  return (base, suffixe) => {
    let id = base;
    if (vus.has(id)) id = `${base}-${suffixe}`;
    let n = 2;
    while (vus.has(id)) id = `${base}-${suffixe}-${n++}`;
    vus.add(id);
    return id;
  };
}

module.exports = { RACINE, DOSSIER_DATA, DOSSIER_SOURCES, slug, majuscule, ecrireJson, telecharger, creerAttributeurIds };
