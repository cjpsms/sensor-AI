/* app.jsx — Hana avatar (real Live2D), chat panel, device controls */
const { useState, useEffect, useRef } = React;
const { SensorChart, EnergyFlow, StatusDot } = window;

/* ---------- SENSOR_TIMELINE from main.jsx (window global) ---------- */
const TL = () => window.SENSOR_TIMELINE || [];

/* ---------- Hana — real Live2D iframe ---------- */
const STATE_TEXT = { idle:'พร้อมใช้งาน', listening:'กำลังฟัง...', thinking:'กำลังคิด...' };

function Hana({ size, speaking, mini, aiState = 'idle' }) {
  if (mini) {
    return (
      <div className="hana-mini">
        <span className="hana-mini-ghost"></span>
      </div>
    );
  }
  return (
    <div className="hana-mount" style={{ height: size }}>
      <div className="hana-glow"></div>
      <div id="hana-canvas" className={"hana-slot state-" + aiState + (speaking ? " speaking" : "")}>
        <iframe
          id="live2dFrame"
          src="/live2d-viewer/"
          style={{ width:'100%', height:'100%', border:'none', background:'transparent' }}
          allowTransparency={true}
        />
      </div>
      <div className={"ai-state-text " + aiState}>{STATE_TEXT[aiState] || 'พร้อมใช้งาน'}</div>
    </div>
  );
}

/* ---------- Device meta ---------- */
const DEVICE_META = {
  led:   { icon:"💡", name:"ไฟ LED",    onLabel:"เปิด",    offLabel:"ปิด" },
  ac:    { icon:"❄️", name:"แอร์",      onLabel:"เปิดอยู่", offLabel:"ปิด" },
  door:  { icon:"🚪", name:"ประตู",     onLabel:"เปิด",    offLabel:"ล็อค" },
  solar: { icon:"☀️", name:"โซลาร์",   onLabel:"ทำงาน",   offLabel:"ว่าง" },
};

function AcScheduleBadge({ acSchedule }) {
  if (!acSchedule) return null;
  const minsLeft = Math.max(0, Math.round((acSchedule.triggerAt - Date.now()) / 60000));
  return (
    <span className="ac-sched-badge" title="ตั้งเวลาแอร์">
      ⏱ {acSchedule.action === 'on' ? 'เปิด' : 'ปิด'}แอร์ในอีก {minsLeft} นาที
    </span>
  );
}

function DeviceCard({ devices, toggle, acSchedule }) {
  return (
    <div className="devcard">
      <div className="devcard-title">DEVICE CONTROL</div>
      <div className="devcard-grid">
        {Object.keys(DEVICE_META).map(k => {
          const m = DEVICE_META[k], on = !!devices[k];
          return (
            <button key={k} className={"devbtn" + (on ? " on" : "")} onClick={() => toggle(k)}>
              <span className="devbtn-icon">{m.icon}</span>
              <span className="devbtn-meta">
                <span className="devbtn-name">{m.name}</span>
                <span className="devbtn-state">{on ? m.onLabel : m.offLabel}</span>
              </span>
              <span className={"devbtn-sw" + (on ? " on" : "")}><span className="knob"></span></span>
              {k === 'ac' && <AcScheduleBadge acSchedule={acSchedule} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Typing indicator ---------- */
function TypingBubble() {
  return (
    <div className="msg ai">
      <div className="bubble" style={{ display:'flex', gap:4, padding:'12px 16px' }}>
        {[0,0.2,0.4].map((d,i) => (
          <span key={i} style={{
            width:7, height:7, borderRadius:'50%', background:'var(--muted)',
            display:'inline-block',
            animation:`typing 1.2s ${d}s infinite`,
          }}/>
        ))}
      </div>
    </div>
  );
}

/* ---------- Chat panel ---------- */
function Chat({ messages, devices, toggle, onSend, sensors, acSchedule }) {
  const [draft, setDraft] = useState('');
  const scroller = useRef(null);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);

  const submit = e => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft('');
  };

  function resolveGraphData(m) {
    if (m.range === 'allday') {
      const key = m.metric === 'humidity' ? 'hum' : m.metric;
      return TL().map(d => d[key]);
    }
    return (sensors[m.metric] || {}).data || [];
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <div className="chat-ava"><Hana mini /></div>
        <div className="chat-id">
          <div className="chat-name">Neko</div>
          <StatusDot online={true} label="ออนไลน์ · รับฟังอยู่" />
        </div>
      </div>

      {/* Device card always pinned at top, never scrolls away */}
      <div className="chat-devices-pin">
        <DeviceCard devices={devices} toggle={toggle} acSchedule={acSchedule} />
      </div>

      <div className="chat-scroll" ref={scroller}>
        {messages.map((m, i) => {
          if (m.type === 'devices') return null;   // rendered above, not inline
          if (m.type === 'typing') return <TypingBubble key={i} />;
          if (m.type === 'graph') {
            const s = sensors[m.metric] || {};
            const data = resolveGraphData(m);
            return (
              <div key={i} className="chat-graph">
                <SensorChart
                  title={s.title || m.metric}
                  unit={s.unit || ''}
                  data={data}
                  color={s.color || '#818cf8'}
                  accent={s.color || '#818cf8'}
                />
              </div>
            );
          }
          return (
            <div key={i} className={"msg " + m.role}>
              <div className="bubble">{m.text}</div>
            </div>
          );
        })}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder='ถามหนูได้เลยค่ะ~ (เช่น "เปิดแอร์หน่อย")'
        />
        <button type="submit" aria-label="send">↑</button>
      </form>
    </div>
  );
}

/* ---------- Typing keyframe (injected once) ---------- */
const _style = document.createElement('style');
_style.textContent = `@keyframes typing{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}`;
document.head.appendChild(_style);

Object.assign(window, { Hana, DeviceCard, Chat, DEVICE_META });
