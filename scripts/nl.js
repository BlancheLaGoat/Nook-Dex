// Génère les données d'Animal Crossing: New Leaf (+ Welcome amiibo) dans data/nl/.
//
// Sources :
//  - Nookipedia (tables Cargo nl_*) : créatures, fossiles, art, meubles, vêtements…
//  - « Data Spreadsheet for Animal Crossing: New Leaf » : noms français des créatures et des musiques,
//    images des meubles, et 2e source pour vérifier les mois des créatures.
//  - « ACNL Translation Sheet » et table nl_language_name : noms français des objets.
//
// Les objets ajoutés par la mise à jour Welcome amiibo (version 1.4) sont marqués ext: "wa".
//
// Utilisation : npm run donnees:nl   (ajouter -- --maj pour tout retélécharger)
const fs = require('fs');
const path = require('path');
const { lireClasseurAvecCache } = require('./lib/xlsx');
const { tableCargo } = require('./lib/cargo');
const { DOSSIER_SOURCES, telecharger, majuscule, slug } = require('./lib/outils');
const { creatures, objets, dicoLangue, dicoTableur, moisDepuisTexte, ecrireJeu, nommerGroupesFossiles, imageWiki } = require('./lib/ancien');

const TABLEURS = {
  donnees: { fichier: path.join(DOSSIER_SOURCES, 'nl', 'donnees.xlsx'), url: 'https://docs.google.com/spreadsheets/d/1pMPl6_5c2C5HQK3pMdRbGH2FU7ZOpthrHrkluY9PoLg/export?format=xlsx' },
  traductions: { fichier: path.join(DOSSIER_SOURCES, 'nl', 'traductions.xlsx'), url: 'https://docs.google.com/spreadsheets/d/1ENPBD60Qaojcl0yyPSQWHL7vbsI2SqDcPpVrGtQ2xOk/export?format=xlsx' },
};

const CATEGORIES_VETEMENTS = {
  Tops: 'Hauts', Shirt: 'Hauts', Bottoms: 'Bas', Dresses: 'Robes', Dress: 'Robes', Headwear: 'Couvre-chefs', Hats: 'Chapeaux',
  Helmets: 'Casques', Accessories: 'Accessoires', Socks: 'Chaussettes', Shoes: 'Chaussures', Umbrellas: 'Parapluies', 'Wet suits': 'Combinaisons',
};

