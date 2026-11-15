// Magasin de Nook (Wild World) : le stock de chaque jour et la prochaine date de vente de chaque objet.
// Le calcul est dans lib/nook-ww.js ; la ville (octets de rareté, niveau du magasin) et les réglages retrouvés par
// calibration sont lus dans la sauvegarde et gardés dans le profil (profil.nookWW).
import { h, vider, ajouterA, image, notifier } from '../lib/dom.js';
import { etat, donneesCategorie, planifierSauvegarde, maintenant, etatDe } from '../lib/etat.js';
import { stockPossible, prochainesVentes, calibrer } from '../lib/nook-ww.js';
import { nookWW } from '../lib/sauvegarde-ww.js';

const NIVEAUX = ['Nook Bazar', 'Nook Super', 'Nook Hyper', 'Nook Méga'];
// Objets hors catalogue : leur nom.
const NOMS = {
  0x1369: 'Pelle', 0x1378: 'Arrosoir', 0x1376: 'Filet', 0x1374: 'Canne à pêche', 0x156c: 'Minuteur', 0x136b: 'Hache', 0x137a: 'Lance-pierre',
  0x14fe: 'Sac de tulipes rouges', 0x14ff: 'Sac de tulipes blanches', 0x1500: 'Sac de tulipes jaunes', 0x1504: 'Sac de pensées blanches',
  0x1505: 'Sac de pensées jaunes', 0x1506: 'Sac de pensées rouges', 0x150a: 'Sac de cosmos blancs', 0x150b: 'Sac de cosmos rouges',
  0x150c: 'Sac de cosmos jaunes', 0x1510: 'Sac de roses rouges', 0x1511: 'Sac de roses blanches', 0x1512: 'Sac de roses jaunes',
  0x151d: "Pousse d'arbre", 0x151e: 'Pousse de cèdre', 0x151f: 'Bouteille à la mer', 0x155e: 'Médicament', 0x1521: 'Peinture de toit',
};
const SECTIONS = [['outils', '🪓 Outils'], ['meubles', '🪑 Meubles'], ['papiers', '🧱 Papiers peints'], ['moquettes', '🟫 Moquettes'],
  ['papeterie', '✉️ Papeterie'], ['graines', '🌱 Graines'], ['pousses', '🌳 Pousses'], ['toit', '🏠 Toit'], ['bouteille', '🍾 Bouteille'], ['medicament', '💊 Médicament']];
const INCERTAIN = { canne: "la canne à pêche remplace l'un des deux premiers outils", bonus: 'sauf si Nook fait sa journée des points bonus', couleur: 'la couleur dépend de tes jours de jeu' };

