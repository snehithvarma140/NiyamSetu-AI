import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function isClientSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && anonKey && String(url).startsWith('https://'));
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isClientSupabaseConfigured()) return null;
  if (cachedClient) return cachedClient;

  cachedClient = createClient(
    String(import.meta.env.VITE_SUPABASE_URL).trim(),
    String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim()
  );
  return cachedClient;
}

export function subscribeSupabaseRealtime(onChange: () => void): () => void {
  const client = getSupabaseClient();
  if (!client) {
    return () => undefined;
  }

  const channel: RealtimeChannel = client
    .channel('niyamsetu-live-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rules' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'review_queue' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'impact_reports' }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function signInWithSupabaseGoogle(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client URL and anon key are not configured.');
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}
