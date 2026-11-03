export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="var(--fs-write)"
        strokeWidth="4"
        strokeDasharray="54 28"
        strokeLinecap="round"
        transform="rotate(-90 16 16)"
      />
      <circle cx="16" cy="16" r="4" fill="var(--fs-grid)" />
    </svg>
  );
}
