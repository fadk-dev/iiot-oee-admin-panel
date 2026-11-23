/**
 * FAT-304 (P33.8): keluarga event Opsi 3 — pemetaan `event_type` ke kategori.
 *
 * Pemetaan ini SAMA PERSIS dengan tabel §1
 * `docs/BACKEND_REQUIREMENTS_E33_PAGES.md` (kontrak backend B33.1):
 * 32 nilai eksplisit enum tertutup + 3 pola.
 *
 * - `operational` — keluarga perangkat/proses: 14 nilai eksplisit +
 *   pola `DEVICE_EVENT_<n>`.
 * - `system` — keluarga admin/sistem: 18 nilai eksplisit (termasuk
 *   `OPERATIONAL_EVENT_ACKNOWLEDGED` — entri ack adalah aksi manusia
 *   terhadap sistem — dan `SECURITY_REJECTION`) + pola
 *   `COMMAND_<cmd>_DISPATCHED` + `MQTT_ADMIN_<op>`.
 *
 * Dipakai panel saja untuk membatasi pilihan dropdown "Event Type" per
 * halaman (Alarm & Event = operasional, Audit Trail = sistem), tanpa
 * menunggu backend B33.1. Nilai yang tidak dikenal (event_type baru yang
 * belum masuk tabel) jatuh ke `system` — lebih aman tampil di arsip
 * audit daripada hilang dari kedua dropdown.
 */
import { OPERATIONAL_EVENT_TYPES, type EventCategory, type OperationalEventType } from '../../types/monitoring';

export type { EventCategory } from '../../types/monitoring';

/** 14 nilai eksplisit keluarga operasional (sisanya = sistem). */
const OPERATIONAL_TYPES = new Set<string>([
  'DEVICE_CREDENTIAL_ROTATED',
  'DEVICE_CREDENTIAL_ROTATION_REFUSED',
  'DEVICE_OFFLINE',
  'DEVICE_ONLINE',
  'DEVICE_PROVISIONED',
  'DEVICE_REVOKED',
  'MACHINE_BOUND',
  'MACHINE_UNBOUND',
  'WO_DISPATCH_ACK_ERROR',
  'WO_DISPATCH_ACK_SUCCESS',
  'WO_DISPATCH_INITIATED',
  'WO_DISPATCH_TIMEOUT_UNACKNOWLEDGED',
  'WORK_ORDER_CANCELLED',
  'WORK_ORDER_COMPLETED',
]);

export function eventTypeCategory(type: string): EventCategory {
  if (type.startsWith('DEVICE_EVENT_')) return 'operational';
  if (type.startsWith('MQTT_ADMIN_')) return 'system';
  if (type.startsWith('COMMAND_') && type.endsWith('_DISPATCHED')) return 'system';
  return OPERATIONAL_TYPES.has(type) ? 'operational' : 'system';
}

/**
 * Daftar opsi dropdown "Event Type" untuk satu kategori, dalam urutan yang
 * sama dengan `OPERATIONAL_EVENT_TYPES` (stabil, tidak diurutkan ulang).
 * Pola (`DEVICE_EVENT_<n>`, `COMMAND_*`, `MQTT_ADMIN_*`) tidak
 * dienumerasi — sama seperti sebelumnya.
 */
export function eventTypeOptionsForCategory(category: EventCategory): OperationalEventType[] {
  return OPERATIONAL_EVENT_TYPES.filter((t) => eventTypeCategory(t) === category);
}
