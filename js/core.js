/* Isha Calling Seva — shared backend logic.
 * The SAME file runs in two places:
 *   1. In the browser (DEMO mode, data kept in this browser's localStorage)
 *   2. In Google Apps Script (copy this file as core.gs) where data lives in the Google Sheet.
 * Keep it plain JavaScript (no import/export, no browser-only APIs).
 */
var STATUS = {
  registered:       { label: 'Registered',             emoji: '🎉', good: true },
  intro:            { label: 'Will join Intro',        emoji: '🌼', good: true },
  interested_later: { label: 'Interested – next time', emoji: '🌱', good: true },
  follow_up:        { label: 'Follow up',              emoji: '📌', good: true },
  budget:           { label: 'Budget issue',           emoji: '💰' },
  not_interested:   { label: 'Not interested',         emoji: '🙏' },
  no_answer:        { label: "Didn't receive",         emoji: '📵' },
  wrong_number:     { label: 'Wrong number',           emoji: '❌' }
};
var TABLES = {
  Contacts: ['id', 'name', 'phone', 'email', 'programs', 'reservedFor', 'assignedTo', 'assignedAt',
             'status', 'attempts', 'lastCalledAt', 'calledBy', 'notes'],
  Callers:  ['phone', 'name', 'perDay', 'endDate', 'active', 'createdAt', 'startDate'],
  Log:      ['ts', 'callerPhone', 'callerName', 'contactId', 'contactName', 'status', 'notes', 'milestone']
};
var MAX_ATTEMPTS = 3;        // "Didn't receive" contacts are retried up to 3 times
var RETRY_GAP_HOURS = 20;    // ...and not before 20 hours have passed

