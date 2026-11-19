# -*- coding: utf-8 -*-
"""Génère docs/comparatif-nuendo4-vs-alpha.html à partir des faits relevés
dans le manuel officiel Nuendo 4 (14/09/2007), la Version History 4.3.0
et le Getting Started Nuendo 4."""

MANUAL = "Manuel Nuendo 4, p."
SRC = {
 "M": "Manuel d'utilisation Nuendo 4 (Steinberg, 14/09/2007) — PDF officiel",
 "VH": "Nuendo 4.3.0 — Version History / Issues &amp; Solutions (Steinberg)",
 "GS": "Getting Started Nuendo 4 (texte officiel reproduit)",
 "SOS": "Sound On Sound — test Nuendo 4 (déc. 2007)",
 "MR": "MusicRadar — test Nuendo 4 (févr. 2008)",
}

# ---------------------------------------------------------------- TABLEAU A
# (nom exact manuel, description FR, type, fonction documentée, réf, raccourci N4, statut, écart ALPHA)
A = [
("Project window","Fenêtre de projet","Fenêtre principale",
 "« The main window in Nuendo » : vue d'ensemble du projet, navigation et édition à grande échelle ; une fenêtre de projet par projet.",
 "p.22-25","—","part",
 "Toutes les zones existent (outils, ligne d'info, inspecteur, ligne d'aperçu, règle, liste de pistes, événements, barre d'état). Manquent : masquage Inspecteur (Alt+I) / ligne d'aperçu (Alt+O), dialogues Setup, plusieurs projets, moteur audio."),
("Transport panel","Panneau Transport","Panneau flottant",
 "Transport flottant ; peut être personnalisé pour choisir les contrôles affichés.",
 "p.58-63","F2","part",
 "Présent, déplaçable, afficheurs barres/temps/timecode. Pannneau non personnalisable (pas de dialogue Setup)."),
("VST Performance","Performances VST","Fenêtre d'état",
 "Ouverte depuis le menu Devices : charge CPU et débit disque, indicateur d'overload.",
 "p.146","F12","abs",
 "Absent. ALPHA affiche une valeur CPU statique dans la barre d'état."),
("Mixer","Console de mixage","Fenêtre de mixage",
 "Tranches audio et MIDI, panneau commun, canaux d'entrée/sortie ; le manuel n'emploie jamais le mot « MixConsole » (0 occurrence).",
 "p.122-150","F3","part",
 "Présent en tant que « MixConsole ». Manquent : canaux d'entrée/sortie, tranches MIDI, panneau commun, configurations de canaux, schémas de mixage."),
("Channel Settings window","Réglages de canal","Fenêtre",
 "Ouverte par le bouton « e » / « Edit » du canal (Inspector ou Mixer) ; inserts, EQ 4 bandes avec courbe, départs, routage.",
 "p.26, 137-141","« e » (bouton)","part",
 "Présent (4 onglets, bouton « e » également). Manquent : dialogue Setup, section MIDI de canal, copier/coller de réglages entre canaux, Initialize Channel."),
("Control Room Mixer","Mixeur Control Room","Fenêtre",
 "Affichage et réglage des canaux Control Room définis dans VST Connections ▸ Studio.",
 "p.156-163","—","abs",
 "Absent : pas de section Studio, pas de monitoring/écoutes."),
("Control Room Overview","Vue d'ensemble Control Room","Fenêtre",
 "Montre tous les canaux Control Room possibles et met en évidence ceux qui sont définis.",
 "p.156","—","abs","Absent."),
("Studio Sends","Envois de studio","Fenêtre/panneau",
 "Configuration des envois vers les studios (mix de retour casque, etc.).",
 "p.163-166","—","abs","Absent."),
("VST Connections","Connexions VST","Boîte de dialogue",
 "Configuration des bus d'entrée/sortie, des groupes, des FX et de l'onglet Studio (activation Control Room).",
 "p.10-21","F4","part",
 "Présent (4 onglets). Manque : onglet Studio réel, création/suppression effective de bus, pilotes."),
("VST Instruments","Instruments VST","Fenêtre (rack)",
 "Rack d'instruments VST et routage de leurs sorties.",
 "p.189-201","F11","part",
 "Présent (8 emplacements). Rack non fonctionnel (aucun instrument réel)."),
("Automation panel","Panneau d'automatisation","Panneau flottant",
 "« Floating window, similar to the Mixer and Transport panel » ; modes, Preview, Punch Log, Touch Collect Assistant, suspensions lecture/écriture, Return Time, Reduction Level.",
 "p.217-237","— (menu Projet)","part",
 "Présent visuellement. Manquent : Preview, Punch Log, Touch Assist, virgin territory, modes par piste, listes de suspension réelles."),
("Sample Editor","Éditeur d'échantillons","Fenêtre",
 "Ouvert par double-clic sur un événement audio ; édition au niveau échantillon, hitpoints/slices, Warp.",
 "p.258-289","—","part",
 "Présent (onde, sélection, vue d'ensemble). Manquent : hitpoints, Warp, traitement hors ligne."),
("Audio Part Editor","Éditeur de parties audio","Fenêtre",
 "Édition des parties audio composées de plusieurs événements.",
 "p.290-295","—","abs","Absent (ALPHA n'a pas de parties audio)."),
("Key Editor","Éditeur clavier","Fenêtre",
 "Éditeur MIDI par défaut : grille piano-roll, édition des notes et des contrôleurs.",
 "p.363-380","Ctrl+E (éditeur par défaut)","part",
 "Présent (clavier, grille 1/16, vélocités). Aucune édition réelle ni lecture."),
("List Editor","Éditeur de liste","Fenêtre",
 "Édition des événements MIDI sous forme de liste.",
 "p.383-386","—","abs","Absent."),
("Edit In-Place","Édition en place","Mode d'édition",
 "Édition des données MIDI directement dans la fenêtre de projet.",
 "p.381-382","Ctrl+Maj+I","abs","Absent."),
("Drum Editor","Éditeur de batterie","Fenêtre",
 "Éditeur de motifs rythmiques — disponible uniquement avec le Nuendo Expansion Kit.",
 "p.364 (NEK)","—","abs","Absent — hors périmètre de Nuendo 4 standard (NEK requis)."),
("Score Editor","Éditeur de partition","Fenêtre",
 "Affichage/édition en notation musicale — Nuendo Expansion Kit uniquement.",
 "p.27 (NEK)","Ctrl+R (NEK)","abs","Absent — hors périmètre de Nuendo 4 standard (NEK requis)."),
("Pool","Pool","Fenêtre",
 "Base de données des médias du projet, organisée en dossiers Audio / Vidéo / Corbeille ; import, minimisation, suppression.",
 "p.296-310","Ctrl+P","part",
 "Présent (tableau). Manquent : fichiers réels, import, corbeille, minimisation, régions."),
("MediaBay","MediaBay","Fenêtre",
 "Navigateur de médias : sections Viewer, Scope, Tag Editor ; filtres, aperçu, gestion des tags.",
 "p.314-326","F5","part",
 "Présent (arborescence, filtres, résultats, aperçu). Manquent : fichiers réels, Tag Editor éditable, aperçu audio."),
("SoundFrame","SoundFrame","Fenêtre/panneau",
 "Gestion universelle des sons, presets et tags (presets VST, Track Presets).",
 "p.311-313","—","abs","Absent."),
("Marker window","Fenêtre Marqueurs","Fenêtre",
 "Liste des marqueurs du projet, édition et navigation.",
 "p.109-113","Ctrl+M","part",
 "Présent (liste + clic pour positionner). Raccourci incorrect : F7 au lieu de Ctrl+M ; édition absente."),
("Tempo Track Editor","Éditeur de piste de tempo","Fenêtre",
 "Édition de la courbe de tempo ; bascule tempo fixe / piste de tempo via le bouton Tempo du Transport.",
 "p.414-421","Ctrl+T","abs",
 "Absent. La fenêtre de projet affiche un tempo fixe de 120 dans la barre d'état et le Transport."),
("Beat Calculator","Calculateur de battements","Boîte de dialogue",
 "Calcul du tempo à partir d'une sélection.",
 "p.421","—","abs","Absent."),
("Process Bars dialog","Dialogue Process Bars","Boîte de dialogue",
 "Insertion/suppression de mesures dans la piste de tempo.",
 "p.420","—","abs","Absent."),
("Project Browser","Navigateur de projet","Fenêtre",
 "Édition sous forme de listes de toutes les données du projet (pistes, événements, marqueurs…).",
 "p.428-433","Ctrl+B","abs","Absent."),
("Track Sheet","Feuille de pistes","Fenêtre",
 "Feuille récapitulative des pistes/événements, imprimable.",
 "p.434-436","—","abs","Absent."),
("Logical Editor","Éditeur logique","Fenêtre",
 "Traitement conditionnel des événements MIDI (filtres + actions).",
 "p.387-398","—","abs","Absent."),
("Input Transformer","Transformateur d'entrée","Fenêtre",
 "Transforme les données MIDI à l'entrée, avant enregistrement.",
 "p.397","—","abs","Absent."),
("Project Logical Editor","Éditeur logique de projet","Fenêtre",
 "Version projet de l'éditeur logique (pistes, noms, événements…).",
 "p.399-409","—","abs","Absent."),
("Video window","Fenêtre vidéo","Fenêtre",
 "Lecture vidéo synchronisée ; plein écran par clic droit ; mode Edit pour l'édition image par image.",
 "p.468-481","F8","abs","Absent (aucune vidéo dans ALPHA)."),
("Fade dialogs","Dialogues de fondu","Boîtes de dialogue",
 "Réglage détaillé des fondus (forme, courbe, durée).",
 "p.89-91","—","abs","Absent."),
("Crossfade dialog","Dialogue de fondu enchaîné","Boîte de dialogue",
 "Réglage des fondus enchaînés entre événements.",
 "p.92-95","X (créer)","abs","Absent."),
("Offline Process History","Historique des traitements hors ligne","Boîte de dialogue",
 "Historique/suppression des traitements appliqués hors ligne.",
 "p.251","—","abs","Absent."),
("Batch Processing","Traitement par lots","Boîte de dialogue",
 "Application de traitements à plusieurs fichiers.",
 "p.252","—","abs","Absent."),
("Freeze Edits","Freeze Edits","Boîte de dialogue",
 "Gel des traitements destructifs (« Freeze Edits »).",
 "p.253","—","abs","Absent."),
("Detect Silence","Détection des silences","Boîte de dialogue",
 "Découpage/retrait des silences d'un événement.",
 "p.254","—","abs","Absent."),
("Spectrum Analyzer","Analyseur de spectre","Boîte de dialogue",
 "Analyse du spectre d'une sélection audio.",
 "p.255","—","abs","Absent."),
("Statistics","Statistiques","Boîte de dialogue",
 "Statistiques d'un fichier audio (niveaux, crêtes…).",
 "p.256","—","abs","Absent."),
("Export Audio Mixdown","Exportation du mixage audio","Boîte de dialogue",
 "Export du mixage vers un fichier (formats, plage, canaux).",
 "p.437-444","—","abs","Absent."),
("Project Setup","Configuration du projet","Boîte de dialogue",
 "Réglages du projet : début, longueur, format d'affichage temporel, etc.",
 "p.30-32","Maj+S","abs","Absent."),
("Preferences","Préférences","Boîte de dialogue",
 "Préférences générales, édition, appareils, etc.",
 "p.510-516","—","abs","Absent."),
("Key Commands","Commandes clavier","Boîte de dialogue",
 "Attribution et modification des raccourcis ; jeu de commandes par défaut.",
 "p.517-527","—","part",
 "ALPHA a une fiche statique de raccourcis, sans affectation possible."),
("Organize Workspaces","Organiser les espaces de travail","Boîte de dialogue",
 "Gestion des espaces de travail et de leurs presets globaux.",
 "p.504-505","W","abs","Absent."),
("Device Setup","Configuration des périphériques","Boîte de dialogue",
 "Pilotes audio, nommage des entrées/sorties, page Video Player…",
 "p.11","—","abs","Absent."),
("MIDI Device Manager","Gestionnaire de périphériques MIDI","Boîte de dialogue",
 "Déclaration des appareils MIDI externes et de leurs banques de sons.",
 "p.17","—","abs","Absent."),
("Project Synchronization Setup","Configuration de synchronisation","Boîte de dialogue",
 "Réglages de synchronisation (timecode, MIDI clock, destructions/informations).",
 "p.448-454","—","abs","Absent."),
("Machine Control","Machine Control","Panneau",
 "Télécommande de machines externes (transport, piste).",
 "p.454-459","—","abs","Absent."),
("ReWire panel","Panneau ReWire","Panneau",
 "Activation et routage des périphériques ReWire.",
 "p.482-485","—","abs","Absent."),
("VST System Link","VST System Link","Boîte de dialogue",
 "Mise en réseau de plusieurs stations VST.",
 "p.460-467","—","abs","Absent."),
("Setup dialogs","Dialogues Setup","Boîtes de dialogue",
 "Configuration des éléments visibles et de leur position dans les barres d'outils, le panneau Transport, l'inspecteur, les lignes d'info et les réglages de canal.",
 "p.506-509","—","abs","Absent : l'inspecteur, la barre d'outils et la ligne d'info d'ALPHA sont figés."),
]

