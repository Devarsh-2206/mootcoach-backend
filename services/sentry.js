/**
 * Error reports to Sentry (sentry.io, EU region), so a crash during the pilot
 * reaches the owner by email instead of waiting for a student to mention it.
 *
 *   SENTRY_DSN   the backend project's DSN (Render environment). Without it
 *                nothing is loaded or sent.
 *
 * PRIVACY: only what is needed to find a bug leaves the server — the error,
 * its stack trace, the route and the build. Never request bodies (the
 * proposition, notes, drafts, transcripts), cookies, auth headers, query
 * strings (the voice round carries case context in its URL), console output,
 * or who the user is. Error messages are cut short, because some quote a few
 * words of model output.
 *
 * Must be required before express and the rest of server.js, so Sentry can
 * hook into them.
 */
const DSN = process.env.SENTRY_DSN;
let Sentry = null;

if (DSN) {
  try {
    Sentry = require('@sentry/node');
    let release = '';
    try { release = require('../frontend/version.json').build || ''; } catch (e) { /* none */ }
    const clip = (s, n = 300) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s);
    const stripQuery = (u) => (typeof u === 'string' ? u.split('?')[0] : u);
    Sentry.init({
      dsn: DSN,
      release: release || undefined,
      environment: process.env.RENDER ? 'production' : 'development',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      maxBreadcrumbs: 20,
      // No console breadcrumbs: server logs can quote student or model text.
      integrations: (defaults) => defaults.filter(i => i.name !== 'Console'),
      beforeBreadcrumb(b) {
        if (b && b.data) { delete b.data.body; if (b.data.url) b.data.url = stripQuery(b.data.url); }
        return b;
      },
      beforeSend(event) {
        if (event.request) {
          const r = event.request;
          event.request = { method: r.method, url: stripQuery(r.url) };
        }
        delete event.user;
        if (event.extra) delete event.extra;
        for (const ex of (event.exception && event.exception.values) || []) ex.value = clip(ex.value);
        if (event.message) event.message = clip(event.message);
        return event;
      },
    });
    console.log('[SENTRY] error reporting on' + (release ? ` (build ${release})` : ''));
  } catch (e) {
    console.warn('[SENTRY] could not start, continuing without it:', e && e.message);
    Sentry = null;
  }
}

/** Express: add after all routes. No-op without Sentry. */
function attachErrorHandler(app) {
  if (Sentry && typeof Sentry.setupExpressErrorHandler === 'function') Sentry.setupExpressErrorHandler(app);
}

/** Report a caught error that the student was shown a message for. */
function report(err, where) {
  if (!Sentry || !err) return;
  try { Sentry.captureException(err, { tags: { where: String(where || '').slice(0, 60) } }); } catch (e) { /* never break a request */ }
}

/**
 * Express middleware: most failures are caught by the route and answered with
 * a friendly 5xx, so they never reach the error handler. Report those too —
 * route and status only, no content.
 */
function watchServerErrors() {
  return (req, res, next) => {
    if (Sentry) res.on('finish', () => {
      if (res.statusCode < 500) return;
      try {
        const route = String(req.originalUrl || req.url || '').split('?')[0].slice(0, 120);
        Sentry.captureMessage(`${req.method} ${route} answered ${res.statusCode}`, { level: 'error', tags: { route, status: String(res.statusCode) } });
      } catch (e) { /* never break a request */ }
    });
    next();
  };
}

module.exports = { attachErrorHandler, watchServerErrors, report, enabled: () => !!Sentry };
