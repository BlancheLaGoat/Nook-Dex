// Fenêtres : gestion des profils et réglages.
import { h, vider, ouvrirFenetre, confirmer, notifier } from '../lib/dom.js';
import { etat, enregistrerReglages, sauvegarderMaintenant, signaler } from '../lib/etat.js';
import { erreurNom } from '../lib/motdepasse-gc.js';
import { partieVersion, blocs, morceaux } from '../lib/nouveautes.js';

// Jeux dont les codes d'objets dépendent du nom du joueur et de la ville.
const JEUX_AVEC_CODES = ['gc'];

// ---------------------------------------------------------------------------
// Formulaire de profil (création ou modification)
// ---------------------------------------------------------------------------
export function formulaireProfil(existant, surValider) {
  const jeuxDispo = etat.jeux.filter(j => j.disponible);
  let jeuId = existant ? existant.jeu : (jeuxDispo[0] || {}).id;
  const nom = h('input', { type: 'text', maxlength: '60', value: existant ? existant.nom : '', placeholder: 'Ex. : Île Pastèque' });
  const zoneJeu = h('div');
  const zoneOptions = h('div', { class: 'formulaire' });
  let hemisphere = existant ? existant.hemisphere : 'nord';
  let extensions = new Set(existant ? existant.extensions : []);
  const joueur = { nom: (existant && existant.joueur && existant.joueur.nom) || '', ville: (existant && existant.joueur && existant.joueur.ville) || '' };
  let region = (existant && existant.region) || 'eu';

  const dessinerOptions = () => {
    const jeu = etat.jeux.find(j => j.id === jeuId);
    vider(zoneOptions);
    if (!jeu) return;
    if (jeu.hemispheres) {
      zoneOptions.append(h('label', {}, 'Hémisphère',
        h('div', { class: 'choix-groupe' }, ['nord', 'sud'].map(v => h('label', { class: 'ligne' },
          h('input', { type: 'radio', name: 'hemi', value: v, checked: hemisphere === v, onchange: () => { hemisphere = v; } }),
          v === 'nord' ? 'Nord (Europe, Amérique du Nord…)' : 'Sud (Australie, Amérique du Sud…)'))),
        h('span', { class: 'aide' }, "Il change les saisons des insectes, poissons et créatures marines.")));
    }
    if (JEUX_AVEC_CODES.includes(jeu.id)) {
      const champ = (cle, titre, exemple) => {
        const erreur = h('span', { class: 'aide' });
        const verifier = () => { erreur.textContent = joueur[cle] ? (erreurNom(joueur[cle]) || '') : ''; };
        const input = h('input', { type: 'text', maxlength: '8', value: joueur[cle], placeholder: exemple, oninput: ev => { joueur[cle] = ev.target.value; verifier(); } });
        verifier();
        return h('label', {}, titre, input, erreur);
      };
      zoneOptions.append(
        champ('nom', 'Mon nom dans le jeu', 'Ex. : Blanche'),
        champ('ville', 'Ma ville dans le jeu', 'Ex. : Lavande'),
        h('span', { class: 'aide' }, "Écris-les exactement comme dans le jeu (majuscules et accents compris) : certains codes d'objets ne marchent que pour ce nom et cette ville."),
        h('label', {}, 'Version du jeu',
          h('div', { class: 'choix-groupe' }, [['eu', 'Européenne (PAL)'], ['us', 'Américaine (NTSC)']].map(([v, t]) => h('label', { class: 'ligne' },
            h('input', { type: 'radio', name: 'region', value: v, checked: region === v, onchange: () => { region = v; } }), t))),
          h('span', { class: 'aide' }, "La version européenne n'accepte pas les codes e-Reader.")));
    }
    if (jeu.extensions.length) {
      zoneOptions.append(h('label', {}, 'Extensions', jeu.extensions.map(x => h('label', { class: 'ligne' },
        h('input', { type: 'checkbox', checked: extensions.has(x.id), onchange: ev => { if (ev.target.checked) extensions.add(x.id); else extensions.delete(x.id); } }),
        x.nom)), h('span', { class: 'aide' }, "Les objets de l'extension n'apparaissent (et ne comptent) que si elle est cochée.")));
    }
  };

  if (existant) {
    zoneJeu.append(h('label', {}, 'Jeu', h('div', {}, (etat.jeux.find(j => j.id === jeuId) || {}).nom || jeuId)));
  } else {
    zoneJeu.append(h('label', {}, 'Jeu',
      h('select', { onchange: ev => { jeuId = ev.target.value; extensions = new Set(); dessinerOptions(); } },
        etat.jeux.map(j => h('option', { value: j.id, disabled: !j.disponible, selected: j.id === jeuId }, `${j.nom} (${j.plateforme})${j.disponible ? '' : ' — bientôt'}`)))));
  }
  dessinerOptions();

  const valider = () => {
    const n = nom.value.trim();
    if (!n) { nom.focus(); notifier('Donne un nom à ton profil.', 'erreur'); return; }
    if (JEUX_AVEC_CODES.includes(jeuId)) {
      for (const cle of ['nom', 'ville']) {
        const err = joueur[cle] ? erreurNom(joueur[cle]) : null;
        if (err) { notifier(`${cle === 'nom' ? 'Ton nom' : 'Ta ville'} : ${err}`, 'erreur'); return; }
      }
    }
    surValider({ nom: n, jeu: jeuId, hemisphere, extensions: [...extensions], joueur: { nom: joueur.nom, ville: joueur.ville }, region });
  };
  nom.addEventListener('keydown', e => { if (e.key === 'Enter') valider(); });

  return {
    contenu: h('div', { class: 'formulaire' },
      h('label', {}, 'Nom du profil (île, village…)', nom),
      zoneJeu, zoneOptions),
    valider,
  };
}

