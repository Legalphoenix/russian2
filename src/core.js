(function () {
  const Coach = (window.RussianSkillCoach = window.RussianSkillCoach || {});

  const STAGE_LABELS = {
    preview: "Preview",
    choose2: "Choose 2",
    choose4: "Choose 4",
    fullChoice: "Full Choice",
    typeFragment: "Type Fragment",
    typeFull: "Type Full",
    sentenceGuided: "Sentence Guided",
    sentenceFree: "Sentence Free",
    phraseGuided: "Phrase Guided",
    lineOrder: "Line Order",
    dialogueRoleplay: "Dialogue Roleplay",
    contextUse: "Context Use",
  };

  const PERSON_LABELS = {
    "1sg": "я",
    "2sg": "ты",
    "3sg": "он / она / оно",
    "1pl": "мы",
    "2pl": "вы",
    "3pl": "они",
  };

  const SLOT_LABELS = {
    masc: "masc",
    fem: "fem",
    neut: "neut",
    pl: "plural",
    m: "masc",
    f: "fem",
    n: "neut",
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function average(items, selector) {
    if (!items.length) {
      return 0;
    }
    return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
  }

  function sum(items, selector) {
    return items.reduce((total, item) => total + selector(item), 0);
  }

  function unique(items) {
    return Array.from(new Set(items));
  }

  function sample(items) {
    if (!items.length) {
      return null;
    }
    return items[Math.floor(Math.random() * items.length)];
  }

  function pickMany(items, count) {
    const pool = items.slice();
    const selected = [];
    while (pool.length && selected.length < count) {
      const index = Math.floor(Math.random() * pool.length);
      selected.push(pool.splice(index, 1)[0]);
    }
    return selected;
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function ensureObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function ensureNumber(value, fallback) {
    return Number.isFinite(value) ? Number(value) : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatMs(value) {
    return `${Math.round(value)} ms`;
  }

  function formatErrors(value) {
    return Number(value || 0).toFixed(2);
  }

  function formatPercent(value) {
    return `${Math.round(value)}%`;
  }

  function formatStudyDuration(totalMs) {
    const totalSeconds = Math.max(0, Math.round((totalMs || 0) / 1000));
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

  function normalizeAnswer(value) {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeAnswer(item)).join(" | ");
    }

    return String(value ?? "")
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/[.,!?;:()"]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function answersMatch(candidate, expected) {
    return normalizeAnswer(candidate) === normalizeAnswer(expected);
  }

  function getStageLabel(stageId) {
    return STAGE_LABELS[stageId] || stageId;
  }

  function getPersonLabel(person) {
    return PERSON_LABELS[person] || person;
  }

  function getSlotLabel(slot) {
    return SLOT_LABELS[slot] || slot;
  }

  function slugToTitle(value) {
    return String(value || "")
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function commonPrefix(values) {
    if (!values.length) {
      return "";
    }

    let prefix = values[0];
    for (let index = 1; index < values.length; index += 1) {
      while (!values[index].startsWith(prefix) && prefix) {
        prefix = prefix.slice(0, -1);
      }
    }
    return prefix;
  }

  Coach.core = {
    STAGE_LABELS,
    PERSON_LABELS,
    SLOT_LABELS,
    clamp,
    average,
    sum,
    unique,
    sample,
    pickMany,
    shuffle,
    ensureArray,
    ensureObject,
    ensureNumber,
    escapeHtml,
    formatMs,
    formatErrors,
    formatPercent,
    formatStudyDuration,
    displayMs,
    displayErrors,
    normalizeAnswer,
    answersMatch,
    getStageLabel,
    getPersonLabel,
    getSlotLabel,
    slugToTitle,
    commonPrefix,
  };
})();
