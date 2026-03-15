const STORAGE_KEY = "russian-conjugation-coach-v1";
const RECENT_PER_STAGE = 12;
const MODULE_HISTORY_LIMIT = 600;
const PICK_TOP_N = 8;
const PROMPT_ADVANCE_DELAY_MS = 650;

const SUCCESS_LINES = [
  "Clean hit.",
  "Sharp.",
  "Locked in.",
  "That one landed well.",
  "Smooth retrieval.",
];
const RECOVER_LINES = [
  "Corrected.",
  "Recovered well.",
  "Found it.",
  "Tracked it down.",
];

const STAGE_LABELS = {
  preview: "Preview",
  choose2: "Choose 2",
  choose4: "Choose 4",
  fullChoice: "Full choice",
  typeFragment: "Type fragment",
  typeFull: "Type full",
  sentenceGuided: "Sentence guided",
  sentenceFree: "Sentence free",
};

const sharedConfig = window.CONJUGATION_SHARED_CONFIG;
const stageProfile = sharedConfig.stageProfiles.grammar_full;
const STAGE_SEQUENCE = stageProfile.sequence.slice();
const TARGET_TIME_BY_STAGE = sharedConfig.resumeSelection.targetTimeByStageMs;
const MODULE_DECKS = [window.FIRST_CONJUGATION_DECK, window.SECOND_CONJUGATION_DECK];
const PERSONS = sharedConfig.persons.slice();
const PERSONS_BY_ID = Object.fromEntries(PERSONS.map((person) => [person.id, person]));

const elements = {
  startButton: document.getElementById("start-button"),
  pauseButton: document.getElementById("pause-button"),
  exportButton: document.getElementById("export-button"),
  importButton: document.getElementById("import-button"),
  importInput: document.getElementById("import-input"),
  resetButton: document.getElementById("reset-button"),
  moduleTabs: document.getElementById("module-tabs"),
  subdeckTabs: document.getElementById("subdeck-tabs"),
  personChips: document.getElementById("person-chips"),
  coverageCount: document.getElementById("coverage-count"),
  coverageDetail: document.getElementById("coverage-detail"),
  recentTrend: document.getElementById("recent-trend"),
  recentTrendDetail: document.getElementById("recent-trend-detail"),
  practiceTitle: document.getElementById("practice-title"),
  stageRail: document.getElementById("stage-rail"),
  practiceProgress: document.getElementById("practice-progress"),
  irregularBanner: document.getElementById("irregular-banner"),
  statusPill: document.getElementById("status-pill"),
  targetDisplay: document.getElementById("target-display"),
  answerArea: document.getElementById("answer-area"),
  liveTimer: document.getElementById("live-timer"),
  attemptErrors: document.getElementById("attempt-errors"),
  currentStreak: document.getElementById("current-streak"),
  feedbackMessage: document.getElementById("feedback-message"),
  layoutHint: document.getElementById("layout-hint"),
  sessionBadge: document.getElementById("session-badge"),
  sessionAttempts: document.getElementById("session-attempts"),
  sessionCleanRate: document.getElementById("session-clean-rate"),
  sessionAverageTime: document.getElementById("session-average-time"),
  sessionAverageTimeDetail: document.getElementById("session-average-time-detail"),
  sessionAverageErrors: document.getElementById("session-average-errors"),
  sessionBestStreak: document.getElementById("session-best-streak"),
  lifetimeAverageTime: document.getElementById("lifetime-average-time"),
  lifetimeAverageErrors: document.getElementById("lifetime-average-errors"),
  lifetimeTotals: document.getElementById("lifetime-totals"),
  leaderboardTotalAttempts: document.getElementById("leaderboard-total-attempts"),
  leaderboardTotalStudyTime: document.getElementById("leaderboard-total-study-time"),
  focusLetters: document.getElementById("focus-letters"),
  heatmapTitle: document.getElementById("heatmap-title"),
  keyboardMap: document.getElementById("keyboard-map"),
  statsTableBody: document.getElementById("stats-table-body"),
};

const runtime = buildRuntime(MODULE_DECKS, sharedConfig);
let data = createDefaultData();
let session = createSession();
let timerFrame = 0;
const appState = {
  ready: false,
  lastSaveOutcome: "idle",
};

function buildRuntime(decks, shared) {
  const runtimeModules = {};
  const atomsById = {};

  decks.forEach((deck) => {
    const subdecksById = Object.fromEntries(deck.subdecks.map((subdeck) => [subdeck.id, subdeck]));
    const module = {
      ...deck,
      persons: shared.persons.slice(),
      subdecksById,
      atoms: [],
      atomsBySubdeckId: {},
      verbsById: {},
      defaultSubdeckId:
        deck.subdecks.find((subdeck) => subdeck.defaultEntry)?.id || deck.subdecks[0]?.id,
    };

    deck.subdecks.forEach((subdeck) => {
      module.atomsBySubdeckId[subdeck.id] = [];
      subdeck.verbs.forEach((verb) => {
        module.verbsById[verb.id] = { ...verb, subdeckId: subdeck.id, subdeckTitle: subdeck.title };

        shared.personOrder.forEach((personId) => {
          const atomId = [deck.moduleId, subdeck.id, verb.id, personId].join("__");
          const atom = {
            id: atomId,
            moduleId: deck.moduleId,
            moduleTitle: deck.title,
            subdeckId: subdeck.id,
            subdeckTitle: subdeck.title,
            verbId: verb.id,
            lemma: verb.lemma,
            translation: verb.translation,
            personId,
            person: PERSONS_BY_ID[personId],
            form: verb.forms[personId],
            forms: { ...verb.forms },
            fragmentBase: verb.fragmentBaseByPerson[personId],
            previewSplit: { ...verb.previewSplit },
            contextFrames: Array.isArray(verb.contextFrames) ? verb.contextFrames.slice() : [],
            exampleSentences: Array.isArray(verb.exampleSentences) ? verb.exampleSentences.slice() : [],
            coachNote: verb.coachNote || "",
            irregularYa: Boolean(verb.irregularYa),
            irregularPattern: verb.irregularPattern || null,
            showIrregularYaBanner: Boolean(verb.showIrregularYaBanner),
            irregularYaBannerText: verb.irregularYaBannerText || "",
            regularityTag: verb.regularityTag || "regular",
            tags: Array.isArray(verb.tags) ? verb.tags.slice() : [],
          };
          module.atoms.push(atom);
          module.atomsBySubdeckId[subdeck.id].push(atom);
          atomsById[atomId] = atom;
        });
      });
    });

    runtimeModules[deck.moduleId] = module;
  });

  return {
    modules: runtimeModules,
    atomsById,
    moduleOrder: decks.map((deck) => deck.moduleId),
    defaultModuleId: decks[0]?.moduleId || null,
  };
}

function createStageProgress() {
  return {
    attempts: 0,
    correct: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    lastSeenAt: null,
    recent: [],
  };
}

function createAtomProgress() {
  const stageStats = {};
  STAGE_SEQUENCE.forEach((stage) => {
    stageStats[stage] = createStageProgress();
  });

  return {
    currentStage: STAGE_SEQUENCE[0],
    mastered: false,
    totalAttempts: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    bestTimeMs: null,
    lastSeenAt: null,
    recent: [],
    stageStats,
  };
}

function createDefaultData() {
  const modules = {};
  const activeSubdeckIdByModule = {};
  const activePersonFilterByModule = {};

  runtime.moduleOrder.forEach((moduleId) => {
    const module = runtime.modules[moduleId];
    activeSubdeckIdByModule[moduleId] = module.defaultSubdeckId;
    activePersonFilterByModule[moduleId] = "all";

    const atoms = {};
    module.atoms.forEach((atom) => {
      atoms[atom.id] = createAtomProgress();
    });

    modules[moduleId] = {
      totals: {
        attempts: 0,
        totalTimeMs: 0,
        totalErrors: 0,
        bestStreak: 0,
      },
      history: [],
      atoms,
    };
  });

  return {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    preferences: {
      activeModuleId: runtime.defaultModuleId,
      activeSubdeckIdByModule,
      activePersonFilterByModule,
    },
    modules,
  };
}

