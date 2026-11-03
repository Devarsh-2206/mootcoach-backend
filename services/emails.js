/**
 * Pilot emails: welcome, waitlist, "your place is ready", and three
 * follow-ups, sent automatically.
 *
 *   waitlisted  on joining the waitlist
 *   welcome     on getting a place straight away (NALSAR address)
 *   approved    on getting a place after waiting (approved, or a place opened)
 *   reminder    24h after getting a place, if nothing uploaded yet (the place
 *               is released at PILOT_RELEASE_HOURS, so it says until when)
 *   voice       2 days after the first upload, if no voice round yet
 *   feedback    4 days after the first upload, if no feedback form yet
 *
 * At most one follow-up a day per person, and the three follow-ups stop if
 * they unsubscribe. Each email goes once: a per-person log in Firestore
 * (artifacts/moot.coach/emailLog/{uid}) is claimed in a transaction before
 * sending, so two server instances cannot both send it.
 *
 * Only people who joined after emails were first switched on are written to,
 * so turning this on does not mail everyone already in the pilot.
 */
const crypto = require('crypto');

const H = 3600e3;
const FOLLOW_UPS = ['reminder', 'voice', 'feedback'];
const STATUS_MAILS = ['waitlisted', 'welcome', 'approved'];
const MAX_FAILURES = 3;

const appUrl = () => (process.env.APP_URL || 'https://mootcoach.in').replace(/\/$/, '');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// The whole name as given: Google often gives "Surname Firstname", so taking
// the first word can greet someone by their surname.
const firstName = (m) => { const n = String(m.name || '').trim().replace(/\s+/g, ' '); return n && n.split(' ').length <= 4 ? n : 'there'; };
const when = (t) => new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ' IST';

/**
 * Which email (if any) is due for this member now. Pure, so it is tested
 * without Firestore. One at a time: the next tick sends the next one.
 */
function due(m, log, { now, startedAt, releaseHours }) {
  log = log || {};
  const sent = log.sent || {};
  const failed = log.failed || {};
  const ok = (k) => !sent[k] && (failed[k] || 0) < MAX_FAILURES;
  // 10 minutes' grace: the first person to sign in after emails are switched
  // on joins a moment before the start time is recorded.
  if (!m || !m.email || !m.joinedAt || m.joinedAt < startedAt - 10 * 60e3) return null;
  const age = now - m.joinedAt;

  if (m.status === 'waitlist') {
    // Waiting only to confirm a NALSAR address: the confirmation email covers it.
    if (m.reason === 'verify') return null;
    return ok('waitlisted') && !sent.welcome && !sent.approved && age < 48 * H ? 'waitlisted' : null;
  }
  if (m.status !== 'active') return null;

  if (!sent.welcome && !sent.approved) {
    const key = (m.reason === 'approved' || sent.waitlisted) ? 'approved' : 'welcome';
    return ok(key) && age < 48 * H ? key : null;
  }
  if (log.unsubscribed) return null;
  if (log.lastSentAt && now - log.lastSentAt < 20 * H) return null;

  if (!m.firstUseAt) {
    // Looking around without a place: one nudge a day later, within a week.
    if (m.placeTaken === false) return ok('reminder') && age >= 24 * H && age < 7 * 24 * H ? 'reminder' : null;
    const releaseAt = m.joinedAt + releaseHours * H;
    return ok('reminder') && age >= 24 * H && now < releaseAt - 2 * H ? 'reminder' : null;
  }
  const used = now - m.firstUseAt;
  const voiceRounds = (m.usage && m.usage.voiceRounds) || 0;
  if (ok('voice') && voiceRounds === 0 && used >= 48 * H && used < 10 * 24 * H) return 'voice';
  const gaveFeedback = !!(m.feedback && m.feedback.full);
  if (ok('feedback') && !gaveFeedback && used >= 96 * H && used < 14 * 24 * H) return 'feedback';
  return null;
}

// ---- the emails ---------------------------------------------------------

function limitsLine(limits) {
  const l = limits || {};
  const parts = [];
  if (l.uploads) parts.push(`${l.uploads} proposition upload${l.uploads === 1 ? '' : 's'}`);
  if (l.memorials) parts.push(`${l.memorials} memorial draft${l.memorials === 1 ? '' : 's'}`);
  if (l.voiceRounds) parts.push(`${l.voiceRounds} voice round${l.voiceRounds === 1 ? '' : 's'} with the bench`);
  return parts.length ? parts.slice(0, -1).join(', ') + (parts.length > 1 ? ' and ' : '') + parts[parts.length - 1] : '';
}

