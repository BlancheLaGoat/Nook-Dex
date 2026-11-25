// Badges de New Leaf (remis par Hélium) : données (data/nl/badges.json), lecture dans la sauvegarde et calculs.
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));

const TYPES = ['compteur', 'banque', 'navets', 'temps', 'hha', 'encyclopedie', 'catalogue'];

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------
test('badges.json : 24 badges, un par case de la sauvegarde (0 à 23)', () => {
  const d = lire('data/nl/badges.json');
  assert.ok(Array.isArray(d.sources) && d.sources.length >= 3, 'sources citées');
  assert.equal(d.badges.length, 24);
  assert.deepStrictEqual(d.badges.map(b => b.case), [...Array(24).keys()]);
  assert.equal(new Set(d.badges.map(b => b.id)).size, 24, 'identifiants en double');
});

test('badges.json : chaque badge a 3 paliers, des seuils croissants, une unité et sa progression', () => {
  for (const b of lire('data/nl/badges.json').badges) {
    assert.ok(b.groupe && typeof b.groupe === 'string', `${b.id} : groupe`);
    assert.equal(b.paliers.length, 3, `${b.id} : 3 noms de paliers`);
    assert.ok(b.paliers.every(n => typeof n === 'string' && n.length > 0), `${b.id} : noms des paliers`);
    assert.equal(b.seuils.length, 3, `${b.id} : 3 seuils`);
    assert.ok(b.seuils[0] > 0 && b.seuils[0] < b.seuils[1] && b.seuils[1] < b.seuils[2], `${b.id} : seuils croissants`);
    assert.equal(b.unite.length, 2, `${b.id} : unité au singulier et au pluriel`);
    assert.ok(TYPES.includes(b.progression.type), `${b.id} : type ${b.progression.type}`);
    if (b.progression.type === 'compteur') assert.equal(b.progression.case, b.case, `${b.id} : compteur dans sa propre case`);
    assert.equal(typeof b.verifie, 'boolean', `${b.id} : verifie`);
  }
});

test('badges.json : seuils de Nookipedia confirmés par les vraies sauvegardes', () => {
  const parId = Object.fromEntries(lire('data/nl/badges.json').badges.map(b => [b.id, b]));
  assert.deepStrictEqual(parId.peche.seuils, [500, 2000, 5000]);
  assert.deepStrictEqual(parId.insectes.seuils, [500, 2000, 5000]);
  assert.deepStrictEqual(parId.plongee.seuils, [100, 200, 1000]);
  assert.deepStrictEqual(parId.epargne.seuils, [1000000, 10000000, 100000000]);
  assert.deepStrictEqual(parId.navets.seuils, [500000, 3000000, 10000000]);
  assert.deepStrictEqual(parId.medailles.seuils, [300, 1500, 5000]);
  assert.deepStrictEqual(parId['mauvaises-herbes'].seuils, [500, 2000, 5000]);
  assert.deepStrictEqual(parId.achats.seuils, [500000, 2000000, 5000000]);
  assert.deepStrictEqual(parId.services.seuils, [50, 100, 300]);
  assert.deepStrictEqual(parId['encyclopedie-mer'].seuils, [15, 24, 30]);
});

test('badges.json : seules les progressions confirmées sur de vraies sauvegardes sont « vérifiées »', () => {
  const verifies = lire('data/nl/badges.json').badges.filter(b => b.verifie).map(b => b.id).sort();
  assert.deepStrictEqual(verifies, ['achats', 'epargne', 'insectes', 'mauvaises-herbes', 'medailles', 'navets', 'peche', 'plongee', 'services'].sort());
});

// ---------------------------------------------------------------------------
// Lecture dans la sauvegarde (src/renderer/lib/sauvegarde-nl.js : badgesNL)
// La sauvegarde est fabriquée ici octet par octet (aucun fichier du jeu dans le dépôt).
// ---------------------------------------------------------------------------
const { pathToFileURL } = require('url');
const lib = f => import(pathToFileURL(path.join(RACINE, 'src', 'renderer', 'lib', f)).href);
const DEFS = lire('data/nl/badges.json').badges;
const CORR = lire('data/nl/sauvegarde.json');

