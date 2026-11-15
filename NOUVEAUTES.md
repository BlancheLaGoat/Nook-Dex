# Nouveautés de Nook Dex

Chaque version a sa partie, qui commence par « ## » suivi du numéro de version.
Ce texte s'affiche dans l'appli (fenêtre « Quoi de neuf ? ») et sur la page de la version sur GitHub.

## 1.4.0

### 🏪 Magasin de Nook (Wild World) : le stock de chaque jour, à l'avance
Chaque matin, Nook tire son stock avec un hasard qui dépend **de la date et de ta ville** : une même date donne toujours les mêmes objets. Nook Dex refait maintenant ce calcul, tiré du **code du jeu** (décompilé par le projet acww-decomp).
- **Lis ta sauvegarde** (.sav ou .dsv) : Nook Dex retrouve **à l'identique** le stock qu'elle contient (vérifié : 37 objets sur 37), et en déduit les réglages de ta ville.
- **Le stock de n'importe quel jour** : outils, meubles, papiers peints, moquettes, papeterie, graines, pousses… avec leurs images, et ✓ pour ce que tu as déjà.
- **Quand Nook vendra…** : cherche un objet par son nom pour voir ses prochaines dates de vente, et la liste de **tout ce qui te manque, dans l'ordre où Nook le vendra** sur l'année.
- Certains objets sont marqués « ? » : ils dépendent du feng shui de ta maison, que Nook Dex ne peut pas fixer exactement à partir d'un seul jour. Relis ta sauvegarde un autre jour pour affiner. Si tu agrandis le magasin ou redécores ta maison, relis-la aussi.

## 1.3.3

### 🌷 Fleurs hybrides : lues dans le code des jeux
- Les croisements de **Wild World** viennent maintenant de la **table du jeu** : les 99 couples possibles, avec la **chance de chaque enfant**. Par exemple, rose rouge × rouge : 80 % rouge, 20 % noire ; rose violette × noire : 40 % violette, 40 % noire, **20 % bleue**.
- **Croisement** affiche les pourcentages ; dans le **Champ**, chaque case se colore à la mesure des chances, avec la fleur la plus probable ; le choix « Qu'est-ce qui a poussé ? » montre la chance de chaque couleur.
- Les roses dorées ne se croisent pas dans Wild World (la règle « dorée × dorée » de Nookipedia ne vaut pas pour ce jeu).
- **New Leaf : violettes et œillets ont leurs gènes**, lus dans le code du jeu. Ils rejoignent les autres fleurs à codes : Croisement, Comment obtenir… (la **violette bleue** : une blanche × une violette, une chance sur deux), Champ, Identifier, Glossaire, et « Mes fleurs » les reconnaît dans ta sauvegarde. Les œillets de départ arrivent par courrier (rose 11, rouge 21).
- Le code de New Leaf confirme aussi que roses, tulipes, pensées, cosmos et lys ont exactement les tables de gènes de New Horizons.
- City Folk garde les règles de Nookipedia, sans chances, pour l'instant.

## 1.3.2

### 🥬 Navets : Wild World et New Leaf, et les prix lus dans ta sauvegarde
- **Wild World** a son prédicteur, tiré du **code du jeu** (décompilé par le projet acww-decomp) : 4 motifs (fluctuant, gros pic jusqu'à 6 fois le prix d'achat, petit pic, décroissant), 12 cours par semaine. Ici, **même les pourcentages des motifs sont exacts**.
- **New Leaf** a aussi le prédicteur : il calcule ses prix comme New Horizons (trois vraies semaines lues dans des sauvegardes suivent exactement ses motifs, dont un gros pic à 193 clochettes). Marqué « à vérifier » en attendant d'autres semaines.
- **Prix de ma sauvegarde** (GameCube, Wild World, New Leaf, New Horizons) : ces jeux choisissent les prix de **toute la semaine** dès le dimanche et les rangent dans la sauvegarde. Le bouton les lit : remplis seulement les cours déjà passés, ou **vois toute la semaine** d'un coup. Nook Dex montre aussi **le motif de la semaine, lu dans le jeu** (et sa date pour la GameCube et Wild World). Ta sauvegarde n'est jamais modifiée. Pour New Horizons (version 3.0), choisis le dossier de la sauvegarde, comme pour l'import ; à vérifier sur une vraie île.
- **City Folk** a aussi son prédicteur, tiré du **code du jeu** : les mêmes motifs que New Horizons, avec d'autres taux (baisse depuis 75 à 80 % du prix d'achat, pic qui commence entre le mardi après-midi et le jeudi après-midi). Pas de lecture de sauvegarde pour City Folk pour l'instant.
- Tous les jeux ont maintenant leur prédicteur de navets.

