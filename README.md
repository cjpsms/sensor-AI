# sensor-ai

> Smart building AI assistant — Claude Haiku chatbot + Edge TTS + Live2D anime character (Hana, 3 models: cat/red-horn/bear) + live Pico W sensor/device dashboard over WiFi.

<img src="assets/hana.png" width="150" align="right" alt="Hana"/>

---

## Features

### 🖥️ Two UI Modes
Toggle between modes from the top-right corner:

| Mode | Description |
|---|---|
| **COMPANION** | Fullscreen Live2D, voice-only / always-listen. Ask about temp/humidity/CO₂ and Hana calls `show_graph`, rendering a chart in chat. |
| **COMMANDER** | Text-only, device control toggles (LED / AC / door / solar), energy-flow SVG diagram (solar+city → home → devices), advanced AC schedule panel. |

### 🤖 AI Tools
| Tool | Description |
|---|---|
| `control_device` | Controls LED / AC / door / solar via Pico W |
| `show_graph` | Plots metric (temp / humidity / CO₂), range: `now` or `allday` |
| `set_ac_schedule` / `cancel_ac_schedule` | Schedule or cancel AC automation |
| `set_calendar_reminder` / `cancel_calendar_reminder` | One-time or weekly spoken reminders; AI auto-converts Thai Buddhist-era dates |

### 📡 Pico W Bridge
- Pico W connects over WiFi, POSTs sensor data to `/api/pico/sensor`
- Polls `/api/pico/commands` every 2 s
- Browser reads `/api/pico/state` and POSTs device toggles to `/api/pico/command`
- Server tracks online/offline status (30 s timeout) and device states

### 🌡️ Sensors
| Sensor | Function |
|---|---|
| DHT22 | Temperature & humidity |
| MQ2 | Analog gas sensor (rough air-quality proxy) |
| INA219 | I2C voltage / current / power — solar & battery monitoring |

### 💡 Devices
- LED relay
- AC relay
- Solar relay
- Servo-driven door lock (PWM)

---

## Setup

```bash
# Install Edge TTS (no virtualenv/distrobox needed)
pip install --user edge-tts

# Run the server
node server.js
```

Server listens on port **24693**.

---

## Project Layout
