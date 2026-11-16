// Synchro en ligne côté appli : quand synchroniser, que faire du profil ouvert, et la section des réglages.
// Les calculs (code, chiffrement, fusion, serveur) sont dans lib/synchro.js.
import { h, vider, notifier, confirmer } from '../lib/dom.js';
import { etat, signaler, sauvegarderMaintenant, planifierSauvegarde, surChangement } from '../lib/etat.js';
import {
  synchroniser, nouveauCode, normaliserCode, codeLisible, supprimerEnLigne, versSynchro, fusionnerProfil, empreinte, CHAMPS_PROFIL,
} from '../lib/synchro.js';

let etatSynchro = null;      // { code, base, derniere, erreur } ou null (pas de synchro sur cet appareil)
let enCours = false, encore = false, minuterie = null, statut = '';
const abonnes = new Set();
const prevenir = () => { for (const f of abonnes) f(); };

const enregistrerEtat = async s => { etatSynchro = s; await window.nook.ecrireSynchro(s); prevenir(); };

// Accès aux profils de cet appareil, pour lib/synchro.js. Le profil ouvert est d'abord enregistré, et on garde
// sa version du moment : une coche faite pendant la synchro ne sera pas perdue.
function accesProfils(memo) {
  return {
    async lireTout() {
      await sauvegarderMaintenant();
      memo.avant = etat.profil ? versSynchro(JSON.parse(JSON.stringify(etat.profil))) : null;
      const liste = await window.nook.listerProfils();
      const tous = {};
      for (const r of liste) { const p = await window.nook.lireProfil(r.id); if (p) tous[p.id] = p; }
      return tous;
    },
    ecrire: p => window.nook.ecrireProfil(p),
    supprimer: id => window.nook.supprimerProfil(id),
  };
}

// Le profil ouvert a changé en ligne : on le met à jour ici, en gardant ce qui a été coché pendant la synchro.
async function appliquerAuProfilOuvert(resultat, memo) {
  if (!etat.profil) return;
  const id = etat.profil.id;
  if (resultat.supprimes.includes(id)) {
    etat.profil = null;
    signaler('profil-supprime');
    notifier('Ce profil a été supprimé sur un autre appareil (il est dans la corbeille).');
    return;
  }
  if (!resultat.ecrits.includes(id)) return;
  const fusion = resultat.base[id];
  const final = memo.avant ? fusionnerProfil(memo.avant, versSynchro(etat.profil), fusion) : fusion;
  for (const c of CHAMPS_PROFIL) { if (final[c] === undefined) delete etat.profil[c]; else etat.profil[c] = final[c]; }
  etat.profil.elements = final.elements;
  if (empreinte(final) !== empreinte(fusion)) planifierSauvegarde();   // coché pendant la synchro : renvoyé la prochaine fois
}

async function lancer({ manuel = false, doitExister = false } = {}) {
  if (!etatSynchro) return false;
  if (enCours) { encore = true; return false; }
  enCours = true; statut = 'Synchronisation…'; prevenir();
  const memo = {};
  try {
    const r = await synchroniser(accesProfils(memo), etatSynchro, { doitExister });
    await enregistrerEtat({ ...etatSynchro, base: r.base, derniere: Date.now(), erreur: '' });
    etat.profils = await window.nook.listerProfils();
    await appliquerAuProfilOuvert(r, memo);
    if (r.ecrits.length || r.supprimes.length) signaler('synchro');
    if (manuel) notifier('Synchronisé.');
    return true;
  } catch (e) {
    if (e.inconnu) throw e;
    if (etatSynchro) await enregistrerEtat({ ...etatSynchro, erreur: e.message || String(e) });
    if (manuel) notifier(e.message || String(e), 'erreur');
    return false;
  } finally {
    enCours = false; statut = ''; prevenir();
    if (encore) { encore = false; bientot(); }
  }
}
// Après une modif, on attend un peu : plusieurs coches d'affilée = un seul envoi.
function bientot(ms = 2000) {
  clearTimeout(minuterie);
  if (etatSynchro) minuterie = setTimeout(() => lancer(), ms);
}
// Quand l'appli est affichée, on regarde régulièrement s'il y a du neuf en ligne (une lecture coûte très peu).
export const INTERVALLE_SYNCHRO = 20 * 1000;

