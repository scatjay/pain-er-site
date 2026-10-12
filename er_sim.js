(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_SIM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function hashSeed(seed) {
    var h = 2166136261, s = String(seed), i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function makeRandom(seed) {
    var state = hashSeed(seed);
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cloneArray(a) { return (a || []).slice(); }
  function copyObject(source) {
    var target = {}, key;
    if (source) for (key in source) if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
    return target;
  }

  function makeSim(seed, data, layout) {
    var random = makeRandom(seed), sim = data.SIM;
    var events = (data.EVENTS || []).map(function (src) {
      var start = src.fixed ? src.at[0] : src.at[0] + Math.floor(random() * (src.at[1] - src.at[0] + 1));
      return {
        id: src.id, title: src.title, start: start, end: start + src.dur, text: src.text,
        rooms: cloneArray(src.rooms), busy: cloneArray(src.busy),
        effects: copyObject(src.effects),
        sms: !!src.sms, spawn: src.spawn ? copyObject(src.spawn) : null
      };
    }).sort(function (a, b) { return a.start - b.start || String(a.id).localeCompare(String(b.id)); });

    function activeEvents(simMin) {
      return events.filter(function (e) { return e.start <= simMin && simMin < e.end; });
    }
    function busyIds(simMin) {
      var out = [], seen = {};
      activeEvents(simMin).forEach(function (e) {
        e.busy.forEach(function (id) { if (!seen[id]) { seen[id] = true; out.push(id); } });
      });
      return out;
    }
    function waitExtra(simMin) {
      return activeEvents(simMin).reduce(function (n, e) { return n + (Number(e.effects.waitExtra) || 0); }, 0);
    }
    function simMinAt(worldSec) { return Math.min(sim.END, sim.START + worldSec / sim.SECONDS_PER_SIM_MIN); }
    function worldSecAtSim(simMin) { return (simMin - sim.START) * sim.SECONDS_PER_SIM_MIN; }
    function formatSim(simMin) {
      var m = Math.floor(simMin) % 1440, hh = Math.floor(m / 60), mm = m % 60;
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }
    function pick(list) { return list[Math.floor(random() * list.length)]; }
    function pickWeighted(weights) {
      var total = 0, keys = Object.keys(weights), i, r;
      for (i = 0; i < keys.length; i++) total += Number(weights[keys[i]]);
      r = random() * total;
      for (i = 0; i < keys.length; i++) { r -= Number(weights[keys[i]]); if (r < 0) return Number(keys[i]); }
      return Number(keys[keys.length - 1]);
    }
    function poisson(lambda) {
      if (!(lambda > 0)) return 0;
      var limit = Math.exp(-lambda), k = 0, p = 1;
      do { k++; p *= random(); } while (p > limit);
      return k - 1;
    }

    var patients = [], generalSeq = 0, waitNo = 0, bayNo = 0;
    var named = data.NAMED_PATIENTS || [], mains = 0;
    function getRoute(esi) { return (data.ROUTES[esi] || data.ROUTES[3] || []).map(function (s) { return [s[0], s[1].slice(), s[2]]; }); }
    function routeForNamed(person) { return person.route ? person.route.map(function (s) { return [s[0], s[1].slice(), s[2]]; }) : getRoute(person.esi); }

    function buildSteps(route, esi, complaint, mood, appearSim) {
      var steps = [], elapsedSim = 0, i;
      for (i = 0; i < route.length; i++) {
        var raw = route[i], wp = raw[0], range = raw[1] || [0, 0], act = raw[2] || '';
        if (wp === 'AWAY') { steps.push({ wp: null, away: true, stay: 1e9, act: '離院' }); break; }
        if (wp === 'HOME') { steps.push({ wp: 'home-sofa', stay: 1e9, act: act || '在家' }); break; }
        if (wp === 'WAIT') { waitNo++; wp = 'wait-' + (((waitNo - 1) % 3) + 1); }
        else if (wp === 'BAY') { bayNo++; wp = 'bay-' + (((bayNo - 1) % 4) + 1); }
        else if (wp === 'CONSULT') wp = Number(esi) === 3 ? 'consultA-desk' : 'consultB-desk';
        if (typeof wp === 'string' && wp.charAt(wp.length - 1) === '?') {
          var key = wp, chance = data.OPTIONAL_STEP_CHANCE[key];
          if (chance === undefined || random() >= chance) continue;
          wp = wp.slice(0, -1);
        }
        var minStay = Math.ceil(Number(range[0]) || 0), maxStay = Math.floor(Number(range[1]) || 0);
        if (maxStay < minStay) maxStay = minStay;
        var staySim = minStay + Math.floor(random() * (maxStay - minStay + 1));
        if (String(raw[0]) === 'WAIT') staySim += waitExtra(appearSim + elapsedSim);
        elapsedSim += staySim;
        var bubbles = [];
        if (complaint) bubbles.push('主訴：' + complaint + '。');
        if (mood && bubbles.length < 2) bubbles.push('心情：' + mood + '。');
        steps.push({ wp: wp, stay: staySim * sim.SECONDS_PER_SIM_MIN, act: act, bubbles: bubbles });
      }
      return steps;
    }
    function patientRecord(fields, route) {
      var steps = buildSteps(route, fields.esi, fields.complaint, fields.mood, fields.appearSim);
      var id = fields.id;
      return {
        id: id, persona: fields.persona, name: fields.name, esi: fields.esi,
        complaint: fields.complaint, mood: fields.mood, phone: fields.phone,
        mode: fields.mode || 'walk-in', main: !!fields.main, appearSim: fields.appearSim,
        entity: { id: id, appearAt: worldSecAtSim(fields.appearSim), cycle: false, speed: 70, steps: steps }
      };
    }

    named.forEach(function (p, i) {
      if (p.main) mains++;
      var route = routeForNamed(p);
      patients.push(patientRecord({ id: 'named-' + p.persona, persona: p.persona, name: null, esi: p.esi,
        complaint: p.complaint, mood: null, phone: null, main: p.main, appearSim: p.appear }, route));
    });

    var profile = data.ARRIVAL_PROFILE || [], start = sim.START, hour;
    for (hour = 0; hour < profile.length; hour++) {
      var hourStart = start + hour * 60, count = poisson(profile[hour]), j;
      for (j = 0; j < count; j++) {
        generalSeq++;
        var esi = pickWeighted(data.ESI_WEIGHTS), matches = data.COMPLAINTS.filter(function (c) { return c.esi.indexOf(esi) >= 0; });
        var cp = pick(matches.length ? matches : data.COMPLAINTS);
        var appears = hourStart + Math.floor(random() * 60);
        var person = { id: 'p-' + (generalSeq < 10 ? '0' : '') + generalSeq, persona: null,
          name: '病患' + (generalSeq < 10 ? '0' : '') + generalSeq, esi: esi, complaint: cp.text,
          mood: pick(data.MOODS), phone: pick(data.PHONE_LEVELS), appearSim: appears };
        patients.push(patientRecord(person, getRoute(esi)));
      }
    }

    events.forEach(function (event) {
      if (!event.spawn) return;
      var spawn = event.spawn, count = Math.max(1, Math.floor(Number(spawn.count) || 1));
      for (var i = 0; i < count; i++) {
        var esi = Number(spawn.esi), route = [['amb-bay', [1, 1], '救護車到院']], base = getRoute(esi);
        var first = 0;
        while (first < base.length && base[first][0] !== 'BAY' && base[first][0] !== 'resus-1') first++;
        route = route.concat(base.slice(first));
        var id = 'amb-' + event.id + '-' + (i + 1);
        patients.push(patientRecord({ id: id, persona: null, name: '病患' + id, esi: esi,
          complaint: spawn.complaint || '急診病患', mood: null, phone: null, mode: 'ambulance',
          appearSim: event.start }, route));
      }
    });
    if (mains > 1) throw new Error('NAMED_PATIENTS 只能有一位 main 病患');
    patients.sort(function (a, b) { return a.appearSim - b.appearSim || String(a.id).localeCompare(String(b.id)); });

    function staffEntities(staffSchedules) {
      return (staffSchedules || []).map(function (schedule) {
        var steps = (schedule.steps || []).map(function (step) {
          var copy = copyObject(step);
          copy.stay = Number(step.stay) * sim.SECONDS_PER_SIM_MIN;
          if (step.bubbles) copy.bubbles = step.bubbles.slice();
          return copy;
        });
        return { id: schedule.id, steps: steps, speed: schedule.speed === undefined ? 70 : schedule.speed,
          appearAt: worldSecAtSim(schedule.appearSim === undefined ? sim.START : schedule.appearSim), cycle: true };
      });
    }
    function ticker(simMin, n) {
      var limit = n === undefined ? 5 : Math.max(0, Math.floor(n));
      return events.filter(function (e) { return e.start <= simMin; }).slice().sort(function (a, b) {
        return b.start - a.start || String(b.id).localeCompare(String(a.id));
      }).slice(0, limit).map(function (e) { return { time: formatSim(e.start), title: e.title, text: e.text }; });
    }
    return { simMinAt: simMinAt, worldSecAtSim: worldSecAtSim, formatSim: formatSim,
      events: events, activeEvents: activeEvents, busyIds: busyIds, waitExtra: waitExtra,
      patients: patients, staffEntities: staffEntities, ticker: ticker };
  }
  return { makeSim: makeSim };
});
