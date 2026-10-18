/* 問題回報與建議：學生在遊戲裡按「🐛 回報」，內容連同當下狀態（房間、位置、時間、版本、最近的錯誤）存起來。
   目前存在這台電腦的瀏覽器（本機版）；老師後台與跨電腦收集要等新的獨立 Firebase 專案。純函式與介面分開，方便測試。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_FEEDBACK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 'v2-20261009';
  var KINDS = { bug: '🐛 有問題', idea: '💡 建議', confuse: '❓ 看不懂' };
  var MAX = 500, KEEP = 200, KEY = 'erg2:feedback';

  function validate(input) {
    var errors = [], text = String((input && input.text) || '').trim();
    if (!input || !KINDS[input.kind]) errors.push('請選一種：有問題、建議或看不懂');
    if (!text) errors.push('請寫一點內容');
    if (text.length > MAX) errors.push('內容最多 ' + MAX + ' 字');
    return { ok: errors.length === 0, errors: errors };
  }

  /* ctx：{ sid, cls, room, caseId, loc, simTime, w, h, ua, errors:[...] }（includeState 為 false 時只留版本與學號） */
  function buildEntry(input, ctx, now) {
    var v = validate(input); if (!v.ok) throw new Error(v.errors.join('；'));
    ctx = ctx || {};
    var entry = { t: now === undefined ? Date.now() : now, v: VERSION, sid: String(ctx.sid || ''), cls: ctx.cls || '', kind: input.kind, text: String(input.text).trim() };
    if (input.includeState !== false) {
      entry.state = { room: ctx.room || '', caseId: ctx.caseId || '', loc: ctx.loc || '', simTime: ctx.simTime || '', w: ctx.w || 0, h: ctx.h || 0, ua: String(ctx.ua || '').slice(0, 160),
        errors: (ctx.errors || []).slice(-5).map(function (e) { return String(e).slice(0, 200); }) };
    }
    return entry;
  }

  function load(storage) { try { var a = JSON.parse(storage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function save(storage, entry) { var list = load(storage).concat([entry]).slice(-KEEP); storage.setItem(KEY, JSON.stringify(list)); return list; }
  function mine(storage, sid) { return load(storage).filter(function (e) { return e.sid === String(sid); }); }
  /* 一鍵複製給老師的純文字 */
  function asText(list) {
    return list.map(function (e) {
      var d = new Date(e.t), p = function (n) { return (n < 10 ? '0' : '') + n; };
      return '[' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + '] ' + (KINDS[e.kind] || e.kind) + '　' + e.sid + (e.cls ? '（' + e.cls + '）' : '') + '\n' + e.text +
        (e.state ? '\n  狀態：房間 ' + e.state.room + '、案例 ' + e.state.caseId + '、位置 ' + e.state.loc + '、時間 ' + e.state.simTime + '、畫面 ' + e.state.w + '×' + e.state.h + (e.state.errors.length ? '\n  最近的錯誤：' + e.state.errors.join(' / ') : '') : '') + '\n  版本 ' + e.v;
    }).join('\n\n');
  }

  /* —— 以下是瀏覽器端：收錯誤、開表單 —— */
  var errs = [];
  function install(win, APP) {
    if (!win || !win.addEventListener || win.__ergFbInstalled) return; win.__ergFbInstalled = true;
    win.addEventListener('error', function (e) { errs.push((e.message || 'error') + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + e.lineno : '')); if (errs.length > 20) errs.shift(); });
    win.addEventListener('unhandledrejection', function (e) { errs.push('Promise：' + String(e.reason && e.reason.message || e.reason)); if (errs.length > 20) errs.shift(); });
    var doc = win.document, esc = APP.esc;
    function ctxNow() {
      var R = win.ERG_ROOM && win.ERG_ROOM.cur;
      return { sid: APP.me.sid, cls: APP.me.cls, room: R ? R.code : '', caseId: R ? (R.world.meta.id) : '', loc: R ? R.player.loc : '', simTime: R ? win.ERG_CLOCK.format(R.clock) : '', w: win.innerWidth, h: win.innerHeight, ua: win.navigator.userAgent, errors: errs };
    }
    function open() {
      var mineList = APP.me.sid ? mine(APP.storage, APP.me.sid) : [];
      var html = '<div class="row"><b style="flex:1">🐛 回報問題或建議</b><button class="ghost" id="fbClose">關閉</button></div>' +
        '<div class="row" style="margin:8px 0" id="fbKinds">' + Object.keys(KINDS).map(function (k, i) { return '<button class="pill ' + (i === 0 ? 'on' : '') + '" data-k="' + k + '">' + KINDS[k] + '</button>'; }).join('') + '</div>' +
        '<label>寫下來（最多 ' + MAX + ' 字）<textarea id="fbText" maxlength="' + MAX + '" placeholder="例如：點牌子沒反應、走到一半卡住、這句話看不懂、希望可以……"></textarea></label>' +
        '<label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="fbState" checked style="width:auto"> 附上目前的畫面狀態（房間、位置、時間，方便老師重現）</label>' +
        '<div class="row" style="margin-top:8px"><button id="fbSend">送出</button><span id="fbMsg" class="err"></span></div>' +
        '<h2>我送過的（' + mineList.length + '）</h2><div style="max-height:30vh;overflow:auto">' + (mineList.length ? mineList.slice().reverse().map(function (e) { return '<div class="card" style="padding:6px 10px;margin:6px 0;box-shadow:var(--sh) var(--sh) 0 var(--ink)"><span class="tag">' + esc(KINDS[e.kind] || e.kind) + '</span> <span class="muted" style="font-size:var(--fs-1)">' + new Date(e.t).toLocaleString() + '</span><div style="font-size:var(--fs-3)">' + esc(e.text) + '</div></div>'; }).join('') : '<p class="muted">還沒有。</p>') + '</div>' +
        '<div class="row" style="margin-top:8px"><button class="ghost" id="fbCopy">複製我的全部回報（貼給老師）</button><span id="fbCopied" class="muted" style="font-size:var(--fs-1)"></span></div>' +
        (APP.online ? '<p class="muted" style="font-size:var(--fs-1)">送出後老師後台會即時收到；也可以按「複製」留一份。</p>' : '<p class="muted" style="font-size:var(--fs-1)">本機版：回報存在這台電腦的瀏覽器裡。要老師收到，請按「複製」貼給老師。</p>');
      doc.getElementById('modalBox').innerHTML = html; doc.getElementById('modal').classList.add('on');
      var kind = 'bug';
      Array.prototype.forEach.call(doc.querySelectorAll('#fbKinds [data-k]'), function (b) { b.onclick = function () { kind = b.getAttribute('data-k'); Array.prototype.forEach.call(doc.querySelectorAll('#fbKinds [data-k]'), function (x) { x.classList.toggle('on', x === b); }); }; });
      doc.getElementById('fbClose').onclick = function () { doc.getElementById('modal').classList.remove('on'); };
      doc.getElementById('fbSend').onclick = function () {
        try {
          var e = buildEntry({ kind: kind, text: doc.getElementById('fbText').value, includeState: doc.getElementById('fbState').checked }, ctxNow());
          save(APP.storage, e);
          /* 線上模式：同時送到 Firebase er/_feedback，老師後台即時看得到（比照文化遊戲松） */
          if (APP.online && win.firebase) { try { win.firebase.database().ref('er/_feedback').push(Object.assign({}, e, { sess: APP.SESS, name: APP.me.name || '', ctx: e.ctx ? Object.assign({}, e.ctx, { ua: String(e.ctx.ua || '').slice(0, 120) }) : null })); } catch (x) { if (win.console) win.console.warn('feedback 上傳失敗', x); } }
          open(); doc.getElementById('fbMsg').textContent = ''; var m = doc.getElementById('fbMsg'); m.className = 'muted'; m.textContent = APP.online ? '已送出，老師那邊看得到了，謝謝！' : '已送出，謝謝！';
        } catch (x) { doc.getElementById('fbMsg').textContent = x.message; }
      };
      doc.getElementById('fbCopy').onclick = function () {
        var t = asText(mine(APP.storage, APP.me.sid)), done = function () { doc.getElementById('fbCopied').textContent = '已複製'; };
        if (win.navigator.clipboard && win.navigator.clipboard.writeText) win.navigator.clipboard.writeText(t).then(done, function () { doc.getElementById('fbCopied').textContent = '無法複製，請手動選取'; }); else doc.getElementById('fbCopied').textContent = '無法複製，請手動選取';
      };
    }
    Array.prototype.forEach.call(doc.querySelectorAll('[data-fb]'), function (b) { b.onclick = open; });
    return { open: open };
  }
  return { VERSION: VERSION, KINDS: KINDS, MAX: MAX, validate: validate, buildEntry: buildEntry, load: load, save: save, mine: mine, asText: asText, install: install };
});
