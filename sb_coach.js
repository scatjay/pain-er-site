/* 故事板 AI 助教（前端）。分兩層：
   ①純函式（Node 可測）：級別階梯、whichStep()、問題組裝、答案整理、功能導覽腳本、示範板資料（寫死的虛構案例）。
   ②畫面（只在瀏覽器）：助教面板、聚光燈導覽「教我怎麼用」、示範板「看助教做一次」。
   助教的答案由 tools/sb_coach_worker.py 呼叫 Vertex 後寫回資料庫；導覽與示範是寫死的腳本，不呼叫模型、不花錢、不寫入學生的故事板、不算求助次數。
   本機測試模式（?local=1）沒有後端，助教用固定的示範答案（畫面上會標明）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'));
  else root.ERG_SB_COACH = factory(root.ERG_SB);
})(typeof self !== 'undefined' ? self : this, function (SB) {
  'use strict';
  var esc = SB.esc;

  /* ———— 級別 ———— */
  var LEVELS = [
    { lv: 0, kind: '', name: '自己寫', desc: '不叫助教。' },
    { lv: 1, kind: 'hint', name: '提示', desc: '助教只問你一個問題，指出這格還缺什麼。不扣分。' },
    { lv: 2, kind: 'check', name: '檢查', desc: '助教讀你已經寫的，對照「五個坑」和出處，只告訴你哪裡有問題，不幫你改。不扣分。' },
    { lv: 3, kind: 'pattern', name: '句型示範', desc: '助教用別的案例示範同樣結構的一句，你再換成自己的內容。不扣分。' },
    { lv: 4, kind: 'fill', name: '代填（示範）', desc: '助教照你的訪談把這格寫出來，標成「🤖 助教示範」。這格幾乎不計分。' }
  ];
  var KINDS = ['hint', 'check', 'pattern', 'fill', 'course', 'next'];
  var ASK_MAX = 300;
  function kindOfLevel(lv) { return (LEVELS[lv] || LEVELS[0]).kind; }
  function nextLevel(cl) { cl = Number(cl) || 0; return Math.min(4, cl + 1); }
  function fillAllowed(cells, cfg) { return SB.aiFillCount(cells) < (cfg || SB.CONFIG_DEFAULTS).fillPerBoard; }
  function coachLeft(used, cfg) { return Math.max(0, (cfg || SB.CONFIG_DEFAULTS).coachPerDay - (Number(used) || 0)); }

  /* ———— 「幫我往下一步」：依故事板資料判斷卡在 W8 七步驟的哪一步（規則寫在程式，不交給模型猜） ———— */
  var STEP_TITLES = ['', '進急診室問人', '還原 2 位人物誌', '挑故事片段', '照樣板排 6 格', '找出關鍵時刻', '放圖片', '看缺口回去補訪'];
  /* st：{ interviews: 有填的訪談筆數, keyDone: 病人或家屬問過了嗎, personas: 已還原人物誌數(0-2), cells: 這面板的格子(已 normalize), min: 預設格數 } */
  function whichStep(st) {
    st = st || {}; var cells = (st.cells || []).map(function (c) { return SB.normCell(c, c && c.n); }), min = st.min || SB.LIMITS.defaultCells;
    var filled = cells.filter(SB.hasContent), n = function (x) { return filled.length; };
    function firstEmptySlot() { for (var i = 1; i <= SB.LIMITS.maxCells; i += 1) { var c = cells.filter(function (x) { return x.n === i; })[0]; if (!c || !SB.hasContent(c)) return i; } return 0; }
    if (!st.interviews || st.interviews < 1) return { step: 1, title: STEP_TITLES[1], slot: 0, why: '你還沒有訪談紀錄，故事板要用你問來的內容。先回急診室問一個人。' };
    if (!st.keyDone) return { step: 1, title: STEP_TITLES[1], slot: 0, why: '病人或家屬還沒問過。故事的主角是他們，先回去問。' };
    if ((Number(st.personas) || 0) < 2) return { step: 2, title: STEP_TITLES[2], slot: 0, why: '人物誌還沒還原 2 位（至少 1 位是病人或家屬）。在訪談報告裡按「複製 Persona 框架」貼到 Gemini，還原好後在助教面板記下人數。' };
    if (filled.length === 0) return { step: 3, title: STEP_TITLES[3], slot: 1, why: '還沒有任何一格有內容。先從「素材（我的訪談）」挑一個最有畫面的片段放進第 1 格。' };
    if (filled.length < min) return { step: 4, title: STEP_TITLES[4], slot: firstEmptySlot(), why: '已經寫了 ' + filled.length + ' 格，樣板要 ' + min + ' 格。接著寫第 ' + firstEmptySlot() + ' 格：誰、在哪、發生什麼、他怎麼想。' };
    if (!filled.some(function (c) { return c.moment; })) return { step: 5, title: STEP_TITLES[5], slot: cells.length ? cells[cells.length - 1].n : min, why: '還沒標出關鍵時刻。用一句話寫出主角在哪一刻最卡、為什麼，並勾選「這格是關鍵時刻」。' };
    var noImg = filled.filter(function (c) { return !c.img; })[0];
    if (noImg) return { step: 6, title: STEP_TITLES[6], slot: noImg.n, why: '第 ' + noImg.n + ' 格還沒有圖。先用指令①做主角設定圖，再一格一格生成，放進格子（按「選圖」，電腦也可以直接拖進去）。' };
    var gap = filled.filter(SB.needsSource)[0];
    if (gap) return { step: 7, title: STEP_TITLES[7], slot: gap.n, why: '第 ' + gap.n + ' 格沒有出處。回去再問一個人，或把訪談卡編號放進來。' };
    return { step: 8, title: '都做完了', slot: 0, why: '七步驟都有了。交出去之前，對照「五個坑」逐格檢查一次。' };
  }

  /* ———— 組一則要送給後端的問題（長度在這裡截好，規則也限制 ≤300 字） ———— */
  function buildQuestion(o) {
    o = o || {}; var cur = o.cur || {}, kind = KINDS.indexOf(o.kind) >= 0 ? o.kind : 'hint';
    var q = { kind: kind, level: Math.max(1, Math.min(4, Number(o.level) || 1)), slot: Math.max(0, Math.min(8, Number(o.slot) || 0)), room: String(o.room || '').slice(0, 8), board: String(o.board || 'wall').slice(0, 24), ask: SB.clip(o.ask || '', ASK_MAX), t: Number(o.t) || 0 };
    if (kind === 'fill') q.level = 4; else if (kind === 'hint') q.level = 1; else if (kind === 'check') q.level = 2; else if (kind === 'pattern') q.level = 3;
    if (q.slot) q.cur = { who: SB.clip(cur.who, 24), where: SB.clip(cur.where, 40), what: SB.clip(cur.what, 140), think: SB.clip(cur.think, 140) };
    if (kind === 'next') { q.step = Number(o.step) || 0; q.stepTitle = SB.clip(o.stepTitle || '', 40); q.nextLv = Math.max(1, Math.min(3, Number(o.nextLv) || 1)); }
    return q;
  }
  /* 答案：把 [#編號] 換成可讀的出處標籤，並回傳這次引用了哪些編號 */
  function answerParts(text) {
    var refs = [], t = String(text || '').replace(/\[(#[A-Za-z0-9_-]+-\d+)\]/g, function (m, id) { if (refs.indexOf(id) < 0) refs.push(id); return '〔' + id + '〕'; });
    return { text: t, refs: refs };
  }

  /* ———— 功能導覽：寫死的腳本；sel 是依序嘗試的選擇器（有的才框） ———— */
  var TOUR = [
    { sel: ['.cell .title'], title: '1／8　開一格', text: '每一格有自己的名字（例如「看完診」）。樣板已經幫你排好 6 格，名字可以改；最後一格留給關鍵時刻。' },
    { sel: ['.cell textarea[data-k="what"]'], title: '2／8　寫四欄', text: '每格寫四件事：誰、在哪、發生什麼、他怎麼想。「發生什麼」先寫事實，「他怎麼想」才寫心裡話。打字會自動儲存。' },
    { sel: ['.cell button[data-act="pain"]'], title: '3／8　標紅痛點', text: '在「發生什麼」或「他怎麼想」裡用滑鼠選一段字，再按這顆鈕，那一句會變紅，代表這是他卡住的地方。', mtext: '在「發生什麼」或「他怎麼想」裡長按選一段字（拉兩端的把手調整範圍），再按這顆鈕，那一句會變紅，代表這是他卡住的地方。' },
    { sel: ['.cell select[data-act="addref"]', '.cell .refs'], title: '4／8　填出處', text: '每一格都要對得回你的訪談卡。從這裡選訪談卡編號；沒有出處的格子是猜的，要回去再問。' },
    { sel: ['.cell .imgbar label.btn', '.cell .img'], title: '5／8　放圖片', text: '把 Gemini 生成的圖拖進格子，或按「選圖」。橫的、方的、直的都可以，會照原比例放。每天有上傳張數上限。', mtext: '按格子下面的「選圖」，從相簿挑一張（Gemini 的圖：在 Gemini 長按圖片 → 儲存到相簿）。橫的、方的、直的都可以，會照原比例放。每天有上傳張數上限。' },
    { sel: ['.cell button[data-act="fit"]', '.cell .imgbar'], title: '6／8　換顯示比例', text: '放了圖之後，這顆鈕可以在「完整顯示」和「填滿裁切」之間切換；也可以按「看原圖」。' },
    { sel: ['.cell .gap', '#stats'], title: '7／8　看缺口', text: '格子沒內容或沒出處，會出現粉紅色的提醒和「回去再問一個人」。「這面牆」那一欄會列出這面板的進度和成就。' },
    { sel: ['#printBtn', '#pngBtn'], title: '8／8　交作業', text: '寫好之後：電腦按「另存 PDF 交作業」，在列印視窗選「另存為 PDF」；手機按「下載成圖片」，長按或下載後把圖片交到 flipclass。' }
  ];

  /* ———— 示範板：虛構案例（呼呼醫院、虛構人物），不呼叫模型、不寫入、不計分 ———— */
  function scene(color, label) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="' + color + '"/><circle cx="70" cy="70" r="26" fill="#fff" opacity=".85"/><rect x="48" y="98" width="44" height="56" rx="10" fill="#fff" opacity=".85"/><rect x="130" y="60" width="160" height="94" rx="8" fill="#fff" opacity=".6"/><text x="160" y="170" font-size="14" fill="#1e1e1e" font-family="sans-serif">' + label + '</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  var DEMO_CARDS = [
    { id: '#DEMO-01', who: '護理師小圓', surface: '藥局窗口很多人都在問同一件事。', events: '下午三點叫號螢幕只顯示號碼，阿嬤聽不到叫號就錯過了。', need: '叫號要有聲音，也要有大字。' },
    { id: '#DEMO-02', who: '病人阿福伯', surface: '我一直在等，沒有人跟我說。', events: '他坐在候藥區四十分鐘，手上拿著兩張號碼牌，不知道要看哪一張。', need: '想知道還要等多久。' },
    { id: '#DEMO-03', who: '志工', surface: '常有人拿著繳費單來問藥局在哪。', events: '繳完費的人走到走廊分岔口就停下來張望。', need: '地上要有走到藥局的指示。' }
  ];
  var DEMO_ROWS = [
    { title: '繳完費', who: '阿福伯', where: '繳費櫃台', what: '繳完費拿到兩張號碼牌，不知道哪一張是領藥用的。', think: '好像都一樣，先收起來吧。', refs: ['#DEMO-02'], pain: '不知道哪一張是領藥用的', img: ['#a5d8ff', '繳費櫃台'] },
    { title: '走廊分岔', who: '阿福伯', where: '走廊分岔口', what: '走到分岔口停下來張望，旁邊的人說藥局在左邊。', think: '地上沒有字，只能靠問人。', refs: ['#DEMO-03'], pain: '地上沒有字', img: ['#b2f2bb', '走廊分岔口'] },
    { title: '坐下來等', who: '阿福伯', where: '候藥區', what: '坐了四十分鐘，手上兩張號碼牌，沒有人告訴他還要等多久。', think: '我是不是被漏掉了？', refs: ['#DEMO-02'], pain: '沒有人告訴他還要等多久', img: ['#ffd8a8', '候藥區'] },
    { title: '錯過叫號', who: '阿福伯', where: '叫號螢幕前', what: '螢幕只顯示號碼，叫號的聲音很小，他沒聽到，號碼被跳過去。', think: '明明一直在這裡，怎麼會被跳過。', refs: ['#DEMO-01'], pain: '叫號的聲音很小', img: ['#fcc2d7', '叫號螢幕'] },
    { title: '回去問', who: '阿福伯', where: '藥局窗口', what: '他走去窗口問，護理師說要重新抽號。', think: '我已經等這麼久了還要重來。', refs: ['#DEMO-01', '#DEMO-02'], pain: '還要重來', img: ['#d0bfff', '藥局窗口'] },
    { title: '關鍵時刻', who: '阿福伯', where: '叫號螢幕前', what: '', think: '叫號只靠一個小聲的聲音和一排小字，他不知道自己被漏掉了；所以可以改的是叫號螢幕要同時有大字和聲音，並顯示還要等幾位。', refs: ['#DEMO-01', '#DEMO-02'], pain: '不知道自己被漏掉了', moment: true, img: ['#ffc9c9', '關鍵時刻'] }
  ];
  var DEMO_STEPS = [
    { title: '先讀訪談卡', text: '助教先把這間房的 3 張訪談卡讀一遍，圈出對故事有用的句子。', why: '故事要有根據。沒有讀過訪談，就只能憑感覺寫，格子也沒有出處。', cards: 3, cells: 0 },
    { title: '挑片段', text: '從訪談卡挑出有「後續發展」的片段：阿福伯拿兩張號碼牌、走廊沒有字、叫號太小聲。', why: '好的片段有時間、有動作、有原話，不是空泛的感想。', cards: 3, cells: 0, mark: ['#DEMO-01', '#DEMO-02', '#DEMO-03'] },
    { title: '寫第 1 格四欄＋出處', text: '誰＝阿福伯，在哪＝繳費櫃台，發生什麼、他怎麼想，最後選出處 #DEMO-02。', why: '四欄一起寫，讀的人才看得懂「誰在什麼地方為什麼卡住」；出處讓這格對得回訪談。', cards: 3, cells: 1 },
    { title: '標紅痛點', text: '把「不知道哪一張是領藥用的」選起來，標成紅色。', why: '一格只標最關鍵的一句，紅色才有意義；標太多就看不出重點。', cards: 3, cells: 1, pain: true },
    { title: '寫其他格', text: '依樣板接著寫第 2 到第 5 格：走廊分岔、坐下來等、錯過叫號、回去問。每格都附出處。', why: '每一格只推進一小步，故事才有因果；每格都對得回訪談卡。', cards: 3, cells: 5, pain: true },
    { title: '寫關鍵時刻', text: '第 6 格用一句話寫他最卡的一刻，並接一句「所以可以改的是…」。', why: '關鍵時刻不是「他很無奈」，而是可以動手改的地方：叫號螢幕的大字和聲音。', cards: 3, cells: 6, pain: true },
    { title: '貼主角設定指令、放圖', text: '先用指令①做主角設定圖，之後每一格都貼同一段人物描述再生成，最後放進格子。（這裡的圖是事先做好的示意圖。）', why: '同一段人物描述貼在每一格，畫風和人物才不會一格一個樣；圖裡不放文字。', cards: 3, cells: 6, pain: true, imgs: true, prompt: '畫一位【70 歲、微胖、戴毛帽、穿深藍夾克】的人物，正面與側面各一，【簡單的繪本風】，白底，不要任何文字。' },
    { title: '檢查五個坑', text: '助教對照五個坑逐一檢查，這張板都有過關。', why: '交出去之前自己先檢查一次，比交出去被指出來好。', cards: 3, cells: 6, pain: true, imgs: true, check: [['結局不是「努力就成功」', true], ['關鍵時刻後面接了「所以可以改的是…」', true], ['每格貼同一段人物描述', true], ['圖裡沒有交給 AI 的文字', true], ['人物與場景跟人物誌對得上', true]] }
  ];
  /* 第 i 步當下的畫面資料（純函式；示範板只讀這個） */
  function demoStateAt(i) {
    i = Math.max(0, Math.min(DEMO_STEPS.length - 1, i)); var d = DEMO_STEPS[i];
    var cells = DEMO_ROWS.slice(0, d.cells).map(function (r, k) {
      return { n: k + 1, title: r.title, who: r.who, where: r.where, what: r.what, think: r.think, refs: r.refs.slice(), pain: d.pain ? r.pain : '', moment: !!r.moment && i >= 5, img: d.imgs ? scene(r.img[0], r.img[1]) : '' };
    });
    return { step: i, total: DEMO_STEPS.length, title: d.title, text: d.text, why: d.why, cards: DEMO_CARDS.slice(0, d.cards), mark: d.mark || [], cells: cells, prompt: d.prompt || '', check: d.check || null };
  }

  /* ———— 本機測試用的固定答案（不呼叫模型） ———— */
  function localStub(q, ctx) {
    ctx = ctx || {}; var id = (ctx.firstRef || '#你的訪談卡'), t;
    if (q.kind === 'hint') t = '這格還缺一個「在哪」。你的訪談卡 [' + id + '] 有提到場景嗎？先找找看。';
    else if (q.kind === 'check') t = '我看了你寫的：這格沒有出處，「他怎麼想」也還是空的。對照訪談卡 [' + id + '] 補上。';
    else if (q.kind === 'pattern') t = '（別的案例的句型）「他站在叫號螢幕前，連按了三次重新整理，還是不知道輪到誰」。你可以套成「他在【哪裡】【做了什麼動作】，還是【卡在哪】」。';
    else if (q.kind === 'next') t = '你現在卡在「' + (q.stepTitle || '下一步') + '」。先做這一件事就好。';
    else if (q.kind === 'course') t = '（本機測試用的固定答案）這個問題線上版助教才會回答，課程內容在各週學習單。';
    else t = '';
    var out = { text: t, refs: [id].filter(function (x) { return /^#.+-\d+$/.test(x); }), kind: q.kind, model: 'local-stub', ok: true };
    if (q.kind === 'fill' && ctx.fill) { out.fill = ctx.fill; out.text = '我照你的訪談先寫了一個示範，請改成你自己的話。'; }
    return out;
  }

  var pure = { LEVELS: LEVELS, KINDS: KINDS, ASK_MAX: ASK_MAX, STEP_TITLES: STEP_TITLES, TOUR: TOUR, DEMO_STEPS: DEMO_STEPS, DEMO_CARDS: DEMO_CARDS, DEMO_ROWS: DEMO_ROWS,
    kindOfLevel: kindOfLevel, nextLevel: nextLevel, fillAllowed: fillAllowed, coachLeft: coachLeft, whichStep: whichStep, buildQuestion: buildQuestion, answerParts: answerParts, demoStateAt: demoStateAt, localStub: localStub };
  if (typeof document === 'undefined') return pure;

  /* ═════════ 畫面（瀏覽器） ═════════ */
  var $ = function (id) { return document.getElementById(id); };
  var applyOnce = {}, A = null, LOG = [], pending = {}, nextCount = {}, offAns = null, ansCache = {};

  function ctxHelp() { return { firstRef: ((A.S.frags || [])[0] || {}).recId }; }
  function injectCss() {
    if ($('coachCss')) return; var st = document.createElement('style'); st.id = 'coachCss';
    st.textContent = '#coachBox .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}#coachBox textarea{min-height:44px}#coachBox .bub{border:2px solid var(--ink);border-radius:10px;padding:6px 8px;margin:6px 0;font-size:13px;background:var(--panel)}' +
      '#coachBox .bub.q{background:var(--soft-y)}#coachBox .bub.err{background:var(--soft-r)}#coachBox .meta{font-size:11px;color:var(--muted)}.ai-badge{background:var(--soft-r);border:2px solid var(--ink);border-radius:99px;padding:0 8px;font-size:12px;font-weight:700}' +
      '.cbtn.armed{background:var(--pop)}#tourMask{position:fixed;z-index:50;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);pointer-events:none;transition:all .25s}#tourTip{position:fixed;z-index:51;max-width:340px;background:var(--panel);color:var(--fg);border:3px solid var(--ink);border-radius:10px;padding:10px 14px;box-shadow:6px 6px 0 var(--ink)}' +
      '#demo{position:fixed;inset:0;z-index:40;background:var(--bg);overflow:auto;padding:12px}#demo .wrap{max-width:1100px;margin:0 auto}#demo .dc{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}#demo .dcell{background:var(--panel);border:3px solid var(--ink);border-radius:10px;padding:8px;font-size:13px}' +
      '#demo .dcell.moment{background:var(--soft-r)}#demo .dcell img{width:100%;height:110px;object-fit:contain;background:#eef;border-radius:6px}#demo .why{background:var(--soft-y);border:2px dashed var(--ink);border-radius:10px;padding:6px 10px;margin:6px 0}#demo .card{margin:8px 0}';
    document.head.appendChild(st);
  }

  /* 面板 */
  function render() {
    if (!A) return; if (Object.keys(ansCache).length) tryApply(); var S = A.S, cfg = S.cfg, left = coachLeft(S.coachUsed, cfg), box = $('coachBox'); if (!box) return;
    var step = whichStep(stepState());
    var html = '<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">🤖 助教</h2><button class="mini only-m" id="cClose">收起 ▾</button></div><div class="muted">只看得到<b>你自己</b>的訪談；每句附出處，沒有就叫你回去問。' + (A.local ? '<br><b>本機測試：固定示範答案，不呼叫模型。</b>' : '') + '</div>' +
      '<div class="row"><button class="mini" id="cNext">🧭 幫我往下一步</button><button class="mini" id="cTour">教我怎麼用</button><button class="mini" id="cDemo">🎬 看助教做一次</button></div>' +
      '<div class="meta">現在卡在：第 ' + step.step + ' 步「' + esc(step.title) + '」。今天還能問助教 <b id="cLeft">' + left + '</b> 次（含提示與課程問答）。</div>' +
      '<label>我已經還原的人物誌：<select id="cPersonas" style="width:auto"><option value="0">0 位</option><option value="1">1 位</option><option value="2">2 位以上</option></select></label>' +
      '<label>問整門課（≤' + ASK_MAX + ' 字）<textarea id="cAsk" maxlength="' + ASK_MAX + '" placeholder="例如：嚴重性評分怎麼打？人物誌和故事板差在哪？"></textarea></label><div class="row"><button class="mini" id="cCourse">問</button></div>' +
      '<div id="cLog">' + LOG.slice(-8).map(bubble).join('') + '</div>';
    if (box.dataset.sig !== html) { var ta = $('cAsk'), keep = ta ? ta.value : '', st0 = box.scrollTop, atEnd = st0 > 0 && st0 + box.clientHeight >= box.scrollHeight - 8; box.innerHTML = html; box.scrollTop = atEnd ? box.scrollHeight : st0;   /* 換內容會把抽屜捲回最上面：保留原本位置（原本在最底就留在最底） */ box.dataset.sig = html; if ($('cAsk')) $('cAsk').value = keep; if ($('cPersonas')) $('cPersonas').value = String(Math.min(2, Number(S.personas) || 0)); bind(); }
  }
  function bubble(m) {
    if (m.q) return '<div class="bub q"><div class="meta">我問（' + esc(m.label) + (m.slot ? '・第 ' + m.slot + ' 格' : '') + '）</div>' + esc(m.ask || '') + '</div>';
    var parts = answerParts(m.text);
    return '<div class="bub' + (m.ok === false ? ' err' : '') + '"><div class="meta">🤖 助教' + (m.model === 'local-stub' ? '（固定示範答案）' : '') + (m.slot ? '・第 ' + m.slot + ' 格' : '') + '</div>' + esc(parts.text).replace(/\n/g, '<br>') +
      (m.pendingFill ? '<div class="meta">已填進第 ' + m.slot + ' 格，標成「🤖 助教示範」。</div>' : '') + '</div>';
  }
  function stepState() {
    var S = A.S, recs = SB.arr(S.player && S.player.interviews).filter(SB.filled);
    return { interviews: recs.length, keyDone: recs.some(function (r) { return r.personaId === 'patient' || r.personaId === 'family'; }), personas: S.personas, cells: A.cur(), min: SB.LIMITS.defaultCells };
  }
  function pushLog(m) { LOG.push(m); if (LOG.length > 40) LOG.shift(); render(); }

  /* 送出一則問題（本機：直接給固定答案；線上：先搶名額再寫 q，等後端回 a） */
  function ask(o) {
    var S = A.S, cfg = S.cfg, label = o.label || (LEVELS[o.level || 1] || LEVELS[1]).name;
    if (coachLeft(S.coachUsed, cfg) <= 0) { A.toast('今天助教的名額用完了（每人每天 ' + cfg.coachPerDay + ' 次），明天 00:00 再問。'); return Promise.resolve(null); }
    if (o.kind === 'fill' && !fillAllowed(A.cur(), cfg)) { A.toast('這張故事板最多代填 ' + cfg.fillPerBoard + ' 格，其他格自己寫寫看。'); return Promise.resolve(null); }
    var q = buildQuestion({ kind: o.kind, level: o.level, slot: o.slot, room: A.code, board: A.S.boardName === 'me' ? 'u_' + S.sid : 'wall', ask: o.ask, cur: o.cur, step: o.step, stepTitle: o.stepTitle, nextLv: o.nextLv, t: Date.now() });
    pushLog({ q: true, label: label, slot: q.slot, ask: q.ask || (o.kind === 'next' ? '幫我往下一步' : '') });
    if (A.local) {
      S.coachUsed += 1; var fill = null;
      if (q.kind === 'fill') { var d = SB.makeDraft(S.caseId, SB.arr(S.player.interviews), { names: A.pnames(), count: 8 }), dc = d.cells.filter(function (c) { return c.n === q.slot; })[0]; if (dc && SB.hasContent(dc)) fill = { who: dc.who, where: dc.where, what: dc.what, think: dc.think, refs: dc.refs }; }
      var a = localStub(q, { firstRef: ((S.frags || [])[0] || {}).recId, fill: fill }); a.slot = q.slot;
      setTimeout(function () { onAnswer(q.t, q, a); }, 350); return Promise.resolve(q.t);
    }
    return A.store.reserveCoach(S.sid, cfg).then(function (r) {
      if (!r.ok) { A.toast('今天助教的名額用完了。'); return null; }
      var key = String(q.t); pending[key] = q;
      return A.store.putCoachQ(S.sid, key, q).then(function () { return key; });
    }, function (e) { A.toast('助教現在連不上：' + (e && e.message)); return null; });
  }
  function onAnswer(key, q, a) {
    var S = A.S; if (!q) return; delete pending[key];
    var text = a.text || (a.ok === false ? '助教現在忙不過來，稍後再試。' : '（沒有內容）');
    var m = { q: false, text: text, ok: a.ok !== false, slot: q.slot, model: a.model || '' };
    if (q.kind === 'fill' && a.fill && q.slot) {
      var empty = !a.fill.what && !a.fill.think;
      if (empty) { m.text = (a.text || '訪談裡還沒有足夠的內容可以寫這一格。') + ' 先回去再問一個人。'; }
      else { m.pendingFill = true; ansCache[key] = Object.assign({ kind: 'fill', ok: true, at: Date.now(), room: A.code, board: q.board, slot: q.slot }, a); }
    } else if (q.slot && ['hint', 'check', 'pattern'].indexOf(q.kind) >= 0) A.commitCl(q.slot, q.level);
    pushLog(m); tryApply(); revealDrawer();
  }
  /* 手機：答案到了而抽屜是收起的，就自動打開（不然學生看不到答案） */
  function revealDrawer() { try { if (window.matchMedia && window.matchMedia('(max-width:860px)').matches) { if (!document.body.classList.contains('coach-open')) document.body.classList.add('coach-open'); var b = $('coachBox'); if (b) b.scrollTop = b.scrollHeight; } } catch (e) {} }   /* 小螢幕抽屜裝不下整個面板：捲到最底，讓剛到的答案在畫面上 */
  /* 代填答案套進格子：只套「十分鐘內、這間房、目前看的這面板、這格還是空的而且沒代填過」的答案（重新整理後答案才到、或切了面板，也都不會重複或套錯地方） */
  function tryApply() {
    var S = A.S, board = S.boardName === 'me' ? 'u_' + S.sid : 'wall';
    Object.keys(ansCache).sort().forEach(function (k) {
      var a = ansCache[k]; if (!a || a.kind !== 'fill' || !a.ok || !a.fill || !(a.fill.what || a.fill.think) || a.room !== A.code || a.board !== board || !a.slot) return;
      if (Date.now() - (Number(a.at) || 0) > 600000) return;
      var c = A.cellFor(a.slot).c; if (c.aiText || SB.hasContent(c)) { delete ansCache[k]; return; }
      if (!fillAllowed(A.cur(), S.cfg)) return;
      delete ansCache[k]; A.commitFill(a.slot, a.fill);
    });
  }

  /* 面板按鈕 */
  function bind() {
    var S = A.S;
    $('cNext').onclick = function () {
      var st = whichStep(stepState()), k = 'step' + st.step; nextCount[k] = (nextCount[k] || 0) + 1;
      if (A.local || true) pushLog({ q: false, text: '第 ' + st.step + ' 步：' + st.title + '。' + st.why, ok: true, slot: st.slot, model: A.local ? '' : 'rule' });
      ask({ kind: 'next', level: 1, slot: st.slot, step: st.step, stepTitle: st.title, nextLv: Math.min(3, nextCount[k]), ask: '', label: '幫我往下一步', cur: curOf(st.slot) });
    };
    $('cTour').onclick = startTour; $('cDemo').onclick = startDemo;
    $('cCourse').onclick = function () { var v = $('cAsk').value.trim(); if (!v) { A.toast('先寫下你想問的問題'); return; } ask({ kind: 'course', level: 1, slot: 0, ask: v, label: '課程問答' }).then(function () { $('cAsk').value = ''; }); };
    $('cPersonas').onchange = function () { S.personas = Number($('cPersonas').value) || 0; A.setPersonas(S.personas); render(); };
  }
  function curOf(n) { if (!n) return {}; var c = A.cellFor(n).c; return { who: c.who, where: c.where, what: c.what, think: c.think }; }

  /* 每格的「卡住了」按鈕（sb_ui 在格子裡放 <button data-coach="n">，這裡接事件） */
  function cellHelp(n, btn) {
    var c = A.cellFor(n).c, lv = nextLevel(c.cl);
    if (Object.keys(pending).some(function (k) { return pending[k].slot === n && Date.now() - (pending[k].t || 0) < 120000; })) { A.toast('助教還在想這一格上一個問題，等它回答再按。'); return; }
    if (c.aiText) { A.toast('這格已經是助教示範了，改寫超過六成就變回自己的。'); return; }
    if (lv === 4) {
      if (SB.hasContent(c)) { A.toast('這格已經有你寫的內容，代填只用在空格（不會蓋掉你寫的）。要代填請先把這格清空，或換一個空格。'); return; }
      if (!fillAllowed(A.cur(), A.S.cfg)) { A.toast('這張故事板最多代填 ' + A.S.cfg.fillPerBoard + ' 格，其他格自己寫寫看。'); return; }
      A.twoStep(btn, 'coachfill' + n, function () { ask({ kind: 'fill', level: 4, slot: n, ask: '', cur: curOf(n), label: '代填（示範）' }); }, '代填的格子幾乎不計分，再按一次確定');
      return;
    }
    ask({ kind: kindOfLevel(lv), level: lv, slot: n, ask: '', cur: curOf(n), label: LEVELS[lv].name });
  }
  function cellBtnLabel(c) {
    if (c.aiText) return c.er && c.er.band === 'ai' ? '🤖 助教示範（改寫超過六成才算你的）' : '♻️ 已改成自己的';
    var lv = nextLevel(c.cl); return '🆘 卡住了（先試：' + LEVELS[lv].name + (lv === 4 ? '，幾乎不計分' : '，不扣分') + '）';
  }

  /* ———— 聚光燈導覽 ———— */
  var tour = null;
  function startTour() {
    document.body.classList.remove('coach-open'); stopDemo(); tour = { i: 0 }; showTour();
  }
  function endTour() { tour = null;['tourMask', 'tourTip'].forEach(function (id) { var e = $(id); if (e && e.parentNode) e.parentNode.removeChild(e); }); }
  function findTarget(sels) { for (var i = 0; i < sels.length; i += 1) { var e = document.querySelector(sels[i]); if (e && e.getBoundingClientRect().width > 0) return e; } return null; }
  function showTour() {
    if (!tour) return; var st = TOUR[tour.i]; if (!st) { endTour(); A.toast('導覽完成，隨時可以重看。'); return; }
    var el = findTarget(st.sel); if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' in window ? 'auto' : 'auto' });
    var r = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2 - 80, top: window.innerHeight / 2 - 30, width: 160, height: 60 };
    var mask = $('tourMask') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tourMask' }));
    mask.style.cssText = 'left:' + (r.left - 6) + 'px;top:' + (r.top - 6) + 'px;width:' + (r.width + 12) + 'px;height:' + (r.height + 12) + 'px';
    var tip = $('tourTip') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tourTip' }));
    var touch = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);   /* 手機版說法（長按、選圖），跟 sb_ui 判斷手機的方式一樣 */
    tip.innerHTML = '<b>' + esc(st.title) + '</b><div style="margin:6px 0">' + esc(touch && st.mtext ? st.mtext : st.text) + '</div><div class="row" style="display:flex;gap:6px"><button class="mini" id="tPrev"' + (tour.i === 0 ? ' disabled' : '') + '>上一步</button><button class="mini" id="tNext">' + (tour.i === TOUR.length - 1 ? '完成' : '下一步') + '</button><button class="mini" id="tEnd">離開</button></div>' + (el ? '' : '<div class="meta">（這一步的按鈕現在畫面上還沒有，先看說明就好）</div>');
    var top = r.top + r.height + 16; if (top + 160 > window.innerHeight) top = Math.max(8, r.top - 170);
    tip.style.top = top + 'px'; tip.style.left = Math.max(8, Math.min(window.innerWidth - 360, r.left)) + 'px';
    $('tNext').onclick = function () { tour.i += 1; showTour(); }; $('tPrev').onclick = function () { tour.i = Math.max(0, tour.i - 1); showTour(); }; $('tEnd').onclick = endTour;
    if (el) { var once = function () { el.removeEventListener('click', once, true); if (tour && TOUR[tour.i] === st) setTimeout(function () { if (tour && TOUR[tour.i] === st) { tour.i += 1; showTour(); } }, 150); }; el.addEventListener('click', once, true); }
  }

  /* ———— 示範板 ———— */
  var demo = null, demoTimer = null;
  function stopDemo() { clearInterval(demoTimer); demoTimer = null; var d = $('demo'); if (d && d.parentNode) d.parentNode.removeChild(d); demo = null; }
  function startDemo() { document.body.classList.remove('coach-open'); endTour(); demo = { i: 0, play: false }; var d = document.createElement('div'); d.id = 'demo'; document.body.appendChild(d); drawDemo(); }
  function drawDemo() {
    if (!demo) return; var st = demoStateAt(demo.i), d = $('demo');
    d.innerHTML = '<div class="wrap"><div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h1 style="margin:0">🎬 看助教做一次</h1><span class="ai-badge">示範板・虛構案例・不計分・不會寫進你的故事板</span><span style="flex:1"></span><button class="mini" id="dTake">自己接手（回到我的板）</button></div>' +
      '<div class="card"><b>第 ' + (st.step + 1) + '／' + st.total + ' 步：' + esc(st.title) + '</b><div>' + esc(st.text) + '</div><div class="why"><b>為什麼這樣做：</b>' + esc(st.why) + '</div>' +
      '<div class="row" style="display:flex;gap:6px"><button class="mini" id="dPrev"' + (demo.i === 0 ? ' disabled' : '') + '>上一步</button><button class="mini" id="dPlay">' + (demo.play ? '暫停' : '自動播放') + '</button><button class="mini" id="dNext"' + (demo.i === st.total - 1 ? ' disabled' : '') + '>下一步</button></div></div>' +
      '<div class="card"><b>訪談卡（呼呼醫院・虛構）</b>' + st.cards.map(function (c) { return '<div class="dcell' + (st.mark.indexOf(c.id) >= 0 ? ' moment' : '') + '" style="margin:6px 0"><b>' + esc(c.id) + '　' + esc(c.who) + '</b>　他一開始說：' + esc(c.surface) + '　那天：' + esc(c.events) + '　需要：' + esc(c.need) + '</div>'; }).join('') + '</div>' +
      (st.prompt ? '<div class="card"><b>主角設定指令（①，空格已填成示範內容）</b><div class="why">' + esc(st.prompt) + '</div></div>' : '') +
      (st.check ? '<div class="card"><b>五個坑檢查</b>' + st.check.map(function (c) { return '<div>' + (c[1] ? '✓ ' : '✗ ') + esc(c[0]) + '</div>'; }).join('') + '</div>' : '') +
      '<div class="dc">' + st.cells.map(function (c) {
        var pain = c.pain ? SB.splitPain(c.what + (c.what ? '' : '') , c.pain).map(function (s) { return s.pain ? '<mark class="pain">' + esc(s.t) + '</mark>' : esc(s.t); }).join('') : esc(c.what);
        var think = c.pain && c.think.indexOf(c.pain) >= 0 ? SB.splitPain(c.think, c.pain).map(function (s) { return s.pain ? '<mark class="pain">' + esc(s.t) + '</mark>' : esc(s.t); }).join('') : esc(c.think);
        return '<div class="dcell' + (c.moment ? ' moment' : '') + '"><b>' + c.n + '　' + esc(c.title) + (c.moment ? '　★關鍵時刻' : '') + '</b>' + (c.img ? '<img alt="示意圖" src="' + c.img + '">' : '') + '<div>誰：' + esc(c.who) + '　在哪：' + esc(c.where) + '</div><div>發生什麼：' + pain + '</div><div>他怎麼想：' + think + '</div><div class="meta">出處：' + esc(c.refs.join('、')) + '</div></div>';
      }).join('') + '</div></div>';
    $('dPrev').onclick = function () { demo.i = Math.max(0, demo.i - 1); drawDemo(); };
    $('dNext').onclick = function () { demo.i = Math.min(st.total - 1, demo.i + 1); drawDemo(); };
    $('dPlay').onclick = function () { demo.play = !demo.play; clearInterval(demoTimer); if (demo.play) demoTimer = setInterval(function () { if (demo.i >= st.total - 1) { demo.play = false; clearInterval(demoTimer); drawDemo(); return; } demo.i += 1; drawDemo(); }, 6000); drawDemo(); };
    $('dTake').onclick = stopDemo;
  }

  /* ———— 掛載（sb_ui 呼叫） ———— */
  function mount(api) {
    A = api; injectCss(); render();
    if (!A.local && A.store.watchCoachAnswers && !offAns) offAns = A.store.watchCoachAnswers(A.S.sid, function (ans) {
      Object.keys(ans).sort().forEach(function (k) { if (pending[k]) onAnswer(k, pending[k], ans[k]); else if (ans[k] && ans[k].kind === 'fill' && ans[k].ok && !ansCache[k] && !applyOnce[k]) { ansCache[k] = ans[k]; applyOnce[k] = 1; } });
      tryApply();
    });
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-coach]'); if (b) cellHelp(Number(b.dataset.coach), b); });
  }
  pure.mount = mount; pure.render = render; pure.cellBtnLabel = cellBtnLabel; pure.startTour = startTour; pure.startDemo = startDemo; pure.endTour = endTour; pure.stopDemo = stopDemo; pure._ask = ask;
  return pure;
});
