// Fenêtre « Importer ma sauvegarde » (GameCube, Wild World, New Leaf, New Horizons) : coche dans le profil ce que la sauvegarde du jeu contient.
// Le fichier du jeu n'est jamais modifié, et l'import ne fait qu'ajouter des coches (il n'en enlève aucune).
import { h, vider, notifier, ouvrirFenetre } from '../lib/dom.js';
import { etat, etatDe, donneesCategorie, definirPlusieurs } from '../lib/etat.js';
import { lireSauvegardeGC, cochesImport } from '../lib/sauvegarde-gc.js';
import { lireSauvegardeWW, cochesImportWW } from '../lib/sauvegarde-ww.js';
import { lireSauvegardeNL, cochesImportNL } from '../lib/sauvegarde-nl.js';
import { lireSauvegardeNH, cochesImportNH } from '../lib/sauvegarde-nh.js';

// Par jeu : lecture du fichier, coches à faire, et textes de la fenêtre.
const LECTEURS = {
  gc: {
    titre: 'Ouvrir ma sauvegarde Animal Crossing (GameCube)',
    lire: lireSauvegardeGC,
    coches: cochesImport,
    version: save => `version ${save.region || save.code}`,
    explication: "Le musée est commun à toute la ville ; le catalogue (meubles, papiers peints, sols, papeterie, morceaux de K.K.) est propre à chaque joueur.",
    note: 'Lecture vérifiée sur des sauvegardes neuves (versions américaine, européenne et australienne) ; la partie musée reste à vérifier sur une ville plus avancée.',
  },
  ww: {
    titre: 'Ouvrir ma sauvegarde Wild World (.sav ou .dsv)',
    lire: lireSauvegardeWW,
    coches: cochesImportWW,
    version: save => (save.format === 'dsv' ? 'fichier DeSmuME / RetroArch' : 'fichier .sav'),
    explication: "Le musée est commun à toute la ville ; l'encyclopédie (créatures attrapées) et le catalogue (meubles, vêtements, papiers peints, sols, papeterie, morceaux de K.K., photos…) sont propres à chaque joueur.",
    note: 'Lecture vérifiée sur une vraie ville européenne. Les versions japonaise et coréenne ne sont pas prises en charge.',
  },
  nl: {
    titre: 'Ouvrir ma sauvegarde New Leaf (garden_plus.dat)',
    lire: lireSauvegardeNL,
    coches: cochesImportNL,
    version: () => 'Welcome amiibo',
    explication: "Le musée est commun à toute la ville ; les objets débloqués (créatures attrapées, catalogue : meubles, vêtements, papiers peints, sols, morceaux de K.K., photos…) sont propres à chaque joueur.",
    note: "Exporte « garden_plus.dat » avec Checkpoint ou JKSM (3DS), ou copie-le depuis Citra. Lecture vérifiée sur deux vraies villes ; l'ancien « garden.dat » (jeu jamais mis à jour en 1.5) n'est pas pris en charge.",
  },
  nh: {
    titre: 'Choisir le dossier de ma sauvegarde New Horizons',
    dossier: true,
    lire: lireSauvegardeNH,
    coches: cochesImportNH,
    version: save => `version ${save.version}`,
    explication: "Le musée est commun à toute l'île ; les objets déjà obtenus (créatures attrapées, meubles, vêtements…) et les recettes connues sont propres à chaque habitant.",
    note: "Choisis le dossier exporté avec JKSV ou Checkpoint (celui qui contient main.dat et les dossiers Villager0, Villager1…). Seule la version 3.0 du jeu est prise en charge. À VÉRIFIER : testé seulement sur des sauvegardes fabriquées.",
  },
};
export const JEUX_AVEC_SAUVEGARDE = Object.keys(LECTEURS);

const NOMS_CATEGORIES = {
  poissons: 'poissons', insectes: 'insectes', fossiles: 'fossiles', art: 'tableaux', meubles: 'meubles',
  'papiers-peints': 'papiers peints', sols: 'sols', papeterie: 'papeterie', kk: 'morceaux de K.K.', gyroides: 'gyroïdes',
  vetements: 'vêtements', photos: 'photos', 'creatures-marines': 'créatures marines', outils: 'outils',
  tapis: 'tapis', recettes: 'recettes', posters: 'posters', fleurs: 'fleurs', clotures: 'clôtures',
};

