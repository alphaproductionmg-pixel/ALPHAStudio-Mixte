# ALPHA Studio — Matrice de triage de l'audit complet v6 (A01 → A136)

> **Aucune acceptation finale n'est prononcée dans ce document.** Un statut
> « CORRIGÉ (code) » signifie : correction écrite dans le source, vérifiée par
> les tests automatisés disponibles (Node, noyau C++, syntaxe JUCE 8, CI
> Windows). Elle ne remplace jamais le test intégral Windows par l'utilisateur,
> seul capable de confirmer le comportement réel (audio ASIO, MIDI matériel,
> VST3, WebView2). Les points « PARTIEL » et « NON RÉSOLU » restent ouverts.
>
> Source auditée par le rapport v6 : commit `d1e81fb` (0.4.0). État comparé :
> branche `arena/42ddc677-alphastudio-mixte` (0.5.0). Le rapport v6 numérote
> deux fois A112–A121 ; les doublons sont listés ici avec le suffixe « bis ».
> Le triage utilisateur (retours terrain) est tenu dans
> `docs/TRIAGE-AUDIT-UTILISATEUR-0.5.0.md`.

## Légende

| Statut | Signification |
|---|---|
| **CORRIGÉ (code)** | Correction réelle implémentée et couverte par les tests automatisés ; confirmation finale en attente du test intégral Windows. |
| **PARTIEL** | Une partie du point est corrigée ou câblée ; le reste est identifié, non terminé, ou exige du matériel/une validation Windows. |
| **NON RÉSOLU** | Rien d'implémenté à ce jour ; le point reste ouvert et documenté comme tel (aucune simulation, aucun faux succès affiché). |

Règle appliquée partout : là où la fonction réelle n'existe pas encore,
l'interface le dit explicitement (« non implémenté dans cette version ») au
lieu de simuler un résultat.

## 1. Greffons, inserts et traitement du signal

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A01 | Gestion des inserts VST3 incomplète | **CORRIGÉ (code)** | `InsertState` persisté (schema 3), commandes `setInsertBypass`, `pluginBrowser` natif (`AlphaPluginBrowser`, Main.cpp), analyse VST3 réelle `KnownPluginList`. Validation Windows avec vrais VST3 en attente. |
| A18 | Liste de plug-ins affichée ≠ liste réellement installée | **CORRIGÉ (code)** | Bibliothèque alimentée par l'analyse réelle (`library` dans `stateJson`) ; liste fictive supprimée. |
| A19 | Plug-ins VST2 et compatibilité | **NON RÉSOLU** | JUCE 8 ne prend plus en charge VST2. Limitation documentée, aucune annonce VST2 dans l'interface. |
| A20 | Instruments VSTi non démontrés | **PARTIEL** | Fenêtre VST Instruments câblée sur `pluginBrowser`/`openPluginEditor` (A122) ; démonstration réelle exige le test Windows avec un VSTi installé. |
| A21 | État des inserts absent du `.alphaproj` | **CORRIGÉ (code)** | Inserts/sends/quickControls sérialisés, round-trip octet-stable vérifié par `alpha-core.test.cpp`. |
| A22 | Effets internes vs plug-ins externes à distinguer | **PARTIEL** | `InsertState` distingue module interne/externe dans le modèle ; l'affichage complet reste à finir. |
| A23 | EQ et dynamique : couverture limitée | **CORRIGÉ (code)** | `setFx` : 4 bandes (freq/gainDb/q/enabled/type peak-lowShelf-highShelf) + dynamique complète (threshold/ratio/attack/release/makeup). |
| A24 | Ordre du graphe et compensation de délai | **PARTIEL** | `delaySamples` persisté par piste ; compensation de délai du graphe à valider en audio réel. |
| A75 | Plug-in Information : liste fictive et obsolète | **CORRIGÉ (code)** | `AlphaPluginBrowser` natif + `library` réelle ; plus aucune liste inventée. |
| A131 | Mutateur EQ/Dynamics accepte un champ inconnu | **CORRIGÉ (code)** | Champ EQ inconnu → erreur « Champ EQ inconnu » ; champ dynamique inconnu → erreur « Champ de dynamique inconnu » (refus explicite). |

