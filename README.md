# Sensor AI

A smart home voice assistant backend with Claude integration. Combines speech recognition, intent classification, and device control (AC, lights, sensors) via a Raspberry Pi Pico W.

<img src="screenshot.png" width="200" alt="Sensor AI Assistant"/>

## Quick Start

```bash
node server.js
```

Runs on `http://localhost:24693`

**Prerequisites:**
- Claude CLI authenticated (`claude login`) — required for CLI mode (default)
- `edge-tts` installed (`pip install edge-tts`)
- `distrobox` with Ubuntu container (for faster-whisper STT)

## Claude Auth Modes

Two interchangeable ways to authenticate to Claude — set via the `CLAUDE_MODE` env var:

| Mode | `CLAUDE_MODE` | Requires | Notes |
|---|---|---|---|
| **CLI** (default) | `cli` or unset | `claude login` | Reuses the Claude CLI's own OAuth token — no separate API billing |
| **API** | `api` | `ANTHROPIC_API_KEY` env var | Standalone Anthropic API key, billed separately |

```bash
# CLI mode (default)
node server.js

# API mode
CLAUDE_MODE=api ANTHROPIC_API_KEY=sk-ant-... node server.js
```

Check the active mode and auth status: `GET /api/status` → `{ ok, mode, error }`.

## Architecture

### Backend (server.js)
HTTP server with APIs for:
- **Chat** (`/api/chat`) — proxies messages to Claude
- **STT** (`/api/stt`) — transcribes audio (webm) via faster-whisper
- **TTS** (`/api/tts`) — synthesizes speech via edge-tts
- **Intent classification** (`/api/classify`) — two-layer system:
  1. Rule-based: detects wake word "Neko" / "เนโกะ"
  2. Claude Haiku: classifies ambiguous cases
- **AC control** (`/api/ac`) — manual/auto/schedule modes
- **Calendar** (`/api/calendar`) — one-time and weekly reminders
- **Pico W bridge** (`/api/pico/*`) — sensor data & device commands

### Frontend
React components (`main.jsx`, `app.jsx`, `viz.jsx`) with:
- Live2D animated character (via Cubism SDK)
- Real-time sensor graphs
- Chat interface
- Device controls

### Hardware Bridge
Pico W mocks in `server.js` for now:
- Sensors: temperature, humidity, CO2, light (photoresistor, GP27/ADC1), sound (GP28/ADC2)
- Devices: AC, LED, door lock, solar panel
- Polling endpoint for commands; POST for sensor updates

## File Structure

```
server.js              Main HTTP server
main.jsx              React entry point
app.jsx               Chat & device UI
viz.jsx               Sensor graphs
index.html            Static HTML
stt.py                STT wrapper (distrobox)
live2d/               Live2D model assets
pico/                 Pico W firmware (placeholder)
```

## Environment

CLI mode (default) uses `~/.claude/.credentials.json` for the Claude token (populated by `claude login`). API mode uses the `ANTHROPIC_API_KEY` env var instead — see [Claude Auth Modes](#claude-auth-modes).

## Running

```bash
# Start server on port 24693
node server.js

# Open browser to http://localhost:24693
```

## Intent Classification

Wake word triggers immediate response. Otherwise, queries like "what's the temperature?" or "turn on AC" are sent to Claude Haiku for classification. Ambient speech is ignored.

## AC Control Modes

- **Manual**: user toggles on/off
- **Auto**: responds to temperature thresholds (26°C on, 24°C off) or CO2 > 900 ppm
- **Schedule**: turns on/off at a future time

## Reminders

Create one-time reminders by datetime or recurring weekly at a specific day/time. Fired reminders are queued for TTS announcement.

## Notes

- All API responses include `Access-Control-Allow-Origin: *` for CORS
- Pico W online status checked every 30 seconds; sensor history limited to 120 readings (~20 min)
- Thai language support throughout (error messages, logging, UI)

## Credits

- Live2D model (`live2d/free1.*`) by **comte19**
- Live2D Cubism SDK by Live2D Inc.
- Claude (Anthropic) — chat, intent classification (Claude Haiku)
