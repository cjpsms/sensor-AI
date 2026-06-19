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

// ── Claude CLI token ──────────────────────────────────────────────────────
function getToken() {
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

// ── Proxy → api.anthropic.com/v1/messages ────────────────────────────────
function proxyAnthropic(bodyStr, res) {
  const { token, error } = getToken();
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
      'Content-Type':    'application/json',
      'Content-Length':  data.length,
      'Authorization':   `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':  'oauth-2025-04-20',
    },
  };

  const apiReq = https.request(opts, apiRes => {
    res.writeHead(apiRes.statusCode, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
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
function handleSTT(audioBuffer, res) {
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
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ text: stdout.trim() }));
    });
  });
}

// ── Edge TTS  (runs inside distrobox ubuntu) ──────────────────────────────
function handleTTS(bodyStr, res) {
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
  const edgeTts = process.env.HOME + '/.local/bin/edge-tts';
  const args = ['--voice', voice, '--text', text, '--write-media', tmp];
  execFile(edgeTts, args, (err) => {
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
        'Access-Control-Allow-Origin': '*',
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
  const { token, error } = getToken();
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
      'Content-Type':      'application/json',
      'Content-Length':    data.length,
      'Authorization':     `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'oauth-2025-04-20',
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

function classifyIntent(text, lastAiMessage, res) {
  const reply = (respond) => {
    res.writeHead(200, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
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
  // ── ใส่ real hardware command ตรงนี้ ──
  // e.g. execFile('python3', ['control_ac.py', on ? 'on' : 'off'])
}

// Auto-control tick (every 30 s)
setInterval(() => {
  if (acState.mode !== 'auto') return;
  // ใช้ค่าล่าสุดจาก SENSOR_TIMELINE (วันที่ 10 เวลา 17:00)
  const temp = 27.4, co2 = 892;
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
  }
}, 5_000);

function handleAC(method, bodyStr, res) {
  const reply = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
    const temp = 27.4, co2 = 892;
    if (temp >= acState.auto.tempOn || co2 >= acState.auto.co2On)
      setAC(true,  `auto init: temp ${temp}°C`);
    else
      setAC(false, `auto init: ปกติ`);
  }

  reply({ ...acState });
}

// ── Pico W bridge ─────────────────────────────────────────────────────────────
const picoState = {
  sensor:   { temp: null, humidity: null, co2: null, updatedAt: null },
  devices:  { led: false, ac: false, door: false, solar: false },  // last-known on/off
  commands: [],          // queue of pending commands for Pico to execute
  online:   false,       // true once Pico has talked to us recently
  lastSeen: null,
};

// Rolling history for the "now" graph — last 120 readings (~20 min at 10s)
const picoHistory = [];
function pushHistory(s) {
  picoHistory.push({ t: Date.now(), temp: s.temp, humidity: s.humidity, co2: s.co2 });
  if (picoHistory.length > 120) picoHistory.shift();
}

function handlePico(req, res, body) {
  const reply = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  };

  const markOnline = () => {
    picoState.online   = true;
    picoState.lastSeen = Date.now();
  };

  // Pico pushes sensor data
  if (req.method === 'POST' && req.url === '/api/pico/sensor') {
    try {
      const d = JSON.parse(body);
      if (d.temp     !== undefined) picoState.sensor.temp     = d.temp;
      if (d.humidity !== undefined) picoState.sensor.humidity = d.humidity;
      if (d.co2      !== undefined) picoState.sensor.co2      = d.co2;
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
    // consider Pico offline if not seen for 30 s
    if (picoState.lastSeen && Date.now() - picoState.lastSeen > 30_000)
      picoState.online = false;
    reply(picoState);
    return true;
  }

  // Browser reads rolling history for the "now" graph
  if (req.method === 'GET' && req.url === '/api/pico/history') {
    reply(picoHistory);
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
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end',  ()    => proxyAnthropic(body, res));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/stt') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  ()  => handleSTT(Buffer.concat(chunks), res));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/tts') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end',  ()    => handleTTS(body, res));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/classify') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      let text = '', lastAiMessage = '';
      try { const p = JSON.parse(body); text = p.text || ''; lastAiMessage = p.lastAiMessage || ''; } catch {}
      classifyIntent(text, lastAiMessage, res);
    });
    return;
  }

  if (req.url === '/api/ac') {
    if (req.method === 'GET') { handleAC('GET', '', res); return; }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end',  ()  => handleAC('POST', body, res));
      return;
    }
  }

  if (req.url.startsWith('/api/pico')) {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      if (!handlePico(req, res, body)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unknown pico route' }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/status') {
    const { token, error } = getToken();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: !!token, error: error || null }));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  const { token, error } = getToken();
  console.log(`\nSensor AI  →  http://localhost:${PORT}`);
  console.log(`Claude token: ${token ? '✓ OK' : '✗ ' + error}`);
  console.log('(Ctrl+C to stop)\n');
});
