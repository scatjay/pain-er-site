/* 公開討論區（原「同學」面板）：線上名單（誰在哪間房）＋全班聊天室。只在線上模式有作用。面板名稱與提醒小字只改 ERG_PRES.PANEL_NAME／PANEL_HINT 一處。
   presence：er/{sess}/presence/{sid} = { name, code, loc, t }，每 120 秒更新、換房即更新、斷線自動移除；面板展開才訂閱（10-19）。
   talk：er/{sess}/talk/{push} = { sid, name, code, loc, text, t }，最近 50 則；每則最多 200 字；同一人 2 秒內只能送一則。 */
/* 10-19 降流量（純函式，可在 node 測）：presence 整節點會推給每位在線者，所以①心跳 60→120 秒 ②只留面板用得到的欄位 ③社群面板展開才訂閱
   離線門檻 = 心跳 120 秒的 2.5 倍 = 300 秒（錯過兩次心跳還不算離線）；game.js 大廳、teacher.html、tools/er_ops.py 都要用同一個數字。 */
/* ───────── 10-20 公開討論區：髒話遮罩（顯示端）＋日期／時間（台北時間）。純函式，node 可測（test_profanity.js）─────────
   只在「畫出來」時遮；學生送出時資料庫保留原文（老師後台 teacher.html 看原文作處理依據），寫入端不改字。
   【新增詞的方式】只改下面 ERG_PROF 常數：
     ① 一般詞（中文或注音）→ 加進 words 陣列；  ② 英文／拼音要整字才算（避免誤殺，如 class、Dickens）→ 加進 asciiWords；
     ③ 英文可以出現在字中間也要遮（如 fuckyou）→ 加進 asciiLoose；
     ④ 這個詞有常見的正常用法 → 在 rules 加 {詞:{notPrev:'前面出現這些字就不遮', notNext:'後面出現這些字就不遮'}}。
   遮罩規則：先「正規化」（全形轉半形、轉小寫、去掉夾在中間的空白／標點／符號／emoji）再比對，遮回原字串同樣位置；被遮的每個字（含夾在中間的符號）換成「＊」，長度以字元（code point）計不變。 */
