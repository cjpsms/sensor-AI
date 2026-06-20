# ── WiFi ──────────────────────────────────────────────────────────────────────
WIFI_SSID     = 'YOUR_WIFI_NAME'
WIFI_PASSWORD = 'YOUR_WIFI_PASSWORD'

# ── PC server (sensor-ai) ──────────────────────────────────────────────────────
SERVER_IP   = '192.168.1.100'   # change to your PC's local IP (run `hostname -I` on the PC)
SERVER_PORT = 24693

# ── Identity ───────────────────────────────────────────────────────────────────
SENSOR_ID = 'smartlab-floor3'   # free-form label sent with each sensor payload

# ── GPIO pins ──────────────────────────────────────────────────────────────────
# Relays (digital out). Wire each GPIO to a relay-module input (active-high).
PIN_LED      = 0    # relay / LED
PIN_AC       = 1    # relay for AC
PIN_SOLAR    = 3    # relay for solar switch

PIN_DHT      = 4    # DHT22 temp+humidity data pin (add ~10k pull-up to 3V3)

# Door lock — SG90-style servo (PWM), not a relay. Signal wire to GPIO, 5V (VBUS) + GND for power.
PIN_DOOR          = 2    # PWM signal pin for door servo
SERVO_OPEN_ANGLE  = 90   # degrees when "open"
SERVO_CLOSED_ANGLE = 0   # degrees when "closed"

# MQ2 gas sensor (analog out) — wire AOUT to an ADC-capable pin (GP26/27/28 = ADC0/1/2).
# MQ2 VCC needs 5V (VBUS pin 40); AOUT is 0-3.3V safe for the Pico's ADC.
PIN_MQ2      = 26   # Pico ADC0 (GP26)

# Photoresistor (light level, analog out) — outdoor light intensity.
PIN_LIGHT    = 27   # Pico ADC1 (GP27)

# Sound sensor (analog out) — indoor noise level.
PIN_SOUND    = 28   # Pico ADC2 (GP28)

# INA219 voltage/current sensor (I2C) — solar panel/battery monitoring.
PIN_I2C_SDA       = 8    # I2C0 SDA (GP8)
PIN_I2C_SCL       = 9    # I2C0 SCL (GP9)
INA219_ADDR       = 0x40
INA219_SHUNT_OHMS = 0.1   # match the shunt resistor on your breakout
INA219_MAX_AMPS   = 2.0   # expected max current through the shunt

# ── Intervals ──────────────────────────────────────────────────────────────────
SENSOR_INTERVAL_MS  = 10_000   # send sensor data every 10 s
COMMAND_INTERVAL_MS = 2_000    # poll commands every 2 s
