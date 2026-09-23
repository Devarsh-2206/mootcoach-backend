# MOOTCOACH: ACCESSIBILITY

## 1. Reduced Motion
The interface must remain usable and beautiful without animation.
- Implement `@media (prefers-reduced-motion: reduce)` globally.
- Disable parallax, 3D tilt, and continuous spinning animations.
- Replace cinematic morphing transitions with simple, rapid opacity fades.

## 2. Keyboard Navigation
- Every interactive element must be reachable via `Tab`.
- **Focus States:** Create a distinct focus state that fits the premium brand. Instead of a default blue ring, use a highly visible `--mc-accent-champagne` or white border with a slight offset.
  ```css
  :focus-visible {
    outline: 2px solid var(--mc-accent-champagne);
    outline-offset: 4px;
  }
  ```

## 3. Contrast
- Ensure all text meets at least WCAG AA standards against its background.
- Pay special attention to text placed over translucent/glass panels or background videos.

## 4. Semantic Hierarchy & Screen Readers
- Use correct HTML5 semantic tags (`<nav>`, `<main>`, `<article>`, `<section>`).
- Ensure the single `<h1>` rule is followed per page/view.
- Add `aria-labels` to icon buttons and abstract visual controls (like the microphone toggle in the Bench Simulator).
