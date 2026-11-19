# ALPHA Studio Mixte — intégration UI / moteur

## Répartition
- UI/AlphaStudio/ : emplacement prévu pour l'interface HTML/CSS/JavaScript de l'archive fournie. À ce commit, seul le pont natif et le script de construction sont dans le dépôt ; l'archive complète (src/, alpha-studio.html, docs/) reste à transférer. L'apparence ne doit pas être recréée ni remplacée.
- Engines/ALPHA-Studio/Source/Engine.h : moteur audio JUCE conservé comme source fonctionnelle.
- Source/AlphaWebMain.h : hôte WebView2 et adaptateur C++.
- UI/AlphaStudio/native-bridge.js : pont JavaScript vers les commandes natives.
- Source/Main.cpp : point d'entrée de l'application mixte.

## Commandes raccordées dans le pont
Transport lecture / arrêt / enregistrement, cycle, métronome, déplacement du curseur, armement / mute / solo / volume des pistes, création de piste, import audio, ouverture et sauvegarde de projet. Le point d'entrée natif accepte aussi une commande tempo, mais aucun champ de tempo de l'interface ne l'appelle encore.

Le moteur reste propriétaire des données audio. L'interface reçoit un instantané périodique du transport, des pistes, des clips et des niveaux. Les callbacks natifs sont exécutés sur le thread message JUCE ; le traitement audio reste dans le moteur. Les niveaux sont transmis, mais leur rendu VU dans les widgets de l'interface reste à raccorder.

## Fichier UI attendu
Le build.py ajouté injecte native-bridge.js après les scripts ALPHA et CMake le lance avant la compilation. Le dépôt ne contient pas encore src/ ; son transfert est un prérequis avant configuration et compilation. Le HTML est généré par build.py.

## Limites à ne pas masquer
Ce premier adaptateur ne synchronise pas encore toutes les opérations d'édition de clips, les inserts VST, les automations, les fenêtres d'édition MIDI / échantillons ou les contrôles avancés de mixage. Ces raccordements nécessitent des commandes dédiées et des tests fonctionnels. Aucun de ces contrôles ne doit afficher une réussite fictive.

## Construction
Sous Windows avec Visual Studio 2022, CMake 3.22+ et le runtime Microsoft Edge WebView2 installé :

    cmake -S . -B build -A x64
    cmake --build build --config Release

L'archive UI complète doit être présente dans UI/AlphaStudio/ avant le lancement. Le build et le test audio réel restent à valider sur Windows.
