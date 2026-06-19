/* viz.jsx — canvas sensor charts, energy-flow SVG, status dot, calendar */
const { useRef, useEffect, useState } = React;

/* ---------- Month calendar (today + AC schedule marker) ---------- */
const CAL_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const CAL_DOW = ['อา','จ','อ','พ','พฤ','ศ','ส'];

function Calendar({ schedule }) {
  const [today, setToday] = useState(() => new Date());
  const [view, setView]   = useState(() => { const d = new Date(); return { y:d.getFullYear(), m:d.getMonth() }; });

  /* keep "today" fresh across midnight */
  useEffect(() => {
    const id = setInterval(() => setToday(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const startDow     = new Date(view.y, view.m, 1).getDay();
  const daysInMonth  = new Date(view.y, view.m + 1, 0).getDate();
  const isToday = d => d === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();

  let schedDay = null;
  if (schedule && schedule.triggerAt) {
    const sd = new Date(schedule.triggerAt);
    if (sd.getMonth() === view.m && sd.getFullYear() === view.y) schedDay = sd.getDate();
  }

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const step = n => setView(v => {
    let m = v.m + n, y = v.y;
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    return { y, m };
  });

  return (
    <div className="cal">
      <div className="panel-label">
        CALENDAR
        <span className="cal-nav">
          <button onClick={() => step(-1)}>‹</button>
          <span className="cal-title">{CAL_MONTHS[view.m]} {view.y + 543}</span>
          <button onClick={() => step(1)}>›</button>
        </span>
      </div>
      <div className="cal-grid cal-dow">
        {CAL_DOW.map((d, i) => <span key={i} className={"cal-dh" + (i===0||i===6 ? " we":"")}>{d}</span>)}
      </div>
      <div className="cal-grid cal-body">
        {cells.map((d, i) => (
          <span key={i} className={"cal-cell" + (d ? "" : " empty")
            + (isToday(d) ? " today" : "") + (d && d === schedDay ? " sched" : "")}>
            {d || ""}
          </span>
        ))}
      </div>
      {schedDay != null && (
        <div className="cal-foot">
          ❄️ ตั้งเวลา{schedule.action === 'on' ? 'เปิด' : 'ปิด'}แอร์ ·{' '}
          {new Date(schedule.triggerAt).toLocaleString('th-TH', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
        </div>
      )}
    </div>
  );
}

/* ---------- Status dot ---------- */
function StatusDot({ online, label }) {
  return (
    <span className="statusdot">
      <span className={"dot " + (online ? "on" : "off")}></span>
      <span className="statusdot-label">{label}</span>
    </span>
  );
}

/* ---------- Canvas line chart with gradient fill ---------- */
function SensorChart({ title, unit, data, color, accent }) {
  const ref = useRef(null);
  const dataRef  = useRef(data);
  const colorRef = useRef(color);
  dataRef.current  = data;
  colorRef.current = color;
  const latest = data.length ? data[data.length - 1] : 0;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    function draw() {
      const d = dataRef.current, c = colorRef.current;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      if (!W || !H) return;
      canvas.width = W * dpr; canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const padL = 8, padR = 8, padT = 14, padB = 20;
      const plotW = W - padL - padR, plotH = H - padT - padB;
      const vals = d.length ? d : [0];
      let mn = Math.min(...vals), mx = Math.max(...vals);
      if (mn === mx) { mn -= 1; mx += 1; }
      const rng = mx - mn;
      mn -= rng * 0.25; mx += rng * 0.25;

      const x = i => padL + (i / Math.max(1, vals.length - 1)) * plotW;
      const y = v => padT + plotH - ((v - mn) / (mx - mn)) * plotH;

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 3; g++) {
        const gy = padT + (g / 3) * plotH;
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.34)";
      ctx.font = "10px 'Space Mono', monospace";
      ctx.textAlign = "center";
      ["-60s","-40s","-20s","now"].forEach((t, i, a) =>
        ctx.fillText(t, padL + (i / (a.length - 1)) * plotW, H - 6));

      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, c + "55"); grad.addColorStop(1, c + "00");
      ctx.beginPath();
      ctx.moveTo(x(0), y(vals[0]));
      for (let i = 1; i < vals.length; i++) ctx.lineTo(x(i), y(vals[i]));
      ctx.lineTo(x(vals.length - 1), padT + plotH);
      ctx.lineTo(x(0), padT + plotH);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x(0), y(vals[0]));
      for (let i = 1; i < vals.length; i++) ctx.lineTo(x(i), y(vals[i]));
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      ctx.lineJoin = "round"; ctx.shadowColor = c; ctx.shadowBlur = 8;
      ctx.stroke(); ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(x(vals.length - 1), y(vals[vals.length - 1]), 3, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
    }

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  /* redraw when data or color changes */
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    dataRef.current  = data;
    colorRef.current = color;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    ctx.clearRect(0, 0, W, H);
    const padL=8,padR=8,padT=14,padB=20,plotW=W-padL-padR,plotH=H-padT-padB;
    const vals = data.length ? data : [0];
    let mn=Math.min(...vals),mx=Math.max(...vals);
    if(mn===mx){mn-=1;mx+=1;} const rng=mx-mn; mn-=rng*0.25; mx+=rng*0.25;
    const x=i=>padL+(i/Math.max(1,vals.length-1))*plotW;
    const y=v=>padT+plotH-((v-mn)/(mx-mn))*plotH;
    ctx.strokeStyle="rgba(255,255,255,0.06)"; ctx.lineWidth=1;
    for(let g=0;g<=3;g++){const gy=padT+(g/3)*plotH;ctx.beginPath();ctx.moveTo(padL,gy);ctx.lineTo(W-padR,gy);ctx.stroke();}
    ctx.fillStyle="rgba(255,255,255,0.34)"; ctx.font="10px 'Space Mono',monospace"; ctx.textAlign="center";
    ["-60s","-40s","-20s","now"].forEach((t,i,a)=>ctx.fillText(t,padL+(i/(a.length-1))*plotW,H-6));
    const grad=ctx.createLinearGradient(0,padT,0,padT+plotH);
    grad.addColorStop(0,color+"55"); grad.addColorStop(1,color+"00");
    ctx.beginPath(); ctx.moveTo(x(0),y(vals[0]));
    for(let i=1;i<vals.length;i++) ctx.lineTo(x(i),y(vals[i]));
    ctx.lineTo(x(vals.length-1),padT+plotH); ctx.lineTo(x(0),padT+plotH); ctx.closePath();
    ctx.fillStyle=grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x(0),y(vals[0]));
    for(let i=1;i<vals.length;i++) ctx.lineTo(x(i),y(vals[i]));
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.lineJoin="round"; ctx.shadowColor=color; ctx.shadowBlur=8;
    ctx.stroke(); ctx.shadowBlur=0;
    ctx.beginPath(); ctx.arc(x(vals.length-1),y(vals[vals.length-1]),3,0,Math.PI*2);
    ctx.fillStyle="#fff"; ctx.fill();
  }, [data, color]);

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-val" style={{ color: accent || color }}>
          {latest.toFixed(unit === "ppm" ? 0 : 1)}<span className="chart-unit">{unit}</span>
        </span>
      </div>
      <canvas ref={ref} className="chart-canvas"></canvas>
    </div>
  );
}