const P1 = 0xA0, P2 = 0xA0 + 0xA480;
const BADGES = 0x55DC, NIVEAUX = 0x569C;
// Valeur chiffrée comme le jeu (même encodeur que tests/sauvegarde-nl.test.js).
function chiffrer(v, ajust = 0x1234, rot = 7) {
  let enc = (v + ajust + 0x8F187432) >>> 0;
  enc = ((enc >>> (0x1C - rot)) + (enc << (rot + 4))) >>> 0;
  const somme = ((enc & 0xFF) + ((enc >>> 8) & 0xFF) + ((enc >>> 16) & 0xFF) + (enc >>> 24) + 0xBA) & 0xFF;
  return [enc & 0xFF, (enc >>> 8) & 0xFF, (enc >>> 16) & 0xFF, enc >>> 24, ajust & 0xFF, ajust >> 8, rot, somme];
}
const utf16 = (o, i, t) => { for (let k = 0; k < t.length; k++) { o[i + k * 2] = t.charCodeAt(k) & 0xFF; o[i + k * 2 + 1] = t.charCodeAt(k) >> 8; } };
const debloquer = (o, p, bit) => { o[p + 0x6C20 + (bit >> 3)] |= 1 << (bit & 7); };

function ville() {
  const o = new Uint8Array(0x89B00);
  o[P1 + 0x55A6] = 0x34; o[P1 + 0x55A7] = 0x12; utf16(o, P1 + 0x55A8, 'Blanche');
  o[P2 + 0x55A6] = 0x01; utf16(o, P2 + 0x55A8, 'Lou');
  for (let i = 0; i < 24; i++) o.set(chiffrer(0, 0x100 + i, i % 20), P1 + BADGES + i * 8);
  o.set(chiffrer(896), P1 + BADGES + 0 * 8);          // poissons pêchés : bronze atteint
  o.set(chiffrer(1232, 0x55, 3), P1 + BADGES + 1 * 8); // insectes
  o.set(chiffrer(599), P1 + BADGES + 14 * 8);          // mauvaises herbes : bronze atteint, pas encore remis
  o.set(chiffrer(14271600), P1 + BADGES + 0xE0);       // bénéfice des navets
  o.set(chiffrer(1413198), P1 + 0x6B8C);               // banque
  o.set([0x00, 0x8C, 0x01, 0, 0, 0, 0, 0], P1 + 0x6BB0); // temps de jeu : 101 376 s
  o.set([0x2E, 0x01, 0, 0], P1 + 0x56C4);              // points HHA : 302
  o[P1 + NIVEAUX + 0] = 1; o[P1 + NIVEAUX + 1] = 1; o[P1 + NIVEAUX + 10] = 1; o[P1 + NIVEAUX + 11] = 3;
  return o;
}

test('badgesNL : niveaux et compteurs de chaque joueur', async () => {
  const { badgesNL } = await lib('sauvegarde-nl.js');
  const [j1, j2, j3] = badgesNL(ville());
  assert.deepStrictEqual([j1.numero, j1.nom, j1.existe, j2.nom, j3.existe], [1, 'Blanche', true, 'Lou', false]);
  assert.strictEqual(j1.niveaux.length, 24);
  assert.deepStrictEqual([j1.niveaux[0], j1.niveaux[1], j1.niveaux[10], j1.niveaux[11], j1.niveaux[14]], [1, 1, 1, 3, 0]);
  assert.deepStrictEqual([j1.compteurs[0], j1.compteurs[1], j1.compteurs[14], j1.compteurs[2]], [896, 1232, 599, 0]);
  assert.deepStrictEqual([j1.navets, j1.banque, j1.temps, j1.hha], [14271600, 1413198, 101376, 302]);
  // Joueur 2 : rien d'écrit, les valeurs chiffrées sont illisibles (somme de contrôle fausse) → null, jamais un chiffre inventé.
  assert.strictEqual(j2.compteurs[0], null);
  assert.strictEqual(j2.banque, null);
});

test('badgesNL : une valeur abîmée ou un niveau impossible donne null', async () => {
  const { badgesNL } = await lib('sauvegarde-nl.js');
  const o = ville();
  o[P1 + BADGES + 7] ^= 0xFF;  // somme de contrôle du compteur de poissons
  o[P1 + NIVEAUX + 5] = 9;     // niveau qui n'existe pas
  const [j1] = badgesNL(o);
  assert.strictEqual(j1.compteurs[0], null);
  assert.strictEqual(j1.niveaux[5], null);
  assert.throws(() => badgesNL(new Uint8Array(1000)), /garden_plus/);
});

