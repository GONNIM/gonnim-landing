export type ServiceCardProps = {
  index: string;
  name: string;
  description: string;
  evidence: string;
  duration: string;
};

export function ServiceCard({
  index,
  name,
  description,
  evidence,
  duration,
}: ServiceCardProps) {
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 sm:p-7">
      <header className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-border)] text-sm font-bold text-[color:var(--color-foreground)]">
          {index}
        </span>
        <h3 className="mt-1 text-lg font-bold leading-snug text-[color:var(--color-foreground)] sm:text-xl">
          {name}
        </h3>
      </header>

      <p className="text-sm leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-base">
        {description}
      </p>

      <p className="rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 text-xs leading-relaxed text-[color:var(--color-muted-foreground)]">
        <span className="font-semibold text-[color:var(--color-accent)]">
          실증
        </span>{" "}
        · {evidence}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] pt-4">
        <p className="text-xs font-medium text-[color:var(--color-muted)]">
          {duration}
        </p>
        <a
          href="#contact"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-4 text-xs font-semibold text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-border)]"
        >
          견적 요청
          <span aria-hidden>→</span>
        </a>
      </div>
    </article>
  );
}
