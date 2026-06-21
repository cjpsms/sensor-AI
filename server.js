#!/usr/bin/env node
const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execFile, spawnSync } = require('child_process');

const PORT  = 24693;
const CREDS = path.join(process.env.HOME, '.claude', '.credentials.json');
const DIR   = __dirname;
const STATE_FILE = path.join(DIR, 'data.json');

// 'real' (wait for the actual Pico W) | 'fake' (synthetic generator, for
// testing the AI/UI without hardware) — declared early so persist()/
// loadPersisted() can reference it before its functional home further down.
let dataMode = 'real';

// ── Allowed CORS origins (this is a local-only app served from one host) ───
const ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
]);
function corsOrigin(req) {
  const origin = req.headers.origin;
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : `http://127.0.0.1:${PORT}`;
}

// ── Request body size limits ────────────────────────────────────────────────
const MAX_JSON_BODY  = 512 * 1024;        // 512 KB — chat/classify/ac/calendar/pico payloads
const MAX_AUDIO_BODY = 15 * 1024 * 1024;  // 15 MB  — STT audio upload

// Collects a request body up to maxBytes; sends 413 and aborts if exceeded.
function readBody(req, res, maxBytes, onComplete) {
  const chunks = [];
  let size = 0;
  let aborted = false;
  req.on('data', chunk => {
    if (aborted) return;
    size += chunk.length;
    if (size > maxBytes) {
      aborted = true;
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload too large' }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    onComplete(Buffer.concat(chunks));
  });
}

// Asia/Bangkok is a fixed UTC+7 offset (no DST) — compute weekly reminder
// triggers in Bangkok wall-clock time so they fire correctly regardless of
// what timezone the server's system clock is set to.
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

// ── Claude auth — 2 modes ──────────────────────────────────────────────────
// CLAUDE_MODE=cli (default) → reuse the Claude CLI's own OAuth token (`claude login`), no separate billing.
// CLAUDE_MODE=api           → use a standalone Anthropic API key (ANTHROPIC_API_KEY), billed on its own.
const CLAUDE_MODE = (process.env.CLAUDE_MODE || 'cli').toLowerCase();

function getCliToken() {
  try {
    const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'));
    const tok = c?.claudeAiOauth?.accessToken;
    const exp = c?.claudeAiOauth?.expiresAt;
    if (!tok) return { error: 'ไม่เจอ accessToken — รัน `claude` เพื่อ login ก่อนนะคะ' };
    if (exp && Date.now() >= exp) return { error: 'Token หมดอายุแล้ว — รัน `claude` เพื่อ refresh ค่ะ' };
    return { token: tok };
  } catch (e) {
    return { error: 'อ่านไฟล์ credentials ไม่ได้: ' + e.message };
  }
}

// Returns Anthropic auth headers for the active mode, or { error }.
function getAuthHeaders() {
  if (CLAUDE_MODE === 'api') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { error: 'ไม่เจอ ANTHROPIC_API_KEY — ตั้งค่า env var ก่อนนะคะ (CLAUDE_MODE=api)' };
    return { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } };
  }
  const { token, error } = getCliToken();
  if (error) return { error };
  return { headers: { 'Authorization': `Bearer ${token}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'oauth-2025-04-20' } };
}

// ── Proxy → api.anthropic.com/v1/messages ────────────────────────────────
function proxyAnthropic(bodyStr, res, req) {
  const { headers: authHeaders, error } = getAuthHeaders();
  if (error) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error }));
    return;
  }

  const data = Buffer.from(bodyStr, 'utf8');
  const opts = {
    hostname: 'api.anthropic.com',
    path:     '/v1/messages',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': data.length,
      ...authHeaders,
    },
  };

  const apiReq = https.request(opts, apiRes => {
    res.writeHead(apiRes.statusCode, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': corsOrigin(req),
    });
    apiRes.pipe(res);
  });

  apiReq.on('error', err => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });

  apiReq.write(data);
  apiReq.end();
}

// ── STT  (faster-whisper large-v3-turbo, ผ่าน distrobox ubuntu) ──────────
function handleSTT(audioBuffer, res, req) {
  const tmp = path.join(os.tmpdir(), `hana-stt-${Date.now()}.webm`);
  fs.writeFile(tmp, audioBuffer, err => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    const args = ['ubuntu', '--', 'python3',
      path.join(DIR, 'stt.py'), tmp];
    execFile('distrobox-enter', args, { timeout: 60000 }, (err, stdout, stderr) => {
      fs.unlink(tmp, () => {});
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: stderr || err.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin(req) });
      res.end(JSON.stringify({ text: stdout.trim() }));
    });
  });
}

// ── Edge TTS  (runs inside distrobox ubuntu) ──────────────────────────────
// Resolved once at startup (not per-request) and checked executable so a
// missing/misconfigured binary fails loudly at boot instead of silently
// per-request, and so the path isn't re-derived from env on every call.
const EDGE_TTS_BIN = path.join(process.env.HOME, '.local', 'bin', 'edge-tts');
try {
  fs.accessSync(EDGE_TTS_BIN, fs.constants.X_OK);
} catch {
  console.warn(`[WARN] edge-tts not found/executable at ${EDGE_TTS_BIN} — TTS requests will fail`);
}

function handleTTS(bodyStr, res, req) {
  let payload;
  try { payload = JSON.parse(bodyStr); } catch { payload = {}; }

  const text  = (payload.text  || '').trim();
  const voice = payload.voice  || 'th-TH-PremwadeeNeural';

  if (!text) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'no text' }));
    return;
  }

  const tmp = path.join(os.tmpdir(), `hana-tts-${Date.now()}.mp3`);
  const args = ['--voice', voice, '--text', text, '--write-media', tmp];
  execFile(EDGE_TTS_BIN, args, (err) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    fs.readFile(tmp, (err2, data) => {
      fs.unlink(tmp, () => {});
      if (err2) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err2.message }));
        return;
      }
      res.writeHead(200, {
        'Content-Type':                'audio/mpeg',
        'Content-Length':              data.length,
        'Access-Control-Allow-Origin': corsOrigin(req),
      });
      res.end(data);
    });
  });
}

// ── Intent Classifier ─────────────────────────────────────────────────────
// Layer 1: rule-based (0ms) — wake word "Neko"/"เนโกะ" (or close mishearings) = always yes, skip AI entirely
// Layer 2: Claude Haiku — only for ambiguous cases that don't contain the wake word

// Covers EN "neko" and TH "เนโกะ" plus common STT near-misses (เนะโกะ, เน็กโกะ, เนโก, เนโกะะ)
const WAKE_WORD_RE = /neko|เน[ะ็]?โก[ะาๆ]*/i;

function hasWakeWord(text) {
  return WAKE_WORD_RE.test(text || '');
}

function classifyViaHaiku(text, lastAiMessage, cb) {
  const { headers: authHeaders, error } = getAuthHeaders();
  if (error) { cb('yes'); return; }

  let system = 'Answer yes or no only.\nyes=question or command clearly directed at an AI assistant. This includes ANY mention of: temperature, humidity, CO2, carbon footprint or carbon emissions, AC/air conditioner control or schedule or timer, time, or any direct question/command, OR any address/mention of the assistant by name ("Neko"/"เนโกะ" or a close mishearing of that name).\nno=anything else: talking to humans, ambient speech, statements, unclear context.\nWhen unsure about topic words or the name above, answer yes. Otherwise when unsure, answer no.';
  if (lastAiMessage) {
    system += `\n\nOVERRIDE: The AI just said: "${lastAiMessage}"\nIf the user text is a direct reply or answer to that, answer yes.`;
  }

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 5,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: text }],
  });

  const data = Buffer.from(body, 'utf8');
  const req = https.request({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': data.length,
      ...authHeaders,
    },
    timeout: 5000,
  }, apiRes => {
    let raw = '';
    apiRes.on('data', c => (raw += c));
    apiRes.on('end', () => {
      try {
        const txt = JSON.parse(raw).content[0].text.toLowerCase();
        cb(txt.startsWith('no') ? 'no' : 'yes');
      } catch { cb('yes'); }
    });
  });
  req.on('error', () => cb('yes'));
  req.on('timeout', () => { req.destroy(); cb('yes'); });
  req.write(data); req.end();
}

function classifyIntent(text, lastAiMessage, res, req) {
  const reply = (respond) => {
    res.writeHead(200, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':corsOrigin(req) });
    res.end(JSON.stringify({ respond }));
  };

  // Layer 1: wake word present → respond, no AI call needed
  if (hasWakeWord(text)) { reply(true); return; }

  classifyViaHaiku(text, lastAiMessage, result => reply(result === 'yes'));
}

// ── AC State & Control ────────────────────────────────────────────────────
const acState = {
  on:   false,
  mode: 'manual',          // 'manual' | 'auto' | 'schedule'
  auto: { tempOn: 26.0, tempOff: 24.0, co2On: 900 },
  schedule: null,          // { triggerAt: ms, action: 'on'|'off' }
  log:  [],
};

function acLog(msg) {
  const entry = { time: new Date().toLocaleTimeString('th-TH'), msg };
  acState.log.unshift(entry);
  if (acState.log.length > 20) acState.log.pop();
  console.log('[AC]', entry.time, msg);
}

function setAC(on, reason) {
  if (acState.on === on) return;
  acState.on = on;
  acLog(`${on ? '🟢 เปิด' : '🔴 ปิด'} แอร์ — ${reason}`);
  // Real hardware command: queue it for the Pico W to execute, same path
  // the browser's manual device toggle uses (handlePico's /api/pico/command).
  picoState.devices.ac = on;
  picoState.commands.push({ device: 'ac', value: on });
  persist();
}

// Current sensor reading used by auto-mode, with a safe fallback if the
// Pico hasn't reported anything yet (e.g. right after server start).
function currentReading() {
  const s = picoState.sensor;
  return {
    temp: s.temp ?? 26.0,
    co2:  s.co2  ?? 600,
  };
}

// Auto-control tick (every 30 s)
setInterval(() => {
  if (acState.mode !== 'auto') return;
  const { temp, co2 } = currentReading();
  if (!acState.on && (temp >= acState.auto.tempOn || co2 >= acState.auto.co2On))
    setAC(true,  `auto: temp ${temp}°C / CO2 ${co2}ppm`);
  else if (acState.on && temp <= acState.auto.tempOff)
    setAC(false, `auto: temp ลดลง ${temp}°C`);
}, 30_000);

// Schedule tick (every 5 s)
setInterval(() => {
  if (!acState.schedule) return;
  if (Date.now() >= acState.schedule.triggerAt) {
    setAC(acState.schedule.action === 'on', `schedule ถึงเวลาแล้ว`);
    acState.schedule = null;
    persist();
  }
}, 5_000);

function handleAC(method, bodyStr, res, req) {
  const reply = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin(req) });
    res.end(JSON.stringify(obj));
  };

  if (method === 'GET') {
    reply({ ...acState });
    return;
  }

  let body;
  try { body = JSON.parse(bodyStr); } catch { body = {}; }

  if (body.mode)    acState.mode = body.mode;
  if (body.auto)    Object.assign(acState.auto, body.auto);

  if (body.mode === 'manual' && body.on !== undefined)
    setAC(body.on, 'manual');

  if (body.mode === 'schedule' && body.schedule) {
    const { offsetMs, action } = body.schedule;   // offsetMs = ms from now
    acState.schedule = { triggerAt: Date.now() + offsetMs, action };
    acLog(`📅 ตั้งเวลา ${action === 'on' ? 'เปิด' : 'ปิด'} ในอีก ${Math.round(offsetMs/60000)} นาที`);
  }

  if (body.cancelSchedule) {
    acState.schedule = null;
    acLog('ยกเลิก schedule แล้วค่ะ');
  }

  if (body.mode === 'auto') {
    // run once immediately
    const { temp, co2 } = currentReading();
    if (temp >= acState.auto.tempOn || co2 >= acState.auto.co2On)
      setAC(true,  `auto init: temp ${temp}°C`);
    else
      setAC(false, `auto init: ปกติ`);
  }

  persist();
  reply({ ...acState });
}

// ── Calendar reminders (one-time + weekly recurring) ──────────────────────────
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const calendarState = {
  reminders: [],   // { id, message, type:'once'|'weekly', triggerAt, weekday, hour, minute }
  fired:     [],   // messages due for the client to announce (drained on poll)
};

function nextWeeklyTrigger(weekday, hour, minute, fromMs = Date.now()) {
  const bkkNow = fromMs + BKK_OFFSET_MS;
  const target = new Date(bkkNow);
  target.setUTCHours(hour, minute, 0, 0);
  let diffDays = (weekday - target.getUTCDay() + 7) % 7;
  if (diffDays === 0 && target.getTime() <= bkkNow) diffDays = 7;
  target.setUTCDate(target.getUTCDate() + diffDays);
  return target.getTime() - BKK_OFFSET_MS;
}

// ── Persistence: AC mode/schedule + calendar reminders survive restarts ────
function persist() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      ac: { mode: acState.mode, auto: acState.auto, schedule: acState.schedule, on: acState.on },
      reminders: calendarState.reminders,
      dataMode,
    }));
  } catch (e) {
    console.warn('[WARN] failed to persist state:', e.message);
  }
}

function loadPersisted() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (saved.ac) Object.assign(acState, saved.ac);
    if (Array.isArray(saved.reminders)) calendarState.reminders = saved.reminders;
    if (saved.dataMode === 'real' || saved.dataMode === 'fake') dataMode = saved.dataMode;
  } catch {
    // no saved state yet — start fresh
  }
}
loadPersisted();

function addReminder({ message, type, datetime, weekday, time }) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);

  if (type === 'once') {
    const triggerAt = new Date(datetime).getTime();
    if (isNaN(triggerAt)) return { error: 'invalid datetime' };
    calendarState.reminders.push({ id, message, type: 'once', triggerAt });
    return { id, triggerAt };
  }

  if (type === 'weekly') {
    const wd = WEEKDAYS.indexOf(String(weekday).toLowerCase());
    if (wd === -1) return { error: 'invalid weekday' };
    const [hour, minute] = String(time).split(':').map(n => parseInt(n, 10));
    if (isNaN(hour) || isNaN(minute)) return { error: 'invalid time' };
    const triggerAt = nextWeeklyTrigger(wd, hour, minute);
    calendarState.reminders.push({ id, message, type: 'weekly', weekday: wd, hour, minute, triggerAt });
    return { id, triggerAt };
  }

  return { error: 'invalid type' };
}

// Reminder tick (every 10 s)
setInterval(() => {
  const now = Date.now();
  const before = calendarState.reminders.length;
  let fired = false;
  calendarState.reminders = calendarState.reminders.filter(r => {
    if (now < r.triggerAt) return true;
    fired = true;
    calendarState.fired.push(r.message);
    if (r.type === 'weekly') {
      r.triggerAt = nextWeeklyTrigger(r.weekday, r.hour, r.minute, now + 1000);
      return true;   // keep recurring reminder, rescheduled for next week
    }
    return false;     // one-time reminder consumed
  });
  if (fired || calendarState.reminders.length !== before) persist();
}, 10_000);

function handleCalendar(method, bodyStr, res, req) {
  const reply = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin(req) });
    res.end(JSON.stringify(obj));
  };

  if (method === 'GET') {
    const fired = calendarState.fired.splice(0);   // drain queue
    reply({ reminders: calendarState.reminders, fired });
    return;
  }

  let body;
  try { body = JSON.parse(bodyStr); } catch { body = {}; }

  if (body.cancel) {
    const before = calendarState.reminders.length;
    calendarState.reminders = body.cancel === 'all'
      ? []
      : calendarState.reminders.filter(r => r.id !== body.cancel && !r.message.includes(body.cancel));
    persist();
    reply({ removed: before - calendarState.reminders.length, reminders: calendarState.reminders });
    return;
  }

  const result = addReminder(body);
  persist();
  reply({ ...result, reminders: calendarState.reminders });
}

// ── Pico W bridge ─────────────────────────────────────────────────────────────
const picoState = {
  sensor:   { temp: null, humidity: null, co2: null, light: null, sound: null, updatedAt: null },
  devices:  { led: false, ac: false, door: false, solar: false },  // last-known on/off
  commands: [],          // queue of pending commands for Pico to execute
  online:   false,       // true once Pico has talked to us recently
  lastSeen: null,
};

// Rolling history for the "now" graph — last 120 readings (~20 min at 10s)
const picoHistory = [];
function pushHistory(s) {
  picoHistory.push({ t: Date.now(), temp: s.temp, humidity: s.humidity, co2: s.co2, light: s.light, sound: s.sound });
  if (picoHistory.length > 120) picoHistory.shift();
}

// ── Data mode: 'real' (wait for the actual Pico W) | 'fake' (synthetic
// generator, for testing the AI/UI without hardware) ────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let fakeReading = { temp: 25.0, humidity: 50, co2: 600, light: 15000, sound: 8000 };

function stepFake() {
  const jitter = (v, amt) => v + (Math.random() - 0.5) * amt;
  fakeReading = {
    temp:     clamp(jitter(fakeReading.temp, 0.4),     20,  32),
    humidity: clamp(jitter(fakeReading.humidity, 2),   35,  70),
    co2:      clamp(jitter(fakeReading.co2, 40),       380, 1400),
    light:    clamp(jitter(fakeReading.light, 1500),   0,   30000),
    sound:    clamp(jitter(fakeReading.sound, 800),    0,   20000),
  };
  picoState.sensor = { ...fakeReading, updatedAt: new Date().toISOString() };
  pushHistory(picoState.sensor);
  picoState.online   = true;
  picoState.lastSeen = Date.now();
}

// Tick the generator every 10 s while in fake mode (same cadence as a real Pico push)
setInterval(() => { if (dataMode === 'fake') stepFake(); }, 10_000);

function setDataMode(mode) {
  if (mode !== 'real' && mode !== 'fake') return false;
  dataMode = mode;
  if (mode === 'fake') stepFake();   // seed data immediately, don't wait 10s
  persist();
  return true;
}

// If a saved 'fake' mode was restored from disk on boot, seed a reading now
// instead of leaving the sensor null until the first 10s tick.
if (dataMode === 'fake') stepFake();

function handlePico(req, res, body) {
  const reply = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin(req) });
    res.end(JSON.stringify(obj));
  };

  const markOnline = () => {
    picoState.online   = true;
    picoState.lastSeen = Date.now();
  };

  // Pico pushes sensor data — ignored while a fake-data test is running,
  // so a real device left plugged in can't clobber the synthetic readings.
  if (req.method === 'POST' && req.url === '/api/pico/sensor') {
    if (dataMode === 'fake') { reply({ ok: true, ignored: true, reason: 'fake data mode active' }); return true; }
    try {
      const d = JSON.parse(body);
      if (d.temp     !== undefined) picoState.sensor.temp     = d.temp;
      if (d.humidity !== undefined) picoState.sensor.humidity = d.humidity;
      if (d.co2      !== undefined) picoState.sensor.co2      = d.co2;
      if (d.light    !== undefined) picoState.sensor.light    = d.light;
      if (d.sound    !== undefined) picoState.sensor.sound    = d.sound;
      picoState.sensor.updatedAt = new Date().toISOString();
      pushHistory(picoState.sensor);
      markOnline();
      reply({ ok: true });
    } catch { reply({ ok: false }); }
    return true;
  }

  // Pico polls for commands (drains queue)
  if (req.method === 'GET' && req.url === '/api/pico/commands') {
    markOnline();
    const cmds = picoState.commands.splice(0);
    reply(cmds);
    return true;
  }

  // Browser pushes a device command → queued for Pico  { device, value }
  if (req.method === 'POST' && req.url === '/api/pico/command') {
    try {
      const cmd = JSON.parse(body);
      if (cmd.device && cmd.device in picoState.devices)
        picoState.devices[cmd.device] = !!cmd.value;   // optimistic state
      picoState.commands.push(cmd);
      reply({ ok: true, devices: picoState.devices });
    } catch { reply({ ok: false }); }
    return true;
  }

  // Browser reads live sensor values
  if (req.method === 'GET' && req.url === '/api/pico/sensor') {
    reply(picoState.sensor);
    return true;
  }

  // Browser reads full state (sensor + devices + online)
  if (req.method === 'GET' && req.url === '/api/pico/state') {
    // consider Pico offline if not seen for 30 s (skip the check in fake mode —
    // the generator keeps lastSeen fresh on its own 10s tick)
    if (dataMode === 'real' && picoState.lastSeen && Date.now() - picoState.lastSeen > 30_000)
      picoState.online = false;
    reply({ ...picoState, mode: dataMode });
    return true;
  }

  // Browser reads rolling history for the "now" graph
  if (req.method === 'GET' && req.url === '/api/pico/history') {
    reply(picoHistory);
    return true;
  }

  // Browser reads/sets the data mode ('real' | 'fake')
  if (req.method === 'GET' && req.url === '/api/mode') {
    reply({ mode: dataMode });
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/mode') {
    let m;
    try { m = JSON.parse(body).mode; } catch { m = null; }
    if (!setDataMode(m)) { reply({ ok: false, error: 'mode must be "real" or "fake"' }); return true; }
    reply({ ok: true, mode: dataMode });
    return true;
  }

  return false;
}

// ── Static file server ────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.wasm': 'application/wasm',
  '.moc3': 'application/octet-stream',
  '.map':  'application/json',
};

function serveStatic(req, res) {
  const url  = req.url.split('?')[0];
  let rel    = url.replace(/^\//, '') || 'index.html';
  let file   = path.join(DIR, rel);
  // serve index.html for directory URLs
  if (!path.extname(rel)) file = path.join(file, 'index.html');
  if (!file.startsWith(DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

// ── Main server ───────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  corsOrigin(req));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/chat') {
    readBody(req, res, MAX_JSON_BODY, buf => proxyAnthropic(buf.toString('utf8'), res, req));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/stt') {
    readBody(req, res, MAX_AUDIO_BODY, buf => handleSTT(buf, res, req));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/tts') {
    readBody(req, res, MAX_JSON_BODY, buf => handleTTS(buf.toString('utf8'), res, req));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/classify') {
    readBody(req, res, MAX_JSON_BODY, buf => {
      let text = '', lastAiMessage = '';
      try { const p = JSON.parse(buf.toString('utf8')); text = p.text || ''; lastAiMessage = p.lastAiMessage || ''; } catch {}
      classifyIntent(text, lastAiMessage, res, req);
    });
    return;
  }

  if (req.url === '/api/ac') {
    if (req.method === 'GET') { handleAC('GET', '', res, req); return; }
    if (req.method === 'POST') {
      readBody(req, res, MAX_JSON_BODY, buf => handleAC('POST', buf.toString('utf8'), res, req));
      return;
    }
  }

  if (req.url === '/api/calendar') {
    if (req.method === 'GET') { handleCalendar('GET', '', res, req); return; }
    if (req.method === 'POST') {
      readBody(req, res, MAX_JSON_BODY, buf => handleCalendar('POST', buf.toString('utf8'), res, req));
      return;
    }
  }

  if (req.url.startsWith('/api/pico') || req.url === '/api/mode') {
    readBody(req, res, MAX_JSON_BODY, buf => {
      if (!handlePico(req, res, buf.toString('utf8'))) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unknown pico route' }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/status') {
    const { headers, error } = getAuthHeaders();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: !!headers, mode: CLAUDE_MODE, error: error || null }));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  const { headers, error } = getAuthHeaders();
  console.log(`\nSensor AI  →  http://localhost:${PORT}`);
  console.log(`Claude mode: ${CLAUDE_MODE}  |  auth: ${headers ? '✓ OK' : '✗ ' + error}`);
  console.log('(Ctrl+C to stop)\n');
});
