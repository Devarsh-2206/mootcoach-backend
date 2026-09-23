# MOOTCOACH: MASTER DESIGN BRIEF

## 1. WHAT MOOTCOACH IS
MootCoach is an AI-powered moot court preparation platform. It helps law students prepare for competitions through legal proposition analysis, argument structuring, memorial drafting, and an AI-assisted oral-round bench simulator.

## 2. WHAT MOOTCOACH SHOULD FEEL LIKE
The experience should communicate that MootCoach is a serious, next-generation legal-tech product. It should feel:
- **Cinematic**
- **Smooth**
- **Bouncy & Physical**
- **Intelligent**
- **Realistic**
- **Premium**
- **Legally Sophisticated**

The user should feel like they are entering a legal simulation, not opening a standard web application. 

## 3. WHAT MOOTCOACH SHOULD LOOK LIKE
- **Base Aesthetic:** Dark Cinematic (deep blacks, near-black charcoal, controlled contrast).
- **Brand Aesthetic:** Modern Legal/Editorial (burgundy/wine accents, high-end serif combined with clean modern sans-serif).
- **Materials:** Restrained glass/translucency (used as a material, not a global trend).
- **Architecture:** Spatial design with depth, perspective, and layered environmental backgrounds.

## 4. HOW MOOTCOACH SHOULD MOVE
- **Physics-Based:** Movement should utilize spring physics (overshoot and settle) and retain momentum.
- **Progressive & Staggered:** Content should reveal progressively through masks or staggered entry rather than sudden pop-ins.
- **Purposeful:** Animations must serve hierarchy, feedback, or spatial understanding. 

## 5. HOW MOOTCOACH SHOULD RESPOND TO THE CURSOR
- Core interactive elements (like primary buttons) exert a subtle magnetic pull.
- Cards tilt in 3D perspective based on cursor coordinates.
- Hover states simulate a dynamic light source passing over the surface.
- Keep native cursors; avoid giant custom dot cursors.

## 6. HOW THE LANDING PAGE SHOULD WORK
- **Narrative Arc:** A storytelling experience guiding the user from the courtroom, through case uploading, analysis, argument building, to the bench simulation.
- **Hero:** A cinematic video intro establishing the courtroom environment.
- **Scrolling:** Features are revealed through image masking, progressive blur, and kinetic typography as the user scrolls.

## 7. HOW THE APPLICATION SHOULD WORK
- **Dashboard:** Not flat cards, but deep perspective panels representing the four stages: ANALYSE, PRACTICE, BUILD, REVIEW.
- **Navigation:** Minimal, allowing the simulation environment to take over the screen.

## 8. HOW EACH STAGE SHOULD FEEL
- **ANALYSE:** An advanced intelligence environment. Document uploads show progressive scanning, with facts and issues extracted into a visual legal graph.
- **PRACTICE (Bench Simulator):** Highly realistic, dark courtroom aesthetic. Abstract, physical-feeling audio visualization for the AI judge.
- **BUILD:** An advanced reasoning workspace focusing on typography and clear IRAC structure, mapping counterarguments and precedent connections.
- **REVIEW:** A premium performance analysis utilizing elegant radial charts, animated numbers, and staggered reveals. Honest, academic grading UI.

## 9. HOW HIGGSFIELD SHOULD BE USED
- Used strictly for high-fidelity, short (3-6 sec), looping or one-shot cinematic assets.
- Assets are pre-rendered and served statically as heavily compressed WebM (with MP4 fallbacks).
- Examples: The courtroom hero shot, a macro shot of a scanning legal document, the abstract visual presence of the AI judge.

## 10. HOW PERFORMANCE SHOULD BE PROTECTED
- Animate only `transform` and `opacity`.
- Aggressive media compression and lazy loading.
- Always use WebP poster frames for videos.
- Fallback to simplified animations on mobile or lower-end devices.

## 11. WHAT MUST NEVER BE DONE
- Do NOT make a generic SaaS dashboard or use "cyberpunk" clichés.
- Do NOT use excessive neon, glowing borders, gradient blobs, or meaningless particle effects.
- Do NOT animate things just because you can (no random bouncing without user interaction).
- Do NOT rebuild the application, replace the architecture, or break existing functionality. 
- Claude Code will use this brief to implement the design *within* the existing architecture.
