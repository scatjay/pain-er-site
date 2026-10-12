/* 週次：星期一到星期日。週末非急診的單位休息（行政、志工、門診、批價窗口），急診照常運轉但人手少、病人反而多。純資料與純函式。
   dow：0＝星期一 … 6＝星期日。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_CALENDAR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var NAMES = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  var SHORT = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
  /* 週末不上班的角色（persona id）與休息的房間；急診醫師、護理師、警衛照常 */
  var WEEKEND_OFF = ['admin', 'volunteer', 'clinic_doctor'];
  var WEEKEND_QUIET_ROOMS = ['admin', 'lobby', 'service', 'clinic'];
  var WEEKEND_CAPTION = '週末：行政、志工、門診與批價窗口休息，只有急診在運轉，人手少、病人卻不少。';

  function weekend(dow) { return dow === 5 || dow === 6; }
  function valid(dow) { return dow === 0 || (dow > 0 && dow <= 6 && Math.floor(dow) === dow); }
  function fromDate(d) { var g = d.getDay(); return (g + 6) % 7; }       /* JS：0＝星期日 → 轉成 6 */
  function fromSeed(seed) { var h = 7, s = String(seed), i; for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % 7; }
  function info(dow) {
    if (!valid(dow)) throw new Error('星期要是 0 到 6：' + dow);
    var we = weekend(dow);
    return { dow: dow, name: NAMES[dow], short: SHORT[dow], weekend: we, off: we ? WEEKEND_OFF.slice() : [], quietRooms: we ? WEEKEND_QUIET_ROOMS.slice() : [],
      arrivalMult: we ? 1.3 : 1, staffNote: we ? WEEKEND_CAPTION : '' };
  }
  return { NAMES: NAMES, SHORT: SHORT, info: info, weekend: weekend, fromDate: fromDate, fromSeed: fromSeed };
});
