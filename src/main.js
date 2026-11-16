// Processus principal d'Electron : la fenêtre, la lecture des données,
// la sauvegarde des profils, le cache des images et les mises à jour.
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, nativeTheme, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const NookProfil = require('./shared/profil.js');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { autoUpdater = null; }

const DOSSIER_DATA = path.join(app.getAppPath(), 'data');      // données des jeux (remplacées à chaque mise à jour)
const DOSSIER_UTILISATEUR = app.getPath('userData');           // %AppData%\Nook Dex (jamais touché par les mises à jour)
const DOSSIER_PROFILS = path.join(DOSSIER_UTILISATEUR, 'profils');
const DOSSIER_SAUVEGARDES = path.join(DOSSIER_UTILISATEUR, 'sauvegardes');
const DOSSIER_CORBEILLE = path.join(DOSSIER_UTILISATEUR, 'corbeille');
const DOSSIER_IMAGES = path.join(DOSSIER_UTILISATEUR, 'images');
const FICHIER_REGLAGES = path.join(DOSSIER_UTILISATEUR, 'reglages.json');
const FICHIER_SYNCHRO = path.join(DOSSIER_UTILISATEUR, 'synchro.json');
const SAUVEGARDES_GARDEES = 10;

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

const { ID_VALIDE } = NookProfil;

// ---------------------------------------------------------------------------
// Profils
// ---------------------------------------------------------------------------
function fichierProfil(id) {
  if (!ID_VALIDE.test(id)) throw new Error('Identifiant de profil invalide');
  return path.join(DOSSIER_PROFILS, `${id}.json`);
}

// Vérification des profils et des réglages : commune au PC et à Android (src/shared/profil.js).
const normaliserProfil = p => NookProfil.normaliserProfil(p, nouvelId);

function nouvelId() {
  return NookProfil.nouvelId(n => crypto.randomBytes(n));
}

