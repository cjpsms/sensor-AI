from machine import I2C

_REG_CONFIG       = 0x00
_REG_SHUNTVOLTAGE = 0x01
_REG_BUSVOLTAGE   = 0x02
_REG_POWER        = 0x03
_REG_CURRENT      = 0x04
_REG_CALIBRATION  = 0x05

_CONFIG_32V_2A = 0x399F  # 32V bus range, /8 gain, 12-bit res, continuous shunt+bus


class INA219:
    def __init__(self, i2c, addr=0x40, shunt_ohms=0.1, max_expected_amps=2.0):
        self.i2c = i2c
        self.addr = addr
        self._current_lsb = max_expected_amps / 32768   # amps per bit
        self._power_lsb = self._current_lsb * 20         # watts per bit
        self._calibration = int(0.04096 / (self._current_lsb * shunt_ohms))
        self._write16(_REG_CONFIG, _CONFIG_32V_2A)
        self._write16(_REG_CALIBRATION, self._calibration)

    def _write16(self, reg, value):
        self.i2c.writeto_mem(self.addr, reg, bytes([(value >> 8) & 0xFF, value & 0xFF]))

    def _read16(self, reg):
        data = self.i2c.readfrom_mem(self.addr, reg, 2)
        val = (data[0] << 8) | data[1]
        if val > 32767:
            val -= 65536
        return val

    def bus_voltage(self):
        raw = self._read16(_REG_BUSVOLTAGE)
        return (raw >> 3) * 0.004   # volts (4mV/bit after dropping status bits)

    def shunt_voltage(self):
        return self._read16(_REG_SHUNTVOLTAGE) * 0.00001   # volts (10uV/bit)

    def current(self):
        # calibration register can drift on noisy supplies — re-write before each read
        self._write16(_REG_CALIBRATION, self._calibration)
        return self._read16(_REG_CURRENT) * self._current_lsb   # amps

    def power(self):
        return self._read16(_REG_POWER) * self._power_lsb   # watts
