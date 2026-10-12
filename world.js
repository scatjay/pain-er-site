/* 世界：把一個案例、全部角色、行程、事件、病患流、鬧事腳本與「模擬同學」組成一個可以依時間查詢的世界。
   純邏輯（可在 Node 測試）。時間用世界秒（真實經過的秒數）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_WORLD = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var IS_NODE = typeof module === 'object' && module.exports;
  function defaultMods() {
    if (IS_NODE) {
      var ERG = (function () { global.window = global.window || {}; require('./content.js'); return global.window.ERG; })();
      var m = { ERG: ERG, LAYOUT: require('./layout.js'), DATA: require('./er_data.js'), PER: require('./personas.js'), COMIC: require('./comic.js'),
                NPC: require('./npc_sim.js'), SIM: require('./er_sim.js'), CASES: require('./cases.js'), CARDS: require('./cards.js') };
      return m;
    }
    var g = self;
    return { ERG: g.ERG, LAYOUT: g.ERG_LAYOUT, DATA: g.ERG_DATA, PER: g.ERG_PERSONAS, COMIC: g.ERG_COMIC, NPC: g.ERG_NPC, SIM: g.ERG_SIM, CASES: g.ERG_CASES, CARDS: g.ERG_CARDS };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hash(str) { var h = 7; for (var i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0; return h; }
  function makeRng(seedStr) { var s = hash(seedStr) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }

  var GENERIC_LAYERS = {
    surface: '這個我不太清楚，不是我負責的。',
    events: ['我今天一直忙自己的事，沒特別注意這個。', '你可以去問問更相關的人。'],
    need: '我沒有特別的意見，我只想把手上的事做好。' };

  function makeWorld(opts) {
    var M = opts.mods || defaultMods();
    var ERG = M.ERG, LAYOUT = M.LAYOUT, DATA = M.DATA, PER = M.PER, COMIC = M.COMIC, NPC = M.NPC, SIMM = M.SIM;
    var FAT = IS_NODE ? require('./fatigue.js') : self.ERG_FATIGUE;
    var CASES = M.CASES.build(ERG, LAYOUT, PER, DATA);
    var c = CASES.get(opts.caseId || 'sms'), isSms = c.meta.id === 'sms', seed = String(opts.seed || 'ERG');
    var rnd = makeRng(seed + ':world');

    /* ── 角色 ── */
    var personas = {}, override = c.layersOverride || {};
    PER.PERSONAS.forEach(function (p0) {
      var p = clone(p0);
      if (!isSms) {
        if (override[p.id]) { p.layers = clone(override[p.id]); p.core = true; if (p.tangent === undefined) delete p.tangent; }
        else if (p.core) { p.core = false; p.tangent = '無'; p.layers = clone(GENERIC_LAYERS); }
        else if (/簡訊|通知/.test(JSON.stringify(p.layers))) { p.layers = clone(GENERIC_LAYERS); p.tangent = '無'; }
      }
      personas[p.id] = p;
    });
    (c.personas || []).forEach(function (p0) { personas[p0.id] = clone(p0); });

    /* ── 資料（事件與具名病患依案例調整） ── */
    var shift = opts.shift === 'night' ? 'night' : 'day';
    var data = clone(DATA.forShift ? DATA.forShift(shift) : DATA);
    /* 週次：沒指定就由房間代碼決定；週末非急診單位休息、病人較多 */
    var CAL = IS_NODE ? require('./calendar.js') : self.ERG_CALENDAR;
    var dow = opts.dow !== undefined ? Number(opts.dow) : CAL.fromSeed(seed), day = CAL.info(dow);
    if (day.arrivalMult !== 1 && data.ARRIVAL_PROFILE) data.ARRIVAL_PROFILE = data.ARRIVAL_PROFILE.map(function (x) { return Math.round(x * day.arrivalMult * 10) / 10; });
    if (shift === 'day') data.EVENTS = DATA.EVENTS.filter(function (e) { return isSms || !e.sms; }).concat(clone(c.events || []));
    var baseNamed = clone(data.NAMED_PATIENTS);
    if (!isSms) baseNamed = baseNamed.filter(function (n) { return n.persona !== 'patient'; });
    data.NAMED_PATIENTS = baseNamed.concat(clone(c.named || []));
    /* 路線停留時間可以寫單一數字，er_sim 需要 [最短,最長]，這裡正規化 */
    data.NAMED_PATIENTS.forEach(function (n) { if (n.route) n.route = n.route.map(function (st) { return [st[0], typeof st[1] === 'number' ? [st[1], st[1]] : st[1], st[2]]; }); });
    var layout = Object.assign({}, LAYOUT, { PINS: c.clues.map(function (q) { return { clue: q.id, room: q.pin.room, rx: q.pin.rx, ry: q.pin.ry }; }) });

    var sim = SIMM.makeSim(seed + ':' + shift, data, LAYOUT);
    var graph = NPC.buildGraph(LAYOUT.nav());

    /* ── 實體 ── */
    var entities = [], hideIntervals = [];
    function addEnt(e) { e.timeline = NPC.buildTimeline(e.entity, graph); entities.push(e); return e; }
    function toStep(st, withBubbles) {
      var away = st[0] === 'AWAY';
      var o = { wp: away ? null : st[0], stay: st[1], act: st[2] };
      if (away) o.away = true;
      return o;
    }

    var schedules = {}, selectedSchedules = shift === 'night' ? (PER.NIGHT_STAFF_SCHEDULES || {}) : PER.STAFF_SCHEDULES;
    Object.keys(selectedSchedules).forEach(function (k) { schedules[k] = selectedSchedules[k]; });
    if (shift === 'day') Object.keys(c.schedules || {}).forEach(function (k) { schedules[k] = c.schedules[k]; });
    var staffList = Object.keys(schedules).filter(function (pid) { return personas[pid]; }).map(function (pid) { return { id: 'staff:' + pid, steps: schedules[pid].map(toStep) }; });
    sim.staffEntities(staffList).forEach(function (en, i) {
      var pid = staffList[i].id.slice(6), p = personas[pid];
      addEnt({ id: en.id, kind: 'staff', pid: pid, persona: p, name: p.name, look: p.look, entity: en, shiftStartMin: data.SIM.START,
               mutters: (c.mutters && c.mutters[pid]) || COMIC.MUTTERS[pid] || [] });
    });

    sim.patients.forEach(function (pt) {
      var p = pt.persona ? personas[pt.persona] : null;
      if (pt.persona && !p) return;
      if (!p) { p = PER.genericPersona(pt, rnd); personas[p.id] = p; }
      pt.name = p.name;
      addEnt({ id: 'pt:' + pt.id, kind: 'patient', pid: p.id, persona: p, name: p.name, look: p.look, entity: pt.entity, patient: pt, arrivedMin: pt.appearSim,
               mutters: (c.mutters && c.mutters[p.id]) || COMIC.MUTTERS[p.id] || COMIC.genericMutters(pt) });
    });

    /* 鬧事腳本：鬧事者與警衛支援一起離開（走相同路徑，視覺上被架走）；事件期間原本的警衛暫時隱藏 */
    data.EVENTS.filter(function (ev) { return ev.incident; }).forEach(function (ev) {
      var se = sim.events.filter(function (x) { return x.id === ev.id; })[0]; if (!se) return;
      var inc = ev.incident, rp = personas[inc.rowdy.persona], gp = personas[inc.guard.persona];
      if (!rp || !gp) return;
      var rowdyEnt = { id: 'inc:' + ev.id + ':rowdy', steps: inc.rowdy.steps.map(function (s) { var o = toStep(s); o.stay = s[1] * 5; if (o.away) o.stay = 1e9; return o; }),
                       appearAt: sim.worldSecAtSim(se.start - inc.rowdy.before), cycle: false, speed: 70 };
      var rtl = NPC.buildTimeline(rowdyEnt, graph), bangEnd = null, hold = 2 * 5, tpath = NPC.shortestPath(graph, 'guard-desk', 'triage-desk');
      for (var i = 0; i + 1 < rtl.segments.length; i++) {
        var sg = rtl.segments[i], nx = rtl.segments[i + 1];
        if (sg.kind === 'idle' && nx.kind === 'move' && /被/.test((rowdyEnt.steps[nx.stepIndex] || {}).act || '')) { bangEnd = rowdyEnt.appearAt + sg.t1; break; }
      }
      if (bangEnd === null) return;
      var travel = tpath ? tpath.length / 70 : 20;
      var gStart = bangEnd - hold - travel;
      var guardEnt = { id: 'inc:' + ev.id + ':guard', appearAt: gStart, cycle: false, speed: 70,
        steps: inc.guard.steps.map(function (s) { var o = toStep(s); o.stay = s[1] * 5; return o; }) };
      guardEnt.steps[1].stay = hold;   /* 在鬧事者旁邊停到他被帶走的那一刻 */
      var gtl = NPC.buildTimeline(guardEnt, graph);
      addEnt({ id: rowdyEnt.id, kind: 'incident', pid: rp.id, persona: rp, name: rp.name, look: rp.look, entity: rowdyEnt,
               mutters: COMIC.MUTTERS[rp.id] || [], escortWith: guardEnt.id, eventId: ev.id });
      addEnt({ id: guardEnt.id, kind: 'incident', pid: gp.id, persona: gp, name: inc.guard.label || gp.name, look: gp.look, entity: guardEnt,
               mutters: COMIC.SHOCK.slice(0, 3), escortWith: rowdyEnt.id, eventId: ev.id });
      var gEnd = guardEnt.appearAt + (gtl.endsAt === Infinity ? 600 : gtl.endsAt);
      (inc.hide || []).forEach(function (h) { hideIntervals.push({ pid: h, t0: gStart - 1, t1: gEnd + 1 }); });
    });

    /* 模擬同學：循環在重點房間之間走動、讀線索、記筆記 */
    var focusStations = LAYOUT.STATIONS.filter(function (s) { return (c.meta.roomsFocus || []).indexOf(s.room) >= 0 && s.room !== 'home' && s.room !== 'clinic'; }).map(function (s) { return s.id; });
    if (!focusStations.length) focusStations = ['entrance-mid', 'wait-1', 'nurse-desk'];
    var acts = ['閱讀線索', '記筆記', '跟人聊聊', '東張西望'];
    var enums = { head: ['egg', 'pear', 'square'], hair: ['bald', 'tuft', 'curl', 'cap'], eyes: ['dots', 'droopy', 'spiral'], mouth: ['flat', 'frown', 'open'] };
    var botN = opts.bots === undefined ? 6 : opts.bots;
    for (var b = 0; b < botN; b++) {
      var steps = [], k, n = 6 + Math.floor(rnd() * 3);
      for (k = 0; k < n; k++) steps.push({ wp: focusStations[Math.floor(rnd() * focusStations.length)], stay: 4 + Math.floor(rnd() * 5), act: acts[Math.floor(rnd() * acts.length)] });
      var bname = COMIC.BOT_NAMES[b % COMIC.BOT_NAMES.length];
      var bp = { id: 'bot' + b, name: '模擬同學·' + bname, title: '模擬同學（程式模擬的 NPC，不是真人）', core: false, material: '模擬', decision: false,
        look: { skin: ['#f1d6b8', '#f3c9a5', '#e8c7a1'][b % 3], outfit: '#e7f5ff', head: enums.head[b % 3], hair: enums.hair[b % 4], eyes: enums.eyes[(b + 1) % 3], mouth: enums.mouth[(b + 2) % 3], prop: 'clipboard' },
        layers: clone(GENERIC_LAYERS), speech: '正在調查，隨口回答。', bio: '另一組的同學。', knows: [], unknown: [],
        reactions: { leading: '你說什麼他都點頭。', jargon: '他也不太懂。', repeat: '會問你是不是沒聽清楚。', sensitive: '無。', rapport: '你分享你的發現，他也會分享。' },
        avail: { moving: 'free', acts: {}, eventBlocks: false }, idle: [] };
      personas[bp.id] = bp;
      var en = sim.staffEntities([{ id: 'bot:' + b, steps: steps }])[0];
      addEnt({ id: en.id, kind: 'bot', pid: bp.id, persona: bp, name: bp.name, look: bp.look, entity: en, shiftStartMin: data.SIM.START, mutters: COMIC.BOT_MUTTERS });
    }

    day.off.forEach(function (pid) { hideIntervals.push({ pid: pid, t0: -1, t1: 1e9 }); });   /* 週末休息的人整天不在 */

    /* ── 查詢 ── */
    function hidden(ent, t) { return hideIntervals.some(function (h) { return h.pid === ent.pid && ent.kind === 'staff' && t >= h.t0 && t <= h.t1; }); }
    function at(t) {
      var out = [];
      entities.forEach(function (ent) {
        if (hidden(ent, t)) return;
        var pos = NPC.positionAt(ent.timeline, t);
        if (pos.state === 'unborn' || pos.state === 'gone' || pos.state === 'away') return;
        out.push({ ent: ent, pos: pos });
      });
      return out;
    }
    function availability(ent, pos, simMin) {
      var busy = sim.busyIds(simMin).indexOf(ent.pid) >= 0;
      var av = NPC.availability(ent.persona.avail || { moving: 'short', acts: {}, eventBlocks: false }, pos, busy);
      if (FAT) { var who = ent.kind === 'patient' ? { kind:'patient', arrivedMin:ent.arrivedMin, age:/elder/.test(ent.pid) ? 'elder' : (/toddler|teen/.test(ent.pid) ? 'child' : 'adult') } : { kind:ent.kind === 'bot' ? 'bot' : 'staff', shiftStartMin:ent.shiftStartMin, busyRecent:busy ? 1 : 0 }; var fl = FAT.level(who, simMin); av.fatigue = fl; av.level = FAT.availabilityCap(fl.level, av.level); }
      return av;
    }
    function mutterFor(ent, pos, t) { var m = COMIC.mutterAt(ent.mutters, ent.id, t); if (!m || !FAT) return m; var now = data.SIM.START + t / data.SIM.SECONDS_PER_SIM_MIN, who = ent.kind === 'patient' ? { kind:'patient', arrivedMin:ent.arrivedMin } : { kind:ent.kind === 'bot' ? 'bot' : 'staff', shiftStartMin:ent.shiftStartMin }; var extra = FAT.mutterExtra(FAT.level(who, now).level, now); return extra ? { kind:m.kind, text:m.text + ' ' + extra } : m; }
    function entityById(id) { for (var i = 0; i < entities.length; i++) if (entities[i].id === id) return entities[i]; return null; }
    function captionFor(roomId) { return (c.captions && c.captions[roomId]) || COMIC.CAPTIONS[roomId] || ''; }

    return { day: day, shift: shift, case: c, cases: CASES, meta: c.meta, seed: seed, sim: sim, graph: graph, layout: layout, data: data, personas: personas, clues: c.clues,
             entities: entities, hideIntervals: hideIntervals, at: at, availability: availability, mutterFor: mutterFor, entityById: entityById, captionFor: captionFor };
  }

  return { makeWorld: makeWorld, defaultMods: defaultMods };
});
