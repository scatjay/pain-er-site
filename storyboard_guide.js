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
    { t: '用 Gemini 生成圖片', d: '故事板開放之後，把圖拖進格子。先用右邊三個 AI 圖片生成指令，把空格填成自己的內容。先生成主角設定圖，再一格一格生成。' },
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
    if (started > 0) return { ok: false, short: '還缺：訪談卡打勾', text: '還缺：訪談卡打勾——你已經開始跟 ' + started + ' 位聊了，但「訪談」分頁的檢核表還沒有打勾。到房間右側的「訪談」分頁，把問到的事打勾（「他一開始怎麼說」「那天發生了什麼事」「他真正需要什麼」，至少勾一項）。' };
    return { ok: false, short: '還缺：1 張訪談卡', text: '還缺：1 張訪談卡——先到這間房跟人物聊（點人物開始訪談），再到房間右側「訪談」分頁的檢核表，把問到的事打勾（至少勾一項）。' };
  }
  /* W8 卡頂端的完成列。p：{ steps: [{ label, ok: true | false | null（讀不到）}] } */
  function progHtml(p) {
    if (!p || !p.steps) return '';
    var got = p.steps.filter(function (s) { return s.ok === true; }).length, next = p.steps.filter(function (s) { return s.ok !== true; })[0], unknown = p.steps.some(function (s) { return s.ok === null; });
    var head = got === p.steps.length ? '<span class="wkDone ok">✅ 故事板全部完成（' + got + '/' + p.steps.length + '）</span>' : '<span class="wkDone todo">⬜ 完成 ' + got + '/' + p.steps.length + (next ? '｜下一步：' + esc(next.label) : '') + '</span>';
    return '<div class="sbProg">' + head + '<ul>' + p.steps.map(function (s) { return '<li class="' + (s.ok === true ? 'ok' : '') + '">' + (s.ok === true ? '✅ ' : '⬜ ') + esc(s.label) + (s.ok === null ? '<span class="muted">（打開故事板後更新）</span>' : '') + '</li>'; }).join('') + '</ul></div>';
  }
  function roomRows(rooms, skill, caseNames) {
    skill = skill || {};
    return (rooms || []).map(function (r) {
      var ev = RL.evaluate({ interviews: r.interviews, askLv: skill.ask, ctxLv: skill.ctx, conclusions: r.conclusions, markers: r.markers, mainPersona: r.mainPersona });
      var tone = TONE.get(r.caseId);
      return { code: r.code, caseId: r.caseId, letter: tone.letter, ct: tone.ct, on: tone.on, name: (caseNames && caseNames[r.caseId]) || tone.name, cards: RL.interviewed(r.interviews).length, started: (Array.isArray(r.interviews) ? r.interviews : Object.keys(r.interviews || {}).map(function (k) { return r.interviews[k]; })).filter(function (x) { return x && x.personaId; }).length, level: ev, open: RL.interviewed(r.interviews).length > 0 };
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
    '.sbBox .sbAct{display:inline-flex;gap:var(--s2);flex-wrap:wrap}.sbBox .dis,.sbAct .dis{opacity:.5;filter:grayscale(1);cursor:not-allowed;background:var(--line);box-shadow:none}.sbBox .sbNeed{flex:1 1 100%;font-size:var(--fs-2);color:var(--bad);margin-top:2px}' +
    '.sbBox .sbMain2{font-weight:900;padding:12px 18px;min-height:52px;background:var(--yellow);color:var(--ink-fixed);border:var(--bw) solid var(--ink);border-radius:var(--r-m);box-shadow:var(--sh) var(--sh) 0 var(--ink);cursor:pointer}' +
    '.sbProg{margin:0 0 var(--s3);padding:var(--s2) var(--s3);border:var(--bw-s) solid var(--ink);border-radius:var(--r-m);background:var(--panel)}.sbProg ul{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0 0;padding:0;list-style:none;font-size:var(--fs-2)}.sbProg li.ok{color:var(--ok);font-weight:700}' +
    '.wkBox{border-top:var(--bw-s) dashed var(--ink);padding:8px 0}.wkBox>details>summary{cursor:pointer;list-style-position:inside}.wkDone{display:inline-block;font-size:var(--fs-2);font-weight:900;padding:2px 10px;border-radius:10px;border:var(--bw-s) solid var(--ink);line-height:1.5}.wkBox>details>summary .wkDone{display:block;margin-top:4px}.wkDone.ok{background:var(--mint);color:var(--ink-fixed)}.wkDone.todo{background:var(--soft-y,#fff3bf);color:var(--ink-fixed)}' +
    '@media (max-width:860px){.sbBox a.btn.sbOpen,.sbBox button,.sbGuide button{min-height:44px;padding-left:14px;padding-right:14px}.sbBox .rooms li{padding:10px 0}.sbBox .sbMain{width:100%}.sbBox .sbAct{width:100%}.sbBox .sbAct>*{flex:1 1 0;justify-content:center}}';

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
    var right = '<div class="box"><h4>這個案例的主角</h4><b>' + esc(main) + '</b>　<span class="muted">' + esc(C.caseName || tone.name) + '</span></div>' +
      '<div class="box"><h4>先想的問題</h4><ul style="margin:0;padding-left:1.2em">' + (C.goal || []).map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="box"><h4>對照準則</h4>' + (C.focus || []).map(function (f) { return '<span class="tag">' + esc(f) + '</span> '; }).join('') + '<div class="muted" style="font-size:var(--fs-1)">每格痛點，想想違反了哪一條。</div></div>' +
      '<div class="box"><h4>只示範第一格：「' + esc(T.cells[0]) + '」</h4><div class="ph">誰：' + esc(main) + '<br>在哪：' + esc(T.place) + '<br>發生什麼：<span class="pain">' + marked(first) + '</span><br>他怎麼想：「<mark>從訪談原話寫，猜的要標「推測」</mark>」<br>出處：<mark>#__</mark>（自己填訪談編號）</div></div>' +
      '<div class="box"><h4>三個常見的錯</h4><ol style="margin:0;padding-left:1.3em">' + ERRORS.map(function (e) { return '<li><b>' + esc(e.t) + '</b>：' + esc(e.d) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="box"><h4>三個 AI 圖片生成指令（黃色的地方換成你自己的）</h4>' + PROMPTS.map(function (p, i) { return '<div class="ph"><b>' + esc(p.name) + '</b> <button type="button" class="ghost" data-cp="' + i + '">複製</button><span class="cpmsg" data-cpmsg="' + i + '"></span><br>' + marked(p.text) + '<textarea class="cpfb" data-cpfb="' + i + '" readonly>' + esc(p.text) + '</textarea></div>'; }).join('') + '</div>';
    return '<div class="sbGuide" data-case-now="' + id + '"><div class="row"><b style="flex:1;font-size:var(--fs-4)">第 8 週　UX 故事板：基本教學</b><button type="button" class="ghost" data-close="1">關閉</button></div>' +
      '<div class="muted" style="font-size:var(--fs-2)">故事板只能從有訪談紀錄的房間開：回大廳「我進過的房間」那一列按「開故事板」，或在房間頂列按「故事板」。</div>' +
      '<div class="cases" role="group" aria-label="案例">' + cases + '</div>' +
      '<div class="cols"><div><h4 style="margin:0 0 var(--s2)">七個步驟</h4><ol class="steps">' + steps + '</ol></div><div>' + right + '</div></div></div>';
  }

  /* 大廳入口。m：{ mobile, entry1:{caseName, done:[], todo:[]}, rooms: roomRows 的結果 } */
  function lobbyHtml(m) {
    var e1 = m.entry1 || { done: [], todo: [], caseName: '' };
    var t1 = '<div class="tile"><h3>入口 1　進急診室</h3><div style="font-size:var(--fs-2)">先去問人。' + esc(e1.caseName) + '：已訪談 <b>' + e1.done.length + '</b> 位（重要人物共 ' + (e1.done.length + e1.todo.length) + ' 位）' + (e1.todo.length ? '<br><span class="muted">還沒問過：' + esc(e1.todo.join('、')) + '</span>' : '，重要人物都問過了') + '</div>' +
      '<div style="margin-top:var(--s2)"><button type="button" id="sbEnter1">進急診室（開房間或加入）</button></div></div>';
    var t2 = '<div class="tile"><h3>入口 2　第 8 週 UX 故事板</h3><div style="font-size:var(--fs-2)">下面「我進過的房間」每一列都有兩顆鈕：<b>📖 故事板</b>開這間房的故事板，<b>🩺 回去訪談</b>回到這間房再問人。訪談卡打勾之後，灰色的 📖 就會變成可以點。</div>' +
      '<div style="margin-top:var(--s2)"><button type="button" id="sbEnter2">基本教學</button></div></div>';   /* 10-26 二丙全班只有手機：手機也有基本教學與開故事板 */
    var rows = (m.rooms || []).length ? '<ul class="rooms">' + m.rooms.map(function (r) {
      return '<li><span class="sbDot" style="background:' + r.ct + ';color:' + r.on + '" title="案例' + esc(r.letter) + '">' + esc(r.letter) + '</span><b>' + esc(r.name) + '</b><span class="muted">房號 ' + esc(r.code) + '</span><span>訪談卡 ' + r.cards + ' 張</span>' +
        (r.open ? '<span class="tag ok" title="' + esc(RL.nextLine(r.level)) + '">' + esc(RL.label(r.level)) + '</span>' : '<span class="tag warn">還沒有訪談卡</span>') +
        '<span class="sbAct">' + (r.open ? '<a class="btn sbOpen" href="storyboard.html?room=' + encodeURIComponent(r.code) + '">📖 故事板</a>' : '<span class="btn sbOpen dis" role="button" aria-disabled="true" title="' + esc(need(r).text) + '">📖 故事板</span>') + '<button type="button" class="ghost sbRevisit" data-revisit="' + esc(r.code) + '">🩺 回去訪談</button>' + (r.open && !m.mobile ? '<button type="button" class="ghost" data-export="' + esc(r.code) + '">匯出訪談報告</button>' : '') + '</span>' + (r.open ? '' : '<span class="sbNeed">' + esc(need(r).text) + '</span>') +
        '</li>';
    }).join('') + '</ul>' : '<div class="muted" style="margin-top:var(--s2)">還沒有進過的房間。先到入口 1 開一間，去問人。</div>';
    /* 最上面的主按鈕：有房間就直接開最近進過的那間房的故事板；還沒有房間就先去急診室訪談 */
    var nd = m.mainNeed || need({ cards: 0, started: 0 });
    var main = m.main && m.main.code ? '<div class="sbMainRow"><a class="btn sbMain" id="sbMain" href="storyboard.html?room=' + encodeURIComponent(m.main.code) + '">📖 繼續我的故事板</a><span class="muted">房間 ' + esc(m.main.code) + '</span></div>'
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

  return { TEMPLATES: TEMPLATES, ORDER: ORDER, STEPS: STEPS, PROMPTS: PROMPTS, ERRORS: ERRORS, CSS: CSS, keyIds: keyIds, interviewedSummary: interviewedSummary, roomRows: roomRows,
    guideHtml: guideHtml, lobbyHtml: lobbyHtml, need: need, progHtml: progHtml, injectCss: injectCss, mountGuide: mountGuide, esc: esc };
});
