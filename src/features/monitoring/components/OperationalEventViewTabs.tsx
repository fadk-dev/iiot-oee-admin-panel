import React from 'react';
import { Bell, History } from 'lucide-react';
import {
  EVENT_VIEW_LABELS,
  formatTabCount,
  type OperationalEventView,
  type TabCount,
} from '../eventView';

/**
 * FAT-300 (P33.5, E33 tahap A analisis halaman Opsi 3 §3): dua tampilan
 * Alarm & Event — "Perlu Tindakan" (default) dan "Riwayat".
 *
 * Jumlah di tiap tab dihitung dari `pagination.totalCount`/`counts`
 * server bila ada (P33.4 — pasti, tanpa "+"), selain itu dari baris
 * halaman yang sedang dimuat (lihat eventView.ts): angka pasti hanya bila
 * semua hasil sudah termuat, selain itu batas bawah dengan akhiran "+"
 * dan penjelasan di `title`. Bila jumlah belum dimuat (query masih
 * berjalan), tampilkan label saja.
 */
export interface OperationalEventViewTabsProps {
  view: OperationalEventView;
  onViewChange: (view: OperationalEventView) => void;
  actionCount?: TabCount | null;
  historyCount?: TabCount | null;
}

export const OperationalEventViewTabs: React.FC<OperationalEventViewTabsProps> = ({
  view,
  onViewChange,
  actionCount,
  historyCount,
}) => {
  const tabs: Array<{
    id: OperationalEventView;
    label: string;
    icon: typeof Bell;
    count?: TabCount | null;
    countTitle: string;
  }> = [
    {
      id: 'action',
      label: EVENT_VIEW_LABELS.action,
      icon: Bell,
      count: actionCount,
      countTitle: actionCount
        ? actionCount.exact
          ? actionCount.server
            ? `Total ${actionCount.count} event belum di-ack — dihitung server dari seluruh data`
            : `Total ${actionCount.count} event belum di-ack — semua hasil sudah termuat`
          : `Minimal ${actionCount.count} event belum di-ack — masih ada halaman berikut`
        : '',
    },
    {
      id: 'history',
      label: EVENT_VIEW_LABELS.history,
      icon: History,
      count: historyCount,
      countTitle: historyCount
        ? historyCount.exact
          ? historyCount.server
            ? `Total ${historyCount.count} event — dihitung server dari seluruh data`
            : `Total ${historyCount.count} event — semua hasil sudah termuat`
          : `Minimal ${historyCount.count} event — masih ada halaman berikut`
        : '',
    },
  ];

  return (
    <div role="tablist" aria-label="Tampilan Alarm & Event" className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = view === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onViewChange(tab.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              active
                ? 'bg-sky-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            {tab.count != null && (
              <span
                title={tab.countTitle}
                className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                  active
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {formatTabCount(tab.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
