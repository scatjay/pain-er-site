/* 同學之間：線上名單（誰在哪間房）＋班級聊天室。只在線上模式有作用。
   presence：er/{sess}/presence/{sid} = { name, code, loc, t }，每 120 秒更新、換房即更新、斷線自動移除；面板展開才訂閱（10-19）。
   talk：er/{sess}/talk/{push} = { sid, name, code, loc, text, t }，最近 50 則；每則最多 200 字；同一人 2 秒內只能送一則。 */
/* 10-19 降流量（純函式，可在 node 測）：presence 整節點會推給每位在線者，所以①心跳 60→120 秒 ②只留面板用得到的欄位 ③社群面板展開才訂閱
   離線門檻 = 心跳 120 秒的 2.5 倍 = 300 秒（錯過兩次心跳還不算離線）；game.js 大廳、teacher.html、tools/er_ops.py 都要用同一個數字。 */
var ERG_PRES = (function () {
  var BEAT_MS = 120000, ONLINE_MS = 300000;
  return {
    BEAT_MS: BEAT_MS, ONLINE_MS: ONLINE_MS,
    mini: function (name, code, loc, t) { return { name: name, code: code, loc: loc, t: t }; },   /* 只留面板要的：名稱、房間代碼、所在地點、時間；sid 是節點鍵、cls/ua 不寫 */
    isOnline: function (p, now) { return !!(p && now - Number(p.t || 0) < ONLINE_MS); },
    wantSubscribe: function (detOpen) { return !!detOpen; }
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ERG_PRES;
if (typeof window !== 'undefined') window.ERG_PRES = ERG_PRES;
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  var APP = window.ERG_APP; if (!APP || !APP.online || !window.firebase) return;
  var $ = APP.$, esc = APP.esc, fdb = firebase.database();
  function room() { return window.ERG_ROOM && window.ERG_ROOM.cur; }
  function roomName(id) { var r = window.ERG_LAYOUT.room(id); return r ? r.name : (id || ''); }
  var box = $('socialBox'); if (!box) return;
  /* 10-12：矮視窗（可用高度 < 760，例如筆電縮放 150–175%）預設收合——展開時會把右側分頁的內容區擠到只剩一條，點「訪談」看起來像沒反應。
     使用者自己開關過就照他的（記在 localStorage）；收合時有新訊息會亮「新訊息」。 */
  var wantOpen = window.innerHeight >= 900 && window.innerWidth >= 1300;   /* 10-13：1440×810 這種筆電尺寸展開後訪談區只剩一小塊，所以更高更寬才預設展開 */ try { var sv = localStorage.getItem('erg2:socialOpen'); if (sv === '1') wantOpen = true; else if (sv === '0') wantOpen = false; } catch (e) {}
  box.innerHTML = '<details id="socialDet"' + (wantOpen ? ' open' : '') + '><summary style="cursor:pointer"><b>👥 同學</b> <span id="onlineCount" class="muted">線上 0 人</span> <span id="talkNew" class="pill on" style="font-size:var(--fs-1);padding:0 7px;display:none">新訊息</span></summary>' +
    '<div id="onlineList" style="font-size:var(--fs-1);margin:4px 0;max-height:52px;overflow:auto"></div>' +
    '<div id="talkLog" style="max-height:min(150px,16vh);overflow:auto;font-size:var(--fs-2);border-top:var(--bw-s) dashed var(--line);padding-top:4px"></div>' +
    '<div class="row" style="margin-top:4px"><input id="talkIn" maxlength="200" placeholder="跟同學說一句（全班看得到）"><button id="talkSend" class="ghost">送</button></div></details>';
  var presRef = null, lastSent = 0, online = {};
  var talkSeen = -1;
  $('socialDet').addEventListener('toggle', function () { var o = $('socialDet').open; syncPresWatch(); try { localStorage.setItem('erg2:socialOpen', o ? '1' : '0'); } catch (e) {} if (o) { $('talkNew').style.display = 'none'; var l = $('talkLog'); if (l) l.scrollTop = l.scrollHeight; } });

  function myState() { var c = room(); return ERG_PRES.mini(APP.me.name || APP.me.sid, c ? c.code : '', c ? (c.player.loc || '') : '', firebase.database.ServerValue.TIMESTAMP); }
  /* 全班名單只在面板展開時訂閱（收合就退訂）；大廳排序要用時另外讀一次（refreshOnce，60 秒內不重讀） */
  var presWatchOn = false, presCb = null, onceT = 0;
  function presRefAll() { return fdb.ref('er/' + APP.SESS + '/presence'); }
  function syncPresWatch() {
    if (!presRef) return;
    var want = ERG_PRES.wantSubscribe($('socialDet').open);
    if (want && !presWatchOn) { presWatchOn = true; presCb = presRefAll().on('value', function (s) { online = s.val() || {}; renderOnline(); }); }
    else if (!want && presWatchOn) { presWatchOn = false; try { presRefAll().off('value', presCb); } catch (e) {} presCb = null; renderOnline(); }
  }
  function refreshOnce() { if (presWatchOn || !presRef || Date.now() - onceT < 60000) return; onceT = Date.now(); presRefAll().once('value', function (s) { online = s.val() || {}; if (APP.data && APP.data.fire) APP.data.fire('lobby'); }); }
  function startPresence() {
    if (!APP.me.sid) return;
    presRef = fdb.ref('er/' + APP.SESS + '/presence/' + APP.me.sid);
    /* 10-13：每一筆全班都會收到，所以 25 秒改 60 秒（10-19 再改 120 秒）（換房仍然立刻更新）。斷線時由伺服器移除；重連後要重新登記「斷線時移除」。 */
    fdb.ref('.info/connected').on('value', function (s) { if (s.val() && !window.ERG_KICKED) { presRef.onDisconnect().remove(); beat(); } });
    setInterval(beat, ERG_PRES.BEAT_MS);
    syncPresWatch();
    fdb.ref('er/' + APP.SESS + '/talk').limitToLast(50).on('value', function (s) { renderTalk(s.val() || {}); });
  }
  function beat() { if (presRef && !document.hidden && !window.ERG_KICKED) presRef.set(myState()); }
  function renderOnline() {
    var now = Date.now(), c = room(), mine = c ? c.player.loc : '', ids = !presWatchOn ? [] : Object.keys(online).filter(function (k) { return online[k] && ERG_PRES.isOnline(online[k], now); });
    var el = $('onlineList'), cnt = $('onlineCount'); if (!el) return;
    cnt.textContent = presWatchOn ? '線上 ' + ids.length + ' 人' : '（展開看線上名單）';
    ids.sort(function (a, b) { return (online[b].loc === mine) - (online[a].loc === mine) || String(online[a].name).localeCompare(String(online[b].name)); });
    el.innerHTML = ids.map(function (k) { var p = online[k], same = c && p.loc === mine && p.code === c.code; return '<span class="pill' + (same ? ' on' : '') + '" style="font-size:var(--fs-1);padding:1px 7px;margin:2px">' + (k === APP.me.sid ? '我' : esc(p.name || k)) + '・' + esc(roomName(p.loc)) + (p.code && c && p.code !== c.code ? '（' + esc(p.code) + '）' : '') + '</span>'; }).join('') || (presWatchOn ? '<span class="muted">只有你在線上。</span>' : '');
  }
  function renderTalk(v) {
    var el = $('talkLog'); if (!el) return; var keys = Object.keys(v).sort(function (a, b) { return Number(v[a].t) - Number(v[b].t); });
    var nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (talkSeen >= 0 && keys.length > talkSeen && !$('socialDet').open) $('talkNew').style.display = ''; talkSeen = keys.length;
    el.innerHTML = keys.map(function (k) { var m = v[k]; return '<div><b>' + (m.sid === APP.me.sid ? '我' : esc(m.name || m.sid)) + '</b><span class="muted" style="font-size:var(--fs-1)">・' + esc(roomName(m.loc)) + '</span>：' + esc(m.text) + '</div>'; }).join('') || '<span class="muted">還沒有人說話。</span>';
    if (nearBottom || !keys.length) el.scrollTop = el.scrollHeight;
  }
  function send() {
    var inp = $('talkIn'), text = (inp.value || '').trim(); if (!text) return;
    if (Date.now() - lastSent < 2000) { inp.placeholder = '慢一點，兩秒一則'; return; }
    lastSent = Date.now(); var st = myState();
    fdb.ref('er/' + APP.SESS + '/talk').push({ sid: APP.me.sid, name: st.name, code: st.code, loc: st.loc, text: text.slice(0, 200), t: firebase.database.ServerValue.TIMESTAMP });
    inp.value = '';
  }
  $('talkSend').onclick = send;
  $('talkIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(); });
  /* 登入完成後才開始；房間變動（換房）時更新 */
  var started = false, lastLoc = '';
  setInterval(function () { if (!started && APP.me.sid) { started = true; startPresence(); } var c = room(); var loc = c ? c.code + '/' + c.player.loc : ''; if (started && loc !== lastLoc) { lastLoc = loc; beat(); renderOnline(); } }, 1000);
  window.ERG_SOCIAL = { beat: beat, online: function () { return online; }, refreshOnce: refreshOnce, watching: function () { return presWatchOn; } };
})();
