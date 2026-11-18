import { Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RobotRole } from '../types/tournament';

export interface BulkTeamDraft {
  name: string;
  shortCode?: string;
  division: string;
  robots: Array<{
    unitNumber: string;
    designation: string;
    role: RobotRole;
  }>;
}

interface GridRow {
  key: string;
  name: string;
  shortCode: string;
  division: string;
  robot1Name: string;
  robot2Name: string;
}

interface BulkTeamImporterProps {
  busy: boolean;
  existingTeamCount: number;
  onImport: (teams: BulkTeamDraft[]) => Promise<void>;
  onClose?: () => void;
}

function createInitial12Rows(): GridRow[] {
  const groups = [
    'Group A',
    'Group A',
    'Group A',
    'Group A',
    'Group B',
    'Group B',
    'Group B',
    'Group B',
    'Group C',
    'Group C',
    'Group C',
    'Group C',
  ];
  return groups.map((group, idx) => ({
    key: `row-${Date.now().toString(36)}-${idx}`,
    name: '',
    shortCode: '',
    division: group,
    robot1Name: '',
    robot2Name: '',
  }));
}

function parseTextRows(raw: string): BulkTeamDraft[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const drafts: BulkTeamDraft[] = [];

  for (const line of lines) {
    const separator = line.includes('\t') ? '\t' : ',';
    const parts = line.split(separator).map((p) => p.trim());
    const name = parts[0] ?? '';
    if (name.length < 2) continue;

    const p1 = parts[1] ?? '';
    const p2 = parts[2] ?? '';
    const p3 = parts[3] ?? '';
    const p4 = parts[4] ?? '';

    // Support both "Name, Group A, Robot1, Robot2" and "Name, CODE, Group A, Robot1, Robot2"
    const isP1Group = /^group\s+[a-z0-9]+$/i.test(p1);
    const shortCode = isP1Group ? '' : p1;
    const division = isP1Group ? p1 : p2 || 'Group A';
    const robot1Name = isP1Group ? p2 : p3;
    const robot2Name = isP1Group ? p3 : p4;

    const robots: BulkTeamDraft['robots'] = [];
    if (robot1Name) {
      robots.push({ unitNumber: '07', designation: robot1Name, role: 'Striker' });
    }
    if (robot2Name) {
      robots.push({ unitNumber: '01', designation: robot2Name, role: 'Keeper' });
    }

    drafts.push({
      name,
      shortCode: shortCode || undefined,
      division: /^group\s+[abc]$/i.test(division)
        ? `Group ${division.slice(-1).toUpperCase()}`
        : division,
      robots,
    });
  }

  return drafts;
}

