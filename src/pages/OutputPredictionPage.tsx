import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, CheckCircle2, XCircle, Send } from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  type OutputPredictionAttemptResponse,
  type OutputPredictionItem,
} from '../lib/api';

export function OutputPredictionPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string>('');
  const [predictionText, setPredictionText] = useState('');
  const [lastAttempt, setLastAttempt] = useState<OutputPredictionAttemptResponse | null>(null);

  const query = useQuery({
    queryKey: ['output-predictions', user?.id ?? 'anon'],
    queryFn: () =>
      apiFetch<{
        stats: { total: number; attempted: number; correct: number; accuracy_pct: number };
        items: OutputPredictionItem[];
      }>('/api/output-predictions'),
  });

  const items = query.data?.items ?? [];
  const stats = query.data?.stats;

  useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    }
  }, [selectedId, items]);

  const activeItem = items.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    setLastAttempt(null);
    setPredictionText('');
  }, [selectedId]);

  const submitMutation = useMutation({
    mutationFn: () =>
      apiFetch<OutputPredictionAttemptResponse>(`/api/output-predictions/${selectedId}/attempt`, {
        method: 'POST',
        body: JSON.stringify({ predicted_output: predictionText }),
      }),
    onSuccess: (res) => {
      setLastAttempt(res);
      void queryClient.invalidateQueries({ queryKey: ['output-predictions'] });
    },
  });

  const revealedExpected = lastAttempt?.expected_output ?? activeItem?.expected_output;
  const revealedOrder = lastAttempt?.execution_order ?? activeItem?.execution_order;
  const revealedVars = lastAttempt?.variable_changes ?? activeItem?.variable_changes;
  const revealedExplanation = lastAttempt?.explanation ?? activeItem?.explanation;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-400" />
              Python Output Prediction Studio
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Mentally trace Python execution without running the interpreter. Predict exact stdout, then inspect execution order and state transitions.
            </p>
          </div>
          {stats && (
            <div className="flex items-center gap-4 rounded-md border border-zinc-800 bg-[#11141B] px-4 py-2 text-xs font-mono tabular-nums shrink-0">
              <span>
                Accuracy: <strong className="text-emerald-400">{stats.accuracy_pct}%</strong>
              </span>
              <span className="text-zinc-600">|</span>
              <span>
                {stats.correct} / {stats.total} mastered
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Snippet List */}
          <div className="lg:col-span-4 rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden flex flex-col max-h-[680px]">
            <div className="px-4 py-3 border-b border-zinc-800/80 text-xs font-semibold text-white">
              Snippets ({items.length})
            </div>
            <div className="divide-y divide-zinc-800/60 overflow-y-auto">
              {items.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between gap-2 ${
                    item.id === selectedId ? 'bg-blue-600/15' : 'hover:bg-zinc-800/30'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-100 truncate">
                      <span className="font-mono text-zinc-500 mr-1.5 tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      {item.title}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
                      <DifficultyText difficulty={item.difficulty} />
                      <span>·</span>
                      <span className="truncate">{item.concept}</span>
                    </div>
                  </div>
                  {item.is_correct ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : item.attempted ? (
                    <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {/* Right Prediction Workspace */}
          <div className="lg:col-span-8 space-y-4">
            {activeItem && (
              <>
                <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-white">{activeItem.title}</h2>
                      <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                        <DifficultyText difficulty={activeItem.difficulty} />
                        <span>·</span>
                        <span>{activeItem.concept}</span>
                      </div>
                    </div>
                  </div>

                  <pre className="rounded-md border border-zinc-800 bg-[#0B0D11] p-4 font-mono text-xs text-zinc-100 overflow-x-auto leading-relaxed">
                    {activeItem.code}
                  </pre>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-zinc-300">
                      Your Predicted Output (exact stdout lines, no Python interpreter run)
                    </label>
                    <textarea
                      rows={3}
                      value={predictionText}
                      onChange={(e) => setPredictionText(e.target.value)}
                      placeholder="Type exact stdout output..."
                      className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] p-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={submitMutation.isPending || !predictionText.trim()}
                        onClick={() => submitMutation.mutate()}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-xs font-medium text-white"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {submitMutation.isPending ? 'Checking...' : 'Check Prediction'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Revealed Breakdown */}
                {(lastAttempt || revealedExpected !== undefined) && (
                  <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-4 text-xs">
                    {lastAttempt && (
                      <div
                        className={`rounded-md border p-3 flex items-center gap-2 font-medium ${
                          lastAttempt.is_correct
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        }`}
                      >
                        {lastAttempt.is_correct ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0" />
                        )}
                        {lastAttempt.is_correct
                          ? 'Exact match! Your mental execution trace matches Python stdout.'
                          : 'Output mismatch. Inspect the expected output, execution order, and variable trace below.'}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded border border-zinc-800 bg-[#0B0D11] p-3">
                        <div className="text-[11px] font-semibold text-zinc-400 mb-1">Expected Stdout</div>
                        <pre className="font-mono text-emerald-300 whitespace-pre-wrap">{revealedExpected}</pre>
                      </div>
                      <div className="rounded border border-zinc-800 bg-[#0B0D11] p-3">
                        <div className="text-[11px] font-semibold text-zinc-400 mb-1">Explanation</div>
                        <p className="text-zinc-200 leading-relaxed">{revealedExplanation}</p>
                      </div>
                    </div>

                    {revealedOrder && revealedOrder.length > 0 && (
                      <div className="rounded border border-zinc-800 bg-[#0B0D11] p-3 space-y-1.5">
                        <div className="text-[11px] font-semibold text-zinc-400">Execution Order</div>
                        <ol className="list-decimal list-inside space-y-1 text-zinc-300 font-mono text-[11px]">
                          {revealedOrder.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {revealedVars && revealedVars.length > 0 && (
                      <div className="rounded border border-zinc-800 bg-[#0B0D11] p-3 space-y-1.5">
                        <div className="text-[11px] font-semibold text-zinc-400">Variable State Changes</div>
                        <div className="divide-y divide-zinc-800/70">
                          {revealedVars.map((vc, i) => (
                            <div key={i} className="py-1.5 flex items-center justify-between gap-3 font-mono text-[11px]">
                              <span className="text-zinc-400">{vc.step}</span>
                              <span className="text-blue-300 text-right">{vc.variables}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
