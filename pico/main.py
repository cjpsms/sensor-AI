import time
import json
import gc
import dht
import urequests
from machine import Pin, ADC, PWM, I2C, WDT

from boot import wlan, connect_wifi
from ina219 import INA219
from config import (
    SERVER_IP, SERVER_PORT, SENSOR_ID,
    PIN_LED, PIN_AC, PIN_DOOR, PIN_SOLAR, PIN_DHT, PIN_MQ2, PIN_LIGHT, PIN_SOUND,
    PIN_I2C_SDA, PIN_I2C_SCL, INA219_ADDR, INA219_SHUNT_OHMS, INA219_MAX_AMPS,
    SERVO_OPEN_ANGLE, SERVO_CLOSED_ANGLE,
    SENSOR_INTERVAL_MS, COMMAND_INTERVAL_MS,
)

BASE_URL = 'http://%s:%d' % (SERVER_IP, SERVER_PORT)

# ── Pins ───────────────────────────────────────────────────────────────────────
RELAYS = {
    'led':   Pin(PIN_LED,   Pin.OUT, value=0),
    'ac':    Pin(PIN_AC,    Pin.OUT, value=0),
    'solar': Pin(PIN_SOLAR, Pin.OUT, value=0),
}
dht_sensor = dht.DHT22(Pin(PIN_DHT))

# MQ2 gas sensor on ADC0 (GP26) — analog output, 0-65535 raw reading
mq2 = ADC(Pin(PIN_MQ2))

# Photoresistor on ADC1 (GP27) and sound sensor on ADC2 (GP28) — analog, 0-65535 raw
light_sensor = ADC(Pin(PIN_LIGHT))
sound_sensor = ADC(Pin(PIN_SOUND))

# INA219 voltage/current sensor on I2C0 (GP8=SDA, GP9=SCL) — solar/battery monitoring
i2c = I2C(0, sda=Pin(PIN_I2C_SDA), scl=Pin(PIN_I2C_SCL))
ina219 = INA219(i2c, addr=INA219_ADDR, shunt_ohms=INA219_SHUNT_OHMS, max_expected_amps=INA219_MAX_AMPS)

# Door lock servo (SG90-style) on PWM, 50 Hz
door_servo = PWM(Pin(PIN_DOOR))
door_servo.freq(50)
door_state = {'open': False}


def set_servo_angle(angle):
    # SG90 pulse range: 0.5ms (0°) to 2.5ms (180°) within a 20ms period
    duty_ns = int(500_000 + (angle / 180) * 2_000_000)
    door_servo.duty_ns(duty_ns)


def set_door(open_):
    set_servo_angle(SERVO_OPEN_ANGLE if open_ else SERVO_CLOSED_ANGLE)
    door_state['open'] = open_


set_door(False)   # start closed

# Hardware watchdog — resets the Pico if the loop ever hangs (max ~8.3 s on RP2040)
wdt = WDT(timeout=8000)


# ── WiFi keepalive ───────────────────────────────────────────────────────────────
def ensure_wifi():
    if wlan.isconnected():
        return True
    print('WiFi dropped - reconnecting...')
    # feed the watchdog while we wait so a slow reconnect doesn't trigger a reset
    for _ in range(10):
        wdt.feed()
        if connect_wifi(timeout=1):
            return True
    return False


# ── Gas sensor (MQ2) ───────────────────────────────────────────────────────────
def read_co2():
    # raw 16-bit ADC reading (0-65535); MQ2 has no built-in ppm calibration
    return mq2.read_u16()


# ── Power sensor (INA219) ───────────────────────────────────────────────────────
def read_power():
    try:
        return {
            'voltage': ina219.bus_voltage(),
            'current_ma': ina219.current() * 1000,
            'power_mw': ina219.power() * 1000,
        }
    except Exception as e:
        print('INA219 read error:', e)
        return {'voltage': None, 'current_ma': None, 'power_mw': None}


# ── Read all sensors ───────────────────────────────────────────────────────────
def read_sensors():
    try:
        dht_sensor.measure()
        temp = dht_sensor.temperature()
        hum = dht_sensor.humidity()
    except Exception as e:
        print('DHT read error:', e)
        temp, hum = None, None

    data = {
        'device_id': SENSOR_ID,
        'temp': temp,
        'humidity': hum,
        'co2': read_co2(),
        'light': light_sensor.read_u16(),
        'sound': sound_sensor.read_u16(),
    }
    data.update(read_power())
    return data


# ── Send sensor data to PC (leak-safe) ──────────────────────────────────────────
def push_sensor(data):
    r = None
    try:
        r = urequests.post(
            BASE_URL + '/api/pico/sensor',
            headers={'Content-Type': 'application/json'},
            data=json.dumps(data),
        )
    except Exception as e:
        print('push_sensor error:', e)
    finally:
        if r:
            r.close()


# ── Poll commands from PC (leak-safe) ───────────────────────────────────────────
def poll_commands():
    r = None
    try:
        r = urequests.get(BASE_URL + '/api/pico/commands')
        return r.json()
    except Exception as e:
        print('poll_commands error:', e)
        return []
    finally:
        if r:
            r.close()


# ── Execute a command  { device: 'led'|'ac'|'door'|'solar', value: bool } ────────
def execute(cmd):
    device = cmd.get('device')
    on = bool(cmd.get('value'))

    if device == 'door':
        set_door(on)
        print('door -> %s' % ('OPEN' if on else 'CLOSED'))
        return

    relay = RELAYS.get(device)
    if relay is None:
        return
    relay.value(1 if on else 0)
    print('%s -> %s' % (device, 'ON' if on else 'OFF'))


# ── Main loop ──────────────────────────────────────────────────────────────────
print('Pico W ready ->', BASE_URL)

last_sensor = time.ticks_ms() - SENSOR_INTERVAL_MS   # send once immediately
last_cmd = time.ticks_ms()

while True:
    wdt.feed()
    now = time.ticks_ms()

    if not wlan.isconnected():
        ensure_wifi()

    if wlan.isconnected():
        if time.ticks_diff(now, last_sensor) >= SENSOR_INTERVAL_MS:
            data = read_sensors()
            print('Sensor:', data)
            push_sensor(data)
            last_sensor = now

        if time.ticks_diff(now, last_cmd) >= COMMAND_INTERVAL_MS:
            for cmd in poll_commands():
                execute(cmd)
            last_cmd = now

    gc.collect()
    time.sleep_ms(100)
