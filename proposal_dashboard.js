/* 提案室（W10）老師儀表板：唯讀。計算（build／verifyRows）與畫面字串（html／detailHtml）都是純函式，Node 可測；mount 才碰 DOM。
   楊老師 11-01：「後台要有提案分頁」。範本是 sb_dashboard.js（W8 故事板後台）：登入、老師白名單、班級對應、去識別化、燈號都沿用。
   這一頁沒有任何寫入（不呼叫 set／update／push／remove／transaction）。
   案例（11-01）：提案按案例分開存（doc／dirh／sub／rev 在學號底下多一層 {案例}），這一頁一次看一個案例（預設 sms；網址 ?case=bike 看預留的別的案例）；
   事件帶 c＝案例，沒帶的當預設案例；助手名額與用量是每人每天合計，不分案例。資料裡出現不認得的案例代碼會標在資料檢查區。
   進頁讀 9 個路徑：er/{場次}/profiles（名冊與班級）、prx/{場次}/doc｜dirh｜sub｜rev｜ev｜usage｜coachq、er/_daemon/admin/reviewUsage（只取 proposal 那一類）。
   點開某位學生才多讀他引用的房間（er/{場次}/rooms/{房}/players/{學號} 等幾個小節點）去核對「依據是不是真的在他的紀錄裡」：
   列表上只算得出「沒選依據」，「選了但紀錄裡已經找不到」要點進去才核對（為了省流量，不整包讀房間）。
   算不出的指標一律寫「查不到」，不估：沒綁定帳號的學生（只有選課人數）、事件寫入失敗的開頁、每位學生的助手花費（只有全班合計）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'), require('./proposal_core.js'), require('./teacher_model.js'), require('./proposal_units.js'));
  else root.ERG_PXDASH = factory(root.ERG_SB, root.ERG_PX, root.ERG_TMODEL, root.ERG_UNITS || null);
})(typeof self !== 'undefined' ? self : this, function (SB, PX, TM, UN) {
  'use strict';
  var esc = SB.esc, arr = SB.arr;
  var DEFAULT_SESS = 'ER-20261013';   /* 與 proposal_ui.js 的 UNIT_SESS 同值（提案室和急診室同一個場次） */
  var CLASSES = ['二甲', '二乙', '二丙'], NOCLS = '未分班';
  var OPENED_IDLE_MS = 30 * 60 * 1000;
  var EVENT_KINDS = PX.EVENT_KINDS, KIND_ZH = { open: '開頁', row_add: '加一列', row_del: '刪列', ev_pick: '選依據', ask_back: '回去問', coach: '問助手', dir: '換方向', submit: '送審', export: '匯出' };
  var SCORE_KEYS = /^(score|scores|grade|grades|rank|point|points|分數|成績|等第)$/i;
  var STAGE_NAME = { none: '還沒開', opened: '開了沒寫', writing: '寫作中', ready: '可送審', sent: '已送審' };
  var STAGE_TL = { none: 'bad', opened: 'warn', writing: 'info', ready: 'ok', sent: 'ok' };

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function isTestSid(sid) { return /^(\d{1,3}|test.*|demo.*|t_.*)$/i.test(String(sid)); }   /* 與 sb_dashboard 同一個規則：純數字短編號（老師與測試）、test／demo 開頭不計入 */
  function clsOf(p) { var c = p && p.cls; return CLASSES.indexOf(c) >= 0 ? c : NOCLS; }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
  function pad(n) { return ('0' + n).slice(-2); }
  function fmtDT(ts) { if (!(Number(ts) > 0)) return '—'; var d = new Date(Number(ts) + SB.LIMITS.tzOffsetMs); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function rel(ms) { if (!(ms > 0)) return '—'; var m = Math.round(ms / 60000); if (m < 1) return '剛剛'; if (m < 90) return m + ' 分鐘前'; var h = ms / 3600000; return h < 36 ? Math.round(h) + ' 小時前' : Math.round(h / 24) + ' 天前'; }
  function dirName(pick) { var d = PX.DIRS.filter(function (x) { return x.k === pick; })[0]; return d ? d.name : ''; }
  function hasScoreField(o, d) { d = d || 0; return !!o && typeof o === 'object' && d < 4 && Object.keys(o).some(function (k) { return (!Array.isArray(o) && SCORE_KEYS.test(k)) || (o[k] && typeof o[k] === 'object' && hasScoreField(o[k], d + 1)); }); }
  /* 方向「改過」：相鄰兩筆歷程的方向不同，或同樣選「我自己的方向」但內容不同。只改「為什麼」不算改方向（歷程每次存檔都記一筆） */
  function dirChanges(hist) {
    var h = arr(hist).slice().sort(function (a, b) { return num(a.at) - num(b.at); }), n = 0;
    for (var i = 1; i < h.length; i += 1) if (h[i].pick !== h[i - 1].pick || (h[i].pick === 'mine' && String(h[i].mine || '') !== String(h[i - 1].mine || ''))) n += 1;
    return n;
  }

  /* ———— 一位學生：只用「事件或資料算得出的」 ———— */
  function studentOf(sid, ctx) {
    var raw = ctx.raw, doc = PX.normDoc(raw.docs[sid]), hasDoc = !!raw.docs[sid], evNode = raw.evs[sid] || {}, anom = ctx.anom;
    var evs = Object.keys(evNode).map(function (k) { return evNode[k] || {}; }), byKind = {}; EVENT_KINDS.forEach(function (k) { byKind[k] = 0; });
    evs.forEach(function (e) {
      if (byKind[e.k] === undefined) { anom.push({ sid: sid, kind: 'ev-kind', text: '事件種類不認得：' + String(e.k).slice(0, 20) }); return; }
      byKind[e.k] += 1;
      if (String(e.d || '').length > 40 || Object.keys(e).some(function (k) { return ['t', 'k', 'd', 'c'].indexOf(k) < 0; })) anom.push({ sid: sid, kind: 'ev-content', text: '事件裡多了不該有的內容（只該有種類與 ≤40 字的標記）' });
    });
    var openAts = evs.filter(function (e) { return e.k === 'open'; }).map(function (e) { return num(e.t); }).filter(Boolean).sort(function (a, b) { return a - b; });
    var rd = raw.docs[sid] || {};
    if (rd.dir && rd.dir.pick && !PX.DIRS.some(function (x) { return x.k === rd.dir.pick; })) anom.push({ sid: sid, kind: 'dir-invalid', text: '方向的值不在四種裡：' + String(rd.dir.pick).slice(0, 20) });
    Object.keys(rd.rows || {}).forEach(function (k) { var m = /^r([1-8])$/.exec(k); if (!m || (rd.rows[k] && num(rd.rows[k].n) && num(rd.rows[k].n) !== Number(m[1]))) anom.push({ sid: sid, kind: 'row-key', text: '對準表的列號不對：' + k }); });
    var filled = doc.rows.filter(PX.rowFilled), gapRows = filled.filter(function (r) { return !r.ev.length; }).map(function (r) { return r.n; });
    var dirOk = !!doc.dir.pick && !!PX.tr(doc.dir.why) && (doc.dir.pick !== 'mine' || !!PX.tr(doc.dir.mine));
    var realDone = PX.REAL_KEYS.filter(function (k) { return PX.realAnswered(doc.real[k]); }).length;
    var hist = Object.keys(raw.dirh[sid] || {}).sort().map(function (k) { return raw.dirh[sid][k]; });
    /* 送審：一天一份（資料庫規則擋同一天第二份）。日期鍵要和送審時間對得上 */
    var subNode = raw.subs[sid] || {}, subDays = Object.keys(subNode).filter(function (d) { return /^\d{8}$/.test(d); }).sort();
    subDays.forEach(function (d) { var t = num((subNode[d] || {}).t); if (t && PX.dayKey(t) !== d) anom.push({ sid: sid, kind: 'sub-day', text: '送審的日期鍵 ' + d + ' 和送審時間（' + PX.dayKey(t) + '）對不上' }); });
    var lastSubT = subDays.reduce(function (a, d) { return Math.max(a, num((subNode[d] || {}).t)); }, 0);
    /* 審核（AI 建議，不是分數）：每天一份，取最新一天 */
    var revNode = raw.revs[sid] || {}, revDays = Object.keys(revNode).filter(function (d) { return /^\d{8}$/.test(d); }).sort(), lastRevDay = revDays[revDays.length - 1] || '', lastRev = lastRevDay ? revNode[lastRevDay] : null;
    revDays.forEach(function (d) {
      var r = revNode[d] || {};
      if (hasScoreField(r)) anom.push({ sid: sid, kind: 'rev-score', text: '審核結果 ' + d + ' 裡有分數類欄位（審核只該給建議）' });
      if (r.advisory !== true) anom.push({ sid: sid, kind: 'rev-advisory', text: '審核結果 ' + d + ' 沒有標「僅供建議」' });
    });
    /* 助手：前端計數（問了幾次）與後端用量（答了幾次）；全班合計的費用才有，個人花費查不到 */
    var asks = 0, askToday = 0, answered = 0, today = PX.dayKey(raw.now);
    Object.keys(raw.coachq).forEach(function (d) { var n = num((raw.coachq[d] || {})[sid]); asks += n; if (d === today) askToday = n; if (n > PX.COACH_PER_DAY) anom.push({ sid: sid, kind: 'coach-cap', text: '助手 ' + d + ' 問了 ' + n + ' 次，超過每日上限 ' + PX.COACH_PER_DAY }); });
    Object.keys(raw.usage).forEach(function (d) { answered += num(((raw.usage[d] || {}).users || {})[sid]); });
    var opened = hasDoc || byKind.open > 0 || evs.length > 0 || subDays.length > 0;
    var lastAt = Math.max(num(doc.updatedAt), lastSubT, evs.reduce(function (a, e) { return Math.max(a, num(e.t)); }, 0));
    var stage = subDays.length ? 'sent' : !opened ? 'none' : (!doc.dir.pick && !filled.length ? 'opened' : (dirOk && filled.length >= PX.LIMITS.minRows ? 'ready' : 'writing'));
    var stuckReal = dirOk && filled.length >= PX.LIMITS.minRows && !gapRows.length && realDone < 3;
    var idle = stage === 'opened' && openAts.length && raw.now - openAts[0] >= OPENED_IDLE_MS;
    var pc = ctx.prof[sid] || {};
    /* 每週送審（依份）：這位學生每一份的狀態（wait＝送審了還在等；done＝已有建議）與最新一筆審核的燈號。哪一份由審核自己寫的 unit，沒有就用送審日期＋班級推出 */
    var units = {};
    if (UN) {
      var dset = {}; subDays.forEach(function (d) { dset[d] = 1; }); revDays.forEach(function (d) { dset[d] = 1; });
      Object.keys(dset).sort().forEach(function (d) {
        var sb = subNode[d] || null, rv = revNode[d] || null, t = sb ? num(sb.t) : 0, uid = (rv && rv.unit) || UN.unitForSub(d, t, pc.cls).unit.id;
        var state = (sb && (!rv || (t && num(rv.at) < t))) ? 'wait' : 'done';
        units[uid] = { day: d, state: state, checks: (rv && state === 'done' && Array.isArray(rv.checks)) ? rv.checks : [] };
      });
    }
    return { sid: sid, units: units, name: String(pc.name || ''), cls: clsOf(pc), inRoster: !!ctx.prof[sid], doc: doc, hasDoc: hasDoc, opened: opened, firstOpenAt: openAts[0] || 0, lastAt: lastAt, stage: stage, idle: !!idle,
      pick: doc.dir.pick, dirOk: dirOk, dirChanges: dirChanges(hist), dirHist: hist, rowsFilled: filled.length, rows3: filled.length >= PX.LIMITS.minRows, gapRows: gapRows, realDone: realDone, stuckReal: stuckReal,
      subDays: subDays, subCount: subDays.length, lastSubT: lastSubT, lastRevDay: lastRevDay, lastRev: lastRev, revOk: lastRev ? lastRev.ok === true : null, revDays: revDays,
      exports: byKind.export, exportKinds: evs.filter(function (e) { return e.k === 'export'; }).map(function (e) { return e.d; }), evCount: byKind, evTotal: evs.length,
      asks: asks, askToday: askToday, answered: answered, aiRows: PX.aiFilledRows(doc), aiShare: PX.aiFieldShare(doc) };
  }

  /* 資料庫原樣是 {學號:{案例:內容}}：取出指定案例，變成 {學號:內容}。學號底下出現不認得的案例代碼（含舊格式的 dir／rows）→ 標異常 */
  function caseSlice(node, cid, anom, label) {
    var out = {};
    Object.keys(node || {}).forEach(function (sid) {
      var v = node[sid]; if (!v || typeof v !== 'object') return;
      Object.keys(v).forEach(function (k) { if (!PX.isCase(k)) anom.push({ sid: sid, kind: 'case-key', text: label + '底下的案例代碼不認得：' + String(k).slice(0, 20) }); });
      if (v[cid] !== undefined && v[cid] !== null) out[sid] = v[cid];
    });
    return out;
  }
  /* 事件：{學號:{鍵:事件}}，只留 c（沒帶＝預設案例）等於指定案例的；c 不認得的標異常並丟掉 */
  function evSlice(node, cid, anom) {
    var out = {};
    Object.keys(node || {}).forEach(function (sid) {
      var v = node[sid] || {}, keep = {};
      Object.keys(v).forEach(function (k) {
        var e = v[k] || {};
        if (e.c !== undefined && !PX.isCase(e.c)) { anom.push({ sid: sid, kind: 'ev-case', text: '事件的案例代碼不認得：' + String(e.c).slice(0, 20) }); return; }
        if ((e.c || PX.DEFAULT_CASE) === cid) keep[k] = e;
      });
      if (Object.keys(keep).length) out[sid] = keep;
    });
    return out;
  }

  /* ———— 整頁的數字。raw＝資料庫原樣：{ now, sess, case, profiles, docs, dirh, subs, revs, evs, usage, coachq, reviewUsage, errors } ———— */
  function build(raw) {
    raw = raw || {}; var now = num(raw.now) || Date.now();
    var errors = arr(raw.errors || []), anom = [], CASE = PX.caseOf(raw['case']);
    var R = { now: now, sess: raw.sess || DEFAULT_SESS, caseId: CASE, prof: raw.profiles || {}, docs: caseSlice(raw.docs, CASE, anom, '提案'), dirh: caseSlice(raw.dirh, CASE, anom, '方向歷程'), subs: caseSlice(raw.subs, CASE, anom, '送審'), revs: caseSlice(raw.revs, CASE, anom, '審核結果'), evs: evSlice(raw.evs, CASE, anom), usage: raw.usage || {}, coachq: raw.coachq || {}, reviewUsage: raw.reviewUsage || {} };
    var ctx = { raw: R, prof: R.prof, anom: anom }, ids = {};
    Object.keys(R.prof).forEach(function (s) { ids[s] = 1; });
    ['docs', 'dirh', 'subs', 'revs', 'evs'].forEach(function (k) { Object.keys(R[k]).forEach(function (s) { ids[s] = 1; }); });
    Object.keys(R.coachq).forEach(function (d) { Object.keys(R.coachq[d] || {}).forEach(function (s) { ids[s] = 1; }); });
    var sids = Object.keys(ids).filter(function (s) { return !isTestSid(s); }).sort(), students = sids.map(function (s) { return studentOf(s, ctx); });
    var alias = {}; sids.forEach(function (s, i) { alias[s] = '學生' + pad(i + 1); });
    var clsList = CLASSES.slice(); if (students.some(function (x) { return x.cls === NOCLS; })) clsList.push(NOCLS);

    function aggOf(list, cls) {
      var roster = list.filter(function (s) { return s.inRoster; }).length, size = (TM.RULES.classSize || {})[cls] || 0;
      var c = function (f) { return list.filter(f).length; };
      return { cls: cls, size: size, roster: roster, unbound: size ? Math.max(0, size - roster) : null, seen: list.length,
        opened: c(function (s) { return s.opened; }), idle: c(function (s) { return s.idle; }), dir: c(function (s) { return !!s.pick; }), dirOk: c(function (s) { return s.dirOk; }), rows3: c(function (s) { return s.rows3; }), gap: c(function (s) { return s.gapRows.length > 0; }),
        real3: c(function (s) { return s.realDone >= 3; }), stuckReal: c(function (s) { return s.stuckReal; }), sent: c(function (s) { return s.subCount > 0; }), revOk: c(function (s) { return s.revOk === true; }), revFix: c(function (s) { return s.revOk === false; }),
        exported: c(function (s) { return s.exports > 0; }), helper: c(function (s) { return s.asks > 0; }), helperCap: c(function (s) { return s.askToday >= PX.COACH_PER_DAY; }) };
    }
    var agg = { '全部': aggOf(students, '全部') }; clsList.forEach(function (cl) { agg[cl] = aggOf(students.filter(function (s) { return s.cls === cl; }), cl); });
    agg['全部'].size = CLASSES.reduce(function (a, cl) { return a + ((TM.RULES.classSize || {})[cl] || 0); }, 0); agg['全部'].unbound = agg['全部'].size ? Math.max(0, agg['全部'].size - students.filter(function (s) { return s.inRoster; }).length) : null;

    function dirDist(list) {
      var o = { web: 0, line: 0, app: 0, mine: 0, none: 0, changers: 0, changes: 0 };
      list.forEach(function (s) { o[s.pick || 'none'] += 1; if (s.dirChanges > 0) { o.changers += 1; o.changes += s.dirChanges; } }); return o;
    }
    var dist = { '全部': dirDist(students) }; clsList.forEach(function (cl) { dist[cl] = dirDist(students.filter(function (s) { return s.cls === cl; })); });

    /* 用量：提案室專屬。助手＝prx/{場次}/coachq（問）與 usage（答、費用）；審核＝reviewUsage 裡 proposal 那一類，其他類（訪談、回應指引）不算 */
    var days = Object.keys(R.usage).filter(function (d) { return /^\d{8}$/.test(d); }).sort(), today = PX.dayKey(now), cu = { calls: 0, usd: 0, fills: 0, tokIn: 0, tokOut: 0, byKind: {}, capHits: { user: 0, fill: 0, usd: 0 }, days: [], todayCalls: 0, todayUsd: 0 };
    days.forEach(function (d) {
      var u = R.usage[d] || {}, usd = num(u.nusd) / 1e9; cu.calls += num(u.calls); cu.usd += usd; cu.fills += num(u.fills); cu.tokIn += num(u.tokIn); cu.tokOut += num(u.tokOut);
      Object.keys(u.byKind || {}).forEach(function (k) { cu.byKind[k] = (cu.byKind[k] || 0) + num(u.byKind[k]); });
      ['user', 'fill', 'usd'].forEach(function (k) { cu.capHits[k] += num((u.capHits || {})[k]); });
      cu.days.push({ day: d, calls: num(u.calls), usd: usd, users: Object.keys(u.users || {}).length });
      if (d === today) { cu.todayCalls = num(u.calls); cu.todayUsd = usd; }
      if (num(u.nusd) < 0 || num(u.calls) < 0) anom.push({ sid: '', kind: 'usage-neg', text: '助手用量 ' + d + ' 出現負數' });
    });
    var asksAll = 0, asksToday = 0, askUsers = {}; Object.keys(R.coachq).forEach(function (d) { Object.keys(R.coachq[d] || {}).forEach(function (s) { if (isTestSid(s)) return; var n = num(R.coachq[d][s]); asksAll += n; askUsers[s] = 1; if (d === today) asksToday += n; }); });
    var ru = { runs: 0, n: 0, usd: 0, tin: 0, tout: 0, days: [], last: 0 };
    Object.keys(R.reviewUsage).filter(function (d) { return /^\d{8}$/.test(d); }).sort().forEach(function (d) {
      var p = (R.reviewUsage[d] || {}).proposal; if (!p) return;
      ru.runs += num(p.runs); ru.n += num(p.n); ru.usd += num(p.usd); ru.tin += num(p.tin); ru.tout += num(p.tout); ru.last = Math.max(ru.last, num(p.last)); ru.days.push({ day: d, runs: num(p.runs), n: num(p.n), usd: num(p.usd) });
    });
    var usage = { coach: cu, asksAll: asksAll, asksToday: asksToday, askUsers: Object.keys(askUsers).length, perDay: PX.COACH_PER_DAY, review: ru, usdPerAnswer: cu.calls ? cu.usd / cu.calls : null };

    /* 需要關心（短清單，先數字後名單）。排序：先最需要的 */
    function care(list) {
      var byGap = list.filter(function (s) { return s.gapRows.length > 0 && s.stage !== 'sent'; }).sort(function (a, b) { return b.gapRows.length - a.gapRows.length || (a.sid < b.sid ? -1 : 1); });
      return { none: list.filter(function (s) { return s.inRoster && !s.opened; }).map(function (s) { return s.sid; }),
        idle: list.filter(function (s) { return s.idle; }).sort(function (a, b) { return a.firstOpenAt - b.firstOpenAt; }).map(function (s) { return s.sid; }),
        gap: byGap.map(function (s) { return s.sid; }), stuckReal: list.filter(function (s) { return s.stuckReal && s.stage !== 'sent'; }).map(function (s) { return s.sid; }),
        revFix: list.filter(function (s) { return s.revOk === false; }).map(function (s) { return s.sid; }) };
    }
    var cares = { '全部': care(students) }; clsList.forEach(function (cl) { cares[cl] = care(students.filter(function (s) { return s.cls === cl; })); });
    /* 每週送審（依份）：誰送了、哪一份已有建議、每顆燈 ✓／△／○ 各幾人、哪些人有燈沒亮。沒有 proposal_units.js 就不出這一塊 */
    function weeklyOf(list) {
      return UN.DATA.units.map(function (u) {
        var lights = UN.DATA.lights.filter(function (L) { return u.lights.indexOf(L.k) >= 0; }), tally = {}, stuck = [], sent = 0, done = 0;
        lights.forEach(function (L) { tally[L.k] = { ok: 0, part: 0, no: 0 }; });
        list.forEach(function (s) {
          var x = s.units[u.id]; if (!x) return; sent += 1; if (x.state !== 'done') return; done += 1;
          var off = [];
          lights.forEach(function (L) { var c = x.checks.filter(function (k) { return k.k === L.k; })[0]; if (!c || tally[L.k][c.state] === undefined) return; tally[L.k][c.state] += 1; if (c.state !== 'ok') off.push(L.name); });
          if (off.length) stuck.push({ sid: s.sid, names: off });
        });
        return { id: u.id, name: u.name, week: u.week, lights: lights, sent: sent, done: done, tally: tally, stuck: stuck };
      });
    }
    var weekly = null;
    if (UN) { weekly = { '全部': weeklyOf(students) }; clsList.forEach(function (cl) { weekly[cl] = weeklyOf(students.filter(function (s) { return s.cls === cl; })); }); }
    errors.forEach(function (e) { anom.push({ sid: '', kind: 'read', text: '讀不到' + e + '：那一塊先不顯示。' }); });
    return { weekly: weekly, now: now, sess: R.sess, caseId: CASE, caseName: PX.caseName(CASE), students: students, byId: students.reduce(function (o, s) { o[s.sid] = s; return o; }, {}), alias: alias, classes: clsList, agg: agg, dist: dist, usage: usage, cares: cares, anomalies: anom, errors: errors };
  }

  /* ———— 依據核對（點開某位學生才做）：每列選的依據是否真的在他現在的紀錄裡 ————
     rooms：PX.roomInput 的結果陣列；boards：[{code, cells}]；sceneOk＝有沒有讀到場景資料（讀不到時「自己記的卡片」查不到，不能說找不到） */
  function verifyRows(doc, rooms, boards, sceneOk, caseId) {
    /* caseId：這份提案的案例。別的案例的房間讀到了也不算它的證據（學生端選不到）→ 核對成「找不到」；沒讀到的房間才是「查不到」 */
    var evidence = PX.buildEvidence(rooms || [], { caseId: caseId }), em = PX.evMap(evidence), cells = PX.buildCells(caseId ? (boards || []).filter(function (b) { return (rooms || []).some(function (r) { return r.code === b.code && r.caseId === caseId; }); }) : (boards || [])), cm = {}; cells.forEach(function (c) { cm[c.id] = c; });
    var codes = {}; (rooms || []).forEach(function (r) { codes[r.code] = 1; });
    var out = doc.rows.map(function (r) {
      var ev = r.ev.map(function (id) {
        var e = em[id], code = (/^(?:iv|mk|cc):([A-Z0-9]{4}):/.exec(id) || [])[1];
        if (e) return { id: id, state: 'ok', text: e.text, src: e.src };
        if (code && !codes[code]) return { id: id, state: 'unknown', text: '', src: '沒讀到房間 ' + code };
        if (/^mk:/.test(id) && !sceneOk) return { id: id, state: 'unknown', text: '', src: '沒讀到場景資料，自己記的卡片查不到' };
        return { id: id, state: 'lost', text: '', src: '在他的紀錄裡找不到' };
      });
      var cell = r.cell ? (cm[r.cell] ? { id: r.cell, state: 'ok', text: cm[r.cell].label } : { id: r.cell, state: (/^([A-Z0-9]{4}):/.exec(r.cell) && boards && boards.some(function (b) { return b.code === r.cell.slice(0, 4); })) ? 'lost' : 'unknown', text: '' }) : null;
      return { n: r.n, ev: ev, cell: cell };
    });
    return { rows: out, ok: out.reduce(function (a, r) { return a + r.ev.filter(function (e) { return e.state === 'ok'; }).length; }, 0), lost: out.reduce(function (a, r) { return a + r.ev.filter(function (e) { return e.state === 'lost'; }).length; }, 0), unknown: out.reduce(function (a, r) { return a + r.ev.filter(function (e) { return e.state === 'unknown'; }).length; }, 0), evidenceN: evidence.length };
  }
  function roomCodesOf(doc) {
    var o = {}; doc.rows.forEach(function (r) { r.ev.forEach(function (id) { var m = /^(?:iv|mk|cc):([A-Z0-9]{4}):/.exec(id); if (m) o[m[1]] = 1; }); if (r.cell) { var c = /^([A-Z0-9]{4}):/.exec(r.cell); if (c) o[c[1]] = 1; } });
    return Object.keys(o).slice(0, 6);
  }

  /* ———— 畫面字串 ———— */
  function who(m, sid, deid) { var s = m.byId[sid]; return deid ? (m.alias[sid] || '學生') : sid + (s && s.name ? ' ' + s.name : ''); }
  function frac(a, b) { return a + '／' + b + '（' + pct(a, b) + '%）'; }
  function kp(items, label) { return '<div class="kpi pk" role="group" aria-label="' + esc(label) + '">' + items.map(function (x) { return '<div' + (x[2] ? ' class="' + x[2] + '"' : '') + '><div class="big">' + esc(x[0]) + '</div><div class="muted">' + esc(x[1]) + '</div></div>'; }).join('') + '</div>'; }
  function tl(level, text) { return '<span class="tl ' + level + '">' + esc(text) + '</span>'; }
  function table(head, rows, cls) { return '<div class="tw"><table' + (cls ? ' class="' + cls + '"' : '') + '><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'; }

  function htmlSummary(m) {
    var bad = m.anomalies.filter(function (a) { return a.kind !== 'read'; }), rd = m.anomalies.filter(function (a) { return a.kind === 'read'; }), lvl = bad.length ? 'bad' : (rd.length ? 'warn' : 'ok');
    var head = lvl === 'ok' ? '資料沒有異常' : (bad.length ? bad.length + ' 筆資料不對勁' : rd.length + ' 塊資料讀不到');
    var groups = {}; m.anomalies.forEach(function (a) { (groups[a.kind] = groups[a.kind] || []).push(a); });
    var li = Object.keys(groups).map(function (k) { var g = groups[k]; return '<li class="' + (k === 'read' ? 'warn' : 'bad') + '">' + esc(g[0].text) + (g.length > 1 ? '（共 ' + g.length + ' 筆）' : '') + '</li>'; }).join('');
    return '<section class="sum ' + lvl + '" role="status" id="pxSum"><div class="sum-h"><span class="dot"></span><b>資料檢查：' + esc(head) + '</b></div>' + (li ? '<ul>' + li + '</ul>' : '') + '</section>';
  }
  function kpOf(m, cl) {
    var a = m.agg[cl] || m.agg['全部'], label = cl === '全部' ? '三班' : cl;
    return kp([[a.roster, '人已綁定（' + label + (a.size ? '・選課 ' + a.size : '') + '）'], [a.opened, '人開過提案室', a.opened ? 'good' : ''], [a.dir, '人選了方向'], [a.rows3, '人對準表 ≥3 列'], [a.gap, '人有指不回訪談的列', a.gap ? 'bad' : ''], [a.real3, '人現實題答完'], [a.sent, '人已送審', a.sent ? 'good' : ''], [a.revOk + '／' + a.revFix, '審核：對得起來／要補'], [a.exported, '人匯出過']], '提案室關鍵數字');
  }
  function htmlCompare(m, cl) {
    var cols = m.classes, defs = [
      ['已綁定帳號', function (a) { return a.roster + (a.size ? '／' + a.size : ''); }], ['開過提案室', function (a) { return frac(a.opened, a.roster); }], ['選了方向', function (a) { return frac(a.dir, a.roster); }], ['對準表 ≥3 列', function (a) { return frac(a.rows3, a.roster); }],
      ['有指不回訪談的列（人）', function (a) { return a.gap + ' 人'; }], ['現實題答完 3 題', function (a) { return frac(a.real3, a.roster); }], ['卡在現實題（人）', function (a) { return a.stuckReal + ' 人'; }], ['已送審', function (a) { return frac(a.sent, a.roster); }],
      ['審核：對得起來', function (a) { return a.revOk + ' 人'; }], ['審核：還要補', function (a) { return a.revFix + ' 人'; }], ['匯出過', function (a) { return frac(a.exported, a.roster); }], ['用過助手', function (a) { return frac(a.helper, a.roster); }], ['沒綁定帳號（查不到有沒有開過）', function (a) { return a.unbound === null ? '查不到' : a.unbound + ' 人'; }]];
    var rows = defs.map(function (d) { return '<tr><td>' + esc(d[0]) + '</td>' + cols.map(function (c) { return '<td' + (c === cl ? ' class="cur"' : '') + '>' + esc(d[1](m.agg[c])) + '</td>'; }).join('') + '</tr>'; });
    return '<section class="card" id="pxCompare"><h3>三班一眼看完</h3><div class="muted small">分母是「已綁定帳號」的人（名冊資料）。沒綁定的學生系統看不到他們有沒有開過，所以單獨列出，不併進分母。</div>' + table(['指標'].concat(cols.map(function (c) { return c === cl ? c + '（目前選的）' : c; })), rows, 'cmp') + '</section>';
  }
  function htmlDirs(m, cl) {
    var d = m.dist[cl] || m.dist['全部'], tot = d.web + d.line + d.app + d.mine + d.none || 1, items = [['web', '把簡訊改成網頁', d.web, '#3d6fe0'], ['line', '接 LINE 官方帳號', d.line, '#2b8a3e'], ['app', '整合進醫院 App', d.app, '#e8590c'], ['mine', '我自己的方向（修改過或自己提出）', d.mine, '#9c36b5'], ['none', '還沒選', d.none, '#868e96']];
    var rows = items.map(function (x) { return '<div class="fr"><div class="fl">' + esc(x[1]) + '</div><div class="fb"><i style="width:' + Math.max(x[2] / tot * 100, x[2] ? 2 : 0) + '%;background:' + x[3] + '"></i></div><div class="fn">' + x[2] + ' 人（' + pct(x[2], tot) + '%）</div></div>'; }).join('');
    return '<section class="card" id="pxDirs"><h3>方向分布：' + esc(cl === '全部' ? '三班' : cl) + '</h3>' + rows + '<div class="line"><b>換過方向</b>　' + (d.changers ? '<span class="chip">' + d.changers + ' 人換過，共 ' + d.changes + ' 次</span>' : '<span class="muted small">沒有人換過方向</span>') + '<span class="muted small">（相鄰兩筆歷程的方向不同才算；只改「為什麼」不算）</span></div></section>';
  }
  function careBlock(id, title, sids, m, deid, note, extra) {
    var shown = sids.slice(0, 8), more = sids.slice(8);
    function chip(s) { return '<button class="chip pick" data-sel="' + esc(s) + '">' + esc(who(m, s, deid)) + (extra ? esc(extra(s)) : '') + '</button>'; }
    return '<div class="care" id="' + id + '"><div class="ch"><span class="big2">' + sids.length + '</span> <b>' + esc(title) + '</b></div>' + (note ? '<div class="muted small">' + esc(note) + '</div>' : '') + (sids.length ? '<div>' + shown.map(chip).join('') + '</div>' + (more.length ? '<details class="sg-more"><summary>還有 ' + more.length + ' 人</summary><div>' + more.map(chip).join('') + '</div></details>' : '') : '<div class="muted small">沒有</div>') + '</div>';
  }
  function htmlCare(m, cl, deid) {
    var c = m.cares[cl] || m.cares['全部'], a = m.agg[cl] || m.agg['全部'];
    return '<section class="card priv" id="pxCare"><h3>需要關心（' + esc(cl === '全部' ? '三班' : cl) + '）</h3><div class="muted small">先看數字，名單點名字就開他的提案。預設用代號。</div>' +
      careBlock('careNone', '還沒開提案室', c.none, m, deid, '已綁定帳號、沒有任何開頁紀錄或提案。' + (a.unbound ? '另有 ' + a.unbound + ' 人沒綁定帳號，查不到。' : '')) +
      careBlock('careIdle', '開了沒寫', c.idle, m, deid, '開過超過 30 分鐘，方向和對準表都還是空的。', function (s) { return '（' + rel(m.now - m.byId[s].firstOpenAt) + '）'; }) +
      careBlock('careGap', '指不回訪談最多', c.gap, m, deid, '有寫「我決定什麼」卻沒選任何依據的列數，多的在前（已送審的不列）。選了但紀錄裡已找不到的，點進去才核對。', function (s) { return '（' + m.byId[s].gapRows.length + ' 列）'; }) +
      careBlock('careReal', '卡在現實題', c.stuckReal, m, deid, '方向、對準表都齊了，現實題還沒答完 3 題。', function (s) { return '（' + m.byId[s].realDone + '／3）'; }) +
      careBlock('careRev', '審核說還要補', c.revFix, m, deid, '最新一次審核（AI 建議）的結果。') + '</section>';
  }
  /* 每週送審（依份）：只列已經送審的人。燈號是規則式的 ✓做到／△做了一部分／○還沒，沒有分數；無痕、Claude 整合這類只是學生按鈕的自述，沒有驗證 */
  function htmlWeekly(m, cl, deid) {
    var list = m.weekly && (m.weekly[cl] || m.weekly['全部']); if (!list) return '';
    var rows = list.map(function (w) {
      var lt = w.lights.map(function (L) { var t = w.tally[L.k]; return esc(L.name) + '　✓ ' + t.ok + '　△ ' + t.part + '　○ ' + t.no; }).join('<br>');
      return '<tr><td><b>' + esc(w.name) + '</b><div class="muted small">' + esc(w.week) + '</div></td><td>' + w.sent + '</td><td>' + w.done + '</td><td>' + (w.done ? lt : '<span class="muted">還沒有審核結果</span>') + '</td></tr>';
    });
    var stuck = list.filter(function (w) { return w.stuck.length; }).map(function (w) {
      return '<div class="line"><b>' + esc(w.name) + '</b>　有燈沒亮（' + w.stuck.length + ' 人）：' + w.stuck.slice(0, 10).map(function (x) { return '<button class="chip pick" data-sel="' + esc(x.sid) + '" aria-label="看 ' + esc(who(m, x.sid, deid)) + ' 的提案">' + esc(who(m, x.sid, deid)) + '（' + esc(x.names.join('、')) + '）</button>'; }).join('') + (w.stuck.length > 10 ? '<span class="muted small">　…還有 ' + (w.stuck.length - 10) + ' 人</span>' : '') + '</div>';
    });
    return '<section class="card priv" id="pxWeekly"><h3>每週送審（依份，' + esc(cl === '全部' ? '三班' : cl) + '）</h3><div class="muted small">每一份是哪一份由審核結果自己寫的；舊的審核沒有寫就用送審日期和班級推出來。送審了還沒審好的算「送審」、不算「已有建議」。</div>' +
      table(['份', '送審', '已有建議', '每顆燈的人數'], rows) + (stuck.join('') || '<div class="muted small">目前沒有人有燈沒亮（或還沒有審核結果）。</div>') + '</section>';
  }
  function stageChip(s) { return tl(STAGE_TL[s.stage], STAGE_NAME[s.stage]); }
  function htmlStudents(m, ui) {
    var list = m.students.filter(function (s) { return (ui.cls === '全部' || s.cls === ui.cls) && (!ui.q || (ui.deid ? m.alias[s.sid] : s.sid + ' ' + s.name).toLowerCase().indexOf(String(ui.q).toLowerCase()) >= 0); });
    var rows = list.map(function (s) {
      return '<tr><td><button class="chip pick" data-sel="' + esc(s.sid) + '" aria-label="看 ' + esc(who(m, s.sid, ui.deid)) + ' 的提案">' + esc(who(m, s.sid, ui.deid)) + '</button></td><td>' + esc(s.cls) + '</td><td>' + stageChip(s) + '</td><td>' + esc(s.pick ? dirName(s.pick) : '—') + (s.dirChanges ? ' <span class="muted small">換過 ' + s.dirChanges + '</span>' : '') + '</td><td>' + s.rowsFilled + '</td><td>' + (s.gapRows.length ? '<b class="bad">' + s.gapRows.length + '</b>' : '0') + '</td><td>' + s.realDone + '／3</td><td>' + (s.subCount ? s.subCount + ' 次（' + fmtDT(s.lastSubT) + '）' : '—') + '</td><td>' + (s.revOk === null ? '—' : (s.revOk ? tl('ok', '對得起來') : tl('warn', '要補'))) + '</td><td>' + (s.exports || '—') + '</td><td>' + s.asks + '</td><td class="muted small">' + (s.lastAt ? fmtDT(s.lastAt) : '—') + '</td></tr>';
    });
    return '<section class="card priv" id="pxStudents"><h3>學生（' + esc(ui.cls === '全部' ? '三班' : ui.cls) + '，' + list.length + ' 人）</h3><div class="stool"><input type="search" id="pxQ" placeholder="找代號" aria-label="搜尋學生" value="' + esc(ui.q || '') + '"></div>' +
      (list.length ? table(['學生', '班級', '進度', '方向', '決定列', '指不回', '現實題', '送審', '審核', '匯出', '問助手', '最後動作'], rows) : '<div class="empty">沒有符合的學生。</div>') + '<div class="muted small">「問助手」是學生按助手的次數（提案室自己的計數）；「指不回」只算沒選依據的列。點名字看完整提案。</div></section>';
  }
  function htmlUsage(m) {
    var u = m.usage, c = u.coach, r = u.review;
    var cDays = c.days.slice(-7).reverse().map(function (d) { return '<tr><td>' + esc(d.day) + '</td><td>' + d.calls + '</td><td>' + d.users + '</td><td>US$' + d.usd.toFixed(4) + '</td></tr>'; });
    var rDays = r.days.slice(-7).reverse().map(function (d) { return '<tr><td>' + esc(d.day) + '</td><td>' + d.runs + '</td><td>' + d.n + '</td><td>US$' + d.usd.toFixed(4) + '</td></tr>'; });
    var kinds = Object.keys(c.byKind).sort().map(function (k) { return '<span class="chip">' + esc(k.replace(/^px_/, '') + ' ' + c.byKind[k]) + '</span>'; }).join('') || '<span class="muted small">還沒有</span>';
    return '<section class="card" id="pxUsage"><h3>用量（提案室專屬）</h3><div class="muted small">只算提案室自己的：助手＝prx 底下的名額與用量（和故事板助教分開）；審核＝審核用量裡「proposal」這一類（訪談、回應指引的審核不算）。</div>' +
      kp([[u.asksToday, '今天問助手（次）'], [u.asksAll, '累計問助手（次）'], [u.askUsers, '人用過助手'], [c.calls, '助手已回答（次）'], ['US$' + c.usd.toFixed(4), '助手累計花費'], ['US$' + r.usd.toFixed(4), '審核累計花費（' + r.n + ' 份）']], '用量關鍵數字') +
      '<div class="line"><b>助手每人每日上限</b>　' + u.perDay + ' 次（程式常數，和故事板助教分開算）　<b>被擋</b>　個人次數 ' + c.capHits.user + '・代填 ' + c.capHits.fill + '・費用 ' + c.capHits.usd + '</div><div class="line"><b>題型（已回答）</b>　' + kinds + '</div>' +
      '<div class="line muted small">每位學生的助手花費查不到（資料庫只記全班合計）。平均每次回答 ' + (u.usdPerAnswer === null ? '查不到' : 'US$' + u.usdPerAnswer.toFixed(5)) + '。審核最近一次 ' + (r.last ? fmtDT(r.last) : '還沒跑過') + '。</div>' +
      '<div class="two"><div><b>助手（近 7 天）</b>' + table(['日期', '回答次數', '人數', '花費'], cDays.length ? cDays : ['<tr><td colspan="4" class="muted">還沒有用量</td></tr>']) + '</div><div><b>審核（近 7 天）</b>' + table(['日期', '跑了幾次', '送模型份數', '花費'], rDays.length ? rDays : ['<tr><td colspan="4" class="muted">還沒跑過審核</td></tr>']) + '</div></div></section>';
  }
  function caseHref(k) { try { var q = String(location.search || '').replace(/^\?/, '').split('&').filter(function (x) { return x && x.indexOf('case=') !== 0; }); q.push('case=' + k); return '?' + q.join('&'); } catch (e) { return '?case=' + k; } }   /* 保留網址上其他參數（班級、測試用的 test／variant 等） */
  function htmlCase(m) {
    return '<div class="line" id="pxCase"><b>案例</b>　' + PX.CASES.map(function (c) { return c.k === m.caseId ? '<span class="chip">' + esc(c.name) + '（目前看的）</span>' : '<a class="chip" href="' + esc(caseHref(c.k)) + '">' + esc(c.name) + (c.live ? '' : '（預留・學生端還沒開）') + '</a>'; }).join('') + '<span class="muted small">提案按案例分開存；下面所有數字只算這個案例。助手名額是每人每天合計，不分案例。</span></div>';
  }
  function html(m, ui) {
    ui = Object.assign({ cls: '全部', q: '', deid: true }, ui || {});
    return htmlSummary(m) + htmlCase(m) + kpOf(m, ui.cls) + htmlCompare(m, ui.cls) + htmlDirs(m, ui.cls) + htmlCare(m, ui.cls, ui.deid) + htmlWeekly(m, ui.cls, ui.deid) + '<div id="pxDetail"></div>' + htmlStudents(m, ui) + htmlUsage(m);
  }

  /* 一位學生的完整提案。ver＝verifyRows 的結果（null＝還在讀或讀不到） */
  function detailHtml(m, sid, ver, ui, loadState) {
    var s = m.byId[sid]; if (!s) return '';
    var d = s.doc, deid = ui.deid !== false;
    function mask(t) { return deid ? String(t).replace(new RegExp(sid, 'ig'), m.alias[sid] || '學生') : String(t); }   /* 編號裡含學號（#4b2k0100-01）；學號只有英數與 - _，不需跳脫。去識別化時換成代號 */
    var head = '<div class="row"><h3 style="margin:0">' + esc(who(m, sid, deid)) + '　' + esc(s.cls) + '</h3>' + stageChip(s) + '<button class="sm ghost" data-close="1">關掉</button></div>';
    var dirP = '<h4>方向</h4><p><b>' + esc(s.pick ? (s.pick === 'mine' ? '我自己的方向：' + d.dir.mine : dirName(s.pick)) : '還沒選') + '</b>' + (d.dir.why ? '　為什麼：' + esc(d.dir.why) : '') + '</p>' +
      (s.dirHist.length ? '<details class="sg-more"><summary>方向歷程（' + s.dirHist.length + ' 筆存檔，換過 ' + s.dirChanges + ' 次）</summary><div>' + s.dirHist.slice().reverse().map(function (x) { return '<div class="hrow">' + esc(fmtDT(x.at)) + '　<b>' + esc(x.pick === 'mine' ? '我自己的方向：' + (x.mine || '') : dirName(x.pick) || x.pick) + '</b>　' + esc(String(x.why || '').slice(0, 60)) + '</div>'; }).join('') + '</div></details>' : '<div class="muted small">沒有方向歷程。</div>');
    function evLine(e) {
      var mark = e.state === 'ok' ? '<span class="tl ok">在紀錄裡</span>' : e.state === 'lost' ? '<span class="tl bad">紀錄裡找不到</span>' : '<span class="tl warn">查不到</span>';
      return '<div class="ev">' + mark + ' ' + (e.text ? esc(e.text) + '<div class="muted small">出處：' + esc(mask(e.src)) + '</div>' : '<span class="muted small">' + esc(mask(e.id)) + '（' + esc(mask(e.src)) + '）</span>') + '</div>';
    }
    var rowsHtml = d.rows.length ? d.rows.map(function (r) {
      var vr = ver ? ver.rows.filter(function (x) { return x.n === r.n; })[0] : null, ai = function (k) { return r.ai && r.ai[k] ? ' <span class="chip sm">🤖 助手示範</span>' : ''; };
      var evh = !r.ev.length ? '<div class="ev"><span class="tl bad">指不回訪談</span> 沒有選任何依據</div>' : (vr ? vr.ev.map(evLine).join('') : r.ev.map(function (id) { return '<div class="ev"><span class="tl info">' + (loadState === 'loading' ? '核對中…' : '未核對') + '</span> <span class="muted small">' + esc(mask(id)) + '</span></div>'; }).join(''));
      var cellH = r.cell ? (vr && vr.cell ? (vr.cell.state === 'ok' ? esc(vr.cell.text) : '<span class="tl ' + (vr.cell.state === 'lost' ? 'bad' : 'warn') + '">' + (vr.cell.state === 'lost' ? '他的故事板上沒有這格' : '查不到') + '</span> ' + esc(r.cell)) : esc(r.cell)) : '（沒選）';
      return '<div class="prow"><div><b>第 ' + r.n + ' 列　我決定：</b>' + esc(r.decide || '（空）') + ai('decide') + '</div>' + evh + '<div class="small">人物：' + esc(r.persona.pid ? PX.pname(r.persona.pid) : '（沒選）') + (r.persona.own ? '　特質：' + esc(r.persona.own) : '') + '　故事板格：' + cellH + '</div>' +
        '<div class="small">誰可能不同意：' + esc(r.dissent || '（空）') + ai('dissent') + '</div><div class="small">我的取捨：' + esc(r.tradeoff || '（空）') + ai('tradeoff') + '</div></div>';
    }).join('') : '<div class="muted">還沒有任何一列。</div>';
    var ck = ver ? '<div class="muted small">依據核對：' + ver.ok + ' 則在紀錄裡、' + ver.lost + ' 則找不到、' + ver.unknown + ' 則查不到。</div>' : '<div class="muted small">' + (loadState === 'loading' ? '正在讀他引用的房間來核對依據…' : loadState === 'fail' ? '讀不到他的房間資料，依據沒核對（查不到）。' : '這位學生沒有引用任何房間。') + '</div>';
    var real = '<h4>現實題（' + s.realDone + '／3）</h4>' + PX.REAL_KEYS.map(function (k) { var x = d.real[k]; return '<div class="small"><b>' + esc(PX.REAL_Q[k].title) + '</b>　' + (x.unknown ? '我不知道，但會去問：' + esc(x.askWho) + (x.text ? '；' + esc(x.text) : '') : esc(x.text || '（還沒答）')) + '</div>'; }).join('');
    var subs = '<h4>送審與匯出</h4><div class="small">送審 ' + s.subCount + ' 次' + (s.subDays.length ? '（' + s.subDays.map(function (x) { return esc(x); }).join('、') + '；一天只能一份）' : '') + '　匯出 ' + s.exports + ' 次' + (s.exportKinds.length ? '（' + esc(s.exportKinds.join('、')) + '）' : '') + '</div>';
    var rev = '<h4>AI 審核建議（不是分數）</h4>' + (s.lastRev ? '<div class="revc"><b>' + esc(s.lastRevDay) + '</b> ' + (s.lastRev.ok ? tl('ok', '對得起來') : tl('warn', '還有地方要補')) + (arr(s.lastRev.align).length ? '<ul>' + arr(s.lastRev.align).map(function (p) { return '<li>' + esc(p.msg) + '</li>'; }).join('') + '</ul>' : '') + (s.lastRev.fb ? '<p>' + esc(s.lastRev.fb) + '</p>' : '') +
      (arr(s.lastRev.rows).length ? '<ul>' + arr(s.lastRev.rows).map(function (x) { return '<li>第 ' + esc(x.n) + ' 列（' + esc({ yes: '依據支持', part: '部分支持', no: '依據不支持' }[x.fit] || x.fit || '') + '）：' + esc(x.note) + '</li>'; }).join('') + '</ul>' : '') + '<div class="muted small">這是 AI 給學生的建議，不是成績；沒有任何分數欄位。共 ' + s.revDays.length + ' 次審核。</div></div>' : '<div class="muted small">還沒有審核結果（要先送審，審核由夜間排程跑）。</div>');
    var coach = '<h4>助手使用</h4><div class="small">問了 ' + s.asks + ' 次（今天 ' + s.askToday + '／' + PX.COACH_PER_DAY + '），已回答 ' + s.answered + ' 次；' + s.aiRows + ' 列有助手代填，有字的欄位裡 ' + Math.round(s.aiShare * 100) + '% 還是助手示範。</div>';
    var evs = '<h4>事件（只記種類）</h4><div class="small">' + EVENT_KINDS.map(function (k) { return esc(KIND_ZH[k]) + ' ' + s.evCount[k]; }).join('・') + '　最後動作 ' + esc(fmtDT(s.lastAt)) + '</div>';
    return '<section class="card priv detail" id="pxDetailCard" tabindex="-1" aria-label="一位學生的提案">' + head + dirP + '<h4>對準表（' + s.rowsFilled + ' 列有寫決定）</h4>' + ck + rowsHtml + real + subs + rev + coach + evs + '</section>';
  }

  /* ———— 唯讀讀取：進頁 8 個路徑；點開某位學生才讀他引用的房間 ———— */
  function readPaths(sess) { return ['er/' + sess + '/profiles', 'prx/' + sess + '/doc', 'prx/' + sess + '/dirh', 'prx/' + sess + '/sub', 'prx/' + sess + '/rev', 'prx/' + sess + '/ev', 'prx/' + sess + '/usage', 'prx/' + sess + '/coachq', 'er/_daemon/admin/reviewUsage']; }
  function liveLoader(db, sess, now, caseId) {
    function rd(path, label, errs) { return db.ref(path).once('value').then(function (s) { return s.val(); }, function () { errs.push(label); return null; }); }
    return {
      load: function () {
        var errs = [], P = readPaths(sess);
        return Promise.all([rd(P[0], '名冊', errs), rd(P[1], '提案', errs), rd(P[2], '方向歷程', errs), rd(P[3], '送審', errs), rd(P[4], '審核結果', errs), rd(P[5], '事件', errs), rd(P[6], '助手用量', errs), rd(P[7], '助手名額', errs), rd(P[8], '審核用量', errs)]).then(function (a) {
          return { now: (now ? now() : Date.now()), sess: sess, 'case': PX.caseOf(caseId), profiles: a[0], docs: a[1], dirh: a[2], subs: a[3], revs: a[4], evs: a[5], usage: a[6], coachq: a[7], reviewUsage: a[8], errors: errs };
        });
      },
      /* 點開某位學生：只讀他引用的房間裡跟他有關的小節點（不整包讀房間，聊天與回合不讀） */
      record: function (sid, codes) {
        var errs = [], sceneOk = true;
        function g(path) { return db.ref(path).once('value').then(function (s) { return s.val(); }, function () { errs.push(path); return undefined; }); }
        return Promise.all(codes.map(function (code) {
          var b = 'er/' + sess + '/rooms/' + code;
          return Promise.all([g(b + '/case'), g(b + '/players/' + sid), g(b + '/mcards'), g(b + '/members/' + sid), g('er/' + sess + '/scenes/' + code), g('sbx/' + sess + '/sb/' + code + '/u_' + sid)]).then(function (r) {
            if (r[4] === undefined) sceneOk = false;
            if (r[3] == null && r[1] == null) return null;
            var pl = {}; pl[sid] = r[1] || {}; return { room: PX.roomInput({ code: code, case: r[0], players: pl, mcards: r[2] }, r[4] || [], sid), board: { code: code, cells: r[5] ? SB.normBoard(r[5]).cells : [] } };
          });
        })).then(function (list) { list = list.filter(Boolean); return { rooms: list.map(function (x) { return x.room; }), boards: list.map(function (x) { return x.board; }), sceneOk: sceneOk, failed: errs.length > 0 && !list.length }; });
      }
    };
  }

  var CSS = '.sum{border:2px solid var(--ink);border-radius:12px;padding:8px 12px;margin:8px 0;color:var(--ink)}.sum.ok{background:var(--okbg);border-color:var(--ok)}.sum.warn{background:var(--warnbg);border-color:var(--warn)}.sum.bad{background:var(--badbg);border-color:var(--bad)}' +
    '.sum-h{display:flex;align-items:center;gap:8px;font-size:1.05em}.sum .dot{width:14px;height:14px;border-radius:50%;border:2px solid var(--ink);background:var(--panel)}.sum.ok .dot{background:var(--ok)}.sum.warn .dot{background:var(--warn)}.sum.bad .dot{background:var(--bad)}.sum ul{margin:6px 0 0;padding-left:22px}.sum li.bad{font-weight:900}' +
    '.card h3{margin:0 0 6px;font-size:1.05em}.card h4{margin:12px 0 4px;font-size:.98em}.line{margin:8px 0}.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0 10px;margin:2px 4px 2px 0;background:var(--panel2);font-size:.85em;color:var(--ink)}.chip.sm{font-size:.75em;padding:0 6px}button.chip.pick{cursor:pointer;min-height:32px;font-weight:600}button.chip.pick:hover{background:var(--yellow);color:var(--onyellow)}' +
    '.fr{display:grid;grid-template-columns:minmax(110px,170px) 1fr minmax(96px,140px);gap:8px;align-items:center;margin:4px 0}.fl{font-size:.88em}.fb{height:16px;background:var(--panel2);border:1px solid var(--ink);border-radius:8px;overflow:hidden}.fb i{display:block;height:100%}.fn{font-size:.8em;text-align:right}' +
    '.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}td.cur,th.cur{background:var(--infobg)}.care{border-top:1px dashed var(--line);padding:6px 0}.care .big2{font-size:1.6em;font-weight:900;font-variant-numeric:tabular-nums}.bad{color:var(--bad)}' +
    '.prow{border:2px solid var(--ink);border-radius:10px;padding:6px 10px;margin:6px 0;background:var(--panel)}.ev{margin:3px 0;padding-left:8px;border-left:3px solid var(--line);overflow-wrap:anywhere}.revc{border:2px dashed var(--ink);border-radius:10px;padding:6px 10px;margin:6px 0}.hrow{margin:3px 0;font-size:.9em}' +
    '.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:8px}.empty{padding:12px;color:var(--muted);text-align:center}.detail{border-width:3px}' +
    '#pxCase a.chip{display:inline-flex;align-items:center;min-height:36px;text-decoration:none}@media (max-width:760px){#pxCase a.chip{min-height:44px}}' +
    '@media (max-width:560px){.card{padding:10px 10px}.fr{grid-template-columns:1fr;gap:2px;margin:8px 0}.fn{text-align:left}}';

  function mount(el, opts) {
    opts = opts || {}; var ui = { cls: opts.cls || '全部', q: '', deid: opts.deid !== false, sel: '' }, model = null, timer = null, inflight = false, ver = null, loadState = '', verFor = '';
    function draw() {
      var keep = el.querySelector('#pxQ') === document.activeElement, pos = keep ? el.querySelector('#pxQ').selectionStart : 0;
      el.innerHTML = '<style>' + CSS + '</style><div class="pxd">' + (model ? html(model, ui) : '<div class="empty">讀取中…</div>') + '</div>';
      drawDetail();
      if (keep) { var q = el.querySelector('#pxQ'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
      if (opts.onDraw) opts.onDraw(model, ui);
    }
    function drawDetail() { var box = el.querySelector('#pxDetail'); if (box && model && ui.sel) box.innerHTML = detailHtml(model, ui.sel, verFor === ui.sel ? ver : null, ui, loadState); }
    function openStudent(sid) {
      ui.sel = sid; ver = null; verFor = ''; loadState = ''; var s = model && model.byId[sid]; if (!s) return;
      var codes = roomCodesOf(s.doc);
      if (codes.length && opts.loader.record) { loadState = 'loading'; drawDetail(); Promise.resolve(opts.loader.record(sid, codes)).then(function (rec) { if (ui.sel !== sid) return; if (rec.failed) { loadState = 'fail'; ver = null; } else { ver = verifyRows(s.doc, rec.rooms, rec.boards, rec.sceneOk, model.caseId); verFor = sid; loadState = 'done'; } drawDetail(); }, function () { if (ui.sel === sid) { loadState = 'fail'; drawDetail(); } }); }
      else drawDetail();
      var c = el.querySelector('#pxDetailCard'); if (c) { try { c.scrollIntoView({ block: 'start' }); c.focus({ preventScroll: true }); } catch (e) {} }
    }
    function reload() {
      if (inflight) return Promise.resolve(); inflight = true; if (opts.onLoading) opts.onLoading(true);
      return Promise.resolve(opts.loader.load()).then(function (raw) { model = build(raw); draw(); if (ui.sel) openStudent(ui.sel); }, function (e) { el.innerHTML = '<div class="pxd"><div class="card">讀取失敗：' + esc((e && e.message) || e) + '</div></div>'; }).then(function () { inflight = false; if (opts.onLoading) opts.onLoading(false); });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
      if (b.dataset.sel) openStudent(b.dataset.sel);
      else if (b.dataset.close) { ui.sel = ''; var box = el.querySelector('#pxDetail'); if (box) box.innerHTML = ''; }
    });
    el.addEventListener('input', function (e) { if (e.target && e.target.id === 'pxQ') { ui.q = e.target.value; var st = el.querySelector('#pxStudents'); if (st && model) { st.outerHTML = htmlStudents(model, ui); var q = el.querySelector('#pxQ'); if (q) { q.focus(); try { q.setSelectionRange(ui.q.length, ui.q.length); } catch (x) {} } } } });
    var p = reload(); if (opts.autoMs) timer = setInterval(function () { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') reload(); }, opts.autoMs);
    return { reload: reload, stop: function () { clearInterval(timer); }, ready: p, ui: ui, model: function () { return model; }, draw: draw, open: openStudent,
      setCls: function (c) { ui.cls = c || '全部'; draw(); }, setDeid: function (v) { ui.deid = !!v; draw(); } };
  }

  return { DEFAULT_SESS: DEFAULT_SESS, CLASSES: CLASSES, STAGE_NAME: STAGE_NAME, KIND_ZH: KIND_ZH, build: build, html: html, detailHtml: detailHtml, verifyRows: verifyRows, roomCodesOf: roomCodesOf, dirChanges: dirChanges, hasScoreField: hasScoreField, isTestSid: isTestSid,
    readPaths: readPaths, liveLoader: liveLoader, mount: mount, CSS: CSS, fmtDT: fmtDT, rel: rel };
});
