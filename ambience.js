/* 房間環境音：全部用程式合成（濾波雜訊底＋偶發的短音），沒有任何音檔，所以檔案大小是 0。
   規則：同一時間只有一個房間的底噪；換房間時淡出淡入；音量極低；全域聲音開關關閉就完全不出聲。
   recipe 是純資料，可以在 Node 測試；播放函式只在瀏覽器裡用 WebAudio。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_AMBIENCE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_BED_GAIN = 0.10;       /* 底噪上限（相對於全域音量 1.0） */
  var MAX_EVENT_GAIN = 0.12;

  /* bed：{ noise:'pink'|'brown'|'white', lp:低通Hz, hp:高通Hz, gain, wobble:每秒起伏次數 }；events：偶發短音 */
  var ROOMS = {
    consultA:  { bed: { noise: 'brown', lp: 500, hp: 40, gain: .05, wobble: .1 }, events: [{ k: 'paper', every: [14, 30], g: .05 }] },
    consultB:  { bed: { noise: 'brown', lp: 500, hp: 40, gain: .05, wobble: .1 }, events: [{ k: 'knock', every: [20, 45], g: .05 }] },
    bays:      { bed: { noise: 'pink', lp: 1200, hp: 80, gain: .06, wobble: .15 }, events: [{ k: 'beep', every: [6, 12], g: .06 }, { k: 'curtain', every: [20, 40], g: .05 }] },
    ct:        { bed: { noise: 'brown', lp: 260, hp: 50, gain: .08, wobble: 0, hum: 120 }, events: [{ k: 'thump', every: [12, 25], g: .06 }] },
    corridor:  { bed: { noise: 'pink', lp: 900, hp: 100, gain: .05, wobble: .2 }, events: [{ k: 'steps', every: [8, 18], g: .05 }, { k: 'wheel', every: [25, 50], g: .05 }] },
    waiting:   { bed: { noise: 'pink', lp: 1400, hp: 150, gain: .07, wobble: .3 }, events: [{ k: 'chime', every: [18, 36], g: .08 }, { k: 'cough', every: [20, 50], g: .05 }] },
    nurse:     { bed: { noise: 'pink', lp: 1000, hp: 120, gain: .05, wobble: .2 }, events: [{ k: 'beep', every: [5, 10], g: .06 }, { k: 'phone', every: [30, 60], g: .06 }, { k: 'keys', every: [10, 25], g: .04 }] },
    resus:     { bed: { noise: 'pink', lp: 800, hp: 80, gain: .05, wobble: .1 }, events: [{ k: 'beep', every: [2, 3.5], g: .07 }] },
    staff:     { bed: { noise: 'brown', lp: 380, hp: 40, gain: .04, wobble: .05 }, events: [{ k: 'cup', every: [25, 60], g: .04 }] },
    hall3:     { bed: { noise: 'pink', lp: 1000, hp: 100, gain: .06, wobble: .2 }, events: [{ k: 'steps', every: [6, 14], g: .05 }, { k: 'chime', every: [20, 40], g: .06 }] },
    hall2:     { bed: { noise: 'pink', lp: 900, hp: 100, gain: .05, wobble: .2 }, events: [{ k: 'steps', every: [8, 18], g: .05 }] },
    entrance:  { bed: { noise: 'pink', lp: 1500, hp: 150, gain: .06, wobble: .25 }, events: [{ k: 'door', every: [10, 22], g: .07 }, { k: 'steps', every: [8, 16], g: .05 }] },
    triage:    { bed: { noise: 'pink', lp: 1100, hp: 120, gain: .06, wobble: .25 }, events: [{ k: 'chime', every: [14, 28], g: .08 }, { k: 'keys', every: [8, 16], g: .04 }] },
    discharge: { bed: { noise: 'pink', lp: 1000, hp: 120, gain: .05, wobble: .2 }, events: [{ k: 'print', every: [15, 30], g: .05 }, { k: 'chime', every: [25, 50], g: .06 }] },
    restroom:  { bed: { noise: 'brown', lp: 420, hp: 40, gain: .04, wobble: 0 }, events: [{ k: 'drip', every: [2.5, 5], g: .05 }, { k: 'fan', every: [40, 70], g: .03 }] },
    admin:     { bed: { noise: 'brown', lp: 320, hp: 40, gain: .03, wobble: .05 }, events: [{ k: 'keys', every: [6, 14], g: .04 }, { k: 'phone', every: [45, 90], g: .05 }] },
    ped:       { bed: { noise: 'pink', lp: 1300, hp: 120, gain: .05, wobble: .2 }, events: [{ k: 'squeak', every: [10, 25], g: .06 }, { k: 'cry', every: [40, 80], g: .04 }] },
    obs:       { bed: { noise: 'brown', lp: 450, hp: 40, gain: .05, wobble: .1 }, events: [{ k: 'beep', every: [7, 14], g: .05 }, { k: 'drip', every: [20, 40], g: .04 }] },
    pharmacy:  { bed: { noise: 'pink', lp: 1000, hp: 120, gain: .05, wobble: .2 }, events: [{ k: 'rustle', every: [10, 22], g: .05 }, { k: 'chime', every: [20, 40], g: .06 }] },
    family:    { bed: { noise: 'pink', lp: 1300, hp: 150, gain: .06, wobble: .3 }, events: [{ k: 'phone', every: [30, 60], g: .05 }, { k: 'cough', every: [25, 55], g: .04 }] },
    lobby:     { bed: { noise: 'pink', lp: 1500, hp: 150, gain: .07, wobble: .3 }, events: [{ k: 'chime', every: [12, 24], g: .08 }, { k: 'steps', every: [6, 12], g: .05 }] },
    service:   { bed: { noise: 'pink', lp: 1200, hp: 150, gain: .06, wobble: .25 }, events: [{ k: 'bell', every: [20, 40], g: .07 }] },
    ambulance: { bed: { noise: 'brown', lp: 600, hp: 50, gain: .06, wobble: .1 }, events: [{ k: 'car', every: [10, 25], g: .06 }, { k: 'beep', every: [14, 30], g: .05 }] },
    street:    { bed: { noise: 'brown', lp: 700, hp: 50, gain: .08, wobble: .1 }, events: [{ k: 'car', every: [5, 12], g: .07 }, { k: 'scooter', every: [10, 22], g: .06 }, { k: 'bird', every: [15, 35], g: .04 }] },
    notebook:  { bed: { noise: 'brown', lp: 260, hp: 40, gain: .02, wobble: 0 }, events: [{ k: 'paper', every: [20, 40], g: .03 }] },
    home:      { bed: { noise: 'brown', lp: 300, hp: 40, gain: .03, wobble: .05 }, events: [{ k: 'clock', every: [3, 3], g: .03 }, { k: 'phone', every: [60, 120], g: .05 }] },
    clinic:    { bed: { noise: 'pink', lp: 900, hp: 100, gain: .04, wobble: .2 }, events: [{ k: 'chime', every: [20, 40], g: .06 }] }
  };

  /* 偶發短音的合成配方：freq（Hz，可為 [起, 終]）、dur（秒）、wave、noise（用雜訊代替音高）、repeat（次數） */
  var KINDS = {
    beep:    { freq: 880, dur: .08, wave: 'sine' },
    chime:   { freq: [660, 880], dur: .35, wave: 'sine' },
    bell:    { freq: 1200, dur: .4, wave: 'triangle' },
    knock:   { freq: 140, dur: .06, wave: 'square', repeat: 2 },
    paper:   { noise: true, dur: .18, hp: 2500 },
    curtain: { noise: true, dur: .35, hp: 1200 },
    thump:   { freq: [90, 60], dur: .2, wave: 'sine' },
    steps:   { freq: 110, dur: .05, wave: 'square', repeat: 4 },
    wheel:   { noise: true, dur: .8, hp: 600 },
    cough:   { noise: true, dur: .2, hp: 400, repeat: 2 },
    phone:   { freq: [1400, 1700], dur: .12, wave: 'square', repeat: 3 },
    keys:    { freq: 2200, dur: .02, wave: 'square', repeat: 5 },
    cup:     { freq: 1800, dur: .08, wave: 'triangle' },
    door:    { freq: [200, 130], dur: .3, wave: 'sawtooth' },
    print:   { freq: 300, dur: .4, wave: 'square', repeat: 3 },
    drip:    { freq: [1800, 900], dur: .07, wave: 'sine' },
    fan:     { noise: true, dur: 1.2, hp: 300 },
    squeak:  { freq: [900, 1500], dur: .12, wave: 'triangle', repeat: 2 },
    cry:     { freq: [500, 650], dur: .5, wave: 'triangle' },
    rustle:  { noise: true, dur: .25, hp: 3000 },
    car:     { noise: true, dur: 1.6, hp: 150 },
    scooter: { freq: [180, 260], dur: 1.1, wave: 'sawtooth' },
    bird:    { freq: [2600, 3400], dur: .09, wave: 'sine', repeat: 3 },
    clock:   { freq: 1000, dur: .02, wave: 'square' }
  };

  function ids() { return Object.keys(ROOMS); }

  /* 預排一段時間內的偶發短音：{ t, kind, g }。rnd 是 0~1 的亂數函式，種子相同結果相同。 */
  function schedule(roomId, rnd, from, to) {
    var r = ROOMS[roomId]; if (!r) return [];
    var out = [];
    r.events.forEach(function (ev) {
      var t = from + ev.every[0] + rnd() * (ev.every[1] - ev.every[0]);
      while (t < to) {
        out.push({ t: t, kind: ev.k, g: Math.min(MAX_EVENT_GAIN, ev.g) });
        t += ev.every[0] + rnd() * (ev.every[1] - ev.every[0]);
        if (ev.every[1] <= 0) break;
      }
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }

  /* —— 以下只在瀏覽器使用 —— */
  function createPlayer(AudioCtx, opts) {
    opts = opts || {};
    var ctx = null, master = null, bed = null, curRoom = null, timer = null, enabled = true, vol = opts.volume === undefined ? 0.5 : opts.volume;
    var seed = opts.seed || 7;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    function ensure() { if (!ctx) { ctx = new AudioCtx(); master = ctx.createGain(); master.gain.value = enabled ? vol : 0; master.connect(ctx.destination); } return ctx; }
    function noiseBuffer(type) {
      var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), last = 0, i, w, b0 = 0, b1 = 0, b2 = 0;
      for (i = 0; i < len; i += 1) {
        w = Math.random() * 2 - 1;
        if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else if (type === 'pink') { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
        else d[i] = w * 0.5;
      }
      return buf;
    }
    function startBed(room) {
      var r = ROOMS[room]; if (!r) return null;
      var src = ctx.createBufferSource(); src.buffer = noiseBuffer(r.bed.noise); src.loop = true;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = r.bed.lp;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = r.bed.hp;
      var g = ctx.createGain(); g.gain.value = 0.0001;
      src.connect(lp); lp.connect(hp); hp.connect(g); g.connect(master); src.start();
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, Math.min(MAX_BED_GAIN, r.bed.gain)), ctx.currentTime + 1.2);
      if (r.bed.wobble) { var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = r.bed.wobble; lg.gain.value = r.bed.gain * 0.25; lfo.connect(lg); lg.connect(g.gain); lfo.start(); }
      return { src: src, g: g };
    }
    function playEvent(ev) {
      var k = KINDS[ev.kind]; if (!k) return;
      var times = k.repeat || 1, gap = k.dur * 1.4, i;
      for (i = 0; i < times; i += 1) {
        var t0 = ctx.currentTime + i * gap, g = ctx.createGain(), src;
        if (k.noise) {
          src = ctx.createBufferSource(); src.buffer = noiseBuffer('white');
          var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = k.hp || 800; src.connect(f); f.connect(g);
        } else {
          src = ctx.createOscillator(); src.type = k.wave || 'sine';
          var fr = k.freq; if (Array.isArray(fr)) { src.frequency.setValueAtTime(fr[0], t0); src.frequency.linearRampToValueAtTime(fr[1], t0 + k.dur); } else src.frequency.value = fr;
          src.connect(g);
        }
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, ev.g), t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + k.dur);
        g.connect(master); src.start(t0); src.stop(t0 + k.dur + 0.05);
      }
    }
    function loop() {
      if (!ctx || !curRoom) return;
      var now = ctx.currentTime, evs = schedule(curRoom, rnd, 0, 20);
      evs.forEach(function (e) { setTimeout(function () { if (enabled && curRoom && ctx) playEvent(e); }, e.t * 1000); });
      timer = setTimeout(loop, 20000);
    }
    return {
      enter: function (room) {
        if (!enabled || room === curRoom) { curRoom = room; return; }
        ensure(); if (ctx.state === 'suspended') ctx.resume();
        if (bed) { var old = bed; old.g.gain.cancelScheduledValues(ctx.currentTime); old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); setTimeout(function () { try { old.src.stop(); } catch (e) {} }, 1500); }
        curRoom = room; bed = startBed(room);
        if (timer) clearTimeout(timer); loop();
      },
      setEnabled: function (on) { enabled = !!on; if (master) master.gain.value = enabled ? vol : 0; if (!enabled && timer) clearTimeout(timer); },
      setVolume: function (v) { vol = Math.max(0, Math.min(1, v)); if (master && enabled) master.gain.value = vol; },
      stop: function () { enabled = false; if (timer) clearTimeout(timer); if (bed) { try { bed.src.stop(); } catch (e) {} bed = null; } }
    };
  }

  return { ROOMS: ROOMS, KINDS: KINDS, ids: ids, schedule: schedule, createPlayer: createPlayer, MAX_BED_GAIN: MAX_BED_GAIN, MAX_EVENT_GAIN: MAX_EVENT_GAIN };
});
