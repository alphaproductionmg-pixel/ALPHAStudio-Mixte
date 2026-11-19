/* ALPHA Studio native bridge. Loaded after the ALPHA UI scripts. */
(function () {
  'use strict';
  const A = window.ALPHA;
  const backend = window.__JUCE__ && window.__JUCE__.backend;
  if (!A || !backend || typeof backend.getNativeFunction !== 'function') return;
  const nativeCall = backend.getNativeFunction('alphaCommand');
  let lastUiSignature = '';
  const send = (name, data) => nativeCall(name, data || {});
  const nativeIndex = (id) => {
    const match = /^native_(\d+)$/.exec(String(id || ''));
    return match ? Number(match[1]) : -1;
  };

  window.ALPHA_NATIVE = {
    send,
    requestState: () => send('getState'),
    applyState(snapshot) {
      if (!snapshot || !Array.isArray(snapshot.tracks)) return;
      const signature = JSON.stringify(snapshot.tracks.map(t => ({
        name: t.name, volumeDb: t.volumeDb, pan: t.pan, mute: t.mute,
        solo: t.solo, arm: t.arm, clips: (t.clips || []).map(c => [c.name, c.startBars, c.lengthBars])
      })));
      const nativeTracks = snapshot.tracks.map((t, i) => ({
        id: 'native_' + i, kind: 'audio', num: String(i + 1).padStart(2, '0'),
        name: t.name || ('Audio ' + (i + 1)), h: 64,
        color: t.colour || '#4f7fa8', partColor: t.colour || '#8fb6d6',
        db: Number(t.volumeDb || 0), pan: Number(t.pan || 0),
        mute: !!t.mute, solo: !!t.solo, rec: !!t.arm, mon: false, vol: 70
      }));
      const nativeParts = [];
      snapshot.tracks.forEach((t, ti) => (t.clips || []).forEach((clip, ci) => {
        nativeParts.push({
          id: 'nativeClip_' + ti + '_' + ci, track: 'native_' + ti,
          name: clip.name || 'Audio', start: Number(clip.startBars || 1),
          len: Math.max(0.01, Number(clip.lengthBars || 1)), type: 'audio', wave: 'native'
        });
      }));
      if (signature !== lastUiSignature) {
        const displayTracks = nativeTracks.length ? nativeTracks : [{
          id: 'voix', kind: 'folder', name: 'Aucune piste', h: 26,
          color: '#4f7fa8', open: true, kids: []
        }];
        A.TRACKS.splice(4, A.TRACKS.length - 4, ...displayTracks);
        A.PARTS.splice(0, A.PARTS.length, ...nativeParts);
        A.state.selectedTrack = nativeTracks.length ? nativeTracks[0].id : 'voix';
        A.state.selTracks = nativeTracks.length ? [nativeTracks[0].id] : ['voix'];
        lastUiSignature = signature;
        A.refresh();
      }
      A.state.pos = Number(snapshot.positionBars || 1);
      A.goto(A.state.pos);
      A.state.bars = Math.max(84, ...nativeParts.map(p => p.start + p.len + 8));
      A.state.playing = !!snapshot.playing;
      A.state.recording = !!snapshot.recording;
      A.state.cycle = !!snapshot.looping;
      A.state.click = !!snapshot.metronome;
      A.state.cycleL = Number(snapshot.loopStartBars || 1);
      A.state.cycleR = Number(snapshot.loopEndBars || 9);
      const playButton = document.getElementById('tpPlay');
      const recButton = document.getElementById('tpRec');
      const cycleButton = document.getElementById('tpCycleBtn');
      const clickButton = document.getElementById('tpClick');
      if (playButton) playButton.classList.toggle('active', A.state.playing && !A.state.recording);
      if (recButton) recButton.classList.toggle('active', A.state.recording);
      if (cycleButton) cycleButton.classList.toggle('active', A.state.cycle);
      if (clickButton) clickButton.classList.toggle('on', A.state.click);
      const status = document.getElementById('sbStatus');
      if (status && snapshot.device) status.textContent = snapshot.device;
    }
  };

  const actions = A.ACTIONS;
  actions.play = () => send('play');
  actions.stop = () => send('stop');
  actions.record = () => send('record');
  actions.cycle = () => send('cycle', { enabled: !A.state.cycle });
  actions.click = () => send('metronome', { enabled: !A.state.click });
  actions.rtz = () => send('seek', { bars: 1 });
  actions.end = () => send('seek', { bars: A.state.bars });
  actions.importAudio = () => send('importAudio');
  actions.openProject = () => send('openProject');
  actions.saveProject = () => send('saveProject');
  actions.newProject = () => send('newProject');
  actions.addTrack = () => send('addTrack', { name: 'Audio ' + (A.TRACKS.length - 3) });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-act][data-track]');
    if (!button) return;
    const index = nativeIndex(button.dataset.track);
    if (index < 0) return;
    const field = ({ mute: 'mute', solo: 'solo', rec: 'arm' })[button.dataset.act];
    if (!field) return;
    const track = A.trackById(button.dataset.track);
    if (!track) return;
    setTimeout(() => send('setTrack', {
      index, field, value: field === 'arm' ? !!track.rec : !!track[field]
    }), 0);
  });

  document.addEventListener('pointerup', (event) => {
    const fader = event.target.closest('.tl-fader');
    const row = fader && fader.closest('.tl-row[data-track]');
    if (!row) return;
    const index = nativeIndex(row.dataset.track);
    const track = A.trackById(row.dataset.track);
    if (index >= 0 && track) send('setTrack', { index, field: 'volumeDb', value: Number(track.db || 0) });
  }, true);

  const ruler = document.getElementById('ruler-vp');
  if (ruler) ruler.addEventListener('pointerup', () => send('seek', { bars: A.state.pos }), true);
  send('getState');
})();
