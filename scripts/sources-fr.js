// Traduit en français la façon d'obtenir les objets (champ « sources » des fiches) et les provenances
// du tableur des codes GameCube (data/gc/codes.json).
//
// Les scripts de chaque jeu écrivent ces textes tels que les donnent les sources (souvent en anglais) :
// cette étape passe ensuite sur data/<jeu>/*.json et les traduit morceau par morceau.
// Elle peut être relancée sans risque : un texte déjà en français reste tel quel.
//
// Noms propres : noms français officiels (version européenne) des habitants et des personnages,
// lus dans le tableur New Leaf (onglets Villagers et Characters, colonne « Name (French EU) »).
// Le reste vient du dictionnaire TERMES ci-dessous. Ce qui n'est pas traduit est listé à la fin.
//
// Lancer avec : npm run donnees:sources-fr
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA, DOSSIER_SOURCES } = require('./lib/outils');

// ---------- Dictionnaire (anglais -> français) ----------
const TERMES = {
  // Magasins et lieux
  'Able Sisters': 'Les sœurs Doigts de fée', "Tom Nook's store": 'Magasin de Tom Nook', Nook: 'Tom Nook', "Nook's": 'Magasin de Tom Nook',
  "Crazy Redd's": 'Rounard', "Redd's": 'Rounard', "Redd's Raffle": 'Tombola de Rounard', "Redd's Co-op Raffle": 'Tombola de Rounard (coopérative)',
  Lottery: 'Loterie', Raffle: 'Tombola', "Timmy and Tommy's store": 'Magasin de Méli et Mélo', 'Timmy & Tommy shopping catalog': 'Catalogue de Méli et Mélo',
  GracieGrace: 'Boutique de Carla', 'Kicks (shop)': 'Boutique de Blaise', "Kicks' Co-op": 'Coopérative de Blaise', "Saharah's Co-op": 'Coopérative de Sarah',
  Museum: 'Musée', 'Museum Shop': 'Boutique du musée', 'Souvenir Shop': 'Boutique de souvenirs', 'Hotel Souvenir Shop': "Boutique de souvenirs de l'hôtel",
  'garden shop': 'Jardinerie', 'Re-Tail': 'Re-Tail (dépôt-vente)', 'post office': 'Bureau de poste', 'town hall': 'Mairie', 'The Roost': 'Le Perchoir',
  'HH Showcase': 'Vitrine de la HHA', 'Happy Home Academy': 'Happy Home Academy', 'Happy Room Academy': 'Happy Room Academy',
  'Bank of Nintendo': 'Banque Nintendo', 'Point-Tracking Machine': 'Borne à points', 'Tom Nook Point System': 'Points Tom Nook',
  'Posy Farm': 'Ferme de fleurs', 'Farway Museum': 'Musée de Farway', 'Animal Island': 'Île des animaux', 'Animal Island hut': "Cabane de l'île des animaux",
  'Moving Van': 'Camion de déménagement', 'Dodo Airlines': 'Dodo Airlines', 'Slumber Islands': 'Îles de rêve', 'Recycle box': 'Boîte de recyclage',
  'HHP Apparel Shop': 'Boutique de vêtements (Happy Home Paradise)', 'HHP Café': 'Café (Happy Home Paradise)', 'HHP Office': 'Bureau (Happy Home Paradise)',
  'HHP island bottles': 'Bouteilles des îles (Happy Home Paradise)', "Kapp'n island bottles": "Bouteilles des îles d'Amiral",
  "Jolly Redd's Treasure Trawler": 'Chalutier de Rounard', "Katrina's Cleansing Service": 'Purification chez Astrid',
  // Façons de l'obtenir
  'dig spot': 'Trou à creuser', dump: 'Décharge', Dump: 'Décharge', tree: 'Arbre', balloon: 'Ballon', balloons: 'Ballons', 'Gold balloon': 'Ballon doré',
  'Egg balloons': 'Ballons œufs', 'Egg bottles': 'Bouteilles œufs', 'any villager': "N'importe quel habitant", Birthday: 'Anniversaire', Mom: 'Maman',
  friendship: 'Amitié', camper: 'Campeur', Campers: 'Campeurs', campground: 'Camping', 'Winter campers': "Campeurs d'hiver", 'winter campers': "Campeurs d'hiver",
  'summer campers': "Campeurs d'été", 'Lost and found': 'Objets trouvés', 'Lost & Found': 'Objets trouvés', 'One Day Sale': "Soldes d'un jour",
  'Sale Day': 'Jour des soldes', 'treasure hunt': 'Chasse au trésor', 'spotlight item': 'Objet vedette', 'starting item': 'Objet de départ',
  'Starting item': 'Objet de départ', 'Starting Item': 'Objet de départ', 'Starting items': 'Objets de départ', Unobtainable: 'Impossible à obtenir',
  'secret code': 'Code secret', 'Secret Code': 'Code secret', Code: 'Code secret', 'e-Reader card': 'Carte e-Reader', 'golden tree': 'Arbre doré',
  'Golden Tree': 'Arbre doré', mushroom: 'Champignon', Fishing: 'Pêche', 'Wishy the Star': 'Étoile filante (vœu)', 'Santa bag': 'Sac de Rodolphe',
  tour: 'Visites (tours)', Buried: 'Enterré', Chores: 'Petits boulots', 'Change Inventory Background': "Changer le fond de l'inventaire",
  'Nintendo Wi-Fi Connection': 'Connexion Wi-Fi Nintendo', 'Distribution Nintendo': 'Distribution Nintendo', Island: 'Île', Tent: 'Tente', Igloo: 'Igloo',
  Snowman: 'Bonhomme de neige', 'Snowman (New Leaf)': 'Bonhomme de neige (New Leaf)', 'Mr. Resetti': 'M. Resetti', 'K.K. Slider': 'Kéké Laglisse',
  HRA: 'HRA', HHA: 'HHA',
  // Noms donnés par la joueuse (absents du tableur New Leaf).
  Boondox: 'Ploucville', Farley: 'Larzac', Kaitlin: 'Kaitlin',
  // Événements
  'Fishing Tourney': 'Tournoi de pêche', 'win Fishing Tourney': 'victoire au tournoi de pêche', 'Bug-Off': "Concours d'insectes",
  'Autumn Fishing Tourney': "Tournoi de pêche d'automne", 'Summer Fishing Tourney': "Tournoi de pêche d'été", "April Fool's Day": "Poisson d'avril",
  'Autumn Sports Fair': "Fête du sport d'automne", 'Spring Sports Fair': 'Fête du sport de printemps', 'Cherry Blossom Festival': 'Fête des cerisiers en fleurs',
  "Explorer's Day": "Jour de l'explorateur", "Father's Day": 'Fête des pères', "Mother's Day": 'Fête des mères', 'Fireworks Show': "Feu d'artifice",
  "Founder's Day": 'Jour de la fondation', 'Graduation Day': 'Jour des diplômes', 'Groundhog Day': 'Jour de la marmotte', Halloween: 'Halloween',
  'Harvest Festival': 'Fête des récoltes', 'Harvest Moon': 'Fête de la lune', 'Hometown Day': 'Fête de la ville', 'Labor Day': 'Fête du travail',
  "Mayor's Day": 'Jour du maire', 'Meteor Shower': "Pluie d'étoiles filantes", 'Morning Aerobics': 'Gymnastique du matin', 'Nature Day': 'Jour de la nature',
  "New Year's Eve": 'Réveillon du Nouvel An', "New Year's Day": "Jour de l'an", "Officer's Day": 'Fête de la police', 'Snow Day': 'Jour de neige',
  'Spring Cleaning': 'Grand ménage de printemps', 'Toy Day': 'Jour des jouets', 'May Day Tour': 'Visite du 1er mai', 'DJ KK concert': 'Concert de DJ Kéké',
  'Check Toy Day stockings the day after Toy Day': 'Chaussettes du Jour des jouets, le lendemain',
  // New Horizons (actions, personnalités)
  '5-star town status': 'Île 5 étoiles', 'All villagers (while stung)': 'Tous les habitants (quand on est piqué)', 'Breaking 100 axes': 'Casser 100 haches',
  'Completing bug Critterpedia': "Compléter l'encyclopédie des insectes", 'Completing fish Critterpedia': "Compléter l'encyclopédie des poissons",
  'Digging up clams': 'Déterrer des palourdes', 'Donating all art': "Donner toutes les œuvres d'art", 'Donating all bugs': 'Donner tous les insectes',
  'Donating all fish': 'Donner tous les poissons', 'Donating all fossils': 'Donner tous les fossiles', 'Donating all sea creatures': 'Donner toutes les créatures marines',
  'Group Stretching': 'Étirements collectifs', 'Helping Gulliver 30 times': 'Aider Gulliver 30 fois', 'Hitting a rock': 'Frapper un rocher',
  'Learning all egg outfit DIYs': 'Apprendre toutes les recettes de tenues œufs', 'Collecting earth eggs': 'Ramasser des œufs de terre',
  'Collecting leaf eggs': 'Ramasser des œufs de feuille', 'Collecting sky eggs': 'Ramasser des œufs du ciel', 'Collecting stone eggs': 'Ramasser des œufs de pierre',
  'Collecting water eggs': "Ramasser des œufs d'eau", 'Collecting wood eggs': 'Ramasser des œufs de bois',
  'Big Sister villagers': 'Habitants grande sœur', 'Cranky villagers': 'Habitants grincheux', 'Jock villagers': 'Habitants sportifs',
  'Lazy villagers': 'Habitants paresseux', 'Normal villagers': 'Habitants normaux', 'Peppy villagers': 'Habitants pétillants',
  'Smug villagers': 'Habitants prétentieux', 'Snooty villagers': 'Habitants snobs',
  // Précisions entre parenthèses
  'if rare': 'si rare', 'if very rare': 'si très rare', 'if common': 'si courant', common: 'courant', Common: 'courant', fail: "en cas d'échec",
  'good luck': 'chance', 'Any Season': 'toute saison', All: "toute l'année", Spring: 'printemps', Summer: 'été', Autumn: 'automne', Winter: 'hiver',
  House: 'maison', Boy: 'garçon', Girl: 'fille', Trick: 'farce', 'from Home': 'envoyé par Maman', shop: 'boutique', GBA: 'GBA', Jack: "Jacqu'O",
  Lighthouse: 'Phare', Ground: 'Au sol',
  January: 'janvier', February: 'février', March: 'mars', April: 'avril', May: 'mai', June: 'juin', July: 'juillet', August: 'août',
  September: 'septembre', October: 'octobre', November: 'novembre', December: 'décembre',
};
// Déjà en français (New Horizons) ou noms de marque : gardés tels quels, sans être signalés.
const TELS_QUELS = ['Boutique Nook', 'Concert de K.K.', 'Cuisine', 'Expertise des fossiles', 'Fabrication', 'DIY', 'Habitants', 'Hybridation',
  'Sachet de graines', 'Nook Shopping', 'posters', 'promotion', 'saisonnier', 'Djason', 'Gratien', 'Gullivarrr', 'Mantin', 'Pollux', 'Porcelette',
  'Rodrigue', 'Tiquette', 'Club LOL', 'Nintendo', 'Nintendo Zone', 'NookLink', 'SpotPass', 'WiiConnect24', 'DS Download Station'];
