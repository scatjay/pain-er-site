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


  /* ───── 技能等級（10-13 楊老師：就目前學生的探問和情境感知能力，設定技能的等級，分成三級，課後更新）─────
     等級從學生自己這個房間的訪談逐字稿算（一位學生一次讀自己的一個節點），所以今天上午已經問過的也算。
     門檻是 10-13 用二丙、二乙兩班 79 人的實際提問試算定的（探問 63／15／1 人，情境感知 65／14／0 人），每堂課後依全班表現重算。 */
  var SK_ASK = ['開口問', '會追問', '追到底'], SK_CTX = ['到處看', '找對人', '對得起來'];
  var Q_SMS = /(簡訊|訊息|手機|衛教|連結|通知)/, Q_PASTE = /(問到這三件事|點畫面上的人物開始訪談)/;
  var KEYKIND = { patient: 'patient', family: 'family', nurse: 'nurse', triage_nurse: 'nurse' };
  /* chat：{ 記錄鍵: { personaId, turns:{ 鍵: {role,text,t} } } }（er/場次/chat/房間代碼/學號 底下的樣子） */
  function chatStats(chat) {
    var st = { n: 0, dup: 0, tmpl: 0, ev: 0, why: 0, echo: 0, yn: 0, deep: 0, sms: 0, whoN: 0, keyKinds: 0, who: {}, key: {} }, seen = {};
    keys(chat).forEach(function (rk) {
      var c = chat[rk] || {}, pid = c.personaId || rk, prev = '', nq = 0;
      keys(c.turns).map(function (k) { return c.turns[k]; }).sort(function (a, b) { return (a.t || 0) - (b.t || 0); }).forEach(function (t) {
        var x = String((t && t.text) || '');
        if (!t || t.role !== 'u') { prev = x; return; }
        var b = bareQ(x);
        if (seen[b] || Q_PASTE.test(x)) { st.dup++; return; }
        seen[b] = 1; st.n++; nq++;
        var tmpl = Q_TEMPLATE.test(x), greet = Q_GREET.test(b) || b.length <= 3;
        if (tmpl) st.tmpl++;
        if (Q_EVENT.test(x) && !tmpl) st.ev++;
        if (Q_WHY.test(x)) st.why++;
        if (Q_YESNO.test(x)) st.yn++;
        if (Q_SMS.test(x)) st.sms++;
        if (!greet && prev && echoes(x, prev)) st.echo++;
      });
      if (nq) { st.who[pid] = (st.who[pid] || 0) + nq; if (KEYKIND[pid]) st.key[KEYKIND[pid]] = (st.key[KEYKIND[pid]] || 0) + nq; }
      if (nq >= 6) st.deep++;
    });
    st.whoN = keys(st.who).length;
    st.keyKinds = keys(st.key).filter(function (k) { return st.key[k] >= 2; }).length;
    return st;
  }
  /* m：{ rooms（去過幾間）, remote（去過病患的家或回診門診）, interviews（有填內容的訪談紀錄份數）, conclusions } */
  function skills(st, m) {
    st = st || chatStats({}); m = m || {};
    var n = st.n || 0, ynR = n ? st.yn / n : 0, dupR = (st.dup + st.tmpl) / ((n + st.dup) || 1);
    function item(ok, text) { return { ok: !!ok, text: text }; }
    var a2 = [item(n >= 8, '不重複的提問 ' + Math.min(n, 8) + '／8 題'), item(st.ev + st.why >= 2, '追問「最近一次／當時」或「為什麼」 ' + Math.min(st.ev + st.why, 2) + '／2 題'), item(st.echo >= 2, '撿起對方剛說的詞往下問 ' + Math.min(st.echo, 2) + '／2 次'), item(st.deep >= 1, '同一位人物問滿 6 題 ' + Math.min(st.deep, 1) + '／1 位')];
    var a3 = a2.concat([item(n >= 12, '不重複的提問 ' + Math.min(n, 12) + '／12 題'), item(st.ev >= 4, '追問「最近一次／當時／後來」 ' + Math.min(st.ev, 4) + '／4 題'), item(st.why >= 2, '追問「為什麼／怎麼知道」 ' + Math.min(st.why, 2) + '／2 題'), item(st.echo >= 4, '撿起對方剛說的詞 ' + Math.min(st.echo, 4) + '／4 次'), item(st.deep >= 2, '兩位人物各問滿 6 題 ' + Math.min(st.deep, 2) + '／2 位'), item(n >= 5 && ynR < 0.35, '是非題（「嗎、有沒有」結尾）要少於 35%，現在 ' + Math.round(ynR * 100) + '%'), item(n >= 5 && dupR < 0.15, '別重複貼同一句、別照念檢核表的三句，這類要少於 15%，現在 ' + Math.round(dupR * 100) + '%')]);
    var rooms = Number(m.rooms) || 0, iv = Number(m.interviews) || 0, cc = Number(m.conclusions) || 0;
    var c2 = [item(rooms >= 8, '走過的房間 ' + Math.min(rooms, 8) + '／8 間'), item(st.whoN >= 4, '訪談過的人物 ' + Math.min(st.whoN, 4) + '／4 位'), item(st.keyKinds >= 1, '病人本人、家人、護理師，至少一種問過 2 題 ' + Math.min(st.keyKinds, 1) + '／1 種'), item(st.sms >= 3, '問到簡訊或手機的題數 ' + Math.min(st.sms, 3) + '／3 題')];
    var c3 = c2.concat([item(st.keyKinds >= 2, '病人本人、家人、護理師，兩種以上各問過 2 題 ' + Math.min(st.keyKinds, 2) + '／2 種'), item(st.whoN >= 5, '訪談過的人物 ' + Math.min(st.whoN, 5) + '／5 位'), item(st.sms >= 8, '問到簡訊或手機的題數 ' + Math.min(st.sms, 8) + '／8 題'), item(iv >= 4, '存下來的訪談紀錄 ' + Math.min(iv, 4) + '／4 份'), item(cc >= 1, '寫下第一條結論 ' + Math.min(cc, 1) + '／1 條'), item(!!m.remote, '去過病患的家或回診門診（用下方「院外」按鈕）')]);
    function lv(l2, l3) { return l3.every(function (i) { return i.ok; }) ? 3 : (l2.every(function (i) { return i.ok; }) ? 2 : 1); }
    function pack(names, l2, l3) {
      var L = lv(l2, l3), nxt = L >= 3 ? null : { lv: L + 1, name: names[L], items: L === 1 ? l2 : l3 };
      return { lv: L, name: names[L - 1], next: nxt };
    }
    return { ask: pack(SK_ASK, a2, a3), ctx: pack(SK_CTX, c2, c3) };
  }
  function skillsHtml(sk, esc, fresh) {
    esc = esc || function (s) { return String(s); };
    function card(title, s, desc) {
      var stars = '★'.repeat(s.lv) + '☆'.repeat(3 - s.lv), todo = s.next ? s.next.items.filter(function (i) { return !i.ok; }) : [];
      return '<div class="skCard"><div class="skHead"><b>' + esc(title) + '</b><span class="skStars" aria-label="第 ' + s.lv + ' 級">' + stars + '</span></div>' +
        '<div class="skLv">Lv.' + s.lv + '「' + esc(s.name) + '」' + (fresh && fresh[title] ? ' <span class="skNew">🎉 剛升級</span>' : '') + '</div><div class="muted" style="font-size:12px">' + esc(desc) + '</div>' +
        (s.next ? '<div style="margin-top:6px;font-size:13px"><b>升到 Lv.' + s.next.lv + '「' + esc(s.next.name) + '」還差：</b><ul class="skTodo">' + (todo.length ? todo.map(function (i) { return '<li>' + esc(i.text) + '</li>'; }).join('') : '<li>都達到了，再問一題就會升級</li>') + '</ul></div>' : '<div style="margin-top:6px;font-size:13px">🏆 已經是最高級。</div>') + '</div>';
    }
    return '<div class="skRow">' + card('探問', sk.ask, '怎麼問，才問得出對方遇到的事和真正的需要') + card('情境感知', sk.ctx, '找對人、看對地方，把不同人說的話對起來') + '</div>';
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
    return { interviewees: m.interviewees, rooms: m.rooms, cards: m.cards, events: m.events, chatTurns: m.chatTurns, playMin: m.playMin, partners: m.partners, conclusions: m.conclusions, badges: earned(m).length, skAsk: Number(((player || {}).skillLv || {}).ask) || 1, skCtx: Number(((player || {}).skillLv || {}).ctx) || 1, badgeIds: earned(m).map(function (b) { return b.id; }) };
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
  return { DEFS: DEFS, BOARD: BOARD, CORE_IDS: CORE_IDS, SPECIAL: SPECIAL, metrics: metrics, noteQuestion: noteQuestion, chatStats: chatStats, skills: skills, skillsHtml: skillsHtml, badges: badges, earned: earned, summary: summary, leaderboard: leaderboard, html: html };
});