### 🛠️ Corrections
- Dans la fenêtre « Quoi de neuf ? », les noms de fichiers (comme `garden_plus.dat`) s'affichent proprement, sans les accents graves autour.
- Navets : la vendeuse des anciens jeux (GameCube, Wild World, City Folk, New Leaf) s'appelle bien **Porcella** ; Porcelette reste celle de New Horizons.
- Fleurs hybrides : la mention « à vérifier » est retirée (menu, bandeaux et liste des règles). Une petite note indique d'où viennent les règles de Wild World et City Folk (Nookipedia) et rappelle que leurs chances ne sont pas connues.

## 1.3.1

### 🌷 Fleurs hybrides : plus de croisements pour Wild World et City Folk
- **Wild World** passe de 18 à **28 croisements connus**, **City Folk** de 18 à **34**, d'après le tableau complet de Nookipedia.
- Nouveaux : rose jaune × jaune, **rose dorée × dorée** (→ jaune), rose rouge × violette, les couples blanc × blanc, blanc × jaune et jaune × jaune des tulipes, pensées et cosmos, et les **6 croisements d'œillets** de City Folk.
- Dans le **Champ**, beaucoup de cases qui affichaient « ? » montrent maintenant les fleurs qui peuvent y pousser.
- Toujours marqué « à vérifier » : ces règles viennent des tableaux d'images de Nookipedia, pas du jeu.

## 1.3.0

