/* 步驟助教的畫面層（純函式：回傳 HTML 字串、改面板狀態，不碰 DOM、不連網、不寫 Firebase），Node 可測。
   提案室「原型工作台」（proposal_proto_ui.js）負責把這些字串放進頁面、把點擊轉成 act()/setField()。
   次數只存本機（localStorage，見 loadCounts/saveCounts），不寫資料庫。
   瀏覽器全域：FigAIUI（要先載入 figai_coach.js 的 FigCoach）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./figai_coach.js'));
  else root.FigAIUI = factory(root.FigCoach);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function modeOf(lv) { return lv === 1 ? 'novice' : (lv === 2 ? 'mid' : 'expert'); }
  var AREA = { prompt1: 1, prompt2: 1, fixPrompt: 1, summary: 1, blocks: 1, inter: 1, states: 1, screens: 1, promptA: 1, promptB: 1, mapping: 1, changelog: 1, rules: 1, screensX: 1, promptX: 1, cmp: 1, heur: 1, verX: 1, trialX: 1 };
  var CHECK = { copied: '我複製到自己的草稿了', chg1: '改了標題', chg2: '改了一句引導的話', chg3: '危險訊息挪到最上面', ans1: '這句話有告訴人現在該做什麼', ans2: '看到的人知道做完會怎樣', ans3: '危險訊息一眼看得到',
    exported: '我匯出 PNG 了', confirmed1: '我確認這段指令', sent1: '我附上圖並送出了', confirmed2: '我確認這段指令', c1: '每一句話都在畫面上', c2: '字的大小、間距像 Figma', c3: '按鈕結果和我寫的一樣', c4: '只有練習資料',
    saved: '成功的指令我存起來了', share1: 'Figma 連結已開分享', share2: 'AI Studio 連結已開分享' };
  var LABEL = { n1a: '流程幾步', n1b: '引導的句子幾句', prompt1: '第一段指令（助教填好，確認後才能複製）', opt: '互動選項', prompt2: '第二段指令', missing: '缺少的字', fixPrompt: '救火指令', secs: '秒數', taps: '點擊數', stopAt: '停在哪一句',
    summary: '這一版做了什麼', blocks: '區塊', inter: '互動', states: '狀態', screens: '畫面清單', promptA: '第一段指令', calib: '校正方式', promptB: '這一段指令', featN: '這一段加了幾個功能', mapping: '對應訪談的哪一句',
    versions: '版本數', changelog: '每一版改了什麼', rules: '設計規則檔（DESIGN.md）', screensX: '畫面（名稱|色碼|字級|間距，一行一個）', promptX: '給 AI Studio 的指令', cmp: '一致性比對表',
    heur: '啟發式十項（序號|符合/不符合/不適用|輕微/中等/嚴重|理由）', verX: '版本（改了什麼|依據|結果）', trialX: '試用紀錄' };

  /* ———— 面板狀態 ———— */
  function create(lv) { lv = lv === 1 || lv === 2 ? lv : 3; return { lv: lv, S: C.newState(modeOf(lv)), step: 1, log: [], askStuck: false, item: 1, note: '' }; }
  /* 模式變了就重開一個面板，並提醒（母線決定：學生可自己切，切換時畫面提醒）；沒變就原樣回傳 */
  function ensure(p, lv) {
    lv = lv === 1 || lv === 2 ? lv : 3;
    if (p && p.lv === lv) return p;
    var q = create(lv); if (p) q.note = '換模式後助教提示會不同；已填的內容這個面板不會帶過來。';
    if (lv === 1) say(q, C.enter(q.S, 1));
    return q;
  }
  function say(p, r) { if (r && r.text) p.log.push({ text: r.text, warn: !r.ok, lv: r.level || 0 }); return r; }
  function setField(p, k, v) { C.edit(p.S, k, v); }
  function quotaLeft(p) { return Math.max(0, C.COACH_PER_DAY - C.quotaUsed(p.S)); }

  /* 按鈕：d＝{ a: 動作, ... }。回傳 true 表示畫面要重畫 */
  function act(p, d) {
    var S = p.S, r;
    switch (d.a) {
      case 'step': p.step = Math.max(1, Math.min(C.STEPS[S.mode].length, Number(d.n) || 1)); p.askStuck = false; if (S.mode !== 'expert') say(p, C.enter(S, p.step)); return true;
      case 'next': say(p, C.next(S, p.step)); return true;
      case 'stuck': p.askStuck = true; say(p, C.stuck(S, p.step)); return true;
      case 'choice': p.askStuck = false; say(p, C.stuck(S, p.step, d.k)); return true;
      case 'lv': say(p, C.level(S, p.step, Number(d.n), { item: p.item })); return true;
      case 'item': p.item = Number(d.n) || 1; say(p, C.level(S, 7, 3, { item: p.item })); return true;
      case 'sent': S.f.sent1 = true; say(p, C.sent(S)); return true;
      case 'idle': say(p, C.idle(S, p.step, Number(d.n) || 5)); return true;
      case 'review': r = C.review(S, d.k); if (r.comments) r.comments.forEach(function (t) { p.log.push({ text: t, warn: false, lv: 0 }); }); else say(p, r); return true;
      case 'confirm': C.confirm(S, d.k); p.log.push({ text: '已確認，可以複製了。', warn: false, lv: 0 }); return true;
      case 'copy': r = C.copy(S, d.k); return r;   /* 呼叫端看 r.ok 決定要不要真的寫剪貼簿 */
    }
    return false;
  }

  /* ———— HTML ———— */
  function field(p, k) {
    var S = p.S, v = S.f[k] === undefined ? '' : S.f[k], tag = S.ai[k] ? ' <span class="fg-tag">🤖 助教示範</span>' : '', cls = S.ai[k] ? 'fg-ai' : '';
    if (CHECK[k]) return '<label class="fg-l"><input type="checkbox" data-ff="' + k + '"' + (S.f[k] ? ' checked' : '') + '> ' + esc(CHECK[k]) + '</label>';
    if (k === 'opt') return '<label class="fg-l">' + esc(LABEL[k]) + '<select data-ff="opt"><option value="">請選</option><option value="1"' + (v == 1 ? ' selected' : '') + '>點整行的選項換說明</option><option value="2"' + (v == 2 ? ' selected' : '') + '>回診提醒開關</option><option value="3"' + (v == 3 ? ' selected' : '') + '>展開／收起</option></select></label>';
    if (k === 'calib') return '<label class="fg-l">' + esc(LABEL[k]) + '<select data-ff="calib"><option value="">請選</option><option value="claude"' + (v === 'claude' ? ' selected' : '') + '>用 Claude 取尺寸表</option><option value="manual"' + (v === 'manual' ? ' selected' : '') + '>自己手抄</option></select></label>';
    if (AREA[k]) return '<label class="fg-l">' + esc(LABEL[k] || k) + tag + '<textarea class="' + cls + '" rows="4" data-ff="' + k + '">' + esc(v) + '</textarea></label>' +
      (S.ai[k] && /^prompt|^fix/.test(k) ? '<div class="fg-row"><button data-fg="confirm" data-k="' + k + '">確認這段指令</button><button data-fg="copy" data-k="' + k + '">複製</button></div>' : '');
    return '<label class="fg-l">' + esc(LABEL[k] || k) + tag + '<input type="text" class="' + cls + '" data-ff="' + k + '" value="' + esc(v) + '"></label>';
  }
  function gateOf(p, n) { return C.GATES[p.S.mode][n]; }
  function render(p) {
    var S = p.S, STP = C.STEPS[S.mode], g = gateOf(p, p.step), M = C.FILL_CAP[S.mode], av = (C.AVAIL[S.mode] || {})[p.step] || [];
    var h = '<div class="fg-box"><div class="fg-h">🤖 步驟助教（' + esc(C.MODES[S.mode].name) + '）</div>';
    if (p.note) h += '<div class="fg-note">' + esc(p.note) + '</div>';
    h += '<div class="fg-steps">' + STP.map(function (s) { return '<button data-fg="step" data-n="' + s.n + '" class="' + (p.step === s.n ? 'on' : '') + '">' + s.n + '. ' + esc(s.title) + '<small>第 ' + gateOf(p, s.n).join('、') + ' 關：' + esc(gateOf(p, s.n).map(function (x) { return C.GATE_NAME[x]; }).join('、')) + '</small></button>'; }).join('') + '</div>';
    h += '<div class="fg-h2">第 ' + g.join('、') + ' 關：' + esc(g.map(function (x) { return C.GATE_NAME[x]; }).join('、')) + '　／　步驟 ' + p.step + '：' + esc(STP[p.step - 1].title) + '</div>';
    h += STP[p.step - 1].fields.map(function (k) { return field(p, k); }).join('');
    var b = '';
    if (S.mode === 'expert') b = ['rules', 'screens', 'heur', 'ver'].map(function (t) { return '<button data-fg="review" data-k="' + t + '">請助教評語：' + { rules: '規則檔', screens: '畫面', heur: '自評', ver: '版本' }[t] + '</button>'; }).join('') + '<button data-fg="lv" data-n="1">方向</button>';
    else {
      b = '<button data-fg="next">下一步檢查</button><button data-fg="stuck">我卡住了</button>';
      [1, 2, 3, 4].forEach(function (l) { if (av.indexOf(l) >= 0) b += '<button data-fg="lv" data-n="' + l + '">' + C.LEVEL_NAME[l] + '</button>'; });
      if (S.mode === 'novice' && p.step === 5) b += '<button data-fg="sent">我送出了</button>';
      if (S.mode === 'novice' && p.step === 7) b += [1, 2, 3, 4].map(function (i) { return '<button data-fg="item" data-n="' + i + '">第 ' + i + ' 項沒過</button>'; }).join('');
      if (p.askStuck && (C.STUCK[S.mode] || {})[p.step]) { var tb = C.STUCK[S.mode][p.step]; b += '<div class="fg-ask">卡在哪？</div>' + Object.keys(tb).map(function (k) { return '<button data-fg="choice" data-k="' + k + '">' + esc(tb[k][0]) + '</button>'; }).join(''); }
    }
    h += '<div class="fg-row">' + b + '</div>';
    h += '<div class="fg-muted">' + (S.mode === 'expert' ? '專家：交出後助教給評語，不給做法。' : '今天還能問助教 ' + quotaLeft(p) + ' 次（我卡住了、再多一點、代填各算 1 次）；代填 ' + S.fillsDone + '／' + M + '。') + '</div>';
    h += p.log.slice(-5).map(function (m) { return '<div class="fg-bub' + (m.warn ? ' warn' : '') + '"><b>🤖 助教' + (m.lv ? '・' + C.LEVEL_NAME[m.lv] : '') + '</b>：' + esc(m.text).replace(/\n/g, '<br>') + '</div>'; }).join('');
    return h + '</div>';
  }

  /* ———— 五關進度條與第 1 關起點區塊（P＝ERG_PROTO） ———— */
  function gateBar(P, cur) {
    return '<div class="pt-gates" role="group" aria-label="五關">' + P.GATES.map(function (g) { return '<button class="pt-gate' + (cur === g.n ? ' on' : '') + '" data-pt="gate" data-n="' + g.n + '"><b>第 ' + g.n + ' 關</b><span>' + esc(g.name) + '</span></button>'; }).join('') + '</div>' +
      '<div class="pt-note">做完的樣子：' + esc(P.GATES[cur - 1].done) + '</div>';
  }
  var START_OPTS = [
    { k: 'tpl', name: '用老師的樣板改', note: '老師會在 flipclass 教材區給樣板連結。複製成你自己的草稿再改，不要改到原本的那份。' },
    { k: 'gen', name: '用 Claude 生一張初稿（選用）', note: '到 Claude 免費版的「設計」，用下面這段指令生出草稿畫板。它只在對話裡生成與修改，不會改你的 Figma；生好後自己放進 Figma，調成寬 390。' },
    { k: 'blank', name: '自己從空白畫', note: '在 Figma 新增一個寬 390 的畫面，從自己的版面開始。' }
  ];
  function startBlock(P, lv, sel) {
    var v = P.view(lv), card = P.cardById(v.startCard), o = START_OPTS.filter(function (x) { return x.k === sel; })[0];
    var h = '<div class="pt-h2">先選一個起點（三選一，哪個都可以）</div><div class="pt-tools">' + START_OPTS.map(function (x) { return '<button class="pt-tool' + (sel === x.k ? ' on' : '') + '" data-pt="start" data-k="' + x.k + '"><b>' + esc(x.name) + '</b></button>'; }).join('') + '</div>';
    if (o) h += '<div class="pt-note">' + esc(o.note) + '</div>';
    if (sel === 'gen' && card) h += '<div class="pt-note"><b>' + esc(card.title) + '</b>　做完的樣子：' + esc(card.done) + '<br>下一步按「複製指令」，把【括號】換成你自己的內容。生出來的是草稿，你還是要在 Figma 裡看過、改過。</div>';
    return h;
  }

  /* ———— 次數只存本機 ———— */
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  function countsKey(sid, d) { return 'figai1108:' + sid + ':' + dayKey(d); }
  function counts(p) { var u = p.S.used; return { stuck: u.stuck, level: u.level, fill: u.fill, review: u.review, auto: u.auto, fillsDone: p.S.fillsDone }; }
  function saveCounts(storage, sid, p, d) { try { storage.setItem(countsKey(sid, d), JSON.stringify(counts(p))); return true; } catch (e) { return false; } }
  function loadCounts(storage, sid, p, d) {
    try { var o = JSON.parse(storage.getItem(countsKey(sid, d)) || 'null'); if (!o) return false;
      ['stuck', 'level', 'fill', 'review', 'auto'].forEach(function (k) { p.S.used[k] = Math.max(0, Number(o[k]) || 0); }); p.S.fillsDone = Math.max(0, Number(o.fillsDone) || 0); return true; } catch (e) { return false; }
  }

  return { create: create, ensure: ensure, act: act, setField: setField, render: render, gateBar: gateBar, startBlock: startBlock, START_OPTS: START_OPTS, quotaLeft: quotaLeft,
           counts: counts, saveCounts: saveCounts, loadCounts: loadCounts, countsKey: countsKey, modeOf: modeOf };
});
