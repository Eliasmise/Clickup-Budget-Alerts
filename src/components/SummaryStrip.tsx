import type { DashboardSummary } from '../shared/types';

interface SummaryStripProps {
  summary: DashboardSummary;
}

export function SummaryStrip({ summary }: SummaryStripProps) {
  const items = [
    { label: 'Active Alerts', value: summary.activeAlerts, className: 'text-stonewarm-900' },
    { label: 'Green', value: summary.green, className: 'text-moss' },
    { label: 'Yellow', value: summary.yellow, className: 'text-amberearth' },
    { label: 'Red', value: summary.red, className: 'text-terracotta' },
    { label: 'Over Budget', value: summary.overBudget, className: 'text-clay-600' }
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {items.map((item) => (
        <article key={item.label} className="rounded-xl border border-stonewarm-200 bg-white px-4 py-3 shadow-soft">
          <p className="text-xs font-medium uppercase tracking-wide text-stonewarm-700">{item.label}</p>
          <p className={`mt-1 text-2xl font-semibold ${item.className}`}>{item.value}</p>
        </article>
      ))}
    </section>
  );
}
