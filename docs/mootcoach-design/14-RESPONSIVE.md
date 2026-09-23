# MOOTCOACH: RESPONSIVE DESIGN

## 1. Philosophy
Do not simply shrink the desktop layout. The experience must be tailored for the device.

## 2. Desktop (Large Screens)
- **Features:** Full cursor physics, rich 3D card tilts, complex parallax, expansive infinite canvases.
- **Layout:** Side-by-side panels, wide margins.

## 3. Laptop / Standard Web
- **Features:** Retain most cursor physics. Simplify 3D elements to 2D transforms (scale, translate) if performance drops.
- **Layout:** Standard fluid grids.

## 4. Tablet
- **Features:** Touch interactions replace hover. No magnetic cursor effects. 
- **Layout:** Stacked panels, collapsible sidebars.

## 5. Mobile
- **Features:** Touch interactions. Simplified depth (fewer layered shadows). Lighter animation (fewer staggered reveals, no heavy 3D). Optimized video assets (9:16 ratio).
- **Layout:** Full stacking. Navigation moves to a bottom tab bar or a compact hamburger menu.
- **Typography:** Ensure `clamp()` functions prevent text from becoming unreadable on small screens. Ensure touch targets are at least `44x44px`.