### 🎯 Que faire maintenant ?
Une nouvelle page, en haut du menu, qui liste les créatures **qui te manquent** et que tu peux attraper **tout de suite**, selon l'heure (ou l'heure simulée), le mois et ton hémisphère.
- Pour chacune : le **meilleur endroit** (rivière, étang, mer, plongée, île de Tortimer…), la **chance par tirage** et le nombre moyen de tirages (« environ 5 ombres »).
- **Quand elle part** : « part dans 12 jours · n'apparaît plus avant juin », et l'heure de fin du créneau du jour.
- Tri des plus faciles aux plus rares (ou l'inverse), au choix « pas encore attrapé » ou « pas encore au musée ».
- Le tableau de bord montre les **3 meilleures pistes** du moment.
- Pour les espèces sans taux connu, seule la disponibilité est indiquée, sans chiffre inventé.

### 🌷 Fleurs hybrides (New Horizons)
Un nouvel outil dans le menu, d'après la génétique des fleurs extraite du jeu par Aeter :
- **Croisement** : choisis deux fleurs (couleur et gènes) et vois les enfants possibles, en % par couleur et par gènes.
- **Comment obtenir…** : choisis une couleur (la rose bleue, par exemple) et Nook Dex trouve les étapes de croisement depuis les graines (ou les îles), avec la chance de chaque étape.
- **Champ** : dessine ton parterre (fleurs et cases bloquées). Chaque **case libre se colore** des fleurs qui peuvent y pousser : une part de couleur par résultat possible, à la mesure de sa chance, avec la fleur la plus probable et son pourcentage (ex. une rose rouge à côté d'une blanche : les cases autour sont mi-rouges, mi-roses, « 50 % »). Passe la souris sur une case pour le détail. Nook Dex montre aussi les couples possibles et les fleurs qui manquent de place. Le champ est gardé dans ton profil.
- **Identifier** : pour une fleur aux gènes inconnus, Nook Dex liste les gènes possibles, propose le croisement test qui les départage le mieux, puis affine le résultat avec la couleur des enfants obtenus.
- **Glossaire** : pour chaque espèce, toutes les couleurs, leurs gènes et où les trouver (graines, îles, croisement).
- Dans le **Champ**, chaque fleur plantée affiche son **code** (ses gènes, ex. « 1110 ») : tu sais exactement quelles fleurs croiser.
- **Une fleur a poussé ?** Clique sur la case colorée où elle est apparue : Nook Dex liste les enfants possibles (ex. deux roses rouges : Rouge 2001 · 50 %, Noir 2000 · 25 %, Rose 2002 · 25 %) et plante celui que tu choisis, avec son code. Dans tous les jeux (sans code dans Wild World et City Folk, qui n'ont pas de gènes).
- **New Leaf** : roses, tulipes, pensées, cosmos et lys utilisent les **gènes** (le même système que New Horizons, d'après le guide de Paleh), avec les **vrais pourcentages** et tous les onglets. Les fleurs « spéciales » sont des fleurs de même couleur aux gènes différents : le chemin vers la **rose bleue** passe par une rouge spéciale (code 1110), née d'une orange et d'une blanche. Violettes et œillets : d'après les règles de Nookipedia (165 croisements New Leaf au total). Marqué « à vérifier ».
- **New Leaf : tes vraies fleurs.** Dans le Champ, le bouton **« Mes fleurs (sauvegarde)… »** lit ton `garden_plus.dat` : la liste de tes fleurs avec leur **code** (les codes nés d'un croisement sont en gras), puis choisis une **acre** de ta ville pour la mettre dans le champ, avec les prévisions autour de chaque fleur. Les gènes sont lus à l'endroit où le jeu les range (vérifié sur trois vraies villes) ; ta sauvegarde n'est jamais modifiée.
- **Wild World : tes vraies fleurs aussi.** Le même bouton **« Mes fleurs (sauvegarde)… »** lit ton `.sav` ou `.dsv` : tes fleurs par couleur, celles qui ont soif, et une acre de ta ville à mettre dans le champ. Wild World ne garde pas de gènes (une rose rouge vaut une autre rose rouge) : il n'y a donc pas de code à afficher.
- Wild World et City Folk : les mêmes outils **Croisement** et **Champ** (cases libres colorées), d'après les **règles de croisement connues** : ces jeux n'ont pas de gènes. Les chances n'étant pas connues, chaque couleur possible a une part égale, et un couple sans règle connue affiche « ? ». Tout est marqué « à vérifier ».

### 🥬 Navets : le prédicteur de prix (New Horizons et GameCube)
Un nouvel outil dans le menu : tu saisis le prix d'achat du dimanche et les cours que tu vois, et Nook Dex donne :
- les **motifs possibles** (fluctuant, gros pic, petit pic, décroissant) avec leur probabilité ;
- la **fourchette de prix** de chaque demi-journée restante, et le prix le plus haut encore possible ;
- la prise en compte du motif de la semaine dernière et du **premier achat** sur ton île.
- La semaine est gardée dans ton profil ; le bouton « Nouvelle semaine » repart de zéro.
- **GameCube** aussi : prédicteur tiré du code du jeu (un prix par jour ; motifs « pic » à 8 fois le prix d'achat, « aléatoire » et « baisse »).
- New Leaf, City Folk et Wild World : l'écran est prêt, mais il arrive **bientôt**.
- D'après l'algorithme du jeu publié par Ninji.

### 💾 Importer ta sauvegarde (GameCube, Wild World, New Leaf et New Horizons)
Sur le tableau de bord d'un profil GameCube, le bouton **« Importer ma sauvegarde du jeu… »** lit ta partie et coche le dex pour toi :
- le **musée** (poissons, insectes, fossiles, tableaux), commun à toute la ville ;
- le **catalogue** du joueur de ton choix : meubles, gyroïdes, papiers peints, sols, papeterie et morceaux de K.K. ;
- accepte le fichier `.gci` (exporté depuis Dolphin ou la carte mémoire) ou la carte mémoire complète `.raw` de Dolphin ;
- avant d'importer, Nook Dex montre **ce qui va être ajouté** ; il n'enlève jamais une coche et ne modifie jamais ta sauvegarde ;
- versions européenne, américaine et australienne (la version japonaise n'est pas prise en charge). La partie musée est encore **à vérifier** sur une ville avancée.

**Wild World** aussi, avec le même bouton :
- le **musée** complet (fossiles, poissons, insectes, tableaux) ;
- l'**encyclopédie** du joueur choisi : chaque poisson et insecte qu'il a **attrapé** est coché, même s'il n'est pas au musée ;
- son **catalogue** : meubles, vêtements, gyroïdes, papiers peints, sols, papeterie, morceaux de K.K., photos…
- accepte le `.sav` du jeu ou le `.dsv` de DeSmuME / RetroArch. Versions occidentales seulement (pas la japonaise ni la coréenne).

**New Leaf - Welcome amiibo** : choisis le fichier `garden_plus.dat` (exporté avec Checkpoint ou JKSM, ou copié depuis Citra).
- le **musée** complet (fossiles, poissons, créatures marines, insectes, tableaux et statues) ;
- les **objets débloqués** du joueur choisi : créatures attrapées et tout le catalogue (meubles, vêtements, papiers peints, sols, morceaux de K.K., gyroïdes, photos, outils…).
- L'ancien `garden.dat` (jeu jamais mis à jour en 1.5) n'est pas pris en charge.

**New Horizons (version 3.0)** : choisis le **dossier** de la sauvegarde (exporté avec JKSV ou Checkpoint : celui qui contient `main.dat` et les dossiers `Villager0`, `Villager1`…). Nook Dex le déchiffre lui-même.
- le **musée** de l'île ;
- pour l'habitant choisi : tout ce qu'il a **déjà obtenu** (créatures attrapées, meubles, vêtements, papiers peints, posters, photos…) et ses **recettes** connues.
- Seule la version 3.0 du jeu est lue. **À vérifier** : testé seulement sur des sauvegardes fabriquées (aucune vraie sauvegarde disponible).

### 🏝️ L'île de Tortimer (New Leaf)
- Les poissons et les créatures marines de l'île ont maintenant **leur taux d'apparition**, le même toute l'année.
- Le **poisson-ruban**, la **carangue géante**, le **requin-baleine**, l'**anguille jardinière**, le **nautile** et le **bathynome géant** ne sont plus en « rareté inconnue ».
- Pour les espèces présentes en ville et sur l'île, la fiche montre les deux taux côte à côte.

## 1.2.0

### ⭐ La rareté arrive dans New Horizons
Les fiches des poissons, des insectes et des créatures marines de New Horizons disent maintenant **à quel point une créature est rare**, avec les taux tirés des paramètres du jeu.
- La note de **1 à 5 étoiles**, sur la fiche et sur les cartes de la collection.
- Le **taux du moment** et le **tableau mois × créneau horaire**, selon l'**hémisphère** de ton profil (nord ou sud).
- Poissons : le taux **lieu par lieu** (rivière, embouchure, rivière en hauteur, étang, mer, ponton).
- Le cœlacanthe et l'escargot indiquent qu'ils ne sortent **que s'il pleut**.
- Les deux tris « les plus rares d'abord » et « taux actuel » fonctionnent aussi pour New Horizons.
- Guêpe, fourmi et mouche expliquent pourquoi elles n'ont pas de taux (elles apparaissent autrement).

## 1.1.0

### ⭐ La rareté des créatures (GameCube, Wild World, City Folk, New Leaf)
Les fiches des poissons, des insectes et des créatures marines (New Leaf) disent maintenant **à quel point une créature est rare**, avec les taux tirés du code des jeux.
- Une note de **1 à 5 étoiles** (« Très courant » à « Très rare »), sur la fiche et sur les cartes de la collection.
- Le **taux du moment** (« 2 % maintenant ») selon la date, l'heure et le lieu, et la chance qu'aucun insecte n'apparaisse.
- Un **tableau mois × créneau horaire** pour voir d'un coup d'œil quand chercher une espèce.
- Deux nouveaux tris : « les plus rares d'abord » et « taux actuel ».
- GameCube : la période où le jeu change de table (du 26 au 6) est signalée « transition possible », et une info-bulle explique l'effet du rang de la ville.
- City Folk : le taux quand on est connecté à une autre ville est indiqué à part.
- Le cœlacanthe rappelle qu'il n'apparaît que quand il pleut ou qu'il neige.
- Les espèces sans taux (île de Tortimer, abeille, fourmi…) expliquent pourquoi.

### 🔑 Codes d'objets (GameCube)
- La fiche (bouton ⓘ) de chaque objet GameCube affiche **son code à donner à Tom Nook**, avec un bouton **Copier**.
- Pour les objets dont le code dépend du nom du joueur, indique **ton nom et ta ville** dans ton profil : Nook Dex crée ton propre code.
- Les codes e-Reader sont marqués « version américaine seulement », avec un code de remplacement pour la version européenne.
- Filtre par provenance et pourcentage d'avancement dans la collection.
- Deux nouvelles catégories : **Outils** et **Papeterie**.
- Merci à Cuyler et BrianMp16, auteurs du tableur « ACGC Hundo Helper ».

### 🌳 Ville parfaite et arrosoir en or (Wild World)
Un nouvel outil dans le menu des profils Wild World :
- Dessine ta ville en choisissant chacune des 16 acres parmi **246 modèles**, puis ajoute ou retire arbres et fleurs.
- Pour chaque acre : score, rang, et ce qui manque en clair (« +2 arbres », « +1 fleur »…).
- Pour la ville : rang, compteur « X / 8 acres au rang 4 » et les 8 acres les plus faciles à améliorer.
- Le **compteur des 15 jours** pour obtenir l'arrosoir en or.
- Import et export de la carte en fichier.

### 🐟 Fiches plus justes
- Poissons de Wild World : périodes d'apparition d'après animalcrossing-online.com, à la quinzaine près.
- **« Comment l'obtenir » en français** dans tous les jeux, avec les noms officiels des personnages (Rounard, Carla, Follet…).
- Les images qui ne s'affichaient pas (lucane cerf-volant, poisson-lanterne de New Leaf…) s'affichent à nouveau.

### ✉️ Papeterie
- Nouvelle catégorie **Papeterie** pour Wild World (63), City Folk (64) et New Leaf (68), comme pour le GameCube.
- Wild World : les **32 parapluies** apparaissent enfin, dans les vêtements (sous-catégorie « Parapluies »).

### ⚙️ Profils
- Les profils GameCube ont trois nouveaux champs : « Mon nom », « Ma ville » et « Version du jeu ».
- Tes profils et ta progression actuels sont gardés tels quels.
