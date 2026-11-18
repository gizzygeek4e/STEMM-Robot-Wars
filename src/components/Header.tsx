import { Shield } from 'lucide-react';

export type PublicSection = 'live' | 'schedule' | 'standings' | 'bracket' | 'teams';

interface HeaderProps {
  tournamentName: string;
  mode: 'public' | 'admin';
  activeSection: PublicSection;
  isAuthorizedAdmin: boolean;
  onNavigateSection: (section: PublicSection) => void;
  onToggleMode: (nextMode: 'public' | 'admin') => void;
}

const NAV_ITEMS: Array<{ id: PublicSection; label: string }> = [
  { id: 'live', label: 'Live Arena' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'standings', label: 'Standings' },
  { id: 'bracket', label: 'Bracket' },
  { id: 'teams', label: 'Teams' },
];

export function Header({
  tournamentName,
  mode,
  activeSection,
  isAuthorizedAdmin,
  onNavigateSection,
  onToggleMode,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-[#090B0E]/92 backdrop-blur-md border-b border-white/10">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            onToggleMode('public');
            onNavigateSection('live');
          }}
          className="font-display text-2xl font-extrabold tracking-tight text-white hover:text-[#C8F135] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8F135]"
        >
          {tournamentName || 'RoboPitch'}
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav
          aria-label="Tournament sections"
          className="hidden md:flex items-center gap-7"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = mode === 'public' && activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onToggleMode('public');
                  onNavigateSection(item.id);
                }}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8F135] ${
                  isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute left-0 right-0 -bottom-[1px] h-0.5 bg-[#C8F135]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="shrink-0">
          {mode === 'admin' ? (
            <button
              type="button"
              onClick={() => onToggleMode('public')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-white/20 bg-[#171C26] text-white hover:border-[#C8F135] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8F135]"
            >
              Public View
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onToggleMode('admin')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d6f95c] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8F135]"
            >
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isAuthorizedAdmin ? 'Director Panel' : 'Admin Console'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile section switcher */}
      {mode === 'public' && (
        <div className="md:hidden border-t border-white/10 px-4 py-2 flex items-center gap-4 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigateSection(item.id)}
                className={`text-xs font-medium py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive ? 'text-[#C8F135] border-b border-[#C8F135]' : 'text-slate-400'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