// ---------------------------------------------------------------------------
// Calculs (src/renderer/lib/badges.js)
// ---------------------------------------------------------------------------
const parId = id => DEFS.find(d => d.id === id);

test('lectureBadges : valeurs en unités du badge (heures, espèces, %), à partir de la sauvegarde', async () => {
  const { badgesNL, lireSauvegardeNL } = await lib('sauvegarde-nl.js');
  const { lectureBadges } = await lib('badges.js');
  const o = ville();
  const poissons = CORR.debloques.filter(d => d.categorie === 'poissons').slice(0, 40);
  for (const d of poissons) debloquer(o, P1, d.bit);
  const r = lectureBadges(DEFS, lireSauvegardeNL(o), badgesNL(o), CORR, 1, new Date(2026, 10, 25));
  assert.deepStrictEqual([r.joueur, r.nom, r.lu_le], [1, 'Blanche', '2026-11-25']);
  const v = id => r.valeurs[parId(id).case];
  assert.strictEqual(v('peche'), 896);
  assert.strictEqual(v('epargne'), 1413198);
  assert.strictEqual(v('navets'), 14271600);
  assert.strictEqual(v('temps'), 28);                    // 101 376 s = 28 h (arrondi en dessous)
  assert.strictEqual(v('hha'), 302);
  assert.strictEqual(v('encyclopedie-poissons'), 40);
  assert.strictEqual(v('encyclopedie-insectes'), 0);
  assert.strictEqual(v('catalogue'), 0);
  assert.strictEqual(r.niveaux[parId('navets').case], 3);
  assert.strictEqual(r.valeurs.length, 24);
});

test('lectureBadges : joueur choisi (2e habitant)', async () => {
  const { badgesNL, lireSauvegardeNL } = await lib('sauvegarde-nl.js');
  const { lectureBadges } = await lib('badges.js');
  const o = ville();
  const r = lectureBadges(DEFS, lireSauvegardeNL(o), badgesNL(o), CORR, 2, new Date(2026, 10, 25));
  assert.deepStrictEqual([r.joueur, r.nom], [2, 'Lou']);
  assert.strictEqual(r.valeurs[parId('peche').case], null);   // progression inconnue
  assert.strictEqual(r.valeurs[parId('encyclopedie-poissons').case], 0);
});

function record(modifs = {}) {
  const niveaux = Array(24).fill(0), valeurs = Array(24).fill(0);
  for (const [id, [n, v]] of Object.entries(modifs)) { niveaux[parId(id).case] = n; valeurs[parId(id).case] = v; }
  return { lu_le: '2026-11-25', joueur: 1, nom: 'Blanche', niveaux, valeurs };
}

test('etatBadges : palier suivant et ce qu\'il manque', async () => {
  const { etatBadges, texteProgression } = await lib('badges.js');
  const etats = etatBadges(DEFS, record({ peche: [2, 4688], insectes: [3, 6000], 'mauvaises-herbes': [0, 599], ballons: [1, null] }));
  const e = id => etats.find(x => x.def.id === id);
  assert.deepStrictEqual([e('peche').niveau, e('peche').cible, e('peche').manque, e('peche').aRecuperer], [2, 3, 312, 0]);
  assert.strictEqual(texteProgression(e('peche')), 'encore 312 poissons pour l\'or');
  assert.deepStrictEqual([e('insectes').cible, e('insectes').manque], [null, null]);
  assert.strictEqual(texteProgression(e('insectes')), 'or obtenu');
  // Seuil atteint, mais Hélium n'a pas encore remis le badge.
  assert.strictEqual(e('mauvaises-herbes').aRecuperer, 1);
  assert.strictEqual(texteProgression(e('mauvaises-herbes')), 'bronze à récupérer auprès d\'Hélium');
  // Compteur illisible : le niveau reste connu, la progression non.
  assert.deepStrictEqual([e('ballons').niveau, e('ballons').connu], [1, false]);
  assert.strictEqual(texteProgression(e('ballons')), 'progression inconnue');
  assert.strictEqual(texteProgression(e('plongee')), 'encore 100 créatures marines pour le bronze');
});

test('etatBadges : niveau illisible → pas de « à récupérer » inventé', async () => {
  const { etatBadges, texteProgression } = await lib('badges.js');
  const r = record({ peche: [0, 2500] });
  r.niveaux[parId('peche').case] = null;
  const e = etatBadges(DEFS, r)[0];
  assert.deepStrictEqual([e.niveau, e.aRecuperer], [null, 0]);
  assert.strictEqual(texteProgression(e), `niveau illisible (${(2500).toLocaleString('fr-FR')} poissons)`);
});

