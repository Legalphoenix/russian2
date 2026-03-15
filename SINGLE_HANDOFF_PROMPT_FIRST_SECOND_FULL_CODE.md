Implement the attached code and data exactly as the baseline for a Russian conjugation trainer that preserves the original keyboard app’s shell and visual language.

Scope is intentionally narrow. Only implement:
- 1st Conjugation
- 2nd Conjugation

Do not add past tense, vocabulary tabs, conversation, or any other curriculum in this pass.

The point of this feature is to preserve the exact training philosophy of the keyboard coach: one tiny measurable atom at a time, repetitive reps, timer until correct, error strikes before correct, adaptive resurfacing of weak cells, and visible per-cell progress. The unit of mastery is not “a verb” in general. The unit is one exact verb-person cell, e.g. `говорить + ты -> говоришь`.

Authoritative files in this handoff:
- `index.html` = full page structure preserving the keyboard app layout pattern
- `styles.css` = original visual system plus conjugation-specific additions
- `app.js` = full front-end implementation for the conjugation trainer
- `decks.js` = runtime deck data used by the app
- `first_conjugation.json` = canonical 1st-conjugation source deck
- `second_conjugation.json` = canonical 2nd-conjugation source deck
- `conjugation_shared_config.json` = canonical stage and pedagogy config

Treat the attached code as the implementation baseline, not as vague reference material.

Non-negotiable product behavior:
1. Keep the same premium shell as the keyboard app:
   - hero card on top
   - left practice card
   - right session snapshot card
   - lower heatmap card
   - lower table card
   - warm cream / mint / coral / sand palette
   - glass-card feel
2. Keep the same control philosophy:
   - Start
   - Pause
   - Export data
   - Import data
   - Reset progress
3. Keep the same primary measurements:
   - time to correct answer
   - error strikes before correct answer
4. Keep adaptive resurfacing. Weak cells should keep reappearing until they cool down.
5. Make it obvious where the learner is weak:
   - verb × person heatmap
   - sorted per-cell table
   - adaptive focus chips
   - stage rail showing progression per cell

Pedagogy that must remain intact:
- Progression ladder:
  - Preview
  - Choose 2
  - Choose 4
  - Full choice
  - Type fragment
  - Type full
  - Sentence guided
  - Sentence free
- Early stages are recognition.
- Middle stages are partial production.
- Late stages are full production.
- Guided sentence stage must visually show the mutable infinitive ending in coral/red.
- Free sentence stage must remove that structural crutch.
- Preview is intentionally easy and serves orientation, not difficulty.

Canonical curriculum rules:
- Only use the verbs/forms/context already in the deck files.
- Do not invent extra vocabulary.
- Keep the 3sg person as one combined cell: `он / она / оно`.
- Treat `просить` as an irregular `я` watchlist item because the canonical 1sg form is `прошу`.
- Do not add perfective future verbs in this pass.
- If the canonical answer uses `ё`, require `ё`.

UI rules that matter:
- Top-level module tabs must be only:
  - 1st Conjugation
  - 2nd Conjugation
- Subdeck pills must switch between the canonical subdecks inside each module.
- Person chips must allow targeting a specific person or all persons.
- Heatmap rows = verbs from the active subdeck.
- Heatmap columns = fixed person order.
- Current target cell must glow.
- Hotter cells must look visually warmer / more urgent.
- The current stage must be visible at all times.

Implementation rule:
- If you are merging this into an existing codebase, preserve the original keyboard app shell and styling conventions. Do not redesign the app into generic flashcards.
- If there is a conflict between old generic assumptions and the attached code/data, the attached code/data wins.

Your job is therefore not to reinvent this feature. Your job is to faithfully implement and, if needed, carefully merge the attached full code and canonical deck files into the app while preserving the keyboard app’s original beauty and structure.
