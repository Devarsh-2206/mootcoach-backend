/**
 * Tailwind build for the frontend (was the Play CDN, which is meant for
 * development: slower first load and a console warning).
 *   npm run build:css      after adding Tailwind classes to the HTML or JS
 */
module.exports = {
  content: ['./frontend/index.html', './frontend/js/**/*.js'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        'moot-border': 'rgba(28, 23, 16, 0.14)',
        'moot-muted': 'rgba(28, 23, 16, 0.5)',
        'moot-panel': '#FCF9EF',
        'moot-accent': '#B0392E',
        'white-muted': 'rgba(28, 23, 16, 0.5)',
      },
      fontFamily: { sans: ['EB Garamond', 'Georgia', 'serif'], serif: ['Cormorant Garamond', 'Georgia', 'serif'], mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'] },
    },
  },
};
