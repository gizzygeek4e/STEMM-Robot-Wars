interface TeamCrestProps {
  shortCode: string;
  accentColor: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TeamCrest({ shortCode, accentColor, size = 'md' }: TeamCrestProps) {
  const dims =
    size === 'sm'
      ? 'w-7 h-7 text-[11px]'
      : size === 'lg'
        ? 'w-14 h-14 text-lg'
        : 'w-10 h-10 text-xs';

  return (
    <div
      className={`${dims} relative shrink-0 rounded-lg bg-[#090B0E] border border-white/15 flex items-center justify-center font-display font-extrabold tracking-wider text-white select-none overflow-hidden`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 w-full h-full opacity-25"
        fill="none"
      >
        <polygon points="20,2 37,11 37,29 20,38 3,29 3,11" stroke={accentColor} strokeWidth="2" />
        <line x1="20" y1="2" x2="20" y2="38" stroke={accentColor} strokeWidth="0.75" />
      </svg>
      <span className="relative z-10" style={{ color: accentColor }}>
        {shortCode}
      </span>
    </div>
  );
}