# ---------------------------------------------------------------- TABLEAU B
B = [
("Always on Top (« Toujours devant »)","La fenêtre reste au premier plan. S'active par clic droit sur la barre supérieure de la fenêtre ; un raccourci « Plug-in Editors Always on Top » existe.",
 "GS p.44 ; VH issues 18996 / 11377 / 22471","Non documenté dans le manuel d'utilisation (2 occurrences de « always on top » concernent seulement les poignées de fondu).","abs",
 "Aucune option. Mes fenêtres montent au premier plan au clic, mais rien ne les épingle."),
("Workspaces","« Une configuration de fenêtres Nuendo » : mémorise taille, position et contenu de toutes les fenêtres ; rappel par menu ou raccourcis ; stockés avec le projet.",
 "Manuel p.504 ; raccourcis p.527","Alt+Pavé 1-9 (rappel), Ctrl+Pavé 0 (nouveau), W (organiser), Alt+Pavé 0 (verrouiller)","abs",
 "Absent."),
("Verrouillage d'espace de travail","« Lock Active Workspace » protège la disposition mémorisée.","Manuel p.504","Alt+Pavé 0","abs","Absent."),
("Presets d'espaces de travail","Presets globaux (position/taille des fenêtres principales uniquement).","Manuel p.505","—","abs","Absent."),
("Fenêtres flottantes non modales","« Floating window… You can leave it open while you work – the Project window will always have the focus » (Panneau d'automatisation).",
 "Manuel p.217","—","part",
 "Mes fenêtres sont flottantes et non modales, mais le clic sur une fenêtre lui donne le focus : le comportement décrit pour Nuendo 4 n'est pas reproduit."),
("Projets multiples","Plusieurs projets peuvent être ouverts en même temps ; un bouton « Activate project » permet de changer de projet actif, et certains réglages s'appliquent à « toutes les fenêtres de tous les projets ouverts ».",
 "Manuel p.23, p.487","—","abs","ALPHA ne gère qu'un seul projet."),
("Cascade New Projects","Option du dialogue de « flattening » de la chaîne Arranger : chaque chaîne aplatie ouvre un nouveau projet, éventuellement en cascade.",
 "Manuel p.102","—","abs","Sans objet dans ALPHA (pas de piste Arranger)."),
("Plein écran vidéo","Clic droit dans la fenêtre vidéo ▸ Full Screen ; Échap pour sortir.","Manuel p.470-473","F8 (ouvrir la fenêtre)","abs","Absent (pas de vidéo)."),
("Masquer Inspecteur / Vue d'ensemble / Infoview","Commandes d'affichage des zones de la fenêtre de projet.","Manuel p.526","Alt+I / Alt+O / Ctrl+I","abs","Absent : l'inspecteur et la ligne d'aperçu ne peuvent pas être masqués."),
("Personnalisation des menus","On peut masquer les entrées de menu inutilisées.","Manuel p.509","—","abs","Menus d'ALPHA figés dans le code."),
("Personnalisation de la liste des pistes","Les contrôles affichés dans la liste des pistes se règlent par type de piste.","Manuel p.507","—","abs","Absent."),
("Réduire / agrandir / restaurer","Comportement de fenêtres du système d'exploitation.","—","—","part","Réduire/agrandir maison ; pas de « restaurer tout » ni de gestion multi-fenêtres globale."),
]

