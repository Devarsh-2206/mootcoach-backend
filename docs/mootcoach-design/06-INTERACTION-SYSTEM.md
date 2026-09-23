# MOOTCOACH: INTERACTION SYSTEM

## 1. Cursor Interactions
Desktop experiences should have a rich cursor interaction system. Mobile will gracefully fall back to touch interactions without custom cursors.

- **Proximity Hover:** As the cursor approaches a button, the button subtly scales and brightens before the mouse even enters the bounding box.
- **Card Tilt (3D):** Interactive perspective. As the cursor moves over a card, it subtly tilts based on mouse coordinates, with a faint glare/lighting effect moving across the surface.
- **Magnetic Snap:** Core UI controls (like the submit button or pagination) should exert a slight magnetic pull on the cursor when very close.
- **DO NOT:** Do not create a giant custom dot cursor everywhere. Let the native cursor remain, and use interaction *around* it.

## 2. Hover States
- **Lighting:** Rather than simply changing background color, simulate a light source moving over the element.
- **Depth Changes:** Elements on hover should elevate (increase scale slightly and cast a softer, wider shadow).

## 3. Transitions Between States
- **Spatial Expansion:** When opening a modal or entering a stage, the current container shouldn't just disappear. It should expand spatially, and background elements should progressively blur out.
- **Morphing:** A list item clicked to reveal details should visually stretch and morph into the detail container.

## 4. Skiper-Inspired Techniques to Evaluate
- **Progressive Blur:** USE. For modals and background depth.
- **Magnetic Interaction:** USE. For primary CTAs only.
- **Card Stack / Perspective Carousel:** USE. For navigating between legal precedents or argument structures.
- **Scroll Image Reveal (Clip-Path):** USE. For landing page storytelling.
- **Bouncy Accordion:** USE. For expanding legal rules/statutes.
- **Gooey Effect:** AVOID. Too playful/casual for a legal tech app.
- **Cursor Trail:** AVOID. Distracting and unnecessary.
