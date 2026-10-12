/* 個人時鐘：每位學生自己選模擬速度。世界（world.at）只依「世界秒」決定，世界秒內部維持 5 秒 = 1 模擬分；
   這裡只負責把真實時間換成世界秒，所以換速度不會改變世界本身。純函式，不碰 DOM。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_CLOCK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WORLD_SEC_PER_SIM_MIN = 5;        /* 世界的內部單位，與 er_data.js 的 SIM 一致 */
  var DATA = typeof module === 'object' && module.exports ? require('./er_data.js') : (typeof self !== 'undefined' ? self.ERG_DATA : null);
  var PRESETS = {
    '慢':   { secPerMin: 3.5, label: '慢（約 42 分鐘一天）' },
    '標準': { secPerMin: 2,   label: '標準（約 24 分鐘一天）' },
    '快':   { secPerMin: 1,   label: '快（約 12 分鐘一天）' }
  };
  var MIN_SPM = 0.5, MAX_SPM = 6;
  var DEFAULT_KEY = '標準';

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function create(opts) {
    opts = opts || {};
    var key = PRESETS[opts.speed] ? opts.speed : DEFAULT_KEY;
    var shift = opts.shift === 'night' ? 'night' : 'day', sim = DATA && DATA.forShift ? DATA.forShift(shift).SIM : { START: shift === 'night' ? 1140 : 420, END: shift === 'night' ? 1860 : 1140 };
    return { worldSec: Number(opts.worldSec) || 0, speed: key, secPerMin: PRESETS[key].secPerMin, paused: !!opts.paused, shift: shift, simStart: sim.START, simEnd: sim.END };
  }

  /* 真實經過 realSec 秒後的新狀態。暫停時不走；到 19:00 停住。 */
  function tick(clock, realSec) {
    var c = copy(clock);
    if (c.paused || !(realSec > 0)) return c;
    var worldSec = c.worldSec + realSec * (WORLD_SEC_PER_SIM_MIN / c.secPerMin);
    var maxWorld = (c.simEnd - c.simStart) * WORLD_SEC_PER_SIM_MIN;
    c.worldSec = Math.min(maxWorld, worldSec);
    return c;
  }

  function setSpeed(clock, keyOrSec) {
    var c = copy(clock);
    if (PRESETS[keyOrSec]) { c.speed = keyOrSec; c.secPerMin = PRESETS[keyOrSec].secPerMin; }
    else {
      var n = Number(keyOrSec);
      if (!(n > 0)) throw new Error('速度要是正數或預設檔名');
      c.speed = '自訂'; c.secPerMin = clamp(n, MIN_SPM, MAX_SPM);
    }
    return c;
  }

  function setPaused(clock, paused) { var c = copy(clock); c.paused = !!paused; return c; }
  function simMin(clock) { var start = clock.simStart === undefined ? 420 : clock.simStart, end = clock.simEnd === undefined ? 1140 : clock.simEnd; return Math.min(end, start + clock.worldSec / WORLD_SEC_PER_SIM_MIN); }
  function isDayOver(clock) { return simMin(clock) >= (clock.simEnd === undefined ? 1140 : clock.simEnd); }
  function format(clock) { var m = Math.floor(simMin(clock)) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function realSecForDay(secPerMin, shift) { var sim = DATA && DATA.forShift ? DATA.forShift(shift).SIM : { START: shift === 'night' ? 1140 : 420, END: shift === 'night' ? 1860 : 1140 }; return (sim.END - sim.START) * secPerMin; }
  function copy(c) { return { worldSec: c.worldSec, speed: c.speed, secPerMin: c.secPerMin, paused: c.paused, shift: c.shift || 'day', simStart: c.simStart === undefined ? 420 : c.simStart, simEnd: c.simEnd === undefined ? 1140 : c.simEnd }; }

  /* 存進 localStorage 的精簡形式 */
  function pack(clock) { return JSON.stringify({ speed: clock.speed, secPerMin: clock.secPerMin }); }
  function unpackSpeed(str) {
    try { var o = JSON.parse(str); if (PRESETS[o.speed]) return o.speed; if (o.speed === '自訂' && o.secPerMin > 0) return clamp(o.secPerMin, MIN_SPM, MAX_SPM); } catch (e) {}
    return DEFAULT_KEY;
  }

  return { PRESETS: PRESETS, DEFAULT_KEY: DEFAULT_KEY, MIN_SPM: MIN_SPM, MAX_SPM: MAX_SPM, create: create, tick: tick, setSpeed: setSpeed,
    setPaused: setPaused, simMin: simMin, isDayOver: isDayOver, format: format, realSecForDay: realSecForDay, pack: pack, unpackSpeed: unpackSpeed };
});
