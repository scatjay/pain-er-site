/* 學習單的「只有助教」頁（ta.html?unit=單元代號[&step=s2]）。
   沿用提案室的單元助教：建議提問來自 unit_coach.js（規則式，不呼叫模型），自己打字或按「我還沒做」快速提問才算每天名額（30 次，所有單元合計）；
   題目寫到 prx/{場次}/coach/{學號}/q/{時間}，答案由 tools/prx_coach.py（answer_unit）寫回 …/a/{時間}——同一個後端、同一份名額，不另起新後端。
   登入沿用網站現有流程：Firebase 登入＋er/users/{uid}.sid（學號）；沒登入就請他先到急診室登入。
   ?local=1&sid=學號：本機測試（資料放 localStorage，沒有後端回答）。不用 alert／confirm／prompt。
   Node 可測的純函式放在 TA（unitLabel、quickOf、stepOptions、hashOf）。 */
(function (root, factory) {
  var TA = factory();
  if (typeof module === 'object' && module.exports) module.exports = TA;
  else { root.TA = TA; if (typeof document !== 'undefined') root.addEventListener('DOMContentLoaded', function () { TA.boot(root); }); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var UNIT_SESS = 'ER-20261013';
  var REFS = { ref: 1, aref: 1, a4: 1 };   /* 查東西用的參考頁：沒有「從頭做」，列常問的操作 */
  var SHEET = 'https://claude.ai/artifact/M27Rrau2yXMrz1aLhRbjXr';
  /* 學習單分頁的代號（hash）：單元 → 學習單檢視代號 */
  var HASH = { w12: 'w12', w2: 'w2', w3: 'w3', w5: 'w5', w8: 'w8', f1: 'w10', f2: 'w10', f3: 'w10', ref: 'w10', a1: 'w12x', a2: 'w12x', a3: 'w12x', aref: 'w12x', a4: 'w12x', w16: 'w16' };
  /* 「我還沒做，從頭帶我」的快速提問：[按鈕上的字（也是送出的那句）, 對應的步驟 id]。步驟 id 讓後端帶上那一步的做法（byStep 的 do）；沒有對應步驟寫 ''。
     只問已驗證過的操作（Figma、Claude、AI Studio）；沒驗證的後端會回「不確定，請問老師」。 */
  var QUICK = {
    w12: [['我還沒開始，從頭帶我', 's1'], ['我還沒拍照，要拍什麼樣的東西？', 's1'], ['簡報 5 頁內要放哪些？', 's5']],
    w2: [['我還沒開始，從頭帶我', 's1'], ['我還沒想到要問什麼，怎麼開始？', 's1'], ['錄音連結要怎麼開權限？', 's5']],
    w3: [['我還沒開始，從頭帶我', 's1'], ['我還沒用過 Deep Research，怎麼開始？', 's1'], ['第一輪報告要怎麼放進 NotebookLM？', 's3']],
    w5: [['我還沒開始，從頭帶我', 's1'], ['我還沒看影片，要先看哪一段？', 's1'], ['我不知道這題怎麼回答', 's2']],
    w8: [['我還沒開始，從頭帶我', 's1'], ['訪談報告要在哪裡匯出？', 's1'], ['人物誌的出處欄要怎麼寫？', 's2']],
    f1: [['我還沒登入 Figma，從頭帶我', 's1'], ['我還沒複製樣板，要按哪裡？', 's2'], ['Share 和 Copy link 在哪裡？', 's5']],
    a1: [['我還沒有 PNG，從頭帶我', 's1'], ['Export 在哪裡？', 's1'], ['AI Studio 要怎麼上傳圖片？', 's2']],
    f2: [['我還沒接 Figma 連接器，從頭帶我', 's1'], ['Copy link to selection 在哪裡？', 's2'], ['跳出「Claude 想要使用 Figma」要按什麼？', 's2']],
    a2: [['我還沒有 PNG，從頭帶我', 's1'], ['Claude 整合（一）要怎麼做？', 's2'], ['改壞了要按哪裡回到上一版？', 's7']],
    f3: [['我還沒找人試用，從頭帶我', 's1'], ['改前和改後兩張 PNG 要怎麼 Export？', 's3'], ['Claude 整合要怎麼做？', 's2']],
    a3: [['我還沒開始，從頭帶我', 's1'], ['Claude 整合要怎麼做？', 's3'], ['PDF 要怎麼匯出？', 's5']],
    ref: [['我還沒複製樣板，要按哪裡？', 't2'], ['Export 在哪裡？', 't3'], ['怎麼設成別人打得開？', 't4']],
    aref: [['畫面跑掉了怎麼辦？', 't1'], ['額度用完怎麼辦？', 't3'], ['交之前要檢查什麼？', 't4']],
    a4: [['新手、中級、專家怎麼選？', ''], ['我的方向不在指令清單裡怎麼辦？', 't1'], ['怎麼拿樣板改成我的版本？', 't3']],
    w16: [['我還沒做，從頭帶我', 's1'], ['PDF 的八頁是哪八頁？', 's2'], ['Figma 和 AI Studio 兩個連結要貼在哪裡？', 's5']]
  };
  function tr(x) { return String(x == null ? '' : x).trim(); }
  function unitLabel(title) { return tr(title).replace(/^\[[^\]]*\]\s*/, ''); }   /* 「[Figma] W10 1/3 開始用 Figma」→「W10 1/3 開始用 Figma」 */
  function quickOf(code) { return (QUICK[code] || []).map(function (x) { return { text: x[0], step: x[1] }; }); }
  function stepOptions(U) {   /* 下拉的步驟：只列 s 開頭的步驟（學習單步驟卡順序），t 開頭是參考題與卡關題 */
    return ((U && U.byStep) || []).filter(function (x) { return /^s\d{1,2}$/.test(x.id); }).map(function (x, i) { return { id: x.id, label: (i + 1) + '. ' + tr(x.step) }; });
  }
  function hashOf(code) { return HASH[code] || ''; }
  function isRef(code) { return !!REFS[code]; }
  function headLine(U) { return '這是「' + unitLabel(U.title) + '」的 AI 助教，卡住了、不確定怎麼做都可以問；和助教討論是加分項目。'; }

  var TA = { QUICK: QUICK, SHEET: SHEET, unitLabel: unitLabel, quickOf: quickOf, stepOptions: stepOptions, hashOf: hashOf, isRef: isRef, headLine: headLine, UNIT_SESS: UNIT_SESS };

  /* ———— 以下只在瀏覽器執行 ———— */
  TA.boot = function (win) {
    var doc = win.document, $ = function (id) { return doc.getElementById(id); };
    var Q = new URLSearchParams(win.location.search);
    var LOCAL = Q.get('local') === '1' || !win.firebase || !win.ERG_FB;
    var PX = win.ERG_PX, XS = win.ERG_PX_STORE, UC = win.UnitCoach;
    var UNIT = tr(Q.get('unit')), stepQ = tr(Q.get('step'));
    var MOBILE_UA = /Mobi|Android|iPhone|iPad/i.test(win.navigator.userAgent);
    var NOW = function () { return Date.now(); };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function sess() { var ts = (win.location.search.match(/[?&]tsess=([A-Za-z0-9]{1,12})/) || [])[1]; return (ts && /^(127\.0\.0\.1|localhost)$/.test(win.location.hostname)) ? 'ER-TEST-' + ts : UNIT_SESS; }
    function toast(msg) { var t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.display = 'none'; }, 3500); }
    function gate(msg, withLogin) {
      $('app').hidden = true; $('gate').hidden = false;
      $('gate').innerHTML = '<div class="card"><h1>' + esc(msg.title) + '</h1><p>' + esc(msg.body) + '</p>' + (withLogin ? '<p><a class="btn" href="' + (MOBILE_UA ? 'm.html' : 'index.html') + '">🏠 到急診室登入</a></p><p class="muted">登入後回到這一頁，按重新整理就可以問了。</p>' : '') + '</div>';
    }
    if (!UC || !win.TUTOR_UNITS_DATA || !UC.init(win.TUTOR_UNITS_DATA) || UC.CODES.indexOf(UNIT) < 0 || !UC.unit(UNIT)) {
      gate({ title: '這一週的助教還沒準備好', body: '這個網址對不到助教的單元。請回到學習單，從那一週的「問助教」按鈕再點進來。' }, false); return;
    }
    var U = UC.unit(UNIT), store = null, sid = '';
    var UP = { used: 0, key: '', shown: {}, t0: Date.now() };

    function render() {
      doc.title = 'AI 助教・' + unitLabel(U.title);
      $('title').textContent = '🤖 ' + unitLabel(U.title);
      $('banner').textContent = headLine(U);
      $('sidLine').textContent = '學號 ' + sid;
      $('quickTitle').textContent = TA.isRef(UNIT) ? '常問的操作' : '我還沒做，從頭帶我';
      $('quick').innerHTML = quickOf(UNIT).map(function (x, i) { return '<button type="button" data-q="' + i + '">' + esc(x.text) + '</button>'; }).join('');
      var h = TA.hashOf(UNIT); $('back').href = TA.SHEET + (h ? '#' + h : '');
      var sel = $('step'), opts = stepOptions(U);
      sel.innerHTML = '<option value="">（不確定／還沒開始）</option>' + opts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>'; }).join('');
      if (stepQ && (opts.some(function (o) { return o.id === stepQ; }) || /^t\d{1,2}$/.test(stepQ))) sel.value = stepQ;
      if (!opts.length) sel.parentNode.removeChild(sel), $('app').querySelector('label[for="step"]').style.display = 'none';
      suggest();
    }
    function curStep() { var s = $('step'); return s ? s.value : stepQ; }
    var sug = [];
    function suggest() {
      sug = UC.suggest(UNIT, curStep());
      $('sug').innerHTML = sug.map(function (q, i) { return '<button type="button" class="chip" data-s="' + i + '">' + esc(q) + '</button>'; }).join('');
    }
    function left() {
      var n = UC.typedLeft(UP.used);
      $('left').textContent = n > 0 ? '今天還能問 ' + n + ' 次（所有單元合計每天 ' + UC.COACH_PER_DAY + ' 次，明天 00:00 重算）' : '今天的次數用完了，明天 00:00 再問。';
      $('send').disabled = n <= 0 || !!UP.key;
      Array.prototype.forEach.call($('quick').querySelectorAll('button'), function (b) { b.disabled = n <= 0 || !!UP.key; });
    }
    function bubble(cls, who, text) {
      var log = $('log'); if (log.querySelector('.empty')) log.innerHTML = '';
      var d = doc.createElement('div'); d.className = cls; d.innerHTML = '<b>' + esc(who) + '</b>'; d.appendChild(doc.createTextNode(text)); log.appendChild(d);
      try { d.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      return d;
    }
    var waitEl = null;
    function ask(text, stepId) {
      text = tr(text); if (!text) { toast('先打出你的問題再送出'); return; }
      if (UP.key || UC.typedLeft(UP.used) <= 0) return;
      UP.key = 'pending'; left(); bubble('q', '我', text); waitEl = bubble('a', '助教', '助教想一下…');
      store.reserveCoach(sid).then(function (r) {
        if (!r.ok) { UP.key = ''; UP.used = UC.COACH_PER_DAY; waitEl.textContent = '今天的次數用完了，明天 00:00 再問。'; left(); return; }
        var key = String(NOW()), q = UC.typedPayload(UNIT, stepId, text); q.t = Number(key); UP.key = key;
        return store.putCoachQ(sid, key, q).then(function () {
          try { store.logEvent(sid, 'ask', 'unit:' + UNIT); } catch (e) {}
          $('ask').value = '';
          setTimeout(function () { if (UP.key === key) { UP.key = ''; waitEl.textContent = '助教現在忙不過來，稍後再試。'; waitEl.className = 'a warn'; left(); } }, 60000);
        });
      }).catch(function (e) { UP.key = ''; if (waitEl) { waitEl.textContent = '送不出去：' + ((e && e.message) || '請稍後再試'); waitEl.className = 'a warn'; } left(); });
    }
    function bind() {
      $('quick').onclick = function (e) { var b = e.target.closest && e.target.closest('button[data-q]'); if (!b || b.disabled) return; var x = quickOf(UNIT)[Number(b.dataset.q)]; if (x) ask(x.text, x.step); };
      $('sug').onclick = function (e) { var b = e.target.closest && e.target.closest('button[data-s]'); if (!b) return; $('ask').value = sug[Number(b.dataset.s)] || ''; $('ask').focus(); };
      $('send').onclick = function () { ask($('ask').value, curStep()); };
      if ($('step')) $('step').onchange = suggest;
      try { store.watchCoachUsed(sid, function (n) { UP.used = n; left(); }); } catch (e) {}
      try {
        store.watchCoachAnswers(sid, function (a) {
          var r = UP.key && a[UP.key]; if (!r) return; UP.key = '';
          if (waitEl) { waitEl.textContent = r.text || '（助教沒有回答，請再試一次）'; waitEl.className = r.ok === false ? 'a warn' : 'a'; }
          if (r.ok === false && r.err === 'cap') UP.used = UC.COACH_PER_DAY;
          left();
        });
      } catch (e) {}
      setInterval(function () {   /* 停在同一頁太久的提醒：沿用單元提醒（條件要看學生內容的不出） */
        var m = (NOW() - UP.t0) / 60000;
        UC.nudges(UNIT, curStep(), m).forEach(function (x) { if (x.cond || UP.shown[x.id]) return; UP.shown[x.id] = 1; var d = doc.createElement('div'); d.className = 'nudge'; d.textContent = '💡 ' + x.text; $('uNudge').appendChild(d); });
      }, 30000);
    }
    function start(theSid) {
      sid = theSid; $('gate').hidden = true; $('app').hidden = false; render(); bind(); left();
      win.ERG_TA = { unit: UNIT, sid: sid, ask: ask };
    }
    if (LOCAL) {
      var s0 = tr(Q.get('sid')); try { if (s0) win.localStorage.setItem('erg:pxsid', s0); else s0 = win.localStorage.getItem('erg:pxsid') || ''; } catch (e) {}
      if (!s0) { gate({ title: '本機測試模式', body: '網址要帶 sid=學號。' }, false); return; }
      store = XS.makeStore({ root: win.ERG_SB_STORE.localRoot(win.localStorage, 'LOCALPRX'), caseId: 'sms', now: NOW });
      start(s0); return;
    }
    if (!win.firebase.apps.length) win.firebase.initializeApp(win.ERG_FB);
    var fdb = win.firebase.database();
    store = XS.makeStore({ root: fdb.ref('prx/' + sess()), caseId: 'sms', now: NOW, log: function (m) { win.console.warn('[prx]', m); } });
    win.firebase.auth().onAuthStateChanged(function (user) {
      if (!user) { gate({ title: '請先登入', body: '助教要知道你是誰，才能算你今天的提問次數。請先從急診室登入，再回來這一頁。' }, true); return; }
      fdb.ref('er/users/' + user.uid).once('value', function (s) {
        var rec = s.val();
        if (rec && rec.sid) { if (!sid) start(String(rec.sid)); }
        else gate({ title: '還沒綁定學號', body: '這個帳號還沒綁定學號，請先到急診室完成登入與綁定，再回來這一頁。' }, true);
      }, function () { gate({ title: '讀不到你的帳號資料', body: '請稍後重新整理；還是不行就回報給老師。' }, false); });
    });
  };
  return TA;
});
