/* 老師後台「故事板與用量」：唯讀儀表板（楊老師 10-26 22:21：「我其實只是把這裡當成 dashboard 在看」）。
   沒有任何可編輯欄位或寫入按鈕；參數只顯示目前值，要調整請在 Claude Code 跟助理說（助理用 tools/sb_config_set.py 改）。
   上方一列關鍵數字：本月下載、保護模式、今日上傳、助教今日次數與費用、後端心跳；下方是助教各級求助、各房故事板（點開直接看縮圖）與學生編輯比例。
   掛法（teacher.html 只要一個容器加三行 script）：
     <div id="sbTeacher"></div>
     <script src="sb_core.js"></script><script src="sb_store.js"></script><script src="sb_teacher.js"></script>
     ERG_SB_TEACHER.mount(document.getElementById('sbTeacher'), { root: firebase.database().ref('sbx/' + SESS), opsRoot: firebase.database().ref(), rooms: function () { return DB.listRooms(SESS); } });
   讀取很省：列表只讀 sb（文字，每間房約 2 KB）；縮圖只在點開某一房時才讀；原圖這裡完全不載；每 10 分鐘自動更新一次。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'), require('./sb_store.js'));
  else root.ERG_SB_TEACHER = factory(root.ERG_SB, root.ERG_SB_STORE);
})(typeof self !== 'undefined' ? self : this, function (SB, ST) {
  'use strict';
  var esc = SB.esc, HB_OK_MS = 60 * 1000;

  /* 純函式：把讀到的資料整理成面板要的數字（Node 可測） */
  function summarize(o) {
    o = o || {}; var now = o.now || Date.now(), ops = SB.opsState(o.ops, now), day = SB.dayKey(now), q = o.quota || {};
    var site = Number(q.total) || 0, rooms = [], cfg = SB.config(o.config), cu = o.coachUsage || {};
    var kinds = { hint: 0, check: 0, pattern: 0, fill: 0, course: 0, next: 0 }; Object.keys(kinds).forEach(function (k) { kinds[k] = Number((cu.byKind || {})[k]) || 0; });
    var users = cu.users || {}, courseQs = Object.keys(cu.cq || {}).sort().map(function (k) { return { sid: String(cu.cq[k].sid || ''), ask: String(cu.cq[k].ask || '') }; });
    var coach = { calls: Number(cu.calls) || 0, usd: (Number(cu.nusd) || 0) / 1e9, byKind: kinds, fills: Number(cu.fills) || 0, capHits: { user: Number((cu.capHits || {}).user) || 0, fill: Number((cu.capHits || {}).fill) || 0, usd: Number((cu.capHits || {}).usd) || 0 },
      users: Object.keys(users).length, capUsers: Object.keys(users).filter(function (k) { return cfg.coachPerDay > 0 && Number(users[k]) >= cfg.coachPerDay; }).length, courseQs: courseQs, cap: cfg.coachDayUsd };
    var hbT = Number((o.worker || {}).heartbeat) || 0, hb = { known: hbT > 0, ageSec: hbT > 0 ? Math.max(0, Math.round((now - hbT) / 1000)) : null, alive: hbT > 0 && now - hbT <= HB_OK_MS, mode: (o.worker || {}).mode || '', pid: (o.worker || {}).pid || null };
    var sb = o.sb || {}, roomMeta = {}; (o.rooms || []).forEach(function (r) { if (r && r.code) roomMeta[r.code] = r; });
    Object.keys(sb).forEach(function (code) {
      var boards = sb[code] || {}, wall = SB.normBoard(boards.wall), mineList = [];
      Object.keys(boards).forEach(function (b) { if (b !== 'wall') mineList.push({ sid: b.replace(/^u_/, ''), stat: SB.boardStats(SB.normBoard(boards[b])), cells: SB.normBoard(boards[b]).cells }); });
      var all = wall.cells.slice(); mineList.forEach(function (m) { all = all.concat(m.cells); });
      rooms.push({ code: code, caseId: (roomMeta[code] && roomMeta[code].case) || '', wall: SB.boardStats(wall), mine: mineList.length, authors: SB.authorSummary(all), imgs: all.filter(function (c) { return !!c.img; }).length, updatedAt: all.reduce(function (m, c) { return Math.max(m, c.updatedAt || 0); }, 0) });
    });
    rooms.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    var dl = ops.known && ops.gb !== null;
    var tiles = [
      { label: '本月下載', value: dl ? ops.gb.toFixed(2) + ' GB／10 GB' : (ops.known ? '讀不到下載量' : '尚無資料'), note: dl ? '約 ' + Math.round(ops.gb * 10) + '%' + (ops.stale ? '（超過 3 小時沒更新）' : '') : (ops.known ? '排程沒拿到監控資料，保護沒有依據' : '跑 fb_usage_publish.py --go'), level: dl && ops.gb >= 7 ? 'warn' : '' },
      { label: '保護模式', value: { normal: '正常', thumb: '縮圖模式', noupload: '停止上傳', readonly: '唯讀' }[ops.mode], note: '7 GB 縮圖・8.5 GB 停傳・9.5 GB 唯讀', level: ops.mode === 'normal' ? '' : (ops.mode === 'thumb' ? 'warn' : 'bad') },
      { label: '今日上傳', value: site + '／' + cfg.uploadSiteDay + ' 張', note: Object.keys(q.u || {}).length + ' 人上傳過・每人上限 ' + cfg.uploadPerUserDay, level: site >= cfg.uploadSiteDay ? 'bad' : '' },
      { label: '助教今日', value: coach.calls + ' 次・US$' + coach.usd.toFixed(4), note: coach.users + ' 人用過・日上限 US$' + cfg.coachDayUsd, level: coach.usd >= cfg.coachDayUsd ? 'bad' : '' },
      { label: '後端心跳', value: hb.known ? (hb.alive ? '正常（' + hb.ageSec + ' 秒前）' : '沒在跑（' + (hb.ageSec >= 3600 ? Math.round(hb.ageSec / 3600) + ' 小時' : Math.round(hb.ageSec / 60) + ' 分鐘') + '前）') : '沒有資料', note: hb.known && hb.mode === 'once' ? '單次模式' : '助教後端', level: hb.alive ? '' : 'bad' }
    ];
    var extra = [{ label: '同時連線最高值', value: ops.known ? ops.peak + '／100' : '—' }, { label: '資料庫儲存', value: ops.known && ops.storageGB !== null ? (ops.storageGB * 1000).toFixed(0) + ' MB／1 GB' : '—' }];
    return { ops: ops, day: day, cfg: cfg, coach: coach, hb: hb, siteToday: site, userCount: Object.keys(q.u || {}).length, rooms: rooms, tiles: tiles, extra: extra };
  }

  var CSS = '.sbt{font:14px/1.5 "Noto Sans TC",system-ui,sans-serif}.sbt .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:8px 0}' +
    '.sbt .tile{border:3px solid var(--ink,#1e1e1e);border-radius:10px;padding:6px 10px;background:var(--panel,#fff)}.sbt .tile b{display:block;font-size:12px;color:var(--muted,#59656d)}.sbt .tile span{font-size:17px;font-weight:900}.sbt .tile .n{font-size:11px;color:var(--muted,#59656d)}' +
    '.sbt .tile.warn{background:#fff3bf;color:#1e1e1e}.sbt .tile.bad{background:#ffc9c9;color:#1e1e1e}.sbt .tile.warn b,.sbt .tile.bad b,.sbt .tile.warn .n,.sbt .tile.bad .n{color:#4a4a4a}' +
    '.sbt .line{margin:6px 0;font-size:13px}.sbt .chip{display:inline-block;border:2px solid var(--ink,#1e1e1e);border-radius:99px;padding:0 10px;margin:2px 4px 2px 0;background:var(--panel,#fff)}.sbt .muted{color:var(--muted,#59656d);font-size:12px}' +
    '.sbt details.room{border:2px solid var(--ink,#1e1e1e);border-radius:10px;margin:6px 0;padding:4px 10px;background:var(--panel,#fff)}.sbt details.room>summary{cursor:pointer;display:flex;gap:12px;flex-wrap:wrap;align-items:center}' +
    '.sbt .strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.sbt .strip figure{margin:0;width:120px;font-size:11px}.sbt .strip img{width:120px;height:80px;object-fit:contain;border:2px solid var(--ink,#1e1e1e);border-radius:6px;background:#eef}' +
    '.sbt .bar{display:inline-flex;height:8px;background:#ddd;border-radius:4px;overflow:hidden;width:90px;vertical-align:middle}.sbt .bar i{display:block;height:100%}';
  function ratioBar(a) {
    var n = a.cells || 1, ai = a.ai || 0; return '<span class="bar" title="助教代填 ' + ai + '・照抄 ' + a.copy + '・改寫 ' + a.rewrite + '・自己寫 ' + a.own + '"><i style="width:' + (ai / n * 100) + '%;background:#868e96"></i><i style="width:' + (a.copy / n * 100) + '%;background:#e03131"></i><i style="width:' + (a.rewrite / n * 100) + '%;background:#f59f00"></i><i style="width:' + (a.own / n * 100) + '%;background:#2f9e44"></i></span>';
  }
  function html(sum) {
    var c = sum.coach, cfg = sum.cfg, k = c.byKind;
    var tiles = sum.tiles.map(function (x) { return '<div class="tile ' + x.level + '"><b>' + esc(x.label) + '</b><span>' + esc(x.value) + '</span><div class="n">' + esc(x.note) + '</div></div>'; }).join('');
    var params = '每人每日助教 ' + cfg.coachPerDay + ' 次・每板代填 ' + cfg.fillPerBoard + ' 格・改寫門檻 ' + cfg.rewriteThreshold + '・每人每日上傳 ' + cfg.uploadPerUserDay + ' 張・全站每日 ' + cfg.uploadSiteDay + ' 張・助教日費用上限 US$' + cfg.coachDayUsd + '・模型 ' + esc(cfg.modelLite) + '／' + esc(cfg.modelFill) + '（代填）';
    var rows = sum.rooms.map(function (r) {
      var info = SB.caseInfo(r.caseId), au = r.authors.map(function (a) { return esc(a.sid) + ' ' + ratioBar(a) + ' ' + Math.round(a.avg * 100) + '%（' + a.cells + ' 格' + (a.ai ? '・代填 ' + a.ai : '') + '）'; }).join('　') || '<span class="muted">還沒有人寫</span>';
      return '<details class="room" data-code="' + esc(r.code) + '"><summary><b>' + esc(r.code) + '</b><span class="muted">' + (r.caseId ? esc(info.icon + ' ' + info.name) : '') + '</span><span>牆 ' + r.wall.filled + '／' + r.wall.cells + ' 格・' + r.wall.authors + ' 人共編・圖 ' + r.imgs + '・個人板 ' + r.mine + '</span><span>' + au + '</span></summary><div class="body muted">點開時載入縮圖…</div></details>';
    }).join('');
    return '<div class="sbt"><style>' + CSS + '</style><h2>故事板與用量</h2><div class="tiles">' + tiles + '</div>' +
      '<div class="line muted">' + sum.extra.map(function (e) { return esc(e.label) + ' ' + esc(e.value); }).join('・') + '・每 10 分鐘自動更新・免費方案不會扣款，超過上限資料庫會停用</div>' +
      '<div class="line"><b>目前參數</b>　' + params + '<div class="muted">要調整請在 Claude Code 跟助理說</div></div>' +
      '<div class="line"><b>助教各級求助</b>　<span class="chip">提示 ' + k.hint + '</span><span class="chip">檢查 ' + k.check + '</span><span class="chip">句型示範 ' + k.pattern + '</span><span class="chip">往下一步 ' + k.next + '</span><span class="chip">課程問答 ' + k.course + '</span><span class="chip">代填 ' + k.fill + '（成功 ' + c.fills + ' 格）</span>' +
      '<span class="chip">觸頂 ' + c.capUsers + ' 人</span><span class="chip">被擋：次數 ' + c.capHits.user + '・代填 ' + c.capHits.fill + '・費用 ' + c.capHits.usd + '</span></div>' +
      '<details class="line"><summary>今天問過的課程問題（' + c.courseQs.length + ' 則，原文）</summary>' + (c.courseQs.map(function (q) { return '<div>' + esc(q.sid) + '：' + esc(q.ask) + '</div>'; }).join('') || '<div class="muted">還沒有</div>') + '</details>' +
      '<h3>各房故事板（點開看縮圖；條的顏色：灰＝助教代填、紅＝照抄、橘＝改寫、綠＝自己寫）</h3>' + (rows || '<div class="muted">還沒有人開故事板</div>') + '</div>';
  }

  function mount(el, opts) {
    opts = opts || {}; var store = ST.makeStore({ root: opts.root, opsRoot: opts.opsRoot, now: opts.now }), now = opts.now || Date.now, timer = null, openCodes = {};
    function load() {
      var day = SB.dayKey(now()), res = { now: now() }, top = opts.opsRoot || opts.root;
      return Promise.all([top.child('sbops/usage').once('value'), store.getQuotaOnce(day), opts.root.child('sb').once('value'), top.child('sbops/config').once('value'), top.child('sbops/coachUsage/' + day).once('value'), top.child('sbops/coachWorker').once('value')]).then(function (a) {
        res.ops = a[0] && a[0].val(); res.quota = a[1]; res.sb = a[2] && a[2].val(); res.config = a[3] && a[3].val(); res.coachUsage = a[4] && a[4].val(); res.worker = a[5] && a[5].val();
        res.rooms = typeof opts.rooms === 'function' ? opts.rooms() : [];
        var sum = summarize(res); el.innerHTML = html(sum);
        Object.keys(openCodes).forEach(function (code) { var d = el.querySelector('details.room[data-code="' + code + '"]'); if (d) { d.open = true; fillRoom(d, code); } });
        return sum;
      });
    }
    function fillRoom(d, code) {
      Promise.all([opts.root.child('sb/' + code).once('value'), opts.root.child('sbth/' + code).once('value')]).then(function (a) {
        var boards = a[0].val() || {}, th = a[1].val() || {}, out = '';
        Object.keys(boards).forEach(function (bk) {
          var cells = SB.normBoard(boards[bk]).cells;
          out += '<div><b>' + (bk === 'wall' ? '房間牆' : '個人板 ' + esc(bk.replace(/^u_/, ''))) + '</b><div class="strip">' + cells.map(function (c) {
            var t = th[bk] && th[bk][SB.slotKey(c.n)]; return '<figure>' + (t && t.d ? '<img alt="" src="' + esc(t.d) + '">' : '<div class="muted">（無圖）</div>') + '<figcaption>' + c.n + ' ' + esc(c.title) + (c.moment ? ' ★' : '') + '<br>' + esc(c.by || '') + (c.er ? '・' + esc(SB.bandText(c.er.band)) + ' ' + Math.round(c.er.r * 100) + '%' : '') + (SB.needsSource(c) ? '・缺出處' : '') + '</figcaption></figure>';
          }).join('') + '</div></div>';
        });
        d.querySelector('.body').innerHTML = out || '<span class="muted">沒有內容</span>';
      });
    }
    el.addEventListener('toggle', function (e) { var d = e.target; if (d && d.classList && d.classList.contains('room')) { var code = d.dataset.code; if (d.open) { openCodes[code] = 1; fillRoom(d, code); } else delete openCodes[code]; } }, true);
    var p = load(); timer = setInterval(load, 10 * 60 * 1000);
    return { reload: load, stop: function () { clearInterval(timer); }, ready: p };
  }
  return { mount: mount, summarize: summarize, html: html };
});
