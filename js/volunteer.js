(function () {
  var C = window.CONFIG;
  var $ = function (s) { return document.querySelector(s); };
  var S = { phone: null, st: null, sel: null, busy: false, lastSeen: null };
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  var ICON_PHONE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.2-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 5 5 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3z"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function niceDate(d) { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function dayOneText(start) {
    var d = daysBetween(istDay(), start);
    return 'Day 1 ' + (d === 1 ? 'starts tomorrow' : 'starts on ' + niceDate(start)) + ' 🌸';
  }
  function quote() { return C.QUOTES[Math.floor(Math.random() * C.QUOTES.length)]; }
  function titleFirst(n) { var f = firstName(n).toLowerCase(); return f.charAt(0).toUpperCase() + f.slice(1); }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago';
  }
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2800);
  }
  // "Location changed" needs the new place; it is kept at the start of the remarks
  function withLoc(status, loc, note) {
    if (status !== 'location_changed') return note;
    loc = String(loc || '').trim();
    if (!loc) { toast('📍 Please type the new location'); return null; }
    return '📍 New location: ' + loc + (String(note || '').trim() ? ' · ' + note.trim() : '');
  }
  function telLink(p) { return 'tel:' + (p.length === 10 ? '+91' + p : p); }
  function waLink(c) {
    var p = c.phone.length === 10 ? '91' + c.phone : c.phone;
    var txt = (S.st && S.st.waTemplate || C.WHATSAPP_TEMPLATE)
      .replace(c.programs ? '{programs}' : ' ({programs})', c.programs || '')
      .replace(titleFirst(c.name) ? '{name}' : ' {name}', titleFirst(c.name)).replace('{caller}', titleFirst(S.st.caller.name));
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(txt);
  }

  /* backgrounds */
  var bgI = 0, bgFlip = false;
  function rotateBg() {
    var el = bgFlip ? $('#bgA') : $('#bgB'), other = bgFlip ? $('#bgB') : $('#bgA');
    el.style.backgroundImage = 'url(' + C.BACKGROUNDS[bgI % C.BACKGROUNDS.length] + ')';
    el.classList.add('show'); other.classList.remove('show');
    bgI++; bgFlip = !bgFlip;
  }

  /* login */
  function initLogin() {
    $('#campTitle').textContent = C.CAMPAIGN_TITLE; $('#sectorName').textContent = C.SECTOR;
    $('#loginQuote').textContent = quote();
    if (window.isTest) {
      var tb = document.createElement('div');
      tb.textContent = '🧪 TEST MODE — practice only, nothing is saved to the sheet. Calls go to your own number.';
      tb.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:95;background:#1F8A4C;color:#fff;font:600 12px Poppins,sans-serif;padding:6px 10px;text-align:center';
      document.body.appendChild(tb); document.body.style.paddingTop = tb.offsetHeight + 'px';
    }
    FX.ambient(true);
    var saved = LS.get('ics_phone');
    if (saved) { $('#phoneIn').value = saved; }
    $('#loginBtn').onclick = function () { login(); };
    $('#phoneIn').onkeydown = function (e) { if (e.key === 'Enter') login(); };
    // Phones with little memory reload the page after a call: go straight back in, no need to log in again
    if (saved && normPhone(saved).length === 10) login(true);
  }
  function login(resume) {
    if (!resume) FX.unlockAudio();
    var p = normPhone($('#phoneIn').value);
    $('#loginErr').textContent = '';
    if (p.length !== 10) { $('#loginErr').textContent = 'Please enter your 10-digit mobile number'; return; }
    var b = $('#loginBtn'); b.disabled = true; b.textContent = 'Opening…';
    api('login', { phone: p }).then(function (st) {
      S.phone = p; S.st = st; LS.set('ics_phone', p);
      S.lastSeen = LS.get('ics_lastSeen_' + p) || (st.feed[0] && st.feed[0].ts) || new Date().toISOString();
      if (resume) { $('#login').classList.add('hidden'); enterApp(); } else showWelcome();
    }).catch(function (e) {
      $('#loginErr').textContent = e.message;
    }).then(function () { b.disabled = false; b.textContent = 'Begin my Karma Sadhana 🌸'; });
  }
  function showWelcome() {
    var st = S.st, left = st.today.target - st.today.done;
    $('#wName').textContent = st.caller.name;
    $('#wLine').textContent = st.caller.notStarted ? dayOneText(st.caller.startDate) + ' Get ready!'
      : st.over ? 'Thank you for your Karma Sadhana 🙏'
      : 'Thank you for offering your time to make this happen 🙏';
    $('#wQuote').textContent = quote();
    $('#welcome').classList.remove('hidden');
    $('#login').classList.add('hidden'); FX.shower(35); FX.chime();
    $('#wGo').onclick = enterApp;
  }
  function enterApp() {
    $('#welcome').classList.add('hidden');
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    FX.ambient(false);
    rotateBg(); setInterval(rotateBg, 12000);
    render();
    setInterval(poll, (C.POLL_SECONDS || 25) * 1000);
  }

  /* render */
  function render() {
    var st = S.st, cv = st.caller;
    $('#avatar').textContent = (cv.name || '?').charAt(0).toUpperCase();
    $('#myName').textContent = cv.name;
    var pct = Math.min(1, st.today.done / Math.max(1, st.today.target));
    $('#ringFg').style.strokeDashoffset = 264 * (1 - pct);
    $('#ringNum').textContent = st.today.done + '/' + st.today.target;
    var left = st.today.target - st.today.done;
    $('#progTitle').textContent = cv.notStarted ? dayOneText(cv.startDate)
      : st.over ? 'Karma Sadhana period complete 🙏'
      : left > 0 ? 'Let’s become a mother to ' + left + (left === 1 ? ' person' : ' people') + ' today 🌸'
      : left === 0 ? "Today's target done! 🌸" : 'Extra mile: +' + (-left) + ' ✨';
    var total = C.CAMPAIGN_START_DATE && C.CAMPAIGN_END_DATE ? daysBetween(C.CAMPAIGN_START_DATE, C.CAMPAIGN_END_DATE) + 1 : 0;
    var dayNo = C.CAMPAIGN_START_DATE ? daysBetween(C.CAMPAIGN_START_DATE, istDay()) + 1 : 0;
    $('#progSub').textContent = (!cv.notStarted && dayNo > 0 && total ? 'Day ' + dayNo + ' of ' + total : '') +
      (st.today.dials > st.today.done ? (dayNo > 0 ? ' · ' : '') + st.today.dials + ' dials today' : '');
    $('#daysLeft').textContent = st.caller.daysLeft + (st.caller.daysLeft === 1 ? ' day left' : ' days left');
    var r = st.stats.reached || 0;
    $('#myTotal').textContent = r ? 'You’ve offered this possibility to ' + r + (r === 1 ? ' person' : ' people') + ' 🙏' : 'Your first offering awaits 🙏';
    var pend = st.today.pending || 0, dl = cv.daysLeft || 0, x = dl ? Math.ceil(pend / dl) : 0;
    $('#catchUp').textContent = !pend || cv.notStarted || st.over ? ''
      : 'You have ' + pend + ' pending call' + (pend === 1 ? '' : 's') + ' from earlier days 🌱 ' +
        (pend <= dl ? 'Just 1 extra call a day for ' + pend + (pend === 1 ? ' day' : ' days') + ' will catch you up.'
                    : x + ' extra calls a day for the remaining ' + dl + ' days will catch you up.');
    var intro = C.INTRO_DATE && addDays(C.INTRO_DATE, -1) === istDay()
      ? (st.followUps || []).filter(function (f) { return f.status === 'intro'; }).length : 0;
    $('#introBanner').innerHTML = intro ? '<div class="card" style="text-align:center"><b>🌼 Intro is tomorrow at ' + esc(C.INTRO_TIME || '') +
      '</b><p class="muted">Call your ' + intro + (intro === 1 ? ' person' : ' people') + ' who will join the Intro today and remind them 🙏</p>' +
      '<button class="btn primary" id="introGo">Open Follow-ups</button></div>' : '';
    if (intro) $('#introGo').onclick = function () { document.querySelector('.tabs [data-v="follow"]').click(); };
    renderContact(); renderTicker(); renderFollow();
  }

  function statusButtons(selected, prefix) {
    return Object.keys(STATUS).map(function (k) {
      var s = STATUS[k];
      return '<button class="sbtn ' + (k === 'registered' ? 'registered wide ' : '') + (selected === k ? 'on' : '') + '" data-s="' + k + '">' +
        '<span class="e">' + s.emoji + '</span>' + esc(s.label) + '</button>';
    }).join('');
  }

  function renderContact() {
    var st = S.st, area = $('#contactArea');
    if (st.inHand.length) {
      var c = st.inHand[0];
      var progs = String(c.programs || '').split(',').map(function (s) { return s.trim(); }).filter(String);
      area.innerHTML =
        '<div class="card contact">' +
        '<div class="c-label">' + (st.today.done >= st.today.target ? 'Extra call ✨' : 'Your next call') + '</div>' +
        '<h2 class="c-name">' + esc(c.name) + '</h2>' +
        '<div class="chips">' + progs.map(function (p) { return '<span class="chip">' + esc(p) + '</span>'; }).join('') +
        (c.attempts ? '<span class="chip soft">Try #' + (c.attempts + 1) + '</span>' : '') + '</div>' +
        '<div class="c-phone">' + esc(c.phone.replace(/(\d{5})(\d{5})/, '$1 $2')) + '</div>' +
        (c.phone ? '<div class="act"><a class="btn call" href="' + telLink(c.phone) + '">' + ICON_PHONE + 'Call now</a>' +
        '<a class="btn wa" target="_blank" rel="noopener" href="' + waLink(c) + '">' + ICON_CHAT + 'WhatsApp</a></div>'
          : '<p class="muted">No phone number — email: ' + esc(c.email) + '. Mark “Wrong number” to skip.</p>') +
        (c.notes ? '<p class="muted tiny" style="margin:10px 0 0">📝 ' + esc(c.notes) + '</p>' : '') +
        '<div class="how">After the call, tap what happened 👇</div>' +
        '<div class="status-grid" id="grid">' + statusButtons(S.sel) + '</div>' +
        '<input id="newLoc" class="loc-in' + (S.sel === 'location_changed' ? '' : ' hidden') + '" placeholder="📍 Type the new location (e.g. Whitefield, Pune)" value="' + esc(S.loc || '') + '">' +
        '<details class="note-box"><summary>✏️ Add a note (optional)</summary><textarea id="note" placeholder="e.g. call after 6pm, asked about dates">' + esc(S.note || '') + '</textarea></details>' +
        '<div class="save-row"><button class="btn primary big" id="saveBtn" ' + (S.sel ? '' : 'disabled') + '>Save & next 🌸</button></div>' +
        '</div>';
      $('#grid').onclick = function (e) {
        var b = e.target.closest('.sbtn'); if (!b) return;
        S.sel = b.dataset.s;
        [].forEach.call($('#grid').children, function (x) { x.classList.toggle('on', x === b); });
        $('#newLoc').classList.toggle('hidden', S.sel !== 'location_changed'); if (S.sel === 'location_changed') $('#newLoc').focus();
        $('#saveBtn').disabled = false; FX.buzz(15);
      };
      $('#note').oninput = function () { S.note = this.value; };
      $('#newLoc').oninput = function () { S.loc = this.value; };
      $('#saveBtn').onclick = function () {
        var n = withLoc(S.sel, $('#newLoc').value, $('#note').value); if (n === null) return;
        S.loc = ''; save(c.id, S.sel, n);
      };
      return;
    }
    if (st.caller.notStarted) {
      area.innerHTML = '<div class="card done-card"><img src="img/done.jpg" alt=""><div class="inner"><h2>' + dayOneText(st.caller.startDate) + '</h2>' +
        '<p class="muted">You have ' + st.caller.perDay + (st.caller.perDay === 1 ? ' call' : ' calls') + ' a day for ' + st.caller.daysLeft + ' days. Your contacts will appear here on day one.</p>' +
        '<blockquote class="quote">' + esc(quote()) + '</blockquote></div></div>';
      return;
    }
    var done = st.today.done >= st.today.target;
    var img = st.over ? 'img/done.jpg' : st.poolEmpty ? 'img/extra.jpg' : 'img/done.jpg';
    var title = st.over ? 'Your Karma Sadhana period is complete 🙏'
      : st.poolEmpty ? 'All contacts are being called right now 🌸'
      : done ? "Today's Karma Sadhana is complete 🙏" : 'Resting…';
    var body = st.over ? 'Thank you for every single call. Ask the admin if you would like to continue.'
      : st.poolEmpty ? 'Every name is being called. Please check back later — more may come back for a retry.'
      : 'You met your target. Want to go one more? Everyone will see your extra mile ✨';
    area.innerHTML = '<div class="card done-card"><img src="' + img + '" alt=""><div class="inner"><h2>' + title + '</h2>' +
      '<p class="muted">' + body + '</p><blockquote class="quote">' + esc(quote()) + '</blockquote>' +
      (!st.over && !st.poolEmpty && done ? '<button class="btn primary big" id="extraBtn">Make one extra call ✨</button>' : '') +
      '</div></div>';
    var eb = $('#extraBtn');
    if (eb) eb.onclick = function () {
      eb.disabled = true;
      api('state', { phone: S.phone, extra: true }).then(function (st2) {
        S.st = st2; S.sel = null; render();
        if (!st2.inHand.length) toast('No contacts available right now 🙏');
        else { FX.shower(20); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      }).catch(function (e) { toast(e.message); eb.disabled = false; });
    };
  }

  function numberGone(e) {   // admin changed or removed this number
    if (!/not registered|Caller not found/.test(e && e.message)) return false;
    LS.set('ics_phone', ''); S.st = null;
    $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#phoneIn').value = '';
    $('#loginErr').textContent = 'Your number was updated by the admin. Please log in with your new number 🙏';
    return true;
  }
  function save(id, status, notes, fromList) {
    if (S.busy || !status) return;
    S.busy = true;
    var prevTotal = S.st.stats.total, prevTeam = S.st.team ? S.st.team.dials : 0;
    var card = fromList ? document.querySelector('#fuList li[data-id="' + id + '"]') : $('.contact'); if (card) card.classList.add('loading');
    api('submit', { phone: S.phone, contactId: id, status: status, notes: (notes || '').trim() }).then(function (st) {
      S.st = st;
      if (!fromList) { S.sel = null; S.note = ''; }
      render(); celebrateOwn(st.saved, st.milestone, prevTotal);
      var sm = SECTOR_MILESTONES.filter(function (m) { return prevTeam < m && st.team.dials >= m; }).pop();
      if (sm) setTimeout(function () { celebrate('🎊', 'The calling squad crossed ' + sm + ' calls!', 'And your call took us there. Thank you, everyone 🙏', true); }, 2500);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) { if (numberGone(e)) return; toast('⚠️ ' + e.message, 4000); if (card) card.classList.remove('loading'); })
      .then(function () { S.busy = false; });
  }

  function celebrate(emoji, title, sub, big) {
    $('#celEmoji').textContent = emoji; $('#celTitle').textContent = title; $('#celSub').textContent = sub;
    $('#celebrate').classList.remove('hidden');
    FX.confetti(big ? 4500 : 2500); FX.shower(big ? 70 : 35);
    if (big) FX.clap(2.6); else FX.chime();
    FX.buzz(big ? [80, 50, 80, 50, 160] : [50]);
    $('#celClose').onclick = function () { $('#celebrate').classList.add('hidden'); };
  }
  var MILESTONES = [10, 25, 50, 75, 100];
  var SECTOR_MILESTONES = [100, 250, 500, 750, 1000, 1500, 2000];
  function celebrateOwn(status, milestone, prevTotal) {
    var name = titleFirst(S.st.caller.name), st = S.st.stats;
    if (status === 'registered' && st.regs === 1) return celebrate('🏆', 'Your FIRST registration, ' + name + '!', 'A moment to remember. Someone will experience Inner Engineering because you picked up the phone 🙏', true);
    var hit = MILESTONES.filter(function (m) { return prevTotal < m && st.total >= m; })[0];
    if (hit) return celebrate('🌟', hit + ' calls, ' + name + '!', 'You have made ' + hit + ' calls in this Karma Sadhana. Every one of them was an offering 🙏', hit >= 50);
    if (status === 'registered') return celebrate('👏', 'A Registration! Jai, ' + name + '!', 'Someone is going to experience Inner Engineering because of your call. Everyone is clapping for you.', true);
    if (milestone === 'update' && status !== 'intro') return toast('✅ Updated (not counted as a new call)');
    if (milestone === 'target') return celebrate('🙏', "Today's target complete!", 'Beautiful Karma Sadhana, ' + name + ' 🙏', false);
    if (status === 'intro') return celebrate('🌼', 'Wonderful, ' + name + '!', 'They will join the Intro. Everyone in the squad is celebrating with you 🙏', false);
    if (status === 'interested_later') { FX.shower(25); return toast('🌱 A seed is planted. Thank you!'); }
    if (milestone === 'extra') { FX.shower(30); FX.chime(); return toast('✨ Extra mile! Everyone can see it'); }
    if (status === 'follow_up') { FX.shower(15); return toast('📌 Added to your Follow-ups tab'); }
    if (status === 'no_answer') return toast("📵 No worries — here's your next call");
    toast('🙏 Thank you. Every call counts');
  }

  /* team */
  var FEED_TXT = {
    registered: ['🎉', ' got a <b>registration</b>!'], intro: ['🌼', ' has someone joining the <b>intro</b>'],
    extra: ['✨', ' went the <b>extra mile</b> with one more call'], target: ['🙏', " completed today's <b>target</b>"]
  };
  function renderTicker() {
    var today = istDay(), f = S.st.feed.filter(function (x) { return istDay(x.ts) === today; }).slice(0, 8);   // today's news only
    var items = f.length ? f.map(function (x) {
      return '<span>' + FEED_TXT[x.type][0] + ' ' + esc(x.phone === S.phone ? 'You' : x.who) + FEED_TXT[x.type][1].replace(/<\/?b>/g, '').replace(x.phone === S.phone ? ' has ' : '#', ' have ') + '</span>';
    }) : ['<span>🌸 ' + S.st.team.dials + ' calls made by the calling squad so far</span>'];
    $('#ticker').innerHTML = items.join('');
  }
  /* follow-ups: contacts this caller marked "Follow up" */
  function dayLabel(d) { return Number(d.slice(8, 10)) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(d.slice(5, 7)) - 1]; }
  function introWhen() { return dayLabel(C.INTRO_DATE) + (C.INTRO_TIME ? ', ' + C.INTRO_TIME : ''); }
  var FU_GROUPS = [   // [status, tab label, colour, empty text] — one tab per call result
    ['follow_up', '📌 Follow up', '#2563A8', 'No follow-ups. When someone asks you to call back, mark the call “📌 Follow up”.'],
    ['intro', '🌼 Intro', '#C98A0B', 'Nobody yet. People you mark “🌼 Will join Intro” appear here.'],
    ['interested_later', '🌱 Next time', '#3C8D2F', 'Nobody marked “Interested – next time” yet.'],
    ['no_answer', '📵 No answer', '#7A6E66', 'Nobody here. People who didn’t pick up appear here, in case they call you back.'],
    ['budget', '💰 Budget', '#8A5A12', 'Nobody marked “Budget issue” yet.'],
    ['not_interested', '🙏 Not interested', '#9A4B5B', 'Nobody marked “Not interested” yet.'],
    ['wrong_number', '❌ Wrong no.', '#B8142C', 'Nobody marked “Wrong number” yet.'],
    ['registered', '🎉 Registered', '#1F8A4C', 'No registrations yet — your next call could be the one 🌸'],
    ['completed_ie', '🪷 Completed IE', '#6A4C93', 'Nobody marked “Completed Inner Engineering” yet.'],
    ['shared_wa', '📲 Shared WA', '#128C7E', 'Nobody marked “Shared on WhatsApp” yet.'],
    ['location_changed', '📍 Moved', '#5B6B7A', 'Nobody marked “Location changed” yet.']
  ];
  function fuItem(x, g) {
    var meta = [x.lastCalledAt ? 'last call ' + ago(x.lastCalledAt) : '', x.status === 'no_answer' && x.attempts ? 'tried ' + x.attempts + 'x' : '', x.programs ? esc(x.programs) : '']
      .filter(String).join(' · ');
    return '<li class="fu-card" data-id="' + esc(x.id) + '" style="border-left-color:' + g[2] + '">' +
      '<div class="fu-name">' + esc(x.name) + '</div>' +
      (x.status === 'intro' ? '<div class="fu-tag">🌼 Intro ' + (C.INTRO_DATE && istDay() <= C.INTRO_DATE ? introWhen() + ' · call on ' + dayLabel(addDays(C.INTRO_DATE, -1)) : '· call the day before') + '</div>' : '') +
      '<div class="fu-meta">' + meta + '</div>' +
      (x.notes ? '<div class="fu-meta">📝 ' + esc(x.notes) + '</div>' : '') +
      '<div class="fu-acts"><a class="btn call" href="' + telLink(x.phone) + '">' + ICON_PHONE + 'Call</a>' +
      '<a class="btn wa" target="_blank" rel="noopener" href="' + waLink(x) + '">' + ICON_CHAT + 'WhatsApp</a></div>' +
      '<div class="fu-update"><select><option value="">What happened?</option>' +
      Object.keys(STATUS).map(function (k) { return '<option value="' + k + '">' + STATUS[k].emoji + ' ' + esc(STATUS[k].label) + '</option>'; }).join('') +
      '</select><input class="fu-note" placeholder="Remarks (optional)"><button class="btn primary" data-save="1" disabled>Update</button></div></li>';
  }
  function renderFollow() {
    var f = S.st.followUps || [];
    var open = f.filter(function (x) { return x.status === 'follow_up' || x.status === 'intro'; }).length;   // badge: people waiting for a call back
    $('#fuCount').textContent = open ? ' (' + open + ')' : '';
    if (!S.fuTabPicked) S.fuTab = (FU_GROUPS.filter(function (g) { return f.some(function (x) { return x.status === g[0]; }); })[0] || FU_GROUPS[0])[0];
    $('#fuTabs').innerHTML = FU_GROUPS.map(function (g) {
      var n = f.filter(function (x) { return x.status === g[0]; }).length;
      return '<button data-tab="' + g[0] + '" class="' + (S.fuTab === g[0] ? 'on' : '') + '" style="--c:' + g[2] + '">' + g[1] + ' <b>' + n + '</b></button>';
    }).join('');
    var g = FU_GROUPS.filter(function (x) { return x[0] === S.fuTab; })[0];
    var items = f.filter(function (x) { return x.status === g[0]; });
    $('#fuList').innerHTML = items.length ? items.map(function (x) { return fuItem(x, g); }).join('') : '<li class="empty">' + g[3] + '</li>';
  }
  $('#fuTabs').onclick = function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    S.fuTab = b.dataset.tab; S.fuTabPicked = true; renderFollow();
  };
  $('#fuList').onchange = function (e) {
    var li = e.target.closest('li[data-id]'); if (!li || e.target.tagName !== 'SELECT') return;
    li.querySelector('[data-save]').disabled = !e.target.value;
    li.querySelector('.fu-note').placeholder = e.target.value === 'location_changed' ? '📍 New location (required)' : 'Remarks (optional)';
  };
  $('#fuList').onclick = function (e) {
    var li = e.target.closest('li[data-id]'); if (!li || !e.target.closest('[data-save]')) return;
    var v = li.querySelector('select').value, note = li.querySelector('.fu-note').value; if (!v) return;
    if (v === 'location_changed') { note = withLoc(v, note, ''); if (note === null) return; }
    save(li.dataset.id, v, note, true);
  };
  document.querySelector('.tabs').onclick = function (e) {
    var b = e.target.closest('button'); if (!b) return;
    [].forEach.call(document.querySelectorAll('.tabs button'), function (x) { x.classList.toggle('on', x === b); });
    ['home', 'follow'].forEach(function (v) { $('#v-' + v).classList.toggle('hidden', v !== b.dataset.v); });
    window.scrollTo(0, 0);
  };

  /* live updates from other volunteers */
  function poll() {
    if (document.hidden || !S.st) return;
    api('feed', {}).then(function (d) {
      var before = S.st.team ? S.st.team.dials : 0;
      S.st.feed = d.feed; S.st.team = d.team;
      renderTicker();
      var sm = SECTOR_MILESTONES.filter(function (m) { return before < m && d.team.dials >= m; }).pop();
      if (sm && before > 0) return celebrate('🎊', 'The calling squad crossed ' + sm + ' calls!', 'Together we have offered this possibility ' + sm + ' times. Thank you, everyone 🙏', true);
      var fresh = d.feed.filter(function (f) { return f.ts > S.lastSeen && f.phone !== S.phone; }).reverse();
      if (d.feed[0] && d.feed[0].ts > S.lastSeen) { S.lastSeen = d.feed[0].ts; LS.set('ics_lastSeen_' + S.phone, S.lastSeen); }
      var reg = fresh.filter(function (f) { return f.type === 'registered'; })[0];
      if (reg) return celebrate('👏', reg.who + ' got a registration!', 'Let us all clap for ' + reg.who + ' 🙏 Your next call could be the one.', true);
      var intro = fresh.filter(function (f) { return f.type === 'intro'; })[0];
      if (intro) return celebrate('🌼', intro.who + ' has someone joining the Intro!', 'One more person will taste Inner Engineering 🙏 Your next call could be the one.', false);
      var other = fresh[fresh.length - 1];
      if (other) { var x = FEED_TXT[other.type]; toast(x[0] + ' ' + other.who + x[1].replace(/<\/?b>/g, ''), 3500); FX.shower(15); }
    }).catch(function () {});
  }

  /* misc */
  $('#logoutBtn').onclick = function () { LS.set('ics_phone', null); location.reload(); };
  document.addEventListener('visibilitychange', function () {  // coming back from the dialer: refresh
    if (!document.hidden && S.st && !S.busy) api('state', { phone: S.phone }).then(function (st) { S.st = st; render(); }).catch(numberGone);
  });

  initLogin();
})();
