// ============================================
// Unit Turns DB — Supabase-backed
// ============================================
// /unit-turns moved from browser localStorage to Supabase so the
// maintenance team and asset manager see the same in-flight turn
// pipeline. Two tables: unit_turns (parent) + unit_turn_tasks (child).
// SQL: supabase/migrations/20260428_unit_turns.sql

import { loadFromStorage, saveToStorage } from "./storage";
import {
  getSupabase,
  isSupabaseConfigured,
  type DbUnitTurn,
  type DbUnitTurnTask,
} from "./supabase";
import type { TurnTask, TurnTaskStatus, UnitTurn } from "./types";

const LOCAL_STORAGE_KEY = "unit_turns";
const MIGRATION_DONE_KEY = "unit_turns_supabase_migrated";

function dbToTurn(turn: DbUnitTurn, tasks: DbUnitTurnTask[]): UnitTurn {
  return {
    id: turn.id,
    unitId: turn.unit_id,
    propertyId: turn.property_id ?? "",
    unitNumber: turn.unit_number,
    propertyName: turn.property_name,
    moveOutDate: turn.move_out_date ?? "",
    targetReadyDate: turn.target_ready_date ?? "",
    moveInDate: turn.move_in_date ?? undefined,
    status: turn.status as UnitTurn["status"],
    outgoingTenant: turn.outgoing_tenant ?? undefined,
    incomingTenant: turn.incoming_tenant ?? undefined,
    tasks: tasks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(dbToTask),
    totalBudget: turn.total_budget ?? undefined,
    totalSpent: Number(turn.total_spent ?? 0),
    createdAt: turn.created_at,
    updatedAt: turn.updated_at,
  };
}

function dbToTask(row: DbUnitTurnTask): TurnTask {
  return {
    id: row.id,
    name: row.name,
    category: row.category as TurnTask["category"],
    status: row.status as TurnTaskStatus,
    assignedTo: row.assigned_to ?? undefined,
    vendor: row.vendor ?? undefined,
    estimatedCost: row.estimated_cost ?? undefined,
    actualCost: row.actual_cost ?? undefined,
    notes: row.notes ?? "",
    dueDate: row.due_date ?? undefined,
    completedDate: row.completed_date ?? undefined,
  };
}

function turnToDb(t: UnitTurn): Omit<DbUnitTurn, "created_at" | "updated_at"> {
  return {
    id: t.id,
    unit_id: t.unitId,
    property_id: t.propertyId || null,
    unit_number: t.unitNumber ?? "",
    property_name: t.propertyName ?? "",
    move_out_date: t.moveOutDate || null,
    target_ready_date: t.targetReadyDate || null,
    move_in_date: t.moveInDate || null,
    status: t.status,
    outgoing_tenant: t.outgoingTenant || null,
    incoming_tenant: t.incomingTenant || null,
    total_budget: t.totalBudget ?? null,
    total_spent: t.totalSpent ?? 0,
  };
}

