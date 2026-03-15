const API_PROGRESS_URL = "/api/progress";
const APP_VERSION = 2;
const SAVE_RETRY_MS = 2500;
const RECENT_PER_LETTER = 20;
const HISTORY_LIMIT = 500;
const PRIOR_ATTEMPTS = 5;
const PRIOR_TIME_MS = 1600;
const PRIOR_ERRORS = 0.8;
const GRAMMAR_RECENT_LIMIT = 8;
const GRAMMAR_HISTORY_LIMIT = 600;
const GRAMMAR_TOP_PICK_COUNT = 8;
const LETTERS = [
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
const KEYBOARD_ROWS = [
  ["ё"],
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х", "ъ"],
  ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
  ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю"],
];
const SUCCESS_LINES = [
  "Clean hit.",
  "Sharp.",
  "Locked in.",
  "That one landed well.",
  "Smooth find.",
];
const RECOVER_LINES = [
  "Corrected.",
  "Found it.",
  "Recovered well.",
  "Tracked it down.",
];
const STAGE_LABELS = {
  preview: "Preview",
  choose2: "Choose 2",
  choose4: "Choose 4",
  fullChoice: "Full Choice",
  typeFragment: "Type Fragment",
  typeFull: "Type Full",
  sentenceGuided: "Sentence Guided",
  sentenceFree: "Sentence Free",
};
const STAGE_SHORT_LABELS = {
  preview: "Prev",
  choose2: "C2",
  choose4: "C4",
  fullChoice: "C6",
  typeFragment: "Frag",
  typeFull: "Full",
  sentenceGuided: "Guide",
  sentenceFree: "Free",
};
const STAGE_UNLOCK_KEYS = {
  preview: "preview_to_choose2",
  choose2: "choose2_to_choose4",
  choose4: "choose4_to_fullChoice",
  fullChoice: "fullChoice_to_typeFragment",
  typeFragment: "typeFragment_to_typeFull",
  typeFull: "typeFull_to_sentenceGuided",
  sentenceGuided: "sentenceGuided_to_sentenceFree",
  sentenceFree: "sentenceFree_mastered",
};
const MODULE_TABS = [
  { id: "keyboard", label: "Keyboard" },
  { id: "first_conjugation", label: "1st Conjugation" },
  { id: "second_conjugation", label: "2nd Conjugation" },
];
const WATCHLISTS = {
  first_conjugation: {
    title: "Irregular watchlist",
    sections: [
      {
        title: "Stem-change watch",
        verbIds: ["pisat", "davat"],
      },
    ],
  },
  second_conjugation: {
    title: "Module watchlists",
    sections: [
      {
        title: "Irregular я watchlist",
        verbIds: [
          "uchit",
          "gotovit",
          "prosit",
          "hodit",
          "nosit",
          "perevodit",
          "prihodit",
          "vyhodit",
          "videt",
          "lyubit",
        ],
      },
      {
        title: "Exception-shape watchlist",
        verbIds: ["pomnit", "slyshat", "videt"],
      },
    ],
  },
};

if (
  !window.CONJUGATION_SHARED_CONFIG ||
  !window.FIRST_CONJUGATION_DECK ||
  !window.SECOND_CONJUGATION_DECK ||
  !window.buildConjugationAtoms
) {
  throw new Error("Conjugation curriculum files failed to load.");
}

const SHARED_CONFIG = window.CONJUGATION_SHARED_CONFIG;
const PERSONS = SHARED_CONFIG.persons;
const PERSON_BY_ID = Object.fromEntries(PERSONS.map((person) => [person.id, person]));
const STAGE_SEQUENCE = SHARED_CONFIG.stageProfiles.grammar_full.sequence.slice();
const GRAMMAR_TARGET_TIMES = SHARED_CONFIG.resumeSelection.targetTimeByStageMs;

const elements = {
  appRoot: document.getElementById("app-root"),
  importInput: document.getElementById("import-input"),
};

function buildGrammarModuleDefinition(deck) {
  const atoms = window.buildConjugationAtoms(deck, SHARED_CONFIG);
  const atomsById = Object.fromEntries(atoms.map((atom) => [atom.id, atom]));
  const atomsBySubdeckId = {};
  const atomsByVerbId = {};
  const verbsById = {};
  const subdeckMap = {};

  deck.subdecks.forEach((subdeck) => {
    subdeckMap[subdeck.id] = subdeck;
    atomsBySubdeckId[subdeck.id] = atoms
      .filter((atom) => atom.subdeckId === subdeck.id)
      .sort((left, right) => {
        if (left.verbId === right.verbId) {
          return SHARED_CONFIG.personOrder.indexOf(left.personId) - SHARED_CONFIG.personOrder.indexOf(right.personId);
        }
        return left.lemma.localeCompare(right.lemma, "ru");
      })
      .map((atom) => atom.id);

    subdeck.verbs.forEach((verb) => {
      verbsById[verb.id] = { ...verb, subdeckId: subdeck.id, subdeckTitle: subdeck.title };
    });
  });

  atoms.forEach((atom) => {
    if (!atomsByVerbId[atom.verbId]) {
      atomsByVerbId[atom.verbId] = [];
    }
    atomsByVerbId[atom.verbId].push(atom.id);
  });

  Object.values(atomsByVerbId).forEach((atomIds) => {
    atomIds.sort(
      (left, right) =>
        SHARED_CONFIG.personOrder.indexOf(atomsById[left].personId) -
        SHARED_CONFIG.personOrder.indexOf(atomsById[right].personId),
    );
  });

  return {
    ...deck,
    atoms,
    atomsById,
    atomsBySubdeckId,
    atomsByVerbId,
    verbsById,
    subdeckMap,
    defaultSubdeckId:
      deck.subdecks.find((subdeck) => subdeck.defaultEntry)?.id || deck.subdecks[0].id,
    watchlists: WATCHLISTS[deck.moduleId] || { title: "", sections: [] },
  };
}

const GRAMMAR_MODULES = {
  first_conjugation: buildGrammarModuleDefinition(window.FIRST_CONJUGATION_DECK),
  second_conjugation: buildGrammarModuleDefinition(window.SECOND_CONJUGATION_DECK),
};

let data = createDefaultData();
let serverUpdatedAt = 0;
let timerFrame = 0;
let keyboardSession = createKeyboardSession();
let grammarSessions = createGrammarSessions();
const appState = {
  ready: false,
  activeTab: "keyboard",
  saveQueued: false,
  saveInFlight: false,
  retryTimer: 0,
  serverError: false,
  lastSaveOutcome: "idle",
  loadError: "",
};

function createLetterStats() {
  return {
    attempts: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    bestTimeMs: null,
    lastSeenAt: null,
    recent: [],
  };
}

function createDefaultKeyboardProgress() {
  const letters = {};
  LETTERS.forEach((letter) => {
    letters[letter] = createLetterStats();
  });

  const timestamp = Date.now();
  return {
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    totals: {
      attempts: 0,
      totalTimeMs: 0,
      totalErrors: 0,
      bestStreak: 0,
    },
    history: [],
    letters,
  };
}

function createDefaultGrammarStageStats() {
  return {
    attempts: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    bestTimeMs: null,
    lastSeenAt: null,
    recent: [],
  };
}

function createDefaultGrammarAtomProgress() {
  const stageStats = {};
  STAGE_SEQUENCE.forEach((stageId) => {
    stageStats[stageId] = createDefaultGrammarStageStats();
  });

  return {
    attempts: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    bestTimeMs: null,
    lastSeenAt: null,
    recent: [],
    currentStageId: STAGE_SEQUENCE[0],
    mastered: false,
    stageStats,
  };
}

function createDefaultGrammarSubdeckStats() {
  return {
    attempts: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    lastSeenAt: null,
  };
}

function createDefaultSessionStats() {
  return {
    attempts: 0,
    cleanAttempts: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    bestStreak: 0,
    updatedAt: null,
  };
}

function createDefaultGrammarModuleProgress(moduleDef) {
  const atoms = {};
  moduleDef.atoms.forEach((atom) => {
    atoms[atom.id] = createDefaultGrammarAtomProgress();
  });

  const subdecks = {};
  moduleDef.subdecks.forEach((subdeck) => {
    subdecks[subdeck.id] = createDefaultGrammarSubdeckStats();
  });

  return {
    moduleId: moduleDef.moduleId,
    title: moduleDef.title,
    selectedSubdeckId: moduleDef.defaultSubdeckId,
    selectedPersonId: null,
    totals: {
      attempts: 0,
      totalTimeMs: 0,
      totalErrors: 0,
      bestStreak: 0,
    },
    history: [],
    sessionStats: createDefaultSessionStats(),
    subdecks,
    atoms,
    lastUsedSettings: {
      selectedSubdeckId: moduleDef.defaultSubdeckId,
      selectedPersonId: null,
      pinnedAtomId: null,
    },
  };
}

function createDefaultData() {
  const timestamp = Date.now();
  return {
    version: APP_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    keyboard: createDefaultKeyboardProgress(),
    grammarModules: {
      first_conjugation: createDefaultGrammarModuleProgress(
        GRAMMAR_MODULES.first_conjugation,
      ),
      second_conjugation: createDefaultGrammarModuleProgress(
        GRAMMAR_MODULES.second_conjugation,
      ),
    },
  };
}

function createKeyboardSession() {
  return {
    active: false,
    transitioning: false,
    currentLetter: LETTERS[Math.floor(Math.random() * LETTERS.length)],
    promptStartedAt: 0,
    errorsThisAttempt: 0,
    currentStreak: 0,
    bestStreak: 0,
    attempts: 0,
    cleanHits: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    previousLetters: [],
    layoutHintUntil: 0,
    message: "Press Resume, switch your keyboard layout to Russian, and type the letter shown.",
    flashTone: "idle",
    advanceTimerId: 0,
  };
}

function createGrammarSession(moduleId) {
  return {
    moduleId,
    active: false,
    transitioning: false,
    currentAtomId: null,
    currentPrompt: null,
    promptStartedAt: 0,
    errorsThisAttempt: 0,
    currentStreak: 0,
    bestStreak: 0,
    attempts: 0,
    cleanAttempts: 0,
    totalTimeMs: 0,
    totalErrors: 0,
    inputValue: "",
    message: "Press Resume to start getting exact form reps.",
    recentAtomIds: [],
    flashTone: "idle",
    pinnedAtomId: null,
    advanceTimerId: 0,
  };
}

function createGrammarSessions() {
  return {
    first_conjugation: createGrammarSession("first_conjugation"),
    second_conjugation: createGrammarSession("second_conjugation"),
  };
}

function hydrateRuntimeFromData() {
  keyboardSession = createKeyboardSession();
  grammarSessions = createGrammarSessions();
  Object.keys(GRAMMAR_MODULES).forEach((moduleId) => {
    const pinned = data.grammarModules[moduleId].lastUsedSettings?.pinnedAtomId;
    if (pinned && GRAMMAR_MODULES[moduleId].atomsById[pinned]) {
      grammarSessions[moduleId].pinnedAtomId = pinned;
    }
  });
}

function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function sanitizeAttemptRecent(items, limit) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      timeMs: ensureNumber(item?.timeMs, 0),
      errors: ensureNumber(item?.errors, 0),
      at: ensureNumber(item?.at, Date.now()),
    }))
    .filter((item) => item.timeMs >= 0 && item.errors >= 0)
    .slice(-limit);
}

function sanitizeKeyboardHistory(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      letter: LETTERS.includes(item?.letter) ? item.letter : null,
      timeMs: ensureNumber(item?.timeMs, 0),
      errors: ensureNumber(item?.errors, 0),
      at: ensureNumber(item?.at, Date.now()),
    }))
    .filter((item) => item.letter)
    .slice(-HISTORY_LIMIT);
}

function sanitizeKeyboardProgress(parsed) {
  const base = createDefaultKeyboardProgress();
  if (!parsed || typeof parsed !== "object") {
    return base;
  }

  base.createdAt = ensureNumber(parsed.createdAt, base.createdAt);
  base.updatedAt = ensureNumber(parsed.updatedAt, base.updatedAt);
  base.totals.attempts = ensureNumber(parsed.totals?.attempts, 0);
  base.totals.totalTimeMs = ensureNumber(parsed.totals?.totalTimeMs, 0);
  base.totals.totalErrors = ensureNumber(parsed.totals?.totalErrors, 0);
  base.totals.bestStreak = ensureNumber(parsed.totals?.bestStreak, 0);
  base.history = sanitizeKeyboardHistory(parsed.history);

  LETTERS.forEach((letter) => {
    const source = parsed.letters?.[letter] || {};
    base.letters[letter] = {
      attempts: ensureNumber(source.attempts, 0),
      totalTimeMs: ensureNumber(source.totalTimeMs, 0),
      totalErrors: ensureNumber(source.totalErrors, 0),
      bestTimeMs:
        source.bestTimeMs === null || source.bestTimeMs === undefined
          ? null
          : ensureNumber(source.bestTimeMs, null),
      lastSeenAt:
        source.lastSeenAt === null || source.lastSeenAt === undefined
          ? null
          : ensureNumber(source.lastSeenAt, null),
      recent: sanitizeAttemptRecent(source.recent, RECENT_PER_LETTER),
    };
  });

  return base;
}

