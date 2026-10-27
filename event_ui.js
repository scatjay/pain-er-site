(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ERG_EVENT_UI=factory();})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function esc(s){return window.ERG_APP.esc(String(s==null?'':s));}
  function guide(id){return window.ERG_EVENT_GUIDE.build().filter(function(g){return g.id===id;})[0];}
  function names(cur){var out={};Object.keys(cur.world.personas||{}).forEach(function(k){out[k]=cur.world.personas[k].name;});cur.world.entities.forEach(function(e){out[e.pid]=e.name;});return out;}
  function note(cur,g,entry){var t=cur.world.sim.formatSim(cur.world.sim.simMinAt(entry.time));var text='目擊 '+g.id+'｜'+g.title+'｜'+t+'｜'+window.ERG_EVENT_GUIDE.roomName(entry.room);window.ERG_PANELS.addOpenCard('便利貼',text);}
  function replay(cur,g,entry){
    var S=window.ERG_ROOM,box=document.getElementById('modalBox'),simEvent=cur.world.sim.events.filter(function(e){return e.id===g.id;})[0],windowStart=simEvent?simEvent.start:cur.world.sim.simMinAt(entry.time),start=Math.max(0,cur.world.sim.worldSecAtSim(windowStart)-20),length=simEvent?Math.max(40,(simEvent.end-simEvent.start)*cur.world.data.SIM.SECONDS_PER_SIM_MIN+40):90,elapsed=0,speed=1,paused=false,timer=null,savedTime=cur.player.worldSec,savedLoc=cur.player.loc,savedClock=cur.clock,closed=false,ready=false;cur.clock=window.ERG_CLOCK.setPaused(cur.clock,true);function finish(close){if(closed)return;closed=true;clearInterval(timer);cur.clock=savedClock;if(cur.player.worldSec!==savedTime||cur.player.loc!==savedLoc)throw new Error('Replay altered player state');if(close)S.closeModal();}
    function paint(){
      var t=start+elapsed,min=cur.world.sim.simMinAt(t),bi=0,progress=elapsed/length*g.beats[g.beats.length-1].at;g.beats.forEach(function(b,i){if(progress>=b.at)bi=i;});var beat=g.beats[bi],people=names(cur),lines=beat.lines.map(function(l){return '<div><b>'+esc(people[l.who]||l.who)+'</b>：'+esc(l.text)+'</div>';}).join('');
      var dots=window.ERG_EVENT_RUNTIME.sample(cur.world,t).filter(function(x){return x.x!==undefined;}).map(function(x){return{x:x.x,y:x.y,kind:'npc'};});
      if(!ready){box.innerHTML='<div class="row"><b class="grow" id="replayTitle"></b><button class="ghost" id="replayClose">關閉</button></div><div class="replayStage"><div class="replayMap"></div><div class="replayCaption" id="replayCaption"></div></div><div class="row"><button id="replayPause"></button><button data-rate="0.5">0.5×</button><button data-rate="1">1×</button><button data-rate="2">2×</button><button id="replayNote">記一張便利貼</button><span class="muted">拖曳時間軸可查看確定性人物走位；不改變玩家位置與模擬時鐘。</span></div><input id="replayRange" type="range" min="0" max="'+length+'" value="0" style="width:100%">';
        box.querySelector('#replayClose').onclick=function(){finish(true);};
        box.querySelector('#replayPause').onclick=function(){paused=!paused;paint();};box.querySelectorAll('[data-rate]').forEach(function(b){b.onclick=function(){speed=Number(b.dataset.rate);};});
        box.querySelector('#replayRange').oninput=function(){elapsed=Number(this.value);paint();};box.querySelector('#replayNote').onclick=function(){note(cur,g,entry);};ready=true;
      }
      box.querySelector('#replayTitle').textContent='重播｜'+g.title+'　'+cur.world.sim.formatSim(min);box.querySelector('#replayPause').textContent=paused?'繼續':'暫停';
      box.querySelector('#replayRange').value=String(elapsed);box.querySelector('.replayMap').innerHTML=window.ERG_MINIMAP.svg(window.ERG_LAYOUT,{compact:true,fontScale:1.05,onlyMap:true,width:720,showFurniture:false,you:entry.room,dots:dots});
      box.querySelector('#replayCaption').innerHTML='<b>'+esc(beat.detail||beat.caption)+'</b>'+lines+(beat.sfx?'<div class="replaySfx">'+esc(beat.sfx)+'</div>':'');
    }
    S.openModal('<div></div>');paint();timer=setInterval(function(){if(!document.getElementById('modal').classList.contains('on')){finish(false);return;}if(!paused){elapsed+=0.5*speed;if(elapsed>length)elapsed=0;paint();}},500);
  }
  /* 10-27 廖漢翎：事件簿的「已遇到」只讀這間房的紀錄，登入落在別間房就整份空白。改成合併自己所有房間（同一個事件取最早的一筆）。 */
  function allReplays(cur){var seen={};function add(list){(list||[]).forEach(function(r){if(r&&r.id&&(!seen[r.id]||(Number(r.time)||0)<(Number(seen[r.id].time)||0)))seen[r.id]=r;});}
    try{var A=window.ERG_APP,C=window.ERG_CORE;if(A&&A.DB&&C&&A.me&&A.me.sid){A.DB.listRooms(A.SESS).forEach(function(x){var r=A.DB.getRoom(x.code),p=r&&r.members&&r.members[A.me.sid]?C.getPlayer(r,A.me.sid):null;if(p)add(p.replays);});}}catch(e){}
    add(cur.player.replays);return seen;}
  function renderBook(cur,host){var all=window.ERG_EVENT_GUIDE.build().filter(function(g){return g.caseId==='sms'||g.caseId===cur.world.meta.id;}),seen=allReplays(cur);
    host.innerHTML='<div class="card"><b>重要事件簿</b><div class="muted">已遇到事件可查看觀察與訪談提示並重播。未遇到事件只顯示地點與模擬時間。</div></div>'+all.map(function(g){var r=seen[g.id],when=g.when.label,room=g.rooms.map(window.ERG_EVENT_GUIDE.roomName).join('、');return '<details class="eventEntry"><summary><b>'+esc(g.title)+'</b>　'+('★'.repeat(g.importance))+'<div class="muted">'+esc(when)+'　｜　'+esc(room)+(r?'　｜　已遇到':'　｜　尚未遇到')+'</div></summary>'+(r?'<div class="eventAnswers"><b>觀察</b><ul>'+g.observe.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul><b>訪談方向提醒</b><div class="muted">這不是誰問過的紀錄，是遊戲給你的提示：這件事發生後，可以去問下面這些人、往這個方向問。</div>'+g.interview.map(function(x){return '<div class="card"><b>建議去問：'+esc((cur.world.personas[x.who]||{}).name||x.who)+'</b><p>可以這樣問：「'+esc(x.ask)+'」</p><p><b>聽的時候留意：</b>'+esc(x.listenFor)+'</p></div>';}).join('')+'<p class="muted">使用性問題：'+esc(g.usability)+'</p><button data-replay="'+esc(g.id)+'">重播</button></div>':'<p class="muted">前往 '+esc(room)+'；約 '+esc(when)+' 發生。遇到事件後才會顯示觀察與訪談提示。</p>')+'</details>';}).join('');
    host.querySelectorAll('[data-replay]').forEach(function(b){b.onclick=function(){var e=seen[b.dataset.replay];if(e)replay(cur,guide(e.id),e);};});
  }
  /* ───── 10-18 事件條（北極星計畫 P1）：旁白不再蓋在房間上，改成固定位置的「事件條」 ─────
     電腦＝#roomNow 那一條；手機＝場景下方 #ticker。條內固定有 暫停／下一句／跳過，位置每拍不變。
     狀態（優先序）：進行中 > 別間房事件通知＋剛結束（可以問的問題，兩者同時存在時並列兩行）> 只有通知 > 只有剛結束。永不自動切換鏡頭。 */
  function ic(n,fb){var I=window.ERG_ICONS;return (I&&I[n])||fb;}   /* 10-18 圖示：沒載入 icons.js 就退回 emoji */
  function isMob(cur){return !!(cur.mobile||cur.singleRoom);}
  function hostOf(cur){return document.getElementById(isMob(cur)?'ticker':'roomNow');}
  function isRoom(r){var x=window.ERG_LAYOUT&&window.ERG_LAYOUT.room(r);return !!(x&&x.type==='room');}
  function rname(r){return window.ERG_EVENT_GUIDE.roomName(r);}
  function entOf(cur,pid){return cur.world.entities.filter(function(x){return x.pid===pid;})[0];}
  function visEl(el){if(!el||!el.getBoundingClientRect)return false;var cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0)return false;var r=el.getBoundingClientRect();return r.width>0&&r.height>0;}
  function rectOf(el){var r=el.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom};}
  function ov(a,b){var w=Math.min(a.r,b.r)-Math.max(a.l,b.l),h=Math.min(a.b,b.b)-Math.max(a.t,b.t);return (w>0&&h>0)?w*h:0;}
  function onStage(cur,ent){var tok=ent&&cur.tokens[ent.id];if(!visEl(tok))return false;var st=document.getElementById('sceneBox')||document.getElementById('stage'),s=rectOf(st),r=rectOf(tok),cx=(r.l+r.r)/2,cy=(r.t+r.b)/2;return cx>=s.l&&cx<=s.r&&cy>=s.t&&cy<=s.b;}
  function beatIdx(g,t){var bi=0;g.beats.forEach(function(b,i){if(t>=b.at)bi=i;});return bi;}
  function ctlHtml(p){return '<button type="button" class="evPause" data-evact="pause" aria-label="'+(p.paused?'繼續演出':'暫停演出')+'">'+(p.paused?ic('play','▶')+' 繼續':ic('pause','⏸')+' 暫停演出')+'</button><button type="button" class="evNext" data-evact="next" aria-label="下一句">'+ic('skip-forward','⏭')+' 下一句</button><button type="button" class="evSkip" data-evact="skip" aria-label="跳過事件演出">跳過</button>';}
  function playState(cur,g,p){
    var bi=beatIdx(g,p.t||0),beat=g.beats[bi],people=names(cur),line=beat.lines[0],mob=isMob(cur),spk=line?(people[line.who]||line.who):'';
    var ent=line&&entOf(cur,line.who),on=!!ent&&onStage(cur,ent),showLine=!!line&&(mob||!on);
    var body='<b class="evCap">'+esc(beat.caption)+'</b>'+(showLine?'<span class="evLine"><b>'+esc(spk)+(on||/（/.test(spk)?'':'（不在場）')+'</b>：<span class="'+esc(line.kind)+'">'+esc(line.text)+'</span></span>':'');
    var bub=(!mob&&line&&on)?'<div class="evBub" data-ent="'+esc(ent.id)+'"><b>'+esc(spk)+'</b><span class="'+esc(line.kind)+'">'+esc(line.text)+'</span></div>':'';
    var hostEl=hostOf(cur),hw=hostEl&&hostEl.clientWidth,narrow=!!(hw&&hw<640),wrap=!mob&&!!(hw&&hw<760);   /* 視窗窄（例如 1084）：標籤縮成「事件」，字獨立一整列（evWrap），不再被擠成 225px 寬 */
    return {kind:'play',spkEnt:on?ent.id:null,gid:g.id,key:'play|'+p.id+'|'+bi+'|'+(p.paused?1:0)+'|'+(on?1:0)+'|'+(narrow?1:0)+'|'+(wrap?1:0),bubble:bub,
      html:'<div class="evBar evPlay'+(mob?' evMob':'')+(wrap?' evWrap':'')+'" role="group" aria-label="事件進行中"><span class="evTag">'+(mob||narrow?'事件':'事件進行中')+'</span><span class="evCtl">'+ctlHtml(p)+'</span><span class="evBody" title="'+esc(beat.caption+(line?'　'+spk+'：'+line.text:''))+'">'+body+'</span></div>'};
  }
  function noticeState(cur,list){
    var n=list[0],more=list.length>1?'（還有 '+(list.length-1)+' 件）':'';
    return {kind:'notice',key:'notice|'+n.id+'|'+list.length,bubble:'',
      html:'<div class="evBar evNotice'+(isMob(cur)?' evMob':'')+'" role="group" aria-label="別間房發生事件"><span class="evTag">'+ic('bell','📣')+' 事件</span><span class="evCtl">'+(n.room?'<button type="button" class="evGo" data-evact="go">去看</button>':'')+'<button type="button" class="evDismiss" data-evact="dismiss">略過</button></span><span class="evBody"><b>'+esc(rname(n.room||n.name))+'</b>發生了事件：'+esc(n.title)+esc(more)+'</span></div>'};
  }
  function afterState(cur,a){
    var g=guide(a.id),asks=g?g.interview:[],people=names(cur),mob=isMob(cur);
    var open=a.open?'<span class="evAskList">'+asks.map(function(x){var nm=people[x.who]||x.who;return '<span class="evAsk">建議問 <b>'+esc(nm)+'</b>：「'+esc(x.ask)+'」<button type="button" class="evFind" data-evact="find" data-who="'+esc(x.who)+'">去找'+esc(nm)+'</button></span>';}).join('')+'</span>':'';
    return {kind:'after',key:'after|'+a.id+'|'+(a.open?1:0),bubble:'',
      html:'<div class="evBar evAfter'+(mob?' evMob':'')+(a.open?' evOpen':'')+'" role="group" aria-label="事件剛結束"><span class="evTag evTagDone">剛發生</span><span class="evCtl"><button type="button" class="evAskBtn" data-evact="ask" aria-expanded="'+(a.open?'true':'false')+'">可以問的問題</button><button type="button" class="evClose" data-evact="close" aria-label="關閉">'+ic('x','✕')+'</button></span><span class="evBody"><b class="evCap">'+esc(g?g.title:a.id)+'</b>'+open+'</span></div>'};
  }
  /* 10-18：別間房的通知與「剛結束的可以問的問題」同時存在時並列（通知一行、可以問的問題一行），不再讓通知把可以問的問題蓋掉 */
  function bothState(cur,ns,a){
    var n=noticeState(cur,ns),f=afterState(cur,a);
    return {kind:'both',key:'both|'+n.key+'|'+f.key,bubble:'',html:'<div class="evStack">'+n.html+f.html+'</div>'};
  }
  function wanted(cur){
    var p=cur.eventPlayback;if(p){var g=guide(p.id);if(g)return playState(cur,g,p);}
    var ns=cur._evNotices||[],a=cur._evAfter,live=!!(a&&Date.now()<a.until);
    if(ns.length&&live)return bothState(cur,ns,a);
    if(ns.length)return noticeState(cur,ns);
    if(live)return afterState(cur,a);
    return null;
  }
  /* 別人（room.js／m.js 的 eventWatch、refreshTicker）用這個判斷：事件條在用的時候不要去改寫同一格 */
  function busy(cur){if(!cur)return '';if(cur.eventPlayback)return 'play';if((cur._evNotices||[]).length)return 'notice';var a=cur._evAfter;return (a&&Date.now()<a.until)?'after':'';}
  function release(cur,S,host){
    host._evKey='';host.classList.remove('evOn');
    if(isMob(cur)){host.innerHTML='';host.style.display='none';if(S&&S.refreshTicker)S.refreshTicker();}
    else if(host.querySelector('.evBar'))host.innerHTML='';
  }
  /* 電腦版對話泡泡：貼在說話者旁邊，13 個候選位置挑「蓋到人物／名牌／線索牌最少」的，夾在場景內、狀態條之下 */
  function placeBubble(cur){
    var host=document.getElementById('eventPlay'),b=host&&host.querySelector('.evBub');if(!b)return;
    var tok=cur.tokens[b.getAttribute('data-ent')];if(!visEl(tok)){b.style.visibility='hidden';return;}
    var st=document.getElementById('sceneBox')||document.getElementById('stage'),S0=rectOf(st),hr=host.getBoundingClientRect(),rn=document.getElementById('roomNow'),tb=document.getElementById('travelBar');
    var top0=Math.max(S0.t+4,visEl(rn)?rn.getBoundingClientRect().bottom+4:0),bot=visEl(tb)?tb.getBoundingClientRect().top-4:S0.b-4;
    b.style.visibility='visible';var bw=b.offsetWidth,bh=b.offsetHeight,t=rectOf(tok),cx=(t.l+t.r)/2,cy=(t.t+t.b)/2,gap=6;
    var obs=[];Object.keys(cur.tokens).forEach(function(id){var el=cur.tokens[id];if(!visEl(el))return;obs.push({r:rectOf(el),w:3});var nm=el.querySelector&&el.querySelector('.nm');if(nm&&visEl(nm))obs.push({r:rectOf(nm),w:2});});
    Array.prototype.forEach.call(document.querySelectorAll('.pinHit'),function(el){if(visEl(el))obs.push({r:rectOf(el),w:4});});
    ['rotationBtn','rotationBadge','sfx','travelBar','toastBox'].forEach(function(id){var el=document.getElementById(id);if(visEl(el))obs.push({r:rectOf(el),w:3});});
    var cands=[[cx-bw/2,t.t-bh-gap],[cx-bw/2,t.b+gap],[t.r+gap,cy-bh/2],[t.l-bw-gap,cy-bh/2],[t.l-bw+10,t.t-bh-gap],[t.r-10,t.t-bh-gap],[t.l-bw+10,t.b+gap],[t.r-10,t.b+gap],[S0.l+6,top0],[S0.r-bw-6,top0],[(S0.l+S0.r)/2-bw/2,top0],[S0.l+6,bot-bh],[S0.r-bw-6,bot-bh]];
    var res=cands.map(function(c,i){var x=Math.min(Math.max(c[0],S0.l+4),S0.r-bw-4),y=Math.min(Math.max(c[1],top0),bot-bh),r={l:x,t:y,r:x+bw,b:y+bh},raw=0;obs.forEach(function(o){raw+=ov(r,o.r)*o.w;});
      return {i:i,x:x,y:y,raw:raw,s:raw+Math.hypot(x+bw/2-cx,y+bh/2-cy)*0.02+i*0.5+(i>=8?40:0)};});
    var keep=res.filter(function(r){return r.i===b._pos&&r.raw===0;})[0];
    var pick=keep||res.reduce(function(a,c){return c.s<a.s?c:a;});
    b._pos=pick.i;b.style.left=(pick.x-hr.left)+'px';b.style.top=(pick.y-hr.top)+'px';
  }
  /* ───── 10-18 P2 聚焦與讓位：說話者加環（data-evf=focus）、與事件無關的人物淡化（data-evf=dim）。
     只動 data-evf 屬性，不碰 token 的 class／位置／z 層（room.js、m.js 每幀會重設 className，屬性不受影響），演出結束屬性移除、CSS 0.3 秒淡回。 */
  function castSet(cur,gid){
    if(cur._evCast&&cur._evCast.id===gid&&cur._evCast.n===cur.world.entities.length)return cur._evCast.set;
    var g=guide(gid),inC={},set={};if(g){(g.cast||[]).forEach(function(c){inC[c]=1;});g.beats.forEach(function(b){b.lines.forEach(function(l){inC[l.who]=1;});});}
    cur.world.entities.forEach(function(e){if(inC[e.pid])set[e.id]=1;});cur._evCast={id:gid,n:cur.world.entities.length,set:set};return set;
  }
  function applyFocus(cur,st){
    var play=!!(st&&st.kind==='play'),cs=play?castSet(cur,st.gid):null;
    Object.keys(cur.tokens).forEach(function(id){var el=cur.tokens[id];if(!el||!el.setAttribute||id==='me')return;
      var w='';if(play)w=(st.spkEnt===id)?'focus':(cs[id]?'':'dim');
      var h=el.getAttribute('data-evf')||'';if(h!==w){if(w)el.setAttribute('data-evf',w);else el.removeAttribute('data-evf');}});
  }
  function paint(cur,S){
    var host=hostOf(cur),bh=document.getElementById('eventPlay');if(!host)return;
    var st=wanted(cur);
    if(!st){if(host._evKey)release(cur,S,host);if(bh&&bh.innerHTML)bh.innerHTML='';applyFocus(cur,null);return;}
    if(!host._evBound){host._evBound=1;host.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('[data-evact]');if(b)act(b.getAttribute('data-evact'),b);});}
    if(host._evKey!==st.key){host._evKey=st.key;host.innerHTML=st.html;host.classList.add('evOn');host.classList.remove('go','cap');host.onclick=null;host.removeAttribute('role');host.setAttribute('aria-live','polite');if(isMob(cur))host.style.display='block';if(bh)bh.innerHTML=st.bubble||'';}
    if(st.bubble)placeBubble(cur);
    applyFocus(cur,st);
  }
  function act(name,btn){
    var S=window.ERG_ROOM,cur=S&&S.cur;if(!cur)return;var p=cur.eventPlayback,g=p&&guide(p.id);
    if(name==='pause'&&p){p.paused=!p.paused;p.lastT=Date.now();}
    else if(name==='next'&&p&&g){var bi=beatIdx(g,p.t||0);if(bi+1<g.beats.length)p.t=g.beats[bi+1].at+0.001;else p.skip=true;}
    else if(name==='skip'&&p){p.skip=true;}
    else if(name==='go'){var n=(cur._evNotices||[])[0];if(n){cur._evNotices.shift();if(n.room&&S.jump)S.jump(n.room);}}
    else if(name==='dismiss'){(cur._evNotices||[]).shift();}
    else if(name==='ask'&&cur._evAfter){cur._evAfter.open=!cur._evAfter.open;cur._evAfter.until=Date.now()+(cur._evAfter.open?40000:20000);}
    else if(name==='close'){cur._evAfter=null;}
    else if(name==='find'){
      var ent=entOf(cur,btn.getAttribute('data-who'));if(!ent)return;var it=cur.world.at(cur.clock.worldSec).filter(function(x){return x.ent.id===ent.id;})[0],rid=it&&it.pos&&it.pos.room;
      if(!rid||!isRoom(rid)){S.toast('現在找不到'+ent.name+'，過一會兒再試。');return;}
      if(rid===cur.player.loc){cur.selNpc=ent.id;if(S.switchTab)S.switchTab('intv');}
      else{cur.pendingNpc=ent.id;S.toast('到了'+rname(rid)+'，找 '+ent.name+'…');if(S.jump)S.jump(rid);else if(S.teleport)S.teleport(rid);}
    }
    tick(cur,S);
  }
  /* 別間房的重要事件：不切鏡頭，只通知（eventWatch 每幀呼叫）。告知過的、看過的不再通知；事件結束、逾時、人已經進那間房就收掉。 */
  function notice(cur,act,far){
    cur.farTold=cur.farTold||{};var live={};act.forEach(function(e){live[e.id]=1;});
    cur._evNotices=(cur._evNotices||[]).filter(function(n){return live[n.id]&&Date.now()<n.until&&cur.player.loc!==n.room;});
    far.forEach(function(e){if(cur.farTold[e.id]||(cur.seenEv&&cur.seenEv[e.id])||(cur.player.seenEv||{})[e.id])return;cur.farTold[e.id]=true;
      var rr=(e.rooms||[]).filter(isRoom)[0];cur._evNotices.push({id:e.id,title:e.title,room:rr,name:(e.rooms||[])[0],until:Date.now()+20000});});
  }
  function startLive(cur,ev,room){var g=guide(ev.id);if(!g)return;if((ev.rooms||[]).indexOf(cur.player.loc)>=0&&cur.watchRoom!==cur.player.loc&&window.ERG_ROOM.setWatchRoom)window.ERG_ROOM.setWatchRoom(cur.player.loc);var item={id:ev.id,time:cur.clock.worldSec,room:room,start:cur.eventPlayback?0:Date.now(),viewRoom:cur.watchRoom||cur.player.loc,skip:false,paused:false,t:0,lastT:Date.now()};if(cur.eventPlayback){cur.eventQueue=cur.eventQueue||[];cur.eventQueue.push(item);}else cur.eventPlayback=item;if(window.ERG_PANELS)window.ERG_PANELS.render('events');}
  function finish(cur,S,p,g){
    cur.eventPlayback=(cur.eventQueue&&cur.eventQueue.length)?cur.eventQueue.shift():null;
    if(cur.eventPlayback){cur.eventPlayback.start=Date.now();cur.eventPlayback.t=0;cur.eventPlayback.lastT=Date.now();}
    cur.seenEv=cur.seenEv||{};cur.seenEv[p.id]=true;cur.player.replays=window.ERG_EVENT_RUNTIME.record(cur.player.replays,p.id,p.time,p.room);cur.player.seenEv=cur.player.seenEv||{};cur.player.seenEv[p.id]=true;
    if(!p.left)cur._evAfter={id:p.id,until:Date.now()+20000,open:false};   /* 決定 6：訪談提示改成結束後事件條上的小按鈕，不再由 NPC 念出來 */
    if(window.ERG_PANELS&&cur.tab==='events')window.ERG_PANELS.render('events');S.persist(true);
  }
  function tick(cur,S){
    var p=cur.eventPlayback;
    if(p){
      var g=guide(p.id);if(!g){paint(cur,S);return;}
      var now=Date.now();if(p.lastT==null)p.lastT=now;if(!p.paused)p.t=(p.t||0)+(now-p.lastT)/1000;p.lastT=now;
      /* 10-13 手機一次只看一間房（cur.singleRoom）：人離開事件的房間，演出就收掉，鏡頭也不切到別間房；只在走道發生的事件，人本來就在移動，不因為走出去而收掉 */
      var pr0=window.ERG_LAYOUT&&window.ERG_LAYOUT.room(p.room);if(cur.singleRoom&&pr0&&pr0.type==='room'&&cur.player.loc!==p.room){p.skip=true;p.left=true;}
      if((p.t||0)>=g.beats[g.beats.length-1].at+4||p.skip){finish(cur,S,p,g);paint(cur,S);return;}
      p.lastBeat=beatIdx(g,p.t||0);
    }
    paint(cur,S);
  }
  return {renderBook:renderBook,startLive:startLive,tick:tick,replay:replay,busy:busy,notice:notice};
});
