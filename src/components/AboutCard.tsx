export type AboutCardProps = {
  index: string;
  title: string;
  detail: string;
  outcome: string;
};

export function AboutCard({ index, title, detail, outcome }: AboutCardProps) {
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 sm:p-7">
      <header className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-sm font-bold text-[color:var(--color-accent-foreground)]">
          {index}
        </span>
        <h3 className="mt-1 text-lg font-semibold leading-snug text-[color:var(--color-foreground)] sm:text-xl">
          {title}
        </h3>
      </header>
      <p className="text-sm leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-base">
        {detail}
      </p>
      <p className="mt-auto border-t border-[color:var(--color-border)] pt-4 text-sm font-medium leading-snug text-[color:var(--color-foreground)]">
        <span aria-hidden className="mr-1 text-[color:var(--color-accent)]">
          →
        </span>
        {outcome}
      </p>
    </article>
  );
}
