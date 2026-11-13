// Génère les données d'Animal Crossing (GameCube) dans data/gc/.
//
// Le jeu existe en plusieurs versions : Dōbutsu no Mori (N64, Japon), Dōbutsu no Mori+ (GameCube, Japon),
// Animal Crossing (GameCube, Amérique et Europe) et Dōbutsu no Mori e+ (GameCube, Japon).
// On suit la version Animal Crossing (celle jouée en France) ; chaque élément indique dans quelles
// versions il existe, et les ajouts propres aux versions japonaises sont résumés dans _infos.json.
//
// Sources :
//  - Nookipedia (tables Cargo pg_* = « Population Growing », nom de travail du jeu)
//  - « Data Spreadsheet for Animal Crossing (GCN) » : noms français, papiers peints, sols,
//    et 2e source (dates précises) pour les mois des créatures.
//
// Utilisation : npm run donnees:gc   (ajouter -- --maj pour tout retélécharger)
const fs = require('fs');
const path = require('path');
const { lireClasseurAvecCache } = require('./lib/xlsx');
const { tableCargo } = require('./lib/cargo');
const { DOSSIER_SOURCES, telecharger, majuscule, slug } = require('./lib/outils');
const { creatures, objets, dicoTableur, moisDepuisTexte, ecrireJeu, nommerGroupesFossiles, affinerAvecDates } = require('./lib/ancien');

const TABLEUR = { fichier: path.join(DOSSIER_SOURCES, 'gc', 'gc.xlsx'), url: 'https://docs.google.com/spreadsheets/d/13sRAcj9YbP9_i-u0Kg6S7ycHbaOQx1jFG4lYLm2DJ4c/export?format=xlsx' };

const VERSIONS = [
  ['in_dnm', 'Dōbutsu no Mori (N64)'],
  ['in_plus', 'Dōbutsu no Mori+'],
  ['in_pg', 'Animal Crossing'],
  ['in_e_plus', 'Dōbutsu no Mori e+'],
];
const versionsDe = l => VERSIONS.filter(([k]) => l[k] === '1').map(([, nom]) => nom);
const dansAC = l => l.in_pg === '1';

