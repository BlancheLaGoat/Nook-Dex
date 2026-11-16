// Nook Dex pour Android : remplace le « pont » Electron (src/preload.js + src/main.js) par les modules Capacitor.
// Chargé avant app.js. Toute l'interface (src/renderer) est la même que sur PC ; seul ce fichier change.
//  - données des jeux : fichiers data/ livrés dans l'appli (lus avec fetch) ;
//  - profils, réglages, copies de secours, corbeille : stockage de l'appli (module Filesystem, dossier DATA) ;
//  - fichiers choisis par la joueuse : sélecteur de fichiers d'Android ; exports : dossier Documents du téléphone ;
//  - mises à jour : dernière version publiée sur GitHub (APK), installée par Obtainium s'il est là.
// Hors téléphone (tests dans un navigateur), le stockage passe par localStorage.
(function () {
  'use strict';
  const Cap = window.Capacitor || {};
  const P = Cap.Plugins || {};
  const natif = !!(Cap.isNativePlatform && Cap.isNativePlatform());
  const REPO = 'BlancheLaGoat/Nook-Dex';
  const VERSION = window.NOOK_VERSION || '0.0.0';
  const Profil = window.NookProfil;
  const HOTES_IMAGES = new Set(['nh-cdn.catalogue.ac', 'acnhcdn.com', 'dodo.ac', 'www.animalcrossing-online.com']);
  const SAUVEGARDES_GARDEES = 10;
  const TAILLE_MAX_SAUVEGARDE = 17 * 1024 * 1024;

  // ---------- Stockage (fichiers texte, chemins relatifs au dossier de l'appli) ----------
  const FS = natif ? P.Filesystem : null;
  const DATA = 'DATA';
  const stockage = FS ? {
    async lire(chemin) {
      try { return (await FS.readFile({ path: chemin, directory: DATA, encoding: 'utf8' })).data; } catch (e) { return null; }
    },
    async ecrire(chemin, texte) { await FS.writeFile({ path: chemin, directory: DATA, encoding: 'utf8', data: texte, recursive: true }); },
    async lister(dossier) {
      try { return ((await FS.readdir({ path: dossier, directory: DATA })).files || []).map(f => (typeof f === 'string' ? f : f.name)); } catch (e) { return []; }
    },
    async supprimer(chemin) { try { await FS.deleteFile({ path: chemin, directory: DATA }); } catch (e) { /* déjà absent */ } },
    async supprimerDossier(dossier) { try { await FS.rmdir({ path: dossier, directory: DATA, recursive: true }); } catch (e) { /* déjà absent */ } },
  } : {
    // Navigateur : une clé localStorage par fichier, préfixée « nookdex/ ».
    async lire(chemin) { return localStorage.getItem(`nookdex/${chemin}`); },
    async ecrire(chemin, texte) { localStorage.setItem(`nookdex/${chemin}`, texte); },
    async lister(dossier) {
      const pre = `nookdex/${dossier}/`, noms = new Set();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(pre)) noms.add(k.slice(pre.length).split('/')[0]);
      }
      return [...noms];
    },
    async supprimer(chemin) { localStorage.removeItem(`nookdex/${chemin}`); },
    async supprimerDossier(dossier) {
      for (const k of Object.keys(localStorage)) if (k.startsWith(`nookdex/${dossier}/`)) localStorage.removeItem(k);
    },
  };
  // Écriture « sûre » : un fichier temporaire, puis le vrai (on ne laisse jamais un profil à moitié écrit).
  async function ecrireSur(chemin, texte) {
    await stockage.ecrire(`${chemin}.tmp`, texte);
    await stockage.ecrire(chemin, texte);
    await stockage.supprimer(`${chemin}.tmp`);
  }
  async function lireJson(chemin, defaut = null) {
    const t = await stockage.lire(chemin);
    if (t == null) return defaut;
    try { return JSON.parse(t); } catch (e) { return defaut; }
  }

  // ---------- Données des jeux (livrées dans l'appli) ----------
  const ID_VALIDE = Profil.ID_VALIDE;
  async function donnee(relatif, defaut) {
    try {
      const r = await fetch(`data/${relatif}`);
      if (!r.ok) return defaut;
      return await r.json();
    } catch (e) { return defaut; }
  }

  // ---------- Profils ----------
  const fichierProfil = id => {
    if (!ID_VALIDE.test(id)) throw new Error('Identifiant de profil invalide');
    return `profils/${id}.json`;
  };
  const normaliserProfil = p => Profil.normaliserProfil(p);
  async function listerProfils() {
    const noms = (await stockage.lister('profils')).filter(f => f.endsWith('.json'));
    const profils = await Promise.all(noms.map(f => lireJson(`profils/${f}`)));
    return profils.filter(p => p && p.id && p.jeu).map(Profil.resumeProfil);
  }
  // Copie de secours de tous les profils à chaque démarrage (on garde les 10 dernières), comme sur PC.
  async function sauvegarderAuDemarrage() {
    const noms = (await stockage.lister('profils')).filter(f => f.endsWith('.json'));
    if (!noms.length) return;
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    for (const f of noms) {
      const t = await stockage.lire(`profils/${f}`);
      if (t != null) await stockage.ecrire(`sauvegardes/${horodatage}/${f}`, t);
    }
    const toutes = (await stockage.lister('sauvegardes')).sort();
    for (const ancienne of toutes.slice(0, Math.max(0, toutes.length - SAUVEGARDES_GARDEES))) await stockage.supprimerDossier(`sauvegardes/${ancienne}`);
  }
  const demarrage = sauvegarderAuDemarrage().catch(e => console.error('Sauvegarde impossible :', e));

  // ---------- Fichiers choisis par la joueuse ----------
  // Résout avec le fichier choisi, ou null si la joueuse annule.
  function choisirFichier(accept = '') {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      if (accept) inp.accept = accept;
      inp.style.display = 'none';
      const fin = f => { inp.remove(); resolve(f); };
      inp.addEventListener('change', () => fin(inp.files[0] || null), { once: true });
      inp.addEventListener('cancel', () => fin(null), { once: true });
      document.body.appendChild(inp);
      inp.click();
    });
  }
  async function lireFichierJson() {
    const f = await choisirFichier('application/json,.json');
    if (!f) return null;
    try { return JSON.parse(await f.text()); } catch (e) { throw new Error("ce fichier n'est pas un JSON valide"); }
  }
  // Exports : rangés dans le dossier Documents du téléphone (ou téléchargés, dans un navigateur).
  const nomPropre = (nom, defaut) => String(nom || defaut).replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || defaut;
  async function exporter(nom, donnees) {
    const texte = JSON.stringify(donnees, null, 1);
    if (FS) {
      await FS.writeFile({ path: `Nook Dex/${nom}`, directory: 'DOCUMENTS', encoding: 'utf8', data: texte, recursive: true });
      return `Documents/Nook Dex/${nom}`;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
    a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return nom;
  }

  // ---------- Liens ----------
  async function ouvrirUrl(url) {
    try {
      if (P.Browser && natif) return await P.Browser.open({ url });
      if (P.AppLauncher && natif) return await P.AppLauncher.openUrl({ url });
    } catch (e) { /* repli ci-dessous */ }
    window.open(url, '_blank');
  }

  // ---------- Mises à jour (APK publié sur GitHub, installé par Obtainium s'il est là) ----------
  let etatMaj = { etat: 'verification' };
  const abonnes = new Set();
  const annoncer = m => { etatMaj = m; for (const f of abonnes) { try { f(m); } catch (e) { console.error(e); } } };
  let urlApk = '';
  const plusRecente = (a, b) => {
    const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  };
  async function derniereVersion() {
    const url = `https://api.github.com/repos/${REPO}/releases/latest`;
    const entetes = { Accept: 'application/vnd.github+json' };
    if (P.CapacitorHttp && natif) {
      const r = await P.CapacitorHttp.request({ url, method: 'GET', headers: entetes, connectTimeout: 15000, readTimeout: 30000 });
      if (r.status < 200 || r.status >= 300) throw new Error(`GitHub a répondu ${r.status}`);
      return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    }
    const r = await fetch(url, { headers: entetes });
    if (!r.ok) throw new Error(`GitHub a répondu ${r.status}`);
    return r.json();
  }
  async function verifierMaj() {
    if (!natif) { annoncer({ etat: 'a-jour' }); return etatMaj; }
    annoncer({ etat: 'verification' });
    try {
      const r = await derniereVersion();
      const apk = (r.assets || []).find(a => /\.apk$/i.test(a.name));
      if (apk && plusRecente(r.tag_name, VERSION)) {
        urlApk = apk.browser_download_url;
        annoncer({ etat: 'prete', version: String(r.tag_name).replace(/^v/, '') });
      } else annoncer({ etat: 'a-jour' });
    } catch (e) {
      annoncer({ etat: 'erreur', message: e.message || String(e) });
    }
    return etatMaj;
  }
  const OBTAINIUM = ['dev.imranr.obtainium', 'dev.imranr.obtainium.fdroid'];
  async function paquetObtainium() {
    if (!P.AppLauncher || !natif) return '';
    for (const pkg of OBTAINIUM) {
      try { const r = await P.AppLauncher.canOpenUrl({ url: pkg }); if (r && r.value) return pkg; } catch (e) { /* suivant */ }
    }
    return '';
  }
  // Avec Obtainium : la mise à jour passe par lui (la première fois, Nook Dex s'y ajoute).
  // Sans lui : l'APK s'ouvre dans le navigateur, qui le télécharge.
  async function installerMaj() {
    const pkg = await paquetObtainium();
    if (pkg) {
      try {
        if (!localStorage.getItem('nookdex-obtainium')) {
          await P.AppLauncher.openUrl({ url: `obtainium://add/https://github.com/${REPO}` });
          localStorage.setItem('nookdex-obtainium', String(Date.now()));
        } else {
          await P.AppLauncher.openUrl({ url: pkg });
        }
        return;
      } catch (e) { /* Obtainium ne s'ouvre pas : téléchargement direct */ }
    }
    if (urlApk) await ouvrirUrl(urlApk);
    else await ouvrirUrl(`https://github.com/${REPO}/releases/latest`);
  }
  if (natif) {
    setTimeout(verifierMaj, 4000);
    setInterval(verifierMaj, 6 * 60 * 60 * 1000);
  }

  // ---------- Le pont, avec les mêmes fonctions que src/preload.js ----------
  window.nook = {
    plateforme: 'android',
    // Images : chargées directement (le téléphone les garde en cache), seulement depuis les sites autorisés.
    urlImage(url) {
      try {
        const u = new URL(url);
        return u.protocol === 'https:' && HOTES_IMAGES.has(u.hostname) ? u.toString() : '';
      } catch (e) { return ''; }
    },

    jeux: () => donnee('jeux.json', []),
    especes: () => donnee('especes.json', []),
    categorie(jeu, categorie) {
      if (!ID_VALIDE.test(jeu) || !ID_VALIDE.test(categorie)) return Promise.reject(new Error('Nom de catégorie invalide'));
      return donnee(`${jeu}/${categorie}.json`, []);
    },
    infosDonnees: jeu => (ID_VALIDE.test(jeu) ? donnee(`${jeu}/_infos.json`, null) : Promise.resolve(null)),
    async rarete(jeu) {
      if (!ID_VALIDE.test(jeu)) return { donnees: null, etoiles: null };
      const [donnees, etoiles] = await Promise.all([donnee(`${jeu}/rarete.json`, null), donnee('rarete/etoiles.json', null)]);
      return { donnees, etoiles };
    },
    codes: jeu => (ID_VALIDE.test(jeu) ? donnee(`${jeu}/codes.json`, null) : Promise.resolve(null)),
    async arrosoir() {
      const [modeles, regles] = await Promise.all([donnee('arrosoir/modeles.json', null), donnee('arrosoir/regles.json', null)]);
      return { modeles, regles };
    },

    async exporterJson(_titre, nom, donnees) { return exporter(nomPropre(nom, 'nook-dex.json'), donnees); },
    async importerJson() {
      const d = await lireFichierJson();
      if (d === null) return null;
      if (!d || typeof d !== 'object') throw new Error("ce fichier n'est pas un JSON valide");
      return d;
    },
    async lireSauvegarde() {
      const f = await choisirFichier();
      if (!f) return null;
      if (f.size > TAILLE_MAX_SAUVEGARDE) throw new Error('fichier trop gros pour une sauvegarde');
      return { nom: f.name, octets: new Uint8Array(await f.arrayBuffer()) };
    },
    // New Horizons : sur le téléphone, le dossier de la sauvegarde se choisit compressé en .zip.
    async lireDossierNH() {
      if (!localStorage.getItem('nookdex-nh-zip')) {
        window.alert("Sur le téléphone, la sauvegarde New Horizons se choisit compressée en .zip : compresse le dossier exporté par JKSV ou Checkpoint (celui qui contient main.dat et les dossiers Villager0, Villager1…), puis choisis ce fichier .zip.");
        localStorage.setItem('nookdex-nh-zip', '1');
      }
      const f = await choisirFichier('application/zip,.zip');
      if (!f) return null;
      if (f.size > 64 * 1024 * 1024) throw new Error('archive trop grosse pour une sauvegarde New Horizons');
      return window.NookZip.sauvegardeNHDepuisZip(new Uint8Array(await f.arrayBuffer()), f.name);
    },

    async listerProfils() { await demarrage; return listerProfils(); },
    lireProfil: async id => lireJson(fichierProfil(id)),
    async creerProfil(infos) {
      const p = normaliserProfil({ ...infos, id: Profil.nouvelId(), elements: {} });
      await ecrireSur(fichierProfil(p.id), JSON.stringify(p, null, 1));
      return p;
    },
    async ecrireProfil(profil) {
      const p = normaliserProfil(profil);
      if (p.id !== profil.id) throw new Error('Identifiant de profil invalide');
      await ecrireSur(fichierProfil(p.id), JSON.stringify(p, null, 1));
      return true;
    },
    // Pas d'écriture « immédiate » possible ici : elle part tout de suite, sans attendre la fin.
    ecrireProfilSync(profil) {
      try { window.nook.ecrireProfil(profil).catch(() => {}); return true; } catch (e) { return false; }
    },
    // On ne supprime jamais vraiment : le profil part dans la « corbeille » de l'appli.
    async supprimerProfil(id) {
      const f = fichierProfil(id);
      const t = await stockage.lire(f);
      if (t == null) return false;
      await stockage.ecrire(`corbeille/${id}-${Date.now()}.json`, t);
      await stockage.supprimer(f);
      return true;
    },
    async exporterProfil(id) {
      const p = await lireJson(fichierProfil(id));
      if (!p) throw new Error('Profil introuvable');
      return exporter(Profil.nomExportProfil(p), p);
    },
    async importerProfil() {
      const brut = await lireFichierJson();
      if (brut === null) return null;
      const p = normaliserProfil(brut);
      // Si un profil porte déjà cet identifiant, l'import devient un nouveau profil (rien n'est écrasé).
      if ((await stockage.lire(fichierProfil(p.id))) != null) { p.id = Profil.nouvelId(); p.nom = `${p.nom} (importé)`; }
      await ecrireSur(fichierProfil(p.id), JSON.stringify(p, null, 1));
      return p;
    },

    lireReglages: () => lireJson('reglages.json', {}),
    async ecrireReglages(r) {
      const propre = Profil.normaliserReglages(r);
      await ecrireSur('reglages.json', JSON.stringify(propre, null, 1));
      return propre;
    },

    infosApp: async () => ({ version: VERSION, dossier: "stockage de l'appli", packagee: natif }),
    async nouveautes() {
      try { const r = await fetch('NOUVEAUTES.md'); return r.ok ? await r.text() : ''; } catch (e) { return ''; }
    },
    ouvrirDossier: async () => {},
    async ouvrirLien(url) { if (typeof url === 'string' && /^https:\/\//.test(url)) await ouvrirUrl(url); },
    async copier(texte) {
      try { await navigator.clipboard.writeText(String(texte || '').slice(0, 200)); return true; } catch (e) { return false; }
    },

    verifierMaj,
    installerMaj,
    surEtatMaj(rappel) {
      abonnes.add(rappel);
      if (etatMaj.etat === 'prete') setTimeout(() => rappel(etatMaj), 0);
      return () => abonnes.delete(rappel);
    },
  };

  // ---------- Écran de téléphone : menu en tiroir, bouton retour ----------
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('mobile');
    const entete = document.querySelector('.barre-haut');
    if (entete && !document.getElementById('bouton-menu')) {
      const b = document.createElement('button');
      b.id = 'bouton-menu'; b.className = 'bouton-icone bouton-menu'; b.type = 'button';
      b.title = 'Menu'; b.setAttribute('aria-label', 'Menu'); b.textContent = '☰';
      b.addEventListener('click', () => document.body.classList.toggle('menu-ouvert'));
      entete.insertBefore(b, entete.firstChild);
    }
    const voile = document.createElement('div');
    voile.className = 'voile-menu';
    voile.addEventListener('click', () => document.body.classList.remove('menu-ouvert'));
    document.body.appendChild(voile);
    // Un choix dans le menu referme le tiroir.
    const menu = document.getElementById('menu');
    if (menu) menu.addEventListener('click', e => { if (e.target.closest('.menu-lien, a, button')) document.body.classList.remove('menu-ouvert'); });
  });

  // Bouton « retour » d'Android : ferme ce qui est ouvert (tiroir, fenêtre, fiche), sinon met l'appli en arrière-plan.
  if (P.App && natif) {
    P.App.addListener('backButton', () => {
      if (document.body.classList.contains('menu-ouvert')) { document.body.classList.remove('menu-ouvert'); return; }
      const ouverte = document.querySelector('.fond-fenetre') || document.querySelector('.fiche.ouverte');
      if (ouverte) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
      P.App.minimizeApp();
    });
  }
}());
