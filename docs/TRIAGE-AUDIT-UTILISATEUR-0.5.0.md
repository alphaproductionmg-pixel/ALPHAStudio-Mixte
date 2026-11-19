# Triage de l’audit utilisateur — ALPHA Studio 0.5.0

**Source :** `/tmp/arena-coding-uploads/audit_complet_alphastudio_nuendo4_v6.md`
**Nature :** audit statique progressif, 1 588 lignes, référence Nuendo 4, examen déclaré du commit `d1e81fb8580e61e0ee63de6b51cae33c43656ac0` et de la version déclarée `0.4.0`.
**Important :** ce rapport n’est pas un test d’exécution Windows. Il contient des numérotations A01→A136 avec des reprises / doublons de numéros dans les compléments ; un dédoublonnage reste nécessaire. Aucun de ses constats ne doit être considéré comme validé matériellement sans la matrice W01→W23.

## 1. Retour utilisateur après installation

L’utilisateur a pu installer la version 0.5.0, puis a signalé :

- une interface « bizarre », avec quelque chose qui cloche ;
- des commandes de type **Retour / Suivant / Imprimer / Enregistrer sous** dont le rôle n’est pas clair ;
- l’impression que **la fenêtre est elle-même dans une fenêtre**, contrairement à un DAW normal.

Ces retours sont traités comme des défauts d’intégration prioritaires, pas comme une simple question d’habitude.

## 2. Causes identifiées et corrections de cette passe

| Cause | Correction |
|---|---|
| `MainWindow` utilise déjà `setUsingNativeTitleBar(true)`, mais `body.html` dessine aussi une fausse barre de titre avec logo et boutons | En mode natif, `#titlebar` est masquée avant le premier rendu ; `#app` occupe tout WebView2, sans bordure ni fond de liseré ; « adapter à l’écran » reste accessible dans la barre d’état |
| WebView2 affiche encore son menu contextuel / barre d’état / page d’erreur de navigateur | `contextmenu` neutralisé, raccourcis navigateur `Alt+←/→`, `Ctrl+R`, `Ctrl+F`, `F12` et `Backspace` hors champ bloqués ; options JUCE `withStatusBarDisabled()`, `withBuiltInErrorPageDisabled()`, couleur de fond opaque |
| Des entrées de menu non implémentées restent actives et répondent « étape 2 » ou sont détournées | Liste explicite `unavailableActions`, classes `alpha-unavailable`, `aria-disabled`, libellé « non disponible », statut « non implémentée / non disponible dans ALPHA Studio 0.5.0 » |
| `closeProject` était redirigé vers `newProject` (A08 / A50) | Désactivé : plus de perte silencieuse de projet. Une vraie confirmation d’enregistrement reste à implémenter |
| `addFX` démutait le bus 0 au lieu de créer un canal FX (A02) | Désactivé ; la création réelle de canal FX reste à implémenter |
| `midiLogical` appelait `quantizeMidi` (A11 / A79) | Désactivé ; l’éditeur logique reste à implémenter |
| `exportTrack` exportait toutes les pistes comme des stems (A06) | Le pont transmet `trackIndex`, l’hôte valide l’index et appelle `renderOffline(..., onlyTrack)` pour écrire un seul WAV de piste |
| Formats OMF / AAF / XML / CD / partition / impression annoncés mais absents | Entrées désactivées plutôt que présentées comme réussies ; les commandes vidéo restent, elles, verrouillées par `setVideoEnabled` jusqu’après le test final confirmé |

Les éléments **Précédent / Suivant** visibles dans *Édition ▸ Sélection* restent des commandes de sélection d’événements, pas une navigation WebView2. Le menu contextuel de navigateur, lui, est supprimé.

## 3. Points de l’audit déjà corrigés côté source en 0.5.0

Ces corrections sont présentes dans le code, mais **pas validées en exécution Windows** :

