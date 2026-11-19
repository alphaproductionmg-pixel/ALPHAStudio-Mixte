/* =========================================================================
   ALPHA Studio — Fenêtres du lot 2
   Performances VST · Tempo · Navigateur de projet · Feuille de pistes ·
   Configuration du projet / Préférences / Périphériques · Commandes clavier ·
   Vidéo · Control Room · Connexions · Export · Fondus · Silences · Spectre ·
   Statistiques · Parties audio · Liste MIDI · Loop/Sound Browser ·
   Espaces de travail · Configuration des éléments (Setup dialog).
   ========================================================================= */
(function () {
  'use strict';

  const A = window.ALPHA || {};
  const W = window.ALPHAWIN;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  if (!W) { console.warn('ALPHAWIN absent : fenêtres du lot 2 non chargées'); return; }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const track = (id) => (A.trackById ? A.trackById(id) : null);
  const parts = () => (A.PARTS || []);
  const fmt = (p) => (A.fmtPos ? A.fmtPos(p) : String(p));
  const dbTxt = (db) => (db < 0 ? '\u2212' : '+') + Math.abs(db).toFixed(1).replace('.', ',') + ' dB';

  function ticker(fn, ms) {
    const id = setInterval(() => { if (!fn()) clearInterval(id); }, ms || 140);
    return id;
  }
  function rnd(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const btn = (label, cls, attrs) =>
    '<button class="w-btn' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '>' + label + '</button>';
  const chk = (label, on) => '<div class="dlg-check' + (on ? ' on' : '') + '"><i></i><span>' + label + '</span></div>';
  const dlgRow = (label, value, arr) =>
    '<div class="dlg-row"><label>' + label + '</label><div class="f"><span>' + esc(value) + '</span>' +
    (arr ? '<i class="arr"></i>' : '') + '</div></div>';
  const footBar = (hint, okLabel) =>
    '<div class="dlg-foot"><span class="hint">' + hint + '</span>' +
    btn('Annuler') + btn(okLabel || 'OK', 'on') + '</div>';

  /* =====================================================================
     1. PERFORMANCES VST  (F12)
     ===================================================================== */
  function buildPerf() {
    const html =
      '<div class="perf">' +
      '<div class="w-toolbar"><span class="w-lbl">VST Performance — Devices</span>' +
      '<span style="flex:1"></span><button class="w-btn" data-pfreset="1">Réinitialiser les crêtes</button>' +
      '<span class="w-lbl">F12</span></div>' +
      '<div class="w-toolbar pf-bar2"><span class="w-lbl">Compteurs</span>' +
      '<button class="w-btn on" data-pfshow="cpu" title="Afficher / masquer le compteur processeur"><i class="pf-dot on"></i> CPU</button>' +
      '<button class="w-btn on" data-pfshow="disk" title="Afficher / masquer le compteur disque"><i class="pf-dot on"></i> Disque</button>' +
      '<span class="w-sep"></span><span class="w-lbl">Aussi</span>' +
      '<button class="w-btn" data-pf="transport" title="Afficher aussi dans la barre de transport">Transport</button>' +
      '<button class="w-btn" data-pf="toolbar" title="Afficher aussi dans la barre d’outils du projet">Barre projet</button>' +
      '<span style="flex:1"></span><button class="w-btn" data-pf="freeze" title="Figer les valeurs affichées">Figer ▶</button></div>' +
      '<div class="pf-box" data-pfbox="cpu"><div class="pf-cap"><span>Charge processeur (CPU)</span><span data-pfcpu>17 %</span></div>' +
      '<div class="pf-bar"><i data-pfcpubar style="width:17%"></i><u data-pfcpupeak style="left:24%"></u></div>' +
      '<div class="pf-led" data-pfcpuled><i></i>Overload</div></div>' +
      '<div class="pf-box" data-pfbox="disk"><div class="pf-cap"><span>Transfert disque</span><span data-pfdisk>6,1 Mo/s</span></div>' +
      '<div class="pf-bar"><i data-pfdiskbar style="width:11%"></i><u data-pfdiskpeak style="left:18%"></u></div>' +
      '<div class="pf-led" data-pfdiskled><i></i>Overload</div></div>' +
      '<div class="pf-foot">' +
      '<div class="pf-grid">' +
      '<div><span class="w-lbl">Moteur</span><b>Alpha ASIO Driver</b></div>' +
      '<div><span class="w-lbl">Échantillons / tampon</span><b>256</b></div>' +
      '<div><span class="w-lbl">Fréquence</span><b>48 000 Hz</b></div>' +
      '<div><span class="w-lbl">Latence du pilote</span><b>5,3 ms</b></div>' +
      '</div></div>' +
      '</div>' +
      '<div class="aw-foot"><span>Performances VST — F12</span><span style="flex:1"></span><span>Charge CPU et disque · voyants de surcharge</span></div>';
    return {
      title: 'Performances VST <em>· VST Performance</em>',
      ac: '#7a4a3a',
      html,
      after(body) {
        let cpu = 17, disk = 11, pkC = 24, pkD = 18;
        let frozen = false;
        const id = setInterval(() => {
          if (!document.body.contains(body)) { clearInterval(id); return; }
          if (frozen) return;
          cpu = Math.max(4, Math.min(96, cpu + (Math.random() - 0.48) * 9));
          disk = Math.max(2, Math.min(88, disk + (Math.random() - 0.5) * 7));
          pkC = Math.max(pkC - 0.7, cpu); pkD = Math.max(pkD - 0.9, disk);
          $('[data-pfcpu]', body).textContent = Math.round(cpu) + ' %';
          $('[data-pfcpubar]', body).style.width = cpu.toFixed(1) + '%';
          $('[data-pfcpupeak]', body).style.left = pkC.toFixed(1) + '%';
          $('[data-pfdisk]', body).textContent = (disk / 2).toFixed(1).replace('.', ',') + ' Mo/s';
          $('[data-pfdiskbar]', body).style.width = disk.toFixed(1) + '%';
          $('[data-pfdiskpeak]', body).style.left = pkD.toFixed(1) + '%';
          $('[data-pfcpuled]', body).classList.toggle('on', cpu > 88);
          $('[data-pfdiskled]', body).classList.toggle('on', disk > 84);
        }, 420);
        const rb = $('[data-pfreset]', body);
        if (rb) rb.addEventListener('click', () => { pkC = cpu; pkD = disk; A.showToast('Crêtes réinitialisées.', 'Performances VST'); });
        $$('[data-pfshow]', body).forEach((b) => b.addEventListener('click', () => {
          const dot = b.querySelector('.pf-dot');
          dot.classList.toggle('on');
          const box = $('[data-pfbox="' + b.dataset.pfshow + '"]', body);
          if (box) box.style.display = dot.classList.contains('on') ? '' : 'none';
          A.showToast('Compteur ' + (b.dataset.pfshow === 'cpu' ? 'processeur' : 'disque') +
            (dot.classList.contains('on') ? ' affiché' : ' masqué') + '.', 'Performances VST');
        }));
        $$('[data-pf]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.pf;
          if (k === 'freeze') {
            frozen = !frozen;
            b.classList.toggle('on', frozen);
            A.showToast(frozen ? 'Valeurs figées (Figer ▶ pour reprendre).' : 'Affichage remis à jour.', 'Performances VST');
            return;
          }
          b.classList.toggle('on');
          A.showToast('Compteurs aussi affichés dans ' + (k === 'transport' ? 'la barre de transport (« Performance »)' :
            'la barre d’outils du projet (« Performance Meter »)') + '.', 'Performances VST');
        }));
      }
    };
  }

  /* =====================================================================
     2. ÉDITEUR DE PISTE DE TEMPO  (Ctrl+T)
     ===================================================================== */
  const TEMPO = { fixed: false, base: 120, points: [[1, 120], [9, 120], [17, 128], [25, 122], [33, 128], [41, 118], [49, 126], [57, 120]] };

  function tempoSVG() {
    const Wd = 620, H = 190;
    const x = (bar) => ((bar - 1) / 63) * (Wd - 20) + 10;
    const y = (bpm) => H - 18 - ((bpm - 80) / 80) * (H - 40);
    let g = '';
    for (let b = 1; b <= 64; b += 4) {
      g += '<line x1="' + x(b) + '" y1="6" x2="' + x(b) + '" y2="' + (H - 12) + '" stroke="#4c5457" stroke-width="1"/>';
      g += '<text x="' + (x(b) + 3) + '" y="' + (H - 3) + '" font-size="8" fill="#7f8b93" font-family="Consolas,monospace">' + b + '</text>';
    }
    [80, 100, 120, 140, 160].forEach((bpm) => {
      g += '<line x1="10" y1="' + y(bpm) + '" x2="' + (Wd - 10) + '" y2="' + y(bpm) + '" stroke="#3d4549"/>';
      g += '<text x="12" y="' + (y(bpm) - 3) + '" font-size="7" fill="#7f8b93" font-family="Consolas,monospace">' + bpm + '</text>';
    });
    let d = '';
    if (TEMPO.fixed) {
      d = 'M10,' + y(TEMPO.base) + ' L' + (Wd - 10) + ',' + y(TEMPO.base);
    } else {
      const p = TEMPO.points.slice().sort((a, b) => a[0] - b[0]);
      d = 'M' + x(p[0][0]) + ',' + y(p[0][1]) + p.slice(1).map((q) => ' L' + x(q[0]) + ',' + y(q[1])).join('');
    }
    const pts = TEMPO.fixed ? [] : TEMPO.points.map((q, i) =>
      '<g class="pt" data-pt="' + i + '"><circle cx="' + x(q[0]) + '" cy="' + y(q[1]) + '" r="4.6" fill="#e8c14b" stroke="#1b1f21"/>' +
      '<text x="' + (x(q[0]) + 7) + '" y="' + (y(q[1]) + 3) + '" font-size="7.5" fill="#e8c14b" font-family="Consolas,monospace">' +
      q[1] + '</text></g>').join('');
    return '<svg viewBox="0 0 ' + Wd + ' ' + H + '" preserveAspectRatio="none">' + g +
      '<path d="' + d + '" fill="none" stroke="#9ed2ea" stroke-width="1.8"/>' +
      '<path d="' + d + '" fill="none" stroke="rgba(158,210,234,.18)" stroke-width="7"/>' + pts + '</svg>';
  }

  function buildTempo() {
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-tmfixed="1">Tempo fixe</button>' +
      '<button class="w-btn on" data-tmtrack="1">Piste de tempo</button>' +
      '<span class="w-sep"></span><span class="w-lbl">Courbe</span>' +
      '<span class="w-field" style="min-width:78px">Rampe <i class="arr"></i></span>' +
      '<span class="w-lbl">Grille</span><span class="w-field" style="min-width:64px">Mesure <i class="arr"></i></span>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-tmauto="1" title="Défilement automatique">Autoscroll</button>' +
      '<button class="w-btn" data-tmrec="1" title="Tempo Record : enregistrer les changements de tempo en lecture">Tempo Record</button>' +
      '<span class="w-sep"></span><span class="w-lbl">Échelle</span>' +
      '<span class="w-field" style="min-width:96px" data-tmlinear>Mesures+temps <i class="arr"></i></span>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-tmproc="tempo">Process Tempo…</button>' +
      '<button class="w-btn" data-tmproc="bars">Process Bars…</button>' +
      '</div>' +
      '<div class="tm-body">' +
      '<div class="tm-graph" data-tmgraph>' + tempoSVG() + '</div>' +
      '<div class="tm-list"><div class="w-scroll"><table><thead><tr>' +
      '<th style="width:26px">N°</th><th style="width:96px">Position</th><th style="width:74px">Tempo</th>' +
      '<th style="width:110px">Signature</th><th>Type</th></tr></thead><tbody data-tmtb></tbody></table></div></div>' +
      '</div>' +
      '<div class="aw-foot"><span>Éditeur de piste de tempo — Ctrl+T</span><span style="flex:1"></span>' +
      '<span>Cliquer dans le graphe = insérer un point · Rampe / Saut · échelle linéaire en mesures</span></div>';
    return {
      title: 'Éditeur de piste de tempo <em>· Tempo Track Editor</em>', ac: '#4f7188', html,
      after(body) {
        function rows() {
          const tb = $('[data-tmtb]', body);
          tb.innerHTML = TEMPO.points.map((pt, i) =>
            '<tr' + (i === 0 ? ' class="sel"' : '') + '><td>' + (i + 1) + '</td><td class="pos">' + fmt(pt[0]) + '</td>' +
            '<td class="pos">' + pt[1].toFixed(3).replace('.', ',') + '</td><td>4/4</td><td>Point de tempo</td></tr>').join('') +
            (TEMPO.points.length ? '' : '<tr><td colspan="5">Tempo fixe : ' + TEMPO.base + ' BPM</td></tr>');
        }
        rows();
        $$('[data-tmfixed]', body).forEach((b) => b.addEventListener('click', () => {
          TEMPO.fixed = true;
          b.classList.add('on'); $('[data-tmtrack]', body).classList.remove('on');
          A.showToast('Mode tempo fixe : la piste de tempo est ignorée.', 'Tempo');
          rows();
        }));
        $$('[data-tmtrack]', body).forEach((b) => b.addEventListener('click', () => {
          TEMPO.fixed = false;
          b.classList.add('on'); $('[data-tmfixed]', body).classList.remove('on');
          A.showToast('Mode piste de tempo activé.', 'Tempo');
          rows();
        }));
        $$('[data-tmauto]', body).forEach((b) => b.addEventListener('click', () => {
          b.classList.toggle('on');
          A.showToast('Autoscroll ' + (b.classList.contains('on') ? 'activé' : 'désactivé') + '.', 'Tempo');
        }));
        $$('[data-tmrec]', body).forEach((b) => b.addEventListener('click', () => {
          b.classList.toggle('on');
          A.showToast('Tempo Record ' + (b.classList.contains('on') ? 'armé : les changements de tempo seront écrits en lecture' : 'désarmé') + '.', 'Tempo');
        }));
        $$('[data-tmlinear]', body).forEach((b) => b.addEventListener('click', () => {
          const lin = b.textContent.indexOf('Mesures') === 0;
          b.innerHTML = (lin ? 'Temps linéaire' : 'Mesures+temps') + ' <i class="arr"></i>';
          A.showToast('Axe du temps : ' + (lin ? 'linéaire (Time Linear)' : 'musical (Bars+Beats Linear)') + '.', 'Tempo');
        }));
        $$('[data-tmproc]', body).forEach((b) => b.addEventListener('click', () => {
          A.showToast(b.dataset.tmproc === 'tempo'
            ? 'Process Tempo : interpolation du tempo entre deux points (interface).'
            : 'Process Bars : insertion / suppression de mesures dans la grille (interface).', 'Tempo');
        }));
        const g = $('[data-tmgraph]', body);
        g.addEventListener('click', (e) => {
          if (TEMPO.fixed) { A.showToast('Tempo fixe : passez en « Piste de tempo » pour éditer la courbe.', 'Tempo'); return; }
          const r = g.getBoundingClientRect();
          const bar = Math.max(1, Math.round(1 + ((e.clientX - r.left) / r.width) * 63));
          const bpm = Math.round((80 + ((r.bottom - e.clientY) / r.height) * 80) / 2) * 2;
          TEMPO.points.push([bar, Math.max(60, Math.min(180, bpm))]);
          TEMPO.points.sort((a, b2) => a[0] - b2[0]);
          $('[data-tmgraph]', body).innerHTML = tempoSVG();
          rows();
          A.showToast('Point de tempo à la mesure ' + bar + ' : ' + Math.max(60, Math.min(180, bpm)) + ' BPM.', 'Tempo');
        });
      }
    };
  }

  /* =====================================================================
     3. NAVIGATEUR DE PROJET  (Ctrl+B)
     ===================================================================== */
  function buildBrowser() {
    const tracks = (A.TRACKS || []).filter((t) => t.num);
    let cur = tracks[0] ? tracks[0].id : null;
    let timeMode = 'bars';
    let sync = true;
    let filter = '';
    const STRUCT = [['audio', 'Audio'], ['midi', 'MIDI'], ['video', 'Vidéo'],
                    ['auto', 'Automatisation'], ['arr', 'Arranger'], ['mark', 'Marqueurs'], ['tempo', 'Tempo']];
    const on = {};
    STRUCT.forEach((x) => { on[x[0]] = true; });
    const COLS = {
      audio: ['Nom', 'Fichier', 'Début', 'Fin', 'Snap', 'Long.', 'Déc.', 'Vol.'],
      midi: ['Nom', 'Début', 'Fin', 'Longueur', 'Type', 'Valeur 1', 'Valeur 2', 'Canal'],
      auto: ['Piste', 'Paramètre', 'Début', 'Fin', 'Valeur', 'Type'],
      arr: ['Nom', 'Début', 'Fin', 'Longueur'],
      mark: ['Nom', 'Position', 'Type', 'ID'],
      tempo: ['Position', 'Tempo', 'Signature', 'Type'],
      video: ['Nom', 'Fichier', 'Début', 'Longueur', 'Images/s']
    };
    function tf(x) {
      if (timeMode === 'tc') return A.fmtTc ? A.fmtTc(x) : String(x);
      if (timeMode === 'smp') return String(Math.round(x * 48000));
      return A.fmtShortPos ? A.fmtShortPos(x) : fmt(x);
    }
    function rowsOf(id, kind) {
      if (kind === 'mark') return (A.MARKERS || []).map((m) => [m.name, fmt(m.pos), m.type || 'Marqueur', String(m.id || '')]);
      if (kind === 'tempo') return [['1.1.1.0', '120,000', '4/4', 'Tempo'], ['9.1.1.0', '128,000', '4/4', 'Tempo'], ['17.1.1.0', '90,000', '3/4', 'Tempo']];
      if (kind === 'auto') return [['Voix lead', 'Volume', '1.1.1.0', '5.1.1.0', '0,0 dB', 'Fader'], ['Voix lead', 'Panoramique', '5.1.1.0', '9.1.1.0', 'C', 'Panner']];
      if (kind === 'arr') return [['Couplet', '1.1.1.0', '9.1.1.0', '8 mes.'], ['Refrain', '9.1.1.0', '17.1.1.0', '8 mes.']];
      if (kind === 'video') return [['Plan séquence', 'clip_alpha.mov', '1.1.1.0', '24.0.0.0', '25']];
      return parts().filter((p) => (!id || p.track === id) && (kind === 'midi' ? p.type === 'midi' : kind === 'audio' ? p.type !== 'midi' : true))
        .map((p) => {
          const t = track(p.track);
          if (kind === 'midi') return [p.name, tf(p.start), tf(p.start + p.len), p.len + '.0.0.0', 'Note', '60', '100', '1'];
          return [p.name, (p.name || 'audio').replace(/[^A-Za-z0-9]/g, '_').toLowerCase() + '.wav', tf(p.start), tf(p.start + p.len),
                  'Grille', p.len + ' mes.', '0', (t ? (t.db || 0).toFixed(1) : '0.0') + ' dB'];
        });
    }
    const CW = {
      audio: [17, 17, 17, 17, 8, 8, 8, 8],
      midi: [22, 13, 13, 10, 10, 10, 11, 11],
      auto: [20, 18, 16, 16, 18, 12],
      arr: [34, 22, 22, 22],
      mark: [34, 26, 22, 18],
      tempo: [24, 24, 26, 26],
      video: [26, 26, 14, 16, 18]
    };
    function table(id, kind) {
      const k = kind || 'audio';
      const cols = COLS[k];
      const w = CW[k] || [];
      const rows = rowsOf(id, k).filter((r) => !filter || r.join(' ').toLowerCase().indexOf(filter) >= 0);
      return '<table data-bptable data-kind="' + k + '"><thead><tr>' + cols.map((c, i) => '<th style="width:' + (w[i] || 12) + '%">' + c + '</th>').join('') + '</tr></thead><tbody>' +
        (rows.length ? rows.map((r) => '<tr>' + r.map((c) => '<td>' + esc(String(c)) + '</td>').join('') + '</tr>').join('')
          : '<tr><td colspan="' + cols.length + '" style="color:#8f8f88">Aucun événement pour ce filtre.</td></tr>') +
        '</tbody></table>';
    }
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-badd="1" title="Ajouter un élément à la structure">+ Ajouter</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Format de temps</span>' +
      '<button class="w-btn on" data-btime="bars" title="Mesures et temps">Mesures+temps</button>' +
      '<button class="w-btn" data-btime="tc" title="Code temporel">Timecode</button>' +
      '<button class="w-btn" data-btime="smp" title="Échantillons">Échantillons</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Filtre</span>' +
      '<input class="w-input" data-bfilter placeholder="nom, fichier…" style="width:120px">' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-bexp="all" title="Développer toutes les entrées">(+) Tout</button>' +
      '<button class="w-btn" data-bexp="none" title="Réduire toutes les entrées">(−) Tout</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn on" data-bsync="1" title="Synchroniser la sélection avec la fenêtre Projet">Sync sélection</button>' +
      '<span style="flex:1"></span><span class="w-lbl">Ctrl+B</span></div>' +
      '<div class="pb-wrap">' +
      '<div class="pb-tree">' +
      '<div class="pb-h">Structure du projet</div>' +
      '<div class="t on" data-bpt="" data-bkind="audio"><span class="ic" style="background:#8a8f95"></span>Projet (tout)</div>' +
      tracks.map((t) => '<div class="t" data-bpt="' + t.id + '" data-bkind="' + (t.kind === 'midi' ? 'midi' : 'audio') + '" style="padding-left:14px">' +
        '<span class="ic" style="background:' + t.partColor + '"></span>' + esc(t.name) + '</div>').join('') +
      '<div class="pb-h">Catégories</div>' +
      STRUCT.map((x) => '<div class="pb-c" data-bcat="' + x[0] + '"><i class="on"></i>' + x[1] + '</div>').join('') +
      '</div>' +
      '<div class="pb-main"><div class="w-scroll" data-bptable-wrap>' + table(null, 'audio') + '</div></div>' +
      '</div>' +
      '<div class="aw-foot"><span>Navigateur de projet — édition en liste de toutes les données</span><span style="flex:1"></span>' +
      '<span data-bpinfo>Double-clic sur une ligne = ouvrir l’éditeur</span></div>';
    return {
      title: 'Navigateur de projet <em>· Project Browser</em>', ac: '#5a7fa3', html,
      after(body) {
        let kind = 'audio';
        const draw = (id) => {
          $('[data-bptable-wrap]', body).innerHTML = table(id, kind);
        };
        $$('[data-bpt]', body).forEach((t) => t.addEventListener('click', () => {
          $$('[data-bpt]', body).forEach((x) => x.classList.toggle('on', x === t));
          kind = t.dataset.bkind;
          $$('[data-bcat]', body).forEach((x) => x.classList.toggle('on', x.dataset.bcat === kind));
          draw(t.dataset.bpt || null);
          A.showToast('Structure : ' + t.textContent.trim() + ' (' + kind + ').', 'Navigateur de projet');
        }));
        $$('[data-bcat]', body).forEach((c) => c.addEventListener('click', () => {
          const k = c.dataset.bcat;
          on[k] = !on[k];
          c.querySelector('i').classList.toggle('on', on[k]);
          if (!on[k]) { A.showToast('Catégorie « ' + c.textContent.trim() + ' » masquée.', 'Navigateur de projet'); return; }
          kind = k;
          $$('[data-bcat]', body).forEach((x) => x.classList.toggle('on', x === c));
          draw(null);
        }));
        $$('[data-btime]', body).forEach((b) => b.addEventListener('click', () => {
          $$('[data-btime]', body).forEach((x) => x.classList.toggle('on', x === b));
          timeMode = b.dataset.btime;
          draw(null);
        }));
        $$('[data-bsync]', body).forEach((b) => b.addEventListener('click', () => {
          sync = !sync;
          b.classList.toggle('on', sync);
          A.showToast('Synchronisation avec la sélection du projet : ' + (sync ? 'activée' : 'désactivée') + '.', 'Navigateur de projet');
        }));
        $$('[data-badd]', body).forEach((b) => b.addEventListener('click', () => A.showToast('Ajouter : nouvel élément de structure (piste, dossier, événement) — étape 2.', 'Navigateur de projet')));
        $$('[data-bexp]', body).forEach((b) => b.addEventListener('click', () => {
          const open = b.dataset.bexp === 'all';
          $$('.pb-tree .t[data-bpt]:not([data-bpt=""])', body).forEach((x) => { x.style.display = open ? '' : 'none'; });
          A.showToast(open ? 'Toutes les entrées développées.' : 'Toutes les entrées réduites.', 'Navigateur de projet');
        }));
        const fi = $('[data-bfilter]', body);
        fi.addEventListener('input', () => { filter = fi.value.toLowerCase().trim(); draw(null); });
        const wrap = $('[data-bptable-wrap]', body);
        wrap.addEventListener('click', (e) => {
          const tr = e.target.closest('tbody tr');
          if (!tr || !tr.children.length) return;
          $$('tbody tr', wrap).forEach((x) => x.classList.remove('sel'));
          tr.classList.add('sel');
        });
        wrap.addEventListener('dblclick', (e) => {
          const tr = e.target.closest('tbody tr');
          if (!tr) return;
          const p = parts().find((x) => x.name === tr.children[0].textContent);
          if (p) W.open(p.type === 'midi' ? 'key' : 'sample', p.id);
        });
      }
    };
  }

  /* =====================================================================
     4. FEUILLE DE PISTES  (Track Sheet)
     ===================================================================== */
  function buildTrackSheet() {
    const tracks = (A.TRACKS || []).filter((t) => t.num).slice(0, 8);
    const raw = [];
    tracks.forEach((t, ti) => {
      parts().filter((p) => p.track === t.id).sort((a, b) => a.start - b.start).forEach((p) => {
        raw.push({ ti, start: p.start, end: p.start + p.len, name: p.name || (t.name + ' · événement') });
      });
    });
    const st = { merge: '', filter: '', noLead: false, tcCol: 'Chaque page', pen: 1, noEndUnder: '', pageX: [1, 2], pageY: [1, 3] };
    const TCS = ['Chaque page', 'Première page seulement', 'Aucune'];
    const PENS = [0.5, 1, 1.5, 2];
    function fmtS(x) {
      const t = fmt(x);
      if (!st.noLead) return t;
      return t.split('.').map((seg) => String(parseInt(seg, 10) || 0)).join('.');
    }
    function events() {
      const mg = parseFloat((st.merge || '').replace(',', '.')) || 0;
      let list = raw.map((e) => ({ ti: e.ti, start: e.start, end: e.end, name: e.name }));
      if (mg > 0) {
        const out = [];
        list.forEach((e) => {
          const prev = out.filter((x) => x.ti === e.ti)[0];
          if (prev && e.start - prev.end <= mg + 1e-9) { prev.end = Math.max(prev.end, e.end); }
          else out.push({ ti: e.ti, start: e.start, end: e.end, name: e.name });
        });
        list = out;
      }
      const terms = (st.filter || '').split(';').map((q) => q.trim().toLowerCase()).filter(Boolean);
      if (terms.length) list = list.filter((e) => !terms.some((q) => e.name.toLowerCase().indexOf(q) >= 0));
      return list;
    }
    function sheet_html() {
      const evs = events().sort((a, b) => a.start - b.start);
      const pos = [];
      evs.forEach((e) => { if (pos.indexOf(e.start) < 0) pos.push(e.start); });
      pos.sort((a, b) => a - b);
      const rows = pos.map((p) => {
        let tds = '';
        for (let i = 0; i < tracks.length; i++) {
          const e = evs.filter((x) => x.ti === i && x.start === p)[0];
          const shortEnd = st.noEndUnder && (e && (e.end - e.start) < (parseFloat(st.noEndUnder.replace(',', '.')) || 0));
          tds += '<td class="evc">' + (e
            ? '<span class="ev" title="' + esc(e.name) + '"><b>' + fmtS(e.start) + '</b><span class="vl"></span>' +
              (shortEnd ? '' : '<b>' + fmtS(e.end) + '</b>') + '</span>' : '') + '</td>';
        }
        return '<tr' + (st.tcCol === 'Aucune' ? ' class="notc"' : '') + '><td class="tmc">' + fmtS(p) + '</td>' + tds + '</tr>';
      }).join('');
      return {
        html: '<div class="ts-head"><span class="pj">Démo_Alpha_01</span><span class="ed">Régie A</span>' +
          '<span class="hd">Feuille de pistes — session 1</span></div>' +
          '<table class="ts" style="min-width:' + (118 + tracks.length * 112) + 'px"><thead><tr>' +
          '<th class="thc" style="width:112px">Position</th>' +
          tracks.map((t) => '<th>' + esc(t.name) + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table>',
        n: evs.length, p: pos.length
      };
    }
    const first = sheet_html();
    const html =
      '<div class="w-toolbar" style="gap:6px">' +
      '<span class="w-lbl" title="Page horizontale">X</span><button class="w-btn" data-tspage="x" style="min-width:52px" title="Pages côte à côte">' + st.pageX[0] + ' (' + st.pageX[1] + ')</button>' +
      '<span class="w-lbl" title="Page verticale">Y</span><button class="w-btn" data-tspage="y" style="min-width:52px" title="Pages l’une sous l’autre">' + st.pageY[0] + ' (' + st.pageY[1] + ')</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Échelle</span><input type="range" min="50" max="150" value="100" data-ts-scale style="width:66px">' +
      '<span class="w-lbl">Zoom</span><input type="range" min="40" max="140" value="80" data-ts-zoom style="width:66px">' +
      '<span class="w-sep"></span>' +
      '<span style="flex:1"></span><button class="w-btn on" data-ts-more>Plus ▾</button>' +
      '</div>' +
      '<div class="ts-more" data-ts-fields style="display:none">' +
      '<span class="grp">Présentation</span>' +
      '<label>Épaisseur trait</label><button class="w-btn" data-tspen style="min-width:48px">1 pt</button>' +
      '<label>Colonne temps</label><button class="w-btn" data-tstc style="min-width:118px">' + st.tcCol + ' ▾</button>' +
      '<label class="dlg-check" style="margin:0"><input type="checkbox" data-tslead> Sans zéros initiaux</label>' +
      '<span class="grp">En-tête</span>' +
      '<label>Projet</label><span class="w-field">Démo_Alpha_01</span>' +
      '<label>Ingénieur</label><span class="w-field">Régie A</span>' +
      '<label>En-tête</label><span class="w-field">Feuille de pistes — session 1</span>' +
      '<span class="grp">Filtres</span>' +
      '<label>Masquer la fin si durée &lt;</label><input class="w-input" data-tsnoend style="width:52px" value="0,500">' +
      '<label>Fusionner si écart ≤</label><input class="w-input" data-tsmerge style="width:52px" value="0,000">' +
      '<label>Filtre de noms (séparés par ;)</label><input class="w-input" data-tsfilter style="width:130px" value="" placeholder="Cross">' +
      '</div>' +
      '<div class="w-scroll" style="flex:1;min-height:0;background:#f4f2ee">' +
      '<div class="ts-sheet" data-ts-sheet style="--pen:1px">' + first.html + '</div></div>' +
      '<div class="aw-foot"><span>Feuille de pistes — « Track Sheet » (Projet ▸ Feuille de pistes)</span>' +
      '<span style="flex:1"></span><span data-tscount>' + first.n + ' événements · ' + first.p + ' positions · ' + tracks.length + ' pistes</span></div>';
    return {
      title: 'Feuille de pistes <em>· Track Sheet</em>', ac: '#6f7d86', html,
      after(body) {
        const sheet = $('[data-ts-sheet]', body);
        let scale = 1;
        function redraw() {
          const r = sheet_html();
          sheet.innerHTML = r.html;
          $('[data-tscount]', body).textContent = r.n + ' événements · ' + r.p + ' positions · ' + tracks.length + ' pistes';
          sheet.style.fontSize = (9 * scale).toFixed(1) + 'px';
        }
        const more = $('[data-ts-more]', body);
        const fields = $('[data-ts-fields]', body);
        more.addEventListener('click', () => {
          const open = fields.style.display !== 'none';
          fields.style.display = open ? 'none' : 'flex';
          more.textContent = open ? 'Plus ▾' : 'Moins ▴';
          more.classList.toggle('on', !open);
        });
        $('[data-ts-scale]', body).addEventListener('input', (e) => {
          scale = e.target.value / 100;
          sheet.style.fontSize = (9 * scale).toFixed(1) + 'px';
        });
        $('[data-ts-zoom]', body).addEventListener('input', (e) => {
          sheet.style.transform = 'scale(' + (e.target.value / 100) + ')';
          sheet.style.transformOrigin = '0 0';
        });
        $$('[data-tspage]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.tspage === 'x' ? 'pageX' : 'pageY';
          st[k][0] = st[k][0] % st[k][1] + 1;
          b.textContent = st[k][0] + ' (' + st[k][1] + ')';
          A.showToast('Page ' + (k === 'pageX' ? 'horizontale X' : 'verticale Y') + ' : ' +
            st[k][0] + ' sur ' + st[k][1] + ' (aperçu non paginé dans la fenêtre).', 'Feuille de pistes');
        }));
        $('[data-tspen]', body).addEventListener('click', (e) => {
          const i = (PENS.indexOf(st.pen) + 1) % PENS.length;
          st.pen = PENS[i];
          e.currentTarget.textContent = String(st.pen).replace('.', ',') + ' pt';
          sheet.style.setProperty('--pen', st.pen + 'px');
          A.showToast('Épaisseur du trait de liaison : ' + String(st.pen).replace('.', ',') + ' pt.', 'Feuille de pistes');
        });
        $('[data-tstc]', body).addEventListener('click', (e) => {
          st.tcCol = TCS[(TCS.indexOf(st.tcCol) + 1) % TCS.length];
          e.currentTarget.textContent = st.tcCol + ' ▾';
          redraw();
          A.showToast('Colonne temps : ' + st.tcCol.toLowerCase() + '.', 'Feuille de pistes');
        });
        $('[data-tslead]', body).addEventListener('change', (e) => {
          st.noLead = e.target.checked; redraw();
        });
        const bind = (sel, key) => {
          const el = $(sel, body);
          el.addEventListener('input', () => { st[key] = el.value; redraw(); });
        };
        bind('[data-tsmerge]', 'merge');
        bind('[data-tsfilter]', 'filter');
        bind('[data-tsnoend]', 'noEndUnder');
      }
    };
  }

  /* =====================================================================
     5. CONFIGURATION DU PROJET / PRÉFÉRENCES / PÉRIPHÉRIQUES
     ===================================================================== */
  const PROJECT = {
    name: 'Démo_Alpha_01', start: '0001.01.01.000', length: '0064.01.01.000',
    frameRate: '25 ips', sampleRate: '48 000 Hz', bitDepth: '24 bit', tempo: '120,000', signature: '4/4',
    recordPath: 'Alpha_Audio/', display: 'Barres + Temps'
  };

  function buildSetup() {
    const html =
      '<div class="dlg"><div class="dlg-body" style="display:block;overflow:auto;padding:10px">' +
      '<h5>Configuration du projet</h5>' +
      dlgRow('Nom du projet', 'Démo_Alpha_01') +
      dlgRow('Début', PROJECT.start) +
      dlgRow('Longueur', PROJECT.length) +
      dlgRow('Décalage d’affichage', '0:00:00:00', true) +
      dlgRow('Décalage de mesures', '0', true) +
      dlgRow('Fréquence d’image', PROJECT.frameRate, true) +
      dlgRow('Format d’affichage', PROJECT.display, true) +
      dlgRow('Fréquence d’échantillonnage', PROJECT.sampleRate, true) +
      dlgRow('Résolution (Record Format)', PROJECT.bitDepth, true) +
      dlgRow('Type de fichier', 'Broadcast Wave (BWF)', true) +
      dlgRow('Pull-up / Pull-down', 'Aucun', true) +
      dlgRow('Loi de panoramique stéréo', '-3 dB', true) +
      dlgRow('Dossier du projet', PROJECT.recordPath) +
      '<div class="dlg-row" style="margin-top:6px"><label>Montage vidéo</label>' +
      '<div class="f" style="display:flex;gap:5px;align-items:center">' +
      '<button class="w-btn" data-su="getvideo" style="flex:0 0 auto">Get From Video…</button>' +
      '<label class="dlg-check on" data-su="usefps" style="margin:0"><i></i><span>Suivre la fréquence d’image</span></label></div></div>' +
      '<div class="hint" style="margin-top:8px;font-size:8px;color:#5c5a54;line-height:1.55">' +
      'Nuendo 4 : le tempo et la signature ne sont pas ici — ils appartiennent à la piste de tempo (Ctrl+T).' +
      '</div>' +
      '</div>' + footBar('Ces valeurs seront utilisées par le moteur audio (étape 2).') + '</div>';
    return {
      title: 'Configuration du projet <em>· Project Setup</em>', ac: '#4f7188', html,
      after(body) {
        $$('.dlg-foot .w-btn', body).forEach((b) => b.addEventListener('click', () => {
          if (b.textContent === 'OK') A.showToast('Configuration du projet enregistrée (prototype).', 'Project Setup');
          if (b.textContent === 'Annuler') A.showToast('Modifications abandonnées.', 'Project Setup');
          W.close('setup');
        }));
        $$('[data-su="getvideo"]', body).forEach((b) => b.addEventListener('click', () => {
          A.showToast('Get From Video : début et fréquence d’image repris du montage (aucun montage chargé).', 'Project Setup');
        }));
        $$('[data-su="usefps"]', body).forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));
        /* les champs à flèche sont des menus : un clic décrit la liste disponible */
        $$('.dlg-row .arr', body).forEach((a) => a.parentNode.addEventListener('click', () => {
          const row = a.closest('.dlg-row');
          const lbl = row.querySelector('label').textContent;
          A.showToast('« ' + lbl + ' » : liste déroulante de la configuration du projet (interface).', 'Project Setup');
        }));
      }
    };
  }

  /* ---------------------------------------------------------------- 5 bis */
  function buildPrefs() {
    const PAGES = [
      ['Général', [
        ['Langue', 'Français', true],
        ['Afficher les conseils au démarrage', null, 'check', true],
        ['Enregistrer la configuration à la fermeture', null, 'check', true],
        ['Nombre d’annulations possibles', '50', true]
      ], 'Les préférences sont communes à tous les projets Nuendo.'],
      ['Apparence', [
        ['Jeu de couleurs', 'Nuendo 4 sombre', true],
        ['Taille de police des menus', 'Normal', true],
        ['Afficher les ombres des fenêtres', null, 'check', true],
        ['Utiliser les couleurs de piste', null, 'check', true]
      ], ''],
      ['Édition', [
        ['Résolution d’annulation des événements', '1/16', true],
        ['Accrochage par défaut', 'Barre', true],
        ['Déplacer les événements par', 'Position de départ', true],
        ['Sélectionner les données sous le curseur', null, 'check', true]
      ], ''],
      ['Enregistrement', [
        ['Mode', 'Audio + MIDI', true],
        ['Format de fichier audio', 'Wave 24 bit', true],
        ['Créer une copie de sauvegarde (.bak)', null, 'check', true],
        ['Durée de pré-enregistrement (s)', '2,0', true]
      ], ''],
      ['Transport', [
        ['Stopper au retour au début', null, 'check', true],
        ['Retour : début de locuteur / cycle', 'Cycle', true],
        ['Nudge', 'Barre', true],
        ['Métronome pendant l’enregistrement', null, 'check', true]
      ], ''],
      ['Événements', [
        ['Étirer en conservant la hauteur', null, 'check', true],
        ['Fondu automatique sur les événements', '10 ms', true],
        ['Afficher les fondus', null, 'check', true],
        ['Normaliser les fondus enchaînés', null, 'check', true]
      ], ''],
      ['VST', [
        ['Périphérique audio', 'Alpha ASIO Driver', true],
        ['Taille de la mémoire tampon', '256 échantillons', true],
        ['Sauvegarde automatique des éditeurs de plug-ins', null, 'check', true],
        ['Plug-in Editors Always on Top', null, 'check', false]
      ], 'Ajout Nuendo 4.3 : les éditeurs de plug-ins peuvent rester au-dessus des autres fenêtres.'],
      ['MediaBay', [
        ['Dossier d’analyse au démarrage', 'Alpha_Audio/', true],
        ['Rechercher les fichiers modifiés', null, 'check', true],
        ['Suivre le contenu du projet', null, 'check', true],
        ['Afficher les fichiers hors ligne', null, 'check', false]
      ], ''],
      ['Control Room', [
        ['Combiner avec la sortie principale', null, 'check', true],
        ['Sauvegarder la sélection Monitor', null, 'check', false],
        ['Atténuer à l’écoute de la talkback', null, 'check', true],
        ['Niveau de talkback', '0,0 dB', true]
      ], '']
    ];
    let cur = 0;
    function pane(i) {
      const [name, rows, hint] = PAGES[i];
      return '<h5>' + name + '</h5>' +
        rows.map((r, k) => '<div class="pf-row">' +
          (r[2] === 'check' ? chk(r[0], r[3]) : dlgRow(r[0], r[1], true)) +
          '<span class="pf-mark' + (r[4] ? ' on' : '') + '" data-pfmark="' + i + '.' + k + '" title="Marquer ce réglage pour « Stocker »"></span></div>').join('') +
        (hint ? '<div class="hint" style="margin-top:8px">' + hint + '</div>' : '');
    }
    const html =
      '<div class="pf-top">' +
      '<button class="w-btn" data-pfstore="1" title="Stocker les préférences marquées dans un preset">Stocker…</button>' +
      '<span class="dlg-check" data-pf only="1"><i></i>Store marked preferences only</span>' +
      '<span class="w-lbl">Preference Presets</span>' +
      '<button class="w-btn" data-pfpreset="Alpha Standard">Alpha Standard ▾</button>' +
      '</div>' +
      '<div class="dlg"><div class="dlg-body" style="display:flex;padding:0">' +
      '<div class="dlg-nav">' + PAGES.map((p, i) =>
        '<div class="n' + (i === 0 ? ' on' : '') + '" data-pref="' + i + '">' + p[0] + '</div>').join('') + '</div>' +
      '<div class="dlg-pane" data-prefpane>' + pane(0) + '</div>' +
      '</div><div class="dlg-foot"><span class="hint">Fichier ▸ Préférences — Preferences</span>' +
      btn('Réinitialiser') + btn('Annuler') + btn('Appliquer', 'on') + btn('OK') + '</div></div>';
    return {
      title: 'Préférences <em>· réglages communs à tous les projets</em>', ac: '#5a7fa3', html,
      after(body) {
        $$('[data-pref]', body).forEach((n) => n.addEventListener('click', () => {
          cur = +n.dataset.pref;
          $$('[data-pref]', body).forEach((x) => x.classList.toggle('on', x === n));
          $('[data-prefpane]', body).innerHTML = pane(cur);
          bind();
        }));
        let onlyMarked = false;
        function bind() {
          $$('.dlg-check', body).forEach((c) => c.addEventListener('click', () => {
            c.classList.toggle('on');
            if (c.hasAttribute('data-pfonly')) onlyMarked = c.classList.contains('on');
          }));
          $$('[data-pfmark]', body).forEach((m) => m.addEventListener('click', (e) => {
            e.stopPropagation();
            m.classList.toggle('on');
          }));
        }
        bind();
        $$('[data-pfstore]', body).forEach((b) => b.addEventListener('click', () => {
          const n = $$('[data-pfmark].on', body).length;
          if (onlyMarked && !n) { A.showToast('Aucun réglage marqué : cochez les cases à droite des lignes à stocker.', 'Préférences'); return; }
          A.showToast('Preset de préférences « Alpha ' + (onlyMarked ? '(' + n + ' réglages marqués)' : '(toutes les pages)') + ' » stocké.', 'Préférences');
        }));
        $$('[data-pfpreset]', body).forEach((b) => b.addEventListener('click', () => {
          const cycle = ['Alpha Standard', 'Nuendo 4 par défaut', 'Montage vidéo', 'Mixage surround'];
          const cur = cycle.indexOf(b.dataset.pfpreset);
          const nxt = cycle[(cur + 1) % cycle.length];
          b.dataset.pfpreset = nxt;
          b.textContent = nxt + ' ▾';
          A.showToast('Jeu de préférences « ' + nxt + ' » sélectionné.', 'Préférences');
        }));
        $$('.dlg-foot .w-btn', body).forEach((b) => b.addEventListener('click', () => {
          if (b.textContent === 'Réinitialiser') { A.showToast('Préférences réinitialisées (affichage).', 'Préférences'); return; }
          if (b.textContent === 'Appliquer') { A.showToast('Préférences appliquées au prototype.', 'Préférences'); return; }
          W.close('prefs');
        }));
      }
    };
  }

  function buildDevices() {
    /* Pages du dialogue, d’après le manuel : page « VST Audio System », pilote ASIO,
       périphériques MIDI, Video Player (sortie/format/frame offset), Remote et Quick Controls. */
    const R = (l, v, arr) => ({ t: 'row', l: l, v: v, arr: arr !== false });
    const C = (l, on) => ({ t: 'chk', l: l, on: on });
    const B = (l, k) => ({ t: 'btn', l: l, k: k });
    const DEV = [
      { name: 'VST Audio System', rows: [
        R('Pilote ASIO', 'Alpha ASIO Driver'), R('Fréquence d’échantillonnage', '48 000 Hz'),
        R('Taille de mémoire tampon', '256 échantillons'), R('Latence d’entrée', '5,333 ms'),
        R('Latence de sortie', '5,333 ms'), R('Horloge', 'Interne'),
        C('Relâcher le pilote en arrière-plan', false), C('Priorité audio (Boost)', true),
        C('Multi Processing', true), C('Monitoring direct', false),
        B('Panneau de configuration ASIO…', 'asio'), B('Réinitialiser', 'reset')
      ] },
      { name: 'Alpha ASIO Driver', rows: [
        R('Ports d’entrée', 'IN 1 – IN 8'), R('Ports de sortie', 'OUT 1 – OUT 8'),
        R('Entrée active', 'Analog 1–8'), R('Sortie active', 'Analog 1–8'),
        R('Source d’horloge', 'Word Clock'), R('Statut', 'Verrouillé'),
        C('Monitoring direct', true), B('Panneau de configuration…', 'asio')
      ] },
      { name: 'Alpha MIDI Input', rows: [
        R('Port d’entrée', 'Alpha MIDI In 1'), R('Filtre de canaux', 'Tous'),
        C('All MIDI Inputs', true), C('Afficher les messages en temps réel', false)
      ] },
      { name: 'Alpha MIDI Output', rows: [
        R('Port de sortie', 'Alpha MIDI Out 1'), R('Synchronisation', 'Aucune'),
        C('Envoyer l’horloge MIDI', false), C('Envoyer la position de morceau', false)
      ] },
      { name: 'Video Player', rows: [
        R('Sortie', 'Fenêtre à l’écran'), R('Format', 'Pal 720 × 576 · 25 ips'),
        R('Frame Offset', '0 image'), R('Moteur', 'DirectShow'),
        C('Utiliser les réglages haute qualité', false), C('Afficher les vignettes dans la piste', true),
        B('Panneau de configuration vidéo…', 'video')
      ] },
      { name: 'Remote · Alphatrack', rows: [
        R('Port', 'Alpha MIDI In 2'), R('Protocole', 'Generic Remote'),
        R('Banque', '1 à 4'), C('Suivre la piste sélectionnée', true),
        B('Apprendre (Learn)', 'learn')
      ] },
      { name: 'Quick Controls', rows: [
        R('Paramètres 1–8', 'Volume · Pan · Sends 1-4 · EQ'),
        R('Cible', 'Piste sélectionnée'), C('Envoyer les noms de paramètres', true),
        B('Learn', 'learn')
      ] }
    ];
    let cur = 0;
    const nav = () => DEV.map((d, i) =>
      '<div class="n' + (i === cur ? ' on' : '') + '" data-dev="' + i + '">' + d.name + '</div>').join('');
    const pane = () => {
      const d = DEV[cur];
      let acc = '';
      d.rows.forEach((r) => {
        if (r.t === 'row') acc += dlgRow(r.l, r.v, r.arr);
        else if (r.t === 'chk') acc += '<div class="dlg-check' + (r.on ? ' on' : '') + '" data-devchk><i></i><span>' + r.l + '</span></div>';
        else acc += '<div class="dv-actions"><button class="w-btn" data-devbtn="' + r.k + '">' + r.l + '</button></div>';
      });
      return '<h5>' + d.name + '</h5>' + acc +
        '<div class="hint" style="margin-top:8px">Les attributs en gris ne sont modifiables qu’audio arrêté.</div>';
    };
    const html =
      '<div class="dlg"><div class="dlg-body" style="display:flex;padding:0">' +
      '<div class="dlg-nav" data-devnav>' + nav() + '</div>' +
      '<div class="dlg-pane" data-devpane>' + pane() + '</div>' +
      '</div><div class="dlg-foot"><span class="hint">Périphériques ▸ Configuration des périphériques</span>' +
      btn('Ajouter…', '', ' data-devg="add"') + btn('Supprimer', '', ' data-devg="del"') +
      btn('Presets…', '', ' data-devg="presets"') + btn('Réinitialiser', '', ' data-devg="reset"') +
      btn('OK', 'on', ' data-devg="ok"') + '</div></div>';
    return {
      title: 'Configuration des périphériques <em>· Device Setup</em>', ac: '#4f7188', html,
      after(body) {
        function bindNav() {
          $$('[data-dev]', body).forEach((n) => n.addEventListener('click', () => {
            cur = +n.dataset.dev;
            $('[data-devnav]', body).innerHTML = nav();
            $('[data-devpane]', body).innerHTML = pane();
            bindNav();
          }));
          $$('[data-devchk]', body).forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));
          $$('[data-devbtn]', body).forEach((b) => b.addEventListener('click', () => {
            const k = b.dataset.devbtn;
            A.showToast(k === 'asio' ? 'Panneau de configuration du pilote ASIO (fourni par la carte).'
              : k === 'reset' ? 'Pilote réinitialisé (interface).'
              : k === 'video' ? 'Réglages vidéo : sortie, format, Frame Offset (Device Setup ▸ Video Player).'
              : 'Apprentissage des paramètres : bougez un contrôle sur le périphérique.', 'Device Setup');
          }));
        }
        bindNav();
        $$('[data-devg]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.devg;
          if (k === 'ok') { W.close('devices'); return; }
          if (k === 'add') { A.showToast('Ajouter un périphérique : MIDI, Remote, Video Player, Quick Controls…', 'Device Setup'); return; }
          if (k === 'del') { A.showToast('Retirer le périphérique sélectionné (« ' + DEV[cur].name + ' »).', 'Device Setup'); return; }
          if (k === 'presets') { A.showToast('Presets de configuration des périphériques (interface).', 'Device Setup'); return; }
          A.showToast('Configuration des périphériques réinitialisée (interface).', 'Device Setup');
        }));
      }
    };
  }

  /* =====================================================================
     6. COMMANDES CLAVIER  (éditeur de raccourcis)
     ===================================================================== */
  const KEYLIST = [
    ['Transport', 'Lecture / arrêt', 'Espace', 'play'],
    ['Transport', 'Arrêt', '0', 'stop'],
    ['Transport', 'Cycle', '/', 'cycle'],
    ['Transport', 'Métronome', 'C', 'click'],
    ['Transport', 'Panneau Transport', 'F2', 'transport'],
    ['Affichage', 'Mixer', 'F3', 'mix'],
    ['Affichage', 'Connexions VST', 'F4', 'conns'],
    ['Affichage', 'MediaBay', 'F5', 'mediabay'],
    ['Affichage', 'Loop Browser', 'F6', 'loops'],
    ['Affichage', 'Sound Browser', 'F7', 'sounds'],
    ['Affichage', 'Fenêtre vidéo', 'F8', 'video'],
    ['Affichage', 'Instruments VST', 'F11', 'vstinstr'],
    ['Affichage', 'Performances VST', 'F12', 'perf'],
    ['Édition', 'Accrochage', 'J', 'snap'],
    ['Projet', 'Marqueurs', 'Ctrl+M', 'markers'],
    ['Projet', 'Pool', 'Ctrl+P', 'pool'],
    ['Projet', 'Navigateur de projet', 'Ctrl+B', 'browser'],
    ['Projet', 'Éditeur de piste de tempo', 'Ctrl+T', 'tempo'],
    ['Projet', 'Configuration du projet', 'Maj+S', 'setup'],
    ['Édition', 'Réglages de canal', 'E', 'chan'],
    ['Édition', 'Éditeur d’échantillons', 'Ctrl+E', 'sample'],
    ['Affichage', 'Inspecteur', 'Alt+I', 'toggleInspector'],
    ['Affichage', 'Ligne d’aperçu', 'Alt+O', 'toggleOverview'],
    ['Affichage', 'Ligne d’info', 'Ctrl+I', 'toggleInfoline'],
    ['Affichage', 'Configuration des éléments', 'Alt+U', 'layout']
  ];

  let kcRec = null, kcBody = null;
  document.addEventListener('keydown', (e) => {
    if (kcRec === null) return;
    const body = kcBody;
    if (!body || !document.body.contains(body)) { kcRec = null; return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    const bNow = $('[data-kcb="' + kcRec + '"]', body);
    if (e.key === 'Escape') {
      if (bNow) { bNow.textContent = KEYLIST[kcRec][2]; bNow.classList.remove('rec'); }
      kcRec = null;
      return;
    }
    if (/^(Control|Shift|Alt|AltGraph|Meta|CapsLock|OS|Unidentified|Dead)$/.test(e.key)) return;
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Maj');
    const NAMES = { ' ': 'Espace', ArrowUp: 'Haut', ArrowDown: 'Bas', ArrowLeft: 'Gauche', ArrowRight: 'Droite',
      Delete: 'Suppr', Backspace: 'Retour', Enter: 'Entrée', Home: 'Début', End: 'Fin',
      PageUp: 'Page préc.', PageDown: 'Page suiv.', Insert: 'Inser', Tab: 'Tab' };
    let k = e.key.length === 1 ? e.key.toUpperCase() : (NAMES[e.key] || e.key);
    if (!k) { return; }
    const combo = mods.concat([k]).join('+');
    const old = KEYLIST[kcRec][2];
    KEYLIST[kcRec][2] = combo;
    if (bNow) { bNow.textContent = combo; bNow.classList.remove('rec'); }
    if (A.setKey) A.setKey(combo, KEYLIST[kcRec][3], old);
    A.showToast('Raccourci <b>' + combo + '</b> affecté à « ' + KEYLIST[kcRec][1] + ' ».', 'Commandes clavier');
    kcRec = null;
  }, true);

  const MACROS = [
    ['Voix — préparer la piste', '12 commandes'],
    ['Mixage — geler puis coller', '5 commandes'],
    ['Export — sélection et mixdown', '4 commandes'],
    ['Montage — couper aux localisateurs', '3 commandes']
  ];
  function buildKeyCmd() {
    const cats = [];
    KEYLIST.forEach((r) => { if (cats.indexOf(r[0]) < 0) cats.push(r[0]); });
    const keysOf = {};
    KEYLIST.forEach((r, i) => { keysOf[i] = r[2] ? r[2].split(' / ') : []; });
    let sel = 0;

    function rowsHtml() {
      return cats.map((c) => {
        const body = KEYLIST.map((r, i) => ({ r, i })).filter((x) => x.r[0] === c).map((x) =>
          '<tr data-kc="' + x.i + '"' + (x.i === sel ? ' class="sel"' : '') + '><td>' + x.r[1] + '</td>' +
          '<td class="k"><span class="keybtn" data-kcb="' + x.i + '">' + (keysOf[x.i].join(' / ') || '—') + '</span></td></tr>').join('');
        return '<tbody data-kcgroup><tr class="kc-cat"><td colspan="2"><span class="kcf" data-kcf="' + c + '">−</span>' + c +
          ' <em>(' + (KEYLIST.filter((r) => r[0] === c).length) + ')</em></td></tr>' + body + '</tbody>';
      }).join('');
    }
    const html =
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Rechercher</span>' +
      '<input class="w-input" data-kcsearch placeholder="nom de la commande…" style="width:190px">' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-kcexp="all" title="Développer tous les dossiers">(+) Tout</button>' +
      '<button class="w-btn" data-kcexp="none" title="Réduire tous les dossiers">(−) Tout</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Jeu de commandes</span>' +
      '<button class="w-btn" data-kcstore="1" title="Stocker un jeu de commandes">Stocker…</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-kcreset="1" title="Rétablir tous les raccourcis d’origine">Réinitialiser</button>' +
      '</div>' +
      '<div class="kc"><div class="kc-wrap">' +
      '<div class="kc-left"><div class="w-scroll"><table><thead><tr><th>Commande</th><th style="width:126px">Touches</th></tr></thead>' +
      '<tbody data-kctb>' + rowsHtml() + '</tbody></table></div></div>' +
      '<div class="kc-right">' +
      '<div class="kc-h">Touches affectées</div>' +
      '<div class="kc-keys" data-kckeys></div>' +
      '<div class="kc-field"><span>Type in Key</span><input class="w-input" data-kckey readonly placeholder="appuyez sur une touche"></div>' +
      '<div class="kc-acts"><button class="w-btn" data-kcassign="1" title="Affecter la touche à la commande sélectionnée">Assigner</button>' +
      '<button class="w-btn" data-kcdelete="1" title="Supprimer la touche sélectionnée">Supprimer</button></div>' +
      '<div class="kc-h">Configuration</div>' +
      '<div class="kc-cfg"><label><input type="checkbox" data-kccfg="on" checked> Page Configuration active</label>' +
      '<label><input type="checkbox" data-kccfg="nav"> Touches de navigation</label>' +
      '<label><input type="checkbox" data-kccfg="num"> Pavé numérique</label>' +
      '<label><input type="checkbox" data-kccfg="multi" checked> Plusieurs touches par fonction</label></div>' +
      '<div class="kc-h">Jeux de commandes</div>' +
      '<div class="kc-presets"><button class="w-btn" data-kcpre="Alpha">Alpha</button>' +
      '<button class="w-btn" data-kcpre="Nuendo 4">Nuendo 4</button>' +
      '<button class="w-btn" data-kcpre="Par défaut">Par défaut</button>' +
      '<button class="w-btn" data-kcprestore="1" title="Enregistrer, importer ou exporter un jeu de commandes">Gérer ▾</button></div>' +
      '<div class="kc-h">Macros</div>' +
      '<div class="kc-maclist" data-kcmaclist>' +
      MACROS.map((m, i) => '<div class="kc-macro' + (i === 0 ? ' sel' : '') + '" data-kcmac="' + i + '">' +
        '<b>' + m[0] + '</b><span>' + m[1] + '</span></div>').join('') +
      '</div>' +
      '<div class="kc-presets" style="margin-top:4px">' +
      '<button class="w-btn" data-kcmacact="new">Nouvelle macro…</button>' +
      '<button class="w-btn" data-kcmacact="edit">Éditer…</button>' +
      '<button class="w-btn" data-kcmacact="del">Supprimer</button></div>' +
      '</div></div></div>' +
      '<div class="aw-foot"><span>Commandes clavier — cliquez une commande, saisissez la touche, puis Assigner</span>' +
      '<span style="flex:1"></span><span data-kcinfo>' + KEYLIST.length + ' commandes · ' + cats.length + ' dossiers</span></div>';
    return {
      title: 'Commandes clavier <em>· Key Commands</em>', ac: '#6f7d86', html,
      after(body) {
        let keySel = 0;
        function drawKeys() {
          const box = $('[data-kckeys]', body);
          box.innerHTML = keysOf[sel].length
            ? keysOf[sel].map((k, i) => '<div class="krow' + (i === keySel ? ' sel' : '') + '" data-kkey="' + i + '">' + k + '</div>').join('')
            : '<div class="krow empty">Aucune touche affectée</div>';
          $$('[data-kkey]', body).forEach((r) => r.addEventListener('click', () => {
            keySel = +r.dataset.kkey;
            $$('[data-kkey]', body).forEach((x) => x.classList.toggle('sel', x === r));
          }));
        }
        function drawRows() {
          $('[data-kctb]', body).innerHTML = rowsHtml();
          bindRows();
        }
        function bindRows() {
          $$('[data-kc]', body).forEach((tr) => tr.addEventListener('click', () => {
            sel = +tr.dataset.kc; keySel = 0;
            $$('[data-kc]', body).forEach((x) => x.classList.toggle('sel', x === tr));
            drawKeys();
            $('[data-kckey]', body).value = '';
          }));
          $$('[data-kcf]', body).forEach((f) => f.addEventListener('click', (e) => {
            e.stopPropagation();
            const tb = f.closest('tbody');
            const hide = f.textContent === '−';
            [...tb.children].forEach((tr) => { if (!tr.classList.contains('kc-cat')) tr.style.display = hide ? 'none' : ''; });
            f.textContent = hide ? '+' : '−';
          }));
        }
        bindRows(); drawKeys();

        /* capture de touche */
        const inp = $('[data-kckey]', body);
        inp.addEventListener('keydown', (e) => {
          e.preventDefault();
          const mods = [];
          if (e.ctrlKey) mods.push('Ctrl');
          if (e.altKey) mods.push('Alt');
          if (e.shiftKey) mods.push('Maj');
          let k = e.key;
          if (k === ' ') k = 'Espace';
          else if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta') k = '';
          else if (k.length === 1) k = k.toUpperCase();
          if (!k) return;
          inp.value = mods.concat([k]).join('+');
        });
        $('[data-kcassign]', body).addEventListener('click', () => {
          const v = inp.value.trim();
          if (!v) { A.showToast('Saisissez d’abord une touche dans le champ « Type in Key ».', 'Commandes clavier'); return; }
          if (keysOf[sel].indexOf(v) < 0) keysOf[sel].push(v);
          inp.value = '';
          if (A.setKey) A.setKey(v, KEYLIST[sel][3], KEYLIST[sel][2]);
          KEYLIST[sel][2] = keysOf[sel].join(' / ');
          drawKeys(); drawRows();
          A.showToast('« ' + v + ' » affecté à « ' + KEYLIST[sel][1] + ' ».', 'Commandes clavier');
        });
        $('[data-kcdelete]', body).addEventListener('click', () => {
          if (!keysOf[sel].length) { A.showToast('Aucune touche à supprimer.', 'Commandes clavier'); return; }
          const k = keysOf[sel].splice(Math.min(keySel, keysOf[sel].length - 1), 1)[0];
          keySel = 0;
          if (A.setKey && k) A.setKey('', KEYLIST[sel][3], k);
          KEYLIST[sel][2] = keysOf[sel].join(' / ');
          drawKeys(); drawRows();
          A.showToast('« ' + k + ' » retiré de « ' + KEYLIST[sel][1] + ' ».', 'Commandes clavier');
        });
        $$('[data-kcexp]', body).forEach((b) => b.addEventListener('click', () => {
          const open = b.dataset.kcexp === 'all';
          $$('.kc-cat', body).forEach((tr) => {
            const tb = tr.parentNode;
            [...tb.children].forEach((x) => { if (!x.classList.contains('kc-cat')) x.style.display = open ? '' : 'none'; });
          });
          $$('[data-kcf]', body).forEach((f) => { f.textContent = open ? '−' : '+'; });
        }));
        const si = $('[data-kcsearch]', body);
        si.addEventListener('input', () => {
          const q = si.value.toLowerCase().trim();
          let n = 0;
          $$('[data-kc]', body).forEach((tr) => {
            const ok = !q || tr.textContent.toLowerCase().indexOf(q) >= 0;
            tr.style.display = ok ? '' : 'none';
            if (ok) n++;
          });
          $$('.kc-cat', body).forEach((tr) => {
            const tb = tr.parentNode;
            const vis = [...tb.querySelectorAll('tr[data-kc]')].some((x) => x.style.display !== 'none');
            tr.style.display = vis ? '' : 'none';
          });
          $('[data-kcinfo]', body).textContent = n + ' commandes affichées';
        });
        $('[data-kcstore]', body).addEventListener('click', () => {
          A.showToast('Jeu de commandes stocké : « Alpha ' + new Date().toLocaleDateString('fr-FR') + ' » (liste des affectations).', 'Commandes clavier');
        });
        $('[data-kcreset]', body).addEventListener('click', () => {
          KEYLIST.forEach((r, i) => { keysOf[i] = r[2] ? r[2].split(' / ') : []; });
          if (A.keymap) Object.keys(A.keymap).forEach((k) => { delete A.keymap[k]; });
          if (A.ACTIONS && !Array.isArray(A.ACTIONS)) {
            Object.keys(A.ACTIONS).forEach((id) => {});
          }
          drawRows(); drawKeys();
          A.showToast('Tous les raccourcis rétablis à leur valeur d’origine.', 'Commandes clavier');
        });
        $$('[data-kcpre]', body).forEach((b) => b.addEventListener('click', () => {
          $$('[data-kcpre]', body).forEach((x) => x.classList.toggle('on', x === b));
          A.showToast('Jeu de commandes « ' + b.dataset.kcpre + ' » chargé (affichage).', 'Commandes clavier');
        }));
        /* Gérer : enregistrer sous, supprimer, importer, exporter */
        const gb = $('[data-kcprestore]', body);
        if (gb) gb.addEventListener('click', () => {
          const oldm = document.getElementById('kcPreMenu');
          if (oldm) { oldm.remove(); return; }
          const m = document.createElement('div');
          m.id = 'kcPreMenu';
          m.style.cssText = 'position:fixed;z-index:9250;background:linear-gradient(#4a4f54,#3a3f44);border:1px solid #22262a;' +
            'border-radius:3px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.7 Verdana,Tahoma,sans-serif;color:#e2e7ea;min-width:186px';
          m.innerHTML = [['save', 'Enregistrer sous…'], ['del', 'Supprimer le jeu'], ['imp', 'Importer…'], ['exp', 'Exporter…']]
            .map((it) => '<div data-kcpm="' + it[0] + '">' + it[1] + '</div>').join('');
          const r = gb.getBoundingClientRect();
          m.style.left = Math.min(r.left, window.innerWidth - 200) + 'px';
          m.style.top = Math.min(r.bottom + 2, window.innerHeight - 120) + 'px';
          document.body.appendChild(m);
          m.addEventListener('click', (e) => {
            const t = e.target.closest('[data-kcpm]');
            if (!t) return;
            m.remove();
            const MSG = {
              save: 'Jeu de commandes enregistré sous le nom « Alpha ' + new Date().toLocaleDateString('fr-FR') + ' » (.xml dans le dossier des préférences).',
              del: 'Jeu de commandes supprimé ; le jeu « Alpha » par défaut reste disponible.',
              imp: 'Import d’un jeu de commandes (.xml) : les raccourcis du fichier remplacent ceux du jeu actif.',
              exp: 'Export du jeu de commandes actif vers un fichier .xml.'
            };
            A.showToast(MSG[t.dataset.kcpm], 'Commandes clavier');
          });
        });
        /* macros */
        $$('[data-kcmac]', body).forEach((r) => r.addEventListener('click', () => {
          $$('[data-kcmac]', body).forEach((x) => x.classList.toggle('sel', x === r));
        }));
        $$('[data-kcmacact]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.kcmacact;
          const list = $('[data-kcmaclist]', body);
          const cur = $('[data-kcmac].sel', body);
          if (k === 'new') {
            const n = document.createElement('div');
            n.className = 'kc-macro sel';
            n.dataset.kcmac = String(list.children.length);
            n.innerHTML = '<b>Nouvelle macro ' + (list.children.length + 1) + '</b><span>0 commande</span>';
            $$('[data-kcmac]', body).forEach((x) => x.classList.remove('sel'));
            list.appendChild(n);
            n.addEventListener('click', () => {
              $$('[data-kcmac]', body).forEach((x) => x.classList.toggle('sel', x === n));
            });
            A.showToast('Macro créée : ajoutez des commandes dans l’ordre (elles s’exécutent ensuite à la suite, sur une seule touche).', 'Commandes clavier');
            return;
          }
          if (!cur) { A.showToast('Sélectionnez d’abord une macro.', 'Commandes clavier'); return; }
          if (k === 'del') {
            cur.remove();
            A.showToast('Macro supprimée.', 'Commandes clavier');
            return;
          }
          A.showToast('Éditeur de macro « ' + cur.querySelector('b').textContent + ' » : liste ordonnée des commandes, ajout par catégorie, déplacement, suppression.', 'Commandes clavier');
        }));
        $$('[data-kccfg]', body).forEach((c) => c.addEventListener('change', () => {
          A.showToast('Option de configuration « ' + c.parentNode.textContent.trim() + ' » : ' + (c.checked ? 'activée' : 'désactivée') + '.', 'Commandes clavier');
        }));
      }
    };
  }

  /* =====================================================================
     7. FENÊTRE VIDÉO  (F8)
     ===================================================================== */
  function buildVideo() {
    const st = { hq: false, aot: false, showTc: true, editMode: false, size: '100 %', ofs: 0, mute: false };
    const SIZES = ['25 %', '50 %', '75 %', '100 %', '200 %', 'Ajuster à la fenêtre'];
    const html =
      '<div class="vid">' +
      '<div class="screen"><div class="bars top"></div><div class="bars bot"></div>' +
      '<div class="rec"><i></i>' + 'NO SIGNAL' + '</div>' +
      '<div class="frame-info"><b>Aucune vidéo chargée</b><span>Importez un film par Fichier ▸ Importer ▸ Vidéo (étape 2)</span>' +
      '<em data-vmute hidden>Mute Video — lecture vidéo suspendue</em></div>' +
      '<div class="tc-lbl">Timecode</div><div class="tc" data-vtc>00:00:16:00</div></div>' +
      '<div class="vid-tools">' +
      btn('▶', '', ' data-vplay="1"') + btn('■', '', ' data-vstop="1"') +
      btn('◀', '', ' data-vframe="-1" title="Image précédente"') + btn('▶', '', ' data-vframe="1" title="Image suivante"') +
      '<span class="w-field" style="min-width:96px;margin-left:6px" data-vtc2>00:00:16:00</span>' +
      '<span class="w-sep"></span><span class="w-lbl">Décalage (ips)</span>' +
      '<button class="w-btn" data-vofs="-1">−</button><span class="w-field" style="min-width:34px" data-vofsval>0</span><button class="w-btn" data-vofs="1">+</button>' +
      '<span class="w-sep"></span>' + btn('Éditer le mode', '', ' data-vedit="1" title="Le curseur projet suit les sélections et les éditions"') +
      '<span class="grow"></span>' + btn('F8', '', ' title="Raccourci de la fenêtre vidéo"') + '</div>' +
      '<div class="vid-tools">' + btn('Haute qualité', '', ' data-vhq="1" title="QuickTime : affichage plus net, charge CPU plus élevée"') +
      btn('Taille · 100 %', '', ' data-vsize="1" title="Menu contextuel Size"') +
      btn('Plein écran', '', ' data-vfull="1" title="Full Screen Mode — Échap pour sortir"') +
      btn('Toujours au-dessus', '', ' data-vaot="1" title="Always on Top"') +
      btn('Afficher le TC', '', ' data-vtcshow="1"') +
      '<span class="grow"></span><span style="font-size:8px;color:#9fb0bd">25 ips · Onscreen Window</span></div>' +
      '</div>' +
      '<div class="aw-foot"><span>Fenêtre vidéo — sortie : fenêtre à l’écran</span><span style="flex:1"></span>' +
      '<span>Clic droit : Haute qualité · Taille · Plein écran · Toujours au-dessus</span></div>';
    return {
      title: 'Vidéo <em>· Video player</em>', ac: '#4a5560', html,
      after(body, w) {
        const tc = $('[data-vtc]', body), tc2 = $('[data-vtc2]', body);
        let fr = 0;
        ticker(() => {
          if (!tc.isConnected) return false;
          const s = (A.state ? A.state.pos - 1 : 0) * 2;
          const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), f = Math.floor((s - Math.floor(s)) * 25);
          const t = [h, m, sec, f].map((n) => String(n).padStart(2, '0')).join(':');
          tc.textContent = st.showTc ? t : '--:--:--:--';
          tc2.textContent = t;
          return true;
        }, 300);
        $$('[data-vplay]', body).forEach((b) => b.addEventListener('click', () => {
          if (A.ACTIONS && A.ACTIONS.play) A.ACTIONS.play();
        }));
        $$('[data-vstop]', body).forEach((b) => b.addEventListener('click', () => {
          if (A.ACTIONS && A.ACTIONS.stop) A.ACTIONS.stop();
        }));
        $$('[data-vframe]', body).forEach((b) => b.addEventListener('click', () => {
          fr += parseInt(b.dataset.vframe, 10);
          A.showToast('Déplacement de ' + b.dataset.vframe + ' image (25 ips) — décodeur non branché (étape 2).', 'Vidéo');
        }));
        $$('[data-vofs]', body).forEach((b) => b.addEventListener('click', () => {
          st.ofs += parseInt(b.dataset.vofs, 10);
          $('[data-vofsval]', body).textContent = st.ofs;
          A.showToast('Décalage image : ' + st.ofs + ' ips (Device Setup ▸ Video Player ▸ Frame Offset).', 'Vidéo');
        }));
        /* Haute qualité, toujours au-dessus, TC, Éditer le mode */
        const HQ = $('[data-vhq]', body);
        HQ.addEventListener('click', () => {
          st.hq = !st.hq; HQ.classList.toggle('on', st.hq);
          A.showToast('Haute qualité ' + (st.hq ? 'activée (QuickTime) — charge CPU plus élevée' : 'désactivée') + '.', 'Vidéo');
        });
        const AOT = $('[data-vaot]', body);
        AOT.addEventListener('click', () => {
          st.aot = !st.aot; AOT.classList.toggle('on', st.aot);
          if (w.el) { w.aot = st.aot; if (W.setAoT) W.setAoT(w, st.aot); }
          A.showToast('Toujours au-dessus ' + (st.aot ? 'activé' : 'désactivé') + '.', 'Vidéo');
        });
        const TS = $('[data-vtcshow]', body);
        TS.addEventListener('click', () => {
          st.showTc = !st.showTc; TS.classList.toggle('on', !st.showTc);
          A.showToast('Affichage du timecode dans l’image ' + (st.showTc ? 'activé' : 'masqué') + '.', 'Vidéo');
        });
        const EM = $('[data-vedit]', body);
        EM.addEventListener('click', () => {
          st.editMode = !st.editMode; EM.classList.toggle('on', st.editMode);
          A.showToast('Éditer le mode ' + (st.editMode ? 'activé : le curseur suit les éditions' : 'désactivé') + '.', 'Vidéo');
        });
        /* Menu Size */
        const SZ = $('[data-vsize]', body);
        SZ.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const old = document.getElementById('vidSize'); if (old) old.remove();
          const d = document.createElement('div');
          d.id = 'vidSize';
          d.style.cssText = 'position:fixed;z-index:99999;min-width:150px;padding:3px;border:1px solid #14171a;border-radius:3px;' +
            'background:linear-gradient(#40454a,#2f3337);box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.5 Tahoma,sans-serif';
          d.innerHTML = SIZES.map((sz) => '<div data-vsz="' + sz + '" style="padding:3px 8px;border-radius:2px;cursor:pointer;color:' +
            (sz === st.size ? '#fff' : '#cfd6db') + ';background:' + (sz === st.size ? '#3c6088' : 'transparent') + '">' + sz + '</div>').join('');
          document.body.appendChild(d);
          const r = SZ.getBoundingClientRect();
          d.style.left = Math.round(r.left) + 'px';
          d.style.top = Math.round(r.bottom + 2) + 'px';
          $$('[data-vsz]', d).forEach((it) => {
            it.addEventListener('mouseenter', () => { it.style.background = '#3c6088'; });
            it.addEventListener('mouseleave', () => { if (it.dataset.vsz !== st.size) it.style.background = 'transparent'; });
            it.addEventListener('click', () => {
              st.size = it.dataset.vsz;
              SZ.textContent = 'Taille · ' + st.size;
              const base = [560, 315];
              const pct = parseInt(st.size, 10) || 100;
              if (w.el) {
                if (st.size === 'Ajuster à la fenêtre') { W.fitWindow && W.fitWindow(w, true); }
                else {
                  const s2 = Math.max(25, Math.min(200, pct)) / 100;
                  w.el.style.width = Math.round((base[0] + 120) * s2) + 'px';
                  w.el.style.height = Math.round((base[1] + 140) * s2) + 'px';
                  W.fitWindow && W.fitWindow(w, true);
                }
              }
              d.remove();
              A.showToast('Taille de la fenêtre vidéo : ' + st.size + ' (menu contextuel « Size »).', 'Vidéo');
            });
          });
          setTimeout(() => document.addEventListener('click', function kill() {
            const x = document.getElementById('vidSize'); if (x) x.remove();
            document.removeEventListener('click', kill);
          }, 0), 0);
        });
        $$('[data-vfull]', body).forEach((b) => b.addEventListener('click', () => W.toggleMaxById(w.id)));
      }
    };
  }

  /* =====================================================================
     8. CONTROL ROOM (Mixer / Vue d'ensemble / Studios)
     ===================================================================== */
  function buildCroom() {
    const MON = [
      ['MON A', 'Enceintes principales', '-2,0', 64],
      ['MON B', 'Enceintes de contrôle', '-6,0', 42],
      ['PHONES', 'Casque ingénieur', '-12,0', 26],
      ['MAIN', 'Sortie stéréo', '0,0', 72]
    ];
    const html =
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Écoute</span>' +
      '<button class="w-btn on" data-crmon="A" title="Monitor A — enceintes principales">MON A</button>' +
      '<button class="w-btn" data-crmon="B" title="Monitor B — enceintes de contrôle">MON B</button>' +
      '<button class="w-btn" data-crmon="C" title="Monitor C — enceintes proches">MON C</button>' +
      '<button class="w-btn" data-crmon="PH" title="Casque ingénieur">Casque</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn on" data-crexcl="1" title="Un seul monitor à la fois (exclusif)">Exclusif</button>' +
      '<button class="w-btn" data-cr="talk" title="Talkback vers les studios">Talkback</button>' +
      '<button class="w-btn" data-cr="listen" title="Listen — écoute d’un canal isolé">Listen</button>' +
      '<button class="w-btn" data-cr="dim" title="Dim — atténuation temporaire">Dim</button>' +
      '<button class="w-btn" data-cr="mono" title="Somme mono">Mono</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Dim</span><button class="w-btn" data-crval="dim">−20 dB ▾</button>' +
      '<span class="w-lbl">Talkback</span><button class="w-btn" data-crval="talk">−6 dB ▾</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-cr="recall" title="Rappeler les niveaux mémorisés">Recall</button>' +
      '<button class="w-btn" data-cr="config" title="Configurer les studios et les cues">Studios…</button>' +
      '</div>' +
      '<div class="cr">' +
      '<div style="display:flex;min-height:0;flex:1">' +
      MON.map((m) => '<div class="cr-strip"><span class="n">' + m[0] + '</span><span class="sub">' + m[1] + '</span>' +
        '<div class="cr-fadrow">' +
        '<div class="cr-meter"><div class="meter"><i style="--lvl:' + (m[3] - 8) + '%"></i></div></div>' +
        '<div class="cr-fad"><div class="trk"></div><div class="cap" style="bottom:calc(' + (m[3] - 6) + '% - 6px)"></div></div>' +
        '</div>' +
        '<div class="cr-db">' + m[2] + '</div>' +
        '<div class="cr-btns"><span class="tiny">M</span><span class="tiny">S</span><span class="tiny">R</span></div></div>').join('') +
      '<div class="cr-main">' +
      '<div class="cr-card"><h5>Moniteurs et casque</h5>' +
      ['Monitor A — Enceintes principales', 'Monitor B — Enceintes de contrôle', 'Monitor C — Enceintes proches', 'Phones 1 — Casque ingénieur'].map((n, i) =>
        '<div class="row" data-crrow="' + i + '"><span class="nm" style="cursor:pointer" data-crsel="' + i + '" title="Glisser pour régler le niveau">' + n + '</span>' +
        '<span class="bar" data-crbar="' + i + '"><i style="--v:' + (64 - i * 14) + '%"></i></span>' +
        '<span class="v">' + (['-2,0 dB', '-6,0 dB', '-8,0 dB', '-12,0 dB'][i]) + '</span>' +
        '<button class="w-btn on" data-crmute="' + i + '" title="Couper ce monitor">M</button></div>').join('') +
      '<div class="row"><span class="nm">Niveau de référence</span><span class="bar"><i style="--v:72%"></i></span><span class="v">-18,0 dB</span></div>' +
      '</div>' +
      '<div class="cr-card"><h5>Studio 1 — retours</h5>' +
      ['Studio 1 — Cue 1', 'Studio 1 — Cue 2', 'Studio 2 — Cue 1'].map((n, i) =>
        '<div class="row"><span class="nm">' + n + '</span><span class="bar"><i style="--v:' + (62 - i * 14) + '%"></i></span><span class="v">' + dbTxt(-6 - i * 3) + '</span></div>').join('') +
      '<div class="row"><span class="nm">Talkback vers Studio 1</span><span class="bar"><i style="--v:48%"></i></span><span class="v">-9,0 dB</span></div>' +
      '</div>' +
      '<div class="cr-card"><h5>Entrées externes</h5>' +
      ['Entrée externe 1 — lecteur CD', 'Entrée externe 2 — platine'].map((n) =>
        '<div class="row"><span class="nm">' + n + '</span><span class="bar"><i style="--v:0%"></i></span><span class="v">—</span></div>').join('') +
      '</div>' +
      '<div class="cr-card"><h5>Affectations — Connexions VST ▸ Studio</h5>' +
      [['MON A', 'OUT 15 / OUT 16'], ['MON B', 'OUT 17 / OUT 18'], ['PHONES', 'OUT 19 / OUT 20'],
       ['MAIN', 'OUT 1 / OUT 2'], ['Talkback', 'IN 8 — micro régie']].map((r) =>
        '<div class="row"><span class="nm">' + r[0] + '</span><span class="bar"><i style="--v:100%;background:linear-gradient(#b9b7b1,#9b9993)"></i></span><span class="v" style="width:96px">' + r[1] + '</span></div>').join('') +
      '</div>' +
      '</div></div>' +
      '</div>' +
      '<div class="aw-foot"><span>Mixer Control Room</span><span style="flex:1"></span><span>Monitors · Phones · Studio · Talkback · Listen · Dim · Mono</span></div>';
    return {
      title: 'Mixer Control Room <em>· monitoring</em>', ac: '#6f7d86', html,
      after(body) {
        let excl = true;
        $$('[data-cr]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.cr;
          if (k === 'recall') {
            A.showToast('Recall : niveaux de monitoring rappelés (MON A −2,0 dB, MON B −6,0 dB, casque −12,0 dB).', 'Control Room');
            return;
          }
          if (k === 'config') {
            A.showToast('Configurer les studios : nom, sorties, cues et talkback — page Connexions VST ▸ Studio.', 'Control Room');
            return;
          }
          b.classList.toggle('on');
          const on = b.classList.contains('on');
          const L = { talk: 'Talkback', listen: 'Listen', dim: 'Dim', mono: 'Mono' }[k];
          if (k === 'dim') $$('[data-crrow] .bar i', body).forEach((i2) => { i2.style.opacity = on ? '.45' : ''; });
          A.showToast(L + ' ' + (on ? 'activé' : 'désactivé') + ' (monitoring simulé).', 'Control Room');
        }));
        $$('[data-crmon]', body).forEach((b) => b.addEventListener('click', () => {
          if (excl) $$('[data-crmon]', body).forEach((x) => x.classList.toggle('on', x === b));
          else b.classList.toggle('on');
          $$('[data-crmon]', body).forEach((x) => {
            const i = ['A', 'B', 'C', 'PH'].indexOf(x.dataset.crmon);
            const row = $('[data-crrow="' + i + '"]', body);
            if (row) row.style.background = x.classList.contains('on') ? 'rgba(120,170,220,.22)' : '';
          });
          A.showToast('Écoute sur ' + b.textContent + '.', 'Control Room');
        }));
        $$('[data-crexcl]', body).forEach((b) => b.addEventListener('click', () => {
          excl = !excl;
          b.classList.toggle('on', excl);
          A.showToast('Sélection des monitors : ' + (excl ? 'exclusive (un seul à la fois)' : 'multiple') + '.', 'Control Room');
        }));
        $$('[data-crmute]', body).forEach((b) => b.addEventListener('click', () => {
          b.classList.toggle('on');
          const i = b.dataset.crmute;
          $('[data-crbar="' + i + '"] i', body).style.opacity = b.classList.contains('on') ? '' : '.25';
        }));
        $$('[data-crval]', body).forEach((b) => b.addEventListener('click', () => {
          const CYC = { dim: ['−20 dB', '−10 dB', '−30 dB', '−40 dB'], talk: ['−6 dB', '0,0 dB', '−12 dB'] };
          const k = b.dataset.crval;
          const cur = CYC[k].indexOf(b.textContent.replace(' ▾', ''));
          const nx = CYC[k][(cur + 1) % CYC[k].length];
          b.textContent = nx + ' ▾';
          A.showToast((k === 'dim' ? 'Atténuation Dim' : 'Niveau Talkback') + ' : ' + nx + '.', 'Control Room');
        }));
        $$('[data-crsel]', body).forEach((nm) => nm.addEventListener('click', () => {
          const i = +nm.dataset.crsel;
          const w = $('[data-crbar="' + i + '"]', body);
          w.style.cursor = 'ew-resize';
          w.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const r = w.getBoundingClientRect();
            const set = (ev) => {
              const v = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
              $('i', w).style.setProperty('--v', v + '%');
            };
            set(e);
            const mv = (ev) => set(ev);
            const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', mv);
            window.addEventListener('pointerup', up);
          });
        }));
      }
    };
  }

  /* =====================================================================
     9. EXPORT AUDIO MIXDOWN
     ===================================================================== */
  function buildExport() {
    /* Export Audio Mixdown — Nuendo 4 : Emplacement du fichier, Format de
       fichier, Sortie du moteur audio (avec export temps réel + audition),
       Import dans le projet, Fermer après export. */
    const FMT = {
      'Wave (.wav)': { ext: 'wav', bits: true, samp: true, dith: true, bwf: true, extra: '' },
      'Broadcast Wave (.wav)': { ext: 'wav', bits: true, samp: true, dith: true, bwf: true, extra: 'Chunk BWF' },
      'AIFF (.aif)': { ext: 'aif', bits: true, samp: true, dith: true, bwf: false, extra: '' },
      'AIFC (.aifc)': { ext: 'aifc', bits: true, samp: true, dith: true, bwf: false, extra: 'Compression 6:1 max' },
      'Wave64 (.w64)': { ext: 'w64', bits: true, samp: true, dith: true, bwf: false, extra: '> 2 Go' },
      'MPEG 1 Layer 3 (.mp3)': { ext: 'mp3', bits: false, samp: true, dith: false, bwf: false, extra: 'Débit 192 kb/s · ID3' },
      'Ogg Vorbis (.ogg)': { ext: 'ogg', bits: false, samp: true, dith: false, bwf: false, extra: 'Qualité 0,7' },
      'Windows Media Audio Pro (.wma)': { ext: 'wma', bits: false, samp: true, dith: false, bwf: false, extra: 'Débit 192 kb/s' }
    };
    const BUS = ['Stéréo Out', 'Bus Drums', 'FX 1 · Réverb Space', 'Voix lead', 'Basses', 'Metronome'];
    const st = {
      name: 'Démo_Alpha_01_mix', path: 'Alpha/Audio/Mixdown', useProj: true,
      fmt: 'Broadcast Wave (.wav)', samp: '48 000 Hz', bits: '24 bit', dith: 'Aucun',
      bwf: true, outputs: 'Stéréo Out', mono: false, split: false,
      rt: false, upd: false, pool: true, track: true, close: false, audition: '0,0 dB'
    };
    const REFRESH = ['Normaliser', 'Post-traitement'];
    const row = (lbl, val) => dlgRow(lbl, val, true);
    const sec = (t) => '<h5 style="margin:9px 0 5px;font-size:9px;letter-spacing:.7px;text-transform:uppercase;color:#33322d;' +
      'border-bottom:1px solid #c9c7c1;padding-bottom:2px">' + t + '</h5>';
    const html = () =>
      '<div class="dlg"><div class="dlg-body" style="display:block;overflow:auto;padding:9px 11px">' +
      sec('Emplacement du fichier') +
      row('Nom du fichier', st.name) +
      row('Chemin', st.path) +
      '<div style="display:flex;align-items:center;gap:6px;margin:2px 0 0">' +
      '<span class="dlg-check' + (st.useProj ? ' on' : '') + '" data-ex="useProj"><i></i>Utiliser le dossier audio du projet</span>' +
      '<span class="hint" style="font-size:8px;color:#5c5a54">→ Alpha_Audio/Mixdown</span></div>' +
      sec('Format de fichier') +
      row('Format', st.fmt) +
      '<div class="ex-fmt" style="display:flex;gap:5px;align-items:center;margin:1px 0 4px 96px">' +
      '<span class="dlg-check' + (st.bwf ? ' on' : '') + '" data-ex="bwf" style="margin:0"><i></i>Insérer le chunk Broadcast Wave</span>' +
      '<button class="w-btn" data-ex="editfmt" title="Éditer les informations du chunk / de la balise">Éditer…</button>' +
      '<span class="hint" style="font-size:7.5px;color:#6b6961">' + (FMT[st.fmt].extra || '—') + '</span></div>' +
      (FMT[st.fmt].samp ? row('Taux d’échantillonnage', st.samp) : '') +
      (FMT[st.fmt].bits ? row('Profondeur de bit', st.bits) : '') +
      (FMT[st.fmt].dith ? row('Dithering', st.dith) : '') +
      sec('Sortie du moteur audio') +
      row('Sorties', st.outputs) +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:2px 0 2px 96px">' +
      '<span class="dlg-check' + (st.mono ? ' on' : '') + '" data-ex="mono" style="margin:0"><i></i>Export mono</span>' +
      '<span class="dlg-check' + (st.split ? ' on' : '') + '" data-ex="split" style="margin:0"><i></i>Diviser les canaux</span></div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin:3px 0 0 96px">' +
      '<span class="dlg-check' + (st.rt ? ' on' : '') + '" data-ex="rt" style="margin:0"><i></i>Export en temps réel</span>' +
      '<span class="hint" style="font-size:7.5px;color:#6b6961">Volume d’audition</span>' +
      '<input type="range" min="-60" max="6" value="0" data-exaud style="width:86px">' +
      '<span class="w-lbl" data-exaudval>' + st.audition + '</span></div>' +
      '<div style="margin:3px 0 0 96px">' +
      '<span class="dlg-check' + (st.upd ? ' on' : '') + '" data-ex="upd" style="margin:0"><i></i>Mettre à jour l’affichage</span></div>' +
      sec('Importer dans le projet') +
      '<div style="display:flex;gap:10px;margin:0 0 3px 96px">' +
      '<span class="dlg-check' + (st.pool ? ' on' : '') + '" data-ex="pool" style="margin:0"><i></i>Pool</span>' +
      '<span class="dlg-check' + (st.track ? ' on' : '') + '" data-ex="track" style="margin:0"><i></i>Piste audio</span></div>' +
      '<div class="hint" style="font-size:7.5px;color:#6b6961;margin:0 0 2px 96px">' +
      (st.track ? 'La piste audio est créée au localisateur gauche (9).' : 'Le clip est ajouté au Pool uniquement.') + '</div>' +
      '<div style="margin:4px 0 0 96px">' +
      '<span class="dlg-check' + (st.close ? ' on' : '') + '" data-ex="close" style="margin:0"><i></i>Fermer la boîte de dialogue après l’export</span></div>' +
      '<div data-exprog style="display:none;margin:9px 0 0">' +
      '<div style="height:12px;background:#d8d6d1;border:1px solid #96948e;border-radius:2px;overflow:hidden">' +
      '<div data-exbar style="height:100%;width:0;background:linear-gradient(#7fb2dd,#3f6c98)"></div></div>' +
      '<div class="hint" style="font-size:8px;color:#4a4842;margin-top:3px" data-exmsg>Préparation…</div></div>' +
      '</div>' +
      '<div class="dlg-foot"><span class="hint">' +
      st.outputs + ' · ' + st.fmt + ' · ' + (FMT[st.fmt].bits ? st.bits + ' · ' : '') + st.samp +
      ' · localisateurs 9 → 17</span>' + btn('Annuler') + btn('Exporter', 'on') + '</div></div>';

    return {
      title: 'Exportation du mixage audio <em>· Export Audio Mixdown</em>', ac: '#3f6c98', html: html(),
      after(body) {
        const redraw = (keep) => {
          const sc = $('.dlg-body', body);
          const old = sc ? sc.scrollTop : 0;
          const wrap = document.createElement('div');
          wrap.innerHTML = html();
          const nu = wrap.firstChild;
          const host = body.querySelector('.dlg') ? body : body;
          const cur = body.querySelector('.dlg');
          if (cur && cur.parentNode) cur.parentNode.replaceChild(nu, cur);
          const s2 = $('.dlg-body', body);
          if (s2) s2.scrollTop = keep ? old : 0;
          bind();
        };
        function bind() {
          $$('.dlg-check', body).forEach((c) => c.addEventListener('click', () => {
            const k = c.dataset.ex;
            if (!k) { c.classList.toggle('on'); return; }
            st[k] = !st[k];
            if (k === 'useProj' || k === 'mono' || k === 'split' || k === 'rt' || k === 'upd') {
              c.classList.toggle('on');
              const dt = $('.dlg-foot .hint', body);
              return;
            }
            redraw(true);
          }));
          const aud = $('[data-exaud]', body);
          if (aud) aud.addEventListener('input', () => {
            st.audition = (aud.value > 0 ? '+' : '') + String(aud.value).replace('.', ',') + ',0 dB';
            const v = $('[data-exaudval]', body); if (v) v.textContent = st.audition;
          });
          $$('.dlg-row .arr', body).forEach((a) => a.addEventListener('click', () => {
            const lbl = a.closest('.dlg-row').querySelector('label').textContent.trim();
            const MAP = {
              'Format': Object.keys(FMT),
              'Taux d’échantillonnage': ['44 100 Hz', '48 000 Hz', '88 200 Hz', '96 000 Hz', '192 000 Hz'],
              'Profondeur de bit': ['8 bit', '16 bit', '24 bit', '32 bit (float)'],
              'Dithering': ['Aucun', 'UV-22HR', 'Apogee UV22', 'POW-r'],
              'Sorties': BUS
            };
            if (!MAP[lbl]) { A.showToast('Champ texte : cliquez pour saisir la valeur.', 'Export Audio Mixdown'); return; }
            const FLD = { 'Format': 'fmt', 'Taux d’échantillonnage': 'samp', 'Profondeur de bit': 'bits', 'Dithering': 'dith', 'Sorties': 'outputs' };
            const cur = MAP[lbl].indexOf(st[FLD[lbl]]);
            st[FLD[lbl]] = MAP[lbl][(cur + 1) % MAP[lbl].length];
            redraw(true);
            A.showToast(lbl + ' : ' + st[FLD[lbl]], 'Export Audio Mixdown');
          }));
          $$('input[type="text"], .dlg-row .f:not(:has(.arr))', body).forEach((f) => f.addEventListener('click', () => {
            A.showToast('Champ éditable : saisissez le nom ou le chemin du fichier exporté.', 'Export Audio Mixdown');
          }));
          const eb = $('[data-ex="editfmt"]', body);
          if (eb) eb.addEventListener('click', () => {
            A.showToast(st.fmt.indexOf('MP3') >= 0 ? 'ID3 : titre, artiste, album, genre, commentaire (balises du fichier exporté).'
              : 'Chunk Broadcast Wave : description, auteur, référence, date/heure, position timecode.', 'Export Audio Mixdown');
          });
          $$('.dlg-foot .w-btn', body).forEach((b) => b.addEventListener('click', () => {
            if (b.textContent === 'Annuler') { A.showToast('Exportation annulée.', 'Export Audio Mixdown'); W.close('exportmix'); return; }
            const prog = $('[data-exprog]', body);
            const bar = $('[data-exbar]', body);
            const msg = $('[data-exmsg]', body);
            if (!prog || b.dataset.busy) return;
            b.dataset.busy = '1';
            b.textContent = 'Abandonner';
            prog.style.display = 'block';
            let v = 0;
            const steps = ['Écriture de l’en-tête…', 'Mixage des canaux…', 'Écriture ' + st.fmt + '…', 'Terminé.'];
            const t = setInterval(() => {
              v += 12;
              if (bar) bar.style.width = Math.min(100, v) + '%';
              if (msg) msg.textContent = steps[Math.min(3, Math.floor(v / 26))] + ' ' + Math.min(100, v) + ' %';
              if (v >= 100) {
                clearInterval(t);
                A.showToast('« ' + st.name + '.' + FMT[st.fmt].ext + ' » exporté (' + st.outputs + (st.pool ? ', importé dans le Pool' : '') +
                  (st.track ? ', piste audio créée au localisateur gauche' : '') + '). Moteur audio à l’étape 2.', 'Export Audio Mixdown');
                if (st.close) W.close('exportmix');
                else { prog.style.display = 'none'; b.textContent = 'Exporter'; delete b.dataset.busy; if (bar) bar.style.width = '0'; }
              }
            }, 130);
          }));
          $$('.dlg-row .f span, .dlg-row .f i', body).forEach((x) => x.addEventListener('click', (e) => e.stopPropagation()));
        }
        bind();
      }
    };
  }

  function buildFade() {
    const st = { kind: 0, curve: 1, len: '0,500 s', applyLen: false, preset: 'Doux (spline)',
                 asDefault: true };
    const KINDS = [['Spline', 'M0,38 C40,10 60,4 100,4'], ['Spline amorti', 'M0,38 C30,30 55,6 100,4'], ['Linéaire', 'M0,38 L100,4']];
    const PRESETS = ['Doux (spline)', 'Linéaire court', 'Exponentiel long', 'Sinus doux', 'Fondu standard'];
    const html =
      '<div class="fd">' +
      '<div class="fd-top">' +
      '<span class="w-lbl">Type de courbe</span>' +
      '<span class="fd-kinds">' + KINDS.map((k, i) =>
        '<button class="fd-kind' + (st.kind === i ? ' on' : '') + '" data-fdk="' + i + '" title="' + k[0] + ' — ' + (i === 0 ? 'segments spline' : i === 1 ? 'segments spline amortis' : 'segments linéaires') + '">' +
        '<svg viewBox="0 0 100 42" preserveAspectRatio="none"><rect x="0" y="0" width="100" height="42" fill="none" stroke="#c4c2bc"/>' +
        '<path d="' + k[1] + '" fill="none" stroke="#2f5d86" stroke-width="2.5"/></svg></button>').join('') + '</span>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-fd="restore" title="Annuler les modifications depuis l’ouverture">Restaurer</button>' +
      '</div>' +
      '<div class="fd-main">' +
      '<div class="fd-view" data-fdview>' +
      '<svg viewBox="0 0 420 120" preserveAspectRatio="none" style="width:100%;height:100%">' +
      '<rect x="0" y="0" width="420" height="120" fill="#232628"/>' +
      '<path d="' + A.wavePath(420, 100, 'vocal', 77) + '" transform="translate(0,10)" fill="#3c4a44" opacity=".55"/>' +
      '<path data-fdcurve d="M0,104 C120,96 210,18 300,10 L420,10" stroke="#e0b04a" stroke-width="2" fill="none"/>' +
      '<path data-fdcurve-b d="M0,104 C120,96 210,18 300,10 L420,10 L420,120 L0,120 Z" fill="rgba(224,176,74,.12)" stroke="none"/>' +
      '<circle data-fdpt cx="210" cy="42" r="4.5" fill="#ffd27a" stroke="#3a3122"/>' +
      '</svg>' +
      '</div>' +
      '<div class="fd-side">' +
      '<div class="fd-h">Formes rapides</div>' +
      '<div class="fd-shapes">' + [['Lin.', 0], ['Exp.', 1], ['Log.', 2], ['S.', 3]].map((x) =>
        '<button class="w-btn" data-fdshape="' + x[1] + '">' + x[0] + '</button>').join('') + '</div>' +
      '<div class="fd-h">Longueur du fondu</div>' +
      '<div class="fd-row"><button class="w-btn" data-fdlen="1">' + st.len + ' ▾</button></div>' +
      '<div class="dlg-check" data-fdapply><i></i>Appliquer la longueur</div>' +
      '<div class="fd-h">Presets</div>' +
      '<div class="fd-row"><button class="w-btn" data-fdpreset="1">' + st.preset + ' ▾</button></div>' +
      '<div class="fd-row"><button class="w-btn" data-fdps="store" title="Stocker la courbe courante">Stocker</button>' +
      '<button class="w-btn" data-fdps="remove" title="Supprimer le preset">Suppr.</button></div>' +
      '<div class="fd-row"><button class="w-btn" data-fd="asdefault" title="Définir comme fondu par défaut">Comme défaut</button></div>' +
      '<div class="fd-h">Lecture</div>' +
      '<div class="fd-row"><button class="w-btn" data-fd="preview" title="Écoute de la zone de fondu (boucle)">Aperçu</button>' +
      '<button class="w-btn" data-fd="stop">Stop</button></div>' +
      '</div></div>' +
      '<div class="aw-foot"><span class="hint">Fondu (Fade dialog) — Audio ▸ Fondu · glissez la poignée pour changer la courbe, cliquez la courbe pour ajouter un point</span>' +
      '<span style="flex:1"></span>' + '<button class="w-btn" data-fd="ok">OK</button><button class="w-btn" data-fd="cancel">Annuler</button>' +
      '<button class="w-btn on" data-fd="apply">Appliquer</button></div></div>';
    return {
      title: 'Fondu <em>· Fade dialog</em>', ac: '#8a8450', html,
      after(body) {
        const svg = $('[data-fdview] svg', body);
        function setCurve(k) {
          const paths = ['M0,104 C120,96 210,18 300,10 L420,10', 'M0,104 C40,80 120,26 300,10 L420,10', 'M0,104 L420,10'];
          $('[data-fdcurve]', body).setAttribute('d', paths[k]);
          $('[data-fdcurve-b]', body).setAttribute('d', paths[k] + ' L420,120 L0,120 Z');
        }
        $$('[data-fdk]', body).forEach((b) => b.addEventListener('click', () => {
          st.kind = +b.dataset.fdk;
          $$('[data-fdk]', body).forEach((x) => x.classList.toggle('on', x === b));
          setCurve(st.kind);
          A.showToast('Type de courbe : ' + KINDS[st.kind][0] + '.', 'Fondu');
        }));
        $$('[data-fdshape]', body).forEach((b) => b.addEventListener('click', () => {
          st.kind = Math.min(2, +b.dataset.fdshape);
          setCurve(st.kind);
          A.showToast('Forme rapide : ' + b.textContent + '.', 'Fondu');
        }));
        $$('[data-fdlen]', body).forEach((b) => b.addEventListener('click', () => {
          const CYC = ['0,500 s', '1,000 s', '2,000 s', '0,250 s', '0,100 s'];
          st.len = CYC[(CYC.indexOf(st.len) + 1) % CYC.length];
          b.textContent = st.len + ' ▾';
          A.showToast('Longueur du fondu : ' + st.len + '.', 'Fondu');
        }));
        $$('[data-fdapply]', body).forEach((c) => c.addEventListener('click', () => {
          c.classList.toggle('on');
          st.applyLen = c.classList.contains('on');
          A.showToast('Appliquer la longueur : ' + (st.applyLen ? 'oui — la valeur sera utilisée à l’application' : 'non') + '.', 'Fondu');
        }));
        $$('[data-fdpreset]', body).forEach((b) => b.addEventListener('click', () => {
          st.preset = PRESETS[(PRESETS.indexOf(st.preset) + 1) % PRESETS.length];
          b.textContent = st.preset + ' ▾';
          A.showToast('Preset de fondu « ' + st.preset + ' » chargé.', 'Fondu');
        }));
        $$('[data-fdps]', body).forEach((b) => b.addEventListener('click', () => {
          A.showToast(b.dataset.fdps === 'store' ? 'Courbe stockée comme preset de fondu.' : 'Preset « ' + st.preset + ' » supprimé.', 'Fondu');
        }));
        $$('[data-fd]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.fd;
          if (k === 'preview') A.showToast('Aperçu du fondu en boucle (lecture réelle à l’étape 2).', 'Fondu');
          else if (k === 'stop') A.showToast('Aperçu arrêté.', 'Fondu');
          else if (k === 'restore') { st.kind = 0; setCurve(0); A.showToast('Courbe restaurée à l’ouverture du dialogue.', 'Fondu'); }
          else if (k === 'asdefault') A.showToast('Fondu courant défini par défaut (forme et longueur appliquées aux nouveaux fondus).', 'Fondu');
          else if (k === 'ok' || k === 'apply') A.showToast('Fondu appliqué — forme ' + KINDS[st.kind][0] + ', longueur ' + st.len + (st.applyLen ? ' (longueur appliquée)' : '') + '.', 'Fondu');
          if (k === 'ok' || k === 'cancel') W.close('fade');
        }));
        /* glisser la poignée */
        let drag = false;
        $('[data-fdpt]', body).addEventListener('pointerdown', (e) => { drag = true; e.preventDefault(); });
        window.addEventListener('pointerup', () => { drag = false; });
        $('[data-fdpt]', body).parentNode.addEventListener('pointermove', (e) => {
          if (!drag) return;
          const r = svg.getBoundingClientRect();
          const x = Math.max(4, Math.min(416, (e.clientX - r.left) / r.width * 420));
          $('[data-fdpt]', body).setAttribute('cx', x);
          $('[data-fdcurve]', body).setAttribute('d', 'M0,104 C' + (x * 0.7).toFixed(0) + ',96 ' + (x * 0.9).toFixed(0) + ',18 ' + x.toFixed(0) + ',10 L420,10');
        });
      }
    };
  }

  /* =====================================================================
     10 bis. FONDU ENCHAÎNÉ  (Crossfade dialog)
     ===================================================================== */
  function buildCrossfade() {
    const st = { len: '1,250 s', offset: '50 %', overlap: '0,000 s', volA: '0,0 dB', volB: '0,0 dB',
                 nudgeRange: 'Fondu', nudgeMode: 'Déplacer le fondu', sym: true, eqGain: false, eqPower: true,
                 preroll: true, postroll: false, autoscroll: false, autoZoom: true, followSel: true,
                 preset: 'Standard', typeCourbe: 'Spline' };
    const CYC = {
      len: ['1,250 s', '2,000 s', '0,500 s', '3,000 s'],
      offset: ['50 %', '40 %', '60 %', '30 %'],
      overlap: ['0,000 s', '0,250 s', '−0,250 s'],
      volA: ['0,0 dB', '−3,0 dB', '−6,0 dB'],
      volB: ['0,0 dB', '−3,0 dB', '−6,0 dB'],
      nudgeRange: ['Fondu', '1 ms', '10 ms', '1/16', 'Barre'],
      nudgeMode: ['Déplacer le fondu', 'Déplacer l’audio'],
      kind: ['Spline', 'Spline amorti', 'Linéaire'],
      typeCourbe: ['Spline', 'Spline amorti', 'Linéaire']
    };
    const row = (lbl, key, attr) => '<div class="fd-row"><span class="fd-lbl">' + lbl + '</span>' +
      '<button class="w-btn" data-xf="' + key + '" title="' + lbl + '">' + st[key] + ' ▾</button></div>';
    const chk = (key, lbl) => '<div class="dlg-check' + (st[key] ? ' on' : '') + '" data-xfc="' + key + '"><i></i>' + lbl + '</div>';
    const html =
      '<div class="fd xf">' +
      '<div class="xf-view"><svg viewBox="0 0 460 104" preserveAspectRatio="none" style="width:100%;height:100%">' +
      '<rect x="0" y="0" width="460" height="104" fill="#232628"/>' +
      '<path d="' + A.wavePath(230, 84, 'vocal', 33) + '" transform="translate(0,10)" fill="#33403a" opacity=".6"/>' +
      '<path d="' + A.wavePath(230, 84, 'vocal', 91) + '" transform="translate(230,10)" fill="#33403a" opacity=".6"/>' +
      '<path d="M0,34 C90,34 140,86 230,86 L230,104 L0,104 Z" fill="rgba(127,178,217,.16)"/>' +
      '<path d="M0,34 C90,34 140,86 230,86" stroke="#7fb2d9" stroke-width="2" fill="none"/>' +
      '<path d="M230,10 L230,10 C320,10 370,60 460,60 L460,10 Z" fill="rgba(224,176,74,.16)"/>' +
      '<path d="M230,10 C320,10 370,60 460,60" stroke="#e0b04a" stroke-width="2" fill="none"/>' +
      '<line data-xfoff x1="230" y1="0" x2="230" y2="104" stroke="#8b8f92" stroke-dasharray="3 3"/>' +
      '<text x="234" y="12" font-size="8" fill="#9aa2a8" font-family="Consolas,monospace">Décalage</text>' +
      '</svg></div>' +
      '<div class="xf-body">' +
      '<div class="xf-col">' +
      '<div class="fd-h">Fondu enchaîné</div>' +
      row('Longueur', 'len') +
      row('Point de décalage', 'offset') +
      row('Chevauchement', 'overlap') +
      row('Volume A', 'volA') +
      row('Volume B', 'volB') +
      '<div class="fd-h">Courbes</div>' +
      row('Type de courbe', 'typeCourbe') +
      chk('sym', 'Fondus symétriques') +
      chk('eqGain', 'Égal gain (Equal Gain)') +
      chk('eqPower', 'Égal puissance (Equal Power)') +
      '</div>' +
      '<div class="xf-col">' +
      '<div class="fd-h">Nudge</div>' +
      '<div class="fd-row"><span class="fd-lbl">Plage</span><button class="w-btn" data-xf="nudgeRange">' + st.nudgeRange + ' ▾</button></div>' +
      '<div class="fd-row"><span class="fd-lbl">Mode</span><button class="w-btn" data-xf="nudgeMode">' + st.nudgeMode + ' ▾</button></div>' +
      '<div class="fd-row xf-nudge"><button class="w-btn" data-xfnudge="-1" title="Reculer le fondu enchaîné">◀ Nudge</button>' +
      '<button class="w-btn" data-xfnudge="1" title="Avancer le fondu enchaîné">Nudge ▶</button></div>' +
      '<div class="fd-h">Écoute</div>' +
      '<div class="fd-row xf-nudge"><button class="w-btn" data-xfplay="out">Fondu sortant</button><button class="w-btn" data-xfplay="in">Fondu entrant</button></div>' +
      '<div class="fd-row xf-nudge"><button class="w-btn on" data-xfplay="xf">Fondu enchaîné</button><button class="w-btn" data-xfplay="stop">Stop</button></div>' +
      chk('preroll', 'Pré-roll 1,000 s') +
      chk('postroll', 'Post-roll 1,000 s') +
      chk('autoscroll', 'Autoscroll') +
      chk('autoZoom', 'Auto Zoom') +
      '</div>' +
      '<div class="xf-col">' +
      '<div class="fd-h">Presets</div>' +
      '<div class="fd-row"><button class="w-btn" data-xfpreset="1">' + st.preset + ' ▾</button></div>' +
      '<div class="fd-row xf-nudge"><button class="w-btn" data-xfps="store">Stocker</button><button class="w-btn" data-xfps="remove">Suppr.</button></div>' +
      '<div class="fd-row xf-nudge"><button class="w-btn" data-xf="asdefault">Comme défaut</button><button class="w-btn" data-xf="recall">Rappeler défaut</button></div>' +
      '<div class="fd-h">Sélection</div>' +
      '<div class="fd-row xf-nudge"><button class="w-btn" data-xfsel="-1">◀ Précédent</button><button class="w-btn" data-xfsel="1">Suivant ▶</button></div>' +
      chk('followSel', 'La sélection du projet suit') +
      '<div class="fd-row xf-nudge"><button class="w-btn" data-xf="zoom" title="Zoom sur le fondu enchaîné">Zoom sur le fondu</button></div>' +
      '</div>' +
      '</div>' +
      '<div class="aw-foot"><span class="hint">Fondu enchaîné (Crossfade dialog) — Audio ▸ Fondu enchaîné · ajustez puis appliquez</span>' +
      '<span style="flex:1"></span>' + '<button class="w-btn" data-xf="ok">OK</button><button class="w-btn" data-xf="cancel">Annuler</button>' +
      '<button class="w-btn on" data-xf="apply">Appliquer</button></div></div>';
    return {
      title: 'Fondu enchaîné <em>· Crossfade dialog</em>', ac: '#8a8450', html,
      after(body) {
        $$('[data-xf]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.xf;
          if (CYC[k]) {
            const cur = CYC[k].indexOf(b.textContent.replace(' ▾', ''));
            const nx = CYC[k][(cur + 1) % CYC[k].length];
            b.textContent = nx + ' ▾';
            st[k] = nx;
            if (k === 'offset') {
              const pct = parseFloat(nx);
              const x = 120 + (pct / 100) * 220;
              $('[data-xfoff]', body).setAttribute('x1', x);
              $('[data-xfoff]', body).setAttribute('x2', x);
            }
            A.showToast('Fondu enchaîné — ' + b.parentNode.querySelector('.fd-lbl').textContent + ' : ' + nx + '.', 'Fondu enchaîné');
            return;
          }
          if (k === 'asdefault') A.showToast('Réglages courants définis comme fondu enchaîné par défaut.', 'Fondu enchaîné');
          else if (k === 'recall') A.showToast('Fondu enchaîné par défaut rappelé (linéaire, symétrique, 1,250 s).', 'Fondu enchaîné');
          else if (k === 'zoom') A.showToast('Zoom sur la zone de fondu enchaîné.', 'Fondu enchaîné');
          else if (k === 'ok' || k === 'apply') A.showToast('Fondu enchaîné appliqué : ' + st.len + ', décalage ' + st.offset +
            ' (' + (st.eqPower ? 'égal puissance' : 'courbes réglables') + (st.sym ? ', symétrique' : '') + ').', 'Fondu enchaîné');
          if (k === 'ok' || k === 'cancel') W.close('crossfade');
        }));
        $$('[data-xfc]', body).forEach((c) => c.addEventListener('click', () => {
          const k = c.dataset.xfc;
          st[k] = !st[k];
          c.classList.toggle('on', st[k]);
          if (k === 'eqPower' && st.eqPower) { st.eqGain = false; }
          if (k === 'eqGain' && st.eqGain) { st.eqPower = false; }
          $$('[data-xfc]', body).forEach((x) => { if (x.dataset.xfc === 'eqPower' || x.dataset.xfc === 'eqGain') x.classList.toggle('on', st[x.dataset.xfc]); });
          A.showToast(c.textContent.trim() + ' : ' + (st[k] ? 'activé' : 'désactivé') + '.', 'Fondu enchaîné');
        }));
        $$('[data-xfnudge]', body).forEach((b) => b.addEventListener('click', () => A.showToast(
          'Nudge ' + (b.dataset.xfnudge === '1' ? 'à droite' : 'à gauche') + ' de ' + st.nudgeRange + ' — ' +
          (st.nudgeMode === 'Déplacer le fondu' ? 'la zone de fondu se déplace' : 'l’audio se déplace') + '.', 'Fondu enchaîné')));
        $$('[data-xfplay]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.xfplay === 'stop') { A.showToast('Écoute arrêtée.', 'Fondu enchaîné'); return; }
          $$('[data-xfplay]', body).forEach((x) => x.classList.toggle('on', x === b));
          const L = { out: 'Fondu sortant', in: 'Fondu entrant', xf: 'Fondu enchaîné complet' }[b.dataset.xfplay];
          A.showToast('Écoute : ' + L + (st.preroll ? ' (pré-roll 1,000 s)' : '') + (st.postroll ? ' (post-roll 1,000 s)' : '') + ' — audio à l’étape 2.', 'Fondu enchaîné');
        }));
        $$('[data-xfpreset]', body).forEach((b) => b.addEventListener('click', () => {
          const P = ['Standard', 'Court', 'Long doux', 'Égal puissance', 'Linéaire'];
          st.preset = P[(P.indexOf(st.preset) + 1) % P.length];
          b.textContent = st.preset + ' ▾';
          A.showToast('Preset de fondu enchaîné « ' + st.preset + ' » chargé.', 'Fondu enchaîné');
        }));
        $$('[data-xfps]', body).forEach((b) => b.addEventListener('click', () => {
          A.showToast(b.dataset.xfps === 'store' ? 'Fondu enchaîné stocké comme preset.' : 'Preset « ' + st.preset + ' » supprimé.', 'Fondu enchaîné');
        }));
        $$('[data-xfsel]', body).forEach((b) => b.addEventListener('click', () => A.showToast(
          'Fondu enchaîné ' + (b.dataset.xfsel === '1' ? 'suivant' : 'précédent') + ' de la piste sélectionné' +
          (st.followSel ? ' — la sélection du projet suit.' : '.'), 'Fondu enchaîné')));
      }
    };
  }

  /* =====================================================================
     11. DÉTECTION DES SILENCES
     ===================================================================== */
  function buildDetect() {
    const det = [[9.0, 9.42], [10.1, 10.35], [12.66, 13.02], [15.2, 15.5]];
    const html =
      '<div class="det">' +
      '<div class="cfg"><h5 style="margin:0 0 7px;font-size:9px;letter-spacing:.8px;text-transform:uppercase;color:#33322d">Détection</h5>' +
      dlgRow('Seuil d’ouverture', '-42,0 dB') + dlgRow('Seuil de fermeture', '-42,0 dB') +
      chk('Liés', true) +
      dlgRow('Temps min. ouvert', '0,300 s') + dlgRow('Temps min. fermé', '0,100 s') +
      dlgRow('Pré-roll', '0,050 s') + dlgRow('Post-roll', '0,050 s') +
      '<div style="display:flex;gap:5px;margin-top:8px"><button class="w-btn on" data-detcalc="1">Calculer</button>' + chk('auto', false) + '</div>' +
      '<h5 style="margin:12px 0 6px;font-size:9px;letter-spacing:.8px;text-transform:uppercase;color:#33322d">Résultat</h5>' +
      chk('Ajouter comme régions', true) +
      dlgRow('Nom des régions', 'Voix_Refrain') +
      dlgRow('N° de départ auto', '1') +
      chk('Détacher les silences', false) +
      chk('Supprimer les silences détectés', false) +
      chk('Créer des événements séparés', true) +
      chk('Fondu de 3 ms sur les bords', true) +
      dlgRow('Mode de traitement', 'Couper', true) +
      '</div>' +
      '<div class="list"><div class="w-scroll"><table><thead><tr>' +
      '<th style="width:28px">N°</th><th>Début</th><th>Fin</th><th style="width:78px">Durée</th></tr></thead><tbody>' +
      det.map((d, i) => '<tr><td>' + (i + 1) + '</td><td class="pos">' + (A.fmtPos ? A.fmtPos(d[0]) : d[0]) + '</td>' +
        '<td class="pos">' + (A.fmtPos ? A.fmtPos(d[1]) : d[1]) + '</td>' +
        '<td class="pos">' + (d[1] - d[0]).toFixed(2).replace('.', ',') + ' s</td></tr>').join('') +
      '</tbody></table></div></div>' +
      '</div>' +
      '<div class="dlg-foot"><span class="hint">Détection des silences — Audio ▸ Avancé ▸ Detect Silence</span>' +
      btn('Tout sélectionner') + btn('Aperçu') + btn('Traiter', 'on') + '</div>';
    return {
      title: 'Détection des silences <em>· Detect Silence</em>', ac: '#6f7d86', html,
      after(body) {
        $$('.dlg-check', body).forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));
        $$('.dlg-foot .w-btn, [data-detcalc]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.textContent === 'Traiter') { A.showToast('Silences traités (interface) — traitement audio à l’étape 2.', 'Detect Silence'); W.close('detect'); }
          else if (b.textContent === 'Aperçu') A.showToast('Lecture de l’aperçu : sections « fermées » silencieuses.', 'Detect Silence');
          else if (b.textContent === 'Tout sélectionner') A.showToast('Les 4 régions détectées sont sélectionnées.', 'Detect Silence');
          else A.showToast('4 régions détectées au seuil de -42 dB.', 'Detect Silence');
        }));
      }
    };
  }

  /* =====================================================================
     12. ANALYSEUR DE SPECTRE
     ===================================================================== */
  function buildSpectrum() {
    const N = 64;
    const bars = Array.from({ length: N }, (_, i) => {
      const f = i / N;
      const v = Math.max(0.03, Math.exp(-f * 2.1) * (0.55 + 0.45 * Math.sin(i * 1.7 + 1.1)) + 0.06);
      return v;
    });
    const W = 620, H = 160;
    let g = '';
    bars.forEach((v, i) => {
      const x = (i / N) * W;
      const h = v * (H - 14);
      g += '<rect x="' + x.toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + (W / N - 1.6).toFixed(1) +
        '" height="' + h.toFixed(1) + '" fill="#63c08a" opacity="' + (0.55 + v * 0.45).toFixed(2) + '"/>';
    });
    const html =
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Taille en échantillons</span><button class="w-btn" data-sp="size">2 048 ▾</button>' +
      '<span class="w-lbl">Recouvrement</span><button class="w-btn" data-sp="over">50 % ▾</button>' +
      '<span class="w-lbl">Fenêtre</span><button class="w-btn" data-sp="win">Hamming ▾</button>' +
      '<span class="w-sep"></span><span class="w-lbl">Stéréo</span><button class="w-btn" data-sp="ch">Mix mono ▾</button>' +
      '<span class="w-sep"></span><button class="w-btn" data-sp="hold">Maintenir les crêtes</button>' +
      '<button class="w-btn" data-sp="freeze">Figer</button>' +
      '</div>' +
      '<div class="spec">' +
      '<div class="graph"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + g + '</svg></div>' +
      '<div class="lbls"><span>20 Hz</span><span>100 Hz</span><span>1 kHz</span><span>10 kHz</span><span>20 kHz</span></div>' +
      '</div>' +
      '<div class="w-toolbar" style="border-top:1px solid #a3a19b;border-bottom:0">' +
      chk('dB', true) + chk('Fréq. log', true) + chk('Fréquence / note', false) +
      '<span class="w-lbl">Précision</span><span class="w-field" style="min-width:58px">11,7 Hz</span>' +
      '<span class="w-lbl">Min.</span><span class="w-field" style="min-width:56px">20 Hz</span>' +
      '<span class="w-lbl">Max.</span><span class="w-field" style="min-width:56px">20 kHz</span>' +
      chk('Actif', true) +
      '<span style="flex:1"></span><button class="w-btn on" data-specproc="1">Analyser</button>' +
      '</div>' +
      '<div class="aw-foot"><span>Analyseur de spectre — Audio ▸ Spectrum Analyzer</span><span style="flex:1"></span><span>Données simulées : l’analyse FFT réelle viendra avec le moteur audio</span></div>';
    return {
      title: 'Analyseur de spectre <em>· Spectrum Analyzer</em>', ac: '#3f6a52', html,
      after(body) {
        $$('.dlg-check', body).forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));
        const b = $('[data-specproc]', body);
        if (b) b.addEventListener('click', () => A.showToast('Spectre recalculé (simulation).', 'Spectrum Analyzer'));
        const CYC = {
          size: ['2 048', '1 024', '4 096', '8 192', '512'],
          over: ['50 %', '0 %', '25 %', '75 %'],
          win: ['Hamming', 'Hanning', 'Blackman', 'Rectangle', 'Kaiser'],
          ch: ['Mix mono', 'Stéréo séparé', 'Gauche', 'Droite']
        };
        $$('[data-sp]', body).forEach((bt) => {
          bt.addEventListener('click', () => {
            const k = bt.dataset.sp;
            if (CYC[k]) {
              const cur = CYC[k].indexOf(bt.textContent.replace(' ▾', ''));
              const nx = CYC[k][(cur + 1) % CYC[k].length];
              bt.textContent = nx + ' ▾';
              A.showToast('Analyseur — réglage « ' + k + ' » : ' + nx + '.', 'Spectrum Analyzer');
            } else if (k === 'hold') {
              bt.classList.toggle('on');
              A.showToast('Maintien des crêtes : ' + (bt.classList.contains('on') ? 'activé' : 'désactivé') + '.', 'Spectrum Analyzer');
            } else if (k === 'freeze') {
              bt.classList.toggle('on');
              A.showToast('Affichage ' + (bt.classList.contains('on') ? 'figé' : 'repris') + '.', 'Spectrum Analyzer');
            }
          });
        });
      }
    };
  }

  /* =====================================================================
     13. STATISTIQUES AUDIO
     ===================================================================== */
  function buildStats() {
    /* Audio ▸ Statistiques : 10 valeurs, calculées sur la sélection
       (événements, clips ou plages) — voir manuel, page 256. */
    const st = {
      scope: 'Sélection', sel: 'Voix Refrain 01',
      R: [
        ['Valeur min. d’échantillon', '-0,9134', '(−0,78 dB)', 'Plus petite valeur d’échantillon de la sélection, entre -1 et 1 puis en dB.'],
        ['Valeur max. d’échantillon', '0,9987', '(−0,01 dB)', 'Plus grande valeur d’échantillon de la sélection.'],
        ['Amplitude de crête', '-0,01 dB', '', 'Plus grande valeur absolue de la sélection, en dB.'],
        ['Décalage DC', '0,0000 %', '(−∞ dB)', 'Composante continue mesurée sur la sélection.'],
        ['Résolution estimée', '24 bit', '', 'Résolution réelle estimée d’après la plus petite différence entre deux échantillons.'],
        ['Hauteur estimée', 'La2', '(110,0 Hz)', 'Hauteur estimée du contenu de la sélection.'],
        ['Fréquence d’échantillonnage', '48 000 Hz', '', 'Fréquence d’échantillonnage du fichier analysé.'],
        ['Puissance RMS min.', '-31,2 dB', '', 'Pression sonore (RMS) la plus faible mesurée dans la sélection.'],
        ['Puissance RMS max.', '-9,8 dB', '', 'Pression sonore (RMS) la plus forte mesurée dans la sélection.'],
        ['Moyenne (RMS)', '-16,4 dB', '', 'Pression sonore moyenne sur toute la sélection.']
      ]
    };
    const SCOPES = ['Sélection', 'Événement', 'Clip entier', 'Plage de locators'];
    const rows = () => st.R.map((r, i) => '<tr data-st="' + i + '" title="' + esc(r[3]) + '"><td class="nm">' + r[0] + '</td>' +
      '<td class="v">' + r[1] + (r[2] ? ' <i>' + r[2] + '</i>' : '') + '</td></tr>').join('');
    const html =
      '<div class="stats">' +
      '<div class="w-toolbar" style="margin:-2px 0 6px;background:none;border:0;padding:0">' +
      '<span class="w-lbl">Cible</span><button class="w-btn" data-st="target">' + st.sel + ' ▾</button>' +
      '<span class="w-lbl">Portée</span><button class="w-btn" data-st="scope">' + st.scope + ' ▾</button>' +
      '<span style="flex:1"></span><span class="w-lbl">Audio ▸ Statistiques</span></div>' +
      '<div class="w-scroll st-wrap"><table class="st-table"><thead><tr><th>Élément</th><th style="width:132px">Valeur</th></tr></thead>' +
      '<tbody data-stbody>' + rows() + '</tbody></table></div>' +
      '<div class="hint" style="margin-top:7px;font-size:8px;color:#5c5a54">Valeurs calculées sur la ' + st.scope.toLowerCase() +
      ' de « ' + st.sel + ' ». Survolez une ligne pour son explication.</div>' +
      '</div>' +
      '<div class="dlg-foot"><span class="hint">Valeurs simulées sur les métadonnées de l’événement.</span>' +
      btn('Copier', '', ' data-st="copy"') + btn('Recalculer', '', ' data-st="calc"') + btn('Fermer', 'on', ' data-st="close"') + '</div>';
    return {
      title: 'Statistiques <em>· Statistics</em>', ac: '#5c6b7a', html,
      after(body) {
        function recalc() {
          const j = () => (Math.random() * 0.06 - 0.03);
          st.R[0][1] = (Math.random() * -0.3 - 0.7).toFixed(4).replace('.', ',');
          st.R[1][1] = (0.99 + j()).toFixed(4).replace('.', ',');
          st.R[2][1] = (Math.random() * -0.5 - 0.01).toFixed(2).replace('.', ',') + ' dB';
          st.R[7][1] = (-31 - Math.random() * 2).toFixed(1).replace('.', ',') + ' dB';
          st.R[8][1] = (-9.8 + j()).toFixed(1).replace('.', ',') + ' dB';
          st.R[9][1] = (-16.4 + j() * 3).toFixed(1).replace('.', ',') + ' dB';
          $('[data-stbody]', body).innerHTML = rows();
        }
        $$('[data-st]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.st;
          if (k === 'close') { W.close('stats'); return; }
          if (k === 'copy') {
            const txt = st.R.map((r) => r[0] + '\t' + r[1] + (r[2] ? ' ' + r[2] : '')).join('\n');
            if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
            A.showToast('Les 10 valeurs sont copiées dans le presse-papiers.', 'Statistiques'); return;
          }
          if (k === 'calc') { recalc(); A.showToast('Analyse recalculée sur la ' + st.scope.toLowerCase() + ' (valeurs simulées).', 'Statistiques'); return; }
          if (k === 'scope') {
            st.scope = SCOPES[(SCOPES.indexOf(st.scope) + 1) % SCOPES.length];
            b.textContent = st.scope + ' ▾'; recalc();
            A.showToast('Portée de l’analyse : ' + st.scope.toLowerCase() + '.', 'Statistiques'); return;
          }
          const names = ['Voix Refrain 01', 'Voix Refrain 02', 'Ambiance salle', 'Perc loop'];
          st.sel = names[(names.indexOf(st.sel) + 1) % names.length];
          b.textContent = st.sel + ' ▾'; recalc();
          A.showToast('Cible : « ' + st.sel + ' ».', 'Statistiques');
        }));
      }
    };
  }

  /* =====================================================================
     14. ÉDITEUR DE PARTIES AUDIO
     ===================================================================== */
  function buildAudioPart(arg) {
    const tr = (A.TRACKS || []).find((t) => t.num && t.kind === 'audio') || {};
    const evs = (A.PARTS || []).filter((p) => p.track === tr.id).slice(0, 4);
    const span = Math.max(12, evs.length ? Math.max.apply(null, evs.map((p) => p.start + p.len)) - evs[0].start : 12);
    const origin = evs.length ? evs[0].start : 0;
    const laneEv = (li) => evs.filter((p, i) => (i % 2) === li).map((p) => {
      const left = ((p.start - origin) / span) * 100;
      const w = (p.len / span) * 100;
      return '<div class="ev" data-apev style="left:' + left.toFixed(1) + '%;width:' + w.toFixed(1) + '%"><span>' +
        esc(p.name) + '</span><span class="eic">♪</span></div>';
    }).join('');
    const grid = Array.from({ length: 9 }).map((_, i) =>
      '<div class="gl" style="left:' + (i * 12.5) + '%"><b>' + (i + 1) + '</b></div>').join('');
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn on" data-aptool="arrow" title="Flèche">➤</button>' +
      '<button class="w-btn" data-aptool="range" title="Plage">▭</button>' +
      '<button class="w-btn" data-aptool="split" title="Ciseaux">✂</button>' +
      '<button class="w-btn" data-aptool="erase" title="Gomme">⌫</button>' +
      '<button class="w-btn" data-aptool="mute" title="Muet">M</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-ap="solo" title="Solo Editor : n’écouter que cette partie">Solo</button>' +
      '<button class="w-btn" data-ap="audition" title="Écouter (haut-parleur)">◉</button>' +
      '<button class="w-btn" data-ap="scrub" title="Scrub">⌇</button>' +
      '<button class="w-btn" data-ap="play" title="Lecture de la partie">▶</button>' +
      '<button class="w-btn on" data-ap="loop" title="Boucle">⟳</button>' +
      '<span class="w-lbl">Vol. écoute</span><input type="range" min="0" max="100" value="72" data-apvol style="width:64px">' +
      '<span style="flex:1"></span>' +
      '<span class="w-lbl">Format</span><span class="w-field" style="min-width:96px">Barres + temps <i class="arr"></i></span>' +
      '</div>' +
      '<div class="ape">' +
      '<div class="ape-parts"><h6>Parties</h6>' +
      evs.slice(0, 2).map((p, i) =>
        '<label class="pp' + (i === 0 ? ' on' : '') + '" data-appart="' + i + '"><i></i>' + esc(p.name) + '</label>').join('') +
      '<div class="hint">Cochez les parties à éditer.</div>' +
      '<h6 style="margin-top:9px">Boucle de piste</h6>' +
      '<label class="ck2" data-ap="trkloop"><i class="on"></i>Boucle piste activée</label>' +
      '<div class="row2"><span>Mesure</span><span class="w-field" style="min-width:56px">9 – 17 <i class="arr"></i></span></div>' +
      '<h6 style="margin-top:9px">Affichage</h6>' +
      '<label class="ck2" data-ap="borders"><i class="on"></i>Bordures de parties</label>' +
      '<label class="ck2" data-ap="activeonly"><i></i>Éditer les parties actives seules</label>' +
      '</div>' +
      '<div class="ape-main">' +
      '<div class="ape-ruler">' + grid + '</div>' +
      '<div class="lanes">' +
      '<div class="lane-lbl">Voie 1</div><div class="lane" data-aplane="0">' + laneEv(0) + '</div>' +
      '<div class="lane-lbl">Voie 2</div><div class="lane" data-aplane="1">' + laneEv(1) + '</div>' +
      '</div>' +
      '<div class="ape-info"><span>Partie <b>' + esc(evs.length ? evs[0].name : '—') + '</b></span>' +
      '<span>Début <b>' + fmt(origin) + '</b></span><span>Fin <b>' + fmt(origin + span) + '</b></span>' +
      '<span>Longueur <b>' + fmt(origin + span) + '</b></span>' +
      '<span style="flex:1"></span><span>' + evs.length + ' événements · 2 voies</span></div>' +
      '</div></div>' +
      '<div class="aw-foot"><span>Éditeur de parties audio — ' + esc(tr.name || '') + '</span>' +
      '<span style="flex:1"></span><span>Outils et options de la barre d’outils identiques à la fenêtre Projet, plus Solo Editor, écoute, scrub et boucle de piste</span></div>';
    return {
      title: 'Éditeur de parties audio <em>· Audio Part Editor</em>', ac: tr.color || '#6f7d86', html,
      after(body) {
        $$('[data-aptool]', body).forEach((b) => b.addEventListener('click', () => {
          $$('[data-aptool]', body).forEach((x) => x.classList.toggle('on', x === b));
        }));
        $$('[data-ap]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.ap;
          if (k === 'solo' || k === 'play' || k === 'loop' || k === 'trkloop' || k === 'borders' || k === 'activeonly' ||
              k === 'audition' || k === 'scrub') b.classList.toggle('on');
          const on = b.classList.contains('on');
          const MSG = {
            solo: 'Solo Editor ' + (on ? 'activé : seule cette partie est audible' : 'désactivé') + '.',
            audition: 'Écoute au haut-parleur ' + (on ? 'armée' : 'désarmée') + ' — rendu audio à l’étape 2.',
            scrub: 'Scrub ' + (on ? 'activé : glissez sur la forme d’onde pour scrabbler' : 'désactivé') + '.',
            play: 'Lecture de la partie (interface).',
            loop: 'Boucle de la partie ' + (on ? 'activée' : 'désactivée') + '.',
            trkloop: 'Boucle de piste indépendante ' + (on ? 'activée' : 'désactivée') + ' (mesures 9–17).',
            borders: 'Bordures de parties ' + (on ? 'affichées' : 'masquées') + '.',
            activeonly: 'Édition limitée aux parties actives ' + (on ? 'activée' : 'désactivée') + '.'
          };
          if (k === 'borders') body.querySelectorAll('.lane .ev').forEach((e) => e.classList.toggle('nb', !on));
          A.showToast(MSG[k] || b.textContent, 'Éditeur de parties audio');
        }));
        $$('[data-appart]', body).forEach((l) => l.addEventListener('click', () => {
          l.classList.toggle('on');
        }));
        $$('[data-apev]', body).forEach((e) => e.addEventListener('click', () => {
          $$('[data-apev]', body).forEach((x) => x.classList.toggle('sel', x === e));
          A.showToast('Événement « ' + e.textContent.trim().replace('♪', '') + ' » sélectionné dans la partie.', 'Éditeur de parties audio');
        }));
      }
    };
  }

  /* =====================================================================
     15. ÉDITEUR DE LISTE MIDI
     ===================================================================== */
  function buildListEditor() {
    const mids = (A.PARTS || []).filter((p) => p.type === 'midi');
    let part = mids[0] || {};
    const r = rnd(99);
    const TYPES = ['Note', 'Contrôleur', 'Program Change', 'Pitch Bend', 'Aftertouch', 'Sysex'];
    function makeRows(n) {
      const rows = [];
      const rr = rnd(99 + n);
      for (let i = 0; i < 34; i++) {
        const bar = 1 + Math.floor(i / 4);
        const tick = Math.floor(rr() * 900);
        const pitch = [36, 38, 42, 46][Math.floor(rr() * 4)];
        rows.push({
          n: i + 1, type: 'Note',
          pos: bar + '.' + String(1 + Math.floor(rr() * 4)).padStart(2, '0') + '.' + String(tick).padStart(3, '0'),
          ev: 'Note On', ch: 'Cant.' + (i % 3 + 1),
          val1: 'Do', val2: pitch, val3: Math.floor(30 + rr() * 100), len: '1/16'
        });
      }
      return rows;
    }
    const st = { rows: makeRows(0), filter: 'Toutes les données', cols: {}, sel: {} };
    ['n', 'type', 'pos', 'ev', 'ch', 'val1', 'val2', 'val3', 'len'].forEach((c) => { st.cols[c] = true; });
    const COLS = [['n', '#', 34], ['type', 'Type', 78], ['pos', 'Position', 112], ['ev', 'Événement', 92],
                  ['ch', 'Canal', 58], ['val1', 'Note', 52], ['val2', 'Hauteur', 62], ['val3', 'Vélocité', 62], ['len', 'Longueur', 62]];
    function table() {
      const cols = COLS.filter((c) => st.cols[c[0]]);
      const rows = st.rows.filter((x) => st.filter === 'Toutes les données' || x.type === st.filter);
      return '<table><thead><tr>' + cols.map((c) => '<th style="width:' + c[2] + 'px">' + c[1] + '</th>').join('') +
        '</tr></thead><tbody>' + rows.map((x, i) => {
          const notes = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
          const nm = notes[(x.val2 || 60) % 7] + (Math.floor((x.val2 || 60) / 12) - 1);
          return '<tr data-lerow="' + i + '"' + (st.sel[st.rows.indexOf(x)] ? ' class="sel"' : '') + '>' +
          cols.map((c) => '<td' + (c[0] === 'val1' ? ' class="nm"' : '') + '>' + esc(String(c[0] === 'val1' ? nm : x[c[0]])) + '</td>').join('') + '</tr>';
        }).join('') +
        '</tbody></table>';
    }
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-le="insert" title="Insérer un événement à la position du curseur">Insérer</button>' +
      '<button class="w-btn" data-le="del" title="Supprimer les événements sélectionnés">Supprimer</button>' +
      '<button class="w-btn" data-le="all" title="Tout sélectionner">Tout sélectionner</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Événement</span>' +
      '<button class="w-btn" data-le="part" title="Partie MIDI affichée">' + esc(part.name || 'MIDI') + ' ▾</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Filtre</span>' +
      '<button class="w-btn" data-lefilter="1" title="Type d’événements affichés">' + st.filter + ' ▾</button>' +
      '<button class="w-btn" data-le="cols" title="Colonnes affichées">Colonnes ▾</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-le="up" title="Déplacer l’événement vers le haut">▲</button>' +
      '<button class="w-btn" data-le="down" title="Déplacer vers le bas">▼</button>' +
      '<span style="flex:1"></span>' +
      '<span class="w-lbl" data-lecount></span>' +
      '</div>' +
      '<div class="w-scroll" style="flex:1;min-height:0;background:#f0eeea"><div class="le" data-letable>' + table() + '</div></div>' +
      '<div class="aw-foot"><span>Éditeur de liste — édition numérique de tous les événements MIDI</span><span style="flex:1"></span>' +
      '<span data-lefoot></span></div>';
    return {
      title: 'Éditeur de liste <em>· List Editor</em>', ac: '#6a5d94', html,
      after(body) {
        function redraw() {
          $('[data-letable]', body).innerHTML = table();
          bindRows();
          const vis = st.rows.filter((x) => st.filter === 'Toutes les données' || x.type === st.filter).length;
          $('[data-lefoot]', body).textContent = vis + ' événements affichés / ' + st.rows.length;
          const sN = Object.keys(st.sel).length;
          $('[data-lecount]', body).textContent = sN ? sN + ' sélectionné(s)' : '';
        }
        function bindRows() {
          $$('[data-lerow]', body).forEach((tr) => {
            const i = +tr.dataset.lerow;
            tr.addEventListener('click', (e) => {
              if (!e.shiftKey && !e.ctrlKey) st.sel = {};
              const vis = st.rows.filter((x) => st.filter === 'Toutes les données' || x.type === st.filter);
              const idx = st.rows.indexOf(vis[i]);
              st.sel[idx] = true;
              redraw();
            });
            $$('td', tr).forEach((td, ci) => td.addEventListener('dblclick', () => {
              const cols = COLS.filter((c) => st.cols[c[0]]);
              const key = cols[ci][0];
              if (key === 'n') return;
              const vis = st.rows.filter((x) => st.filter === 'Toutes les données' || x.type === st.filter);
              const obj = vis[i];
              if (key === 'val3') { obj.val3 = obj.val3 >= 120 ? 30 : obj.val3 + 20; A.showToast('Vélocité : ' + obj.val3 + '.', 'Éditeur de liste'); }
              else if (key === 'val2') { obj.val2 = obj.val2 >= 46 ? 36 : obj.val2 + 2; A.showToast('Hauteur : ' + obj.val2 + '.', 'Éditeur de liste'); }
              else if (key === 'type') { obj.type = TYPES[(TYPES.indexOf(obj.type) + 1) % 3]; A.showToast('Type : ' + obj.type + '.', 'Éditeur de liste'); }
              redraw();
            }));
          });
        }
        bindRows();
        $('[data-lefoot]', body).textContent = st.rows.length + ' événements affichés / ' + st.rows.length;

        $$('[data-le]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.le;
          if (k === 'cols') {
            const old = document.getElementById('leCols');
            if (old) { old.remove(); return; }
            const m = document.createElement('div');
            m.id = 'leCols';
            m.style.cssText = 'position:fixed;z-index:9300;background:linear-gradient(#4a4f54,#3a3f44);border:1px solid #22262a;border-radius:3px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.7 Verdana,Tahoma,sans-serif;color:#e2e7ea;min-width:150px';
            m.innerHTML = COLS.map((c) => '<div data-lecol="' + c[0] + '"><i class="' + (st.cols[c[0]] ? 'on' : '') + '"></i>' + c[1] + '</div>').join('');
            const rc = b.getBoundingClientRect();
            m.style.left = rc.left + 'px'; m.style.top = (rc.bottom + 2) + 'px';
            document.body.appendChild(m);
            m.querySelectorAll('div[data-lecol]').forEach((d) => {
              d.style.cssText = 'padding:2px 8px;border-radius:2px;display:flex;align-items:center;gap:6px;cursor:default';
              const i = d.querySelector('i');
              i.style.cssText = 'width:9px;height:9px;border:1px solid #7d848a;border-radius:2px;display:inline-block' +
                (i.classList.contains('on') ? ';background:#5d86ad;border-color:#8fb2d4' : '');
              d.addEventListener('mouseenter', () => { d.style.background = '#3f6c98'; });
              d.addEventListener('mouseleave', () => { d.style.background = 'transparent'; });
              d.addEventListener('click', () => {
                const kk = d.dataset.lecol;
                st.cols[kk] = !st.cols[kk];
                i.style.background = st.cols[kk] ? '#5d86ad' : 'transparent';
                redraw();
              });
            });
            const close = (ev) => {
              if (!m.contains(ev.target) && ev.target !== b) { m.remove(); document.removeEventListener('mousedown', close, true); }
            };
            document.addEventListener('mousedown', close, true);
            return;
          }
          if (k === 'insert') {
            const n = st.rows.length + 2;
            st.rows.push({ n: n, type: 'Note', pos: '9.1.' + String(1 + (n % 4)).padStart(2, '0') + '.000', ev: 'Note On', ch: 'Cant.1', val1: 'Do', val2: 60, val3: 100, len: '1/16' });
            redraw();
            A.showToast('Événement inséré en fin de liste (prototype).', 'Éditeur de liste');
            return;
          }
          if (k === 'all') {
            st.sel = {};
            st.rows.forEach((_, i) => { st.sel[i] = true; });
            redraw();
            A.showToast(st.rows.length + ' événements sélectionnés.', 'Éditeur de liste');
            return;
          }
          const keys = Object.keys(st.sel).map(Number).sort((x, y) => x - y);
          if (!keys.length) { A.showToast('Sélectionnez d’abord un événement.', 'Éditeur de liste'); return; }
          if (k === 'del') {
            keys.sort((x, y) => y - x).forEach((i) => st.rows.splice(i, 1));
            st.sel = {}; redraw();
            A.showToast('Événements supprimés.', 'Éditeur de liste');
          } else if (k === 'up' || k === 'down') {
            const d = k === 'up' ? -1 : 1;
            const arr = keys.map((i) => st.rows[i]);
            const nb = st.rows.slice();
            keys.forEach((i) => { const j = i + d; if (j >= 0 && j < nb.length) { const tmp = nb[j]; nb[j] = nb[i]; nb[i] = tmp; } });
            st.rows = nb;
            st.sel = {};
            keys.forEach((i) => { const j = i + d; if (j >= 0 && j < nb.length) st.sel[j] = true; });
            redraw();
            A.showToast('Événement déplacé ' + (d < 0 ? 'vers le haut' : 'vers le bas') + '.', 'Éditeur de liste');
          } else if (k === 'part') {
            if (mids.length < 2) { A.showToast('Une seule partie MIDI dans ce projet.', 'Éditeur de liste'); return; }
            const i = mids.indexOf(part);
            part = mids[(i + 1) % mids.length];
            b.textContent = part.name + ' ▾';
            st.rows = makeRows(mids.indexOf(part));
            st.sel = {};
            redraw();
            A.showToast('Partie affichée : « ' + part.name + ' ».', 'Éditeur de liste');
          }
        }));
        $$('[data-lefilter]', body).forEach((b) => b.addEventListener('click', () => {
          const CYC = ['Toutes les données', 'Note', 'Contrôleur', 'Program Change', 'Pitch Bend', 'Aftertouch'];
          st.filter = CYC[(CYC.indexOf(st.filter) + 1) % CYC.length];
          b.textContent = st.filter + ' ▾';
          redraw();
        }));
      }
    };
  }

  /* =====================================================================
     16. LOOP BROWSER (F6) / SOUND BROWSER (F7)
     ===================================================================== */
  const LOOPS = [
    ['Alpha_DnB_175_01', 'Batterie', 'Drum&Bass', '175', '4,25 s'],
    ['Alpha_House_128_02', 'Batterie', 'House', '128', '3,75 s'],
    ['Alpha_Break_174_03', 'Batterie', 'Breakbeat', '174', '2,00 s'],
    ['Alpha_Bass_F_120', 'Basse', 'Funk', '120', '2,00 s'],
    ['Alpha_Chord_Am_090', 'Accord', 'Pop', '90', '4,00 s'],
    ['Alpha_Vox_Adlib_01', 'Voix', 'Adlib', '120', '1,50 s'],
    ['Alpha_Perc_Top_128', 'Percussion', 'Top loop', '128', '2,00 s'],
    ['Alpha_FX_Riser_01', 'Effet', 'Riser', '-', '4,00 s']
  ];
  /* =====================================================================
     17 bis. SOUND BROWSER  (vue MediaBay axée SoundFrame / presets)
     ===================================================================== */
  /* ------------------------------------------------------------------ 16 bis */
  function mediabayView(cfg) {
    const tree = cfg.tree || [];
    const cols = cfg.cols || ['Nom', 'Type', 'Durée'];
    const rows = cfg.rows || [];
    const mbWin = open;
    const tabs = [['mediabay', 'MediaBay'], ['loops', 'Loop Browser'], ['sounds', 'Sound Browser']];
    const html =
      '<div class="mb" data-mbroot>' +
      '<div class="mb-tools">' +
      '<span class="mbt-nav" data-mbnav="back" title="Précédent">◀</span>' +
      '<span class="mbt-nav" data-mbnav="fwd" title="Suivant">▶</span>' +
      '<input class="mbt-search" data-mbsearch placeholder="Rechercher un média (nom, catégorie, style…)">' +
      '<button class="mbt-b" data-mbview="attr" title="Afficher / masquer le volet des attributs">Attributs</button>' +
      '<button class="mbt-b" data-mbview="list" title="Colonnes détaillées (View)">Colonnes</button>' +
      '<span class="w-sep2"></span>' +
      '<button class="mbt-b" data-mbc="import" title="Importer des fichiers dans la bibliothèque">Importer…</button>' +
      '<button class="mbt-b" data-mbc="reset" title="Réinitialiser tous les filtres">Réinit. filtres</button>' +
      '<button class="mbt-b" data-mbc="fav" title="Ajouter la sélection aux favoris">★ Favoris</button>' +
      '<button class="mbt-b" data-mbc="user" title="Définir un attribut utilisateur">+ Attribut</button>' +
      '<span style="flex:1"></span>' +
      '<span class="mbt-pv" title="Aperçu : lecture">▶</span><span class="mbt-pv" title="Aperçu : arrêt">■</span>' +
      '<span class="mbt-pv" title="Aperçu : boucle">⟳</span>' +
      '<input type="range" class="mbt-vol" min="0" max="100" value="70" title="Volume d’aperçu">' +
      '</div>' +
      '<div class="mb-tabs">' + tabs.map((t) =>
        '<span class="mb-tab' + (t[0] === cfg.kind ? ' on' : '') + '" data-mbopen="' + t[0] + '">' + t[1] + '</span>').join('') +
      '</div>' +
      '<div class="mb-main">' +
      '<div class="mb-tree">' + tree.map((t, i) =>
        '<div class="f' + (i === 0 ? ' on' : '') + '"' + (t[1] ? '' : ' style="padding-left:20px"') + '><i></i>' + t[0] + '</div>').join('') +
      '<div class="mb-tree-h">Scope</div>' +
      ['Tout le disque', 'Dossiers du projet', 'Favoris seuls'].map((n) =>
        '<div class="f" style="padding-left:20px"><i></i>' + n + '</div>').join('') +
      '</div>' +
      '<div class="mb-mid">' +
      '<div class="mb-filters">' + (cfg.filters || ['Catégorie', 'Style', 'Caractère']).map((f) =>
        '<div class="fc">' + f + '<i class="arr"></i></div>').join('') +
      '<div class="fc" style="flex:0 0 46px">Tempo</div></div>' +
      '<div class="mb-res"><table><thead><tr>' + cols.map((c, i) =>
        '<th data-sort="' + i + '">' + c + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map((r, i) => '<tr' + (i === 1 ? ' class="sel"' : '') + '>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div></div>' +
      '<div class="mb-attr" data-mbattr><div class="t">Sélection</div>' +
      (cfg.info || [['Nom', '—'], ['Type', '—'], ['Durée', '—']]).map((r) =>
        '<div class="r"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('') +
      '<div class="t">Éditeur de balises</div>' +
      '<div class="r"><span>Note</span><b class="mb-star">★★★☆☆</b></div>' +
      '<div class="r"><span>Favori</span><b data-mbfav>non</b></div>' +
      '<div class="mb-user" data-mbuser></div>' +
      '</div></div>' +
      '<div class="aw-foot"><span>' + (cfg.preset || cfg.title) + '</span><span style="flex:1"></span>' +
      '<span data-mbcount>' + rows.length + ' résultats</span><span style="margin-left:10px">wav · aif · mp3 · rex</span></div>';
    return {
      title: cfg.title + ' <em>· ' + (cfg.em || 'vue MediaBay') + '</em>', ac: cfg.ac || '#c99436', html,
      after(body) {
        const tb = $('.mb-res tbody', body);
        $$('.mb-tree .f', body).forEach((f) => f.addEventListener('click', () => {
          $$('.mb-tree .f', body).forEach((x) => x.classList.toggle('on', x === f));
          A.showToast('Scope : ' + f.textContent.trim() + '.', cfg.title);
        }));
        const pick = (tr) => {
          $$('.mb-res tbody tr', body).forEach((x) => x.classList.toggle('sel', x === tr));
          const attr = $('[data-mbattr]', body);
          if (attr) {
            const cells = [...tr.children].map((c) => c.textContent.trim());
            const b = $$('.r b', attr);
            if (b[0]) b[0].textContent = cells[0];
            if (b[1]) b[1].textContent = cells[1] || '—';
          }
        };
        $$('.mb-res tbody tr', body).forEach((tr) => {
          tr.addEventListener('click', () => pick(tr));
          tr.addEventListener('dblclick', () => A.showToast('« ' + tr.children[0].textContent.trim() + ' » inséré sur la piste sélectionnée (étape 2).', cfg.title));
        });
        /* recherche */
        const inp = $('[data-mbsearch]', body);
        if (inp) inp.addEventListener('input', () => {
          const q = inp.value.toLowerCase().trim();
          let n = 0;
          $$('.mb-res tbody tr', body).forEach((tr) => {
            const ok = !q || tr.textContent.toLowerCase().indexOf(q) >= 0;
            tr.style.display = ok ? '' : 'none';
            if (ok) n++;
          });
          const c = $('[data-mbcount]', body);
          if (c) c.textContent = n + ' résultats';
        });
        /* tri par en-tête */
        const sortDir = {};
        $$('.mb-res th', body).forEach((th, ci) => th.addEventListener('click', () => {
          sortDir[ci] = !sortDir[ci];
          const arr = $$('.mb-res tbody tr', body);
          arr.sort((a, b2) => {
            const x = a.children[ci] ? a.children[ci].textContent.trim() : '';
            const y = b2.children[ci] ? b2.children[ci].textContent.trim() : '';
            const nx = parseFloat(x.replace(',', '.')), ny = parseFloat(y.replace(',', '.'));
            const cmp = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : x.localeCompare(y, 'fr');
            return sortDir[ci] ? cmp : -cmp;
          });
          arr.forEach((tr) => tb.appendChild(tr));
          $$('.mb-res th', body).forEach((x) => x.removeAttribute('data-dir'));
          th.dataset.dir = sortDir[ci] ? 'asc' : 'desc';
        }));
        /* onglets */
        $$('.mb-tab', body).forEach((t) => t.addEventListener('click', () => {
          if (t.dataset.mbopen && t.dataset.mbopen !== cfg.kind) { window.ALPHAWIN.open(t.dataset.mbopen); return; }
          $$('.mb-tab', body).forEach((x) => x.classList.toggle('on', x === t));
        }));
        /* outils */
        $$('[data-mbc]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.mbc;
          if (k === 'reset') {
            const i2 = $('[data-mbsearch]', body);
            if (i2) i2.value = '';
            $$('.mb-res tbody tr', body).forEach((tr) => { tr.style.display = ''; });
            const c = $('[data-mbcount]', body);
            if (c) c.textContent = rows.length + ' résultats';
            A.showToast('Filtres réinitialisés.', cfg.title);
          } else if (k === 'fav') {
            const fb = $('[data-mbfav]', body);
            if (fb) fb.textContent = fb.textContent === 'oui' ? 'non' : 'oui';
            A.showToast('Favori : ' + (fb ? fb.textContent : '—') + '.', cfg.title);
          } else if (k === 'import') {
            A.showToast('Importer des médias : la boîte de dialogue de fichier s’ouvre à l’étape 2.', cfg.title);
          } else if (k === 'user') {
            const zone = $('[data-mbuser]', body);
            const n = $$('.mb-user .r', body).length + 1;
            if (n > 4) { A.showToast('Quatre attributs utilisateur au maximum.', cfg.title); return; }
            const d = document.createElement('div');
            d.className = 'r';
            d.innerHTML = '<span>Attribut ' + n + '</span><b>texte</b>';
            zone.appendChild(d);
            d.addEventListener('click', () => {
              const cycle = ['texte', 'case', 'nombre'];
              const cur = d.querySelector('b').textContent;
              d.querySelector('b').textContent = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
              A.showToast('Type de l’attribut : ' + d.querySelector('b').textContent + '.', cfg.title);
            });
            A.showToast('Attribut utilisateur « Attribut ' + n + ' » ajouté — cliquez dessus pour changer son type (texte / case / nombre).', cfg.title);
          }
        }));
        $$('[data-mbview]', body).forEach((b) => b.addEventListener('click', () => {
          b.classList.toggle('on');
          if (b.dataset.mbview === 'attr') {
            const a = $('[data-mbattr]', body);
            a.style.display = a.style.display === 'none' ? '' : 'none';
          } else {
            $('[data-mbroot]', body).classList.toggle('mb-wide');
          }
        }));
        $$('[data-mbnav]', body).forEach((b) => b.addEventListener('click', () => A.showToast('Historique de navigation ' + (b.dataset.mbnav === 'back' ? 'précédent' : 'suivant') + '.', cfg.title)));
        $$('.mbt-pv', body).forEach((b) => b.addEventListener('click', () => A.showToast('Aperçu : ' + b.title.replace('Aperçu : ', '') + ' (lecture réelle à l’étape 2).', cfg.title)));
        const vol = $('.mbt-vol', body);
        if (vol) vol.addEventListener('input', () => A.setStatus('Volume d’aperçu : ' + vol.value + ' %.'));
      }
    };
  }

  function buildMediabay() {
    return mediabayView({
      kind: 'mediabay', title: 'MediaBay', em: 'gestionnaire de médias · navigateur, filtres, balises', ac: '#c99436',
      preset: 'MediaBay — navigateur, visualiseur, filtres, éditeur de balises, scope',
      cols: ['Nom', 'Type', 'Tempo', 'Signature', 'Durée', '★'],
      rows: [
        ['01_875 drums.wav', 'Boucle audio', '175,00', '4/4', '4,25 s', '★★★'],
        ['02_ride loop.wav', 'Boucle audio', '175,00', '4/4', '2,00 s', '★★'],
        ['Alpha Pad Warm', 'Preset VST', '—', '—', '—', '★★★'],
        ['Kit électro 01', 'Kit de batterie', '128,00', '4/4', '—', '★'],
        ['Voix lead 12.wav', 'Échantillon', '—', '—', '3,10 s', '★★'],
        ['Ambiance pluie.wav', 'Boucle audio', '90,00', '4/4', '8,00 s', ''],
        ['Basse 120 funk.wav', 'Boucle audio', '120,00', '4/4', '2,00 s', '★★★'],
        ['Piano droit Alpha', 'Preset VST', '—', '—', '—', '★★'],
        ['Cordes Alpha', 'Preset VST', '—', '—', '—', ''],
        ['Nappe 90 ambient.wav', 'Boucle audio', '90,00', '4/4', '8,00 s', '★'],
        ['Percussion 100.wav', 'Boucle audio', '100,00', '4/4', '1,00 s', ''],
        ['Rires foule.wav', 'Effet', '—', '—', '1,40 s', '']
      ],
      tree: [['All Media', true], ['Favoris', false], ['Projet Alpha', false], ['VST Sound', false],
             ['Factory Content', false], ['User Content', false], ['Pistes', false], ['Vidéos', false]],
      filters: ['Catégorie', 'Sous-cat.', 'Style', 'Caractère', 'Clé'],
      info: [['Nom', '01_875 drums'], ['Type', 'Boucle audio'], ['Fréq.', '48 kHz'], ['Tempo', '175,00'], ['Style', 'Drum&Bass'], ['Clé', 'C'], ['Taille', '1,2 Mo']]
    });
  }

  function buildLoops() {
    const ROWS = [
      ['Batterie 120 · rock', 'Boucle audio', '120,00', '4/4', '2 mes.', '★'],
      ['Basse 120 · funk', 'Boucle audio', '120,00', '4/4', '2 mes.', '★'],
      ['Guitare 128 · riff', 'Boucle audio', '128,00', '4/4', '4 mes.', ''],
      ['Nappe 90 · ambient', 'Boucle audio', '90,00', '4/4', '8 mes.', ''],
      ['Percussion 100', 'Boucle audio', '100,00', '4/4', '1 mes.', ''],
      ['Voix 120 · chœur', 'Boucle audio', '120,00', '4/4', '2 mes.', '★'],
      ['Batterie 128 · électro', 'Boucle audio', '128,00', '4/4', '4 mes.', '★'],
      ['Basse 90 · dub', 'Boucle audio', '90,00', '4/4', '4 mes.', ''],
      ['Cordes 100 · ciné', 'Boucle audio', '100,00', '4/4', '8 mes.', '★']
    ];
    return mediabayView({
      kind: 'loops', title: 'Loop Browser', em: 'boucles audio · recherche par catégorie', preset: 'Vue MediaBay : fichiers audio · recherche par catégorie',
      cols: ['Nom', 'Type', 'Tempo', 'Signature', 'Longueur', '★'], rows: ROWS,
      filters: ['Catégorie', 'Instruments', 'Style', 'Caractère', 'Tempo'],
      tree: [['Boucles Alpha', true], ['Batterie', false], ['Basse', false], ['Guitares', false], ['Nappes', false], ['Voix', false]],
      info: [['Nom', 'Batterie 120 · rock'], ['Type', 'Boucle audio'], ['Tempo', '120,00'], ['Signature', '4/4']]
    });
  }

  function buildSounds() {
    const ROWS = [
      ['Alpha Pad Warm', 'Preset VST', 'HALion One', 'Synth Pad', ''],
      ['Alpha Bass Sub', 'Preset VST', 'HALion One', 'Bass', ''],
      ['Piano droit Alpha', 'Preset VST', 'HALion One', 'Piano', ''],
      ['Cordes Alpha', 'Preset VST', 'HALion One', 'Strings', ''],
      ['Kit électro 01', 'Kit de batterie', 'Groove Agent ONE', 'Drums', ''],
      ['Kit acoustique 02', 'Kit de batterie', 'Groove Agent ONE', 'Drums', ''],
      ['Clavier Rhodes', 'Preset VST', 'HALion One', 'E-Piano', '']
    ];
    return mediabayView({
      kind: 'sounds', title: 'Sound Browser', em: 'sons et presets VST Sound', preset: 'Vue MediaBay : sons et presets VST Sound',
      cols: ['Nom', 'Type', 'Instrument', 'Catégorie', ''],
      rows: ROWS,
      filters: ['Instrument', 'Catégorie', 'Caractère', 'Type de piste'],
      tree: [['Sons Alpha', true], ['HALion One', false], ['Groove Agent ONE', false], ['Presets VST', false], ['Kits de batterie', false]],
      info: [['Nom', 'Alpha Pad Warm'], ['Type', 'Preset VST (.vstpreset)'], ['Instrument', 'HALion One'], ['Catégorie', 'Synth Pad']]
    });
  }

  /* =====================================================================
     17. DISPOSITION DE FENÊTRE  (Set up Window Layout)
     ===================================================================== */
  function buildLayout(arg) {
    const EL = ['transport', 'infoline', 'inspector', 'toolbar', 'channel'];
    const NAME = {
      transport: 'Panneau Transport', infoline: 'Ligne d’info', inspector: 'Inspecteur',
      toolbar: 'Barres d’outils', channel: 'Réglages de canal'
    };
    const STATE = {
      transport: { vis: ['Position', 'Bars+Beats', 'Timecode', 'Tempo', 'Signature', 'Localisateurs', 'Boutons de transport', 'Cycle', 'Métronome', 'Nudge'], hid: ['Échelle de tempo', 'Marqueurs', 'Synchronisation'] },
      infoline: { vis: ['Nom', 'Début', 'Fin', 'Longueur', 'Décalage', 'Vélocité', 'Transposition'], hid: ['Hauteur', 'Canal MIDI'] },
      inspector: { vis: ['Nom de piste', 'Mute / Solo', 'Volume', 'Panoramique', 'Inserts', 'Égaliseur', 'Départs', 'Notepad'], hid: ['VSTi', 'Groupe', 'Écoute'] },
      toolbar: { vis: ['Outils', 'Accrochage', 'Zoom', 'Nudge', 'Grille', 'Type de piste'], hid: ['Enregistrement', 'Fenêtres'] },
      channel: { vis: ['Inserts', 'Égaliseur', 'Départs', 'Routage', 'Fader'], hid: ['Panner surround', 'Notepad'] }
    };
    let cur = (EL.indexOf(arg) >= 0) ? arg : 'transport';
    let sel = -1;      /* index sélectionné dans la colonne de gauche */
    function cols() {
      const st = STATE[cur];
      return '<div class="lay">' +
        '<div class="cols">' +
        '<div class="grp"><h6>Visibles — ' + NAME[cur] + '</h6>' +
        st.vis.map((v, i) => '<div class="dlg-check on' + (i === sel ? ' cur' : '') + '" data-vi="' + i + '"><i></i><span>' + v + '</span></div>').join('') +
        (st.vis.length ? '' : '<div class="none">— aucun élément visible —</div>') + '</div>' +
        '<div class="arrows">' +
        '<button class="lay-ar" data-laymove="hide" title="Masquer l’élément sélectionné">▶</button>' +
        '<button class="lay-ar" data-laymove="show" title="Afficher le premier élément masqué">◀</button>' +
        '<button class="lay-ar" data-laymove="up" title="Monter">▲</button>' +
        '<button class="lay-ar" data-laymove="down" title="Descendre">▼</button>' +
        '</div>' +
        '<div class="grp"><h6>Masqués</h6>' +
        st.hid.map((v, i) => '<div class="dlg-check" data-hi="' + i + '"><i></i><span>' + v + '</span></div>').join('') +
        (st.hid.length ? '' : '<div class="none">— aucun —</div>') + '</div>' +
        '</div>' +
        '<div class="lay-menu"><span class="w-lbl">Menu contextuel</span>' +
        btn('Tout afficher') + btn('Par défaut') + btn('Setup…') + '</div>' +
        '<div class="lay-menu"><span class="w-lbl">Presets</span>' +
        '<span class="w-field" style="min-width:170px">Configuration par défaut <i class="arr"></i></span>' +
        btn('Enregistrer…') + btn('Supprimer') + '</div>' +
        '<div class="hint">Nuendo 4 : mêmes options dans le menu contextuel du panneau (clic droit) — <b>Tout afficher</b>, ' +
        '<b>Par défaut</b>, <b>Setup…</b>, puis la liste des presets. Dans le dialogue, les flèches au milieu déplacent les ' +
        'éléments d’une colonne à l’autre et <b>les changements s’appliquent immédiatement</b> (manuel p. 506–507). ' +
        'Ici, Panneau Transport / Ligne d’info / Inspecteur agissent réellement sur la fenêtre de projet.</div>' +
        '</div>';
    }
    const html =
      '<div class="w-toolbar"><span class="w-lbl">Configurer</span>' +
      '<span class="w-field" style="min-width:150px" data-laysel><span data-layname>' + NAME[cur] + '</span> <i class="arr"></i></span>' +
      '<span style="flex:1"></span><span class="w-lbl">Alt+U</span></div>' +
      '<div class="dlg-pane w-scroll" data-laybody>' + cols() + '</div>' +
      '<div class="dlg-foot"><span class="hint">Menu contextuel d’un panneau ▸ Setup… — un seul panneau à la fois</span>' +
      btn('OK', 'on') + '</div>';
    return {
      title: 'Configuration des éléments <em>· Setup dialog</em>', ac: '#4f7188', html,
      after(body) {
        const box = $('[data-laybody]', body);
        function draw() { box.innerHTML = cols(); }
        /* les changements s'appliquent immédiatement au projet (p. 506-507) */
        function sync() {
          if (!A.setPanel) return;
          const on = (el) => STATE[el].vis.length > 0;
          A.setPanel('transport', on('transport'));
          A.setPanel('infoline', on('infoline'));
          A.setPanel('inspector', on('inspector'));
          A.setPanel('toolbar', on('toolbar'));
        }
        box.addEventListener('click', (e) => {
          const c = e.target.closest('.dlg-check');
          if (!c) return;
          if (c.hasAttribute('data-vi')) {
            const i = +c.dataset.vi;
            sel = (sel === i) ? -1 : i;
            draw();
            A.showToast('Élément sélectionné : ' + STATE[cur].vis[i] + '. Utilisez les flèches pour le déplacer ou le masquer.', 'Setup');
          } else {
            const i = +c.dataset.hi;
            const v = STATE[cur].hid[i];
            if (v === undefined) return;
            STATE[cur].hid.splice(i, 1);
            STATE[cur].vis.push(v);
            draw();
            A.showToast('« ' + v + ' » ajouté aux éléments visibles de ' + NAME[cur] + '.', 'Setup');
          }
        });
        body.addEventListener('click', (e) => {
          const ar = e.target.closest('[data-laymove]');
          const st = STATE[cur];
          if (ar) {
            const k = ar.dataset.laymove;
            if (k === 'hide') {
              if (sel < 0 || sel >= st.vis.length) { A.showToast('Sélectionnez d’abord un élément visible.', 'Setup'); return; }
              const v = st.vis.splice(sel, 1)[0];
              st.hid.push(v); sel = -1; draw(); sync();
            } else if (k === 'show') {
              if (!st.hid.length) { A.showToast('Aucun élément masqué à afficher.', 'Setup'); return; }
              const v = st.hid.shift();
              st.vis.push(v); draw(); sync();
            } else if (k === 'up' || k === 'down') {
              if (sel < 0 || sel >= st.vis.length) return;
              const n = sel + (k === 'up' ? -1 : 1);
              if (n < 0 || n >= st.vis.length) return;
              const tmp = st.vis[sel]; st.vis[sel] = st.vis[n]; st.vis[n] = tmp; sel = n; draw();
            }
            return;
          }
          const b = e.target.closest('.w-btn');
          if (!b) return;
          const t = b.textContent.trim();
          if (b.closest('[data-laysel]')) return;
          if (t === 'Tout afficher') {
            st.vis = st.vis.concat(st.hid); st.hid = []; sel = -1; draw(); sync();
            A.showToast('« Tout afficher » : tous les éléments de ' + NAME[cur] + ' sont visibles.', 'Setup');
          } else if (t === 'Par défaut') {
            const D = {
              transport: { vis: ['Position', 'Bars+Beats', 'Timecode', 'Tempo', 'Signature', 'Localisateurs', 'Boutons de transport', 'Cycle', 'Métronome', 'Nudge'], hid: ['Échelle de tempo', 'Marqueurs', 'Synchronisation'] },
              infoline: { vis: ['Nom', 'Début', 'Fin', 'Longueur', 'Décalage', 'Vélocité', 'Transposition'], hid: ['Hauteur', 'Canal MIDI'] },
              inspector: { vis: ['Nom de piste', 'Mute / Solo', 'Volume', 'Panoramique', 'Inserts', 'Égaliseur', 'Départs', 'Notepad'], hid: ['VSTi', 'Groupe', 'Écoute'] },
              toolbar: { vis: ['Outils', 'Accrochage', 'Zoom', 'Nudge', 'Grille', 'Type de piste'], hid: ['Enregistrement', 'Fenêtres'] },
              channel: { vis: ['Inserts', 'Égaliseur', 'Départs', 'Routage', 'Fader'], hid: ['Panner surround', 'Notepad'] }
            };
            STATE[cur].vis = D[cur].vis.slice();
            STATE[cur].hid = D[cur].hid.slice();
            sel = -1; draw(); sync();
            A.showToast('Disposition d’origine de ' + NAME[cur] + ' rétablie.', 'Setup');
          } else if (t === 'Setup…') {
            A.showToast('« Setup… » : ce dialogue est déjà ouvert.', 'Setup');
          } else if (t === 'OK') {
            W.close('layout'); return;
          } else if (t === 'Appliquer') {
            sync(); A.showToast('Configuration appliquée à la fenêtre de projet.', 'Setup'); return;
          } else if (t.indexOf('Enregistrer') === 0) {
            A.showToast('Preset enregistré : « Configuration ' + NAME[cur] + ' » (visible dans la liste des presets).', 'Setup');
          } else if (t === 'Supprimer') {
            A.showToast('Preset supprimé de la liste (le preset par défaut reste disponible).', 'Setup');
          } else {
            A.showToast('« ' + t + ' » : presets de configuration — étape 2.', 'Setup');
          }
        });
        $('[data-laysel]', body).addEventListener('click', (e) => {
          e.stopPropagation();
          cur = EL[(EL.indexOf(cur) + 1) % EL.length];
          sel = -1;
          $('[data-layname]', body).textContent = NAME[cur];
          draw();
          A.showToast('Élément à configurer : ' + NAME[cur] + '.', 'Setup');
        });
      }
    };
  }

  /* =====================================================================
     18. ESPACES DE TRAVAIL
     ===================================================================== */
  function buildWorkspaces() {
    const WS = W.WS;
    function tbl(list, kind) {
      if (!list.length) {
        return '<div class="empty2">' + (kind === 'ws'
          ? 'Aucun espace de travail dans ce projet.<br><span>Cliquez sur <b>Nouvel espace</b> : la disposition actuelle des fenêtres est mémorisée et rattachée au projet.</span>'
          : 'Aucun preset global.<br><span>Enregistrez un espace comme preset pour le réutiliser dans tous les projets (position et taille des fenêtres principales uniquement).</span>') + '</div>';
      }
      return '<table><thead><tr><th style="width:34px">N°</th>' +
        (WS.useIds ? '<th style="width:34px">ID</th>' : '') +
        '<th>Nom</th><th style="width:78px">État</th></tr></thead><tbody>' +
        list.map((w) => '<tr data-' + (kind === 'ws' ? 'ws' : 'wp') + '="' + w.n + '">' +
          '<td class="n">' + w.n + '</td>' +
          (WS.useIds ? '<td><input class="idin" value="' + (w.id || w.n) + '" data-wsid="' + w.n + '" data-kind="' + kind + '"></td>' : '') +
          '<td><input value="' + esc(w.name) + '" data-wsname="' + w.n + '" data-kind="' + kind + '"></td>' +
          '<td>' + (kind === 'ws' ? (w.locked ? 'Verrouillé' : 'Libre') : (w.active ? 'Actif' : '—')) + '</td></tr>').join('') +
        '</tbody></table>';
    }
    function html2() {
      return '<div class="ws2">' +
        '<div class="col"><h6>Espaces de travail du projet</h6><div class="lst" data-wslist>' + tbl(WS.list, 'ws') + '</div>' +
        '<div class="btns"><button data-wsnew="1">Nouvel espace</button><button data-wsupd="1">Mettre à jour</button>' +
        '<button data-wsdel="sel">Supprimer</button><button data-wsact="sel">Activer</button></div></div>' +
        '<div class="mid">' +
        '<button data-wscopy="toPreset" title="Copier l’espace sélectionné vers les presets globaux">▶</button>' +
        '<button data-wscopy="toProject" title="Copier le preset sélectionné vers le projet">◀</button>' +
        '</div>' +
        '<div class="col"><h6>Presets globaux</h6><div class="lst" data-wplist>' + tbl(WS.presets, 'wp') + '</div>' +
        '<div class="btns"><button data-wpnew="1">Nouveau preset</button><button data-wpdel="sel">Supprimer</button>' +
        '<button data-wpact="sel">Activer</button></div></div>' +
        '</div>';
    }
    const html =
      '<div class="ws">' +
      '<div class="head">' + btn('Nouvel espace', 'on', ' data-wsnew="1"') +
      '<span class="w-sep"></span>' +
      '<label class="ck" data-toggle="locked"><i class="' + (WS.locked ? 'on' : '') + '"></i>Verrouiller l’espace actif</label>' +
      '<label class="ck" data-toggle="useIds"><i class="' + (WS.useIds ? 'on' : '') + '"></i>Utiliser les ID</label>' +
      '<span style="flex:1"></span>' +
      '<label class="ck" data-toggle="showProjectPresets"><i class="' + (WS.showProjectPresets ? 'on' : '') + '"></i>Presets du projet</label>' +
      '<label class="ck" data-toggle="autoInstantiate"><i class="' + (WS.autoInstantiate ? 'on' : '') + '"></i>Instancier les presets automatiquement</label>' +
      '</div>' +
      '<div class="body2" data-wsbody>' + html2() + '</div>' +
      '<div class="aw-foot"><span>Organiser les espaces de travail — Window ▸ Workspaces ▸ Organize…</span>' +
      '<span style="flex:1"></span><span>9 espaces rappelables par commande · Alt+0 verrouille</span></div>';
    return {
      title: 'Organiser les espaces de travail <em>· Organize Workspaces</em>', ac: '#4d7cab', html,
      after(body) {
        let selKind = 'ws';
        let selN = null;
        const draw = () => { $('[data-wsbody]', body).innerHTML = html2(); bind(); };
        function current() {
          const arr = selKind === 'ws' ? WS.list : WS.presets;
          return arr.filter((x) => x.n === selN)[0];
        }
        function bind() {
          $$('[data-ws], [data-wp]', body).forEach((tr) => tr.addEventListener('click', () => {
            selKind = tr.hasAttribute('data-ws') ? 'ws' : 'wp';
            selN = Number(tr.getAttribute('data-' + selKind));
            $$('[data-ws], [data-wp]', body).forEach((x) => x.classList.remove('on'));
            tr.classList.add('on');
          }));
          $$('[data-ws] input, [data-wp] input', body).forEach((inp) => {
            inp.addEventListener('change', () => {
              const kind = inp.dataset.kind;
              const arr = kind === 'ws' ? WS.list : WS.presets;
              const w = arr.filter((x) => x.n === Number(inp.dataset.wsname || inp.dataset.wsid))[0];
              if (!w) return;
              if (inp.dataset.wsid) w.id = Math.max(1, Math.min(9, Number(inp.value) || w.id));
              else w.name = inp.value || w.name;
              W.persist();
            });
          });
          $$('[data-wsnew]', body).forEach((b) => b.addEventListener('click', () => {
            W.saveWorkspace(); draw();
            A.showToast('Espace de travail <b>' + WS.list.length + '</b> mémorisé (fenêtres, tailles et panneaux).', 'Espaces de travail');
          }));
          $$('[data-wsupd]', body).forEach((b) => b.addEventListener('click', () => {
            const ok = W.updateWorkspace();
            A.showToast(ok ? 'Espace actif mis à jour avec la disposition courante.'
              : 'Aucun espace actif, ou espace verrouillé : modification refusée.', 'Espaces de travail');
            draw();
          }));
          $$('[data-wsact]', body).forEach((b) => b.addEventListener('click', () => {
            if (!current()) { A.showToast('Sélectionnez d’abord une ligne.', 'Espaces de travail'); return; }
            if (selKind === 'ws') W.recallWorkspace(current().n);
            else A.showToast('Preset « ' + current().name + ' » instancié (démonstration).', 'Espaces de travail');
            draw();
          }));
          $$('[data-wsdel]', body).forEach((b) => b.addEventListener('click', () => {
            if (!current()) { A.showToast('Sélectionnez d’abord une ligne.', 'Espaces de travail'); return; }
            if (selKind === 'ws') WS.list = WS.list.filter((x) => x !== current());
            else WS.presets = WS.presets.filter((x) => x !== current());
            W.persist(); selN = null; draw();
          }));
          $$('[data-wpnew]', body).forEach((b) => b.addEventListener('click', () => {
            const n = (WS.presets.length ? Math.max.apply(null, WS.presets.map((x) => x.n)) : 0) + 1;
            WS.presets.push({ n, name: 'Preset ' + n, id: n, layout: W.captureLayout() });
            W.persist(); draw();
            A.showToast('Preset global <b>' + n + '</b> enregistré.', 'Espaces de travail');
          }));
          $$('[data-wpdel]', body).forEach((b) => b.addEventListener('click', () => {
            if (selKind !== 'wp' || !current()) { A.showToast('Sélectionnez un preset dans la liste de droite.', 'Espaces de travail'); return; }
            WS.presets = WS.presets.filter((x) => x !== current());
            W.persist(); selN = null; draw();
          }));
          $$('[data-wpact]', body).forEach((b) => b.addEventListener('click', () => {
            if (selKind !== 'wp' || !current()) { A.showToast('Sélectionnez un preset dans la liste de droite.', 'Espaces de travail'); return; }
            WS.list.push({ n: ++WS.seq, name: current().name, id: current().id, layout: current().layout });
            W.persist(); draw();
            A.showToast('Preset copié dans les espaces du projet.', 'Espaces de travail');
          }));
          $$('[data-wscopy]', body).forEach((b) => b.addEventListener('click', () => {
            if (!current()) { A.showToast('Sélectionnez d’abord une ligne.', 'Espaces de travail'); return; }
            if (b.dataset.wscopy === 'toPreset' && selKind === 'ws') {
              const n = (WS.presets.length ? Math.max.apply(null, WS.presets.map((x) => x.n)) : 0) + 1;
              WS.presets.push({ n, name: current().name, id: current().id, layout: current().layout });
              W.persist(); draw();
              A.showToast('Espace copié vers les presets globaux.', 'Espaces de travail');
            } else if (b.dataset.wscopy === 'toProject' && selKind === 'wp') {
              WS.list.push({ n: ++WS.seq, name: current().name, id: current().id, layout: current().layout });
              W.persist(); draw();
              A.showToast('Preset copié vers le projet.', 'Espaces de travail');
            } else {
              A.showToast('Copie impossible : sélectionnez une ligne du bon côté (espace → presets, preset → projet).', 'Espaces de travail');
            }
          }));
          $$('[data-toggle]', body).forEach((l) => l.addEventListener('click', () => {
            const k = l.dataset.toggle;
            WS[k] = !WS[k];
            l.querySelector('i').classList.toggle('on', WS[k]);
            W.persist();
            if (k === 'locked') A.showToast('Espace actif ' + (WS.locked ? 'verrouillé' : 'déverrouillé') + '.', 'Espaces de travail');
            if (k === 'useIds') { draw(); A.showToast('Utiliser les ID : ' + (WS.useIds ? 'les commandes visent l’ID (1–9)' : 'les commandes visent l’ordre de la liste') + '.', 'Espaces de travail'); }
            if (k === 'showProjectPresets') A.showToast('Presets du projet : ' + (WS.showProjectPresets ? 'affichés' : 'masqués') + ' (démonstration).', 'Espaces de travail');
            if (k === 'autoInstantiate') A.showToast('Instancier les presets automatiquement : ' + (WS.autoInstantiate ? 'activé' : 'désactivé') + '.', 'Espaces de travail');
          }));
        }
        bind();
      }
    };
  }

  /* =====================================================================
     ENREGISTREMENT
     ===================================================================== */
  W.register({
    mediabay: { label: 'MediaBay', x: 300, y: 140, w: 820, h: 500, ac: '#c99436', build: buildMediabay },
    perf: { label: 'Performances VST', x: 500, y: 190, w: 452, h: 302, ac: '#7a4a3a', build: buildPerf },
    tempo: { label: 'Éditeur de piste de tempo', x: 260, y: 140, w: 900, h: 486, ac: '#4f7188', build: buildTempo },
    browser: { label: 'Navigateur de projet', x: 280, y: 160, w: 820, h: 540, ac: '#5a7fa3', build: buildBrowser },
    tracksheet: { label: 'Feuille de pistes', x: 300, y: 170, w: 760, h: 420, ac: '#6f7d86', build: buildTrackSheet },
    setup: { label: 'Configuration du projet', x: 420, y: 170, w: 520, h: 440, ac: '#4f7188', build: buildSetup },
    prefs: { label: 'Préférences', x: 360, y: 160, w: 620, h: 344, fit: true, minH: 404, ac: '#5a7fa3', build: buildPrefs },
    devices: { label: 'Configuration des périphériques', x: 400, y: 180, w: 560, h: 332, fit: true, minH: 360, ac: '#4f7188', build: buildDevices },
    keycmd: { label: 'Commandes clavier', x: 290, y: 120, w: 680, h: 618, ac: '#6f7d86', build: buildKeyCmd },
    video: { label: 'Vidéo', x: 420, y: 170, w: 604, h: 462, ac: '#4a5560', build: buildVideo },
    croom: { label: 'Mixer Control Room', x: 300, y: 160, w: 940, h: 486, ac: '#4d7cab', build: buildCroom },
    exportmix: { label: 'Exportation du mixage audio', x: 340, y: 90, w: 680, h: 600, ac: '#3f6c98', build: buildExport },
    fade: { label: 'Fondu', x: 400, y: 200, w: 490, h: 340, fit: true, ac: '#8a8450', build: buildFade },
    crossfade: { label: 'Fondu enchaîné', x: 420, y: 210, w: 600, h: 360, fit: true, ac: '#8a8450', build: buildCrossfade },
    detect: { label: 'Détection des silences', x: 360, y: 180, w: 700, h: 412, ac: '#6f7d86', build: buildDetect },
    spectrum: { label: 'Analyseur de spectre', x: 420, y: 200, w: 560, h: 330, ac: '#3f6c98', build: buildSpectrum },
    stats: { label: 'Statistiques', x: 460, y: 210, w: 470, h: 330, ac: '#6f7d86', build: buildStats },
    audiopart: { label: 'Éditeur de parties audio', x: 340, y: 190, w: 740, h: 430, ac: '#6f7d86', build: buildAudioPart },
    listeditor: { label: 'Éditeur de liste', x: 320, y: 170, w: 760, h: 540, ac: '#6a5d94', build: buildListEditor },
    loops: { label: 'Loop Browser', x: 340, y: 180, w: 820, h: 380, ac: '#c99436', build: buildLoops },
    sounds: { label: 'Sound Browser', x: 360, y: 190, w: 840, h: 400, ac: '#7466a0', build: buildSounds },
    layout: { label: 'Configuration des éléments (Setup)', x: 420, y: 170, w: 620, h: 468, ac: '#4f7188', build: buildLayout },
    workspaces: { label: 'Organiser les espaces de travail', x: 380, y: 180, w: 660, h: 420, ac: '#4d7cab', build: buildWorkspaces }
  });
})();
