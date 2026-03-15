You are implementing an expansion of an existing Russian key trainer into a multi-module Russian Skill Coach.

Use the attached curriculum pack (russian_skill_coach_curriculum_pack) as the **single source of truth**.

Read these files in order (READ FILES 1 - 5 IN FULL!!!! FOR File number 6 you don't need to read the entire docs, just enough to understand the schema)

1. `README.md`
2. `READ_FIRST_FOR_CODING_AI.md`
3. `russian_skill_coach_expansion_plan_v2.md`
4. `curriculum_manifest.json`
5. `support/corrections_and_exclusions.json`
6. the relevant files in `decks/`

Non-negotiable rules:

- Preserve the existing Keyboard module behavior instead of redesigning it.
- Do not invent new Russian vocabulary or grammar content outside the canonical deck files.
- Do not improvise pedagogy; the stage ladders and module rules are already specified.
- Use time-to-correct and error-strikes-before-correct as the two universal core metrics.
- Outside the Keyboard module, count one wrong click or one wrong submitted answer as one error strike.
- Keep the adult/slang deck hidden by default.
- Keep `sc_perfective_future_reference` out of default present-tense 2nd-conjugation flows.
- Treat `support/pronunciation_reference.json` as helper/reference only.

Important implementation constraint:

The app must stay true to the original training philosophy: one tiny atom at a time, fast reps, clear analytics, weak spots resurfaced automatically, and frictionless resume/start behavior.

The user should be able to open the app, choose a module/tab, and immediately continue practicing exactly where they left off.

The content boundary is closed. Use only the reviewed content in the deck JSON files.
