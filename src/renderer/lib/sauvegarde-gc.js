// Lecture d'une sauvegarde du GameCube (Animal Crossing) : musée et catalogue. LECTURE SEULE.
//
// Format, d'après le code du jeu décompilé par le projet ac-decomp (licence CC0) :
//  - fichier de la carte mémoire « DobutsunomoriP_MURA » (m_card.c) ; dans un .gci, il suit un en-tête de 0x40 octets ;
//  - dans ce fichier, la sauvegarde de la ville (0x26000 octets) est à 0x26000, et sa copie de secours à 0x4C000 ;
//  - une copie est valable si la somme de ses mots de 16 bits (gros-boutiste) vaut 0 (m_flashrom.c) ;
//  - joueurs (m_private.h) : 4 × 0x2440 octets à partir de 0x20 ; catalogue à +0x1108 (meubles, 43 mots de 32 bits),
//    +0x11B4 (papiers peints), +0x11C0 (sols), +0x11CC (papeterie), +0x11D4 (morceaux de K.K.) ; existe à +0x1086 ;
//  - musée (m_museum_display.h) à 0x213A8 : 4 bits par objet (fossiles, tableaux, poissons, insectes) = qui l'a donné.
// Une carte complète (.raw) est aussi acceptée : on y retrouve le fichier par le répertoire et la table d'allocation.
// Vérifié sur des sauvegardes neuves des versions américaine (GAFE), européenne (GAFP) et australienne (GAFU) :
// sommes de contrôle, joueurs et catalogue. Le musée (vide dans ces sauvegardes) est vérifié dans ac-decomp :
// m_museum_display.h (position, parties, quartet bas = case paire), m_museum_display.c (case = objet − premier objet),
// ac_gyo_test.c et ac_museum_insect.c (poisson / insecte de type n = ITM_FISH_START / ITM_INSECT_START + n).
// La version japonaise (Dōbutsu no Mori+, GAFJ) a un autre format : elle est refusée.
//
// Ce fichier ne fait que des calculs (pas d'affichage).

export const NOM_FICHIER = 'DobutsunomoriP_MURA';
export const TAILLE_SAVE = 0x26000;
const COPIES = [0x26000, 0x4C000];
const BLOC = 0x2000;
const TAILLE_JOUEUR = 0x2440;
const DEBUT_JOUEURS = 0x20;
const MUSEE = 0x213A8;
const CATALOGUE = { meubles: [0x1108, 43], 'papiers-peints': [0x11B4, 3], sols: [0x11C0, 3], papeterie: [0x11CC, 2], kk: [0x11D4, 2] };
const MUSEE_PARTIES = { fossiles: [0x00, 25], art: [0x0D, 15], poissons: [0x15, 40], insectes: [0x2A, 40] };

const texte = (o, debut, n) => { let s = ''; for (let i = 0; i < n && o[debut + i]; i++) s += String.fromCharCode(o[debut + i]); return s; };
const u16 = (o, i) => (o[i] << 8) | o[i + 1];
const u32 = (o, i) => ((o[i] << 24) >>> 0) + (o[i + 1] << 16) + (o[i + 2] << 8) + o[i + 3];

export function somme16(o, debut, longueur) {
  let s = 0;
  for (let i = debut; i < debut + longueur; i += 2) s = (s + u16(o, i)) & 0xFFFF;
  return s;
}

function fichierDansCarte(o) {
  if (o.length < BLOC * 5 || o.length % BLOC) return null;
  const recent = (a, b, ofs) => (u16(o, b + ofs) > u16(o, a + ofs) ? b : a);
  const rep = recent(BLOC, 2 * BLOC, 0x1FFA);
  const bat = recent(3 * BLOC, 4 * BLOC, 0x04);
  for (let e = 0; e < 127; e++) {
    const d = rep + e * 0x40;
    if (o[d] === 0xFF || texte(o, d + 0x08, 32) !== NOM_FICHIER) continue;
    let bloc = u16(o, d + 0x36);
    const nb = u16(o, d + 0x38);
    const res = new Uint8Array(nb * BLOC);
    for (let k = 0; k < nb; k++) {
      if (bloc < 5 || (bloc + 1) * BLOC > o.length) throw new Error('Carte mémoire abîmée : la chaîne des blocs sort de la carte.');
      res.set(o.subarray(bloc * BLOC, (bloc + 1) * BLOC), k * BLOC);
      bloc = u16(o, bat + 0x0A + (bloc - 5) * 2);
    }
    return { donnees: res, code: texte(o, d, 4) };
  }
  return null;
}

export function extraireFichier(octets) {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  if (o.length > 0x40 && texte(o, 0x08, 32) === NOM_FICHIER) return { donnees: o.subarray(0x40), code: texte(o, 0, 4), format: 'gci' };
  const carte = fichierDansCarte(o);
  if (carte) return { ...carte, format: 'carte' };
  throw new Error("Ce fichier n'est pas une sauvegarde d'Animal Crossing (GameCube) : choisis un .gci « DobutsunomoriP_MURA » ou une carte mémoire .raw.");
}

