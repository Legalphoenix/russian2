# Russian Skill Coach expansion plan v2

This plan supersedes any earlier plain-English summary. It is written so that an implementation AI can build the product without making pedagogical decisions on its own.

The curriculum itself lives in the JSON deck files in this package. This document explains **how** the app must behave and **how** those deck files must be used.

---

## 1. Product thesis

The existing app works because it is brutally specific.

It does **not** try to “teach Russian” in a vague, lesson-like way. It isolates one tiny target, measures the time it takes to get it right, counts the mistakes, and resurfaces weak targets until they stop being weak.

That is why the expansion must not become a generic course app, a flashcard wall, or a mini-Duolingo clone.

The correct move is:

**turn the current key trainer into a general Russian micro-skill engine.**

The same loop that works for Cyrillic key selection must drive:

- conjugation
- past tense
- fixed grammar frames
- adjective agreement
- possessive pronouns
- plural formation
- time expressions
- conversation lines
- vocabulary packs

The user should feel that every page is the same machine aimed at a different Russian atom.

---

## 2. What must be preserved from the current app

The current app already has the right spine. Preserve these traits and generalize them:

- one target at a time
- timer until correct
- wrong attempts counted before success
- adaptive resurfacing of weak items
- lifetime and recent analytics
- warm premium UI, low-friction start/resume
- persistence that survives refreshes and device changes
- import/export/reset semantics
- conflict-safe server sync

Do **not** let new modules dilute those strengths.

---

## 3. Content boundary and canonicalization

The content boundary is closed to the tutor notes in `Jon Russian (3).pdf`.

However, the raw notes are noisy. They contain:

- typos
- malformed examples
- mixed or incomplete paradigms
- some misclassified verbs
- some example sentences that are grammatically wrong or pedagogically confusing

Therefore the app must use a **canonical curriculum layer**, not the raw note text.

This package already contains that canonical layer.

### 3.1 Canonicalization policy

When there is a conflict between the raw note and the canonical JSON deck file:

**the canonical JSON wins.**

Use `support/corrections_and_exclusions.json` for the important corrections and hidden/deferred content.

### 3.2 Scope decisions already made

The following decisions are already resolved and must not be reopened by the implementation AI:

- The keyboard trainer stays.
- Numbers are a **closed set**, not an open generator.
- Pronunciation notes are helper/reference only.
- Adult/slang content is preserved but hidden and opt-in only.
- Perfective future reference verbs are preserved but must stay out of default present-tense 2nd-conjugation flows.
- Countries are represented through the exact intro phrases from the notes rather than a larger geography system.

---

## 4. Global information architecture

Top-level routes:

1. Home
2. Keyboard
3. 1st Conjugation
4. 2nd Conjugation
5. Past Tense
6. Core Patterns
7. Days + Time + Routine
8. Descriptions
9. Nouns + Plurals
10. Numbers
11. Conversation
12. Vocabulary
13. Mixed Review

### 4.1 Home page

The Home page must be the real launch pad.

It must contain:

- a large Continue card with last module, last subdeck, current stage, due count, and Resume button
- a module grid with due count, coverage, weak spot, and tiny trend indicator
- a Before-class Review card that launches a short mixed review
- a global weak-spots list across the app

The user should be able to open the app and be practicing within a few seconds.

---

## 5. The universal pedagogy model

This section is non-negotiable.

### 5.1 Everything is built from atoms

Every module trains **atoms**, not vague lesson states.

Examples:

- keyboard: `ж`
- 1st conjugation: `читать + ты -> читаешь`
- 2nd conjugation: `любить + я -> люблю`
- past tense: `работать + fem -> работала`
- future pattern: `быть + мы -> будем`
- possessive: `я + neut -> моё`
- adjective agreement: `синий + fem -> синяя`
- plural: `друг -> друзья`
- number: `109 -> сто девять`
- conversation: `Как тебя зовут? -> Меня зовут ...`

Progress, weakness, and resurfacing must all be tracked at the atom level.

### 5.2 Universal scoring

Every scored attempt stores:

- `timeToCorrectMs`
- `errorStrikesBeforeCorrect`

For non-keyboard modules:

- one wrong click = one error strike
- one wrong submitted fragment = one error strike
- one wrong submitted full answer = one error strike

Do **not** count individual mistyped characters as separate strikes outside the Keyboard module.

### 5.3 Universal stage direction

The app must move from recognition to production.

The main ladder is:

`Preview -> Choose 2 -> Choose 4 -> Full Choice -> Type Fragment -> Type Full -> Sentence Guided -> Sentence Free`

