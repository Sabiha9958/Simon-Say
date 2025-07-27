// --- Simon Says Game Logic & UI ---
const PAD_COLORS = ["pad0", "pad1", "pad2", "pad3"];
const BTN_FREQS = [330, 220, 550, 700]; // different frequencies per pad

// DOM refs
const board = document.getElementById("game-board");
const msg = document.getElementById("message");
const levelLbl = document.getElementById("current-level");
const bestLbl = document.getElementById("best-score");
const settingsBtn = document.getElementById("open-settings");
const settingsPanel = document.getElementById("settings-panel");
const closeSettingsBtn = document.getElementById("close-settings");
const overlay = document.getElementById("settings-overlay");
const themeSel = document.getElementById("theme-select");
const difficultySel = document.getElementById("difficulty-select");
const volSlider = document.getElementById("volume-slider");
const speedSlider = document.getElementById("speed-slider");
const speedValue = document.getElementById("speed-value");
const bodyElem = document.body;

const GAME_SETTINGS = {
  theme: "default",
  difficulty: "medium",
  volume: 80,
  speed: 700,
};

// Persistence keys
const STORAGE_KEY_SETTINGS = "simon_settings_enhanced_v1";
const STORAGE_KEY_BEST = "simon_best_enhanced_v1";

// Audio
let audioCtx = null;

// State
let sequence = [];
let userStep = 0;
let level = 1;
let best = 0;
let acceptingInput = false;
let playingSequence = false;

// --- UI Setup ---
function createPads() {
  for (let i = 0; i < 4; ++i) {
    const btn = document.createElement("button");
    btn.tabIndex = 0;
    btn.className = `simon-pad ${PAD_COLORS[i]}`;
    btn.dataset.idx = i;
    btn.setAttribute("aria-label", `Pad ${i + 1}`);
    board.appendChild(btn);
  }
}
createPads();

function showMsg(text, color = "#444") {
  msg.style.color = color;
  msg.innerText = text;
}
function updateLevelDisplay() {
  levelLbl.textContent = `Level: ${level}`;
}
function updateBestDisplay() {
  bestLbl.textContent = `Best: ${best}`;
}
function displaySpeedValue() {
  speedValue.textContent = `${GAME_SETTINGS.speed}ms`;
}

// --- Settings ---
function saveSettings() {
  localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(GAME_SETTINGS));
}
function loadSettings() {
  const s = localStorage.getItem(STORAGE_KEY_SETTINGS);
  if (!s) return;
  try {
    Object.assign(GAME_SETTINGS, JSON.parse(s));
  } catch {
    // ignore parse errors
  }
}
function saveBest(score) {
  best = Math.max(best, score);
  localStorage.setItem(STORAGE_KEY_BEST, best);
}
function loadBest() {
  best = +localStorage.getItem(STORAGE_KEY_BEST) || 0;
}

// --- Audio ---
function setupAudioContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}
function playTone(idx, dur = GAME_SETTINGS.speed * 0.6) {
  setupAudioContext();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = BTN_FREQS[idx];
  gain.gain.value = GAME_SETTINGS.volume / 100;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur / 1000);
  osc.onended = () => {
    gain.disconnect();
  };
}

// --- Game Difficulty Profiles ---
const DIFFICULTY_CFG = {
  easy: { inc: 1, speed: 850 },
  medium: { inc: 1, speed: 650 },
  hard: { inc: 2, speed: 500 },
};
function updateDifficultyProfile() {
  const d = difficultySel.value;
  const profile = DIFFICULTY_CFG[d];
  if (profile) {
    speedSlider.value = profile.speed;
    GAME_SETTINGS.speed = +speedSlider.value;
    displaySpeedValue();
  }
}

// --- Theme Switching ---
function applyTheme(theme) {
  bodyElem.classList.remove(
    ...Array.from(bodyElem.classList).filter(
      (cls) => cls.startsWith("theme-") || cls === "theme-default"
    )
  );
  if (theme === "default") {
    bodyElem.classList.add("theme-default");
  } else {
    bodyElem.classList.add(`theme-${theme}`);
  }
}

// --- Settings Panel Logic ---
function openSettings() {
  settingsPanel.classList.add("open");
  settingsPanel.setAttribute("aria-hidden", "false");
  overlay.classList.add("active");

  // Sync UI elements
  themeSel.value = GAME_SETTINGS.theme;
  difficultySel.value = GAME_SETTINGS.difficulty;
  volSlider.value = GAME_SETTINGS.volume;
  speedSlider.value = GAME_SETTINGS.speed;
  displaySpeedValue();

  // Focus settings panel (for keyboard users)
  settingsPanel.focus();
}
function closeSettings() {
  settingsPanel.classList.remove("open");
  settingsPanel.setAttribute("aria-hidden", "true");
  overlay.classList.remove("active");
  saveSettings();
  board.focus();
}

