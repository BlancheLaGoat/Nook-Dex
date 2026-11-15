// Tests automatiques du prédicteur de navets (src/renderer/lib/navets.js).
// Lancer avec : npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const charger = () => import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'navets.js')).href);

// ---- Simulateur : une semaine du jeu, recopiée pas à pas de TurnipPrices.cpp (Ninji) ----
// Écrit à part de lib/navets.js, pour vérifier le prédicteur avec une deuxième lecture de l'algorithme.
function generateur(graine) {
  let a = graine >>> 0;
  const suivant = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    randint: (min, max) => min + Math.floor(suivant() * (max - min + 1)),
    randfloat: (x, y) => x + suivant() * (y - x),
    randbool: () => suivant() < 0.5,
  };
}
const intceil = v => Math.trunc(v + 0.99999);

function semaine(rng, motif) {
  const { randint, randfloat, randbool } = rng;
  const base = randint(90, 110);
  const sp = new Array(14).fill(0);
  let work = 2;
  if (motif === 0) {
    const dec1 = randbool() ? 3 : 2, dec2 = 5 - dec1;
    const hi1 = randint(0, 6), hi23 = 7 - hi1, hi3 = randint(0, hi23 - 1);
    for (let i = 0; i < hi1; i++) sp[work++] = intceil(randfloat(0.9, 1.4) * base);
    let rate = randfloat(0.8, 0.6);
    for (let i = 0; i < dec1; i++) { sp[work++] = intceil(rate * base); rate -= 0.04; rate -= randfloat(0, 0.06); }
    for (let i = 0; i < hi23 - hi3; i++) sp[work++] = intceil(randfloat(0.9, 1.4) * base);
    rate = randfloat(0.8, 0.6);
    for (let i = 0; i < dec2; i++) { sp[work++] = intceil(rate * base); rate -= 0.04; rate -= randfloat(0, 0.06); }
    for (let i = 0; i < hi3; i++) sp[work++] = intceil(randfloat(0.9, 1.4) * base);
  } else if (motif === 1) {
    const peak = randint(3, 9);
    let rate = randfloat(0.9, 0.85);
    for (work = 2; work < peak; work++) { sp[work] = intceil(rate * base); rate -= 0.03; rate -= randfloat(0, 0.02); }
    for (const [x, y] of [[0.9, 1.4], [1.4, 2.0], [2.0, 6.0], [1.4, 2.0], [0.9, 1.4]]) sp[work++] = intceil(randfloat(x, y) * base);
    for (; work < 14; work++) sp[work] = intceil(randfloat(0.4, 0.9) * base);
  } else if (motif === 2) {
    let rate = 0.9; rate -= randfloat(0, 0.05);
    for (work = 2; work < 14; work++) { sp[work] = intceil(rate * base); rate -= 0.03; rate -= randfloat(0, 0.02); }
  } else {
    const peak = randint(2, 9);
    let rate = randfloat(0.9, 0.4);
    for (work = 2; work < peak; work++) { sp[work] = intceil(rate * base); rate -= 0.03; rate -= randfloat(0, 0.02); }
    sp[work++] = intceil(randfloat(0.9, 1.4) * base);
    sp[work++] = intceil(randfloat(0.9, 1.4) * base);
    rate = randfloat(1.4, 2.0);
    sp[work++] = intceil(randfloat(1.4, rate) * base) - 1;
    sp[work++] = intceil(rate * base);
    sp[work++] = intceil(randfloat(1.4, rate) * base) - 1;
    if (work < 14) { rate = randfloat(0.9, 0.4); for (; work < 14; work++) { sp[work] = intceil(rate * base); rate -= 0.03; rate -= randfloat(0, 0.02); } }
  }
  return { base, cours: sp.slice(2) };
}

