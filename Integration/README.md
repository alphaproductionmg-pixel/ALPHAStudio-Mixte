# ALPHA Studio Mixte — intégration moteur / interface

## Répartition des sources

- `UI/AlphaStudio/` : interface finale issue de l'archive ALPHA-Studio-master fournie séparément. Son apparence reste la référence et ne doit pas être remplacée par l'ancienne interface native.
- `Engines/ALPHA-Studio/Source/Engine.h` : moteur audio JUCE 8 d'ALPHA-Studio. Ce fichier est conservé à son emplacement actif et utilisé par l'application mixte.
- `Engines/ALPHA-Studio/ReferenceApp/` : copie de référence de l'ancien hôte JUCE (`Main.cpp`, `UI.h`, `CMakeLists.txt`, script de build et documentation). Ces fichiers sont conservés pour consultation et ne remplacent pas l'hôte WebView2 mixte.
- `Source/AlphaWebMain.h` et `Source/Main.cpp` : hôte Windows/WebView2 et adaptateur natif de l'interface.
- `UI/AlphaStudio/native-bridge.js` : commandes JavaScript vers le moteur audio.

## Capacités présentes dans le moteur

Le moteur `AlphaEngine` contient notamment :
- graphe audio JUCE et gestion des périphériques ;
- pistes, faders, panoramique, mute, solo et armement ;
- lecture, arrêt, position, boucle et métronome ;
- import audio, clips, découpe, duplication et déplacement ;
- enregistrement WAV ;
- inserts de plugins VST3 et gestion de la liste de plugins ;
- chargement et sauvegarde de projets ;
- rendu/export audio hors ligne.

## Raccordements déjà réalisés dans l'hôte mixte

L'interface appelle actuellement le moteur pour lecture, arrêt, enregistrement, cycle, métronome, déplacement du curseur, tempo, création de pistes, import audio, ouverture/sauvegarde de projet, mute/solo/armement, volume et panoramique. L'hôte publie périodiquement les pistes, clips, position, état du transport et niveaux audio vers l'interface.

## Raccordements restant à terminer

Les commandes présentes dans le moteur ne sont pas toutes accessibles depuis l'interface finale. Il reste notamment à raccorder et tester les opérations d'édition des clips, la gestion visuelle des inserts VST3, les réglages de périphériques, les contrôles avancés du transport, l'export audio et l'affichage des vumètres. Les fonctions d'automation, MIDI et les fenêtres dédiées doivent être évaluées séparément : elles ne sont pas garanties par le seul moteur actuellement présent.

## ASIO et dépendances

Le moteur utilise JUCE 8.0.4 et héberge les plugins VST3. La prise en charge ASIO est facultative et nécessite le SDK Steinberg fourni légalement par l'utilisateur ou obtenu auprès de Steinberg. Le SDK n'est pas recopié ici : sa licence de distribution impose des conditions spécifiques. WASAPI et DirectSound restent les chemins audio Windows configurés par défaut.

## Construction et vérification

La configuration CMake cible Windows avec Visual Studio 2022, CMake 3.22+, Python 3 et WebView2. L'interface HTML est générée par `UI/AlphaStudio/build.py`.

Aucune compilation Windows ni validation audio réelle n'a encore été effectuée sur ce dépôt. Les fonctions décrites comme présentes dans le moteur ne doivent donc pas être considérées comme validées en exécution dans l'application mixte.