- **A07 / A51** : import audio sur `trackIndex` et racine source des médias ;
- **A12 / A66 / A1 / S1 / S8** : callback audio sans `std::map::erase`, notes live préallouées, automation aplatie, précompte maîtrisé ;
- **A15 / S7** : promesses natives avec délai, erreur, rejet et nettoyage ;
- **A62 / A68 / A2** : export WAV avec propriété partagée du moteur, annulation coopérative et attente réelle ;
- **A65 / A5** : durée WAV dérivée du ratio, sans retrait arbitraire de quatre échantillons ;
- **S2 / S3 / S4 / S5 / S6** : ordre Note Off / Note On, SMF borné, PPQN, JSON numérique strict, paires UTF-16 ;
- **S9** : découpe du callback à la frontière exacte de boucle ;
- **A36 / A114** : sélecteur audio JUCE, panneau ASIO, snapshot dynamique des périphériques — validation matérielle encore absente.

## 4. Points encore ouverts, classés par priorité

### Priorité 1 — contrats et perte de données

- **A13 / A16 / A17** : inventaire exhaustif UI → bridge → moteur → état → sauvegarde ; enum de type de piste partagé ; éviter que `replaceState` écrase des champs locaux.
- **A03 / A96 / A133** : types de pistes Audio, MIDI, Instrument, Groupe, FX, Tempo, Vidéo, Arrangeur réellement créés et restaurés.
- **A08 / A50** : confirmation d’enregistrement avant fermeture / nouveau projet / quitter.
- **A09 / A59** : snapshots de mixage distincts et rappelables.
- **A31 / A104** : undo / redo transactionnel pour toutes les commandes, y compris édition MIDI et fenêtres locales.

### Priorité 2 — plug-ins, routage et mixage

- **A01 / A05 / A21 / A93** : scanner VST3, ajout / retrait / déplacement / bypass, éditeur natif, état de plug-in dans `.alphaproj`.
- **A02 / A25 / A04 / A134** : canaux FX, groupes, bus, départs multiples pre/post-fader, Control Room.
- **A23 / A108 / A131** : EQ / dynamique reliés au moteur, rejet des champs inconnus, courbe conforme aux coefficients.
- **A24 / A47 / A70** : ordre du graphe, PDC, VU / LUFS / true peak mesurés.

### Priorité 3 — édition, tempo et MIDI

- **A27 / A33 / A136** : carte de tempo et signatures variables au lieu d’un BPM unique 4/4.
- **A29 / A30 / A88 / A116 / A117 / A118** : édition audio réelle, crossfades, détection de silence, export audio non simulé.
- **A39 / A98 / A99 / A106 / A119 / A128 / A129** : éditeurs MIDI, moniteur MIDI réel, CC, vélocité, persistance des notes.
- **A48 / A49 / A105 / A130** : automation Read / Write / Touch / Latch et cibles de plug-ins.

### Priorité 4 — fenêtres avancées et qualification

- **A71→A74 / A89→A92** : documentation homogène, tests d’intégration native, loopback audio, vrais périphériques.
- **A75→A88, A109→A127** : nombreuses fenêtres affichent encore des données simulées ou locales ; elles doivent être soit reliées au moteur, soit explicitement signalées « démonstration / non disponible ».
- **W01→W23** : matrice de test Windows à remplir avec cartes son, micros, VST3, imports, exports, sauvegarde/rechargement, longue durée et charge CPU.

## 5. Ce que cette passe ne prétend pas faire

Elle ne transforme pas ALPHA Studio en Nuendo 4 complet, n’implémente pas tous les A01→A136, ne valide pas le son réel, les plug-ins, l’ASIO matériel, les 59 fenêtres ni l’ergonomie finale. Elle supprime les deux blocages visuels signalés, sécurise les commandes trompeuses, corrige l’export de piste et fournit une base de triage honnête.

Le test intégral Windows reste en cours. La liste détaillée des bugs / défauts reste à compléter. Aucune acceptation finale et aucun 100 % ne sont prononcés avant le retour utilisateur complet.

Le triage point par point de l'audit complet v6 (A01 → A136) est tenu à jour dans `docs/AUDIT-V6-MATRICE.md` : chaque point y reçoit un statut CORRIGÉ (code), PARTIEL ou NON RÉSOLU, sans jamais d'acceptation finale.