test('etatBadges : singulier, et le seuil de l\'argent', async () => {
  const { etatBadges, texteProgression } = await lib('badges.js');
  const e = etatBadges(DEFS, record({ peche: [1, 1999], plongee: [1, 150] }));
  assert.strictEqual(texteProgression(e[0]), 'encore 1 poisson pour l\'argent');
  assert.strictEqual(texteProgression(e[2]), 'encore 50 créatures marines pour l\'argent');
});

test('etatBadges : sans lecture, tous les badges sont inconnus', async () => {
  const { etatBadges, texteProgression } = await lib('badges.js');
  const etats = etatBadges(DEFS, null);
  assert.strictEqual(etats.length, 24);
  assert.ok(etats.every(e => e.niveau === null && !e.connu));
  assert.strictEqual(texteProgression(etats[0]), 'pas encore lu dans la sauvegarde');
});

test('badgesAFaire : d\'abord ceux à récupérer, puis les plus proches du palier suivant', async () => {
  const { etatBadges, badgesAFaire } = await lib('badges.js');
  const etats = etatBadges(DEFS, record({
    peche: [2, 4900],                 // 98 % vers l'or
    insectes: [0, 100],               // 20 % vers le bronze
    plongee: [1, 150],                // 75 % vers l'argent
    'mauvaises-herbes': [0, 650],     // à récupérer
    medailles: [3, 9000],             // déjà en or
    reves: [0, 49],                   // plus possible à gagner
    ballons: [0, null],               // progression inconnue
  }));
  const ids = badgesAFaire(etats, 3).map(e => e.def.id);
  assert.deepStrictEqual(ids, ['mauvaises-herbes', 'peche', 'plongee']);
  assert.ok(!badgesAFaire(etats, 30).some(e => ['medailles', 'reves', 'ballons'].includes(e.def.id)));
});

test('changementsBadges : ce que l\'import va changer', async () => {
  const { changementsBadges } = await lib('badges.js');
  const ancien = record({ peche: [1, 900], insectes: [0, 200] });
  const nouveau = record({ peche: [2, 2100], insectes: [0, 250] });
  const c = changementsBadges(DEFS, ancien, nouveau);
  assert.strictEqual(c.premiere, false);
  assert.deepStrictEqual(c.niveaux.map(x => [x.def.id, x.de, x.a]), [['peche', 1, 2]]);
  assert.strictEqual(c.progressions, 2);
  assert.strictEqual(changementsBadges(DEFS, null, nouveau).premiere, true);
  const rien = changementsBadges(DEFS, nouveau, { ...nouveau, lu_le: '2026-12-01' });
  assert.deepStrictEqual([rien.niveaux.length, rien.progressions, rien.joueurChange], [0, 0, false]);
  assert.strictEqual(changementsBadges(DEFS, ancien, { ...nouveau, joueur: 2 }).joueurChange, true);
});

test('normaliserBadges : garde une lecture valable, refuse le reste', async () => {
  const { normaliserBadges } = await lib('badges.js');
  const r = record({ peche: [1, 900] });
  assert.deepStrictEqual(normaliserBadges(r), { ...r, manuel: false });
  assert.strictEqual(normaliserBadges({ niveaux: [1, 2] }), null);
  assert.strictEqual(normaliserBadges('abc'), null);
  const sale = normaliserBadges({ ...r, niveaux: r.niveaux.map((n, i) => (i === 0 ? 7 : n)), valeurs: r.valeurs.map((v, i) => (i === 1 ? 'x' : v)) });
  assert.deepStrictEqual([sale.niveaux[0], sale.valeurs[1]], [null, null]);
});

// ---------------------------------------------------------------------------
// Profil et synchro PC / téléphone
// ---------------------------------------------------------------------------
test("profil : la lecture des badges est gardée par la vérification commune (PC et Android)", () => {
  const Profil = require(path.join(RACINE, 'src', 'shared', 'profil.js'));
  const b = record({ peche: [1, 900] });
  assert.deepStrictEqual(Profil.normaliserProfil({ nom: 'Ma ville', jeu: 'nl', badges: b }).badges, b);
  assert.strictEqual(Profil.normaliserProfil({ nom: 'Ma ville', jeu: 'nl', badges: [1, 2] }).badges, undefined);
});

