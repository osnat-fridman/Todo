// Simple line icons (DESIGN.md 2.3).

export function DragHandleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {[5, 10, 15].map((y) => (
        <g key={y} fill="currentColor">
          <circle cx="7.5" cy={y} r="1.5" />
          <circle cx="12.5" cy={y} r="1.5" />
        </g>
      ))}
    </svg>
  );
}
