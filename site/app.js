import {
  MODE_CONFIG,
  buildRound,
  calculateScore,
} from "./game-data.js";

const ROUND_SECONDS = 20;
const HIGH_SCORE_KEY = "luskahz-dev-arcade-high-score";

const elements = {
  menu: document.querySelector("#menu-screen"),
  game: document.querySelector("#game-screen"),
  result: document.querySelector("#result-screen"),
  menuHighScore: document.querySelector("#menu-high-score"),
  score: document.querySelector("#score"),
  streak: document.querySelector("#streak"),
  roundCounter: document.querySelector("#round-counter"),
  timerBar: document.querySelector("#timer-bar"),
  timerValue: document.querySelector("#timer-value"),
  challengeMode: document.querySelector("#challenge-mode"),
  challengeTitle: document.querySelector("#challenge-title"),
  challengePrompt: document.querySelector("#challenge-prompt"),
  challengeCode: document.querySelector("#challenge-code"),
  options: document.querySelector("#options"),
  feedback: document.querySelector("#feedback"),
  feedbackTitle: document.querySelector("#feedback-title"),
  feedbackText: document.querySelector("#feedback-text"),
  nextButton: document.querySelector("#next-button"),
  exitButton: document.querySelector("#exit-button"),
  finalScore: document.querySelector("#final-score"),
  resultMessage: document.querySelector("#result-message"),
  correctTotal: document.querySelector("#correct-total"),
  bestStreak: document.querySelector("#best-streak"),
  resultHighScore: document.querySelector("#result-high-score"),
  restartButton: document.querySelector("#restart-button"),
  shareButton: document.querySelector("#share-button"),
};

const state = {
  mode: null,
  challenges: [],
  index: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  correct: 0,
  remainingSeconds: ROUND_SECONDS,
  timerId: null,
  locked: false,
};

function formatScore(score) {
  return Math.max(score, 0).toString().padStart(5, "0");
}

function readHighScore() {
  const stored = Number.parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? "0", 10);
  return Number.isFinite(stored) ? stored : 0;
}

function writeHighScore(score) {
  const highScore = Math.max(readHighScore(), score);
  localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  return highScore;
}

function showScreen(target) {
  for (const screen of [elements.menu, elements.game, elements.result]) {
    const active = screen === target;
    screen.hidden = !active;
    screen.classList.toggle("screen--active", active);
  }
}

function clearTimer() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateHud() {
  elements.score.textContent = formatScore(state.score);
  elements.streak.textContent = `x${state.streak}`;
  elements.roundCounter.textContent = `${state.index + 1}/${state.challenges.length}`;
  elements.timerValue.textContent = String(state.remainingSeconds).padStart(2, "0");
  elements.timerBar.style.width = `${(state.remainingSeconds / ROUND_SECONDS) * 100}%`;
  elements.timerBar.classList.toggle("timer__bar--danger", state.remainingSeconds <= 5);
}

function startTimer() {
  clearTimer();
  state.remainingSeconds = ROUND_SECONDS;
  updateHud();

  state.timerId = window.setInterval(() => {
    state.remainingSeconds -= 1;
    updateHud();

    if (state.remainingSeconds <= 0) {
      clearTimer();
      resolveAnswer(null);
    }
  }, 1000);
}

function renderChallenge() {
  const challenge = state.challenges[state.index];
  const config = MODE_CONFIG[state.mode];

  state.locked = false;
  elements.challengeMode.textContent =
    state.mode === "mixed" ? MODE_CONFIG[challenge.mode].label : config.label;
  elements.challengeTitle.textContent = challenge.title;
  elements.challengePrompt.textContent = challenge.prompt;
  elements.challengeCode.textContent = challenge.code;
  elements.options.replaceChildren();
  elements.feedback.hidden = true;
  elements.feedback.className = "feedback";
  elements.nextButton.hidden = true;

  challenge.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.className = "option-button";
    button.type = "button";
    button.dataset.option = String(index);

    const shortcut = document.createElement("span");
    shortcut.className = "option-button__shortcut";
    shortcut.textContent = String(index + 1);

    const text = document.createElement("span");
    text.textContent = choice;

    button.append(shortcut, text);
    button.addEventListener("click", () => resolveAnswer(index));
    elements.options.append(button);
  });

  startTimer();
}

