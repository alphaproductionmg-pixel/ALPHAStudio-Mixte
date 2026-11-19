# ALPHA Studio 0.5.0 — version installable Windows

Cette version remplace le simple ZIP portable par un installateur **Inno Setup** :

`ALPHAStudio-Setup-0.5.0-x64.exe`

Cible : Windows 10/11 x64, Visual C++ Runtime correspondant à la compilation `windows-2022`, WebView2 Evergreen.

## Installation

1. Télécharger `ALPHAStudio-Setup-0.5.0-x64.exe` depuis l'artefact ou la release GitHub.
2. L'exécuter, choisir le dossier (par défaut `%ProgramFiles%\ALPHA Studio` ou dossier utilisateur selon les droits).
3. Si WebView2 Runtime n'est pas présent, l'installateur lance le bootstrapper officiel Microsoft en mode silencieux. Une connexion Internet peut être nécessaire à ce moment.
4. L'application est disponible dans le menu Démarrer sous **ALPHA Studio** ; l'icône Bureau est optionnelle.
5. Désinstallation : **Paramètres Windows → Applications** ou `Désinstaller ALPHA Studio` dans le menu Démarrer.

L'interface et `WebView2Loader.dll` sont installés avec l'exécutable ; aucun fichier n'est à copier manuellement.

## Fenêtre, Full HD, DPI et polices

- La fenêtre s'ouvre dans la zone de travail de l'écran principal et mémorise sa position/taille/maximisation.
- Limite native de redimensionnement : 800 × 500 à 3840 × 2160 ; poignée native en bas à droite.
- Barre de titre : boutons **adapter à l'écran**, **réduire**, **agrandir/restaurer**, **fermer** ; glisser la barre de titre déplace la fenêtre ; double-clic agrandit/restaure.
- Barre d'état : `UI−`, `UI+`, `A−`, `A+`, `⟲`, `Audio`, `ASIO`.
- `Ctrl+Alt++` / `Ctrl+Alt+-` / `Ctrl+Alt+0` ajustent ou réinitialisent l'échelle de l'interface ; `Ctrl+Alt+A` ouvre les réglages audio.
- L'échelle de texte Windows (`TextScaleFactor`) est lue au démarrage et appliquée séparément de l'échelle d'interface. WebView2 gère le DPI système.

## Réglages audio / ASIO réels

- `Audio` et le menu **Périphériques ▸ Configuration des périphériques** ouvrent le sélecteur JUCE `AudioDeviceSelectorComponent` : type de pilote, périphérique, fréquence, tampon, entrées/sorties.
- `ASIO` appelle `AudioIODevice::showControlPanel()` du pilote actif quand le constructeur l'expose.
- Le snapshot natif publie les types disponibles, `asioAvailable`, le type courant, les noms d'entrée/sortie, la fréquence réelle, le tampon, les latences et `hasControlPanel`.
- `JUCE_ASIO=1` est activé à la compilation. Le SDK Steinberg est téléchargé par GitHub Actions, jamais vendored dans le dépôt.

## Test intégral attendu

Le test utilisateur doit vérifier visuellement et fonctionnellement : installation/désinstallation, ouverture de la fenêtre, déplacement/réduction/agrandissement/redimensionnement, lisibilité à 100/125/150 %, visibilité des réglages ASIO, lecture/édition/export, puis fournir la liste détaillée des bugs/défauts. Aucun élément n'est considéré accepté à 100 % avant ce test et l'acceptation explicite.

La vidéo reste exclue jusqu'après le test final confirmé.
