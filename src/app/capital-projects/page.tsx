"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Property } from "@/lib/types";

type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed";
type ProjectCategory = "roof" | "hvac" | "plumbing" | "electrical" | "renovation" | "landscaping" | "other";

type CapitalProject = {
  id: string;
  propertyId: string;
  propertyName: string;
  name: string;
  category: ProjectCategory;
  status: ProjectStatus;
  startDate: string;
  targetDate: string;
  completedDate: string;
  budget: number;
  spent: number;
  contractor: string;
  description: string;
  milestones: Milestone[];
};

type Milestone = {
  id: string;
  name: string;
  completed: boolean;
  date: string;
};

const CATEGORIES: { value: ProjectCategory; label: string }[] = [
  { value: "roof", label: "Roofing" },
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "renovation", label: "Renovation" },
  { value: "landscaping", label: "Landscaping" },
  { value: "other", label: "Other" },
];

export default function CapitalProjectsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [projects, setProjects] = useState<CapitalProject[]>([]);
  const [selected, setSelected] = useState<CapitalProject | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newProject, setNewProject] = useState({
    propertyId: "",
    name: "",
    category: "renovation" as ProjectCategory,
    budget: 0,
    contractor: "",
    targetDate: "",
    description: "",
  });

  useEffect(() => {
    fetch("/api/appfolio/properties")
      .then((res) => res.json())
      .then((data) => {
        setProperties(data.properties || []);
        if (data.properties?.length > 0) {
          setNewProject((p) => ({ ...p, propertyId: data.properties[0].id }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function createProject() {
    if (!newProject.name.trim() || !newProject.propertyId) return;
    const property = properties.find((p) => p.id === newProject.propertyId);
    if (!property) return;

    const project: CapitalProject = {
      id: `cp-${Date.now()}`,
      propertyId: newProject.propertyId,
      propertyName: property.name,
      name: newProject.name,
      category: newProject.category,
      status: "planning",
      startDate: "",
      targetDate: newProject.targetDate,
      completedDate: "",
      budget: newProject.budget,
      spent: 0,
      contractor: newProject.contractor,
      description: newProject.description,
      milestones: [],
    };
    setProjects((prev) => [...prev, project]);
    setShowCreateForm(false);
    setNewProject({ propertyId: properties[0]?.id || "", name: "", category: "renovation", budget: 0, contractor: "", targetDate: "", description: "" });
  }

  function updateProjectStatus(status: ProjectStatus) {
    if (!selected) return;
    const updated = {
      ...selected,
      status,
      completedDate: status === "completed" ? new Date().toISOString().split("T")[0] : selected.completedDate,
    };
    setSelected(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function addMilestone(name: string) {
    if (!selected || !name.trim()) return;
    const milestone: Milestone = {
      id: `ms-${Date.now()}`,
      name,
      completed: false,
      date: "",
    };
    const updated = { ...selected, milestones: [...selected.milestones, milestone] };
    setSelected(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function toggleMilestone(msId: string) {
    if (!selected) return;
    const updated = {
      ...selected,
      milestones: selected.milestones.map((m) =>
        m.id === msId ? { ...m, completed: !m.completed, date: !m.completed ? new Date().toISOString().split("T")[0] : "" } : m
      ),
    };
    setSelected(updated);
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Capital Projects</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  if (selected) {
    const budgetPct = selected.budget > 0 ? Math.round((selected.spent / selected.budget) * 100) : 0;
    const milestonePct = selected.milestones.length > 0
      ? Math.round((selected.milestones.filter((m) => m.completed).length / selected.milestones.length) * 100)
      : 0;

    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Projects
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <p className="text-muted-foreground mt-1">
              {selected.propertyName} &middot; {CATEGORIES.find((c) => c.value === selected.category)?.label}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={selected.status} />
            <select
              value={selected.status}
              onChange={(e) => updateProjectStatus(e.target.value as ProjectStatus)}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card"
            >
              <option value="planning">Planning</option>
              <option value="in_progress">In Progress</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Budget</p>
            <p className="text-2xl font-bold mt-1">${selected.budget.toLocaleString()}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Spent</p>
            <p className={`text-2xl font-bold mt-1 ${budgetPct > 90 ? "text-red-600" : ""}`}>
              ${selected.spent.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{budgetPct}% of budget</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Target Date</p>
            <p className="text-2xl font-bold mt-1 text-sm">{selected.targetDate || "—"}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Contractor</p>
            <p className="text-sm font-bold mt-1">{selected.contractor || "—"}</p>
          </div>
        </div>

        {selected.description && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-2">Description</h2>
            <p className="text-sm text-muted-foreground">{selected.description}</p>
          </div>
        )}

        {/* Milestones */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Milestones ({selected.milestones.length})</h2>
            <span className="text-sm text-muted-foreground">{milestonePct}% complete</span>
          </div>
          {selected.milestones.length > 0 && (
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-4">
              <div className={`h-full rounded-full ${milestonePct === 100 ? "bg-green-500" : "bg-accent"}`} style={{ width: `${milestonePct}%` }} />
            </div>
          )}
          <div className="space-y-2">
            {selected.milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <button
                  onClick={() => toggleMilestone(m.id)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    m.completed ? "bg-green-500 border-green-500 text-white" : "border-border hover:border-accent"
                  }`}
                >
                  {m.completed && <span className="text-xs">✓</span>}
                </button>
                <span className={`text-sm flex-1 ${m.completed ? "line-through text-muted-foreground" : ""}`}>{m.name}</span>
                {m.date && <span className="text-xs text-muted-foreground">{m.date}</span>}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              id="new-milestone"
              type="text"
              placeholder="Add milestone..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addMilestone((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
          </div>
        </div>

        {/* Spend tracking */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Update Spend</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              value={selected.spent || ""}
              onChange={(e) => {
                const updated = { ...selected, spent: parseFloat(e.target.value) || 0 };
                setSelected(updated);
                setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              }}
              className="w-32 text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Capital Projects</h1>
          <p className="text-muted-foreground mt-1">
            Track large improvements — roofing, HVAC, renovations with budget vs actual
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ New Project"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">New Capital Project</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Project name *"
              value={newProject.name}
              onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <select
              value={newProject.propertyId}
              onChange={(e) => setNewProject({ ...newProject, propertyId: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={newProject.category}
              onChange={(e) => setNewProject({ ...newProject, category: e.target.value as ProjectCategory })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Budget ($)"
              value={newProject.budget || ""}
              onChange={(e) => setNewProject({ ...newProject, budget: parseFloat(e.target.value) || 0 })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <input
              type="text"
              placeholder="Contractor"
              value={newProject.contractor}
              onChange={(e) => setNewProject({ ...newProject, contractor: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <input
              type="date"
              placeholder="Target completion"
              value={newProject.targetDate}
              onChange={(e) => setNewProject({ ...newProject, targetDate: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
          </div>
          <textarea
            placeholder="Description"
            value={newProject.description}
            onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
            rows={2}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
          />
          <button
            onClick={createProject}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Create Project
          </button>
        </div>
      )}

      {projects.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {projects.map((p) => {
            const budgetPct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {p.propertyName} · {CATEGORIES.find((c) => c.value === p.category)?.label}
                    </p>
                  </div>
                  <StatusBadge value={p.status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Budget</p>
                    <p className="font-medium">${p.budget.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Spent</p>
                    <p className={`font-medium ${budgetPct > 90 ? "text-red-600" : ""}`}>${p.spent.toLocaleString()}</p>
                  </div>
                </div>
                {p.budget > 0 && (
                  <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${budgetPct > 90 ? "bg-red-500" : "bg-accent"}`}
                      style={{ width: `${Math.min(budgetPct, 100)}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No capital projects yet. Click &quot;+ New Project&quot; to track a large improvement.
        </div>
      )}
    </div>
  );
}
