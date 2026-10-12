/* 日夜：由戶外透進來的光線與街上的車流表示時間與忙碌。純函式，確定性。
   simMin：一天裡的分鐘數（0–1439，07:00＝420；跨午夜用 mod 1440）。
   不直接畫畫面：回傳「暗度、色調、光束強度、車流」，由畫面層疊上去（色調層用 multiply、入口與窗口的光束、街上的車）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_DAYLIGHT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var SUNRISE = 6 * 60, SUNSET = 17 * 60 + 40;        /* 十月台南約 06:00 日出、17:40 日落 */
  var NIGHT_DARK = 0.78;

  function mod(m) { m = m % 1440; return m < 0 ? m + 1440 : m; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function mix(c1, c2, t) { var a = hex(c1), b = hex(c2); return '#' + [0, 1, 2].map(function (i) { var v = Math.round(lerp(a[i], b[i], t)); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }

  /* 暗度 0（大白天）到 NIGHT_DARK（深夜）；日出日落前後各 75 分鐘漸變 */
  function darkness(simMin) {
    var m = mod(simMin), ramp = 75;
    if (m >= SUNRISE + ramp && m <= SUNSET - ramp) return 0;
    if (m > SUNSET - ramp && m < SUNSET + ramp) return NIGHT_DARK * smooth((m - (SUNSET - ramp)) / (2 * ramp));
    if (m >= SUNSET + ramp || m <= SUNRISE - ramp) return NIGHT_DARK;
    return NIGHT_DARK * (1 - smooth((m - (SUNRISE - ramp)) / (2 * ramp)));
  }
  function phase(simMin) {
    var d = darkness(simMin), m = mod(simMin);
    if (d <= 0.02) return '白天'; if (d >= NIGHT_DARK - 0.02) return '夜晚';
    return m < 12 * 60 ? '清晨' : '黃昏';
  }
  /* 色調：清晨偏暖黃、白天無色、黃昏橘紅、夜晚深藍 */
  function tint(simMin) {
    var d = darkness(simMin), m = mod(simMin), warm = m < 12 * 60 ? '#ffd9a8' : '#ff9f6b';
    if (d === 0) return '#ffffff';
    var t = d / NIGHT_DARK;
    return t < 0.5 ? mix('#ffffff', warm, t / 0.5) : mix(warm, '#1b2a4a', (t - 0.5) / 0.5);
  }
  /* 室內外的光：白天窗口透進冷白色日光；夜晚入口、窗口、路燈亮暖黃燈。都是 0–1 的強度。 */
  function light(simMin) {
    var d = darkness(simMin), t = d / NIGHT_DARK;
    return { darkness: round(d), phase: phase(simMin), tint: tint(simMin), daylightShaft: round((1 - t) * 0.6), lampGlow: round(clamp(t * 1.15, 0, 1)), streetLamps: t > 0.35, headlights: t > 0.3 };
  }
  function round(v) { return Math.round(v * 1000) / 1000; }

  /* 車流（街上每個模擬分鐘經過幾輛）：尖峰（07–09、17–19）多，深夜少；到院病人多、週末也多。 */
  function trafficRate(simMin, opts) {
    opts = opts || {}; var m = mod(simMin), h = m / 60, base;
    if (h >= 7 && h < 9.5) base = 1.5; else if (h >= 17 && h < 19.5) base = 1.6; else if (h >= 9.5 && h < 17) base = 0.9; else if (h >= 19.5 && h < 23) base = 0.55; else base = 0.15;
    var arrivals = opts.arrivalRate === undefined ? 4 : opts.arrivalRate;
    return round(base * (1 + clamp(arrivals - 4, -3, 8) * 0.06) * (opts.weekend ? 1.1 : 1));
  }
  function busyLabel(rate) { return rate >= 1.5 ? '車流很多（尖峰）' : rate >= 0.8 ? '車流普通' : rate >= 0.4 ? '車流稀疏' : '街上幾乎沒車'; }

  function hash(s) { var h = 7, i; s = String(s); for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function rng(seed) { var s = hash(seed) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }

  /* 某一段模擬分鐘內經過的車（確定性）：[{ id, t（模擬分鐘）, lane:0|1, dir:1|-1, kind, speed（街道長度/分鐘） }]。
     救護車由呼叫端依事件另外加（kind:'ambulance'，亮警示燈），這裡不產生。 */
  function cars(fromMin, toMin, opts) {
    opts = opts || {}; var out = [], step = 1, m;
    for (m = Math.floor(fromMin); m < toMin; m += step) {
      var r = trafficRate(m, opts), rnd = rng((opts.seed || 'ERG') + ':car:' + m), n = Math.floor(r) + (rnd() < r - Math.floor(r) ? 1 : 0), k;
      for (k = 0; k < n; k++) {
        var kind = rnd() < 0.12 ? 'bus' : (rnd() < 0.4 ? 'scooter' : 'car');
        out.push({ id: 'c' + m + '-' + k, t: round(m + rnd()), lane: rnd() < 0.5 ? 0 : 1, dir: rnd() < 0.5 ? 1 : -1, kind: kind, speed: kind === 'scooter' ? 2.2 : (kind === 'bus' ? 1.2 : 1.8) });
      }
    }
    return out.filter(function (c) { return c.t >= fromMin && c.t < toMin; }).sort(function (a, b) { return a.t - b.t || (a.id < b.id ? -1 : 1); });
  }

  return { darkness: darkness, phase: phase, tint: tint, light: light, trafficRate: trafficRate, busyLabel: busyLabel, cars: cars, SUNRISE: SUNRISE, SUNSET: SUNSET, NIGHT_DARK: NIGHT_DARK };
});
