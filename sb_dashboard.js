/* 第 8 週 UX 故事板「老師儀表板」：唯讀。計算（build）與畫面字串（html）都是純函式，Node 可測；mount 才碰 DOM。
   規劃見 docs/SB_DASHBOARD_PLAN.md。楊老師 10-26 22:21：「我其實只是把這裡當成 dashboard 在看，真的需要改，會在 Claude Code 的 session 裡面讓你改。」
   所以這個檔案沒有任何寫入：不呼叫 set／update／push／remove／transaction，也沒有改參數的操作。
   讀取只有 liveLoader 的七個路徑（進頁與每 10 分鐘各一次）；縮圖只在點開某一房時才讀（sbth），原圖（sbimg）完全不讀。
   10-27 00:29 楊老師：與老師後台（teacher.html）對齊——同一套「週次（哪一天那一堂）×班級」篩選、介入建議、頁首導覽、配色字級與燈號。
   篩選、導覽、建議卡的共用部分在 teacher_model.js（ERG_TMODEL），這裡只放故事板自己的規則。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'), require('./report_level.js'), require('./teacher_model.js'));
  else root.ERG_SBDASH = factory(root.ERG_SB, root.ERG_REPORT_LEVEL, root.ERG_TMODEL);
})(typeof self !== 'undefined' ? self : this, function (SB, RL, TM) {
  'use strict';
  var esc = SB.esc, arr = SB.arr;
  var DEFAULT_SESS = 'ER-20261013';   /* 與 game.js 的 UNIT_SESS、teacher.html 的 today() 同值 */
  var CLASSES = ['二甲', '二乙', '二丙'], NOCLS = '未分班';
  var HB_OK_MS = 60 * 1000, HB_WARN_MS = 10 * 60 * 1000, OPENED_IDLE_MS = 30 * 60 * 1000, DAYS_SHOWN = 14, SB_FIRST_WEEK = 3;   /* 故事板從第 3 週（W8）才有 */
  var CASE_MAIN = { sms: 'patient', wait: 'zhe_patient', way: 'auntie_lin', forms: 'tremor_ming', pay: 'qing_patient', peds: 'parent_kui' };   /* 各案例的主角（case_*.js 的 mainPersona） */
  var STAGES = [
    { id: 'roster', name: '在名冊裡' }, { id: 'interview', name: '有訪談紀錄' }, { id: 'opened', name: '開過故事板' }, { id: 'started', name: '寫了至少 1 格' },
    { id: 'six', name: '6 格有內容' }, { id: 'imgs', name: '6 格有圖' }, { id: 'moment', name: '標了關鍵時刻' }, { id: 'sourced', name: '每格有出處' }
  ];
  var KIND_NAME = { hint: '提示', check: '檢查', pattern: '句型示範', next: '往下一步', course: '課程問答', fill: '代填' };
  var CL_NAME = ['沒問過助教', '提示', '檢查', '句型示範', '代填'];
  var TOPICS = [
    ['Nielsen 十項準則', /nielsen|十項|準則|啟發式|heuristic/i], ['嚴重性評分', /嚴重/], ['訪談與追問', /訪談|追問|探問|怎麼問|問題怎麼問/], ['人物誌', /人物誌|persona/i],
    ['關鍵時刻與痛點', /關鍵時刻|痛點/], ['故事板與格子', /故事板|分鏡|格子|六格|6 ?格/], ['出處與引用', /出處|引用|編號|卡片/], ['圖片與 Gemini', /圖片|gemini|畫風|主角設定|提示詞|指令/i],
    ['Figma／AI Studio', /figma|ai ?studio/i], ['作業與評分', /作業|成績|分數|繳交|截止|評分|怎麼交|交什麼/], ['怎麼操作', /怎麼玩|按鈕|登入|房間|怎麼用|在哪裡/]
  ];
  var ACH_TXT = SB.ACH_META;

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function isTestSid(sid) { return /^(\d{1,3}|test.*|demo.*|t_.*)$/i.test(String(sid)); }   /* 純數字短編號（老師與測試）、test／demo 開頭不計入 */
  function clsOf(p) { var c = p && p.cls; return CLASSES.indexOf(c) >= 0 ? c : NOCLS; }
  function topicOf(text) { var t = String(text || ''); for (var i = 0; i < TOPICS.length; i += 1) if (TOPICS[i][1].test(t)) return TOPICS[i][0]; return '其他'; }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
  function rel(ms) { if (!(ms > 0)) return '—'; var m = Math.round(ms / 60000); if (m < 1) return '剛剛'; if (m < 90) return m + ' 分鐘前'; var h = ms / 3600000; return h < 36 ? Math.round(h) + ' 小時前' : Math.round(h / 24) + ' 天前'; }
  function clock(ts) { var d = new Date(Number(ts) + SB.LIMITS.tzOffsetMs), p = function (n) { return ('0' + n).slice(-2); }; return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); }

  /* ———— 純計算：把讀到的資料整理成整頁要的數字 ————
     raw：{ now, sess, profiles, rooms, sb, sbm, sbach, sbq, usage, config, coachUsage, worker } 全部是資料庫原樣，缺哪塊就當沒有 */
  function build(raw) {
    raw = raw || {}; var now = Number(raw.now) || Date.now(), cfg = SB.config(raw.config), ops = SB.opsState(raw.usage, now), day = SB.dayKey(now);
    var profiles = raw.profiles || {}, rooms = raw.rooms || {}, sb = raw.sb || {}, sbm = raw.sbm || {}, sbach = raw.sbach || {}, errors = arr(raw.errors || []), score = raw.score || {};
    var roster = {};
    function ensure(sid, cls) { sid = String(sid); if (isTestSid(sid)) return null; if (!roster[sid]) roster[sid] = { sid: sid, name: '', cls: cls || NOCLS, prog: {} }; return roster[sid]; }
    Object.keys(profiles).forEach(function (sid) { var s = ensure(sid, clsOf(profiles[sid])); if (s) { s.name = String((profiles[sid] || {}).name || ''); s.cls = clsOf(profiles[sid]); s.prog = (profiles[sid] || {}).progress || {}; } });
    Object.keys(rooms).forEach(function (code) { var r = rooms[code] || {}; Object.keys(r.members || {}).forEach(function (sid) { ensure(sid, CLASSES.indexOf(r.cls) >= 0 ? r.cls : NOCLS); }); });
    Object.keys(sb).forEach(function (code) { Object.keys(sb[code] || {}).forEach(function (bk) { SB.normBoard(sb[code][bk]).cells.forEach(function (c) { if (c.by) ensure(c.by, NOCLS); }); }); });
    var S = {}; Object.keys(roster).sort().forEach(function (sid) { S[sid] = { sid: sid, name: roster[sid].name, cls: roster[sid].cls, prog: roster[sid].prog, rooms: [], interviews: 0, report: { level: 0, stars: '☆☆☆', name: '尚未達到初稿', maybe3: false }, opened: false, firstOpenAt: 0, cells: [] }; });
    var alias = {}; Object.keys(S).forEach(function (sid, i) { alias[sid] = '學生' + (i + 1 < 10 ? '0' : '') + (i + 1); });

    /* 房間：每人的訪談數、報告等級（取最高的一間） */
    Object.keys(rooms).forEach(function (code) {
      var r = rooms[code] || {}, players = r.players || {};
      Object.keys(r.members || {}).forEach(function (sid) {
        var s = S[sid]; if (!s) return; s.rooms.push(code);
        var pl = players[sid] || {}, n = SB.interviewCount(pl); s.interviews += n;
        var inp = { interviews: pl.interviews, askLv: s.prog.ask, ctxLv: s.prog.ctx, conclusions: pl.conclusions, markers: [], mainPersona: CASE_MAIN[r.case || 'sms'] };
        var ev = RL.evaluate(inp), ev3 = RL.evaluate({ interviews: inp.interviews, askLv: inp.askLv, ctxLv: inp.ctxLv, conclusions: inp.conclusions, markers: [{ type: '矛盾' }], mainPersona: inp.mainPersona });
        if (ev.level > s.report.level || (ev.level === s.report.level && ev3.level > ev.level)) s.report = { level: ev.level, stars: ev.stars, name: ev.name, code: code, caseId: r.case || 'sms', maybe3: ev3.level === 3 && ev.level < 3 };
        else if (ev.level === s.report.level && ev3.level === 3 && ev.level < 3) s.report.maybe3 = true;
      });
    });
    /* 第一次開故事板 */
    Object.keys(sbm).forEach(function (code) { Object.keys(sbm[code] || {}).forEach(function (sid) { var s = S[sid], t = num((sbm[code][sid] || {}).firstOpenAt); if (s && t > 0) { s.opened = true; if (!s.firstOpenAt || t < s.firstOpenAt) s.firstOpenAt = t; } }); });
    /* 故事板：每個人「寫的格子」＝作者是他且有內容 */
    var boardsByRoom = {}, allCells = [];
    Object.keys(sb).forEach(function (code) {
      boardsByRoom[code] = [];
      Object.keys(sb[code] || {}).forEach(function (bk) {
        var cells = SB.normBoard(sb[code][bk]).cells; boardsByRoom[code].push({ bk: bk, cells: cells });
        cells.forEach(function (c) { var w = Object.assign({ code: code, board: bk }, c); allCells.push(w); if (SB.hasContent(c) && c.by && S[c.by]) { S[c.by].cells.push(w); S[c.by].opened = true; } });
      });
    });

    var students = Object.keys(S).map(function (sid) {
      var s = S[sid], cs = s.cells, n = cs.length, m = { n: n, img: 0, refs: 0, moment: 0, ai: 0, aiStill: 0, aiBack: 0, copy: 0, rewrite: 0, own: 0, sumR: 0, coach: 0, maxCl: 0, upd: 0, cl: [0, 0, 0, 0, 0] };
      cs.forEach(function (c) {
        if (c.img) m.img += 1; if (c.refs.length) m.refs += 1; if (c.moment) m.moment += 1; if (c.aiText) { m.ai += 1; if (c.er && c.er.band !== 'ai') m.aiBack += 1; } if (c.cl >= 1) m.coach += 1; m.maxCl = Math.max(m.maxCl, c.cl); m.upd = Math.max(m.upd, c.updatedAt || 0); m.cl[Math.max(0, Math.min(4, c.cl))] += 1;
        var b = c.er ? (c.er.band || SB.band(c.er.r)) : ''; if (b === 'ai') { m.aiStill += 1; } else if (b === 'copy' || b === 'rewrite' || b === 'own') { m[b] += 1; m.sumR += num(c.er.r); }
      });
      var pass = [true, s.interviews >= 1, s.opened, n >= 1, n >= 6, m.img >= 6, m.moment >= 1, n >= 6 && m.refs === n], reach = 0;
      while (reach < pass.length && pass[reach]) reach += 1;
      var flags = [];
      if (n >= 1 && m.aiStill === n) flags.push({ id: 'allai', text: '全代填', sev: 1 });
      if (s.opened && n === 0 && s.firstOpenAt > 0 && now - s.firstOpenAt >= OPENED_IDLE_MS) flags.push({ id: 'openedidle', text: '開了沒寫（' + rel(now - s.firstOpenAt).replace('前', '') + '）', sev: 2 });
      if (n >= 2 && m.copy / n >= 0.8 && !(m.aiStill === n)) flags.push({ id: 'copy', text: '照抄草稿', sev: 3 });
      if (n >= 3 && n - m.refs >= 1) flags.push({ id: 'nosrc', text: '沒出處 ' + (n - m.refs) + ' 格', sev: 4 });
      if (s.interviews >= 1 && !s.opened) flags.push({ id: 'notopened', text: '訪談了沒開板', sev: 5 });
      var denom = Math.max(6, n), srcPct = Math.min(1, m.refs / denom), ownPct = Math.min(1, m.sumR / denom), repPct = s.report.level / 3;
      return { sid: sid, name: s.name, alias: alias[sid], cls: s.cls, rooms: s.rooms, interviews: s.interviews, report: s.report, opened: s.opened, firstOpenAt: s.firstOpenAt, m: m, reach: reach, stuckAt: reach < STAGES.length ? STAGES[reach].name : '', flags: flags, ach: String((sbach[sid] || {}).ids || '').split(',').filter(Boolean), sk: TM.skW8Of(score[sid] || score[String(sid).toUpperCase()]),
        score: { report: repPct, source: srcPct, own: ownPct, total: Math.round((repPct + srcPct + ownPct) / 3 * 100) } };
    });
    var clsMap = {}; students.forEach(function (x) { clsMap[x.sid] = x.cls; });

    /* 漏斗：全部與每班 */
    function funnelOf(list) {
      var total = list.length;
      return { total: total, steps: STAGES.map(function (st, i) { var c = list.filter(function (x) { return x.reach > i; }).length; return { id: st.id, name: st.name, n: c, pct: pct(c, total) }; }), stuck: [] };
    }
    var clsList = CLASSES.slice(); if (students.some(function (x) { return x.cls === NOCLS; })) clsList.push(NOCLS);
    var funnel = { '全部': funnelOf(students) }; clsList.forEach(function (c) { funnel[c] = funnelOf(students.filter(function (x) { return x.cls === c; })); });
    /* funnel.stuck[i]：通過第 i+1 關、卡在第 i+2 關的人（名稱＝卡住的那一關） */
    Object.keys(funnel).forEach(function (k) { var f = funnel[k]; f.stuck = STAGES.slice(1).map(function (st, i) { var idx = i + 1; return { name: st.name, n: students.filter(function (x) { return (k === '全部' || x.cls === k) && x.reach === idx; }).length }; }); });

    /* 房間牆 */
    var roomList = Object.keys(sb).map(function (code) {
      var r = rooms[code] || {}, host = S[r.host], boards = boardsByRoom[code], wall = { cells: [] }, mine = 0, all = [];
      boards.forEach(function (b) { if (b.bk === 'wall') wall = b; else mine += 1; all = all.concat(b.cells); });
      var cls = CLASSES.indexOf(r.cls) >= 0 ? r.cls : (host ? host.cls : NOCLS);
      return { code: code, caseId: r.case || '', cls: cls, members: Object.keys(r.members || {}).length, wall: SB.boardStats(wall), mine: mine, imgs: all.filter(function (c) { return !!c.img; }).length, authors: SB.authorSummary(all), updatedAt: all.reduce(function (a, c) { return Math.max(a, c.updatedAt || 0); }, 0) };
    }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });

    /* 助教：今天（現況用）＋每一天的原始整理（依篩選的日期範圍再加總，見 coachFor） */
    var cuAll = raw.coachUsage || {}, cu = cuAll[day] || {}, kinds = {}; Object.keys(KIND_NAME).forEach(function (k) { kinds[k] = num((cu.byKind || {})[k]); });
    var cuUsers = cu.users || {}, usd = num(cu.nusd) / 1e9;
    var trend = Object.keys(cuAll).filter(function (d) { return /^\d{8}$/.test(d); }).sort().reverse().slice(0, DAYS_SHOWN).map(function (d) { var u = cuAll[d] || {}; return { day: d, calls: num(u.calls), usd: num(u.nusd) / 1e9, fills: num(u.fills), users: Object.keys(u.users || {}).length, byUser: u.users || {} }; });
    var coachDays = {};
    Object.keys(cuAll).filter(function (d) { return /^\d{8}$/.test(d); }).forEach(function (d) {
      var u = cuAll[d] || {}, bk = {}; Object.keys(KIND_NAME).forEach(function (k) { bk[k] = num((u.byKind || {})[k]); });
      coachDays[d] = { day: d, calls: num(u.calls), usd: num(u.nusd) / 1e9, fills: num(u.fills), users: u.users || {}, byKind: bk, capHits: { user: num((u.capHits || {}).user), fill: num((u.capHits || {}).fill), usd: num((u.capHits || {}).usd) },
        cq: Object.keys(u.cq || {}).sort().map(function (k) { var q = u.cq[k] || {}; return { sid: String(q.sid || ''), ask: String(q.ask || ''), topic: topicOf(q.ask) }; }) };
    });
    var cq = Object.keys(cu.cq || {}).sort().map(function (k) { var q = cu.cq[k] || {}; return { sid: String(q.sid || ''), ask: String(q.ask || ''), topic: topicOf(q.ask) }; });
    var topicCount = {}; cq.forEach(function (q) { topicCount[q.topic] = (topicCount[q.topic] || 0) + 1; });
    var topics = Object.keys(topicCount).map(function (k) { return { name: k, n: topicCount[k] }; }).sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); });
    var topUsers = Object.keys(cuUsers).map(function (sid) { return { sid: sid, n: num(cuUsers[sid]), cap: cfg.coachPerDay > 0 && num(cuUsers[sid]) >= cfg.coachPerDay }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    var clDist = [0, 0, 0, 0, 0]; allCells.forEach(function (c) { if (SB.hasContent(c)) clDist[Math.max(0, Math.min(4, c.cl))] += 1; });
    var aiCells = allCells.filter(function (c) { return !!c.aiText && SB.hasContent(c); });
    var coach = { calls: num(cu.calls), usd: usd, byKind: kinds, fills: num(cu.fills), users: Object.keys(cuUsers).length, capUsers: Object.keys(cuUsers).filter(function (k) { return cfg.coachPerDay > 0 && num(cuUsers[k]) >= cfg.coachPerDay; }).length,
      capHits: { user: num((cu.capHits || {}).user), fill: num((cu.capHits || {}).fill), usd: num((cu.capHits || {}).usd) }, trend: trend, questions: cq, topics: topics, topUsers: topUsers, clDist: clDist, aiCells: aiCells.length, aiReclaimed: aiCells.filter(function (c) { return c.er && c.er.band !== 'ai'; }).length };

    /* 出事了嗎（現況：這一刻、全站，不隨篩選變） */
    var q = (raw.sbq || {})[day] || {}, site = num(q.total), upUsers = Object.keys(q.u || {}), capUp = upUsers.filter(function (k) { return cfg.uploadPerUserDay > 0 && num(q.u[k]) >= cfg.uploadPerUserDay; }).length;
    var hbT = num((raw.worker || {}).heartbeat), hbAge = hbT > 0 ? Math.max(0, now - hbT) : null;
    var hb = { known: hbT > 0, ageMs: hbAge, level: hbT <= 0 ? 'bad' : (hbAge <= HB_OK_MS ? 'ok' : (hbAge <= HB_WARN_MS ? 'warn' : 'bad')), mode: (raw.worker || {}).mode || '', dayUsd: (raw.worker || {}).dayUsd };
    var alerts = [];
    function addAlert(level, text) { alerts.push({ level: level, text: text }); }
    if (!hb.known) addAlert('bad', '助教後端沒有心跳資料（沒有在跑）。學生按助教不會有回應。'); else if (hb.level === 'bad') addAlert('bad', '助教後端 ' + rel(hbAge) + '就沒有心跳了。'); else if (hb.level === 'warn') addAlert('warn', '助教後端心跳 ' + Math.round(hbAge / 60000) + ' 分鐘前（超過 1 分鐘）。');
    if (!ops.known) addAlert('warn', '沒有 Firebase 用量資料（每小時排程沒寫入），全站保護沒有依據。'); else if (ops.incomplete) addAlert('warn', '用量排程沒讀到本月下載量，保護沒有依據。'); else if (ops.stale) addAlert('warn', 'Firebase 用量超過 3 小時沒更新。');
    if (ops.mode === 'thumb') addAlert('warn', '保護模式：縮圖（本月下載 ' + (ops.gb !== null ? ops.gb.toFixed(2) : '?') + ' GB）。'); else if (ops.mode === 'noupload') addAlert('bad', '保護模式：停止上傳圖片。'); else if (ops.mode === 'readonly') addAlert('bad', '保護模式：唯讀，學生不能再改。');
    if (cfg.uploadSiteDay > 0 && site >= cfg.uploadSiteDay) addAlert('bad', '今天全站上傳已達上限（' + site + '／' + cfg.uploadSiteDay + '）。'); else if (cfg.uploadSiteDay > 0 && site >= cfg.uploadSiteDay * 0.8) addAlert('warn', '今天全站上傳已用 ' + pct(site, cfg.uploadSiteDay) + '%（' + site + '／' + cfg.uploadSiteDay + '）。');
    if (capUp) addAlert('warn', capUp + ' 人今天的個人上傳名額用完了。');
    if (cfg.coachDayUsd > 0 && usd >= cfg.coachDayUsd) addAlert('bad', '助教今天的費用已達日上限（US$' + usd.toFixed(4) + '）。'); else if (cfg.coachDayUsd > 0 && usd >= cfg.coachDayUsd * 0.8) addAlert('warn', '助教今天的費用已用 ' + pct(usd, cfg.coachDayUsd) + '%（US$' + usd.toFixed(4) + '）。');
    if (coach.capUsers) addAlert('warn', coach.capUsers + ' 人今天的助教名額用完了。');
    if (coach.capHits.user + coach.capHits.fill + coach.capHits.usd) addAlert('warn', '助教被擋：個人次數 ' + coach.capHits.user + '、代填 ' + coach.capHits.fill + '、費用 ' + coach.capHits.usd + '。');
    errors.forEach(function (e) { addAlert('warn', '讀不到' + e + '：那一塊先不顯示。'); });
    var level = alerts.some(function (a) { return a.level === 'bad'; }) ? 'bad' : (alerts.length ? 'warn' : 'ok');
    var dl = ops.known && ops.gb !== null;
    var tiles = [
      { label: '本月下載', value: dl ? ops.gb.toFixed(2) + ' GB／10 GB' : '—', note: dl ? '約 ' + Math.round(ops.gb * 10) + '%' + (ops.stale ? '・超過 3 小時沒更新' : '') : (ops.known ? '排程沒拿到下載量' : '尚無用量資料'), level: !dl ? 'warn' : (ops.gb >= 7 ? 'warn' : '') },
      { label: '保護模式', value: { normal: '正常', thumb: '縮圖模式', noupload: '停止上傳', readonly: '唯讀' }[ops.mode], note: '7 GB 縮圖・8.5 GB 停傳・9.5 GB 唯讀', level: ops.mode === 'normal' ? '' : (ops.mode === 'thumb' ? 'warn' : 'bad') },
      { label: '今日上傳', value: site + '／' + cfg.uploadSiteDay + ' 張', note: upUsers.length + ' 人上傳過・每人上限 ' + cfg.uploadPerUserDay, level: site >= cfg.uploadSiteDay ? 'bad' : (site >= cfg.uploadSiteDay * 0.8 ? 'warn' : '') },
      { label: '助教今日', value: coach.calls + ' 次・US$' + usd.toFixed(4), note: coach.users + ' 人用過・日上限 US$' + cfg.coachDayUsd, level: usd >= cfg.coachDayUsd ? 'bad' : (usd >= cfg.coachDayUsd * 0.8 ? 'warn' : '') },
      { label: '後端心跳', value: hb.known ? (hb.level === 'ok' ? '正常（' + Math.round(hbAge / 1000) + ' 秒前）' : '沒在跑（' + rel(hbAge) + '）') : '沒有資料', note: hb.known && hb.mode === 'once' ? '單次模式' : '助教後端', level: hb.level === 'ok' ? '' : (hb.level === 'warn' ? 'warn' : 'bad') }
    ];
    var extra = [{ label: '同時連線最高值', value: ops.known ? ops.peak + '／100' : '—' }, { label: '資料庫儲存', value: ops.known && ops.storageGB !== null ? (ops.storageGB * 1000).toFixed(0) + ' MB／1 GB' : '—' }];

    /* 成就 */
    var opened = students.filter(function (x) { return x.opened; });
    var ach = ACH_TXT.map(function (a) {
      var row = { id: a.id, group: a.group, icon: a.icon, name: a.name, how: a.how, n: 0, byCls: {} }; clsList.forEach(function (c) { row.byCls[c] = 0; });
      students.forEach(function (x) { if (x.ach.indexOf(a.id) >= 0) { row.n += 1; row.byCls[x.cls] = (row.byCls[x.cls] || 0) + 1; } });
      return row;
    });
    return { now: now, sess: raw.sess || DEFAULT_SESS, day: day, cfg: cfg, ops: ops, tiles: tiles, extra: extra, alerts: alerts, level: level, hb: hb, siteToday: site, upUsers: upUsers.length, sbqAll: raw.sbq || {},
      students: students, openedCount: opened.length, funnel: funnel, classes: clsList, stages: STAGES, rooms: roomList, boardsByRoom: boardsByRoom, coach: coach, coachDays: coachDays, ach: ach, errors: errors, alias: alias, clsMap: clsMap };
  }

  /* ———— 篩選：週次（哪一天那一堂）× 班級 ————
     ui.week：0＝三週累計、1–3＝W6–W8；ui.cls：'全部' 或班級。故事板從第 3 週（W8）才有資料。
     兩類數字：①日期型（助教次數、課程問題、當日上傳）依所選範圍內有紀錄的日子加總；②狀態型（漏斗、旗標、各房、成就、評分）是「累計到現在」，只隨班級變。 */
  function fOf(ui) { return { week: num(ui && ui.week), cls: ui && ui.cls && ui.cls !== '全部' ? ui.cls : '' }; }
  function hasSb(f) { return !f.week || f.week >= SB_FIRST_WEEK; }
  function scopeInfo(m, ui) {
    var f = fOf(ui), st = TM.filterState(f, m.now), has = hasSb(f), reason = '';
    if (!has) reason = '故事板從第 3 週（W8，' + TM.mdOf(TM.classStartMs('二丙', SB_FIRST_WEEK)) + ' 起）才開放，' + f.week + '/3（W' + (5 + f.week) + '）這一週沒有故事板資料。要看資料請把頁首「週次・班級」選成「3/3（W8）」或「全部」。';
    else if (st === 'future') reason = TM.filterLabel(f) + ' 還沒開始：助教、上傳這類「當天」的數字是 0 是正常的；故事板的狀態是累計到現在。';
    return { f: f, state: st, has: has, reason: reason, label: TM.filterLabel(f) };
  }
  function nameOf(s, ui) { return ui.deid ? s.alias : s.sid + (s.name ? '　' + s.name : ''); }
  function who(m, sid, ui) { return ui.deid ? (m.alias[sid] || '學生') : sid; }
  function pick(model, ui) {
    var q = String(ui.q || '').trim().toLowerCase();
    return model.students.filter(function (s) { return (ui.cls === '全部' || s.cls === ui.cls) && (!q || (ui.deid ? s.alias : s.sid + ' ' + s.name).toLowerCase().indexOf(q) >= 0); });
  }
  function scoreBins(list) { var b = [0, 0, 0, 0, 0]; list.forEach(function (s) { b[Math.min(4, Math.floor(s.score.total / 20))] += 1; }); return b; }
  /* 助教：依日期範圍與班級加總。分類型次數、費用、代填格、被擋次數只有全站合計（資料庫沒有分班記）。 */
  function coachFor(m, ui) {
    var f = fOf(ui), days = Object.keys(m.coachDays).filter(function (d) { return TM.dayInFilter(d, f); }).sort(), cap = m.cfg.coachPerDay;
    var inCls = function (sid) { return !f.cls || m.clsMap[sid] === f.cls; };
    var r = { days: days, siteCalls: 0, usd: 0, fills: 0, byKind: {}, capHits: { user: 0, fill: 0, usd: 0 }, usersMap: {}, capSids: {}, questions: [] };
    Object.keys(KIND_NAME).forEach(function (k) { r.byKind[k] = 0; });
    days.forEach(function (d) {
      var u = m.coachDays[d]; r.siteCalls += u.calls; r.usd += u.usd; r.fills += u.fills;
      Object.keys(u.byKind).forEach(function (k) { r.byKind[k] += u.byKind[k]; }); ['user', 'fill', 'usd'].forEach(function (k) { r.capHits[k] += u.capHits[k]; });
      Object.keys(u.users).forEach(function (sid) { if (!inCls(sid)) return; var n = num(u.users[sid]); r.usersMap[sid] = (r.usersMap[sid] || 0) + n; if (cap > 0 && n >= cap) r.capSids[sid] = 1; });
      u.cq.forEach(function (q) { if (inCls(q.sid)) r.questions.push({ day: d, sid: q.sid, ask: q.ask, topic: q.topic }); });
    });
    r.users = Object.keys(r.usersMap).length; r.classCalls = Object.keys(r.usersMap).reduce(function (a, k) { return a + r.usersMap[k]; }, 0); r.calls = f.cls ? r.classCalls : r.siteCalls; r.capUsers = Object.keys(r.capSids).length;
    var tc = {}; r.questions.forEach(function (q) { tc[q.topic] = (tc[q.topic] || 0) + 1; });
    r.topics = Object.keys(tc).map(function (k) { return { name: k, n: tc[k] }; }).sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); });
    r.topUsers = Object.keys(r.usersMap).map(function (sid) { return { sid: sid, n: r.usersMap[sid], cap: !!r.capSids[sid] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    r.trend = m.coach.trend.map(function (t) { var cc = 0; Object.keys(t.byUser).forEach(function (sid) { if (inCls(sid)) cc += num(t.byUser[sid]); }); return Object.assign({ inRange: days.indexOf(t.day) >= 0, classCalls: cc }, t); });
    var list = m.students.filter(function (s) { return !f.cls || s.cls === f.cls; });
    r.cl = [0, 0, 0, 0, 0]; r.aiCells = 0; r.aiReclaimed = 0; list.forEach(function (s) { s.m.cl.forEach(function (v, i) { r.cl[i] += v; }); r.aiCells += s.m.ai; r.aiReclaimed += s.m.aiBack; });
    r.nameClass = f.cls || '全部班級';
    return r;
  }

  /* ———— 介入建議（給老師）：依數字列出「現在可以怎麼做」。呈現與共用規則在 teacher_model.js ————
     用字給老師用：動作＝老師要做什麼；話術＝可以直接對全班或對個人說的一句。門檻集中在 SBT。 */
  var SBT = { minN: 3, minPct: 0.15, allaiN: 2, stageN: 3, stagePct: 0.2, topicN: 3, badPct: 0.4 };
  var STAGE_SG = {   /* 卡在第 i 關（reach===i）的人：觸發說明、動作、話術。第 2、3 關由「訪談了沒開板」「開了沒寫」兩條專屬規則處理 */
    1: { t: '卡在「訪談卡打勾」這一步：還沒有任何一份訪談紀錄', a: '示範到右側「訪談」分頁勾一項、寫一行備註（只聊天不算訪談卡）。', s: '故事板的出處要引用訪談卡。先到右側「訪談」分頁勾一項、寫一行，再回來寫第 1 格。' },
    4: { t: '寫了 1–5 格，還沒湊滿 6 格', a: '提醒 6 格都要有內容，先補最有把握的格子，不用照順序。', s: '6 格都要有字。先補你最有把握的那幾格，不用照順序。' },
    5: { t: '6 格都有字，但還沒有 6 張圖', a: '示範一格的圖：電腦把圖拖進格子、手機按「選圖」。', s: '每一格都要有一張圖。電腦把圖拖進格子，手機按「選圖」。' },
    6: { t: '6 格都有圖，但還沒標「關鍵時刻」', a: '示範在最卡的那一格標關鍵時刻（★）。', s: '找整個故事裡病人最卡的那一格，把它標成關鍵時刻。' },
    7: { t: '6 格都寫了，但不是每格都有出處', a: '示範在格子裡加出處：選訪談卡的編號。', s: '每一格都要有出處：選你訪談卡上的編號，格子才有根據。' }
  };
  var TOPIC_SG = {
    'Nielsen 十項準則': '投影十項準則一覽，挑 2 項對照一格故事板說明。', '嚴重性評分': '用一個例子示範嚴重性怎麼打（頻率、影響、持續）。', '訪談與追問': '示範一次追問：對方答完先接「最近一次是什麼時候？」。',
    '人物誌': '投影一份人物誌範例，圈出哪些欄位來自訪談。', '關鍵時刻與痛點': '示範在哪一格標關鍵時刻、標完怎麼寫痛點一句話。', '故事板與格子': '用 3 分鐘從頭走一遍第 1 格到第 6 格要寫什麼。',
    '出處與引用': '示範在格子加出處：選訪談卡編號。', '圖片與 Gemini': '示範怎麼用主角設定與提示詞產一張圖、再放進格子。', 'Figma／AI Studio': '說明這一階段先不用 Figma／AI Studio，留到後面的週次。',
    '作業與評分': '用 1 分鐘重講繳交方式與評分三項（報告等級、出處、自己寫）。', '怎麼操作': '投影操作一遍：大廳「開故事板」→ 第 1 格 → 加圖。'
  };
  var SB_SG_DOC = [
    { id: 'S_OPENEDIDLE', name: '開了沒寫', when: '開過故事板超過 30 分鐘，一格都沒寫', thr: '≥3 人且 ≥15% 該班；≥40% 該班升紅', level: '黃（≥40% 紅）' },
    { id: 'S_ALLAI', name: '全部讓助教代填', when: '寫的格子全是助教代填、還沒改寫到門檻', thr: '≥2 人', level: '紅' },
    { id: 'S_STAGE', name: '卡在同一關', when: '卡在「訪談卡打勾、6 格、6 張圖、關鍵時刻、出處」其中一關的人，取最多的那一關', thr: '≥3 人且 ≥20% 該班；≥40% 升紅', level: '黃（≥40% 紅）' },
    { id: 'S_COPY', name: '照抄草稿', when: '寫了 2 格以上、八成以上是照抄助教草稿', thr: '≥3 人且 ≥15% 該班', level: '黃' },
    { id: 'S_NOSRC', name: '沒出處', when: '寫了 3 格以上，且至少 1 格沒有出處', thr: '≥3 人且 ≥15% 該班', level: '黃' },
    { id: 'S_NOTOPENED', name: '訪談了沒開板', when: '有訪談紀錄、但沒開過故事板', thr: '≥3 人且 ≥15% 該班', level: '黃' },
    { id: 'S_TOPIC', name: '大家問同一類', when: '所選日期範圍內，同一主題的助教課程問題', thr: '≥3 則', level: '黃' },
    { id: 'S_SKW8', name: '說故事或有根據還在 Lv.0／Lv.1', when: 'W8 技能「說故事」「有根據」任一項還沒開始（—）或在 Lv.1；全班都還沒有資料時不列', thr: '≥3 人且 ≥15% 該班', level: '黃' },
    { id: 'S_DONE', name: '八關全過', when: '八關全部通過（有訪談、6 格有內容有圖有出處、標了關鍵時刻）', thr: '≥1 人', level: '藍' }
  ];
  function suggest(m, ui) {
    var f = fOf(ui), res = [], pc = Math.round(SBT.minPct * 100) + '%';
    if (!hasSb(f)) return res;
    var classes = f.cls ? [f.cls] : m.classes.slice();
    classes.forEach(function (c) {
      var list = m.students.filter(function (s) { return s.cls === c; }), base = list.length; if (!base) return;
      function add(rule, level, sids, trigger, action, say, thr, den, unit) { res.push({ id: rule + ':' + c, rule: rule, level: level, cls: c, n: unit === '則' ? den.n : sids.length, base: unit === '則' ? den.base : (den || base), unit: unit || '人', trigger: trigger, action: action, say: say || '', sids: sids, thr: thr }); }
      function withFlag(id) { return list.filter(function (s) { return s.flags.some(function (x) { return x.id === id; }); }).map(function (s) { return s.sid; }); }
      var big = function (n, p) { return n >= SBT.minN && n / base >= (p || SBT.minPct); };
      var a = withFlag('openedidle');
      if (big(a.length)) add('S_OPENEDIDLE', a.length / base >= SBT.badPct ? 'bad' : 'warn', a, c + '有 ' + a.length + ' 人開了故事板，30 分鐘以上一格都沒寫', '上課時花 3 分鐘示範第 1 格怎麼寫。', '先寫第 1 格就好：誰、在哪裡、發生了什麼事、他在想什麼，各一句。', '≥' + SBT.minN + ' 人且 ≥' + pc + ' 該班；≥' + Math.round(SBT.badPct * 100) + '% 升紅');
      a = withFlag('allai');
      if (a.length >= SBT.allaiN) add('S_ALLAI', 'bad', a, c + '有 ' + a.length + ' 人的格子全部是助教代填', '提醒代填格不計分，請他們改寫成自己的話。', '助教代填的格子要改寫成你自己的話才算數（目前改寫門檻 ' + m.cfg.rewriteThreshold + '）。', '≥' + SBT.allaiN + ' 人');
      var skipStage = {};
      a = withFlag('copy');
      if (big(a.length)) add('S_COPY', 'warn', a, c + '有 ' + a.length + ' 人八成以上的格子是照抄助教草稿', '提醒草稿只是起點，改成自己的話才算自己寫的。', '草稿先當參考，用你自己的話重寫一遍。', '≥' + SBT.minN + ' 人且 ≥' + pc + ' 該班');
      a = withFlag('nosrc');
      if (big(a.length)) { add('S_NOSRC', 'warn', a, c + '有 ' + a.length + ' 人至少有 1 格沒有出處', '示範在格子裡加出處：選訪談卡的編號。', STAGE_SG[7].s, '≥' + SBT.minN + ' 人且 ≥' + pc + ' 該班'); skipStage[7] = 1; }
      a = withFlag('notopened');
      if (big(a.length)) add('S_NOTOPENED', 'warn', a, c + '有 ' + a.length + ' 人有訪談紀錄，但還沒開過故事板', '提醒入口：大廳的「開故事板」，或房間頂列的 📖。', '訪談卡勾好了，下一步到大廳按「開故事板」，或房間頂列的 📖。', '≥' + SBT.minN + ' 人且 ≥' + pc + ' 該班');
      /* 卡最多的那一關（第 2、3 關由上面專屬規則處理；缺出處的已由「沒出處」處理） */
      var best = null; Object.keys(STAGE_SG).forEach(function (k) { k = Number(k); if (skipStage[k]) return; var ids = list.filter(function (s) { return s.reach === k; }).map(function (s) { return s.sid; }); if (!best || ids.length > best.ids.length) best = { k: k, ids: ids }; });
      if (best && best.ids.length >= SBT.stageN && best.ids.length / base >= SBT.stagePct) { var sg = STAGE_SG[best.k]; add('S_STAGE', best.ids.length / base >= SBT.badPct ? 'bad' : 'warn', best.ids, c + '有 ' + best.ids.length + ' 人' + sg.t + '（卡在這一關的人最多）', sg.a, sg.s, '≥' + SBT.stageN + ' 人且 ≥' + Math.round(SBT.stagePct * 100) + '% 該班；≥' + Math.round(SBT.badPct * 100) + '% 升紅'); }
      /* 助教課程問題：所選日期範圍內、這個班 */
      var cf = coachFor(m, { week: ui.week, cls: c }), tp = cf.topics.filter(function (t) { return t.name !== '其他'; })[0];
      if (tp && tp.n >= SBT.topicN) { var askers = {}; cf.questions.forEach(function (q) { if (q.topic === tp.name) askers[q.sid] = 1; }); add('S_TOPIC', 'warn', Object.keys(askers), c + '有 ' + tp.n + ' 則課程問題在問「' + tp.name + '」', TOPIC_SG[tp.name] || '課堂補講 2 分鐘。', '', '≥' + SBT.topicN + ' 則', { n: tp.n, base: cf.questions.length }, '則'); }
      a = list.filter(function (s) { return s.reach >= STAGES.length; }).map(function (s) { return s.sid; });
      if (a.length >= 1) add('S_DONE', 'info', a, c + '有 ' + a.length + ' 人八關全過', '請 1 位同意的同學用 1 分鐘上台講他的故事板，其他人對照自己卡在哪一關。', '誰願意用 1 分鐘，講你的故事板第 1 格到第 6 格？', '≥1 人');
    });
    return TM.sgSort(res.concat(TM.suggestSkillW8(m.students.filter(function (s) { return !f.cls || s.cls === f.cls; }).map(function (s) { return { sid: s.sid, cls: s.cls, story: s.sk.story, source: s.sk.source }; }), f.cls)));
  }

  /* ———— 畫面字串 ———— */
  function bar(parts, title) {
    var n = parts.reduce(function (a, p) { return a + p.v; }, 0) || 1;
    return '<span class="bar" title="' + esc(title || '') + '">' + parts.map(function (p) { return '<i style="width:' + (p.v / n * 100) + '%;background:' + p.c + '"></i>'; }).join('') + '</span>';
  }
  function ratioBar(a) { return bar([{ v: a.ai || 0, c: '#868e96' }, { v: a.copy, c: '#e03131' }, { v: a.rewrite, c: '#f59f00' }, { v: a.own, c: '#2f9e44' }], '助教代填 ' + (a.ai || 0) + '・照抄 ' + a.copy + '・改寫 ' + a.rewrite + '・自己寫 ' + a.own); }
  function emptyNote(t) { return '<div class="empty">' + esc(t) + '</div>'; }
  function table(head, rows, cls) { return '<div class="tw"><table' + (cls ? ' class="' + cls + '"' : '') + '><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'; }
  /* 每個分頁最上面一列關鍵數字（與老師後台同一個樣子）：[值, 說明, 'bad'|'good'|'txt'] */
  function kp(items, label) { return '<div class="kpi pk" role="group" aria-label="' + esc(label) + '">' + items.map(function (x) { return '<div' + (x[2] ? ' class="' + x[2] + '"' : '') + '><div class="big">' + esc(x[0]) + '</div><div class="muted">' + esc(x[1]) + '</div></div>'; }).join('') + '</div>'; }
  function scopeNote(text, sc) { return '<div class="muted small scopenote">' + esc(text) + '</div>' + (sc && sc.reason ? '<div class="ldnote">' + esc(sc.reason) + '</div>' : ''); }
  var NOTE = {
    ov: '最上面「現況」是這一刻、全站的狀態，不隨日期與班級變；下面的數字、漏斗與建議隨班級變，故事板只有 W8 一週，所以選 W8 或「全部」看到的一樣。',
    st: '這一頁是累計到現在的狀態，只隨班級變（故事板只有 W8 一週，選 W8 或「全部」一樣）。學生的日期無法分開：資料庫只記每格最後修改時間。',
    rm: '各房的牆累計到現在，隨班級變（房間的班級＝建房時記的班級，沒有就用房主的班級）。',
    ac: '成就累計到現在，隨班級變；百分比的分母是該班開過故事板的人。',
    sc: '累計到現在，隨班級變。只是試算，不是成績。'
  };

  function htmlSummary(m) {
    var head = { ok: '全部正常，沒有要處理的事', warn: m.alerts.length + ' 項要注意', bad: m.alerts.filter(function (a) { return a.level === 'bad'; }).length + ' 項出事了，' + m.alerts.length + ' 項要看' }[m.level];
    return '<section class="sum ' + m.level + '" role="status"><div class="sum-h"><span class="dot"></span><b>現況（這一刻・全站）：' + esc(head) + '</b></div>' +
      (m.alerts.length ? '<ul>' + m.alerts.map(function (a) { return '<li class="' + a.level + '">' + esc(a.text) + '</li>'; }).join('') + '</ul>' : '') + '</section>' +
      '<div class="tiles">' + m.tiles.map(function (x) { return '<div class="tile ' + x.level + '"><b>' + esc(x.label) + '</b><span>' + esc(x.value) + '</span><div class="n">' + esc(x.note) + '</div></div>'; }).join('') + '</div>' +
      '<div class="muted small">' + m.extra.map(function (e) { return esc(e.label) + ' ' + esc(e.value); }).join('・') + '・免費方案不會扣款，超過上限資料庫會停用</div>';
  }
  function htmlSuggest(m, ui) {
    var list = suggest(m, ui);
    return '<section class="card"><h3>現在可以怎麼做（' + esc(TM.filterLabel(fOf(ui))) + '）</h3><div class="muted small">依據是可以對照的數字；動作與話術只給老師看，不會自動送給學生。名單點開才看得到，預設用代號。</div>' +
      TM.suggestHtml(list, { nameOf: function (sid) { return who(m, sid, ui); }, empty: '目前沒有達到門檻的事項。' }) + TM.sgDocHtml(SB_SG_DOC) + '</section>';
  }
  function htmlFunnel(m, ui) {
    var key = ui.cls, f = m.funnel[key] || m.funnel['全部'];
    if (!f.total) return '<section class="card"><h3>進度漏斗</h3>' + emptyNote('這個班目前沒有學生。') + '</section>';
    var rows = f.steps.map(function (s, i) {
      return '<div class="fr"><div class="fl">' + (i + 1) + '　' + esc(s.name) + '</div><div class="fb"><i style="width:' + Math.max(s.pct, s.n ? 2 : 0) + '%"></i></div><div class="fn">' + s.n + '／' + f.total + '（' + s.pct + '%）</div></div>';
    }).join('');
    var stuck = f.stuck.filter(function (x) { return x.n > 0; }).map(function (x) { return '<span class="chip">卡在「' + esc(x.name) + '」 ' + x.n + ' 人</span>'; }).join('') || '<span class="muted small">沒有人卡在中間的關卡</span>';
    var cmp = table(['關卡'].concat(m.classes), m.stages.map(function (st, i) { return '<tr><td>' + (i + 1) + '　' + esc(st.name) + '</td>' + m.classes.map(function (c) { var g = m.funnel[c]; return '<td>' + (g.total ? g.steps[i].n + '／' + g.total : '—') + '</td>'; }).join('') + '</tr>'; }), 'cmp');
    return '<section class="card"><h3>進度漏斗：' + esc(key) + '（' + f.total + ' 人）</h3><div class="muted small">每一關都要前一關過了才算；條的長度＝佔全班的比例。</div><div class="funnel">' + rows + '</div><div class="line"><b>大家卡在哪</b>　' + stuck + '</div></section>' +
      '<section class="card"><h3>三班對照</h3>' + cmp + '</section>';
  }
  function kpOverview(m, ui) {
    var f = m.funnel[ui.cls] || m.funnel['全部'], list = pick(m, { cls: ui.cls, q: '', deid: true }), stuckN = list.filter(function (s) { return s.flags.length; }).length;
    return kp([[f.total, '人（' + (ui.cls === '全部' ? '三班' : ui.cls) + '）'], [f.steps[2].n, '人開過故事板'], [f.steps[3].n, '人寫了至少 1 格'], [f.steps[4].n, '人 6 格有內容'], [f.steps[7].n, '人八關全過', f.steps[7].n ? 'good' : ''], [stuckN, '人卡住', stuckN ? 'bad' : '']], '總覽關鍵數字');
  }
  function htmlOverview(m, ui, sc) {
    if (!sc.has) return htmlSummary(m) + scopeNote(NOTE.ov, sc);
    return htmlSummary(m) + kpOverview(m, ui) + scopeNote(NOTE.ov, sc) + htmlSuggest(m, ui) + htmlFunnel(m, ui);
  }

  function flagChips(s) { return s.flags.map(function (f) { return '<span class="flag s' + f.sev + '">' + esc(f.text) + '</span>'; }).join('') || '<span class="muted small">—</span>'; }
  function htmlStudents(m, ui, sc) {
    var list = pick(m, ui), stuck = list.filter(function (s) { return s.flags.length; }).sort(function (a, b) { return a.flags[0].sev - b.flags[0].sev || (a.sid < b.sid ? -1 : 1); });
    var counts = {}; list.forEach(function (s) { s.flags.forEach(function (f) { counts[f.id] = (counts[f.id] || 0) + 1; }); });
    var chips = [['allai', '全代填'], ['openedidle', '開了沒寫'], ['copy', '照抄草稿'], ['nosrc', '沒出處'], ['notopened', '訪談了沒開板']].map(function (a) { return '<span class="chip">' + a[1] + ' ' + (counts[a[0]] || 0) + '</span>'; }).join('');
    var rows = stuck.map(function (s) { return '<tr><td>' + esc(nameOf(s, ui)) + '</td><td>' + esc(s.cls) + '</td><td>' + flagChips(s) + '</td><td>' + s.m.n + ' 格</td><td>' + (s.m.upd ? rel(m.now - s.m.upd) : (s.firstOpenAt ? '開板 ' + rel(m.now - s.firstOpenAt) : '—')) + '</td></tr>'; });
    return kp([[list.length, '人（目前篩選）'], [stuck.length, '人卡住', stuck.length ? 'bad' : 'good'], [counts.allai || 0, '人全代填', counts.allai ? 'bad' : ''], [counts.openedidle || 0, '人開了沒寫'], [counts.copy || 0, '人照抄草稿'], [counts.nosrc || 0, '人沒出處']], '學生關鍵數字') + scopeNote(NOTE.st, sc) +
      '<section class="card priv"><h3>哪些學生卡住了（' + stuck.length + '／' + list.length + ' 人）</h3><div class="line">' + chips + '</div>' +
      (rows.length ? table(['學生', '班級', '怎麼了', '寫了', '最近更新'], rows) : emptyNote(list.length ? '目前沒有人符合卡住的條件。' : '沒有符合篩選的學生。')) +
      '<div class="muted small">全代填＝寫的格子全是助教代填；開了沒寫＝開過 30 分鐘以上一格沒寫；照抄草稿＝八成以上是照抄；沒出處＝3 格以上且有格子沒出處。</div></section>' +
      '<div class="projNote muted card">投影模式：個別學生的名單不顯示（只留人數）。</div>';
  }
  function htmlCoach(m, ui, sc) {
    var c = coachFor(m, ui), k = c.byKind, cfg = m.cfg, maxCalls = Math.max.apply(null, [1].concat(c.trend.map(function (t) { return t.calls; }))), cls = fOf(ui).cls;
    var dayTxt = c.days.length ? c.days.map(function (d) { return d.slice(4, 6) + '/' + d.slice(6); }).join('、') : '沒有紀錄';
    var chips = Object.keys(KIND_NAME).map(function (x) { return '<span class="chip">' + KIND_NAME[x] + ' ' + k[x] + (x === 'fill' ? '（成功 ' + c.fills + ' 格）' : '') + '</span>'; }).join('');
    var svgBars = c.trend.slice().reverse().map(function (t, i, a) { var w = 160 / a.length, h = t.calls / maxCalls * 40; return '<g><title>' + esc(t.day + '：' + t.calls + ' 次・US$' + t.usd.toFixed(4)) + '</title><rect x="' + (i * w + w * 0.15) + '" y="' + (46 - h) + '" width="' + w * 0.7 + '" height="' + h + '" fill="' + (t.inRange ? '#1864ab' : '#8fb7dd') + '" stroke="#1e1e1e" stroke-width="0.6"/><text x="' + (i * w + w / 2) + '" y="57" font-size="5" text-anchor="middle" fill="currentColor">' + esc(t.day.slice(4, 6) + '/' + t.day.slice(6)) + '</text></g>'; }).join('');
    var trendTbl = table(['日期', '次數（全站）'].concat(cls ? [cls + '次數'] : []).concat(['費用 US$', '代填格', '人數']), c.trend.map(function (t) { return '<tr' + (t.inRange ? ' class="inr"' : '') + '><td>' + esc(t.day.slice(4, 6) + '/' + t.day.slice(6)) + (t.inRange ? ' ◀' : '') + '</td><td>' + t.calls + '</td>' + (cls ? '<td>' + t.classCalls + '</td>' : '') + '<td>' + t.usd.toFixed(4) + '</td><td>' + t.fills + '</td><td>' + t.users + '</td></tr>'; }));
    var cl = c.cl, nCl = cl.reduce(function (a, b) { return a + b; }, 0) || 1;
    var cldist = cl.map(function (v, i) { return '<div class="fr"><div class="fl">' + esc(CL_NAME[i]) + '</div><div class="fb"><i style="width:' + Math.max(v / nCl * 100, v ? 2 : 0) + '%;background:' + (i === 4 ? '#868e96' : '#1864ab') + '"></i></div><div class="fn">' + v + ' 格</div></div>'; }).join('');
    var topics = c.topics.length ? c.topics.map(function (t) { return '<span class="chip">' + esc(t.name) + ' ' + t.n + '</span>'; }).join('') : '<span class="muted small">所選範圍內還沒有課程問題</span>';
    var qs = c.questions.map(function (q) { var who2 = ui.deid ? (m.alias[q.sid] || '學生') : q.sid; return '<div class="q"><span class="chip sm">' + esc(q.topic) + '</span> <b>' + esc(who2) + '</b>：' + esc(q.ask) + '</div>'; }).join('') || '<div class="muted small">還沒有</div>';
    var tops = c.topUsers.length ? c.topUsers.map(function (u) { return '<span class="chip">' + esc(ui.deid ? (m.alias[u.sid] || '學生') : u.sid) + ' ' + u.n + ' 次' + (u.cap ? '（觸頂）' : '') + '</span>'; }).join('') : '<span class="muted small">所選範圍內沒有人問</span>';
    return kp([[c.calls, '次助教呼叫（' + (cls ? cls : '全站') + '）'], [c.users, '人用過（' + (cls ? cls : '全班') + '）'], [c.capUsers, '人到上限', c.capUsers ? 'bad' : ''], [c.questions.length, '則課程問題'], [c.fills, '格代填（全站）'], ['US$' + c.usd.toFixed(3), '費用（全站）', 'txt']], '助教關鍵數字') +
      scopeNote('助教次數、課程問題、用最多的人隨「日期範圍」與班級變（所選範圍內有紀錄的日子：' + dayTxt + '）；分類型次數、費用、代填、被擋次數資料庫只有全站合計，不隨班級變。格子的「問過助教最高級」是累計，隨班級變。', sc) +
      '<section class="card"><h3>助教（' + esc(TM.filterLabel(fOf(ui))) + '）</h3><div class="muted small">分類型次數為全站合計</div><div class="line">' + chips + '</div><div class="line"><span class="chip">觸頂 ' + c.capUsers + ' 人</span><span class="chip">被擋（全站）：個人 ' + c.capHits.user + '・代填 ' + c.capHits.fill + '・費用 ' + c.capHits.usd + '</span><span class="chip">' + c.users + ' 人用過</span></div>' +
      '<div class="line priv"><b>範圍內用最多的人</b>　' + tops + '</div></section>' +
      '<section class="card"><h3>近 ' + DAYS_SHOWN + ' 天</h3>' + (c.trend.length ? '<svg class="trend" viewBox="0 0 160 60" role="img" aria-label="每日助教次數，深色是所選範圍內的日子">' + svgBars + '</svg>' + trendTbl : emptyNote('還沒有助教用量紀錄。')) + '<div class="muted small">深色長條與「◀」＝所選日期範圍內的日子。</div></section>' +
      '<section class="card"><h3>問了助教的格子（最高用到第幾級・' + esc(c.nameClass) + '）</h3>' + cldist + '<div class="line"><span class="chip">助教代填的格子 ' + c.aiCells + '</span><span class="chip">已改寫成自己的 ' + c.aiReclaimed + '</span></div></section>' +
      '<section class="card"><h3>大家問了什麼（所選範圍的課程問題，' + c.questions.length + ' 則）</h3><div class="line">' + topics + '</div><div class="qs priv">' + qs + '</div><div class="muted small">主題用固定關鍵字歸類，歸不進去的放「其他」。</div></section>' +
      '<section class="card"><h3>目前參數（要改請在 Claude Code 說）</h3><div class="small">每人每日助教 ' + cfg.coachPerDay + ' 次・每板代填 ' + cfg.fillPerBoard + ' 格・改寫門檻 ' + cfg.rewriteThreshold + '・每人每日上傳 ' + cfg.uploadPerUserDay + ' 張・全站每日 ' + cfg.uploadSiteDay + ' 張・助教日費用上限 US$' + cfg.coachDayUsd + '・模型 ' + esc(cfg.modelLite) + '／' + esc(cfg.modelFill) + '（代填）</div></section>';
  }
  function roomBody(m, code, ui) {
    var boards = m.boardsByRoom[code] || [], th = (ui.thumbs || {})[code];
    if (th === undefined) return '<div class="muted small">點開時載入縮圖…</div>';
    if (th === null) return '<div class="muted small">縮圖讀不到。</div>';
    return boards.map(function (b) {
      return '<div><b>' + (b.bk === 'wall' ? '房間牆' : '個人板 ' + esc(ui.deid ? (m.alias[b.bk.replace(/^u_/, '')] || '學生') : b.bk.replace(/^u_/, ''))) + '</b><div class="strip">' + b.cells.map(function (c) {
        var t = th[b.bk] && th[b.bk][SB.slotKey(c.n)], au = c.by ? (ui.deid ? (m.alias[c.by] || '學生') : c.by) : '';
        return '<figure>' + (t ? '<img alt="" src="' + esc(t) + '">' : '<div class="noimg">（無圖）</div>') + '<figcaption>' + c.n + ' ' + esc(c.title) + (c.moment ? ' ★' : '') + '<br>' + esc(au) + (c.er ? '・' + esc(SB.bandText(c.er.band)) + ' ' + Math.round(c.er.r * 100) + '%' : '') + (SB.needsSource(c) ? '・缺出處' : '') + '</figcaption></figure>';
      }).join('') + '</div></div>';
    }).join('') || '<span class="muted small">沒有內容</span>';
  }
  function htmlRooms(m, ui, sc) {
    var list = m.rooms.filter(function (r) { return ui.cls === '全部' || r.cls === ui.cls; });
    var rows = list.map(function (r) {
      var info = SB.caseInfo(r.caseId), au = r.authors.map(function (a) { return '<span class="au">' + esc(ui.deid ? (m.alias[a.sid] || '學生') : a.sid) + ' ' + ratioBar(a) + ' ' + Math.round(a.avg * 100) + '%（' + a.cells + ' 格' + (a.ai ? '・代填 ' + a.ai : '') + '）</span>'; }).join('') || '<span class="muted small">還沒有人寫</span>';
      return '<details class="room" data-code="' + esc(r.code) + '"' + (ui.open && ui.open[r.code] ? ' open' : '') + ' style="--cc:' + esc(r.caseId ? info.color : '#8896a0') + '"><summary><b>' + esc(r.code) + '</b>' + (r.caseId ? '<span class="case">' + esc(info.icon + ' ' + info.name) + '</span>' : '') + '<span class="muted small">' + esc(r.cls) + '</span>' +
        '<span>牆 ' + r.wall.filled + '／' + r.wall.cells + ' 格・' + r.wall.authors + ' 人共編・圖 ' + r.imgs + '・個人板 ' + r.mine + '</span><span class="muted small">更新 ' + (r.updatedAt ? rel(m.now - r.updatedAt) : '—') + '</span><div class="aus priv">' + au + '</div></summary><div class="body">' + (ui.open && ui.open[r.code] ? roomBody(m, r.code, ui) : '<div class="muted small">點開時載入縮圖…</div>') + '</div></details>';
    }).join('');
    var wallF = list.reduce(function (a, r) { return a + r.wall.filled; }, 0), wallC = list.reduce(function (a, r) { return a + r.wall.cells; }, 0), imgs = list.reduce(function (a, r) { return a + r.imgs; }, 0), mine = list.reduce(function (a, r) { return a + r.mine; }, 0);
    return kp([[list.length, '間房（目前篩選）'], [wallF + '／' + wallC, '格牆有內容', 'txt'], [imgs, '張圖'], [mine, '個個人板'], [list.filter(function (r) { return r.wall.filled === 0; }).length, '間牆還是空的']], '各房關鍵數字') + scopeNote(NOTE.rm, sc) +
      '<section class="card"><h3>各房故事板牆（' + list.length + ' 間）</h3><div class="muted small">條的顏色：灰＝助教代填、紅＝照抄、橘＝改寫、綠＝自己寫。縮圖點開才讀，原圖不讀。</div>' + (rows || emptyNote('沒有符合篩選的房間。')) + '</section>';
  }
  function badgeFn() { var B = typeof window !== 'undefined' && window.ERG_SKB; return B ? B.badge : function (lv, t) { return '<span class="pill">' + esc(t) + '</span>'; }; }
  function htmlSkillW8(m, ui) {
    var list = pick(m, { cls: ui.cls, q: '', deid: true }), bf = badgeFn(), d = TM.skW8Dist(list.map(function (s) { return s.sk; }));
    var rows = list.slice().sort(function (a, b) { return a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : (a.sid < b.sid ? -1 : 1); }).map(function (s) { return '<tr><td>' + esc(nameOf(s, ui)) + '</td><td>' + esc(s.cls) + '</td><td class="dots">' + TM.skW8Cell(s.sk, bf) + '</td></tr>'; });
    var none = d.story[3] === d.n && d.source[3] === d.n;
    return '<section class="card"><h3>W8 技能：說故事、有根據（各三級）</h3>' + TM.skW8Html(d, bf) + (none ? '<div class="muted small">還沒有學生的技能資料（遊戲端還沒發布 skStory、skSource），先顯示「—」。</div>' : '') +
      '<div class="priv">' + (rows.length ? table(['學生', '班級', '技能'], rows) : '') + '</div></section>';
  }
  function htmlAch(m, ui, sc) {
    var cls = ui.cls === '全部' ? m.classes : [ui.cls], inScope = pick(m, { cls: ui.cls, q: '', deid: true }), base = inScope.filter(function (x) { return x.opened; }).length;
    function nOf(a) { return inScope.filter(function (x) { return x.ach.indexOf(a.id) >= 0; }).length; }
    function rowsOf(g) { return m.ach.filter(function (a) { return a.group === g; }).map(function (a) { var n = nOf(a); return '<tr class="' + (n ? '' : 'zero') + '"><td>' + esc(a.icon + ' ' + a.name) + '<div class="muted small">' + esc(a.how) + '</div></td><td><b>' + n + '</b>' + (base ? ' <span class="muted small">（' + pct(n, base) + '%）</span>' : '') + '</td>' + cls.map(function (c) { return '<td>' + (a.byCls[c] || 0) + '</td>'; }).join('') + '</tr>'; }); }
    var head = ['成就', '人數（佔開過板的人）'].concat(cls), got = inScope.filter(function (x) { return x.ach.length; }).length, zero = m.ach.filter(function (a) { return !nOf(a); }).length;
    return kp([[base, '人開過故事板'], [got, '人拿到至少 1 個成就'], [pick(m, { cls: ui.cls, q: '', deid: true }).filter(function (x) { return x.sk.story || x.sk.source; }).length, '人有技能資料'], [zero, '個成就沒人拿到', zero && base >= 5 ? 'bad' : ''], [m.ach.length, '個成就（合作＋助教）']], '成就關鍵數字') + scopeNote(NOTE.ac, sc) +
      htmlSkillW8(m, ui) + '<section class="card"><h3>合作成就</h3>' + table(head, rowsOf('coop')) + '</section><section class="card"><h3>助教相關成就</h3>' + table(head, rowsOf('coach')) + '</section>' +
      '<div class="muted small">開過故事板的人 ' + base + ' 位；沒有人拿到的成就用淡色標出，可能是判準太難或學生不知道有這個成就。</div>';
  }
  function levelText(s) { return s.report.level ? s.report.stars : '尚未'; }
  function htmlScore(m, ui, sc) {
    var list = pick(m, ui), bins = scoreBins(list), mx = Math.max.apply(null, [1].concat(bins)), lab = ['0–19', '20–39', '40–59', '60–79', '80–100'];
    var avg = list.length ? Math.round(list.reduce(function (a, s) { return a + s.score.total; }, 0) / list.length) : 0;
    var dist = bins.map(function (v, i) { return '<div class="fr"><div class="fl">' + lab[i] + ' 分</div><div class="fb"><i style="width:' + Math.max(v / mx * 100, v ? 2 : 0) + '%;background:#2b8a3e"></i></div><div class="fn">' + v + ' 人</div></div>'; }).join('');
    var rows = list.slice().sort(function (a, b) { return a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : (a.sid < b.sid ? -1 : 1); }).map(function (s) {
      return '<tr><td>' + esc(nameOf(s, ui)) + '</td><td>' + esc(s.cls) + '</td><td>' + esc(levelText(s)) + (s.report.maybe3 ? ' <span class="muted small">（可能 ★★★）</span>' : '') + '</td><td>' + Math.round(s.score.source * 100) + '%</td><td>' + Math.round(s.score.own * 100) + '%</td><td><b>' + s.score.total + '</b></td><td class="muted small">' + s.m.n + ' 格' + (s.m.ai ? '・代填 ' + s.m.ai : '') + '</td></tr>';
    });
    return kp([[list.length, '人（目前篩選）'], [avg, '平均試算分（僅供參考）'], [bins[3] + bins[4], '人 60 分以上'], [bins[0] + bins[1], '人 40 分以下']], '評分預覽關鍵數字') + scopeNote(NOTE.sc, sc) +
      '<section class="card warn-card"><b>僅供參考，不是成績。</b>這一頁只是照學習單的三項（各 1/3）試算，不寫入任何地方、不排名；成績照舊由楊老師在 flipclass 決定。</section>' +
      '<section class="card"><h3>試算分數分布（' + list.length + ' 人）</h3>' + dist + '</section>' +
      '<section class="card priv"><h3>逐位試算</h3>' + table(['學生', '班級', '報告等級', '出處完整度', '自己寫的程度', '試算分', '備註'], rows) +
      '<div class="muted small">報告等級 ÷ 3、出處完整度（有出處的格 ÷ max(6, 寫的格數)）、自己寫的程度（編輯比例，助教代填未改寫算 0，÷ max(6, 寫的格數)）。報告等級讀不到白板上的「矛盾／想法」標記，所以★★★要的那一項算沒有；標「可能 ★★★」的就是只差這一項。</div></section>';
  }
  var TABS = [['ov', '總覽'], ['st', '學生'], ['co', '助教'], ['rm', '各房'], ['ac', '成就與技能'], ['sc', '評分預覽']];
  function htmlNoData(m, ui, sc) {
    return scopeNote('這一頁隨週次與班級變。', null) + '<section class="card"><h3>' + esc(sc.label) + '：沒有故事板資料</h3><div class="empty">' + esc(sc.reason) + '</div></section>';
  }
  function html(m, ui) {
    ui = Object.assign({ cls: '全部', week: 0, q: '', deid: true, tab: 'ov', open: {}, thumbs: {} }, ui || {});
    var body = { ov: htmlOverview, st: htmlStudents, co: htmlCoach, rm: htmlRooms, ac: htmlAch, sc: htmlScore }[ui.tab] || htmlOverview, sc = scopeInfo(m, ui);
    if (!sc.has && ui.tab !== 'ov') return htmlNoData(m, ui, sc);
    return body(m, ui, sc);
  }

  /* ———— 唯讀讀取：只有這七個路徑（進頁時），加上點開某房才讀的縮圖 ———— */
  function readPaths(sess) { return ['er/' + sess + '/profiles', 'er/' + sess + '/rooms', 'sbx/' + sess + '/sb', 'sbx/' + sess + '/sbm', 'sbx/' + sess + '/sbach', 'sbx/' + sess + '/sbq', 'sbops', 'er/' + sess + '/score']; }
  function liveLoader(db, sess, now) {
    function rd(path, label, errs) { return db.ref(path).once('value').then(function (s) { return s.val(); }, function () { errs.push(label); return null; }); }
    return {
      load: function () {
        var errs = [], P = readPaths(sess);
        return Promise.all([rd(P[0], '名冊', errs), rd(P[1], '房間資料', errs), rd(P[2], '故事板', errs), rd(P[3], '開板紀錄', errs), rd(P[4], '成就', errs), rd(P[5], '上傳計數', errs), rd(P[6], '用量與助教', errs), rd(P[7], '技能分數', errs)]).then(function (a) {
          var ops = a[6] || {};
          return { now: (now ? now() : Date.now()), sess: sess, profiles: a[0], rooms: a[1], sb: a[2], sbm: a[3], sbach: a[4], sbq: a[5], usage: ops.usage, config: ops.config, coachUsage: ops.coachUsage, worker: ops.coachWorker, score: a[7], errors: errs };
        });
      },
      thumbs: function (code) {
        return db.ref('sbx/' + sess + '/sbth/' + code).once('value').then(function (s) {
          var v = s.val() || {}, o = {}; Object.keys(v).forEach(function (bk) { o[bk] = {}; Object.keys(v[bk] || {}).forEach(function (slot) { var d = v[bk][slot] && v[bk][slot].d; if (typeof d === 'string' && d.indexOf('data:image/') === 0) o[bk][slot] = d; }); }); return o;
        }, function () { return null; });
      }
    };
  }

  /* 樣式：色票、字級、卡片、燈號都沿用老師後台（teacher.html）的變數；基底與共用區塊在 sb_dashboard.html 的 <style>，這裡只放故事板各分頁的元件 */
  var CSS = '.sum{border:2px solid var(--ink);border-radius:12px;padding:8px 12px;margin:8px 0;color:var(--ink)}.sum.ok{background:var(--okbg);border-color:var(--ok)}.sum.warn{background:var(--warnbg);border-color:var(--warn)}.sum.bad{background:var(--badbg);border-color:var(--bad)}' +
    '.sum-h{display:flex;align-items:center;gap:8px;font-size:1.05em}.sum .dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--ink);background:var(--panel)}.sum.ok .dot{background:var(--ok)}.sum.warn .dot{background:var(--warn)}.sum.bad .dot{background:var(--bad)}.sum ul{margin:6px 0 0;padding-left:22px}.sum li.bad{font-weight:900}' +
    '.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:8px 0}.tile{border:2px solid var(--ink);border-radius:12px;padding:6px 10px;background:var(--panel)}.tile b{display:block;font-size:.8em;color:var(--muted)}.tile span{font-size:1.1em;font-weight:900}.tile .n{font-size:.75em;color:var(--muted)}' +
    '.tile.warn{background:var(--warnbg);border-color:var(--warn)}.tile.bad{background:var(--badbg);border-color:var(--bad)}' +
    '.card h3{margin:0 0 6px;font-size:1.05em}.warn-card{background:var(--warnbg);border-color:var(--warn)}.scopenote{margin:2px 0 6px}.ldnote{padding:4px 8px;margin:4px 0 6px;border-radius:8px;background:var(--infobg);color:var(--info);font-size:.9em}' +
    '.line{margin:8px 0}.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0 10px;margin:2px 4px 2px 0;background:var(--panel2);font-size:.85em}.chip.sm{font-size:.75em;padding:0 6px}' +
    '.fr{display:grid;grid-template-columns:minmax(110px,170px) 1fr minmax(96px,140px);gap:8px;align-items:center;margin:4px 0}.fl{font-size:.88em}.fb{height:16px;background:var(--panel2);border:1px solid var(--ink);border-radius:8px;overflow:hidden}.fb i{display:block;height:100%;background:var(--info)}.fn{font-size:.8em;text-align:right}' +
    '.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}tr.zero td{opacity:.5}tr.inr td{background:var(--infobg)}' +
    '.flag{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:0 8px;margin:1px 3px 1px 0;font-size:.82em;font-weight:800;background:var(--warnbg);color:var(--warn)}.flag.s1{background:var(--badbg);color:var(--bad)}.flag.s5{background:var(--infobg);color:var(--info)}' +
    '.bar{display:inline-flex;height:8px;background:var(--line);border-radius:4px;overflow:hidden;width:90px;vertical-align:middle}.bar i{display:block;height:100%}' +
    'details.room{border:2px solid var(--ink);border-left:10px solid var(--cc,#8896a0);border-radius:10px;margin:8px 0;padding:6px 12px;background:var(--panel)}details.room>summary{cursor:pointer;display:flex;gap:12px;flex-wrap:wrap;align-items:center;min-height:36px}.case{font-weight:700}.aus{flex:1 0 100%}.au{display:inline-block;margin-right:14px;font-size:.8em}' +
    '.strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.strip figure{margin:0;width:120px;font-size:11px}.strip img,.noimg{width:120px;height:80px;object-fit:contain;border:2px solid var(--ink);border-radius:6px;background:var(--panel2);display:flex;align-items:center;justify-content:center;color:var(--muted)}' +
    '.qs{max-height:320px;overflow:auto;border-top:1px dashed var(--line);margin-top:6px;padding-top:6px}.q{margin:4px 0;font-size:.88em;word-break:break-word}.trend{width:100%;max-width:640px;height:170px;display:block;margin:4px 0 8px;color:var(--ink)}.empty{padding:12px;color:var(--muted);text-align:center}' +
    '@media (max-width:560px){.card{padding:10px 10px}.fr{grid-template-columns:1fr;gap:2px;margin:8px 0}.fn{text-align:left}.strip figure{width:calc(50% - 4px)}.strip img,.noimg{width:100%}}';

  /* ———— 掛到頁面：只有「看」的控制（分頁、搜尋）；週次・班級、去識別化、投影在頁首（由頁面的 script 接到 setFilter／setDeid） ———— */
  function mount(el, opts) {
    opts = opts || {}; var f0 = opts.filter || {}, ui = { cls: f0.cls || '全部', week: num(f0.week), q: '', deid: opts.deid !== false, tab: opts.tab || 'ov', open: {}, thumbs: {} }, model = null, timer = null, inflight = false;
    function toolbar() {
      var search = (ui.tab === 'st' || ui.tab === 'sc') ? '<div class="stool"><input type="search" id="sbdQ" placeholder="找代號" aria-label="搜尋學生" value="' + esc(ui.q) + '"></div>' : '';
      return '<div class="toolbar"><nav class="tabs" role="tablist" aria-label="故事板分頁">' + TABS.map(function (t) { return '<button class="' + (ui.tab === t[0] ? 'on' : '') + '" data-tab="' + t[0] + '" role="tab" aria-selected="' + (ui.tab === t[0]) + '">' + esc(t[1]) + '</button>'; }).join('') + '</nav>' + search + '</div>';
    }
    function draw() {
      var keep = el.querySelector('#sbdQ') === document.activeElement, pos = keep ? el.querySelector('#sbdQ').selectionStart : 0;
      el.innerHTML = '<style>' + CSS + '</style><div class="sbd">' + toolbar() + '<div id="sbdBody">' + (model ? html(model, ui) : '<div class="empty">讀取中…</div>') + '</div></div>';
      if (keep) { var q = el.querySelector('#sbdQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
      if (opts.onDraw) opts.onDraw(model, ui);
    }
    function reload() {
      if (inflight) return Promise.resolve(); inflight = true; if (opts.onLoading) opts.onLoading(true);
      return Promise.resolve(opts.loader.load()).then(function (raw) { model = build(raw); draw(); }, function (e) { el.innerHTML = '<div class="sbd"><div class="card">讀取失敗：' + esc((e && e.message) || e) + '</div></div>'; }).then(function () { inflight = false; if (opts.onLoading) opts.onLoading(false); });
    }
    function openRoom(code) {
      ui.open[code] = true; if (ui.thumbs[code] !== undefined) { draw(); return; }
      Promise.resolve(opts.loader.thumbs(code)).then(function (t) { ui.thumbs[code] = t; draw(); });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
      if (b.dataset.tab) { ui.tab = b.dataset.tab; draw(); }
    });
    el.addEventListener('input', function (e) { if (e.target && e.target.id === 'sbdQ') { ui.q = e.target.value; var body = el.querySelector('#sbdBody'); if (body && model) body.innerHTML = html(model, ui); } });
    el.addEventListener('toggle', function (e) { var d = e.target; if (d && d.classList && d.classList.contains('room')) { if (d.open) { if (!ui.open[d.dataset.code]) openRoom(d.dataset.code); } else delete ui.open[d.dataset.code]; } }, true);
    var p = reload(); if (opts.autoMs) timer = setInterval(function () { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') reload(); }, opts.autoMs);
    return { reload: reload, stop: function () { clearInterval(timer); }, ready: p, ui: ui, model: function () { return model; }, draw: draw,
      setFilter: function (f) { ui.week = num(f.week); ui.cls = f.cls || '全部'; draw(); }, setDeid: function (v) { ui.deid = !!v; draw(); } };
  }

  return { DEFAULT_SESS: DEFAULT_SESS, CLASSES: CLASSES, STAGES: STAGES, TOPICS: TOPICS, TABS: TABS, CSS: CSS, SBT: SBT, SB_SG_DOC: SB_SG_DOC, SB_FIRST_WEEK: SB_FIRST_WEEK, build: build, html: html, pick: pick, topicOf: topicOf, isTestSid: isTestSid, scoreBins: scoreBins, readPaths: readPaths, liveLoader: liveLoader, mount: mount, rel: rel, clock: clock,
    suggest: suggest, coachFor: coachFor, scopeInfo: scopeInfo, fOf: fOf, hasSb: hasSb };
});
