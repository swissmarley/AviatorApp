export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="cg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#f5b400" /></linearGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill="#111a2e" stroke="url(#cg)" strokeWidth="2" />
        <path d="M8 34 C 16 30, 22 22, 30 16" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" fill="none" strokeDasharray="1 4" />
        <path d="M30 16 l8 -6 l-2 8 l-4 2 l-1 5 l-2 1 l0 -5 l-4 1 l-1 -2 l4 -2 z" fill="#f5b400" />
      </svg>
      <span className="font-semibold tracking-tight text-lg leading-none">Contrail</span>
    </span>
  );
}
