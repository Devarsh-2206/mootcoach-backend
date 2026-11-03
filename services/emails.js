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
function content(key, m, { releaseHours, limits, cap }) {
  const name = firstName(m);
  const greet = name === 'there' ? 'Hello,' : `Dear ${name},`;
  const url = appUrl();
  const heldUntil = when(m.joinedAt + releaseHours * H);
  const allowance = limitsLine(limits);
  const howToStart = 'To begin, please sign in and upload your moot proposition as a PDF. MootCoach will read it and set out the issues, the authorities and the arguments on both sides. It takes just a couple of minutes.';
  const askFeedback = 'I would be very grateful to hear what works for you and what does not. You can use the "Give feedback" button in the app, or simply reply to this email.';
  switch (key) {
    case 'waitlisted': return {
      subject: "Thank you for signing up for MootCoach",
      paragraphs: [
        greet,
        m.reason === 'full'
          ? 'Thank you for signing up for the MootCoach pilot. All the places are taken at the moment, so I have added you to the waitlist. If a place opens up, it will be offered to you automatically, and I will let you know by email.'
          : m.reason === 'closed'
            ? 'Thank you for signing up. The MootCoach pilot is not taking new testers at the moment, but I will write to you as soon as MootCoach opens to everyone.'
            : 'Thank you for signing up for the MootCoach pilot. The pilot is small, so I am welcoming students a few at a time. You are on the list, and I will email you as soon as your place is ready.',
        'There is nothing you need to do in the meantime. Thank you for your patience.',
      ],
    };
    // Signed in, but no place yet: places go to the first students to upload.
    case 'welcome':
      if (m.placeTaken === false) return {
        subject: 'Welcome to the MootCoach pilot',
        paragraphs: [
          greet,
          `Thank you for signing up for the MootCoach pilot. ${cap || 50} students are helping me test MootCoach before it opens to everyone, and the places go to the first students who upload a moot proposition.`,
          howToStart + ' Your first upload will secure your place, while places last.',
          allowance ? `With a place, you will have ${allowance}.` : '',
          askFeedback,
        ],
        button: { label: 'Upload a proposition', href: url },
      };
      // falls through
    case 'approved': return {
      subject: key === 'approved' ? 'Your MootCoach place is ready' : 'Welcome to the MootCoach pilot',
      paragraphs: [
        greet,
        key === 'approved'
          ? 'I am pleased to let you know that your place in the MootCoach pilot is ready. Thank you for waiting.'
          : 'Thank you for joining the MootCoach pilot. I am glad to have you as one of the testers.',
        allowance ? `During the pilot, you will have ${allowance}.` : '',
        howToStart,
        `Your place is held for you until ${heldUntil}. Once you have uploaded a proposition, it is yours for the rest of the pilot.`,
        askFeedback,
      ],
      button: { label: 'Open MootCoach', href: url },
    };
    case 'reminder':
      if (m.placeTaken === false) return {
        subject: 'A gentle reminder about the MootCoach pilot',
        paragraphs: [
          greet,
          'Thank you again for signing up for the MootCoach pilot. I noticed you have not uploaded a proposition yet. Places go to the first students who upload, so yours will be secured as soon as you do.',
          howToStart,
          'If now is not a good time, please do not worry, and feel free to ignore this email.',
        ],
        button: { label: 'Upload a proposition', href: url },
      };
      return {
      subject: `Your MootCoach place is held until ${heldUntil}`,
      paragraphs: [
        greet,
        `I hope you are well. Your place in the MootCoach pilot is held for you until ${heldUntil}. If you have not had a chance to upload a proposition by then, the place will go to the next student on the waitlist.`,
        howToStart,
        'If this week is busy, that is completely fine. Just reply to let me know, and I will happily offer the place to someone else for now.',
      ],
      button: { label: 'Upload a proposition', href: url },
    };
    case 'voice': return {
      subject: 'Would you like to try a voice round?',
      paragraphs: [
        greet,
        'Thank you for trying MootCoach. One part you have not tried yet is the voice round: you argue out loud, and the bench questions you as you go, much as judges do in an oral round.',
        'To try it, please open your moot, go to the Simulator, choose a judge and start a voice round. You will need a microphone and a quiet room, and you will receive a scoresheet at the end.',
      ],
      button: { label: 'Start a voice round', href: url },
    };
    case 'feedback': return {
      subject: 'Could you spare two minutes for feedback?',
      paragraphs: [
        greet,
        'Thank you for using MootCoach over the past few days. I would be very grateful if you could tell me how it went. The form has 10 short questions and takes about two minutes.',
        'Honest answers help the most, especially anything that was wrong or confusing. I read every single one. Thank you for your time.',
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
<p style="margin:0 0 22px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#a23b2c"><b>MootCoach</b></p>
${paras.map(p => `<p style="margin:0 0 14px">${esc(p)}</p>`).join('\n')}
${c.button ? `<p style="margin:22px 0"><a href="${esc(c.button.href)}" style="display:inline-block;background:#a23b2c;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px">${esc(c.button.label)}</a></p>` : ''}
<p style="margin:22px 0 0">Warm regards,<br>Devarsh<br><span style="color:#6b665e">Founder, MootCoach</span></p>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e8e4dc;font-family:Arial,sans-serif;font-size:12px;color:#8a857c">You are getting this because you signed up for the MootCoach pilot at ${esc(appUrl().replace(/^https?:\/\//, ''))}. If you have any questions, please write to support@mootcoach.in.${followUp && unsubscribeUrl ? ` <a href="${esc(unsubscribeUrl)}" style="color:#8a857c">Stop reminder emails</a>.` : ''}</p>
</div></body></html>`;
  const text = [...paras, c.button ? `${c.button.label}: ${c.button.href}` : '', 'Warm regards,\nDevarsh\nFounder, MootCoach', '',
    `If you have any questions, please write to support@mootcoach.in.${followUp && unsubscribeUrl ? `\nStop reminder emails: ${unsubscribeUrl}` : ''}`].filter(s => s !== '').join('\n\n');
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