var ERG_PROF = (function () {
  var verbs = ['幹', '干', '操', '肏', '艹'], targets = ['你', '妳', '您', '恁', '拎', '汝', '他', '她', '伊'],
      objs = ['娘', '媽', '母', '老母', '老師', '祖宗', '全家', '爸', '爹', '姊', '姐', '妹', '阿嬤', '奶奶'], gen = [];
  verbs.forEach(function (v) { targets.forEach(function (t) { gen.push(v + t); objs.forEach(function (o) { gen.push(v + t + o); }); }); });
  return {
    words: gen.concat([
      '幹', '肏', '艹', '屌', '屄', '雞掰', '機掰', '雞巴', '機巴', '雞八', '機八', '雞歪', '機歪',
      '他媽的', '去你媽', '媽的', '三小', '三洨', '三蝦', '啥小',
      '靠北', '靠杯', '靠腰', '靠夭', '靠邀', '靠妖', '靠爸', '靠母',
      '握草', '握糙', '握操', '臥槽', '臥草', '沃草', '窩草', '我操', '我肏', '我艹',
      '王八蛋', '王八羔子', '狗娘養', '婊子', '死全家', '混蛋',
      'ㄍㄢ', 'ㄇㄉ', 'ㄎㄅ', 'ㄍㄅ', 'ㄐㄅ']),
    asciiWords: ['wtf', 'stfu', 'fck', 'fk', 'sht', 'dick', 'pussy', 'slut', 'bastard', 'ass', 'tmd', 'cnm', 'nmsl', 'wdnmd', 'mlgb'],
    asciiLoose: ['fuck', 'motherfucker', 'motherfucking', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'asshole'],
    rules: {
      '幹': { notPrev: '才主骨樹能苦實硬蠻基軀躯', notNext: '什麼甚啥嘛麻嗎部事勁活掉線道員練細得了過完著出校流架' },
      '媽的': { notPrev: '我你他她它妳老阿奶外祖姑舅姨嬸婆媽爸' },
      '三小': { notNext: '時' },
      '我操': { notNext: '作心場控練縱勞持辦盤' },
      '靠北': { notNext: '邊方面側部' },
      '靠腰': { notNext: '枕墊椅' }
    }
  };
})();
var ERG_PROFX = (function (L) {
  var idx = {}, loose = {}, SEP = /^[\s\p{P}\p{S}\p{Cf}\p{Mn}\p{Me}]$/u;
  L.asciiLoose.forEach(function (w) { loose[w] = 1; });
  L.words.concat(L.asciiWords, L.asciiLoose).forEach(function (w) { var k = w.charAt(0); (idx[k] = idx[k] || []).push(w); });
  Object.keys(idx).forEach(function (k) { idx[k].sort(function (a, b) { return b.length - a.length; }); });
  function okAt(w, ns, i) {
    var prev = i > 0 ? ns.charAt(i - 1) : '', next = ns.charAt(i + w.length), r = L.rules[w];
    if (r) { if (r.notPrev && prev && r.notPrev.indexOf(prev) >= 0) return false; if (r.notNext && next && r.notNext.indexOf(next) >= 0) return false; }
    if (/^[a-z]+$/.test(w) && !loose[w] && (/[a-z]/.test(prev) || /[a-z]/.test(next))) return false;
    return true;
  }
  function mask(text) {
    if (text == null) return ''; text = String(text); if (!text) return '';
    var cps = Array.from(text), ns = '', pos = [], i, k;
    for (i = 0; i < cps.length; i++) {
      var c = cps[i];
      if (SEP.test(c)) { if (/\s/.test(c) && /[A-Za-z]/.test(cps[i - 1] || '') && /[A-Za-z]/.test(cps[i + 1] || '')) { ns += ' '; pos.push(i); } continue; }   /* 英文單字之間的空白要保留（this hit 不是 shit） */
      var nc = c.normalize('NFKC').toLowerCase(); for (k = 0; k < nc.length; k++) { ns += nc.charAt(k); pos.push(i); }
    }
    var flag = null; i = 0;
    while (i < ns.length) {
      var cand = idx[ns.charAt(i)], hit = 0;
      if (cand) for (k = 0; k < cand.length; k++) { var w = cand[k]; if (ns.substr(i, w.length) === w && okAt(w, ns, i)) { hit = w.length; break; } }
      if (hit) { flag = flag || []; for (var j = pos[i]; j <= pos[i + hit - 1]; j++) flag[j] = 1; i += hit; } else i++;
    }
    if (!flag) return text;
    return cps.map(function (ch, j) { return flag[j] ? '＊' : ch; }).join('');
  }
  return { mask: mask };
})(ERG_PROF);
var ERG_PRES = (function () {
  var BEAT_MS = 120000, ONLINE_MS = 300000;
  return {
    BEAT_MS: BEAT_MS, ONLINE_MS: ONLINE_MS,
    mini: function (name, code, loc, t) { return { name: name, code: code, loc: loc, t: t }; },   /* 只留面板要的：名稱、房間代碼、所在地點、時間；sid 是節點鍵、cls/ua 不寫 */
    isOnline: function (p, now) { return !!(p && now - Number(p.t || 0) < ONLINE_MS); },
    wantSubscribe: function (detOpen) { return !!detOpen; },
    PANEL_NAME: '公開討論區',   /* 面板名稱只在這裡改一處（標題、輸入框提示、tooltip、空狀態都用它） */
    PANEL_HINT: '這裡全班都看得到，請友善發言。',   /* 輸入框下方的小字 */
    maskProfanity: ERG_PROFX.mask,
    /* 台北時間（UTC+8、無日光節約）：不用本機時區 */
    /* 10-28 楊老師：公開討論區最新訊息做成彈幕。名字與內容都先遮罩；太長截斷；自己說的顯示「我」 */
    danmakuLine: function (m, meSid) {
      if (!m) return ''; var self = ERG_PRES, nm = m.sid === meSid ? '我' : self.maskProfanity(String(m.name || m.sid || '')).slice(0, 8), tx = self.maskProfanity(String(m.text || '')).replace(/\s+/g, ' ').trim();
      if (!tx) return ''; if (tx.length > 36) tx = tx.slice(0, 36) + '…'; return nm + '：' + tx;
    },
    /* 彈幕軌道：回傳第一條「上一則已經離開起點」的軌道，全忙回 -1（那一則就不播，不排隊——彈幕是即時感，不是訊息佇列） */
    pickLane: function (freeAt, now) { for (var i = 0; i < freeAt.length; i++) if ((freeAt[i] || 0) <= now) return i; return -1; },
    /* 這一批快照裡哪些是「剛來的新訊息」：第一批只記錄不播；之後只播沒見過、且不超過 60 秒前的 */
    freshKeys: function (seen, v, now, first) {
      var out = []; Object.keys(v || {}).sort(function (a, b) { return (Number(v[a].t) || 0) - (Number(v[b].t) || 0); }).forEach(function (k) {
        if (seen[k]) return; seen[k] = 1; if (first) return; var t = Number(v[k].t) || 0; if (t && now - t > 60000) return; out.push(k);
      }); return out;
    },
    dayLabel: function (t) { t = Number(t); if (!(t > 0)) return ''; var d = new Date(t + 8 * 3600000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '（' + '日一二三四五六'.charAt(d.getUTCDay()) + '）'; },
    hhmm: function (t) { t = Number(t); if (!(t > 0)) return ''; var d = new Date(t + 8 * 3600000), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); },
    /* 聊天清單：每天第一則前一行日期分隔線、每則前面 hh:mm；名字與內容都先遮罩再跳脫。沒有 t 的訊息（剛送出、伺服器時間還沒回來）不顯示時間 */
    talkHtml: function (v, meSid, roomNameFn, escFn) {
      var keys = Object.keys(v || {}).sort(function (a, b) { return (Number(v[a].t) || 0) - (Number(v[b].t) || 0); }), last = '', self = ERG_PRES;
      return keys.map(function (k) {
        var m = v[k], day = self.dayLabel(m.t), sep = '', hm = self.hhmm(m.t);
        if (day && day !== last) { last = day; sep = '<div class="talkDay muted" style="text-align:center;font-size:var(--fs-1);margin:3px 0">── ' + day + ' ──</div>'; }
        return sep + '<div>' + (hm ? '<span class="muted" style="font-size:var(--fs-1)">' + hm + ' </span>' : '') + '<b>' + (m.sid === meSid ? '我' : escFn(self.maskProfanity(m.name || m.sid))) + '</b><span class="muted" style="font-size:var(--fs-1)">・' + escFn(roomNameFn(m.loc)) + '</span>：' + escFn(self.maskProfanity(m.text)) + '</div>';
      }).join('') || '<span class="muted">' + ERG_PRES.PANEL_NAME + '還沒有人說話。</span>';
    }
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
  box.innerHTML = '<details id="socialDet"' + (wantOpen ? ' open' : '') + '><summary style="cursor:pointer" title="' + ERG_PRES.PANEL_NAME + '：全班都看得到"><b>👥 ' + ERG_PRES.PANEL_NAME + '</b> <span id="onlineCount" class="muted">線上 0 位</span> <span id="talkNew" class="pill on" style="font-size:var(--fs-1);padding:0 7px;display:none">新訊息</span></summary>' +
    '<div id="onlineList" style="font-size:var(--fs-1);margin:4px 0;max-height:52px;overflow:auto"></div>' +
    '<div id="talkToday" class="muted" style="font-size:var(--fs-1);margin-top:2px"></div>' +
    '<label class="muted" style="font-size:var(--fs-1);display:inline-flex;gap:4px;align-items:center;margin-top:2px"><input type="checkbox" id="dmOn"> 彈幕（新訊息從畫面上方飄過）</label>' +
    '<div id="talkLog"style="max-height:min(150px,16vh);overflow:auto;font-size:var(--fs-2);border-top:var(--bw-s) dashed var(--line);padding-top:4px"></div>' +
    '<div class="row" style="margin-top:4px"><input id="talkIn" maxlength="200" placeholder="在' + ERG_PRES.PANEL_NAME + '說一句（全班看得到）" aria-label="在' + ERG_PRES.PANEL_NAME + '說一句"><button id="talkSend" class="ghost" title="送出到' + ERG_PRES.PANEL_NAME + '">送</button></div>' +
    '<div id="talkHint" class="muted" style="font-size:var(--fs-1);margin-top:2px">' + ERG_PRES.PANEL_HINT + '</div></details>';
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
    cnt.textContent = presWatchOn ? '線上 ' + ids.length + ' 位' : '（展開看線上名單）';
    ids.sort(function (a, b) { return (online[b].loc === mine) - (online[a].loc === mine) || String(online[a].name).localeCompare(String(online[b].name)); });
    el.innerHTML = ids.map(function (k) { var p = online[k], same = c && p.loc === mine && p.code === c.code; return '<span class="pill' + (same ? ' on' : '') + '" style="font-size:var(--fs-1);padding:1px 7px;margin:2px">' + (k === APP.me.sid ? '我' : esc(ERG_PRES.maskProfanity(p.name || k))) + '・' + esc(roomName(p.loc)) + (p.code && c && p.code !== c.code ? '（' + esc(p.code) + '）' : '') + '</span>'; }).join('') || (presWatchOn ? '<span class="muted">只有你在線上。</span>' : '');
  }
  function setToday() { var el = $('talkToday'), d = '📅 今天 ' + ERG_PRES.dayLabel(Date.now()); if (el && el.textContent !== d) el.textContent = d; }   /* 台北時間的今天，固定在清單上方 */
  function renderTalk(v) {
    try { dmFeed(v); } catch (e) {}
    var el = $('talkLog'); if (!el) return; var keys = Object.keys(v).sort(function (a, b) { return Number(v[a].t) - Number(v[b].t); });
    var nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (talkSeen >= 0 && keys.length > talkSeen && !$('socialDet').open) $('talkNew').style.display = ''; talkSeen = keys.length;
    el.innerHTML = ERG_PRES.talkHtml(v, APP.me.sid, roomName, esc); setToday();
    if (nearBottom || !keys.length) el.scrollTop = el.scrollHeight;
  }
  function send() {
    var inp = $('talkIn'), text = (inp.value || '').trim(); if (!text) return;
    if (Date.now() - lastSent < 2000) { inp.placeholder = '慢一點，兩秒一則'; return; }
    lastSent = Date.now(); var st = myState();
    fdb.ref('er/' + APP.SESS + '/talk').push({ sid: APP.me.sid, name: st.name, code: st.code, loc: st.loc, text: text.slice(0, 200), t: firebase.database.ServerValue.TIMESTAMP });
    inp.value = '';
  }
  /* ───── 10-28 彈幕（2D；3D 之後再做）：蓋在舞台上方一條窄帶，pointer-events 全關所以不擋點擊；三條軌道，全忙就略過 ───── */
  var dmOn = true, dmSeen = {}, dmFirst = true, dmLane = [0, 0, 0], DM_H = 24;
  try { dmOn = localStorage.getItem('erg2:danmaku') !== '0'; } catch (e) {}
  var dmBox = $('dmOn'); if (dmBox) { dmBox.checked = dmOn; dmBox.onchange = function () { dmOn = dmBox.checked; try { localStorage.setItem('erg2:danmaku', dmOn ? '1' : '0'); } catch (e) {} if (!dmOn) { var L = $('danmaku'); if (L) L.innerHTML = ''; } }; }
  function dmLayer() {
    var L = $('danmaku'); if (L) return L; var host = $('stage') || $('sceneBox'); if (!host) return null;
    L = document.createElement('div'); L.id = 'danmaku'; L.setAttribute('aria-hidden', 'true');
    L.style.cssText = 'position:absolute;left:0;right:0;top:' + ($('stage') ? '46' : '6') + 'px;height:' + (DM_H * 3 + 6) + 'px;overflow:hidden;pointer-events:none;z-index:20';
    host.appendChild(L); return L;
  }
  function dmShow(text) {
    var L = dmLayer(); if (!L || !L.animate) return; var now = Date.now(), lane = ERG_PRES.pickLane(dmLane, now); if (lane < 0) return;
    var el = document.createElement('span'); el.textContent = text;
    el.style.cssText = 'position:absolute;top:' + (lane * DM_H + 2) + 'px;left:0;white-space:nowrap;font-size:var(--fs-2,14px);font-weight:700;color:#fff;background:rgba(33,37,41,.72);padding:1px 10px;border-radius:12px;pointer-events:none;will-change:transform';
    L.appendChild(el); var w = el.offsetWidth, W = L.clientWidth || 600, dur = Math.max(7000, (W + w) * 11);   /* 約每秒 90px，至少 7 秒 */
    dmLane[lane] = now + (w + 40) / (W + w) * dur;   /* 尾巴離開起點之後，這條軌道才再給下一則 */
    var a = el.animate([{ transform: 'translateX(' + W + 'px)' }, { transform: 'translateX(' + (-w) + 'px)' }], { duration: dur, easing: 'linear' });
    a.onfinish = a.oncancel = function () { if (el.parentNode) el.parentNode.removeChild(el); };
  }
  function dmFeed(v) {
    var keys = ERG_PRES.freshKeys(dmSeen, v, Date.now(), dmFirst); dmFirst = false;
    var ae = document.activeElement; if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && ae.id !== 'talkIn' && ae.id !== 'dmOn') return;   /* 楊老師 10-28「照建議」：學生正在打字（訪談、紀錄、結論）時不飄，免得分心 */
    if (!dmOn || document.hidden) return; try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
    keys.slice(-3).forEach(function (k, i) { var line = ERG_PRES.danmakuLine(v[k], APP.me.sid); if (line) setTimeout(function () { dmShow(line); }, i * 900); });
  }
  $('talkSend').onclick = send;
  $('talkIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(); });
  /* 登入完成後才開始；房間變動（換房）時更新 */
  var started = false, lastLoc = '';
  setInterval(function () { setToday(); if (!started && APP.me.sid) { started = true; startPresence(); } var c = room(); var loc = c ? c.code + '/' + c.player.loc : ''; if (started && loc !== lastLoc) { lastLoc = loc; beat(); renderOnline(); } }, 1000);
  window.ERG_SOCIAL = { dm: { feed: dmFeed, show: dmShow, on: function () { return dmOn; } }, beat: beat, online: function () { return online; }, refreshOnce: refreshOnce, watching: function () { return presWatchOn; } };
})();
