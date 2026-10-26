/* 第 8 週 UX 故事板編輯器的純邏輯（不碰 DOM、不碰 Firebase，Node 可測）。
   內容：進入條件、六案例樣板、分鏡草稿、學生編輯比例、每日上傳額度與台灣時間重置、全站三段保護、
   圖片壓縮尺寸計算、合作成就、痛點句切段、可列印頁。
   學生看得到的字全部用學生的說法，不放老師備課的詞；醫院一律叫「呼呼醫院」。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_SB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMITS = {
    perUserPerDay: 20, sitePerDay: 600, maxCells: 8, defaultCells: 6,
    fullLong: 960, fullBytes: 120 * 1024, thumbLong: 240, thumbBytes: 15 * 1024,
    tzOffsetMs: 8 * 3600 * 1000, opsStaleMs: 3 * 3600 * 1000,
    field: { who: 24, where: 40, what: 140, think: 140 }
  };
  /* 全站保護：本月下載量（GB，1 GB＝1e9 位元組，與 fb_month_usage.py 相同）超過依序進入下列模式；儲存量另有安全線 */
  var TIERS = [{ gb: 9.5, mode: 'readonly' }, { gb: 8.5, mode: 'noupload' }, { gb: 7, mode: 'thumb' }];
  var STORAGE_STOP_GB = 0.9;       /* 免費方案儲存上限 1 GB；到 0.9 GB 先停止上傳 */
  var MODE_RANK = { normal: 0, thumb: 1, noupload: 2, readonly: 3 };
  var MODE_TEXT = {
    normal: '正常', thumb: '縮圖模式：只載縮圖，原圖先不載入', noupload: '暫停上傳圖片：文字還能編輯',
    readonly: '唯讀：今天先看就好，不能再改'
  };

  function arr(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) { return x[k]; }) : []); }
  function str(x) { return typeof x === 'string' ? x.trim() : ''; }
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clip(s, n) { return Array.from(String(s === undefined || s === null ? '' : s)).slice(0, n).join(''); }

  /* ———— 六個案例：配色、icon、樣板 ———— */
  var CASES = {
    sms:   { letter: 'C', name: '離院衛教簡訊', color: '#3d6fe0', icon: '💬', hero: '收到衛教簡訊的病人',
             gap: '第 4 格寫不出他為什麼讀不下去：回去問問收到簡訊的人。',
             cells: [['看完診', '診間（看診快結束時）', '他離開診間時，手上拿到什麼、聽到什麼？'], ['資訊站發簡訊', '護理站旁的資訊站', '簡訊是誰、用什麼方式寄出的？'],
                     ['收到連結', '病人的手機上', '他收到時在做什麼？看到的第一眼是什麼？'], ['點開讀不下去', '家裡或回程路上', '哪一句讓他停下來？他心裡怎麼想？'],
                     ['家人問起', '家裡', '家人問了什麼？他答得出來嗎？'], ['關鍵時刻', '故事裡最卡的那一刻', '用一句話寫：他在哪一刻最卡、為什麼。']] },
    wait:  { letter: 'W', name: '候診與叫號', color: '#f08300', icon: '⏳', hero: '在候診區等叫號的人',
             gap: '第 4 格寫不出他怎麼錯過叫號：回去問問當時在場的人。',
             cells: [['抽號', '候診區的抽號機前', '他怎麼拿到號碼？他以為這個號碼代表什麼？'], ['一直等', '候診區座位', '他等的時候看著什麼、想什麼？'],
                     ['想去洗手間', '候診區到洗手間的路上', '他為什麼猶豫要不要離開？'], ['錯過叫號', '叫號螢幕前', '他怎麼知道（或不知道）被叫過了？'],
                     ['回來找人問', '服務台或護理站', '他問了誰？得到什麼回答？'], ['關鍵時刻', '故事裡最卡的那一刻', '用一句話寫：他在哪一刻最卡、為什麼。']] },
    way:   { letter: 'N', name: '尋路與標示', color: '#6aa81a', icon: '🧭', hero: '拿著檢查單找路的人',
             gap: '第 3 格寫不出他在哪裡看不懂牌子：回去問問走過那條路的人。',
             cells: [['拿著檢查單', '急診入口', '他拿著什麼要去哪裡？他以為路很好找嗎？'], ['入口兩種箭頭', '入口的指標前', '他看到哪兩種箭頭？選了哪一個？'],
                     ['轉彎沒續牌', '走廊轉角', '轉彎之後他看到什麼？沒看到什麼？'], ['問服務台', '服務台', '他怎麼開口問？對方怎麼回答？'],
                     ['走錯又回頭', '走廊', '他發現走錯時的反應是什麼？'], ['關鍵時刻', '故事裡最卡的那一刻', '用一句話寫：他在哪一刻最卡、為什麼。']] },
    forms: { letter: 'F', name: '表單與同意書', color: '#8250e0', icon: '📝', hero: '要填表單的病人或家屬',
             gap: '第 4 格寫不出家屬能不能代填：回去問問櫃台的人。',
             cells: [['掛號又寫一次', '掛號櫃台', '同樣的資料他寫了幾次？他怎麼想？'], ['小字看不清', '櫃台前的桌面', '哪一段字他看不清？他怎麼處理？'],
                     ['簽名格在哪', '同意書上', '他找了多久才找到該簽的地方？'], ['女兒能不能代填', '櫃台', '誰問了這個問題？得到的回答是什麼？'],
                     ['被退回重簽', '櫃台', '被退回時他說了什麼、做了什麼？'], ['關鍵時刻', '故事裡最卡的那一刻', '用一句話寫：他在哪一刻最卡、為什麼。']] },
    pay:   { letter: 'P', name: '繳費與藥袋', color: '#e0457b', icon: '💳', hero: '離院要結帳領藥的人',
             gap: '第 2 格寫不出他在自助機哪裡卡住：回去問問用過機器的人。',
             cells: [['看不懂縮寫', '離院結帳處', '單子上哪個縮寫他看不懂？他猜它是什麼？'], ['自助機找不到確認鍵', '自助繳費機前', '他按了哪些鍵？後面的人怎麼反應？'],
                     ['號碼不同套', '結帳櫃台與藥局之間', '他拿到幾種號碼？分得清楚嗎？'], ['等領藥', '藥局窗口前', '他等的時候在想什麼？'],
                     ['藥袋先看哪行', '藥局窗口前', '拿到藥袋後他先看哪一行？漏看了哪一行？'], ['關鍵時刻', '故事裡最卡的那一刻', '用一句話寫：他在哪一刻最卡、為什麼。']] },
    peds:  { letter: 'K', name: '兒科家長衛教', color: '#14a08c', icon: '🧸', hero: '抱著孩子的家長',
             gap: '第 3 格寫不出他怎麼找車：回去問問當時陪著孩子的人。',
             cells: [['抱著孩子聽交代', '兒科診間', '他一手抱著孩子，聽到哪些交代？記得幾句？'], ['拿到好幾張紙', '診間門口', '他拿到哪幾張紙？怎麼收？'],
                     ['找車', '停車場', '找車時他在想什麼？紙放在哪裡？'], ['回訊息給伴侶', '車上', '他怎麼把交代轉述給另一半？'],
                     ['回家翻紙', '家裡', '他翻紙找什麼？找到了嗎？'], ['關鍵時刻', '故事裡最卡的那一刻', '用一句話寫：他在哪一刻最卡、為什麼。']] }
  };
  var CASE_ORDER = ['sms', 'wait', 'way', 'forms', 'pay', 'peds'];
  function caseInfo(id) { var c = CASES[id] || CASES.sms; return { id: CASES[id] ? id : 'sms', letter: c.letter, name: c.name, color: c.color, icon: c.icon, hero: c.hero, gap: c.gap }; }
  function template(id) { var c = CASES[id] || CASES.sms; return c.cells.map(function (a, i) { return { n: i + 1, title: a[0], where: a[1], ask: a[2], moment: i === c.cells.length - 1 }; }); }

  /* ———— 三則複製用的圖片生成指令：留空格讓學生自己填 ———— */
  var PROMPTS = [
    { name: '① 先生成主角設定圖', text: '畫一位【　年齡、外觀、穿著　】的人物，正面與側面各一，【　你選的畫風　】，白底，不要任何文字。' },
    { name: '② 用設定圖畫一格', text: '用上一張圖裡同一個人，畫【　這一格的場景：在哪、做什麼　】，他的表情是【　從訪談判斷的情緒　】，比例【　16:9／1:1／9:16　】。' },
    { name: '③ 統一畫風', text: '把這張圖改成跟前面幾格一樣的畫風與配色，人物長相不要變。' }
  ];

  /* ———— 進入條件 ———— */
  function filled(r) {
    if (!r || !r.items) return false;
    return ['surface', 'events', 'need'].some(function (k) { var it = r.items[k]; return it && (it.done || str(it.note)); });
  }
  function interviewCount(player) { return arr(player && player.interviews).filter(filled).length; }
  /* 回傳 { ok, reason, msg, count }。reason：no-sid／no-room／loading／not-member／no-interview／ok */
  function canEnter(o) {
    o = o || {};
    if (!o.sid) return { ok: false, reason: 'no-sid', msg: '請先從急診室登入，再回來開故事板。', count: 0 };
    if (!o.code) return { ok: false, reason: 'no-room', msg: '故事板要從一間房開始：先回急診室，進到你訪談過的那間房。', count: 0 };
    var room = o.room;
    if (!room) return { ok: false, reason: 'no-room', msg: '找不到這間房（' + esc(o.code) + '）。請確認房號。', count: 0 };
    if (room._stub || (room.players === undefined && !room.members)) return { ok: false, reason: 'loading', msg: '房間資料還在載入…', count: 0 };
    var members = room.members || {};
    if (!Object.prototype.hasOwnProperty.call(members, String(o.sid))) return { ok: false, reason: 'not-member', msg: '你不是這間房的成員，不能開它的故事板。', count: 0 };
    var n = interviewCount(o.player);
    if (n < 1) return { ok: false, reason: 'no-interview', msg: '先去這間房訪談：故事板要用你訪談來的內容，不能憑空寫。至少要有 1 筆訪談紀錄。', count: 0 };
    return { ok: true, reason: 'ok', msg: '', count: n };
  }

  /* ———— 格子 ———— */
  function emptyCell(n) {
    return { n: n, title: '', who: '', where: '', what: '', think: '', pain: '', moment: false, refs: [], by: '', createdAt: 0, updatedAt: 0, updatedBy: '',
      editors: {}, needHelp: false, helpAsk: '', helped: '', draft: null, er: null, img: null, fit: 'contain' };
  }
  function normCell(c, n) {
    var o = emptyCell(Number(c && c.n) || n || 1);
    if (!c || typeof c !== 'object') return o;
    ['title', 'who', 'where', 'what', 'think', 'pain', 'by', 'updatedBy', 'helpAsk', 'helped'].forEach(function (k) { o[k] = typeof c[k] === 'string' ? c[k] : (c[k] == null ? '' : String(c[k])); });
    o.moment = !!c.moment; o.needHelp = !!c.needHelp; o.fit = c.fit === 'cover' ? 'cover' : 'contain';
    o.createdAt = Number(c.createdAt) || 0; o.updatedAt = Number(c.updatedAt) || 0;
    o.refs = arr(c.refs).map(String).filter(Boolean);
    o.editors = c.editors && typeof c.editors === 'object' ? copy(c.editors) : {};
    o.draft = c.draft && typeof c.draft === 'object' ? { who: str(c.draft.who), where: str(c.draft.where), what: str(c.draft.what), think: str(c.draft.think) } : null;
    o.er = c.er && typeof c.er === 'object' ? { r: Number(c.er.r), band: String(c.er.band || '') } : null;
    o.img = c.img && typeof c.img === 'object' ? { ar: Number(c.img.ar) || 1, w: Number(c.img.w) || 0, h: Number(c.img.h) || 0, ts: Number(c.img.ts) || 0 } : null;
    return o;
  }
  function normBoard(raw) {
    var rc = raw && raw.cells, cells = [];
    if (Array.isArray(rc)) cells = rc.map(function (c, i) { return normCell(c, i); });
    else if (rc && typeof rc === 'object') cells = Object.keys(rc).map(function (k, i) { var m = /^s(\d+)$/.exec(k); return normCell(Object.assign({}, rc[k], m ? { n: Number(m[1]) } : {}), i + 1); });   /* 序號以鍵為準（s4 就是第 4 格） */
    cells = cells.filter(function (c) { return c.n >= 1 && c.n <= LIMITS.maxCells; });
    cells.sort(function (a, b) { return a.n - b.n; });
    return { cells: cells };
  }
  function slotKey(n) { return 's' + n; }
  function contentOf(c) { return [c.who, c.where, c.what, c.think].map(str).join('\n').replace(/^\n+|\n+$/g, ''); }
  function hasContent(c) { return !!(str(c.what) || str(c.think)); }
  function needsSource(c) { return hasContent(c) && (!c.refs || c.refs.length === 0); }
  function cellStatus(c) { return !hasContent(c) ? 'empty' : (needsSource(c) ? 'nosource' : 'ok'); }
  /* 六要素：誰、在哪、發生什麼、他怎麼想、痛點句、出處 */
  function cellChecks(c) {
    return [['誰', !!str(c.who)], ['在哪', !!str(c.where)], ['發生什麼', !!str(c.what)], ['他怎麼想', !!str(c.think)], ['痛點句', !!str(c.pain) && (c.what + '\n' + c.think).indexOf(c.pain) >= 0], ['出處', c.refs.length > 0]]
      .map(function (a) { return { name: a[0], ok: a[1] }; });
  }
  function gapMessage(c, cs) {
    var st = cellStatus(c);
    if (st === 'empty') return '這格還是空的：從左邊的素材拖一個片段進來，或回去再問一個人。';
    if (st === 'nosource') return '這格沒有出處：回去再問一個人，或把訪談卡的編號放進來。';
    return '';
  }

  /* ———— 痛點句切段（紅字） ———— */
  function splitPain(text, pain) {
    text = String(text || ''); pain = String(pain || '');
    var i = pain ? text.indexOf(pain) : -1;
    if (i < 0) return text ? [{ t: text, pain: false }] : [];
    var out = [];
    if (i > 0) out.push({ t: text.slice(0, i), pain: false });
    out.push({ t: pain, pain: true });
    if (i + pain.length < text.length) out.push({ t: text.slice(i + pain.length), pain: false });
    return out;
  }

  /* ———— 編輯比例：與系統草稿比較，字元層級的編輯距離 ÷ 較長一邊 ———— */
  function levenshtein(a, b) {
    if (a.length === 0) return b.length; if (b.length === 0) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j += 1) prev[j] = j;
    for (i = 1; i <= a.length; i += 1) {
      cur[0] = i;
      for (j = 1; j <= b.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      var t = prev; prev = cur; cur = t;
    }
    return prev[b.length];
  }
  function draftText(d) { return d ? [d.who, d.where, d.what, d.think].map(str).join('\n') : ''; }
  function editRatio(draft, cell) {
    var cur = contentOf(cell); if (!cur) return null;
    var base = draftText(draft); if (!base.replace(/\n/g, '')) return 1;
    var a = Array.from(base), b = Array.from(cur), denom = Math.max(a.length, b.length);
    return denom ? Math.min(1, levenshtein(a, b) / denom) : null;
  }
  function band(r) { if (r === null || r === undefined || isNaN(r)) return ''; return r < 0.2 ? 'copy' : (r <= 0.6 ? 'rewrite' : 'own'); }
  var BAND_TEXT = { copy: '照抄草稿', rewrite: '改寫', own: '自己寫', '': '還沒寫' };
  function bandText(b) { return BAND_TEXT[b] || BAND_TEXT['']; }
  /* 一個人在一面板上的編輯比例摘要：只算他當作者（by）的格子 */
  function authorSummary(cells) {
    var by = {};
    cells.forEach(function (c) {
      if (!c.by || !c.er || isNaN(c.er.r)) return;
      var a = by[c.by] = by[c.by] || { sid: c.by, cells: 0, sum: 0, copy: 0, rewrite: 0, own: 0 };
      a.cells += 1; a.sum += c.er.r; a[band(c.er.r)] += 1;
    });
    return Object.keys(by).map(function (k) { var a = by[k]; a.avg = a.cells ? a.sum / a.cells : 0; a.band = band(a.avg); return a; }).sort(function (x, y) { return x.sid < y.sid ? -1 : 1; });
  }

  /* ———— 套用一次編輯：回傳新格子（不改原物件），並記作者、接力、補位、編輯比例 ———— */
  function applyEdit(cell, patch, sid, now) {
    var prev = normCell(cell, cell && cell.n), next = copy(prev), had = hasContent(prev), before = contentOf(prev);
    patch = patch || {};
    ['title', 'who', 'where', 'what', 'think'].forEach(function (k) { if (patch[k] !== undefined) next[k] = clip(patch[k], k === 'title' ? 24 : LIMITS.field[k]); });
    if (patch.pain !== undefined) next.pain = clip(patch.pain, 140);
    if (patch.moment !== undefined) next.moment = !!patch.moment;
    if (patch.fit !== undefined) next.fit = patch.fit === 'cover' ? 'cover' : 'contain';
    if (patch.refs !== undefined) next.refs = arr(patch.refs).map(String).filter(Boolean).slice(0, 12);
    if (next.pain && (next.what + '\n' + next.think).indexOf(next.pain) < 0) next.pain = '';   /* 句子被改掉了，紅標跟著拿掉 */
    var changed = contentOf(next) !== before;
    if (!next.createdAt) next.createdAt = now;
    if (!had && hasContent(next) && !next.by) next.by = String(sid);
    else if (had && changed && next.by && next.by !== String(sid)) next.editors[String(sid)] = 1;
    if (patch.needHelp !== undefined) {
      if (patch.needHelp && !next.needHelp) { next.needHelp = true; next.helpAsk = String(sid); next.helped = ''; }
      else if (!patch.needHelp) next.needHelp = false;
    }
    if (next.needHelp && String(sid) !== next.helpAsk && changed && hasContent(next) && next.refs.length > 0) { next.helped = String(sid); next.needHelp = false; }
    next.updatedAt = now; next.updatedBy = String(sid);
    var r = editRatio(next.draft, next);
    next.er = r === null ? null : { r: Math.round(r * 1000) / 1000, band: band(r) };
    return next;
  }

  /* 要寫進資料庫的差異路徑（只寫變動的欄位，兩個人改同一格的不同欄位不會互蓋） */
  function diffPaths(prev, next) {
    var out = {}, p = prev || emptyCell(next.n);
    ['title', 'who', 'where', 'what', 'think', 'pain', 'by', 'updatedBy', 'helpAsk', 'helped', 'fit'].forEach(function (k) { if (next[k] !== p[k]) out[k] = next[k] === '' ? null : next[k]; });
    ['moment', 'needHelp'].forEach(function (k) { if (next[k] !== p[k]) out[k] = next[k] ? true : null; });
    ['n', 'createdAt', 'updatedAt'].forEach(function (k) { if (next[k] !== p[k]) out[k] = next[k] || null; });
    if (!prev) out.n = next.n;   /* 第一次寫這格一定要帶序號 */
    if (JSON.stringify(next.refs) !== JSON.stringify(p.refs)) out.refs = next.refs.length ? next.refs : null;
    ['draft', 'er', 'img'].forEach(function (k) { if (JSON.stringify(next[k]) !== JSON.stringify(p[k])) out[k] = next[k] || null; });
    Object.keys(next.editors || {}).forEach(function (s) { if (!(p.editors || {})[s]) out['editors/' + s] = 1; });
    return out;
  }

  /* ———— 分鏡草稿：用我的訪談紀錄的字句填樣板；找不到出處的格子留空並標示缺口 ———— */
  function fragments(interviews, names) {
    var out = [];
    arr(interviews).forEach(function (r) {
      if (!filled(r)) return;
      ['events', 'surface', 'need'].forEach(function (k) {
        var it = r.items[k]; var t = it && str(it.note); if (!t) return;
        out.push({ text: t, kind: k, recId: r.id, pid: r.personaId, name: (names && names[r.personaId]) || r.personaId || '', tags: arr(it.tags), trust: it.trust || '' });
      });
    });
    return out;
  }
  function makeDraft(caseId, interviews, opts) {
    opts = opts || {}; var names = opts.names || {}, info = caseInfo(caseId), tpl = template(caseId).slice(0, opts.count || LIMITS.defaultCells);
    var fr = fragments(interviews, names), used = {};
    function take(kinds, tagged) {
      for (var i = 0; i < fr.length; i += 1) { var f = fr[i]; if (used[i]) continue; if (kinds.indexOf(f.kind) < 0) continue; if (tagged && !f.tags.length) continue; used[i] = 1; return f; }
      return null;
    }
    var hero = (opts.heroId && names[opts.heroId]) || info.hero, heroDone = !!(opts.heroId && fr.some(function (f) { return f.pid === opts.heroId; }));
    var momentFrag = take(['need', 'surface', 'events'], true) || null;   /* 標了痛點標籤的話先留給關鍵時刻那一格 */
    var cells = tpl.map(function (t, i) {
      var c = emptyCell(t.n); c.title = t.title; c.where = t.where; c.who = heroDone ? hero : info.hero; c.moment = !!t.moment;
      var a = t.moment ? (momentFrag || take(['need', 'surface', 'events'])) : (take(['events']) || take(['surface']));
      var b = t.moment ? null : take(['need']);
      var refs = [];
      if (a) { c.what = clip(a.text, LIMITS.field.what); refs.push(a.recId); }
      if (b) { c.think = clip(b.text, LIMITS.field.think); if (refs.indexOf(b.recId) < 0) refs.push(b.recId); }
      if (t.moment && a) { c.think = clip(a.text, LIMITS.field.think); c.what = ''; }
      c.refs = refs;
      c.draft = hasContent(c) ? { who: c.who, where: c.where, what: c.what, think: c.think } : null;
      return c;
    });
    return { cells: cells, gaps: cells.filter(function (c) { return !hasContent(c); }).map(function (c) { return c.n; }) };
  }

  /* ———— 額度（台灣時間） ———— */
  function dayKey(ts) { var d = new Date(Number(ts) + LIMITS.tzOffsetMs); return d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2); }
  function nextResetTs(ts) { var d = new Date(Number(ts) + LIMITS.tzOffsetMs); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - LIMITS.tzOffsetMs; }
  function resetLabel() { return '明天 00:00'; }
  function bumpFn(limit) { return function (cur) { cur = Number(cur) || 0; return cur >= limit ? undefined : cur + 1; }; }
  function dropFn() { return function (cur) { cur = Number(cur) || 0; return cur > 0 ? cur - 1 : 0; }; }
  function quotaView(o) {
    o = o || {}; var mode = o.mode || 'normal';
    var userLeft = Math.max(0, LIMITS.perUserPerDay - (Number(o.userUsed) || 0)), siteLeft = Math.max(0, LIMITS.sitePerDay - (Number(o.siteUsed) || 0));
    var left = Math.min(userLeft, siteLeft), why = 'ok';
    if (mode === 'readonly') { left = 0; why = 'readonly'; }
    else if (mode === 'noupload') { left = 0; why = 'mode-noupload'; }
    else if (userLeft <= 0) why = 'user-limit'; else if (siteLeft <= 0) why = 'site-limit';
    return { userLeft: userLeft, siteLeft: siteLeft, left: left, canUpload: left > 0, why: why };
  }
  function banner(left) { return '今天還能上傳 ' + left + ' 張・下次重置 ' + resetLabel(); }
  var WHY_TEXT = { ok: '', 'user-limit': '你今天的 ' + LIMITS.perUserPerDay + ' 張用完了，文字還能繼續改，明天 00:00 再傳。', 'site-limit': '全班今天的圖片名額用完了，明天 00:00 再傳。',
    'mode-noupload': '系統為了保護資料庫，暫時停止上傳圖片，文字還能改。', readonly: '系統為了保護資料庫，今天先唯讀，只能看不能改。' };

  /* ———— 全站保護 ———— */
  function protection(downloadGB, storageGB) {
    var m = 'normal', g = Number(downloadGB);
    if (isFinite(g)) for (var i = TIERS.length - 1; i >= 0; i -= 1) { if (g >= TIERS[i].gb) m = TIERS[i].mode; }
    var s = Number(storageGB);
    if (isFinite(s) && s >= STORAGE_STOP_GB && MODE_RANK[m] < MODE_RANK.noupload) m = 'noupload';
    return m;
  }
  function opsState(ops, now) {
    if (!ops || typeof ops !== 'object') return { mode: 'normal', known: false, stale: true, gb: null };
    var gb = ops.downloadGB !== undefined ? Number(ops.downloadGB) : (ops.downloadBytes !== undefined ? Number(ops.downloadBytes) / 1e9 : NaN), sg = ops.storageGB !== undefined ? Number(ops.storageGB) : (ops.storageBytes !== undefined ? Number(ops.storageBytes) / 1e9 : NaN);
    var stale = !(Number(ops.updatedAt) > 0) || (now - Number(ops.updatedAt) > LIMITS.opsStaleMs);
    return { mode: protection(gb, sg), known: true, incomplete: !isFinite(gb), stale: stale, gb: isFinite(gb) ? gb : null, storageGB: isFinite(sg) ? sg : null, peak: Number(ops.peakConn) || 0, text: MODE_TEXT[protection(gb, sg)] };
  }
  function canWrite(mode) { return mode !== 'readonly'; }
  function canUploadMode(mode) { return mode === 'normal' || mode === 'thumb'; }
  function loadFull(mode) { return mode === 'normal'; }

  /* ———— 圖片壓縮：尺寸與預算（encode 由呼叫端提供，這裡不碰 canvas） ———— */
  function fitSize(w, h, maxLong) {
    w = Number(w) || 1; h = Number(h) || 1;
    var s = Math.min(1, maxLong / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s };
  }
  function fitToBudget(encode, w, h, o) {
    o = o || {}; var maxLong = o.maxLong || LIMITS.fullLong, maxBytes = o.maxBytes || LIMITS.fullBytes, q0 = o.q0 || 0.85, qMin = o.qMin || 0.35, qStep = o.qStep || 0.1, shrink = o.shrink || 0.85, minLong = o.minLong || 96;
    var d = fitSize(w, h, maxLong), iters = 0, last = null;
    for (var round = 0; round < 40; round += 1) {
      for (var q = q0; q >= qMin - 1e-9; q -= qStep) {
        iters += 1; var bytes = encode(d.w, d.h, Math.round(q * 100) / 100); last = { w: d.w, h: d.h, q: Math.round(q * 100) / 100, bytes: bytes };
        if (bytes <= maxBytes) { last.ok = true; last.iters = iters; return last; }
      }
      if (Math.max(d.w, d.h) <= minLong) break;
      d = { w: Math.max(1, Math.round(d.w * shrink)), h: Math.max(1, Math.round(d.h * shrink)) };
    }
    last = last || { w: d.w, h: d.h, q: qMin, bytes: Infinity }; last.ok = false; last.iters = iters; return last;
  }
  function dataUrlBytes(u) { u = String(u || ''); var i = u.indexOf(','); if (i < 0) return 0; var b = u.slice(i + 1), pad = (b.match(/=+$/) || [''])[0].length; return Math.floor(b.length * 3 / 4) - pad; }
  /* 任何長寬比都放得進格子：回傳在 bw×bh 框內保持比例的大小（contain） */
  function containRect(ar, bw, bh) {
    ar = Number(ar) > 0 ? Number(ar) : 1; var w = bw, h = bw / ar;
    if (h > bh) { h = bh; w = bh * ar; }
    return { w: Math.round(w), h: Math.round(h) };
  }

  /* ———— 合作成就（判準寫在這裡） ———— */
  /* ctx：{ sid, wall: 牆上的格子, mine: 我的故事板格子, interviews: 我現在的訪談紀錄, baseline: { recIds, personas }（第一次開故事板當下的快照） } */
  function achievements(ctx) {
    ctx = ctx || {}; var me = String(ctx.sid || ''), wall = (ctx.wall || []).map(function (c) { return normCell(c, c && c.n); }), mine = (ctx.mine || []).map(function (c) { return normCell(c, c && c.n); });
    var filledWall = wall.filter(hasContent), authors = {};
    filledWall.forEach(function (c) { if (c.by) authors[c.by] = (authors[c.by] || 0) + 1; });
    var together = Object.keys(authors).length >= 2 && !!authors[me];
    var relay = wall.some(function (c) { return hasContent(c) && c.by && c.by !== me && c.editors[me]; });
    var fill = wall.some(function (c) { return c.helped === me && c.helpAsk && c.helpAsk !== me; });
    var revisit = false, base = ctx.baseline;
    if (base && arr(base.recIds).length) {
      var baseRecs = {}, basePers = {}; arr(base.recIds).forEach(function (r) { baseRecs[r] = 1; }); arr(base.personas).forEach(function (p) { basePers[p] = 1; });
      var mineRecs = {}; arr(ctx.interviews).forEach(function (r) { if (r && r.id && filled(r)) mineRecs[r.id] = r; });
      revisit = wall.concat(mine).some(function (c) {
        return c.by === me && c.refs.some(function (id) { var r = mineRecs[id]; return r && !baseRecs[id] && r.personaId && !basePers[r.personaId]; });
      });
    }
    var full = filledWall.length >= LIMITS.defaultCells && wall.every(function (c) { return hasContent(c) && c.img && c.refs.length > 0; }) && wall.some(function (c) { return c.moment; }) && Object.keys(authors).length >= 2;
    var premiere = full && !!authors[me];
    return [
      { id: 'together', icon: '🤝', name: '一起說故事', got: together, desc: '牆上至少有 2 個人各寫了格子，其中有你的。' },
      { id: 'relay', icon: '🧩', name: '接力一格', got: relay, desc: '接著改別人寫的格子，把故事往下接。' },
      { id: 'fill', icon: '🩹', name: '補位', got: fill, desc: '別人標「這格寫不出來」，你補上內容和出處。' },
      { id: 'revisit', icon: '🔁', name: '回頭再問', got: revisit, desc: '開了故事板之後，回去訪談一位新的人，並把他的話放進故事板。' },
      { id: 'premiere', icon: '🎬', name: '首映', got: premiere, desc: '牆上至少 ' + LIMITS.defaultCells + ' 格全部有圖、有內容、有出處，並標出關鍵時刻。' }
    ];
  }

  /* ———— 可列印的一頁（給學生另存 PDF 交作業） ———— */
  function printHtml(board, meta, imgs) {
    meta = meta || {}; imgs = imgs || {}; var info = caseInfo(meta.caseId);
    function seg(t, p) { return splitPain(t, p).map(function (s) { return s.pain ? '<mark class="pain">' + esc(s.t) + '</mark>' : esc(s.t); }).join(''); }
    var cells = (board.cells || []).map(function (c) {
      var im = imgs[slotKey(c.n)];
      return '<section class="pc' + (c.moment ? ' moment' : '') + '"><h3>' + c.n + '　' + esc(c.title || '') + (c.moment ? '　★關鍵時刻' : '') + '</h3>' +
        (im ? '<div class="pi"><img alt="" src="' + esc(im) + '"></div>' : '<div class="pi none">（這格沒有圖）</div>') +
        '<p><b>誰</b>　' + esc(c.who) + '　<b>在哪</b>　' + esc(c.where) + '</p>' +
        '<p><b>發生什麼</b>　' + seg(c.what, c.pain) + '</p><p><b>他怎麼想</b>　' + seg(c.think, c.pain) + '</p>' +
        '<p class="src">出處：' + (c.refs.length ? esc(c.refs.join('、')) : '（還沒有出處）') + '　作者：' + esc(c.by || '') + '</p></section>';
    }).join('');
    return '<header><h2>' + esc(info.icon) + ' ' + esc(info.name) + '　UX 故事板</h2><p>房間 ' + esc(meta.code || '') + '　' + esc(meta.boardName || '') + '　學號 ' + esc(meta.sid || '') + '　' + esc(meta.date || '') + '</p></header>' + cells;
  }

  /* 牆的整體統計（老師面板用） */
  function boardStats(board) {
    var cells = board.cells || [], au = {};
    cells.forEach(function (c) { if (c.by) au[c.by] = 1; });
    return { cells: cells.length, filled: cells.filter(hasContent).length, withImg: cells.filter(function (c) { return !!c.img; }).length, withRefs: cells.filter(function (c) { return c.refs.length > 0; }).length,
      moments: cells.filter(function (c) { return c.moment; }).length, authors: Object.keys(au).length, needHelp: cells.filter(function (c) { return c.needHelp; }).length };
  }

  return { LIMITS: LIMITS, TIERS: TIERS, STORAGE_STOP_GB: STORAGE_STOP_GB, MODE_TEXT: MODE_TEXT, CASES: CASES, CASE_ORDER: CASE_ORDER, PROMPTS: PROMPTS, WHY_TEXT: WHY_TEXT,
    esc: esc, arr: arr, clip: clip, caseInfo: caseInfo, template: template, filled: filled, interviewCount: interviewCount, canEnter: canEnter,
    emptyCell: emptyCell, normCell: normCell, normBoard: normBoard, slotKey: slotKey, contentOf: contentOf, hasContent: hasContent, needsSource: needsSource, cellStatus: cellStatus, cellChecks: cellChecks, gapMessage: gapMessage,
    splitPain: splitPain, levenshtein: levenshtein, editRatio: editRatio, band: band, bandText: bandText, authorSummary: authorSummary,
    applyEdit: applyEdit, diffPaths: diffPaths, fragments: fragments, makeDraft: makeDraft,
    dayKey: dayKey, nextResetTs: nextResetTs, resetLabel: resetLabel, bumpFn: bumpFn, dropFn: dropFn, quotaView: quotaView, banner: banner,
    protection: protection, opsState: opsState, canWrite: canWrite, canUploadMode: canUploadMode, loadFull: loadFull,
    fitSize: fitSize, fitToBudget: fitToBudget, dataUrlBytes: dataUrlBytes, containRect: containRect,
    achievements: achievements, printHtml: printHtml, boardStats: boardStats };
});
