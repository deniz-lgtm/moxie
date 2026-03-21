"use client";

import { useEffect, useState } from "react";
import { loadFromStorage } from "@/lib/storage";
import type { TourSlot } from "@/lib/types";

export function TourStats() {
  const [upcoming, setUpcoming] = useState(0);
  const [registrations, setRegistrations] = useState(0);

  useEffect(() => {
    const tours = loadFromStorage<TourSlot[]>("tours", []);
    const today = new Date().toISOString().split("T")[0];
    const upcomingTours = tours.filter((t) => t.date >= today);
    const totalRegs = upcomingTours.reduce(
      (sum, t) =>
        sum +
        t.registrations.filter(
          (r) => r.status !== "cancelled" && r.status !== "rescheduled"
        ).length,
      0
    );
    setUpcoming(upcomingTours.length);
    setRegistrations(totalRegs);
  }, []);

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-sm text-muted-foreground">Upcoming Tours</p>
        <p className="text-3xl font-bold mt-1">{upcoming}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {registrations} prospects registered
        </p>
      </div>
    </>
  );
}

export function TourStatsFooter() {
  const [upcoming, setUpcoming] = useState(0);
  const [registrations, setRegistrations] = useState(0);

  useEffect(() => {
    const tours = loadFromStorage<TourSlot[]>("tours", []);
    const today = new Date().toISOString().split("T")[0];
    const upcomingTours = tours.filter((t) => t.date >= today);
    const totalRegs = upcomingTours.reduce(
      (sum, t) =>
        sum +
        t.registrations.filter(
          (r) => r.status !== "cancelled" && r.status !== "rescheduled"
        ).length,
      0
    );
    setUpcoming(upcomingTours.length);
    setRegistrations(totalRegs);
  }, []);

  return (
    <span className="text-sm font-medium text-accent">
      {upcoming} upcoming &middot; {registrations} registered
    </span>
  );
}
