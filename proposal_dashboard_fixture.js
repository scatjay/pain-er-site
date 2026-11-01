/* 提案室老師儀表板的假資料（只給測試與 ?test=1 用；沒有任何真實學生資料）。
   make({ now, variant })：variant＝'ok'（資料都正常）或 'bad'（塞進幾筆壞資料：審核有分數、送審日期鍵錯、方向值亂寫、助手超過每日上限、事件含內容、某個節點讀不到）。
   每位學生的「類型」依序輪流，raw.__arch[學號] 就是類型編號，測試可以逐個對照。
   資料形狀（11-01 起）：doc／dirh／sub／rev 是 {學號:{案例:內容}}，事件帶 c；一位類型 0 的學生另有 bike 案例的一份提案（raw.__bikeSid）。
   類型 0 完成且審核通過／1 完成但審核要補／2 開了沒寫／3 沒開（只在名冊）／4 只選了方向／5 兩列指不回訪談／6 卡在現實題／7 換過方向／8 選的依據紀錄裡找不到／9 助手今天問滿 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./proposal_core.js'));
  else root.ERG_PXDASH_FIXTURE = factory(root.ERG_PX);
})(typeof self !== 'undefined' ? self : this, function (PX) {
  'use strict';
  var ARCH = ['完成且審核通過', '完成但審核要補', '開了沒寫', '沒開', '只選了方向', '兩列指不回訪談', '卡在現實題', '換過方向', '依據在紀錄裡找不到', '助手今天問滿'];
  var CLS = ['二甲', '二乙', '二丙'], COUNTS = [11, 10, 12], M = 60 * 1000, H = 3600 * 1000;
  var SURNAME = '陳林黃張李王吳劉蔡楊許鄭謝郭洪', GIVEN = ['小宇', '雅婷', '志豪', '怡君', '家瑋', '佩珊', '冠廷', '詩涵', '宗翰', '欣妤', '柏翰', '品妍'];
  function pad(n, w) { return ('0000' + n).slice(-w); }

  function make(opts) {
    opts = opts || {}; var now = opts.now || Date.UTC(2026, 10, 10, 1, 0, 0), bad = opts.variant === 'bad', sess = 'ER-20261013', today = PX.dayKey(now), yday = PX.dayKey(now - 24 * H);
    var T = { er: {}, prx: {}, sbx: {} }; T.er[sess] = { profiles: {}, rooms: {}, scenes: {} }; T.er._daemon = { admin: { reviewUsage: {} } };
    var P = T.prx[sess] = { doc: {}, dirh: {}, sub: {}, rev: {}, ev: {}, usage: {}, coachq: {} }; T.sbx[sess] = { sb: {} };
    var raw = { now: now, sess: sess, __arch: {}, __cls: {}, __room: {}, __tree: T }, idx = 0, evSeq = 0;
    function evAdd(sid, k, t, d) { evSeq += 1; (P.ev[sid] = P.ev[sid] || {})[t + '_' + evSeq] = { t: t, k: k, d: d || '' }; }
    function dirh(sid, list) { P.dirh[sid] = {}; list.forEach(function (x, i) { var at = now - (list.length - i) * 20 * M; P.dirh[sid][at] = { pick: x[0], mine: x[1] || '', why: x[2] || '我訪談的家屬說連結點不開', at: at }; }); }
    CLS.forEach(function (c, ci) {
      for (var i = 0; i < COUNTS[ci]; i += 1) {
        var sid = '4b' + (ci + 2) + 'k' + pad(100 + idx * 7, 4), a = idx % ARCH.length, code = 'A' + pad(idx + 1, 3), nm = SURNAME.charAt(idx % SURNAME.length) + GIVEN[idx % GIVEN.length], t0 = now - 50 * M + idx * 1000;
        raw.__arch[sid] = a; raw.__cls[sid] = c; raw.__room[sid] = code; idx += 1;
        T.er[sess].profiles[sid] = { name: nm, cls: c };
        /* 每個人一間房：一張訪談卡（三欄都有內容）、一條結論；故事板兩格 */
        var iv = { id: '#' + sid + '-01', type: '訪談檢核', author: sid, round: 1, personaId: 'patient', items: { surface: { done: true, note: '我沒收到簡訊' }, events: { done: true, note: '護理師說有寄但手機裡找不到' }, need: { done: true, note: '想知道回家後要注意什麼' } } };
        var pl = {}; pl[sid] = { interviews: [iv], conclusions: [{ text: '簡訊改成網頁較好', tradeoff: '要多維護一頁' }] };
        var mem = {}; mem[sid] = { joinedAt: 1 };
        T.er[sess].rooms[code] = { code: code, case: 'sms', members: mem, players: pl, mcards: [] }; T.er[sess].scenes[code] = [];
        T.sbx[sess].sb[code] = {}; T.sbx[sess].sb[code]['u_' + sid] = { cells: { s1: { n: 1, title: '收到連結', what: '她翻遍手機找不到' }, s2: { n: 2, title: '點開讀不下去', think: '太麻煩', moment: true } } };
        var E1 = 'iv:' + code + ':' + iv.id + '·need', E2 = 'iv:' + code + ':' + iv.id + '·events', C1 = code + ':s1', C2 = code + ':s2';
        var row = function (n, decide, ev, cell) { return { n: n, decide: decide, ev: ev, persona: { pid: 'patient', own: '' }, cell: cell, dissent: '櫃台人員', tradeoff: '多維護一頁', t: t0 }; };
        var realAll = function () { return { who: { text: '資訊室每週更新', unknown: false, askWho: '' }, cost: { text: '約一人月，不用另外買系統', unknown: false, askWho: '' }, blame: { text: '', unknown: true, askWho: '法務室' } }; };
        var fullDoc = function () { return { dir: { pick: 'web', mine: '', why: '我訪談的家屬說連結點不開', at: t0 }, rows: { r1: row(1, '連結改成短網址', [E1], C1), r2: row(2, '頁面第一屏只放注意事項', [E2], C2), r3: row(3, '加一個回電話的按鈕', [E1, E2], C1) }, real: realAll(), updatedAt: t0 + 10 * M }; };
        if (a === 0 || a === 1) {
          P.doc[sid] = fullDoc(); dirh(sid, [['web']]); var tS = now - 30 * M; P.sub[sid] = {}; P.sub[sid][today] = { t: tS, doc: P.doc[sid] };
          P.rev[sid] = {}; P.rev[sid][today] = { ok: a === 0, align: a === 0 ? [] : [{ code: 'row-dissent', row: 2, msg: '第 2 列還沒寫「誰可能不同意」。' }], fb: a === 0 ? '依據很實在。誰可能不同意可以再具體一點。' : '有兩列的依據和決定對不太起來。', rows: [{ n: 1, fit: 'yes', note: '依據支持決定' }], changed: true, at: now - 10 * M, advisory: true };
          evAdd(sid, 'open', t0, 'pc'); evAdd(sid, 'ev_pick', t0 + M, 'r1:iv'); evAdd(sid, 'submit', tS, today); if (a === 0) { evAdd(sid, 'export', tS + M, 'pdf'); evAdd(sid, 'export', tS + 2 * M, 'html'); }
          if (a === 1) { P.sub[sid][yday] = { t: now - 24 * H - 3 * H, doc: P.doc[sid] }; }
        } else if (a === 2) { evAdd(sid, 'open', now - 40 * M, 'pc');
        } else if (a === 3) { /* 只在名冊 */
        } else if (a === 4) { P.doc[sid] = { dir: { pick: 'line', mine: '', why: '病人都有 LINE', at: t0 }, updatedAt: t0 }; dirh(sid, [['line']]); evAdd(sid, 'open', t0, 'm'); evAdd(sid, 'dir', t0 + M, 'line');
        } else if (a === 5) { var d5 = fullDoc(); d5.dir.pick = 'app'; d5.rows.r2 = row(2, '頁面第一屏只放注意事項', [], C2); d5.rows.r3 = row(3, '加一個回電話的按鈕', [], C1); P.doc[sid] = d5; dirh(sid, [['app']]); evAdd(sid, 'open', t0, 'pc');
        } else if (a === 6) { var d6 = fullDoc(); d6.real = { who: { text: '資訊室每週更新', unknown: false, askWho: '' }, cost: { text: '', unknown: false, askWho: '' }, blame: { text: '', unknown: false, askWho: '' } }; P.doc[sid] = d6; dirh(sid, [['web']]); evAdd(sid, 'open', t0, 'pc');
        } else if (a === 7) { P.doc[sid] = fullDoc(); P.doc[sid].dir = { pick: 'mine', mine: '簡訊加一個語音版', why: '長輩不看字', at: now - 5 * M }; dirh(sid, [['web'], ['line'], ['line', '', '改一下理由'], ['mine', '簡訊加一個語音版', '長輩不看字']]); evAdd(sid, 'open', t0, 'pc'); evAdd(sid, 'dir', t0 + 2 * M, 'line'); evAdd(sid, 'dir', t0 + 3 * M, 'mine');
        } else if (a === 8) { var d8 = fullDoc(); d8.rows.r2.ev = ['iv:' + code + ':#gone-99·need']; P.doc[sid] = d8; dirh(sid, [['web']]); evAdd(sid, 'open', t0, 'pc');
        } else if (a === 9) { P.doc[sid] = fullDoc(); dirh(sid, [['web']]); evAdd(sid, 'open', t0, 'pc'); evAdd(sid, 'coach', t0 + M, 'hint:row1'); (P.coachq[today] = P.coachq[today] || {})[sid] = PX.COACH_PER_DAY; }
        if (a === 0 || a === 1 || a === 7) { (P.coachq[today] = P.coachq[today] || {})[sid] = 2 + (idx % 4); (P.coachq[yday] = P.coachq[yday] || {})[sid] = 3; }
      }
    });
    /* 用量：提案室專屬（usage）與審核用量（reviewUsage 的 proposal 類；interview、resp 是別的系統，不該被算進來） */
    var users = {}; Object.keys(P.coachq[today] || {}).forEach(function (s) { users[s] = P.coachq[today][s]; });
    P.usage[today] = { calls: 40, nusd: 52000000, tokIn: 90000, tokOut: 20000, fills: 6, byKind: { px_hint: 20, px_check: 10, px_pattern: 4, px_fill: 6 }, users: users, capHits: { user: 2, fill: 1, usd: 0 } };
    P.usage[yday] = { calls: 12, nusd: 9000000, tokIn: 20000, tokOut: 5000, fills: 1, byKind: { px_hint: 12 }, users: {}, capHits: {} };
    T.er._daemon.admin.reviewUsage[today] = { proposal: { runs: 1, n: 8, tin: 40000, tout: 9000, usd: 0.4123, model: 'gemini-2.5-pro(batch)', last: now - 8 * M }, interview: { runs: 3, n: 99, usd: 5.5 }, resp: { runs: 1, n: 7, usd: 1.25 } };
    T.er[sess].profiles['99'] = { name: '老師帳號', cls: '二甲' }; T.er[sess].profiles['58'] = { name: '測試員', cls: '二乙' };   /* 老師與測試帳號：名冊裡有，不計入 */
    P.doc['58'] = { dir: { pick: 'web', why: 'x', at: 1 }, updatedAt: 1 };
    if (bad) {
      var sids = Object.keys(raw.__arch), of = function (k) { return sids.filter(function (s) { return raw.__arch[s] === k; })[0]; }, a0 = of(0), a1 = of(1), a4 = of(4), a2 = of(2);
      P.rev[a0][today].score = 88;                                                      /* 審核結果裡出現分數 */
      P.rev[a1][today].advisory = false;                                                /* 沒標僅供建議 */
      var sub1 = P.sub[a0][today]; delete P.sub[a0][today]; P.sub[a0]['20260101'] = sub1;   /* 日期鍵和送審時間對不上 */
      P.doc[a4].dir.pick = 'zzz';                                                       /* 方向值不在四種裡 */
      (P.coachq[today] = P.coachq[today] || {})[a2] = PX.COACH_PER_DAY + 5;             /* 超過每日上限 */
      evAdd(a2, 'open', now - 40 * M, '學生寫的一大段內容'.repeat(6));                    /* 事件裡有內容 */
      raw.__deny = ['prx/' + sess + '/usage'];                                          /* 這個節點讀不到 */
      raw.__bad = { a0: a0, a1: a1, a4: a4, a2: a2 };
    }
    /* 提案按案例分開存（11-01）：上面都是「一位學生一份」的平面寫法，這裡統一包成 {學號:{sms:…}}，事件帶 c；
       另外替一位類型 0 的學生多放一份 bike（公路車，預留案例）的提案、送審、審核與事件，用來驗證「看 sms 時完全不受影響、看 bike 時只有他一人」。 */
    ['doc', 'dirh', 'sub', 'rev'].forEach(function (k) { Object.keys(P[k]).forEach(function (sid) { var v = P[k][sid]; P[k][sid] = { sms: v }; }); });
    Object.keys(P.ev).forEach(function (sid) { Object.keys(P.ev[sid]).forEach(function (k) { P.ev[sid][k].c = 'sms'; }); });
    var b0 = Object.keys(raw.__arch).filter(function (x) { return raw.__arch[x] === 0; })[0], bt = now - 15 * M;
    raw.__bikeSid = b0;
    P.doc[b0].bike = { dir: { pick: 'line', mine: '', why: '騎車時看不到手機，語音比較安全', at: bt }, rows: { r1: { n: 1, decide: '用語音提示下一個轉彎', ev: [], persona: { pid: 'volunteer', own: '' }, cell: '', dissent: '', tradeoff: '', t: bt } }, updatedAt: bt };
    P.dirh[b0].bike = {}; P.dirh[b0].bike[bt] = { pick: 'line', mine: '', why: '騎車時看不到手機', at: bt };
    P.sub[b0].bike = {}; P.sub[b0].bike[today] = { t: bt, doc: P.doc[b0].bike };
    P.rev[b0].bike = {}; P.rev[b0].bike[today] = { ok: false, align: [{ code: 'row-ev', row: 1, msg: '第 1 列指不回訪談：還沒選任何依據。' }], fb: '先補依據。', rows: [], changed: true, at: bt, advisory: true };
    evAdd(b0, 'open', bt, 'pc'); P.ev[b0][bt + '_' + evSeq].c = 'bike';
    if (bad) { var a4b = raw.__bad.a4; P.doc[a4b].zzz = { dir: { pick: 'web', why: 'x', at: 1 } }; P.dirh[a4b].oldkey = { pick: 'web' }; P.ev[a4b]['1_9'] = { t: 1, k: 'open', d: 'pc', c: 'qqq' }; }
    return raw;
  }
  function getAt(tree, path) { var cur = tree, ps = path.split('/'); for (var i = 0; i < ps.length; i += 1) { if (cur == null || typeof cur !== 'object') return null; cur = cur[ps[i]]; } return cur === undefined ? null : cur; }
  /* 假的 Firebase：只有 ref(path).once('value')；raw.__deny 裡的路徑會被拒絕。reads 記下每次讀了哪些路徑（測試用：確認只讀、只讀需要的） */
  function fakeDb(raw) {
    var reads = [], no = function () { throw new Error('唯讀頁不該寫'); };
    return { reads: reads, ref: function (path) { return {
      once: function () { reads.push(path); if ((raw.__deny || []).indexOf(path) >= 0) return Promise.reject(new Error('permission_denied')); var v = getAt(raw.__tree, path); return Promise.resolve({ val: function () { return v === null ? null : JSON.parse(JSON.stringify(v)); } }); },
      set: no, update: no, remove: no, push: no, transaction: no }; } };
  }
  return { make: make, fakeDb: fakeDb, ARCH: ARCH, CLS: CLS };
});
