/* 第 8 週：UX 故事板的基本教學內容與大廳入口。
   資料驅動：六個案例的樣板標題、七個步驟、三個圖片生成指令、三個常見錯都是表；畫面由純函式組出 HTML 字串（測試用）。
   瀏覽器端：mountGuide(容器, {caseId, ...}) 綁切換鈕與複製鈕；大廳入口由 game.js 呼叫 lobbyHtml()。
   學生看得到的字全部用學生的說法，不放老師備課的詞。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./report_level.js'), require('./case_tone.js'));
  else root.ERG_STORYBOARD = factory(root.ERG_REPORT_LEVEL, root.ERG_CASE_TONE);
})(typeof self !== 'undefined' ? self : this, function (RL, TONE) {
  'use strict';

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* 案例樣板：6 格標題（第 6 格一定是關鍵時刻），place＝第 1 格的場景（示範用） */
  var TEMPLATES = {
    sms:   { cells: ['看完診', '資訊站發簡訊', '收到連結', '點開讀不下去', '家人問起', '關鍵時刻'], place: '診間（看診快結束時）' },
    wait:  { cells: ['抽號', '一直等', '想去洗手間', '錯過叫號', '回來找人問', '關鍵時刻'], place: '候診區的抽號機前' },
    way:   { cells: ['拿著檢查單', '入口兩種箭頭', '轉彎沒續牌', '問服務台', '走錯又回頭', '關鍵時刻'], place: '急診入口' },
    forms: { cells: ['掛號又寫一次', '小字看不清', '簽名格在哪', '女兒能不能代填', '被退回重簽', '關鍵時刻'], place: '掛號櫃台' },
    pay:   { cells: ['看不懂縮寫', '自助機找不到確認鍵', '號碼不同套', '等領藥', '藥袋先看哪行', '關鍵時刻'], place: '離院結帳處' },
    peds:  { cells: ['抱著孩子聽交代', '拿到好幾張紙', '找車', '回訊息給伴侶', '回家翻紙', '關鍵時刻'], place: '兒科診間' }
  };
  var ORDER = ['sms', 'wait', 'way', 'forms', 'pay', 'peds'];

  var STEPS = [
    { t: '匯出這間房的訪談報告', d: '看報告封面的等級和「訪談覆蓋表」，主角問過了沒有；沒問過的，先回急診室補問。' },
    { t: '還原 2 位人物誌', d: '至少 1 位是病人或家屬。在報告裡那位人物的卡片按「複製 Persona 框架」，貼到 Gemini；每一欄都要留著出處，自己猜的寫「推測」。' },
    { t: '列 10–15 個故事片段', d: '從報告最後面的「故事片段清單」挑，保留 S 編號和出處。' },
    { t: '照樣板排 6 格', d: '每一格寫四件事：誰、在哪、發生什麼、他怎麼想。痛點那一句標成紅色。' },
    { t: '找出關鍵時刻', d: '用一句話寫出主角在哪一刻最卡、為什麼。' },
    { t: '用 Gemini 生成圖片', d: '先用這頁的「三個 AI 圖片生成指令」，把黃色的地方換成自己的內容。先生成主角設定圖，再一格一格生成；做好的圖在故事板每一格按「選圖」放進去（電腦也可以直接拖進格子）。' },
    { t: '看缺口回去補訪', d: '回到報告看覆蓋表和「離下一級還差」，哪一格寫不出來，就回去問那個人。' }
  ];

  var PROMPTS = [
    { name: '① 先生成主角設定圖', text: '畫一位【從人物誌填：年齡、外觀、穿著】的人物，正面與側面各一，【你選的畫風】，白底，不要任何文字。' },
    { name: '② 生成某一格', text: '用上一張圖裡同一個人，畫【這一格的場景：在哪、做什麼】，他的表情是【從訪談判斷的情緒】，比例【16:9／1:1／9:16】。' },
    { name: '③ 統一畫風', text: '把這張圖改成跟前面幾格一樣的畫風與配色，人物長相不要變。' }
  ];

  var ERRORS = [
    { t: '主角消失', d: '六格裡有幾格看不到主角。每一格都要有他，故事才是他的。' },
    { t: '直接寫解法，沒有關鍵時刻', d: '第 6 格寫的是「做一個提醒功能」。先寫他在哪一刻最卡、為什麼，再談怎麼改。' },
    { t: '讓 AI 改寫，把原話刪掉', d: '請 Gemini 潤飾之後，他說過的話和出處不見了。改寫完要回去對：原話還在不在、出處還在不在。' }
  ];

  /* 這個案例的重要人物：主角＋案例自己設定的人物；簡訊案例沒有自己的名單，用病人、家屬、兩種護理師 */
  function keyIds(caseId, meta, personas) {
    var out = [], main = meta && meta.mainPersona;
    if (main) out.push(main);
    (personas || []).forEach(function (p) { if (p && p.id && out.indexOf(p.id) < 0) out.push(p.id); });
    if (out.length <= 1) ['patient', 'family', 'triage_nurse', 'nurse'].forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
    return out;
  }

  /* 我在這個案例已經訪談過誰、還沒問過誰（interviews：我在這個案例所有房間的訪談紀錄） */
  function interviewedSummary(interviews, ids, names) {
    var got = {}; RL.interviewed(interviews).forEach(function (p) { got[p] = 1; });
    names = names || {};
    return { done: ids.filter(function (i) { return got[i]; }).map(function (i) { return names[i] || i; }), todo: ids.filter(function (i) { return !got[i]; }).map(function (i) { return names[i] || i; }) };
  }

  /* 大廳「我進過的房間」：rooms＝[{code, caseId, interviews, conclusions, markers, mainPersona}]，skill＝{ask,ctx} */
  /* 故事板入口的條件＝這間房至少有 1 張「有填的訪談卡」（RL.interviewed：檢核表至少打勾一項或寫了一句話）。
     光是跟人物聊天只會「開始訪談」（建立一張空的紀錄，started+1），不算訪談卡；要到房間右側「訪談」分頁的檢核表把問到的事打勾才算。
     row：{ cards: 有填的訪談卡數, started: 已開始訪談的人數（有紀錄但可能沒打勾） }；回傳 { ok, text, short } */
  function need(row) {
    row = row || {}; var cards = Number(row.cards) || 0, started = Number(row.started) || 0;
    if (cards >= 1) return { ok: true, text: '', short: '' };
    if (started > 0) return { ok: false, short: '還缺：訪談卡打勾', text: '還缺：訪談卡打勾——你已經開始跟 ' + started + ' 位聊了，但「訪談」分頁的檢核表還沒有打勾。到房間裡的「訪談」分頁，把問到的事打勾（「他一開始怎麼說」「那天發生了什麼事」「他真正需要什麼」，至少勾一項）。' };
    return { ok: false, short: '還缺：1 張訪談卡', text: '還缺：1 張訪談卡——先到這間房跟人物聊（點人物開始訪談），再到房間裡的「訪談」分頁的檢核表，把問到的事打勾（至少勾一項）。' };
  }
  /* 11-02：主按鈕開哪一間——訪談卡最多的那間（只算能開的）；同樣多就取最近進過的（lastRoom），再來是最近加入／進入的 */
  function pickMainRoom(rows, lastRoom) {
    var open = (rows || []).filter(function (x) { return x && x.open; }); if (!open.length) return null;
    var max = Math.max.apply(null, open.map(function (x) { return Number(x.cards) || 0; }));
    var top = open.filter(function (x) { return (Number(x.cards) || 0) === max; });
    var last = top.filter(function (x) { return x.code === lastRoom; })[0];
    if (last) return last;
    return top.slice().sort(function (a, b) { return (Number(b.seenAt) || 0) - (Number(a.seenAt) || 0); })[0];
  }
  /* 11-02：W8 卡只顯示「這位學生最前面沒做的一件」＋直接按鈕。
     m：{ main:{code}（能開故事板的那間）, P:{opened, filled, moment, img, personas, code（寫最多的那間）} 或 null（還讀不到）, mobile }
     順序：開故事板 → 幫我排草稿 → 繼續寫滿六格 → 標關鍵時刻 → 放圖 → 人物誌（要用電腦匯出報告）。goal 對應完成列的項目名稱。回傳 null＝沒有可開的房間或全部做完 */
  var IMG_GOAL = 'AI 生成圖片：放了圖片';   /* 完成列的第五項（判斷依據：故事板任一格放了圖），game.js 的 w8Steps 用同一個字串 */
  function nextAction(m) {
    m = m || {}; if (!m.main || !m.main.code) return null;
    var P = m.P, GOAL = '故事板 6 格有內容';
    if (!P) return { kind: 'link', label: '開故事板', href: 'storyboard.html?room=' + encodeURIComponent(m.main.code), goal: GOAL };
    var filled = Number(P.filled) || 0, code = filled > 0 && P.code ? P.code : m.main.code, href = 'storyboard.html?room=' + encodeURIComponent(code);
    if (!P.opened && filled === 0) return { kind: 'link', label: '開故事板', href: 'storyboard.html?room=' + encodeURIComponent(m.main.code), goal: GOAL };
    if (filled === 0) return { kind: 'link', label: '幫我排草稿', href: href + '&draft=1', goal: GOAL };
    if (filled < 6) return { kind: 'link', label: '繼續寫（已寫 ' + filled + '/6 格）', href: href, goal: GOAL };
    if (!P.moment) return { kind: 'link', label: '標出關鍵時刻', href: href, goal: '標出關鍵時刻' };
    if (!P.img) return { kind: 'link', label: '放一張圖', href: href, goal: IMG_GOAL };
    if ((Number(P.personas) || 0) < 2) return m.mobile ? { kind: 'pc', label: '人物誌：這步請用電腦', goal: '人物誌 2 位' } : { kind: 'export', label: '匯出訪談報告，做人物誌', code: m.main.code, goal: '人物誌 2 位' };
    return null;
  }
  /* 11-02 W9：大廳入口的提醒。依學生目前狀況分群（沿用 nextAction），每群一句「做什麼＋為什麼」；期限只放這個班的日期（判不出班級就不放） */
  var DUE = { W7: { '二丙': ['11/3 23:59', '2026-11-03T23:59:59+08:00'], '二乙': ['11/3 23:59', '2026-11-03T23:59:59+08:00'], '二甲': ['11/5', '2026-11-05T23:59:59+08:00'] },
    W8: { '二丙': ['11/24', '2026-11-24T23:59:59+08:00'], '二乙': ['11/24', '2026-11-24T23:59:59+08:00'], '二甲': ['11/26', '2026-11-26T23:59:59+08:00'] } };   /* 11-02：作業已延（二丙二乙 11/24、二甲 11/26） */
  function classOf(cls) { var c = String(cls || '').replace(/^.*(二[甲乙丙]).*$/, '$1'); return /^二[甲乙丙]$/.test(c) ? c : ''; }
  /* 只列還沒過的期限；now：毫秒時間 */
  function dueText(cls, now) {
    var c = classOf(cls); if (!c) return ''; var t = now == null ? Date.now() : now, out = [];
    ['W7', 'W8'].forEach(function (w) { var d = DUE[w][c]; if (d && t <= Date.parse(d[1])) out.push((w === 'W8' ? 'W8~9' : w) + ' ' + d[0]); });
    return out.length ? '你這班的作業期限：' + out.join('、') : '';
  }
  var W9_TEXT = {
    nocard: '先去問人：到房間裡點一位人物，在對話框直接問他（至少問到一位病人或家屬）；聊完到右側「訪談」分頁的檢核表至少勾一項，這才算一張訪談卡，故事板才打得開。',
    draft: '打開故事板，按「幫我排草稿」，再把草稿改成自己的話：草稿裡每一句都是你訪談的原話、附出處，改成自己的話才是你的故事。',
    writing: '一格一格寫：誰、在哪、發生什麼事、他怎麼想；寫滿六格，再標出關鍵時刻，看的人才知道痛點發生在哪一格。',
    img: '六格都寫好了，再放一張圖：把場景畫出來或生成圖片放進故事板，看的人一眼就看得懂。',
    persona_pc: '故事板寫好了，剩人物誌：按下面的「匯出訪談報告」，還原 2 位人物誌，故事裡的人才有訪談當依據。',
    persona_mobile: '故事板寫好了，剩人物誌：這一步要用電腦做（手機做不了），回電腦再完成。',
    done: '故事板都完成了。時間夠的話，回房間再問一位，把還不夠具體的格子補上。'
  };
  /* m：{ main, P, mobile, cls, now }；回傳 { group, text, due }。group：nocard／draft／writing／img／persona／done */
  function w9Reminder(m) {
    m = m || {}; var a = nextAction(m), g, key;
    if (!m.main || !m.main.code) g = key = 'nocard';
    else if (!a) g = key = 'done';
    else if (a.kind === 'pc' || a.kind === 'export') { g = 'persona'; key = a.kind === 'pc' ? 'persona_mobile' : 'persona_pc'; }
    else if (a.label === '放一張圖') g = key = 'img';
    else if (a.label === '開故事板') g = key = 'draft';
    else g = key = 'writing';   /* 幫我排草稿（已開板、還沒寫）／繼續寫／標出關鍵時刻 */
    return { group: g, text: W9_TEXT[key], due: dueText(m.cls, m.now) };
  }
  function reminderHtml(r) {
    if (!r) return '';
    return '<div class="sbRemind" id="w9Remind" data-group="' + esc(r.group) + '"><div>' + esc(r.text) + '</div>' + (r.due ? '<div class="sbDue">' + esc(r.due) + '</div>' : '') + '</div>';
  }
  function actHtml(a) {
    if (!a) return '';
    if (a.kind === 'export') return '<button type="button" class="sbNext" data-export="' + esc(a.code) + '">' + esc(a.label) + '</button>';
    if (a.kind === 'pc') return '<span class="sbNext pc" role="note">' + esc(a.label) + '</span>';
    return '<a class="btn sbNext" href="' + esc(a.href) + '">' + esc(a.label) + '</a>';
  }
  /* 11-02 楊老師「後面都要跟著行動導向的指引」：完成列裡還缺的每一項，都接「缺什麼（一句）→ 現在去做（動詞開頭、25 字內）→ 一顆直接按鈕」。
     key：cards／persona／cells／moment／img；m：{ main:{code}|null, P, mobile, revisit（沒有訪談卡時可回去的房間，沒有就空）}。
     回傳 { gap, todo, btn:{ kind: link|revisit|create|export, label, href|code } | null }。手機做不了的步驟 btn 為 null，只說改用電腦。 */
  function stepGuide(key, m) {
    m = m || {}; var P = m.P || {}, code = m.main && m.main.code ? m.main.code : '', filled = Number(P.filled) || 0, bc = filled > 0 && P.code ? P.code : code;
    var room = function (c, extra) { return 'storyboard.html?room=' + encodeURIComponent(c) + (extra || ''); };
    var toRoom = m.revisit ? { kind: 'revisit', label: '去訪談', code: m.revisit } : { kind: 'create', label: '去訪談' };
    if (key === 'cards') return { gap: '還沒有訪談卡', todo: '到房間點一位人物，問他並在檢核表勾一項', btn: toRoom };
    var GAP = { persona: '還缺人物誌（' + Math.min(Number(P.personas) || 0, 2) + '/2 位）', cells: filled > 0 ? '故事板寫了 ' + filled + '/6 格' : (P.opened ? '故事板還是空的' : '還沒開故事板'), moment: '還沒標關鍵時刻', img: '還沒補 AI 生成圖片' };
    if (!code) return { gap: GAP[key], todo: '先到房間拿到一張訪談卡，才開得了故事板', btn: toRoom };
    if (key === 'persona') return m.mobile ? { gap: GAP.persona, todo: '這一步請改用電腦做', btn: null } : { gap: GAP.persona, todo: '按「匯出訪談報告」，還原人物誌', btn: { kind: 'export', label: '匯出', code: code } };
    if (key === 'cells') {
      if (filled > 0) return { gap: GAP.cells, todo: '回到沒寫的格子，寫誰、在哪、發生什麼事、他怎麼想', btn: { kind: 'link', label: '繼續寫', href: room(bc) } };
      if (P.opened) return { gap: GAP.cells, todo: '按「幫我排一份草稿」，再改成自己的話', btn: { kind: 'link', label: '幫我排草稿', href: room(code, '&draft=1') } };
      return { gap: GAP.cells, todo: '打開故事板，按「幫我排一份草稿」', btn: { kind: 'link', label: '開故事板', href: room(code) } };
    }
    if (key === 'moment') return { gap: GAP.moment, todo: '找出他最卡的那格，勾「這格是關鍵時刻」', btn: { kind: 'link', label: '去標', href: room(bc) } };
    if (key === 'img') return { gap: GAP.img, todo: '用同一個人物、同一個場景生成圖片，每格前後一致', btn: { kind: 'link', label: '去補圖', href: room(bc) } };
    return null;
  }
  /* 把 guide 掛到每一個「確定還缺」的項目上（ok===false）；讀不到的（null）維持「打開故事板後更新」 */
  function guideSteps(steps, m) {
    return (steps || []).map(function (s) { var o = {}; Object.keys(s).forEach(function (k) { o[k] = s[k]; }); if (s.ok === false && s.key) o.guide = stepGuide(s.key, m); return o; });
  }
  function goHtml(b) {
    if (!b) return '';
    if (b.kind === 'export') return '<button type="button" class="sbGo" data-export="' + esc(b.code) + '">' + esc(b.label) + '</button>';
    if (b.kind === 'revisit') return '<button type="button" class="sbGo" data-revisit="' + esc(b.code) + '">' + esc(b.label) + '</button>';
    if (b.kind === 'create') return '<button type="button" class="sbGo" data-create="1">' + esc(b.label) + '</button>';
    return '<a class="btn sbGo" href="' + esc(b.href) + '">' + esc(b.label) + '</a>';
  }
  /* W8 卡頂端的完成列。p：{ steps: [{ label, ok: true | false | null（讀不到）}], act: nextAction 的結果（可省略） }。只顯示最前面沒做的一件＋按鈕，五件全部收進「看全部」 */
  function progHtml(p) {
    if (!p || !p.steps) return '';
    var got = p.steps.filter(function (s) { return s.ok === true; }).length, next = p.steps.filter(function (s) { return s.ok !== true; })[0], unknown = p.steps.some(function (s) { return s.ok === null; });
    var nextLabel = p.act && p.act.goal ? p.act.goal : (next && next.label);
    var head = got === p.steps.length ? '<span class="wkDone ok">✅ 故事板全部完成（' + got + '/' + p.steps.length + '）</span>' : '<span class="wkDone todo">⬜ 完成 ' + got + '/' + p.steps.length + (nextLabel ? '｜下一步：' + esc(nextLabel) : '') + '</span>';
    return '<div class="sbProg">' + head + (got === p.steps.length ? '' : actHtml(p.act)) + '<details class="sbAll"><summary>看全部 ' + p.steps.length + ' 件</summary><ul>' + p.steps.map(function (s) {
      if (s.guide) return '<li class="todo"><div class="sbGap">⬜ <b>' + esc(s.label) + '</b>：' + esc(s.guide.gap) + '</div><div class="sbDo">現在去做：' + esc(s.guide.todo) + '</div>' + goHtml(s.guide.btn) + '</li>';
      return '<li class="' + (s.ok === true ? 'ok' : '') + '">' + (s.ok === true ? '✅ ' : '⬜ ') + esc(s.label) + (s.ok === null ? '<span class="muted">（打開故事板後更新）</span>' : '') + '</li>'; }).join('') + '</ul></details></div>';
  }
  function fmtSeen(t) { var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; }; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function roomRows(rooms, skill, caseNames) {
    skill = skill || {};
    return (rooms || []).map(function (r) {
      var ev = RL.evaluate({ interviews: r.interviews, askLv: skill.ask, ctxLv: skill.ctx, conclusions: r.conclusions, markers: r.markers, mainPersona: r.mainPersona });
      var tone = TONE.get(r.caseId);
      return { code: r.code, caseId: r.caseId, letter: tone.letter, ct: tone.ct, on: tone.on, name: (caseNames && caseNames[r.caseId]) || tone.name, cards: RL.interviewed(r.interviews).length, started: (Array.isArray(r.interviews) ? r.interviews : Object.keys(r.interviews || {}).map(function (k) { return r.interviews[k]; })).filter(function (x) { return x && x.personaId; }).length, level: ev, open: RL.interviewed(r.interviews).length > 0, seenAt: Number(r.seenAt) || 0, seenKind: r.seenKind || '' };
    });
  }

  var CSS = '.sbBox .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--s3)}' +
    '.sbBox .tile{border:var(--bw-s) solid var(--ink);border-radius:var(--r-m);padding:var(--s3);background:var(--panel)}.sbBox .tile h3{margin:0 0 4px;font-size:var(--fs-3)}' +
    '.sbBox .rooms{margin:var(--s2) 0 0;padding:0;list-style:none}.sbBox .rooms li{display:flex;gap:var(--s2);align-items:center;flex-wrap:wrap;padding:6px 0;border-top:var(--bw-s) dashed var(--line)}' +
    '.sbDot{flex:none;display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;text-align:center;font-weight:900;font-size:var(--fs-1);border:var(--bw-s) solid var(--ink)}' +
    '.sbGuide .cases{display:flex;gap:var(--s2);flex-wrap:wrap;margin:var(--s2) 0}.sbGuide .cases button{display:inline-flex;align-items:center;gap:6px}.sbGuide .cases button.on{outline:var(--bw) solid var(--pop)}' +
    '.sbGuide .cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--s3)}@media (max-width:760px){.sbGuide .cols{grid-template-columns:1fr}}' +
    '.sbGuide ol.steps{margin:0;padding-left:1.4em}.sbGuide ol.steps li{margin:0 0 var(--s2)}.sbGuide ol.steps li b{display:block}' +
    '.sbGuide .box{border:var(--bw-s) solid var(--ink);border-radius:var(--r-m);padding:var(--s2) var(--s3);margin:0 0 var(--s2);background:var(--panel)}.sbGuide .box h4{margin:0 0 4px;font-size:var(--fs-2)}' +
    '.sbGuide .cellList{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin:4px 0 0;padding:0;list-style:none;counter-reset:c}.sbGuide .cellList li{counter-increment:c;border:var(--bw-s) solid var(--line);border-radius:var(--r-s);padding:2px 6px;font-size:var(--fs-2)}.sbGuide .cellList li:before{content:counter(c) "　";color:var(--muted)}' +
    '.sbGuide .pain{color:var(--bad);font-weight:700}.sbGuide mark{background:var(--yellow);color:var(--ink-fixed);padding:0 2px;border-radius:3px}.sbGuide .ph{margin:4px 0 0;font-size:var(--fs-2)}' +
    '.sbGuide .cpmsg{font-size:var(--fs-1);color:var(--muted);margin-left:6px}.sbGuide textarea.cpfb{display:none;margin-top:4px;min-height:70px}' +
    '.sbBox a.btn.sbOpen,.sbBox a.btn.sbMain{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}' +
    '.sbBox .sbMainRow{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap;margin:0 0 var(--s3)}.sbBox .sbMain{font-size:var(--fs-4);font-weight:900;padding:12px 22px;min-height:52px;background:var(--pop);color:var(--ink-fixed);border:var(--bw) solid var(--ink);border-radius:var(--r-m);box-shadow:var(--sh) var(--sh) 0 var(--ink);cursor:pointer}' +
    '.sbBox .sbAct{display:inline-flex;gap:var(--s2);flex-wrap:wrap}.sbBox .dis,.sbAct .sbOpen{border-width:var(--bw-t);box-shadow:none;padding:8px 16px;font-weight:700;border-radius:var(--r-m)}.sbAct .dis{opacity:.5;filter:grayscale(1);cursor:not-allowed;background:var(--panel);color:var(--fg);box-shadow:none}.sbBox .sbNeed{flex:1 1 100%;font-size:var(--fs-2);color:var(--bad);margin-top:2px}' +
    '.sbBox .sbMain2{font-weight:900;padding:12px 18px;min-height:52px;background:var(--yellow);color:var(--ink-fixed);border:var(--bw) solid var(--ink);border-radius:var(--r-m);box-shadow:var(--sh) var(--sh) 0 var(--ink);cursor:pointer}' +
    '.sbProg{margin:0 0 var(--s3);padding:var(--s2) var(--s3);border:var(--bw-s) solid var(--ink);border-radius:var(--r-m);background:var(--panel)}.sbProg ul{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0 0;padding:0;list-style:none;font-size:var(--fs-2)}.sbProg .sbAll{margin-top:6px;font-size:var(--fs-2)}.sbProg .sbAll summary{cursor:pointer;color:var(--muted)}.sbBox .sbNext{display:flex;align-items:center;justify-content:center;width:max-content;max-width:100%;min-height:44px;margin:8px 0 0;padding:8px 18px;font-weight:900;font-size:16px;background:var(--yellow);color:var(--ink-fixed);border:var(--bw) solid var(--ink);border-radius:var(--r-m);box-shadow:var(--sh) var(--sh) 0 var(--ink);text-decoration:none;cursor:pointer}.sbBox .sbNext.pc{background:var(--panel);color:var(--fg);box-shadow:none;border-style:dashed;cursor:default}.sbBox .sbPcOnly{font-size:var(--fs-2)}.sbProg li.ok{color:var(--ok);font-weight:700}' +
    '.sbProg ul li.todo{flex:1 1 100%;display:block;padding:6px 0;border-top:var(--bw-s) dashed var(--line)}.sbProg .sbGap{font-weight:700}.sbProg .sbDo{margin:2px 0 6px;font-size:var(--fs-2)}.sbProg .sbGo{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:6px 16px;box-sizing:border-box;font-weight:900;text-decoration:none;border:var(--bw) solid var(--ink);border-radius:var(--r-m);background:var(--yellow);color:var(--ink-fixed);cursor:pointer}@media (max-width:860px){.sbProg .sbGo{width:100%}}' +
    '.sbRemind{margin:0 0 var(--s3);padding:var(--s2) var(--s3);border-left:6px solid var(--pop);background:var(--panel);font-size:var(--fs-3);line-height:1.6}.sbRemind .sbDue{margin-top:4px;font-size:var(--fs-2);font-weight:700}#sbCard .matLink{display:block;padding:6px 8px}' +
    '.wkBox{border-top:var(--bw-s) dashed var(--ink);padding:8px 0}.wkBox>details>summary{cursor:pointer;list-style-position:inside}.wkDone{display:inline-block;font-size:var(--fs-2);font-weight:900;padding:2px 10px;border-radius:10px;border:var(--bw-s) solid var(--ink);line-height:1.5}.wkBox>details>summary .wkDone{display:block;margin-top:4px}.wkDone.ok{background:var(--mint);color:var(--ink-fixed)}.wkDone.todo{background:var(--soft-y,#fff3bf);color:var(--ink-fixed)}' +
    '@media (max-width:860px){#sbCard .matLink{display:flex;align-items:center;min-height:44px;box-sizing:border-box}#matOld>summary{display:flex;align-items:center;min-height:44px}.sbProg .sbAll summary{display:flex;align-items:center;min-height:44px}.sbBox .sbNext{width:100%}.sbBox .sbAct>.sbPcOnly{flex:1 1 100%;order:3}.sbBox .sbAct{flex-wrap:wrap}.sbBox a.btn.sbOpen,.sbBox button,.sbGuide button{min-height:44px;padding-left:14px;padding-right:14px}.sbBox .rooms li{padding:10px 0}.sbBox .sbMain{width:100%}.sbBox .sbAct{width:100%}.sbBox .sbAct>*{flex:1 1 0;justify-content:center}}';

  /* 指令文字裡的【…】要學生換掉：畫面上標黃，複製出去的文字不變 */
  function marked(t) { return esc(t).replace(/【[^】]*】/g, function (m) { return '<mark>' + m + '</mark>'; }); }

  /* 教學頁。ctx：{ mainName, goal:[], focus:[], caseName, defaultCase }；各案例資料用 ctx.cases[id]（同樣的欄位）；缺的就退回案例表的名稱 */
  function guideHtml(caseId, ctx) {
    ctx = ctx || {};
    var id = TEMPLATES[caseId] ? caseId : 'sms', T = TEMPLATES[id], C = (ctx.cases || {})[id] || ctx, tone = TONE.get(id);
    var cases = ORDER.map(function (k) { var tn = TONE.get(k); return '<button type="button" class="ghost' + (k === id ? ' on' : '') + '" data-case="' + k + '" aria-pressed="' + (k === id) + '"><span class="sbDot" style="background:' + tn.ct + ';color:' + tn.on + '">' + tn.letter + '</span>' + esc(tn.name) + '</button>'; }).join('');
    var steps = STEPS.map(function (s, i) {
      var extra = i === 3 ? '<ol class="cellList" aria-label="六格樣板">' + T.cells.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ol>' : '';
      return '<li><b>' + esc(s.t) + '</b>' + esc(s.d) + extra + '</li>';
    }).join('');
    var main = C.mainName || '主角';
    var first = id === 'sms' ? '看診快結束時，護理師口頭說明怎麼收衛教簡訊（離院前每位病人都要說明一次）；簡訊由醫院系統自動寄出，寄件顯示成一般門號。' : '【照你的訪談寫：他在這裡做了什麼、遇到什麼】';
    var right = '<div class="box"><h4>範例用的主角</h4><b>' + esc(main) + '</b>　<span class="muted">' + esc(C.caseName || tone.name) + '</span><div class="muted" style="font-size:var(--fs-1)">這只是示範用。你也可以改寫你訪談過的其他人，用他的角度寫故事，「誰」那一格自己填。</div></div>' +
      '<div class="box"><h4>先想的問題</h4><ul style="margin:0;padding-left:1.2em">' + (C.goal || []).map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="box"><h4>對照準則</h4>' + (C.focus || []).map(function (f) { return '<span class="tag">' + esc(f) + '</span> '; }).join('') + '<div class="muted" style="font-size:var(--fs-1)">每格痛點，想想違反了哪一條。</div></div>' +
      '<div class="box"><h4>只示範第一格：「' + esc(T.cells[0]) + '」</h4><div class="ph">誰：' + esc(main) + '<br>在哪：' + esc(T.place) + '<br>發生什麼：<span class="pain">' + marked(first) + '</span><br>他怎麼想：「<mark>從訪談原話寫，猜的要標「推測」</mark>」<br>出處：<mark>#__</mark>（自己填訪談編號）</div></div>' +
      '<div class="box"><h4>三個常見的錯</h4><ol style="margin:0;padding-left:1.3em">' + ERRORS.map(function (e) { return '<li><b>' + esc(e.t) + '</b>：' + esc(e.d) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="box"><h4>三個 AI 圖片生成指令（黃色的地方換成你自己的）</h4>' + PROMPTS.map(function (p, i) { return '<div class="ph"><b>' + esc(p.name) + '</b> <button type="button" class="ghost" data-cp="' + i + '">複製</button><span class="cpmsg" data-cpmsg="' + i + '"></span><br>' + marked(p.text) + '<textarea class="cpfb" data-cpfb="' + i + '" readonly>' + esc(p.text) + '</textarea></div>'; }).join('') + '</div>';
    return '<div class="sbGuide" data-case-now="' + id + '"><div class="row"><b style="flex:1;font-size:var(--fs-4)">第 8～9 週　UX 故事板：基本教學</b><button type="button" class="ghost" data-close="1">關閉</button></div>' +
      '<div class="muted" style="font-size:var(--fs-2)">故事板只能從有訪談紀錄的房間開（訪談分頁至少勾一項）：在大廳 W8~9 卡的房間那一列按「📖 故事板」，或在房間頂列按 📖。</div>' +
      '<div class="cases" role="group" aria-label="案例">' + cases + '</div>' +
      '<div class="cols"><div><h4 style="margin:0 0 var(--s2)">七個步驟</h4><ol class="steps">' + steps + '</ol></div><div>' + right + '</div></div></div>';
  }

  /* 大廳入口。m：{ mobile, entry1:{caseName, done:[], todo:[]}, rooms: roomRows 的結果 } */
  function lobbyHtml(m) {
    var e1 = m.entry1 || { done: [], todo: [], caseName: '' };
    var t1 = '<div class="tile"><h3>入口 1　進急診室</h3><div style="font-size:var(--fs-2)">先去問人。' + esc(e1.caseName) + '：已訪談 <b>' + e1.done.length + '</b> 位（重要人物共 ' + (e1.done.length + e1.todo.length) + ' 位）' + (e1.todo.length ? '<br><span class="muted">還沒問過：' + esc(e1.todo.join('、')) + '</span>' : '，重要人物都問過了') + '</div>' +
      '<div style="margin-top:var(--s2)"><button type="button" id="sbEnter1">進急診室（開房間或加入）</button></div></div>';
    var t2 = '<div class="tile"><h3>入口 2　第 8～9 週 UX 故事板</h3><div style="font-size:var(--fs-2)">下面「我進過的房間」每一列都有兩顆鈕：<b>📖 故事板</b>開這間房的故事板，<b>🩺 回去訪談</b>回到這間房再問人。訪談卡打勾之後，灰色的 📖 就會變成可以點。</div>' +
      '<div style="margin-top:var(--s2)"><button type="button" id="sbEnter2">基本教學</button></div></div>';   /* 10-26 二丙全班只有手機：手機也有基本教學與開故事板 */
    var rows = (m.rooms || []).length ? '<ul class="rooms">' + m.rooms.map(function (r) {
      return '<li><span class="sbDot" style="background:' + r.ct + ';color:' + r.on + '" title="案例' + esc(r.letter) + '">' + esc(r.letter) + '</span><b>' + esc(r.name) + '</b><span class="muted">房號 ' + esc(r.code) + '</span>' + (r.seenAt ? '<span class="muted">' + (r.seenKind === 'last' ? '上次進入 ' : '加入於 ') + esc(fmtSeen(r.seenAt)) + '</span>' : '') + '<span>訪談卡 ' + r.cards + ' 張</span>' +
        (r.open ? '<span class="tag ok" title="' + esc(RL.nextLine(r.level)) + '">' + esc(RL.label(r.level)) + '</span>' : '<span class="tag warn">還沒有訪談卡</span>') +
        '<span class="sbAct">' + (r.open ? '<a class="btn sbOpen" href="storyboard.html?room=' + encodeURIComponent(r.code) + '">📖 故事板</a>' : '<span class="btn sbOpen dis" role="button" aria-disabled="true" title="' + esc(need(r).text) + '">📖 故事板</span>') + '<button type="button" class="ghost sbRevisit" data-revisit="' + esc(r.code) + '">🩺 回去訪談</button>' + (r.open ? (m.mobile ? '<span class="muted sbPcOnly">匯出訪談報告：這步請用電腦</span>' : '<button type="button" class="ghost" data-export="' + esc(r.code) + '">匯出訪談報告</button>') : '') + '</span>' + (r.open ? '' : '<span class="sbNeed">' + esc(need(r).text) + '</span>') +
        '</li>';
    }).join('') + '</ul>' : '<div class="muted" style="margin-top:var(--s2)">還沒有進過的房間。先到入口 1 開一間，去問人。</div>';
    /* 最上面的主按鈕：有房間就直接開最近進過的那間房的故事板；還沒有房間就先去急診室訪談 */
    var nd = m.mainNeed || need({ cards: 0, started: 0 });
    var main = m.main && m.main.code ? '<div class="sbMainRow"><a class="btn sbMain" id="sbMain" href="storyboard.html?room=' + encodeURIComponent(m.main.code) + '">📖 繼續我的故事板</a><span class="muted">房間 ' + esc(m.main.code) + (m.main.cards ? '・訪談卡 ' + esc(m.main.cards) + ' 張' + (m.main.most ? '（你訪談最多的一間）' : '') : '') + '</span></div>'
      : '<div class="sbMainRow"><span class="btn sbMain dis" id="sbMainOff" role="button" aria-disabled="true" title="' + esc(nd.text) + '">📖 繼續我的故事板</span>' +
        (m.mainRoom ? '<button type="button" class="sbMain2" data-revisit="' + esc(m.mainRoom) + '">🩺 回去訪談（房間 ' + esc(m.mainRoom) + '）</button>' : '<button type="button" class="sbMain2" id="sbMain0">🩺 先進急診室訪談</button>') + '<span class="sbNeed">' + esc(nd.text) + '</span></div>';
    return '<div class="sbBox">' + main + progHtml(m.prog) + '<div class="tiles">' + t1 + t2 + '</div><h3 style="margin:var(--s3) 0 0;font-size:var(--fs-3)">我進過的房間</h3>' + rows + '</div>';
  }

  /* ───── 瀏覽器端 ───── */
  function injectCss(doc) { if (!doc.getElementById('sbCss')) { var st = doc.createElement('style'); st.id = 'sbCss'; st.textContent = CSS; doc.head.appendChild(st); } }
  function copyText(text, msgEl, fbEl) {
    function fb() { if (fbEl) { fbEl.style.display = 'block'; fbEl.focus(); fbEl.select(); } if (msgEl) msgEl.textContent = '沒有自動複製成功，文字已經選起來了，請按 Ctrl+C。'; }
    try { navigator.clipboard.writeText(text).then(function () { if (msgEl) msgEl.textContent = '已複製'; }, fb); } catch (e) { fb(); }
  }
  /* host：容器元素；opts：{ caseId, ctx, onClose }。切案例就整頁重畫（教學頁沒有要保留的輸入） */
  function mountGuide(host, opts) {
    injectCss(host.ownerDocument);
    function draw(id) {
      host.innerHTML = guideHtml(id, opts.ctx);
      Array.prototype.forEach.call(host.querySelectorAll('[data-case]'), function (b) { b.onclick = function () { draw(b.getAttribute('data-case')); }; });
      Array.prototype.forEach.call(host.querySelectorAll('[data-cp]'), function (b) {
        var i = b.getAttribute('data-cp'); b.onclick = function () { copyText(PROMPTS[i].text, host.querySelector('[data-cpmsg="' + i + '"]'), host.querySelector('[data-cpfb="' + i + '"]')); };
      });
      var c = host.querySelector('[data-close]'); if (c) c.onclick = function () { if (opts.onClose) opts.onClose(); };
    }
    draw(opts.caseId);
  }

  return { stepGuide: stepGuide, guideSteps: guideSteps, goHtml: goHtml, IMG_GOAL: IMG_GOAL, TEMPLATES: TEMPLATES, ORDER: ORDER, STEPS: STEPS, PROMPTS: PROMPTS, ERRORS: ERRORS, CSS: CSS, pickMainRoom: pickMainRoom, nextAction: nextAction, w9Reminder: w9Reminder, reminderHtml: reminderHtml, dueText: dueText, keyIds: keyIds, interviewedSummary: interviewedSummary, roomRows: roomRows,
    guideHtml: guideHtml, lobbyHtml: lobbyHtml, need: need, progHtml: progHtml, injectCss: injectCss, mountGuide: mountGuide, esc: esc };
});
