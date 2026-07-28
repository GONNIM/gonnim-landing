// Wiki Ideas → JSON sync (Phase 5 · P2 사업화 원천 확장)
// 원천: ~/GON-LLM-Wiki/Thoughts/Ideas/*.md
// 저장: src/data/wiki-ideas.json (Vercel 배포에 commit · SSR import)
//
// 최소 frontmatter parser (외부 dep 없이) · Wiki Ideas 노트만 대상 (제한 스키마).

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const VAULT_IDEAS = path.join(os.homedir(), "GON-LLM-Wiki", "Thoughts", "Ideas");
const OUT_PATH = path.join(
  process.cwd(),
  "src",
  "data",
  "wiki-ideas.json",
);

type WikiIdea = {
  slug: string;
  title: string;
  type: string;
  status: string;
  confidence: string;
  domain: string[];
  tags: string[];
  source_created: string | null;
  ingested_at: string | null;
  summary: string;
  obsidian_uri: string;
};

function parseFrontmatter(raw: string): Record<string, unknown> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const yaml = m[1];
  const out: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    // top-level key
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      const rest = kv[2].trim();
      if (rest === "") {
        // nested block or list-of-lines-below
        const nested: Record<string, string> = {};
        i++;
        while (i < lines.length && /^\s+/.test(lines[i])) {
          const nkv = lines[i].match(/^\s+([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
          if (nkv) nested[nkv[1]] = unquote(nkv[2].trim());
          i++;
        }
        out[key] = nested;
        continue;
      }
      // inline value
      if (rest.startsWith("[") && rest.endsWith("]")) {
        // inline list
        const inner = rest.slice(1, -1).trim();
        out[key] = inner
          ? inner.split(",").map((s) => unquote(s.trim()))
          : [];
      } else {
        out[key] = unquote(rest);
      }
    }
    i++;
  }
  return out;
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function firstNonEmptyParagraph(body: string): string {
  const stripped = body.replace(/^\s*[#>]\s.*$/gm, "").trim();
  const lines = stripped.split(/\r?\n/);
  const buf: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (buf.length > 0) break;
      continue;
    }
    buf.push(t);
    if (buf.join(" ").length > 160) break;
  }
  const s = buf.join(" ").replace(/\s+/g, " ");
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

function readIdea(filepath: string): WikiIdea | null {
  const raw = fs.readFileSync(filepath, "utf-8");
  const fm = parseFrontmatter(raw);
  const body = raw.replace(/^---[\s\S]*?---/, "").trim();

  const slug = path.basename(filepath, ".md");
  const title = String(fm.title ?? slug);
  const type = String(fm.type ?? "inbox");
  const status = String(fm.status ?? "draft");
  const confidence = String(fm.confidence ?? "low");
  const domain = Array.isArray(fm.domain) ? (fm.domain as string[]) : [];
  const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];

  const prov = (fm.provenance ?? {}) as Record<string, string>;
  const source_created = prov.source_created ?? null;
  const ingested_at = prov.ingested_at ?? null;

  const summary = firstNonEmptyParagraph(body);

  const obsidianPath = `Thoughts/Ideas/${slug}.md`;
  const obsidian_uri = `obsidian://open?vault=GON-LLM-Wiki&file=${encodeURIComponent(obsidianPath)}`;

  return {
    slug,
    title,
    type,
    status,
    confidence,
    domain,
    tags,
    source_created,
    ingested_at,
    summary,
    obsidian_uri,
  };
}

function main() {
  if (!fs.existsSync(VAULT_IDEAS)) {
    console.error(`[sync-wiki-ideas] Vault Ideas 폴더 부재: ${VAULT_IDEAS}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(VAULT_IDEAS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(VAULT_IDEAS, f));

  const ideas: WikiIdea[] = [];
  for (const f of files) {
    const idea = readIdea(f);
    if (idea) ideas.push(idea);
  }

  // 정렬 · status 진행중(open/active) > draft · confidence 높음 우선 · title 알파벳
  const statusRank: Record<string, number> = {
    open: 0,
    active: 1,
    draft: 2,
    archived: 3,
  };
  const confRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  ideas.sort((a, b) => {
    const sa = statusRank[a.status] ?? 9;
    const sb = statusRank[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    const ca = confRank[a.confidence] ?? 9;
    const cb = confRank[b.confidence] ?? 9;
    if (ca !== cb) return ca - cb;
    return a.title.localeCompare(b.title);
  });

  const outDir = path.dirname(OUT_PATH);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      { generated_at: new Date().toISOString(), ideas },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  console.log(
    `[sync-wiki-ideas] ${ideas.length}건 sync 완료 → ${path.relative(process.cwd(), OUT_PATH)}`,
  );
  for (const i of ideas) {
    console.log(
      `  · ${i.slug} · ${i.status}/${i.confidence} · ${i.domain.join(",") || "-"} · ${i.title}`,
    );
  }
}

main();
