(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_LOGIC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function copyObject(obj) {
    var result = {};
    var key;
    if (!obj || typeof obj !== 'object') return result;
    for (key in obj) if (Object.prototype.hasOwnProperty.call(obj, key)) result[key] = obj[key];
    return result;
  }

  function mergeElements(local, remote) {
    var result = [];
    var indexes = {};
    var i;
    var element;
    var current;
    var winner;
    function keyFor(id) { return '$' + String(id); }
    for (i = 0; i < local.length; i += 1) {
      element = local[i];
      indexes[keyFor(element.id)] = result.length;
      result.push(element);
    }
    for (i = 0; i < remote.length; i += 1) {
      element = remote[i];
      var key = keyFor(element.id);
      if (Object.prototype.hasOwnProperty.call(indexes, key)) {
        current = result[indexes[key]];
        winner = element.version > current.version ||
          (element.version === current.version && element.versionNonce < current.versionNonce) ? element : current;
        result[indexes[key]] = winner;
      } else {
        indexes[key] = result.length;
        result.push(element);
      }
    }
    return result;
  }

  function restoreBase(current, canonical, rnd) {
    var elements = current.slice();
    var currentById = {};
    var changed = false;
    var i;
    var element;
    var base;
    var existing;
    var invalid;
    for (i = 0; i < current.length; i += 1) currentById['$' + String(current[i].id)] = current[i];
    for (i = 0; i < canonical.length; i += 1) {
      base = canonical[i];
      if (!base.customData || base.customData.base !== true) continue;
      existing = currentById['$' + String(base.id)];
      invalid = !existing || existing.isDeleted === true || existing.x !== base.x || existing.y !== base.y ||
        existing.width !== base.width || existing.height !== base.height ||
        (Object.prototype.hasOwnProperty.call(base, 'text') && existing.text !== base.text) || existing.locked !== true;
      if (invalid) {
        element = copyObject(base);
        element.version = Math.max(existing && typeof existing.version === 'number' ? existing.version : 0,
          typeof base.version === 'number' ? base.version : 0) + 1;
        element.versionNonce = Math.floor(rnd() * 2147483647);
        if (existing) {
          for (var j = 0; j < elements.length; j += 1) {
            if (String(elements[j].id) === String(base.id)) { elements[j] = element; break; }
          }
        } else elements.push(element);
        currentById['$' + String(base.id)] = element;
        changed = true;
      }
    }
    return { elements: elements, changed: changed };
  }

  function markerText(element) {
    if (typeof element.text === 'string') return element.text;
    if (typeof element.label === 'string') return element.label;
    if (element.label && typeof element.label.text === 'string') return element.label.text;
    return '';
  }

  function markerSequence(id) {
    var match = String(id).match(/^#(\d+)-(\d+)$/);
    return match ? [parseInt(match[1], 10), parseInt(match[2], 10)] : [Number.MAX_SAFE_INTEGER || 9007199254740991, String(id)];
  }

  function listMarkers(elements) {
    var markers = [];
    var i;
    var element;
    var data;
    for (i = 0; i < elements.length; i += 1) {
      element = elements[i];
      if (element.isDeleted === true || !element.customData || !element.customData.marker) continue;
      data = element.customData.marker;
      /* 標記編號存在 customData.marker.id（例如 #12-01）；舊格式（編號直接當元素 id）仍可讀 */
      var entry = { id: data.id !== undefined ? data.id : element.id, type: data.type !== undefined ? data.type : element.type, author: data.author, round: data.round,
        text: markerText(element), clueId: data.clueId };
      if (Array.isArray(data.refs)) entry.refs = data.refs.slice();
      markers.push(entry);
    }
    markers.sort(function (a, b) {
      var aa = markerSequence(a.id);
      var bb = markerSequence(b.id);
      if (aa[0] !== bb[0]) return aa[0] < bb[0] ? -1 : 1;
      if (aa[1] !== bb[1]) return aa[1] < bb[1] ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
    });
    return markers;
  }

  function nextMarkerId(env, elements) {
    var max = 0;
    var prefix = '#' + String(env) + '-';
    var i;
    var id;
    var match;
    for (i = 0; i < elements.length; i += 1) {
      id = (elements[i].customData && elements[i].customData.marker && elements[i].customData.marker.id !== undefined)
        ? String(elements[i].customData.marker.id) : String(elements[i].id);
      if (id.indexOf(prefix) !== 0) continue;
      match = id.slice(prefix.length).match(/^(\d+)$/);
      if (match && parseInt(match[1], 10) > max) max = parseInt(match[1], 10);
    }
    return prefix + (max + 1 < 10 ? '0' : '') + String(max + 1);
  }

  function validateConclusions(conclusions, markerIds) {
    var errors = [];
    var validDirections = ['簡訊改呈現', 'LINE官方帳號', '醫院App', '其他'];
    var i;
    var j;
    var item;
    if (!Array.isArray(conclusions) || conclusions.length < 1) {
      errors.push({ index: -1, field: 'conclusions', msg: '至少需要一項結論' });
      return { ok: false, errors: errors };
    }
    for (i = 0; i < conclusions.length; i += 1) {
      item = conclusions[i] || {};
      if (typeof item.text !== 'string' || item.text.trim() === '') errors.push({ index: i, field: 'text', msg: '不可為空' });
      if (!Array.isArray(item.refs) || item.refs.length < 1) errors.push({ index: i, field: 'refs', msg: '至少需要一個標記' });
      else {
        for (j = 0; j < item.refs.length; j += 1) {
          if (markerIds.indexOf(item.refs[j]) === -1) errors.push({ index: i, field: 'refs', msg: '標記 ' + item.refs[j] + ' 不存在' });
        }
      }
      if (typeof item.tradeoff !== 'string' || item.tradeoff.trim() === '') errors.push({ index: i, field: 'tradeoff', msg: '不可為空' });
      if (validDirections.indexOf(item.direction) === -1) errors.push({ index: i, field: 'direction', msg: '方向無效' });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function uniqueCount(items) {
    var seen = {};
    var count = 0;
    var i;
    for (i = 0; i < items.length; i += 1) {
      var key = '$' + String(items[i]);
      if (!Object.prototype.hasOwnProperty.call(seen, key)) { seen[key] = true; count += 1; }
    }
    return count;
  }

  function bonusFor(stats, config) {
    var rooms = uniqueCount(stats.rooms || []);
    var replays = uniqueCount(stats.replays || []);
    return { rooms: rooms, replays: replays,
      points: Math.min(config.cap, rooms * config.perRoom + replays * config.perReplay) };
  }

  function replayEligible(info) {
    var room = info.room;
    var phases = room.snapshotPhases || [];
    var viewed = info.viewedPhases || [];
    var i;
    if (!room.submitted || Object.prototype.hasOwnProperty.call(room.members || {}, String(info.env)) || phases.length === 0) return false;
    for (i = 0; i < phases.length; i += 1) if (viewed.indexOf(phases[i]) === -1) return false;
    return true;
  }

  function registerReplay(stats, code, eligible) {
    var replays = (stats.replays || []).slice();
    if (eligible && replays.indexOf(code) === -1) replays.push(code);
    return { rooms: (stats.rooms || []).slice(), replays: replays };
  }

  function registerRoomDone(stats, code, markerCountByAuthor, env) {
    var rooms = (stats.rooms || []).slice();
    if (markerCountByAuthor && markerCountByAuthor[env] >= 1 && rooms.indexOf(code) === -1) rooms.push(code);
    return { rooms: rooms, replays: (stats.replays || []).slice() };
  }

  function sceneCenter(appState) {
    return { x: -appState.scrollX + appState.width / (2 * appState.zoom.value),
      y: -appState.scrollY + appState.height / (2 * appState.zoom.value) };
  }

  function hashElements(elements) {
    var parts = [];
    var i;
    for (i = 0; i < elements.length; i += 1) {
      parts.push(elements[i].id + ':' + elements[i].version + ':' + (elements[i].isDeleted ? 1 : 0));
    }
    return parts.join('|');
  }

  return { mergeElements: mergeElements, restoreBase: restoreBase, listMarkers: listMarkers,
    nextMarkerId: nextMarkerId, validateConclusions: validateConclusions, bonusFor: bonusFor,
    replayEligible: replayEligible, registerReplay: registerReplay, registerRoomDone: registerRoomDone,
    sceneCenter: sceneCenter, hashElements: hashElements };
});
