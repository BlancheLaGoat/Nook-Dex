// Vue « Ville parfaite et arrosoir en or » (Wild World).
// La carte de la ville (16 acres) est enregistrée dans le profil (profil.ville). Les calculs sont dans lib/ville.js,
// les modèles d'acres dans data/arrosoir/modeles.json, les règles dans data/arrosoir/regles.json.
import { h, vider, notifier, ouvrirFenetre, confirmer, ajouterA } from '../lib/dom.js';
import { etat, planifierSauvegarde, maintenant } from '../lib/etat.js';
import { bilanVille, normaliserVille, villeVide, objetsAcre, joursDAffilee, NB_ACRES } from '../lib/ville.js';

let donnees = null; // { modeles, regles, parCle: Map }
const CASE = 12;    // taille d'une case en pixels sur la carte
const COULEURS_FLEURS = { rouge: '#e53935', jaune: '#fdd835', blanc: '#ffffff' };
const LETTRES_FLEURS = { rose: 'R', cosmos: 'C', pensee: 'P', tulipe: 'T' };
const COULEURS_RANGS = ['#d32f2f', '#f57c00', '#fbc02d', '#7cb342', '#2e7d32'];
const NOMS_LIGNES = ['A', 'B', 'C', 'D'];
const nomAcre = i => `${NOMS_LIGNES[Math.floor(i / 4)]}${(i % 4) + 1}`;
const dateLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function charger() {
  if (donnees) return donnees;
  const d = await window.nook.arrosoir();
  if (!d || !d.modeles || !d.regles) return null;
  donnees = { modeles: d.modeles, regles: d.regles, parCle: new Map(d.modeles.modeles.map(m => [m.cle, m])) };
  return donnees;
}

// Dessine une acre (terrain + objets) dans un canvas.
function dessinerAcre(canvas, modele, acre, taille) {
  const ctx = canvas.getContext('2d');
  const legende = donnees.modeles.legende;
  canvas.width = canvas.height = 16 * taille;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const t = modele ? modele.terrain[y][x] : '.';
      ctx.fillStyle = (legende[t] || legende['.']).couleur;
      ctx.fillRect(x * taille, y * taille, taille, taille);
    }
  }
  if (taille >= 8) {
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    for (let i = 1; i < 16; i++) {
      ctx.beginPath(); ctx.moveTo(i * taille, 0); ctx.lineTo(i * taille, 16 * taille); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * taille); ctx.lineTo(16 * taille, i * taille); ctx.stroke();
    }
  }
  const objets = acre ? objetsAcre(modele, acre) : new Map((modele ? modele.objets : []).map(o => [`${o.x},${o.y}`, o]));
  for (const o of objets.values()) dessinerObjet(ctx, o, taille);
}