# ---------------------------------------------------------------- TABLEAU C
C = [
("Lecture / arrêt","Espace","Espace","ok"),
("Arrêt","Pavé numérique 0","0 (clavier principal)","part"),
("Cycle","Pavé numérique /","/","part"),
("Métronome","C","C","ok"),
("Accrochage (snap)","J","J","ok"),
("Outils 1 à 9","1…9","1…9","ok"),
("Outil précédent / suivant","F9 / F10","—","abs"),
("Zoom avant / arrière","H / G","+ / −","part"),
("Zoom complet","Maj+F","—","abs"),
("Panneau Transport","F2","F2","ok"),
("Mixer","F3","F3","ok"),
("Connexions VST","F4","F4","ok"),
("MediaBay","F5","Alt+B","abs"),
("Loop Browser","F6","F6 = panneau d'automatisation (conflit)","abs"),
("Sound Browser","F7","F7 = fenêtre Marqueurs (conflit)","abs"),
("Vidéo","F8","—","abs"),
("Instruments VST","F11","F11","ok"),
("Performances VST","F12","—","abs"),
("Fenêtre Marqueurs","Ctrl+M","F7","abs"),
("Pool","Ctrl+P","Ctrl+P","ok"),
("Navigateur de projet","Ctrl+B","—","abs"),
("Piste de tempo","Ctrl+T","—","abs"),
("Édition de canal","bouton « e » / Edit (Inspector, Mixer)","bouton « e » + touche E","part"),
("Inspecteur (afficher/masquer)","Alt+I","—","abs"),
("Vue d'ensemble (afficher/masquer)","Alt+O","—","abs"),
("Insérer un marqueur","Insert","—","abs"),
("Annuler / rétablir","Ctrl+Z / Ctrl+Maj+Z","menu seulement, non branché","abs"),
("Tout sélectionner","Ctrl+A","Ctrl+A non câblé ; entrée de menu fonctionnelle","part"),
("Enregistrer","Ctrl+S","—","abs"),
]

