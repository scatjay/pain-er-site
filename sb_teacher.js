/* 老師後台：Firebase 用量面板＋各房故事板與學生編輯比例列表。
   掛法（teacher.html 只要加一行 script 與一個容器）：
     <div id="sbTeacher"></div>
     <script src="sb_core.js"></script><script src="sb_store.js"></script><script src="sb_teacher.js"></script>
     ……DB 與 Firebase 都準備好之後：ERG_SB_TEACHER.mount(document.getElementById('sbTeacher'), { root: firebase.database().ref('sbx/' + SESS), opsRoot: firebase.database().ref(), rooms: function () { return DB.listRooms(SESS); } });
   讀取很省：列表只讀 sb（文字，每間房約 2 KB），縮圖要點開某一房才讀，原圖這裡完全不載。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'), require('./sb_store.js'));
  else root.ERG_SB_TEACHER = factory(root.ERG_SB, root.ERG_SB_STORE);
})(typeof self !== 'undefined' ? self : this, function (SB, ST) {
  'use strict';
  var esc = SB.esc;

  /* 純函式：把讀到的資料整理成面板要的數字（Node 可測） */
  function summarize(o) {
    o = o || {}; var now = o.now || Date.now(), ops = SB.opsState(o.ops, now), day = SB.dayKey(now), q = (o.quota || {});
    var site = Number(q.total) || 0, rooms = [];
    var sb = o.sb || {}, roomMeta = {}; (o.rooms || []).forEach(function (r) { if (r && r.code) roomMeta[r.code] = r; });
    Object.keys(sb).forEach(function (code) {
      var boards = sb[code] || {}, wall = SB.normBoard(boards.wall), mineList = [];
      Object.keys(boards).forEach(function (b) { if (b !== 'wall') mineList.push({ sid: b.replace(/^u_/, ''), stat: SB.boardStats(SB.normBoard(boards[b])), cells: SB.normBoard(boards[b]).cells }); });
      var all = wall.cells.slice(); mineList.forEach(function (m) { all = all.concat(m.cells); });
      var authors = SB.authorSummary(all);
      rooms.push({ code: code, caseId: (roomMeta[code] && roomMeta[code].case) || '', wall: SB.boardStats(wall), mine: mineList.length, authors: authors, imgs: all.filter(function (c) { return !!c.img; }).length, updatedAt: all.reduce(function (m, c) { return Math.max(m, c.updatedAt || 0); }, 0) });
    });
    rooms.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    return { ops: ops, day: day, siteToday: site, userCount: Object.keys(q.u || {}).length, rooms: rooms,
      tiles: [
        { label: '本月下載', value: ops.known && ops.gb !== null ? ops.gb.toFixed(2) + ' GB／10 GB' : (ops.known ? '讀不到下載量' : '尚無資料'), note: ops.known && ops.gb !== null ? '約 ' + Math.round(ops.gb * 10) + '%' : (ops.known ? '排程沒拿到監控資料，保護沒有依據' : '跑 fb_usage_publish.py --go') },
        { label: '同時連線最高值', value: ops.known ? ops.peak + '／100' : '—', note: '本月' },
        { label: '資料庫儲存', value: ops.known && ops.storageGB !== null ? (ops.storageGB * 1000).toFixed(0) + ' MB／1 GB' : '—', note: '圖片是最大宗' },
        { label: '今日上傳', value: site + '／' + SB.LIMITS.sitePerDay + ' 張', note: (Object.keys(q.u || {}).length) + ' 人上傳過・每人上限 ' + SB.LIMITS.perUserPerDay },
        { label: '保護狀態', value: SB.MODE_TEXT[ops.mode].split('：')[0], note: '7 GB 縮圖／8.5 GB 停傳／9.5 GB 唯讀' + (ops.stale && ops.known ? '（數字超過 3 小時沒更新）' : '') }
      ] };
  }

  var CSS = '.sbt{font:14px/1.5 "Noto Sans TC",system-ui,sans-serif}.sbt .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:8px 0}' +
    '.sbt .tile{border:3px solid var(--ink,#1e1e1e);border-radius:10px;padding:6px 10px;background:var(--panel,#fff)}.sbt .tile b{display:block;font-size:12px;color:var(--muted,#59656d)}.sbt .tile span{font-size:17px;font-weight:900}' +
    '.sbt .tile.warn{background:#fff3bf}.sbt .tile.bad{background:#ffc9c9}.sbt table{width:100%;border-collapse:collapse}.sbt th,.sbt td{border-bottom:2px solid var(--line,#cfd8de);padding:4px 6px;text-align:left}.sbt th{font-size:12px;color:var(--muted,#59656d)}' +
    '.sbt .strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.sbt .strip figure{margin:0;width:120px;font-size:11px}.sbt .strip img{width:120px;height:80px;object-fit:contain;border:2px solid var(--ink,#1e1e1e);border-radius:6px;background:#eef}' +
    '.sbt .bar{height:8px;background:#ddd;border-radius:4px;overflow:hidden;display:flex;width:100px}.sbt .bar i{display:block;height:100%}' +
    '.sbt button{font:inherit;font-weight:700;border:2px solid var(--ink,#1e1e1e);border-radius:8px;background:var(--yellow,#ffd43b);padding:1px 10px;cursor:pointer}';

  function ratioBar(a) {
    var n = a.cells || 1; return '<span class="bar" title="照抄 ' + a.copy + '・改寫 ' + a.rewrite + '・自己寫 ' + a.own + '"><i style="width:' + (a.copy / n * 100) + '%;background:#e03131"></i><i style="width:' + (a.rewrite / n * 100) + '%;background:#f59f00"></i><i style="width:' + (a.own / n * 100) + '%;background:#2f9e44"></i></span>';
  }
  function html(sum) {
    var t = sum.tiles.map(function (x, i) { var cls = i === 4 && sum.ops.mode !== 'normal' ? (sum.ops.mode === 'thumb' ? ' warn' : ' bad') : ''; return '<div class="tile' + cls + '"><b>' + esc(x.label) + '</b><span>' + esc(x.value) + '</span><div class="muted">' + esc(x.note) + '</div></div>'; }).join('');
    var rows = sum.rooms.map(function (r) {
      var info = SB.caseInfo(r.caseId), au = r.authors.map(function (a) { return '<div>' + esc(a.sid) + '　' + ratioBar(a) + ' ' + Math.round(a.avg * 100) + '%・' + esc(SB.bandText(a.band)) + '（' + a.cells + ' 格）</div>'; }).join('') || '<span class="muted">還沒有人寫</span>';
      return '<tr data-code="' + esc(r.code) + '"><td><b>' + esc(r.code) + '</b><div class="muted">' + (r.caseId ? esc(info.icon + ' ' + info.name) : '') + '</div></td><td>' + r.wall.filled + '／' + r.wall.cells + ' 格・' + r.wall.authors + ' 人共編</td><td>' + r.imgs + ' 張</td><td>' + r.mine + ' 份</td><td>' + au + '</td><td><button data-open="' + esc(r.code) + '">看縮圖</button></td></tr><tr class="det" data-det="' + esc(r.code) + '" hidden><td colspan="6"></td></tr>';
    }).join('');
    return '<div class="sbt"><style>' + CSS + '</style><h2>故事板與 Firebase 用量</h2><div class="muted">每小時更新（最後 ' + (sum.ops.known && sum.ops.stale === false ? '剛剛' : (sum.ops.known ? '超過 3 小時前' : '尚無')) + '）。免費方案不會扣款，超過上限資料庫會停用。</div><div class="tiles">' + t + '</div>' +
      '<h3>各房故事板</h3><table><thead><tr><th>房間</th><th>牆</th><th>圖片</th><th>個人板</th><th>學生編輯比例（紅照抄・橘改寫・綠自己寫）</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="muted">還沒有人開故事板</td></tr>') + '</tbody></table><p><button data-refresh="1">重新整理</button></p></div>';
  }

  function mount(el, opts) {
    opts = opts || {}; var store = ST.makeStore({ root: opts.root, opsRoot: opts.opsRoot, now: opts.now }), now = opts.now || Date.now, timer = null;
    function load() {
      var day = SB.dayKey(now()), res = { now: now() };
      return Promise.all([(opts.opsRoot || opts.root).child('sbops/usage').once('value'), store.getQuotaOnce(day), opts.root.child('sb').once('value')]).then(function (a) {
        res.ops = a[0] && a[0].val(); res.quota = a[1]; res.sb = a[2] && a[2].val(); res.rooms = typeof opts.rooms === 'function' ? opts.rooms() : [];
        var sum = summarize(res); el.innerHTML = html(sum); bind(); return sum;
      });
    }
    function bind() {
      el.onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.refresh) { load(); return; }
        if (b.dataset.open) {
          var code = b.dataset.open, row = el.querySelector('[data-det="' + code + '"]'); if (!row) return;
          if (!row.hidden) { row.hidden = true; return; }
          Promise.all([opts.root.child('sb/' + code).once('value'), opts.root.child('sbth/' + code).once('value')]).then(function (a) {
            var boards = a[0].val() || {}, th = a[1].val() || {}, out = '';
            Object.keys(boards).forEach(function (bk) {
              var cells = SB.normBoard(boards[bk]).cells;
              out += '<div><b>' + (bk === 'wall' ? '房間牆' : '個人板 ' + esc(bk.replace(/^u_/, ''))) + '</b><div class="strip">' + cells.map(function (c) {
                var t = th[bk] && th[bk][SB.slotKey(c.n)]; return '<figure>' + (t && t.d ? '<img alt="" src="' + esc(t.d) + '">' : '<div class="muted">（無圖）</div>') + '<figcaption>' + c.n + ' ' + esc(c.title) + (c.moment ? ' ★' : '') + '<br>' + esc(c.by || '') + (c.er ? '・' + Math.round(c.er.r * 100) + '%' : '') + (SB.needsSource(c) ? '・缺出處' : '') + '</figcaption></figure>';
              }).join('') + '</div></div>';
            });
            row.firstChild.innerHTML = out || '<span class="muted">沒有內容</span>'; row.hidden = false;
          });
        }
      };
    }
    var p = load(); timer = setInterval(load, 10 * 60 * 1000);   /* 10 分鐘一次，免得老師開著面板白白耗下載量 */
    return { reload: load, stop: function () { clearInterval(timer); }, ready: p };
  }
  return { mount: mount, summarize: summarize, html: html };
});
