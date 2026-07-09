type TechGroup = {
  name: string;
  badges: string[];
};

const GROUPS: TechGroup[] = [
  {
    name: "AI · LLM",
    badges: [
      "Ollama",
      "Llama3",
      "qwen",
      "BGE-M3",
      "Chroma",
      "Pinecone",
      "Qdrant",
      "Zilliz",
      "Weaviate",
      "TensorFlow",
      "PyTorch",
      "Hugging Face",
    ],
  },
  {
    name: "Backend",
    badges: [
      "Python",
      "FastAPI",
      "Flask",
      "Java",
      "Spring Boot",
      "Node.js",
      ".NET",
      "C#",
    ],
  },
  {
    name: "Frontend · Mobile",
    badges: [
      "Next.js",
      "React",
      "TypeScript",
      "Tailwind",
      "Streamlit",
      "iOS (Swift · Objective-C · 15년)",
      "Android (Kotlin)",
      "React Native",
      "Flutter",
    ],
  },
  {
    name: "Infra · Data",
    badges: [
      "AWS (EKS · S3 · RDS · Auto Scaling)",
      "GCP",
      "Docker",
      "GitHub Actions",
      "CI/CD",
      "MongoDB",
      "MySQL",
      "PostgreSQL",
      "SQLite",
    ],
  },
  {
    name: "Low-Level · 특수 도메인",
    badges: [
      "C++",
      "MFC",
      "모바일 프로토콜 역공학 (800+ 기종)",
      "머신비전",
      "OPUS 프로토콜",
      "IoT (Bluetooth)",
    ],
  },
];

export function Tech() {
  return (
    <section
      id="tech"
      className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28 md:px-8"
    >
      <header className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[color:var(--color-accent)]">
          Tech
        </p>
        <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-[color:var(--color-foreground)] sm:text-4xl md:text-5xl">
          쓰는 도구들
        </h2>
        <p className="mt-4 text-base leading-relaxed text-[color:var(--color-muted-foreground)] sm:text-lg">
          필요한 것만 골라 씁니다.
        </p>
      </header>

      <div className="space-y-6 sm:space-y-8">
        {GROUPS.map((group) => (
          <div
            key={group.name}
            className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 sm:p-7"
          >
            <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-[color:var(--color-accent)]">
              {group.name}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {group.badges.map((badge) => (
                <li
                  key={badge}
                  className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-1 text-xs font-medium text-[color:var(--color-foreground)] sm:text-sm"
                >
                  {badge}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