function sanitizeGrammarHistory(items, moduleDef) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      atomId: moduleDef.atomsById[item?.atomId] ? item.atomId : null,
      stageId: STAGE_SEQUENCE.includes(item?.stageId) ? item.stageId : null,
      timeMs: ensureNumber(item?.timeMs, 0),
      errors: ensureNumber(item?.errors, 0),
      at: ensureNumber(item?.at, Date.now()),
    }))
    .filter((item) => item.atomId && item.stageId)
    .slice(-GRAMMAR_HISTORY_LIMIT);
}

function sanitizeGrammarStageStats(candidate) {
  return {
    attempts: ensureNumber(candidate?.attempts, 0),
    totalTimeMs: ensureNumber(candidate?.totalTimeMs, 0),
    totalErrors: ensureNumber(candidate?.totalErrors, 0),
    bestTimeMs:
      candidate?.bestTimeMs === null || candidate?.bestTimeMs === undefined
        ? null
        : ensureNumber(candidate.bestTimeMs, null),
    lastSeenAt:
      candidate?.lastSeenAt === null || candidate?.lastSeenAt === undefined
        ? null
        : ensureNumber(candidate.lastSeenAt, null),
    recent: sanitizeAttemptRecent(candidate?.recent, GRAMMAR_RECENT_LIMIT),
  };
}

function stageMeetsRule(stageStats, rule) {
  if (!rule || stageStats.attempts < ensureNumber(rule.minCorrect, Infinity)) {
    return false;
  }

  const recentSet = stageStats.recent.length
    ? stageStats.recent
    : stageStats.attempts
      ? [
          {
            timeMs: stageStats.totalTimeMs / stageStats.attempts,
            errors: stageStats.totalErrors / stageStats.attempts,
          },
        ]
      : [];
  const avgTime = recentSet.length ? average(recentSet, (item) => item.timeMs) : Infinity;
  const avgErrors = recentSet.length
    ? average(recentSet, (item) => item.errors)
    : Infinity;

  if (
    rule.maxRecentAvgTimeMs !== undefined &&
    avgTime > ensureNumber(rule.maxRecentAvgTimeMs, avgTime)
  ) {
    return false;
  }

  if (
    rule.maxRecentAvgErrors !== undefined &&
    avgErrors > ensureNumber(rule.maxRecentAvgErrors, avgErrors)
  ) {
    return false;
  }

  return true;
}

function sanitizeGrammarAtomProgress(candidate) {
  const base = createDefaultGrammarAtomProgress();
  if (!candidate || typeof candidate !== "object") {
    return base;
  }

  base.attempts = ensureNumber(candidate.attempts, 0);
  base.totalTimeMs = ensureNumber(candidate.totalTimeMs, 0);
  base.totalErrors = ensureNumber(candidate.totalErrors, 0);
  base.bestTimeMs =
    candidate.bestTimeMs === null || candidate.bestTimeMs === undefined
      ? null
      : ensureNumber(candidate.bestTimeMs, null);
  base.lastSeenAt =
    candidate.lastSeenAt === null || candidate.lastSeenAt === undefined
      ? null
      : ensureNumber(candidate.lastSeenAt, null);
  base.recent = sanitizeAttemptRecent(candidate.recent, GRAMMAR_RECENT_LIMIT);

  STAGE_SEQUENCE.forEach((stageId) => {
    base.stageStats[stageId] = sanitizeGrammarStageStats(candidate.stageStats?.[stageId]);
  });

  let stageIndex = STAGE_SEQUENCE.indexOf(candidate.currentStageId);
  if (stageIndex < 0) {
    stageIndex = 0;
  }
  while (stageIndex < STAGE_SEQUENCE.length - 1) {
    const stageId = STAGE_SEQUENCE[stageIndex];
    const rule = SHARED_CONFIG.stageProfiles.grammar_full.unlockRules[STAGE_UNLOCK_KEYS[stageId]];
    if (!stageMeetsRule(base.stageStats[stageId], rule)) {
      break;
    }
    stageIndex += 1;
  }

  base.currentStageId = STAGE_SEQUENCE[stageIndex];
  base.mastered = stageMeetsRule(
    base.stageStats.sentenceFree,
    SHARED_CONFIG.stageProfiles.grammar_full.unlockRules.sentenceFree_mastered,
  );
  return base;
}

function sanitizeSessionStats(candidate) {
  return {
    attempts: ensureNumber(candidate?.attempts, 0),
    cleanAttempts: ensureNumber(candidate?.cleanAttempts, 0),
    totalTimeMs: ensureNumber(candidate?.totalTimeMs, 0),
    totalErrors: ensureNumber(candidate?.totalErrors, 0),
    bestStreak: ensureNumber(candidate?.bestStreak, 0),
    updatedAt:
      candidate?.updatedAt === null || candidate?.updatedAt === undefined
        ? null
        : ensureNumber(candidate.updatedAt, null),
  };
}

function sanitizeGrammarModuleProgress(candidate, moduleDef) {
  const base = createDefaultGrammarModuleProgress(moduleDef);
  if (!candidate || typeof candidate !== "object") {
    return base;
  }

  base.selectedSubdeckId = moduleDef.subdeckMap[candidate.selectedSubdeckId]
    ? candidate.selectedSubdeckId
    : base.selectedSubdeckId;
  base.selectedPersonId = PERSON_BY_ID[candidate.selectedPersonId]
    ? candidate.selectedPersonId
    : null;
  base.totals.attempts = ensureNumber(candidate.totals?.attempts, 0);
  base.totals.totalTimeMs = ensureNumber(candidate.totals?.totalTimeMs, 0);
  base.totals.totalErrors = ensureNumber(candidate.totals?.totalErrors, 0);
  base.totals.bestStreak = ensureNumber(candidate.totals?.bestStreak, 0);
  base.history = sanitizeGrammarHistory(candidate.history, moduleDef);
  base.sessionStats = sanitizeSessionStats(candidate.sessionStats);

  moduleDef.subdecks.forEach((subdeck) => {
    const source = candidate.subdecks?.[subdeck.id] || {};
    base.subdecks[subdeck.id] = {
      attempts: ensureNumber(source.attempts, 0),
      totalTimeMs: ensureNumber(source.totalTimeMs, 0),
      totalErrors: ensureNumber(source.totalErrors, 0),
      lastSeenAt:
        source.lastSeenAt === null || source.lastSeenAt === undefined
          ? null
          : ensureNumber(source.lastSeenAt, null),
    };
  });

  moduleDef.atoms.forEach((atom) => {
    base.atoms[atom.id] = sanitizeGrammarAtomProgress(candidate.atoms?.[atom.id]);
  });

  base.lastUsedSettings.selectedSubdeckId = moduleDef.subdeckMap[
    candidate.lastUsedSettings?.selectedSubdeckId
  ]
    ? candidate.lastUsedSettings.selectedSubdeckId
    : base.selectedSubdeckId;
  base.lastUsedSettings.selectedPersonId = PERSON_BY_ID[
    candidate.lastUsedSettings?.selectedPersonId
  ]
    ? candidate.lastUsedSettings.selectedPersonId
    : null;
  base.lastUsedSettings.pinnedAtomId = moduleDef.atomsById[
    candidate.lastUsedSettings?.pinnedAtomId
  ]
    ? candidate.lastUsedSettings.pinnedAtomId
    : null;

  if (!moduleDef.subdeckMap[base.selectedSubdeckId]) {
    base.selectedSubdeckId = moduleDef.defaultSubdeckId;
  }

  return base;
}

function sanitizeData(parsed) {
  const base = createDefaultData();
  if (!parsed || typeof parsed !== "object") {
    return base;
  }

  const hasVersion2Shape =
    Object.prototype.hasOwnProperty.call(parsed, "keyboard") ||
    Object.prototype.hasOwnProperty.call(parsed, "grammarModules");

  if (hasVersion2Shape) {
    base.createdAt = ensureNumber(parsed.createdAt, base.createdAt);
    base.updatedAt = ensureNumber(parsed.updatedAt, base.updatedAt);
    base.keyboard = sanitizeKeyboardProgress(parsed.keyboard);
    base.grammarModules.first_conjugation = sanitizeGrammarModuleProgress(
      parsed.grammarModules?.first_conjugation,
      GRAMMAR_MODULES.first_conjugation,
    );
    base.grammarModules.second_conjugation = sanitizeGrammarModuleProgress(
      parsed.grammarModules?.second_conjugation,
      GRAMMAR_MODULES.second_conjugation,
    );
    return base;
  }

  base.createdAt = ensureNumber(parsed.createdAt, base.createdAt);
  base.updatedAt = ensureNumber(parsed.updatedAt, base.updatedAt);
  base.keyboard = sanitizeKeyboardProgress(parsed);
  return base;
}

function getKeyboardProgress() {
  return data.keyboard;
}

function getGrammarModuleProgress(moduleId) {
  return data.grammarModules[moduleId];
}

function touchData() {
  data.updatedAt = Date.now();
}

