const {
  parseToken,
  buildView,
  verifyCurrentCode,
  checkRateLimit,
  parseJsonBody,
  sendJson,
} = require('./_lib/game');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Bad request' });
    return;
  }

  const state = parseToken(body.sessionToken);
  if (!state) {
    sendJson(res, 401, { error: 'Session expired. Restart hunt.' });
    return;
  }

  if (checkRateLimit(state)) {
    sendJson(res, 429, { error: 'Too many attempts. Please wait a minute.' });
    return;
  }

  if (verifyCurrentCode(state, body.code)) {
    if (state.stage < Number.MAX_SAFE_INTEGER) {
      state.stage += 1;
    }

    const view = buildView(state);
    sendJson(res, 200, {
      ok: true,
      message: view.completed ? 'Correct. Hunt completed.' : 'Correct code. New hint unlocked.',
      ...view,
    });
    return;
  }

  const view = buildView(state);
  sendJson(res, 200, {
    ok: false,
    message: 'Wrong code. Try again.',
    ...view,
  });
};
