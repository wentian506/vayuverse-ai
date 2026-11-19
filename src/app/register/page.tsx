'use client';

import React, { Suspense } from 'react';
import { SplitScreenAuthView } from '@/components/auth/SplitScreenAuthView';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#121B1D]" />}>
      <SplitScreenAuthView initialTab="signup" />
    </Suspense>
  );
}