async function main() {
  const maj = process.argv.includes('--maj');
  if (maj || !fs.existsSync(TABLEUR.fichier)) { console.log('Téléchargement de', TABLEUR.url); await telecharger(TABLEUR.url, TABLEUR.fichier); }
  const d = await lireClasseurAvecCache(TABLEUR.fichier);
  const c = async n => tableCargo(n, { maj });

  // Noms français : onglet « Items » du tableur (version européenne du jeu).
  const items = dicoTableur(d.Items, 'Name (English)', ['Name (French)']);
  const frObjet = nom => items.get(String(nom).toLowerCase()) || null;
  const parNom = onglet => new Map((d[onglet] || []).map(x => [String(x.Name || x['Name (English)']).toLowerCase(), x]));

  const optionsCreatures = onglet => {
    const tab = parNom(onglet);
    return {
      coupure: 15,
      filtre: dansAC,
      frDe: nom => { const x = tab.get(nom.toLowerCase()); return (x && x['Name (French)']) || frObjet(nom); },
      // Le tableur (données extraites du jeu) donne des dates exactes : on s'en sert pour affiner.
      ajusterPeriodes: (l, periodes) => { const x = tab.get(String(l.name).toLowerCase()); return x ? affinerAvecDates(periodes, x.Availability) : periodes; },
      controle: l => {
        const x = tab.get(String(l.name).toLowerCase());
        const mois = x && moisDepuisTexte(x.Availability);
        return mois ? { mois, source: `Tableur ACGC (${x.Availability})` } : null;
      },
      complement: (l, e, av) => {
        e.versions = versionsDe(l);
        if (l.on_animal_island === '1') (e.conditions = e.conditions || []).push('ile-des-animaux');
        // Le cafard : les sources se contredisaient (toute l'année / mars à novembre). Le code du jeu
        // (tables l_insect_m3 à l_insect_m11 de ac_set_ovl_insect.c) le fait apparaître dehors de mars
        // à novembre, dans les 6 tranches horaires ; ceux « toute l'année » sont ceux de la maison (m_cockroach.c).
        if (String(l.name).toLowerCase() === 'cockroach') {
          e.dispo = { tous: [{ mois: [3, 4, 5, 6, 7, 8, 9, 10, 11], heures: [[0, 24]] }] };
          e.notes = ["D'après le code du jeu : dehors de mars à novembre, à toute heure.",
            "Des cafards peuvent aussi apparaître dans ta maison quand tu n'y es pas allé depuis longtemps, quel que soit le mois : ce sont ceux qu'on trouve « toute l'année »."];
          av.delete('mois');
        }
      },
    };
  };

  const cats = {};
  const insectes = await c('pg_bug');
  const poissons = await c('pg_fish');
  cats.insectes = creatures(insectes, optionsCreatures('Insects (AC)'));
  cats.poissons = creatures(poissons, optionsCreatures('Fish (AC)'));

  cats.fossiles = nommerGroupesFossiles(objets(await c('pg_fossil'), {
    nomEn: l => l.name,
    frDe: (l, nom) => frObjet(nom),
    complement: (l, e, av) => {
      if (l.fossil_group) {
        const fr = frObjet(l.fossil_group);
        e.groupe = { id: slug(l.fossil_group), fr: majuscule(fr || l.fossil_group), en: l.fossil_group };
        if (!fr) av.add('groupe');
      }
      e.musee = true;
    },
  }));

  // Art : les faux existent mais sont identiques aux vrais (impossible de les distinguer).
  cats.art = objets((await c('pg_art')).filter(dansAC), {
    nomEn: l => l.name,
    frDe: (l, nom) => frObjet(nom),
    complement: (l, e) => {
      e.sous = 'Tableau';
      e.faux = { image: null, indiscernable: true };
      e.notes = ["Dans ce jeu, Rounard vend des œuvres qui peuvent être vraies ou fausses au hasard, et rien ne permet de les distinguer à l'œil : on ne le découvre qu'en la proposant au musée."];
      if (l.art_name) e.oeuvre = { titre: l.art_name, artiste: l.author || '' };
      e.prix = { achat: l.buy_price ? Number(l.buy_price) : null, vente: l.sell ? Number(l.sell) : null };
      e.versions = versionsDe(l);
      e.musee = true;
    },
  });

  cats.meubles = objets((await c('pg_furniture')).filter(dansAC), {
    frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier),
    image: l => l.image_pg || l.image,
    complement: (l, e) => { e.versions = versionsDe(l); },
  });

  // Papiers peints et sols : depuis le tableur (pas de table Nookipedia pour ce jeu).
  const depuisTableur = onglet => objets(d[onglet] || [], {
    nomEn: l => l['Name (English)'],
    frDe: l => l['Name (French)'] || null,
    // Sans image dans le tableur : on utilise la texture de Nookipedia (« Classic Wall PG Texture.png »).
    image: l => l['Indoor Image (AC)'] || l['Texture (AC)'] || l['Inventory Icon (AC)']
      || `${String(l['Name (English)']).replace(/w/g, x => x.toUpperCase())} PG Texture.png`,
    complement: (l, e) => {
      e.prix = { achat: Number(l['Buy Price (AC)']) || null, vente: Number(l['Sell Price (AC)']) || null };
      if (l['Source (AC)']) e.sources = [String(l['Source (AC)'])];
    },
  });
  cats['papiers-peints'] = depuisTableur('Wallpaper (AC)');
  cats.sols = depuisTableur('Carpet (AC)');

  cats.vetements = objets((await c('pg_clothing')).filter(dansAC), {
    frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier),
    complement: (l, e) => { e.versions = versionsDe(l); },
  });

  const musiques = parNom('Music (AC)');
  cats.kk = objets((await c('song')).filter(s => s.ac === '1'), {
    nomEn: l => l.name,
    nomEnParDefaut: true,
    frDe: (l, nom) => { const x = musiques.get(nom.toLowerCase()); return (x && x['Name (French)']) || frObjet(nom); },
    image: l => { const x = musiques.get(String(l.name).toLowerCase()); return (x && x['Indoor Image (AC)']) || l.image_url; },
  });

  cats.gyroides = objets(await c('pg_gyroid'), { frDe: (l, nom) => frObjet(nom) });

  // Ce que les versions japonaises ont en plus (pour information).
  const enPlus = liste => liste.filter(l => l.in_pg !== '1' && l.in_e_plus === '1').map(l => l.name);
  const notesJp = {
    insectes_e_plus: enPlus(insectes),
    poissons_e_plus: enPlus(poissons),
  };

  ecrireJeu('gc', cats, [
    { nom: 'Nookipedia', url: 'https://nookipedia.com' },
    { nom: 'Data Spreadsheet for Animal Crossing (GCN)', url: 'https://nookipedia.com/wiki/Community:ACGC_Spreadsheet' },
  ]);
  const { ecrireJson } = require('./lib/outils');
  const infos = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'gc', '_infos.json'), 'utf8'));
  const note = 'Nook Dex suit la version européenne (Animal Crossing). La version japonaise Dōbutsu no Mori e+ '
    + `a ${notesJp.insectes_e_plus.length} insectes et ${notesJp.poissons_e_plus.length} poissons en plus (${[...notesJp.insectes_e_plus, ...notesJp.poissons_e_plus].join(', ')}). `
    + "Chaque fiche indique dans quelles versions l'élément existe.";
  ecrireJson('gc/_infos.json', { ...infos, note, versions_japonaises: notesJp });
  console.log(`\nVersions japonaises : e+ ajoute ${notesJp.insectes_e_plus.length} insectes et ${notesJp.poissons_e_plus.length} poissons.`);
}

main().catch(err => { console.error(err); process.exit(1); });
