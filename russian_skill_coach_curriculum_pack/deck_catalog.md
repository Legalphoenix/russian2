# Deck catalog

This is a human-readable inventory of the canonical curriculum pack.

## 1st Conjugation (`first_conjugation`)

- Default stage profile: `grammar_full`
- Atom count: 42
- Subdeck count: 2
- UI signature: Six pronoun chips above the prompt card. Central verb card. Heatmap below. Coral highlight for removable infinitive ending / mutable slot during guided stages.

### Regular core 1st-conjugation verbs (`fc_regular_core`)
- Status: active
- Default entry: yes
- Atoms: 30
- Purpose: This is the cleanest 1st-conjugation pattern deck. It excludes stem-change verbs so the user can get pure reps on person-ending retrieval.
- Source pages: 16, 17, 31, 32, 45, 46, 58
- Key rule(s):
  - Preview must show infinitive, translation, pronoun strip, and full paradigm.
  - Choose2/Choose4/FullChoice options must stay inside the same verb only.
  - TypeFragment asks only for the changing ending when the stem is already on screen.

### Irregular / stem-change 1st-conjugation verbs (`fc_irregular_stem_change`)
- Status: active
- Atoms: 12
- Purpose: These verbs break the clean 'just swap the ending' intuition. They need isolated reps so the user can see exactly which irregular verbs are still slow.
- Source pages: 44, 46, 47, 57, 58
- Key rule(s):
  - Never mix these verbs into fc_regular_core until the user explicitly enters mixed review.
  - Preview must explicitly show the stem change or ё-bearing form.
  - The analytics sidebar must surface these separately from regular verbs.

## 2nd Conjugation (`second_conjugation`)

- Default stage profile: `grammar_full`
- Atom count: 150
- Subdeck count: 3
- UI signature: Same pronoun strip as 1st conjugation, plus a compact irregular-я banner whenever the current verb is flagged irregular.

### Core 2nd-conjugation verbs (`sc_regular_core`)
- Status: active
- Default entry: yes
- Atoms: 102
- Purpose: This is the main 2nd-conjugation module. It includes the verbs you clearly practiced in class, but still tags irregular я-forms so the UI can surface them.
- Source pages: 2, 4, 5, 6, 32, 33, 34, 44, 46, 56, 57, 58
- Key rule(s):
  - Choose2/Choose4/FullChoice options must stay inside the same verb paradigm.
  - Whenever the current atom has irregularYa=true, show the irregular-я helper banner in Preview and early Guided stages only.
  - Do not mix perfective-future verbs into this subdeck.

### 2nd-conjugation exception verbs (not plain -ить pattern) (`sc_exception_non_it`)
- Status: active
- Atoms: 18
- Purpose: These verbs are pedagogically important because they are true 2nd-conjugation verbs, but their infinitives do not look like the core -ить pattern.
- Source pages: 17, 33, 34, 56, 57, 58
- Key rule(s):
  - Keep this as a dedicated subdeck so the user can isolate exception verbs.
  - The app must still tag irregular я-forms inside this subdeck when relevant (especially видеть).

### Perfective future reference verbs (advanced / off by default) (`sc_perfective_future_reference`)
- Status: deferred_hidden_by_default
- Atoms: 30
- Purpose: The notes include several perfective verbs whose simple future forms look like 2nd-conjugation present forms. They should be available, but not mixed into present-tense conjugation practice by default.
- Source pages: 4, 5, 6, 7
- Key rule(s):
  - This deck must be opt-in.
  - Label every card as simple future / perfective reference.
  - Do not include these atoms in default mixed review.

## Past Tense (`past_tense`)

- Default stage profile: `grammar_full`
- Atom count: 64
- Subdeck count: 3
- UI signature: Four gender/number chips (masc, fem, neut, plural) across the top. For я/ты sentences, show a user gender badge or explicit gender selector.

### Core past-tense transformations (`pt_core_transformations`)
- Status: active
- Default entry: yes
- Atoms: 40
- Purpose: This is the main present-to-past conversion deck using the verbs that already appeared in the homework and sentence practice.
- Source pages: 2, 30
- Key rule(s):
  - Start by drilling past-tense endings in isolation, then full forms, then sentence conversion.
  - For sentence conversion, keep every other word fixed and require only the target verb to change.

### Movement / arrival verbs in the past (`pt_movement_and_arrival`)
- Status: active
- Atoms: 16
- Purpose: Movement verbs deserve their own compact pack because they appear in the notes and are easy to confuse with the present-tense movement subdecks.
- Source pages: 2, 10, 30

