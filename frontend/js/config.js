export const BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://mootcoach-backend-1.onrender.com';

/* What an upload may be, said to the user before they pick a file.
   maxMB must match MAX_UPLOAD_MB in server.js, which enforces it. The page
   figures are how much of the text the AI actually reads (server.js keeps the
   first 120,000 characters of a proposition and 90,000 of a memorial, at
   roughly 2,600 characters a page); longer files are still accepted. */
export const UPLOAD_LIMITS = {
  maxMB: 25,
  propositionPages: 45,
  memorialPages: 35,
};

/* Which release this browser is running. Must match frontend/version.json;
   bump both together on every release (tools/bump-build.js does it). */
export const BUILD = '2026-10-18.2';
