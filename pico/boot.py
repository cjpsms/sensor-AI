import network
import time
from config import WIFI_SSID, WIFI_PASSWORD

wlan = network.WLAN(network.STA_IF)


def connect_wifi(timeout=20):
    """Connect (or confirm connection). Returns IP string or None — never raises."""
    wlan.active(True)
    if wlan.isconnected():
        return wlan.ifconfig()[0]

    print('Connecting to', WIFI_SSID, '...')
    try:
        wlan.connect(WIFI_SSID, WIFI_PASSWORD)
    except OSError as e:
        print('wlan.connect error:', e)
        return None

    for _ in range(timeout):
        if wlan.isconnected():
            ip = wlan.ifconfig()[0]
            print('WiFi OK - IP:', ip)
            return ip
        time.sleep(1)

    print('WiFi connect timed out')
    return None


# Keep retrying at boot so the device always comes up online (don't crash on failure).
attempt = 0
while connect_wifi() is None:
    attempt += 1
    print('Retry WiFi in 3s (attempt %d)' % attempt)
    time.sleep(3)