// Au démarrage de l'appli : synchro tout de suite, puis après chaque enregistrement, toutes les 20 secondes
// tant que l'appli est affichée, et dès qu'on revient dessus (fenêtre du PC qui reprend la main, téléphone rallumé).
export async function demarrerSynchro() {
  try { etatSynchro = await window.nook.lireSynchro(); } catch (e) { etatSynchro = null; }
  surChangement(raison => { if (raison === 'sauvegarde') bientot(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') bientot(300); });
  window.addEventListener('focus', () => bientot(300));
  setInterval(() => { if (document.visibilityState !== 'hidden') lancer(); }, INTERVALLE_SYNCHRO);
  bientot(1500);
}

async function activer() {
  await enregistrerEtat({ code: nouveauCode(), base: {}, derniere: null, erreur: '' });
  if (await lancer({ manuel: true })) notifier('Synchro en ligne activée. Affiche le code pour relier ton autre appareil.');
}
async function relier(texte) {
  const code = normaliserCode(texte);
  if (!code) { notifier('Code invalide : il fait 32 caractères (lettres et chiffres).', 'erreur'); return; }
  const avant = etatSynchro;
  await enregistrerEtat({ code, base: {}, derniere: null, erreur: '' });
  try {
    if (!(await lancer({ doitExister: true }))) throw new Error((etatSynchro && etatSynchro.erreur) || 'La synchro a échoué.');
    notifier('Cet appareil est relié à ta synchro en ligne.');
  } catch (e) {
    notifier(e.message, 'erreur');
    if (avant) await enregistrerEtat(avant);
    else { etatSynchro = null; await window.nook.ecrireSynchro(null); prevenir(); }
  }
}
async function desactiver() {
  if (!await confirmer('Désactiver la synchro', 'Désactiver la synchro en ligne sur cet appareil ? Tes profils restent ici et en ligne.', 'Désactiver')) return;
  etatSynchro = null; await window.nook.ecrireSynchro(null); prevenir();
  notifier('Synchro en ligne désactivée sur cet appareil.');
}
async function supprimer() {
  if (!await confirmer('Supprimer mes données en ligne', "Supprimer tes profils du serveur de synchro ? Ils restent sur tes appareils. Désactive aussi la synchro sur tes autres appareils, sinon ils les renverront à leur prochaine synchro.", 'Supprimer', true)) return;
  try { await supprimerEnLigne(etatSynchro.code); } catch (e) { notifier(e.message, 'erreur'); return; }
  etatSynchro = null; await window.nook.ecrireSynchro(null); prevenir();
  notifier('Données en ligne supprimées.');
}

// ---------- Section « Synchro en ligne » des réglages ----------
export function sectionSynchro() {
  const boite = h('div', { class: 'synchro' });
  let voirCode = false;
  const date = ms => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const dessiner = () => {
    vider(boite);
    if (!etatSynchro) {
      const champ = h('input', { type: 'text', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'characters' });
      boite.append(
        h('span', { class: 'aide' }, "Synchronise tes profils entre le PC et le téléphone par internet. Pas de compte : un code secret relie tes appareils, et tout est chiffré avant l'envoi (le serveur ne peut pas lire tes données)."),
        h('div', {}, h('button', { class: 'bouton principal petit', onclick: activer }, 'Activer sur cet appareil')),
        h('span', { class: 'aide' }, 'Déjà activée sur un autre appareil ? Entre son code (Réglages → Synchro en ligne → Afficher le code) :'),
        h('div', { class: 'synchro-relier' }, champ, h('button', { class: 'bouton petit', onclick: () => relier(champ.value) }, 'Relier')));
      return;
    }
    const s = etatSynchro;
    boite.append(
      h('span', {}, statut ? h('strong', {}, statut) : [h('strong', {}, 'Activée'), ` · dernière synchro : ${s.derniere ? date(s.derniere) : 'jamais'}`]),
      s.erreur ? h('span', { class: 'aide erreur' }, s.erreur) : null,
      h('div', { class: 'synchro-boutons' },
        h('button', { class: 'bouton principal petit', disabled: enCours, onclick: () => lancer({ manuel: true }) }, 'Synchroniser maintenant'),
        h('button', { class: 'bouton petit', onclick: () => { voirCode = !voirCode; dessiner(); } }, voirCode ? 'Cacher le code' : 'Afficher le code')),
      voirCode ? h('div', { class: 'synchro-code' },
        h('span', { class: 'aide' }, 'Sur ton autre appareil : Réglages → Synchro en ligne → « Relier », avec ce code. Garde-le pour toi : il donne accès à tes profils.'),
        h('code', {}, codeLisible(s.code)),
        h('div', {}, h('button', { class: 'bouton petit', onclick: async () => { notifier(await window.nook.copier(codeLisible(s.code)) ? 'Code copié.' : 'Copie impossible : recopie le code à la main.'); } }, 'Copier le code'))) : null,
      h('div', { class: 'synchro-boutons' },
        h('button', { class: 'bouton petit', onclick: desactiver }, 'Désactiver sur cet appareil'),
        h('button', { class: 'bouton petit danger', onclick: supprimer }, 'Supprimer mes données en ligne')));
  };
  abonnes.add(dessiner);
  dessiner();
  // La boîte se détache quand la fenêtre des réglages se ferme : on arrête alors de la redessiner.
  const verif = setInterval(() => { if (!boite.isConnected) { abonnes.delete(dessiner); clearInterval(verif); } }, 2000);
  return boite;
}
