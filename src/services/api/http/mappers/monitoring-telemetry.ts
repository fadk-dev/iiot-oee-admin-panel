/**
 * Mapper backend→lokal — telemetri histori + agregat + rollup + pareto.
 *
 * Dipisah dari mappers/monitoring.ts pada refactoring E31.15 (FAT-278, R10:
 * satu file mapper = satu domain). Barrel penggabung: mappers/monitoring.ts.
 */
import { HourlyOeePoint, RejectParetoItem, TelemetryHistoryRecord, TelemetryRollupItem, TelemetryAggregatePoint } from '../../../../types/analytics';
import { MachineFsmState } from '../../../../types/monitoring';
import { TelemetryRollupItemSchema, TelemetryAggregatePointSchema } from '../../schemas';
import { normalizeFsmState } from '../../../../utils/oeeCalculations';
import { num, str, bool, iso, pick, mustParse, splitList } from '../primitives';

export function mapTelemetryHistory(raw: unknown): TelemetryHistoryRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  const total = num(pick(r.totalCount, r.total_count), 0);
  const good = num(pick(r.goodCount, r.good_count), 0);
  const reject = num(pick(r.rejectCount, r.reject_count), 0);
  // E23 Batch 2 (FAT-190, N-21): spec live membawa `currentState`,
  // `operatingTimeSec`, `runTimeSec`, `actualCycleTimeSec` (string detik,
  // nullable) — keempatnya dulu dilewatkan mapper (fsm_state selalu
  // 'UNCONFIGURED', cycle_time_ms 0). Alias lama tetap fallback.
  const cycleSec = pick(r.actualCycleTimeSec, r.actual_cycle_time_sec, r.lastCycleTimeSec, r.last_cycle_time_sec);
  const lastCycleSec = cycleSec !== undefined ? num(cycleSec, 0) : undefined;
  return {
    id: String(pick(r.id, r.recordedAt, r.recorded_at) ?? `${pick(r.deviceId, r.device_id)}-${pick(r.recordedAt, r.recorded_at)}`),
    device_id: str(pick(r.deviceId, r.device_id)),
    timestamp: iso(pick(r.recordedAt, r.recorded_at, r.timestamp, r.bucket)),
    fsm_state: normalizeFsmState(str(pick(r.currentState, r.state, r.fsm_state), 'UNCONFIGURED')) as MachineFsmState,
    total_count: total,
    good_count: good,
    reject_count: reject,
    totalCount: total,
    goodCount: good,
    rejectCount: reject,
    operatingTimeSec: num(pick(r.operatingTimeSec, r.operating_time_sec, r.operatingSec, r.operating_sec), 0) || undefined,
    runTimeSec: num(pick(r.runTimeSec, r.run_time_sec, r.runSec, r.run_sec), 0) || undefined,
    downtimeSec: num(pick(r.downtimeSec, r.downtime_sec), 0) || undefined,
    lastCycleTimeSec: lastCycleSec || undefined,
    oee: num(pick(r.oeePct, r.oee), 0),
    availability: num(pick(r.availabilityPct, r.availability), 0),
    performance: num(pick(r.performancePct, r.performance), 0),
    quality: num(pick(r.qualityPct, r.quality), 0),
    // E12 T12.15 (F-11 / FAT-67): satuan cycle_time_ms ditentukan oleh NAMA
    // field, bukan urutan fallback — `cycleTimeMs`/`cycle_time_ms` SUDAH
    // milidetik (×1), `lastCycleTimeSec`/`last_cycle_time_sec` detik (×1000).
    // Hitungan lama `pick(cycleTimeMs, lastCycleTimeSec, last_cycle_time_sec)
    // × 1000` mengalikan nilai ms dengan 1000 bila server mengirim
    // cycleTimeMs → nilai di layar Raw 1000× lebih besar tanpa tanda apa pun
    // (G20). Prioritas: field ms dulu (tanpa konversi, paling cocok dengan
    // nama field target), lalu field detik. Layar Raw + CSV menampilkan
    // detik (`cycle_time_sec` = lastCycleTimeSec, fallback cycle_time_ms /
    // 1000) — konsisten dengan nilai ms yang benar di sini.
    // E23 Batch 2 (FAT-190, N-21): sumber detik kanonis spec live adalah
    // `actualCycleTimeSec` (string, nullable) — didahulukan atas alias
    // lama `lastCycleTimeSec`.
    cycle_time_ms: (() => {
      const ms = pick(r.cycleTimeMs, r.cycle_time_ms);
      if (ms !== undefined) return num(ms, 0);
      return num(pick(r.actualCycleTimeSec, r.actual_cycle_time_sec, r.lastCycleTimeSec, r.last_cycle_time_sec), 0) * 1000;
    })(),
    temperature_c: num(pick(r.machineTempC, r.tempC, r.temperature_c), 0) || undefined,
    is_buffered: bool(pick(r.isBuffered, r.is_buffered), false),
  };
}

