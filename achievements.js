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
  /* 10-20：某一格（events／need）有沒有內容，判準同 filledItems（文字、備註或標籤任一有東西）。 */
  function itemHasContent(x) { return !!(x && ((x.text && String(x.text).trim()) || (x.note && String(x.note).trim()) || (x.tags && x.tags.length))); }
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
  /* 10-23 楊老師：非上課時間登入的人也要有成就。每送出一題即時訪談呼叫一次（panels.js），只記次數：
     n＝上課前後各 60 分鐘以外的題數、rest＝其中發生在「沒有任何班上課的日子」（週一三五六日）的題數、late＝其中 22:00–06:00 的題數。
     課表與 tools/er_chat_daemon.py 的 CLASS_WINDOWS、teacher_model.js 的 SCHEDULE 一致（test_achievements.js 有對照）。時區固定 UTC+8。 */
  var SCHED = [{ dow: 2, a: 8 * 60 + 10, b: 10 * 60 }, { dow: 2, a: 12 * 60 + 50, b: 14 * 60 + 40 }, { dow: 4, a: 12 * 60 + 50, b: 14 * 60 + 40 }], OFF_PAD = 60;
  function offHours(now) {
    var d = new Date(Number(now) + 8 * 3600000), dow = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    var inWin = SCHED.some(function (c) { return c.dow === dow && m >= c.a - OFF_PAD && m <= c.b + OFF_PAD; });
    return { off: !inWin, rest: !inWin && dow !== 2 && dow !== 4, late: !inWin && (m >= 22 * 60 || m < 6 * 60) };
  }
  function noteOffHours(player, now) {
    var h = offHours(now == null ? Date.now() : now); if (!h.off) return h;
    var o = player.off && typeof player.off === 'object' ? player.off : (player.off = {});
    o.n = (o.n || 0) + 1; if (h.rest) o.rest = (o.rest || 0) + 1; if (h.late) o.late = (o.late || 0) + 1;
    return h;
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
  /* 10-27 楊老師：回報也是一種技能，分三級（正向表列：只列做到什麼）。資料＝這位學生自己送過的回報（feedback.js 的本機紀錄） */
  var SK_REP = ['說出來', '說清楚', '幫大家修好'], DESC_REP = '遇到問題或有想法，說清楚，老師才修得好';
  function fbStats(list) {
    list = Array.isArray(list) ? list : []; var k = {};
    list.forEach(function (e) { if (e && e.kind) k[e.kind] = 1; });
    function clear(e) { return String((e && e.text) || '').replace(/\s/g, '').length >= 20; }
    return { n: list.length, kinds: Object.keys(k).length, clear: list.filter(clear).length, state: list.filter(function (e) { return !!(e && e.state); }).length,
      clearState: list.filter(function (e) { return clear(e) && !!e.state; }).length, ideas: list.filter(function (e) { return e && e.kind === 'idea'; }).length, bugs: list.filter(function (e) { return e && e.kind === 'bug'; }).length };
  }
  function skillReport(fb) {
    fb = fb || {}; var n = Number(fb.n) || 0, kinds = Number(fb.kinds) || 0, clear = Number(fb.clear) || 0, state = Number(fb.state) || 0;
    function item(ok, text) { return { ok: !!ok, text: text }; }
    var l2 = [item(n >= 2, '送出的回報 ' + Math.min(n, 2) + '／2 則'), item(clear >= 1, '寫得具體（20 字以上） ' + Math.min(clear, 1) + '／1 則'), item(state >= 1, '附上目前的畫面狀態 ' + Math.min(state, 1) + '／1 則')];
    var l3 = l2.concat([item(n >= 5, '送出的回報 ' + Math.min(n, 5) + '／5 則'), item(kinds >= 2, '有問題、建議、看不懂，至少兩種 ' + Math.min(kinds, 2) + '／2 種'), item(clear >= 3, '寫得具體（20 字以上） ' + Math.min(clear, 3) + '／3 則')]);
    function all(a) { return a.every(function (i) { return i.ok; }); }
    var lv = n < 1 ? 0 : (all(l3) ? 3 : (all(l2) ? 2 : 1));
    return { lv: lv, name: lv ? SK_REP[lv - 1] : '', next: lv >= 3 ? null : { lv: lv + 1, name: SK_REP[lv], items: lv === 0 ? [item(false, '送出第 1 則回報（問題、建議、看不懂都算）')] : (lv === 1 ? l2 : l3) } };
  }

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
    var a3 = a2.concat([item(n >= 12, '不重複的提問 ' + Math.min(n, 12) + '／12 題'), item(st.ev >= 4, '追問「最近一次／當時／後來」 ' + Math.min(st.ev, 4) + '／4 題'), item(st.why >= 2, '追問「為什麼／怎麼知道」 ' + Math.min(st.why, 2) + '／2 題'), item(st.echo >= 4, '撿起對方剛說的詞 ' + Math.min(st.echo, 4) + '／4 次'), item(st.deep >= 2, '兩位人物各問滿 6 題 ' + Math.min(st.deep, 2) + '／2 位'), item(n >= 5 && ynR <= 0.35, '是非題（「嗎、有沒有」結尾）不要超過 35%，現在 ' + Math.round(ynR * 100) + '%'), item(n >= 5 && dupR <= 0.15, '別重複貼同一句、別照念檢核表的三句，這類不要超過 15%，現在 ' + Math.round(dupR * 100) + '%')]);
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
  function skCard(title, s, desc, esc, fresh) {
    var stars = '★'.repeat(s.lv) + '☆'.repeat(3 - s.lv), todo = s.next ? s.next.items.filter(function (i) { return !i.ok; }) : [];
    return '<div class="skCard"><div class="skHead"><b>' + esc(title) + '</b><span class="skStars" aria-label="第 ' + s.lv + ' 級">' + stars + '</span></div>' +
      '<div class="skLv">' + (s.lv ? 'Lv.' + s.lv + '「' + esc(s.name) + '」' : '還沒開始') + (fresh && fresh[title] ? ' <span class="skNew">🎉 剛升級</span>' : '') + '</div><div class="muted" style="font-size:var(--fs-1)">' + esc(desc) + '</div>' +
      (s.next ? '<div style="margin-top:6px;font-size:var(--fs-2)"><b>升到 Lv.' + s.next.lv + '「' + esc(s.next.name) + '」還差：</b><ul class="skTodo">' + (todo.length ? todo.map(function (i) { return '<li>' + esc(i.text) + '</li>'; }).join('') : '<li>都達到了，再動一下就會升級</li>') + '</ul></div>' : '<div style="margin-top:6px;font-size:var(--fs-2)">🏆 已經是最高級。</div>') + '</div>';
  }
  var DESC_ASK = '怎麼問，才問得出對方遇到的事和真正的需要', DESC_CTX = '找對人、看對地方，把不同人說的話對起來';
  var DESC_STORY = '把訪談到的事排成一格一格的故事，讓人看得到他最卡的那一刻', DESC_SOURCE = '每一格都說得出是誰說的、來自哪一張訪談卡；猜的地方寫「推測」';
  function skillsHtml(sk, esc, fresh) {
    esc = esc || function (s) { return String(s); };
    return '<div class="skRow">' + skCard('探問', sk.ask, DESC_ASK, esc, fresh) + skCard('情境感知', sk.ctx, DESC_CTX, esc, fresh) + '</div>';
  }

  /* ───── W8 技能（10-27 楊老師：W8 的技能也要有三級）─────
     資料來源（Firebase，學生本人讀得到的節點）：
       sbx/{場次}/sb/{房間代碼}/wall/cells          這面牆的格子
       sbx/{場次}/sb/{房間代碼}/u_{學號}/cells      我自己的故事板的格子
       sbx/{場次}/sbm/{房間代碼}/{學號}             { personaCount（人物誌做了幾位）, recIds（第一次開故事板時已有的訪談卡）, personas }
     sbData 長相：{ sid, rooms: [ { code, wall, mine, meta } ] }（wall／mine 是 cells 節點原樣，陣列或物件都可以；meta 是 sbm 那一筆）。
     player＝玩家紀錄（要用 interviews 對出「引用的訪談卡是誰的話」）。多間房時每一項指標取各房最大值（只看對自己有利的那一間）。
     只列做到什麼，不扣分；沒資料（還沒開過故事板、或資料還沒讀回來）＝Lv.0「還沒開始」。 */
  var SK_STORY = ['排進格子', '串成故事', '說到痛點'], SK_SOURCE = ['附上出處', '引到不同人', '說自己的話'];
  var KEYP = { patient: 1, family: 1 };
  function cellHas(c) { return !!(c && (String(c.what || '').trim() || String(c.think || '').trim())); }
  function cellRefs(c) { return arr(c && c.refs).map(String).filter(Boolean); }
  function w8Metrics(sb, player) {
    var m = { cells: 0, moment: 0, pain: 0, personas: 0, keyPersona: 0, sourced: 0, distinct: 0, own: 0, guess: 0, momentFull: 0, oldCited: 0, keyCited: 0, thread: 0 };
    player = player || {};
    var sid = String((sb && sb.sid) || ''), recs = arr(player.interviews).filter(function (r) { return r && r.id; }), recPid = {};
    recs.forEach(function (r) { recPid[r.id] = r.personaId; });
    m.keyPersona = recs.filter(function (r) { return KEYP[r.personaId] && filledItems(r) > 0; }).length;
    arr(sb && sb.rooms).forEach(function (rm) {
      var wall = arr(rm && rm.wall).filter(cellHas), mine = arr(rm && rm.mine).filter(cellHas), meta = (rm && rm.meta) || {};
      var wallMine = wall.filter(function (c) { return String(c.by) === sid; }), my = mine.concat(wallMine);
      var base = {}; arr(meta.recIds).forEach(function (id) { base[id] = 1; });
      var r = { cells: Math.max(wall.length, mine.length), personas: Number(meta.personaCount) || 0, pain: 0, sourced: 0, own: 0, guess: 0, momentFull: 0, oldCited: 0, keyCited: 0 }, ds = {}, byP = {};
      r.moment = (mine.some(function (c) { return c.moment; }) || (wallMine.length && wall.some(function (c) { return c.moment; }))) ? 1 : 0;
      my.forEach(function (c) {
        var rf = cellRefs(c), pc = String(c.pain || '').trim();
        if (pc) r.pain++;
        if (rf.length) r.sourced++;
        rf.forEach(function (id) { ds[id] = 1; });
        if (c.er && (c.er.band === 'rewrite' || c.er.band === 'own')) r.own++;
        if (/推測/.test(String(c.what || '') + String(c.think || ''))) r.guess++;
        if (c.moment && pc && rf.length) r.momentFull = 1;
        if (rf.some(function (id) { return base[id]; })) r.oldCited++;
        var seenP = {}; rf.forEach(function (id) { var pid = recPid[id]; if (pid) seenP[pid] = 1; });
        if (Object.keys(seenP).some(function (pid) { return KEYP[pid]; })) r.keyCited++;
        Object.keys(seenP).forEach(function (pid) { byP[pid] = (byP[pid] || 0) + 1; });
      });
      r.distinct = keys(ds).length; r.thread = Math.max.apply(null, [0].concat(keys(byP).map(function (k) { return byP[k]; })));
      keys(r).forEach(function (k) { if (r[k] > m[k]) m[k] = r[k]; });
    });
    return m;
  }
  function skillsW8(sb, player) {
    var m = w8Metrics(sb, player);
    function item(ok, text) { return { ok: !!ok, text: text }; }
    function c(n, t) { return Math.min(m[n], t); }
    function pack(names, l1, l2, l3) {
      var all = function (l) { return l.every(function (i) { return i.ok; }); }, L = all(l3) ? 3 : (all(l2) ? 2 : (all(l1) ? 1 : 0)), lists = [l1, l2, l3];
      return { lv: L, name: L ? names[L - 1] : '還沒開始', next: L >= 3 ? null : { lv: L + 1, name: names[L], items: lists[L] } };
    }
    var s1 = [item(m.cells >= 1, '故事板有內容的格子 ' + c('cells', 1) + '／1 格')];
    var s2 = [item(m.cells >= 3, '故事板有內容的格子 ' + c('cells', 3) + '／3 格'), item(m.moment >= 1, '標出「關鍵時刻」 ' + c('moment', 1) + '／1 格'), item(m.pain >= 1, '把最卡的那一句標成痛點句（紅字） ' + c('pain', 1) + '／1 句')];
    var s3 = s2.concat([item(m.cells >= 6, '故事板有內容的格子 ' + c('cells', 6) + '／6 格'), item(m.pain >= 3, '標紅的痛點句 ' + c('pain', 3) + '／3 句'), item(m.personas >= 2, '人物誌 ' + c('personas', 2) + '／2 位'), item(m.keyPersona >= 1, '病人或家屬，至少訪談過 ' + c('keyPersona', 1) + '／1 位')]);
    var r1 = [item(m.sourced >= 1, '有出處的格子 ' + c('sourced', 1) + '／1 格')];
    var r2 = [item(m.sourced >= 3, '有出處的格子 ' + c('sourced', 3) + '／3 格'), item(m.distinct >= 2, '引用不同的訪談卡 ' + c('distinct', 2) + '／2 張'), item(m.own >= 1, '改寫或自己寫的格子 ' + c('own', 1) + '／1 格')];
    var r3 = r2.concat([item(m.sourced >= 6, '有出處的格子 ' + c('sourced', 6) + '／6 格'), item(m.distinct >= 4, '引用不同的訪談卡 ' + c('distinct', 4) + '／4 張'), item(m.guess >= 1, '自己猜的地方標上「推測」 ' + c('guess', 1) + '／1 格'), item(m.own >= 3, '改寫或自己寫的格子 ' + c('own', 3) + '／3 格')]);
    var story = pack(SK_STORY, s1, s2, s3), source = pack(SK_SOURCE, r1, r2, r3);
    var pl = player || {}, askLv = Number((pl.skillLv || {}).ask) || 1;
    var ids = [];
    if (m.personas >= 2 && m.keyPersona >= 1) ids.push('w8_people');
    if (m.momentFull) ids.push('w8_moment');
    if (m.guess >= 2) ids.push('w8_guess');
    if (m.oldCited >= 3) ids.push('x_bring_old');
    if (m.thread >= 3) ids.push('x_thread');
    if (m.keyCited >= 2) ids.push('x_keyperson');
    if (askLv >= 2 && source.lv >= 2) ids.push('x_ask_write');
    return { story: story, source: source, m: m, ids: ids };
  }

  /* ctx：{ now, cpAllOk（六個檢核點全亮）, shift（'day'|'night'） } */
  function metrics(player, ctx) {
    ctx = ctx || {}; player = player || {};
    var recs = arr(player.interviews), who = {}, complete = 0, maxItems = 0, pried = {};
    recs.forEach(function (r) { if (!r || !r.personaId) return; var n = filledItems(r); if (n > 0) who[r.personaId] = Math.max(who[r.personaId] || 0, n); if (n > maxItems) maxItems = n; if (n >= 4) complete++; if (CORE_IDS.indexOf(r.personaId) >= 0 && r.items && (itemHasContent(r.items.events) || itemHasContent(r.items.need))) pried[r.personaId] = 1; });
    var ids = keys(who);
    return {
      interviewees: ids.length, interviewIds: ids, coreOpened: keys(pried).length, interviewsDeep: complete, maxItems: maxItems,
      coreDone: CORE_IDS.filter(function (id) { return who[id]; }).length, coreTotal: CORE_IDS.length,
      rooms: arr(player.visited).length, cards: arr(player.cards).length, events: keys(player.seenEv).length,
      keep: arr(ctx.keep),   /* 10-15：之前在別間房已經解開的成就（從 score/{學號} 讀回來）；換案例開新房間時，已拿到的不會不見 */
      reports: Number(ctx.reports) || 0, fb: ctx.fb || null,   /* 10-27：回報技能與回報成就用（fbStats 的結果） */
        /* 10-23：回報過遊戲問題幾次（panels.js 的 achCtx 從本機回報紀錄算；過去的回報者由老師端補寫進 score） */
      cases: Number(ctx.cases) || 0,   /* 10-15：進過幾種不同案例的房間（大廳『開一間』的案例選單；由 panels.js 的 achCtx 從大廳索引算） */
      replays: arr(player.replays).length, partners: arr(player.discussion && player.discussion.partners).length,
      conclusions: arr(player.conclusions).length, chatTurns: Number(player.chatTurns || 0), playMin: Number(player.playMin || 0),
      night: !!(player.nightSeen || ctx.shift === 'night'), cpAllOk: !!ctx.cpAllOk,
      offTurns: Number((player.off || {}).n || 0), offRest: Number((player.off || {}).rest || 0), offLate: Number((player.off || {}).late || 0),
      qEvent: Number((player.q || {}).ev || 0), qWhy: Number((player.q || {}).why || 0), qEcho: Number((player.q || {}).echo || 0), qIntro: Number((player.q || {}).intro || 0), qChain: Number((player.q || {}).chain || 0),
      qKey3: KEY3.filter(function (id) { return Number((((player.q || {}).who) || {})[id] || 0) >= 3; }).length,
      w8: skillsW8(ctx.sb, player),
      qOpen10: (function (s) { s = String(s || ''); return s.length >= 10 && s.split('y').length - 1 <= 2 && s.split('g').length - 1 === 0; })((player.q || {}).last)
    };
  }

  /* 徽章定義：id、名稱、說明、條件。順序＝顯示順序。 */
  var DEFS = [
    { id: 'first_talk', icon: '🗣️', name: '破冰', desc: '第一次訪談（記下至少一格）', test: function (m) { return m.interviewees >= 1; } },
    /* 10-20 楊老師：對任一位重要關係人（core:true）問到「那天發生了什麼事」或「真正需要什麼」並記下，不只停在第一句。 */
    { id: 'pry_open', icon: '🔓', name: '撬開話匣子', desc: '讓任一位重要關係人說出「那天發生了什麼事」或「真正需要什麼」，並記下來', test: function (m) { return m.coreOpened >= 1; } },
    { id: 'five_talks', icon: '🤝', name: '人脈王', desc: '訪談過 5 個不同的人', test: function (m) { return m.interviewees >= 5; } },
    /* 10-15 楊老師：大家都只開第一個案例，沒發現還有其他五種 → 加三枚『換案例』成就（案例共 6 種） */
    { id: 'case_two', icon: '🚪', name: '換一間試試', desc: '玩過 2 種不同案例的房間（開房時，「案例」可以選別的）', test: function (m) { return m.cases >= 2; } },
    { id: 'case_four', icon: '🗺️', name: '四種案例', desc: '玩過 4 種不同案例的房間', test: function (m) { return m.cases >= 4; } },
    { id: 'case_all', icon: '🏆', name: '房間全解', desc: '6 種案例的房間都進去玩過', test: function (m) { return m.cases >= 6; } },
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
    { id: 'after_hours', icon: '🌆', name: '課後加班', desc: '不是上課時間，也回來訪談（5 題）', test: function (m) { return m.offTurns >= 5; } },
    { id: 'revisit', icon: '🔁', name: '回頭複習', desc: '沒有課的日子又回來訪談（3 題）', test: function (m) { return m.offRest >= 3; } },
    { id: 'late_night', icon: '🦉', name: '深夜研究員', desc: '晚上 10 點到清晨 6 點還在訪談（3 題）——研究很重要，也要睡覺', test: function (m) { return m.offLate >= 3; } },
    { id: 'bug_hunter', icon: '🐞', name: '抓蟲小幫手', desc: '回報過遊戲的問題，幫大家把它修好', test: function (m) { return m.reports >= 1; } },
    { id: 'idea_giver', icon: '💡', name: '出點子', desc: '送出一則建議，讓遊戲更好用', test: function (m) { return !!(m.fb && m.fb.ideas >= 1); } },
    { id: 'clear_report', icon: '📝', name: '說得清楚', desc: '一則回報寫了 20 字以上，還附上畫面狀態', test: function (m) { return !!(m.fb && m.fb.clearState >= 1); } },
    /* 10-23：這兩枚由每晚的審核程式（tools/er_guide_review.py）確認「真的照著做、數字有動」後寫進 score，學生端當作已拿到的成就保留；畫面上自己算不出來，所以 test 一律 false。 */
    { id: 'guide_followed', icon: '🎯', name: '照著指引做', desc: '回應指引通過審核，而且指引裡至少一件事真的做完了', test: function () { return false; } },
    { id: 'guide_effect', icon: '📈', name: '調整有效', desc: '回應指引通過審核，兩件以上有進步，或探問、情境感知升級', test: function () { return false; } },
    { id: 'vip', icon: '🎩', name: '見到院長', desc: '在院長巡視的十分鐘裡跟他講到話', test: function (m) { return m.interviewIds.indexOf('superintendent') >= 0; } },
    { id: 'boss', icon: '📋', name: '被主任交辦', desc: '訪談過陳主任', test: function (m) { return m.interviewIds.indexOf('er_director') >= 0; } },
    { id: 'kid_whisperer', icon: '🧒', name: '哄小孩', desc: '從小米口中問到一件真的事', test: function (m) { return m.interviewIds.indexOf('kid') >= 0; } },
    { id: 'translator', icon: '🌏', name: '翻譯官', desc: '用短句問到 Siti 的需求', test: function (m) { return m.interviewIds.indexOf('migrant_caregiver') >= 0; } },
    { id: 'inclusive', icon: '🌈', name: '每個人都算數', desc: '訪談過小薇、恩哥、賴阿嬤、山哥其中三位', test: function (m) { return ['trans_woman', 'gay_partner', 'lonely_elder', 'street_man'].filter(function (id) { return m.interviewIds.indexOf(id) >= 0; }).length >= 3; } },
    { id: 'all_cp', icon: '🏁', name: '六燈全亮', desc: '六個檢核點全部通過', test: function (m) { return m.cpAllOk; } },
    /* 10-26：W8 故事板成就（判準在 sb_core.js；故事板頁寫到 sbx/{場次}/sbach/{學號}，game.js 讀進 window.ERG_MY_SB_ACH） */
    { id: 'w8_together', icon: '🤝', name: '一起說故事', desc: '第 8 週故事板：同一面牆至少 3 位成員各補 1 格以上，其中有你', test: function () { return sbHas('together'); } },
    { id: 'w8_relay', icon: '🧩', name: '接力一格', desc: '第 8 週故事板：你寫的格子引用了另一位同學的訪談卡', test: function () { return sbHas('relay'); } },
    { id: 'w8_fill', icon: '🩹', name: '補位', desc: '第 8 週故事板：別人把格子標成「這格寫不出來」，你補上內容並附出處', test: function () { return sbHas('fill'); } },
    { id: 'w8_revisit', icon: '🔁', name: '回頭再問', desc: '第 8 週故事板：開了故事板之後回去訪談一位新的人，並把他的話放進故事板', test: function () { return sbHas('revisit'); } },
    { id: 'w8_premiere', icon: '🎬', name: '首映', desc: '第 8 週故事板：牆上至少 6 格有圖、有內容、有出處，並標出關鍵時刻（至少 2 人一起編）', test: function () { return sbHas('premiere'); } },
    { id: 'w8_askthenwrite', icon: '💬', name: '問了助教，自己寫完', desc: '第 8 週故事板：問過助教提示、檢查或句型，最後自己寫完且有出處', test: function () { return sbHas('askthenwrite'); } },
    { id: 'w8_allsourced', icon: '🔗', name: '整張每格都有出處', desc: '第 8 週故事板：一面故事板至少 6 格，每格都有內容也有出處', test: function () { return sbHas('allsourced'); } },
    { id: 'w8_nofill', icon: '✍️', name: '整張沒有代填', desc: '第 8 週故事板：一面故事板至少 6 格都有內容，沒有任何一格是助教代填', test: function () { return sbHas('nofill'); } },
    { id: 'w8_reclaim', icon: '♻️', name: '把示範改成自己的', desc: '第 8 週故事板：助教代填的格子，你改寫超過六成', test: function () { return sbHas('reclaim'); } },
    /* 10-27：W8 自己的成就（人物誌、關鍵時刻、猜測有標明）；判準在 skillsW8，資料來源見該處註解 */
    { id: 'w8_people', icon: '🧑‍🤝‍🧑', name: '兩位人物立起來', desc: '第 8 週：人物誌做了 2 位，而且你訪談過病人或家屬', test: function (m) { return hasW8(m, 'w8_people'); } },
    { id: 'w8_moment', icon: '⭐', name: '最卡的那一刻', desc: '第 8 週：標出關鍵時刻，那一格有內容、有紅字痛點句、有出處', test: function (m) { return hasW8(m, 'w8_moment'); } },
    { id: 'w8_guess', icon: '🤔', name: '猜的我有說', desc: '第 8 週：至少 2 格把自己猜的地方標上「推測」', test: function (m) { return hasW8(m, 'w8_guess'); } },
    /* 10-27：跨單元銜接（W6 訪談、W7 指引 → W8 故事板）。訪談卡沒有週次欄位，所以用「第一次開故事板時已經有的訪談卡」代表 W6／W7 做的；W8 才訪談的算 w8_revisit。 */
    { id: 'x_bring_old', icon: '🔗', name: '舊訪談派上用場', desc: '故事板至少 3 格，引用你開故事板之前就訪談好的卡片（W6、W7 的功夫沒有白做）', test: function (m) { return hasW8(m, 'x_bring_old'); } },
    { id: 'x_thread', icon: '🧵', name: '同一個人串到底', desc: '同一位人物的訪談卡，在故事板至少 3 格被引用', test: function (m) { return hasW8(m, 'x_thread'); } },
    { id: 'x_keyperson', icon: '🩺', name: '從病人或家屬說起', desc: '故事板至少 2 格，引用你訪談病人或家屬的卡片', test: function (m) { return hasW8(m, 'x_keyperson'); } },
    { id: 'x_ask_write', icon: '✒️', name: '會問也會寫', desc: '探問 Lv.2 以上，而且「有根據」也到 Lv.2 以上', test: function (m) { return hasW8(m, 'x_ask_write'); } }
  ];
  function hasW8(m, id) { return !!(m.w8 && m.w8.ids.indexOf(id) >= 0); }
  /* 單元分組（10-27 楊老師：成就要區分單元）。W6＝第一輪訪談、W7＝依指引再推進、W8＝人物誌＋故事板、x＝前後單元銜接、all＝不屬於哪一週。
     沒列在這裡的成就一律歸 all（通用）。 */
  var UNIT_NAME = { W8: 'W8　人物誌＋UX 故事板', x: '跨單元銜接（W6／W7 → W8）', W7: 'W7　依指引再推進', W6: 'W6　第一輪訪談', all: '通用（任何時候都算）' };
  var UNIT_OF = {};
  ['first_talk', 'pry_open', 'five_talks', 'ten_talks', 'all_core', 'deep_dig', 'chatty', 'q_intro', 'q_event', 'q_why', 'q_echo', 'q_chain', 'q_key3', 'q_open10', 'explorer', 'mapper', 'notes', 'witness', 'replay', 'partner', 'thinker', 'all_cp', 'vip', 'boss', 'kid_whisperer', 'translator', 'inclusive', 'case_two', 'case_four', 'case_all'].forEach(function (id) { UNIT_OF[id] = 'W6'; });
  ['guide_followed', 'guide_effect'].forEach(function (id) { UNIT_OF[id] = 'W7'; });
  ['w8_together', 'w8_relay', 'w8_fill', 'w8_premiere', 'w8_askthenwrite', 'w8_allsourced', 'w8_nofill', 'w8_reclaim', 'w8_people', 'w8_moment', 'w8_guess'].forEach(function (id) { UNIT_OF[id] = 'W8'; });
  ['w8_revisit', 'x_bring_old', 'x_thread', 'x_keyperson', 'x_ask_write', 'bug_hunter', 'idea_giver', 'clear_report'].forEach(function (id) { UNIT_OF[id] = 'x'; });   /* 10-27 楊老師：回報是跨作業的技能，回報成就歸跨單元 */
  DEFS.forEach(function (d) { d.unit = UNIT_OF[d.id] || 'all'; });
  function sbHas(k) { try { return ((typeof window !== 'undefined' && window.ERG_MY_SB_ACH) || []).indexOf(k) >= 0; } catch (e) { return false; } }
  function badges(m) { return DEFS.map(function (d) { return { id: d.id, unit: d.unit, icon: d.icon, name: d.name, desc: d.desc, ok: !!d.test(m) || (m.keep || []).indexOf(d.id) >= 0 }; }); }
  function earned(m) { return badges(m).filter(function (b) { return b.ok; }); }

  /* 給班級排行的小物件（不含名字；名字由呼叫端補） */
  function summary(player, ctx) {
    var m = metrics(player, ctx);
    var o = { interviewees: m.interviewees, rooms: m.rooms, cards: m.cards, events: m.events, chatTurns: m.chatTurns, playMin: m.playMin, partners: m.partners, conclusions: m.conclusions, badges: earned(m).length, skAsk: Number(((player || {}).skillLv || {}).ask) || 1, skCtx: Number(((player || {}).skillLv || {}).ctx) || 1, badgeIds: earned(m).map(function (b) { return b.id; }) };
    /* 10-27 W8 技能：有讀到故事板資料（ctx.sb）才寫；寫之前跟上次已發布的（ctx.prevSk）取大，等級不會倒退。Firebase 不收 undefined，所以沒資料就不加欄位。 */
    if (ctx && ctx.sb) { var ps = ctx.prevSk || {}; o.skStory = Math.max(m.w8.story.lv, Number(ps.story) || 0); o.skSource = Math.max(m.w8.source.lv, Number(ps.source) || 0); }
    return o;
  }
  /* 10-19 降流量：成就摘要的「變動判斷」不含 playMin（它每分鐘 +1，會讓每位前景學生每分鐘寫一次，全班人人收到）；
     playMin 改成累計滿 PLAYMIN_EVERY 分鐘才跟著寫一次，或離開頁面（force）時補寫。其他欄位一變就寫。 */
  var PLAYMIN_EVERY = 5;
  function scoreSig(s) { return JSON.stringify([s.interviewees, s.rooms, s.cards, s.events, s.chatTurns, s.partners, s.conclusions, s.badges, s.skAsk, s.skCtx, s.skStory, s.skSource]); }
  /* st = { sig, playMin }（上次寫出去的）；回傳 { write, sig }。force＝離開頁面時，playMin 只要有差就補寫 */
  function scoreDecide(st, s, force) {
    var sig = scoreSig(s), pm = Number(s.playMin) || 0, last = Number(st && st.playMin) || 0;
    if (!st || st.sig !== sig) return { write: true, sig: sig };
    if (pm - last >= PLAYMIN_EVERY || (force && pm !== last)) return { write: true, sig: sig };
    return { write: false, sig: sig };
  }
  /* 班級排行用的整份 score 節點：只在「成就」分頁開著時才訂閱，離開就退訂。subscribe(cb) 要回傳退訂函式。 */
  function makeScoreWatch(o) {
    var off = null;
    return {
      ensure: function () { if (off || o.getTab() !== 'ach') return false; off = o.subscribe(); return true; },
      tick: function () { if (off && o.getTab() !== 'ach') { try { off(); } catch (e) {} off = null; return true; } return false; },
      active: function () { return !!off; }
    };
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
  function html(m, esc, o) {
    esc = esc || function (s) { return String(s); };
    var bs = badges(m), got = bs.filter(function (b) { return b.ok; }).length;
    var stat = '<div class="row" style="gap:10px;flex-wrap:wrap;font-size:var(--fs-2)">' + [['訪談過', m.interviewees + ' 人'], ['房間', m.rooms + ' 間'], ['便利貼', m.cards + ' 張'], ['事件', m.events + ' 件'], ['即時提問', m.chatTurns + ' 題'], ['累計', m.playMin + ' 分鐘']].map(function (x) { return '<span><b>' + x[0] + '</b> ' + x[1] + '</span>'; }).join('') + '</div>';
    function gridOf(list) { return '<div class="achGrid">' + list.map(function (b) { return '<div class="ach ' + (b.ok ? 'on' : '') + '" title="' + esc(b.desc) + '"><div class="achIcon">' + b.icon + '</div><div class="achName">' + esc(b.name) + '</div><div class="achDesc">' + esc(b.desc) + '</div></div>'; }).join('') + '</div>'; }
    var head = '<p class="muted" style="font-size:var(--fs-1);margin:4px 0">徽章 ' + got + ' / ' + bs.length + '。這不是分數，只是記錄你在急診室裡做過的事。</p>' + stat;
    if (!o) return head + gridOf(bs);
    /* 10-27 依單元分組：本週單元排最前面並展開，前幾週收合（和大廳 W8 置頂、前週收合一致）。o：{ current:'W8'|'W7', sk:{ask,ctx}, fresh, open:{單元:true/false}（重畫前的展開狀態） } */
    var cur = o.current === 'W7' ? 'W7' : 'W8', order = cur === 'W8' ? ['W8', 'x', 'W7', 'W6', 'all'] : ['W7', 'W6', 'x', 'W8', 'all'], w8 = m.w8;
    var groups = order.map(function (u, i) {
      var list = bs.filter(function (b) { return b.unit === u; }), g = list.filter(function (b) { return b.ok; }).length, skh = '', skn = '';
      if (u === 'W7' && o.sk) { skh = '<div class="skRow">' + skCard('探問', o.sk.ask, DESC_ASK, esc, o.fresh) + skCard('情境感知', o.sk.ctx, DESC_CTX, esc, o.fresh) + '</div>'; skn = '　技能 探問 Lv.' + o.sk.ask.lv + '・情境感知 Lv.' + o.sk.ctx.lv; }
      if (u === 'W8' && w8) { skh = '<div class="skRow">' + skCard('說故事', w8.story, DESC_STORY, esc, o.fresh) + skCard('有根據', w8.source, DESC_SOURCE, esc, o.fresh) + '</div>'; skn = '　技能 說故事 Lv.' + w8.story.lv + '・有根據 Lv.' + w8.source.lv; }
      if (u === 'x' && m.fb) { var rp = skillReport(m.fb); skh = '<div class="skRow">' + skCard('回報', rp, DESC_REP, esc, o.fresh) + '</div>'; skn = '　技能 回報 Lv.' + rp.lv; }
      var open = o.open && o.open[u] !== undefined ? o.open[u] : i === 0;
      return '<details class="unitGrp" data-unit="' + u + '"' + (open ? ' open' : '') + '><summary><b>' + esc(UNIT_NAME[u]) + '</b>' + (i === 0 ? ' <span class="tag ok">本週</span>' : '') + '　成就 ' + g + ' / ' + list.length + esc(skn) + '</summary>' + skh + gridOf(list) + '</details>';
    }).join('');
    return head + groups;
  }
  return { fbStats: fbStats, skillReport: skillReport, skCard: skCard, DESC_REP: DESC_REP, DEFS: DEFS, BOARD: BOARD, CORE_IDS: CORE_IDS, SPECIAL: SPECIAL, metrics: metrics, noteQuestion: noteQuestion, noteOffHours: noteOffHours, offHours: offHours, SCHED: SCHED, chatStats: chatStats, skills: skills, skillsHtml: skillsHtml, skillsW8: skillsW8, UNIT_NAME: UNIT_NAME, SK_STORY: SK_STORY, SK_SOURCE: SK_SOURCE, badges: badges, earned: earned, summary: summary, leaderboard: leaderboard, html: html, scoreSig: scoreSig, scoreDecide: scoreDecide, makeScoreWatch: makeScoreWatch, PLAYMIN_EVERY: PLAYMIN_EVERY };
});
