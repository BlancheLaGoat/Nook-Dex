# Nook Dex

Suivi de collection pour les jeux **Animal Crossing** (application Windows et Android, en français).

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
src/shared/profil.js   vérification des profils et des réglages (commune au PC et à Android)
mobile/                version Android (voir plus bas)
src/renderer/          l'interface
  app.js               en-tête, menu, navigation
  vues/                tableau de bord, collection, fiche, profils et réglages
  lib/dispo.js         « disponible maintenant », mois, heures, part bientôt
  lib/filtres.js       recherche, filtres, tri, progression
  lib/sauvegarde-gc.js lecture des sauvegardes du GameCube (.gci, carte .raw) — jamais d'écriture
  lib/sauvegarde-ww.js lecture des sauvegardes de Wild World (.sav, .dsv) — jamais d'écriture
  lib/sauvegarde-cf.js lecture des sauvegardes de City Folk (RVFOREST.DAT, navets compris) — jamais d'écriture
  lib/sauvegarde-nl.js lecture des sauvegardes de New Leaf (garden_plus.dat) — jamais d'écriture
  lib/sauvegarde-nh.js déchiffrement et lecture des sauvegardes de New Horizons 3.0 — jamais d'écriture
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

- Fleurs hybrides de City Folk : table des croisements lue dans le programme du jeu (`main.dol` de la version
  américaine Rev 1) par `npm run donnees:fleurs-cf -- chemin/vers/main.dol`, qui fabrique `data/cf/fleurs-regles.json`.
  Le programme n'est pas inclus dans le dépôt : il se sort de son propre disque avec Dolphin.

