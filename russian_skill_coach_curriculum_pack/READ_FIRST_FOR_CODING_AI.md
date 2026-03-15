# Read first - implementation brief for the coding AI

You are implementing an expansion of an existing Russian key trainer. The current app already does one thing very well: it isolates a tiny skill, measures **time to correct answer** and **error strikes before success**, then resurfaces weak atoms until they cool down.

That exact learning philosophy must remain intact.

## The core product thesis

This app must **not** become a generic lesson app or a flashcard pile.

It must become a **Russian Skill Coach** built on the same principles that already make the typing trainer effective:

1. one tiny atom at a time  
2. very fast reps  
3. strict scoring  
4. visible improvement  
5. weak spots resurfaced automatically  
6. frictionless resume flow  

The app is basically a gym for Russian micro-skills.

## What is authoritative

Use this priority order:

1. The canonical JSON deck files in `decks/`
2. `curriculum_manifest.json`
3. `support/corrections_and_exclusions.json`
4. `support/module_blueprints.json`
5. `russian_skill_coach_expansion_plan_v2.md`

Do **not** treat the original PDF notes as the source of truth if they conflict with the canonicalized files in this package.

## Non-negotiables

- Preserve the existing Keyboard module behavior and progress model.
- Do not invent new Russian vocabulary outside this package.
- Do not improvise pedagogy. The stage ladder and module behaviors are already specified.
- Count **one wrong click or one wrong submitted answer** as one error strike in non-keyboard modules.
- Do not count every mistyped character as a separate error outside the Keyboard module.
- Keep adult/slang content hidden by default.
- Keep perfective-future reference verbs out of default present-tense 2nd-conjugation flows.
- Treat pronunciation notes as helper/reference only.

## Required app shape

Top-level routes/pages:

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

The Home page must be the launch pad: one big Resume card, module cards with due counts and weak spots, and a Before-class Review shortcut.

## Universal scoring model

Every scored attempt stores:

- time to correct answer
- error strikes before correct answer

This is true across grammar, vocabulary, and conversation.

## Universal stage ladder

Use the stage profiles from `curriculum_manifest.json`.

The core ladder is:

`Preview -> Choose 2 -> Choose 4 -> Full Choice -> Type Fragment -> Type Full -> Sentence Guided -> Sentence Free`

Some modules use shorter variants, but the order must stay recognition-first and production-later.

## Module-specific content rules already decided

- **1st conjugation**: regular core verbs and irregular/stem-change verbs are separate subdecks.
- **2nd conjugation**: exception verbs and perfective-future reference verbs are separated; irregular я-forms are tagged explicitly.
- **Past tense**: user gender must be explicit for я / ты sentence conversions.
- **Core patterns**: `future быть` and `у ... есть` are separate decks.
- **Days/time**: time content is closed to the exact phrases in the notes.
- **Descriptions**: possessives, color agreement, and descriptive adjective agreement are all canonicalized already.
- **Nouns/plurals**: regular, irregular, and invariant nouns are separated.
- **Numbers**: closed set only.
- **Conversation**: fixed canonical phrases and one canonical intro dialogue; not free chat.
- **Vocabulary**: exact lexical packs from the notes only.

## Build order

### Phase 1
- Refactor current app into modular shell / router
- Preserve Keyboard module
- Implement Home page
- Implement 1st Conjugation
- Implement 2nd Conjugation
- Implement Mixed Review plumbing

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

## Data model expectation

The canonical deck JSON files already contain:

- subdecks
- atoms
- reviewed canonical answers
- source page references
- sentence banks where relevant
- module rules and UI signatures

When possible, generate UI and drill behavior from these files rather than hard-coding content.

## When in doubt

If there is a conflict between:
- a raw note,
- a guessed rule,
- and a canonical JSON deck file,

the JSON deck file wins.
