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

  /* 10-13 二丙第一堂課之後加的「問法」計數（楊老師：根據現狀設計新的成就去誘導）。
     現狀：440 題裡追問具體事件 7%、追問原因 3%、「你好」佔一成多、病患本人只有 1 個人問、每段對話中位 4 題。
     每送出一題呼叫一次 noteQuestion，結果累計在 player.q（只記次數，不存句子）。
     info：{ text, pid, prev（對方上一句回答）, first（這段對話的第一題）, n（這段對話已問到第幾題） } */
  var Q_EVENT = /(最近一次|上一次|上次|那時|當時|那天|昨天|剛才|剛剛|後來|然後呢|怎麼處理|舉.{0,2}例|具體|印象深刻)/, Q_WHY = /(為什麼|為何|怎麼會|卡在哪|怎麼知道|如果可以改|你當時希望)/;
  var Q_YESNO = /(嗎|有沒有|會不會|可不可以|能不能|是否|對不對|是不是)[？?。！!\s]*$/, Q_TEMPLATE = /(他一開始怎麼說|那天發生(了)?什麼|真正需要什麼)/;
  var Q_INTRO = /(我是|我們是|想請問|想問你|想跟你|想了解|訪談|訪問|請教|研究)/, Q_GREET = /^(你好|妳好|您好|哈囉|嗨+|hi+|hello|早安?|午安|謝謝|好的?|ok+|嗯+)[\s\S]{0,4}$/i;
  var KEY3 = ['patient', 'family', 'nurse'];
  function bareQ(t) { return String(t || '').replace(/[\s，,。.！!？?～~、：:；;「」『』（）()*]/g, ''); }
  function echoes(q, prev) {   /* 撿起對方剛說的詞：問句裡有連續三個字出現在對方上一句回答裡 */
    q = bareQ(q); prev = bareQ(prev).replace(/（[^）]*）/g, ''); if (q.length < 3 || prev.length < 3) return false;
    for (var i = 0; i + 3 <= q.length; i++) { var g = q.substr(i, 3); if (/^[一-鿿]{3}$/.test(g) && prev.indexOf(g) >= 0) return true; }
    return false;
  }
  function noteQuestion(player, info) {
    var q = player.q && typeof player.q === 'object' ? player.q : (player.q = {}), t = String(info.text || ''), b = bareQ(t);
    q.n = (q.n || 0) + 1;
    var tmpl = Q_TEMPLATE.test(t), greet = Q_GREET.test(b) || b.length <= 3;
    if (Q_EVENT.test(t) && !tmpl) q.ev = (q.ev || 0) + 1;
    if (Q_WHY.test(t)) q.why = (q.why || 0) + 1;
    if (!greet && info.prev && echoes(t, info.prev)) q.echo = (q.echo || 0) + 1;
    if (info.first && b.length >= 10 && Q_INTRO.test(t)) q.intro = (q.intro || 0) + 1;
    if (!greet && Number(info.n) > (q.chain || 0)) q.chain = Number(info.n);
    if (info.pid) { q.who = q.who || {}; if (!greet) q.who[info.pid] = (q.who[info.pid] || 0) + 1; }
    q.last = ((q.last || '') + (greet ? 'g' : Q_YESNO.test(t) ? 'y' : 'o')).slice(-10);   /* 最近十題：g 寒暄、y 是非題、o 其他 */
    return q;
  }

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
      night: !!(player.nightSeen || ctx.shift === 'night'), cpAllOk: !!ctx.cpAllOk,
      qEvent: Number((player.q || {}).ev || 0), qWhy: Number((player.q || {}).why || 0), qEcho: Number((player.q || {}).echo || 0), qIntro: Number((player.q || {}).intro || 0), qChain: Number((player.q || {}).chain || 0),
      qKey3: KEY3.filter(function (id) { return Number((((player.q || {}).who) || {})[id] || 0) >= 3; }).length,
      qOpen10: (function (s) { s = String(s || ''); return s.length >= 10 && s.split('y').length - 1 <= 2 && s.split('g').length - 1 === 0; })((player.q || {}).last)
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
    { id: 'q_intro', icon: '🪪', name: '先報上名來', desc: '第一句就說你是誰、想問什麼（3 次）', test: function (m) { return m.qIntro >= 3; } },
    { id: 'q_event', icon: '🎬', name: '回到現場', desc: '問了 5 題「最近一次／當時／後來」', test: function (m) { return m.qEvent >= 5; } },
    { id: 'q_why', icon: '🔍', name: '打破砂鍋', desc: '問了 3 題「為什麼／怎麼知道」', test: function (m) { return m.qWhy >= 3; } },
    { id: 'q_echo', icon: '🧲', name: '順藤摸瓜', desc: '撿起對方剛說的詞往下問（5 次）', test: function (m) { return m.qEcho >= 5; } },
    { id: 'q_chain', icon: '⛓️', name: '不換題', desc: '同一段訪談連續問到第 8 題', test: function (m) { return m.qChain >= 8; } },
    { id: 'q_key3', icon: '🎯', name: '找對人', desc: '病患本人、家屬、離院護理師各問 3 題以上', test: function (m) { return m.qKey3 >= 3; } },
    { id: 'q_open10', icon: '🚫', name: '少問是非題', desc: '連續 10 題裡沒有「你好」，是非題不超過 2 題', test: function (m) { return m.qOpen10; } },
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
  return { DEFS: DEFS, BOARD: BOARD, CORE_IDS: CORE_IDS, SPECIAL: SPECIAL, metrics: metrics, noteQuestion: noteQuestion, badges: badges, earned: earned, summary: summary, leaderboard: leaderboard, html: html };
});