async function fetchProgress() {
  const response = await fetch(API_PROGRESS_URL, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Progress load failed with ${response.status}.`);
  }

  return sanitizeData(await response.json());
}

async function putProgress(progress) {
  const response = await fetch(API_PROGRESS_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Expected-Updated-At": String(serverUpdatedAt || 0),
    },
    body: JSON.stringify(progress),
  });

  if (response.status === 409) {
    const latest = sanitizeData(await response.json());
    data = latest;
    hydrateRuntimeFromData();
    serverUpdatedAt = latest.updatedAt;
    appState.lastSaveOutcome = "conflict";
    pauseAllPractice(
      "Another tab updated the server first. The latest saved progress is loaded.",
    );
    render();
    return null;
  }

  if (!response.ok) {
    throw new Error(`Progress save failed with ${response.status}.`);
  }

  const saved = sanitizeData(await response.json());
  data = saved;
  serverUpdatedAt = saved.updatedAt;
  return saved;
}

async function flushSaveQueue() {
  if (appState.saveInFlight || !appState.saveQueued || !appState.ready) {
    return;
  }

  appState.saveInFlight = true;
  window.clearTimeout(appState.retryTimer);

  try {
    while (appState.saveQueued && appState.ready) {
      appState.saveQueued = false;
      const saved = await putProgress(data);

      if (!saved) {
        appState.serverError = false;
        return;
      }

      appState.lastSaveOutcome = "saved";
    }

    appState.serverError = false;
  } catch (error) {
    console.error(error);
    appState.serverError = true;
    appState.lastSaveOutcome = "error";
    appState.saveQueued = true;
    appState.retryTimer = window.setTimeout(() => {
      void flushSaveQueue();
    }, SAVE_RETRY_MS);
  } finally {
    appState.saveInFlight = false;
    render();

    if (!appState.serverError && appState.saveQueued && appState.ready) {
      void flushSaveQueue();
    }
  }
}

async function saveData() {
  if (!appState.ready) {
    return "not-ready";
  }

  touchData();
  appState.saveQueued = true;
  await flushSaveQueue();
  return appState.lastSaveOutcome;
}

async function loadServerData() {
  const loaded = await fetchProgress();
  data = loaded;
  hydrateRuntimeFromData();
  serverUpdatedAt = loaded.updatedAt;
  appState.ready = true;
  appState.serverError = false;
  appState.loadError = "";
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

function formatPercent(value) {
  return `${Math.round(value)}%`;
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
  return value === null || value === undefined ? "—" : formatMs(value);
}

function displayErrors(value) {
  return value === null || value === undefined ? "—" : formatErrors(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shuffleArray(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getSaveStatus() {
  if (!appState.ready && !appState.loadError) {
    return { label: "Loading", className: "loading" };
  }

  if (appState.loadError) {
    return { label: "Read-only", className: "retrying" };
  }

  if (appState.serverError) {
    return { label: "Retrying", className: "retrying" };
  }

  if (appState.lastSaveOutcome === "conflict") {
    return { label: "Reloaded newer copy", className: "conflict" };
  }

  if (appState.lastSaveOutcome === "saved") {
    return { label: "Saved", className: "saved" };
  }

  return { label: "Idle", className: "idle" };
}

function getKeyboardLifetimeAverages() {
  const keyboard = getKeyboardProgress();
  if (!keyboard.totals.attempts) {
    return {
      avgTimeMs: 0,
      avgErrors: 0,
    };
  }

  return {
    avgTimeMs: keyboard.totals.totalTimeMs / keyboard.totals.attempts,
    avgErrors: keyboard.totals.totalErrors / keyboard.totals.attempts,
  };
}

function getKeyboardBaseline() {
  const lifetime = getKeyboardLifetimeAverages();
  return {
    avgTimeMs: clamp(lifetime.avgTimeMs || PRIOR_TIME_MS, 700, 2800),
    avgErrors: clamp(lifetime.avgErrors || PRIOR_ERRORS, 0.25, 2.8),
  };
}

function buildLetterProfile(letter) {
  const keyboard = getKeyboardProgress();
  const stats = keyboard.letters[letter];
  const baseline = getKeyboardBaseline();
  const attempts = stats.attempts;
  const smoothedTime =
    (stats.totalTimeMs + PRIOR_ATTEMPTS * baseline.avgTimeMs) /
    (attempts + PRIOR_ATTEMPTS);
  const smoothedErrors =
    (stats.totalErrors + PRIOR_ATTEMPTS * baseline.avgErrors) /
    (attempts + PRIOR_ATTEMPTS);
  const recentAvgTime = stats.recent.length
    ? average(stats.recent, (item) => item.timeMs)
    : smoothedTime;
  const recentAvgErrors = stats.recent.length
    ? average(stats.recent, (item) => item.errors)
    : smoothedErrors;
  const noveltyBoost = 1 / Math.sqrt(attempts + 1);
  const recencyMinutes = stats.lastSeenAt
    ? (Date.now() - stats.lastSeenAt) / 60000
    : 90;
  const staleBoost = clamp(recencyMinutes / 120, 0.08, 0.42);
  const timePressure = smoothedTime / baseline.avgTimeMs;
  const errorPressure = smoothedErrors / (baseline.avgErrors + 0.35);
  const difficulty =
    0.58 * timePressure +
    0.27 * errorPressure +
    0.15 * noveltyBoost +
    staleBoost;

  let weight = 0.22 + difficulty;
  if (keyboardSession.currentLetter === letter) {
    weight *= 0.46;
  }
  if (keyboardSession.previousLetters.includes(letter)) {
    weight *= 0.72;
  }

  return {
    letter,
    stats,
    attempts,
    smoothedTime,
    smoothedErrors,
    recentAvgTime,
    recentAvgErrors,
    difficulty,
    weight,
  };
}

function pickWeightedLetter() {
  const profiles = LETTERS.map(buildLetterProfile);
  const totalWeight = profiles.reduce((sum, profile) => sum + profile.weight, 0);
  let threshold = Math.random() * totalWeight;

  for (const profile of profiles) {
    threshold -= profile.weight;
    if (threshold <= 0) {
      return profile.letter;
    }
  }

  return profiles[profiles.length - 1].letter;
}

function clearKeyboardAdvanceTimer() {
  window.clearTimeout(keyboardSession.advanceTimerId);
  keyboardSession.advanceTimerId = 0;
}

function startKeyboardSession() {
  if (!appState.ready) {
    return;
  }

  clearKeyboardAdvanceTimer();
  keyboardSession.active = true;
  keyboardSession.transitioning = false;
  keyboardSession.errorsThisAttempt = 0;
  keyboardSession.layoutHintUntil = 0;
  keyboardSession.flashTone = "idle";
  keyboardSession.message = "Find the highlighted letter on your Russian keyboard.";

  if (!keyboardSession.currentLetter) {
    keyboardSession.currentLetter = pickWeightedLetter();
  }

  keyboardSession.promptStartedAt = performance.now();
  render();
  startTimerLoop();
}

function pauseKeyboardSession(
  message = "Paused. Resume when ready.",
  { renderNow = true } = {},
) {
  clearKeyboardAdvanceTimer();
  keyboardSession.active = false;
  keyboardSession.transitioning = false;
  keyboardSession.promptStartedAt = 0;
  keyboardSession.errorsThisAttempt = 0;
  keyboardSession.flashTone = "idle";
  keyboardSession.message = message;
  cancelAnimationFrame(timerFrame);
  if (renderNow) {
    render();
  }
}

function registerKeyboardAttempt(letter, timeMs, errors) {
  const keyboard = getKeyboardProgress();
  const stats = keyboard.letters[letter];
  const now = Date.now();
  stats.attempts += 1;
  stats.totalTimeMs += timeMs;
  stats.totalErrors += errors;
  stats.lastSeenAt = now;
  stats.bestTimeMs = stats.bestTimeMs === null ? timeMs : Math.min(stats.bestTimeMs, timeMs);
  stats.recent.push({ timeMs, errors, at: now });
  stats.recent = stats.recent.slice(-RECENT_PER_LETTER);

  keyboard.totals.attempts += 1;
  keyboard.totals.totalTimeMs += timeMs;
  keyboard.totals.totalErrors += errors;
  keyboard.totals.bestStreak = Math.max(
    keyboard.totals.bestStreak,
    keyboardSession.currentStreak,
  );
  keyboard.history.push({ letter, timeMs, errors, at: now });
  keyboard.history = keyboard.history.slice(-HISTORY_LIMIT);
  keyboard.updatedAt = now;
  void saveData();
}

function advanceKeyboardPrompt() {
  keyboardSession.previousLetters = [
    keyboardSession.currentLetter,
    ...keyboardSession.previousLetters,
  ].slice(0, 3);
  keyboardSession.currentLetter = pickWeightedLetter();
  keyboardSession.transitioning = false;
  keyboardSession.promptStartedAt = performance.now();
  keyboardSession.errorsThisAttempt = 0;
  keyboardSession.layoutHintUntil = 0;
  keyboardSession.flashTone = "idle";
  keyboardSession.message = "Find the highlighted letter on your Russian keyboard.";
  render();
  startTimerLoop();
}

function completeCurrentLetter() {
  if (!keyboardSession.active || !keyboardSession.promptStartedAt) {
    return;
  }

  const timeMs = performance.now() - keyboardSession.promptStartedAt;
  const errors = keyboardSession.errorsThisAttempt;

  keyboardSession.attempts += 1;
  keyboardSession.totalTimeMs += timeMs;
  keyboardSession.totalErrors += errors;
  keyboardSession.currentStreak += 1;
  keyboardSession.bestStreak = Math.max(
    keyboardSession.bestStreak,
    keyboardSession.currentStreak,
  );
  if (errors === 0) {
    keyboardSession.cleanHits += 1;
  }

  registerKeyboardAttempt(keyboardSession.currentLetter, timeMs, errors);
  keyboardSession.transitioning = true;
  keyboardSession.promptStartedAt = 0;
  keyboardSession.flashTone = "correct";
  cancelAnimationFrame(timerFrame);

  const linePool = errors === 0 ? SUCCESS_LINES : RECOVER_LINES;
  const line = linePool[Math.floor(Math.random() * linePool.length)];
  keyboardSession.message =
    errors === 0
      ? `${line} ${formatMs(timeMs)}.`
      : `${line} ${formatMs(timeMs)} with ${errors} miss${errors === 1 ? "" : "es"}.`;

  render();

  keyboardSession.advanceTimerId = window.setTimeout(() => {
    if (!keyboardSession.active) {
      return;
    }
    advanceKeyboardPrompt();
  }, 280);
}

function handleWrongKey(rawKey) {
  if (!keyboardSession.active || keyboardSession.transitioning) {
    return;
  }

  keyboardSession.errorsThisAttempt += 1;
  keyboardSession.currentStreak = 0;
  keyboardSession.flashTone = "wrong";
  keyboardSession.message = `Not ${keyboardSession.currentLetter}. Misses this round: ${keyboardSession.errorsThisAttempt}.`;

  if (/^[a-z]$/i.test(rawKey)) {
    keyboardSession.layoutHintUntil = Date.now() + 2500;
  }

  render();
}

function computeCoverage() {
  const keyboard = getKeyboardProgress();
  const practiced = LETTERS.filter((letter) => keyboard.letters[letter].attempts > 0).length;
  const solid = LETTERS.filter((letter) => keyboard.letters[letter].attempts >= 5).length;
  return { practiced, solid };
}

function computeKeyboardTrendSummary() {
  const history = getKeyboardProgress().history;
  const recent = history.slice(-20);
  const previous = history.slice(-40, -20);

  if (recent.length < 8 || previous.length < 8) {
    return {
      title: "Waiting for a stronger sample",
      detail: "Trend cards become useful after roughly 16 attempts.",
    };
  }

  const recentAvg = average(recent, (item) => item.timeMs);
  const previousAvg = average(previous, (item) => item.timeMs);
  const diff = Math.round(recentAvg - previousAvg);
  const recentErrors = average(recent, (item) => item.errors);
  const previousErrors = average(previous, (item) => item.errors);
  const errorDiff = recentErrors - previousErrors;

  if (diff < -40 || errorDiff < -0.08) {
    return {
      title: diff < -40 ? `${Math.abs(diff)} ms faster lately` : "Cleaner lately",
      detail: `${Math.abs(errorDiff).toFixed(2)} fewer errors than the 20 attempts before.`,
    };
  }

  if (diff > 40 || errorDiff > 0.08) {
    return {
      title: diff > 40 ? `${diff} ms slower lately` : "More misses lately",
      detail: `${errorDiff.toFixed(2)} more errors than the 20 attempts before.`,
    };
  }

  return {
    title: "Holding steady",
    detail: "Speed and error rate are close to the previous 20 attempts.",
  };
}

function buildKeyboardFocusLetters() {
  return LETTERS.map(buildLetterProfile)
    .sort((left, right) => right.difficulty - left.difficulty)
    .slice(0, 6);
}

function getStageErrorTarget(stageId) {
  const rule = SHARED_CONFIG.stageProfiles.grammar_full.unlockRules[STAGE_UNLOCK_KEYS[stageId]];
  return rule?.maxRecentAvgErrors ?? 0.25;
}

function getActiveGrammarAtomIds(moduleId, { respectPersonFilter = true } = {}) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const moduleProgress = getGrammarModuleProgress(moduleId);
  let atomIds = moduleDef.atomsBySubdeckId[moduleProgress.selectedSubdeckId] || [];

  if (respectPersonFilter && moduleProgress.selectedPersonId) {
    atomIds = atomIds.filter(
      (atomId) => moduleDef.atomsById[atomId].personId === moduleProgress.selectedPersonId,
    );
  }

  return atomIds;
}

function isGrammarAtomEligible(moduleId, atomId) {
  return getActiveGrammarAtomIds(moduleId).includes(atomId);
}

function buildGrammarAtomProfile(moduleId, atomId, applyImmediatePenalty = false) {
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const atomProgress = moduleProgress.atoms[atomId];
  const stageId = atomProgress.currentStageId;
  const stageStats = atomProgress.stageStats[stageId];
  const targetTime = GRAMMAR_TARGET_TIMES[stageId] || 3200;
  const maxErrors = getStageErrorTarget(stageId) || 0.25;
  const avgTime = stageStats.attempts
    ? stageStats.recent.length
      ? average(stageStats.recent, (item) => item.timeMs)
      : stageStats.totalTimeMs / stageStats.attempts
    : targetTime;
  const avgErrors = stageStats.attempts
    ? stageStats.recent.length
      ? average(stageStats.recent, (item) => item.errors)
      : stageStats.totalErrors / stageStats.attempts
    : maxErrors;
  const weakness =
    0.45 * clamp(avgTime / targetTime, 0, 2) +
    0.35 * clamp(avgErrors / maxErrors, 0, 2) +
    0.2 * (1 - Math.min(atomProgress.attempts / 8, 1));
  const hoursSinceLastSeen = atomProgress.lastSeenAt
    ? (Date.now() - atomProgress.lastSeenAt) / 3600000
    : 72;
  const recencyBoost = Math.min(hoursSinceLastSeen / 72, 1) * 0.35;
  const newnessBoost = atomProgress.attempts === 0 ? 0.4 : 0;
  const session = grammarSessions[moduleId];
  const immediatePenalty =
    applyImmediatePenalty && session.recentAtomIds.slice(0, 5).includes(atomId) ? 0.6 : 0;
  const score = weakness + recencyBoost + newnessBoost - immediatePenalty;

  return {
    atomId,
    stageId,
    avgTime,
    avgErrors,
    weakness,
    recencyBoost,
    newnessBoost,
    score,
    displayScore: weakness + recencyBoost + newnessBoost,
    attempts: atomProgress.attempts,
    mastered: atomProgress.mastered,
  };
}

function pickWeightedGrammarAtom(moduleId, forcedAtomId = null) {
  if (forcedAtomId && isGrammarAtomEligible(moduleId, forcedAtomId)) {
    return forcedAtomId;
  }

  const eligible = getActiveGrammarAtomIds(moduleId);
  if (!eligible.length) {
    return null;
  }

  const profiles = eligible
    .map((atomId) => buildGrammarAtomProfile(moduleId, atomId, true))
    .sort((left, right) => right.score - left.score);
  const pool = profiles.slice(0, GRAMMAR_TOP_PICK_COUNT);
  const totalWeight = pool.reduce((sum, profile) => sum + Math.max(profile.score, 0.05), 0);
  let threshold = Math.random() * totalWeight;

  for (const profile of pool) {
    threshold -= Math.max(profile.score, 0.05);
    if (threshold <= 0) {
      return profile.atomId;
    }
  }

  return pool[pool.length - 1]?.atomId || eligible[0];
}

function buildChoiceOptions(moduleId, atom, stageId, { shuffle = true } = {}) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const verbAtomIds = moduleDef.atomsByVerbId[atom.verbId] || [];
  const verbAtomsByPerson = Object.fromEntries(
    verbAtomIds.map((atomId) => [moduleDef.atomsById[atomId].personId, moduleDef.atomsById[atomId]]),
  );
  const confusion = SHARED_CONFIG.confusionPriority[atom.personId] || [];
  const optionCount =
    stageId === "choose2" ? 2 : stageId === "choose4" ? 4 : stageId === "fullChoice" ? 6 : 0;

  if (!optionCount) {
    return [];
  }

  const orderedPersons = [atom.personId, ...confusion].filter(
    (personId, index, all) => all.indexOf(personId) === index && verbAtomsByPerson[personId],
  );
  const selectedPersons = orderedPersons.slice(0, optionCount);
  const options = selectedPersons.map((personId) => {
    const optionAtom = verbAtomsByPerson[personId];
    return {
      personId,
      answer: optionAtom.answer,
      pronoun: optionAtom.pronoun,
      isTarget: personId === atom.personId,
    };
  });

  return shuffle ? shuffleArray(options) : options;
}

function buildGrammarPrompt(moduleId, atomId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const atom = moduleDef.atomsById[atomId];
  const stageId = moduleProgress.atoms[atomId].currentStageId;
  return {
    atomId,
    stageId,
    options: buildChoiceOptions(moduleId, atom, stageId),
    contextFrameIndex: atom.contextFrames.length
      ? Math.floor(Math.random() * atom.contextFrames.length)
      : 0,
  };
}

function buildStaticGrammarPrompt(moduleId, atomId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const atom = moduleDef.atomsById[atomId];
  const stageId = moduleProgress.atoms[atomId].currentStageId;
  return {
    atomId,
    stageId,
    options: buildChoiceOptions(moduleId, atom, stageId, { shuffle: false }),
    contextFrameIndex: 0,
  };
}

function getFragmentTail(atom) {
  return atom.answer.startsWith(atom.fragmentBase)
    ? atom.answer.slice(atom.fragmentBase.length)
    : atom.answer;
}

function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .replace(/\.+$/u, "")
    .toLocaleLowerCase("ru");
}

function compareAnswer(submitted, canonical) {
  const normalizedSubmitted = normalizeAnswer(submitted);
  const normalizedCanonical = normalizeAnswer(canonical);
  const canonicalUsesYo = normalizedCanonical.includes("ё");

  if (normalizedSubmitted === normalizedCanonical) {
    return { correct: true, yoHint: false };
  }

  if (
    canonicalUsesYo &&
    normalizedSubmitted.replaceAll("е", "ё") !== normalizedCanonical &&
    normalizedSubmitted.replaceAll("ё", "е") === normalizedCanonical.replaceAll("ё", "е")
  ) {
    return { correct: false, yoHint: true };
  }

  return { correct: false, yoHint: false };
}

function getGrammarSession(moduleId) {
  return grammarSessions[moduleId];
}

function clearGrammarAdvanceTimer(moduleId) {
  const session = getGrammarSession(moduleId);
  window.clearTimeout(session.advanceTimerId);
  session.advanceTimerId = 0;
}

function getRenderAtomId(moduleId) {
  const session = getGrammarSession(moduleId);
  const activeAtomIds = getActiveGrammarAtomIds(moduleId);
  if (session.currentAtomId && GRAMMAR_MODULES[moduleId].atomsById[session.currentAtomId]) {
    return session.currentAtomId;
  }

  if (session.pinnedAtomId && GRAMMAR_MODULES[moduleId].atomsById[session.pinnedAtomId]) {
    return session.pinnedAtomId;
  }

  return activeAtomIds[0] || null;
}

function startGrammarSession(moduleId, forcedAtomId = null) {
  if (!appState.ready) {
    return;
  }

  const session = getGrammarSession(moduleId);
  const moduleProgress = getGrammarModuleProgress(moduleId);
  clearGrammarAdvanceTimer(moduleId);

  session.active = true;
  session.transitioning = false;
  session.errorsThisAttempt = 0;
  session.flashTone = "idle";
  session.inputValue = "";

  const currentAtomStillEligible =
    session.currentAtomId &&
    isGrammarAtomEligible(moduleId, session.currentAtomId) &&
    moduleProgress.atoms[session.currentAtomId];

  const requestedAtomId =
    forcedAtomId ||
    (session.pinnedAtomId && isGrammarAtomEligible(moduleId, session.pinnedAtomId)
      ? session.pinnedAtomId
      : null);

  if (
    requestedAtomId &&
    (!currentAtomStillEligible || session.currentAtomId !== requestedAtomId)
  ) {
    session.currentAtomId = requestedAtomId;
    session.currentPrompt = buildGrammarPrompt(moduleId, requestedAtomId);
  } else if (!currentAtomStillEligible) {
    const atomId = pickWeightedGrammarAtom(moduleId, requestedAtomId);
    session.currentAtomId = atomId;
    session.currentPrompt = atomId ? buildGrammarPrompt(moduleId, atomId) : null;
  } else if (
    !session.currentPrompt ||
    session.currentPrompt.atomId !== session.currentAtomId ||
    session.currentPrompt.stageId !== moduleProgress.atoms[session.currentAtomId].currentStageId
  ) {
    session.currentPrompt = buildGrammarPrompt(moduleId, session.currentAtomId);
  }

  session.promptStartedAt = performance.now();
  session.message = "Stay on the exact target form. One clean rep at a time.";
  render();
  startTimerLoop();
}

function pauseGrammarSession(
  moduleId,
  message = "Paused. Resume when ready.",
  { renderNow = true } = {},
) {
  const session = getGrammarSession(moduleId);
  clearGrammarAdvanceTimer(moduleId);
  session.active = false;
  session.transitioning = false;
  session.promptStartedAt = 0;
  session.errorsThisAttempt = 0;
  session.flashTone = "idle";
  session.message = message;
  cancelAnimationFrame(timerFrame);
  if (renderNow) {
    render();
  }
}

function pauseAllPractice(message) {
  pauseKeyboardSession(message, { renderNow: false });
  Object.keys(GRAMMAR_MODULES).forEach((moduleId) => {
    pauseGrammarSession(moduleId, message, { renderNow: false });
  });
  render();
}

function recordGrammarAttempt(moduleId, atomId, stageId, timeMs, errors) {
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const atomProgress = moduleProgress.atoms[atomId];
  const atom = GRAMMAR_MODULES[moduleId].atomsById[atomId];
  const now = Date.now();

  atomProgress.attempts += 1;
  atomProgress.totalTimeMs += timeMs;
  atomProgress.totalErrors += errors;
  atomProgress.lastSeenAt = now;
  atomProgress.bestTimeMs =
    atomProgress.bestTimeMs === null ? timeMs : Math.min(atomProgress.bestTimeMs, timeMs);
  atomProgress.recent.push({ timeMs, errors, at: now });
  atomProgress.recent = atomProgress.recent.slice(-GRAMMAR_RECENT_LIMIT);

  const stageStats = atomProgress.stageStats[stageId];
  stageStats.attempts += 1;
  stageStats.totalTimeMs += timeMs;
  stageStats.totalErrors += errors;
  stageStats.lastSeenAt = now;
  stageStats.bestTimeMs =
    stageStats.bestTimeMs === null ? timeMs : Math.min(stageStats.bestTimeMs, timeMs);
  stageStats.recent.push({ timeMs, errors, at: now });
  stageStats.recent = stageStats.recent.slice(-GRAMMAR_RECENT_LIMIT);

  moduleProgress.totals.attempts += 1;
  moduleProgress.totals.totalTimeMs += timeMs;
  moduleProgress.totals.totalErrors += errors;
  moduleProgress.history.push({ atomId, stageId, timeMs, errors, at: now });
  moduleProgress.history = moduleProgress.history.slice(-GRAMMAR_HISTORY_LIMIT);

  const subdeckStats = moduleProgress.subdecks[atom.subdeckId];
  subdeckStats.attempts += 1;
  subdeckStats.totalTimeMs += timeMs;
  subdeckStats.totalErrors += errors;
  subdeckStats.lastSeenAt = now;

  const sessionStats = moduleProgress.sessionStats;
  sessionStats.attempts += 1;
  sessionStats.totalTimeMs += timeMs;
  sessionStats.totalErrors += errors;
  if (errors === 0) {
    sessionStats.cleanAttempts += 1;
  }
  sessionStats.updatedAt = now;

  const stageIndex = STAGE_SEQUENCE.indexOf(atomProgress.currentStageId);
  const currentRule = SHARED_CONFIG.stageProfiles.grammar_full.unlockRules[
    STAGE_UNLOCK_KEYS[atomProgress.currentStageId]
  ];
  if (
    stageIndex >= 0 &&
    stageIndex < STAGE_SEQUENCE.length - 1 &&
    stageMeetsRule(atomProgress.stageStats[atomProgress.currentStageId], currentRule)
  ) {
    atomProgress.currentStageId = STAGE_SEQUENCE[stageIndex + 1];
  }

  atomProgress.mastered = stageMeetsRule(
    atomProgress.stageStats.sentenceFree,
    SHARED_CONFIG.stageProfiles.grammar_full.unlockRules.sentenceFree_mastered,
  );

  void saveData();
}

function completeGrammarAttempt(moduleId) {
  const session = getGrammarSession(moduleId);
  if (!session.active || !session.promptStartedAt || !session.currentAtomId || !session.currentPrompt) {
    return;
  }

  const timeMs = performance.now() - session.promptStartedAt;
  const errors = session.errorsThisAttempt;
  const prompt = session.currentPrompt;

  session.attempts += 1;
  session.totalTimeMs += timeMs;
  session.totalErrors += errors;
  session.currentStreak += 1;
  session.bestStreak = Math.max(session.bestStreak, session.currentStreak);
  if (errors === 0) {
    session.cleanAttempts += 1;
  }

  const moduleProgress = getGrammarModuleProgress(moduleId);
  moduleProgress.totals.bestStreak = Math.max(
    moduleProgress.totals.bestStreak,
    session.currentStreak,
  );
  moduleProgress.sessionStats.bestStreak = Math.max(
    moduleProgress.sessionStats.bestStreak,
    session.currentStreak,
  );

  recordGrammarAttempt(moduleId, session.currentAtomId, prompt.stageId, timeMs, errors);
  session.transitioning = true;
  session.promptStartedAt = 0;
  session.flashTone = "correct";
  session.inputValue = "";
  cancelAnimationFrame(timerFrame);

  const linePool = errors === 0 ? SUCCESS_LINES : RECOVER_LINES;
  const line = linePool[Math.floor(Math.random() * linePool.length)];
  session.message =
    errors === 0
      ? `${line} ${formatMs(timeMs)}.`
      : `${line} ${formatMs(timeMs)} with ${errors} strike${errors === 1 ? "" : "s"}.`;

  render();

  session.advanceTimerId = window.setTimeout(() => {
    if (!session.active) {
      return;
    }

    session.recentAtomIds = [session.currentAtomId, ...session.recentAtomIds]
      .filter(Boolean)
      .slice(0, 5);
    const nextAtomId = pickWeightedGrammarAtom(moduleId);
    session.currentAtomId = nextAtomId;
    session.currentPrompt = nextAtomId ? buildGrammarPrompt(moduleId, nextAtomId) : null;
    session.transitioning = false;
    session.promptStartedAt = performance.now();
    session.errorsThisAttempt = 0;
    session.inputValue = "";
    session.flashTone = "idle";
    session.message = "Stay on the exact target form. One clean rep at a time.";
    render();
    startTimerLoop();
  }, 320);
}

function handleGrammarWrong(moduleId, message) {
  const session = getGrammarSession(moduleId);
  if (!session.active || session.transitioning) {
    return;
  }

  session.errorsThisAttempt += 1;
  session.currentStreak = 0;
  session.flashTone = "wrong";
  session.message = `${message} Strikes this round: ${session.errorsThisAttempt}.`;
  render();
}

function handleGrammarChoice(moduleId, answer) {
  const session = getGrammarSession(moduleId);
  if (!session.active || session.transitioning || !session.currentAtomId) {
    return;
  }

  const atom = GRAMMAR_MODULES[moduleId].atomsById[session.currentAtomId];
  if (answer === atom.answer) {
    completeGrammarAttempt(moduleId);
    return;
  }

  handleGrammarWrong(moduleId, "Wrong form.");
}

function handleGrammarSubmit(moduleId) {
  const session = getGrammarSession(moduleId);
  if (!session.active || session.transitioning || !session.currentAtomId || !session.currentPrompt) {
    return;
  }

  const atom = GRAMMAR_MODULES[moduleId].atomsById[session.currentAtomId];
  const stageId = session.currentPrompt.stageId;
  const expected =
    stageId === "typeFragment" || stageId === "sentenceGuided"
      ? getFragmentTail(atom)
      : atom.answer;
  const comparison = compareAnswer(session.inputValue, expected);

  if (comparison.correct) {
    completeGrammarAttempt(moduleId);
    return;
  }

  handleGrammarWrong(
    moduleId,
    comparison.yoHint ? "This form uses ё." : "That is not the canonical form.",
  );
}

function selectGrammarSubdeck(moduleId, subdeckId) {
  const moduleProgress = getGrammarModuleProgress(moduleId);
  if (!GRAMMAR_MODULES[moduleId].subdeckMap[subdeckId] || moduleProgress.selectedSubdeckId === subdeckId) {
    return;
  }

  pauseGrammarSession(moduleId, "Switched subdecks. Resume when ready.", { renderNow: false });
  moduleProgress.selectedSubdeckId = subdeckId;
  moduleProgress.lastUsedSettings.selectedSubdeckId = subdeckId;
  const session = getGrammarSession(moduleId);
  session.currentAtomId = null;
  session.currentPrompt = null;
  if (session.pinnedAtomId && !isGrammarAtomEligible(moduleId, session.pinnedAtomId)) {
    session.pinnedAtomId = null;
    moduleProgress.lastUsedSettings.pinnedAtomId = null;
  }
  void saveData();
  render();
}

function toggleGrammarPersonFocus(moduleId, personId) {
  const moduleProgress = getGrammarModuleProgress(moduleId);
  moduleProgress.selectedPersonId =
    moduleProgress.selectedPersonId === personId ? null : personId;
  moduleProgress.lastUsedSettings.selectedPersonId = moduleProgress.selectedPersonId;
  const session = getGrammarSession(moduleId);
  if (session.currentAtomId && !isGrammarAtomEligible(moduleId, session.currentAtomId)) {
    session.currentAtomId = null;
    session.currentPrompt = null;
  }
  if (session.pinnedAtomId && !isGrammarAtomEligible(moduleId, session.pinnedAtomId)) {
    session.pinnedAtomId = null;
    moduleProgress.lastUsedSettings.pinnedAtomId = null;
  }
  void saveData();
  render();
}

function selectGrammarAtom(moduleId, atomId) {
  if (!GRAMMAR_MODULES[moduleId].atomsById[atomId]) {
    return;
  }

  const session = getGrammarSession(moduleId);
  const moduleProgress = getGrammarModuleProgress(moduleId);
  session.pinnedAtomId = atomId;
  moduleProgress.lastUsedSettings.pinnedAtomId = atomId;

  if (!session.active) {
    session.currentAtomId = atomId;
    session.currentPrompt = buildGrammarPrompt(moduleId, atomId);
    startGrammarSession(moduleId, atomId);
  } else {
    session.message = "Pinned that exact atom for the next clean rep.";
    render();
  }

  void saveData();
}

function switchTab(tabId) {
  if (!MODULE_TABS.some((tab) => tab.id === tabId) || appState.activeTab === tabId) {
    return;
  }

  if (appState.activeTab === "keyboard" && keyboardSession.active) {
    pauseKeyboardSession("Paused after switching modules.", { renderNow: false });
  } else if (GRAMMAR_MODULES[appState.activeTab] && getGrammarSession(appState.activeTab).active) {
    pauseGrammarSession(appState.activeTab, "Paused after switching modules.", {
      renderNow: false,
    });
  }

  appState.activeTab = tabId;
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `russian-skill-coach-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      data = sanitizeData(JSON.parse(String(reader.result)));
      hydrateRuntimeFromData();
    } catch (error) {
      console.error(error);
      render();
      return;
    }

    appState.ready = true;
    appState.loadError = "";
    const outcome = await saveData();
    if (outcome === "saved") {
      pauseAllPractice("Imported progress. Resume when ready.");
    }
    render();
  };
  reader.readAsText(file);
}

