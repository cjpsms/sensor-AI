/* main.jsx — App shell: real Pico W data, Claude Haiku AI, Edge TTS, voice */
const { useState:uS, useEffect:uE, useRef:uR, useCallback:uC } = React;
const { Hana, Chat, EnergyFlow, SensorChart, StatusDot, Calendar } = window;

/* ── Sensor history (SmartLab ชั้น 3, 9–10 มิ.ย. 2026) ── */
window.SENSOR_TIMELINE = [
  { ts:"2026-06-09 00:00", temp:22.8, hum:55, co2:412 },
  { ts:"2026-06-09 01:00", temp:22.5, hum:56, co2:408 },
  { ts:"2026-06-09 02:00", temp:22.3, hum:57, co2:405 },
  { ts:"2026-06-09 03:00", temp:22.1, hum:57, co2:403 },
  { ts:"2026-06-09 04:00", temp:22.0, hum:58, co2:401 },
  { ts:"2026-06-09 05:00", temp:21.9, hum:58, co2:400 },
  { ts:"2026-06-09 06:00", temp:22.0, hum:57, co2:402 },
  { ts:"2026-06-09 07:00", temp:22.8, hum:56, co2:418 },
  { ts:"2026-06-09 08:00", temp:24.1, hum:54, co2:520 },
  { ts:"2026-06-09 09:00", temp:25.3, hum:52, co2:680 },
  { ts:"2026-06-09 10:00", temp:26.0, hum:51, co2:780 },
  { ts:"2026-06-09 11:00", temp:26.5, hum:50, co2:840 },
  { ts:"2026-06-09 12:00", temp:26.2, hum:51, co2:720 },
  { ts:"2026-06-09 13:00", temp:26.0, hum:52, co2:690 },
  { ts:"2026-06-09 14:00", temp:26.8, hum:50, co2:1380 },
  { ts:"2026-06-09 15:00", temp:27.1, hum:49, co2:960 },
  { ts:"2026-06-09 16:00", temp:27.0, hum:49, co2:870 },
  { ts:"2026-06-09 17:00", temp:26.5, hum:50, co2:820 },
  { ts:"2026-06-09 18:00", temp:25.8, hum:52, co2:650 },
  { ts:"2026-06-09 19:00", temp:25.0, hum:53, co2:540 },
  { ts:"2026-06-09 20:00", temp:24.3, hum:54, co2:480 },
  { ts:"2026-06-09 21:00", temp:23.8, hum:55, co2:450 },
  { ts:"2026-06-09 22:00", temp:23.4, hum:56, co2:430 },
  { ts:"2026-06-09 23:00", temp:23.1, hum:56, co2:418 },
  { ts:"2026-06-10 00:00", temp:22.9, hum:57, co2:415 },
  { ts:"2026-06-10 01:00", temp:22.7, hum:57, co2:411 },
  { ts:"2026-06-10 02:00", temp:22.5, hum:58, co2:408 },
  { ts:"2026-06-10 03:00", temp:22.3, hum:58, co2:405 },
  { ts:"2026-06-10 04:00", temp:22.1, hum:59, co2:403 },
  { ts:"2026-06-10 05:00", temp:22.0, hum:59, co2:401 },
  { ts:"2026-06-10 06:00", temp:22.2, hum:58, co2:404 },
  { ts:"2026-06-10 07:00", temp:23.5, hum:57, co2:422 },
  { ts:"2026-06-10 08:00", temp:26.8, hum:56, co2:510 },
  { ts:"2026-06-10 09:00", temp:28.3, hum:54, co2:640 },
  { ts:"2026-06-10 10:00", temp:27.5, hum:52, co2:730 },
  { ts:"2026-06-10 11:00", temp:26.9, hum:51, co2:810 },
  { ts:"2026-06-10 12:00", temp:26.4, hum:52, co2:700 },
  { ts:"2026-06-10 13:00", temp:26.1, hum:52, co2:675 },
  { ts:"2026-06-10 14:00", temp:26.5, hum:51, co2:850 },
  { ts:"2026-06-10 15:00", temp:26.8, hum:50, co2:890 },
  { ts:"2026-06-10 16:00", temp:27.1, hum:50, co2:880 },
  { ts:"2026-06-10 17:00", temp:27.4, hum:51, co2:892 },
];

