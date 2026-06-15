/** The nirs4all family logo mark: a teal rounded-square with the white
 *  spectral-wave path, shared visually with nirs4all.org / formats / datasets.
 *  The fill uses the brand-teal tokens so it tracks light/dark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="nirs4all" className={className}>
      <defs>
        <linearGradient id="n4a-brandmark-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--brand-teal-d)" />
          <stop offset="1" stopColor="var(--brand-teal)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#n4a-brandmark-grad)" />
      <path
        d="M4 21 Q8.5 8 12 16 T18.5 15 T28 10"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
