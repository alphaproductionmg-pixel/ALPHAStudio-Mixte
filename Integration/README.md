# ALPHA Studio Mixte — intégration moteur / interface

## Répartition des sources

- `UI/AlphaStudio/` : interface finale issue de l'archive ALPHA-Studio-master. Son apparence reste la référence. `build.py` assemble les CSS, le corps, l'interface, le pont natif et le repli Web Audio dans `alpha-studio.html`.
- `Engines/ALPHA-Studio/Source/AlphaProjectCore.h` : noyau de projet C++17 sans JUCE, testable seul (`.alphaproj`, historique illimité, édition, MIDI, DSP, préférences, verrou vidéo).
- `Engines/ALPHA-Studio/Source/Engine.h` : `AlphaEngine` JUCE 8, graphe audio, périphériques, fichiers, enregistrement, rendu, VST3, compteurs et `stateJson()`.
- `Engines/ALPHA-Studio/ReferenceApp/` : ancienne application JUCE de référence, conservée pour consultation et vérifiée pour la compatibilité de syntaxe.
- `Source/AlphaWebMain.h` et `Source/Main.cpp` : hôte Windows/WebView2, fenêtre JUCE, fonction native `alphaCommand`, dialogues de fichiers, export MIDI/WAV/stems et publication périodique de l'état.
- `UI/AlphaStudio/native-bridge.js` : protocole de promesses JUCE 8 (`__juce__invoke` / `__juce__complete`), commandes de l'interface, `replaceState`, historique, glisser-déposer et verrou vidéo.
- `UI/AlphaStudio/src/audio-core.js` et `audio.js` : repli Web Audio J1 de référence, inliné **après** le pont natif.
- `tests/` : lanceur sans npm, tests J1, noyau C++17 J2 → J6, pont WebView2 simulé, faux DOM et serveur HTTP de prévisualisation.
- `docs/J2-J6-contrat.md` et `ETAPES.md` § 0.0 / § 6 : cadrage et workflow actifs.
- `.github/workflows/windows-build.yml` : tests internes puis compilation Windows / WebView2, prévue pour le push final unique.

## Cible et décisions actives

La cible est **Windows / JUCE 8.0.4 / WebView2**, pas un moteur navigateur étendu. L'utilisateur a demandé de coder J1 → J6 d'abord, d'exécuter les tests internes, de faire **un seul push/compile GitHub à la fin**, puis un seul test intégral Windows suivi d'une liste détaillée de bugs / défauts. La vidéo est exclue jusqu'après le test final confirmé : `videoEnabled` est forcé à `false`.

## Capacités codées dans le moteur natif

Le moteur contient notamment : schéma `.alphaproj` versionné, historique illimité avec undo / redo / jump / revert, édition multi-pistes et collage, autosauvegarde / backup / restauration, import audio et projet en base64, import/export MIDI SMF minimal, modèles de projet, graphe pistes → quatre bus → master, faders / pan / mute / solo / armement, EQ 4 bandes, dynamique, automation, VU / crête / LUFS, enregistrement avec précompte / punch / latence, inserts VST3, rendu WAV 48 kHz / 24 bits et stems, préférences, Control Room et compteurs publiés à l'interface.

Ces capacités sont **codées et testées localement**, pas validées en exécution Windows. Les formats OMF / AAF / XML ancien / Audio CD / partition / gravure ne sont pas implémentés et répondent par un statut explicite.

## Repli Web Audio autonome (J1)

Le HTML reconstruit contient le moteur Web Audio sans dépendance : `AudioContext`, ordonnanceur à anticipation, 12 sources synthétisées, boucle A/B, métronome, précompte, gains / mute / solo / panoramique, VU et worklet optionnel. Il est chargé après `native-bridge.js` : si `window.__JUCE__.backend` et `window.ALPHA_NATIVE` existent, il cède la priorité au moteur JUCE et expose seulement les compteurs ; sinon il prend en charge le transport du navigateur. L'archive d'origine `UI/AlphaStudio/SourceArchive/` reste inchangée.

Ce repli couvre J1 uniquement et reste une **référence**, sans extension. Il ne remplace ni le graphe JUCE, ni les plugins VST3, ni l'enregistrement, ni l'export natif. Détails et limites : `docs/J1-contrat.md`.

