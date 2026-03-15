# AGENTS.md

## Repo Identity

This repository is not a generic language-learning app.

It is a tightly structured Russian practice tool built around tiny measurable reps, immediate feedback, adaptive resurfacing, and permanent progress. The current keyboard trainer is the reference standard for how the product should feel: one target at a time, very low friction to begin, clear timing/error signals, and obvious visibility into exact weak spots.

Future work in this repo should preserve that identity. If a change makes the app feel broader, fuzzier, more abstract, or more like a generic flashcard course, it is probably the wrong change.

## Product Philosophy

The app teaches through repetition, not through long explanations.

The user should be able to open the app, resume immediately, and start getting meaningful reps without setup friction.

Learning is most effective here when it is:

- Atomized: one tiny target per prompt.
- Measurable: each attempt produces concrete performance data.
- Legible: the learner can see what they are weak at.
- Adaptive: weak items resurface until they stop being weak.
- Permanent: progress persists across sessions and devices.

The product should feel highly structured and explicit. Do not hide the learning logic behind vague summaries or motivational UI. The learner should be able to tell exactly what is being practiced, how long it took, how many mistakes happened, and where the current weakness lives.

## Pedagogical Rules

- Every practice module should train precise atoms with a canonical correct answer.
- Each attempt should measure time-to-correct and error strikes before the correct answer.
- Count user-level mistakes, not implementation noise. Outside raw keyboard input, one wrong click or one wrong submitted answer should count as one strike.
- Preserve the N+1 progression: recognition before production, guided work before freer recall.
- In early guided stages, visually expose the mutable or meaningful changing part. Remove scaffolding later.
- Prefer repeated exposure and exact correction over extra explanation.
- Keep weakness local. Show exact weak atoms, not only broad averages.

## Scope Discipline

- Prefer tight, high-quality modules over broad scope.
- Do not expand the app into a general Russian curriculum unless explicitly requested.
- Do not invent new Russian content when canonical deck/config files are provided.
- When a task includes authoritative content files, treat them as the source of truth.
- If tradeoffs appear, prioritize in this order:
  1. Correctness of curriculum data
  2. Atom-level pedagogy
  3. Clean adaptive practice flow
  4. Visibility of weakness and analytics
  5. Visual polish
  6. Architectural elegance

## UI and UX Guidance

Preserve the existing design language unless the user explicitly asks for a redesign.

- Warm cream / mint / coral / sand palette
- Glass-card surfaces
- Refined serif headings
- Spacious central practice area
- Subtle motion only
- Quiet, premium feedback rather than noisy gamification

Every practice experience should foreground:

- The current target
- Live timer
- Current error count
- Streak or current run quality
- One-line feedback
- Clear local progress or weakness visibility

Do not clutter the screen with lesson chrome, excessive copy, or reward mechanics that distract from reps.

## Engineering Guidance

Work with the current app shape before introducing abstractions.

The current repo is intentionally simple:

- `index.html` provides the structure
- `styles.css` provides the visual system
- `app.js` contains the main client logic
- `backend/russian_key_coach_sync.py` handles persistent sync

Guidelines for future changes:

- Extend existing patterns before introducing new frameworks or a large architectural rewrite.
- Keep state and scoring logic inspectable and explicit.
- Preserve import/export/reset/server-sync behavior as product features, not optional extras.
- Keep progress schemas versioned and backward compatible.
- Reuse the existing adaptive resurfacing philosophy when adding new practice domains.
- Make analytics concrete enough that a learner can act on them immediately.

## Workflow for Future Models

Before making changes:

- Inspect the current implementation first.
- Identify the true practice atom for the feature.
- Identify the scoring path, persistence path, and analytics surface that the change will affect.
- Check whether canonical content/config files exist and use them directly if they do.

When implementing:

- Preserve low-friction resume behavior.
- Keep prompts narrow and measurable.
- Avoid mixing unrelated content into a default practice flow.
- Prefer explicit data structures over clever hidden logic.
- Keep feedback immediate and calm.

When reviewing your own work:

- Ask whether the result still feels like repetition training rather than a lesson app.
- Ask whether the learner can see exact improvement and exact weakness.
- Ask whether progress remains permanent and backward compatible.

## Current Scope Note

The current planned grammar expansion in this repo is tightly limited to:

- `1st Conjugation`
- `2nd Conjugation`

For this pass:

- Do not add other grammar modules.
- Do not add extra vocabulary beyond the canonical deck files.
- Do not add perfective-future reference verbs.
- Do not silently broaden the curriculum.

The goal is not breadth. The goal is to make these few modules feel as rigorous and measurable as the keyboard trainer.
