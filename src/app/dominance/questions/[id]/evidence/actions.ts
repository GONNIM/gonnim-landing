"use server";

import { revalidatePath } from "next/cache";
import { runPhase, type EvidenceRun, type Phase } from "@/lib/dominance/collect";
import {
  addExternalSource,
  addOwnerFact,
  addPaperByRef,
  deleteFact,
  moveFact,
  removeSource,
  setSourceTag,
  updateFactMeta,
  type ExternalInput,
  type Slot,
} from "@/lib/dominance/evidence";
import { dominanceContext } from "@/lib/dominance/guard";
import { writeDraftFromCard } from "@/lib/dominance/letter-draft";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function refresh(id: string) {
  revalidatePath(`/dominance/questions/${id}/evidence`);
  revalidatePath("/dominance/questions");
}

type Result = { error: string | null };

async function wrap(id: string, fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    refresh(id);
    return { error: null };
  } catch (e) {
    return { error: errText(e) };
  }
}

/** [증거 모으기] 한 단계. 화면이 search → premise_body → industry → retry 순서로 부른다. */
export async function collectPhaseAction(
  id: string,
  phase: Phase,
): Promise<{ ok: true; run: EvidenceRun } | { ok: false; error: string }> {
  const { db } = await dominanceContext();
  try {
    const run = await runPhase(db, id, phase);
    refresh(id);
    return { ok: true, run };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

export async function addFactAction(
  id: string,
  slot: Slot,
  sourceKey: string,
  input: { text: string; subject: string | null; year: number | null; hasNumber: boolean | null },
): Promise<{ ok: true; part: string } | { ok: false; reason: string }> {
  const { db } = await dominanceContext();
  try {
    const r = await addOwnerFact(db, id, slot, sourceKey, input);
    if (r.ok) refresh(id);
    return r.ok ? { ok: true, part: r.part } : r;
  } catch (e) {
    return { ok: false, reason: errText(e) };
  }
}

export async function deleteFactAction(id: string, rowId: string, line: number): Promise<Result> {
  const { db } = await dominanceContext();
  return wrap(id, () => deleteFact(db, rowId, line));
}

export async function moveFactAction(id: string, rowId: string, line: number, to: Slot): Promise<Result> {
  const { db } = await dominanceContext();
  return wrap(id, () => moveFact(db, rowId, line, to));
}

export async function updateFactMetaAction(
  id: string,
  rowId: string,
  line: number,
  patch: { subject?: string | null; year?: number | null; hasNumber?: boolean | null },
): Promise<Result> {
  const { db } = await dominanceContext();
  return wrap(id, () => updateFactMeta(db, rowId, line, patch));
}

export async function setTagAction(id: string, sourceKey: string, tag: string): Promise<Result> {
  const { db } = await dominanceContext();
  return wrap(id, () => setSourceTag(db, id, sourceKey, tag));
}

export async function addExternalAction(id: string, slot: Slot, input: ExternalInput): Promise<Result> {
  const { db } = await dominanceContext();
  return wrap(id, () => addExternalSource(db, id, slot, input));
}

export async function addPaperAction(id: string, slot: Slot, ref: string): Promise<Result> {
  const { db } = await dominanceContext();
  return wrap(id, () => addPaperByRef(db, id, slot, ref));
}

export async function removeSourceAction(id: string, slot: Slot, sourceKey: string): Promise<Result> {
  const { db } = await dominanceContext();
  return wrap(id, () => removeSource(db, id, slot, sourceKey));
}

/** ③ [글 작성하기] · 사실 카드만으로 초안을 쓰고 편집기로 보낸다. 다시 누르면 새 판. */
export async function writeDraftAction(
  id: string,
): Promise<{ ok: true; letterId: string; created: boolean; seconds: number } | { ok: false; error: string }> {
  const { db } = await dominanceContext();
  const t0 = Date.now();
  try {
    const r = await writeDraftFromCard(db, id);
    refresh(id);
    revalidatePath("/dominance/letters");
    return { ok: true, letterId: r.letterId, created: r.created, seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}
