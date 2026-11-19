/* =========================================================================
   ALPHA Studio — Fenêtres du lot 3 (manquant dans Nuendo 4)
   Informations sur les plug-ins · Éditeur logique · Input Transformer ·
   Project Logical Editor · MIDI Device Manager · Presets de piste ·
   Setup de quantize · Beat Calculator · Import Medium · OMF/AAF ·
   Traitement par lot · Surround Panner · Synchronisation · Machine Control ·
   VST System Link · ReWire.
   ========================================================================= */
(function () {
  'use strict';

  const A = window.ALPHA || {};
  const W = window.ALPHAWIN;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  if (!W) { console.warn('ALPHAWIN absent : fenêtres du lot 3 non chargées'); return; }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const btn = (label, cls, attrs) => '<button class="w-btn' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '>' + label + '</button>';
  const chk = (label, on) => '<div class="dlg-check' + (on ? ' on' : '') + '"><i></i><span>' + label + '</span></div>';
  const dlgRow = (label, value, arr) => '<div class="dlg-row"><label>' + label + '</label><div class="f' + (arr ? ' arr' : '') + '">' + value + (arr ? '<i class="arr"></i>' : '') + '</div></div>';
  const sec = (t) => '<h5 class="w3-sec">' + t + '</h5>';

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

  /* racine des fenêtres du lot 3 : colonne qui remplit le corps de fenêtre */
  const ROOT = '.w3-pi,.w3-le,.w3-md,.w3-tp,.w3-qs,.w3-bc,.w3-im,.w3-omf,.w3-batch,.w3-sur,.w3-sync,.w3-mc,.w3-sl,.w3-rw';

  /* petite fenêtre flottante de menu, partagée */
  function popMenu(anchor, id, title, items, onPick) {
    const old = document.getElementById(id);
    if (old) { old.remove(); return null; }
    const m = document.createElement('div');
    m.id = id;
    m.className = 'w3-pop';
    m.innerHTML = (title ? '<div class="ph">' + title + '</div>' : '') +
      items.map((it) => '<div data-pick="' + it[0] + '"><i class="' + (it[2] ? 'on' : '') + '"></i>' + it[1] + '</div>').join('');
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.min(r.left, window.innerWidth - 230) + 'px';
    m.style.top = Math.min(r.bottom + 2, window.innerHeight - 40 - items.length * 17) + 'px';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pick]');
      if (!t) return;
      if (onPick) onPick(t.dataset.pick, t, m);
      if (t.dataset.pick !== 'keep') m.remove();
    });
    setTimeout(() => {
      const off = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('mousedown', off); } };
      document.addEventListener('mousedown', off);
    }, 0);
    return m;
  }

  /* listes de choix rapides pour les champs « à flèche » */
  const CYCLES = {
    'Format': ['Wave (.wav)', 'Broadcast Wave (.wav)', 'AIFF (.aif)', 'OMF 2.0', 'AAV (Avid)', 'AES31', 'OpenTL', 'MPEG 1 Layer 3'],
    'Grille': ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/4 T', '1/8 T', '1/4 pointé'],
    'Type': ['Auto', 'Quantize', 'Straight', 'Triplet', 'Dotted'],
    'Résolution': ['8 bit', '16 bit', '24 bit', '32 bit (float)'],
    'Version OMF': ['1.0 File', '2.0 File'],
    'Échantillonnage': ['44 100 Hz', '48 000 Hz', '88 200 Hz', '96 000 Hz', '192 000 Hz'],
    'Configuration': ['Mono', 'Stéréo', '5.1', 'LCRS', 'Quadro'],
    'Mode': ['Standard', 'Position', 'Angle'],
    'Mono/Stereo': ['Mix mono', 'Y-Mirror', 'X-Mirror', 'Rotate'],
    'Langue': ['Français', 'English', 'Deutsch', 'Español']
  };
  function cycleField(body, root, onSet) {
    $$('.dlg-row .arr', root).forEach((a) => a.addEventListener('click', () => {
      const row = a.closest('.dlg-row');
      if (!row) return;
      const lbl = row.querySelector('label').textContent.trim();
      const list = CYCLES[lbl];
      if (!list) { A.showToast('Champ numérique ou texte : cliquez dans la valeur pour la saisir.', 'ALPHA'); return; }
      const f = row.querySelector('.f');
      const cur = f ? f.textContent.replace('▾', '').trim() : '';
      const nxt = list[(list.indexOf(cur) + 1) % list.length];
      if (f) f.innerHTML = nxt + '<i class="arr"></i>';
      if (onSet) onSet(lbl, nxt);
    }));
  }

  /* =====================================================================
     1. INFORMATIONS SUR LES PLUG-INS  (Plug-in Information)
     ===================================================================== */
  const PLUGINS = [
    { n: 'Alpha Reverb Space', v: '1.2.0', sdk: 'VST 2.4', lat: 0, sc: 0, io: '2 / 2', p: 'C:\\Program Files\\Steinberg\\VSTPlugins\\Alpha', on: true, inst: 3, cat: 'Reverb' },
    { n: 'Alpha Comp VCA', v: '1.0.4', sdk: 'VST 2.3', lat: 64, sc: 1, io: '2 / 2', p: 'C:\\Program Files\\Steinberg\\VSTPlugins\\Alpha', on: true, inst: 5, cat: 'Dynamics' },
    { n: 'Alpha Delay Echo', v: '2.0.1', sdk: 'VST 2.4', lat: 0, sc: 0, io: '2 / 2', p: 'C:\\Program Files\\Steinberg\\VSTPlugins\\Alpha', on: true, inst: 2, cat: 'Delay' },
    { n: 'Alpha EQ Studio', v: '1.5.2', sdk: 'VST 2.4', lat: 32, sc: 0, io: '2 / 2', p: 'C:\\Program Files\\Steinberg\\VSTPlugins\\Alpha', on: true, inst: 8, cat: 'EQ' },
    { n: 'De-Esser Pro', v: '1.0.0', sdk: 'VST 2.3', lat: 0, sc: 1, io: '1 / 1', p: 'C:\\Program Files\\Steinberg\\VSTPlugins\\Alpha', on: true, inst: 1, cat: 'Dynamics' },
    { n: 'MixConvert', v: '1.1.0', sdk: 'VST 2.4', lat: 0, sc: 0, io: '6 / 2', p: 'C:\\Program Files\\Steinberg\\Nuendo 4\\VSTPlugins', on: true, inst: 0, cat: 'Surround' },
    { n: 'SurroundPan', v: '1.0.2', sdk: 'VST 2.4', lat: 0, sc: 0, io: '2 / 6', p: 'C:\\Program Files\\Steinberg\\Nuendo 4\\VSTPlugins', on: true, inst: 1, cat: 'Surround' },
    { n: 'Alpha Sampler', v: '3.0.0', sdk: 'VST 2.4', lat: 0, sc: 0, io: '0 / 2', p: 'C:\\Program Files\\Steinberg\\VSTPlugins\\Alpha', on: true, inst: 1, cat: 'Instrument' },
    { n: 'AlphaPulse 2', v: '2.1.3', sdk: 'VST 2.4', lat: 0, sc: 0, io: '0 / 2', p: 'C:\\Program Files\\Steinberg\\VSTPlugins\\Alpha', on: true, inst: 1, cat: 'Instrument' },
    { n: 'UV-22HR', v: '1.0.0', sdk: 'VST 2.2', lat: 0, sc: 0, io: '2 / 2', p: 'C:\\Program Files\\Steinberg\\Nuendo 4\\VSTPlugins', on: true, inst: 0, cat: 'Mastering' },
    { n: 'Alpha Arp', v: '1.0.1', sdk: 'VST 2.2', lat: 0, sc: 0, io: 'MIDI 1 / 1', p: 'C:\\Program Files\\Steinberg\\Nuendo 4\\VSTPlugins', on: false, inst: 0, cat: 'MIDI' },
    { n: 'Vintage Chorus', v: '0.9.8', sdk: 'VST 2.3', lat: 16, sc: 0, io: '2 / 2', p: 'D:\\VST\\Divers', on: false, inst: 0, cat: 'Modulation' }
  ];
  function buildPluginInfo() {
    const st = { tab: 'vst', q: '', sort: 'n', asc: true, sel: 0 };
    const TABS = [['vst', 'Plug-ins VST', 'vst'], ['midi', 'Plug-ins MIDI', 'midi'], ['codec', 'Codecs audio', 'codec']];
    const CODECS = [
      { n: 'MPEG 1 Layer 3', v: '1.0', sdk: 'Codec', lat: 0, sc: 0, io: '2 / 2', p: 'Nuendo 4\\Codecs', on: true, inst: 0, cat: 'Encodeur' },
      { n: 'Ogg Vorbis', v: '1.0', sdk: 'Codec', lat: 0, sc: 0, io: '2 / 2', p: 'Nuendo 4\\Codecs', on: true, inst: 0, cat: 'Encodeur' },
      { n: 'Windows Media Audio Pro', v: '1.0', sdk: 'Codec', lat: 0, sc: 0, io: '2 / 2', p: 'Nuendo 4\\Codecs', on: true, inst: 0, cat: 'Encodeur' },
      { n: 'Dolby Digital AC3', v: '1.0', sdk: 'Codec', lat: 0, sc: 0, io: '6 / 1', p: 'Nuendo 4\\Codecs', on: false, inst: 0, cat: 'Encodeur' }
    ];
    function list() {
      return st.tab === 'codec' ? CODECS : PLUGINS.filter((p) => (st.tab === 'midi' ? p.cat === 'MIDI' : p.cat !== 'MIDI'));
    }
    function rows() {
      let l = list().slice();
      l.sort((a, b) => {
        const k = st.sort;
        const va = String(a[k]).toLowerCase(), vb = String(b[k]).toLowerCase();
        return (va < vb ? -1 : va > vb ? 1 : 0) * (st.asc ? 1 : -1);
      });
      if (st.q) l = l.filter((p) => (p.n + ' ' + p.p + ' ' + p.cat).toLowerCase().indexOf(st.q) >= 0);
      return l.map((p, i) => {
        const gi = list().indexOf(p);
        return '<tr data-pl="' + gi + '"' + (gi === st.sel ? ' class="sel"' : '') + '>' +
          '<td class="on"><span class="w3-cbx' + (p.on ? ' on' : '') + '" data-plon="' + gi + '"></span></td>' +
          '<td>' + esc(p.n) + '</td><td>' + p.cat + '</td><td class="num">' + p.v + '</td><td class="num">' + p.sdk + '</td>' +
          '<td class="num">' + p.lat + '</td><td class="num">' + (p.sc || '—') + '</td><td class="num">' + p.io + '</td>' +
          '<td class="num">' + (p.inst ? '<u data-plinst="' + gi + '">' + p.inst + '</u>' : '') + '</td>' +
          '<td class="pth">' + esc(p.p) + '</td></tr>';
      }).join('');
    }
    const html = () =>
      '<div class="w3-pi">' +
      '<div class="w-toolbar">' +
      TABS.map((t) => '<button class="w-btn' + (t[0] === st.tab ? ' on' : '') + '" data-pitab="' + t[0] + '">' + t[1] + '</button>').join('') +
      '<span class="w-sep"></span>' +
      '<input class="w-input" data-piq placeholder="Rechercher…" style="width:130px">' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-pia="update" title="Nouvelle analyse des dossiers VST">Mettre à jour</button>' +
      '<button class="w-btn" data-pia="paths" title="Dossiers de plug-ins VST 2.x">Chemins VST 2.x…</button>' +
      '<button class="w-btn" data-pia="export" title="Exporter la liste des plug-ins en XML">Exporter…</button>' +
      '</div>' +
      '<div class="w3-scroll"><table class="w3-table pi-table"><thead><tr>' +
      '<th style="width:34px" title="Plug-in activé pour les menus">Activé</th><th>Nom du plug-in</th><th style="width:74px">Catégorie</th>' +
      '<th style="width:52px">Version</th><th style="width:52px">SDK VST</th><th style="width:48px">Latence</th>' +
      '<th style="width:56px" title="Entrées side-chain">Side-ch.</th><th style="width:66px">E/S</th>' +
      '<th style="width:52px" title="Instances en cours">Utilisé</th><th>Dossier</th>' +
      '</tr></thead><tbody data-pibody>' + rows() + '</tbody></table></div>' +
      '<div class="w3-foot"><span>Latence en échantillons · compensée automatiquement en insert</span>' +
      '<span style="flex:1"></span><span data-piinfo></span></div>' +
      '</div>';
    return {
      title: 'Informations sur les plug-ins <em>· Plug-in Information</em>', ac: '#4f7188', fit: false,
      html: html(),
      after(body) {
        const redraw = () => {
          $('[data-pibody]', body).innerHTML = rows();
          const l = list();
          $('[data-piinfo]', body).textContent = l.filter((p) => p.on).length + ' activés · ' + l.length + ' installés · ' +
            l.reduce((a, p) => a + p.inst, 0) + ' instances';
          bind();
        };
        function bind() {
          $$('[data-pitab]', body).forEach((b) => b.addEventListener('click', () => {
            st.tab = b.dataset.pitab; st.sel = 0;
            $$('[data-pitab]', body).forEach((x) => x.classList.toggle('on', x === b));
            redraw();
          }));
          $$('[data-pl]', body).forEach((tr) => tr.addEventListener('click', () => {
            st.sel = +tr.dataset.pl;
            $$('[data-pl]', body).forEach((x) => x.classList.toggle('sel', x === tr));
          }));
          $$('[data-plon]', body).forEach((c) => c.addEventListener('click', (e) => {
            e.stopPropagation();
            const p = list()[+c.dataset.plon];
            if (!p) return;
            p.on = !p.on;
            redraw();
            A.showToast('« ' + p.n + ' » ' + (p.on ? 'activé : il apparaît dans les menus d’effets.' : 'désactivé : il disparaît des menus, sans retirer les instances existantes.'), 'Plug-in Information');
          }));
          $$('[data-plinst]', body).forEach((u) => u.addEventListener('click', (e) => {
            e.stopPropagation();
            const p = list()[+u.dataset.plinst];
            if (!p) return;
            A.showToast('« ' + p.n + ' » : ' + p.inst + ' instance(s) — ' + (p.n.indexOf('Alpha') === 0 ? 'Voix Lead › Inserts 1 · Chœurs › Inserts 2 · Bus Drums › Inserts 1' : 'réparties sur les pistes du projet') + '.', 'Plug-in Information');
          }));
          const q = $('[data-piq]', body);
          if (q) q.addEventListener('input', () => { st.q = q.value.toLowerCase().trim(); redraw(); });
          $$('.pi-table th', body).forEach((th, i) => {
            th.addEventListener('click', () => {
              /* le clic sur un en-tête trie : on protège contre tout index hors table */
              const p = list()[st.sel];
              if (p && st.sort === 'on' && st.asc === undefined) st.asc = true;
              st.sort = 'n'; st.asc = true;
              redraw();
            });
          });
          $$('[data-pia]', body).forEach((b) => b.addEventListener('click', () => {
            const k = b.dataset.pia;
            if (k === 'update') { A.showToast('Analyse des dossiers VST : 12 plug-ins, 3 codecs, aucune erreur.', 'Plug-in Information'); redraw(); }
            if (k === 'paths') { A.showToast('Dossiers VST 2.x : C:\\Program Files\\Steinberg\\VSTPlugins · C:\\Program Files\\Steinberg\\Nuendo 4\\VSTPlugins · D:\\VST\\Divers — Ajouter / Supprimer / Définir comme dossier partagé.', 'Plug-in Information'); }
            if (k === 'export') { A.showToast('Liste exportée vers « Plugins_Alpha.xml » (VST, MIDI et codecs).', 'Plug-in Information'); }
          }));
        }
        redraw();
      }
    };
  }

  /* =====================================================================
     2. ÉDITEUR LOGIQUE  (Logical Editor)
     ===================================================================== */
  const LE_COND = [
    ['Type', ['Égal', 'Différent', 'Contient'], 'Note'],
    ['Position', ['Égal', 'Supérieur à', 'Inférieur à', 'Dans la plage'], '1.1.1.0'],
    ['Longueur', ['Égal', 'Supérieur à', 'Inférieur à'], '0.1.0.0'],
    ['Valeur 1 (hauteur)', ['Égal', 'Supérieur à', 'Inférieur à', 'Dernière note'], '60'],
    ['Valeur 2 (vélocité)', ['Égal', 'Supérieur à', 'Inférieur à'], '100'],
    ['Canal', ['Égal', 'Différent'], '1']
  ];
  const LE_FUNC = ['Transpose', 'Égaliser la vélocité', 'Compresser la vélocité', 'Quantifier les longueurs', 'Supprimer', 'Déplacer', 'Sélectionner', 'Insérer'];
  const LE_ACT = [
    ['Valeur 1 (hauteur)', ['Ajouter', 'Soustraire', 'Définir'], '12'],
    ['Valeur 2 (vélocité)', ['Ajouter', 'Soustraire', 'Définir', 'Multiplier par'], '0'],
    ['Position', ['Ajouter', 'Soustraire', 'Définir'], '0.0.0.0'],
    ['Longueur', ['Ajouter', 'Soustraire', 'Définir'], '0.0.0.0']
  ];
  const LE_PRESETS = ['Transposer les doublages d’une octave', 'Limiter la vélocité à 100', 'Supprimer les notes très courtes',
    'Quantifier les fins de notes', 'Sélectionner les notes hors gamme', 'Compresser la vélocité vers le centre'];

  function logicalWin(cfg) {
    /* cfg : title, em, kind (midi | project), conds, funcs, acts, presets */
    const st = {
      cond: cfg.conds.map((c, i) => ({ on: i < 2, f: c[0], ops: c[1].slice(), op: c[1][0], v: c[2] })),
      acts: cfg.acts.map((a, i) => ({ on: i === 0, f: a[0], ops: a[1].slice(), op: a[1][0], v: a[2] })),
      fn: cfg.funcs[0], preset: cfg.presets[0], bool: 'Toutes les conditions'
    };
    const opSel = (list, cur, attr, i) => '<div class="w3-sel" data-' + attr + '="' + i + '">' + cur + '<i class="arr"></i></div>';
    function condRows() {
      if (!st.cond.length) return '<tr><td colspan="5" class="w3-empty">Aucune condition — « + Ajouter une condition ».</td></tr>';
      return st.cond.map((c, i) =>
        '<tr><td class="on"><span class="w3-cbx' + (c.on ? ' on' : '') + '" data-lec="' + i + '"></span></td>' +
        '<td class="fld">' + c.f + '</td>' +
        '<td>' + opSel(c.ops, c.op, 'leop', i) + '</td>' +
        '<td><input class="w-input w3-mini" data-lev="' + i + '" value="' + esc(c.v) + '"></td>' +
        '<td class="del"><button class="w-btn w3-x" data-ledel="' + i + '">✕</button></td></tr>').join('');
    }
    function actRows() {
      if (!st.acts.length) return '<tr><td colspan="4" class="w3-empty">Aucune action.</td></tr>';
      return st.acts.map((a, i) =>
        '<tr><td class="on"><span class="w3-cbx' + (a.on ? ' on' : '') + '" data-lea="' + i + '"></span></td>' +
        '<td class="fld">' + a.f + '</td>' +
        '<td>' + opSel(a.ops, a.op, 'leaop', i) + '</td>' +
        '<td><input class="w-input w3-mini" data-leav="' + i + '" value="' + esc(a.v) + '"></td></tr>').join('');
    }
    const html = () =>
      '<div class="w3-le">' +
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Preset</span><button class="w-btn" data-lepreset="1">' + st.preset + ' ▾</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-lea2="store" title="Stocker les réglages comme preset">Stocker…</button>' +
      '<button class="w-btn" data-lea2="rename">Renommer</button>' +
      '<button class="w-btn" data-lea2="del">Supprimer</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-lea2="load">Charger…</button>' +
      '</div>' +
      '<div class="w3-scroll w3-lebody">' +
      '<div class="le-sec"><h6>Filtre — conditions</h6>' +
      '<div class="le-bar"><span class="w3-sel" data-lebool>' + st.bool + '<i class="arr"></i></span>' +
      '<span class="le-hint le-hint2">des conditions suivantes doivent être remplies :</span>' +
      '<span style="flex:1"></span><button class="w-btn" data-leadd="cond">+ Ajouter une condition</button></div>' +
      '<table class="w3-table le-table"><tbody data-lecond>' + condRows() + '</tbody></table></div>' +
      '<div class="le-sec"><h6>Fonction</h6>' +
      '<div class="le-bar"><span class="le-hint">Appliquer la fonction</span>' +
      '<span class="w3-sel" data-lefn>' + st.fn + '<i class="arr"></i></span>' +
      '<span class="le-hint le-hint2">aux éléments qui remplissent les conditions.</span></div></div>' +
      '<div class="le-sec"><h6>Action</h6>' +
      '<div class="le-bar"><span class="le-hint">Exécuter les actions suivantes :</span>' +
      '<span style="flex:1"></span><button class="w-btn" data-leadd="act">+ Ajouter une action</button></div>' +
      '<table class="w3-table le-table"><tbody data-leact>' + actRows() + '</tbody></table></div>' +
      (cfg.kind === 'midi' ? '<div class="le-sec"><h6>Transformation en temps réel</h6>' +
        '<div class="le-bar">' + chk('Transformer en temps réel (Input Transformer)', false) +
        '<span class="le-hint">Les conditions filtrent les événements MIDI entrants.</span></div></div>' : '') +
      '</div>' +
      '<div class="w3-foot">' +
      btn('Appliquer', '', ' data-leapply="1"') +
      '<button class="w-btn" data-lea2="apply">Appliquer à la sélection</button>' +
      '<span style="flex:1"></span>' +
      '<span class="le-hint" data-leinfo></span>' +
      '</div></div>';
    return {
      title: cfg.title, ac: cfg.ac, html: html(),
      after(body) {
        const info = () => {
          const el = $('[data-leinfo]', body);
          if (el) el.textContent = st.cond.filter((c) => c.on).length + ' condition(s) · fonction « ' +
            st.fn + ' » · ' + st.acts.filter((a) => a.on).length + ' action(s)';
        };
        const redraw = () => {
          $('[data-lecond]', body).innerHTML = condRows();
          $('[data-leact]', body).innerHTML = actRows();
          info();
          bind();
        };
        function bind() {
          $$('[data-lec]', body).forEach((c) => c.addEventListener('click', (e) => {
            e.stopPropagation();
            const it = st.cond[+c.dataset.lec];
            if (!it) return;
            it.on = !it.on;
            redraw();
          }));
          $$('[data-lea]', body).forEach((c) => c.addEventListener('click', (e) => {
            e.stopPropagation();
            const it = st.acts[+c.dataset.lea];
            if (!it) return;
            it.on = !it.on;
            redraw();
          }));
          $$('[data-lev]', body).forEach((i) => i.addEventListener('input', () => {
            const it = st.cond[+i.dataset.lev]; if (it) it.v = i.value;
          }));
          $$('[data-leav]', body).forEach((i) => i.addEventListener('input', () => {
            const it = st.acts[+i.dataset.leav]; if (it) it.v = i.value;
          }));
          $$('[data-ledel]', body).forEach((b) => b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (st.cond.length <= 1) { A.showToast('Gardez au moins une condition.', cfg.label); return; }
            st.cond.splice(+b.dataset.ledel, 1);
            redraw();
          }));
          $$('[data-leop]', body).forEach((s) => s.addEventListener('click', () => {
            const it = st.cond[+s.dataset.leop];
            if (!it) return;
            it.op = it.ops[(it.ops.indexOf(it.op) + 1) % it.ops.length];
            redraw();
          }));
          $$('[data-leaop]', body).forEach((s) => s.addEventListener('click', () => {
            const it = st.acts[+s.dataset.leaop];
            if (!it) return;
            it.op = it.ops[(it.ops.indexOf(it.op) + 1) % it.ops.length];
            redraw();
          }));
          const fb = $('[data-lefn]', body);
          if (fb) fb.addEventListener('click', () => {
            popMenu(fb, 'leFnMenu', 'Fonction', cfg.funcs.map((f) => [f, f, f === st.fn]), (k) => { st.fn = k; redraw(); });
          });
          const bb = $('[data-lebool]', body);
          if (bb) bb.addEventListener('click', () => {
            popMenu(bb, 'leBoolMenu', 'Combinaison', [['toutes', 'Toutes les conditions'], ['au moins une', 'Au moins une condition']],
              (k) => { st.bool = k === 'toutes' ? 'Toutes les conditions' : 'Au moins une condition'; redraw(); });
          });
          $$('[data-leadd]', body).forEach((b) => b.addEventListener('click', () => {
            if (b.dataset.leadd === 'cond') {
              st.cond.push({ on: true, f: 'Canal', ops: ['Égal', 'Différent'], op: 'Égal', v: '1' });
            } else {
              st.acts.push({ on: true, f: 'Longueur', ops: ['Ajouter', 'Soustraire', 'Définir'], op: 'Définir', v: '0.1.0.0' });
            }
            redraw();
          }));
          const pb = $('[data-lepreset]', body);
          if (pb) pb.addEventListener('click', () => {
            popMenu(pb, 'lePresetMenu', 'Presets', cfg.presets.map((p) => [p, p, p === st.preset]), (k) => {
              st.preset = k;
              pb.textContent = k + ' ▾';
              A.showToast('Preset « ' + k + ' » chargé : conditions, fonction et actions appliquées au filtre.', cfg.label);
            });
          });
          //Traduction réelle de l'interface vers le modèle LogicalRule du noyau.
          const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
          const condValue = (field) => {
            const c = st.cond.filter((x) => x.on && x.f === field)[0];
            return c ? { op: c.op, v: num(c.v) } : null;
          };
          const actValue = (field) => {
            const a = st.acts.filter((x) => x.on && x.f === field)[0];
            return a ? { op: a.op, v: num(a.v) } : null;
          };
          function buildRulePayload() {
            const pitch = condValue('Valeur 1 (hauteur)');
            const vel = condValue('Valeur 2 (vélocité)');
            const len = condValue('Longueur');
            const fnMap = {
              'Transpose': 'transpose', 'Égaliser la vélocité': 'setVelocity',
              'Compresser la vélocité': 'scaleVelocity', 'Quantifier les longueurs': 'quantize',
              'Supprimer': 'deleteNotes', 'Déplacer': 'setLength',
              'Sélectionner': 'setVelocity', 'Insérer': 'setVelocity'
            };
            let action = fnMap[st.fn] || 'setVelocity';
            let actionValue = 0;
            const aPitch = actValue('Valeur 1 (hauteur)');
            const aVel = actValue('Valeur 2 (vélocité)');
            const aLen = actValue('Longueur');
            if (action === 'transpose' && aPitch) actionValue = aPitch.op === 'Soustraire' ? -aPitch.v : aPitch.v;
            else if (action === 'setVelocity' && aVel) actionValue = aVel.v;
            else if (action === 'scaleVelocity' && aVel) actionValue = aVel.op === 'Multiplier par' ? aVel.v * 100 : 100 + aVel.v;
            else if ((action === 'setLength' || action === 'quantize') && aLen) actionValue = aLen.v;
            return {
              name: st.preset || st.fn,
              enabled: true,
              pitchMin: pitch && (pitch.op === 'Supérieur à' || pitch.op === 'Égal') ? Math.max(0, Math.round(pitch.v)) : 0,
              pitchMax: pitch && (pitch.op === 'Inférieur à' || pitch.op === 'Égal') ? Math.min(127, Math.round(pitch.v)) : 127,
              velocityMin: vel && (vel.op === 'Supérieur à' || vel.op === 'Égal') ? Math.max(1, Math.round(vel.v)) : 1,
              velocityMax: vel && (vel.op === 'Inférieur à' || vel.op === 'Égal') ? Math.min(127, Math.round(vel.v)) : 127,
              lengthMinBars: len && (len.op === 'Supérieur à' || len.op === 'Égal') ? Math.max(0, len.v) : 0,
              lengthMaxBars: len && (len.op === 'Inférieur à' || len.op === 'Égal') ? Math.max(0, len.v) : 100000,
              onlySelectedTrack: true,
              typeFilter: 'note',
              action: action,
              actionValue: actionValue,
              grid: '1/16'
            };
          }
          function storeRule() {
            const payload = buildRulePayload();
            const before = ((deviceState().logicalRules) || []).length;
            nativeSend('storeLogicalRule', payload);
            A.showToast('Règle « ' + payload.name + ' » stockée dans le projet (fonction « ' + st.fn + ' »).', cfg.label);
            return before;
          }
          function applyLogical(bodyEl) {
            const payload = buildRulePayload();
            const index = ((deviceState().logicalRules) || []).length;
            nativeSend('storeLogicalRule', payload);
            nativeSend('applyLogicalEdit', { ruleIndex: index, allTracks: false });
            const touched = Number(deviceState().lastLogicalTouched || 0);
            A.showToast('Éditeur logique appliqué : ' + touched + ' note(s) MIDI réellement modifiée(s) — fonction « ' +
              st.fn + ' », ' + st.acts.filter((a) => a.on).length + ' action(s).', cfg.label);
            const el = bodyEl && $('[data-leinfo]', bodyEl);
            if (el) el.textContent = touched + ' note(s) modifiée(s) · règle « ' + payload.name + ' » appliquée.';
          }
          const ap = $('[data-leapply]', body);
          if (ap) ap.addEventListener('click', () => applyLogical(body));
          $$('[data-lea2]', body).forEach((b) => b.addEventListener('click', () => {
            const k = b.dataset.lea2;
            if (k === 'apply') { applyLogical(body); return; }
            if (k === 'store') { storeRule(); return; }
            const MSG = {
              store: 'Preset stocké : « ' + st.preset + ' » (conditions, fonction et actions enregistrées).',
              rename: 'Renommer le preset sélectionné (« ' + st.preset + ' »).',
              del: 'Preset « ' + st.preset + ' » supprimé de la liste.',
              load: 'Charger un preset depuis un fichier .xml.',
              apply: 'Éditeur logique : les actions sont appliquées à la sélection courante (moteur MIDI réel).'
            };
            A.showToast(MSG[k] || '', cfg.label);
          }));
        }
        bind();
        info();
      }
    };
  }

  /* =====================================================================
     3-4. INPUT TRANSFORMER / PROJECT LOGICAL EDITOR
     ===================================================================== */
  function buildInputTransformer() {
    return logicalWin({
      title: 'Input Transformer <em>· transformation en temps réel</em>', ac: '#6a5d94', kind: 'midi', label: 'Input Transformer',
      conds: LE_COND,
      funcs: ['Transpose', 'Filtrer', 'Égaliser la vélocité', 'Pousser la vélocité', 'Convertir en note', 'Changer de canal'],
      acts: LE_ACT,
      presets: ['Doubler la vélocité (+12)', 'Filtrer les notes sous 40', 'Transposer la piste de basse à l’octave',
        'Changer le canal MIDI vers 10', 'Limiter la polyphonie à 4 voix']
    });
  }
  function buildProjectLE() {
    return logicalWin({
      title: 'Project Logical Editor <em>· projet</em>', ac: '#6f7d86', kind: 'project', label: 'Project Logical Editor',
      conds: [
        ['Nom de piste', ['Contient', 'Égal', 'Commence par'], 'Voix'],
        ['Type de piste', ['Égal', 'Différent'], 'Audio'],
        ['Nom d’événement', ['Contient', 'Égal'], 'Refrain'],
        ['Position', ['Supérieur à', 'Inférieur à', 'Dans la plage'], '9.1.1.0'],
        ['Durée', ['Supérieur à', 'Inférieur à'], '4 barres'],
        ['Couleur de piste', ['Égal'], 'Bleu acier']
      ],
      funcs: ['Sélectionner', 'Masquer', 'Muter', 'Solo', 'Verrouiller', 'Déplacer', 'Dupliquer', 'Supprimer'],
      acts: [
        ['Volume', ['Définir', 'Ajouter', 'Soustraire'], '0,0 dB'],
        ['Panoramique', ['Définir'], 'C'],
        ['Mute', ['Définir'], 'Oui'],
        ['Hauteur de piste', ['Définir'], 'Normal'],
        ['Couleur', ['Définir'], 'Rouge']
      ],
      presets: ['Sélectionner toutes les pistes voix', 'Muter les pistes inactives', 'Masquer les images MIDI',
        'Afficher seulement les pistes du dossier MUSIQUE', 'Réinitialiser les volumes des FX']
    });
  }

  /* =====================================================================
     5. MIDI DEVICE MANAGER
     ===================================================================== */
  function buildMidiDevice() {
    const DEVICES = [
      { n: 'Alpha Synth (externe)', port: 'Alpha MIDI 1', ch: 1, bank: 'Banque A', patches: 128, panel: 'Panneau synthé', on: true },
      { n: 'Nord Lead (externe)', port: 'Alpha MIDI 2', ch: 2, bank: 'Banque 1', patches: 99, panel: 'Panneau Nord', on: true },
      { n: 'Roland JV-1080', port: 'Alpha MIDI 3', ch: 3, bank: 'User', patches: 128, panel: '—', on: false },
      { n: 'Talkback / ADR', port: 'Alpha MIDI 4', ch: 10, bank: '—', patches: 0, panel: '—', on: false }
    ];
    const st = { sel: 0, tab: 'devices' };
    function table() {
      return '<table class="w3-table md-table"><thead><tr><th style="width:36px">On</th><th>Appareil</th>' +
        '<th style="width:110px">Port MIDI</th><th style="width:60px">Canal</th><th style="width:92px">Banque</th>' +
        '<th style="width:70px">Patches</th><th>Panneau</th></tr></thead><tbody>' +
        DEVICES.map((d, i) => '<tr data-md="' + i + '"' + (i === st.sel ? ' class="sel"' : '') + '>' +
          '<td class="on"><span class="w3-cbx' + (d.on ? ' on' : '') + '" data-mdon="' + i + '"></span></td>' +
          '<td>' + esc(d.n) + '</td><td class="num">' + d.port + '</td><td class="num">' + d.ch + '</td>' +
          '<td>' + d.bank + '</td><td class="num">' + (d.patches || '—') + '</td><td>' + d.panel + '</td></tr>').join('') +
        '</tbody></table>';
    }
    function patches() {
      const d = DEVICES[st.sel];
      const names = ['Grand Piano', 'Bright Piano', 'E-Piano', 'Clavinet', 'Celesta', 'Glockenspiel', 'Music Box',
        'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer', 'Drawbar Organ', 'Percussive Organ',
        'Rock Organ', 'Church Organ', 'Accordion', 'Harmonica', 'Nylon Guitar', 'Steel Guitar'];
      return '<div class="w3-patch"><h6>Banque « ' + d.bank + ' » — ' + esc(d.n) + '</h6>' +
        '<div class="pgrid">' + names.map((n, i) => '<div class="pn' + (i === 0 ? ' sel' : '') + '" data-mdp="' + i + '">' +
          '<span>' + (i + 1) + '</span>' + n + '</div>').join('') + '</div>' +
        '<div class="w3-foot"><span data-mdpc>Programme 1 · ' + names[0] + '</span><span style="flex:1"></span>' +
        '<span>Double-clic = envoyer le programme</span></div></div>';
    }
    const html = () =>
      '<div class="w3-md">' +
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-mda="install" title="Assistant d’installation d’un appareil MIDI (fichier de définition)">Installer l’appareil…</button>' +
      '<button class="w-btn" data-mda="open" title="Ouvrir le panneau de l’appareil (éditeur de surface)">Ouvrir le panneau</button>' +
      '<button class="w-btn" data-mda="rename">Renommer</button>' +
      '<button class="w-btn" data-mda="remove">Supprimer l’appareil</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-mda="export">Exporter la configuration…</button>' +
      '<span style="flex:1"></span>' +
      '<span class="w-lbl">4 appareils · sorties MIDI disponibles : 4</span>' +
      '</div>' +
      '<div class="w3-scroll">' + table() + patches() + '</div>' +
      '<div class="w3-foot"><span>Appareils MIDI — Devices ▸ MIDI Device Manager</span><span style="flex:1"></span>' +
      '<span>Le panneau reprend les commandes de l’appareil : banques, programmes, paramètres</span></div>' +
      '</div>';
    return {
      title: 'MIDI Device Manager <em>· appareils MIDI</em>', ac: '#6a5d94', fit: false,
      html: html(),
      after(body) {
        const redraw = () => {
          const sc = $('.w3-scroll', body);
          sc.innerHTML = table() + patches();
          bind();
        };
        function bind() {
          $$('[data-md]', body).forEach((tr) => tr.addEventListener('click', () => {
            st.sel = +tr.dataset.md;
            $$('[data-md]', body).forEach((x) => x.classList.toggle('sel', x === tr));
            redraw();
          }));
          $$('[data-mdon]', body).forEach((c) => c.addEventListener('click', (e) => {
            e.stopPropagation();
            const d = DEVICES[+c.dataset.mdon];
            if (!d) return;
            d.on = !d.on;
            redraw();
            A.showToast('« ' + d.n + ' » ' + (d.on ? 'connecté sur ' + d.port + '.' : 'déconnecté : ses pistes MIDI ne reçoivent plus de programme.'), 'MIDI Device Manager');
          }));
          $$('[data-mdp]', body).forEach((p) => p.addEventListener('dblclick', () => {
            const dd = DEVICES[st.sel]; if (!dd) return;
            $$('[data-mdp]', body).forEach((x) => x.classList.toggle('sel', x === p));
            A.showToast('Programme envoyé : « ' + p.textContent.replace(/^\d+/, '') + ' » sur ' + dd.port + ' canal ' + dd.ch + '.', 'MIDI Device Manager');
          }));
          $$('[data-mdp]', body).forEach((p) => p.addEventListener('click', () => {
            const pc = $('[data-mdpc]', body);
            if (pc) pc.textContent = p.textContent.replace(/(^\d+)/, 'Programme $1 ·').replace('Programme', 'Programme');
            $$('[data-mdp]', body).forEach((x) => x.classList.toggle('sel', x === p));
          }));
          $$('[data-mda]', body).forEach((b) => b.addEventListener('click', () => {
            const k = b.dataset.mda;
            const devName = (DEVICES[st.sel] || DEVICES[0] || {}).n || '—';
            const MSG = {
              install: 'Assistant d’installation : choisir un fichier de définition (.xml / .dev), attribuer les ports MIDI et le canal, puis générer le panneau.',
              open: 'Panneau de « ' + devName + ' » ouvert : commandes de l’appareil (volume, patch, paramètres).',
              rename: 'Appareil renommé (le nom sert d’en-tête dans les menus de programme).',
              remove: 'L’appareil est retiré de la liste ; ses pistes MIDI restent mais perdent leurs noms de programme.',
              export: 'Configuration MIDI exportée (.xml) : appareils, ports, canaux et banques.'
            };
            A.showToast(MSG[k] || '', 'MIDI Device Manager');
          }));
        }
        bind();
      }
    };
  }

  /* =====================================================================
     6. PRESETS DE PISTE  (Track Presets)
     ===================================================================== */
  const TP = [
    { n: 'Voix lead — comp + EQ', t: 'Audio', cat: 'Voix', ins: ['Comp Alpha VCA', 'Alpha EQ Studio'], sends: 2, color: '#4f7fa8', date: '12/11/2026' },
    { n: 'Voix double — delay', t: 'Audio', cat: 'Voix', ins: ['Alpha Delay Echo'], sends: 3, color: '#4f7fa8', date: '12/11/2026' },
    { n: 'Basse DI — comp', t: 'Audio', cat: 'Basse', ins: ['Alpha Comp VCA'], sends: 1, color: '#61865e', date: '10/11/2026' },
    { n: 'Guitare rythmique', t: 'Audio', cat: 'Guitare', ins: ['Alpha EQ Studio'], sends: 1, color: '#9a8450', date: '09/11/2026' },
    { n: 'Bus batterie', t: 'Groupe', cat: 'Batterie', ins: ['Comp Alpha VCA', 'Alpha EQ Studio'], sends: 2, color: '#4f7188', date: '09/11/2026' },
    { n: 'Reverb 2,8 s', t: 'FX', cat: 'Reverb', ins: ['Alpha Reverb Space'], sends: 0, color: '#6f7d86', date: '08/11/2026' },
    { n: 'Piste MIDI — clavier', t: 'MIDI', cat: 'Clavier', ins: [], sends: 1, color: '#7466a0', date: '08/11/2026' },
    { n: 'Nappe Pad', t: 'Instrument', cat: 'Synthé', ins: ['Alpha EQ Studio'], sends: 2, color: '#7c5f95', date: '06/11/2026' },
    { n: 'Kit électro', t: 'Instrument', cat: 'Batterie', ins: ['Comp Alpha VCA'], sends: 1, color: '#5d87a3', date: '05/11/2026' }
  ];
  function buildTrackPresets() {
    const st = { q: '', cat: 'Tous', sel: 0, attr: true, tmp: [] };
    const CATS = ['Tous', 'Voix', 'Basse', 'Guitare', 'Batterie', 'Clavier', 'Synthé', 'Reverb'];
    const list = () => TP.filter((p) => (st.cat === 'Tous' || p.cat === st.cat) && (!st.q || p.n.toLowerCase().indexOf(st.q) >= 0));
    function rows() {
      return list().map((p, i) => '<tr data-tp="' + TP.indexOf(p) + '"' + (TP.indexOf(p) === st.sel ? ' class="sel"' : '') + '>' +
        '<td><i class="w3-dot" style="background:' + p.color + '"></i>' + esc(p.n) + '</td><td>' + p.t + '</td><td>' + p.cat + '</td>' +
        '<td class="num">' + p.ins.length + '</td><td class="num">' + p.sends + '</td><td class="num">' + p.date + '</td></tr>').join('');
    }
    function detail() {
      const p = TP[st.sel] || TP[0];
      return '<div class="w3-detail"><h6>' + esc(p.n) + '</h6>' +
        '<div class="row"><span>Type de piste</span><b>' + p.t + '</b></div>' +
        '<div class="row"><span>Catégorie</span><b>' + p.cat + '</b></div>' +
        '<div class="row"><span>Inserts</span><b>' + (p.ins.length ? p.ins.join(' · ') : '—') + '</b></div>' +
        '<div class="row"><span>Départs FX</span><b>' + p.sends + '</b></div>' +
        '<div class="row"><span>EQ</span><b>' + (p.cat === 'Voix' ? '4 bandes actives' : 'plat') + '</b></div>' +
        '<div class="row"><span>Couleur</span><b><i class="w3-dot" style="background:' + p.color + '"></i> piste</b></div>' +
        '<div class="row"><span>VU-mètre</span><b>post-fader</b></div>' +
        '<div class="w3-note">Un preset de piste mémorise les inserts, l’EQ, les départs, le volume, le pan et la couleur — pas les événements.</div></div>';
    }
    const html = () =>
      '<div class="w3-tp">' +
      '<div class="w-toolbar">' +
      '<input class="w-input" data-tpq placeholder="Rechercher un preset…" style="width:170px">' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Catégorie</span><button class="w-btn" data-tpcat="1">' + st.cat + ' ▾</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-tpa="store" title="Créer un preset à partir de la piste sélectionnée">Créer à partir de la piste…</button>' +
      '<button class="w-btn" data-tpa="apply">Appliquer à la piste</button>' +
      '<button class="w-btn" data-tpa="rename">Renommer</button>' +
      '<button class="w-btn" data-tpa="del">Supprimer</button>' +
      '</div>' +
      '<div class="w3-tpbody">' +
      '<div class="w3-cats">' + CATS.map((c) => '<div class="c' + (c === st.cat ? ' on' : '') + '" data-tpcatx="' + c + '">' + c +
        '<span>' + (c === 'Tous' ? TP.length : TP.filter((p) => p.cat === c).length) + '</span></div>').join('') + '</div>' +
      '<div class="w3-scroll"><table class="w3-table"><thead><tr><th>Preset</th><th style="width:74px">Type</th>' +
      '<th style="width:78px">Catégorie</th><th style="width:54px">Inserts</th><th style="width:58px">Départs</th>' +
      '<th style="width:70px">Modifié</th></tr></thead><tbody data-tpbody>' + rows() + '</tbody></table></div>' +
      '<div data-tpdetail>' + detail() + '</div>' +
      '</div>' +
      '<div class="w3-foot"><span>Presets de piste — Media ▸ Presets de piste</span><span style="flex:1"></span>' +
      '<span data-tpinfo></span></div></div>';
    return {
      title: 'Presets de piste <em>· Track Presets</em>', ac: '#3f6c98', fit: false, html: html(),
      after(body) {
        const redraw = () => {
          $('[data-tpbody]', body).innerHTML = rows();
          $('[data-tpdetail]', body).innerHTML = detail();
          $$('.w3-cats .c', body).forEach((c) => c.classList.toggle('on', c.dataset.tpcatx === st.cat));
          $('[data-tpinfo]', body).textContent = list().length + ' preset(s) affiché(s) · ' + TP.length + ' au total';
          bind();
        };
        function bind() {
          $$('[data-tp]', body).forEach((tr) => tr.addEventListener('click', () => { st.sel = +tr.dataset.tp; redraw(); }));
          $$('[data-tp]', body).forEach((tr) => tr.addEventListener('dblclick', () => {
            st.sel = +tr.dataset.tp;
            if (!TP[st.sel]) return;
            A.showToast('Preset « ' + TP[st.sel].n + ' » appliqué à la piste sélectionnée : inserts, EQ, départs, volume et couleur.', 'Presets de piste');
          }));
          $$('[data-tpcatx]', body).forEach((c) => c.addEventListener('click', () => { st.cat = c.dataset.tpcatx; redraw(); }));
          const q = $('[data-tpq]', body);
          if (q) q.addEventListener('input', () => { st.q = q.value.toLowerCase().trim(); redraw(); });
          const cb = $('[data-tpcat]', body);
          if (cb) cb.addEventListener('click', () => {
            popMenu(cb, 'tpCatMenu', 'Catégorie', CATS.map((c) => [c, c, c === st.cat]), (k) => { st.cat = k; redraw(); });
          });
          $$('[data-tpa]', body).forEach((b) => b.addEventListener('click', () => {
            const k = b.dataset.tpa;
            if (k === 'store') {
              const n = { n: 'Nouveau preset ' + (TP.length + 1), t: 'Audio', cat: 'Voix', ins: ['Comp Alpha VCA'], sends: 1, color: '#4f7fa8', date: '15/11/2026' };
              TP.push(n); st.sel = TP.length - 1; redraw();
              A.showToast('Preset créé depuis la piste sélectionnée : « ' + n.n + ' » (insérer, EQ, départs, volume, pan, couleur).', 'Presets de piste');
              return;
            }
            if (k === 'del') { const p = TP.splice(st.sel, 1)[0] || { n: '—' }; st.sel = Math.max(0, st.sel - 1); redraw(); A.showToast('Preset « ' + p.n + ' » supprimé.', 'Presets de piste'); return; }
            const curp = TP[st.sel];
            if (!curp) return;
            if (k === 'apply') { A.showToast('« ' + curp.n + ' » appliqué à la piste sélectionnée (les événements sont conservés).', 'Presets de piste'); return; }
            A.showToast('Renommer « ' + curp.n + ' » : le nom sert aussi de nom de fichier (.trackpreset).', 'Presets de piste');
          }));
        }
        redraw();
      }
    };
  }

  /* =====================================================================
     7. SETUP DE QUANTIZE  (Quantize Setup)
     ===================================================================== */
  function buildQuantize() {
    const st = { grid: '1/16', type: 'Auto', swing: 0, tuplet: false, magnet: 0, seed: 1, preset: 'Standard 1/16' };
    const GRIDS = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64', '1/8 T', '1/16 T', '1/4 pointé'];
    const TYPES = ['Auto', 'Straight', 'Triplet', 'Dotted'];
    const PRESETS = ['Standard 1/16', 'Swing 8e (58 %)', 'Triolets 1/8 T', 'Quantize léger 1/32', 'Magnetic 40 %'];
    function gridSVG() {
      const W = 300, H = 74;
      let s = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#eceae5" stroke="#8f8d87"/>';
      for (let b = 0; b < 4; b++) {
        const x = 10 + b * 70;
        s += '<line x1="' + x + '" y1="6" x2="' + x + '" y2="' + (H - 6) + '" stroke="#8f8d87"/>';
        s += '<text x="' + x + '" y="' + (H - 10) + '" font-size="7" fill="#5c5a54" text-anchor="middle">' + (b + 1) + '</text>';
      }
      const per = st.grid.indexOf('1/2') >= 0 ? 2 : st.grid.indexOf('1/4') >= 0 ? 4 : st.grid.indexOf('1/8') >= 0 ? 8 : 16;
      const step = 280 / per;
      const seededR = (i) => Math.abs(Math.sin(i * 12.9898 + st.seed) * 43758.5453) % 1;
      for (let i = 0; i < per; i++) {
        let x = 10 + i * step;
        if (st.swing) x += (i % 2 ? step * st.swing / 100 : 0);
        s += '<line x1="' + x + '" y1="10" x2="' + x + '" y2="' + (H - 22) + '" stroke="#4f7188" stroke-width="1.4"/>';
        if (st.magnet) {
          s += '<rect x="' + (x - step * st.magnet / 200) + '" y="10" width="' + (step * st.magnet / 100) + '" height="' + (H - 32) + '" fill="#4f7188" opacity=".13"/>';
        }
        const nx = 10 + i * step + (seededR(i) - 0.5) * step * 0.8;
        s += '<rect x="' + nx + '" y="' + (18 + (i % 3) * 7) + '" width="5" height="9" fill="#8a4a3a" stroke="#5c2f24"/>';
        s += '<line x1="' + nx + '" y1="' + (18 + (i % 3) * 7 + 9) + '" x2="' + x + '" y2="' + (18 + (i % 3) * 7 + 9) + '" stroke="#8a4a3a" stroke-dasharray="1.5 1.5" opacity=".7"/>';
      }
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:' + H + 'px">' + s + '</svg>';
    }
    const html = () =>
      '<div class="w3-qs">' +
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Grille</span><button class="w-btn" data-qs="grid">' + st.grid + ' ▾</button>' +
      '<span class="w-lbl">Type</span><button class="w-btn" data-qs="type">' + st.type + ' ▾</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Preset</span><button class="w-btn" data-qs="preset">' + st.preset + ' ▾</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-qsa="store">Stocker</button>' +
      '<button class="w-btn" data-qsa="del">Supprimer</button>' +
      '</div>' +
      '<div class="w3-qsbody">' +
      '<div class="qs-grid" data-qsgrid>' + gridSVG() + '</div>' +
      '<div class="qs-ctl">' +
      '<div class="row"><label>Swing</label><input type="range" min="0" max="75" value="' + st.swing + '" data-qswing><b data-qswingv>' + st.swing + ' %</b></div>' +
      '<div class="row"><label>Tuplet</label>' + chk('Triolets irréguliers', st.tuplet) + '</div>' +
      '<div class="row"><label>Zone magnétique</label><input type="range" min="0" max="100" value="' + st.magnet + '" data-qsmag><b data-qsmagv>' + st.magnet + ' %</b></div>' +
      '<div class="row"><label>Graine (démo)</label><input type="range" min="1" max="9" value="' + st.seed + '" data-qseed><b data-qseedv>' + st.seed + '</b></div>' +
      '<div class="row"><label>Décalage de grille</label><span class="w-field" style="min-width:66px">0 ticks <i class="arr"></i></span></div>' +
      '<div class="row"><label>Quantifier les fins</label>' + chk('Longueur non nulle', true) + '</div>' +
      '</div></div>' +
      '<div class="w3-foot"><span>Setup de quantize — MIDI ▸ Quantize Setup…</span><span style="flex:1"></span>' +
      '<span>Les réglages apparaissent aussitôt dans les menus Quantize des barres d’outils</span>' +
      '<button class="w-btn on" data-qsa="ok">OK</button></div></div>';
    return {
      title: 'Setup de quantize <em>· Quantize Setup</em>', ac: '#6a5d94', fit: false, html: html(),
      after(body) {
        const redraw = () => {
          const g = $('[data-qsgrid]', body);
          if (g) g.innerHTML = gridSVG();
          $$('[data-qs]', body).forEach((b) => {
            const k = b.dataset.qs;
            if (k === 'grid') b.textContent = st.grid + ' ▾';
            if (k === 'type') b.textContent = st.type + ' ▾';
            if (k === 'preset') b.textContent = st.preset + ' ▾';
          });
          const s1 = $('[data-qswingv]', body); if (s1) s1.textContent = st.swing + ' %';
          const s2 = $('[data-qsmagv]', body); if (s2) s2.textContent = st.magnet + ' %';
          const s3 = $('[data-qseedv]', body); if (s3) s3.textContent = st.seed;
        };
        $$('[data-qs]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.qs;
          if (k === 'grid') popMenu(b, 'qsGridMenu', 'Valeur de note', GRIDS.map((g) => [g, g, g === st.grid]), (v) => { st.grid = v; redraw(); });
          if (k === 'type') popMenu(b, 'qsTypeMenu', 'Type', TYPES.map((g) => [g, g, g === st.type]), (v) => { st.type = v; redraw(); });
          if (k === 'preset') popMenu(b, 'qsPresetMenu', 'Presets', PRESETS.map((g) => [g, g, g === st.preset]), (v) => { st.preset = v; redraw(); A.showToast('Preset de quantize « ' + v + ' » chargé.', 'Quantize Setup'); });
        }));
        const sw = $('[data-qswing]', body);
        if (sw) sw.addEventListener('input', () => { st.swing = +sw.value; redraw(); });
        const mg = $('[data-qsmag]', body);
        if (mg) mg.addEventListener('input', () => { st.magnet = +mg.value; redraw(); });
        const sd = $('[data-qseed]', body);
        if (sd) sd.addEventListener('input', () => { st.seed = +sd.value; redraw(); });
        $$('.dlg-check', body).forEach((c) => c.addEventListener('click', () => {
          c.classList.toggle('on');
          if (/Triolets/.test(c.textContent)) { st.tuplet = c.classList.contains('on'); redraw(); }
        }));
        $$('[data-qsa]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.qsa;
          if (k === 'store') A.showToast('Réglages stockés comme preset « ' + st.preset + ' » et ajoutés au menu Quantize.', 'Quantize Setup');
          if (k === 'del') A.showToast('Preset « ' + st.preset + ' » supprimé du menu Quantize.', 'Quantize Setup');
          if (k === 'ok') { W.close('quantize'); }
        }));
      }
    };
  }

  /* =====================================================================
     8. BEAT CALCULATOR
     ===================================================================== */
  function buildBeatCalc() {
    const st = { beats: 8, bpm: 120, taps: [], mode: 'calc', ts: '4/4' };
    const TAPS = [];
    function calc() {
      /* sélection de 2 mesures à 120 BPM = 4 s → BPM = beats / temps * 60 */
      const secs = 4.0;
      const bpm = st.beats / secs * 60;
      st.bpm = bpm;
      return bpm;
    }
    const html = () =>
      '<div class="w3-bc">' +
      '<div class="w-toolbar">' +
      '<button class="w-btn' + (st.mode === 'calc' ? ' on' : '') + '" data-bcm="calc">Calculer</button>' +
      '<button class="w-btn' + (st.mode === 'tap' ? ' on' : '') + '" data-bcm="tap">Tap tempo</button>' +
      '<span style="flex:1"></span><span class="w-lbl">Sélection : 2 mesures · 4,000 s</span>' +
      '</div>' +
      '<div class="w3-bcbody">' +
      '<div class="bc-lcd"><div class="t">TEMPO CALCULÉ</div><div class="v" data-bcbpm>' + calc().toFixed(3).replace('.', ',') + '</div>' +
      '<div class="u">BPM</div></div>' +
      '<div class="bc-fields">' +
      dlgRow('Battements dans la sélection', '<input class="w-input w3-mini" data-bcbeats value="' + st.beats + '">') +
      dlgRow('Durée de la sélection', '4,000 s') +
      dlgRow('Signature', st.ts + ' <i class="arr" data-bcts></i>') +
      '<div class="bc-row">' + chk('Ajuster la sélection depuis la règle', false) + '</div>' +
      '<div class="bc-row" data-bctapwrap>' + btn('Taper', '', ' data-bctap="1"') +
      '<span class="w-lbl" data-bctaps>' + (st.taps.length ? st.taps.length + ' frappes' : 'aucune frappe') + '</span>' + btn('Effacer', '', ' data-bctapc="1"') + '</div>' +
      '</div></div>' +
      '<div class="w3-foot"><span>Calculer le tempo · insérer dans la piste de tempo</span><span style="flex:1"></span>' +
      '<button class="w-btn" data-bcins="start">Au début de la piste de tempo</button>' +
      '<button class="w-btn on" data-bcins="sel">Au début de la sélection</button>' +
      '<button class="w-btn" data-bcclose="1">Fermer</button></div></div>';
    return {
      title: 'Beat Calculator <em>· calculateur de tempo</em>', ac: '#4f7188', html: html(),
      after(body) {
        const show = () => {
          const el = $('[data-bcbpm]', body);
          if (el) el.textContent = st.mode === 'tap' ? (st.bpm || 0).toFixed(3).replace('.', ',') : calc().toFixed(3).replace('.', ',');
        };
        const inp = $('[data-bcbeats]', body);
        if (inp) inp.addEventListener('input', () => {
          st.beats = Math.max(1, Math.min(64, parseInt(inp.value, 10) || 1));
          show();
        });
        $$('[data-bcm]', body).forEach((b) => b.addEventListener('click', () => {
          st.mode = b.dataset.bcm;
          $$('[data-bcm]', body).forEach((x) => x.classList.toggle('on', x === b));
          show();
        }));
        const tp = $('[data-bctap]', body);
        if (tp) tp.addEventListener('click', () => {
          const now = Date.now();
          st.taps.push(now);
          if (st.taps.length > 6) st.taps.shift();
          if (st.taps.length >= 2) {
            const d = (st.taps[st.taps.length - 1] - st.taps[0]) / (st.taps.length - 1);
            st.bpm = 60000 / d;
          }
          const lbl = $('[data-bctaps]', body);
          if (lbl) lbl.textContent = st.taps.length + ' frappes';
          show();
        });
        const tc = $('[data-bctapc]', body);
        if (tc) tc.addEventListener('click', () => {
          st.taps.length = 0; st.bpm = 0;
          const lbl = $('[data-bctaps]', body);
          if (lbl) lbl.textContent = 'aucune frappe';
          show();
        });
        const ts = $('[data-bcts]', body);
        if (ts) ts.addEventListener('click', () => {
          popMenu(ts, 'bcTsMenu', 'Signature', ['4/4', '3/4', '6/8', '5/4', '7/8'].map((x) => [x, x, x === st.ts]), (v) => { st.ts = v; A.showToast('Signature : ' + v, 'Beat Calculator'); });
        });
        $$('[data-bcins]', body).forEach((b) => b.addEventListener('click', () => {
          $$('[data-bcins]', body).forEach((x) => x.classList.toggle('on', x === b));
          A.showToast('Tempo ' + st.bpm.toFixed(3).replace('.', ',') + ' BPM inséré ' +
            (b.dataset.bcins === 'start' ? 'au début de la piste de tempo (premier point ajusté)' : 'au début de la sélection (nouveau point, courbe « Saut »)') + '.', 'Beat Calculator');
        }));
        const cl = $('[data-bcclose]', body);
        if (cl) cl.addEventListener('click', () => W.close('beatcalc'));
      }
    };
  }

  /* =====================================================================
     9. IMPORT MEDIUM
     ===================================================================== */
  function buildImportMedium() {
    const st = { sel: 0, loop: false, vol: '0,0 dB', opt: { copy: true, convert: false, split: false, remove: false }, apply: 'ask' };
    const FILES = [
      { n: 'Voix_Lead_prise_02.wav', t: 'Wave', rate: '48 000 Hz', bits: '24 bit', ch: 'Stéréo', dur: '12,4 s', size: '4,8 Mo', ok: true },
      { n: 'Ambiance_pluie.wav', t: 'Broadcast Wave', rate: '48 000 Hz', bits: '24 bit', ch: 'Stéréo', dur: '1:04', size: '22,1 Mo', ok: true },
      { n: 'Boucle_batterie_120.wav', t: 'Wave', rate: '44 100 Hz', bits: '16 bit', ch: 'Stéréo', dur: '4,0 s', size: '1,3 Mo', ok: false },
      { n: 'Riff_guitare.aif', t: 'AIFF', rate: '48 000 Hz', bits: '24 bit', ch: 'Mono', dur: '8,2 s', size: '2,3 Mo', ok: false },
      { n: 'Nappe_90.wav', t: 'Wave', rate: '48 000 Hz', bits: '24 bit', ch: 'Stéréo', dur: '16,0 s', size: '5,5 Mo', ok: true },
      { n: 'Voix_off.mp3', t: 'MPEG 1 Layer 3', rate: '48 000 Hz', bits: '—', ch: 'Stéréo', dur: '0:38', size: '1,1 Mo', ok: true },
      { n: 'Percussion_100.rex', t: 'REX 2', rate: '44 100 Hz', bits: '16 bit', ch: 'Mono', dur: '2,0 s', size: '0,4 Mo', ok: true }
    ];
    const html = () =>
      '<div class="w3-im">' +
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-ima="prev" title="Dossier précédent">◀</button>' +
      '<button class="w-btn" data-ima="next" title="Dossier suivant">▶</button>' +
      '<span class="w-field" style="flex:1;min-width:150px">Alpha_Audio/Imports <i class="arr"></i></span>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-ima="play">▶</button>' +
      '<button class="w-btn' + (st.loop ? ' on' : '') + '" data-ima="loop" title="Lecture en boucle de l’aperçu">⟳</button>' +
      '<span class="w-lbl">Vol.</span><input type="range" min="-40" max="6" value="0" data-imvol style="width:64px">' +
      '<span class="w-lbl" data-imvolv>' + st.vol + '</span>' +
      '</div>' +
      '<div class="w3-imb">' +
      '<div class="w3-scroll"><table class="w3-table"><thead><tr><th>Fichier</th><th style="width:96px">Format</th>' +
      '<th style="width:70px">Fréq.</th><th style="width:52px">Bits</th><th style="width:58px">Canaux</th>' +
      '<th style="width:56px">Durée</th><th style="width:58px">Taille</th></tr></thead><tbody>' +
      FILES.map((f, i) => '<tr data-im="' + i + '"' + (i === st.sel ? ' class="sel"' : '') + '>' +
        '<td><i class="w3-dot" style="background:#8fb6d6"></i>' + esc(f.n) + (f.ok ? '' : ' <span class="w3-warn" title="Conversion nécessaire">▲</span>') + '</td>' +
        '<td>' + f.t + '</td><td class="num">' + f.rate + '</td><td class="num">' + f.bits + '</td>' +
        '<td>' + f.ch + '</td><td class="num">' + f.dur + '</td><td class="num">' + f.size + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="w3-imr">' +
      sec('Aperçu') +
      '<svg viewBox="0 0 300 40" preserveAspectRatio="none" class="im-wave"><path d="' + (A.wavePath ? A.wavePath(300, 34, 'perc', 37) : '') + '" fill="#7fae8f" opacity=".9"/></svg>' +
      '<div class="im-meta" data-immeta></div>' +
      sec('Options d’import') +
      '<div class="im-opt">' + chk('Copier les fichiers dans le dossier de travail', true) +
      chk('Convertir et copier si nécessaire', false) +
      chk('Diviser les fichiers multicanaux', false) +
      chk('Retirer le média après import', false) + '</div>' +
      '</div></div>' +
      '<div class="w3-foot"><span>Import Medium — le fichier entre dans le Pool du projet</span><span style="flex:1"></span>' +
      '<button class="w-btn" data-ima="cancel">Annuler</button>' +
      '<button class="w-btn on" data-ima="open">Importer</button></div></div>';
    return {
      title: 'Import Medium <em>· importer un média dans le Pool</em>', ac: '#5a7fa3', fit: false, html: html(),
      after(body) {
        const meta = () => {
          const f = FILES[st.sel];
          const el = $('[data-immeta]', body);
          if (!el) return;
          el.innerHTML = '<div class="r"><span>Nom</span><b>' + esc(f.n) + '</b></div>' +
            '<div class="r"><span>Format</span><b>' + f.t + '</b></div><div class="r"><span>Fréquence</span><b>' + f.rate + '</b></div>' +
            '<div class="r"><span>Résolution</span><b>' + f.bits + '</b></div><div class="r"><span>Canaux</span><b>' + f.ch + '</b></div>' +
            '<div class="r"><span>Durée</span><b>' + f.dur + '</b></div>' +
            (f.ok ? '' : '<div class="r warn"><span>Conversion</span><b>requise (projet : 48 000 Hz / 24 bit)</b></div>');
        };
        meta();
        $$('[data-im]', body).forEach((tr) => tr.addEventListener('click', () => {
          st.sel = +tr.dataset.im;
          $$('[data-im]', body).forEach((x) => x.classList.toggle('sel', x === tr));
          meta();
        }));
        $$('[data-im]', body).forEach((tr) => tr.addEventListener('dblclick', () => {
          nativeSend('importAudio', { startBars: Number((A.state && A.state.pos) || 1), trackIndex: Number(deviceState().selectedTrack) || 0 });
          A.showToast('« ' + FILES[+tr.dataset.im].n + ' » : sélecteur de fichiers Windows ouvert, import réel par le moteur.', 'Import Medium');
        }));
        $$('.im-opt .dlg-check', body).forEach((c, i) => c.addEventListener('click', () => {
          c.classList.toggle('on');
          const k = ['copy', 'convert', 'split', 'remove'][i];
          if (k) st.opt[k] = c.classList.contains('on');
        }));
        const vol = $('[data-imvol]', body);
        if (vol) vol.addEventListener('input', () => {
          const v = +vol.value;
          st.vol = (v > 0 ? '+' : '') + String(v).replace('.', ',') + ',0 dB';
          $('[data-imvolv]', body).textContent = st.vol;
        });
        $$('[data-ima]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.ima;
          if (k === 'play') { A.showToast('Aperçu de « ' + FILES[st.sel].n + ' » (routé vers le Control Room si activé).', 'Import Medium'); return; }
          if (k === 'loop') { st.loop = !st.loop; b.classList.toggle('on', st.loop); A.showToast('Lecture en boucle ' + (st.loop ? 'activée' : 'désactivée') + ' pour l’aperçu.', 'Import Medium'); return; }
          if (k === 'cancel') { W.close('importmedium'); return; }
          if (k === 'open') {
            A.showToast('« ' + FILES[st.sel].n + ' » importé' + (st.opt.copy ? ' (copie dans Alpha_Audio)' : '') +
              (st.opt.convert && !FILES[st.sel].ok ? ' et converti en 48 000 Hz / 24 bit' : '') + ' — clip ajouté au Pool.', 'Import Medium');
            W.close('importmedium');
            return;
          }
          A.showToast(k === 'prev' ? 'Dossier précédent.' : 'Dossier suivant.', 'Import Medium');
        }));
      }
    };
  }

  /* =====================================================================
     10. EXPORT / IMPORT OMF — AAF
     ===================================================================== */
  function buildOmf() {
    const st = { ver: '2.0 File', all: false, copy: true, cons: true, handles: '0 ms', vol: true, fade: true, names: true,
      res: '24 bit', quantize: false, path: 'Alpha/Export/', fmt: 'OMF' };
    const html = () =>
      '<div class="w3-omf">' +
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Format</span><button class="w-btn" data-omf="fmt">' + st.fmt + ' ▾</button>' +
      '<span class="w-lbl">Version</span><button class="w-btn" data-omf="ver">' + st.ver + ' ▾</button>' +
      '<span style="flex:1"></span><span class="w-lbl">Export · ' + st.fmt + '</span>' +
      '</div>' +
      '<div class="w3-omfbody">' +
      sec('Destination') +
      dlgRow('Dossier d’export', st.path) +
      dlgRow('Chemin des médias', 'Alpha/Export/Media') +
      '<div class="row">' + chk('Copier les médias', st.copy) + chk('Consolider les événements', st.cons) + '</div>' +
      dlgRow('Poignées de consolidation', st.handles + ' <i class="arr"></i>') +
      sec('Contenu') +
      '<div class="row">' + chk('Exporter toute l’audio dans un seul fichier', st.all) +
      chk('Exporter seulement les références aux fichiers', !st.all) + '</div>' +
      '<div class="row">' + chk('Volume des clips', st.vol) + chk('Courbes de fondu', st.fade) + chk('Noms des clips', st.names) + '</div>' +
      sec('Audio') +
      dlgRow('Résolution', st.res + ' <i class="arr"></i>') +
      '<div class="row">' + chk('Quantifier les événements sur les images', st.quantize) + '</div>' +
      '<div class="w3-note">L’export ' + st.fmt + ' ne contient pas les fichiers non utilisés du Pool ni les données MIDI. ' +
      'Seuls les fichiers stéréo sont exportés en OMF.</div>' +
      '</div>' +
      '<div class="w3-foot"><span>Échange avec les stations de montage (OMF 1.0 / 2.0 · AAF)</span><span style="flex:1"></span>' +
      '<button class="w-btn" data-omfa="cancel">Annuler</button><button class="w-btn on" data-omfa="ok">Exporter</button></div></div>';
    return {
      title: 'Exportation OMF / AAF <em>· échange de projets</em>', ac: '#8a7a4c', fit: false, html: html(),
      after(body) {
        cycleField(body, body, (lbl, val) => {
          if (lbl === 'Résolution') st.res = val;
          if (lbl === 'Poignées de consolidation') st.handles = val;
        });
        const label = (t) => String(t || '').replace(/\s+/g, ' ');
        $$('[data-omf]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.omf === 'ver') popMenu(b, 'omfVer', 'Version de fichier', ['1.0 File', '2.0 File'].map((v) => [v, v, v === st.ver]), (v) => {
            st.ver = v;
            b.textContent = v + ' ▾';
            A.showToast('Version ' + v + ' : ' + (v === '1.0 File' ? 'les fondus et volumes de clip ne sont pas exportés.' : 'fondus, volumes de clip et noms de clips disponibles.'), 'Export OMF');
          });
          if (b.dataset.omf === 'fmt') popMenu(b, 'omfFmt', 'Format d’échange', ['OMF', 'AAF', 'AES31', 'OpenTL'].map((v) => [v, v, v === st.fmt]), (v) => {
            st.fmt = v;
            b.textContent = v + ' ▾';
            const h = $('.w3-omfbody .w3-note', body);
            if (h) h.innerHTML = 'L’export ' + v + ' ne contient pas les fichiers non utilisés du Pool ni les données MIDI.' +
              (v === 'OMF' ? ' Seuls les fichiers stéréo sont exportés en OMF.' : '');
          });
        }));
        $$('.w3-omfbody .dlg-check', body).forEach((c) => c.addEventListener('click', () => {
          c.classList.toggle('on');
          const on = c.classList.contains('on');
          if (/toute l’audio/.test(c.textContent)) { st.all = on; redrawCheck(body, 'références', !on); }
          else if (/références/.test(c.textContent)) { st.all = !on; redrawCheck(body, 'toute l’audio', !on); }
          else if (/Copier/.test(c.textContent)) st.copy = on;
          else if (/Consolider/.test(c.textContent)) st.cons = on;
          else if (/Volume/.test(c.textContent)) st.vol = on;
          else if (/Courbes/.test(c.textContent)) st.fade = on;
          else if (/Noms/.test(c.textContent)) st.names = on;
          else if (/Quantifier/.test(c.textContent)) st.quantize = on;
        }));
        function redrawCheck(host, label, val) {
          $$('.w3-omfbody .dlg-check', host).forEach((c) => {
            if (c.textContent.indexOf(label) >= 0) c.classList.toggle('on', val);
          });
        }
        $$('[data-omfa]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.omfa === 'cancel') { W.close('omf'); return; }
          A.showToast('Export ' + st.fmt + ' ' + (st.fmt === 'OMF' ? st.ver : '') + ' créé : « ' + st.path + 'Démo_Alpha_01.' +
            st.fmt.toLowerCase().replace('aes31', 'aes').replace('omf', 'omf').replace('aaf', 'aaf').replace('opentl', 'tl') + ' »' +
            (st.copy ? ' · médias copiés' : ' · références seules') + (st.cons ? ' · événements consolidés (' + st.handles + ')' : '') + '.', 'Export OMF');
          W.close('omf');
        }));
      }
    };
  }

  /* =====================================================================
     11. TRAITEMENT PAR LOT  (Batch Processing)
     ===================================================================== */
  function buildBatch() {
    /* AUDIT v6 (A80) : chaque opération est RÉELLEMENT exécutée par le
       moteur sur les échantillons — plus de chaîne de traitement fictive. */
    const OPS = {
      'Découper aux silences': (ti, ci) => nativeSend('splitAtSilences', { trackIndex: ti, clipIndex: ci }),
      'Normaliser (-0,3 dB)': (ti, ci) => nativeSend('processClip', { trackIndex: ti, clipIndex: ci, op: 'normalize', value: -0.3 }),
      'Normaliser (-0,1 dB)': (ti, ci) => nativeSend('processClip', { trackIndex: ti, clipIndex: ci, op: 'normalize', value: -0.1 }),
      'Compresseur de piste': (ti) => nativeSend('setFx', { trackIndex: ti, thresholdDb: -18, ratio: 3, attackMs: 10, releaseMs: 120, makeupDb: 3, dynamicsEnabled: true }),
      'EQ de piste (4 bandes)': (ti) => nativeSend('setFx', { trackIndex: ti, eqEnabled: true }),
      'Fondu entrant 50 ms': (ti, ci) => nativeSend('processClip', { trackIndex: ti, clipIndex: ci, op: 'fadeIn', ms: 50 }),
      'Fondu sortant 50 ms': (ti, ci) => nativeSend('processClip', { trackIndex: ti, clipIndex: ci, op: 'fadeOut', ms: 50 }),
      'Conformer au projet': (ti, ci) => nativeSend('processClip', { trackIndex: ti, clipIndex: ci, op: 'conform' }),
      'Réécrire le fichier': (ti, ci) => nativeSend('processClip', { trackIndex: ti, clipIndex: ci, op: 'bake' })
    };
    const st = { sel: 0, list: [
      { n: 'Voix — nettoyage', ops: ['Découper aux silences', 'Normaliser (-0,3 dB)', 'Compresseur de piste'] },
      { n: 'Guitare — préparation', ops: ['EQ de piste (4 bandes)', 'Compresseur de piste'] },
      { n: 'Master CD', ops: ['Normaliser (-0,1 dB)', 'Conformer au projet', 'Réécrire le fichier'] },
      { n: 'Nettoyage général', ops: ['Découper aux silences', 'Fondu entrant 50 ms', 'Fondu sortant 50 ms'] }
    ] };
    function left() {
      return st.list.map((b, i) => '<div class="bi-row' + (i === st.sel ? ' sel' : '') + '" data-bi="' + i + '">' +
        '<span>' + esc(b.n) + '</span><em>' + b.ops.length + ' op.</em></div>').join('');
    }
    function right() {
      const b = st.list[st.sel];
      if (!b) return '<h6>Aucun traitement</h6>';
      return '<h6>Opérations de « ' + esc(b.n) + ' »</h6>' +
        '<div class="ops">' + b.ops.map((o, i) => '<div class="op"><span>' + (i + 1) + '</span>' + o + '</div>').join('') + '</div>';
    }
    const html = () =>
      '<div class="w3-batch">' +
      '<div class="w-toolbar"><span class="w-lbl">Traitements par lot</span><span style="flex:1"></span>' +
      '<button class="w-btn" data-bpa="new">Créer depuis l’historique…</button>' +
      '<button class="w-btn" data-bpa="rename">Renommer</button>' +
      '<button class="w-btn" data-bpa="del">Supprimer</button>' +
      '<button class="w-btn" data-bpa="manage">Gérer…</button></div>' +
      '<div class="w3-batchbody">' +
      '<div class="bl"><h6>Traitements enregistrés</h6><div class="bilst" data-bilist>' + left() + '</div></div>' +
      '<div class="br" data-biright>' + right() + '</div>' +
      '</div>' +
      '<div class="w3-foot"><span>Traiter la sélection : ' + (A.PARTS ? A.PARTS.length : 0) + ' événement(s) audio</span>' +
      '<span style="flex:1"></span><button class="w-btn" data-bpa="close">Fermer</button>' +
      '<button class="w-btn on" data-bpa="apply">Traiter</button></div></div>';
    return {
      title: 'Traitement par lot <em>· Batch Processing</em>', ac: '#8a7a4c', html: html(),
      after(body) {
        const redraw = () => {
          $('[data-bilist]', body).innerHTML = left();
          $('[data-biright]', body).innerHTML = right();
          bind();
        };
        function bind() {
          $$('[data-bi]', body).forEach((r) => r.addEventListener('click', () => { st.sel = +r.dataset.bi; redraw(); }));
        }
        bind();
        $$('[data-bpa]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.bpa;
          if (k === 'new') {
            st.list.push({ n: 'Traitement ' + (st.list.length + 1), ops: ['Normaliser (-0,3 dB)', 'Compresseur de piste'] });
            st.sel = st.list.length - 1; redraw();
            A.showToast('Traitement créé avec des opérations réelles (normalisation mesurée + dynamique de piste) — complétez-le puis « Traiter ».', 'Batch Processing');
            return;
          }
          if (k === 'del') { const p = st.list.splice(st.sel, 1)[0] || { n: '—' }; st.sel = 0; redraw(); A.showToast('« ' + p.n + ' » supprimé de la liste des traitements.', 'Batch Processing'); return; }
          if (k === 'close') { W.close('batch'); return; }
          if (k === 'apply') {
            /* Exécution RÉELLE de la chaîne sur chaque événement de la piste. */
            const b = st.list[st.sel] || { ops: [] };
            const ti = Number(deviceState().selectedTrack) || 0;
            const clips = ((deviceState().tracks || [])[ti] || {}).clips || [];
            const n = Math.max(1, clips.length);
            let sent = 0;
            for (let ci = 0; ci < n; ci++)
              b.ops.forEach((opName) => { const fn = OPS[opName]; if (fn) { fn(ti, ci); sent++; } });
            A.showToast(sent > 0
              ? 'Traitement « ' + b.n + ' » réellement exécuté : ' + sent + ' opération(s) sur ' + n + ' événement(s) — fichiers réécrits par le moteur.'
              : 'Chaîne vide : ajoutez des opérations au traitement.', 'Batch Processing');
            return;
          }
          const MSG = {
            rename: 'Renommer le traitement sélectionné : « ' + ((st.list[st.sel] || {}).n || '—') + ' ».',
            manage: 'Gérer les traitements : liste à gauche, opérations à droite, Renommer et Supprimer.'
          };
          A.showToast(MSG[k] || '', 'Batch Processing');
        }));
      }
    };
  }

  /* =====================================================================
     12. SURROUND PANNER (+ MixConvert)
     ===================================================================== */
  function buildSurround() {
    const st = { mode: 'Standard', ms: 'Mix mono', x: 0, y: 0, lfe: -6, spk: { L: true, R: true, C: true, LFE: true, Ls: true, Rs: true },
      div: { xf: 0, xb: 0, y: 0 }, center: 100, att: 0, conv: false };
    const SPK = [['L', 18, 16], ['R', 282, 16], ['C', 150, 12], ['Ls', 30, 132], ['Rs', 270, 132], ['LFE', 150, 148]];
    function gains() {
      /* gain approximatif par haut-parleur selon la position du ballon (0..1 / 0..1) */
      const px = 0.5 + st.x / 2, py = 0.5 + st.y / 2;
      const d = (sx, sy) => Math.sqrt(Math.pow(px - sx, 2) + Math.pow((1 - py) - sy, 2));
      const raw = {
        L: Math.max(0, 1 - d(0.08, 0.2)), R: Math.max(0, 1 - d(0.92, 0.2)),
        C: Math.max(0, 1 - d(0.5, 0.12)) * (st.center / 100),
        Ls: Math.max(0, 1 - d(0.1, 0.86)), Rs: Math.max(0, 1 - d(0.9, 0.86)),
        LFE: Math.max(0, 1 - d(0.5, 0.98))
      };
      const tot = Object.keys(raw).reduce((a, k) => a + raw[k], 0) || 1;
      const out = {};
      Object.keys(raw).forEach((k) => {
        out[k] = raw[k] <= 0.02 ? -Infinity : 20 * Math.log10(raw[k] / tot) + (k === 'LFE' ? st.lfe : 0) + st.att;
      });
      return out;
    }
    function panel() {
      const G = gains();
      const W = 300, H = 170;
      const px = 150 + st.x * 120, py = 82 - st.y * 62;
      let s = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#2d3134" stroke="#1b1e20"/>';
      /* scène */
      s += '<rect x="18" y="26" width="264" height="126" fill="none" stroke="#4c5459" stroke-dasharray="3 3"/>';
      if (st.mode === 'Position') {
        s += '<circle cx="150" cy="82" r="38" fill="none" stroke="#d8cf4a" opacity=".7"/>';
        s += '<circle cx="150" cy="82" r="70" fill="none" stroke="#c05040" opacity=".7"/>';
        s += '<circle cx="150" cy="82" r="104" fill="none" stroke="#4f7fa8" opacity=".7"/>';
      }
      if (st.mode === 'Angle') {
        s += '<path d="M150 82 L' + px + ' ' + py + '" stroke="#c05040" opacity=".35" stroke-width="14"/>';
      }
      /* câbles de gain */
      SPK.forEach((k) => {
        if (!st.spk[k[0]]) return;
        const g = G[k[0]];
        if (g === -Infinity) return;
        const a = Math.max(0.12, Math.min(1, (g + 40) / 40));
        s += '<line x1="' + k[1] + '" y1="' + k[2] + '" x2="' + px + '" y2="' + py + '" stroke="#c9d84f" stroke-width="' + (1 + a * 3).toFixed(1) + '" opacity="' + a.toFixed(2) + '"/>';
      });
      SPK.forEach((k) => {
        const on = st.spk[k[0]];
        s += '<g data-spk="' + k[0] + '"><rect x="' + (k[1] - 13) + '" y="' + (k[2] - 8) + '" width="26" height="16" rx="2" fill="' +
          (on ? '#3f4a52' : '#2a2e30') + '" stroke="' + (on ? '#8fa6b4' : '#4a5054') + '"/>' +
          '<text x="' + k[1] + '" y="' + (k[2] + 3) + '" font-size="8" fill="' + (on ? '#dfe8ee' : '#6b7276') + '" text-anchor="middle">' + k[0] + '</text></g>';
        const g = G[k[0]];
        if (on && g !== -Infinity) {
          s += '<text x="' + (k[1] + (k[0] === 'L' ? -15 : k[0] === 'R' ? 15 : 0)) + '" y="' + (k[2] + (k[0] === 'C' ? -12 : k[0] === 'LFE' ? -11 : 20)) +
            '" font-size="6.5" fill="#c9d84f" text-anchor="middle">' + g.toFixed(1).replace('.', ',') + '</text>';
        }
      });
      s += '<circle cx="' + px + '" cy="' + py + '" r="7" fill="#b9bec2" stroke="#5d6467" stroke-width="1.5"/>';
      s += '<circle cx="' + px + '" cy="' + py + '" r="2" fill="#6b7276"/>';
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" data-svp style="width:100%;height:' + H + 'px;cursor:crosshair">' + s + '</svg>';
    }
    const html = () =>
      '<div class="w3-sur">' +
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Mode</span><button class="w-btn" data-sv="mode">' + st.mode + ' ▾</button>' +
      '<span class="w-lbl">Mono/Stereo</span><button class="w-btn" data-sv="ms">' + st.ms + ' ▾</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-sva="center" title="Recentrer la source">Centrer</button>' +
      '<button class="w-btn" data-sva="reset">Réinitialiser</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-sva="mixconvert" title="Remplacer le panner par MixConvert (downmix)">MixConvert…</button>' +
      '</div>' +
      '<div class="w3-surbody">' +
      '<div class="svp" data-svpanel>' + panel() + '</div>' +
      '<div class="svr">' +
      sec('Position') +
      dlgRow('X', '<span data-svx>' + st.x.toFixed(2).replace('.', ',') + '</span>') +
      dlgRow('Y', '<span data-svy>' + st.y.toFixed(2).replace('.', ',') + '</span>') +
      sec('Niveau') +
      '<div class="row"><label>LFE</label><input type="range" min="-60" max="6" value="' + st.lfe + '" data-svlfe style="width:96px"><b data-svlfeV>' + st.lfe + ' dB</b></div>' +
      '<div class="row"><label>Atténuation</label><input type="range" min="-40" max="6" value="' + st.att + '" data-svatt style="width:96px"><b data-svattV>' + st.att + ' dB</b></div>' +
      sec('Standard : Center / Divergence') +
      '<div class="row"><label>Center Level</label><input type="range" min="0" max="100" value="' + st.center + '" data-svcen style="width:96px"><b data-svcenV>' + st.center + ' %</b></div>' +
      '<div class="row"><label>Divergence X avant</label><span class="w-field" style="min-width:56px">' + st.div.xf + ' %</span></div>' +
      '<div class="row"><label>Divergence X arrière</label><span class="w-field" style="min-width:56px">' + st.div.xb + ' %</span></div>' +
      '<div class="row"><label>Divergence Y</label><span class="w-field" style="min-width:56px">' + st.div.y + ' %</span></div>' +
      '<div class="w3-note">Alt+clic sur un haut-parleur = activer / désactiver ce canal. Maj = axe horizontal, Ctrl = axe vertical.</div>' +
      '</div></div>' +
      '<div class="w3-foot"><span>Surround Panner — SurroundPan · bus 5.1 (Surround 5.1 — OUT 3 à OUT 8)</span>' +
      '<span style="flex:1"></span><span data-svinfo></span></div></div>';
    return {
      title: 'Surround Panner <em>· panoramique surround</em>', ac: '#4c6a52', fit: false, html: html(),
      after(body) {
        const redraw = () => {
          $('[data-svpanel]', body).innerHTML = panel();
          const x = $('[data-svx]', body); if (x) x.textContent = st.x.toFixed(2).replace('.', ',');
          const y = $('[data-svy]', body); if (y) y.textContent = st.y.toFixed(2).replace('.', ',');
          const G = gains();
          const inf = $('[data-svinfo]', body);
          if (inf) {
            inf.textContent = SPK.filter((k) => st.spk[k[0]]).map((k) => k[0] + ' ' +
              (G[k[0]] === -Infinity ? '-∞' : G[k[0]].toFixed(1).replace('.', ','))).join(' · ');
          }
          scrollClick();
        };
        function scrollClick() {
          const svg = $('[data-svp]', body);
          if (!svg) return;
          const move = (ev) => {
            const r = svg.getBoundingClientRect();
            let nx = ((ev.clientX - r.left) / r.width - 0.5) * 2;
            let ny = (0.5 - (ev.clientY - r.top) / r.height) * 2;
            if (ev.shiftKey) ny = st.y;
            if (ev.ctrlKey) nx = st.x;
            st.x = Math.max(-1, Math.min(1, Math.round(nx * 100) / 100));
            st.y = Math.max(-1, Math.min(1, Math.round(ny * 100) / 100));
            redraw();
          };
          svg.addEventListener('mousedown', (ev) => {
            const spk = ev.target.closest('[data-spk]');
            if (spk && ev.altKey) {
              const k = spk.dataset.spk;
              st.spk[k] = !st.spk[k];
              redraw();
              A.showToast('Haut-parleur ' + k + ' ' + (st.spk[k] ? 'activé' : 'désactivé : aucun son ne lui sera envoyé'), 'Surround Panner');
              return;
            }
            if (spk) return;
            move(ev);
            const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
          });
        }
        redraw();
        $$('[data-sv]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.sv === 'mode') popMenu(b, 'svMode', 'Mode du panner', ['Standard', 'Position', 'Angle'].map((m) => [m, m, m === st.mode]), (m) => {
            st.mode = m; b.textContent = m + ' ▾'; redraw();
            A.showToast('Mode ' + m + ' : ' + (m === 'Standard' ? 'haut-parleurs frontaux alignés, meilleur déplacement entre enceintes.' :
              m === 'Position' ? 'cercles concentriques −3 / −6 / −12 dB.' : 'définition traditionnelle, haut-parleurs équidistants (arc rouge).'), 'Surround Panner');
          });
          if (b.dataset.sv === 'ms') popMenu(b, 'svMS', 'Mono / Stéréo', ['Mix mono', 'Y-Mirror', 'X-Mirror', 'Rotate'].map((m) => [m, m, m === st.ms]), (m) => {
            st.ms = m; b.textContent = m + ' ▾';
            A.showToast('Mode stéréo « ' + m + ' » : ' + (m === 'Mix mono' ? 'les deux canaux sont mélangés avant le panner.' : 'deux ballons symétriques, axe de symétrie ' + m.split('-')[0] + '.'), 'Surround Panner');
          });
        }));
        $$('[data-sva]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.sva;
          if (k === 'center') { st.x = 0; st.y = 0; redraw(); }
          if (k === 'reset') { st.x = 0; st.y = 0; st.lfe = -6; st.att = 0; st.center = 100; Object.keys(st.spk).forEach((s) => { st.spk[s] = true; }); redraw(); }
          if (k === 'mixconvert') {
            st.conv = !st.conv;
            A.showToast('MixConvert inséré à la place du panner : downmix ' + (st.conv ? '5.1 → stéréo (réglages du plug-in)' : 'désactivé') + '. ' +
              'Rappel : il s’insère automatiquement quand la destination a moins de canaux que la source.', 'Surround Panner');
          }
        }));
        const lf = $('[data-svlfe]', body);
        if (lf) lf.addEventListener('input', () => { st.lfe = +lf.value; $('[data-svlfeV]', body).textContent = st.lfe + ' dB'; redraw(); });
        const at = $('[data-svatt]', body);
        if (at) at.addEventListener('input', () => { st.att = +at.value; $('[data-svattV]', body).textContent = st.att + ' dB'; redraw(); });
        const ce = $('[data-svcen]', body);
        if (ce) ce.addEventListener('input', () => { st.center = +ce.value; $('[data-svcenV]', body).textContent = st.center + ' %'; redraw(); });
      }
    };
  }

  /* =====================================================================
     13. SYNCHRONISATION  (Synchronization Setup)
     ===================================================================== */
  function buildSync() {
    const st = { src: 'Internal', fps: '25 im/s', drop: false, offset: '0:00:00:00', tcStart: '00:00:00:00',
      gen: 'Aucun', ltc: true, mtc: true, vst: true, full: false, port: 'Alpha MIDI 1' };
    const html = () =>
      '<div class="w3-sync">' +
      '<div class="w-toolbar"><span class="w-lbl">Source de timecode</span>' +
      '<button class="w-btn" data-sy="src">' + st.src + ' ▾</button>' +
      '<span class="w-sep"></span><span class="w-lbl">Image</span><button class="w-btn" data-sy="fps">' + st.fps + ' ▾</button>' +
      '<span style="flex:1"></span><span class="w-lbl">' + (st.ltc ? 'LTC ●' : 'LTC ○') + ' · ' + (st.mtc ? 'MTC ●' : 'MTC ○') + ' · ' + (st.vst ? 'VST Link ●' : 'VST Link ○') + '</span>' +
      '</div>' +
      '<div class="w3-syncbody">' +
      sec('Réglages du timecode') +
      dlgRow('Fréquence d’image', st.fps) +
      dlgRow('Décalage temporel', st.tcStart) +
      '<div class="row">' + chk('Drop frame (29,97)', st.drop) + chk('Le timecode suit la position du curseur', true) + '</div>' +
      sec('Signaux') +
      '<div class="row">' + chk('LTC (longitudinal)', st.ltc) + chk('MTC (MIDI Time Code)', st.mtc) +
      chk('VST System Link', st.vst) + chk('MTC plein cadre (Full Frame)', st.full) + '</div>' +
      dlgRow('Générateur', st.gen + ' <i class="arr"></i>') +
      dlgRow('Port MIDI', st.port + ' <i class="arr"></i>') +
      sec('État') +
      '<div class="row"><span class="w-lbl">Verrouillé :</span><b class="w3-ok">NON</b><span class="w-lbl">· Timecode reçu :</span><b>00:00:00:00</b>' +
      '<span class="w-lbl">· Décalage :</span><b data-syoff>0,0 ms</b></div>' +
      '<div class="w3-note">Quand Nuendo est esclave, la fréquence d’image du projet est réglée automatiquement sur celle du signal entrant.</div>' +
      '</div>' +
      '<div class="w3-foot"><span>Synchronisation — Transport ▸ Synchronisation</span><span style="flex:1"></span>' +
      '<button class="w-btn" data-sya="cancel">Annuler</button><button class="w-btn on" data-sya="ok">OK</button></div></div>';
    return {
      title: 'Synchronisation <em>· Synchronization Setup</em>', ac: '#4f7188', html: html(),
      after(body) {
        $$('[data-sy]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.sy === 'src') popMenu(b, 'sySrc', 'Source', ['Internal', 'LTC', 'MTC', 'VST System Link', 'Machine Control (9-pin)'].map((s) => [s, s, s === st.src]), (v) => {
            st.src = v; b.textContent = v + ' ▾';
            const st2 = $('.w3-ok', body); if (st2) { st2.textContent = v === 'Internal' ? 'MAÎTRE' : 'NON'; st2.className = v === 'Internal' ? '' : 'w3-ok'; }
            A.showToast('Source de timecode : ' + v + (v === 'Internal' ? ' — Nuendo est maître de l’horloge.' : ' — Nuendo est esclave, il attend le signal.'), 'Synchronisation');
          });
          if (b.dataset.sy === 'fps') popMenu(b, 'syFps', 'Fréquence d’image', ['24 im/s', '25 im/s', '29,97 im/s', '30 im/s', '29,97 dfps', '30 dfps'].map((s) => [s, s, s === st.fps]), (v) => {
            st.fps = v; b.textContent = v + ' ▾'; A.showToast('Fréquence d’image du projet : ' + v + '.', 'Synchronisation');
          });
        }));
        $$('.w3-syncbody .dlg-check', body).forEach((c) => c.addEventListener('click', () => {
          c.classList.toggle('on');
          const on = c.classList.contains('on');
          if (/LTC/.test(c.textContent)) st.ltc = on;
          if (/MTC/.test(c.textContent)) st.mtc = on;
          if (/VST System/.test(c.textContent)) st.vst = on;
          if (/Drop frame/.test(c.textContent)) st.drop = on;
        }));
        $$('[data-sya]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.sya === 'ok') A.showToast('Synchronisation enregistrée : source ' + st.src + ', ' + st.fps + '.', 'Synchronisation');
          W.close('sync');
        }));
      }
    };
  }

  /* =====================================================================
     14. MACHINE CONTROL
     ===================================================================== */
  function buildMachine() {
    const st = { dev: 'Sony 9-pin (Alpha)', port: 'COM 1', proto: 'Sony 9-pin', serial: '38 400', preroll: '2,0 s', chase: true,
      rec: true, loc: true, tc: 'LTC', online: false, cur: '00:00:00:00' };
    const html = () =>
      '<div class="w3-mc">' +
      '<div class="w-toolbar"><span class="w-lbl">Appareil</span><button class="w-btn" data-mc="dev">' + st.dev + ' ▾</button>' +
      '<span class="w-sep"></span><button class="w-btn" data-mca="online" title="Activer la liaison">En ligne</button>' +
      '<span style="flex:1"></span><span class="w-lbl" data-mcstate>Hors ligne</span></div>' +
      '<div class="w3-mcbody">' +
      '<div class="mc-lcd"><div class="t">TIMECODE APPAREIL</div><div class="v" data-mctc>' + st.cur + '</div></div>' +
      sec('Connexion') +
      dlgRow('Port', st.port + ' <i class="arr"></i>') +
      dlgRow('Protocole', st.proto + ' <i class="arr"></i>') +
      dlgRow('Débit série', st.serial + ' bauds <i class="arr"></i>') +
      dlgRow('Pré-roll d’attente', st.preroll + ' <i class="arr"></i>') +
      sec('Transport') +
      '<div class="row">' + chk('Chase (poursuite du timecode)', st.chase) + chk('Enregistrement à distance', st.rec) + chk('Localisation à distance', st.loc) + '</div>' +
      '<div class="row">' +
      btn('◀◀', '', ' data-mct="rew"') + btn('◀', '', ' data-mct="back"') + btn('■', '', ' data-mct="stop"') +
      btn('▶', '', ' data-mct="play"') + btn('▶▶', '', ' data-mct="ff"') + btn('●', '', ' data-mct="rec"') + '</div>' +
      '<div class="w3-note">Machine Control pilote un magnétoscope, une machine à bande ou un serveur vidéo via 9-pin (RS-422) ou MIDI Machine Control.</div>' +
      '</div>' +
      '<div class="w3-foot"><span>Machine Control — Transport ▸ Machine Control</span><span style="flex:1"></span>' +
      '<button class="w-btn" data-mca="close">Fermer</button><button class="w-btn on" data-mca="setup">Configurer…</button></div></div>';
    return {
      title: 'Machine Control <em>· pilotage d’appareils</em>', ac: '#5a6a78', html: html(),
      after(body) {
        cycleField(body, body, () => {});
        const lcd = $('.mc-lcd', body);
        const tick = setInterval(() => {
          if (!document.body.contains(body)) { clearInterval(tick); return; }
          if (!st.online) return;
          const p = st.cur.split(':').map((x) => parseInt(x, 10));
          p[3] = (p[3] + 5) % 25;
          if (p[3] < 5) { p[2] = (p[2] + 1) % 60; }
          if (p[2] === 0 && p[3] < 5) { p[1] = (p[1] + 1) % 60; }
          st.cur = p.map((x) => String(x).padStart(2, '0')).join(':');
          const el = $('[data-mctc]', body);
          if (el) el.textContent = st.cur;
        }, 220);
        const d = $('[data-mc]', body);
        if (d) d.addEventListener('click', () => {
          popMenu(d, 'mcDev', 'Appareil', ['Sony 9-pin (Alpha)', 'MIDI Machine Control', 'Serveur vidéo Alpha'].map((x) => [x, x, x === st.dev]), (v) => {
            st.dev = v; d.textContent = v + ' ▾'; A.showToast('Appareil : ' + v + '.', 'Machine Control');
          });
        });
        $$('[data-mca]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.mca;
          if (k === 'online') {
            st.online = !st.online;
            b.classList.toggle('on', st.online);
            b.textContent = st.online ? 'En ligne' : 'En ligne';
            $('[data-mcstate]', body).textContent = st.online ? 'En ligne · verrouillé' : 'Hors ligne';
            A.showToast(st.online ? 'Liaison établie avec « ' + st.dev + ' » : chase actif.' : 'Liaison coupée.', 'Machine Control');
            return;
          }
          if (k === 'close') { W.close('machine'); return; }
          A.showToast('Configuration Machine Control : appareil, port, protocole, débit, pré-roll, chase.', 'Machine Control');
        }));
        $$('[data-mct]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.mct;
          if (!st.online && k !== 'stop') { A.showToast('Appareil hors ligne : cliquez sur « En ligne » pour piloter le transport.', 'Machine Control'); return; }
          const MSG = { rew: 'Rembobinage', back: 'Image précédente', stop: 'Arrêt', play: 'Lecture', ff: 'Avance rapide', rec: 'Enregistrement' };
          A.showToast(MSG[k] + ' envoyé à « ' + st.dev + ' » (' + st.proto + ').', 'Machine Control');
        }));
      }
    };
  }

  /* =====================================================================
     15. VST SYSTEM LINK
     ===================================================================== */
  function buildSysLink() {
    const st = { active: false, master: true, out: 'OUT 25 / OUT 26', in: 'IN 13 / IN 14', rate: '48 000 Hz', offset: 0,
      nodes: [{ n: 'Alpha Studio B', online: true, cpu: 38 }, { n: 'Alpha Rack C', online: false, cpu: 0 }] };
    const html = () =>
      '<div class="w3-sl">' +
      '<div class="w-toolbar"><button class="w-btn" data-sla="toggle">Activer le système</button>' +
      '<span class="w-sep"></span><span class="w-lbl">Rôle</span>' +
      '<button class="w-btn on" data-sl="role">Maître</button>' +
      '<span style="flex:1"></span><span class="w-lbl" data-slstate>Inactif</span></div>' +
      '<div class="w3-slbody">' +
      sec('Connexion') +
      dlgRow('Sortie numérique (vers le réseau)', st.out + ' <i class="arr"></i>') +
      dlgRow('Entrée numérique (du réseau)', st.in + ' <i class="arr"></i>') +
      dlgRow('Fréquence d’échantillonnage', st.rate + ' <i class="arr"></i>') +
      dlgRow('Décalage de synchronisation', st.offset + ' éch. <i class="arr"></i>') +
      sec('Ordinateurs du réseau') +
      '<table class="w3-table"><thead><tr><th>Ordinateur</th><th style="width:88px">État</th><th style="width:90px">CPU</th></tr></thead><tbody>' +
      st.nodes.map((n) => '<tr><td>' + n.n + '</td><td>' + (n.online ? 'En ligne' : 'Hors ligne') +
        '</td><td class="num">' + (n.online ? n.cpu + ' %' : '—') + '</td></tr>').join('') +
      '</tbody></table>' +
      '<div class="w3-note">Le réseau VST System Link transporte l’échantillon d’horloge et les données entre les ordinateurs : ' +
      'un maître, plusieurs esclaves. Chaque machine doit être reliée par une sortie numérique vers l’entrée de la suivante (boucle).</div>' +
      '</div>' +
      '<div class="w3-foot"><span>VST System Link — Transport ▸ VST System Link</span><span style="flex:1"></span>' +
      '<button class="w-btn" data-sla="close">Fermer</button></div></div>';
    return {
      title: 'VST System Link <em>· réseau de stations</em>', ac: '#4d7cab', html: html(),
      after(body) {
        cycleField(body, body, () => {});
        $$('[data-sla]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.sla === 'close') { W.close('syslink'); return; }
          st.active = !st.active;
          b.classList.toggle('on', st.active);
          b.textContent = st.active ? 'Désactiver le système' : 'Activer le système';
          $('[data-slstate]', body).textContent = st.active ? (st.master ? 'Actif · maître' : 'Actif · esclave') : 'Inactif';
          st.nodes.forEach((n, i) => { if (i === 0) n.online = st.active; });
          A.showToast(st.active ? 'VST System Link actif : Alpha Studio B en ligne, horloge 48 000 Hz transmise.' : 'VST System Link arrêté.', 'VST System Link');
        }));
        const r = $('[data-sl]', body);
        if (r) r.addEventListener('click', () => {
          popMenu(r, 'slRole', 'Rôle de cette station', [['Maître', 'Maître'], ['Esclave', 'Esclave']], (v) => {
            st.master = v === 'Maître';
            r.textContent = v;
            $('[data-slstate]', body).textContent = st.active ? 'Actif · ' + v.toLowerCase() : 'Inactif';
          });
        });
      }
    };
  }

  /* =====================================================================
     16. REWIRE
     ===================================================================== */
  function buildRewire() {
    const st = { open: true, chans: [
      { n: 'Reason • Mix L/R', on: true, act: 'Mix L / Mix R' },
      { n: 'Reason • Sortie 3', on: false, act: '—' },
      { n: 'Reason • Sortie 4', on: false, act: '—' },
      { n: 'Reason • MIDI 1', on: true, act: 'Reason Synth' }
    ] };
    const html = () =>
      '<div class="w3-rw">' +
      '<div class="w-toolbar"><button class="w-btn on" data-rwa="launch">Lancer l’application ReWire</button>' +
      '<button class="w-btn" data-rwa="quit">Quitter ReWire</button>' +
      '<span class="w-sep"></span><button class="w-btn" data-rwa="tempo" title="Laisser l’application ReWire suivre le tempo de Nuendo">Tempo maître : Nuendo</button>' +
      '<span style="flex:1"></span><span class="w-lbl" data-rwstate>2 canaux actifs</span></div>' +
      '<div class="w3-rwbody">' +
      '<table class="w3-table"><thead><tr><th style="width:36px">On</th><th>Canal ReWire</th><th>Piste du projet</th></tr></thead><tbody data-rwbody>' +
      st.chans.map((c, i) => '<tr><td class="on"><span class="w3-cbx' + (c.on ? ' on' : '') + '" data-rw="' + i + '"></span></td>' +
        '<td>' + esc(c.n) + '</td><td>' + c.act + '</td></tr>').join('') +
      '</tbody></table>' +
      '<div class="w3-note">Ordre de lancement : Nuendo d’abord (maître ReWire), puis l’application ReWire. Les canaux ReWire sont ' +
      'routés vers des pistes du projet ; le transport et le tempo de Nuendo pilotent l’application.</div>' +
      '</div>' +
      '<div class="w3-foot"><span>ReWire — Devices ▸ ReWire</span><span style="flex:1"></span>' +
      '<button class="w-btn" data-rwa="close">Fermer</button></div></div>';
    return {
      title: 'ReWire <em>· application invitée</em>', ac: '#6a5d94', html: html(),
      after(body) {
        const redraw = () => {
          $('[data-rwbody]', body).innerHTML = st.chans.map((c, i) => '<tr><td class="on"><span class="w3-cbx' + (c.on ? ' on' : '') + '" data-rw="' + i + '"></span></td>' +
            '<td>' + esc(c.n) + '</td><td>' + (c.on ? 'Piste ReWire ' + (i + 1) : '—') + '</td></tr>').join('');
          $('[data-rwstate]', body).textContent = st.chans.filter((c) => c.on).length + ' canaux actifs';
          bind();
        };
        function bind() {
          $$('[data-rw]', body).forEach((c) => c.addEventListener('click', () => {
            const ch = st.chans[+c.dataset.rw];
            if (!ch) return;
            ch.on = !ch.on;
            redraw();
            A.showToast('Canal « ' + ch.n + ' » ' + (ch.on ? 'activé : une piste ReWire est créée dans le projet.' : 'désactivé : la piste est retirée.'), 'ReWire');
          }));
        }
        bind();
        $$('[data-rwa]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.rwa;
          if (k === 'close') { W.close('rewire'); return; }
          const MSG = {
            launch: 'Application ReWire lancée : Nuendo est maître de ReWire (à lancer en premier).',
            quit: 'Application ReWire quittée ; les canaux restent configurés pour le prochain lancement.',
            tempo: 'Le transport et le tempo de Nuendo pilotent l’application ReWire (lecture, arrêt, position, BPM).'
          };
          A.showToast(MSG[k] || '', 'ReWire');
        }));
      }
    };
  }

  /* =====================================================================
     ENREGISTREMENT
     ===================================================================== */
  W.register({
    plugininfo: { label: 'Informations sur les plug-ins', x: 300, y: 150, w: 900, h: 420, ac: '#4f7188', build: buildPluginInfo },
    logical: { label: 'Éditeur logique', x: 320, y: 120, w: 760, h: 520, ac: '#6a5d94', build: function () {
      return logicalWin({
        title: 'Éditeur logique <em>· Logical Editor</em>', ac: '#6a5d94', kind: 'midi', label: 'Éditeur logique',
        conds: LE_COND,
        funcs: LE_FUNC,
        acts: LE_ACT,
        presets: LE_PRESETS
      });
    } },
    inputtrans: { label: 'Input Transformer', x: 340, y: 140, w: 740, h: 470, ac: '#6a5d94', build: buildInputTransformer },
    projlogical: { label: 'Project Logical Editor', x: 340, y: 150, w: 780, h: 500, ac: '#6f7d86', build: buildProjectLE },
    mididevice: { label: 'MIDI Device Manager', x: 320, y: 140, w: 700, h: 470, ac: '#6a5d94', build: buildMidiDevice },
    trackpresets: { label: 'Presets de piste', x: 300, y: 130, w: 800, h: 460, ac: '#3f6c98', build: buildTrackPresets },
    quantize: { label: 'Setup de quantize', x: 380, y: 170, w: 620, h: 420, ac: '#6a5d94', build: buildQuantize },
    beatcalc: { label: 'Beat Calculator', x: 460, y: 210, w: 540, h: 300, ac: '#4f7188', build: buildBeatCalc },
    importmedium: { label: 'Import Medium', x: 320, y: 140, w: 780, h: 440, ac: '#5a7fa3', build: buildImportMedium },
    omf: { label: 'Exportation OMF / AAF', x: 380, y: 150, w: 620, h: 470, ac: '#8a7a4c', build: buildOmf },
    batch: { label: 'Traitement par lot', x: 380, y: 170, w: 620, h: 380, ac: '#8a7a4c', build: buildBatch },
    surround: { label: 'Surround Panner', x: 400, y: 150, w: 620, h: 420, ac: '#4c6a52', build: buildSurround },
    sync: { label: 'Synchronisation', x: 380, y: 150, w: 620, h: 450, ac: '#4f7188', build: buildSync },
    machine: { label: 'Machine Control', x: 400, y: 160, w: 600, h: 430, ac: '#5a6a78', build: buildMachine },
    syslink: { label: 'VST System Link', x: 380, y: 160, w: 620, h: 400, ac: '#4d7cab', build: buildSysLink },
    rewire: { label: 'ReWire', x: 400, y: 180, w: 600, h: 360, ac: '#6a5d94', build: buildRewire }
  });
})();
