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
  function telLink(p) { return 'tel:' + (p.length === 10 ? '+91' + p : p); }
  function waLink(c) {
    var p = c.phone.length === 10 ? '91' + c.phone : c.phone;
    var txt = C.WHATSAPP_TEMPLATE
      .replace(c.programs ? '{programs}' : ' ({programs})', c.programs || '')
      .replace('{name}', titleFirst(c.name)).replace('{caller}', titleFirst(S.st.caller.name));
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
      tb.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:95;background:#1F8A4C;color:#fff;font:600 12px Poppins,sans-serif;padding:6px 10px;text-align:center';
      document.body.appendChild(tb);
    }
    FX.ambient(true);
    var saved = LS.get('ics_phone');
    if (saved) { $('#phoneIn').value = saved; }
    $('#loginBtn').onclick = login;
    $('#phoneIn').onkeydown = function (e) { if (e.key === 'Enter') login(); };
  }
  function login() {
    FX.unlockAudio();
    var p = normPhone($('#phoneIn').value);
    $('#loginErr').textContent = '';
    if (p.length !== 10) { $('#loginErr').textContent = 'Please enter your 10-digit mobile number'; return; }
    var b = $('#loginBtn'); b.disabled = true; b.textContent = 'Opening…';
    api('login', { phone: p }).then(function (st) {
      S.phone = p; S.st = st; LS.set('ics_phone', p);
      S.lastSeen = LS.get('ics_lastSeen_' + p) || (st.feed[0] && st.feed[0].ts) || new Date().toISOString();
      showWelcome();
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
    $('#myTotal').textContent = st.stats.total + ' calls · ' + st.stats.regs + ' reg.';
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
        '<details class="note-box"><summary>✏️ Add a note (optional)</summary><textarea id="note" placeholder="e.g. call after 6pm, asked about dates">' + esc(S.note || '') + '</textarea></details>' +
        '<div class="save-row"><button class="btn primary big" id="saveBtn" ' + (S.sel ? '' : 'disabled') + '>Save & next 🌸</button></div>' +
        '</div>';
      $('#grid').onclick = function (e) {
        var b = e.target.closest('.sbtn'); if (!b) return;
        S.sel = b.dataset.s;
        [].forEach.call($('#grid').children, function (x) { x.classList.toggle('on', x === b); });
        $('#saveBtn').disabled = false; FX.buzz(15);
      };
      $('#note').oninput = function () { S.note = this.value; };
      $('#saveBtn').onclick = function () { save(c.id, S.sel, $('#note').value); };
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

  function save(id, status, notes, fromList) {
    if (S.busy || !status) return;
    S.busy = true;
    var card = fromList ? document.querySelector('#fuList li[data-id="' + id + '"]') : $('.contact'); if (card) card.classList.add('loading');
    api('submit', { phone: S.phone, contactId: id, status: status, notes: (notes || '').trim() }).then(function (st) {
      S.st = st;
      if (!fromList) { S.sel = null; S.note = ''; }
      render(); celebrateOwn(st.saved, st.milestone);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (e) { toast('⚠️ ' + e.message, 4000); if (card) card.classList.remove('loading'); })
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
  function celebrateOwn(status, milestone) {
    var name = titleFirst(S.st.caller.name);
    if (status === 'registered') return celebrate('👏', 'A Registration! Jai, ' + name + '!', 'Someone is going to experience Inner Engineering because of your call. Everyone is clapping for you.', true);
    if (milestone === 'target') return celebrate('🙏', "Today's target complete!", 'Beautiful Karma Sadhana, ' + name + ' 🙏', false);
    if (status === 'intro') { FX.shower(45); FX.chime(); return toast('🌼 Wonderful! They will join the intro'); }
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
    var f = S.st.feed.slice(0, 8);
    var items = f.length ? f.map(function (x) {
      return '<span>' + FEED_TXT[x.type][0] + ' ' + esc(x.phone === S.phone ? 'You' : x.who) + FEED_TXT[x.type][1].replace(/<\/?b>/g, '').replace(x.phone === S.phone ? ' has ' : '#', ' have ') + '</span>';
    }) : ['<span>🌸 ' + S.st.team.dials + ' calls made by the calling squad so far</span>'];
    $('#ticker').innerHTML = items.join('');
  }
  /* follow-ups: contacts this caller marked "Follow up" */
  function renderFollow() {
    var f = S.st.followUps || [];
    $('#fuCount').textContent = f.length ? ' (' + f.length + ')' : '';
    $('#fuList').innerHTML = f.length ? f.map(function (x) {
      return '<li data-id="' + esc(x.id) + '"><div class="hrow"><div><div class="hn">' + esc(x.name) + '</div>' +
        '<time>' + (x.lastCalledAt ? 'last call ' + ago(x.lastCalledAt) : '') + (x.programs ? ' · ' + esc(x.programs) : '') + '</time></div></div>' +
        (x.notes ? '<p class="muted tiny" style="margin:6px 0 0">📝 ' + esc(x.notes) + '</p>' : '') +
        '<div class="hact"><a class="btn call" href="' + telLink(x.phone) + '">' + ICON_PHONE + 'Call</a>' +
        '<a class="btn wa" target="_blank" rel="noopener" href="' + waLink(x) + '">' + ICON_CHAT + 'WhatsApp</a>' +
        '<button class="btn ghost" data-up="1">Update</button></div>' +
        '<div class="fu-edit hidden"><div class="status-grid">' + statusButtons(null) + '</div>' +
        '<textarea placeholder="Note (optional)"></textarea><button class="btn primary big" data-save="1" disabled>Save</button></div></li>';
    }).join('') : '<li class="empty">No follow-ups yet. When someone asks you to call back, mark the call “📌 Follow up” and they will appear here.</li>';
  }
  $('#fuList').onclick = function (e) {
    var li = e.target.closest('li[data-id]'); if (!li) return;
    if (e.target.closest('[data-up]')) { li.querySelector('.fu-edit').classList.toggle('hidden'); return; }
    var sb = e.target.closest('.sbtn');
    if (sb) {
      [].forEach.call(li.querySelectorAll('.sbtn'), function (x) { x.classList.toggle('on', x === sb); });
      li.dataset.sel = sb.dataset.s; li.querySelector('[data-save]').disabled = false; return;
    }
    if (e.target.closest('[data-save]')) save(li.dataset.id, li.dataset.sel, li.querySelector('textarea').value, true);
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
      S.st.feed = d.feed; S.st.team = d.team;
      renderTicker();
      var fresh = d.feed.filter(function (f) { return f.ts > S.lastSeen && f.phone !== S.phone; }).reverse();
      if (d.feed[0] && d.feed[0].ts > S.lastSeen) { S.lastSeen = d.feed[0].ts; LS.set('ics_lastSeen_' + S.phone, S.lastSeen); }
      var reg = fresh.filter(function (f) { return f.type === 'registered'; })[0];
      if (reg) return celebrate('👏', reg.who + ' got a registration!', 'Let us all clap for ' + reg.who + ' 🙏 Your next call could be the one.', true);
      var other = fresh[fresh.length - 1];
      if (other) { var x = FEED_TXT[other.type]; toast(x[0] + ' ' + other.who + x[1].replace(/<\/?b>/g, ''), 3500); FX.shower(15); }
    }).catch(function () {});
  }

  /* misc */
  $('#logoutBtn').onclick = function () { LS.set('ics_phone', null); location.reload(); };
  document.addEventListener('visibilitychange', function () {  // coming back from the dialer: refresh
    if (!document.hidden && S.st && !S.busy) api('state', { phone: S.phone }).then(function (st) { S.st = st; render(); }).catch(function () {});
  });

  initLogin();
})();
