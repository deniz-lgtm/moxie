"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Mic, Plus } from "lucide-react";
import MeetingDetailView from "@/components/MeetingDetailView";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  DbAgendaVacancy,
  DbAgendaWorkOrder,
  DbPropertyMeeting,
} from "@/lib/supabase";
import type { MaintenanceRequest, Unit } from "@/lib/types";

function makeId() {
  return `mtg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + (a.length === 10 ? "T00:00:00" : "")).getTime();
  const db = new Date(b + (b.length === 10 ? "T00:00:00" : "")).getTime();
  return Math.max(0, Math.round((db - da) / 86400000));
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<DbPropertyMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openActionCount, setOpenActionCount] = useState<number>(0);
  const [units, setUnits] = useState<Unit[]>([]);
  const [workOrders, setWorkOrders] = useState<MaintenanceRequest[]>([]);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/meetings/crud`);
      const j = await r.json();
      setMeetings(Array.isArray(j.meetings) ? j.meetings : []);
    } catch {
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOpenActionCount = useCallback(async () => {
    try {
      const r = await fetch(`/api/meetings/action-items?status=open`);
      const j = await r.json();
      const items = Array.isArray(j.items) ? j.items : [];
      setOpenActionCount(items.length);
    } catch {
      setOpenActionCount(0);
    }
  }, []);

  const loadPortfolio = useCallback(async (): Promise<{
    units: Unit[];
    workOrders: MaintenanceRequest[];
  }> => {
    try {
      const [unitsR, woR] = await Promise.all([
        fetch(`/api/appfolio/units`).then((r) => r.json()),
        fetch(`/api/maintenance/requests`).then((r) => r.json()),
      ]);
      const nextUnits: Unit[] = Array.isArray(unitsR.units) ? unitsR.units : [];
      const nextWO: MaintenanceRequest[] = Array.isArray(woR.workOrders) ? woR.workOrders : [];
      setUnits(nextUnits);
      setWorkOrders(nextWO);
      return { units: nextUnits, workOrders: nextWO };
    } catch {
      setUnits([]);
      setWorkOrders([]);
      return { units: [], workOrders: [] };
    }
  }, []);

  useEffect(() => {
    loadMeetings();
    loadOpenActionCount();
    loadPortfolio();
  }, [loadMeetings, loadOpenActionCount, loadPortfolio]);

  const generateMeeting = useCallback(async () => {
    setCreating(true);
    try {
      const { units: allUnits, workOrders: allWO } = await loadPortfolio();
      const openWO = allWO.filter((w) => w.status !== "completed" && w.status !== "closed");

      const agendaWorkOrders: DbAgendaWorkOrder[] = openWO.map((w) => ({
        id: w.id,
        workOrderNumber: w.appfolioWorkOrderId || null,
        title: w.title || w.description?.slice(0, 100) || "Work order",
        priority: w.priority,
        status: w.status,
        propertyName: w.propertyName,
        unitName: w.unitNumber,
        vendor: w.vendor || null,
      }));

      const openUnits = allUnits.filter((u) => u.status === "vacant" || u.status === "notice");
      const agendaVacancies: DbAgendaVacancy[] = openUnits.map((u) => ({
        unitId: u.id,
        unitName: u.unitName || u.number,
        propertyName: u.propertyName,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        rent: u.rent,
        daysVacant: u.moveOut ? daysBetween(u.moveOut, today()) : null,
        leaseEnded: u.moveOut,
      }));

      const body = {
        id: makeId(),
        meeting_date: today(),
        title: `Monday Morning Meeting`,
        attendees: [] as string[],
        agenda: {
          workOrders: agendaWorkOrders,
          vacancies: agendaVacancies,
        },
      };

      const r = await fetch("/api/meetings/crud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.meeting) {
        setMeetings((prev) => [j.meeting, ...prev]);
        setSelectedId(j.meeting.id);
      } else if (j.error) {
        alert(`Could not create meeting: ${j.error}`);
      }
    } finally {
      setCreating(false);
    }
  }, [loadPortfolio]);

  const selected = useMemo(
    () => meetings.find((m) => m.id === selectedId) ?? null,
    [meetings, selectedId]
  );

  if (selected) {
    return (
      <MeetingDetailView
        meeting={selected}
        units={units}
        workOrders={workOrders}
        onBack={() => {
          setSelectedId(null);
          loadMeetings();
          loadOpenActionCount();
        }}
        onMeetingChange={(m) => {
          setMeetings((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meetings</h1>
          <p className="text-muted-foreground mt-1">
            Weekly team meetings with transcribed action items. Open action items carrying over:{" "}
            <span className="font-medium text-foreground">{openActionCount}</span>
          </p>
        </div>
        <button
          onClick={generateMeeting}
          disabled={creating}
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {creating ? "Generating…" : "Generate Meeting for Today"}
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> History
          </h2>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-muted-foreground">Loading meetings…</div>
        ) : meetings.length === 0 ? (
          <div className="p-8 text-center">
            <Mic className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No meetings yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Generate today&rsquo;s meeting to pull in open work orders, vacancies, and
              carry-over action items.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {meetings.map((m) => {
              const wo = (m.agenda_snapshot?.workOrders ?? []).length;
              const vac = (m.agenda_snapshot?.vacancies ?? []).length;
              const carry = (m.agenda_snapshot?.carryOverActions ?? []).length;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className="w-full text-left p-5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">
                          {new Date(m.meeting_date + "T00:00:00").toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </h3>
                        <StatusBadge value={m.status} />
                      </div>
                      {m.title && (
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">{m.title}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ClipboardList className="w-3.5 h-3.5" />
                        {carry} carry-over
                      </span>
                      <span>{wo} work orders</span>
                      <span>{vac} vacancies</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
