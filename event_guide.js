(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_EVENT_GUIDE = factory(root.ERG_DATA, root.ERG_CASES, root.ERG_LAYOUT, root.ERG_PERSONAS, root);
})(typeof self !== 'undefined' ? self : this, function (DATA, CASES, LAYOUT, PERSONAS, ROOT) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    DATA = require('./er_data.js'); CASES = require('./cases.js'); LAYOUT = require('./layout.js');
    if (typeof global.window !== 'undefined') { require('./content.js'); ROOT = global.window; }
    PERSONAS = require('./personas.js');
  }
  var CASE_FILES = [
    ['forms', 'case_forms.js'], ['pay', 'case_pay.js'], ['peds', 'case_peds.js'],
    ['wait', 'case_wait.js'], ['way', 'case_way.js']
  ];
  var CASE_PEOPLE = {
    forms: ['tremor_ming','daughter_yu','reg_chen','nurse_forms','social_wei','it_hao'],
    pay: ['qing_patient','gong_kiosk','lin_pharmacist','mei_counter','bo_tech','wei_worker','mei_family'],
    peds: ['parent_kui','nurse_yu','doctor_lin','grandma_hui','pharm_ning','volunteer_mi','parent_bo'],
    wait: ['zhe_patient','hearing_uncle','dad_hao','mei_family','system_wei','service_ling','charge_lin','uncle_bo'],
    way: ['auntie_lin','wheel_ming','mei_guest','vol_route','clean_ya','guard_path','nurse_map','facility_ren']
  };
  var ROOM_NAMES = {
    nurse:'護理站',resus:'急救室',street:'院外街口',triage:'檢傷櫃台',waiting:'候診區',entrance:'入口大廳',restroom:'洗手間',ct:'斷層檢查室',corridor:'走道',hall2:'中段走道',bays:'治療區',lobby:'大廳',consultA:'診間 A',consultB:'診間 B',service:'服務台',family:'家屬區',pharmacy:'藥局',ped:'兒科診間',discharge:'離院窗口',admin:'行政辦公區',obs:'觀察室',hall3:'後段走道',ambulance:'救護車停靠區'
  };
  var STORY = {
    E01:['白板前兩班護理師逐項核對','交班中的護理師暫時不便受訪'], E02:['救護車鳴笛停在入口','人手朝急救室集中，走道有人快步移動'],
    E03:['叫號螢幕跳出亂碼','候診者靠近檢傷櫃台確認輪到誰'], E04:['長輩在入口附近來回張望','志工停下原本工作，陪著找洗手間'],
    E05:['斷層檢查時段排滿','推床沿走道停等，放射人員忙著調度'], E06:['離院者的手機接連震動','同一批簡訊在固定時刻送達'],
    E07:['志工推著餐車穿過走道','經過的人讓出通道，餐車短暫遮住動線'], E08:['午間輪流用餐，人手變少','候診座位逐漸坐滿，等候時間增加'],
    E09:['家屬在檢傷櫃台提高音量','護理師停下手邊工作，先安撫並確認等候狀況'], E10:['治療區傳出儀器警報聲','護理師快步查看儀器與病人狀況'],
    E11:['下午班來到護理站交接','白板與當班事項再次逐項確認'], E12:['救護車接連送來四位傷者','急救室與治療區迅速忙起來，候診者被告知還要等'],
    E15:['兒科診間傳出小孩哭聲','警衛被叫進去幫忙按住小孩的頭，爸爸站在旁邊'], E16:['批價櫃台有人提高音量','沒帶健保卡要先自費，櫃台一遍遍解釋可以退'], E17:['診間門口兩個人僵持','家屬拿手機錄影，護理師請他刪掉'],
    E13:['家屬拍桌大吼，候診區轉頭張望','檢傷護理師退開一步，警衛老陳趕到並陪同到門外冷靜'], E14:['醉酒路人搖晃著闖進入口','警衛和保全陪同對方離開大門'],
    'F-E1':['雨後文件受潮，印表機少了同意書末頁','櫃台逐份翻看文件，隊伍暫停等待補件'], 'F-E2':['病人不方便握筆，家屬尚未到場','檢傷先做必要確認，服務台接連被問誰能代填與簽署'],
    'P-E1':['觸控機台按下後遲遲沒有反應','使用者再次觸碰確認鍵，櫃台人員留意隊伍'], 'P-E2':['兩種叫號聲在大廳同時響起','病人拿著不同顏色的號碼單，停下來辨認先去哪裡'], 'P-E3':['藥袋縮寫讓家屬停下閱讀','藥師逐項指著藥袋文字再說明一次'],
    'K-E1':['候診區一處哭聲引來另一處回應','家長抱起孩子走動，等候座位間互相張望'], 'K-E2':['家長在兒科與藥局間尋找劑量換算卡','藥師和護理師回看現有衛教資料'], 'K-E3':['家長手機跳出群組舊截圖','家長把截圖與現場衛教內容來回比對'],
    'W-E1':['兩個號碼接連被播出','候診者低頭核對手上的紙號碼，再望向櫃台'], 'W-E2':['整點廣播音量突然變小','候診者停下交談，靠近走道確認有沒有聽漏'], 'W-E3':['急重症先進診間，叫號順序改變','護理師向候診家屬說明優先處置與目前等待狀況'],
    'N-E1':['雨後地面箭頭被水光與腳印切碎','訪客停在轉角，抬頭找 CT 指標確認方向'], 'N-E2':['活動人潮擋住高處吊牌','訪客走過服務台後停步，重新尋找下一個方向']
  };
  var INTERVIEW = {
    E03:['triage_nurse','螢幕當機時，您怎麼讓候診者知道下一步？','候診者會到櫃台重複確認，替代叫號方式是否清楚。','events'],
    E04:['volunteer','剛才那位長輩是怎麼找洗手間的？','入口的指標或地標是否讓人容易辨認。','events'],
    E09:['triage_nurse','家屬開始著急時，您通常先確認什麼？','等候資訊是否看得懂、何處能詢問。','need'],
    E13:['guard','剛才家屬拍桌後，現場怎麼處理？','等待資訊與求助管道的缺口，以及旁人安全感。','events'],
    E14:['guard','剛才入口發生什麼事？','入口秩序、求助方式與訪客是否知道該找誰。','events'],
    'F-E1':['reg_chen','文件受潮或少頁時，病人通常要重做哪些步驟？','缺頁檢查、重複填寫、紙本可讀性與補件動線。','events'],
    'F-E2':['social_wei','病人不方便握筆、家屬又未到時，您會怎麼協助？','代填與本人確認的界線、稍後補件和求助窗口。','need'],
    'P-E1':['gong_kiosk','剛才機台沒有反應時，您怎麼判斷有沒有送出？','確認回饋、重複操作的風險與人工替代方式。','events'],
    'P-E2':['mei_counter','兩種號碼一起響時，病人最容易混淆哪一步？','號碼單辨識、下一站提示及跨窗口的銜接。','need'],
    'P-E3':['lin_pharmacist','家屬讀藥袋時，您通常需要補充哪些說明？','縮寫、圖示與口頭說明是否能讓家屬理解下一步。','events'],
    'K-E1':['parent_kui','孩子哭鬧時，等候安排最讓您不方便的是什麼？','照顧孩子與接收叫號訊息的衝突。','need'],
    'K-E2':['pharm_ning','家長找不到換算卡時，會改去哪裡確認？','衛教資料是否容易找到、版本是否一致。','events'],
    'K-E3':['parent_kui','收到群組舊截圖後，您怎麼確認哪個版本正確？','官方資訊來源、日期與版本辨識。','need'],
    'W-E1':['service_ling','兩個號碼接著播時，候診者常怎麼確認？','是否能看懂號碼序列與叫號對象。','events'],
    'W-E2':['hearing_uncle','剛才廣播變小聲時，您有聽清楚嗎？','廣播可聽度與視覺備援。','surface'],
    'W-E3':['charge_lin','急重症優先時，您會怎麼向其他候診者說明？','優先規則透明度與等候者需要的更新。','need'],
    'N-E1':['auntie_lin','雨後您是看地面箭頭還是抬頭找牌子？','雨天指引可見度與路口的確認線索。','events'],
    'N-E2':['nurse_map','人潮擋住吊牌時，訪客會怎麼找到服務台或檢查室？','視線高度、替代指引和沿路續牌。','need']
  };
  var EVENT_CLUES = {
    'F-E1':['F-01','F-02','F-04','F-05'],'F-E2':['F-02','F-08','F-10','F-13'],
    'P-E1':['P-04'],'P-E2':['P-05','P-06'],'P-E3':['P-07','P-09','P-10'],
    'K-E1':['K-05','K-09'],'K-E2':['K-07','K-11'],'K-E3':['K-04','K-12'],
    'W-E1':['W-01','W-02','W-03','W-08'],'W-E2':['W-05'],'W-E3':['W-01','W-06','W-08'],
    'N-E1':['N-04','N-05','N-07'],'N-E2':['N-09','N-10','N-11']
  };
  var DIALOGUE = {
    E01:[['nurse','這班的病人和待辦，逐項核對。','speech'],['triage_nurse','交接完再接下一班。','mutter']],
    E02:[['er_doctor','救護車到了，急救室先接手。','shout'],['nurse','走道先讓出來。','speech']],
    E03:[['triage_nurse','螢幕跳亂碼了，先來櫃台確認號碼。','speech'],['triage_nurse','不要只看這一排字。','mutter']],
    E04:[['volunteer','您在找洗手間嗎？我陪您走過去。','speech']],
    E05:[['radiology','斷層排程滿了，推床先沿走道等候。','speech']],
    E06:[['patient','手機震了一下，離院簡訊到了。','thought']],
    E07:[['volunteer','借過，餐車要先推過走道。','speech']],
    E08:[['nurse','午間輪流用餐，候診區還要多等一會兒。','mutter']],
    E09:[['triage_nurse','我知道您等很久了，我先確認目前進度。','speech'],['family','怎麼還要等？','shout']],
    E10:[['nurse','儀器在響，我過去看看。','shout']],
    E11:[['nurse','下午班的交接事項，再核對一次。','speech'],['triage_nurse','這幾項我接到了。','mutter']],
    E12:[['er_doctor','四位傷者到了，急救室和治療區先準備。','shout'],['triage_nurse','候診區需要更新等待說明。','speech']],
    E13:[['rowdy_family','等了快三小時，怎麼還沒輪到？','shout'],['guard','我們到門外慢慢說。','speech']],
    E14:[['rowdy_drunk','我要找人！','shout'],['guard','先陪我到門外。','speech']],
    'F-E1':[['reg_chen','這份少了最後一頁，先逐份確認再補。','speech'],['daughter_yu','那前面填過的還要重寫嗎？','thought']],
    'F-E2':[['tremor_ming','我現在不太方便握筆，家人還沒到。','speech'],['social_wei','先做必要確認，代填和簽名我陪您問清楚。','speech']],
    'P-E1':[['gong_kiosk','按了之後沒反應，我不確定有沒有送出。','mutter'],['mei_counter','先看確認畫面，再決定要不要重按。','speech']],
    'P-E2':[['qing_patient','兩種號碼都在響，我要先去哪一邊？','thought'],['mei_counter','先核對手上的號碼單和窗口。','speech']],
    'P-E3':[['mei_family','藥袋上的縮寫，我看不太懂。','mutter'],['lin_pharmacist','我指著藥袋，再逐項說明。','speech']],
    'K-E1':[['parent_kui','孩子一哭，我就怕聽漏叫號。','thought'],['nurse_yu','您先抱好孩子，我再說明目前等候。','speech']],
    'K-E2':[['parent_kui','劑量換算卡放在哪裡？','speech'],['pharm_ning','先一起找現場的衛教資料。','speech']],
    'K-E3':[['parent_kui','群組截圖是哪一版？我想再確認。','thought'],['nurse_yu','我們先對照現場的衛教內容。','speech']],
    'W-E1':[['hearing_uncle','剛才連著播兩個號碼，是哪一位？','speech'],['service_ling','我們一起核對紙上的號碼。','speech']],
    'W-E2':[['hearing_uncle','廣播剛才變小聲，我沒聽清楚。','mutter'],['service_ling','我再確認一次叫號內容。','speech']],
    'W-E3':[['charge_lin','急重症先處置，我會說明目前等候狀況。','speech'],['dad_hao','那我現在要等哪個通知？','thought']],
    'N-E1':[['auntie_lin','地上箭頭被雨水弄得不清楚。','mutter'],['nurse_map','請抬頭找 CT 指標，我陪您確認方向。','speech']],
    'N-E2':[['auntie_lin','吊牌被人群擋住了，接下來往哪走？','speech'],['nurse_map','我們先找下一個可見的指標。','speech']]
  };
  /* 10-18 事件條一拍一句、最長 36 字（Xbox 字幕指引：短、固定位置）；長版敘述留在事件簿與重播（beat.detail） */
  function fit(s, n) {
    s = String(s == null ? '' : s); if (s.length <= n) return s;
    var cut = s.slice(0, n - 1), m = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('，'), cut.lastIndexOf('；'), cut.lastIndexOf('、'));
    if (m >= n * 0.5) return cut.charAt(m) === '。' ? cut.slice(0, m + 1) : cut.slice(0, m) + '…';
    return cut + '…';
  }
  function listSources() {
    if (!DATA || !CASES) throw new Error('瀏覽器需先載入 ERG_DATA、ERG_CASES；Node 使用本地案例檔。');
    var sources = DATA.EVENTS.map(function (e) { return { event:e, caseId:'sms', caseName:'急診共同事件', clues:[], people:null }; });
    CASE_FILES.forEach(function (pair) {
      var c;
      if (typeof module === 'object' && module.exports) c = require('./' + pair[1]);
      else { var all = CASES.build(ROOT.ERG, LAYOUT, PERSONAS, DATA); c = all.get(pair[0]); }
      (c.events || []).forEach(function (e) { sources.push({ event:e, caseId:pair[0], caseName:c.meta.name, clues:c.clues || [], people:c.personas || [] }); });
    });
    return sources;
  }
  function build() {
    var sources = listSources();
    return sources.map(function (src) {
      var e = src.event, id=e.id, desc=STORY[id] || [e.text || e.title, e.title];
      var people = src.caseId === 'sms' ? (DATA.NAMED_PATIENTS || []).map(function(x){return x.persona;}) : CASE_PEOPLE[src.caseId];
      var cast = src.caseId === 'sms' ? (e.busy || []).filter(function (x) { return (PERSONAS.PERSONAS || []).some(function(p){return p.id===x;}); }) : (CASE_PEOPLE[src.caseId] || []).slice(0,4);
      if (src.caseId === 'sms' && e.sms) cast = ['patient'];
      if (!cast.length) cast = src.caseId === 'sms' ? ['nurse','triage_nurse'] : people.slice(0,2);
      var primary = INTERVIEW[id] || [cast[0], '剛才這件事發生時，您注意到什麼？', '實際操作中最容易卡住的步驟與使用者如何確認下一步。', 'events'];
      if (primary[0] && cast.indexOf(primary[0]) < 0) cast.push(primary[0]);
      var dialogue = DIALOGUE[id] || [[cast[0],desc[0],'speech'],[cast[1]||cast[0],desc[1],'mutter']];
      dialogue.forEach(function(line){if(line[0]&&cast.indexOf(line[0])<0)cast.push(line[0]);});
      var mapped = EVENT_CLUES[id] || [];
      var clues = src.clues.filter(function(c){return c.role !== 'noise' && mapped.indexOf(c.id) >= 0;}).map(function(c){return c.id;});
      var when = { window: e.at.slice(), fixed: !!e.fixed, duration: e.dur, unit:'sim-minute', label: ('0'+Math.floor(e.at[0]/60)).slice(-2)+':'+String(e.at[0]%60).padStart(2,'0') + (e.at[1]===e.at[0] ? '' : '–'+Math.floor(e.at[1]/60)+':'+String(e.at[1]%60).padStart(2,'0')) };
      var scriptLines = [
        {who:cast[0],text:desc[0],kind:'speech'},
        {who:cast[1] || cast[0],text:desc[1],kind: id==='E13'||id==='E14'?'shout':'mutter'}
      ];
      var isHigh = ['E02','E03','E04','E09','E10','E12','E13','E14','F-E1','F-E2','P-E1','P-E2','P-E3','K-E1','K-E2','K-E3','W-E1','W-E2','W-E3','N-E1','N-E2'].indexOf(id)>=0;
      return { id:id, caseId:src.caseId, caseName:src.caseName, title:e.title, rooms:e.rooms.slice(), when:when, cast:cast,
        beats:[
          {at:0,caption:fit(desc[0],36),lines:[{who:dialogue[0][0],text:fit(dialogue[0][1],36),kind:dialogue[0][2]}],sfx:id==='E02'?'嗚——':'',emote:[{who:dialogue[0][0],icon:'!'}],camera:'wide'},
          {at:4,caption:fit(desc[1],36),lines:[{who:(dialogue[1]||dialogue[0])[0],text:fit((dialogue[1]||dialogue[0])[1],36),kind:(dialogue[1]||dialogue[0])[2]}],sfx:id==='E03'?'嗶、嗶…':'',emote:[{who:(dialogue[1]||dialogue[0])[0],icon:id==='E13'||id==='E14'?'💢':'…'}],camera:'push'},
          {at:8,caption:fit(e.text || e.title,36),detail:e.text || e.title,lines:[],sfx:'',emote:[],camera:'pan'}   /* 決定 6：訪談提示不再當 NPC 台詞念出來，改成事件結束後事件條上的「可以問的問題」（interview 資料不變） */
        ], observe:[desc[0],desc[1],e.text || e.title].slice(0,3),
        interview:[{who:primary[0]||cast[0],ask:primary[1],listenFor:primary[2],layer:primary[3]||'events'}],
        usability:(src.caseId==='sms'?'事件如何影響現場資訊、動線與求助的可見性。':'事件暴露了「'+src.caseName+'」流程中辨識、確認或尋求協助的使用性問題。'),
        link:clues, importance:isHigh?3:((e.fixed || (e.rooms||[]).length>1)?2:1) };
    });
  }
  function getRooms() { return LAYOUT ? LAYOUT.ROOMS.map(function(r){return r.id;}) : []; }
  return { build:build, listSources:listSources, getRooms:getRooms, roomName:function(id){return ROOM_NAMES[id]||id;} };
});
