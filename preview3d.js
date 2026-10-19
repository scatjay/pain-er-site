/* 3D 預覽（測試版）入口：只在桌機版 index.html 載入（m.html 沒有這支）。
   總開關：index.html 上的 window.ERG_3D_PREVIEW（false＝整顆鈕不出現、也不載入 three／view3d.js，連 ?view=3d 都不理）。
   決策（decide，純函式）：網址 ?view=3d／?view=2d 優先；其次記住的選擇（localStorage erg3d:view）；預設 2D。
   鈕只在寬 ≥1024、WebGL 可用時出現；網址明講 view=3d 時照載（view3d.js 自己處理建不出 WebGL 的退路）。
   切換不重新整理頁面：2D→3D 第一次才載入 three；之後 3D↔2D 只切 view3d.js 的 setEnabled。載入失敗給頁內提示（不用 alert／confirm／prompt）。 */
(function (root) {
  'use strict';
  var KEY = 'erg3d:view', MIN_W = 1024;
  function urlView(search) { var m = /[?&]view=(3d|2d)(&|$)/.exec(search || ''); return m ? m[1] : ''; }
  function decide(o) {
    o = o || {};
    var out = { flag: !!o.flag, urlView: urlView(o.search), mode: '2d', showBtn: false, load: false };
    if (!o.flag || o.mobilePage) return out;
    var canBtn = (Number(o.width) >= MIN_W) && !!o.webgl;
    out.showBtn = canBtn;
    var stored = (o.stored === '3d' || o.stored === '2d') ? o.stored : '';
    if (out.urlView) out.mode = out.urlView; else if (canBtn && stored) out.mode = stored;
    out.load = out.mode === '3d' && (out.urlView === '3d' || canBtn);
    return out;
  }
  var api = { KEY: KEY, MIN_W: MIN_W, urlView: urlView, decide: decide };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof document === 'undefined') return;
  root.ERG_PREVIEW3D = api;

  function ls(k, v) { try { if (v === undefined) return root.localStorage.getItem(k); root.localStorage.setItem(k, v); } catch (e) { return null; } }
  function hasWebGL() {
    try { var c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return false; var x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return true; } catch (e) { return false; }
  }
  var pending = '', pendT = 0;
  function toast(msg) {
    try {
      var g = document.getElementById('game');
      if (!(g && g.classList.contains('on'))) { pending = msg; if (!pendT) pendT = setInterval(function () { var g2 = document.getElementById('game'); if (g2 && g2.classList.contains('on')) { clearInterval(pendT); pendT = 0; var m = pending; pending = ''; if (m) toast(m); } }, 800); return; }
      var R = root.ERG_ROOM; if (R && R.toast) { R.toast(msg); return; }
      var t = document.getElementById('v3dNotice');
      if (!t) { t = document.createElement('div'); t.id = 'v3dNotice'; t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483200;max-width:86%;background:#ffd43b;color:#222;border:2px solid #222;border-radius:8px;padding:6px 14px;font-size:14px;font-weight:700;pointer-events:none'; document.body.appendChild(t); }
      t.textContent = msg; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, 5000);
    } catch (e) { /* 提示失敗不能影響遊戲 */ }
  }

  var flag = root.ERG_3D_PREVIEW !== false && root.ERG_3D_PREVIEW !== 0 && root.ERG_3D_PREVIEW !== 'false';
  var env = { flag: flag, search: location.search, width: root.innerWidth, stored: ls(KEY), webgl: flag ? hasWebGL() : false, mobilePage: /(^|\/)m\.html$/.test(location.pathname) };
  var d = decide(env), mode = d.mode, three = { started: false, failed: false };
  root.ERG_PREVIEW3D.state = function () { return { flag: flag, decision: d, mode: mode, started: three.started, failed: three.failed }; };
  if (!flag) return;   /* 總開關關著：什麼都不做（不載入 three、不放鈕） */

  function loadThree() {
    if (three.started) return; three.started = true;
    var T = 'https://cdn.jsdelivr.net/npm/three@0.169.0/', im = document.createElement('script'); im.type = 'importmap';
    im.textContent = JSON.stringify({ imports: { three: T + 'build/three.module.js', 'three/addons/': T + 'examples/jsm/' } }); document.head.appendChild(im);
    var s = document.createElement('script'); s.type = 'module'; s.src = 'view3d.js?v=202610191930';
    s.onerror = function () {
      three.failed = true;
      root.ERG_V3D = { loaded: false, active: function () { return false; }, quality: function () { return ''; }, errCount: function () { return 0; }, errors: function () { return []; }, fallback: function () { return 'load-failed'; } };
      toast('3D 畫面載入失敗（可能是網路擋住了），已使用 2D 畫面，內容一樣，可以繼續玩。');
      mode = '2d'; ls(KEY, '2d'); sync();
    };
    document.head.appendChild(s);
  }
  var btn = document.getElementById('v3dBtn'), hint = document.getElementById('v3dHint');
  function sync() {
    if (!btn) return; var on = mode === '3d', label = three.failed ? '3D 載入失敗' : (on ? '回 2D' : '3D 預覽（測試版）');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.classList.toggle('on', on); btn.classList.toggle('fail', !!three.failed);
    btn.setAttribute('aria-label', label);   /* 窄視窗時畫面上只剩短字，完整名稱靠這個與 title */
    btn.title = three.failed ? '這台電腦載入不了 3D，繼續用 2D' : (on ? '回到 2D 畫面（內容一樣）' : '切到 3D 預覽（試做中，有問題請用回報按鈕）；隨時可以按「回 2D」');
    btn.disabled = !!three.failed;
  }
  function setMode(next) {
    if (three.failed && next === '3d') return;
    mode = next; ls(KEY, next);
    try { if (urlView(location.search) && root.history && root.history.replaceState) { var u = new URL(location.href); u.searchParams.set('view', next); root.history.replaceState(null, '', u.toString()); } } catch (e) { /* 網址沒改成也不影響 */ }
    if (next === '3d') { toast('3D 預覽試做中，有問題請用「回報」按鈕；隨時可以按「回 2D」。'); if (!three.started) loadThree(); else if (root.ERG_V3D && root.ERG_V3D.setEnabled) root.ERG_V3D.setEnabled(true); }
    else if (root.ERG_V3D && root.ERG_V3D.setEnabled) root.ERG_V3D.setEnabled(false);
    sync();
  }
  if (d.showBtn && btn) {
    btn.hidden = false; if (hint) hint.hidden = false; try { document.body.classList.add('v3d-btn'); } catch (e) { /* 少了這個 class 只是窄視窗擠一點 */ }
    sync();
    btn.addEventListener('click', function () { setMode(mode === '3d' ? '2d' : '3d'); });
  }
  if (d.load) loadThree();
})(typeof window !== 'undefined' ? window : globalThis);
