# Nook Dex

Suivi de collection pour les jeux **Animal Crossing** (application Windows, en français).

> Projet de fan, non officiel. Animal Crossing et toutes les images du jeu appartiennent à Nintendo.

## Lancer l'appli en mode test

Double-clique sur **`lancer.bat`** (il installe ce qu'il faut la première fois).
Ou, dans un terminal : `npm install` puis `npm start`.

## Où sont mes données ?

| Quoi | Où | Touché par les mises à jour ? |
|---|---|---|
| Données des jeux (poissons, meubles…) | `data/` dans l'appli | Oui, remplacées à chaque version |
| **Ta progression** (profils) | `%AppData%\Nook Dex\profils\` | **Jamais** |
| Copies de secours automatiques (10 dernières) | `%AppData%\Nook Dex\sauvegardes\` | Jamais |
| Profils supprimés | `%AppData%\Nook Dex\corbeille\` | Jamais |
| Images téléchargées | `%AppData%\Nook Dex\images\` | Jamais |

Tes coches sont rattachées à un identifiant fixe (basé sur le nom anglais), jamais au nom affiché :
corriger un nom français ne fait rien perdre.

## Organisation du code

```
src/main.js            fenêtre, sauvegarde des profils, cache des images, mises à jour
src/preload.js         pont sécurisé entre l'interface et main.js
src/renderer/          l'interface
  app.js               en-tête, menu, navigation
  vues/                tableau de bord, collection, fiche, profils et réglages
  lib/dispo.js         « disponible maintenant », mois, heures, part bientôt
  lib/filtres.js       recherche, filtres, tri, progression
data/jeux.json         liste des jeux, catégories, extensions
data/<jeu>/<cat>.json  les éléments d'une catégorie d'un jeu
scripts/               scripts qui fabriquent data/ à partir des sources
tests/                 tests automatiques (npm test)
```

## Mettre à jour les données

```
npm run donnees               # régénère tous les jeux puis vérifie
npm run donnees:nh -- --maj   # retélécharge les sources de New Horizons et régénère data/nh/
npm run donnees:nl            # New Leaf (idem : cf = City Folk, ww = Wild World, gc = GameCube)
npm run verifier              # contrôle les fichiers générés
npm test                      # tests automatiques
```

Pour les anciens jeux, les mois des créatures viennent de Nookipedia et sont comparés à une 2e source
(tableur du jeu, ou taux d'apparition tirés du code pour City Folk). Si elles ne sont pas d'accord,
l'élément est marqué « à vérifier » avec le détail dans sa fiche. Pour le GameCube, les dates exactes du
tableur (ex. « du 24 février ») servent à affiner les périodes.

Les fichiers téléchargés sont gardés dans `sources/` (non envoyé sur GitHub).

### Format d'un élément (exemple : un poisson)

```json
{
  "id": "catfish",
  "nom": { "fr": "Poisson-chat", "en": "Catfish" },
  "image": "https://…",
  "lieu": "etang", "lieu_texte": "Étang",
  "ombre": "4",
  "dispo": {
    "nord": [ { "mois": [5,6,7,8,9,10], "heures": [[16, 9]] } ],
    "sud":  [ { "mois": [11,12,1,2,3,4], "heures": [[16, 9]] } ]
  },
  "conditions": [],
  "prix": { "vente": 800, "special": { "prix": 1200, "acheteur": "Djason" } },
  "musee": true,
  "a_verifier": []
}
```

- `heures: [[16, 9]]` = de 16 h à 9 h (passe minuit) ; `[[0, 24]]` = toute la journée.
- Jeux sans hémisphères : `"dispo": { "tous": [ … ] }`.
- `a_verifier` liste les informations incertaines : l'appli affiche un badge « à vérifier ».
- `ext: "hhp"` / `ext: "wa"` = élément de Happy Home Paradise / de la mise à jour Welcome amiibo (caché si l'extension n'est pas cochée dans le profil).
- Anciens jeux : une période peut avoir des jours précis, `{ "mois": [9], "jours": [1, 15], … }` (août et septembre sont coupés en deux).
- `versions` (GameCube) : versions du jeu où l'élément existe (Dōbutsu no Mori, +, e+…).

## Sources

- New Leaf, City Folk, Wild World, GameCube : [Nookipedia](https://nookipedia.com) (tables Cargo) et les tableurs communautaires
  [ACNL](https://nookipedia.com/wiki/Community:ACNL_Spreadsheet), [ACCF](https://nookipedia.com/wiki/Community:ACCF_Spreadsheet),
  [ACWW](https://nookipedia.com/wiki/Community:ACWW_Spreadsheet), [ACGC](https://nookipedia.com/wiki/Community:ACGC_Spreadsheet).

- New Horizons : [Data Spreadsheet for Animal Crossing New Horizons](https://tinyurl.com/acnh-sheet)
  et [ACNH String Translations](https://docs.google.com/spreadsheets/d/1MMbsvDfu59OY9YBEAfHhFJ6O8vRTllNFgMrX7RBZuyI)
  (communauté ACNH Spreadsheet), [Nookipedia](https://nookipedia.com).

- Rareté de New Horizons : paramètres du jeu extraits par Ninji (version 1.4.0), via les tableurs
  « ACNH Fish / Bug / Sea Creatures Spawns » d'asteriation ([acnh.isomorphicbox.com](https://acnh.isomorphicbox.com/)).

- Fleurs hybrides de New Horizons : génétique extraite du jeu par Aeter
  ([guide des fleurs](https://aiterusawato.github.io/satogu/acnh/flowers/genotypes.html)) ; seuls les faits du jeu sont repris.

- Navets de New Horizons : algorithme du jeu publié par Ninji (Treeki),
  [TurnipPrices.cpp](https://gist.github.com/Treeki/85be14d297c80c8b3c0a76375743325b).
  Le prédicteur de Nook Dex est réécrit à partir de cet algorithme (aucun code repris d'un autre prédicteur).

## Publier une nouvelle version

1. Changer `"version"` dans `package.json` (par ex. `1.0.0` → `1.1.0`).
2. Faire un commit et un push sur `main` (par ex. avec GitHub Desktop).

C'est tout : GitHub Actions (onglet **Actions** du dépôt) compile l'installateur et publie la release `v1.1.0`
avec son tag. Si la version n'a pas changé, le push ne publie rien.
Les personnes qui ont Nook Dex installé reçoivent la mise à jour automatiquement (téléchargée en arrière-plan,
installée à la fermeture de l'appli). Leur progression n'est jamais touchée.

Pour tester l'installateur sans publier : `npm run dist` (il est créé dans `dist/`).
