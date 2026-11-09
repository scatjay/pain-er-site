/* 提案室「每週送審」的純函式：這週是哪一份、這一份的三顆燈（規則式、免費、不連網）。不碰 DOM、不碰 Firebase，Node 可測。
   資料（六份的名稱、週次、各班切換與截止時間、哪一份有哪幾顆燈、迭代要求、學生看得到的說明字）只有一份：tools/prx_units.json。
   瀏覽器沒有 require，改載入 proposal_units_data.js（由 tools/gen_prx_units_data.py 從 json 產生，測試會比對兩者一致）。
   Python 端 tools/prx_units.py 做同一組檢查；node test_proposal_units.js 與 python tools/test_prx_units.py 用 tools/prx_unit_fixtures.json 逐項對帳。
   輸出只有燈號 ok／part／no（不適用是 na），沒有分數、沒有數字總分。標記（[Claude✓] 等）是學生按畫面按鈕寫進連結備註的自述，這裡只讀取判斷，不代表驗證過。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tools/prx_units.json'), require('./proposal_core.js'));
  else root.ERG_UNITS = factory(root.ERG_UNITS_DATA, root.ERG_PX);
})(typeof self !== 'undefined' ? self : this, function (D, PX) {
  'use strict';
  var DAY = 86400000, KINDS = ['free', 'dsg', 'fig', 'ais'], RANK = { ok: 2, part: 1, no: 0 };

  function s(x) { return x == null ? '' : String(x); }
  function tr(x) { return s(x).trim(); }
  function len(x) { return Array.from(s(x)).length; }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function fmt(code, v) {
    v = v || {};
    return s(D.msgs[code]).replace(/\{(\w+)\}/g, function (m, k) { return v[k] == null ? '' : String(v[k]); });
  }

  /* ———— 這週是哪一份 ———— */
  function classOf(cls) {   /* 班級字串（profiles 裡的 cls）→ 二甲／二乙／二丙；認不得回空字串 */
    var c = s(cls);
    for (var i = 0; i < D.classOrder.length; i++) if (c.indexOf(D.classOrder[i]) >= 0) return D.classOrder[i];
    return '';
  }
  function schedKey(cls) { return cls === '二甲' ? '二甲' : 'default'; }
  function baseMs(cls) { return Date.parse(D.classes[schedKey(cls)].w10SwitchAt); }
  function unitById(id) { return D.units.filter(function (u) { return u.id === id; })[0] || null; }
  /* 與 proposal_proto.js 的 weekPart 同一個算法（測試比對）：前一晚 20:00 切下一份；二甲晚兩天；W10 之前＝第 1 份，W15 之後＝最後一份 */
  function currentUnit(cls, now) {
    var n = 1 + Math.floor((now - baseMs(cls)) / (D.switchEveryDays * DAY));
    if (!isFinite(n)) n = 1;
    return D.units[Math.max(1, Math.min(D.units.length, n)) - 1];
  }
  function schedule(unitId, cls) { var u = unitById(unitId); return u ? u.schedule[schedKey(cls)] : null; }
  /* 送審是哪一份：優先用送審時間 t（毫秒，要在 2026 年以後才信），不然用日期鍵 YYYYMMDD 當天中午。
     推不出來（沒日期、或在 W10 切換之前、或認不得班級）就當第 1 份並標 guess。回傳 { unit, guess } */
  function unitForSub(day, t, cls) {
    var c = classOf(cls), now = NaN, m;
    if (typeof t === 'number' && isFinite(t) && t >= D.plausibleFromMs) now = t;
    else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s(day)))) now = Date.parse(m[1] + '-' + m[2] + '-' + m[3] + 'T12:00:00+08:00');
    var guess = !isFinite(now) || !c || now < baseMs(c);
    return { unit: isFinite(now) ? currentUnit(c, now) : D.units[0], guess: guess };
  }

  /* ———— 整理送審快照裡的原型 ———— */
  function normLinks(raw) {
    var o = {}; if (!isObj(raw)) return o;
    KINDS.forEach(function (k) { var x = raw[k]; if (isObj(x)) o[k] = { url: s(x.url), note: s(x.note) }; });
    return o;
  }
  function normProto(raw) {
    raw = isObj(raw) ? raw : {};
    var lv = raw.lv, vs = isObj(raw.vers) ? raw.vers : {}, vers = [];
    lv = (typeof lv === 'number' && (lv === 1 || lv === 2 || lv === 3)) ? lv : 0;
    for (var i = 1; i <= 6; i++) { var v = vs['v' + i]; if (isObj(v)) vers.push({ n: i, chg: s(v.chg), links: normLinks(v.links) }); }
    return { lv: lv, links: normLinks(raw.links), chg: s(raw.chg), heur: s(raw.heur), vers: vers };
  }

  /* ———— 連結 ———— */
  function isHttps(u) { return /^https:\/\/\S+$/.test(u) && len(u) <= 300; }
  function parseUrl(u) {
    var m = /^https:\/\/([^\/?#:@\s]+)(?::[0-9]+)?(\/[^?#\s]*)?/.exec(u);
    if (!m) return null;
    return { host: m[1].toLowerCase(), segs: s(m[2]).split('/').filter(function (x) { return x; }) };
  }
  function hostIn(host, list) { return list.some(function (a) { return host === a || host.slice(-(a.length + 1)) === '.' + a; }); }
  function linkState(P, kind, hosts) {   /* none 沒貼｜bad 格式或網站不對｜ok */
    var L = P.links[kind];
    if (!L || !tr(L.url)) return 'none';
    var u = tr(L.url), p = isHttps(u) ? parseUrl(u) : null;
    return p && hostIn(p.host, hosts) ? 'ok' : 'bad';
  }
  function allNotes(P) {
    var out = [];
    function add(links) { KINDS.forEach(function (k) { if (links[k] && links[k].note) out.push(links[k].note); }); }
    add(P.links); P.vers.forEach(function (v) { add(v.links); });
    return out;
  }
  function allChg(P) {   /* 目前這一版的 chg 在前，其次由新到舊的凍結版本（凍結後目前這一版會清空） */
    return [P.chg].concat(P.vers.slice().reverse().map(function (v) { return v.chg; }));
  }
  function hasMarker(P, mk) { return allNotes(P).some(function (n) { return n.indexOf(mk) >= 0; }); }
  function best(list) {   /* [{state,msg}…] 取最好的一個（同分取前面的） */
    var b = list[0]; list.forEach(function (x) { if (RANK[x.state] > RANK[b.state]) b = x; }); return b;
  }

  /* ———— 各項檢查：回傳 { state: ok|part|no, msg: 代碼, v: 訊息參數 } ———— */
  function R(state, code, v) { return { state: state, msg: code || '', v: v || {} }; }
  function chkLink(kind, hosts, none, bad) {
    return function (K) { var st = linkState(K.P, kind, hosts); return st === 'ok' ? R('ok') : R('no', st === 'none' ? none : bad); };
  }
  function figSlug(P) {
    var L = P.links.fig; if (!L) return null;
    var u = tr(L.url), p = isHttps(u) ? parseUrl(u) : null;
    if (!p || !hostIn(p.host, D.hosts.fig)) return null;
    var seg = p.segs[2]; if (!seg) return '';
    try { seg = decodeURIComponent(seg); } catch (e) { /* 解不開就用原字 */ }
    return seg.toLowerCase();
  }
  function chkFigRename(K) {
    var n = figSlug(K.P);
    if (n === null || n === '') return R('part', 'fig-rename-unknown');
    var tpl = D.figma.templateNames.some(function (t) { return n.indexOf(t) === 0; }) || D.figma.copyWords.some(function (w) { return n.indexOf(w) >= 0; });
    return tpl ? R('no', 'fig-rename-template') : R('ok');
  }
  function threeOf(text) {   /* ①②③ 三處：回傳 { valid: 有幾處夠長且不重複, present: 有幾個符號, dup: 是否有夠長但重複的 } */
    var marks = ['①', '②', '③'], pos = [];
    marks.forEach(function (m) { var i = text.indexOf(m); if (i >= 0) pos.push(i); });
    pos.sort(function (a, b) { return a - b; });
    var segs = pos.map(function (p, i) { return tr(text.slice(p + 1, i + 1 < pos.length ? pos[i + 1] : text.length)); });
    var longs = segs.filter(function (x) { return len(x) >= D.minSegChars; }), seen = {}, distinct = 0;
    longs.forEach(function (x) { if (!seen[x]) { seen[x] = 1; distinct++; } });
    return { valid: distinct, present: pos.length, dup: longs.length > distinct };
  }
  function chkChgThree(K) {
    return best(allChg(K.P).map(function (t) {
      var r = threeOf(t);
      if (r.present === 3 && r.valid === 3) return R('ok');
      if (r.valid === 0) return R('no', 'chg-three-none');
      return r.dup ? R('part', 'chg-three-same') : R('part', 'chg-three-part', { n: r.valid });
    }));
  }
  function chkShare(K) { return hasMarker(K.P, D.markers.incognito) ? R('ok') : R('part', 'share-view'); }
  function chkFigKeep(K) { return linkState(K.P, 'fig', D.hosts.fig) === 'ok' ? R('ok') : R('part', 'fig-keep'); }
  function filledRows(K) { return K.doc.rows.filter(PX.rowFilled).length; }
  function chkAlignRows(K) {
    var n = filledRows(K), evBad = K.al.problems.filter(function (p) { return p.code === 'row-ev' || p.code === 'row-ev-lost'; }).length;
    if (n === 0) return R('no', 'rows-few', { n: 0 });
    if (n < D.minRows) return R('part', 'rows-few', { n: n });
    return evBad ? R('part', 'rows-ev', { n: evBad }) : R('ok');
  }
  function chkAlignFull(K) { return K.al.ok ? R('ok') : R('part', 'align-full', { m: K.al.problems[0].msg }); }
  function chkChgShort(code) {
    return function (K) { return allChg(K.P).some(function (t) { return len(tr(t)) >= D.minSegChars; }) ? R('ok') : R('part', code); };
  }
  function chkClaude1(K) { return (hasMarker(K.P, D.markers.claude1) || hasMarker(K.P, D.markers.claude2)) ? R('ok') : R('no', 'claude-none'); }
  function chkClaude2(K) { return hasMarker(K.P, D.markers.claude2) ? R('ok') : (hasMarker(K.P, D.markers.claude1) ? R('part', 'claude-two') : R('no', 'claude-none')); }
  function trialOf(text) {   /* [試用 38秒/5下/停在某句]：秒數、點幾下、停在哪都要有 */
    var m = /\[試用([^\]]*)\]/.exec(text);
    if (!m) return null;
    var c = m[1], miss = [];
    if (!/[0-9]+[ \t　]*秒/.test(c)) miss.push('幾秒');
    if (!/[0-9]+[ \t　]*下/.test(c)) miss.push('點幾下');
    if (!/停在[ \t　]*[^\s\]]/.test(c)) miss.push('停在哪一句');
    return miss;
  }
  function chkTrial(K) {
    var texts = allNotes(K.P).concat(allChg(K.P));
    return best(texts.map(function (t) {
      var miss = trialOf(t);
      if (miss === null) return R('no', 'trial-none');
      return miss.length ? R('part', 'trial-part', { m: miss.join('、') }) : R('ok');
    }).concat([R('no', 'trial-none')]));
  }
  function chkVersions(K) {
    var need = D.iterMin[K.unitId][K.lv - 1], vers = K.P.vers, have = vers.length;
    if (!need) return R('ok');
    if (have < need) return R(have ? 'part' : 'no', 'ver-few', { need: need, have: have });
    for (var i = 0; i < vers.length; i++) {
      if (!tr(vers[i].chg)) return R('part', 'ver-chg-empty', { n: vers[i].n });
      if (i > 0 && tr(vers[i].chg) === tr(vers[i - 1].chg)) return R('part', 'ver-chg-same', { n: vers[i].n, p: vers[i - 1].n });
    }
    return R('ok');
  }
  function chkPng(K) { return hasMarker(K.P, D.markers.png2) ? R('ok') : R('part', 'png-two'); }
  function chkHeur(K) {
    if (K.lv < 3) return R('ok');
    var seen = {}, n = 0; (K.P.heur.match(/H(?:10|[1-9])(?![0-9])/g) || []).forEach(function (h) { if (!seen[h]) { seen[h] = 1; n++; } });
    return n >= 10 ? R('ok') : R('part', 'heur-ten', { n: n });
  }
  var CHECKS = {
    linkFig: chkLink('fig', D.hosts.fig, 'link-fig-none', 'link-fig-bad'), linkAis: chkLink('ais', D.hosts.ais, 'link-ais-none', 'link-ais-bad'),
    figRename: chkFigRename, chgThree: chkChgThree, shareView: chkShare, linkFigKeep: chkFigKeep, alignRows: chkAlignRows, alignFull: chkAlignFull,
    chgPage: chkChgShort('chg-page-short'), chgInteract: chkChgShort('chg-interact-short'), claude1: chkClaude1, claude2: chkClaude2,
    trialRecord: chkTrial, versions: chkVersions, pngTwo: chkPng, heurTen: chkHeur
  };

  /* ———— 三顆燈 ———— */
  function resolveLv(lv, P) { lv = Number(lv); return (lv === 1 || lv === 2 || lv === 3) ? lv : (P.lv || 1); }   /* 沒設模式＝1（不要求迭代）；比現有 ui_level 的預設專家保守 */
  function sets(snap, ctx) {
    function fromList(l, o) { var m = {}; (l || []).forEach(function (x) { m[x] = true; }); return m; }
    function fromKeys(o) { var m = {}; Object.keys(isObj(o) ? o : {}).forEach(function (k) { m[k] = true; }); return m; }
    ctx = ctx || {};
    return { ev: ctx.evSet || fromKeys(snap && snap.evText), cell: ctx.cellSet || fromKeys(snap && snap.cellText) };
  }
  /* snap＝送審快照 { doc:{dir,rows,real,proto}, evText, cellText }（也收單純的 doc）；ctx.evSet／ctx.cellSet＝{id:true}（審核端用重讀的紀錄，不給就用快照裡的 evText／cellText 的鍵）
     回傳 { unit, lv, pass, lights:[{k,name,state,why,items:[{id,state,gate,msg}]}], missing:[…學生看得到的字], blocking:[…項目代碼] }
     pass＝所有「擋關」的項目都 ok（自述類、推定類不擋）。沒有分數。 */
  function unitChecklist(snap, unitId, lv, ctx) {
    var doc = (snap && snap.doc) ? snap.doc : (snap || {}), P = normProto(doc.proto), nd = PX.normDoc(doc), st = sets(snap, ctx), u = unitById(unitId);
    if (!u) throw new Error('unknown unit: ' + unitId);
    var K = { unitId: unitId, P: P, doc: nd, lv: resolveLv(lv, P) }, uc = D.unitChecks[unitId], missing = [], blocking = [];
    K.al = PX.alignment(nd, st.ev, st.cell);
    var lights = D.lights.map(function (L) {
      var ids = uc[L.k];
      if (!ids) return { k: L.k, name: L.name, state: 'na', why: '', items: [] };
      var items = ids.map(function (id) {
        var r = CHECKS[id](K), gate = !!D.gates[id], msg = r.state === 'ok' ? '' : fmt(r.msg, r.v);
        if (r.state !== 'ok') { if (missing.indexOf(msg) < 0) missing.push(msg); if (gate) blocking.push(id); }
        return { id: id, state: r.state, gate: gate, msg: msg };
      });
      var allOk = items.every(function (i) { return i.state === 'ok'; }), allNo = items.every(function (i) { return i.state === 'no'; });
      var bad = items.filter(function (i) { return i.state !== 'ok'; })[0];
      return { k: L.k, name: L.name, state: allOk ? 'ok' : (allNo ? 'no' : 'part'), why: bad ? bad.msg : '', items: items };
    });
    return { unit: unitId, lv: K.lv, pass: blocking.length === 0, lights: lights, missing: missing, blocking: blocking };
  }
  /* 累積式：這一份之前的每一份，快照裡有沒有那一份的連結（有才算送過）。回傳 [{ unit, sent, state }]，沒做的份是「還沒送」，不是錯 */
  function priorUnits(snap, unitId, lv, ctx) {
    var cur = unitById(unitId), doc = (snap && snap.doc) ? snap.doc : (snap || {}), P = normProto(doc.proto), out = [];
    for (var i = 0; i < cur.n - 1; i++) {
      var u = D.units[i], kind = u.id.charAt(0) === 'f' ? 'fig' : 'ais', L = P.links[kind], sent = !!(L && tr(L.url));
      out.push({ unit: u.id, sent: sent, state: sent ? unitChecklist(snap, u.id, lv, ctx).lights[0].state : '' });
    }
    return out;
  }
  /* 送進 rev 的燈號（不含 items、不含 na）：[{k,name,state,why}] */
  function checksForNode(res) {
    return res.lights.filter(function (l) { return l.state !== 'na'; }).map(function (l) { return { k: l.k, name: l.name, state: l.state, why: l.why }; });
  }

  return { DATA: D, classOf: classOf, currentUnit: currentUnit, unitById: unitById, unitForSub: unitForSub, schedule: schedule, normProto: normProto,
    unitChecklist: unitChecklist, priorUnits: priorUnits, checksForNode: checksForNode, CHECKS: CHECKS };
});
