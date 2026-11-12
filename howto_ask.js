/* 「怎麼問」閱讀頁＋一對一練習（11-12，這位使用者專家的建議）。內容全部來自規則檔 R.how（docs/IC_RULES.json），所以專家指引介面可以改。
   不呼叫模型、不連網、不寫資料庫；只在這台瀏覽器的 localStorage 記「練習做完了」。
   匯出（Node：require；瀏覽器：window.ERG_HOW）
     render(el, rules)                   把閱讀頁畫進 el（五個原則、太長、同一件事三種問法、不同對象的聽感）
     practiceCheck(i, text, prevReply, rules) → { ok, tip }   練習第 i 步（0、1、2）過不過；tip 是沒過時的提示
     mountPractice(el, rules, opts)      練習畫面（opts.key＝記「已做完」的 localStorage 鍵；可跳過） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./interview_coach.js'));
  else root.ERG_HOW = factory(root.ERG_IC);
})(typeof self !== 'undefined' ? self : this, function (IC) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bare(t) { return IC && IC.bareQ ? IC.bareQ(t) : String(t || '').replace(/\s/g, ''); }

  function render(el, rules) {
    var H = rules && rules.how; if (!el || !H) return false;
    var h = '<div class="card icHowBox" style="margin:6px 0"><b>📖 ' + esc(H.title) + '</b><div class="muted" style="font-size:var(--fs-1);margin:4px 0">' + esc(H.intro) + '</div>';
    (H.principles || []).forEach(function (p, i) {
      h += '<details style="margin:4px 0"' + (i === 0 ? ' open' : '') + '><summary style="cursor:pointer;min-height:44px;font-size:var(--fs-2)"><b>' + (i + 1) + '. ' + esc(p.title) + '</b></summary>' +
        '<div style="font-size:var(--fs-2)">' + esc(p.rule) + '</div>' +
        '<div style="font-size:var(--fs-2);margin-top:4px">❌ ' + esc(p.bad) + '</div><div style="font-size:var(--fs-2)">✅ ' + esc(p.good) + '</div><div class="muted" style="font-size:var(--fs-1);margin-top:2px">為什麼：' + esc(p.why) + '</div></details>';
    });
    h += '<details style="margin:4px 0"><summary style="cursor:pointer;min-height:44px;font-size:var(--fs-2)"><b>' + esc(H.longTitle) + '</b></summary><div style="font-size:var(--fs-2)">' + esc(H.longRule) + '</div></details>';
    h += '<details style="margin:4px 0"><summary style="cursor:pointer;min-height:44px;font-size:var(--fs-2)"><b>' + esc(H.contrastTitle) + '</b></summary><div class="muted" style="font-size:var(--fs-1)">' + esc(H.contrastTopic) + '</div>';
    (H.contrast || []).forEach(function (c) { h += '<div class="card" style="margin:4px 0;padding:6px 8px"><div class="muted" style="font-size:var(--fs-1)">' + esc(c.tag) + '</div><div style="font-size:var(--fs-2)">「' + esc(c.say) + '」</div><div style="font-size:var(--fs-2);margin-top:2px">👂 對方的感受：' + esc(c.feel) + '</div></div>'; });
    h += '<div class="muted" style="font-size:var(--fs-1);margin:6px 0 2px">' + esc(H.styleTitle) + '</div><div style="font-size:var(--fs-1)">' + esc(H.styleNote) + '</div>';
    (H.styleRows || []).forEach(function (r) { h += '<div style="font-size:var(--fs-2);margin:3px 0"><b>' + esc(r.who) + '</b>：' + esc(r.feel) + '</div>'; });
    h += '</details></div>';
    el.innerHTML = h; return true;
  }

  /* 練習第 i 步過不過：0 自我介紹＋問一件事；1 撿起對方剛說的詞；2 不是是非題、不是引導、不太長 */
  function practiceCheck(i, text, prevReply, rules) {
    var H = rules && rules.how, S = H && H.practiceSteps && H.practiceSteps[i]; if (!S) return { ok: false, tip: '' };
    var t = String(text || '').trim(), b = bare(t), ok = false;
    if (i === 0) ok = b.length >= 10 && /(我是|修課|學生|同學|想請教|想了解|想問問)/.test(t) && /(什麼|甚麼|怎麼|如何|哪|經驗|情形|那天|上次|上一次|做了|嗎|？|\?)/.test(t);
    else if (i === 1) ok = b.length >= 5 && !!(IC && IC.echoGram && IC.echoGram(t, prevReply || ''));
    else if (i === 2) {
      var r = IC && IC.chipFor ? IC.chipFor([{ role: 'a', text: prevReply || '', t: 1 }, { role: 'u', text: t, t: 2 }], rules, 'patient') : null;
      ok = !!r && ['yn', 'lead', 'long', 'dup', 'tmpl'].indexOf(r.kind) < 0;
    }
    return { ok: ok, tip: ok ? '' : S.fail };
  }

  function mountPractice(el, rules, opts) {
    var H = rules && rules.how; if (!el || !H || typeof document === 'undefined') return;
    opts = opts || {}; var st = { i: 0, log: [], msg: '', done: false }, steps = H.practiceSteps || [];
    function wasDone() { try { return localStorage.getItem(opts.key) === '1'; } catch (e) { return false; } }
    function draw() {
      var s = steps[st.i], h = '<div class="card icPrac" style="margin:6px 0"><b>🎓 ' + esc(H.practiceTitle) + '</b><div class="muted" style="font-size:var(--fs-1);margin:4px 0">' + esc(H.practiceIntro) + (wasDone() ? '（你之前做完過一次）' : '') + '</div>';
      st.log.forEach(function (m) { h += '<div style="margin:4px 0;display:flex;' + (m.me ? 'justify-content:flex-end' : '') + '"><div style="max-width:88%;padding:6px 10px;border:var(--bw-s) solid var(--ink);border-radius:var(--r-m);background:' + (m.me ? 'var(--yellow)' : 'var(--panel)') + ';font-size:var(--fs-2)">' + (m.me ? '' : '<span class="muted" style="font-size:var(--fs-1)">' + esc(H.practiceWho) + '：</span>') + esc(m.text) + '</div></div>'; });
      if (st.done) h += '<div style="font-size:var(--fs-2);margin:6px 0">✅ ' + esc(H.practiceDone) + '</div><div class="row"><button type="button" class="ghost icPracAgain" style="min-height:44px">再練一次</button></div>';
      else h += '<div style="font-size:var(--fs-2);margin:6px 0"><b>' + esc(s.ask) + '</b></div><div class="muted" style="font-size:var(--fs-1)">' + esc(s.tip) + '</div>' +
        '<div class="row" style="margin-top:6px"><input class="icPracIn" maxlength="200" style="flex:1;font-size:16px;min-height:44px" aria-label="練習：你的問句"><button type="button" class="icPracGo" style="min-height:44px">送出</button></div>' +
        (st.msg ? '<div role="status" class="icPracMsg" style="font-size:var(--fs-2);margin:4px 0;color:#9a4b00">' + esc(st.msg) + '</div>' : '') + '<div class="row" style="margin-top:4px"><button type="button" class="ghost icPracSkip" style="min-height:44px">跳過練習</button></div>';
      h += '</div>'; el.innerHTML = h;
      var go = el.querySelector('.icPracGo'), inp = el.querySelector('.icPracIn');
      if (go) { go.onclick = submit; inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }; }
      var sk = el.querySelector('.icPracSkip'); if (sk) sk.onclick = function () { el.innerHTML = ''; };
      var ag = el.querySelector('.icPracAgain'); if (ag) ag.onclick = function () { st = { i: 0, log: [], msg: '', done: false }; draw(); };
    }
    function submit() {
      var inp = el.querySelector('.icPracIn'), t = (inp.value || '').trim(); if (!t) return;
      var prev = ''; for (var k = st.log.length - 1; k >= 0; k--) if (!st.log[k].me) { prev = st.log[k].text; break; }
      var r = practiceCheck(st.i, t, prev, rules);
      if (!r.ok) { st.msg = r.tip; draw(); el.querySelector('.icPracIn').value = t; return; }
      st.log.push({ me: true, text: t }); st.log.push({ me: false, text: steps[st.i].reply }); st.msg = '';
      if (st.i >= steps.length - 1) { st.done = true; try { localStorage.setItem(opts.key, '1'); } catch (e) {} } else st.i++;
      draw();
    }
    draw();
  }

  return { render: render, practiceCheck: practiceCheck, mountPractice: mountPractice };
});
