/**
 * Microsoft Clarity Integration Service for MootCoach
 */

const CLARITY_PROJECT_ID = 'wzcw9ln32b';

/**
 * Initializes Microsoft Clarity.
 * Runs only in production and avoids duplicate initialization/script injections.
 */
export function initClarity() {
  // 1. Production check: Only run Clarity in production environments
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  
  if (!isProduction) {
    console.log('[Clarity] Development environment detected. Skipping initialization.');
    return;
  }

  // 2. Prevent duplicate script injection and initialization
  if (window.clarity || document.getElementById('microsoft-clarity-script')) {
    console.warn('[Clarity] Already initialized or script already injected.');
    return;
  }

  try {
    console.log('[Clarity] Initializing Microsoft Clarity...');

    // 3. Inject Microsoft Clarity script globally
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);
        t.async=1;
        t.src="https://www.clarity.ms/tag/"+i;
        t.id="microsoft-clarity-script"; // ID for preventing duplicate script injection
        y=l.getElementsByTagName(r)[0];
        y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", CLARITY_PROJECT_ID);

    // 4. Custom event for initial load
    window.clarity("event", "app_start");

  } catch (error) {
    console.error('[Clarity] Error during initialization:', error);
  }
}

/**
 * Associates the authenticated user's ID and displayName with the Clarity session.
 * Ensures compatibility with Firebase Authentication flow.
 * @param {Object} user - The Firebase User object
 */
export function identifyUserInClarity(user) {
  if (!window.clarity) return;

  if (user) {
    // Identify user in Clarity session using Firebase uid
    window.clarity("identify", user.uid, {
      email: user.email || 'anonymous',
      displayName: user.displayName || 'advocate'
    });
    console.log(`[Clarity] Identified session with user ID: ${user.uid}`);
  }
}