/* ---------- Energy flow diagram ---------- */
function Wire({ d, active, color }) {
  return (
    <g>
      <path d={d} className="wire-bg" />
      <path d={d} className={"wire-flow" + (active ? " active" : "")}
            style={{ stroke: color }} />
    </g>
  );
}

function Node({ x, y, emoji, label, watt, active, color }) {
  return (
    <g transform={`translate(${x},${y})`} className={"enode" + (active ? " on" : "")}>
      <circle r="30" className="enode-bg" style={active ? { stroke: color } : null} />
      <text className="enode-emoji" y="7" textAnchor="middle">{emoji}</text>
      <text className="enode-label" y="48" textAnchor="middle">{label}</text>
      <text className="enode-watt" y="63" textAnchor="middle"
            style={active ? { fill: color } : null}>{watt}</text>
    </g>
  );
}

function EnergyFlow({ devices, gen }) {
  const homeLoad = (devices.led ? 12 : 0) + (devices.ac ? 850 : 0) + (devices.door ? 5 : 0);
  return (
    <svg className="energy-svg" viewBox="0 0 620 360" preserveAspectRatio="xMidYMid meet">
      {/* supply wires */}
      <Wire d="M120,80 C220,80 220,180 290,180" active={devices.solar} color="var(--amber)" />
      <Wire d="M120,280 C220,280 220,180 290,180" active={true} color="var(--blue)" />
      {/* load wires */}
      <Wire d="M330,180 C400,180 400,80 470,80" active={devices.led} color="var(--mint)" />
      <Wire d="M340,180 L470,180" active={devices.ac} color="var(--mint)" />
      <Wire d="M330,180 C400,180 400,280 470,280" active={devices.door} color="var(--mint)" />

      <Node x={90} y={80} emoji="☀️" label="SOLAR" watt={devices.solar ? `+${gen}W` : "0W"} active={devices.solar} color="var(--amber)" />
      <Node x={90} y={280} emoji="🏙️" label="CITY GRID" watt="+1.2kW" active={true} color="var(--blue)" />
      <Node x={310} y={180} emoji="🏠" label="HOME" watt={`${homeLoad}W`} active={true} color="var(--text)" />
      <Node x={500} y={80} emoji="💡" label="LED" watt={devices.led ? "12W" : "off"} active={devices.led} color="var(--mint)" />
      <Node x={500} y={180} emoji="❄️" label="AC" watt={devices.ac ? "850W" : "off"} active={devices.ac} color="var(--mint)" />
      <Node x={500} y={280} emoji="🚪" label="DOOR" watt={devices.door ? "open" : "locked"} active={devices.door} color="var(--mint)" />
    </svg>
  );
}

Object.assign(window, { StatusDot, SensorChart, EnergyFlow, Calendar });
