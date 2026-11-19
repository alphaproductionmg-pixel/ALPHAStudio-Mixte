/* ALPHA Studio 0.5.0 — commandes d'affichage et de fenêtre natives.
   Chargé après le pont natif. En repli Web Audio/J1, ce module reste inerte. */
(function () {
  'use strict';

  function bridge() {
    return window.ALPHA_NATIVE && typeof window.ALPHA_NATIVE.send === 'function'
      ? window.ALPHA_NATIVE : null;
  }
  function send(command, data) {
    const n = bridge();
    return n ? n.send(command, data || {}) : Promise.resolve(null);
  }

  var titlebar = document.getElementById('titlebar');
  var dragging = false;
  var pointerId = null;
  var lastX = 0;
  var lastY = 0;
  var pendingDx = 0;
  var pendingDy = 0;
  var dragFrame = false;

  function flushDrag() {
    dragFrame = false;
    var dx = pendingDx, dy = pendingDy;
    pendingDx = 0; pendingDy = 0;
    if (dx || dy) send('windowDrag', { dx: dx, dy: dy });
  }
  function scheduleDrag() {
    if (dragFrame) return;
    dragFrame = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(flushDrag);
    else window.setTimeout(flushDrag, 16);
  }
  function stopDrag(event) {
    if (pointerId !== null && event && event.pointerId !== undefined && event.pointerId !== pointerId) return;
    if (dragging) flushDrag();
    dragging = false;
    pointerId = null;
  }

  if (titlebar && bridge()) {
    titlebar.addEventListener('pointerdown', function (event) {
      if (event.target && event.target.closest && event.target.closest('button,input,select,textarea,a')) return;
      dragging = true;
      pointerId = event.pointerId;
      lastX = event.clientX || 0;
      lastY = event.clientY || 0;
      if (titlebar.setPointerCapture && pointerId !== undefined) titlebar.setPointerCapture(pointerId);
    });
    titlebar.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      if (pointerId !== null && event.pointerId !== undefined && event.pointerId !== pointerId) return;
      const x = event.clientX || 0, y = event.clientY || 0;
      pendingDx += x - lastX;
      pendingDy += y - lastY;
      lastX = x; lastY = y;
      scheduleDrag();
    });
    titlebar.addEventListener('pointerup', stopDrag);
    titlebar.addEventListener('pointercancel', stopDrag);
    titlebar.addEventListener('lostpointercapture', stopDrag);
    titlebar.addEventListener('dblclick', function (event) {
      if (event.target && event.target.closest && event.target.closest('button,input,select,textarea,a')) return;
      send('windowMaximize');
    });
  }

  const uiCommands = {
    uiZoomIn: ['uiScale', { delta: 0.05 }],
    uiZoomOut: ['uiScale', { delta: -0.05 }],
    textZoomIn: ['fontScale', { delta: 0.10 }],
    textZoomOut: ['fontScale', { delta: -0.10 }],
    resetLayout: ['resetLayout', {}],
    audioSettings: ['audioSettings', {}],
    asioPanel: ['asioPanel', {}],
    windowFitToScreen: ['windowFitToScreen', {}],
    windowMinimize: ['windowMinimize', {}],
    windowMaximize: ['windowMaximize', {}],
    windowRestore: ['windowRestore', {}]
  };
  document.addEventListener('click', function (event) {
    const button = event.target && event.target.closest && event.target.closest('[data-alpha-ui-command]');
    if (!button) return;
    const entry = uiCommands[button.dataset.alphaUiCommand];
    if (entry) send(entry[0], entry[1]);
  });
  document.addEventListener('keydown', function (event) {
    if (!bridge() || !(event.ctrlKey && event.altKey)) return;
    const key = String(event.key || '');
    let entry = null;
    if (key === '+' || key === '=') entry = uiCommands.uiZoomIn;
    else if (key === '-') entry = uiCommands.uiZoomOut;
    else if (key === '0') entry = uiCommands.resetLayout;
    else if (key.toLowerCase() === 'a') entry = uiCommands.audioSettings;
    if (!entry) return;
    event.preventDefault();
    send(entry[0], entry[1]);
  }, true);
})();
