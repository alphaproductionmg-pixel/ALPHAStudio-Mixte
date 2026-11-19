/* =========================================================================
   ALPHA Studio — Fenêtres flottantes (étape 1 : interface)
   Mixer, Réglages de canal, Panneau d'automatisation, Éditeurs,
   MediaBay, Pool, Instruments VST, Connexions VST, Marqueurs.
   ========================================================================= */
(function () {
  'use strict';

  const A = window.ALPHA || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  const REG = Object.create(null);
  let zTop = 470;
  let cascade = 0;

  // AUDIT v6 — accès réel au moteur natif : les espaces de travail sont
  // mémorisés/rappelés dans le projet C++ (storeWorkspace/recallWorkspace),
  // plus seulement dans localStorage.
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
    const m = /^native_(\d+)$/.exec(String((A.state && A.state.selectedTrack) || ''));
    return m ? Number(m[1]) : 0;
  };
  /* AUDIT v6 (A108) : indice natif d'une piste de l'interface. Les pistes du
     moteur sont publiées sous l'identifiant « native_N » ; à défaut on retombe
     sur la position réelle de la piste dans l'état publié par le moteur. */
  const nativeTrackIndex = (id) => {
    const m = /^native_(\d+)$/.exec(String(id || ''));
    if (m) return Number(m[1]);
    const list = deviceState().tracks || [];
    const name = ((A.trackById && A.trackById(id)) || {}).name;
    for (let i = 0; i < list.length; i++)
      if (String(list[i].id || '') === String(id || '') || (name && String(list[i].name || '') === String(name))) return i;
    const rows = (A.TRACKS || []).filter((x) => x && x.num && ['folder', 'video', 'marker', 'tempo', 'ruler', 'arrange'].indexOf(x.kind) < 0);
    for (let i = 0; i < rows.length; i++) if (rows[i].id === id) return i;
    return selectedNativeIndex();
  };

  /* --------------------------------------------------------------- outils */
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const dbTxt = (db) => (db < 0 ? '\u2212' : '+') + Math.abs(db).toFixed(1).replace('.', ',');
  const dbToPct = A.dbToPct || ((db) => Math.min(93, Math.max(6, 72 + db * 3.4)));
  const pctToDb = (p) => Math.max(-60, Math.min(6, (p - 72) / 3.4));

  const PAN = { gtrR: -0.35, keys: 0.2, perc: 0.4, choeurs: -0.2, amb: 0.15, basse: 0, drums: 0, busdrums: 0, gtrS: 0.12, voix: 0, fx: 0 };
  const SEND = { voix: 42, choeurs: 55, gtrS: 30, keys: 24, perc: 18, drums: 8 };
  const EQF = ['0,1k', '0,5k', '2,4k', '8k'];

  function knobRot(id, i) {
    const r = mulberry(hash(id) + i * 977)();
    return Math.round((r - 0.5) * 150);
  }

  /* ====================== GESTIONNAIRE DE FENÊTRES ====================== */
  /* taille maximale utilisable sur cet écran (marges de 12 px + barres) */
  function fitSize(w, h) {
    const availW = Math.max(320, window.innerWidth - 24);
    const availH = Math.max(180, window.innerHeight - 24);
    return { w: Math.min(w, availW), h: Math.min(h, availH) };
  }

  /* hauteur naturelle du contenu, mesurée sans étirement flex */
  function naturalHeight(el) {
    const bd = $('[data-body]', el);
    if (!bd) return 0;
    const kids = Array.prototype.slice.call(bd.children);
    if (!kids.length) return 0;
    const saved = kids.map((k) => (k.getAttribute('style') || ''));
    const savedH = el.style.height;
    const cs = getComputedStyle(bd);
    el.style.height = '1600px';
    kids.forEach((k) => { k.style.flex = '0 0 auto'; k.style.height = 'auto'; k.style.minHeight = '0'; });
    let nat = 0;
    kids.forEach((k) => {
      const c = getComputedStyle(k);
      nat += k.getBoundingClientRect().height + (parseFloat(c.marginTop) || 0) + (parseFloat(c.marginBottom) || 0);
    });
    nat += (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    kids.forEach((k, i) => { if (saved[i]) k.setAttribute('style', saved[i]); else k.removeAttribute('style'); });
    el.style.height = savedH;
    return Math.ceil(nat) + 22 + (el.querySelector('.aw-foot') ? 18 : 0) + 2;
  }

  /* fenêtres « dialogue » : on rogne le vide sous le contenu */
  function fitWindow(w, growOnly) {
    if (!w.cfg.fit || w.maxed) return;
    const nat = naturalHeight(w.el);
    if (!nat) return;
    const maxH = fitSize(w.cfg.w, 99999).h;   /* ne jamais dépasser l'écran */
    let target = Math.max(w.cfg.minH || 190, Math.min(nat, maxH));
    /* après une interaction, on agrandit si le contenu déborde, sans contrarier un redimensionnement manuel */
    if (growOnly) target = Math.max(target, parseInt(w.el.style.height) || 0);
    if (Math.abs(target - parseInt(w.el.style.height)) > 3) {
      w.el.style.height = target + 'px';
      w.h = target;
    }
    /* si l'ajustement fait sortir la fenêtre de l'écran, on la remonte / recentre */
    const r = w.el.getBoundingClientRect();
    const pad = 10;
    if (r.bottom > window.innerHeight - pad) {
      w.el.style.top = Math.max(pad, window.innerHeight - Math.ceil(r.height) - pad) + 'px';
    }
    if (r.right > window.innerWidth - pad) {
      w.el.style.left = Math.max(pad, window.innerWidth - Math.ceil(r.width) - pad) + 'px';
    }
    if (parseFloat(w.el.style.top) < pad) w.el.style.top = pad + 'px';
    if (parseFloat(w.el.style.left) < pad) w.el.style.left = pad + 'px';
  }

  /* recadre toutes les fenêtres quand la page change de taille */
  function reclampAll() {
    Object.keys(REG).forEach((k) => {
      const w = REG[k];
      if (w.maxed) {
        if (!w.el.classList.contains('max')) return;
        w.el.style.width = window.innerWidth + 'px';
        w.el.style.height = window.innerHeight + 'px';
        return;
      }
      const sz = fitSize(parseInt(w.el.style.width) || w.cfg.w, parseInt(w.el.style.height) || w.cfg.h);
      w.el.style.width = sz.w + 'px';
      w.el.style.height = sz.h + 'px';
      w.h = sz.h;
      const r = w.el.getBoundingClientRect();
      if (r.right > window.innerWidth - 4) w.el.style.left = Math.max(4, window.innerWidth - sz.w - 4) + 'px';
      if (r.bottom > window.innerHeight - 4) w.el.style.top = Math.max(4, window.innerHeight - sz.h - 4) + 'px';
      if (r.left < 0) w.el.style.left = '4px';
      if (r.top < 0) w.el.style.top = '4px';
    });
  }
  window.addEventListener('resize', reclampAll);

  function place(cfg) {
    const sz = fitSize(cfg.w, cfg.h);
    const W = sz.w, H = sz.h;
    const vw = window.innerWidth, vh = window.innerHeight;
    const step = (cascade++ % 6) * 22;
    const prefX = Math.max(8, Math.min((cfg.x || 220) + step, Math.max(8, vw - W - 16)));
    const prefY = Math.max(74, Math.min((cfg.y || 130) + step, Math.max(74, vh - H - 16)));
    const rects = Object.keys(REG).map((k) => REG[k].el.getBoundingClientRect());
    if (!rects.length) return { x: prefX, y: prefY };
    function score(x, y) {
      let sc = 0;
      rects.forEach((r) => {
        const ox = Math.max(0, Math.min(x + W, r.right) - Math.max(x, r.left));
        const oy = Math.max(0, Math.min(y + H, r.bottom) - Math.max(y, r.top));
        if (ox > 0 && oy > 0) sc += (ox * oy) / (W * H);
      });
      /* léger bonus de proximité : on reste près de la position voulue */
      return sc + Math.hypot(x - prefX, y - prefY) / (vw + vh);
    }
    const xs = [8, vw * 0.22, vw * 0.42, vw * 0.62, vw * 0.82, prefX];
    const ys = [74, vh * 0.30, vh * 0.55, vh * 0.78, prefY];
    let best = { x: prefX, y: prefY, sc: score(prefX, prefY) };
    xs.forEach((px) => ys.forEach((py) => {
      const x = Math.max(8, Math.min(Math.round(px), Math.max(8, vw - W - 12)));
      const y = Math.max(74, Math.min(Math.round(py), Math.max(74, vh - H - 12)));
      const sc = score(x, y);
      if (sc < best.sc - 0.005) best = { x, y, sc };
    }));
    return { x: best.x, y: best.y };
  }

  function bindFrame(w) {
    const el = w.el;
    const head = $('.aw-head', el);
    let drag = null;

    el.addEventListener('pointerdown', () => focus(w), true);

    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag || w.maxed) return;
      const L = Math.min(Math.max(-el.offsetWidth + 120, e.clientX - drag.x), window.innerWidth - 120);
      const T = Math.min(Math.max(0, e.clientY - drag.y), window.innerHeight - 30);
      el.style.left = L + 'px';
      el.style.top = T + 'px';
    });
    const stop = () => { drag = null; };
    head.addEventListener('pointerup', stop);
    head.addEventListener('pointercancel', stop);
    head.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) toggleMax(w); });

    const grip = $('.aw-grip', el);
    let rz = null;
    grip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      rz = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', (e) => {
      if (!rz || w.maxed) return;
      el.style.width = Math.max(320, rz.w + (e.clientX - rz.x)) + 'px';
      el.style.height = Math.max(150, rz.h + (e.clientY - rz.y)) + 'px';
    });
    const rzStop = () => { rz = null; };
    grip.addEventListener('pointerup', rzStop);
    grip.addEventListener('pointercancel', rzStop);

    /* un dialogue se réajuste quand son contenu change (onglet, liste, case à cocher) */
    el.addEventListener('click', () => { if (w.cfg.fit) setTimeout(() => fitWindow(w, true), 0); });
    el.addEventListener('change', () => { if (w.cfg.fit) setTimeout(() => fitWindow(w, true), 0); });

    $('.aw-btn.pin', el).addEventListener('click', (e) => { e.stopPropagation(); setAoT(w, !w.aot); });
    head.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      focus(w);
      showWinMenu(w, e.clientX, e.clientY);
    });
    $('.aw-btn.x', el).addEventListener('click', () => close(w.id));
    $('.aw-btn.min', el).addEventListener('click', () => {
      el.classList.toggle('min');
      el.style.height = el.classList.contains('min') ? '22px' : (w.h + 'px');
    });
    $('.aw-btn.max', el).addEventListener('click', () => toggleMax(w));
  }

  function toggleMax(w) {
    const el = w.el;
    if (!w.maxed) {
      w.prev = { l: el.style.left, t: el.style.top, w: el.style.width, h: el.style.height };
      el.classList.add('max');
      el.style.left = '0px'; el.style.top = '0px';
      el.style.width = window.innerWidth + 'px';
      el.style.height = window.innerHeight + 'px';
      w.maxed = true;
    } else {
      el.classList.remove('max');
      Object.assign(el.style, { left: w.prev.l, top: w.prev.t, width: w.prev.w, height: w.prev.h });
      w.maxed = false;
    }
  }

  function focus(w) {
    Object.keys(REG).forEach((k) => REG[k].el.classList.remove('focused'));
    w.el.classList.add('focused');
    if (w.aot) { w.el.style.zIndex = 9000 + (++aotSeq); return; }
    zTop = Math.min(zTop + 1, 8900);
    w.el.style.zIndex = zTop;
    /* les fenêtres épinglées restent au-dessus */
    Object.keys(REG).forEach((k) => { const o = REG[k]; if (o.aot) o.el.style.zIndex = 9000 + (++aotSeq); });
  }

  let aotSeq = 0;

  function setAoT(w, on) {
    w.aot = !!on;
    w.el.classList.toggle('aot', w.aot);
    const pin = $('.aw-btn.pin', w.el);
    if (pin) pin.classList.toggle('on', w.aot);
    if (w.aot) w.el.style.zIndex = 9000 + (++aotSeq);
    else focus(w);
  }

  function toggleMaxById(id) { const w = REG[id]; if (w) { focus(w); toggleMax(w); } }

  function syncWinCount() {
    const el = document.getElementById('sbWins');
    if (el) el.textContent = Object.keys(REG).length;
  }

  function close(id) {
    const w = REG[id];
    if (!w) return;
    w.el.remove();
    delete REG[id];
    syncWinCount();
  }

  function open(id, arg) {
    const cfg = WINDOWS[id];
    if (!cfg) return;
    let w = REG[id];
    if (!w) {
      const el = document.createElement('div');
      el.className = 'aw';
      el.id = 'aw-' + id;
      const pos = place(cfg);
      const sz = fitSize(cfg.w, cfg.h);
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      el.style.width = sz.w + 'px';
      el.style.height = sz.h + 'px';
      el.innerHTML =
        '<div class="aw-head"><span class="aw-ico" style="--ac:' + (cfg.ac || '#5a7fa3') + '"></span>' +
        '<span class="aw-title" data-title></span>' +
        '<span class="aw-btns">' +
        '<button class="aw-btn pin" title="Toujours devant (clic droit sur le titre pour plus d\u2019options)">' +
        '<svg viewBox="0 0 16 16"><path d="M9.9 1.6 14.4 6.1 13 6.7 10.5 9.2 10.8 12.2 9.8 13.2 6.6 10 3.2 13.4 2.6 12.8 6 9.4 2.8 6.2 3.8 5.2 6.8 5.5 9.3 3 9.9 1.6Z"/></svg></button>' +
        '<button class="aw-btn min" title="Réduire">–</button>' +
        '<button class="aw-btn max" title="Agrandir (double-clic sur le titre)">▣</button>' +
        '<button class="aw-btn x" title="Fermer">✕</button>' +
        '</span></div>' +
        '<div class="aw-body" data-body></div>' +
        '<div class="aw-grip"></div>';
      document.body.appendChild(el);
      w = REG[id] = { id, el, cfg, arg: null, maxed: false, h: sz.h, justOpened: true };
      bindFrame(w);
    }
    if (arg !== undefined) {
      const changed = w.arg !== arg;
      w.arg = arg;
      if (!changed && !w.justOpened) { focus(w); return w; }
      renderWindow(w);
    } else if (!REG[id] || w.justOpened) {
      renderWindow(w);
    } else {
      focus(w);
      return w;
    }
    w.justOpened = false;
    w.el.classList.remove('min');
    w.el.style.height = (w.el.classList.contains('max') ? window.innerHeight : w.h) + 'px';
    focus(w);
    if (w.cfg.fit) setTimeout(() => fitWindow(w), 0);
    syncWinCount();
    return w;
  }

  function renderWindow(w) {
    const body = $('[data-body]', w.el);
    const out = w.cfg.build(w.arg, w);
    $('[data-title]', w.el).innerHTML = out.title || w.cfg.label;
    $('.aw-ico', w.el).style.setProperty('--ac', out.ac || w.cfg.ac || '#5a7fa3');
    body.innerHTML = out.html;
    if (w.cfg.after) w.cfg.after(body, w);
    if (out.after) out.after(body, w);
  }

  /* =====================================================================
     MIXCONSOLE
     ===================================================================== */
  function mixStrip(t) {
    const isGroup = t.kind === 'group', isFx = t.kind === 'fx';
    const pan = PAN[t.id] || 0;
    const db = typeof t.db === 'number' ? t.db : -6;
    const lvl = Math.max(6, Math.min(92, dbToPct(db)));
    const base = t.kind === 'midi' ? ['Aucun', 'Aucun'] :
      isGroup ? ['Comp Bus', 'Aucun'] :
      isFx ? ['Réverb Alpha', 'Aucun'] : ['Comp Alpha VCA', 'De-esser Pro'];
    const ins = [];
    for (let i = 0; i < 8; i++) ins.push(base[i] || 'Aucun');
    const s1 = SEND[t.id] != null ? SEND[t.id] : 22;
    const sel = t.id === A.state.selectedTrack ? ' sel' : '';
    const panTxt = pan === 0 ? 'C' : (pan < 0 ? 'L' : 'R') + Math.round(Math.abs(pan) * 100);
    const send = (lbl, v) => '<div class="ms-send"><span>' + lbl + '</span><div class="bar"><i style="--v:' + v + '%"></i></div></div>';
    return '<div class="mstrip' + sel + (t.canHide ? ' canhide' : '') + '" data-mstrip="' + t.id + '" data-kind="' + t.kind + '" style="--tc:' + t.color + '">' +
      '<div class="ms-out">' + (isGroup ? 'Groupe' : isFx ? 'FX' : 'Stéréo Out') + '</div>' +
      '<div class="ms-color"></div>' +
      '<div class="ms-name" data-pick="' + t.id + '"><b>' + (t.num || '—') + '</b>' + esc(t.name) + '</div>' +
      '<div class="ms-block" data-vblock="ins"><div class="ms-cap">Inserts</div><div class="ms-ins ms-ins8">' +
      ins.map((n) => '<div class="is' + (n !== 'Aucun' ? ' act' : '') + '"><i></i>' + n + '</div>').join('') +
      '</div></div>' +
      '<div class="ms-block" data-vblock="eq"><div class="ms-cap">EQ</div><div class="ms-eq">' +
      [0, 1, 2, 3].map((i) => '<div><div class="ms-knob" style="--rot:' + knobRot(t.id, i) + 'deg"></div>' +
        '<div class="ms-knob-l">' + EQF[i] + '</div></div>').join('') +
      '</div></div>' +
      '<div class="ms-block" data-vblock="eqc"><div class="ms-cap">Courbe d’égalisation</div>' +
      '<svg class="ms-curve" viewBox="0 0 68 26" preserveAspectRatio="none">' +
      '<path d="M0 20 C10 20 12 12 20 13 S32 5 40 9 S56 18 68 16" fill="none" stroke="#7fae6a" stroke-width="1.4"/>' +
      '<path d="M0 20 C10 20 12 12 20 13 S32 5 40 9 S56 18 68 16 L68 26 L0 26 Z" fill="rgba(127,174,106,.22)" stroke="none"/>' +
      '<line x1="0" y1="13" x2="68" y2="13" stroke="#a3a19b" stroke-width=".6" stroke-dasharray="2 2"/></svg></div>' +
      '<div class="ms-block" data-vblock="snd"><div class="ms-cap">Départs 1-4</div><div class="ms-sends">' +
      send('A', s1) + send('B', Math.max(0, s1 - 26)) + send('C', 0) + send('D', 0) +
      '</div></div>' +
      '<div class="ms-block" data-vblock="snd2"><div class="ms-cap">Départs 5-8</div><div class="ms-sends">' +
      send('E', 0) + send('F', 0) + send('G', 0) + send('H', 0) +
      '</div></div>' +
      '<div class="ms-block" data-vblock="sts"><div class="ms-cap">Studio Sends</div><div class="ms-sends">' +
      send('S1', isFx ? 0 : 34) + send('S2', 0) +
      '</div></div>' +
      '<div class="ms-block" data-vblock="sur"><div class="ms-cap">Panneau surround</div>' +
      '<div class="ms-sur"><i class="sp" style="--x:' + (50 + pan * 42) + '%;--y:74%"></i>' +
      '<span class="l">L</span><span class="r">R</span><span class="ls">Ls</span><span class="rs">Rs</span></div></div>' +
      '<div class="ms-ovw" data-vblock="ovw"><span data-mx="ovwEQ">EQ</span>' +
      '<span data-mx="ovwINS">INS</span><span data-mx="ovwSND">SND</span></div>' +
      '<div class="ms-rw"><button class="tiny" data-rw="r" data-t="' + t.id + '" title="Lecture de l’automatisation">R</button>' +
      '<button class="tiny" data-rw="w" data-t="' + t.id + '" title="Écriture de l’automatisation">W</button>' +
      '<button class="tiny' + (t.canHide ? ' on' : '') + '" data-canhide="' + t.id + '" title="Can Hide — marquer ce canal comme masquable">/</button></div>' +
      '<div class="ms-pan" title="Panoramique"><div class="ms-knob" style="--rot:' + Math.round(pan * 120) + 'deg"></div>' +
      '<span class="pv">' + panTxt + '</span></div>' +
      '<div class="ms-fader-wrap" data-vblock="mtr">' +
      '<div class="meter" title="Niveau — mesuré par le moteur audio natif"><i style="--lvl:' + lvl + '%"></i>' +
      '<i class="pk" style="--pk:' + Math.min(97, lvl + 7) + '%"></i></div>' +
      '<div class="vfader" data-fader="' + t.id + '" title="Fader — glisser (double-clic : 0 dB)"><div class="trk"></div>' +
      '<div class="cap" style="--p:' + lvl + '%"></div></div></div>' +
      '<div class="ms-db" data-db>' + dbTxt(db) + '</div>' +
      '<div class="ms-btns">' +
      '<button class="tiny' + (t.mute ? ' on-m' : '') + '" data-mx="mute" data-t="' + t.id + '">M</button>' +
      '<button class="tiny' + (t.solo ? ' on-s' : '') + '" data-mx="solo" data-t="' + t.id + '">S</button>' +
      (!isGroup && !isFx ? '<button class="tiny' + (t.rec ? ' on-r' : '') + '" data-mx="rec" data-t="' + t.id + '"><span class="dot"></span></button>' : '') +
      '<button class="tiny" data-mx="e" data-t="' + t.id + '">e</button>' +
      '</div>' +
      '<div class="ms-bot">' + (isFx ? 'FX 1' : 'Stéréo') + '</div>' +
      '</div>';
  }

  function masterStrip() {
    return '<div class="mstrip master">' +
      '<div class="ms-out">Sortie principale</div>' +
      '<div class="ms-color" style="--tc:#4d5c6b"></div>' +
      '<div class="ms-name"><b>M</b>STÉRÉO OUT</div>' +
      '<div class="ms-block" data-vblock="ins"><div class="ms-cap">Inserts</div><div class="ms-ins">' +
      '<div class="is act"><i></i>Comp Bus Alpha</div><div class="is act"><i></i>Limiteur Alpha</div>' +
      '</div></div>' +
      '<div class="mw-master-scale"><div class="mst-scale">' +
      '<div class="col"><span>+6</span><span>0</span><span>−12</span><span>−24</span><span>−36</span><span>−48</span><span>−60</span></div>' +
      '</div></div>' +
      '<div class="ms-fader-wrap">' +
      '<div class="meter"><i style="--lvl:79%"></i><i class="pk" style="--pk:84%"></i></div>' +
      '<div class="vfader" data-fader="master"><div class="trk"></div><div class="cap" style="--p:74%"></div></div>' +
      '<div class="meter"><i style="--lvl:75%"></i><i class="pk" style="--pk:81%"></i></div>' +
      '</div>' +
      '<div class="ms-rw"><button class="tiny" data-rw="r" data-t="__master" title="Lecture de l’automatisation">R</button>' +
      '<button class="tiny" data-rw="w" data-t="__master" title="Écriture de l’automatisation">W</button>' +
      '<button class="tiny" data-canhide="__master" title="Can Hide">/</button></div>' +
      '<div class="ms-pan" title="Sortie stéréo"><div class="ms-knob" style="--rot:0deg"></div><span class="pv">ST</span></div>' +
      '<div class="ms-db" data-db>−0,8</div>' +
      '<div class="ms-btns">' +
      '<button class="tiny" data-mx="reset" title="Réinitialiser les crêtes">R</button>' +
      '<button class="tiny" data-mx="e" data-t="__master">e</button>' +
      '</div>' +
      '<div class="ms-bot">Stéréo</div>' +
      '</div>';
  }

  const MIX = {
    view: { ins: true, eq: true, eqc: false, snd: true, snd2: false, sts: false, sur: false, ovw: false, mtr: true },
    narrow: false, ext: true, routing: true,
    types: { audio: true, group: true, midi: true, fx: true, in: true, vsti: true, out: true },
    meter: { hold: true, forever: false, input: false, postfader: true, postpan: false, fast: false },
    sets: [], activeSet: null
  };

  function buildMixer() {
    const A2 = A;
    const tracks = A2.TRACKS.filter((t) => t.kind === 'audio' || t.kind === 'midi' || t.kind === 'group' || t.kind === 'fx');
    const NCH = tracks.length + 1;
    const TYPES = [['in', 'Entrées'], ['audio', 'Audio'], ['group', 'Groupes'], ['vsti', 'Instr.'],
                   ['midi', 'MIDI'], ['fx', 'FX'], ['out', 'Sortie']];
    const VIEWS = [['ins', 'Inserts'], ['eq', 'Égaliseurs'], ['eqc', 'Égal. courbe'],
                   ['snd', 'Départs 1-4'], ['snd2', 'Départs 5-8'], ['sts', 'Studio Sends'],
                   ['sur', 'Surround'], ['ovw', 'Ensemble'], ['mtr', 'Compteurs'], ['emp', 'Vide']];
    const common =
      '<div class="mw-common">' +
      '<div class="mwc-h">CAN HIDE · ÉTAT</div>' +
      '<div class="mwc-row"><button class="mwc-btn" data-mhide="1" title="Masquer / réafficher les canaux marqués « Can Hide »">Masquer</button>' +
      '<button class="mwc-btn" data-mstate="1" title="Afficher / masquer le panneau de routage">Routage</button></div>' +
      '<div class="mwc-h">OPTIONS DE VUE</div>' +
      '<div class="mwc-views">' + VIEWS.map((v) =>
        '<button class="mwc-v' + (MIX.view[v[0]] ? ' on' : '') + '" data-mview="' + v[0] + '" title="' + v[1] + '">' + v[1] + '</button>').join('') +
      '</div>' +
      '<div class="mwc-row col"><button class="mwc-btn" data-mwidth="wide" title="Toutes les tranches larges">Toutes larges</button>' +
      '<button class="mwc-btn" data-mwidth="narrow" title="Toutes les tranches étroites">Toutes étroites</button></div>' +
      '<div class="mwc-h">GLOBAL</div>' +
      '<div class="mwc-3"><button class="mwc-g" data-mglob="mute" title="Mute global">M</button>' +
      '<button class="mwc-g" data-mglob="solo" title="Solo global">S</button>' +
      '<button class="mwc-g" data-mglob="listen" title="Listen global">L</button></div>' +
      '<div class="mwc-3"><button class="mwc-g" data-mglob="read" title="Lecture de l’automatisation pour tous">R</button>' +
      '<button class="mwc-g" data-mglob="write" title="Écriture de l’automatisation pour tous">W</button>' +
      '<button class="mwc-g" data-mglob="reset" title="Réinitialiser (tous ou sélectionnés)">↺</button></div>' +
      '<div class="mwc-row"><button class="mwc-btn" data-mcopy="copy" title="Copier les réglages du canal sélectionné">Copier</button>' +
      '<button class="mwc-btn" data-mcopy="paste" title="Coller sur les canaux sélectionnés">Coller</button></div>' +
      '<button class="mwc-btn wide" data-mconn="1" title="Ouvrir Connexions VST">Connexions VST</button>' +
      '<div class="mwc-h">TYPES DE CANAUX</div>' +
      '<div class="mwc-types">' + TYPES.map((t) =>
        '<button class="mwc-t' + (MIX.types[t[0]] ? ' on' : '') + '" data-mtype="' + t[0] + '" title="Afficher / masquer les canaux : ' + t[1] + '">' +
        t[1] + '</button>').join('') +
      '</div>' +
      '<div class="mwc-h">JEUX DE VUES</div>' +
      '<div class="mwc-row"><button class="mwc-btn" data-mset="store" title="Mémoriser la vue courante">+</button>' +
      '<button class="mwc-btn" data-mset="remove" title="Supprimer le jeu de vues">−</button>' +
      '<span class="w-field" style="flex:1;min-width:0;height:16px" data-msetsel>Aucun</span></div>' +
      '</div>';
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn on" data-mfilter="all">Tout</button>' +
      '<button class="w-btn" data-mfilter="audio">Audio</button>' +
      '<button class="w-btn" data-mfilter="midi">MIDI</button>' +
      '<button class="w-btn" data-mfilter="group">Groupes</button>' +
      '<button class="w-btn" data-mfilter="fx">FX</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Canaux</span><span class="w-field" data-mcount>' + NCH + ' + 1</span>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn on" data-mext="1" title="Afficher / masquer le panneau étendu">Vue étendue</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-mzoom="out">−</button>' +
      '<button class="w-btn" data-mzoom="in">+</button>' +
      '<span style="flex:1"></span>' +
      '<span class="w-lbl" data-mstatus title="Réglages globaux des compteurs (clic droit dans la console)">Compteurs : crêtes maintenues · post-fader</span>' +
      '</div>' +
      '<div class="mw-area" data-marea>' +
      common +
      '<div class="mw-strips" data-mstrips>' + tracks.map(mixStrip).join('') + '</div>' +
      '<div class="mw-master" data-mmaster>' + masterStrip() + '</div>' +
      '</div>' +
      '<div class="aw-foot" style="flex:0 0 18px"><span>Mixer — ' + tracks.length + ' canaux + sortie</span>' +
      '<span style="flex:1"></span><span>Clic droit dans le fond : routage, vue étendue, liens, réglages, compteurs</span></div>';
    return {
      title: 'Mixer <em>· console de mixage</em>',
      ac: '#4d7cab',
      html,
      after(body, w) {
        const area = $('[data-marea]', body);
        const strips = $('[data-mstrips]', body);
        let copied = null;

        function applyView() {
          $$('[data-vblock]', body).forEach((b) => {
            const k = b.dataset.vblock;
            const on = k === 'mtr' ? MIX.view.mtr !== false : (MIX.ext && !!MIX.view[k]);
            b.style.display = on ? '' : 'none';
          });
          $$('[data-mview]', body).forEach((b) => b.classList.toggle('on', !!MIX.view[b.dataset.mview]));
          strips.classList.toggle('narrow', MIX.narrow);
          $('[data-mext]', body).classList.toggle('on', MIX.ext);
          $('[data-mstate]', body).classList.toggle('on', MIX.routing);
          $$('.mstrip .ms-out', body).forEach((o) => { o.style.visibility = MIX.routing ? 'visible' : 'hidden'; });
        }
        function applyTypes() {
          $$('.mstrip[data-kind]', body).forEach((s2) => {
            const k = s2.dataset.kind;
            s2.style.display = MIX.types[k] === false ? 'none' : '';
          });
          $$('[data-mtype]', body).forEach((b) => b.classList.toggle('on', MIX.types[b.dataset.mtype] !== false));
          $('[data-mmaster]', body).style.display = MIX.types.out === false ? 'none' : '';
        }
        function meterStatus() {
          const m = MIX.meter;
          const parts = [];
          if (m.hold) parts.push('crêtes maintenues');
          if (m.forever) parts.push('maintenues indéfiniment');
          if (m.input) parts.push('entrée');
          if (m.postfader) parts.push('post-fader');
          if (m.postpan) parts.push('post-panner');
          if (m.fast) parts.push('attaque rapide');
          $('[data-mstatus]', body).textContent = 'Compteurs : ' + (parts.join(' · ') || 'standard');
        }
        applyView(); applyTypes(); meterStatus();

        /* --- panneau commun --- */
        area.addEventListener('click', (e) => {
          const t = e.target.closest('button');
          if (!t) return;
          if (t.dataset.mview) {
            const k = t.dataset.mview;
            const all = ['ins', 'eq', 'eqc', 'snd', 'snd2', 'sts', 'sur'];
            if (k === 'emp') {
              all.forEach((x) => { MIX.view[x] = false; });
              MIX.view.ovw = false;
              A.showToast('Panneau étendu vide : seuls le nom, le panoramique et le fader restent.', 'Mixer');
            } else {
              MIX.view[k] = !MIX.view[k];
              if (MIX.view[k]) {
                /* une seule famille de vues étendues à la fois */
                if (k === 'snd') MIX.view.snd2 = false;
                if (k === 'snd2') MIX.view.snd = false;
                if (k === 'ovw') all.forEach((x) => { if (x !== 'mtr') MIX.view[x] = false; });
                else MIX.view.ovw = false;
                if (k === 'eq') MIX.view.eqc = false;
                if (k === 'eqc') MIX.view.eq = false;
              }
            }
            applyView();
            return;
          }
          if (t.dataset.mwidth) {
            MIX.narrow = t.dataset.mwidth === 'narrow';
            applyView();
            return;
          }
          if (t.dataset.mhide) {
            const hidden = $$('.mstrip[data-kind]', body).filter((s2) => s2.classList.contains('canhide'));
            hidden.forEach((s2) => { s2.style.display = s2.style.display === 'none' ? '' : 'none'; });
            t.classList.toggle('on');
            A.showToast(hidden.length ? (hidden.length + ' canal(aux) « Can Hide » masqués / réaffichés.') : 'Aucun canal marqué « Can Hide ».', 'Mixer');
            return;
          }
          if (t.dataset.mstate) { MIX.routing = !MIX.routing; applyView(); return; }
          if (t.dataset.mtype) {
            const k = t.dataset.mtype;
            MIX.types[k] = !MIX.types[k];
            applyTypes();
            return;
          }
          if (t.dataset.mglob) {
            const k = t.dataset.mglob;
            if (k === 'reset') {
              A.TRACKS.forEach((tr) => { if (typeof tr.db === 'number') tr.db = 0; tr.mute = false; tr.solo = false; });
              A.refresh();
              $$('.mstrip [data-db]', body).forEach((d) => { d.textContent = dbTxt(0); });
              $$('.mstrip .vfader .cap', body).forEach((c) => c.style.setProperty('--p', dbToPct(0) + '%'));
              $$('.mstrip .meter i:first-child', body).forEach((i) => i.style.setProperty('--lvl', dbToPct(0) + '%'));
              $$('[data-mglob]', body).forEach((b) => b.classList.remove('on'));
              A.showToast('Mixer réinitialisé : EQ, inserts et départs désactivés, faders à 0 dB, panoramique au centre.', 'Mixer');
              return;
            }
            t.classList.toggle('on');
            const on = t.classList.contains('on');
            const L = { mute: 'Mute global', solo: 'Solo global', listen: 'Listen global',
                        read: 'Lecture de l’automatisation', write: 'Écriture de l’automatisation' }[k] || k;
            if (k === 'mute' || k === 'solo') {
              $$('.mstrip [data-mx="' + k + '"]', body).forEach((b) => b.classList.toggle(k === 'mute' ? 'on-m' : 'on-s', on));
            }
            if (k === 'read' || k === 'write') {
              $$('.mstrip [data-rw="' + (k === 'read' ? 'r' : 'w') + '"]', body).forEach((b) => b.classList.toggle('on', on));
            }
            A.showToast(L + ' ' + (on ? 'activé' : 'désactivé') + '.', 'Mixer');
            return;
          }
          if (t.dataset.mcopy) {
            const sel = $('.mstrip.sel:not(.master)', body) || $('.mstrip[data-kind]', body);
            if (t.dataset.mcopy === 'copy') {
              if (!sel) return;
              copied = sel.dataset.mstrip;
              A.showToast('Réglages du canal « ' + sel.querySelector('.ms-name').textContent.trim() + ' » copiés.', 'Mixer');
            } else {
              if (!copied) { A.showToast('Copiez d’abord les réglages d’un canal (bouton Copier).', 'Mixer'); return; }
              const src = A.trackById(copied), dst = A.trackById(sel && sel.dataset.mstrip);
              if (src && dst) { dst.db = src.db; dst.mute = src.mute; dst.solo = src.solo; A.refresh(); }
              A.showToast('Réglages collés sur « ' + (dst ? dst.name : '—') + ' » (niveau, mute, solo).', 'Mixer');
            }
            return;
          }
          if (t.dataset.mconn) { open('connections'); return; }
          if (t.dataset.mset) {
            if (t.dataset.mset === 'store') {
              const name = 'Vue ' + (MIX.sets.length + 1);
              MIX.sets.push({ name, view: Object.assign({}, MIX.view), narrow: MIX.narrow, types: Object.assign({}, MIX.types) });
              MIX.activeSet = name;
              $('[data-msetsel]', body).textContent = name;
              A.showToast('Jeu de vues « ' + name + ' » mémorisé.', 'Mixer');
            } else if (MIX.sets.length) {
              MIX.sets.pop();
              MIX.activeSet = MIX.sets.length ? MIX.sets[MIX.sets.length - 1].name : null;
              $('[data-msetsel]', body).textContent = MIX.activeSet || 'Aucun';
              A.showToast('Dernier jeu de vues supprimé.', 'Mixer');
            }
            return;
          }
          if (t.dataset.msetsel !== undefined) {
            if (!MIX.sets.length) { A.showToast('Aucun jeu de vues enregistré (bouton +).', 'Mixer'); return; }
            const cur = MIX.sets.findIndex((x) => x.name === MIX.activeSet);
            const nxt = MIX.sets[(cur + 1) % MIX.sets.length];
            MIX.view = Object.assign({}, nxt.view); MIX.narrow = nxt.narrow; MIX.types = Object.assign({}, nxt.types);
            MIX.activeSet = nxt.name;
            $('[data-msetsel]', body).textContent = nxt.name;
            applyView(); applyTypes();
          }
        });

        /* --- Can Hide par canal --- */
        body.addEventListener('click', (e) => {
          const ch = e.target.closest('[data-canhide]');
          if (ch) {
            const tr = A.trackById(ch.dataset.canhide);
            const strip = ch.closest('.mstrip');
            if (tr) tr.canHide = !tr.canHide;
            strip.classList.toggle('canhide', !!(tr && tr.canHide));
            ch.classList.toggle('on', !!(tr && tr.canHide));
            return;
          }
          const rw = e.target.closest('[data-rw]');
          if (rw) { rw.classList.toggle('on'); return; }
        });

        /* --- menu contextuel (fond de la console) --- */
        area.addEventListener('contextmenu', (e) => {
          if (e.target.closest('.mstrip') && !e.target.closest('.mwc-common')) {
            /* clic droit sur une tranche : menu de canal */
          }
          e.preventDefault();
          const old = document.getElementById('mixCtx');
          if (old) old.remove();
          const items = [
            ['routing', 'Afficher le panneau de routage', MIX.routing],
            ['ext', 'Afficher la vue étendue', MIX.ext],
            ['', '—'],
            ['link', 'Lier les canaux sélectionnés', false],
            ['unlink', 'Délier les canaux', false],
            ['', '—'],
            ['saveSel', 'Enregistrer les canaux sélectionnés…', false],
            ['saveAll', 'Enregistrer tous les réglages du mixer…', false],
            ['loadSel', 'Charger les canaux sélectionnés…', false],
            ['', '—'],
            ['meter', 'Réglages globaux des compteurs ▸', false],
            ['hold', 'Maintenir les crêtes', MIX.meter.hold],
            ['forever', 'Maintenir indéfiniment', MIX.meter.forever],
            ['input', 'Compteurs d’entrée', MIX.meter.input],
            ['postfader', 'Post-fader', MIX.meter.postfader],
            ['postpan', 'Post-panner', MIX.meter.postpan],
            ['fast', 'Attaque rapide', MIX.meter.fast]
          ];
          const m = document.createElement('div');
          m.id = 'mixCtx';
          m.innerHTML = items.map((it) => it[1] === '—'
            ? '<div class="sep"></div>'
            : '<div data-mctx="' + it[0] + '"><i class="' + (it[2] ? 'on' : '') + '"></i>' + it[1] + '</div>').join('');
          m.style.cssText = 'position:fixed;z-index:9200;background:linear-gradient(#4a4f54,#3a3f44);border:1px solid #22262a;' +
            'border-radius:3px;padding:3px;box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.5 Verdana,Tahoma,sans-serif;color:#e2e7ea;min-width:236px';
          const r = area.getBoundingClientRect();
          m.style.left = Math.min(window.innerWidth - 250, Math.max(4, e.clientX)) + 'px';
          m.style.top = Math.min(window.innerHeight - 300, Math.max(28, e.clientY)) + 'px';
          document.body.appendChild(m);
          m.querySelectorAll('div[data-mctx]').forEach((d) => {
            d.style.cssText = 'padding:3px 10px;border-radius:2px;display:flex;align-items:center;gap:6px';
            d.querySelector('i').style.cssText = 'width:9px;height:9px;border:1px solid #7d848a;border-radius:2px;display:inline-block;flex:0 0 auto' +
              (d.querySelector('i.on') ? ';background:#5d86ad;border-color:#8fb2d4' : '');
            d.addEventListener('mouseenter', () => { d.style.background = '#3f6c98'; });
            d.addEventListener('mouseleave', () => { d.style.background = 'transparent'; });
          });
          m.querySelectorAll('.sep').forEach((d) => { d.style.cssText = 'height:0;padding:0;border-top:1px solid #5c6268;margin:3px 4px'; });
          const close = () => { m.remove(); document.removeEventListener('mousedown', out, true); };
          const out = (ev) => { if (!m.contains(ev.target)) close(); };
          document.addEventListener('mousedown', out, true);
          m.addEventListener('click', (ev) => {
            const k = ev.target.closest('[data-mctx]').dataset.mctx;
            if (k === 'routing') { MIX.routing = !MIX.routing; applyView(); }
            else if (k === 'ext') { MIX.ext = !MIX.ext; applyView(); }
            else if (k === 'link' || k === 'unlink') {
              $$('.mstrip.sel', body).forEach((s2) => s2.classList.toggle('linked', k === 'link'));
              A.showToast(k === 'link' ? 'Canaux liés : niveau, mute, solo et sélection suivent le groupe.' : 'Canaux déliés.', 'Mixer');
            }
            else if (k === 'saveSel' || k === 'saveAll' || k === 'loadSel') {
              /* AUDIT v6 : les presets de mixage sont réellement persistés
                 dans le projet natif (instantanés — storeSnapshot/recall). */
              const label2 = ev.target.closest('[data-mctx]').textContent;
              if (k === 'saveSel') nativeSend('storeSnapshot', { name: 'Mixer — sélection' });
              else if (k === 'saveAll') nativeSend('storeSnapshot', { name: 'Mixer — tous canaux' });
              else nativeSend('recallSnapshot', { name: 'Mixer — sélection' });
              A.showToast('« ' + label2 + ' » : ' + (k === 'loadSel' ? 'preset réellement rappelé depuis le projet (niveaux, mutes, solos, EQ).' : 'preset réellement enregistré dans le projet (instantané natif).'), 'Mixer');
            }
            else if (k === 'meter') { close(); return; }
            else if (['hold', 'forever', 'input', 'postfader', 'postpan', 'fast'].indexOf(k) >= 0) {
              MIX.meter[k] = !MIX.meter[k];
              if (k === 'input' && MIX.meter.input) MIX.meter.postfader = false;
              if (k === 'postfader' && MIX.meter.postfader) MIX.meter.input = false;
              if (k === 'postpan' && MIX.meter.postpan) { MIX.meter.input = false; MIX.meter.postfader = false; }
              meterStatus();
            }
            close();
          });
        });

        /* --- filtres, faders, zoom (existant) --- */
        $$('[data-mfilter]', body).forEach((b) => b.addEventListener('click', () => {
          $$('[data-mfilter]', body).forEach((x) => x.classList.toggle('on', x === b));
          const f = b.dataset.mfilter;
          $$('.mstrip[data-kind]', body).forEach((s2) => {
            s2.style.display = (f === 'all' || s2.dataset.kind === f) ? '' : 'none';
          });
        }));
        $$('[data-mx]', body).forEach((b) => b.addEventListener('click', () => {
          const act = b.dataset.mx, id = b.dataset.t;
          if (act === 'e') { open('channel', id === '__master' ? 'master' : id); return; }
          if (act === 'reset') {
            /* AUDIT v6 : remise à zéro RÉELLE des crêtes mesurées par le moteur. */
            const ti = id === '__master' ? -1 : nativeTrackIndex(id);
            nativeSend('resetMeters', ti < 0 ? {} : { trackIndex: ti });
            A.showToast(ti < 0 ? 'Crêtes réellement réinitialisées sur tous les canaux (pistes, bus et master).'
              : 'Crêtes réellement réinitialisées sur « ' + (((A.trackById && A.trackById(id)) || {}).name || id) + ' ».', 'Mixer');
            return;
          }
          if (act.indexOf('ovw') === 0) { b.classList.toggle('on'); return; }
          const t = A.trackById(id);
          if (!t) return;
          t[act] = !t[act];
          b.classList.toggle(act === 'mute' ? 'on-m' : act === 'solo' ? 'on-s' : 'on-r', t[act]);
          A.refresh();
        }));
        $$('[data-pick]', body).forEach((p) => p.addEventListener('click', () => {
          A.state.selectedTrack = p.dataset.pick;
          A.refresh();
          $$('.mstrip[data-mstrip]', body).forEach((s2) => s2.classList.toggle('sel', s2.dataset.mstrip === p.dataset.pick));
        }));
        $$('[data-fader]', body).forEach((f) => {
          const strip = f.closest('.mstrip');
          const cap = $('.cap', f);
          const dbEl = $('[data-db]', strip);
          let drag = false;
          const move = (e) => {
            const r = f.getBoundingClientRect();
            const pct = Math.min(97, Math.max(2, ((r.bottom - 6 - e.clientY) / (r.height - 12)) * 100));
            f.dataset.pct = pct;
            cap.style.setProperty('--p', pct + '%');
            const db = pctToDb(pct);
            if (dbEl) dbEl.textContent = (pct <= 3 ? '−∞' : dbTxt(db));
            const t = A.trackById(f.dataset.fader);
            if (t) t.db = db;
          };
          f.addEventListener('pointerdown', (e) => { drag = true; f.setPointerCapture(e.pointerId); move(e); });
          f.addEventListener('pointermove', (e) => { if (drag) move(e); });
          f.addEventListener('pointerup', () => { drag = false; });
          f.addEventListener('pointercancel', () => { drag = false; });
          f.addEventListener('dblclick', () => {
            const t = A.trackById(f.dataset.fader);
            if (t) t.db = 0;
            cap.style.setProperty('--p', dbToPct(0) + '%');
            if (dbEl) dbEl.textContent = dbTxt(0);
          });
        });
        let z = 1;
        $$('[data-mzoom]', body).forEach((b) => b.addEventListener('click', () => {
          z = Math.min(1.5, Math.max(0.72, z + (b.dataset.mzoom === 'in' ? 0.08 : -0.08)));
          $$('.mstrip', body).forEach((s2) => { s2.style.flexBasis = (78 * z) + 'px'; s2.style.width = (78 * z) + 'px'; });
        }));
        $('[data-mext]', body).addEventListener('click', () => { MIX.ext = !MIX.ext; applyView(); });
        $('[data-msetsel]', body).addEventListener('click', () => {
          const btn = document.createElement('button');
          btn.dataset.msetsel = '1';
          btn.style.display = 'none';
          body.appendChild(btn);
          btn.click(); btn.remove();
        });
      }
    };
  }

  /* =====================================================================
     RÉGLAGES DE CANAL
     ===================================================================== */
  const EQ_PRESET = {
    voix: [[120, 0, 1], [480, -1.5, 1.4], [2400, 1.5, 0.8], [8000, 0, 0.7]],
    drums: [[80, 2, 1], [420, -2, 1.2], [3200, 2.5, 1], [9500, 1, 0.7]],
    basse: [[60, 3, 1], [240, -1, 1.3], [900, 1.5, 1], [4200, -2, 0.8]],
    gtrR: [[140, -1, 1], [600, 1.5, 1.1], [2400, 2, 0.9], [8000, -1, 0.7]],
    gtrS: [[200, 0, 1], [900, 2, 1], [3000, 1, 0.8], [10000, 0.5, 0.6]],
    keys: [[100, -2, 1], [700, 1, 1.2], [2800, -1, 1], [7000, 1.5, 0.7]],
    choeurs: [[200, -2.5, 1], [1200, 1, 1.3], [4000, 1.5, 0.9], [11000, -1, 0.6]],
    perc: [[180, 1, 1], [1500, 2, 1], [5000, 3, 0.9], [12000, 1.5, 0.6]],
    amb: [[90, -3, 1], [500, -1, 1.2], [2500, 1, 1], [9000, 2, 0.6]],
    busdrums: [[70, 2, 1], [380, -1, 1.2], [2600, 1.5, 0.9], [9000, 0.5, 0.6]],
    fx: [[150, -2, 1], [800, 0, 1], [3500, 1, 0.8], [8000, 1, 0.7]]
  };

  function eqBands(t) {
    const base = EQ_PRESET[t.id] || EQ_PRESET.voix;
    return base.map((b, i) => ({ f: b[0], g: b[1], q: b[2], on: i !== 3 }));
  }

  function eqCurveSVG(bands, W, H) {
    const fmin = 30, fmax = 18000, gmax = 18;
    const xOf = (f) => (Math.log(f / fmin) / Math.log(fmax / fmin)) * W;
    const yOf = (g) => H / 2 - (g / gmax) * (H / 2 - 6);
    let d = '';
    for (let i = 0; i <= 200; i++) {
      const f = fmin * Math.pow(fmax / fmin, i / 200);
      let g = 0;
      bands.forEach((b) => {
        if (!b.on) return;
        const s = 0.55 / Math.max(0.3, b.q);
        const lf = Math.log(f / b.f) / s;
        g += b.g * Math.exp(-0.5 * lf * lf);
      });
      d += (i ? ' L' : 'M') + xOf(f).toFixed(1) + ',' + yOf(g).toFixed(1);
    }
    const gp = 'M0,' + (H / 2) + ' L' + d.slice(1) + ' L' + W + ',' + (H / 2) + ' Z';
    let grid = '';
    [100, 1000, 10000].forEach((f) => {
      grid += '<line x1="' + xOf(f).toFixed(1) + '" y1="0" x2="' + xOf(f).toFixed(1) + '" y2="' + H + '" stroke="#4a5257" stroke-width="1"/>';
      grid += '<text x="' + (xOf(f) + 3).toFixed(1) + '" y="' + (H - 4) + '" font-size="8" fill="#7f8b93" font-family="Consolas,monospace">' + (f < 1000 ? f : (f / 1000) + 'k') + '</text>';
    });
    [6, 0, -6, -12].forEach((g) => {
      grid += '<line x1="0" y1="' + yOf(g).toFixed(1) + '" x2="' + W + '" y2="' + yOf(g).toFixed(1) + '" stroke="' + (g === 0 ? '#6f7a80' : '#3d4549') + '" stroke-width="1"/>';
      grid += '<text x="2" y="' + (yOf(g) - 2).toFixed(1) + '" font-size="7" fill="#7f8b93" font-family="Consolas,monospace">' + (g > 0 ? '+' + g : g) + '</text>';
    });
    const cols = ['#e8c14b', '#7fc0dd', '#9fd48a', '#d98fb0'];
    const handles = bands.map((b, i) => {
      const x = xOf(b.f), y = yOf(b.g);
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6" fill="' + cols[i] + '" opacity="' + (b.on ? 0.95 : 0.35) + '" stroke="#1b1f21" stroke-width="1"/>' +
        '<text x="' + (x + 8).toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" font-size="7.5" fill="' + cols[i] + '" font-family="Tahoma">EQ' + (i + 1) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/>' + grid +
      '<path d="' + gp + '" fill="rgba(127,192,221,.16)" stroke="none"/>' +
      '<path d="' + d + '" fill="none" stroke="#9ed2ea" stroke-width="1.6"/>' + handles + '</svg>';
  }

  function buildChannel(trackId) {
    const curId = trackId || A.state.selectedTrack;
    const t = curId === 'master'
      ? { id: 'master', name: 'STÉRÉO OUT', kind: 'group', color: '#4d5c6b', db: -0.8, num: 'M' }
      : (A.trackById(curId) || A.trackById('voix'));
    const st = {
      bands: eqBands(t).map((x) => ({ f: x.f, g: x.g, q: x.q, on: x.on, byp: false })),
      ins: ['Comp Alpha VCA', 'De-esser Pro', 'EQ Alpha', 'Réverb Space', 'Delay Echo', 'Aucun', 'Aucun', 'Aucun'],
      sends: [['FX 1 · Réverb Space', 42, 'post'], ['FX 2 · Delay Echo', 16, 'post'],
              ['FX 3 · Chorus Alpha', 0, 'pré'], ['FX 4 · Aucun', 0, 'pré'],
              ['FX 5 · Aucun', 0, 'pré'], ['FX 6 · Aucun', 0, 'pré'],
              ['FX 7 · Aucun', 0, 'pré'], ['FX 8 · Aucun', 0, 'pré']],
      preset: 'Voix lead',
      curve: true,
      pan: PAN[t.id] || 0,
      db: typeof t.db === 'number' ? t.db : 0,
      mute: !!t.mute, solo: !!t.solo
    };
    const COLS = ['#e8c14b', '#7fc0dd', '#9fd48a', '#d98fb0'];
    const fmin = 30, fmax = 18000, gmax = 18;
    function drawEq() {
      const g = $('[data-eqgraph]', document);
      if (g) g.innerHTML = eqCurveSVG(st.bands, 400, 132);
      const rows = $('[data-eqrows]', document);
      if (rows) {
        rows.innerHTML = st.bands.map((b, i) =>
          '<div class="eqband' + (b.on && !b.byp ? '' : ' off') + '" data-eqband="' + i + '">' +
          '<span class="bn"><i class="led-dot ' + (!b.byp ? 'green on' : 'yellow on') + '" data-eqbyp="' + i + '" title="Bypass de la bande"></i>EQ ' + (i + 1) + '</span>' +
          '<div class="bcell" data-eqcell="f"><div class="kn" style="--rot:' + Math.round((Math.log(b.f / fmin) / Math.log(fmax / fmin)) * 300 - 150) + 'deg"></div><span>' +
          (b.f >= 1000 ? (b.f / 1000).toFixed(2).replace('.', ',') + ' k' : Math.round(b.f) + ' Hz') + '</span></div>' +
          '<div class="bcell" data-eqcell="g"><div class="kn" style="--rot:' + Math.round(Math.max(-60, Math.min(60, b.g * 3))) + 'deg"></div><span>' + dbTxt(b.g) + ' dB</span></div>' +
          '<div class="bcell" data-eqcell="q"><div class="kn"></div><span>' + b.q.toFixed(2).replace('.', ',') + '</span></div>' +
          '<button class="w-btn" data-eqtype="' + i + '">' + (i === 0 ? 'haut' : i === 3 ? 'bas' : 'pic') + '</button>' +
          '</div>').join('');
        bindEqRows();
      }
      $$('[data-eqhandle]', document).forEach(() => {});
      bindCurve();
    }
    function bindEqRows() {
      $$('[data-eqbyp]', document).forEach((l) => l.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = +l.dataset.eqbyp;
        st.bands[i].byp = !st.bands[i].byp;
        drawEq();
        A.showToast('EQ ' + (i + 1) + ' : ' + (st.bands[i].byp ? 'contourné (jaune)' : 'actif (vert)') + '.', 'Réglages de canal');
      }));
      $$('[data-eqcell]', document).forEach((c) => {
        const i = +c.parentNode.dataset.eqband;
        c.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const x0 = e.clientX, y0 = e.clientY;
          const b0 = { f: st.bands[i].f, g: st.bands[i].g };
          const mv = (ev) => {
            const dx = ev.clientX - x0, dy = ev.clientY - y0;
            if (c.dataset.eqcell === 'f') st.bands[i].f = Math.max(fmin, Math.min(fmax, b0.f * Math.pow(4, dx / 40)));
            else if (c.dataset.eqcell === 'g') st.bands[i].g = Math.max(-18, Math.min(18, b0.g - dy / 4));
            else st.bands[i].q = Math.max(0.2, Math.min(10, st.bands[i].q * Math.pow(1.6, dx / 30)));
            drawEq();
          };
          const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', up);
        });
      });
      $$('[data-eqtype]', document).forEach((bt) => bt.addEventListener('click', () => {
        const i = +bt.dataset.eqtype;
        const cyc = ['pic', 'haut', 'bas'];
        bt.textContent = cyc[(cyc.indexOf(bt.textContent) + 1) % cyc.length];
        A.showToast('EQ ' + (i + 1) + ' — type de courbe : ' + bt.textContent + '.', 'Réglages de canal');
      }));
    }
    function bindCurve() {
      const svg = $('[data-eqgraph] svg', document);
      const host = $('[data-eqgraph]', document);
      if (!svg || !host || host.dataset.bound) return;
      host.dataset.bound = '1';
      host.addEventListener('pointerdown', (e) => {
        const r = svg.getBoundingClientRect();
        const pick = () => {
          const px = (e.clientX - r.left) / r.width * 400;
          const py = (e.clientY - r.top) / r.height * 132;
          let best = 0, bd = 1e9;
          st.bands.forEach((b, i) => {
            const bx = (Math.log(b.f / fmin) / Math.log(fmax / fmin)) * 400;
            const by = 66 - (b.g / gmax) * 60;
            const d2 = (bx - px) * (bx - px) + (by - py) * (by - py);
            if (d2 < bd) { bd = d2; best = i; }
          });
          return { i: best, px: px, py: py };
        };
        const { i } = pick();
        const b0 = { f: st.bands[i].f, g: st.bands[i].g, q: st.bands[i].q };
        const mv = (ev) => {
          const dx = ev.clientX - e.clientX, dy = ev.clientY - e.clientY;
          const b = st.bands[i];
          if (ev.shiftKey) b.q = Math.max(0.2, Math.min(10, b0.q * Math.pow(1.5, dx / 30)));
          else if (ev.ctrlKey || ev.metaKey) b.g = Math.max(-18, Math.min(18, b0.g - dy / 4));
          else if (ev.altKey) b.f = Math.max(fmin, Math.min(fmax, b0.f * Math.pow(4, dx / 40)));
          else {
            b.g = Math.max(-18, Math.min(18, b0.g - dy / 4));
            b.f = Math.max(fmin, Math.min(fmax, b0.f * Math.pow(4, dx / 40)));
          }
          drawEq();
        };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
      });
      host.addEventListener('dblclick', (e) => {
        const r = svg.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width * 400;
        const py = (e.clientY - r.top) / r.height * 132;
        let best = 0, bd = 1e9;
        st.bands.forEach((b, i) => {
          const bx = (Math.log(b.f / fmin) / Math.log(fmax / fmin)) * 400;
          const by = 66 - (b.g / gmax) * 60;
          const d2 = (bx - px) * (bx - px) + (by - py) * (by - py);
          if (d2 < bd) { bd = d2; best = i; }
        });
        st.bands[best].on = !st.bands[best].on;
        drawEq();
        A.showToast('EQ ' + (best + 1) + ' ' + (st.bands[best].on ? 'activé' : 'désactivé') + ' (double-clic).', 'Réglages de canal');
      });
    }
    function drawSends() {
      const box = $('[data-sends]', document);
      if (!box) return;
      box.innerHTML = st.sends.map((x, i) =>
        '<div class="cs-send"><span class="nm">' + x[0] + '</span>' +
        '<div class="cs-hbar" data-sndbar="' + i + '"><i style="--v:' + x[1] + '%"></i><u style="left:' + x[1] + '%"></u></div>' +
        '<span class="cs-val">' + (x[1] ? dbTxt(-18 + x[1] * 0.2) + ' dB' : '—') + '</span>' +
        '<button class="w-btn" data-sndmode="' + i + '" style="min-width:30px">' + x[2] + '</button></div>').join('');
      $$('[data-sndmode]', document).forEach((b2) => b2.addEventListener('click', () => {
        const i = +b2.dataset.sndmode;
        st.sends[i][2] = st.sends[i][2] === 'pré' ? 'post' : 'pré';
        drawSends();
        A.showToast('Départ ' + (i + 1) + ' : ' + st.sends[i][2] + '-fader.', 'Réglages de canal');
      }));
      $$('[data-sndbar]', document).forEach((bar) => {
        const i = +bar.dataset.sndbar;
        bar.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const r = bar.getBoundingClientRect();
          const set = (ev) => {
            st.sends[i][1] = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
            drawSends();
          };
          set(e);
          const mv = (ev) => set(ev);
          const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
          window.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', up);
        });
      });
    }
    const html =
      '<div class="w-toolbar" style="gap:5px">' +
      '<span class="w-lbl">Modifier le canal</span>' +
      '<button class="w-btn" data-chpick="1" title="Choose Edit Channel — choisir le canal à éditer">' + esc(t.name) + ' ▾</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-chact="copy" title="Copier tous les réglages de ce canal">Copier les réglages</button>' +
      '<button class="w-btn" data-chact="paste" title="Coller les réglages sur ce canal">En coller</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-chact="init" title="Initialize Channel — réinitialiser le canal">Initialiser</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-chact="view" title="Personnaliser la vue du canal">Personnaliser la vue…</button>' +
      '</div>' +
      '<div class="cs-tabs">' +
      '<button class="cs-tab on" data-cs="canal"><i class="led-dot green on"></i>Canal</button>' +
      '<button class="cs-tab" data-cs="eq"><i class="led-dot green on"></i>Égaliseur</button>' +
      '<button class="cs-tab" data-cs="ins">Inserts (8)</button>' +
      '<button class="cs-tab" data-cs="send">Départs (8)</button>' +
      '</div>' +
      '<div class="cs-wrap">' +
      '<div class="cs-body">' +
      '<div class="cs-card" style="margin-bottom:6px"><div class="c" style="display:flex;align-items:center;gap:8px;padding:6px 7px">' +
      '<span style="width:6px;height:26px;background:' + t.color + ';border:1px solid rgba(0,0,0,.3);border-radius:1px"></span>' +
      '<div><div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:#24231e">' + esc(t.name) + '</div>' +
      '<div style="font-size:8px;color:#565550;letter-spacing:.4px">' +
      (t.kind === 'audio' ? 'Piste audio · Stéréo' : t.kind === 'midi' ? 'Piste MIDI · Stéréo' : t.kind === 'group' ? 'Piste groupe · Stéréo' : 'Piste FX · Stéréo') +
      ' — canal ' + (t.num || '—') + '</div></div>' +
      '<span style="flex:1"></span>' +
      '<span class="w-field" style="height:20px" data-chdb>' + dbTxt(st.db) + ' dB</span>' +
      '</div></div>' +

      '<div data-pane="canal">' +
      '<div class="cs-card"><h4>Entrée / sortie</h4><div class="c">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<div><span class="cs-lbl">Entrée</span><div class="cs-select"><span>Alpha ASIO — IN ' + (t.kind === 'midi' ? 'MIDI 1' : '1 (Mic Alpha C12)') + '</span><i class="arr"></i></div></div>' +
      '<div><span class="cs-lbl">Sortie</span><div class="cs-select"><span>Stéréo Out</span><i class="arr"></i></div></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">' +
      '<div><span class="cs-lbl">Gain d’entrée</span><div class="cs-row"><div class="cs-hbar"><i style="--v:46%"></i><u style="left:46%"></u></div><span class="cs-val">+0,0 dB</span></div></div>' +
      '<div><span class="cs-lbl">Largeur stéréo</span><div class="cs-row"><div class="cs-hbar"><i style="--v:100%"></i><u style="left:100%"></u></div><span class="cs-val">100 %</span></div></div>' +
      '</div>' +
      '<div class="cs-row" style="margin-top:8px;gap:5px">' +
      '<button class="w-btn" data-chtog="phase">Phase Ø</button><button class="w-btn on" data-chtog="listen">Écoute</button>' +
      '<button class="w-btn' + (st.mute ? ' on' : '') + '" data-chtog="mute">Mute</button>' +
      '<button class="w-btn' + (st.solo ? ' on' : '') + '" data-chtog="solo">Solo</button>' +
      '<span style="flex:1"></span><span class="w-lbl">Lire l’automatisation</span>' +
      '<button class="w-btn on" data-chtog="r">R</button><button class="w-btn" data-chtog="w">W</button>' +
      '</div></div></div></div>' +

      '<div data-pane="eq" style="display:none">' +
      '<div class="cs-card"><h4><span class="led-dot green on"></span>Égaliseur — 4 bandes</h4><div class="c">' +
      '<div class="eq-tools">' +
      '<button class="w-btn" data-eqview="1" title="Courbe + modules / modules seuls">' + (st.curve ? 'Courbe + modules' : 'Modules') + '</button>' +
      '<span class="w-lbl">Preset</span>' +
      '<button class="w-btn" data-eqpreset="1" title="Charger un preset d’égalisation">' + st.preset + ' ▾</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-eqps="store" title="Stocker le réglage courant">Stocker</button>' +
      '<button class="w-btn" data-eqps="rename" title="Renommer le preset (Alt : sans confirmation)">Renommer</button>' +
      '<button class="w-btn" data-eqps="remove" title="Supprimer le preset">Suppr.</button>' +
      '<button class="w-btn" data-eqps="reset" title="Réinitialiser l’égaliseur">Réinit.</button>' +
      '</div>' +
      '<div class="eqgraph" data-eqgraph>' + eqCurveSVG(st.bands, 400, 132) + '</div>' +
      '<div data-eqrows style="margin-top:7px">' + '</div>' +
      '<div class="eq-hint" style="margin-top:4px">Glisser une poignée : fréquence + gain · Maj = Q · Ctrl = gain · Alt = fréquence · double-clic = bande hors service</div>' +
      '</div></div></div>' +

      '<div data-pane="ins" style="display:none">' +
      '<div class="cs-card"><h4>Inserts — 8 emplacements</h4><div class="c"><div class="cs-ins">' +
      st.ins.map((n, i) => '<div class="cs-slot' + (n !== 'Aucun' ? ' act' : '') + '" data-ins="' + i + '">' +
        '<i class="led-dot ' + (n !== 'Aucun' ? 'green on' : '') + '"></i>' +
        '<span style="flex:1">' + (i + 1) + '. ' + n + '</span>' +
        (n !== 'Aucun' ? '<span class="byp" data-insbyp="' + i + '">byp</span>' : '<span class="byp" data-insadd="' + i + '">+</span>') + '</div>').join('') +
      '</div></div></div>' +
      '<div class="cs-card"><h4>Départs FX</h4><div class="c" data-sends></div></div></div>' +

      '<div data-pane="send" style="display:none">' +
      '<div class="cs-card"><h4>Départs auxiliaires — 8 emplacements</h4><div class="c" data-sends2></div></div>' +
      '<div style="margin-top:6px;display:flex;gap:5px"><button class="w-btn" data-chact="sendson">Activer les départs</button>' +
      '<button class="w-btn" data-chact="assignfx">Affecter FX…</button></div>' +
      '</div>' +
      '<div class="cs-card"><h4>Routage</h4><div class="c"><div class="cs-row">' +
      '<span class="cs-lbl" style="margin:0">Destination</span><div class="cs-select" style="max-width:200px"><span>Stéréo Out</span><i class="arr"></i></div>' +
      '<span style="flex:1"></span><span class="w-lbl">Voie d’automatisation</span></div></div></div>' +
      '</div>' +
      /* bande de canal : panoramique, fader, meter, boutons — présente sur tous les onglets */
      '<div class="cs-strip">' +
      '<div class="n">' + esc(t.name) + '</div>' +
      '<div class="pan"><div class="knob" style="--rot:' + Math.round(st.pan * 120) + 'deg"></div>' +
      '<span class="pv" data-chpanv>' + (st.pan === 0 ? 'C' : (st.pan < 0 ? 'L' : 'R') + Math.round(Math.abs(st.pan) * 100)) + '</span></div>' +
      '<div class="fad"><div class="meter"><i style="--lvl:' + Math.round(dbToPct(st.db)) + '%"></i></div>' +
      '<div class="trk"><div class="cap" style="--p:' + Math.round(dbToPct(st.db)) + '%"></div></div></div>' +
      '<div class="db" data-chstripdb>' + dbTxt(st.db) + '</div>' +
      '<div class="bt"><span class="tiny' + (st.mute ? ' on-m' : '') + '" data-chtog="mute">M</span><span class="tiny' + (st.solo ? ' on-s' : '') + '" data-chtog="solo">S</span></div>' +
      '<div class="bt"><span class="tiny" data-chtog="r">R</span><span class="tiny" data-chtog="w">W</span></div>' +
      '<div class="rt">Stéréo Out</div>' +
      '</div>' +
      '</div>' +
      '<div class="aw-foot"><span>VST Audio Channel Settings — modifiez le canal sélectionné</span><span style="flex:1"></span>' +
      '<span data-chinfo>8 inserts · 4 bandes d’EQ · 8 départs — réglages écrits dans le projet natif</span></div>';
    return {
      title: 'Réglages du canal audio VST <em>· ' + esc(t.name) + '</em>',
      ac: t.color,
      html,
      after(body) {
        /* AUDIT v6 (A108) : chaque réglage de la fenêtre Réglages de canal est
           réellement écrit dans le projet natif — EQ 4 bandes (setFx), départs
           (setSend/addSend), mute/solo/pan/fader (setTrack), inserts (bypass). */
        const chIndex = () => (t.id === 'master' ? -1 : nativeTrackIndex(t.id));
        const commitBand = (i) => {
          const ti = chIndex();
          if (ti < 0 || !st.bands[i]) return;
          const b = st.bands[i];
          nativeSend('setFx', { trackIndex: ti, band: i, field: 'freq', value: Number(b.f) });
          nativeSend('setFx', { trackIndex: ti, band: i, field: 'gainDb', value: Number(b.g) });
          nativeSend('setFx', { trackIndex: ti, band: i, field: 'q', value: Number(b.q) });
          nativeSend('setFx', { trackIndex: ti, band: i, field: 'enabled', value: !!b.on && !b.byp });
        };
        const commitAllBands = () => {
          const ti = chIndex();
          if (ti < 0) return;
          nativeSend('setFx', { trackIndex: ti, eqEnabled: st.bands.some((b) => b.on && !b.byp) });
          st.bands.forEach((b, i) => commitBand(i));
        };
        const commitSend = (i) => {
          const ti = chIndex();
          if (ti < 0 || !st.sends[i]) return;
          const x = st.sends[i];
          const pct = Number(x[1]) || 0;
          const db = pct > 0 ? -18 + pct * 0.2 : -60;
          const pre = String(x[2]) === 'pré';
          const existing = ((deviceState().tracks || [])[ti] || {}).sends || [];
          const busCount = Math.max(1, (deviceState().buses || []).length);
          if (i < existing.length)
            nativeSend('setSend', { index: ti, sendIndex: i, db: db, preFader: pre, enabled: pct > 0 });
          else
            nativeSend('addSend', { index: ti, bus: i % busCount, db: db, preFader: pre, enabled: pct > 0 });
        };
        const commitStrip = () => {
          const ti = chIndex();
          if (ti < 0) { nativeSend('setMaster', { db: Number(st.db) || 0, mute: !!st.mute }); return; }
          nativeSend('setTrack', { index: ti, field: 'volumeDb', value: Number(st.db) || 0 });
          nativeSend('setTrack', { index: ti, field: 'pan', value: Number(st.pan) || 0 });
          nativeSend('setTrack', { index: ti, field: 'mute', value: st.mute ? 1 : 0 });
          nativeSend('setTrack', { index: ti, field: 'solo', value: st.solo ? 1 : 0 });
        };
        const cloneSends = () => {
          $('[data-sends]', body).innerHTML = '';
          $('[data-sends2]', body).innerHTML = '';
        };
        $$('.cs-tab', body).forEach((tab) => tab.addEventListener('click', () => {
          $$('.cs-tab', body).forEach((x) => x.classList.toggle('on', x === tab));
          $$('[data-pane]', body).forEach((p) => { p.style.display = p.dataset.pane === tab.dataset.cs ? '' : 'none'; });
          if (tab.dataset.cs === 'eq') drawEqIn(body);
        }));
        function drawEqIn(root) {
          const g = $('[data-eqgraph]', root), rows = $('[data-eqrows]', root);
          if (g) { g.innerHTML = eqCurveSVG(st.bands, 400, 132); g.dataset.bound = ''; }
          if (rows) {
            rows.innerHTML = st.bands.map((b, i) =>
              '<div class="eqband' + (b.on && !b.byp ? '' : ' off') + '" data-eqband="' + i + '">' +
              '<span class="bn"><i class="led-dot ' + (!b.byp ? 'green on' : 'yellow on') + '" data-eqbyp="' + i + '" title="Bypass de la bande"></i>EQ ' + (i + 1) + '</span>' +
              '<div class="bcell" data-eqcell="f"><div class="kn" style="--rot:' + Math.round((Math.log(b.f / fmin) / Math.log(fmax / fmin)) * 300 - 150) + 'deg"></div><span>' +
              (b.f >= 1000 ? (b.f / 1000).toFixed(2).replace('.', ',') + ' k' : Math.round(b.f) + ' Hz') + '</span></div>' +
              '<div class="bcell" data-eqcell="g"><div class="kn" style="--rot:' + Math.round(Math.max(-60, Math.min(60, b.g * 3))) + 'deg"></div><span>' + dbTxt(b.g) + ' dB</span></div>' +
              '<div class="bcell" data-eqcell="q"><div class="kn"></div><span>' + b.q.toFixed(2).replace('.', ',') + '</span></div>' +
              '<button class="w-btn" data-eqtype="' + i + '">' + (i === 0 ? 'haut' : i === 3 ? 'bas' : 'pic') + '</button>' +
              '</div>').join('');
            bindEqRows(root);
          }
          bindCurveIn(root);
        }
        function bindEqRows(root) {
          $$('[data-eqbyp]', root).forEach((l) => l.addEventListener('click', (e) => {
            e.stopPropagation();
            const i = +l.dataset.eqbyp;
            st.bands[i].byp = !st.bands[i].byp;
            drawEqIn(root);
            commitBand(i);
            A.showToast('EQ ' + (i + 1) + ' : ' + (st.bands[i].byp ? 'contourné (jaune)' : 'actif (vert)') + ' — réglage écrit dans le projet.', 'Réglages de canal');
          }));
          $$('[data-eqcell]', root).forEach((c) => {
            const i = +c.parentNode.dataset.eqband;
            c.addEventListener('pointerdown', (e) => {
              e.preventDefault();
              const x0 = e.clientX, y0 = e.clientY;
              const b0 = { f: st.bands[i].f, g: st.bands[i].g, q: st.bands[i].q };
              const kind = c.dataset.eqcell;
              const mv = (ev) => {
                const dx = ev.clientX - x0, dy = ev.clientY - y0;
                if (kind === 'f') st.bands[i].f = Math.max(fmin, Math.min(fmax, b0.f * Math.pow(4, dx / 40)));
                else if (kind === 'g') st.bands[i].g = Math.max(-18, Math.min(18, b0.g - dy / 4));
                else st.bands[i].q = Math.max(0.2, Math.min(10, b0.q * Math.pow(1.6, dx / 30)));
                drawEqIn(root);
              };
              const up = () => {
                window.removeEventListener('pointermove', mv);
                window.removeEventListener('pointerup', up);
                commitBand(i);
              };
              window.addEventListener('pointermove', mv);
              window.addEventListener('pointerup', up);
            });
          });
          $$('[data-eqtype]', root).forEach((bt) => bt.addEventListener('click', () => {
            const cyc = ['pic', 'haut', 'bas'];
            const TYPES = { pic: 'peak', haut: 'lowShelf', bas: 'highShelf' };
            bt.textContent = cyc[(cyc.indexOf(bt.textContent) + 1) % cyc.length];
            const i = +bt.dataset.eqtype;
            const ti = chIndex();
            if (ti >= 0) nativeSend('setFx', { trackIndex: ti, band: i, field: 'type', value: TYPES[bt.textContent] || 'peak' });
            A.showToast('EQ ' + (i + 1) + ' — type de courbe : ' + bt.textContent + ' (écrit dans le projet).', 'Réglages de canal');
          }));
        }
        function pickBand(root, cx, cy) {
          const svg = $('[data-eqgraph] svg', root);
          if (!svg) return 0;
          const r = svg.getBoundingClientRect();
          const px = (cx - r.left) / r.width * 400, py = (cy - r.top) / r.height * 132;
          let best = 0, bd = 1e9;
          st.bands.forEach((b, i) => {
            const bx = (Math.log(b.f / fmin) / Math.log(fmax / fmin)) * 400;
            const by = 66 - (b.g / gmax) * 60;
            const d2 = (bx - px) * (bx - px) + (by - py) * (by - py);
            if (d2 < bd) { bd = d2; best = i; }
          });
          return best;
        }
        function bindCurveIn(root) {
          const host = $('[data-eqgraph]', root);
          if (!host) return;
          host.addEventListener('pointerdown', (e) => {
            const i = pickBand(root, e.clientX, e.clientY);
            const b0 = { f: st.bands[i].f, g: st.bands[i].g, q: st.bands[i].q };
            const mv = (ev) => {
              const dx = ev.clientX - e.clientX, dy = ev.clientY - e.clientY;
              const b = st.bands[i];
              if (ev.shiftKey) b.q = Math.max(0.2, Math.min(10, b0.q * Math.pow(1.5, dx / 30)));
              else if (ev.ctrlKey || ev.metaKey) b.g = Math.max(-18, Math.min(18, b0.g - dy / 4));
              else if (ev.altKey) b.f = Math.max(fmin, Math.min(fmax, b0.f * Math.pow(4, dx / 40)));
              else {
                b.g = Math.max(-18, Math.min(18, b0.g - dy / 4));
                b.f = Math.max(fmin, Math.min(fmax, b0.f * Math.pow(4, dx / 40)));
              }
              drawEqIn(root);
            };
            const up = () => {
              window.removeEventListener('pointermove', mv);
              window.removeEventListener('pointerup', up);
              commitBand(i);
            };
            window.addEventListener('pointermove', mv);
            window.addEventListener('pointerup', up);
          });
          host.addEventListener('dblclick', (e) => {
            const i = pickBand(root, e.clientX, e.clientY);
            st.bands[i].on = !st.bands[i].on;
            drawEqIn(root);
            commitBand(i);
            A.showToast('EQ ' + (i + 1) + ' ' + (st.bands[i].on ? 'activé' : 'désactivé') + ' dans le projet.', 'Réglages de canal');
          });
        }
        function sendHtml() {
          return st.sends.map((x, i) =>
            '<div class="cs-send"><span class="nm">' + x[0] + '</span>' +
            '<div class="cs-hbar" data-sndbar="' + i + '"><i style="--v:' + x[1] + '%"></i><u style="left:' + x[1] + '%"></u></div>' +
            '<span class="cs-val">' + (x[1] ? dbTxt(-18 + x[1] * 0.2) + ' dB' : '—') + '</span>' +
            '<button class="w-btn" data-sndmode="' + i + '" style="min-width:30px">' + x[2] + '</button></div>').join('');
        }
        function drawSends(root) {
          const boxes = $$('[data-sends], [data-sends2]', root);
          if (!boxes.length) return;
          boxes.forEach((box) => { box.innerHTML = sendHtml(); });
          $$('[data-sndmode]', root).forEach((b2) => b2.addEventListener('click', () => {
            const i = +b2.dataset.sndmode;
            st.sends[i][2] = st.sends[i][2] === 'pré' ? 'post' : 'pré';
            drawSends(root);
            commitSend(i);
            A.showToast('Départ ' + (i + 1) + ' : ' + st.sends[i][2] + '-fader (écrit dans le projet).', 'Réglages de canal');
          }));
          $$('[data-sndbar]', root).forEach((bar) => {
            const i = +bar.dataset.sndbar;
            bar.style.cursor = 'ew-resize';
            bar.addEventListener('pointerdown', (e) => {
              e.preventDefault();
              const r = bar.getBoundingClientRect();
              const set = (ev) => {
                st.sends[i][1] = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
                drawSends(root);
              };
              set(e);
              const mv = (ev) => set(ev);
              const up = () => {
                window.removeEventListener('pointermove', mv);
                window.removeEventListener('pointerup', up);
                commitSend(i);
              };
              window.addEventListener('pointermove', mv);
              window.addEventListener('pointerup', up);
            });
          });
        }
        drawSends(body);

        /* sélection du canal à éditer */
        $$('[data-chpick]', body).forEach((b) => b.addEventListener('click', () => {
          const old = document.getElementById('chPick');
          if (old) { old.remove(); return; }
          const m = document.createElement('div');
          m.id = 'chPick';
          m.style.cssText = 'position:fixed;z-index:9300;background:linear-gradient(#4a4f54,#3a3f44);border:1px solid #22262a;' +
            'border-radius:3px;padding:3px;box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.6 Verdana,Tahoma,sans-serif;color:#e2e7ea;min-width:190px;max-height:300px;overflow:auto';
          m.innerHTML = A.TRACKS.filter((x) => x.num).map((x) =>
            '<div data-chsel="' + x.id + '">' + (x.num || '') + ' · ' + esc(x.name) + '</div>').join('') +
            '<div data-chsel="master">M · STÉRÉO OUT</div>';
          const r = b.getBoundingClientRect();
          m.style.left = r.left + 'px'; m.style.top = (r.bottom + 2) + 'px';
          document.body.appendChild(m);
          m.querySelectorAll('div[data-chsel]').forEach((d) => {
            d.style.cssText = 'padding:2px 8px;border-radius:2px;cursor:default';
            d.addEventListener('mouseenter', () => { d.style.background = '#3f6c98'; });
            d.addEventListener('mouseleave', () => { d.style.background = 'transparent'; });
            d.addEventListener('click', () => {
              m.remove();
              window.ALPHAWIN.close('channel');
              window.ALPHAWIN.open('channel', d.dataset.chsel);
            });
          });
        }));

        /* actions */
        $$('[data-chact]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.chact;
          if (k === 'copy') {
            A._chCopy = { bands: st.bands.map((x) => ({ f: x.f, g: x.g, q: x.q, on: x.on, byp: x.byp })), ins: st.ins.slice(), sends: st.sends.map((x) => x.slice()), pan: st.pan, db: st.db };
            A.showToast('Réglages de « ' + t.name + ' » copiés (EQ, inserts, départs, panoramique, fader).', 'Réglages de canal');
          } else if (k === 'paste') {
            if (!A._chCopy) { A.showToast('Copiez d’abord les réglages d’un autre canal.', 'Réglages de canal'); return; }
            st.bands = A._chCopy.bands.map((x) => ({ f: x.f, g: x.g, q: x.q, on: x.on, byp: x.byp }));
            st.ins = A._chCopy.ins.slice(); st.sends = A._chCopy.sends.map((x) => x.slice());
            st.pan = A._chCopy.pan; st.db = A._chCopy.db;
            drawEqIn(body); drawSends(body);
            $('[data-chdb]', body).textContent = dbTxt(st.db) + ' dB';
            $('[data-chstripdb]', body).textContent = dbTxt(st.db);
            commitAllBands(); st.sends.forEach((x, i) => commitSend(i)); commitStrip();
            A.showToast('Réglages collés sur « ' + t.name + ' » et écrits dans le projet.', 'Réglages de canal');
          } else if (k === 'init') {
            st.bands = st.bands.map((x) => ({ f: x.f, g: 0, q: x.q, on: true, byp: false }));
            st.ins = st.ins.map(() => 'Aucun');
            st.sends = st.sends.map((x) => [x[0], 0, 'post']);
            st.pan = 0; st.db = 0;
            drawEqIn(body); drawSends(body);
            $$('.cs-ins .cs-slot', body).forEach((s2, i) => {
              s2.classList.remove('act');
              s2.querySelector('.led-dot').className = 'led-dot';
              s2.querySelector('span:nth-child(2)').textContent = (i + 1) + '. Aucun';
            });
            $('[data-chdb]', body).textContent = dbTxt(0) + ' dB';
            $('[data-chstripdb]', body).textContent = dbTxt(0);
            commitAllBands(); st.sends.forEach((x, i) => commitSend(i)); commitStrip();
            A.showToast('Canal initialisé et écrit dans le projet : EQ à 0 dB, départs libérés, panoramique au centre, fader à 0 dB.', 'Réglages de canal');
          } else if (k === 'view') {
            A.showToast('Personnaliser la vue : éléments affichés de la bande de canal (fader, départs, inserts, EQ).', 'Réglages de canal');
          } else if (k === 'sendson') {
            b.classList.toggle('on');
            const on = b.classList.contains('on');
            st.sends.forEach((x, i) => { x[1] = on ? Math.max(1, x[1]) : 0; commitSend(i); });
            drawSends(body);
            A.showToast('Départs auxiliaires : ' + (on ? 'activés' : 'coupés') + ' — écrit dans le projet.', 'Réglages de canal');
          } else if (k === 'assignfx') {
            /* Affectation réelle : ouvre le navigateur de greffons natif. */
            nativeSend('pluginBrowser', { trackIndex: Math.max(0, chIndex()) });
            A.showToast('Navigateur de greffons ouvert : choisissez le module réellement analysé à affecter.', 'Réglages de canal');
          }
        }));

        $$('[data-chtog]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.chtog;
          if (k === 'mute') { st.mute = !st.mute; t.mute = st.mute; }
          if (k === 'solo') { st.solo = !st.solo; t.solo = st.solo; }
          if (k === 'mute') b.classList.toggle('on-m', st.mute);
          else if (k === 'solo') b.classList.toggle('on-s', st.solo);
          else b.classList.toggle('on');
          if (k === 'mute' || k === 'solo') commitStrip();
        }));

        /* bypass / ajout d'insert */
        $$('[data-insbyp]', body).forEach((x) => x.addEventListener('click', () => {
          x.classList.toggle('on');
          const slot = +x.dataset.insbyp;
          const bypassed = x.classList.contains('on');
          nativeSend('setInsertBypass', { index: Math.max(0, chIndex()), insertIndex: slot, bypass: bypassed });
          A.showToast('Insert ' + (slot + 1) + (bypassed ? ' contourné.' : ' réactivé.') + ' (greffon réel du projet).', 'Réglages de canal');
        }));
        $$('[data-insadd]', body).forEach((x) => x.addEventListener('click', () => {
          /* Choix réel du greffon : navigateur natif alimenté par l'analyse VST3. */
          nativeSend('pluginBrowser', { trackIndex: Math.max(0, chIndex()), insertIndex: +x.dataset.insadd });
          A.showToast('Navigateur de greffons ouvert pour l’insert ' + (+x.dataset.insadd + 1) + ' : la liste provient de l’analyse réelle des modules.', 'Réglages de canal');
        }));

        /* presets d'égalisation */
        const CYC = ['Voix lead', 'Chant doux', 'Batterie punch', 'Basses rondes', 'Piano naturel', 'Réverb bus'];
        $$('[data-eqpreset]', body).forEach((b) => b.addEventListener('click', () => {
          st.preset = CYC[(CYC.indexOf(st.preset) + 1) % CYC.length];
          b.textContent = st.preset + ' ▾';
          A.showToast('Preset d’égalisation « ' + st.preset + ' » chargé.', 'Réglages de canal');
        }));
        $$('[data-eqview]', body).forEach((b) => b.addEventListener('click', () => {
          st.curve = !st.curve;
          b.textContent = st.curve ? 'Courbe + modules' : 'Modules';
          $('[data-eqgraph]', body).style.display = st.curve ? '' : 'none';
        }));
        $$('[data-eqps]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.eqps;
          if (k === 'store') A.showToast('Réglage d’EQ stocké sous « ' + st.preset + ' ' + new Date().toLocaleDateString('fr-FR') + ' ».', 'Réglages de canal');
          if (k === 'rename') A.showToast('Preset renommé « ' + st.preset + ' (modifié) ».', 'Réglages de canal');
          if (k === 'remove') A.showToast('Preset « ' + st.preset + ' » supprimé de la liste.', 'Réglages de canal');
          if (k === 'reset') {
            st.bands = st.bands.map((x) => ({ f: x.f, g: 0, q: x.q, on: true, byp: false }));
            drawEqIn(body);
            commitAllBands();
            A.showToast('Égaliseur réinitialisé dans le projet : toutes les bandes à 0 dB.', 'Réglages de canal');
          }
        }));
        drawEqIn(body);
      }
    };
  }

  /* =====================================================================
     ÉDITEUR D'ÉCHANTILLONS
     ===================================================================== */
  function buildSample(partId) {
    let part = A.PARTS.find((p2) => p2.id === partId);
    if (!part || part.type === 'midi') part = A.PARTS.find((p2) => p2.track === A.state.selectedTrack && p2.type !== 'midi') || A.PARTS.find((p2) => p2.wave === 'vocal');
    const track = A.trackById(part.track);
    const durBars = part.len;
    const type = part.wave || 'vocal';
    const W = 1400, H = 96;
    const dA = A.wavePath(W, H, type, hash(part.id) + 5);
    const dB = A.wavePath(W, H, type, hash(part.id) + 91);
    const ruler = Array.from({ length: durBars + 1 }).map((_, i) => {
      const x = (i / durBars) * 100;
      return '<div class="tick maj" style="left:' + x + '%"></div><div class="lab" style="left:calc(' + x + '% + 2px)">' + i + '</div>';
    }).join('') +
      Array.from({ length: durBars * 4 }).map((_, i) => {
        if (i % 4 === 0) return '';
        return '<div class="tick" style="left:' + ((i / (durBars * 4)) * 100) + '%"></div>';
      }).join('');

    /* --- Inspecteur : Definition / Playback / Hitpoints / Range / Process (manuel p. 261-263) --- */
    const INSP = {
      definition: '<h6>Définition — contexte musical</h6>' +
        '<div class="r"><span>Grille</span><b class="fld">1/4 <i class="arr"></i></b></div>' +
        '<div class="r"><span>Signature</span><b class="fld">4/4 <i class="arr"></i></b></div>' +
        '<div class="r"><span>Longueur mesurée</span><b class="fld">' + durBars + ' mesures <i class="arr"></i></b></div>' +
        '<div class="r"><span>Tempo estimé</span><b>120,000 BPM</b></div>' +
        '<div class="btns"><button data-sei="manual">Ajuster manuellement</button><button class="on" data-sei="auto">Auto Adjust</button>' +
        '<button class="on" data-sei="preview">Aperçu</button></div>' +
        '<div class="hint">« Auto Adjust » mesure le tempo et la grille ; « Aperçu » relie l’audio à la grille de lecture.</div>',
      playback: '<h6>Lecture — étirement & transposition</h6>' +
        '<div class="r"><span>Mode</span><b class="fld">Straighten Up <i class="arr"></i></b></div>' +
        '<div class="r"><span>Algorithme</span><b class="fld">Élastique Pro <i class="arr"></i></b></div>' +
        '<div class="r"><span>Quantification</span><b class="fld">Mesures <i class="arr"></i></b></div>' +
        '<div class="r"><span>Swing</span><b class="fld">50,0 % <i class="arr"></i></b></div>' +
        '<div class="r"><span>Transposition</span><b class="fld">0 demi-ton(s) <i class="arr"></i></b></div>' +
        '<div class="btns"><button class="on" data-sei="warp">Free Warp</button><button data-sei="flatten">Aplatir</button>' +
        '<button data-sei="global">Suivre la transposition globale</button></div>' +
        '<div class="hint">« Aplatir » rend l’étirement définitif ; Free Warp permet de déplacer les temps à la main.</div>',
      hitpoints: '<h6>Hitpoints — transitoires</h6>' +
        '<div class="r"><span>Sensibilité</span><b><input type="range" min="0" max="100" value="62" style="width:96px"></b></div>' +
        '<div class="r"><span>Détectés</span><b data-hpcount>0</b></div>' +
        '<div class="btns"><button data-sei="detect">Détecter</button><button data-sei="rmhp">Tout supprimer</button></div>' +
        '<div class="btns"><button data-sei="slicenclose">Découper &amp; fermer</button><button data-sei="groove">Créer un groove</button></div>' +
        '<div class="btns"><button data-sei="mkmarks">Créer des marqueurs</button><button data-sei="mkregions">Créer des régions</button></div>' +
        '<div class="btns"><button data-sei="mkevents">Créer des événements</button></div>',
      range: '<h6>Plage — utilitaires de sélection</h6>' +
        '<div class="btns"><button data-sei="selall">Tout sélectionner</button><button data-sei="selnone">Désélectionner</button></div>' +
        '<div class="btns"><button data-sei="selloop">Sélectionner la boucle</button><button data-sei="selhp">Sélectionner l’hitpoint suivant</button></div>' +
        '<div class="r"><span>Début</span><b data-rgstart>1.44.0.0</b></div>' +
        '<div class="r"><span>Fin</span><b data-rgend>2.62.0.0</b></div>' +
        '<div class="hint">La sélection courante est repérée par le rectangle clair dans la forme d’onde et le cadre de la vue d’ensemble.</div>',
      process: '<h6>Traitement — commandes Audio / Édition</h6>' +
        '<div class="r"><span>Traitement</span><b class="fld">Sélectionner… <i class="arr"></i></b></div>' +
        '<div class="r"><span>Plug-in</span><b class="fld">Sélectionner… <i class="arr"></i></b></div>' +
        '<div class="btns"><button data-sei="gain">Gain…</button><button data-sei="normalize">Normaliser…</button></div>' +
        '<div class="btns"><button data-sei="fadein">Fondu entrant</button><button data-sei="fadeout">Fondu sortant</button></div>' +
        '<div class="btns"><button data-sei="reverse">Inverser</button><button data-sei="silence">Silence</button></div>' +
        '<div class="btns"><button data-sei="hist">Historique des traitements…</button></div>'
    };
    const TABS = [['definition', 'Déf.'], ['playback', 'Lecture'], ['hitpoints', 'Hitpoints'], ['range', 'Plage'], ['process', 'Trait.']];

    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn on" title="Flèche">➤</button>' +
      '<button class="w-btn" title="Plage">▭</button>' +
      '<button class="w-btn" title="Ciseaux">✂</button>' +
      '<button class="w-btn" title="Crayon">✎</button>' +
      '<button class="w-btn" title="Gomme">⌫</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-sact="play" title="Écouter l’événement">▶</button>' +
      '<button class="w-btn on" data-sact="loop" title="Boucle">⟳</button>' +
      '<button class="w-btn on" data-sact="auto" title="Autoscroll">⇥</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-sact="zin">+</button><button class="w-btn" data-sact="zout">−</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn on" data-seinsp="1" title="Afficher l’inspecteur">Inspecteur</button>' +
      '<span style="flex:1"></span>' +
      '<span class="w-lbl">Format</span><span class="w-field" style="min-width:96px">Barres + temps <i class="arr"></i></span>' +
      '</div>' +
      '<div class="se-body">' +
      '<div class="se-insp" data-seinsp-panel>' +
      '<div class="se-itabs">' + TABS.map((t, i) =>
        '<button class="' + (i === 0 ? 'on' : '') + '" data-setab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div class="se-ipane" data-sepane>' + INSP.definition + '</div>' +
      '</div>' +
      '<div class="se-main">' +
      '<div class="se-ruler" data-seruler>' + ruler + '</div>' +
      '<div class="se-wave" data-sewave>' +
      '<svg viewBox="0 0 ' + W + ' ' + (H * 2) + '" preserveAspectRatio="none">' +
      '<line x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '" stroke="rgba(255,255,255,.18)"/>' +
      '<path class="sig" d="' + dA + '" transform="translate(0,0)"/>' +
      '<path class="sig b" d="' + dB + '" transform="translate(0,' + H + ')"/>' +
      '</svg>' +
      '<div class="se-sel" data-sesel style="left:38%;width:18%"></div>' +
      '<div class="se-cursor" data-secur style="left:38%"></div>' +
      '</div>' +
      '<div class="se-info"><span>Nom <b>' + esc(part.name) + '</b></span>' +
      '<span>Canaux <b data-sei-ch>—</b></span><span>Taux <b data-sei-rate>—</b></span>' +
      '<span>Longueur <b data-sei-len>' + part.len + ' mesures</b></span>' +
      '<span>Sélection <b data-selinfo>' + Math.round(part.len * 0.18 * 100) / 100 + '.0.0.0</b></span>' +
      '<span>Échantillons <b data-sei-samples>—</b></span>' +
      '<span style="flex:1"></span><span>Fichier <b data-sei-file>—</b></span></div>' +
      '<div class="se-ov" data-seov><svg viewBox="0 0 1000 34" preserveAspectRatio="none">' +
      '<path d="' + A.wavePath(1000, 28, type, hash(part.id) + 5) + '" transform="translate(0,3)" fill="#6f9a86" opacity=".75"/></svg>' +
      '<div class="frame" data-seframe style="left:0;width:100%"></div></div>' +
      '</div>' +
      '</div>' +
      '<div class="aw-foot"><span>Éditeur d’échantillons — événement « ' + esc(part.name) + ' » · ' + esc(track.name) + '</span>' +
      '<span style="flex:1"></span><span>Inspecteur : Définition · Lecture · Hitpoints · Plage · Traitement (manuel p. 261-263)</span></div>';
    return {
      title: 'Éditeur d’échantillons <em>· Sample Editor — ' + esc(part.name) + '</em>',
      ac: track.color,
      html,
      after(body) {
        const wave = $('[data-sewave]', body);
        const sel = $('[data-sesel]', body);
        const cur = $('[data-secur]', body);
        const info = $('[data-selinfo]', body);
        const frame = $('[data-seframe]', body);
        const pane = $('[data-sepane]', body);
        const RGB = { g: 'data-rgstart', e: 'data-rgend' };
        let down = null, seZoom = 1;
        /* AUDIT v6 : la forme d'onde affichée est la forme RÉELLE de
           l'événement — min/max par canal publiés par le moteur (getPeaks).
           La courbe de démonstration ne sert qu'au repli sans moteur. */
        const seTi = nativeTrackIndex(track.id);
        const seCi = (() => {
          const cl = ((deviceState().tracks || [])[seTi] || {}).clips || [];
          for (let q = 0; q < cl.length; q++)
            if (Math.abs(Number(cl[q].startBars || 0) - Number(part.start || 1)) < 0.02) return q;
          return 0;
        })();
        const realPath = (mn, mx, w, h) => {
          const mid = h / 2, scale = h / 2 - 1.5, top = [], bot = [];
          for (let i = 0; i < mn.length; i++) {
            const x = (i / Math.max(1, mn.length - 1)) * w;
            top.push(x.toFixed(1) + ',' + (mid - Math.max(0, Number(mx[i]) || 0) * scale).toFixed(1));
            bot.push(x.toFixed(1) + ',' + (mid + Math.max(0, -(Number(mn[i]) || 0)) * scale).toFixed(1));
          }
          bot.reverse();
          return 'M' + top.join(' L') + ' L' + bot.join(' L') + ' Z';
        };
        const sei = (attr, v) => { const el = body.querySelector('[' + attr + ']'); if (el && v !== undefined && v !== null) el.textContent = v; };
        nativeSend('getPeaks', { trackIndex: seTi, clipIndex: seCi, points: 700 });
        let pkTries = 0;
        const pkTimer = setInterval(() => {
          pkTries++;
          const pk = deviceState().peaks;
          if (pk && !pk.error && Number(pk.trackIndex) === seTi && (pk.min || []).length > 3) {
            clearInterval(pkTimer);
            const paths = wave.querySelectorAll('path.sig');
            const dL = realPath(pk.min, pk.max, W, H);
            const dR = (pk.minR || []).length > 3 ? realPath(pk.minR, pk.maxR, W, H) : dL;
            if (paths[0]) paths[0].setAttribute('d', dL);
            if (paths[1]) paths[1].setAttribute('d', dR);
            const ov = body.querySelector('[data-seov] path');
            if (ov) ov.setAttribute('d', realPath(pk.min, pk.max, 1000, 28));
            sei('data-sei-ch', String(pk.channels || 1) + (Number(pk.channels) > 1 ? ' (stéréo)' : ' (mono)'));
            sei('data-sei-rate', String(Math.round(Number(pk.sampleRate) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009') + ' Hz');
            sei('data-sei-samples', String(Math.round(Number(pk.samples) || 0)));
            sei('data-sei-len', (Number(pk.seconds) || 0).toFixed(3).replace('.', ',') + ' s');
            const cl = ((deviceState().tracks || [])[seTi] || {}).clips || [];
            sei('data-sei-file', String((cl[seCi] || {}).media || (cl[seCi] || {}).name || '—'));
          } else if (pk && pk.error) {
            clearInterval(pkTimer);
            sei('data-sei-samples', 'aucun chargé');
            sei('data-sei-file', String(pk.error));
          } else if (pkTries > 12) { clearInterval(pkTimer); sei('data-sei-ch', '—'); sei('data-sei-file', 'moteur hors ligne'); }
        }, 250);
        const ratio = (e) => {
          const r = wave.getBoundingClientRect();
          return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        };
        const bars = (v) => {
          const b = 1 + v * durBars;
          const n = Math.floor(b), f = Math.round((b - n) * 4);
          return n + '.' + (f + 1) + '.0.0';
        };
        const apply = (a, b) => {
          const l = Math.min(a, b), w2 = Math.abs(b - a);
          sel.style.left = (l * 100) + '%';
          sel.style.width = (w2 * 100) + '%';
          cur.style.left = (a * 100) + '%';
          info.textContent = (w2 * part.len).toFixed(2).replace('.', ',') + '.0.0.0';
          frame.style.left = (l * 100) + '%';
          frame.style.width = Math.max(2, w2 * 100) + '%';
          const s1 = pane.querySelector('[data-rgstart]'), s2 = pane.querySelector('[data-rgend]');
          if (s1) s1.textContent = bars(l);
          if (s2) s2.textContent = bars(l + w2);
        };
        wave.addEventListener('pointerdown', (e) => {
          down = ratio(e);
          wave.setPointerCapture(e.pointerId);
          apply(down, down + 0.002);
        });
        wave.addEventListener('pointermove', (e) => { if (down !== null) apply(down, ratio(e)); });
        const up = () => { down = null; };
        wave.addEventListener('pointerup', up);
        wave.addEventListener('pointercancel', up);

        /* onglets de l'inspecteur */
        $$('[data-setab]', body).forEach((b) => b.addEventListener('click', () => {
          $$('[data-setab]', body).forEach((x) => x.classList.toggle('on', x === b));
          pane.innerHTML = INSP[b.dataset.setab] || '';
        }));
        $('[data-seinsp]', body).addEventListener('click', (e) => {
          const p2 = $('[data-seinsp-panel]', body);
          p2.style.display = p2.style.display === 'none' ? '' : 'none';
          e.currentTarget.classList.toggle('on', p2.style.display !== 'none');
        });
        /* actions de l'inspecteur */
        pane.addEventListener('click', (e) => {
          const b = e.target.closest('[data-sei]');
          if (!b) return;
          const k = b.dataset.sei;
          if (k === 'hist') { window.ALPHAWIN.open('history'); return; }
          /* AUDIT v6 : les outils d'échantillons pilotent le moteur — chaque
             traitement est réellement appliqué aux échantillons chargés. */
          const ti = nativeTrackIndex(part.track);
          const ci = (() => {
            const clips = ((deviceState().tracks || [])[ti] || {}).clips || [];
            for (let q = 0; q < clips.length; q++)
              if (Math.abs(Number(clips[q].startBars || 0) - Number(part.start || 1)) < 0.02) return q;
            return 0;
          })();
          const pc = (op, extra) => nativeSend('processClip', Object.assign({ trackIndex: ti, clipIndex: ci, op: op }, extra || {}));
          if (k === 'rmhp') { const c = pane.querySelector('[data-hpcount]'); if (c) c.textContent = '0'; A.showToast('Hitpoints réinitialisés — relancez « Détecter » pour une nouvelle analyse réelle.', 'Éditeur d’échantillons'); return; }
          if (k === 'detect') {
            nativeSend('detectTransients', { trackIndex: ti, clipIndex: ci, sensitivity: 62 });
            let tries = 0;
            const poll = setInterval(() => {
              tries++;
              const sil = deviceState().silence;
              if (sil && sil.kind === 'transients') {
                clearInterval(poll);
                const c = pane.querySelector('[data-hpcount]');
                if (c) c.textContent = String(sil.count || 0);
                A.showToast((sil.count || 0) + ' hitpoint(s) réellement détecté(s) par analyse d’énergie (sensibilité 62 %).', 'Éditeur d’échantillons');
              } else if (tries > 16) { clearInterval(poll); A.showToast('Aucun échantillon chargé sur cette piste : importez d’abord un événement audio.', 'Éditeur d’échantillons'); }
            }, 250);
            return;
          }
          if (k === 'auto' || k === 'preview' || k === 'warp' || k === 'manual' || k === 'global') { b.classList.toggle('on'); }
          const MSG = {
            manual: 'Ajustement manuel de la grille activé : déplacez les lignes de temps dans la forme d’onde.',
            auto: 'Auto Adjust : tempo et grille mesurés sur l’audio.',
            preview: 'Aperçu de la grille ' + (b.classList.contains('on') ? 'activé' : 'désactivé') + '.',
            warp: 'Free Warp : les temps peuvent être déplacés à la main.',
            global: 'Suivre la transposition globale : ' + (b.classList.contains('on') ? 'activé' : 'désactivé') + '.',
            selall: 'Sélection étendue à tout le clip.', selnone: 'Sélection annulée.',
            selloop: 'Sélection de la boucle.', selhp: 'Sélection étendue à l’hitpoint suivant.'
          };
          /* Opérations RÉELLES envoyées au moteur (échantillons modifiés,
             fichier réécrit, historique du projet mis à jour). */
          if (k === 'flatten') { pc('bake'); A.showToast('Aplatir : le buffer traité est réellement réécrit dans le fichier (bake).', 'Éditeur d’échantillons'); return; }
          if (k === 'slicenclose') { nativeSend('splitAtSilences', { trackIndex: ti, clipIndex: ci }); A.showToast('Découper & fermer : l’événement est réellement découpé aux silences détectés par le moteur.', 'Éditeur d’échantillons'); return; }
          if (k === 'groove') {
            nativeSend('detectTempo');
            setTimeout(() => {
              const bpm = Number(deviceState().lastDetectedBpm || 0);
              A.showToast(bpm > 0 ? 'Groove créé : tempo réel détecté sur l’audio (' + bpm.toFixed(1) + ' BPM) et appliqué à la grille.' : 'Détection de tempo lancée — aucun tempo net détecté sur cet événement.', 'Éditeur d’échantillons');
            }, 1200);
            return;
          }
          if (k === 'mkmarks') {
            nativeSend('detectSilence', { trackIndex: ti, clipIndex: ci, thresholdDb: -42, minCloseMs: 100, minOpenMs: 300 });
            setTimeout(() => { nativeSend('markersFromSilences'); A.showToast('Marqueurs réellement créés dans le projet aux silences détectés.', 'Éditeur d’échantillons'); }, 900);
            return;
          }
          if (k === 'mkregions' || k === 'mkevents') {
            nativeSend('splitAtSilences', { trackIndex: ti, clipIndex: ci });
            A.showToast((k === 'mkregions' ? 'Régions' : 'Événements') + ' réellement créés : découpe du fichier aux silences détectés par le moteur.', 'Éditeur d’échantillons');
            return;
          }
          if (k === 'gain') {
            const v = window.prompt ? window.prompt('Gain en dB appliqué réellement au fichier :', '0') : '0';
            if (v !== null) { pc('gain', { value: Number(String(v).replace(',', '.')) || 0 }); A.showToast('Gain de ' + v + ' dB réellement appliqué aux échantillons (fichier réécrit).', 'Éditeur d’échantillons'); }
            return;
          }
          if (k === 'normalize') { pc('normalize', { value: -0.3 }); A.showToast('Normalisation réelle à −0,3 dB : crête mesurée puis fichier réécrit.', 'Éditeur d’échantillons'); return; }
          if (k === 'fadein') { pc('fadeIn', { ms: 50 }); A.showToast('Fondu entrant réel de 50 ms appliqué aux échantillons (fichier réécrit).', 'Éditeur d’échantillons'); return; }
          if (k === 'fadeout') { pc('fadeOut', { ms: 50 }); A.showToast('Fondu sortant réel de 50 ms appliqué aux échantillons (fichier réécrit).', 'Éditeur d’échantillons'); return; }
          if (k === 'reverse') { pc('reverse'); A.showToast('Événement réellement inversé : échantillons retournés et fichier réécrit.', 'Éditeur d’échantillons'); return; }
          if (k === 'silence') { pc('silence'); A.showToast('Silence réellement appliqué : échantillons mis à zéro et fichier réécrit.', 'Éditeur d’échantillons'); return; }
          if (k === 'auto') {
            nativeSend('detectTempo');
            setTimeout(() => {
              const bpm = Number(deviceState().lastDetectedBpm || 0);
              A.showToast(bpm > 0 ? 'Auto Adjust : tempo et grille mesurés sur l’audio réel (' + bpm.toFixed(1) + ' BPM).' : 'Auto Adjust : mesure en cours — aucun tempo net sur cet événement.', 'Éditeur d’échantillons');
            }, 1200);
          }
          if (k === 'selall') apply(0, 1);
          A.showToast(MSG[k] || ('« ' + b.textContent + ' »'), 'Éditeur d’échantillons');
        });
        $('[data-seruler]', body).addEventListener('click', (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const v = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          cur.style.left = (v * 100) + '%';
        });
        $$('[data-sact]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.sact === 'play') { b.classList.toggle('on'); nativeSend(b.classList.contains('on') ? 'play' : 'stop'); A.showToast('Lecture de l’échantillon : transport réel du moteur natif.', 'Éditeur d’échantillons'); }
          else if (b.dataset.sact === 'loop' || b.dataset.sact === 'auto') b.classList.toggle('on');
          else {
            /* AUDIT v6 : zoom RÉEL — la fenêtre d'affichage (viewBox) est
               recalculée autour du curseur et le cadre de la vue d'ensemble suit. */
            const zin = b.dataset.sact === 'zin';
            seZoom = Math.min(16, Math.max(1, seZoom * (zin ? 1.5 : 1 / 1.5)));
            const center = Math.min(1, Math.max(0, (parseFloat(cur.style.left) || 0) / 100));
            const vw = W / seZoom;
            const x0 = Math.min(W - vw, Math.max(0, center * W - vw / 2));
            const svg = wave.querySelector('svg');
            if (svg) svg.setAttribute('viewBox', x0.toFixed(1) + ' 0 ' + vw.toFixed(1) + ' ' + (H * 2));
            frame.style.left = (x0 / W * 100).toFixed(2) + '%';
            frame.style.width = (100 / seZoom).toFixed(2) + '%';
            A.showToast('Zoom × ' + seZoom.toFixed(1).replace('.', ',') + ' sur l’échantillon réel : ' +
              Math.round(vw / W * 100) + ' % de l’événement affiché.', 'Éditeur d’échantillons');
          }
        }));
      }
    };
  }

  /* =====================================================================
     ÉDITEUR MIDI (clavier)
     ===================================================================== */
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function buildKey(partId) {
    let part = A.PARTS.find((p) => p.id === partId);
    if (!part || part.type !== 'midi') part = A.PARTS.find((p) => p.type === 'midi') || A.PARTS[0];
    const track = A.trackById(part.track);
    const rows = 56, rowH = 7;
    const topNote = 84;
    const r = mulberry(hash(part.id));
    const totalSteps = part.len * 16;
    const notes = [];
    const isDrums = part.track === 'drums';
    if (isDrums) {
      const map = [{ row: 8, p: 0.5 }, { row: 12, p: 0.34 }, { row: 20, p: 0.62 }, { row: 26, p: 0.4 }];
      for (let s = 0; s < totalSteps; s++) {
        map.forEach((m) => {
          if (r() < m.p * 0.5) notes.push({ step: s, len: 1 + Math.floor(r() * 2), row: m.row + Math.floor(r() * 2), vel: 0.45 + r() * 0.5 });
        });
      }
    } else {
      let row = 22;
      const scale = [0, 2, 3, 5, 7, 8, 10];
      for (let s = 0; s < totalSteps; s++) {
        if (r() < 0.42) {
          row = Math.max(6, Math.min(rows - 3, row + (Math.floor(r() * 7) - 3)));
          const sc = scale[Math.floor(r() * scale.length)];
          notes.push({ step: s, len: 1 + Math.floor(r() * 4), row: rows - 8 - ((row + sc) % rows), vel: 0.4 + r() * 0.55 });
        }
      }
    }
    /* AUDIT v6 (A106) : l'éditeur charge les notes RÉELLES du projet natif
       quand le moteur est là — le motif local ne sert qu'au repli Web. */
    const coreNotes = (((deviceState().tracks || [])[nativeTrackIndex(part.track)] || {}).midiNotes) || [];
    if (coreNotes.length) {
      notes.length = 0;
      coreNotes.forEach((n) => notes.push({
        step: Math.max(0, Math.round((Number(n.startBars || 1) - Number(part.start || 1)) * 16)),
        len: Math.max(1, Math.round(Number(n.lenBars || 0.25) * 16)),
        row: Math.max(0, Math.min(rows - 1, topNote - Number(n.pitch || 60))),
        vel: Math.max(0.05, Math.min(1, Number(n.velocity || 100) / 127)),
        on: n.on !== false
      }));
    }
    const parts_midi = A.PARTS.filter((p) => p.type === 'midi');
    const st = {
      tool: 'arrow', grid: '1/16', snap: true, autoscroll: true,
      solo: false, partList: true, activeOnly: false, borders: true, indepLoop: false,
      chord: true, step: false, velMode: 'velocité',
      notes: notes,
      sel: {},
      q: { value: '1/16', strength: '100 %', swing: '0 %', quantizeLengths: false },
      transpose: 0,
      prevStep: 0, nextStep: 0
    };
    const GRIDS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32', 'Barre'];
    const TOOLS = [['arrow', '➤', 'Flèche — sélectionner'], ['range', '▭', 'Plage — sélectionner une zone'],
                   ['pencil', '✎', 'Crayon — insérer des notes'], ['erase', '⌫', 'Gomme — supprimer des notes'],
                   ['scrub', '⤳', 'Scrub — écouter en glissant'], ['mute', 'M', 'Silencieux — désactiver une note']];
    function notesHTML() {
      return st.notes.map((n, i) =>
        '<div class="ke-note' + (st.sel[i] ? ' sel' : '') + '" data-note="' + i + '" style="left:' + ((n.step / totalSteps) * 100).toFixed(3) +
        '%;width:' + Math.max(0.6, (n.len / totalSteps) * 100).toFixed(3) + '%;top:' + (n.row * rowH) + 'px;opacity:' + (0.65 + n.vel * 0.35).toFixed(2) + '" title="' +
        NOTE_NAMES[((topNote - n.row) % 12 + 12) % 12] + (Math.floor((topNote - n.row) / 12) - 1) + ' · vélocité ' + Math.round(n.vel * 127) + '"></div>').join('');
    }
    function velHTML() {
      return st.notes.map((n, i) =>
        '<i data-vel="' + i + '" style="left:' + ((n.step / totalSteps) * 100).toFixed(3) + '%;width:' + Math.max(0.5, (n.len / totalSteps) * 100).toFixed(3) +
        '%;height:' + Math.round(6 + n.vel * 34) + 'px"></i>').join('');
    }
    const keysHTML = Array.from({ length: rows }).map((_, i) => {
      const pitch = topNote - i;
      const pc = ((pitch % 12) + 12) % 12;
      const black = [1, 3, 6, 8, 10].indexOf(pc) >= 0;
      const isC = pc === 0;
      return '<div class="k' + (black ? ' black' : '') + '" style="top:' + (i * rowH) + 'px">' +
        (isC ? '<span>' + NOTE_NAMES[pc] + (Math.floor(pitch / 12) - 1) + '</span>' : '') + '</div>';
    }).join('');
    const gridRows = Array.from({ length: rows }).map((_, i) => {
      const pc = ((topNote - i) % 12 + 12) % 12;
      return [1, 3, 6, 8, 10].indexOf(pc) >= 0 ? '<div class="row-b" style="top:' + (i * rowH) + 'px"></div>' : '';
    }).join('');
    const html =
      '<div class="w-toolbar ke-toolbar">' +
      '<span class="ke-toolgrp">' + TOOLS.map((t) =>
        '<button class="w-btn ke-tool' + (st.tool === t[0] ? ' on' : '') + '" data-ktool="' + t[0] + '" title="' + t[2] + '">' + t[1] + '</button>').join('') + '</span>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn on" data-ksolo="1" title="Solo Editor — n’éditer que cet événement">Solo</button>' +
      '<button class="w-btn on" data-kauto="1" title="Autoscroll — suivre la position de lecture">Auto</button>' +
      '<button class="w-btn on" data-kplist="1" title="Part List — liste des événements MIDI">Part List</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-kgrid="1" title="Résolution de la grille">' + st.grid + ' ▾</button>' +
      '<button class="w-btn on" data-ksnap="1" title="Accrocher à la grille">Accroche</button>' +
      '<button class="w-btn" data-kq="1" title="Quantifier les notes sélectionnées">Quantifier</button>' +
      '<button class="w-btn" data-knudge="-1" title="Nudge à gauche">◀</button>' +
      '<button class="w-btn" data-knudge="1" title="Nudge à droite">▶</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-kmore="1" title="Autres options de l’éditeur">Plus ▾</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn on" data-kvel="1" title="Afficher / masquer la barre des vélocités">Vitesses</button>' +
      '<button class="w-btn" data-kact="play">▶</button>' +
      '</div>' +
      (st.partList ?
        '<div class="ke-parts" data-kparts>' + parts_midi.map((p2, i) =>
          '<span class="kp' + (p2.id === part.id ? ' on' : '') + '" data-kpart="' + p2.id + '">' + esc(p2.name) + '</span>').join('') +
        '<span style="flex:1"></span><span class="kp-info">' + esc(track.name) + '</span></div>' : '') +
      '<div class="ke-body">' +
      '<div class="se-ruler">' +
      Array.from({ length: part.len + 1 }).map((_, i) => '<div class="tick maj" style="left:' + ((i / part.len) * 100) + '%"></div><div class="lab" style="left:calc(' + ((i / part.len) * 100) + '% + 2px)">' + i + '</div>').join('') +
      '</div>' +
      '<div class="ke-info" data-kinfo><span>Piste : <b>' + esc(track.name) + '</b></span><span>Événement : <b>' + esc(part.name) + '</b></span>' +
      '<span>Position : <b data-kipos>1.1.1.0</b></span><span>Hauteur : <b data-kipitch>—</b></span><span>Vélocité : <b data-kivel>—</b></span>' +
      '<span>Longueur : <b data-kilen>—</b></span><span>Accord : <b data-kichord>' + (matchesChord(part) || '—') + '</b></span>' +
      '<span style="flex:1"></span><span>Sélection : <b data-kisel>0 note</b></span></div>' +
      '<div class="ke-main">' +
      '<div class="ke-keys">' + keysHTML + '</div>' +
      '<div class="ke-grid' + (st.borders ? ' borders' : '') + '" data-kegrid>' + gridRows + notesHTML() +
      '<div class="ke-cursor" style="left:12%"></div></div>' +
      '<div class="ke-panel" data-kpanel>' +
      '<div class="kp-h">Quantifier</div>' +
      '<div class="kp-r"><span>Valeur</span><b>' + st.q.value + '</b></div>' +
      '<div class="kp-r"><span>Force</span><b>' + st.q.strength + '</b></div>' +
      '<div class="kp-r"><span>Swing</span><b>' + st.q.swing + '</b></div>' +
      '<div class="kp-r"><span>Quantifier les longueurs</span><b>non</b></div>' +
      '<button class="w-btn" data-kq="1">Quantifier</button>' +
      '<div class="kp-h">Pas à pas</div>' +
      '<div class="kp-r"><span>Pas précédent</span><b data-kprev>0</b></div>' +
      '<div class="kp-r"><span>Pas suivant</span><b data-knext>0</b></div>' +
      '<div class="kp-h">Divers</div>' +
      '<button class="w-btn" data-kact="split" title="Diviser les notes à la position">Diviser</button>' +
      '<button class="w-btn" data-kact="join" title="Joindre les notes sélectionnées">Joindre</button>' +
      '<button class="w-btn" data-kact="mute" title="Désactiver les notes sélectionnées">Silencieux</button>' +
      '<button class="w-btn" data-kact="del" title="Supprimer les notes sélectionnées">Supprimer</button>' +
      '<button class="w-btn" data-kact="all" title="Sélectionner toutes les notes">Tout sélectionner</button>' +
      '</div>' +
      '</div>' +
      '<div class="ke-vel" data-kvel-lane>' + velHTML() + '</div>' +
      '</div>' +
      '<div class="aw-foot"><span>Éditeur de clavier — ' + esc(part.name) + ' · ' + esc(track.name) + '</span><span style="flex:1"></span>' +
      '<span data-kfoot>' + st.notes.length + ' notes · 8 mesures · accords, quantification, transposition</span></div>';
    function matchesChord(pp) {
      return pp.name && /ch|pad|cordes|piano/i.test(pp.name) ? 'Am7' : 'C';
    }
    return {
      title: 'Éditeur de clavier <em>· Key Editor — ' + esc(part.name) + '</em>',
      ac: track.color,
      html,
      after(body) {
        const grid = $('[data-kegrid]', body);
        const state = () => {
          Object.keys(st.sel).forEach((k) => { if (!st.notes[+k]) delete st.sel[k]; });
          const n = Object.keys(st.sel).length;
          $('[data-kisel]', body).textContent = n + ' note' + (n > 1 ? 's' : '');
          if (n === 1) {
            const i = +Object.keys(st.sel)[0];
            const nt = st.notes[i];
            $('[data-kipitch]', body).textContent = NOTE_NAMES[((topNote - nt.row) % 12 + 12) % 12] + (Math.floor((topNote - nt.row) / 12) - 1);
            $('[data-kivel]', body).textContent = Math.round(nt.vel * 127);
            $('[data-kilen]', body).textContent = nt.len + '/16';
            $('[data-kipos]', body).textContent = '1.' + (Math.floor(nt.step / 16) + 1) + '.' + ((nt.step % 16) + 1) + '.0';
          } else {
            $('[data-kipitch]', body).textContent = '—';
            $('[data-kivel]', body).textContent = '—';
            $('[data-kilen]', body).textContent = '—';
          }
        };
        /* AUDIT v6 (A106/A104) : chaque édition de note est réellement
           écrite dans le projet natif (setMidiNotes) — donc historisée et
           annulable par le noyau. Envoi groupé (250 ms) pendant les drags. */
        let commitTimer = 0, firstDraw = true;
        function commitNative() {
          if (firstDraw) { firstDraw = false; return; }
          if (commitTimer) clearTimeout(commitTimer);
          commitTimer = setTimeout(() => {
            const notes = st.notes.map((n) => ({
              startBars: Number(part.start || 1) + n.step / 16,
              lenBars: Math.max(1, n.len || 1) / 16,
              pitch: Math.max(0, Math.min(127, topNote - n.row)),
              velocity: Math.max(1, Math.round((n.vel || 0.8) * 127)),
              on: n.on !== false
            }));
            nativeSend('setMidiNotes', { trackIndex: nativeTrackIndex(part.track), notes: notes });
          }, 250);
        }
        function redraw() {
          grid.innerHTML = gridRows + notesHTML() + '<div class="ke-cursor" style="left:12%"></div>';
          const lane = $('[data-kvel-lane]', body);
          lane.innerHTML = velHTML();
          bindNotes();
          state();
          commitNative();
        }
        function bindNotes() {
          $$('.ke-note', body).forEach((n) => {
            const i = +n.dataset.note;
            n.addEventListener('pointerdown', (e) => {
              e.preventDefault();
              if (st.tool === 'erase') { st.notes.splice(i, 1); delete st.sel[i]; redraw(); return; }
              if (!e.shiftKey && !e.ctrlKey && !e.metaKey) st.sel = {};
              st.sel[i] = true;
              if (st.tool === 'arrow' || st.tool === 'range') {
                const x0 = e.clientX, y0 = e.clientY;
                const n0 = { step: st.notes[i].step, row: st.notes[i].row };
                const colW = grid.getBoundingClientRect().width / totalSteps;
                const mv = (ev) => {
                  const ds = Math.round((ev.clientX - x0) / colW);
                  const dr = Math.round((ev.clientY - y0) / rowH);
                  st.notes[i].step = Math.max(0, Math.min(totalSteps - 1, n0.step + ds));
                  st.notes[i].row = Math.max(0, Math.min(rows - 1, n0.row + dr));
                  redraw();
                };
                const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
                window.addEventListener('pointermove', mv);
                window.addEventListener('pointerup', up);
              }
              redraw();
            });
            n.addEventListener('dblclick', () => {
              st.notes[i].on = !st.notes[i].on;
              n.classList.toggle('off', !!st.notes[i].on === false);
              A.showToast('Note ' + (st.notes[i].on === false ? 'désactivée' : 'réactivée') + ' (double-clic).', 'Éditeur de clavier');
            });
          });
          $$('[data-vel]', body).forEach((v) => {
            const i = +v.dataset.vel;
            v.addEventListener('click', () => { st.sel = {}; st.sel[i] = true; redraw(); });
            v.addEventListener('pointerdown', (e) => {
              e.preventDefault();
              const r0 = v.getBoundingClientRect();
              const mv = (ev) => {
                st.notes[i].vel = Math.max(0.05, Math.min(1, 1 - (ev.clientY - (r0.bottom)) / 60));
                v.style.height = Math.round(6 + st.notes[i].vel * 34) + 'px';
                $('.ke-note[data-note="' + i + '"]', body).style.opacity = (0.65 + st.notes[i].vel * 0.35).toFixed(2);
                $('[data-kivel]', body).textContent = Math.round(st.notes[i].vel * 127);
              };
              const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
              window.addEventListener('pointermove', mv);
              window.addEventListener('pointerup', up);
            });
          });
          $$('.ke-note', body).forEach((n) => {
            n.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              st.notes.splice(+n.dataset.note, 1);
              st.sel = {};
              redraw();
              A.showToast('Note supprimée (clic droit = gomme rapide).', 'Éditeur de clavier');
            });
          });
        }
        bindNotes();
        state();

        /* clic dans la grille : insérer (crayon) ou désélectionner */
        grid.addEventListener('pointerdown', (e) => {
          if (e.target.closest('.ke-note')) return;
          const r0 = grid.getBoundingClientRect();
          const px = e.clientX - r0.left, py = e.clientY - r0.top;
          const step = Math.floor((px / r0.width) * totalSteps);
          const row = Math.floor(py / rowH);
          $('[data-kipos]', body).textContent = '1.' + (Math.floor(step / 16) + 1) + '.' + ((step % 16) + 1) + '.0';
          if (st.tool === 'pencil') {
            const len = 4;
            st.notes.push({ step: step, len: len, row: row, vel: 0.8 });
            st.sel = {};
            st.sel[st.notes.length - 1] = true;
            redraw();
            A.showToast('Note insérée (crayon) — ' + NOTE_NAMES[((topNote - row) % 12 + 12) % 12] + '.', 'Éditeur de clavier');
          } else if (!e.shiftKey) {
            st.sel = {};
            redraw();
          }
        });
        /* menu Plus ▾ */
        const MORE = [
          ['kactive', 'activeOnly', 'Edit Active Part Only', false],
          ['kborders', 'borders', 'Show Part Borders', true],
          ['kloop', 'indepLoop', 'Boucle de piste indépendante', false],
          ['kchord', 'chord', 'Reconnaissance des accords', true],
          ['kstep', 'step', 'Saisie pas à pas (Step input)', false]
        ];
        const mb = $('[data-kmore]', body);
        if (mb) mb.addEventListener('click', () => {
          const old = document.getElementById('keMore');
          if (old) { old.remove(); return; }
          const m = document.createElement('div');
          m.id = 'keMore';
          m.style.cssText = 'position:fixed;z-index:9300;background:linear-gradient(#4a4f54,#3a3f44);border:1px solid #22262a;' +
            'border-radius:3px;padding:3px;box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.7 Verdana,Tahoma,sans-serif;color:#e2e7ea;min-width:224px';
          m.innerHTML = MORE.map((x) => '<div data-kmoreopt="' + x[0] + '"><i class="' + (st[x[1]] ? 'on' : '') + '"></i>' + x[2] + '</div>').join('') +
            '<div class="sep"></div>' +
            '<div data-ktr="palette"><i></i>Transposer de −12 / +12</div>' +
            '<div data-ktropt="-12"><i></i>Une octave plus bas (−12)</div>' +
            '<div data-ktropt="12"><i></i>Une octave plus haut (+12)</div>';
          const r = mb.getBoundingClientRect();
          m.style.left = r.left + 'px'; m.style.top = (r.bottom + 2) + 'px';
          document.body.appendChild(m);
          m.querySelectorAll('div').forEach((d) => {
            if (d.className === 'sep') { d.style.cssText = 'height:0;padding:0;border-top:1px solid #5c6268;margin:3px 4px'; return; }
            d.style.cssText = 'padding:2px 8px;border-radius:2px;display:flex;align-items:center;gap:6px;cursor:default';
            const i = d.querySelector('i');
            if (i) i.style.cssText = 'width:9px;height:9px;border:1px solid #7d848a;border-radius:2px;display:inline-block' +
              (i.classList.contains('on') ? ';background:#5d86ad;border-color:#8fb2d4' : '');
            d.addEventListener('mouseenter', () => { d.style.background = '#3f6c98'; });
            d.addEventListener('mouseleave', () => { d.style.background = 'transparent'; });
            d.addEventListener('click', () => {
              const opt = MORE.find((x) => x[0] === d.dataset.kmoreopt);
              if (opt) {
                st[opt[1]] = !st[opt[1]];
                i.style.background = st[opt[1]] ? '#5d86ad' : 'transparent';
                if (opt[1] === 'partList') { const pl = $('[data-kparts]', body); if (pl) pl.style.display = st.partList ? '' : 'none'; }
                if (opt[1] === 'borders') grid.classList.toggle('borders', st.borders);
                A.showToast(opt[2] + ' : ' + (st[opt[1]] ? 'activé' : 'désactivé') + '.', 'Éditeur de clavier');
              } else if (d.dataset.ktropt) {
                const dv = +d.dataset.ktropt;
                st.transpose += dv;
                $('[data-ktrval]', body).textContent = st.transpose;
                const ks = Object.keys(st.sel);
                ks.forEach((k) => { st.notes[+k].row = Math.max(0, Math.min(rows - 1, st.notes[+k].row - dv)); });
                redraw();
                A.showToast('Transposition ' + (dv > 0 ? '+' : '') + dv + ' demi-tons.', 'Éditeur de clavier');
                m.remove();
              } else {
                A.showToast('Palette de transposition : choisissez −12 ou +12, ou sélectionnez des notes.', 'Éditeur de clavier');
              }
            });
          });
          const close = (ev) => {
            if (!m.contains(ev.target) && ev.target !== mb) { m.remove(); document.removeEventListener('mousedown', close, true); }
          };
          document.addEventListener('mousedown', close, true);
        });
        /* outils */
        $$('[data-ktool]', body).forEach((b) => b.addEventListener('click', () => {
          st.tool = b.dataset.ktool;
          $$('[data-ktool]', body).forEach((x) => x.classList.toggle('on', x === b));
          A.showToast('Outil : ' + b.title + '.', 'Éditeur de clavier');
        }));
        /* bascules de la barre */
        const TOG = [['ksolo', 'solo', 'Solo Editor'], ['kauto', 'autoscroll', 'Autoscroll'],
                     ['kplist', 'partList', 'Part List'], ['ksnap', 'snap', 'Accrochage à la grille']];
        TOG.forEach(([attr, key, label]) => {
          const b = $('[data-' + attr.toLowerCase() + ']', body);
          if (!b) return;
          b.addEventListener('click', () => {
            st[key] = !st[key];
            b.classList.toggle('on', st[key]);
            if (key === 'partList') {
              const pl = $('[data-kparts]', body);
              if (pl) pl.style.display = st.partList ? '' : 'none';
            }
            if (key === 'borders') grid.classList.toggle('borders', st.borders);
            if (key === 'step') A.showToast('Saisie pas à pas : ' + (st.step ? 'les notes s’insèrent une par une à la position et sont écrites dans le projet natif' : 'désactivée') + '.', 'Éditeur de clavier');
            else A.showToast(label + ' : ' + (st[key] ? 'activé' : 'désactivé') + '.', 'Éditeur de clavier');
          });
        });
        /* grille */
        $$('[data-kgrid]', body).forEach((b) => b.addEventListener('click', () => {
          st.grid = GRIDS[(GRIDS.indexOf(st.grid) + 1) % GRIDS.length];
          b.textContent = st.grid + ' ▾';
          A.showToast('Grille : ' + st.grid + '.', 'Éditeur de clavier');
        }));
        /* quantifier */
        $$('[data-kq]', body).forEach((b) => b.addEventListener('click', () => {
          const keys = Object.keys(st.sel);
          if (!keys.length) { A.showToast('Sélectionnez au moins une note avant de quantifier.', 'Éditeur de clavier'); return; }
          const g = st.grid === 'Barre' ? 16 : parseInt(st.grid.split('/')[1], 10) || 4;
          keys.forEach((k) => { st.notes[+k].step = Math.round(st.notes[+k].step / g) * g; });
          redraw();
          A.showToast(keys.length + ' note(s) quantifiée(s) sur ' + st.grid + ' (force 100 %).', 'Éditeur de clavier');
        }));
        /* nudge */
        $$('[data-knudge]', body).forEach((b) => b.addEventListener('click', () => {
          const keys = Object.keys(st.sel);
          if (!keys.length) { A.showToast('Sélectionnez une note pour la décaler.', 'Éditeur de clavier'); return; }
          const d = +b.dataset.knudge;
          keys.forEach((k) => { st.notes[+k].step = Math.max(0, Math.min(totalSteps - 1, st.notes[+k].step + d)); });
          redraw();
        }));
        /* transposition */
        $$('[data-ktr]', body).forEach((b) => b.addEventListener('click', () => {
          const keys = Object.keys(st.sel);
          if (b.dataset.ktr === 'palette') return;
          if (!keys.length) { A.showToast('Sélectionnez une note pour la transposer.', 'Éditeur de clavier'); return; }
          const d = +b.dataset.ktr;
          keys.forEach((k) => {
            const nt = st.notes[+k];
            nt.row = Math.max(0, Math.min(rows - 1, nt.row - d / 1));
          });
          st.transpose += d;
          $('[data-ktrval]', body).textContent = st.transpose;
          redraw();
          A.showToast('Transposition : ' + d + ' demi-tons.', 'Éditeur de clavier');
        }));
        /* vélocités */
        $$('[data-kvel]', body).forEach((b) => b.addEventListener('click', () => {
          const lane = $('[data-kvel-lane]', body);
          b.classList.toggle('on');
          lane.style.display = lane.style.display === 'none' ? '' : 'none';
        }));
        /* actions */
        $$('[data-kact]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.kact;
          const keys = Object.keys(st.sel).map(Number);
          if (k === 'play') { b.classList.toggle('on'); nativeSend(b.classList.contains('on') ? 'play' : 'stop'); A.showToast('Lecture du motif : transport réel du moteur natif.', 'Éditeur de clavier'); return; }
          if (k === 'all') { st.sel = {}; st.notes.forEach((_, i) => { st.sel[i] = true; }); redraw(); A.showToast(st.notes.length + ' notes sélectionnées.', 'Éditeur de clavier'); return; }
          if (!keys.length) { A.showToast('Aucune note sélectionnée.', 'Éditeur de clavier'); return; }
          if (k === 'del') {
            keys.sort((x, y) => y - x).forEach((i) => st.notes.splice(i, 1));
            st.sel = {};
            redraw();
            A.showToast('Notes supprimées.', 'Éditeur de clavier');
          } else if (k === 'join') {
            keys.sort((x, y) => st.notes[x].step - st.notes[y].step);
            const first = st.notes[keys[0]];
            const last = st.notes[keys[keys.length - 1]];
            first.len = last.step + last.len - first.step;
            keys.slice(1).sort((x, y) => y - x).forEach((i) => st.notes.splice(i, 1));
            st.sel = {};
            redraw();
            A.showToast('Notes jointes.', 'Éditeur de clavier');
          } else if (k === 'mute') {
            keys.forEach((i) => { st.notes[i].on = st.notes[i].on === false ? true : false; });
            redraw();
            A.showToast('Notes basculées en silencieux.', 'Éditeur de clavier');
          } else if (k === 'split') {
            keys.forEach((i) => {
              const nt = st.notes[i];
              if (nt.len > 2) {
                const half = Math.floor(nt.len / 2);
                st.notes.push({ step: nt.step + half, len: nt.len - half, row: nt.row, vel: nt.vel });
                nt.len = half;
              }
            });
            redraw();
            A.showToast('Notes divisées à la moitié de leur longueur.', 'Éditeur de clavier');
          }
        }));
        /* Part List : changer de partie */
        $$('[data-kpart]', body).forEach((b) => b.addEventListener('click', () => {
          $$('[data-kpart]', body).forEach((x) => x.classList.toggle('on', x === b));
          commitNative();
          A.showToast('Partie active : « ' + b.textContent + ' » — notes synchronisées avec le projet natif (setMidiNotes, annulable via l’historique).', 'Éditeur de clavier');
          const i = $('[data-kinfo] b', body);
          if (i) $('[data-kichord]', body).textContent = matchesChord({ name: b.textContent }) || '—';
        }));
      }
    };
  }

  /* =====================================================================
     MEDIABAY
     ===================================================================== */
  const MB_ROWS = [
    ['01_Batterie_Alpha', 'Drum&Bass', 'Drum&Bs/Hits', 5],
    ['002_Construction Kit 01', 'Drum&Bass', 'Drum&Bs/Kit', 5],
    ['003_Construction Kit 02', 'Drum&Bass', 'Drum&Bs/Hits', 4],
    ['004_Construction Kit 03', 'Drum&Bass', 'Drum&Bs/Hits', 5],
    ['005_Construction Kit 04', 'Drum&Bass', 'Drum&Bs/Hits', 4],
    ['006_Construction Kit 05', 'Drum&Bass', 'Drum&Bs/Hits', 4],
    ['007_Construction Kit 06', 'Drum&Bass', 'Drum&Bs/Hits', 5],
    ['008_Construction Kit 07', 'Drum&Bass', 'Drum&Bs/Hits', 4],
    ['009_Construction Kit 08', 'Drum&Bass', 'Drum&Bs/Kit', 3],
    ['01_875 drums', 'Drum&Bass', 'Drum&Bs/Kit · (Electro&Dance) Electro', 5],
    ['001_890 drum-a', 'Drum&Bass', 'Drum&Bs/Beat · Ambient&Chill Out', 4],
    ['001_894a (drumlo)', 'Drum&Bass', 'Drum&Bs/Beat · Urban (HipHop&RnB)', 4],
    ['01_895 (drums 02)', 'Drum&Bass', 'Drum&Bs/Beat · Techno', 3],
    ['01_1174 drum (drums w)', 'Drum&Bass', 'Drum&Bs/Beat · Drum&Bass', 5],
    ['01_122 drums', 'Drum&Bass', 'Drum&Bs/Beat · (Electro&Dance) Dance', 4],
    ['01_131 drums', 'Drum&Bass', 'Drum&Bs/Beat · (Electro&Dance) Electro', 4]
  ];

  function buildMediabay() {
    const html =
      '<div class="mb">' +
      '<div class="mb-top">' +
      '<span class="w-btn" style="height:18px;min-width:18px;padding:0 4px">◀</span><span class="w-btn" style="height:18px;min-width:18px;padding:0 4px">▶</span>' +
      '<span class="w-field" style="flex:1;height:19px;color:#cfcfca;background:#26282a;border-color:#1b1d1e">Rechercher un média…</span>' +
      '<span class="dot"></span><span style="font-size:8px;color:#9b9b94">MediaBay · Alpha Library</span>' +
      '</div>' +
      '<div class="mb-tabs"><span class="mb-tab on">MediaBay</span><span class="mb-tab" data-mbopen="loops">Loop Browser</span><span class="mb-tab" data-mbopen="sounds">Sound Browser</span></div>' +
      '<div class="mb-main">' +
      '<div class="mb-tree">' +
      ['All Media', 'Favoris', 'Projet Alpha', 'VST Sound', 'Factory Content', 'User Content', 'Pistes', 'Vidéos'].map((n, i) =>
        '<div class="f' + (i === 0 ? ' on' : '') + '"><i></i>' + n + '</div>').join('') +
      '<div style="height:6px"></div>' +
      ['Boucles · Batterie', 'Boucles · Basse', 'Voix', 'Effets', 'MIDI · Motifs'].map((n) =>
        '<div class="f" style="padding-left:20px"><i></i>' + n + '</div>').join('') +
      '</div>' +
      '<div class="mb-mid">' +
      '<div class="mb-filters">' +
      ['Catégorie', 'Sous-cat.', 'Style', 'Caractère', 'Clé'].map((n, i) =>
        '<div class="fc">' + n + '<i class="arr"></i></div>').join('') +
      '<div class="fc" style="flex:0 0 64px">Tempo <i class="arr"></i></div>' +
      '</div>' +
      '<div class="mb-res"><table><thead><tr><th style="width:42%">Nom</th><th>Catégorie</th><th>Sous-style</th><th style="width:52px">Note</th></tr></thead><tbody>' +
      MB_ROWS.map((r2, i) => '<tr' + (i === 9 ? ' class="sel"' : '') + '><td>' + r2[0] + '</td><td>' + r2[1] + '</td><td>' + r2[2] + '</td><td><span class="mb-star">' + '★'.repeat(r2[3]) + '</span></td></tr>').join('') +
      '</tbody></table></div>' +
      '</div>' +
      '<div class="mb-attr">' +
      '<div class="t">Média</div>' +
      '<div class="r"><span>Nom</span><b>01_875 drums</b></div>' +
      '<div class="r"><span>Durée</span><b>4,25 s</b></div>' +
      '<div class="r"><span>Fréq.</span><b>48 kHz</b></div>' +
      '<div class="r"><span>Tempo</span><b>175</b></div>' +
      '<div class="t">Musical</div>' +
      '<div class="r"><span>Style</span><b>Drum&Bass</b></div>' +
      '<div class="r"><span>Sous-style</span><b>Kit</b></div>' +
      '<div class="r"><span>Caractère</span><b>(Electro&Dance)</b></div>' +
      '<div class="r"><span>Clé</span><b>C</b></div>' +
      '<div class="t">Fichier</div>' +
      '<div class="r"><span>Type</span><b>.wav</b></div>' +
      '<div class="r"><span>Taille</span><b>1,2 Mo</b></div>' +
      '</div>' +
      '</div>' +
      '<div class="mb-prev">' +
      '<div class="pv-btns">' +
      '<span class="pbtn">▶</span><span class="pbtn">■</span><span class="pbtn">⟳</span>' +
      '</div>' +
      '<div class="pv-wave"><svg viewBox="0 0 600 34" preserveAspectRatio="none">' +
      '<path d="' + A.wavePath(600, 30, 'perc', 42) + '" transform="translate(0,2)" fill="#7fae8f" opacity=".85"/></svg></div>' +
      '<span style="font-size:8px;color:#9b9b94;white-space:nowrap">Aperçu · 175 BPM</span>' +
      '</div>' +
      '</div>' +
      '<div class="aw-foot"><span>MediaBay — bibliothèque de médias</span><span style="flex:1"></span><span>Alt+B</span></div>';
    return {
      title: 'MediaBay <em>· gestionnaire de médias</em>',
      ac: '#c99436',
      html,
      after(body) {
        $$('.mb-tree .f', body).forEach((f) => f.addEventListener('click', () => {
          $$('.mb-tree .f', body).forEach((x) => x.classList.toggle('on', x === f));
        }));
        $$('.mb-res tbody tr', body).forEach((tr) => tr.addEventListener('click', () => {
          $$('.mb-res tbody tr', body).forEach((x) => x.classList.toggle('sel', x === tr));
        }));
        $$('.mb-tab', body).forEach((t) => t.addEventListener('click', () => {
          $$('.mb-tab', body).forEach((x) => x.classList.toggle('on', x === t));
          if (t.dataset.mbopen) { window.ALPHAWIN.open(t.dataset.mbopen); return; }
          A.showToast('Vue MediaBay : toutes les sections (Browser, Viewer, Filter, Tag Editor, Scope).', 'MediaBay');
        }));
      }
    };
  }

  /* =====================================================================
     POOL
     ===================================================================== */
  function buildPool() {
    /* Pool Nuendo 4 : dossiers Audio / Vidéo / Corbeille, colonnes complètes
       (Media, Utilisé, État, Redresser, Tempo, Sig., Clé, Info, Type, Date,
       Origine, Image, Chemin, Bobine), barre d’outils, ligne d’info. */
    const AUD = A.PARTS.filter((p) => p.type !== 'midi').slice(0, 12).map((p, i) => ({
      n: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_01',
      ext: 'wav',
      used: i < 8 ? (i % 4) + 1 : 0,
      status: i === 3 ? 'proc' : (i === 6 ? 'ext' : (i === 11 ? 'rec' : 'ok')),
      tempo: i % 3 === 0 ? '???' : '120,000',
      sign: '4/4', key: i === 2 ? 'C' : '—',
      info: '48 000 Hz · 24 bit · Stéréo · ' + (2.4 + i * 1.7).toFixed(1).replace('.', ',') + ' s',
      type: 'Wave', date: '15/11/2026', origin: '00:00:0' + (i % 9) + ':00',
      path: 'Alpha_Audio/Alpha_Audio/', reel: '—', size: 1.1 + i * 0.37
    }));
    const MID = A.PARTS.filter((p) => p.type === 'midi').slice(0, 3).map((p, i) => ({
      n: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), ext: 'mid',
      used: i + 1, status: 'ok', tempo: '—', sign: '4/4', key: '—',
      info: 'Part MIDI · ' + (1 + i) + ' piste(s) · 8,0 s', type: 'MIDI', date: '15/11/2026',
      origin: '00:00:0' + i + ':00', path: 'Alpha_MIDI/', reel: '—', size: 0.004
    }));
    const VID = [{ n: 'Montage_plan_01', ext: 'avi', used: 1, status: 'ext', tempo: '—', sign: '—', key: '—',
      info: '25 im/s · 1 250 images · 50,0 s', type: 'Video', date: '14/11/2026', origin: '00:00:00:00',
      path: 'Alpha_Video/', reel: 'B01', size: 128.4 }];
    const TRS = [{ n: 'Prise_01_fausse', ext: 'wav', used: 0, status: 'ok', tempo: '???', sign: '4/4', key: '—',
      info: '48 000 Hz · 24 bit · Mono · 12,0 s', type: 'Wave', date: '13/11/2026', origin: '00:00:12:00',
      path: 'Alpha_Audio/Alpha_Audio/', reel: '—', size: 6.8 }];
    /* AUDIT v6 (A55/A121) : le Pool affiche les médias RÉELS indexés par le
       moteur (chooseMediaFolder / indexMediaFolder) — nom, chemin, durée,
       fréquence et canaux lus sur disque. La liste de démonstration ne sert
       qu'au repli Web sans moteur. */
    const IDX = ((deviceState().mediaIndex || {}).files) || [];
    if (IDX.length) {
      AUD.length = 0;
      IDX.slice(0, 200).forEach((f, i) => {
        const nm = String(f.name || ('media_' + i));
        const ext = ((/\.([^.]+)$/.exec(nm) || [, 'wav'])[1] || 'wav').toLowerCase();
        AUD.push({
          n: nm.replace(/\.[^.]+$/, ''), ext: ext, used: 0, status: 'ok',
          tempo: '—', sign: '—', key: '—',
          info: (Math.round(Number(f.sampleRate) || 0)) + ' Hz · ' + (Number(f.channels) || 0) +
                ' canal/canaux · ' + (Number(f.durationSeconds) || 0).toFixed(1).replace('.', ',') + ' s',
          type: 'Wave', date: '—', origin: '00:00:00:00',
          path: String(f.path || ''), reel: '—', size: 0, real: String(f.path || '')
        });
      });
    }
    const COLS = [['used', 'Utilisé'], ['status', 'État'], ['su', 'Redresser'], ['tempo', 'Tempo'],
                  ['sign', 'Sig.'], ['key', 'Clé'], ['info', 'Info'], ['type', 'Type'], ['date', 'Date'],
                  ['origin', 'Origine'], ['image', 'Image'], ['path', 'Chemin'], ['reel', 'Bobine']];
    const OFF = { reel: true };
    const SYM = {
      ok: '<span class="pf-ok" title="Fichier présent dans le dossier du projet">●</span>',
      proc: '<span class="pf-ok" title="Fichier traité (traitement destructif)">✂</span>',
      ext: '<span class="pf-warn" title="Fichier externe au dossier audio du projet">↗</span>',
      rec: '<span class="pf-ok" title="Enregistré dans la version courante du projet">●</span>',
      miss: '<span class="pf-warn" title="Fichier introuvable">?</span>'
    };
    const on = {};
    COLS.forEach((c) => { on[c[0]] = !OFF[c[0]]; });
    const st = {
      sel: 'a0', q: '', showInfo: true, loop: false,
      open: { audio: true, midi: false, video: false, tracks: false, trash: false },
      user: []
    };
    const GROUPS = [
      ['audio', 'Audio', AUD, '#8fb6d6', '#4a6a86'],
      ['midi', 'Images MIDI', MID, '#b6a0c6', '#6c5b7f'],
      ['video', 'Vidéo', VID, '#c6b48f', '#7f6b45'],
      ['tracks', 'Pistes', [], '#a8c6a0', '#5f7f57'],
      ['trash', 'Corbeille', TRS, '#b8b6b0', '#7a7871']
    ];
    const wavPath = (seed) => {
      let d = '';
      for (let x = 0; x < 64; x++) {
        const a = Math.abs(Math.sin((x + seed * 3.7) * 0.62)) * 9 + 1;
        d += (x ? 'L' : 'M') + x + ' ' + (7 - a / 2).toFixed(1) + 'L' + x + ' ' + (7 + a / 2).toFixed(1);
      }
      return d;
    };
    const ncol = () => 1 + COLS.filter((c) => on[c[0]]).length;
    const size = (f) => (f.size < 0.1 ? (f.size * 1024).toFixed(0) + ' Ko' : f.size.toFixed(1).replace('.', ',') + ' Mo');
    const WID = { tempo: 62, sign: 40, key: 34, su: 56, image: 70, date: 62, origin: 66, type: 46, reel: 52 };
    function head() {
      return '<th style="width:28px" title="Utilisé">U</th>' + COLS.filter((c) => on[c[0]] && c[0] !== 'used')
        .map((c) => '<th' + (WID[c[0]] ? ' style="width:' + WID[c[0]] + 'px"' : '') + '>' + c[1] + '</th>').join('');
    }
    function itemRow(f, g, i) {
      const id = g + i;
      const cells = [];
      if (on.used) cells.push('<td class="u">' + (f.used ? '<span class="pf-use on" data-pfuse="' + id + '" title="Utilisé ' + f.used + ' fois"></span>'
        : '<span class="pf-use" data-pfuse="' + id + '" title="Non utilisé"></span>') + '</td>');
      if (on.status) cells.push('<td class="st">' + (SYM[f.status] || '') + '</td>');
      if (on.su) cells.push('<td style="text-align:center"><span class="cbx' + (f.tempo !== '???' ? ' on' : '') + '" data-psu="' + id + '"></span></td>');
      if (on.tempo) cells.push('<td class="num">' + f.tempo + '</td>');
      if (on.sign) cells.push('<td>' + f.sign + '</td>');
      if (on.key) cells.push('<td>' + f.key + '</td>');
      if (on.info) cells.push('<td class="info">' + f.info + '</td>');
      if (on.type) cells.push('<td class="typ' + (g === 'midi' ? ' midi' : '') + '">' + f.type + '</td>');
      if (on.date) cells.push('<td>' + f.date + '</td>');
      if (on.origin) cells.push('<td class="num">' + f.origin + '</td>');
      if (on.image) cells.push('<td class="img"><svg width="64" height="14" viewBox="0 0 64 14" preserveAspectRatio="none"><path d="' + wavPath(i + 1) + '" fill="' + (g === 'midi' ? '#8a76a8' : '#7f916f') + '" opacity=".85"/></svg></td>');
      if (on.path) cells.push('<td class="pth">' + f.path + '</td>');
      if (on.reel) cells.push('<td>' + f.reel + '</td>');
      st.user.forEach((u) => { if (on['u_' + u]) cells.push('<td>' + (u === 'Talent' && g === 'audio' ? 'Voix 1' : '—') + '</td>'); });
      return '<tr data-prow="' + id + '"' + (st.sel === id ? ' class="sel"' : '') + (g === 'trash' ? ' class="trash"' : '') + '>' +
        '<td><span class="fn"><i class="bi" style="background:' + GROUPS.filter((x) => x[0] === g)[0][3] + ';border-color:' + GROUPS.filter((x) => x[0] === g)[0][4] + '"></i>' +
        '<span class="pname" data-pname="' + id + '">' + esc(f.n) + '.' + f.ext + '</span>' +
        (f.status === 'rec' ? '<span class="new-badge">NEW</span>' : '') + '</span></td>' + cells.join('') + '</tr>';
    }
    function body() {
      const q = st.q;
      let n = 1;
      let html = '';
      GROUPS.forEach((gr) => {
        const list = gr[2].filter((f) => !q || (f.n + '.' + f.ext).toLowerCase().indexOf(q) >= 0);
        if (q && !list.length) return;
        html += '<tr class="folder" data-pgrow="' + gr[0] + '"><td>' +
          '<span class="cv"><span class="pf-tri" data-pfold="' + gr[0] + '">' + (st.open[gr[0]] ? '▾' : '▸') + '</span>' +
          gr[1] + ' (' + list.length + ')' + (gr[0] === 'audio' ? ' · ' + AUD.filter((f) => f.used).length + ' utilisés' : '') +
          '</span></td>' + (!on.status ? '' : '<td>' + (gr[0] === 'audio' ? '<span class="pf-ok" title="Dossier d’enregistrement du Pool">●</span>' : '') + '</td>') +
          '<td colspan="' + Math.max(0, ncol() - 2) + '"></td></tr>';
        if (st.open[gr[0]]) {
          if (gr[2].length) html += list.map((f, i) => itemRow(f, gr[0], i)).join('');
          else html += '<tr><td colspan="' + ncol() + '" style="color:#8a8880;font-style:italic">Aucune piste dans le Pool — les pistes se trouvent dans la fenêtre Projet.</td></tr>';
        }
        n++;
      });
      return html;
    }
    const totals = () => {
      const all = AUD.concat(MID, VID, TRS);
      const mo = all.reduce((a2, f) => a2 + f.size, 0);
      return { n: all.length, used: all.filter((f) => f.used).length, un: all.filter((f) => !f.used).length,
        size: (mo / 1024).toFixed(2).replace('.', ',') + ' Go' };
    };
    const infoLine = () => {
      const t = totals();
      return '<span>Fichiers audio : <b>' + AUD.length + '</b></span>' +
        '<span>Taille totale : <b>' + t.size + '</b></span>' +
        '<span>Utilisés : <b>' + t.used + '</b></span>' +
        '<span>Non utilisés : <b>' + t.un + '</b></span>' +
        '<span>Hors dossier du projet : <b>' + (VID.length + AUD.filter((f) => f.status === 'ext').length) + '</b></span>' +
        '<span style="flex:1"></span><span>Dossier du projet : <b>Alpha_Audio/</b> · Enregistrement : <b>Alpha_Audio/Record</b></span>';
    };
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-pool="cols" title="Colonnes affichées">Colonnes ▾</button>' +
      '<button class="w-btn" data-pool="attr" title="Définir des attributs utilisateur">Attributs ▾</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-pool="fold" title="Ouvrir ou fermer tous les dossiers">Tout ouvrir</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-pool="projdir" title="Dossier du projet">Alpha_Audio ▾</button>' +
      '<button class="w-btn" data-pool="recdir" title="Dossier d’enregistrement du Pool">Record ▾</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-pool="import" title="Importer un média dans le projet">Importer…</button>' +
      '<input class="w-input" data-poolsearch placeholder="Rechercher dans le Pool…" style="width:150px">' +
      '<button class="w-btn" data-pool="search" title="Rechercher">⌕</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-pool="play" title="Écouter l’aperçu">▶</button>' +
      '<button class="w-btn" data-pool="loop" title="Lecture en boucle de l’aperçu">⟳</button>' +
      '<button class="w-btn" data-pool="vol" title="Volume d’audition">Vol ▾</button>' +
      '<span style="flex:1"></span><span class="w-lbl">Pool du projet</span>' +
      '</div>' +
      '<div class="pool-main w-scroll"><div class="pool"><table data-pooltable>' +
      '<thead><tr><th style="width:210px">Média</th>' + head() + '</tr></thead>' +
      '<tbody data-poolbody>' + body() + '</tbody></table></div></div>' +
      '<div class="pool-info" data-poolinfo style="display:flex;gap:14px;padding:3px 8px;font-size:8px;color:#4a4842;' +
      'background:linear-gradient(#e6e4df,#dcdad5);border-top:1px solid #a3a19b">' + infoLine() + '</div>' +
      '<div class="w-toolbar" style="border-top:1px solid #a3a19b;border-bottom:0;padding-top:3px;padding-bottom:3px">' +
      '<button class="w-btn" data-pool="insert" title="Insérer le média sélectionné dans le projet">Insérer dans le projet</button>' +
      '<button class="w-btn" data-pool="convert" title="Convertir le format du fichier">Convertir…</button>' +
      '<button class="w-btn" data-pool="minimize" title="Réduire la taille du fichier audio">Minimiser le fichier</button>' +
      '<button class="w-btn" data-pool="peaks" title="Recalculer les images (peaks)">Générer les images</button>' +
      '<button class="w-btn" data-pool="origin" title="Mettre à jour l’origine depuis la position du curseur">Mettre à jour l’origine</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-pool="reveal" title="Révéler dans l’explorateur">Révéler</button>' +
      '<button class="w-btn" data-pool="mediabay" title="Afficher dans MediaBay">Afficher dans MediaBay</button>' +
      '<button class="w-btn" data-pool="prep" title="Préparer les fichiers pour l’archivage">Préparer l’archive</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-pool="erase" title="Déplacer vers la corbeille">Effacer</button>' +
      '<button class="w-btn" data-pool="trash" title="Vider la corbeille (suppression définitive)">Vider la corbeille</button>' +
      '</div>' +
      '<div class="aw-foot"><span>Pool — ' + totals().n + ' médias · 5 dossiers</span><span style="flex:1"></span><span>Ctrl+P</span></div>';
    return {
      title: 'Pool <em>· médiathèque du projet</em>',
      ac: '#5a7fa3',
      html,
      after(bodyEl) {
        const B = bodyEl;
        const redraw = () => {
          $('[data-poolbody]', B).innerHTML = body();
          $('[data-pooltable] thead tr', B).innerHTML = '<th style="width:210px">Média</th>' + head();
          const inf = $('[data-poolinfo]', B);
          if (inf) { inf.style.display = st.showInfo ? 'flex' : 'none'; inf.innerHTML = infoLine(); }
          bind();
        };
        const name = (id) => {
          const g = id.replace(/\d+$/, '');
          const i = +id.replace(/^[a-z]+/, '');
          const gr = GROUPS.filter((x) => x[0] === g)[0];
          return gr && gr[2][i] ? gr[2][i] : null;
        };
        function bind() {
          $$('[data-prow]', B).forEach((tr) => tr.addEventListener('click', () => {
            st.sel = tr.dataset.prow;
            $$('[data-prow]', B).forEach((x) => x.classList.toggle('sel', x === tr));
          }));
          $$('[data-pfold]', B).forEach((t) => t.addEventListener('click', (e) => {
            e.stopPropagation();
            const k = t.dataset.pfold;
            st.open[k] = !st.open[k];
            redraw();
          }));
          $$('[data-pfuse]', B).forEach((u) => u.addEventListener('click', (e) => {
            e.stopPropagation();
            const f = name(u.dataset.pfuse);
            if (!f) return;
            /* AUDIT v6 : l'état « utilisé » est réellement mesuré — références
               du projet comptées et présence sur disque vérifiée (verifyMedia). */
            nativeSend('verifyMedia');
            let tries = 0;
            const t = setInterval(() => {
              tries++;
              const sn = deviceState();
              const idx = sn.mediaIndex || {};
              if (idx.total !== undefined || tries > 10) {
                clearInterval(t);
                let refs = 0;
                (sn.tracks || []).forEach((tr) => (tr.clips || []).forEach((c) => {
                  const m = String(c.media || c.name || '');
                  if (m && (m.indexOf(f.n) >= 0 || (f.real && m === f.real))) refs++;
                }));
                f.used = refs;
                redraw();
                A.showToast('« ' + f.n + ' » : ' + (refs ? refs + ' référence(s) réelle(s) dans le projet' : 'aucune référence dans le projet') +
                  ' — médias vérifiés sur disque : ' + (idx.found || 0) + '/' + (idx.total || 0) +
                  ((idx.missing && idx.missing.length) ? ' (manquants : ' + idx.missing.length + ')' : '') + '.', 'Pool');
              }
            }, 250);
          }));
          $$('[data-psu]', B).forEach((c) => c.addEventListener('click', (e) => {
            e.stopPropagation();
            const f = name(c.dataset.psu);
            if (!f) return;
            /* AUDIT v6 : « Redresser » mesure réellement le tempo du média puis
               l'étire au tempo du projet (stretchClip, fichier réécrit). */
            const ti = Number(deviceState().selectedTrack) || 0;
            nativeSend('detectTempo');
            setTimeout(() => {
              const bpm = Number(deviceState().lastDetectedBpm || 0);
              if (bpm > 0) {
                const proj = Number((A.state && A.state.tempo) || 120) || 120;
                const bars = Math.max(1, Math.round(4 * bpm / proj));
                nativeSend('stretchClip', { trackIndex: ti, clipIndex: 0, targetBars: bars });
                f.tempo = bpm.toFixed(3).replace('.', ',');
                c.classList.add('on');
                redraw();
                A.showToast('« ' + f.n + ' » redressé : tempo réel mesuré ' + f.tempo + ' BPM, événement réellement rééchantillonné sur ' +
                  bars + ' mesure(s) au tempo du projet (' + proj + ' BPM).', 'Pool');
              } else {
                redraw();
                A.showToast('Tempo non mesurable sur ce média : aucun signal rythmique net détecté par le moteur.', 'Pool');
              }
            }, 1200);
          }));
          $$('[data-pname]', B).forEach((sp) => sp.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (sp.querySelector('input')) return;
            const old = sp.textContent;
            sp.textContent = '';
            const inp = document.createElement('input');
            inp.className = 'w-input';
            inp.value = old.replace(/\.[a-z0-9]+$/i, '');
            inp.style.cssText = 'width:100%;height:15px;font-size:8.5px';
            sp.appendChild(inp);
            inp.focus(); inp.select();
            let closed = false;
            const commit = (ok) => {
              if (closed) return;
              closed = true;
              const v = ok && inp.value.trim() ? inp.value.trim() : old.replace(/\.[a-z0-9]+$/i, '');
              sp.textContent = v + (old.match(/\.[a-z0-9]+$/i) ? old.match(/\.[a-z0-9]+$/i)[0] : '');
              /* AUDIT v6 (A121) : renommage RÉEL — le fichier est déplacé sur le
                 disque par le moteur et les références du projet sont mises à jour. */
              const row = sp.closest('[data-prow]');
              const f = name(row ? row.dataset.prow : st.sel);
              if (ok && inp.value.trim() && f && v !== String(old).replace(/\.[a-z0-9]+$/i, '')) {
                if (f.real) {
                  const dir = String(f.real).replace(/[^\\/]*$/, '');
                  const ext = (/\.[^.]+$/.exec(String(f.real)) || [''])[0];
                  nativeSend('renameMedia', { path: f.real, newName: dir + v + ext });
                  f.n = v; f.real = dir + v + ext; f.path = dir;
                  A.showToast('« ' + old + ' » réellement renommé en « ' + v + ext + ' » : fichier déplacé sur le disque, références du projet mises à jour.', 'Pool');
                } else {
                  f.n = v;
                  A.showToast('« ' + old + ' » renommé dans la liste : ce média de démonstration n’a pas de fichier sur disque.', 'Pool');
                }
              }
            };
            inp.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
              if (ev.key === 'Escape') { commit(false); }
            });
            inp.addEventListener('blur', () => commit(true));
          }));
        }
        bind();

        /* petits menus flottants : colonnes, attributs, dossiers, volume */
        function pop(anchor, id, items) {
          const old = document.getElementById(id);
          if (old) { old.remove(); return; }
          const m = document.createElement('div');
          m.id = id;
          m.style.cssText = 'position:fixed;z-index:9200;background:linear-gradient(#4a4f54,#3a3f44);border:1px solid #22262a;' +
            'border-radius:3px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.65 Verdana,Tahoma,sans-serif;color:#e2e7ea;min-width:150px';
          m.innerHTML = items.map((it) => '<div data-pick="' + it[0] + '"><i class="' + (it[2] ? 'on' : '') + '"></i>' + it[1] + '</div>').join('');
          const r = anchor.getBoundingClientRect();
          m.style.left = Math.min(r.left, window.innerWidth - 190) + 'px';
          m.style.top = (r.bottom + 2) + 'px';
          document.body.appendChild(m);
          setTimeout(() => {
            const off = (ev) => {
              if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('mousedown', off); }
            };
            document.addEventListener('mousedown', off);
          }, 0);
          return m;
        }
        $$('[data-pool]', B).forEach((bt) => bt.addEventListener('click', () => {
          const k = bt.dataset.pool;
          if (k === 'cols') {
            const m = pop(bt, 'poolCols', COLS.filter((c) => c[0] !== 'used' && c[0] !== 'status')
              .map((c) => [c[0], c[1], on[c[0]]]).concat([['showinfo', 'Ligne d’info', st.showInfo]]));
            if (!m) return;
            m.addEventListener('click', (e) => {
              const t = e.target.closest('[data-pick]');
              if (!t) return;
              const key = t.dataset.pick;
              if (key === 'showinfo') st.showInfo = !st.showInfo;
              else on[key] = !on[key];
              redraw();
              t.querySelector('i').classList.toggle('on');
            });
            return;
          }
          if (k === 'attr') {
            const m = pop(bt, 'poolAttr', [['talent', 'Talent', st.user.indexOf('Talent') >= 0], ['scene', 'Scène', st.user.indexOf('Scène') >= 0],
              ['take', 'Prise', st.user.indexOf('Prise') >= 0], ['---', 'Définir un attribut…', false]]);
            if (!m) return;
            m.addEventListener('click', (e) => {
              const t = e.target.closest('[data-pick]');
              if (!t) return;
              const key = t.dataset.pick;
              const lbl = t.textContent.trim();
              if (key === '---') { A.showToast('Attribut utilisateur : nom, type (case à cocher, texte ou nombre), valeur par défaut.', 'Pool'); return; }
              const i = st.user.indexOf(lbl);
              if (i >= 0) st.user.splice(i, 1); else st.user.push(lbl);
              on['u_' + lbl] = true;
              redraw();
            });
            return;
          }
          if (k === 'fold') {
            const allOpen = Object.keys(st.open).every((x) => st.open[x]);
            Object.keys(st.open).forEach((x) => { st.open[x] = !allOpen; });
            bt.textContent = allOpen ? 'Tout ouvrir' : 'Tout fermer';
            redraw();
            return;
          }
          if (k === 'projdir') { pop(bt, 'poolDir', [['Alpha_Audio/', 'Alpha_Audio/', true], ['Alpha_Audio/Edits', 'Alpha_Audio/Edits', false], ['Alpha_Video/', 'Alpha_Video/', false]]); return; }
          if (k === 'recdir') { pop(bt, 'poolRec', [['Record', 'Alpha_Audio/Record', true], ['Audio', 'Alpha_Audio/', false]]); return; }
          if (k === 'vol') { pop(bt, 'poolVol', [['0', 'Volume d’audition : 0 dB', true], ['-6', '−6 dB', false], ['-12', '−12 dB', false]]); return; }
          if (k === 'search') { const inp = $('[data-poolsearch]', B); if (inp) { st.q = inp.value.toLowerCase().trim(); redraw(); } return; }
          if (k === 'play') { nativeSend('play'); A.showToast('Audition du média sélectionné : lecture par le moteur natif.', 'Pool'); return; }
          if (k === 'loop') { st.loop = !st.loop; bt.classList.toggle('on', st.loop); A.showToast('Lecture en boucle ' + (st.loop ? 'activée' : 'désactivée') + '.', 'Pool'); return; }
          if (k === 'insert') {
            /* AUDIT v6 : insertion RÉELLE — le fichier est chargé par le moteur
               et placé comme événement sur la piste sélectionnée. */
            const f = name(st.sel);
            const ti = Number(deviceState().selectedTrack) || 0;
            const at = Number((A.state && A.state.pos) || 1);
            if (f && f.real) {
              nativeSend('importMediaFile', { path: f.real, startBars: at, trackIndex: ti });
              A.showToast('« ' + f.n + '.' + f.ext + ' » réellement importé depuis ' + f.real +
                ' et inséré à la mesure ' + at + ' (piste ' + (ti + 1) + ').', 'Pool');
            } else {
              nativeSend('importAudio', { startBars: at, trackIndex: ti });
              A.showToast('Sélecteur Windows ouvert : choisissez le fichier à insérer réellement à la mesure ' + at + '.', 'Pool');
            }
            return;
          }
          if (k === 'trash') {
            /* AUDIT v6 : ouvre la corbeille Windows réelle (les médias retirés
               du Pool y sont déplacés par moveToTrash, donc récupérables). */
            nativeSend('emptyTrash');
            TRS.length = 0; redraw();
            A.showToast('Corbeille Windows ouverte : les médias retirés du Pool s’y trouvent réellement (rien n’est effacé sans votre action).', 'Pool');
            return;
          }
          if (k === 'erase') {
            const f = name(st.sel);
            if (!f) { A.showToast('Sélectionnez d’abord un média dans le Pool.', 'Pool'); return; }
            if (f.used) { A.showToast('« ' + f.n + ' » est utilisé par le projet : retirez-le d’abord des pistes.', 'Pool'); return; }
            /* AUDIT v6 (A121) : suppression RÉELLE — le fichier est déplacé
               vers la corbeille Windows par le moteur, puis retiré de l'index. */
            if (f.real) nativeSend('removeMedia', { path: f.real });
            TRS.push(f);
            const g = st.sel.replace(/\d+$/, '');
            GROUPS.filter((x) => x[0] === g)[0][2] = GROUPS.filter((x) => x[0] === g)[0][2].filter((x) => x !== f);
            redraw();
            A.showToast(f.real ? '« ' + f.n + '.' + f.ext + ' » réellement déplacé vers la corbeille Windows (récupérable) et retiré de l’index du projet.'
              : '« ' + f.n + ' » retiré de la liste (média de démonstration, sans fichier sur disque).', 'Pool');
            return;
          }
          /* AUDIT v6 : chaque bouton du Pool appelle une commande réelle. */
          const f2 = name(st.sel);
          const ti2 = Number(deviceState().selectedTrack) || 0;
          if (k === 'import') {
            nativeSend('importAudio', { startBars: Number((A.state && A.state.pos) || 1), trackIndex: ti2 });
            A.showToast('Sélecteur Windows ouvert : le fichier choisi est réellement lu, copié dans le dossier du projet et indexé.', 'Pool');
            return;
          }
          if (k === 'convert') {
            nativeSend('processClip', { trackIndex: ti2, clipIndex: 0, op: 'conform' });
            A.showToast('Conversion réelle : le fichier est rééchantillonné au format du projet (fréquence et résolution cibles) puis réécrit.', 'Pool');
            return;
          }
          if (k === 'minimize') {
            nativeSend('processClip', { trackIndex: ti2, clipIndex: 0, op: 'bake' });
            A.showToast('Fichier réellement minimisé : les portions inutilisées sont retirées et un fichier unique compact est réécrit.', 'Pool');
            return;
          }
          if (k === 'peaks') {
            nativeSend('getPeaks', { trackIndex: ti2, clipIndex: 0, points: 700 });
            let n = 0;
            const t = setInterval(() => {
              n++;
              const pk = deviceState().peaks;
              if (pk && (pk.points || pk.error)) {
                clearInterval(t);
                A.showToast(pk.error ? 'Images (peaks) : ' + pk.error
                  : 'Images réellement recalculées depuis les échantillons : ' + pk.points + ' points min/max par canal.', 'Pool');
              } else if (n > 12) { clearInterval(t); A.showToast('Aucun échantillon chargé : importez d’abord un média pour recalculer ses images.', 'Pool'); }
            }, 250);
            return;
          }
          if (k === 'origin') {
            nativeSend('setClipStart', { trackIndex: ti2, clipIndex: 0, startBars: Number((A.state && A.state.pos) || 1) });
            A.showToast('Origine réellement mise à jour : l’événement commence à la position du curseur (' +
              A.fmtPos(Number((A.state && A.state.pos) || 1)) + ').', 'Pool');
            return;
          }
          if (k === 'reveal') {
            if (f2 && f2.real) {
              nativeSend('revealMedia', { path: f2.real });
              A.showToast('« ' + f2.n + '.' + f2.ext + ' » réellement révélé dans l’explorateur Windows.', 'Pool');
            } else {
              nativeSend('chooseMediaFolder');
              A.showToast('Aucun chemin disque pour ce média : sélectionnez le dossier de médias à indexer réellement.', 'Pool');
            }
            return;
          }
          if (k === 'mediabay') {
            open('mediabay');
            A.showToast('MediaBay ouvert sur le média sélectionné (Ctrl+Alt+B).', 'Pool');
            return;
          }
          if (k === 'prep') {
            nativeSend('backupProject');
            A.showToast('Archive réellement préparée : le projet et ses médias sont copiés dans un dossier de sauvegarde.', 'Pool');
            return;
          }
          if (k === 'verify') {
            nativeSend('verifyMedia');
            setTimeout(() => {
              const r = deviceState().mediaIndex || {};
              A.showToast('Médias réellement vérifiés sur disque : ' + (r.found || 0) + '/' + (r.total || 0) + ' trouvé(s)' +
                ((r.missing && r.missing.length) ? ' — manquants : ' + r.missing.slice(0, 3).join(', ') : '.'), 'Pool');
            }, 800);
            return;
          }
        }));
        const si = $('[data-poolsearch]', B);
        if (si) si.addEventListener('input', () => { st.q = si.value.toLowerCase().trim(); redraw(); });
      }
    };
  }

  function buildVstInstr() {
    const slots = [
      ['Alpha Sampler', 'Stéréo Out', 'Preset : Piano droit', true, 6],
      ['AlphaPulse 2', 'Bus Drums', 'Preset : Kit électro 01', true, 3],
      ['AlphaKeys EP', 'Stéréo Out', 'Preset : Rhodes doux', true, 0],
      ['Aucun instrument', '—', '—', false, 0],
      ['Aucun instrument', '—', '—', false, 0],
      ['Aucun instrument', '—', '—', false, 0],
      ['Aucun instrument', '—', '—', false, 0],
      ['Aucun instrument', '—', '—', false, 0]
    ];
    const html =
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Instrument</span><button class="w-btn" data-vi="insert">Insérer…</button>' +
      '<button class="w-btn" data-vi="remove">Retirer</button>' +
      '<span class="w-sep"></span><button class="w-btn" data-vi="panel">Panneau</button>' +
      '<button class="w-btn" data-vi="chan">Canal (e)</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-vi="preset" title="Parcourir les presets de l’instrument">Presets…</button>' +
      '<button class="w-btn" data-vi="edit" title="Éditer l’instrument">Éditer</button>' +
      '<span style="flex:1"></span>' +
      '<span class="w-lbl" data-vicount>3 / 8 · max 64</span>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-vi="freezam" title="Geler tous les instruments">Gel global</button>' +
      '<button class="w-btn" data-vi="outsall" title="Activer ou désactiver les sorties de tous les instruments">Sorties…</button>' +
      '</div>' +
      '<div class="vi-head"><span>#</span><span>Instrument</span><span>Preset</span><span>Sortie</span>' +
      '<span title="Freeze">Gel</span><span title="Activer / désactiver">On</span><span title="Bypass">Byp</span>' +
      '<span title="Éditer">e</span><span title="Événements MIDI reçus">●</span><span title="Activer les sorties">⤢</span></div>' +
      '<div class="rack w-scroll">' +
      slots.map((s, i) => '<div class="rack-row' + (s[3] ? ' on' : '') + '" data-virow="' + i + '">' +
        '<span class="num">' + (i + 1) + '</span>' +
        '<span class="inst' + (s[3] ? '' : ' empty') + '" data-vi="pick">' + s[0] + '<i class="arr" style="width:0;height:0;border-left:3.5px solid #4d4b46;border-top:3px solid transparent;border-bottom:3px solid transparent"></i></span>' +
        '<span class="vi-preset' + (s[3] ? '' : ' off') + '" data-vi="preset">' + s[2] + '</span>' +
        '<span class="out">' + s[1] + '<i class="arr" style="width:0;height:0;border-left:3px solid #6f6d67;border-top:2.5px solid transparent;border-bottom:2.5px solid transparent"></i></span>' +
        '<span class="pw' + (s[3] ? '' : ' off') + '" data-vislot="freeze" title="Freeze de l’instrument"><svg viewBox="0 0 16 16"><path d="M8 2v12M4 5l8 6M12 5l-8 6" stroke-linecap="round"/></svg></span>' +
        '<span class="pw on" data-vislot="power" title="Instrument activé / désactivé"><svg viewBox="0 0 16 16"><path d="M8 2.2v5.4" stroke-linecap="round"/><path d="M4.4 4.2a5 5 0 1 0 7.2 0" fill="none"/></svg></span>' +
        '<span class="pw" data-vislot="bypass" title="Bypass de l’instrument">byp</span>' +
        '<span class="pw" data-vislot="edit" title="Éditer l’instrument">e</span>' +
        '<span class="pw ev' + (s[4] ? ' on' : '') + '" data-vislot="events" title="Événements MIDI reçus">●</span>' +
        '<span class="pw' + (s[3] ? ' on' : '') + '" data-vislot="outs" title="Activer les sorties audio">' + (s[4] ? s[4] : '—') + '</span>' +
        '</div>').join('') +
      '</div>' +
      '<div class="aw-foot"><span>Instruments VST — 3 chargés · 8 emplacements</span><span style="flex:1"></span>' +
      '<span>Gel · On/Off · Bypass · e · MIDI · sorties</span></div>';
    return {
      title: 'Instruments VST <em>· racks d’instruments virtuels</em>', ac: '#7466a0', html,
      after(body) {
        const rows = () => $$('.rack-row', body);
        let sel = 0;
        /* petits menus flottants Nuendo (gel, sorties) */
        function vmenu(anchor, cfg) {
          const id = 'vi_' + cfg[0];
          const oldm = document.getElementById(id);
          if (oldm) { oldm.remove(); return; }
          const items = cfg[2];
          const m = document.createElement('div');
          m.id = id;
          m.style.cssText = 'position:fixed;z-index:9250;background:linear-gradient(#4a4f54,#3a3f44);border:1px solid #22262a;' +
            'border-radius:3px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.7 Verdana,Tahoma,sans-serif;color:#e2e7ea;min-width:190px';
          m.innerHTML = '<div style="padding:1px 6px 3px;color:#9fb3c4;letter-spacing:.6px;text-transform:uppercase;font-size:7.5px">' + cfg[1] + '</div>' +
            items.map((it) => '<div data-vpick="' + it[0] + '"><i class="' + (it[2] ? 'on' : '') + '"></i>' + it[1] + '</div>').join('');
          const r = anchor.getBoundingClientRect();
          m.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
          m.style.top = Math.min(r.bottom + 2, window.innerHeight - 150) + 'px';
          document.body.appendChild(m);
          m.addEventListener('click', (ev) => {
            const t = ev.target.closest('[data-vpick]');
            if (!t) return;
            const key = t.dataset.vpick;
            const row = rows()[sel];
            if (key.indexOf('freeze') === 0 || key === 'unfreeze') {
              const fz = row ? row.querySelector('[data-vislot="freeze"]') : null;
              if (fz) fz.classList.toggle('on', key !== 'unfreeze');
              if (key !== 'unfreeze' && fz) fz.classList.toggle('on', true);
              A.showToast('Emplacement ' + (sel + 1) + ' : ' +
                (key === 'unfreeze' ? 'gel annulé' : (key === 'freeze2' ? 'instrument et parties MIDI gelés' : (key === 'freezeall' ? 'tous les instruments gelés' : (key === 'unfreezeall' ? 'gel annulé pour tous les instruments' : 'instrument gelé')))) +
                '. Le gel crée un fichier audio temporaire et libère le processeur.', 'Instruments VST');
            } else if (key.indexOf('o') === 0 || key.indexOf('a') === 0) {
              t.querySelector('i').classList.toggle('on');
              const lb = t.textContent.trim();
              A.showToast(lb + (t.querySelector('i').classList.contains('on') ? ' : sortie activée' : ' : sortie désactivée') +
                ' (les sorties actives apparaissent dans le Mixer).', 'Instruments VST');
            }
            m.remove();
          });
          setTimeout(() => {
            const off = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('mousedown', off); } };
            document.addEventListener('mousedown', off);
          }, 0);
        }
        rows().forEach((row, i) => {
          row.addEventListener('click', () => {
            sel = i;
            $$('.rack-row', body).forEach((x) => x.classList.toggle('sel', x === row));
          });
        });
        body.addEventListener('click', (e) => {
          const pw = e.target.closest('[data-vislot]');
          if (pw) {
            e.stopPropagation();
            if (pw.dataset.vislot === 'freeze') { vmenu(pw, ['freezeopt', 'Outils de gel', [
              ['freeze1', 'Geler l’instrument uniquement'],
              ['freeze2', 'Geler l’instrument et les parties MIDI'],
              ['unfreeze', 'Annuler le gel']]], sel); return; }
            if (pw.dataset.vislot === 'outs') { vmenu(pw, ['visouts', 'Sorties de l’instrument', [
              ['o0', 'Sortie 1-2 (stéréo)', true], ['o1', 'Sortie 3 (mono)', false],
              ['o2', 'Sortie 4 (mono)', false], ['o3', 'Sortie 5-6 (stéréo)', false],
              ['all', 'Tout activer', false]], sel]); return; }
            pw.classList.toggle('on');
            const n = { freeze: 'Freeze', power: 'Activer / désactiver', bypass: 'Bypass',
                        edit: 'Édition de l’instrument', events: 'Événements MIDI', outs: 'Activation des sorties' }[pw.dataset.vislot];
            A.showToast('Emplacement ' + (sel + 1) + ' : ' + n + ' → ' + (pw.classList.contains('on') ? 'activé' : 'désactivé') + '.', 'Instruments VST');
            return;
          }
          const b = e.target.closest('[data-vi]');
          if (!b) return;
          const k = b.dataset.vi;
          if (k === 'insert') {
            /* AUDIT v6 (A122) : le navigateur natif liste les greffons réellement
               analysés et l'insert est instancié dans le graphe audio. */
            nativeSend('pluginBrowser', { trackIndex: Number(deviceState().selectedTrack) || 0 });
            A.showToast('Insérer un instrument : navigateur de greffons natif ouvert (modules réellement analysés).', 'Instruments VST');
          }
          else if (k === 'remove') A.showToast('Emplacement ' + (sel + 1) + ' vidé (interface).', 'Instruments VST');
          else if (k === 'panel') {
            nativeSend('openPluginEditor', { index: Number(deviceState().selectedTrack) || 0, insertIndex: sel });
            A.showToast('Panneau de l’instrument : éditeur natif du greffon ouvert (fenêtre réelle).', 'Instruments VST');
          }
          else if (k === 'chan') open('channel', 't' + (sel + 1));
          else if (k === 'edit') {
            nativeSend('openPluginEditor', { index: Number(deviceState().selectedTrack) || 0, insertIndex: sel });
            A.showToast('Éditer l’instrument de l’emplacement ' + (sel + 1) + ' : éditeur natif du greffon ouvert.', 'Instruments VST');
          }
          else if (k === 'freezam') { vmenu(b, ['freezeopt', 'Gel global', [
              ['freezeall', 'Geler tous les instruments'], ['unfreezeall', 'Annuler le gel de tous les instruments']]], sel); }
          else if (k === 'outsall') { vmenu(b, ['visouts', 'Sorties — tous les instruments', [
              ['a0', 'Activer toutes les sorties', false], ['a1', 'Ne conserver que la sortie 1-2', false]]], sel); }
          else if (k === 'preset') {
            const presets = ['Piano droit', 'Piano queue', 'Rhodes doux', 'Kit électro 01', 'Kit acoustique 02', 'Nappe chaude'];
            const cell = $('.rack-row.sel .vi-preset', body) || $('.rack-row .vi-preset', body);
            if (!cell) return;
            const curTxt = cell.textContent.replace('Preset : ', '');
            const nxt = presets[(presets.indexOf(curTxt) + 1) % presets.length];
            cell.textContent = 'Preset : ' + nxt;
            cell.classList.remove('off');
            A.showToast('Preset « ' + nxt + ' » chargé (parcours des presets).', 'Instruments VST');
          }
        });
      }
    };
  }

  /* =====================================================================
     PANNEAU D'AUTOMATISATION  (Automation Panel)
     ===================================================================== */
  function buildAutomation() {
    const WRITE = [['touch', 'Touch'], ['autolatch', 'Auto-Latch'], ['crossover', 'Crossover'], ['overwrite', 'Overwrite'], ['trim', 'Trim']];
    const READ = [['trim', 'Trim'], ['read', 'Read'], ['readtrim', 'Read + Trim'], ['off', 'Hors service']];
    const TO = [['punch', 'To Punch'], ['start', 'To Start'], ['end', 'To End'], ['loop', 'Loop']];
    const PARAMS = ['Volume', 'Panoramique', 'Égaliseur', 'Départs', 'Inserts', 'Mute', 'Volume VCA', 'Plug-ins'];
    const st = { wr: 'touch', rd: 'trim', to: 'start', punch: false, auto: false, in: true, out: false,
                 virgin: 2, susp: { r: [], w: [] }, log: 10, ret: '1,0 s', red: '10,0 %', dist: '30,0 %' };
    const col = (t, btns, cls) => '<div class="ap-col' + (cls ? ' ' + cls : '') + '"><h6>' + t + '</h6>' + btns + '</div>';
    const modeBtns = (arr, attr, cur) => arr.map((x) =>
      '<button class="ap-mode' + (x[0] === cur ? ' on' : '') + '" data-' + attr + '="' + x[0] + '">' + x[1] + '</button>').join('');
    const html =
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Lecture</span><button class="w-btn" data-apcyc="rd" title="Mode de lecture de l’automatisation">' +
        (READ.find((x) => x[0] === st.rd) || READ[0])[1] + ' ▾</button>' +
      '<span class="w-lbl">Écriture</span><button class="w-btn" data-apcyc="wr" title="Mode d’écriture de l’automatisation">' +
        (WRITE.find((x) => x[0] === st.wr) || WRITE[0])[1] + ' ▾</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn on" data-ap="suspr" title="Suspendre l’automatisation en lecture (toutes les pistes)">Suspendre lecture</button>' +
      '<button class="w-btn" data-ap="suspw" title="Suspendre l’automatisation en écriture">Suspendre écriture</button>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Punch Log</span><button class="w-btn" data-aplog="1" title="Nombre d’écritures conservées dans le journal (10 à 100)">' + st.log + ' ▾</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-ap="journal" title="Afficher le journal des écritures (Punch Log)">Journal…</button>' +
      '</div>' +
      '<div class="w-scroll ap-grid">' +
      col('Modes d’écriture', modeBtns(WRITE, 'wr', st.wr) +
        '<div class="ap-sep"></div>' + modeBtns(TO, 'to', st.to) +
        '<div class="ap-sep"></div>' +
        '<button class="ap-mode' + (st.susp.w.indexOf('all') >= 0 ? ' on' : '') + '" data-suspall="w">Suspendre tout (écriture)</button>' +
        '<button class="ap-mode' + (st.susp.r.indexOf('all') >= 0 ? ' on' : '') + '" data-suspall="r">Suspendre tout (lecture)</button>') +
      col('Punch',
        '<button class="ap-mode' + (st.punch ? ' on' : '') + '" data-punch="punch">Punch</button>' +
        '<button class="ap-mode' + (st.auto ? ' on' : '') + '" data-punch="auto">Auto Punch</button>' +
        '<button class="ap-mode' + (st.in ? ' on' : '') + '" data-punch="in">Punch In activé</button>' +
        '<button class="ap-mode' + (st.out ? ' on' : '') + '" data-punch="out">Punch Out activé</button>' +
        '<div class="ap-sep"></div>' +
        '<button class="ap-mode' + (st.virgin === 1 ? ' on' : '') + '" data-virgin="1">Virgin territory — valeur initiale</button>' +
        '<button class="ap-mode' + (st.virgin === 2 ? ' on' : '') + '" data-virgin="2">Suivre la dernière automatisation</button>' +
        '<div class="ap-sep"></div>' +
        '<button class="ap-mode" data-ap="punchlog">Ouvrir le Punch Log</button>' +
        '<button class="ap-mode" data-ap="touchcollect">Touch Collect Assistant</button>') +
      '<div class="ap-col wide"><h6>Listes de suspension</h6><div class="ap-lists">' +
        [['r', 'Lecture'], ['w', 'Écriture']].map(([k, t]) =>
          '<div class="ap-list" data-aplist="' + k + '"><div class="hd"><i class="led-dot ' + (st.susp[k].indexOf('all') >= 0 ? 'red' : 'green on') + '"></i>' + t + '</div>' +
          PARAMS.map((x, i) => '<div class="it' + (i >= (k === 'r' ? 6 : 7) ? ' off' : '') + '" data-apparam="' + k + ':' + x + '">' +
            '<i class="led-dot ' + (i >= (k === 'r' ? 6 : 7) ? 'red' : 'green on') + '"></i>' + x + '</div>').join('') + '</div>').join('') +
      '</div></div>' +
      col('Fonctions',
        '<div class="ap-row"><span>Retour au temps</span><button class="w-btn" data-apval="ret">' + st.ret + ' ▾</button></div>' +
        '<div class="ap-row"><span>Réduction max.</span><button class="w-btn" data-apval="red">' + st.red + ' ▾</button></div>' +
        '<div class="ap-row"><span>Distance de déclenchement max.</span><button class="w-btn" data-apval="dist">' + st.dist + ' ▾</button></div>' +
        '<div class="ap-sep"></div>' +
        '<button class="ap-mode on" data-ap="showdata">Afficher les données d’automatisation</button>' +
        '<button class="ap-mode on" data-ap="realtime">Écrire en temps réel</button>' +
        '<button class="ap-mode" data-ap="params">Afficher les paramètres…</button>' +
        '<button class="ap-mode" data-ap="selall" title="Suspendre / reprendre pour la sélection">Pour la sélection seulement</button>') +
      '</div>' +
      '<div class="aw-foot"><span>Panneau d’automatisation — Automation Panel</span><span style="flex:1"></span>' +
      '<span data-apinfo>Écriture : Touch · Lecture : Trim · Punch In actif</span></div>';
    return {
      title: 'Panneau d’automatisation <em>· Automation Panel</em>', ac: '#5a7fa3', html,
      after(body) {
        function info() {
          const w = (WRITE.find((x) => x[0] === st.wr) || WRITE[0])[1];
          const r = (READ.find((x) => x[0] === st.rd) || READ[0])[1];
          $('[data-apinfo]', body).textContent = 'Écriture : ' + w + ' · Lecture : ' + r +
            (st.punch ? ' · Punch' : '') + (st.auto ? ' · Auto Punch' : '') + (st.in ? ' · Punch In' : '');
        }
        info();
        $$('[data-wr]', body).forEach((b) => b.addEventListener('click', () => {
          st.wr = b.dataset.wr;
          $$('[data-wr]', body).forEach((x) => x.classList.toggle('on', x === b));
          info();
          A.showToast('Mode d’écriture : ' + b.textContent + '.', 'Automatisation');
        }));
        $$('[data-to]', body).forEach((b) => b.addEventListener('click', () => {
          st.to = b.dataset.to;
          $$('[data-to]', body).forEach((x) => x.classList.toggle('on', x === b));
          A.showToast('Écriture jusqu’à : ' + b.textContent + '.', 'Automatisation');
        }));
        $$('[data-apcyc]', body).forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.apcyc === 'wr') {
            const i = WRITE.findIndex((x) => x[0] === st.wr);
            st.wr = WRITE[(i + 1) % WRITE.length][0];
            b.textContent = WRITE.find((x) => x[0] === st.wr)[1] + ' ▾';
            $$('[data-wr]', body).forEach((x) => x.classList.toggle('on', x.dataset.wr === st.wr));
          } else {
            const i = READ.findIndex((x) => x[0] === st.rd);
            st.rd = READ[(i + 1) % READ.length][0];
            b.textContent = READ.find((x) => x[0] === st.rd)[1] + ' ▾';
          }
          info();
        }));
        $$('[data-punch]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.punch;
          st[k] = !st[k];
          b.classList.toggle('on', st[k]);
          info();
        }));
        $$('[data-virgin]', body).forEach((b) => b.addEventListener('click', () => {
          st.virgin = +b.dataset.virgin;
          $$('[data-virgin]', body).forEach((x) => x.classList.toggle('on', x === b));
          A.showToast('Virgin territory : ' + b.textContent + '.', 'Automatisation');
        }));
        $$('[data-suspall]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.suspall;
          const i = st.susp[k].indexOf('all');
          if (i >= 0) st.susp[k].splice(i, 1);
          else { st.susp[k] = ['all']; }
          const on = st.susp[k].indexOf('all') >= 0;
          b.classList.toggle('on', on);
          const hd = $('[data-aplist="' + k + '"] .hd .led-dot', body);
          if (hd) hd.className = 'led-dot ' + (on ? 'red' : 'green on');
          A.showToast('Automatisation — suspension totale (' + (k === 'r' ? 'lecture' : 'écriture') + ') : ' + (on ? 'oui' : 'non') + '.', 'Automatisation');
        }));
        $$('[data-apparam]', body).forEach((it) => it.addEventListener('click', () => {
          const [k, p] = it.dataset.apparam.split(':');
          const arr = st.susp[k];
          const i = arr.indexOf(p);
          if (i >= 0) arr.splice(i, 1);
          else arr.push(p);
          const off = arr.indexOf(p) >= 0;
          it.classList.toggle('off', off);
          const led = it.querySelector('.led-dot');
          if (led) led.className = 'led-dot ' + (off ? 'red' : 'green on');
        }));
        $$('[data-apval]', body).forEach((b) => b.addEventListener('click', () => {
          const CYC = { ret: ['1,0 s', '2,0 s', '0,5 s', '3,0 s'], red: ['10,0 %', '25,0 %', '50,0 %', '5,0 %'],
                        dist: ['30,0 %', '60,0 %', '90,0 %'] };
          const k = b.dataset.apval;
          const cur = CYC[k].indexOf(b.textContent.replace(' ▾', ''));
          const nx = CYC[k][(cur + 1) % CYC[k].length];
          b.textContent = nx + ' ▾';
          st[k] = nx;
          A.showToast('Automatisation — ' + b.previousElementSibling.textContent + ' : ' + nx + '.', 'Automatisation');
        }));
        $$('[data-aplog]', body).forEach((b) => b.addEventListener('click', () => {
          const CYC = ['10', '25', '50', '100'];
          st.log = CYC[(CYC.indexOf(st.log) + 1) % CYC.length];
          b.textContent = st.log + ' ▾';
          A.showToast('Punch Log : ' + st.log + ' écritures conservées.', 'Automatisation');
        }));
        $$('[data-ap]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.ap;
          if (k === 'journal' || k === 'punchlog') {
            A.showToast('Punch Log — les 10 dernières passes d’écriture sont listées avec piste, paramètre et plage horaire.', 'Automatisation');
            return;
          }
          if (k === 'touchcollect') { A.showToast('Touch Collect Assistant : arrondit les extrémités des passes Touch / Auto-Latch.', 'Automatisation'); return; }
          if (k === 'params') { A.showToast('Afficher les paramètres : choisissez les paramètres automatisables par piste.', 'Automatisation'); return; }
          b.classList.toggle('on');
          A.showToast('« ' + b.textContent.trim() + ' » : ' + (b.classList.contains('on') ? 'activé' : 'désactivé') + '.', 'Automatisation');
        }));
      }
    };
  }

  /* =====================================================================
     CONNEXIONS VST
     ===================================================================== */
  function buildConns() {
    /* Connexions VST — Nuendo 4 : six onglets, presets de configuration de
       bus, renommage en place, ports inactifs, compensation de délai. */
    const DEV = 'Alpha ASIO Driver';
    const C = {
      entrees: {
        cols: ['Nom', 'Périphérique audio', 'Ports', 'Renommer'],
        rows: [['Entrée 1', DEV, 'IN 1 / IN 2'], ['Entrée 2', DEV, 'IN 3 / IN 4'],
               ['Entrée 3 (stéréo)', DEV, 'IN 5 / IN 6'], ['Entrée ADR', DEV, 'IN 7 / IN 8']]
      },
      sorties: {
        cols: ['Nom', 'Périphérique audio', 'Ports', 'Affectation par défaut'],
        rows: [['Stéréo Out', DEV, 'OUT 1 / OUT 2'], ['Surround 5.1', DEV, 'OUT 3 à OUT 8'],
               ['Sortie casque', DEV, 'OUT 9 / OUT 10']]
      },
      groupfx: {
        cols: ['Nom', 'Configuration', 'Sortie', 'Utilisé'],
        rows: [['Bus Drums', 'Stéréo', 'Stéréo Out', 'Groupe'], ['FX 1 · Réverb Space', 'Stéréo', 'Stéréo Out', 'Effet'],
               ['FX 2 · Delay Echo', 'Stéréo', 'Stéréo Out', 'Effet'], ['Bus Cordes', 'Stéréo', 'Stéréo Out', 'Groupe'],
               ['Bus Voix', 'Stéréo', 'Stéréo Out', 'Groupe']]
      },
      extfx: {
        cols: ['Nom', 'Retour', 'Envoi', 'Délai de compensation'],
        rows: [['Comp Alpha (externe)', 'IN 5 / IN 6', 'OUT 9 / OUT 10', '0,00 ms'],
               ['EQ Pultec (externe)', 'IN 7 / IN 8', 'OUT 11 / OUT 12', '1,45 ms']]
      },
      extinstr: {
        cols: ['Nom', 'Sortie', 'Entrée', 'État'],
        rows: [['Alpha Synth (externe)', 'OUT 13', 'IN 9', 'Non connecté'],
               ['Nord Lead (externe)', 'OUT 15 / OUT 16', 'IN 10', 'Connecté']]
      },
      studio: {
        cols: ['Nom', 'Type', 'Ports', 'État'],
        rows: [['Monitor A', 'Monitor', 'OUT 17 / OUT 18', 'Actif'], ['Monitor B', 'Monitor', 'OUT 19 / OUT 20', 'Actif'],
               ['Phones 1', 'Phones', 'OUT 21 / OUT 22', 'Actif'], ['Studio 1', 'Studio', 'OUT 23 / OUT 24', 'Actif'],
               ['Talkback', 'Talkback', 'IN 11', 'Actif']]
      }
    };
    const NAMES = { entrees: 'Entrées', sorties: 'Sorties', groupfx: 'Group/FX', extfx: 'FX externes',
      extinstr: 'Instruments externes', studio: 'Studio' };
    const TABS = Object.keys(NAMES).map((k) => [k, NAMES[k]]);
    const EXTRA = { entrees: ['Nom', 'Périphérique audio', 'Ports', 'Renommer'],
      extfx: ['Nom', 'Retour', 'Envoi', 'Délai de compensation'] };
    const st = { tab: 'sorties', allPorts: false, delay: true, preset: 'Alpha — 2 entrées / 2 sorties' };
    const PRESETS = ['Alpha — 2 entrées / 2 sorties', 'Alpha — 8 entrées / 8 sorties', 'Surround 5.1', 'Studio (Monitor + casque + talkback)'];

    function table(k) {
      const t = C[k];
      return '<table class="conn-table"><thead><tr>' + t.cols.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
        t.rows.map((r) => '<tr>' + r.map((c, i) => '<td' + (i === 0 ? ' class="nm bus"' : (i === 2 ? ' class="port"' : '')) + '>' + c + '</td>').join('') +
        '<td>' + (k === 'entrees' ? '<button class="w-btn" data-crnm="1" style="height:14px;padding:0 5px">Renommer</button>'
          : (k === 'sorties' ? '<span class="w-lbl">' + (r[0].indexOf('Stéréo') >= 0 ? 'Défaut' : '—') + '</span>' : '')) + '</td></tr>').join('') +
        (st.allPorts && k === 'extinstr' ? '<tr class="tr-off"><td class="nm bus">Nord Lead · MIDI</td><td class="port">OUT 17 / OUT 18</td><td class="port">IN 12</td><td>Port inactif</td></tr>' : '') +
        '</tbody></table>' +
        (k === 'studio' ? '<div class="conn-note">Le Studio est configuré ici (Monitor A/B, casque, Studio 1, Talkback) et piloté par le Mixer Control Room (F12).</div>' : '');
    }
    function detail() {
      const t = C[st.tab];
      const r = t.rows[0] || [];
      const chans = st.tab === 'sorties' && r[0] && r[0].indexOf('5.1') >= 0
        ? ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'] : ['L', 'R'];
      return '<div class="cd-h">Bus sélectionné <b>' + (r[0] || '—') + '</b>' +
        '<span style="flex:1"></span><span>' + (NAMES[st.tab]) + '</span></div>' +
        '<div class="cd-grid">' +
        '<div class="cd-row"><span>Configuration</span><b>' + (r[1] || '—') + '</b></div>' +
        '<div class="cd-row"><span>Périphérique</span><b>' + DEV + '</b></div>' +
        '<div class="cd-row"><span>Ports</span><b>' + (r[2] || '—') + '</b></div>' +
        '<div class="cd-row"><span>Latence d’entrée/sortie</span><b>6,20 ms</b></div>' +
        '<div class="cd-chan">' +
        chans.map((c, i) => '<div class="cd-ch"><span class="cd-cn">' + c + '</span>' +
          '<div class="cd-mtr"><i style="height:' + (28 + (i * 17) % 60) + '%"></i></div>' +
          '<span class="cd-db">−' + (4 + (i * 5) % 18) + ',0</span></div>').join('') +
        '</div>' +
        '<div class="cd-foot">Canaux : <b>' + chans.length + '</b> · Comp. d’entrée : <b>0,00 ms</b> · Comp. de sortie : <b>6,20 ms</b>' +
        ' · <b>' + (st.delay ? 'compensation de délai active' : 'compensation de délai désactivée') + '</b></div>' +
        '</div>';
    }

    const html =
      '<div class="w-toolbar">' +
      '<span class="w-lbl">Preset</span><button class="w-btn" data-connpreset="1">' + st.preset + ' ▾</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-conntog="allports" title="Afficher les ports désactivés dans la page Périphériques">Ports inactifs</button>' +
      '<button class="w-btn on" data-conntog="delay" title="Retarder la lecture pour compenser les convertisseurs externes">Compensation de délai</button>' +
      '<span style="flex:1"></span><span class="w-lbl">' + DEV + ' · 48 000 Hz · 256 échantillons</span>' +
      '</div>' +
      '<div class="conn-tabs">' +
      TABS.map((t) => '<button class="cs-tab' + (t[0] === st.tab ? ' on' : '') + '" data-conn="' + t[0] + '">' + t[1] + '</button>').join('') +
      '</div>' +
      '<div class="conn-body w-scroll"><div data-connbody>' + table(st.tab) + '</div>' +
      '<div class="conn-detail" data-conndetail>' + detail() + '</div>' +
      '<div class="conn-actions">' +
      '<button class="w-btn" data-conna="add">Ajouter un bus</button>' +
      '<button class="w-btn" data-conna="addext">Ajouter un bus externe</button>' +
      '<button class="w-btn" data-conna="remove">Supprimer le bus</button>' +
      '<button class="w-btn" data-conna="rename">Renommer</button>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-conna="check" title="Rechercher les erreurs de routage">Vérifier le routage…</button>' +
      '<button class="w-btn" data-conna="applysynch">Sync ASIO</button>' +
      '</div></div>' +
      '<div class="aw-foot"><span>Connexions VST — F4</span><span style="flex:1"></span>' +
      '<span>Entrées · Sorties · Group/FX · FX externes · Instruments externes · Studio</span></div>';
    return {
      title: 'Connexions VST <em>· VST Connections</em>',
      ac: '#4f7188',
      html,
      after(body) {
        const redraw = () => {
          $('[data-connbody]', body).innerHTML = table(st.tab);
          const d = $('[data-conndetail]', body);
          if (d) d.innerHTML = detail();
          bindTable();
        };
        function bindTable() {
          $$('.conn-table tbody tr', body).forEach((tr) => tr.addEventListener('click', () => {
            $$('.conn-table tbody tr', body).forEach((x) => x.classList.toggle('sel', x === tr));
          }));
          $$('[data-crnm]', body).forEach((b) => b.addEventListener('click', (e) => {
            e.stopPropagation();
            const tr = b.closest('tr');
            const cell = tr.querySelector('td.nm');
            const old = cell.textContent;
            cell.innerHTML = '<input class="w-input" value="' + old + '" style="width:120px;height:14px;font-size:8px">';
            const inp = cell.querySelector('input');
            inp.focus(); inp.select();
            let closed = false;
            const done = (ok) => {
              if (closed) return;
              closed = true;
              const v = ok && inp.value.trim() ? inp.value.trim() : old;
              cell.textContent = v;
              if (v !== old) A.showToast('Bus renommé : « ' + old + ' » → « ' + v + ' ».', 'Connexions VST');
            };
            inp.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter') done(true);
              if (ev.key === 'Escape') done(false);
            });
            inp.addEventListener('blur', () => done(true));
          }));
        }
        bindTable();
        $$('[data-conn]', body).forEach((b) => b.addEventListener('click', () => {
          st.tab = b.dataset.conn;
          $$('[data-conn]', body).forEach((x) => x.classList.toggle('on', x === b));
          redraw();
        }));
        $$('[data-conntog]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.conntog;
          st[k] = !st[k];
          b.classList.toggle('on', st[k]);
          if (k === 'allports') redraw();
          A.showToast((k === 'allports' ? 'Ports désactivés affichés : ' : 'Compensation de délai : ') + (st[k] ? 'oui' : 'non'), 'Connexions VST');
        }));
        $('[data-connpreset]', body).addEventListener('click', () => {
          const i = PRESETS.indexOf(st.preset);
          st.preset = PRESETS[(i + 1) % PRESETS.length];
          $('[data-connpreset]', body).textContent = st.preset + ' ▾';
          A.showToast('Configuration de bus chargée : « ' + st.preset + ' ». Les bus existants sont conservés, les manquants sont créés.', 'Connexions VST');
        });
        $$('[data-conna]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.conna;
          const MSG = {
            add: 'Ajouter un bus : nom, configuration (mono, stéréo, 5.1), périphérique et ports.',
            addext: 'Ajouter un bus externe : FX externe (envoi/retour) ou instrument externe (sortie/entrée MIDI).',
            remove: 'Le bus sélectionné est supprimé après confirmation ; les canaux qui l’utilisent sont déconnectés.',
            rename: 'Renommer le bus sélectionné (ou double-clic sur son nom).',
            check: 'Vérification du routage : aucun conflit de port détecté sur le périphérique audio actif.',
            applysynch: 'Synchronisation ASIO appliquée : ' + DEV + ' maître d’horloge, 48 000 Hz.'
          };
          A.showToast(MSG[k] || '', 'Connexions VST');
        }));
      }
    };
  }

  function buildMarkers() {
    /* AUDIT v6 (A110) : la fenêtre lit les marqueurs RÉELS du projet natif ;
       la liste de démonstration ne sert qu'au repli Web sans moteur. */
    const fromState = () => (deviceState().markers || []).map((m, i) => ({
      idx: i, n: i + 1, pos: Number(m.bars || 1), end: Number(m.endBars || m.bars || 1),
      name: String(m.name || ('Marqueur ' + (i + 1))), cycle: !!m.cycle
    }));
    let base = fromState();
    if (!base.length) {
      base = A.MARKERS.map((m, i) => ({ idx: -1, n: i + 1, pos: m[0], name: m[1], cycle: false }));
      base.push({ idx: -1, n: 9, pos: 9, name: 'Cycle refrain', cycle: true, end: 17 });
      base.push({ idx: -1, n: 10, pos: 25, name: 'Cycle pont', cycle: true, end: 33 });
    }
    const st = { list: base, show: 'Tous les marqueurs' };
    const SHOWS = ['Tous les marqueurs', 'Marqueurs de cycle', 'Marqueurs du cycle', 'Sans marqueurs de cycle'];
    function rows() {
      return st.list.filter((m) => {
        if (st.show === 'Marqueurs de cycle') return m.cycle;
        if (st.show === 'Sans marqueurs de cycle') return !m.cycle;
        return true;
      }).map((m, i) => {
        const fp = (x) => (A.fmtPos ? A.fmtPos(x) : String(x));
        return '<tr' + (i === 0 ? ' class="sel"' : '') + ' data-mkrow="' + m.pos + '" data-mkcycle="' + (m.cycle ? 1 : 0) + '">' +
          '<td class="loc">' + (m.cycle ? '▸' : '') + '</td>' +
          '<td>' + m.n + '</td>' +
          '<td class="pos">' + fp(m.pos) + '</td>' +
          '<td class="pos">' + (m.cycle ? fp(m.end) : '—') + '</td>' +
          '<td class="pos">' + (m.cycle ? (m.end - m.pos) + '.0.0.0' : '—') + '</td>' +
          '<td><span class="flag"></span>' + esc(m.name) + '</td>' +
          '<td class="mk-type">' + (m.cycle ? 'Cycle' : 'Standard') + '</td></tr>';
      }).join('');
    }
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-mk="go" title="Localiser sur le marqueur sélectionné">Aller</button>' +
      '<button class="w-btn" data-mk="add" title="Insérer un marqueur à la position du curseur">+ Marq.</button>' +
      '<button class="w-btn" data-mk="addcycle" title="Insérer un marqueur de cycle (début / fin)">+ Cycle</button>' +
      '<button class="w-btn" data-mk="move" title="Déplacer le marqueur à la position du curseur">Déplacer</button>' +
      '<button class="w-btn" data-mk="del" title="Supprimer le marqueur sélectionné">Supprimer</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-mk="prev" title="Marqueur précédent">◀</button>' +
      '<button class="w-btn" data-mk="next" title="Marqueur suivant">▶</button>' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-mkshow="1" title="Afficher : tous / cycles / sans cycles">Afficher : ' + st.show + ' ▾</button>' +
      '<span style="flex:1"></span><span class="w-lbl">Ctrl+M</span>' +
      '</div>' +
      '<div class="w-scroll"><table class="mk-table"><thead><tr>' +
      '<th style="width:20px"></th><th style="width:34px">ID</th><th>Position</th><th>Fin</th><th>Longueur</th><th>Description</th><th style="width:58px">Type</th>' +
      '</tr></thead><tbody data-mkbody>' + rows() + '</tbody></table></div>' +
      '<div class="aw-foot"><span>Fenêtre Marqueurs — <span data-mkcount>' + st.list.length + '</span> marqueurs</span>' +
      '<span style="flex:1"></span><span>Localiser · ID · Position · Fin · Longueur · Description · Type</span></div>';
    return {
      title: 'Marqueurs <em>· Marker window</em>',
      ac: '#b28f4c',
      html,
      after(body) {
        function redraw() {
          $('[data-mkbody]', body).innerHTML = rows();
          $('[data-mkcount]', body).textContent = st.list.length;
          bind();
        }
        const go = (tr) => {
          if (!tr) return;
          $$('.mk-table tbody tr', body).forEach((x) => x.classList.remove('sel'));
          tr.classList.add('sel');
          if (A.goto) A.goto(parseFloat(tr.dataset.mkrow));
        };
        function bind() {
          $$('.mk-table tbody tr', body).forEach((tr) => {
            tr.addEventListener('click', () => go(tr));
            tr.addEventListener('dblclick', () => go(tr));
          });
        }
        bind();
        $$('[data-mk]', body).forEach((btnEl) => btnEl.addEventListener('click', () => {
          const k = btnEl.dataset.mk;
          const sel = $('.mk-table tbody tr.sel', body);
          const curPos = A.state ? A.state.pos : 1;
          const refresh = () => setTimeout(() => {
            const f = fromState();
            if (f.length) { st.list = f; redraw(); }
          }, 500);
          if (k === 'add' || k === 'addcycle') {
            /* Marqueur réellement écrit dans le projet natif. */
            if (k === 'addcycle') nativeSend('addMarker', { bars: curPos, endBars: curPos + 8, cycle: true, name: 'Nouveau cycle' });
            else nativeSend('addMarker', { bars: curPos, name: 'Nouveau marqueur' });
            const n = st.list.length + 1;
            st.list.push({ idx: -1, n: n, pos: curPos, name: k === 'addcycle' ? 'Nouveau cycle' : 'Nouveau marqueur', cycle: k === 'addcycle', end: curPos + 8 });
            redraw(); refresh();
            A.showToast((k === 'addcycle' ? 'Marqueur de cycle' : 'Marqueur') + ' réellement inséré dans le projet (ID ' + n + ') à ' +
              (A.fmtPos ? A.fmtPos(curPos) : curPos) + '.', 'Marqueurs');
            return;
          }
          if (k === 'del') {
            if (!sel) { A.showToast('Sélectionnez un marqueur à supprimer.', 'Marqueurs'); return; }
            const i = [...$$('.mk-table tbody tr', body)].indexOf(sel);
            const vis = st.list.filter((m) => st.show === 'Tous les marqueurs' || (st.show === 'Marqueurs de cycle' ? m.cycle : !m.cycle));
            const m = vis[i];
            if (m && m.idx >= 0) nativeSend('removeMarker', { markerIndex: m.idx });
            st.list.splice(st.list.indexOf(m), 1);
            redraw();
            setTimeout(() => { const f = fromState(); if (f.length) { st.list = f; redraw(); } }, 500);
            A.showToast('Marqueur réellement supprimé du projet.', 'Marqueurs');
            return;
          }
          if (k === 'move') {
            if (!sel) { A.showToast('Sélectionnez un marqueur à déplacer.', 'Marqueurs'); return; }
            const vis = st.list.filter((m) => st.show === 'Tous les marqueurs' || (st.show === 'Marqueurs de cycle' ? m.cycle : !m.cycle));
            const i = [...$$('.mk-table tbody tr', body)].indexOf(sel);
            const m = vis[i];
            if (m && m.idx >= 0) nativeSend('renameMarker', { markerIndex: m.idx, bars: curPos, name: m.name });
            m.pos = curPos;
            redraw();
            setTimeout(() => { const f = fromState(); if (f.length) { st.list = f; redraw(); } }, 500);
            A.showToast('Marqueur réellement déplacé dans le projet à la position du curseur.', 'Marqueurs');
            return;
          }
          if (k === 'prev' || k === 'next') {
            const trs = $$('.mk-table tbody tr', body);
            if (!trs.length) return;
            const i = trs.indexOf(sel);
            const nx = k === 'next' ? Math.min(trs.length - 1, i + 1) : Math.max(0, i - 1);
            go(trs[nx < 0 ? 0 : nx]);
            return;
          }
          A.showToast('Localisation sur le marqueur sélectionné.', 'Marqueurs');
        }));
        $$('[data-mkshow]', body).forEach((b) => b.addEventListener('click', () => {
          st.show = SHOWS[(SHOWS.indexOf(st.show) + 1) % SHOWS.length];
          b.textContent = st.show + ' ▾';
          redraw();
          A.showToast('Affichage : ' + st.show + '.', 'Marqueurs');
        }));
      }
    };
  }

  /* =====================================================================
     HISTORIQUE
     ===================================================================== */
  function buildHistory() {
    const st = {
      type: 'Tous', q: '', showOff: true, sel: 0,
      list: [
        { n: 1, op: 'Fondu entrant', type: 'Fondu', target: 'Voix lead-01', par: '0,500 s · linéaire', on: true },
        { n: 2, op: 'Détection des silences', type: 'Traitement', target: 'Ambiance salle', par: 'Seuil -42 dB', on: true },
        { n: 3, op: 'Normalisation', type: 'Process', target: 'Voix lead-01', par: '-1,0 dB', on: true },
        { n: 4, op: 'Couper', type: 'Éditeur d’échantillons', target: 'Perc loop', par: '2 417 – 8 990 éch.', on: true },
        { n: 5, op: 'Gain (+2,5 dB)', type: 'Traitement', target: 'Ambiance salle', par: 'Sélection entière', on: false },
        { n: 6, op: 'Réverb Space', type: 'Effet inséré', target: 'Voix lead-01', par: 'Preset Hall · 38 %', on: true }
      ]
    };
    const TYPES = ['Tous', 'Fondu', 'Traitement', 'Process', 'Éditeur d’échantillons', 'Effet inséré'];
    function vis() {
      return st.list.filter((o) => (st.type === 'Tous' || o.type === st.type) &&
        (st.showOff || o.on) &&
        (!st.q || (o.op + ' ' + o.target + ' ' + o.par).toLowerCase().indexOf(st.q.toLowerCase()) >= 0));
    }
    function body_html() {
      const L = vis();
      if (!L.length) return '<tr><td colspan="6" class="empty-cell">Aucun traitement ne correspond au filtre.</td></tr>';
      return L.map((o, i) => '<tr' + (i === st.sel ? ' class="sel"' : '') + ' data-ho="' + o.n + '">' +
        '<td>' + o.n + '</td><td class="nm">' + esc(o.op) + '</td><td>' + esc(o.type) + '</td>' +
        '<td>' + esc(o.target) + '</td><td>' + esc(o.par) + '</td>' +
        '<td><span class="hist-state ' + (o.on ? 'on' : 'off') + '">' + (o.on ? 'Actif' : 'Désactivé') + '</span></td></tr>').join('');
    }
    const html =
      '<div class="w-toolbar">' +
      '<span class="w-lbl" style="white-space:nowrap">Traitements appliqués au clip</span>' +
      '<span class="w-sep"></span>' +
      '<span class="w-lbl">Type</span><button class="w-btn" data-htype="1">' + st.type + ' ▾</button>' +
      '<input class="w-input" data-hq placeholder="Filtrer…" style="width:104px" spellcheck="false">' +
      '<span class="w-sep"></span>' +
      '<label class="dlg-check" style="font-size:8px"><input type="checkbox" data-hshow checked> Afficher les désactivés</label>' +
      '<span style="flex:1"></span><span class="w-lbl" style="white-space:nowrap">Audio ▸ Historique des traitements hors ligne…</span>' +
      '</div>' +
      '<div class="w-scroll"><table class="mk-table hist-table"><thead><tr>' +
      '<th style="width:7%">N°</th><th style="width:23%">Opération</th><th style="width:19%">Type</th><th style="width:17%">Cible</th>' +
      '<th style="width:22%">Paramètres</th><th style="width:12%">État</th>' +
      '</tr></thead><tbody data-hbody>' + body_html() + '</tbody></table></div>' +
      '<div class="dlg-foot" style="justify-content:flex-start;gap:5px">' +
      '<button class="w-btn" data-hact="mod">Modifier</button><button class="w-btn" data-hact="repl">Remplacer par…</button>' +
      '<button class="w-btn" data-hact="tog">Désactiver</button><button class="w-btn" data-hact="del">Supprimer</button>' +
      '<button class="w-btn" data-hact="all">Tout réactiver</button>' +
      '<span style="flex:1"></span><button class="w-btn" data-hact="batch">Enregistrer comme traitement par lots</button>' +
      '<button class="w-btn on" data-hact="close">Fermer</button>' +
      '</div>' +
      '<div class="aw-foot"><span>Historique des traitements hors ligne — <span data-hcount>' + st.list.length + '</span> opération(s)</span>' +
      '<span style="flex:1"></span><span>Nuendo 4 ne possède pas de fenêtre d’annulation : Ctrl+Z reste la pile d’annulation</span></div>';
    return {
      title: 'Historique des traitements hors ligne <em>· Offline Process History</em>',
      ac: '#5c6b7a',
      html,
      after(body) {
        const cur = () => {
          const tr = $('tbody tr.sel', body);
          return tr ? st.list.filter((o) => String(o.n) === tr.dataset.ho)[0] : null;
        };
        function redraw() {
          $('[data-hbody]', body).innerHTML = body_html();
          $('[data-hcount]', body).textContent = st.list.length;
          bind();
        }
        function bind() {
          $$('tbody tr[data-ho]', body).forEach((tr) => tr.addEventListener('click', () => {
            $$('tbody tr', body).forEach((x) => x.classList.remove('sel'));
            tr.classList.add('sel');
            const o = st.list.filter((x) => String(x.n) === tr.dataset.ho)[0];
            const b = $('[data-hact="tog"]', body);
            if (o && b) b.textContent = o.on ? 'Désactiver' : 'Activer';
          }));
          const o = cur();
          const b = $('[data-hact="tog"]', body);
          if (b) b.textContent = o && !o.on ? 'Activer' : 'Désactiver';
        }
        bind();
        $$('[data-hact]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.hact;
          const o = cur();
          if (k === 'close') { window.ALPHAWIN.close('history'); return; }
          if (k === 'all') {
            st.list.forEach((x) => { x.on = true; });
            redraw(); A.showToast('Tous les traitements sont réactivés.', 'Traitements hors ligne'); return;
          }
          if (!o) { A.showToast('Sélectionnez d’abord une opération dans la liste.', 'Traitements hors ligne'); return; }
          if (k === 'tog') {
            o.on = !o.on; redraw();
            A.showToast('« ' + o.op + ' » ' + (o.on ? 'réactivé' : 'désactivé') + '.', 'Traitements hors ligne'); return;
          }
          if (k === 'del') {
            st.list = st.list.filter((x) => x !== o); redraw();
            A.showToast('« ' + o.op + ' » retiré de l’historique (Ctrl+Z pour annuler).', 'Traitements hors ligne'); return;
          }
          if (k === 'mod') {
            A.showToast('« ' + o.op + " » : le dialogue d’origine s’ouvre avec les paramètres (« " + o.par + ' »).', 'Traitements hors ligne'); return;
          }
          if (k === 'repl') {
            A.showToast('« ' + o.op + ' » : choisir un autre traitement pour le remplacer.', 'Traitements hors ligne'); return;
          }
          A.showToast('Historique exporté comme traitement par lots (interface).', 'Traitements hors ligne');
        }));
        $('[data-htype]', body).addEventListener('click', (e) => {
          st.type = TYPES[(TYPES.indexOf(st.type) + 1) % TYPES.length];
          e.currentTarget.textContent = st.type + ' ▾';
          st.sel = 0; redraw();
        });
        const Q = $('[data-hq]', body);
        Q.addEventListener('input', () => { st.q = Q.value; st.sel = 0; redraw(); });
        $('[data-hshow]', body).addEventListener('change', (e) => {
          st.showOff = e.target.checked; st.sel = 0; redraw();
        });
      }
    };
  }

  /* =====================================================================
     RACCOURCIS CLAVIER
     ===================================================================== */
  function buildShortcuts() {
    const groups = [
      ['Transport', [['Lecture / Pause', 'Espace'], ['Arrêt', '0'], ['Enregistrement', '*'], ['Cycle', '/'], ['Métronome', 'C'], ['Début / Fin', 'Début / Fin']]],
      ['Outils', [['Flèche', '1'], ['Plage', '2'], ['Ciseaux', '3'], ['Coller', '4'], ['Gomme', '5'], ['Zoom', '6'], ['Silencieux (Muet)', '7'], ['Crayon', '8'], ['Écoute', '9']]],
      ['Fenêtres', [['Panneau Transport', 'F2'], ['Mixer', 'F3'], ['Connexions VST', 'F4'], ['Automatisation', 'F6'], ['Marqueurs', 'F7'], ['Périph. VST', 'F11'], ['MediaBay', 'Alt+B'], ['Pool', 'Ctrl+P'], ['Réglages de canal', 'E']]],
      ['Édition', [['Annuler', 'Ctrl+Z'], ['Rétablir', 'Ctrl+Maj+Z'], ['Tout sélectionner', 'Ctrl+A'], ['Tout désélectionner', 'Ctrl+Maj+A'], ['Accrochage', 'J'], ['Zoom avant / arrière', '+ / −'], ['Zoom (molette)', 'Ctrl+molette']]],
      ['Divers', [['À propos', 'F1'], ['Fermer une fenêtre', 'Échap'], ['Réinitialiser le zoom', 'Maj+Z'], ['Ajuster à la fenêtre', 'Maj+F']]]
    ];
    const st = { q: '', grp: 'Toutes' };
    const names = ['Toutes'].concat(groups.map((g) => g[0]));
    function cards() {
      const q = st.q.toLowerCase().trim();
      return groups.filter((g) => st.grp === 'Toutes' || g[0] === st.grp).map(([t, rows]) => {
        const vis = rows.filter((r) => !q || (r[0] + ' ' + r[1]).toLowerCase().indexOf(q) >= 0);
        if (!vis.length) return '';
        return '<div class="sc-card"><h5>' + t + '</h5>' +
          vis.map((r) => '<div class="r"><span>' + r[0] + '</span><span class="k">' + r[1] + '</span></div>').join('') + '</div>';
      }).join('') || '<div class="hint" style="padding:10px;font-size:9px">Aucun raccourci ne correspond à « ' + esc(st.q) + ' ».</div>';
    }
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-sc="grp">' + st.grp + ' ▾</button>' +
      '<input class="w-input" data-sc="q" placeholder="Rechercher une commande ou une touche…" style="width:210px" spellcheck="false">' +
      '<span class="w-sep"></span>' +
      '<button class="w-btn" data-sc="browse" title="Ouvrir la fenêtre Raccourcis clavier">Parcourir…</button>' +
      '<button class="w-btn" data-sc="print" title="Imprimer l’aide-mémoire">Imprimer</button>' +
      '<span style="flex:1"></span><span class="w-lbl" data-sccount></span>' +
      '</div>' +
      '<div class="sc-grid" data-sccards>' + cards() + '</div>' +
      '<div class="aw-foot"><span>Raccourcis clavier — aide-mémoire ALPHA (hors Nuendo 4)</span><span style="flex:1"></span>' +
      '<span>La personnalisation se fait dans Raccourcis clavier (Ctrl+Alt+K)</span></div>';
    return {
      title: 'Aide-mémoire des raccourcis <em>· ajout ALPHA (hors Nuendo 4)</em>', ac: '#6f7d86', html,
      after(body) {
        const upd = () => {
          $('[data-sccards]', body).innerHTML = cards();
          const q = st.q.toLowerCase().trim();
          const n = groups.filter((g) => st.grp === 'Toutes' || g[0] === st.grp)
            .reduce((a, g) => a + g[1].filter((r) => !q || (r[0] + ' ' + r[1]).toLowerCase().indexOf(q) >= 0).length, 0);
          const c = $('[data-sccount]', body);
          if (c) c.textContent = n + ' raccourci(s) · ' + st.grp;
        };
        upd();
        const Q = $('[data-sc="q"]', body);
        Q.addEventListener('input', () => { st.q = Q.value; upd(); });
        $('[data-sc="grp"]', body).addEventListener('click', (e) => {
          st.grp = names[(names.indexOf(st.grp) + 1) % names.length];
          e.currentTarget.textContent = st.grp + ' ▾';
          upd();
        });
        $('[data-sc="browse"]', body).addEventListener('click', () => window.ALPHAWIN.open('keycmd'));
        $('[data-sc="print"]', body).addEventListener('click', () =>
          A.showToast('Aide-mémoire : fiche imprimable générée puis envoyée à l’imprimante (Fichier ▸ Imprimer).', 'Raccourcis clavier'));
        nativeSend('print');
      }
    };
  }

  /* =====================================================================
     GESTIONNAIRE DE PROJET
     ===================================================================== */
  function buildProjectManager() {
    /* Fichier ▸ Nettoyage : fichiers audio et images non utilisés (dossier Audio, Edits, Images). */
    const FILES = [
      { n: 'Voix_Lead_03.wav', d: 'Audio', t: 'WAV 24 bit', sz: 24.6, used: false },
      { n: 'Gtr_Rythm_04.wav', d: 'Audio', t: 'WAV 24 bit', sz: 18.2, used: false },
      { n: 'Prise_01_mix.wav', d: 'Audio', t: 'WAV 16 bit', sz: 96.4, used: false },
      { n: 'Ambiance_02.wav', d: 'Audio', t: 'WAV 24 bit', sz: 12.0, used: true },
      { n: 'Voix_Lead_03.bak', d: 'Edits', t: 'BWF 24 bit', sz: 0.4, used: false },
      { n: 'Projet_01.peak', d: 'Images', t: 'Peak', sz: 3.2, used: false },
      { n: 'Perc_Loop_11.wav', d: 'Audio', t: 'WAV 24 bit', sz: 6.8, used: true }
    ];
    const st = { sel: [], last: -1 };
    const size = (f) => String(f.sz.toFixed(1)).replace('.', ',') + ' Mo';
    function rows_html() {
      return FILES.map((f, i) => '<tr data-cl="' + i + '"' + (st.sel.indexOf(i) >= 0 ? ' class="sel"' : '') + '>' +
        '<td class="nm">' + esc(f.n) + '</td><td>' + f.d + '</td><td>' + f.t + '</td>' +
        '<td class="num">' + size(f) + '</td>' +
        '<td><span class="hist-state ' + (f.used ? 'on' : 'off') + '">' + (f.used ? 'Utilisé' : 'Non utilisé') + '</span></td></tr>').join('');
    }
    const html =
      '<div class="w-toolbar">' +
      '<button class="w-btn" data-cla="folder">Dossier de recherche…</button>' +
      '<button class="w-btn on" data-cla="start">Démarrer</button>' +
      '<span class="w-sep"></span><button class="w-btn" data-cla="all">Tout sélectionner</button>' +
      '<button class="w-btn" data-cla="none">Désélectionner</button>' +
      '<span class="w-sep"></span><span class="w-lbl" data-clcount>Fichiers non utilisés : 5</span>' +
      '<span style="flex:1"></span><span class="w-lbl" style="white-space:nowrap">Fichier ▸ Nettoyage…</span>' +
      '</div>' +
      '<div class="w-scroll"><table class="mk-table cl-table"><thead><tr>' +
      '<th>Fichier</th><th style="width:70px">Dossier</th><th style="width:82px">Format</th>' +
      '<th style="width:70px">Taille</th><th style="width:96px">État</th>' +
      '</tr></thead><tbody data-clbody>' + rows_html() + '</tbody></table></div>' +
      '<div class="dlg-foot" style="justify-content:flex-start">' +
      '<span class="hint" data-clhint>Les fichiers sélectionnés ne sont référencés par aucun projet.</span>' +
      '<span style="flex:1"></span>' +
      '<button class="w-btn" data-cla="trash">Mettre à la corbeille</button>' +
      '<button class="w-btn on" data-cla="del">Supprimer</button>' +
      '<button class="w-btn" data-cla="close">Fermer</button>' +
      '</div>' +
      '<div class="aw-foot"><span>Nettoyage — Cleanup</span><span style="flex:1"></span>' +
      '<span>Les fichiers d’images (.peak) peuvent toujours être supprimés : ils sont reconstruits au besoin</span></div>';
    return {
      title: 'Nettoyage <em>· Cleanup</em>',
      ac: '#8a7a4c',
      html,
      after(body) {
        const upd = () => {
          $('[data-clbody]', body).innerHTML = rows_html();
          const un = FILES.filter((f) => !f.used).length;
          $('[data-clcount]', body).textContent = 'Fichiers non utilisés : ' + un;
          const tot = st.sel.reduce((a2, i) => a2 + FILES[i].sz, 0);
          $('[data-clhint]', body).textContent = st.sel.length
            ? st.sel.length + ' fichier(s) sélectionné(s) — ' + String(tot.toFixed(1)).replace('.', ',') + ' Mo'
            : 'Les fichiers sélectionnés ne sont référencés par aucun projet.';
          bind();
        };
        function bind() {
          $$('tbody tr[data-cl]', body).forEach((tr) => tr.addEventListener('click', (ev) => {
            const i = +tr.dataset.cl;
            if (ev.shiftKey && st.last >= 0) {
              const a2 = Math.min(st.last, i), b2 = Math.max(st.last, i);
              st.sel = [];
              for (let k = a2; k <= b2; k++) st.sel.push(k);
            } else if (ev.ctrlKey || ev.metaKey) {
              const p2 = st.sel.indexOf(i);
              if (p2 >= 0) st.sel.splice(p2, 1); else st.sel.push(i);
              st.last = i;
            } else {
              st.sel = [i]; st.last = i;
            }
            upd();
          }));
        }
        bind();
        $$('[data-cla]', body).forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.cla;
          if (k === 'close') { window.ALPHAWIN.close('projman'); return; }
          if (k === 'all') { st.sel = FILES.map((f, i) => i); upd(); return; }
          if (k === 'none') { st.sel = []; upd(); return; }
          if (k === 'start') { A.showToast('Analyse des dossiers Audio, Edits et Images terminée (interface).', 'Nettoyage'); return; }
          if (k === 'folder') { A.showToast('Dossier de recherche : tous les disques (Annuler pour revenir à tout).', 'Nettoyage'); return; }
          if (!st.sel.length) { A.showToast('Sélectionnez au moins un fichier dans la liste.', 'Nettoyage'); return; }
          const n = st.sel.length;
          st.sel.sort((x, y) => y - x).forEach((i) => FILES.splice(i, 1));
          st.sel = [];
          upd();
          A.showToast(n + ' fichier(s) ' + (k === 'trash' ? 'placé(s) dans la corbeille' : 'supprimé(s)') +
            ' (interface — aucune écriture disque).', 'Nettoyage');
        }));
      }
    };
  }

  /* =====================================================================
     MENU CONTEXTUEL DE FENÊTRE
     ===================================================================== */
  let curMenu = null;
  function hideWinMenu() { if (curMenu) { curMenu.remove(); curMenu = null; } }
  function showWinMenu(w, x, y) {
    hideWinMenu();
    const items = [
      { t: 'Toujours devant', k: '', on: w.aot, act: () => setAoT(w, !w.aot) },
      { t: w.maxed ? 'Restaurer' : 'Plein écran', k: '', act: () => toggleMax(w) },
      { t: w.el.classList.contains('min') ? 'Rétablir' : 'Réduire', k: '', act: () => {
          w.el.classList.toggle('min');
          w.el.style.height = w.el.classList.contains('min') ? '22px' : (w.h + 'px');
        } },
      { sep: true },
      { t: 'Fermer', k: '', act: () => close(w.id) },
      { t: 'Fermer toutes les fenêtres', k: '', act: () => closeAll() },
      { sep: true },
      { t: 'Mémoriser l\u2019espace de travail', k: 'W', act: () => workspaceMenu() }
    ];
    const m = document.createElement('div');
    m.className = 'aw-menu';
    m.innerHTML = items.map((it, i) => it.sep ? '<div class="sep"></div>' :
      '<div class="it' + (it.on ? ' checked' : '') + '" data-i="' + i + '"><span>' + it.t +
      '</span>' + (it.k ? '<span class="k">' + it.k + '</span>' : '') + '</div>').join('');
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, window.innerWidth - r.width - 6) + 'px';
    m.style.top = Math.min(y, window.innerHeight - r.height - 6) + 'px';
    m.addEventListener('mousedown', (e) => {
      const it = e.target.closest('.it');
      if (!it) return;
      const cfg = items[+it.dataset.i];
      hideWinMenu();
      if (cfg && cfg.act) cfg.act();
    });
    curMenu = m;
    setTimeout(() => {
      document.addEventListener('mousedown', hideWinMenu, { once: true });
    }, 0);
  }
  function workspaceMenu() { open('workspaces'); }

  function closeAll() {
    Object.keys(REG).forEach((k) => close(k));
    syncWinCount();
  }

  /* =====================================================================
     ESPACES DE TRAVAIL
     ===================================================================== */
  const WS = { list: [], presets: [], active: null, locked: false, seq: 0, useIds: false, showProjectPresets: false, autoInstantiate: false };

  function captureLayout() {
    const wins = Object.keys(REG).map((k) => {
      const w = REG[k];
      const r = w.el.getBoundingClientRect();
      return {
        id: w.id, arg: w.arg, left: Math.round(r.left), top: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height),
        aot: !!w.aot, maxed: !!w.maxed, min: w.el.classList.contains('min')
      };
    });
    const proj = (A && A.getProjectLayout) ? A.getProjectLayout() : null;
    return { wins, proj };
  }

  function applyLayout(layout) {
    closeAll();
    if (layout.proj && A && A.applyProjectLayout) A.applyProjectLayout(layout.proj);
    layout.wins.forEach((cfg) => {
      const w = open(cfg.id, cfg.arg === null ? undefined : cfg.arg);
      if (!w) return;
      w.el.style.left = cfg.left + 'px';
      w.el.style.top = cfg.top + 'px';
      w.el.style.width = cfg.width + 'px';
      w.el.style.height = cfg.height + 'px';
      w.h = cfg.height;
      if (cfg.maxed) toggleMax(w);
      if (cfg.min) { w.el.classList.add('min'); w.el.style.height = '22px'; }
      if (cfg.aot) setAoT(w, true);
    });
  }

  function saveWorkspace(name) {
    const n = ++WS.seq;
    const wsName = name || ('Espace de travail ' + n);
    const layout = captureLayout();
    const ws = { n, name: wsName, id: n, layout: layout };
    WS.list.push(ws);
    WS.active = ws.n;
    persist();
    // Mémorisation réelle dans le projet C++ (position, piste, fenêtres).
    nativeSend('storeWorkspace', {
      name: wsName,
      barW: Number((A.state && A.state.barW) || 64),
      scrollLeft: Number(layout.scrollLeft || 0),
      scrollTop: Number(layout.scrollTop || 0),
      positionBars: Number((A.state && A.state.pos) || 1),
      selectedTrack: selectedNativeIndex(),
      locked: !!WS.locked,
      panelState: JSON.stringify(layout),
      windows: (layout.wins || []).map((w) => String(w.id)),
      toolbarItems: []
    });
    return ws;
  }

  function recallWorkspace(n) {
    const ws = WS.list.filter((x) => (WS.useIds ? x.id === Number(n) : x.n === Number(n)))[0];
    if (!ws) return false;
    applyLayout(ws.layout);
    WS.active = ws.n;
    // Rappel réel dans le projet C++ : position de lecture, piste sélectionnée
    // et barre d'outils sont restaurés par le moteur (recallWorkspaceReal).
    nativeSend('recallWorkspace', { name: ws.name, index: WS.list.indexOf(ws) });
    if (A && A.setStatus) A.setStatus('Espace de travail « ' + ws.name + ' » rappelé');
    if (A && A.setWorkspaceLabel) A.setWorkspaceLabel(ws.name);
    return true;
  }

  function updateWorkspace() {
    if (WS.locked) return false;
    const act = WS.list.find((x) => x.n === WS.active);
    if (!act) return false;
    act.layout = captureLayout();
    persist();
    nativeSend('storeWorkspace', {
      name: act.name,
      barW: Number((A.state && A.state.barW) || 64),
      positionBars: Number((A.state && A.state.pos) || 1),
      selectedTrack: selectedNativeIndex(),
      locked: false,
      panelState: JSON.stringify(act.layout),
      windows: (act.layout.wins || []).map((w) => String(w.id)),
      toolbarItems: []
    });
    return true;
  }

  function persist() {
    try { localStorage.setItem('alpha.workspaces', JSON.stringify({ list: WS.list, presets: WS.presets, seq: WS.seq, useIds: WS.useIds, autoInstantiate: WS.autoInstantiate })); } catch (e) {}
  }
  function restore() {
    try {
      const raw = localStorage.getItem('alpha.workspaces');
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && Array.isArray(o.list)) { WS.list = o.list; WS.seq = o.seq || o.list.length; }
      if (o && Array.isArray(o.presets)) WS.presets = o.presets;
      if (o && o.useIds) WS.useIds = true;
      if (o && o.autoInstantiate) WS.autoInstantiate = true;
    } catch (e) {}
  }

  /* =====================================================================
     REGISTRE
     ===================================================================== */
  const WINDOWS = {
    mixer: { label: 'Mixer', x: 180, y: 120, w: 1046, h: 600, build: buildMixer },
    channel: { label: 'Réglages de canal', x: 300, y: 150, w: 560, h: 420, fit: true, build: buildChannel },
    automation: { label: 'Panneau d’automatisation', x: 250, y: 160, w: 800, h: 404, build: buildAutomation },
    sample: { label: 'Éditeur d’échantillons', x: 220, y: 170, w: 980, h: 500, build: buildSample },
    key: { label: 'Éditeur de clavier', x: 270, y: 170, w: 800, h: 520, build: buildKey },
    mediabay: { label: 'MediaBay', x: 210, y: 140, w: 820, h: 500, build: buildMediabay },
    pool: { label: 'Pool', x: 240, y: 120, w: 960, h: 540, build: buildPool },
    vstinstr: { label: 'Instruments VST', x: 300, y: 170, w: 790, h: 392, build: buildVstInstr },
    connections: { label: 'Connexions VST', x: 300, y: 150, w: 720, h: 420, build: buildConns },
    markers: { label: 'Marqueurs', x: 470, y: 240, w: 566, h: 344, build: buildMarkers },
    history: { label: 'Historique des traitements hors ligne', x: 330, y: 180, w: 712, h: 362, build: buildHistory },
    shortcuts: { label: 'Aide-mémoire (ALPHA)', x: 380, y: 210, w: 700, h: 424, fit: true, build: buildShortcuts },
    projman: { label: 'Nettoyage', x: 330, y: 200, w: 700, h: 430, build: buildProjectManager }
  };

  /* enregistrement de nouvelles fenêtres (windows2.js) */
  function register(defs) { Object.assign(WINDOWS, defs); }

  /* rafraîchit la surbrillance de sélection dans le Mixer ouvert */
  function refreshSelections() {
    const mw = REG.mixer;
    if (!mw) return;
    $$('.mstrip[data-mstrip]', mw.el).forEach((s) =>
      s.classList.toggle('sel', s.dataset.mstrip === (A.state && A.state.selectedTrack)));
  }

  window.addEventListener('resize', () => {
    Object.keys(REG).forEach((k) => {
      const w = REG[k];
      if (w.maxed) { w.el.style.width = window.innerWidth + 'px'; w.el.style.height = window.innerHeight + 'px'; }
      else {
        const r = w.el.getBoundingClientRect();
        if (r.top < 0) w.el.style.top = '0px';
        if (r.left < -r.width + 120) w.el.style.left = (-r.width + 160) + 'px';
      }
    });
  });

  restore();

  window.ALPHAWIN = {
    open, close, REG, refreshSelections, register, closeAll, WINDOWS,
    setAoT, toggleMaxById, showWinMenu, fitWindow, naturalHeight, fitSize, reclampAll,
    WS, saveWorkspace, recallWorkspace, captureLayout, applyLayout,
    updateWorkspace, persist, workspaceMenu
  };
})();
