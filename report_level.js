/* 訪談報告等級（第 8 週）：三級判定、關係人覆蓋表、對話摘錄。全部是純函式，不碰畫面。
   技能等級（探問、情境感知）不在這裡重算：沿用遊戲內 achievements.js 的 skills()，由呼叫端把 askLv／ctxLv 傳進來。
   ★ 初稿：至少 1 位關係人有檢核式紀錄。
   ★★ 基本：3 位以上有紀錄、含病人或家屬、探問 Lv2 以上、情境感知 Lv2 以上、至少 1 條結論。
   ★★★ 完整：4 位以上有紀錄、含病人或家屬、探問 Lv3、情境感知 Lv2 以上、至少 2 條結論（各 30 字以上、附根據與取捨）、至少 1 個矛盾或假設。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_REPORT_LEVEL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAMES = ['未達初稿', '初稿', '基本', '完整'];
  var ITEM_KEYS = ['surface', 'events', 'need'];

  function arr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); }
  function str(x) { return typeof x === 'string' ? x.trim() : ''; }
  function len(s) { return Array.from(str(s)).length; }
  function lv(x) { var n = Number(x); return n >= 1 ? Math.floor(n) : 1; }

  /* 這張訪談紀錄有沒有填東西（點亮或有字） */
  function filled(r) {
    if (!r || !r.items) return false;
    return ITEM_KEYS.some(function (k) { var it = r.items[k]; return it && (it.done || str(it.note)); });
  }
  /* 有檢核式紀錄的人物 id（每位只算一次） */
  function interviewed(interviews) {
    var seen = {}, out = [];
    arr(interviews).forEach(function (r) { if (r && r.personaId && filled(r) && !seen[r.personaId]) { seen[r.personaId] = 1; out.push(r.personaId); } });
    return out;
  }
  function isKey(pid, mainId) { return pid === 'patient' || pid === 'family' || (!!mainId && pid === mainId); }
  function isOpenMarker(m) { return m && (m.type === '矛盾' || m.type === '想法'); }

  /* input：{ interviews, askLv, ctxLv, conclusions, markers, mainPersona }
     回傳：{ level 0–3, stars, name, stats, levels:[{lv,name,checks:[{ok,text}],ok}], next:{lv,name,missing:[文字]}|null } */
  function evaluate(input) {
    input = input || {};
    var who = interviewed(input.interviews), n = who.length;
    var hasKey = who.some(function (p) { return isKey(p, input.mainPersona); });
    var ask = lv(input.askLv), ctx = lv(input.ctxLv);
    var concl = arr(input.conclusions).filter(function (c) { return c && len(c.text) > 0; });
    var full = concl.filter(function (c) { return len(c.text) >= 30 && arr(c.refs).length > 0 && len(c.tradeoff) > 0; });
    var open = arr(input.markers).filter(isOpenMarker).length;
    function chk(ok, text) { return { ok: !!ok, text: text }; }
    var L = [
      { lv: 1, name: NAMES[1], checks: [chk(n >= 1, '至少 1 位人物有訪談紀錄（現在 ' + n + ' 位）')] },
      { lv: 2, name: NAMES[2], checks: [
        chk(n >= 3, '3 位以上人物有訪談紀錄（現在 ' + n + ' 位）'),
        chk(hasKey, '訪談紀錄裡要有病人或家屬'),
        chk(ask >= 2, '探問升到 Lv.2（現在 Lv.' + ask + '）'),
        chk(ctx >= 2, '情境感知升到 Lv.2（現在 Lv.' + ctx + '）'),
        chk(concl.length >= 1, '至少寫 1 條結論（現在 ' + concl.length + ' 條）')] },
      { lv: 3, name: NAMES[3], checks: [
        chk(n >= 4, '4 位以上人物有訪談紀錄（現在 ' + n + ' 位）'),
        chk(hasKey, '訪談紀錄裡要有病人或家屬'),
        chk(ask >= 3, '探問升到 Lv.3（現在 Lv.' + ask + '）'),
        chk(ctx >= 2, '情境感知升到 Lv.2（現在 Lv.' + ctx + '）'),
        chk(full.length >= 2, '2 條結論各 30 字以上，並附根據與取捨（現在符合 ' + full.length + ' 條）'),
        chk(open >= 1, '至少 1 個「矛盾」或「想法」標記（現在 ' + open + ' 個）')] }
    ];
    L.forEach(function (x) { x.ok = x.checks.every(function (c) { return c.ok; }); });
    var level = 0;
    if (L[0].ok) { level = 1; if (L[1].ok) { level = 2; if (L[2].ok) level = 3; } }   /* 要一級一級過 */
    var next = level >= 3 ? null : { lv: level + 1, name: NAMES[level + 1], missing: L[level].checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.text; }) };
    return { level: level, stars: '★'.repeat(level) + '☆'.repeat(3 - level), name: NAMES[level], stats: { personas: n, hasKey: hasKey, ask: ask, ctx: ctx, conclusions: concl.length, fullConclusions: full.length, open: open }, levels: L, next: next };
  }

  function label(ev) { return ev.level ? ev.stars + ' ' + ev.name : '尚未達到初稿'; }
  function nextLine(ev) { return ev.next ? '離下一級（' + ev.next.name + '）還差：' + ev.next.missing.join('；') : '已經是最高級'; }

  /* 關係人覆蓋表：keyIds 是這個案例的重要人物 */
  function coverage(interviews, keyIds, names, counts, mainId) {
    names = names || {}; counts = counts || {};
    return (keyIds || []).map(function (pid) {
      var cells = { surface: false, events: false, need: false }, got = false;
      arr(interviews).forEach(function (r) {
        if (!r || r.personaId !== pid || !r.items) return;
        ITEM_KEYS.forEach(function (k) { var it = r.items[k]; if (it && (it.done || str(it.note))) { cells[k] = true; got = true; } });
      });
      return { pid: pid, name: names[pid] || pid, main: pid === mainId, asked: counts[pid] === undefined ? null : counts[pid], cells: cells, interviewed: got };
    });
  }

  /* 對話逐字稿（er/場次/chat/房間/學號 底下的樣子）→ 每位人物我問了幾題、他回的原話摘錄（每位最多 3 句） */
  function chatDigest(chat, maxQuotes) {
    maxQuotes = maxQuotes || 3;
    var counts = {}, quotes = {};
    Object.keys(chat || {}).forEach(function (rk) {
      var c = chat[rk] || {}, pid = c.personaId || rk, turns = arr(c.turns).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
      turns.forEach(function (t) {
        if (!t) return;
        if (t.role === 'u') counts[pid] = (counts[pid] || 0) + 1;
        else if (t.role === 'a' && (!t.status || t.status === 'ok')) {
          var s = str(t.text).replace(/\s+/g, ' ');
          if (len(s) < 8) return;
          var cut = Array.from(s); if (cut.length > 60) s = cut.slice(0, 60).join('') + '…';
          quotes[pid] = quotes[pid] || [];
          if (quotes[pid].length < maxQuotes && quotes[pid].indexOf(s) < 0) quotes[pid].push(s);
        }
      });
    });
    return { counts: counts, quotes: quotes };
  }

  return { NAMES: NAMES, evaluate: evaluate, label: label, nextLine: nextLine, coverage: coverage, chatDigest: chatDigest, interviewed: interviewed, isKey: isKey };
});
