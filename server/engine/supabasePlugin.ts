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

export async function syncStateToSupabase(
  state: DatabaseState
): Promise<{ synced: boolean; counts?: Record<string, number>; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { synced: false };
  }

  try {
    const counts: Record<string, number> = {};

    const profileRows = state.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      language_preference: u.language_preference,
      created_at: u.created_at,
    }));
    if (profileRows.length > 0) {
      const { error } = await supabase.from('user_profiles').upsert(profileRows, { onConflict: 'id' });
      if (error) throw error;
      counts.user_profiles = profileRows.length;
    }

    if (state.schemes.length > 0) {
      const { error } = await supabase.from('schemes').upsert(state.schemes, { onConflict: 'id' });
      if (error) throw error;
      counts.schemes = state.schemes.length;
    }

    if (state.documents.length > 0) {
      const { error } = await supabase.from('documents').upsert(state.documents, { onConflict: 'id' });
      if (error) throw error;
      counts.documents = state.documents.length;
    }

    if (state.document_pages.length > 0) {
      const { error } = await supabase
        .from('document_pages')
        .upsert(state.document_pages, { onConflict: 'id' });
      if (error) throw error;
      counts.document_pages = state.document_pages.length;
    }

    if (state.rules.length > 0) {
      const ruleRows = state.rules.map((r) => ({
        ...r,
        value: String(r.value),
      }));
      const { error } = await supabase.from('rules').upsert(ruleRows, { onConflict: 'id' });
      if (error) throw error;
      counts.rules = ruleRows.length;
    }

    if (state.rule_changes.length > 0) {
      const { error } = await supabase
        .from('rule_changes')
        .upsert(state.rule_changes, { onConflict: 'id' });
      if (error) throw error;
      counts.rule_changes = state.rule_changes.length;
    }

    if (state.rule_links.length > 0) {
      const { error } = await supabase.from('rule_links').upsert(state.rule_links, { onConflict: 'id' });
      if (error) throw error;
      counts.rule_links = state.rule_links.length;
    }

    if (state.impact_reports.length > 0) {
      const { error } = await supabase
        .from('impact_reports')
        .upsert(state.impact_reports, { onConflict: 'id' });
      if (error) throw error;
      counts.impact_reports = state.impact_reports.length;
    }

    if (state.procedure_steps.length > 0) {
      const { error } = await supabase
        .from('procedure_steps')
        .upsert(state.procedure_steps, { onConflict: 'id' });
      if (error) throw error;
      counts.procedure_steps = state.procedure_steps.length;
    }

    if (state.required_documents.length > 0) {
      const { error } = await supabase
        .from('required_documents')
        .upsert(state.required_documents, { onConflict: 'id' });
      if (error) throw error;
      counts.required_documents = state.required_documents.length;
    }

    if (state.readiness_reports.length > 0) {
      const { error } = await supabase
        .from('readiness_reports')
        .upsert(state.readiness_reports, { onConflict: 'id' });
      if (error) throw error;
      counts.readiness_reports = state.readiness_reports.length;
    }

    if (state.deadlines.length > 0) {
      const { error } = await supabase.from('deadlines').upsert(state.deadlines, { onConflict: 'id' });
      if (error) throw error;
      counts.deadlines = state.deadlines.length;
    }

    if (state.alerts.length > 0) {
      const { error } = await supabase.from('alerts').upsert(state.alerts, { onConflict: 'id' });
      if (error) throw error;
      counts.alerts = state.alerts.length;
    }

    if (state.review_queue.length > 0) {
      const { error } = await supabase
        .from('review_queue')
        .upsert(state.review_queue, { onConflict: 'id' });
      if (error) throw error;
      counts.review_queue = state.review_queue.length;
    }

    if (state.audit_log.length > 0) {
      const recentAudit = state.audit_log.slice(0, 100);
      const { error } = await supabase.from('audit_log').upsert(recentAudit, { onConflict: 'id' });
      if (error) throw error;
      counts.audit_log = recentAudit.length;
    }

    if (state.sources.length > 0) {
      const { error } = await supabase
        .from('monitored_sources')
        .upsert(state.sources, { onConflict: 'id' });
      if (error) throw error;
      counts.monitored_sources = state.sources.length;
    }

    return { synced: true, counts };
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
