import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperationalEvent } from '../../../types/monitoring';
import { OperationalEventMachineCell } from './OperationalEventMachineCell';

// ---------------------------------------------------------------------------
// E27 (FAT-233, T2): badge "Tidak terdaftar" pada sel Mesin/Device.
// Aturan: tampil HANYA bila device_id === null DAN station_label ada
// (non-kosong setelah trim). Bila device_id ada → tidak tampil walau label
// ada. Label kosong / hanya spasi → tidak tampil. Render via
// renderToStaticMarkup (tanpa jsdom — repo ini tidak memakai jsdom).
// ---------------------------------------------------------------------------

function baseEvent(overrides: Partial<OperationalEvent> = {}): OperationalEvent {
  return {
    id: 'op-ev-900',
    recorded_at: '2026-11-20T00:30:00Z',
    device_id: null,
    station_label: null,
    machine_id: null,
    machine_name: null,
    wo_id: null,
    event_type: 'SECURITY_REJECTION',
    category: 'system',
    alarm_state: 'active-unack',
    condition: 'NORMAL',
    trigger_source: 'AUTH',
    event_code: null,
    snapshot_total_count: null,
    snapshot_run_sec: null,
    description: 'station_id is not a registered station',
    acknowledged: false,
    acknowledged_at: null,
    acknowledged_by: null,
    ack_note: null,
    created_at: '2026-11-20T00:30:00Z',
    ...overrides,
  };
}

function render(ev: OperationalEvent): string {
  return renderToStaticMarkup(React.createElement(OperationalEventMachineCell, { ev }));
}

test('badge "Tidak terdaftar" tampil bila device_id null + station_label ada', () => {
  const html = render(baseEvent({ station_label: 'STATION-UNKNOWN-XYZ' }));
  assert.ok(html.includes('STATION-UNKNOWN-XYZ'), 'label mentah tampil apa adanya');
  assert.ok(html.includes('Tidak terdaftar'), 'badge tampil');
});

test('badge tidak tampil bila device_id ada walau station_label ada', () => {
  const html = render(
    baseEvent({ device_id: 'STM32-OEE-01', station_label: 'KIOSK-01', machine_name: 'CNC Milling Center Alpha' })
  );
  assert.ok(html.includes('KIOSK-01'), 'label tetap tampil sebagai teks biasa');
  assert.ok(!html.includes('Tidak terdaftar'), 'badge tidak tampil untuk device terdaftar');
});

test('badge tidak tampil bila station_label kosong / hanya spasi', () => {
  assert.ok(!render(baseEvent({ station_label: '' })).includes('Tidak terdaftar'));
  assert.ok(!render(baseEvent({ station_label: '   ' })).includes('Tidak terdaftar'));
  assert.ok(!render(baseEvent({ station_label: null })).includes('Tidak terdaftar'));
});

test('station_label dirender sebagai teks (di-escape), bukan HTML', () => {
  const html = render(baseEvent({ station_label: '<script>alert(1)</script>' }));
  assert.ok(!html.includes('<script>alert(1)</script>'), 'tag tidak dirender mentah');
  assert.ok(html.includes('&lt;script&gt;'), 'tag di-escape oleh React');
  assert.ok(html.includes('Tidak terdaftar'), 'badge tetap tampil untuk label berbahaya');
});
