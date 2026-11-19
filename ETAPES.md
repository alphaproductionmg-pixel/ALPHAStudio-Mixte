# ALPHA Studio — étapes, état d'avancement et méthode de travail

> Document de pilotage. Il répond à trois questions, dans cet ordre :
> **qu'est-ce qui est fait**, **qu'est-ce qui attend**, et **comment on travaille** pour la suite.
> Date : 19 novembre 2026 · Livrable historique : `alpha-studio.html` (947 303 octets).
> Mise à jour J1 : ce document conserve l’état initial ; le **§ 5** décrit le jalon J1 codé et testé dans le dépôt mixte.

## 0.0 Méthode verrouillée par l’utilisateur (prioritaire sur les sections historiques)

> Les anciennes règles de « stop / continuer » après chaque jalon (§ 3.1, § 3.6, § 4, § 5.5) sont **archivées** : elles ne décrivent plus le workflow actif. Elles restent visibles pour l’historique du document, mais les décisions ci-dessous priment.

| Sujet | Décision active |
|---|---|
| Plateforme | **Windows / JUCE 8 / WebView2**, moteur complet destiné à un test visuel intégral |
| Séquence | **Coder J1 → J6 d’abord**, tests internes de l’assistant, **un seul push/compile GitHub à la fin**, puis **un seul test intégral Windows** par l’utilisateur, puis liste détaillée de bugs / défauts |
| Périmètre | **`ETAPES.md` avec nos modifications** ; le `README.md` C++20 racine n’est pas la consigne active |
| Vidéo | **Exclue** : « hors test … dernière étape », ajout seulement **après le test final confirmé** ; `videoEnabled = false` est verrouillé |
| Repli J1 | Interface / Web Audio J1 **déjà codée**, conservée comme **référence**, sans extension : le moteur cible est JUCE/WebView2 |
| Propreté | « tests de ton coté / moi sur Windows / code propre / compile sur GitHub à la fin » |
| Acceptation | Aucun élément à **100 %** avant compilation Windows finale, test visuel intégral et acceptation explicite de l’utilisateur |

Détail d’implémentation et limites : `docs/J2-J6-contrat.md`. Ancien repli navigateur : `docs/J1-contrat.md`.

---

## 0. Vue d'ensemble en une image

```
ÉTAPE 1  ── INTERFACE ──────────────────────────────  ●●●●●●●●●●  livrée (segments 1 à 8)
ÉTAPE 2  ── MOTEUR AUDIO ───────────────────────────  ●●●●●○       J1→J6 codés, test Windows à faire
   J1  Le son (lecture, horloge, mixage de base)      ●  Web Audio de référence conservé
   J2  Édition avancée + sauvegarde du projet         ●  noyau C++ + pont natif, tests internes PASS
   J3  Enregistrement micro                           ●  moteur JUCE codé, exécution Windows à valider
   J4  Mixage, routage, automatisation appliquée      ●  moteur JUCE codé, exécution Windows à valider
   J5  MIDI, instruments, export                      ●  SMF + WAV 48 kHz/24 bits, exécution à valider
   J6  Finitions hors vidéo                           ◐  préférences / modèles / backup codés ; vidéo verrouillée
```

---

## 1. Ce qui est fait

### 1.1 Les huit étapes d'interface (toutes livrées et testées)