function resolveAnswer(selectedIndex) {
  if (state.locked) {
    return;
  }

  state.locked = true;
  clearTimer();

  const challenge = state.challenges[state.index];
  const isCorrect = selectedIndex === challenge.answer;

  if (isCorrect) {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.correct += 1;
    state.score += calculateScore({
      correct: true,
      remainingSeconds: state.remainingSeconds,
      streak: state.streak,
    });
  } else {
    state.streak = 0;
  }

  [...elements.options.children].forEach((button, index) => {
    button.disabled = true;
    if (index === challenge.answer) {
      button.classList.add("option-button--correct");
    } else if (index === selectedIndex) {
      button.classList.add("option-button--wrong");
    }
  });

  elements.feedback.hidden = false;
  elements.feedback.classList.add(
    isCorrect ? "feedback--correct" : "feedback--wrong",
  );
  elements.feedbackTitle.textContent = isCorrect
    ? "✓ RESPOSTA CORRETA"
    : selectedIndex === null
      ? "⌛ TEMPO ESGOTADO"
      : "✕ RESPOSTA INCORRETA";
  elements.feedbackText.textContent = challenge.explanation;
  elements.nextButton.hidden = false;
  elements.nextButton.textContent =
    state.index === state.challenges.length - 1
      ? "VER RESULTADO →"
      : "PRÓXIMO DESAFIO →";

  updateHud();
  elements.nextButton.focus();
}

function nextChallenge() {
  if (!state.locked) {
    return;
  }

  if (state.index >= state.challenges.length - 1) {
    finishRun();
    return;
  }

  state.index += 1;
  renderChallenge();
}

function startRun(mode) {
  clearTimer();
  state.mode = mode;
  state.challenges = buildRound(mode);
  state.index = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.correct = 0;
  state.locked = false;

  showScreen(elements.game);
  renderChallenge();
}

function finishRun() {
  clearTimer();
  const highScore = writeHighScore(state.score);
  const ratio = state.correct / state.challenges.length;

  elements.finalScore.textContent = formatScore(state.score);
  elements.correctTotal.textContent = `${state.correct}/${state.challenges.length}`;
  elements.bestStreak.textContent = `x${state.bestStreak}`;
  elements.resultHighScore.textContent = formatScore(highScore);
  elements.resultMessage.textContent =
    ratio === 1
      ? "Run perfeito. Nenhum bug passou pelo review."
      : ratio >= 0.67
        ? "Boa leitura técnica. Ainda há alguns edge cases escondidos."
        : "O compilador foi honesto. Rode de novo e leia cada detalhe.";

  elements.menuHighScore.textContent = formatScore(highScore);
  showScreen(elements.result);
  elements.restartButton.focus();
}

function returnToMenu() {
  clearTimer();
  elements.menuHighScore.textContent = formatScore(readHighScore());
  showScreen(elements.menu);
}

async function copyScore() {
  const text = `Fiz ${state.score} pontos no Luskahz Dev Arcade (${state.correct}/${state.challenges.length} acertos).`;

  try {
    await navigator.clipboard.writeText(text);
    elements.shareButton.textContent = "COPIED ✓";
  } catch {
    elements.shareButton.textContent = "COPY FAILED";
  }

  window.setTimeout(() => {
    elements.shareButton.textContent = "COPY SCORE";
  }, 1600);
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => startRun(button.dataset.mode));
});

elements.nextButton.addEventListener("click", nextChallenge);
elements.exitButton.addEventListener("click", returnToMenu);
elements.restartButton.addEventListener("click", () => startRun(state.mode));
elements.shareButton.addEventListener("click", copyScore);

document.addEventListener("keydown", (event) => {
  if (elements.game.hidden) {
    return;
  }

  if (!state.locked && ["1", "2", "3", "4"].includes(event.key)) {
    const option = elements.options.querySelector(
      `[data-option="${Number(event.key) - 1}"]`,
    );
    option?.click();
  } else if (state.locked && event.key === "Enter") {
    nextChallenge();
  } else if (event.key === "Escape") {
    returnToMenu();
  }
});

elements.menuHighScore.textContent = formatScore(readHighScore());