test('synchro : les badges se synchronisent comme les autres réglages du profil', async () => {
  const { fusionnerProfil, CHAMPS_PROFIL } = await lib('synchro.js');
  assert.ok(CHAMPS_PROFIL.includes('badges'));
  const vieux = record({ peche: [1, 900] }), neuf = record({ peche: [2, 2100] });
  // Réimporté sur le PC : la nouvelle lecture part en ligne.
  assert.deepStrictEqual(fusionnerProfil({ id: 'p', badges: vieux }, { id: 'p', badges: neuf }, { id: 'p', badges: vieux }).badges, neuf);
  // Réimporté sur le téléphone : la nouvelle lecture arrive sur le PC.
  assert.deepStrictEqual(fusionnerProfil({ id: 'p', badges: vieux }, { id: 'p', badges: vieux }, { id: 'p', badges: neuf }).badges, neuf);
});

test("synchro : un appareil encore en 1.8 (qui ne connaît pas les badges) ne les efface pas", async () => {
  const { fusionnerProfil } = await lib('synchro.js');
  const b = record({ peche: [1, 900] });
  // L'ancienne version renvoie le profil en ligne sans « badges » : cet appareil garde sa lecture.
  assert.deepStrictEqual(fusionnerProfil({ id: 'p', badges: b }, { id: 'p', badges: b }, { id: 'p' }).badges, b);
  // Rien d'un côté ni de l'autre : pas de champ inventé.
  assert.strictEqual(fusionnerProfil({ id: 'p' }, { id: 'p' }, { id: 'p' }).badges, undefined);
});

test("texteChangementsBadges : la ligne « Badges » de la fenêtre d'import", async () => {
  const { changementsBadges, texteChangementsBadges } = await lib('badges.js');
  const ancien = record({ peche: [1, 900], insectes: [0, 200] });
  const t = (a, n) => texteChangementsBadges(changementsBadges(DEFS, a, n), n);
  assert.strictEqual(t(null, record({ peche: [1, 900], navets: [3, 1e7] })), 'lus pour la première fois (2 badges obtenus)');
  assert.strictEqual(t(ancien, record({ peche: [2, 2100], insectes: [0, 250] })), '1 nouveau niveau (Poissons pêchés : argent), progression mise à jour');
  assert.strictEqual(t(ancien, record({ peche: [1, 950], insectes: [0, 200] })), 'progression mise à jour');
  assert.strictEqual(t(ancien, ancien), null);
  assert.strictEqual(t(ancien, { ...ancien, joueur: 2, nom: 'Lou' }), 'lus pour Lou (un autre joueur que la dernière fois)');
  // Même numéro de joueur, mais un autre nom (une autre ville) : c'est aussi un autre joueur.
  assert.strictEqual(t(ancien, { ...ancien, nom: 'PlayerA1' }), 'lus pour PlayerA1 (un autre joueur que la dernière fois)');
});

test("texteChangementsBadges : niveaux qui baissent, et liste raccourcie", async () => {
  const { changementsBadges, texteChangementsBadges } = await lib('badges.js');
  const t = (a, n) => texteChangementsBadges(changementsBadges(DEFS, a, n), n);
  assert.strictEqual(t(record({ peche: [2, 2100] }), record({ peche: [1, 900] })),
    '1 niveau plus bas qu\'avant (Poissons pêchés : bronze), progression mise à jour');
  const tous = id => Object.fromEntries(DEFS.slice(0, 7).map(d => [d.id, [1, d.seuils[0]]]));
  assert.strictEqual(t(record(), record(tous())),
    '7 nouveaux niveaux (Poissons pêchés : bronze, Insectes attrapés : bronze, Plongée : bronze, Encyclopédie des poissons : bronze, Encyclopédie des insectes : bronze…), progression mise à jour');
});

// ---------------------------------------------------------------------------
// Saisie à la main (joueurs sur console, sans lecture de la sauvegarde)
// ---------------------------------------------------------------------------
const JOUR = new Date(2026, 10, 26);

