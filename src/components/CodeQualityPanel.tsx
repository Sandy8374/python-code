import { CheckCircle2, Sparkles, Wand2, AlertTriangle } from 'lucide-react';
import type { CodeQualityReport } from '../lib/pyodideRunner';

interface CodeQualityPanelProps {
  report: CodeQualityReport | null;
  isLoading: boolean;
  runtimeReady: boolean;
  onAnalyze: () => void;
  onApplyFormat?: (formattedCode: string) => void;
}

export function CodeQualityPanel({
  report,
  isLoading,
  runtimeReady,
  onAnalyze,
  onApplyFormat,
}: CodeQualityPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-200">Python Code Quality &amp; PEP 8 Inspector</span>
          {report && (
            <span
              className={`font-mono text-[11px] tabular-nums ${
                report.score >= 85 ? 'text-emerald-400' : report.score >= 65 ? 'text-amber-400' : 'text-rose-400'
              }`}
            >
              Score {report.score}/100
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {report && report.syntax_valid && onApplyFormat && (
            <button
              type="button"
              onClick={() => onApplyFormat(report.formatted_code)}
              className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-200 whitespace-nowrap shrink-0"
            >
              <Wand2 className="h-3 w-3 text-blue-400" />
              Auto-Format
            </button>
          )}
          <button
            type="button"
            disabled={!runtimeReady || isLoading}
            onClick={onAnalyze}
            className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-3 w-3" />
            {isLoading ? 'Analyzing...' : 'Analyze Quality'}
          </button>
        </div>
      </div>

      <div className="text-[11px] text-zinc-500">
        Advisory AST &amp; PEP 8 diagnostics (unused imports/variables, naming conventions, type hints, mutable defaults, line length). Functionally correct solutions always pass regardless of style hints.
      </div>

      {!report && !isLoading && (
        <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-4 text-xs text-zinc-400">
          Click <span className="text-zinc-200 font-medium">Analyze Quality</span> to run offline Python AST style and idiom checks on your code.
        </div>
      )}

      {report && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Quality Score</div>
              <div className="text-sm font-mono font-semibold text-white tabular-nums mt-0.5">{report.score}%</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Warnings</div>
              <div className="text-sm font-mono font-semibold text-amber-400 tabular-nums mt-0.5">
                {report.summary.warnings + report.summary.errors}
              </div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Suggestions</div>
              <div className="text-sm font-mono font-semibold text-blue-400 tabular-nums mt-0.5">
                {report.summary.suggestions}
              </div>
            </div>
          </div>

          {report.issues.length === 0 ? (
            <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3.5 flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Clean Python code — no PEP 8, typing, or static anti-pattern warnings detected.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/70 rounded-md border border-zinc-800 bg-[#0B0D11] overflow-hidden">
              {report.issues.map((issue, idx) => (
                <div key={`${issue.code}-${issue.line}-${idx}`} className="px-3 py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`h-3.5 w-3.5 shrink-0 ${
                          issue.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                        }`}
                      />
                      <span className="font-mono text-[11px] text-zinc-300">{issue.code}</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-[11px] text-zinc-400">{issue.category}</span>
                    </div>
                    <p className="text-zinc-200 pl-5">{issue.message}</p>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500 tabular-nums shrink-0">
                    Line {issue.line}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
