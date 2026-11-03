/* 提案室「原型工作台」的純邏輯：不碰 DOM、不碰 Firebase，Node 可測。
   學生在提案室選好方向、對準好證據之後，由這裡把提案內容組成可以貼進 Claude 免費版／Claude Design／Figma／Google AI Studio 的指令，
   做完再把作品連結、改了什麼、自檢結果貼回來。三種模式（1 新手／2 中級／3 專家，沿用 ui_level）決定畫面給多少。
   學生看得到的字全部用學生的說法；醫院一律叫「呼呼醫院」；不放老師備課用語。
   資料節點：prx/{場次}/doc/{學號}/{案例}/proto（規則見 docs/PROPOSAL_ROOM_RULES_DRAFT.md）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_PROTO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TOOLS = [
    { k: 'free', name: 'Claude 免費版', where: 'claude.ai', use: '讓它讀你的 Figma 畫面、列出尺寸表；或幫你改指令' },
    { k: 'dsg', name: 'Claude Design', where: 'claude.ai → 成品 → 設計', use: '一句話生成或修改畫板' },
    { k: 'fig', name: 'Figma', where: 'figma.com', use: '複製樣板、排前後對照、貼便條' },
    { k: 'ais', name: 'Google AI Studio', where: 'aistudio.google.com', use: '貼畫面圖加指令，做成能點的原型' }
  ];
  var LIMITS = { url: 300, note: 200, cards: 60, chg: 300, heur: 40 };
  var CHK = [
    { k: 'q1', q: '這句話有告訴人「現在該做什麼」嗎？' },
    { k: 'q2', q: '看到的人知道「做完會怎樣」嗎？' },
    { k: 'q3', q: '「危險要回急診」的訊息一眼找得到嗎？' }
  ];
  var HEUR = [
    { k: 'H1', n: '看得出現在狀態' }, { k: 'H2', n: '用人看得懂的話' }, { k: 'H3', n: '做錯可以回上一步' },
    { k: 'H4', n: '前後一致' }, { k: 'H5', n: '先防止出錯' }, { k: 'H6', n: '看得到、不用硬記' },
    { k: 'H7', n: '新手專家都好用' }, { k: 'H8', n: '版面只留必要的' }, { k: 'H9', n: '出錯時說得清楚怎麼辦' }, { k: 'H10', n: '找得到說明' }
  ];

  /* 指引卡：t＝要貼到哪個工具；p＝指令（括號裡的字學生自己換）；done＝做完的樣子 */
  var CARDS = [
    { id: 'C1', g: 'edit', t: 'dsg', title: '換皮：換成另一種人用的', p: '把這個畫板改成（長輩／小朋友／夜班護理師）用的版本，字級、顏色、圖示都要配合，內容和功能順序不要動。', done: '兩個畫板並排，你說得出哪裡不一樣、為什麼' },
    { id: 'C2', g: 'edit', t: 'dsg', title: '換功能：加一個區塊', p: '在首頁加一個（家人共用／用藥打卡／候診時間）區塊，放在最上面三個位置內，其他不要動。', done: '新區塊在第一眼看得到的位置' },
    { id: 'C3', g: 'edit', t: 'dsg', title: '改流程：少一步', p: '把（掛號）流程從 5 步縮成 3 步，每步只放一個主要按鈕，列出新的步驟順序。', done: '一張流程圖或三個連續畫板' },
    { id: 'C4', g: 'edit', t: 'dsg', title: '改引導：改提示句', p: '把畫面上的提示句改成只講下一步要做什麼，每句不超過 15 個字，危險要回急診的訊息放在最顯眼的地方。', done: '你指得出每一句「告訴人現在該做什麼」' },
    { id: 'A1', g: 'play', t: 'ais', title: '還原：變成能點的', p: '照著這張手機畫面做成可以操作的網頁，圖上每一個字都不要改，不要加任何圖上沒有的東西。（要附畫面截圖）', done: '預覽和你的畫面幾乎一樣' },
    { id: 'A2', g: 'play', t: 'ais', title: '互動：讓按鈕有反應', p: '點（離院須知）會打開一頁寫著這張卡的內容；點返回回到首頁。所有按鈕都只在畫面內反應，不要真的傳任何東西。', done: '每個按鈕都能點，沒有按鈕沒反應' },
    { id: 'A3', g: 'play', t: 'ais', title: '校正：版面不走樣', p: '只校正版面尺寸，文字、顏色、功能都不要動。（把 Claude 免費版讀你 Figma 畫面列出的尺寸表貼在這句後面）', done: '字大小、間距和 Figma 差 1~2 px 內' },
    { id: 'A4', g: 'play', t: 'ais', title: '狀態：做出不同情況', p: '加一個切換鈕，可以看到（剛離院／回診前一天／出現警訊）三種畫面，內容各不同。', done: '三種畫面都點得到' },
    { id: 'A5', g: 'play', t: 'ais', title: '換皮：長輩大字版', p: '改成長輩版本：字放大到至少 18 px，標題 26 px 以上，對比加強，按鈕可點區域至少 56 px 高，內容與順序不要動。', done: '預覽字明顯變大且沒掉字' },
    { id: 'A6', g: 'play', t: 'ais', title: '加功能：傳給家人', p: '加一個「傳給家人」按鈕，按下去顯示一則範例訊息，內容是今天要做的三件事，文字可以複製。', done: '按鈕有反應、訊息可複製' },
    { id: 'A7', g: 'play', t: 'ais', title: '修問題：試用發現的毛病', p: '試用時發現（找不到下次回診日期），請把它放大、放到畫面最上方，其他不要動。', done: '你說得出改之前卡在哪、改之後怎樣' },
    { id: 'F1', g: 'check', t: 'fig', title: '貼回 Figma 做對照', p: '（不是指令）把每一版截圖貼進 Figma，放在原版右邊，用便條寫「這版改了什麼、為什麼」。', done: '一排前後對照，每一版都有便條' },
    { id: 'K1', g: 'check', t: 'free', title: '請 Claude 讀你的畫面列尺寸表', p: '請讀這個 Figma 畫面：（貼上你的 Figma 連結）。列出每個文字的內容、字級與位置，和每個卡片的內距、圓角、顏色。只要讀，不要改。', done: '你有一張尺寸表，可交給 AI Studio 校正' }
  ];

  /* 每個模式讓學生看到什麼；專家＝現在的完整畫面，沒有值或亂填一律專家 */
  function level(v) { v = Number(v); return v === 1 ? 1 : (v === 2 ? 2 : 3); }
  function view(lv) {
    lv = level(lv);
    if (lv === 1) return { lv: 1, name: '新手', oneStep: true, editPrompt: false, pickCards: 1, pickTool: false, checks: 'three', heur: 0 };
    if (lv === 2) return { lv: 2, name: '中級', oneStep: false, editPrompt: true, pickCards: 3, pickTool: true, checks: 'three', heur: 3 };
    return { lv: 3, name: '專家', oneStep: false, editPrompt: true, pickCards: 13, pickTool: true, checks: 'three', heur: 10 };
  }
  function cardsFor(tool) { return CARDS.filter(function (c) { return c.t === tool; }); }
  function cardById(id) { return CARDS.filter(function (c) { return c.id === id; })[0] || null; }
  /* 新手預設挑哪張卡：貼 Claude Design 的第一步是 C1、AI Studio 是 A1 */
  function defaultCard(tool) { var l = cardsFor(tool); return l.length ? l[0].id : ''; }

  function clip(x, n) { return Array.from(String(x == null ? '' : x)).slice(0, n).join(''); }
  function isHttps(u) { return /^https:\/\/[^\s]+$/.test(String(u || '')) && String(u).length <= LIMITS.url; }

  /* 把提案內容組成指令。doc＝PX.normDoc 的結果；evText＝id→{label,text} 的對照（可省略）；opts：{dirName, tool, cardIds, extra} */
  function buildPrompt(doc, evText, opts) {
    opts = opts || {}; evText = evText || {}; doc = doc || { rows: [], dir: {} };
    var tool = (TOOLS.filter(function (t) { return t.k === opts.tool; })[0] || TOOLS[1]);
    var d = doc.dir || {};
    var dirName = opts.dirName || (d.pick === 'mine' ? (d.mine || '我自己的方向') : '') || '';
    var rows = (doc.rows || []).filter(function (r) { return r.decide && (!opts.rowNs || opts.rowNs.indexOf(r.n) >= 0); }).slice(0, 3);
    var L = [];
    L.push('我在做「呼呼醫院」離院衛教的再設計（練習用，內容都是虛構的）。');
    if (dirName) L.push('我選的方向：' + dirName + (d.why ? '。原因：' + clip(d.why, 80) : '。'));
    if (rows.length) {
      L.push('我根據訪談與線索，做了這些設計決定：');
      rows.forEach(function (r, i) {
        var ev = (r.ev || []).slice(0, 2).map(function (id) { var e = evText[id]; return e ? clip(e.label + '：' + e.text, 40) : ''; }).filter(Boolean).join('；');
        L.push((i + 1) + '. ' + clip(r.decide, 60) + (ev ? '（依據：' + ev + '）' : ''));
      });
    }
    var cards = (opts.cardIds || []).map(cardById).filter(function (c) { return c && c.p; });
    if (cards.length) {
      L.push('這次請你這樣做：');
      cards.forEach(function (c, i) { L.push((cards.length > 1 ? (i + 1) + '. ' : '') + c.p); });
    }
    if (opts.extra) L.push(clip(opts.extra, 200));
    if (tool.k === 'ais') L.push('這是純前端的練習：不要使用任何 API、不要呼叫 Gemini 或其他外部服務、不要需要金鑰，資料都寫在畫面裡就好。');
    L.push('不要放任何真人姓名、病歷號或日期；做完請用一兩句話說明你改了哪裡。');
    return { tool: tool.k, toolName: tool.name, where: tool.where, text: L.join('\n') };
  }

  /* 學生貼回來的紀錄：整理成只有規則允許的欄位 */
  var MAXV = 6;
  function emptyVer() { return { links: {}, cards: '', chg: '', chk: { q1: false, q2: false, q3: false }, heur: '', at: 0 }; }
  function emptyProto() { var o = emptyVer(); o.lv = 3; o.vers = {}; return o; }
  function verKeys(p) { return Object.keys((p && p.vers) || {}).filter(function (k) { return /^v[1-6]$/.test(k); }).sort(); }
  /* 迭代要求：新手 0（不用迭代）、中級至少 2 版、專家至少 3 版 */
  function iterReq(lv) { lv = level(lv); return lv === 1 ? 0 : (lv === 2 ? 2 : 3); }
  function normVer(raw) {
    var o = emptyVer(); if (!raw || typeof raw !== 'object') return o;
    var lk = raw.links && typeof raw.links === 'object' ? raw.links : {};
    TOOLS.forEach(function (t) { var x = lk[t.k]; if (x && typeof x === 'object') o.links[t.k] = { url: String(x.url || ''), note: String(x.note || ''), at: Number(x.at) || 0 }; });
    o.cards = String(raw.cards || ''); o.chg = String(raw.chg || ''); o.heur = String(raw.heur || ''); o.at = Number(raw.at) || 0;
    CHK.forEach(function (c) { o.chk[c.k] = !!(raw.chk && raw.chk[c.k]); });
    return o;
  }
  function normProto(raw) {
    var o = normVer(raw); o.lv = level(raw && raw.lv); o.vers = {};
    if (raw && raw.vers && typeof raw.vers === 'object') verKeys(raw).forEach(function (k) { o.vers[k] = normVer(raw.vers[k]); });
    return o;
  }
  function verForWrite(p, now) {
    var o = { links: {}, cards: clip(p.cards, LIMITS.cards), chg: clip(p.chg, LIMITS.chg), chk: { q1: !!p.chk.q1, q2: !!p.chk.q2, q3: !!p.chk.q3 }, heur: clip(p.heur, LIMITS.heur), at: now || p.at || 0 };
    TOOLS.forEach(function (t) { var x = p.links[t.k]; if (x && isHttps(x.url)) o.links[t.k] = { url: x.url, note: clip(x.note, LIMITS.note), at: x.at || now || 0 }; });
    return o;
  }
  /* 把「目前這一版」凍結成第 N 版。條件：有連結、寫了改了什麼、和前一版的「改了什麼」不一樣。成功後，新的一版從空白的「改了什麼」與自檢開始（連結保留，方便換成新作品）。 */
  function freeze(p, now) {
    p = normProto(p); var ks = verKeys(p), n = ks.length + 1;
    if (n > MAXV) return { ok: false, reason: '最多存 ' + MAXV + ' 版' };
    if (!Object.keys(p.links).some(function (k) { return isHttps(p.links[k].url); })) return { ok: false, reason: '這一版還沒有作品連結' };
    if (!p.chg.trim()) return { ok: false, reason: '先寫這一版改了什麼' };
    var prev = ks.length ? p.vers[ks[ks.length - 1]] : null;
    if (prev && prev.chg.trim() === p.chg.trim()) return { ok: false, reason: '「改了什麼」和上一版一樣，這樣不算改過' };
    var fr = verForWrite(p, now); p.vers['v' + n] = fr;
    var next = normProto(p); next.chg = ''; next.chk = { q1: false, q2: false, q3: false }; next.heur = ''; next.at = now || 0;
    return { ok: true, n: n, proto: next };
  }
  function protoForWrite(p, now, lv) {
    p = normProto(p); var o = verForWrite(p, now); o.lv = level(lv != null ? lv : p.lv); o.vers = {};
    verKeys(p).forEach(function (k) { o.vers[k] = verForWrite(p.vers[k], p.vers[k].at); });
    return o;
  }
  /* 這一版夠不夠完整：缺什麼就列什麼（學生看得懂的話） */
  function missing(p, lv) {
    p = normProto(p); var m = [], need = iterReq(lv != null ? lv : p.lv), have = verKeys(p).length;
    if (need && have < need) m.push('這個模式要存到至少 ' + need + ' 版（現在 ' + have + ' 版）：每改一次就按「存成第 N 版」');
    var cur = need && have >= need && !p.chg.trim() && !Object.keys(p.links).length;
    if (!cur) {
      if (!Object.keys(p.links).some(function (k) { return isHttps(p.links[k].url); }) && !have) m.push('還沒貼任何作品連結（要 https 開頭、且已開分享）');
      if (!p.chg.trim() && !have) m.push('還沒寫這一版改了什麼、回應哪一條證據');
      if (!(p.chk.q1 || p.chk.q2 || p.chk.q3) && !have) m.push('三個自檢問題還沒勾');
    }
    return m;
  }
  /* 前面還沒做完的步驟：只提示、不擋人（學生喜歡先動手，想先做原型可以）。
     st＝PX.status 的結果；ctx＝{evidence: 訪談證據張數, cells: 故事板格數}。回傳每一項 {k, text, go}，go 給畫面做「帶我去」。 */
  function prereq(st, ctx) {
    st = st || {}; ctx = ctx || {}; var out = [];
    if (!ctx.evidence) out.push({ k: 'iv', text: '還沒訪談任何人', go: 'game' });
    if (!ctx.cells) out.push({ k: 'sb', text: '還沒排故事板', go: 'story' });
    if (!st.dirOk) out.push({ k: 'dir', text: '還沒選方向、寫為什麼', go: 'dir' });
    if ((st.rowsFilled || 0) < 1) out.push({ k: 'row', text: '對準表還沒寫任何一個設計決定', go: 'rows' });
    return out;
  }
  function stepName(i) { return ['① 挑一張指引卡', '② 複製指令、貼到工具', '③ 把結果貼回來', '④ 自己檢查'][i] || ''; }

  return { MAXV: MAXV, verKeys: verKeys, iterReq: iterReq, freeze: freeze, TOOLS: TOOLS, CARDS: CARDS, CHK: CHK, HEUR: HEUR, LIMITS: LIMITS, level: level, view: view, cardsFor: cardsFor, cardById: cardById, defaultCard: defaultCard, isHttps: isHttps, buildPrompt: buildPrompt, emptyProto: emptyProto, normProto: normProto, protoForWrite: protoForWrite, missing: missing, prereq: prereq, stepName: stepName };
});
