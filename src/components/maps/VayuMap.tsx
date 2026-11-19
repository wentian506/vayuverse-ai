'use client';

import dynamic from 'next/dynamic';
import type { VayuMapProps } from './VayuMapInner';

const VayuMap = dynamic(() => import('./VayuMapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] w-full items-center justify-center rounded-xl border border-white/10 bg-[#071324] text-xs text-slate-400">
      Initialising OpenStreetMap atmospheric layer...
    </div>
  ),
});

export default function DynamicVayuMap(props: VayuMapProps) {
  return <VayuMap {...props} />;
}
