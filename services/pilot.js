/**
 * The closed pilot: who may use the AI features while MootCoach is tested.
 *
 * The free credits pay for a fixed number of testers, so the site cannot be
 * open to whoever finds it. The rules:
 *
 *   - A verified Google account on an automatic domain (nalsar.ac.in) gets a
 *     place on first sign-in, while places remain.
 *   - Everyone else goes on the waitlist, and an admin approves them by hand.
 *   - There are PILOT_CAP places in all. A place nobody has used within
 *     PILOT_RELEASE_HOURS of joining is released for someone else.
 *   - Admins (PILOT_ADMINS) are never counted and never limited.
 *
 *   PILOT_MODE=off     everyone signed in may use the AI (the default, so a
 *                      deploy changes nothing until it is switched on)
 *   PILOT_MODE=on      the rules above
 *   PILOT_MODE=closed  the pilot is over: only admins; new sign-ups are
 *                      recorded for the launch list
 *
 * Statuses: active, waitlist, released. "closed" and "admin" are reported
 * but never stored.
 *
 * The rules are written against a small storage interface so they can be
 * tested without Firestore (tools/evals/pilot.test.js).
 */

const HOUR = 3600e3;

function readConfig(env = process.env) {
  const list = v => String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const mode = ['on', 'closed'].includes(String(env.PILOT_MODE || '').toLowerCase()) ? env.PILOT_MODE.toLowerCase() : 'off';
  return {
    mode,
    cap: Math.max(0, Number(env.PILOT_CAP || 50)),
    autoDomains: list(env.PILOT_AUTO_DOMAINS || 'nalsar.ac.in'),
    admins: list(env.PILOT_ADMINS),
    releaseHours: Math.max(1, Number(env.PILOT_RELEASE_HOURS || 72)),
    limits: parseLimits(env.PILOT_LIMITS),
    voiceMinutes: Math.max(1, Number(env.PILOT_VOICE_MINUTES || 15)),
  };
}

/**
 * What each tester may use over the whole pilot, sized so 50 testers at their
 * maximum stay inside the credits. Override any of them with
 * PILOT_LIMITS="uploads=2,memorials=2,...".
 *
 *   uploads          proposition analyses (/analyze)
 *   memorials        full memorial drafts
 *   memorialReviews  memorials marked by Memorial Review
 *   voiceRounds      voice bench rounds (each capped at voiceMinutes)
 *   judgeTurns       text bench turns, about five rounds
 *   extras           everything smaller: authority cards, forecasts,
 *                    briefings, oral evaluation, citation checks, plans
 */
const DEFAULT_LIMITS = { uploads: 2, memorials: 2, memorialReviews: 2, voiceRounds: 3, judgeTurns: 60, extras: 40 };
function parseLimits(spec) {
  const out = { ...DEFAULT_LIMITS };
  String(spec || '').split(',').forEach(pair => {
    const [k, v] = pair.split('=').map(x => (x || '').trim());
    if (k in out && v !== '' && Number.isFinite(Number(v))) out[k] = Math.max(0, Number(v));
  });
  return out;
}

function domainOf(email) {
  const at = String(email || '').toLowerCase().lastIndexOf('@');
  return at < 0 ? '' : String(email).toLowerCase().slice(at + 1);
}

/**
 * @param {object} store  { transact(fn), listMembers(status?) } — see memoryStore
 * @param {object} [opts] { config, now }
 */
