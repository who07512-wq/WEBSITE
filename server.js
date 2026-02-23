const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 8080);
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

const sessions = new Map();
const staticDir = __dirname;

function now() {
  return Date.now();
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function createSession(ip) {
  const id = crypto.randomBytes(24).toString('hex');
  const session = {
    id,
    stage: 0,
    attempts: [],
    createdAt: now(),
    updatedAt: now(),
    ip,
  };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;

  if (now() - session.updatedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }

  session.updatedAt = now();
  return session;
}

function cleanupSessions() {
  const t = now();
  for (const [id, session] of sessions.entries()) {
    if (t - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

setInterval(cleanupSessions, 60_000).unref();

function writeJson(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(data);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('Payload too large'));
        req.destroy();
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

function shouldRateLimit(session) {
  const cutoff = now() - 60_000;
  session.attempts = session.attempts.filter((ts) => ts >= cutoff);
  return session.attempts.length >= MAX_ATTEMPTS_PER_MINUTE;
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function sendSessionState(res, session) {
  const completed = session.stage >= stages.length;
  writeJson(res, 200, {
    sessionId: session.id,
    totalStages: stages.length,
    stageIndex: session.stage,
    completed,
    hint: completed ? 'You completed the treasure hunt. Well played.' : stages[session.stage].hint,
  });
}

const server = http.createServer(async (req, res) => {
  const reqPath = req.url ? req.url.split('?')[0] : '/';

  if (req.method === 'GET' && reqPath === '/api/start') {
    const session = createSession(clientIp(req));
    sendSessionState(res, session);
    return;
  }

  if (req.method === 'POST' && reqPath === '/api/restart') {
    try {
      const body = await readJsonBody(req);
      const oldSession = getSession(body.sessionId);
      if (oldSession) {
        sessions.delete(oldSession.id);
      }

      const session = createSession(clientIp(req));
      sendSessionState(res, session);
    } catch {
      writeJson(res, 400, { error: 'Bad request' });
    }
    return;
  }

  if (req.method === 'POST' && reqPath === '/api/submit') {
    try {
      const body = await readJsonBody(req);
      const session = getSession(body.sessionId);
      if (!session) {
        writeJson(res, 401, { error: 'Session expired. Restart hunt.' });
        return;
      }

      if (shouldRateLimit(session)) {
        writeJson(res, 429, { error: 'Too many attempts. Please wait a minute.' });
        return;
      }

      if (session.stage >= stages.length) {
        sendSessionState(res, session);
        return;
      }

      const candidate = normalizeCode(body.code);
      session.attempts.push(now());

      const stage = stages[session.stage];
      const actualHash = sha256Hex(`${stage.salt}:${candidate}:${PEPPER}`);

      if (actualHash !== stage.hash) {
        writeJson(res, 200, {
          ok: false,
          message: 'Wrong code. Try again.',
          stageIndex: session.stage,
          totalStages: stages.length,
          completed: false,
          hint: stage.hint,
        });
        return;
      }

      session.stage += 1;
      session.updatedAt = now();
      const completed = session.stage >= stages.length;

      writeJson(res, 200, {
        ok: true,
        message: completed ? 'Correct. Hunt completed.' : 'Correct code. New hint unlocked.',
        stageIndex: session.stage,
        totalStages: stages.length,
        completed,
        hint: completed ? 'You completed the treasure hunt. Well played.' : stages[session.stage].hint,
      });
    } catch {
      writeJson(res, 400, { error: 'Bad request' });
    }
    return;
  }

  if (req.method === 'GET' && reqPath === '/') {
    serveFile(res, path.join(staticDir, 'index.html'), 'text/html; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && reqPath === '/styles.css') {
    serveFile(res, path.join(staticDir, 'styles.css'), 'text/css; charset=utf-8');
    return;
  }

  if (req.method === 'GET' && reqPath === '/script.js') {
    serveFile(res, path.join(staticDir, 'script.js'), 'application/javascript; charset=utf-8');
    return;
  }

  writeJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`Treasure hunt server running on http://${HOST}:${PORT}`);
});