/**
 * E20 P20.5 (FAT-157): `*Pct` nullable dipertahankan — `pick` membuang
 * `null`, jadi baca langsung dari field (bukan lewat `pick` + `num(..., 0)`).
 * Absen → `null` (unknown); string-numeric ("92.50") diparse ke number.
 * D-8: `oee` null saat kapasitas unknown, bukan 0.
 */
export function pctOrNull(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === undefined) continue;
    if (v === null) return null;
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function mapHourly(raw: unknown): HourlyOeePoint {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    hour: str(pick(r.bucket, r.hour), ''),
    bucket: str(pick(r.bucket), undefined) || undefined,
    oee: pctOrNull(r.oeePct, r.oee),
    availability: pctOrNull(r.availabilityPct, r.availability),
    performance: pctOrNull(r.performancePct, r.performance),
    quality: pctOrNull(r.qualityPct, r.quality),
    // E28 Batch A (FAT-218 E2E-04 + FAT-213 N-43): totalCount null/absen =
    // jumlah tidak diketahui → null (tampil '—'), BUKAN 0. `pick` membuang
    // null, jadi baca field mentah seperti pctOrNull di atas.
    parts_produced: (() => {
      const total = r.totalCount !== undefined ? r.totalCount : r.total_count;
      return total === undefined || total === null ? null : num(total, 0);
    })(),
    defect_count: num(pick(r.rejectCount, r.reject_count), 0),
    good_count: num(pick(r.goodCount, r.good_count), 0) || undefined,
    hourly_operating_sec: num(pick(r.operatingSec, r.operating_sec), 0) || undefined,
    hourly_run_sec: num(pick(r.runSec, r.run_sec), 0) || undefined,
    sampleCount: num(pick(r.sampleCount, r.sample_count), 0) || undefined,
    // E12 T12.3 (F-6): pertahankan null (kapasitas unknown) — `pick`
    // membuang null sehingga sinyal kapasitas 0/unknown dari server hilang;
    // tabel per jam memakai targetPerHour null/0 untuk menampilkan
    // "— (Kapasitas 0/Unknown)" seperti rollup. Tanpa field dari server →
    // undefined (nilai tampil apa adanya).
    targetPerHour: (r.targetPerHour !== undefined ? r.targetPerHour : r.target_per_hour) as number | null | undefined,
    state: (pick(r.state) as MachineFsmState | null) ?? undefined,
    planned: bool(pick(r.planned), false),
    provisional: bool(pick(r.provisional), false),
    deviceId: (pick(r.deviceId, r.device_id) as string | null) ?? null,
    machineId: (pick(r.machineId, r.machine_id) as string | null) ?? null,
    woId: (pick(r.woId, r.wo_id) as string | null) ?? null,
  };
}

/**
 * E12 T12.2 (F-5 / FAT-51): satu baris agregat per bucket — dipakai
 * getTelemetryAggregate untuk SELURUH rows, bukan hanya rows[0].
 * Menerima field kanonis API doc §K.4/§Q (`oeePct`, `totalCount`, …) plus
 * alias legacy/snake_case dan bentuk ringkasan lama (`avg_oee`,
 * `total_parts`, `sample_count`) agar respons lama tetap termuat.
 *
 * E23 Batch 1 (FAT-180, N-11): spec live TIDAK membawa
 * `totalCount/goodCount/rejectCount` — item hanya membawa
 * `outputDelta/rejectDelta/goodDelta` (+ `sampleCount`). Bila count
 * eksplisit absen, turunkan dari delta (total = outputDelta, atau
 * good+reject bila outputDelta null); count eksplisit (demo/bentuk lama)
 * tetap menang. Tanpa ini `total_parts` selalu 0.
 */
export function mapAggregate(raw: unknown): TelemetryAggregatePoint {
  const r = (raw ?? {}) as Record<string, unknown>;
  const numOrNull = (v: unknown): number | null =>
    v === undefined || v === null ? null : Number.isFinite(num(v, NaN)) ? num(v, 0) : null;
  const outputDelta = numOrNull(pick(r.outputDelta, r.output_delta));
  const rejectDelta = numOrNull(pick(r.rejectDelta, r.reject_delta));
  const goodDelta = numOrNull(pick(r.goodDelta, r.good_delta));
  const totalRaw = pick(r.totalCount, r.total_count, r.total_parts, r.totalParts);
  const rejectRaw = pick(r.rejectCount, r.reject_count);
  const goodRaw = pick(r.goodCount, r.good_count);
  const rejectCount = rejectRaw !== undefined ? num(rejectRaw, 0) : (rejectDelta ?? 0);
  // API doc §Q: good = max(0, output − reject) bila tidak dikirim eksplisit.
  const totalCount =
    totalRaw !== undefined
      ? num(totalRaw, 0)
      : (outputDelta ?? (goodDelta ?? 0) + rejectCount);
  const item = {
    bucket: str(pick(r.bucket, r.bucket_start, r.bucketStart, r.hour), ''),
    totalCount,
    goodCount: goodRaw !== undefined ? num(goodRaw, 0) : (goodDelta ?? Math.max(0, totalCount - rejectCount)),
    rejectCount,
    operatingSec: num(pick(r.operatingSec, r.operating_sec), 0),
    runSec: num(pick(r.runSec, r.run_sec), 0),
    // E20 P20.5 (FAT-157): `*Pct` nullable dipertahankan (bukan 0) —
    // baca langsung dari field; alias legacy (`avg_*`) hanya fallback.
    availabilityPct: pctOrNull(r.availabilityPct, r.availability_pct, r.avg_availability, r.availability),
    performancePct: pctOrNull(r.performancePct, r.performance_pct, r.avg_performance, r.performance),
    qualityPct: pctOrNull(r.qualityPct, r.quality_pct, r.avg_quality, r.quality),
    oeePct: pctOrNull(r.oeePct, r.oee_pct, r.avg_oee, r.oee),
    sampleCount: num(pick(r.sampleCount, r.sample_count), 0),
    provisional: bool(pick(r.provisional), false),
    outputDelta,
    goodDelta,
    rejectDelta,
  };
  return mustParse(TelemetryAggregatePointSchema, item, 'agregat telemetri');
}

