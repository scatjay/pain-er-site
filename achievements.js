/* 成就系統（楊老師 2026-10-12：訪談對象最多、進入時間最多之類）。
   純函式：metrics(player, ctx) 算指標；badges(metrics) 算徽章；summary() 給班級排行用的小物件（存 er/{sess}/score/{sid}）。
   指標全部從玩家既有資料算（interviews／cards／visited／seenEv／replays／discussion／conclusions），
   加兩個新計數：player.playMin（頁面可見時每分鐘 +1，game.js）、player.chatTurns（即時訪談送出一題 +1，panels.js）。
   不打分數、不排名次；排行只列「誰在哪一項最多」，給課堂當話題用。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_ACH = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CORE_IDS = ['patient', 'family', 'triage_nurse', 'nurse', 'er_doctor', 'clinic_doctor', 'volunteer', 'radiology', 'guard', 'admin'];
  var SPECIAL = { superintendent: '院長', er_director: '陳主任', kid: '小米', migrant_caregiver: 'Siti', trans_woman: '小薇', gay_partner: '恩哥', lonely_elder: '賴阿嬤', street_man: '山哥' };

  function arr(a) { return Array.isArray(a) ? a : (a && typeof a === 'object' ? Object.keys(a).map(function (k) { return a[k]; }) : []); }
  function keys(o) { return o && typeof o === 'object' ? Object.keys(o) : []; }
  function filledItems(rec) { var it = (rec && rec.items) || {}; return keys(it).filter(function (k) { var x = it[k]; return x && ((x.text && String(x.text).trim()) || (x.note && String(x.note).trim()) || (x.tags && x.tags.length)); }).length; }

  /* ctx：{ now, cpAllOk（六個檢核點全亮）, shift（'day'|'night'） } */
  function metrics(player, ctx) {
    ctx = ctx || {}; player = player || {};
    var recs = arr(player.interviews), who = {}, complete = 0, maxItems = 0;
    recs.forEach(function (r) { if (!r || !r.personaId) return; var n = filledItems(r); if (n > 0) who[r.personaId] = Math.max(who[r.personaId] || 0, n); if (n > maxItems) maxItems = n; if (n >= 4) complete++; });
    var ids = keys(who);
    return {
      interviewees: ids.length, interviewIds: ids, interviewsDeep: complete, maxItems: maxItems,
      coreDone: CORE_IDS.filter(function (id) { return who[id]; }).length, coreTotal: CORE_IDS.length,
      rooms: arr(player.visited).length, cards: arr(player.cards).length, events: keys(player.seenEv).length,
      replays: arr(player.replays).length, partners: arr(player.discussion && player.discussion.partners).length,
      conclusions: arr(player.conclusions).length, chatTurns: Number(player.chatTurns || 0), playMin: Number(player.playMin || 0),
      night: !!(player.nightSeen || ctx.shift === 'night'), cpAllOk: !!ctx.cpAllOk
    };
  }

  /* 徽章定義：id、名稱、說明、條件。順序＝顯示順序。 */
  var DEFS = [
    { id: 'first_talk', icon: '🗣️', name: '破冰', desc: '第一次訪談（記下至少一格）', test: function (m) { return m.interviewees >= 1; } },
    { id: 'five_talks', icon: '🤝', name: '人脈王', desc: '訪談過 5 個不同的人', test: function (m) { return m.interviewees >= 5; } },
    { id: 'ten_talks', icon: '🏥', name: '急診百曉生', desc: '訪談過 10 個不同的人', test: function (m) { return m.interviewees >= 10; } },
    { id: 'all_core', icon: '🧩', name: '關係人全訪', desc: '案子的 10 位重要關係人都訪過', test: function (m) { return m.coreDone >= m.coreTotal; } },
    { id: 'deep_dig', icon: '⛏️', name: '追問到底', desc: '同一個人的紀錄填滿 4 格以上', test: function (m) { return m.interviewsDeep >= 1; } },
    { id: 'chatty', icon: '💬', name: '問到飽', desc: '即時訪談送出 20 題', test: function (m) { return m.chatTurns >= 20; } },
    { id: 'explorer', icon: '🧭', name: '走透透', desc: '走過 10 個房間', test: function (m) { return m.rooms >= 10; } },
    { id: 'mapper', icon: '🗺️', name: '急診地圖', desc: '走過 20 個房間', test: function (m) { return m.rooms >= 20; } },
    { id: 'notes', icon: '📌', name: '便利貼大師', desc: '記了 5 張便利貼或勘查卡', test: function (m) { return m.cards >= 5; } },
    { id: 'witness', icon: '👀', name: '現場目擊', desc: '遇到 3 個事件', test: function (m) { return m.events >= 3; } },
    { id: 'replay', icon: '⏪', name: '倒帶', desc: '看過一次回放', test: function (m) { return m.replays >= 1; } },
    { id: 'partner', icon: '👥', name: '兩人討論', desc: '跟至少一位同學完成討論', test: function (m) { return m.partners >= 1; } },
    { id: 'thinker', icon: '💡', name: '下結論', desc: '寫了第一條結論', test: function (m) { return m.conclusions >= 1; } },
    { id: 'half_hour', icon: '⏱️', name: '待了半小時', desc: '在急診室裡累計 30 分鐘', test: function (m) { return m.playMin >= 30; } },
    { id: 'marathon', icon: '🛋️', name: '久坐急診', desc: '在急診室裡累計 60 分鐘', test: function (m) { return m.playMin >= 60; } },
    { id: 'night_owl', icon: '🌙', name: '夜班', desc: '進過夜班的急診', test: function (m) { return m.night; } },
    { id: 'vip', icon: '🎩', name: '見到院長', desc: '在院長巡視的十分鐘裡跟他講到話', test: function (m) { return m.interviewIds.indexOf('superintendent') >= 0; } },
    { id: 'boss', icon: '📋', name: '被主任交辦', desc: '訪談過陳主任', test: function (m) { return m.interviewIds.indexOf('er_director') >= 0; } },
    { id: 'kid_whisperer', icon: '🧒', name: '哄小孩', desc: '從小米口中問到一件真的事', test: function (m) { return m.interviewIds.indexOf('kid') >= 0; } },
    { id: 'translator', icon: '🌏', name: '翻譯官', desc: '用短句問到 Siti 的需求', test: function (m) { return m.interviewIds.indexOf('migrant_caregiver') >= 0; } },
    { id: 'inclusive', icon: '🌈', name: '每個人都算數', desc: '訪談過小薇、恩哥、賴阿嬤、山哥其中三位', test: function (m) { return ['trans_woman', 'gay_partner', 'lonely_elder', 'street_man'].filter(function (id) { return m.interviewIds.indexOf(id) >= 0; }).length >= 3; } },
    { id: 'all_cp', icon: '🏁', name: '六燈全亮', desc: '六個檢核點全部通過', test: function (m) { return m.cpAllOk; } }
  ];
  function badges(m) { return DEFS.map(function (d) { return { id: d.id, icon: d.icon, name: d.name, desc: d.desc, ok: !!d.test(m) }; }); }
  function earned(m) { return badges(m).filter(function (b) { return b.ok; }); }

  /* 給班級排行的小物件（不含名字；名字由呼叫端補） */
  function summary(player, ctx) {
    var m = metrics(player, ctx);
    return { interviewees: m.interviewees, rooms: m.rooms, cards: m.cards, events: m.events, chatTurns: m.chatTurns, playMin: m.playMin, partners: m.partners, conclusions: m.conclusions, badges: earned(m).length, badgeIds: earned(m).map(function (b) { return b.id; }) };
  }
  /* 排行：scores = { sid: { name, ...summary } } → 每個項目的前三名 */
  var BOARD = [['interviewees', '訪談最多人', '人'], ['playMin', '待最久', '分鐘'], ['rooms', '走最多房間', '間'], ['chatTurns', '問最多題', '題'], ['cards', '便利貼最多', '張'], ['events', '遇到最多事件', '件'], ['badges', '徽章最多', '枚']];
  function leaderboard(scores, topN) {
    topN = topN || 3; var sids = keys(scores);
    return BOARD.map(function (b) {
      var rows = sids.map(function (sid) { return { sid: sid, name: (scores[sid] && scores[sid].name) || sid, v: Number((scores[sid] || {})[b[0]] || 0) }; }).filter(function (r) { return r.v > 0; })
        .sort(function (a, c) { return c.v - a.v || (a.sid < c.sid ? -1 : 1); }).slice(0, topN);
      return { key: b[0], label: b[1], unit: b[2], rows: rows };
    });
  }
  function html(m, esc) {
    esc = esc || function (s) { return String(s); };
    var bs = badges(m), got = bs.filter(function (b) { return b.ok; }).length;
    var stat = '<div class="row" style="gap:10px;flex-wrap:wrap;font-size:13px">' + [['訪談過', m.interviewees + ' 人'], ['房間', m.rooms + ' 間'], ['便利貼', m.cards + ' 張'], ['事件', m.events + ' 件'], ['即時提問', m.chatTurns + ' 題'], ['累計', m.playMin + ' 分鐘']].map(function (x) { return '<span><b>' + x[0] + '</b> ' + x[1] + '</span>'; }).join('') + '</div>';
    var grid = '<div class="achGrid">' + bs.map(function (b) { return '<div class="ach ' + (b.ok ? 'on' : '') + '" title="' + esc(b.desc) + '"><div class="achIcon">' + b.icon + '</div><div class="achName">' + esc(b.name) + '</div><div class="achDesc">' + esc(b.desc) + '</div></div>'; }).join('') + '</div>';
    return '<p class="muted" style="font-size:12px;margin:4px 0">徽章 ' + got + ' / ' + bs.length + '。這不是分數，只是記錄你在急診室裡做過的事。</p>' + stat + grid;
  }
  return { DEFS: DEFS, BOARD: BOARD, CORE_IDS: CORE_IDS, SPECIAL: SPECIAL, metrics: metrics, badges: badges, earned: earned, summary: summary, leaderboard: leaderboard, html: html };
});
