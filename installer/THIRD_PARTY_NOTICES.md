# ALPHA Studio 0.5.0 — mentions des composants tiers

- **JUCE 8.0.4** : framework C++ récupéré par CMake/FetchContent pendant la compilation. Licence JUCE, selon le projet JUCE.
- **Microsoft WebView2 Runtime (Evergreen)** : non embarqué intégralement. L'installateur exécute le bootstrapper officiel `MicrosoftEdgeWebview2Setup.exe` uniquement si le runtime n'est pas déjà installé. Une connexion Internet peut donc être nécessaire lors de la première installation.
- **Microsoft.Web.WebView2 1.0.1901.177** : package NuGet utilisé uniquement pour compiler l'hôte WebView2 ; `WebView2Loader.dll` est livré à côté de l'exécutable.
- **Steinberg ASIO SDK 2.3.4** : téléchargé par GitHub Actions sur le runner Windows pour activer `JUCE_ASIO=1`. Le SDK n'est ni copié dans ce dépôt ni redistribué. Son utilisation reste soumise à la licence Steinberg ; seuls les en-têtes nécessaires à la compilation sont référencés.
- **Inno Setup 6** : utilisé par GitHub Actions pour produire `ALPHAStudio-Setup-0.5.0-x64.exe`. Inno Setup n'est pas redistribué dans l'installateur.

Le moteur ALPHA Studio, l'interface et les fichiers de projet sont fournis pour le test intégral Windows. La vidéo reste exclue jusqu'après le test final confirmé.