function listerProfils() {
  if (!fs.existsSync(DOSSIER_PROFILS)) return [];
  return fs.readdirSync(DOSSIER_PROFILS)
    .filter(f => f.endsWith('.json'))
    .map(f => lireJson(path.join(DOSSIER_PROFILS, f)))
    .filter(p => p && p.id && p.jeu)
    .map(NookProfil.resumeProfil);
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
  ipcMain.handle('donnees:especes', () => lireJson(path.join(DOSSIER_DATA, 'especes.json'), []));

  ipcMain.handle('donnees:categorie', (_e, jeu, categorie) => {
    if (!ID_VALIDE.test(jeu) || !ID_VALIDE.test(categorie)) throw new Error('Nom de catégorie invalide');
    return lireJson(path.join(DOSSIER_DATA, jeu, `${categorie}.json`), []);
  });

  // Taux d'apparition (data/<jeu>/rarete.json, absent pour les jeux sans données) + seuils des étoiles.
  ipcMain.handle('donnees:rarete', (_e, jeu) => {
    if (!ID_VALIDE.test(jeu)) return { donnees: null, etoiles: null };
    return {
      donnees: lireJson(path.join(DOSSIER_DATA, jeu, 'rarete.json'), null),
      etoiles: lireJson(path.join(DOSSIER_DATA, 'rarete', 'etoiles.json'), null),
    };
  });

  // Ville parfaite (Wild World) : modèles d'acres et règles du jeu.
  ipcMain.handle('donnees:arrosoir', () => ({
    modeles: lireJson(path.join(DOSSIER_DATA, 'arrosoir', 'modeles.json'), null),
    regles: lireJson(path.join(DOSSIER_DATA, 'arrosoir', 'regles.json'), null),
  }));

  // Enregistrer / ouvrir un fichier JSON choisi par la joueuse (carte de la ville).
  ipcMain.handle('fichier:exporterJson', async (_e, titre, nomDefaut, donnees) => {
    const nom = String(nomDefaut || 'nook-dex.json').replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'nook-dex.json';
    const { canceled, filePath } = await dialog.showSaveDialog(fenetre, {
      title: String(titre || 'Exporter'), defaultPath: path.join(app.getPath('documents'), nom),
      filters: [{ name: 'Fichier Nook Dex', extensions: ['json'] }],
    });
    if (canceled || !filePath) return null;
    ecrireSur(filePath, JSON.stringify(donnees, null, 1));
    return filePath;
  });
  ipcMain.handle('fichier:importerJson', async (_e, titre) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(fenetre, {
      title: String(titre || 'Importer'), properties: ['openFile'],
      filters: [{ name: 'Fichier Nook Dex', extensions: ['json'] }],
    });
    if (canceled || !filePaths.length) return null;
    const d = lireJson(filePaths[0], null);
    if (!d || typeof d !== 'object') throw new Error("ce fichier n'est pas un JSON valide");
    return d;
  });

  // Ouvrir une sauvegarde de jeu (lecture seule) : renvoie ses octets, l'interface fait le décodage.
  const FILTRES_SAUVEGARDE = {
    gc: { name: 'Sauvegarde GameCube', extensions: ['gci', 'raw'] },
    ww: { name: 'Sauvegarde Nintendo DS', extensions: ['sav', 'dsv'] },
    cf: { name: 'Sauvegarde City Folk (RVFOREST.DAT)', extensions: ['dat'] },
    nl: { name: 'Sauvegarde New Leaf (garden_plus.dat)', extensions: ['dat'] },
  };
  ipcMain.handle('fichier:lireSauvegarde', async (_e, titre, jeu) => {
    const filtre = FILTRES_SAUVEGARDE[jeu];
    if (!filtre) throw new Error("l'import de sauvegarde n'existe pas pour ce jeu");
    const { canceled, filePaths } = await dialog.showOpenDialog(fenetre, {
      title: String(titre || 'Ouvrir une sauvegarde'), properties: ['openFile'],
      filters: [filtre, { name: 'Tous les fichiers', extensions: ['*'] }],
    });
    if (canceled || !filePaths.length) return null;
    const taille = fs.statSync(filePaths[0]).size;
    if (taille > 17 * 1024 * 1024) throw new Error('fichier trop gros pour une sauvegarde');
    return { nom: path.basename(filePaths[0]), octets: new Uint8Array(fs.readFileSync(filePaths[0])) };
  });

  // New Horizons : la sauvegarde est un dossier (main.dat, mainHeader.dat, Villager0/personal.dat…).
  ipcMain.handle('fichier:lireDossierNH', async (_e, titre) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(fenetre, {
      title: String(titre || 'Choisir le dossier de sauvegarde'), properties: ['openDirectory'],
    });
    if (canceled || !filePaths.length) return null;
    const dossier = filePaths[0];
    const lire = (f, max) => {
      const chemin = path.join(dossier, f);
      if (!fs.existsSync(chemin)) return null;
      if (fs.statSync(chemin).size > max) throw new Error(`${f} est trop gros pour une sauvegarde`);
      return new Uint8Array(fs.readFileSync(chemin));
    };
    const Mo = 1024 * 1024;
    const joueurs = fs.readdirSync(dossier, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^Villager[0-7]$/.test(d.name))
      .map(d => d.name).sort()
      .map(d => ({ dossier: d, header: lire(path.join(d, 'personalHeader.dat'), Mo), personal: lire(path.join(d, 'personal.dat'), 4 * Mo) }))
      .filter(j => j.header && j.personal);
    return {
      nom: path.basename(dossier),
      octets: { mainHeader: lire('mainHeader.dat', Mo), main: lire('main.dat', 32 * Mo), joueurs },
    };
  });

  // Codes d'objets (data/<jeu>/codes.json, seulement pour le GameCube pour l'instant).
  ipcMain.handle('donnees:codes', (_e, jeu) => {
    if (!ID_VALIDE.test(jeu)) return null;
    return lireJson(path.join(DOSSIER_DATA, jeu, 'codes.json'), null);
  });

  ipcMain.handle('donnees:infos', (_e, jeu) => {
    if (!ID_VALIDE.test(jeu)) return null;
    return lireJson(path.join(DOSSIER_DATA, jeu, '_infos.json'), null);
  });

  ipcMain.handle('profils:liste', () => listerProfils());

  // Copier un code d'objet dans le presse-papiers.
  ipcMain.handle('app:copier', (_e, texte) => { clipboard.writeText(String(texte || '').slice(0, 200)); return true; });

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
    const nomFichier = NookProfil.nomExportProfil(p);
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
  // Synchro en ligne (lib/synchro.js) : null = pas de synchro sur cet appareil.
  ipcMain.handle('synchro:lire', () => lireJson(FICHIER_SYNCHRO, null));
  ipcMain.handle('synchro:ecrire', (_e, s) => {
    if (s === null) { fs.rmSync(FICHIER_SYNCHRO, { force: true }); return true; }
    const propre = NookProfil.normaliserSynchro(s);
    ecrireSur(FICHIER_SYNCHRO, JSON.stringify(propre));
    return true;
  });
  ipcMain.handle('reglages:ecrire', (_e, r) => {
    const propre = NookProfil.normaliserReglages(r);
    ecrireSur(FICHIER_REGLAGES, JSON.stringify(propre, null, 1));
    nativeTheme.themeSource = propre.theme === 'clair' ? 'light' : propre.theme === 'sombre' ? 'dark' : 'system';
    return propre;
  });

  ipcMain.handle('app:infos', () => ({ version: app.getVersion(), dossier: DOSSIER_UTILISATEUR, packagee: app.isPackaged }));
  ipcMain.handle('app:ouvrirDossier', () => shell.openPath(DOSSIER_UTILISATEUR));
  // Texte de NOUVEAUTES.md (embarqué dans l'appli), pour la fenêtre « Quoi de neuf ? ».
  ipcMain.handle('app:nouveautes', () => {
    try { return fs.readFileSync(path.join(app.getAppPath(), 'NOUVEAUTES.md'), 'utf8'); } catch { return ''; }
  });
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
    icon: path.join(__dirname, 'assets', 'icon.png'),
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