Some modules use shorter variants, but the order must remain the same: easiest recognition first, open production later.

Use the exact stage profiles already defined in `curriculum_manifest.json`.

### 5.4 Progression thresholds

Use the stage thresholds in `curriculum_manifest.json`.

These thresholds are already specified and must not be invented ad hoc by the implementation AI.

### 5.5 The “guided red” rule

In early sentence application stages, the mutable word or removable letters must be visually obvious.

Use coral/red to mark:

- the infinitive letters being replaced
- the mutable slot in a fixed frame
- the adjective/possessive fragment being changed

Later stages must remove that scaffold.

This is central to the N+1 philosophy: at first the app points very explicitly to what changes, later the learner finds it alone.

---

## 6. Adaptive resurfacing

The resurfacing engine should generalize the current keyboard logic.

Each atom should have a difficulty score based on:

- smoothed average time
- smoothed average errors
- novelty / low exposure
- recency / time since last seen
- stage-specific weakness

Difficult atoms must reappear more often, but immediate repeats should be dampened.

For mixed review, difficulty must be normalized within each module before cross-module ranking so that slow sentence tasks do not always dominate simple noun cards.

---

## 7. UI system

The app should remain visually coherent with the current design language:

- warm cream / mint / coral / sand palette
- premium serif or refined display headings
- glass-card feel
- clean hierarchy
- spacious central practice card
- subtle motion only

### 7.1 Shared page layout

Every practice page should keep the same broad structure:

- top summary strip
- central practice card
- side analytics card
- lower heatmap/list area

### 7.2 Shared practice card elements

Every module’s practice card should show:

- module / subdeck label
- stage label
- prompt
- answer area
- live timer
- error-strike count
- streak
- one-line feedback
- optional structural hint area

### 7.3 Feedback style

Wrong answer:

- quick shake or soft red flash
- error strike increments
- prompt remains

Correct answer:

- mint success flash
- success microcopy
- smooth transition to next atom

No noisy gamification. The satisfaction comes from the stats cooling down and the hot cells disappearing.

---

## 8. Required architecture

The implementation AI should not keep stuffing logic into one giant `app.js`.

Refactor into something like:

- app shell / routing
- shared practice engine
- progress store + sync layer
- analytics utilities
- module renderers
- curriculum loader
- reusable controls (choice row, typed fragment input, pronoun strip, heatmap, stats cards)

The current progress model should evolve into a multi-module schema while preserving the keyboard data inside a dedicated `keyboard` module namespace.

---

## 9. Module-by-module behavior

This is the behavioral layer. The actual content atoms live in the JSON deck files.

### 9.1 Keyboard

Preserve the current trainer. Move it into the shared shell and route structure, but keep its core pedagogy intact.

Source file: `support/keyboard_manifest.json`

### 9.2 1st Conjugation

Source file: `decks/first_conjugation.json`

Must include:

- pronoun strip: я / ты / он-она-оно / мы / вы / они
- heatmap: verb x person
- separate subdecks for regular core verbs and irregular/stem-change verbs

Important rule:

Do **not** mix `писать` or `давать` into the regular core deck until mixed review or explicit subdeck selection.

Choice stages must stay inside a single verb paradigm. The learner should first solve “which person form is this verb?” before solving broader cross-verb discrimination.

### 9.3 2nd Conjugation

Source file: `decks/second_conjugation.json`

Must include:

- same pronoun strip and heatmap model as 1st conjugation
- explicit tagging of irregular `я` forms
- exception-verb subdeck
- deferred hidden subdeck for perfective future reference verbs

Important rule:

The app must surface an irregular-`я` watchlist panel in analytics so the learner can see which 1st-person singular forms are still slow.

### 9.4 Past Tense

Source file: `decks/past_tense.json`

Must include:

- gender/number strip: masc / fem / neut / plural
- heatmap: verb x gender-number
- explicit user-gender handling for `я` / `ты` sentence conversions
- dedicated subdeck for special verbs `быть` and `есть`

Important rule:

Never force the learner to guess an unstated speaker gender.

### 9.5 Core Patterns

Source file: `decks/core_patterns.json`

Two separate subdecks:

- future of `быть`
- `у ... есть`

UI should look like a frame-builder rather than a plain conjugation page.

Early reps should stabilize the changing slot first before nouns or sentence context are added.

### 9.6 Days + Time + Routine

Source file: `decks/days_time_routine.json`

Must include separate subdecks for:

