# J1 — contrat, décisions et preuves

Date : 19 novembre 2026 · Dépôt : `ALPHAStudio-Mixte` · Livrable : `UI/AlphaStudio/alpha-studio.html`

## 1. Contrat en une phrase

> **Dans le livrable navigateur autonome, une pression sur Espace crée un `AudioContext`, fait entendre les événements des pistes par synthèse, boucle réellement entre `cycleL` et `cycleR`, rend le métronome et le précompte audibles, et le curseur suit `currentTime` sans dérive mesurable après 10 minutes.**

Ce contrat reprend le critère binaire de `ETAPES.md`. Il est **testé automatiquement** ; l’écoute réelle sur haut-parleurs et la dérive après dix minutes d’horloge matérielle restent à valider à la main.

## 2. Décisions prises avant de coder

| Sujet | Choix retenu | Pourquoi |
|---|---|---|
| Origine du son | **sources synthétisées** : 12 instruments + clic, oscillateurs, bruit filtré, enveloppes | J1 ne dépend pas de J2 (fichiers, décodage, import) |
| Périmètre | **J1 = « ça sonne »**, rien de plus | garder un jalon validable ; EQ, automatisation, enregistrement, MIDI, export et vidéo restent **non fait** |
| Architecture | moteur **Web Audio autonome** chargé après `native-bridge.js` | dans l’application mixte, le moteur JUCE/WebView2 garde la priorité ; en navigateur seul, le repli rend l’interface sonore |
| Horloge | `AudioContext.currentTime` + ordonnanceur à anticipation (25 ms / 120 ms) | `setInterval` ne pilote plus la position : il ne sert qu’à remplir la fenêtre d’ordonnancement |
| Curseur | nouvelle API `ALPHA.setPlayhead()` sans quantification | `ALPHA.goto()` arrondit à la grille et ferait vibrer le curseur |
| Mixage J1 | `GainNode`, `StereoPannerNode`, `AnalyserNode`, master et worklet optionnel | faders, mute, solo, pan et VU sont branchés sur de vrais nœuds, pas sur du CSS seulement |

## 3. Ce qui est livré

| Segment | Fichier | Sortie vérifiable |
|---|---|---|
| J1.a | `src/audio-core.js`, `src/audio.js`, `src/app.js` | `state.clock` expose `currentTime`, `positionBars`, `driftSeconds` ; position calculée, jamais intégrée |
| J1.b | `src/audio-core.js`, `src/audio.js` | 12 définitions de sources, voix par événement, gains de piste, filtre, enveloppe, bruit, exclusion de la piste vidéo |
| J1.c | `src/audio-core.js`, `src/audio.js` | `loopSegments()` découpe la fenêtre au localisateur droit ; clics de métronome ; 4 temps de précompte |
| J1.d | `src/audio.js`, `native-bridge.js` | `trackGain()` vers `AudioParam`, mute/solo, pan, VU depuis `AnalyserNode` ou `levelL` / `levelR` natifs |
| J1.e | `src/audio.js` | rampe de 20 ms, annulation des voix, `suspend()` différé, `close()` sur `pagehide`, un seul contexte pour 10 cycles |
| Livraison | `build.py`, `tests/run.sh` | un seul HTML inliné, zéro `<script src>`, assertions de build, tests sans npm |

Le `AudioWorkletProcessor` `alpha-mix` fait un écrêtage doux sur le master. Il est chargé depuis une URL `blob:` lorsque le navigateur l’autorise ; en cas d’échec, le master reste directement relié à la sortie. Aucune fonctionnalité ne dépend de ce worklet.

## 4. Journal des tests

Commande unique : `bash tests/run.sh`.

| Test | Vérification | Résultat |
|---|---|---|
| `j1a` (noyau) | 600 s à 120 BPM → mesure 301, frontière de cycle 17 → 9 | PASS |
| `j1a` (runtime) | Espace crée le contexte, `state.clock.driftSeconds() === 0` après 600 s simulées | PASS |
| `j1b` | 12 sources, 9 pistes sonores, oscillateurs, buffers de bruit, gains, vidéo exclue | PASS |
| `j1c` | segments de boucle, métronome, 4 clics de précompte | PASS |
| `j1d` | −6 dB → 0,501, mute/solo → 0, RMS / crête, compteurs natifs | PASS |
| `j1e` | 10 cycles, rampe, `suspend`, zéro voix, un contexte, `destroy()` | PASS |
| `build` | HTML > 947 303 octets, un script inline, worklet et moteur présents | PASS |
| `sources` | archive d’origine intacte, `setPlayhead`, pont natif, assertions `build.py` | PASS |
| `livraison` | contrat, documentation, lanceur exécutable sans npm | PASS |

Le lanceur exécute aussi `node --check` sur les sources et quatre `grep` de contrôle sur le fichier réellement écrit. Les tests utilisent un faux `AudioContext` et un faux DOM (`tests/support/harness.js`) : ils prouvent le graphe, l’ordonnancement et les valeurs, pas la perception sonore.

## 5. Ce qui n’est pas fait / non prouvé par le repli J1

- Pas d’écoute réelle ni de test `pageerror` dans un vrai Chromium : aucun navigateur ni périphérique audio n’est installé dans le bac à sable.
- Pas de compilation Windows / WebView2 : le moteur JUCE reste non validé en exécution.
- J2 → J6 sont maintenant **codés dans le moteur Windows/JUCE 8/WebView2** (`docs/J2-J6-contrat.md`) mais ne sont pas prouvés par ce contrat J1 ni validés en exécution Windows.
- La vidéo reste verrouillée jusqu'après le test final confirmé ; les formats d'échange OMF / AAF / XML / CD sont explicitement signalés comme non implémentés.
- Le repli J1 ne couvre ni import audio, ni enregistrement micro, ni EQ / automatisation appliquée, ni export WAV, ni Control Room réelle.
- Les scripts Playwright historiques des 59 fenêtres ne sont pas réintégrés : la fumée J1 est couverte par le faux DOM, pas par l’audit complet.

## 6. Ancienne validation manuelle avant J2 (archivée)

> **Décision utilisateur active** : cette porte de validation navigateur J1 est remplacée par le workflow de `ETAPES.md` § 0.0 / § 6 et de `docs/J2-J6-contrat.md` : coder J1 → J6, tests internes, un seul push/compile GitHub à la fin, puis un seul test intégral Windows. Le texte ci-dessous conserve l'historique du contrat J1.

1. Servir le repli en HTTP : `python3 tests/serve.py`, puis ouvrir le preview.
2. Appuyer sur **Espace** : le repli Web Audio doit sonner et le curseur avancer.
3. **C** active le métronome ; **/** active le cycle ; **F3** ouvre la console ; faders, **M** et **S** agissent sur le son et les VU.
4. Activer « Précompte » puis relancer : quatre clics avant la lecture.
5. Laisser tourner 10 minutes en cycle, puis lire `ALPHA.state.clock.driftSeconds()` et `ALPHA_AUDIO.debug()`.
6. Historiquement : dire **stop** ou **continuer** ; cette étape n'est plus imposée avant J2.

---

## 7. Relation avec J2 → J6

Ce document décrit uniquement le repli Web Audio de référence. Le moteur complet cible Windows / JUCE / WebView2, la méthode sans arrêt entre jalons, le push/compile final unique et le verrou vidéo sont consignés dans `ETAPES.md` § 0.0 / § 6 et `docs/J2-J6-contrat.md`. Aucun test de ce fichier ne doit être présenté comme une validation d'exécution du moteur natif.
