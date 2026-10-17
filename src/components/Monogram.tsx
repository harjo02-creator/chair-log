/** The Aurelle "A" monogram: an A in the display face inside a fine champagne ring. Decorative. */
export function Monogram({ size = 72 }: { size?: number }) {
  return (
    <svg className="monogram" viewBox="0 0 96 96" width={size} height={size} aria-hidden="true">
      <circle cx="48" cy="48" r="45" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="48" cy="48" r="40.5" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.6" />
      <text
        x="48"
        y="63"
        textAnchor="middle"
        fontFamily="var(--f-display)"
        fontSize="44"
        fontWeight="500"
        style={{ fontStretch: '112%' }}
        fill="currentColor"
      >
        A
      </text>
    </svg>
  );
}