function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function sanitizeRecent(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      timeMs: ensureNumber(item.timeMs, 0),
      errors: ensureNumber(item.errors, 0),
      at: ensureNumber(item.at, Date.now()),
    }))
    .filter((item) => item.timeMs >= 0 && item.errors >= 0)
    .slice(-RECENT_PER_STAGE);
}

function sanitizeHistory(items, moduleId) {
  const moduleAtoms = new Set(runtime.modules[moduleId].atoms.map((atom) => atom.id));
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      atomId: moduleAtoms.has(item.atomId) ? item.atomId : null,
      stage: STAGE_SEQUENCE.includes(item.stage) ? item.stage : STAGE_SEQUENCE[0],
      timeMs: ensureNumber(item.timeMs, 0),
      errors: ensureNumber(item.errors, 0),
      at: ensureNumber(item.at, Date.now()),
    }))
    .filter((item) => item.atomId)
    .slice(-MODULE_HISTORY_LIMIT);
}

function hydrateData(parsed) {
  const base = createDefaultData();
  if (!parsed || typeof parsed !== "object") {
    return base;
  }

  base.createdAt = ensureNumber(parsed.createdAt, base.createdAt);
  base.updatedAt = ensureNumber(parsed.updatedAt, base.updatedAt);

  const requestedModuleId = parsed.preferences?.activeModuleId;
  base.preferences.activeModuleId = runtime.moduleOrder.includes(requestedModuleId)
    ? requestedModuleId
    : base.preferences.activeModuleId;

  runtime.moduleOrder.forEach((moduleId) => {
    const sourceModule = parsed.modules?.[moduleId] || {};
    base.modules[moduleId].totals.attempts = ensureNumber(sourceModule.totals?.attempts, 0);
    base.modules[moduleId].totals.totalTimeMs = ensureNumber(sourceModule.totals?.totalTimeMs, 0);
    base.modules[moduleId].totals.totalErrors = ensureNumber(sourceModule.totals?.totalErrors, 0);
    base.modules[moduleId].totals.bestStreak = ensureNumber(sourceModule.totals?.bestStreak, 0);
    base.modules[moduleId].history = sanitizeHistory(sourceModule.history, moduleId);

    const allowedSubdeckIds = new Set(runtime.modules[moduleId].subdecks.map((subdeck) => subdeck.id));
    const preferredSubdeck = parsed.preferences?.activeSubdeckIdByModule?.[moduleId];
    if (allowedSubdeckIds.has(preferredSubdeck)) {
      base.preferences.activeSubdeckIdByModule[moduleId] = preferredSubdeck;
    }

    const preferredPerson = parsed.preferences?.activePersonFilterByModule?.[moduleId];
    if (preferredPerson === "all" || PERSONS_BY_ID[preferredPerson]) {
      base.preferences.activePersonFilterByModule[moduleId] = preferredPerson;
    }

    runtime.modules[moduleId].atoms.forEach((atom) => {
      const sourceAtom = sourceModule.atoms?.[atom.id] || {};
      const atomProgress = createAtomProgress();
      atomProgress.currentStage = STAGE_SEQUENCE.includes(sourceAtom.currentStage)
        ? sourceAtom.currentStage
        : atomProgress.currentStage;
      atomProgress.mastered = Boolean(sourceAtom.mastered);
      atomProgress.totalAttempts = ensureNumber(sourceAtom.totalAttempts, 0);
      atomProgress.totalTimeMs = ensureNumber(sourceAtom.totalTimeMs, 0);
      atomProgress.totalErrors = ensureNumber(sourceAtom.totalErrors, 0);
      atomProgress.bestTimeMs =
        sourceAtom.bestTimeMs === null || sourceAtom.bestTimeMs === undefined
          ? null
          : ensureNumber(sourceAtom.bestTimeMs, null);
      atomProgress.lastSeenAt =
        sourceAtom.lastSeenAt === null || sourceAtom.lastSeenAt === undefined
          ? null
          : ensureNumber(sourceAtom.lastSeenAt, null);
      atomProgress.recent = sanitizeRecent(sourceAtom.recent);

      STAGE_SEQUENCE.forEach((stage) => {
        const sourceStage = sourceAtom.stageStats?.[stage] || {};
        atomProgress.stageStats[stage] = {
          attempts: ensureNumber(sourceStage.attempts, 0),
          correct: ensureNumber(sourceStage.correct, 0),
          totalTimeMs: ensureNumber(sourceStage.totalTimeMs, 0),
          totalErrors: ensureNumber(sourceStage.totalErrors, 0),
          lastSeenAt:
            sourceStage.lastSeenAt === null || sourceStage.lastSeenAt === undefined
              ? null
              : ensureNumber(sourceStage.lastSeenAt, null),
          recent: sanitizeRecent(sourceStage.recent),
        };
      });

      base.modules[moduleId].atoms[atom.id] = atomProgress;
    });
  });

  return base;
}

function loadData() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    data = hydrateData(raw ? JSON.parse(raw) : null);
    appState.ready = true;
    appState.lastSaveOutcome = "saved";
  } catch (error) {
    console.error(error);
    data = createDefaultData();
    appState.ready = true;
    appState.lastSaveOutcome = "error";
  }
}

function saveData() {
  data.updatedAt = Date.now();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    appState.lastSaveOutcome = "saved";
  } catch (error) {
    console.error(error);
    appState.lastSaveOutcome = "error";
    setFeedback("Could not save progress in this browser.");
  }
}

function createSession() {
  return {
    active: false,
    transitioning: false,
    currentAtomId: null,
    currentPrompt: null,
    promptStartedAt: null,
    errorsThisAttempt: 0,
    currentStreak: 0,
    bestStreak: 0,
    attempts: 0,
    cleanHits: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    previousAtomIds: [],
    layoutHintUntil: 0,
    message: "Press Start to begin.",
  };
}

function activeModuleId() {
  return data.preferences.activeModuleId;
}

function activeModule() {
  return runtime.modules[activeModuleId()];
}

function activeSubdeckId() {
  return data.preferences.activeSubdeckIdByModule[activeModuleId()];
}

function activeSubdeck() {
  return activeModule().subdecksById[activeSubdeckId()];
}

function activePersonFilter() {
  return data.preferences.activePersonFilterByModule[activeModuleId()];
}

function getModuleProgress(moduleId = activeModuleId()) {
  return data.modules[moduleId];
}

function getAtomProgress(atomId, moduleId = activeModuleId()) {
  return data.modules[moduleId].atoms[atomId];
}

function getEligibleAtoms() {
  const module = activeModule();
  const subdeckAtoms = module.atomsBySubdeckId[activeSubdeckId()] || [];
  const personFilter = activePersonFilter();
  return subdeckAtoms.filter((atom) => personFilter === "all" || atom.personId === personFilter);
}

