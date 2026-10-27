/* 訪談 AI 助教第 1 階段：只用規則，不呼叫模型。純函式，不碰 DOM、不連網、不寫資料庫。
   規劃書：docs/PLAN_INTERVIEW_COACH_1027.md。句庫與門檻：docs/IC_RULES.json（瀏覽器版是 interview_coach_rules.js 的 window.ERG_IC_RULES，兩邊內容一致，測試會比對）。

   匯出（Node：require；瀏覽器：window.ERG_IC）
     evaluate(ctx, rules?)  → { fire, moment, variant, level, text, why, source, exFrom }
         fire=false 時 moment／text 都是空字串（reason 說明為什麼不出手）。
         moment：A 開口前｜B 問完一題｜C 卡住沒追問｜D 只問是非題｜E 整理訪談卡｜F 檢核點卡關
         自動出手一律第 1 級；學生按「求助」（ctx.requested=true）才依 ctx.level 給第 2、3 級，且不受冷卻與次數限制。
         text 三句內（句數算法：引號「」『』裡的字不算句子結尾）。先問不先答，不替學生想問題、不替人物回答。
         例句一律取自別的人物或中性情境（exFrom 說明來源，不會是此刻訪談的那一位）。
     selfDone(ctx, rules?)  → { n, total, items:[{id,text,evidence}], held:[id], lines:[字串] }
         「自己做到」正向表列；held 只給後台看（用了較深提示的那一項先不列入），學生畫面只顯示 items／lines。
     analyze(turns, rules, pid) → 每個學生問句的特徵（回放與測試用）
     sentenceCount(s)／clipSentences(s,n)／fill(tpl,vars)／loadRules()／VERSION

   ctx（evaluate）欄位，缺的欄位一律當沒有：
     pid         目前人物 id（對 ERG_TYPES 的 key；不認得的 id 走通用句）
     turns       這段對話依時間排好：[{ role:'u'（學生）|'a'（人物）, text, t }]
     convKey     這段對話的識別字（同一位人物不同次對話要不同）；冷卻與次數都以它分段
     asked       這一輪以前，這位學生問過這位人物幾題（player.q.who[pid]；沒有就 0）
     qLast       最近十題的樣子字串（player.q.last；g 寒暄、y 是非題、o 其他）。沒給就從 turns 推
     idleSec     人物回完之後，學生已經多久沒送新題（秒）
     leaving     true＝學生正要換人物或關掉這段對話（時刻 C 的「換人前」）
     oldCards    [{ no:'#3' }] 這位學生以前對同一位人物寫過的訪談卡
     cardOpen    true＝學生打開了這位人物的訪談卡（時刻 E）
     card        { items:{ surface|events|need:{ done, trust, note, tags[] }} }（checklist.js 的記錄）
     cardNo      這張卡的編號（'#學號-3'）；allCards：這位學生全部的卡（判斷要不要排事件重要性）
     sbNextCell  故事板下一個沒素材的格子號碼（沒給就 1）
     cpNext      { id, label, plain, text }（checkpoints.js evaluate 的 next）；cpIdleMin 距上次檢核點進展幾分鐘
     now         現在的毫秒時間（F 的冷卻用）
     shown       已經出過的提示：[{ moment, variant, pid, conv, qn, key, t }]（呼叫端出一則就 push 一則，evaluate 回傳的 qn／key 直接可存）
     requested   true＝學生按了求助；level 1|2|3
     autoOff     true＝學生把提示關掉了（自動出手一律不出）

   selfDone ctx：
     convs    [{ key, pid, turns, helpLevel }]  helpLevel＝這段對話學生自己按過的最深一級（0 沒按過；自動跳出的第 1 級不算）
     examplesShown  學生看過的範例句（用來排除照抄）
     cards    [訪談卡記錄，可帶 helpLevel]；cpLit [{ id, helpLevel }]；sbGaps [{ cell, helpLevel }]（缺出處後來補上的格子）

   門檻調整紀錄（回放 _scan/_er_chat_1027x.json 之後）寫在 docs/IC_RULES.json 的 thresholds 與 test_interview_coach.js 檔頭。
   與 achievements.js 同源的正則（Q_EVENT、Q_WHY、Q_YESNO、Q_TEMPLATE、Q_GREET）放在規則檔 lex 裡，測試會逐字比對 achievements.js。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_IC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1027.1';
  var G = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : {});

  function loadRules(r) { return r || G.ERG_IC_RULES || null; }
  function keys(o) { return o && typeof o === 'object' ? Object.keys(o) : []; }

  /* ───── 規則編譯（正則只編一次，掛在規則物件的不可列舉欄位上） ───── */
  function compile(R) {
    if (R._c) return R._c;
    var c = { lex: {}, cold: {}, forbid: null };
    keys(R.lex).forEach(function (k) { c.lex[k] = new RegExp(R.lex[k], (R.flags && R.flags[k]) || ''); });
    keys(R.personas).forEach(function (pid) { c.cold[pid] = R.personas[pid].cold ? new RegExp(R.personas[pid].cold) : null; });
    c.forbid = new RegExp((R.forbidden || []).map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') || '(?!)');
    Object.defineProperty(R, '_c', { value: c, enumerable: false });
    return c;
  }

  /* ───── 小工具 ───── */
  function bareQ(t) { return String(t || '').replace(/[\s，,。.！!？?～~、：:；;「」『』（）()*]/g, ''); }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function echoGram(q, prev) {   /* 與 achievements.js 的 echoes 同一個判準，多回傳那個三字詞 */
    q = bareQ(q); prev = bareQ(prev).replace(/（[^）]*）/g, '');
    if (q.length < 3 || prev.length < 3) return '';
    for (var i = 0; i + 3 <= q.length; i++) { var g = q.substr(i, 3); if (/^[一-鿿]{3}$/.test(g) && prev.indexOf(g) >= 0) return g; }
    return '';
  }

  /* 句子：引號裡的字不算句尾。回傳句子陣列 */
  function splitSentences(s) {
    var qs = [], m = String(s || '').replace(/[「『][^」』]*[」』]/g, function (x) { qs.push(x); return '\u0001' + (qs.length - 1) + '\u0002'; });
    var parts = m.match(/[^。！？!?]+[。！？!?]*/g) || [];
    return parts.map(function (p) { return p.replace(/\u0001(\d+)\u0002/g, function (_, i) { return qs[Number(i)]; }); })
      .filter(function (p) { return p.replace(/[\s。！？!?]/g, '').length > 0; });
  }
  function sentenceCount(s) { return splitSentences(s).length; }
  function clipSentences(s, n) { var a = splitSentences(s); return a.length <= n ? String(s) : a.slice(0, n).join(''); }

  /* 樣板：[[變數:只有變數有值才出現的片段]]，再換 {變數} */
  function fill(tpl, vars) {
    vars = vars || {};
    var out = String(tpl || '').replace(/\[\[(\w+):([\s\S]*?)\]\]/g, function (_, k, seg) { return vars[k] ? seg : ''; });
    out = out.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? '' : String(vars[k]); });
    return out.replace(/ {2,}/g, ' ').replace(/ ([，。！？：；）])/g, '$1');
  }

  /* 引用學生或人物的原話：先去掉括號動作與引號，取第一句，限長；含禁用字就不引用 */
  function safeQuote(s, R, c, max) {
    var t = String(s || '').replace(/[（(][^）)]*[）)]/g, '').replace(/[「」『』\s]/g, '');
    t = (t.split(/[。！？!?…]/)[0] || '').trim();
    if (!t) return '';
    if (t.length > max) t = t.slice(0, max);
    return c.forbid.test(t) ? '' : t;
  }

  /* ───── 逐題分析 ───── */
  function analyze(turns, R, pid) {
    R = loadRules(R); var c = compile(R), coldRe = pid ? c.cold[pid] : null;
    var seen = {}, prev = '', prevI = -1, out = [], list = Array.isArray(turns) ? turns : [];
    list.forEach(function (t, i) {
      if (!t) return;
      var x = String(t.text || '');
      if (t.role !== 'u') { if (x) { prev = x; prevI = i; } return; }
      var b = bareQ(x), paste = c.lex.Q_PASTE.test(x), dup = !!seen[b] || paste;
      if (!dup) seen[b] = 1;
      var greet = c.lex.Q_GREET.test(b) || b.length <= 3, tmpl = c.lex.Q_TEMPLATE.test(x);
      var gram = (!greet && prev) ? echoGram(x, prev) : '', lm = x.match(c.lex.LEAD), em = prev ? prev.match(c.lex.EMO) : null;
      var q = {
        i: i, text: x, greet: greet, dup: dup, tmpl: tmpl, yn: c.lex.Q_YESNO.test(x),
        ev: c.lex.Q_EVENT.test(x) && !tmpl, why: c.lex.Q_WHY.test(x), echo: !!gram, gram: gram,
        lead: !!lm, leadWord: lm ? lm[0] : '', cold: !!(coldRe && coldRe.test(x)),
        emoWord: em ? em[0] : '', ack: c.lex.ACK.test(x), prev: prev, prevI: prevI, ansI: -1
      };
      q.sig = !greet && !dup && (q.echo || q.ev || q.why);
      q.real = !greet && !dup;
      out.push(q);
    });
    /* 每題對應的人物回答：這題之後、下一題之前的第一個非學生發言 */
    out.forEach(function (q, k) {
      var next = k + 1 < out.length ? out[k + 1].i : list.length;
      for (var j = q.i + 1; j < next; j++) if (list[j] && list[j].role !== 'u' && String(list[j].text || '')) { q.ansI = j; break; }
    });
    return out;
  }

  /* ───── 例句：只用別的人物或中性情境 ───── */
  function pickBank(R, kind, seed) { var a = (R.exampleBank && R.exampleBank[kind]) || []; return a.length ? a[hash(seed) % a.length] : ''; }
  function pickOther(R, pid, seed) {
    var me = R.personas[pid], all = keys(R.personas).filter(function (k) { return k !== pid; });
    var pool = me ? all.filter(function (k) { var p = R.personas[k]; return p.type[0] === me.type[0] && p.type[2] === me.type[2]; }) : [];
    if (!pool.length) pool = all;
    var core = pool.filter(function (k) { return R.personas[k].core; });
    if (core.length) pool = core;
    var k = pool[hash(seed) % pool.length];
    return { pid: k, text: R.personas[k].open };
  }

  /* ───── 出手條件 ───── */
  function shownList(ctx) { return Array.isArray(ctx.shown) ? ctx.shown : []; }
  function inConv(ctx, e) { return !ctx.convKey || e.conv === ctx.convKey; }
  var CORRECTIVE = { B: 1, C: 1, D: 1 }, OPENWORD = /(怎麼|什麼|哪|如何|幾)/;
  function midCount(ctx) { return shownList(ctx).filter(function (e) { return inConv(ctx, e) && CORRECTIVE[e.moment] && e.variant !== 'praise'; }).length; }
  function lastShown(ctx, moment) {
    var l = shownList(ctx).filter(function (e) { return e.moment === moment && inConv(ctx, e); });
    return l.length ? l[l.length - 1] : null;
  }

  function cellFilled(it) { return !!(it && ((it.note && String(it.note).trim()) || (it.text && String(it.text).trim()) || it.done)); }
  function cardInfo(card, R, ctx) {
    var items = (card && card.items) || {}, order = R.cellOrder, lab = R.cellLabels, c = compile(R);
    var empties = order.filter(function (k) { return !cellFilled(items[k]); });
    var noTrust = order.filter(function (k) { var it = items[k]; return cellFilled(it) && !it.trust; });
    var anyTag = order.some(function (k) { return items[k] && items[k].tags && items[k].tags.length; });
    var allText = order.map(function (k) { return String((items[k] && (items[k].note || items[k].text)) || ''); }).join(' ');
    var conseq = c.lex.CONSEQ.test(allText);
    var evCards = (Array.isArray(ctx && ctx.allCards) ? ctx.allCards : []).filter(function (r) { return r && r.items && cellFilled(r.items.events); });
    var evTagged = evCards.some(function (r) { return keys(r.items).some(function (k) { return r.items[k] && r.items[k].tags && r.items[k].tags.length; }); });
    return { empties: empties, noTrust: noTrust, anyTag: anyTag, conseq: conseq, evCards: evCards.length, evTagged: evTagged,
      label: function (k) { return lab[k]; }, events: items.events };
  }

  /* 候選：每個回傳 null 或 { moment, variant, vars, why, source, exFrom?, praise? }。force=true 時略過冷卻與次數。 */
  function candidates(ctx, R, force) {
    var c = compile(R), th = R.thresholds, pid = ctx.pid, P = R.personas[pid] || null, turns = Array.isArray(ctx.turns) ? ctx.turns : [];
    var qs = analyze(turns, R, pid), real = qs.filter(function (q) { return q.real; }), nReal = real.length;
    var lastTurn = turns.length ? turns[turns.length - 1] : null, lastQ = qs.length ? qs[qs.length - 1] : null;
    var answered = !!(lastQ && lastQ.ansI >= 0 && lastTurn && lastTurn.role !== 'u');
    var shown = shownList(ctx), seed = String(pid) + ':' + nReal + ':' + (ctx.convKey || '');
    var style = P ? R.styles[P.style] : null;
    var vars = {
      name: P ? P.name : R.defaultName, type: P ? P.type : '', plain: P ? P.plain : '', line: P ? P.line : '', skill: P ? P.skill : '',
      hint: style ? fill(style.hint, { name: P.name }) : R.defaultHint, demo: style ? style.demo : '',
      exEvent: pickBank(R, 'event', seed), exEcho: pickBank(R, 'echo', seed + 'e'), exAck: pickBank(R, 'ack', seed + 'a')
    };
    var oth = pickOther(R, pid, seed + 'o'); vars.ex = oth.text;
    var out = {};
    function cand(key, moment, variant, extra) { out[key] = Object.assign({ moment: moment, variant: variant, vars: Object.assign({}, vars), exFrom: 'bank' }, extra); }
    function turnSrc(q) { return q ? 'turn:' + q.i : 'rule'; }

    /* E：整理訪談卡 */
    if (ctx.cardOpen && ctx.card) {
      var ci = cardInfo(ctx.card, R, ctx), key = ctx.cardNo || ctx.cardId || 'card', v = null, why = '', hasAns = turns.some(function (t) { return t && t.role !== 'u' && t.text; }) || ci.empties.length < 3;
      if (hasAns) {
        if (ci.empties.length) { v = 'gapEmpty'; vars.cell = ci.label(ci.empties[0]); why = '訪談卡三格裡有 ' + ci.empties.length + ' 格還空著'; }
        else if (ci.noTrust.length) { v = 'noTrust'; vars.cell = ci.label(ci.noTrust[0]); why = '「' + vars.cell + '」有字但可信度還沒選'; }
        else if (ci.anyTag && !ci.conseq) { v = 'pain'; vars.cell = ci.label('events'); why = '卡上有痛點標籤，但三格的字裡看不到結果'; }
        else if (!ci.anyTag && ci.evCards >= 2 && !ci.evTagged) { v = 'rank'; vars.n = ci.evCards; why = '有 ' + ci.evCards + ' 張卡記了事件，但都還沒標痛點'; }
        else if (!ci.anyTag) { v = 'noTag'; why = '三格都有字，但沒有任何痛點標籤'; }
        else {
          v = 'full'; vars.cell = ctx.sbNextCell || 1; why = '三格都填好了，標了痛點，也寫了結果';
          var ev = ci.events && (ci.events.note || ci.events.text); vars.note = safeQuote(ev, R, c, 14);
        }
        vars.no = ctx.cardNo ? '（' + ctx.cardNo + '）' : '';
        cand('E', 'E', v, { why: why, source: 'card:' + (ctx.cardNo || '') , key: key });
      }
    }

    /* A：開口前 */
    if (nReal === 0 && !qs.length && !(Number(ctx.asked) > 0) && !turns.some(function (t) { return t && t.role !== 'u' && t.text; })) {
      var old = Array.isArray(ctx.oldCards) ? ctx.oldCards : [];
      if (old.length) vars.no = '（' + (old[old.length - 1].no || '') + '）'; else vars.no = '';
      var av = old.length && P ? 'bridge' : (P ? 'open' : 'generic');
      cand('A', 'A', av, { why: P ? '第一次問' + P.name + '（徽章 ' + P.type + '：' + P.plain + '）' : '第一次問這位人物', source: 'persona:' + (pid || ''), exFrom: av === 'open' ? oth.pid : 'bank' });
    }

    /* 對話中：只在最後一句是人物的回答時（回答剛到） */
    if (answered && lastQ) {
      var base = { source: turnSrc(lastQ) };
      var excerpt = safeQuote(turns[lastQ.ansI].text, R, c, th.excerptMax);
      vars.excerpt = excerpt;
      var lastReal = real.length ? real[real.length - 1] : null;
      var isLastReal = lastReal && lastReal.i === lastQ.i;
      var yWin = (typeof ctx.qLast === 'string' && ctx.qLast ? ctx.qLast : qs.map(function (q) { return q.greet ? 'g' : (q.yn ? 'y' : 'o'); }).join('')).slice(-th.ynWindow);
      var yCount = (yWin.match(/y/g) || []).length, lastIsY = yWin.slice(-1) === 'y';
      vars.w = yWin.length; vars.y = yCount;

      if (lastQ.lead) { vars.leadWord = lastQ.leadWord; cand('B-lead', 'B', 'lead', Object.assign({ why: '用了「' + lastQ.leadWord + '」這類已經放了答案的說法' }, base)); }
      if (lastQ.cold && P) { var o2 = pickOther(R, pid, seed + 'c'); vars.ex = o2.text; cand('B-cold', 'B', 'cold', Object.assign({ why: '這句的樣子，' + P.name + '聽了容易只回一句短的', exFrom: o2.pid }, base)); }
      if (lastQ.tmpl) cand('B-tmpl', 'B', 'tmpl', Object.assign({ why: '這句和訪談檢核表上的句子一樣' }, base));
      if (lastQ.dup && !lastQ.tmpl) cand('B-dup', 'B', 'dup', Object.assign({ why: '這題和前面問過的重複' }, base));
      if (yCount >= th.ynMin && lastIsY) cand('D', 'D', 'yn', Object.assign({ why: '最近 ' + yWin.length + ' 題裡有 ' + yCount + ' 題結尾是「嗎／有沒有」這類' }, base));
      var tail = real.slice(-th.stuckQ);
      if (nReal >= th.stuckQ && tail.length === th.stuckQ && tail.every(function (q) { return !q.sig; })) {
        vars.n = th.stuckQ; cand('C-stuck', 'C', 'stuck', Object.assign({ why: '連續 ' + th.stuckQ + ' 題沒有撿起對方的詞、沒問當時、沒問原因' }, base));
      }
      var ynTail = real.slice(-th.ynBWindow), ynTailN = ynTail.filter(function (q) { return q.yn; }).length;
      if (lastQ.yn && isLastReal && ynTailN >= th.ynBMin) cand('B-yn', 'B', 'yn', Object.assign({ why: '這題結尾是「嗎／有沒有」這類，最近 ' + ynTail.length + ' 題裡有 ' + ynTailN + ' 題這樣' }, base));
      if (lastQ.emoWord && !lastQ.ack && isLastReal) { vars.emoWord = lastQ.emoWord; cand('B-emo', 'B', P && P.style === 'efficient' ? 'emoEff' : 'emo', Object.assign({ why: '對方上一句提到「' + lastQ.emoWord + '」，你的題直接跳到事情' }, base)); }
      if (lastQ.greet && nReal >= th.greetAfterQ) cand('B-greet', 'B', 'greet', Object.assign({ why: '已經問了 ' + nReal + ' 題，這題還是寒暄' }, base));

      /* 正向回饋：被提醒之後的下一題真的照著改了（只回應學生自己做的，不算提醒） */
      var prior = shown.filter(function (e) { return inConv(ctx, e) && CORRECTIVE[e.moment] && e.variant !== 'praise'; }), pe = prior.length ? prior[prior.length - 1] : null;
      var adopted = function (variant, q) {
        if (variant === 'yn' || variant === 'stuck' || variant === 'idle') return !q.yn && (q.sig || OPENWORD.test(q.text));
        if (variant === 'lead') return !q.lead;
        if (variant === 'cold') return !q.cold;
        if (variant === 'tmpl' || variant === 'dup') return !q.tmpl && !q.dup;
        if (variant === 'emo' || variant === 'emoEff') return q.ack;
        if (variant === 'greet') return !q.greet;
        return false;
      };
      if (isLastReal && !lastQ.yn && ((pe && nReal === pe.qn + 1 && adopted(pe.variant, lastQ)) || force)) {
        var pv = lastQ.echo ? 'echo' : (lastQ.ev ? 'ev' : (lastQ.why ? 'why' : 'open'));
        vars.gram = lastQ.gram;
        cand('praise', 'B', 'praise', Object.assign({ why: '收到提醒之後，這題' + ({ echo: '撿起了對方的詞', ev: '問了具體的事', why: '問了原因', open: '是開放的題目' }[pv]), praiseKind: pv }, base));
      }
    }
    /* C：對方回完很久沒新題；或換人前 */
    if (lastTurn && lastTurn.role !== 'u') {
      var lastAns = null; for (var j = turns.length - 1; j >= 0; j--) if (turns[j] && turns[j].role !== 'u' && turns[j].text) { lastAns = turns[j]; break; }
      if (lastAns && Number(ctx.idleSec) >= th.idleSec) { vars.excerpt = safeQuote(lastAns.text, R, c, th.excerptMax); cand('C-idle', 'C', 'idle', { why: '對方回完已經過了 ' + Math.round(ctx.idleSec) + ' 秒，沒有新的題', source: 'idle' }); }
    }
    if (ctx.leaving && nReal > 0 && nReal <= th.leaveQ) {
      var ci2 = ctx.card ? cardInfo(ctx.card, R, ctx) : { empties: ['x', 'y', 'z'] };
      if (ci2.empties.length === 3) { vars.n = nReal; cand('C-leave', 'C', 'leave', { why: '這位只問了 ' + nReal + ' 題，訪談卡三格都還空著', source: 'leave' }); }
    }

    /* F：檢核點卡關 */
    if (ctx.cpNext && Number(ctx.cpIdleMin) >= th.fMinutes) {
      var np = ctx.cpNext, def = (R.moments.F.byCp[String(np.id)] || {});
      vars.cpLabel = np.label || ''; vars.cpPlain = np.plain || ''; vars.cpText = String(np.text || '').split(/[。]/)[0]; vars.cpHow = def.how || ''; vars.cpDemo = def.demo || '';
      cand('F', 'F', 'base', { why: '離上次有進展已經 ' + Math.round(ctx.cpIdleMin) + ' 分鐘，「' + (np.label || '') + '」還沒亮', source: 'cp:' + np.id });
    }
    out._info = { qs: qs, nReal: nReal, answered: answered };
    return out;
  }

  /* 冷卻與次數：回傳 true＝這個候選現在不能出 */
  function blocked(ctx, R, cd) {
    var th = R.thresholds, shown = shownList(ctx), info = cd._info, nReal = info.nReal;
    var m = cd.moment, v = cd.variant;
    if (m === 'A') return shown.some(function (e) { return e.moment === 'A' && (e.pid === ctx.pid || (v === 'generic' && e.variant === 'generic')); });   /* 通用版（不認得的人物）每位學生只出一次 */
    if (m === 'E') return shown.some(function (e) { return e.moment === 'E' && e.variant === v && e.key === cd.key; });
    if (m === 'F') { var f = shown.filter(function (e) { return e.moment === 'F'; }); var lf = f.length ? f[f.length - 1] : null; return !!(lf && ctx.now && (ctx.now - lf.t) < th.fCooldownMin * 60000); }
    if (v === 'praise') return shown.some(function (e) { return inConv(ctx, e) && e.variant === 'praise'; }) && shown.filter(function (e) { return inConv(ctx, e) && e.variant === 'praise'; }).length >= th.praiseCap;
    if (midCount(ctx) >= th.midCap) return true;
    var last = null; shown.forEach(function (e) { if (inConv(ctx, e) && CORRECTIVE[e.moment] && e.variant !== 'praise') last = e; });
    if (m === 'D') { var ld = lastShown(ctx, 'D'); if (ld && nReal - ld.qn < th.dCooldownQ) return true; }
    if (m === 'B' && last && nReal - last.qn < th.bCooldownQ) return true;
    return false;
  }

  var ORDER = ['E', 'A', 'B-lead', 'B-cold', 'B-tmpl', 'B-dup', 'D', 'C-stuck', 'B-yn', 'B-emo', 'B-greet', 'C-idle', 'C-leave', 'praise', 'F'];

  function render(ctx, R, cd, level) {
    var c = compile(R), M = R.moments[cd.moment], tpl, vars = Object.assign({}, cd.vars);
    if (cd.variant === 'praise') tpl = M.praise[cd.praiseKind];
    else if (cd.moment === 'F') tpl = M.base[String(level)];
    else tpl = M[cd.variant][String(level)];
    var text = clipSentences(fill(tpl, vars), R.thresholds.maxSentences);
    if (c.forbid.test(text)) text = text.replace(/「[^」]*」/g, function (q) { return c.forbid.test(q) ? '' : q; });
    return text;
  }

  function evaluate(ctx, rules) {
    var R = loadRules(rules); if (!R) throw new Error('沒有規則：請傳入 IC_RULES 或載入 interview_coach_rules.js');
    ctx = ctx || {}; var th = R.thresholds, requested = !!ctx.requested;
    if (ctx.autoOff && !requested) return { fire: false, moment: '', variant: '', level: 0, text: '', why: '', source: '', exFrom: '', reason: 'autoOff' };
    var cd = candidates(ctx, R, requested), level = requested ? Math.min(3, Math.max(1, Number(ctx.level) || 1)) : 1, pick = null, why = 'none';
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i], x = cd[k]; if (!x) continue;
      if (!requested && blocked(ctx, R, Object.assign({}, x, { _info: cd._info }))) { why = 'cooldown:' + k; continue; }
      pick = x; break;
    }
    if (!pick && requested) {   /* 求助但沒有特別的事：給通用方向 */
      var P = R.personas[ctx.pid], turns = Array.isArray(ctx.turns) ? ctx.turns : [];
      var vars = cd.A ? cd.A.vars : null;
      if (!vars) { var seed = String(ctx.pid) + ':fb'; vars = { name: P ? P.name : R.defaultName, hint: P ? fill(R.styles[P.style].hint, { name: P.name }) : R.defaultHint, exEvent: pickBank(R, 'event', seed), excerpt: '', n: 0 }; }
      var lastAns = null; for (var j = turns.length - 1; j >= 0; j--) if (turns[j] && turns[j].role !== 'u' && turns[j].text) { lastAns = turns[j]; break; }
      vars.excerpt = lastAns ? safeQuote(lastAns.text, R, compile(R), th.excerptMax) : '';
      pick = { moment: 'C', variant: 'idle', vars: vars, why: '你按了求助', source: 'request', exFrom: 'bank' };
    }
    if (!pick) return { fire: false, moment: '', variant: '', level: 0, text: '', why: '', source: '', exFrom: '', reason: why };
    var nReal = cd._info.nReal;
    return { fire: true, moment: pick.moment, variant: pick.variant, level: level, text: render(ctx, R, pick, level), why: pick.why || '', source: pick.source || '', exFrom: pick.exFrom || 'bank',
      qn: nReal, key: pick.key || '', conv: ctx.convKey || '', pid: ctx.pid || '' };
  }

  /* ───── 自己做到（正向表列） ───── */
  function copyLike(a, b, th) {
    a = bareQ(a); b = bareQ(b); if (a.length < 4 || b.length < 4) return a === b;
    function grams(s) { var g = {}; for (var i = 0; i + 3 <= s.length; i++) g[s.substr(i, 3)] = 1; return g; }
    var ga = grams(a), gb = grams(b), inter = 0, ua = keys(ga).length, ub = keys(gb).length;
    keys(ga).forEach(function (k) { if (gb[k]) inter++; });
    var uni = ua + ub - inter; return uni ? inter / uni >= th : false;
  }
  function selfDone(ctx, rules) {
    var R = loadRules(rules); if (!R) throw new Error('沒有規則'); ctx = ctx || {}; var c = compile(R), th = R.thresholds;
    var convs = Array.isArray(ctx.convs) ? ctx.convs : [], ex = Array.isArray(ctx.examplesShown) ? ctx.examplesShown : [];
    var ok = {}, held = {}, ev = {};
    function mark(id, deep, evidence) { if (deep) { held[id] = 1; } else { ok[id] = 1; ev[id] = evidence; } }
    convs.forEach(function (cv) {
      var qs = analyze(cv.turns, R, cv.pid), real = qs.filter(function (q) { return q.real; }), deep = Number(cv.helpLevel) >= 2, P = R.personas[cv.pid];
      /* 1 自己想出追問（不是照抄看過的範例） */
      var own = real.filter(function (q) { return q.sig && !ex.some(function (e) { return copyLike(q.text, e, th.copySim); }); });
      if (own.length) mark(1, deep, '追問 ' + own.length + ' 題');
      /* 2 開放式：連續 5 題中至少 3 題不是是非題 */
      for (var s = 0; s + 5 <= real.length; s++) { var w = real.slice(s, s + 5); if (w.filter(function (q) { return !q.yn; }).length >= 3) { mark(2, deep, '連續 5 題裡有 ' + w.filter(function (q) { return !q.yn; }).length + ' 題是開放的'); break; } }
      /* 3 先接住感受再問 */
      var ack = real.filter(function (q) { return q.emoWord && q.ack; }); if (ack.length) mark(3, deep, '接住感受 ' + ack.length + ' 次');
      /* 4 整段沒有誘導 */
      if (real.length >= 5 && !real.some(function (q) { return q.lead; })) mark(4, deep, '共 ' + real.length + ' 題都是中立的問法');
      /* 5 依人物避開會縮回去的問法 */
      if (P && real.length >= 3 && !real.some(function (q) { return q.cold; })) mark(5, deep, '問了 ' + real.length + ' 題，都避開了' + P.name + '會縮回去的問法');
    });
    var cards = Array.isArray(ctx.cards) ? ctx.cards : [];
    cards.forEach(function (r) {
      var deep = Number(r && r.helpLevel) >= 2, its = (r && r.items) || {}, txt = keys(its).map(function (k) { return String((its[k] && (its[k].note || its[k].text)) || ''); }).join(' ');
      var tagged = keys(its).some(function (k) { return its[k] && its[k].tags && its[k].tags.length; });
      if (c.lex.TYPECUE.test(txt)) mark(6, deep, '卡片備註寫到對方的說話特徵');
      if (tagged && c.lex.CONSEQ.test(txt)) mark(7, deep, '痛點後面寫了結果');
    });
    (Array.isArray(ctx.cpLit) ? ctx.cpLit : []).forEach(function (x) { mark(8, Number(x.helpLevel) >= 2, '檢核點 ' + x.id); });
    (Array.isArray(ctx.sbGaps) ? ctx.sbGaps : []).forEach(function (x) { mark(9, Number(x.helpLevel) >= 2, '故事板第 ' + x.cell + ' 格'); });
    var items = [], heldIds = [];
    R.selfItems.forEach(function (it) {
      if (ok[it.id]) items.push({ id: it.id, text: it.text, evidence: ev[it.id] });
      else if (held[it.id]) heldIds.push(it.id);
    });
    return { n: items.length, total: R.selfItems.length, items: items, held: heldIds,
      lines: items.map(function (i) { return i.text + '（' + i.evidence + '）'; }) };
  }

  return { VERSION: VERSION, evaluate: evaluate, selfDone: selfDone, analyze: analyze, sentenceCount: sentenceCount, clipSentences: clipSentences, fill: fill, loadRules: loadRules,
    ORDER: ORDER, echoGram: echoGram, bareQ: bareQ };
});
