/* Hellcat Drive — online play over Firebase (Realtime Database + anonymous sign-in).
   Rooms live at /rooms/<CODE>: meta { host, map, car, t, r } (the host's map and car are everyone's; r: when the round
   started), players/<uid> { the car, its paint,
   the name - written when you join or change car }, states/<uid> [ the car's pose and what it's doing, ~10 times a
   second ]. Every browser runs its own car's physics and publishes it; the others are drawn from those states. The
   Firebase SDK only loads when you go online, so the single-player game never touches the network.
   UMD: window.HCNet in the browser. */
(function (root) {
  'use strict';

  const CONFIG = {
    apiKey: 'AIzaSyAvn8_zZts8vdKvu2xzxJ-EI1yJkREm8to',
    authDomain: 'hellcat-drive.firebaseapp.com',
    databaseURL: 'https://hellcat-drive-default-rtdb.firebaseio.com',
    projectId: 'hellcat-drive',
    storageBucket: 'hellcat-drive.firebasestorage.app',
    messagingSenderId: '1063614925687',
    appId: '1:1063614925687:web:ab392994db15d06ca86f72',
  };
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // (no I / O / 0 / 1: codes get read out loud)

  function create(cb) {
    cb = cb || {};
    let A = null, D = null, auth = null, db = null, uid = null, offset = 0, code = null, meta = null, host = false;
    const unsub = [];
    const status = (m) => { if (cb.onStatus) cb.onStatus(m); };

    // load the SDK and sign in (anonymously - a guest account kept by the browser, so a reload is the same player)
    async function connect() {
      if (db) return uid;
      status('Connecting…');
      const [appM, authM, dbM] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-database.js')]);
      A = authM; D = dbM;
      const app = appM.getApps().length ? appM.getApp() : appM.initializeApp(CONFIG);
      // (the guest session is kept per browser tab - reloads keep it, and two tabs are two players)
      try { auth = A.initializeAuth(app, { persistence: A.browserSessionPersistence }); } catch (e) { auth = A.getAuth(app); }
      // (wait for a saved guest session to come back before making a new one)
      if (auth.authStateReady) await auth.authStateReady();
      else await new Promise((res) => { let off = null, done = false; off = A.onAuthStateChanged(auth, () => { done = true; if (off) off(); res(); }); if (done) off(); });
      uid = auth.currentUser ? auth.currentUser.uid : (await A.signInAnonymously(auth)).user.uid;
      db = D.getDatabase(app);
      D.onValue(D.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
      status('Online');
      return uid;
    }
    const r = (p) => D.ref(db, p);
    // (the database refuses undefined and NaN anywhere in a write)
    const clean = (x) => JSON.parse(JSON.stringify(x));

    function makeCode() { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }

    // host: a fresh room on your map
    async function hostRoom(map, profile) {
      await connect();
      let c = null;
      for (let k = 0; k < 6 && !c; k++) { const t = makeCode(); if (!(await D.get(r('rooms/' + t + '/meta'))).exists()) c = t; }
      if (!c) throw new Error('could not find a free room code');
      await D.set(r('rooms/' + c + '/meta'), { host: uid, map, t: D.serverTimestamp() });
      return joinRoom(c, profile);
    }

    // join (or rejoin after a reload): listen to the room's players and states, leave cleanly if the tab goes
    async function joinRoom(c, profile) {
      await connect();
      c = String(c || '').trim().toUpperCase();
      const m = await D.get(r('rooms/' + c + '/meta'));
      if (!m.exists()) throw new Error('No room called ' + c);
      if (code) await leaveRoom(true);
      code = c; meta = m.val(); host = meta.host === uid;
      const base = 'rooms/' + c;
      await D.onDisconnect(r(base + '/players/' + uid)).remove();
      await D.onDisconnect(r(base + '/states/' + uid)).remove();
      await D.set(r(base + '/players/' + uid), Object.assign(clean(profile), { j: D.serverTimestamp() }));
      unsub.push(D.onValue(r(base + '/meta'), (s) => {
        if (!s.exists()) { if (cb.onRoomGone) cb.onRoomGone(); return; }
        meta = s.val(); host = meta.host === uid; if (cb.onMeta) cb.onMeta(meta);
      }));
      const P = r(base + '/players'), S = r(base + '/states');
      unsub.push(D.onChildAdded(P, (s) => { if (s.key !== uid && cb.onPlayer) cb.onPlayer(s.key, s.val()); }));
      unsub.push(D.onChildChanged(P, (s) => { if (s.key !== uid && cb.onPlayer) cb.onPlayer(s.key, s.val()); }));
      unsub.push(D.onChildRemoved(P, (s) => { if (s.key !== uid && cb.onLeave) cb.onLeave(s.key); }));
      unsub.push(D.onChildAdded(S, (s) => { if (s.key !== uid && cb.onState) cb.onState(s.key, s.val()); }));
      unsub.push(D.onChildChanged(S, (s) => { if (s.key !== uid && cb.onState) cb.onState(s.key, s.val()); }));
      status('In room ' + c);
      return meta;
    }

    async function leaveRoom(quiet) {
      if (!code) return;
      const base = 'rooms/' + code;
      while (unsub.length) { try { unsub.pop()(); } catch (e) { /* already gone */ } }
      try {
        await D.remove(r(base + '/players/' + uid)); await D.remove(r(base + '/states/' + uid));
        await D.onDisconnect(r(base + '/players/' + uid)).cancel(); await D.onDisconnect(r(base + '/states/' + uid)).cancel();
        // (the last one out takes the room with them)
        if (host) { const p = await D.get(r(base + '/players')); if (!p.exists()) await D.remove(r(base + '/meta')); }
      } catch (e) { /* offline: onDisconnect cleans up */ }
      code = null; meta = null; host = false;
      if (!quiet) status('Online');
    }

    return {
      connect, hostRoom, joinRoom, leaveRoom,
      // (throttled by the game: ~10 a second)
      publish(state) { if (code) D.set(r('rooms/' + code + '/states/' + uid), state.map((v) => (Number.isFinite(v) ? v : 0))).catch(() => {}); },
      setProfile(profile) { if (code) D.update(r('rooms/' + code + '/players/' + uid), clean(profile)).catch(() => {}); },
      setMap(map) { if (code && host) D.update(r('rooms/' + code + '/meta'), { map }).catch(() => {}); },
      // (the host's car and its setup: everyone drives it)
      setCar(car) { if (code && host) D.update(r('rooms/' + code + '/meta'), { car: clean(car) }).catch(() => {}); },
      // (a new round: everyone's points back to 0, everyone on the start line)
      newRound() { if (code && host) D.update(r('rooms/' + code + '/meta'), { r: D.serverTimestamp() }).catch(() => {}); },
      serverNow() { return Date.now() + offset; },
      get uid() { return uid; }, get code() { return code; }, get meta() { return meta; }, get isHost() { return host; },
    };
  }

  root.HCNet = { create };
})(typeof self !== 'undefined' ? self : this);
