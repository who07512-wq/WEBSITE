const crypto = require('crypto');

const PEPPER = process.env.TREASURE_PEPPER || 'change-this-pepper-before-real-event';
const SESSION_TTL_MS = 1000 * 60 * 30;
const MAX_ATTEMPTS_PER_MINUTE = 20;

const stages = [
  {
    hint: 'Start at the place where books sleep. Find the hidden card and enter that code.',
    salt: 'sA9!',
    hash: '5495d801f1955849b369f89c5e143afe1718aab6860afebc645db00c97c3f0b4',
  },
  {
    hint: 'Good move. Next clue: check the place where water stays cold.',
    salt: 'pQ2#',
    hash: 'f75e70d34e886a37ab19179fa542ee441a4ac598ef7c80a2e4b02786023a8c4b',
  },
  {
    hint: 'Nice. Third clue: look where keys usually hang.',
    salt: 'mN7$',
    hash: '0ecdcac5d90324b6b0d942d671aa5b4b69b80c94ac335dbf8a85e036c6062b72',
  },
  {
    hint: 'Final clue: check under the welcome mat.',
    salt: 'tX4%',
    hash: '0954413539db064660f4caf9344e82f553754477251b812dc1171db802a01bb0',
  },
];

function now() {
  return Date.now();
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function base64UrlEncode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', PEPPER).update(payloadB64).digest('base64url');
}

function createToken(state) {
  const payload = {
    stage: state.stage,
    exp: now() + SESSION_TTL_MS,
    windowStart: state.windowStart,
    windowCount: state.windowCount,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

function parseToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return null;
  }

  const stage = Number(payload.stage);
  const exp = Number(payload.exp);
  const windowStart = Number(payload.windowStart);
  const windowCount = Number(payload.windowCount);

  if (!Number.isInteger(stage) || stage < 0 || stage > stages.length) return null;
  if (!Number.isFinite(exp) || exp < now()) return null;
  if (!Number.isFinite(windowStart)) return null;
  if (!Number.isInteger(windowCount) || windowCount < 0) return null;

  return { stage, exp, windowStart, windowCount };
}

function newState() {
  return {
    stage: 0,
    windowStart: now(),
    windowCount: 0,
  };
}

function buildView(state) {
  const completed = state.stage >= stages.length;
  return {
    sessionToken: createToken(state),
    totalStages: stages.length,
    stageIndex: state.stage,
    completed,
    hint: completed ? 'You completed the treasure hunt. Well played.' : stages[state.stage].hint,
  };
}

function checkRateLimit(state) {
  const current = now();
  if (current - state.windowStart > 60_000) {
    state.windowStart = current;
    state.windowCount = 0;
  }

  if (state.windowCount >= MAX_ATTEMPTS_PER_MINUTE) {
    return true;
  }

  state.windowCount += 1;
  return false;
}

function verifyCurrentCode(state, userCode) {
  if (state.stage >= stages.length) {
    return true;
  }

  const stage = stages[state.stage];
  const actualHash = sha256Hex(`${stage.salt}:${normalizeCode(userCode)}:${PEPPER}`);
  return actualHash === stage.hash;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(payload);
}

module.exports = {
  stages,
  newState,
  parseToken,
  buildView,
  verifyCurrentCode,
  checkRateLimit,
  parseJsonBody,
  sendJson,
};
