const { newState, buildView, sendJson } = require('./_lib/game');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  sendJson(res, 200, buildView(newState()));
};
