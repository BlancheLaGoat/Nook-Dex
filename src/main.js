// Processus principal d'Electron : la fenêtre, la lecture des données,
// la sauvegarde des profils, le cache des images et les mises à jour.
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { autoUpdater = null; }

const DOSSIER_DATA = path.join(app.getAppPath(), 'data');      // données des jeux (remplacées à chaque mise à jour)
const DOSSIER_UTILISATEUR = app.getPath('userData');           // %AppData%\Nook Dex (jamais touché par les mises à jour)
const DOSSIER_PROFILS = path.join(DOSSIER_UTILISATEUR, 'profils');
const DOSSIER_SAUVEGARDES = path.join(DOSSIER_UTILISATEUR, 'sauvegardes');
const DOSSIER_CORBEILLE = path.join(DOSSIER_UTILISATEUR, 'corbeille');
const DOSSIER_IMAGES = path.join(DOSSIER_UTILISATEUR, 'images');
const FICHIER_REGLAGES = path.join(DOSSIER_UTILISATEUR, 'reglages.json');
const SAUVEGARDES_GARDEES = 10;
const VERSION_SCHEMA = 1;

// Seules ces adresses peuvent fournir des images (sécurité).
const HOTES_IMAGES = new Set(['nh-cdn.catalogue.ac', 'acnhcdn.com', 'dodo.ac', 'www.animalcrossing-online.com']);

let fenetre = null;

// ---------------------------------------------------------------------------
// Fichiers : écriture « sûre » (on écrit un fichier temporaire puis on le renomme,
// pour ne jamais laisser un fichier à moitié écrit si l'ordinateur s'éteint).
// ---------------------------------------------------------------------------
function ecrireSur(fichier, contenu) {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const tmp = `${fichier}.tmp`;
  fs.writeFileSync(tmp, contenu);
  fs.renameSync(tmp, fichier);
}

function lireJson(fichier, defaut = null) {
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { return defaut; }
}