### Special verbs: быть and есть (`pt_be_and_eat`)
- Status: active
- Atoms: 8
- Purpose: These are core past-tense forms from the notes and should be visible as their own small, high-frequency deck.
- Source pages: 9, 10, 30

## Core Patterns (`core_patterns`)

- Default stage profile: `grammar_full`
- Atom count: 13
- Subdeck count: 2
- UI signature: Frame-builder layout. The stable frame is neutral ink; the changing slot is coral during guided stages.

### Future of быть (`cp_future_byt`)
- Status: active
- Default entry: yes
- Atoms: 6
- Purpose: The future of быть is a tiny, foundational frame and should get pure reps just like a keyboard key gets pure reps.
- Source pages: 9, 30
- Key rule(s):
  - Start with pronoun -> future form.
  - Then move to sentence frames like 'Я буду дома.'
  - Keep the rest of the sentence visually stable so only the auxiliary changes.

### У ... есть (`cp_u_est`)
- Status: active
- Atoms: 7
- Purpose: This frame is foundational and highly reusable, but it is not just another conjugation deck. It should be treated as a slot-based pattern.
- Source pages: 34, 35
- Key rule(s):
  - Stage 1-3 drill only the owner phrase (у меня есть, у тебя есть, etc.).
  - Only after the owner phrase stabilizes should nouns be mixed in.
  - Guided sentence mode must keep the noun fixed and only change the owner frame.

## Days + Time + Routine (`days_time_routine`)

- Default stage profile: `grammar_full`
- Atom count: 49
- Subdeck count: 7
- UI signature: Week strip for days, tile board for time phrases, compact routine sentence card for daily-life lines.

### Days of the week (`dtr_day_names`)
- Status: active
- Default entry: yes
- Atoms: 7
- Purpose: Bare day names should be automatic before the on-day prepositional forms are mixed in.
- Source pages: 2, 15, 16

### On-day forms (в / во + day) (`dtr_on_day_forms`)
- Status: active
- Atoms: 7
- Purpose: The on-day forms are their own tiny target, especially 'во вторник'.
- Source pages: 2, 15, 16
- Key rule(s):
  - Keep bare day names and on-day forms separate at first.
  - во вторник must be drilled explicitly; do not assume the app can infer it from bare day recognition.

### Frequency words (`dtr_frequency_words`)
- Status: active
- Atoms: 7
- Source pages: 3, 17

### Parts of day / routine time windows (`dtr_parts_of_day`)
- Status: active
- Atoms: 5
- Source pages: 2, 12, 44

### Meals and meal phrases (`dtr_meals`)
- Status: active
- Atoms: 9
- Source pages: 9, 12

### Closed-set time phrases (`dtr_time_phrases`)
- Status: active
- Atoms: 9
- Purpose: This page should stay closed to the exact time/telling-time phrases from the notes. Do not extrapolate beyond them.
- Source pages: 11, 12, 14

### Short routine phrases (`dtr_routine_phrases`)
- Status: active
- Atoms: 5
- Source pages: 6, 9, 10, 12, 16

## Descriptions (`descriptions`)

- Default stage profile: `grammar_full`
- Atom count: 227
- Subdeck count: 4
- UI signature: Agreement matrix (masc, fem, neut, plural) pinned above the practice card. Noun gender badge visible early, hidden later.

### Possessive pronouns (`desc_possessives`)
- Status: active
- Default entry: yes
- Atoms: 28
- Purpose: The owner forms should be drilled alone before they are mixed with adjective agreement.
- Source pages: 35, 36, 51, 52

### Colors with full agreement (`desc_colors`)
- Status: active
- Atoms: 48
- Purpose: Color adjectives were covered heavily and need their own agreement deck.
- Source pages: 19, 21, 36, 37, 52, 53

### Descriptive adjective pairs (`desc_qualities`)
- Status: active
- Atoms: 108
- Purpose: These are the high-frequency descriptive adjectives from the notes, grouped for agreement practice and noun-phrase building.
- Source pages: 21, 22, 47, 48, 49, 50, 51, 55

### Description phrase builder (`desc_phrase_builder`)
- Status: active
- Atoms: 43
- Purpose: Once forms are stable, the user needs phrase-level reps that combine possessives, adjective agreement, and noun gender in one phrase.
- Source pages: 19, 21, 47, 48, 49, 50, 51, 52, 53

## Nouns + Plurals (`nouns_plurals`)

- Default stage profile: `grammar_full`
- Atom count: 96
- Subdeck count: 4
- UI signature: Rule-group board with compact badges for gender and plural type.

### Foundation noun gender deck (`np_gender_foundation`)
- Status: active
- Default entry: yes
- Atoms: 31
- Purpose: These are the noun/gender items explicitly listed together in the notes and form the best foundation for gender reps.
- Source pages: 37, 38, 39

