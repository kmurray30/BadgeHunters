"use client";

import { useState } from "react";

const RANK_TIERS = [
  { color: "Purple", hex: "#A855F7", min: "500,000+", range: "500k+" },
  { color: "Red", hex: "#EF4444", min: "400,000", range: "400k – 499k" },
  { color: "Orange", hex: "#F97316", min: "300,000", range: "300k – 399k" },
  { color: "Green", hex: "#22C55E", min: "200,000", range: "200k – 299k" },
  { color: "Blue", hex: "#3B82F6", min: "100,000", range: "100k – 199k" },
  { color: "White", hex: "#E5E7EB", min: "0", range: "0 – 99k" },
];

interface Props {
  currentRank: string;
  rankHex: string;
}

export function RankPopup({ currentRank, rankHex }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-2xl font-bold cursor-pointer hover:opacity-80 transition-opacity"
        style={{ color: rankHex }}
      >
        {currentRank}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-xl border border-border bg-card p-4 shadow-lg">
            <p className="mb-3 text-xs font-semibold text-foreground text-center">Rank Tiers</p>
            <div className="space-y-1.5">
              {RANK_TIERS.map((tier) => (
                <div
                  key={tier.color}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${
                    tier.color === currentRank ? "ring-1 ring-accent" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tier.hex }} />
                    <span className="text-xs font-medium" style={{ color: tier.hex }}>{tier.color}</span>
                  </div>
                  <span className="text-[10px] text-muted">{tier.range}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
