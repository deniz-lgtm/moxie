"use client";

import { createContext, useContext, useState, useEffect } from "react";

export type PortfolioId = "24" | "25";

export const PORTFOLIO_LABELS: Record<PortfolioId, string> = {
  "24": "USC Housing",
  "25": "LA Portfolio",
};

const STORAGE_KEY = "moxie.portfolioId";

interface PortfolioContextType {
  portfolioId: PortfolioId;
  setPortfolioId: (id: PortfolioId) => void;
}

const PortfolioContext = createContext<PortfolioContextType>({
  portfolioId: "24",
  setPortfolioId: () => {},
});

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  // Default to "24" so SSR and first client render match — avoids hydration mismatch.
  const [portfolioId, setPortfolioIdState] = useState<PortfolioId>("24");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "24" || stored === "25") setPortfolioIdState(stored);
    } catch {}
  }, []);

  function setPortfolioId(id: PortfolioId) {
    setPortfolioIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }

  return (
    <PortfolioContext.Provider value={{ portfolioId, setPortfolioId }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  return useContext(PortfolioContext);
}