async function main() {
  const maj = process.argv.includes('--maj');
  for (const s of Object.values(TABLEURS)) if (maj || !fs.existsSync(s.fichier)) { console.log('Téléchargement de', s.url); await telecharger(s.url, s.fichier); }
  const d = await lireClasseurAvecCache(TABLEURS.donnees.fichier);
  const t = await lireClasseurAvecCache(TABLEURS.traductions.fichier);
  const c = async n => tableCargo(n, { maj });

  // Noms français : table Nookipedia, puis feuille de traductions (onglet Item).
  const langue = dicoLangue(await c('nl_language_name'));
  const feuilleTrad = dicoTableur(t.Item, 'English (US)', ['French (EU)', 'French (US)']);
  const frObjet = nom => langue.get(String(nom).toLowerCase()) || feuilleTrad.get(String(nom).toLowerCase()) || null;

  // Créatures : noms français et mois d'après le tableur (2e source).
  const COLS_FR = ['Name (French EU)', 'Name (French)', 'Name (French NA)'];
  const infosTableur = onglet => {
    const m = new Map();
    for (const x of d[onglet] || []) m.set(String(x.Name).toLowerCase(), x);
    return m;
  };
  const optionsCreatures = (onglet) => {
    const tab = infosTableur(onglet);
    return {
      coupure: 15,
      frDe: nom => { const x = tab.get(nom.toLowerCase()); return (x && COLS_FR.map(k => x[k]).find(v => v && v !== '-')) || frObjet(nom); },
      controle: l => {
        const x = tab.get(String(l.name).toLowerCase());
        const mois = x && moisDepuisTexte(x.Availability);
        return mois ? { mois, source: 'Tableur ACNL' } : null;
      },
      prix: l => ({ vente: l.sell != null ? Number(l.sell) : null }),
      complement: (l, e) => {
        // Image 3D (128 px) plutôt que la petite icône pixélisée.
        const x = tab.get(String(l.name).toLowerCase());
        if (x && x.Image) e.image = x.Image;
        if (l.on_tortimer_island === '1' && !/Tortimer/.test(l.location || '')) (e.conditions = e.conditions || []).push('ile-tortimer');
        if (/Tortimer/.test(l.location || '')) (e.conditions = e.conditions || []).push('seulement-ile');
      },
    };
  };

  const cats = {};
  cats.insectes = creatures(await c('nl_bug'), optionsCreatures('Bugs'));
  cats.poissons = creatures(await c('nl_fish'), optionsCreatures('Fish'));
  const optMer = optionsCreatures('Sea Creatures');
  cats['creatures-marines'] = creatures(await c('nl_sea_creature'), {
    ...optMer,
    complement: (l, e, av) => { optMer.complement(l, e, av); e.lieu = 'mer-plongee'; e.lieu_texte = 'En mer (plongée)'; av.delete('lieu'); },
  });

  // Fossiles (avec leurs groupes : crâne, torse, queue…)
  cats.fossiles = nommerGroupesFossiles(objets(await c('nl_fossil'), {
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

  // Œuvres d'art (vraies et fausses)
  cats.art = objets(await c('nl_art'), {
    nomEn: l => l.name,
    frDe: (l, nom) => frObjet(nom),
    complement: (l, e) => {
      e.oeuvre = { titre: l.art_name, artiste: [l.author, l.year].filter(Boolean).join(', ') };
      e.sous = /statue/i.test(l.name) ? 'Statue' : 'Tableau';
      e.faux = l.has_fake === '1' ? { image: l.fake_image_url } : null;
      e.prix = { achat: l.buy_price ? Number(l.buy_price) : null, vente: l.sell ? Number(l.sell) : null };
      e.musee = true;
    },
  });

  // Meubles : images prises dans le tableur (la table Nookipedia n'en a pas).
  const imagesMeubles = new Map((d.Furniture || []).map(x => [String(x.Name).toLowerCase(), x.Image]));
  const wa = l => (l.version_added === '1.4' ? 'wa' : undefined);
  cats.meubles = objets((await c('nl_furniture')).filter(l => l.category !== 'Art' && !/(fake)/i.test(l.en_name || '')), {
    frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier),
    // Sinon, on devine le nom du fichier image sur Nookipedia (« Nom_NL_Model.png »).
    image: l => imagesMeubles.get(String(l.en_name).toLowerCase()) || imagesMeubles.get(String(l.identifier).toLowerCase()) || `${l.identifier || l.en_name} NL Model.png`,
    complement: (l, e) => { if (wa(l)) e.ext = 'wa'; },
  });

  const interieur = await c('nl_interior');
  cats['papiers-peints'] = objets(interieur.filter(l => l.category === 'Wallpaper'), { frDe: (l, nom) => frObjet(nom), complement: (l, e) => { if (wa(l)) e.ext = 'wa'; } });
  cats.sols = objets(interieur.filter(l => l.category === 'Carpet'), { frDe: (l, nom) => frObjet(nom), complement: (l, e) => { if (wa(l)) e.ext = 'wa'; } });

  cats.vetements = objets(await c('nl_clothing'), {
    frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier),
    sous: l => CATEGORIES_VETEMENTS[l.clothing_category] || l.clothing_category,
    complement: (l, e) => { if (wa(l)) e.ext = 'wa'; },
  });

  // Morceaux de K.K. : liste Nookipedia, noms français et pochettes d'après le tableur.
  const musiques = new Map((d.Music || []).map(x => [String(x.Name).toLowerCase(), x]));
  cats.kk = objets((await c('song')).filter(s => s.nl === '1'), {
    nomEn: l => l.name,
    nomEnParDefaut: true,
    frDe: (l, nom) => {
      const x = musiques.get(nom.toLowerCase());
      if (!x) return frObjet(nom);
      const fr = x['Name (French EU)'] || x['Name (French NA)'];
      // Erreur de saisie dans le tableur : un nom espagnol à la place du français -> « à vérifier ».
      if (fr && fr === x['Name (Spanish EU)'] && fr.toLowerCase() !== nom.toLowerCase()) return null;
      return fr || frObjet(nom);
    },
    image: l => { const x = musiques.get(String(l.name).toLowerCase()); return (x && x.Image) || l.image_url; },
    complement: (l, e) => { const x = musiques.get(String(l.name).toLowerCase()); if (x && x['Sell Price (Re-Tail)']) e.prix.vente = Number(x['Sell Price (Re-Tail)']) || null; },
  });

  cats.gyroides = objets(await c('nl_gyroid'), { frDe: (l, nom) => frObjet(nom), complement: (l, e) => { if (wa(l)) e.ext = 'wa'; } });
  cats.outils = objets(await c('nl_tool'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier) });
  cats.photos = objets(await c('nl_photo'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier), complement: (l, e) => { if (wa(l)) e.ext = 'wa'; } });

  ecrireJeu('nl', cats, [
    { nom: 'Nookipedia', url: 'https://nookipedia.com' },
    { nom: 'Data Spreadsheet for Animal Crossing: New Leaf', url: 'https://nookipedia.com/wiki/Community:ACNL_Spreadsheet' },
    { nom: 'ACNL Translation Sheet', url: 'https://nookipedia.com/wiki/Community:ACNL_Spreadsheet' },
  ]);
}

main().catch(err => { console.error(err); process.exit(1); });
