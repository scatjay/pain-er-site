/* 急診室房間配樂：固定資料、可重現音符與 WebAudio 前瞻排程。 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./layout.js').ROOMS);else root.ERG_BGM=factory(root.ERG_LAYOUT.ROOMS);})(typeof self!=='undefined'?self:this,function(ROOMS){
  'use strict';
  function hash(s){var h=2166136261;for(var i=0;i<String(s).length;i++){h^=String(s).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
  var MODES=[[0,2,4,7,9],[0,3,5,7,10],[0,2,5,7,9],[0,3,5,8,10]], WAVES=['sine','triangle','sine','triangle'];
  var ROOMS_DATA={}; ROOMS.forEach(function(r,i){var seed=hash(r.id),mode=MODES[seed%MODES.length];ROOMS_DATA[r.id]={mode:mode.slice(),bpm:[60,72,75,90,100,120][seed%6],wave:WAVES[(seed>>>4)%WAVES.length],pattern:[1,0,0,1,0,0,1,0].slice(0,4+(seed%2)*2),root:45+seed%13};});
  function notes(room,seed,bar){var c=ROOMS_DATA[room];if(!c)throw new Error('沒有房間配樂：'+room);seed=seed===undefined?0:seed;bar=bar||0;var state=(hash(room)^hash(seed)^Math.imul(bar+1,0x9e3779b1))>>>0,out=[];for(var i=0;i<c.pattern.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;if(c.pattern[i]&&state%4!==0){var scale=c.mode[state%c.mode.length],oct=state%3===0?12:0;out.push({beat:Math.round(i*16/c.pattern.length)/4,midi:c.root+scale+oct,duration:.32,velocity:.18});}}return out;}
  function createPlayer(AudioContext,opts){opts=opts||{};var ctx=null,gain=null,timer=null,enabled=false,room=null,seed=opts.seed||0,volume=Math.min(.05,opts.volume===undefined?.05:opts.volume),next=0,step=0,osc=[];
    function init(){if(ctx)return;ctx=new AudioContext();gain=ctx.createGain();gain.gain.value=0;gain.connect(ctx.destination);}
    function tone(n,time,dur,vel,wave){var o=ctx.createOscillator(),g=ctx.createGain();o.type=wave;o.frequency.value=440*Math.pow(2,(n-69)/12);g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume*vel,time+.025);g.gain.setTargetAtTime(0,time+dur*.6,.06);o.connect(g);g.connect(gain);o.start(time);o.stop(time+dur+.25);osc.push(o);}
    function schedule(){if(!enabled||!room)return;var c=ROOMS_DATA[room],sec=60/c.bpm/4,bar=Math.floor(step/16),beat=(step%16)/4,arr=notes(room,seed,bar);arr.forEach(function(n){if(Math.abs(n.beat-beat)<.001)tone(n.midi,next,n.duration*sec*4,n.velocity,c.wave);});next+=sec;step++;}
    function enter(id){if(!ROOMS_DATA[id]||id===room)return;room=id;step=0;init();var now=ctx.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setTargetAtTime(enabled?volume:0,now,.12);next=now+.08;if(timer)clearInterval(timer);timer=setInterval(function(){if(!ctx||!enabled)return;while(next<ctx.currentTime+1.2)schedule();},120);}
    function setEnabled(v){enabled=!!v;if(enabled){init();if(ctx.state==='suspended')ctx.resume();if(room){gain.gain.setTargetAtTime(volume,ctx.currentTime,.14);next=ctx.currentTime+.08;}}else if(gain)gain.gain.setTargetAtTime(0,ctx.currentTime,.12);}
    function stop(){enabled=false;if(timer)clearInterval(timer);if(gain)gain.gain.setTargetAtTime(0,ctx.currentTime,.08);osc.forEach(function(o){try{o.stop(ctx.currentTime+.4);}catch(e){}});}
    return {enter:enter,setEnabled:setEnabled,stop:stop};
  }
  return {ROOMS:ROOMS_DATA,notes:notes,createPlayer:createPlayer};
});
