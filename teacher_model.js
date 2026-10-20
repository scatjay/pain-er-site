/* 老師後台的資料層（純函式，Node 與瀏覽器共用）：把「房間、逐字稿、分數、在線、指引」算成「每位學生一列」，
   再算出班級漏斗、需要介入的人、差一步的人、全班共同問題。畫面（teacher.html）只負責呈現。
   規則不另寫第二套：檢核點＝app_core.checkpointState＋checkpoints.evaluate、技能與成就＝achievements.js、
   第 2 週＝week2.js；分層門檻沿用 tools/er_guidance.py 的 tier_of（1／8 題）。取「提問最多的那間房」現算，
   同 tools/er_analyze.js（INDIVIDUAL_GUIDANCE_PLAN 第 6 節已定）。不改任何評分或檢核判定規則，只讀它們的結果。
   輸入全是 teacher.html 已經讀進記憶體的資料，不新增 Firebase 監聽或讀取。currentClass（課表）與 scope（只算某一班）也在這裡，純函式。輸出不含姓名、信箱；學號只放在 sid。
   設計稿：ui/teacher_redesign_1020.md。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./app_core.js'), require('./checkpoints.js'), require('./achievements.js'), require('./week2.js'));
  else root.ERG_TMODEL = factory(root.ERG_CORE, root.ERG_CHECKPOINTS, root.ERG_ACH, root.ERG_WEEK2);
})(typeof self !== 'undefined' ? self : this, function (CORE0, CP0, ACH0, W20) {
  'use strict';

  /* 所有門檻集中在這裡；要調只改這一處。classSize＝三班選課人數（10-13 名冊，只有人數、沒有姓名）。 */
  var RULES = {
    classSize: { '二丙': 59, '二乙': 59, '二甲': 60 },
    onlineMs: 5 * 60000,
    stage: { startMin: 1, runMin: 8 },
    stuck: { playMin: 30, litMax: 2 },
    hint: { ynMinN: 5, ynRatio: 0.35, followMinN: 8, echoMinN: 8, keyMinN: 8, dupMinN: 5, dupRatio: 0.15, openMinN: 3, fewMax: 7 },
    interveneShow: 8
  };

  /* 狀態：S0 還沒進來（只有人數）、S1 進來沒開口、S2 卡住、S3 進行中、S4 完成 */
  var STAGES = [
    { id: 'S0', name: '未綁定', glyph: '○' }, { id: 'S1', name: '沒開口', glyph: '◔' }, { id: 'S2', name: '卡住', glyph: '⚠' },
    { id: 'S3', name: '進行中', glyph: '▶' }, { id: 'S4', name: '完成', glyph: '✔' }
  ];
  /* 建議的一句引導：key → 說明（畫面「規則是什麼」用）。say 的字句沿用 tools/er_guidance.py 與 checkpoints.js 的 todo。 */
  var HINT_DEFS = {
    H_NOROOM: { kind: 'stage', label: '還沒進房' }, H_NOASK: { kind: 'stage', label: '進房沒開口' }, H_FEW: { kind: 'stage', label: '題數太少' },
    H_STUCK: { kind: 'stage', label: '花時間沒進展' }, H_CP: { kind: 'cp', label: '檢核點卡關' },
    H_OPEN: { kind: 'coach', label: '開場沒說明來意' }, H_YN: { kind: 'coach', label: '是非題偏多' }, H_NOFOLLOW: { kind: 'coach', label: '沒追問' },
    H_NOECHO: { kind: 'coach', label: '沒接對方的話' }, H_KEY: { kind: 'coach', label: '沒問關鍵人物' }, H_DUP: { kind: 'coach', label: '重複貼／照念範本' },
    H_W7RESP: { kind: 'w7', label: '回應需補強' }, H_W7GUIDE: { kind: 'w7', label: '個人指引沒開始' }, P_NEAR: { kind: 'pos', label: '差一步' }, P_UP: { kind: 'pos', label: '技能升級' }, P_BADGE: { kind: 'pos', label: '成就 +3' }
  };

  function arr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); }
  function keys(o) { return o && typeof o === 'object' ? Object.keys(o) : []; }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

  /* 只留落在 [a,b) 的使用者與回答；沒有任何一句落在區間內的紀錄整筆拿掉 */
  function weekNode(node, rg) {
    var out = {};
    keys(node).forEach(function (rk) {
      var c = node[rk] || {}, tt = {}, k = 0;
      keys(c.turns).forEach(function (t) { var x = c.turns[t] || {}, at = num(x.t, 0); if (at >= rg[0] && at < rg[1]) { tt[t] = x; k += 1; } });
      if (k) out[rk] = Object.assign({}, c, { turns: tt });
    });
    return out;
  }
  function respState(r) {
    if (!r || !r.t) return 'none';
    if (r.rev && num(r.rev.at, 0) >= num(r.t, 0)) return r.rev.ok ? 'pass' : 'fix';
    return r.passed ? 'pass' : 'review';
  }
  function hint(key, sev, basis, say) { return { key: key, kind: (HINT_DEFS[key] || {}).kind || 'coach', label: (HINT_DEFS[key] || {}).label || key, sev: sev, basis: basis, say: say }; }

  function totalsOf(rows) {
    return { roster: 0, bound: rows.length, entered: rows.filter(function (r) { return r.rooms.length; }).length, asked: rows.filter(function (r) { return r.ask.n >= 1; }).length, online: rows.filter(function (r) { return r.online; }).length, passed: rows.filter(function (r) { return r.stage === 'S4'; }).length, S0: 0 };
  }
  function commonsOf(rows) {
    var firstUnlit = {}; rows.forEach(function (r) { if ((r.stage === 'S2' || r.stage === 'S3') && r.cp.first) firstUnlit[r.cp.first.id] = (firstUnlit[r.cp.first.id] || 0) + 1; });
    var hits = {}; rows.forEach(function (r) { r.hints.forEach(function (h) { if (h.kind === 'coach' || h.key === 'H_STUCK' || h.kind === 'w7') hits[h.key] = (hits[h.key] || 0) + 1; }); });
    return { firstUnlit: firstUnlit, hits: hits, nAsk5: rows.filter(function (r) { return r.ask.n >= RULES.hint.ynMinN; }).length, nAsk8: rows.filter(function (r) { return r.ask.n >= RULES.hint.followMinN; }).length };
  }
  /* 只算某一班：漏斗、總數、介入清單、差一步、全班共同問題都改成該班（cls 空＝原樣回傳）。用 build 的輸出重算，不再讀任何資料。 */
  function scope(out, cls) {
    if (!out || !cls) return out;
    var known = out.funnel.map(function (f) { return f.cls; }).filter(function (c) { return c !== '其他'; });
    var inCls = function (r) { return cls === '其他' ? (known.indexOf(r.cls) < 0 || r.cls === '其他') : r.cls === cls; };
    var rows = out.rows.filter(inCls), f = out.funnel.filter(function (x) { return x.cls === cls; }), tot = totalsOf(rows);
    if (f[0] && cls !== '其他') { tot.roster = f[0].size; tot.S0 = f[0].S0; }
    return Object.assign({}, out, { rows: rows, funnel: f, totals: tot, interventions: out.interventions.filter(inCls), nearly: out.nearly.filter(inCls), commons: commonsOf(rows), scopeCls: cls });
  }

  /* ───── 課表（單一來源）：依「現在是哪個班的上課時段」決定後台預設看哪一班 ─────
     上課時間 dow：0＝週日…6＝週六；時區固定 Asia/Taipei（UTC+8，無日光節約），所以只用 now（毫秒）加 8 小時算，不讀本機時區。
     顯示視窗＝上課前 PAD 分鐘到下課後 PAD 分鐘（含頭尾那一分鐘），與 tools/er_chat_daemon.py 的 CLASS_WINDOWS 一致
     （二丙 07:10–11:00、二乙與二甲 11:50–15:40）。 */
  var SCHEDULE = [
    { cls: '二丙', dow: 2, start: '08:10', end: '10:00' },
    { cls: '二乙', dow: 2, start: '12:50', end: '14:40' },
    { cls: '二甲', dow: 4, start: '12:50', end: '14:40' }
  ];
  var WINDOW_PAD_MIN = 60, TZ_MS = 8 * 3600000, DAY_MS = 86400000, DOW_NAME = '日一二三四五六';
  function hmMin(s) { var p = String(s).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function occurrences(now) {
    var day0 = Math.floor((now + TZ_MS) / DAY_MS) * DAY_MS - TZ_MS, dow0 = new Date(now + TZ_MS).getUTCDay(), out = [];
    for (var k = -8; k <= 8; k++) {
      var dow = (((dow0 + k) % 7) + 7) % 7, base = (day0 + k * DAY_MS) / 60000;
      SCHEDULE.forEach(function (c) { if (c.dow === dow) out.push({ cls: c.cls, dow: dow, dowName: '週' + DOW_NAME.charAt(dow), startHm: c.start, endHm: c.end, s: base + hmMin(c.start), e: base + hmMin(c.end) }); });
    }
    return out.sort(function (a, b) { return a.s - b.s; });
  }
  function brief(o, nowMin) { return o ? { cls: o.cls, dow: o.dow, dowName: o.dowName, start: o.startHm, end: o.endHm, startMs: o.s * 60000, minsToStart: Math.ceil(o.s - nowMin) } : null; }
  /* 回傳 { cls, phase:'before'|'during'|'after'|'idle', minsToStart, minsToEnd, start, end, dowName, next, last }。
     視窗內：cls＝該班；視窗外：cls＝距離現在最近的一堂（剛結束或快到）、phase 'idle'。
     minsToStart／minsToEnd 為無條件進位的整分鐘（已開始／已結束則 ≤0）；next＝在這之後的下一堂（idle 時＝真正的下一堂）。 */
  function currentClass(now) {
    now = now == null ? Date.now() : Number(now);
    var occ = occurrences(now), nowMin = Math.floor(now / 60000), exact = now / 60000, PAD = WINDOW_PAD_MIN, cur = null, i, o;
    for (i = 0; i < occ.length; i++) { o = occ[i]; if (nowMin >= o.s && nowMin < o.e) { cur = o; break; } }
    if (!cur) for (i = 0; i < occ.length; i++) { o = occ[i]; if (nowMin >= o.s - PAD && nowMin <= o.e + PAD) { cur = o; break; } }
    function after(c) { for (var j = 0; j < occ.length; j++) if (occ[j].s > c.s) return occ[j]; return null; }
    if (cur) {
      var ph = nowMin < cur.s ? 'before' : (nowMin < cur.e ? 'during' : 'after'), nx = after(cur);
      return { cls: cur.cls, phase: ph, minsToStart: Math.ceil(cur.s - exact), minsToEnd: Math.ceil(cur.e - exact), start: cur.startHm, end: cur.endHm, dow: cur.dow, dowName: cur.dowName, next: brief(nx, nowMin), last: null };
    }
    var last = null, next = null;
    occ.forEach(function (c) { if (c.e < nowMin) last = c; if (c.s > nowMin && !next) next = c; });
    var near = !last ? next : (!next ? last : ((next.s - nowMin) < (nowMin - last.e) ? next : last));
    return { cls: near.cls, phase: 'idle', minsToStart: Math.ceil(near.s - exact), minsToEnd: Math.ceil(near.e - exact), start: near.startHm, end: near.endHm, dow: near.dow, dowName: near.dowName, next: brief(next, nowMin), last: brief(last, nowMin) };
  }

  function build(input, opts) {
    input = input || {}; opts = opts || {};
    var D = opts.deps || {}, CORE = D.CORE || CORE0, CP = D.CP || CP0, ACH = D.ACH || ACH0, W2 = D.W2 || W20;   /* deps 只給單元測試換假的檢核點用 */
    var now = num(input.now, Date.now()), week = num(input.week, 0);
    var profiles = input.profiles || {}, scores = input.scores || {}, presence = input.presence || {}, chats = input.chats || {};
    var guides = input.guides || {}, guideResp = input.guideResp || {}, markers = input.markersByRoom || {};
    var classSize = input.classSize || RULES.classSize, R = RULES;
    var rooms = arr(input.rooms).filter(function (r) { return r && r.code; }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var byCode = {}; rooms.forEach(function (r) { byCode[r.code] = r; });
    var DB = { listRooms: function () { return rooms.map(function (r) { return { code: r.code }; }); }, getRoom: function (c) { return byCode[c]; } };
    var roomsBySid = {}; rooms.forEach(function (r) { keys(r.members).forEach(function (s) { (roomsBySid[s] = roomsBySid[s] || []).push(r); }); });
    var sids = {}; keys(profiles).forEach(function (s) { sids[s] = 1; });
    var w2on = !!(W2 && W2.started && W2.started(now));

    function rangeOf(cls) { return week > 0 && typeof input.weekRange === 'function' ? input.weekRange(cls, week) : null; }

    var rows = keys(sids).sort().map(function (sid) {
      var prof = profiles[sid] || {}, cls = prof.cls || '', mine = roomsBySid[sid] || [], sc = scores[sid] || scores[String(sid).toUpperCase()] || {};
      /* 檢核點：遊戲同一套 */
      var ev = null;
      try { ev = CP.evaluate(CORE.checkpointState(DB, 'S', sid, { cls: cls }, markers, { directions: [] })); } catch (e) { ev = null; }
      var passed = !!(ev && ev.passed), lit = ev ? ev.lit : -1;
      /* 提問最多的那間房（累計）：技能、成就、分層都用它；本週統計另外挑本週最多的那間 */
      function pick(filter) {
        var best = null, bestN = -1, bs = null;
        mine.forEach(function (r) { var node = (chats[r.code] || {})[sid] || {}; if (filter) node = filter(node); var cs = ACH.chatStats(node); if (cs.n > bestN) { bestN = cs.n; best = r; bs = cs; } });
        return { room: best, st: bs || ACH.chatStats({}) };
      }
      var cum = pick(null), rg = rangeOf(cls), wk = rg ? pick(function (n) { return weekNode(n, rg); }) : cum, S = wk.st;
      var pl = (cum.room && CORE.getPlayer(cum.room, sid)) || {};
      var roomsSeen = keys(pl.roomsSeen).length || arr(pl.visited).length;
      var iv = arr(pl.interviews).filter(function (r) { return r && r.items && keys(r.items).some(function (k) { var x = r.items[k]; return x && ((x.note && String(x.note).trim()) || x.done); }); }).length;
      var concl = arr(pl.conclusions).filter(function (x) { return x && String(x.text || '').trim(); }).length;
      var cases = {}; mine.forEach(function (r) { cases[r.case || 'sms'] = 1; });
      var casesN = keys(cases).length;
      var sk = ACH.skills(cum.st, { rooms: roomsSeen, interviews: iv, conclusions: concl, remote: !!((pl.roomsSeen || {}).home || (pl.roomsSeen || {}).clinic) });
      var met = ACH.metrics(pl, { cpAllOk: passed, cases: casesN });
      var badgeIds = ACH.DEFS.filter(function (d) { return d.test(met); }).map(function (d) { return d.id; });
      /* 最近一次提問（全期間） */
      var last = null;
      mine.forEach(function (r) { var node = (chats[r.code] || {})[sid] || {}; keys(node).forEach(function (rk) { var c = node[rk] || {}; keys(c.turns).forEach(function (k) { var t = c.turns[k]; if (t && t.role === 'u' && (!last || num(t.t, 0) > last.t)) last = { t: num(t.t, 0), pid: c.personaId || '', who: c.personaName || '', text: String(t.text || '') }; }); }); });
      var pres = num((presence[sid] || {}).t, 0), online = pres > 0 && now - pres < R.onlineMs;
      var playMin = num(sc.playMin, 0), n = cum.st.n, nScope = S.n;
      var first = ev && ev.next ? { id: ev.next.id, label: ev.next.label, todo: ev.next.text } : null;
      var other = ev && ev.list && ev.list[0] ? ev.list[0].detail : '';

      /* 狀態（互斥，依序判定） */
      var stage, sub = '';
      if (!mine.length) { stage = 'S1'; sub = 'noroom'; }
      else if (n < R.stage.startMin) { stage = 'S1'; sub = 'noask'; }
      else if (passed) stage = 'S4';
      else if (playMin >= R.stuck.playMin && lit <= R.stuck.litMax) { stage = 'S2'; sub = 'time'; }
      else { stage = 'S3'; sub = n < R.stage.runMin ? 'start' : 'run'; }

      /* W7 */
      var g = guides[sid] || null, w7 = null, guide = null, resp = respState(guideResp[sid]);
      if (g && g.items) { var gst = (g.st && g.st.items) || [], c = { ok: 0, part: 0, todo: 0 }; g.items.forEach(function (_, k) { c[(gst[k] || {}).s || 'todo'] += 1; }); guide = { total: g.items.length, ok: c.ok, part: c.part, todo: c.todo }; }
      if (w2on && W2.evaluate) {
        try { w7 = W2.evaluate({ guide: g || {}, sk: { ask: sk.ask.lv, ctx: sk.ctx.lv }, badges: badgeIds.length, cases: casesN, base: (g && g.base) || { ask: sk.ask.lv, ctx: sk.ctx.lv, badges: badgeIds.length }, resp: guideResp[sid] || {}, hasGuide: !!(g && g.items && g.items.length) }); } catch (e) { w7 = null; }
      }

      /* 建議的一句引導：basis＝依據的數字（老師可驗證）、say＝建議老師說的一句話 */
      var H = [], hh = R.hint;
      if (sub === 'noroom') H.push(hint('H_NOROOM', online ? 3 : 2, '已綁定，但還沒進過任何房間', '登入後按「開一間」，走進任何一間房，看看黃色「線索」牌子。'));
      else if (sub === 'noask') H.push(hint('H_NOASK', online ? 3 : 2, '進過房間，但還沒問過任何一題', '上課開放訪談時，點一位人物，第一句先說你是誰、想了解什麼。'));
      else if (sub === 'start') H.push(hint('H_FEW', 1, '已問 ' + n + ' 題（目標至少 8 題、2 位人物）', '上課時只問 3 題：一題問「最近一次」、一題問「為什麼」、一題接對方剛說的詞。'));
      if (stage === 'S2') H.push(hint('H_STUCK', online ? 3 : 2, '累計 ' + playMin + ' 分鐘，檢核點只亮 ' + lit + '／6' + (first ? '；第 ' + first.id + ' 點「' + first.label + '」還沒亮' + (first.id === 1 && other && other.indexOf('另外') >= 0 ? '（' + other.replace(/^.*?（/, '').replace(/）$/, '') + '）' : '') : ''), first ? first.todo : '回到「檢核」分頁，看第一個沒打勾的細項。'));
      if (stage === 'S3' && first) {
        var cpBasis = '第 ' + first.id + ' 點「' + first.label + '」還沒亮' + (first.id === 1 && other && other.indexOf('另外') >= 0 ? '（' + other.replace(/^.*?（/, '').replace(/）$/, '') + '）' : '');
        if (!(first.id === 2 && n < R.stage.runMin)) H.push(hint('H_CP', 1, cpBasis, first.todo));
      }
      /* 提問品質：只在樣本夠時才說 */
      var yn = S.yn, dupR = (S.dup + S.tmpl) / ((S.n + S.dup) || 1);
      if (nScope >= hh.ynMinN && yn / nScope >= hh.ynRatio) H.push(hint('H_YN', 1, nScope + ' 題裡 ' + yn + ' 題是非題＝' + pct(yn, nScope) + '%', '把「這樣有幫助嗎？」改成「最近一次用的時候，哪裡有幫到、哪裡沒有？」'));
      if (nScope >= hh.followMinN && S.ev + S.why === 0) H.push(hint('H_NOFOLLOW', 1, '已問 ' + nScope + ' 題，追問「最近一次／為什麼」0 題', '對方答完先別換題，補一句「最近一次是什麼時候？」或「為什麼會這樣？」'));
      if (nScope >= hh.echoMinN && S.echo === 0) H.push(hint('H_NOECHO', 1, nScope + ' 題裡 0 次用到對方剛說的詞', '挑對方回答裡的一個詞，原樣放進你的下一題。'));
      if (nScope >= hh.keyMinN && S.keyKinds === 0) H.push(hint('H_KEY', 1, '問過 ' + S.whoN + ' 位人物，但病人、家屬、護理師都不到 2 題', '換問病人本人或家屬：「你當時最想要的是什麼？」'));
      if (nScope >= hh.dupMinN && dupR >= hh.dupRatio) H.push(hint('H_DUP', 1, '重複貼同一句或照念檢核表三句佔 ' + pct(S.dup + S.tmpl, S.n + S.dup) + '%', '每一題都用自己的話問，不複製貼上。'));
      var q = null; mine.forEach(function (r) { var p = CORE.getPlayer(r, sid); if (p && p.q && (!q || num(p.q.n, 0) > num(q.n, 0))) q = p.q; });
      if (q && num(q.n, 0) >= hh.openMinN && !num(q.intro, 0)) H.push(hint('H_OPEN', 1, '已問 ' + num(q.n, 0) + ' 題，第一句都沒說明來意', '第一句先說你是誰、想了解什麼，再問問題。'));
      if (w7) {
        if (resp === 'fix') { var fb = String(((guideResp[sid] || {}).rev || {}).fb || ''); H.push(hint('H_W7RESP', 2, '回應指引審核：需補強', fb ? fb.slice(0, 60) : '照審核意見補寫後，隔天再送。')); }
        if (guide && guide.total > 0 && guide.ok === 0 && guide.part === 0 && stage !== 'S4') { var it0 = (g.items || [])[0] || {}; H.push(hint('H_W7GUIDE', 1, '個人指引 0／' + guide.total + ' 件開始', String(it0.small || it0.how || it0.title || '先挑指引第 1 件的最小一步做。'))); }
      }
      /* 正向 */
      var pos = [];
      if (!passed && lit === 5 && first) pos.push(hint('P_NEAR', 0, '檢核點亮 5／6', '只差「' + first.label + '」：' + first.todo));
      if (g && g.base) {
        var bA = num(g.base.ask, sk.ask.lv), bC = num(g.base.ctx, sk.ctx.lv), bB = num(g.base.badges, badgeIds.length);
        if (sk.ask.lv > bA || sk.ctx.lv > bC) pos.push(hint('P_UP', 0, '技能升級：' + [sk.ask.lv > bA ? '探問 Lv.' + bA + '→' + sk.ask.lv : '', sk.ctx.lv > bC ? '情境感知 Lv.' + bC + '→' + sk.ctx.lv : ''].filter(Boolean).join('、'), '稱讚他升級了，問他這週做了什麼不一樣的事。'));
        if (badgeIds.length >= bB + 3) pos.push(hint('P_BADGE', 0, '成就比 1/3 結束時多 ' + (badgeIds.length - bB) + ' 枚', '稱讚他的成就，問他最喜歡哪一枚。'));
      }
      H.sort(function (a, b) { return b.sev - a.sev; });
      var sevMax = H.reduce(function (m, x) { return Math.max(m, x.sev); }, 0);   /* 提問品質只是 sev 1（教練式提醒）；幾乎人人都有，不拿它升級成「要介入」 */
      if (stage === 'S4') sevMax = Math.min(sevMax, 1);   /* 已完成的人不進介入清單，只留提問品質小提醒 */
      var priority = stage === 'S4' ? 0 : sevMax * 100 + (online ? 10 : 0) + Math.min(9, H.length);

      return {
        sid: sid, cls: cls, stage: stage, sub: sub, online: online, lastSeen: Math.max(pres, last ? last.t : 0, num(sc.t, 0)), lastAsk: last,
        rooms: mine.map(function (r) { return { code: r.code, host: String(r.host) === String(sid) }; }),
        cp: { lit: lit, total: ev ? ev.total : 6, dots: ev ? ev.list.map(function (x) { return !!x.ok; }) : [], first: first, passed: passed, list: ev ? ev.list : [] },
        ask: { n: nScope, nAll: n, ev: S.ev, why: S.why, echo: S.echo, yn: yn, ynRatio: nScope ? yn / nScope : 0, dup: S.dup, tmpl: S.tmpl, dupRatio: dupR, whoN: S.whoN, keyKinds: S.keyKinds, deep: S.deep, sms: S.sms, intro: q ? num(q.intro, 0) : null },
        skill: { ask: sk.ask.lv, ctx: sk.ctx.lv, askNext: sk.ask.next, ctxNext: sk.ctx.next, reported: { ask: num(sc.skAsk, 0), ctx: num(sc.skCtx, 0) } },
        badges: { n: badgeIds.length, ids: badgeIds, reported: arr(sc.badgeIds).length }, cases: casesN, playMin: playMin,
        w7: w7, guide: guide, resp: resp, hints: H, pos: pos, sev: sevMax, priority: priority
      };
    });

    /* 班級漏斗：未綁定＝名冊人數 − 該班已綁定（以班為單位相減，不比對學號，所以不洩漏名單） */
    var clsList = keys(classSize), hasOther = rows.some(function (r) { return clsList.indexOf(r.cls) < 0; });
    if (hasOther) clsList = clsList.concat(['其他']);
    var funnel = clsList.map(function (c) {
      var rs = rows.filter(function (r) { return c === '其他' ? clsList.indexOf(r.cls) < 0 || r.cls === '其他' : r.cls === c; });
      var o = { cls: c, size: c === '其他' ? rs.length : num(classSize[c], 0), bound: rs.length, S0: 0, S1: 0, S2: 0, S3: 0, S4: 0, asked: 0 };
      rs.forEach(function (r) { o[r.stage] += 1; if (r.ask.n >= 1) o.asked += 1; });
      o.S0 = Math.max(0, o.size - o.bound);
      return o;
    });
    var totals = totalsOf(rows);
    funnel.forEach(function (f) { if (f.cls !== '其他') { totals.roster += f.size; totals.S0 += f.S0; } });

    var interventions = rows.filter(function (r) { return r.stage !== 'S4' && r.sev >= 2; })
      .sort(function (a, b) { return b.priority - a.priority || a.cp.lit - b.cp.lit || (a.sid < b.sid ? -1 : 1); })
      .map(function (r) { return { sid: r.sid, cls: r.cls, stage: r.stage, sev: r.sev, online: r.online, hints: r.hints.filter(function (h) { return h.kind !== 'pos'; }).slice(0, 3) }; });
    var nearly = []; rows.forEach(function (r) { r.pos.forEach(function (p) { nearly.push({ sid: r.sid, cls: r.cls, key: p.key, basis: p.basis, say: p.say }); }); });

    /* 全班共同問題：進行中與卡住的學生，第一個沒亮的檢核點分布；提問品質規則各命中幾人 */
    var commons = commonsOf(rows);

    return { now: now, week: week, totals: totals, rows: rows, funnel: funnel, interventions: interventions, nearly: nearly, commons: commons, defs: { RULES: RULES, STAGES: STAGES, HINTS: HINT_DEFS } };
  }

  return { RULES: RULES, STAGES: STAGES, HINT_DEFS: HINT_DEFS, build: build, respState: respState, weekNode: weekNode, scope: scope, currentClass: currentClass, SCHEDULE: SCHEDULE, WINDOW_PAD_MIN: WINDOW_PAD_MIN };
});
