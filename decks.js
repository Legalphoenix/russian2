window.CONJUGATION_SHARED_CONFIG = {
  "version": 1,
  "title": "Russian Skill Coach Tight Conjugation Pack",
  "scope": "Only first and second conjugation present-tense modules.",
  "nonNegotiables": [
    "Everything is trained at atom level: one verb + one person + one exact canonical answer.",
    "Every scored attempt stores timeToCorrectMs and errorStrikesBeforeCorrect.",
    "Outside the Keyboard module, one wrong click or one wrong submitted answer equals one error strike. Do not count each mistyped character.",
    "Do not introduce vocabulary beyond what appears in the deck files.",
    "Do not mix irregular decks into regular decks by default.",
    "Do not implement perfective-future reference verbs in this pass. This pack is present tense only.",
    "Use the deck files as the source of truth for content. Do not infer new Russian forms beyond those files."
  ],
  "persons": [
    {
      "id": "1sg",
      "pronoun": "я",
      "label": "I"
    },
    {
      "id": "2sg",
      "pronoun": "ты",
      "label": "you (singular, informal)"
    },
    {
      "id": "3sg",
      "pronoun": "он / она / оно",
      "label": "he / she / it"
    },
    {
      "id": "1pl",
      "pronoun": "мы",
      "label": "we"
    },
    {
      "id": "2pl",
      "pronoun": "вы",
      "label": "you (plural or formal)"
    },
    {
      "id": "3pl",
      "pronoun": "они",
      "label": "they"
    }
  ],
  "personOrder": [
    "1sg",
    "2sg",
    "3sg",
    "1pl",
    "2pl",
    "3pl"
  ],
  "confusionPriority": {
    "1sg": [
      "2sg",
      "1pl",
      "3pl",
      "3sg",
      "2pl"
    ],
    "2sg": [
      "3sg",
      "1sg",
      "2pl",
      "3pl",
      "1pl"
    ],
    "3sg": [
      "2sg",
      "3pl",
      "1pl",
      "1sg",
      "2pl"
    ],
    "1pl": [
      "2pl",
      "1sg",
      "3pl",
      "3sg",
      "2sg"
    ],
    "2pl": [
      "1pl",
      "2sg",
      "3pl",
      "3sg",
      "1sg"
    ],
    "3pl": [
      "3sg",
      "1pl",
      "2pl",
      "2sg",
      "1sg"
    ]
  },
  "atomIdPattern": "<moduleId>__<subdeckId>__<verbId>__<personId>",
  "stageProfiles": {
    "grammar_full": {
      "sequence": [
        "preview",
        "choose2",
        "choose4",
        "fullChoice",
        "typeFragment",
        "typeFull",
        "sentenceGuided",
        "sentenceFree"
      ],
      "unlockRules": {
        "preview_to_choose2": {
          "minCorrect": 2
        },
        "choose2_to_choose4": {
          "minCorrect": 4,
          "maxRecentAvgErrors": 0.25,
          "maxRecentAvgTimeMs": 2200
        },
        "choose4_to_fullChoice": {
          "minCorrect": 5,
          "maxRecentAvgErrors": 0.4,
          "maxRecentAvgTimeMs": 2800
        },
        "fullChoice_to_typeFragment": {
          "minCorrect": 6,
          "maxRecentAvgErrors": 0.5,
          "maxRecentAvgTimeMs": 3400
        },
        "typeFragment_to_typeFull": {
          "minCorrect": 5,
          "maxRecentAvgErrors": 0.5,
          "maxRecentAvgTimeMs": 3200
        },
        "typeFull_to_sentenceGuided": {
          "minCorrect": 5,
          "maxRecentAvgErrors": 0.6,
          "maxRecentAvgTimeMs": 4300
        },
        "sentenceGuided_to_sentenceFree": {
          "minCorrect": 4,
          "maxRecentAvgErrors": 0.75,
          "maxRecentAvgTimeMs": 5500
        },
        "sentenceFree_mastered": {
          "minCorrect": 4,
          "maxRecentAvgErrors": 0.75,
          "maxRecentAvgTimeMs": 7000
        }
      },
      "uiCues": {
        "preview": "Show full paradigm and the exact target cell. User taps the highlighted correct form to continue. Count as correct with 0 errors.",
        "choose2": "Exactly 2 options. The distractor must come from the same verb only.",
        "choose4": "Exactly 4 options. Distractors must come from the same verb only and follow confusionPriority.",
        "fullChoice": "Show all 6 forms of the same verb. The user clicks the correct one.",
        "typeFragment": "Show fragmentBaseByPerson and require only the remaining tail fragment. Compare exact canonical text.",
        "typeFull": "User types the full Russian form exactly.",
        "sentenceGuided": "Show pronoun chip plus a context frame. Put the infinitive or mutable form in a coral/red pill so the changing part is visually obvious.",
        "sentenceFree": "Show pronoun chip plus the context frame with a blank verb slot. No structural coloring before the answer."
      }
    }
  },
  "attemptScoring": {
    "measurements": [
      "timeToCorrectMs",
      "errorStrikesBeforeCorrect"
    ],
    "typedStages": {
      "submissionModel": "submission level",
      "rule": "One wrong submitted fragment or one wrong submitted full answer = one error strike. Do not increment per character."
    },
    "specialCases": {
      "yoRequired": "If canonical answer contains ё, require ё. If the learner enters е instead, mark wrong and show a hint that this form uses ё."
    }
  },
  "resumeSelection": {
    "description": "Use current keyboard-style weighted resurfacing, generalized to atoms. If reusing the existing weighting is hard, use the fallback formula below.",
    "fallbackFormula": {
      "weakness": "0.45 * clamp(avgTimeForCurrentStage / targetTimeForCurrentStage, 0, 2) + 0.35 * clamp(avgErrorsForCurrentStage / maxAllowedErrorsForCurrentStage, 0, 2) + 0.20 * (1 - min(totalAttempts / 8, 1))",
      "recencyBoost": "min(hoursSinceLastSeen / 72, 1) * 0.35",
      "newnessBoost": "0.40 if totalAttempts == 0 else 0",
      "immediateRepeatPenalty": "0.60 if seen within the last 5 prompts else 0",
      "score": "weakness + recencyBoost + newnessBoost - immediateRepeatPenalty",
      "pickRule": "Compute score for all eligible atoms in the active module/subdeck. Sort descending. Weighted-random pick from the top 8."
    },
    "targetTimeByStageMs": {
      "preview": 1800,
      "choose2": 2200,
      "choose4": 2800,
      "fullChoice": 3400,
      "typeFragment": 3200,
      "typeFull": 4300,
      "sentenceGuided": 5500,
      "sentenceFree": 7000
    }
  },
  "answerNormalization": {
    "trimWhitespace": true,
    "caseInsensitiveForCyrillic": true,
    "stripTrailingPeriod": true,
    "doNotNormalizeYoToYe": true
  },
  "moduleUiRules": {
    "shared": [
      "Keep the warm cream / mint / coral / sand palette and glass-card feeling of the current app.",
      "Keep a top summary strip, a central practice card, a right analytics card, and a lower heatmap/list area.",
      "The practice card must always show module/subdeck label, stage label, prompt, timer, error strikes, streak, and one-line feedback.",
      "Use coral/red for removable letters and mutable slots. Use mint for correct feedback."
    ],
    "first_conjugation": [
      "Top of page: six pronoun chips in fixed person order.",
      "Bottom analytics: verb x person heatmap.",
      "Sidebar: weakest verbs, weakest persons, separate irregular watchlist for писать and давать."
    ],
    "second_conjugation": [
      "Top of page: six pronoun chips in fixed person order.",
      "Bottom analytics: verb x person heatmap.",
      "Sidebar: irregular я watchlist and exception-verb watchlist.",
      "Whenever the current verb has showIrregularYaBanner=true, show a compact helper banner in Preview and the first two Guided attempts only. Hide it after that."
    ]
  },
  "implementationNotes": [
    "The 3sg pronoun label stays as one combined chip: он / она / оно. The form is the same, so do not split this into three separate atoms.",
    "For sentence stages, render a pronoun chip above the context frame instead of forcing fully personalized subject words into every sentence.",
    "Context frames are intentionally lightweight so they stay reusable across persons without introducing new vocabulary."
  ],
  "canonicalCorrections": [
    "Treat просить as an irregular я-form watchlist item because the canonical 1sg form is прошу.",
    "Do not implement perfective future reference verbs in this tightened pass.",
    "Keep смотреть in the core second-conjugation deck for this user-facing module even though its infinitive is not -ить. The goal is fluent retrieval, not textbook taxonomy."
  ]
};

