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
      return { cls: cur.cls, phase: ph, minsToStart: Math.ceil(cur.s - exact), minsToEnd: Math.ceil(cur.e - exact), start: cur.startHm, end: cur.endHm, dow: cur.dow, dowName: cur.dowName, atMs: cur.s * 60000, next: brief(nx, nowMin), last: null };
    }
    var last = null, next = null;
    occ.forEach(function (c) { if (c.e < nowMin) last = c; if (c.s > nowMin && !next) next = c; });
    var near = !last ? next : (!next ? last : ((next.s - nowMin) < (nowMin - last.e) ? next : last));
    return { cls: near.cls, phase: 'idle', minsToStart: Math.ceil(near.s - exact), minsToEnd: Math.ceil(near.e - exact), start: near.startHm, end: near.endHm, dow: near.dow, dowName: near.dowName, atMs: near.s * 60000, next: brief(next, nowMin), last: brief(last, nowMin) };
  }

  /* ───── 房間與逐字稿：分班、分波次（10-20 楊老師：「逐字稿進來之後，可以分班和分波次去瀏覽」）─────
     「波次」＝單元的第幾週（W6／W7／W8）：資料裡沒有別的波次欄位，三週共用同一個場次，只有週次有各班上課日的明確定義。
     房間算在哪一週＝房間建立時間落在該班的哪一週區間（各班上課前一小時起算，二甲比二丙晚兩天，所以邊界分開算）。
     房間的班級＝房主的班級（名單 → 房間自己的 cls → 第一位有班級的成員）；成員來自不同班就標混班。純函式，不碰 Firebase。 */
  var WEEK_START = { '二丙': ['2026-10-13T07:10', '2026-10-20T07:10', '2026-10-27T07:10', '2026-11-03T07:10'], '二乙': ['2026-10-13T11:50', '2026-10-20T11:50', '2026-10-27T11:50', '2026-11-03T11:50'], '二甲': ['2026-10-15T11:50', '2026-10-22T11:50', '2026-10-29T11:50', '2026-11-05T11:50'] };
  var WAVES = [{ w: 1, label: '第 1 週（W6）' }, { w: 2, label: '第 2 週（W7）' }, { w: 3, label: '第 3 週（W8）' }];
  function weekRange(cls, w) { var a = WEEK_START[cls] || WEEK_START['二丙']; return [w === 1 ? 0 : Date.parse(a[w - 1] + ':00+08:00'), Date.parse(a[w] + ':00+08:00')]; }
  /* 時間 t 落在該班第幾週；第 1 週涵蓋之前的一切，第 3 週結束（11/3）之後或沒有時間 → 0 */
  function weekOf(cls, t) {
    t = num(t, 0); if (!t) return 0;
    for (var w = 1; w <= 3; w++) { var rg = weekRange(cls, w); if (t >= rg[0] && t < rg[1]) return w; }
    return 0;
  }
  function roomClass(room, profiles) {
    room = room || {}; profiles = profiles || {}; var seen = {}, list = [];
    keys(room.members).forEach(function (s) { var c = (profiles[s] || {}).cls; if (c && !seen[c]) { seen[c] = 1; list.push(c); } });
    var host = (profiles[String(room.host)] || {}).cls || room.cls || list[0] || '';
    if (host && !seen[host]) { seen[host] = 1; list.push(host); }
    return { cls: host, mixed: list.length > 1, classes: list.sort() };
  }
  function roomChatStats(chatOfRoom) {
    var o = { turns: 0, asks: 0, convs: 0 };
    keys(chatOfRoom).forEach(function (sid) { keys(chatOfRoom[sid]).forEach(function (rec) {
      var ts = arr((chatOfRoom[sid][rec] || {}).turns); if (!ts.length) return; o.convs += 1; o.turns += ts.length; ts.forEach(function (x) { if (x && x.role === 'u') o.asks += 1; });
    }); });
    return o;
  }
  /* 一次標好每間房的班級、混班、週次、發言數（O(房間＋句數)）；之後篩選只是過濾這份陣列 */
  function indexRooms(rooms, profiles, chatsAll) {
    return arr(rooms).map(function (r) {
      var rc = roomClass(r, profiles), st = roomChatStats((chatsAll || {})[r.code]);
      return { code: r.code, room: r, cls: rc.cls, mixed: rc.mixed, classes: rc.classes, week: weekOf(rc.cls, r.createdAt), createdAt: num(r.createdAt, 0), turns: st.turns, asks: st.asks, convs: st.convs };
    });
  }
  function filterRooms(idx, f) {
    f = f || {}; var week = num(f.week, 0);
    return idx.filter(function (x) { return (!f.cls || x.cls === f.cls) && (!week || x.week === week); });
  }
  function sumRooms(list) { var o = { rooms: list.length, turns: 0, asks: 0, withChat: 0 }; list.forEach(function (x) { o.turns += x.turns; o.asks += x.asks; if (x.convs) o.withChat += 1; }); return o; }
  /* 上一間／下一間：只在「有逐字稿」的篩選結果內走；目前這間不在結果裡就回 pos＝-1，上一間／下一間從頭尾算起 */
  function chatNeighbors(list, code) {
    var w = list.filter(function (x) { return x.convs > 0; }).map(function (x) { return x.code; }), i = w.indexOf(String(code));
    return { n: w.length, pos: i, prev: i > 0 ? w[i - 1] : (i < 0 && w.length ? w[w.length - 1] : null), next: i >= 0 && i < w.length - 1 ? w[i + 1] : (i < 0 && w.length ? w[0] : null) };
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

  /* ═════ 兩頁共用：teacher.html（訪談監看）與 sb_dashboard.html（W8 故事板）═════
     楊老師 10-27 00:29：「要有不同天不同班級的篩選器顯示，還有介入的建議」「兩邊再做一次完整的統整」。
     這一段只放純函式（Node 可測）：週次×班級篩選與記住、頁首導覽、班級狀態列文字、介入建議的規則與呈現。
     兩頁用同一組 class（.dnav／.sg／.tl），CSS 區塊在兩頁各一份，test_sb_dashboard.js 逐字比對。
     「日期」＝單元的第幾週（W6／W7／W8）：每個班每週只上一堂，所以「某班某週」就是「某一天的那一堂課」，選單裡直接寫出日期與「今天」。 */
  var UNIT_SESS = 'ER-20261013', FILTER_KEY = 'erg_t_rm', DEID_KEY = 'erg_t_deid', CLASS_ORDER = ['二丙', '二乙', '二甲'];
  function p2(n) { return ('0' + n).slice(-2); }
  function tpd(ms) { var d = new Date(ms + TZ_MS); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
  function mdOf(ms) { var p = tpd(ms); return p.m + '/' + p.d; }
  function dayKeyOf(ms) { var p = tpd(ms); return '' + p.y + p2(p.m) + p2(p.d); }
  function dayMs(key) { return Date.parse(key.slice(0, 4) + '-' + key.slice(4, 6) + '-' + key.slice(6, 8) + 'T00:00:00+08:00'); }
  function classStartMs(cls, w) { var a = WEEK_START[cls]; return a && a[w - 1] ? Date.parse(a[w - 1] + ':00+08:00') + WINDOW_PAD_MIN * 60000 : 0; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function validFilter(w, c) { w = Number(w); return isFinite(w) && w >= 0 && w <= 3 && (c === '' || CLASS_ORDER.indexOf(c) >= 0); }

  /* 選單：value＝場次|週次|班級（週次 0＝三週累計、班級空＝三班）。今天有課的那一堂標「今天」。 */
  function menuOptions(now) {
    now = now == null ? Date.now() : Number(now);
    var today = dayKeyOf(now), out = [{ value: UNIT_SESS + '|0|', week: 0, cls: '', today: false, label: '全部（三週累計，三班）' }];
    [1, 2, 3].forEach(function (w) {
      out.push({ value: UNIT_SESS + '|' + w + '|', week: w, cls: '', today: false, label: w + '/3（W' + (5 + w) + '）三班' });
      CLASS_ORDER.forEach(function (c) {
        var ms = classStartMs(c, w), isToday = dayKeyOf(ms) === today;
        out.push({ value: UNIT_SESS + '|' + w + '|' + c, week: w, cls: c, today: isToday, label: '　└ ' + w + '/3（W' + (5 + w) + '）' + c + '（' + mdOf(ms) + ' 上課' + (isToday ? '・今天' : '') + '）' });
      });
    });
    return out;
  }
  function filterValue(f) { return UNIT_SESS + '|' + num(f.week, 0) + '|' + (f.cls || ''); }
  function defaultFilter(now) {
    var cc = currentClass(now); return { week: weekOf(cc.cls, cc.atMs) || 0, cls: cc.cls, manual: false };
  }
  /* 決定一開始用哪個篩選：網址 ?f=週|班（兩頁互相連結時帶著）＞同一個分頁記住的選擇（sessionStorage 'erg_t_rm'，老師手動選過才記）＞今天或最近一堂課 */
  function resolveFilter(now, search, storage) {
    var m = /[?&]f=([^&]+)/.exec(search || '');
    if (m) { var p = []; try { p = decodeURIComponent(m[1]).split('|'); } catch (e) { p = []; } if (validFilter(p[0], p[1] || '')) return { week: Number(p[0]), cls: p[1] || '', manual: true, from: 'url' }; }
    try { var s = JSON.parse((storage && storage.getItem(FILTER_KEY)) || 'null'); if (s && s.manual && typeof s.cls === 'string' && validFilter(s.week || 0, s.cls)) return { week: Number(s.week) || 0, cls: s.cls, manual: true, from: 'storage' }; } catch (e) {}
    var d = defaultFilter(now); d.from = 'auto'; return d;
  }
  function saveFilter(storage, f) { try { storage.setItem(FILTER_KEY, JSON.stringify({ week: num(f.week, 0), cls: f.cls || '', manual: !!f.manual })); } catch (e) {} }
  function filterRange(f) {
    var w = num(f.week, 0); if (!w) return [0, Infinity];
    if (f.cls && WEEK_START[f.cls]) return weekRange(f.cls, w);
    var lo = Infinity, hi = 0; CLASS_ORDER.forEach(function (c) { var r = weekRange(c, w); lo = Math.min(lo, r[0]); hi = Math.max(hi, r[1]); }); return [lo, hi];
  }
  function dayInFilter(key, f) { if (!/^\d{8}$/.test(String(key))) return false; var r = filterRange(f), s = dayMs(key); return s < r[1] && s + DAY_MS > r[0]; }
  function filterState(f, now) { var w = num(f.week, 0); if (!w) return 'all'; var r = filterRange(f); return now < r[0] ? 'future' : (now >= r[1] ? 'past' : 'current'); }
  function filterLabel(f) { var w = num(f.week, 0), c = f.cls || ''; return (c || '三班') + '・' + (w ? w + '/3（W' + (5 + w) + '）' + (c ? '，' + mdOf(classStartMs(c, w)) + ' 上課' : '') : '三週累計'); }
  function weekNoteBase(week) { week = num(week, 0); return week ? week + '/3（W' + (5 + week) + '）：二丙二乙 ' + mdOf(classStartMs('二丙', week)) + ' 起、二甲 ' + mdOf(classStartMs('二甲', week)) + ' 起（上課前一小時起算）。' : '三週累計。'; }

  /* 頁首導覽：兩頁互相連結，目前這頁標 aria-current；連結帶著手動選的篩選（?f=），本機測試再帶 test／now 這類參數 */
  var NAV = [{ id: 'talk', href: 'teacher.html', name: '訪談監看' }, { id: 'sb', href: 'sb_dashboard.html', name: 'W8 故事板' }], NAV_KEEP = ['test', 'variant', 'devteacher', 'now', 'sess', 'local'];
  function navQuery(f, search, isLocal) {
    var q = []; if (f && f.manual) q.push('f=' + encodeURIComponent(num(f.week, 0) + '|' + (f.cls || '')));
    if (isLocal) NAV_KEEP.forEach(function (k) { var m = new RegExp('[?&]' + k + '=([^&]*)').exec(search || ''); if (m) q.push(k + '=' + m[1]); });
    return q.length ? '?' + q.join('&') : '';
  }
  function navHtml(current, f, search, isLocal) {
    var qs = navQuery(f, search, isLocal);
    return '<nav class="dnav" aria-label="後台頁面">' + NAV.map(function (n) { return '<a href="' + n.href + esc(qs) + '"' + (n.id === current ? ' aria-current="page"' : '') + '>' + esc(n.name) + '</a>'; }).join('') + '</nav>';
  }
  function fmtIn(m) { m = Math.max(0, m); return m >= 2880 ? Math.floor(m / 1440) + ' 天' : m >= 120 ? Math.floor(m / 60) + ' 小時' + (m % 60 ? ' ' + (m % 60) + ' 分' : '') : m + ' 分'; }
  /* 班級狀態列的兩段文字（現在是哪一堂、下一堂）：兩頁同字 */
  function classBar(c) {
    var pf = c.phase, now;
    if (pf === 'during') now = '<b>現在：' + esc(c.cls) + '・上課中</b>（' + c.start + '–' + c.end + '，還有 ' + c.minsToEnd + ' 分）';
    else if (pf === 'before') now = '<b>現在：' + esc(c.cls) + '・上課前</b>（' + c.start + ' 開始，還有 ' + c.minsToStart + ' 分）';
    else if (pf === 'after') now = '<b>現在：' + esc(c.cls) + '・剛下課</b>（' + c.end + ' 下課，已過 ' + Math.max(0, -c.minsToEnd) + ' 分）';
    else now = '<b>現在：不在上課時段</b>（預設看最近一堂：' + esc(c.cls) + ' ' + c.dowName + ' ' + c.start + '–' + c.end + '）';
    var nx = c.next;
    return { nowHtml: now, nextText: nx ? '下一堂：' + nx.cls + ' ' + nx.dowName + ' ' + nx.start + (pf === 'idle' ? '（還有 ' + fmtIn(nx.minsToStart) + '）' : '') : '', during: pf === 'during' };
  }
  function legendHtml() { return '<div class="tl3 small muted">燈號：<span class="tl ok">綠</span> 正常、完成　<span class="tl warn">黃</span> 要留意、還沒開始　<span class="tl bad">紅</span> 要處理、出事　<span class="tl info">藍</span> 進行中、參考</div>'; }

  /* ───── 介入建議（給老師）：依數字自動列出「現在可以怎麼做」，每條附觸發的數字、對象人數（名單點開才看得到）、動作與話術 ─────
     門檻集中在 RULES.suggest。一條建議＝一個班一條規則；選「三班」時各班各算各的。話術只給老師看，不會自動送給學生。 */
  RULES.suggest = { minN: 3, minPct: 0.15, stuckN: 2, cpN: 4, cpPct: 0.3, coachN: 5, coachPct: 0.25, respN: 2, guideN: 3, nearN: 2, show: 8 };
  var SG_LEVEL = { bad: '現在處理', warn: '這堂課留意', info: '順手加分' };
  function sgPct(n, d) { return d ? Math.round(n / d * 100) + '%' : '0%'; }
  function sgSort(list) { var o = { bad: 0, warn: 1, info: 2 }; return list.sort(function (a, b) { return o[a.level] - o[b.level] || b.n / (b.base || 1) - a.n / (a.base || 1) || b.n - a.n || (a.id < b.id ? -1 : 1); }); }
  var SG_TALK_DOC = [
    { id: 'I_NOROOM', name: '已綁定沒進房', when: '已綁定、還沒進過任何一間房', thr: '≥3 人且 ≥15% 該班已綁定', level: '黃' },
    { id: 'I_NOASK', name: '進房沒開口', when: '進過房、還沒問過任何一題', thr: '≥3 人且 ≥15% 該班已綁定', level: '黃' },
    { id: 'I_STUCK', name: '卡住', when: '累計 30 分鐘以上，檢核點只亮 2 個以下', thr: '≥2 人', level: '紅' },
    { id: 'I_CP', name: '共同卡點', when: '進行中與卡住的人，第一個沒亮的檢核點是同一個', thr: '≥4 人且 ≥30% 進行中與卡住的人', level: '黃' },
    { id: 'H_OPEN', name: '開場沒說來意', when: '已問 3 題以上、第一句都沒說明來意', thr: '≥5 人且 ≥25% 問了 3 題以上的人', level: '黃' },
    { id: 'H_YN', name: '是非題偏多', when: '已問 5 題以上、是非題占 35% 以上', thr: '≥5 人且 ≥25% 問了 5 題以上的人', level: '黃' },
    { id: 'H_NOFOLLOW', name: '沒追問', when: '已問 8 題以上、追問「最近一次／為什麼」0 題', thr: '≥5 人且 ≥25% 問了 8 題以上的人', level: '黃' },
    { id: 'H_NOECHO', name: '沒接對方的話', when: '已問 8 題以上、0 次用到對方剛說的詞', thr: '≥5 人且 ≥25% 問了 8 題以上的人', level: '黃' },
    { id: 'H_KEY', name: '沒問關鍵人物', when: '已問 8 題以上、病人家屬護理師都不到 2 題', thr: '≥5 人且 ≥25% 問了 8 題以上的人', level: '黃' },
    { id: 'H_DUP', name: '重複貼／照念範本', when: '已問 5 題以上、重複或照念占 15% 以上', thr: '≥5 人且 ≥25% 問了 5 題以上的人', level: '黃' },
    { id: 'H_W7RESP', name: '回應需補強', when: '第 2 週回應指引審核判「需補強」', thr: '≥2 人', level: '黃' },
    { id: 'H_W7GUIDE', name: '個人指引沒開始', when: '第 2 週個人指引一件都還沒開始', thr: '≥3 人', level: '黃' },
    { id: 'P_NEAR', name: '差一步', when: '檢核點亮 5／6，只差一項', thr: '≥2 人', level: '藍' }
  ];
  var TALK_COACH = {
    H_OPEN: { phrase: '第一句沒有說明來意', min: 'openMinN', act: '請全班下一題先講一句「我是誰、想了解什麼」，再問問題。' },
    H_YN: { phrase: '問的題目是非題偏多', min: 'ynMinN', act: '示範把「這樣有幫助嗎？」改成「最近一次用的時候，哪裡有幫到、哪裡沒有？」。' },
    H_NOFOLLOW: { phrase: '問了 8 題以上都沒追問', min: 'followMinN', act: '示範一次追問：對方答完先別換題，補一句「最近一次是什麼時候？」或「為什麼會這樣？」。' },
    H_NOECHO: { phrase: '沒有接過對方剛說的詞', min: 'echoMinN', act: '示範「挑對方回答裡的一個詞，原樣放進你的下一題」。' },
    H_KEY: { phrase: '沒問到病人或家屬本人', min: 'keyMinN', act: '提醒換問病人本人或家屬：「你當時最想要的是什麼？」。' },
    H_DUP: { phrase: '重複貼同一句或照念檢核表', min: 'dupMinN', act: '提醒每一題都用自己的話問，不複製貼上。' }
  };
  function suggestInterview(out, cls) {
    var T = RULES.suggest, res = [], H = RULES.hint, pc = Math.round(T.minPct * 100) + '%';
    if (!out || !out.rows) return res;
    var classes = cls ? [cls] : out.funnel.map(function (f) { return f.cls; }).filter(function (c) { return c !== '其他'; });
    classes.forEach(function (c) {
      var rows = out.rows.filter(function (r) { return r.cls === c; }), base = rows.length; if (!base) return;
      function ids(f) { return rows.filter(f).map(function (r) { return r.sid; }); }
      function add(rule, level, sids, trigger, action, say, thr, den) { res.push({ id: rule + ':' + c, rule: rule, level: level, cls: c, n: sids.length, base: den || base, unit: '人', trigger: trigger, action: action, say: say || '', sids: sids, thr: thr }); }
      var big = function (n, den) { return n >= T.minN && n / (den || base) >= T.minPct; };
      var a = ids(function (r) { return r.sub === 'noroom'; });
      if (big(a.length)) add('I_NOROOM', 'warn', a, c + '有 ' + a.length + ' 人已綁定，但還沒進任何一間房', '開場花 2 分鐘帶全班操作：登入後按「開一間」，走進任何一間房。', '登入後按「開一間」，走進任何一間房，看看黃色「線索」牌子。', '≥' + T.minN + ' 人且 ≥' + pc + ' 該班已綁定');
      a = ids(function (r) { return r.sub === 'noask'; });
      if (big(a.length)) add('I_NOASK', 'warn', a, c + '有 ' + a.length + ' 人進了房間，但還沒問過任何一題', '請全班先問第 1 題：點一位人物，第一句說明你是誰、想了解什麼。', '點一位人物，第一句先說你是誰、想了解什麼。', '≥' + T.minN + ' 人且 ≥' + pc + ' 該班已綁定');
      a = ids(function (r) { return r.stage === 'S2'; });
      if (a.length >= T.stuckN) add('I_STUCK', 'bad', a, c + '有 ' + a.length + ' 人累計 30 分鐘以上，檢核點只亮 2 個以下', '走到座位旁，請他打開「檢核」分頁，看第一個沒打勾的細項，一起做完那一項。', '回到「檢核」分頁，看第一個沒打勾的細項。', '≥' + T.stuckN + ' 人');
      var prog = rows.filter(function (r) { return (r.stage === 'S2' || r.stage === 'S3') && r.cp && r.cp.first; }), cnt = {};
      prog.forEach(function (r) { (cnt[r.cp.first.id] = cnt[r.cp.first.id] || []).push(r); });
      var top = Object.keys(cnt).sort(function (x, y) { return cnt[y].length - cnt[x].length || x - y; })[0];
      if (top && cnt[top].length >= T.cpN && cnt[top].length / prog.length >= T.cpPct) { var f0 = cnt[top][0].cp.first; add('I_CP', 'warn', cnt[top].map(function (r) { return r.sid; }), c + '有 ' + cnt[top].length + ' 人（佔進行中與卡住的 ' + sgPct(cnt[top].length, prog.length) + '）卡在第 ' + top + ' 點「' + f0.label + '」', '停下來 3 分鐘，全班一起示範做完這一點。', f0.todo, '≥' + T.cpN + ' 人且 ≥' + Math.round(T.cpPct * 100) + '% 進行中與卡住的人', prog.length); }
      Object.keys(TALK_COACH).forEach(function (k) {
        var d = TALK_COACH[k], minN = H[d.min], den = rows.filter(function (r) { return r.ask.n >= minN; }).length,
          who = rows.filter(function (r) { return r.hints.some(function (h) { return h.key === k; }); }), s0 = who[0] && who[0].hints.filter(function (h) { return h.key === k; })[0];
        if (den && who.length >= T.coachN && who.length / den >= T.coachPct) add(k, 'warn', who.map(function (r) { return r.sid; }), c + '有 ' + who.length + ' 人（佔問了 ' + minN + ' 題以上的 ' + sgPct(who.length, den) + '）' + d.phrase, d.act, s0 ? s0.say : '', '≥' + T.coachN + ' 人且 ≥' + Math.round(T.coachPct * 100) + '% 問了 ' + minN + ' 題以上的人', den);
      });
      a = ids(function (r) { return r.hints.some(function (h) { return h.key === 'H_W7RESP'; }); });
      if (a.length >= T.respN) add('H_W7RESP', 'warn', a, c + '有 ' + a.length + ' 人的回應指引審核是「需補強」', '提醒照審核意見補寫，隔天再送。', '照審核意見補寫後，隔天再送。', '≥' + T.respN + ' 人');
      a = ids(function (r) { return r.hints.some(function (h) { return h.key === 'H_W7GUIDE'; }); });
      if (a.length >= T.guideN) add('H_W7GUIDE', 'warn', a, c + '有 ' + a.length + ' 人的個人指引一件都還沒開始', '請他們各挑指引第 1 件，只做最小的一步。', '先挑指引第 1 件的最小一步做。', '≥' + T.guideN + ' 人');
      a = ids(function (r) { return r.pos.some(function (h) { return h.key === 'P_NEAR'; }); });
      if (a.length >= T.nearN) add('P_NEAR', 'info', a, c + '有 ' + a.length + ' 人檢核點亮 5／6，只差一項', '直接稱讚、推他們過終點：告訴他們只差哪一項。', '你已經很接近了，只差最後一項。', '≥' + T.nearN + ' 人');
    });
    return sgSort(res);
  }
  /* 建議卡：觸發的數字、動作、話術；名單放在收合的 details 裡（點開才看得到），投影模式整塊藏掉（.priv） */
  function suggestHtml(list, opt) {
    opt = opt || {}; var nameOf = opt.nameOf || function (s) { return s; }, show = opt.show || RULES.suggest.show;
    if (!list.length) return '<div class="muted sg-empty">' + esc(opt.empty || '目前沒有達到門檻的事項。') + '</div>';
    function one(g) {
      var u = g.unit || '人';
      return '<div class="sg lv-' + g.level + '" data-rule="' + esc(g.rule) + '"><div class="sg-h"><span class="tl ' + g.level + '">' + SG_LEVEL[g.level] + '</span><b>' + esc(g.trigger) + '</b></div>' +
        '<div class="sg-w">觸發的數字：<b>' + g.n + '／' + g.base + ' ' + u + '（' + sgPct(g.n, g.base) + '）</b>・門檻 ' + esc(g.thr) + '</div>' +
        '<div class="sg-a"><b>可以這樣做</b>：' + esc(g.action) + '</div>' + (g.say ? '<div class="say">話術：「' + esc(g.say) + '」</div>' : '') +
        (g.sids && g.sids.length ? '<details class="sg-n priv"><summary>對象 ' + g.sids.length + ' 人（點開看名單）</summary><div>' + g.sids.map(function (s) { return esc(nameOf(s)); }).join('、') + '</div></details>' : '') + '</div>';
    }
    var head = list.slice(0, show).map(one).join(''), rest = list.slice(show);
    return head + (rest.length ? '<details class="sg-more"><summary>還有 ' + rest.length + ' 條</summary>' + rest.map(one).join('') + '</details>' : '');
  }
  function sgDocHtml(docs) {
    return '<details class="sg-doc"><summary>這些建議怎麼算的（規則與門檻）</summary><div class="scroll"><table><thead><tr><th>規則</th><th>什麼時候出現</th><th>門檻</th><th>燈號</th></tr></thead><tbody>' +
      docs.map(function (d) { return '<tr><td>' + esc(d.name) + '</td><td>' + esc(d.when) + '</td><td>' + esc(d.thr) + '</td><td>' + esc(d.level) + '</td></tr>'; }).join('') + '</tbody></table></div><div class="muted small">門檻只決定「要不要列出來」，不會改任何學生的狀態或成績。選三班時各班各算各的。</div></details>';
  }

  /* ───── W8 新技能「說故事」「有根據」（各三級）：欄位 skStory、skSource 跟著分數發布到 er/場次/score/學號（比照 skAsk、skCtx）─────
     另一位代理人在 achievements.js 做這兩項；欄位還沒有時一律顯示「—」，不報錯、不假裝成 Lv.1。也收 skillsW8:{story:{lv},source:{lv}} 這種形狀。 */
  function lv13(v) { v = Number(v); return v === Math.floor(v) && v >= 1 && v <= 3 ? v : 0; }
  function skW8Of(sc) { sc = sc || {}; var a = sc.skillsW8 || {}; return { story: lv13(sc.skStory) || lv13(a.story && a.story.lv), source: lv13(sc.skSource) || lv13(a.source && a.source.lv) }; }
  function skW8Dist(items) {
    var d = { n: items.length, story: [0, 0, 0, 0], source: [0, 0, 0, 0] };   /* 最後一格＝還沒有資料（—） */
    items.forEach(function (x) { d.story[x.story ? x.story - 1 : 3] += 1; d.source[x.source ? x.source - 1 : 3] += 1; });
    return d;
  }
  var SK_W8 = [{ key: 'story', name: '說故事' }, { key: 'source', name: '有根據' }];
  function skW8Cell(x, badge) { return SK_W8.map(function (k) { var lv = x[k.key]; return badge(lv || null, k.name + (lv ? ' Lv.' + lv : ' —')); }).join(' '); }
  /* 班級總覽：各級人數分布（badge＝產徽章的函式 (lv, 文字)；沒有就用純文字） */
  function skW8Html(d, badge) {
    badge = badge || function (lv, t) { return '<span class="pill">' + esc(t) + '</span>'; };
    var mx = Math.max.apply(null, [1].concat(d.story, d.source));
    return '<div class="skw8"><b>W8 技能等級分布</b> <span class="muted small">（' + d.n + ' 人；「—」＝還沒有資料）</span>' + SK_W8.map(function (k) {
      return '<div class="skw8-col"><b>' + esc(k.name) + '</b>' + [0, 1, 2, 3].map(function (i) {
        return '<div class="skw8-row"><span class="skw8-nm">' + (i < 3 ? badge(i + 1, 'Lv.' + (i + 1)) : badge(null, '—')) + '</span><span class="skw8-tr"><i style="width:' + Math.round(d[k.key][i] / mx * 100) + '%"></i></span><span class="skw8-n">' + d[k.key][i] + ' 人</span></div>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }
  var SG_SKW8_DOC = { id: 'S_SKW8', name: '說故事或有根據還在 Lv.0／Lv.1', when: 'W8 技能「說故事」「有根據」任一項還沒開始（—）或在 Lv.1；全班都還沒有資料時不列', thr: '≥3 人且 ≥15% 該班', level: '黃' };
  function suggestSkillW8(items, cls) {
    var T = RULES.suggest, res = [], classes = cls ? [cls] : CLASS_ORDER.concat(['未分班']);
    classes.forEach(function (c) {
      var list = items.filter(function (x) { return x.cls === c; }), low = list.filter(function (x) { return x.story <= 1 || x.source <= 1; });
      if (!list.some(function (x) { return x.story || x.source; })) return;   /* 欄位還沒發布：不把全班都當成 Lv.0 */
      if (low.length >= T.minN && low.length / list.length >= T.minPct) res.push({ id: 'S_SKW8:' + c, rule: 'S_SKW8', level: 'warn', cls: c, n: low.length, base: list.length, unit: '人',
        trigger: c + '有 ' + low.length + ' 人「說故事」或「有根據」還在 Lv.0（還沒開始）或 Lv.1', action: '投影一位已到 Lv.2 的同學的格子（先問本人同意），說明和 Lv.1 差在哪；再到還沒開始或 Lv.1 的人旁邊各問一句。',
        say: '你這一格的前後發生了什麼事？這句話的根據，是哪一張訪談卡？', sids: low.map(function (x) { return x.sid; }), thr: '≥' + T.minN + ' 人且 ≥' + Math.round(T.minPct * 100) + '% 該班' });
    });
    return res;
  }

  return { RULES: RULES, STAGES: STAGES, HINT_DEFS: HINT_DEFS, build: build, respState: respState, weekNode: weekNode, scope: scope, currentClass: currentClass, SCHEDULE: SCHEDULE, WINDOW_PAD_MIN: WINDOW_PAD_MIN, WEEK_START: WEEK_START, WAVES: WAVES, weekRange: weekRange, weekOf: weekOf, roomClass: roomClass, indexRooms: indexRooms, filterRooms: filterRooms, sumRooms: sumRooms, chatNeighbors: chatNeighbors,
    UNIT_SESS: UNIT_SESS, FILTER_KEY: FILTER_KEY, DEID_KEY: DEID_KEY, CLASS_ORDER: CLASS_ORDER, NAV: NAV, SG_LEVEL: SG_LEVEL, SG_TALK_DOC: SG_TALK_DOC, esc: esc, tpd: tpd, mdOf: mdOf, dayKeyOf: dayKeyOf, classStartMs: classStartMs, validFilter: validFilter,
    menuOptions: menuOptions, filterValue: filterValue, defaultFilter: defaultFilter, resolveFilter: resolveFilter, saveFilter: saveFilter, filterRange: filterRange, dayInFilter: dayInFilter, filterState: filterState, filterLabel: filterLabel, weekNoteBase: weekNoteBase,
    navQuery: navQuery, navHtml: navHtml, classBar: classBar, fmtIn: fmtIn, legendHtml: legendHtml, suggestInterview: suggestInterview, suggestHtml: suggestHtml, sgDocHtml: sgDocHtml, sgSort: sgSort, sgPct: sgPct,
    skW8Of: skW8Of, skW8Dist: skW8Dist, skW8Cell: skW8Cell, skW8Html: skW8Html, suggestSkillW8: suggestSkillW8, SG_SKW8_DOC: SG_SKW8_DOC, SK_W8: SK_W8 };
});
