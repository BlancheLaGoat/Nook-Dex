// Lecture d'une archive .zip (Android : la sauvegarde New Horizons est un dossier, qu'on choisit compressé en .zip,
// car le téléphone ne sait pas choisir un dossier). Seulement la lecture, sans bibliothèque :
// la décompression utilise DecompressionStream('deflate-raw'), intégré au navigateur (et à Node 18+).
// Marche avec require() (tests) et comme simple <script> (window.NookZip).
(function (racine, fabrique) {
  const m = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else racine.NookZip = m;
}(typeof self !== 'undefined' ? self : this, () => {
  const u16 = (o, i) => o[i] | (o[i + 1] << 8);
  const u32 = (o, i) => (o[i] | (o[i + 1] << 8) | (o[i + 2] << 16) | (o[i + 3] << 24)) >>> 0;

  async function decompresser(octets) {
    const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flux).arrayBuffer());
  }

  // Renvoie Map<chemin, Uint8Array> des fichiers de l'archive (les dossiers sont ignorés).
  // garder(chemin, taille) : facultatif, pour ne décompresser que les fichiers utiles.
  async function lireZip(octets, garder = () => true) {
    const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    // Fin du répertoire central : signature 0x06054B50, cherchée depuis la fin (commentaire de 64 Kio au plus).
    let fin = -1;
    for (let i = o.length - 22; i >= Math.max(0, o.length - 22 - 0xFFFF); i--) {
      if (u32(o, i) === 0x06054B50) { fin = i; break; }
    }
    if (fin < 0) throw new Error("ce fichier n'est pas une archive .zip");
    const nb = u16(o, fin + 10);
    let p = u32(o, fin + 16);
    if (p === 0xFFFFFFFF || nb === 0xFFFF) throw new Error('archive .zip trop grande (format zip64 non pris en charge)');
    const fichiers = new Map();
    for (let k = 0; k < nb; k++) {
      if (u32(o, p) !== 0x02014B50) throw new Error('archive .zip abîmée');
      const methode = u16(o, p + 10), taille = u32(o, p + 20), reelle = u32(o, p + 24);
      const lgNom = u16(o, p + 28), lgExtra = u16(o, p + 30), lgCom = u16(o, p + 32), local = u32(o, p + 42);
      const chemin = new TextDecoder().decode(o.subarray(p + 46, p + 46 + lgNom)).replace(/\\/g, '/');
      p += 46 + lgNom + lgExtra + lgCom;
      if (chemin.endsWith('/') || !garder(chemin, reelle)) continue;
      if (u32(o, local) !== 0x04034B50) throw new Error('archive .zip abîmée');
      const debut = local + 30 + u16(o, local + 26) + u16(o, local + 28);
      const brut = o.subarray(debut, debut + taille);
      if (methode === 0) fichiers.set(chemin, brut.slice());
      else if (methode === 8) fichiers.set(chemin, await decompresser(brut));
      else throw new Error(`archive .zip : méthode de compression ${methode} non prise en charge`);
    }
    return fichiers;
  }

  // Sauvegarde New Horizons dans une archive : retrouve main.dat, mainHeader.dat et les dossiers Villager0…7,
  // où qu'ils soient dans l'archive (à la racine ou dans un sous-dossier). Même forme que fichier:lireDossierNH (PC).
  async function sauvegardeNHDepuisZip(octets, nomArchive = 'sauvegarde.zip') {
    const Mo = 1024 * 1024;
    const utile = /(^|\/)(main\.dat|mainHeader\.dat|Villager[0-7]\/(personal|personalHeader)\.dat)$/;
    const f = await lireZip(octets, (chemin, taille) => utile.test(chemin) && taille <= 32 * Mo);
    const trouver = re => { for (const [c, d] of f) if (re.test(c)) return { chemin: c, octets: d }; return null; };
    const main = trouver(/(^|\/)main\.dat$/);
    if (!main) throw new Error("main.dat introuvable dans l'archive : compresse le dossier de la sauvegarde New Horizons en entier");
    const base = main.chemin.slice(0, main.chemin.length - 'main.dat'.length);
    const lire = rel => (f.get(base + rel) || null);
    const joueurs = [];
    for (let n = 0; n < 8; n++) {
      const header = lire(`Villager${n}/personalHeader.dat`), personal = lire(`Villager${n}/personal.dat`);
      if (header && personal) joueurs.push({ dossier: `Villager${n}`, header, personal });
    }
    return { nom: nomArchive.replace(/\.zip$/i, ''), octets: { mainHeader: lire('mainHeader.dat'), main: main.octets, joueurs } };
  }

  return { lireZip, sauvegardeNHDepuisZip };
}));
