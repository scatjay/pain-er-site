/* 11-10 4b4k0171：「手機版與電腦版的回報紀錄、回報技能、清除清單不同步」。
   成因：這三樣原本只存在這台裝置的 localStorage（erg2:feedback、erg_hide_rooms_學號），換裝置就是另一份。
   做法：以 Firebase 為準，各裝置讀同一份——er/{場次}/me/{學號}/fb/{時間戳}＝我送過的回報（整筆）、er/{場次}/me/{學號}/hide/{房間代碼}＝1。
   只讀寫自己這一個節點（一次 once），不訂閱、不讀全站。登入後讀一次，把雲端與本機取聯集；本機有、雲端沒有的補傳上去（舊裝置的紀錄也會進雲端）。
   純函式（mergeFb、mergeHide）可以在 node 裡測，瀏覽器部分只是薄薄一層。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_SYNC_ME = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BIG_KEY = 'erg_bigtext', BIG_CSS = 'html.bigtext{--fs-1:15px;--fs-2:16px;--fs-3:18px;--fs-4:21px}';
  var FB_KEY = 'erg2:feedback', KEEP = 200;
  function hideKey(sid) { return 'erg_hide_rooms_' + sid; }
  /* 回報：以 t（毫秒）當鍵取聯集；雲端與本機都有時留雲端那筆。回傳 { list（本機要存的，依時間、最多 KEEP 筆）, up（要補傳的 { t: entry }） } */
  function mergeFb(localList, remoteObj, sid) {
    sid = String(sid); var by = {}, up = {}, rem = remoteObj && typeof remoteObj === 'object' ? remoteObj : {};
    Object.keys(rem).forEach(function (k) { var e = rem[k]; if (e && e.kind && e.text != null) by[String(e.t || k)] = e; });
    (Array.isArray(localList) ? localList : []).forEach(function (e) {
      if (!e || !e.kind || e.sid !== sid) return;
      var k = String(e.t); if (!by[k]) { by[k] = e; up[k] = e; }
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return Number(a.t) - Number(b.t); }).slice(-KEEP);
    return { list: list, up: up };
  }
  /* 本機存的是「別人（其他學號）的紀錄 + 自己的」混在一起，合併時只動自己的，別人的原樣留著 */
  function mergeIntoLocalList(allLocal, sid, mineMerged) {
    var others = (Array.isArray(allLocal) ? allLocal : []).filter(function (e) { return e && e.sid !== String(sid); });
    return others.concat(mineMerged).slice(-KEEP * 2);
  }
  /* 清除清單：雲端有這個節點（哪怕是空的）就以雲端為準，才能把「放回清單」也同步過去；雲端完全沒有才把本機的傳上去 */
  function mergeHide(localArr, remoteObj, remoteExists) {
    var loc = Array.isArray(localArr) ? localArr : [];
    if (remoteExists) return { arr: Object.keys(remoteObj || {}).filter(function (k) { return k !== '_'; }), upload: false };
    return { arr: loc, upload: loc.length > 0 };
  }
  function hideObj(arr) { var o = {}; (arr || []).forEach(function (c) { if (/^[A-Z0-9]{3,8}$/.test(String(c))) o[c] = 1; }); return o; }

  /* —— 瀏覽器端 —— */
  if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      var initBig = function () { applyBig(localStorage.getItem('erg_bigtext') === '1', document); };
      initBig(); document.addEventListener('DOMContentLoaded', initBig);
      document.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('#fontBtn'); if (!b) return;
        var A = window.ERG_APP || {}; toggleBig(A.online && window.firebase ? window.firebase : null, A.SESS, A.me && A.me.sid, localStorage, document);
      });
    } catch (e) {}
  }
  function ref(fb, sess, sid, tail) { return fb.database().ref('er/' + sess + '/me/' + sid + (tail ? '/' + tail : '')); }
  function readLs(storage, k, dflt) { try { var v = JSON.parse(storage.getItem(k)); return v == null ? dflt : v; } catch (e) { return dflt; } }
  /* 登入後讀一次：回報＋清單。done(changed)：本機有改動就 true（呼叫端重畫大廳） */
  function pull(fb, sess, sid, storage, done) {
    if (!fb || !sess || !sid) { if (done) done(false); return; }
    var finished = false, fin = function (c) { if (!finished) { finished = true; if (done) done(c); } };
    try {
      ref(fb, sess, sid).once('value', function (snap) {
        var v = snap.val() || {}, changed = false;
        try {
          var all = readLs(storage, FB_KEY, []), m = mergeFb(all, v.fb, sid);
          var before = (Array.isArray(all) ? all : []).filter(function (e) { return e && e.sid === String(sid); }).length;
          if (m.list.length !== before) { storage.setItem(FB_KEY, JSON.stringify(mergeIntoLocalList(all, sid, m.list))); changed = true; }
          Object.keys(m.up).forEach(function (k) { try { ref(fb, sess, sid, 'fb/' + k).set(JSON.parse(JSON.stringify(m.up[k]))); } catch (x) {} });
        } catch (x) { if (typeof console !== 'undefined') console.warn('回報同步失敗', x); }
        try {
          var lh = readLs(storage, hideKey(sid), []), h = mergeHide(lh, v.hide, v.hide !== undefined);
          if (h.upload) ref(fb, sess, sid, 'hide').set(hideObj(h.arr));
          else if (v.hide !== undefined && JSON.stringify(h.arr.slice().sort()) !== JSON.stringify((Array.isArray(lh) ? lh : []).slice().sort())) { storage.setItem(hideKey(sid), JSON.stringify(h.arr)); changed = true; }
        } catch (x) { if (typeof console !== 'undefined') console.warn('清單同步失敗', x); }
        try { if (v.ui && v.ui.big !== undefined) { var want = v.ui.big ? '1' : '0'; if (storage.getItem(BIG_KEY) !== want) { storage.setItem(BIG_KEY, want); applyBig(v.ui.big, typeof document !== 'undefined' ? document : null); changed = true; } } } catch (x) {}
        fin(changed);
      }, function () { fin(false); });
    } catch (e) { fin(false); }
  }
  function pushFb(fb, sess, sid, entry) { try { if (fb && sess && sid && entry) ref(fb, sess, sid, 'fb/' + entry.t).set(JSON.parse(JSON.stringify(entry))); } catch (e) {} }
  function setHide(fb, sess, sid, code, on) { try { if (fb && sess && sid && /^[A-Z0-9]{3,8}$/.test(String(code))) { var r = ref(fb, sess, sid, 'hide/' + code); if (on) r.set(1); else r.remove(); ensureHideNode(fb, sess, sid); } } catch (e) {} }
  /* 雲端一個項目都沒有時 hide 節點不存在，「放回最後一間」之後節點又消失，下一次 pull 會把本機舊清單傳回去——所以放回時一律留一個占位 */
  function ensureHideNode(fb, sess, sid) { try { ref(fb, sess, sid, 'hide/_').set(0); } catch (e) {} }

  /* 11-10 4b4k0118：「字大一點」開關。本機記在 erg_bigtext，雲端記在 er/場次/me/學號/ui/big，換裝置登入帶回來。只換 --fs-1..4 這四個字級變數 */
  function applyBig(on, doc) {
    try {
      doc = doc || (typeof document !== 'undefined' ? document : null); if (!doc || !doc.documentElement) return;
      if (!doc.getElementById('bigTextCss')) { var st = doc.createElement('style'); st.id = 'bigTextCss'; st.textContent = BIG_CSS; (doc.head || doc.documentElement).appendChild(st); }
      doc.documentElement.classList.toggle('bigtext', !!on);
      var b = doc.getElementById('fontBtn'); if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? '🔠 字恢復正常' : '🔠 字大一點'; }
    } catch (e) {}
  }
  function bigOn(storage) { try { return storage.getItem(BIG_KEY) === '1'; } catch (e) { return false; } }
  function toggleBig(fb, sess, sid, storage, doc) {
    var on = !bigOn(storage); try { storage.setItem(BIG_KEY, on ? '1' : '0'); } catch (e) {}
    applyBig(on, doc); try { if (fb && sess && sid) ref(fb, sess, sid, 'ui/big').set(on ? 1 : 0); } catch (e) {}
    return on;
  }
  return { applyBig: applyBig, bigOn: bigOn, toggleBig: toggleBig, BIG_KEY: BIG_KEY, mergeFb: mergeFb, mergeIntoLocalList: mergeIntoLocalList, mergeHide: mergeHide, hideObj: hideObj, pull: pull, pushFb: pushFb, setHide: setHide, ensureHideNode: ensureHideNode, FB_KEY: FB_KEY, hideKey: hideKey };
});
