# -*- coding: utf-8 -*-
"""Génère docs/ce-qui-manque-daw-complet.html : audit des manques d'ALPHA Studio."""
from pathlib import Path

DATE = "19 novembre 2026"

# ---------------------------------------------------------------- données
COUCHES = [
    # nom, existe, manque, poids, pct
    ("Interface & ergonomie", 3,
     "59 fenêtres, 458 entrées de menu dont 49 sous-menus, barre d’outils configurable, accrochage 8 modes, règle 7 formats, liste de pistes complète, inspecteur avec Quick Controls, transport élargi, raccourcis réaffectables, espaces de travail.",
     "Rien de bloquant côté interface. Reste : fenêtres du Nuendo Expansion Kit (batterie, partitions), SysEx réel, import réel dans le Pool.",
     96),
    ("Fenêtre Projet (timeline)", 3,
     "18 pistes (dont vidéo, tempo, règle, arrangement, instrument), 42 événements, règle multi-formats, ligne d’aperçu, zoom, défilement synchronisé, inspecteur, ligne d’info.",
     "Collage sur d’autres pistes, édition en place, historique illimité, outils Time Warp/Scrub limités au visuel.",
     72),
    ("Transport & horloge", 2,
     "Boutons, afficheurs LCD position / temps / timecode, cycle, localisateurs, jog/shuttle, pré/post-roll, Auto-Quantize, modes d’enregistrement, marqueurs cliquables.",
     "La lecture est une horloge d’interface (le curseur avance, sans son) : le moteur audio reste à faire.",
     55),
    ("Moteur audio", 0,
     "— zéro ligne d’API audio dans le code livré (aucun <code>AudioContext</code>, <code>AudioWorklet</code>, <code>decodeAudioData</code>).",
     "Graphe de signal, lecture des médias, mixage temps réel, latence, voix, monitoring.",
     0),
    ("Enregistrement", 0,
     "Bouton REC (message « étape 2 »), fenêtre Control Room en habillage.",
     "Entrées, arming, punch in/out, précompte, monitoring, latence, fichiers écrits sur disque.",
     0),
    ("Édition / undo", 1,
     "Déplacement, redimensionnement (3 modes), division, copie / coupe / collage, suppression, duplication, nudge, fondus, volume d’événement, sélection rectangle / Maj+clic, <b>Ctrl+Z</b> (40 niveaux), accrochage 8 modes fonctionnel, édition des courbes au Line tool.",
     "Collage multi-pistes, assemblage (colle), édition en place, pile d’annulation illimitée reliée à la fenêtre Historique, quantification réelle des événements MIDI.",
     68),
    ("Mixage & DSP", 1,
     "Console dessinée : 12 tranches, inserts, EQ 4 bandes, départs, fader glissable (visuel).",
     "Gain staging, faders reliés au son, pan réel, mute/solo audio, bus, groupes, master, EQ et dynamique appliqués.",
     5),
    ("Automatisation", 1,
     "Panneau complet, sous-pistes d’automatisation dans la liste, courbes par piste, Line tool (5 modes) qui dessine réellement la courbe.",
     "Écriture et lecture audio sample-accurate, édition des points à la souris, modes réellement appliqués.",
     30),
    ("MIDI", 1,
     "Éditeur clavier, 119 notes générées, modificateurs MIDI, moniteur MIDI, transpose et vélocité appliqués aux parties, Quick Controls.",
     "Entrée MIDI réelle, instruments joués, quantize qui change le son, capture, merge, SysEx.",
     18),
    ("Instruments & plug-ins", 1,
     "Fenêtres Périphériques VST / Sound Browser / racks, listes de noms.",
     "Aucun instrument ne produit de son. Pas d’hôte VST3, pas de moteur d’instrument interne.",
     2),
    ("Fichiers & sauvegarde projet", 0,
     "Un seul stockage : <code>localStorage['alpha.workspaces']</code> (positions de fenêtres).",
     "Aucun import audio/MIDI, aucun export, aucun format de projet, aucune autosauvegarde.",
     1),
    ("Vidéo", 0,
     "Moniteur vidéo factice (NO SIGNAL), code temporel simulé.",
     "Décodage, poursuite, bande son de la vidéo, pull-down, export avec image.",
     0),
    ("Temps réel & performance", 0,
     "Fenêtre Performances VST avec chiffres simulés.",
     "Ordonnanceur, taille de buffer, sous-charge, priorité audio, mesures réelles.",
     0),
]

