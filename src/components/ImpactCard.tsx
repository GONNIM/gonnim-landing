export type ImpactCardProps = {
  label: string;
  metric: string;
  metricSuffix?: string;
  headline: string;
  context: string;
};

export function ImpactCard({
  label,
  metric,
  metricSuffix,
  headline,
  context,
}: ImpactCardProps) {
  return (
    <article className="group flex h-full flex-col justify-between rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 transition-all hover:-translate-y-0.5 hover:border-[color:var(--color-accent)] hover:shadow-lg sm:p-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[color:var(--color-muted)]">
          {label}
        </p>
        <p className="flex items-baseline gap-1 font-sans">
          <span
            className="bg-gradient-to-br from-[var(--accent-gradient-from)] to-[var(--accent-gradient-to)] bg-clip-text text-4xl font-extrabold leading-none tracking-tight text-transparent sm:text-5xl"
          >
            {metric}
          </span>
          {metricSuffix ? (
            <span className="text-xl font-bold text-[color:var(--color-foreground)] sm:text-2xl">
              {metricSuffix}
            </span>
          ) : null}
        </p>
        <h3 className="text-lg font-semibold leading-snug text-[color:var(--color-foreground)] sm:text-xl">
          {headline}
        </h3>
      </div>
      <p className="mt-6 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
        {context}
      </p>
    </article>
  );
}