// Ce que l'import change vraiment : coches nouvelles (obtenu) et dons nouveaux (musée), par catégorie.
export function nouveautesImport(coches, lireEtat) {
  const parCat = new Map();
  for (const c of coches) {
    const st = lireEtat(c.categorie, c.id);
    const nouvelObtenu = !st.obtenu;
    const nouveauMusee = c.musee && !st.musee;
    if (!nouvelObtenu && !nouveauMusee) continue;
    if (!parCat.has(c.categorie)) parCat.set(c.categorie, { obtenu: [], musee: [] });
    const x = parCat.get(c.categorie);
    if (nouveauMusee) x.musee.push(c.id); else x.obtenu.push(c.id);
  }
  return parCat;
}

export async function fenetreImportSauvegarde(jeu) {
  const lecteur = LECTEURS[jeu.id];
  if (!lecteur) return;
  let fichier;
  try {
    fichier = lecteur.dossier ? await window.nook.lireDossierNH(lecteur.titre) : await window.nook.lireSauvegarde(lecteur.titre, jeu.id);
  } catch (e) { notifier(`Lecture impossible : ${e.message}`, 'erreur'); return; }
  if (!fichier) return;
  let save, correspondance;
  try {
    save = await lecteur.lire(fichier.octets);
    correspondance = await donneesCategorie(jeu.id, 'sauvegarde');
    if (!correspondance || !correspondance.musee) throw new Error('les données de correspondance du jeu manquent');
  } catch (e) { notifier(`Import impossible : ${e.message}`, 'erreur'); return; }

  const joueurs = save.joueurs.filter(j => j.existe);
  const nomProfil = ((etat.profil.joueur && etat.profil.joueur.nom) || '').trim();
  let numero = (joueurs.find(j => nomProfil && j.nom === nomProfil) || joueurs[0] || { numero: 1 }).numero;
  const resume = h('div');
  let fermer;
  let aAppliquer = new Map();

  const dessiner = () => {
    vider(resume);
    aAppliquer = nouveautesImport(lecteur.coches(save, correspondance, numero), etatDe);
    if (!aAppliquer.size) { resume.append(h('p', { class: 'aide' }, 'Rien de nouveau : tout ce que contient la sauvegarde est déjà coché dans ce profil.')); return; }
    const lignes = [...aAppliquer].map(([cat, x]) => {
      const morceaux = [];
      if (x.obtenu.length) morceaux.push(`${x.obtenu.length} à cocher`);
      if (x.musee.length) morceaux.push(`${x.musee.length} au musée`);
      return h('li', {}, h('strong', {}, NOMS_CATEGORIES[cat] || cat), ' : ', morceaux.join(', '));
    });
    resume.append(h('p', {}, "L'import va ajouter :"), h('ul', {}, lignes));
  };

  const appliquer = () => {
    let n = 0;
    for (const [cat, x] of aAppliquer) {
      if (x.obtenu.length) definirPlusieurs(cat, x.obtenu, 'obtenu', true);
      if (x.musee.length) definirPlusieurs(cat, x.musee, 'musee', true);
      n += x.obtenu.length + x.musee.length;
    }
    fermer();
    notifier(`Sauvegarde importée : ${n} élément${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}.`);
  };

  dessiner();
  fermer = ouvrirFenetre('Importer ma sauvegarde', [
    h('p', { class: 'aide' }, `${lecteur.dossier ? 'Dossier' : 'Fichier'} « ${fichier.nom} » · ${lecteur.version(save)}${save.copie === 'secours' ? ' · copie de secours (la principale est abîmée)' : ''}.`),
    h('p', { class: 'aide' }, lecteur.explication, " Nook Dex n'enlève jamais une coche et ne modifie pas ta sauvegarde."),
    joueurs.length > 1 ? h('label', {}, 'Joueur',
      h('select', { onchange: ev => { numero = Number(ev.target.value); dessiner(); } },
        joueurs.map(j => h('option', { value: String(j.numero), selected: j.numero === numero }, `${j.numero}. ${j.nom || '(sans nom)'}`)))) : null,
    joueurs.length === 1 ? h('p', {}, `Joueur : ${joueurs[0].nom || 'joueur 1'}.`) : null,
    resume,
    h('p', { class: 'note' }, 'ℹ️ ', lecteur.note),
    h('div', { class: 'actions' },
      h('button', { class: 'bouton', onclick: () => fermer() }, 'Annuler'),
      h('button', { class: 'bouton principal', onclick: () => { if (aAppliquer.size) appliquer(); else fermer(); } }, 'Importer')),
  ], { large: true });
}
