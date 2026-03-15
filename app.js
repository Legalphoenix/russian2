(function () {
  const Coach = window.RussianSkillCoach;
  const {
    average,
    clamp,
    sample,
    pickMany,
    shuffle,
    unique,
    escapeHtml,
    formatMs,
    formatErrors,
    formatPercent,
    formatStudyDuration,
    displayMs,
    displayErrors,
    answersMatch,
    getStageLabel,
    getPersonLabel,
    getSlotLabel,
    commonPrefix,
    normalizeAnswer,
  } = Coach.core;
  const Progress = Coach.progress;

  const state = {
    root: null,
    curriculum: null,
    progress: null,
    route: "home",
    ready: false,
    serverUpdatedAt: 0,
    saveQueued: false,
    saveInFlight: false,
    retryTimer: 0,
    serverError: false,
    lastSaveOutcome: "idle",
    keyboardController: null,
    timerFrame: 0,
    runtime: {
      practice: {
        key: null,
        startedAt: 0,
        errorsThisAttempt: 0,
        orderSelection: [],
      },
      sessions: {},
    },
  };

  function getSession(key) {
    if (!state.runtime.sessions[key]) {
      state.runtime.sessions[key] = {
        attempts: 0,
        cleanHits: 0,
        totalTimeMs: 0,
        totalErrors: 0,
        currentStreak: 0,
        bestStreak: 0,
        feedback: "Choose a module and continue practicing.",
        recentAtomIds: [],
      };
    }
    return state.runtime.sessions[key];
  }

  function renderLoading(message) {
    state.root.innerHTML = `
      <header class="app-header card shell-loading">
        <p class="eyebrow">Russian Skill Coach</p>
        <h1>Loading curriculum and progress</h1>
        <p class="hero-text">${escapeHtml(message)}</p>
      </header>
    `;
  }

  function routeFromHash() {
    const raw = String(window.location.hash || "").replace(/^#/, "").trim();
    if (!raw) {
      return null;
    }

    if (raw === "mixed-review") {
      return "mixed_review";
    }

    return raw;
  }

  function normalizeRoute(route) {
    if (!route || route === "home") {
      return "home";
    }

    if (route === "keyboard" || route === "mixed_review") {
      return route;
    }

    if (state.curriculum?.modulesById[route]) {
      return route;
    }

    return "home";
  }

  function isModuleRoute(route) {
    return Boolean(state.curriculum?.modulesById[route]);
  }

  function isGenericPracticeRoute(route) {
    return isModuleRoute(route) || route === "mixed_review";
  }

  function stageSequenceForAtom(module, atom) {
    return state.curriculum.stageProfiles[atom.stageProfileId] || module.stageProfile;
  }

  function getRouteKey() {
    if (state.route === "mixed_review") {
      return "mixed_review";
    }

    if (isModuleRoute(state.route)) {
      return state.route;
    }

    return null;
  }

  function currentPromptKey() {
    if (!isGenericPracticeRoute(state.route)) {
      return null;
    }

    const prompt =
      state.route === "mixed_review"
        ? state.progress.mixedReview.pendingPrompt
        : state.progress.modules[state.route].pendingPrompt;

    if (!prompt) {
      return null;
    }

    return `${getRouteKey()}:${prompt.atomId}:${prompt.stageId}:${prompt.promptType}:${prompt.contextId || ""}:${prompt.lineIndex ?? ""}`;
  }

  function stopGenericTimer() {
    cancelAnimationFrame(state.timerFrame);
    state.runtime.practice.startedAt = 0;
    state.runtime.practice.key = null;
  }

  function startGenericTimer(promptKey) {
    if (!promptKey) {
      stopGenericTimer();
      return;
    }

    if (state.runtime.practice.key === promptKey && state.runtime.practice.startedAt) {
      return;
    }

    cancelAnimationFrame(state.timerFrame);
    state.runtime.practice.key = promptKey;
    state.runtime.practice.startedAt = performance.now();
    state.runtime.practice.errorsThisAttempt = 0;
    state.runtime.practice.orderSelection = [];

    const tick = () => {
      if (!state.runtime.practice.startedAt) {
        return;
      }

      const timer = state.root.querySelector("[data-live-timer]");
      if (timer) {
        timer.textContent = formatMs(performance.now() - state.runtime.practice.startedAt);
      }
      state.timerFrame = requestAnimationFrame(tick);
    };

    state.timerFrame = requestAnimationFrame(tick);
  }

  function bumpError() {
    state.runtime.practice.errorsThisAttempt += 1;
    const session = getSession(getRouteKey());
    session.currentStreak = 0;
  }

  function setFeedback(ownerKey, message) {
    getSession(ownerKey).feedback = message;
  }

  function visibleSubdeckIds(moduleId) {
    return Progress.getVisibleSubdeckIds(state.progress, state.curriculum.modulesById[moduleId]);
  }

  function visibleAtoms(moduleId, options = {}) {
    const module = state.curriculum.modulesById[moduleId];
    const moduleProgress = state.progress.modules[moduleId];
    const allowedSubdecks = options.selectedOnly
      ? [moduleProgress.selectedSubdeckId]
      : visibleSubdeckIds(moduleId);

    return module.atoms.filter((atom) => allowedSubdecks.includes(atom.subdeckId));
  }

  function atomProgress(moduleId, atomId, create = true) {
    const moduleProgress = state.progress.modules[moduleId];
    if (moduleProgress?.atoms?.[atomId]) {
      return moduleProgress.atoms[atomId];
    }
    return create
      ? Progress.ensureAtomProgress(state.progress, state.curriculum, moduleId, atomId)
      : null;
  }

  function atomStageId(moduleId, atomId, create = false) {
    const progress = atomProgress(moduleId, atomId, create);
    const module = state.curriculum.modulesById[moduleId];
    const atom = module.atomsById[atomId];
    const sequence = stageSequenceForAtom(module, atom).sequence;
    if (!progress) {
      return sequence[0];
    }
    return sequence[progress.currentStageIndex] || sequence[0];
  }

  function atomDifficulty(moduleId, atomId, create = false) {
    const progress = atomProgress(moduleId, atomId, create);
    if (!progress) {
      return 1.2;
    }
    return Progress.computeAtomDifficulty(state.progress, state.curriculum, moduleId, atomId);
  }

  function atomDisplayLabel(atom) {
    switch (atom.kind) {
      case "verb_form":
        return `${atom.lemma} · ${atom.pronoun}`;
      case "past_verb_form":
        return `${atom.lemma} · ${getSlotLabel(atom.slot)}`;
      case "pattern_form":
        return `${atom.lemma} · ${atom.pronoun}`;
      case "pattern_frame":
        return atom.phrase;
      case "possessive_form":
        return `${atom.owner} · ${getSlotLabel(atom.slot)}`;
      case "adjective_form":
        return `${atom.lemma} · ${getSlotLabel(atom.slot)}`;
      case "description_phrase":
      case "age_phrase":
      case "fixed_phrase":
      case "routine_phrase":
      case "vocabulary_word":
        return atom.ru || atom.answer;
      case "noun_gender":
        return atom.ru;
      case "plural_form":
        return `${atom.singular} -> ${atom.plural}`;
      case "number_mapping":
      case "ordinal_mapping":
        return String(atom.value);
      case "dialogue_script":
        return atom.title;
      default:
        return atom.answer || atom.ru || atom.id;
    }
  }

  function moduleCoverage(moduleId) {
    const atoms = visibleAtoms(moduleId);
    const seen = atoms.filter((atom) => atomProgress(moduleId, atom.id, false)?.seen).length;
    return atoms.length ? Math.round((seen / atoms.length) * 100) : 0;
  }

  function moduleDueAtoms(moduleId) {
    const atoms = visibleAtoms(moduleId);
    return atoms.filter((atom) => {
      const progress = atomProgress(moduleId, atom.id, false);
      const sequence = stageSequenceForAtom(state.curriculum.modulesById[moduleId], atom).sequence;
      return (
        !progress?.seen ||
        progress.currentStageIndex < sequence.length - 1 ||
        atomDifficulty(moduleId, atom.id, false) > 1.18
      );
    });
  }

  function moduleWeakAtoms(moduleId, limit = 5) {
    return visibleAtoms(moduleId)
      .filter((atom) => atomProgress(moduleId, atom.id, false)?.seen)
      .sort(
        (left, right) =>
          atomDifficulty(moduleId, right.id, false) - atomDifficulty(moduleId, left.id, false),
      )
      .slice(0, limit);
  }

  function moduleTrend(moduleId) {
    const history = state.progress.modules[moduleId].history;
    const recent = history.slice(-20);
    const previous = history.slice(-40, -20);

    if (recent.length < 6 || previous.length < 6) {
      return {
        title: "Fresh module",
        detail: "Trend appears after a stronger sample.",
      };
    }

    const recentTime = average(recent, (item) => item.timeMs);
    const previousTime = average(previous, (item) => item.timeMs);
    const recentErrors = average(recent, (item) => item.errors);
    const previousErrors = average(previous, (item) => item.errors);
    const timeDiff = Math.round(recentTime - previousTime);
    const errorDiff = recentErrors - previousErrors;

    if (timeDiff < -50 || errorDiff < -0.08) {
      return {
        title: timeDiff < -50 ? `${Math.abs(timeDiff)} ms faster` : "Cleaner lately",
        detail: `${Math.abs(errorDiff).toFixed(2)} fewer errors than the prior block.`,
      };
    }

    if (timeDiff > 50 || errorDiff > 0.08) {
      return {
        title: timeDiff > 50 ? `${timeDiff} ms slower` : "More misses",
        detail: `${errorDiff.toFixed(2)} more errors than the prior block.`,
      };
    }

    return {
      title: "Holding steady",
      detail: "Speed and error rate are close to the prior block.",
    };
  }

  function globalWeakSpots(limit = 8) {
    return state.curriculum.moduleOrder
      .flatMap((moduleId) =>
        moduleWeakAtoms(moduleId, 6).map((atom) => ({
          moduleId,
          atom,
          difficulty: atomDifficulty(moduleId, atom.id, false),
        })),
      )
      .sort((left, right) => right.difficulty - left.difficulty)
      .slice(0, limit);
  }

  function pickNextAtom(moduleId) {
    const session = getSession(moduleId);
    const candidates = visibleAtoms(moduleId, { selectedOnly: true });
    const fallback = visibleAtoms(moduleId);
    const pool = candidates.length ? candidates : fallback;

    if (!pool.length) {
      return null;
    }

    const weighted = pool.map((atom) => {
      let weight = 0.25 + atomDifficulty(moduleId, atom.id, false);
      if (session.recentAtomIds.includes(atom.id)) {
        weight *= 0.6;
      }
      return { atom, weight };
    });

    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let threshold = Math.random() * total;

    for (const entry of weighted) {
      threshold -= entry.weight;
      if (threshold <= 0) {
        return entry.atom;
      }
    }

    return weighted[weighted.length - 1].atom;
  }

  function familyAnswers(module, atom) {
    switch (atom.kind) {
      case "verb_form":
        return module.subdeckById[atom.subdeckId].atoms.filter((item) => item.lemma === atom.lemma);
      case "past_verb_form":
        return module.subdeckById[atom.subdeckId].atoms.filter((item) => item.lemma === atom.lemma);
      case "pattern_form":
        return module.subdeckById[atom.subdeckId].atoms.filter((item) => item.pattern === atom.pattern);
      case "pattern_frame":
        return module.subdeckById[atom.subdeckId].atoms.filter((item) => item.pattern === atom.pattern);
      case "possessive_form":
        return module.subdeckById[atom.subdeckId].atoms.filter((item) => item.owner === atom.owner);
      case "adjective_form":
        return module.subdeckById[atom.subdeckId].atoms.filter((item) => item.lemma === atom.lemma);
      default:
        return module.subdeckById[atom.subdeckId].atoms;
    }
  }

  function fragmentAnswer(module, atom) {
    const family = familyAnswers(module, atom)
      .map((item) => item.answer)
      .filter(Boolean)
      .map(String);

    if (family.length > 1) {
      const prefix = commonPrefix(family);
      const fragment = String(atom.answer).slice(prefix.length);
      if (fragment) {
        return fragment;
      }
    }

    if (atom.stemHint && String(atom.answer).startsWith(atom.stemHint)) {
      const suffix = String(atom.answer).slice(atom.stemHint.length);
      if (suffix) {
        return suffix;
      }
    }

    return String(atom.answer);
  }

  function pickSentenceContext(module, atom) {
    if (Array.isArray(atom.sampleSentenceIds) && atom.sampleSentenceIds.length) {
      return sample(atom.sampleSentenceIds);
    }

    if (module.sentenceBank?.length) {
      if (atom.kind === "past_verb_form") {
        const slotField = {
          masc: "pastMasc",
          fem: "pastFem",
          neut: "pastNeut",
          pl: "pastPl",
        }[atom.slot];

        const match = module.sentenceBank.find(
          (entry) => entry.lemma === atom.lemma && entry[slotField],
        );
        return match?.id || null;
      }

      const byLemma = module.sentenceBank.filter((entry) => entry.lemma === atom.lemma);
      if (byLemma.length) {
        return sample(byLemma)?.id || null;
      }
    }

    return null;
  }

  function buildChoiceOptions(module, atom, stageId, prompt) {
    const targetCount = stageId === "choose2" ? 2 : stageId === "choose4" ? 4 : 12;

    if (atom.kind === "noun_gender") {
      const options = [
        { value: "masc", label: "masc" },
        { value: "fem", label: "fem" },
        { value: "neut", label: "neut" },
      ];
      const answerValue =
        {
          m: "masc",
          f: "fem",
          n: "neut",
        }[atom.answer] || atom.answer;
      if (stageId === "choose2") {
        const distractor = sample(options.filter((option) => option.value !== answerValue));
        return shuffle(
          options.filter((option) => option.value === answerValue).concat(distractor),
        );
      }
      if (stageId === "choose4") {
        return options;
      }
      return options;
    }

    if (atom.kind === "dialogue_script") {
      const lineIndex =
        prompt.lineIndex === null || prompt.lineIndex === undefined
          ? Math.max(1, Math.floor(Math.random() * (atom.lines.length - 1)))
          : prompt.lineIndex;
      const answer = atom.lines[lineIndex];
      const distractors = pickMany(
        atom.lines.filter((line) => normalizeAnswer(line) !== normalizeAnswer(answer)),
        Math.max(1, targetCount - 1),
      );
      return shuffle([{ value: answer, label: answer }, ...distractors.map((value) => ({ value, label: value }))]);
    }

    const family = familyAnswers(module, atom);
    const uniqueOptions = unique(
      family.map((item) => String(item.answer)).filter(Boolean),
    ).map((value) => ({ value, label: value }));

    if (stageId === "choose2" && uniqueOptions.length > 1) {
      const distractor = sample(uniqueOptions.filter((option) => option.value !== atom.answer));
      return shuffle(
        uniqueOptions.filter((option) => option.value === atom.answer).concat(distractor),
      );
    }

    if (stageId === "choose4" && uniqueOptions.length >= 4) {
      const rest = pickMany(
        uniqueOptions.filter((option) => option.value !== atom.answer),
        3,
      );
      return shuffle([{ value: atom.answer, label: atom.answer }, ...rest]);
    }

    if (stageId === "fullChoice" && uniqueOptions.length > 1) {
      return uniqueOptions;
    }

    const subdeckOptions = unique(
      module.subdeckById[atom.subdeckId].atoms
        .map((item) => String(item.answer))
        .filter(Boolean),
    ).map((value) => ({ value, label: value }));

    if (stageId === "choose2") {
      const distractor = sample(subdeckOptions.filter((option) => option.value !== atom.answer));
      return shuffle([{ value: atom.answer, label: atom.answer }, distractor].filter(Boolean));
    }

    if (stageId === "choose4") {
      const rest = pickMany(
        subdeckOptions.filter((option) => option.value !== atom.answer),
        3,
      );
      return shuffle([{ value: atom.answer, label: atom.answer }, ...rest]);
    }

    return subdeckOptions.slice(0, 12);
  }

  function createModulePrompt(moduleId, atom) {
    const module = state.curriculum.modulesById[moduleId];
    const stageId = atomStageId(moduleId, atom.id);
    const prompt = {
      atomId: atom.id,
      stageId,
      stageProfileId: atom.stageProfileId,
      subdeckId: atom.subdeckId,
      promptType: "typed",
      contextId: null,
      lineIndex: null,
      options: [],
      sequence: [],
    };

    if (stageId === "preview") {
      prompt.promptType = "preview";
      prompt.contextId = pickSentenceContext(module, atom);
      return prompt;
    }

    if (stageId === "choose2" || stageId === "choose4" || stageId === "fullChoice") {
      prompt.promptType = "choice";
      if (atom.kind === "dialogue_script") {
        prompt.lineIndex = Math.max(1, Math.floor(Math.random() * (atom.lines.length - 1)));
      }
      prompt.options = buildChoiceOptions(module, atom, stageId, prompt);
      return prompt;
    }

    if (stageId === "lineOrder") {
      prompt.promptType = "lineOrder";
      if (atom.kind === "dialogue_script") {
        const start = Math.max(
          0,
          Math.floor(Math.random() * Math.max(1, atom.lines.length - 4)),
        );
        prompt.lineIndex = start;
        prompt.sequence = atom.lines.slice(start, start + 4);
      } else {
        const items = module.subdeckById[atom.subdeckId].atoms;
        const index = items.findIndex((item) => item.id === atom.id);
        const start = clamp(index - 1, 0, Math.max(0, items.length - 3));
        prompt.sequence = items.slice(start, start + 3).map((item) => item.answer || item.ru);
      }
      prompt.options = shuffle(prompt.sequence).map((value) => ({ value, label: value }));
      return prompt;
    }

    if (
      stageId === "sentenceGuided" ||
      stageId === "sentenceFree" ||
      stageId === "phraseGuided" ||
      stageId === "contextUse" ||
      stageId === "dialogueRoleplay"
    ) {
      prompt.contextId = pickSentenceContext(module, atom);
      if (atom.kind === "dialogue_script") {
        prompt.lineIndex = Math.max(1, Math.floor(Math.random() * (atom.lines.length - 1)));
      }
      return prompt;
    }

    return prompt;
  }

  function ensureModulePrompt(moduleId) {
    const module = state.curriculum.modulesById[moduleId];
    const moduleProgress = state.progress.modules[moduleId];
    const visible = visibleSubdeckIds(moduleId);

    if (!visible.includes(moduleProgress.selectedSubdeckId)) {
      Progress.setSelectedSubdeck(state.progress, moduleId, visible[0] || module.defaultEntrySubdeckId);
    }

    if (moduleProgress.pendingPrompt) {
      return moduleProgress.pendingPrompt;
    }

    const atom = pickNextAtom(moduleId);
    if (!atom) {
      return null;
    }

    const prompt = createModulePrompt(moduleId, atom);
    Progress.setPendingPrompt(state.progress, moduleId, prompt);
    markDirty();
    return prompt;
  }

  function normalizedModuleDifficulty(moduleId) {
    const seen = visibleAtoms(moduleId).filter((atom) => atomProgress(moduleId, atom.id, false)?.seen);
    if (!seen.length) {
      return new Map();
    }

    const entries = seen.map((atom) => [atom.id, atomDifficulty(moduleId, atom.id, false)]);
    const values = entries.map((entry) => entry[1]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const map = new Map();
    entries.forEach(([atomId, difficulty]) => {
      const normalized = max === min ? 0.5 : (difficulty - min) / (max - min);
      map.set(atomId, normalized);
    });
    return map;
  }

  function isMixedEligible(moduleId, atom, modeId) {
    const progress = atomProgress(moduleId, atom.id, false);
    if (!progress?.seen) {
      return false;
    }

    const stageId = atomStageId(moduleId, atom.id, false);
    if (modeId === "production_mix") {
      return ["typeFragment", "typeFull", "sentenceGuided", "sentenceFree", "phraseGuided", "contextUse", "dialogueRoleplay"].includes(stageId);
    }

    return true;
  }

  function buildMixedQueue(modeId) {
    const normalizedMaps = Object.fromEntries(
      state.curriculum.mixedReviewRules.defaultEligibleModules.map((moduleId) => [
        moduleId,
        normalizedModuleDifficulty(moduleId),
      ]),
    );

    const entries = [];
    state.curriculum.mixedReviewRules.defaultEligibleModules.forEach((moduleId) => {
      const module = state.curriculum.modulesById[moduleId];
      visibleAtoms(moduleId).forEach((atom) => {
        if (!isMixedEligible(moduleId, atom, modeId)) {
          return;
        }

        const stageId = atomStageId(moduleId, atom.id);
        let score = normalizedMaps[moduleId].get(atom.id) || 0;
        if (modeId === "before_class") {
          if (["typeFull", "sentenceGuided", "phraseGuided", "dialogueRoleplay"].includes(stageId)) {
            score += 0.25;
          }
          if (["conversation", "first_conjugation", "second_conjugation", "core_patterns", "days_time_routine", "descriptions"].includes(moduleId)) {
            score += 0.08;
          }
        }

        entries.push({
          moduleId,
          atomId: atom.id,
          stageId,
          score,
        });
      });
    });

    return entries
      .sort((left, right) => right.score - left.score)
      .slice(0, 20);
  }

  function ensureMixedReviewQueue() {
    const review = state.progress.mixedReview;
    if (!review.queue.length || review.currentIndex >= review.queue.length) {
      review.queue = buildMixedQueue(review.mode);
      review.currentIndex = 0;
      review.pendingPrompt = null;
      markDirty();
    }

    return review.queue;
  }

  function ensureMixedReviewPrompt() {
    const review = state.progress.mixedReview;
    ensureMixedReviewQueue();

    if (review.pendingPrompt) {
      return review.pendingPrompt;
    }

    const item = review.queue[review.currentIndex];
    if (!item) {
      return null;
    }

    const module = state.curriculum.modulesById[item.moduleId];
    const atom = module.atomsById[item.atomId];
    const prompt = createModulePrompt(item.moduleId, atom);
    prompt.stageId = item.stageId;
    review.pendingPrompt = prompt;
    markDirty();
    return prompt;
  }

  function getAtomExpectedAnswer(module, atom, prompt) {
    if (atom.kind === "noun_gender") {
      return (
        {
          m: "masc",
          f: "fem",
          n: "neut",
        }[atom.answer] || String(atom.answer || "")
      );
    }

    if (prompt.stageId === "typeFragment") {
      return fragmentAnswer(module, atom);
    }

    if (atom.kind === "dialogue_script" && prompt.lineIndex !== null && prompt.lineIndex !== undefined) {
      return atom.lines[prompt.lineIndex];
    }

    return Array.isArray(atom.answer) ? atom.answer.join(" | ") : String(atom.answer || "");
  }

  function currentPromptAtom() {
    if (!isGenericPracticeRoute(state.route)) {
      return null;
    }

    if (state.route === "mixed_review") {
      const prompt = ensureMixedReviewPrompt();
      if (!prompt) {
        return null;
      }
      const item = state.progress.mixedReview.queue[state.progress.mixedReview.currentIndex];
      return state.curriculum.modulesById[item.moduleId].atomsById[prompt.atomId];
    }

    const prompt = ensureModulePrompt(state.route);
    return prompt ? state.curriculum.modulesById[state.route].atomsById[prompt.atomId] : null;
  }

  function currentPromptDescriptor() {
    if (!isGenericPracticeRoute(state.route)) {
      return null;
    }

    const prompt =
      state.route === "mixed_review"
        ? ensureMixedReviewPrompt()
        : ensureModulePrompt(state.route);

    if (!prompt) {
      return null;
    }

    const moduleId =
      state.route === "mixed_review"
        ? state.progress.mixedReview.queue[state.progress.mixedReview.currentIndex]?.moduleId
        : state.route;

    const module = state.curriculum.modulesById[moduleId];
    const atom = module.atomsById[prompt.atomId];

    return {
      moduleId,
      module,
      atom,
      prompt,
      expectedAnswer: getAtomExpectedAnswer(module, atom, prompt),
    };
  }

  function genericPromptHeader(module, atom) {
    switch (atom.kind) {
      case "verb_form":
        return {
          title: `${escapeHtml(atom.lemma)} -> ${escapeHtml(atom.pronoun)}`,
          subtitle: escapeHtml(atom.translation || "Conjugate the verb"),
        };
      case "past_verb_form":
        return {
          title: `${escapeHtml(atom.lemma)} -> ${escapeHtml(getSlotLabel(atom.slot))}`,
          subtitle: escapeHtml(atom.translation || "Past tense"),
        };
      case "pattern_form":
        return {
          title: `${escapeHtml(atom.lemma)} -> ${escapeHtml(atom.pronoun)}`,
          subtitle: escapeHtml(atom.translation || "Pattern form"),
        };
      case "pattern_frame":
        return {
          title: escapeHtml(atom.owner),
          subtitle: escapeHtml(atom.translation || atom.sampleSentence || "Frame builder"),
        };
      case "possessive_form":
        return {
          title: `${escapeHtml(atom.owner)} -> ${escapeHtml(getSlotLabel(atom.slot))}`,
          subtitle: atom.invariant
            ? "Invariant form across noun genders."
            : "Choose the agreeing possessive form.",
        };
      case "adjective_form":
        return {
          title: `${escapeHtml(atom.translation)} -> ${escapeHtml(getSlotLabel(atom.slot))}`,
          subtitle: escapeHtml(atom.lemma),
        };
      case "noun_gender":
        return {
          title: escapeHtml(atom.ru),
          subtitle: escapeHtml(atom.en || "Noun gender"),
        };
      case "plural_form":
        return {
          title: escapeHtml(atom.singular),
          subtitle: escapeHtml(atom.translation || "Plural form"),
        };
      case "number_mapping":
      case "ordinal_mapping":
        return {
          title: escapeHtml(String(atom.value)),
          subtitle: escapeHtml(atom.en || atom.ru || "Number"),
        };
      case "dialogue_script":
        return {
          title: escapeHtml(atom.title),
          subtitle: "Canonical intro dialogue",
        };
      default:
        return {
          title: escapeHtml(atom.en || atom.translation || atom.ru || atom.answer || atom.id),
          subtitle: atom.ru && atom.en ? escapeHtml(atom.ru) : escapeHtml(module.title),
        };
    }
  }

  function promptHintHtml(module, atom, prompt) {
    if (atom.kind === "verb_form") {
      const hints = [];
      if (atom.stemHint) {
        hints.push(`Stem hint: ${escapeHtml(atom.stemHint)}`);
      }
      if (atom.removeFromInfinitive) {
        hints.push(`Remove: ${escapeHtml(atom.removeFromInfinitive)}`);
      }
      if (atom.irregularYa && ["preview", "choose2", "choose4", "sentenceGuided"].includes(prompt.stageId)) {
        hints.push(`Irregular я-form: ${escapeHtml(atom.answer)}`);
      }
      if (hints.length) {
        return `<div class="hint-banner">${hints.join(" · ")}</div>`;
      }
    }

    if (atom.kind === "possessive_form" && atom.invariant) {
      return `<div class="hint-banner">Invariant possessive: the form stays the same across genders.</div>`;
    }

    if (atom.kind === "noun_gender") {
      return `<div class="hint-banner">Gender answer set: masc / fem / neut.</div>`;
    }

    if (atom.kind === "plural_form") {
      return `<div class="hint-banner">Plural type: ${escapeHtml(atom.pluralType || "reviewed pattern")}.</div>`;
    }

    return "";
  }

  function highlightAnswer(sentence, answer, mode) {
    if (!sentence) {
      return "";
    }
    const replacement =
      mode === "guided"
        ? `<span class="guided-slot">${escapeHtml(answer)}</span>`
        : `<span class="guided-blank">${"_".repeat(Math.max(3, String(answer).length))}</span>`;

    const index = sentence.indexOf(answer);
    if (index === -1) {
      return escapeHtml(sentence);
    }

    return `${escapeHtml(sentence.slice(0, index))}${replacement}${escapeHtml(
      sentence.slice(index + answer.length),
    )}`;
  }

  function contextCardHtml(module, atom, prompt, expectedAnswer) {
    const isGuided = prompt.stageId === "sentenceGuided" || prompt.stageId === "phraseGuided";
    const usesSentence =
      prompt.stageId === "sentenceGuided" ||
      prompt.stageId === "sentenceFree" ||
      prompt.stageId === "phraseGuided" ||
      prompt.stageId === "contextUse" ||
      prompt.stageId === "dialogueRoleplay";

    if (!usesSentence) {
      return "";
    }

    if (atom.kind === "dialogue_script" && prompt.lineIndex) {
      const lead = atom.lines[prompt.lineIndex - 1];
      return `
        <div class="context-card chat-context">
          <p class="context-label">Dialogue cue</p>
          <p class="chat-line chat-line-left">${escapeHtml(lead)}</p>
        </div>
      `;
    }

    if (prompt.contextId && module.sentenceBankById[prompt.contextId]) {
      const record = module.sentenceBankById[prompt.contextId];
      const sentenceText =
        record.ru ||
        record.answer ||
        record[
          {
            masc: "pastMasc",
            fem: "pastFem",
            neut: "pastNeut",
            pl: "pastPl",
          }[atom.slot]
        ] ||
        record.present ||
        "";

      const decorated = isGuided
        ? highlightAnswer(sentenceText, expectedAnswer, "guided")
        : highlightAnswer(sentenceText, expectedAnswer, "free");

      return `
        <div class="context-card">
          <p class="context-label">Context</p>
          <p class="context-ru">${decorated}</p>
          <p class="context-en">${escapeHtml(record.en || record.translation || "")}</p>
        </div>
      `;
    }

    if (atom.sampleSentence) {
      return `
        <div class="context-card">
          <p class="context-label">Context</p>
          <p class="context-ru">${isGuided ? highlightAnswer(atom.sampleSentence, expectedAnswer, "guided") : highlightAnswer(atom.sampleSentence, expectedAnswer, "free")}</p>
        </div>
      `;
    }

    if (atom.ru && atom.ru !== atom.answer) {
      return `
        <div class="context-card">
          <p class="context-label">Russian cue</p>
          <p class="context-ru">${isGuided ? highlightAnswer(atom.ru, expectedAnswer, "guided") : highlightAnswer(atom.ru, expectedAnswer, "free")}</p>
          <p class="context-en">${escapeHtml(atom.en || atom.translation || "")}</p>
        </div>
      `;
    }

    return "";
  }

  function promptReferenceStrip(atom, moduleId) {
    if (moduleId === "first_conjugation" || moduleId === "second_conjugation") {
      const chips = ["1sg", "2sg", "3sg", "1pl", "2pl", "3pl"]
        .map(
          (person) => `
            <span class="mini-chip ${atom.person === person ? "active" : ""}">
              ${escapeHtml(getPersonLabel(person))}
            </span>
          `,
        )
        .join("");
      return `<div class="reference-strip">${chips}</div>`;
    }

    if (moduleId === "past_tense" || moduleId === "descriptions") {
      const slot = atom.slot || atom.gender;
      const chips = ["masc", "fem", "neut", "pl"]
        .map(
          (value) => `
            <span class="mini-chip ${slot === value ? "active" : ""}">
              ${escapeHtml(getSlotLabel(value))}
            </span>
          `,
        )
        .join("");
      return `<div class="reference-strip">${chips}</div>`;
    }

    return "";
  }

  function moduleLifetimeStats(moduleId) {
    const totals = state.progress.modules[moduleId].totals;
    if (!totals.attempts) {
      return {
        avgTimeMs: 0,
        avgErrors: 0,
      };
    }
    return {
      avgTimeMs: totals.totalTimeMs / totals.attempts,
      avgErrors: totals.totalErrors / totals.attempts,
    };
  }

  function renderHeatmap(moduleId) {
    const module = state.curriculum.modulesById[moduleId];
    const atoms = visibleAtoms(moduleId);

    if (moduleId === "first_conjugation" || moduleId === "second_conjugation") {
      const lemmas = unique(atoms.map((atom) => atom.lemma));
      const people = ["1sg", "2sg", "3sg", "1pl", "2pl", "3pl"];
      return matrixHtml(
        people.map((person) => ({ key: person, label: getPersonLabel(person) })),
        lemmas,
        (lemma, person) => {
          const atom = atoms.find((entry) => entry.lemma === lemma && entry.person === person);
          return atom ? heatCell(moduleId, atom.id) : `<span class="heat-empty">—</span>`;
        },
      );
    }

    if (moduleId === "past_tense") {
      const lemmas = unique(atoms.map((atom) => atom.lemma));
      const slots = ["masc", "fem", "neut", "pl"];
      return matrixHtml(
        slots.map((slot) => ({ key: slot, label: getSlotLabel(slot) })),
        lemmas,
        (lemma, slot) => {
          const atom = atoms.find((entry) => entry.lemma === lemma && entry.slot === slot);
          return atom ? heatCell(moduleId, atom.id) : `<span class="heat-empty">—</span>`;
        },
      );
    }

    if (moduleId === "descriptions") {
      const group = state.progress.modules[moduleId].selectedSubdeckId;
      if (group === "desc_possessives") {
        const owners = unique(atoms.map((atom) => atom.owner));
        const slots = ["masc", "fem", "neut", "pl"];
        return matrixHtml(
          slots.map((slot) => ({ key: slot, label: getSlotLabel(slot) })),
          owners,
          (owner, slot) => {
            const atom = atoms.find((entry) => entry.owner === owner && entry.slot === slot);
            return atom ? heatCell(moduleId, atom.id) : `<span class="heat-empty">—</span>`;
          },
        );
      }

      const lemmas = unique(atoms.map((atom) => atom.lemma).filter(Boolean)).slice(0, 8);
      const slots = ["masc", "fem", "neut", "pl"];
      return matrixHtml(
        slots.map((slot) => ({ key: slot, label: getSlotLabel(slot) })),
        lemmas,
        (lemma, slot) => {
          const atom = atoms.find((entry) => entry.lemma === lemma && entry.slot === slot);
          return atom ? heatCell(moduleId, atom.id) : `<span class="heat-empty">—</span>`;
        },
      );
    }

    const weakest = moduleWeakAtoms(moduleId, 12);
    return `
      <div class="weak-grid">
        ${weakest
          .map(
            (atom) => `
              <article class="weak-card" style="border-color:${heatColor(atomDifficulty(moduleId, atom.id, false))}">
                <strong>${escapeHtml(atomDisplayLabel(atom))}</strong>
                <span>${escapeHtml(getStageLabel(atomStageId(moduleId, atom.id, false)))}</span>
                <span>${formatMs(atomProgress(moduleId, atom.id, false)?.attempts ? atomProgress(moduleId, atom.id, false).totalTimeMs / atomProgress(moduleId, atom.id, false).attempts : 0)}</span>
              </article>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function heatColor(value) {
    const normalized = clamp((value - 0.8) / 1.2, 0, 1);
    const hue = 148 - normalized * 92;
    const saturation = 62 + normalized * 10;
    const lightness = 88 - normalized * 34;
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  }

  function heatCell(moduleId, atomId) {
    const progress = atomProgress(moduleId, atomId, false);
    const difficulty = atomDifficulty(moduleId, atomId, false);
    const label =
      progress?.seen
        ? formatMs(progress.totalTimeMs / Math.max(1, progress.attempts))
        : "new";
    return `<span class="heat-cell" style="background:${heatColor(difficulty)}">${escapeHtml(label)}</span>`;
  }

  function matrixHtml(columns, rowLabels, renderCell) {
    return `
      <div class="matrix-wrap">
        <table class="matrix-table">
          <thead>
            <tr>
              <th></th>
              ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rowLabels
              .map(
                (rowLabel) => `
                  <tr>
                    <th>${escapeHtml(rowLabel)}</th>
                    ${columns
                      .map((column) => `<td>${renderCell(rowLabel, column.key)}</td>`)
                      .join("")}
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderHomePage() {
    const keyboardWeak = Coach.keyboard.LETTERS.map((letter) => {
      const stats = state.progress.modules.keyboard.letters[letter];
      const difficulty =
        (stats.totalTimeMs + 1600) / (Math.max(1, stats.attempts) + 1) + stats.totalErrors * 220;
      return { letter, difficulty };
    }).sort((left, right) => right.difficulty - left.difficulty)[0];

    const resumeRoute = normalizeRoute(state.progress.navigation.lastRoute || state.progress.navigation.lastModuleId);
    const resumeModuleId =
      resumeRoute === "mixed_review"
        ? state.progress.mixedReview.queue[state.progress.mixedReview.currentIndex]?.moduleId ||
          state.progress.navigation.lastModuleId
        : resumeRoute;
    const resumeModule = isModuleRoute(resumeModuleId)
      ? state.curriculum.modulesById[resumeModuleId]
      : null;
    const resumeSubdeck = resumeModule
      ? resumeModule.subdeckById[state.progress.navigation.lastSubdeckId] ||
        resumeModule.subdeckById[state.progress.modules[resumeModuleId].selectedSubdeckId]
      : null;

    const continueCopy = resumeModule
      ? {
          moduleTitle: resumeRoute === "mixed_review" ? "Mixed Review" : resumeModule.title,
          subdeckTitle: resumeSubdeck?.title || "Resume where you stopped",
          stageTitle: state.progress.navigation.lastStageId
            ? getStageLabel(state.progress.navigation.lastStageId)
            : "Continue",
          dueCount:
            resumeRoute === "mixed_review"
              ? 20
              : moduleDueAtoms(resumeModuleId).length,
        }
      : {
          moduleTitle: "Keyboard",
          subdeckTitle: "Start with the preserved key trainer",
          stageTitle: "Continue",
          dueCount: 33,
        };

    return `
      <section class="hero card">
        <div class="hero-copy">
          <p class="eyebrow">Home</p>
          <h1>Russian Skill Coach</h1>
          <p class="hero-text">
            One tiny atom at a time. Every module tracks time to correct answer, counts error strikes before success, and resurfaces weak spots automatically.
          </p>
          <div class="hero-actions">
            <button class="button button-primary" data-action="resume-last">Resume ${escapeHtml(
              continueCopy.moduleTitle,
            )}</button>
            <button class="button button-secondary" data-action="start-before-class">Before-class review</button>
          </div>
        </div>
        <div class="hero-metrics">
          <article class="metric-block continue-card">
            <span class="metric-label">Continue</span>
            <strong>${escapeHtml(continueCopy.moduleTitle)}</strong>
            <span class="metric-detail">${escapeHtml(continueCopy.subdeckTitle)}</span>
            <span class="metric-detail">${escapeHtml(continueCopy.stageTitle)} · ${continueCopy.dueCount} due</span>
          </article>
          <article class="metric-block">
            <span class="metric-label">Global weak spots</span>
            <strong>${globalWeakSpots(1)[0] ? escapeHtml(atomDisplayLabel(globalWeakSpots(1)[0].atom)) : "Fresh start"}</strong>
            <span class="metric-detail">Weak atoms rise back to the surface until they cool down.</span>
          </article>
        </div>
      </section>

      <section class="module-grid">
        ${[
          {
            id: "keyboard",
            title: "Keyboard",
            due: Coach.keyboard.LETTERS.filter(
              (letter) => state.progress.modules.keyboard.letters[letter].attempts < 5,
            ).length,
            coverage: Math.round(
              (Coach.keyboard.LETTERS.filter(
                (letter) => state.progress.modules.keyboard.letters[letter].attempts > 0,
              ).length /
                Coach.keyboard.LETTERS.length) *
                100,
            ),
            weakLabel: keyboardWeak?.letter || "Fresh",
            trend: "Preserved trainer",
          },
          ...state.curriculum.moduleOrder.map((moduleId) => {
            const module = state.curriculum.modulesById[moduleId];
            const weak = moduleWeakAtoms(moduleId, 1)[0];
            const trend = moduleTrend(moduleId);
            return {
              id: moduleId,
              title: module.title,
              due: moduleDueAtoms(moduleId).length,
              coverage: moduleCoverage(moduleId),
              weak,
              trend: trend.title,
            };
          }),
          {
            id: "mixed_review",
            title: "Mixed Review",
            due: 20,
            coverage: 100,
            weak: null,
            trend: "Daily gym",
          },
        ]
          .map(
            (card) => `
              <a class="module-card card" href="#${card.id === "mixed_review" ? "mixed-review" : card.id}">
                <div class="module-card-head">
                  <p class="section-label">${escapeHtml(card.title)}</p>
                  <span class="module-due">${card.due} due</span>
                </div>
                <h2>${escapeHtml(card.title)}</h2>
                <p class="module-copy">${card.coverage}% seen</p>
                <p class="module-copy">
                  ${
                    card.weakLabel
                      ? `Weak spot: ${escapeHtml(card.weakLabel)}`
                      : card.weak
                        ? `Weak spot: ${escapeHtml(atomDisplayLabel(card.weak.atom || card.weak))}`
                        : "Weak spot: mixed across modules"
                  }
                </p>
                <p class="module-trend">${escapeHtml(card.trend)}</p>
              </a>
            `,
          )
          .join("")}
      </section>

      <section class="bottom-grid">
        <article class="card global-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Global weak spots</p>
              <h2>These atoms are resurfacing hardest</h2>
            </div>
          </div>
          <div class="weak-list">
            ${globalWeakSpots()
              .map(
                (entry) => `
                  <div class="weak-row">
                    <strong>${escapeHtml(entry.moduleId === "keyboard" ? entry.atom : atomDisplayLabel(entry.atom))}</strong>
                    <span>${escapeHtml(
                      entry.moduleId === "keyboard"
                        ? "Keyboard"
                        : state.curriculum.modulesById[entry.moduleId].title,
                    )}</span>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="card global-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Before class</p>
              <h2>20 fast reps across modules</h2>
            </div>
          </div>
          <p class="hero-text">
            Mixed Review never introduces new atoms. It only pulls from atoms you have already seen in their home modules and normalizes difficulty inside each module first.
          </p>
          <button class="button button-primary" data-action="start-before-class">Launch Before-class Review</button>
        </article>
      </section>
    `;
  }

  function genericPracticeCard(descriptor, ownerKey, queueMeta) {
    const { moduleId, module, atom, prompt, expectedAnswer } = descriptor;
    const session = getSession(ownerKey);
    const header = genericPromptHeader(module, atom);
    const inputMode = prompt.promptType;
    const timerText =
      state.runtime.practice.startedAt && state.runtime.practice.key === currentPromptKey()
        ? formatMs(performance.now() - state.runtime.practice.startedAt)
        : "0 ms";

    const previewBody = `
      <div class="answer-reveal">
        <strong>${escapeHtml(expectedAnswer)}</strong>
        <span>${escapeHtml(atom.ru && atom.ru !== expectedAnswer ? atom.ru : atom.en || atom.translation || "")}</span>
      </div>
      <button class="button button-primary" data-action="preview-advance">Continue</button>
    `;

    const choiceBody = `
      <div class="choice-grid">
        ${prompt.options
          .map(
            (option, index) => `
              <button class="choice-button" data-action="choice-answer" data-option-index="${index}">
                ${escapeHtml(option.label || option.value)}
              </button>
            `,
          )
          .join("")}
      </div>
    `;

    const typeBody = `
      <form class="typed-form" data-form="typed-answer">
        <input
          class="typed-input"
          name="answer"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="${escapeHtml(prompt.stageId === "typeFragment" ? "Type the changing fragment" : "Type the answer")}"
          data-autofocus="true"
        />
        <button class="button button-primary" type="submit">Submit</button>
      </form>
    `;

    const lineOrderBody = `
      <div class="order-progress">
        ${state.runtime.practice.orderSelection
          .map((line) => `<span class="order-chip">${escapeHtml(line)}</span>`)
          .join("")}
      </div>
      <div class="choice-grid">
        ${prompt.options
          .map(
            (option, index) => `
              <button class="choice-button" data-action="line-order-pick" data-option-index="${index}">
                ${escapeHtml(option.label || option.value)}
              </button>
            `,
          )
          .join("")}
      </div>
    `;

    return `
      <article class="practice card">
        <div class="practice-header">
          <div>
            <p class="section-label">${escapeHtml(module.title)}</p>
            <h2>${header.title}</h2>
            <p class="practice-copy">${header.subtitle}</p>
          </div>
          <div class="status-pill live">${escapeHtml(getStageLabel(prompt.stageId))}</div>
        </div>

        ${queueMeta || ""}
        ${promptReferenceStrip(atom, moduleId)}
        ${promptHintHtml(module, atom, prompt)}
        ${contextCardHtml(module, atom, prompt, expectedAnswer)}

        <div class="attempt-strip">
          <div class="attempt-stat">
            <span class="attempt-label">Timer</span>
            <strong data-live-timer="true">${escapeHtml(timerText)}</strong>
          </div>
          <div class="attempt-stat">
            <span class="attempt-label">Error strikes</span>
            <strong>${state.runtime.practice.errorsThisAttempt}</strong>
          </div>
          <div class="attempt-stat">
            <span class="attempt-label">Streak</span>
            <strong>${session.currentStreak}</strong>
          </div>
        </div>

        <div class="answer-zone">
          ${inputMode === "preview" ? previewBody : ""}
          ${inputMode === "choice" ? choiceBody : ""}
          ${inputMode === "typed" ? typeBody : ""}
          ${inputMode === "lineOrder" ? lineOrderBody : ""}
        </div>

        <p class="feedback-message">${escapeHtml(session.feedback)}</p>
      </article>
    `;
  }

  function genericAnalyticsCard(moduleId, ownerKey) {
    const session = getSession(ownerKey);
    const lifetime = moduleLifetimeStats(moduleId);
    const totals = state.progress.modules[moduleId].totals;
    const weak = moduleWeakAtoms(moduleId, 6);
    const cleanRate = session.attempts
      ? Math.round((session.cleanHits / session.attempts) * 100)
      : 0;

    return `
      <article class="session card">
        <div class="session-header">
          <div>
            <p class="section-label">Analytics</p>
            <h2>Keep weak spots visible</h2>
          </div>
          <div class="session-badge">${session.attempts ? "In session" : "Fresh run"}</div>
        </div>

        <div class="stats-grid">
          <div class="stat-tile accent-coral">
            <span class="tile-label">Session attempts</span>
            <strong>${session.attempts}</strong>
            <span class="tile-foot">${cleanRate}% clean reps</span>
          </div>
          <div class="stat-tile accent-mint">
            <span class="tile-label">Session avg</span>
            <strong>${session.attempts ? formatMs(session.totalTimeMs / session.attempts) : "0 ms"}</strong>
            <span class="tile-foot">${session.attempts ? formatErrors(session.totalErrors / session.attempts) : "0.00"} avg errors</span>
          </div>
          <div class="stat-tile accent-sand">
            <span class="tile-label">Lifetime avg</span>
            <strong>${totals.attempts ? formatMs(lifetime.avgTimeMs) : "0 ms"}</strong>
            <span class="tile-foot">${formatErrors(lifetime.avgErrors)} avg errors</span>
          </div>
          <div class="stat-tile accent-ink">
            <span class="tile-label">Lifetime totals</span>
            <strong>${totals.attempts}</strong>
            <span class="tile-foot">${formatStudyDuration(totals.totalTimeMs)} studied</span>
          </div>
        </div>

        <div class="focus-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Weakest items</p>
              <h3>Slow or error-heavy atoms</h3>
            </div>
          </div>
          <div class="weak-list">
            ${weak.length
              ? weak
                  .map(
                    (atom) => `
                      <div class="weak-row">
                        <strong>${escapeHtml(atomDisplayLabel(atom))}</strong>
                        <span>${escapeHtml(getStageLabel(atomStageId(moduleId, atom.id)))}</span>
                      </div>
                    `,
                  )
                  .join("")
              : `<div class="weak-row"><strong>Fresh module</strong><span>No weak items yet.</span></div>`}
          </div>
        </div>
      </article>
    `;
  }

  function renderGenericModulePage(moduleId) {
    const module = state.curriculum.modulesById[moduleId];
    const moduleProgress = state.progress.modules[moduleId];
    const descriptor = currentPromptDescriptor();
    const trend = moduleTrend(moduleId);
    const hiddenCards = module.subdecks.filter((subdeck) => subdeck.hiddenByDefault);

    return `
      <section class="hero card compact-hero">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(module.title)}</p>
          <h1>${escapeHtml(module.title)}</h1>
          <p class="hero-text">${escapeHtml(module.purpose)}</p>
          <div class="hero-actions">
            ${hiddenCards
              .map(
                (subdeck) => `
                  <button
                    class="button button-ghost"
                    data-action="toggle-hidden-subdeck"
                    data-module-id="${moduleId}"
                    data-subdeck-id="${subdeck.subdeckId}"
                  >
                    ${moduleProgress.hiddenEnabled.includes(subdeck.subdeckId) ? "Hide" : "Show"} ${escapeHtml(subdeck.title)}
                  </button>
                `,
              )
              .join("")}
            ${
              moduleId === "past_tense"
                ? `
                  <button class="button button-ghost" data-action="toggle-speaker-gender">
                    Speaker gender: ${escapeHtml(state.progress.preferences.speakerGender)}
                  </button>
                `
                : ""
            }
          </div>
        </div>
        <div class="hero-metrics">
          <div class="metric-block">
            <span class="metric-label">Due now</span>
            <strong>${moduleDueAtoms(moduleId).length}</strong>
            <span class="metric-detail">${moduleCoverage(moduleId)}% seen</span>
          </div>
          <div class="metric-block">
            <span class="metric-label">Trend</span>
            <strong>${escapeHtml(trend.title)}</strong>
            <span class="metric-detail">${escapeHtml(trend.detail)}</span>
          </div>
        </div>
      </section>

      <section class="chip-row">
        ${module.subdecks
          .filter(
            (subdeck) =>
              !subdeck.hiddenByDefault || moduleProgress.hiddenEnabled.includes(subdeck.subdeckId),
          )
          .map(
            (subdeck) => `
              <button
                class="module-chip ${moduleProgress.selectedSubdeckId === subdeck.subdeckId ? "active" : ""}"
                data-action="select-subdeck"
                data-module-id="${moduleId}"
                data-subdeck-id="${subdeck.subdeckId}"
              >
                ${escapeHtml(subdeck.title)}
              </button>
            `,
          )
          .join("")}
      </section>

      <section class="top-grid">
        ${descriptor ? genericPracticeCard(descriptor, moduleId) : `<article class="practice card"><p class="hero-text">No visible atoms yet.</p></article>`}
        ${genericAnalyticsCard(moduleId, moduleId)}
      </section>

      <section class="bottom-grid">
        <article class="card">
          <div class="panel-header">
            <div>
              <p class="section-label">Weak-spot view</p>
              <h2>${escapeHtml(module.analytics?.heatmap || "Atom surface")}</h2>
            </div>
          </div>
          ${renderHeatmap(moduleId)}
        </article>
      </section>
    `;
  }

  function renderMixedReviewPage() {
    ensureMixedReviewQueue();
    const review = state.progress.mixedReview;
    const descriptor = currentPromptDescriptor();
    const modeButtons = state.curriculum.mixedReviewRules.modes
      .map(
        (mode) => `
          <button class="module-chip ${review.mode === mode.id ? "active" : ""}" data-action="set-mixed-mode" data-mode-id="${mode.id}">
            ${escapeHtml(mode.title)}
          </button>
        `,
      )
      .join("");

    const queueMeta = descriptor
      ? `
        <div class="queue-meta">
          <span class="mini-chip active">${review.currentIndex + 1} / ${review.queue.length || 20}</span>
          <span class="mini-chip">${escapeHtml(
            state.curriculum.modulesById[descriptor.moduleId].title,
          )}</span>
        </div>
      `
      : "";

    return `
      <section class="hero card compact-hero">
        <div class="hero-copy">
          <p class="eyebrow">Mixed Review</p>
          <h1>Daily gym across modules</h1>
          <p class="hero-text">${escapeHtml(state.curriculum.mixedReviewRules.purpose)}</p>
        </div>
        <div class="hero-metrics">
          <div class="metric-block">
            <span class="metric-label">Current mode</span>
            <strong>${escapeHtml(review.mode)}</strong>
            <span class="metric-detail">${review.queue.length} queued reps</span>
          </div>
        </div>
      </section>

      <section class="chip-row">
        ${modeButtons}
      </section>

      <section class="top-grid">
        ${descriptor ? genericPracticeCard(descriptor, "mixed_review", queueMeta) : `<article class="practice card"><p class="hero-text">No eligible atoms yet. Train a home module first.</p></article>`}
        <article class="session card">
          <div class="session-header">
            <div>
              <p class="section-label">Rules</p>
              <h2>Only seen atoms qualify</h2>
            </div>
          </div>
          <div class="weak-list">
            ${state.curriculum.mixedReviewRules.modes
              .map(
                (mode) => `
                  <div class="weak-row">
                    <strong>${escapeHtml(mode.title)}</strong>
                    <span>${escapeHtml(mode.selectionRule)}</span>
                  </div>
                `,
              )
              .join("")}
          </div>
        </article>
      </section>
    `;
  }

  function navigationHtml() {
    const items = [
      { id: "home", title: "Home", href: "#home" },
      { id: "keyboard", title: "Keyboard", href: "#keyboard" },
      ...state.curriculum.moduleOrder.map((moduleId) => ({
        id: moduleId,
        title: state.curriculum.modulesById[moduleId].title,
        href: `#${moduleId}`,
      })),
      { id: "mixed_review", title: "Mixed Review", href: "#mixed-review" },
    ];

    return items
      .map(
        (item) => `
          <a class="nav-chip ${state.route === item.id ? "active" : ""}" href="${item.href}">
            ${escapeHtml(item.title)}
          </a>
        `,
      )
      .join("");
  }

  function saveStatusText() {
    if (!state.ready) {
      return "Loading";
    }
    if (state.saveInFlight || state.saveQueued) {
      return "Saving";
    }
    if (state.serverError) {
      return "Offline";
    }
    if (state.lastSaveOutcome === "saved") {
      return "Synced";
    }
    return "Ready";
  }

  function renderShell(contentHtml) {
    state.root.innerHTML = `
      <header class="app-header card">
        <div>
          <p class="eyebrow">Russian Skill Coach</p>
          <h1>Russian Skill Coach</h1>
        </div>
        <div class="header-actions">
          <span class="save-pill ${state.serverError ? "offline" : ""}">${escapeHtml(
            saveStatusText(),
          )}</span>
          <button class="button button-ghost" data-action="export-data">Export</button>
          <button class="button button-ghost" data-action="import-data">Import</button>
          <button class="button button-danger" data-action="reset-data">Reset</button>
          <input id="app-import-input" type="file" accept="application/json" hidden />
        </div>
      </header>

      <nav class="nav-row">
        ${navigationHtml()}
      </nav>

      <main class="page-stack">
        ${contentHtml}
      </main>
    `;
  }

  function syncPromptTimer() {
    if (!isGenericPracticeRoute(state.route)) {
      stopGenericTimer();
      return;
    }

    const promptKey = currentPromptKey();
    if (!promptKey) {
      stopGenericTimer();
      return;
    }

    startGenericTimer(promptKey);
    const autofocus = state.root.querySelector("[data-autofocus]");
    if (autofocus) {
      autofocus.focus();
      autofocus.select?.();
    }
  }

  function mountKeyboardPage() {
    renderShell(`<section id="keyboard-mount"></section>`);
    const mount = state.root.querySelector("#keyboard-mount");
    if (!state.keyboardController) {
      state.keyboardController = Coach.keyboard.createController({
        getProgress: () => state.progress,
        markDirty,
      });
    }
    state.keyboardController.mount(mount);
    stopGenericTimer();
  }

  function unmountKeyboardPage() {
    if (state.keyboardController) {
      state.keyboardController.unmount();
    }
  }

  function render() {
    if (!state.ready) {
      renderLoading("Loading Russian Skill Coach...");
      return;
    }

    if (state.route === "keyboard") {
      mountKeyboardPage();
      return;
    }

    unmountKeyboardPage();

    if (state.route === "home") {
      renderShell(renderHomePage());
    } else if (state.route === "mixed_review") {
      renderShell(renderMixedReviewPage());
    } else if (isModuleRoute(state.route)) {
      renderShell(renderGenericModulePage(state.route));
    } else {
      renderShell(renderHomePage());
    }

    syncPromptTimer();
  }

  function markDirty() {
    if (!state.progress) {
      return;
    }
    state.progress.updatedAt = Date.now();
    state.saveQueued = true;
    void flushSaveQueue();
  }

  async function flushSaveQueue() {
    if (state.saveInFlight || !state.saveQueued || !state.ready) {
      return;
    }

    state.saveInFlight = true;
    window.clearTimeout(state.retryTimer);

    try {
      while (state.saveQueued && state.ready) {
        state.saveQueued = false;
        const result = await Progress.putProgress(
          state.progress,
          state.serverUpdatedAt,
          state.curriculum,
        );

        if (result.conflict) {
          state.progress = result.progress;
          state.serverUpdatedAt = result.updatedAt;
          state.lastSaveOutcome = "conflict";
          setFeedback(getRouteKey() || "home", "Another tab saved first. The latest server copy won.");
          render();
          return;
        }

        state.progress = result.progress;
        state.serverUpdatedAt = result.updatedAt;
        state.serverError = false;
        state.lastSaveOutcome = "saved";
      }
    } catch (error) {
      state.serverError = true;
      state.lastSaveOutcome = "error";
      state.saveQueued = true;
      console.error(error);
      state.retryTimer = window.setTimeout(() => {
        void flushSaveQueue();
      }, Progress.SAVE_RETRY_MS);
    } finally {
      state.saveInFlight = false;
      if (state.route !== "keyboard") {
        render();
      }
    }
  }

  async function exportData() {
    const blob = new Blob([JSON.stringify(state.progress, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `russian-skill-coach-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file) {
    try {
      const text = await file.text();
      state.progress = Progress.sanitizeProgress(JSON.parse(text), state.curriculum);
      markDirty();
      render();
    } catch (error) {
      console.error(error);
      window.alert("Import failed. Pick a valid progress export.");
    }
  }

  async function resetData() {
    const confirmed = window.confirm("Reset all saved progress for Russian Skill Coach?");
    if (!confirmed) {
      return;
    }

    state.progress = Progress.createDefaultProgress(state.curriculum);
    state.runtime.sessions = {};
    state.progress.navigation.lastRoute = "home";
    state.route = "home";
    markDirty();
    render();
  }

  function routeTo(route) {
    const normalized = normalizeRoute(route);
    if (state.route === normalized) {
      return;
    }

    if (state.route === "keyboard") {
      unmountKeyboardPage();
    }

    stopGenericTimer();
    state.route = normalized;
    Progress.setNavigation(state.progress, normalized, isModuleRoute(normalized) ? normalized : undefined);
    markDirty();
    render();
  }

  function completePracticeAttempt(descriptor, timeMs, errors) {
    const ownerKey = getRouteKey();
    const session = getSession(ownerKey);
    session.attempts += 1;
    session.cleanHits += errors === 0 ? 1 : 0;
    session.totalTimeMs += timeMs;
    session.totalErrors += errors;
    session.currentStreak += 1;
    session.bestStreak = Math.max(session.bestStreak, session.currentStreak);
    session.recentAtomIds = [descriptor.atom.id, ...session.recentAtomIds].slice(0, 4);
    setFeedback(
      ownerKey,
      errors === 0
        ? `Clean rep. ${formatMs(timeMs)}.`
        : `Corrected in ${formatMs(timeMs)} with ${errors} strike${errors === 1 ? "" : "s"}.`,
    );

    Progress.recordAtomAttempt(
      state.progress,
      state.curriculum,
      descriptor.moduleId,
      descriptor.atom.id,
      descriptor.prompt.stageId,
      timeMs,
      errors,
      session.currentStreak,
    );

    if (state.route === "mixed_review") {
      state.progress.mixedReview.totals.attempts += 1;
      state.progress.mixedReview.totals.totalTimeMs += timeMs;
      state.progress.mixedReview.totals.totalErrors += errors;
      state.progress.mixedReview.totals.bestStreak = Math.max(
        state.progress.mixedReview.totals.bestStreak,
        session.currentStreak,
      );
      state.progress.mixedReview.pendingPrompt = null;
      state.progress.mixedReview.currentIndex += 1;
      if (state.progress.mixedReview.currentIndex >= state.progress.mixedReview.queue.length) {
        state.progress.mixedReview.queue = [];
        state.progress.mixedReview.currentIndex = 0;
      }
    }

    stopGenericTimer();
    markDirty();
    render();
  }

  function handleChoice(index) {
    const descriptor = currentPromptDescriptor();
    if (!descriptor) {
      return;
    }

    const choice = descriptor.prompt.options[index];
    if (!choice) {
      return;
    }

    const expected = descriptor.expectedAnswer;
    if (answersMatch(choice.value, expected)) {
      const elapsed = performance.now() - state.runtime.practice.startedAt;
      completePracticeAttempt(descriptor, elapsed, state.runtime.practice.errorsThisAttempt);
      return;
    }

    bumpError();
    setFeedback(getRouteKey(), `Not ${expected}. Error strikes: ${state.runtime.practice.errorsThisAttempt}.`);
    render();
  }

  function handlePreviewAdvance() {
    const descriptor = currentPromptDescriptor();
    if (!descriptor) {
      return;
    }

    const elapsed = performance.now() - state.runtime.practice.startedAt;
    completePracticeAttempt(descriptor, elapsed, 0);
  }

  function handleLineOrder(index) {
    const descriptor = currentPromptDescriptor();
    if (!descriptor) {
      return;
    }

    const choice = descriptor.prompt.options[index];
    if (!choice) {
      return;
    }

    const nextIndex = state.runtime.practice.orderSelection.length;
    const expected = descriptor.prompt.sequence[nextIndex];
    if (answersMatch(choice.value, expected)) {
      state.runtime.practice.orderSelection.push(choice.value);
      if (state.runtime.practice.orderSelection.length === descriptor.prompt.sequence.length) {
        const elapsed = performance.now() - state.runtime.practice.startedAt;
        completePracticeAttempt(descriptor, elapsed, state.runtime.practice.errorsThisAttempt);
        return;
      }
      render();
      return;
    }

    bumpError();
    state.runtime.practice.orderSelection = [];
    setFeedback(getRouteKey(), `Wrong order. Error strikes: ${state.runtime.practice.errorsThisAttempt}.`);
    render();
  }

  function handleTypedSubmit(form) {
    const descriptor = currentPromptDescriptor();
    if (!descriptor) {
      return;
    }

    const answer = new FormData(form).get("answer");
    if (answersMatch(answer, descriptor.expectedAnswer)) {
      const elapsed = performance.now() - state.runtime.practice.startedAt;
      completePracticeAttempt(descriptor, elapsed, state.runtime.practice.errorsThisAttempt);
      return;
    }

    bumpError();
    setFeedback(
      getRouteKey(),
      `Not ${descriptor.expectedAnswer}. Error strikes: ${state.runtime.practice.errorsThisAttempt}.`,
    );
    render();
  }

  function handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    if (action === "resume-last") {
      event.preventDefault();
      const route =
        state.progress.navigation.lastRoute ||
        state.progress.navigation.lastModuleId ||
        "keyboard";
      window.location.hash = route === "mixed_review" ? "mixed-review" : route;
      return;
    }

    if (action === "start-before-class") {
      event.preventDefault();
      state.progress.mixedReview.mode = "before_class";
      state.progress.navigation.mixedReviewMode = "before_class";
      state.progress.mixedReview.queue = [];
      window.location.hash = "mixed-review";
      return;
    }

    if (action === "export-data") {
      event.preventDefault();
      void exportData();
      return;
    }

    if (action === "import-data") {
      event.preventDefault();
      state.root.querySelector("#app-import-input")?.click();
      return;
    }

    if (action === "reset-data") {
      event.preventDefault();
      void resetData();
      return;
    }

    if (action === "toggle-hidden-subdeck") {
      event.preventDefault();
      const { moduleId, subdeckId } = actionTarget.dataset;
      const enabled = !state.progress.modules[moduleId].hiddenEnabled.includes(subdeckId);
      Progress.setHiddenSubdeck(state.progress, moduleId, subdeckId, enabled);
      state.progress.modules[moduleId].pendingPrompt = null;
      markDirty();
      render();
      return;
    }

    if (action === "toggle-speaker-gender") {
      event.preventDefault();
      state.progress.preferences.speakerGender =
        state.progress.preferences.speakerGender === "fem" ? "masc" : "fem";
      markDirty();
      render();
      return;
    }

    if (action === "select-subdeck") {
      event.preventDefault();
      Progress.setSelectedSubdeck(
        state.progress,
        actionTarget.dataset.moduleId,
        actionTarget.dataset.subdeckId,
      );
      state.progress.modules[actionTarget.dataset.moduleId].pendingPrompt = null;
      markDirty();
      render();
      return;
    }

    if (action === "preview-advance") {
      event.preventDefault();
      handlePreviewAdvance();
      return;
    }

    if (action === "choice-answer") {
      event.preventDefault();
      handleChoice(Number(actionTarget.dataset.optionIndex));
      return;
    }

    if (action === "line-order-pick") {
      event.preventDefault();
      handleLineOrder(Number(actionTarget.dataset.optionIndex));
      return;
    }

    if (action === "set-mixed-mode") {
      event.preventDefault();
      state.progress.mixedReview.mode = actionTarget.dataset.modeId;
      state.progress.navigation.mixedReviewMode = actionTarget.dataset.modeId;
      state.progress.mixedReview.queue = [];
      state.progress.mixedReview.currentIndex = 0;
      state.progress.mixedReview.pendingPrompt = null;
      markDirty();
      render();
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest("[data-form='typed-answer']");
    if (!form) {
      return;
    }

    event.preventDefault();
    handleTypedSubmit(form);
  }

  function handleImportChange(event) {
    const [file] = event.target.files || [];
    if (file) {
      void importData(file);
    }
    event.target.value = "";
  }

  function handleDocumentKeydown(event) {
    if (state.route === "keyboard" && state.keyboardController?.handleKeydown(event)) {
      return;
    }
  }

  function attachGlobalEvents() {
    state.root.addEventListener("click", handleClick);
    state.root.addEventListener("submit", handleSubmit);
    state.root.addEventListener("change", (event) => {
      if (event.target.matches("#app-import-input")) {
        handleImportChange(event);
      }
    });
    document.addEventListener("keydown", handleDocumentKeydown);
    window.addEventListener("hashchange", () => {
      state.route = normalizeRoute(routeFromHash() || state.progress.navigation.lastRoute || "home");
      Progress.setNavigation(
        state.progress,
        state.route,
        isModuleRoute(state.route) ? state.route : undefined,
      );
      render();
    });
  }

  async function initialize() {
    state.root = document.getElementById("app");
    renderLoading("Loading curriculum pack...");

    try {
      state.curriculum = await Coach.curriculum.load();
      attachGlobalEvents();
      const loaded = await Progress.fetchProgress(state.curriculum);
      state.progress = loaded.progress;
      state.serverUpdatedAt = loaded.updatedAt;
      state.ready = true;
    } catch (error) {
      console.error(error);
      if (!state.curriculum) {
        renderLoading("Could not load curriculum files.");
        return;
      }

      state.progress = Progress.createDefaultProgress(state.curriculum);
      state.serverUpdatedAt = 0;
      state.serverError = true;
      state.ready = true;
    }

    state.route = normalizeRoute(
      routeFromHash() || state.progress.navigation.lastRoute || "home",
    );
    render();
  }

  void initialize();
})();
