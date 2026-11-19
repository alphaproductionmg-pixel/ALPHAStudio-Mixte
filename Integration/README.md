# ALPHA Studio Mixte — intégration UI / moteur

## Répartition
- UI/AlphaStudio/ : interface HTML/CSS/JavaScript issue de l'archive ALPHA-Studio fournie ; son apparence est la référence.
- Engines/ALPHA-Studio/Source/Engine.h : moteur audio JUCE conservé comme source fonctionnelle.
- Source/AlphaWebMain.h : hôte WebView2 et adaptateur C++.
- UI/AlphaStudio/native-bridge.js : pont JavaScript vers les commandes natives.
- Source/Main.cpp : point d'entrée de l'application mixte.

## Commandes raccordées dans le pont
Transport lecture / arrêt / enregistrement, cycle, métronome, position, tempo, armement / mute / solo / volume des pistes, création de piste, import audio, ouverture et sauvegarde de projet.

Le moteur reste propriétaire des données audio. L'interface reçoit un instantané périodique du transport, des pistes, des clips et des niveaux. Les callbacks natifs sont exécutés sur le thread message JUCE ; le traitement audio reste dans le moteur.

## Fichier UI attendu
Le point d'entrée attend UI/AlphaStudio/alpha-studio.html. Les sources de l'archive doivent être présentes à côté (src/, build.py, documentation et aperçus). build.py doit inclure native-bridge.js après les scripts ALPHA existants afin que window.ALPHA soit déjà défini.

## Limites à ne pas masquer
Ce premier adaptateur ne synchronise pas encore toutes les opérations d'édition de clips, les inserts VST, les automations, les fenêtres d'édition MIDI / échantillons ou les contrôles avancés de mixage. Ces raccordements nécessitent des commandes dédiées et des tests fonctionnels. Aucun de ces contrôles ne doit afficher une réussite fictive.

## Construction
Sous Windows avec Visual Studio 2022, CMake 3.22+ et le runtime Microsoft Edge WebView2 installé :

    cmake -S . -B build -A x64
    cmake --build build --config Release

L'archive UI complète doit être présente dans UI/AlphaStudio/ avant le lancement. Le build et le test audio réel restent à valider sur Windows.
