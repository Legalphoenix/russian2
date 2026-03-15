(function () {
  const Coach = window.RussianSkillCoach;
  const {
    clamp,
    average,
    ensureArray,
    ensureNumber,
    ensureObject,
  } = Coach.core;

  const API_PROGRESS_URL = "/api/progress";
  const SAVE_RETRY_MS = 2500;
  const RECENT_LIMIT = 20;
  const HISTORY_LIMIT = 500;
  const PRIOR_ATTEMPTS = 5;
  const PRIOR_TIME_MS = 2200;
  const PRIOR_ERRORS = 0.7;
  const KEYBOARD_LETTERS = [
    "а",
    "б",
    "в",
    "г",
    "д",
    "е",
    "ё",
    "ж",
    "з",
    "и",
    "й",
    "к",
    "л",
    "м",
    "н",
    "о",
    "п",
    "р",
    "с",
    "т",
    "у",
    "ф",
    "х",
    "ц",
    "ч",
    "ш",
    "щ",
    "ъ",
    "ы",
    "ь",
    "э",
    "ю",
    "я",
  ];

  function createKeyboardLetterStats() {
    return {
      attempts: 0,
      totalTimeMs: 0,
      totalErrors: 0,
      bestTimeMs: null,
      lastSeenAt: null,
      recent: [],
    };
  }

  function createKeyboardModule(nowMs = Date.now()) {
    return {
      version: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
      totals: {
        attempts: 0,
        totalTimeMs: 0,
        totalErrors: 0,
        bestStreak: 0,
      },
      history: [],
      letters: Object.fromEntries(
        KEYBOARD_LETTERS.map((letter) => [letter, createKeyboardLetterStats()]),
      ),
      resume: {
        currentLetter: null,
        previousLetters: [],
      },
    };
  }

  function createStageStats() {
    return {
      attempts: 0,
      totalTimeMs: 0,
      totalErrors: 0,
      recent: [],
    };
  }

  function createAtomProgress(stageProfile) {
    return {
      attempts: 0,
      totalTimeMs: 0,
      totalErrors: 0,
      bestTimeMs: null,
      lastSeenAt: null,
      seen: false,
      currentStageIndex: 0,
      recent: [],
      stageStats: Object.fromEntries(
        stageProfile.sequence.map((stageId) => [stageId, createStageStats()]),
      ),
    };
  }

  function createGenericModuleProgress(module) {
    return {
      selectedSubdeckId: module.defaultEntrySubdeckId,
      hiddenEnabled: [],
      pendingPrompt: null,
      totals: {
        attempts: 0,
        totalTimeMs: 0,
        totalErrors: 0,
        bestStreak: 0,
      },
      history: [],
      atoms: {},
    };
  }

  function createMixedReviewProgress() {
    return {
      mode: "before_class",
      queue: [],
      currentIndex: 0,
      pendingPrompt: null,
      totals: {
        attempts: 0,
        totalTimeMs: 0,
        totalErrors: 0,
        bestStreak: 0,
      },
    };
  }

  function createDefaultProgress(curriculum, nowMs = Date.now()) {
    const modules = {
      keyboard: createKeyboardModule(nowMs),
    };

    curriculum.moduleOrder.forEach((moduleId) => {
      modules[moduleId] = createGenericModuleProgress(curriculum.modulesById[moduleId]);
    });

    return {
      version: 2,
      curriculumVersion: curriculum.manifest.version,
      createdAt: nowMs,
      updatedAt: nowMs,
      navigation: {
        lastRoute: "home",
        lastModuleId: "keyboard",
        lastSubdeckId: null,
        lastStageId: null,
        mixedReviewMode: "before_class",
      },
      preferences: {
        speakerGender: "fem",
      },
      modules,
      mixedReview: createMixedReviewProgress(),
    };
  }

  function sanitizeRecent(items) {
    return ensureArray(items)
      .map((item) => ({
        timeMs: ensureNumber(item?.timeMs, 0),
        errors: ensureNumber(item?.errors, 0),
        at: ensureNumber(item?.at, Date.now()),
        stageId: typeof item?.stageId === "string" ? item.stageId : undefined,
      }))
      .slice(-RECENT_LIMIT);
  }

  function sanitizeHistory(items, idKey) {
    return ensureArray(items)
      .map((item) => ({
        [idKey]: item?.[idKey],
        timeMs: ensureNumber(item?.timeMs, 0),
        errors: ensureNumber(item?.errors, 0),
        at: ensureNumber(item?.at, Date.now()),
        stageId: typeof item?.stageId === "string" ? item.stageId : undefined,
      }))
      .filter((item) => item[idKey])
      .slice(-HISTORY_LIMIT);
  }

  function sanitizeKeyboardModule(candidate) {
    const base = createKeyboardModule();
    const source = ensureObject(candidate);
    base.createdAt = ensureNumber(source.createdAt, base.createdAt);
    base.updatedAt = ensureNumber(source.updatedAt, base.updatedAt);
    base.totals = {
      attempts: ensureNumber(source.totals?.attempts, 0),
      totalTimeMs: ensureNumber(source.totals?.totalTimeMs, 0),
      totalErrors: ensureNumber(source.totals?.totalErrors, 0),
      bestStreak: ensureNumber(source.totals?.bestStreak, 0),
    };
    base.history = sanitizeHistory(source.history, "letter");
    base.resume = {
      currentLetter:
        typeof source.resume?.currentLetter === "string" ? source.resume.currentLetter : null,
      previousLetters: ensureArray(source.resume?.previousLetters)
        .filter((letter) => KEYBOARD_LETTERS.includes(letter))
        .slice(0, 3),
    };

    KEYBOARD_LETTERS.forEach((letter) => {
      const stats = ensureObject(source.letters?.[letter]);
      base.letters[letter] = {
        attempts: ensureNumber(stats.attempts, 0),
        totalTimeMs: ensureNumber(stats.totalTimeMs, 0),
        totalErrors: ensureNumber(stats.totalErrors, 0),
        bestTimeMs:
          stats.bestTimeMs === null || stats.bestTimeMs === undefined
            ? null
            : ensureNumber(stats.bestTimeMs, null),
        lastSeenAt:
          stats.lastSeenAt === null || stats.lastSeenAt === undefined
            ? null
            : ensureNumber(stats.lastSeenAt, null),
        recent: sanitizeRecent(stats.recent),
      };
    });

    return base;
  }

  function sanitizeStageStats(candidate) {
    const stats = ensureObject(candidate);
    return {
      attempts: ensureNumber(stats.attempts, 0),
      totalTimeMs: ensureNumber(stats.totalTimeMs, 0),
      totalErrors: ensureNumber(stats.totalErrors, 0),
      recent: sanitizeRecent(stats.recent),
    };
  }

  function sanitizeAtomProgress(candidate, stageProfile) {
    const atom = ensureObject(candidate);
    const base = createAtomProgress(stageProfile);
    base.attempts = ensureNumber(atom.attempts, 0);
    base.totalTimeMs = ensureNumber(atom.totalTimeMs, 0);
    base.totalErrors = ensureNumber(atom.totalErrors, 0);
    base.bestTimeMs =
      atom.bestTimeMs === null || atom.bestTimeMs === undefined
        ? null
        : ensureNumber(atom.bestTimeMs, null);
    base.lastSeenAt =
      atom.lastSeenAt === null || atom.lastSeenAt === undefined
        ? null
        : ensureNumber(atom.lastSeenAt, null);
    base.seen = Boolean(atom.seen || base.attempts > 0);
    base.currentStageIndex = clamp(
      ensureNumber(atom.currentStageIndex, 0),
      0,
      Math.max(0, stageProfile.sequence.length - 1),
    );
    base.recent = sanitizeRecent(atom.recent);
    stageProfile.sequence.forEach((stageId) => {
      base.stageStats[stageId] = sanitizeStageStats(atom.stageStats?.[stageId]);
    });
    return base;
  }

  function sanitizePendingPrompt(prompt, module) {
    if (!prompt || typeof prompt !== "object") {
      return null;
    }

    if (typeof prompt.atomId !== "string") {
      return null;
    }

    if (module && !module.atomsById[prompt.atomId]) {
      return null;
    }

    return {
      atomId: prompt.atomId,
      stageId: typeof prompt.stageId === "string" ? prompt.stageId : null,
      stageProfileId:
        typeof prompt.stageProfileId === "string" ? prompt.stageProfileId : null,
      promptType: typeof prompt.promptType === "string" ? prompt.promptType : null,
      contextId: typeof prompt.contextId === "string" ? prompt.contextId : null,
      subdeckId: typeof prompt.subdeckId === "string" ? prompt.subdeckId : null,
      lineIndex: Number.isFinite(prompt.lineIndex) ? Number(prompt.lineIndex) : null,
      options: ensureArray(prompt.options).slice(0, 24),
      sequence: ensureArray(prompt.sequence).slice(0, 24),
    };
  }

  function sanitizeGenericModuleProgress(candidate, module, curriculum) {
    const source = ensureObject(candidate);
    const base = createGenericModuleProgress(module);
    base.selectedSubdeckId = module.subdeckById[source.selectedSubdeckId]
      ? source.selectedSubdeckId
      : module.defaultEntrySubdeckId;
    base.hiddenEnabled = ensureArray(source.hiddenEnabled)
      .filter((subdeckId) => module.defaultHiddenSubdeckIds.includes(subdeckId))
      .slice(0, module.defaultHiddenSubdeckIds.length);
    base.pendingPrompt = sanitizePendingPrompt(source.pendingPrompt, module);
    base.totals = {
      attempts: ensureNumber(source.totals?.attempts, 0),
      totalTimeMs: ensureNumber(source.totals?.totalTimeMs, 0),
      totalErrors: ensureNumber(source.totals?.totalErrors, 0),
      bestStreak: ensureNumber(source.totals?.bestStreak, 0),
    };
    base.history = sanitizeHistory(source.history, "atomId");

    const atoms = ensureObject(source.atoms);
    Object.keys(atoms).forEach((atomId) => {
      const atom = module.atomsById[atomId];
      if (!atom) {
        return;
      }
      const stageProfile =
        curriculum.stageProfiles[atom.stageProfileId] || module.stageProfile;
      base.atoms[atomId] = sanitizeAtomProgress(atoms[atomId], stageProfile);
    });

    return base;
  }

  function sanitizeMixedReviewProgress(candidate) {
    const source = ensureObject(candidate);
    const base = createMixedReviewProgress();
    base.mode = typeof source.mode === "string" ? source.mode : "before_class";
    base.queue = ensureArray(source.queue)
      .map((item) => ({
        moduleId: typeof item?.moduleId === "string" ? item.moduleId : null,
        atomId: typeof item?.atomId === "string" ? item.atomId : null,
        stageId: typeof item?.stageId === "string" ? item.stageId : null,
      }))
      .filter((item) => item.moduleId && item.atomId)
      .slice(0, 40);
    base.currentIndex = clamp(ensureNumber(source.currentIndex, 0), 0, base.queue.length);
    base.pendingPrompt = sanitizePendingPrompt(source.pendingPrompt, null);
    base.totals = {
      attempts: ensureNumber(source.totals?.attempts, 0),
      totalTimeMs: ensureNumber(source.totals?.totalTimeMs, 0),
      totalErrors: ensureNumber(source.totals?.totalErrors, 0),
      bestStreak: ensureNumber(source.totals?.bestStreak, 0),
    };
    return base;
  }

  function looksLikeLegacyKeyboard(payload) {
    return Boolean(payload?.letters && payload?.totals && !payload?.modules);
  }

  function sanitizeProgress(payload, curriculum) {
    if (looksLikeLegacyKeyboard(payload)) {
      const base = createDefaultProgress(curriculum);
      base.modules.keyboard = sanitizeKeyboardModule(payload);
      base.navigation.lastRoute = "keyboard";
      base.navigation.lastModuleId = "keyboard";
      return base;
    }

    const source = ensureObject(payload);
    const base = createDefaultProgress(curriculum);
    base.version = ensureNumber(source.version, base.version);
    base.curriculumVersion =
      typeof source.curriculumVersion === "string"
        ? source.curriculumVersion
        : base.curriculumVersion;
    base.createdAt = ensureNumber(source.createdAt, base.createdAt);
    base.updatedAt = ensureNumber(source.updatedAt, base.updatedAt);
    base.navigation = {
      lastRoute: typeof source.navigation?.lastRoute === "string" ? source.navigation.lastRoute : "home",
      lastModuleId:
        typeof source.navigation?.lastModuleId === "string"
          ? source.navigation.lastModuleId
          : "keyboard",
      lastSubdeckId:
        typeof source.navigation?.lastSubdeckId === "string"
          ? source.navigation.lastSubdeckId
          : null,
      lastStageId:
        typeof source.navigation?.lastStageId === "string"
          ? source.navigation.lastStageId
          : null,
      mixedReviewMode:
        typeof source.navigation?.mixedReviewMode === "string"
          ? source.navigation.mixedReviewMode
          : "before_class",
    };
    base.preferences = {
      speakerGender:
        source.preferences?.speakerGender === "masc" ? "masc" : "fem",
    };

    base.modules.keyboard = sanitizeKeyboardModule(source.modules?.keyboard);
    curriculum.moduleOrder.forEach((moduleId) => {
      base.modules[moduleId] = sanitizeGenericModuleProgress(
        source.modules?.[moduleId],
        curriculum.modulesById[moduleId],
        curriculum,
      );
    });
    base.mixedReview = sanitizeMixedReviewProgress(source.mixedReview);
    return base;
  }

  async function fetchProgress(curriculum) {
    const response = await fetch(API_PROGRESS_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Progress load failed with ${response.status}.`);
    }

    const payload = await response.json();
    const progress = sanitizeProgress(payload, curriculum);
    return {
      progress,
      updatedAt: ensureNumber(payload?.updatedAt, progress.updatedAt),
    };
  }

  async function putProgress(progress, serverUpdatedAt, curriculum) {
    const response = await fetch(API_PROGRESS_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Expected-Updated-At": String(serverUpdatedAt || 0),
      },
      body: JSON.stringify(progress),
    });

    if (response.status === 409) {
      const latestPayload = await response.json();
      return {
        conflict: true,
        progress: sanitizeProgress(latestPayload, curriculum),
        updatedAt: ensureNumber(latestPayload?.updatedAt, Date.now()),
      };
    }

    if (!response.ok) {
      throw new Error(`Progress save failed with ${response.status}.`);
    }

    const savedPayload = await response.json();
    return {
      conflict: false,
      progress: sanitizeProgress(savedPayload, curriculum),
      updatedAt: ensureNumber(savedPayload?.updatedAt, Date.now()),
    };
  }

  function getVisibleSubdeckIds(progress, module) {
    const moduleProgress = progress.modules[module.moduleId];
    return module.subdecks
      .filter(
        (subdeck) =>
          !module.defaultHiddenSubdeckIds.includes(subdeck.subdeckId) ||
          moduleProgress.hiddenEnabled.includes(subdeck.subdeckId),
      )
      .map((subdeck) => subdeck.subdeckId);
  }

  function ensureAtomProgress(progress, curriculum, moduleId, atomId) {
    const module = curriculum.modulesById[moduleId];
    const moduleProgress = progress.modules[moduleId];
    if (!moduleProgress.atoms[atomId]) {
      const atom = module.atomsById[atomId];
      const stageProfile =
        curriculum.stageProfiles[atom.stageProfileId] || module.stageProfile;
      moduleProgress.atoms[atomId] = createAtomProgress(stageProfile);
    }
    return moduleProgress.atoms[atomId];
  }

  function getAtomStageId(progress, curriculum, moduleId, atomId) {
    const module = curriculum.modulesById[moduleId];
    const atom = module.atomsById[atomId];
    const stageProfile =
      curriculum.stageProfiles[atom.stageProfileId] || module.stageProfile;
    const atomProgress = ensureAtomProgress(progress, curriculum, moduleId, atomId);
    return stageProfile.sequence[atomProgress.currentStageIndex] || stageProfile.sequence[0];
  }

  function maybeAdvanceStage(atomProgress, stageProfile) {
    const currentStageId = stageProfile.sequence[atomProgress.currentStageIndex];
    const nextStageId = stageProfile.sequence[atomProgress.currentStageIndex + 1];
    const unlockKey = nextStageId
      ? `${currentStageId}_to_${nextStageId}`
      : `${currentStageId}_mastered`;
    const unlockRule = stageProfile.unlockRules?.[unlockKey];

    if (!unlockRule) {
      return;
    }

    const currentStageStats = atomProgress.stageStats[currentStageId];
    if (currentStageStats.attempts < (unlockRule.minCorrect || 0)) {
      return;
    }

    const recent = currentStageStats.recent.slice(-(unlockRule.minCorrect || 4));
    const avgErrors = average(recent.length ? recent : currentStageStats.recent, (item) => item.errors);
    const avgTime = average(recent.length ? recent : currentStageStats.recent, (item) => item.timeMs);

    if (
      unlockRule.maxRecentAvgErrors !== undefined &&
      avgErrors > unlockRule.maxRecentAvgErrors
    ) {
      return;
    }

    if (
      unlockRule.maxRecentAvgTimeMs !== undefined &&
      avgTime > unlockRule.maxRecentAvgTimeMs
    ) {
      return;
    }

    if (nextStageId) {
      atomProgress.currentStageIndex += 1;
    }
  }

  function recordAtomAttempt(progress, curriculum, moduleId, atomId, stageId, timeMs, errors, streak) {
    const module = curriculum.modulesById[moduleId];
    const moduleProgress = progress.modules[moduleId];
    const atom = module.atomsById[atomId];
    const stageProfile =
      curriculum.stageProfiles[atom.stageProfileId] || module.stageProfile;
    const atomProgress = ensureAtomProgress(progress, curriculum, moduleId, atomId);
    const now = Date.now();
    const stageStats = atomProgress.stageStats[stageId] || createStageStats();

    atomProgress.attempts += 1;
    atomProgress.totalTimeMs += timeMs;
    atomProgress.totalErrors += errors;
    atomProgress.bestTimeMs =
      atomProgress.bestTimeMs === null ? timeMs : Math.min(atomProgress.bestTimeMs, timeMs);
    atomProgress.lastSeenAt = now;
    atomProgress.seen = true;
    atomProgress.recent.push({ timeMs, errors, at: now, stageId });
    atomProgress.recent = atomProgress.recent.slice(-RECENT_LIMIT);

    stageStats.attempts += 1;
    stageStats.totalTimeMs += timeMs;
    stageStats.totalErrors += errors;
    stageStats.recent.push({ timeMs, errors, at: now, stageId });
    stageStats.recent = stageStats.recent.slice(-RECENT_LIMIT);
    atomProgress.stageStats[stageId] = stageStats;
    maybeAdvanceStage(atomProgress, stageProfile);

    moduleProgress.totals.attempts += 1;
    moduleProgress.totals.totalTimeMs += timeMs;
    moduleProgress.totals.totalErrors += errors;
    moduleProgress.totals.bestStreak = Math.max(
      moduleProgress.totals.bestStreak,
      ensureNumber(streak, 0),
    );
    moduleProgress.history.push({ atomId, timeMs, errors, at: now, stageId });
    moduleProgress.history = moduleProgress.history.slice(-HISTORY_LIMIT);
    moduleProgress.pendingPrompt = null;

    progress.navigation.lastModuleId = moduleId;
    progress.navigation.lastSubdeckId = atom.subdeckId;
    progress.navigation.lastStageId = getAtomStageId(progress, curriculum, moduleId, atomId);
  }

  function setSelectedSubdeck(progress, moduleId, subdeckId) {
    progress.modules[moduleId].selectedSubdeckId = subdeckId;
    progress.navigation.lastSubdeckId = subdeckId;
  }

  function setHiddenSubdeck(progress, moduleId, subdeckId, enabled) {
    const moduleProgress = progress.modules[moduleId];
    const next = new Set(moduleProgress.hiddenEnabled);
    if (enabled) {
      next.add(subdeckId);
    } else {
      next.delete(subdeckId);
    }
    moduleProgress.hiddenEnabled = Array.from(next);
  }

  function setPendingPrompt(progress, moduleId, prompt) {
    progress.modules[moduleId].pendingPrompt = prompt;
  }

  function setNavigation(progress, route, moduleId) {
    progress.navigation.lastRoute = route;
    if (moduleId) {
      progress.navigation.lastModuleId = moduleId;
    }
  }

  function getModuleBaseline(moduleProgress) {
    const attempts = moduleProgress.totals.attempts;
    const avgTime = attempts ? moduleProgress.totals.totalTimeMs / attempts : PRIOR_TIME_MS;
    const avgErrors = attempts ? moduleProgress.totals.totalErrors / attempts : PRIOR_ERRORS;
    return {
      avgTimeMs: clamp(avgTime || PRIOR_TIME_MS, 900, 6500),
      avgErrors: clamp(avgErrors || PRIOR_ERRORS, 0.15, 3),
    };
  }

  function computeAtomDifficulty(progress, curriculum, moduleId, atomId) {
    const moduleProgress = progress.modules[moduleId];
    const atomProgress = ensureAtomProgress(progress, curriculum, moduleId, atomId);
    const baseline = getModuleBaseline(moduleProgress);
    const attempts = atomProgress.attempts;
    const smoothedTime =
      (atomProgress.totalTimeMs + PRIOR_ATTEMPTS * baseline.avgTimeMs) /
      (attempts + PRIOR_ATTEMPTS);
    const smoothedErrors =
      (atomProgress.totalErrors + PRIOR_ATTEMPTS * baseline.avgErrors) /
      (attempts + PRIOR_ATTEMPTS);
    const noveltyBoost = 1 / Math.sqrt(attempts + 1);
    const recencyHours = atomProgress.lastSeenAt
      ? (Date.now() - atomProgress.lastSeenAt) / 3600000
      : 36;
    const staleBoost = clamp(recencyHours / 60, 0.08, 0.45);
    const stagePressure = 0.1 + atomProgress.currentStageIndex * 0.08;

    return (
      0.48 * (smoothedTime / baseline.avgTimeMs) +
      0.24 * (smoothedErrors / (baseline.avgErrors + 0.3)) +
      0.14 * noveltyBoost +
      0.14 * stagePressure +
      staleBoost
    );
  }

  Coach.progress = {
    API_PROGRESS_URL,
    SAVE_RETRY_MS,
    RECENT_LIMIT,
    HISTORY_LIMIT,
    PRIOR_ATTEMPTS,
    PRIOR_TIME_MS,
    PRIOR_ERRORS,
    KEYBOARD_LETTERS,
    createDefaultProgress,
    sanitizeProgress,
    fetchProgress,
    putProgress,
    getVisibleSubdeckIds,
    ensureAtomProgress,
    getAtomStageId,
    recordAtomAttempt,
    setSelectedSubdeck,
    setHiddenSubdeck,
    setPendingPrompt,
    setNavigation,
    computeAtomDifficulty,
    looksLikeLegacyKeyboard,
  };
})();