function normPhone(p) {
  var d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  return d;
}
function istDay(iso) {
  var t = iso ? new Date(iso).getTime() : Date.now();
  return new Date(t + 19800000).toISOString().slice(0, 10);
}
function addDays(day, n) {
  var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

function createCore(store) {
  var now = function () { return new Date().toISOString(); };

  function findCaller(phone) {
    phone = normPhone(phone);
    return store.all('Callers').filter(function (c) { return normPhone(c.phone) === phone; })[0];
  }
  function callerView(c) {
    var today = istDay(), start = c.startDate || '';
    var from = start > today ? start : today;
    var left = c.endDate ? daysBetween(from, c.endDate) + 1 : 0;
    return { name: c.name, phone: normPhone(c.phone), perDay: Number(c.perDay) || 2, startDate: start, endDate: c.endDate,
             daysLeft: Math.max(0, left), active: String(c.active) !== 'false', notStarted: !!start && today < start };
  }
  function contactView(x) {
    return { id: x.id, name: x.name, phone: normPhone(x.phone), email: x.email, programs: x.programs,
             attempts: Number(x.attempts) || 0, status: x.status, notes: x.notes, lastCalledAt: x.lastCalledAt };
  }
  function eligible(x, phone) {
    if (x.assignedTo) return false;
    if (x.reservedFor && normPhone(x.reservedFor) !== phone) return false;
    if (!x.status) return true;
    if (x.status !== 'no_answer') return false;
    if ((Number(x.attempts) || 0) >= MAX_ATTEMPTS) return false;
    return !x.lastCalledAt || (Date.now() - new Date(x.lastCalledAt).getTime()) >= RETRY_GAP_HOURS * 3600000;
  }
  function rank(x, phone) {  // lower = picked first
    return (x.reservedFor && normPhone(x.reservedFor) === phone ? 0 : 10) + (x.status ? 5 : 0);
  }

  function teamData(log, callers) {
    var names = {};
    callers.forEach(function (c) { names[normPhone(c.phone)] = c.name; });
    var board = {}, team = { dials: 0, connects: 0, intros: 0, regs: 0 }, today = istDay();
    log.forEach(function (l) {
      var p = normPhone(l.callerPhone);
      var b = board[p] || (board[p] = { phone: p, name: names[p] || l.callerName, dials: 0, today: 0, regs: 0, intros: 0 });
      b.dials++; team.dials++;
      if (istDay(l.ts) === today) b.today++;
      if (l.status !== 'no_answer' && l.status !== 'wrong_number') team.connects++;
      if (l.status === 'registered') { b.regs++; team.regs++; }
      if (l.status === 'intro') { b.intros++; team.intros++; }
    });
    var list = Object.keys(board).map(function (k) {
      var b = board[k]; b.points = b.dials + 3 * b.intros + 10 * b.regs; return b;
    }).sort(function (a, b) { return b.points - a.points; });
    var feed = [];
    for (var i = log.length - 1; i >= 0 && feed.length < 20; i--) {
      var l = log[i];
      var type = l.status === 'registered' ? 'registered' : l.status === 'intro' ? 'intro'
        : l.milestone === 'extra' ? 'extra' : l.milestone === 'target' ? 'target' : null;
      if (type) feed.push({ ts: l.ts, who: firstName(names[normPhone(l.callerPhone)] || l.callerName), phone: normPhone(l.callerPhone), type: type });
    }
    return { board: list, team: team, feed: feed };
  }

  function streakOf(mine, perDay) {
    var byDay = {};
    mine.forEach(function (l) { if (l.status !== 'no_answer') { var d = istDay(l.ts); byDay[d] = (byDay[d] || 0) + 1; } });
    var d = istDay(), s = 0;
    if ((byDay[d] || 0) < perDay) d = addDays(d, -1);
    while ((byDay[d] || 0) >= perDay) { s++; d = addDays(d, -1); }
    return s;
  }

  function state(p) {
    var c = findCaller(p.phone);
    if (!c) throw new Error('This number is not registered as a caller. Please contact the admin.');
    var cv = callerView(c), phone = cv.phone, today = istDay();
    var log = store.all('Log');
    var mine = log.filter(function (l) { return normPhone(l.callerPhone) === phone; });
    var todayMine = mine.filter(function (l) { return istDay(l.ts) === today; });
    var done = todayMine.filter(function (l) { return l.status !== 'no_answer'; }).length;
    var contacts = store.all('Contacts');
    var inHand = contacts.filter(function (x) { return normPhone(x.assignedTo) === phone; });
    var over = !cv.active || cv.daysLeft <= 0, poolEmpty = false;

    if (!inHand.length && !over && !cv.notStarted && (done < cv.perDay || p.extra)) {
      var cands = contacts.filter(function (x) { return eligible(x, phone); });
      cands.sort(function (a, b) { return rank(a, phone) - rank(b, phone) || a._i - b._i; });
      if (cands.length) {
        var pick = cands[0];
        pick.assignedTo = phone; pick.assignedAt = now();
        store.update('Contacts', pick);
        inHand = [pick];
      } else poolEmpty = true;
    }
    var byId = {};
    contacts.forEach(function (x) { byId[x.id] = x; });
    var seen = {}, history = [];
    for (var i = mine.length - 1; i >= 0 && history.length < 40; i--) {
      var l = mine[i];
      if (seen[l.contactId]) continue; seen[l.contactId] = 1;
      var ct = byId[l.contactId] || {};
      history.push({ id: l.contactId, name: l.contactName, phone: normPhone(ct.phone), programs: ct.programs,
                     status: ct.status || l.status, ts: l.ts, notes: ct.notes });
    }
    var td = teamData(log, store.all('Callers'));
    return {
      caller: cv, today: { done: done, dials: todayMine.length, target: cv.perDay },
      inHand: inHand.map(contactView), over: over, poolEmpty: poolEmpty,
      stats: { total: mine.length, regs: mine.filter(function (l) { return l.status === 'registered'; }).length,
               reached: Object.keys(mine.reduce(function (m, l) { if (l.status !== 'no_answer' && l.status !== 'wrong_number') m[l.contactId] = 1; return m; }, {})).length,
               streak: streakOf(mine, cv.perDay) },
      history: history, feed: td.feed, board: td.board, team: td.team,
      followUps: contacts.filter(function (x) { return (x.status === 'follow_up' || x.status === 'intro') && normPhone(x.calledBy) === phone; }).map(contactView)
    };
  }

  function submit(p) {
    var c = findCaller(p.phone);
    if (!c) throw new Error('Caller not found');
    if (!STATUS[p.status]) throw new Error('Unknown status');
    var cv = callerView(c), phone = cv.phone;
    var contact = store.all('Contacts').filter(function (x) { return String(x.id) === String(p.contactId); })[0];
    if (!contact) throw new Error('Contact not found');
    if (normPhone(contact.assignedTo) !== phone && normPhone(contact.calledBy) !== phone)
      throw new Error('This contact is no longer assigned to you');
    var today = istDay();
    var done = store.all('Log').filter(function (l) {
      return normPhone(l.callerPhone) === phone && istDay(l.ts) === today && l.status !== 'no_answer';
    }).length;
    var milestone = '';
    if (p.status !== 'no_answer') {
      if (done + 1 === cv.perDay) milestone = 'target';
      else if (done + 1 > cv.perDay) milestone = 'extra';
    }
    contact.status = p.status;
    contact.attempts = (Number(contact.attempts) || 0) + 1;
    contact.lastCalledAt = now();
    contact.calledBy = phone;
    if (p.notes) contact.notes = (contact.notes ? contact.notes + ' | ' : '') + p.notes;
    contact.assignedTo = '';
    store.update('Contacts', contact);
    store.insert('Log', { ts: now(), callerPhone: phone, callerName: cv.name, contactId: contact.id,
                          contactName: contact.name, status: p.status, notes: p.notes || '', milestone: milestone });
    var s = state({ phone: phone });
    s.milestone = milestone; s.saved = p.status;
    return s;
  }

  function feed() {
    return teamData(store.all('Log'), store.all('Callers'));
  }

  /* ---------------- ADMIN ---------------- */
  function adminData() {
    var contacts = store.all('Contacts'), log = store.all('Log'), callers = store.all('Callers'), today = istDay();
    var counts = { total: contacts.length, fresh: 0, inHand: 0, unreachable: 0, unassigned: 0 };
    Object.keys(STATUS).forEach(function (k) { counts[k] = 0; });
    contacts.forEach(function (x) {
      if (x.assignedTo) counts.inHand++;
      if (!x.status) { if (!x.assignedTo) counts.fresh++; if (!x.assignedTo && !x.reservedFor) counts.unassigned++; }
      else counts[x.status] = (counts[x.status] || 0) + 1;
      if (x.status === 'no_answer' && (Number(x.attempts) || 0) >= MAX_ATTEMPTS) counts.unreachable++;
    });
    var cl = callers.map(function (c) {
      var v = callerView(c), p = v.phone;
      var mine = log.filter(function (l) { return normPhone(l.callerPhone) === p; });
      v.todayDone = mine.filter(function (l) { return istDay(l.ts) === today && l.status !== 'no_answer'; }).length;
      v.todayDials = mine.filter(function (l) { return istDay(l.ts) === today; }).length;
      v.dials = mine.length;
      v.regs = mine.filter(function (l) { return l.status === 'registered'; }).length;
      v.intros = mine.filter(function (l) { return l.status === 'intro'; }).length;
      v.inHand = contacts.filter(function (x) { return normPhone(x.assignedTo) === p; }).length;
      v.reserved = contacts.filter(function (x) { return normPhone(x.reservedFor) === p && !x.status; }).length;
      v.streak = streakOf(mine, v.perDay);
      return v;
    });
    var dailyCapacity = cl.filter(function (v) { return v.active && v.daysLeft > 0; })
      .reduce(function (s, v) { return s + v.perDay; }, 0);
    return {
      counts: counts, callers: cl, dailyCapacity: dailyCapacity, today: today,
      contacts: contacts.map(function (x) {
        return { id: x.id, name: x.name, phone: normPhone(x.phone), email: x.email, programs: x.programs,
                 reservedFor: normPhone(x.reservedFor), assignedTo: normPhone(x.assignedTo), status: x.status,
                 attempts: Number(x.attempts) || 0, lastCalledAt: x.lastCalledAt, calledBy: normPhone(x.calledBy), notes: x.notes };
      }),
      log: log.slice(-150).reverse(),
      daily: dailySummary(log, callers)
    };
  }

  function dailySummary(log, callers) {
    var names = {}, out = {};
    callers.forEach(function (c) { names[normPhone(c.phone)] = firstName(c.name); });
    log.forEach(function (l) {
      var d = istDay(l.ts), o = out[d] || (out[d] = { calls: 0, connects: 0, intros: 0, regs: 0, extra: {}, regBy: {} });
      var who = names[normPhone(l.callerPhone)] || firstName(l.callerName);
      o.calls++;
      if (l.status !== 'no_answer' && l.status !== 'wrong_number') o.connects++;
      if (l.status === 'intro') o.intros++;
      if (l.status === 'registered') { o.regs++; o.regBy[who] = 1; }
      if (l.milestone === 'extra') o.extra[who] = 1;
    });
    Object.keys(out).forEach(function (d) { out[d].extra = Object.keys(out[d].extra); out[d].regBy = Object.keys(out[d].regBy); });
    return out;
  }

  function saveCaller(p) {
    var phone = normPhone(p.phone);
    if (phone.length < 10) throw new Error('Enter a valid 10-digit phone number');
    var existing = findCaller(phone);
    var days = Number(p.days);
    var row = existing || { phone: phone, createdAt: now(), active: 'true' };
    if (p.name) row.name = String(p.name).trim();
    if (!row.name) throw new Error('Name is required');
    if (p.perDay) row.perDay = Number(p.perDay);
    if (!row.perDay) row.perDay = 2;
    if (p.startDate) row.startDate = p.startDate;
    var from = row.startDate && row.startDate > istDay() ? row.startDate : istDay();
    if (p.days !== undefined && p.days !== '' && !isNaN(days)) row.endDate = addDays(from, Math.max(days, 0) - 1);
    if (p.active !== undefined) row.active = String(p.active);
    if (existing) store.update('Callers', row); else store.insert('Callers', row);
    if (row.active === 'false') releaseInHand(phone);
    var cv = callerView(row);
    var reserved = p.skipAssign ? 0 : rebalance(phone, cv.active ? cv.perDay * cv.daysLeft : 0);
    return { ok: true, created: !existing, reserved: reserved };
  }

  /* Top a caller up to `target` uncalled contacts from the remaining master sheet.
     Never takes contacts away (so a caller's own uploaded list stays theirs), except when target is 0
     (caller made inactive) — then all their uncalled contacts go back to the common pool. */
  function rebalance(phone, target) {
    var all = store.all('Contacts');
    var mine = all.filter(function (x) { return normPhone(x.reservedFor) === phone && !x.status && !x.assignedTo; });
    var need = target - mine.length;
    if (need > 0) {
      all.forEach(function (x) { if (need > 0 && !x.status && !x.assignedTo && !x.reservedFor) { x.reservedFor = phone; need--; } });
    } else if (target === 0) {
      mine.forEach(function (x) { x.reservedFor = ''; });
    }
    store.replaceAll('Contacts', all);
    return all.filter(function (x) { return normPhone(x.reservedFor) === phone && !x.status; }).length;
  }

  function releaseInHand(phone) {
    var all = store.all('Contacts'), changed = false;
    all.forEach(function (x) { if (normPhone(x.assignedTo) === phone) { x.assignedTo = ''; changed = true; } });
    if (changed) store.replaceAll('Contacts', all);
  }

  function uploadContacts(p) {
    var all = store.all('Contacts'), byPhone = {}, maxId = 0;
    all.forEach(function (x) {
      byPhone[normPhone(x.phone) || ('E:' + String(x.email).toLowerCase())] = x;
      var n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (n > maxId) maxId = n;
    });
    var reserve = normPhone(p.reservedFor || ''), added = 0, merged = 0, skipped = 0;
    (p.rows || []).forEach(function (r) {
      var ph = normPhone(r.phone), em = String(r.email || '').trim();
      var key = ph || (em ? 'E:' + em.toLowerCase() : '');
      if (!key || !String(r.name || '').trim()) { skipped++; return; }
      var progs = String(r.programs || '').split(/[,;|]/).map(function (s) { return s.trim(); }).filter(String);
      var x = byPhone[key];
      if (x) {
        var have = String(x.programs || '').split(',').map(function (s) { return s.trim(); }).filter(String);
        progs.forEach(function (g) { if (have.indexOf(g) < 0) have.push(g); });
        x.programs = have.join(', ');
        if (!x.email && em) x.email = em;
        if (reserve && !x.status && !x.assignedTo) x.reservedFor = reserve;
        merged++;
      } else {
        x = { id: 'C' + (++maxId), name: String(r.name).trim(), phone: ph, email: em, programs: progs.join(', '),
              reservedFor: reserve, assignedTo: '', assignedAt: '', status: '', attempts: 0, lastCalledAt: '', calledBy: '', notes: '' };
        all.push(x); byPhone[key] = x; added++;
      }
    });
    store.replaceAll('Contacts', all);
    return { added: added, merged: merged, skipped: skipped, total: all.length };
  }

  function assignContacts(p) {  // one-by-one or selected assignment by admin
    var ids = {}, to = normPhone(p.phone || ''), n = 0;
    (p.ids || []).forEach(function (i) { ids[String(i)] = 1; });
    var all = store.all('Contacts');
    all.forEach(function (x) {
      if (!ids[String(x.id)]) return;
      n++;
      if (p.reset) { x.status = ''; x.attempts = 0; }
      x.reservedFor = to;
      if (x.assignedTo && normPhone(x.assignedTo) !== to) x.assignedTo = '';
    });
    store.replaceAll('Contacts', all);
    return { updated: n };
  }

  function assignBulk(p) {  // reserve the next N never-called contacts for one caller
    var to = normPhone(p.phone), want = Number(p.count) || 0, n = 0;
    if (!findCaller(to)) throw new Error('Caller not found');
    var all = store.all('Contacts');
    all.forEach(function (x) {
      if (n < want && !x.status && !x.assignedTo && !x.reservedFor) { x.reservedFor = to; n++; }
    });
    store.replaceAll('Contacts', all);
    return { reserved: n };
  }

  return { state: state, login: state, submit: submit, feed: feed, adminData: adminData, saveCaller: saveCaller,
           uploadContacts: uploadContacts, assignContacts: assignContacts, assignBulk: assignBulk };
}

/* auth = { check(password) -> bool, issue() -> token, verify(token) -> bool } */
function dispatch(core, auth, action, p) {
  var open = { state: 1, login: 1, submit: 1, feed: 1 };
  if (action === 'adminLogin') {
    if (!auth.check(p.password)) throw new Error('Wrong password');
    return { token: auth.issue(), data: core.adminData() };   // data too, so the admin page opens in one trip
  }
  if (open[action]) return core[action](p);
  if (!core[action]) throw new Error('Unknown action ' + action);
  if (!auth.verify(p.token)) throw new Error('AUTH');
  return core[action](p);
}
