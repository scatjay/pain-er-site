/* 10-29 楊老師：學生被即時訪談／助教的題數上限擋住時，要能從對話區旁邊「申請臨時提高上限」。
   做法：不新增資料庫節點、不改 Firebase 規則——申請走既有的回報管道 er/_feedback（kind:'quota'，ctx 帶區域、原因、今日用量與上限）。
   老師用 tools/er_ops.py quota-requests 看、boost 指令同意；同意後代理程式在該生下一次提問時把「臨時提高中」寫進他自己才讀得到的
   sbx/{場次}/coach/{學號}/liveq（規則：只有本人與老師讀得到），這支檔案讀它並在對話區顯示到期時間。
   每人每天最多送 3 次；送出後按鈕停用 10 分鐘。全程不用 alert／confirm／prompt。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_QUOTA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var VERSION = 'quota-v1-20261029', MAX_PER_DAY = 3, COOLDOWN_MS = 10 * 60 * 1000, NOTE_MAX = 80, TZ = 8 * 3600 * 1000;
  var REASONS = [
    { id: 'stuck', label: '我在認真問，升級卡住了' },
    { id: 'practice', label: '想多練習' },
    { id: 'other', label: '其他' }
  ];
  var WHERE = { live: '即時訪談', coach: '訪談助教', sb: '故事板助教' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(ts) { var d = new Date(Number(ts) + TZ); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* 到期時間：學生本機時區 HH:MM；跨日「明天 HH:MM」；更久以後「M/D HH:MM」 */
  function clock(until, now) {
    var d = new Date(Number(until)), n = new Date(Number(now)), hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    var a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    var diff = Math.round((a - b) / 86400000);
    if (diff <= 0) return hm;
    if (diff === 1) return '明天 ' + hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }
  /* liveq = 代理程式寫的 {day, used, hour, dayCap, until?, mult?}；只有 until 還沒到、hour/dayCap 合理才算「臨時提高中」 */
  function boostOf(liveq, now) {
    if (!liveq || typeof liveq !== 'object') return null;
    var u = Number(liveq.until), h = Number(liveq.hour), d = Number(liveq.dayCap);
    if (!(u > Number(now)) || !(h > 0) || !(d > 0)) return null;
    return { until: u, hour: h, day: d, mult: Number(liveq.mult) || 0 };
  }
  function boostLabel(liveq, now) {
    var b = boostOf(liveq, now); if (!b) return '';
    return '🔼 臨時提高中：每小時 ' + b.hour + ' 題、每日 ' + b.day + ' 題，到 ' + clock(b.until, now);
  }
  /* 代理程式回給學生的「被擋」文字 → 'day'（個人每日）／'hour'（個人每小時）／''（不是個人額度，例如全班額度，申請也沒用）。
     文字與 tools/er_live_guard.py（MSG_RATE_HOUR）、er_chat_daemon.py（每人每日）一致；test_quota_request.js 會鎖住 */
  function capKind(turn) {
    if (!turn || turn.role === 'u') return '';
    var s = String(turn.text || '');
    if (s.indexOf('你今天的即時訪談額度') >= 0) return 'day';
    if (s.indexOf('你這一小時已經問了') >= 0) return 'hour';
    return '';
  }

  /* 每人每天 3 次、送出後 10 分鐘內停用。狀態存這台瀏覽器（只是減少亂送；真正的把關在老師端） */
  function stKey(sid) { return 'erg_quota_' + String(sid || '').toLowerCase(); }
  function loadState(storage, sid, now) {
    var o = {}; try { o = JSON.parse(storage.getItem(stKey(sid)) || '{}') || {}; } catch (e) { o = {}; }
    var day = dayKey(now);
    return { day: day, n: o.day === day ? (Number(o.n) || 0) : 0, last: Number(o.last) || 0 };
  }
  function check(st, now) {
    if (st.n >= MAX_PER_DAY) return { ok: false, why: 'max', left: 0, waitMs: 0 };
    var w = st.last ? st.last + COOLDOWN_MS - now : 0;
    if (w > 0) return { ok: false, why: 'cooldown', left: MAX_PER_DAY - st.n, waitMs: w };
    return { ok: true, why: '', left: MAX_PER_DAY - st.n, waitMs: 0 };
  }
  function recordSent(storage, sid, now) {
    var st = loadState(storage, sid, now); st.n += 1; st.last = now;
    try { storage.setItem(stKey(sid), JSON.stringify({ day: st.day, n: st.n, last: st.last })); } catch (e) {}
    return st;
  }

  /* 送去 er/_feedback 的一筆（與一般回報同欄位：t、v、sid、cls、kind、text、sess、name、ctx）。不含 undefined（Firebase 不收） */
  function buildEntry(input, ctx, now) {
    ctx = ctx || {}; input = input || {};
    var r = REASONS.filter(function (x) { return x.id === input.reason; })[0];
    if (!r) throw new Error('請選一個原因');
    var where = WHERE[input.where] ? input.where : 'live', note = String(input.note || '').trim().slice(0, NOTE_MAX);
    var c = { kind: 'quota', where: where, reason: r.id, reasonLabel: r.label };
    if (note) c.note = note;
    if (isFinite(Number(ctx.used)) && ctx.used !== '' && ctx.used != null) c.used = Number(ctx.used);
    if (Number(ctx.hourCap) > 0) c.hourCap = Number(ctx.hourCap);
    if (Number(ctx.dayCap) > 0) c.dayCap = Number(ctx.dayCap);
    if (Number(ctx.coachCap) > 0) c.coachCap = Number(ctx.coachCap);
    if (ctx.room) c.room = String(ctx.room);
    if (ctx.boosted) c.boosted = true;
    c.ua = String(ctx.ua || '').slice(0, 120);
    var text = '申請臨時提高上限｜' + WHERE[where] + '｜' + r.label + (note ? '｜' + note : '') + (c.used != null ? '｜今日已用 ' + c.used + (c.dayCap ? '／' + c.dayCap : c.coachCap ? '／' + c.coachCap : '') : '');
    return { t: now, v: VERSION, sid: String(ctx.sid || ''), cls: String(ctx.cls || ''), name: String(ctx.name || ''), sess: String(ctx.sess || ''), kind: 'quota', text: text.slice(0, 300), ctx: c };
  }

  /* ───── 畫面 ───── */
  var views = [], LQ = {}, tick = null;
  function setLiveq(sid, v) { LQ[String(sid || '').toLowerCase()] = v || null; refreshAll(); }
  function getLiveq(sid) { return LQ[String(sid || '').toLowerCase()] || null; }
  /* 讀自己的 liveq；db 是 firebase.database()。回傳取消函式 */
  function watchLiveq(db, sess, sid) {
    if (!db || !sess || !sid) return function () {};
    var ref = db.ref('sbx/' + sess + '/coach/' + sid + '/liveq'), fn = function (s) { setLiveq(sid, s && s.val ? s.val() : null); };
    try { ref.on('value', fn, function () {}); } catch (e) { return function () {}; }
    return function () { try { ref.off('value', fn); } catch (e) {} };
  }
  function refreshAll() {
    views = views.filter(function (v) { return v.el && (v.el.isConnected !== false) && (typeof document === 'undefined' || document.body.contains(v.el)); });
    views.forEach(function (v) { try { render(v); } catch (e) {} });
    if (tick) { clearTimeout(tick); tick = null; }
    var now = Date.now(), next = 0;
    views.forEach(function (v) {
      var c = v.opts.getCtx ? v.opts.getCtx() : {}, q = v.opts.where === 'live' ? getLiveq(c.sid) : null, b = boostOf(q, now), st = loadState(v.opts.storage || localStore(), c.sid, now), ck = check(st, now);
      [b ? b.until - now : 0, ck.waitMs].forEach(function (ms) { if (ms > 0 && (!next || ms < next)) next = ms; });
    });
    if (next) tick = setTimeout(refreshAll, Math.min(next + 400, 2147000000));
  }
  function localStore() { try { return window.localStorage; } catch (e) { return { getItem: function () { return null; }, setItem: function () {} }; } }

  function render(v) {
    var o = v.opts, el = v.el, now = (o.now || Date.now)(), ctx = o.getCtx ? (o.getCtx() || {}) : {}, store = o.storage || localStore();
    var btn = o.btnClass || 'ghost', fs = 'font-size:' + (o.fontSize || 'var(--fs-1,12px)');
    var liveq = o.where === 'live' ? getLiveq(ctx.sid) : null, lab = boostLabel(liveq, now);
    var st = loadState(store, ctx.sid, now), ck = check(st, now);
    if (v.s.open && ck.ok && el.querySelector('.qr-form') && !v.force) return;   /* 正在打字，別重畫把游標弄丟 */
    v.force = false;
    var blocked = typeof o.blocked === 'function' ? !!o.blocked() : !!o.blocked, h = '<div class="qr" data-qr-where="' + esc(o.where) + '" style="margin:4px 0;' + fs + '">';
    if (lab) h += '<div class="qr-boost" style="font-weight:700;margin:2px 0">' + esc(lab) + '</div>';
    if (v.s.sentMsg && !v.s.open) h += '<div class="qr-msg muted" style="margin:2px 0">' + esc(v.s.sentMsg) + '</div>';
    if (v.s.open && ck.ok) {
      h += '<div class="qr-form" style="border:1px dashed currentColor;border-radius:6px;padding:6px 8px;margin:4px 0"><div style="font-weight:700;margin-bottom:4px">🔼 申請臨時提高上限（' + esc(WHERE[o.where] || '') + '）</div>' +
        REASONS.map(function (r, i) { return '<label style="display:block;margin:2px 0"><input type="radio" name="qr-r-' + v.id + '" value="' + r.id + '"' + ((v.s.reason || 'stuck') === r.id ? ' checked' : '') + ' style="width:auto;margin-right:4px">' + esc(r.label) + '</label>'; }).join('') +
        '<input class="qr-note" maxlength="' + NOTE_MAX + '" placeholder="想補充一句話也可以（選填，' + NOTE_MAX + ' 字內）" value="' + esc(v.s.note || '') + '" style="width:100%;box-sizing:border-box;margin:4px 0">' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><button type="button" class="' + btn + ' qr-send" style="' + fs + '">送出申請</button><button type="button" class="' + btn + ' qr-cancel" style="' + fs + '">取消</button><span class="qr-err err" style="color:#b3261e"></span></div>' +
        '<div class="muted" style="margin-top:4px">老師同意後才會生效，不一定會調；今天還能送 ' + ck.left + ' 次。</div></div>';
    } else if (!ck.ok && ck.why === 'cooldown') {
      h += '<button type="button" class="' + btn + '" disabled style="' + fs + '">已送出，老師同意後自動生效</button>';
    } else if (!ck.ok && ck.why === 'max') {
      h += '<span class="muted">今天已經送了 ' + MAX_PER_DAY + ' 次申請，明天再試；先把手上的整理一下吧。</span>';
    } else {
      h += (blocked ? '<span style="margin-right:6px">額度用完了，覺得自己是認真在問嗎？</span>' : '') + '<button type="button" class="' + btn + ' qr-open"' + (blocked ? ' style="' + fs + ';font-weight:700"' : ' style="' + fs + '"') + '>🔼 申請臨時提高上限</button>';
    }
    el.innerHTML = h + '</div>';
    var q = function (s) { return el.querySelector(s); };
    var bo = q('.qr-open'); if (bo) bo.onclick = function () { v.s.open = true; v.s.sentMsg = ''; v.force = true; render(v); var n = q('.qr-note'); if (n) n.focus(); };
    var bc = q('.qr-cancel'); if (bc) bc.onclick = function () { v.s.open = false; v.force = true; render(v); };
    var nt = q('.qr-note'); if (nt) nt.oninput = function () { v.s.note = nt.value; };
    Array.prototype.forEach.call(el.querySelectorAll('input[name="qr-r-' + v.id + '"]'), function (r) { r.onchange = function () { v.s.reason = r.value; }; });
    var bs = q('.qr-send'); if (bs) bs.onclick = function () {
      var sel = el.querySelector('input[name="qr-r-' + v.id + '"]:checked'), note = (q('.qr-note') || {}).value || '', err = q('.qr-err');
      v.s.reason = sel ? sel.value : 'stuck'; v.s.note = note;
      var t = (o.now || Date.now)(), st2 = loadState(store, ctx.sid, t), ck2 = check(st2, t);
      if (!ck2.ok) { if (err) err.textContent = ck2.why === 'max' ? '今天已經送了 ' + MAX_PER_DAY + ' 次。' : '剛送過，請稍等。'; return; }
      var c2 = o.getCtx ? (o.getCtx() || {}) : {}, lq = o.where === 'live' ? getLiveq(c2.sid) : null, entry;
      var ctx2 = { sid: c2.sid, cls: c2.cls, name: c2.name, sess: c2.sess, room: c2.room, ua: c2.ua, used: lq && lq.used != null ? lq.used : c2.used, hourCap: lq ? lq.hour : c2.hourCap, dayCap: lq ? lq.dayCap : c2.dayCap, coachCap: c2.coachCap, boosted: !!boostOf(lq, t) };
      try { entry = buildEntry({ where: o.where, reason: v.s.reason, note: note }, ctx2, t); } catch (x) { if (err) err.textContent = x.message; return; }
      bs.disabled = true;
      Promise.resolve(o.push ? o.push(entry) : push(c2.db, store, entry)).then(function () {
        recordSent(store, c2.sid, t); v.s.open = false; v.s.note = ''; v.s.sentMsg = ''; refreshAll();
      }, function (e) { bs.disabled = false; if (err) err.textContent = '送不出去（' + (e && e.message ? String(e.message).slice(0, 40) : '網路問題') + '），稍後再按一次。'; });
    };
  }
  /* 預設送法：線上→ er/_feedback；本機版（沒有資料庫）→ 存進這台瀏覽器的回報清單，讓老師用「複製」收到 */
  function push(db, storage, entry) {
    if (db) return db.ref('er/_feedback').push(entry);
    try { var a = JSON.parse(storage.getItem('erg2:feedback') || '[]'); if (!Array.isArray(a)) a = []; a.push(entry); storage.setItem('erg2:feedback', JSON.stringify(a.slice(-200))); } catch (e) { return Promise.reject(e); }
    return Promise.resolve();
  }

  var seq = 0, MEMO = {};   /* 表單打到一半、面板被重畫（換分頁、換人物）時，開著的表單與已打的字要留住 */
  /* el：容器；opts：{ where:'live'|'coach'|'sb', getCtx:()=>{sid,cls,name,sess,room,db,used,hourCap,dayCap,coachCap,ua}, blocked?, btnClass?, fontSize?, storage?, now?, push? } */
  function mount(el, opts) {
    if (!el || typeof document === 'undefined') return null;
    opts = opts || {};
    var old = views.filter(function (v) { return v.el === el; })[0];
    if (old) { old.opts = opts; render(old); refreshAll(); return old; }
    var key = opts.where + '|' + ((opts.getCtx && opts.getCtx() || {}).sid || ''), v = { id: ++seq, el: el, opts: opts, s: (MEMO[key] = MEMO[key] || { open: false, note: '', reason: 'stuck', sentMsg: '' }) };
    views.push(v); render(v); refreshAll(); return v;
  }
  function _reset() { views = []; LQ = {}; MEMO = {}; }

  return { VERSION: VERSION, MAX_PER_DAY: MAX_PER_DAY, COOLDOWN_MS: COOLDOWN_MS, NOTE_MAX: NOTE_MAX, REASONS: REASONS, WHERE: WHERE, dayKey: dayKey, clock: clock, boostOf: boostOf, boostLabel: boostLabel,
    capKind: capKind, loadState: loadState, check: check, recordSent: recordSent, buildEntry: buildEntry, push: push, mount: mount, watchLiveq: watchLiveq, setLiveq: setLiveq, getLiveq: getLiveq, refreshAll: refreshAll, _reset: _reset };
});