## 2. Pistes, types de pistes et édition

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A03 | Types de pistes non respectés par l'ajout natif | **CORRIGÉ (code)** | `addTrack` accepte `channelType` (audio/midi/instrument/group/fx) ; le pont transmet le type choisi dans l'interface. |
| A25 | Pistes Groupe et FX | **PARTIEL** | `channelType` group/fx persisté et routable ; comportement mixage complet de groupe à valider. |
| A26 | Piste Instrument | **PARTIEL** | Promotion réelle audio→instrument sur réception de notes (`syncChannelFlags`) ; chargement VSTi à démontrer sous Windows. |
| A27 | Piste Tempo et signature rythmique | **PARTIEL** | `tempoEvents`/`signatures` persistés (A136) ; édition graphique complète de la piste tempo reste à câbler. |
| A28 | Piste Arrangeur | **PARTIEL** | La commande « Arrangeur » sélectionne et affiche réellement la piste d'arrangeur du projet et ses marqueurs de cycle ; un modèle de blocs d'arrangeur dans le noyau reste à développer. |
| A29 | Événements audio et édition destructive | **CORRIGÉ (code)** | `processClip` réel : gain, normalisation mesurée, inversion, silence, fondus, bake, conform, saveVersion. Persistance corrigée (revue utilisateur 19/11) : `writeClipToDisk` réécrit le format d'origine (WAV/AIFF/FLAC/OGG via `writeAudioBuffer`, fichier temporaire + contrôle par relecture) ; en cas d'échec d'encodeur, copie WAV fonctionnelle ET références du projet mises à jour — jamais de succès silencieux sans fichier écrit. Chaque opération renvoie une erreur explicite publiée dans `commandResult`. `getPeaks` publie la forme d'onde réelle (min/max par canal). |
| A30 | Collage multi-pistes et assemblage | **CORRIGÉ (code)** | `pasteClips` réellement appelé par Édition ▸ Coller : chaque événement retrouve sa piste et sa position au curseur, écrit dans le projet natif (historisé, annulable) ; Dupliquer passe par `duplicateClip`. |
| A31 | Undo / Redo et historique | **PARTIEL** | Historique natif `getHistory` ; annulation des modifications MIDI locales (A104) toujours ouverte. |
| A32 | Outils Time Warp / Scrub | **PARTIEL** | Étirement varispeed RÉEL (`stretchClip`, interpolateur Lagrange, fichier réécrit) via Audio Warp et « Redresser » du Pool (tempo mesuré par `detectTempo` puis étirement) ; scrub/jog piloté par contrôleur reste à câbler. |
| A33 | Tempo et signature variables | **CORRIGÉ (code)** | Cartes de tempo et de signatures persistées et appliquées (schema 3). |
| A96 | L'ajout de piste perd le type choisi | **CORRIGÉ (code)** | Pont natif : `addTrack` envoie `channelType` dérivé du type du menu (A03). |
| A107 | Menu « Piste de marqueurs » crée une piste audio | **CORRIGÉ (code)** | `markers` normalisé en `marker` : la voie de marqueurs existante est sélectionnée et amenée à l'écran ; plus de piste audio parasite. |
| A121bis | Identifiants de pistes dupliqués après suppression | **CORRIGÉ (code)** | `addTrack` calcule l'identifiant `native_N` depuis le maximum existant, plus depuis la taille du vecteur. |
| A133 | Modèle de piste sans type de canal explicite | **CORRIGÉ (code)** | `TrackState.channelType` + `syncChannelFlags()` (source de vérité). |
| A134 | Routage réduit à un bus indexé | **CORRIGÉ (code)** | `inputDevice`/`outputDevice`/`inputChannel`/`outputChannel`/`midiChannel` + départs multiples `SendState`. |

