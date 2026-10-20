/* 六個檢核點：完成即通過，沒有等第。純函式，輸入學生狀態，輸出每個檢核點是否亮燈。
   state：
   { student:{ id, cls }, case:{ directions:[...] },
     markers:[{ id, type, author, round, refs? }],                 // 學生自己做的標記（含勘查卡、問號、矛盾、想法…）
     interviews:[ checklist 記錄 ],
     conclusions:[{ text, refs:[標記編號], tradeoff, direction }],
     sessions:[{ code, role:'own'|'visit', finished:boolean, others:[學號...] }],   // others＝同房間其他真人學號
     discussion:{ room, partners:[{ id, confirmed:boolean }], checks:{ read,diff,complement,outcome } },
     submitted:{ scene:boolean, text:boolean, links:boolean }, linksOk?:boolean }

   10-12 楊老師：檢核細項一條一條列出來，完成的後面打勾、還沒完成的打叉；「下一步」要講要做什麼，不要只丟一個名詞。
   所以每個檢核點除了 ok／detail，還回傳 items:[{ text, ok, todo }]，而且 ok 一定等於「items 全部 ok」。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./checklist.js'));
  } else root.ERG_CHECKPOINTS = factory(root.ERG_CHECKLIST);
})(typeof self !== 'undefined' ? self : this, function (CHECKLIST) {
  'use strict';

  var RULES = {
    surveyTypes: ['勘查卡', '問號', '重要'], surveyMin: 3,
    interviewMin: 2,
    reasoningTypes: ['矛盾', '想法'],
    sessionsMin: 2,
    discussionChecks: ['read', 'diff', 'complement', 'outcome']
  };

  function count(list, pred) { var n = 0; list.forEach(function (x) { if (pred(x)) n += 1; }); return n; }
  function mine(list, id) { return list.filter(function (x) { return String(x.author) === String(id); }); }
  function allOk(items) { return items.every(function (x) { return x.ok; }); }

  function cpSurvey(s) {
    var n = count(mine(s.markers || [], s.student.id), function (m) { return RULES.surveyTypes.indexOf(m.type) >= 0; }), items = [];
    for (var i = 1; i <= RULES.surveyMin; i += 1) items.push({ text: '記第 ' + i + ' 張卡', ok: n >= i, todo: '走進急診室的房間，找黃色的小牌子（上面寫著「線索」），點它來讀，再按「記一張勘查卡」記下第 ' + i + ' 張' });
    var other = count(mine(s.markers || [], s.student.id), function (m) { return RULES.surveyTypes.indexOf(m.type) < 0; });   /* 10-13：學生記了便利貼、想法、矛盾，以為算在這一項 */
    return { ok: allOk(items), detail: n + ' / ' + RULES.surveyMin + ' 張' + (other && n < RULES.surveyMin ? '（另外 ' + other + ' 張便利貼、想法、矛盾等卡片不算在這一項，這裡要的是勘查卡、問號或重要卡）' : ''), items: items };
  }
  function cpInterview(s) {
    var done = CHECKLIST.completedPersonas(s.interviews || [], s.student.id), items = [];
    for (var i = 1; i <= RULES.interviewMin; i += 1) items.push({ text: '問完第 ' + i + ' 位（三個檢核項都打勾）', ok: done.length >= i, todo: '點畫面上的一位人物開始訪談，問到的事在「訪談」分頁打勾，三項都勾完才算問完（這是第 ' + i + ' 位）' });
    return { ok: allOk(items), detail: done.length + ' / ' + RULES.interviewMin + ' 位', items: items };
  }
  function cpReasoning(s) {
    var ms = mine(s.markers || [], s.student.id).filter(function (m) { return RULES.reasoningTypes.indexOf(m.type) >= 0; });
    var withRef = ms.filter(function (m) { return Array.isArray(m.refs) && m.refs.length > 0; });
    var items = [
      { text: '記 1 張「矛盾」卡或「想法」卡', ok: ms.length >= 1, todo: '到「筆記」記一張「矛盾」卡（兩邊說法對不上）或「想法」卡（你猜的原因），並填它根據哪一張卡的編號' },
      { text: '這張卡填了根據的編號', ok: withRef.length >= 1, todo: '到「筆記」再記一張「矛盾」或「想法」卡，這次要填「根據的編號」（例如你前面記的那張勘查卡）' }
    ];
    return { ok: allOk(items), detail: withRef.length + ' / 1 張（矛盾或想法，需有根據）', items: items };
  }
  function cpConclusion(s) {
    var ids = (s.markers || []).map(function (m) { return m.id; }).concat((s.interviews || []).map(function (r) { return r.id; }));
    var list = s.conclusions || [], errs = [];
    var dirs = (s.case && s.case.directions) || [];
    var f = { any: list.length >= 1, text: list.length >= 1, refs: list.length >= 1, tradeoff: list.length >= 1, direction: list.length >= 1 };
    if (!list.some(function (c) { return !(!c || !(String(c.text || '').trim() || String(c.tradeoff || '').trim() || (Array.isArray(c.refs) && c.refs.length) || String(c.direction || '').trim())); })) errs.push('至少一條結論');
    /* 10-13：結論表單會多出一行空白（沒有任何內容），它不是一條結論，不能卡住檢核點（二乙兩位同學實際遇到） */
    function blankC(c) { return !c || !(String(c.text || '').trim() || String(c.tradeoff || '').trim() || (Array.isArray(c.refs) && c.refs.length) || String(c.direction || '').trim()); }
    var realN = list.filter(function (c) { return !blankC(c); }).length;
    f.any = realN >= 1; if (realN < 1) { f.text = false; f.refs = false; f.tradeoff = false; f.direction = false; }
    list.forEach(function (c, i) {
      if (blankC(c) && realN >= 1) return;
      if (!c || !String(c.text || '').trim()) { errs.push('第' + (i + 1) + '條沒有內容'); f.text = false; }
      if (!Array.isArray(c.refs) || !c.refs.length) { errs.push('第' + (i + 1) + '條沒有根據編號'); f.refs = false; }
      else c.refs.forEach(function (r) { if (ids.indexOf(r) < 0) { errs.push('第' + (i + 1) + '條的 ' + r + ' 找不到'); f.refs = false; } });
      if (!String(c.tradeoff || '').trim()) { errs.push('第' + (i + 1) + '條沒寫取捨'); f.tradeoff = false; }
      if (dirs.length && dirs.indexOf(c.direction) < 0 && c.direction !== '其他') { errs.push('第' + (i + 1) + '條方向無效'); f.direction = false; }
    });
    var items = [
      { text: '寫了至少 1 條結論', ok: f.any, todo: '到「結論」按「新增一條結論」' },
      { text: '每條都寫了「發現」', ok: f.text, todo: '到「結論」把「發現」那一格寫完' },
      { text: '每條都點了根據的編號', ok: f.refs, todo: '到「結論」點選這條結論根據的卡片或訪談編號' },
      { text: '每條都寫了「取捨」', ok: f.tradeoff, todo: '到「結論」寫「取捨」：在什麼前提下這樣選、放棄了什麼' },
      { text: '每條都選了「再設計方向」', ok: f.direction, todo: '到「結論」選一個「再設計方向」' }
    ];
    return { ok: errs.length === 0, detail: errs.length ? errs.join('；') : realN + ' 條結論都有根據', errors: errs, items: items };
  }
  function cpSessions(s) {
    var ss = s.sessions || [];
    var own = ss.filter(function (x) { return x.role === 'own' && x.finished; });
    var joined = ss.filter(function (x) { return x.role === 'visit'; });
    var visits = ss.filter(function (x) { return x.role === 'visit' && x.finished && (x.others || []).length >= 1; });
    var d = s.discussion || {}, ch = d.checks || {};
    var picked = (d.partners || []).filter(function (p) { return String(p.id) !== String(s.student.id); });
    var partners = picked.filter(function (p) { return p.confirmed; });
    var allChecked = RULES.discussionChecks.every(function (k) { return !!ch[k]; });
    var visitRoomOk = visits.some(function (v) { return v.code === d.room; });
    var items = [
      { text: '自己的房間：在「結論」按「結束這一場」', ok: own.length >= 1, todo: '回到自己開的房間，在「結論」最下面按「結束這一場」' },
      { text: '加入一間同學開的房間', ok: joined.length >= 1 || visits.length >= 1, todo: '回大廳，加入一間同學開的房間（裡面要有人）' },
      { text: '在那間房的「討論」選一位同學、四項都打勾', ok: picked.length >= 1 && allChecked, todo: '在同學的房間打開「討論」，選一位同學，把四項討論檢核都打勾' },
      { text: '按「完成這次討論」', ok: visits.length >= 1 && visitRoomOk, todo: '在同學房間的「討論」按「完成這次討論」' },
      { text: '那位同學按了「確認我們討論過」', ok: partners.length >= 1, todo: '請你選的那位同學到同一間房的「討論」，按「確認我們討論過」' }
    ];
    var ok = own.length >= 1 && visits.length >= 1 && visitRoomOk && partners.length >= 1 && allChecked;
    var parts = [];
    parts.push('自己的一場：' + (own.length >= 1 ? '✔' : '未完成'));
    parts.push('進別人進過的房：' + (visits.length >= 1 ? '✔' : '未完成'));
    parts.push('討論勾選：' + (allChecked ? '✔' : '未勾完'));
    parts.push('真人確認：' + (partners.length >= 1 ? partners.length + ' 位' : '尚無'));
    return { ok: ok, detail: parts.join('、'), items: items };
  }
  function cpSubmit(s) {
    var sub = s.submitted || {}, pressed = !!(sub.scene && sub.text);
    var linksOk = s.linksOk !== undefined ? !!s.linksOk : !!sub.links;
    var items = [
      { text: '問完的訪談都有對話連結（即時訪談會自動帶入）', ok: linksOk, todo: '到「訪談」，替問完的那幾位補上對話連結（即時訪談會自動帶入；貼到 Gemini 訪談的要自己貼分享連結）' },
      { text: '在自己房間的「檢核」按「提交」', ok: pressed, todo: s._workRoom ? '回到房間 ' + s._workRoom + '（你的卡片、訪談、結論都記在那間；不一定是你開的房間），在「檢核」最下面按「提交」' : '回到自己開的房間，在「檢核」按「提交」' }
    ];
    return { ok: !!(sub.scene && sub.text && sub.links), detail: ['場景檔', '結論文字', '對話連結'].map(function (n, i) { return n + (sub[['scene', 'text', 'links'][i]] ? '✔' : '＿'); }).join(' '), items: items };
  }

  /* label＝遊戲裡的名稱；plain＝白話一句；how＝怎麼做；eg＝實例（用簡訊案的線索與人物原話） */
  var DEFS = [
    { id: 1, label: '勘查', plain: '到現場看線索', fn: cpSurvey,
      how: '走進急診室的各個房間，找黃色的小牌子（上面寫著「線索」）。點它會看到一項現場的事實，按「記一張勘查卡」把它記下來。「勘查卡」「問號」「重要」三種卡都算。小訣竅：問完一位之後，順手到房間裡找黃色「線索」牌，點開讀，再按「記一張勘查卡」，三張就過。' },
    { id: 2, label: '訪談', plain: '找人問清楚', fn: cpInterview,
      how: '點畫面上的人物開始訪談。問到這三件事就各打一個勾：他一開始怎麼說、那天發生了什麼事、他真正需要什麼。' },
    { id: 3, label: '矛盾或假設', plain: '把看到的和聽到的對起來', fn: cpReasoning,
      how: '兩邊說法對不上，記一張「矛盾」卡；你猜出一個原因，記一張「想法」卡。兩種擇一，要填它根據哪一張卡的編號。',
      eg: '例：護理師說「現在都傳簡訊，很方便」，線索卻寫「三則全部看完要點 21 步」，這兩句對不上，就是一張矛盾卡。再往下猜「病人可能點到一半就放棄了」，就是一張想法卡。' },
    { id: 4, label: '我的結論', plain: '寫下發現與取捨', fn: cpConclusion,
      how: '到「結論」寫至少一條：你發現了什麼、根據哪幾張卡或哪一段訪談、你的取捨、建議往哪個方向改。' },
    { id: 5, label: '場次與討論檢核', plain: '和一位同學互相看過結論', fn: cpSessions,
      how: '這是個人作業，但提交前要和一位同學討論一次：到他開的房間，互相讀對方的結論，再請他按確認。' },
    { id: 6, label: '提交', plain: '全部做完後按提交', fn: cpSubmit,
      how: '前五項都完成後，回到自己開的房間按「提交」，會出現綠色的「已通過」畫面。' }
  ];

  function evaluate(state) {
    var list = DEFS.map(function (d) {
      var r = d.fn(state);
      return { id: d.id, label: d.label, plain: d.plain, how: d.how, eg: d.eg || '', ok: r.ok, detail: r.detail, items: r.items || [] };
    });
    var next = null;
    list.some(function (x) {
      if (x.ok) return false;
      var it = x.items.filter(function (i) { return !i.ok; })[0];
      next = { id: x.id, label: x.label, plain: x.plain, text: it ? (it.todo || it.text) : x.how };
      return true;
    });
    return { list: list, lit: count(list, function (x) { return x.ok; }), total: list.length, passed: list.every(function (x) { return x.ok; }), next: next };
  }

  /* 提交按鈕的門檻：前五點都亮才能提交（第六點就是提交本身） */
  function canSubmit(state) {
    var r = evaluate(state);
    var blockers = r.list.filter(function (x) { return x.id <= 5 && !x.ok; });
    return { ok: blockers.length === 0, blockers: blockers };
  }

  /* 畫面用：把檢核點列成「標題＋白話說明＋條列細項（完成 ✔、未完成 ✘）」。電腦版、手機版、大廳共用。
     opts.compact＝大廳用的精簡版（不印怎麼做與例子）。回傳 HTML 字串，不碰 DOM。 */
  function escHtml(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function itemsHtml(x) {
    return '<ul class="ckItems" style="margin:4px 0 0;padding-left:18px;font-size:var(--fs-2);line-height:1.5">' + x.items.map(function (it) {
      return '<li data-ok="' + (it.ok ? '1' : '0') + '">' + escHtml(it.text) + ' <b style="color:' + (it.ok ? (x.ok ? '#1b5e2c' : 'var(--ok)') : 'var(--bad)') + '">' + (it.ok ? '✔' : '✘') + '</b></li>';
    }).join('') + '</ul>';
  }
  function listHtml(ev, opts) {
    opts = opts || {};
    return ev.list.map(function (x) {
      var title = '<div style="font-weight:900">' + x.id + ' ' + escHtml(x.label) + '　<span style="font-weight:400">' + escHtml(x.plain) + '</span></div>';
      if (opts.compact) return '<div class="ckRow" style="margin:6px 0">' + title + itemsHtml(x) + '</div>';
      return '<div class="ck ' + (x.ok ? 'done' : '') + '"><div class="box" style="display:flex;align-items:center;justify-content:center">' + (x.ok ? ((typeof window !== 'undefined' && window.ERG_ICONS && window.ERG_ICONS.check) || '✔') : x.id) + '</div><div style="flex:1;min-width:0">' + title +
        (x.ok ? '' : '<div class="muted" style="font-size:var(--fs-1);margin-top:2px">' + escHtml(x.how) + '</div>') + itemsHtml(x) +
        (x.eg && !x.ok ? '<div class="muted" style="font-size:var(--fs-1);margin-top:4px;border-left:var(--bw) solid var(--yellow);padding-left:8px">' + escHtml(x.eg) + '</div>' : '') + '</div></div>';
    }).join('');
  }
  function nextText(ev) { return ev.next ? ev.next.text : ''; }

  /* 驗證碼：由學號、通過時間與後台才有的鹽算出。鹽放在後台，前端產出的碼只作標示，後台以鹽重算比對。 */
  function verifyCode(studentId, passedAtISO, salt) {
    var str = String(studentId) + '|' + String(passedAtISO) + '|' + String(salt);
    var h = 5381, i;
    for (i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    var h2 = 52711;
    for (i = str.length - 1; i >= 0; i -= 1) h2 = ((h2 << 5) + h2 + str.charCodeAt(i)) >>> 0;
    return (h.toString(36) + h2.toString(36)).toUpperCase().slice(0, 8);
  }

  return { RULES: RULES, DEFS: DEFS, evaluate: evaluate, canSubmit: canSubmit, listHtml: listHtml, nextText: nextText, verifyCode: verifyCode };
});