## Raccordements natifs réalisés

L'interface appelle le moteur pour transport, tempo, création / duplication / suppression de pistes, édition des clips via `replaceState`, mute / solo / armement, volume, historique, sauvegarde, ouverture, import, export, modèles, préférences, Control Room, compteurs et statut. Le pont compare la signature du projet avant d'envoyer `replaceState`, afin d'éviter les niveaux d'historique artificiels. Les commandes vidéo renvoient systématiquement le verrou « après le test final confirmé ». Les niveaux natifs sont appliqués aux VU par identifiant réel (`native_i`) via `ALPHA_AUDIO_METERS.fromNative()`.

Le glisser-déposer envoie les fichiers WAV / MIDI / `.alphaproj` au moteur en base64 ; les boîtes de dialogue JUCE gèrent les import/export par menu. `Source/Main.cpp` publie `stateJson()` à 20 Hz et après chaque commande.

## ASIO, installateur et dépendances

JUCE 8.0.4 est récupéré par CMake `FetchContent`. La prise en charge ASIO est activée par `JUCE_ASIO=1` : le SDK Steinberg 2.3.4 est téléchargé sur le runner Windows par `.github/workflows/windows-build.yml`, référencé via `ALPHA_ASIO_SDK_DIR` et jamais recopié dans le dépôt. Le sélecteur natif `AudioDeviceSelectorComponent` et `AudioIODevice::showControlPanel()` exposent les réglages réels ; WASAPI / DirectSound restent disponibles si aucun pilote ASIO n'est détecté. WebView2 est demandé par `NEEDS_WEBVIEW2 TRUE` et `JUCE_USE_WIN_WEBVIEW2=1` ; le workflow télécharge le package NuGet `Microsoft.Web.WebView2 1.0.1901.177`, copie `WebView2Loader.dll` près de l'exécutable, puis construit `ALPHAStudio-Setup-0.5.0-x64.exe` avec Inno Setup. L'installateur lance le bootstrapper WebView2 Evergreen uniquement si le runtime manque. Détails : `installer/ALPHAStudio.iss`, `installer/THIRD_PARTY_NOTICES.md`, `docs/INSTALLATION-0.5.0.md`.

## Construction et vérification

Configuration CMake : Windows, Visual Studio 2022, CMake 3.22+, Python 3, WebView2. Reconstruire le HTML et lancer tous les tests internes sans npm :

```bash
bash tests/run.sh
```

Le lanceur vérifie la syntaxe du builder, reconstruit le livrable, vérifie la syntaxe JavaScript, exécute les tests J1, compile/exécute le noyau C++17 J2 → J6, exécute les tests du pont WebView2 simulé, la suite de réparation 0.5.0 et refait les `grep` de contrôle. `bash tests/juce-syntax.sh` avec `JUCE_MODULES_DIR` optionnel vérifie aussi la syntaxe C++17 de `Engine.h`, de l'hôte mixte et de l'application de référence avec les en-têtes JUCE 8.0.4 ; l'étape est ignorée si les modules ne sont pas présents. Ce n'est pas une compilation MSVC. La CI Windows ajoute le SDK ASIO, compile en Release, prépare le payload, construit l'installateur et exécute une installation/désinstallation silencieuse.

Prévisualisation du repli navigateur : `python3 tests/serve.py`, puis Espace, C, / et F3.

## Limites avant acceptation

La compilation Windows initiale a réussi, mais l'artefact portable ne permettait pas le test intégral demandé. La passe 0.5.0 a ajouté l'installateur ; l'utilisateur a pu l'installer, puis a signalé une impression de fenêtre imbriquée et des commandes de navigateur. Un correctif d'interface masque désormais la fausse barre de titre HTML en mode natif, neutralise le menu contextuel / la barre d'état / la page d'erreur WebView2, marque les fonctions non implémentées « non disponible » et corrige l'export d'une seule piste. Détails : `docs/INSTALLATION-0.5.0.md` et `docs/TRIAGE-AUDIT-UTILISATEUR-0.5.0.md`. Aucune validation audio/micro sur matériel, aucun audit `pageerror` des 59 fenêtres dans un vrai Chromium, aucun test visuel intégral complet et aucune acceptation explicite. Aucun élément n'est à 100 % avant le test intégral Windows et l'acceptation explicite.
