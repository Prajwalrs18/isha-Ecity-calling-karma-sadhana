/* Talks to the Google Apps Script backend, or runs the same logic locally in DEMO mode. */
(function () {
  // TEST MODE: open the site with ?test=1 — practice calls stay in this phone only, never touch the Google Sheet
  window.isTest = /[?&]test(=|&|$)/.test(location.search);
  var PFX = window.isTest ? 'icst_' : 'ics_';
  if (window.isTest) window.CONFIG.CAMPAIGN_START_DATE = istDay();
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var DemoStore = {
    all: function (t) {
      var rows = [];
      try { rows = JSON.parse(LS.get(PFX + t) || '[]'); } catch (e) {}
      return rows.map(function (o, i) { o._i = i; return o; });
    },
    save: function (t, rows) {
      LS.set(PFX + t, JSON.stringify(rows.map(function (o) { var c = Object.assign({}, o); delete c._i; return c; })));
    },
    update: function (t, o) { var r = this.all(t); r[o._i] = o; this.save(t, r); },
    insert: function (t, o) { var r = this.all(t); r.push(o); this.save(t, r); },
    replaceAll: function (t, rows) { this.save(t, rows); }
  };
  var DemoAuth = {
    check: function (pw) { return pw === window.CONFIG.DEMO_ADMIN_PASSWORD; },
    issue: function () { var t = 'demo-' + Math.random().toString(36).slice(2); LS.set('ics_admtok', t); return t; },
    verify: function (t) { return !!t && t === LS.get('ics_admtok'); }
  };
  function seedDemo() {
    // remove the old sample callers (9999900001 / 9999900002) from earlier test versions
    var callers = DemoStore.all('Callers');
    var real = callers.filter(function (c) { return String(c.phone).indexOf('99999000') !== 0; });
    if (real.length !== callers.length) {
      DemoStore.save('Callers', real);
      var cs = DemoStore.all('Contacts');
      cs.forEach(function (x) {
        if (String(x.reservedFor).indexOf('99999000') === 0) x.reservedFor = '';
        if (String(x.assignedTo).indexOf('99999000') === 0) x.assignedTo = '';
      });
      DemoStore.save('Contacts', cs);
    }
    // Load the master sheet (data/master-contacts.js) the first time
    if (!DemoStore.all('Contacts').length && window.MASTER_CONTACTS)
      createCore(DemoStore).uploadContacts({ rows: window.MASTER_CONTACTS });
  }

  // test mode: the first login creates a practice caller with 8 practice contacts whose number is YOUR number
  function seedTest(phone) {
    phone = normPhone(phone);
    if (phone.length !== 10 || DemoStore.all('Callers').some(function (c) { return normPhone(c.phone) === phone; })) return;
    createCore(DemoStore).saveCaller({ name: 'Test Volunteer', phone: phone, perDay: 3, days: 3, startDate: istDay(), skipAssign: true });
    var rows = [];
    for (var i = 1; i <= 8; i++) rows.push({ id: 'T' + i, name: 'Practice Seeker ' + i, phone: phone, email: '', programs: i % 2 ? 'Shivanga' : 'FMF',
      reservedFor: phone, assignedTo: '', assignedAt: '', status: '', attempts: 0, lastCalledAt: '', calledBy: '', notes: '' });
    DemoStore.replaceAll('Contacts', rows);
  }

  window.isDemo = !window.CONFIG.API_URL || window.isTest;
  // Live mode: wipe any test data left in this browser from demo mode
  if (!window.isDemo) ['ics_Contacts', 'ics_Callers', 'ics_Log', 'ics_admtok', 'ics_seeded'].forEach(function (k) {
    try { localStorage.removeItem(k); } catch (e) {}
  });
  // Wake Google's script up as soon as the page opens, so it is ready by the time the number/password is typed
  if (!window.isDemo) try { fetch(window.CONFIG.API_URL, { mode: 'no-cors' }); } catch (e) {}
  window.api = function (action, payload) {
    payload = payload || {};
    if (window.isDemo) {
      if (window.isTest) { if (payload.phone) seedTest(payload.phone); } else seedDemo();
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(dispatch(createCore(DemoStore), DemoAuth, action, payload)); }
          catch (e) { reject(e); }
        }, 150);
      });
    }
    var body = JSON.stringify(Object.assign({ action: action, reqId: Date.now().toString(36) + Math.random().toString(36).slice(2) }, payload));
    // Google sometimes answers with an error page or drops the connection: retry a few times (same reqId, so a save is never done twice)
    function attempt(n) {
      return fetch(window.CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
        .then(function (r) { return r.text(); })
        .then(function (t) {
          var res; try { res = JSON.parse(t); } catch (e) { var er = new Error('bad'); er.retry = true; throw er; }
          if (!res.ok) throw new Error(res.error || 'Server error');
          return res.data;
        })
        .catch(function (e) {
          var transient = e.retry || e instanceof TypeError;
          if (transient && n < 4) return new Promise(function (ok) { setTimeout(ok, 700 * n); }).then(function () { return attempt(n + 1); });
          if (transient) throw new Error('The connection is slow right now. Please tap again 🙏');
          throw e;
        });
    }
    return attempt(1);
  };
})();
