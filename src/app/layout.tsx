import type { Metadata } from 'next';
import { Space_Grotesk, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AppProvider } from '@/components/providers/AppProvider';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VAYUVERSE AI — Predictive Air Intelligence & Community Response Platform',
  description:
    'Your intelligent companion for understanding air quality, predicting pollution changes, simulating personal exposure, and coordinating community response.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-vayu-midnight font-sans text-vayu-soft antialiased selection:bg-vayu-cyan/30 selection:text-white">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
