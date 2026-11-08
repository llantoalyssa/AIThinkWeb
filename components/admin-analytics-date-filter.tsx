"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AdminAnalyticsRange, CustomDateRange } from "@/lib/admin-analytics";

export default function AdminAnalyticsDateFilter({
  base,
  range,
  custom,
  label,
}: {
  
  base: string;
  range: AdminAnalyticsRange;
  custom: CustomDateRange | null;
  
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(custom?.from ?? "");
  const [to, setTo] = useState(custom?.to ?? "");

  const valid = Boolean(from) && Boolean(to) && from <= to;

  function apply() {
    if (!valid) return;
    router.push(`${base}?range=custom&from=${from}&to=${to}`);
    setOpen(false);
  }

  function reset() {
    setFrom("");
    setTo("");
    router.push(`${base}?range=month`);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-current={range === "custom" ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            range === "custom"
              ? "bg-[#8B1A1A] text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {range === "custom" ? label : "Custom dates"}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Filter by custom dates</DialogTitle>
          <DialogDescription>
            Show accounts and TAF activity between two calendar days, inclusive.
            Times use Philippine time (PHT).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[#333]">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#333] focus:border-[#8B1A1A] focus:outline-none"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-[#333]">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#333] focus:border-[#8B1A1A] focus:outline-none"
            />
          </label>
        </div>

        {from && to && from > to && (
          <p className="text-xs text-red-600">
            The “From” date must be on or before the “To” date.
          </p>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button
            type="button"
            onClick={apply}
            disabled={!valid}
            className="bg-[#8B1A1A] text-white hover:bg-[#a32020]"
          >
            Apply filter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