export function BulkTeamImporter({
  busy,
  existingTeamCount,
  onImport,
  onClose,
}: BulkTeamImporterProps) {
  const [mode, setMode] = useState<'grid' | 'paste'>('grid');
  const [rows, setRows] = useState<GridRow[]>(() => createInitial12Rows());
  const [pasteText, setPasteText] = useState('');

  const gridDrafts = useMemo<BulkTeamDraft[]>(() => {
    return rows
      .filter((r) => r.name.trim().length >= 2)
      .map((r) => {
        const robots: BulkTeamDraft['robots'] = [];
        if (r.robot1Name.trim()) {
          robots.push({
            unitNumber: '07',
            designation: r.robot1Name.trim(),
            role: 'Striker',
          });
        }
        if (r.robot2Name.trim()) {
          robots.push({
            unitNumber: '01',
            designation: r.robot2Name.trim(),
            role: 'Keeper',
          });
        }
        return {
          name: r.name.trim(),
          shortCode: r.shortCode.trim() || undefined,
          division: r.division || 'Group A',
          robots,
        };
      });
  }, [rows]);

  const pasteDrafts = useMemo(() => parseTextRows(pasteText), [pasteText]);
  const activeDrafts = mode === 'grid' ? gridDrafts : pasteDrafts;

  function updateRow(key: string, patch: Partial<GridRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        key: `row-${Date.now().toString(36)}-${prev.length}`,
        name: '',
        shortCode: '',
        division: 'Group A',
        robot1Name: '',
        robot2Name: '',
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function handleSubmit() {
    if (activeDrafts.length === 0) return;
    await onImport(activeDrafts);
    if (mode === 'grid') {
      setRows(createInitial12Rows());
    } else {
      setPasteText('');
    }
  }

  return (
    <div className="bg-[#11151C] border border-white/10 rounded-xl p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <h3 className="font-display text-2xl font-bold text-white">
            Bulk Add Teams &amp; Robot Rosters
          </h3>
          <p className="text-xs text-slate-400">
            Enter multiple teams into Group A, Group B, and Group C at once (with up to 2 robots each). Blank codes auto-generate from team names.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090B0E] border border-white/10">
            <button
              type="button"
              onClick={() => setMode('grid')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'grid'
                  ? 'bg-[#C8F135] text-[#090B0E]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              12-Team Grid
            </button>
            <button
              type="button"
              onClick={() => setMode('paste')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'paste'
                  ? 'bg-[#C8F135] text-[#090B0E]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Paste CSV / Sheet
            </button>
          </div>
          {existingTeamCount > 0 && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/15 text-slate-300 hover:text-white cursor-pointer"
            >
              Back to Editor
            </button>
          )}
        </div>
      </div>

      {mode === 'grid' ? (
        <div className="space-y-3">
          <div className="overflow-x-auto border border-white/10 rounded-lg">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-white/10 bg-[#090B0E] text-[11px] font-medium text-slate-400">
                  <th className="py-2.5 pl-3 pr-2 w-8">#</th>
                  <th className="py-2.5 px-2">Team Name *</th>
                  <th className="py-2.5 px-2 w-20">Code</th>
                  <th className="py-2.5 px-2 w-28">Group</th>
                  <th className="py-2.5 px-2">Robot 1</th>
                  <th className="py-2.5 px-2">Robot 2</th>
                  <th className="py-2.5 pl-1 pr-2 w-9" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#090B0E]/60">
                {rows.map((row, idx) => (
                  <tr key={row.key}>
                    <td className="py-2 pl-3 pr-2 font-mono text-xs text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-1.5">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(row.key, { name: e.target.value })}
                        placeholder={`Team ${idx + 1} Name`}
                        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[#11151C] border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#C8F135]"
                      />
                    </td>
                    <td className="py-2 px-1.5">
                      <input
                        type="text"
                        maxLength={6}
                        value={row.shortCode}
                        onChange={(e) =>
                          updateRow(row.key, { shortCode: e.target.value.toUpperCase() })
                        }
                        placeholder="AUTO"
                        className="w-full px-2 py-1.5 text-xs rounded-md bg-[#11151C] border border-white/15 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-[#C8F135]"
                      />
                    </td>
                    <td className="py-2 px-1.5">
                      <select
                        aria-label={`Row ${idx + 1} group`}
                        value={row.division}
                        onChange={(e) => updateRow(row.key, { division: e.target.value })}
                        className="w-full px-2 py-1.5 text-xs rounded-md bg-[#11151C] border border-white/15 text-white focus:outline-none focus:border-[#C8F135]"
                      >
                        <option value="Group A">Group A</option>
                        <option value="Group B">Group B</option>
                        <option value="Group C">Group C</option>
                      </select>
                    </td>
                    <td className="py-2 px-1.5">
                      <input
                        type="text"
                        value={row.robot1Name}
                        onChange={(e) => updateRow(row.key, { robot1Name: e.target.value })}
                        placeholder="Bot A Name"
                        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[#11151C] border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#C8F135]"
                      />
                    </td>
                    <td className="py-2 px-1.5">
                      <input
                        type="text"
                        value={row.robot2Name}
                        onChange={(e) => updateRow(row.key, { robot2Name: e.target.value })}
                        placeholder="Bot B Name"
                        className="w-full px-2.5 py-1.5 text-xs rounded-md bg-[#11151C] border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#C8F135]"
                      />
                    </td>
                    <td className="py-2 pl-1 pr-2">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        aria-label={`Remove row ${idx + 1}`}
                        className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/15 text-slate-300 hover:text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Row</span>
            </button>

            <button
              type="button"
              disabled={busy || activeDrafts.length === 0}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors disabled:opacity-45 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                Import {activeDrafts.length} Team{activeDrafts.length === 1 ? '' : 's'}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">
            Paste one team per line from a spreadsheet (tab-separated) or CSV:
            <span className="block font-mono text-[11px] text-slate-300 mt-1">
              Team Name, Code, Group A, Robot 1, Robot 2
            </span>
          </div>
          <textarea
            rows={10}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`Gisborne Kinetic, GIS, Group A, Kahu Mk-IV, Aegis Sentinel\nPacific Bots, PAC, Group A, Striker X, Wall Keeper\nTairawhiti Tech, TAI, Group B, Bolt 1, Shield 2`}
            className="w-full p-3 text-xs font-mono rounded-lg bg-[#090B0E] border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#C8F135]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-xs text-slate-400">
              {pasteDrafts.length} team{pasteDrafts.length === 1 ? '' : 's'} detected
            </span>
            <button
              type="button"
              disabled={busy || pasteDrafts.length === 0}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg bg-[#C8F135] text-[#090B0E] hover:bg-[#d7f863] transition-colors disabled:opacity-45 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                Import {pasteDrafts.length} Team{pasteDrafts.length === 1 ? '' : 's'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
