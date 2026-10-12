(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_CASE_WAY = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var personas = [
    {
      id:'auntie_lin', name:'林阿姨', title:'第一次來的長者／主角', core:true, material:'模擬', decision:true,
      bio:'七十多歲，從安平搭公車到勝利路上的成大醫院急診，第一次自己找檢查室，手裡捏著單子在走道繞了好幾圈。看得見大字，遇到相似名稱就會慌。',
      look:{skin:'#e8c7a1',outfit:'#b2f2bb',head:'egg',hair:'bald',eyes:'droopy',mouth:'frown',prop:'clipboard'},
      speech:'慢慢說，偶爾用「歹勢」請人再講一次，常把方向記成「剛才那邊」。', knows:['手上單子寫著斷層檢查','她認得大圖示，不太分得清樓翼名稱'], unknown:['院內縮寫的意思'],
      layers:{surface:'我想找單子上寫的檢查室，歹勢，再跟我說一次。',events:['剛才她跟著「影像中心」的箭頭走到另一條走道，問了兩次才發現檢查室叫 CT；她說從安平搭車來，沿路已經問過一次方向。','她去洗手間後回來，忘了原本要往哪個顏色的門走，先和志工寒暄一句「呷飽未」，才鼓起勇氣再問路。'],need:'她希望現場名稱能和單子上的叫法一樣，轉彎處再重複一次目的地；只看顏色容易記錯，最好有清楚圖示和大字，別讓第一次到成大的人一路靠問路補上缺掉的指標。'},
      reactions:{leading:'不會直接附和，會先說「我看不懂啦」。',jargon:'聽到動線或節點就愣住，請你換白話。',repeat:'重問會以為自己答錯，聲音更小。',sensitive:'被問年紀或記性會不自在。',rapport:'先陪她看手上的單子，她就願意慢慢回想。'},
      avail:{moving:'short',acts:{'找檢查室':'short','看手上的單子':'free','問路':'short'},eventBlocks:false},
      idle:['（捏著單子轉圈）','「剛剛是往這裡嗎？」','（瞇眼找字）','「這個名字不一樣耶。」'], cases:['way']
    },
    {
      id:'wheel_ming', name:'阿明', title:'輪椅使用者', core:true, material:'模擬', decision:true,
      bio:'五十多歲，從仁德搭車來成大醫院做檢查。坐輪椅時轉彎處常被臨時推車擋住，抬頭標示也容易被人群遮掉。',
      look:{skin:'#f1d6b8',outfit:'#74c0fc',head:'square',hair:'tuft',eyes:'dots',mouth:'flat',prop:'crutch'},
      speech:'直接講哪裡卡住，偶爾拿輪椅開玩笑。', knows:['入口坡道在哪','走廊轉彎處視線高度'], unknown:['標示更換由誰負責'],
      layers:{surface:'路還算平，就是有幾個地方不好轉；外面又熱，走錯一段更累。',events:['上次去 CT，地面箭頭被推車停的位置截斷，他只好倒回去找人問；午後雷陣雨時地面反光，色線更難辨認。','大廳吊牌被排隊人潮遮住時，他從坐姿完全看不到，連勝利路入口的方向也得等到近處才看清。'],need:'他支持在地面畫連續色線，輪椅高度也看得到；但午後雨天會反光、清潔後也可能被遮，轉角還要保留足夠通行寬度，不能用立牌再製造障礙，牆面低處也應有連續指引。'},
      reactions:{leading:'你先說結論，他會指出你漏掉的轉角。',jargon:'會問「講人話，是哪條路？」',repeat:'可以重答，但希望你記下實際卡點。',sensitive:'不喜歡被當成需要幫忙的代表。',rapport:'先問能不能談他的路線，不要直接推輪椅。'},
      avail:{moving:'short',acts:{'等候陪同':'free','前往 CT':'short','通過轉角':'short'},eventBlocks:false}, idle:['（轉輪椅找空位）','「箭頭斷在推車後面。」','（抬頭找吊牌）','「坐著看不到啦。」'], cases:['way']
    },
    {
      id:'mei_guest', name:'美玲', title:'外籍訪客', core:true, material:'模擬', decision:true,
      bio:'三十歲左右，陪親人從東寧路一帶來成大就診，中文能日常溝通但看不懂縮寫和密集文字。手機能翻譯，院內網路不一定穩。',
      look:{skin:'#f3c9a5',outfit:'#d0bfff',head:'pear',hair:'curl',eyes:'dots',mouth:'open',prop:'phone'},
      speech:'句子短，會重複確認房間名稱。', knows:['手機翻譯可以辨識完整句子','圖示比單獨的英文縮寫容易懂'], unknown:['院內英文縮寫代表哪個服務'],
      layers:{surface:'我想去檢查的地方，名字有一點不一樣；歹勢，可以指給我看嗎？',events:['單子寫「影像檢查」，牆上只有 CT 字樣；她先開翻譯再問志工，擔心急診裡網路不穩時連翻譯也打不開。','她看到洗手間圖示就認得，但「服務台」不知道是問路還是登記；陪診親人只說「去問一下」，沒有說清楚要找哪個窗口。'],need:'她支持統一名稱並搭配容易辨識的圖示，重要指標可有簡單雙語；不想每個地方都塞長翻譯，越長越難快速找。台南夏天等候時常覺得悶熱，標示若要停下來逐字翻譯，也更難一邊照看親人一邊辨路。'},
      reactions:{leading:'會先說好，但若沒理解就照自己猜。',jargon:'會請你說簡單一點或打出關鍵字。',repeat:'重複確認時會拿手機翻譯核對。',sensitive:'不想被追問國籍或中文程度。',rapport:'示範一個標示怎麼看，她就願意分享。'},
      avail:{moving:'short',acts:{'陪親人找路':'short','查看手機翻譯':'free','問服務台':'short'},eventBlocks:false}, idle:['（切換翻譯畫面）','「這兩個名字是一樣嗎？」','（比對單子和牆牌）','「圖案我看得懂。」'], cases:['way']
    },
    {
      id:'vol_route', name:'小葵', title:'入口志工', core:true, material:'模擬', decision:true,
      bio:'入口志工，常替第一次來成大急診的人指路。她很熟勝利路入口到各走道的常用路線，但不同人拿到的單子用詞不一樣時也會猶豫。',
      look:{skin:'#f1d6b8',outfit:'#ffec99',head:'egg',hair:'tuft',eyes:'dots',mouth:'teeth',prop:'clipboard'},
      speech:'熱心、語速快，會用手比方向。', knows:['入口到 CT 的常用路徑','常見的問路目的地'], unknown:['搬遷公告是否已全部更新'],
      layers:{surface:'你要去哪裡？我帶你看方向。',events:['有人拿舊單子找「放射室」，她先帶到 CT 門口才知道單子沿用舊叫法。','她畫過紙條地圖，病人走過第一個轉角就找不到下一個箭頭。'],need:'她支持統一名稱與圖示，並在每個轉彎重複目的地；手機地圖對會用的人方便，但不能讓不會掃碼的人失去指引。'},
      reactions:{leading:'會熱心答應，但會補充自己的例外經驗。',jargon:'聽不懂就請你改成路口和房間名稱。',repeat:'會拿地圖重新走一遍給你看。',sensitive:'問到忙不忙會笑說「習慣了啦」。',rapport:'肯定她實際帶路的經驗，她會說得更細。'},
      avail:{moving:'free',acts:{'幫忙指路':'short','站入口':'free','陪訪客走一段':'short'},eventBlocks:false}, idle:['（揮手招呼）','「跟著我走一小段。」','（指向走道）','「下一個轉角還有牌子。」'], cases:['way']
    },
    {
      id:'clean_ya', name:'雅姐', title:'清潔人員', core:true, material:'模擬', decision:true,
      bio:'清潔人員，推車巡走入口到洗手間一帶。台南午後常有一陣雨，她看過不少人停下來找路，也得配合臨時清潔和地面安全。',
      look:{skin:'#e8c7a1',outfit:'#adb5bd',head:'pear',hair:'cap',eyes:'droopy',mouth:'flat',prop:'bottle'},
      speech:'務實俐落，講到地板就很認真。', knows:['地面箭頭常被推車和濕地告示遮住','清潔後地貼翹起來的位置'], unknown:['誰核准更換指標'],
      layers:{surface:'我每天都在這幾條走道跑。',events:['地貼邊角翹起來時，她用膠帶暫時壓住，隔天又被拖地拖開。','清潔時放告示牌，正好遮住一小段地面箭頭。'],need:'她反對只靠地板色線，因為清潔、磨損和濕地告示都會讓線斷掉；若採用，必須容易替換，牆面標示仍要能獨立帶路。'},
      reactions:{leading:'不會附和，會指出清潔工作的限制。',jargon:'會問這東西要怎麼擦、多久換一次。',repeat:'第二次會補一個現場例子。',sensitive:'被問工作流程時不喜歡像被檢查。',rapport:'先說明不是要評她工作，她會分享維護細節。'},
      avail:{moving:'short',acts:{'推車清潔':'short','清理走道':'short','補清潔用品':'free'},eventBlocks:false}, idle:['（推車慢慢過）','「這角翹了喔。」','（扶正告示牌）','「拖地不能停在半路啦。」'], cases:['way']
    },
    {
      id:'guard_path', name:'阿福', title:'入口警衛', core:false, tangent:'誤導', material:'模擬', decision:false,
      bio:'入口警衛，常在勝利路入口回答訪客問題。喜歡憑印象指路，有時把舊走法說得像剛更新，內容需要其他線索查證。',
      look:{skin:'#e8c7a1',outfit:'#868e96',head:'square',hair:'cap',eyes:'dots',mouth:'flat',prop:'guardhat'},
      speech:'爽朗肯定，方向常用「那邊」帶過。', knows:['入口附近的門和走道','自己常看到的訪客問路情形'], unknown:['近期所有改道和搬遷公告'],
      layers:{surface:'找地方喔？直直走啦。',events:['他說 CT 一直都在藍色牌子旁，但那塊藍牌早已換成紫色。','他記得服務台「好像在大廳左邊」，其實他很久沒去過。'],need:'他沒有可靠的設計需求；他覺得熟人帶一下就好。學生應查對他提到的舊牌和方向，不能把他的肯定語氣當成現況。'},
      reactions:{leading:'你問是不是標示不清，他會順口說對。',jargon:'把術語當成路名，答得很肯定。',repeat:'重問會換一條路線，前後可能不一致。',sensitive:'問他是否記錯會笑著轉話題。',rapport:'聊聊今天問路的人，他會多說幾個例子。'},
      avail:{moving:'free',acts:{'站入口':'free','回答問路':'short','巡看大門':'short'},eventBlocks:false}, idle:['「直直走就到了啦。」','（看著舊方向牌）','「以前是往左吧？」','（對自己點頭）'], cases:['way']
    },
    {
      id:'nurse_map', name:'小蓉', title:'新進護理師', core:true, material:'模擬', decision:true,
      bio:'從新營到成大急診任職不久，工作流程已慢慢熟悉，但院區各翼的名稱和指標仍常要再確認。病人問路時會盡量陪著走。',
      look:{skin:'#f3c9a5',outfit:'#74c0fc',head:'egg',hair:'curl',eyes:'dots',mouth:'open',prop:'nursecap'},
      speech:'很客氣，忙時會邊走邊說。', knows:['病人單據常見目的地名稱','新同事最常問的路線'], unknown:['指標改版的決策流程'],
      layers:{surface:'我可以幫你確認一下方向。',events:['新進同事把「服務台」和「檢查報到」當成同一處，跟病人走錯一次。','她用手機照片放大看遠處吊牌，才認出 CT 指標。'],need:'她支持統一名稱和圖示，對新手與病人都省下確認時間；手機地圖可以補充，但急著處理事情時不可能每次教病人掃碼。'},
      reactions:{leading:'會先照顧病人感受，再講自己的觀察。',jargon:'熟悉護理用語但會改成病人聽得懂的說法。',repeat:'願意回答，但會提醒自己正在值班。',sensitive:'不談個別病人的行程細節。',rapport:'先說明研究不評個人表現，她會談系統問題。'},
      avail:{moving:'short',acts:{'交班':'blocked','陪病人找路':'short','查看檢查單':'short'},eventBlocks:true}, idle:['（翻看小地圖）','「我剛來時也走錯過。」','（抬頭找指標）','「這個縮寫病人不一定懂。」'], cases:['way']
    },
    {
      id:'facility_ren', name:'阿任', title:'設施維護人員', core:true, material:'模擬', decision:true,
      bio:'負責成大院內標牌、照明和簡易修繕。知道標示從製作到更換要跨好幾個窗口，臨時改道常來不及同步。',
      look:{skin:'#e8c7a1',outfit:'#ffa94d',head:'square',hair:'cap',eyes:'droopy',mouth:'flat',prop:'clipboard'},
      speech:'講流程很清楚，遇到臨時需求會嘆氣。', knows:['標牌申請與更換流程','走道地貼容易磨損的位置'], unknown:['使用者看牌時真正理解了什麼'],
      layers:{surface:'標示要改可以提單，我們會排。',events:['電梯維修時臨時貼紙方向和吊牌箭頭相反，兩天後才有人通報。','一張指標要改字，得等版面確認、印製和安裝排程。'],need:'他支持手機導覽地圖作為臨時改道的快速更新方式，但要有人維護內容；只加地貼會增加巡檢和更換工作，不能把維護責任當成免費。'},
      reactions:{leading:'會先問你預設由誰維護。',jargon:'可以談標準，但會追問落地流程。',repeat:'第二次會畫出申請步驟。',sensitive:'不想被說成拖延，會說清楚等待環節。',rapport:'承認維護也有成本，他就願意一起估算。'},
      avail:{moving:'free',acts:{'巡檢標牌':'short','回報故障':'short','整理工單':'free'},eventBlocks:false}, idle:['（拿著卷尺）','「這張誰核過字？」','（看工單嘆氣）','「改完要記得拆舊的。」'], cases:['way']
    }
  ];

  var mutters = {
    auntie_lin:['（單子越捏越皺）','「歹勢，這個字剛剛不是這樣嗎？」','（往回走兩步）','「先找個人問好了。」','（瞇眼看箭頭）','「我記得是藍色吧，欸？」'],
    wheel_ming:['（輪子卡了一下）','「轉彎比找字難。」','（抬頭找牌）','「人一多就看不到。」','（退回空一點的路）','「雨天反光，地上線更看不清。」'],
    mei_guest:['（打開翻譯）','「CT 是這個嗎？」','（拍下牆牌）','「服務台可以問路嗎？」','（看手機訊號）','「圖案比縮寫容易。」'],
    vol_route:['（比出左轉手勢）','「下一個彎也要有牌。」','（翻地圖）','「每張單子的名字都不同。」','（扶好紙條地圖）','「從勝利路進來，轉角也要接得上啦。」'],
    clean_ya:['（推車讓出路）','「膠帶又翹了。」','（放好濕地牌）','「地上的箭頭被擋住。」','（拿拖把擦過）','「午後下過雨，這些要有人巡。」'],
    guard_path:['「走那邊就對啦。」','（指了個大概方向）','「牌子以前在這裡。」','（看看舊貼紙）','「我記得啦。」','（轉身去看門口）'],
    nurse_map:['（拿手機放大）','「這縮寫我也要想一下。」','（陪人走到轉角）','「再一個箭頭就好。」','（看一下值班呼叫）','「從新營剛來時，我也常確認院區名稱。」'],
    facility_ren:['（翻工單）','「這塊誰負責更新？」','（摸摸地貼邊角）','「換牌也要排工。」','（抄下位置）','「舊的要記得撤。」']
  };

  return {
    meta:{
      id:'way', prefix:'N', name:'轉角到底是哪一邊？', short:'急診尋路與標示',
      brief:'第一次到勝利路成大醫院急診的林阿姨拿著檢查單，在入口、走道和服務台之間繞了幾圈。單子寫「影像檢查」，牆上卻標 CT；洗手間圖示看得懂，轉出來又忘了該往哪個顏色走。輪椅使用者、陪診訪客和第一線人員也各有不同的卡點。台南午後雷陣雨讓地面指引更難辨認。請找出名稱、圖示、色線與臨時改道如何影響尋路，再提出能被不同人理解且有人維護的改善方向。',
      goal:['哪幾組名稱或圖示讓人對不上目的地？','不同視線高度和語言需求如何改變找路方式？','臨時改道與標示維護在哪個環節失靈？'],
      focus:['一致性與標準','辨識優於回想','符合真實世界用語'],
      directions:['地板色線導引','統一名稱與圖示','手機導覽地圖'], mainPersona:'auntie_lin',
      roomsFocus:['entrance','hall2','corridor','restroom','ct','lobby','service']
    },
    clues:[
      {id:'N-01',title:'檢查單上的舊稱呼',body:'林阿姨從安平搭公車到勝利路上的成大醫院，模擬檢查單寫著「影像檢查」，沒有樓翼或房間代碼。她一直找相同四個字的牌子，看到 CT 時不確定是不是同一個地方。',material:'模擬',role:'key',pin:{room:'entrance',rx:15,ry:60}},
      {id:'N-02',title:'入口兩種箭頭',body:'入口牆牌用藍色箭頭指向走道，旁邊的紙本小圖卻用紫色標檢查區。沒有圖例說明顏色代表樓翼還是服務類別，第一次來的人容易各自解讀。',material:'模擬',role:'key',pin:{room:'entrance',rx:15,ry:10}},
      {id:'N-03',title:'轉彎後沒有續牌',body:'從勝利路入口走進主要走道，第一段箭頭指得很清楚；過了第一個轉角後，視線裡只剩房間代碼。訪客常停下來回頭找剛才的指標，確認自己有沒有走過頭。',material:'模擬',role:'key',pin:{room:'corridor',rx:12,ry:8}},
      {id:'N-04',title:'地上箭頭斷一截',body:'走道地面有一小段舊色線，靠近轉角的位置被推車和清潔告示遮住。午後雷陣雨後地面反光，阿明坐輪椅時更難看清；線一斷就無法判斷應該跟著哪一邊走。',material:'模擬',role:'key',pin:{room:'corridor',rx:150,ry:8}},
      {id:'N-05',title:'洗手間圖示看得懂',body:'洗手間門口的男女圖示清楚，林阿姨不必讀字就找得到。離開洗手間後，走道沒有重複顯示大廳或 CT 的方向，她只記得剛才跟著一條顏色走。',material:'模擬',role:'key',pin:{room:'restroom',rx:10,ry:110}},
      {id:'N-06',title:'門上貼著臨時箭頭',body:'洗手間外多貼了一張手寫箭頭，紙張和門牌顏色接近。阿福說這張是最近才貼的，但設施工單記錄顯示它已貼了一段時間，資訊需要再向現場確認。',material:'模擬',role:'noise',pin:{room:'restroom',rx:110,ry:110}},
      {id:'N-07',title:'CT 縮寫沒有解釋',body:'檢查室門牌只印 CT，旁邊沒有「斷層檢查」或「影像檢查」等單據常見說法。美玲能讀英文字母，仍不確定這是不是她要找的檢查地點。',material:'模擬',role:'key',pin:{room:'ct',rx:160,ry:40}},
      {id:'N-08',title:'掃描器旁的舊貼紙',body:'控制室玻璃附近留著一張褪色小貼紙，箭頭朝向操作台。它只指向工作設備，沒有病患報到資訊；訪客容易把所有箭頭都當成自己該走的方向。',material:'模擬',role:'noise',pin:{room:'ct',rx:20,ry:170}},
      {id:'N-09',title:'入口到檢查室的小地圖',body:'志工畫的手繪路線有標出兩個轉角，目的地卻寫「影像區」。林阿姨認得圖上的門和路口，仍無法確認影像區是否就是單子所說的檢查室。',material:'模擬',role:'key',pin:{room:'ct',rx:330,ry:170}},
      {id:'N-10',title:'大廳吊牌被人潮擋住',body:'成大急診大廳的指標掛在高處，排隊的人一多就被遮住。阿明坐著時視線更低，會先看到繳費機上的字，卻看不到通往服務台的方向牌；入口外的勝利路名稱也幫不上室內尋路。',material:'模擬',role:'key',pin:{room:'lobby',rx:10,ry:6}},
      {id:'N-11',title:'兩個窗口叫法相近',body:'大廳牆牌寫「服務台」，附近一張流程紙寫「諮詢處」。美玲以為兩者是不同地方，林阿姨則以為服務台只處理探病登記，不敢進去問路。',material:'模擬',role:'key',pin:{room:'service',rx:10,ry:6}},
      {id:'N-12',title:'地圖架缺少更新日期',body:'服務台旁的成大院區導覽地圖沒有標出製作日期，也沒有指出哪些區域近期調整過。阿福拿它指路時說「應該差不多」，但訪客無從判斷這張圖還是不是最新版本。',material:'模擬',role:'noise',pin:{room:'service',rx:10,ry:180}}
    ],
    personas:personas,
    mutters:mutters,
    schedules:{
      wheel_ming:[['entrance-mid',18,'陪同者核對入口方向'],['entrance-mid',22,'往 CT 途中確認轉角'],['lobby-counter',20,'詢問服務台位置']],
      mei_guest:[['guard-desk',15,'入口詢問路線'],['svc-desk',20,'確認服務台用途'],['ct-console',25,'陪親人找檢查室']],
      vol_route:[['entrance-mid',20,'幫忙指路'],['entrance-mid',25,'陪訪客走到轉角'],['svc-desk',20,'回服務台整理地圖']],
      clean_ya:[['entrance-mid',20,'清理入口走道'],['entrance-mid',25,'推車巡走主要走道'],['rr-inside',20,'清潔洗手間外側']],
      guard_path:[['guard-desk',25,'回答入口問路'],['entrance-door',20,'查看大門出入'],['entrance-mid',20,'巡視大廳']],
      nurse_map:[['triage-desk',30,'確認病人檢查單'],['ct-console',20,'陪同病人確認地點'],['nurse-desk',20,'回護理站交班']],
      facility_ren:[['svc-board',25,'查看標示修繕工單'],['entrance-mid',20,'巡檢走道箭頭'],['ct-console',20,'確認檢查區指標']]
    },
    named:[{persona:'auntie_lin',appear:520,esi:4,complaint:'第一次來做檢查，拿著單子找不到檢查室',main:true,route:[['entrance-mid',18,'入口拿出檢查單'],['entrance-mid',25,'跟著指標找 CT'],['rr-inside',8,'詢問洗手間位置'],['entrance-mid',20,'回頭確認往哪走'],['ct-table',18,'抵達檢查室門口'],['lobby-counter',14,'返回大廳找人問路']]}],
    events:[
      {id:'N-E1',title:'午後雷雨後地面指引難辨',at:[560,680],dur:35,rooms:['entrance','corridor','ct'],busy:['facility_ren','vol_route'],text:'台南午後雷陣雨後，入口地面濕滑反光，清潔告示也遮住一段色線。志工開始口頭改道，訪客卻在第一個轉角看不到續行提示。'},
      {id:'N-E2',title:'活動人潮遮住高處吊牌',at:[720,850],dur:45,rooms:['lobby','service','hall2'],busy:['guard_path','vol_route'],text:'大廳臨時活動排起隊伍，服務台和走道方向牌被人群遮住。幾位剛從台南火車站方向抵達的訪客跟著隊伍走到不相關窗口，再折返詢問。'}
    ],
    layersOverride:{
      guard:{surface:'今天勝利路入口問路的人不少，我都盡量指清楚。',events:['我有時直接說「一直走」，但大家走到轉角還是會回來問。','電梯維修時我記得有貼紙，現在還在不在我沒注意；台南午後下雨，地上那條色線也常不明顯。'],need:'我覺得入口多放一位人手最快，但人員交班後說法可能不一樣，也不能一直靠人帶路。若改指標，要讓勝利路入口到轉角一路都接得上。'},
      volunteer:{surface:'需要問路的話，我可以先陪你看成大院區地圖。',events:['我帶過拿「影像檢查」單子的人，牆上卻只看到 CT；從台南火車站方向來的訪客也常先問入口在哪。','紙本地圖畫得很仔細，但有人走到第一個轉角就不記得下一步，午後雨天還有人低頭避水沒看到地貼。'],need:'我支持統一單據與指標上的名稱，轉角要重複目的地；手機地圖可當補充，現場仍要讓不方便掃碼的人看得懂，尤其剛下公車或遇上雨天的人不能只靠地面色線。'},
      admin:{surface:'成大院內標示改善可以提案，我們會盤點需求。',events:['上次臨時改道只換了勝利路入口告示，走道吊牌沒同步。','各單位提交的房間名稱不一致，製作前常要來回確認；午後雨天後地面指引的維護也得排進工作。'],need:'我傾向先統一名稱與圖示，再分階段更新標牌，成本和維護量較能估算。手機導覽要長期有人更新；地板色線也需要清潔和定期重貼，現有人力還得兼顧急診其他修繕。'},
      radiology:{surface:'檢查區入口就在走道盡頭，牌子上有縮寫。',events:['病人拿著寫「影像檢查」的單子來問 CT 是不是同一處。','有訪客看到了 CT 牌，仍在門口等人確認才敢進去。'],need:'我支持在 CT 旁加上一般人看得懂的完整名稱和圖示，免得病人只靠縮寫猜。導引線可帶到門口，但檢查室內仍要清楚標出報到位置。'}
    },
    captions:{
      entrance:'從勝利路走進成大急診，每個人都從入口開始，但不一定看得懂同一支箭頭。',
      corridor:'午後雨水讓地面反光，箭頭在直線上很勇敢，到了轉角就突然害羞。',
      restroom:'找得到洗手間只是半段路，走出來也要知道往哪裡去。',
      ct:'CT 對熟悉的人是縮寫，對第一次來的人像密碼。',
      lobby:'人潮一多，吊牌就練成了隱形術。',
      service:'地圖沒日期，方向就只能靠「我記得」。'
    }
  };
});


