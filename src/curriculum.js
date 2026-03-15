(function () {
  const Coach = window.RussianSkillCoach;
  const { ensureArray } = Coach.core;

  async function fetchJson(path) {
    const response = await fetch(path, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load ${path} (${response.status}).`);
    }

    return response.json();
  }

  function buildModule(definition, deck, blueprint, stageProfiles) {
    const sentenceBank = ensureArray(deck.sentenceBank);
    const dialogues = ensureArray(deck.dialogues);
    const sentenceBankById = Object.fromEntries(
      sentenceBank.map((entry) => [entry.id, entry]),
    );
    const dialoguesById = Object.fromEntries(
      dialogues.map((entry) => [entry.id, entry]),
    );

    const subdecks = ensureArray(deck.subdecks).map((subdeck) => {
      const normalizedAtoms = ensureArray(subdeck.atoms).map((atom) => ({
        ...atom,
        moduleId: definition.moduleId,
        stageProfileId: atom.stageProfileId || definition.defaultStageProfileId,
        subdeckId: atom.subdeckId || subdeck.subdeckId,
      }));

      return {
        ...subdeck,
        subdeckId: subdeck.subdeckId,
        hiddenByDefault: definition.defaultHiddenSubdeckIds.includes(subdeck.subdeckId),
        atoms: normalizedAtoms,
      };
    });

    const atoms = subdecks.flatMap((subdeck) => subdeck.atoms);
    const atomsById = Object.fromEntries(atoms.map((atom) => [atom.id, atom]));
    const subdeckById = Object.fromEntries(
      subdecks.map((subdeck) => [subdeck.subdeckId, subdeck]),
    );

    return {
      ...definition,
      ...deck,
      purpose: deck.purpose || blueprint?.purpose || definition.title,
      analytics: deck.analytics || blueprint?.analytics || definition.analytics || {},
      uiSignature: deck.uiSignature || blueprint?.uiSignature || definition.uiSignature || "",
      subdeckRules: deck.subdeckRules || blueprint?.subdeckRules || [],
      stageProfile: stageProfiles[definition.defaultStageProfileId],
      subdecks,
      subdeckById,
      atoms,
      atomsById,
      sentenceBank,
      sentenceBankById,
      dialogues,
      dialoguesById,
    };
  }

  async function load() {
    const packRoot = "russian_skill_coach_curriculum_pack";
    const manifest = await fetchJson(`${packRoot}/curriculum_manifest.json`);
    const [corrections, moduleBlueprints, mixedReviewRules, keyboardManifest] =
      await Promise.all([
        fetchJson(`${packRoot}/support/corrections_and_exclusions.json`),
        fetchJson(`${packRoot}/support/module_blueprints.json`),
        fetchJson(`${packRoot}/support/mixed_review_rules.json`),
        fetchJson(`${packRoot}/support/keyboard_manifest.json`),
      ]);

    const decks = await Promise.all(
      manifest.modules.map((moduleDef) =>
        fetchJson(`${packRoot}/${moduleDef.file}`).then((deck) => [moduleDef.moduleId, deck]),
      ),
    );

    const deckMap = Object.fromEntries(decks);
    const stageProfiles = manifest.stageProfiles || {};
    const modulesById = {};

    manifest.modules.forEach((moduleDef) => {
      modulesById[moduleDef.moduleId] = buildModule(
        moduleDef,
        deckMap[moduleDef.moduleId],
        moduleBlueprints[moduleDef.moduleId],
        stageProfiles,
      );
    });

    return {
      packRoot,
      manifest,
      corrections,
      moduleBlueprints,
      mixedReviewRules,
      keyboardManifest,
      stageProfiles,
      modulesById,
      moduleOrder: manifest.modules.map((moduleDef) => moduleDef.moduleId),
      defaultHiddenDeckIds: new Set(manifest.defaultHiddenDeckIds || []),
    };
  }

  Coach.curriculum = {
    load,
  };
})();