## 3. Transport, enregistrement, synchronisation

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A34 | Précompte et punch | **PARTIEL** | Paramètres persistés dans l'état moteur ; enregistrement punch réel à valider sous Windows. |
| A35 | Enregistrement sur piste cible | **PARTIEL** | Transport record réel (Engine.h) ; validation matérielle en attente. |
| A36 | Périphériques audio et MIDI | **CORRIGÉ (code)** | Device Setup câblé sur l'état réel (`audioDevices`/`midiDevices` publiés par le moteur), sélecteur ASIO natif. |
| A37 | Monitoring et Control Room | **CORRIGÉ (code)** | Control Room réel (windows2.js) : levels/talkback/dim reliés à l'état moteur, plus de simulation. |
| A38 | Transport et raccourcis | **CORRIGÉ (code)** | play/stop/record/seek/MTC réels ; raccourcis exécutés par le noyau. |
| A86 | Punch In / Punch Out UI ne règle pas le moteur | **PARTIEL** | États transmis ; boucle punch complète à valider. |
| A87 | Sync, Jog, Shuttle et pré/post-roll | **PARTIEL** | MTC réel ; jog/shuttle annoncés honnêtement comme non implémentés (plus de promesse « étape 2 »). |
| A125 | Synchronisation et Machine Control sans protocole matériel | **PARTIEL** | MTC émis/reçu réel ; MMC et verrouillage externe non implémentés, libellés corrigés. |
| A126 | VST System Link et ReWire | **NON RÉSOLU** | ReWire abandonné par Steinberg ; aucune liaison inter-application implémentée. Fenêtre de compatibilité sans fausse promesse. |

## 4. MIDI

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A11 | Éditeur logique MIDI non raccordé | **CORRIGÉ (code)** | Fenêtre `logical` réelle : `applyLogicalEdit` + `lastLogicalTouched` sérialisé ; tests j2-j6 9/9. |
| A39 | Édition MIDI et persistance | **CORRIGÉ (code)** | `MidiNote` persisté, `transposeMidi`, modificateurs MIDI réels. |
| A40 | Entrée MIDI réelle | **CORRIGÉ (code)** | Entrées MIDI matérielles capturées (moniteur `AlphaMidiMonitor`, ring 512) ; validation hardware en attente. |
| A41 | Instrument sonore | **PARTIEL** | Sortie MIDI vers instrument externe réelle ; rendu VSTi à démontrer sous Windows. |
| A42 | Éditeurs avancés | **CORRIGÉ (code)** | Clavier, vélocité et liste écrivent réellement les notes dans le noyau (`setMidiNotes`) ; l'éditeur d'échantillons applique les traitements réels (`processClip`) et affiche la forme d'onde réelle (`getPeaks`). |
| A97 | Transposer / Vélocité annoncent sans exécuter | **CORRIGÉ (code)** | `transposeMidi {trackIndex, semitones}` (Engine.h) + dialogue Vélocité réel (`VELOCITY_REAL`). |
| A98 | Moniteur MIDI : événements aléatoires | **CORRIGÉ (code)** | `getMidiMonitor`/`clearMidiMonitor` : uniquement des événements MIDI réels horodatés. |
| A103 | Moniteur MIDI : activité de test en continu | **CORRIGÉ (code)** | Fabrication d'activité supprimée ; le moniteur ne montre que l'entrée réelle. |
| A104 | Modifications MIDI locales sans contrat d'annulation | **CORRIGÉ (code)** | Toute édition du clavier passe par `setMidiNotes` (mutateur du noyau) → historisée et annulable par `undo`/`redo` réels. |
| A106 | Éditeur de clavier modifie une copie locale | **CORRIGÉ (code)** | L'éditeur charge les notes RÉELLES du projet et chaque modification (dessin, glisser, vélocité, quantification, division) est réécrite dans le noyau (`setMidiNotes`). |
| A119 | List Editor : lignes de démonstration | **PARTIEL** | Libellés honnêtes ; synchronisation native des lignes non terminée. |
| A123 | MIDI Device Manager : ports et Program Change | **PARTIEL** | Périphériques MIDI réels listés par le moteur ; envoi Program Change non démontré. |
| A128 | Entrée CC limitée à deux contrôleurs | **PARTIEL** | CC réels : 7 (volume), 10 (pan), 11 (expression→départ), 1 (modulation→départ), 64 (sustain) et 123 (All Notes Off, coupure réelle des notes vivantes) ; apprentissage CC arbitraire restant. |
| A129 | Modèle MIDI persistant : notes simples uniquement | **PARTIEL** | Notes + transposition persistées ; CC/program change/sysex non persistés. |

