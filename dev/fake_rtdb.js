/* In-memory stand-in for the Firebase Realtime Database compat API, faithful
   in the ways the storage layer depends on:
   - multi-path update() at the root, applied atomically
   - child_added / child_changed / child_removed on a parent, value on a path
   - child_added replays existing children when a listener attaches
   - LOCAL events fire synchronously inside update(), BEFORE the promise
     resolves (this is what makes echo detection necessary)
   - empty arrays/objects and nulls are dropped from stored data
   - remoteWrite() simulates another client's change (events, no echo) */
(function(){
  var root = {};
  var listeners = [];   /* {path, event, cb} */
  var log = [];         /* every update() payload, for assertions */

  function clean(v){
    if(Array.isArray(v)){ var a = v.map(clean).filter(function(x){ return x !== undefined; }); return a.length ? a : undefined; }
    if(v && typeof v === "object"){
      var o = {}, any = false;
      /* RTDB hands keys back sorted — mirror that so ordering bugs show up here */
      Object.keys(v).sort().forEach(function(k){ var c = clean(v[k]); if(c !== undefined){ o[k] = c; any = true; } });
      return any ? o : undefined;
    }
    if(v === null || v === undefined) return undefined;
    return v;
  }
  function segs(p){ return String(p||"").split("/").filter(Boolean); }
  function getAt(p){ var n = root, s = segs(p); for(var i=0;i<s.length;i++){ if(!n || typeof n !== "object") return undefined; n = n[s[i]]; } return n; }
  function deepClone(v){ return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function setAt(p, v){
    var s = segs(p);
    if(!s.length){ root = clean(v) || {}; return; }
    var n = root;
    for(var i=0;i<s.length-1;i++){ if(!n[s[i]] || typeof n[s[i]] !== "object") n[s[i]] = {}; n = n[s[i]]; }
    var c = clean(v);
    if(c === undefined) delete n[s[s.length-1]]; else n[s[s.length-1]] = c;
  }
  function parentOf(p){ var s = segs(p); return s.slice(0,-1).join("/"); }
  function keyOf(p){ var s = segs(p); return s[s.length-1]; }
  function snap(key, val){ return {key:key, val:function(){ return deepClone(val === undefined ? null : val); }}; }

  function fire(path, before, after){
    var parent = parentOf(path), key = keyOf(path);
    listeners.forEach(function(l){
      if(l.path === parent){
        if(before === undefined && after !== undefined && l.event === "child_added") l.cb(snap(key, after));
        else if(before !== undefined && after !== undefined && l.event === "child_changed") l.cb(snap(key, after));
        else if(before !== undefined && after === undefined && l.event === "child_removed") l.cb(snap(key, before));
      }
      if(l.path === path && l.event === "value") l.cb(snap(key, after));
    });
  }
  function applyWrites(writes, echo){
    var changes = [];
    Object.keys(writes).forEach(function(p){
      var before = deepClone(getAt(p));
      setAt(p, writes[p]);
      var after = deepClone(getAt(p));
      if(JSON.stringify(before) !== JSON.stringify(after)) changes.push([p, before, after]);
    });
    changes.forEach(function(c){ fire(c[0], c[1], c[2]); });
    return changes;
  }

  function ref(path){
    path = segs(path).join("/");
    return {
      once: function(ev){
        /* microtask, not a timer: background tabs throttle timers to a crawl */
        return Promise.resolve().then(function(){ return snap(keyOf(path), getAt(path)); });
      },
      on: function(ev, cb, errCb){
        listeners.push({path:path, event:ev, cb:cb});
        if(ev === "child_added"){
          var v = getAt(path) || {};
          Object.keys(v).forEach(function(k){ cb(snap(k, v[k])); });
        }
        if(ev === "value") cb(snap(keyOf(path), getAt(path)));
        return cb;
      },
      off: function(){ listeners = listeners.filter(function(l){ return l.path !== path; }); },
      update: function(obj){
        var writes = {};
        Object.keys(obj).forEach(function(k){ writes[(path ? path+"/" : "") + segs(k).join("/")] = obj[k]; });
        log.push(deepClone(writes));
        applyWrites(writes, true);                       /* local events, synchronously */
        return Promise.resolve().then(function(){});               /* ack after the local events */
      },
      set: function(v){ var w = {}; w[path] = v; log.push(deepClone(w)); applyWrites(w, true); return Promise.resolve(); },
      remove: function(){ var w = {}; w[path] = null; applyWrites(w, true); return Promise.resolve(); }
    };
  }

  window.__fakeDb = {
    ref: ref,
    seedRoot: function(obj){ root = clean(deepClone(obj)) || {}; listeners = []; log.length = 0; },
    dump: function(){ return deepClone(root); },
    at: function(p){ return deepClone(getAt(p)); },
    remoteWrite: function(p, v){ var w = {}; w[segs(p).join("/")] = v; applyWrites(w, false); },
    log: log,
    lastUpdate: function(){ return log.length ? log[log.length-1] : null; },
    clearLog: function(){ log.length = 0; },
    listenerCount: function(){ return listeners.length; }
  };
})();
