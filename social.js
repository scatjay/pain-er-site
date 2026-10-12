/* 同學之間：線上名單（誰在哪間房）＋班級聊天室。只在線上模式有作用。
   presence：er/{sess}/presence/{sid} = { name, cls, code, loc, t, ua }，每 25 秒更新、換房即更新、斷線自動移除。
   talk：er/{sess}/talk/{push} = { sid, name, code, loc, text, t }，最近 50 則；每則最多 200 字；同一人 2 秒內只能送一則。 */
(function () {
  'use strict';
  var APP = window.ERG_APP; if (!APP || !APP.online || !window.firebase) return;
  var $ = APP.$, esc = APP.esc, fdb = firebase.database();
  function room() { return window.ERG_ROOM && window.ERG_ROOM.cur; }
  function roomName(id) { var r = window.ERG_LAYOUT.room(id); return r ? r.name : (id || ''); }
  var box = $('socialBox'); if (!box) return;
  /* 10-12：矮視窗（可用高度 < 760，例如筆電縮放 150–175%）預設收合——展開時會把右側分頁的內容區擠到只剩一條，點「訪談」看起來像沒反應。
     使用者自己開關過就照他的（記在 localStorage）；收合時有新訊息會亮「新訊息」。 */
  var wantOpen = window.innerHeight >= 900 && window.innerWidth >= 1300;   /* 10-13：1440×810 這種筆電尺寸展開後訪談區只剩一小塊，所以更高更寬才預設展開 */ try { var sv = localStorage.getItem('erg2:socialOpen'); if (sv === '1') wantOpen = true; else if (sv === '0') wantOpen = false; } catch (e) {}
  box.innerHTML = '<details id="socialDet"' + (wantOpen ? ' open' : '') + '><summary style="cursor:pointer"><b>👥 同學</b> <span id="onlineCount" class="muted">線上 0 人</span> <span id="talkNew" class="pill on" style="font-size:11px;padding:0 7px;display:none">新訊息</span></summary>' +
    '<div id="onlineList" style="font-size:12px;margin:4px 0;max-height:52px;overflow:auto"></div>' +
    '<div id="talkLog" style="max-height:min(150px,16vh);overflow:auto;font-size:13px;border-top:2px dashed var(--line);padding-top:4px"></div>' +
    '<div class="row" style="margin-top:4px"><input id="talkIn" maxlength="200" placeholder="跟同學說一句（全班看得到）"><button id="talkSend" class="ghost">送</button></div></details>';
  var presRef = null, lastSent = 0, online = {};
  var talkSeen = -1;
  $('socialDet').addEventListener('toggle', function () { var o = $('socialDet').open; try { localStorage.setItem('erg2:socialOpen', o ? '1' : '0'); } catch (e) {} if (o) { $('talkNew').style.display = 'none'; var l = $('talkLog'); if (l) l.scrollTop = l.scrollHeight; } });

  function myState() { var c = room(); return { name: APP.me.name || APP.me.sid, sid: APP.me.sid, cls: APP.me.cls || '', code: c ? c.code : '', loc: c ? (c.player.loc || '') : '', t: firebase.database.ServerValue.TIMESTAMP, ua: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop' }; }
  function startPresence() {
    if (!APP.me.sid) return;
    presRef = fdb.ref('er/' + APP.SESS + '/presence/' + APP.me.sid);
    /* 10-13：每一筆全班都會收到，所以 25 秒改 60 秒（換房仍然立刻更新）。斷線時由伺服器移除；重連後要重新登記「斷線時移除」。 */
    fdb.ref('.info/connected').on('value', function (s) { if (s.val() && !window.ERG_KICKED) { presRef.onDisconnect().remove(); beat(); } });
    setInterval(beat, 60000);
    fdb.ref('er/' + APP.SESS + '/presence').on('value', function (s) { online = s.val() || {}; renderOnline(); });
    fdb.ref('er/' + APP.SESS + '/talk').limitToLast(50).on('value', function (s) { renderTalk(s.val() || {}); });
  }
  function beat() { if (presRef && !document.hidden && !window.ERG_KICKED) presRef.set(myState()); }
  function renderOnline() {
    var now = Date.now(), c = room(), mine = c ? c.player.loc : '', ids = Object.keys(online).filter(function (k) { return online[k] && now - Number(online[k].t || 0) < 200000; });
    var el = $('onlineList'), cnt = $('onlineCount'); if (!el) return;
    cnt.textContent = '線上 ' + ids.length + ' 人';
    ids.sort(function (a, b) { return (online[b].loc === mine) - (online[a].loc === mine) || String(online[a].name).localeCompare(String(online[b].name)); });
    el.innerHTML = ids.map(function (k) { var p = online[k], same = c && p.loc === mine && p.code === c.code; return '<span class="pill' + (same ? ' on' : '') + '" style="font-size:11px;padding:1px 7px;margin:2px">' + (k === APP.me.sid ? '我' : esc(p.name || k)) + '・' + esc(roomName(p.loc)) + (p.code && c && p.code !== c.code ? '（' + esc(p.code) + '）' : '') + '</span>'; }).join('') || '<span class="muted">只有你在線上。</span>';
  }
  function renderTalk(v) {
    var el = $('talkLog'); if (!el) return; var keys = Object.keys(v).sort(function (a, b) { return Number(v[a].t) - Number(v[b].t); });
    var nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (talkSeen >= 0 && keys.length > talkSeen && !$('socialDet').open) $('talkNew').style.display = ''; talkSeen = keys.length;
    el.innerHTML = keys.map(function (k) { var m = v[k]; return '<div><b>' + (m.sid === APP.me.sid ? '我' : esc(m.name || m.sid)) + '</b><span class="muted" style="font-size:11px">・' + esc(roomName(m.loc)) + '</span>：' + esc(m.text) + '</div>'; }).join('') || '<span class="muted">還沒有人說話。</span>';
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
  window.ERG_SOCIAL = { beat: beat, online: function () { return online; } };
})();
