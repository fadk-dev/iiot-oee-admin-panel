/**
 * Registry endpoint — domain monitoring.
 *
 * Dipisah dari file god-file pada refactoring R9 (kontrak docs/DIRECTORY_STRUCTURE.md).
 * Satu file = satu domain. Barrel penggabung ada di file induknya.
 */
import type { EndpointDefinition } from './definition';
import { enc } from './definition';

export const MONITORING_ENDPOINTS: Record<string, EndpointDefinition> = {
LIVE_STATE: {
    key: 'LIVE_STATE',
    method: 'GET',
    template: '/api/v1/live-state',
    buildPath: () => '/api/v1/live-state',
  },

LIVE_STATE_BY_DEVICE: {
    key: 'LIVE_STATE_BY_DEVICE',
    method: 'GET',
    template: '/api/v1/live-state/:deviceId',
    buildPath: (deviceId: string) => `/api/v1/live-state/${enc(deviceId)}`,
  },

DOWNTIME_ACTIVE: {
    key: 'DOWNTIME_ACTIVE',
    method: 'GET',
    template: '/api/v1/downtime-events/active',
    buildPath: () => '/api/v1/downtime-events/active',
  },

DOWNTIME_BY_DEVICE: {
    key: 'DOWNTIME_BY_DEVICE',
    method: 'GET',
    template: '/api/v1/downtime-events/:device_id',
    buildPath: (deviceId: string) => `/api/v1/downtime-events/${enc(deviceId)}`,
  },

DOWNTIME_DEVICE_EXPORT: {
    key: 'DOWNTIME_DEVICE_EXPORT',
    method: 'GET',
    template: '/api/v1/downtime-events/:device_id/export',
    buildPath: (deviceId: string) => `/api/v1/downtime-events/${enc(deviceId)}/export`,
  },

DOWNTIME_REASON: {
    key: 'DOWNTIME_REASON',
    method: 'POST',
    template: '/api/v1/downtime-events/:id/reason',
    buildPath: (id: string) => `/api/v1/downtime-events/${enc(id)}/reason`,
  },

OPERATIONAL_EVENTS_LIST: {
    key: 'OPERATIONAL_EVENTS_LIST',
    method: 'GET',
    // E20 P20.4 (FAT-156, R9): dokumen menulis tanpa trailing slash.
    template: '/api/v1/operational-events',
    buildPath: () => '/api/v1/operational-events',
  },

OPERATIONAL_EVENTS_BY_DEVICE: {
    key: 'OPERATIONAL_EVENTS_BY_DEVICE',
    method: 'GET',
    template: '/api/v1/operational-events/:deviceId',
    buildPath: (deviceId: string) => `/api/v1/operational-events/${enc(deviceId)}`,
  },

OPERATIONAL_EVENTS_EXPORT: {
    key: 'OPERATIONAL_EVENTS_EXPORT',
    method: 'GET',
    template: '/api/v1/operational-events/export',
    buildPath: () => '/api/v1/operational-events/export',
  },

OPERATIONAL_EVENTS_DEVICE_EXPORT: {
    key: 'OPERATIONAL_EVENTS_DEVICE_EXPORT',
    method: 'GET',
    template: '/api/v1/operational-events/:deviceId/export',
    buildPath: (deviceId: string) => `/api/v1/operational-events/${enc(deviceId)}/export`,
  },

OPERATIONAL_EVENTS_ACK: {
    key: 'OPERATIONAL_EVENTS_ACK',
    method: 'PATCH',
    template: '/api/v1/operational-events/:id/ack',
    buildPath: (id: string) => `/api/v1/operational-events/${enc(id)}/ack`,
  },

SYSTEM_AUDIT_TRAIL: {
    key: 'SYSTEM_AUDIT_TRAIL',
    method: 'GET',
    // P33.4 (FAT-294, B33.2): GET /system/audit-trail — store audit
    // append-only terpisah (E33 Opsi 3). Menggantikan /system/audit
    // (alias feed operasional) sebagai sumber halaman Audit Trail; alias
    // lama TIDAK dipakai lagi (satu alur kanonik, tanpa fallback).
    template: '/api/v1/system/audit-trail',
    buildPath: () => '/api/v1/system/audit-trail',
  },

// P33.4 (FAT-294, B33.2): GET /system/audit-trail/export — csv/ndjson/json,
// filter sama dengan daftar KECUALI machine_id (tidak terdaftar di endpoint
// ekspor live), retensi 90 hari, rate limit 5/min, guard `access_control.read`.
SYSTEM_AUDIT_TRAIL_EXPORT: {
    key: 'SYSTEM_AUDIT_TRAIL_EXPORT',
    method: 'GET',
    template: '/api/v1/system/audit-trail/export',
    buildPath: () => '/api/v1/system/audit-trail/export',
  },
};