function dessinerObjet(ctx, o, t) {
  const cx = o.x * t + t / 2, cy = o.y * t + t / 2, r = t * 0.42;
  ctx.save();
  if (o.o.endsWith('conditionnel')) { ctx.fillStyle = '#ffff00'; ctx.fillRect(o.x * t, o.y * t, t, t); }
  if (o.o.startsWith('arbre') || o.o.startsWith('fruitier')) {
    ctx.fillStyle = o.o.startsWith('fruitier') ? '#2e7d32' : '#388e3c';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    if (o.o.startsWith('fruitier')) { ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(cx + r * 0.35, cy + r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill(); }
  } else if (o.o === 'fleur') {
    ctx.fillStyle = COULEURS_FLEURS[o.couleur] || '#ff99ff';
    ctx.strokeStyle = '#ad1457';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (t >= 10) {
      ctx.fillStyle = o.couleur === 'jaune' || o.couleur === 'blanc' ? '#6d4c41' : '#ffffff';
      ctx.font = `bold ${Math.round(t * 0.6)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(LETTRES_FLEURS[o.type] || '?', cx, cy + 0.5);
    }
  } else if (o.o === 'panneau') {
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(cx - r, cy - r * 0.6, r * 2, r * 1.1); ctx.fillRect(cx - 1, cy, 2, r);
  }
  ctx.restore();
}

export async function afficherVille(conteneur) {
  vider(conteneur);
  const d = await charger();
  if (!d) { conteneur.append(h('p', { class: 'note' }, 'Données de la ville parfaite introuvables : lance « npm run donnees:arrosoir ».')); return () => {}; }
  const { regles } = d;
  const profil = etat.profil;
  profil.ville = normaliserVille(profil.ville);
  const ville = profil.ville;
  let selection = 0;
  let outil = 'choisir'; // choisir | arbre | fruitier | fleur | gomme
  const fleur = { couleur: 'rouge', type: 'tulipe' };

  const enregistrer = () => { planifierSauvegarde(); };
  const entete = h('div', { class: 'titre-page' });
  const barre = h('div', { class: 'filtres ville-outils' });
  const carte = h('div', { class: 'ville-carte' });
  const panneau = h('div', { class: 'ville-panneau' });
  const bas = h('div', { class: 'ville-bas' });
  conteneur.append(entete, barre, h('div', { class: 'ville-zone' }, carte, panneau), bas);

  const canvases = [];
  for (let i = 0; i < NB_ACRES; i++) {
    const c = h('canvas', { class: 'ville-acre', title: `Acre ${nomAcre(i)}` });
    c.addEventListener('click', ev => cliquerAcre(i, ev, c));
    const cadre = h('div', { class: 'ville-cadre' }, h('div', { class: 'ville-etiquette' }), c);
    canvases.push({ c, cadre });
    carte.append(cadre);
  }

  function cliquerAcre(i, ev, c) {
    const r = c.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - r.left) / r.width) * 16);
    const y = Math.floor(((ev.clientY - r.top) / r.height) * 16);
    selection = i;
    if (outil !== 'choisir' && x >= 0 && x < 16 && y >= 0 && y < 16) {
      const acre = ville.acres[i];
      const modele = acre.modele ? d.parCle.get(acre.modele) : null;
      const k = `${x},${y}`;
      const duModele = !!modele && modele.objets.some(o => `${o.x},${o.y}` === k);
      const enlever = () => { if (duModele) acre.changements[k] = null; else delete acre.changements[k]; };
      if (outil === 'gomme') enlever();
      else {
        const objet = outil === 'fleur' ? { o: 'fleur', couleur: fleur.couleur, type: fleur.type } : { o: outil };
        const actuel = objetsAcre(modele, acre).get(k);
        // Cliquer sur le même objet l'enlève (pour corriger vite une erreur).
        if (actuel && actuel.o === objet.o && actuel.couleur === objet.couleur && actuel.type === objet.type) enlever();
        else acre.changements[k] = objet;
      }
      enregistrer();
    }
    toutDessiner();
  }

  // ---------- Barre d'outils ----------
  function dessinerBarre() {
    const bouton = (id, texte, titre) => h('button', { class: `bouton petit${outil === id ? ' principal' : ''}`, title: titre, onclick: () => { outil = id; dessinerBarre(); } }, texte);
    const choix = (valeur, options, surChoix) => h('select', { onchange: e => { surChoix(e.target.value); } },
      Object.entries(options).map(([v, t]) => h('option', { value: v, selected: v === valeur }, t)));
    ajouterA(vider(barre), 
      bouton('choisir', '👆 Choisir une acre', 'Clique une acre pour voir son détail à droite'),
      bouton('arbre', '🌳 Arbre', 'Clique une case pour planter (ou enlever) un arbre'),
      bouton('fruitier', '🍎 Arbre fruitier', 'Clique une case pour planter (ou enlever) un arbre fruitier'),
      bouton('fleur', '🌷 Fleur', 'Clique une case pour planter (ou enlever) une fleur'),
      choix(fleur.couleur, d.modeles.fleurs.couleurs, v => { fleur.couleur = v; outil = 'fleur'; dessinerBarre(); }),
      choix(fleur.type, d.modeles.fleurs.types, v => { fleur.type = v; outil = 'fleur'; dessinerBarre(); }),
      bouton('gomme', '🧽 Gomme', 'Clique une case pour enlever ce qui y est'),
      h('span', { class: 'separateur' }),
      h('button', { class: 'bouton petit', onclick: exporter }, '⬇️ Exporter la carte'),
      h('button', { class: 'bouton petit', onclick: importer }, '⬆️ Importer'),
      h('button', { class: 'bouton petit', onclick: reinitialiser }, 'Tout effacer'),
    );
  }

  async function exporter() {
    try {
      const f = await window.nook.exporterJson('Exporter la carte de la ville', `ville-${profil.nom}.json`, { nook_dex: 'ville-ww', ...ville });
      if (f) notifier(`Carte exportée${typeof f === 'string' ? ` : ${f}` : ''}.`);
    } catch (e) { notifier(`Export impossible : ${e.message}`, 'erreur'); }
  }
  async function importer() {
    try {
      const v = await window.nook.importerJson('Importer une carte de ville');
      if (!v) return;
      if (v.nook_dex !== 'ville-ww') throw new Error("ce fichier n'est pas une carte de ville Nook Dex");
      if (!(await confirmer('Importer la carte', 'La carte actuelle de ce profil sera remplacée.', 'Importer'))) return;
      profil.ville = normaliserVille(v);
      enregistrer();
      afficherVille(conteneur);
      notifier('Carte importée.');
    } catch (e) { notifier(`Import impossible : ${e.message}`, 'erreur'); }
  }
  async function reinitialiser() {
    if (!(await confirmer('Tout effacer', 'Effacer la carte et le compteur de jours de ce profil ?', 'Effacer', true))) return;
    profil.ville = villeVide();
    enregistrer();
    afficherVille(conteneur);
  }

  // ---------- Choix du modèle d'une acre ----------
  function choisirModele(i) {
    const groupes = new Map();
    for (const m of d.modeles.modeles) {
      if (!groupes.has(m.onglet_fr)) groupes.set(m.onglet_fr, []);
      groupes.get(m.onglet_fr).push(m);
    }
    let fermer;
    const liste = h('div', { class: 'ville-bibliotheque' });
    for (const [g, ms] of groupes) {
      liste.append(h('h3', {}, g), h('div', { class: 'ville-modeles' }, ms.map(m => {
        const c = h('canvas', { class: 'ville-apercu' });
        dessinerAcre(c, m, null, 5);
        const nbArbres = m.objets.filter(o => /arbre|fruitier/.test(o.o)).length;
        return h('button', {
          class: `ville-modele${ville.acres[i].modele === m.cle ? ' choisi' : ''}`,
          title: `${m.onglet_fr} — ${m.id}${m.etiquette_fr ? ` (${m.etiquette_fr})` : ''} : ${nbArbres} arbres`,
          onclick: () => {
            const a = ville.acres[i];
            if (a.modele !== m.cle) Object.assign(a, { modele: m.cle, changements: {} });
            enregistrer(); fermer(); toutDessiner();
          },
        }, c, h('span', {}, m.id), m.etiquette_fr ? h('small', {}, m.etiquette_fr) : null);
      })));
    }
    fermer = ouvrirFenetre(`Modèle de l'acre ${nomAcre(i)}`, [
      h('p', { class: 'aide' }, 'Choisis le modèle qui ressemble à ton acre dans le jeu. Changer de modèle efface les arbres et fleurs que tu as modifiés sur cette acre.'),
      liste,
      h('div', { class: 'actions' },
        h('button', { class: 'bouton', onclick: () => { Object.assign(ville.acres[i], { modele: null, changements: {} }); enregistrer(); fermer(); toutDessiner(); } }, 'Acre vide'),
        h('button', { class: 'bouton', onclick: () => fermer() }, 'Fermer')),
    ], { large: true });
  }

  // ---------- Panneau de l'acre choisie ----------
  function champNombre(valeur, surChoix, { max = 99, vide = false, placeholder = '' } = {}) {
    return h('input', {
      type: 'number', min: '0', max: String(max), value: valeur == null ? '' : String(valeur), placeholder, class: 'champ-nombre',
      onchange: e => {
        const v = e.target.value === '' ? null : Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0)));
        surChoix(vide ? v : (v || 0));
        enregistrer(); toutDessiner();
      },
    });
  }

  const NOMS_PARTS = { arbres: 'arbres', mauvaises_herbes: 'mauvaises herbes', objets_au_sol: 'objets au sol', dechets: 'déchets', rafflesia: 'rafflésia', fleurs: 'fleurs' };
  function dessinerPanneau(bilan) {
    const i = selection;
    const a = ville.acres[i];
    const b = bilan.acres[i];
    const modele = a.modele ? d.parCle.get(a.modele) : null;
    // « Rose blanche », « Cosmos blanc » : la couleur s'accorde avec le nom de la fleur.
    const FEMININ = { rose: true, tulipe: true, pensee: true };
    const ACCORD = { blanc: 'blanche' };
    const nomFleur = k => { const [type, couleur] = k.split('|'); const c = (d.modeles.fleurs.couleurs[couleur] || couleur).toLowerCase(); return `${d.modeles.fleurs.types[type] || type} ${FEMININ[type] && ACCORD[c] ? ACCORD[c] : c}`; };
    const ligne = (t, v) => h('tr', {}, h('td', {}, t), h('td', {}, v));
    const detailScore = Object.entries(b.score.parts).filter(([, v]) => v).map(([k, v]) => `${NOMS_PARTS[k]} ${v > 0 ? '+' : ''}${v}`);
    const auRang4 = b.rang >= regles.ville_parfaite.rang;
    ajouterA(vider(panneau), 
      h('h2', {}, `Acre ${nomAcre(i)} `, h('span', { class: 'badge-rang', style: { background: COULEURS_RANGS[b.rang] } }, `rang ${b.rang}`)),
      h('p', { class: 'aide' }, modele ? `${modele.onglet_fr} — modèle ${modele.id}${modele.etiquette_fr ? ` (${modele.etiquette_fr})` : ''}` : 'Pas encore de modèle.'),
      h('button', { class: 'bouton petit', onclick: () => choisirModele(i) }, '🗺️ Choisir le modèle…'),
      h('table', { class: 'tableau-infos' },
        ligne('Arbres', `${b.compte.arbres} (cible ${b.cibles.arbres}${b.cibles.arbres_force ? ', forcée' : `, entre ${b.cibles.arbres_plage[0]} et ${b.cibles.arbres_plage[1]}`})`),
        ligne('Fleurs', `${b.compte.fleurs} (cible ${b.cibles.fleurs}${b.cibles.fleurs_force ? ', forcée' : ''})`),
        Object.keys(b.compte.detailFleurs).length ? ligne('Détail des fleurs', Object.entries(b.compte.detailFleurs).map(([k, n]) => `${n} ${nomFleur(k)}`).join(', ')) : null,
        ligne('Score', `${b.score.total}${detailScore.length ? ` (départ ${regles.score.depart} ; ${detailScore.join(', ')})` : ''}`),
        ligne('Rang', `${b.rang} / ${regles.ville_parfaite.rang}`)),
      h('div', { class: `note${auRang4 ? '' : ' verifier'}` },
        b.actions.length ? `Il manque : ${b.actions.join(', ')}.` : (auRang4 ? '✅ Au rang 4.' : 'Rien à ajouter.'),
        b.enlever.length ? h('div', { class: 'aide' }, `Ou bien enlève : ${b.enlever.join(', ')}${b.fleursSiOnEnleve ? ` (puis +${b.fleursSiOnEnleve} fleur${b.fleursSiOnEnleve > 1 ? 's' : ''})` : ''}.`) : null),
      h('h3', {}, 'À saisir (le tableur ne les a pas)'),
      h('div', { class: 'ville-saisies' },
        h('label', {}, 'Mauvaises herbes', champNombre(a.mauvaises_herbes, v => { a.mauvaises_herbes = v; })),
        h('label', {}, 'Objets au sol', champNombre(a.objets_au_sol, v => { a.objets_au_sol = v; })),
        h('label', {}, 'Déchets', champNombre(a.dechets, v => { a.dechets = v; })),
        h('label', { class: 'ligne' }, h('input', { type: 'checkbox', checked: a.rafflesia > 0, onchange: e => { a.rafflesia = e.target.checked ? 1 : 0; enregistrer(); toutDessiner(); } }), ' Rafflésia')),
      modele && modele.objets.some(o => o.o.endsWith('conditionnel')) ? h('label', { class: 'ligne', title: d.modeles.objets['arbre-conditionnel'] },
        h('input', { type: 'checkbox', checked: a.maisons_sur_panneaux, onchange: e => { a.maisons_sur_panneaux = e.target.checked; enregistrer(); toutDessiner(); } }),
        " Une maison s'est construite sur l'emplacement de panneau (les arbres sur fond jaune ne poussent pas)") : null,
      h('h3', {}, 'Forcer les cibles (vide = calcul automatique)'),
      h('div', { class: 'ville-saisies' },
        h('label', {}, 'Arbres idéaux', champNombre(a.cible_arbres, v => { a.cible_arbres = v; }, { vide: true, placeholder: String(b.cibles.arbres_force ? '' : b.cibles.arbres) })),
        h('label', {}, 'Fleurs', champNombre(a.cible_fleurs, v => { a.cible_fleurs = v; }, { vide: true, placeholder: String(b.cibles.fleurs_force ? '' : b.cibles.fleurs) }))),
      b.tableur ? h('p', { class: 'aide' }, `Calcul du tableur : idéal ${b.tableur.ideal} − actuel ${b.tableur.actuel} = ${b.tableur.a_planter} à planter.`) : null,
    );
  }

  // ---------- En-tête, récapitulatif, compteur ----------
  function dessinerEntete(bilan) {
    const parfait = bilan.rang >= bilan.objectif.rang;
    ajouterA(vider(entete), 
      h('h1', {}, '🌳 Ville parfaite et arrosoir en or'),
      h('span', { class: 'sous-titre' },
        h('span', { class: 'badge-rang', style: { background: COULEURS_RANGS[bilan.rang] } }, `Ville au rang ${bilan.rang}`), ' ',
        `${bilan.auRang4} / ${bilan.objectif.acres_rang_4} acres au rang 4`, ' · ', bilan.raison, parfait ? ' 🎉' : ''),
    );
  }

  function dessinerBas(bilan) {
    const jours = joursDAffilee(ville.jours);
    const auj = dateLocale(maintenant());
    const objectif = regles.arrosoir_or.jours;
    const derniers = Array.from({ length: objectif }, (_, k) => { const x = maintenant(); x.setDate(x.getDate() - (objectif - 1 - k)); return dateLocale(x); });
    const basculerJour = j => {
      ville.jours = ville.jours.includes(j) ? ville.jours.filter(x => x !== j) : [...ville.jours, j].sort();
      enregistrer(); toutDessiner();
    };
    const tableau = h('table', { class: 'ville-recap' },
      h('thead', {}, h('tr', {}, ['Acre', 'Modèle', 'Arbres', 'Fleurs', 'Score', 'Rang', 'Ce qui manque', 'Tableur : idéal − actuel = à planter'].map(t => h('th', {}, t)))),
      h('tbody', {}, bilan.acres.map((b, i) => {
        const a = ville.acres[i];
        const m = a.modele ? d.parCle.get(a.modele) : null;
        return h('tr', { class: i === selection ? 'courant' : '', onclick: () => { selection = i; toutDessiner(); } },
          h('td', {}, nomAcre(i), bilan.suggestion.includes(i) && b.rang < regles.ville_parfaite.rang ? ' ★' : ''),
          h('td', {}, m ? m.id : '—'),
          h('td', {}, String(b.compte.arbres)), h('td', {}, String(b.compte.fleurs)),
          h('td', {}, String(b.score.total)),
          h('td', {}, h('span', { class: 'badge-rang', style: { background: COULEURS_RANGS[b.rang] } }, String(b.rang))),
          h('td', {}, b.actions.join(', ') || (b.rang >= regles.ville_parfaite.rang ? '✅' : '')),
          h('td', {}, b.tableur ? `${b.tableur.ideal} − ${b.tableur.actuel} = ${b.tableur.a_planter}` : '—'));
      })),
      bilan.totalTableur != null ? h('tfoot', {}, h('tr', {}, h('td', { colspan: '7' }, 'Total à planter (calcul du tableur)'), h('td', {}, String(bilan.totalTableur)))) : null);

    const legende = h('div', { class: 'ville-legende' },
      Object.values(d.modeles.legende).map(l => h('span', {}, h('i', { style: { background: l.couleur } }), l.fr)),
      h('span', {}, h('i', { class: 'rond', style: { background: '#388e3c' } }), 'Arbre'),
      h('span', {}, h('i', { class: 'rond', style: { background: '#2e7d32', boxShadow: 'inset -3px -3px 0 #e53935' } }), 'Arbre fruitier'),
      h('span', {}, h('i', { style: { background: '#ffff00' } }), 'Arbre qui ne pousse pas si une maison se construit sur le panneau'),
      h('span', {}, h('i', { style: { background: '#8d6e63' } }), 'Emplacement de panneau'),
      h('span', {}, h('i', { class: 'rond', style: { background: '#e53935' } }), 'Fleur (R rose, C cosmos, P pensée, T tulipe ; la couleur est celle de la fleur)'),
      h('span', {}, '★ = parmi les 8 acres les plus faciles à passer au rang 4'));

    ajouterA(vider(bas), 
      legende,
      h('h2', {}, 'Récapitulatif des 16 acres'),
      tableau,
      h('h2', {}, `🚿 Arrosoir en or : ${Math.min(jours.serie, objectif)} / ${objectif} jours d'affilée`),
      h('p', { class: 'aide' }, regles.arrosoir_or.texte, ' Coche chaque jour où ta ville est parfaite.'),
      h('div', { class: 'ville-jours' }, derniers.map(j => h('button', {
        class: `ville-jour${ville.jours.includes(j) ? ' oui' : ''}${j === auj ? ' courant' : ''}`,
        title: new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        onclick: () => basculerJour(j),
      }, new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })))),
      jours.serie >= objectif
        ? h('p', { class: 'note' }, `🎉 ${jours.serie} jours d'affilée : va parler de l'environnement à ${regles.arrosoir_or.parler_a.join(' ou ')} !`)
        : (jours.serie && jours.fin !== auj ? h('p', { class: 'aide' }, `Série en cours : du ${new Date(`${jours.debut}T12:00:00`).toLocaleDateString('fr-FR')} au ${new Date(`${jours.fin}T12:00:00`).toLocaleDateString('fr-FR')}. Pense à cocher aujourd'hui.`) : null),
    );
  }

  function toutDessiner() {
    const bilan = bilanVille(d.parCle, ville, regles);
    canvases.forEach(({ c, cadre }, i) => {
      const a = ville.acres[i];
      dessinerAcre(c, a.modele ? d.parCle.get(a.modele) : null, a, CASE);
      const b = bilan.acres[i];
      cadre.style.borderColor = COULEURS_RANGS[b.rang];
      cadre.classList.toggle('choisi', i === selection);
      cadre.querySelector('.ville-etiquette').textContent = `${nomAcre(i)} · ${b.score.total} · rang ${b.rang}${bilan.suggestion.includes(i) && b.rang < regles.ville_parfaite.rang ? ' ★' : ''}`;
    });
    dessinerEntete(bilan);
    dessinerPanneau(bilan);
    dessinerBas(bilan);
  }

  dessinerBarre();
  toutDessiner();
  return () => {};
}
