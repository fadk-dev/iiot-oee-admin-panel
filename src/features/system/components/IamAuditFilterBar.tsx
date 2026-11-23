import React from 'react';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import type { IamAuditDraft } from '../utils/iamAudit';
import { formatIamAuditResultLabel } from '../utils/iamAudit';

interface IamAuditFilterBarProps {
  draft: IamAuditDraft;
  onDraftChange: (patch: Partial<IamAuditDraft>) => void;
  onApply: () => void;
  onReset: () => void;
  /** Pintasan satu klik: keputusan = DENY, langsung terapkan. */
  onDenyOnly: () => void;
  isApplying: boolean;
  /** Total baris yang cocok dengan filter server (dari envelope server). */
  resultCount: number;
  /**
   * Baris yang cocok dengan filter teks Resource/Action DI HALAMAN INI.
   * Ditampilkan hanya bila filter teks aktif — lihat formatIamAuditResultLabel.
   */
  pageMatchCount?: number;
}

/**
 * Filter halaman Audit IAM (P33.6, FAT-301; paging server-side P33.9,
 * FAT-305) — dipindah dari AuditTab (tab lama) dengan tambahan: pintasan
 * "Hanya DENY" dan filter teks Resource/Action (client-side; belum ada di
 * kontrak server).
 *
 * Filter server (Subjek/Keputusan/Mode/Dari/Sampai) dikirim sebagai query
 * ke GET /access-control/audit saat "Terapkan"; Resource/Action hanya
 * menyaring halaman yang sudah dimuat.
 */
export const IamAuditFilterBar: React.FC<IamAuditFilterBarProps> = ({
  draft,
  onDraftChange,
  onApply,
  onReset,
  onDenyOnly,
  isApplying,
  resultCount,
  pageMatchCount,
}) => {
  const textFiltering =
    draft.resourceQuery.trim() !== '' || draft.actionQuery.trim() !== '';
  return (
  <form
    className="flex flex-wrap items-end gap-2"
    onSubmit={(e) => {
      e.preventDefault();
      onApply();
    }}
  >
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Subjek</label>
      <input
        type="search"
        aria-label="Filter subjek"
        value={draft.subject}
        onChange={(e) => onDraftChange({ subject: e.target.value })}
        placeholder="Operator ID..."
        className="w-44 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
      />
    </div>
    <Select
      label="Keputusan"
      value={draft.decision}
      onChange={(e) => onDraftChange({ decision: e.target.value as IamAuditDraft['decision'] })}
      options={[{ value: 'ALL', label: 'Semua' }, { value: 'ALLOW', label: 'ALLOW' }, { value: 'DENY', label: 'DENY' }]}
    />
    <Select
      label="Mode"
      value={draft.mode}
      onChange={(e) => onDraftChange({ mode: e.target.value as IamAuditDraft['mode'] })}
      options={[{ value: 'ALL', label: 'Semua' }, { value: 'shadow', label: 'shadow' }, { value: 'enforce', label: 'enforce' }]}
    />
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Dari</label>
      <input
        type="datetime-local"
        aria-label="Filter dari tanggal"
        value={draft.from}
        onChange={(e) => onDraftChange({ from: e.target.value })}
        className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
      />
    </div>
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Sampai</label>
      <input
        type="datetime-local"
        aria-label="Filter sampai tanggal"
        value={draft.to}
        onChange={(e) => onDraftChange({ to: e.target.value })}
        className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
      />
    </div>
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Resource</label>
      <input
        type="search"
        aria-label="Filter resource"
        value={draft.resourceQuery}
        onChange={(e) => onDraftChange({ resourceQuery: e.target.value })}
        placeholder="mqtt/dynamic-security..."
        className="w-52 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
      />
    </div>
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Action</label>
      <input
        type="search"
        aria-label="Filter action"
        value={draft.actionQuery}
        onChange={(e) => onDraftChange({ actionQuery: e.target.value })}
        placeholder="mqtt.dynamic_security..."
        className="w-52 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
      />
    </div>
    <Button type="button" size="sm" variant="secondary" onClick={onDenyOnly} disabled={isApplying}>
      Hanya DENY
    </Button>
    <Button type="submit" size="sm" isLoading={isApplying}>
      Terapkan
    </Button>
    <Button type="button" size="sm" variant="ghost" onClick={onReset} disabled={isApplying}>
      Reset
    </Button>
    <span className="text-[11px] text-slate-500 ml-auto">
      {formatIamAuditResultLabel(
        resultCount,
        textFiltering ? pageMatchCount : undefined,
      )}
    </span>
  </form>
  );
};
