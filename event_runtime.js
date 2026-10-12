(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ERG_EVENT_RUNTIME=factory();})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function record(list,id,time,room){var a=(list||[]).slice();if(!a.some(function(x){return x.id===id&&x.time===time;}))a.push({id:id,time:time,room:room});return a;}
  function sample(world,time){return world.at(time).map(function(x){return {id:x.ent.id,pid:x.ent.pid,room:x.pos.room,x:x.pos.x,y:x.pos.y,state:x.pos.state,act:x.pos.act};}).sort(function(a,b){return a.id.localeCompare(b.id);});}
  function replay(world,entry,offset){return sample(world,entry.time+Math.max(0,offset||0));}
  function rotationSeed(session,player){return String(session||'ERG')+':'+String(player||'player');}
  function activePriority(events,minute){return (events||[]).filter(function(e){return e.importance===3&&minute>=e.when.window[0]&&minute<=e.when.window[1];}).sort(function(a,b){return b.importance-a.importance||a.id.localeCompare(b.id);})[0]||null;}
  return {record:record,sample:sample,replay:replay,rotationSeed:rotationSeed,activePriority:activePriority};
});