PILIERS = [
    ("1", "J’appuie sur <b>Espace</b> : j’entends du son et le curseur avance.",
     "Aucun son. Le curseur <b>avance</b> (horloge d’interface) : la moitié visuelle du geste est là.",
     "AudioContext + AudioWorklet, ordonnanceur à anticipation, lecture des médias, synchronisation visuelle.",
     "XL", "J1"),
    ("2", "Je branche un micro, je m’enregistre, je réécoute aligné.",
     "Rien : pas d’entrée, pas de fichier, pas de monitoring.",
     "getUserMedia, arming, punch, décompte, écriture de fichiers, latence compensée.",
     "L", "J3"),
    ("3", "Je déplace, je coupe, je duplique — et <b>Ctrl+Z</b> annule.",
     "<b>Fait.</b> Les événements se déplacent, se coupent, se dupliquent ; <b>Ctrl+Z annule</b> (40 niveaux), y compris après une suppression.",
     "Modèle de données mutable, transactions, pile d’annulation illimitée, snapping.",
     "L", "J2"),
    ("4", "Je pousse un fader : le son change vraiment, les VU suivent.",
     "Le fader glisse à l’écran, aucun signal n’existe derrière.",
     "Graphe de routage (piste → bus → master), gain/pan/mute/solo réels, mesure de niveau.",
     "L", "J4"),
    ("5", "J’écris une automatisation : elle est rejouée à chaque lecture.",
     "Le panneau est complet, mais il n’écrit ni ne lit quoi que ce soit.",
     "Cannes d’automation, interpolation, modes, édition des points, horodatage sample.",
     "L", "J4"),
    ("6", "Je joue d’un clavier MIDI : l’instrument sonne et mes notes s’enregistrent.",
     "L’éditeur clavier affiche des notes décoratives. Rien n’est jouable.",
     "Web MIDI, instrument (synthèse ou SoundFont), capture, quantize, boucle.",
     "XL", "J5"),
    ("7", "Je ferme, je rouvre : tout est là, y compris mes fichiers.",
     "Seule la position des fenêtres survit.",
     "Format de projet versionné, médias référencés, autosauvegarde, gestion des fichiers manquants.",
     "M", "J2"),
    ("8", "J’exporte : le WAV correspond exactement à ce que j’entends.",
     "Le dialogue Export est un formulaire qui n’écrit rien.",
     "OfflineAudioContext, rendu plus rapide que le temps réel, dither, stems, nommage.",
     "M", "J5"),
]

INTERFACE = [
    ("Arranger réel", "p. 98", "La piste d’arrangeur et ses blocs sont dessinés : il reste à faire obéir la lecture à l’ordre des blocs."),
    ("Logical Editor exécutable", "p. 387", "La fenêtre existe avec ses filtres et ses actions : les transformations ne s’appliquent pas encore aux événements."),
    ("Track Presets réels", "p. 327", "Dialogue présent ; aucun preset n’est écrit ni rappelé sur une piste."),
    ("Pool complet", "p. 296", "Tableau et colonnes présents ; l’import réel, les conversions et le dossier de projet demandent le système de fichiers."),
    ("Éditeur SysEx", "p. 410", "Absent : il suppose une sortie MIDI réelle (Web MIDI) et un périphérique."),
    ("Synchronisation SMPTE / MTC", "p. 445 / 460", "La fenêtre de synchronisation existe en habillage ; la référence d’horloge externe n’est pas accessible depuis un navigateur."),
    ("Traitements destructifs d’échantillon", "p. 258", "Trim, normalisation, dessin de forme d’onde : l’éditeur affiche l’onde, il ne la modifie pas."),
    ("Éditeurs MIDI avancés", "p. 363", "Partition et batterie relèvent du Nuendo Expansion Kit : hors périmètre, et sans moteur ils n’auraient rien à afficher."),
]