for (const t of TELS_QUELS) TERMES[t] = TERMES[t] || t;

// Livres de recettes et lots de réactions de New Horizons : titre gardé, précédé d'un mot français.
const TITRES_NH = {
  'Basic Cooking Recipes': 'Recettes', 'Be a Chef! DIY Recipes+': 'Recettes', 'Cozy Turkey Day DIY': 'Recettes', 'Custom Fencing in a Flash': 'Recettes',
  'DIY for Beginners': 'Recettes', 'Pretty Good Tools Recipes': 'Recettes', 'Test Your DIY Skills': 'Recettes', 'Turkey Day Recipes': 'Recettes',
  'Wildest Dreams DIY': 'Recettes', 'Hip Reaction Collection': 'Réactions', 'New Reactions Notebook': 'Réactions', 'Viva Festivale Reaction Set': 'Réactions',
};

// ---------- Noms propres (tableur New Leaf) ----------
function nomsPropres() {
  const res = {};
  const fichier = path.join(DOSSIER_SOURCES, 'nl', 'donnees.json');
  if (!fs.existsSync(fichier)) { console.log('⚠ sources/nl/donnees.json absent (lancer npm run donnees:nl) : noms propres non traduits.'); return res; }
  const d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  for (const x of [...(d.Villagers || []), ...(d.Characters || [])]) {
    const fr = x['Name (French EU)'];
    if (x.Name && fr && fr !== '-' && !res[x.Name]) res[x.Name] = fr;
  }
  // Variantes écrites autrement dans les sources.
  if (res.Shrunk) res['Dr. Shrunk'] = res.Shrunk;
  return res;
}