/* ── Claude tools ── */
const TOOLS = [
  {
    name: 'control_device',
    description: 'เปิด/ปิดอุปกรณ์จริงผ่าน Pico W: ไฟ LED, แอร์, ประตู, โซลาร์',
    input_schema: {
      type:'object',
      properties: {
        device: { type:'string', enum:['led','ac','door','solar'] },
        on:     { type:'boolean' },
      },
      required:['device','on'],
    },
  },
  {
    name: 'show_graph',
    description: 'แสดงกราฟค่าเซ็นเซอร์ให้ผู้ใช้เห็น ใช้เสมอเมื่อถามถึง temp/humidity/co2',
    input_schema: {
      type:'object',
      properties: {
        metric: { type:'string', enum:['temp','humidity','co2'] },
        range:  { type:'string', enum:['now','allday'] },
      },
      required:['metric','range'],
    },
  },
  {
    name: 'set_ac_schedule',
    description: 'ตั้งเวลาเปิด/ปิดแอร์ล่วงหน้า ใช้เมื่อผู้ใช้พูดถึงการเปิด/ปิดแอร์ "อีก N นาที/ชั่วโมง" หรือ "ตอน..."',
    input_schema: {
      type:'object',
      properties: {
        action:    { type:'string', enum:['on','off'] },
        minutes:   { type:'number', description:'จำนวนนาทีจากนี้ที่จะให้ทำงาน' },
      },
      required:['action','minutes'],
    },
  },
  {
    name: 'cancel_ac_schedule',
    description: 'ยกเลิกการตั้งเวลาแอร์ที่ตั้งไว้',
    input_schema: { type:'object', properties:{} },
  },
  {
    name: 'set_calendar_reminder',
    description: 'ตั้งเตือนให้ AI พูดข้อความที่กำหนดเมื่อถึงเวลา ใช้ type=once สำหรับนัดครั้งเดียว (เช่น "21:00 19/6/69" ต้องแปลง พ.ศ.->ค.ศ. ก่อน: ค.ศ. = พ.ศ. - 543) หรือ type=weekly สำหรับเตือนซ้ำทุกสัปดาห์วันเดิม (เช่น "ทุกวันจันทร์ทักทาย")',
    input_schema: {
      type:'object',
      properties: {
        message:  { type:'string', description:'ข้อความที่ให้ AI พูดเมื่อถึงเวลา' },
        type:     { type:'string', enum:['once','weekly'] },
        datetime: { type:'string', description:'สำหรับ type=once: ISO 8601 เช่น 2026-06-19T21:00:00 (ค.ศ. เท่านั้น แปลงจาก พ.ศ. ก่อนเสมอ)' },
        weekday:  { type:'string', enum:['sunday','monday','tuesday','wednesday','thursday','friday','saturday'], description:'สำหรับ type=weekly' },
        time:     { type:'string', description:'เวลาแบบ HH:MM 24 ชม. สำหรับ type=weekly' },
      },
      required:['message','type'],
    },
  },
  {
    name: 'cancel_calendar_reminder',
    description: 'ยกเลิกการตั้งเตือนปฏิทินที่ตั้งไว้ ระบุคำในข้อความเตือนเพื่อยกเลิกอันนั้น หรือ "all" เพื่อยกเลิกทั้งหมด',
    input_schema: {
      type:'object',
      properties: { match: { type:'string', description:'คำในข้อความเตือนที่ต้องการยกเลิก หรือ "all"' } },
      required:['match'],
    },
  },
];

const SEED = n => Array.from({ length:30 }, (_,i) => n + Math.sin(i/3)*(n*0.04));
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

/* ── Module-level mutable state (avoids stale closures) ── */
let _history = [];
let _busy    = false;
let _lastAi  = '';
let _alwaysOn = false;
let _currentAudio = null;
let _pendingGraph = null;  // { metric, range } set by show_graph tool