function createPilot(store, opts = {}) {
  const config = () => opts.config || readConfig();
  const now = () => (opts.now ? opts.now() : Date.now());
  // Verified only: an email/password sign-up cannot claim an admin's address.
  const isAdmin = (user) => !!(user && user.email && user.emailVerified === true
    && config().admins.includes(String(user.email).toLowerCase()));

  /**
   * Where this user stands, creating their entry on first sight.
   * Returns { status, reason?, cap, active }.
   */
  async function join(user) {
    const c = config();
    if (c.mode === 'off') return { status: 'active', mode: 'off' };
    if (isAdmin(user)) return { status: 'admin', mode: c.mode };
    if (!user || !user.uid) return { status: 'waitlist', reason: 'signin', mode: c.mode };

    const auto = !!user.emailVerified && c.autoDomains.includes(domainOf(user.email));
    // Room is made first, outside the join transaction, so a stale place is
    // freed before a new student is told the pilot is full.
    if (c.mode === 'on' && auto) await releaseIdle();

    return store.transact(async (tx) => {
      const state = (await tx.getState()) || { active: 0 };
      let m = await tx.getMember(user.uid);
      if (!m) {
        m = { uid: user.uid, email: user.email || '', name: user.name || '', joinedAt: now(), firstUseAt: null };
        if (c.mode === 'closed') { m.status = 'waitlist'; m.reason = 'closed'; }
        else if (auto && state.active < c.cap) { m.status = 'active'; m.reason = 'auto'; state.active += 1; tx.putState(state); }
        else { m.status = 'waitlist'; m.reason = auto ? 'full' : 'approval'; }
        tx.putMember(m);
      } else if (c.mode === 'on' && auto && state.active < c.cap
                 && ((m.status === 'waitlist' && m.reason === 'full') || (m.status === 'released' && m.reason === 'idle'))) {
        // A NALSAR student who arrived while the pilot was full, or whose
        // unused place lapsed, gets in on their own once there is room.
        m.status = 'active'; m.reason = 'auto'; m.joinedAt = now(); m.firstUseAt = null;
        state.active += 1;
        tx.putMember(m); tx.putState(state);
      }
      if (c.mode === 'closed' && m.status !== 'admin') return { status: 'closed', mode: c.mode, cap: c.cap, active: state.active };
      return { status: m.status, reason: m.reason, mode: c.mode, cap: c.cap, active: state.active,
               usage: { ...(m.usage || {}) }, limits: c.limits, voiceMinutes: c.voiceMinutes };
    });
  }

  /** May this user call the AI? Cheap enough for every request (cached by the caller). */
  async function allowed(user) {
    const s = await join(user);
    return s.status === 'active' || s.status === 'admin';
  }

  /** First real use: stops the place from being released as idle. */
  async function markUsed(user) {
    const c = config();
    if (c.mode === 'off' || !user || !user.uid || isAdmin(user)) return;
    await store.transact(async (tx) => {
      const m = await tx.getMember(user.uid);
      if (m && m.status === 'active' && !m.firstUseAt) { m.firstUseAt = now(); tx.putMember(m); }
    });
  }

  /** Is this bucket used up? Admins and the off mode have no limits. */
  const unlimited = (user) => config().mode === 'off' || isAdmin(user);
  function remaining(status, bucket) {
    const lim = (status.limits || config().limits)[bucket];
    if (lim == null) return Infinity;
    return Math.max(0, lim - ((status.usage || {})[bucket] || 0));
  }

  /** Count one use after it succeeded. */
  async function count(user, bucket) {
    if (unlimited(user) || !user || !user.uid) return;
    await store.transact(async (tx) => {
      const m = await tx.getMember(user.uid);
      if (!m || m.status !== 'active') return;
      m.usage = { ...(m.usage || {}), [bucket]: ((m.usage || {})[bucket] || 0) + 1 };
      tx.putMember(m);
    });
  }

  /** Check and count in one step, for things paid for up front (a voice round). */
  async function consume(user, bucket) {
    if (unlimited(user)) return { ok: true };
    const c = config();
    return store.transact(async (tx) => {
      const m = await tx.getMember(user.uid);
      if (!m || m.status !== 'active') return { ok: false, used: 0, limit: c.limits[bucket] };
      const used = (m.usage || {})[bucket] || 0;
      if (used >= c.limits[bucket]) return { ok: false, used, limit: c.limits[bucket] };
      m.usage = { ...(m.usage || {}), [bucket]: used + 1 };
      tx.putMember(m);
      return { ok: true, used: used + 1, limit: c.limits[bucket] };
    });
  }

  /** Free places held by testers who never used them. Returns how many. */
  async function releaseIdle() {
    const c = config();
    const cutoff = now() - c.releaseHours * HOUR;
    const idle = (await store.listMembers('active')).filter(m => !m.firstUseAt && m.joinedAt < cutoff);
    let n = 0;
    for (const m of idle) {
      await store.transact(async (tx) => {
        const cur = await tx.getMember(m.uid);
        if (!cur || cur.status !== 'active' || cur.firstUseAt) return;
        const state = (await tx.getState()) || { active: 0 };
        cur.status = 'released'; cur.reason = 'idle'; cur.releasedAt = now();
        state.active = Math.max(0, state.active - 1);
        tx.putMember(cur); tx.putState(state);
        n++;
      });
    }
    return n;
  }

  /** Admin: approve (waitlist/released → active) or release (active → released). */
  async function setStatus(uid, action) {
    const c = config();
    return store.transact(async (tx) => {
      const m = await tx.getMember(uid);
      if (!m) return { ok: false, error: 'No such tester.' };
      const state = (await tx.getState()) || { active: 0 };
      if (action === 'approve') {
        if (m.status === 'active') return { ok: true, member: m };
        if (state.active >= c.cap) return { ok: false, error: `All ${c.cap} places are taken. Release one first.` };
        m.status = 'active'; m.reason = 'approved'; m.approvedAt = now(); m.joinedAt = now(); m.firstUseAt = m.firstUseAt || null;
        state.active += 1;
      } else if (action === 'release') {
        if (m.status !== 'active') return { ok: true, member: m };
        m.status = 'released'; m.reason = 'admin'; m.releasedAt = now();
        state.active = Math.max(0, state.active - 1);
      } else {
        return { ok: false, error: 'Unknown action.' };
      }
      tx.putMember(m); tx.putState(state);
      return { ok: true, member: m };
    });
  }

  async function overview() {
    const c = config();
    await releaseIdle().catch(() => 0);
    const members = await store.listMembers();
    const count = s => members.filter(m => m.status === s).length;
    return {
      mode: c.mode, cap: c.cap, releaseHours: c.releaseHours, autoDomains: c.autoDomains, limits: c.limits,
      counts: { active: count('active'), waitlist: count('waitlist'), released: count('released'),
                used: members.filter(m => m.status === 'active' && m.firstUseAt).length },
      members: members.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0)),
    };
  }

  return { join, allowed, markUsed, releaseIdle, setStatus, overview, isAdmin, config, count, consume, remaining, unlimited };
}

