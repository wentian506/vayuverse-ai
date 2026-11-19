import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { VayuLogo } from '@/components/ui/VayuUI';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-vayu-midnight bg-vayu-mesh px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <Link href="/"><VayuLogo /></Link>
          <Link href="/" className="vayu-btn-secondary text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>
        </div>
        <article className="vayu-card mt-8 space-y-6 p-8 text-sm leading-relaxed text-slate-300">
          <div className="flex items-center gap-2 text-vayu-cyan">
            <FileText className="h-5 w-5" />
            <span className="font-mono text-xs uppercase tracking-widest">Terms of Service</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white">VAYUVERSE AI Terms of Use</h1>
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-white">1. Non-Medical Decision Support</h2>
            <p>VAYUVERSE AI provides environmental intelligence, model forecasts, and deterministic exposure estimates for informational planning only. It is NOT a medical device, does not diagnose or treat any condition, and never guarantees that any location, route, or room is medically safe.</p>
          </section>
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-white">2. Responsible Community Reporting</h2>
            <p>Citizen incident submissions must describe observable environmental conditions (such as visible smoke, road dust, or open waste burning) accurately and respectfully. Users must never defame, harass, or accuse specific individuals, companies, or organisations.</p>
          </section>
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-white">3. Data Attribution &amp; Uncertainty</h2>
            <p>Atmospheric forecasts and observations carry inherent spatial and temporal uncertainties disclosed in our Trust &amp; Sources dashboard. Third-party environmental and geographical feeds remain subject to Open-Meteo (CC BY 4.0), Copernicus CAMS, CPCB, and OpenStreetMap (ODbL) terms.</p>
          </section>
        </article>
      </div>
    </div>
  );
}