window.FIRST_CONJUGATION_DECK = {
  "moduleId": "first_conjugation",
  "title": "1st Conjugation",
  "purpose": "Train present-tense 1st-conjugation verbs as tiny measurable atoms.",
  "defaultStageProfileId": "grammar_full",
  "heatmap": "verb x person",
  "referenceEndings": {
    "1sg": "-ю / -у",
    "2sg": "-ешь",
    "3sg": "-ет",
    "1pl": "-ем",
    "2pl": "-ете",
    "3pl": "-ют / -ут"
  },
  "subdecks": [
    {
      "id": "fc_regular_core",
      "title": "Regular core 1st-conjugation verbs",
      "defaultEntry": true,
      "mixIntoDefaultResume": true,
      "status": "active",
      "whyThisExists": "Pure ending reps without major stem-change noise.",
      "teachingRules": [
        "Preview shows infinitive split, translation, pronoun strip, and the full six-cell paradigm.",
        "Choose2 / Choose4 / FullChoice options must come only from the same verb.",
        "TypeFragment asks only for the tail fragment after the provided base.",
        "SentenceGuided highlights the mutable verb slot in coral/red."
      ],
      "verbs": [
        {
          "id": "rabotat",
          "lemma": "работать",
          "translation": "to work",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "работа",
            "mutable": "ть"
          },
          "fragmentBaseByPerson": {
            "1sg": "работа",
            "2sg": "работа",
            "3sg": "работа",
            "1pl": "работа",
            "2pl": "работа",
            "3pl": "работа"
          },
          "forms": {
            "1sg": "работаю",
            "2sg": "работаешь",
            "3sg": "работает",
            "1pl": "работаем",
            "2pl": "работаете",
            "3pl": "работают"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "дома",
              "beforeVerbEn": "",
              "afterVerbEn": "at home"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "в школе",
              "beforeVerbEn": "",
              "afterVerbEn": "at school"
            },
            {
              "beforeVerbRu": "обычно",
              "afterVerbRu": "до шести вечера",
              "beforeVerbEn": "usually",
              "afterVerbEn": "until six in the evening"
            }
          ],
          "coachNote": "Regular 1st conjugation. Remove -ть, then add the person ending.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Я работаю в понедельник.",
              "en": "I work on Monday."
            },
            {
              "ru": "Я никогда не работаю дома.",
              "en": "I never work at home."
            },
            {
              "ru": "Я работаю в школе до вечера.",
              "en": "I work at school until evening."
            },
            {
              "ru": "В понедельник я обычно работаю до шести вечера.",
              "en": "On Monday I usually work until six in the evening."
            }
          ],
          "tags": [
            "first",
            "regular"
          ]
        },
        {
          "id": "gulyat",
          "lemma": "гулять",
          "translation": "to walk / go for a walk",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "гуля",
            "mutable": "ть"
          },
          "fragmentBaseByPerson": {
            "1sg": "гуля",
            "2sg": "гуля",
            "3sg": "гуля",
            "1pl": "гуля",
            "2pl": "гуля",
            "3pl": "гуля"
          },
          "forms": {
            "1sg": "гуляю",
            "2sg": "гуляешь",
            "3sg": "гуляет",
            "1pl": "гуляем",
            "2pl": "гуляете",
            "3pl": "гуляют"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "в парке",
              "beforeVerbEn": "",
              "afterVerbEn": "in the park"
            },
            {
              "beforeVerbRu": "часто",
              "afterVerbRu": "после уроков",
              "beforeVerbEn": "often",
              "afterVerbEn": "after classes"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "по центру города",
              "beforeVerbEn": "",
              "afterVerbEn": "around the city center"
            }
          ],
          "coachNote": "Regular 1st conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Мы гуляем в парке в понедельник вечером.",
              "en": "We walk in the park on Monday evening."
            },
            {
              "ru": "В пятницу они гуляют по центру города.",
              "en": "On Friday they walk around the city center."
            }
          ],
          "tags": [
            "first",
            "regular"
          ]
        },
        {
          "id": "chitat",
          "lemma": "читать",
          "translation": "to read",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "чита",
            "mutable": "ть"
          },
          "fragmentBaseByPerson": {
            "1sg": "чита",
            "2sg": "чита",
            "3sg": "чита",
            "1pl": "чита",
            "2pl": "чита",
            "3pl": "чита"
          },
          "forms": {
            "1sg": "читаю",
            "2sg": "читаешь",
            "3sg": "читает",
            "1pl": "читаем",
            "2pl": "читаете",
            "3pl": "читают"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "интересную книгу",
              "beforeVerbEn": "",
              "afterVerbEn": "an interesting book"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "новости по утрам",
              "beforeVerbEn": "",
              "afterVerbEn": "the news in the mornings"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "газету",
              "beforeVerbEn": "",
              "afterVerbEn": "the newspaper"
            }
          ],
          "coachNote": "Regular 1st conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Во вторник она иногда читает интересную книгу.",
              "en": "On Tuesday she sometimes reads an interesting book."
            },
            {
              "ru": "Ты читаешь новости по утрам.",
              "en": "You read the news in the mornings."
            }
          ],
          "tags": [
            "first",
            "regular"
          ]
        },
        {
          "id": "slushat",
          "lemma": "слушать",
          "translation": "to listen",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "слуша",
            "mutable": "ть"
          },
          "fragmentBaseByPerson": {
            "1sg": "слуша",
            "2sg": "слуша",
            "3sg": "слуша",
            "1pl": "слуша",
            "2pl": "слуша",
            "3pl": "слуша"
          },
          "forms": {
            "1sg": "слушаю",
            "2sg": "слушаешь",
            "3sg": "слушает",
            "1pl": "слушаем",
            "2pl": "слушаете",
            "3pl": "слушают"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "музыку дома",
              "beforeVerbEn": "",
              "afterVerbEn": "music at home"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "подкаст на английском",
              "beforeVerbEn": "",
              "afterVerbEn": "a podcast in English"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "аудиокнигу в машине",
              "beforeVerbEn": "",
              "afterVerbEn": "an audiobook in the car"
            }
          ],
          "coachNote": "Regular 1st conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "В пятницу ты иногда слушаешь музыку дома.",
              "en": "On Friday you sometimes listen to music at home."
            },
            {
              "ru": "В субботу мы слушаем подкаст на английском.",
              "en": "On Saturday we listen to a podcast in English."
            }
          ],
          "tags": [
            "first",
            "regular"
          ]
        },
        {
          "id": "igrat",
          "lemma": "играть",
          "translation": "to play",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "игра",
            "mutable": "ть"
          },
          "fragmentBaseByPerson": {
            "1sg": "игра",
            "2sg": "игра",
            "3sg": "игра",
            "1pl": "игра",
            "2pl": "игра",
            "3pl": "игра"
          },
          "forms": {
            "1sg": "играю",
            "2sg": "играешь",
            "3sg": "играет",
            "1pl": "играем",
            "2pl": "играете",
            "3pl": "играют"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "обычно",
              "afterVerbRu": "в футбол",
              "beforeVerbEn": "usually",
              "afterVerbEn": "football"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "в компьютерные игры",
              "beforeVerbEn": "",
              "afterVerbEn": "computer games"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "на гитаре",
              "beforeVerbEn": "",
              "afterVerbEn": "the guitar"
            }
          ],
          "coachNote": "Regular 1st conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "В субботу он обычно играет в футбол с друзьями.",
              "en": "On Saturday he usually plays football with friends."
            },
            {
              "ru": "Они играют в компьютерные игры.",
              "en": "They play computer games."
            }
          ],
          "tags": [
            "first",
            "regular"
          ]
        }
      ]
    },
    {
      "id": "fc_irregular_stem_change",
      "title": "Irregular / stem-change 1st-conjugation verbs",
      "defaultEntry": false,
      "mixIntoDefaultResume": false,
      "status": "active",
      "whyThisExists": "These verbs break the simple swap-the-ending intuition and need isolated reps.",
      "teachingRules": [
        "Do not mix this subdeck into regular-core resume by default.",
        "Preview must explicitly surface the stem change or ё-behavior.",
        "Analytics must show these verbs separately from the regular core deck."
      ],
      "verbs": [
        {
          "id": "pisat",
          "lemma": "писать",
          "translation": "to write",
          "regularityTag": "stem_change",
          "previewSplit": {
            "stable": "писа",
            "mutable": "ть"
          },
          "fragmentBaseByPerson": {
            "1sg": "пиш",
            "2sg": "пиш",
            "3sg": "пиш",
            "1pl": "пиш",
            "2pl": "пиш",
            "3pl": "пиш"
          },
          "forms": {
            "1sg": "пишу",
            "2sg": "пишешь",
            "3sg": "пишет",
            "1pl": "пишем",
            "2pl": "пишете",
            "3pl": "пишут"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "письмо",
              "beforeVerbEn": "",
              "afterVerbEn": "a letter"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "сообщения",
              "beforeVerbEn": "",
              "afterVerbEn": "messages"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "тест по русскому языку",
              "beforeVerbEn": "",
              "afterVerbEn": "a Russian language test"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "книгу",
              "beforeVerbEn": "",
              "afterVerbEn": "a book"
            }
          ],
          "coachNote": "Stem-change verb. The present stem is пиш-, not писа-.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Она пишет письмо в среду.",
              "en": "She writes a letter on Wednesday."
            },
            {
              "ru": "В четверг я пишу сообщения студентам.",
              "en": "On Thursday I write messages to students."
            }
          ],
          "tags": [
            "first",
            "irregular"
          ]
        },
        {
          "id": "davat",
          "lemma": "давать",
          "translation": "to give",
          "regularityTag": "irregular_yo",
          "previewSplit": {
            "stable": "да",
            "mutable": "вать"
          },
          "fragmentBaseByPerson": {
            "1sg": "да",
            "2sg": "да",
            "3sg": "да",
            "1pl": "да",
            "2pl": "да",
            "3pl": "да"
          },
          "forms": {
            "1sg": "даю",
            "2sg": "даёшь",
            "3sg": "даёт",
            "1pl": "даём",
            "2pl": "даёте",
            "3pl": "дают"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "книгу",
              "beforeVerbEn": "",
              "afterVerbEn": "a book"
            }
          ],
          "coachNote": "This verb uses ё in most non-1sg forms: даёшь, даёт, даём, даёте.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Вы даёте мне книгу.",
              "en": "You give me a book."
            }
          ],
          "tags": [
            "first",
            "irregular",
            "yo"
          ]
        }
      ]
    }
  ],
  "acceptanceChecks": [
    "Total verbs = 7.",
    "Total atoms after generation = 42.",
    "Regular core subdeck is the default entry.",
    "писать and давать are isolated in the irregular subdeck."
  ]
};

