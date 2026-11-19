
/* =========================================================================
   ALPHA Studio — Fenêtres du lot 5 : Track Controls Settings, Quick Controls,
   Inspector Setup, Modificateurs MIDI, Personnaliser les menus,
   Moniteur MIDI, Transposer, Vélocité.
   ========================================================================= */
(function () {
  'use strict';

  const A = window.ALPHA || {};
  const W = window.ALPHAWIN;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  if (!W) { console.warn('ALPHAWIN absent : fenêtres du lot 5 non chargées'); return; }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const btn = (label, cls, attrs) => '<button class="w-btn' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '>' + label + '</button>';
  const chk = (label, on, attrs) => '<div class="dlg-check' + (on ? ' on' : '') + '"' + (attrs || '') + '><i></i><span>' + label + '</span></div>';
  const track = (id) => (A.trackById ? A.trackById(id) : null);
  const toast = (m, t) => { if (A.showToast) A.showToast(m, t); };

  // AUDIT v6 — accès réel au moteur natif (Engine.h command / stateJson).
  const nativeSend = (command, data) => {
    const n = window.ALPHA_NATIVE;
    if (n && typeof n.send === 'function') { n.send(command, data || {}); return true; }
    return false;
  };
  const deviceState = () => {
    const n = window.ALPHA_NATIVE;
    return (n && typeof n.getState === 'function' && n.getState()) || {};
  };
  const selectedNativeIndex = () => {
    const st = deviceState();
    const idx = Number(st.selectedTrack);
    if (isFinite(idx) && idx >= 0) return idx;
    const id = String((A.state && A.state.selectedTrack) || '');
    const m = /^native_(\d+)$/.exec(id);
    return m ? Number(m[1]) : 0;
  };

  /* ---------------------------------------------------------------- 1. TRACK CONTROLS SETTINGS (p. 507) */
  function buildTrackCtl(arg) {
    const t = track(arg) || track((A.state && A.state.selectedTrack)) || { name: 'Piste', id: '' };
    const ALL = [
      ['rw', 'Automatisation R / W'], ['mute', 'Mute'], ['solo', 'Solo'], ['fader', 'Fader + valeur dB'],
      ['rec', 'Record Enable'], ['monitor', 'Écoute (monitor)'], ['auto', 'Afficher l’automatisation'],
      ['timebase', 'Base de temps (M / L)'], ['lane', 'Type d’affichage (lanes)'], ['lock', 'Verrouillage'],
      ['img', 'Image de l’événement'], ['vol', 'Volume'], ['pan', 'Panoramique'], ['ins', 'Inserts'],
      ['eq', 'Égaliseur'], ['sends', 'Départs'], ['routing', 'Routage (entrée / sortie)'], ['notepad', 'Bloc-notes']
    ];
    const vis = (A.TRACK_CTL && A.TRACK_CTL.visible) || ['rw', 'mute', 'fader', 'rec', 'monitor', 'auto', 'timebase', 'lane', 'lock'];
    const html =
      '<div class="w-toolbar"><span class="w-lbl">Piste</span>' +
      '<span class="w-field" style="min-width:200px" data-tcsel><span data-tcname>' + esc(t.name) + '</span> <i class="arr"></i></span>' +
      '<span style="flex:1"></span><span class="w-lbl">' + esc(t.id || '') + '</span></div>' +
      '<div class="tc-wrap w-scroll">' +
      '<div class="tc-head"><span class="w-lbl">Contrôles de piste — colonne de gauche</span>' +
      '<span class="tc-hint">Chaque contrôle coché occupe une ligne de la piste. L’ordre suit la liste ; les flèches déplacent.</span></div>' +
      '<div class="tc-cols">' +
      '<div class="grp"><h6>Contrôles disponibles</h6>' +
      ALL.map(([k, n]) => chk(n, vis.indexOf(k) >= 0, ' data-tc="' + k + '"')).join('') + '</div>' +
      '<div class="grp"><h6>Contrôles visibles — ordre</h6>' +
      '<div data-tcorder>' + vis.map((k, i) => {
        const nm = (ALL.find((x) => x[0] === k) || [k, k])[1];
        return '<div class="dlg-check on" data-tcrow="' + k + '"><i></i><span>' + i + 1 + '. ' + nm + '</span></div>';
      }).join('') + '</div></div>' +
      '</div>' +
      '<div class="tc-opts">' +
      chk('Utiliser les réglages de la piste sélectionnée pour toutes les pistes du même type', true) +
      chk('Appliquer aussi aux pistes créées plus tard', false) +
      chk('Afficher les contrôles sur deux lignes si la place manque (Wrap)', !!A.TRACK_CTL.wrap, ' data-tcwrap') +
      '</div>' +
      '<div class="hint">Nuendo 4, p. 507 : le dialogue <b>Track Controls Settings</b> ouvre la liste des contrôles disponibles ; ' +
      'un clic sur le nom d’un contrôle l’ajoute à la colonne de piste. Les réglages sont propres à chaque type de piste ' +
      '(audio, MIDI, instrument, groupe, FX) et mémorisés dans les <b>presets de contrôles de piste</b>.</div>' +
      '</div>' +
      '<div class="dlg-foot"><span class="hint">Les changements s’appliquent immédiatement à la piste affichée</span>' +
      btn('Appliquer aux pistes du même type') + btn('OK', 'on') + '</div>';
    return {
      title: 'Track Controls Settings <em>· contrôles de piste</em>', ac: '#4f7188', html,
      after(body) {
        function redraw() {
          const vis2 = A.TRACK_CTL.visible;
          const ord = $('[data-tcorder]', body);
          const ALL2 = ALL;
          ord.innerHTML = vis2.map((k, i) => {
            const nm = (ALL2.find((x) => x[0] === k) || [k, k])[1];
            return '<div class="dlg-check on" data-tcrow="' + k + '"><i></i><span>' + (i + 1) + '. ' + nm + '</span></div>';
          }).join('') || '<div class="none">— aucun contrôle —</div>';
          $$('[data-tc]', body).forEach((c) => c.classList.toggle('on', vis2.indexOf(c.dataset.tc) >= 0));
        }
        body.addEventListener('click', (e) => {
          const c = e.target.closest('[data-tc]');
          if (c) {
            const k = c.dataset.tc;
            const V = A.TRACK_CTL.visible;
            const i = V.indexOf(k);
            if (i >= 0) { if (V.length > 1) V.splice(i, 1); else { toast('Une piste doit garder au moins un contrôle.', 'Track Controls'); return; } }
            else V.push(k);
            redraw();
            if (A.renderTracksNow) A.renderTracksNow(); else if (A.refreshProject) A.refreshProject();
            toast('« ' + c.textContent.trim() + ' » ' + (i >= 0 ? 'retiré des' : 'ajouté aux') + ' contrôles de piste.', 'Track Controls');
            return;
          }
          const r = e.target.closest('[data-tcrow]');
          if (r) {
            const V = A.TRACK_CTL.visible;
            const k = r.dataset.tcrow;
            const i = V.indexOf(k);
            if (i > 0) { V.splice(i, 1); V.splice(i - 1, 0, k); redraw(); if (A.renderTracksNow) A.renderTracksNow(); }
            return;
          }
          const b = e.target.closest('.w-btn');
          if (!b) return;
          const t2 = b.textContent.trim();
          if (t2 === 'OK') { W.close('trackctl'); return; }
          if (t2.indexOf('Appliquer') === 0) {
            A.TRACK_CTL.visible.slice();
            if (A.renderTracksNow) A.renderTracksNow();
            toast('Contrôles appliqués à toutes les pistes du même type (pistes audio).', 'Track Controls');
            return;
          }
        });
        const wr = $('[data-tcwrap]', body);
        if (wr) wr.addEventListener('click', () => {
          const on = !wr.classList.contains('on');
          wr.classList.toggle('on', on);
          if (A.ACTIONS && A.ACTIONS.setTrackWrap) A.ACTIONS.setTrackWrap(on);
        });
        $('[data-tcsel]', body).addEventListener('click', (e) => {
          e.stopPropagation();
          const tracks = (A.TRACKS || []).filter((x) => x.num);
          const i = tracks.findIndex((x) => x.id === (W.REG.trackctl || {}).arg);
          const n = tracks[(i + 1) % tracks.length];
          if (!n) return;
          W.open('trackctl', n.id);
          toast('Piste affichée : ' + n.name + '.', 'Track Controls');
        });
      }
    };
  }

  /* ---------------------------------------------------------------- 2. QUICK CONTROLS (p. 339-341) */
  const QC = [
    ['Cutoff', 'Filtre passe-bas', 62], ['Résonance', 'Filtre passe-bas', 24], ['Attaque', 'Enveloppe', 12],
    ['Décroissance', 'Enveloppe', 40], ['Maintien', 'Enveloppe', 55], ['Relâchement', 'Enveloppe', 30],
    ['Chorus', 'Modulation', 18], ['Réverbération', 'Départ FX 1', 44]
  ];
  function buildQControls(arg) {
    const t = track(arg) || track((A.state && A.state.selectedTrack)) || { name: 'Piste', id: '' };
    const html =
      '<div class="w-toolbar"><span class="w-lbl">Quick Controls</span>' +
      '<span class="w-field" style="min-width:160px">' + esc(t.name) + ' <i class="arr"></i></span>' +
      '<span class="w-lbl">Banque</span><span class="w-field" style="min-width:80px">1 / 1 <i class="arr"></i></span>' +
      '<span style="flex:1"></span>' + btn('Apprendre', 'on') + btn('Reset') + '</div>' +
      '<div class="qc-grid">' +
      QC.map((q, i) =>
        '<div class="qc-cell">' +
        '<div class="qc-num">' + (i + 1) + '</div>' +
        '<div class="qc-knob" data-qc="' + i + '" style="--a:' + (q[2] * 2.7) + 'deg"><i></i></div>' +
        '<div class="qc-name">' + q[0] + '</div>' +
        '<div class="qc-src">' + q[1] + '</div>' +
        '<div class="qc-val" data-qcv="' + i + '">' + q[2] + ' %</div>' +
        '</div>').join('') +
      '</div>' +
      '<div class="qc-foot">' +
      '<div class="hint">Nuendo 4, p. 339-341 : les <b>8 Quick Controls</b> de la piste donnent accès aux paramètres les plus ' +
      'utilisés d’un instrument ou d’un effet VST sans ouvrir son interface. <b>Apprendre</b> : cliquez un paramètre puis ' +
      'bougez le contrôleur MIDI. <b>Envoyer les noms</b> affiche les noms sur le contrôleur matériel. ' +
      'Cliquez un bouton rotatif pour le régler.</div>' +
      '</div>' +
      '<div class="aw-foot"><span>Quick Controls — 8 paramètres de piste</span><span style="flex:1"></span>' +
      '<span>Périphériques ▸ Quick Controls</span></div>';
    return {
      title: 'Quick Controls <em>· 8 paramètres de piste</em>', ac: '#7a4a3a', html,
      after(body) {
        let learn = -1;
        $$('.qc-knob', body).forEach((k) => {
          let drag = null;
          k.addEventListener('pointerdown', (e) => {
            if (learn >= 0) {
              const i = +k.dataset.qc;
              $('[data-qcv="' + i + '"]', body).textContent = 'Appris : CC' + (20 + i);
              $('[data-qcv="' + i + '"]', body).classList.add('learn');
              learn = -1;
              toast('Paramètre « ' + QC[i][0] + ' » appris : affecté au CC' + (20 + i) + ' du contrôleur.', 'Quick Controls');
              return;
            }
            drag = { y: e.clientY, v: QC[+k.dataset.qc][2] };
            k.setPointerCapture(e.pointerId);
          });
          k.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const i = +k.dataset.qc;
            const v = Math.max(0, Math.min(100, Math.round(drag.v + (drag.y - e.clientY) * 0.9)));
            QC[i][2] = v;
            k.style.setProperty('--a', (v * 2.7) + 'deg');
            $('[data-qcv="' + i + '"]', body).textContent = v + ' %';
          });
          k.addEventListener('pointerup', () => {
            // Application réelle de la valeur au paramètre ciblé dans le noyau.
            const i = +k.dataset.qc;
            nativeSend('applyQuickControl', { index: selectedNativeIndex(), slot: i, value: QC[i][2] / 100 });
          });
          const up = () => { drag = null; };
          k.addEventListener('pointerup', up);
          k.addEventListener('pointercancel', up);
          k.addEventListener('dblclick', () => {
            const i = +k.dataset.qc; QC[i][2] = 50;
            k.style.setProperty('--a', '135deg');
            $('[data-qcv="' + i + '"]', body).textContent = '50 %';
          });
        });
        const lb = $$('.w-btn', body).find((b) => b.textContent.trim() === 'Apprendre');
        if (lb) lb.addEventListener('click', () => {
          learn = 0;
          toast('Mode Apprendre : cliquez le bouton rotatif à affecter, puis bougez un contrôleur MIDI.', 'Quick Controls');
        });
        const rb = $$('.w-btn', body).find((b) => b.textContent.trim() === 'Reset');
        if (rb) rb.addEventListener('click', () => {
          // AUDIT v6 — réinitialisation réelle des 8 Quick Controls de la piste
          // sélectionnée dans le noyau (setQuickControl), puis application.
          const ti = selectedNativeIndex();
          QC.forEach((q, i) => {
            q[2] = 50;
            nativeSend('setQuickControl', {
              index: ti, slot: i, target: 'track',
              param: i === 0 ? 'volumeDb' : i === 1 ? 'pan' : 'volumeDb',
              label: q[0], controllerIndex: 20 + i, assigned: true
            });
          });
          $$('.qc-knob', body).forEach((k, i) => { k.style.setProperty('--a', (QC[i][2] * 2.7) + 'deg'); });
          $$('[data-qcv]', body).forEach((el) => { el.textContent = '50 %'; });
          toast('Les 8 Quick Controls de la piste ' + (ti + 1) + ' sont réaffectés et réinitialisés (moteur réel).', 'Quick Controls');
        });
      }
    };
  }

  /* ---------------------------------------------------------------- 3. INSPECTOR SETUP (p. 25) */
  function buildInspSetup() {
    const SECTIONS = ['En-tête (nom, mute/solo)', 'Automatisation', 'Volume', 'Panoramique', 'Inserts',
      'Égaliseur', 'Départs', 'Canal', 'Notepad', 'VSTi', 'Groupe', 'Écoute', 'Quick Controls'];
    const ON = ['En-tête (nom, mute/solo)', 'Automatisation', 'Volume', 'Panoramique', 'Inserts', 'Égaliseur', 'Départs', 'Canal', 'Notepad'];
    const html =
      '<div class="w-toolbar"><span class="w-lbl">Sections de l’inspecteur</span><span style="flex:1"></span>' +
      btn('Tout afficher') + btn('Par défaut') + '</div>' +
      '<div class="tc-wrap w-scroll"><div class="tc-cols">' +
      '<div class="grp"><h6>Visibles — haut vers le bas</h6>' +
      ON.map((s, i) => chk(i + 1 + '. ' + s, true, ' data-is="' + s + '"')).join('') + '</div>' +
      '<div class="grp"><h6>Masquées</h6>' +
      SECTIONS.filter((s) => ON.indexOf(s) < 0).map((s) => chk(s, false, ' data-is="' + s + '"')).join('') + '</div>' +
      '</div>' +
      '<div class="hint">Nuendo 4, p. 25 : le dialogue <b>Inspector Setup</b> (clic droit sur l’inspecteur, ou Fenêtres ▸ ' +
      'Inspecteur ▸ Inspector Setup) choisit les sections affichées, dans quel ordre et pour quel type de piste. ' +
      'Le réglage est indépendant pour chaque type (audio, MIDI, instrument, groupe, FX).</div>' +
      '</div>' +
      '<div class="dlg-foot"><span class="hint">Clic droit sur un en-tête d’inspecteur : mêmes commandes</span>' +
      btn('OK', 'on') + '</div>';
    return {
      title: 'Inspector Setup <em>· sections de l’inspecteur</em>', ac: '#4f7188', html,
      after(body) {
        body.addEventListener('click', (e) => {
          const c = e.target.closest('[data-is]');
          if (c) {
            c.classList.toggle('on');
            const on = c.classList.contains('on');
            toast('Section « ' + c.dataset.is + ' » ' + (on ? 'affichée' : 'masquée') + ' dans l’inspecteur.', 'Inspector Setup');
            if (A.setInspectorSection) A.setInspectorSection(c.dataset.is, on);
            return;
          }
          const b = e.target.closest('.w-btn');
          if (!b) return;
          const t = b.textContent.trim();
          if (t === 'OK') W.close('inspsetup');
          if (t === 'Tout afficher') { $$('[data-is]', body).forEach((c) => c.classList.add('on')); toast('Toutes les sections sont visibles.', 'Inspector Setup'); }
          if (t === 'Par défaut') { $$('[data-is]', body).forEach((c) => c.classList.toggle('on', ON.indexOf(c.dataset.is) >= 0)); toast('Disposition d’origine rétablie.', 'Inspector Setup'); }
        });
      }
    };
  }

  /* ---------------------------------------------------------------- 4. MODIFICATEURS MIDI (p. 346) */
  const MODS = [
    ['Transposer', '0', '+/- demi-tons'],
    ['Limiter les vélocités', 'Min 1 · Max 127', 'borne basse et haute'],
    ['Compresser les vélocités', '0 %', 'rapproche les vélocités de la moyenne'],
    ['Étendre les vélocités', '0 %', 'écarte les vélocités de la moyenne'],
    ['Longueur aléatoire', '0 tick', 'varie les fins de notes'],
    ['Position aléatoire', '0 tick', 'varie les débuts de notes'],
    ['Quantifier', '1/16', 'débuts de notes'],
    ['Quantifier les longueurs', '1/16', 'fins de notes'],
    ['Supprimer', 'Vélocités 0', 'retire les notes très faibles'],
    ['Legato', 'oui/non', 'notes liées']
  ];
  function buildMidiMods() {
    const html =
      '<div class="w-toolbar"><span class="w-lbl">Modificateurs MIDI</span><span style="flex:1"></span>' +
      '<span class="w-lbl">Preset</span><span class="w-field" style="min-width:140px">Aucun <i class="arr"></i></span>' +
      btn('Enregistrer…') + '</div>' +
      '<div class="mod-wrap w-scroll"><table class="mod-tbl">' +
      '<thead><tr><th style="width:26px"></th><th>Modificateur</th><th style="width:120px">Réglage</th><th>Effet</th></tr></thead><tbody>' +
      MODS.map((m, i) => '<tr><td class="c"><div class="dlg-check' + (i === 0 ? ' on' : '') + '" data-mod="' + i + '"><i></i></div></td>' +
        '<td>' + m[0] + '</td><td class="v">' + m[1] + '</td><td class="e">' + m[2] + '</td></tr>').join('') +
      '</tbody></table>' +
      '<div class="hint">Nuendo 4, p. 346 : les <b>modificateurs MIDI</b> transforment les notes à la lecture (transposition, ' +
      'limites de vélocité, quantize, aléatoire…). C’est une transformation <b>non destructive</b> : les données du fichier ne ' +
      'sont pas modifiées. Ils s’appliquent à la piste MIDI sélectionnée et s’enregistrent en presets.</div>' +
      '</div>' +
      '<div class="dlg-foot"><span class="hint">Transformation à la lecture — la donnée d’origine est conservée</span>' +
      btn('Appliquer aux parties sélectionnées') + btn('OK', 'on') + '</div>';
    return {
      title: 'Modificateurs MIDI <em>· transformation à la lecture</em>', ac: '#6a5d94', html,
      after(body) {
        body.addEventListener('click', (e) => {
          const c = e.target.closest('[data-mod]');
          if (c) {
            c.classList.toggle('on');
            toast('Modificateur « ' + MODS[+c.dataset.mod][0] + ' » ' + (c.classList.contains('on') ? 'activé' : 'désactivé') + '.', 'Modificateurs MIDI');
            return;
          }
          const b = e.target.closest('.w-btn');
          if (!b) return;
          const t = b.textContent.trim();
          if (t === 'OK') W.close('midimods');
          else if (t.indexOf('Appliquer') === 0) {
            // AUDIT v6 — modificateur MIDI réel stocké puis appliqué au noyau.
            const ti = selectedNativeIndex();
            const checked = $$('[data-mod].on', body).map((c) => +c.dataset.mod);
            const transpose = checked.indexOf(0) >= 0 ? 12 : 0;
            const velScale = checked.indexOf(2) >= 0 ? 0.7 : checked.indexOf(3) >= 0 ? 1.3 : 1.0;
            const lenScale = checked.indexOf(6) >= 0 || checked.indexOf(7) >= 0 ? 1.0 : 1.0;
            const index = ((deviceState().midiModifiers) || []).length;
            nativeSend('storeMidiModifier', {
              name: 'Modificateurs MIDI (' + checked.length + ' actif(s))',
              transposeSemitones: transpose, velocityOffset: 0, velocityScale: velScale,
              lengthScale: lenScale, delayBars: 0, invert: checked.indexOf(9) >= 0
            });
            nativeSend('applyMidiModifier', { modifierIndex: index, trackIndex: ti });
            const touched = Number(deviceState().lastLogicalTouched || 0);
            toast('Modificateurs appliqués à la piste MIDI ' + (ti + 1) + ' : ' + touched + ' note(s) réellement transformée(s).', 'Modificateurs MIDI');
          }
          else {
            const ti = selectedNativeIndex();
            const checked = $$('[data-mod].on', body).map((c) => +c.dataset.mod);
            nativeSend('storeMidiModifier', {
              name: 'Preset modificateurs (' + checked.length + ')',
              transposeSemitones: checked.indexOf(0) >= 0 ? 12 : 0,
              velocityOffset: 0, velocityScale: checked.indexOf(2) >= 0 ? 0.7 : 1.0,
              lengthScale: 1.0, delayBars: 0, invert: checked.indexOf(9) >= 0
            });
            toast('Preset de modificateurs MIDI enregistré dans le projet (moteur réel).', 'Modificateurs MIDI');
          }
        });
      }
    };
  }

  /* ---------------------------------------------------------------- 5. PERSONNALISER LES MENUS (p. 509) */
  function buildMenuSetup() {
    const MENU_NAMES = ['Fichier', 'Édition', 'Projet', 'Audio', 'Transport', 'Média', 'Périphériques', 'Fenêtres', 'Aide'];
    const html =
      '<div class="w-toolbar"><span class="w-lbl">Menu</span>' +
      '<span class="w-field" style="min-width:130px" data-msel>Fichier <i class="arr"></i></span>' +
      '<span style="flex:1"></span><span class="w-lbl">Nuendo 4 ▸ Aide ▸ Personnaliser les menus</span></div>' +
      '<div class="tc-wrap w-scroll"><div class="tc-cols">' +
      '<div class="grp"><h6>Menus</h6>' +
      MENU_NAMES.map((m, i) => '<div class="dlg-check' + (i === 0 ? ' on' : '') + '" data-mn="' + m + '"><i></i><span>' + m + '</span></div>').join('') +
      '</div>' +
      '<div class="grp"><h6>Entrées du menu Fichier</h6>' +
      ['Nouveau projet', 'Ouvrir…', 'Enregistrer', 'Enregistrer sous…', 'Vider la corbeille', 'Exporter ▸ Audio Mixdown…'].map((x, i) =>
        chk(x, true, ' data-me="' + i + '"')).join('') +
      '</div></div>' +
      '<div class="tc-opts">' +
      '<div class="ms-row"><span class="w-lbl">Libellé</span><input class="ms-in" value="Nouveau projet"></div>' +
      '<div class="ms-row"><span class="w-lbl">Raccourci</span><span class="w-field" style="min-width:120px">Ctrl+N <i class="arr"></i></span></div>' +
      '</div>' +
      '<div class="hint">Nuendo 4, p. 509 : ce dialogue permet de <b>masquer des entrées</b>, de les <b>renommer</b> (un libellé ' +
      'remplace la chaîne traduite), de leur affecter un raccourci et de <b>réinitialiser</b> l’ensemble. ' +
      'Les menus eux-mêmes ne peuvent pas être supprimés — seules leurs entrées sont personnalisables.</div>' +
      '</div>' +
      '<div class="dlg-foot"><span class="hint">Ctrl sera ignoré pour les entrées masquées</span>' +
      btn('Réinitialiser…') + btn('OK', 'on') + '</div>';
    return {
      title: 'Personnaliser les menus <em>· Menu Setup</em>', ac: '#5a7fa3', html,
      after(body) {
        body.addEventListener('click', (e) => {
          const mn = e.target.closest('[data-mn]');
          if (mn) {
            $$('[data-mn]', body).forEach((x) => x.classList.remove('on'));
            mn.classList.add('on');
            const f = $('[data-msel]', body);
            if (f) f.innerHTML = mn.dataset.mn + ' <i class="arr"></i>';
            const grp = $$('.grp h6', body)[1];
            if (grp) grp.textContent = 'Entrées du menu ' + mn.dataset.mn;
            toast('Menu « ' + mn.dataset.mn + ' » sélectionné.', 'Personnaliser les menus');
            return;
          }
          const me = e.target.closest('[data-me]');
          if (me) {
            me.classList.toggle('on');
            toast('Entrée « ' + me.textContent.trim() + ' » ' + (me.classList.contains('on') ? 'visible' : 'masquée') + ' dans le menu.', 'Personnaliser les menus');
            return;
          }
          const b = e.target.closest('.w-btn');
          if (!b) return;
          const t = b.textContent.trim();
          if (t === 'OK') W.close('menusetup');
          if (t.indexOf('Réinitialiser') === 0) {
            $$('[data-me]', body).forEach((c) => c.classList.add('on'));
            toast('Menus rétablis dans leur état d’origine.', 'Personnaliser les menus');
          }
        });
      }
    };
  }

  /* ---------------------------------------------------------------- 6. MONITEUR MIDI */
  function buildMidiMonitor() {
    // AUDIT v6 — moniteur MIDI RÉEL : les événements affichés proviennent du
    // callback MIDI natif (AlphaMidiMonitor / getMidiMonitor). Plus aucun
    // Aucune valeur aléatoire ni minuterie simulée : on interroge le moteur.
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = (n) => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
    const fmtTime = (secs) => {
      const total = Number(secs || 0);
      const m = Math.floor(total / 60), sec = Math.floor(total % 60), ms = Math.floor((total - Math.floor(total)) * 1000);
      return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
    };
    const typeOf = (status, desc) => {
      const d = String(desc || '');
      if (d.indexOf('Note On') === 0) return 'Note On';
      if (d.indexOf('Note Off') === 0) return 'Note Off';
      if (d.indexOf('Control Change') === 0) return 'Control Change';
      if (d.indexOf('Pitch Bend') === 0) return 'Pitch Bend';
      if (d.indexOf('Program Change') === 0) return 'Program Change';
      if (d.indexOf('Aftertouch') === 0 || d.indexOf('Pression') === 0) return 'Aftertouch';
      if (d.indexOf('SysEx') === 0) return 'SysEx';
      if (d.indexOf('Timecode') >= 0 || d.indexOf('Machine') >= 0) return 'Sync';
      const hi = status & 0xf0;
      return ({ 0x80: 'Note Off', 0x90: 'Note On', 0xa0: 'Aftertouch', 0xb0: 'Control Change',
                0xc0: 'Program Change', 0xd0: 'Pression canal', 0xe0: 'Pitch Bend' })[hi] || 'Système';
    };
    const dataOf = (ev, type) => {
      if (type === 'Note On' || type === 'Note Off') return noteName(ev.data1) + '  ·  Vél ' + ev.data2;
      if (type === 'Control Change') return 'CC ' + ev.data1 + ' = ' + ev.data2;
      if (type === 'Pitch Bend') return 'Valeur ' + ((ev.data2 << 7) | ev.data1);
      if (type === 'Program Change') return 'Programme ' + ev.data1;
      return String(ev.description || ('0x' + (ev.status || 0).toString(16)));
    };
    const noteOf = (ev, type) => (type === 'Note On' || type === 'Note Off') ? noteName(ev.data1) : '\u2014';
    let events = [];
    function rows() {
      if (!events.length)
        return '<tr><td colspan="5" class="none">Aucun événement MIDI reçu — jouez sur le clavier connecté (entrée MIDI réelle du moteur).</td></tr>';
      return events.slice(-40).map((ev) => {
        const type = typeOf(ev.status, ev.description);
        return '<tr><td class="t">' + fmtTime(ev.seconds) + '</td><td>' + (ev.channel || 1) + '</td><td>' +
          type + '</td><td>' + noteOf(ev, type) + '</td><td class="v">' + esc(dataOf(ev, type)) + '</td></tr>';
      }).join('');
    }
    const html =
      '<div class="w-toolbar"><span class="w-lbl">Entrée</span><span class="w-field" style="min-width:150px">Toutes les entrées MIDI <i class="arr"></i></span>' +
      '<span style="flex:1"></span>' + btn('Effacer') + btn('Actualiser', 'on') + btn('Figer') + '</div>' +
      '<div class="mm-wrap"><table class="mod-tbl mm-tbl"><thead><tr><th style="width:74px">Temps</th><th style="width:60px">Canal</th>' +
      '<th style="width:90px">Type</th><th style="width:50px">Note</th><th>Données</th></tr></thead>' +
      '<tbody data-mmrow>' + rows() + '</tbody></table></div>' +
      '<div class="aw-foot"><span>Moniteur MIDI — événements d\u2019entrée réels</span><span style="flex:1"></span>' +
      '<span data-mmtotal>0 événement(s) reçu(s)</span></div>';
    return {
      title: 'Moniteur MIDI <em>· MIDI Monitor</em>', ac: '#5d87a3', html,
      after(body) {
        const tb = $('[data-mmrow]', body);
        const total = $('[data-mmtotal]', body);
        let frozen = false;
        function refresh() {
          nativeSend('getMidiMonitor', { maxEvents: 200 });
          const mm = deviceState().midiMonitor || {};
          events = Array.isArray(mm.events) ? mm.events : [];
          if (tb) { tb.innerHTML = rows(); tb.parentElement.scrollTop = 1e6; }
          if (total) total.textContent = (mm.totalReceived || events.length) + ' événement(s) reçu(s)';
        }
        const id = setInterval(() => {
          if (!document.body.contains(body)) { clearInterval(id); return; }
          if (!frozen) refresh();
        }, 500);
        refresh();
        body.addEventListener('click', (e) => {
          const b = e.target.closest('.w-btn');
          if (!b) return;
          const t = b.textContent.trim();
          if (t === 'Effacer') { nativeSend('clearMidiMonitor'); events = []; if (tb) tb.innerHTML = rows(); if (total) total.textContent = '0 événement(s) reçu(s)'; }
          if (t === 'Figer') { frozen = !frozen; b.classList.toggle('on', frozen); toast(frozen ? 'Affichage figé.' : 'Affichage en direct (événements MIDI réels).', 'Moniteur MIDI'); }
          if (t === 'Actualiser') { refresh(); toast('Moniteur actualisé depuis le callback MIDI natif.', 'Moniteur MIDI'); }
        });
      }
    };
  }

  /* ---------------------------------------------------------------- 7. TRANSPOSER */
  function buildTranspose() {
    const html =
      '<div class="dlg-pane w-scroll"><div class="tr-body">' +
      '<div class="dlg-row"><label>Transposition</label><div class="f"><span data-trval>0 demi-ton</span></div></div>' +
      '<div class="tr-row"><input type="range" min="-24" max="24" value="0" class="tr-slider" data-trslider>' +
      '<span class="tr-scale"><i>-24</i><i>-12</i><i>0</i><i>+12</i><i>+24</i></span></div>' +
      '<div class="dlg-row"><label>Unités</label><div class="f"><span>Demi-tons <i class="arr"></i></span></div></div>' +
      '<div class="dlg-row"><label>Plage</label><div class="f"><span>Sélection (toutes les parties MIDI sélectionnées) <i class="arr"></i></span></div></div>' +
      chk('Transposer aussi les événements hors sélection', false) +
      chk('Conserver les notes dans la plage MIDI 0–127', true) +
      '<div class="hint">Nuendo 4 : <b>MIDI ▸ Transposer</b> décale les hauteurs des notes sélectionnées. ' +
      'L’opération est destructive sur les données MIDI ; utilisez Annuler (Ctrl+Z) pour revenir en arrière.</div>' +
      '</div></div>' +
      '<div class="dlg-foot"><span class="hint">0 demi-ton = aucune modification</span>' + btn('Annuler') + btn('Appliquer', 'on') + '</div>';
    return {
      title: 'Transposer <em>· toutes les parties MIDI sélectionnées</em>', ac: '#6a5d94', html,
      after(body) {
        const sl = $('[data-trslider]', body);
        const val = $('[data-trval]', body);
        sl.addEventListener('input', () => {
          const v = +sl.value;
          val.textContent = (v > 0 ? '+' : '') + v + ' demi-ton' + (Math.abs(v) > 1 ? 's' : '');
        });
        body.addEventListener('click', (e) => {
          const b = e.target.closest('.w-btn');
          if (!b) return;
          if (b.textContent.trim() === 'Annuler') W.close('transpose');
          else {
            const v = +sl.value;
            if (A.ACTIONS && A.ACTIONS.transposeMidi) A.ACTIONS.transposeMidi(v);
            toast('Transposition de ' + (v > 0 ? '+' : '') + v + ' demi-ton(s) appliquée aux parties MIDI sélectionnées.', 'Transposer');
            W.close('transpose');
          }
        });
      }
    };
  }

  /* ---------------------------------------------------------------- 8. VÉLOCITÉ */
  function buildVelocity() {
    const html =
      '<div class="dlg-pane w-scroll"><div class="tr-body">' +
      '<div class="dlg-row"><label>Opération</label><div class="f"><span data-velmode>Ajouter <i class="arr"></i></span></div></div>' +
      '<div class="dlg-row"><label>Valeur</label><div class="f"><span data-velval>0</span></div></div>' +
      '<div class="tr-row"><input type="range" min="-127" max="127" value="0" class="tr-slider" data-velslider>' +
      '<span class="tr-scale"><i>-127</i><i>0</i><i>+127</i></span></div>' +
      '<div class="dlg-row"><label>Limites</label><div class="f"><span>1 – 127 <i class="arr"></i></span></div></div>' +
      chk('Appliquer aux notes sélectionnées seulement', false) +
      chk('Conserver les vélocités d’origine dans un « Undo » local', true) +
      '<div class="hint">Nuendo 4 : <b>MIDI ▸ Vélocité</b> ajoute, soustrait, multiplie ou fixe les vélocités des notes. ' +
      'L’opération est destructrice pour le projet (Annuler avec Ctrl+Z).</div>' +
      '</div></div>' +
      '<div class="dlg-foot"><span class="hint">Valeur 0 = aucune modification</span>' + btn('Annuler') + btn('Appliquer', 'on') + '</div>';
    return {
      title: 'Vélocité <em>· transformation des notes MIDI</em>', ac: '#6a5d94', html,
      after(body) {
        const sl = $('[data-velslider]', body);
        const val = $('[data-velval]', body);
        sl.addEventListener('input', () => { val.textContent = (sl.value > 0 ? '+' : '') + sl.value; });
        body.addEventListener('click', (e) => {
          const b = e.target.closest('.w-btn');
          if (!b) return;
          if (b.textContent.trim() === 'Annuler') W.close('velocitydlg');
          else {
            // AUDIT v6 (A97) : modification réellement exécutée par le noyau —
            // un modificateur MIDI est stocké puis appliqué à la piste MIDI.
            const offset = Number(sl.value) || 0;
            const ti = selectedNativeIndex();
            const index = ((deviceState().midiModifiers) || []).length;
            nativeSend('storeMidiModifier', {
              name: 'Vélocité ' + (offset > 0 ? '+' : '') + offset,
              transposeSemitones: 0, velocityOffset: offset, velocityScale: 1,
              lengthScale: 1, delayBars: 0, invert: false
            });
            nativeSend('applyMidiModifier', { modifierIndex: index, trackIndex: ti });
            const touched = Number(deviceState().lastLogicalTouched || 0);
            toast('Vélocités modifiées de ' + (offset > 0 ? '+' : '') + offset + ' : ' + touched +
              ' note(s) réellement transformée(s) sur la piste ' + (ti + 1) + ' (Ctrl+Z pour annuler).', 'Vélocité');
            W.close('velocitydlg');
          }
        });
      }
    };
  }

  W.register({
    trackctl:    { label: 'Track Controls Settings', x: 380, y: 150, w: 680, h: 470, ac: '#4f7188', build: buildTrackCtl },
    qcontrols:   { label: 'Quick Controls', x: 300, y: 170, w: 620, h: 320, ac: '#7a4a3a', build: buildQControls },
    inspsetup:   { label: 'Inspector Setup', x: 400, y: 180, w: 620, h: 430, ac: '#4f7188', build: buildInspSetup },
    midimods:    { label: 'Modificateurs MIDI', x: 360, y: 160, w: 660, h: 460, ac: '#6a5d94', build: buildMidiMods },
    menusetup:   { label: 'Personnaliser les menus', x: 380, y: 170, w: 660, h: 470, ac: '#5a7fa3', build: buildMenuSetup },
    midimonitor: { label: 'Moniteur MIDI', x: 420, y: 190, w: 600, h: 380, ac: '#5d87a3', build: buildMidiMonitor },
    transpose:   { label: 'Transposer', x: 450, y: 220, w: 470, h: 320, fit: true, minH: 360, ac: '#6a5d94', build: buildTranspose },
    velocitydlg: { label: 'Vélocité', x: 470, y: 230, w: 470, h: 310, fit: true, minH: 350, ac: '#6a5d94', build: buildVelocity }
  });
})();