export function fenetreNouveauProfil(surCree) {
  let fermer;
  const f = formulaireProfil(null, async infos => {
    try {
      const p = await window.nook.creerProfil(infos);
      fermer();
      surCree(p);
    } catch (e) { notifier(`Impossible de créer le profil : ${e.message}`, 'erreur'); }
  });
  fermer = ouvrirFenetre('Nouveau profil', [f.contenu,
    h('div', { class: 'actions' }, h('button', { class: 'bouton', onclick: () => fermer() }, 'Annuler'), h('button', { class: 'bouton principal', onclick: f.valider }, 'Créer'))]);
}

function fenetreModifierProfil(p, surFini) {
  let fermer;
  const f = formulaireProfil(p, async infos => {
    const complet = p.id === etat.profil?.id ? etat.profil : await window.nook.lireProfil(p.id);
    Object.assign(complet, { nom: infos.nom, hemisphere: infos.hemisphere, extensions: infos.extensions, joueur: infos.joueur, region: infos.region });
    await window.nook.ecrireProfil(complet);
    fermer();
    surFini();
  });
  fermer = ouvrirFenetre('Modifier le profil', [f.contenu,
    h('div', { class: 'actions' }, h('button', { class: 'bouton', onclick: () => fermer() }, 'Annuler'), h('button', { class: 'bouton principal', onclick: f.valider }, 'Enregistrer'))]);
}

