import { contactHrefForSlug } from "@/lib/inquiry-categories";

export type ProductCardProps = {
  index: string;
  slug: string;
  featured?: boolean;
  tagline: string;
  description: string;
  target: string;
  tech: string;
  cta: string;
};

export function ProductCard({
  index,
  slug,
  featured,
  tagline,
  description,
  target,
  tech,
  cta,
}: ProductCardProps) {
  return (
    <article
      className={`relative flex h-full flex-col gap-4 rounded-2xl border p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-8 ${
        featured
          ? "border-[color:var(--color-accent)] bg-[color:var(--color-surface)] shadow-sm"
          : "border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
      }`}
    >
      {featured && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[color:var(--color-accent)] px-3 py-1 text-xs font-bold text-[color:var(--color-accent-foreground)]">
          <span aria-hidden>🎯</span>
          대표 상품
        </span>
      )}

      <header className="flex items-start gap-3">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            featured
              ? "bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)]"
              : "bg-[color:var(--color-border)] text-[color:var(--color-foreground)]"
          }`}
        >
          {index}
        </span>
        <h3 className="mt-1 text-lg font-bold leading-snug text-[color:var(--color-foreground)] sm:text-xl">
          {tagline}
        </h3>
      </header>

      <p className="text-sm leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-base">
        {description}
      </p>

      <dl className="mt-2 space-y-2 text-sm">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="w-16 shrink-0 font-semibold text-[color:var(--color-muted)]">
            대상
          </dt>
          <dd className="text-[color:var(--color-foreground)]">{target}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="w-16 shrink-0 font-semibold text-[color:var(--color-muted)]">
            기술/성과
          </dt>
          <dd className="text-[color:var(--color-foreground)]">{tech}</dd>
        </div>
      </dl>

      <a
        href={contactHrefForSlug(slug)}
        className={`mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-transform hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] ${
          featured
            ? "bg-[color:var(--color-accent)] text-[color:var(--color-accent-foreground)] shadow-sm hover:shadow-md"
            : "border border-[color:var(--color-border)] bg-[color:var(--color-background)] text-[color:var(--color-foreground)] hover:bg-[color:var(--color-border)]"
        }`}
      >
        {cta}
        <span aria-hidden>→</span>
      </a>
    </article>
  );
}
