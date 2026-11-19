import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { ProvenanceBadge, VayuLogo } from '@/components/ui/VayuUI';

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-vayu-midnight bg-vayu-mesh px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <Link href="/"><VayuLogo /></Link>
          <Link href="/" className="vayu-btn-secondary text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>
        </div>
        <article className="vayu-card mt-8 space-y-8 p-8 text-sm leading-relaxed text-slate-300">
          <div>
            <div className="flex items-center gap-2 text-vayu-cyan">
              <BookOpen className="h-5 w-5" />
              <span className="font-mono text-xs uppercase tracking-widest">Platform Documentation</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold text-white">
              VAYUVERSE AI Architecture, Provenance &amp; Methodology
            </h1>
          </div>

          <section id="provenance" className="space-y-3">
            <h2 className="font-display text-xl font-bold text-white">Canonical Data Classifications</h2>
            <div className="space-y-2.5 rounded-xl border border-white/10 bg-[#071224]/80 p-4">
              <div className="flex flex-wrap items-center gap-3"><ProvenanceBadge type="MEASURED" /><span>Direct reading from an identified monitoring station or calibrated sensor.</span></div>
              <div className="flex flex-wrap items-center gap-3"><ProvenanceBadge type="MODEL FORECAST" /><span>Output of a named atmospheric composition or meteorological forecast model (e.g., Copernicus CAMS via Open-Meteo).</span></div>
              <div className="flex flex-wrap items-center gap-3"><ProvenanceBadge type="ESTIMATED" /><span>Deterministic calculation from disclosed equations (Indian NAQI CPCB sub-indices, Future Me scenario index, route trade-offs).</span></div>
              <div className="flex flex-wrap items-center gap-3"><ProvenanceBadge type="USER REPORTED" /><span>Citizen incident report or manual household reading not independently verified by reference instruments.</span></div>
              <div className="flex flex-wrap items-center gap-3"><ProvenanceBadge type="AI SUMMARY" /><span>Natural-language explanation strictly grounded in retrieved structured records.</span></div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-xl font-bold text-white">Indian National AQI (NAQI) Formula</h2>
            <p>For Indian cities, VAYUVERSE computes piecewise-linear sub-indices across official CPCB concentration bands (Good 0–50, Satisfactory 51–100, Moderate 101–200, Poor 201–300, Very Poor 301–400, Severe 401–500) for PM2.5, PM10, NO2, O3, SO2, and CO, selecting the maximum sub-index as the overall index and reporting the dominant pollutant.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-display text-xl font-bold text-white">Future Me Scenario Exposure Formula</h2>
            <code className="block rounded-xl border border-white/10 bg-[#060E1B] p-4 font-mono text-xs text-vayu-cyan">
              Exposure_Index (µg) = Forecast_PM2.5(t) × Infiltration_Factor(mode) × Mask_Penetration × Ventilation_Rate(activity) × Duration_Hours
            </code>
            <p>All assumptions are displayed beside every comparison and never represent a clinical or medical inhaled dose.</p>
          </section>
        </article>
      </div>
    </div>
  );
}
