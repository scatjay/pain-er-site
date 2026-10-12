/* 急診室時間系統的資料表。
   🔴 這裡的數字（到院人數、檢傷分布、候診時間、事件發生時段）是「設計假設」，用來讓急診室看起來有真實感；
   不是任何醫院的統計。依據的是模擬研究的一般做法（到院人數依時段變動、檢傷 1–5 級決定去向、
   以候診時間與停留時間為指標、護理與醫師依班別換班），具體值我自己訂，需要時可由楊老師調整。
   時間單位：「模擬分鐘」（sim minutes，從 0 點起算，例如 07:00＝420）；「世界秒」是真實經過的秒數。
   換算：SPEED 模擬分鐘 / 真實分鐘，預設 12 → 真實 5 秒＝模擬 1 分鐘，一堂 60 分鐘的調查剛好是模擬的 12 小時。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var SIM = { START: 420, END: 1140, SECONDS_PER_SIM_MIN: 5, SHIFT: 'day' };   /* 07:00 到 19:00 */

  /* 每個模擬小時的到院人數（期望值）。第 0 項是 07:00–08:00。 */
  var ARRIVAL_PROFILE = [2, 3, 4, 4, 4, 3, 3, 3, 3, 4, 4, 3];
  var NIGHT_ARRIVAL_PROFILE = [1.2, 1.1, 0.8, 0.7, 0.8, 1.3, 2.1, 2.8, 2.1, 1.7, 1.8, 2.0];

  /* 檢傷分級權重（ESI 1 最緊急，5 最不緊急） */
  var ESI_WEIGHTS = { 1: 2, 2: 13, 3: 45, 4: 30, 5: 10 };

  /* 一般病患的主訴。mood 是等候時的基本情緒；phone 是對手機的熟悉度（影響他對簡訊的態度）。 */
  var COMPLAINTS = [
    { id:'dizzy',    text:'頭暈、頭痛',     esi:[3,4], note:'坐著不太舒服，一直扶著頭' },
    { id:'belly',    text:'肚子痛',         esi:[3,4], note:'彎著腰，臉色不太好' },
    { id:'fever',    text:'發燒、喉嚨痛',   esi:[3,4], note:'戴著口罩，偶爾咳嗽' },
    { id:'sprain',   text:'腳踝扭傷',       esi:[4,5], note:'一腳不敢著地' },
    { id:'cut',      text:'手被割傷',       esi:[4],   note:'用毛巾壓著手' },
    { id:'chest',    text:'胸悶、心悸',     esi:[2,3], note:'一直按著胸口' },
    { id:'vomit',    text:'噁心、嘔吐',     esi:[3,4], note:'手上拿著塑膠袋' },
    { id:'allergy',  text:'過敏、起疹子',   esi:[4,5], note:'一直抓手臂' },
    { id:'back',     text:'下背痛',         esi:[4,5], note:'站不直' },
    { id:'cough',    text:'咳嗽、喘',       esi:[3,4], note:'講話講一半就喘' }
  ];
  var MOODS = ['很有耐心', '有點焦躁', '想快點回家', '擔心自己的狀況', '覺得被忽略', '話很多'];
  var PHONE_LEVELS = ['很熟', '普通', '不太會用'];

  /* 路線：依檢傷分級決定。step = [站位 id, [最短停留, 最長停留]（模擬分鐘）, 活動描述]
     'WAIT' 會在候診站位（wait-1~3）中挑一個；'BAY' 會挑一張空的治療床；'CONSULT' 依分級挑診察室。
     away=true 表示離開地圖（離院）。 */
  var ROUTES = {
    1: [ ['entrance-mid',[1,1],'由救護人員推入'], ['resus-1',[60,120],'急救處置'], ['BAY',[120,240],'留置觀察'], ['AWAY',[0,0],'轉病房'] ],
    2: [ ['triage-desk',[2,4],'優先檢傷'], ['BAY',[60,150],'治療與檢查'], ['ct-table',[20,35],'做斷層檢查'], ['BAY',[20,40],'等候結果'],
         ['dc-counter',[8,12],'領衛教與結帳'], ['street-dc',[2,3],'走出醫院'], ['AWAY',[0,0],'離院'] ],
    3: [ ['entrance-mid',[1,3],'找檢傷櫃台'], ['triage-desk',[4,8],'檢傷'], ['WAIT',[45,100],'候診'], ['CONSULT',[12,25],'看診'],
         ['ct-table?',[20,35],'做斷層檢查'], ['WAIT',[15,30],'等結果'], ['CONSULT',[8,15],'聽醫師說明'],
         ['dc-counter',[8,15],'領衛教與結帳'], ['street-dc',[2,3],'走出醫院'], ['AWAY',[0,0],'離院'] ],
    4: [ ['entrance-mid',[1,3],'找檢傷櫃台'], ['triage-desk',[3,6],'檢傷'], ['WAIT',[60,120],'候診'], ['CONSULT',[8,18],'看診'],
         ['dc-counter',[6,12],'領衛教與結帳'], ['street-dc',[2,3],'走出醫院'], ['AWAY',[0,0],'離院'] ],
    5: [ ['entrance-mid',[1,2],'找檢傷櫃台'], ['triage-desk',[3,5],'檢傷'], ['WAIT',[90,150],'候診'], ['CONSULT',[6,12],'看診'],
         ['street-dc',[2,3],'走出醫院'], ['AWAY',[0,0],'離院'] ]
  };
  /* 標了 ? 的站位只有一部分病患會去（例如斷層檢查），機率如下 */
  var OPTIONAL_STEP_CHANCE = { 'ct-table?': 0.4 };

  /* 事件：at=[最早, 最晚]（模擬分鐘），由房間的種子決定實際時間；fixed 的事件時間固定。
     busy：在事件期間會變成「忙碌」的角色（persona id）；rooms：事件發生地點；
     effects.waitExtra：該事件期間，候診停留時間額外增加（模擬分鐘）。 */
  var EVENTS = [
    { id:'E01', title:'護理交班', at:[450,450], fixed:true, dur:25, rooms:['nurse'],
      busy:['nurse','triage_nurse'], text:'護理站正在交班，兩班護理師圍在白板前核對病人，現在不方便被打擾。' },
    { id:'E02', title:'救護車到院', at:[600,640], dur:35, rooms:['resus','street'],
      busy:['er_doctor','nurse'], spawn:{ esi:1, mode:'ambulance', complaint:'車禍外傷' }, text:'救護車鳴笛到院，急救室的人手被叫走，走道上有人在跑。' },
    { id:'E03', title:'叫號螢幕當機', at:[660,700], dur:30, rooms:['triage','waiting'],
      busy:['triage_nurse'], effects:{ waitExtra:10 }, text:'叫號螢幕突然當機只剩一排亂碼，候診的人擠到檢傷櫃台問「到我了嗎」。' },
    { id:'E04', title:'老人找不到洗手間', at:[520,570], dur:15, rooms:['entrance','restroom'],
      busy:['volunteer'], text:'一位長輩在入口大廳繞圈找洗手間，志工被拉去帶路。' },
    { id:'E05', title:'斷層排程塞車', at:[630,720], dur:60, rooms:['ct','corridor'],
      busy:['radiology'], effects:{ waitExtra:30 }, text:'斷層檢查排隊，走道上多了幾張推床在等。' },
    { id:'E06', title:'簡訊系統批次寄出', at:[749,749], fixed:true, dur:5,   /* 12:29：主角 12:27–12:35 在公車站，簡訊就在這時震動 */ rooms:['street'],
      busy:[], text:'醫院的簡訊系統批次寄出：剛離院的病患，手機同時震動了。', sms:true },
    { id:'E07', title:'送餐車經過', at:[720,720], fixed:true, dur:20, rooms:['corridor','hall2'],
      busy:['volunteer'], text:'志工推著餐車經過走道，一股便當味。' },
    { id:'E08', title:'人力吃緊的午間', at:[720,720], fixed:true, dur:90, rooms:['nurse','waiting'],
      busy:[], effects:{ waitExtra:15 }, text:'午間輪流用餐，人力吃緊，候診的人明顯變多。' },
    { id:'E09', title:'家屬在櫃台抱怨', at:[780,800], dur:15, rooms:['triage'],
      busy:['triage_nurse'], text:'一位家屬在檢傷櫃台大聲抱怨等太久，檢傷護理師正在安撫。' },
    { id:'E10', title:'儀器警報', at:[840,900], dur:10, rooms:['bays'],
      busy:['nurse'], text:'治療區有儀器嗶嗶響，護理師小跑步趕過去。' },
    { id:'E11', title:'護理交班（小夜）', at:[930,930], fixed:true, dur:25, rooms:['nurse'],
      busy:['nurse','triage_nurse'], text:'下午班接手，護理站又在交班。' },
    /* 突發鬧事（漫畫式，不描寫暴力細節）。起因參考衛福部對醫療暴力的分析：等候過久、溝通不良、情緒或酒精。
       incident.rowdy 的 steps 以「事件開始 S」為基準：before 是提早出現的分鐘數。警衛支援會在事件開始時出現，
       把人請到門外；事件期間原本的警衛 persona 暫時隱藏（hide），事件結束後回到原本的行程。 */
    { id:'E13', title:'家屬因等太久在櫃台拍桌', at:[845,885], dur:14, rooms:['triage','waiting'],
      busy:['triage_nurse','guard'], effects:{ waitExtra:5 },
      text:'一位家屬等了快三小時，終於忍不住在檢傷櫃台拍桌大吼。檢傷護理師往後退一步，警衛老陳一路小跑過來，把人請到門外去冷靜。',
      incident:{ hide:['guard'],
        rowdy:{ persona:'rowdy_family', before:30,
          steps:[ ['entrance-mid',1,'走進急診，找櫃台'], ['triage-desk',3,'詢問還要等多久'], ['wait-3',20,'越來越不耐煩（碎念）'],
                  ['triage-desk',5,'拍桌大吼'], ['street-gate',2,'被請到門外'], ['AWAY',0,'離開'] ] },
        guard:{ persona:'guard', label:'老陳（出動）',
          steps:[ ['guard-desk',0,'聽到吼聲'], ['triage-desk',5,'上前勸離'], ['street-gate',2,'把人請到門外'], ['guard-desk',1,'回崗位'] ], startAt:-1 } } },
    { id:'E14', title:'酒客亂入大喊', at:[1070,1110], dur:12, rooms:['entrance','triage'],
      busy:['guard','triage_nurse'], text:'一位喝醉的路人闖進急診亂喊，說要找人。警衛和保全一左一右把他請出大門。',
      incident:{ hide:['guard'],
        rowdy:{ persona:'rowdy_drunk', before:6,
          steps:[ ['street-gate',1,'搖搖晃晃走過來'], ['entrance-mid',4,'大喊「我要找人！」'], ['triage-desk',3,'拍櫃台亂喊'],
                  ['street-gate',2,'被架出大門'], ['AWAY',0,'離開'] ] },
        guard:{ persona:'guard', label:'老陳（出動）',
          steps:[ ['guard-desk',0,'聽到亂喊'], ['entrance-mid',3,'上前勸離'], ['triage-desk',1,'架住對方'], ['street-gate',2,'把人架出大門'], ['guard-desk',1,'回崗位'] ], startAt:1 } } },
    { id:'E12', title:'連環車禍送來四位傷者', at:[960,1030], dur:40, rooms:['resus','bays','street'],
      busy:['er_doctor','nurse','triage_nurse'], spawn:{ esi:2, mode:'ambulance', complaint:'車禍外傷', count:4 }, effects:{ waitExtra:25 },
      text:'連環車禍一次送來四位傷者，急救室和治療區全滿，候診區的人被告知要再等。' }
  ];

  /* 指定時間出現的角色（含主角）。persona 對應 personas.js 的 id；route 為 null 表示依 esi 走一般路線。 */
  var NAMED_PATIENTS = [
    { persona:'elder',       appear:470, esi:4, complaint:'高血壓複診、頭暈' },
    { persona:'teen',        appear:510, esi:4, complaint:'腳踝扭傷' },
    { persona:'toddler_mom', appear:540, esi:3, complaint:'幼兒發燒' },
    { persona:'patient',     appear:550, esi:3, complaint:'頭部外傷（前一晚打球撞到）', main:true,
      route:[ ['entrance-mid',[2,2],'找檢傷櫃台'], ['triage-desk',[6,6],'檢傷'], ['wait-2',[80,80],'候診'], ['consultA-desk',[20,20],'看診'],
              ['ct-table',[25,25],'做斷層檢查'], ['wait-1',[20,20],'等結果'], ['consultA-desk',[10,10],'聽醫師說明'],
              ['dc-counter',[12,12],'領衛教，護理師口頭說明怎麼收簡訊'], ['street-dc',[3,3],'走出醫院'], ['bus-stop',[8,8],'等公車（手機即將震動）'], ['HOME',[0,0],'回到家'] ] },
    { persona:'street_man',  appear:490, esi:4, complaint:'腳受傷' },
    { persona:'lonely_elder',appear:570, esi:4, complaint:'血壓偏高、頭暈' },
    { persona:'new_resident',appear:630, esi:4, complaint:'肚子痛' },
    { persona:'worker',      appear:640, esi:4, complaint:'手被割傷' },
    { persona:'trans_woman', appear:700, esi:4, complaint:'喉嚨痛、發燒' },
    { persona:'gay_partner', appear:790, esi:3, complaint:'陪伴侶來（伴侶在觀察室）',
      route:[ ['entrance-mid',[2,2],'走進急診'], ['svc-desk',[6,6],'登記成為家屬／探病'], ['family-1',[40,60],'在家屬區等候'],
              ['obs-1',[10,10],'進去看伴侶'], ['family-2',[20,30],'在家屬區等候'], ['street-dc',[2,2],'走出醫院'], ['AWAY',[0,0],'離開'] ] },
    { persona:'drunk',       appear:750, esi:5, complaint:'喝多了跌倒擦傷' }
  ];

  var NIGHT_EVENTS = [
    { id:'N01', title:'酒客跌倒送醫', at:[1165,1210], dur:22, rooms:['entrance','triage','street'], busy:['guard','triage_nurse','nurse'], spawn:{ esi:4, mode:'ambulance', complaint:'喝醉跌倒擦傷' }, text:'深夜一名酒客跌倒後由救護車送來，警衛先到入口協助，檢傷護理師和護理師接手。' },
    { id:'N02', title:'救護車送來車禍傷者', at:[1320,1390], dur:35, rooms:['resus','street','bays'], busy:['er_doctor','nurse','triage_nurse'], spawn:{ esi:2, mode:'ambulance', complaint:'夜間車禍外傷' }, text:'救護車警示燈由東側車道駛入，急救醫師、護理師和檢傷護理師前往接手。' },
    { id:'N03', title:'幼童半夜發燒', at:[1450,1510], dur:20, rooms:['peds','triage','waiting'], busy:['triage_nurse','nurse'], spawn:{ esi:3, mode:'walk-in', complaint:'幼童夜間發燒' }, text:'一名幼童半夜發燒，由家人帶到急診，檢傷護理師先確認狀況。' },
    { id:'N04', title:'候診區有人跌倒', at:[1600,1690], dur:18, rooms:['waiting','hall2'], busy:['nurse','guard'], spawn:{ esi:3, mode:'walk-in', complaint:'候診時跌倒、手腕疼痛' }, text:'候診區傳來碰撞聲，一名病人起身時跌倒，護理師與警衛趕去查看。' }
  ];
  var NIGHT_NAMED_PATIENTS = [
    { persona:'drunk', appear:1190, esi:5, complaint:'喝多了跌倒擦傷' },
    { persona:'toddler_mom', appear:1470, esi:3, complaint:'幼兒半夜發燒' },
    { persona:'elder', appear:1570, esi:4, complaint:'夜間頭暈、走路不穩' }
  ];

  function forShift(shift) {
    shift = shift === 'night' ? 'night' : 'day';
    var night = shift === 'night';
    return { SIM: { START: night ? 1140 : 420, END: night ? 1860 : 1140, SECONDS_PER_SIM_MIN: 5, SHIFT: shift },
      ARRIVAL_PROFILE: (night ? NIGHT_ARRIVAL_PROFILE : ARRIVAL_PROFILE).slice(), ESI_WEIGHTS: ESI_WEIGHTS,
      COMPLAINTS: COMPLAINTS, MOODS: MOODS, PHONE_LEVELS: PHONE_LEVELS, ROUTES: ROUTES,
      OPTIONAL_STEP_CHANCE: OPTIONAL_STEP_CHANCE, EVENTS: night ? NIGHT_EVENTS : EVENTS,
      NAMED_PATIENTS: night ? NIGHT_NAMED_PATIENTS : NAMED_PATIENTS };
  }

  return { SIM: SIM, ARRIVAL_PROFILE: ARRIVAL_PROFILE, ESI_WEIGHTS: ESI_WEIGHTS, COMPLAINTS: COMPLAINTS, MOODS: MOODS,
           PHONE_LEVELS: PHONE_LEVELS, ROUTES: ROUTES, OPTIONAL_STEP_CHANCE: OPTIONAL_STEP_CHANCE, EVENTS: EVENTS, NAMED_PATIENTS: NAMED_PATIENTS,
           NIGHT_ARRIVAL_PROFILE: NIGHT_ARRIVAL_PROFILE, forShift: forShift };
});