test('chances de départ : table de Ninji, motif inconnu, premier achat', async () => {
  const { chancesDepart, REPARTITION_STABLE, TRANSITIONS } = await charger();
  for (const ligne of TRANSITIONS) assert.ok(Math.abs(ligne.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.deepEqual(chancesDepart(1), [0.50, 0.05, 0.20, 0.25]);
  assert.deepEqual(chancesDepart(null, true), [0, 0, 0, 1]);
  assert.ok(Math.abs(REPARTITION_STABLE.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // État stable connu : environ 34,6 % / 24,7 % / 14,8 % / 25,9 %.
  assert.deepEqual(REPARTITION_STABLE.map(x => Math.round(x * 1000) / 10), [34.6, 24.7, 14.8, 25.9]);
});

test('variantes : 56 + 7 + 1 + 8, poids qui font 1 par motif', async () => {
  const { variantes } = await charger();
  assert.deepEqual([0, 1, 2, 3].map(m => variantes(m).length), [56, 7, 1, 8]);
  for (const m of [0, 1, 2, 3]) assert.ok(Math.abs(variantes(m).reduce((s, v) => s + v.poids, 0) - 1) < 1e-9, `motif ${m}`);
});

test('sans cours saisi : les chances de départ, et le gros pic peut monter à 600 % du prix d\'achat', async () => {
  const { predire, REPARTITION_STABLE } = await charger();
  const p = predire({ achat: 100 });
  assert.ok(p.possible);
  p.motifs.forEach((m, i) => assert.ok(Math.abs(m.chance - REPARTITION_STABLE[i]) < 1e-9, m.nom));
  assert.equal(Math.max(...p.motifs[1].maxs), 600);
  assert.equal(Math.max(...p.motifs[3].maxs), 200);
  assert.equal(Math.max(...p.motifs[0].maxs), 140);
});

test('cas connus : baisse continue, gros pic, saisie impossible', async () => {
  const { predire } = await charger();
  // Toute la semaine en baisse régulière : seulement « décroissant ».
  const baisse = predire({ achat: 100, cours: [88, 85, 82, 78, 75, 72, 69, 66, 62, 59, 56, 53] });
  assert.equal(baisse.motifs[2].chance, 1);
  // 600 le mercredi après-midi pour un achat à 100 (après 120 puis 180) : seul le gros pic le permet.
  const pic = predire({ achat: 100, cours: [86, 82, 78, 120, 180, 600] });
  // Sans l'étape à 140-200 %, 600 juste après 120 est impossible (le jeu monte en trois temps).
  assert.equal(predire({ achat: 100, cours: [86, 82, 78, 120, 600] }).possible, false);
  assert.equal(pic.motifs[1].chance, 1);
  // Un cours qui remonte trop haut trop tôt pour tout motif : rien n'est possible.
  const impossible = predire({ achat: 100, cours: [50, 700] });
  assert.equal(impossible.possible, false);
  assert.ok(impossible.motifs.every(m => m.chance === 0));
});

test('2 000 semaines simulées : le vrai motif reste possible, chaque vrai cours est dans la fourchette', async () => {
  const { predire, TRANSITIONS } = await charger();
  const rng = generateur(20261115);
  let precedent = 2;
  for (let n = 0; n < 2000; n++) {
    // Motif de la semaine selon la table du jeu.
    const tirage = rng.randint(0, 99) / 100;
    let motif = 0, cumul = 0;
    for (; motif < 3; motif++) { cumul += TRANSITIONS[precedent][motif]; if (tirage < cumul - 1e-9) break; }
    const { base, cours } = semaine(rng, motif);
    const vus = rng.randint(0, 12);
    const achatConnu = rng.randbool();
    const p = predire({ achat: achatConnu ? base : null, cours: cours.map((c, i) => (i < vus ? c : null)), precedent: rng.randbool() ? precedent : null });
    const contexte = `semaine ${n} : motif ${motif}, base ${base}, ${vus} cours vus, cours ${cours.join(' ')}`;
    assert.ok(p.possible, contexte);
    assert.ok(p.motifs[motif].chance > 0, contexte);
    assert.ok(Math.abs(p.motifs.reduce((s, m) => s + m.chance, 0) - 1) < 1e-9, contexte);
    for (let i = 0; i < 12; i++) {
      assert.ok(cours[i] >= p.mins[i] && cours[i] <= p.maxs[i], `${contexte} — ${i} : ${cours[i]} hors de ${p.mins[i]}-${p.maxs[i]}`);
      assert.ok(cours[i] >= p.motifs[motif].mins[i] && cours[i] <= p.motifs[motif].maxs[i], `${contexte} — motif, ${i}`);
    }
    precedent = motif;
  }
});

test('profil : semaine de navets ramenée à une forme sûre', async () => {
  const { normaliserNavets } = await charger();
  assert.deepEqual(normaliserNavets(null), { achat: null, cours: new Array(12).fill(null), precedent: null, premierAchat: false });
  const n = normaliserNavets({ achat: '104', cours: [90, '', 'abc', -3, 85.6], precedent: 3, premierAchat: true });
  assert.equal(n.achat, 104);
  assert.deepEqual(n.cours.slice(0, 5), [90, null, null, null, 86]);
  assert.equal(n.precedent, 3);
  assert.equal(normaliserNavets({ achat: 150 }).achat, null); // hors de 90-110
});

// ---- GameCube : simulateur recopié pas à pas de m_kabu_manager.c (ac-decomp, CC0) ----
function semaineGC(rng, motif) {
  const f = Math.fround;
  const fq = () => f(rng.randfloat(0, 1));
  const S = Math.trunc(f(f(1 + f(f(fq() - 0.5) * f(0.6))) * f(100)));
  const prix = new Array(6);
  const aleatoire = () => {
    let mult = f(1.05), chance = f(0.1), cur = f(S);
    const mini = f(f(S) * f(0.8));
    for (let d = 0; d < 6; d++) {
      if (fq() < chance) { cur = f(cur * f(0.7)); if (cur > mini) cur = mini; chance = f(chance * f(0.3)); if (chance > f(0.1)) chance = f(0.1); }
      else { cur = f(cur * mult); mult = f(mult + f(0.01)); chance = f(chance + f(0.14)); }
      prix[d] = Math.trunc(cur);
    }
  };
  if (motif === 0) { aleatoire(); prix[Math.trunc(fq() * 5)] = Math.trunc(f(f(S) * f(8))); }
  else if (motif === 1) aleatoire();
  else { let cur = f(S); for (let d = 0; d < 6; d++) { cur = f(cur * f(f(0.8) + f(f(0.14999998) * fq()))); prix[d] = Math.trunc(cur); } }
  return { S, cours: prix };
}

test('GameCube : table de transitions du jeu, 64 suites « aléatoire » qui font 100 %', async () => {
  const { TRANSITIONS_GC, suitesAleatoires, chancesDepartGC } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'navets-gc.js')).href);
  for (const l of TRANSITIONS_GC) assert.ok(Math.abs(l.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.deepEqual(chancesDepartGC(2), [0.6, 0.3, 0.1]);
  const s = suitesAleatoires(100);
  assert.ok(Math.abs(s.reduce((t, x) => t + x.p, 0) - 1) < 1e-6);
  // Que des hausses : × 1,05, × 1,06… à partir de 100. En simple précision, 100 × 1,05 = 104,99999 : le jeu garde 104.
  const hausses = s.reduce((m, x) => (x.p > m.p ? x : m));
  assert.deepEqual(hausses.prix.slice(0, 2), [104, 111]);
});

test('GameCube : 2 000 semaines simulées, le vrai motif reste possible et chaque prix est dans la fourchette', async () => {
  const { predireGC, TRANSITIONS_GC } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'navets-gc.js')).href);
  const rng = generateur(70129);
  let precedent = 1;
  for (let n = 0; n < 2000; n++) {
    const t = rng.randfloat(0, 1);
    const ligne = TRANSITIONS_GC[precedent];
    const motif = t < ligne[0] ? 0 : t < ligne[0] + ligne[1] ? 1 : 2;
    const { S, cours } = semaineGC(rng, motif);
    const vus = rng.randint(0, 6);
    const p = predireGC({ achat: rng.randbool() ? S : null, cours: cours.map((c, i) => (i < vus ? c : null)), precedent: rng.randbool() ? precedent : null });
    const ctx = `semaine ${n} : motif ${motif}, dimanche ${S}, ${vus} vus, cours ${cours.join(' ')}`;
    assert.ok(p.possible && p.motifs[motif].chance > 0, ctx);
    for (let i = 0; i < 6; i++) assert.ok(cours[i] >= p.mins[i] && cours[i] <= p.maxs[i], `${ctx} — jour ${i} : ${cours[i]} hors de ${p.mins[i]}-${p.maxs[i]}`);
    precedent = motif;
  }
});