## 5. Mixage, bus, automation

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A04 | Architecture des bus et canaux | **CORRIGÉ (code)** | `BusState` étendu (channelType, sortie, inserts, départs), `setBus`, `setMaster`, bus par défaut réels. |
| A43 | Faders, pan, mute, solo, arm | **CORRIGÉ (code)** | `setTrack {field}` : volumeDb (−60..12), pan (−1..1), mute/solo/arm ; écrits depuis la fenêtre Réglages de canal. |
| A44 | Départs FX | **CORRIGÉ (code)** | `addSend`/`setSend`/`removeSend` avec bus, dB, pré/post-fader, enabled ; câblés depuis l'interface. |
| A45 | Canaux d'entrée/sortie et canaux MIDI | **CORRIGÉ (code)** | Routage persisté par piste (A134) + `setTrackField 'bus'`. |
| A46 | Copier/coller et initialiser les réglages de canal | **PARTIEL** | Coller/initialiser envoient désormais les réglages au moteur (EQ, départs, strip) ; presse-papiers inter-pistes complet à valider. |
| A47 | VU-mètres et mesures | **CORRIGÉ (code)** | `getStatistics`/`getSpectrum`/`getPerformance` réels ; remise à zéro réelle des crêtes (`resetMeters`, piste ou tous canaux) ; plus de `Math.random`. Champs minSample/maxSample/sampleRate/bitDepth à vérifier dans `statisticsJson` (risque suivi). |
| A48 | Automation native à valider | **PARTIEL** | Courbes persistées et appliquées linéairement ; validation temp réel en attente. |
| A49 | Conversion UI → courbes natives | **PARTIEL** | `setAutomation` existe ; le panneau Automation reste largement local (A105). |
| A105 | Panneau Automation essentiellement local | **PARTIEL** | Paramètres lus depuis l'état natif ; écriture de courbes depuis le panneau à terminer. |
| A108 | Channel Settings : EQ/départs non envoyés | **CORRIGÉ (code)** | `buildChannel` (windows.js) écrit chaque réglage : `setFx` par bande, `setSend`/`addSend`, `setTrack`/`setMaster`, bypass d'insert, navigateur de greffons. |
| A124 | Surround Panner sans transmission au graphe | **NON RÉSOLU** | Aucun routage surround dans le moteur ; fenêtre sans fausse promesse. |
| A130 | Courbes d'automation : modes d'écriture absents | **PARTIEL** | Points persistés ; modes (touch/write/latch) et cibles de plug-ins non stockés. |
| A135 | Automation : interpolation linéaire seule | **PARTIEL** | Linéaire implémenté et testé ; courbes SCD/exponentielles non implémentées. |