// ---------------------------------------------------------------------------
// Liste des profils
// ---------------------------------------------------------------------------
export function fenetreProfils(choisirProfil) {
  const liste = h('div', { class: 'liste-profils' });
  let fermer;

  const recharger = async () => {
    etat.profils = await window.nook.listerProfils();
    vider(liste);
    if (!etat.profils.length) liste.append(h('p', { class: 'aide' }, "Aucun profil pour l'instant."));
    for (const p of etat.profils) {
      const jeu = etat.jeux.find(j => j.id === p.jeu);
      liste.append(h('div', { class: `ligne-profil${etat.profil && etat.profil.id === p.id ? ' actif' : ''}` },
        h('span', { class: 'pastille-jeu' }, jeu ? jeu.sigle : p.jeu),
        h('div', { class: 'infos-profil', onclick: () => { fermer(); choisirProfil(p.id); } },
          h('strong', {}, p.nom),
          h('small', {}, `${jeu ? jeu.nom : p.jeu}${jeu && jeu.hemispheres ? ` · hémisphère ${p.hemisphere}` : ''} · ${p.nb} élément${p.nb > 1 ? 's' : ''} coché${p.nb > 1 ? 's' : ''}`)),
        h('button', { class: 'bouton petit', title: 'Modifier', onclick: () => fenetreModifierProfil(p, async () => { await recharger(); if (etat.profil && etat.profil.id === p.id) choisirProfil(p.id); }) }, 'Modifier'),
        h('button', { class: 'bouton petit', title: 'Exporter en JSON', onclick: async () => {
          await sauvegarderMaintenant();
          const f = await window.nook.exporterProfil(p.id);
          if (f) notifier('Progression exportée.');
        } }, 'Exporter'),
        h('button', { class: 'bouton petit', title: 'Supprimer', onclick: async () => {
          const ok = await confirmer('Supprimer le profil', `Supprimer « ${p.nom} » ? Il sera déplacé dans le dossier « corbeille » de Nook Dex (récupérable à la main).`, 'Supprimer', true);
          if (!ok) return;
          await window.nook.supprimerProfil(p.id);
          if (etat.profil && etat.profil.id === p.id) { etat.profil = null; await enregistrerReglages({ profilActif: null }); signaler('profil-supprime'); }
          recharger();
        } }, '🗑'),
      ));
    }
  };

  fermer = ouvrirFenetre('Mes profils', [
    h('p', { class: 'aide' }, 'Un profil = une partie dans un jeu (par exemple une île de New Horizons). Tu peux en avoir plusieurs par jeu.'),
    liste,
    h('div', { class: 'actions' },
      h('button', { class: 'bouton', onclick: async () => {
        try {
          const p = await window.nook.importerProfil();
          if (p) { notifier(`Profil « ${p.nom} » importé.`); recharger(); }
        } catch (e) { notifier(`Import impossible : ${e.message}`, 'erreur'); }
      } }, 'Importer un fichier…'),
      h('button', { class: 'bouton principal', onclick: () => { fermer(); fenetreNouveauProfil(p => choisirProfil(p.id)); } }, '+ Nouveau profil')),
  ], { large: true });
  recharger();
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------
function versChampDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function fenetreReglages(etatMaj) {
  const infos = await window.nook.infosApp();
  const simulee = etat.reglages.dateSimulee;
  const champDate = h('input', { type: 'datetime-local', value: versChampDate(simulee ? new Date(simulee) : new Date()) });
  const actif = h('input', { type: 'checkbox', checked: !!simulee });

  const appliquerDate = () => {
    enregistrerReglages({ dateSimulee: actif.checked && champDate.value ? new Date(champDate.value).toISOString() : null });
  };
  actif.addEventListener('change', appliquerDate);
  champDate.addEventListener('change', () => { if (!actif.checked) actif.checked = true; appliquerDate(); });

  const theme = v => h('label', { class: 'ligne' },
    h('input', { type: 'radio', name: 'theme', checked: etat.reglages.theme === v, onchange: () => enregistrerReglages({ theme: v }) }),
    v === 'clair' ? 'Clair' : v === 'sombre' ? 'Sombre' : 'Comme Windows');

  const texteMaj = {
    dev: "Mode développement : les mises à jour ne sont vérifiées que dans l'appli installée.",
    verification: 'Recherche de mise à jour…',
    'a-jour': 'Nook Dex est à jour.',
    disponible: 'Une mise à jour est en cours de téléchargement…',
    telechargement: 'Téléchargement de la mise à jour…',
    prete: 'Une mise à jour est prête : elle sera installée à la fermeture.',
    erreur: 'Impossible de vérifier les mises à jour pour le moment.',
  };

  const fermer = ouvrirFenetre('Réglages', h('div', { class: 'formulaire' },
    h('label', {}, 'Thème', h('div', { class: 'choix-groupe' }, theme('clair'), theme('sombre'), theme('systeme'))),
    h('label', {}, 'Simuler une date et une heure',
      h('label', { class: 'ligne' }, actif, 'Utiliser cette date au lieu de celle du PC'),
      champDate,
      h('span', { class: 'aide' }, "Pratique pour préparer une saison ou si l'horloge de ta console n'est pas à l'heure. « Disponible maintenant » et « Part bientôt » utiliseront cette date."),
      h('div', {}, h('button', { class: 'bouton petit', onclick: () => { actif.checked = false; champDate.value = versChampDate(new Date()); appliquerDate(); } }, "Revenir à l'heure du PC"))),
    h('label', {}, 'Mes données',
      h('span', { class: 'aide' }, `Profils, copies de secours et images sont rangés dans : ${infos.dossier}`),
      h('div', {}, h('button', { class: 'bouton petit', onclick: () => window.nook.ouvrirDossier() }, 'Ouvrir le dossier'))),
    h('label', {}, 'Version',
      h('span', {}, `Nook Dex ${infos.version}`),
      h('div', {}, h('button', { class: 'bouton petit', onclick: () => fenetreNouveautes(infos.version) }, '✨ Quoi de neuf ?')),
      h('span', { class: 'aide' }, texteMaj[(etatMaj && etatMaj.etat) || (infos.packagee ? 'verification' : 'dev')] || ''),
      etatMaj && etatMaj.etat === 'prete' ? h('div', {}, h('button', { class: 'bouton principal petit', onclick: () => window.nook.installerMaj() }, 'Redémarrer et installer')) : null),
    h('label', {}, 'Sources des données',
      h('span', { class: 'aide' }, 'Nookipedia (nookipedia.com) et les tableurs communautaires ACNH, ACNL, ACCF, ACWW et ACGC Spreadsheet (avec leurs feuilles de traductions). Les images restent la propriété de Nintendo. Nook Dex est un projet de fan non officiel.')),
    h('div', { class: 'actions' }, h('button', { class: 'bouton principal', onclick: () => fermer() }, 'Fermer')),
  ));
}

// ---------------------------------------------------------------------------
// « Quoi de neuf ? » : la partie de NOUVEAUTES.md pour cette version.
// Renvoie false si le fichier n'a rien pour cette version (aucune fenêtre n'est ouverte).
// ---------------------------------------------------------------------------
export async function fenetreNouveautes(version) {
  const partie = partieVersion(await window.nook.nouveautes(), version);
  if (!partie) return false;
  const enLigne = t => morceaux(t).map(m => (m.gras ? h('strong', {}, m.texte) : m.texte));
  const contenu = blocs(partie).map(b => (b.type === 'titre' ? h('h3', {}, b.texte)
    : b.type === 'liste' ? h('ul', { class: 'nouveautes-liste' }, b.elements.map(e => h('li', {}, enLigne(e))))
      : h('p', {}, enLigne(b.texte))));
  let fermer;
  fermer = ouvrirFenetre(`✨ Quoi de neuf dans Nook Dex ${version} ?`, h('div', { class: 'nouveautes' },
    contenu,
    h('div', { class: 'actions' }, h('button', { class: 'bouton principal', onclick: () => fermer() }, 'Super, merci !'))), { large: true });
  // Le bouton du bas prend le focus et fait défiler la fenêtre : on revient au début du texte.
  const corps = [...document.querySelectorAll('.fenetre-corps')].pop();
  if (corps) requestAnimationFrame(() => { corps.scrollTop = 0; });
  return true;
}
