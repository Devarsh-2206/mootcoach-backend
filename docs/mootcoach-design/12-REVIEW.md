# MOOTCOACH: REVIEW / MOOT STRENGTH

## 1. Goal
Design a premium performance analysis environment for reviewing the student's mooting practice and drafted arguments.

## 2. Visualizing Metrics
Metrics will include Issue Clarity, Argument Depth, Precedent Use, Rebuttal Strength, Oral Delivery, and overall Legal Reasoning.

- **Radial Visualization / Spider Charts:** Use elegant, thin-line radar charts to map the different axes of performance.
- **Animated Numbers:** Scores should roll up from 0 to the final value (e.g., GSAP `textContent` tween).
- **Dynamic Charts:** Use smooth, spring-based animations for bar charts or progress rings. 
- **Colors:** Use the defined success/warning/error colors, but apply them to thin strokes or subtle glowing dots rather than massive blocks of color.

## 3. Honest UI
- Do not artificially inflate scores with fireworks or excessive celebration UI.
- The interface must remain honest, serious, and academic. A high score is a professional achievement, not a slot machine win. 

## 4. Interaction
- **Staggered Reveals:** The review page should build itself sequentially. First the overall score, then the breakdown, then specific feedback points.
- **Drill-down:** Clicking a metric should smoothly expand a panel detailing exactly *why* the AI awarded that score, linking back to the transcript or the drafted text.
