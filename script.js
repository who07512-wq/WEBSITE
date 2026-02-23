const hintText = document.getElementById('hintText');
const progressText = document.getElementById('progressText');
const progressFill = document.getElementById('progressFill');
const progressBar = document.querySelector('.progress-bar');
const form = document.getElementById('codeForm');
const input = document.getElementById('codeInput');
const message = document.getElementById('message');
const restartBtn = document.getElementById('restartBtn');

const state = {
  sessionToken: null,
  totalStages: 0,
  stageIndex: 0,
  completed: false,
};

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = 'message';
  if (type) message.classList.add(type);
}

function updateProgress(total, stageIndex, completed) {
  const safeTotal = Math.max(total, 1);
  const displayStage = completed ? safeTotal : Math.min(stageIndex + 1, safeTotal);
  const percent = (displayStage / safeTotal) * 100;

  progressText.textContent = `Hint ${displayStage} of ${safeTotal}`;
  progressFill.style.width = `${percent}%`;
  progressBar.setAttribute('aria-valuemax', String(safeTotal));
  progressBar.setAttribute('aria-valuenow', String(displayStage));
}

function applyView(payload) {
  state.sessionToken = payload.sessionToken ?? state.sessionToken;
  state.totalStages = payload.totalStages;
  state.stageIndex = payload.stageIndex;
  state.completed = payload.completed;

  updateProgress(state.totalStages, state.stageIndex, state.completed);
  hintText.textContent = payload.hint;

  if (state.completed) {
    form.hidden = true;
    restartBtn.hidden = false;
  } else {
    form.hidden = false;
    restartBtn.hidden = true;
    input.disabled = false;
    input.value = '';
    input.focus();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}

async function startGame() {
  input.disabled = true;
  setMessage('Starting hunt...');

  try {
    const payload = await api('/api/start');
    applyView(payload);
    setMessage('Hunt started.');
  } catch (error) {
    setMessage(error.message || 'Failed to start game.', 'err');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (state.completed) return;

  const code = input.value.trim();
  if (!code) {
    setMessage('Enter a code first.', 'err');
    return;
  }

  input.disabled = true;
  setMessage('Checking code...');

  try {
    const payload = await api('/api/submit', {
      method: 'POST',
      body: { sessionToken: state.sessionToken, code },
    });

    applyView(payload);
    setMessage(payload.message, payload.ok ? 'ok' : 'err');
    if (!state.completed) input.disabled = false;
  } catch (error) {
    input.disabled = false;
    setMessage(error.message || 'Validation failed.', 'err');
  }
});

restartBtn.addEventListener('click', async () => {
  setMessage('Restarting hunt...');
  try {
    const payload = await api('/api/restart', {
      method: 'POST',
      body: { sessionToken: state.sessionToken },
    });
    applyView(payload);
    setMessage('Hunt restarted.');
  } catch (error) {
    setMessage(error.message || 'Could not restart.', 'err');
  }
});

startGame();
