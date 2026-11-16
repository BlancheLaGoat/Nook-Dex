// Vérification d'un profil Nook Dex avant de l'écrire, commune au PC (src/main.js) et à Android (mobile/src/mobile.js).
// Marche avec require() (Node, Electron) et comme simple <script> (window.NookProfil).
(function (racine, fabrique) {
  const m = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else racine.NookProfil = m;
}(typeof self !== 'undefined' ? self : this, () => {
  const VERSION_SCHEMA = 1;
  const ID_VALIDE = /^[a-z0-9-]+$/;

  // Identifiant d'un nouveau profil : « p- » + 8 chiffres hexadécimaux au hasard.
  function nouvelId(hasard) {
    const octets = hasard ? hasard(4) : Array.from({ length: 4 }, () => Math.floor(Math.random() * 256));
    return `p-${Array.from(octets, o => o.toString(16).padStart(2, '0')).join('')}`;
  }

  function normaliserProfil(p, creerId = nouvelId) {
    if (!p || typeof p !== 'object') throw new Error("Ce fichier n'est pas un profil Nook Dex.");
    if (typeof p.jeu !== 'string' || typeof p.nom !== 'string') throw new Error("Ce fichier n'est pas un profil Nook Dex (jeu ou nom manquant).");
    if ((p.schema || 1) > VERSION_SCHEMA) throw new Error('Ce profil vient d\'une version plus récente de Nook Dex. Mets l\'appli à jour d\'abord.');
    return {
      schema: VERSION_SCHEMA,
      id: ID_VALIDE.test(p.id || '') ? p.id : creerId(),
      nom: p.nom.slice(0, 60),
      jeu: p.jeu,
      hemisphere: p.hemisphere === 'sud' ? 'sud' : 'nord',
      extensions: Array.isArray(p.extensions) ? p.extensions.filter(e => typeof e === 'string') : [],
      // Nom du joueur et de la ville dans le jeu (codes d'objets du GameCube), et version du jeu.
      joueur: {
        nom: typeof (p.joueur && p.joueur.nom) === 'string' ? [...p.joueur.nom].slice(0, 8).join('') : '',
        ville: typeof (p.joueur && p.joueur.ville) === 'string' ? [...p.joueur.ville].slice(0, 8).join('') : '',
      },
      region: p.region === 'us' ? 'us' : 'eu',
      // Carte de la ville (outil « Ville parfaite » de Wild World) : vérifiée en détail par l'appli (lib/ville.js).
      ...(p.ville && typeof p.ville === 'object' && !Array.isArray(p.ville) ? { ville: p.ville } : {}),
      // Semaine de navets (prédicteur de prix) : vérifiée en détail par l'appli (lib/navets.js).
      ...(p.navets && typeof p.navets === 'object' && !Array.isArray(p.navets) ? { navets: p.navets } : {}),
      // Champ de fleurs hybrides (planificateur) : vérifié en détail par l'appli (lib/fleurs.js).
      ...(p.champFleurs && typeof p.champFleurs === 'object' && !Array.isArray(p.champFleurs) ? { champFleurs: p.champFleurs } : {}),
      cree_le: p.cree_le || new Date().toISOString(),
      modifie_le: new Date().toISOString(),
      elements: p.elements && typeof p.elements === 'object' ? p.elements : {},
    };
  }

  // Résumé d'un profil pour la liste des profils.
  const resumeProfil = p => ({ id: p.id, nom: p.nom, jeu: p.jeu, hemisphere: p.hemisphere, extensions: p.extensions, nb: Object.keys(p.elements || {}).length });

  // Réglages : seules ces valeurs sont gardées.
  function normaliserReglages(r) {
    r = r || {};
    return {
      theme: ['clair', 'sombre', 'systeme'].includes(r.theme) ? r.theme : 'systeme',
      profilActif: typeof r.profilActif === 'string' ? r.profilActif : null,
      dateSimulee: typeof r.dateSimulee === 'string' ? r.dateSimulee : null,
      // Dernière version dont la fenêtre « Quoi de neuf ? » a été montrée.
      derniereVersionVue: typeof r.derniereVersionVue === 'string' ? r.derniereVersionVue.slice(0, 20) : null,
    };
  }

  // État de la synchro en ligne d'un appareil (src/renderer/lib/synchro.js) : code, dernière version synchronisée,
  // date et message de la dernière synchro.
  function normaliserSynchro(s) {
    if (!s || typeof s !== 'object' || typeof s.code !== 'string' || !/^[0-9A-Z]{32}$/.test(s.code)) throw new Error('État de synchro invalide');
    return {
      code: s.code,
      base: s.base && typeof s.base === 'object' && !Array.isArray(s.base) ? s.base : {},
      derniere: Number.isFinite(s.derniere) ? s.derniere : null,
      erreur: typeof s.erreur === 'string' ? s.erreur.slice(0, 300) : '',
    };
  }

  // Nom de fichier proposé pour exporter un profil.
  const nomExportProfil = p => `nook-dex-${p.jeu}-${p.nom.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'profil'}.json`;

  return { VERSION_SCHEMA, ID_VALIDE, nouvelId, normaliserProfil, resumeProfil, normaliserReglages, normaliserSynchro, nomExportProfil };
}));
