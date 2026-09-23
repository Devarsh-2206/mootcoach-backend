# MOOTCOACH: MOTION SYSTEM

## 1. Core Philosophy
The interface must feel **smooth, bouncy, responsive, fluid, and physical**. Animation should never be used simply because it is possible; it must serve hierarchy, feedback, transition, spatial understanding, or system state. 

## 2. Physics & Easing
All animations should be rooted in physics rather than linear or basic CSS easings.

- **Spring Physics:** Elements overshoot slightly and settle naturally (e.g., `spring(1, 80, 10, 0)`).
- **Inertia & Momentum:** Scrolling and dragging should retain momentum.
- **Cinematic Easing:** For non-spring elements, use customized cubic-beziers.
  - *Standard UI:* `cubic-bezier(0.16, 1, 0.3, 1)` (snappy but smooth)
  - *Cinematic Reveal:* `cubic-bezier(0.22, 1, 0.36, 1)` (slow, dramatic settle)

## 3. Key Motion Concepts

### Magnetic Interaction
Buttons and interactive elements subtly respond to cursor proximity. As the cursor approaches, the element pulls slightly toward it.

### Parallax & Depth
Layers move at different speeds on scroll or mousemove. The background (environment) moves slower than the foreground (UI panels).

### Progressive Reveal
Content does not simply "fade in". It is revealed through masks, progressive blur, or staggered entry. Text can roll up from a hidden overflow container.

### Stagger
Related elements (list items, cards, document paragraphs) enter sequentially rather than all at once, creating a sense of flow and calculation.

### Morphing & Shared Element Transitions
When a user clicks a card to open a detailed view, the card itself should morph into the detail panel, retaining spatial continuity.

## 4. Performance Rules
- **GPU Acceleration:** Only animate `transform` and `opacity`. Never animate `width`, `height`, `margin`, or `top/left` directly.
- **Cleanup:** Unmount or stop animations that are out of the viewport.
- **Reduced Motion:** Always respect `@media (prefers-reduced-motion: reduce)`.
