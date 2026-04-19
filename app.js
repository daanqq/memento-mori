(function () {
  const DEFAULT_TARGET = "2089-04-17 12:00:00";
  const UNITS = {
    seconds: { label: "SECONDS", ms: 1000 },
    minutes: { label: "MINUTES", ms: 1000 * 60 },
    hours: { label: "HOURS", ms: 1000 * 60 * 60 },
    days: { label: "DAYS", ms: 1000 * 60 * 60 * 24 },
    weeks: { label: "WEEKS", ms: 1000 * 60 * 60 * 24 * 7 },
  };

  const state = {
    targetInput: DEFAULT_TARGET,
    lastValidTarget: null,
    effectiveTarget: null,
    unitMode: "days",
    fontPreset: "doto",
    themeMode: "dark",
    useCustomBackground: false,
    backgroundColor: null,
    colorPreset: "theme",
    customColor: null,
    useSeparators: true,
    showTarget: true,
    showDotGrid: false,
    gridDiameterPct: 150,
    tickAnimation: true,
    sizeBias: 100,
    positionPreset: "left-center",
    error: null,
    timerId: null,
    pendingTick: null,
  };

  const root = document.getElementById("wallpaperRoot");
  const valueEl = document.getElementById("countdownValue");
  const unitEl = document.getElementById("countdownUnit");
  const targetEl = document.getElementById("targetLine");

  function parseWallpaperColor(value) {
    if (!value) {
      return null;
    }

    const parts = String(value)
      .trim()
      .split(/\s+/)
      .map(Number);

    if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
      return null;
    }

    const [r, g, b] = parts.map((part) => Math.max(0, Math.min(255, Math.round(part * 255))));
    return `rgb(${r} ${g} ${b})`;
  }

  function parseTargetDate(input) {
    const match = String(input).trim().match(
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
    );

    if (!match) {
      return null;
    }

    const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    const second = Number(secondStr);

    const date = new Date(year, month - 1, day, hour, minute, second, 0);

    const isValid =
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day &&
      date.getHours() === hour &&
      date.getMinutes() === minute &&
      date.getSeconds() === second;

    return isValid ? date : null;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatTargetDate(date) {
    return [
      date.getFullYear(),
      pad2(date.getMonth() + 1),
      pad2(date.getDate()),
    ].join("-") + " " + [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join(":");
  }

  function formatNumber(value, useSeparators) {
    const safe = Math.max(0, Math.floor(value));
    const raw = String(safe);
    if (!useSeparators) {
      return raw;
    }
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function resolveUnitMode(mode) {
    return UNITS[mode] ? mode : "days";
  }

  function resolvePositionPreset(value) {
    return ["left-center", "center", "lower-left", "lower-center"].includes(value)
      ? value
      : "left-center";
  }

  function getEffectiveColor() {
    if (state.colorPreset === "custom" && state.customColor) {
      return state.customColor;
    }

    if (state.themeMode === "light") {
      return state.colorPreset === "soft-gray" ? "var(--text-secondary)" : "var(--text-display)";
    }

    switch (state.colorPreset) {
      case "soft-gray":
        return "var(--text-secondary)";
      case "accent-red":
        return "var(--accent)";
      default:
        return "var(--text-display)";
    }
  }

  function getEffectiveBackgroundColor() {
    if (state.useCustomBackground && state.backgroundColor) {
      return state.backgroundColor;
    }

    return state.themeMode === "light" ? "#f5f5f5" : "#000000";
  }

  function applyTheme() {
    const page = document.documentElement;
    root.dataset.position = resolvePositionPreset(state.positionPreset);
    root.dataset.theme = state.themeMode;
    root.dataset.font = state.fontPreset;
    root.classList.toggle("is-invalid", Boolean(state.error));
    root.classList.toggle("no-tick-animation", !state.tickAnimation);
    root.style.setProperty("--grid-opacity", state.showDotGrid ? "1" : "0");
    root.style.setProperty("--meta-opacity", state.showTarget ? "1" : "0");
    root.style.setProperty("--hero-color", getEffectiveColor());
    page.style.setProperty("--bg", getEffectiveBackgroundColor());
    root.style.setProperty("--bg-dot-opacity", state.showDotGrid ? "0.12" : "0");
  }

  function updateGridMask() {
    const grid = root.querySelector(".wallpaper__grid");
    if (!grid || !state.showDotGrid) {
      root.style.setProperty("--grid-circle-radius", "0px");
      return;
    }

    const heroRect = valueEl.getBoundingClientRect();
    const centerX = heroRect.left + heroRect.width / 2;
    const centerY = heroRect.top + heroRect.height / 2;
    const diameterPct = Math.max(20, Math.min(150, Number(state.gridDiameterPct) || 90));
    const radius = window.innerHeight * (diameterPct / 200);

    root.style.setProperty("--grid-mask-x", `${centerX}px`);
    root.style.setProperty("--grid-mask-y", `${centerY}px`);
    root.style.setProperty("--grid-circle-radius", `${radius}px`);
  }

  function applyPositionBias() {
    const bias = Math.max(80, Math.min(120, Number(state.sizeBias) || 100));
    root.style.setProperty("--hero-scale", String(bias / 100));

    const baseShift = {
      "left-center": ["0px", "0px"],
      center: ["0vw", "0vh"],
      "lower-left": ["0px", "-4vh"],
      "lower-center": ["0vw", "5vh"],
    }[resolvePositionPreset(state.positionPreset)];

    root.style.setProperty("--hero-shift-x", baseShift[0]);
    root.style.setProperty("--hero-shift-y", baseShift[1]);
  }

  function updateTargetLine() {
    if (!state.showTarget) {
      targetEl.textContent = "";
      return;
    }

    if (state.error) {
      targetEl.textContent = "INVALID TARGET DATE";
      return;
    }

    const target = state.effectiveTarget || state.lastValidTarget || parseTargetDate(DEFAULT_TARGET);
    targetEl.textContent = `TARGET ${formatTargetDate(target)}`;
  }

  function getCountdownValue(now = new Date()) {
    const target = state.effectiveTarget;
    const unit = UNITS[resolveUnitMode(state.unitMode)];
    if (!target || !unit) {
      return 0;
    }

    const remaining = Math.max(0, target.getTime() - now.getTime());
    return Math.floor(remaining / unit.ms);
  }

  function scheduleNextTick(now = new Date()) {
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }

    const unit = UNITS[resolveUnitMode(state.unitMode)];
    if (!unit) {
      return;
    }

    const target = state.effectiveTarget;
    if (!target) {
      return;
    }

    const remaining = Math.max(0, target.getTime() - now.getTime());
    if (remaining === 0) {
      return;
    }

    const delay = remaining % unit.ms || unit.ms;
    state.timerId = window.setTimeout(() => {
      render();
    }, Math.max(50, delay + 25));
  }

  function fitNumber() {
    const computed = getComputedStyle(root);
    const safeX = Number.parseFloat(computed.getPropertyValue("--hero-safe-x")) || 64;
    const safeY = Number.parseFloat(computed.getPropertyValue("--hero-safe-y")) || 48;
    const availableWidth = Math.max(160, window.innerWidth - safeX * 2);
    const availableHeight = Math.max(120, window.innerHeight - safeY * 2 - unitEl.offsetHeight - 24);
    const naturalWidth = Math.max(1, valueEl.scrollWidth);
    const naturalHeight = Math.max(1, valueEl.scrollHeight);
    const widthScale = availableWidth / naturalWidth;
    const heightScale = availableHeight / naturalHeight;
    const scale = Math.min(1, widthScale, heightScale);
    const sizeBias = Math.max(80, Math.min(120, Number(state.sizeBias) || 100)) / 100;
    root.style.setProperty("--hero-scale", String(scale * sizeBias));
  }

  function pulseTick() {
    if (!state.tickAnimation) {
      return;
    }

    root.classList.remove("is-ticking");
    requestAnimationFrame(() => {
      root.classList.add("is-ticking");
      window.clearTimeout(state.pendingTick);
      state.pendingTick = window.setTimeout(() => {
        root.classList.remove("is-ticking");
      }, 160);
    });
  }

  function render() {
    const now = new Date();
    state.error = null;

    const parsedTarget = parseTargetDate(state.targetInput);
    if (parsedTarget) {
      state.lastValidTarget = parsedTarget;
      state.effectiveTarget = parsedTarget;
    } else if (state.lastValidTarget) {
      state.effectiveTarget = state.lastValidTarget;
      state.error = "INVALID TARGET DATE";
    } else {
      state.effectiveTarget = parseTargetDate(DEFAULT_TARGET);
    }

    const unit = resolveUnitMode(state.unitMode);
    unitEl.textContent = UNITS[unit].label;

    const value = getCountdownValue(now);
    const formatted = formatNumber(value, state.useSeparators);
    const prevText = valueEl.textContent;
    valueEl.textContent = formatted;

    applyTheme();
    applyPositionBias();
    updateTargetLine();
    fitNumber();
    updateGridMask();
    scheduleNextTick(now);

    if (prevText !== formatted) {
      pulseTick();
    }
  }

  function mergePropertyValue(key, property) {
    if (!property) {
      return;
    }

    switch (key) {
      case "targetdate":
        state.targetInput = property.value ?? DEFAULT_TARGET;
        break;
      case "unitmode":
        state.unitMode = resolveUnitMode(property.value);
        break;
      case "fontpreset":
        state.fontPreset = property.value === "doto" ? "doto" : "space-mono";
        break;
      case "thememode":
        state.themeMode = property.value === "light" ? "light" : "dark";
        break;
      case "bgcustom":
        state.useCustomBackground = Boolean(property.value);
        break;
      case "schemecolor":
        state.backgroundColor = parseWallpaperColor(property.value);
        break;
      case "colorpreset":
        state.colorPreset = property.value || "theme";
        break;
      case "customcolor":
        state.customColor = parseWallpaperColor(property.value);
        break;
      case "useseparators":
        state.useSeparators = Boolean(property.value);
        break;
      case "showtarget":
        state.showTarget = Boolean(property.value);
        break;
      case "showdotgrid":
        state.showDotGrid = Boolean(property.value);
        break;
      case "griddiameterpct":
        state.gridDiameterPct = Number(property.value) || 90;
        break;
      case "tickanimation":
        state.tickAnimation = Boolean(property.value);
        break;
      case "sizebias":
        state.sizeBias = Number(property.value) || 100;
        break;
      case "positionpreset":
        state.positionPreset = resolvePositionPreset(property.value);
        break;
      default:
        break;
    }
  }

  function applyUserProperties(properties) {
    Object.keys(properties).forEach((key) => {
      mergePropertyValue(key, properties[key]);
    });
    render();
  }

  window.wallpaperPropertyListener = {
    applyUserProperties,
  };

  window.addEventListener("resize", () => {
    fitNumber();
    updateGridMask();
  });

  document.addEventListener("DOMContentLoaded", () => {
    const parsedDefault = parseTargetDate(DEFAULT_TARGET);
    state.lastValidTarget = parsedDefault;
    state.effectiveTarget = parsedDefault;
    render();
  });

  if (document.readyState !== "loading") {
    const parsedDefault = parseTargetDate(DEFAULT_TARGET);
    state.lastValidTarget = parsedDefault;
    state.effectiveTarget = parsedDefault;
    render();
  }
})();
