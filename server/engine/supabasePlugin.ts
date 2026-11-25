import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RuleRecord } from '../../src/types/niyamsetu.ts';
import type { DatabaseState } from './store.ts';

let cachedAdminClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key && url.startsWith('https://'));
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cachedAdminClient) return cachedAdminClient;

  const url = process.env.SUPABASE_URL!.trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  cachedAdminClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedAdminClient;
}

let warnedMissingSnapshotTable = false;

export async function loadAppStateSnapshotFromSupabase(): Promise<DatabaseState | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('app_state_snapshots')
      .select('state')
      .eq('id', 'primary')
      .maybeSingle();

    if (error) {
      if (
        !warnedMissingSnapshotTable &&
        (error.message.includes('app_state_snapshots') || error.code === '42P01')
      ) {
        warnedMissingSnapshotTable = true;
        console.warn(
          '[supabase] Table public.app_state_snapshots not found yet. Run supabase/migrations/002_niyamsetu_production_persistence.sql for cross-restart persistence.'
        );
      }
      return null;
    }

    if (data && data.state && typeof data.state === 'object') {
      return data.state as DatabaseState;
    }
    return null;
  } catch (err) {
    console.warn(
      'Supabase snapshot load warning:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return null;
  }
}

export async function saveAppStateSnapshotToSupabase(
  state: DatabaseState
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false };

  try {
    const { error } = await supabase.from('app_state_snapshots').upsert(
      {
        id: 'primary',
        seed_version: state.seed_version || 6,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      if (
        !warnedMissingSnapshotTable &&
        (error.message.includes('app_state_snapshots') || error.code === '42P01')
      ) {
        warnedMissingSnapshotTable = true;
        console.warn(
          '[supabase] Table public.app_state_snapshots not found yet. Run supabase/migrations/002_niyamsetu_production_persistence.sql for cross-restart persistence.'
        );
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Snapshot save failed',
    };
  }
}

export async function syncStateToSupabase(
  state: DatabaseState
): Promise<{ synced: boolean; counts?: Record<string, number>; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { synced: false };
  }

  try {
    const counts: Record<string, number> = {};

    const snapshotRes = await saveAppStateSnapshotToSupabase(state);
    if (snapshotRes.ok) {
      counts.app_state_snapshots = 1;
    }

    const profileRows = state.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      language_preference: u.language_preference === 'te' ? 'te' : 'en',
      created_at: u.created_at,
    }));
    if (profileRows.length > 0) {
      const { error } = await supabase.from('user_profiles').upsert(profileRows, { onConflict: 'id' });
      if (!error) counts.user_profiles = profileRows.length;
    }

    if (state.schemes.length > 0) {
      const schemeRows = state.schemes.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        name_te: s.name_te,
        authority: s.authority,
        category: s.beneficiary_category || s.target_group || 'Public Welfare',
        description: s.description,
        description_te: s.description_te,
        benefit_summary: s.benefit_summary,
        benefit_summary_te: s.benefit_summary,
      }));
      const { error } = await supabase.from('schemes').upsert(schemeRows, { onConflict: 'id' });
      if (!error) counts.schemes = schemeRows.length;
    }

    if (state.documents.length > 0) {
      const { error } = await supabase.from('documents').upsert(state.documents, { onConflict: 'id' });
      if (!error) counts.documents = state.documents.length;
    }

    if (state.document_pages.length > 0) {
      const { error } = await supabase
        .from('document_pages')
        .upsert(state.document_pages, { onConflict: 'id' });
      if (!error) counts.document_pages = state.document_pages.length;
    }

    if (state.rules.length > 0) {
      const ruleRows = state.rules.map((r) => ({
        ...r,
        value: String(r.value),
      }));
      const { error } = await supabase.from('rules').upsert(ruleRows, { onConflict: 'id' });
      if (!error) counts.rules = ruleRows.length;
    }

    if (state.rule_changes.length > 0) {
      const { error } = await supabase
        .from('rule_changes')
        .upsert(state.rule_changes, { onConflict: 'id' });
      if (!error) counts.rule_changes = state.rule_changes.length;
    }

    if (state.impact_reports.length > 0) {
      const { error } = await supabase
        .from('impact_reports')
        .upsert(state.impact_reports, { onConflict: 'id' });
      if (!error) counts.impact_reports = state.impact_reports.length;
    }

    if (state.deadlines.length > 0) {
      const { error } = await supabase.from('deadlines').upsert(state.deadlines, { onConflict: 'id' });
      if (!error) counts.deadlines = state.deadlines.length;
    }

    if (state.alerts.length > 0) {
      const { error } = await supabase.from('alerts').upsert(state.alerts, { onConflict: 'id' });
      if (!error) counts.alerts = state.alerts.length;
    }

    if (state.audit_log.length > 0) {
      const recentAudit = state.audit_log.slice(0, 100);
      const { error } = await supabase.from('audit_log').upsert(recentAudit, { onConflict: 'id' });
      if (!error) counts.audit_log = recentAudit.length;
    }

    return { synced: Object.keys(counts).length > 0, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Supabase sync failed';
    console.warn('Supabase background sync warning:', message);
    return { synced: false, error: message };
  }
}

export async function searchRulesInSupabase(query: string): Promise<{
  usedSupabase: boolean;
  rules: RuleRecord[];
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { usedSupabase: false, rules: [] };
  }

  const sanitized = query.trim();
  if (!sanitized) {
    const { data, error } = await supabase.from('rules').select('*').eq('status', 'active').limit(25);
    if (error) throw new Error('Supabase rule lookup failed', { cause: error });
    return { usedSupabase: true, rules: (data || []) as RuleRecord[] };
  }

  const { data, error } = await supabase
    .from('rules')
    .select('*')
    .eq('status', 'active')
    .textSearch('search_tsv', sanitized, { type: 'websearch', config: 'english' })
    .limit(20);

  if (error) {
    throw new Error('Supabase full-text search failed', { cause: error });
  }
  return { usedSupabase: true, rules: (data || []) as RuleRecord[] };
}

export async function evaluateEligibilityViaSupabaseRpc(
  income: number | null,
  marks: number | null
): Promise<{ usedSupabase: boolean; rows: unknown[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { usedSupabase: false, rows: [] };
  }

  const { data, error } = await supabase.rpc('match_schemes_for_citizen', {
    p_income: income,
    p_marks: marks,
  });

  if (error) {
    throw new Error('Supabase eligibility RPC failed', { cause: error });
  }
  return { usedSupabase: true, rows: Array.isArray(data) ? data : [] };
}

export async function uploadDocumentToSupabaseStorage(params: {
  docId: string;
  fileName: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ storagePath: string | null; signedUrl: string | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { storagePath: null, signedUrl: null };
  }

  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `notifications/${params.docId}/${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('niyamsetu-documents')
    .upload(storagePath, params.buffer, {
      contentType: params.contentType,
      upsert: true,
    });

  if (uploadError) {
    console.warn('Supabase Storage upload warning:', uploadError.message);
    return { storagePath: null, signedUrl: null };
  }

  const { data: signedData } = await supabase.storage
    .from('niyamsetu-documents')
    .createSignedUrl(storagePath, 3600);

  return {
    storagePath,
    signedUrl: signedData?.signedUrl || null,
  };
}
