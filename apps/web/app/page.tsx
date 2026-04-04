'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBootstrapStatus } from '../lib/api';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const status = await getBootstrapStatus();
      if (status.setup_required) {
        router.replace('/setup');
        return;
      }
      const token = localStorage.getItem('submify_access_token');
      if (!token) {
        router.replace('/login');
        return;
      }
      router.replace('/dashboard');
    })();
  }, [router]);

  return <div className="p-8">Loading Submify...</div>;
}
