/* 提案室的 AI 助手（前端）。分級、名額計算、答案整理沿用故事板助教（sb_coach.js 的 LEVELS／coachLeft／ASK_MAX），
   每日名額自己算（prx/{場次}/coachq，每天 PX.COACH_PER_DAY 次；11-01 起不再和故事板助教共用）；
   題目與答案走 prx/{場次}/coach/{學號}/q|a（題目帶 case＝這份提案的案例，後端只取同案例的證據、讀 doc/{學號}/{案例}），由 tools/prx_coach.py 回答（它把故事板助教後端的 Env、Vertex 呼叫、名額與費用上限整個借過去用）。
   只看得到學生自己的資料；每句附出處，沒有出處的叫他回去問；代填標示「助手示範」、算低分、有列數上限。
   本機測試模式（?local=1）沒有後端：固定的示範答案（畫面上會標明）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'), require('./sb_coach.js'), require('./proposal_core.js'));
  else root.ERG_PX_COACH = factory(root.ERG_SB, root.ERG_SB_COACH, root.ERG_PX);
})(typeof self !== 'undefined' ? self : this, function (SB, SBC, PX) {
  'use strict';
  var esc = SB.esc, LEVELS = SBC.LEVELS, ASK_MAX = SBC.ASK_MAX;
  var HELP = {
    hint: '只問你一個問題，指出這裡還缺什麼。不扣分。',
    check: '讀你已經寫的，對照你的紀錄，只告訴你哪裡有問題，不幫你改。不扣分。',
    pattern: '用別的案例示範同樣結構的一句，你再換成自己的內容。不扣分。',
    fill: '照你自己的紀錄把這一列寫出一個示範，標成「🤖 助手示範」。這幾欄幾乎不計分，而且每份提案最多代填 {n} 列。'
  };
  var KIND_NAME = { hint: '提示', check: '檢查', pattern: '句型示範', fill: '代填（示範）' };

  var pure = { HELP: HELP, KIND_NAME: KIND_NAME, LEVELS: LEVELS, left: function (used) { return PX.coachLeft(used); } };
  if (typeof document === 'undefined') return pure;

  var $ = function (id) { return document.getElementById(id); };
  var A = null, LOG = [], pending = {}, offAns = null;

  function injectCss() {
    if ($('pxCoachCss')) return; var st = document.createElement('style'); st.id = 'pxCoachCss';
    st.textContent = '#coachBox .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}#coachBox textarea{min-height:44px}#coachBox .bub{border:2px solid var(--ink);border-radius:10px;padding:6px 8px;margin:6px 0;font-size:13px;background:var(--panel)}' +
      '#coachBox .bub.q{background:var(--soft-y)}#coachBox .bub.err{background:var(--soft-r)}#coachBox .meta{font-size:11px;color:var(--muted)}#coachBox .src{display:inline-block;border:2px solid var(--ink);border-radius:99px;padding:0 8px;margin:2px 2px 0 0;font-size:11px;background:var(--soft-g)}' +
      '#coachBox ul.lv{margin:4px 0 6px;padding-left:18px;font-size:12px}' +
      '#coachBox .preset{border:2px dashed var(--ink);border-radius:10px;padding:6px 8px;margin:6px 0}#coachBox .preset.fresh{border-style:solid;background:var(--soft-y)}#coachBox .preset .row button{text-align:left;white-space:normal}';
    document.head.appendChild(st);
  }
  function left() { return pure.left(A.S.coachUsed); }
  function bubble(m) {
    if (m.q) return '<div class="bub q"><div class="meta">我問（' + esc(m.label) + (m.where ? '・' + esc(m.where) : '') + '）</div>' + esc(m.ask || '') + '</div>';
    return '<div class="bub' + (m.ok === false ? ' err' : '') + '"><div class="meta">🤖 助手' + (m.model === 'local-stub' ? '（固定示範答案）' : '') + (m.where ? '・' + esc(m.where) : '') + '</div>' + esc(m.text).replace(/\n/g, '<br>') +
      (m.srcs && m.srcs.length ? '<div>' + m.srcs.map(function (x) { return '<span class="src">〔' + esc(x.label) + '〕</span>'; }).join('') + '</div>' : '') +
      (m.filled ? '<div class="meta">已填進第 ' + m.n + ' 列，標成「🤖 助手示範」，請改成你自己的話。</div>' : '') + '</div>';
  }
  /* 單元預設問題（proposal_prompts.js）：依「這一份」顯示 3–5 題，點了就送給助手；第一次切到新的一份會跳提示 */
  var PP = (typeof window !== 'undefined' && window.ERG_PX_PROMPTS) || null, PRESET = [], seenUnit = '', FRESH = {};
  function curUnit() {
    try {
      var W = window.ERG_WEEKLY, P = window.ERG_PROTO_UI;
      if (W && P && P.unitCtx) { var u = W.unitNow(P.unitCtx()); if (u && u.id) return { id: u.id, name: u.name || u.id }; }
    } catch (e) { }
    return null;
  }
  function presetHtml() {
    var u = curUnit(); PRESET = [];
    if (!PP || !u) return '';
    PRESET = PP.pick(A.S.caseId, u.id); if (!PRESET.length) return '';
    if (seenUnit !== u.id) {   /* 這一頁第一次看到這一份：這台裝置沒看過就標成新的（整頁都維持醒目）並跳提示 */
      seenUnit = u.id; var key = 'pxPromptSeen:' + u.id;
      try { if (!window.localStorage.getItem(key)) { FRESH[u.id] = true; window.localStorage.setItem(key, '1'); } } catch (e) { }
      if (FRESH[u.id]) { try { A.toast('換到「' + u.name + '」了：助手面板有幾個可以直接點的問題。'); } catch (e) { } }
    }
    var fresh = !!FRESH[u.id];
    return '<div class="preset' + (fresh ? ' fresh' : '') + '" id="cPreset"><div class="meta">💡 不知道要問什麼？點一題（這一份：' + esc(u.name) + '）</div><div class="row">' +
      PRESET.map(function (p, i) { return '<button class="mini" data-preset="' + i + '">' + esc(p.q) + '</button>'; }).join('') + '</div></div>';
  }
  function whereOf(q) { return q.target === 'row' ? '第 ' + q.n + ' 列' : (q.target === 'real' ? '現實題' : '方向'); }
  function render() {
    if (!A) return; var box = $('coachBox'); if (!box) return;
    var cfg = A.S.cfg, html = '<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">🤖 提案助手</h2><button class="mini only-m" id="cClose">收起 ▾</button></div>' +
      '<div class="muted">只看得到<b>你自己</b>的訪談、線索、結論和你寫的提案；每句附出處，訪談裡沒有的會叫你回去問。' + (A.local ? '<br><b>本機測試模式：答案是固定的示範，不是真的助手。</b>' : '') + '</div>' +
      '<ul class="lv">' + LEVELS.slice(1).map(function (l) { return '<li><b>' + KIND_NAME[l.kind] + '</b>：' + HELP[l.kind].replace('{n}', cfg.fillPerBoard) + '</li>'; }).join('') + '</ul>' +
      '<div class="meta">今天還能問助手 <b id="cLeft">' + left() + '</b> 次（提案室助手每天 ' + PX.COACH_PER_DAY + ' 次，明天 00:00 重算）。</div>' +
      presetHtml() +
      '<label>想問什麼（可不填，≤' + ASK_MAX + ' 字）<textarea id="cAsk" maxlength="' + ASK_MAX + '" placeholder="例如：我選 LINE 的理由，訪談裡找得到依據嗎？"></textarea></label>' +
      '<div class="row"><span class="meta" style="align-self:center">問方向：</span><button class="mini" data-coach="hint" data-target="dir">提示</button><button class="mini" data-coach="check" data-target="dir">檢查</button><button class="mini" data-coach="pattern" data-target="dir">句型</button></div>' +
      '<div class="meta">每一列、每一題現實題底下也有同樣的鈕，會針對那一列問。</div><div id="cLog">' + LOG.slice(-8).map(bubble).join('') + '</div>';
    if (box.dataset.sig !== html) { var t = $('cAsk'), keep = t ? t.value : ''; box.innerHTML = html; box.dataset.sig = html; if ($('cAsk')) $('cAsk').value = keep; }
  }
  function pushLog(m) { LOG.push(m); if (LOG.length > 40) LOG.shift(); render(); try { if (window.matchMedia && window.matchMedia('(max-width:860px)').matches) { document.body.classList.add('coach-open'); var b = $('coachBox'); if (b) b.scrollTop = b.scrollHeight; } } catch (e) {} }

  function ask(o) {
    var S = A.S, cfg = S.cfg, doc = A.getDoc();
    if (left() <= 0) { A.toast('今天助手的名額用完了，明天 00:00 再問。'); return Promise.resolve(null); }
    var row = o.target === 'row' ? PX.rowByN(doc, o.n) : null;
    if (o.target === 'row' && !row) { A.toast('這一列還沒建立。'); return Promise.resolve(null); }
    if (o.kind === 'fill') {
      if (!row) { A.toast('代填只能用在對準表的某一列。'); return Promise.resolve(null); }
      if (!(row.ai && Object.keys(row.ai).length) && PX.aiFilledRows(doc) >= cfg.fillPerBoard) { A.toast('這份提案最多代填 ' + cfg.fillPerBoard + ' 列，其他列自己寫寫看。'); return Promise.resolve(null); }
    }
    var askText = o.ask != null ? o.ask : (($('cAsk') && $('cAsk').value) || '');
    var q = PX.buildQuestion({ kind: o.kind, target: o.target, n: o.n, key: o.key, ask: askText, rooms: A.roomCodes(), 'case': S.caseId, t: Date.now() });
    pushLog({ q: true, label: KIND_NAME[q.kind], where: whereOf(q), ask: q.ask });
    A.logEvent('coach', q.kind + ':' + q.target + (q.n ? q.n : q.key ? ':' + q.key : ''));
    if (A.local) {   /* 本機也走同一個名額計數（存在本機樹的 coachq），只是答案是固定的 */
      return A.store.reserveCoach(S.sid).then(function (r) {
        if (!r.ok) { A.toast('今天助手的名額用完了。'); return null; }
        var ev = A.evidence()[0] || null, fill = null;
        if (q.kind === 'fill') fill = { decide: '（本機示範）' + (ev ? ev.text.slice(0, 40) : '用你訪談裡的一件事開頭'), dissent: '（本機示範）櫃台人員', tradeoff: '（本機示範）省了開發費，但沒網路的人用不到', refs: ev ? [ev.id] : [] };
        var a = PX.localStub(q, { firstRef: ev && ev.id, firstSrc: ev && ev.src, fill: fill }); a.target = q.target; a.n = q.n;
        setTimeout(function () { onAnswer(String(q.t), q, a); }, 250); return String(q.t);
      });
    }
    return A.store.reserveCoach(S.sid).then(function (r) {
      if (!r.ok) { A.toast('今天助手的名額用完了。'); return null; }
      var key = String(q.t); pending[key] = q;
      return A.store.putCoachQ(S.sid, key, q).then(function () { return key; });
    }, function (e) { A.toast('助手現在連不上：' + (e && e.message)); return null; });
  }
  function onAnswer(key, q, a) {
    if (!q || !pending[key] && !A.local) return; delete pending[key];
    var p = PX.answerText(a), m = { q: false, text: p.text || (a.ok === false ? '助手現在忙不過來，稍後再試。' : '（沒有內容）'), ok: a.ok !== false, srcs: p.srcs, model: a.model || '', where: whereOf(q), n: q.n };
    if (q.kind === 'fill' && a.ok !== false && a.fill) {
      var any = ['decide', 'dissent', 'tradeoff'].some(function (k) { return PX.tr(a.fill[k]); });
      if (any) { m.filled = !!A.applyFill(q.n, a.fill); } else m.text = (a.text || '你的紀錄還不夠寫這一列。') + ' 先回去再問一個人。';
    }
    pushLog(m);
  }
  function mount(api) {
    A = api; injectCss(); render();
    if (!A.local && A.store.watchCoachAnswers && !offAns) offAns = A.store.watchCoachAnswers(A.S.sid, function (ans) {
      Object.keys(ans).sort().forEach(function (k) { if (pending[k]) onAnswer(k, pending[k], ans[k]); });
    });
    document.addEventListener('click', function (e) {
      var pb = e.target.closest && e.target.closest('button[data-preset]');
      if (pb) { var p = PRESET[Number(pb.dataset.preset)]; if (p) { if ($('cAsk')) $('cAsk').value = p.q; ask({ kind: p.kind, target: 'dir', ask: p.q }); } return; }
      var b = e.target.closest && e.target.closest('button[data-coach]'); if (!b) return;
      ask({ kind: b.dataset.coach, target: b.dataset.target || 'dir', n: Number(b.dataset.n) || 0, key: b.dataset.key || '' });
    });
  }
  pure.mount = mount; pure.render = render; pure.ask = ask; pure._pending = pending;
  return pure;
});
