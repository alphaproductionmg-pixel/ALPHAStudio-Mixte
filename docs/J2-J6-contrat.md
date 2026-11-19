# J2 → J6 — moteur Windows / JUCE 8 / WebView2

Date : 19 novembre 2026 · Branche : `arena/42ddc677-alphastudio-mixte` · Périmètre : `ETAPES.md` avec les modifications décidées dans la conversation.

## 1. Cadrage verrouillé par l'utilisateur

- Cible d'exécution : **Windows**, hôte **JUCE 8.0.4 / WebView2**, « moteur complet testé visuellement ».
- Méthode : **coder J1 → J6 d'abord**, lancer les tests internes du côté de l'assistant, effectuer **un seul push/compile GitHub à la fin**, puis laisser l'utilisateur faire **un seul test intégral Windows** et transmettre une liste détaillée des bugs / défauts.
- Périmètre actif : **`ETAPES.md` avec nos modifications**, pas le `README.md` C++20 racine.
- Vidéo : **exclue** de cette phase, « hors test … dernière étape » / ajout seulement après le test final confirmé. `videoEnabled` reste forcé à `false` et `videoPolicy = after_final_confirmed_test`.
- Repli Web Audio J1 : conservé comme **référence déjà codée**, sans extension. Il cède la priorité à `window.ALPHA_NATIVE`.
- Aucun élément n'est à 100 % avant la compilation Windows finale, le test visuel intégral de l'utilisateur et son acceptation explicite.

## 2. Ce qui est codé sans être validé en exécution Windows

| Jalon | Implémentation locale | Validation interne |
|---|---|---|
| J2 | `AlphaProjectCore.h` : schéma `.alphaproj` 2, JSON UTF-8, historique illimité, undo / redo / jump / revert, édition multi-pistes, collage, découpe, duplication, médias, `replaceState` pour l'interface | `tests/alpha-core.test.cpp`, 5 groupes PASS |
| J3 | enregistrement JUCE, armement, précompte, punch in/out, compensation de latence, écriture des prises, options d'enregistrement | tests du noyau C++ et syntaxe JUCE |
| J4 | graphe pistes → quatre bus → master, faders / pan / mute / solo, EQ 4 bandes, dynamique, automation, VU / crête / LUFS, Control Room | tests DSP/LUFS et syntaxe JUCE |
| J5 | notes/CC MIDI, quantification, import/export `.mid`, SMF minimal, modèle de pistes instrument, rendu WAV 48 kHz / 24 bits et stems | tests SMF, C++ et syntaxe JUCE |
| J6 | préférences, modèles de projet, sauvegarde / autosauvegarde / backup / restauration, import par glisser-déposer, compteurs, accès clavier, statut, vidéo verrouillée | tests du noyau, pont natif simulé, syntaxe JUCE |

Le moteur natif est contenu dans :
- `Engines/ALPHA-Studio/Source/AlphaProjectCore.h` : noyau C++17 sans JUCE, testable seul ;
- `Engines/ALPHA-Studio/Source/Engine.h` : `AlphaEngine`, graphe audio, fichiers, WebView, rendu, VST3 ;
- `Source/Main.cpp` / `Source/AlphaWebMain.h` : fenêtre JUCE, WebView2, fonction native `alphaCommand`, dialogues de fichiers, publication d'état à 20 Hz ;
- `UI/AlphaStudio/native-bridge.js` : protocole `__juce__invoke` / `__juce__complete`, commandes, édition, historique, glisser-déposer, vidéo verrouillée.

## 3. Protocole natif

`WebBrowserComponent::Options::withNativeFunction("alphaCommand", ...)` reçoit `params = [commande, données]`. Le pont implémente le gestionnaire de promesses JUCE 8 dans le HTML autonome : il émet `__juce__invoke` avec un `resultId`, attend `__juce__complete`, puis applique le snapshot `stateJson()` renvoyé. Le repli Web Audio n'est instancié que si `window.ALPHA_NATIVE` est absent.

Le snapshot contient notamment : `tracks`, `buses`, `markers`, `media`, `templates`, `preferences`, `controlRoom`, `history`, `historyIndex`, `canUndo`, `canRedo`, `dirty`, `positionBars`, niveaux par piste, `status`, `projectPath` et `autosavePath`. Les éditions locales de l'interface sont renvoyées au noyau par `replaceState` après comparaison de signature, afin de ne pas créer de faux niveaux d'historique.

## 4. Tests internes rejoués localement

```bash
bash tests/run.sh
```

Le lanceur :
1. vérifie la syntaxe Python du builder et reconstruit `UI/AlphaStudio/alpha-studio.html` ;
2. vérifie la syntaxe JavaScript de toutes les sources et du pont natif ;
3. lance les tests nommés J1, le noyau C++17 J2 → J6 et les tests du pont WebView2 simulé ;
4. refait les `grep` de contrôle sur le fichier HTML réellement écrit.

Vérifications JUCE effectuées hors Windows avec les en-têtes 8.0.4 : `bash tests/juce-syntax.sh` avec `JUCE_MODULES_DIR` pointant sur un clone JUCE 8.0.4 vérifie la syntaxe C++17 de `Engine.h`, `Source/Main.cpp` et de l'application de référence avec `JUCE_USE_WIN_WEBVIEW2=1`, `JUCE_PLUGINHOST_VST3=1`, `JUCE_MODAL_LOOPS_PERMITTED=1`. Le lanceur ignore proprement cette étape si les modules JUCE ne sont pas présents localement. Ce n'est **pas** une compilation MSVC ni une preuve d'exécution audio.

## 5. Non fait / non prouvé avant le test final

- Aucune compilation Windows/MSVC, aucune exécution WebView2, aucun branchement à une carte son ou à un microphone.
- Aucun test visuel intégral de l'utilisateur, aucune liste de bugs / défauts reçue, aucune acceptation finale.
- Aucune vidéo : décodage, poursuite image, export vidéo et fenêtre Vidéo restent hors périmètre jusqu'après le test confirmé.
- OMF / AAF / XML ancien / Audio CD / partition / gravure : commandes explicitement signalées comme non implémentées, pas des moteurs d'échange complets.
- Les 59 fenêtres n'ont pas d'audit `pageerror` Chromium réel ; les tests utilisent un faux DOM.
- Le HTML J1 de repli reste sonore en navigateur seul, mais ne prouve pas le moteur JUCE.

## 6. Fin de séquence prévue

1. Dernière passe de propreté et tests internes.
2. **Un seul** push sur la branche active, déclenchant `.github/workflows/windows-build.yml` (tests internes puis compilation Windows / WebView2).
3. L'utilisateur récupère l'exécutable, effectue **un seul test intégral visuel et fonctionnel** du moteur complet.
4. Il envoie les bugs / défauts détaillés ; corrections ciblées ensuite.
5. La vidéo n'est ouverte qu'après ce test confirmé. Aucun pourcentage à 100 % avant acceptation.