- day names
- on-day forms
- frequency words
- parts of day
- meals
- closed-set time phrases
- short routine phrases

Important rule:

Do **not** infer a full time-telling system beyond the canonical phrase set in the deck file.

### 9.7 Descriptions

Source file: `decks/descriptions.json`

Must include:

- possessive pronouns
- colors with full agreement
- descriptive adjective pairs
- phrase builder

UI should display an agreement matrix.

Important rule:

Invariant possessives (`его`, `её`, `их`) must be explicitly shown as invariant across all noun contexts.

### 9.8 Nouns + Plurals

Source file: `decks/nouns_plurals.json`

Must include separate subdecks for:

- gender foundation nouns
- regular plurals
- irregular plurals
- invariant nouns

Important rule:

Irregular plurals must remain isolated so the learner can see exactly which nouns are causing trouble.

### 9.9 Numbers

Source file: `decks/numbers.json`

Must include:

- closed-set cardinals
- first three ordinals
- age phrases

Important rule:

Do **not** generate unseen numbers. The deck is intentionally closed-set.

### 9.10 Conversation

Source file: `decks/conversation.json`

Must include:

- greetings
- how-are-you lines
- identity / age / origin / residence
- goodbyes
- feelings / health
- one canonical intro dialogue

Important rule:

This is not open-ended chat. It is retrieval practice for exact lines and exact dialogue order.

### 9.11 Vocabulary

Source file: `decks/vocabulary.json`

Must include semantic packs from the notes only:

- verb meanings
- family / people
- animals / pets
- clothes / accessories
- food / drink / meals
- places / objects
- identity / country phrases
- question words / connectors / misc
- feelings / health
- opt-in slang / profanity

Important rule:

Keep the packs semantically tight in early stages. Do not throw random categories together.

### 9.12 Mixed Review

Source file: `support/mixed_review_rules.json`

Three required modes:

- Before class
- Weakest 20
- Production Mix

Important rule:

Mixed Review never introduces new atoms. It only draws from atoms already seen in their home modules.

---

## 10. Analytics requirements

Each module needs a heatmap or equivalent weak-spot view.

Examples:

- 1st conjugation: verb x person
- 2nd conjugation: verb x person + irregular-ya watchlist
- past tense: verb x gender-number
- descriptions: lemma x gender-number
- plurals: noun x plural rule group
- numbers: number x stage
- conversation: phrase family x stage

Every module page should also show:

- session attempts
- session clean-rate
- session average time
- session average errors
- lifetime average time
- lifetime average errors
- weakest items list

---

## 11. Content package usage

This implementation must be data-driven.

The deck files already include:

- reviewed atoms
- subdeck boundaries
- sentence banks
- source-page traceability
- module-level UI signatures
- subdeck teaching notes

The implementation AI should not hard-code specific Russian content into the component logic when it can load it from the curriculum files.

### 11.1 What to load first

At app startup, load:

- `curriculum_manifest.json`
- relevant module file on demand
- `support/module_blueprints.json`
- `support/mixed_review_rules.json`

### 11.2 What to never use raw

Do not parse the PDF at runtime. The canonical JSON files already solved the content cleanup problem.

---

## 12. Default hidden / deferred content

These items must exist but remain hidden or excluded from default mixed review:

- `sc_perfective_future_reference`
- `vocab_opt_in_slang_profanity`
- `reference_pronunciation`

The user can opt into them later.

---

## 13. Implementation phases

### Phase 1
- shared shell and router
- keyboard preserved
- Home page
- 1st Conjugation
- 2nd Conjugation
- mixed-review plumbing

### Phase 2
- Past Tense
- Core Patterns
- Days + Time + Routine
- Descriptions

### Phase 3
- Nouns + Plurals
- Numbers
- Conversation
- Vocabulary

---

## 14. Acceptance criteria

The implementation is only acceptable if all of the following are true:

1. The user can open the app and resume practice immediately.
2. Every module feels like the same underlying rep engine.
3. Weak spots are visible at atom level.
4. Stage progression is measurable and consistent.
5. The content stays inside the reviewed canonical curriculum.
6. The UI remains premium, clear, and low-friction.
7. The keyboard trainer remains intact as a first-class module.
8. The app never quietly teaches raw note mistakes.

---

## 15. Final implementation instruction

When the implementation AI is tempted to “be helpful” by inventing new vocabulary, new grammar, or a looser pedagogy, it must stop and use the canonical files in this package instead.

The whole point of this product is precision:

- precise content scope
- precise atoms
- precise measurement
- precise weak-spot visibility
- precise iteration