export const REGIONS = { GAFE: 'américaine', GAFP: 'européenne', GAFU: 'australienne' };

// Navets : la semaine est tirée d'avance et rangée dans la sauvegarde (Kabu_price_c, m_kabu_manager.h, à 0x20480) :
// 7 prix gros-boutistes du dimanche (prix d'achat de Porcella) au samedi, le motif (0 pic, 1 aléatoire, 2 baisse) à
// + 0x0E, puis la date du tirage (OSRTCTime : seconde, minute, heure, jour, jour de la semaine, mois, année sur 16 bits).
// Vérifié sur trois sauvegardes : deux pics à 8 × le prix d'achat (736 = 8 × 92, 568 = 8 × 71) et une semaine aléatoire.
export function navetsGC(octets) {
  const { donnees, code } = extraireFichier(octets);
  if (code === 'GAFJ') throw new Error("C'est une sauvegarde de la version japonaise (Dōbutsu no Mori+) : son format est différent, elle n'est pas prise en charge.");
  const base = COPIES.find(c => c + TAILLE_SAVE <= donnees.length && somme16(donnees, c, TAILLE_SAVE) === 0);
  if (base == null) throw new Error('La sauvegarde est abîmée (somme de contrôle fausse sur les deux copies).');
  const s = donnees.subarray(base, base + TAILLE_SAVE);
  const p = 0x20480;
  const be16 = i => (s[i] << 8) | s[i + 1];
  const prix = Array.from({ length: 7 }, (_, i) => be16(p + i * 2));
  const motif = be16(p + 0x0E);
  return {
    semaine: { jour: s[p + 0x13], mois: s[p + 0x15], annee: be16(p + 0x16) },
    achat: prix[0] || null,
    cours: prix.slice(1).map(x => x || null),
    motif: motif <= 2 ? motif : null,
  };
}

export function lireSauvegardeGC(octets) {
  const { donnees, code, format } = extraireFichier(octets);
  if (code === 'GAFJ') throw new Error("C'est une sauvegarde de la version japonaise (Dōbutsu no Mori+) : son format est différent, elle n'est pas prise en charge.");
  const valides = COPIES.filter(c => c + TAILLE_SAVE <= donnees.length && somme16(donnees, c, TAILLE_SAVE) === 0);
  if (!valides.length) throw new Error('La sauvegarde est abîmée (somme de contrôle fausse sur les deux copies) : rien ne peut être importé.');
  const base = valides[0];
  const s = donnees.subarray(base, base + TAILLE_SAVE);
  const joueurs = [0, 1, 2, 3].map(n => {
    const p = DEBUT_JOUEURS + n * TAILLE_JOUEUR;
    const catalogue = {};
    for (const [champ, [ofs, mots]] of Object.entries(CATALOGUE)) {
      const set = new Set();
      for (let m = 0; m < mots; m++) {
        const v = u32(s, p + ofs + m * 4);
        for (let b = 0; b < 32; b++) if (v & (1 << b)) set.add(m * 32 + b);
      }
      catalogue[champ] = set;
    }
    const nom = [...s.subarray(p, p + 8)].map(c => (c >= 0x20 && c < 0x7F ? String.fromCharCode(c) : ' ')).join('').trim();
    return { numero: n + 1, nom, existe: s[p + 0x1086] === 1, catalogue };
  });
  const musee = {};
  for (const [partie, [ofs, nb]] of Object.entries(MUSEE_PARTIES)) {
    musee[partie] = Array.from({ length: nb }, (_, i) => (s[MUSEE + ofs + (i >> 1)] >> ((i & 1) * 4)) & 0x0F);
  }
  return { code, region: REGIONS[code] || null, format, copie: base === COPIES[0] ? 'principale' : 'secours', joueurs, musee };
}

// Ce que l'import cocherait (seulement des ajouts) : [{ categorie, id, obtenu: true, musee?: true }].
export function cochesImport(save, correspondance, numeroJoueur) {
  const res = new Map();
  const ajouter = (categorie, id, musee) => {
    if (!id) return;
    const k = `${categorie}:${id}`;
    const x = res.get(k) || { categorie, id, obtenu: true };
    if (musee) x.musee = true;
    res.set(k, x);
  };
  for (const [partie, donneurs] of Object.entries(save.musee)) {
    donneurs.forEach((d, i) => { if (d >= 1 && d <= 5) ajouter(partie, correspondance.musee[partie][i], true); });
  }
  const joueur = save.joueurs.find(j => j.numero === numeroJoueur);
  if (joueur) for (const c of correspondance.catalogue) if (joueur.catalogue[c.champ] && joueur.catalogue[c.champ].has(c.index)) ajouter(c.categorie, c.id, false);
  return [...res.values()];
}