## 6. Projet, import/export, médias

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A06 | Export de piste incorrect | **CORRIGÉ (code)** | `exportTrack` avec `renderOffline(..., onlyTrack)` réel. |
| A50 | Nouveau projet, fermeture, confirmation | **CORRIGÉ (code)** | `newFolder`/`closeProject` natifs avec dialogues Windows réels. |
| A51 | Import audio : cible de piste ignorée | **CORRIGÉ (code)** | `importAudio {startBars, trackIndex}` : la piste sélectionnée reçoit l'événement. |
| A52 | Import de formats d'échange | **CORRIGÉ (code)** | `importOmf`/`importAaf`/`importXml`/`importCd` via `runHeavyExchange` natif (Main.cpp). |
| A53 | Import MIDI | **CORRIGÉ (code)** | SMF importé dans le modèle (parseur varlen corrigé). |
| A54 | Import de projet par glisser-déposer | **CORRIGÉ (code)** | `FileDragAndDropTarget` réel sur la fenêtre Windows : audio, MIDI, projet, OMF/AAF et XML déposés sont importés par le moteur. |
| A55 | Pool et gestion des médias | **CORRIGÉ (code)** | Import/lecture natifs + opérations disque réelles (corbeille, renommage, vérification — voir A121). |
| A56 | MediaBay | **PARTIEL** | Import réel par sélecteur Windows ; indexation de dossiers complète non implémentée (A120). |
| A57 | Autosave et récupération | **PARTIEL** | `autosave`/`restoreAutosave` existent dans le noyau ; cadence et récupération à valider sous Windows. |
| A58 | Formats projet et compatibilité | **PARTIEL** | `.alphaproj` schema 3 avec migration 2→3 + `conform` : rééchantillonnage réel des fichiers au format du projet ; compatibilité Nuendo non revendiquée. |
| A59 | Save Snapshot | **CORRIGÉ (code)** | `saveSnapshot` persisté (`SnapshotState`). |
| A60 | Backup et versions | **CORRIGÉ (code)** | `backupProject` réel + `saveVersion` : copie horodatée réelle du fichier audio, original intact. |
| A61 | Export audio : options limitées | **CORRIGÉ (code)** | WAV, AIFF, FLAC (sans perte) et Ogg Vorbis réellement encodés par JUCE, stems et piste seule ; MP3/WMA remplacés par leurs équivalents fonctionnels réels. |
| A62 | Progression et annulation de rendu | **CORRIGÉ (code)** | Progression réelle + annulation réelle : `cancelRender` interrompt la boucle d'écriture et le fichier partiel est supprimé. |
| A63 | Export MIDI | **CORRIGÉ (code)** | `exportMidi` écrit un SMF réel. |
| A64 | Audio CD (vidéo reportée) | **CORRIGÉ (code)** | `exportCd` natif ; vidéo explicitement exclue jusqu'au test final confirmé. |
| A65 | Durée du rendu hors ligne | **PARTIEL** | `renderOffline` réel ; mesure de durée/échantillons à valider (champs statistics minSample/maxSample). |
| A80 | Batch Processing n'applique rien | **CORRIGÉ (code)** | Chaînes RÉELLEMENT exécutées et VÉRIFIÉES (revue utilisateur 19/11) : exécution séquentielle, chaque opération attend la confirmation du moteur (`sendChecked`/`commandResult`) avant la suivante ; un échec arrête la chaîne de l'événement concerné ; un événement disparu n'est jamais traité ; le résumé final compte les confirmations et les échecs réels (plus de succès fire-and-forget). Couvert par `tests/verified-results.test.js` (5 scénarios fonctionnels). |
| A102 | OMF/AAF/XML/Audio CD annoncés mais refusés | **CORRIGÉ (code)** | Échanges exécutés nativement (`runHeavyExchange`) avec rapport réel dans `exchange`. |
| A112 | Project Setup ne sauvegarde pas | **CORRIGÉ (code)** | `setProjectInfo` écrit dans le fichier projet (auteur, sampleRate, bitDepth, startTimecode). |
| A116 | Fondu : aperçu graphique seul | **CORRIGÉ (code)** | OK/Appliquer écrit la rampe dans les échantillons (`processClip fadeIn/fadeOut`) et réécrit le fichier, avec confirmation moteur avant tout message de réussite ; fondu enchaîné séquentiel vérifié (la sortie doit être confirmée avant l'entrée ; refus si moins de deux événements réels). |
| A117 | Export OMF/AAF : réussite affichée à tort | **CORRIGÉ (code)** | Résultat réel renvoyé par le moteur ; plus de succès inventé. |
| A118 | Export Audio Mixdown : progression simulée, fichier inexistant | **CORRIGÉ (code)** | Export réel (`exportWav`/`exportStems`/`exportTrack`), barre suivant l'état moteur, chemin réel du fichier affiché. |
| A120 | MediaBay/Loop/Sound Browser sans indexation ni insertion | **CORRIGÉ (code)** | `chooseMediaFolder` (sélecteur Windows) + `indexMediaFolder` : lecture réelle de chaque fichier ; insertion directe par `importMediaFile`. |
| A121 | Pool : suppression/renommage/insertion non sécurisés | **CORRIGÉ (code)** | Corrigé en profondeur (revue utilisateur 19/11) : `removeMedia` ne retire les références du projet QUE si `moveToTrash()` a réussi (sinon erreur publiée, projet intact) ; `renameMedia` refuse si la source est absente, si la destination existe ou si le déplacement disque échoue — références intactes en cas d'échec, mises à jour (chemins absolus et relatifs) seulement sur succès vérifié. UI Pool alignée : liste et noms modifiés uniquement sur confirmation moteur. `verifyMedia`, `revealMedia`, `importMediaFile`, corbeille ouvrable inchangés. |
| A112bis | Project Setup (doublon v6) | **CORRIGÉ (code)** | Voir A112. |
| A116bis | Export Audio Mixdown (doublon v6) | **CORRIGÉ (code)** | Voir A118. |
| A117bis | Fondu et fondu enchaîné (doublon v6) | **CORRIGÉ (code)** | Voir A116. |
| A118bis | Detect Silence : régions prédéfinies | **CORRIGÉ (code)** | Analyse de silences annoncée « non implémentée » ; plus de régions inventées. |
| A119bis | Modèle natif sans paramètres Project Setup complets | **CORRIGÉ (code)** | Structure `info` étendue (schema 3) : auteur, sampleRate, bitDepth, startTimecode, notes. |
| A120bis | Listes vides remplacées par des valeurs par défaut | **PARTIEL** | Migration explicite ; conservation « vide = vide » à généraliser. |

## 7. Fenêtres d'analyse, performance, qualité thread audio

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A12 | Allocations dans le thread audio | **CORRIGÉ (code)** | Anneaux préalloués (`AlphaSampleRing`), atomics ; aucune allocation dans le callback. |
| A66 | Verrouillage et pertes de blocs | **PARTIEL** | Lock-free sur les compteurs ; chemin des blocs MIDI à valider en charge réelle. |
| A67 | Audio dropouts / overload | **CORRIGÉ (code)** | `AlphaPerformance` réel : dropouts, overload, blocs traités ; `getPerformance`/`resetPerformancePeaks`. |
| A68 | Thread de rendu et fermeture | **PARTIEL** | `renderOffline` sur thread dédié ; comportement en fermeture à valider sous Windows. |
| A69 | Synchronisation UI / audio | **PARTIEL** | État publié après chaque commande (`buildState`) ; horodatage fin à valider. |
| A70 | Mesures LUFS / True Peak | **CORRIGÉ (code)** | LUFS intégré réel ITU BS.1770 (pondération K par filtres JUCE, blocs 400 ms, double gating) + true peak par suréchantillonnage ×4, affichés dans Statistiques. |
| A77 | Spectrum Analyzer sans FFT réelle | **CORRIGÉ (code)** | `getSpectrum` : FFT réelle du moteur, fenêtre Spectre branchée. |
| A78 | Statistics : résultats aléatoires | **CORRIGÉ (code)** | `getStatistics` calculé depuis les samples réels ; `Math.random` supprimé. |
| A81 | Tempo Track Editor non synchronisé | **CORRIGÉ (code)** | Événements de tempo écrits dans le modèle (`tempoEvents`), `detectTempo` réel. |
| A82 | Control Room en simulation | **CORRIGÉ (code)** | Voir A37. |
| A83 | Connexions VST : validation simulée | **CORRIGÉ (code)** | Fenêtre Connexions branchée sur les bus/périphériques réels du moteur. |
| A84 | Freeze d'instrument : état visuel | **PARTIEL** | `frozen` persisté ; rendu de gel audio réel non implémenté (libellé corrigé). |
| A85 | ReWire sans moteur | **NON RÉSOLU** | Voir A126. |
| A109 | Performance VST : valeurs aléatoires | **CORRIGÉ (code)** | Compteurs réels du moteur (A67) ; plus aucun `Math.random`. |
| A111 | Historique hors ligne : opérations d'exemple | **CORRIGÉ (code)** | Libellés honnêtes + `getHistory` natif ; plus de traitements inventés présentés comme exécutés. |
| A122 | VST Instruments sans instanciation | **CORRIGÉ (code)** | Insert/édition via `pluginBrowser` et `openPluginEditor` natifs (fenêtres réelles de greffons). |
| A132 | Parseur JSON : nombres non conformes acceptés | **PARTIEL** | Parseur durci (schema 3) ; rejet complet des formes non conformes à vérifier. |

## 8. Interface, préférences, espaces de travail

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A88 | Outils d'édition locaux vs modèle natif | **CORRIGÉ (code)** | Marqueurs (`addMarker`/`renameMarker`/`removeMarker`), notes MIDI, traitements d'échantillons, Pool (renommer/supprimer/révéler/vérifier) et disposition (`setUiLayout`) écrits nativement. |
| A99 | Quick Controls ne pilote rien | **CORRIGÉ (code)** | `setQuickControl`/`applyQuickControl` réels (8 emplacements persistés), fenêtre branchée. |
| A100 | Track Controls Settings non appliqué | **PARTIEL** | Réglages persistés par piste ; application à toutes les pistes à câbler. |
| A101 | Personnaliser les menus sans effet réel | **CORRIGÉ (code)** | Les 36 commandes restantes sont devenues des actions RÉELLES (moteur ou interface) ; MENU_STUBS ne conserve que deux entrées documentaires (manuel, support). |
| A110 | Fenêtre Marqueurs : liste réelle | **CORRIGÉ (code)** | Liste lue depuis les marqueurs du projet ; ajout/déplacement/suppression via `addMarker`/`renameMarker`/`removeMarker` avec rafraîchissement réel. |
| A113 | Preferences : réglages non persistés | **CORRIGÉ (code)** | `setPreferences` réel (thème, police, contraste, latence, précompte, sauvegarde auto) appliqué à l'interface (échelle CSS) ; presets stockés/rappelés par `storeWorkspace`/`recallWorkspace`, réinitialisation réelle. |
| A114 | Device Setup non relié | **CORRIGÉ (code)** | Voir A36 : périphériques réels publiés par le moteur, panneaux ASIO natifs. |
| A115 | Key Commands : presets et macros | **PARTIEL** | `keyCommands` persistés (schema 3) ; presets/macros non implémentés. |
| A127 | Espaces de travail non persistés | **CORRIGÉ (code)** | `storeWorkspace`/`recallWorkspace` réels (Engine.h `storeWorkspaceReal`/`recallWorkspaceReal`), fenêtres et verrous inclus. |
| A113bis | Préférences et presets (doublon v6) | **CORRIGÉ (code)** | Voir A113. |
| A114bis | Device Setup (doublon v6) | **CORRIGÉ (code)** | Voir A114. |
| A115bis | Commandes clavier non prouvées (doublon v6) | **PARTIEL** | Voir A115. |

## 9. Pont natif, tests, documentation, dépôt

| Point | Intitulé | Statut | Preuve / reste à faire |
|---|---|---|---|
| A13 | Actions remplacées par des commandes génériques | **CORRIGÉ (code)** | Dispatch réel par commande (`alphaCommand`) ; couche « non disponible » supprimée de tout le dépôt. |
| A14 | Commandes non prises en charge → messages de statut | **CORRIGÉ (code)** | `setStatus` avec libellé « version ultérieure » explicite, plus de « étape 2 » trompeur. |
| A15 | Promesses natives sans délai d'expiration | **CORRIGÉ (code)** | `pending` Map avec `setTimeout`/`clearTimeout` dans le pont (native-bridge.js). |
| A16 | Synchronisation état UI ↔ projet natif | **PARTIEL** | État republié après chaque commande ; synchronisation fine (sélection, position) à consolider. |
| A17 | Représentation simplifiée des pistes dans le pont | **PARTIEL** | `nativeTrackIndex` résout les pistes UI vers l'indice natif ; couverture complète des cas à tester. |
| A71 | Documentation ne décrivant plus le commit | **PARTIEL** | ETAPES/contrats mis à jour ; relecture complète du corpus documentaire restant. |
| A72 | Document « ce qui manque » daté | **PARTIEL** | Voir A71. |
| A73 | Chiffres de couverture non homogènes | **PARTIEL** | Chiffres alignés sur les tests réellement exécutés ; harmonisation finale à refaire après le test Windows. |
| A74 | Tests ne prouvent pas l'audio réel | **PARTIEL** | Tests Node 33 + noyau C++ 7 groupes + syntaxe JUCE 8 + CI Windows verts — mais aucune preuve matérielle : seul le test intégral Windows tranchera. |
| A76 | MediaBay/Loop/Sound Browser : contenu statique | **CORRIGÉ (code)** | Indexation RÉELLE d'un dossier Windows (`indexMediaFolder`) : fichiers lus un à un (durée, fréquence, canaux), liste affichée, double-clic = import réel (`importMediaFile`). |
| A79 | Logical Editor : simulation et action détournée | **CORRIGÉ (code)** | Voir A11 : règles appliquées par le noyau, `lastLogicalTouched` sérialisé. |
| A89 | Tests Web Audio fondés sur des mocks | **PARTIEL** | Mocks assumés et documentés comme tels ; tests matériels impossibles hors Windows. |
| A90 | Tests du pont sur faux backend | **PARTIEL** | Tests réécrits honnêtement (9/9) sur le protocole réel `emitEvent/__juce__complete` ; `tests/verified-results.test.js` ajoute 8 tests FONCTIONNELS vérifiant les résultats (confirmation `commandResult`, séquentialité du batch, arrêt sur échec, aucun envoi pour événement inexistant, aucun faux succès moteur hors ligne) ; backend WebView2 réel en attente. |
| A91 | Test de syntaxe JUCE potentiellement ignoré | **CORRIGÉ (code)** | `tests/juce-syntax.sh` exécuté et bloquant ; échec = rouge. |
| A92 | Tests ne couvrant pas tous les contrats UI | **PARTIEL** | Couverture étendue (audit v6 : 6 tests dédiés dans repair-0.5) ; contrats restants à ajouter. |
| A93 | ReferenceApp non exposée dans l'hôte | **PARTIEL** | Classes natives v6 ajoutées à Main.cpp (browser, library, exchange, print) ; parity complète à vérifier. |
| A94 | Deux interfaces, deux points d'entrée | **PARTIEL** | Hiérarchie documentée (HTML unique construit par `build.py`) ; qualification finale des entrées à écrire. |
| A95 | Archive UI et copies générées | **PARTIEL** | `build.py` régénère l'unique HTML ; copies d'archive à purger après validation. |
| A136 | Format projet sans carte de tempo ni signatures | **CORRIGÉ (code)** | `tempoEvents` + `signatures` dans schema 3, round-trip testé. |

## Synthèse chiffrée (au 19/11/2026 — passage « développer ou remplacer par un équivalent fonctionnel », hors test intégral Windows)

| Statut | Nombre |
|---|---|
| CORRIGÉ (code) | 86 |
| PARTIEL | 50 |
| NON RÉSOLU | 4 (A19 VST2 — abandonné par JUCE 8 ; A85/A126 ReWire — technologie morte ; A124 routage surround) |
| **Total (points v6, doublons inclus)** | **140 lignes de triage pour les 140 intitulés du rapport v6 (séries A112–A121 dédoublées en « bis »)** |

> Rappel : **Aucune acceptation finale.** Chaque « CORRIGÉ (code) » doit être
> confirmé par le test intégral Windows de l'utilisateur (audio ASIO réel,
> MIDI matériel, VST3 installés, WebView2) avant d'être déclaré résolu. La
> liste détaillée des bugs et défauts observés sur machine réelle reste à
> produire ; la vidéo de démonstration est exclue tant que ce test n'est pas
> confirmé.
