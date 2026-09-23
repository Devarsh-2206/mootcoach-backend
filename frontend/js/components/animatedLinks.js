/* ─── ANIMATED LINKS ───
   Vanilla port of Skiper UI's "skiper40" link set. The hover effects are
   pure CSS (.sk-link--1 … --5 in index.html); this module only adds the
   extra markup variants 3 (text roll) and 4 (arrow swap) need.

   Declarative:  <a href="…" data-sk-link="3">Read the brief</a>
                 then call enhanceAnimatedLinks() once the DOM is ready.
   Imperative:   container.appendChild(createAnimatedLink({ href, text, variant: 4 }))
*/

const ARROW_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>`;

function buildInner(link, variant) {
  const label = link.textContent.trim();
  if (variant === 3) {
    const roll = document.createElement('span');
    roll.className = 'sk-roll';
    const front = document.createElement('span');
    const back = document.createElement('span');
    front.textContent = label;
    back.textContent = label;
    back.setAttribute('aria-hidden', 'true');
    roll.append(front, back);
    link.replaceChildren(roll);
  } else if (variant === 4) {
    const text = document.createElement('span');
    text.textContent = label;
    const icon = document.createElement('span');
    icon.className = 'sk-icon';
    icon.innerHTML = ARROW_SVG + ARROW_SVG;
    link.replaceChildren(text, icon);
  }
}

export function enhanceAnimatedLink(link, variant = Number(link.dataset.skLink) || 1) {
  if (link.dataset.skReady) return link;
  const v = Math.min(Math.max(variant, 1), 5);
  link.classList.add('sk-link', `sk-link--${v}`);
  buildInner(link, v);
  link.dataset.skReady = '1';
  return link;
}

export function enhanceAnimatedLinks(root = document) {
  root.querySelectorAll('[data-sk-link]').forEach((el) => enhanceAnimatedLink(el));
}

export function createAnimatedLink({ href = '#', text = '', variant = 1, target } = {}) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (target) {
    a.target = target;
    if (target === '_blank') a.rel = 'noopener noreferrer';
  }
  return enhanceAnimatedLink(a, variant);
}
