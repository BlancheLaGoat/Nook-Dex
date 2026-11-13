// Le « pont » entre l'interface et le processus principal.
// L'interface n'a accès qu'aux fonctions listées ici (sécurité).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nook', {
  jeux: () => ipcRenderer.invoke('donnees:jeux'),
  especes: () => ipcRenderer.invoke('donnees:especes'),
  categorie: (jeu, categorie) => ipcRenderer.invoke('donnees:categorie', jeu, categorie),
  infosDonnees: jeu => ipcRenderer.invoke('donnees:infos', jeu),

  listerProfils: () => ipcRenderer.invoke('profils:liste'),
  lireProfil: id => ipcRenderer.invoke('profils:lire', id),
  creerProfil: infos => ipcRenderer.invoke('profils:creer', infos),
  ecrireProfil: profil => ipcRenderer.invoke('profils:ecrire', profil),
  ecrireProfilSync: profil => ipcRenderer.sendSync('profils:ecrireSync', profil),
  supprimerProfil: id => ipcRenderer.invoke('profils:supprimer', id),
  exporterProfil: id => ipcRenderer.invoke('profils:exporter', id),
  importerProfil: () => ipcRenderer.invoke('profils:importer'),

  lireReglages: () => ipcRenderer.invoke('reglages:lire'),
  ecrireReglages: r => ipcRenderer.invoke('reglages:ecrire', r),

  infosApp: () => ipcRenderer.invoke('app:infos'),
  ouvrirDossier: () => ipcRenderer.invoke('app:ouvrirDossier'),
  ouvrirLien: url => ipcRenderer.invoke('app:ouvrirLien', url),

  verifierMaj: () => ipcRenderer.invoke('maj:verifier'),
  installerMaj: () => ipcRenderer.invoke('maj:installer'),
  surEtatMaj: rappel => {
    const f = (_e, etat) => rappel(etat);
    ipcRenderer.on('maj:etat', f);
    return () => ipcRenderer.removeListener('maj:etat', f);
  },
});
