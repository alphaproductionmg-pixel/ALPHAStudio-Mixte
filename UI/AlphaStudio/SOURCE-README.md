# ALPHA Studio — Station audio numérique (inspirée de Nuendo 4)

**Étape 1 livrée : l'interface.** Un fichier unique, sans dépendance, ouvrable d'un double-clic
dans n'importe quel navigateur : **`alpha-studio.html`** — 947 303 octets (≈ 925,1 Kio), **59 fenêtres**,
**458 entrées de menu** dont 49 sous-menus.

> **Lots 5 à 8 (19 novembre 2026)** — barre d'outils configurable et accrochage à 8 modes, règle à
> 7 formats (dont Pieds+images 16/35 mm, User, Time Linear), liste des pistes complète
> (redimensionnement à la souris, sélection multiple, dossiers, sous-pistes d'automatisation,
> verrou, base de temps, lanes, contrôles configurables, wrap), outils **Line** (5 modes), **Couleur**,
> **Time Warp**, **Scrub**, trois modes de redimensionnement, poignées de fondu et de volume,
> édition réelle (déplacer, diviser, copier, coller, supprimer, dupliquer, nudge, Ctrl+Z, Ctrl+A),
> inspecteur avec **Quick Controls** et **Modificateurs MIDI**, transport élargi (jog/shuttle,
> pré/post-roll, Auto-Quantize, modes d'enregistrement et de cycle, marqueurs cliquables),
> et **8 nouvelles fenêtres** (Track Controls Settings, Quick Controls, Inspector Setup,
> Modificateurs MIDI, Personnaliser les menus, Moniteur MIDI, Transposer, Vélocité).

---

## 1. Ce qui est en place

| Zone | Contenu |
|---|---|
| Barre de titre | logo ALPHA, nom du projet, boutons de fenêtre |
| **Barre de menus** | Fichier, Édition, Projet, Audio, Transport, Média, Périphériques, Fenêtres, Aide — **458 entrées** dont **49 sous-menus** en cascade, toutes cliquables et toutes documentées (voir § 1 ter) |
| Barre d'outils | 12 outils (flèche + 3 modes de redimensionnement, plage, ciseaux, colle, gomme, zoom, silencieux, crayon, écoute, **Line** + 5 modes, **Couleur**, **Time Warp**), accrochage à **8 modes**, grille, quantification, Snap to Zero Crossings, contrainte de retard, modes d'automatisation, fondamentale, couleur de piste, zoom, nudge, cycle/punch, défilement auto — **configurable par clic droit** (§ 1 ter) |
| Ligne d'info | nom / début / fin / longueur / décalage + **Transpose / Vélocité / Fondamentale** (parties MIDI, valeurs jaunes), sélection multiple signalée, grille / zoom |
| **Inspecteur** | en-tête de piste coloré, automatisation, volume + VU, panorama (bouton rotatif), inserts, EQ 4 bandes, départs FX, canal, bloc-notes — sections repliables |
| **Ligne d'aperçu** | vue miniature du projet, cadre de vue déplaçable (clic/glisser) |
| **Règle** | 7 formats (Barres+temps, Timecode, Secondes, Échantillons, **Pieds+images 16 et 35 mm**, **User**), bascule **Bars+Beats / Time Linear**, marqueurs cliquables (clic = aller, double-clic = renommer, clic droit = menu), localisateurs de cycle, **seconde piste de règle** indépendante, curseur |
| **Liste des pistes** | piste de marqueurs, **piste de tempo**, **piste de règle**, **piste d'arrangeur**, dossiers MUSIQUE/EFFETS repliables, 11 pistes audio/MIDI/groupe/FX + **piste vidéo** + **piste instrument**, nom sur plaquette noire, M / S / R / écoute, mini-fader + valeur dB, **W/R d'automatisation**, **lock**, **base de temps M/L**, **lanes**, **affichage de l'automatisation** (sous-piste courbe), **activité**, bouton « e », **poignée de redimensionnement** (Ctrl = toutes les pistes), **sélection multiple** (Ctrl/Maj), **Enlarge Selected Track**, **pliage des dossiers** |
| **Timeline** | grille mesures/temps (tracée en DOM en Time Linear), formes d'onde et blocs MIDI en SVG, **déplacement / redimensionnement / division / fondus / volume d'événement à la souris**, sélection par rectangle, poignées de fondu et de volume, **piste de tempo**, **blocs d'arrangeur**, **piste vidéo avec images**, **courbes d'automatisation**, marqueurs, rideau de cycle, curseur |
| **Panneau Transport** | afficheur LCD ambre (barres.temps.mesures + temps + timecode), tempo, signature, localisateurs, boutons lecture/arrêt/enregistrement/cycle, métronome, sync, auto. lecture/écriture, punch in/out, **marqueur précédent / suivant / afficher les marqueurs**, **mode d'enregistrement**, **enregistrement en cycle**, **pré-roll / post-roll**, **Auto-Quantize**, **jog / shuttle** (molette glissable + vitesses), **Tempo FIX/TRACK**, Keep visual — **déplaçable** |
| Barre d'état | projet, tempo, signature, fréquence, résolution, piste, outil, accrochage, CPU/disque, badge d'étape |
| Retours | notifications en haut à droite, fenêtre « À propos » (F1) |

### Ambiance visuelle
Chrome argenté biseauté (dégradés + filets clairs/foncés), accents bleu acier,
plaquettes de pistes noires, couleurs d'événements pastel, afficheurs LCD sombres à
chiffres ambre/vert, police Tahoma 11 px — la signature de Nuendo 4 (2007).

## 1 bis. Les fenêtres UI (livré)

Toutes les fenêtres sont **flottantes** : titre déplaçable, réduire / agrandir (ou double-clic sur le titre),
redimensionnement par le coin, fermeture, mise au premier plan au clic. Un gestionnaire central les ouvre,
les ferme et les rafraîchit ; le menu **Fenêtres** coche celles qui sont ouvertes.

**59 fenêtres**, nommées et construites d'après le **manuel d'utilisation Nuendo 4** (les pages citées sont celles
du PDF officiel Nuendo 4 — *Operation Manual*, Steinberg, 14/09/2007, non inclus dans l'archive). Les 8 dernières (lot 5, fichier `src/windows5.js`) :
**Track Controls Settings** (p. 507), **Quick Controls** (p. 339-341), **Inspector Setup** (p. 25),
**Modificateurs MIDI** (p. 346), **Personnaliser les menus** (p. 509), **Moniteur MIDI**, **Transposer**, **Vélocité**.

| # | Fenêtre (nom Nuendo 4) | Raccourci | Options reproduites | Manuel |
|---|---|---|---|---|
| 1 | **Mixer** | F3 | **panneau commun** : Can Hide (marquer / masquer), Routage, 10 vues étendues (Inserts 8, Égaliseurs, Égal. courbe, Départs 1-4 / 5-8, Studio Sends, Surround, Ensemble, Compteurs, Vide), Toutes larges / étroites, Mute / Solo / Listen globaux, R / W, Réinitialiser, Copier / Coller, Connexions VST, 7 types de canaux, jeux de vues (+) / (−) ; tranches : 8 inserts, EQ 4 bandes, 4 départs, R/W/Can Hide, panoramique, fader (double-clic 0 dB) ; **clic droit** : routage, vue étendue, Lier / Délier, Enregistrer / Charger les canaux (.vmx), réglages globaux des compteurs | p. 130-146 |
| 2 | **Réglages du canal** (VST Audio Channel Settings) | E | onglets Canal / Égaliseur (4 bandes) / Inserts (8) / Départs (8), Copier les réglages, En coller, Personnaliser la vue, bande de canal (pan, fader, meter, M/S/R/W, routage) | p. 137 |
| 3 | **Panneau d'automatisation** (Automation Panel) | Alt+A | Touch / Auto-Latch / Crossover, To Punch / To Start / To End / Loop, Suspendre (lecture / écriture), Punch, Auto Punch, Punch In/Out, Virgin territory, listes de suspension lecture/écriture, Punch Log, Retour au temps, réduction max. | p. 147-150 |
| 4 | **Éditeur d'échantillons** (Sample Editor) | Ctrl+E / double-clic | Inspecteur à 5 onglets : Définition (grille, Auto Adjust, Aperçu), Lecture (Straighten Up, algorithme, Quantize, Swing, Free Warp, Aplatir), Hitpoints, Plage, Traitement ; forme d'onde + vue d'ensemble, info format/longueur/sélection/édits | p. 259-263 |
| 5 | **Éditeur de clavier** (Key Editor) | double-clic sur un événement MIDI | clavier vertical, grille, vitesses, quantifier, outils de la barre | p. 320-330 |
| 6 | **MediaBay** | F5 | barre d'outils (navigation ◀ ▶, recherche, Attributs, Colonnes, Importer…, Réinit. filtres, ★ Favoris, + Attribut, aperçu ▶ ■ ⟳ + volume) ; arborescence + Scope, filtres, tri par colonne, panneau d'attributs + éditeur de balises, onglets Loop / Sound Browser | p. 315-316 |
| 7 | **Pool** | Ctrl+P | colonnes Utilisé / État / Nom / Type / Date / Taille / Fréq. / Bits / Tempo / Sig. / Clé / Chemin, dossiers Audio / Images MIDI / Vidéo / Pistes / Corbeille ; Importer, Convertir, Effacer, Révéler, Supprimer du pool, **Colonnes ▾**, **Attributs…** (attributs utilisateur), Préparer l'archive | p. 297-299 |
| 8 | **Instruments VST** (VST Instruments) | F11 | 8 emplacements × 6 contrôles (Freeze, On/Off, Bypass, e, LED d'événements, activation des sorties) + colonne Preset ; Insérer…, Retirer, Panneau, Canal, Presets…, Éditer | p. 401-404 |
| 9 | **Connexions VST** (VST Connections) | F4 | 6 onglets : Entrées, Sorties, Group/FX, FX externes, Instruments externes, Studio | p. 11-16 |
| 10 | **Marqueurs** (Marker window) | Ctrl+M | Aller, **+ Marqueur**, **+ Cycle**, Déplacer, Supprimer, marqueur précédent / suivant ; filtre d'affichage à 4 états (tous / de cycle / du cycle / sans cycle) ; colonnes Locate, ID, Position, Fin, Longueur, Description, **Type** | p. 110-111 |
| 11 | **Historique des traitements hors ligne** (Offline Process History) | Audio ▸ | Modifier, Remplacer par…, Activer / Désactiver, Supprimer, **Tout réactiver**, Enregistrer comme traitement par lots, Fermer ; filtre par **type**, recherche, afficher / masquer les désactivés, colonne **Cible** | p. 251-253 |
| 12 | **Aide-mémoire des raccourcis** *(ajout ALPHA, hors Nuendo 4)* | Aide ▸ | recherche par commande **ou par touche**, filtre par thème (6), compteur, Parcourir… (ouvre Commandes clavier), Imprimer | — |
| 13 | **Nettoyage** (Cleanup) | Fichier ▸ Nettoyage… | dossier de recherche, Démarrer, **Tout sélectionner / Désélectionner**, sélection multiple (Ctrl / Maj), fichiers non utilisés avec **dossier** (Audio / Edits / Images), format, taille, état, total sélectionné ; Mettre à la corbeille, Supprimer, Fermer | p. 443 |
| 14 | **Performances VST** (VST Performance) | F12 | barre **charge CPU** (haut) + **transfert disque** (bas), voyants **Overload**, pilote ASIO, fréquence, mémoire tampon, latence ; compteurs CPU / Disque affichables, **Aussi dans la barre de transport / la barre du projet**, **Figer ▶**, Réinitialiser les crêtes | p. 471 |
| 15 | **Éditeur de piste de tempo** (Tempo Track Editor) | Ctrl+T | Tempo fixe / Piste de tempo, type de courbe, grille, Autoscroll, Tempo Record, échelle Mesures+temps / Temps linéaire, Process Tempo… / Process Bars…, table des points (clic dans le graphe = point) | p. 415-417 |
| 16 | **Navigateur de projet** (Project Browser) | Ctrl+B | **+ Ajouter**, **Format de temps** (Mesures+temps / Timecode / Échantillons), **Filtre**, **(+) Tout / (−) Tout**, **Sync sélection** ; Structure du projet + 7 catégories (Audio, MIDI, Vidéo, Automatisation, Arranger, Marqueurs, Tempo) ; colonnes Nom, Fichier, Début, Fin, Snap, Longueur, Décalage, Volume | p. 428-429 |
| 17 | **Feuille de pistes** (Track Sheet) | Projet ▸ | X/Y Page, échelle, zoom, **épaisseur du trait** (0,5 / 1 / 1,5 / 2 pt), **colonne temps** (chaque page / première page / aucune), **Plus/Moins** : Projet, Ingénieur, En-tête, **sans zéros initiaux**, masquer la fin si durée <, **fusionner si écart ≤** (réel), **filtre de noms** (séparés par ;) ; une ligne par position, une colonne par piste | p. 434-436 |
| 18 | **Configuration du projet** (Project Setup) | Maj+S | Nom du projet, Début, Longueur, Décalage d'affichage, Décalage de mesures, Fréquence d'image, Format d'affichage, Fréquence d'échantillonnage, **Résolution (Record Format)**, **Type de fichier** (BWF…), Pull-up/down, Loi de pan stéréo, Dossier du projet, **Get From Video…** + suivi de la fréquence d'image | p. 33 |
| 19 | **Préférences** (Preferences) | Fichier ▸ | bandeau **Stocker…**, case « Store marked preferences only », pop-up **Preference Presets** (Alpha / Nuendo 4 / Montage vidéo / Surround) ; marques de stockage par ligne ; 9 pages : Général, Apparence, Édition, Enregistrement, Transport, Événements, VST (« Plug-in Editors Always on Top »), MediaBay, Control Room ; Réinitialiser / Annuler / Appliquer / OK | p. 514 |
| 20 | **Configuration des périphériques** (Device Setup) | Périphériques ▸ | **7 pages** : VST Audio System (pilote, fréquence, tampon, latences, horloge, relâcher le pilote, priorité audio, Multi Processing, monitoring direct, Panneau de configuration ASIO), 3 pilotes Alpha (ports, horloge, filtres), **Video Player** (sortie, format, Frame Offset, vignettes), Remote, Quick Controls ; Ajouter / Supprimer / Presets / Réinitialiser / OK | p. 17-21 |
| 21 | **Commandes clavier** (Key Commands) | Fenêtres ▸ | recherche, dossiers (+)/(−), **Touches affectées** (plusieurs touches par fonction), champ **Type in Key**, **Assigner**, **Supprimer**, page **Configuration** (On/Off, navigation, pavé numérique), **Stocker…**, **Réinitialiser**, jeux de commandes ; réaffectation réelle | p. 518-520 |
| 22 | **Vidéo** (Video) | F8 | moniteur + timecode, lecture / arrêt, image précédente / suivante, **Décalage (ips) − / +**, **Éditer le mode**, Haute qualité, **Taille** (25 / 50 / 75 / 100 / 200 % / ajuster), Plein écran (Échap), **Toujours au-dessus**, afficher le timecode | p. 470-472 |
| 23 | **Mixer Control Room** | Périphériques ▸ | tranches MON A / MON B / PHONES / MAIN, cartes Moniteurs et casque, Studios (retours), Entrées externes, Affectations VST ▸ Studio ; Talkback, Listen, Dim, Mono | p. 151-160 |
| 24 | **Exportation du mixage audio** (Export Audio Mixdown) | Fichier ▸ | Nom, Chemin, nom auto, dossier audio du projet ; **choix multiple des canaux** (Stéréo Out, Bus Drums, FX, Voix, Basses), Diviser / mono ; Format, Taux, Profondeur, Dithering, BWF, entrelacé ; **plage** (localisateurs / cycle / tout), inserts, solos ; Normaliser, Après export (Pool / piste), temps réel | p. 438-439 |
| 25 | **Fondu** (Fade dialog) | A | 3 types de courbe (spline / spline amorti / linéaire), **formes rapides** Lin. / Exp. / Log. / S. réglables, **Longueur** (cycle 0,100 → 2,000 s), **Appliquer la longueur**, **Presets** (Stocker / Suppr. / rappel), **Comme défaut**, **Restaurer**, point de courbe déplaçable (ajout par clic), Aperçu / Stop | p. 89-91 |
| 26 | **Fondu enchaîné** (Crossfade dialog) | X | Longueur, **Point de décalage** (ligne déplaçable), Chevauchement, Volume A / B, **Type de courbe**, Fondus symétriques, **Equal Gain / Equal Power** (exclusifs), **Plage et mode de nudge** + Nudge ◀ ▶, **écoute** fondu sortant / entrant / fondu enchaîné + Stop, **Pré-roll / Post-roll**, Autoscroll, **Auto Zoom**, presets (Stocker / Suppr.), **Comme défaut / Rappeler défaut**, **Précédent / Suivant**, **Zoom sur le fondu**, la sélection du projet suit | p. 92-97 |
| 27 | **Détection des silences** (Detect Silence) | Audio ▸ | Seuil d'ouverture / de fermeture, Liés, Temps min. ouvert / fermé, Pré-roll, Post-roll, Calculer (auto), Ajouter comme régions, Nom des régions, N° de départ, Détacher / Supprimer les silences, Créer des événements, Fondu 3 ms, mode de traitement, Tout sélectionner / Aperçu / Traiter | p. 254-255 |
| 28 | **Analyseur de spectre** (Spectrum Analyzer) | Audio ▸ | Taille en échantillons, Recouvrement, Fenêtre, Stéréo (mix mono / gauche / droite), **Maintenir les crêtes**, **Figer**, dB, Fréquence / note, Précision, Min/Max, Actif, Analyser — tous les réglages déroulants sont cliquables | p. 255 |
| 29 | **Statistiques** (Statistics) | Audio ▸ | Cible (événement), **Portée** (sélection / événement / clip entier / plage de locators), les 10 valeurs du manuel (min./max. d'échantillon, amplitude de crête, décalage DC, résolution estimée, hauteur estimée, fréquence d'échantillonnage, RMS min./max., moyenne), explication au survol, **Copier**, Recalculer, Fermer | p. 256 |
| 30 | **Éditeur de parties audio** (Audio Part Editor) | Fenêtres ▸ | outils identiques au projet + **Solo Editor**, écoute, scrub, lecture/boucle, volume d'écoute, boucle de piste indépendante, bordures de parties, édition des parties actives seules, voies internes | p. 290-294 |
| 31 | **Éditeur de liste** (List Editor) | Fenêtres ▸ | Insérer, Supprimer, Tout sélectionner, filtre, colonnes n° / type / position / événement / canal / note / hauteur / vélocité | p. 324 |
| 32 | **Loop Browser** | F6 | vue MediaBay centrée boucles audio (nom, type, tempo, signature, longueur) + barre d'outils complète (recherche, filtres, favoris, attribut, aperçu) | p. 315 |
| 33 | **Sound Browser** | F7 | vue MediaBay centrée sons et presets VST (instrument, catégorie) + même barre d'outils | p. 316 |
| 34 | **Configuration des éléments** (Setup dialog) | Alt+U | deux colonnes visibles / masqués, **flèches au centre** (application immédiate), menu contextuel Tout afficher / Par défaut / Setup…, presets ; choisit le panneau à configurer (Transport, Ligne d'info, Inspecteur, Barres d'outils, Réglages de canal) | p. 506-507 |
| 35 | **Organiser les espaces de travail** (Organize Workspaces) | W | deux listes (espaces du projet / presets globaux), flèches de copie, renommer, ID 1-9 (Utiliser les ID), Verrouiller l'espace actif, Presets du projet, Instancier les presets automatiquement, Nouvel espace / Mettre à jour / Activer / Supprimer | p. 504-505 |

### Tour « options manquantes » — fenêtres complétées

| Fenêtre | Ce qui a été ajouté |
|---|---|
| Mixer | panneau commun (Can Hide, Routage, 10 vues étendues, larges/étroites, Mute/Solo/Listen globaux, R/W, Réinitialiser, Copier/Coller, Connexions VST, 7 types de canaux, jeux de vues) ; tranches enrichies (8 inserts, courbe d'EQ, départs 1-4 / 5-8, Studio Sends, panneau surround, R/W/Can Hide) ; menu contextuel complet (routage, vue étendue, lien, .vmx, compteurs) |
| MediaBay / Loop Browser / Sound Browser | barre d'outils : navigation, recherche (filtrage réel), Attributs, Colonnes, Importer…, Réinitialiser les filtres, ★ Favoris, + Attribut (texte / case / nombre), aperçu ▶ ■ ⟳ + volume ; Scope, tri par colonne, éditeur de balises |
| Navigateur de projet | + Ajouter, format de temps (3 modes), filtre de texte, (+) / (−) Tout, Sync sélection, 7 catégories de structure, colonnes d'événements audio complètes |
| Commandes clavier | deux volets : commandes / touches affectées ; Type in Key, Assigner, Supprimer (avec réaffectation réelle), dossiers (+)/(−), recherche, Stocker…, Réinitialiser, page Configuration, jeux de commandes |
| Pool | colonnes Utilisé / État / Tempo / Sig. / Clé, dossiers (dont Corbeille), Colonnes ▾ (choix réel des colonnes), Attributs utilisateur, Préparer l'archive |
| Instruments VST | 6 contrôles par emplacement (Freeze, On/Off, Bypass, e, LED d'événements, sorties) + colonne Preset ; Insérer / Retirer / Panneau / Canal / Presets… / Éditer |
| Exportation du mixage audio | choix multiple des canaux, dithering, BWF, plage (localisateurs / cycle / tout), inserts, solos, normalisation, après export, temps réel |
| Préférences | Stocker…, « Store marked preferences only », Preference Presets, marques de stockage par ligne |
| Détection des silences | Supprimer les silences, créer des événements, fondu 3 ms, mode de traitement, Tout sélectionner |
| Analyseur de spectre | pop-ups cliquables (taille, recouvrement, fenêtre, stéréo), Maintenir les crêtes, Figer |

### Deuxième passe du tour « options manquantes »

Chaque fenêtre a été reprise avec le manuel ouvert, en comparant **la liste des options** du manuel
à ce que la fenêtre offrait. Les contrôles ajoutés sont interactifs (sélection, filtres, cycles, menus),
pas décoratifs.

| Fenêtre | Ce qui manquait et a été ajouté |
|---|---|
| Fondu | formes rapides Lin. / Exp. / Log. / S. en un clic, menu longueur cyclique (0,100 → 2,000 s), Appliquer la longueur, presets Stocker / Supprimer, Comme défaut, Restaurer, poignée de courbe déplaçable, clic sur la courbe = point, Aperçu / Stop |
| Fondu enchaîné | Point de décalage (ligne déplaçable), Volume A / B, type de courbe, fondu symétrique, Equal Gain / Equal Power exclusifs, plage + mode de nudge avec Nudge ◀ ▶, trois écoutes + Stop, pré-roll / post-roll, Autoscroll, Auto Zoom, presets, Comme défaut / Rappeler défaut, Précédent / Suivant, Zoom sur le fondu, suivre la sélection |
| Marqueurs | + Marqueur, + Cycle, marqueur précédent / suivant, filtre d'affichage à 4 états, colonne Type |
| Historique des traitements hors ligne | filtre par type, recherche, afficher les désactivés, Tout réactiver, colonne Cible |
| Feuille de pistes | épaisseur du trait (4 valeurs), colonne temps (3 états), sans zéros initiaux, fusion si écart ≤ et filtre de noms réellement appliqués, pages X / Y cliquables |
| Configuration du projet | Nom du projet, Résolution (Record Format) et Type de fichier séparés, Get From Video…, suivi de la fréquence d'image |
| Configuration des périphériques | 7 pages (VST Audio System, pilotes, Video Player, Remote, Quick Controls) avec cases à cocher et boutons de panneau |
| Vidéo | image précédente / suivante, Décalage (ips), Éditer le mode, menu Taille (25 → 200 %), Toujours au-dessus, afficher le timecode |
| Performances VST | compteurs CPU / Disque affichables, affichage aussi dans la barre de transport ou du projet, Figer ▶ |
| Statistiques | cible et portée de l'analyse (sélection / événement / clip / plage), explication de chaque valeur au survol, Copier |
| Nettoyage | Tout sélectionner / Désélectionner, sélection Ctrl / Maj, colonne dossier (Audio / Edits / Images), format et taille, total sélectionné |
| Aide-mémoire des raccourcis | recherche par commande ou par touche, filtre par thème, compteur, Parcourir…, Imprimer |

### Troisième passe — fenêtres restantes (lot 3)

Même méthode : le manuel ouvert à la page de la fenêtre, on coche les options une à une, on garde
les noms exacts, et on ajoute ce qui manquait. Tailles remesurées sur le contenu.

| Fenêtre (nom Nuendo 4) | Options ajoutées / reprises | Taille |
|---|---|---|
| **Pool** | dossiers Audio / Images MIDI / Vidéo / Pistes / Corbeille repliables avec compteurs ; colonnes du manuel : Utilisé, État (fichier présent, traité, **externe**, **enregistré dans cette version**, introuvable), **Redresser (Straighten up)** avec blocage si tempo « ??? », Tempo, Sig., Clé, Info (fréq. · bits · canaux · durée), Type, Date, **Origine**, **Image** (forme d'onde), Chemin, **Bobine** ; barre d'outils : Colonnes, Attributs utilisateur, Tout ouvrir / fermer, dossier du projet, **dossier d'enregistrement**, Importer, Recherche, lecture + boucle + volume d'audition ; ligne d'info (fichiers audio, taille totale, utilisés, non utilisés, hors dossier) ; Insérer dans le projet, Convertir, **Minimiser le fichier**, Générer les images, Mettre à jour l'origine, Révéler, Afficher dans MediaBay, Préparer l'archive, Effacer (→ corbeille, refusé si utilisé), Vider la corbeille ; renommage en place (double-clic) | 960×540 |
| **Exportation du mixage audio** | quatre sections du manuel : **Emplacement du fichier** (nom, chemin, utiliser le dossier audio du projet), **Format de fichier** (8 formats avec options propres : Wave, Broadcast Wave + chunk et bouton Éditer, AIFF, AIFC, Wave64, MP3 + ID3, Ogg, WMA ; taux, profondeur, dithering), **Sortie du moteur audio** (sorties listées, Export mono, Diviser les canaux, **Export en temps réel** + fader et valeur d'audition, Mettre à jour l'affichage), **Importer dans le projet** (Pool, Piste audio au localisateur gauche), Fermer après export ; barre de progression avec Abandonner | 680×600 |
| **Connexions VST** | six onglets du manuel (Entrées, Sorties, Group/FX, FX externes, Instruments externes, Studio) ; **presets de configuration de bus**, **ports inactifs**, **compensation de délai**, deux colonnes de renommage (bouton + double-clic), Ajouter un bus / bus externe, Supprimer, Vérifier le routage, Sync ASIO ; **panneau du bus sélectionné** (configuration, périphérique, ports, latence, mètres par canal, comp. entrée/sortie) | 720×420 |
| **Instruments VST** | les **six contrôles par emplacement** du manuel (Freeze, on/off, Bypass, « e », LED d'événements MIDI, **activation des sorties**) ; gel avec les trois choix du manuel (**instrument seul**, **instrument + parties MIDI**, annuler), menu des sorties par instrument (1-2, 3, 4, 5-6), Gel global, Sorties… pour tous, compteur d'emplacements (max 64), panneau / canal / presets / éditer | 790×392 |
| **Commandes clavier** | dossiers de catégories repliables, recherche, « Type in Key » avec capture réelle, Assigner / Supprimer (la touche est aussi retirée du jeu global), Réinitialiser, jeux de commandes (Alpha, Nuendo 4, Par défaut) + **Gérer ▾** (enregistrer sous, supprimer, importer, exporter), **section Macros** (liste, Nouvelle macro…, Éditer…, Supprimer) | 680×618 |

Réglages de lisibilité au passage : colonnes du Navigateur de projet élargies (Début / Fin ne se touchent plus),
panneau d'attributs du MediaBay élargi à 156 px avec valeurs tronquées proprement.

### Renommages et corrections de contenu (tour « noms et options »)

| Avant | Après (nom Nuendo 4) | Ce qui a changé |
|---|---|---|
| MixConsole | **Mixer** | nom du manuel partout (titre, menus, barre d'état, aide) |
| Éditeur MIDI (clavier) | **Éditeur de clavier** | nom + libellés internes |
| Périphériques VST | **Instruments VST** | 8 emplacements, Bypass / Freeze / sortie / événements par emplacement |
| Historique | **Historique des traitements hors ligne** | contenu remplacé : plus une pile d'annulation, mais les traitements hors ligne du clip |
| Gestionnaire de projet | **Nettoyage (Cleanup)** | « Project Manager » n'existe pas dans Nuendo 4 ; la fenêtre est devenue le nettoyage des fichiers non utilisés |
| Raccourcis clavier | **Aide-mémoire des raccourcis (ajout ALPHA)** | assumé comme hors Nuendo 4 ; les vrais raccourcis éditables sont dans **Commandes clavier** |
| Control Room | **Mixer Control Room** | layout en tranches MON A/B/PHONES/MAIN + studios et affectations |
| Disposition de fenêtre | **Configuration des éléments (Setup dialog)** | le vrai dialogue à deux colonnes, flèches au centre, presets |
| Espaces de travail | **Organiser les espaces de travail** | deux listes projet/presets, ID 1-9, verrou, cases d'options |
| Fondu / fondu enchaîné (une fenêtre) | **Fondu** + **Fondu enchaîné** | deux dialogues distincts, avec les options du manuel (courbes, nudge, chevauchement, volumes A/B) |
| Éditeur d'échantillons | idem, enrichi | Inspecteur 5 onglets (Définition, Lecture, Hitpoints, Plage, Traitement) |
| Éditeur de parties audio | idem, enrichi | Solo Editor, écoute/scrub, boucle de piste, bordures, parties actives seules |
| Feuille de pistes | idem, reconstruite | X/Y Page, échelle, zoom, Plus/Moins, une ligne par position |
| Détection des silences / Statistiques / Spectre / Tempo / Export / Préférences / Périphériques | idem, complétés | options alignées sur les pages du manuel citées ci-dessus |

**Inspecteur de la fenêtre de projet** : clic sur un en-tête de section = ouvre celle-ci et referme les autres,
**Ctrl+clic** = montre / masque cette seule section, **Alt+clic** = tout montrer / tout masquer ;
**clic droit** ouvre le menu **Tout afficher / Par défaut / Setup… / Configurer les panneaux…** (manuel p. 26 et 506).

### Tailles des fenêtres

Chaque fenêtre a une taille calculée sur son contenu :

- hauteurs et largeurs calculées sur le contenu réel (ex. Pool 960×540, MediaBay 820×500, Mixer 1046×600,
  Réglages de canal 560×605, Panneau d'automatisation 800×404, Éditeur de clavier 800×520,
  Contrôle Room 940×486, Fondu 490×333, Fondu enchaîné 600×393, Marqueurs 566×344,
  Historique hors ligne 712×362, Vidéo 604×462, Feuille de pistes 760×420, Performances 452×302,
  Configuration des périphériques 560×371, Exportation du mixage 680×600, Connexions VST 720×420,
  Instruments VST 790×392, Commandes clavier 680×618) ;
- les **dialogues** (`fit: true`) se **dimensionnent automatiquement** à leur contenu à l'ouverture
  et se réajustent quand on change d'onglet ou coche une option ;
- toute fenêtre est **recadrée à l'écran** : elle ne dépasse jamais les bords, et se replace
  automatiquement si tu réduis la fenêtre du navigateur ;
- à l'ouverture, une fenêtre évite de se poser sur une autre (placement en grille).

### Modes de fenêtres et nouveaux éléments d'interface

- **Toujours devant** (always on top) : bouton épingle dans chaque barre de titre, entrée du menu
  contextuel (clic droit sur la barre de titre), état visuel distinct.
- **Menu contextuel de fenêtre** : Toujours devant, Plein écran / Restaurer, Réduire, Fermer,
  Fermer toutes les fenêtres, Mémoriser l'espace de travail.
- **Zone de droite** : rack VSTi (emplacements d'instruments), médias rapides, pistes récentes —
  affichable par **Fenêtres ▸ Disposition** (Alt+U).
- **Barre d'état** : nouvel indicateur **Espace de travail** (nom de l'espace rappelé) et **Fenêtres**
  (nombre de fenêtres ouvertes).
- **Affichage** : Alt+I (inspecteur), Alt+O (ligne d'aperçu), Ctrl+I (ligne d'info).

### Quatrième passe — les 9 familles de fenêtres manquantes (16 fenêtres, lot 4)

Ces fenêtres existent dans Nuendo 4 et manquaient complètement. Elles sont maintenant construites
sur le manuel, avec les noms exacts et leurs options réelles.

| Fenêtre (nom Nuendo 4) | Contenu livré | Taille |
|---|---|---|
| **Informations sur les plug-ins** | trois onglets (VST, MIDI, Codecs audio) ; colonnes **Activé · Nom · Catégorie · Version · SDK VST · Latence · Entrées side-chain · E/S · Instances · Dossier** ; tri par en-tête, recherche ; Mettre à jour, **Chemins VST 2.x…**, Exporter XML | 900×420 |
| **Éditeur logique** + **Input Transformer** + **Project Logical Editor** | trois fenêtres, même moteur : **conditions** (ajout / suppression / opérateurs cycliques), choix **toutes / au moins une**, **fonction**, **actions** empilables, presets (charger, stocker, renommer, supprimer), Appliquer | 760×520 · 740×470 · 780×500 |
| **MIDI Device Manager** | liste d'appareils (port, canal, banque, patches, panneau), activation, grille de 20 programmes par banque avec envoi au double-clic, installer / ouvrir le panneau / renommer / supprimer / exporter | 700×470 |
| **Presets de piste** | navigateur par catégorie (compteurs), recherche, tableau (type, inserts, départs, date), **fiche détaillée** (inserts, EQ, départs, couleur), créer depuis la piste, appliquer, renommer, supprimer | 800×460 |
| **Setup de quantize** | grille de 10 valeurs + type (Auto / Straight / Triplet / Dotted), **grille graphique d'une mesure** (lignes bleues, swing, zone magnétique, démonstration), Swing, Tuplet, zone magnétique, décalage, presets, Stocker / Supprimer | 620×420 |
| **Beat Calculator** | calcul du tempo depuis un nombre de battements et une sélection (4,000 s), afficheur ambre, **tap tempo** réel (moyenne des frappes), signature, insertion au début de la piste de tempo ou au début de la sélection | 540×300 |
| **Import Medium** | navigateur de fichiers avec format / fréquence / résolution / canaux / durée / taille, aperçu (forme d'onde + fiche), options **Copier les fichiers / Convertir et copier / Diviser multicanaux / Retirer le média**, lecture + boucle + volume d'audition | 780×440 |
| **Exportation OMF / AAF** | destination, chemin des médias, **copier les médias**, **consolider** + poignées, contenu (tout dans un fichier / références, volumes, fondus, noms), version 1.0 / 2.0, résolution, quantifier sur les images, formats OMF / AAF / AES31 / OpenTL | 620×470 |
| **Traitement par lot** | liste des traitements enregistrés, opérations de chacun, créer depuis l'historique, renommer, supprimer, gérer, Traiter | 620×380 |
| **Surround Panner** | panneau graphique 5.1 (six enceintes, ballon déplaçable, lignes de gain par enceinte, valeurs en dB), modes **Standard / Position / Angle**, Mono/Mix, **LFE**, atténuation, **Center Level** et trois **Divergence**, Alt+clic sur une enceinte, MixConvert | 620×420 |
| **Synchronisation** | source (Internal, LTC, MTC, VST System Link, Machine Control), fréquence d'image (24 → 30 dfps), décalage, signaux LTC / MTC / VST Link / Full Frame, générateur, port MIDI, état de verrouillage | 620×450 |
| **Machine Control** | appareil (9-pin, MMC, serveur vidéo), port, protocole, débit, pré-roll, **chase / enregistrement / localisation à distance**, afficheur timecode qui défile en ligne, transport ◀◀ ◀ ■ ▶ ▶▶ ● | 600×430 |
| **VST System Link** | sortie / entrée numérique, fréquence, décalage en échantillons, rôle maître / esclave, liste des ordinateurs du réseau avec état et CPU, activation | 620×400 |
| **ReWire** | canaux de l'application invitée (audio et MIDI), activation → piste du projet, lancer / quitter l'application, tempo maître | 600×360 |

Deux fenêtres restent volontairement dehors : **Éditeur de batterie** et **Éditeur de partitions**, qui appartiennent
au **Nuendo Expansion Kit** (extension payante), pas à Nuendo 4 de base — le manuel les marque « NEK only ».

## 1 ter. Les menus (refaits)

Les neuf menus du haut ont été reconstruits d'après les commandes citées dans le manuel Nuendo 4
(« select “X” from the Y menu ») et l'usage réel d'un montage audio. Chaque entrée est cliquable :
soit elle agit, soit elle explique précisément ce qu'elle fera à l'étape 2.

| Menu | Entrées | Sous-menus | Ce qu'on y trouve maintenant |
|---|---|---|---|
| **Fichier** | 46 | Nouveau · Ouvrir récemment · Importer · Exporter | Nouveau projet / modèle / bibliothèque, ouvrir, projets récents, fermer, enregistrer (sous / nouvelle version / modèle), revenir à la version enregistrée, import audio / MIDI / vidéo / piste / OMF / AAF / XML / CD, export mixage / piste / MIDI / notation / OMF / XML / vidéo / CD / temps de traitement, remplacer ou extraire l'audio d'une vidéo, réglages et informations du projet, historique du projet, nettoyage, mise en page, imprimer, commandes clavier, préférences, quitter |
| **Édition** | 77 | Sélectionner · Déplacer vers · Outils · Zoom · Accrochage · Enveloppes · Ouvrir dans l'éditeur | annuler / rétablir, couper / copier / coller / coller au curseur, supprimer, supprimer le temps, dupliquer, répéter, remplir / diviser la boucle, diviser au curseur, muter / démuter, renommer, verrouiller, 8 sélections, plans avant / arrière, copie réelle, fondus, 9 outils (cochés), 9 zooms, 4 grilles d'accrochage (cochées), enveloppes, éditeurs, édition en place, Logical Editors |
| **Projet** | 42 | Ajouter une piste · Ajouter un canal FX · Arrangeur | 11 types de pistes, 3 formats de canal FX, dupliquer / supprimer / retirer les pistes vides, marqueurs, navigateur, feuille de pistes, tempo, Beat Calculator, Pool, MediaBay, mixer, automatisation, réglages de canal, Control Room, snapshots, suivre la sélection, arrangeur, modèles de piste, nettoyage |
| **Audio** | 46 | Traitement · Plug-ins · Traitement hors ligne · Audio Warp · Hitpoints | gain, normaliser, fondus, enveloppe, inversion, silence, décalage DC, détection des silences, statistiques, analyseur de spectre, 6 plug-ins + informations, traitement par lots, Freeze Edits, fusionner, fermer les écarts, événements en partie, supprimer les fondus, warp / hitpoints, extraire l'audio d'une vidéo |
| **Transport** | 29 | Localisateurs · Nudge | lecture / arrêt / enregistrement / cycle (coché), RTZ, fin, 5 commandes de localisateurs, nudge, panneau transport, métronome et précompte, punch in / out / auto, mode Édition, sync externe, tempo fixe, éditeur de tempo, performances, config de synchronisation, fenêtre vidéo, mute / solo global |
| **Média** | 21 | Gestion des médias | MediaBay, Loop / Sound Browser, Pool, import audio / MIDI / vidéo / piste, Conform Files, minimiser le fichier, nouvelle version, préparer l'archive, vider la corbeille, sélectionner dans le projet, vérification / recherche / conversion / reliage |
| **Périphériques** | 24 | Périphériques Remote · Quick Controls · Sortie vidéo | instruments VST, mixer, connexions VST, Control Room, configuration des périphériques, gestionnaire MIDI, remotes (learn), quick controls, informations sur les plug-ins, vidéo + sortie vidéo, panneau ASIO, synchronisation, performances, commandes clavier, préférences |
| **Fenêtres** | 56 | Éditeurs · Médias · Console · Réglages · Outils · Espaces de travail | les 36 fenêtres rangées par famille, fermer / réduire toutes les fenêtres, rappel d'espaces de travail |
| **Aide** | 8 | — | documentation, aide-mémoire, commandes clavier, à propos, diagnostic, manuel Nuendo 4, support, signaler un problème |

Détails de fonctionnement :

- **Sous-menus en cascade** : 49 sous-menus, ouverts au survol, qui se replient vers la gauche et se
  remontent automatiquement s'ils sortent de l'écran ; un menu trop haut défile au lieu de passer sous la barre.
- **Cases cochées** : les 9 outils, les 4 grilles d'accrochage, cycle, métronome, punch in / out et synchronisation
  affichent leur état réel, et le clic change l'état de la fenêtre de projet.
- **Actions réelles** (sans attendre l'étape 2) : outil, grille, zooms (avant / arrière / plein / sélection / boucle /
  vertical / formes d'onde / restauration), localisateurs (gauche / droite / sur la sélection / aller au localisateur),
  nudge, punch in / out / auto, mute et solo globaux, 8 sélections, fermer ou réduire toutes les fenêtres,
  rappel et mémorisation d'espaces de travail, et l'ouverture des 59 fenêtres.
- **Le reste** : chaque commande répond par un message qui dit ce qu'elle fera (ex. « Supprimer le temps referme
  l'espace entre deux positions, tous les événements suivants glissent (étape 2) ») — aucune entrée muette.

## 1 quater. Les menus contextuels (clic droit)

Clic droit n'importe où dans la fenêtre de projet : chaque zone a désormais son menu complet,
construit sur le même moteur que les menus du haut (sous-menus en cascade, cases d'état, raccourcis affichés).

| Zone | Entrées | Contenu |
|---|---|---|
| **Événement** (clic droit sur un clip) | 46 | éditeurs (échantillons, clavier, édition en place), audition, couper / copier / coller / supprimer / dupliquer / répéter, diviser au curseur, muter, fondus, supprimer les fondus, fondus automatiques, **Traitement** (gain, normaliser, fondus, inversion, silence, DC, silences, statistiques), **Plug-ins** (5 + infos), **Fonctions MIDI** (quantifier, quantize setup, transposer, vitesses, dissoudre, éditeur logique) ou **Audio Warp** selon le type, renommer, verrouiller, copie réelle, plan avant / arrière, 4 sélections, propriétés |
| **Piste** (clic droit sur la liste des pistes) | 39 | renommer (champ de saisie direct), **couleur de piste** (6 couleurs, appliquées au clip), **hauteur de piste** (5 valeurs), zoom vertical, **Muter / Solo / Enregistrement / Écoute** avec case d'état réelle, inserts / EQ / départs / réglages du canal, mixer, automatisation (écriture / lecture cochées), modèle de piste, dupliquer (piste + événements), supprimer, retirer les pistes vides, **masquer la piste**, tout afficher, fondus automatiques, freeze, désactiver la piste |
| **Dossier** (MUSIQUE / EFFETS) | 4 | ouvrir / fermer, renommer, ajouter une piste, tout afficher |
| **Règle** | 25 | localisateurs (gauche, droit, sur la sélection, aller à), cycle, marqueurs, ajouter un marqueur au curseur, **format d'affichage** (barres + temps / timecode / secondes / échantillons — la règle change réellement), grille d'accrochage (4), zooms, tempo, Set Timecode at Cursor, suivre la sélection, arrangeur |
| **Zone de montage vide** | 18 | ajouter une piste (6 types), tout sélectionner / désélectionner, grille, accrochage, zoom plein, zoom sur la boucle, automatisation, mixer, pool |

Les actions réelles de ces menus agissent tout de suite : renommer une piste, changer sa couleur ou sa hauteur,
la masquer, la dupliquer, la supprimer, ajouter un marqueur, changer le format de la règle, muter ou solo,
changer la grille, zoomer. Les autres expliquent ce qu'elles feront à l'étape 2.

## 2. Ce qui est déjà interactif (sans moteur audio)

- Sélection de piste / d'événement (clic, Ctrl+clic pour multi-sélection) → l'inspecteur et la ligne d'info se mettent à jour.
- M / S / R / écoute par piste et dans l'inspecteur, LED d'état, mini-faders affichés.
- Dossiers de pistes repliables, repli visuel des pistes enfants.
- Outils sélectionnables (clic ou touches **1 → 9**), accrochage (**J**), grille, zoom (**+ / −**, Ctrl+molette), facteur de zoom.
- Clic / glisser sur la règle = position ; cycle (**/**), métronome (**C**), transport (**Espace**, **0**, **\***), RTZ (**Début**), fin (**Fin**).
- Panneau Transport : **F2** pour afficher/masquer, déplaçable à la souris.
- Ligne d'aperçu : clic/glisser pour faire défiler la fenêtre de projet.
- **Menus** : 458 entrées dont 49 sous-menus ; outils, grilles et options à cocher reflètent l'état réel, les zooms, localisateurs, nudge, sélections, mute/solo globaux, accrochage (8 modes), formats de règle, outils Line/Couleur/Time Warp, modes de redimensionnement et espaces de travail agissent directement.
- Notifications, fenêtre À propos.
- Fenêtres : déplacer / redimensionner / réduire / agrandir / fermer, ouverture par menu, raccourci ou double-clic ; faders de la MixConsole glissables ; sélection synchronisée MixConsole ↔ fenêtre de projet ; marqueurs qui déplacent le curseur.

## 2 bis. Édition réelle (lots 6 et 7)

L'interface ne se contente plus d'afficher : **on édite à la souris**.

| Geste | Effet |
|---|---|
| Clic sur un événement | sélection (la ligne d'info et l'inspecteur suivent) |
| **Ctrl+clic** | ajoute / retire un événement de la sélection |
| **Maj+clic** | sélection de plage entre l'événement courant et le cliqué (même piste) |
| Glisser dans le vide | rectangle de sélection |
| Glisser un événement | déplacement, avec aimantation selon le mode d'accrochage (8 modes) |
| Bords gauche/droit | redimensionnement — **Normal / Moves Contents / Time Stretch** (second clic sur la flèche) |
| Poignée ronde en haut à gauche / à droite | **fondu entrant / sortant** (double-clic = fondu automatique) |
| Poignée en haut au centre | **volume de l'événement** (−24…+12 dB, affiché sur l'événement) |
| Outil **Ciseaux**, **Gomme**, **Mute**, **Couleur** | division à la position, suppression, mute, couleur suivante |
| Outil **Line** | dessine la courbe d'automatisation (Line, Parabola, Sine, Triangle, Square) |
| Outil **Time Warp** | courbe le temps (règle passée en Time Linear) |
| Outil **Scrub** | déplace le curseur en glissant |
| **Suppr**, **Ctrl+Z**, **Ctrl+C / X / V**, **Ctrl+A**, **Ctrl+D** | supprimer, annuler, copier / couper / coller, tout sélectionner, dupliquer |
| Flèches ← / → | nudge des événements sélectionnés |
| Poignée basse d'une piste | hauteur de piste (Ctrl = toutes), **Snap Track Heights** |

`Ctrl+Z` annule la dernière suppression ou les derniers déplacements de la session (pile interne, 40 niveaux) ;
la pile d'annulation complète et persistante reste à l'étape 2.

## 3. Raccourcis de l'étape 1

`1…9` outils · `J` accrochage · `+ / −` zoom · `/` cycle · `C` métronome ·
`Espace` lecture (message) · `0` arrêt · `*` enregistrement (message) · `Début / Fin` · `F1` À propos · `F2` transport · **F3** Mixer · **F4** Connexions VST · **F5** MediaBay ·
**F6** Loop Browser · **F7** Sound Browser · **F8** Vidéo · **F11** Instruments VST · **F12** Performances VST ·
**Ctrl+B** Navigateur de projet · **Ctrl+T** Éditeur de piste de tempo · **Ctrl+M** Marqueurs · **Ctrl+E** Éditeur d'échantillons · **Maj+S** Configuration du projet ·
**Alt+A** Panneau d'automatisation · **Ctrl+P** Pool · **E** Réglages de canal · **W** Organiser les espaces de travail ·
**A** Fondu · **X** Fondu enchaîné ·
**Alt+U** Configuration des éléments · **Alt+1…9** rappeler un espace de travail · **Alt+0** verrou ·
**Alt+I / Alt+O / Ctrl+I** inspecteur / ligne d'aperçu / ligne d'info · **Échap** fermer.
**Lots 5-8** : `Suppr` supprimer · `Ctrl+Z` annuler · `Ctrl+A / C / X / V / D` sélection / copie / coupe / collage / duplication ·
`← →` nudge · `Ctrl+← / Ctrl+→` marqueur précédent / suivant · `P` / `N` marqueurs · `S` diviser au curseur · `M` muter ·
`B` agrandir la piste sélectionnée · `Espace` lecture (le curseur avance) · `0` arrêt · **Ctrl+molette** zoom · **Molette sur la règle** défilement.

Ces raccourcis suivent ceux de Nuendo 4 (voir `docs/comparatif-nuendo4-vs-alpha.html`) ; ils sont
**réaffectables** dans la fenêtre *Commandes clavier*.

## 4. Ce qui reste pour l'étape 2 (moteur)

1. **Moteur audio Web Audio** : horloge transport précise, lecture réelle des pistes, rideau de cycle, métronome audible, précompte — puis branchement des fenêtres sur ce moteur (VU-mètres animés, faders réels, courbe EQ applied).
2. **Sources sonores** : générateur de motifs (batterie/basse/etc.) ou import de fichiers audio par glisser-déposer, avec vraies formes d'onde calculées.
3. **Édition** : *(fait en grande partie aux lots 6-7 : déplacer, redimensionner, scinder, copier/coller, gommer, nudge, Ctrl+Z)* — reste le collage multi-pistes, l'assemblage (colle), l'édition en place et la pile d'annulation illimitée + historique branché sur la fenêtre Historique.
4. **Enregistrement micro** (MediaRecorder/WebAudio), punch in/out, précompte, écoute.
5. **MixConsole (F3)** : tranches de console, faders, panoramique, EQ 4 bandes éditable, inserts « VST » maison (compresseur, de-esser, réverbe, delay), départs FX A–D, routage groupe.
6. **Automatisation** : lecture/écriture volume & pan *(les courbes sont désormais dessinables au Line tool et visibles en sous-pistes ; il reste à les appliquer au son et à permettre l'édition des points)*.
7. **Éditeur d'échantillons et éditeur MIDI** (double-clic sur un événement).
8. **Export** du mixage en WAV (OfflineAudioContext), sauvegarde/chargement du projet (localStorage + fichier `.alpha`).

## 5. Fichiers du projet

```
alpha-studio.html      ← livrable : tout-en-un (CSS + HTML + JS inlinés)
src/style.css          ← style de la fenêtre de projet
src/windows.css        ← style des fenêtres flottantes (barres, boutons, modes)
src/windows2.css       ← styles du lot 2 (dialogues, tableaux, analyseurs, espaces de travail)
src/windows3.css       ← styles du lot 4 (tables triables, éditeurs logiques, panneaux surround/sync/machine)
src/windows5.css       ← styles du lot 5 (contrôles de piste, Quick Controls, moniteur MIDI, transpose/vélocité)
src/body.html          ← structure + jeu d'icônes SVG
src/app.js             ← rendu et interactions de la fenêtre de projet
src/windows.js         ← gestionnaire de fenêtres + 13 fenêtres UI + modes/espaces de travail
src/windows2.js        ← 21 fenêtres du lot 2
src/windows3.js        ← 16 fenêtres du lot 4 (+ menus flottants et champs cycliques partagés)
src/windows5.js        ← 8 fenêtres du lot 5 (Track Controls, Quick Controls, Inspector Setup, Modif. MIDI,
                          Personnaliser les menus, Moniteur MIDI, Transposer, Vélocité)
build.py               ← assemble src/ → alpha-studio.html  (python3 build.py)
docs/                  ← livrables documentaires :
  ce-qui-manque-daw-complet.html / .pdf   audit « ce qui manque pour être un vrai DAW »
  comparatif-nuendo4-vs-alpha.html / .pdf  comparatif avec le manuel Nuendo 4 (51 éléments)
  apercu-lots5-8.png                       planche des lots 5 à 8 (projet + 8 fenêtres)
  apercu-interface-1600.png                la fenêtre de projet en 1600 px
  apercu-menus.png                         menus du haut et menus contextuels
  fenetre-mixconsole.png, fenetre-canal-eq.png, fenetre-editeur-midi.png,
  fenetre-editeur-echantillons.png, fenetre-mediabay.png, fenetre-automatisation.png
make_lacunes.py        ← régénère docs/ce-qui-manque-daw-complet.html
make_comparatif.py     ← régénère docs/comparatif-nuendo4-vs-alpha.html
```
```


## 6 bis. Journal des tests (dernier cycle — 19 novembre 2026)

Tous les tests sont automatisés (Playwright/Chromium) et rejoués sur le fichier livré.

| Test | Ce qui est vérifié | Résultat |
|---|---|---|
| t24 | Maj+clic = 2 événements sélectionnés dans une même piste ; bouton Scrub dans la barre d'outils ; outil **Time Warp** → règle passée en Time Linear, `state.rulerTime === 'time'`, courbe appliquée (`warp = 0.134`) | OK |
| t25 | marqueurs de la règle **cliquables** (clic → position 9) ; **menu contextuel** de marqueur (Renommer / Aller / Supprimer / Cycle / Fenêtre) ; badge d'étirement `p-stretch` après redimensionnement en mode **Time Stretch** | OK |
| t26 | clic droit sur la barre d'outils → « Barre d'outils » ; **Track Controls** (vol / pan / EQ) → 14 boutons dans la piste ; **wrap** actif ; fenêtre **Personnaliser les menus** sélectionne « Projet » ; **Moniteur MIDI** reçoit 2 lignes | OK |
| t27 / t28 | passage en **wrap** : hauteur de piste 64 → 82 px, 11 boutons visibles ; retour : hauteur et boutons restaurés | OK |
| t29 / t31 | menu de redimensionnement (3 modes) ; recMode « Prises » ; **jog Shuttle** 2× → `tpJogVal = 2,00×` ; fenêtre **Marqueurs** depuis le transport ; tempoMode track | OK |
| t32 | défilement vertical synchronisé liste ↔ montage (scrollTop 117 → translateY −117 px, pouce 32,4 px) | OK |
| t33 | **Lecture** au clic : `playing = true`, position 9,00 → 9,46 → 9,77 (horloge d'interface, ~0,4 mesure/s au zoom courant), arrêt → `playing = false` | OK |
| t35 | **Ctrl+molette sur la règle** = zoom (barW 64 → 80) ; **Espace** depuis un bouton focalisé lance bien la lecture | OK |
| t36 | **Alt+2** ne change pas l'outil (espace de travail) ; **0** arrête la lecture sans changer d'outil | OK |
| t37 | **Alt+I** masque / rappelle l'inspecteur ; **Alt+O** la ligne d'aperçu ; **Ctrl+I** la ligne d'info | OK |
| t38 / t39 | la frappe dans un champ (`#infoName`) n'est pas interceptée : la valeur reste `Voix Refrain 0XYZ1`, l'outil et la lecture sont inchangés | OK |
| t40 | **Ctrl+A** dans le montage sélectionne les **42 événements** (`42/42` en `.sel`) | OK |
| full2 | **242** actions de menu, **49** sous-menus, **85** stubs documentés, **0** action manquante ; **233** actions exécutées, **0** erreur, **0** erreur de page | OK |
| res | **59** fenêtres × 1280 / 1600 / 1920 px : **0** hors écran, **0** erreur | OK |

## 6. Étude comparative documentée

`docs/comparatif-nuendo4-vs-alpha.html` (+ version PDF imprimable) et `docs/ce-qui-manque-daw-complet.html` (audit des manques + feuille de route en 6 jalons) : nom exact de chaque fenêtre,
éditeur et boîte de dialogue de Nuendo 4, fonction documentée avec la page du manuel officiel,
raccourci par défaut, présence dans ALPHA et écart précis — plus les **modes de fenêtres**
(« Toujours devant », espaces de travail, plein écran, masquage de zones) et la liste de ce qui manque,
par priorité. Sources primaires : manuel Nuendo 4 du 14/09/2007, Version History 4.3.0, Getting Started.
Générateur : `make_comparatif.py` (les données du tableau y sont explicites et modifiables).
Méthode d'extraction : le texte intégral du manuel officiel, non redistribué ici.

> Projet pédagogique, non affilié à Steinberg. « Nuendo », « Cubase » et « VST » sont des marques de Steinberg Media Technologies GmbH ; ALPHA Studio est une interface originale inspirée de leur ergonomie.
