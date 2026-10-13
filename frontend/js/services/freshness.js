/**
 * Make sure the browser runs the release that is deployed.
 *
 * The page loads its scripts as ES modules with no version in their URLs, so
 * after a release a browser can keep running the previous scripts from its
 * cache. A tester saw exactly that: the new server answering, the old page
 * rendering, and none of the new screens there.
 *
 * version.json is fetched past every cache and compared with the build this
 * page was loaded with. On a mismatch the scripts are fetched again with the
 * cache bypassed — which replaces the stale copies — and the page reloads
 * once. A session flag stops it ever looping.
 */
import { BUILD } from '../config.js';

export async function ensureFreshBuild() {
  console.info(`[MootCoach] build ${BUILD}`);
  document.documentElement.dataset.build = BUILD;
  let live = null;
  try {
    const r = await fetch(`version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) live = (await r.json()).build;
  } catch (e) { return; }               // offline or no file: nothing to compare
  if (!live || live === BUILD) return;

  const flag = 'mc-refreshed-for';
  try { if (sessionStorage.getItem(flag) === live) { console.warn(`[MootCoach] still on ${BUILD} after refreshing for ${live}`); return; } } catch (e) {}
  try { sessionStorage.setItem(flag, live); } catch (e) {}

  console.warn(`[MootCoach] running ${BUILD}, deployed ${live}: refreshing scripts`);
  const scripts = performance.getEntriesByType('resource')
    .map(e => e.name)
    .filter(u => u.startsWith(location.origin) && /\/js\/.+\.js(\?|$)/.test(u));
  await Promise.all(scripts.concat([location.href]).map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
  location.reload();
}