- Navets de New Horizons : algorithme du jeu publié par Ninji (Treeki),
  [TurnipPrices.cpp](https://gist.github.com/Treeki/85be14d297c80c8b3c0a76375743325b).
  Le prédicteur de Nook Dex est réécrit à partir de cet algorithme (aucun code repris d'un autre prédicteur).

- Navets du GameCube : code du jeu décompilé par le projet [ac-decomp](https://github.com/ACreTeam/ac-decomp)
  (m_kabu_manager.c, licence CC0) ; calcul réécrit pour Nook Dex.

- Import des sauvegardes du GameCube : format lu d'après ac-decomp (m_card.c, m_flashrom.c, m_private.h,
  m_museum_display.h, m_shop.c, licence CC0). `npm run donnees:sauvegarde-gc` fabrique la table
  `data/gc/sauvegarde.json` (numéros de la sauvegarde -> fiches du dex). Lecture vérifiée sur les villes
  neuves de [ac-exploit-gc](https://github.com/FIX94/ac-exploit-gc) (versions US, EU, AUS ; non incluses
  dans le dépôt). La version japonaise n'est pas prise en charge.

- Import des sauvegardes de Wild World : organisation de la sauvegarde d'après [ACSE](https://github.com/Cuyler36/ACSE)
  (Cuyler36, licence MIT) et la documentation de [Leaflet](https://github.com/oddnebula/leaflet-wild-world)
  (oddnebula, licence MIT) ; liste des objets : `WW_Items_en.txt` d'ACSE, téléchargée dans `sources/ww/` par
  `npm run donnees:sauvegarde-ww`, qui fabrique `data/ww/sauvegarde.json`. Code écrit pour Nook Dex.

- Import des sauvegardes de City Folk : organisation de `RVFOREST.DAT` d'après [ACSE](https://github.com/Cuyler36/ACSE)
  (Cuyler36, licence MIT) et les positions d'[actoolkit-linux](https://github.com/imcynic/actoolkit-linux) (faits seulement) ;
  liste des objets : `CF_Items_en.txt` d'ACSE, téléchargée dans `sources/cf/` par `npm run donnees:sauvegarde-cf`,
  qui fabrique `data/cf/sauvegarde.json`. Lecture vérifiée sur trois sauvegardes de l'archive WiiSave.com (MarioCube),
  non incluses dans le dépôt. Code écrit pour Nook Dex.

- Import des sauvegardes de New Leaf - Welcome amiibo : organisation de `garden_plus.dat` d'après
  [ACNL_Research](https://github.com/Slattz/ACNL_Research) (Slattz), [acnl-research](https://github.com/Le0X8/acnl-research)
  (Le0X8, MIT) et l'ordre du musée du plugin [Vapecord](https://github.com/RedShyGuy/Vapecord-ACNL-Plugin) (RedShyGuy) ;
  liste des objets : `Items_WA.txt` de Slattz, téléchargée dans `sources/nl/` par `npm run donnees:sauvegarde-nl`.
  Lecture vérifiée sur deux vraies villes de Le0X8 (non incluses dans le dépôt).

- Import des sauvegardes de New Horizons (3.0) : chiffrement, version, sommes Murmur3 et emplacements d'après
  [NHSE](https://github.com/kwsch/NHSE) (kwsch) ; numéros internes : colonnes « Internal ID » du tableur ACNH
  (`npm run donnees:sauvegarde-nh`, après `npm run donnees:nh`). Seuls les faits sont repris : le code est écrit pour
  Nook Dex. À vérifier sur une vraie sauvegarde.

## Publier une nouvelle version

1. Changer `"version"` dans `package.json` (par ex. `1.0.0` → `1.1.0`).
2. Faire un commit et un push sur `main` (par ex. avec GitHub Desktop).

C'est tout : GitHub Actions (onglet **Actions** du dépôt) compile l'installateur et publie la release `v1.1.0`
avec son tag. Si la version n'a pas changé, le push ne publie rien.
Les personnes qui ont Nook Dex installé reçoivent la mise à jour automatiquement (téléchargée en arrière-plan,
installée à la fermeture de l'appli). Leur progression n'est jamais touchée.

Pour tester l'installateur sans publier : `npm run dist` (il est créé dans `dist/`).

## Version Android

L'appli Android est la **même interface** (`src/renderer`), emballée avec [Capacitor](https://capacitorjs.com/).
Seul le « pont » change : `mobile/src/mobile.js` remplace `src/preload.js` + `src/main.js`.

```
mobile/src/mobile.js           pont Android : données livrées dans l'appli, profils dans le stockage de l'appli,
                               sélecteur de fichiers, exports dans Documents/Nook Dex, mises à jour par GitHub / Obtainium
mobile/src/mobile.css          adaptations à l'écran d'un téléphone (menu en tiroir, fenêtres en plein écran…)
mobile/src/zip.js              lecture des .zip (sauvegarde New Horizons : le téléphone ne sait pas choisir un dossier)
mobile/scripts/prepare-www.js  copie l'interface, les données et le pont dans mobile/www
mobile/scripts/patch-android.js version, Obtainium, icône et écran de démarrage du projet Android
```

- **Construire l'APK** : c'est GitHub Actions qui le fait, à chaque nouvelle version (`.github/workflows/release.yml`) ;
  il est joint à la release sous le nom `Nook-Dex-Android.apk`. Pour préparer le projet à la main :
  `cd mobile`, `npm install`, `npm run android` (il faut ensuite Android Studio pour compiler).
- **Signature** : l'APK est signé avec la clé rangée dans les secrets du dépôt `ANDROID_KEYSTORE` (le fichier `.jks`
  encodé en base64) et `ANDROID_KEYSTORE_PASSWORD`. Toujours la même clé, sinon le téléphone refuse la mise à jour.
  Sans ces secrets, la version Windows est quand même publiée ; seul l'APK manque.
- **Installer et mettre à jour** : dans [Obtainium](https://github.com/ImranR98/Obtainium), ajouter
  `https://github.com/BlancheLaGoat/Nook-Dex`. L'appli vérifie aussi elle-même s'il existe une version plus récente.
- **Tester l'interface « téléphone » sur le PC** : `node mobile/scripts/prepare-www.js`, puis ouvrir `mobile/www`
  avec un petit serveur local dans un navigateur en taille téléphone (sans Capacitor, les profils vont dans localStorage).

## Synchro en ligne

Le PC et le téléphone synchronisent leurs profils par internet (Réglages → Synchro en ligne), sans compte :
un **code de synchro** relie les appareils, et les profils sont compressés puis **chiffrés sur l'appareil** (AES-GCM)
avec une clé tirée du code.

- **Serveur** : celui de Coffre, réutilisé tel quel (`https://coffre-sync.ixaglax.workers.dev`, dépôt Coffre,
  `cloud/worker.js` + base D1). Il garde un bloc chiffré par identifiant et ne peut pas le lire. Nook Dex tire son
  identifiant et sa clé du code avec le préfixe `nookdex-` (Coffre : `coffre-`) : les deux applis ne se mélangent jamais.
  L'adresse est dans `src/renderer/lib/synchro.js` (`URL_SERVEUR`) et dans la politique de sécurité (CSP) de
  `src/renderer/index.html` et `mobile/scripts/prepare-www.js`.
- **Fusion à trois** (`src/renderer/lib/synchro.js`) : chaque appareil garde la dernière version synchronisée (« base »,
  dans `synchro.json`, jamais exporté). Pour chaque coche et chaque réglage d'un profil, ce que l'appareil a changé
  depuis la base gagne ; sinon on prend la version en ligne. Décochages et suppressions se propagent ainsi.
- **Côté appli** (`src/renderer/vues/synchro.js`) : quand synchroniser, mise à jour du profil ouvert (une coche faite
  pendant la synchro est gardée), et la section des réglages.