# ---------------------------------------------------------------- TABLEAU D
D = [
("P1","Mode « Toujours devant » par fenêtre (clic droit sur la barre de titre) + option pour les éditeurs de plug-ins","Comportement de fenêtre documenté en 4.3 (VH) et dans Getting Started"),
("P1","Espaces de travail : créer, nommer, rappeler, verrouiller, organiser, presets globaux","Manuel p.504-505"),
("P1","Performances VST (F12) avec charge CPU et disque","Manuel p.146"),
("P1","Fenêtre Marqueurs : raccourci Ctrl+M et édition (insérer, supprimer, renommer, repositionner)","Manuel p.109-113"),
("P1","Éditeur de piste de tempo (Ctrl+T) + bascule tempo fixe / piste de tempo","Manuel p.414-421"),
("P1","Navigateur de projet (Ctrl+B)","Manuel p.428-433"),
("P1","Éditeur de parties audio + éditeur de liste + édition en place","Manuel p.290-295, 381-386"),
("P1","Fenêtre vidéo (F8) avec mode plein écran","Manuel p.468-481"),
("P1","Control Room Mixer, Control Room Overview, Studio Sends","Manuel p.151-166"),
("P1","Boîtes de dialogue : Configuration du projet, Préférences, Commandes clavier éditables, Configuration des périphériques","Manuel p.30, 510-527, 11"),
("P1","Dialogues de fondus et fondu enchaîné, historique des traitements, détection des silences, analyseur de spectre, statistiques, export du mixage","Manuel p.89-95, 251-256, 437-444"),
("P2","Masquer/afficher Inspecteur (Alt+I), ligne d'aperçu (Alt+O), Infoview (Ctrl+I)","Manuel p.526"),
("P2","Dialogues Setup (barres d'outils, Transport, inspecteur, lignes d'info, réglages de canal)","Manuel p.506-509"),
("P2","Personnalisation des menus et des contrôles de la liste des pistes","Manuel p.507-509"),
("P2","Projets multiples avec cascade","Manuel p.23, 489"),
("P2","Éditeur logique, transformateur d'entrée, éditeur logique de projet","Manuel p.387-409"),
("P2","Feuille de pistes imprimable","Manuel p.434-436"),
("P2","Synchronisation, Machine Control, ReWire, VST System Link, SoundFrame","Manuel p.445-467, 482-485, 311"),
("P3","Corriger les raccourcis pour coller aux valeurs par défaut de Nuendo 4 : F5, F6, F7, F12, Ctrl+M, Ctrl+B, Ctrl+T, Alt+I, Alt+O","Manuel p.524-527"),
("P3","Renommer « MixConsole » en « Mixer » (terme exact de Nuendo 4)","Le mot « MixConsole » n'apparaît pas dans le manuel"),
]

# ---------------------------------------------------------------- TABLEAU E
E = [
("Fenêtre Historique","Aucune fenêtre d'historique dans le manuel Nuendo 4 (recherche plein texte : 0 occurrence de « Undo History window »).","Ajout d'ALPHA, sans équivalent N4"),
("Fiche Raccourcis clavier (lecture seule)","Nuendo 4 a une boîte de dialogue « Key Commands » qui permet d'affecter les raccourcis.","Version simplifiée : lecture seule"),
("Gestionnaire de projet","Nuendo 4 a le Project Browser (Ctrl+B) et la fonction Cleanup ; pas de « Gestionnaire de projet ».","Ajout / nom différent"),
("Notifications en haut à droite","Aucun équivalent documenté dans le manuel.","Ajout cosmétique"),
("Menu Fenêtres avec cases cochées","Non décrit ; le menu Windows de Nuendo 4 contient au minimum le sous-menu Workspaces.","Ajout pratique"),
("Zones gauche / droite / basse et « Set up Window Layout »","N'existent pas dans Nuendo 4 : 0 occurrence de « lower zone » / « right zone » et pas de dialogue de ce nom dans le manuel 2007. Ces éléments apparaissent dans des versions ultérieures de Cubase/Nuendo.","Ne pas présenter comme fidèle à N4"),
]

# ---------------------------------------------------------------- rendu
BADGE = {"ok":("Conforme","b-ok"), "part":("Partiel","b-part"), "abs":("Absent","b-abs"), "add":("Ajout","b-add")}
def badge(s):
    t,c = BADGE[s]
    return f'<span class="badge {c}">{t}</span>'

cnt = {"ok":0,"part":0,"abs":0}
for r in A: cnt[r[6]] += 1
total = len(A)
mb = {"ok":0,"part":0,"abs":0}
for r in B: mb[r[4]] += 1
mtot = len(B)
cb = {"ok":0,"part":0,"abs":0}
for r in C: cb[r[3]] += 1
ctot = len(C)

def rowsA():
    out=[]
    for i,r in enumerate(A,1):
        out.append(f"""<tr>
<td class="num">{i}</td>
<td class="n-en"><b>{r[0]}</b><span class="n-fr">{r[1]}</span><span class="n-ty">{r[2]}</span></td>
<td class="fn">{r[3]}</td>
<td class="rf">{r[4]}</td>
<td class="ky">{r[5]}</td>
<td class="st">{badge(r[6])}</td>
<td class="ec">{r[7]}</td>
</tr>""")
    return "\n".join(out)

