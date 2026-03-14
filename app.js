const STORAGE_KEY = "russian-key-coach/v1";
const RECENT_PER_LETTER = 20;
const HISTORY_LIMIT = 500;
const PRIOR_ATTEMPTS = 5;
const PRIOR_TIME_MS = 1600;
const PRIOR_ERRORS = 0.8;
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
  "Smooth key find.",
];
const RECOVER_LINES = [
  "Corrected.",
  "Found it.",
  "Recovered well.",
  "Tracked it down.",
];

const elements = {
  startButton: document.getElementById("start-button"),
  pauseButton: document.getElementById("pause-button"),
  exportButton: document.getElementById("export-button"),
  importButton: document.getElementById("import-button"),
  importInput: document.getElementById("import-input"),
  resetButton: document.getElementById("reset-button"),
  coverageCount: document.getElementById("coverage-count"),
  coverageDetail: document.getElementById("coverage-detail"),
  recentTrend: document.getElementById("recent-trend"),
  recentTrendDetail: document.getElementById("recent-trend-detail"),
  statusPill: document.getElementById("status-pill"),
  targetDisplay: document.getElementById("target-display"),
  targetLetter: document.getElementById("target-letter"),
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
  focusLetters: document.getElementById("focus-letters"),
  keyboardMap: document.getElementById("keyboard-map"),
  statsTableBody: document.getElementById("stats-table-body"),
};

let data = loadData();
let session = createSession();
let timerFrame = 0;

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

function createDefaultData() {
  const letters = {};
  LETTERS.forEach((letter) => {
    letters[letter] = createLetterStats();
  });

  return {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
    .slice(-RECENT_PER_LETTER);
}

function sanitizeHistory(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      letter: LETTERS.includes(item.letter) ? item.letter : null,
      timeMs: ensureNumber(item.timeMs, 0),
      errors: ensureNumber(item.errors, 0),
      at: ensureNumber(item.at, Date.now()),
    }))
    .filter((item) => item.letter)
    .slice(-HISTORY_LIMIT);
}

function sanitizeData(parsed) {
  const base = createDefaultData();
  if (!parsed || typeof parsed !== "object") {
    return base;
  }

  base.createdAt = ensureNumber(parsed.createdAt, base.createdAt);
  base.updatedAt = ensureNumber(parsed.updatedAt, base.updatedAt);
  base.totals.attempts = ensureNumber(parsed.totals?.attempts, 0);
  base.totals.totalTimeMs = ensureNumber(parsed.totals?.totalTimeMs, 0);
  base.totals.totalErrors = ensureNumber(parsed.totals?.totalErrors, 0);
  base.totals.bestStreak = ensureNumber(parsed.totals?.bestStreak, 0);
  base.history = sanitizeHistory(parsed.history);

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
      recent: sanitizeRecent(source.recent),
    };
  });

  return base;
}

function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function loadData() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultData();
    }

    return sanitizeData(JSON.parse(raw));
  } catch (error) {
    console.warn("Falling back to empty progress store.", error);
    return createDefaultData();
  }
}

function saveData() {
  data.updatedAt = Date.now();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function createSession() {
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
    message: "Press Start, then type the letter shown.",
  };
}

function getLifetimeAverages() {
  if (!data.totals.attempts) {
    return {
      avgTimeMs: 0,
      avgErrors: 0,
    };
  }

  return {
    avgTimeMs: data.totals.totalTimeMs / data.totals.attempts,
    avgErrors: data.totals.totalErrors / data.totals.attempts,
  };
}