JALONS = [
    ("J1", "Le son", "Moteur + transport",
     ["AudioContext créé au premier geste utilisateur, worklet de mixage chargé.",
      "Lecture des 12 pistes avec sources générées (oscillateurs + bruit filtré) : on entend le projet.",
      "Curseur qui avance à l’horloge audio, boucle A/B réelle, métronome audible.",
      "VU-mètres et faders branchés sur de vrais nœuds de gain."],
     "J’appuie sur Espace : ça sonne, ça boucle, le curseur suit sans dérive après 10 minutes.", "XL"),
    ("J2", "L’édition", "Manipulation + sauvegarde",
     ["Déplacer / redimensionner / scinder / coller / gommer avec accrochage musical.",
      "Pile d’annulation illimitée et historique réel (la fenêtre existante s’y branche).",
      "Format de projet <code>ALPHA Projet 1 (.alphaproj)</code> : JSON versionné + médias, autosauvegarde.",
      "Import de fichiers audio par glisser-déposer, waveforms calculées depuis les données."],
     "Je déplace 20 événements, je coupe, je fais 30 Ctrl+Z, je ferme et rouvre : tout est intact.", "L"),
    ("J3", "L’enregistrement", "Entrées + monitoring",
     ["Entrées via getUserMedia, arming par piste, décompte, punch in/out.",
      "Écriture des prises en AudioBuffer + export WAV, compensation de latence.",
      "Monitoring avec avertissement honnête sur la latence Web (10–20 ms)."],
     "J’enregistre 8 mesures au métronome : la prise est alignée à moins de 5 ms sur la grille.", "L"),
    ("J4", "Le mixage", "Routage + automatisation",
     ["Graphe complet : pistes → bus de groupe → FX → master, départs A/B.",
      "Faders, pan, mute, solo réellement audio ; EQ 4 bandes et dynamique en worklet.",
      "Automatisation écrite/lue pour volume, pan, mute, envois, avec modes et édition des points.",
      "Mesure : VU, crête, LUFS approximatif sur le master."],
     "Une automation de volume est rejouée à l’identique, mute/solo coupent réellement le signal.", "XL"),
    ("J5", "MIDI & rendu", "Instruments + export",
     ["Web MIDI, instrument interne (synthèse ou SoundFont), capture et boucle.",
      "Éditeurs MIDI qui modifient le son ; quantize réel.",
      "Rendu hors ligne (<code>OfflineAudioContext</code>), dither, stems multiples, nommage.",
      "Fenêtre Export branchée sur le vrai rendu, avec barre de progression annulable."],
     "J’enregistre une partie MIDI, je l’exporte en WAV 48 kHz / 24 bit : le fichier est identique à ce que j’entends.", "XL"),
    ("J6", "Le reste", "Vidéo, surround, finitions",
     ["Vidéo : décodage, poursuite image, bande son, export avec image.",
      "Control Room réelle : monitors A/B, cue, talkback simulé.",
      "Préférences qui agissent vraiment, gestion des périphériques, project templates.",
      "Accessibilité clavier, sauvegarde de secours, écran de démarrage."],
     "Je charge une vidéo, je cale un événement sur l’image, j’exporte la séquence avec la vidéo.", "M"),
]

DECISIONS = [
    ("Rendu audio", "Web Audio API + <b>AudioWorklet</b> pour le DSP. <code>ScriptProcessorNode</code> est écarté (obsolète, latence non maîtrisée).",
     "Le DSP s’exécute sur le thread audio : aucune allocation par bloc, pas d’opération lourde hors worklet."),
    ("Ordonnanceur", "Horloge <code>audioContext.currentTime</code> + planification à anticipation de 100 ms (patron « look-ahead »).",
     "<code>setInterval</code> / <code>requestAnimationFrame</code> seuls ne tiennent pas la mesure."),
    ("Fichiers", "File System Access API quand disponible, repli <code>&lt;input type=file&gt;</code> + téléchargement.",
     "En fichier local, l’API est bridée : le repli doit être propre, pas une dégradation."),
    ("Format de projet", "JSON versionné zippé (CompressionStream) + médias dans le même conteneur.",
     "Un binaire maison serait plus rapide mais illisible et impossible à débugger."),
    ("MIDI", "Web MIDI API (Chrome / Edge), clavier virtuel de secours partout ailleurs.",
     "Pas de Web MIDI sous Firefox / Safari : à annoncer, pas à cacher."),
    ("Instruments", "Synthèse interne (oscillateurs, échantillons embarqués) puis SoundFont .sf2.",
     "Pas d’hôte VST3 possible ; « VSTi » restera un mot d’interface, pas une réalité technique."),
    ("Threads", "Tout sur le thread audio ; <code>SharedArrayBuffer</code> écarté (nécessite des en-têtes COOP/COEP incompatibles avec un fichier ouvert en local).",
     "La charge devra rester modeste : quelques dizaines de voix, pas 200 pistes."),
]