window.SECOND_CONJUGATION_DECK = {
  "moduleId": "second_conjugation",
  "title": "2nd Conjugation",
  "purpose": "Train present-tense 2nd-conjugation verbs with explicit isolation of irregular я-forms and exception-shape verbs.",
  "defaultStageProfileId": "grammar_full",
  "heatmap": "verb x person",
  "referenceEndings": {
    "1sg": "-ю / -у",
    "2sg": "-ишь",
    "3sg": "-ит",
    "1pl": "-им",
    "2pl": "-ите",
    "3pl": "-ят / -ат"
  },
  "subdecks": [
    {
      "id": "sc_regular_core",
      "title": "Core 2nd-conjugation verbs",
      "defaultEntry": true,
      "mixIntoDefaultResume": true,
      "status": "active",
      "whyThisExists": "Main everyday 2nd-conjugation practice deck, still flagging irregular я-forms inline.",
      "teachingRules": [
        "Choose2 / Choose4 / FullChoice options must come only from the same verb paradigm.",
        "If showIrregularYaBanner is true, show the banner only in Preview and the first two Guided attempts.",
        "Do not add perfective-future verbs in this pass."
      ],
      "verbs": [
        {
          "id": "govorit",
          "lemma": "говорить",
          "translation": "to speak / to say",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "говор",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "говор",
            "2sg": "говор",
            "3sg": "говор",
            "1pl": "говор",
            "2pl": "говор",
            "3pl": "говор"
          },
          "forms": {
            "1sg": "говорю",
            "2sg": "говоришь",
            "3sg": "говорит",
            "1pl": "говорим",
            "2pl": "говорите",
            "3pl": "говорят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "по телефону",
              "beforeVerbEn": "",
              "afterVerbEn": "on the phone"
            },
            {
              "beforeVerbRu": "немного",
              "afterVerbRu": "по-русски",
              "beforeVerbEn": "a little",
              "afterVerbEn": "Russian"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "с друзьями",
              "beforeVerbEn": "",
              "afterVerbEn": "with friends"
            }
          ],
          "coachNote": "Core 2nd conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "В четверг он говорит по телефону.",
              "en": "On Thursday he speaks on the phone."
            },
            {
              "ru": "Я немного говорю по-русски.",
              "en": "I speak a little Russian."
            }
          ],
          "tags": [
            "second",
            "core"
          ]
        },
        {
          "id": "uchit",
          "lemma": "учить",
          "translation": "to learn / study / teach",
          "regularityTag": "regular_ya_special",
          "previewSplit": {
            "stable": "уч",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "уч",
            "2sg": "уч",
            "3sg": "уч",
            "1pl": "уч",
            "2pl": "уч",
            "3pl": "уч"
          },
          "forms": {
            "1sg": "учу",
            "2sg": "учишь",
            "3sg": "учит",
            "1pl": "учим",
            "2pl": "учите",
            "3pl": "учат"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "новые слова",
              "beforeVerbEn": "",
              "afterVerbEn": "new words"
            }
          ],
          "coachNote": "Watch the я-form.",
          "irregularYa": true,
          "irregularPattern": "учить -> учу",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: учить -> учу.",
          "exampleSentences": [
            {
              "ru": "В среду мы учим новые слова.",
              "en": "On Wednesday we learn new words."
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        },
        {
          "id": "gotovit",
          "lemma": "готовить",
          "translation": "to cook / to prepare",
          "regularityTag": "irregular_ya_cluster",
          "previewSplit": {
            "stable": "готов",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "готовл",
            "2sg": "готов",
            "3sg": "готов",
            "1pl": "готов",
            "2pl": "готов",
            "3pl": "готов"
          },
          "forms": {
            "1sg": "готовлю",
            "2sg": "готовишь",
            "3sg": "готовит",
            "1pl": "готовим",
            "2pl": "готовите",
            "3pl": "готовят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "завтрак",
              "beforeVerbEn": "",
              "afterVerbEn": "breakfast"
            }
          ],
          "coachNote": "Watch the я-form: готовить -> готовлю.",
          "irregularYa": true,
          "irregularPattern": "в -> вл in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: готовить -> готовлю (в -> вл).",
          "exampleSentences": [
            {
              "ru": "В субботу я готовлю завтрак.",
              "en": "On Saturday I cook breakfast."
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        },
        {
          "id": "zvonit",
          "lemma": "звонить",
          "translation": "to call (by phone)",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "звон",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "звон",
            "2sg": "звон",
            "3sg": "звон",
            "1pl": "звон",
            "2pl": "звон",
            "3pl": "звон"
          },
          "forms": {
            "1sg": "звоню",
            "2sg": "звонишь",
            "3sg": "звонит",
            "1pl": "звоним",
            "2pl": "звоните",
            "3pl": "звонят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "сестре",
              "beforeVerbEn": "",
              "afterVerbEn": "your sister"
            }
          ],
          "coachNote": "Core 2nd conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "В понедельник ты звонишь сестре?",
              "en": "On Monday do you call your sister?"
            }
          ],
          "tags": [
            "second",
            "core"
          ]
        },
        {
          "id": "prosit",
          "lemma": "просить",
          "translation": "to ask for / request",
          "regularityTag": "irregular_ya",
          "previewSplit": {
            "stable": "прос",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "прош",
            "2sg": "прос",
            "3sg": "прос",
            "1pl": "прос",
            "2pl": "прос",
            "3pl": "прос"
          },
          "forms": {
            "1sg": "прошу",
            "2sg": "просишь",
            "3sg": "просит",
            "1pl": "просим",
            "2pl": "просите",
            "3pl": "просят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "помощи",
              "beforeVerbEn": "",
              "afterVerbEn": "for help"
            }
          ],
          "coachNote": "Treat this as an irregular я-form watchlist item because the canonical 1sg form is прошу.",
          "irregularYa": true,
          "irregularPattern": "с -> ш in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: просить -> прошу (с -> ш).",
          "exampleSentences": [
            {
              "ru": "В воскресенье вы просите помощи?",
              "en": "On Sunday do you ask for help?"
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        },
        {
          "id": "hodit",
          "lemma": "ходить",
          "translation": "to go (on foot, regularly)",
          "regularityTag": "irregular_ya",
          "previewSplit": {
            "stable": "ход",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "хож",
            "2sg": "ход",
            "3sg": "ход",
            "1pl": "ход",
            "2pl": "ход",
            "3pl": "ход"
          },
          "forms": {
            "1sg": "хожу",
            "2sg": "ходишь",
            "3sg": "ходит",
            "1pl": "ходим",
            "2pl": "ходите",
            "3pl": "ходят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "в спортзал",
              "beforeVerbEn": "",
              "afterVerbEn": "to the gym"
            }
          ],
          "coachNote": "Watch the я-form.",
          "irregularYa": true,
          "irregularPattern": "д -> ж in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: ходить -> хожу (д -> ж).",
          "exampleSentences": [
            {
              "ru": "По вечерам мы ходим в спортзал.",
              "en": "In the evenings we go to the gym."
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        },
        {
          "id": "nosit",
          "lemma": "носить",
          "translation": "to wear / to carry",
          "regularityTag": "irregular_ya",
          "previewSplit": {
            "stable": "нос",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "нош",
            "2sg": "нос",
            "3sg": "нос",
            "1pl": "нос",
            "2pl": "нос",
            "3pl": "нос"
          },
          "forms": {
            "1sg": "ношу",
            "2sg": "носишь",
            "3sg": "носит",
            "1pl": "носим",
            "2pl": "носите",
            "3pl": "носят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "обычно",
              "afterVerbRu": "чёрную куртку",
              "beforeVerbEn": "usually",
              "afterVerbEn": "a black jacket"
            }
          ],
          "coachNote": "Watch the я-form.",
          "irregularYa": true,
          "irregularPattern": "с -> ш in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: носить -> ношу (с -> ш).",
          "exampleSentences": [
            {
              "ru": "Обычно он носит чёрную куртку.",
              "en": "He usually wears a black jacket."
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        },
        {
          "id": "varit",
          "lemma": "варить",
          "translation": "to boil / to cook by boiling",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "вар",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "вар",
            "2sg": "вар",
            "3sg": "вар",
            "1pl": "вар",
            "2pl": "вар",
            "3pl": "вар"
          },
          "forms": {
            "1sg": "варю",
            "2sg": "варишь",
            "3sg": "варит",
            "1pl": "варим",
            "2pl": "варите",
            "3pl": "варят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "суп",
              "beforeVerbEn": "",
              "afterVerbEn": "soup"
            }
          ],
          "coachNote": "Core 2nd conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Во вторник она варит суп.",
              "en": "On Tuesday she cooks soup."
            }
          ],
          "tags": [
            "second",
            "core"
          ]
        },
        {
          "id": "solit",
          "lemma": "солить",
          "translation": "to salt / add salt",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "сол",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "сол",
            "2sg": "сол",
            "3sg": "сол",
            "1pl": "сол",
            "2pl": "сол",
            "3pl": "сол"
          },
          "forms": {
            "1sg": "солю",
            "2sg": "солишь",
            "3sg": "солит",
            "1pl": "солим",
            "2pl": "солите",
            "3pl": "солят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "рыбу",
              "beforeVerbEn": "",
              "afterVerbEn": "the fish"
            }
          ],
          "coachNote": "Core 2nd conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "В пятницу они солят рыбу.",
              "en": "On Friday they salt the fish."
            }
          ],
          "tags": [
            "second",
            "core"
          ]
        },
        {
          "id": "darit",
          "lemma": "дарить",
          "translation": "to give as a gift",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "дар",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "дар",
            "2sg": "дар",
            "3sg": "дар",
            "1pl": "дар",
            "2pl": "дар",
            "3pl": "дар"
          },
          "forms": {
            "1sg": "дарю",
            "2sg": "даришь",
            "3sg": "дарит",
            "1pl": "дарим",
            "2pl": "дарите",
            "3pl": "дарят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "иногда",
              "afterVerbRu": "цветы",
              "beforeVerbEn": "sometimes",
              "afterVerbEn": "flowers"
            }
          ],
          "coachNote": "Core 2nd conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Иногда она дарит цветы маме.",
              "en": "Sometimes she gives flowers to her mother."
            }
          ],
          "tags": [
            "second",
            "core"
          ]
        },
        {
          "id": "stroit",
          "lemma": "строить",
          "translation": "to build",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "стро",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "стро",
            "2sg": "стро",
            "3sg": "стро",
            "1pl": "стро",
            "2pl": "стро",
            "3pl": "стро"
          },
          "forms": {
            "1sg": "строю",
            "2sg": "строишь",
            "3sg": "строит",
            "1pl": "строим",
            "2pl": "строите",
            "3pl": "строят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "планы",
              "beforeVerbEn": "",
              "afterVerbEn": "plans"
            }
          ],
          "coachNote": "Core 2nd conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "В четверг мы строим планы на выходные.",
              "en": "On Thursday we make plans for the weekend."
            }
          ],
          "tags": [
            "second",
            "core"
          ]
        },
        {
          "id": "blagodarit",
          "lemma": "благодарить",
          "translation": "to thank",
          "regularityTag": "regular",
          "previewSplit": {
            "stable": "благодар",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "благодар",
            "2sg": "благодар",
            "3sg": "благодар",
            "1pl": "благодар",
            "2pl": "благодар",
            "3pl": "благодар"
          },
          "forms": {
            "1sg": "благодарю",
            "2sg": "благодаришь",
            "3sg": "благодарит",
            "1pl": "благодарим",
            "2pl": "благодарите",
            "3pl": "благодарят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "всегда",
              "afterVerbRu": "преподавателя",
              "beforeVerbEn": "always",
              "afterVerbEn": "the teacher"
            }
          ],
          "coachNote": "Core 2nd conjugation.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Мы всегда благодарим преподавателя за урок.",
              "en": "We always thank the teacher for the lesson."
            }
          ],
          "tags": [
            "second",
            "core"
          ]
        },
        {
          "id": "perevodit",
          "lemma": "переводить",
          "translation": "to translate",
          "regularityTag": "irregular_ya_special",
          "previewSplit": {
            "stable": "перевод",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "перевож",
            "2sg": "перевод",
            "3sg": "перевод",
            "1pl": "перевод",
            "2pl": "перевод",
            "3pl": "перевод"
          },
          "forms": {
            "1sg": "перевожу",
            "2sg": "переводишь",
            "3sg": "переводит",
            "1pl": "переводим",
            "2pl": "переводите",
            "3pl": "переводят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "текст",
              "beforeVerbEn": "",
              "afterVerbEn": "a text"
            }
          ],
          "coachNote": "Watch the я-form.",
          "irregularYa": true,
          "irregularPattern": "д -> ж in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: переводить -> перевожу (д -> ж).",
          "exampleSentences": [
            {
              "ru": "В среду она переводит текст с английского.",
              "en": "On Wednesday she translates a text from English."
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        },
        {
          "id": "prihodit",
          "lemma": "приходить",
          "translation": "to come / arrive",
          "regularityTag": "irregular_ya",
          "previewSplit": {
            "stable": "приход",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "прихож",
            "2sg": "приход",
            "3sg": "приход",
            "1pl": "приход",
            "2pl": "приход",
            "3pl": "приход"
          },
          "forms": {
            "1sg": "прихожу",
            "2sg": "приходишь",
            "3sg": "приходит",
            "1pl": "приходим",
            "2pl": "приходите",
            "3pl": "приходят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "в офис рано",
              "beforeVerbEn": "",
              "afterVerbEn": "to the office early"
            }
          ],
          "coachNote": "Watch the я-form.",
          "irregularYa": true,
          "irregularPattern": "д -> ж in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: приходить -> прихожу (д -> ж).",
          "exampleSentences": [
            {
              "ru": "В понедельник я прихожу в офис рано.",
              "en": "On Monday I arrive at the office early."
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        },
        {
          "id": "vyhodit",
          "lemma": "выходить",
          "translation": "to go out / to leave",
          "regularityTag": "irregular_ya",
          "previewSplit": {
            "stable": "выход",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "выхож",
            "2sg": "выход",
            "3sg": "выход",
            "1pl": "выход",
            "2pl": "выход",
            "3pl": "выход"
          },
          "forms": {
            "1sg": "выхожу",
            "2sg": "выходишь",
            "3sg": "выходит",
            "1pl": "выходим",
            "2pl": "выходите",
            "3pl": "выходят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "из дома рано",
              "beforeVerbEn": "",
              "afterVerbEn": "out of the house early"
            }
          ],
          "coachNote": "Watch the я-form.",
          "irregularYa": true,
          "irregularPattern": "д -> ж in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: выходить -> выхожу (д -> ж).",
          "exampleSentences": [
            {
              "ru": "В пятницу они выходят из дома в восемь утра.",
              "en": "On Friday they leave home at eight in the morning."
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        },
        {
          "id": "smotret",
          "lemma": "смотреть",
          "translation": "to watch / to look at",
          "regularityTag": "regular_exception_shape",
          "previewSplit": {
            "stable": "смотр",
            "mutable": "еть"
          },
          "fragmentBaseByPerson": {
            "1sg": "смотр",
            "2sg": "смотр",
            "3sg": "смотр",
            "1pl": "смотр",
            "2pl": "смотр",
            "3pl": "смотр"
          },
          "forms": {
            "1sg": "смотрю",
            "2sg": "смотришь",
            "3sg": "смотрит",
            "1pl": "смотрим",
            "2pl": "смотрите",
            "3pl": "смотрят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "фильм",
              "beforeVerbEn": "",
              "afterVerbEn": "a film"
            }
          ],
          "coachNote": "Keep this in the core deck for this user-facing module.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Ты смотришь фильм.",
              "en": "You are watching a film."
            }
          ],
          "tags": [
            "second",
            "core",
            "exception-shape"
          ]
        },
        {
          "id": "lyubit",
          "lemma": "любить",
          "translation": "to love / like",
          "regularityTag": "irregular_ya_cluster",
          "previewSplit": {
            "stable": "люб",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "любл",
            "2sg": "люб",
            "3sg": "люб",
            "1pl": "люб",
            "2pl": "люб",
            "3pl": "люб"
          },
          "forms": {
            "1sg": "люблю",
            "2sg": "любишь",
            "3sg": "любит",
            "1pl": "любим",
            "2pl": "любите",
            "3pl": "любят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "спорт",
              "beforeVerbEn": "",
              "afterVerbEn": "sport"
            },
            {
              "beforeVerbRu": "всегда",
              "afterVerbRu": "пить кофе",
              "beforeVerbEn": "always",
              "afterVerbEn": "to drink coffee"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "пиццу",
              "beforeVerbEn": "",
              "afterVerbEn": "pizza"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "танцевать",
              "beforeVerbEn": "",
              "afterVerbEn": "to dance"
            }
          ],
          "coachNote": "Watch the я-form.",
          "irregularYa": true,
          "irregularPattern": "б -> бл in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: любить -> люблю (б -> бл).",
          "exampleSentences": [
            {
              "ru": "Я люблю пиццу.",
              "en": "I love pizza."
            }
          ],
          "tags": [
            "second",
            "core",
            "irregular-ya"
          ]
        }
      ]
    },
    {
      "id": "sc_exception_shapes",
      "title": "2nd-conjugation exception-shape verbs",
      "defaultEntry": false,
      "mixIntoDefaultResume": false,
      "status": "active",
      "whyThisExists": "Lets the learner isolate verbs that are pedagogically noisy because their infinitives do not look like the core pattern or because they are often taught as exceptions.",
      "teachingRules": [
        "Keep this as a dedicated subdeck so the learner can isolate exception-shape verbs.",
        "видеть must still show the irregular я-banner.",
        "Do not auto-mix this subdeck into the default core resume flow."
      ],
      "verbs": [
        {
          "id": "pomnit",
          "lemma": "помнить",
          "translation": "to remember",
          "regularityTag": "core_alt_shape",
          "previewSplit": {
            "stable": "помн",
            "mutable": "ить"
          },
          "fragmentBaseByPerson": {
            "1sg": "помн",
            "2sg": "помн",
            "3sg": "помн",
            "1pl": "помн",
            "2pl": "помн",
            "3pl": "помн"
          },
          "forms": {
            "1sg": "помню",
            "2sg": "помнишь",
            "3sg": "помнит",
            "1pl": "помним",
            "2pl": "помните",
            "3pl": "помнят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "о встрече",
              "beforeVerbEn": "",
              "afterVerbEn": "about the meeting"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "это правило",
              "beforeVerbEn": "",
              "afterVerbEn": "this rule"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "это",
              "beforeVerbEn": "",
              "afterVerbEn": "this"
            }
          ],
          "coachNote": "Keep in the exception deck so the learner can isolate non-plain textbook patterns.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "В понедельник ты помнишь о встрече?",
              "en": "On Monday do you remember the meeting?"
            }
          ],
          "tags": [
            "second",
            "exception"
          ]
        },
        {
          "id": "slyshat",
          "lemma": "слышать",
          "translation": "to hear",
          "regularityTag": "exception_non_it",
          "previewSplit": {
            "stable": "слыш",
            "mutable": "ать"
          },
          "fragmentBaseByPerson": {
            "1sg": "слыш",
            "2sg": "слыш",
            "3sg": "слыш",
            "1pl": "слыш",
            "2pl": "слыш",
            "3pl": "слыш"
          },
          "forms": {
            "1sg": "слышу",
            "2sg": "слышишь",
            "3sg": "слышит",
            "1pl": "слышим",
            "2pl": "слышите",
            "3pl": "слышат"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "иногда",
              "afterVerbRu": "шум",
              "beforeVerbEn": "sometimes",
              "afterVerbEn": "a noise"
            },
            {
              "beforeVerbRu": "обычно",
              "afterVerbRu": "твой голос",
              "beforeVerbEn": "usually",
              "afterVerbEn": "your voice"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "музыку",
              "beforeVerbEn": "",
              "afterVerbEn": "the music"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "собаку",
              "beforeVerbEn": "",
              "afterVerbEn": "the dog"
            }
          ],
          "coachNote": "True 2nd-conjugation exception shape.",
          "irregularYa": false,
          "irregularPattern": null,
          "showIrregularYaBanner": false,
          "irregularYaBannerText": null,
          "exampleSentences": [
            {
              "ru": "Вы слышите музыку?",
              "en": "Do you hear the music?"
            }
          ],
          "tags": [
            "second",
            "exception"
          ]
        },
        {
          "id": "videt",
          "lemma": "видеть",
          "translation": "to see",
          "regularityTag": "exception_irregular_ya",
          "previewSplit": {
            "stable": "вид",
            "mutable": "еть"
          },
          "fragmentBaseByPerson": {
            "1sg": "виж",
            "2sg": "вид",
            "3sg": "вид",
            "1pl": "вид",
            "2pl": "вид",
            "3pl": "вид"
          },
          "forms": {
            "1sg": "вижу",
            "2sg": "видишь",
            "3sg": "видит",
            "1pl": "видим",
            "2pl": "видите",
            "3pl": "видят"
          },
          "contextFrames": [
            {
              "beforeVerbRu": "",
              "afterVerbRu": "машину",
              "beforeVerbEn": "",
              "afterVerbEn": "the car"
            },
            {
              "beforeVerbRu": "",
              "afterVerbRu": "тебя",
              "beforeVerbEn": "",
              "afterVerbEn": "you"
            }
          ],
          "coachNote": "Exception verb with an irregular я-form.",
          "irregularYa": true,
          "irregularPattern": "д -> ж in 1sg",
          "showIrregularYaBanner": true,
          "irregularYaBannerText": "Watch the я-form: видеть -> вижу (д -> ж).",
          "exampleSentences": [
            {
              "ru": "Я вижу тебя.",
              "en": "I see you."
            }
          ],
          "tags": [
            "second",
            "exception",
            "irregular-ya"
          ]
        }
      ]
    }
  ],
  "acceptanceChecks": [
    "Total verbs = 20.",
    "Total atoms after generation = 120.",
    "Perfective future reference verbs are omitted entirely from this tightened pass.",
    "просить is treated as an irregular я-form watchlist item.",
    "Second-conjugation irregular я watchlist must include: учить, готовить, просить, ходить, носить, переводить, приходить, выходить, видеть, любить."
  ]
};
