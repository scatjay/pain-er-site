/* 共同提案牆的畫面與啟動（瀏覽器端）。純邏輯在 proposal_wall.js、資料存取在 wall_store.js。
   網址：wall.html?wall=代碼&case=sms[&join=1][&local=1&sid=學號（只有本機模式）]
   桌機（寬 >860）：Excalidraw 畫布（只留縮放與平移，卡片用程式畫、拖動寫回 x、y）；手機（寬 ≤860）：不載入 Excalidraw，用分頁清單。
   新手只看不貼；中級與專家可以貼卡、留意見、採納；一面牆最多 4 位同學，第 5 位以後只能旁觀。
   不用瀏覽器內建的跳出視窗：提示一律是頁內 toast，確認一律是兩段式按鈕。 */
(function () {
  'use strict';
  var W = window.ERG_WALL, WS = window.ERG_WALL_STORE, U = window.ERG_UILV, PX = window.ERG_PX, PXP = window.ERG_PROTO, XS = window.ERG_PX_STORE, ST = window.ERG_SB_STORE;
  var $ = function (id) { return document.getElementById(id); };
  var Q = new URLSearchParams(location.search);
  var LOCAL = Q.get('local') === '1' || !window.firebase || !window.ERG_FB;
  var UNIT_SESS = 'ER-20261013';
  var CASE = PX.liveCase(Q.get('case'));
  var MOBILE_MQ = window.matchMedia ? window.matchMedia('(max-width:860px)') : { matches: false };
  var NOW = function () { return Date.now(); };
  var ASSET = 'https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/';
  var TAB_NAMES = { evid: '證據', dec: '決定', proto: '原型', opn: '意見' };
  var ACH = [['w10_wall_voice', '💬', '意見被採納', '你留的意見被同學採納了'], ['w10_wall_adopt', '🤝', '採納了同學的意見', '你採納了同學留給你的意見'], ['w10_wall_crowd', '🧱', '熱鬧的牆', '牆主：三位不同的同學來留過意見']];
  var REASON = { readonly: '新手先看，想貼卡請切到中級', notmember: '你還不是這面牆的成員', empty: '先寫幾個字', noref: '證據卡要寫出處（例如：訪談 2）', url: '原型連結要 https 開頭', notarget: '先選一張要留意見的卡', opntarget: '意見不能再對意見', self: '意見要留給同學的卡，不是自己的', type: '沒有這種卡', nowall: '找不到這面牆' };

  var S = { sid: '', name: '', sess: '', code: '', wall: null, store: null, px: null, tree: null, local: LOCAL, sel: '', type: 'note', target: '', tab: 'evid', cmpOpen: false, armed: {}, reqSent: '', reqDenied: false, lastLine: '', started: false, loaded: false, unwatch: null, composerSig: '' };
  window.ERG_WALL_S = S;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clipText(s, n) { return Array.from(String(s == null ? '' : s)).slice(0, n).join(''); }
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, ms || 3500); }
  function twoStep(btn, key, run, armText) {
    if (S.armed[key]) { clearTimeout(S.armed[key]); delete S.armed[key]; run(); return; }
    var old = btn.textContent; btn.textContent = armText || '再按一次確認'; btn.classList.add('armed');
    S.armed[key] = setTimeout(function () { delete S.armed[key]; btn.textContent = old; btn.classList.remove('armed'); }, 6000);
  }
  function isMobile() { return !!MOBILE_MQ.matches; }
  function lvNow() { var l = U && S.sid ? U.readLocal(window.localStorage, S.sid) : null; return PXP.level(l ? l.lv : 3); }
  function role() { return W.roleOf(S.wall, S.sid); }
  function isMem() { var r = role(); return r === 'host' || r === 'member'; }
  function canWrite() { return isMem() && W.canEdit(lvNow()); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function sessName() { var ts = (location.search.match(/[?&]tsess=([A-Za-z0-9]{1,12})/) || [])[1]; return (ts && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) ? 'ER-TEST-' + ts : UNIT_SESS; }
  function localQuery() { return LOCAL ? '?local=1&sid=' + encodeURIComponent(S.sid) + '&case=' + CASE : '?case=' + CASE; }
  function inviteUrl() {
    var base = location.href.split('#')[0].split('?')[0], q = 'wall=' + S.code + '&case=' + CASE + '&join=1';
    if (LOCAL) q += '&local=1';
    var ts = (location.search.match(/[?&](tsess=[A-Za-z0-9]{1,12})/) || [])[1]; if (ts) q += '&' + ts;
    return base + '?' + q;
  }
  function copyText(t) {
    return new Promise(function (res) {
      function fallback() { var a = $('copyTmp'); a.value = t; a.hidden = false; a.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} a.hidden = true; res(ok); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { res(true); }, fallback); else fallback();
    });
  }

  /* ———— 啟動 ———— */
  function boot() {
    if (S.started) return; S.started = true;
    document.documentElement.style.setProperty('--ct', '#3d6fe0');
    if (LOCAL) {
      var sid = (Q.get('sid') || '').trim(); try { if (sid) localStorage.setItem('erg:pxsid', sid); else sid = localStorage.getItem('erg:pxsid') || ''; } catch (e) {}
      S.sess = 'LOCAL'; S.tree = WS.localTree(window.localStorage, 'erg:walltree:LOCAL');
      S.store = WS.makeStore({ root: S.tree.ref('prw/LOCAL'), now: NOW });
      S.px = XS.makeStore({ root: ST.localRoot(window.localStorage, 'LOCALPRX'), caseId: CASE, now: NOW });
      S.sync = S.tree.sync; window.addEventListener('storage', function () { S.tree.sync(); });
      $('modeTag').textContent = '本機測試模式'; afterSid(sid, (Q.get('name') || '').trim());
      return;
    }
    S.sess = sessName();
    if (!firebase.apps.length) firebase.initializeApp(window.ERG_FB);
    var fdb = firebase.database();
    S.store = WS.makeStore({ root: fdb.ref('prw/' + S.sess), now: NOW, log: function (m) { console.warn('[prw]', m); } });
    S.px = XS.makeStore({ root: fdb.ref('prx/' + S.sess), caseId: CASE, now: NOW, log: function (m) { console.warn('[prx]', m); } });
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) { showGate('請先從急診室登入，再回來開提案牆。'); return; }
      fdb.ref('er/users/' + user.uid).once('value', function (s) { var rec = s.val(); if (rec && rec.sid) afterSid(String(rec.sid), String(rec.name || rec.nick || rec.nickname || '')); else showGate('這個帳號還沒綁定學號，請先到急診室完成登入。'); });
    });
  }
  function showGate(msg) {
    $('app').hidden = true; $('gate').hidden = false;
    $('gate').innerHTML = '<div class="card"><h1>還不能開提案牆</h1><p>' + esc(msg) + '</p><p><a class="btn" href="' + (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'm.html' : 'index.html') + '">🏠 回急診室</a></p></div>';
  }
  function afterSid(sid, name) {
    if (!sid) { showGate('請先從急診室登入，再回來開提案牆。'); return; }
    S.sid = sid; var saved = ''; try { saved = localStorage.getItem('erg:wallname:' + sid) || ''; } catch (e) {}
    S.name = clipText(name || saved || '同學' + sid.slice(-2), 16);
    $('gate').hidden = true; $('app').hidden = false;
    $('sidLine').textContent = '學號 ' + sid;
    $('proposalLink').href = 'proposal.html' + localQuery();
    var c = W.normCode(Q.get('wall')); if (c) setCode(c); else render();
    if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener('change', function () { render(); }); else if (MOBILE_MQ.addListener) MOBILE_MQ.addListener(function () { render(); });
  }
  /* 11-04：成員身分的牆代碼記在本機，提案室送審時才知道要不要附牆摘要（鍵＝erg:wallcode:場次:學號；離開牆就移除） */
  function wcKey() { return 'erg:wallcode:' + S.sess + ':' + S.sid; }
  function saveWallCode(code) { try { if (code) localStorage.setItem(wcKey(), code); else localStorage.removeItem(wcKey()); } catch (e) {} }
  function setCode(code) {
    if (S.unwatch) { S.unwatch(); S.unwatch = null; }
    if (!code) saveWallCode(''); else { try { if (localStorage.getItem(wcKey()) !== code) saveWallCode(''); } catch (e) {} }
    S.code = code; S.wall = null; S.loaded = false; S.reqSent = ''; S.reqDenied = false; S.sel = ''; S.composerSig = '';
    try { var u = new URL(location.href); if (code) u.searchParams.set('wall', code); else u.searchParams.delete('wall'); history.replaceState(null, '', u.pathname + u.search); } catch (e) {}
    if (!code) { render(); return; }
    S.unwatch = S.store.watchWall(code, function (w) { S.wall = w; S.loaded = true; onWall(); });
    render();
  }
  function onWall() {
    var w = S.wall;
    if (w && S.sel && !w.cards[S.sel]) S.sel = '';
    if (w && (role() === 'host' || role() === 'member')) saveWallCode(S.code);
    if (w && role() === 'spectator' && Q.get('join') === '1' && !S.reqSent && W.memberCount(w) < W.MAX_MEMBERS) sendRequest(true);
    render();
  }

  /* ———— 邀請與加入 ———— */
  function myName() { return S.name || S.sid; }
  function sendRequest(auto) {
    var w = S.wall; if (!w) return; S.reqSent = S.code;
    S.store.requestJoin(S.code, w, S.sid, myName()).then(function (r) {
      if (r.ok) { toast('已告訴牆主，等牆主按同意'); return; }
      if (r.reason === 'full') { toast('這面牆已經有 4 位同學，你先當旁觀者'); return; }
      if (r.reason === 'member') return;
      S.reqDenied = true; S.reqSent = ''; render(); if (!auto) toast('申請送不出去，請把你的學號告訴牆主');
    });
  }
  function accept(sid, name) {
    var w = S.wall; if (!w || role() !== 'host') return;
    S.store.addMember(S.code, w, sid, name).then(function (r) { if (r.ok) toast(name + ' 加入了'); else toast(r.reason === 'full' ? '牆已經滿 4 位了' : r.reason === 'already' ? '這位已經在牆上了' : '加不進去：' + (r.message || r.reason)); });
  }
  function createWall() {
    var tries = 0;
    (function next() {
      var code = W.genCode(Math.random, 5); tries++;
      S.store.createWall(code, S.sid, myName(), CASE).then(function (r) {
        if (r.ok) { toast('牆建好了，代碼 ' + code); setCode(code); return; }
        if (r.reason === 'exists' && tries < 6) { next(); return; }
        toast('建不起來：' + (r.message || r.reason));
      });
    })();
  }

  /* ———— 畫面 ———— */
  function render() {
    if (!S.sid) return;
    var inWall = !!S.code;
    $('lobby').hidden = inWall; $('wallView').hidden = !inWall;
    renderLv();
    if (!inWall) { renderLobby(); return; }
    renderHead(); renderBanner(); renderInvite(); renderReq(); renderComposer(); renderSelBox(); renderOpnBox(); renderAch(); renderAdoptBox();
    var mob = isMobile() || C.failed;
    document.body.classList.toggle('is-mobile', mob);
    $('canvasWrap').hidden = mob; $('mobile').hidden = !mob;
    if (mob) { renderMobile(); } else { ensureCanvas(); }
  }
  function renderLv() {
    var lv = lvNow();
    $('lvBar').innerHTML = '<span class="lbl">模式</span>' + [1, 2, 3].map(function (k) { return '<button class="lvb' + (lv === k ? ' on' : '') + '" data-act="lv" data-v="' + k + '" aria-pressed="' + (lv === k) + '">' + esc(PXP.view(k).name) + '</button>'; }).join('');
    document.body.className = document.body.className.replace(/\blv[123]\b/g, '').trim() + ' lv' + lv;
  }
  function renderLobby() {
    var nm = esc(S.name);
    $('lobby').innerHTML = '<div class="card"><h1>共同提案牆</h1><p class="muted">最多 4 位同學一起，把想法貼在同一面牆上、互相留意見。先看不貼的話，選「新手」模式就好。</p>' +
      '<label for="nick">你在牆上的名字（最多 16 字）</label><input id="nick" maxlength="16" value="' + nm + '">' +
      '<div class="bar"><button class="big" data-act="create">🧱 建一面牆</button></div>' +
      '<h2>用代碼加入同學的牆</h2><label for="joinCode">牆代碼</label><input id="joinCode" maxlength="24" placeholder="例如 K7P3M" autocapitalize="characters">' +
      '<div class="bar"><button class="big g" data-act="gojoin">進去看看</button></div></div>';
  }
  function memberChips(w) {
    return W.members(w).map(function (k) { return '<span class="mchip' + (k === String(w.meta.host) ? ' host' : '') + (k === S.sid ? ' me' : '') + '">' + esc(W.nameOf(w, k)) + (k === String(w.meta.host) ? '（牆主）' : '') + (k === S.sid ? '（我）' : '') + '</span>'; }).join('');
  }
  function renderHead() {
    var w = S.wall;
    if (!S.loaded) { $('head').innerHTML = '<h2>牆代碼 ' + esc(S.code) + '</h2><div class="muted">載入中…</div>'; return; }
    if (!w) { $('head').innerHTML = '<h2>找不到代碼 ' + esc(S.code) + ' 的牆</h2><p class="muted">請跟牆主確認代碼，或建一面新的牆。</p><div class="bar"><button class="big g" data-act="home">回到「建牆／加入」</button></div>'; return; }
    var r = role(), rn = { host: '牆主', member: '成員', pending: '等牆主同意', spectator: '旁觀（只能看）' }[r];
    $('head').innerHTML = '<div class="hl"><h2>牆代碼 <span id="codeShow" class="code">' + esc(S.code) + '</span></h2><span class="rbadge ' + r + '" id="roleBadge">' + esc(rn) + '</span><span class="muted">' + W.memberCount(w) + '／' + W.MAX_MEMBERS + ' 位</span>' +
      '<button class="mini g" data-act="home">換一面牆</button></div><div class="mchips" id="members">' + memberChips(w) + '</div>';
  }
  function renderBanner() {
    var w = S.wall, el = $('banner'); if (!w) { el.innerHTML = ''; return; }
    var r = role(), lv = lvNow(), t = '';
    if (r === 'spectator') {
      if (W.memberCount(w) >= W.MAX_MEMBERS) t = '這面牆已經有 4 位同學，你先當旁觀者：可以看，不能貼。';
      else if (S.reqDenied) t = '申請送不出去。請把你的學號 <b>' + esc(S.sid) + '</b> 告訴牆主，牆主可以輸入學號把你加進來。';
      else t = '你還不是這面牆的成員，現在只能看。 <button class="mini" data-act="request">申請加入</button>';
    } else if (r === 'pending') t = '已經告訴牆主了，等牆主按同意；這段時間先看，不能貼。';
    else if (lv === 1) t = '新手先看，想貼卡請切到中級。';
    el.innerHTML = t ? '<div class="banner" role="status" id="bannerText">' + t + '</div>' : '';
  }
  function renderInvite() {
    var w = S.wall, box = $('inviteBox'); var show = !!w && role() === 'host'; box.hidden = !show; if (!show) return;
    if (!S.inviteInit) { S.inviteInit = true; box.open = !isMobile(); }
    var full = W.memberCount(w) >= W.MAX_MEMBERS;
    $('inviteText').value = '來我們的提案牆一起貼想法吧（呼呼醫院）\n連結：' + inviteUrl() + '\n代碼：' + S.code;
    $('manualAdd').hidden = full; $('inviteFull').hidden = !full;
  }
  function renderReq() {
    var w = S.wall, box = $('reqBox'), list = w && role() === 'host' ? W.requests(w) : [];
    box.hidden = !list.length; if (!list.length) { box.innerHTML = ''; return; }
    var full = W.memberCount(w) >= W.MAX_MEMBERS;
    box.innerHTML = '<h3>想加入的同學</h3>' + list.map(function (q) {
      return '<div class="reqrow"><span><b>' + esc(q.name) + '</b> <span class="muted">（學號 ' + esc(q.sid) + '）想加入</span></span>' + (full ? '<span class="muted">牆滿了</span>' : '<button class="big" data-act="accept" data-sid="' + esc(q.sid) + '" data-name="' + esc(q.name) + '">同意</button>') + '<button class="mini g" data-act="decline" data-sid="' + esc(q.sid) + '">先不要</button></div>';
    }).join('');
  }

  /* 貼卡表單（只在簽名變了才重建，打字時不會被資料更新洗掉） */
  function targetOptions() {
    var w = S.wall, out = []; if (!w) return out;
    Object.keys(w.cards).forEach(function (id) { var c = w.cards[id]; if (c.t !== 'opn' && String(c.by) !== S.sid) out.push({ id: id, text: W.TYPES[c.t].label + '・' + W.nameOf(w, c.by) + '：' + clipText(c.text || c.url || '', 18), at: c.at || 0 }); });
    return out.sort(function (a, b) { return b.at - a.at; });
  }
  function renderComposer() {
    var box = $('composerBox'), w = S.wall, cw = canWrite();
    var sig = [S.code, cw, S.type, isMobile()].join('|');
    if (!w || !isMem()) { box.hidden = true; $('openComposer').hidden = true; S.composerSig = ''; return; }
    box.hidden = false; $('openComposer').hidden = !(cw && isMobile());
    document.body.classList.toggle('cmp-open', S.cmpOpen && cw);
    if (!cw) { box.hidden = true; box.innerHTML = ''; S.composerSig = 'ro'; return; }
    if (sig === S.composerSig) { refreshTargets(); return; }
    S.composerSig = sig; var T = W.TYPES, t = S.type, f = '';
    var types = ['note', 'evid', 'dec', 'proto', 'opn'].map(function (k) { return '<button class="tp' + (t === k ? ' on' : '') + ' tp-' + k + '" data-act="type" data-k="' + k + '" aria-pressed="' + (t === k) + '" style="--tc:' + T[k].color + '">' + esc(T[k].label) + '</button>'; }).join('');
    if (t === 'evid') f += '<label for="fRef">出處（≤40 字）</label><input id="fRef" maxlength="40" placeholder="例如：訪談 2、故事板第 3 格">';
    if (t === 'proto') f += '<label for="fUrl">作品連結（https 開頭，要開分享）</label><input id="fUrl" inputmode="url" placeholder="https://…"><label for="fV">這是第幾版</label><select id="fV">' + [1, 2, 3, 4, 5, 6].map(function (n) { return '<option value="v' + n + '">v' + n + '</option>'; }).join('') + '</select>';
    if (t === 'opn') f += '<label for="fTarget">要對哪一張卡留意見（同學的卡）</label><select id="fTarget"></select>';
    f += '<label for="fText">' + (t === 'proto' ? '說明（可以不寫）' : '寫在卡上的話') + '（≤' + T[t].max + ' 字）</label><textarea id="fText" maxlength="' + T[t].max + '" placeholder="' + (t === 'note' ? '一個想法就好' : t === 'opn' ? '你看到什麼、建議怎麼改' : '') + '"></textarea>';
    box.innerHTML = '<h3>貼一張卡</h3><div class="tps" role="group" aria-label="卡的種類">' + types + '</div>' + f + '<div class="bar"><button class="big" data-act="post" id="postBtn">貼上去</button></div>';
    refreshTargets();
  }
  function refreshTargets() {
    var sel = $('fTarget'); if (!sel) return;
    var opts = targetOptions(), cur = S.target || sel.value;
    if (document.activeElement === sel) return;
    sel.innerHTML = opts.length ? opts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.text) + '</option>'; }).join('') : '<option value="">還沒有同學的卡</option>';
    if (cur && opts.some(function (o) { return o.id === cur; })) sel.value = cur;
  }
  function postCard() {
    var w = S.wall; if (!w) return; var t = S.type;
    var f = { text: $('fText') ? $('fText').value : '', ref: $('fRef') ? $('fRef').value : '', url: $('fUrl') ? $('fUrl').value.trim() : '', v: $('fV') ? $('fV').value : 'v1', target: $('fTarget') ? $('fTarget').value : '' };
    var c = clone(w), r = W.addCard(c, S.sid, t, f, lvNow(), NOW());
    if (!r.ok) { toast(REASON[r.reason] || '貼不上去：' + r.reason); return; }
    $('postBtn').disabled = true;
    S.store.putCard(S.code, r.id, r.card).then(function (res) {
      if ($('postBtn')) $('postBtn').disabled = false;
      if (!res.ok) { toast('貼不上去：' + (res.message || res.reason)); return; }
      toast('貼上去了'); S.composerSig = ''; S.target = ''; S.cmpOpen = false; S.sel = r.id; render();
    });
  }

  function cardById(id) { return S.wall && S.wall.cards[id] || null; }
  function renderSelBox() {
    var box = $('selBox'), w = S.wall, c = cardById(S.sel);
    if (!w || !c || isMobile()) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false; var T = W.TYPES[c.t], acts = '';
    if (canWrite() && c.t !== 'opn' && String(c.by) !== S.sid) acts += '<button class="mini" data-act="aboutcard" data-id="' + esc(S.sel) + '">對這張卡留意見</button>';
    if (c.t === 'opn' && canWrite()) {
      var tg = cardById(c.target); if (tg && String(tg.by) === S.sid && !c.adopt) acts += '<button class="mini" data-act="adopt" data-id="' + esc(S.sel) + '">採納這則意見</button>';
    }
    box.innerHTML = '<h3>選到的卡</h3><div class="selcard" style="border-left-color:' + T.color + '"><b>' + esc(T.label) + '・' + esc(W.nameOf(w, c.by)) + '</b>' + (c.v ? ' ' + esc(c.v) : '') + (c.adopt ? ' <span class="okb">✓ 已採納</span>' : '') + '<div>' + esc(c.text) + '</div>' + (c.ref ? '<div class="muted">出處：' + esc(c.ref) + '</div>' : '') + (c.url ? '<div><a href="' + esc(c.url) + '" target="_blank" rel="noopener">開作品</a></div>' : '') + '<div class="bar">' + acts + '</div></div>';
  }
  /* 等你回應的意見（針對你的卡、還沒採納）：桌機側欄用；手機在「意見」分頁 */
  function renderOpnBox() {
    var box = $('opnBox'), w = S.wall;
    if (!w || !isMem() || isMobile()) { box.innerHTML = ''; box.hidden = true; return; }
    var rows = W.mobileList(w, 'opn', S.sid).filter(function (r) { return r.canAdopt; });
    box.hidden = !rows.length; if (!rows.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h3>等你回應的意見</h3>' + rows.map(function (r) {
      return '<div class="opnrow"><div><b>' + esc(r.by) + '</b> 對你的' + esc(r.about) + '說：' + esc(r.text) + '</div>' + (canWrite() ? '<button class="big" data-act="adopt" data-id="' + esc(r.id) + '">採納</button>' : '<div class="muted">切到中級就能採納</div>') + '</div>';
    }).join('');
  }
  function renderAch() {
    var box = $('achBox'), w = S.wall; if (!w || !isMem()) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false; var a = W.ach(w, S.sid), s = W.stats(w);
    box.innerHTML = '<h3>這面牆的成就</h3><div id="achRow">' + ACH.map(function (x) { return '<span class="ach' + (a[x[0]] ? ' got' : '') + '" data-id="' + x[0] + '" title="' + esc(x[3]) + '">' + x[1] + ' ' + esc(x[2]) + (a[x[0]] ? ' ✓' : '') + '</span>'; }).join('') + '</div><div class="muted">牆上 ' + (s.evid + s.dec + s.proto + s.note) + ' 張卡、' + s.opn + ' 則意見、採納 ' + s.adopted + ' 則</div>';
  }
  function renderAdoptBox() {
    var box = $('adoptBox'); if (!S.lastLine) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '<h3>要放進「這一版改了什麼」的一行</h3><div class="selcard" id="adoptLine">' + esc(S.lastLine) + '</div><div class="bar"><button class="big" data-act="copyline">📋 複製這一行</button><button class="mini g" data-act="closeline">收起來</button></div><div class="muted" id="adoptNote">' + esc(S.lineNote || '') + '</div>';
  }

  /* ———— 採納：標記 + 把一行字接到提案室「這一版改了什麼」 ———— */
  function readProto() {
    return new Promise(function (res) {
      var done = false, off = null;
      function fin(p) { if (done) return; done = true; if (off) { try { off(); } catch (e) {} } res(p); }
      off = S.px.watchProto(S.sid, function (p) { fin(p); });
      setTimeout(function () { fin(null); }, 4000);
    });
  }
  function doAdopt(id) {
    var w = S.wall; if (!w || !canWrite()) { toast(REASON.readonly); return; }
    readProto().then(function (p0) {
      var p = p0 ? PXP.normProto(p0) : PXP.emptyProto(), n = Math.min(PXP.MAXV, PXP.verKeys(p).length + 1);
      var c = clone(w), r = W.adopt(c, S.sid, id, 'v' + n, NOW());
      if (!r.ok) { toast(r.reason === 'already' ? '這則已經採納過了' : r.reason === 'notowner' ? '只有被留意見的卡的作者能採納' : '採納不了：' + r.reason); return; }
      S.store.putAdopt(S.code, id, c.cards[id].adopt).then(function (res) {
        if (!res.ok) { toast('採納不了：' + (res.message || res.reason)); return; }
        S.lastLine = r.line; S.lineNote = '';
        if (!p0) { S.lineNote = '沒讀到你的提案紀錄，請按「複製這一行」貼到提案室的「這一版改了什麼」。'; toast('已採納；請把那一行複製到「這一版改了什麼」'); render(); return; }
        if (p.chg.indexOf(r.line) >= 0) { S.lineNote = '這一行已經在「這一版改了什麼」裡了。'; toast('已採納'); render(); return; }
        var merged = p.chg.trim() ? p.chg.replace(/\s+$/, '') + '\n' + r.line : r.line;
        if (Array.from(merged).length > PXP.LIMITS.chg) { S.lineNote = '「這一版改了什麼」已經快寫滿了（' + PXP.LIMITS.chg + ' 字），請按「複製這一行」自己挑著貼。'; toast('已採納；「改了什麼」放不下，請按複製'); render(); return; }
        p.chg = merged;
        S.px.saveProto(S.sid, p, lvNow()).then(function () { S.lineNote = '已經幫你放進提案室「這一版（第 ' + n + ' 版）改了什麼」。'; toast('已採納，也放進「這一版改了什麼」'); render(); },
          function () { S.lineNote = '沒辦法自動放進去，請按「複製這一行」貼到提案室的「這一版改了什麼」。'; toast('已採納；請把那一行複製過去'); render(); });
      });
    });
  }

  /* ———— 手機：分頁清單 ———— */
  function renderMobile() {
    var el = $('mobile'), w = S.wall; if (!w) { el.innerHTML = ''; return; }
    var tabs = W.TABS.map(function (k) { var n = W.mobileList(w, k, S.sid).length; return '<button class="mtab' + (S.tab === k ? ' on' : '') + '" data-act="tab" data-k="' + k + '" aria-pressed="' + (S.tab === k) + '">' + TAB_NAMES[k] + ' ' + n + '</button>'; }).join('');
    var rows = W.mobileList(w, S.tab, S.sid), cw = canWrite();
    el.innerHTML = '<div class="mtabs" role="group" aria-label="卡的種類">' + tabs + '</div>' + (rows.length ? rows.map(function (r) {
      var T = W.TYPES[r.t], adopt = '';
      if (S.tab === 'opn' && r.canAdopt) adopt = cw ? '<button class="big" data-act="adopt" data-id="' + esc(r.id) + '">採納</button>' : '<div class="muted">切到中級就能採納</div>';
      return '<article class="mcard" data-id="' + esc(r.id) + '" style="border-left-color:' + T.color + '"><div class="mh"><b>' + esc(r.label) + '</b>' + (r.v ? ' ' + esc(r.v) : '') + '・' + esc(r.by) + (r.mine ? '（我）' : '') + (r.adopted ? ' <span class="okb">✓ 已採納（' + esc(r.adopted) + '）</span>' : '') + '</div>' + (r.about ? '<div class="muted">針對：' + esc(r.about) + '</div>' : '') + '<div class="mt">' + esc(r.text) + '</div>' + (r.url ? '<div><a href="' + esc(r.url) + '" target="_blank" rel="noopener">開作品</a></div>' : '') + adopt + '</article>';
    }).join('') : '<div class="muted empty">這一頁還沒有卡。</div>');
  }

  /* ———— 桌機：Excalidraw 畫布 ———— */
  var C = { api: null, root: null, host: null, loading: null, failed: false, hash: '', dragging: false, moved: {}, pendingRebuild: false, mode: '', lastSel: '' };
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = function () { rej(new Error('載入失敗 ' + src)); }; document.head.appendChild(s); }); }
  function loadExcalidraw() {
    if (window.ExcalidrawLib) return Promise.resolve();
    if (C.loading) return C.loading;
    window.EXCALIDRAW_ASSET_PATH = ASSET;
    C.loading = loadScript('https://unpkg.com/react@18.2.0/umd/react.production.min.js').then(function () { return loadScript('https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js'); })
      .then(function () { return loadScript(ASSET + 'excalidraw.production.min.js'); });
    return C.loading;
  }
  function cardSize(c) {
    var w = c.t === 'note' ? 190 : 240, per = Math.max(6, Math.floor((w - 28) / 18)), n = 0;
    String(c.text || '').split('\n').forEach(function (ln) { n += Math.max(1, Math.ceil(Array.from(ln).length / per)); });
    n += 1 + (c.t === 'evid' || c.t === 'proto' ? 1 : 0);
    return { w: w, h: Math.max(c.t === 'note' ? 130 : 96, n * 25 + 28) };
  }
  function cardLabel(w, c) {
    var T = W.TYPES[c.t], by = W.nameOf(w, c.by), t = '【' + T.label + (c.v ? ' ' + c.v : '') + '】' + by + '\n' + (c.text || '');
    if (c.ref) t += '\n出處：' + c.ref;
    if (c.t === 'proto' && c.url) t += '\n' + String(c.url).replace(/^https:\/\//, '').slice(0, 26);
    if (c.adopt) t += '\n✓ 已採納';
    return t;
  }
  function buildSkeleton(w, writable) {
    var sk = [], pos = {};
    var ids = Object.keys(w.cards).sort(function (a, b) { return (w.cards[a].at || 0) - (w.cards[b].at || 0); });
    ids.forEach(function (id) {
      var c = w.cards[id], T = W.TYPES[c.t], z = cardSize(c), x = Number(c.x) || 0, y = Number(c.y) || 0; pos[id] = { x: x, y: y, w: z.w, h: z.h };
      sk.push({ type: 'rectangle', x: x, y: y, width: z.w, height: z.h, backgroundColor: T.color, strokeColor: T.edge || '#1e1e1e', strokeWidth: c.t === 'note' ? 3 : 2, roughness: 1, fillStyle: 'solid', roundness: { type: 3 }, angle: c.t === 'note' ? ((id.charCodeAt(id.length - 1) % 5) - 2) * 0.012 : 0,
        label: { text: cardLabel(w, c), fontSize: 18, fontFamily: 2 }, customData: { cid: id, t: c.t, lock: !(writable && String(c.by) === S.sid) } });
    });
    ids.forEach(function (id) {
      var c = w.cards[id]; if (c.t !== 'opn' || !pos[c.target]) return;
      var a = pos[c.target], b = pos[id], x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y;
      sk.push({ type: 'arrow', x: x1, y: y1, width: x2 - x1, height: y2 - y1, points: [[0, 0], [x2 - x1, y2 - y1]], strokeColor: '#c92a2a', strokeWidth: 2, roughness: 0, endArrowhead: 'arrow', customData: { arrow: id, lock: true } });
    });
    return sk;
  }
  /* 骨架 → Excalidraw 元素；不是自己的卡、連線都上鎖（拖不動），卡上的字（綁定文字）跟著容器鎖 */
  function toElements(w, writable) {
    var els = window.ExcalidrawLib.convertToExcalidrawElements(buildSkeleton(w, writable)), lockedIds = {};
    els.forEach(function (e) { if (e.customData && e.customData.lock) { e.locked = true; lockedIds[e.id] = 1; } });
    els.forEach(function (e) { if (e.containerId && lockedIds[e.containerId]) e.locked = true; });
    return els;
  }
  function hashOf(w, writable) {
    return JSON.stringify([writable, S.sid, Object.keys(w.cards).sort().map(function (id) { var c = w.cards[id]; return [id, c.x, c.y, c.text, c.adopt ? 1 : 0, c.by, c.target || '']; }), w.meta.members]);
  }
  function viewMode() { return !canWrite(); }
  function excalProps() {
    var XL = window.ExcalidrawLib;
    return { excalidrawAPI: function (api) { C.api = api; setTimeout(function () { fit(true); }, 150); },
      initialData: { elements: toElements(S.wall, canWrite()), appState: { viewBackgroundColor: '#fffdf5', gridSize: null, currentItemFontFamily: 2 }, scrollToContent: false },
      viewModeEnabled: viewMode(), zenModeEnabled: false, gridModeEnabled: false, langCode: 'zh-TW', theme: 'light', handleKeyboardGlobally: false,
      onChange: onCanvasChange, onPointerDown: function () { C.dragging = true; }, onPointerUp: onCanvasPointerUp,
      UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false, clearCanvas: false, changeViewBackgroundColor: false }, tools: { image: false } } };
  }
  function ensureCanvas() {
    var w = S.wall; if (!w) return;
    if (!window.ExcalidrawLib) {
      $('canvasMsg').textContent = '畫布載入中…'; $('canvasMsg').hidden = false;
      loadExcalidraw().then(function () { if (!isMobile()) render(); }, function () { C.failed = true; C.loading = null; toast('畫布載入不了，改用清單看'); render(); });
      return;
    }
    $('canvasMsg').hidden = true;
    var XL = window.ExcalidrawLib, R = window.React, RD = window.ReactDOM;
    if (!C.root) {
      C.host = $('cv'); C.host.innerHTML = ''; C.root = RD.createRoot(C.host); C.hash = hashOf(w, canWrite()); C.mode = String(viewMode());
      C.root.render(R.createElement(XL.Excalidraw, excalProps()));
      var wrap = $('canvasWrap');
      wrap.addEventListener('dblclick', function (e) { e.stopPropagation(); }, true);
      wrap.addEventListener('keydown', function (e) { if (/^(Delete|Backspace|Enter)$/.test(e.key) && !/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '')) { e.stopPropagation(); e.preventDefault(); } }, true);
      return;
    }
    if (!C.api) return;
    var mode = String(viewMode());
    if (mode !== C.mode) {   /* 新手↔中級：把檢視模式換掉 */
      C.mode = mode; var p = excalProps(); p.initialData = undefined; C.root.render(R.createElement(XL.Excalidraw, p)); setTimeout(function () { fit(true); }, 250);
    }
    var h = hashOf(w, canWrite());
    if (h === C.hash) return;
    if (C.dragging) { C.pendingRebuild = true; return; }
    rebuildScene(h);
  }
  function rebuildScene(h) {
    C.hash = h || hashOf(S.wall, canWrite()); C.pendingRebuild = false; C.rebuilding = true;
    C.api.updateScene({ elements: toElements(S.wall, canWrite()) });
    setTimeout(function () { C.rebuilding = false; }, 50);
  }
  function fit(first) {
    if (!C.api || !S.wall) return;
    var els = C.api.getSceneElements(); if (!els.length) return;
    C.api.scrollToContent(els, { fitToContent: true, animate: false });
  }
  function cidOfElement(el, all) {
    if (!el) return '';
    if (el.customData && el.customData.cid) return el.customData.cid;
    if (el.containerId) { for (var i = 0; i < all.length; i++) if (all[i].id === el.containerId) return (all[i].customData && all[i].customData.cid) || ''; }
    return '';
  }
  function onCanvasChange(elements, appState) {
    if (!C.api || C.rebuilding) return;
    var tool = appState && appState.activeTool && appState.activeTool.type;
    if (tool && tool !== 'selection' && tool !== 'hand') { try { C.api.setActiveTool({ type: 'selection' }); } catch (e) {} }
    var sel = '', ids = Object.keys((appState && appState.selectedElementIds) || {});
    for (var i = 0; i < ids.length && !sel; i++) { for (var j = 0; j < elements.length; j++) if (elements[j].id === ids[i]) { sel = cidOfElement(elements[j], elements); break; } }
    if (sel !== C.lastSel) { C.lastSel = sel; if (sel || S.sel) { S.sel = sel; renderSelBox(); } }
    if (canWrite() && S.wall) {
      for (var k = 0; k < elements.length; k++) {
        var e = elements[k], cid = e.customData && e.customData.cid; if (!cid || e.isDeleted) continue;
        var c = S.wall.cards[cid]; if (!c || String(c.by) !== S.sid) continue;
        if (Math.abs(e.x - (Number(c.x) || 0)) > 1 || Math.abs(e.y - (Number(c.y) || 0)) > 1) C.moved[cid] = { x: e.x, y: e.y };
      }
    }
  }
  function onCanvasPointerUp() {
    C.dragging = false;
    var m = C.moved; C.moved = {}; var ids = Object.keys(m), pend = [];
    ids.forEach(function (id) { var c = cardById(id); if (c && String(c.by) === S.sid) pend.push(S.store.moveCard(S.code, id, m[id].x, m[id].y)); });
    Promise.all(pend).then(function () { if (C.pendingRebuild && C.api && S.wall) rebuildScene(); });
    if (!pend.length && C.pendingRebuild && C.api && S.wall) rebuildScene();
  }
  S.canvasInfo = function () {
    if (!C.api) return null;
    var els = C.api.getSceneElements().filter(function (e) { return !e.isDeleted; });
    return { total: els.length, cards: els.filter(function (e) { return e.customData && e.customData.cid; }).length, arrows: els.filter(function (e) { return e.customData && e.customData.arrow; }).length, viewMode: C.api.getAppState().viewModeEnabled, cardsXY: els.filter(function (e) { return e.customData && e.customData.cid; }).map(function (e) { return [e.customData.cid, Math.round(e.x), Math.round(e.y), !!e.locked]; }) };
  };
  S.canvasMove = function (cid, dx, dy) {   /* 測試用：把畫布上的一張卡搬 dx、dy，再走一遍「放開滑鼠」的存檔路徑 */
    if (!C.api) return false;
    var els = C.api.getSceneElements().map(function (e) { return (e.customData && e.customData.cid === cid) ? Object.assign({}, e, { x: e.x + dx, y: e.y + dy }) : e; });
    C.api.updateScene({ elements: els }); setTimeout(function () { onCanvasPointerUp(); }, 30); return true;
  };

  /* ———— 事件 ———— */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act;
    if (a === 'lv') { if (U) U.writeLocal(window.localStorage, S.sid, Number(b.dataset.v), NOW()); S.composerSig = ''; S.sel = ''; C.lastSel = ''; render(); }
    else if (a === 'create') { var nk = $('nick'); if (nk) { S.name = clipText(nk.value.trim() || S.name, 16); try { localStorage.setItem('erg:wallname:' + S.sid, S.name); } catch (er) {} } createWall(); }
    else if (a === 'gojoin') {
      var nk2 = $('nick'); if (nk2) { S.name = clipText(nk2.value.trim() || S.name, 16); try { localStorage.setItem('erg:wallname:' + S.sid, S.name); } catch (er) {} }
      var code = W.normCode($('joinCode').value); if (!code) { toast('代碼要 2 到 24 個英文字母或數字'); return; }
      Q.set('join', '1'); setCode(code);
    }
    else if (a === 'home') { Q.delete('join'); setCode(''); }
    else if (a === 'request') sendRequest(false);
    else if (a === 'accept') accept(b.dataset.sid, b.dataset.name);
    else if (a === 'decline') S.store.declineRequest(S.code, b.dataset.sid).then(function () { toast('先不加入'); });
    else if (a === 'copyinvite') copyText($('inviteText').value).then(function (ok) { toast(ok ? '已複製邀請連結和代碼，傳給同學吧' : '請自己選取上面的文字複製'); });
    else if (a === 'manualadd') {
      var v = ($('manualSid').value || '').trim(); if (!/^[A-Za-z0-9_-]{1,20}$/.test(v)) { toast('學號只能有英文字母和數字'); return; }
      accept(v, v); $('manualSid').value = '';
    }
    else if (a === 'type') { S.type = b.dataset.k; S.composerSig = ''; renderComposer(); var ft = $('fText'); if (ft && !isMobile()) ft.focus(); }
    else if (a === 'post') postCard();
    else if (a === 'aboutcard') { S.type = 'opn'; S.target = b.dataset.id; S.composerSig = ''; renderComposer(); }
    else if (a === 'adopt') doAdopt(b.dataset.id);
    else if (a === 'tab') { S.tab = b.dataset.k; renderMobile(); }
    else if (a === 'copyline') copyText(S.lastLine).then(function (ok) { toast(ok ? '已複製，貼到提案室的「這一版改了什麼」' : '請自己選取那一行複製'); });
    else if (a === 'closeline') { S.lastLine = ''; renderAdoptBox(); }
    else if (a === 'fit') fit(false);
    else if (a === 'opencmp') { S.cmpOpen = !S.cmpOpen; document.body.classList.toggle('cmp-open', S.cmpOpen); if (S.cmpOpen) { var c = $('composerBox'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); } }
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'fTarget') S.target = e.target.value;
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
