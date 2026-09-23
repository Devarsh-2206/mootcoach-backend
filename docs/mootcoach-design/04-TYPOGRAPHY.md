# MOOTCOACH: TYPOGRAPHY SYSTEM

## 1. Font Families
The typographic hierarchy must balance premium editorial aesthetics with modern application clarity.

- **Serif (Editorial / Legal / Display):** `Cormorant Garamond`, `EB Garamond`, or similar high-end serif. Used for large headings, quotes, and primary document titles.
- **Grotesk / Sans-Serif (Interface / Body):** `Inter`, `Roobert`, or `Outfit`. Used for the main interface, standard reading text, and UI controls.
- **Monospace (Technical / Metadata):** `IBM Plex Mono` or `JetBrains Mono`. Used for HUD elements, system status, metadata, and labels.

## 2. Hierarchy & Tokens

### Display (Cinematic Introductions)
- **Font:** Serif
- **Size:** 4.5rem to 6rem (Responsive)
- **Weight:** 400 (Regular)
- **Letter Spacing:** -0.02em

### H1 (Page / Environment Titles)
- **Font:** Serif
- **Size:** 3.5rem
- **Weight:** 500 (Medium)
- **Letter Spacing:** -0.01em

### H2 (Section Headings)
- **Font:** Sans-Serif
- **Size:** 2rem
- **Weight:** 400 (Regular)
- **Letter Spacing:** 0em

### H3 (Card / Panel Headings)
- **Font:** Sans-Serif
- **Size:** 1.25rem
- **Weight:** 500 (Medium)

### Body (Primary Reading)
- **Font:** Sans-Serif (or Serif for generated legal documents)
- **Size:** 1rem (16px)
- **Weight:** 300 / 400
- **Line Height:** 1.6
- **Color:** `--mc-text-body`

### Small (Supporting Text)
- **Font:** Sans-Serif
- **Size:** 0.875rem (14px)
- **Color:** `--mc-text-muted`

### Metadata / Labels (Technical HUD)
- **Font:** Monospace
- **Size:** 0.75rem (12px)
- **Weight:** 500 (Medium)
- **Letter Spacing:** 0.1em
- **Text Transform:** UPPERCASE

## 3. Responsive Behavior
Typography should fluidly scale using `clamp()` functions to ensure perfect proportions from mobile to ultra-wide desktop.

```css
:root {
  --font-serif: 'Cormorant Garamond', serif;
  --font-sans: 'Inter', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  
  --text-display: clamp(3rem, 5vw, 6rem);
  --text-h1: clamp(2.5rem, 4vw, 3.5rem);
  --text-h2: clamp(1.5rem, 3vw, 2rem);
  --text-body: 1rem;
  --text-meta: 0.75rem;
}
```
