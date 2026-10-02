'use client';

import dynamic from 'next/dynamic';

const FridgeApp = dynamic(() => import('@/components/FridgeApp'), {
  ssr: false,
});

export default function Home() {
  return (
    <FridgeApp />
  );
}
