"""Builds preview-demo.html next to index.html: the app wired to the in-memory
fake RTDB, Google sign-in bypassed, and a window.__dbg hook exposing
IIFE-internal functions. Serve with `python3 -m http.server` and drive it
from a browser console. Run from the repo root:  python3 dev/build_harness.py
"""
import io, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'index.html')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(src), 'preview-demo.html')
s = io.open(src, encoding='utf-8').read()
fake = io.open(os.path.join(root, 'dev', 'fake_rtdb.js'), encoding='utf-8').read()
s = s.replace('<div class="app" id="app"></div>', '<div class="app" id="app"></div>\n<script>'+fake+'</script>', 1)
a = '''function initFirebase(){
  if(!fbConfigured() || !window.firebase) return null;
  try{
    firebase.initializeApp(window.FIREBASE_CONFIG);
    return firebase.database();
  }catch(e){ return null; }
}'''
assert a in s; s = s.replace(a, 'function initFirebase(){ return window.__fakeDb; }', 1)
s = s.replace('function authAvailable(){ return !!(fbDb && window.firebase && firebase.auth); }', 'function authAvailable(){ return true; }', 1)
s = s.replace('    var user = await waitForAuth();', '    var user = window.__testUser || {email:"napat.kijsana@gmail.com", uid:"test"};', 1)
hook = '''window.__dbg = {
  getState: function(){ return state; }, view: view, render: render, boot: boot,
  save: save, touch: touch, flattenState: flattenState, assembleState: assembleState,
  remoteRecs: function(){ return remoteRecs; }, pendingWrites: function(){ return pendingWrites; },
  tripsLoaded: function(){ return tripsLoaded; }, tripsIndex: function(){ return tripsIndex; },
  archiveLoaded: function(){ return archiveLoaded; }, ensureArchive: ensureArchive, ensureTripsMonth: ensureTripsMonth,
  findTaskAll: findTaskAll, setUser: function(u){ currentUser = u; }, uid: uid, isOldDone: isOldDone, isProjectDone: isProjectDone,
  gcalForm: gcalForm, openCalendarExport: openCalendarExport, gcalEventBody: gcalEventBody, gcal: function(){ return gcal; },
  buildIcs: buildIcs, loadGcal: loadGcal, board: board, applyAutoStatuses: applyAutoStatuses,
  applyRestore: applyRestore, downloadBackup: downloadBackup, hoursTotal: hoursTotal, allHourEntries: allHourEntries,
  resetForReboot: function(){ state = null; remoteRecs = {}; pendingWrites = {}; tripsLoaded = {}; tripsIndex = {}; archiveLoaded = false; listenersOn = false; }
};
'''
anchor = 'boot();\n\n})();'
assert s.count(anchor) == 1
s = s.replace(anchor, hook+'window.__boot = boot;\n\n})();', 1)
io.open(out, 'w', encoding='utf-8').write(s)
print("harness written to", out)
