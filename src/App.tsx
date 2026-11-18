import { onAuthStateChanged, type User } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { BracketSection } from './components/BracketSection';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header, type PublicSection } from './components/Header';
import { LiveArenaSection } from './components/LiveArenaSection';
import { ScheduleSection } from './components/ScheduleSection';
import { StandingsSection } from './components/StandingsSection';
import { TeamsSection } from './components/TeamsSection';
import { AUTHORIZED_ADMIN_EMAIL, auth } from './firebase';
import { useTournamentSocket } from './hooks/useTournamentSocket';

export default function App() {
  const { state, setState, untouchedBoot, socketStatus, connectedClients, error, refresh } =
    useTournamentSocket();

  const [mode, setMode] = useState<'public' | 'admin'>('public');
  const [activeSection, setActiveSection] = useState<PublicSection>('live');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const isAuthorizedAdmin = Boolean(
    user &&
      user.emailVerified &&
      user.email?.toLowerCase() === AUTHORIZED_ADMIN_EMAIL.toLowerCase(),
  );

  const handleNavigateSection = useCallback((section: PublicSection) => {
    setActiveSection(section);
    window.setTimeout(() => {
      const el = document.getElementById(section);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 30);
  }, []);

  const handleInspectMatch = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
    setActiveSection('live');
    const el = document.getElementById('live');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#090B0E] text-slate-100 flex flex-col">
        <Header
          tournamentName={state?.meta.name ?? 'RoboPitch Championship'}
          mode={mode}
          activeSection={activeSection}
          isAuthorizedAdmin={isAuthorizedAdmin}
          onNavigateSection={handleNavigateSection}
          onToggleMode={setMode}
        />

        <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-14">
          {!state ? (
            <div className="bg-[#11151C] border border-white/10 rounded-2xl p-10 space-y-4">
              {error ? (
                <>
                  <h2 className="font-display text-2xl font-bold text-white">
                    Unable to Connect to Tournament Server
                  </h2>
                  <p className="text-sm text-rose-300">{error}</p>
                  <button
                    type="button"
                    onClick={refresh}
                    className="px-4 py-2 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] cursor-pointer"
                  >
                    Retry Connection
                  </button>
                </>
              ) : (
                <div className="space-y-4 animate-pulse">
                  <div className="h-7 w-64 bg-white/10 rounded" />
                  <div className="h-40 w-full bg-white/5 rounded-xl" />
                </div>
              )}
            </div>
          ) : mode === 'admin' ? (
            <AdminDashboard
              user={user}
              authReady={authReady}
              state={state}
              untouchedBoot={untouchedBoot}
              onStateUpdated={setState}
              onBackToPublic={() => setMode('public')}
            />
          ) : (
            <>
              <LiveArenaSection
                meta={state.meta}
                matches={state.matches}
                teams={state.teams}
                socketStatus={socketStatus}
                connectedClients={connectedClients}
                selectedMatchId={selectedMatchId}
                onSelectMatch={setSelectedMatchId}
              />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 items-start">
                <div className="xl:col-span-6">
                  <StandingsSection teams={state.teams} matches={state.matches} />
                </div>
                <div className="xl:col-span-6">
                  <ScheduleSection
                    matches={state.matches}
                    teams={state.teams}
                    onInspectMatch={handleInspectMatch}
                  />
                </div>
              </div>

              <BracketSection
                matches={state.matches}
                teams={state.teams}
                onInspectMatch={handleInspectMatch}
              />

              <TeamsSection teams={state.teams} />
            </>
          )}
        </main>

        <footer className="border-t border-white/10 py-6 mt-12">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <span>{state?.meta.name ?? 'RoboPitch Championship'}</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setMode('public');
                  handleNavigateSection('standings');
                }}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Standings
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('public');
                  handleNavigateSection('bracket');
                }}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Bracket
              </button>
              <button
                type="button"
                onClick={() => setMode('admin')}
                className="hover:text-slate-300 transition-colors cursor-pointer"
              >
                Admin Console
              </button>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
