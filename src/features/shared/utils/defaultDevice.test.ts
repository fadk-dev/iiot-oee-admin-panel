import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDefaultMachineId } from './defaultDevice';
import type { Machine } from '../../../types/assets';

const machine = (machine_id: string, bound_device_id: string | null): Machine =>
  ({
    machine_id,
    name: machine_id,
    bound_device_id,
    modbus_slave_id: 1,
    created_at: '2026-11-01T00:00:00.000Z',
  }) as Machine;

test('FAT-306: default machine = mesin terikat device online pertama, lalu mesin pertama, lalu undefined', () => {
  // Live: satu mesin terikat device online.
  assert.equal(
    resolveDefaultMachineId(
      [machine('CNC-MILLING-SIM', 'STM32-OEE-SIM'), machine('CNC-LATHE-02', 'STM32-OEE-02')],
      [
        { device_id: 'STM32-OEE-SIM', online: true },
        { device_id: 'STM32-OEE-02', online: false },
      ]
    ),
    'CNC-MILLING-SIM'
  );
  // Tidak ada device online → mesin pertama.
  assert.equal(
    resolveDefaultMachineId(
      [machine('CNC-MILLING-SIM', 'STM32-OEE-SIM'), machine('CNC-LATHE-02', 'STM32-OEE-02')],
      [
        { device_id: 'STM32-OEE-SIM', online: false },
        { device_id: 'STM32-OEE-02', online: false },
      ]
    ),
    'CNC-MILLING-SIM'
  );
  // Daftar mesin kosong / null → undefined (pemanggil tampilkan empty state).
  assert.equal(resolveDefaultMachineId([], [{ device_id: 'STM32-OEE-SIM', online: true }]), undefined);
  assert.equal(resolveDefaultMachineId(null, null), undefined);
  // Demo seed: CNC-MILLING-01 terikat STM32-OEE-01 (online, urutan pertama)
  // → default demo tidak berubah.
  assert.equal(
    resolveDefaultMachineId(
      [machine('CNC-MILLING-01', 'STM32-OEE-01'), machine('CNC-LATHE-02', 'STM32-OEE-02')],
      [
        { device_id: 'STM32-OEE-01', online: true },
        { device_id: 'STM32-OEE-02', online: true },
      ]
    ),
    'CNC-MILLING-01'
  );
  // Mesin terikat device offline saja tidak didahulukan atas mesin pertama
  // yang terikat device online.
  assert.equal(
    resolveDefaultMachineId(
      [machine('CNC-LATHE-02', 'STM32-OEE-02'), machine('CNC-MILLING-SIM', 'STM32-OEE-SIM')],
      [
        { device_id: 'STM32-OEE-02', online: false },
        { device_id: 'STM32-OEE-SIM', online: true },
      ]
    ),
    'CNC-MILLING-SIM'
  );
});