async function resetData() {
  const confirmed = window.confirm("Reset all saved progress for Russian Skill Coach?");
  if (!confirmed) {
    return;
  }

  data = createDefaultData();
  hydrateRuntimeFromData();
  appState.ready = true;
  appState.loadError = "";
  const outcome = await saveData();
  if (outcome === "saved") {
    pauseAllPractice("Progress reset. Start a new run.");
  }
  render();
}

function colorForProfile(profile) {
  const normalized = clamp((profile.difficulty - 0.8) / 1.2, 0, 1);
  const hue = 148 - normalized * 92;
  const saturation = 64 + normalized * 12;
  const lightness = 82 - normalized * 24;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function colorForGrammarProfile(profile) {
  const normalized = clamp((profile.displayScore - 0.75) / 1.25, 0, 1);
  const hue = 148 - normalized * 96;
  const saturation = 62 + normalized * 12;
  const lightness = 84 - normalized * 28;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function buildAtomTitle(moduleId, atomId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const atom = moduleDef.atomsById[atomId];
  const atomProgress = getGrammarModuleProgress(moduleId).atoms[atomId];
  const recent = atomProgress.recent.length
    ? average(atomProgress.recent, (item) => item.timeMs)
    : null;
  const recentErrors = atomProgress.recent.length
    ? average(atomProgress.recent, (item) => item.errors)
    : null;
  const lifetimeTime = atomProgress.attempts ? atomProgress.totalTimeMs / atomProgress.attempts : null;
  const lifetimeErrors = atomProgress.attempts
    ? atomProgress.totalErrors / atomProgress.attempts
    : null;

  return [
    `${atom.lemma} · ${atom.pronoun}`,
    `Attempts: ${atomProgress.attempts}`,
    `Avg ms: ${displayMs(lifetimeTime)}`,
    `Recent ms: ${displayMs(recent)}`,
    `Avg errors: ${displayErrors(lifetimeErrors)}`,
    `Recent errors: ${displayErrors(recentErrors)}`,
    `Stage: ${STAGE_LABELS[atomProgress.currentStageId]}`,
    `Mastered: ${atomProgress.mastered ? "yes" : "no"}`,
  ].join(" | ");
}

function getCurrentPromptElapsed() {
  if (appState.activeTab === "keyboard" && keyboardSession.active && keyboardSession.promptStartedAt) {
    return performance.now() - keyboardSession.promptStartedAt;
  }

  if (GRAMMAR_MODULES[appState.activeTab]) {
    const session = getGrammarSession(appState.activeTab);
    if (session.active && session.promptStartedAt) {
      return performance.now() - session.promptStartedAt;
    }
  }

  return 0;
}

function startTimerLoop() {
  cancelAnimationFrame(timerFrame);

  const tick = () => {
    const liveTimer = document.getElementById("live-timer");
    if (!liveTimer) {
      return;
    }

    const elapsed = getCurrentPromptElapsed();
    liveTimer.textContent = elapsed > 0 ? formatMs(elapsed) : "0 ms";

    if (elapsed > 0) {
      timerFrame = requestAnimationFrame(tick);
    }
  };

  timerFrame = requestAnimationFrame(tick);
}

function focusActiveAnswerInput() {
  if (!GRAMMAR_MODULES[appState.activeTab]) {
    return;
  }

  const session = getGrammarSession(appState.activeTab);
  if (!session.active || session.transitioning || !session.currentPrompt) {
    return;
  }

  if (!["typeFragment", "typeFull", "sentenceGuided", "sentenceFree"].includes(session.currentPrompt.stageId)) {
    return;
  }

  const input = document.querySelector('[data-role="grammar-answer-input"]');
  if (input instanceof HTMLInputElement && document.activeElement !== input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function renderChip(label, extraClass = "") {
  return `<span class="chip ${extraClass}">${escapeHtml(label)}</span>`;
}

function renderHero() {
  const saveStatus = getSaveStatus();
  const keyboardAttempts = getKeyboardProgress().totals.attempts;
  const totalMastered = Object.keys(GRAMMAR_MODULES).reduce((sum, moduleId) => {
    const moduleProgress = getGrammarModuleProgress(moduleId);
    return (
      sum +
      Object.values(moduleProgress.atoms).filter((atomProgress) => atomProgress.mastered).length
    );
  }, 0);
  const grammarAttempts = Object.keys(GRAMMAR_MODULES).reduce(
    (sum, moduleId) => sum + getGrammarModuleProgress(moduleId).totals.attempts,
    0,
  );

  return `
    <section class="app-hero card reveal">
      <div class="hero-copy">
        <div>
          <p class="eyebrow">Russian precision practice</p>
          <h1>Russian Skill Coach</h1>
        </div>
        <p class="hero-text">
          Train one tiny target at a time. The app keeps the keyboard trainer's structure:
          exact reps, visible milliseconds, visible strikes, adaptive resurfacing, and
          permanent synced progress.
        </p>
        <div class="module-tabs">
          ${MODULE_TABS.map(
            (tab) => `
              <button
                class="tab-button ${appState.activeTab === tab.id ? "active" : ""}"
                data-action="switch-tab"
                data-tab-id="${tab.id}"
                ${!appState.ready && appState.loadError ? "disabled" : ""}
              >
                ${escapeHtml(tab.label)}
              </button>
            `,
          ).join("")}
        </div>
      </div>
      <div class="hero-side">
        <div class="hero-actions">
          <button class="button button-ghost" data-action="export" ${!appState.ready ? "disabled" : ""}>
            Export data
          </button>
          <button class="button button-ghost" data-action="import" ${!appState.ready ? "disabled" : ""}>
            Import data
          </button>
          <button class="button button-danger" data-action="reset" ${!appState.ready ? "disabled" : ""}>
            Reset progress
          </button>
        </div>
        <div class="overview-grid">
          <div class="overview-card">
            <span class="sync-pill ${saveStatus.className}">${escapeHtml(saveStatus.label)}</span>
            <strong>${keyboardAttempts}</strong>
            <span class="metric-detail">Keyboard attempts saved across devices.</span>
          </div>
          <div class="overview-card">
            <strong>${totalMastered}</strong>
            <span class="metric-detail">Grammar atoms currently meeting mastery thresholds.</span>
            <span class="quiet">${grammarAttempts} total conjugation attempts logged.</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderKeyboardSummaryStrip() {
  const coverage = computeCoverage();
  const trend = computeKeyboardTrendSummary();
  const lifetime = getKeyboardLifetimeAverages();

  return `
    <section class="summary-strip card reveal">
      <div class="summary-head">
        <div class="summary-copy">
          <p class="section-label">Keyboard module</p>
          <h2>Find the matching key</h2>
          <p class="muted-copy">
            Keep the reps narrow, watch the milliseconds, and cool down the weak spots on the keyboard.
          </p>
        </div>
        <div class="summary-actions">
          <button class="button button-primary button-big" data-action="keyboard-resume" ${!appState.ready ? "disabled" : ""}>
            Resume
          </button>
          <button class="button button-ghost" data-action="keyboard-pause" ${!appState.ready || !keyboardSession.active ? "disabled" : ""}>
            Pause
          </button>
        </div>
      </div>
      <div class="summary-metrics">
        <div class="summary-metric">
          <span class="metric-label">Letters covered</span>
          <strong>${coverage.practiced} / ${LETTERS.length}</strong>
          <span class="metric-detail">${coverage.solid} letters have at least five logged attempts.</span>
        </div>
        <div class="summary-metric">
          <span class="metric-label">Recent trend</span>
          <strong>${escapeHtml(trend.title)}</strong>
          <span class="metric-detail">${escapeHtml(trend.detail)}</span>
        </div>
        <div class="summary-metric">
          <span class="metric-label">Lifetime avg</span>
          <strong>${getKeyboardProgress().totals.attempts ? formatMs(lifetime.avgTimeMs) : "0 ms"}</strong>
          <span class="metric-detail">${formatErrors(lifetime.avgErrors)} avg errors</span>
        </div>
        <div class="summary-metric">
          <span class="metric-label">Best streak</span>
          <strong>${getKeyboardProgress().totals.bestStreak}</strong>
          <span class="metric-detail">Longest saved clean run.</span>
        </div>
      </div>
    </section>
  `;
}

function renderKeyboardFocusLetters() {
  return buildKeyboardFocusLetters()
    .map((profile) => {
      const detail = profile.attempts
        ? `${formatMs(profile.stats.totalTimeMs / profile.attempts)} avg, ${formatErrors(
            profile.stats.totalErrors / profile.attempts,
          )} avg errors`
        : "No attempts yet. Still rotating in for coverage.";
      const attemptsLabel = profile.attempts
        ? `${profile.attempts} attempts logged`
        : "Fresh letter";
      return `
        <div class="focus-chip">
          <strong>${escapeHtml(profile.letter)}</strong>
          <p>${escapeHtml(detail)}</p>
          <p>${escapeHtml(attemptsLabel)}</p>
        </div>
      `;
    })
    .join("");
}

function renderKeyboardMap() {
  const profiles = Object.fromEntries(LETTERS.map((letter) => [letter, buildLetterProfile(letter)]));

  return KEYBOARD_ROWS.map(
    (row) => `
      <div class="keyboard-row">
        ${row
          .map((letter) => {
            const profile = profiles[letter];
            const title = profile.attempts
              ? `${letter}: ${formatMs(
                  profile.stats.totalTimeMs / profile.attempts,
                )}, ${formatErrors(profile.stats.totalErrors / profile.attempts)} avg errors`
              : `${letter}: no attempts yet`;
            return `
              <div
                class="keyboard-key ${profile.attempts ? "" : "untouched"} ${
                  keyboardSession.currentLetter === letter ? "target" : ""
                }"
                style="background: ${profile.attempts ? colorForProfile(profile) : "rgba(255,255,255,0.78)"};"
                title="${escapeHtml(title)}"
              >
                <span class="letter">${escapeHtml(letter)}</span>
                <span class="meta">${profile.attempts || "new"}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    `,
  ).join("");
}

function renderKeyboardStatsTable() {
  const rows = LETTERS.map(buildLetterProfile).sort((left, right) => right.difficulty - left.difficulty);

  return rows
    .map((profile) => {
      const lifetimeAvgTime = profile.attempts
        ? profile.stats.totalTimeMs / profile.attempts
        : null;
      const lifetimeAvgErrors = profile.attempts
        ? profile.stats.totalErrors / profile.attempts
        : null;
      const recentAvgTime = profile.attempts ? profile.recentAvgTime : null;
      const recentAvgErrors = profile.attempts ? profile.recentAvgErrors : null;
      const trendDiff =
        lifetimeAvgTime === null || recentAvgTime === null
          ? 0
          : recentAvgTime - lifetimeAvgTime;
      const trendClass =
        trendDiff < -25 ? "trend-down" : trendDiff > 25 ? "trend-up" : "trend-flat";
      const trendText =
        profile.attempts === 0
          ? "New"
          : trendDiff < -25
            ? `${Math.abs(Math.round(trendDiff))} ms faster`
            : trendDiff > 25
              ? `${Math.round(trendDiff)} ms slower`
              : "Stable";

      return `
        <tr>
          <td><strong>${escapeHtml(profile.letter)}</strong></td>
          <td>${profile.attempts}</td>
          <td>${displayMs(lifetimeAvgTime)}</td>
          <td>${displayMs(recentAvgTime)}</td>
          <td>${displayErrors(lifetimeAvgErrors)}</td>
          <td>${displayErrors(recentAvgErrors)}</td>
          <td class="${trendClass}">${escapeHtml(trendText)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderKeyboardModule() {
  const keyboard = getKeyboardProgress();
  const lifetime = getKeyboardLifetimeAverages();
  const sessionAvgTime = keyboardSession.attempts
    ? keyboardSession.totalTimeMs / keyboardSession.attempts
    : 0;
  const sessionAvgErrors = keyboardSession.attempts
    ? keyboardSession.totalErrors / keyboardSession.attempts
    : 0;
  const cleanRate = keyboardSession.attempts
    ? Math.round((keyboardSession.cleanHits / keyboardSession.attempts) * 100)
    : 0;
  const lastHistory = keyboard.history[keyboard.history.length - 1];
  const statusClass =
    keyboardSession.flashTone === "correct"
      ? "flash-correct"
      : keyboardSession.flashTone === "wrong"
        ? "flash-wrong"
        : keyboardSession.active
          ? "live"
          : "idle";
  const statusLabel =
    keyboardSession.flashTone === "correct"
      ? "Correct"
      : keyboardSession.flashTone === "wrong"
        ? "Miss"
        : keyboardSession.active
          ? "Live"
          : "Paused";
  const targetClass =
    keyboardSession.flashTone === "correct"
      ? "correct"
      : keyboardSession.flashTone === "wrong"
        ? "wrong"
        : keyboardSession.active
          ? "live"
          : "idle";

  return `
    <section class="module-page">
      ${renderKeyboardSummaryStrip()}
      <section class="top-grid reveal">
        <article class="practice card">
          <div class="practice-header">
            <div>
              <p class="section-label">Current target</p>
              <h2>Find the matching key</h2>
            </div>
            <div class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</div>
          </div>
          <div class="target-display ${targetClass}">
            <span>${escapeHtml((keyboardSession.currentLetter || "ж").toUpperCase())}</span>
          </div>
          <div class="attempt-strip">
            <div class="attempt-stat">
              <span class="attempt-label">Timer</span>
              <strong id="live-timer">0 ms</strong>
            </div>
            <div class="attempt-stat">
              <span class="attempt-label">Errors this round</span>
              <strong>${keyboardSession.errorsThisAttempt}</strong>
            </div>
            <div class="attempt-stat">
              <span class="attempt-label">Streak</span>
              <strong>${keyboardSession.currentStreak}</strong>
            </div>
          </div>
          <div class="practice-feedback">
            <p class="feedback-message">${escapeHtml(keyboardSession.message)}</p>
            <p class="layout-hint ${keyboardSession.layoutHintUntil > Date.now() ? "" : "hidden"}">
              Latin letters detected. Switch your OS keyboard layout to Russian.
            </p>
          </div>
        </article>
        <article class="session card">
          <div class="session-header">
            <div>
              <p class="section-label">Session snapshot</p>
              <h2>See your rhythm</h2>
            </div>
            <div class="session-badge">${keyboardSession.currentStreak >= 10 ? "Hot streak" : keyboardSession.attempts ? "In session" : "Fresh run"}</div>
          </div>
          <div class="stats-grid">
            <div class="stat-tile accent-coral">
              <span class="tile-label">Attempts</span>
              <strong>${keyboardSession.attempts}</strong>
              <span class="tile-foot">${cleanRate}% clean hits</span>
            </div>
            <div class="stat-tile accent-mint">
              <span class="tile-label">Avg response</span>
              <strong>${keyboardSession.attempts ? formatMs(sessionAvgTime) : "0 ms"}</strong>
              <span class="tile-foot">${lastHistory ? `Last attempt: ${formatMs(lastHistory.timeMs)}` : "Session average"}</span>
            </div>
            <div class="stat-tile accent-sand">
              <span class="tile-label">Avg errors</span>
              <strong>${formatErrors(sessionAvgErrors)}</strong>
              <span class="tile-foot">Best streak: ${keyboardSession.bestStreak}</span>
            </div>
            <div class="stat-tile accent-ink">
              <span class="tile-label">Lifetime avg</span>
              <strong>${keyboard.totals.attempts ? formatMs(lifetime.avgTimeMs) : "0 ms"}</strong>
              <span class="tile-foot">${formatErrors(lifetime.avgErrors)} avg errors</span>
              <span class="tile-foot">${keyboard.totals.attempts} attempts | ${formatStudyDuration(keyboard.totals.totalTimeMs)} studied</span>
            </div>
          </div>
          <div class="focus-panel">
            <div class="panel-header">
              <div>
                <p class="section-label">Adaptive focus</p>
                <h3>Keys receiving extra practice</h3>
              </div>
              <span class="focus-caption">
                Weighted by smoothed speed, errors, freshness, and coverage.
              </span>
            </div>
            <div class="focus-letters">${renderKeyboardFocusLetters()}</div>
          </div>
        </article>
      </section>
      <section class="bottom-grid reveal">
        <article class="keyboard card">
          <div class="panel-header">
            <div>
              <p class="section-label">Keyboard heatmap</p>
              <h2>Watch weak spots cool down</h2>
            </div>
            <span class="focus-caption">Hotter keys need more work. The current target glows.</span>
          </div>
          <div class="keyboard-map">${renderKeyboardMap()}</div>
        </article>
        <article class="leaderboard card">
          <div class="panel-header">
            <div>
              <p class="section-label">Per-key progress</p>
              <h2>Lifetime averages plus recent form</h2>
            </div>
            <span class="focus-caption">Sorted by current challenge so weak keys stay visible.</span>
          </div>
          <div class="table-wrap">
            <table class="stats-table">
              <thead>
                <tr>
                  <th>Letter</th>
                  <th>Attempts</th>
                  <th>Avg ms</th>
                  <th>Recent ms</th>
                  <th>Avg errors</th>
                  <th>Recent errors</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>${renderKeyboardStatsTable()}</tbody>
            </table>
          </div>
        </article>
      </section>
    </section>
  `;
}

function renderPronounFocusRow(moduleId) {
  const session = getGrammarSession(moduleId);
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const currentAtom =
    session.currentAtomId && GRAMMAR_MODULES[moduleId].atomsById[session.currentAtomId]
      ? GRAMMAR_MODULES[moduleId].atomsById[session.currentAtomId]
      : null;

  return `
    <div class="pronoun-row">
      ${PERSONS.map((person) => {
        const classes = [
          "chip",
          moduleProgress.selectedPersonId === person.id ? "person-filter-active" : "",
          currentAtom?.personId === person.id ? "selected-target" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <button
            class="${classes}"
            data-action="grammar-person"
            data-module-id="${moduleId}"
            data-person-id="${person.id}"
            ${!appState.ready ? "disabled" : ""}
          >
            ${escapeHtml(person.pronoun)}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderSubdeckRow(moduleId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const moduleProgress = getGrammarModuleProgress(moduleId);
  return `
    <div class="subdeck-row">
      ${moduleDef.subdecks
        .map(
          (subdeck) => `
            <button
              class="chip ${moduleProgress.selectedSubdeckId === subdeck.id ? "active coral" : ""}"
              data-action="grammar-subdeck"
              data-module-id="${moduleId}"
              data-subdeck-id="${subdeck.id}"
              ${!appState.ready ? "disabled" : ""}
            >
              ${escapeHtml(subdeck.title)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderGrammarSummaryStrip(moduleId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const session = getGrammarSession(moduleId);
  const focusAtomIds = getActiveGrammarAtomIds(moduleId);
  const attempts = focusAtomIds.reduce(
    (sum, atomId) => sum + moduleProgress.atoms[atomId].attempts,
    0,
  );
  const totalTime = focusAtomIds.reduce(
    (sum, atomId) => sum + moduleProgress.atoms[atomId].totalTimeMs,
    0,
  );
  const totalErrors = focusAtomIds.reduce(
    (sum, atomId) => sum + moduleProgress.atoms[atomId].totalErrors,
    0,
  );
  const mastered = focusAtomIds.filter((atomId) => moduleProgress.atoms[atomId].mastered).length;
  const weakestPerson = PERSONS.map((person) => {
    const personAtomIds = (moduleDef.atomsBySubdeckId[moduleProgress.selectedSubdeckId] || []).filter(
      (atomId) => moduleDef.atomsById[atomId].personId === person.id,
    );
    const score = personAtomIds.length
      ? average(personAtomIds, (atomId) => buildGrammarAtomProfile(moduleId, atomId).displayScore)
      : 0;
    return { person, score };
  }).sort((left, right) => right.score - left.score)[0];

  return `
    <section class="summary-strip card reveal">
      <div class="summary-head">
        <div class="summary-copy">
          <p class="section-label">Grammar module</p>
          <h2>${escapeHtml(moduleDef.title)}</h2>
          <p class="muted-copy">${escapeHtml(moduleDef.purpose)}</p>
        </div>
        <div class="summary-actions">
          <button class="button button-primary button-big" data-action="grammar-resume" data-module-id="${moduleId}" ${!appState.ready ? "disabled" : ""}>
            Resume
          </button>
          <button class="button button-ghost" data-action="grammar-pause" data-module-id="${moduleId}" ${!appState.ready || !session.active ? "disabled" : ""}>
            Pause
          </button>
        </div>
      </div>
      ${renderSubdeckRow(moduleId)}
      ${renderPronounFocusRow(moduleId)}
      <div class="summary-metrics">
        <div class="summary-metric">
          <span class="metric-label">Mastered atoms</span>
          <strong>${mastered} / ${focusAtomIds.length || 0}</strong>
          <span class="metric-detail">Tracked per atom and per stage.</span>
        </div>
        <div class="summary-metric">
          <span class="metric-label">Lifetime avg</span>
          <strong>${attempts ? formatMs(totalTime / attempts) : "0 ms"}</strong>
          <span class="metric-detail">${attempts ? formatErrors(totalErrors / attempts) : "0.00"} avg errors</span>
        </div>
        <div class="summary-metric">
          <span class="metric-label">Current streak</span>
          <strong>${session.currentStreak}</strong>
          <span class="metric-detail">Best session streak: ${session.bestStreak}</span>
        </div>
        <div class="summary-metric">
          <span class="metric-label">Weakest person</span>
          <strong>${escapeHtml(weakestPerson?.person.pronoun || "—")}</strong>
          <span class="metric-detail">Based on current subdeck weakness.</span>
        </div>
      </div>
    </section>
  `;
}

function shouldShowIrregularBanner(atom, atomProgress, stageId) {
  if (!atom.showIrregularYaBanner) {
    return false;
  }

  if (stageId === "preview") {
    return true;
  }

  if (stageId === "sentenceGuided") {
    return atomProgress.stageStats.sentenceGuided.attempts < 2;
  }

  return false;
}

function renderParadigmGrid(moduleId, atom, canInteract) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  return `
    <div class="paradigm-grid">
      ${moduleDef.atomsByVerbId[atom.verbId]
        .map((atomId) => moduleDef.atomsById[atomId])
        .map((candidate) => {
          const isTarget = candidate.personId === atom.personId;
          const tag = isTarget && canInteract ? "button" : "div";
          const attrs =
            isTarget && canInteract
              ? `type="button" class="paradigm-cell target" data-action="grammar-preview" data-module-id="${moduleId}"`
              : `class="paradigm-cell ${isTarget ? "target" : ""}"`;
          return `
            <${tag} ${attrs}>
              <span class="paradigm-pronoun">${escapeHtml(candidate.pronoun)}</span>
              <span class="paradigm-answer">${escapeHtml(candidate.answer)}</span>
            </${tag}>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderChoiceOptions(moduleId, prompt, canInteract) {
  const optionClass = prompt.stageId === "fullChoice" ? "answer-options full" : "answer-options";
  return `
    <div class="${optionClass}">
      ${prompt.options
        .map(
          (option) => `
            <button
              type="button"
              class="choice-button"
              data-action="grammar-choice"
              data-module-id="${moduleId}"
              data-answer="${escapeHtml(option.answer)}"
              ${!canInteract ? "disabled" : ""}
            >
              <span class="choice-caption">${escapeHtml(option.pronoun)}</span>
              ${escapeHtml(option.answer)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTypeFragmentForm(moduleId, atom, session, canInteract) {
  return `
    <form class="answer-form" data-action="grammar-submit" data-module-id="${moduleId}">
      <div class="fragment-row">
        <span class="fragment-base">${escapeHtml(atom.fragmentBase)}</span>
        <input
          class="answer-input"
          data-role="grammar-answer-input"
          data-module-id="${moduleId}"
          value="${escapeHtml(session.inputValue)}"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          ${!canInteract ? "disabled" : ""}
        />
      </div>
      <div class="summary-actions">
        <button class="button button-secondary" type="submit" ${!canInteract ? "disabled" : ""}>
          Check
        </button>
      </div>
    </form>
  `;
}

function renderSentenceGuidedForm(moduleId, atom, frame, session, canInteract) {
  return `
    <form class="answer-form" data-action="grammar-submit" data-module-id="${moduleId}">
      <div class="sentence-frame">
        ${renderChip(atom.pronoun, "mint")}
        ${frame.beforeVerbRu ? `<span class="sentence-text">${escapeHtml(frame.beforeVerbRu)}</span>` : ""}
        <span class="guided-slot">
          <span class="fragment-base">${escapeHtml(atom.fragmentBase)}</span>
          <input
            class="inline-answer-input"
            data-role="grammar-answer-input"
            data-module-id="${moduleId}"
            value="${escapeHtml(session.inputValue)}"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            ${!canInteract ? "disabled" : ""}
          />
        </span>
        ${frame.afterVerbRu ? `<span class="sentence-text">${escapeHtml(frame.afterVerbRu)}</span>` : ""}
      </div>
      <div class="summary-actions">
        <button class="button button-secondary" type="submit" ${!canInteract ? "disabled" : ""}>
          Check
        </button>
      </div>
    </form>
  `;
}

function renderSentenceFreeForm(moduleId, atom, frame, session, canInteract) {
  return `
    <form class="answer-form" data-action="grammar-submit" data-module-id="${moduleId}">
      <div class="sentence-frame">
        ${renderChip(atom.pronoun, "mint")}
        ${frame.beforeVerbRu ? `<span class="sentence-text">${escapeHtml(frame.beforeVerbRu)}</span>` : ""}
        <span class="blank-slot">verb</span>
        ${frame.afterVerbRu ? `<span class="sentence-text">${escapeHtml(frame.afterVerbRu)}</span>` : ""}
      </div>
      <input
        class="answer-input"
        data-role="grammar-answer-input"
        data-module-id="${moduleId}"
        value="${escapeHtml(session.inputValue)}"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        ${!canInteract ? "disabled" : ""}
      />
      <div class="summary-actions">
        <button class="button button-secondary" type="submit" ${!canInteract ? "disabled" : ""}>
          Check
        </button>
      </div>
    </form>
  `;
}

function renderTypeFullForm(moduleId, session, canInteract) {
  return `
    <form class="answer-form" data-action="grammar-submit" data-module-id="${moduleId}">
      <input
        class="answer-input"
        data-role="grammar-answer-input"
        data-module-id="${moduleId}"
        value="${escapeHtml(session.inputValue)}"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        ${!canInteract ? "disabled" : ""}
      />
      <div class="summary-actions">
        <button class="button button-secondary" type="submit" ${!canInteract ? "disabled" : ""}>
          Check
        </button>
      </div>
    </form>
  `;
}

function renderGrammarPromptBody(moduleId, atom, prompt, canInteract) {
  const session = getGrammarSession(moduleId);
  const atomProgress = getGrammarModuleProgress(moduleId).atoms[atom.id];
  const stageId = prompt.stageId;
  const frame = atom.contextFrames[prompt.contextFrameIndex] || atom.contextFrames[0] || {
    beforeVerbRu: "",
    afterVerbRu: "",
  };
  const helperBanner = shouldShowIrregularBanner(atom, atomProgress, stageId)
    ? `<div class="helper-banner">${escapeHtml(atom.irregularYaBannerText)}</div>`
    : "";
  const coachNote = atom.coachNote
    ? `<p class="coach-note">${escapeHtml(atom.coachNote)}</p>`
    : "";

  let body = "";
  let promptCopy = "";

  if (stageId === "preview") {
    promptCopy = "Preview the full six-cell paradigm, then tap the highlighted target to continue.";
    body = `
      <div class="split-display">
        <span>${escapeHtml(atom.previewSplit.stable)}</span><span class="mutable">${escapeHtml(atom.previewSplit.mutable)}</span>
      </div>
      ${renderParadigmGrid(moduleId, atom, canInteract)}
    `;
  } else if (stageId === "choose2") {
    promptCopy = "Choose between two forms from the same verb only.";
    body = renderChoiceOptions(moduleId, prompt, canInteract);
  } else if (stageId === "choose4") {
    promptCopy = "Find the correct form among four forms of the same verb.";
    body = renderChoiceOptions(moduleId, prompt, canInteract);
  } else if (stageId === "fullChoice") {
    promptCopy = "Choose the exact form from the full six-form paradigm.";
    body = renderChoiceOptions(moduleId, prompt, canInteract);
  } else if (stageId === "typeFragment") {
    promptCopy = "Type only the remaining tail fragment after the provided base.";
    body = renderTypeFragmentForm(moduleId, atom, session, canInteract);
  } else if (stageId === "typeFull") {
    promptCopy = "Type the full Russian form exactly.";
    body = renderTypeFullForm(moduleId, session, canInteract);
  } else if (stageId === "sentenceGuided") {
    promptCopy = "Fill the guided verb slot. The mutable part stays visually obvious.";
    body = renderSentenceGuidedForm(moduleId, atom, frame, session, canInteract);
  } else {
    promptCopy = "Type the full verb from memory inside this frame.";
    body = renderSentenceFreeForm(moduleId, atom, frame, session, canInteract);
  }

  return `
    <div class="lemma-block">
      <div class="lemma-title">
        <strong>${escapeHtml(atom.lemma)}</strong>
        <span class="translation">${escapeHtml(atom.translation)}</span>
      </div>
      <div class="module-meta">
        ${renderChip(GRAMMAR_MODULES[moduleId].title, "sand")}
        ${renderChip(GRAMMAR_MODULES[moduleId].subdeckMap[atom.subdeckId].title)}
        ${renderChip(atom.pronoun, "target")}
      </div>
    </div>
    ${helperBanner}
    ${coachNote}
    <p class="prompt-copy">${escapeHtml(promptCopy)}</p>
    ${body}
  `;
}

function renderGrammarPracticeCard(moduleId) {
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const session = getGrammarSession(moduleId);
  const atomId = getRenderAtomId(moduleId);
  const atom = atomId ? GRAMMAR_MODULES[moduleId].atomsById[atomId] : null;
  const prompt =
    atom && session.currentPrompt && session.currentPrompt.atomId === atom.id
      ? session.currentPrompt
      : atom
        ? buildStaticGrammarPrompt(moduleId, atom.id)
        : null;
  const statusClass =
    session.flashTone === "correct"
      ? "flash-correct"
      : session.flashTone === "wrong"
        ? "flash-wrong"
        : session.active
          ? "live"
          : "idle";
  const statusLabel =
    session.flashTone === "correct"
      ? "Correct"
      : session.flashTone === "wrong"
        ? "Wrong"
        : session.active
          ? "Live"
          : "Paused";
  const canInteract = appState.ready && session.active && !session.transitioning;
  const stageId = prompt?.stageId || (atom ? moduleProgress.atoms[atom.id].currentStageId : null);

  return `
    <article class="practice-card card ${session.flashTone === "correct" ? "success-flash" : session.flashTone === "wrong" ? "wrong-flash" : ""}">
      <div class="practice-header">
        <div>
          <p class="section-label">Current rep</p>
          <h2>${escapeHtml(GRAMMAR_MODULES[moduleId].title)}</h2>
        </div>
        <div class="status-pill ${statusClass}">${escapeHtml(statusLabel)}</div>
      </div>
      <div class="module-meta">
        ${renderChip(GRAMMAR_MODULES[moduleId].subdeckMap[moduleProgress.selectedSubdeckId].title)}
        ${stageId ? renderChip(STAGE_LABELS[stageId], "coral") : renderChip("Ready")}
      </div>
      <div class="display-panel">
        ${
          atom && prompt
            ? renderGrammarPromptBody(moduleId, atom, prompt, canInteract)
            : `
              <div class="lemma-block">
                <div class="lemma-title">
                  <strong>${escapeHtml(GRAMMAR_MODULES[moduleId].title)}</strong>
                </div>
              </div>
              <p class="prompt-copy">Press Resume to start the adaptive flow for the selected subdeck.</p>
            `
        }
      </div>
      <div class="attempt-strip">
        <div class="attempt-stat">
          <span class="attempt-label">Timer</span>
          <strong id="live-timer">0 ms</strong>
        </div>
        <div class="attempt-stat">
          <span class="attempt-label">Error strikes</span>
          <strong>${session.errorsThisAttempt}</strong>
        </div>
        <div class="attempt-stat">
          <span class="attempt-label">Streak</span>
          <strong>${session.currentStreak}</strong>
        </div>
      </div>
      <div class="practice-feedback">
        <p class="feedback-message">${escapeHtml(session.message)}</p>
      </div>
    </article>
  `;
}

function renderAtomDetail(moduleId, atomId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const atom = moduleDef.atomsById[atomId];
  const atomProgress = getGrammarModuleProgress(moduleId).atoms[atomId];
  const lifetimeAvgTime = atomProgress.attempts
    ? atomProgress.totalTimeMs / atomProgress.attempts
    : null;
  const lifetimeAvgErrors = atomProgress.attempts
    ? atomProgress.totalErrors / atomProgress.attempts
    : null;
  const recentAvgTime = atomProgress.recent.length
    ? average(atomProgress.recent, (item) => item.timeMs)
    : null;
  const recentAvgErrors = atomProgress.recent.length
    ? average(atomProgress.recent, (item) => item.errors)
    : null;

  return `
    <div class="detail-card">
      <div class="list-row">
        <div class="list-label">
          <strong>${escapeHtml(atom.lemma)}</strong>
          <span class="list-meta">${escapeHtml(atom.pronoun)} · ${escapeHtml(atom.answer)}</span>
        </div>
        <span class="chip ${atomProgress.mastered ? "mint" : "coral"}">
          ${atomProgress.mastered ? "Mastered" : STAGE_LABELS[atomProgress.currentStageId]}
        </span>
      </div>
      <div class="detail-grid">
        <div class="stack-card">
          <div class="detail-line"><span>Attempts</span><strong>${atomProgress.attempts}</strong></div>
          <div class="detail-line"><span>Average ms</span><strong>${displayMs(lifetimeAvgTime)}</strong></div>
          <div class="detail-line"><span>Recent ms</span><strong>${displayMs(recentAvgTime)}</strong></div>
        </div>
        <div class="stack-card">
          <div class="detail-line"><span>Avg errors</span><strong>${displayErrors(lifetimeAvgErrors)}</strong></div>
          <div class="detail-line"><span>Recent errors</span><strong>${displayErrors(recentAvgErrors)}</strong></div>
          <div class="detail-line"><span>Current stage</span><strong>${escapeHtml(STAGE_LABELS[atomProgress.currentStageId])}</strong></div>
        </div>
      </div>
    </div>
  `;
}

function renderWeakestVerbRows(moduleId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const verbIds = moduleDef.subdeckMap[moduleProgress.selectedSubdeckId].verbs.map((verb) => verb.id);

  return verbIds
    .map((verbId) => {
      const atomIds = moduleDef.atomsByVerbId[verbId] || [];
      const score = average(atomIds, (atomId) => buildGrammarAtomProfile(moduleId, atomId).displayScore);
      const worstAtomId = atomIds
        .map((atomId) => ({
          atomId,
          score: buildGrammarAtomProfile(moduleId, atomId).displayScore,
        }))
        .sort((left, right) => right.score - left.score)[0]?.atomId;
      const worstAtom = worstAtomId ? moduleDef.atomsById[worstAtomId] : null;
      return {
        verb: moduleDef.verbsById[verbId],
        score,
        worstAtom,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(
      ({ verb, score, worstAtom }) => `
        <div class="list-row">
          <div class="list-label">
            <strong>${escapeHtml(verb.lemma)}</strong>
            <span class="list-meta">${escapeHtml(verb.translation)}</span>
          </div>
          <span class="list-value">${escapeHtml(worstAtom?.pronoun || "—")} · ${score.toFixed(2)}</span>
        </div>
      `,
    )
    .join("");
}

function renderWeakestPersonRows(moduleId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const atomIds = moduleDef.atomsBySubdeckId[moduleProgress.selectedSubdeckId] || [];

  return PERSONS.map((person) => {
    const personAtoms = atomIds.filter((atomId) => moduleDef.atomsById[atomId].personId === person.id);
    const score = personAtoms.length
      ? average(personAtoms, (atomId) => buildGrammarAtomProfile(moduleId, atomId).displayScore)
      : 0;
    return { person, score };
  })
    .sort((left, right) => right.score - left.score)
    .map(
      ({ person, score }) => `
        <div class="list-row">
          <div class="list-label">
            <strong>${escapeHtml(person.pronoun)}</strong>
            <span class="list-meta">${escapeHtml(person.label)}</span>
          </div>
          <span class="list-value">${score.toFixed(2)}</span>
        </div>
      `,
    )
    .join("");
}

function renderWatchlistSections(moduleId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  return moduleDef.watchlists.sections
    .map((section) => {
      const rows = section.verbIds
        .map((verbId) => {
          const verb = moduleDef.verbsById[verbId];
          if (!verb) {
            return null;
          }
          const worstAtomId = (moduleDef.atomsByVerbId[verbId] || [])
            .map((atomId) => ({
              atomId,
              score: buildGrammarAtomProfile(moduleId, atomId).displayScore,
            }))
            .sort((left, right) => right.score - left.score)[0]?.atomId;
          const worstAtom = worstAtomId ? moduleDef.atomsById[worstAtomId] : null;
          const atomProgress = worstAtomId ? getGrammarModuleProgress(moduleId).atoms[worstAtomId] : null;
          return `
            <div class="watchlist-row">
              <div class="list-label">
                <strong>${escapeHtml(verb.lemma)}</strong>
                <span class="list-meta">${escapeHtml(worstAtom?.pronoun || "—")} · ${escapeHtml(
                  atomProgress ? STAGE_LABELS[atomProgress.currentStageId] : "Ready",
                )}</span>
              </div>
              <span class="list-value">${atomProgress?.mastered ? "cool" : "watch"}</span>
            </div>
          `;
        })
        .filter(Boolean)
        .join("");

      return `
        <div class="detail-card">
          <div class="list-row">
            <div class="list-label">
              <strong>${escapeHtml(section.title)}</strong>
            </div>
          </div>
          ${rows}
        </div>
      `;
    })
    .join("");
}

function renderGrammarAnalyticsCard(moduleId) {
  const atomId = getRenderAtomId(moduleId);

  return `
    <article class="analytics-card card">
      <div class="analytics-header">
        <div>
          <p class="section-label">Analytics</p>
          <h2>Local weakness stays visible</h2>
        </div>
      </div>
      <div class="analytics-stack">
        ${atomId ? renderAtomDetail(moduleId, atomId) : ""}
        <div class="detail-card">
          <div class="list-row">
            <div class="list-label">
              <strong>Weakest verbs</strong>
              <span class="list-meta">Current subdeck only.</span>
            </div>
          </div>
          ${renderWeakestVerbRows(moduleId)}
        </div>
        <div class="detail-card">
          <div class="list-row">
            <div class="list-label">
              <strong>Weakest persons</strong>
              <span class="list-meta">Rows stay in fixed pronoun order on the heatmap.</span>
            </div>
          </div>
          ${renderWeakestPersonRows(moduleId)}
        </div>
        ${renderWatchlistSections(moduleId)}
      </div>
    </article>
  `;
}

function renderHeatmapTable(moduleId) {
  const moduleDef = GRAMMAR_MODULES[moduleId];
  const moduleProgress = getGrammarModuleProgress(moduleId);
  const session = getGrammarSession(moduleId);
  const selectedAtomId = getRenderAtomId(moduleId);
  const verbIds = moduleDef.subdeckMap[moduleProgress.selectedSubdeckId].verbs.map((verb) => verb.id);

  return `
    <div class="heatmap-wrap">
      <table class="heatmap-table">
        <thead>
          <tr>
            <th>Verb</th>
            ${PERSONS.map((person) => `<th>${escapeHtml(person.pronoun)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${verbIds
            .map((verbId) => {
              const verb = moduleDef.verbsById[verbId];
              return `
                <tr>
                  <td class="heatmap-verb">
                    <div class="heatmap-lemma">${escapeHtml(verb.lemma)}</div>
                    <div class="heatmap-translation">${escapeHtml(verb.translation)}</div>
                  </td>
                  ${PERSONS.map((person) => {
                    const atomId = moduleDef.atomsByVerbId[verbId].find(
                      (candidateAtomId) =>
                        moduleDef.atomsById[candidateAtomId].personId === person.id,
                    );
                    const atom = moduleDef.atomsById[atomId];
                    const profile = buildGrammarAtomProfile(moduleId, atomId);
                    const atomProgress = moduleProgress.atoms[atomId];
                    const classes = [
                      "heatmap-cell",
                      selectedAtomId === atomId ? "selected" : "",
                      session.currentAtomId === atomId ? "current" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return `
                      <td>
                        <button
                          type="button"
                          class="${classes}"
                          data-action="select-grammar-atom"
                          data-module-id="${moduleId}"
                          data-atom-id="${atomId}"
                          title="${escapeHtml(buildAtomTitle(moduleId, atomId))}"
                          style="background: ${colorForGrammarProfile(profile)};"
                        >
                          <span class="heatmap-answer">${escapeHtml(atom.answer)}</span>
                          <span class="heatmap-meta">${escapeHtml(STAGE_SHORT_LABELS[atomProgress.currentStageId])}${atomProgress.mastered ? " · M" : ""}</span>
                        </button>
                      </td>
                    `;
                  }).join("")}
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderWeakestAtoms(moduleId) {
  const atomIds = getActiveGrammarAtomIds(moduleId);
  const moduleDef = GRAMMAR_MODULES[moduleId];

  return atomIds
    .map((atomId) => {
      const atom = moduleDef.atomsById[atomId];
      const atomProgress = getGrammarModuleProgress(moduleId).atoms[atomId];
      const profile = buildGrammarAtomProfile(moduleId, atomId);
      const avgTime = atomProgress.attempts ? atomProgress.totalTimeMs / atomProgress.attempts : null;
      return {
        atomId,
        atom,
        atomProgress,
        profile,
        avgTime,
      };
    })
    .sort((left, right) => right.profile.displayScore - left.profile.displayScore)
    .slice(0, 8)
    .map(
      ({ atomId, atom, atomProgress, avgTime }) => `
        <div class="list-row">
          <div class="list-label">
            <button
              type="button"
              class="tab-button"
              data-action="select-grammar-atom"
              data-module-id="${moduleId}"
              data-atom-id="${atomId}"
            >
              ${escapeHtml(atom.lemma)} · ${escapeHtml(atom.pronoun)}
            </button>
            <span class="list-meta">${escapeHtml(atom.answer)} · ${escapeHtml(
              STAGE_LABELS[atomProgress.currentStageId],
            )}</span>
          </div>
          <span class="list-value">${displayMs(avgTime)}</span>
        </div>
      `,
    )
    .join("");
}

function renderGrammarBottom(moduleId) {
  return `
    <section class="conjugation-bottom reveal">
      <article class="list-card card">
        <div class="panel-header">
          <div>
            <p class="section-label">Verb x person heatmap</p>
            <h2>Every cell is one exact atom</h2>
          </div>
          <span class="focus-caption">Hotter cells are slower, noisier, or less stable.</span>
        </div>
        ${renderHeatmapTable(moduleId)}
      </article>
      <article class="list-card card">
        <div class="panel-header">
          <div>
            <p class="section-label">Weakest atoms</p>
            <h2>Exact forms still needing reps</h2>
          </div>
        </div>
        <div class="detail-card">${renderWeakestAtoms(moduleId)}</div>
      </article>
    </section>
  `;
}

function renderGrammarModule(moduleId) {
  return `
    <section class="module-page">
      ${renderGrammarSummaryStrip(moduleId)}
      <section class="module-grid conjugation-grid reveal">
        ${renderGrammarPracticeCard(moduleId)}
        ${renderGrammarAnalyticsCard(moduleId)}
      </section>
      ${renderGrammarBottom(moduleId)}
    </section>
  `;
}

function renderActiveModule() {
  if (appState.activeTab === "keyboard") {
    return renderKeyboardModule();
  }

  if (GRAMMAR_MODULES[appState.activeTab]) {
    return renderGrammarModule(appState.activeTab);
  }

  return "";
}

function render() {
  elements.appRoot.innerHTML = `${renderHero()}${renderActiveModule()}`;
  startTimerLoop();
  focusActiveAnswerInput();
}

function handleClick(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!target || !elements.appRoot.contains(target)) {
    return;
  }

  const action = target.getAttribute("data-action");
  if (!action) {
    return;
  }

  event.preventDefault();

  if (action === "switch-tab") {
    switchTab(target.getAttribute("data-tab-id"));
    return;
  }

  if (action === "export") {
    exportData();
    return;
  }

  if (action === "import") {
    elements.importInput.click();
    return;
  }

  if (action === "reset") {
    void resetData();
    return;
  }

  if (action === "keyboard-resume") {
    startKeyboardSession();
    return;
  }

  if (action === "keyboard-pause") {
    pauseKeyboardSession();
    return;
  }

  if (action === "grammar-resume") {
    startGrammarSession(target.getAttribute("data-module-id"));
    return;
  }

  if (action === "grammar-pause") {
    pauseGrammarSession(target.getAttribute("data-module-id"));
    return;
  }

  if (action === "grammar-subdeck") {
    selectGrammarSubdeck(
      target.getAttribute("data-module-id"),
      target.getAttribute("data-subdeck-id"),
    );
    return;
  }

  if (action === "grammar-person") {
    toggleGrammarPersonFocus(
      target.getAttribute("data-module-id"),
      target.getAttribute("data-person-id"),
    );
    return;
  }

  if (action === "grammar-choice") {
    handleGrammarChoice(
      target.getAttribute("data-module-id"),
      target.getAttribute("data-answer"),
    );
    return;
  }

  if (action === "grammar-preview") {
    completeGrammarAttempt(target.getAttribute("data-module-id"));
    return;
  }

  if (action === "select-grammar-atom") {
    selectGrammarAtom(
      target.getAttribute("data-module-id"),
      target.getAttribute("data-atom-id"),
    );
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !elements.appRoot.contains(form)) {
    return;
  }

  if (form.getAttribute("data-action") !== "grammar-submit") {
    return;
  }

  event.preventDefault();
  handleGrammarSubmit(form.getAttribute("data-module-id"));
}

function handleInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !elements.appRoot.contains(input)) {
    return;
  }

  if (input.getAttribute("data-role") !== "grammar-answer-input") {
    return;
  }

  const moduleId = input.getAttribute("data-module-id");
  if (!GRAMMAR_MODULES[moduleId]) {
    return;
  }

  getGrammarSession(moduleId).inputValue = input.value;
}

function handleKeydown(event) {
  if (event.repeat) {
    return;
  }

  if (event.key === "Escape") {
    if (appState.activeTab === "keyboard") {
      pauseKeyboardSession();
    } else if (GRAMMAR_MODULES[appState.activeTab]) {
      pauseGrammarSession(appState.activeTab);
    }
    return;
  }

  if (!appState.ready || appState.activeTab !== "keyboard") {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }

  if (!keyboardSession.active) {
    if (event.key === "Enter") {
      event.preventDefault();
      startKeyboardSession();
    }
    return;
  }

  if (keyboardSession.transitioning || event.key.length !== 1) {
    return;
  }

  event.preventDefault();
  const key = event.key.toLowerCase();
  if (key === keyboardSession.currentLetter) {
    completeCurrentLetter();
    return;
  }

  handleWrongKey(key);
}

function attachEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("input", handleInput);
  document.addEventListener("keydown", handleKeydown);
  elements.importInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      importData(file);
    }
    event.target.value = "";
  });
}

attachEvents();
render();

async function initialize() {
  try {
    await loadServerData();
    pauseAllPractice("Press Resume to continue.");
  } catch (error) {
    console.error(error);
    appState.loadError = "Could not load saved progress from the server.";
    pauseAllPractice("Server load failed. The app stayed read-only.");
  }

  render();
}

void initialize();
