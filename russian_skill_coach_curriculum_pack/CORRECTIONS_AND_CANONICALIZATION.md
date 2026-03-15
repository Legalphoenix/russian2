# Corrections and canonicalization summary

This document is a human-readable summary of the most important corrections already resolved in the canonical deck files.

## Global rule

If a raw note conflicts with a canonical deck entry, the canonical deck entry wins.

## Key corrections

- **Source**: Future of быть table uses 'Ми'
  - **Canonical**: Мы
  - **Reason**: spelling correction
  - **Source pages**: 9, 30

- **Source**: 'На ужин - for lunch'
  - **Canonical**: На ужин - for dinner
  - **Reason**: translation correction
  - **Source pages**: 12

- **Source**: Page labels 'писать, играть, говорить, любить, помнить, слышать - 1st conjugation'
  - **Canonical**: писать, играть -> 1st conjugation; говорить, любить, помнить, слышать -> 2nd conjugation
  - **Reason**: grammar classification correction
  - **Source pages**: 44

- **Source**: приходю
  - **Canonical**: прихожу
  - **Reason**: correct 1sg present form
  - **Source pages**: 6

- **Source**: слушаещь
  - **Canonical**: слушаешь
  - **Reason**: spelling correction
  - **Source pages**: 46

- **Source**: даем
  - **Canonical**: даём
  - **Reason**: ё restored in paradigm
  - **Source pages**: 46, 47

- **Source**: люб__ / incomplete fill-in entries
  - **Canonical**: люблю, любишь, любит, любим, любите, любят
  - **Reason**: completed from standard paradigm and note intent
  - **Source pages**: 57

- **Source**: A fragment missing subject: 'А обычно слышает твой голос.'
  - **Canonical**: Она обычно слышит твой голос.
  - **Reason**: subject restored so the sentence can be drilled
  - **Source pages**: 6

- **Source**: Some adjective example sentences contain agreement mistakes
  - **Canonical**: Default decks keep the vocabulary but exclude the flawed source sentence or silently correct only when the correction is obvious and uses no extra vocabulary.
  - **Reason**: avoid drilling wrong Russian
  - **Source pages**: 47, 48, 49, 50, 51

## Deferred or hidden content

- **Entry**: The exact sentence 'Обычно он объяснит правило очень понятно.'
  - **Status**: deferred_canonicalized
  - **Reason**: perfective future clashes with usually/adverb of habit
  - **Source pages**: 6
  - **Replacement**: Он объяснит правило очень понятно.

- **Entry**: Pronunciation rules 'unstressed о -> а', 'unstressed е -> и', 'ться = ца'
  - **Status**: reference_only
  - **Reason**: helpful rough guide, but too fuzzy to score as strict right/wrong text atoms
  - **Source pages**: 24

- **Entry**: Ukrainian 'Щo shcho' note
  - **Status**: exclude_from_russian_decks
  - **Reason**: not Russian curriculum content
  - **Source pages**: 10

- **Entry**: Profanity/slang pack
  - **Status**: hidden_opt_in
  - **Reason**: user notes include it, but it should be excluded from default paths and mixed review
  - **Source pages**: 18, 19, 47

- **Entry**: Raw malformed English-side example translations in adjective pages
  - **Status**: correct_or_exclude
  - **Reason**: several English prompt lines and Russian examples mismatch; use the canonicalized phrases in this package instead
  - **Source pages**: 48, 49, 50, 51, 55
