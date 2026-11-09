/* 步驟助教核心（F⑩）：Figma→AI Studio 單元的規則式助教，純函式，不呼叫模型、不連網、不寫資料庫。
   與 _figma_mcp/助教原型_1108/index.html 裡 id="coach-core" 的那段內容逐字相同（test_figai_coach.js 會比對，改了要兩邊一起改）。
   瀏覽器：全域 FigCoach；Node：require('./figai_coach.js')。畫面層見 figai_coach_ui.js。 */
/* 助教核心（純函式，Node 與瀏覽器共用）。規則式，不呼叫模型。
   2026-11-09 改成「六份」：依學習單交錯順序 Figma 1/3 → AI Studio 1/3 → Figma 2/3 → AI Studio 2/3 → Figma 3/3 → AI Studio 3/3。
   新手／中級／專家只在 2/3、3/3 分；兩個 1/3 全班同一套（助教一律用新手的帶領方式，不出現模式選擇）。
   新手全程帶領（等級 1 方向／2 例子／3 示範／4 代填）、中級被動（卡住或停太久才出現，只到等級 2）、專家只在交出後給評語。
   自動出現的第 1 級不扣名額；「我卡住了」、再多一點（等級請求）、代填各扣 1 次名額（每天 30）。 */
var FigCoach = (function () {
  'use strict';
  var COACH_PER_DAY = 30, FILL_CAP = { novice: 4, mid: 0, expert: 0 };
  var MODES = { novice: { name: '新手' }, mid: { name: '中級' }, expert: { name: '專家' } };
  var CAPS = { 1: 70, 2: 110, 3: 130, 4: 90, review: 70, fillBody: 260, intro: 300 };   /* 助教文字字數上限（算字元）；fillBody＝代填進欄位的指令本文；intro＝頁首三句 */
  var LEVEL_NAME = { 1: '方向', 2: '例子', 3: '示範', 4: '代填' };
  var FORBIDDEN = ['分數', '評分', '給你幾分', '我幫你設計', '你的設計不好', '應該用藍色'];
  var PRIVACY = /\d{7,}|\b4[a-z0-9]{2}[a-z]\d{4}\b|[A-Z][12]\d{8}|病歷號|身分證|姓名[：:]|\d{2,4}年\d{1,2}月\d{1,2}日/i;

  /* ———— 六份（順序＝學習單交錯順序）。modes＝這一份分不分新手／中級／專家；next＝做完接哪一份 ———— */
  var PART_ORDER = ['f1', 'a1', 'f2', 'a2', 'f3', 'a3'];
  var PARTS = {
    f1: { n: 1, tool: 'Figma', name: 'Figma 1/3', week: 'W10', title: '開始用 Figma', modes: false, next: 'a1', done: '有一條打得開的 Figma 連結',
          deliver: 'Figma 連結（確認別人打得開）', time: '30～40 分鐘', nextNote: '只用老師樣板 D 畫面的圖，不用等自己的畫面' },
    a1: { n: 2, tool: 'AI Studio', name: 'AI Studio 1/3', week: 'W11', title: '把畫面還原成網頁', modes: false, next: 'f2', done: '有一條打得開的 AI Studio 連結和一張預覽截圖',
          deliver: 'AI Studio 作品連結（設成別人打得開），加上一張預覽截圖', time: '30～40 分鐘；第一次生成約 4 分鐘', nextNote: 'W13 的 AI Studio 2/3 會用到你在那一份畫好的畫面' },
    f2: { n: 3, tool: 'Figma', name: 'Figma 2/3', week: 'W12', title: '畫自己的一頁', modes: true, next: 'a2', done: '寬 390 的畫面、便條、Claude 整合截圖',
          deliver: 'Figma 連結（同一個檔，新增你自己的畫面；Share（分享）視窗裡 Anyone 那一列是 can view），加上一張 Claude 整合的截圖（看得到它的建議，以及你決定改或不改的理由）', time: '50～60 分鐘（Claude 整合約 10～15 分鐘）', nextNote: '會用到你這一份畫好的畫面',
          extra: { mid: '中級加做：把畫面拆成區塊、互動、狀態，每個狀態畫成一個畫面。', expert: '專家加做：先寫一份自己的設計規則，再畫多個畫面。' } },
    a2: { n: 4, tool: 'AI Studio', name: 'AI Studio 2/3', week: 'W13', title: '加一個互動', modes: true, next: 'f3', done: '互動能用、連結打得開、兩張 Claude 整合截圖',
          deliver: 'AI Studio 作品連結（你自己的畫面，已加上互動；設成別人打得開），加上兩張 Claude 整合的截圖（它寫的指令；它找出的漏洞和你的決定）', time: '60～70 分鐘（還原約 30 分鐘，互動約 15 分鐘，Claude 整合共約 20 分鐘）',
          extra: { mid: '中級加做：至少 2 個互動，每個都對得回訪談的一句話。', expert: '專家加做：多個畫面之間能跳轉，風格一致。' } },
    f3: { n: 5, tool: 'Figma', name: 'Figma 3/3', week: 'W14', title: '試用並改一版', modes: true, next: 'a3', done: '改前、改後兩張 PNG、試用紀錄、Claude 整合截圖',
          deliver: 'Figma 連結，加上改前、改後兩張 PNG（用 Export（匯出）輸出），再加一段試用紀錄（試用的人卡在哪、你改了什麼、為什麼），以及一張 Claude 整合的截圖', time: '50 分鐘左右（Claude 整合約 10～15 分鐘）', nextNote: '改的是你在 W13 AI Studio 2/3 做的網頁',
          extra: { mid: '中級加做：至少改 2 版，每一版都寫「改了什麼、為什麼」。', expert: '專家加做：至少改 3 版，每一版都寫「改了什麼、為什麼」。' } },
    a3: { n: 6, tool: 'AI Studio', name: 'AI Studio 3/3', week: 'W15', title: '試用、改版、提交', modes: true, next: null, done: '提案室匯出的 PDF 已交到 flipclass、Claude 整合截圖',
          deliver: '提案室匯出的 PDF（裡面有 Figma 連結和 AI Studio 作品連結），加上評分三項，以及一張 Claude 整合的截圖（它列出的缺漏，和你補了什麼）', time: '50～60 分鐘（Claude 整合約 10～15 分鐘）；截止 W18 下課，W16～18 可以繼續改',
          extra: { mid: '中級加做：至少 2 版，試用者 1 位以上。', expert: '專家加做：至少 3 版，十項自評，試用者 2 位以上。' } }
  };
  var LV_OF = { novice: 1, mid: 2, expert: 3 };

  var P1 = '請照著這張手機畫面做一個網頁，寬度 390。每一句文字都要照圖上的原文，不要改寫、不要增加內容。顏色和排版盡量和圖一樣。不要照圖上的換行位置硬斷行，讓文字自己排版。不要接任何外部服務。';
  var OPTS = { 1: ['有問題　回急診', '請馬上帶他回呼呼醫院急診室，告訴護理師他一直吐、叫不醒或手腳沒力'], 2: ['一鍵傳給家人', '一則要傳給家人的訊息：今天要做的三件事'] };   /* 按鈕名字中間是全形空格，照畫面上的字 */
  function p2(o) { return '在目前的畫面上只加一個互動：點「' + OPTS[o][0] + '」會出現「' + OPTS[o][1] + '」。點整個區塊都能觸發，不只是文字。其他地方都不要動。不要真的傳送任何資料。'; }
  var FIX2 = '版面跑掉了。請只調整間距和字級，讓它和我給的圖一樣；文字、顏色、功能都不要動。下面是 Figma 量到的字級：＿＿';   /* 學習單 AI Studio 1/3 的「版面跑掉時」；尾巴「下面是 Figma 量到的字級」是母線 11-09 12:20 決定先加，等 F② 發布後對字 */
  var ITEM = {
    1: { l3: '字掉了或被改寫：貼「版面跑掉時」那句；還是不對，把缺的字一句一句列出來，要求逐字照用。', cause: '常見原因：指令沒要求逐字照原文。' },
    2: { l3: '版面跑掉：貼這句。「' + FIX2 + '」', cause: '預覽的字比 Figma 的小一點很常見；有尺寸表就對照，差在 2 px 以內就不用再調。', fill: FIX2 },
    3: { l3: '按鈕沒反應：把「點哪個」寫得更明確，並寫「點整個區塊都能觸發」；指令一改就整個重做，開頭加「只修改下面說明的部分，其他完全不要動」。', cause: '常見原因：指令沒寫清楚點哪個、出現什麼。' },
    4: { l3: '畫面上有真人資料：換成練習資料，重新匯出再上傳，不要送出含真人資料的圖。', cause: '先把真人資料換成練習資料，再重新上傳。' }
  };

  /* ———— 英文介面字樣表：Figma 與 AI Studio 都沒有中文介面，學生會怕英文，所以助教每次提到按鈕都寫「英文（中文意思）」並說位置。
     字樣與中文意思照 _figma_mcp/英文按鈕中文對照_1108.md（只收實測看到的字）；測試會檢查每則提示的寫法。 */
  var UI_TERMS = { 'Export': '匯出', 'Layers': '圖層', 'Preview': '預覽', 'Restore': '還原', 'Upload Files': '上傳檔案', 'Acknowledge': '我知道了', 'Drafts': '草稿', 'Design': '設計',
    'Duplicate': '複製', 'Share': '分享', 'Copy link': '複製連結', 'General access': '一般存取權', 'Public': '公開', 'Restricted': '限制存取', 'Default mode': '預設模式', "I'm feeling lucky": '手氣不錯', 'Move to trash': '移到垃圾桶' };
  var UI_TERMS_SRC = { 'Duplicate': '學生視角走一遍_W12_1109.md', 'General access': '學生視角走一遍_W12_1109.md', 'Public': '學生視角走一遍_W12_1109.md', 'Restricted': '學生視角走一遍_W12_1109.md', 'Default mode': '學生視角走一遍_W12_1109.md', "I'm feeling lucky": '學生視角走一遍_W12_1109.md', 'Move to trash': '學生視角走一遍_W12_1109.md' };
  var POS_WORDS = /左邊|右邊|左側|右側|左下|右下|右上|左上|最下面|最上面|輸入框|下方|上方|旁|視窗|回覆|面板|灰字/;
  /* Claude 免費帳號有 5 小時用量上限：先想好再送，不要一直重試（原文提示例：您的 5 小時限制已使用超過 90% · 將於 上午1:00 重設） */
  var CLAUDE_LIMIT = {
    short: '5 小時內約 4～5 次生成、3～4 次小修改，先想好再送',
    tips: [
      '免費帳號每 5 小時有用量上限，大約夠做 4～5 次生成＋3～4 次小修改（請 Claude 讀 Figma 約 2 次）。這是估計，因人、因時段而不同。',
      '一次把指令寫完整：畫板數量、寬度、每個畫板的名稱、主色、文字都寫在同一則，不要分很多則補。',
      '要改就在同一個對話追加：「只修改『3 回診提醒』畫板，把按鈕改成橘色，其他不要動」，不要開新對話重新生成。',
      '看到輸入框上方出現「您的 5 小時限制已使用超過 90% · 將於 上午1:00 重設」，就先停手，去做不耗額度的事：在 Figma 手動調整，再按右側最下面 Export（匯出）旁的 ＋ 輸出 PNG。'
    ]
  };

  /* ———— 素材：圖是檔案，放 demo_data/figai_img/，不塞進 js ———— */
  var IMG_DIR = 'demo_data/figai_img/';
  var MEDIA = {
    figma_start: 'Figma 裡的樣板畫面，左邊是圖層、右邊是屬性欄', figma_select: 'Figma：左側圖層點選整個畫面，畫面出現藍框', figma_export: 'Figma 右邊屬性欄最下面的 Export 區，選 PNG、1x',
    figma_exported: '匯出後得到的 PNG 圖片（要交給 AI Studio 的那張）', figma_screen: '你在 Figma 畫好的手機畫面（寬 390）',
    ais_home: 'Google AI Studio 首頁的輸入框', ais_upload: 'AI Studio 上傳圖片後，圖片出現在輸入框上方', ais_prompt: 'AI Studio 貼好指令、附好圖，準備送出',
    ais_done: 'AI Studio 生成完成', ais_preview: 'AI Studio 右邊的預覽，應該和 Figma 畫面一樣', ais_second: 'AI Studio 第二段互動做完',
    ais_try1: '試用前：畫面上的選項還沒勾', ais_try3: '勾了三項之後的畫面', ais_try4: '按下按鈕後跳出的視窗', ais_try5: '按下「知道了」後視窗關閉',
    free_read: 'Claude 免費版貼上 Figma 畫面連結，讀出每個元件的尺寸（只能讀）', free_connector: 'Claude 設定的連接器頁，Figma 打勾就是接好了',
    figma_layers_drag: 'Figma 左側 Layers 欄，把大卡 3 拖到大卡 1 上面之後的樣子', figma_share: 'Figma 的 Share this file 視窗，Anyone 那一列寫 can view', ais_share: 'AI Studio 的 Share 面板，General access 下拉有 Public 與 Restricted 兩個選項', claude_limit: 'Claude 輸入框上方的提示條：您的 5 小時限制已使用超過 90%，將於 上午1:00 重設', dsg_gen: 'Claude 免費版用一句話生成設計畫板', dsg_edit: '再用一句話修改畫板：只改「回診當天」的卡片，其他部分不要動', dsg_d1: '新手題生出來的兩個畫板'
  };
  /* 「用 Claude 生一張初稿」的示範：一句話生成、再一句話修改（Claude 免費版，只在對話裡生成與修改，不會改你的 Figma） */
  var START_MEDIA = { gen: [['dsg_gen', 'dsg_d1', 'dsg_edit', 'claude_limit'], '用一句話生成草稿畫板，再用一句話修改；一次只改一處。'] };
  /* 目前沒有專屬截圖、先用相近的圖頂著的步驟（part.步驟號：缺什麼圖）。補好圖就把這裡的項目刪掉。 */
  var MEDIA_GAPS = {
    'f1.1': 'Figma 登入頁／檔案首頁', 'f1.3': '點檔名後可輸入的狀態', 'f2.1': '新增設計檔的畫面', 'f2.2': '按 F 拉框後右側 W／H 欄位', 'f2.3': '右側 Typography（文字）與 Fill（填色）區', 'f2.4': 'Shift＋A 之前後的畫面',
    'f2.5': '畫面旁邊放便條的樣子', 'f2.6': 'Gemini 挑毛病的對話', 'f3.1': '同學試用的紀錄表', 'f3.2': '改前改後並排', 'a3.3': '提案室「提交」與匯出 PDF 的畫面', 'a3.4': 'flipclass 作業的繳交欄位',
    'Claude 整合（f2 第 8 步、a2 第 2／5 步、f3 第 2 步、a3 第 3 步）': '學習單第 79 版沒附專屬截圖，先用連接器頁與相近的圖頂著；F⑨ 實測後補' };
  var LIMIT_MEDIA = [['claude_limit'], '看到「已使用超過 90%」先停手；去做 Figma 手動調整與匯出，等重設時間再繼續。'];

  /* ———— 卡點選項 {t:[選項文字, 等級1, 等級2], m:[圖 id 們, 一句指示]} ———— */
  function K(label, l1, l2, ids, line) { return { t: [label, l1, l2], m: ids ? [ids, line] : null }; }
  var LIM = K('Claude 說用量快滿', '先停手，不要再生成新畫面，看提示裡寫的重設時間。', '等重設的時候，在 Figma 手動調整畫面，再按右側最下面 Export（匯出）旁的 ＋ 輸出 PNG。', LIMIT_MEDIA[0], LIMIT_MEDIA[1]);
  var FRAME_K = K('樣板裡有好多畫面，不知道用哪個', '這個單元用標題寫「D 長者與家人版」的那個畫面，其他畫面先不用管。', '在左側 Layers（圖層）找 D 開頭那一列，點它，畫布會跳到那個畫面。', ['figma_select'], '在左側 Layers（圖層）找 D 開頭的那一列「長者與家人版」，點它，畫布就會跳到那個畫面。');
  var EDIT_K = K('雙擊了還是改不了字', '先點畫面上的字，再快速雙擊，直到出現閃爍的游標；可能要連按兩三次。', '出現游標後按 Ctrl＋A 全選，直接打新的字，改完按 Esc。', ['figma_screen'], '先點字，再快速雙擊，直到出現閃爍的游標，按 Ctrl＋A 全選再打字。');
  var DRAG_K = K('拖不動卡片，選到外面一整塊', '在畫布上拖卡片會選到外面一整塊。改到左側 Layers（圖層）拖：找到那張卡，拖到第 1 張的上面。', '挪完後卡片左邊的圓形數字不會自己變，請雙擊數字改成 1、2、3。', ['figma_layers_drag'], '要挪卡片：在左側 Layers（圖層）拖，不要在畫布上拖；挪完圓形數字要自己改。');
  var EXPORT_K = K('找不到 Export（匯出）', '先在左側 Layers（圖層）點整個畫面，不要點裡面的小方塊。', '右側面板最下面 Export（匯出）旁的 ＋ 按下去，格式選 PNG、1x。', ['figma_select', 'figma_export'], '先在左側 Layers（圖層）點整個畫面，再看右側最下面的 Export（匯出）。');
  var SHARE_FIG_K = K('Share（分享）裡看不到 Anyone', '代表現在不是公開的。在 Share（分享）視窗把存取改成 Anyone，右邊選 can view。', '改完在 Share（分享）視窗右上按 Copy link（複製連結），用無痕視窗貼上打得開才算。', ['figma_share'], '按右上角 Share（分享），確認 Anyone 那一列寫的是 can view，不是 can edit。');
  var SHARE_AIS_K = K('連結別人打得開', 'AI Studio 右側 Share（分享）面板預設是 Restricted（限制存取），只有你指定的人能看。', '按右側 Share（分享），把 General access（一般存取權）的下拉改成 Public（公開），再按下方 Copy link（複製連結）。', ['ais_share'], 'AI Studio 右側 Share（分享）面板裡要改成 Public（公開）；Figma 複本預設就是公開檢視，確認寫的是 can view。');
  var EXTRA_K = K('輸入框旁邊的按鈕要按嗎', "不用。輸入框旁邊的 Default mode（預設模式）、麥克風、I'm feeling lucky（手氣不錯）這次都不要按。", '只需要輸入框左下角的 ＋（上傳圖片）和右下角的 ↑（送出）。', ['ais_home'], "輸入框旁邊的 Default mode（預設模式）、麥克風、I'm feeling lucky（手氣不錯）這次都不要按。");
  var SMALLFONT_K = K('預覽的字比 Figma 的小', '預覽的字比 Figma 的小一點很常見；標題和卡片文字看起來差不多就可以。', '差很多的話，把 Figma 右側面板 Design（設計）分頁量到的字級寫進指令，請它照這些數字調。', ['ais_preview', 'figma_screen'], '預覽的字比 Figma 的小一點很常見；標題和卡片文字並排看起來差不多就可以。');
  var NOTASK_K = K('同學找不到任務的答案', '任務要和畫面對得上，例如「說出第一件要做的事」。', '畫面上沒有的東西別當任務，換一個畫面上找得到的。', ['figma_screen'], '任務要和畫面對得上，例如「說出第一件要做的事」。');
  var NOTASK_K = K('同學找不到任務的答案', '任務要和畫面對得上，例如「說出第一件要做的事」。', '畫面上沒有的東西別當任務，換一個畫面上找得到的。', ['figma_screen'], '任務要和畫面對得上，例如「說出第一件要做的事」。');
  var CLAUDE_K = K('Claude 讀不到畫面', '確認你貼的是自己 Figma 檔案裡畫面的連結，而且 Share（分享）視窗裡是 can view。', '貼的要是畫面的連結，不是整個檔案的連結；不行就手抄字級與間距。', ['free_connector', 'free_read'], '設定的連接器頁看到 Figma 打勾；貼的是畫面連結，不是整個檔案的連結。');

  /* ———— 步驟工廠。req＝[[欄位, 沒做時提醒]]，nextN／nextM＝自訂「下一步檢查」（回傳提醒或空字串） ———— */
  function St(title, fields, o) { o = o || {}; o.title = title; o.fields = fields; return o; }
  function cnt(S, ks) { return ks.filter(function (k) { return S.f[k]; }).length; }
  function nextOf(S, s, mid) {
    var f = mid && s.nextM ? s.nextM : s.nextN; if (f) return f(S);
    if (!s.req) return null;
    for (var i = 0; i < s.req.length; i++) if (isBlank(S.f[s.req[i][0]])) return s.req[i][1];
    return '';
  }
  var CHG3 = function (S) { var n = cnt(S, ['chg1', 'chg2', 'chg3']), a = cnt(S, ['ans1', 'ans2', 'ans3']); return (n < 3 || a < 3) ? '三處要都改了，三個問題也要答「有」（目前改了 ' + n + ' 處、答 ' + a + ' 題）。' : ''; };
  var TRIAL_REQ = [['secs', '還沒記下花了幾秒。'], ['taps', '還沒記下點了幾下。'], ['stopAt', '還沒記下卡在哪一句。']];

  /* 「Claude 整合」（W12 起每份都有，必做，交截圖）。2026-11-09 照學習單第 79 版接上結構；Claude 的指令與字樣是初版，F⑨ 實測後會校字（PENDING_VERIFY 列出是哪幾步）。
     f2＝接 Figma 連接器請 Claude 給一個建議；a2＝兩次（依 PNG 寫指令、找互動漏洞）；f3＝貼試用紀錄請 Claude 挑一處（併在改一版那一步，不用接 Figma）；a3＝對照評分三項檢查 */
  var NOCONN_K = K('找不到 Figma 連接器', '在 claude.ai 設定的「連接器」找到 Figma，按「連接至 Claude」，到 Figma 授權頁用你自己的帳號按「允許」。', '免費帳號只能接 1 個自訂連接器，接 Figma 就好；第一次用 Figma，畫面最下方跳出提示要按「允許一次」。', ['free_connector'], 'Claude 設定的連接器頁，Figma 打勾就是接好了。');
  var WHOAMI_K = K('whoami 回的帳號不一樣', '新對話叫 Claude 執行 whoami，它回的 Figma 帳號要和你登入 Figma 的帳號一樣。', '不一樣就回到連接器重新連，連到你自己的帳號。', ['free_connector'], '連接器頁看到 Figma 已連接；帳號要和你登入 Figma 的一樣。');
  var DISAGREE_K = K('Claude 的建議我不同意', 'Claude 的建議不一定對；你決定改或不改，寫下理由就算完成。', '在畫面旁的便條多寫一行「Claude 建議了什麼、我改／不改、因為什麼」。', ['free_read'], 'Claude 的建議不一定對，你決定改或不改，把理由寫在便條上就算完成。');
  var SHOT_MEDIA = [['free_connector', 'free_read'], 'Claude 設定的連接器頁看到 Figma 打勾，再貼畫面連結請它讀（只能讀）。'];
  function claudeF2() {
    return St('Claude 整合：請 Claude 看你這一頁，給一個修改建議', ['cConn', 'cWho', 'claudeShot'], { dir: '接上 Figma 連接器、用 whoami 確認帳號，貼畫面連結，請 Claude 只給「一個」建議；你決定改不改並截圖。', l2: '畫面連結要是「畫面」的連結，不是整個檔案的連結；Claude 不能改你的檔案。',
      m: SHOT_MEDIA, req: [['cConn', 'Figma 連接器接好了嗎？連接器清單裡要顯示已連接。'], ['cWho', 'whoami 回的帳號和你登入 Figma 的一樣嗎？'], ['claudeShot', '還沒放上 Claude 整合的截圖（建議和你的決定、理由）。']],
      stuck: { noconn: NOCONN_K, whoami: WHOAMI_K, claude: CLAUDE_K, disagree: DISAGREE_K, limit: LIM } });
  }
  function claudeA2a() {
    return St('Claude 整合（一）：請 Claude 依你的 PNG 寫第一段指令', ['claudeShot1'], { dir: '開新對話，上傳你的 PNG，請 Claude 寫一段給 AI Studio 的指令；把這一輪截一張圖。', l2: '指令要求：寬度 390、每一句文字照原文、顏色排版盡量一樣、不接外部服務；只要指令本身。',
      m: [['ais_prompt'], '上傳 PNG 加指令給 Claude，拿到一段可以貼到 AI Studio 的指令。'], req: [['claudeShot1', '還沒放上這一輪的截圖（Claude 寫的指令）。']], stuck: { limit: LIM } });
  }
  function claudeA2b() {
    return St('Claude 整合（二）：請 Claude 找出互動漏掉的狀況', ['claudeShot2'], { dir: '把你寫的互動說明貼給 Claude，請它列出最多 3 個可能漏掉的狀況；你決定補不補並截圖。', l2: '例如點了沒反應、點完回不去、字太長；每個一句話，補或不補都要寫下來。',
      m: [['ais_second'], '貼互動說明給 Claude，看它列出的漏洞，再決定要不要補。'], req: [['claudeShot2', '還沒放上這一輪的截圖（它找出的漏洞和你的決定）。']], stuck: { limit: LIM, disagree: DISAGREE_K } });
  }
  function claudeA3() {
    return St('Claude 整合：請 Claude 對照評分三項檢查', ['claudeShot'], { dir: '把作業說明的三項要求和你要交的內容貼給 Claude，請它逐項說「有做到」或「還缺什麼」；你補完再截圖。', l2: '三項：①這一版做了什麼、改了哪裡 ②一位試用者卡在哪裡 ③再改一處並寫改了什麼、為什麼。',
      m: [['ais_preview'], '把三項和你的內容貼給 Claude，它每項回一句；缺什麼就補什麼。'], req: [['claudeShot', '還沒放上截圖（它列的缺漏和你補了什麼）。']], stuck: { limit: LIM } });
  }
  /* 初版、待 F⑨ 實測校字的步驟（軌道.步驟號）；補好實測的字樣後從這裡刪掉 */
  var PENDING_VERIFY = ['f2.novice.8', 'a2.novice.2', 'a2.novice.5', 'f3.novice.2', 'a3.novice.3'];
  var PNG_MEDIA = [['figma_select', 'figma_export', 'figma_exported'], '先在左側 Layers（圖層）點整個畫面，看到藍框，再按右側最下面 Export（匯出）旁的 ＋，選 PNG、1x；匯出就會下載一張 PNG。'];
  var EXPORT_L2 = '找不到 Export（匯出）：先點整個畫面，不要點裡面的小方塊，右側面板最下面就是 Export（匯出）。';

  function buildTrack(part, mode) {
    var L = [];
    if (part === 'f1') {
      L = [
        St('登入 Figma', ['figmaIn'], { dir: '打開 figma.com，用學校信箱（或你自己的帳號）登入，免費版就夠用。', l2: '沒有帳號就用學校信箱註冊一個。做完的樣子：看到你的檔案首頁。', m: [['figma_start'], '登入後會看到你的檔案首頁；樣板在下一步打開。'], req: [['figmaIn', '登入了嗎？看到你的檔案首頁才算。']] }),
        St('打開樣板，複製成你自己的一份', ['copied'], { dir: '到 flipclass 教材區點樣板連結，按檔名旁的 ▾，選 Duplicate（複製）。', l2: '新檔案在新分頁打開，檔名後面多一個「(Copy)」，之後都在這個新分頁改。',
          m: [['figma_start'], '複製好會在新分頁開出「檔名 (Copy)」，檔名下方的灰字是 Drafts（草稿），之後都在這一份改。'], req: [['copied', '新分頁的檔名後面有「(Copy)」嗎？']],
          stuck: { nolink: K('找不到教材或樣板連結', '教材區要先登入 flipclass；沒登入會被帶到公開的課程資訊頁，看不到教材。', '登入後到教材區，找「W10-1 Figma 樣板（公開連結）」，點裡面的樣板連結。', ['figma_start'], '登入 flipclass 後到教材區，點「W10-1 Figma 樣板（公開連結）」裡的樣板連結。'),
                   nodup: K('找不到複製的按鈕', '先登入 Figma；沒登入只能看，沒有複製的選項。字樣不一樣就找意思是「複製」的那個。', '還是找不到就截圖問老師；複製好會在新分頁開出「檔名 (Copy)」。', ['figma_start'], '複製好會在新分頁開出「檔名 (Copy)」，檔名下方的灰字是 Drafts（草稿），之後都在這一份改。'),
                   trash: K('不小心點到 Move to trash（移到垃圾桶）', '先別慌，到 Figma 檔案首頁左邊找 Trash（垃圾桶），找得到就把檔案還原。', '找不到就回樣板，再複製一份。', ['figma_start'], '檔名旁 ▾ 選單裡的 Move to trash（移到垃圾桶）不要點；點到了就去垃圾桶還原。') } }),
        St('改檔名', ['renamed'], { dir: '在上方點一下檔名，Ctrl＋A 全選，輸入「班級＋你的提案」，按 Enter。', l2: '名字用「班級＋你的提案」（例如「二甲 離院三件事」），不用寫自己的名字。', m: [['figma_start'], '畫面上方的檔名點一下就能改，改完按 Enter。'], req: [['renamed', '上方檔名已經改成「班級＋你的提案」了嗎？']] }),
        St('把「D 長者與家人版」改三個地方', ['chg1', 'chg2', 'chg3', 'ans1', 'ans2', 'ans3'], { dir: '只改三處：①大標題 ②標題下面那行引導句 ③第 3 張卡片（「一直吐…馬上回急診」）挪到最上面。先改哪一處？',
          l2: '改完問自己：這句話有告訴人現在該做什麼？看到的人知道做完這一步之後要做什麼嗎？危險訊息一眼看得到嗎？', m: [['figma_screen'], '只改標題、一句引導的話，並把危險訊息挪到最上面。'], nextN: CHG3,
          stuck: { noframe: FRAME_K, edit: EDIT_K, drag: DRAG_K } }),
        St('確認別人打得開，複製連結', ['share1', 'incog'], { dir: '按右上角 Share（分享），Anyone 那列要是 can view，再按 Copy link（複製連結）。', l2: '用無痕視窗貼上連結，打得開才算。看不到 Anyone 代表現在不是公開的。', m: [['figma_share'], '按右上角 Share（分享），確認 Anyone 那一列寫的是 can view，不是 can edit。'],
          req: [['share1', 'Anyone 那一列是 can view 嗎？'], ['incog', '用無痕視窗貼上連結，打得開了嗎？']], stuck: { noanyone: SHARE_FIG_K } })
      ];
    } else if (part === 'a1') {
      L = [
        St('準備一張畫面圖（PNG）', ['pngReady'], { fast: true, dir: '用老師樣板「D 長者與家人版」的圖：左側 Layers（圖層）點它，右側最下面 Export（匯出）旁按 ＋ 匯出。', l2: EXPORT_L2, m: PNG_MEDIA, req: [['pngReady', '還沒有匯出的 PNG 圖（不要自己截螢幕）。']], stuck: { export: EXPORT_K } }),
        St('打開 AI Studio，上傳圖片', ['uploaded'], { dir: '到 aistudio.google.com/apps，輸入框左下角的 ＋ 選 Upload Files（上傳檔案）。', l2: '第一次上傳會跳出視窗，按 Acknowledge（我知道了）才能繼續；輸入框旁的 Default mode（預設模式）和麥克風都不要按。',
          m: [['ais_home', 'ais_upload'], '輸入框左下角的 ＋ 選 Upload Files（上傳檔案），圖片會出現在輸入框上方。'], req: [['uploaded', '圖片上傳了嗎？輸入框上方要出現縮圖。']], stuck: { extra: EXTRA_K } }),
        St('貼第一段指令，送出', ['prompt1', 'confirmed1', 'sent1'], { kind: 'fill1', dir: '指令範本是固定的：照圖還原、不改寫、不接外部服務。', l2: '送出後一直轉圈：等 5 分鐘；真的沒動靜才重送一次，而且只重送一次。',
          m: [['ais_prompt', 'ais_done'], '按輸入框左下角的 ＋ 附上 PNG，貼上指令，再按右下角的 ↑（送出）；第一次約等 4 分鐘。'],
          nextN: function (S) { return !S.f.confirmed1 ? '指令要先確認內容才能複製。' : (!S.f.sent1 ? '圖附上、送出了嗎？' : ''); },
          stuck: { spin: K('一直轉圈', '先等 5 分鐘，不要重送。', '真的沒動靜才重送一次，而且只重送一次。', ['ais_prompt'], '送出後一直轉圈：先等 5 分鐘，不要重送。'), extra: EXTRA_K } }),
        St('對照檢查兩點', ['c1', 'c2', 'fixPrompt'], { kind: 'fix', items: [1, 2], dir: '①每一句話都在，沒有掉字、沒被改寫 ②預覽和圖並排，標題和卡片文字大小看起來差不多。', l2: '預覽的字比圖小一點很常見；並排看起來差不多就可以。',
          m: [['ais_preview', 'figma_screen'], '把右側 Preview（預覽）和 Figma 的畫面並排看，兩點逐項打勾。'], req: [['c1', '還沒確認每一句話都在。'], ['c2', '還沒並排看字的大小。']],
          stuck: { missing: K('預覽少了字', '先貼「版面跑掉時」那句。', '還是不對，在指令裡把缺的字一句一句列出來，要求逐字照用。', ['ais_preview', 'figma_screen'], '把右側 Preview（預覽）和 Figma 的畫面並排對，找出哪一句不見了，再補指令。'), smallfont: SMALLFONT_K } }),
        St('設成別人打得開，複製連結', ['share2', 'incog', 'c4'], { dir: '按右上 Share（分享），General access（一般存取權）改成 Public（公開），再按 Copy link（複製連結）。', l2: '用無痕視窗貼上連結，打得開才算；畫面上只能有練習資料。',
          m: [['ais_share'], 'AI Studio 右側 Share（分享）面板，General access（一般存取權）下拉有 Public（公開）與 Restricted（限制存取）。'], req: [['share2', '在 Share（分享）面板，General access（一般存取權）改成 Public（公開）了嗎？'], ['incog', '用無痕視窗貼上連結，打得開了嗎？'], ['c4', '畫面上只有練習資料嗎？']], stuck: { share: SHARE_AIS_K } })
      ];
    } else if (part === 'f2') {
      var common = [
        St('先開一個檔案', ['renamed'], { dir: '兩種挑一種：按檔名旁的 ▾ 選 Duplicate（複製）樣板，或自己開新檔案；檔名改成「班級＋你的提案」。', l2: '找不到連結先用「自己開新檔案」開始，不要停下來等；免費版就夠用。',
          m: [['figma_start'], '樣板是並排的手機畫面，左邊是圖層、右邊是屬性。'], req: [['renamed', '檔名改成「班級＋你的提案」了嗎？']],
          stuck: { nolink: K('找不到樣板連結', '先用「自己開新檔案」開始，不要停下來等。', '樣板打不開，先確認連結有完整複製，還是不行就告訴老師。', ['figma_start'], '複製好會在新分頁開出「檔名 (Copy)」，之後都在這一份改。'), limit: LIM } }),
        St('畫一個手機畫面', ['frame390'], { dir: '按 F 拉出一個框，右邊把 W 設成 390、H 設成 844，左邊 Layers（圖層）取名「首頁」。', l2: '框歪掉或大小不對，直接改右邊的數字，不用重拉。寬剛好 390，AI Studio 之後用這個寬度還原。',
          m: [['figma_select'], '選到畫面後，右側面板會顯示寬 W 與高 H。'], req: [['frame390', '寬剛好是 390 嗎？點畫面，看右側的 W。']], stuck: { wrongsize: K('拉出來的框歪掉或大小不對', '直接改右邊的數字，不用重拉。', 'W 設 390、H 設 844，按 Enter。', ['figma_select'], '選到畫面後，右側面板會顯示寬 W 與高 H。') } }),
        St('先放最重要的三樣，其他先不放', ['three', 'btn48'], { dir: '畫面只放三樣：①現在要做什麼的一句話 ②危險要回急診的訊息 ③一顆主要按鈕。', l2: '字級預設 12 太小，改成 14 以上；方框預設是灰色，按鈕＝方框加一行字疊起來，字色改白色。',
          m: [['figma_screen'], '上面一句大字，中間一張醒目的警示卡，下面一顆滿版按鈕。'], req: [['three', '三樣都在畫面上了嗎？'], ['btn48', '按鈕高度至少 48 了嗎？']], stuck: { noidea: K('不知道放哪一句話', '回去看故事板那一格「最卡」寫了什麼。', '把它改成一句「你現在要做的是……」。', ['figma_screen'], '不知道放哪一句話，就回去看故事板那一格「最卡」寫了什麼。') } }),
        St('把字放大、把間隔拉開', ['font14'], { dir: '內文 16～18、標題 22～26、按鈕高度至少 48、卡片之間留 16 的空白。', l2: '字太多放不下就刪字，不要縮小字體；Shift＋A 自動排版選錯東西，就按 Ctrl＋Z 復原。',
          m: [['figma_screen'], '點每一段文字，看右側面板 Typography 裡的字級，都要 14 以上。'], req: [['font14', '每段文字的字級都在 14 以上了嗎？']], stuck: { toomuch: K('字太多放不下', '刪字，不要縮小字體；先留最重要的那一句。', 'Shift＋A 選錯東西變怪了，按 Ctrl＋Z 復原，用手排也可以。', ['figma_screen'], '字太多放不下，就刪字，不要縮小字體。') } }),
        St('每個元素對得回你問到的話', ['note'], { dir: '畫面旁邊放一張便條，三個元素各寫一行：這個字、這顆按鈕，是因為訪談聽到哪一句話？', l2: '想不起來原話，回急診室翻自己的訪談紀錄，不要自己編；還沒訪談的先寫「（還沒訪談）」。',
          m: [['figma_screen'], '畫面右邊放一張便條，三行各對應畫面上的一個地方。'], req: [['note', '便條還沒寫，三個元素各一行。']], stuck: { norec: K('想不起來原話', '回急診室翻自己的訪談紀錄，不要自己編。', '還沒訪談的同學，先在那一行寫「（還沒訪談）」，之後補上。', ['figma_screen'], '找不到對應原話的元素，就想一想要不要拿掉。') } }),
        St('自己檢查三題，再請 Gemini 挑毛病', ['ans1', 'ans2', 'ans3', 'gem'], { dir: '三題自己先答，再把畫面匯出貼給 Gemini，請它只挑毛病、不要幫你重畫。', l2: '右側面板最下面用 Export（匯出）輸出，不要自己截螢幕；Gemini 的毛病至少處理掉一個，並在便條寫下「改了什麼」。',
          m: [['figma_export', 'figma_exported'], '左邊 Layers（圖層）點畫面，右側最下面 Export（匯出）旁按 ＋ 匯出，再貼給 Gemini。'], req: [['ans3', '三個問題都答了嗎？'], ['gem', '還沒處理 Gemini 挑的毛病（或寫下為什麼不改）。']],
          stuck: { disagree: K('Gemini 說的我不同意', '沒關係，在便條寫下為什麼不改，這也算完成。', '練習用畫面可以貼給 Gemini，不要上傳真實截圖。', ['figma_export'], '右側面板最下面 Export（匯出）旁按 ＋ 匯出，再貼給 Gemini。') } }),
        St('存好，設成老師打得開', ['share1', 'incog'], { dir: '按右上角 Share（分享），Anyone 那列要是 can view，再按 Copy link（複製連結）。', l2: '用無痕視窗貼上連結，打得開才算；打不開視同沒有交。', m: [['figma_share'], '按右上角 Share（分享），確認 Anyone 那一列寫的是 can view，不是 can edit。'],
          req: [['share1', 'Anyone 那一列是 can view 嗎？'], ['incog', '用無痕視窗貼上連結，打得開了嗎？']], stuck: { perm: K('看到「需要權限」', '回去檢查 Share（分享）視窗裡 Anyone 那一列是不是不見了。', '右邊要是 can view；改好再用無痕視窗試一次。', ['figma_share'], '按右上角 Share（分享），確認 Anyone 那一列寫的是 can view，不是 can edit。') } })
      ];
      if (mode === 'novice') L = common.concat([claudeF2()]);
      else if (mode === 'mid') L = [St('中級加做：把畫面拆成區塊、互動、狀態', ['blocks', 'inter', 'states'], { dir: '先寫出：有幾個區塊、點了會怎樣、有哪幾個狀態；每個狀態畫成一個畫面。', l2: '狀態例如提醒開／關、說明展開／收起；畫面名稱寫清楚。', m: [['figma_start'], '先在紙上寫出區塊、互動、狀態，再動手。'], req: [['blocks', '還沒寫區塊。'], ['inter', '還沒寫互動。'], ['states', '還沒寫狀態。']] })].concat(common, [claudeF2()]);
      else L = [St('專家加做：先寫設計規則檔', ['rules'], { dir: '', m: [['figma_select'], '規則裡的色碼、字級、間距，在 Figma 右側面板的 Design（設計）分頁都量得到。'] }),
                St('依規則畫多個畫面', ['screensX'], { dir: '', m: [['figma_start'], '依規則畫多個畫面，全部用同一組樣式。'] }), common[4], common[5], common[6], claudeF2()];
    } else if (part === 'a2') {
      var NOREACT = K('按鈕點了沒反應', '重看你選的互動，點哪個、出現什麼。', '把「點哪個」寫得更明確，並寫「點整個區塊都能觸發」，再重送一次。', ['ais_try4'], '按鈕沒反應：把「點哪個、出現什麼」寫得更明確再送一次。');
      var png2 = St('輸出你自己的畫面（PNG）', ['pngReady'], { fast: true, dir: '在 Figma 輸出 W12 畫好的那一頁：左側 Layers（圖層）點畫面，右側最下面 Export（匯出）旁按 ＋。', l2: EXPORT_L2, m: PNG_MEDIA, req: [['pngReady', '還沒有匯出的 PNG 圖（不要自己截螢幕）。']], stuck: { export: EXPORT_K, nodraw: K('我的畫面還沒畫完', '先用老師樣板 D 畫面的圖，照做一遍。', '畫完之後再回來換成你自己的畫面。', ['figma_start'], '還沒畫完的同學，先用老師樣板 D 畫面的圖。') } });
      var rest = St('到 AI Studio 還原成網頁', ['sent1', 'restored'], { dir: '到 aistudio.google.com/apps，上傳同一張 PNG，貼 Claude 寫的指令送出；第一次約等 4 分鐘。', l2: '等的時候不要重送；預覽是空白就再等 15 秒。每一句話都要在，預覽和圖並排看起來差不多。', m: [['ais_upload', 'ais_done'], '輸入框左下角的 ＋ 選 Upload Files（上傳檔案）附上 PNG，貼指令，再按右下角的 ↑（送出）。'],
        req: [['sent1', '圖附上、指令貼上、送出了嗎？'], ['restored', '右側預覽看起來和你的圖一樣嗎？']], stuck: { spin: K('一直轉圈', '先等 5 分鐘，不要重送。', '真的沒動靜才重送一次，而且只重送一次。', ['ais_prompt'], '送出後一直轉圈：先等 5 分鐘，不要重送。'), extra: EXTRA_K, limit: LIM } });
      var chk4 = St('自己點一遍，做四項檢查', ['c1', 'c2', 'c3', 'c4', 'fixPrompt'], { kind: 'fix', items: [1, 2, 3, 4], dir: '四項：①每一句話都在 ②字的大小看起來差不多 ③按鈕結果和你寫的一樣 ④只有練習資料。', l2: '沒過的那一項，按下面「第幾項沒過」，我給一句救火指令。',
        m: [['ais_preview', 'ais_try4', 'ais_try5'], '把右側 Preview（預覽）和 Figma 並排，每個按鈕都點一遍，四項逐項打勾。'], req: [['c1', '還沒確認每一句話都在。'], ['c2', '還沒並排看字的大小。'], ['c3', '還沒確認按鈕結果。'], ['c4', '畫面上只有練習資料嗎？']],
        stuck: { oldbroke: K('加了新互動，舊的壞掉', '按那次回覆下方的 Restore（還原），退回上一版。', '重新加，指令開頭寫「只修改下面說明的部分，其他完全不要動」。', ['ais_second'], '按那次回覆下方的 Restore（還原）回到上一版，再加新的，並寫「其他功能都不要動」。'), missing: K('預覽少了字', '先用救火指令。', '指令後面再加一句「缺少的字是：＿＿」。', ['ais_preview', 'figma_screen'], '把右側 Preview（預覽）和 Figma 的畫面並排對，找出哪一句不見了。'), noreact: NOREACT } });
      var link = St('設成別人打得開，複製連結', ['share2', 'incog'], { dir: '按右上 Share（分享），General access（一般存取權）改成 Public（公開），再按 Copy link（複製連結）。', l2: '用無痕視窗貼上連結，打得開才算；連結裡已經有互動。', m: [['ais_share'], 'AI Studio 右側 Share（分享）面板，General access（一般存取權）要是 Public（公開）。'],
        req: [['share2', '在 Share（分享）面板，General access（一般存取權）改成 Public（公開）了嗎？'], ['incog', '用無痕視窗貼上連結，打得開了嗎？']], stuck: { share: SHARE_AIS_K } });
      var act = mode === 'novice' ? St('選一個互動，貼互動指令', ['opt', 'prompt2', 'confirmed2'], { kind: 'fill2', dir: '挑你畫面上真的有的按鈕，決定「點哪個、出現什麼」；按鈕名字照畫面上的字。', l2: '用樣板 D 畫面的同學，選一顆我幫你填；用自己畫面的同學，把【　】換成你的內容。點整個區塊都要有反應。',
          m: [['ais_second', 'ais_try4'], '一次只加一個互動，加完自己點一遍。'], req: [['opt', '先選一個互動。'], ['confirmed2', '指令要先確認內容才能複製。']], stuck: { noreact: NOREACT } })
        : mode === 'mid' ? St('選一個互動，貼互動指令', ['prompt2', 'featN', 'saved', 'mapping'], { dir: '一次只加一個功能，加完先自己點一遍；每個按鈕對應訪談的哪一句話？', l2: '至少 2 個互動；舊的壞掉，就按那次回覆下方的 Restore（還原）回到上一版，再加新的，並寫「其他功能都不要動」。', m: [['ais_second'], '一次只加一個功能，成功的那一段指令存起來。'],
            nextM: function (S) { return Number(S.f.featN) > 1 ? '一次只加一個功能，這一段先留一個。' : (!S.f.saved ? '成功的這一段指令存起來，壞了才退得回去。' : (isBlank(S.f.mapping) ? '這個按鈕對應你訪談到的哪一句話？' : '')); }, stuck: { noreact: NOREACT } })
        : St('選一個互動，貼互動指令', ['promptX'], { dir: '', m: [['ais_prompt', 'ais_second'], '把 DESIGN.md 貼進指令，互動一次只加一個功能。'] });
      L = [png2, claudeA2a(), rest, act, claudeA2b(), chk4, link];
    } else if (part === 'f3') {
      var revF = mode === 'novice' ? St('先做下面的「Claude 整合」，再依紀錄改一版', ['claudeShot', 'revNote'], { dir: '把試用紀錄貼給 Claude，請它只挑「一處」最該改的；你決定後改一版，便條寫「改了什麼、為什麼」。', l2: 'Claude 挑的和你自己挑的不一樣也沒關係，最後改哪一處由你決定；這一段不用接 Figma。',
          m: [['figma_screen'], '改完在畫面旁的便條寫「Claude 建議改哪裡、我最後改哪裡、因為什麼」。'], req: [['claudeShot', '還沒放上 Claude 整合的截圖。'], ['revNote', '便條還沒寫「改了什麼、為什麼」。']], stuck: { limit: LIM, disagree: DISAGREE_K } })
        : mode === 'mid' ? St('先做下面的「Claude 整合」，再依紀錄改一版', ['claudeShot', 'versions', 'changelog'], { dir: '先做 Claude 整合，再改；至少改 2 版，每一版都寫「改了什麼、為什麼」。', l2: '每改一版，輸出一張 PNG，排在原版旁邊。', m: [['figma_screen'], '每一版旁邊放便條，寫改了什麼、為什麼。'],
            nextM: function (S) { return isBlank(S.f.claudeShot) ? '還沒放上 Claude 整合的截圖。' : ((Number(S.f.versions) < 2 || isBlank(S.f.versions)) ? '至少要兩個版本，才看得出改了什麼。' : ''); }, stuck: { limit: LIM } })
        : St('先做下面的「Claude 整合」，再依紀錄改一版', ['claudeShot', 'verX'], { dir: '', m: [['figma_screen'], '每一版寫改了什麼、依據、結果。'] });
      L = [St('找一位同學試用', ['secs', 'taps', 'stopAt'], { dir: '給他一個你畫面上做得到的任務。你不能講話，只記幾秒、點幾下、卡在哪一句話。', l2: '任務例如「說出第一件要做的事」「找到出現什麼情況要馬上回急診」。', m: [['figma_screen'], '請同學照任務點一遍，你只記秒數、點幾下、停在哪一句。'], nextN: function (S) { for (var i = 0; i < 3; i++) if (isBlank(S.f[TRIAL_REQ[i][0]])) return TRIAL_REQ[i][1]; return ''; }, stuck: { notask: NOTASK_K } }),
           revF,
           St('用 Export（匯出）輸出改前、改後兩張 PNG', ['pngBefore', 'pngAfter'], { fast: true, dir: '改之前先輸出一張，改完再輸出一張；左側 Layers（圖層）點畫面，右側最下面 Export（匯出）旁按 ＋。', l2: EXPORT_L2, m: PNG_MEDIA, req: [['pngBefore', '改前那張 PNG 還沒輸出。'], ['pngAfter', '改完那張 PNG 還沒輸出。']], stuck: { export: EXPORT_K } }),
           St('交件', ['share1', 'trialNote'], { dir: '到 flipclass 貼上 Figma 連結，上傳兩張 PNG 和 Claude 整合的截圖，再貼一段試用紀錄。', l2: 'Share（分享）視窗裡 Anyone 那一列要是 can view，連結打不開視同未繳交。', m: [['figma_share'], '按右上角 Share（分享），確認 Anyone 那一列寫的是 can view，不是 can edit。'], req: [['share1', 'Figma 連結要開分享（can view）。'], ['trialNote', '還沒寫試用紀錄（卡在哪、改了什麼、為什麼）。']], stuck: { noanyone: SHARE_FIG_K } })];
    } else {   /* a3 */
      var rev3 = mode === 'novice' ? St('依紀錄改版', ['revNote'], { dir: '挑最卡的那一處改，一次只改一件事，寫下「改了什麼、為什麼」。', req: [['revNote', '還沒寫「改了什麼、為什麼」。']], m: [['ais_preview', 'figma_screen'], '改完把右側 Preview（預覽）截圖貼回 Figma，排在原版旁邊。'] })
        : mode === 'mid' ? St('依紀錄改版', ['versions', 'changelog'], { dir: '至少 2 版，每一版都寫「改了什麼、為什麼」。', l2: '每改一版，把預覽截圖貼回 Figma，排在原版旁邊。', m: [['ais_preview', 'figma_screen'], '右側 Preview（預覽）截圖貼回 Figma，排在原版旁邊，寫改了什麼。'], nextM: function (S) { return (Number(S.f.versions) < 2 || isBlank(S.f.versions)) ? '至少要兩個版本，版本不夠送不出審核。' : ''; } })
        : St('依紀錄改版', ['verX'], { dir: '', m: [['ais_preview', 'figma_screen'], '每一版寫改了什麼、依據、結果；截圖貼回 Figma 對照。'] });
      L = [St('找人試用', mode === 'expert' ? ['secs', 'taps', 'stopAt', 'trialX'] : ['secs', 'taps', 'stopAt'], { dir: '找一位同學，給他一個畫面上做得到的任務。你不能講話，只記幾秒、點幾下、卡在哪一句話。', l2: '新手 1 位、中級 1 位以上、專家 2 位以上；寫「同學甲」，不寫全名。', m: [['ais_try1', 'ais_try3'], '請同學照任務點一遍，你只記秒數、點幾下、停在哪一句。'],
             nextN: function (S) { for (var i = 0; i < 3; i++) if (isBlank(S.f[TRIAL_REQ[i][0]])) return TRIAL_REQ[i][1]; return ''; }, stuck: { notask: NOTASK_K } }),
           rev3];
      if (mode === 'expert') L.push(St('十項自評，找出最嚴重的兩處', ['heur'], { dir: '', m: [['ais_preview'], '自評十項，每項寫符合、不符合或不適用，並加嚴重程度。'] }));
      L.push(claudeA3(),
           St('到提案室提交，匯出 PDF', ['share1', 'share2', 'pdf'], { dir: 'Figma 連結和 AI Studio 連結分開貼，兩個都要開分享；提交後匯出 PDF。', l2: 'Figma：Anyone 那一列是 can view；AI Studio：Share（分享）面板裡 General access（一般存取權）是 Public（公開）。', m: [['figma_share', 'ais_share'], '交出 Figma 連結和 AI Studio 連結（都要開分享）、這一版做了什麼、試用紀錄。'],
             req: [['share1', 'Figma 連結要開分享（can view）。'], ['share2', 'AI Studio 的 Share（分享）面板選 Public（公開）了嗎？'], ['pdf', '還沒從提案室匯出 PDF。']], stuck: { share: SHARE_AIS_K } }),
           St('交到 flipclass（之後可以繼續改，最後交的版本算數）', ['summary', 'delivered'], { dir: '把 PDF 和 Claude 整合的截圖交到 flipclass，並寫「這一版做了什麼、改了哪個地方」和試用者卡在哪裡。', l2: '連結打不開視同未繳交；W16～18 可以繼續改，最後交的版本算數。', m: [['figma_share', 'ais_share'], '交出 Figma 連結和 AI Studio 連結（都要開分享）、這一版做了什麼、試用紀錄。'],
             req: [['summary', '還沒寫「這一版做了什麼」。'], ['delivered', 'PDF 和截圖交到 flipclass 了嗎？']] }));
    }
    L.forEach(function (s, i) { s.n = i + 1; });
    return L;
  }
  /* 專家模式的規則檔、多畫面、指令、自評、版本：沒有 dir（專家不主動給方向），只在按「方向」時給這句 */
  var E_LEVEL1 = '先自己對照交件檢核：哪一項你最沒把握？';

  var TRACKS = {};
  PART_ORDER.forEach(function (k) { if (PARTS[k].modes) ['novice', 'mid', 'expert'].forEach(function (m) { TRACKS[k + '.' + m] = buildTrack(k, m); }); else TRACKS[k] = buildTrack(k, 'novice'); });
  function trackKey(S) { return S.part + (PARTS[S.part].modes ? '.' + S.mode : ''); }
  function stepsOf(S) { return TRACKS[trackKey(S)] || []; }
  function stepOf(S, n) { return stepsOf(S)[n - 1]; }
  function tid(S, n, tail) { return trackKey(S) + '.' + n + '.' + tail; }

  function len(s) { return Array.from(String(s || '')).length; }
  function tr(v) { return String(v == null ? '' : v).trim(); }
  function isBlank(v) { return v === undefined || v === null || v === false || tr(v) === ''; }
  function lines(v) { return tr(v).split(/\n+/).map(tr).filter(Boolean); }
  function privacyHit(S) { return Object.keys(S.f).some(function (k) { return typeof S.f[k] === 'string' && PRIVACY.test(S.f[k]); }); }
  function newState(mode, part) {
    part = PARTS[part] ? part : 'f1';
    return { mode: PARTS[part].modes && MODES[mode] ? mode : 'novice', part: part, f: {}, ai: {}, used: { stuck: 0, level: 0, fill: 0, review: 0, auto: 0 }, fillsDone: 0, stuckN: {} };
  }
  function quotaUsed(S) { return S.used.stuck + S.used.level + S.used.fill; }
  function out(id, level, text, extra) { var r = { ok: true, id: id, level: level, text: text }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; }
  function no(id, text, reason) { return { ok: false, id: id, level: 0, text: text, reason: reason }; }
  function charge(S, r, kind) { if (r.ok) S.used[kind] += 1; return r; }

  /* 頁首三句：這份要交什麼、大約多久、做完接哪一份（中級／專家再加一句加做的事） */
  function nextText(k) { var p = PARTS[k]; return p ? p.week + ' ' + p.name + '：' + p.title : ''; }
  function partIntro(S) {
    var p = PARTS[S.part], nx = p.next ? nextText(p.next) + (p.nextNote ? '（' + p.nextNote + '）' : '') : '這是最後一份，做完就是整個單元的成果';
    var extra = p.modes && p.extra ? (p.extra[S.mode] || '') : '';
    var o = { part: S.part, name: p.name, week: p.week, title: p.title, deliver: p.deliver, time: p.time, next: nx, extra: extra, modes: p.modes };
    o.text = '這份要交：' + p.deliver + '。大約 ' + p.time + '。做完接：' + nx + '。' + (extra ? extra : '');
    return o;
  }

  function guard(S, step, charged) {
    if (!stepOf(S, step)) return no('bad.input', '步驟不對。', 'step');
    if (charged && quotaUsed(S) >= COACH_PER_DAY) return no('quota', '今天助教的次數用完了，明天再問。', 'quota');
    return null;
  }
  function privacyMsg() { return '先看一下：你寫的字裡有像號碼、姓名或日期的內容，換成練習資料再繼續。'; }
  function doFill(S, field, text) {
    if (privacyHit(S)) return no('privacy', privacyMsg(), 'privacy');
    if (S.fillsDone >= FILL_CAP[S.mode]) return no('fill.cap', '代填最多 ' + FILL_CAP[S.mode] + ' 次，其他自己寫寫看。', 'cap');
    S.fillsDone += 1; S.used.fill += 1; S.f[field] = text; S.ai[field] = true; delete S.f['confirmed' + (field === 'prompt1' ? 1 : 2)];
    return null;
  }

  /* ———— 素材 ———— */
  var MEDIA_ON = { novice: { enter: 1, idle: 1, stuck: 1, next: 1, level: 1 }, mid: { enter: 1, idle: 1, stuck: 1, next: 1, level: 1 }, expert: { level: 1 } };
  function mediaList(ids) { return ids.map(function (id) { return { id: id, src: IMG_DIR + id + '.webp', alt: MEDIA[id] || id }; }); }
  function stepMedia(S, n) { var s = stepOf(S, n), m = s && s.m; return m ? { media: mediaList(m[0]), mediaLine: m[1] } : null; }
  function attach(r, S, n, trigger, key) {
    if (!r || !r.ok || !(MEDIA_ON[S.mode] || {})[trigger]) return r;
    var s = stepOf(S, n), sk = key && s && s.stuck && s.stuck[key], m = sk && sk.m;
    var x = m ? { media: mediaList(m[0]), mediaLine: m[1] } : stepMedia(S, n);
    if (x) { r.media = x.media; r.mediaLine = x.mediaLine; r.mediaWhy = trigger; }
    return r;
  }
  function showMedia(S, n) {   /* 「看這一步的示範圖」：不扣名額 */
    var x = stepMedia(S, n); if (!x) return no('bad.input', '', 'step');
    var r = out('G.media', 1, x.mediaLine); r.media = x.media; r.mediaLine = x.mediaLine; r.mediaWhy = 'button'; return r;
  }
  /* 接手：學生離開再回來。pos＝本機紀錄 { part, lv, step, t }（只記做到哪一份哪一步，不記內容）。兩個 1/3 不分模式，不比對 lv */
  function stuckKeys(s) { return Object.keys((s && s.stuck) || {}).filter(function (x) { return x !== 'limit'; }); }
  function resumeHint(S, n) { var s = stepOf(S, n), k = stuckKeys(s)[0]; return k ? '常見卡點：' + s.stuck[k].t[0] + '。' : ''; }
  function resume(S, pos, now) {
    var p = PARTS[S.part], st = pos && pos.part === S.part && stepOf(S, Number(pos.step));
    if (!st || (p.modes && pos.lv && pos.lv !== LV_OF[S.mode])) return no('resume.none', '', 'none');
    var mins = Math.max(0, Math.round(((now || Date.now()) - Number(pos.t || 0)) / 60000));
    var ago = !pos.t ? '' : (mins < 1 ? '剛剛' : mins < 60 ? '約 ' + mins + ' 分鐘前' : mins < 1440 ? '約 ' + Math.round(mins / 60) + ' 小時前' : '約 ' + Math.round(mins / 1440) + ' 天前');
    var head = '你上次做到 ' + p.name + '・步驟 ' + st.n + '：' + st.title, txt = head + (ago ? '（' + ago + '）' : '') + '，從這裡繼續。';
    if (len(txt) > CAPS[1]) txt = head + '，從這裡繼續。';
    var r = out('R.resume', 1, txt);
    var hint = resumeHint(S, st.n); if (hint && len(r.text + hint) <= CAPS[1]) r.text += hint;
    var x = stepMedia(S, st.n); if (x) { r.media = x.media; r.mediaLine = x.mediaLine; r.mediaWhy = 'resume'; } r.step = st.n; return r;
  }

  /* ———— 這一步有哪些等級可以請 ———— */
  function avail(S, n) {
    var s = stepOf(S, n); if (!s) return [];
    if (S.mode === 'expert') return [1];
    var a = [1]; if (s.l2 || s.kind === 'fix') a.push(2);
    if (S.mode === 'novice') { if (s.kind === 'fix') a.push(3, 4); if (s.kind === 'fill1' || s.kind === 'fill2') a.push(4); }
    return a;
  }

  /* 進入步驟（新手自動出現；中級只有標了 preview 的步驟會預告） */
  function enter(S, n) {
    var g = guard(S, n, false); if (g) return g;
    var s = stepOf(S, n);
    if (S.mode === 'novice') {
      if (s.kind === 'fill1') {
        if (!isBlank(S.f.prompt1)) { S.used.auto += 1; return out(tid(S, n, 'back'), 1, '第一段指令已經填好了，確認後再複製；想重填請按「代填」。'); }   /* 再回到這一步不重填、不多扣代填次數 */
        if (quotaUsed(S) >= COACH_PER_DAY) return no('quota', '今天助教的次數用完了，明天再問。', 'quota');
        var e = doFill(S, 'prompt1', P1); if (e) return e;
        return attach(out(tid(S, n, 'fill'), 4, '指令幫你填好了，確認內容再複製。生成完預覽若是空白，再等 15 秒。', { fill: { prompt1: P1 } }), S, n, 'enter');
      }
      S.used.auto += 1; return attach(out(tid(S, n, 'enter'), 1, s.dir), S, n, 'enter');
    }
    if (S.mode === 'mid' && s.preview) { S.used.auto += 1; return attach(out(tid(S, n, 'enter'), 1, s.dir), S, n, 'enter'); }
    return no('enter.none', '', 'none');
  }
  function sent(S) { if (S.mode !== 'novice') return no('enter.none', '', 'none'); S.used.auto += 1; return out('sent', 1, '第一次大約要等 4 分鐘（可能 2 到 5 分鐘），不要重送。等的時候先看下一步的檢查。'); }

  /* 停留過久的提示：這一步有常見卡點就列出前兩個（不含「用量快滿」），沒有就照舊 */
  function idleText(S, n) {
    var s = stepOf(S, n), ls = stuckKeys(s).slice(0, 2).map(function (k) { return s.stuck[k].t[0]; });
    return ls.length ? '卡住了嗎？常見的有：' + ls.join('、') + '。按「我卡住了」選一個。' : '卡住了嗎？按「我卡住了」，告訴我卡在哪。';
  }
  /* 停留過久：標了 fast 的步驟（匯出 PNG）3 分鐘，其他 5 分鐘 */
  function idle(S, n, min) {
    var g = guard(S, n, false); if (g) return g;
    if (S.mode === 'expert') return no('enter.none', '', 'none');
    var s = stepOf(S, n);
    if (S.mode === 'novice' && s.fast && s.l2 && min >= 3) { S.used.auto += 1; return attach(out(tid(S, n, 'idle'), 2, s.l2), S, n, 'idle'); }
    if (min >= 5) { S.used.auto += 1; return attach(out(S.mode === 'novice' ? 'idle.novice' : 'idle.mid', 1, idleText(S, n)), S, n, 'idle'); }
    return no('idle.none', '', 'none');
  }

  /* 我卡住了：不帶 choice 先問卡在哪；帶 choice 才給提示（第一次等級 1、再按等級 2），扣名額 */
  function stuck(S, n, choice) {
    var g = guard(S, n, true); if (g) return g;
    if (S.mode === 'expert') return no('mode.denied', '專家模式助教只在你交出後給評語。', 'denied');
    var tab = stepOf(S, n).stuck;
    if (!choice) {
      if (!tab) return charge(S, out('stuck.generic', 1, '卡在哪一步的哪個地方？寫一句，我再給你下一步的提示。'), 'stuck');
      return charge(S, out('stuck.ask', 1, '卡在哪？' + Object.keys(tab).map(function (k) { return tab[k].t[0]; }).join('、') + '。'), 'stuck');
    }
    if (!tab || !tab[choice]) return no('bad.input', '', 'choice');
    var key = trackKey(S) + n + choice, c = S.stuckN[key] = (S.stuckN[key] || 0) + 1, lv = c >= 2 ? 2 : 1;
    return attach(charge(S, out('stuck.' + trackKey(S) + '.' + n + '.' + choice + '.L' + lv, lv, tab[choice].t[lv]), 'stuck'), S, n, 'stuck', choice);
  }

  /* 再多一點（等級請求）：新手 1–4、中級 1–2、專家只到 1 */
  function level(S, n, lv, o) { return attach(levelCore(S, n, lv, o), S, n, 'level'); }
  function levelCore(S, n, lv, o) {
    o = o || {}; var g = guard(S, n, true); if (g) return g;
    if ([1, 2, 3, 4].indexOf(lv) < 0) return no('bad.input', '', 'level');
    if (S.mode === 'expert') return lv === 1 ? charge(S, out('E.level1', 1, E_LEVEL1), 'level') : no('mode.denied', '專家模式只有方向，沒有例子、示範和代填。', 'denied');
    if (avail(S, n).indexOf(lv) < 0) return no('level.max', '這一步沒有更深的提示了。', 'max');
    var s = stepOf(S, n), it = o.item, itemOk = s.items && s.items.indexOf(it) >= 0;
    if (S.mode === 'mid') {
      if (lv === 1) return charge(S, out(tid(S, n, 'level1'), 1, s.dir), 'level');
      if (s.kind === 'fix') { if (!itemOk) return no('bad.input', '', 'item'); return charge(S, out(tid(S, n, 'cause.' + it), 2, ITEM[it].cause), 'level'); }
      return charge(S, out(tid(S, n, 'level2'), 2, s.l2), 'level');
    }
    if (lv === 1) return charge(S, out(tid(S, n, 'enter'), 1, s.dir), 'level');
    if (lv === 2) return charge(S, out(tid(S, n, 'level2'), 2, s.l2), 'level');
    if (s.kind === 'fix') {
      if (!itemOk) return no('bad.input', '', 'item');
      if (lv === 3) return charge(S, out(tid(S, n, 'fix3.' + it), 3, ITEM[it].l3), 'level');
      if (!ITEM[it].fill) return no('fix.fill.denied', '這一項助教不代填，照上一個提示自己改；有真人資料的畫面請自己換成練習資料。', 'denied');
      var e7 = fixFill(S, ITEM[it].fill); if (e7) return e7;
      return out(tid(S, n, 'fill.' + it), 4, '救火指令幫你填好了，確認後再複製。', { fill: { fixPrompt: S.f.fixPrompt } });
    }
    if (s.kind === 'fill1') { var e5 = doFill(S, 'prompt1', P1); if (e5) return e5; return out(tid(S, n, 'fill'), 4, '指令幫你填好了，確認內容再複製。', { fill: { prompt1: P1 } }); }
    if (!OPTS[S.f.opt]) return no('fill.needinfo', S.f.opt === '3' ? '自己畫面的按鈕名字只有你知道，請把範本裡的【　】換成你的內容。' : '先選一個互動，我才能幫你填。', 'needinfo');
    var e6 = doFill(S, 'prompt2', p2(S.f.opt)); if (e6) return e6;
    return out(tid(S, n, 'fill'), 4, '互動指令幫你填好了，確認內容再複製。', { fill: { prompt2: S.f.prompt2 } });
  }
  function fixFill(S, text) {
    if (privacyHit(S)) return no('privacy', privacyMsg(), 'privacy');
    if (S.fillsDone >= FILL_CAP[S.mode]) return no('fill.cap', '代填最多 ' + FILL_CAP[S.mode] + ' 次，其他自己寫寫看。', 'cap');
    S.fillsDone += 1; S.used.fill += 1; S.f.fixPrompt = text; S.ai.fixPrompt = true; delete S.f.confirmedFix; return null;
  }
  function acceptFill(S, field) { if (S.ai[field]) { S.f['confirmed' + (field === 'prompt1' ? 1 : field === 'prompt2' ? 2 : 'Fix')] = true; return true; } return false; }
  function copy(S, field) {   /* 助教填的指令，學生確認前不能複製 */
    if (!S.ai[field]) return { ok: !isBlank(S.f[field]), reason: isBlank(S.f[field]) ? 'empty' : '' };
    var c = S.f['confirmed' + (field === 'prompt1' ? 1 : field === 'prompt2' ? 2 : 'Fix')];
    return { ok: !!c, reason: c ? '' : 'unconfirmed' };
  }

  /* 按「下一步」：把「做完的樣子」對一次（只指出，不幫改） */
  function next(S, n) { var r = nextCore(S, n); return r && r.ok && !/\.next\.ok$/.test(r.id) ? attach(r, S, n, 'next') : r; }
  function nextCore(S, n) {
    var g = guard(S, n, false); if (g) return g;
    if (S.mode === 'expert') return no('next.none', '', 'none');
    var t = nextOf(S, stepOf(S, n), S.mode === 'mid'); if (t === null) return no('next.none', '', 'none');
    S.used.auto += 1;
    return t ? out(tid(S, n, 'next.issue'), 1, t) : out(tid(S, n, 'next.ok'), 1, '這一步可以了。');
  }

  /* 專家：交出後給評語。最多 2 條（規則檔／畫面／自評／版本），不改寫、不給做法，不扣名額 */
  function hexes(s) { return (String(s).match(/#[0-9a-fA-F]{6}\b/g) || []).map(function (x) { return x.toLowerCase(); }); }
  function pxs(s) { return (String(s).match(/\d+(?=\s*px)/gi) || []).map(Number); }
  function review(S, type) {
    if (S.mode !== 'expert') return no('review.notexpert', '交出後的評語只在專家模式。', 'notexpert');
    var c = [], ids = [], f = S.f;
    function add(id, t) { ids.push(id); c.push(t); }
    if (type === 'rules') {
      var r = tr(f.rules), hx = hexes(r), px = pxs(r), ls = lines(r);
      if (hx.length < 3 || px.length < 3) add('E.rules.nonumber', '規則裡的數字不夠（色碼 ' + hx.length + ' 個、px ' + px.length + ' 個），看的人還是得猜。');
      if (!/不可以|不能|必須/.test(r)) add('E.rules.nomust', '規則裡沒有「必須」或「不可以」，別人怎麼知道哪裡不能破？');
      var main = ls.filter(function (x) { return /主色/.test(x); }).map(hexes).filter(function (a) { return a.length; });
      if (main.length >= 2 && main[0][0] !== main[1][0]) add('E.rules.conflict', '主色寫了兩個不同的色碼（' + main[0][0] + '、' + main[1][0] + '），哪一個算數？');
      if (!c.length) add('E.rules.ok', '規則具體、沒有互相矛盾，你自己覺得哪一條最難守？');
    } else if (type === 'screens') {
      var R = tr(f.rules), okc = hexes(R), oks = pxs(R), rows = lines(f.screensX), bad = [];
      if (!okc.length || !oks.length) add('E.screens.norules', '規則檔裡還沒有色碼和 px，我沒辦法對照你的畫面。');
      else {
        rows.forEach(function (row) { var p = row.split('|').map(tr); if (p.length < 4) return;
          if (okc.indexOf(p[1].toLowerCase()) < 0) bad.push('「' + p[0] + '」的色碼 ' + p[1] + ' 不在規則檔裡');
          if (oks.indexOf(Number(p[2])) < 0) bad.push('「' + p[0] + '」的字級 ' + p[2] + ' 不在規則檔裡');
          if (oks.indexOf(Number(p[3])) < 0) bad.push('「' + p[0] + '」的間距 ' + p[3] + ' 不在規則檔裡'); });
        if (bad.length) add('E.screens.drift', '偏離規則檔：' + bad.slice(0, 2).join('；') + '。'); else add('E.screens.ok', '三個畫面都落在規則檔的數字裡，這些規則有沒有擋不住的地方？');
      }
    } else if (type === 'heur') {
      var hs = lines(f.heur).map(function (x) { return x.split('|').map(tr); });
      if (hs.length !== 10) add('E.heur.count', '啟發式要十項，目前 ' + hs.length + ' 項。');
      else if (hs.some(function (p) { return p[1] === '不符合' && (isBlank(p[2]) || isBlank(p[3])); })) add('E.heur.noreason', '有「不符合」的項目沒寫嚴重程度或理由。');
      else if (hs.filter(function (p) { return p[1] === '符合'; }).length >= 9) add('E.heur.allok', '十項幾乎都符合，最嚴重的問題在哪？');
      else add('E.heur.ok', '嚴重程度各有理由，最嚴重的兩處你打算先處理哪一處？');
    } else if (type === 'ver') {
      var vs = lines(f.verX).map(function (x) { return x.split('|').map(tr); });
      if (vs.length < 3) add('E.ver.count', '至少三個版本，目前 ' + vs.length + ' 個。');
      else if (vs.some(function (p) { return isBlank(p[1]); })) add('E.ver.nobasis', '有一版沒寫依據（哪一項準則或哪位試用者的紀錄）。');
      else add('E.ver.ok', '每一版都有依據，有沒有哪一版其實變差了？');
    } else return no('bad.input', '', 'type');
    S.used.review += 1;
    return { ok: true, id: ids[0], ids: ids, level: 0, text: c.slice(0, 2).join('\n'), comments: c.slice(0, 2) };
  }
  /* 專家這一步有哪些欄位可以請評語（畫面層用） */
  var REVIEW_OF = { rules: 'rules', screensX: 'screens', heur: 'heur', verX: 'ver' };
  function reviewTypes(S, n) { var s = stepOf(S, n); return s && S.mode === 'expert' ? s.fields.filter(function (k) { return REVIEW_OF[k]; }).map(function (k) { return REVIEW_OF[k]; }) : []; }

  /* 所有可能出現的分支 id（測試用來算覆蓋率） */
  var IDS = ['privacy', 'quota', 'level.max', 'bad.input', 'mode.denied', 'fill.cap', 'fill.needinfo', 'stuck.ask', 'stuck.generic', 'sent', 'R.resume', 'G.media', 'resume.none', 'fix.fill.denied', 'idle.novice', 'idle.mid', 'E.level1', 'review.notexpert'];
  Object.keys(TRACKS).forEach(function (tk) {
    var mode = /\.(mid|expert)$/.test(tk) ? tk.split('.')[1] : 'novice';
    TRACKS[tk].forEach(function (s) {
      var b = tk + '.' + s.n + '.';
      if (mode === 'novice') {
        if (s.kind === 'fill1') IDS.push(b + 'fill', b + 'back'); else IDS.push(b + 'enter');
        if (s.l2) IDS.push(b + 'level2'); if (s.fast && s.l2) IDS.push(b + 'idle');
        if (s.kind === 'fill2') IDS.push(b + 'fill');
        if (s.kind === 'fix') (s.items || []).forEach(function (i) { IDS.push(b + 'fix3.' + i); if (ITEM[i].fill) IDS.push(b + 'fill.' + i); });
      } else if (mode === 'mid') {
        IDS.push(b + 'level1'); if (s.preview) IDS.push(b + 'enter');
        if (s.kind === 'fix') (s.items || []).forEach(function (i) { IDS.push(b + 'cause.' + i); }); else if (s.l2) IDS.push(b + 'level2');
      }
      if (mode !== 'expert' && (s.req || s.nextN || (mode === 'mid' && s.nextM))) IDS.push(b + 'next.issue', b + 'next.ok');
      if (mode !== 'expert') Object.keys(s.stuck || {}).forEach(function (k) { IDS.push('stuck.' + tk + '.' + s.n + '.' + k + '.L1', 'stuck.' + tk + '.' + s.n + '.' + k + '.L2'); });
    });
  });
  IDS.push('E.rules.nonumber', 'E.rules.nomust', 'E.rules.conflict', 'E.rules.ok', 'E.screens.norules', 'E.screens.drift', 'E.screens.ok', 'E.heur.count', 'E.heur.noreason', 'E.heur.allok', 'E.heur.ok', 'E.ver.count', 'E.ver.nobasis', 'E.ver.ok');
  IDS = IDS.filter(function (x, i) { return IDS.indexOf(x) === i; });

  return { MODES: MODES, PARTS: PARTS, PART_ORDER: PART_ORDER, TRACKS: TRACKS, CAPS: CAPS, LEVEL_NAME: LEVEL_NAME, FORBIDDEN: FORBIDDEN, COACH_PER_DAY: COACH_PER_DAY, FILL_CAP: FILL_CAP, IDS: IDS, ITEM: ITEM,
           OPTS: OPTS, P1: P1, FIX2: FIX2, IMG_DIR: IMG_DIR, UI_TERMS: UI_TERMS, UI_TERMS_SRC: UI_TERMS_SRC, POS_WORDS: POS_WORDS, CLAUDE_LIMIT: CLAUDE_LIMIT, MEDIA: MEDIA, MEDIA_GAPS: MEDIA_GAPS, PENDING_VERIFY: PENDING_VERIFY, START_MEDIA: START_MEDIA, mediaList: mediaList, MEDIA_ON: MEDIA_ON,
           stepsOf: stepsOf, stepOf: stepOf, trackKey: trackKey, avail: avail, partIntro: partIntro, reviewTypes: reviewTypes, stepMedia: stepMedia, showMedia: showMedia, resume: resume, p2: p2,
           newState: newState, enter: enter, sent: sent, idle: idle, stuck: stuck, level: level, next: next, review: review,
           confirm: acceptFill, copy: copy, edit: function (S, k, v) { S.f[k] = v; delete S.ai[k]; return S; }, len: len, quotaUsed: quotaUsed };
})();
if (typeof module !== 'undefined') module.exports = FigCoach;
