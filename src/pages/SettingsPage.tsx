import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Cpu, Keyboard } from 'lucide-react';
import { Layout } from '../components/Layout';
import { getEditorPreferences, saveEditorPreferences } from '../components/PythonEditor';
import { apiFetch } from '../lib/api';
import { usePyodideRuntime } from '../lib/pyodideRunner';

export function SettingsPage() {
  const [prefs, setPrefs] = useState(getEditorPreferences);
  const [saved, setSaved] = useState(false);
  const pyodideRuntime = usePyodideRuntime(false);

  const healthQuery = useQuery({
    queryKey: ['server-health'],
    queryFn: () => apiFetch<{ status: string; engine: string; python_runtime: string }>('/api/health'),
  });

  const handleSave = () => {
    saveEditorPreferences(prefs);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <Layout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Workspace Settings</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Configure Monaco Python editor defaults and review execution environment details.</p>
        </div>

        {/* Editor Preferences */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Monaco Editor Preferences</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Font Size</label>
              <select
                value={prefs.fontSize}
                onChange={(e) => setPrefs((p) => ({ ...p, fontSize: Number(e.target.value) }))}
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                {[12, 13, 14, 15, 16, 18, 20].map((sz) => (
                  <option key={sz} value={sz}>
                    {sz} px
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Indentation (Spaces)</label>
              <select
                value={prefs.tabSize}
                onChange={(e) => setPrefs((p) => ({ ...p, tabSize: Number(e.target.value) }))}
                className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-2 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                <option value={4}>4 spaces (PEP 8 standard)</option>
                <option value={2}>2 spaces</option>
              </select>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.minimap}
              onChange={(e) => setPrefs((p) => ({ ...p, minimap: e.target.checked }))}
              className="rounded border-zinc-700 bg-zinc-900 accent-blue-600"
            />
            Show code minimap inside editor
          </label>

          <div>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white"
            >
              {saved && <Check className="h-3.5 w-3.5" />}
              {saved ? 'Preferences Saved' : 'Save Editor Preferences'}
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Reference */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-white">IDE Keyboard Shortcuts</h2>
          </div>
          <div className="divide-y divide-zinc-800/60 text-xs">
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-300">Run Public Test Cases / Custom Input</span>
              <span className="font-mono text-zinc-400">Ctrl + Enter / Cmd + Enter</span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-300">Submit Solution (Public + Hidden Tests)</span>
              <span className="font-mono text-zinc-400">Ctrl + Shift + Enter</span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-zinc-300">Save Draft Code</span>
              <span className="font-mono text-zinc-400">Ctrl + S / Cmd + S</span>
            </div>
          </div>
        </div>

        {/* Execution Sandbox Info */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-white">Python Execution Engine</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-zinc-500">Active Engine</div>
              <div className="font-mono text-zinc-200 mt-0.5">
                {healthQuery.data?.engine ?? 'Pyodide WebAssembly (Browser Worker)'}
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Browser WASM Runtime</div>
              <div className="font-mono text-zinc-200 mt-0.5">
                {pyodideRuntime.status === 'ready'
                  ? `${pyodideRuntime.pythonVersion || 'Python 3'} (Ready)`
                  : pyodideRuntime.status === 'initializing'
                  ? 'Initializing...'
                  : pyodideRuntime.status === 'error'
                  ? 'Initialization Error'
                  : 'Loads on Workspace Open'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