| # | Étape | Ce qui a été livré | Vérification |
|---|---|---|---|
| 1 | **Socle** | Fenêtre de projet complète : barre de menus, barre d'outils, ligne d'info, inspecteur, règle, liste des pistes, timeline, ligne d'aperçu, transport flottant, barre d'état. Feuille de style Nuendo 4 (Tahoma 11 px, ambre/vert). | 0 erreur à l'ouverture, 3 résolutions |
| 2 | **Fenêtres — lot 1** | 13 fenêtres : Mixer, Réglages de canal, Automatisation, Éditeur d'échantillons, Éditeur de clavier, MediaBay, Pool, Instruments VST, Connexions VST, Marqueurs, Historique, Aide-mémoire, Nettoyage. Gestionnaire flottant (déplacer, réduire, agrandir, redimensionner, premier plan). | ouvertes / fermées sans erreur |
| 3 | **Fenêtres — lot 2** | 22 fenêtres : Performances, Tempo, Navigateur de projet, Feuille de pistes, Configuration, Préférences, Périphériques, Commandes clavier, Vidéo, Control Room, Export mixage, Fondus, Détection de silences, Analyseur de spectre, Statistiques, Partie audio, Éditeur de liste, Loop/Sound Browser, Mise en page, Espaces de travail. | 51 fenêtres × 3 résolutions |
| 4 | **Fenêtres — lot 4** | 16 fenêtres : Info plug-in, Logical Editor, Input Transformer, Project Logical Editor, MIDI Device Manager, Track Presets, Quantize, Beat Calculator, Import Medium, OMF, Batch, Surround Panner, Synchronisation, Machine Control, VST System Link, ReWire. Tables triables, champs cycliques, menus flottants. | audit complet, 0 erreur |
| 5 | **Fenêtres — lot 5** | 8 fenêtres : Track Controls Settings, Quick Controls, Inspector Setup, Modificateurs MIDI, Personnaliser les menus, Moniteur MIDI, Transposer, Vélocité. **Total : 59 fenêtres.** | 59 × 1280/1600/1920 : 0 hors écran |
| 6 | **Menus et actions** | 9 menus, **458 entrées** (dont 49 sous-menus, 409 feuilles), **242 actions distinctes** toutes implémentées, **85** commandes encore documentaires. Menus contextuels complets (événement, piste, dossier, règle, zone vide, marqueur, barre d'outils). | full2 : 233 actions exécutées, 0 exception |
| 7 | **Édition réelle** | Déplacer, redimensionner (Normal / Moves Contents / Time Stretch), diviser, copier / couper / coller, supprimer, dupliquer, nudge, fondus entrée/sortie, volume d'événement, sélection rectangle, Ctrl+clic, Maj+clic, **Ctrl+Z (40 niveaux)**, Ctrl+A. Outils Line (5 modes), Couleur, Time Warp, Scrub. | t24, t25, t40 |
| 8 | **Pistes, règle, transport** | Règle à 7 formats + Time Linear, marqueurs cliquables et éditoriaux ; liste des pistes complète (type, verrou, base de temps, lanes, automatisation, redimensionnement Ctrl, sélection multiple, dossiers, wrap) ; transport élargi (jog/shuttle 5 vitesses, pré/post-roll, Auto-Quantize, modes d'enregistrement et de cycle, tempo FIX/TRK) ; défilement vertical synchronisé. | t24 → t42, res.py |

### 1.2 Ce que fait réellement le fichier aujourd'hui

- 59 fenêtres s'ouvrent, se déplacent, se réduisent, s'agrandissent et se ferment.
- On sélectionne, déplace, coupe, colle, annule ; on change la grille, le zoom, le format de règle.
- **Espace fait avancer le curseur** (horloge d'interface), le cycle reboucle pour de vrai.
- On dessine une courbe d'automatisation au Line tool, on change la couleur d'une piste, on mute, on solo.
- 42 événements, 18 lignes de piste (dont 9 pistes sonores), 8 marqueurs, 119 notes MIDI dans l'éditeur de clavier.

### 1.3 Ce que le fichier **ne fait pas**

- **Aucun son.** Zéro `AudioContext`, `AudioWorklet`, `decodeAudioData`, `getUserMedia`, `OfflineAudioContext`, `requestMIDIAccess` dans tout le fichier.
- **Aucun fichier.** Aucun `FileReader`, aucun `Blob`, aucun téléchargement : ni import, ni export, ni sauvegarde de projet.
- **Aucune persistance** sauf la position des fenêtres (`localStorage['alpha.workspaces']`).

> Ces trois lignes décrivent l’**archive d’origine** (`UI/AlphaStudio/SourceArchive/`), volontairement inchangée. Le livrable reconstruit par `UI/AlphaStudio/build.py` contient maintenant le jalon J1 décrit au § 5.

---

## 2. Ce qui est en attente

### 2.1 Étape 2 — les six jalons (dans l'ordre imposé : le son d'abord)

| Jalon | Objet | Taille | Critère de réussite (test binaire) | État |
|---|---|---|---|---|
| **J1** | **Le son** : `AudioContext`, worklet de mixage, ordonnanceur à anticipation, lecture des pistes par synthèse, boucle réelle, métronome audible, VU et faders branchés | XL | J'appuie sur Espace : ça sonne, ça boucle, le curseur suit sans dérive après 10 min | **codé, tests automatiques PASS ; écoute navigateur à valider** |
| **J2** | **Édition avancée + sauvegarde** : pile d'annulation illimitée branchée sur la fenêtre Historique, collage multi-pistes, assemblage, format de projet `.alphaproj` (JSON versionné + médias), autosauvegarde, import par glisser-déposer | L | Je déplace 20 événements, je fais 30 Ctrl+Z, je ferme et rouvre : tout est intact | **codé, tests internes PASS ; test intégral Windows à faire** |
| **J3** | **Enregistrement** : `getUserMedia`, arming par piste, décompte, punch in/out, écriture des prises, compensation de latence | L | J'enregistre 8 mesures au métronome : la prise est alignée à < 5 ms | **codé côté moteur JUCE, tests internes PASS ; matériel Windows à valider** |
| **J4** | **Mixage** : graphe pistes → bus → FX → master, faders / pan / mute / solo réels, EQ 4 bandes et dynamique en worklet, automatisation lue, VU / crête / LUFS | XL | Une automation de volume est rejouée à l'identique ; mute/solo coupent le signal | **codé côté moteur JUCE, tests internes PASS ; exécution Windows à valider** |
| **J5** | **MIDI et rendu** : Web MIDI, instrument interne (synthèse ou SoundFont), capture et boucle, éditeurs MIDI qui modifient le son, export WAV par `OfflineAudioContext` (dither, stems) | XL | J'enregistre une partie MIDI, je l'exporte en WAV 48 kHz/24 bits : identique à ce que j'entends | **codé côté moteur JUCE, tests internes PASS ; oreille Windows à valider** |
| **J6** | **Le reste** : vidéo (décodage, poursuite, bande son), Control Room réelle, préférences agissantes, modèles de projet, accessibilité clavier, sauvegarde de secours | M | Je charge une vidéo, je cale un événement sur l'image, j'exporte la séquence avec la vidéo | **finitions hors vidéo codées ; vidéo exclue jusqu'après test final confirmé** |

### 2.2 Dettes techniques connues (à traiter dans le jalon concerné)

| Dette | Impact | À traiter en |
|---|---|---|
| 85 commandes de menu répondent encore « étape 2 » | l'utilisateur clique et n'obtient qu'un message | J1 → J6, chacune à son jalon |
| Fenêtres présentes mais inertes : Logical Editor, Track Presets, Pool (import), Arranger, Éditeur de tempo, Synchronisation | l'écran promet plus que le code ne fait | J2 / J4 / J5 |
| Pile d'annulation limitée à 40 niveaux, non branchée sur la fenêtre Historique | Ctrl+Z perd les opérations anciennes | J2 |
| `Ctrl+molette` = zoom, mais pas de zoom vertical ni de zoom avant/arrière sur la molette seule (choix assumé) | comportement différent de Nuendo | fin J1 |
| Collage multi-pistes et assemblage non implémentés | collage limité à la piste d'origine | J2 |
| Quantification MIDI décorative | les valeurs ne changent pas les notes | J5 |
| Pas de tests automatisés dans l'archive (scripts Playwright hors paquet) | la non-régression dépend d'une relecture | avant J1 (voir § 3.5) |

### 2.3 Deux décisions à prendre avant de coder J1

| Sujet | Choix recommandé | Conséquence si l'on choisit l'autre |
|---|---|---|
| **Origine du son** | sources **synthétisées** (oscillateurs + bruit filtré + enveloppes) pour les 9 pistes sonores qui portent des événements | importer de vrais fichiers tout de suite reporte J1 et exige J2 (fichiers, décodage) d'abord |
| **Périmètre de J1** | J1 = « ça sonne », rien de plus : pas d'EQ, pas d'automatisation, pas d'enregistrement | un J1 trop large devient un J1 impossible à valider, et la démo reste muette plus longtemps |

> **Décisions prises pour J1** : sources synthétisées, périmètre étroit, et repli Web Audio autonome qui cède la priorité au pont JUCE/WebView2. Détail et conséquences au § 5.2.

---

## 3. Mode de travail à suivre pour la suite

### 3.1 Ancien principe (archivé, non actif)

> **Remplacé par § 0.0** : l'utilisateur a demandé de coder J1 → J6 sans arrêt entre jalons, avec tests internes, un seul push/compile final, puis un seul test intégral Windows.

```
 ① CONTRAT   → on écrit le critère de réussite du jalon, en une phrase testable
 ② SOCLE     → on code le minimum qui fait marcher ce critère (pas plus)
 ③ PREUVE    → on teste automatiquement + à la main, on capture la preuve
 ④ LIVRAISON → build, docs, archive, notes de version
 ⑤ DÉCISION  → on s'arrête, tu valides, on passe au jalon suivant
```

Historiquement, aucun jalon ne commençait avant validation du précédent. Cette règle de « stop / continuer » n'est plus appliquée.

### 3.2 Découpage interne d'un jalon (exemple : J1)

| Segment | Contenu | Sortie vérifiable |
|---|---|---|
| J1.a | `AudioContext` créé au premier geste, `state.clock` branché sur `currentTime`, curseur piloté par l'horloge | le curseur ne dérive pas sur 10 min (mesure de dérive) |
| J1.b | générateurs par piste (oscillateur + enveloppe + filtre), 12 sources, gain de piste | chaque piste s'entend seule, mute coupe, solo isole |
| J1.c | boucle A/B réelle, métronome audible, précompte | la boucle repart au bon endroit, le clic tombe sur la mesure |
| J1.d | VU-mètres et faders reliés à des nœuds de gain réels | le fader change le niveau mesuré, pas seulement l'affichage |
| J1.e | arrêt / reprise sans clic audible, `suspend`/`resume` propres, mémoire libérée | pas de « pop », pas de fuite après 10 ouvertures |

Chaque segment se termine par un test nommé (`j1a`, `j1b`…) et une entrée dans le journal des tests du README.

### 3.3 Règles d'ingénierie (héritées des huit étapes, elles ont marché)

1. **Un seul fichier livrable.** Tout reste inliné par `build.py`. Aucune dépendance, aucun réseau, aucune police externe.
2. **Source séparée, jamais éditée deux fois.** On modifie `src/`, on reconstruit, on ne touche jamais `alpha-studio.html` à la main.
3. **Patchs ancrés et vérifiés.** Toute modification par script est suivie d'un `grep` de contrôle ; un `assert` échoué signifie « fichier non écrit », pas « presque bon ».
4. **Zéro erreur de page.** `pageerror` doit rester vide sur toutes les fenêtres, à toutes les résolutions. Une erreur console = une régression, pas un détail.
5. **Rien d'affirmé sans mesure.** Chaque chiffre du README et des documents est reproductible par un test ou une commande.
6. **On documente ce qui n'est pas fait.** Les 85 commandes documentaires sont assumées et listées ; on ne fait pas croire que c'est fini.
7. **Retour arrière toujours possible.** Avant un lot, copie de `src/` ; en cas de régression non résolue en une passe, on restaure.

### 3.4 Les fichiers du dossier de travail

| Fichier | Rôle | Qui le modifie |
|---|---|---|
| `src/*` | la vérité du code | moi, jamais à la main dans le livrable |
| `alpha-studio.html` | produit par `build.py` | personne directement |
| `README.md` | documentation vivante + journal des tests | moi, à chaque lot |
| `make_lacunes.py` | génère l'audit | moi, quand les chiffres changent |
| `make_comparatif.py` | génère le comparatif | rarement (données du manuel) |
| `docs/` | documents livrés au lecteur | produit par les deux scripts |
| `LISEZ-MOI.txt` | mode d'emploi de l'archive | à chaque version diffusée |

### 3.5 La non-régression, concrètement

Trois niveaux de test, à rejouer avant **chaque** livraison :

| Niveau | Ce qu'il couvre | Durée | Quand |
|---|---|---|---|
| **Fumée** | ouverture, 0 `pageerror`, 59 fenêtres ouvrables, lecture qui avance | ~15 s | à chaque build |
| **Fonctionnel** | les tests t1 → t42 : édition, menus, raccourcis, transport, règle, pistes | ~2 min | avant chaque livraison |
| **Audit** | `res.py` (59 fenêtres × 3 résolutions) + `full2.py` (233 actions exécutées) | ~30 s | avant chaque livraison |

**Recommandation forte pour J1** : verser ces scripts dans `tests/` de l'archive, avec un `npm`-free lanceur `tests/run.sh`. Aujourd'hui ils vivent hors du paquet, donc l'archive n'est pas auto-vérifiable : c'est la première dette à payer.

> **Dette payée en J1** : `tests/run.sh`, `tests/j1-core.test.js`, `tests/j1-runtime.test.js`, `tests/j1-static.test.js` et le faux navigateur `tests/support/harness.js` sont dans le dépôt. Le lanceur reconstruit le HTML, vérifie la syntaxe, exécute les tests nommés `j1a` → `j1e` et fait les `grep` de contrôle, sans npm.

### 3.6 Ancienne attente par jalon (archivée, non active)

> **Remplacé par § 0.0** : plus de validation navigateur après chaque jalon ni de « stop / continuer ». Un seul test intégral Windows aura lieu après le push/compile final.

1. Valider le critère du jalon.
2. Trancher les choix listés en § 2.3.
3. Tester à la main 2 minutes sur navigateur.
4. Dire stop ou continuer.

### 3.7 Calendrier proposé (indicatif, en séances de travail)

| Séance | Contenu | Livrable de fin de séance |
|---|---|---|
| 1 | Contrat J1 + J1.a (horloge) + J1.b (sources) | un projet qui **sonne** déjà, même sans mixage |
| 2 | J1.c, J1.d, J1.e + preuves + docs | J1 complet, validé par toi |
| 3 | J2 : persistance `.alphaproj`, annulation illimitée, import | projet qui se sauvegarde et se recharge |
| 4 | J3 : enregistrement micro | une prise réelle dans la timeline |
| 5-6 | J4 : mixage et automatisation appliqués | console vivante, VU réels |
| 7-8 | J5 : MIDI et export WAV | un fichier son qui sort du logiciel |
| 9 | J6 + finitions + documents définitifs | version 1.0 de démonstration |

---

## 4. Résumé historique (remplacé par § 0.0)

- **Fait** : toute l'interface (8 étapes), 59 fenêtres, 458 entrées de menu, édition réelle, tests J1 sans erreur.
- **J1** : repli Web Audio autonome conservé comme référence ; il n'est pas étendu et ne prouve pas le moteur Windows.
- **Codé maintenant** : noyau C++ J2 → J6, `AlphaEngine`, hôte WebView2, pont natif, dialogues, autosauvegarde, import/export MIDI et WAV, historique illimité, vidéo verrouillée.
- **En attente** : un seul push/compile GitHub final, compilation Windows effective, un seul test intégral visuel/fonctionnel de l'utilisateur, puis liste détaillée de bugs / défauts.
- **Méthode active** : tests internes de l'assistant, propreté du code, compilation GitHub à la fin, aucun 100 % avant acceptation utilisateur.

---

## 5. J1 — contrat, décisions, preuves et limites

### 5.1 Contrat validable

> **Dans le livrable navigateur autonome, une pression sur Espace crée un `AudioContext`, fait entendre les événements des pistes par synthèse, boucle réellement entre `cycleL` et `cycleR`, rend le métronome et le précompte audibles, et le curseur suit `currentTime` sans dérive mesurable après 10 minutes.**

Le critère est inchangé ; seule l’architecture d’exécution est précisée : ce dépôt est **mixte**. Le moteur JUCE/WebView2 garde la priorité quand `window.ALPHA_NATIVE` existe. Sinon, le fichier HTML unique utilise un moteur Web Audio autonome. L’archive d’origine et la feuille de style Nuendo 4 ne sont pas modifiées.

### 5.2 Décisions prises

| Sujet | Décision | Conséquence assumée |
|---|---|---|
| Origine du son | **sources synthétisées** : 12 définitions d’instruments (kick, snare, hat, basse, guitares, rhodes, voix, chœurs, percussions, nappe, pad) + clic | aucun import / décodage de fichier en J1 ; J2 reste nécessaire pour les médias |
| Périmètre | **J1 = « ça sonne »** : horloge, ordonnanceur, boucle, métronome, précompte, gains, mute/solo, pan, VU, arrêt propre | pas d’EQ appliquée, pas d’automatisation rejouée, pas d’enregistrement, pas de MIDI, pas d’export, pas de vidéo |
| Architecture | **repli Web Audio** dans `src/audio-core.js` + `src/audio.js`, inclus par `build.py` après `native-bridge.js` | le moteur natif n’est pas remplacé ; les compteurs reçoivent aussi `levelL` / `levelR` du pont JUCE |
| Horloge | `state.clock` lit `AudioContext.currentTime` ; `setPlayhead()` ne quantifie pas la grille | pas d’accumulation de `setInterval`, donc pas de dérive de curseur |
| Worklet | `AudioWorkletProcessor` optionnel `alpha-mix` (écrêtage doux), avec repli direct si `addModule(blob:)` est refusé | compatible navigateur servi en HTTP ; le chemin `file://` non sécurisé n’est pas garanti |

### 5.3 Segments et preuves automatiques

| Segment | Sortie | Test |
|---|---|---|
| **J1.a** | contexte créé au premier Espace, `state.clock`, curseur exact | `j1a` : 600 s d’horloge simulée → mesure 301, dérive 0 |
| **J1.b** | graphe `voix → gain/analyseur/pan → master`, 12 sources, oscillateurs + bruit filtré + enveloppes | `j1b` : 9 pistes sonores, oscillateurs, `AudioBufferSourceNode`, nœuds de gain ; piste vidéo exclue |
| **J1.c** | vraie boucle A/B, clics sur les temps, précompte d’une mesure | `j1c` : frontière 17 → 9, clic métronome, 4 clics de précompte |
| **J1.d** | faders / mute / solo / pan sur de vrais `AudioParam`, VU depuis `AnalyserNode` | `j1d` : −6 dB → gain 0,501, mute/solo → 0, RMS et crête mesurés, compteurs natifs |
| **J1.e** | rampe de 20 ms avant `suspend`, annulation des voix, libération sur `pagehide` | `j1e` : 10 cycles lecture/arrêt, un seul `AudioContext`, zéro voix active, `close()` vérifié |

Commande reproductible :

```bash
bash tests/run.sh
```

Le lanceur historique effectuait : reconstruction de `UI/AlphaStudio/alpha-studio.html`, `node --check` sur les sources, 14 tests Node natifs, puis les `grep` de contrôle. La version active du lanceur ajoute le noyau C++17 J2 → J6 et les tests du pont WebView2 simulé, toujours sans paquet npm.

### 5.4 Ce qui n’est **pas** fait / pas encore prouvé

- **Écoute sur haut-parleurs non mesurée** : le bac à sable n’a pas de périphérique audio ni de navigateur installé. Les tests utilisent un `AudioContext` simulé ; la validation ergonomique et la dérive réelle après 10 minutes demandent le test manuel de l’utilisateur.
- **Zéro `pageerror` sur 59 fenêtres non rejoué ici** : les scripts Playwright historiques ne sont pas dans l’archive. Le DOM est simulé pour le moteur J1, pas pour les 59 fenêtres.
- **Moteur JUCE toujours non compilé ni validé** dans ce dépôt ; J1 Web Audio est un repli, pas une preuve du moteur natif.
- **J2 → J6 codés mais non validés en exécution Windows** : le noyau, l'hôte JUCE et le pont existent ; la compilation MSVC, l'audio réel, les 59 fenêtres et l'ergonomie relèvent du test intégral final. La vidéo reste verrouillée ; les formats OMF / AAF / XML / CD sont explicitement signalés comme non implémentés.
- **Préférences et périphériques** : les fenêtres existent toujours, sans effet sur le contexte audio.

### 5.5 Ancienne validation navigateur (archivée, non active)

> **Remplacé par § 0.0** : ce test J1 navigateur n'est plus une porte d'entrée obligatoire avant J2. Le test demandé par l'utilisateur est unique, Windows, visuel et fonctionnel, après le push/compile final.

1. Servir le repli J1 en HTTP et appuyer sur **Espace**.
2. Activer **C**, **/**, ouvrir **F3**, bouger un fader, essayer **M** et **S**.
3. Activer « Précompte » puis relancer la lecture.
4. Mesurer la dérive J1 après 10 minutes.
5. Historiquement : dire **stop** ou **continuer** ; cette étape n'est plus imposée.



---

## 6. J2 → J6 — décisions verrouillées et état local (19 novembre 2026)

Cette section est la **source de vérité active** avec le § 0.0 et `docs/J2-J6-contrat.md`.

### 6.1 Workflow

1. J1 → J6 sont codés d'abord, sans validation intermédiaire de l'utilisateur.
2. Les tests internes sont exécutés par l'assistant : `bash tests/run.sh` (HTML, JavaScript, noyau C++17, pont WebView2 simulé), syntaxe JUCE 8.0.4 hors Windows, `git diff --check`.
3. **Un seul** push/compile GitHub à la fin déclenche `.github/workflows/windows-build.yml`.
4. L'utilisateur fait **un seul test intégral** du moteur complet sur Windows et renvoie les bugs / défauts détaillés.
5. La vidéo reste après ce test confirmé ; aucun 100 % avant acceptation.

### 6.2 Ce qui est codé

| Domaine | Fichiers | État local |
|---|---|---|
| Noyau projet J2 → J6 | `Engines/ALPHA-Studio/Source/AlphaProjectCore.h`, `tests/alpha-core.test.cpp` | schéma 2 `.alphaproj`, JSON UTF-8, historique illimité, undo / redo / jump / revert, édition, EQ / dynamique / LUFS / dither, SMF, préférences, Control Room, vidéo verrouillée |
| Moteur audio | `Engines/ALPHA-Studio/Source/Engine.h` | graphe JUCE, pistes / bus / master, enregistrement, punch, import, démo, modèles, autosauvegarde, backup, rendu WAV, VST3, compteurs, `stateJson()` |
| Hôte Windows | `Source/Main.cpp`, `Source/AlphaWebMain.h`, `CMakeLists.txt` | WebView2, `alphaCommand`, dialogues de fichiers, export MIDI/WAV/stems, publication d'état, build CMake / JUCE 8.0.4 |
| Interface | `UI/AlphaStudio/native-bridge.js`, `src/audio.js`, `build.py` | protocole de promesses JUCE 8, commandes, historique visuel, édition par `replaceState`, glisser-déposer, compteurs par identifiant réel, repli J1 conservé |
| Tests / CI | `tests/run.sh`, `tests/j2-j6-native.test.js`, `.github/workflows/windows-build.yml` | non-régression locale et compilation Windows prévue en fin de séquence |

### 6.3 Limites avant le test final

Aucune exécution Windows/WebView2, aucune carte son, aucun microphone, aucun audit Chromium des 59 fenêtres, aucune acceptation utilisateur. La compilation GitHub initiale a réussi, mais son artefact était un ZIP portable : l'utilisateur a demandé une **version installable** pour pouvoir faire le test complet. La passe corrective ci-dessous garde le même verrou : tests internes locaux verts, puis **une seule** compilation/push GitHub finale, conformément à `github_timing=at_end`. Les pourcentages de progression ne doivent pas atteindre 100 % avant le test intégral et la liste de bugs / défauts.

---

## 7. Passe corrective 0.5.0 — version installable et réparation (19 novembre 2026)

L'utilisateur a signalé : pas d'installateur, interface non adaptée au Full HD, fenêtres impossibles à déplacer / réduire / redimensionner convenablement, police non alignée sur le réglage Windows, réglages du pilote ASIO invisibles et test intégral non terminé. Le rapport d'audit statique joint a été pris en compte. Le plan d'action a été présenté puis approuvé ; aucune autre validation de cadrage n'est demandée.

### 7.1 Choix actifs

- **Inno Setup léger** : `installer/ALPHAStudio.iss` produit `ALPHAStudio-Setup-0.5.0-x64.exe`.
- **WebView2 Evergreen en ligne** : bootstrapper officiel Microsoft exécuté seulement si le runtime est absent ; pas de runtime 100 % hors ligne.
- **Version `0.5.0`**, Windows x64, `windows-2022`.
- **ASIO réel** : `JUCE_ASIO=1`, SDK Steinberg 2.3.4 téléchargé par GitHub Actions, jamais vendored ; sélecteur JUCE et panneau constructeur.
- **Vidéo toujours exclue** jusqu'après le test final confirmé. J1 Web Audio reste une référence.

### 7.2 Réparations codées

| Domaine | Réparation |
|---|---|
| Installateur | payload installable, menu Démarrer, désinstalleur, notices tiers, bootstrapper WebView2, test CI installation/désinstallation silencieuses, artefact dédié |
| Fenêtre / Full HD / DPI | dimension initiale depuis `Display::userArea`, limites 800×500 → 3840×2160, état de fenêtre mémorisé, adapter / réduire / agrandir / restaurer, glisser la barre de titre, `TextScaleFactor` Windows, zoom UI et zoom texte séparés |
| Interface | `min-width:1080px` supprimé, zoom WebView2 piloté par `--alpha-ui-scale`, toutes les tailles de police absolues converties en `calc(... * var(--alpha-font-scale))`, commandes visibles dans la barre d'état |
| ASIO | types et périphériques réels dans `stateJson()`, `AudioDeviceSelectorComponent`, `showControlPanel()`, valeurs dynamiques dans la fenêtre Périphériques, plus de « Alpha ASIO Driver » statique |
| Audit A1 / S1 / S8 | automation aplatie en tableaux fixes hors callback audio, 128 notes live préallouées, précompte explicitement silencieux pour les pistes avec métronome master séparé |
| Audit A2 / A5 | moteur retenu par `shared_ptr` pendant l'export, annulation coopérative, attente réelle sans 5 s arbitraire, longueur WAV calculée depuis la durée source et le ratio |
| Audit A3 / A4 / A6 | import audio sur `trackIndex`, extension réelle conservée/détectée, import `.alphaproj` avec recopie des médias et réécriture des chemins |
| Audit S2 / S3 / S4 / S5 / S6 | SMF borné, formats 0/1 et PPQN réel, Note Off avant Note On, JSON numérique strict, paires UTF-16 validées |
| Audit S7 / S9 | promesses natives avec délai / erreur / nettoyage, découpe du callback audio à la frontière exacte de boucle |

### 7.3 État et verrou final

Les tests locaux couvrent le noyau C++17, le pont WebView2 simulé, le livrable HTML autonome, l'installateur, le workflow, la fenêtre / DPI / ASIO et les corrections d'audit. Ils ne remplacent ni MSVC/WebView2 réel, ni le matériel audio, ni le test visuel intégral. Le push/compile GitHub de cette passe corrective a été exécuté après tests locaux verts. L'utilisateur a ensuite pu installer la version, mais son premier retour a ouvert une nouvelle passe corrective ci-dessous ; le test intégral n'est donc pas terminé. Aucun élément n'est à 100 % avant acceptation.

### 7.4 Correctif d'interface après premier retour utilisateur

L'utilisateur a signalé une impression de « fenêtre dans une fenêtre », des commandes de type navigateur et des entrées de menu peu claires. L'audit statique joint, basé sur `d1e81fb` / `0.4.0`, a été trié dans `docs/TRIAGE-AUDIT-UTILISATEUR-0.5.0.md`. Ce correctif :

- garde uniquement la barre de titre Windows, masque la fausse barre HTML et supprime le liseré / fond navigateur ;
- désactive le menu contextuel WebView2, sa barre d'état, sa page d'erreur et les raccourcis Retour / Suivant / Recharger / Rechercher ;
- marque les commandes non implémentées « non disponible » et cesse de détourner `closeProject`, `addFX` et `midiLogical` ;
- corrige `exportTrack` avec `trackIndex` et `renderOffline(..., onlyTrack)` ;
- déplace « adapter à l'écran » dans la barre d'état ;
- documente les points d'audit déjà corrigés côté source et ceux qui restent ouverts.

Cette passe ne corrige pas tous les A01→A136, ne valide pas le matériel audio ni les 59 fenêtres. Test intégral Windows, moteur complet validé visuellement, liste détaillée de bugs / défauts et acceptation finale restent ouverts.