function taskToDb(
  task: TurnTask,
  turnId: string,
  position: number,
): Omit<DbUnitTurnTask, "created_at" | "updated_at"> {
  return {
    id: task.id,
    turn_id: turnId,
    name: task.name,
    category: task.category,
    status: task.status,
    assigned_to: task.assignedTo || null,
    vendor: task.vendor || null,
    estimated_cost: task.estimatedCost ?? null,
    actual_cost: task.actualCost ?? null,
    notes: task.notes ?? "",
    due_date: task.dueDate || null,
    completed_date: task.completedDate || null,
    position,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

export async function listUnitTurns(): Promise<UnitTurn[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const [turnsRes, tasksRes] = await Promise.all([
    sb.from("unit_turns").select("*").order("created_at", { ascending: false }),
    sb.from("unit_turn_tasks").select("*"),
  ]);
  if (turnsRes.error) {
    if (!isMissingTableError(turnsRes.error)) console.warn("[unit-turns-db] list turns:", turnsRes.error.message);
    return [];
  }
  if (tasksRes.error) {
    if (!isMissingTableError(tasksRes.error)) console.warn("[unit-turns-db] list tasks:", tasksRes.error.message);
  }
  const tasks = (tasksRes.data ?? []) as DbUnitTurnTask[];
  const byTurn = new Map<string, DbUnitTurnTask[]>();
  for (const t of tasks) {
    const list = byTurn.get(t.turn_id) ?? [];
    list.push(t);
    byTurn.set(t.turn_id, list);
  }
  return (turnsRes.data ?? []).map((row: DbUnitTurn) =>
    dbToTurn(row, byTurn.get(row.id) ?? []),
  );
}

/**
 * Upsert a turn and reconcile its task set: delete tasks no longer
 * present, upsert the rest with their position so reordering sticks.
 */
export async function upsertUnitTurn(t: UnitTurn): Promise<UnitTurn> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const { data: turnData, error: turnError } = await sb
    .from("unit_turns")
    .upsert(turnToDb(t), { onConflict: "id" })
    .select("*")
    .single();
  if (turnError) throw new Error(`[unit-turns-db] upsert turn: ${turnError.message}`);

  const incomingIds = new Set(t.tasks.map((task) => task.id));
  const { data: existing, error: existingError } = await sb
    .from("unit_turn_tasks")
    .select("id")
    .eq("turn_id", t.id);
  if (existingError) throw new Error(`[unit-turns-db] read tasks: ${existingError.message}`);
  const toDelete = (existing ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id: string) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: delError } = await sb
      .from("unit_turn_tasks")
      .delete()
      .in("id", toDelete);
    if (delError) throw new Error(`[unit-turns-db] delete tasks: ${delError.message}`);
  }

  if (t.tasks.length > 0) {
    const rows = t.tasks.map((task, idx) => taskToDb(task, t.id, idx));
    const { error: taskError } = await sb
      .from("unit_turn_tasks")
      .upsert(rows, { onConflict: "id" });
    if (taskError) throw new Error(`[unit-turns-db] upsert tasks: ${taskError.message}`);
  }

  const { data: refreshedTasks } = await sb
    .from("unit_turn_tasks")
    .select("*")
    .eq("turn_id", t.id);
  return dbToTurn(turnData as DbUnitTurn, (refreshedTasks ?? []) as DbUnitTurnTask[]);
}

export async function deleteUnitTurn(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("unit_turns").delete().eq("id", id);
  if (error) throw new Error(`[unit-turns-db] delete: ${error.message}`);
}

// ─── One-time localStorage → Supabase migration ────────────────

export async function migrateLocalToSupabaseIfNeeded(): Promise<{
  migrated: boolean;
  count?: number;
}> {
  if (typeof window === "undefined") return { migrated: false };
  if (loadFromStorage<boolean>(MIGRATION_DONE_KEY, false)) return { migrated: false };
  if (!isSupabaseConfigured()) return { migrated: false };

  const sb = getSupabase();
  if (!sb) return { migrated: false };

  const local = loadFromStorage<UnitTurn[]>(LOCAL_STORAGE_KEY, []);

  const { data: existing, error: checkError } = await sb
    .from("unit_turns")
    .select("id")
    .limit(1);
  if (checkError) return { migrated: false };

  if ((existing || []).length > 0) {
    saveToStorage(MIGRATION_DONE_KEY, true);
    return { migrated: false };
  }

  if (local.length > 0) {
    const turnRows = local.map(turnToDb);
    const { error: turnErr } = await sb
      .from("unit_turns")
      .upsert(turnRows, { onConflict: "id" });
    if (turnErr) {
      console.warn("[unit-turns-db] migration turn upsert failed:", turnErr.message);
      return { migrated: false };
    }

    const taskRows = local.flatMap((turn) =>
      turn.tasks.map((task, idx) => taskToDb(task, turn.id, idx)),
    );
    if (taskRows.length > 0) {
      const { error: taskErr } = await sb
        .from("unit_turn_tasks")
        .upsert(taskRows, { onConflict: "id" });
      if (taskErr) {
        console.warn("[unit-turns-db] migration task upsert failed:", taskErr.message);
        return { migrated: false };
      }
    }
  }

  saveToStorage(MIGRATION_DONE_KEY, true);
  return { migrated: true, count: local.length };
}
