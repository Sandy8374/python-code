import { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Activity } from 'lucide-react';
import type { DryRunTraceResult } from '../lib/pyodideRunner';

interface DryRunVisualizerProps {
  sourceCode: string;
  trace: DryRunTraceResult | null;
  isLoading: boolean;
  error?: string;
  runtimeReady: boolean;
  onRunDryRun: () => void;
}

export function DryRunVisualizer({
  sourceCode,
  trace,
  isLoading,
  error,
  runtimeReady,
  onRunDryRun,
}: DryRunVisualizerProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const steps = trace?.steps ?? [];

  useEffect(() => {
    setStepIdx(0);
    setPlaying(false);
  }, [trace]);

  useEffect(() => {
    if (!playing || steps.length === 0) return;
    const id = setInterval(() => {
      setStepIdx((prev) => {
        if (prev >= steps.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 650);
    return () => clearInterval(id);
  }, [playing, steps.length]);

  const currentStep = steps[stepIdx] ?? null;
  const sourceLines = sourceCode.split('\n');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-200">Line-by-Line Execution Visualizer</span>
          {trace && steps.length > 0 && (
            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
              Step {stepIdx + 1} / {steps.length}
              {trace.truncated ? ' (capped at 250 steps)' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {steps.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setStepIdx(0);
                }}
                title="Reset to first step"
                className="p-1.5 rounded border border-zinc-800 bg-[#0B0D11] text-zinc-400 hover:text-white"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={stepIdx <= 0}
                onClick={() => {
                  setPlaying(false);
                  setStepIdx((s) => Math.max(0, s - 1));
                }}
                title="Previous step"
                className="p-1.5 rounded border border-zinc-800 bg-[#0B0D11] text-zinc-300 hover:text-white disabled:opacity-35"
              >
                <SkipBack className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (stepIdx >= steps.length - 1) setStepIdx(0);
                  setPlaying((p) => !p);
                }}
                className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-200 whitespace-nowrap shrink-0"
              >
                {playing ? <Pause className="h-3 w-3 text-amber-400" /> : <Play className="h-3 w-3 text-emerald-400" />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                disabled={stepIdx >= steps.length - 1}
                onClick={() => {
                  setPlaying(false);
                  setStepIdx((s) => Math.min(steps.length - 1, s + 1));
                }}
                title="Next step"
                className="p-1.5 rounded border border-zinc-800 bg-[#0B0D11] text-zinc-300 hover:text-white disabled:opacity-35"
              >
                <SkipForward className="h-3 w-3" />
              </button>
            </>
          )}

          <button
            type="button"
            disabled={!runtimeReady || isLoading}
            onClick={onRunDryRun}
            className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap shrink-0"
          >
            <Activity className="h-3 w-3" />
            {isLoading ? 'Tracing...' : 'Trace Execution'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      {trace && !trace.ok && trace.error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 font-mono whitespace-pre-wrap">
          {trace.error}
        </div>
      )}

      {!trace && !isLoading && !error && (
        <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-4 text-xs text-zinc-400">
          Click <span className="text-zinc-200 font-medium">Trace Execution</span> to step line-by-line through your Python code using the Pyodide tracer (`sys.settrace`) and inspect variable values, types, call stack, and return values.
        </div>
      )}

      {trace && steps.length > 0 && currentStep && (
        <div className="space-y-3">
          {/* Scrubber Slider */}
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={stepIdx}
            onChange={(e) => {
              setPlaying(false);
              setStepIdx(Number(e.target.value));
            }}
            aria-label="Execution step scrubber"
            className="w-full accent-blue-500 cursor-pointer"
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Source Lines Highlight */}
            <div className="lg:col-span-6 rounded-md border border-zinc-800 bg-[#0B0D11] overflow-hidden">
              <div className="px-3 py-1.5 border-b border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
                <span>
                  Executing line <span className="font-mono text-blue-400 tabular-nums">{currentStep.line_number}</span>
                </span>
                <span className="font-mono text-zinc-500">
                  {currentStep.event} · {currentStep.function_name}()
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto py-1.5 font-mono text-[11px]">
                {sourceLines.map((line, i) => {
                  const lineNo = i + 1;
                  const active = lineNo === currentStep.line_number;
                  return (
                    <div
                      key={lineNo}
                      className={`px-3 py-0.5 flex items-start gap-2.5 ${
                        active ? 'bg-blue-500/15 text-white' : 'text-zinc-400'
                      }`}
                    >
                      <span className="w-6 text-right select-none text-zinc-600 tabular-nums shrink-0">{lineNo}</span>
                      <span className="whitespace-pre overflow-x-auto">{line || ' '}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Variables & Call Stack */}
            <div className="lg:col-span-6 space-y-2.5">
              <div className="rounded-md border border-zinc-800 bg-[#0B0D11] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Local Variables</span>
                  <span className="font-mono text-zinc-500 tabular-nums">{currentStep.variables.length} active</span>
                </div>
                {currentStep.variables.length === 0 ? (
                  <div className="px-3 py-2.5 text-[11px] text-zinc-500">No user variables in current frame.</div>
                ) : (
                  <div className="max-h-32 overflow-y-auto divide-y divide-zinc-800/60">
                    {currentStep.variables.map((v) => (
                      <div key={v.name} className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] font-mono">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-blue-300 truncate">{v.name}</span>
                          <span className="text-[10px] text-zinc-500 shrink-0">{v.type}</span>
                        </div>
                        <span className="text-emerald-300 truncate max-w-[60%] text-right">{v.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-2.5 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">Call Stack:</span>
                  <span className="font-mono text-zinc-300 truncate">
                    {currentStep.call_stack.length > 0 ? currentStep.call_stack.join(' → ') : '<module>'}
                  </span>
                </div>
                {currentStep.return_value !== null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500">Return Value:</span>
                    <span className="font-mono text-emerald-400 truncate">{currentStep.return_value}</span>
                  </div>
                )}
                {currentStep.stdout && (
                  <div className="pt-1 border-t border-zinc-800/80">
                    <div className="text-zinc-500 mb-0.5">Captured Stdout:</div>
                    <pre className="font-mono text-zinc-200 whitespace-pre-wrap max-h-16 overflow-y-auto">
                      {currentStep.stdout}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Execution Sequence Strip */}
          <div className="rounded-md border border-zinc-800 bg-[#0B0D11] p-2.5">
            <div className="text-[11px] text-zinc-500 mb-1.5">Execution Sequence</div>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {steps.map((st, idx) => (
                <button
                  key={st.step_index}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setStepIdx(idx);
                  }}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] tabular-nums border whitespace-nowrap shrink-0 transition-colors ${
                    idx === stepIdx
                      ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                      : idx < stepIdx
                      ? 'border-zinc-800 bg-zinc-900 text-zinc-400'
                      : 'border-zinc-800/60 bg-[#0B0D11] text-zinc-600'
                  }`}
                >
                  L{st.line_number}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
