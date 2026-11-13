// Génère les données d'Animal Crossing: Wild World (DS) dans data/ww/.
//
// Sources :
//  - Nookipedia (tables Cargo ww_*) : créatures, fossiles, meubles, vêtements…
//  - « Data Spreadsheet for Animal Crossing: Wild World » : noms français (créatures, musiques).
//  - Table ww_language_name : noms français des objets.
//
// Prix : la version européenne de Wild World n'a pas toujours les mêmes prix que l'américaine ;
// on affiche le prix européen, et l'américain en plus quand il est différent.
//
// Utilisation : npm run donnees:ww   (ajouter -- --maj pour tout retélécharger)
const fs = require('fs');
const path = require('path');
const { lireClasseurAvecCache } = require('./lib/xlsx');
const { tableCargo } = require('./lib/cargo');
const { DOSSIER_SOURCES, telecharger, majuscule, slug } = require('./lib/outils');
const { creatures, objets, dicoLangue, ecrireJeu, nommerGroupesFossiles } = require('./lib/ancien');

const TABLEUR = { fichier: path.join(DOSSIER_SOURCES, 'ww', 'ww.xlsx'), url: 'https://docs.google.com/spreadsheets/d/1aGEu_eoS3a-g_Tf--ewS0fLhyOHbNzpSc5jtaEE8nrA/export?format=xlsx' };
const TYPES_VETEMENTS = { Shirts: 'Hauts', Hats: 'Chapeaux', Helmets: 'Casques', Accessories: 'Accessoires', Umbrellas: 'Parapluies' };

async function main() {
  const maj = process.argv.includes('--maj');
  if (maj || !fs.existsSync(TABLEUR.fichier)) { console.log('Téléchargement de', TABLEUR.url); await telecharger(TABLEUR.url, TABLEUR.fichier); }
  const d = await lireClasseurAvecCache(TABLEUR.fichier);
  const c = async n => tableCargo(n, { maj });

  const langue = dicoLangue(await c('ww_language_name'));
  const frObjet = nom => langue.get(String(nom).toLowerCase()) || null;
  const parNom = onglet => new Map((d[onglet] || []).map(x => [String(x.Name).toLowerCase(), x]));
  // Modèles 3D des poissons de City Folk (tableur ACCF), pour remplacer les icônes 16 px de Wild World.
  const fichierCF = path.join(DOSSIER_SOURCES, 'cf', 'cf.xlsx');
  const cf = fs.existsSync(fichierCF) ? await lireClasseurAvecCache(fichierCF) : {};
  const modelesCF = new Map([...(cf.Fish || []), ...(cf.Bugs || [])].filter(x => x.Image).map(x => [String(x.Name).toLowerCase(), x.Image]));

  const optionsCreatures = onglet => {
    const tab = parNom(onglet);
    return {
      coupure: 15,
      frDe: nom => { const x = tab.get(nom.toLowerCase()); return (x && x['Name (French)']) || frObjet(nom); },
      // Les icônes de Wild World font 16 px : on prend une image plus grande.
      // Wild World n'a pas de modèle 3D lisible sur Nookipedia (pour les insectes, seulement la vitrine du musée) :
      // on prend celui de City Folk (même créature, mieux dessinée), sinon le petit sprite du jeu.
      complement: (l, e) => {
        const x = tab.get(String(l.name).toLowerCase());
        if (modelesCF.has(String(l.name).toLowerCase())) {
          e.image = modelesCF.get(String(l.name).toLowerCase());
          e.notes = [...(e.notes || []), "Image : modèle 3D de Let's Go to the City (Wild World n'a que de petites icônes)."];
        } else if (x && x.Sprite) e.image = x.Sprite;
      },
      prix: l => {
        const na = l.sell != null ? Number(l.sell) : null;
        const eu = l.sell_eu != null ? Number(l.sell_eu) : null;
        return { vente: eu ?? na, vente_na: na };
      },
    };
  };

  const cats = {};
  cats.insectes = creatures(await c('ww_bug'), optionsCreatures('Insects'));
  cats.poissons = creatures(await c('ww_fish'), optionsCreatures('Fish'));

  const fossilesTableur = parNom('Fossils');
  cats.fossiles = nommerGroupesFossiles(objets(await c('ww_fossil'), {
    nomEn: l => l.name,
    frDe: (l, nom) => { const x = fossilesTableur.get(nom.toLowerCase()); return (x && x['Name (French)']) || frObjet(nom); },
    complement: (l, e, av) => {
      if (l.fossil_group) {
        const fr = frObjet(l.fossil_group);
        e.groupe = { id: slug(l.fossil_group), fr: majuscule(fr || l.fossil_group), en: l.fossil_group };
        if (!fr) av.add('groupe');
      }
      e.musee = true;
    },
  }));

  // Art : dans Wild World, les tableaux sont des meubles (catégorie « Painting »).
  // Les faux existent mais sont identiques aux vrais : impossible de les distinguer.
  const meubles = await c('ww_furniture');
  cats.art = objets(meubles.filter(l => l.category === 'Painting'), {
    frDe: (l, nom) => frObjet(nom),
    complement: (l, e) => {
      e.sous = 'Tableau';
      e.faux = { image: null, indiscernable: true };
      e.notes = ["Dans ce jeu, Rounard vend des œuvres qui peuvent être vraies ou fausses au hasard, et rien ne permet de les distinguer à l'œil : on ne le découvre qu'en la proposant au musée."];
      e.musee = true;
    },
  });
  cats.meubles = objets(meubles.filter(l => l.category !== 'Painting'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier) });

  const interieur = await c('ww_interior');
  cats['papiers-peints'] = objets(interieur.filter(l => l.category === 'Wallpaper'), { frDe: (l, nom) => frObjet(nom) });
  cats.sols = objets(interieur.filter(l => l.category === 'Carpet'), { frDe: (l, nom) => frObjet(nom) });
  cats.vetements = objets(await c('ww_clothing'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier), sous: l => TYPES_VETEMENTS[l.type] || l.type });

  const musiques = parNom('Music');
  cats.kk = objets((await c('song')).filter(s => s.ww === '1'), {
    nomEn: l => l.name,
    nomEnParDefaut: true,
    frDe: (l, nom) => { const x = musiques.get(nom.toLowerCase()); return (x && x['Name (French)']) || frObjet(nom); },
    image: l => l.image_url,
  });

  cats.gyroides = objets(await c('ww_gyroid'), { frDe: (l, nom) => frObjet(nom) });
  cats.outils = objets((await c('ww_tool')).filter(l => l.type !== 'Umbrella'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier) });
  cats.photos = objets(await c('ww_photo'), { frDe: (l, nom) => frObjet(nom) || frObjet(l.identifier) });

  ecrireJeu('ww', cats, [
    { nom: 'Nookipedia', url: 'https://nookipedia.com' },
    { nom: 'Data Spreadsheet for Animal Crossing: Wild World', url: 'https://nookipedia.com/wiki/Community:ACWW_Spreadsheet' },
  ]);
}

main().catch(err => { console.error(err); process.exit(1); });
