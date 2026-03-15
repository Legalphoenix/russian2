# Russian Skill Coach - canonical curriculum pack

This package is the reviewed source-of-truth content for expanding the existing Russian typing trainer into a multi-module Russian skill coach.

The implementation AI should **not** infer content from the raw PDF notes. It should use the canonicalized decks and rules in this package.

## Read order

1. `READ_FIRST_FOR_CODING_AI.md`
2. `russian_skill_coach_expansion_plan_v2.md`
3. `curriculum_manifest.json`
4. `support/corrections_and_exclusions.json`
5. Relevant files inside `decks/`
6. `support/module_blueprints.json`
7. `support/mixed_review_rules.json`
8. `support/pronunciation_reference.json`

## High-level rules

- Keep the existing Keyboard module behavior. Wrap it in the new shell; do not reinvent it.
- Do not invent new Russian vocabulary outside the reviewed canonicalized content here.
- Do not mix the adult/profanity deck into default flows.
- Do not mix perfective-future reference verbs into normal present-tense 2nd-conjugation drills.
- Treat pronunciation notes as helper/reference only, not as hard scored grammar items.

## Package contents

### Core docs
- `READ_FIRST_FOR_CODING_AI.md` - short implementation brief and non-negotiables.
- `COPY_PASTE_PROMPT_FOR_IMPLEMENTATION_AI.md` - user-ready prompt to hand to the coding AI.
- `russian_skill_coach_expansion_plan_v2.md` - updated implementation plan.
- `deck_catalog.md` - human-readable module / subdeck inventory.
- `curriculum_manifest.json` - machine-readable manifest with stage profiles and module inventory.

### Canonical content
- `decks/first_conjugation.json`
- `decks/second_conjugation.json`
- `decks/past_tense.json`
- `decks/core_patterns.json`
- `decks/days_time_routine.json`
- `decks/descriptions.json`
- `decks/nouns_plurals.json`
- `decks/numbers.json`
- `decks/conversation.json`
- `decks/vocabulary.json`

### Support files
- `support/keyboard_manifest.json`
- `support/mixed_review_rules.json`
- `support/pronunciation_reference.json`
- `support/source_page_index.json`
- `support/corrections_and_exclusions.json`
- `support/module_blueprints.json`

### Schemas
- `schema/module_schema.json`
- `schema/manifest_schema.json`

## Content summary

- **1st Conjugation** (`first_conjugation`): 42 atoms across 2 subdecks
- **2nd Conjugation** (`second_conjugation`): 150 atoms across 3 subdecks
- **Past Tense** (`past_tense`): 64 atoms across 3 subdecks
- **Core Patterns** (`core_patterns`): 13 atoms across 2 subdecks
- **Days + Time + Routine** (`days_time_routine`): 49 atoms across 7 subdecks
- **Descriptions** (`descriptions`): 227 atoms across 4 subdecks
- **Nouns + Plurals** (`nouns_plurals`): 96 atoms across 4 subdecks
- **Numbers** (`numbers`): 30 atoms across 3 subdecks
- **Conversation** (`conversation`): 47 atoms across 6 subdecks
- **Vocabulary** (`vocabulary`): 236 atoms across 10 subdecks

## Default-hidden content

- `sc_perfective_future_reference`
- `vocab_opt_in_slang_profanity`
- `reference_pronunciation`

## Important scope decisions already made

- Numbers are a **closed set** taken from the notes. Do not auto-expand into a full unlimited number generator.
- Countries are preserved through the exact intro phrases from the notes rather than inventing a broader geography deck.
- Several flawed source sentences were corrected or excluded. Always prefer the canonicalized files over the raw notes.
- Adult slang/profanity is preserved because it appears in the notes, but it is hidden and opt-in only.

## Current module count

- 10 new curriculum modules
- 954 canonical atoms
- 44 subdecks
