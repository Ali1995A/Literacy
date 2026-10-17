require('./route-loader.cjs');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let calls;
beforeEach(() => {
  globalThis[Symbol.for('family-ai.guard.v1')]?.clear();
  for (const k of Object.keys(process.env)) if (k.startsWith('AI_GUARD_') || k === 'AI_CALLS_ENABLED') delete process.env[k];
  process.env.ZHIPU_API_KEY = 'test-only-not-a-real-key'; calls = [];
  global.fetch = async (url, init) => { calls.push({url: String(url), init}); throw new Error('Unexpected network'); };
});
function req(body, method = 'POST') { return new Request('https://family.test/api/test', { method, ...(method === 'POST' ? {body: JSON.stringify(body)} : {}) }); }

const route = require('../src/app/api/tts/route.ts');
test('GET audio playback and POST use the same quota and preserve audio output', async () => {
  process.env.AI_GUARD_PER_DAY = '1';
  global.fetch = async (url, init) => { calls.push({url, init}); return new Response('audio-test', {headers:{'content-type':'audio/wav'}}); };
  const r = await route.GET(new Request('https://family.test/api/tts?text=hello'));
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'audio/wav');
  assert.equal((await route.POST(req({text:'hello'}))).status, 429); assert.equal(calls.length,1);
});
test('both GET and POST reject overlong text and invalid speed before charging', async () => {
  assert.equal((await route.GET(new Request('https://family.test/api/tts?text='+ 'x'.repeat(501)))).status,400);
  assert.equal((await route.POST(req({text:'x'.repeat(501)}))).status,400);
  assert.equal((await route.GET(new Request('https://family.test/api/tts?text=hello&speed=999'))).status,400);
  assert.equal((await route.POST(req({text:'hello',speed:999}))).status,400); assert.equal(calls.length,0);
});
test('normal POST retains fixed TTS model and default voice', async () => {
  global.fetch = async (url, init) => { calls.push({url,init}); return new Response('audio-test'); };
  assert.equal((await route.POST(req({text:'hello'}))).status,200);
  const body=JSON.parse(calls[0].init.body); assert.equal(body.model,'glm-tts'); assert.equal(body.voice,'tongtong');
});
