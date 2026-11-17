/* 提案室（W10）的純邏輯：不碰 DOM、不碰 Firebase，Node 可測。
   學生要完成「衛教簡訊再設計」提案：選方向、把每個設計決定對準自己的訪談／線索／結論／人物／故事板格，
   回答三題現實題，最後匯出可交的頁面或送審。
   學生看得到的字全部用學生的說法；醫院一律叫「呼呼醫院」；不放老師備課用語。
   證據編號格式（Python 端 tools/prx_common.py 必須產出一模一樣的編號，tools/prx_fixtures.json 兩邊對帳）：
     訪談卡的一欄  iv:{房號}:{訪談卡編號}·{surface|events|need}      例 iv:AB12:#4B01-03·need
     自己記的卡片  mk:{房號}:{卡片編號}                               例 mk:AB12:#4B01-05（有 clueId 的是「線索」）
     自己寫的結論  cc:{房號}:{第幾條，從 1 起}                         例 cc:AB12:1
     故事板格      {房號}:s{n}                                        例 AB12:s3
   資料節點（寫入只放新節點 prx/{場次}/…，見 docs/PROPOSAL_ROOM_RULES_DRAFT.md）。
   提案按「案例」分開存（11-01 楊老師裁示）：學號底下多一層案例代碼 {案例}（sms／bike／trash，見下面 CASES），同一位學生不同案例的提案互不覆蓋。
     doc/{學號}/{案例}  { dir:{pick,mine,why,at}, rows:{r1..r8}, real:{who,cost,blame}, updatedAt }
     dirh/{學號}/{案例}/{時間}  方向歷程　sub/{學號}/{案例}/{YYYYMMDD}  送審快照（每案例一天一份）　rev/{學號}/{案例}/{YYYYMMDD}  審核建議
     ev/{學號}/{時間_亂數}  事件紀錄（帶 c＝案例）　coach/{學號}/q|a  助手的問答（題目帶 case）　coachq/{日}/{學號}  助手名額（每人每天合計，不分案例） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'));
  else root.ERG_PX = factory(root.ERG_SB);
})(typeof self !== 'undefined' ? self : this, function (SB) {
  'use strict';

  var DIRS = [
    { k: 'web', name: '把簡訊改成網頁', desc: '簡訊只放一個短連結，內容搬到一頁手機網頁。' },
    { k: 'line', name: '接 LINE 官方帳號', desc: '用呼呼醫院的 LINE 官方帳號傳訊息、回覆問題。' },
    { k: 'app', name: '整合進醫院 App', desc: '把衛教放進呼呼醫院現有的 App。' },
    { k: 'mine', name: '我自己的方向', desc: '可以修改上面三個方向，也可以提出你自己的。' }
  ];
  /* 提案的案例（主題）。sms 已上線；bike（公路車）、trash（垃圾車）只預留代碼與資料結構，還沒有畫面。
     證據只取「房間案例 ＝ 這個提案的案例」的紀錄，所以三個主題各有各的證據清單，互不混在一起。
     tools/prx_common.py 的 CASE_NAMES／LIVE_CASES 必須同步（tools/test_prx_common.py 對帳）。 */
  var CASES = [
    { k: 'sms', g: 'H', code: 'H1', name: '離院衛教簡訊', title: '衛教簡訊再設計', live: true },
    { k: 'bike', g: 'M', code: 'M1', name: '騎行夥伴', title: '騎行夥伴', live: true },
    { k: 'trash', g: 'M', code: 'M2', name: '垃圾車快報', title: '垃圾車快報', live: true },
    /* 11-14 擇優自主再設計五案（_ux_redesign_cases/）：遊戲三案只預留代碼，學生看到的是虛構名 */
    { k: 'ftl', g: 'G', code: 'G2', name: '星際逃亡船', title: '星際逃亡船', live: true },
    { k: 'itb', g: 'G', code: 'G1', name: '機甲防衛戰', title: '機甲防衛戰', live: true },
    { k: 'sts', g: 'G', code: 'G3', name: '爬塔卡牌', title: '爬塔卡牌', live: true },
    /* 11-14 交通訂票兩案（_ux_redesign_cases/thsr、hoshin）：主軸是「在好用的訂票流程裡加入 AI 代理人助理」，學生看到的是虛構名 */
    { k: 'hsr', g: 'T', code: 'T1', name: '快鐵訂位', title: '快鐵訂位', live: true },
    { k: 'bus', g: 'T', code: 'T2', name: '客運快訂', title: '客運快訂', live: true },
    /* 11-17 遊戲線新逆向的遊戲案例（_ux_redesign_cases/poker）：學生看到的是虛構名 */
    { k: 'poker', g: 'G', code: 'G4', name: '撲克闖關', title: '撲克闖關', live: true },
    /* 11-17 遊戲線新逆向的遊戲案例（_ux_redesign_cases/dice）：學生看到的是虛構名 */
    { k: 'dice', g: 'G', code: 'G5', name: '擲骰闖關', title: '擲骰闖關', live: true },
    /* 11-17 遊戲線新逆向的遊戲案例（_ux_redesign_cases/colony）：學生看到的是虛構名 */
    { k: 'colony', g: 'G', code: 'G6', name: '荒星聚落', title: '荒星聚落', live: true }
  ];
  /* 11-17 楊老師「案例有點多，分類去編碼」：四大類＋編碼（H 健康與醫療、M 生活與移動、T 交通訂票、G 遊戲）；
     編碼只是顯示用（選單、後台），資料庫路徑與程式裡的案例代碼 k 不變（改 k 會讓學生已存的提案對不上）。
     遊戲類編碼順序：G1 機甲防衛戰（格狀戰術）、G2 星際逃亡船（即時管理）、G3–G5 卡牌與骰子（爬塔卡牌、撲克闖關、擲骰闖關）、G6 荒星聚落（經營）。 */
  var GROUPS = [
    { g: 'H', name: '健康與醫療' },
    { g: 'M', name: '生活與移動' },
    { g: 'T', name: '交通訂票' },
    { g: 'G', name: '遊戲' }
  ];
  function groupName(g) { for (var i = 0; i < GROUPS.length; i += 1) if (GROUPS[i].g === g) return GROUPS[i].name; return ''; }
  function caseCode(k) { var d = caseDef(k); return d ? d.code : ''; }
  var DEFAULT_CASE = 'sms';
  var LIMITS = { why: 200, mine: 80, decide: 120, personaOwn: 60, dissent: 120, tradeoff: 160, real: 200, askWho: 60, maxRows: 8, minRows: 3, maxEv: 6, ask: 300, textShow: 140,
    cardWho: 20, cardSaid: 120, cardScreen: 60, maxCards: 12 };   /* 外部訪談證據卡：誰≤20、說了什麼≤120、畫面≤60、每案最多 12 張；Firebase 規則 evi 區塊與 tools/prx_common.py 同值（tests 對帳） */
  /* 非 sms 案例沒有「簡訊三方向」：方向只留「我的方向」一項（自己寫一句話）；sms 不變 */
  var DIRS_OTHER = [{ k: 'mine', name: '我的方向', desc: '用一句話寫出你這一份想改什麼、改給誰。' }];
  function dirsFor(caseId) { return caseId && caseId !== 'sms' ? DIRS_OTHER : DIRS; }
  /* 提案室助手自己的每日名額（楊老師 11-01 裁示：和故事板助教分開算，先設每天 30 次）。要改只改這一處；
     tools/prx_common.py 的 COACH_PER_DAY 必須同值（tools/test_prx_common.py 逐字比對這一行）。 */
  var COACH_PER_DAY = 30;
  var REAL_KEYS = ['who', 'cost', 'blame'];
  var REAL_Q = {
    who: { title: '誰維護？', ask: '這個做法上線之後，內容更新、帳號、出錯修理，每天是誰在做？' },
    cost: { title: '大概花多少？', ask: '大概要花多少錢、多少人力、多少時間？抓個範圍就好，不用精準。' },
    blame: { title: '出錯誰負責？', ask: '如果病人沒收到、收錯、或看了誤會，責任在誰身上？' }
  };
  var ITEM_LABEL = { surface: '他一開始怎麼說', events: '那天發生了什麼事', need: '他真正需要什麼' };
  var PNAMES = { patient: '病人', family: '家屬', triage_nurse: '分流護理師', nurse: '護理師', doctor: '醫師', clerk: '櫃台人員', volunteer: '志工', superintendent: '院長' };
  var EVENT_KINDS = ['open', 'row_add', 'row_del', 'ev_pick', 'ask_back', 'coach', 'dir', 'submit', 'export'];
  var PROBLEM_MSG = {
    'dir-none': '還沒選方向。',
    'dir-mine': '你選了「我自己的方向」，請用一句話寫出你的方向（可以是修改上面三個，也可以是你自己想的）。',
    'dir-why': '方向後面還沒寫「為什麼」。',
    'rows-few': '對準表至少要 3 列，目前只有 {n} 列寫了設計決定。',
    'row-decide': '第 {n} 列還沒寫「我決定什麼」。',
    'row-ev': '第 {n} 列指不回訪談：還沒選任何依據。',
    'row-ev-lost': '第 {n} 列選的依據在你的紀錄裡找不到了，請重新選。',
    'row-persona': '第 {n} 列還沒選對應的人物。',
    'row-cell': '第 {n} 列還沒選解決故事板的哪一格。',
    'row-dissent': '第 {n} 列還沒寫「誰可能不同意」。',
    'row-tradeoff': '第 {n} 列還沒寫「我的取捨」。',
    'real-who': '現實題「誰維護？」還沒回答。不知道也可以寫「我不知道，但會去問誰」。',
    'real-cost': '現實題「大概花多少？」還沒回答。不知道也可以寫「我不知道，但會去問誰」。',
    'real-blame': '現實題「出錯誰負責？」還沒回答。不知道也可以寫「我不知道，但會去問誰」。'
  };
  /* 非 sms 案例的幾句不同的問題訊息（沒列在這裡的沿用 PROBLEM_MSG）；tools/prx_common.py 的 PROBLEM_MSG_OTHER 逐字對帳 */
  var PROBLEM_MSG_OTHER = {
    'dir-none': '還沒寫「我的方向」。',
    'dir-mine': '請用一句話寫出「我的方向」。',
    'row-ev': '第 {n} 列指不回訪談：還沒選任何一張訪談卡。',
    'row-ev-lost': '第 {n} 列選的訪談卡找不到了，請重新選。',
    'row-cell': '第 {n} 列還沒選「跟哪個畫面有關」（訪談卡的「畫面」那一格有寫，這裡才選得到）。'
  };
  var ROW_FIELD_NAME = { 'row-decide': '我決定什麼', 'row-ev': '依據', 'row-persona': '對應人物', 'row-cell': '故事板哪一格', 'row-dissent': '誰可能不同意', 'row-tradeoff': '我的取捨' };

  var arr = SB.arr, esc = SB.esc, clip = SB.clip;
  function s(x) { return typeof x === 'string' ? x : (x == null ? '' : String(x)); }
  function tr(x) { return s(x).trim(); }
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function msg(code, n, caseId) { var m = caseId && caseId !== 'sms' && PROBLEM_MSG_OTHER[code] ? PROBLEM_MSG_OTHER[code] : (PROBLEM_MSG[code] || code); return m.replace('{n}', n == null ? '' : n); }
  function pname(pid, extra) { return (extra && extra[pid]) || PNAMES[pid] || pid || '?'; }
  /* ———— 案例（提案按案例分開存、證據按案例篩選） ———— */
  function caseDef(k) { for (var i = 0; i < CASES.length; i += 1) if (CASES[i].k === k) return CASES[i]; return null; }
  function isCase(k) { return !!caseDef(k); }
  function caseOf(k) { return isCase(k) ? k : DEFAULT_CASE; }              /* 不認得的案例代碼一律當預設案例 */
  function liveCase(k) { var d = caseDef(k); return d && d.live ? k : DEFAULT_CASE; }   /* 畫面只開已上線的案例 */
  /* 網址 ?case= 要開哪一個案例：測試模式（本機 ?local=1、或本機網址帶 tsess 的測試場次）可以開還沒上線的案例，一般學生只開已上線的；上線只改 CASES 的 live 一行 */
  function caseForPage(k, testMode) { return testMode && isCase(k) ? k : liveCase(k); }
  function caseTitle(k) { var d = caseDef(k) || caseDef(DEFAULT_CASE); return d.title; }
  /* 只留房間案例 ＝ 指定案例的房間（rooms 是 roomInput 的結果）；不指定案例就全留 */
  function roomsOfCase(rooms, caseId) { return caseId ? arr(rooms).filter(function (r) { return r && r.caseId === caseId; }) : arr(rooms); }

  /* ———— 文件（學生的提案）———— */
  function emptyRow(n) {
    return { n: n, decide: '', ev: [], persona: { pid: '', own: '' }, cell: '', dissent: '', tradeoff: '', ai: {}, aiText: {}, t: 0 };
  }
  function emptyDoc() {
    return { dir: { pick: '', mine: '', why: '', at: 0 }, rows: [], real: { who: { text: '', unknown: false, askWho: '' }, cost: { text: '', unknown: false, askWho: '' }, blame: { text: '', unknown: false, askWho: '' } }, updatedAt: 0 };
  }
  function rowKey(n) { return 'r' + n; }
  /* Firebase 不存空陣列與空物件、陣列會變物件：讀回來一律整理成固定形狀 */
  function normRow(r, n) {
    var o = emptyRow(Number(r && r.n) || n || 1);
    if (!r || typeof r !== 'object') return o;
    o.decide = s(r.decide); o.dissent = s(r.dissent); o.tradeoff = s(r.tradeoff); o.cell = s(r.cell); o.t = Number(r.t) || 0;
    o.ev = arr(r.ev).map(String).filter(Boolean);
    var p = r.persona && typeof r.persona === 'object' ? r.persona : {}; o.persona = { pid: s(p.pid), own: s(p.own) };
    ['decide', 'dissent', 'tradeoff'].forEach(function (k) {
      if (r.ai && r.ai[k]) o.ai[k] = 1;
      if (r.aiText && typeof r.aiText[k] === 'string') o.aiText[k] = r.aiText[k];
    });
    return o;
  }
  function normReal1(x) { x = x && typeof x === 'object' ? x : {}; return { text: s(x.text), unknown: !!x.unknown, askWho: s(x.askWho) }; }
  function normDoc(raw, caseId) {
    var d = emptyDoc(); if (!raw || typeof raw !== 'object') return d;
    var dr = raw.dir && typeof raw.dir === 'object' ? raw.dir : {};
    d.dir = { pick: dirsFor(caseId).some(function (x) { return x.k === dr.pick; }) ? dr.pick : '', mine: s(dr.mine), why: s(dr.why), at: Number(dr.at) || 0 };
    var rr = raw.rows, rows = [];
    if (Array.isArray(rr)) rows = rr.map(function (r, i) { return normRow(r, i); });
    else if (rr && typeof rr === 'object') rows = Object.keys(rr).map(function (k, i) { var m = /^r(\d+)$/.exec(k); return normRow(Object.assign({}, rr[k], m ? { n: Number(m[1]) } : {}), i + 1); });
    d.rows = rows.filter(function (r) { return r.n >= 1 && r.n <= LIMITS.maxRows; }).sort(function (a, b) { return a.n - b.n; });
    REAL_KEYS.forEach(function (k) { d.real[k] = normReal1(raw.real && raw.real[k]); });
    d.updatedAt = Number(raw.updatedAt) || 0; return d;
  }
  function nextRowN(doc) {
    var used = {}; doc.rows.forEach(function (r) { used[r.n] = 1; });
    for (var i = 1; i <= LIMITS.maxRows; i += 1) if (!used[i]) return i;
    return 0;
  }
  function rowByN(doc, n) { for (var i = 0; i < doc.rows.length; i += 1) if (doc.rows[i].n === n) return doc.rows[i]; return null; }
  /* 寫進資料庫的列：長度截好、沒有 undefined（Firebase 會拒絕） */
  function rowForWrite(r) {
    var o = {
      n: r.n, decide: clip(r.decide, LIMITS.decide), ev: r.ev.slice(0, LIMITS.maxEv).map(function (x) { return clip(x, 60); }), persona: { pid: clip(r.persona.pid, 40), own: clip(r.persona.own, LIMITS.personaOwn) },
      cell: clip(r.cell, 20), dissent: clip(r.dissent, LIMITS.dissent), tradeoff: clip(r.tradeoff, LIMITS.tradeoff), t: r.t || 0
    };
    var ai = {}, at = {};
    ['decide', 'dissent', 'tradeoff'].forEach(function (k) { if (r.ai && r.ai[k]) { ai[k] = true; at[k] = clip(r.aiText && r.aiText[k], LIMITS[k]); } });
    if (Object.keys(ai).length) { o.ai = ai; o.aiText = at; }
    return o;
  }

  /* 代填的字被學生改寫到一定程度（改動比例 ≥ 0.6，與故事板同一個門檻）就不再算助手示範 */
  function editRatio(orig, now) {
    var a = Array.from(s(orig)), b = Array.from(s(now)), d = Math.max(a.length, b.length);
    return d ? Math.min(1, SB.levenshtein(a, b) / d) : 1;
  }
  function applyEdit(row, field, text, threshold) {
    var o = copy(row); o[field] = clip(text, LIMITS[field]);
    if (o.ai && o.ai[field]) {
      if (!tr(o[field]) || editRatio(o.aiText[field], o[field]) >= (threshold || SB.CONFIG_DEFAULTS.rewriteThreshold)) { delete o.ai[field]; delete o.aiText[field]; }
    }
    return o;
  }
  function applyFill(row, fill) {
    var o = copy(row);
    ['decide', 'dissent', 'tradeoff'].forEach(function (k) {
      var t = clip(fill && fill[k], LIMITS[k]); if (!tr(t)) return;
      o[k] = t; o.ai[k] = 1; o.aiText[k] = t;
    });
    return o;
  }
  function aiFilledRows(doc) { return doc.rows.filter(function (r) { return Object.keys(r.ai || {}).length > 0; }).length; }
  function aiFieldShare(doc) {   /* 有字的欄位裡，有幾成還是助手示範 */
    var total = 0, ai = 0;
    doc.rows.forEach(function (r) { ['decide', 'dissent', 'tradeoff'].forEach(function (k) { if (tr(r[k])) { total += 1; if (r.ai && r.ai[k]) ai += 1; } }); });
    return total ? ai / total : 0;
  }

  /* ———— 證據：從本人的紀錄組出來 ———— */
  function markerText(el) {
    if (typeof el.text === 'string') return el.text;
    if (typeof el.label === 'string') return el.label;
    if (el.label && typeof el.label.text === 'string') return el.label.text;
    return '';
  }
  /* 場景元素＋手機卡片 → 自己記的卡片（與遊戲的 listMarkers 同一套取法；已刪除或沒有標記資料的跳過） */
  function markersFromScene(scene, mcards, sid) {
    var els = arr(scene).concat(arr(mcards).map(function (m) { return { id: 'mc:' + m.id, label: { text: m.text || '' }, customData: { marker: m } }; })), out = [];
    els.forEach(function (el) {
      if (!el || el.isDeleted === true || !el.customData || !el.customData.marker) return;
      var d = el.customData.marker;
      if (String(d.author) !== String(sid)) return;
      out.push({ id: String(d.id !== undefined ? d.id : el.id), type: String(d.type !== undefined ? d.type : (el.type || '')), text: markerText(el), clueId: d.clueId ? String(d.clueId) : '' });
    });
    return out;
  }
  /* 一間房的原始資料 → 組證據用的輸入。room＝getRoom 的結果、scene＝getScene 的結果 */
  function roomInput(room, scene, sid) {
    var p = (room && room.players && room.players[sid]) || {};
    return { code: s(room && room.code), caseId: s(room && room.case) || 'sms', interviews: arr(p.interviews).filter(function (r) { return r && typeof r === 'object' && r.id; }),
      conclusions: arr(p.conclusions).filter(function (c) { return c && typeof c === 'object'; }), markers: markersFromScene(scene, room && room.mcards, sid) };
  }
  function caseName(id) { var d = caseDef(id); if (d) return d.name; try { return SB.caseInfo(id).name; } catch (e) { return id; } }
  /* rooms：[{code, caseId, interviews, conclusions, markers}]；opts.names：{personaId: 名字}；opts.caseId：只取這個案例的房間（不給就全取）。回傳證據清單（順序固定：房間、訪談、卡片、結論） */
  function buildEvidence(rooms, opts) {
    opts = opts || {}; var out = [];
    roomsOfCase(rooms, opts.caseId).forEach(function (rm) {
      var code = rm.code, cn = caseName(rm.caseId);
      arr(rm.interviews).forEach(function (r) {
        var it = r.items || {}, who = pname(r.personaId, opts.names);
        ['surface', 'events', 'need'].forEach(function (k) {
          var note = tr(it[k] && it[k].note); if (!note) return;
          out.push({ id: 'iv:' + code + ':' + r.id + '·' + k, kind: 'iv', room: code, caseId: rm.caseId, ref: r.id, item: k, pid: s(r.personaId), who: who, label: '訪談・' + ITEM_LABEL[k], text: note,
            src: '訪談卡 ' + r.id + '・' + ITEM_LABEL[k] + '（房間 ' + code + '，問的是' + who + '，案例：' + cn + '）' });
        });
      });
      arr(rm.markers).forEach(function (m) {
        var text = tr(m.text); if (!text) return;
        var isClue = !!m.clueId;
        out.push({ id: 'mk:' + code + ':' + m.id, kind: 'mk', room: code, caseId: rm.caseId, ref: m.id, pid: '', who: '', label: isClue ? '線索（勘查卡）' : m.type || '卡片', text: text,
          src: (isClue ? '線索勘查卡 ' : (m.type || '卡片') + ' ') + m.id + '（房間 ' + code + '，案例：' + cn + '）' });
      });
      arr(rm.conclusions).forEach(function (c, i) {
        var text = [tr(c.text), tr(c.tradeoff) ? '取捨：' + tr(c.tradeoff) : ''].filter(Boolean).join('　'); if (!text) return;
        out.push({ id: 'cc:' + code + ':' + (i + 1), kind: 'cc', room: code, caseId: rm.caseId, ref: String(i + 1), pid: '', who: '', label: '我的結論', text: text,
          src: '我的結論第 ' + (i + 1) + ' 條（房間 ' + code + '，案例：' + cn + '）' });
      });
    });
    return out;
  }
  function evMap(list) { var m = {}; list.forEach(function (e) { m[e.id] = e; }); return m; }
  /* boards：[{code, cells:[normCell…]}] → 可選的故事板格 */
  function buildCells(boards) {
    var out = [];
    (boards || []).forEach(function (b) {
      arr(b.cells).forEach(function (c) {
        c = SB.normCell(c, c && c.n); if (!SB.hasContent(c)) return;
        var t = tr(c.title) || '（沒取名）', what = tr(c.what) || tr(c.think);
        out.push({ id: b.code + ':s' + c.n, room: b.code, n: c.n, title: t, text: clip(what, 60), label: '房間 ' + b.code + '・第 ' + c.n + ' 格「' + clip(t, 14) + '」' + (c.moment ? '★' : '') });
      });
    });
    return out;
  }

  /* ———— 外部訪談證據卡（非 sms 案例：學生自己找人聊，一張卡記一句話）————
     三格：誰（代號）、他說了什麼、跟哪個畫面有關（可空）。證據編號 ec:{案例}:{卡id}；有填「畫面」的卡同時是對準表可選的「畫面」。
     tools/prx_common.py 的 build_card_evidence／build_card_cells 與這裡逐字對帳（tools/prx_fixtures.json 的 ec_cards）。 */
  var CARD_ID_RE = /^[a-z0-9]{4,12}$/;
  function normCard(raw, id) {
    if (!raw || typeof raw !== 'object' || !CARD_ID_RE.test(s(id))) return null;
    var o = { id: s(id), who: clip(tr(raw.who), LIMITS.cardWho), said: clip(tr(raw.said), LIMITS.cardSaid), screen: clip(tr(raw.screen), LIMITS.cardScreen), t: Number(raw.t) || 0 };
    return o.who && o.said ? o : null;      /* 誰與他說了什麼都要有，才算一張卡 */
  }
  /* raw：資料庫 evi/{學號}/{案例} 底下的物件（或 {id: 卡} 的物件／陣列）→ 依時間排好的卡片陣列 */
  function normCards(raw) {
    var out = [];
    if (raw && typeof raw === 'object') Object.keys(raw).forEach(function (k) { var c = normCard(raw[k], k); if (c) out.push(c); });
    out.sort(function (a, b) { return a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return out.slice(0, LIMITS.maxCards);
  }
  function cardForWrite(c) { return { who: clip(tr(c.who), LIMITS.cardWho), said: clip(tr(c.said), LIMITS.cardSaid), screen: clip(tr(c.screen), LIMITS.cardScreen), t: Number(c.t) || 0 }; }
  function newCardId(now, rnd) { return 'c' + (Number(now) || Date.now()).toString(36).slice(-6) + Math.floor((rnd == null ? Math.random() : rnd) * 1296).toString(36).padStart(2, '0'); }
  /* 學生寫的字裡有信箱、手機號碼、學號：不存（卡片只用代號，不留聯絡方式）；真名這裡抓不到，靠欄位說明與助手／審核送模型前的遮蔽 */
  var CONTACT_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+|(^|[^0-9])0?9[0-9]{2}[- ]?[0-9]{3}[- ]?[0-9]{3}([^0-9]|$)|[0-9][A-Za-z][0-9][A-Za-z][0-9]{4}/;
  function cardHasContact(c) { return CONTACT_RE.test(s(c && c.who) + ' ' + s(c && c.said) + ' ' + s(c && c.screen)); }
  function cardEvidence(cards, caseId) {
    var cn = caseName(caseId);
    return arr(cards).map(function (c) {
      return { id: 'ec:' + caseId + ':' + c.id, kind: 'ec', room: '', caseId: caseId, ref: c.id, pid: '', who: c.who, label: '訪談卡：' + c.who, text: c.said,
        src: '訪談卡「' + c.who + '」（案例：' + cn + '）' };
    });
  }
  function cardCells(cards, caseId) {
    var out = [];
    arr(cards).forEach(function (c, i) {
      if (!c.screen) return;
      out.push({ id: caseId + ':e' + c.id, room: '', n: i + 1, title: clip(c.screen, 24), text: clip(c.said, 60), label: '畫面「' + clip(c.screen, 14) + '」（訪談卡「' + clip(c.who, 8) + '」）' });
    });
    return out;
  }
  /* 對應人物：只列自己訪談過的人；系統沒有存人物誌內容，所以再讓學生自己填一句 */
  function personaOptions(evidence, opts) {
    var seen = {}, out = [];
    evidence.forEach(function (e) { if (e.kind === 'iv' && e.pid && !seen[e.pid]) { seen[e.pid] = 1; out.push({ pid: e.pid, name: e.who || pname(e.pid, opts && opts.names), room: e.room }); } });
    return out;
  }

  /* ———— 檢查：有沒有對準 ———— */
  function realAnswered(r) { r = r || {}; return tr(r.text).length >= 4 || (!!r.unknown && tr(r.askWho).length >= 1); }
  function rowFilled(r) { return !!tr(r.decide); }
  function rowBlank(r) { return !tr(r.decide) && !r.ev.length && !tr(r.dissent) && !tr(r.tradeoff) && !tr(r.persona.pid) && !tr(r.persona.own) && !r.cell; }
  /* 一列缺什麼。evSet：{證據編號:true}、cellSet：{格編號:true}。回傳代碼陣列（固定順序） */
  function rowMissing(r, evSet, cellSet) {
    var miss = [];
    if (!tr(r.decide)) miss.push('row-decide');
    var good = r.ev.filter(function (id) { return evSet[id]; });
    if (!r.ev.length) miss.push('row-ev'); else if (!good.length) miss.push('row-ev-lost');
    if (!tr(r.persona.pid) && !tr(r.persona.own)) miss.push('row-persona');
    if (!r.cell || !cellSet[r.cell]) miss.push('row-cell');
    if (!tr(r.dissent)) miss.push('row-dissent');
    if (!tr(r.tradeoff)) miss.push('row-tradeoff');
    return miss;
  }
  /* 與 tools/prx_common.py 的 alignment() 一模一樣（fixtures 兩邊對帳）。回傳 { ok, problems:[{code,row,msg}] } */
  function alignment(doc, evSet, cellSet, caseId) {
    var P = [];
    function add(code, row) { P.push({ code: code, row: row || 0, msg: msg(code, row, caseId) }); }
    var d = doc.dir;
    if (!d.pick) add('dir-none');
    else {
      if (d.pick === 'mine' && !tr(d.mine)) add('dir-mine');
      if (!tr(d.why)) add('dir-why');
    }
    var filled = doc.rows.filter(rowFilled);
    if (filled.length < LIMITS.minRows) P.push({ code: 'rows-few', row: 0, msg: msg('rows-few', filled.length) });
    doc.rows.forEach(function (r) {
      if (rowBlank(r)) return;   /* 完全空白的列（按了新增卻還沒寫）不算 */
      rowMissing(r, evSet, cellSet).forEach(function (c) { add(c, r.n); });
    });
    REAL_KEYS.forEach(function (k) { if (!realAnswered(doc.real[k])) add('real-' + k); });
    return { ok: P.length === 0, problems: P };
  }
  function problemsByRow(al, n) { return al.problems.filter(function (p) { return p.row === n; }); }

  function status(doc, evidence, cells, caseId) {
    var evSet = {}, cellSet = {}; evidence.forEach(function (e) { evSet[e.id] = true; }); cells.forEach(function (c) { cellSet[c.id] = true; });
    var al = alignment(doc, evSet, cellSet, caseId), filled = doc.rows.filter(rowFilled);
    var done = filled.filter(function (r) { return rowMissing(r, evSet, cellSet).length === 0; });
    var gaps = filled.filter(function (r) { var m = rowMissing(r, evSet, cellSet); return m.indexOf('row-ev') >= 0 || m.indexOf('row-ev-lost') >= 0; }).map(function (r) { return r.n; });
    var dirOk = !!doc.dir.pick && !!tr(doc.dir.why) && (doc.dir.pick !== 'mine' || !!tr(doc.dir.mine));
    var realDone = REAL_KEYS.filter(function (k) { return realAnswered(doc.real[k]); }).length;
    return { alignment: al, evSet: evSet, cellSet: cellSet, dirOk: dirOk, rowsFilled: filled.length, rowsDone: done.length, gaps: gaps, realDone: realDone,
      complete: al.ok, canSubmit: dirOk && filled.length >= LIMITS.minRows };
  }

  /* 頂部一句話：下一步做什麼（先講最前面卡住的那一件） */
  function nextStep(doc, evidence, cells, st, ctx) {
    ctx = ctx || {}; st = st || status(doc, evidence, cells);
    var other = !!ctx.caseId && ctx.caseId !== 'sms';
    if (!evidence.length && other) return { text: '先去找一個人聊聊，回來記一句他說的話：在「我的訪談卡」新增一張。', go: 'cards' };
    if (!evidence.length) return { text: '先回急診室訪談一位關係人。提案要用你自己問來的內容，現在紀錄裡還沒有。', go: 'game' };
    if (other && !doc.dir.pick) return { text: '先用一句話寫出「我的方向」，再寫一句為什麼。', go: 'dir' };
    if (!doc.dir.pick) return { text: '先選一個方向（簡訊改網頁、接 LINE、整合進 App，或你自己的），再寫一句為什麼。', go: 'dir' };
    if (doc.dir.pick === 'mine' && !tr(doc.dir.mine)) return { text: '你選了「我自己的方向」，先用一句話寫出你的方向。', go: 'dir' };
    if (!tr(doc.dir.why)) return { text: '方向選好了，接著寫一句「為什麼選它」。', go: 'dir' };
    var filled = doc.rows.filter(rowFilled);
    if (filled.length < LIMITS.minRows) return { text: '加第 ' + (filled.length + 1) + ' 列：寫下一個你決定的設計，再點選它的依據（至少 ' + LIMITS.minRows + ' 列）。', go: 'row', row: 0 };
    var order = doc.rows.slice();
    for (var i = 0; i < order.length; i += 1) {
      var r = order[i]; if (!rowFilled(r)) continue;
      var miss = rowMissing(r, st.evSet, st.cellSet);
      if (miss.indexOf('row-ev') >= 0 || miss.indexOf('row-ev-lost') >= 0) return { text: other ? '第 ' + r.n + ' 列指不回訪談：點選一張訪談卡，或到「我的訪談卡」再記一張。' : '第 ' + r.n + ' 列指不回訪談：點選一則依據，或按「回去問」再問一個人。', go: 'row', row: r.n };
    }
    for (var j = 0; j < order.length; j += 1) {
      var r2 = order[j]; if (!rowFilled(r2)) continue;
      var m2 = rowMissing(r2, st.evSet, st.cellSet);
      if (m2.length) return { text: '第 ' + r2.n + ' 列還缺「' + (other && m2[0] === 'row-cell' ? '跟哪個畫面有關' : ROW_FIELD_NAME[m2[0]]) + '」。', go: 'row', row: r2.n };
    }
    if (st.realDone < 3) return { text: '現實題還有 ' + (3 - st.realDone) + ' 題沒答。不知道也可以寫「我不知道，但會去問誰」。', go: 'real' };
    if (ctx.lastRev && ctx.lastRev.ok === false) return { text: '上次送審有地方要補，照審核建議改完再送一次。', go: 'rev' };
    if (!ctx.submittedToday) return { text: '都齊了。可以送審看看建議，也可以匯出 PDF 交到 flipclass。', go: 'export' };
    return { text: '今天已經送審了。看審核建議，改完可以匯出 PDF 交 flipclass；想再送一次，明天 00:00 之後。', go: 'rev' };
  }

  /* 提案室助手今天還能問幾次（和故事板助教分開算：只看 prx/{場次}/coachq/{日}/{學號}） */
  function coachLeft(used) { return Math.max(0, COACH_PER_DAY - (Number(used) || 0)); }
  /* 送審一天一次：今天送過了就明講「今天已送、明天幾點後可再送」。subs＝[{day, t}]，now＝毫秒 */
  function submitNote(subs, now) {
    var k = dayKey(now), done = arr(subs).some(function (x) { return x && x.day === k; });
    if (!done) return { done: false, text: '一天可以送審一次；今天還沒送。' };
    return { done: true, text: '今天已經送審了（一天只能送一次）。明天 00:00 之後可以再送一次；今天想改的地方先改好，明天再送。' };
  }

  /* ———— 事件紀錄（只存種類與很短的標記，不存學生寫的內容）———— */
  function makeEvent(k, d, now, caseId) {
    if (EVENT_KINDS.indexOf(k) < 0) return null;
    var ev = { t: Number(now) || Date.now(), k: k, d: clip(d == null ? '' : String(d), 40) };
    if (caseId) ev.c = caseOf(caseId);   /* 哪個案例的提案（沒帶＝舊格式，後台當預設案例） */
    return ev;
  }
  function eventKey(ev, rnd) { return String(ev.t) + '_' + String(Math.floor((rnd == null ? Math.random() : rnd) * 1e6)); }

  /* ———— 助手的問題（送給 tools/prx_coach.py）———— */
  var PX_KINDS = ['hint', 'check', 'pattern', 'fill'];
  var LEVEL_OF = { hint: 1, check: 2, pattern: 3, fill: 4 };
  function buildQuestion(o) {
    o = o || {}; var kind = PX_KINDS.indexOf(o.kind) >= 0 ? o.kind : 'hint';
    var target = o.target === 'row' || o.target === 'real' ? o.target : 'dir';
    var q = { kind: kind, level: LEVEL_OF[kind], target: target, 'case': caseOf(o['case']), n: target === 'row' ? Math.max(1, Math.min(LIMITS.maxRows, Number(o.n) || 1)) : 0,
      key: target === 'real' && REAL_KEYS.indexOf(o.key) >= 0 ? o.key : '', ask: clip(o.ask || '', LIMITS.ask), rooms: arr(o.rooms).map(String).filter(function (c) { return /^[A-Z0-9]{4}$/.test(c); }).slice(0, 6), t: Number(o.t) || 0 };
    if (kind === 'fill' && target !== 'row') q.kind = 'hint', q.level = 1;
    return q;
  }
  /* 本機測試模式沒有後端：固定示範答案（畫面上會標明） */
  function localStub(q, ctx) {
    ctx = ctx || {}; var t, id = ctx.firstRef || '';
    if (q.kind === 'hint') t = q.target === 'row' ? '這個決定是在解決誰的哪一個麻煩？你的訪談卡裡，誰說過這件事？' + (id ? '〔' + ctx.firstSrc + '〕' : '') : (q.target === 'real' ? '先想想：這件事上線後，最先要有人天天做的是什麼？' : '三個方向裡，哪一個最不需要病人多學一個新東西？為什麼？');
    else if (q.kind === 'check') t = '・依據欄：只選到一則，能不能再找一則不同人說的？' + (id ? '〔' + ctx.firstSrc + '〕' : '') + '\n・誰可能不同意：寫到具體的人（例如櫃台、院長）比較好。\n・我的取捨：要講到「放掉了什麼」。';
    else if (q.kind === 'pattern') t = '示範（別的案例）：阿嬤在候診區盯著叫號螢幕，卻因為聽不到廣播而錯過號碼。\n換你：我決定【做什麼】，因為【誰】在【哪裡】卻【卡在哪】。用你訪談裡的事填進【】。';
    else t = '';
    var out = { text: t, srcs: id ? [{ id: id, label: ctx.firstSrc }] : [], kind: q.kind, model: 'local-stub', ok: true };
    if (q.kind === 'fill' && ctx.fill) { out.fill = ctx.fill; out.text = '我照你的紀錄先寫了一個示範，請改成你自己的話。'; out.srcs = (ctx.fill.refs || []).map(function (r) { return { id: r, label: r }; }); }
    return out;
  }
  function answerText(a) {
    var t = s(a && a.text), srcs = arr(a && a.srcs);
    return { text: t, srcs: srcs.filter(function (x) { return x && x.id; }).map(function (x) { return { id: s(x.id), label: s(x.label) || s(x.id) }; }) };
  }

  /* ———— 送審與審核結果 ———— */
  function dayKey(ts) { return SB.dayKey(ts); }
  function snapshotForSubmit(doc, evidence, cells, now) {
    var d = copy(doc); d.rows = d.rows.map(rowForWrite);
    var rows = {}; d.rows.forEach(function (r) { rows[rowKey(r.n)] = r; }); d.rows = rows;
    var evOut = {}, evUsed = {};
    doc.rows.forEach(function (r) { r.ev.forEach(function (id) { evUsed[id] = 1; }); });
    evidence.forEach(function (e) { if (evUsed[e.id]) evOut[e.id.replace(/[.#$\[\]\/]/g, '_')] = { id: e.id, text: clip(e.text, LIMITS.textShow) }; });
    var cellsOut = {}, cellUsed = {}; doc.rows.forEach(function (r) { if (r.cell) cellUsed[r.cell] = 1; });
    cells.forEach(function (c) { if (cellUsed[c.id]) cellsOut[c.id.replace(/[.#$\[\]\/:]/g, '_')] = { id: c.id, title: clip(c.title, 24), text: clip(c.text, 60) }; });
    return { t: now, doc: d, evText: evOut, cellText: cellsOut };
  }

  /* ———— 可列印頁（沿用 report.js 的做法：自己排版成 A4 的 HTML，列印另存 PDF） ———— */
  var PRINT_CSS = '@page{size:A4;margin:14mm}body{font:12px/1.6 "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;color:#000;margin:0}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:14px 0 4px;border-bottom:2px solid #000}' +
    '.note{color:#444;font-size:11px}.warn{color:#b00020;font-weight:700}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #000;padding:4px 6px;vertical-align:top;text-align:left}th{background:#eee}' +
    '.row{break-inside:avoid;border:1px solid #000;border-top:6px solid #3d6fe0;padding:6px 10px;margin:8px 0}.ev{margin:2px 0;padding-left:8px;border-left:3px solid #999}.ai{background:#fff0c2;padding:0 4px;border-radius:3px;font-size:10px}';
  function printHtml(doc, ctx) {
    ctx = ctx || {}; var evs = ctx.evMap || {}, cells = ctx.cellMap || {}, P = ctx.personaNames || {}, st = ctx.status || null, parts = [];
    var dir = dirsFor(ctx.caseId).filter(function (x) { return x.k === doc.dir.pick; })[0], otherCase = !!ctx.caseId && ctx.caseId !== 'sms';
    parts.push('<h1>' + esc(caseTitle(ctx.caseId)) + '提案</h1><div class="note">學號 ' + esc(ctx.sid || '') + '　' + esc(ctx.date || '') + '　呼呼醫院（虛構的教學情境）</div>');
    if (st && !st.complete) parts.push('<p class="warn">這份提案還沒完成：' + st.alignment.problems.slice(0, 6).map(function (p) { return esc(p.msg); }).join(' ') + '</p>');
    parts.push('<h2>1. 我選的方向</h2><p><b>' + esc(dir ? (doc.dir.pick === 'mine' ? '我自己的方向：' + doc.dir.mine : dir.name) : '（還沒選）') + '</b></p><p>為什麼：' + esc(doc.dir.why || '（還沒寫）') + '</p>');
    parts.push('<h2>2. 對準表</h2>');
    if (!doc.rows.length) parts.push('<p class="note">（還沒有任何一列）</p>');
    doc.rows.forEach(function (r) {
      var evh = r.ev.length ? r.ev.map(function (id) { var e = evs[id]; return '<div class="ev">' + (e ? esc(e.text) + '<div class="note">出處：' + esc(e.src) + '</div>' : '<span class="warn">（這則依據在紀錄裡找不到）</span>') + '</div>'; }).join('') : '<div class="warn">指不回訪談（沒有選依據）</div>';
      var pn = r.persona.pid ? esc(pname(r.persona.pid, P)) : '', own = r.persona.own ? '　人物特質：' + esc(r.persona.own) : '';
      var c = r.cell ? cells[r.cell] : null;
      function ai(k) { return r.ai && r.ai[k] ? ' <span class="ai">助手示範</span>' : ''; }
      parts.push('<div class="row"><b>第 ' + r.n + ' 列　我決定：</b>' + esc(r.decide || '（空）') + ai('decide') + '<table><tr><th style="width:22%">依據</th><td>' + evh + '</td></tr>' +
        '<tr><th>對應人物</th><td>' + (pn || '（沒選）') + own + '</td></tr><tr><th>' + (otherCase ? '跟哪個畫面有關' : '解決故事板哪一格') + '</th><td>' + (c ? esc(c.label) + (c.text ? '：' + esc(c.text) : '') : '（沒選）') + '</td></tr>' +
        '<tr><th>誰可能不同意</th><td>' + esc(r.dissent || '（空）') + ai('dissent') + '</td></tr><tr><th>我的取捨</th><td>' + esc(r.tradeoff || '（空）') + ai('tradeoff') + '</td></tr></table></div>');
    });
    parts.push('<h2>3. 現實題</h2><table>' + REAL_KEYS.map(function (k) {
      var x = doc.real[k]; return '<tr><th style="width:22%">' + esc(REAL_Q[k].title) + '</th><td>' + (x.unknown ? '我不知道，但會去問：' + esc(x.askWho) + (x.text ? '<br>' + esc(x.text) : '') : esc(x.text || '（還沒答）')) + '</td></tr>';
    }).join('') + '</table>');
    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(caseTitle(ctx.caseId)) + '提案</title><style>' + PRINT_CSS + '</style></head><body>' + parts.join('') + '</body></html>';
  }

  /* ———— H1（11-17）：案例細節區分。每個案例自己的主色（亮／暗各一）、符號、一句話與開場語；主色換掉後，頂列色條、卡片上緣、按鈕、對準表編號一次到位（proposal.html 都用 --ct）。
     色票用 test_proposal_core.js 量對比：亮色白字 ≥ 4.5、暗色主色對暗板（#18262e）≥ 4.5 且深字（#10191f）疊在主色上 ≥ 4.5。學生看得到的字不提原作名。
     不改資料結構與資料庫路徑，只放在這張表（k＝案例代碼）。 ———— */
  var DECO = {
    sms:    { ct: '#3d6fe0', ctDark: '#648ce6', icon: '💬', suits: ['💬'], line: '病人回家後，只剩這則簡訊', hello: '病人回家後只剩這則簡訊可以看，它要讓人知道下一步該做什麼。', unit: '步', mood: 'soft' },
    bike:   { ct: '#2f7d32', ctDark: '#639e65', icon: '🚴', suits: ['🚴'], line: '騎到一半，低頭看一眼', hello: '騎到一半低頭看一眼手機，哪個數字應該最先被看到？', unit: '步', mood: 'soft' },
    trash:  { ct: '#b8570d', ctDark: '#c6793d', icon: '🚛', suits: ['🚛'], line: '車快到了，要不要出門', hello: '垃圾車快到了，你要在幾秒內知道該不該出門。', unit: '步', mood: 'soft' },
    hsr:    { ct: '#0b6e8a', ctDark: '#549aad', icon: '🚄', suits: ['🚄'], line: '付款前，最後一步', hello: '付款前的最後一步，使用者最不放心的是什麼？', unit: '步', mood: 'soft' },
    bus:    { ct: '#6a4bb5', ctDark: '#9781cb', icon: '🚌', suits: ['🚌'], line: '選班次、確認座位', hello: '選班次、確認座位，哪一步會讓人猶豫？', unit: '步', mood: 'soft' },
    itb:    { ct: '#3a5f8a', ctDark: '#758fad', icon: '♟', suits: ['♟'], line: '玩家第一眼看盤面', hello: '玩家第一眼看盤面，哪裡看不懂、找不到或按錯？', unit: '格', mood: 'card' },
    ftl:    { ct: '#7b3fa0', ctDark: '#a982c1', icon: '🚀', suits: ['🚀'], line: '警報一直響的時候', hello: '船艙警報一直響，玩家要先看哪個數字？', unit: '步', mood: 'card' },
    sts:    { ct: '#9b2d4a', ctDark: '#be7689', icon: '🃏', suits: ['🃏'], line: '牌上的數字，是真的嗎', hello: '牌上寫的數字，和這回合真正打出去的一樣嗎？', unit: '張', mood: 'card' },
    poker:  { ct: '#1f6b4a', ctDark: '#629780', icon: '♠', suits: ['♠', '♥', '♦', '♣'], line: '玩家每一手都在算分', hello: '玩家每一手都在算分：他在哪個畫面卡住？你怎麼改？', unit: '張', mood: 'card' },
    dice:   { ct: '#8c5a00', ctDark: '#ae8c4c', icon: '🎲', suits: ['🎲'], line: '骰子拖下去之前', hello: '骰子拖下去之前，玩家怎麼知道會發生什麼？', unit: '顆', mood: 'card' },
    colony: { ct: '#4f7a14', ctDark: '#7b9b4f', icon: '🏕', suits: ['🏕'], line: '警報一堆，先處理哪件', hello: '警報一堆，玩家要先處理哪一件？畫面有告訴他嗎？', unit: '件', mood: 'card' }
  };
  function decoOf(k) { return DECO[k] || DECO[DEFAULT_CASE]; }
  function hexRgb(h) { h = String(h).replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function mixHex(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] * (1 - t) + y[i] * t).toString(16); return v.length < 2 ? '0' + v : v; }).join(''); }
  function lumHex(h) { var a = hexRgb(h).map(function (c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function contrastHex(a, b) { var x = lumHex(a), y = lumHex(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); }
  /* 這個案例在亮色／暗色下的三個顏色：主色 ct、淡底色 soft、疊在主色上的字色 on */
  function decoColors(k, dark) { var d = decoOf(k); return dark ? { ct: d.ctDark, soft: mixHex(d.ctDark, '#18262e', 0.78), on: '#10191f' } : { ct: d.ct, soft: mixHex(d.ct, '#ffffff', 0.86), on: '#ffffff' }; }
  /* ———— H2（11-17）：案例嘗試。學生可以在 11 個案例間切換，每案的提案分開存（doc/{學號}/{案例}）；這裡把每案「做到哪一步」算出來，
     學生端選單與老師後台共用同一份算法，不新增任何讀取（資料都是本來就讀的 doc／ev／sub）。 ———— */
  var STAGES = ['還沒開始', '① 方向', '② 對準表', '③ 現實題', '③′ 原型', '④ 送審'];
  /* rawDoc＝doc/{學號}/{案例} 的原始值（或 normDoc 的結果）；hasSub＝這個案例有送審紀錄。回傳 { stage 0–5, name, rows（填了「我決定什麼」的列數）, at（最後更新）, has（資料庫裡有這一份） } */
  function caseProgress(rawDoc, caseId, hasSub) {
    var has = !!(rawDoc && typeof rawDoc === 'object' && Object.keys(rawDoc).length), d = normDoc(has ? rawDoc : null, caseId);
    var rows = d.rows.filter(function (r) { return !!tr(r.decide); }).length;
    var real = REAL_KEYS.filter(function (k) { var x = d.real[k]; return x && (tr(x.text) || x.unknown); }).length;
    var pr = has && rawDoc.proto && typeof rawDoc.proto === 'object' ? rawDoc.proto : null, protoOn = !!(pr && ((pr.links && Object.keys(pr.links).some(function (k) { return tr(pr.links[k]); })) || pr.vers));
    var st = hasSub ? 5 : protoOn ? 4 : real > 0 ? 3 : rows > 0 ? 2 : (d.dir.pick || tr(d.dir.mine)) ? 1 : 0;
    return { stage: st, name: STAGES[st], rows: rows, at: d.updatedAt || 0, has: has };
  }
  /* docs＝{學號:{案例:原始doc}}；evs＝{學號:{事件id:{c,k,t}}}；subs＝{學號:{案例:{日期:…}}}。
     回傳 { byCase: {案例: {students, stages:[0–5 各幾人], opened, last}}, bySid: {學號: [{k, stage, name, rows, at, opens}]（只含試過的案例，依最近更新排序）} }。
     「試過」＝有存檔，或開過那個案例（ev 的 open 事件帶 c）。 */
  function attemptsSummary(docs, evs, subs) {
    docs = docs || {}; evs = evs || {}; subs = subs || {};
    var out = { byCase: {}, bySid: {} };
    CASES.forEach(function (c) { out.byCase[c.k] = { students: 0, stages: [0, 0, 0, 0, 0, 0], opened: 0, last: 0 }; });
    var sids = {}; [docs, evs, subs].forEach(function (o) { Object.keys(o).forEach(function (x) { sids[x] = 1; }); });
    Object.keys(sids).forEach(function (sid) {
      var opens = {}, lastOpen = {};
      Object.keys(evs[sid] || {}).forEach(function (k) { var e = evs[sid][k] || {}; if (isCase(e.c) && (e.k === 'open' || e.k === 'dir')) { opens[e.c] = (opens[e.c] || 0) + 1; lastOpen[e.c] = Math.max(lastOpen[e.c] || 0, Number(e.t) || 0); } });
      var list = [];
      CASES.forEach(function (c) {
        var raw = (docs[sid] || {})[c.k], hasSub = !!(subs[sid] && subs[sid][c.k] && Object.keys(subs[sid][c.k]).length), p = caseProgress(raw, c.k, hasSub);
        if (!p.has && !opens[c.k] && !hasSub) return;
        var at = Math.max(p.at, lastOpen[c.k] || 0);
        list.push({ k: c.k, stage: p.stage, name: p.name, rows: p.rows, at: at, opens: opens[c.k] || 0 });
        var b = out.byCase[c.k]; b.students += 1; b.stages[p.stage] += 1; if (opens[c.k]) b.opened += 1; b.last = Math.max(b.last, at);
      });
      if (list.length) out.bySid[sid] = list.sort(function (a, b) { return b.at - a.at; });
    });
    return out;
  }
  return { DECO: DECO, decoOf: decoOf, decoColors: decoColors, contrastHex: contrastHex, STAGES: STAGES, caseProgress: caseProgress, attemptsSummary: attemptsSummary, DIRS: DIRS, DIRS_OTHER: DIRS_OTHER, dirsFor: dirsFor, PROBLEM_MSG_OTHER: PROBLEM_MSG_OTHER, caseForPage: caseForPage, cardHasContact: cardHasContact, normCard: normCard, normCards: normCards, cardForWrite: cardForWrite, newCardId: newCardId, cardEvidence: cardEvidence, cardCells: cardCells, CASES: CASES, GROUPS: GROUPS, groupName: groupName, caseCode: caseCode, DEFAULT_CASE: DEFAULT_CASE, caseDef: caseDef, isCase: isCase, caseOf: caseOf, liveCase: liveCase, caseTitle: caseTitle, caseName: caseName, roomsOfCase: roomsOfCase, LIMITS: LIMITS, COACH_PER_DAY: COACH_PER_DAY, coachLeft: coachLeft, submitNote: submitNote, REAL_KEYS: REAL_KEYS, REAL_Q: REAL_Q, ITEM_LABEL: ITEM_LABEL, PNAMES: PNAMES, EVENT_KINDS: EVENT_KINDS, PX_KINDS: PX_KINDS, PROBLEM_MSG: PROBLEM_MSG, ROW_FIELD_NAME: ROW_FIELD_NAME,
    arr: arr, tr: tr, copy: copy, msg: msg, pname: pname, emptyRow: emptyRow, emptyDoc: emptyDoc, normRow: normRow, normDoc: normDoc, rowKey: rowKey, nextRowN: nextRowN, rowByN: rowByN, rowForWrite: rowForWrite,
    editRatio: editRatio, applyEdit: applyEdit, applyFill: applyFill, aiFilledRows: aiFilledRows, aiFieldShare: aiFieldShare,
    markersFromScene: markersFromScene, roomInput: roomInput, buildEvidence: buildEvidence, evMap: evMap, buildCells: buildCells, personaOptions: personaOptions,
    realAnswered: realAnswered, rowFilled: rowFilled, rowBlank: rowBlank, rowMissing: rowMissing, alignment: alignment, problemsByRow: problemsByRow, status: status, nextStep: nextStep,
    makeEvent: makeEvent, eventKey: eventKey, buildQuestion: buildQuestion, localStub: localStub, answerText: answerText, dayKey: dayKey, snapshotForSubmit: snapshotForSubmit, printHtml: printHtml };
});
