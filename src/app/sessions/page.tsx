import PublicLayout from '@/components/public/PublicLayout';
import PublicSessionsExplorer, { type PublicSession } from '@/components/public/PublicSessionsExplorer';

export const dynamic = 'force-dynamic';

async function fetchSessions(): Promise<PublicSession[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${base}/api/public/sessions?limit=100&days=60`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.sessions || [];
  } catch {
    return [];
  }
}

export default async function PublicSessionsPage() {
  const sessions = await fetchSessions();

  return (
    <PublicLayout>
      <PublicSessionsExplorer sessions={sessions} />
    </PublicLayout>
  );
}