// Bit du catalogue d'un code (comme scripts/sauvegarde-ww.js) ; la papeterie par sa pile.
function bitCatalogue(n) {
  if (n >= 0x3000 && n < 0x5000) return (n - 0x3000) >> 2;
  if (n >= 0x1100 && n <= 0x1143) return 0x100 * 8 + (n - 0x1100);
  if (n >= 0x1144 && n <= 0x1187) return 0x109 * 8 + (n - 0x1144);
  if (n >= 0x1000 && n <= 0x10ff) return 0x11B * 8 + ((n - 0x1000) >> 2);
  return null;
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lisible = d => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
// Le jour du magasin commence à 6 h.
function jourDuMagasin() { const m = maintenant(); const d = new Date(m.getFullYear(), m.getMonth(), m.getDate()); if (m.getHours() < 6) d.setDate(d.getDate() - 1); return d; }

const choix = { date: null, recherche: '' };

export async function afficherNook(conteneur, jeu) {
  vider(conteneur);
  const [donnees, corr, ...cats] = await Promise.all([donneesCategorie('ww', 'nook'), donneesCategorie('ww', 'sauvegarde'),
    ...['meubles', 'papiers-peints', 'sols', 'papeterie'].map(c => donneesCategorie('ww', c))]);
  const fiches = new Map(['meubles', 'papiers-peints', 'sols', 'papeterie'].map((c, i) => [c, new Map((cats[i] || []).map(f => [f.id, f]))]));
  const parBit = new Map(((corr && corr.catalogue) || []).map(x => [x.bit, x]));
  // Fiche, nom et image d'un code.
  const objet = code => {
    const lien = parBit.get(bitCatalogue(code));
    const fiche = lien && fiches.get(lien.categorie) && fiches.get(lien.categorie).get(lien.id);
    return { code, categorie: lien && lien.categorie, id: lien && lien.id, fiche, nom: fiche ? fiche.nom.fr : NOMS[code] || `Objet 0x${code.toString(16)}` };
  };
  const obtenu = o => !!(o.categorie && etatDe(o.categorie, o.id).obtenu);

  conteneur.append(h('div', { class: 'titre-page' }, h('h1', {}, '🏪 Magasin de Nook'), h('span', { class: 'sous-titre' }, 'Le stock de chaque jour, calculé comme le jeu')));
  if (!donnees || !donnees.meubles) { conteneur.append(h('p', { class: 'note' }, 'Données du magasin introuvables (data/ww/nook.json).')); return () => {}; }

  const profil = etat.profil;
  const corps = h('div', {});
  conteneur.append(corps);

  async function lireSauvegarde() {
    let fichier, n;
    try {
      fichier = await window.nook.lireSauvegarde('Ouvrir ma sauvegarde Wild World (.sav ou .dsv)', 'ww');
      if (!fichier) return;
      n = nookWW(fichier.octets);
    } catch (e) { notifier(`Lecture impossible : ${e.message}`, 'erreur'); return; }
    const date = new Date(n.date.annee, n.date.mois - 1, n.date.jour);
    const reglages = calibrer(donnees, n, date, n.stock);
    if (!reglages.length) { notifier("Le stock de cette sauvegarde ne correspond à aucun calcul : la prévision n'est pas possible pour cette ville.", 'erreur'); return; }
    // Une nouvelle lecture d'un autre jour resserre les réglages gardés (s'il s'agit de la même ville).
    const ancien = profil.nookWW;
    const memeVille = ancien && ancien.ordres.join() === n.ordres.join() && ancien.niveau === n.niveau;
    const garde = memeVille ? reglages.filter(r => ancien.reglages.some(a => a.dixieme === r.dixieme && a.extras === r.extras)) : reglages;
    profil.nookWW = { ordres: n.ordres, niveau: n.niveau, reglages: garde.length ? garde : reglages, date: iso(date) };
    planifierSauvegarde();
    notifier(`Stock du ${date.toLocaleDateString('fr-FR')} retrouvé à l'identique : prévisions prêtes.`);
    dessiner();
  }

  function dessiner() {
    vider(corps);
    const v = profil.nookWW;
    if (!v) {
      ajouterA(corps,
        h('p', {}, "Chaque matin, Nook tire son stock avec un hasard qui dépend de la date et de ta ville : une même date donne toujours les mêmes objets. Nook Dex refait ce calcul pour te dire ce qu'il vendra chaque jour."),
        h('p', { class: 'aide' }, "Pour connaître ta ville, Nook Dex lit ta sauvegarde (.sav ou .dsv) et vérifie qu'il retrouve exactement le stock qu'elle contient. Ta sauvegarde n'est jamais modifiée."),
        h('button', { class: 'bouton principal', onclick: lireSauvegarde }, '📥 Lire ma sauvegarde…'));
      return;
    }
    const reglages = v.reglages;
    const date = choix.date || jourDuMagasin();
    choix.date = date;
    const decaler = n => { choix.date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n); dessiner(); };
    const st = stockPossible(donnees, v, date, reglages);

    ajouterA(corps, h('div', { class: 'carte navets-saisie' },
      h('div', { class: 'navets-ligne' },
        h('button', { class: 'bouton petit', onclick: () => decaler(-1) }, '◀'),
        h('input', { type: 'date', value: iso(date), onchange: e => { const [a, m, j] = e.target.value.split('-').map(Number); if (a) { choix.date = new Date(a, m - 1, j); dessiner(); } } }),
        h('button', { class: 'bouton petit', onclick: () => decaler(1) }, '▶'),
        h('button', { class: 'bouton petit', onclick: () => { choix.date = null; dessiner(); } }, "Aujourd'hui"),
        h('span', { class: 'aide', style: { marginLeft: 'auto' } }, `${NIVEAUX[v.niveau]} · sauvegarde du ${v.date.split('-').reverse().join('/')}`),
        h('button', { class: 'bouton petit', onclick: lireSauvegarde }, '📥 Relire ma sauvegarde…'))));

    // ---- le stock du jour ----
    const section = h('div', { class: 'section' }, h('h2', {}, `Le stock du ${lisible(date)}`));
    if (st.soldes) section.append(h('p', { class: 'note' }, `⏰ Soldes ce jour-là à partir de ${st.soldes} h.`));
    for (const [id, titre] of SECTIONS) {
      const l = st.objets.filter(x => x.section === id);
      if (!l.length) continue;
      section.append(h('h3', {}, titre), h('div', { class: 'liste-mini' }, l.map(x => {
        const o = objet(x.code);
        return h('span', { class: `puce-element${x.sur ? '' : ' possible'}`, title: [o.nom, x.sur ? '' : `possible${x.incertain ? ` : ${INCERTAIN[x.incertain] || ''}` : ' (selon le feng shui de ta maison)'}`, obtenu(o) ? 'déjà dans ton catalogue' : ''].filter(Boolean).join(' — ') },
          o.fiche && o.fiche.image ? image(o.fiche.image, '', 'vignette petite') : null, o.nom, x.sur ? null : h('span', { class: 'aide' }, ' ?'), obtenu(o) ? h('span', { class: 'aide' }, ' ✓') : null);
      })));
    }
    section.append(h('p', { class: 'aide' }, "« ? » : possible seulement (selon le feng shui de ta maison, que Nook Dex n'a pas pu fixer exactement, ou une règle du jeu). ✓ : déjà dans ton catalogue. Le jour du magasin commence à 6 h."));
    corps.append(section);

    // ---- quand Nook vendra-t-il… ----
    const depuis = jourDuMagasin();
    const ventes = prochainesVentes(donnees, v, depuis, 365, reglages);
    const prochaine = code => { const l = ventes.get(code) || []; return l.find(x => x.sur) || l[0] || null; };
    const manquants = [...ventes.keys()].map(objet).filter(o => o.categorie && !obtenu(o)).map(o => ({ o, p: prochaine(o.code) }))
      .filter(x => x.p).sort((a, b) => a.p.date - b.p.date);
    const ligne = ({ o, p }) => h('li', {}, o.fiche && o.fiche.image ? image(o.fiche.image, '', 'vignette petite') : null, h('strong', {}, o.nom), ' — ',
      h('a', { href: '#', onclick: e => { e.preventDefault(); choix.date = p.date; dessiner(); } }, p.date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })),
      p.sur ? null : h('span', { class: 'aide' }, ' (possible)'));
    const zoneRecherche = h('div', {});
    const chercher = () => {
      vider(zoneRecherche);
      const q = choix.recherche.trim().toLowerCase();
      if (q.length < 2) return;
      const trouves = [];
      for (const [cat, m] of fiches) for (const f of m.values()) if (f.nom.fr.toLowerCase().includes(q)) trouves.push({ cat, f });
      const l = trouves.slice(0, 20).map(({ cat, f }) => {
        const code = [...ventes.keys()].find(c => { const o = objet(c); return o.categorie === cat && o.id === f.id; });
        const dates = code ? ventes.get(code) : [];
        return h('li', {}, h('strong', {}, f.nom.fr), ' — ', dates.length
          ? dates.slice(0, 4).map((x, i) => [i ? ', ' : '', h('a', { href: '#', onclick: e => { e.preventDefault(); choix.date = x.date; dessiner(); } }, x.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })), x.sur ? '' : ' ?'])
          : h('span', { class: 'aide' }, "pas chez Nook dans l'année qui vient"));
      });
      zoneRecherche.append(l.length ? h('ul', { class: 'liste-conditions' }, l) : h('p', { class: 'aide' }, 'Aucun objet de ce nom.'));
    };
    ajouterA(corps, h('div', { class: 'section' },
      h('h2', {}, '🔎 Quand Nook vendra…'),
      h('input', { type: 'search', placeholder: 'Nom d’un meuble, papier peint, moquette ou papeterie…', value: choix.recherche, oninput: e => { choix.recherche = e.target.value; chercher(); } }),
      zoneRecherche,
      h('h3', {}, `Ce qui te manque, dans l'ordre où Nook le vendra (${manquants.length} sur l'année)`),
      manquants.length ? h('ul', { class: 'liste-conditions' }, manquants.slice(0, 40).map(ligne)) : h('p', { class: 'aide' }, "Rien : tout ce que Nook vendra dans l'année est déjà dans ton catalogue."),
      h('p', { class: 'aide credits' }, `Calcul d'après le code du jeu décompilé par le projet acww-decomp (licence CC0) et les données de la ROM. Vérifié : le stock lu dans ta sauvegarde est retrouvé à l'identique. Réglages retenus : feng shui ${[...new Set(reglages.map(r => r.dixieme))].join(', ')}${reglages.some(r => r.extras) ? ' ; extras du jour possibles' : ''}. Relis ta sauvegarde un autre jour pour les affiner.`)));
    chercher();
  }
  dessiner();
  return () => {};
}
