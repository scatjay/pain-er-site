(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_NPC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function keys(obj) { return Object.keys(obj || {}).sort(); }
  function distance(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function buildGraph(nav) {
    var nodes = {}, adj = {}, ids, i, edges, a, b, w, seen = {};
    nav = nav || { nodes: {}, edges: [] };
    ids = keys(nav.nodes);
    for (i = 0; i < ids.length; i++) {
      nodes[ids[i]] = { x: nav.nodes[ids[i]].x, y: nav.nodes[ids[i]].y, room: nav.nodes[ids[i]].room };
      adj[ids[i]] = [];
    }
    edges = nav.edges || [];
    for (i = 0; i < edges.length; i++) {
      a = edges[i][0]; b = edges[i][1];
      if (!own(nodes, a) || !own(nodes, b) || a === b) continue;
      w = distance(nodes[a], nodes[b]);
      if (!seen[a + '\u0000' + b]) {
        adj[a].push({ to: b, w: w }); adj[b].push({ to: a, w: w });
        seen[a + '\u0000' + b] = seen[b + '\u0000' + a] = true;
      }
    }
    for (i = 0; i < ids.length; i++) adj[ids[i]].sort(function (x, y) { return x.to < y.to ? -1 : (x.to > y.to ? 1 : 0); });
    return { nodes: nodes, adj: adj };
  }
  function pathLess(a, b) {
    var i, n = Math.min(a.length, b.length);
    for (i = 0; i < n; i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
    return a.length < b.length;
  }
  function shortestPath(graph, from, to) {
    var ids, dist = {}, paths = {}, done = {}, i, u, v, cand, nd, np, list;
    if (!graph || !graph.nodes || !own(graph.nodes, from) || !own(graph.nodes, to)) return null;
    if (from === to) return { ids: [from], length: 0 };
    ids = keys(graph.nodes);
    for (i = 0; i < ids.length; i++) dist[ids[i]] = Infinity;
    dist[from] = 0; paths[from] = [from];
    while (true) {
      u = null;
      for (i = 0; i < ids.length; i++) {
        v = ids[i];
        if (done[v] || dist[v] === Infinity) continue;
        if (u === null || dist[v] < dist[u] || (dist[v] === dist[u] && pathLess(paths[v], paths[u]))) u = v;
      }
      if (u === null) break;
      if (u === to) return { ids: paths[u].slice(), length: dist[u] };
      done[u] = true; list = graph.adj[u] || [];
      for (i = 0; i < list.length; i++) {
        v = list[i].to;
        if (done[v]) continue;
        nd = dist[u] + list[i].w; np = paths[u].concat([v]);
        if (nd < dist[v] || (nd === dist[v] && (!paths[v] || pathLess(np, paths[v])))) { dist[v] = nd; paths[v] = np; }
      }
    }
    return null;
  }
  function buildTimeline(entity, graph) {
    var e = entity || {}, steps = e.steps || [], appearAt = typeof e.appearAt === 'number' ? e.appearAt : 0;
    var speed = typeof e.speed === 'number' && e.speed > 0 ? e.speed : 70;
    var cycle = !!e.cycle, segments = [], clock = 0, currentWp = null, period = null, endsAt = null;
    function add(kind, duration, step, index, extra) {
      var seg = { kind: kind, t0: clock, t1: clock + duration, stepIndex: index,
        wp: step && step.wp != null ? step.wp : null, act: step && step.act != null ? step.act : '',
        bubbles: step && step.bubbles ? step.bubbles.slice() : [] };
      var k;
      if (extra) for (k in extra) if (own(extra, k)) seg[k] = extra[k];
      segments.push(seg); clock += duration;
      return seg;
    }
    function travel(from, to, step, index) {
      var route, poly = [], polyIds = [], j, node;
      if (to == null) return;
      if (from == null || !graph || !own(graph.nodes, from) || !own(graph.nodes, to)) {
        add('teleport', 0, step, index, { from: from, to: to }); return;
      }
      if (from === to) return;
      route = shortestPath(graph, from, to);
      if (!route) { add('teleport', 0, step, index, { from: from, to: to }); return; }
      if (route.length <= 0) return;
      for (j = 0; j < route.ids.length; j++) {
        node = graph.nodes[route.ids[j]]; poly.push([node.x, node.y]); polyIds.push(route.ids[j]);
      }
      add('move', route.length / speed, step, index, { polyline: poly, polylineIds: polyIds, from: from, to: to });
    }
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i] || {}, stay = typeof step.stay === 'number' && step.stay >= 0 ? step.stay : 0;
      if (step.away) {
        add('away', stay, step, i); currentWp = null;
      } else {
        if (i > 0 && step.wp !== currentWp) travel(currentWp, step.wp, step, i);
        currentWp = step.wp == null ? null : step.wp;
        add('idle', stay, step, i);
      }
    }
    if (!steps.length) { endsAt = 0; }
    else if (cycle) {
      var first = steps[0] || {}, last = steps[steps.length - 1] || {};
      if (last.away) currentWp = null;
      if (!first.away && first.wp !== currentWp) travel(currentWp, first.wp, first, 0);
      period = clock; endsAt = null;
    } else {
      endsAt = clock;
      if ((steps[steps.length - 1] || {}).stay >= 1e9) endsAt = Infinity;
    }
    return { entity: entity, segments: segments, period: period, endsAt: endsAt,
      appearAt: appearAt, speed: speed, cycle: cycle, graph: graph };
  }
  function pointOnMove(seg, elapsed, graph, speed) {
    var p = seg.polyline || [], total = 0, i, dx, dy, d, remain;
    if (!p.length) return { x: null, y: null };
    if (p.length === 1 || seg.t1 === seg.t0) return { x: p[p.length - 1][0], y: p[p.length - 1][1] };
    for (i = 1; i < p.length; i++) {
      dx = p[i][0] - p[i - 1][0]; dy = p[i][1] - p[i - 1][1]; total += Math.sqrt(dx * dx + dy * dy);
    }
    remain = Math.max(0, Math.min(total, (elapsed / (seg.t1 - seg.t0)) * total));
    for (i = 1; i < p.length; i++) {
      dx = p[i][0] - p[i - 1][0]; dy = p[i][1] - p[i - 1][1]; d = Math.sqrt(dx * dx + dy * dy);
      if (remain <= d || i === p.length - 1) {
        var f = d ? Math.min(1, remain / d) : 0;
        return { x: p[i - 1][0] + dx * f, y: p[i - 1][1] + dy * f };
      }
      remain -= d;
    }
    return { x: p[p.length - 1][0], y: p[p.length - 1][1] };
  }
  function positionAt(timeline, t) {
    var appear = timeline.appearAt, rel, s, i, wp, node, x, y, room = null, bubble = null;
    if (t < appear) return { state: 'unborn', x: null, y: null, room: null, wp: null, act: null, bubble: null, stepIndex: null };
    rel = t - appear;
    if (timeline.cycle && timeline.period > 0) rel = rel % timeline.period;
    else if (!timeline.cycle && rel >= timeline.endsAt) return { state: 'gone', x: null, y: null, room: null, wp: null, act: null, bubble: null, stepIndex: null };
    s = null;
    for (i = 0; i < timeline.segments.length; i++) {
      var candidate = timeline.segments[i];
      if (candidate.t1 > candidate.t0 && rel >= candidate.t0 && rel < candidate.t1) { s = candidate; break; }
    }
    if (!s && timeline.segments.length) {
      for (i = timeline.segments.length - 1; i >= 0; i--) if (timeline.segments[i].t1 > timeline.segments[i].t0 && rel >= timeline.segments[i].t0) { s = timeline.segments[i]; break; }
    }
    if (!s) return { state: 'gone', x: null, y: null, room: null, wp: null, act: null, bubble: null, stepIndex: null };
    if (s.kind === 'away') return { state: 'away', x: null, y: null, room: null, wp: null, act: s.act, bubble: null, stepIndex: s.stepIndex };
    if (s.kind === 'move') {
      var pt = pointOnMove(s, rel - s.t0, null, timeline.speed), best = Infinity, j, dx, dy, d;
      x = pt.x; y = pt.y;
      wp = s.from;
      for (j = 0; s.polyline && j < s.polyline.length; j++) {
        dx = s.polyline[j][0] - x; dy = s.polyline[j][1] - y; d = dx * dx + dy * dy;
        if (d < best) { best = d; wp = s.polylineIds ? s.polylineIds[j] : (j === 0 ? s.from : s.to); }
      }
      node = timeline.graph && timeline.graph.nodes[wp]; room = node ? node.room : null;
    } else {
      wp = s.wp; node = timeline.graph && wp != null ? timeline.graph.nodes[wp] : null;
      x = node ? node.x : null; y = node ? node.y : null; room = node ? node.room : null;
      if (s.bubbles && s.bubbles.length) bubble = s.bubbles[Math.floor((rel - s.t0) / 8) % s.bubbles.length];
    }
    return { state: s.kind, x: x, y: y, room: room, wp: wp, act: s.act, bubble: bubble, stepIndex: s.stepIndex };
  }
  function availability(avail, pos, busyByEvent) {
    avail = avail || {}; pos = pos || {};
    if (pos.state === 'unborn' || pos.state === 'gone' || pos.state === 'away') return { level: 'blocked', reason: '不在場' };
    if (busyByEvent) return { level: avail.eventBlocks ? 'blocked' : 'short', reason: '正在處理突發狀況' };
    if (pos.state === 'move') return { level: avail.moving || 'short', reason: '正在走動' };
    if (avail.acts && own(avail.acts, pos.act)) return { level: avail.acts[pos.act], reason: '正在' + pos.act };
    return { level: 'free', reason: '' };
  }
  return { buildGraph: buildGraph, shortestPath: shortestPath, buildTimeline: buildTimeline,
    positionAt: positionAt, availability: availability };
});
