/* 疲勞與日夜反應：同一個人，早上、深夜、忙了一整天之後的樣子不同。純函式，確定性。
   level：0 精神、1 略累、2 很累、3 撐不住。影響：頭上的表情與動畫（想睡、慢）、碎念與口氣、訪談指令（Gemini 扮演時的狀態句）、可被訪談的程度。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_FATIGUE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LABEL = ['精神', '略累', '很累', '撐不住'];
  function mod(m) { m = m % 1440; return m < 0 ? m + 1440 : m; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  /* 晝夜節律的低谷：凌晨 02:00–06:00 最睏，午後 13:00–15:00 有一點睏 */
  function circadian(simMin) { var h = mod(simMin) / 60; if (h >= 2 && h < 6) return 1; if (h >= 0 && h < 2) return 0.6; if (h >= 6 && h < 7) return 0.4; if (h >= 13 && h < 15) return 0.35; if (h >= 22) return 0.5; return 0; }

  /* who：{ kind:'staff'|'patient'|'bot'|'incident', shiftStartMin（醫護上班的時間，預設 07:00＝420）, arrivedMin（病人到院時間）, age?:'elder'|'child'|'adult', busyRecent?:0–3（最近處理的突發事件數） }
     回傳 { level, score, label } */
  function level(who, simMin) {
    who = who || {}; var s = 0, m = mod(simMin);
    if (who.kind === 'staff' || who.kind === 'bot') {
      var start = who.shiftStartMin === undefined ? 420 : who.shiftStartMin, worked = mod(m - start) / 60;
      s += clamp(worked / 12, 0, 1) * 1.3;                        /* 上班越久越累，十二小時到頂 */
    } else if (who.kind === 'patient') {
      var waited = who.arrivedMin === undefined ? 0 : Math.max(0, mod(m - who.arrivedMin)) / 60;
      s += clamp(waited / 6, 0, 1) * 1.0 + (who.age === 'elder' ? 0.3 : 0) + (who.age === 'child' ? 0.2 : 0);
    }
    s += circadian(m) * 1.1 + clamp(who.busyRecent || 0, 0, 3) * 0.25;
    var lv = s >= 2.2 ? 3 : s >= 1.5 ? 2 : s >= 0.8 ? 1 : 0;
    return { level: lv, score: Math.round(s * 100) / 100, label: LABEL[lv] };
  }
  /* 角色繪圖的心情（chars.js 的 mood）：累了就想睡 */
  function mood(lv, base) { return lv >= 2 ? 'sleepy' : (base || 'idle'); }
  /* 動畫：越累越慢、晃得越小（倍率） */
  function animSpeed(lv) { return [1, 0.85, 0.65, 0.5][lv] || 1; }
  /* 訪談指令裡加的一句狀態 */
  function promptLine(lv, simMin) {
    var h = Math.floor(mod(simMin) / 60), night = h >= 22 || h < 6;
    var base = ['精神不錯，反應正常。', '有一點累，偶爾要想一下才回答。', '很累，回答比平常短，偶爾漏掉細節或重複同一句。', '快撐不住了，講話很慢、很短，容易分心或打哈欠，但真正重要的事還是會說。'][lv];
    return (night ? '現在是深夜，' : '') + base;
  }
  /* 碎念：累了加一句口頭禪（回傳 null 表示不加） */
  function mutterExtra(lv, simMin) { if (lv < 2) return null; var h = Math.floor(mod(simMin) / 60); return h >= 22 || h < 6 ? '好想睡……' : '（打哈欠）'; }
  /* 可被訪談的程度：撐不住時最多簡短回答 */
  function availabilityCap(lv, level0) { return lv >= 3 && level0 === 'free' ? 'short' : level0; }
  return { LABEL: LABEL, circadian: circadian, level: level, mood: mood, animSpeed: animSpeed, promptLine: promptLine, mutterExtra: mutterExtra, availabilityCap: availabilityCap };
});