export function mapRollup(raw: unknown): TelemetryRollupItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  // E23 Batch 3 (FAT-195, N-26): spec live groupBy mencakup 'line'
  // (skema Zod diperluas); `lineId` item ikut dipetakan dan dipakai
  // sebagai groupKey baris lini.
  const lineId = (pick(r.lineId, r.line_id) as string | null) ?? null;
  const groupBy = (pick(r.groupBy, r.group_by) as TelemetryRollupItem['groupBy']) ?? 'day';
  // FAT-307: groupKey mengikuti groupBy baris. Sebelumnya pick selalu
  // mendahulukan lineId/machineId sehingga rollup Per Hari (groupBy=day)
  // menampilkan ID mesin di kolom TANGGAL — server mengirim `bucket`
  // (tanggal) DAN `machineId`, dan machineId menang (terbukti live
  // 2026-11-23: 3 baris "CNC-MILLING-SIM" di kolom TANGGAL).
  const groupKey =
    groupBy === 'day' || groupBy === 'month'
      ? str(pick(r.bucket, r.groupKey, r.machineId, r.machine_id, r.lineId, r.line_id, r.deviceId, r.device_id), 'row')
      : groupBy === 'line'
        ? str(pick(r.groupKey, r.lineId, r.line_id, r.bucket), 'row')
        : str(pick(r.groupKey, r.machineId, r.machine_id, r.deviceId, r.device_id, r.bucket), 'row');
  const item = {
    groupBy,
    groupKey,
    bucket: (pick(r.bucket) as string | null) ?? null,
    machineId: (pick(r.machineId, r.machine_id) as string | null) ?? null,
    machine_id: (pick(r.machineId, r.machine_id) as string | null) ?? null,
    machine_name: (pick(r.machineName, r.machine_name) as string | null) ?? null,
    device_id: (pick(r.deviceId, r.device_id) as string | null) ?? null,
    lineId,
    totalCount: num(pick(r.totalCount, r.total_count), 0),
    goodCount: num(pick(r.goodCount, r.good_count), 0),
    rejectCount: num(pick(r.rejectCount, r.reject_count), 0),
    operatingSec: num(pick(r.operatingSec, r.operating_sec), 0),
    runSec: num(pick(r.runSec, r.run_sec), 0),
    availabilityPct: pctOrNull(r.availabilityPct, r.availability_pct),
    performancePct: pctOrNull(r.performancePct, r.performance_pct),
    qualityPct: pctOrNull(r.qualityPct, r.quality_pct),
    oeePct: pctOrNull(r.oeePct, r.oee_pct),
    sampleCount: num(pick(r.sampleCount, r.sample_count), 0),
    provisional: bool(pick(r.provisional), false),
  };
  return mustParse(TelemetryRollupItemSchema, item, 'rollup OEE');
}

export function mapReject(raw: unknown, runningTotal: { total: number; cumulative: number }): RejectParetoItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  const count = num(pick(r.count), 0);
  const pct = num(pick(r.pct, r.percentage), 0);
  runningTotal.cumulative += pct;
  return {
    reason: str(pick(r.reason), 'UNCLASSIFIED'),
    count,
    pct,
    percentage: pct,
    cumulative_percentage: Math.min(100, Math.round(runningTotal.cumulative * 10) / 10),
  };
}

export function paretoFromRows(raw: unknown): RejectParetoItem[] {
  const { items } = splitList(raw);
  const total = items.reduce<number>((sum, it) => sum + num((it as Record<string, unknown>).count, 0), 0);
  const runningTotal = { total, cumulative: 0 };
  return items.map((it) => {
    const rec = it as Record<string, unknown>;
    const enriched = {
      ...rec,
      pct: rec.pct ?? rec.percentage ?? (total > 0 ? (num(rec.count, 0) / total) * 100 : 0),
    };
    return mapReject(enriched, runningTotal);
  });
}