/** Returns { subject, paragraphs[], button? } for one email. */
/*
 * Written in Devarsh's own voice (he approved these drafts): short, casual,
 * first person, signed "Cheers, Devarsh". Keep it that way; no corporate tone.
 */
function content(key, m, { releaseHours, limits, cap }) {
  const name = firstName(m);
  const greet = name === 'there' ? 'Hi there,' : `Hi ${name},`;
  const url = appUrl();
  const heldUntil = when(m.joinedAt + releaseHours * H);
  const allowance = limitsLine(limits);
  const places = cap || 50;
  const howItWorks = 'Just upload your proposition as a PDF and it\'ll break down the issues, cases and arguments for both sides in a couple of minutes.';
  switch (key) {
    case 'waitlisted': return {
      subject: "You're on the MootCoach waitlist",
      paragraphs: [
        greet,
        m.reason === 'full'
          ? 'Thanks for signing up! All the spots are taken right now, so you\'re on the waitlist. If one opens up, I\'ll mail you.'
          : m.reason === 'closed'
            ? 'Thanks for signing up! The pilot isn\'t taking new people right now, but I\'ll mail you as soon as MootCoach opens up to everyone.'
            : 'Thanks for signing up! The pilot is pretty small right now, so I\'m letting people in a few at a time. You\'re on the list and I\'ll mail you as soon as your spot is ready.',
      ],
    };
    // Signed in, no spot yet: spots go to the first students to upload.
    case 'welcome':
      if (m.placeTaken === false) return {
        subject: 'Welcome to MootCoach',
        paragraphs: [
          greet,
          'Thanks for signing up for MootCoach!',
          `I'm testing it with ${places} students before opening it up to everyone, and the spots go to the first ${places} people who upload a moot proposition.`,
          howItWorks + (allowance ? ` You get ${allowance}.` : ''),
          'If anything feels off or confusing, just reply here. I\'d really like to know.',
        ],
        button: { label: 'Upload a proposition', href: url },
      };
      return {
        subject: 'Welcome to MootCoach',
        paragraphs: [
          greet,
          'Thanks for signing up for MootCoach! Your spot in the pilot is ready.',
          howItWorks + (allowance ? ` You get ${allowance}.` : ''),
          'If anything feels off or confusing, just reply here. I\'d really like to know.',
        ],
        button: { label: 'Open MootCoach', href: url },
      };
    case 'approved': return {
      subject: 'Your MootCoach spot is ready',
      paragraphs: [
        greet,
        'Good news, your spot in the MootCoach pilot is ready!',
        howItWorks,
        'Let me know how it goes, just reply to this mail.',
      ],
      button: { label: 'Open MootCoach', href: url },
    };
    case 'reminder':
      if (m.placeTaken === false) return {
        subject: 'Still want to try MootCoach?',
        paragraphs: [
          greet,
          `Saw you signed up but haven't uploaded a proposition yet. Spots go to the first ${places} who upload, so if you want one, now's a good time.`,
          'If it\'s not the right time, no worries at all.',
        ],
        button: { label: 'Upload a proposition', href: url },
      };
      return {
        subject: 'Still want to try MootCoach?',
        paragraphs: [
          greet,
          `Saw you haven't uploaded a proposition yet. I'm holding your spot till ${heldUntil}, after that it goes to the next person on the waitlist.`,
          'If this week is busy, just reply and let me know, no worries at all.',
        ],
        button: { label: 'Upload a proposition', href: url },
      };
    case 'voice': return {
      subject: 'Have you tried the voice round?',
      paragraphs: [
        greet,
        'Quick one. You haven\'t tried the voice round yet, and honestly it\'s my favourite part. You argue out loud and the judge interrupts you with questions, just like a real oral round. You get a scoresheet at the end.',
        'Go to the Simulator, pick a judge and hit start. Just need a mic and a quiet room.',
      ],
      button: { label: 'Start a voice round', href: url },
    };
    case 'feedback': return {
      subject: "How's MootCoach working for you?",
      paragraphs: [
        greet,
        'You\'ve been using MootCoach for a few days now. Could you tell me how it\'s going? It\'s 10 quick questions, takes about 2 minutes.',
        'Be brutally honest, especially if something was wrong or confusing. That\'s what I need most right now.',
      ],
      button: { label: 'Give feedback', href: url + '/?feedback=1' },
    };
  }
  return null;
}

