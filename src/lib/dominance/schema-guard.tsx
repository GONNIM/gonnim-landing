// DDL 실행 전에 콘솔을 열어도 500 이 뜨지 않게 한다.
// 런북 1단계(SQL 실행) 전에는 ds_* 테이블이 없으므로 안내를 대신 보여준다.

import type { PostgrestError } from "@supabase/supabase-js";

export function isMissingSchema(error: PostgrestError | null): boolean {
  if (!error) return false;
  // 42P01 undefined_table · PGRST205 schema cache 미등록
  return error.code === "42P01" || error.code === "PGRST205";
}

export function SchemaNotice({
  file = "db/2026-09-25-dominance-schema.sql",
  hint = "검증 쿼리가 8행을 반환하면 이 화면이 사라집니다.",
}: {
  file?: string;
  hint?: string;
} = {}) {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-950/20 p-8 text-sm">
      <p className="font-medium text-amber-200">스키마가 아직 없습니다.</p>
      <p className="mt-2 text-muted-foreground">
        Supabase SQL Editor 에서{" "}
        <code className="rounded bg-background px-1.5 py-0.5 text-xs">{file}</code> 을
        실행하십시오. {hint}
      </p>
    </div>
  );
}
