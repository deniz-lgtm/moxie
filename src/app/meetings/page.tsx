"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Mic, Plus } from "lucide-react";
import MeetingDetailView from "@/components/MeetingDetailView";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  DbAgendaApplication,
  DbAgendaInspection,
  DbAgendaMove,
  DbAgendaVacancy,
  DbAgendaWorkOrder,
  DbPropertyMeeting,
} from "@/lib/supabase";
import type {
  AcademicYear,
  ApplicationGroup,
  Inspection,
  InspectionType,
  MaintenanceRequest,
  Unit,
  VacantUnit,
} from "@/lib/types";

const INSPECTION_TYPES: InspectionType[] = [
  "move_out",
  "move_in",
  "onboarding",
  "quarterly",
  "punch_list",
];

// Vacancy question the meeting is actually asking: which units are not
// leased on the upcoming academic-year start date? This anchors the
// "Vacancies" agenda block across the whole portfolio.
const TARGET_ACADEMIC_YEAR: AcademicYear = "2026-2027";

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

function daysBetween(from: string, to: string): number {
  const da = new Date(from + (from.length === 10 ? "T00:00:00" : "")).getTime();
  const db = new Date(to + (to.length === 10 ? "T00:00:00" : "")).getTime();
  return Math.round((db - da) / 86400000);
}

function withinDays(dateIso: string | null | undefined, window: number): boolean {
  if (!dateIso) return false;
  const d = daysBetween(today(), dateIso);
  return d >= 0 && d <= window;
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

      // Fetch applications, inspections, and date-aware vacancies in parallel.
      // Vacancies here means "units with no lease covering the academic-year
      // start date" — the actual question a Monday meeting wants answered.
      const [appsResp, vacanciesResp, ...inspectionResps] = await Promise.all([
        fetch(`/api/appfolio/applications`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/appfolio/units?vacancies_ay=${TARGET_ACADEMIC_YEAR}`)
          .then((r) => r.json())
          .catch(() => ({})),
        ...INSPECTION_TYPES.map((t) =>
          fetch(`/api/inspections/crud?type=${t}`)
            .then((r) => r.json())
            .catch(() => ({}))
        ),
      ]);
      const applications: ApplicationGroup[] = Array.isArray(appsResp.applications)
        ? appsResp.applications
        : [];
      const allInspections: Inspection[] = inspectionResps.flatMap((r) =>
        Array.isArray(r.inspections) ? r.inspections : []
      );

      // ── Maintenance
      const openWO = allWO.filter((w) => w.status !== "completed" && w.status !== "closed");
      const agendaOpenWorkOrders: DbAgendaWorkOrder[] = openWO.map((w) => ({
        id: w.id,
        workOrderNumber: w.appfolioWorkOrderId || null,
        title: w.title || w.description?.slice(0, 100) || "Work order",
        priority: w.priority,
        status: w.status,
        propertyName: w.propertyName,
        unitName: w.unitNumber,
        vendor: w.vendor || null,
      }));

      // ── Leasing: vacancies (date-aware — "vacant on academic-year start")
      const rawVacancies: VacantUnit[] = Array.isArray(vacanciesResp.vacancies)
        ? vacanciesResp.vacancies
        : [];
      const agendaVacancies: DbAgendaVacancy[] = rawVacancies.map((v) => ({
        unitId: v.unitId,
        unitName: v.unitName,
        propertyName: v.propertyName,
        bedrooms: v.bedrooms,
        bathrooms: v.bathrooms,
        rent: v.rent,
        daysVacant: v.daysVacantOnTarget,
        leaseEnded: v.lastLeaseTo,
      }));

      // ── Leasing: applications (not yet approved/denied)
      const agendaApplications: DbAgendaApplication[] = applications
        .filter((a) => a.status === "incomplete" || a.status === "under_review")
        .map((a) => {
          const primary = a.applicants?.find((x) => x.role === "primary") ?? a.applicants?.[0];
          const daysInReview = a.createdAt
            ? Math.max(0, daysBetween(a.createdAt, today()))
            : null;
          return {
            id: a.id,
            propertyName: a.propertyName,
            unitNumber: a.unitNumber,
            primaryApplicant: primary?.name ?? null,
            applicantCount: a.applicants?.length ?? 0,
            status: a.status,
            daysInReview,
          };
        });

      // ── Leasing: upcoming move-ins and move-outs (next 45 days)
      const movingUnits: DbAgendaMove[] = [];
      for (const u of allUnits) {
        if (withinDays(u.moveIn, 45)) {
          movingUnits.push({
            unitId: u.id,
            unitName: u.unitName || u.number,
            propertyName: u.propertyName,
            direction: "move_in",
            date: u.moveIn!,
            tenant: u.tenant,
            daysUntil: daysBetween(today(), u.moveIn!),
          });
        }
        if (withinDays(u.moveOut, 45) && u.status !== "vacant") {
          movingUnits.push({
            unitId: u.id,
            unitName: u.unitName || u.number,
            propertyName: u.propertyName,
            direction: "move_out",
            date: u.moveOut!,
            tenant: u.tenant,
            daysUntil: daysBetween(today(), u.moveOut!),
          });
        }
      }
      movingUnits.sort((a, b) => (a.daysUntil ?? 999) - (b.daysUntil ?? 999));

      // ── Property Management: inspections (active / upcoming within 14 days)
      const agendaInspections: DbAgendaInspection[] = allInspections
        .filter((i) => {
          if (i.status === "completed") return false;
          if (i.status === "walking" || i.status === "draft" || i.status === "ai_review" || i.status === "team_review") return true;
          return withinDays(i.scheduledDate, 14);
        })
        .map((i) => ({
          id: i.id,
          type: i.type,
          propertyName: i.propertyName,
          unitNumber: i.unitNumber,
          inspector: i.inspector,
          scheduledDate: i.scheduledDate,
          status: i.status,
        }));

      const body = {
        id: makeId(),
        meeting_date: today(),
        title: `Monday Morning Meeting`,
        attendees: [] as string[],
        agenda: {
          // Legacy keys (for any UI that still reads them)
          workOrders: agendaOpenWorkOrders,
          vacancies: agendaVacancies,
          // New three-category structure
          leasing: {
            vacancies: agendaVacancies,
            applications: agendaApplications,
            upcomingMoves: movingUnits,
          },
          maintenance: {
            openWorkOrders: agendaOpenWorkOrders,
          },
          propertyManagement: {
            upcomingInspections: agendaInspections,
          },
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
              Generate today&rsquo;s meeting to pull in open work orders, vacancies, applications,
              inspections, and carry-over action items.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {meetings.map((m) => {
              const agenda = m.agenda_snapshot ?? {};
              const leasingCount =
                (agenda.leasing?.vacancies?.length ?? agenda.vacancies?.length ?? 0) +
                (agenda.leasing?.applications?.length ?? 0) +
                (agenda.leasing?.upcomingMoves?.length ?? 0);
              const maintCount =
                agenda.maintenance?.openWorkOrders?.length ?? agenda.workOrders?.length ?? 0;
              const pmCount = agenda.propertyManagement?.upcomingInspections?.length ?? 0;
              const carry = agenda.carryOverActions?.length ?? 0;
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
                      <span>Leasing · {leasingCount}</span>
                      <span>Maintenance · {maintCount}</span>
                      <span>PM · {pmCount}</span>
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