function render(key, m, cfg, unsubscribeUrl) {
  const c = content(key, m, cfg);
  if (!c) return null;
  const paras = c.paragraphs.filter(Boolean);
  const followUp = FOLLOW_UPS.includes(key);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f4ef">
<div style="max-width:560px;margin:0 auto;padding:28px 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1f1d1a;background:#fffdf9">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr><td style="padding:0 10px 0 0;vertical-align:middle"><img src="https://mootcoach.in/icon-192.png" width="30" height="30" alt="MootCoach" style="display:block;border:0;width:30px;height:30px"></td><td style="vertical-align:middle;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#a23b2c"><b>MootCoach</b></td></tr></table>
${paras.map(p => `<p style="margin:0 0 14px">${esc(p)}</p>`).join('\n')}
${c.button ? `<p style="margin:22px 0"><a href="${esc(c.button.href)}" style="display:inline-block;background:#a23b2c;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px">${esc(c.button.label)}</a></p>` : ''}
<p style="margin:22px 0 0">Cheers,<br>Devarsh<br><span style="color:#6b665e">Founder, MootCoach</span></p>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e8e4dc;font-family:Arial,sans-serif;font-size:12px;color:#8a857c">You are getting this because you signed up for the MootCoach pilot at ${esc(appUrl().replace(/^https?:\/\//, ''))}. Questions? Write to support@mootcoach.in.${followUp && unsubscribeUrl ? ` <a href="${esc(unsubscribeUrl)}" style="color:#8a857c">Stop reminder emails</a>.` : ''}</p>
</div></body></html>`;
  const text = [...paras, c.button ? `${c.button.label}: ${c.button.href}` : '', 'Cheers,\nDevarsh\nFounder, MootCoach', '',
    `Questions? Write to support@mootcoach.in.${followUp && unsubscribeUrl ? `\nStop reminder emails: ${unsubscribeUrl}` : ''}`].filter(s => s !== '').join('\n\n');
  return { subject: c.subject, html, text, followUp };
}

// ---- storage -----------------------------------------------------------

function memoryEmailStore() {
  const logs = new Map(); let meta = null;
  return {
    async getMeta() { return meta; },
    async initMeta(fresh) { if (!meta) meta = fresh; return meta; },
    async getLog(uid) { return logs.get(uid) || null; },
    async listLogs() { return new Map(logs); },
    async update(uid, fn) { const cur = logs.get(uid) || {}; const next = fn(JSON.parse(JSON.stringify(cur))); if (next) logs.set(uid, next); return next; },
  };
}

function firestoreEmailStore(db) {
  const root = db.collection('artifacts').doc('moot.coach');
  const metaRef = root.collection('pilot').doc('emails');
  const col = root.collection('emailLog');
  return {
    async getMeta() { const s = await metaRef.get(); return s.exists ? s.data() : null; },
    initMeta(fresh) {
      return db.runTransaction(async t => {
        const s = await t.get(metaRef);
        if (s.exists) return s.data();
        t.set(metaRef, fresh); return fresh;
      });
    },
    async getLog(uid) { const s = await col.doc(uid).get(); return s.exists ? s.data() : null; },
    async listLogs() { const snap = await col.get(); return new Map(snap.docs.map(d => [d.id, d.data()])); },
    /** fn(current) returns the new log, or null to leave it. Transactional. */
    update(uid, fn) {
      return db.runTransaction(async t => {
        const s = await t.get(col.doc(uid));
        const next = fn(s.exists ? s.data() : {});
        if (next) t.set(col.doc(uid), next);
        return next;
      });
    },
  };
}

// ---- the engine --------------------------------------------------------

function createEmails({ store, mailer, members, pilotConfig, now = () => Date.now() }) {
  let meta = null;
  const stats = { sent: {}, failed: 0, lastError: '', lastTick: 0 };

  async function ensureMeta() {
    if (meta) return meta;
    // startedAt is recorded the first time sending is possible, so people
    // who joined while emails were not set up are not mailed late.
    if (!mailer.configured()) return null;
    meta = await store.initMeta({ startedAt: now(), secret: crypto.randomBytes(24).toString('hex') });
    return meta;
  }

  const token = (uid) => crypto.createHmac('sha256', meta.secret).update(String(uid)).digest('hex').slice(0, 32);
  function unsubscribeUrl(uid) {
    return `${(process.env.PUBLIC_API_URL || 'https://mootcoach-backend-1.onrender.com').replace(/\/$/, '')}/api/email/unsubscribe?u=${encodeURIComponent(uid)}&t=${token(uid)}`;
  }
  async function checkToken(uid, t) {
    meta = meta || await store.getMeta();
    if (!meta || !uid || typeof t !== 'string' || t.length !== 32) return false;
    return crypto.timingSafeEqual(Buffer.from(token(uid)), Buffer.from(t));
  }
  async function unsubscribe(uid) {
    await store.update(uid, cur => ({ ...cur, unsubscribed: now() }));
  }

  /** Send whatever is due for one member. */
  async function process1(m, cfg) {
    const t = now();
    let key = null;
    const STALE = 10 * 60e3;
    const claimed = await store.update(m.uid, cur => {
      if (cur.pending && t - cur.pending.at < STALE) return null;   // another instance is on it
      key = due(m, cur, { now: t, startedAt: meta.startedAt, releaseHours: cfg.releaseHours });
      if (!key) return null;
      return { ...cur, pending: { key, at: t } };
    });
    if (!claimed || !key) return null;
    const mail = render(key, m, cfg, unsubscribeUrl(m.uid));
    const headers = mail.followUp ? { 'List-Unsubscribe': `<${unsubscribeUrl(m.uid)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
    try {
      const r = await mailer.send({ to: m.email, subject: mail.subject, html: mail.html, text: mail.text, headers });
      if (!r.sent) {   // switched off between the check and the send: give the claim back
        await store.update(m.uid, cur => { const n = { ...cur }; delete n.pending; return n; });
        return null;
      }
      await store.update(m.uid, cur => {
        const n = { ...cur, sent: { ...(cur.sent || {}), [key]: t }, email: m.email };
        if (FOLLOW_UPS.includes(key) || STATUS_MAILS.includes(key)) n.lastSentAt = t;
        delete n.pending; return n;
      });
      stats.sent[key] = (stats.sent[key] || 0) + 1;
      console.log(`[EMAIL] sent ${key} to ${m.uid}`);
      return key;
    } catch (e) {
      stats.failed++; stats.lastError = String(e && e.message || e).slice(0, 160);
      console.error(`[EMAIL] ${key} to ${m.uid} failed:`, stats.lastError);
      await store.update(m.uid, cur => {
        const n = { ...cur, failed: { ...(cur.failed || {}), [key]: ((cur.failed || {})[key] || 0) + 1 } };
        delete n.pending; return n;
      }).catch(() => {});
      return null;
    }
  }

  let running = null;
  /** Check everyone (or one uid) and send what is due. */
  function tick(uid) {
    const job = (async () => {
      const cfg = pilotConfig();
      if (cfg.mode === 'off' || !(await ensureMeta())) return [];
      const list = (await members()).filter(m => !uid || m.uid === uid);
      const out = [];
      for (const m of list) { const k = await process1(m, cfg); if (k) out.push({ uid: m.uid, key: k }); }
      if (!uid) stats.lastTick = now();
      return out;
    })();
    // Whole-list ticks do not overlap; single-person kicks run alongside.
    if (!uid) {
      if (running) return running;
      running = job.finally(() => { running = null; });
      return running;
    }
    return job;
  }

  /** For the admin panel. */
  async function status() {
    const logs = await store.listLogs().catch(() => new Map());
    const totals = {}; let unsubscribed = 0;
    for (const l of logs.values()) {
      for (const k of Object.keys(l.sent || {})) totals[k] = (totals[k] || 0) + 1;
      if (l.unsubscribed) unsubscribed++;
    }
    return { configured: mailer.configured(), startedAt: meta ? meta.startedAt : null, totals, unsubscribed,
             failedSinceRestart: stats.failed, lastError: stats.lastError, lastTick: stats.lastTick };
  }

  /** Every email, as it would look, sent to one address (the admin's). */
  async function preview(to, name) {
    const cfg = pilotConfig();
    const t = now();
    const fake = { uid: 'preview', email: to, name: name || 'Devarsh', joinedAt: t, reason: 'approval' };
    meta = meta || await ensureMeta();
    const out = [];
    for (const key of ['waitlisted', 'welcome', 'approved', 'reminder', 'voice', 'feedback']) {
      const mail = render(key, fake, cfg, meta ? unsubscribeUrl('preview') : null);
      const r = await mailer.send({ to, subject: '[Preview] ' + mail.subject, html: mail.html, text: mail.text });
      out.push({ key, sent: r.sent });
    }
    return out;
  }

  return { tick, status, preview, unsubscribe, checkToken, _process: process1 };
}

module.exports = { createEmails, due, render, content, memoryEmailStore, firestoreEmailStore, FOLLOW_UPS };
