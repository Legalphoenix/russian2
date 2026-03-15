(function () {
  const Coach = window.RussianSkillCoach;
  const {
    clamp,
    average,
    formatMs,
    formatErrors,
    displayMs,
    displayErrors,
    formatStudyDuration,
    escapeHtml,
  } = Coach.core;
  const {
    PRIOR_ATTEMPTS,
    PRIOR_TIME_MS,
    PRIOR_ERRORS,
    RECENT_LIMIT,
    HISTORY_LIMIT,
  } = Coach.progress;

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
      message: "Press Start, switch your keyboard layout to Russian, and type the letter shown.",
    };
  }

  function createController(host) {
    const controller = {
      root: null,
      elements: null,
      session: createSession(),
      timerFrame: 0,
      mounted: false,
    };

    function getData() {
      return host.getProgress().modules.keyboard;
    }

    function getLifetimeAverages() {
      const data = getData();
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

    function buildLetterProfile(letter) {
      const data = getData();
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
      const recencyMinutes = stats.lastSeenAt ? (Date.now() - stats.lastSeenAt) / 60000 : 90;
      const staleBoost = clamp(recencyMinutes / 120, 0.08, 0.42);
      const timePressure = smoothedTime / baseline.avgTimeMs;
      const errorPressure = smoothedErrors / (baseline.avgErrors + 0.35);
      const difficulty =
        0.58 * timePressure +
        0.27 * errorPressure +
        0.15 * noveltyBoost +
        staleBoost;

      let weight = 0.22 + difficulty;
      if (controller.session.currentLetter === letter) {
        weight *= 0.46;
      }
      if (controller.session.previousLetters.includes(letter)) {
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

    function updateResumeState() {
      const data = getData();
      data.resume.currentLetter = controller.session.currentLetter;
      data.resume.previousLetters = controller.session.previousLetters.slice(0, 3);
    }

    function startTimerLoop() {
      cancelAnimationFrame(controller.timerFrame);

      const tick = () => {
        if (!controller.session.active || !controller.session.promptStartedAt || !controller.elements) {
          return;
        }

        controller.elements.liveTimer.textContent = formatMs(
          performance.now() - controller.session.promptStartedAt,
        );
        controller.timerFrame = requestAnimationFrame(tick);
      };

      controller.timerFrame = requestAnimationFrame(tick);
    }

    function setFeedback(message) {
      controller.session.message = message;
      renderFeedback();
    }

    function renderFeedback() {
      if (!controller.elements) {
        return;
      }

      controller.elements.feedbackMessage.textContent = controller.session.message;
      controller.elements.layoutHint.classList.toggle(
        "hidden",
        controller.session.layoutHintUntil <= Date.now(),
      );
    }

    function updateStatusPill(label, variant) {
      controller.elements.statusPill.textContent = label;
      controller.elements.statusPill.className = `status-pill ${variant}`;
    }

    function flashStatus(label, variant) {
      updateStatusPill(label, variant);
      window.clearTimeout(flashStatus.timeoutId);
      flashStatus.timeoutId = window.setTimeout(() => {
        updateStatusPill(
          controller.session.active ? "Live" : "Paused",
          controller.session.active ? "live" : "idle",
        );
      }, 420);
    }

    function registerAttempt(letter, timeMs, errors) {
      const data = getData();
      const stats = data.letters[letter];
      const now = Date.now();
      stats.attempts += 1;
      stats.totalTimeMs += timeMs;
      stats.totalErrors += errors;
      stats.lastSeenAt = now;
      stats.bestTimeMs =
        stats.bestTimeMs === null ? timeMs : Math.min(stats.bestTimeMs, timeMs);
      stats.recent.push({ timeMs, errors, at: now });
      stats.recent = stats.recent.slice(-RECENT_LIMIT);

      data.totals.attempts += 1;
      data.totals.totalTimeMs += timeMs;
      data.totals.totalErrors += errors;
      data.totals.bestStreak = Math.max(data.totals.bestStreak, controller.session.currentStreak);
      data.updatedAt = now;
      data.history.push({ letter, timeMs, errors, at: now });
      data.history = data.history.slice(-HISTORY_LIMIT);
      updateResumeState();
      host.markDirty();
    }

    function advancePrompt() {
      controller.session.previousLetters = [
        controller.session.currentLetter,
        ...controller.session.previousLetters,
      ].slice(0, 3);
      controller.session.currentLetter = pickWeightedLetter();
      controller.session.transitioning = false;
      controller.session.promptStartedAt = performance.now();
      controller.session.errorsThisAttempt = 0;
      controller.session.layoutHintUntil = 0;
      controller.session.message = "Find the highlighted letter on your Russian keyboard.";
      updateResumeState();
      render();
      startTimerLoop();
    }

    function completeCurrentLetter() {
      if (!controller.session.active || !controller.session.promptStartedAt) {
        return;
      }

      const timeMs = performance.now() - controller.session.promptStartedAt;
      const errors = controller.session.errorsThisAttempt;

      controller.session.attempts += 1;
      controller.session.totalTimeMs += timeMs;
      controller.session.totalErrors += errors;
      controller.session.currentStreak += 1;
      controller.session.bestStreak = Math.max(
        controller.session.bestStreak,
        controller.session.currentStreak,
      );
      if (errors === 0) {
        controller.session.cleanHits += 1;
      }

      registerAttempt(controller.session.currentLetter, timeMs, errors);
      controller.session.transitioning = true;
      controller.session.promptStartedAt = 0;
      cancelAnimationFrame(controller.timerFrame);

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
        if (!controller.session.active) {
          return;
        }
        advancePrompt();
      }, 280);
    }

    function handleWrongKey(rawKey) {
      if (!controller.session.active || controller.session.transitioning) {
        return;
      }

      controller.session.errorsThisAttempt += 1;
      controller.session.currentStreak = 0;
      flashStatus("Miss", "flash-wrong");
      setFeedback(
        `Not ${controller.session.currentLetter}. Misses this round: ${controller.session.errorsThisAttempt}.`,
      );

      if (/^[a-z]$/i.test(rawKey)) {
        controller.session.layoutHintUntil = Date.now() + 2500;
      }

      renderAttemptPanel();
      renderFeedback();
    }

    function startSession(options = {}) {
      if (options.fresh) {
        controller.session = createSession();
      }

      const data = getData();
      controller.session.active = true;
      controller.session.transitioning = false;
      controller.session.errorsThisAttempt = 0;
      controller.session.layoutHintUntil = 0;
      controller.session.message = "Find the highlighted letter on your Russian keyboard.";

      if (data.resume.currentLetter) {
        controller.session.currentLetter = data.resume.currentLetter;
        controller.session.previousLetters = data.resume.previousLetters || [];
      }

      if (!controller.session.currentLetter) {
        controller.session.currentLetter = pickWeightedLetter();
      }

      controller.session.promptStartedAt = performance.now();
      updateResumeState();
      render();
      startTimerLoop();
    }

    function pauseSession(message = "Paused. Resume when ready.") {
      controller.session.active = false;
      controller.session.transitioning = false;
      controller.session.promptStartedAt = 0;
      controller.session.errorsThisAttempt = 0;
      controller.session.message = message;
      cancelAnimationFrame(controller.timerFrame);
      render();
    }

    function computeCoverage() {
      const data = getData();
      const practiced = LETTERS.filter((letter) => data.letters[letter].attempts > 0).length;
      const solid = LETTERS.filter((letter) => data.letters[letter].attempts >= 5).length;
      return { practiced, solid };
    }

    function computeTrendSummary() {
      const data = getData();
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
        const title = diff < -40 ? `${Math.abs(diff)} ms faster lately` : "Cleaner lately";
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

    function colorForProfile(profile) {
      const normalized = clamp((profile.difficulty - 0.8) / 1.2, 0, 1);
      const hue = 148 - normalized * 92;
      const saturation = 64 + normalized * 12;
      const lightness = 82 - normalized * 24;
      return `hsl(${hue} ${saturation}% ${lightness}%)`;
    }

    function renderFocusLetters() {
      const profiles = buildFocusLetters();
      controller.elements.focusLetters.innerHTML = profiles
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

    function renderKeyboard() {
      const profiles = Object.fromEntries(
        LETTERS.map((letter) => [letter, buildLetterProfile(letter)]),
      );

      controller.elements.keyboardMap.innerHTML = KEYBOARD_ROWS.map((row) => {
        const rowHtml = row
          .map((letter) => {
            const profile = profiles[letter];
            const title = profile.attempts
              ? `${letter}: ${formatMs(
                  profile.stats.totalTimeMs / profile.attempts,
                )}, ${formatErrors(profile.stats.totalErrors / profile.attempts)} avg errors`
              : `${letter}: no attempts yet`;
            const classes = [
              "keyboard-key",
              profile.attempts ? "" : "untouched",
              controller.session.currentLetter === letter ? "target" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return `
              <div class="${classes}" style="background:${profile.attempts ? colorForProfile(profile) : "rgba(255,255,255,0.78)"}" title="${escapeHtml(title)}">
                <span class="letter">${escapeHtml(letter)}</span>
                <span class="meta">${escapeHtml(profile.attempts || "new")}</span>
              </div>
            `;
          })
          .join("");

        return `<div class="keyboard-row">${rowHtml}</div>`;
      }).join("");
    }

    function renderStatsTable() {
      const rows = LETTERS.map(buildLetterProfile).sort((a, b) => b.difficulty - a.difficulty);
      controller.elements.statsTableBody.innerHTML = rows
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

    function renderSummary() {
      const data = getData();
      const coverage = computeCoverage();
      const trend = computeTrendSummary();
      const lifetime = getLifetimeAverages();
      const sessionAvgTime = controller.session.attempts
        ? controller.session.totalTimeMs / controller.session.attempts
        : 0;
      const sessionAvgErrors = controller.session.attempts
        ? controller.session.totalErrors / controller.session.attempts
        : 0;
      const cleanRate = controller.session.attempts
        ? Math.round((controller.session.cleanHits / controller.session.attempts) * 100)
        : 0;

      controller.elements.coverageCount.textContent = `${coverage.practiced} / ${LETTERS.length}`;
      controller.elements.coverageDetail.textContent = `${coverage.solid} letters have at least five logged attempts.`;
      controller.elements.recentTrend.textContent = trend.title;
      controller.elements.recentTrendDetail.textContent = trend.detail;
      controller.elements.sessionBadge.textContent =
        controller.session.currentStreak >= 10
          ? "Hot streak"
          : controller.session.attempts >= 1
            ? "In session"
            : "Fresh run";
      controller.elements.sessionAttempts.textContent = String(controller.session.attempts);
      controller.elements.sessionCleanRate.textContent = `${cleanRate}% clean hits`;
      controller.elements.sessionAverageTime.textContent = controller.session.attempts
        ? formatMs(sessionAvgTime)
        : "0 ms";
      controller.elements.sessionAverageTimeDetail.textContent =
        controller.session.attempts >= 5
          ? `Last attempt: ${formatMs(data.history.at(-1)?.timeMs || 0)}`
          : "Session average";
      controller.elements.sessionAverageErrors.textContent = formatErrors(sessionAvgErrors);
      controller.elements.sessionBestStreak.textContent = `Best streak: ${controller.session.bestStreak}`;
      controller.elements.lifetimeAverageTime.textContent = data.totals.attempts
        ? formatMs(lifetime.avgTimeMs)
        : "0 ms";
      controller.elements.lifetimeAverageErrors.textContent = `${formatErrors(
        lifetime.avgErrors,
      )} avg errors`;
      controller.elements.lifetimeTotals.textContent = `${data.totals.attempts} attempts | ${formatStudyDuration(
        data.totals.totalTimeMs,
      )} studied`;
      controller.elements.leaderboardTotalAttempts.textContent = String(data.totals.attempts);
      controller.elements.leaderboardTotalStudyTime.textContent = formatStudyDuration(
        data.totals.totalTimeMs,
      );
      controller.elements.startButton.textContent = controller.session.active
        ? "New session"
        : controller.session.attempts > 0
          ? "Resume"
          : "Start";
      controller.elements.pauseButton.disabled = !controller.session.active;
      updateStatusPill(controller.session.active ? "Live" : "Paused", controller.session.active ? "live" : "idle");
    }

    function renderAttemptPanel() {
      controller.elements.targetLetter.textContent = controller.session.currentLetter.toUpperCase();
      controller.elements.attemptErrors.textContent = String(controller.session.errorsThisAttempt);
      controller.elements.currentStreak.textContent = String(controller.session.currentStreak);
      controller.elements.liveTimer.textContent =
        controller.session.active && controller.session.promptStartedAt
          ? formatMs(performance.now() - controller.session.promptStartedAt)
          : "0 ms";
    }

    function render() {
      if (!controller.elements) {
        return;
      }
      renderAttemptPanel();
      renderSummary();
      renderFeedback();
      renderFocusLetters();
      renderKeyboard();
      renderStatsTable();
    }

    function attachEvents() {
      controller.elements.startButton.addEventListener("click", () => {
        const fresh = controller.session.active || controller.session.attempts === 0;
        startSession({ fresh });
      });
      controller.elements.pauseButton.addEventListener("click", () => pauseSession());
    }

    function mount(root) {
      controller.root = root;
      controller.mounted = true;
      root.innerHTML = `
        <section class="hero card">
          <div class="hero-copy">
            <p class="eyebrow">Keyboard</p>
            <h1>Russian Key Coach</h1>
            <p class="hero-text">
              The original trainer stays intact here: one letter at a time, timed until correct, with weighted resurfacing of weak keys.
            </p>
            <div class="hero-actions">
              <button id="keyboard-start-button" class="button button-primary">Start</button>
              <button id="keyboard-pause-button" class="button button-secondary">Pause</button>
            </div>
          </div>
          <div class="hero-metrics">
            <div class="metric-block">
              <span class="metric-label">Letters covered</span>
              <strong id="keyboard-coverage-count">0 / 33</strong>
              <span id="keyboard-coverage-detail" class="metric-detail"></span>
            </div>
            <div class="metric-block">
              <span class="metric-label">Recent trend</span>
              <strong id="keyboard-recent-trend">Waiting for attempts</strong>
              <span id="keyboard-recent-trend-detail" class="metric-detail"></span>
            </div>
          </div>
        </section>

        <section class="top-grid">
          <article class="practice card">
            <div class="practice-header">
              <div>
                <p class="section-label">Current target</p>
                <h2>Find the matching key</h2>
              </div>
              <div id="keyboard-status-pill" class="status-pill idle">Paused</div>
            </div>

            <div class="target-display idle">
              <span id="keyboard-target-letter">Ж</span>
            </div>

            <div class="attempt-strip">
              <div class="attempt-stat">
                <span class="attempt-label">Timer</span>
                <strong id="keyboard-live-timer">0 ms</strong>
              </div>
              <div class="attempt-stat">
                <span class="attempt-label">Errors this round</span>
                <strong id="keyboard-attempt-errors">0</strong>
              </div>
              <div class="attempt-stat">
                <span class="attempt-label">Streak</span>
                <strong id="keyboard-current-streak">0</strong>
              </div>
            </div>

            <div class="practice-feedback">
              <p id="keyboard-feedback-message" class="feedback-message"></p>
              <p id="keyboard-layout-hint" class="layout-hint hidden">
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
              <div id="keyboard-session-badge" class="session-badge">Fresh run</div>
            </div>

            <div class="stats-grid">
              <div class="stat-tile accent-coral">
                <span class="tile-label">Attempts</span>
                <strong id="keyboard-session-attempts">0</strong>
                <span class="tile-foot" id="keyboard-session-clean-rate">0% clean hits</span>
              </div>
              <div class="stat-tile accent-mint">
                <span class="tile-label">Avg response</span>
                <strong id="keyboard-session-average-time">0 ms</strong>
                <span class="tile-foot" id="keyboard-session-average-time-detail">Session average</span>
              </div>
              <div class="stat-tile accent-sand">
                <span class="tile-label">Avg errors</span>
                <strong id="keyboard-session-average-errors">0.00</strong>
                <span class="tile-foot" id="keyboard-session-best-streak">Best streak: 0</span>
              </div>
              <div class="stat-tile accent-ink">
                <span class="tile-label">Lifetime avg</span>
                <strong id="keyboard-lifetime-average-time">0 ms</strong>
                <span class="tile-foot" id="keyboard-lifetime-average-errors">0.00 avg errors</span>
                <span class="tile-foot" id="keyboard-lifetime-totals">0 attempts | 0s studied</span>
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
              <div id="keyboard-focus-letters" class="focus-letters"></div>
            </div>
          </article>
        </section>

        <section class="bottom-grid">
          <article class="keyboard card">
            <div class="panel-header">
              <div>
                <p class="section-label">Keyboard heatmap</p>
                <h2>Watch weak spots cool down over time</h2>
              </div>
              <span class="focus-caption">Hotter keys need more work. The current target glows.</span>
            </div>
            <div id="keyboard-map" class="keyboard-map"></div>
          </article>

          <article class="leaderboard card">
            <div class="panel-header">
              <div>
                <p class="section-label">Per-key progress</p>
                <h2>Lifetime averages plus recent form</h2>
              </div>
              <span class="focus-caption">Sorted by current challenge so problem keys stay visible.</span>
            </div>
            <div class="leaderboard-summary">
              <div class="leaderboard-pill leaderboard-pill-attempts">
                <span class="leaderboard-pill-label">Lifetime attempts</span>
                <strong id="keyboard-leaderboard-total-attempts">0</strong>
                <span class="leaderboard-pill-note">All logged prompts</span>
              </div>
              <div class="leaderboard-pill leaderboard-pill-study">
                <span class="leaderboard-pill-label">Total study time</span>
                <strong id="keyboard-leaderboard-total-study-time">0s</strong>
                <span class="leaderboard-pill-note">Measured until the correct key</span>
              </div>
            </div>
            <div class="table-wrap">
              <table>
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
                <tbody id="keyboard-stats-table-body"></tbody>
              </table>
            </div>
          </article>
        </section>
      `;

      controller.elements = {
        startButton: root.querySelector("#keyboard-start-button"),
        pauseButton: root.querySelector("#keyboard-pause-button"),
        coverageCount: root.querySelector("#keyboard-coverage-count"),
        coverageDetail: root.querySelector("#keyboard-coverage-detail"),
        recentTrend: root.querySelector("#keyboard-recent-trend"),
        recentTrendDetail: root.querySelector("#keyboard-recent-trend-detail"),
        statusPill: root.querySelector("#keyboard-status-pill"),
        targetLetter: root.querySelector("#keyboard-target-letter"),
        liveTimer: root.querySelector("#keyboard-live-timer"),
        attemptErrors: root.querySelector("#keyboard-attempt-errors"),
        currentStreak: root.querySelector("#keyboard-current-streak"),
        feedbackMessage: root.querySelector("#keyboard-feedback-message"),
        layoutHint: root.querySelector("#keyboard-layout-hint"),
        sessionBadge: root.querySelector("#keyboard-session-badge"),
        sessionAttempts: root.querySelector("#keyboard-session-attempts"),
        sessionCleanRate: root.querySelector("#keyboard-session-clean-rate"),
        sessionAverageTime: root.querySelector("#keyboard-session-average-time"),
        sessionAverageTimeDetail: root.querySelector("#keyboard-session-average-time-detail"),
        sessionAverageErrors: root.querySelector("#keyboard-session-average-errors"),
        sessionBestStreak: root.querySelector("#keyboard-session-best-streak"),
        lifetimeAverageTime: root.querySelector("#keyboard-lifetime-average-time"),
        lifetimeAverageErrors: root.querySelector("#keyboard-lifetime-average-errors"),
        lifetimeTotals: root.querySelector("#keyboard-lifetime-totals"),
        leaderboardTotalAttempts: root.querySelector("#keyboard-leaderboard-total-attempts"),
        leaderboardTotalStudyTime: root.querySelector("#keyboard-leaderboard-total-study-time"),
        focusLetters: root.querySelector("#keyboard-focus-letters"),
        keyboardMap: root.querySelector("#keyboard-map"),
        statsTableBody: root.querySelector("#keyboard-stats-table-body"),
      };

      attachEvents();
      updateResumeState();
      pauseSession("Press Start, switch your keyboard layout to Russian, and type the letter shown.");
      render();
    }

    function unmount() {
      controller.mounted = false;
      cancelAnimationFrame(controller.timerFrame);
      pauseSession("Paused. Resume when ready.");
      controller.root = null;
      controller.elements = null;
    }

    function handleKeydown(event) {
      if (!controller.mounted || !controller.elements || event.repeat) {
        return false;
      }

      if (event.key === "Escape") {
        pauseSession();
        return true;
      }

      if (!controller.session.active) {
        if (event.key === "Enter") {
          event.preventDefault();
          startSession({ fresh: controller.session.attempts === 0 });
          return true;
        }
        return false;
      }

      if (controller.session.transitioning || event.key.length !== 1) {
        return false;
      }

      event.preventDefault();
      const key = event.key.toLowerCase();
      if (key === controller.session.currentLetter) {
        completeCurrentLetter();
        return true;
      }

      handleWrongKey(key);
      return true;
    }

    return {
      mount,
      unmount,
      handleKeydown,
      getCurrentLetter() {
        return controller.session.currentLetter;
      },
      refresh: render,
    };
  }

  Coach.keyboard = {
    LETTERS,
    KEYBOARD_ROWS,
    createController,
  };
})();
