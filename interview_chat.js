/* 10-27 楊老師：訪談階段的「怎麼問」對話式助教（理解與提問教練）。
   只幫學生把模糊的困惑變成能問人物的好問題，不替學生寫任何紀錄或格子。
   走的是故事板助教同一條通道：sbx/{場次}/coach/{學號}/q/{key}（kind=course、level=2，nextLv 1＝新對話、2＝接續），
   名額共用 sbx/{場次}/coachq/{日期}/{學號}（每人每日 30 次，上限來自 sbops/config/coachPerDay），一段對話最多 5 輪。
   後端對話記憶在助教後端的記憶體裡（tools/sb_coach_worker.py），這裡只記輪數。
   10-29 臨時提高：每日名額＝floor(coachPerDay × 老師給的倍數)，倍數讀 sbx/{場次}/coach/{學號}/boost（沒有或到期就 ×1），每次送出前現讀。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_ICHAT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MAX_TURNS = 5, ASK_MAX = 300, DEFAULT_LIMIT = 30, WAIT_MS = 45000, TZ = 8 * 3600 * 1000;
  var CHIPS = [
    { label: '這位我該怎麼開頭？', text: '我不知道怎麼開頭問這位，幫我想想。' },
    { label: '我想追問他剛說的', text: '他剛說了一句我想追問，但不知道怎麼問：' },
    { label: '幫我把問題改成開放式', text: '我想問的是：' }
  ];
  function dayKey(ts) { var d = new Date(Number(ts) + TZ); return d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* 問題前面帶一句「我正在訪談誰」，後端才知道在聊哪一位；總長 ≤300 字（規則上限），超過就截斷學生的話 */
  function buildAsk(persona, text) {
    persona = persona || {}; var pre = persona.name ? '（我正在訪談「' + String(persona.name).slice(0, 12) + '」' + (persona.title ? '，' + String(persona.title).slice(0, 20) : '') + '）' : '';
    var t = String(text || '').trim(); return (pre + t).slice(0, ASK_MAX);
  }
  /* 臨時提高的算法在 quota_request.js（瀏覽器是 window.ERG_QUOTA，Node 測試用 require）；兩邊都拿不到就不提高（規則那邊本來就會擋，只是沒有加成） */
  function Qm() { try { if (typeof window !== 'undefined' && window.ERG_QUOTA) return window.ERG_QUOTA; if (typeof require === 'function') return require('./quota_request.js'); } catch (e) { /* 沒有就算了 */ } return null; }
  function effLimit(base, boost, now) { var Q = Qm(); return Q && Q.coachLimit ? Q.coachLimit(base, boost, now) : base; }
  function keyOf(ts) { return String(Math.floor(Number(ts))).padStart ? String(Math.floor(Number(ts))).padStart(13, '0') : ('0000000000000' + Math.floor(Number(ts))).slice(-13); }

  /* 控制器：opts { db, sess, sid, room, now, getPersona, limit } ；db 是 firebase.database()（測試時可換成假的） */
  function create(opts) {
    opts = opts || {}; var now = opts.now || function () { return Date.now(); }, st = { turn: 0, pid: '', busy: false, lim: 0, base: 0, boost: null };
    function base(p) { return opts.db.ref('sbx/' + opts.sess + '/' + p); }
    function limit() {
      var b0 = typeof opts.limit === 'number' ? Promise.resolve(opts.limit)
        : opts.db.ref('sbops/config/coachPerDay').once('value').then(function (s) { var v = Number(s.val()); return v > 0 ? v : DEFAULT_LIMIT; }, function () { return DEFAULT_LIMIT; });
      return b0.then(function (base) {
        st.base = base;
        return base > 0 ? Promise.resolve(opts.db.ref('sbx/' + opts.sess + '/coach/' + opts.sid + '/boost').once('value')).then(function (s) { return s && s.val ? s.val() : null; }, function () { return null; }) : null;
      }).then(function (bo) { st.boost = bo || null; return st.lim = effLimit(st.base, st.boost, now()); });
    }
    function reset(pid) { st.turn = 0; st.pid = pid || ''; }
    function send(text) {
      var persona = opts.getPersona ? opts.getPersona() : {}, pid = persona.pid || persona.name || '';
      if (pid !== st.pid) reset(pid);   /* 換一位人物＝新的一段對話 */
      var t = String(text || '').trim();
      if (!t) return Promise.resolve({ ok: false, err: 'empty', text: '先寫下你想問的事。' });
      if (st.turn >= MAX_TURNS) return Promise.resolve({ ok: false, err: 'chat-cap', text: '這段對話先到這裡（最多 ' + MAX_TURNS + ' 輪）。去問問看，有新的發現再按「新對話」。' });
      if (st.busy) return Promise.resolve({ ok: false, err: 'busy', text: '助教還在想上一題，等它回答。' });
      st.busy = true;
      var ts = now(), day = dayKey(ts), qpath = 'coach/' + opts.sid + '/q/' + keyOf(ts), key = keyOf(ts);
      return limit().then(function (lim) {
        return base('coachq/' + day + '/' + opts.sid).transaction(function (cur) { cur = Number(cur) || 0; return cur >= lim ? undefined : cur + 1; });
      }).then(function (r) {
        if (!r || !r.committed) { st.busy = false; return { ok: false, err: 'cap-user', text: '你今天的助教名額用完了，明天 00:00 再問。' }; }
        var q = { kind: 'course', level: 2, slot: 0, nextLv: st.turn === 0 ? 1 : 2, ask: buildAsk(persona, t), room: String(opts.room || ''), board: 'wall', t: ts };
        return base(qpath).set(q).then(function () { return waitAnswer(key); });
      }).then(function (a) {
        st.busy = false;
        if (a && a.ok !== false) st.turn = Number(a.turn) || (st.turn + 1); else if (a && a.err === 'chat-cap') st.turn = MAX_TURNS;
        return a || { ok: false, err: 'timeout', text: '助教這次沒有回應，稍後再試。' };
      }, function (e) { st.busy = false; return { ok: false, err: 'net', text: '助教現在連不上：' + (e && e.message ? e.message : '網路問題') }; });
    }
    function waitAnswer(key) {
      return new Promise(function (resolve) {
        var ref = base('coach/' + opts.sid + '/a/' + key), done = false, timer = null, fn = null;
        function fin(v) { if (done) return; done = true; clearTimeout(timer); try { ref.off('value', fn); } catch (e) {} resolve(v); }
        fn = function (s) { var v = s && s.val ? s.val() : null; if (v && typeof v === 'object') fin(v); };
        ref.on('value', fn); timer = setTimeout(function () { fin(null); }, opts.waitMs || WAIT_MS);
      });
    }
    return { send: send, reset: reset, state: st, MAX_TURNS: MAX_TURNS, opts: opts, limit: limit };
  }

  /* 畫面：放在「即時訪談」卡片裡。el 是容器；ctl 是 create() 的結果 */
  function mount(el, ctl, opts) {
    opts = opts || {}; if (!el || typeof document === 'undefined') return;
    var log = ctl.log = ctl.log || [];   /* 對話記錄放在控制器上：訪談面板重畫（切分頁、換人）後不會消失 */
    function draw() {
      var turn = ctl.state.turn >= MAX_TURNS ? MAX_TURNS : ctl.state.turn + 1;
      el.innerHTML = '<details class="icchat" style="margin:4px 0"><summary style="cursor:pointer;font-size:var(--fs-2)"><b>💬 跟助教聊怎麼問</b> <span class="muted" style="font-size:var(--fs-1)">（幫你看懂、問得出口；不會替你寫紀錄）</span></summary>' +
        '<div class="muted" style="font-size:var(--fs-1);margin:4px 0">一次只聊一件事，一段最多 ' + MAX_TURNS + ' 輪（目前第 <b id="icTurn">' + turn + '</b> 輪），會用掉今天的助教名額。</div>' +
        '<div class="row" style="flex-wrap:wrap;gap:4px">' + CHIPS.map(function (c, i) { return '<button type="button" class="ghost" data-icchip="' + i + '" style="font-size:var(--fs-1)">' + esc(c.label) + '</button>'; }).join('') + '</div>' +
        '<div id="icChatLog" style="margin:6px 0;font-size:var(--fs-2)">' + log.slice(-6).map(function (m) { return '<div class="card" style="margin:4px 0;padding:4px 8px;' + (m.q ? 'background:var(--soft-y,#fff8db)' : '') + '"><div class="muted" style="font-size:var(--fs-1)">' + (m.q ? '我問' : '🤖 助教') + '</div>' + esc(m.text).replace(/\n/g, '<br>') + '</div>'; }).join('') + '</div>' +
        '<div class="row"><input id="icChatIn" maxlength="' + (ASK_MAX - 40) + '" placeholder="例如：他說話很短，我不知道怎麼追問" style="flex:1"><button type="button" id="icChatGo"' + (ctl.state.turn >= MAX_TURNS ? ' disabled' : '') + '>聊</button><button type="button" class="ghost" id="icChatNew">新對話</button></div><div class="icqr"></div></details>';
      var d = el.querySelector('details'); if (d && opts.open) d.open = true;
      /* 10-29 臨時提高上限：名額（每人每日 30，規則與助教後端各擋一次）用完時鈕變醒目；老師同意後寫 boost，有效名額乘上倍數 */
      try {
        var QR = (typeof window !== 'undefined') && window.ERG_QUOTA, host = el.querySelector('.icqr'), o2 = ctl.opts || {};
        if (QR && host) QR.mount(host, { where: 'coach', blocked: function () { var l = log[log.length - 1]; return !!(l && l.cap); },
          getCtx: function () { return { sid: o2.sid, cls: (o2.cls || ''), name: (o2.name || ''), sess: o2.sess, room: o2.room, db: o2.db || null, coachBase: ctl.state.base, coachCap: ctl.state.lim, ua: (typeof navigator !== 'undefined' ? navigator.userAgent : '') }; } });
        if (o2.db && !ctl._bw) { ctl._bw = true; QR.watchBoost(o2.db, o2.sess, o2.sid); }   /* 老師給的臨時提高：監聽後對話區顯示「每日 N 次，到 HH:MM」 */
        if (ctl.limit && !ctl.state.lim) ctl.limit().then(function () { try { QR.refreshAll(); } catch (e2) {} }, function () {});   /* 先把名額上限讀進來，申請時才帶得出「今日上限」 */
      } catch (e) { /* 申請鈕出錯不能影響助教 */ }
      Array.prototype.forEach.call(el.querySelectorAll('[data-icchip]'), function (b) { b.onclick = function () { var inp = el.querySelector('#icChatIn'); inp.value = CHIPS[Number(b.getAttribute('data-icchip'))].text; inp.focus(); }; });
      el.querySelector('#icChatGo').onclick = go;
      el.querySelector('#icChatIn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } };
      el.querySelector('#icChatNew').onclick = function () { ctl.reset(ctl.state.pid); log.push({ q: false, text: '——新對話——這一段從頭開始，助教不會記得前面聊的。' }); opts.open = true; draw(); };
    }
    function go() {
      var inp = el.querySelector('#icChatIn'), v = inp.value.trim(); if (!v) return;
      var go1 = el.querySelector('#icChatGo'); go1.disabled = true; log.push({ q: true, text: v }); inp.value = ''; opts.open = true; draw();
      ctl.send(v).then(function (a) { log.push({ q: false, text: (a && a.text) || '（沒有回答）', cap: !!(a && a.err === 'cap-user') }); opts.open = true; draw(); });
    }
    draw();
  }
  return { MAX_TURNS: MAX_TURNS, ASK_MAX: ASK_MAX, CHIPS: CHIPS, dayKey: dayKey, buildAsk: buildAsk, keyOf: keyOf, create: create, mount: mount };
});
