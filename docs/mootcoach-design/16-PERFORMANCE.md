# MOOTCOACH: PERFORMANCE

## 1. Philosophy
A futuristic website that takes 8 seconds to load is not premium. The experience must be instant. 

## 2. Media Optimization
- **Video:** Use WebM with aggressive compression. Provide an MP4 fallback. Limit videos to 5-10 seconds.
- **Poster Images:** Every video must have a pre-loaded, highly compressed WebP poster image to prevent layout shift and black flashes.
- **Images:** All images must be WebP or AVIF.

## 3. Rendering & Animations
- **CSS Transforms:** Only animate `transform` and `opacity`. This forces the browser to use the GPU.
- **Will-Change:** Use the `will-change` CSS property sparingly, applying it only to elements actively about to animate (e.g., on hover before the click event triggers the transition), and remove it afterwards.
- **Animation Cleanup:** If an element with a complex animation (like the Bench Simulator audio wave) leaves the viewport, the animation loop must be paused to save CPU/GPU cycles.
- **WebGL / Three.js:** Avoid using Three.js merely because it is impressive. If CSS and GSAP can create the same spatial effect (e.g., perspective card tilts), prefer the simpler implementation.

## 4. Loading Strategy
- **Lazy Loading:** Any heavy visual assets below the fold (or in later stages like "Review") must be lazily loaded.
- **Preloading:** Preload the Hero video, the primary Serif font, and the primary Sans-Serif font in the document `<head>`.
