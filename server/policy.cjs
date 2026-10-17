const { textField, GuardError } = require('./ai-guard.cjs');
const policy = { scope: 'literacy-tts', perMinute: 120, perDay: 3000, concurrent: 6, maxBodyBytes: 16384,
  validate(body, req) {
    const input = req.method === 'GET' ? Object.fromEntries(new URL(req.url).searchParams) : body;
    textField(input, 'text', 500, true); textField(input, 'voice', 80);
    if (input.speed !== undefined && input.speed !== '' && (!Number.isFinite(Number(input.speed)) || Number(input.speed) < 0.5 || Number(input.speed) > 2)) throw new GuardError(400, 'BAD_INPUT', 'Invalid speed');
  }
};
module.exports = { policy };
