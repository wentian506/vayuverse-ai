import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SUPPORTED_CITY_NAMES = [
  'Ludhiana',
  'New Delhi',
  'Mumbai',
  'Bengaluru',
  'Hyderabad',
  'Chennai',
  'Kolkata',
  'Pune',
  'Ahmedabad',
  'Chandigarh',
  'Amritsar',
  'Jalandhar',
  'Patiala',
  'Jaipur',
  'Lucknow',
  'Noida',
  'Gurugram',
  'Shimla',
  'Dehradun',
  'Srinagar',
  'Agra',
  'Varanasi',
  'Kanpur',
  'Surat',
  'Nagpur',
  'Indore',
  'Bhopal',
  'Raipur',
  'Patna',
  'Ranchi',
  'Bhubaneswar',
  'Guwahati',
  'Kochi',
  'Coimbatore',
  'Visakhapatnam',
  'Panaji',
];

export function getAqiStyle(aqi: number, standard: 'IN' | 'US' = 'IN') {
  if (standard === 'US') {
    if (aqi <= 50)
      return { color: '#22C55E', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-400/35', label: 'Good', heroGrad: 'from-[#16793D] via-[#229A4B] to-[#1A6B37]' };
    if (aqi <= 100)
      return { color: '#EAB308', bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-400/35', label: 'Moderate', heroGrad: 'from-[#6B5312] via-[#8F6D15] to-[#523F0E]' };
    if (aqi <= 150)
      return { color: '#F97316', bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-400/35', label: 'Poor', heroGrad: 'from-[#7A3512] via-[#9E4618] to-[#5E280E]' };
    if (aqi <= 200)
      return { color: '#EC487F', bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-400/40', label: 'Unhealthy', heroGrad: 'from-[#4E2336] via-[#8A3B58] to-[#632A40]' };
    if (aqi <= 300)
      return { color: '#9333EA', bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-400/40', label: 'Severe', heroGrad: 'from-[#3F1D5E] via-[#6B2D99] to-[#4A206E]' };
    return { color: '#DC2626', bg: 'bg-red-900/35', text: 'text-red-200', border: 'border-red-500/50', label: 'Hazardous', heroGrad: 'from-[#5A141E] via-[#8C1D2C] to-[#4A1018]' };
  }
  if (aqi <= 50)
    return { color: '#22C55E', bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-400/30', label: 'Good', heroGrad: 'from-[#16793D] via-[#229A4B] to-[#1A6B37]' };
  if (aqi <= 100)
    return { color: '#84CC16', bg: 'bg-lime-500/15', text: 'text-lime-300', border: 'border-lime-400/30', label: 'Satisfactory', heroGrad: 'from-[#2A5E24] via-[#3F7E2B] to-[#234D1E]' };
  if (aqi <= 200)
    return { color: '#EAB308', bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-400/30', label: 'Moderate', heroGrad: 'from-[#594414] via-[#826119] to-[#4A3810]' };
  if (aqi <= 300)
    return { color: '#F97316', bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-400/30', label: 'Poor', heroGrad: 'from-[#6B2D16] via-[#9C4221] to-[#572312]' };
  if (aqi <= 400)
    return { color: '#EC487F', bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-400/35', label: 'Very Poor', heroGrad: 'from-[#542038] via-[#8F3558] to-[#632541]' };
  return { color: '#A855F7', bg: 'bg-purple-900/35', text: 'text-purple-200', border: 'border-purple-500/50', label: 'Severe', heroGrad: 'from-[#42185E] via-[#6E2699] to-[#3B1554]' };
}

/** Deterministic US EPA AQI calculation from PM2.5 (µg/m³) & PM10 (µg/m³) when hourly us_aqi is not precomputed */
export function computeUsAqi(pm25?: number | null, pm10?: number | null): number {
  const lin = (c: number, bps: [number, number, number, number][]) => {
    if (c < 0) return 0;
    for (const [cl, ch, il, ih] of bps) {
      if (c <= ch) return Math.round(((ih - il) / (ch - cl)) * (c - cl) + il);
    }
    return 500;
  };
  const s25 =
    pm25 != null
      ? lin(pm25, [
          [0, 12.0, 0, 50],
          [12.0, 35.4, 51, 100],
          [35.4, 55.4, 101, 150],
          [55.4, 150.4, 151, 200],
          [150.4, 250.4, 201, 300],
          [250.4, 500.4, 301, 500],
        ])
      : 0;
  const s10 =
    pm10 != null
      ? lin(pm10, [
          [0, 54, 0, 50],
          [54, 154, 51, 100],
          [154, 254, 101, 150],
          [254, 354, 151, 200],
          [354, 424, 201, 300],
          [424, 604, 301, 500],
        ])
      : 0;
  return Math.max(s25, s10);
}

export function formatIstTime(iso?: string | null): string {
  if (!iso) return '—';
  if (iso.includes('T') && iso.length === 16) {
    const [datePart, timePart] = iso.split('T');
    return `${timePart} IST · ${datePart}`;
  }
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatShortHour(iso?: string | null): string {
  if (!iso) return '—';
  if (iso.includes('T')) {
    return iso.split('T')[1]?.slice(0, 5) || iso;
  }
  return iso;
}

export function downloadTextFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