const ID_VALIDE = /^[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Profils
// ---------------------------------------------------------------------------
function fichierProfil(id) {
  if (!ID_VALIDE.test(id)) throw new Error('Identifiant de profil invalide');
  return path.join(DOSSIER_PROFILS, `${id}.json`);
}

function normaliserProfil(p) {
  if (!p || typeof p !== 'object') throw new Error("Ce fichier n'est pas un profil Nook Dex.");
  if (typeof p.jeu !== 'string' || typeof p.nom !== 'string') throw new Error("Ce fichier n'est pas un profil Nook Dex (jeu ou nom manquant).");
  if ((p.schema || 1) > VERSION_SCHEMA) throw new Error('Ce profil vient d\'une version plus récente de Nook Dex. Mets l\'appli à jour d\'abord.');
  return {
    schema: VERSION_SCHEMA,
    id: ID_VALIDE.test(p.id || '') ? p.id : nouvelId(),
    nom: p.nom.slice(0, 60),
    jeu: p.jeu,
    hemisphere: p.hemisphere === 'sud' ? 'sud' : 'nord',
    extensions: Array.isArray(p.extensions) ? p.extensions.filter(e => typeof e === 'string') : [],
    cree_le: p.cree_le || new Date().toISOString(),
    modifie_le: new Date().toISOString(),
    elements: p.elements && typeof p.elements === 'object' ? p.elements : {},
  };
}

function nouvelId() {
  return `p-${crypto.randomBytes(4).toString('hex')}`;
}

function listerProfils() {
  if (!fs.existsSync(DOSSIER_PROFILS)) return [];
  return fs.readdirSync(DOSSIER_PROFILS)
    .filter(f => f.endsWith('.json'))
    .map(f => lireJson(path.join(DOSSIER_PROFILS, f)))
    .filter(p => p && p.id && p.jeu)
    .map(p => ({ id: p.id, nom: p.nom, jeu: p.jeu, hemisphere: p.hemisphere, extensions: p.extensions, nb: Object.keys(p.elements || {}).length }));
}

// Copie de secours de tous les profils à chaque démarrage (on garde les 10 dernières).
function sauvegarderAuDemarrage() {
  if (!fs.existsSync(DOSSIER_PROFILS)) return;
  const fichiers = fs.readdirSync(DOSSIER_PROFILS).filter(f => f.endsWith('.json'));
  if (!fichiers.length) return;
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(DOSSIER_SAUVEGARDES, horodatage);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fichiers) fs.copyFileSync(path.join(DOSSIER_PROFILS, f), path.join(dest, f));
  const toutes = fs.readdirSync(DOSSIER_SAUVEGARDES).sort();
  for (const ancienne of toutes.slice(0, Math.max(0, toutes.length - SAUVEGARDES_GARDEES))) {
    fs.rmSync(path.join(DOSSIER_SAUVEGARDES, ancienne), { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Images : téléchargées une seule fois puis gardées sur le PC.
// Dans l'interface, une image s'écrit nookimg://img/<adresse encodée>.
// ---------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  { scheme: 'nookimg', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const telechargementsEnCours = new Map();

async function servirImage(requete) {
  let distante;
  try {
    distante = new URL(decodeURIComponent(new URL(requete.url).pathname.slice(1)));
  } catch {
    return new Response('Adresse invalide', { status: 400 });
  }
  if (distante.protocol !== 'https:' || !HOTES_IMAGES.has(distante.hostname)) {
    return new Response('Hôte non autorisé', { status: 403 });
  }
  const ext = (path.extname(distante.pathname) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const nom = crypto.createHash('sha1').update(distante.toString()).digest('hex') + ext;
  const fichier = path.join(DOSSIER_IMAGES, nom.slice(0, 2), nom);
  const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';

  if (fs.existsSync(fichier)) {
    return new Response(fs.readFileSync(fichier), { headers: { 'content-type': type } });
  }
  // Si la même image est demandée plusieurs fois en même temps, on ne la télécharge qu'une fois.
  if (!telechargementsEnCours.has(fichier)) {
    telechargementsEnCours.set(fichier, (async () => {
      const rep = await net.fetch(distante.toString());
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const donnees = Buffer.from(await rep.arrayBuffer());
      ecrireSur(fichier, donnees);
      return donnees;
    })().finally(() => telechargementsEnCours.delete(fichier)));
  }
  try {
    const donnees = await telechargementsEnCours.get(fichier);
    return new Response(donnees, { headers: { 'content-type': type } });
  } catch {
    return new Response('Image indisponible', { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// Communication avec l'interface
// ---------------------------------------------------------------------------
function brancherIpc() {
  ipcMain.handle('donnees:jeux', () => lireJson(path.join(DOSSIER_DATA, 'jeux.json'), []));

  ipcMain.handle('donnees:categorie', (_e, jeu, categorie) => {
    if (!ID_VALIDE.test(jeu) || !ID_VALIDE.test(categorie)) throw new Error('Nom de catégorie invalide');
    return lireJson(path.join(DOSSIER_DATA, jeu, `${categorie}.json`), []);
  });

  ipcMain.handle('donnees:infos', (_e, jeu) => {
    if (!ID_VALIDE.test(jeu)) return null;
    return lireJson(path.join(DOSSIER_DATA, jeu, '_infos.json'), null);
  });

  ipcMain.handle('profils:liste', () => listerProfils());

  ipcMain.handle('profils:lire', (_e, id) => lireJson(fichierProfil(id)));

  ipcMain.handle('profils:creer', (_e, infos) => {
    const p = normaliserProfil({ ...infos, id: nouvelId(), elements: {} });
    ecrireSur(fichierProfil(p.id), JSON.stringify(p, null, 1));
    return p;
  });

  ipcMain.handle('profils:ecrire', (_e, profil) => {
    const p = normaliserProfil(profil);
    if (p.id !== profil.id) throw new Error('Identifiant de profil invalide');
    ecrireSur(fichierProfil(p.id), JSON.stringify(p, null, 1));
    return true;
  });

  // Version « immédiate », utilisée à la fermeture de la fenêtre pour ne perdre aucune coche.
  ipcMain.on('profils:ecrireSync', (e, profil) => {
    try {
      const p = normaliserProfil(profil);
      ecrireSur(fichierProfil(p.id), JSON.stringify(p, null, 1));
      e.returnValue = true;
    } catch {
      e.returnValue = false;
    }
  });

  // On ne supprime jamais vraiment : le profil part dans le dossier « corbeille ».
  ipcMain.handle('profils:supprimer', (_e, id) => {
    const f = fichierProfil(id);
    if (!fs.existsSync(f)) return false;
    fs.mkdirSync(DOSSIER_CORBEILLE, { recursive: true });
    fs.renameSync(f, path.join(DOSSIER_CORBEILLE, `${id}-${Date.now()}.json`));
    return true;
  });

  ipcMain.handle('profils:exporter', async (_e, id) => {
    const p = lireJson(fichierProfil(id));
    if (!p) throw new Error('Profil introuvable');
    const nomFichier = `nook-dex-${p.jeu}-${p.nom.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'profil'}.json`;
    const { canceled, filePath } = await dialog.showSaveDialog(fenetre, {
      title: 'Exporter la progression',
      defaultPath: path.join(app.getPath('documents'), nomFichier),
      filters: [{ name: 'Progression Nook Dex', extensions: ['json'] }],
    });
    if (canceled || !filePath) return null;
    ecrireSur(filePath, JSON.stringify(p, null, 1));
    return filePath;
  });

  ipcMain.handle('profils:importer', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(fenetre, {
      title: 'Importer une progression',
      properties: ['openFile'],
      filters: [{ name: 'Progression Nook Dex', extensions: ['json'] }],
    });
    if (canceled || !filePaths.length) return null;
    const brut = lireJson(filePaths[0]);
    const p = normaliserProfil(brut);
    // Si un profil porte déjà cet identifiant, l'import devient un nouveau profil (rien n'est écrasé).
    if (fs.existsSync(fichierProfil(p.id))) { p.id = nouvelId(); p.nom = `${p.nom} (importé)`; }
    ecrireSur(fichierProfil(p.id), JSON.stringify(p, null, 1));
    return p;
  });

  ipcMain.handle('reglages:lire', () => lireJson(FICHIER_REGLAGES, {}));
  ipcMain.handle('reglages:ecrire', (_e, r) => {
    const propre = {
      theme: ['clair', 'sombre', 'systeme'].includes(r.theme) ? r.theme : 'systeme',
      profilActif: typeof r.profilActif === 'string' ? r.profilActif : null,
      dateSimulee: typeof r.dateSimulee === 'string' ? r.dateSimulee : null,
    };
    ecrireSur(FICHIER_REGLAGES, JSON.stringify(propre, null, 1));
    nativeTheme.themeSource = propre.theme === 'clair' ? 'light' : propre.theme === 'sombre' ? 'dark' : 'system';
    return propre;
  });

  ipcMain.handle('app:infos', () => ({ version: app.getVersion(), dossier: DOSSIER_UTILISATEUR, packagee: app.isPackaged }));
  ipcMain.handle('app:ouvrirDossier', () => shell.openPath(DOSSIER_UTILISATEUR));
  ipcMain.handle('app:ouvrirLien', (_e, url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  });

  ipcMain.handle('maj:verifier', () => verifierMaj());
  ipcMain.handle('maj:installer', () => { if (autoUpdater) autoUpdater.quitAndInstall(); });
}

// ---------------------------------------------------------------------------
// Mises à jour automatiques (seulement dans l'appli installée)
// ---------------------------------------------------------------------------
function envoyerEtatMaj(etat, infos = {}) {
  if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send('maj:etat', { etat, ...infos });
}

function brancherMaj() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => envoyerEtatMaj('verification'));
  autoUpdater.on('update-available', i => envoyerEtatMaj('disponible', { version: i.version }));
  autoUpdater.on('update-not-available', () => envoyerEtatMaj('a-jour'));
  autoUpdater.on('download-progress', p => envoyerEtatMaj('telechargement', { pourcent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => envoyerEtatMaj('prete', { version: i.version }));
  autoUpdater.on('error', err => envoyerEtatMaj('erreur', { message: String(err?.message || err) }));
  verifierMaj();
  setInterval(verifierMaj, 6 * 60 * 60 * 1000);
}

function verifierMaj() {
  if (!autoUpdater || !app.isPackaged) return { etat: 'dev' };
  autoUpdater.checkForUpdates().catch(() => {});
  return { etat: 'verification' };
}

// ---------------------------------------------------------------------------
// Fenêtre
// ---------------------------------------------------------------------------
function creerFenetre() {
  const reglages = lireJson(FICHIER_REGLAGES, {});
  nativeTheme.themeSource = reglages.theme === 'clair' ? 'light' : reglages.theme === 'sombre' ? 'dark' : 'system';
  fenetre = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 620,
    title: 'Nook Dex',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#22262b' : '#fbf8ef',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  fenetre.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'appli.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  fenetre.webContents.on('will-navigate', e => e.preventDefault());
}

const verrou = app.requestSingleInstanceLock();
if (!verrou) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (fenetre) { if (fenetre.isMinimized()) fenetre.restore(); fenetre.focus(); }
  });
  app.whenReady().then(() => {
    try { sauvegarderAuDemarrage(); } catch (e) { console.error('Sauvegarde impossible :', e); }
    protocol.handle('nookimg', servirImage);
    brancherIpc();
    creerFenetre();
    brancherMaj();
  });
  app.on('window-all-closed', () => app.quit());
}
