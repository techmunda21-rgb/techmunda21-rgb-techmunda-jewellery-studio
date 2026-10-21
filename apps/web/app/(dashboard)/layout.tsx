'use client';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { useRequireAuth } from '@/lib/auth';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useRequireAuth();
  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream" role="status" aria-label="Loading">
        <Skeleton className="h-24 w-72" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-cream">
      <Sidebar />
      <div className="lg:pl-64">
        <Topbar />
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
