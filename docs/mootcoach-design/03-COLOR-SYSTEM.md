# MOOTCOACH: COLOR SYSTEM

## 1. Base Palette
The foundation of MootCoach is dark, cinematic, and professional.

- **Black (Backgrounds):** `#0A0A0A`
- **Near-Black (Surfaces):** `#111111`
- **Charcoal (Panels/Cards):** `#1A1A1A`
- **Deep Charcoal (Elevated):** `#222222`

## 2. Brand Direction
Rich, legal-inspired hues that convey institutional weight and premium quality.

- **Primary Brand (Burgundy):** `#7A1B1F`
- **Primary Brand Light (Deep Wine):** `#9C2328`
- **Primary Brand Muted:** `rgba(122, 27, 31, 0.15)`
- **Secondary (Indigo):** `#1F2937`

## 3. Accents
Used sparingly for highlights, interactive states, and typography.

- **Warm Metallic / Ivory:** `#EFE6D3` (Main Text)
- **Champagne Accent:** `#D4AF37` (Subtle highlights, medals, high scores)
- **Cool Grey (Metadata):** `#888888`
- **Off-White (Headings):** `#F9F9F9`

## 4. UI / State Colors
- **Success (Green):** `#2F7D52` (High Moot Strength, valid arguments)
- **Warning (Amber):** `#D97706` (Missing precedents, weak points)
- **Error (Red):** `#A8362A` (Objections, fatal flaws)
- **Borders/Lines:** `rgba(239, 230, 211, 0.08)` (Ultra-subtle structure)
- **Hover/Active:** `rgba(255, 255, 255, 0.05)`

## 5. Implementation Tokens (CSS Variables)
```css
:root {
  /* Base */
  --mc-base-black: #0A0A0A;
  --mc-base-near-black: #111111;
  --mc-base-charcoal: #1A1A1A;
  
  /* Brand */
  --mc-brand-burgundy: #7A1B1F;
  --mc-brand-wine: #9C2328;
  --mc-brand-muted: rgba(122, 27, 31, 0.15);
  
  /* Text */
  --mc-text-heading: #F9F9F9;
  --mc-text-body: #EFE6D3;
  --mc-text-muted: #888888;
  
  /* Accents */
  --mc-accent-champagne: #D4AF37;
  
  /* UI */
  --mc-ui-border: rgba(239, 230, 211, 0.08);
  --mc-ui-hover: rgba(255, 255, 255, 0.05);
  
  /* States */
  --mc-state-success: #2F7D52;
  --mc-state-warning: #D97706;
  --mc-state-error: #A8362A;
}
```
