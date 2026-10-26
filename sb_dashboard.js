/* 第 8 週 UX 故事板「老師儀表板」：唯讀。計算（build）與畫面字串（html）都是純函式，Node 可測；mount 才碰 DOM。
   規劃見 docs/SB_DASHBOARD_PLAN.md。楊老師 10-26 22:21：「我其實只是把這裡當成 dashboard 在看，真的需要改，會在 Claude Code 的 session 裡面讓你改。」
   所以這個檔案沒有任何寫入：不呼叫 set／update／push／remove／transaction，也沒有改參數的操作。
   讀取只有 liveLoader 的七個路徑（進頁與每 10 分鐘各一次）；縮圖只在點開某一房時才讀（sbth），原圖（sbimg）完全不讀。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'), require('./report_level.js'));
  else root.ERG_SBDASH = factory(root.ERG_SB, root.ERG_REPORT_LEVEL);
})(typeof self !== 'undefined' ? self : this, function (SB, RL) {
  'use strict';
  var esc = SB.esc, arr = SB.arr;
  var DEFAULT_SESS = 'ER-20261013';   /* 與 game.js 的 UNIT_SESS、teacher.html 的 today() 同值 */
  var CLASSES = ['二甲', '二乙', '二丙'], NOCLS = '未分班';
  var HB_OK_MS = 60 * 1000, HB_WARN_MS = 10 * 60 * 1000, OPENED_IDLE_MS = 30 * 60 * 1000, DAYS_SHOWN = 14;
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
    var profiles = raw.profiles || {}, rooms = raw.rooms || {}, sb = raw.sb || {}, sbm = raw.sbm || {}, sbach = raw.sbach || {}, errors = arr(raw.errors || []);
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
      var s = S[sid], cs = s.cells, n = cs.length, m = { n: n, img: 0, refs: 0, moment: 0, ai: 0, aiStill: 0, copy: 0, rewrite: 0, own: 0, sumR: 0, coach: 0, maxCl: 0, upd: 0 };
      cs.forEach(function (c) {
        if (c.img) m.img += 1; if (c.refs.length) m.refs += 1; if (c.moment) m.moment += 1; if (c.aiText) m.ai += 1; if (c.cl >= 1) m.coach += 1; m.maxCl = Math.max(m.maxCl, c.cl); m.upd = Math.max(m.upd, c.updatedAt || 0);
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
      return { sid: sid, name: s.name, alias: alias[sid], cls: s.cls, rooms: s.rooms, interviews: s.interviews, report: s.report, opened: s.opened, firstOpenAt: s.firstOpenAt, m: m, reach: reach, stuckAt: reach < STAGES.length ? STAGES[reach].name : '', flags: flags, ach: String((sbach[sid] || {}).ids || '').split(',').filter(Boolean),
        score: { report: repPct, source: srcPct, own: ownPct, total: Math.round((repPct + srcPct + ownPct) / 3 * 100) } };
    });

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

    /* 助教 */
    var cuAll = raw.coachUsage || {}, cu = cuAll[day] || {}, kinds = {}; Object.keys(KIND_NAME).forEach(function (k) { kinds[k] = num((cu.byKind || {})[k]); });
    var cuUsers = cu.users || {}, usd = num(cu.nusd) / 1e9;
    var trend = Object.keys(cuAll).filter(function (d) { return /^\d{8}$/.test(d); }).sort().reverse().slice(0, DAYS_SHOWN).map(function (d) { var u = cuAll[d] || {}; return { day: d, calls: num(u.calls), usd: num(u.nusd) / 1e9, fills: num(u.fills), users: Object.keys(u.users || {}).length }; });
    var cq = Object.keys(cu.cq || {}).sort().map(function (k) { var q = cu.cq[k] || {}; return { sid: String(q.sid || ''), ask: String(q.ask || ''), topic: topicOf(q.ask) }; });
    var topicCount = {}; cq.forEach(function (q) { topicCount[q.topic] = (topicCount[q.topic] || 0) + 1; });
    var topics = Object.keys(topicCount).map(function (k) { return { name: k, n: topicCount[k] }; }).sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); });
    var topUsers = Object.keys(cuUsers).map(function (sid) { return { sid: sid, n: num(cuUsers[sid]), cap: cfg.coachPerDay > 0 && num(cuUsers[sid]) >= cfg.coachPerDay }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    var clDist = [0, 0, 0, 0, 0]; allCells.forEach(function (c) { if (SB.hasContent(c)) clDist[Math.max(0, Math.min(4, c.cl))] += 1; });
    var aiCells = allCells.filter(function (c) { return !!c.aiText && SB.hasContent(c); });
    var coach = { calls: num(cu.calls), usd: usd, byKind: kinds, fills: num(cu.fills), users: Object.keys(cuUsers).length, capUsers: Object.keys(cuUsers).filter(function (k) { return cfg.coachPerDay > 0 && num(cuUsers[k]) >= cfg.coachPerDay; }).length,
      capHits: { user: num((cu.capHits || {}).user), fill: num((cu.capHits || {}).fill), usd: num((cu.capHits || {}).usd) }, trend: trend, questions: cq, topics: topics, topUsers: topUsers, clDist: clDist, aiCells: aiCells.length, aiReclaimed: aiCells.filter(function (c) { return c.er && c.er.band !== 'ai'; }).length };

    /* 出事了嗎 */
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
    return { now: now, sess: raw.sess || DEFAULT_SESS, day: day, cfg: cfg, ops: ops, tiles: tiles, extra: extra, alerts: alerts, level: level, hb: hb, siteToday: site, upUsers: upUsers.length,
      students: students, openedCount: opened.length, funnel: funnel, classes: clsList, stages: STAGES, rooms: roomList, boardsByRoom: boardsByRoom, coach: coach, ach: ach, errors: errors, alias: alias };
  }

  /* ———— 篩選：班級與搜尋（只影響「看」） ———— */
  function nameOf(s, ui) { return ui.deid ? s.alias : s.sid + (s.name ? '　' + s.name : ''); }
  function pick(model, ui) {
    var q = String(ui.q || '').trim().toLowerCase();
    return model.students.filter(function (s) { return (ui.cls === '全部' || s.cls === ui.cls) && (!q || (ui.deid ? s.alias : s.sid + ' ' + s.name).toLowerCase().indexOf(q) >= 0); });
  }
  function scoreBins(list) { var b = [0, 0, 0, 0, 0]; list.forEach(function (s) { b[Math.min(4, Math.floor(s.score.total / 20))] += 1; }); return b; }

  /* ———— 畫面字串 ———— */
  function bar(parts, title) {
    var n = parts.reduce(function (a, p) { return a + p.v; }, 0) || 1;
    return '<span class="bar" title="' + esc(title || '') + '">' + parts.map(function (p) { return '<i style="width:' + (p.v / n * 100) + '%;background:' + p.c + '"></i>'; }).join('') + '</span>';
  }
  function ratioBar(a) { return bar([{ v: a.ai || 0, c: '#868e96' }, { v: a.copy, c: '#e03131' }, { v: a.rewrite, c: '#f59f00' }, { v: a.own, c: '#2f9e44' }], '助教代填 ' + (a.ai || 0) + '・照抄 ' + a.copy + '・改寫 ' + a.rewrite + '・自己寫 ' + a.own); }
  function emptyNote(t) { return '<div class="empty">' + esc(t) + '</div>'; }
  function table(head, rows, cls) { return '<div class="tw"><table' + (cls ? ' class="' + cls + '"' : '') + '><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'; }

  function htmlSummary(m) {
    var head = { ok: '全部正常，沒有要處理的事', warn: m.alerts.length + ' 項要注意', bad: m.alerts.filter(function (a) { return a.level === 'bad'; }).length + ' 項出事了，' + m.alerts.length + ' 項要看' }[m.level];
    return '<section class="sum ' + m.level + '" role="status"><div class="sum-h"><span class="dot"></span><b>' + esc(head) + '</b></div>' +
      (m.alerts.length ? '<ul>' + m.alerts.map(function (a) { return '<li class="' + a.level + '">' + esc(a.text) + '</li>'; }).join('') + '</ul>' : '') + '</section>' +
      '<div class="tiles">' + m.tiles.map(function (x) { return '<div class="tile ' + x.level + '"><b>' + esc(x.label) + '</b><span>' + esc(x.value) + '</span><div class="n">' + esc(x.note) + '</div></div>'; }).join('') + '</div>' +
      '<div class="muted small">' + m.extra.map(function (e) { return esc(e.label) + ' ' + esc(e.value); }).join('・') + '・免費方案不會扣款，超過上限資料庫會停用</div>';
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
  function htmlOverview(m, ui) { return htmlSummary(m) + htmlFunnel(m, ui); }

  function flagChips(s) { return s.flags.map(function (f) { return '<span class="flag s' + f.sev + '">' + esc(f.text) + '</span>'; }).join('') || '<span class="muted small">—</span>'; }
  function htmlStudents(m, ui) {
    var list = pick(m, ui), stuck = list.filter(function (s) { return s.flags.length; }).sort(function (a, b) { return a.flags[0].sev - b.flags[0].sev || (a.sid < b.sid ? -1 : 1); });
    var counts = {}; list.forEach(function (s) { s.flags.forEach(function (f) { counts[f.id] = (counts[f.id] || 0) + 1; }); });
    var chips = [['allai', '全代填'], ['openedidle', '開了沒寫'], ['copy', '照抄草稿'], ['nosrc', '沒出處'], ['notopened', '訪談了沒開板']].map(function (a) { return '<span class="chip">' + a[1] + ' ' + (counts[a[0]] || 0) + '</span>'; }).join('');
    var rows = stuck.map(function (s) { return '<tr><td>' + esc(nameOf(s, ui)) + '</td><td>' + esc(s.cls) + '</td><td>' + flagChips(s) + '</td><td>' + s.m.n + ' 格</td><td>' + (s.m.upd ? rel(m.now - s.m.upd) : (s.firstOpenAt ? '開板 ' + rel(m.now - s.firstOpenAt) : '—')) + '</td></tr>'; });
    return '<section class="card"><h3>哪些學生卡住了（' + stuck.length + '／' + list.length + ' 人）</h3><div class="line">' + chips + '</div>' +
      (rows.length ? table(['學生', '班級', '怎麼了', '寫了', '最近更新'], rows) : emptyNote(list.length ? '目前沒有人符合卡住的條件。' : '沒有符合篩選的學生。')) +
      '<div class="muted small">全代填＝寫的格子全是助教代填；開了沒寫＝開過 30 分鐘以上一格沒寫；照抄草稿＝八成以上是照抄；沒出處＝3 格以上且有格子沒出處。</div></section>';
  }
  function htmlCoach(m, ui) {
    var c = m.coach, k = c.byKind, cfg = m.cfg, maxCalls = Math.max.apply(null, [1].concat(c.trend.map(function (t) { return t.calls; })));
    var chips = Object.keys(KIND_NAME).map(function (x) { return '<span class="chip">' + KIND_NAME[x] + ' ' + k[x] + (x === 'fill' ? '（成功 ' + c.fills + ' 格）' : '') + '</span>'; }).join('');
    var svgBars = c.trend.slice().reverse().map(function (t, i, a) { var w = 160 / a.length, h = t.calls / maxCalls * 40; return '<g><title>' + esc(t.day + '：' + t.calls + ' 次・US$' + t.usd.toFixed(4)) + '</title><rect x="' + (i * w + w * 0.15) + '" y="' + (46 - h) + '" width="' + w * 0.7 + '" height="' + h + '" fill="#5aa0ff" stroke="#1e1e1e" stroke-width="0.6"/><text x="' + (i * w + w / 2) + '" y="57" font-size="5" text-anchor="middle" fill="currentColor">' + esc(t.day.slice(4, 6) + '/' + t.day.slice(6)) + '</text></g>'; }).join('');
    var trendTbl = table(['日期', '次數', '費用 US$', '代填格', '人數'], c.trend.map(function (t) { return '<tr><td>' + esc(t.day.slice(4, 6) + '/' + t.day.slice(6)) + '</td><td>' + t.calls + '</td><td>' + t.usd.toFixed(4) + '</td><td>' + t.fills + '</td><td>' + t.users + '</td></tr>'; }));
    var cl = c.clDist, nCl = cl.reduce(function (a, b) { return a + b; }, 0) || 1;
    var cldist = cl.map(function (v, i) { return '<div class="fr"><div class="fl">' + esc(CL_NAME[i]) + '</div><div class="fb"><i style="width:' + Math.max(v / nCl * 100, v ? 2 : 0) + '%;background:' + (i === 4 ? '#868e96' : '#5aa0ff') + '"></i></div><div class="fn">' + v + ' 格</div></div>'; }).join('');
    var topics = c.topics.length ? c.topics.map(function (t) { return '<span class="chip">' + esc(t.name) + ' ' + t.n + '</span>'; }).join('') : '<span class="muted small">今天還沒有課程問題</span>';
    var qs = c.questions.map(function (q) { var s = m.alias[q.sid]; var who = ui.deid ? (s || '學生') : q.sid; return '<div class="q"><span class="chip sm">' + esc(q.topic) + '</span> <b>' + esc(who) + '</b>：' + esc(q.ask) + '</div>'; }).join('') || '<div class="muted small">還沒有</div>';
    var tops = c.topUsers.length ? c.topUsers.map(function (u) { return '<span class="chip">' + esc(ui.deid ? (m.alias[u.sid] || '學生') : u.sid) + ' ' + u.n + ' 次' + (u.cap ? '（觸頂）' : '') + '</span>'; }).join('') : '<span class="muted small">今天沒有人問</span>';
    return '<section class="card"><h3>助教今天</h3><div class="line">' + chips + '</div><div class="line"><span class="chip">觸頂 ' + c.capUsers + ' 人</span><span class="chip">被擋：個人 ' + c.capHits.user + '・代填 ' + c.capHits.fill + '・費用 ' + c.capHits.usd + '</span><span class="chip">' + c.users + ' 人用過</span></div>' +
      '<div class="line"><b>今天問最多的人</b>　' + tops + '</div></section>' +
      '<section class="card"><h3>近 ' + DAYS_SHOWN + ' 天</h3>' + (c.trend.length ? '<svg class="trend" viewBox="0 0 160 60" role="img" aria-label="每日助教次數">' + svgBars + '</svg>' + trendTbl : emptyNote('還沒有助教用量紀錄。')) + '</section>' +
      '<section class="card"><h3>問了助教的格子（最高用到第幾級）</h3>' + cldist + '<div class="line"><span class="chip">助教代填的格子 ' + c.aiCells + '</span><span class="chip">已改寫成自己的 ' + c.aiReclaimed + '</span></div></section>' +
      '<section class="card"><h3>大家問了什麼（今天課程問題，' + c.questions.length + ' 則）</h3><div class="line">' + topics + '</div><div class="qs">' + qs + '</div><div class="muted small">主題用固定關鍵字歸類，歸不進去的放「其他」。</div></section>' +
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
  function htmlRooms(m, ui) {
    var list = m.rooms.filter(function (r) { return ui.cls === '全部' || r.cls === ui.cls; });
    var rows = list.map(function (r) {
      var info = SB.caseInfo(r.caseId), au = r.authors.map(function (a) { return '<span class="au">' + esc(ui.deid ? (m.alias[a.sid] || '學生') : a.sid) + ' ' + ratioBar(a) + ' ' + Math.round(a.avg * 100) + '%（' + a.cells + ' 格' + (a.ai ? '・代填 ' + a.ai : '') + '）</span>'; }).join('') || '<span class="muted small">還沒有人寫</span>';
      return '<details class="room" data-code="' + esc(r.code) + '"' + (ui.open && ui.open[r.code] ? ' open' : '') + ' style="--cc:' + esc(r.caseId ? info.color : '#8896a0') + '"><summary><b>' + esc(r.code) + '</b>' + (r.caseId ? '<span class="case">' + esc(info.icon + ' ' + info.name) + '</span>' : '') + '<span class="muted small">' + esc(r.cls) + '</span>' +
        '<span>牆 ' + r.wall.filled + '／' + r.wall.cells + ' 格・' + r.wall.authors + ' 人共編・圖 ' + r.imgs + '・個人板 ' + r.mine + '</span><span class="muted small">更新 ' + (r.updatedAt ? rel(m.now - r.updatedAt) : '—') + '</span><div class="aus">' + au + '</div></summary><div class="body">' + (ui.open && ui.open[r.code] ? roomBody(m, r.code, ui) : '<div class="muted small">點開時載入縮圖…</div>') + '</div></details>';
    }).join('');
    return '<section class="card"><h3>各房故事板牆（' + list.length + ' 間）</h3><div class="muted small">條的顏色：灰＝助教代填、紅＝照抄、橘＝改寫、綠＝自己寫。縮圖點開才讀，原圖不讀。</div>' + (rows || emptyNote('沒有符合篩選的房間。')) + '</section>';
  }
  function htmlAch(m, ui) {
    var cls = m.classes, base = m.openedCount;
    function rowsOf(g) { return m.ach.filter(function (a) { return a.group === g; }).map(function (a) { return '<tr class="' + (a.n ? '' : 'zero') + '"><td>' + esc(a.icon + ' ' + a.name) + '<div class="muted small">' + esc(a.how) + '</div></td><td><b>' + a.n + '</b>' + (base ? ' <span class="muted small">（' + pct(a.n, base) + '%）</span>' : '') + '</td>' + cls.map(function (c) { return '<td>' + (a.byCls[c] || 0) + '</td>'; }).join('') + '</tr>'; }); }
    var head = ['成就', '人數（佔開過板的人）'].concat(cls);
    return '<section class="card"><h3>合作成就</h3>' + table(head, rowsOf('coop')) + '</section><section class="card"><h3>助教相關成就</h3>' + table(head, rowsOf('coach')) + '</section>' +
      '<div class="muted small">開過故事板的人 ' + base + ' 位；沒有人拿到的成就用淡色標出，可能是判準太難或學生不知道有這個成就。</div>';
  }
  function levelText(s) { return s.report.level ? s.report.stars : '尚未'; }
  function htmlScore(m, ui) {
    var list = pick(m, ui), bins = scoreBins(list), mx = Math.max.apply(null, [1].concat(bins)), lab = ['0–19', '20–39', '40–59', '60–79', '80–100'];
    var dist = bins.map(function (v, i) { return '<div class="fr"><div class="fl">' + lab[i] + ' 分</div><div class="fb"><i style="width:' + Math.max(v / mx * 100, v ? 2 : 0) + '%;background:#2f9e44"></i></div><div class="fn">' + v + ' 人</div></div>'; }).join('');
    var rows = list.slice().sort(function (a, b) { return a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : (a.sid < b.sid ? -1 : 1); }).map(function (s) {
      return '<tr><td>' + esc(nameOf(s, ui)) + '</td><td>' + esc(s.cls) + '</td><td>' + esc(levelText(s)) + (s.report.maybe3 ? ' <span class="muted small">（可能 ★★★）</span>' : '') + '</td><td>' + Math.round(s.score.source * 100) + '%</td><td>' + Math.round(s.score.own * 100) + '%</td><td><b>' + s.score.total + '</b></td><td class="muted small">' + s.m.n + ' 格' + (s.m.ai ? '・代填 ' + s.m.ai : '') + '</td></tr>';
    });
    return '<section class="card warn-card"><b>僅供參考，不是成績。</b>這一頁只是照學習單的三項（各 1/3）試算，不寫入任何地方、不排名；成績照舊由楊老師在 flipclass 決定。</section>' +
      '<section class="card"><h3>試算分數分布（' + list.length + ' 人）</h3>' + dist + '</section>' +
      '<section class="card"><h3>逐位試算</h3>' + table(['學生', '班級', '報告等級', '出處完整度', '自己寫的程度', '試算分', '備註'], rows) +
      '<div class="muted small">報告等級 ÷ 3、出處完整度（有出處的格 ÷ max(6, 寫的格數)）、自己寫的程度（編輯比例，助教代填未改寫算 0，÷ max(6, 寫的格數)）。報告等級讀不到白板上的「矛盾／想法」標記，所以★★★要的那一項算沒有；標「可能 ★★★」的就是只差這一項。</div></section>';
  }
  var TABS = [['ov', '總覽'], ['st', '學生'], ['co', '助教'], ['rm', '各房'], ['ac', '成就'], ['sc', '評分預覽']];
  function html(m, ui) {
    ui = Object.assign({ cls: '全部', q: '', deid: true, tab: 'ov', open: {}, thumbs: {} }, ui || {});
    var body = { ov: htmlOverview, st: htmlStudents, co: htmlCoach, rm: htmlRooms, ac: htmlAch, sc: htmlScore }[ui.tab] || htmlOverview;
    return body(m, ui);
  }

  /* ———— 唯讀讀取：只有這七個路徑（進頁時），加上點開某房才讀的縮圖 ———— */
  function readPaths(sess) { return ['er/' + sess + '/profiles', 'er/' + sess + '/rooms', 'sbx/' + sess + '/sb', 'sbx/' + sess + '/sbm', 'sbx/' + sess + '/sbach', 'sbx/' + sess + '/sbq', 'sbops']; }
  function liveLoader(db, sess, now) {
    function rd(path, label, errs) { return db.ref(path).once('value').then(function (s) { return s.val(); }, function () { errs.push(label); return null; }); }
    return {
      load: function () {
        var errs = [], P = readPaths(sess);
        return Promise.all([rd(P[0], '名冊', errs), rd(P[1], '房間資料', errs), rd(P[2], '故事板', errs), rd(P[3], '開板紀錄', errs), rd(P[4], '成就', errs), rd(P[5], '上傳計數', errs), rd(P[6], '用量與助教', errs)]).then(function (a) {
          var ops = a[6] || {};
          return { now: (now ? now() : Date.now()), sess: sess, profiles: a[0], rooms: a[1], sb: a[2], sbm: a[3], sbach: a[4], sbq: a[5], usage: ops.usage, config: ops.config, coachUsage: ops.coachUsage, worker: ops.coachWorker, errors: errs };
        });
      },
      thumbs: function (code) {
        return db.ref('sbx/' + sess + '/sbth/' + code).once('value').then(function (s) {
          var v = s.val() || {}, o = {}; Object.keys(v).forEach(function (bk) { o[bk] = {}; Object.keys(v[bk] || {}).forEach(function (slot) { var d = v[bk][slot] && v[bk][slot].d; if (typeof d === 'string' && d.indexOf('data:image/') === 0) o[bk][slot] = d; }); }); return o;
        }, function () { return null; });
      }
    };
  }

  var CSS = ':root{--bg:#eaf4fb;--dot:#cfe3f1;--panel:#fff;--fg:#1e1e1e;--muted:#59656d;--ink:#1e1e1e;--pop:#ff6b4a;--yellow:#ffd43b;--mint:#b2f2bb;--sky:#a5d8ff;--bad:#c92a2a;--ok:#1b5e2c;--line:#cfd8de;--r-m:10px;--sh:3px}' +
    '@media (prefers-color-scheme:dark){:root{--bg:#10191f;--dot:#1b2a33;--panel:#18262e;--fg:#e8eff2;--muted:#9fb0b9;--ink:#e8eff2;--bad:#ff8787;--ok:#69db7c;--line:#2c3f4a;color-scheme:dark}}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);background-image:radial-gradient(var(--dot) 1.5px,transparent 1.5px);background-size:18px 18px;color:var(--fg);font:15px/1.6 "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif}' +
    'button,input{font:inherit}button{background:var(--yellow);color:#1e1e1e;border:3px solid var(--ink);border-radius:var(--r-m);padding:6px 14px;min-height:40px;font-weight:700;cursor:pointer;box-shadow:var(--sh) var(--sh) 0 var(--ink)}button.ghost{background:var(--panel);color:var(--fg)}button.on{background:var(--ink);color:var(--bg)}' +
    'input[type=search]{background:var(--panel);color:var(--fg);border:3px solid var(--ink);border-radius:var(--r-m);padding:6px 10px;min-height:40px;width:100%;max-width:240px}' +
    '.muted{color:var(--muted)}.small{font-size:12px}.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;align-items:center}.sbd{max-width:1100px;margin:0 auto;padding:12px 16px 40px}' +
    '.card{background:var(--panel);border:3px solid var(--ink);border-radius:var(--r-m);padding:12px 16px;margin:12px 0;box-shadow:6px 6px 0 var(--ink)}.card h3{margin:0 0 8px;font-size:18px}.warn-card{background:#fff3bf;color:#1e1e1e}' +
    '.sum{border:3px solid var(--ink);border-radius:var(--r-m);padding:10px 16px;margin:8px 0;color:#1e1e1e}.sum.ok{background:#b2f2bb}.sum.warn{background:#fff3bf}.sum.bad{background:#ffc9c9}.sum-h{display:flex;align-items:center;gap:8px;font-size:17px}.sum .dot{width:14px;height:14px;border-radius:50%;border:2px solid #1e1e1e;background:#fff}.sum.ok .dot{background:#2f9e44}.sum.warn .dot{background:#f59f00}.sum.bad .dot{background:#e03131}' +
    '.sum ul{margin:6px 0 0;padding-left:22px}.sum li.bad{font-weight:700}' +
    '.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:8px 0}.tile{border:3px solid var(--ink);border-radius:10px;padding:6px 10px;background:var(--panel)}.tile b{display:block;font-size:12px;color:var(--muted)}.tile span{font-size:17px;font-weight:900}.tile .n{font-size:11px;color:var(--muted)}' +
    '.tile.warn{background:#fff3bf;color:#1e1e1e}.tile.bad{background:#ffc9c9;color:#1e1e1e}.tile.warn b,.tile.bad b,.tile.warn .n,.tile.bad .n{color:#4a4a4a}' +
    '.line{margin:8px 0}.chip{display:inline-block;border:2px solid var(--ink);border-radius:99px;padding:0 10px;margin:2px 4px 2px 0;background:var(--panel);font-size:13px}.chip.sm{font-size:11px;padding:0 6px}' +
    '.fr{display:grid;grid-template-columns:minmax(110px,170px) 1fr minmax(96px,140px);gap:8px;align-items:center;margin:4px 0}.fl{font-size:13px}.fb{height:16px;background:rgba(128,128,128,.22);border:2px solid var(--ink);border-radius:8px;overflow:hidden}.fb i{display:block;height:100%;background:#5aa0ff}.fn{font-size:12px;text-align:right}' +
    '.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}th{font-size:12px;color:var(--muted);white-space:nowrap}tr.zero td{opacity:.5}' +
    '.flag{display:inline-block;border:2px solid #1e1e1e;border-radius:99px;padding:0 8px;margin:1px 3px 1px 0;font-size:12px;color:#1e1e1e;background:#ffd8a8}.flag.s1{background:#ffc9c9}.flag.s2{background:#fff3bf}.flag.s5{background:#d0ebff}' +
    '.bar{display:inline-flex;height:8px;background:#ddd;border-radius:4px;overflow:hidden;width:90px;vertical-align:middle}.bar i{display:block;height:100%}' +
    'details.room{border:3px solid var(--ink);border-left:10px solid var(--cc,#8896a0);border-radius:10px;margin:8px 0;padding:6px 12px;background:var(--panel)}details.room>summary{cursor:pointer;display:flex;gap:12px;flex-wrap:wrap;align-items:center;min-height:36px}.case{font-weight:700}.aus{flex:1 0 100%}.au{display:inline-block;margin-right:14px;font-size:12px}' +
    '.strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.strip figure{margin:0;width:120px;font-size:11px}.strip img,.noimg{width:120px;height:80px;object-fit:contain;border:2px solid var(--ink);border-radius:6px;background:#eef;display:flex;align-items:center;justify-content:center;color:#59656d}' +
    '.qs{max-height:320px;overflow:auto;border-top:1px dashed var(--line);margin-top:6px;padding-top:6px}.q{margin:4px 0;font-size:13px;word-break:break-word}.trend{width:100%;max-width:640px;height:170px;display:block;margin:4px 0 8px;color:var(--fg)}.empty{padding:12px;color:var(--muted);text-align:center}' +
    '@media (max-width:560px){.sbd{padding:8px 10px 32px}.card{padding:10px 12px;box-shadow:4px 4px 0 var(--ink)}.fr{grid-template-columns:1fr;gap:2px;margin:8px 0}.fn{text-align:left}.strip figure{width:calc(50% - 4px)}.strip img,.noimg{width:100%}}';

  /* ———— 掛到頁面：只有「看」的控制 ———— */
  function mount(el, opts) {
    opts = opts || {}; var ui = { cls: '全部', q: '', deid: opts.deid !== false, tab: opts.tab || 'ov', open: {}, thumbs: {} }, model = null, timer = null, inflight = false;
    function toolbar() {
      var cls = ['全部'].concat(model ? model.classes : CLASSES);
      return '<div class="toolbar"><div class="tabs" role="tablist">' + TABS.map(function (t) { return '<button class="' + (ui.tab === t[0] ? 'on' : 'ghost') + '" data-tab="' + t[0] + '" role="tab" aria-selected="' + (ui.tab === t[0]) + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>' +
        '<div class="tabs">' + cls.map(function (c) { return '<button class="' + (ui.cls === c ? 'on' : 'ghost') + '" data-cls="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '<input type="search" id="sbdQ" placeholder="搜尋學號或姓名" aria-label="搜尋學生" value="' + esc(ui.q) + '">' +
        '<button class="' + (ui.deid ? 'on' : 'ghost') + '" data-act="deid">去識別化：' + (ui.deid ? '開' : '關') + '</button><button class="ghost" data-act="reload">重新讀取</button></div>' +
        '<div class="muted small">' + (model ? '資料時間 ' + clock(model.now) + '（' + rel(Math.max(1, Date.now() - model.now)) + '）・場次 ' + esc(model.sess) + '・唯讀，要改設定請在 Claude Code 說' : '讀取中…') + '</div></div>';
    }
    function draw() {
      var keep = el.querySelector('#sbdQ') === document.activeElement, pos = keep ? el.querySelector('#sbdQ').selectionStart : 0;
      el.innerHTML = '<style>' + CSS + '</style><div class="sbd">' + toolbar() + '<div id="sbdBody">' + (model ? html(model, ui) : '<div class="empty">讀取中…</div>') + '</div></div>';
      if (keep) { var q = el.querySelector('#sbdQ'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} }
      if (opts.onDraw) opts.onDraw(model, ui);
    }
    function reload() {
      if (inflight) return Promise.resolve(); inflight = true;
      return Promise.resolve(opts.loader.load()).then(function (raw) { model = build(raw); draw(); }, function (e) { el.innerHTML = '<div class="sbd"><div class="card">讀取失敗：' + esc((e && e.message) || e) + '</div></div>'; }).then(function () { inflight = false; });
    }
    function openRoom(code) {
      ui.open[code] = true; if (ui.thumbs[code] !== undefined) { draw(); return; }
      Promise.resolve(opts.loader.thumbs(code)).then(function (t) { ui.thumbs[code] = t; draw(); });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
      if (b.dataset.tab) { ui.tab = b.dataset.tab; draw(); } else if (b.dataset.cls) { ui.cls = b.dataset.cls; draw(); }
      else if (b.dataset.act === 'deid') { ui.deid = !ui.deid; try { localStorage.setItem('erg_t_deid', ui.deid ? '1' : '0'); } catch (x) {} draw(); }
      else if (b.dataset.act === 'reload') reload();
    });
    el.addEventListener('input', function (e) { if (e.target && e.target.id === 'sbdQ') { ui.q = e.target.value; var body = el.querySelector('#sbdBody'); if (body && model) body.innerHTML = html(model, ui); } });
    el.addEventListener('toggle', function (e) { var d = e.target; if (d && d.classList && d.classList.contains('room')) { if (d.open) { if (!ui.open[d.dataset.code]) openRoom(d.dataset.code); } else delete ui.open[d.dataset.code]; } }, true);
    var p = reload(); if (opts.autoMs) timer = setInterval(function () { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') reload(); }, opts.autoMs);
    return { reload: reload, stop: function () { clearInterval(timer); }, ready: p, ui: ui, model: function () { return model; }, draw: draw };
  }

  return { DEFAULT_SESS: DEFAULT_SESS, CLASSES: CLASSES, STAGES: STAGES, TOPICS: TOPICS, TABS: TABS, CSS: CSS, build: build, html: html, pick: pick, topicOf: topicOf, isTestSid: isTestSid, scoreBins: scoreBins, readPaths: readPaths, liveLoader: liveLoader, mount: mount, rel: rel, clock: clock };
});
