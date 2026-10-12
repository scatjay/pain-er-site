/* 急診室平面圖資料（不求寫實，但要有空間感：牆、門、家具、走道、線索釘、NPC 路網）。
   座標單位是場景座標。房間的家具與站位用「房間內相對座標」(rx, ry)，以房間左上角為原點。
   類型：hall＝走道（不畫牆）、room＝有牆的房間、outside＝戶外（不畫牆）、remote＝地圖外的另一個地點（用傳送連結到達）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_LAYOUT = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var WALL = 6;

  var ROOMS = [
    { id:'consultA',  name:'診察室一',        type:'room',    x:0,    y:290,   w:280, h:220, color:'#ebfbee', step:3,
      doors:[{ side:'N', at:0.5, w:64 }, { side:'S', at:0.5, w:64 }] },
    { id:'consultB',  name:'診察室二',        type:'room',    x:280,  y:290,   w:280, h:220, color:'#ebfbee',
      doors:[{ side:'N', at:0.5, w:64 }, { side:'S', at:0.5, w:64 }] },
    { id:'bays',      name:'治療區',          type:'room',    x:680,  y:0,   w:520, h:220, color:'#e7f5ff',
      doors:[{ side:'S', at:0.5, w:120 }] },
    { id:'ct',        name:'檢查室（斷層）',   type:'room',    x:1200, y:0,   w:420, h:220, color:'#f3f0ff', step:4,
      doors:[{ side:'S', at:0.3, w:64 }] },
    { id:'corridor',  name:'主要走道',        type:'hall',    x:0,    y:220, w:1700, h:70, color:'#f8f9fa' },

    { id:'waiting',   name:'候診區',          type:'room',    x:0,    y:560, w:480, h:220, color:'#fff4e6', step:2,
      doors:[{ side:'N', at:0.5, w:80 }, { side:'S', at:0.5, w:80 }] },
    { id:'nurse',     name:'護理站',          type:'room',    x:560,  y:290, w:380, h:220, color:'#fff0f6', step:5,
      doors:[{ side:'N', at:0.5, w:80 }, { side:'S', at:0.5, w:80 }] },
    { id:'resus',     name:'急救室',          type:'room',    x:940,  y:290, w:320, h:220, color:'#ffe3e3',
      doors:[{ side:'N', at:0.5, w:80 }, { side:'S', at:0.5, w:80 }] },
    { id:'staff',     name:'醫護休息室',      type:'room',    x:0, y:0, w:320, h:220, color:'#f1f3f5',
      doors:[{ side:'S', at:0.5, w:64 }] },
    { id:'hall2',     name:'中央走道',        type:'hall',    x:0,    y:510, w:1580, h:50,  color:'#f8f9fa' },

    { id:'entrance',  name:'入口大廳',        type:'room',    x:0,    y:830, w:320, h:220, color:'#e7f5ff', step:1,
      doors:[{ side:'N', at:0.5, w:80 }, { side:'S', at:0.5, w:100 }] },
    { id:'triage',    name:'檢傷櫃台',        type:'room',    x:320,  y:830, w:300, h:220, color:'#fff9db',
      doors:[{ side:'N', at:0.5, w:80 }] },
    { id:'discharge', name:'離院說明與批價',   type:'room',    x:920,  y:830, w:320, h:220, color:'#fff0f6',
      doors:[{ side:'N', at:0.5, w:80 }, { side:'S', at:0.5, w:80 }] },
    { id:'restroom',  name:'洗手間',          type:'room',    x:480,  y:560, w:200, h:220, color:'#f1f3f5',
      doors:[{ side:'N', at:0.5, w:56 }, { side:'S', at:0.5, w:56 }] },
    { id:'admin',     name:'院方行政辦公室',   type:'room',    x:320, y:0, w:360, h:220, color:'#f1f3f5',
      doors:[{ side:'S', at:0.5, w:64 }] },

    /* 東翼（第二輪擴建）：兒科、觀察、藥局、家屬、掛號批價大廳、服務台 */
    { id:'ped',       name:'兒科診察室',      type:'room',    x:680, y:560,   w:300, h:220, color:'#fff0f6',
      doors:[{ side:'N', at:0.5, w:64 }, { side:'S', at:0.5, w:64 }] },
    { id:'obs',       name:'觀察室',          type:'room',    x:1260, y:290,   w:300, h:220, color:'#e7f5ff',
      doors:[{ side:'N', at:0.5, w:64 }, { side:'S', at:0.5, w:64 }] },
    { id:'pharmacy',  name:'藥局領藥',        type:'room',    x:1240, y:830, w:340, h:220, color:'#ebfbee',
      doors:[{ side:'N', at:0.5, w:80 }, { side:'S', at:0.5, w:80 }] },
    { id:'family',    name:'家屬等候區',      type:'room',    x:1280, y:560, w:300, h:220, color:'#fff4e6',
      doors:[{ side:'N', at:0.5, w:64 }, { side:'S', at:0.5, w:64 }] },
    { id:'lobby',     name:'掛號批價大廳',    type:'room',    x:620, y:830, w:300, h:220, color:'#fff9db',
      doors:[{ side:'N', at:0.5, w:80 }, { side:'S', at:0.5, w:80 }] },
    { id:'service',   name:'服務台（探病登記）', type:'room',  x:980, y:560, w:300, h:220, color:'#f3f0ff',
      doors:[{ side:'N', at:0.5, w:64 }, { side:'S', at:0.5, w:64 }] },

    { id:'hall3',     name:'前廳走道',        type:'hall',    x:0,    y:780, w:1580, h:50,  color:'#f8f9fa' },
    { id:'ambulance', name:'救護車道',        type:'outside', x:1580, y:510, w:120, h:540, color:'#e9ecef' },
    { id:'street',    name:'院外（街道）',    type:'outside', x:0,    y:1050, w:1700, h:100, color:'#e9ecef' },

    { id:'notebook',  name:'調查筆記本',      type:'remote',  x:0,    y:1230, w:1700, h:700, color:'#ffffff' },
    { id:'home',      name:'病患的家（手機）', type:'remote',  x:1800, y:0,   w:420, h:380, color:'#fff9db', step:6 },
    { id:'clinic',    name:'回診門診',        type:'remote',  x:1800, y:420, w:420, h:360, color:'#e6fcf5', step:7 }
  ];

  /* 傳送連結（地圖外地點）：from → to，label 是按鈕文字 */
  var LINKS = [
    { from:'street', to:'home',   label:'搭公車回家' },
    { from:'street', to:'clinic', label:'隔天回診' },
    { from:'home',   to:'street', label:'回到急診門口' },
    { from:'clinic', to:'street', label:'回到急診門口' }
  ];

  /* 家具：type 決定畫法。shape 由 floorplan.js 依 type 產生（矩形／圓／線）。 */
  var FURNITURE = [
    /* 入口大廳 */
    { room:'entrance', type:'desk',   label:'警衛櫃台', rx:20,  ry:130, w:110, h:50 },
    { room:'entrance', type:'sign',   label:'看診／探病 分流', rx:150, ry:16, w:140, h:34 },
    { room:'entrance', type:'chair',  label:'輪椅', rx:230, ry:140, w:44, h:44 },
    { room:'entrance', type:'door',   label:'自動門', rx:110, ry:206, w:100, h:8 },
    /* 檢傷 */
    { room:'triage',   type:'counter',label:'檢傷櫃台', rx:30,  ry:50,  w:240, h:46 },
    { room:'triage',   type:'device', label:'血壓計', rx:30,  ry:120, w:52, h:40 },
    { room:'triage',   type:'device', label:'警民連線鈴', rx:100, ry:120, w:70, h:30 },
    { room:'triage',   type:'screen', label:'叫號螢幕', rx:180, ry:10, w:100, h:28 },
    { room:'triage',   type:'chair',  label:'', rx:200, ry:130, w:36, h:36 },
    /* 候診區 */
    { room:'waiting',  type:'seats',  label:'候診椅', rx:30,  ry:110, w:200, h:34 },
    { room:'waiting',  type:'seats',  label:'候診椅', rx:30,  ry:160, w:200, h:34 },
    { room:'waiting',  type:'seats',  label:'候診椅', rx:260, ry:110, w:160, h:34 },
    { room:'waiting',  type:'screen', label:'電視', rx:330, ry:20, w:110, h:30 },
    { room:'waiting',  type:'board',  label:'告示欄', rx:30,  ry:20, w:140, h:44 },
    { room:'waiting',  type:'sign',   label:'請尊重醫護', rx:190, ry:20, w:120, h:34 },
    { room:'waiting',  type:'device', label:'飲水機', rx:430, ry:150, w:30, h:50 },
    /* 護理站 */
    { room:'nurse',    type:'counter',label:'護理站', rx:50,  ry:80,  w:280, h:80 },
    { room:'nurse',    type:'board',  label:'白板', rx:30,  ry:14,  w:150, h:40 },
    { room:'nurse',    type:'device', label:'電腦', rx:140, ry:98, w:50, h:30 },
    /* 急救室 */
    { room:'resus',    type:'bed',    label:'急救床', rx:30,  ry:60,  w:110, h:60 },
    { room:'resus',    type:'bed',    label:'急救床', rx:170, ry:60,  w:110, h:60 },
    { room:'resus',    type:'device', label:'設備', rx:30,  ry:150, w:250, h:30 },
    /* 休息室 */
    { room:'staff',    type:'sofa',   label:'沙發', rx:20,  ry:140, w:120, h:50 },
    { room:'staff',    type:'device', label:'咖啡機', rx:240, ry:30, w:50, h:44 },
    { room:'staff',    type:'board',  label:'公告板', rx:150, ry:20, w:80, h:50 },
    /* 診察室一／二 */
    { room:'consultA', type:'desk',   label:'診察桌', rx:20,  ry:20,  w:120, h:50 },
    { room:'consultA', type:'bed',    label:'診察床', rx:160, ry:100, w:100, h:60 },
    { room:'consultA', type:'device', label:'電腦', rx:60, ry:30, w:36, h:24 },
    { room:'consultB', type:'desk',   label:'診察桌', rx:20,  ry:20,  w:120, h:50 },
    { room:'consultB', type:'bed',    label:'診察床', rx:160, ry:100, w:100, h:60 },
    /* 治療區：4 張床，帶簾子 */
    { room:'bays',     type:'bed',    label:'1 床', rx:20,  ry:90, w:100, h:60, curtain:true },
    { room:'bays',     type:'bed',    label:'2 床', rx:145, ry:90, w:100, h:60, curtain:true },
    { room:'bays',     type:'bed',    label:'3 床', rx:270, ry:90, w:100, h:60, curtain:true },
    { room:'bays',     type:'bed',    label:'4 床', rx:395, ry:90, w:100, h:60, curtain:true },
    /* 斷層檢查室 */
    { room:'ct',       type:'scanner',label:'斷層掃描儀', rx:240, ry:50, w:110, h:110 },
    { room:'ct',       type:'glass',  label:'控制室玻璃', rx:20,  ry:20, w:130, h:12 },
    { room:'ct',       type:'desk',   label:'操作台', rx:30,  ry:110, w:110, h:44 },
    /* 離院說明 */
    { room:'discharge',type:'counter',label:'離院／批價櫃台', rx:20,  ry:50,  w:280, h:46 },
    { room:'discharge',type:'rack',   label:'衛教單架', rx:240, ry:130, w:62, h:60 },
    { room:'discharge',type:'sign',   label:'簡訊說明海報', rx:20, ry:130, w:130, h:44 },
    /* 洗手間 */
    { room:'restroom', type:'stall',  label:'', rx:20,  ry:30, w:60, h:70 },
    { room:'restroom', type:'stall',  label:'', rx:100, ry:30, w:60, h:70 },
    { room:'restroom', type:'device', label:'洗手台', rx:30, ry:150, w:130, h:30 },
    /* 行政辦公室 */
    { room:'admin',    type:'desk',   label:'主任辦公桌', rx:30,  ry:40, w:130, h:56 },
    { room:'admin',    type:'desk',   label:'資訊桌', rx:200, ry:40, w:120, h:56 },
    { room:'admin',    type:'board',  label:'白板', rx:30, ry:140, w:160, h:44 },
    /* 東翼 */
    { room:'ped',      type:'desk',   label:'兒科診察桌', rx:20,  ry:20,  w:120, h:50 },
    { room:'ped',      type:'bed',    label:'診察床', rx:160, ry:100, w:100, h:60 },
    { room:'ped',      type:'device', label:'玩具箱', rx:20,  ry:150, w:70, h:40 },
    { room:'obs',      type:'bed',    label:'觀察1', rx:20,  ry:90, w:100, h:60, curtain:true },
    { room:'obs',      type:'bed',    label:'觀察2', rx:160, ry:90, w:100, h:60, curtain:true },
    { room:'obs',      type:'device', label:'點滴架', rx:130, ry:170, w:30, h:40 },
    { room:'pharmacy', type:'counter',label:'領藥窗口', rx:20,  ry:40,  w:260, h:46 },
    { room:'pharmacy', type:'screen', label:'領藥叫號', rx:100, ry:8,   w:110, h:26 },
    { room:'pharmacy', type:'seats',  label:'候領椅', rx:20,  ry:150, w:160, h:34 },
    { room:'pharmacy', type:'sign',   label:'藥袋說明', rx:200, ry:130, w:80,  h:44 },
    { room:'family',   type:'seats',  label:'家屬等候椅', rx:20,  ry:50,  w:260, h:34 },
    { room:'family',   type:'screen', label:'病人動態看板', rx:20, ry:10, w:120, h:26 },
    { room:'family',   type:'board',  label:'探視規定', rx:170, ry:8, w:110, h:40 },
    { room:'family',   type:'sofa',   label:'沙發', rx:20,  ry:150, w:120, h:50 },
    { room:'lobby',    type:'device', label:'繳費機 1', rx:20,  ry:40,  w:70, h:90 },
    { room:'lobby',    type:'device', label:'繳費機 2', rx:110, ry:40,  w:70, h:90 },
    { room:'lobby',    type:'device', label:'掛號機', rx:200, ry:40,  w:70, h:90 },
    { room:'lobby',    type:'counter',label:'人工櫃台', rx:20,  ry:150, w:260, h:46 },
    { room:'service',  type:'counter',label:'服務台', rx:20,  ry:40,  w:260, h:46 },
    { room:'service',  type:'board',  label:'探病登記', rx:20,  ry:110, w:130, h:44 },
    { room:'service',  type:'rack',   label:'導覽地圖架', rx:200, ry:110, w:70,  h:60 },
    /* 街道 */
    { room:'street',   type:'sign',   label:'公車站牌', rx:1355, ry:30, w:90, h:30 },
    { room:'street',   type:'sign',   label:'計程車招呼站', rx:560, ry:30, w:120, h:30 },
    /* 病患的家：大手機示意（三則簡訊） */
    { room:'home',     type:'phone',  label:'病患的手機', rx:130, ry:30, w:160, h:300 },
    { room:'home',     type:'sofa',   label:'沙發', rx:310, ry:260, w:90, h:80 },
    /* 回診門診 */
    { room:'clinic',   type:'desk',   label:'門診桌', rx:30,  ry:50, w:140, h:56 },
    { room:'clinic',   type:'lightbox',label:'片燈箱（斷層片）', rx:230, ry:40, w:150, h:80 },
    { room:'clinic',   type:'seats',  label:'候診椅', rx:30,  ry:230, w:200, h:34 }
  ];

  /* 線索釘：小標籤釘在家具旁，點開看內容。rx, ry 為房間內相對座標。 */
  var PINS = [
    { clue:'C-01', room:'entrance', rx:30,  ry:98 },
    { clue:'C-02', room:'entrance', rx:200, ry:60 },
    { clue:'C-03', room:'triage',   rx:190, ry:44 },
    { clue:'C-04', room:'waiting',  rx:40,  ry:70 },
    { clue:'C-05', room:'triage',   rx:70,  ry:100 },
    { clue:'C-06', room:'waiting',  rx:250, ry:150 },
    { clue:'C-07', room:'consultA', rx:30,  ry:78 },
    { clue:'C-08', room:'consultA', rx:170, ry:164 },
    { clue:'C-09', room:'ct',       rx:20,  ry:60 },
    { clue:'C-10', room:'ct',       rx:30,  ry:164 },
    { clue:'C-11', room:'discharge',rx:30,  ry:104 },
    { clue:'C-12', room:'nurse',    rx:200, ry:20 },
    { clue:'C-13', room:'home',     rx:140, ry:72 },
    { clue:'C-14', room:'home',     rx:140, ry:130 },
    { clue:'C-15', room:'home',     rx:140, ry:188 },
    { clue:'C-16', room:'home',     rx:140, ry:260 },
    { clue:'C-17', room:'clinic',   rx:40,  ry:116 },
    { clue:'C-18', room:'clinic',   rx:240, ry:130 },
    { clue:'C-19', room:'admin',    rx:40,  ry:106 },
    { clue:'C-20', room:'admin',    rx:50,  ry:190 },
    { clue:'C-21', room:'staff',    rx:150, ry:80 }
  ];

  /* NPC 站位：路網的節點。room 是所在房間，rx, ry 是房間內相對座標。 */
  var STATIONS = [
    { id:'guard-desk',    room:'entrance', rx:70,  ry:142 },
    { id:'entrance-mid',  room:'entrance', rx:170, ry:110 },
    { id:'entrance-door', room:'entrance', rx:160, ry:186 },
    { id:'triage-desk',   room:'triage',   rx:150, ry:66 },
    { id:'triage-chair',  room:'triage',   rx:210, ry:170 },
    { id:'wait-1',        room:'waiting',  rx:80,  ry:92 },
    { id:'wait-2',        room:'waiting',  rx:150, ry:200 },
    { id:'wait-3',        room:'waiting',  rx:340, ry:92 },
    { id:'wait-tv',       room:'waiting',  rx:380, ry:70 },
    { id:'wait-water',    room:'waiting',  rx:410, ry:130 },
    { id:'nurse-desk',    room:'nurse',    rx:190, ry:90 },
    { id:'nurse-board',   room:'nurse',    rx:100, ry:70 },
    { id:'consultA-desk', room:'consultA', rx:80,  ry:100 },
    { id:'consultA-bed',  room:'consultA', rx:210, ry:176 },
    { id:'consultB-desk', room:'consultB', rx:80,  ry:100 },
    { id:'bay-1',         room:'bays',     rx:70,  ry:170 },
    { id:'bay-2',         room:'bays',     rx:195, ry:170 },
    { id:'bay-3',         room:'bays',     rx:320, ry:170 },
    { id:'bay-4',         room:'bays',     rx:445, ry:170 },
    { id:'ct-console',    room:'ct',       rx:90,  ry:180 },
    { id:'ct-table',      room:'ct',       rx:290, ry:180 },
    { id:'resus-1',       room:'resus',    rx:90,  ry:140 },
    { id:'staff-couch',   room:'staff',    rx:80,  ry:120 },
    { id:'staff-coffee',  room:'staff',    rx:230, ry:110 },
    { id:'dc-counter',    room:'discharge',rx:150, ry:116 },
    { id:'dc-rack',       room:'discharge',rx:220, ry:150 },
    { id:'rr-inside',     room:'restroom', rx:100, ry:120 },
    { id:'admin-desk-1',  room:'admin',    rx:95,  ry:120 },
    { id:'admin-desk-2',  room:'admin',    rx:260, ry:120 },
    { id:'street-gate',   room:'street',   rx:160, ry:40 },
    { id:'street-dc',     room:'street',   rx:1080,ry:40 },
    { id:'amb-bay',       room:'ambulance', rx:60,  ry:430 },
    { id:'bus-stop',      room:'street',   rx:1400,ry:60 },
    { id:'ped-desk',      room:'ped',      rx:80,  ry:100 },
    { id:'ped-bed',       room:'ped',      rx:210, ry:176 },
    { id:'obs-1',         room:'obs',      rx:70,  ry:176 },
    { id:'obs-2',         room:'obs',      rx:210, ry:176 },
    { id:'pharm-counter', room:'pharmacy', rx:150, ry:110 },
    { id:'pharm-wait',    room:'pharmacy', rx:100, ry:196 },
    { id:'family-1',      room:'family',   rx:80,  ry:112 },
    { id:'family-2',      room:'family',   rx:210, ry:112 },
    { id:'kiosk-1',       room:'lobby',    rx:55,  ry:140 },
    { id:'kiosk-2',       room:'lobby',    rx:145, ry:140 },
    { id:'kiosk-3',       room:'lobby',    rx:235, ry:140 },
    { id:'lobby-counter', room:'lobby',    rx:150, ry:208 },
    { id:'svc-desk',      room:'service',  rx:150, ry:110 },
    { id:'svc-board',     room:'service',  rx:90,  ry:170 },
    { id:'triage-reg',    room:'triage',   rx:70,  ry:160 },
    { id:'street-taxi',   room:'street',   rx:590, ry:60 },
    { id:'home-sofa',     room:'home',     rx:300, ry:250 },
    { id:'clinic-desk',   room:'clinic',   rx:100, ry:150 }
  ];

  function room(id) { for (var i = 0; i < ROOMS.length; i++) if (ROOMS[i].id === id) return ROOMS[i]; return null; }
  function abs(roomId, rx, ry) { var r = room(roomId); return { x: r.x + rx, y: r.y + ry }; }
  function roomAt(x, y) {
    for (var i = 0; i < ROOMS.length; i++) {
      var r = ROOMS[i];
      if (r.type === 'remote') continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (r.type === 'hall') continue;   /* 走道在房間之後判斷：先找房間，沒有再回頭找走道 */
        return r.id;
      }
    }
    for (var j = 0; j < ROOMS.length; j++) {
      var h = ROOMS[j];
      if (h.type === 'hall' && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
    }
    return null;
  }

  /* 門的世界座標（門口中心點）。side：N 上緣、S 下緣。 */
  function doorPoint(r, d) {
    var cx = r.x + r.w * d.at;
    return { x: cx, y: d.side === 'N' ? r.y : r.y + r.h };
  }

  /* 一扇門通到哪條走道（或街道）。 */
  function hallFor(r, d) {
    var edge = d.side === 'S' ? r.y + r.h : r.y;
    for (var i = 0; i < ROOMS.length; i++) {
      var q = ROOMS[i];
      if (q.type !== 'hall' && q.id !== 'street') continue;
      if (d.side === 'S' && q.y === edge) return q.id;                 /* 門朝下：正下方緊接的走道（前排房間則是街道） */
      if (d.side === 'N' && q.y + q.h === edge && q.type === 'hall') return q.id;   /* 門朝上：正上方緊接的走道 */
    }
    return null;
  }

  /* 沒有門、用開放空間相接的地點：中央走道／前廳走道—救護車道—街道（救護車專用，東側） */
  var OPEN_ADJ = [['hall2', 'ambulance'], ['hall3', 'ambulance'], ['ambulance', 'street']];

  /* 玩家可以走到的相鄰地點：房間走到它的門通往的走道；走道走到所有開向它的房間；街道另外有傳送連結（回家、回診）。
     回傳 [{ to, via:'door'|'link', label }]。調查筆記本不是可走到的地點，用介面開關。 */
  function neighbors(id) {
    var out = [], seen = {};
    function add(to, via, label) { if (!seen[to]) { seen[to] = true; out.push({ to: to, via: via, label: label || room(to).name }); } }
    var r = room(id);
    if (r && r.doors) r.doors.forEach(function (d) { var h = hallFor(r, d); if (h) add(h, 'door'); });
    ROOMS.forEach(function (q) { (q.doors || []).forEach(function (d) { if (hallFor(q, d) === id) add(q.id, 'door'); }); });
    OPEN_ADJ.forEach(function (a) { if (a[0] === id) add(a[1], 'door'); if (a[1] === id) add(a[0], 'door'); });
    LINKS.forEach(function (l) { if (l.from === id) add(l.to, 'link', l.label); });
    return out;
  }

  /* 最短的走法（只經過相鄰地點），回傳地點 id 陣列（含起點與終點），找不到回 null */
  function route(from, to) {
    if (from === to) return [from];
    var prev = {}, q = [from]; prev[from] = null;
    while (q.length) {
      var cur = q.shift();
      var ns = neighbors(cur);
      for (var i = 0; i < ns.length; i++) {
        var n = ns[i].to; if (n in prev) continue;
        prev[n] = cur; if (n === to) { var path = [to]; while (prev[path[0]] !== null) path.unshift(prev[path[0]]); return path; }
        q.push(n);
      }
    }
    return null;
  }

  /* 路網：走道上依門的 x 位置設節點；站位連到所屬房間的所有門；門連到走道節點。
     回傳 { nodes: {id:{x,y,room}}, edges: [[a,b],...] }，邊的長度由使用者端以歐氏距離計算。 */
  function nav() {
    var nodes = {}, edges = [], hallX = { corridor: {}, hall2: {}, hall3: {} }, streetX = {};
    function addNode(id, x, y, rm) { nodes[id] = { x: x, y: y, room: rm }; }
    function addEdge(a, b) { edges.push([a, b]); }
    var HALL_Y = { corridor: 255, hall2: 535, hall3: 805 }, STREET_Y = 1100;

    ROOMS.forEach(function (r) {
      (r.doors || []).forEach(function (d, i) {
        var p = doorPoint(r, d), id = 'd:' + r.id + ':' + d.side;
        addNode(id, p.x, p.y, r.id);
        var hallId = hallFor(r, d);
        if (hallId === 'street') {
          var sx = Math.round(p.x), sid = 'hs:street:' + sx; addNode(sid, sx, STREET_Y, 'street'); streetX[sx] = sid; addEdge(id, sid);
        } else if (hallId) {
          var hx = Math.round(p.x), hid = 'hs:' + hallId + ':' + hx; addNode(hid, hx, HALL_Y[hallId], hallId); hallX[hallId][hx] = hid; addEdge(id, hid);
        }
      });
    });
    /* 救護車道：前廳走道東側 → 車道中央 → 街道（沒有門，開放相接） */
    addNode('amb:n', 1640, 535, 'ambulance'); addNode('amb:m', 1640, 670, 'ambulance'); addNode('amb:s', 1640, 805, 'ambulance'); addNode('amb:f', 1640, 940, 'ambulance');
    addEdge('hs:hall2:1540', 'amb:n'); addEdge('amb:n', 'amb:m'); addEdge('amb:m', 'amb:s'); addEdge('amb:s', 'hs:hall3:1540'); addEdge('amb:s', 'amb:f'); addEdge('amb:f', 'hs:street:1640');
    /* 走道兩端也放節點，並把同一條走道的節點依 x 排序串起來 */
    ['corridor', 'hall2', 'hall3'].forEach(function (h) {
      [40, room(h).w - 40].forEach(function (x) { var id = 'hs:' + h + ':' + x; addNode(id, x, HALL_Y[h], h); hallX[h][x] = id; });
      var xs = Object.keys(hallX[h]).map(Number).sort(function (a, b) { return a - b; });
      for (var i = 0; i + 1 < xs.length; i++) addEdge(hallX[h][xs[i]], hallX[h][xs[i + 1]]);
    });
    var sxs = Object.keys(streetX).map(Number).sort(function (a, b) { return a - b; });
    [1400, 1640].forEach(function (x) { var id = 'hs:street:' + x; addNode(id, x, STREET_Y, 'street'); streetX[x] = id; });
    sxs = Object.keys(streetX).map(Number).sort(function (a, b) { return a - b; });
    for (var k = 0; k + 1 < sxs.length; k++) addEdge(streetX[sxs[k]], streetX[sxs[k + 1]]);

    STATIONS.forEach(function (s) {
      var p = abs(s.room, s.rx, s.ry);
      if (s.room === 'home' || s.room === 'clinic') { addNode(s.id, p.x, p.y, s.room); return; }   /* 地圖外，不連路網 */
      addNode(s.id, p.x, p.y, s.room);
      if (s.room === 'ambulance') { addEdge(s.id, 'amb:f'); return; }
      if (s.room === 'street') {
        var near = null, best = 1e9;
        Object.keys(streetX).forEach(function (x) { var d = Math.abs(+x - p.x); if (d < best) { best = d; near = streetX[x]; } });
        addEdge(s.id, near);
        return;
      }
      var r = room(s.room);
      (r.doors || []).forEach(function (d) { addEdge(s.id, 'd:' + r.id + ':' + d.side); });
    });
    return { nodes: nodes, edges: edges };
  }

  return { WALL: WALL, ROOMS: ROOMS, LINKS: LINKS, FURNITURE: FURNITURE, PINS: PINS, STATIONS: STATIONS,
           room: room, abs: abs, roomAt: roomAt, doorPoint: doorPoint, nav: nav, hallFor: hallFor, neighbors: neighbors, route: route };
});
