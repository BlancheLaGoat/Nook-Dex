// Petit outil pour créer des éléments HTML sans jamais injecter de texte comme du code.
//   h('button', { class: 'ok', onclick: f }, 'Valider')
export function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  ajouter(el, enfants);
  return el;
}

function ajouter(el, enfants) {
  for (const e of enfants) {
    if (e === null || e === undefined || e === false) continue;
    if (Array.isArray(e)) ajouter(el, e);
    else el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
}

export function vider(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// « https://dodo.ac/np/images/thumb/9/99/X.png/128px-X.png » -> « https://dodo.ac/np/images/9/99/X.png » (sinon null).
export function imageOrigine(url) {
  const m = /^(https:\/\/dodo\.ac\/np\/images\/)thumb\/([0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/\d+px-[^/]+$/.exec(String(url || ''));
  return m ? m[1] + m[2] : null;
}

// Image distante passée par le cache local de l'appli.
export function image(url, alt = '', classe = 'vignette') {
  if (!url) return h('div', { class: `${classe} sans-image`, 'aria-hidden': 'true' }, '?');
  const img = h('img', { class: classe, alt, loading: 'lazy', decoding: 'async', src: `nookimg://img/${encodeURIComponent(url)}` });
  // Nookipedia ne fabrique pas de miniature plus grande que l'image d'origine (« …/thumb/9/99/X.png/128px-X.png »
  // répond 404) : on réessaie alors avec l'image d'origine, avant d'afficher « ? ».
  const origine = imageOrigine(url);
  const echec = () => img.replaceWith(h('div', { class: `${classe} sans-image`, title: 'Image indisponible' }, '?'));
  img.addEventListener('error', () => {
    if (!origine) return echec();
    img.addEventListener('error', echec, { once: true });
    img.src = `nookimg://img/${encodeURIComponent(origine)}`;
  }, { once: true });
  return img;
}

export function notifier(message, type = 'info') {
  const zone = document.getElementById('notifications');
  const n = h('div', { class: `notification ${type}`, role: 'status' }, message);
  zone.append(n);
  setTimeout(() => n.classList.add('partir'), 3200);
  setTimeout(() => n.remove(), 3700);
}

// Fenêtre de dialogue simple. Renvoie une fonction pour la fermer.
export function ouvrirFenetre(titre, contenu, { large = false, surFermeture } = {}) {
  const zone = document.getElementById('fenetres');
  const fermer = () => { fond.remove(); document.removeEventListener('keydown', echap); if (surFermeture) surFermeture(); };
  const echap = e => { if (e.key === 'Escape') fermer(); };
  const fond = h('div', { class: 'fond-fenetre', onmousedown: e => { if (e.target === fond) fermer(); } },
    h('div', { class: `fenetre${large ? ' large' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': titre },
      h('div', { class: 'fenetre-titre' }, h('h2', {}, titre), h('button', { class: 'bouton-icone', title: 'Fermer', onclick: fermer }, '✕')),
      h('div', { class: 'fenetre-corps' }, contenu)));
  zone.append(fond);
  document.addEventListener('keydown', echap);
  const champ = fond.querySelector('input, select, button.principal');
  if (champ) champ.focus();
  return fermer;
}

export function confirmer(titre, message, libelleOk = 'Confirmer', danger = false) {
  return new Promise(resolve => {
    let reponse = false;
    const fermer = ouvrirFenetre(titre, [
      h('p', {}, message),
      h('div', { class: 'actions' },
        h('button', { class: 'bouton', onclick: () => fermer() }, 'Annuler'),
        h('button', { class: `bouton ${danger ? 'danger' : 'principal'}`, onclick: () => { reponse = true; fermer(); } }, libelleOk)),
    ], { surFermeture: () => resolve(reponse) });
  });
}

export const clochettes = n => (n == null ? '—' : `${Number(n).toLocaleString('fr-FR')} clochettes`);

// Comme el.append(...), mais ignore null / undefined / false (au lieu d'écrire « null »).
export function ajouterA(el, ...enfants) {
  ajouter(el, enfants);
  return el;
}
