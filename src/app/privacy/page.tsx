import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';
import { VayuLogo } from '@/components/ui/VayuUI';

export default function PrivacyPage() {
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
            <Shield className="h-5 w-5" />
            <span className="font-mono text-xs uppercase tracking-widest">Privacy &amp; Data Protection</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white">VAYUVERSE AI Privacy Policy</h1>
          <p className="text-xs text-slate-400">Effective Date: November 2026 · Aligned with India DPDP Act &amp; GDPR principles</p>
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-white">1. Coarse Location by Default</h2>
            <p>VAYUVERSE AI stores city-level and rounded ~1 km grid coordinates by default. Citizen incident reports automatically round pinned coordinates to two decimal places (~1.1 km) to protect reporter privacy.</p>
          </section>
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-white">2. Authentication &amp; Account Isolation</h2>
            <p>When you sign in via Google OAuth 2.0, we receive only your verified Google account identifier, name, email address, and profile image URL. Passwords for email accounts are salted and hashed with bcrypt. All profiles, saved scenarios, rooms, and households are strictly scoped to your authenticated user ID.</p>
          </section>
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-white">3. Optional Routine Profiling &amp; Image Moderation</h2>
            <p>Daily schedule preferences are completely optional and may be skipped or toggled off in Settings. Incident photographs strip metadata flags and undergo human moderator review.</p>
          </section>
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold text-white">4. Export, Consent History &amp; Deletion</h2>
            <p>You can download a complete machine-readable JSON export of your account data, inspect timestamped consent records, or permanently delete your account at any time from <strong>My Profile → Account Settings</strong>.</p>
          </section>
        </article>
      </div>
    </div>
  );
}