function App() {
  /* ── React state (drives UI) ── */
  const [mode,     setMode]     = uS(() => localStorage.getItem('sensorai_mode') || 'fullscreen');
  const [devices,  setDevices]  = uS({ led:false, ac:false, door:false, solar:false });
  const [online,   setOnline]   = uS(false);
  const [aiMode,   setAiMode]   = uS('idle');  // 'idle' | 'listening' | 'thinking'
  const [sensors,  setSensors]  = uS({
    temp:     { title:'อุณหภูมิ',  unit:'°C',  color:'#ff9d6b', data: SEED(24.5) },
    humidity: { title:'ความชื้น', unit:'%',   color:'#5bd6c0', data: SEED(52)   },
    co2:      { title:'CO₂',      unit:'ppm', color:'#9d8bff', data: SEED(620)  },
  });
  const [messages, setMessages] = uS([
    { role:'ai', text:'สวัสดีค่ะ หนูคือ Neko 🌸 AI Assistant ประจำ SmartLab ชั้น 3 ค่ะ' },
    { type:'devices' },
    { role:'ai', text:'ถามหนูได้เลยนะคะ หรือแตะปุ่มอุปกรณ์ด้านบนเพื่อควบคุมค่ะ~' },
  ]);
  const [overlay,  setOverlay]  = uS(null);
  const [speaking, setSpeaking] = uS(false);
  const [voice,    setVoice]    = uS('th-TH-PremwadeeNeural');
  const [acSchedule, setAcSchedule] = uS(null);  // { triggerAt, action } | null

  /* ── Refs for callbacks that need current values without re-creating loops ── */
  const modeRef    = uR(mode);
  const voiceRef   = uR(voice);
  const sensorsRef = uR(sensors);
  uE(() => { modeRef.current    = mode;    }, [mode]);
  uE(() => { voiceRef.current   = voice;   }, [voice]);
  uE(() => { sensorsRef.current = sensors; }, [sensors]);

  uE(() => localStorage.setItem('sensorai_mode', mode), [mode]);

  /* ── Poll Pico W state every 3s ── */
  uE(() => {
    const poll = async () => {
      try {
        const r  = await fetch('/api/pico/state');
        const st = await r.json();
        setOnline(!!st.online);
        if (st.devices) setDevices(st.devices);
        const s = st.sensor || {};
        if (s.temp != null || s.humidity != null || s.co2 != null) {
          setSensors(prev => {
            const n = { ...prev };
            if (s.temp     != null) n.temp     = { ...prev.temp,     data:[...prev.temp.data.slice(1),     s.temp]     };
            if (s.humidity != null) n.humidity = { ...prev.humidity, data:[...prev.humidity.data.slice(1), s.humidity] };
            if (s.co2      != null) n.co2      = { ...prev.co2,      data:[...prev.co2.data.slice(1),      s.co2]      };
            return n;
          });
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll AC schedule state every 5s — also announces countdown / fire via Hana's voice ── */
  const prevScheduleRef = uR(null);
  const warnedRef       = uR(false);
  uE(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/ac');
        const st = await r.json();
        const sched = st.schedule || null;
        const prev  = prevScheduleRef.current;

        if (sched) {
          const secsLeft = Math.round((sched.triggerAt - Date.now()) / 1000);
          /* heads-up once when 1 minute is left */
          if (!warnedRef.current && secsLeft <= 60 && secsLeft > 0) {
            warnedRef.current = true;
            if (!_busy) say(`อีก 1 นาที จะ${sched.action==='on'?'เปิด':'ปิด'}แอร์นะคะ`);
          }
        } else if (prev) {
          /* schedule gone — only announce if its time actually passed (fired),
             not if the user cancelled it early (that gets its own chat reply) */
          if (!_busy && Date.now() >= prev.triggerAt - 2000) {
            say(`ครบเวลาแล้วค่ะ ${prev.action==='on'?'เปิด':'ปิด'}แอร์ให้แล้วนะคะ`);
          }
          warnedRef.current = false;
        }

        prevScheduleRef.current = sched;
        setAcSchedule(sched);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  /* ── Poll calendar reminders every 10s — announces any that just fired ── */
  uE(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/calendar');
        const st = await r.json();
        for (const msg of st.fired || []) {
          if (!_busy) say(msg);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, []);

  /* ── say: add AI bubble + TTS in fullscreen ── */
  async function say(text, metric, range) {
    _lastAi = text;

    if (modeRef.current === 'fullscreen') {
      /* fetch audio first — show text + play simultaneously so they're in sync */
      setSpeaking(true);
      let audio = null;
      try {
        const res = await fetch('/api/tts', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ text, voice: voiceRef.current }),
        });
        if (res.ok) {
          audio = new Audio(URL.createObjectURL(new Blob([await res.arrayBuffer()], { type:'audio/mpeg' })));
        }
      } catch {}

      /* reveal text at the same moment audio starts */
      setMessages(m => [
        ...m.filter(x => x.type !== 'typing'),
        { role:'ai', text },
        ...(metric ? [{ type:'graph', metric, range: range || 'now' }] : []),
      ]);
      if (metric) setOverlay({ metric });

      if (audio) {
        if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
        _currentAudio = audio;
        window._connectMouthSync?.(audio);
        audio.addEventListener('ended', () => { setSpeaking(false); _currentAudio = null; });
        audio.play();
      } else {
        setSpeaking(false);
      }
    } else {
      /* commander mode — no TTS, show text immediately */
      setMessages(m => [
        ...m.filter(x => x.type !== 'typing'),
        { role:'ai', text },
        ...(metric ? [{ type:'graph', metric, range: range || 'now' }] : []),
      ]);
      if (metric) setOverlay({ metric });
    }
  }

  /* ── Tool runner ── */
  async function runTool(tb) {
    const { name, input:inp = {} } = tb;
    if (name === 'control_device') {
      const newVal = !!inp.on;
      setDevices(d => ({ ...d, [inp.device]: newVal }));
      fetch('/api/pico/command', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ device: inp.device, value: newVal }),
      }).catch(() => {});
      const th = { led:'ไฟ LED', ac:'แอร์', door:'ประตู', solar:'โซลาร์' };
      return `${newVal?'เปิด':'ปิด'}${th[inp.device]||inp.device}แล้วค่ะ`;
    }
    if (name === 'show_graph') {
      _pendingGraph = { metric: inp.metric, range: inp.range };
      return `แสดงกราฟ${inp.metric} (${inp.range==='allday'?'ทั้งวัน':'เรียลไทม์'}) ค่ะ`;
    }
    if (name === 'set_ac_schedule') {
      const offsetMs = Math.max(1, Number(inp.minutes) || 0) * 60_000;
      try {
        const r = await fetch('/api/ac', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ mode:'schedule', schedule:{ offsetMs, action: inp.action } }),
        });
        const st = await r.json();
        setAcSchedule(st.schedule || null);
      } catch {}
      return `ตั้งเวลา${inp.action==='on'?'เปิด':'ปิด'}แอร์ในอีก ${inp.minutes} นาทีแล้วค่ะ`;
    }
    if (name === 'cancel_ac_schedule') {
      try {
        const r = await fetch('/api/ac', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ cancelSchedule:true }),
        });
        const st = await r.json();
        setAcSchedule(st.schedule || null);
      } catch {}
      return 'ยกเลิกการตั้งเวลาแอร์แล้วค่ะ';
    }
    if (name === 'set_calendar_reminder') {
      try {
        const r = await fetch('/api/calendar', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            message: inp.message, type: inp.type,
            datetime: inp.datetime, weekday: inp.weekday, time: inp.time,
          }),
        });
        const st = await r.json();
        if (st.error) return `ตั้งเตือนไม่สำเร็จค่ะ: ${st.error}`;
      } catch {}
      return inp.type === 'weekly'
        ? `ตั้งเตือนทุกวัน${inp.weekday}เวลา ${inp.time} แล้วค่ะ`
        : `ตั้งเตือนแล้วค่ะ`;
    }
    if (name === 'cancel_calendar_reminder') {
      try {
        const r = await fetch('/api/calendar', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ cancel: inp.match }),
        });
        const st = await r.json();
        return st.removed > 0 ? `ยกเลิกการเตือนแล้วค่ะ (${st.removed} รายการ)` : 'ไม่พบการเตือนที่ตรงกันค่ะ';
      } catch {}
      return 'ยกเลิกไม่สำเร็จค่ะ';
    }
    return 'ไม่รู้จักเครื่องมือนี้ค่ะ';
  }

  /* ── Claude Haiku ── */
  function buildSysPrompt() {
    const TL = window.SENSOR_TIMELINE;
    const rows = TL.map(d => `${d.ts}|${d.temp}°C|${d.hum}%|${d.co2}ppm`).join('\n');
    const nowStr = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok', dateStyle: 'full', timeStyle: 'short',
    });
    const devState = [
      `ไฟ LED=${devices.led?'เปิด':'ปิด'}`,
      `แอร์=${devices.ac?'เปิด':'ปิด'}`,
      `ประตู=${devices.door?'เปิด':'ปิด'}`,
      `โซลาร์=${devices.solar?'ทำงาน':'หยุด'}`,
    ].join(', ');
    const s = sensorsRef.current;
    const liveState = `อุณหภูมิ=${s.temp.data.at(-1).toFixed(1)}°C, ความชื้น=${s.humidity.data.at(-1).toFixed(0)}%, CO2=${s.co2.data.at(-1).toFixed(0)}ppm`;
    const schedState = acSchedule
      ? `ตั้งเวลาไว้: ${acSchedule.action==='on'?'เปิด':'ปิด'}แอร์ในอีก ${Math.max(0, Math.round((acSchedule.triggerAt - Date.now())/60000))} นาที`
      : 'ไม่มีการตั้งเวลาแอร์';
    return `คุณคือ Neko — AI Assistant ประจำ SmartLab ชั้น 3
เครื่องมือ: control_device (led/ac/door/solar) + show_graph (metric:temp/humidity/co2, range:now/allday) + set_ac_schedule (action:on/off, minutes) + cancel_ac_schedule + set_calendar_reminder (type:once/weekly) + cancel_calendar_reminder
บุคลิก: สุภาพ ใจดี ตอบภาษาไทย แนวอนิเมะ ลงท้าย "ค่ะ"/"นะคะ" ตอบสั้น 1-3 ประโยคเท่านั้น
เวลาปัจจุบัน: ${nowStr} (เขตเวลาไทย) — ใช้เวลานี้เมื่อผู้ใช้ถามเวลา/วันที่ หรือคำนวณตารางเวลา
กฎ: เมื่อถามเกี่ยวกับค่า temp/humidity/co2 ให้เรียก show_graph เสมอ
กฎ: เมื่อผู้ใช้พูดถึงเปิด/ปิดแอร์แบบมีเวลา ("อีก 10 นาที", "อีกครึ่งชั่วโมง") ให้เรียก set_ac_schedule แทน control_device
กฎ: เมื่อผู้ใช้ขอให้เตือน/พูดอะไรในเวลาที่กำหนด ("ตอน 21:00 พูดว่า...", "ทุกวันจันทร์ทักทาย") ให้เรียก set_calendar_reminder
  - ครั้งเดียว (type=once) ต้องแปลงวันที่เป็น ISO 8601 ค.ศ. เท่านั้น — ถ้าผู้ใช้ให้ปี พ.ศ. (เช่น 69 = 2569) ให้แปลง ค.ศ. = พ.ศ. - 543 ก่อนส่ง (2569-543=2026)
  - ทุกสัปดาห์ (type=weekly) ใช้ weekday + time (HH:MM 24 ชม.)
กฎ: CO2>1000=ไม่ดี, >1200=อันตราย, Temp>28=ร้อนเกิน
---สถานะอุปกรณ์ปัจจุบัน---
${devState}
---สถานะตั้งเวลาแอร์---
${schedState}
---ค่าเซ็นเซอร์ปัจจุบัน---
${liveState}
---ข้อมูลเซ็นเซอร์ 9-10 มิ.ย. 2026---
${rows}`;
  }

  async function callClaude(userMsg) {
    _pendingGraph = null;
    const msgs = [..._history, { role:'user', content:userMsg }];
    const body = { model:'claude-haiku-4-5-20251001', max_tokens:512, temperature:0.5, system:buildSysPrompt(), tools:TOOLS, messages:msgs };
    const r1 = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const d1 = await r1.json();
    if (!r1.ok) throw new Error(d1?.error?.message || `HTTP ${r1.status}`);

    if (d1.stop_reason === 'tool_use') {
      const results = [];
      for (const tb of d1.content.filter(c => c.type==='tool_use'))
        results.push({ type:'tool_result', tool_use_id:tb.id, content: await runTool(tb) });
      const body2 = { model:'claude-haiku-4-5-20251001', max_tokens:256, temperature:0.5, system:buildSysPrompt(), tools:TOOLS,
        messages:[...msgs, { role:'assistant', content:d1.content }, { role:'user', content:results }] };
      const r2 = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body2) });
      const d2 = await r2.json();
      const txt = d2?.content?.find(c=>c.type==='text')?.text || results.map(r=>r.content).join(' ');
      _history = [..._history,
        { role:'user', content:userMsg },
        { role:'assistant', content:d1.content },
        { role:'user', content:results },
        { role:'assistant', content:txt },
      ].slice(-20);
      return txt;
    }

    const txt = d1?.content?.find(c=>c.type==='text')?.text || '(ไม่มีคำตอบ)';
    _history = [..._history, { role:'user', content:userMsg }, { role:'assistant', content:txt }].slice(-20);
    return txt;
  }

  /* ── respond: entry point for both text input & voice ── */
  const respondRef = uR(null);
  respondRef.current = async (text) => {
    if (_busy) return;
    _busy = true;
    setAiMode('thinking');
    setMessages(m => [...m, { role:'user', text }, { type:'typing' }]);
    try {
      const aiText = await callClaude(text);
      const pg = _pendingGraph;
      await say(aiText, pg?.metric, pg?.range);
    } catch (e) {
      await say('เกิดข้อผิดพลาดค่ะ: ' + e.message, null);
    }
    _busy = false;
    setAiMode(_alwaysOn ? 'listening' : 'idle');
  };

  /* ── Toggle device from UI ── */
  const toggle = uC(async (k) => {
    setDevices(d => {
      const next = { ...d, [k]: !d[k] };
      fetch('/api/pico/command', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ device:k, value:next[k] }),
      }).catch(() => {});
      return next;
    });
  }, []);

  /* ── Always-listen voice loop (starts on first tap in fullscreen) ── */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startAlwaysListen() {
    if (!SR || _alwaysOn) return;
    _alwaysOn = true;

    const loop = async () => {
      while (_alwaysOn) {
        setAiMode('listening');
        const text = await new Promise(resolve => {
          const rec = new SR();
          rec.lang='th-TH'; rec.continuous=false; rec.interimResults=false;
          let done=false;
          const fin = t => { if(!done){done=true;resolve(t);} };
          rec.onresult = e => fin(e.results[0][0].transcript.trim());
          rec.onend    = () => fin('');
          rec.onerror  = () => fin('');
          try { rec.start(); } catch { fin(''); }
        });

        if (!_alwaysOn) break;
        if (!text) { await new Promise(r => setTimeout(r, 600)); continue; }

        let doResp = true;
        try {
          const r = await fetch('/api/classify', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ text, lastAiMessage: _lastAi }),
          });
          doResp = (await r.json()).respond;
        } catch {}

        if (doResp && _alwaysOn) {
          await respondRef.current(text);
          // wait for TTS audio to finish
          await new Promise(res => {
            const audio = _currentAudio;
            if (!audio || audio.ended || audio.paused) { res(); return; }
            audio.addEventListener('ended', res, { once:true });
            setTimeout(res, 15000);
          });
          await new Promise(r => setTimeout(r, 400));
        }
      }
      setAiMode('idle');
    };
    loop();
  }

  /* Stop voice when leaving fullscreen */
  uE(() => { if (mode !== 'fullscreen') { _alwaysOn = false; setAiMode('idle'); } }, [mode]);

  /* Auto-dismiss overlay */
  uE(() => {
    if (!overlay) return;
    const id = setTimeout(() => setOverlay(null), 8000);
    return () => clearTimeout(id);
  }, [overlay]);

  /* ── Derived ── */
  const totalLoad = (devices.led?12:0) + (devices.ac?850:0) + (devices.door?5:0);
  const gen       = devices.solar ? 600 : 0;
  const isFs      = mode === 'fullscreen';
  const aiState   = speaking ? 'thinking' : aiMode;

  /* ── Render ── */
  return (
    <div className={"app mode-" + mode}>

      {/* ══ FULLSCREEN ══ */}
      {isFs && (
        <div className="fs">
          <div className="fs-stage" onClick={startAlwaysListen} title="แตะเพื่อเปิดโหมดเสียง">
            <Hana size={"min(68vh, 460px)"} speaking={speaking} aiState={aiState} />
          </div>

          {overlay && (() => {
            const s = sensorsRef.current[overlay.metric] || {};
            return (
              <div className="fs-overlay">
                <SensorChart title={s.title} unit={s.unit} data={s.data||[]} color={s.color} accent={s.color} />
              </div>
            );
          })()}

          {/* sensor readings HUD */}
          <div className="sensor-hud">
            <div className="shud-row">🌡 <span className="shud-val">{sensors.temp.data.at(-1).toFixed(1)}°C</span></div>
            <div className="shud-row">💧 <span className="shud-val">{sensors.humidity.data.at(-1).toFixed(0)}%</span></div>
            <div className="shud-row">🌿 <span className="shud-val">{sensors.co2.data.at(-1).toFixed(0)} ppm</span></div>
            <div className="shud-row">⚡ <span className="shud-val">{gen} W</span></div>
          </div>

          <div className="fs-status">
            <StatusDot online={online} label={online ? "Pico W · ออนไลน์" : "Pico W · ออฟไลน์"} />
          </div>

          {/* credits */}
          <div className="credit-badge">
            <span>© cj 2026</span>
            <span>Model: comte19</span>
          </div>

          {/* voice selector only — no model switcher */}
          <div style={{ position:'fixed', top:18, left:18, zIndex:50 }}>
            <select value={voice} onChange={e => setVoice(e.target.value)}
              style={{ background:'oklch(0.24 0.02 255 / 0.6)', border:'1px solid var(--line)',
                borderRadius:999, padding:'6px 12px', color:'var(--text)', cursor:'pointer',
                font:'500 12px Space Grotesk', backdropFilter:'blur(12px)', outline:'none' }}>
              <option value="th-TH-PremwadeeNeural">Premwadee ♀</option>
              <option value="th-TH-AcharaNeural">Achara ♀</option>
              <option value="th-TH-NiwatNeural">Niwat ♂</option>
              <option value="en-US-AriaNeural">Aria ♀ (EN)</option>
            </select>
          </div>
        </div>
      )}

      {/* ══ COMMANDER ══ */}
      {!isFs && (
        <div className="cmd">
          <div className="cmd-left">
            <header className="cmd-top">
              <div className="brand"><span className="brand-mark">◈</span> SENSOR<span className="brand-dim">AI</span></div>
              <StatusDot online={online} label={online ? "Pico W · ออนไลน์" : "Pico W · ออฟไลน์"} />
            </header>

            <div className="cmd-charts">
              {Object.keys(sensors).map(k => {
                const s = sensors[k];
                return <SensorChart key={k} title={s.title} unit={s.unit} data={s.data} color={s.color} accent={s.color} />;
              })}
            </div>

            <div className="cmd-bottom">
              <div className="cmd-flow">
                <div className="panel-label">
                  ENERGY FLOW
                  <span className="flow-sum">▲ {gen}W solar · ▼ {totalLoad}W load</span>
                </div>
                <EnergyFlow devices={devices} gen={gen} />
              </div>
              <Calendar schedule={acSchedule} />
            </div>
          </div>

          <aside className="cmd-right">
            <Chat
              messages={messages}
              devices={devices}
              toggle={toggle}
              onSend={t => respondRef.current(t)}
              sensors={sensors}
              acSchedule={acSchedule}
            />
          </aside>
        </div>
      )}

      {/* ── mode switch ── */}
      <button className="modeswitch" onClick={() => {
        _alwaysOn = false;
        setMode(m => m==='fullscreen' ? 'commander' : 'fullscreen');
      }}>
        {mode==='fullscreen'
          ? <><span className="ms-ico">▦</span> Commander</>
          : <><span className="ms-ico">◉</span> Fullscreen</>}
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