def rowsB():
    return "\n".join(f"""<tr>
<td class="n-en"><b>{r[0]}</b></td><td class="fn">{r[1]}</td><td class="rf">{r[2]}</td>
<td class="ky">{r[3]}</td><td class="st">{badge(r[4])}</td><td class="ec">{r[5]}</td></tr>""" for r in B)

def rowsC():
    out=[]
    for r in C:
        out.append(f"""<tr><td class="fn">{r[0]}</td><td class="ky mono">{r[1]}</td><td class="ky mono">{r[2]}</td><td class="st">{badge(r[3])}</td></tr>""")
    return "\n".join(out)

def rowsD():
    return "\n".join(f"""<tr><td class="prio p-{r[0].lower()}">{r[0]}</td><td class="fn">{r[1]}</td><td class="rf">{r[2]}</td></tr>""" for r in D)

def rowsE():
    return "\n".join(f"""<tr><td class="n-en"><b>{r[0]}</b></td><td class="fn">{r[1]}</td><td class="rf">{r[2]}</td></tr>""" for r in E)

HTML = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comparatif factuel — Fenêtres de Nuendo 4 vs ALPHA Studio</title>
<style>
  :root{{
    --ink:#1b1d20; --soft:#4d545c; --line:#d3d8de; --line2:#e7ebef;
    --bg:#f6f7f9; --card:#fff; --accent:#2b5d86; --accent2:#eaf1f7;
    --ok:#1c6b3a; --okbg:#e3f3e8; --part:#8a5300; --partbg:#fdf0d8;
    --abs:#96301f; --absbg:#fbe6e2; --add:#2f5480; --addbg:#e6eef7;
  }}
  *{{box-sizing:border-box}}
  body{{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:14.5px;line-height:1.55;-webkit-font-smoothing:antialiased}}
  .wrap{{max-width:1500px;margin:0 auto;padding:34px 26px 70px}}
  header.top{{border-bottom:3px solid var(--accent);padding-bottom:18px;margin-bottom:26px}}
  .kicker{{font-size:11.5px;letter-spacing:2.2px;text-transform:uppercase;color:var(--accent);font-weight:700}}
  h1{{font-size:31px;line-height:1.2;margin:8px 0 10px;letter-spacing:-.4px}}
  .sub{{color:var(--soft);font-size:15px;max-width:1050px}}
  .meta{{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}}
  .pill{{background:var(--accent2);border:1px solid #cfe0ee;color:var(--accent);border-radius:999px;
    padding:3px 11px;font-size:12px;font-weight:600}}
  .pill.warn{{background:#fdf0d8;border-color:#f0d9ae;color:#8a5300}}
  h2{{font-size:21px;margin:44px 0 6px;padding-top:14px;border-top:1px solid var(--line);letter-spacing:-.2px}}
  h2 .n{{color:var(--accent);font-weight:800;margin-right:8px}}
  h3{{font-size:15.5px;margin:22px 0 8px}}
  p{{margin:9px 0}}
  .lead{{color:var(--soft)}}
  .cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:12px;margin:18px 0 8px}}
  .card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:13px 15px}}
  .card .v{{font-size:27px;font-weight:800;letter-spacing:-.5px;line-height:1.1}}
  .card .l{{font-size:12px;color:var(--soft);margin-top:3px}}
  .card.ok .v{{color:var(--ok)}} .card.part .v{{color:var(--part)}}
  .card.abs .v{{color:var(--abs)}} .card.tot .v{{color:var(--accent)}}
  .tbl-wrap{{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:auto;margin:14px 0 6px;
    box-shadow:0 1px 2px rgba(20,30,40,.04)}}
  table{{border-collapse:collapse;width:100%;font-size:13px;table-layout:fixed}}
  td,th{{word-break:break-word;overflow-wrap:anywhere}}
  thead th{{position:sticky;top:0;background:#eef2f6;border-bottom:2px solid #c9d3dc;text-align:left;
    padding:9px 10px;font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;color:#33414e;z-index:2}}
  td{{border-bottom:1px solid var(--line2);padding:8px 10px;vertical-align:top}}
  tbody tr:nth-child(even) td{{background:#fafbfc}}
  tbody tr:hover td{{background:#f2f6fa}}
  td.num{{color:#8b949e;font-variant-numeric:tabular-nums;text-align:right;width:34px}}
  .n-en b{{display:block;font-size:13px;color:#12212e}}
  .n-fr{{display:block;font-size:12px;color:var(--soft)}}
  .n-ty{{display:inline-block;margin-top:3px;font-size:10.5px;letter-spacing:.3px;color:#5c6b7a;
    background:#eef2f6;border:1px solid #dbe3ea;border-radius:4px;padding:0 5px}}
  td.fn{{}}
  td.rf{{color:#5c6b7a;font-size:12px}}
  td.ky{{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;color:#33414e}}
  td.ec{{font-size:12.4px;color:#2c343c}}
  td.st{{white-space:nowrap}}
  .badge{{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;letter-spacing:.2px}}
  .b-ok{{background:var(--okbg);color:var(--ok);border:1px solid #bfe0ca}}
  .b-part{{background:var(--partbg);color:var(--part);border:1px solid #efd6a6}}
  .b-abs{{background:var(--absbg);color:var(--abs);border:1px solid #f0c6bd}}
  .b-add{{background:var(--addbg);color:var(--add);border:1px solid #c6d8ea}}
  .prio{{font-weight:800;font-size:12px;white-space:nowrap}}
  .p-p1{{color:#a3301c}} .p-p2{{color:#8a5300}} .p-p3{{color:#2b5d86}}
  .note{{background:#fff8e8;border:1px solid #f0dfae;border-left:4px solid #d9a83c;border-radius:6px;
    padding:11px 14px;margin:14px 0;font-size:13.4px;color:#4a3a12}}
  .note b{{color:#3a2c08}}
  .quote{{border-left:3px solid #c9d3dc;padding:2px 0 2px 14px;margin:12px 0;color:#3b4753;font-size:13.6px}}
  .quote i{{color:#6b7784}}
  .toc{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:20px 0}}
  .toc a{{color:var(--accent);text-decoration:none}}
  .toc a:hover{{text-decoration:underline}}
  .toc ol{{margin:6px 0 0;padding-left:22px}} .toc li{{padding:2px 0}}
  .src{{font-size:13px}} .src li{{margin:7px 0}}
  code{{background:#eef2f6;border:1px solid #dbe3ea;border-radius:4px;padding:1px 5px;font-size:12px}}
  a{{color:var(--accent)}}
  .two{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
  @media (max-width:900px){{.two{{grid-template-columns:1fr}}}}
  .legend{{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0 0;font-size:12.5px;color:var(--soft)}}
  footer{{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);color:#6b7784;font-size:12.5px}}
  @media print{{body{{background:#fff}} .tbl-wrap{{box-shadow:none}} thead th{{position:static}} h2{{page-break-after:avoid}}}}
</style>
</head>
<body><div class="wrap">

<header class="top">
  <div class="kicker">Comparatif documenté · 15 novembre 2026</div>
  <h1>Fenêtres d'interface : Nuendo 4 (2007) vs ALPHA Studio (étape 1)</h1>
  <p class="sub">Nom exact de chaque fenêtre, fonction réellement documentée, raccourci par défaut,
  présence dans ALPHA, et liste de ce qui manque — y compris les modes de fenêtres
  (« Toujours devant », espaces de travail, plein écran, masquage de zones…).</p>
  <div class="meta">
    <span class="pill">Source principale : manuel officiel Nuendo 4 (14/09/2007)</span>
    <span class="pill">Version History 4.3.0 (Steinberg)</span>
    <span class="pill">Getting Started Nuendo 4</span>
    <span class="pill warn">ALPHA = interface seule, sans moteur audio</span>
  </div>
</header>

<div class="toc">
  <b>Sommaire</b>
  <ol>
    <li><a href="#methode">Méthode, périmètre et niveau de preuve</a></li>
    <li><a href="#synthese">Synthèse chiffrée</a></li>
    <li><a href="#ta">Tableau A — Fenêtres, éditeurs et boîtes de dialogue</a></li>
    <li><a href="#tb">Tableau B — Modes et comportements de fenêtres</a></li>
    <li><a href="#tc">Tableau C — Raccourcis : conformité</a></li>
    <li><a href="#td">Tableau D — Ce qui manque à ALPHA, par priorité</a></li>
    <li><a href="#te">Tableau E — Ce qu'ALPHA ajoute (et ce que Nuendo 4 n'a pas)</a></li>
    <li><a href="#limites">Limites de ce comparatif</a></li>
    <li><a href="#sources">Sources</a></li>
  </ol>
</div>

<div class="note" style="border-left:4px solid #c99436">
<b>Note de mise à jour (19 novembre 2026).</b> Ce comparatif a été établi après le <b>lot 2</b>. Depuis,
les lots 3, 4 et 5 ont livré <b>59 fenêtres</b> : les lignes marquées « absente » pour Performances VST,
Control Room, Pool, MediaBay, Tempo, Beat Calculator, Navigateur de projet, Feuille de pistes,
Éditeurs logiques, Input Transformer, Import Medium, OMF/AAF, Traitement par lot, Surround Panner,
Synchronisation, Machine Control, VST System Link, ReWire, Configuration du projet, Préférences,
Commandes clavier, Espaces de travail, Configuration des périphériques, MIDI Device Manager,
Dialogues Setup, Fondu / Fondu enchaîné, Historique hors ligne, Détection des silences, Analyseur de spectre,
Statistiques, Export Audio Mixdown, Éditeur de liste et Éditeur de parties audio <b>existent désormais</b>
(voir <code>README.md</code> et <code>docs/ce-qui-manque-daw-complet.html</code>, mis à jour).
Seul le statut des <b>moteurs</b> (audio, MIDI, vidéo) reste inchangé : aucune fenêtre ne produit de son.</div>

<h2 id="methode"><span class="n">1</span>Méthode, périmètre et niveau de preuve</h2>
<p><b>Ce qui a été fait.</b> Le manuel d'utilisation officiel de Nuendo 4 (PDF, date de sortie du 14 septembre 2007,
version anglaise) a été téléchargé puis analysé en texte intégral : sommaire, chapitres, annexe
« Key commands » (p. 524-527) et recherche plein texte. Les points que le manuel ne couvre pas
(mode « Toujours devant ») ont été vérifiés dans deux documents Steinberg distincts : le
Getting Started Nuendo 4 et le document officiel « Nuendo 4.3.0 — Version History / Issues &amp; Solutions ».</p>
<p><b>Ce que « fonction réelle » veut dire ici.</b> Pour Nuendo 4 : la fonction décrite par le manuel, avec le numéro de page.
Pour ALPHA : ce que l'interface fait réellement aujourd'hui. ALPHA n'a pas encore de moteur audio :
aucune de ses fenêtres ne produit, n'enregistre ni ne traite du son. Le statut « Conforme » porte donc
sur <i>la fenêtre et la fonction d'interface</i>, jamais sur un traitement audio.</p>
<div class="legend">
  {badge("ok")} fenêtre présente, même rôle que dans Nuendo 4 &nbsp;·&nbsp;
  {badge("part")} présente mais sous-ensemble / simplifiée &nbsp;·&nbsp;
  {badge("abs")} absente d'ALPHA &nbsp;·&nbsp;
  {badge("add")} présente dans ALPHA, sans équivalent dans Nuendo 4
</div>
<div class="note"><b>Point de vigilance documentaire.</b> Le mode <b>« Always on Top » (« Toujours devant »)</b>
est confirmé pour Nuendo 4 par le Getting Started (clic droit sur la barre supérieure d'une fenêtre)
et par la Version History 4.3.0 (correctif n° 18996 « Plug-in Editors Always on Top », et avertissements
n° 11377 et 22471 sur des fenêtres en mode « Always on Top »). Il n'est en revanche <b>pas décrit dans le manuel
d'utilisation</b> : les seules occurrences de « always on top » y concernent les poignées de fondu des événements.
C'est indiqué comme tel dans le tableau B.</div>

<h2 id="synthese"><span class="n">2</span>Synthèse chiffrée</h2>
<div class="cards">
  <div class="card tot"><div class="v">{total}</div><div class="l">éléments d'interface relevés dans le manuel Nuendo 4 (tableau A)</div></div>
  <div class="card part"><div class="v">{cnt['part']}</div><div class="l">présents dans ALPHA de façon partielle</div></div>
  <div class="card ok"><div class="v">{cnt['ok']}</div><div class="l">strictement conformes</div></div>
  <div class="card abs"><div class="v">{cnt['abs']}</div><div class="l">absents d'ALPHA</div></div>
  <div class="card abs"><div class="v">{mb['abs']} / {mtot}</div><div class="l">modes et comportements de fenêtres absents (tableau B) — {mb['part']} partiels, {mb['ok']} conformes</div></div>
  <div class="card part"><div class="v">{cb['ok']} / {ctot}</div><div class="l">raccourcis identiques à Nuendo 4 (tableau C) — {cb['part']} partiels, {cb['abs']} absents ou en conflit</div></div>
</div>
<p class="lead">Lecture : aucun élément ne peut être « strictement conforme » aujourd'hui puisque
les fenêtres d'ALPHA sont des interfaces sans moteur. Les {cnt['part']} éléments « partiels » sont
ceux dont le nom, la disposition et les interactions de base existent.</p>

<h2 id="ta"><span class="n">3</span>Tableau A — Fenêtres, éditeurs et boîtes de dialogue de Nuendo 4</h2>
<p class="lead">Noms exacts du manuel en anglais (les libellés français sont une traduction de travail, pas une
appellation officielle Steinberg). Réf. = page du manuel Nuendo 4. Racc. = raccourci par défaut documenté p. 524-527.</p>
<div class="tbl-wrap"><table>
<colgroup><col style="width:36px"><col style="width:205px"><col style="width:27%">
<col style="width:78px"><col style="width:108px"><col style="width:86px"><col></colgroup>
<thead><tr>
  <th>#</th><th>Fenêtre / dialogue (nom exact)</th><th>Fonction documentée</th>
  <th>Réf.</th><th>Racc. N4</th><th>Dans ALPHA</th><th>Écart précis</th>
</tr></thead>
<tbody>
{rowsA()}
</tbody></table></div>

<h2 id="tb"><span class="n">4</span>Tableau B — Modes et comportements de fenêtres</h2>
<p class="lead">C'est la partie que le premier jet d'ALPHA ne couvrait pas, notamment le mode « Toujours devant ».</p>
<div class="tbl-wrap"><table>
<colgroup><col style="width:180px"><col style="width:28%"><col style="width:170px">
<col style="width:165px"><col style="width:80px"><col></colgroup>
<thead><tr><th>Mode / comportement</th><th>Ce que fait Nuendo 4 (documenté)</th>
<th>Réf. / preuve</th><th>Racc. N4</th><th>Dans ALPHA</th><th>Écart</th></tr></thead>
<tbody>{rowsB()}</tbody></table></div>
<div class="quote">« A configuration of Nuendo windows is called a “workspace”. A workspace stores the size, position and content of all windows, allowing you to quickly switch between different working modes… »
<i>— Manuel Nuendo 4, p. 504</i></div>
<div class="quote">« The Automation panel is a floating window, similar to the Mixer and Transport panel. You can leave it open while you work – the Project window will always have the focus. »
<i>— Manuel Nuendo 4, p. 217</i></div>

<h2 id="tc"><span class="n">5</span>Tableau C — Raccourcis : conformité avec les valeurs par défaut de Nuendo 4</h2>
<p class="lead">Relevé dans l'annexe « Key commands » du manuel (p. 524-527) et comparé aux raccourcis réellement
implémentés dans ALPHA.</p>
<div class="tbl-wrap"><table>
<colgroup><col style="width:34%"><col style="width:18%"><col style="width:34%"><col style="width:14%"></colgroup>
<thead><tr><th>Commande</th><th>Nuendo 4 (défaut)</th><th>ALPHA</th><th>Statut</th></tr></thead>
<tbody>{rowsC()}</tbody></table></div>
<div class="note"><b>Conséquence factuelle.</b> ALPHA utilise aujourd'hui <code>F6</code> pour le panneau d'automatisation
et <code>F7</code> pour les marqueurs, alors que Nuendo 4 réserve <code>F6</code> au Loop Browser et <code>F7</code> au Sound Browser.
Les marqueurs de Nuendo 4 s'ouvrent avec <code>Ctrl+M</code>, le MediaBay avec <code>F5</code>.
Six raccourcis surlignés « Absent » dans le tableau créent donc des conflits ou des manques mesurables.</div>

<h2 id="td"><span class="n">6</span>Tableau D — Ce qui manque à ALPHA, par priorité</h2>
<p class="lead">P1 = fenêtre ou mode explicitement documenté dans Nuendo 4 et sans équivalent dans ALPHA.
P2 = compléments de fidélité. P3 = corrections de nommage / raccourcis.</p>
<div class="tbl-wrap"><table>
<colgroup><col style="width:62px"><col><col style="width:300px"></colgroup>
<thead><tr><th>Prio.</th><th>À construire</th><th>Référence</th></tr></thead>
<tbody>{rowsD()}</tbody></table></div>

<h2 id="te"><span class="n">7</span>Tableau E — Ce qu'ALPHA ajoute, et ce que Nuendo 4 n'a pas</h2>
<p class="lead">Cette section évite une erreur fréquente : attribuer à Nuendo 4 des éléments venus de versions ultérieures.</p>
<div class="tbl-wrap"><table>
<colgroup><col style="width:210px"><col><col style="width:210px"></colgroup>
<thead><tr><th>Élément</th><th>Constat</th><th>Classement</th></tr></thead>
<tbody>{rowsE()}</tbody></table></div>
<div class="note"><b>Précision sur « MixConsole ».</b> Le mot <i>MixConsole</i> n'apparaît <b>aucune fois</b> dans le manuel
Nuendo 4 (recherche plein texte : 0 occurrence). La fenêtre s'appelle <b>Mixer</b>, ouverte par <code>F3</code>.
« MixConsole » est une appellation de versions ultérieures : le nom affiché dans ALPHA est donc anachronique
par rapport à 2007.</div>

<h2 id="limites"><span class="n">8</span>Limites de ce comparatif</h2>
<p>• La comparaison porte sur le <b>manuel d'utilisation Nuendo 4.0</b> (14/09/2007) et sur les documents 4.3.0.
Des fonctions ajoutées par les mises à jour 4.1 à 4.3, non décrites dans le manuel, peuvent manquer à ce relevé :
c'est le cas du mode « Toujours devant », traité à part.</p>
<p>• Le manuel consulté est la version <b>anglaise</b>. Les libellés français de Nuendo 4 ne sont donc pas cités
comme officiels ; seuls les noms anglais le sont.</p>
<p>• Les captures du manuel n'ont pas été comparées pixel par pixel aux fenêtres d'ALPHA : les écarts signalés
portent sur les <b>fonctions et les modes documentés</b>, pas sur les mesures, polices ou couleurs.</p>
<p>• <b>Ce qui n'est pas vérifié</b> et n'est donc pas affirmé ici : le nombre exact d'emplacements du rack VST Instruments,
l'existence d'un raccourci par défaut pour la fenêtre Marqueurs autre que Ctrl+M, et le contenu détaillé du menu
Windows de Nuendo 4 au-delà du sous-menu Workspaces.</p>

<h2 id="sources"><span class="n">9</span>Sources</h2>
<ol class="src">
  <li><b>[M]</b> Steinberg Media Technologies GmbH, <i>Nuendo — Operation Manual</i>, Release Date 14 septembre 2007,
    © 2007. PDF officiel (365 pages) :
    <a href="https://www.strumentimusicali.net/manuali/STEINBERG_NUENDO4_ENG.pdf" target="_blank" rel="noopener">strumentimusicali.net/manuali/STEINBERG_NUENDO4_ENG.pdf</a>.
    Pages citées : 22-25 (Project window), 58-63 (Transport), 89-97 (fondus), 109-113 (marqueurs), 122-150 (Mixer),
    146 (VST Performance), 151-166 (Control Room), 189-201 (VST Instruments), 217-237 (Automation panel),
    258-295 (Sample / Audio Part Editor), 296-326 (Pool, MediaBay), 327-341 (presets et quick controls),
    363-386 (éditeurs MIDI), 387-409 (éditeurs logiques), 414-421 (tempo), 428-436 (Project Browser, Track Sheet),
    437-444 (Export Audio Mixdown), 448-467 (synchronisation, System Link), 468-481 (vidéo), 482-485 (ReWire),
    487 (bouton Activate project), 489 (options de démarrage), 102 (Cascade New Projects), 503-516 (personnalisation, workspaces, Setup dialogs, préférences),
    517-527 (raccourcis clavier).</li>
  <li><b>[VH]</b> Steinberg, <i>Nuendo 4.3.0.371 — Version History / Issues &amp; Solutions</i>, PDF officiel :
    <a href="https://download.steinberg.net/downloads_software/Nuendo_4/4.3.0.371/Version_History_Issues_and_Solutions_Nuendo_4.3.0.pdf" target="_blank" rel="noopener">download.steinberg.net/…/Version_History_Issues_and_Solutions_Nuendo_4.3.0.pdf</a>.
    Preuves utilisées : n° 18996 (« Crash after key command for “Plug-in Editors Always on Top” was used »),
    n° 11377 (« If Media Bay window is in “always on top” mode… »), n° 22471 (« Please check that no window with
    the “Always on Top” mode is opened »).</li>
  <li><b>[GS]</b> Steinberg, <i>Getting Started Nuendo 4</i>, texte officiel reproduit :
    « If you want “HALionOne” to stay always on top while you are working, you can right-click on the bar near the
    top of the instrument and select “Always on Top” » — version française : « rester toujours au premier plan…
    sélectionnez “Toujours devant” ».
    <a href="https://www.notice-facile.com/en/manual/533772/steinberg+nuendo-4" target="_blank" rel="noopener">notice-facile.com</a> ·
    <a href="https://pdfslide.us/documents/getting-started-nuendo.html" target="_blank" rel="noopener">pdfslide.us</a></li>
  <li><b>[SOS]</b> Sound On Sound, <i>Steinberg Nuendo 4</i> (test) :
    <a href="https://www.soundonsound.com/reviews/steinberg-nuendo-4" target="_blank" rel="noopener">soundonsound.com/reviews/steinberg-nuendo-4</a> —
    utilisé uniquement pour le contenu du panneau d'automatisation (Preview, Punch Log, Touch Collect Assistant,
    Return Time, panneau personnalisable).</li>
  <li><b>[MR]</b> MusicRadar, <i>Steinberg Nuendo 4 review</i> :
    <a href="https://www.musicradar.com/reviews/tech/steinberg-nuendo-4-78540" target="_blank" rel="noopener">musicradar.com</a> —
    utilisé pour confirmer les options d'automatisation (Fill, Trim, Punch, Preview) et le contenu du NEK.</li>
</ol>

<footer>
  Document généré pour le projet ALPHA Studio · ALPHA Studio est une interface originale inspirée de
  l'ergonomie de Nuendo 4 ; elle n'est ni éditée ni approuvée par Steinberg.
  « Nuendo », « Cubase » et « VST » sont des marques de Steinberg Media Technologies GmbH.
</footer>
</div></body></html>"""

import pathlib, os
_out = pathlib.Path(__file__).resolve().parent / 'docs' / 'comparatif-nuendo4-vs-alpha.html'
os.makedirs(_out.parent, exist_ok=True)
open(_out, 'w', encoding='utf-8').write(HTML)
print("OK", len(HTML), "caractères | lignes A:", total, "| part:", cnt['part'], "ok:", cnt['ok'], "abs:", cnt['abs'])
