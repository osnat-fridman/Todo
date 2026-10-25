// Simple line icons (DESIGN.md 2.3).

export function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

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
