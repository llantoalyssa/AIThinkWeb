"use client";

import { useState, useEffect } from "react";
import { getCostLogs, type CostLogEntry } from "@/server/actions/cost-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, DollarSign, Cpu, Globe, Users, FileText } from "lucide-react";
import { SOURCE_META, SourceBadge } from "@/components/cost-log-source-badge";

export default function CostLogsPage() {
  const [logs, setLogs] = useState<CostLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getCostLogs(PAGE_SIZE, (page - 1) * PAGE_SIZE);
      if (cancelled) return;
      if (result.success) {
        setLogs(result.logs);
        setTotal(result.total);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const totalCost = logs.reduce((s, l) => s + l.totalCost, 0);
  const totalAiTokens = logs.reduce((s, l) => s + l.aiInputTokens + l.aiOutputTokens, 0);
  const sourceKeys = ["taf_analyze", "taf_reanalyze", "journal", "other"];
  const sourceTotals = sourceKeys
    .map((key) => {
      const entries = logs.filter((l) => (l.source || "taf_analyze") === key);
      return {
        key,
        count: entries.length,
        aiCost: entries.reduce((s, l) => s + l.aiCost, 0),
        serpapiCost: entries.reduce((s, l) => s + l.serpapiCost, 0),
        totalCost: entries.reduce((s, l) => s + l.totalCost, 0),
        inputTokens: entries.reduce((s, l) => s + l.aiInputTokens, 0),
        outputTokens: entries.reduce((s, l) => s + l.aiOutputTokens, 0),
      };
    })
    .filter((s) => s.count > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {}
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="h-5 w-5 text-[#8B1A1A]" />
        <h1 className="text-xl font-bold text-[#333]">Analysis Cost Logs</h1>
        <span className="text-xs text-gray-400 ml-auto">
          {total} total analyses tracked
        </span>
      </div>
      <Separator />

      {}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <DollarSign className="h-4 w-4 text-green-600" />
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#333]">
              ${totalCost.toFixed(6)}
            </p>
            <p className="text-xs text-gray-400">
              ${(totalCost / (logs.length || 1)).toFixed(8)} avg per analysis
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-indigo-600" />
              AI Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#333]">
              {totalAiTokens.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">
              @ $0.15/M input · $0.60/M output
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Globe className="h-4 w-4 text-purple-600" />
              SerpAPI Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#333]">
              {logs.filter((l) => l.serpapiCalls > 0).length}
            </p>
            <p className="text-xs text-gray-400">
              @ $0.01/call
            </p>
          </CardContent>
        </Card>
      </div>

      {}
      {sourceTotals.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-[#8B1A1A]" />
              Cost by Source
            </CardTitle>
            <p className="text-xs text-gray-400">
              Where the tokens & costs came from — each entry explains the
              operation that triggered it.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {sourceTotals.map((s) => {
              const meta = SOURCE_META[s.key] || SOURCE_META.other;
              return (
                <div
                  key={s.key}
                  className="rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <SourceBadge source={s.key} />
                    <span className="text-xs text-gray-400">
                      {s.count} occurrence{s.count !== 1 ? "s" : ""}
                    </span>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-bold text-[#333]">
                        ${s.totalCost.toFixed(6)}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {(s.inputTokens + s.outputTokens).toLocaleString()} tokens
                        ({(s.inputTokens).toLocaleString()} in / {s.outputTokens.toLocaleString()} out)
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                    {meta.description}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-[#8B1A1A]" />
            Per-Analysis Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    TAF Title
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    V
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Input Tokens
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Output Tokens
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    AI Cost
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    SerpAPI
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-gray-400 shrink-0" />
                        <span className="text-[#333] font-medium truncate max-w-[120px]">
                          {log.userName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">
                      <span className={log.source === "journal" ? "italic" : ""}>
                        {log.tafTitle}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={log.source} />
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {log.versionNumber != null ? `V${log.versionNumber}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                      {log.aiInputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                      {log.aiOutputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      <span className="text-indigo-600">
                        ${log.aiCost.toFixed(8)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {log.serpapiCalls > 0 ? (
                        <span className="text-purple-600">
                          ${log.serpapiCost.toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-[#333]">
                      ${log.totalCost.toFixed(8)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                      {new Date(log.analyzedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-sm text-gray-400 italic"
                    >
                      No analysis cost logs yet. Run an analysis to see costs
                      here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                Page {page} of {totalPages} · {total} entries
                {logs.length > 0 && (
                  <>
                    {" · showing "}
                    {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, total)}
                  </>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs font-medium text-gray-500">
                  {page}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="h-4 w-4 text-green-600" />
            Pricing Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-xs text-gray-500">AI (DeepSeek V4 Flash)</span>
              <p className="font-medium text-[#333]">
                $0.15/M input · $0.60/M output
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">SerpAPI (Google Scholar)</span>
              <p className="font-medium text-[#333]">
                $0.01/search
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-500">SBERT (locally)</span>
              <p className="font-medium text-green-600">Free</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}