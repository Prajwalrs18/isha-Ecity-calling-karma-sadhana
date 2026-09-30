/* ===== Isha Calling Seva — settings you can edit ===== */
window.CONFIG = {
  // Paste your Google Apps Script "Web app" URL here (see README).
  // Leave EMPTY to run in DEMO mode: data stays only in this browser (good for testing on localhost).
  API_URL: 'https://script.google.com/macros/s/AKfycbwMfK5pK1FyLMp7rphC4uedL6YXHH-6bevFRhbhxsvpFGNel_G6TFQtn68Y-AD4czwo/exec',

  // Only used in DEMO mode. With the Google Sheet, the password is set in Apps Script (see README).
  DEMO_ADMIN_PASSWORD: 'isha@123',

  CAMPAIGN_TITLE: 'Inner Engineering Calling · Karma Sadhana',
  CAMPAIGN_START_DATE: '2026-10-01', // first calling day — callers get no contacts before this
  CAMPAIGN_END_DATE: '2026-10-26',   // last calling day. Used when "days" is left empty for a caller.
  SECTOR: 'Isha · Electronic City Sector',
  POLL_SECONDS: 25,   // how often the team feed refreshes

  // WhatsApp message. {name} = contact first name, {caller} = volunteer first name, {programs} = programs they did
  WHATSAPP_TEMPLATE:
    'Namaskaram {name} 🙏\n\n' +
    'This is {caller}, a volunteer with Isha Foundation, Electronic City.\n\n' +
    'You have been part of Isha programs ({programs}), so I wanted to personally share that ' +
    'Inner Engineering with Sadhguru is happening soon near you — a beautiful program for inner wellbeing.\n\n' +
    'May I call you for 2 minutes to share the details? 🌸',

  // Quotes shown across the app. Please verify wording against Isha's official sources before going live.
  // Add Sadhguru's volunteering quotes from official Isha material here, one per line.
  QUOTES: [
    'The most beautiful moments in life are moments when you are expressing your joy, not when you are seeking it.',
    'Do not try to fix whatever comes in your life. Fix yourself in such a way that whatever comes, you will be fine.',
    'If you think you are big, you become small. If you know you are nothing, you become unlimited.'
  ],

  // Background photos (in /img). Rotate slowly behind the app.
  BACKGROUNDS: ['img/bg1.jpg', 'img/bg2.jpg', 'img/bg3.jpg', 'img/bg4.jpg', 'img/bg5.jpg', 'img/bg6.jpg', 'img/bg7.jpg', 'img/bg8.jpg']
};
