# MOOTCOACH: HIGGSFIELD ASSETS PLAN

## 1. Goal
Use Higgsfield for highly specific, premium cinematic assets. Do NOT generate assets randomly. We need short, reusable, highly polished videos that are served as static assets.

## 2. Asset Inventory

### A. Cinematic Courtroom Intro (Landing Page Hero)
- **Purpose:** Establish the mood instantly.
- **Aspect Ratio:** 16:9 and 9:16 (Mobile).
- **Duration:** 4-6 seconds.
- **Visual Direction:** A slow, smooth camera push through a dimly lit, highly realistic courtroom, stopping just before the bench. Dust motes in the air.
- **Lighting:** Warm, directional, cinematic.

### B. AI Judge Introduction (Bench Simulator)
- **Purpose:** The moment the user enters the practice stage.
- **Aspect Ratio:** 16:9.
- **Duration:** 3 seconds (Looping ambient state).
- **Visual Direction:** The perspective from the podium looking at the judge's bench. The "Judge" can be represented by a premium architectural focal point, or an abstract, highly realistic glass/light sculpture that pulses with speech. 

### C. Proposition Analysis Visual
- **Purpose:** Background asset during the "Analyse" loading state.
- **Aspect Ratio:** 16:9 or 1:1.
- **Duration:** 3-5 seconds.
- **Visual Direction:** Macro shot of legal paper, with glowing, golden/red light scanning across the text, revealing connected nodes.

## 3. Implementation Rules
- Always use compressed WebM (with MP4 fallback).
- Use a `poster` image (the first frame of the video) to ensure no blank screens during loading.
- Videos should seamlessly fade into the UI. The last frame of the video should match the background color of the subsequent UI panel.
