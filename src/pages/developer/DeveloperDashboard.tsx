import React, { useEffect, useState } from 'react';
import { Code2, Database, FileCode2, Play, RefreshCw, Sparkles, Terminal } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';
import type { DeveloperOverviewPayload } from '../../types/niyamsetu';

export const DeveloperDashboard: React.FC = () => {
  const { token, overview } = useApp();
  const [devData, setDevData] = useState<DeveloperOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>('sch-pm-01');
  const [filterMode, setFilterMode] = useState<'all' | 'new'>('all');
  const [apiTestResult, setApiTestResult] = useState<string | null>(null);
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDeveloperOverview = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DeveloperOverviewPayload>('/developer/overview', { token });
      setDevData(res);
      if (res.scheme_schemas.length > 0 && !res.scheme_schemas.some((s) => s.scheme_id === selectedSchemeId)) {
        setSelectedSchemeId(res.scheme_schemas[0].scheme_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load developer overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDeveloperOverview();
  }, [token]);

  const runLiveEndpointTest = async (path: string) => {
    if (!token) return;
    setTestingEndpoint(path);
    try {
      if (path === '/api/eligibility/vault-summary') {
        const res = await apiRequest('/eligibility/vault-summary', { token });
        setApiTestResult(JSON.stringify(res, null, 2).slice(0, 2600));
      } else if (path === '/api/developer/overview') {
        const res = await apiRequest('/developer/overview', { token });
        setApiTestResult(JSON.stringify(res, null, 2).slice(0, 2600));
      } else {
        const clean = path.replace(/^\/api/, '');
        const res = await apiRequest(clean, { token });
        setApiTestResult(JSON.stringify(res, null, 2).slice(0, 2600));
      }
    } catch (err) {
      setApiTestResult(`Error testing ${path}: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setTestingEndpoint(null);
    }
  };

  const schemas = devData?.scheme_schemas || [];
  const visibleSchemas =
    filterMode === 'new' ? schemas.filter((s) => s.is_new) : schemas;
  const selectedSchema =
    schemas.find((s) => s.scheme_id === selectedSchemeId) || schemas[0];

  const selectedRules =
    overview?.rules.filter((r) => r.scheme_id === selectedSchema?.scheme_id) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
            DEVELOPER WORKSPACE · {devData?.api_version || 'v4.2-niyamsetu'}
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Developer Schema Registry, New Rollouts &amp; API Console
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Inspect all 16 machine-readable scheme schemas, track newly introduced schema versions,
            test live REST endpoints, and audit Firestore isolation contracts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadDeveloperOverview()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total JSON Schemas', val: devData?.schema_count ?? 16 },
          { label: 'Newly Introduced Schemas', val: devData?.new_schemas_count ?? 6 },
          { label: 'Rule AST Nodes', val: devData?.total_rules_ast ?? 82 },
          {
            label: 'Mean Extraction Confidence',
            val: `${Math.round((devData?.avg_extraction_confidence ?? 0.92) * 100)}%`,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <div className="font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {kpi.val}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Newly Introduced Schemas Changelog */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Newly Introduced Schemas &amp; Version Rollouts
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {(
              [
                ['all', `All Schemas (${schemas.length})`],
                ['new', `New Releases (${schemas.filter((s) => s.is_new).length})`],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterMode(mode)}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                  filterMode === mode
                    ? 'bg-emerald-700 text-white dark:bg-emerald-500 dark:text-slate-950'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Schema Selector List */}
          <div className="lg:col-span-5 space-y-2 max-h-[430px] overflow-y-auto pr-1">
            {visibleSchemas.map((s) => {
              const active = selectedSchema?.scheme_id === s.scheme_id;
              return (
                <button
                  key={s.scheme_id}
                  type="button"
                  onClick={() => setSelectedSchemeId(s.scheme_id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors cursor-pointer ${
                    active
                      ? 'border-emerald-700 dark:border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {s.code} · v{s.schema_version}
                    </span>
                    <span
                      className={
                        s.is_new
                          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                      }
                    >
                      {s.is_new ? `NEW · ${s.introduced_date}` : s.introduced_date}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                    {s.active_rules_count} active rules · {s.draft_rules_count} draft ·{' '}
                    {s.required_documents.length} required docs
                  </div>
                </button>
              );
            })}
          </div>

          {/* Live JSON Schema & Rule AST Preview */}
          <div className="lg:col-span-7 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-4 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                <FileCode2 className="w-4 h-4" />
                <span>
                  schema://{selectedSchema?.code || 'PM-01'}/v{selectedSchema?.schema_version || '1.0'}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {selectedSchema?.target_group}
              </span>
            </div>

            {selectedSchema && (
              <pre className="text-xs font-mono text-slate-200 overflow-x-auto max-h-[360px] leading-relaxed">
                {JSON.stringify(
                  {
                    scheme_id: selectedSchema.scheme_id,
                    code: selectedSchema.code,
                    schema_version: selectedSchema.schema_version,
                    introduced_date: selectedSchema.introduced_date,
                    is_new: selectedSchema.is_new,
                    required_input_fields: selectedSchema.eligibility_fields,
                    required_vault_documents: selectedSchema.required_documents,
                    ast_rules: selectedRules.map((r) => ({
                      id: r.id,
                      rule_key: r.rule_key,
                      version: r.version,
                      status: r.status,
                      expression: `${r.field} ${r.operator} ${String(r.value)}`,
                      confidence: r.confidence,
                    })),
                  },
                  null,
                  2
                )}
              </pre>
            )}
          </div>
        </div>
      </section>

      {/* API Endpoint Sandbox & Firestore Collection Contracts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <Terminal className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              REST API Endpoints &amp; Live Tester
            </h2>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {(devData?.api_endpoints || []).map((ep) => (
              <div
                key={`${ep.method}-${ep.path}`}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-mono">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {ep.method}
                    </span>{' '}
                    <span className="text-slate-900 dark:text-slate-100 font-semibold">
                      {ep.path}
                    </span>{' '}
                    <span className="text-slate-500">· {ep.auth}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">{ep.purpose}</div>
                </div>
                {ep.method === 'GET' && (
                  <button
                    type="button"
                    disabled={testingEndpoint === ep.path}
                    onClick={() => void runLiveEndpointTest(ep.path)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:border-emerald-600 cursor-pointer shrink-0"
                  >
                    <Play className="w-3 h-3" />
                    <span>{testingEndpoint === ep.path ? 'Running...' : 'Test GET'}</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {apiTestResult && (
            <div className="rounded-md bg-slate-950 text-emerald-300 p-3 text-[11px] font-mono overflow-x-auto max-h-56">
              <pre>{apiTestResult}</pre>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <Database className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Firestore &amp; Blueprint Contracts
            </h2>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {(devData?.firestore_collections || []).map((col) => (
              <div key={col.path} className="py-2.5 space-y-0.5 text-xs">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {col.path}
                  </span>
                  <span className="text-slate-500 tabular-nums">
                    {col.required_fields} req fields
                  </span>
                </div>
                <div className="text-slate-600 dark:text-slate-400">{col.isolation_model}</div>
              </div>
            ))}
          </div>

          <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Code2 className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>AI All-16-Scheme Guarantee</span>
            </div>
            <p>
              <code className="font-mono">POST /api/eligibility/ai-plan</code> computes deterministic
              evaluations for all 16 schemes first, then enriches every scheme code via{' '}
              <code className="font-mono">gemini-4-hydrogen</code> so zero schemes are ever omitted.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};