### Regular plural patterns (`np_regular_plurals`)
- Status: active
- Atoms: 33
- Purpose: This subdeck trains the normal plural rules before the user faces irregular endings.
- Source pages: 37, 38, 39, 40

### Irregular plural watchlist (`np_irregular_plurals`)
- Status: active
- Atoms: 24
- Purpose: Irregular plurals must be isolated so the user can see exactly which nouns still need reps.
- Source pages: 38, 41, 42

### Invariant nouns (`np_invariant_nouns`)
- Status: active
- Atoms: 8
- Purpose: These nouns keep the same form in singular and plural and should be drilled as their own tiny category.
- Source pages: 42

## Numbers (`numbers`)

- Default stage profile: `numbers_closed_set`
- Atom count: 30
- Subdeck count: 3
- UI signature: Large digit card on the left, Russian phrase on the right, with age-context mini-cards below.

### Closed-set cardinal numbers from the notes (`num_closed_set`)
- Status: active
- Default entry: yes
- Atoms: 23
- Purpose: The notes show a specific set of numbers rather than a full number curriculum. Keep the implementation honest and closed-set.
- Source pages: 26, 27

### First three ordinals (`num_ordinals`)
- Status: active
- Atoms: 3
- Source pages: 13, 15

### Age phrases from the intro dialogue (`num_age_phrases`)
- Status: active
- Atoms: 4
- Source pages: 3, 25, 27

## Conversation (`conversation`)

- Default stage profile: `conversation_fixed`
- Atom count: 47
- Subdeck count: 6
- UI signature: Chat-bubble style practice card with alternating left/right alignment in dialogue modes.

### Greetings (`conv_greetings`)
- Status: active
- Default entry: yes
- Atoms: 5
- Source pages: 24, 27, 28

### How-are-you lines (`conv_how_are_you`)
- Status: active
- Atoms: 10
- Source pages: 24, 25, 27

### Identity / age / origin / residence (`conv_identity`)
- Status: active
- Atoms: 17
- Source pages: 25, 27, 28

### Goodbyes (`conv_goodbyes`)
- Status: active
- Atoms: 4
- Source pages: 25, 28

### Feelings / health phrases (`conv_feelings_health`)
- Status: active
- Atoms: 10
- Source pages: 23

### Canonical intro dialogue (`conv_fixed_dialogue`)
- Status: active
- Atoms: 1
- Purpose: This gives the app a closed, ordered dialogue for ordering drills and roleplay mode.
- Source pages: 27, 28

## Vocabulary (`vocabulary`)

- Default stage profile: `vocab_basic`
- Atom count: 236
- Subdeck count: 10
- UI signature: Pack chips across the top, simple word card in the middle, optional phrase strip below for phraseGuided stage.

### Verb meanings (`vocab_verbs_meanings_core`)
- Status: active
- Default entry: yes
- Atoms: 36
- Source pages: 2, 4, 5, 7, 9, 10, 11, 12, 17, 30, 31, 32, 33, 46, 57

### Family + people (`vocab_family_people`)
- Status: active
- Atoms: 27
- Source pages: 6, 13, 21, 37, 38, 39, 40, 41, 48, 55

### Animals + pets (`vocab_animals_pets`)
- Status: active
- Atoms: 14
- Source pages: 13, 37, 38, 48, 49, 53, 55

### Clothes + accessories (`vocab_clothes_accessories`)
- Status: active
- Atoms: 20
- Source pages: 19, 20, 21, 37, 39, 44, 47, 49, 50, 53, 55

### Food + drink + meals (`vocab_food_drink_meals`)
- Status: active
- Atoms: 21
- Source pages: 9, 10, 12, 36, 37, 38, 39, 42, 44, 50, 53

### Places + objects (`vocab_places_objects`)
- Status: active
- Atoms: 51
- Source pages: 2, 3, 4, 5, 9, 11, 12, 17, 18, 25, 32, 37, 38, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 55

### Identity / country phrases (`vocab_identity_country_phrases`)
- Status: active
- Atoms: 6
- Source pages: 25, 27, 28

### Question words + connectors + misc (`vocab_questions_connectors_misc`)
- Status: active
- Atoms: 41
- Source pages: 9, 10, 11, 12, 13, 14, 18, 19, 21, 22, 23, 35, 41, 44, 46, 58

### Feelings + health (`vocab_feelings_health`)
- Status: active
- Atoms: 10
- Source pages: 23, 24, 25

### Opt-in slang / profanity (`vocab_opt_in_slang_profanity`)
- Status: deferred_hidden_by_default
- Atoms: 10
- Source pages: 18, 19, 47
