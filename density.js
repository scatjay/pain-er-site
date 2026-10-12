/* 畫面上的人數控制：同時出現的人不要太多，其他房間的人陸陸續續出現、離開（淡入淡出），不一次塞滿。純函式。
   items：[{ id, kind:'staff'|'patient'|'incident'|'bot', room, main? }]；ctx：{ myRoom, t（世界秒）, budget（其他房間最多幾人）, inRoomMax, window, duty }
   回傳 { id: true }（要顯示的人）。規則：自己所在房間的人優先（上限 inRoomMax）；其他房間的人依優先順序，
   每個人各有固定的「出場節奏」（週期 window 秒、約 duty 的時間在場），再取前 budget 人；模擬同學只在自己房間出現。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_DENSITY = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function hash(s) { var h = 7, i; s = String(s); for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function score(it) { return (it.kind === 'incident' ? 100 : 0) + (it.main ? 90 : 0) + (it.kind === 'staff' ? 60 : 0) + (it.kind === 'patient' ? (String(it.id).indexOf('named') >= 0 ? 50 : 20) : 0) + (it.kind === 'bot' ? 10 : 0); }
  function pick(items, ctx) {
    ctx = ctx || {};
    var budget = ctx.budget === undefined ? 8 : ctx.budget, inMax = ctx.inRoomMax === undefined ? 8 : ctx.inRoomMax, W = ctx.window || 90, duty = ctx.duty === undefined ? 0.55 : ctx.duty, t = ctx.t || 0;
    var out = {}, here = [], other = [];
    items.forEach(function (it) { (it.room && it.room === ctx.myRoom ? here : other).push(it); });
    here.sort(function (a, b) { return score(b) - score(a) || hash(a.id) - hash(b.id); });
    here.slice(0, inMax).forEach(function (it) { out[it.id] = true; });
    var cand = other.filter(function (it) {
      if (it.kind === 'bot') return false;
      if (it.kind === 'incident' || it.main) return true;                       /* 鬧事與主角一定看得到 */
      return ((t + hash(it.id) % W) % W) < W * duty;                             /* 其他人輪流出現 */
    });
    cand.sort(function (a, b) { return score(b) - score(a) || hash(a.id) - hash(b.id); });
    cand.slice(0, budget).forEach(function (it) { out[it.id] = true; });
    return out;
  }
  return { pick: pick, hash: hash };
});