test('GameCube : un prix à 8 fois le dimanche ne peut venir que du pic', async () => {
  const { predireGC } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'navets-gc.js')).href);
  const p = predireGC({ achat: 100, cours: [105, 800] });
  assert.equal(p.motifs[0].chance, 1);
  // Prix qui baissent de 10 % par jour : seulement le motif « baisse ».
  assert.equal(predireGC({ achat: 100, cours: [90, 81, 72] }).motifs[2].chance, 1);
});

// ---- Wild World (lib/navets-ww.js, d'après acww-decomp) ----
const chargerWW = () => import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'navets-ww.js')).href);

test('Wild World : transitions du jeu (sur 101) et vraie semaine décroissante', async () => {
  const { TRANSITIONS_WW, predireWW } = await chargerWW();
  for (const l of TRANSITIONS_WW) assert.ok(Math.abs(l.reduce((s, x) => s + x, 0) - 1) < 1e-12);
  // Semaine lue dans une vraie sauvegarde européenne (motif 2 dans le jeu).
  const p = predireWW({ achat: 103, cours: [82, 79, 76, 73, 71, 68, 66, 63, 61, 58, 56, 53] });
  assert.ok(p.possible);
  assert.strictEqual(p.motifs[2].chance, 1);
});

test('Wild World : 1 000 semaines tirées comme le jeu, le vrai motif reste possible et chaque prix est dans la fourchette', async () => {
  const { variantesWW, predireWW } = await chargerWW();
  const g = generateur(2026);
  const n = k => g.randint(0, k - 1);
  for (let k = 0; k < 1000; k++) {
    const motif = n(4), vs = variantesWW(motif), va = vs[n(vs.length)], S = 90 + n(21);
    const cours = va.tirages.map(([part, ecart]) => Math.floor((S * (part + n(ecart))) / 4096));
    const vus = cours.map((c, i) => (i < k % 12 ? c : null));
    const p = predireWW({ achat: S, cours: vus });
    assert.ok(p.motifs[motif].chance > 0, `semaine ${k}`);
    cours.forEach((c, i) => assert.ok(c >= p.mins[i] && c <= p.maxs[i], `semaine ${k}, cours ${i}`));
  }
});

