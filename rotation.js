/* 房間輪播：隨機、定時自動換看不同房間（像監視器巡迴），有事件或有人的房間機率高，不會連續重複。
   只換「看的房間」，不會移動玩家的位置或影響檢核點；玩家一操作就暫停，閒置一段時間再恢復。純函式，確定性。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_ROTATION = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function hash(s) { var h = 7, i; s = String(s); for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function rng(seed) { var s = hash(seed) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }

  /* rooms：[{ id, people（目前在場人數）, eventActive（正在進行的事件數）, importance（0–3，該房間進行中事件最高重要度）, hall? }]
     state：{ seed, n（已輪過幾次）, history:[最近房間 id…] }；opts：{ dwell:[最短,最長秒], avoid（不重複的最近幾間，預設 3）, minPeople } → { room, dwell, state } */
  function next(state, rooms, opts) {
    opts = opts || {}; state = state || {}; var avoid = opts.avoid === undefined ? 3 : opts.avoid, dw = opts.dwell || [8, 15], hist = (state.history || []).slice(-avoid), n = state.n || 0;
    var cand = (rooms || []).filter(function (r) { return !r.hall && hist.indexOf(r.id) < 0; });
    if (!cand.length) cand = (rooms || []).filter(function (r) { return !r.hall; });
    if (!cand.length) return null;
    var r = rng((state.seed || 'ERG') + ':rot:' + n), w = cand.map(function (c) { return 1 + (c.people || 0) * 0.6 + (c.eventActive || 0) * 4 + (c.importance || 0) * 2; });
    var total = w.reduce(function (a, b) { return a + b; }, 0), x = r() * total, i = 0; while (i < cand.length - 1 && x > w[i]) { x -= w[i]; i++; }
    var room = cand[i].id, active = (cand[i].eventActive || 0) > 0, dwell = Math.round((dw[0] + r() * (dw[1] - dw[0])) * (active ? 1.4 : 1) * 10) / 10;
    return { room: room, dwell: dwell, state: { seed: state.seed, n: n + 1, history: (state.history || []).concat([room]).slice(-8) } };
  }
  /* 這一刻要不要換房：播放中、距上次換房超過停留時間、玩家閒置夠久（idleSec）才換 */
  function due(t, st) { return !!st.on && !st.paused && (t - st.lastSwitchT) >= st.dwell && (t - (st.lastInputT || -1e9)) >= (st.idleSec || 6); }
  return { next: next, due: due, hash: hash };
});
