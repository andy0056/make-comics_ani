# MakeComics Moat Strategy

Last updated: 2026-02-08 13:53:21 +04:00
Owner: Codex + User

## Moat Thesis
The defensible advantage is not just better models. It is a compound system:

1. Workflow moat: fastest, clearest, most reliable comic creation flow for non-technical users.
2. Memory moat: persistent story and character memory that keeps visual/narrative consistency over time.
3. Data moat: preference and edit-behavior signals that personalize generation quality and UX automatically.
4. Retention moat: loops that bring creators back to continue, remix, and publish stories.

## Product Principles
1. Transparent over magical: always show what stage is running and what failed.
2. Fast perceived speed: optimistic UI and immediate feedback while generation runs.
3. Continuity by default: every new page should inherit consistent story/character context automatically.
4. Progressive power: simple for first-time users, deep controls for repeat creators.

## 30/60/90 Plan

### 0-30 Days (Foundation)
1. Character Bible v1:
   - Story-level character memory (name, role, appearance, personality, locked traits, reference image).
   - Prompt injection from character bible into every generation request.
2. Editor superflow v1:
   - Optimistic placeholders for page generation.
   - Better action-state feedback and duplicate-action guards.
   - Redraw recovery affordance (undo last redraw).
3. Consistency engine v1:
   - Central context builder from prior page prompts + character bible.
   - Shared by create/add-page APIs.

### 31-60 Days (Compounding)
1. Smart continuation suggestions:
   - One-click “next beat” suggestions from story history.
2. Preference memory:
   - Learn preferred pacing/style and auto-apply defaults.
3. Reliability controls:
   - Better retry policies and error taxonomy by failure type.

### 61-90 Days (Retention + Growth)
1. Return loops:
   - Continue unfinished story nudges and “resume where you left off”.
2. Sharing/remix loop:
   - Story remix starter flow.
3. Creator analytics:
   - Funnel visibility: create -> generate -> continue -> complete -> return.

## Moat Metrics
1. D1 / D7 return rate.
2. Time-to-first-finished-comic.
3. Pages generated per active user per week.
4. Regeneration rate per page (lower over time with better consistency).
5. Completion rate for stories started.

## Current Execution Order
1. Character Bible.
2. Editor Superflow.
3. Consistency Engine.
4. Creation Loop.

## Risks and Mitigation
1. Model variability risk:
   - Mitigate via stronger continuity prompts + memory controls, not model lock-in.
2. Latency risk:
   - Mitigate via optimistic UI and explicit stage status.
3. Complexity risk:
   - Mitigate via progressive disclosure (basic first, advanced controls optional).
