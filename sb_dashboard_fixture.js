/* 故事板儀表板的假資料（只給測試與 ?test=1 用；沒有任何真實學生資料）。
   make({ now, variant })：variant＝'ok'（一切正常）或 'bad'（心跳停、保護模式停止上傳、助教與上傳觸頂）。
   每位學生的「類型」固定（依序輪流），測試可以直接對照：raw.__arch[學號] 就是類型編號。
   類型 0 完成者／1 全代填／2 開了沒寫／3 照抄草稿／4 缺出處／5 訪談了沒開板／6 沒有訪談／7 進行中／8 6 格沒有圖／9 6 格有圖沒標關鍵時刻 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'));
  else root.ERG_SBDASH_FIXTURE = factory(root.ERG_SB);
})(typeof self !== 'undefined' ? self : this, function (SB) {
  'use strict';
  var ARCH = ['完成者', '全代填', '開了沒寫', '照抄草稿', '缺出處', '訪談了沒開板', '沒有訪談', '進行中', '6 格沒有圖', '6 格有圖沒標關鍵時刻'];
  var CASES = SB.CASE_ORDER, CLS = ['二甲', '二乙', '二丙'], COUNTS = [14, 12, 12];
  var SURNAME = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾彭游詹胡施';
  var GIVEN = ['小宇', '雅婷', '志豪', '怡君', '家瑋', '佩珊', '冠廷', '詩涵', '宗翰', '欣妤', '柏翰', '品妍', '承恩', '思妤', '彥廷', '宜庭', '俊傑', '子萱', '哲維', '郁婷'];
  var QUESTIONS = ['Nielsen 十項準則是哪十項？', '嚴重性評分怎麼打？', '訪談的時候怎麼追問比較好', '人物誌要寫幾位', '這格的出處要放哪個編號', '作業什麼時候截止', '主角設定圖的指令怎麼改', '關鍵時刻要寫什麼', '怎麼在 Gemini 放進故事板', 'Figma 之後要用嗎', '房間代碼怎麼加入', '六格都要有圖嗎'];

  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function pad(n, w) { return ('0000' + n).slice(-w); }
  function svgThumb(color, label) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect width="240" height="160" fill="' + color + '"/><circle cx="120" cy="64" r="26" fill="#fff" fill-opacity=".85"/><rect x="70" y="100" width="100" height="30" rx="8" fill="#fff" fill-opacity=".85"/><text x="120" y="150" font-size="14" text-anchor="middle" fill="#1e1e1e">' + label + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  }

  function make(opts) {
    opts = opts || {}; var now = opts.now || Date.UTC(2026, 9, 27, 3, 0, 0), bad = opts.variant === 'bad', R = rng(20261026), H = 3600 * 1000, M = 60 * 1000;
    var sess = 'ER-20261013', raw = { now: now, sess: sess, profiles: {}, rooms: {}, sb: {}, sbm: {}, sbach: {}, sbq: {}, errors: [], __arch: {}, __cls: {} }, students = [], idx = 0;
    CLS.forEach(function (c, ci) { for (var i = 0; i < COUNTS[ci]; i += 1) { var sid = '4b' + (ci + 2) + 'k' + pad(100 + idx * 7, 4), nm = SURNAME.charAt(idx % SURNAME.length) + GIVEN[idx % GIVEN.length]; students.push({ sid: sid, name: nm, cls: c, arch: idx % 10, ci: ci }); raw.profiles[sid] = { name: nm, cls: c, progress: (idx % 10 === 0 || idx % 10 === 9) ? { ask: 3, ctx: 2 } : { ask: 1 + (idx % 3), ctx: 1 + ((idx + 1) % 3) } }; raw.__arch[sid] = idx % 10; raw.__cls[sid] = c; idx += 1; } });
    /* 老師與測試帳號：名冊裡有，但不應計入 */
    raw.profiles['99'] = { name: '老師帳號', cls: '二甲' }; raw.profiles['test01'] = { name: '暫用帳號', cls: '二乙' };

    var texts = { what: ['他在櫃台前拿到一張單子，上面有很多縮寫', '他一手抱著孩子，一手翻口袋找手機', '螢幕上的號碼跳過去了，他沒有發現', '他按了兩次確認，機器沒有反應', '護理師說明後，他點頭但沒有問', '家人問他剛剛醫生說什麼，他答不出來'], think: ['「我是不是漏掉什麼？」', '「這個字到底是什麼意思？」', '「大家都在看我，我不敢再問。」', '「算了，回家再查。」', '「為什麼不能一次講清楚。」', '「我記得有講，可是想不起來。」'] };
    function persona(i) { return ['patient', 'family', 'nurse_yu', 'doctor', 'clerk', 'volunteer'][i % 6]; }
    function interviewsFor(s, n) { var out = []; for (var i = 0; i < n; i += 1) out.push({ id: '#' + s.sid + '-' + pad(i + 1, 2), personaId: persona(i + s.ci), items: { surface: { done: true, note: texts.what[i % 6], tags: [] }, events: { done: true, note: texts.think[i % 6], tags: [] }, need: { done: i % 2 === 0, note: i % 2 === 0 ? '想要一句話就看懂' : '', tags: [] } } }); return out; }
    function mkCell(s, caseId, n, kind, extra) {
      var tpl = SB.template(caseId)[n - 1] || { title: '第 ' + n + ' 格', where: '現場' }, ts = now - (30 + Math.floor(R() * 200)) * M, ref = '#' + s.sid + '-' + pad(1 + (n % 3), 2);
      var c = { n: n, title: tpl.title, who: '病人', where: tpl.where, what: texts.what[(n + s.arch) % 6], think: texts.think[(n + s.ci) % 6], by: s.sid, refs: [ref], createdAt: ts - 5 * M, updatedAt: ts, fit: 'contain', cl: 0, moment: false };
      c.img = { ar: 1.5, w: 960, h: 640, ts: ts };
      if (kind === 'ai') { c.aiText = { who: c.who, where: c.where, what: c.what, think: c.think }; c.er = { r: 0, band: 'ai' }; c.cl = 4; c.draft = null; }
      else if (kind === 'copy') { c.draft = { who: c.who, where: c.where, what: c.what, think: c.think }; c.er = { r: 0.08, band: 'copy' }; }
      else if (kind === 'rewrite') { c.er = { r: 0.45, band: 'rewrite' }; c.cl = 3; c.refs = [ref]; }
      else { c.er = { r: 0.9, band: 'own' }; c.cl = (n % 3 === 0) ? 2 : 0; }
      if (extra) Object.keys(extra).forEach(function (k) { if (extra[k] === undefined) delete c[k]; else c[k] = extra[k]; });
      return c;
    }
    function boardOf(cells) { var o = { cells: {} }; cells.forEach(function (c) { o.cells['s' + c.n] = c; }); return o; }

    var groups = {}; students.forEach(function (s) { (groups[s.cls] = groups[s.cls] || []).push(s); });
    var codeN = 0, roomCodes = [];
    CLS.forEach(function (c) {
      for (var g = 0; g < groups[c].length; g += 4) {
        var mem = groups[c].slice(g, g + 4), code = 'Q' + String.fromCharCode(65 + codeN) + pad(10 + codeN, 2); codeN += 1;
        var caseId = CASES[codeN % CASES.length], room = { code: code, case: caseId, cls: c, host: mem[0].sid, createdAt: now - 26 * H, members: {}, players: {} };
        roomCodes.push(code);
        mem.forEach(function (s) {
          room.members[s.sid] = { joinedAt: room.createdAt };
          var nInt = [4, 2, 3, 2, 3, 3, 0, 2, 4, 5][s.arch];
          var pl = { interviews: interviewsFor(s, nInt), conclusions: [] };
          if (s.arch === 0 || s.arch === 9) pl.conclusions = [{ text: '病人讀不下簡訊是因為第一句就出現專有名詞，需要改成一句白話，並且把下一步放在前面', refs: ['#' + s.sid + '-01'], tradeoff: '簡短會少一些資訊' }, { text: '家屬想知道的是下一步該做什麼，不是診斷名稱，所以簡訊應該把要做的行動放在最前面，再補充原因', refs: ['#' + s.sid + '-02'], tradeoff: '診斷放後面可能讓人不安' }];
          room.players[s.sid] = pl;
        });
        raw.rooms[code] = room;
        var boards = {}, wallCells = [];
        mem.forEach(function (s) {
          var cells = [], a = s.arch, k;
          if (a === 0) for (k = 1; k <= 6; k += 1) cells.push(mkCell(s, caseId, k, 'own', k === 6 ? { moment: true, pain: undefined } : {}));
          else if (a === 1) for (k = 1; k <= 3; k += 1) cells.push(mkCell(s, caseId, k, 'ai'));
          else if (a === 3) for (k = 1; k <= 4; k += 1) cells.push(mkCell(s, caseId, k, 'copy', { img: undefined }));
          else if (a === 4) for (k = 1; k <= 5; k += 1) cells.push(mkCell(s, caseId, k, 'own', k <= 2 ? { refs: [] } : {}));
          else if (a === 7) for (k = 1; k <= 3; k += 1) cells.push(mkCell(s, caseId, k, k === 2 ? 'rewrite' : 'own', k === 3 ? { img: undefined } : {}));
          else if (a === 8) for (k = 1; k <= 6; k += 1) cells.push(mkCell(s, caseId, k, 'own', { img: undefined, moment: k === 6 }));
          else if (a === 9) for (k = 1; k <= 6; k += 1) cells.push(mkCell(s, caseId, k, 'own'));
          if (cells.length) boards['u_' + s.sid] = boardOf(cells);
          if (a === 0 && wallCells.length < 4) { wallCells.push(mkCell(s, caseId, wallCells.length + 1, 'own')); }
          if (a === 7 && wallCells.length < 6) { wallCells.push(mkCell(s, caseId, wallCells.length + 1, 'own', { img: undefined })); }
          if (a !== 5 && a !== 6) raw.sbm[code] = Object.assign(raw.sbm[code] || {}, (function () { var o = {}; o[s.sid] = { firstOpenAt: a === 2 ? now - 2 * H : now - (1 + Math.floor(R() * 5)) * H, personaCount: 2 }; return o; })());
        });
        if (wallCells.length) boards.wall = boardOf(wallCells);
        if (Object.keys(boards).length) raw.sb[code] = boards;
      }
    });
    students.forEach(function (s) { if (s.arch === 0) raw.sbach[s.sid] = { ids: 'together,relay,premiere,allsourced,nofill,askthenwrite', n: 6, t: now - H }; else if (s.arch === 7) raw.sbach[s.sid] = { ids: 'relay', n: 1, t: now - H }; else if (s.arch === 9) raw.sbach[s.sid] = { ids: 'nofill,fill', n: 2, t: now - H }; });

    raw.usage = { downloadGB: bad ? 8.7 : 3.31, storageGB: 0.0143, peakConn: bad ? 96 : 51, updatedAt: bad ? now - 5 * H : now - 20 * M };
    raw.config = { coachPerDay: 30, fillPerBoard: 2, rewriteThreshold: 0.6, uploadPerUserDay: 20, uploadSiteDay: 600, coachDayUsd: 1 };
    raw.worker = { heartbeat: bad ? now - 45 * M : now - 12 * 1000, pid: 4242, mode: 'daemon', version: 'fixture' };
    var day = SB.dayKey(now), days = {}, i;
    for (i = 0; i < 8; i += 1) { var d = SB.dayKey(now - i * 24 * H), calls = i === 0 ? (bad ? 140 : 64) : 20 + Math.floor(R() * 90); days[d] = { calls: calls, nusd: Math.round(calls * 1.9e6), fills: Math.floor(calls / 12), users: {}, byKind: { hint: Math.floor(calls * 0.35), check: Math.floor(calls * 0.2), pattern: Math.floor(calls * 0.1), next: Math.floor(calls * 0.1), course: Math.floor(calls * 0.15), fill: Math.floor(calls / 12) } }; }
    var today = days[day]; students.slice(0, 14).forEach(function (s, j) { today.users[s.sid] = bad && j === 0 ? 30 : 1 + (j * 3) % 9; });
    today.cq = {}; QUESTIONS.forEach(function (q, j) { var s = students[(j * 3) % students.length]; today.cq[String(1000000000000 + j)] = { sid: s.sid, ask: q }; });
    today.cq['1000000000099'] = { sid: students[4].sid, ask: '<img src=x onerror=alert(1)> 這是惡意字串測試' };
    if (bad) { today.nusd = 0.85e9; today.capHits = { user: 3, fill: 2, usd: 1 }; }
    raw.coachUsage = days;
    var site = bad ? 590 : 212, u = {}; students.slice(0, 20).forEach(function (s, j) { u[s.sid] = bad && j === 0 ? 20 : 1 + (j % 8); });
    raw.sbq[day] = { total: site, u: u };
    return raw;
  }

  function thumbsFor(raw, code) {
    var out = {}, cc = { sms: '#3d6fe0', wait: '#f08300', way: '#6aa81a', forms: '#8250e0', pay: '#e0457b', peds: '#14a08c' }[(raw.rooms[code] || {}).case] || '#8896a0';
    Object.keys(raw.sb[code] || {}).forEach(function (bk) { out[bk] = {}; Object.keys(raw.sb[code][bk].cells || {}).forEach(function (slot) { var c = raw.sb[code][bk].cells[slot]; if (c.img) out[bk][slot] = svgThumb(cc, String(c.n)); }); });
    return out;
  }
  /* 真正的 sbth 節點長這樣：{ 板: { s1: { d: 'data:image/...' } } } */
  function wrapD(t) { var o = {}; Object.keys(t).forEach(function (bk) { o[bk] = {}; Object.keys(t[bk]).forEach(function (slot) { o[bk][slot] = { d: t[bk][slot] }; }); }); return o; }
  /* 假資料庫：只實作 ref(path).once('value')，並記下被讀的路徑（測試用來證明只讀、而且沒有多讀） */
  function fakeDb(raw) {
    var map = { 'er/ER-20261013/profiles': raw.profiles, 'er/ER-20261013/rooms': raw.rooms, 'sbx/ER-20261013/sb': raw.sb, 'sbx/ER-20261013/sbm': raw.sbm, 'sbx/ER-20261013/sbach': raw.sbach, 'sbx/ER-20261013/sbq': raw.sbq, sbops: { usage: raw.usage, config: raw.config, coachUsage: raw.coachUsage, coachWorker: raw.worker } };
    var reads = [];
    return { reads: reads, ref: function (path) {
      return { once: function (ev) { reads.push(path); var m = /^sbx\/ER-20261013\/sbth\/(.+)$/.exec(path), v = m ? wrapD(thumbsFor(raw, m[1])) : map[path]; (raw.__deny || []).forEach(function (d) { if (path === d) v = Symbol.for('deny'); }); if (v === Symbol.for('deny')) return Promise.reject(new Error('PERMISSION_DENIED')); var j = v === undefined ? null : JSON.parse(JSON.stringify(v)); return Promise.resolve({ val: function () { return j; } }); } };
    } };
  }
  return { make: make, thumbsFor: thumbsFor, fakeDb: fakeDb, ARCH: ARCH };
});