// Listeners
settingsBtn.onclick = openSettings;
closeSettingsBtn.onclick = closeSettings;
overlay.onclick = closeSettings;

themeSel.oninput = () => {
  GAME_SETTINGS.theme = themeSel.value;
  applyTheme(GAME_SETTINGS.theme);
  saveSettings();
};
difficultySel.oninput = () => {
  GAME_SETTINGS.difficulty = difficultySel.value;
  updateDifficultyProfile();
  saveSettings();
};
volSlider.oninput = () => {
  GAME_SETTINGS.volume = +volSlider.value;
  saveSettings();
};
speedSlider.oninput = () => {
  GAME_SETTINGS.speed = +speedSlider.value;
  displaySpeedValue();
  saveSettings();
};

// --- Keyboard support (keys 1-4) ---
document.addEventListener("keydown", (evt) => {
  if (!acceptingInput) return;
  if (evt.target.tagName === "INPUT" || evt.target.tagName === "SELECT") return;
  const k = evt.key;
  if (k >= "1" && k <= "4") {
    handlePadInput(+k - 1);
    const padBtns = board.querySelectorAll(".simon-pad");
    const btn = padBtns[+k - 1];
    btn.classList.add("active", "pressed");
    setTimeout(() => {
      btn.classList.remove("active", "pressed");
    }, 250);
  }
});

// --- Main Game Logic ---
function getRandomPad() {
  return Math.floor(Math.random() * 4);
}
function startGame() {
  sequence = [];
  level = 1;
  updateLevelDisplay();
  showMsg("Watch the sequence!");
  addStep();
}

function addStep() {
  const diff = GAME_SETTINGS.difficulty;
  const count = DIFFICULTY_CFG[diff]?.inc || 1;
  for (let i = 0; i < count; ++i) sequence.push(getRandomPad());
  userStep = 0;
  updateLevelDisplay();
  setTimeout(playSequence, 800);
}

function playSequence() {
  playingSequence = true;
  let i = 0;
  showMsg("Watch the sequence!");
  acceptingInput = false;

  function step() {
    if (i >= sequence.length) {
      playingSequence = false;
      showMsg("Your turn!");
      acceptingInput = true;
      return;
    }
    const idx = sequence[i];
    highlightPad(idx);
    playTone(idx, GAME_SETTINGS.speed);
    setTimeout(() => {
      unhighlightPad(idx);
      setTimeout(step, 140);
    }, GAME_SETTINGS.speed);
    i++;
  }
  step();
}

function highlightPad(idx) {
  const btn = board.children[idx];
  btn.classList.add("active", "pressed");
}
function unhighlightPad(idx) {
  const btn = board.children[idx];
  btn.classList.remove("active", "pressed");
}

function handlePadInput(idx) {
  if (!acceptingInput || playingSequence) return;
  highlightPad(idx);
  playTone(idx, 180);
  setTimeout(() => unhighlightPad(idx), 250);
  if (idx === sequence[userStep]) {
    userStep++;
    if (userStep === sequence.length) {
      acceptingInput = false;
      saveBest(level);
      updateBestDisplay();
      showMsg("🎉 Great! Next round...");
      setTimeout(() => {
        level++;
        addStep();
      }, 1300);
    }
  } else {
    acceptingInput = false;
    showMsg("❌ Game Over! Click any pad to start again.", "#c92a2a");
    saveBest(level - 1);
    updateBestDisplay();

    // Restart on pad click
    board.onclick = (e) => {
      if (e.target.classList.contains("simon-pad")) {
        board.onclick = null;
        startGame();
      }
    };
  }
}

// Register pad events with ripple effect
board.querySelectorAll(".simon-pad").forEach((btn, idx) => {
  btn.onclick = () => handlePadInput(idx);

  btn.addEventListener("pointerdown", (e) => {
    btn.classList.add("pressed");
    // Ripple effect
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    ripple.className = "ripple-effect";
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
  btn.addEventListener("pointerup", () => btn.classList.remove("pressed"));
  btn.addEventListener("pointerleave", () => btn.classList.remove("pressed"));
});

// --- Initialization ---
function init() {
  loadSettings();
  loadBest();
  updateBestDisplay();
  applyTheme(GAME_SETTINGS.theme);
  themeSel.value = GAME_SETTINGS.theme;
  difficultySel.value = GAME_SETTINGS.difficulty;
  volSlider.value = GAME_SETTINGS.volume;
  speedSlider.value = GAME_SETTINGS.speed;
  displaySpeedValue();
  updateDifficultyProfile();
  showMsg("Click any colored pad to start!");
  // Touch devices: require user gesture to unlock AudioContext
  board.onclick = () => {
    board.onclick = null;
    startGame();
  };
}
init();