test('saisirBadge : sans lecture, crée une saisie vide puis change un seul badge', async () => {
  const { saisirBadge } = await lib('badges.js');
  const r = saisirBadge(null, parId('peche').case, { niveau: 2 }, JOUR);
  assert.deepStrictEqual([r.lu_le, r.manuel, r.nom, r.joueur], ['2026-11-26', true, '', 1]);
  assert.strictEqual(r.niveaux[parId('peche').case], 2);
  assert.ok(r.niveaux.every((n, i) => i === parId('peche').case || n === 0), 'les autres badges : aucun');
  assert.ok(r.valeurs.every(v => v === null), 'aucun compteur inventé');
});

test('saisirBadge : compteur, case vidée, valeurs refusées, lecture gardée sinon', async () => {
  const { saisirBadge } = await lib('badges.js');
  const c = parId('peche').case;
  const avant = record({ peche: [1, 900], insectes: [2, 2100] });
  const r = saisirBadge(avant, c, { valeur: '4688' }, JOUR);
  assert.deepStrictEqual([r.niveaux[c], r.valeurs[c]], [1, 4688]);
  assert.strictEqual(r.valeurs[parId('insectes').case], 2100);
  assert.deepStrictEqual([r.nom, r.joueur, r.manuel, r.lu_le], ['Blanche', 1, true, '2026-11-26']);
  assert.strictEqual(avant.valeurs[c], 900, "la lecture d'avant n'est pas modifiée");
  assert.strictEqual(saisirBadge(avant, c, { valeur: '' }, JOUR).valeurs[c], null);
  assert.strictEqual(saisirBadge(avant, c, { valeur: '-3' }, JOUR).valeurs[c], 900);
  assert.strictEqual(saisirBadge(avant, c, { valeur: 'abc' }, JOUR).valeurs[c], 900);
  assert.strictEqual(saisirBadge(avant, c, { niveau: 7 }, JOUR).niveaux[c], 1);
  assert.strictEqual(saisirBadge(avant, c, { niveau: '3' }, JOUR).niveaux[c], 3);
  assert.strictEqual(saisirBadge(avant, c, { valeur: '1 413 198' }, JOUR).valeurs[c], 1413198);
});

test('saisirBadge : une saisie refusée ne change rien (ni « retouché à la main », ni nombre géant)', async () => {
  const { saisirBadge } = await lib('badges.js');
  const avant = record({ peche: [1, 900] });
  for (const modifs of [{ valeur: '1.5' }, { valeur: '99999999999999999999' }, { niveau: 7 }, {}]) {
    assert.strictEqual(saisirBadge(avant, 0, modifs, JOUR), avant, JSON.stringify(modifs));
  }
  assert.strictEqual(saisirBadge(null, 0, { valeur: '1.5' }, JOUR), null, 'pas de saisie vide créée pour rien');
  assert.strictEqual(saisirBadge(avant, 0, { valeur: '4294967296' }, JOUR), avant, 'au-delà de ce que le jeu peut compter');
});

test('saisie à la main : « manuel » est gardé, et les calculs marchent pareil', async () => {
  const { saisirBadge, normaliserBadges, etatBadges, texteProgression } = await lib('badges.js');
  const r = saisirBadge(saisirBadge(null, 0, { niveau: 2 }, JOUR), 0, { valeur: 4688 }, JOUR);
  assert.strictEqual(normaliserBadges(r).manuel, true);
  assert.strictEqual(normaliserBadges(record()).manuel, false);
  assert.strictEqual(texteProgression(etatBadges(DEFS, r)[0]), "encore 312 poissons pour l'or");
  assert.strictEqual(texteProgression(etatBadges(DEFS, r)[1]), 'progression inconnue');
});

test("import par-dessus une saisie à la main : « remplace ta saisie », pas de faux « autre joueur »", async () => {
  const { saisirBadge, changementsBadges, texteChangementsBadges } = await lib('badges.js');
  const saisie = saisirBadge(null, 0, { niveau: 1, valeur: 900 }, JOUR);
  const lu = record({ peche: [2, 2100] });
  const c = changementsBadges(DEFS, saisie, lu);
  assert.deepStrictEqual([c.joueurChange, c.remplaceSaisie], [false, true]);
  assert.strictEqual(texteChangementsBadges(c, lu), "1 nouveau niveau (Poissons pêchés : argent), progression mise à jour, remplace ce que tu as saisi à la main");
  // Même contenu exactement : l'import remplace quand même la saisie (elle redevient une lecture de la sauvegarde).
  const pareil = { ...lu, manuel: true };
  assert.strictEqual(texteChangementsBadges(changementsBadges(DEFS, pareil, lu), lu), 'remplace ce que tu as saisi à la main');
});
