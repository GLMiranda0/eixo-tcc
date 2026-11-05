export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="eixo-lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray="118 40" transform="rotate(-210 32 32)" />
      <path d="M12 34h10l4-10 6 20 5-14 3 4h12" fill="none" stroke="url(#eixo-lg)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="54" cy="12" r="5" fill="url(#eixo-lg)" />
    </svg>
  )
}