NON_FAIT = [
    ("Hôte VST3 / AU / AAX", "Impossible dans un navigateur. On peut simuler l’interface, jamais le binaire."),
    ("ASIO, Core Audio, WASAPI", "Le navigateur choisit le pilote ; on ne pilote pas la carte son."),
    ("Monitoring à latence nulle", "Le round-trip Web Audio reste à 10–20 ms selon la machine et le système."),
    ("Surround réel 5.1 / 8 canaux", "Web Audio gère des canaux multiples, mais le routage de monitoring multicanal reste hors de portée."),
    ("Synchronisation matérielle SMPTE / System Link", "Nécessite un accès natif aux ports et à l’horloge."),
    ("200 pistes en temps réel", "Sans threads partagés, le plafond réaliste est de quelques dizaines de voix simultanées."),
]

# ---------------------------------------------------------------- HTML
def bar(pct, cls=""):
    return ('<div class="bar"><i class="%s" style="width:%d%%"></i></div>' % (cls, pct))

def couche_rows():
    out = []
    for nom, n, existe, manque, pct in COUCHES:
        cls = "" if pct >= 50 else ("warn" if pct >= 10 else "bad")
        dot = "d3" if pct >= 50 else ("d2" if pct >= 10 else "d0")
        out.append(
            '<tr><td class="nm"><b>%s</b><span class="dot %s"></span></td>'
            '<td class="pct"><span class="num %s">%d&nbsp;%%</span>%s</td>'
            '<td>%s</td><td class="m">%s</td></tr>'
            % (nom, dot, cls, pct, bar(pct, cls), existe, manque))
    return "\n".join(out)

def pilier_rows():
    out = []
    for n, test, etat, manque, taille, jalon in PILIERS:
        out.append(
            '<tr><td class="pnum">%s</td><td class="test">%s</td><td class="etat">%s</td>'
            '<td>%s</td><td class="t t%s">%s</td><td class="j">%s</td></tr>'
            % (n, test, etat, manque, taille, taille, jalon))
    return "\n".join(out)

def interface_rows():
    return "\n".join('<tr><td class="nm">%s</td><td class="pg">%s</td><td>%s</td></tr>' % r for r in INTERFACE)

def jalon_blocks():
    out = []
    for code, titre, sous, items, critere, taille in JALONS:
        out.append(
            '<div class="jalon"><div class="jhead"><span class="jcode">%s</span>'
            '<span class="jt">%s</span><span class="js">%s</span>'
            '<span class="jt t%s">%s</span></div>'
            '<ul>%s</ul>'
            '<div class="crit"><b>Critère de réussite :</b> %s</div></div>'
            % (code, titre, sous, taille, taille, "".join("<li>%s</li>" % i for i in items), critere))
    return "\n".join(out)

def decision_rows():
    return "\n".join('<tr><td class="nm">%s</td><td>%s</td><td class="m">%s</td></tr>' % r for r in DECISIONS)

def nonfait_rows():
    return "\n".join('<tr><td class="nm">%s</td><td>%s</td></tr>' % r for r in NON_FAIT)

HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ALPHA Studio — ce qui manque pour être un DAW complet</title>
<style>
  :root{
    --ink:#1d2328; --ink2:#414a51; --mut:#6b757d; --line:#d6dce1; --line2:#e8ecef;
    --paper:#ffffff; --soft:#f6f8f9; --acc:#2f6f9f; --acc2:#1d4d70;
    --ok:#2e8b57; --warn:#c98a1f; --bad:#b3453a;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{
    margin:0; background:#eef1f3; color:var(--ink);
    font:14px/1.55 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;
  }
  .page{max-width:1040px;margin:0 auto;background:var(--paper);padding:0 0 56px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
  header{padding:34px 44px 26px;border-bottom:3px solid var(--acc);background:linear-gradient(180deg,#fbfcfd,#f4f7f9)}
  .kick{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:var(--acc);font-weight:700}
  h1{margin:6px 0 6px;font-size:30px;line-height:1.15;letter-spacing:-.4px}
  .sub{margin:0;color:var(--ink2);font-size:14.5px;max-width:78ch}
  .meta{margin-top:14px;display:flex;flex-wrap:wrap;gap:18px;font-size:11.5px;color:var(--mut)}
  .meta b{color:var(--ink2)}
  main{padding:0 44px}
  section{margin:34px 0 0}
  h2{font-size:18px;margin:0 0 4px;letter-spacing:-.2px}
  h2 .n{color:var(--acc);font-variant-numeric:tabular-nums;margin-right:8px}
  .lead{margin:2px 0 14px;color:var(--ink2);max-width:92ch}
  h3{font-size:14px;margin:20px 0 6px;letter-spacing:.1px}
  p{margin:8px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0 4px;font-size:12.4px}
  th{text-align:left;font-size:10.5px;letter-spacing:.7px;text-transform:uppercase;color:var(--mut);
     border-bottom:1.5px solid var(--line);padding:7px 8px;font-weight:700;background:var(--soft)}
  td{border-bottom:1px solid var(--line2);padding:8px;vertical-align:top;color:var(--ink2)}
  td.nm{color:var(--ink);font-weight:600}
  td.nm b{display:block;font-weight:700}
  td.m{color:var(--mut)}
  tr:hover td{background:#fafbfc}
  .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:7px;vertical-align:1px}
  .d0{background:var(--bad)} .d1{background:var(--bad);opacity:.55} .d2{background:var(--warn)} .d3{background:var(--ok)}
  .num{font-variant-numeric:tabular-nums;font-weight:700;font-size:12px;color:var(--ink)}
  .num.warn{color:var(--warn)} .num.bad{color:var(--bad)}
  .bar{height:5px;background:#eaedef;border-radius:3px;margin-top:5px;overflow:hidden}
  .bar i{display:block;height:100%;background:var(--ok);border-radius:3px}
  .bar i.warn{background:var(--warn)} .bar i.bad{background:var(--bad)}
  .verdict{border:1px solid #cfe0ec;background:linear-gradient(180deg,#f7fbfd,#eff6fa);border-left:4px solid var(--acc);
           padding:16px 18px;margin:24px 0 0;border-radius:0 3px 3px 0}
  .verdict p{margin:0 0 8px}
  .verdict p:last-child{margin:0}
  .verdict .big{font-size:16.5px;font-weight:700;letter-spacing:-.2px;color:#16394f}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 0}
  .kpi{border:1px solid var(--line);border-radius:4px;padding:11px 12px;background:var(--paper)}
  .kpi .v{font-size:24px;font-weight:800;letter-spacing:-.8px;line-height:1.1}
  .kpi .l{font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.6px;margin-top:3px}
  .kpi.a .v{color:var(--acc)} .kpi.b .v{color:var(--bad)} .kpi.c .v{color:var(--ok)} .kpi.d .v{color:var(--warn)}
  .note{background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:12px 14px;font-size:12.5px;color:var(--ink2);margin:14px 0}
  .note b{color:var(--ink)}
  ul.tight{margin:6px 0 0;padding-left:18px}
  ul.tight li{margin:4px 0}
  .pnum{font-weight:800;color:var(--acc);font-size:15px;width:26px}
  td.test{color:var(--ink);font-size:12.6px}
  td.etat{color:var(--bad)}
  .t{font-weight:800;font-size:11px;letter-spacing:.5px;text-align:center}
  .tS{color:var(--ok)} .tM{color:var(--acc)} .tL{color:var(--warn)} .tXL{color:var(--bad)}
  .j{text-align:center;font-weight:800;color:var(--acc2);font-size:11.5px}
  .jalon{border:1px solid var(--line);border-radius:5px;padding:14px 16px;margin:12px 0;background:var(--paper)}
  .jhead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px}
  .jcode{background:var(--acc);color:#fff;font-weight:800;font-size:11px;letter-spacing:.6px;padding:2px 7px;border-radius:3px}
  .jt{font-weight:800;font-size:14.5px;color:var(--ink)}
  .js{color:var(--mut);font-size:12px}
  .jhead .t{margin-left:auto}
  .jalon ul{margin:6px 0 8px;padding-left:18px;font-size:12.6px;color:var(--ink2)}
  .jalon ul li{margin:3px 0}
  .crit{font-size:12.3px;background:#f3f8f3;border-left:3px solid var(--ok);padding:7px 10px;color:#22523a}
  .crit b{color:#17402c}
  .pg{width:96px;color:var(--mut);white-space:nowrap;font-variant-numeric:tabular-nums}
  .scale{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px}
  .card{border:1px solid var(--line);border-radius:5px;padding:14px 16px;background:var(--paper)}
  .card h4{margin:0 0 6px;font-size:12.5px;letter-spacing:.2px}
  .card.bad{border-color:#e7cdc9;background:#fdf8f7}
  .card.ok{border-color:#cfe3d5;background:#f7fbf8}
  .card p{margin:0;font-size:12.4px;color:var(--ink2)}
  footer{margin:44px 44px 0;padding-top:16px;border-top:1px solid var(--line);font-size:11.5px;color:var(--mut)}
  footer p{margin:5px 0}
  .tag{display:inline-block;font-size:10px;letter-spacing:.5px;text-transform:uppercase;border:1px solid var(--line);
       border-radius:3px;padding:1px 5px;color:var(--mut);margin-left:6px;vertical-align:1px}
  .tag.ok{color:var(--ok);border-color:#bfdcc9} .tag.bad{color:var(--bad);border-color:#e6c8c4}
  @media print{
    body{background:#fff}
    .page{box-shadow:none;max-width:none}
    header{padding-top:0}
    section{break-inside:auto}
    table{font-size:10.5px} .jalon{break-inside:avoid} tr{break-inside:avoid}
    h2{break-after:avoid}
  }
  @page{size:A4;margin:14mm 12mm}
</style>
</head>
<body>
<div class="page">

<header>
  <div class="kick">Audit fonctionnel · ALPHA Studio</div>
  <h1>Ce qui manque pour être un vrai DAW</h1>
  <p class="sub">État des lieux sans complaisance : ce qui fonctionne, ce qui n’existe simplement pas,
  et les six chantiers qui séparent la maquette d’un outil avec lequel on peut réellement travailler.</p>
  <div class="meta">
    <span><b>Date</b> · __DATE__</span>
    <span><b>Périmètre</b> · alpha-studio.html, 947 303 octets</span>
    <span><b>Méthode</b> · audit du code livré, pas d’estimation à vue</span>
  </div>
</header>

<main>

<section id="verdict">
  <h2><span class="n">01</span>Verdict en une phrase</h2>
  <div class="verdict">
    <p class="big">ALPHA Studio est aujourd’hui un <b>DAW complet côté interface</b> — et <b>pas encore un logiciel audio</b> :
    il n’existe aucune ligne de moteur sonore dans le code.</p>
    <p>Les 59 fenêtres, les 458 entrées de menu, la barre d’outils configurable, la liste de pistes, la règle,
    l’inspecteur et le transport sont réels et testés : on déplace, on redimensionne, on divise, on annule,
    on dessine une automatisation, on change les formats de règle. Mais rien ne produit, ne lit, n’enregistre
    ni ne sauvegarde de son. C’est la différence entre une planche de bord et une voiture : tout est à sa place,
    aucun moteur dessous.</p>
  </div>
  <div class="kpis">
    <div class="kpi a"><div class="v">59</div><div class="l">fenêtres d’interface</div></div>
    <div class="kpi b"><div class="v">0</div><div class="l">ligne de moteur audio</div></div>
    <div class="kpi d"><div class="v">≈ 26 %</div><div class="l">couverture d’un DAW</div></div>
    <div class="kpi c"><div class="v">6</div><div class="l">chantiers pour y arriver</div></div>
  </div>
</section>

<section id="methode">
  <h2><span class="n">02</span>Comment j’ai mesuré</h2>
  <p class="lead">Aucune note au feeling : chaque affirmation de ce document vient d’une lecture du fichier livré.</p>
  <div class="note">
    <b>Constats vérifiables dans <code>alpha-studio.html</code> :</b>
    <ul class="tight">
      <li><code>AudioContext</code>, <code>AudioWorklet</code>, <code>decodeAudioData</code>, <code>requestMIDIAccess</code>, <code>getUserMedia</code>, <code>OfflineAudioContext</code>, <code>FileReader</code> : <b>0 occurrence</b> dans le fichier livré — pas même sous forme de commentaire.</li>
      <li>Messages « étape 2 » : <b>133</b> occurrences, qui correspondent aux <b>85</b> commandes encore documentaires (une même commande peut répondre dans plusieurs menus).</li>
      <li>Code source : <b>15 667 lignes</b> — 4 141 (fenêtre Projet, édition, menus, raccourcis) + 8 296 (59 fenêtres) + 2 749 (styles) + 481 (structure).</li>
      <li>Stockage : <b>un seul</b> <code>localStorage</code> — la position des fenêtres des espaces de travail. Aucune sauvegarde de projet.</li>
      <li>Fichiers : <b>aucun</b> <code>FileReader</code>, aucun <code>Blob</code>, aucun téléchargement, aucun champ de fichier : ni import, ni export.</li>
      <li>458 entrées de menu : <b>409</b> commandes feuilles dont <b>85</b> restent des messages documentés (étape 2), le reste agit réellement.</li>
      <li>Événements : déplacement, redimensionnement (3 modes), division, copie/collage/coupe, suppression, duplication, nudge, fondus, volume d’événement, sélection rectangle et Maj+clic fonctionnent ; <b>Ctrl+Z annule</b> les dernières opérations. Le collage multi-pistes et l’édition en place restent à faire.</li>
      <li>Lecture : <b>Espace</b> démarre une horloge d’interface — le curseur avance, boucle, revient au départ — mais <b>aucun son</b> n’est produit.</li>
    </ul>
  </div>
</section>

<section id="couches">
  <h2><span class="n">03</span>Avancement par couche</h2>
  <p class="lead">Le pourcentage est une appréciation d’ingénierie, pas une mesure : il indique la part du travail
  réellement utilisable dans une chaîne de production. La colonne « manque » est la seule qui compte.</p>
  <table>
    <colgroup><col style="width:19%"><col style="width:13%"><col style="width:29%"><col style="width:39%"></colgroup>
    <thead><tr><th>Couche</th><th>Avancement</th><th>Ce qui existe</th><th>Ce qui manque</th></tr></thead>
    <tbody>
      __COUCHES__
    </tbody>
  </table>
  <div class="note"><b>Lecture :</b> tout ce qui est au-dessus de 50 % concerne l’écran. Tout ce qui est au-dessous de 10 %
  concerne le son, les fichiers et le temps — c’est-à-dire le métier d’un DAW.</div>
</section>

<section id="piliers">
  <h2><span class="n">04</span>Les huit piliers qui font qu’un DAW est un DAW</h2>
  <p class="lead">Huit gestes qu’un utilisateur fait dans les cinq premières minutes. Aujourd’hui, trois sur huit fonctionnent en partie (3, 5 et 7) et aucun ne produit de son.
  C’est le test le plus honnête : il ne parle pas de fonctionnalités, il parle d’usage.</p>
  <table>
    <colgroup><col style="width:4%"><col style="width:24%"><col style="width:24%"><col style="width:34%"><col style="width:7%"><col style="width:7%"></colgroup>
    <thead><tr><th></th><th>Le geste</th><th>Ce qui se passe aujourd’hui</th><th>Ce qu’il faut construire</th><th>Taille</th><th>Jalon</th></tr></thead>
    <tbody>
      __PILIERS__
    </tbody>
  </table>
  <div class="note"><b>Tailles :</b> S = une session · M = deux à trois · L = quatre à huit · XL = dix et plus.
  « Session » = un cycle de travail complet avec tests, pas une soirée de code.</div>
</section>

<section id="interface">
  <h2><span class="n">05</span>Ce qui manque aussi à l’interface</h2>
  <p class="lead">Les lots 3 à 8 ont comblé l’essentiel des manques du comparatif. Ce qui reste se répartit en deux familles :
  les fenêtres présentes mais inertes, et les fonctions qui exigent une horloge audio ou un accès système.
  Références de page : <i>Operation Manual</i>, Nuendo 4.</p>
  <table>
    <colgroup><col style="width:32%"><col style="width:10%"><col style="width:58%"></colgroup>
    <thead><tr><th>Fonction</th><th>Manuel</th><th>À quoi elle sert</th></tr></thead>
    <tbody>
      __INTERFACE__
    </tbody>
  </table>
</section>

<section id="echelle">
  <h2><span class="n">06</span>L’échelle du problème</h2>
  <p class="lead">Il faut le dire franchement, sinon la suite sera mal calibrée.</p>
  <div class="scale">
    <div class="card bad">
      <h4>Ce à quoi on se compare</h4>
      <p>Nuendo 4 : un manuel d’exploitation de plusieurs centaines de pages, des années-homme d’ingénierie,
      un moteur temps réel natif, un hôte de greffons, une pile de pilotes. ALPHA a aujourd’hui <b>l’interface d’un étage 2</b>
      et le <b>moteur d’un étage 0</b> : c’est exactement l’écart que ce document mesure.</p>
    </div>
    <div class="card ok">
      <h4>Ce qui est atteignable ici</h4>
      <p>Un DAW web crédible : 10 à 20 pistes, vraie lecture, vraie édition, vrai mixage, enregistrement,
      MIDI, export — soit l’équivalent d’un « DAW d’apprentissage » complet, pas d’un Nuendo.</p>
    </div>
  </div>
  <div class="note">
    <b>Ordres de grandeur :</b> un DAW minimal qui sonne ≈ 15 000 à 25 000 lignes de plus.
    Un DAW crédible avec édition, mixage et MIDI ≈ 60 000 à 100 000 lignes.
    Ce document découpe ces lignes en six jalons utilisables, chacun testable séparément.
  </div>
</section>

<section id="route">
  <h2><span class="n">07</span>La route, en six jalons</h2>
  <p class="lead">Chaque jalon se termine par un résultat qu’on peut essayer, pas par « du code en cours ».
  On valide, puis on enchaîne — c’est l’ordre que tu as imposé depuis le début.</p>
  __JALONS__
</section>

<section id="decisions">
  <h2><span class="n">08</span>Décisions techniques à trancher</h2>
  <table>
    <colgroup><col style="width:17%"><col style="width:51%"><col style="width:32%"></colgroup>
    <thead><tr><th>Sujet</th><th>Choix recommandé</th><th>Conséquence</th></tr></thead>
    <tbody>__DECISIONS__</tbody>
  </table>
</section>

<section id="nonfait">
  <h2><span class="n">09</span>Ce qu’ALPHA ne fera jamais</h2>
  <p class="lead">Mieux vaut le dire maintenant que le laisser croire : une partie de ce qui définit un DAW natif
  est hors de portée d’un navigateur, par construction.</p>
  <table>
    <colgroup><col style="width:30%"><col style="width:70%"></colgroup>
    <thead><tr><th>Impossible</th><th>Pourquoi</th></tr></thead>
    <tbody>__NONFAIT__</tbody>
  </table>
  <div class="note">Ce n’est pas une faiblesse du prototype, c’est une limite de la plateforme.
  Un DAW web se compare à GarageBand ou à Soundtrap, pas à Nuendo — et c’est très bien comme ça.</div>
</section>

<section id="suite">
  <h2><span class="n">10</span>Ce que je propose de faire maintenant</h2>
  <p>Le jalon <b>J1</b> est celui qui change tout : c’est le moment où l’interface cesse de mentir.
  Il tient en une idée — <b>brancher un moteur audio sur ce qui est déjà dessiné</b> :</p>
  <ul class="tight">
    <li>Un <code>AudioContext</code> créé au premier clic, un worklet de mixage, un ordonnanceur à anticipation.</li>
    <li>Les 12 pistes du projet deviennent des sources réelles (synthèse : oscillateurs, bruit filtré, enveloppes).</li>
    <li>Le transport, la boucle, le métronome et le curseur obéissent à l’horloge audio.</li>
    <li>Les faders et les VU-mètres de la console existante sont branchés sur de vrais nœuds de gain.</li>
  </ul>
  <p>À la fin, on appuie sur Espace et <i>ça sonne</i>. Tout le reste — édition, enregistrement, MIDI, export —
  s’appuie ensuite sur cette fondation.</p>
  <p class="note" style="margin-top:14px"><b>Pourquoi J1 et pas autre chose :</b> l’édition (J2) est déjà largement faite —
  déplacer, couper, coller, annuler, dessiner une automatisation fonctionnent, et l’on peut les essayer dès maintenant.
  Les autres jalons (enregistrement, mixage, MIDI, export) n’ont en revanche aucun sens sans un moteur qui sonne.
  <b>J1 est donc le seul chemin qui débloque le reste.</b></p>
</section>

</main>

<footer>
  <p><b>ALPHA Studio — audit du __DATE__.</b> Document produit à partir du code livré : <code>alpha-studio.html</code>
  (≈ 925 Kio, 59 fenêtres, 15 667 lignes source). Les pages du manuel renvoient à l’<i>Operation Manual</i> de Nuendo 4,
  document officiel Steinberg (© Steinberg Media Technologies GmbH).</p>
  <p>Projet pédagogique indépendant, non affilié à Steinberg. Les limitations citées (ASIO, VST3, latence, threads)
  sont des contraintes de la plateforme Web, pas des choix de conception réversibles.</p>
</footer>

</div>
</body>
</html>
"""

html = (HTML
        .replace("__DATE__", DATE)
        .replace("__COUCHES__", couche_rows())
        .replace("__PILIERS__", pilier_rows())
        .replace("__INTERFACE__", interface_rows())
        .replace("__JALONS__", jalon_blocks())
        .replace("__DECISIONS__", decision_rows())
        .replace("__NONFAIT__", nonfait_rows()))

out = Path(__file__).resolve().parent / "docs" / "ce-qui-manque-daw-complet.html"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding="utf-8")
print("OK ->", out, len(html), "caractères")