// ---------- Traduction d'un texte ----------
// Découpe au premier niveau (hors parenthèses) sur « , », « / » et « ; », en gardant les séparateurs.
function couper(s) {
  const morceaux = [];
  let p = 0, cur = '';
  const car = [...s];
  for (let i = 0; i < car.length; i++) {
    const ch = car[i];
    if (ch === '(') p++;
    if (ch === ')') p = Math.max(0, p - 1);
    // « 10,000,000 » : virgule des milliers, pas un séparateur.
    const milliers = ch === ',' && /\d/.test(car[i - 1] || '') && /\d/.test(car[i + 1] || '');
    if (p === 0 && !milliers && (ch === ',' || ch === '/' || ch === ';')) { morceaux.push(cur, ch); cur = ''; continue; }
    cur += ch;
  }
  morceaux.push(cur);
  return morceaux;
}

function creerTraducteur(dico, nomsPoissonsNh = new Map()) {
  const minuscules = new Map(Object.entries(dico).map(([k, v]) => [k.toLowerCase(), v]));
  const francais = new Set(Object.values(dico));
  const nombre = n => Number(String(n).replace(/,/g, '')).toLocaleString('fr-FR').replace(/ /g, ' ');
  const manquants = new Map();
  function morceau(t) {
    const brut = t.trim();
    if (!brut) return t;
    const garde = x => t.replace(brut, x);
    if (dico[brut] != null) return garde(dico[brut]);
    if (minuscules.has(brut.toLowerCase())) return garde(minuscules.get(brut.toLowerCase()));
    if (TITRES_NH[brut]) return garde(`${TITRES_NH[brut]} « ${brut} »`);
    let m;
    if ((m = /^fortune #(\d+)$/i.exec(brut))) return garde(`Biscuit chinois n° ${m[1]}`);
    if ((m = /^(\w+) ticket$/i.exec(brut))) return garde(`Ticket « ${m[1]} »`);
    if ((m = /^Catching an? (.+)$/i.exec(brut))) return garde(`En pêchant : ${nomsPoissonsNh.get(m[1].toLowerCase()) || m[1]}`);
    if ((m = /^Save ([\d,]+) Bells$/i.exec(brut))) return garde(`Économiser ${nombre(m[1])} clochettes`);
    if ((m = /^([\d,]+) (HRA|HHA) Points$/i.exec(brut))) return garde(`${nombre(m[1])} points ${m[2].toUpperCase()}`);
    if ((m = /^House (\d+)$/i.exec(brut))) return garde(`maison ${m[1]}`);
    if (/^Jingle or Home \(Dec\. 24th\)$/.test(brut)) return garde('Rodolphe ou Maman (24 décembre)');
    // « Nom (précision) » : on traduit les deux parties.
    if ((m = /^(.*?)\s*\((.*)\)$/.exec(brut)) && m[1]) return garde(`${texte(m[1])} (${texte(m[2])})`);
    // Parenthèse ouverte ou fermée seule (texte coupé par la source) : on traduit le reste.
    if ((m = /^(.*?)\s*\((.*)$/.exec(brut)) && m[1]) return garde(`${texte(m[1])} (${texte(m[2])}`);
    if ((m = /^(.*)\)$/.exec(brut))) return garde(`${texte(m[1])})`);
    // Déjà en français, nombre, ou inconnu : tel quel (les inconnus en anglais sont notés).
    // Un texte déjà traduit lors d'un passage précédent (« Biscuit chinois n° 1 », « Ticket « bang » ») n'est pas signalé.
    const dejaTraduit = /^(Biscuit chinois|Ticket «|Recettes «|Réactions «|En pêchant|Économiser|Tous les habitants|Visites|Chaussettes du|le lendemain|tours$|Bureau$|Happy Home Paradise$|New Leaf$)/.test(brut);
    if (/[A-Za-z]/.test(brut) && !/[àâçéèêëîïôûùüÿœæ]/i.test(brut) && !francais.has(brut) && !dejaTraduit) manquants.set(brut, (manquants.get(brut) || 0) + 1);
    return t;
  }
  function texte(s) {
    const res = couper(String(s)).map(x => (x === ',' || x === '/' || x === ';' ? x : morceau(x))).join('');
    // Une même précision répétée (« Happy Room Academy (HRA) (HRA) ») n'est gardée qu'une fois.
    return res.replace(/(\([^()]*\))(\s*\1)+/g, '$1');
  }
  return { texte, manquants };
}

// Une source coupée au milieu d'une parenthèse (« Gracie (fail » puis « common) ») est recollée.
function recoller(sources) {
  const ouvert = p => (p.match(/\(/g) || []).length > (p.match(/\)/g) || []).length;
  const res = [];
  for (const s of sources) {
    const prec = res[res.length - 1];
    if (prec != null && ouvert(prec)) res[res.length - 1] = `${prec}, ${s}`;
    else res.push(s);
  }
  return res;
}

function principal() {
  const dico = { ...nomsPropres(), ...TERMES };
  // Noms français des poissons de New Horizons (pour « Catching a sea bass »).
  const nomsPoissonsNh = new Map();
  const fPoissons = path.join(DOSSIER_DATA, 'nh', 'poissons.json');
  if (fs.existsSync(fPoissons)) for (const e of JSON.parse(fs.readFileSync(fPoissons, 'utf8'))) nomsPoissonsNh.set(e.nom.en.toLowerCase(), e.nom.fr);
  const { texte, manquants } = creerTraducteur(dico, nomsPoissonsNh);

  const jeux = JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, 'jeux.json'), 'utf8')).filter(j => j.disponible);
  let fichiers = 0, changes = 0;
  for (const j of jeux) {
    for (const c of j.categories) {
      const f = path.join(DOSSIER_DATA, j.id, `${c.id}.json`);
      if (!fs.existsSync(f)) continue;
      const liste = JSON.parse(fs.readFileSync(f, 'utf8'));
      let modifie = false;
      for (const e of liste) {
        if (!Array.isArray(e.sources) || !e.sources.length) continue;
        const fr = recoller(e.sources).map(texte);
        if (JSON.stringify(fr) !== JSON.stringify(e.sources)) { e.sources = fr; modifie = true; changes++; }
      }
      if (modifie) { fs.writeFileSync(f, JSON.stringify(liste, null, 1) + '\n'); fichiers++; }
    }
  }
  // Provenances du tableur des codes GameCube.
  const fCodes = path.join(DOSSIER_DATA, 'gc', 'codes.json');
  if (fs.existsSync(fCodes)) {
    const codes = JSON.parse(fs.readFileSync(fCodes, 'utf8'));
    let n = 0;
    for (const o of codes.objets) if (o.provenance) { const fr = texte(o.provenance); if (fr !== o.provenance) { o.provenance = fr; n++; } }
    if (n) { fs.writeFileSync(fCodes, JSON.stringify(codes, null, 1) + '\n'); console.log(`Codes GameCube : ${n} provenances traduites.`); }
  }
  console.log(`${changes} fiches traduites dans ${fichiers} fichiers.`);
  if (manquants.size) console.log(`Restés en anglais (${manquants.size}) : ${[...manquants.keys()].sort().join(' | ')}`);
}

if (require.main === module) principal();
module.exports = { creerTraducteur, couper, recoller, TERMES };