function getBaseline() {
  const lifetime = getLifetimeAverages();
  return {
    avgTimeMs: clamp(lifetime.avgTimeMs || PRIOR_TIME_MS, 700, 2800),
    avgErrors: clamp(lifetime.avgErrors || PRIOR_ERRORS, 0.25, 2.8),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function average(items, selector) {
  if (!items.length) {
    return 0;
  }

  const total = items.reduce((sum, item) => sum + selector(item), 0);
  return total / items.length;
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

function buildLetterProfile(letter) {
  const stats = data.letters[letter];
  const baseline = getBaseline();
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
  if (session.currentLetter === letter) {
    weight *= 0.46;
  }
  if (session.previousLetters.includes(letter)) {
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

function startSession({ fresh = false } = {}) {
  if (fresh) {
    session = createSession();
  }

  session.active = true;
  session.transitioning = false;
  session.errorsThisAttempt = 0;
  session.layoutHintUntil = 0;
  session.message = "Find the highlighted letter on your Russian keyboard.";

  if (!session.currentLetter) {
    session.currentLetter = pickWeightedLetter();
  }

  session.promptStartedAt = performance.now();
  updateStatusPill("Live", "live");
  elements.targetDisplay.classList.remove("idle", "correct", "wrong");
  elements.targetDisplay.classList.add("live");
  render();
  startTimerLoop();
}

function pauseSession(message = "Paused. Resume when ready.") {
  session.active = false;
  session.transitioning = false;
  session.promptStartedAt = 0;
  session.errorsThisAttempt = 0;
  session.message = message;
  cancelAnimationFrame(timerFrame);
  updateStatusPill("Paused", "idle");
  elements.targetDisplay.classList.remove("live", "correct", "wrong");
  elements.targetDisplay.classList.add("idle");
  render();
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

function startTimerLoop() {
  cancelAnimationFrame(timerFrame);

  const tick = () => {
    if (!session.active || !session.promptStartedAt) {
      return;
    }

    const elapsed = performance.now() - session.promptStartedAt;
    elements.liveTimer.textContent = formatMs(elapsed);
    timerFrame = requestAnimationFrame(tick);
  };

  timerFrame = requestAnimationFrame(tick);
}

function registerAttempt(letter, timeMs, errors) {
  const stats = data.letters[letter];
  const now = Date.now();
  stats.attempts += 1;
  stats.totalTimeMs += timeMs;
  stats.totalErrors += errors;
  stats.lastSeenAt = now;
  stats.bestTimeMs =
    stats.bestTimeMs === null ? timeMs : Math.min(stats.bestTimeMs, timeMs);
  stats.recent.push({ timeMs, errors, at: now });
  stats.recent = stats.recent.slice(-RECENT_PER_LETTER);

  data.totals.attempts += 1;
  data.totals.totalTimeMs += timeMs;
  data.totals.totalErrors += errors;
  data.totals.bestStreak = Math.max(data.totals.bestStreak, session.currentStreak);
  data.history.push({ letter, timeMs, errors, at: now });
  data.history = data.history.slice(-HISTORY_LIMIT);
  saveData();
}

function advancePrompt() {
  session.previousLetters = [session.currentLetter, ...session.previousLetters].slice(
    0,
    3,
  );
  session.currentLetter = pickWeightedLetter();
  session.transitioning = false;
  session.promptStartedAt = performance.now();
  session.errorsThisAttempt = 0;
  session.layoutHintUntil = 0;
  session.message = "Find the highlighted letter on your Russian keyboard.";
  elements.targetDisplay.classList.remove("correct", "wrong", "idle");
  elements.targetDisplay.classList.add("live");
  render();
  startTimerLoop();
}

function completeCurrentLetter() {
  if (!session.active || !session.promptStartedAt) {
    return;
  }

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

  registerAttempt(session.currentLetter, timeMs, errors);
  session.transitioning = true;
  session.promptStartedAt = 0;
  cancelAnimationFrame(timerFrame);

  elements.targetDisplay.classList.remove("wrong");
  elements.targetDisplay.classList.add("correct");
  flashStatus(errors === 0 ? "Clean" : "Correct", "flash-correct");

  const linePool = errors === 0 ? SUCCESS_LINES : RECOVER_LINES;
  const line = linePool[Math.floor(Math.random() * linePool.length)];
  const detail =
    errors === 0
      ? `${line} ${formatMs(timeMs)}.`
      : `${line} ${formatMs(timeMs)} with ${errors} miss${errors === 1 ? "" : "es"}.`;
  setFeedback(detail);

  render();

  window.setTimeout(() => {
    if (!session.active) {
      return;
    }
    advancePrompt();
  }, 280);
}

function handleWrongKey(rawKey) {
  if (!session.active || session.transitioning) {
    return;
  }

  session.errorsThisAttempt += 1;
  session.currentStreak = 0;
  elements.targetDisplay.classList.remove("correct");
  elements.targetDisplay.classList.add("wrong");
  flashStatus("Miss", "flash-wrong");
  setFeedback(
    `Not ${session.currentLetter}. Misses this round: ${session.errorsThisAttempt}.`,
  );

  if (/^[a-z]$/i.test(rawKey)) {
    session.layoutHintUntil = Date.now() + 2500;
  }

  render();
}

function handleKeydown(event) {
  if (event.repeat) {
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

  if (session.transitioning) {
    return;
  }

  if (event.key.length !== 1) {
    return;
  }

  event.preventDefault();
  const key = event.key.toLowerCase();

  if (key === session.currentLetter) {
    completeCurrentLetter();
    return;
  }

  handleWrongKey(key);
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `russian-key-coach-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setFeedback("Progress exported.");
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      data = sanitizeData(JSON.parse(String(reader.result)));
      saveData();
      pauseSession("Imported progress. Start when ready.");
      setFeedback("Progress imported.");
      render();
    } catch (error) {
      console.error(error);
      setFeedback("Import failed. Pick a valid export file.");
    }
  };
  reader.readAsText(file);
}

function resetData() {
  const confirmed = window.confirm(
    "Reset all saved progress for Russian Key Coach?",
  );
  if (!confirmed) {
    return;
  }

  data = createDefaultData();
  saveData();
  session = createSession();
  pauseSession("Progress reset. Start a new run.");
  render();
}

function computeCoverage() {
  const practiced = LETTERS.filter((letter) => data.letters[letter].attempts > 0).length;
  const solid = LETTERS.filter((letter) => data.letters[letter].attempts >= 5).length;
  return { practiced, solid };
}

function computeTrendSummary() {
  const recent = data.history.slice(-20);
  const previous = data.history.slice(-40, -20);

  if (recent.length < 8 || previous.length < 8) {
    return {
      title: "Waiting for a stronger sample",
      detail: "Keep going. Trend cards become useful after about 16 attempts.",
    };
  }

  const recentAvg = average(recent, (item) => item.timeMs);
  const previousAvg = average(previous, (item) => item.timeMs);
  const diff = Math.round(recentAvg - previousAvg);
  const recentErrors = average(recent, (item) => item.errors);
  const previousErrors = average(previous, (item) => item.errors);
  const errorDiff = recentErrors - previousErrors;

  if (diff < -40 || errorDiff < -0.08) {
    const title =
      diff < -40 ? `${Math.abs(diff)} ms faster lately` : "Cleaner lately";
    return {
      title,
      detail: `${Math.abs(errorDiff).toFixed(2)} fewer errors than the 20 attempts before.`,
    };
  }

  if (diff > 40 || errorDiff > 0.08) {
    const title = diff > 40 ? `${diff} ms slower lately` : "More misses lately";
    return {
      title,
      detail: `${errorDiff.toFixed(2)} more errors than the 20 attempts before. That is usually temporary.`,
    };
  }

  return {
    title: "Holding steady",
    detail: "Speed and error rate are close to your previous 20 attempts.",
  };
}

function buildFocusLetters() {
  return LETTERS.map(buildLetterProfile)
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 6);
}

function renderFocusLetters() {
  const profiles = buildFocusLetters();
  elements.focusLetters.innerHTML = "";

  profiles.forEach((profile) => {
    const chip = document.createElement("div");
    chip.className = "focus-chip";
    const detail = profile.attempts
      ? `${formatMs(profile.stats.totalTimeMs / profile.attempts)} avg, ${formatErrors(
          profile.stats.totalErrors / profile.attempts,
        )} avg errors`
      : "No attempts yet. Still rotating in for coverage.";
    const attemptsLabel = profile.attempts
      ? `${profile.attempts} attempts logged`
      : "Fresh letter";
    chip.innerHTML = `
      <strong>${profile.letter}</strong>
      <p>${detail}</p>
      <p>${attemptsLabel}</p>
    `;
    elements.focusLetters.appendChild(chip);
  });
}

function colorForProfile(profile) {
  const normalized = clamp((profile.difficulty - 0.8) / 1.2, 0, 1);
  const hue = 148 - normalized * 92;
  const saturation = 64 + normalized * 12;
  const lightness = 82 - normalized * 24;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function renderKeyboard() {
  const profiles = Object.fromEntries(LETTERS.map((letter) => [letter, buildLetterProfile(letter)]));
  elements.keyboardMap.innerHTML = "";

  KEYBOARD_ROWS.forEach((row) => {
    const rowElement = document.createElement("div");
    rowElement.className = "keyboard-row";

    row.forEach((letter) => {
      const profile = profiles[letter];
      const title = profile.attempts
        ? `${letter}: ${formatMs(
            profile.stats.totalTimeMs / profile.attempts,
          )}, ${formatErrors(profile.stats.totalErrors / profile.attempts)} avg errors`
        : `${letter}: no attempts yet`;
      const key = document.createElement("div");
      key.className = `keyboard-key ${profile.attempts ? "" : "untouched"} ${
        session.currentLetter === letter ? "target" : ""
      }`;
      key.style.background = profile.attempts
        ? colorForProfile(profile)
        : "rgba(255, 255, 255, 0.78)";
      key.title = title;
      key.innerHTML = `
        <span class="letter">${letter}</span>
        <span class="meta">${profile.attempts || "new"}</span>
      `;
      rowElement.appendChild(key);
    });

    elements.keyboardMap.appendChild(rowElement);
  });
}

function renderStatsTable() {
  const rows = LETTERS.map(buildLetterProfile).sort(
    (a, b) => b.difficulty - a.difficulty,
  );
  elements.statsTableBody.innerHTML = "";

  rows.forEach((profile) => {
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

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${profile.letter}</strong></td>
      <td>${profile.attempts}</td>
      <td>${displayMs(lifetimeAvgTime)}</td>
      <td>${displayMs(recentAvgTime)}</td>
      <td>${displayErrors(lifetimeAvgErrors)}</td>
      <td>${displayErrors(recentAvgErrors)}</td>
      <td class="${trendClass}">${trendText}</td>
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
  const lifetime = getLifetimeAverages();
  const sessionAvgTime = session.attempts
    ? session.totalTimeMs / session.attempts
    : 0;
  const sessionAvgErrors = session.attempts
    ? session.totalErrors / session.attempts
    : 0;
  const cleanRate = session.attempts
    ? Math.round((session.cleanHits / session.attempts) * 100)
    : 0;

  elements.coverageCount.textContent = `${coverage.practiced} / ${LETTERS.length}`;
  elements.coverageDetail.textContent = `${coverage.solid} letters have at least five logged attempts.`;
  elements.recentTrend.textContent = trend.title;
  elements.recentTrendDetail.textContent = trend.detail;
  elements.sessionBadge.textContent =
    session.currentStreak >= 10
      ? "Hot streak"
      : session.attempts >= 1
        ? "In session"
        : "Fresh run";
  elements.sessionAttempts.textContent = String(session.attempts);
  elements.sessionCleanRate.textContent = `${cleanRate}% clean hits`;
  elements.sessionAverageTime.textContent = session.attempts
    ? formatMs(sessionAvgTime)
    : "0 ms";
  elements.sessionAverageTimeDetail.textContent =
    session.attempts >= 5
      ? `Last attempt: ${formatMs(data.history.at(-1)?.timeMs || 0)}`
      : "Session average";
  elements.sessionAverageErrors.textContent = formatErrors(sessionAvgErrors);
  elements.sessionBestStreak.textContent = `Best streak: ${session.bestStreak}`;
  elements.lifetimeAverageTime.textContent = data.totals.attempts
    ? formatMs(lifetime.avgTimeMs)
    : "0 ms";
  elements.lifetimeAverageErrors.textContent = `${formatErrors(
    lifetime.avgErrors,
  )} avg errors`;
  elements.lifetimeTotals.textContent = `${data.totals.attempts} attempts | ${formatStudyDuration(
    data.totals.totalTimeMs,
  )} studied`;
  elements.startButton.textContent = session.active
    ? "New session"
    : session.attempts > 0
      ? "Resume"
      : "Start";
  elements.pauseButton.disabled = !session.active;
}

function renderAttemptPanel() {
  elements.targetLetter.textContent = session.currentLetter.toUpperCase();
  elements.attemptErrors.textContent = String(session.errorsThisAttempt);
  elements.currentStreak.textContent = String(session.currentStreak);
  elements.liveTimer.textContent =
    session.active && session.promptStartedAt
      ? formatMs(performance.now() - session.promptStartedAt)
      : "0 ms";
}

function render() {
  renderAttemptPanel();
  renderSummary();
  renderFeedback();
  renderFocusLetters();
  renderKeyboard();
  renderStatsTable();
}

function attachEvents() {
  elements.startButton.addEventListener("click", () => {
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

attachEvents();
pauseSession("Press Start, switch your keyboard layout to Russian, and type the letter shown.");
render();