/* ───────────────────────── storage ───────────────────────── */

/** In-memory store with the same shape as the Firestore one. Tests and local dev. */
function memoryStore() {
  const members = new Map();
  let state = null;
  let chain = Promise.resolve();
  return {
    transact(fn) {
      // Serialised, like a transaction that always wins.
      const run = chain.then(async () => {
        const writes = [];
        const tx = {
          getMember: async uid => (members.has(uid) ? { ...members.get(uid) } : null),
          getState: async () => (state ? { ...state } : null),
          putMember: m => writes.push(() => members.set(m.uid, { ...m })),
          putState: s => writes.push(() => { state = { ...s }; }),
        };
        const out = await fn(tx);
        writes.forEach(w => w());
        return out;
      });
      chain = run.catch(() => {});
      return run;
    },
    async listMembers(status) {
      return [...members.values()].filter(m => !status || m.status === status).map(m => ({ ...m }));
    },
  };
}

/** Firestore store. Client rules give users no access to these paths. */
function firestoreStore(db) {
  const root = db.collection('artifacts').doc('moot.coach');
  const stateRef = root.collection('pilot').doc('state');
  const membersCol = root.collection('pilotMembers');
  return {
    transact(fn) {
      return db.runTransaction(async (t) => {
        const tx = {
          getMember: async uid => { const s = await t.get(membersCol.doc(uid)); return s.exists ? s.data() : null; },
          getState: async () => { const s = await t.get(stateRef); return s.exists ? s.data() : null; },
          putMember: m => t.set(membersCol.doc(m.uid), m),
          putState: s => t.set(stateRef, s),
        };
        return fn(tx);
      });
    },
    async listMembers(status) {
      const q = status ? membersCol.where('status', '==', status) : membersCol;
      const snap = await q.get();
      return snap.docs.map(d => d.data());
    },
  };
}

module.exports = { createPilot, memoryStore, firestoreStore, readConfig, domainOf, DEFAULT_LIMITS };