function getVisibleAtomsForHeatmap() {
  return activeModule().atomsBySubdeckId[activeSubdeckId()] || [];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function average(items, selector) {
  if (!items.length) {
    return 0;
  }
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

function formatErrors(value) {
  return value.toFixed(2);
}

function formatStudyDuration(totalMs) {
  const totalSeconds = Math.max(0, Math.round(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function displayMs(value) {
  return value === null ? "—" : formatMs(value);
}

function displayErrors(value) {
  return value === null ? "—" : formatErrors(value);
}

function normalizeAnswer(text) {
  let value = String(text || "");
  if (sharedConfig.answerNormalization.trimWhitespace) {
    value = value.trim();
  }
  if (sharedConfig.answerNormalization.stripTrailingPeriod) {
    value = value.replace(/\.+$/g, "").trim();
  }
  if (sharedConfig.answerNormalization.caseInsensitiveForCyrillic) {
    value = value.toLowerCase();
  }
  return value;
}

function stageIndex(stage) {
  return STAGE_SEQUENCE.indexOf(stage);
}

function getNextStage(stage) {
  const index = stageIndex(stage);
  return index >= 0 && index < STAGE_SEQUENCE.length - 1 ? STAGE_SEQUENCE[index + 1] : null;
}

function getAdvanceRule(stage) {
  const nextStage = getNextStage(stage);
  const key = nextStage ? `${stage}_to_${nextStage}` : `${stage}_mastered`;
  const fallbackKey = `${stage}_to_${nextStage || "mastered"}`;
  return stageProfile.unlockRules[key] || stageProfile.unlockRules[fallbackKey] || null;
}

function getErrorTargetForStage(stage) {
  const rule = getAdvanceRule(stage);
  if (rule?.maxRecentAvgErrors !== undefined) {
    return rule.maxRecentAvgErrors;
  }
  if (stage === "preview") {
    return 0.15;
  }
  return 0.75;
}

function getActiveHistory() {
  const moduleHistory = getModuleProgress().history;
  const allowed = new Set(getEligibleAtoms().map((atom) => atom.id));
  return moduleHistory.filter((item) => allowed.has(item.atomId));
}

function getFilteredModuleTotals() {
  const eligibleAtoms = getEligibleAtoms();
  const totalAttempts = eligibleAtoms.reduce(
    (sum, atom) => sum + getAtomProgress(atom.id).totalAttempts,
    0,
  );
  const totalTimeMs = eligibleAtoms.reduce(
    (sum, atom) => sum + getAtomProgress(atom.id).totalTimeMs,
    0,
  );
  const totalErrors = eligibleAtoms.reduce(
    (sum, atom) => sum + getAtomProgress(atom.id).totalErrors,
    0,
  );
  return { totalAttempts, totalTimeMs, totalErrors };
}

function buildAtomProfile(atom) {
  const atomProgress = getAtomProgress(atom.id);
  const stage = atomProgress.currentStage;
  const stageProgress = atomProgress.stageStats[stage];
  const recent = stageProgress.recent.length ? stageProgress.recent : atomProgress.recent;
  const avgTime = recent.length
    ? average(recent, (item) => item.timeMs)
    : TARGET_TIME_BY_STAGE[stage] || 3200;
  const avgErrors = recent.length
    ? average(recent, (item) => item.errors)
    : getErrorTargetForStage(stage) + 0.25;
  const weakness =
    0.45 * clamp(avgTime / (TARGET_TIME_BY_STAGE[stage] || 3200), 0, 2) +
    0.35 * clamp(avgErrors / (getErrorTargetForStage(stage) || 0.75), 0, 2) +
    0.2 * (1 - Math.min(atomProgress.totalAttempts / 8, 1));

  const hoursSinceLastSeen = atomProgress.lastSeenAt
    ? (Date.now() - atomProgress.lastSeenAt) / 3600000
    : 96;
  const recencyBoost = Math.min(hoursSinceLastSeen / 72, 1) * 0.35;
  const newnessBoost = atomProgress.totalAttempts === 0 ? 0.4 : 0;
  const immediateRepeatPenalty = session.previousAtomIds.includes(atom.id) ? 0.6 : 0;
  const difficulty = weakness + recencyBoost + newnessBoost - immediateRepeatPenalty;

  const stageDepth = stageIndex(stage) / Math.max(STAGE_SEQUENCE.length - 1, 1);
  const stability = clamp(
    1 - (avgTime / (TARGET_TIME_BY_STAGE[stage] || 3200) - 1) * 0.35 - avgErrors * 0.25,
    0,
    1,
  );
  const mastery = atomProgress.mastered
    ? 1
    : clamp(0.65 * stageDepth + 0.35 * stability, 0, 0.96);

  return {
    atom,
    progress: atomProgress,
    stage,
    attempts: atomProgress.totalAttempts,
    avgTime,
    avgErrors,
    recentAvgTime: avgTime,
    recentAvgErrors: avgErrors,
    difficulty,
    weight: Math.max(0.05, difficulty),
    mastery,
  };
}

function pickWeightedAtom() {
  const candidates = getEligibleAtoms().map(buildAtomProfile);
  if (!candidates.length) {
    return null;
  }

  const sorted = candidates.sort((a, b) => b.difficulty - a.difficulty).slice(0, PICK_TOP_N);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  let threshold = Math.random() * totalWeight;

  for (const candidate of sorted) {
    threshold -= candidate.weight;
    if (threshold <= 0) {
      return candidate.atom;
    }
  }

  return sorted[sorted.length - 1].atom;
}

function getTailFragment(atom) {
  return atom.form.slice(atom.fragmentBase.length);
}

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function buildChoiceOptions(atom, count) {
  const sameVerbAtoms = activeModule().atoms.filter(
    (candidate) => candidate.verbId === atom.verbId && candidate.subdeckId === atom.subdeckId,
  );
  const distractorPersonIds = sharedConfig.confusionPriority[atom.personId] || [];
  const selectedPersons = [atom.personId];

  distractorPersonIds.forEach((personId) => {
    if (selectedPersons.length < count && !selectedPersons.includes(personId)) {
      selectedPersons.push(personId);
    }
  });

  sameVerbAtoms.forEach((candidate) => {
    if (selectedPersons.length < count && !selectedPersons.includes(candidate.personId)) {
      selectedPersons.push(candidate.personId);
    }
  });

  const options = selectedPersons.slice(0, count).map((personId) => {
    const candidate = sameVerbAtoms.find((item) => item.personId === personId);
    return {
      label: candidate.form,
      personId,
      correct: personId === atom.personId,
      detail: STAGE_LABELS[atom.personId] || "",
    };
  });

  return shuffle(options);
}

function buildPrompt(atom) {
  const atomProgress = getAtomProgress(atom.id);
  const stage = atomProgress.currentStage;
  const contextFrames = atom.contextFrames.length ? atom.contextFrames : [{ beforeVerbRu: "", afterVerbRu: "" }];
  const contextFrameIndex = Math.floor(Math.random() * contextFrames.length);
  const contextFrame = contextFrames[contextFrameIndex];

  const basePrompt = {
    atomId: atom.id,
    stage,
    atom,
    contextFrame,
    contextFrameIndex,
    answer: atom.form,
  };

  switch (stage) {
    case "preview":
      return {
        ...basePrompt,
        mode: "preview",
      };
    case "choose2":
      return {
        ...basePrompt,
        mode: "choice",
        choices: buildChoiceOptions(atom, 2),
      };
    case "choose4":
      return {
        ...basePrompt,
        mode: "choice",
        choices: buildChoiceOptions(atom, 4),
      };
    case "fullChoice":
      return {
        ...basePrompt,
        mode: "choice",
        choices: shuffle(
          activeModule().atoms
            .filter((candidate) => candidate.verbId === atom.verbId && candidate.subdeckId === atom.subdeckId)
            .map((candidate) => ({
              label: candidate.form,
              personId: candidate.personId,
              correct: candidate.personId === atom.personId,
            })),
        ),
      };
    case "typeFragment":
      return {
        ...basePrompt,
        mode: "text",
        answer: getTailFragment(atom),
      };
    case "typeFull":
      return {
        ...basePrompt,
        mode: "text",
        answer: atom.form,
      };
    case "sentenceGuided":
      return {
        ...basePrompt,
        mode: "text",
        answer: atom.form,
      };
    case "sentenceFree":
      return {
        ...basePrompt,
        mode: "text",
        answer: atom.form,
      };
    default:
      return {
        ...basePrompt,
        mode: "text",
        answer: atom.form,
      };
  }
}

function updateStatusPill(label, variant) {
  elements.statusPill.textContent = label;
  elements.statusPill.className = `status-pill ${variant}`;
}

function flashStatus(label, variant) {
  updateStatusPill(label, variant);
  window.clearTimeout(flashStatus.timeoutId);
  flashStatus.timeoutId = window.setTimeout(() => {
    updateStatusPill(session.active ? "Live" : "Paused", session.active ? "live" : "idle");
  }, 420);
}

function setFeedback(message) {
  session.message = message;
  renderFeedback();
}

function flashInteractiveChoice(element, className) {
  if (!element) {
    return;
  }
  element.classList.add(className);
  window.setTimeout(() => {
    element.classList.remove(className);
  }, 420);
}

function startTimerLoop() {
  cancelAnimationFrame(timerFrame);
  const tick = () => {
    if (!session.active || session.promptStartedAt === null) {
      return;
    }
    elements.liveTimer.textContent = formatMs(performance.now() - session.promptStartedAt);
    timerFrame = requestAnimationFrame(tick);
  };
  timerFrame = requestAnimationFrame(tick);
}

function generateNextPrompt() {
  const atom = pickWeightedAtom();
  if (!atom) {
    session.currentAtomId = null;
    session.currentPrompt = null;
    setFeedback("No eligible cells are available in this filter.");
    render();
    return;
  }

  session.currentAtomId = atom.id;
  session.currentPrompt = buildPrompt(atom);
  session.promptStartedAt = performance.now();
  session.errorsThisAttempt = 0;
  session.layoutHintUntil = 0;
  session.transitioning = false;
  session.message = "Solve the current cell. Speed and miss-count are both tracked.";
  elements.targetDisplay.classList.remove("idle", "correct", "wrong");
  elements.targetDisplay.classList.add("live");
  render();
  startTimerLoop();
}

function startSession({ fresh = false } = {}) {
  if (fresh) {
    session = createSession();
  }

  session.active = true;
  session.transitioning = false;
  session.errorsThisAttempt = 0;
  session.layoutHintUntil = 0;
  session.message = "Solve the current cell. Speed and miss-count are both tracked.";
  updateStatusPill("Live", "live");

  if (!session.currentPrompt) {
    generateNextPrompt();
  } else {
    session.promptStartedAt = performance.now();
    updateStatusPill("Live", "live");
    elements.targetDisplay.classList.remove("idle", "correct", "wrong");
    elements.targetDisplay.classList.add("live");
    render();
    startTimerLoop();
  }
}

function pauseSession(message = "Paused. Resume when ready.") {
  session.active = false;
  session.transitioning = false;
  session.promptStartedAt = null;
  session.errorsThisAttempt = 0;
  session.message = message;
  cancelAnimationFrame(timerFrame);
  updateStatusPill("Paused", "idle");
  elements.targetDisplay.classList.remove("live", "correct", "wrong");
  elements.targetDisplay.classList.add("idle");
  render();
}

function clearPromptAndPause(message) {
  session.currentAtomId = null;
  session.currentPrompt = null;
  pauseSession(message);
}

function registerAttempt(prompt, timeMs, errors) {
  const moduleProgress = getModuleProgress(prompt.atom.moduleId);
  const atomProgress = getAtomProgress(prompt.atomId, prompt.atom.moduleId);
  const stageProgress = atomProgress.stageStats[prompt.stage];
  const now = Date.now();

  atomProgress.totalAttempts += 1;
  atomProgress.totalTimeMs += timeMs;
  atomProgress.totalErrors += errors;
  atomProgress.lastSeenAt = now;
  atomProgress.bestTimeMs = atomProgress.bestTimeMs === null ? timeMs : Math.min(atomProgress.bestTimeMs, timeMs);
  atomProgress.recent.push({ timeMs, errors, at: now });
  atomProgress.recent = atomProgress.recent.slice(-RECENT_PER_STAGE);

  stageProgress.attempts += 1;
  stageProgress.correct += 1;
  stageProgress.totalTimeMs += timeMs;
  stageProgress.totalErrors += errors;
  stageProgress.lastSeenAt = now;
  stageProgress.recent.push({ timeMs, errors, at: now });
  stageProgress.recent = stageProgress.recent.slice(-RECENT_PER_STAGE);

  moduleProgress.totals.attempts += 1;
  moduleProgress.totals.totalTimeMs += timeMs;
  moduleProgress.totals.totalErrors += errors;
  moduleProgress.totals.bestStreak = Math.max(moduleProgress.totals.bestStreak, session.currentStreak);
  moduleProgress.history.push({ atomId: prompt.atomId, stage: prompt.stage, timeMs, errors, at: now });
  moduleProgress.history = moduleProgress.history.slice(-MODULE_HISTORY_LIMIT);

  maybeAdvanceStage(atomProgress, prompt.stage);
  saveData();
}

function maybeAdvanceStage(atomProgress, stage) {
  const rule = getAdvanceRule(stage);
  if (!rule) {
    atomProgress.mastered = true;
    return;
  }

  const stageProgress = atomProgress.stageStats[stage];
  const recent = stageProgress.recent.slice(-Math.max(rule.minCorrect || 4, 4));
  const recentAvgTime = recent.length ? average(recent, (item) => item.timeMs) : Infinity;
  const recentAvgErrors = recent.length ? average(recent, (item) => item.errors) : Infinity;

  const enoughCorrect = stageProgress.correct >= (rule.minCorrect || 1);
  const goodTime = rule.maxRecentAvgTimeMs === undefined || recentAvgTime <= rule.maxRecentAvgTimeMs;
  const goodErrors = rule.maxRecentAvgErrors === undefined || recentAvgErrors <= rule.maxRecentAvgErrors;

  if (!enoughCorrect || !goodTime || !goodErrors) {
    return;
  }

  const nextStage = getNextStage(stage);
  if (nextStage) {
    atomProgress.currentStage = nextStage;
    return;
  }

  atomProgress.mastered = true;
}

function completeCurrentPrompt() {
  if (!session.active || !session.currentPrompt || session.promptStartedAt === null) {
    return;
  }

  const prompt = session.currentPrompt;
  const atomProgress = getAtomProgress(prompt.atomId);
  const stageBefore = prompt.stage;
  const timeMs = performance.now() - session.promptStartedAt;
  const errors = session.errorsThisAttempt;

  session.attempts += 1;
  session.totalTimeMs += timeMs;
  session.totalErrors += errors;
  session.currentStreak += 1;
  session.bestStreak = Math.max(session.bestStreak, session.currentStreak);
  if (errors === 0) {
    session.cleanHits += 1;
  }

  registerAttempt(prompt, timeMs, errors);
  const stageAfter = atomProgress.currentStage;
  const advanced = stageAfter !== stageBefore || atomProgress.mastered;

  session.previousAtomIds = [prompt.atomId, ...session.previousAtomIds].slice(0, 5);
  session.transitioning = true;
  session.promptStartedAt = null;
  cancelAnimationFrame(timerFrame);

  elements.targetDisplay.classList.remove("wrong");
  elements.targetDisplay.classList.add("correct");
  flashStatus(errors === 0 ? "Clean" : "Correct", "flash-correct");

  const linePool = errors === 0 ? SUCCESS_LINES : RECOVER_LINES;
  const line = linePool[Math.floor(Math.random() * linePool.length)];
  const stageMessage = advanced
    ? atomProgress.mastered
      ? " Cell mastered."
      : ` Advanced to ${STAGE_LABELS[stageAfter]}.`
    : "";
  const detail =
    errors === 0
      ? `${line} ${formatMs(timeMs)}.${stageMessage}`
      : `${line} ${formatMs(timeMs)} with ${errors} miss${errors === 1 ? "" : "es"}.${stageMessage}`;
  setFeedback(detail.trim());
  render();

  window.setTimeout(() => {
    if (!session.active) {
      return;
    }
    generateNextPrompt();
  }, PROMPT_ADVANCE_DELAY_MS);
}

function showYoHint(expected) {
  elements.layoutHint.textContent = `This form uses ё: ${expected}`;
  session.layoutHintUntil = Date.now() + 2500;
  renderFeedback();
}

function handleWrongAttempt(message, yoHint = "") {
  if (!session.active || session.transitioning) {
    return;
  }

  session.errorsThisAttempt += 1;
  session.currentStreak = 0;
  elements.targetDisplay.classList.remove("correct");
  elements.targetDisplay.classList.add("wrong");
  flashStatus("Miss", "flash-wrong");
  setFeedback(`${message} Misses this round: ${session.errorsThisAttempt}.`);

  if (yoHint) {
    showYoHint(yoHint);
  }

  renderAttemptPanel();
  renderSummary();
  renderFeedback();
}

function answerLooksLikeYeForYo(answer, expected) {
  return expected.includes("ё") && answer.replaceAll("е", "ё") === expected;
}

function submitTextAnswer(rawValue) {
  if (!session.active || !session.currentPrompt || session.transitioning) {
    return;
  }

  const submitted = normalizeAnswer(rawValue);
  const expected = normalizeAnswer(session.currentPrompt.answer);
  if (!submitted) {
    handleWrongAttempt("Blank answer.");
    return;
  }

  if (submitted === expected) {
    completeCurrentPrompt();
    return;
  }

  const yoHint = answerLooksLikeYeForYo(submitted, expected) ? expected : "";
  handleWrongAttempt(`Not ${session.currentPrompt.answer}.`, yoHint);
}

function handlePreviewSelection(selectedPersonId, button) {
  if (!session.active || !session.currentPrompt || session.transitioning) {
    return;
  }

  const promptAtom = session.currentPrompt.atom;
  if (selectedPersonId === promptAtom.personId) {
    flashInteractiveChoice(button, "is-correct");
    completeCurrentPrompt();
    return;
  }

  const selectedForm = promptAtom.forms[selectedPersonId];
  flashInteractiveChoice(button, "is-wrong");
  handleWrongAttempt(
    `${selectedForm} is not the target. Find ${promptAtom.person.pronoun} ${promptAtom.form}.`,
  );
}

function handleChoiceSelection(correct, button) {
  if (!session.active || !session.currentPrompt || session.transitioning) {
    return;
  }

  if (correct) {
    flashInteractiveChoice(button, "is-correct");
    completeCurrentPrompt();
    return;
  }

  flashInteractiveChoice(button, "is-wrong");
  handleWrongAttempt(`Not ${session.currentPrompt.answer}.`);
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `russian-conjugation-coach-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setFeedback("Progress exported.");
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      data = hydrateData(JSON.parse(String(reader.result)));
      saveData();
      session = createSession();
      pauseSession("Imported progress. Press Start when ready.");
      setFeedback("Progress imported.");
    } catch (error) {
      console.error(error);
      setFeedback("Import failed. Pick a valid export file.");
      render();
    }
  };
  reader.readAsText(file);
}

function resetData() {
  const confirmed = window.confirm("Reset all saved conjugation progress?");
  if (!confirmed) {
    return;
  }

  data = createDefaultData();
  saveData();
  session = createSession();
  pauseSession("Progress reset. Start a new run.");
  setFeedback("Progress reset.");
}

function computeCoverage() {
  const eligibleAtoms = getEligibleAtoms();
  const practiced = eligibleAtoms.filter((atom) => getAtomProgress(atom.id).totalAttempts > 0).length;
  const solid = eligibleAtoms.filter((atom) => stageIndex(getAtomProgress(atom.id).currentStage) >= stageIndex("typeFragment") || getAtomProgress(atom.id).mastered).length;
  return { practiced, solid, total: eligibleAtoms.length };
}

function computeTrendSummary() {
  const history = getActiveHistory();
  const recent = history.slice(-20);
  const previous = history.slice(-40, -20);

  if (recent.length < 8 || previous.length < 8) {
    return {
      title: "Waiting for a stronger sample",
      detail: "Keep going. Trend cards become useful after about 16 solved prompts.",
    };
  }

  const recentAvgTime = average(recent, (item) => item.timeMs);
  const previousAvgTime = average(previous, (item) => item.timeMs);
  const diff = Math.round(recentAvgTime - previousAvgTime);
  const recentErrors = average(recent, (item) => item.errors);
  const previousErrors = average(previous, (item) => item.errors);
  const errorDiff = recentErrors - previousErrors;

  if (diff < -80 || errorDiff < -0.08) {
    return {
      title: diff < -80 ? `${Math.abs(diff)} ms faster lately` : "Cleaner lately",
      detail: `${Math.abs(errorDiff).toFixed(2)} fewer errors than the 20 prompts before that.`,
    };
  }

  if (diff > 80 || errorDiff > 0.08) {
    return {
      title: diff > 80 ? `${diff} ms slower lately` : "More misses lately",
      detail: `${errorDiff.toFixed(2)} more errors than the 20 prompts before that. Usually temporary.`,
    };
  }

  return {
    title: "Holding steady",
    detail: "Speed and error rate are close to your previous 20 solved prompts.",
  };
}

function buildFocusCells() {
  const profiles = getEligibleAtoms().map(buildAtomProfile).sort((a, b) => b.difficulty - a.difficulty);
  const currentAtomId = session.currentPrompt?.atomId;
  if (!currentAtomId) {
    return profiles.slice(0, 6);
  }

  const currentProfile = profiles.find((profile) => profile.atom.id === currentAtomId);
  if (!currentProfile) {
    return profiles.slice(0, 6);
  }

  return [currentProfile, ...profiles.filter((profile) => profile.atom.id !== currentAtomId)].slice(0, 6);
}

function colorForProfile(profile) {
  const normalized = clamp((profile.difficulty - 0.4) / 1.6, 0, 1);
  const hue = 148 - normalized * 92;
  const saturation = 64 + normalized * 12;
  const lightness = 83 - normalized * 24;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function currentPromptMatchesFilter() {
  if (!session.currentPrompt) {
    return true;
  }
  const allowed = new Set(getEligibleAtoms().map((atom) => atom.id));
  return allowed.has(session.currentPrompt.atomId);
}

function renderModuleTabs() {
  elements.moduleTabs.innerHTML = "";
  runtime.moduleOrder.forEach((moduleId) => {
    const module = runtime.modules[moduleId];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `module-tab ${moduleId === activeModuleId() ? "is-active" : ""}`;
    button.innerHTML = `
      <strong>${module.title}</strong>
      <small>${module.subdecks.reduce((sum, subdeck) => sum + subdeck.verbs.length, 0)} verbs total</small>
    `;
    button.addEventListener("click", () => {
      if (moduleId === activeModuleId()) {
        return;
      }
      data.preferences.activeModuleId = moduleId;
      saveData();
      session = createSession();
      clearPromptAndPause(`Switched to ${module.title}. Press Start when ready.`);
      render();
    });
    elements.moduleTabs.appendChild(button);
  });
}

function renderSubdeckTabs() {
  elements.subdeckTabs.innerHTML = "";
  activeModule().subdecks.forEach((subdeck) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `subdeck-tab ${subdeck.id === activeSubdeckId() ? "is-active" : ""}`;
    button.innerHTML = `
      <strong>${subdeck.title}</strong>
      <small>${subdeck.verbs.length} verbs</small>
    `;
    button.addEventListener("click", () => {
      if (subdeck.id === activeSubdeckId()) {
        return;
      }
      data.preferences.activeSubdeckIdByModule[activeModuleId()] = subdeck.id;
      saveData();
      session = createSession();
      clearPromptAndPause(`Switched to ${subdeck.title}. Press Start when ready.`);
      render();
    });
    elements.subdeckTabs.appendChild(button);
  });
}

function renderPersonChips() {
  elements.personChips.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.type = "button";
  allChip.className = `person-chip ${activePersonFilter() === "all" ? "is-active" : ""}`;
  const totalCells = getVisibleAtomsForHeatmap().length;
  const practicedCells = getVisibleAtomsForHeatmap().filter(
    (atom) => getAtomProgress(atom.id).totalAttempts > 0,
  ).length;
  allChip.innerHTML = `<strong>All persons</strong><small>${practicedCells} / ${totalCells} touched</small>`;
  allChip.addEventListener("click", () => {
    if (activePersonFilter() === "all") {
      return;
    }
    data.preferences.activePersonFilterByModule[activeModuleId()] = "all";
    saveData();
    session = createSession();
    clearPromptAndPause("Person focus cleared. Press Start when ready.");
    render();
  });
  elements.personChips.appendChild(allChip);

  PERSONS.forEach((person) => {
    const atoms = getVisibleAtomsForHeatmap().filter((atom) => atom.personId === person.id);
    const stabilized = atoms.filter((atom) => {
      const progress = getAtomProgress(atom.id);
      return stageIndex(progress.currentStage) >= stageIndex("typeFragment") || progress.mastered;
    }).length;

    const button = document.createElement("button");
    button.type = "button";
    button.className = `person-chip ${activePersonFilter() === person.id ? "is-active" : ""}`;
    button.innerHTML = `<strong>${person.pronoun}</strong><small>${stabilized} / ${atoms.length} stabilized</small>`;
    button.addEventListener("click", () => {
      if (activePersonFilter() === person.id) {
        return;
      }
      data.preferences.activePersonFilterByModule[activeModuleId()] = person.id;
      saveData();
      session = createSession();
      clearPromptAndPause(`Focus set to ${person.pronoun}. Press Start when ready.`);
      render();
    });
    elements.personChips.appendChild(button);
  });
}

function renderStageRail() {
  const atom = session.currentPrompt?.atom;
  const atomProgress = atom ? getAtomProgress(atom.id) : null;
  const currentStage = session.currentPrompt?.stage || atomProgress?.currentStage || STAGE_SEQUENCE[0];

  elements.stageRail.innerHTML = "";
  STAGE_SEQUENCE.forEach((stage) => {
    const chip = document.createElement("div");
    const stageIsComplete = atomProgress && stageIndex(stage) < stageIndex(atomProgress.currentStage);
    const stageIsCurrent = stage === currentStage;
    const stageIsLocked = atomProgress && stageIndex(stage) > stageIndex(atomProgress.currentStage);
    chip.className = `stage-chip ${stageIsComplete ? "is-complete" : ""} ${stageIsCurrent ? "is-current" : ""} ${stageIsLocked ? "is-locked" : ""}`.trim();
    chip.textContent = STAGE_LABELS[stage];
    elements.stageRail.appendChild(chip);
  });
}

function renderPracticeProgress() {
  const coverage = computeCoverage();
  const currentAtom = session.currentPrompt?.atom;
  const focusLabel =
    activePersonFilter() === "all" ? "All persons" : `Focus: ${PERSONS_BY_ID[activePersonFilter()]?.pronoun}`;
  const currentLine = currentAtom
    ? `Current target: ${currentAtom.lemma} · ${currentAtom.person.pronoun} -> ${currentAtom.form}`
    : `Filter: ${focusLabel}`;

  elements.practiceProgress.innerHTML = `
    <strong>${coverage.practiced} / ${coverage.total} cells touched</strong>
    <span>${coverage.solid} stabilized</span>
    <span>${escapeHtml(currentLine)}</span>
  `;
}

function splitWordHtml(split) {
  return `<span class="split-word"><span>${escapeHtml(split.stable)}</span><span class="mutable-piece">${escapeHtml(split.mutable)}</span></span>`;
}

function getPromptBadges(atom, stage) {
  return `
    <div class="prompt-badges">
      <span class="module-badge">${escapeHtml(activeModule().title)}</span>
      <span class="subdeck-badge">${escapeHtml(activeSubdeck().title)}</span>
      <span class="stage-badge">${escapeHtml(STAGE_LABELS[stage])}</span>
      <span class="target-chip">${escapeHtml(atom.person.pronoun)}</span>
      <span class="translation-chip">${escapeHtml(atom.translation)}</span>
    </div>
  `;
}

function renderPreviewPrompt(prompt) {
  const atom = prompt.atom;
  elements.targetDisplay.innerHTML = `
    <div class="prompt-card preview-card">
      ${getPromptBadges(atom, prompt.stage)}
      <div class="preview-target-callout">
        <span class="preview-target-label">Current target</span>
        <strong>${escapeHtml(atom.person.pronoun)} -> ${escapeHtml(atom.form)}</strong>
        <span>Tap this exact cell to clear the preview rep. Wrong taps count as one strike.</span>
      </div>
      <div class="lemma-row">
        <div class="prompt-lemma">${splitWordHtml(atom.previewSplit)}</div>
        <span class="preview-badge">Tap the highlighted cell to continue</span>
      </div>
      <p class="prompt-coach-note">${escapeHtml(atom.coachNote || "Preview the full paradigm, then tap the target cell.")}</p>
      <div class="paradigm-grid">
        ${PERSONS.map((person) => {
          const form = atom.forms[person.id];
          const target = person.id === atom.personId;
          return `
            <button
              type="button"
              class="paradigm-cell is-clickable ${target ? "is-target" : ""}"
              data-preview-person="${escapeHtml(person.id)}"
              aria-label="${escapeHtml(`${person.pronoun} ${form}${target ? ", current target" : ""}`)}"
            >
              <small>${escapeHtml(person.pronoun)}${target ? '<span class="paradigm-target-flag">Target</span>' : ""}</small>
              <strong>${escapeHtml(form)}</strong>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;

  elements.answerArea.innerHTML = `<p class="muted-note">The goal here is orientation, not difficulty. Tap the highlighted correct cell and keep moving.</p>`;

  elements.targetDisplay.querySelectorAll("[data-preview-person]").forEach((button) => {
    button.addEventListener("click", () => {
      handlePreviewSelection(button.dataset.previewPerson, button);
    });
  });
}

function renderChoicePrompt(prompt) {
  const atom = prompt.atom;
  const helperText =
    prompt.stage === "choose2"
      ? "Choose between two forms."
      : prompt.stage === "choose4"
        ? "Choose the correct form from four options."
        : "Choose the correct form from the full six-form paradigm.";

  elements.targetDisplay.innerHTML = `
    <div class="prompt-card choice-card">
      ${getPromptBadges(atom, prompt.stage)}
      <div class="lemma-row">
        <div class="prompt-lemma">${splitWordHtml(atom.previewSplit)}</div>
        <span class="inline-help-chip">${escapeHtml(helperText)}</span>
      </div>
      <p class="prompt-coach-note">Same verb, same paradigm. The only thing changing is the person.</p>
    </div>
  `;

  elements.answerArea.innerHTML = `
    <div class="option-grid">
      ${prompt.choices
        .map(
          (choice, index) => `
            <button type="button" class="answer-choice" data-choice-index="${index}">
              <strong>${escapeHtml(choice.label)}</strong>
              <small>Option ${index + 1}</small>
            </button>
          `,
        )
        .join("")}
    </div>
  `;

  elements.answerArea.querySelectorAll("[data-choice-index]").forEach((button) => {
    const index = Number(button.dataset.choiceIndex);
    button.addEventListener("click", () => handleChoiceSelection(Boolean(prompt.choices[index]?.correct), button));
  });
}

function renderTypeFragmentPrompt(prompt) {
  const atom = prompt.atom;
  elements.targetDisplay.innerHTML = `
    <div class="prompt-card fragment-card">
      ${getPromptBadges(atom, prompt.stage)}
      <div class="lemma-row">
        <div class="prompt-lemma">${splitWordHtml(atom.previewSplit)}</div>
        <span class="inline-help-chip">Type only the missing tail</span>
      </div>
      <div class="fragment-display">
        <span class="fragment-base">${escapeHtml(atom.fragmentBase)}</span>
        <span class="fragment-blank">___</span>
      </div>
      <p class="prompt-coach-note">You already get the base. Your job is to retrieve only the ending fragment for ${escapeHtml(atom.person.pronoun)}.</p>
    </div>
  `;

  renderTextAnswerForm({
    placeholder: "Type only the tail fragment",
    helper: `Expected length: ${prompt.answer.length} character${prompt.answer.length === 1 ? "" : "s"}.`,
  });
}

function sentenceFrameHtml(prompt, guided) {
  const atom = prompt.atom;
  const before = prompt.contextFrame.beforeVerbRu || "";
  const after = prompt.contextFrame.afterVerbRu || "";
  const pieces = [];
  pieces.push(`<span class="sentence-pronoun-chip">${escapeHtml(atom.person.pronoun)}</span>`);
  if (before) {
    pieces.push(`<span>${escapeHtml(before)}</span>`);
  }
  if (guided) {
    pieces.push(`<span class="guided-pill">${splitWordHtml(atom.previewSplit)}</span>`);
  } else {
    pieces.push(`<span class="blank-slot">_____</span>`);
  }
  if (after) {
    pieces.push(`<span>${escapeHtml(after)}</span>`);
  }
  return `<div class="sentence-frame">${pieces.join("")}</div>`;
}

function renderTypeFullPrompt(prompt) {
  const atom = prompt.atom;
  elements.targetDisplay.innerHTML = `
    <div class="prompt-card fragment-card">
      ${getPromptBadges(atom, prompt.stage)}
      <div class="lemma-row">
        <div class="prompt-lemma">${splitWordHtml(atom.previewSplit)}</div>
        <span class="inline-help-chip">Type the full form</span>
      </div>
      <p class="prompt-coach-note">No choices now. Retrieve the complete present-tense form exactly.</p>
    </div>
  `;

  renderTextAnswerForm({
    placeholder: "Type the full Russian form",
    helper: `Exact canonical answer required.`,
  });
}

function renderSentenceGuidedPrompt(prompt) {
  const atom = prompt.atom;
  elements.targetDisplay.innerHTML = `
    <div class="prompt-card sentence-card">
      ${getPromptBadges(atom, prompt.stage)}
      <div class="lemma-row">
        <span class="inline-help-chip">The infinitive is shown in coral so the changing part is obvious.</span>
      </div>
      ${sentenceFrameHtml(prompt, true)}
      <p class="prompt-coach-note">Type the fully conjugated verb that fits this frame.</p>
    </div>
  `;

  renderTextAnswerForm({
    placeholder: "Type the conjugated verb",
    helper: `Guided sentence stage: structure is visible, production is still required.`,
  });
}

function renderSentenceFreePrompt(prompt) {
  const atom = prompt.atom;
  elements.targetDisplay.innerHTML = `
    <div class="prompt-card sentence-card">
      ${getPromptBadges(atom, prompt.stage)}
      <div class="lemma-row">
        <span class="inline-help-chip">Use the infinitive: ${escapeHtml(atom.lemma)}</span>
      </div>
      ${sentenceFrameHtml(prompt, false)}
      <p class="prompt-coach-note">Now you must decide the exact form without the mutable ending being shown.</p>
    </div>
  `;

  renderTextAnswerForm({
    placeholder: "Type the conjugated verb",
    helper: `Sentence free stage: identify the form yourself, then type it exactly.`,
  });
}

function renderTextAnswerForm({ placeholder, helper }) {
  elements.answerArea.innerHTML = `
    <form id="answer-form" class="answer-form">
      <div class="answer-input-row">
        <input id="answer-input" class="answer-input" type="text" autocomplete="off" placeholder="${escapeHtml(placeholder)}" />
        <button class="answer-submit" type="submit">Submit</button>
      </div>
      <p class="muted-note">${escapeHtml(helper)}</p>
    </form>
  `;

  const form = document.getElementById("answer-form");
  const input = document.getElementById("answer-input");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitTextAnswer(input.value);
    if (!session.transitioning) {
      input.select();
    }
  });
  window.setTimeout(() => input.focus(), 0);
}

function renderPracticePrompt() {
  const prompt = session.currentPrompt;
  if (!prompt) {
    elements.targetDisplay.innerHTML = `
      <div class="prompt-empty">
        <strong>Ready when you are.</strong>
        <p>Choose a module and press Start. The app will keep resurfacing the weakest conjugation cells.</p>
      </div>
    `;
    elements.answerArea.innerHTML = "";
    elements.irregularBanner.classList.add("hidden");
    elements.irregularBanner.textContent = "";
    return;
  }

  const stageProgress = getAtomProgress(prompt.atomId).stageStats[prompt.stage];
  const showBanner = prompt.atom.showIrregularYaBanner && (
    prompt.stage === "preview" ||
    (prompt.stage === "sentenceGuided" && stageProgress.attempts < 2)
  );
  elements.irregularBanner.classList.toggle("hidden", !showBanner);
  elements.irregularBanner.textContent = showBanner
    ? prompt.atom.irregularYaBannerText || prompt.atom.coachNote || "Watch the special я-form carefully."
    : "";

  switch (prompt.stage) {
    case "preview":
      renderPreviewPrompt(prompt);
      break;
    case "choose2":
    case "choose4":
    case "fullChoice":
      renderChoicePrompt(prompt);
      break;
    case "typeFragment":
      renderTypeFragmentPrompt(prompt);
      break;
    case "typeFull":
      renderTypeFullPrompt(prompt);
      break;
    case "sentenceGuided":
      renderSentenceGuidedPrompt(prompt);
      break;
    case "sentenceFree":
      renderSentenceFreePrompt(prompt);
      break;
    default:
      renderTypeFullPrompt(prompt);
      break;
  }
}

function renderFocusCells() {
  const profiles = buildFocusCells();
  elements.focusLetters.innerHTML = "";

  profiles.forEach((profile) => {
    const chip = document.createElement("div");
    const isCurrent = profile.atom.id === session.currentPrompt?.atomId;
    chip.className = `focus-chip ${isCurrent ? "is-current" : ""}`.trim();
    const summary = profile.attempts
      ? `${escapeHtml(STAGE_LABELS[profile.stage])} · ${displayMs(profile.avgTime)} · ${displayErrors(profile.avgErrors)} avg errors`
      : `${escapeHtml(STAGE_LABELS[profile.stage])} · No solved attempts yet`;
    const detail = profile.attempts
      ? `${profile.attempts} attempts logged`
      : "Fresh cell";
    chip.innerHTML = `
      <p class="focus-kicker">${isCurrent ? "Current cell" : "Needs attention"}</p>
      <strong class="focus-main">${escapeHtml(profile.atom.lemma)} · ${escapeHtml(profile.atom.person.pronoun)}</strong>
      <p class="focus-sub">${summary}</p>
      <p class="focus-sub">${detail}</p>
    `;
    elements.focusLetters.appendChild(chip);
  });
}

function renderHeatmap() {
  const atoms = getVisibleAtomsForHeatmap();
  const verbs = activeSubdeck().verbs;
  const profilesById = Object.fromEntries(atoms.map((atom) => [atom.id, buildAtomProfile(atom)]));
  const currentAtomId = session.currentPrompt?.atomId;
  const personFilter = activePersonFilter();

  elements.heatmapTitle.textContent = `${activeModule().title} · ${activeSubdeck().title}`;
  elements.keyboardMap.innerHTML = "";

  const header = document.createElement("div");
  header.className = "heatmap-header-row";
  header.innerHTML = `
    <div class="heatmap-corner">Verb</div>
    ${PERSONS.map((person) => `<div class="heatmap-person">${escapeHtml(person.pronoun)}</div>`).join("")}
  `;
  elements.keyboardMap.appendChild(header);

  verbs.forEach((verb) => {
    const row = document.createElement("div");
    row.className = "heatmap-row";

    const cells = PERSONS.map((person) => {
      const atom = atoms.find((candidate) => candidate.verbId === verb.id && candidate.personId === person.id);
      const profile = profilesById[atom.id];
      const progress = getAtomProgress(atom.id);
      const filteredOut = personFilter !== "all" && personFilter !== person.id;
      const title = `${verb.lemma} · ${person.pronoun} -> ${atom.form}`;
      return `
        <div class="heatmap-cell ${currentAtomId === atom.id ? "is-target" : ""} ${filteredOut ? "is-filtered" : ""}" title="${escapeHtml(title)}" style="background:${colorForProfile(profile)}">
          <span class="cell-form">${escapeHtml(atom.form)}</span>
          <span class="cell-meta">${escapeHtml(STAGE_LABELS[progress.currentStage])}</span>
          <span class="cell-meta">${progress.totalAttempts || "new"}</span>
        </div>
      `;
    }).join("");

    row.innerHTML = `<div class="heatmap-verb-label">${escapeHtml(verb.lemma)}</div>${cells}`;
    elements.keyboardMap.appendChild(row);
  });
}

function renderStatsTable() {
  const rows = getEligibleAtoms().map(buildAtomProfile).sort((a, b) => b.difficulty - a.difficulty);
  elements.statsTableBody.innerHTML = "";

  rows.forEach((profile) => {
    const progress = profile.progress;
    const trendDiff = profile.avgTime - (TARGET_TIME_BY_STAGE[profile.stage] || profile.avgTime);
    const trendClass = trendDiff < -100 ? "trend-down" : trendDiff > 100 ? "trend-up" : "trend-flat";
    const trendText =
      progress.totalAttempts === 0
        ? "New"
        : trendDiff < -100
          ? `${Math.abs(Math.round(trendDiff))} ms under target`
          : trendDiff > 100
            ? `${Math.round(trendDiff)} ms over target`
            : "On target";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(profile.atom.lemma)}</strong></td>
      <td>${escapeHtml(profile.atom.person.pronoun)}</td>
      <td>${escapeHtml(STAGE_LABELS[profile.stage])}</td>
      <td>${progress.totalAttempts}</td>
      <td>${displayMs(progress.totalAttempts ? profile.avgTime : null)}</td>
      <td>${displayMs(progress.totalAttempts ? profile.recentAvgTime : null)}</td>
      <td>${displayErrors(progress.totalAttempts ? profile.avgErrors : null)}</td>
      <td class="${trendClass}">${escapeHtml(trendText)}</td>
    `;
    elements.statsTableBody.appendChild(row);
  });
}

function renderFeedback() {
  elements.feedbackMessage.textContent = session.message;
  const showHint = session.layoutHintUntil > Date.now();
  elements.layoutHint.classList.toggle("hidden", !showHint);
}

function renderSummary() {
  const coverage = computeCoverage();
  const trend = computeTrendSummary();
  const totals = getFilteredModuleTotals();
  const sessionAvgTime = session.attempts ? session.totalTimeMs / session.attempts : 0;
  const sessionAvgErrors = session.attempts ? session.totalErrors / session.attempts : 0;
  const cleanRate = session.attempts ? Math.round((session.cleanHits / session.attempts) * 100) : 0;
  const lifetimeAvgTime = totals.totalAttempts ? totals.totalTimeMs / totals.totalAttempts : 0;
  const lifetimeAvgErrors = totals.totalAttempts ? totals.totalErrors / totals.totalAttempts : 0;

  elements.coverageCount.textContent = `${coverage.practiced} / ${coverage.total}`;
  elements.coverageDetail.textContent = `${coverage.solid} cells are at fragment stage or beyond.`;
  elements.recentTrend.textContent = trend.title;
  elements.recentTrendDetail.textContent = trend.detail;
  elements.practiceTitle.textContent = session.currentPrompt
    ? `${STAGE_LABELS[session.currentPrompt.stage]} · ${session.currentPrompt.atom.lemma} × ${session.currentPrompt.atom.person.pronoun}`
    : `Conjugate ${activeModule().title}`;

  elements.sessionBadge.textContent =
    session.currentStreak >= 8 ? "Hot streak" : session.attempts >= 1 ? "In session" : "Fresh run";
  elements.sessionAttempts.textContent = String(session.attempts);
  elements.sessionCleanRate.textContent = `${cleanRate}% clean hits`;
  elements.sessionAverageTime.textContent = session.attempts ? formatMs(sessionAvgTime) : "0 ms";
  elements.sessionAverageTimeDetail.textContent =
    session.attempts >= 1 && getActiveHistory().length
      ? `Last solved: ${formatMs(getActiveHistory().at(-1)?.timeMs || 0)}`
      : "Session average";
  elements.sessionAverageErrors.textContent = formatErrors(sessionAvgErrors);
  elements.sessionBestStreak.textContent = `Best streak: ${session.bestStreak}`;
  elements.lifetimeAverageTime.textContent = totals.totalAttempts ? formatMs(lifetimeAvgTime) : "0 ms";
  elements.lifetimeAverageErrors.textContent = `${formatErrors(lifetimeAvgErrors)} avg errors`;
  elements.lifetimeTotals.textContent = `${totals.totalAttempts} attempts | ${formatStudyDuration(totals.totalTimeMs)} studied`;
  elements.leaderboardTotalAttempts.textContent = String(totals.totalAttempts);
  elements.leaderboardTotalStudyTime.textContent = formatStudyDuration(totals.totalTimeMs);
  elements.startButton.textContent = !appState.ready
    ? "Loading..."
    : session.active
      ? "New run"
      : session.attempts > 0
        ? "Resume run"
        : "Start";
  elements.startButton.disabled = !appState.ready;
  elements.pauseButton.disabled = !appState.ready || !session.active;
  elements.exportButton.disabled = !appState.ready;
  elements.importButton.disabled = !appState.ready;
  elements.resetButton.disabled = !appState.ready;
}

function renderAttemptPanel() {
  elements.attemptErrors.textContent = String(session.errorsThisAttempt);
  elements.currentStreak.textContent = String(session.currentStreak);
  elements.liveTimer.textContent =
    session.active && session.promptStartedAt !== null ? formatMs(performance.now() - session.promptStartedAt) : "0 ms";
}

function render() {
  renderModuleTabs();
  renderSubdeckTabs();
  renderPersonChips();
  renderStageRail();
  renderPracticeProgress();
  renderPracticePrompt();
  renderAttemptPanel();
  renderSummary();
  renderFeedback();
  renderFocusCells();
  renderHeatmap();
  renderStatsTable();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function handleKeydown(event) {
  if (!appState.ready) {
    return;
  }

  if (event.key === "Escape") {
    pauseSession();
    return;
  }

  if (!session.active) {
    if (event.key === "Enter") {
      event.preventDefault();
      startSession({ fresh: session.attempts === 0 });
    }
    return;
  }

  if (!session.currentPrompt || session.transitioning) {
    return;
  }

  if (session.currentPrompt.mode === "choice" && /^[1-6]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    const choice = session.currentPrompt.choices[index];
    if (choice) {
      event.preventDefault();
      handleChoiceSelection(Boolean(choice.correct));
    }
  }
}

function attachEvents() {
  elements.startButton.addEventListener("click", () => {
    if (!appState.ready) {
      return;
    }
    const fresh = session.active || session.attempts === 0;
    startSession({ fresh });
  });

  elements.pauseButton.addEventListener("click", () => pauseSession());
  elements.exportButton.addEventListener("click", exportData);
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      importData(file);
    }
    event.target.value = "";
  });
  elements.resetButton.addEventListener("click", resetData);
  document.addEventListener("keydown", handleKeydown);
}

function initialize() {
  loadData();
  attachEvents();
  pauseSession("Press Start to begin. This build keeps the original shell but focuses only on 1st and 2nd conjugation.");
  render();
}

initialize();