// ---- City Folk (lib/navets-cf.js, d'après TurnipPricesCityFolk.cs) ----
// Simulateur recopié pas à pas du fichier C# (calculs en simple précision), écrit à part de lib/navets-cf.js.
const chargerCF = () => import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'lib', 'navets-cf.js')).href);
function semaineCF(g, motif) {
  const f = Math.fround;
  const rand = () => f(g.randfloat(0, 1));
  const randInt = n => Math.trunc(n * rand());
  const randF = x => f(f(x) * rand());
  const ceil = v => Math.trunc(f(f(v) + f(0.99999)));
  const b = 90 + randInt(21);
  const entre = (hi, lo) => ceil(f(b) * f(f(lo) + randF(f(f(hi) - f(lo)))));
  const p = new Array(14).fill(0);
  let s = 2, r;
  const baisse = fin => { r = f(f(0.8) - randF(0.05)); for (; s < fin; s++) { p[s] = ceil(f(r * b)); r = f(f(r - f(0.03)) - randF(0.02)); } };
  if (motif === 0) {
    const [d1, d2] = randInt(2) === 0 ? [2, 3] : [3, 2];
    const h1 = randInt(3), h3 = randInt(3), h2 = 7 - h1 - h3;
    const bas = n => { r = f(f(0.8) - randF(0.2)); for (let i = 0; i < n; i++) { p[s++] = ceil(f(r * b)); r = f(f(r - f(0.04)) - randF(0.06)); } };
    for (let i = 0; i < h1; i++) p[s++] = entre(1.4, 0.8);
    bas(d1);
    for (let i = 0; i < h2; i++) p[s++] = entre(1.4, 0.8);
    bas(d2);
    for (let i = 0; i < h3; i++) p[s++] = entre(1.4, 0.8);
  } else if (motif === 1 || motif === 3) {
    const pic = randInt(5) + 5;
    baisse(pic);
    if (motif === 1) {
      p[pic] = entre(1.4, 0.8); p[pic + 1] = entre(2.0, 1.4); p[pic + 2] = entre(6.0, 2.0); p[pic + 3] = entre(2.0, 1.4); p[pic + 4] = entre(1.4, 0.8);
    } else {
      p[pic] = entre(1.4, 0.8); p[pic + 1] = entre(1.4, 0.8);
      const top = f(f(1.4) + randF(0.6));
      p[pic + 3] = ceil(f(top * b)); p[pic + 2] = entre(top, 1.4); p[pic + 4] = entre(top, 1.4);
    }
    s = pic + 5; baisse(14);
  } else baisse(14);
  return { b, cours: p.slice(2) };
}

test('City Folk : 1 000 semaines simulées, le vrai motif reste possible et chaque prix est dans la fourchette', async () => {
  const { predireCF, variantesCF } = await chargerCF();
  for (let m = 0; m < 4; m++) assert.ok(Math.abs(variantesCF(m).reduce((s, v) => s + v.poids, 0) - 1) < 1e-12);
  const g = generateur(1708);
  for (let k = 0; k < 1000; k++) {
    const motif = k % 4;
    const { b, cours } = semaineCF(g, motif);
    const vus = cours.map((c, i) => (i < k % 12 ? c : null));
    const p = predireCF({ achat: b, cours: vus });
    assert.ok(p.motifs[motif].chance > 0, `semaine ${k} (motif ${motif}) : ${cours.join(',')}`);
    cours.forEach((c, i) => assert.ok(c >= p.mins[i] && c <= p.maxs[i], `semaine ${k}, cours ${i} : ${c} hors de ${p.mins[i]}-${p.maxs[i]}`));
  }
});
