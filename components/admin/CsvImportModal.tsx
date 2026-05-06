'use client';

import { useEffect, useMemo, useState } from 'react';
import { fromZonedTime } from 'date-fns-tz';
import { applyCsvFieldMap, csvMappingHasRequiredFields, detectCsvFieldMap, getCsvFieldDefinitions, type CsvFieldMap, type CsvImportKind } from '../../lib/csv/mapping';
import { parseCsv } from '../../lib/csv/parse';

type CsvImportModalProps = {
  kind: CsvImportKind;
  seasons: any[];
  teams?: any[];
  targetSeason: string;
  setTargetSeason: (seasonId: string) => void;
  onSubmit: (
    kind: CsvImportKind,
    rows: Record<string, string>[],
    targetSeasonId: string,
    dryRun: boolean,
    mode: string,
    context: { mappedFields: CsvFieldMap; mappedFieldList: string },
  ) => void;
  lastResult: any;
  pending: boolean;
};

const LEAGUE_TIME_ZONE = 'America/Chicago';

function resultCounts(result: any) {
  return result?.data?.counts ?? result?.counts ?? null;
}

function rowErrorText(error: unknown) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const row = error as Record<string, unknown>;
    return `Row ${String(row.rowNumber ?? row.row ?? '?')}, field ${String(row.field ?? '?')}, value "${String(row.value ?? '')}": ${String(row.message ?? 'Invalid value')}${row.fix ? ` Possible fix: ${String(row.fix)}` : ''}`;
  }
  return String(error);
}

function parseExcelSerialPreview(value: string) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 1) return null;
  return serial;
}

function excelSerialPreviewDate(serial: number) {
  const wholeDays = Math.floor(serial);
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + wholeDays * 86400000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function excelSerialPreviewTime(serial: number) {
  const fraction = serial - Math.floor(serial);
  const totalSeconds = Math.round(fraction * 24 * 60 * 60);
  return {
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function previewLeagueDateTimeToIso(date: { year: number; month: number; day: number }, time: { hours: number; minutes: number; seconds?: number }) {
  const local = `${date.year}-${pad2(date.month)}-${pad2(date.day)}T${pad2(time.hours)}:${pad2(time.minutes)}:${pad2(time.seconds ?? 0)}`;
  return fromZonedTime(local, LEAGUE_TIME_ZONE).toISOString();
}

function previewTimePart(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const serial = Number(trimmed);
  if (Number.isFinite(serial) && serial >= 0 && serial < 1) {
    return excelSerialPreviewTime(serial);
  }
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const meridian = match[4]?.toLowerCase();
  if (meridian === 'pm' && hours < 12) hours += 12;
  if (meridian === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return { hours, minutes, seconds };
}

function previewDatePart(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const excel = parseExcelSerialPreview(trimmed);
  if (excel) return excelSerialPreviewDate(excel);
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return { year, month: Number(match[1]), day: Number(match[2]) };
  }
  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return { year: direct.getUTCFullYear(), month: direct.getUTCMonth() + 1, day: direct.getUTCDate() };
  return null;
}

function scheduledAtPreview(row: Record<string, string | undefined>) {
  const direct = String(row.scheduled_at ?? '').trim();
  if (direct) {
    const excel = parseExcelSerialPreview(direct);
    if (excel && !Number.isInteger(Number(direct))) return previewLeagueDateTimeToIso(excelSerialPreviewDate(excel), excelSerialPreviewTime(excel));
    const parsed = new Date(direct);
    if (!Number.isNaN(parsed.getTime()) && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(direct) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(direct)) {
      return parsed.toISOString();
    }
    return 'Needs a date and time';
  }
  const date = previewDatePart(String(row.date ?? ''));
  const time = previewTimePart(String(row.time ?? ''));
  if (!date && !time) return 'Map Scheduled at, or Date plus Time';
  if (!date) return 'Date could not be parsed';
  if (!time) return 'Time could not be parsed';
  return previewLeagueDateTimeToIso(date, time);
}

export default function CsvImportModal({
  kind,
  seasons,
  teams = [],
  targetSeason,
  setTargetSeason,
  onSubmit,
  lastResult,
  pending,
}: CsvImportModalProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<CsvFieldMap>({});
  const [mode, setMode] = useState(kind === 'players' ? 'append' : 'append');
  const [replaceConfirmation, setReplaceConfirmation] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setMode('append');
    setReplaceConfirmation('');
    setLocalError('');
  }, [kind]);

  const fields = useMemo(() => getCsvFieldDefinitions(kind), [kind]);
  const mappedRows = useMemo(() => applyCsvFieldMap(rawRows, mapping, kind), [rawRows, mapping, kind]);
  const hasRequired = useMemo(() => csvMappingHasRequiredFields(mapping, kind), [mapping, kind]);
  const previewFields = useMemo(() => fields.filter((field) => mappedRows.some((row) => row[field.key])), [fields, mappedRows]);
  const rowErrors = lastResult?.rowErrors ?? lastResult?.data?.rowErrors ?? [];
  const counts = resultCounts(lastResult);
  const serverDetails = lastResult?.details ?? lastResult?.data?.details ?? null;
  const serverMappedRows = lastResult?.mappedRows ?? lastResult?.data?.mappedRows ?? [];
  const warnings = lastResult?.warnings ?? lastResult?.data?.warnings ?? [];
  const title = kind === 'players' ? 'Player Import' : 'Schedule Import';
  const targetSeasonName = seasons.find((season: any) => season.id === targetSeason)?.name ?? 'None';
  const mappedFieldList = fields
    .filter((field) => mapping[field.key])
    .map((field) => `${field.label}: ${mapping[field.key]}`)
    .join(', ');
  const localAvailableTeams = teams.filter((team: any) => team.season_id === targetSeason).map((team: any) => team.name);
  const importDiagnostics = lastResult?.data?.importDiagnostics ?? lastResult?.details?.importDiagnostics ?? lastResult?.importDiagnostics ?? null;
  const serverMappedFields = lastResult?.mappedFields ?? lastResult?.data?.mappedFields ?? serverDetails?.mappedFields ?? null;

  async function loadFile(file: File) {
    setLocalError('');
    const parsed = parseCsv(await file.text());
    setHeaders(parsed.headers);
    const nextRows = parsed.rows.map((row) =>
      Object.fromEntries(parsed.headers.map((header, index) => [header, row[index] ?? ''])),
    );
    setRawRows(nextRows);
    setMapping(detectCsvFieldMap(parsed.headers, kind));
  }

  function submit(dryRun: boolean) {
    setLocalError('');
    if (!targetSeason) {
      setLocalError('Choose a target season before importing.');
      return;
    }
    if (!rawRows.length) {
      setLocalError('Choose a CSV file before importing.');
      return;
    }
    if (!hasRequired) {
      setLocalError(kind === 'players'
        ? 'Map Player name, or map both First name and Last name.'
        : 'Map Home team, Away team, and either Scheduled at or Date plus Time.');
      return;
    }
    if (!dryRun && kind === 'players' && mode === 'replace_all' && replaceConfirmation !== 'REPLACE PLAYERS') {
      setLocalError('Type REPLACE PLAYERS to confirm replacing all players in the target season.');
      return;
    }
    onSubmit(kind, mappedRows, targetSeason, dryRun, mode, { mappedFields: mapping, mappedFieldList });
  }

  return (
    <div>
      <h3>{title}</h3>
      <div className="form-grid">
        <div className="form-field">
          <label>Target Season</label>
          <select value={targetSeason} onChange={(event) => setTargetSeason(event.target.value)}>
            <option value="">Select season</option>
            {seasons.map((season: any) => <option key={season.id} value={season.id}>{season.name}</option>)}
          </select>
        </div>

        <div className="form-field">
          <label>{kind === 'players' ? 'Player import mode' : 'Schedule import mode'}</label>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            {kind === 'players' ? (
              <>
                <option value="append">Append only</option>
                <option value="upsert">Upsert/update existing</option>
                <option value="replace_all">Replace all players in target season</option>
              </>
            ) : (
              <>
                <option value="append">Append</option>
                <option value="replace_non_final">Replace non-final games</option>
                <option value="cancel_non_final">Cancel non-final games</option>
              </>
            )}
          </select>
        </div>

        {kind === 'players' && mode === 'replace_all' && (
          <div className="form-field">
            <label>Replace confirmation</label>
            <input value={replaceConfirmation} onChange={(event) => setReplaceConfirmation(event.target.value)} placeholder="REPLACE PLAYERS" />
          </div>
        )}

        <div className="form-field">
          <label>CSV File</label>
          <input type="file" accept=".csv,text/csv" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadFile(file);
          }} />
        </div>
      </div>

      <p className="muted">Target season: {targetSeasonName} ({targetSeason || 'no season selected'})</p>
      <p className="muted">Detected headers: {headers.length ? headers.join(', ') : 'None'}</p>
      <p className="muted">Mapped fields: {mappedFieldList || 'None yet'}</p>
      <p className="muted">Available teams for target season: {localAvailableTeams.length ? localAvailableTeams.join(', ') : 'None found'}</p>

      <h4>Field Mapping</h4>
      <div className="form-grid">
        {fields.map((field) => (
          <div className="form-field" key={field.key}>
            <label>{field.label}</label>
            <select value={mapping[field.key] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}>
              <option value="">Not mapped</option>
              {headers.map((header) => <option key={`${field.key}-${header}`} value={header}>{header}</option>)}
            </select>
          </div>
        ))}
      </div>

      {!hasRequired && headers.length > 0 && (
        <p>
          {kind === 'players'
            ? 'Required mapping: Player name, or First name plus Last name.'
            : 'Required mapping: Home team, Away team, and Scheduled at or Date plus Time.'}
        </p>
      )}

      <h4>Canonical Preview</h4>
      <div className="responsive-table">
        <table className="table">
          <thead>
            <tr>
              <th>Row</th>
              {kind === 'games' && <th>Scheduled At Preview</th>}
              {(previewFields.length ? previewFields : fields.slice(0, 5)).map((field) => <th key={field.key}>{field.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {mappedRows.slice(0, 10).map((row) => (
              <tr key={row._rowNumber}>
                <td>{row._rowNumber}</td>
                {kind === 'games' && <td>{scheduledAtPreview(row)}</td>}
                {(previewFields.length ? previewFields : fields.slice(0, 5)).map((field) => <td key={field.key}>{row[field.key] || '-'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {localError && <p>{localError}</p>}
      {lastResult?.error && <p>{lastResult.error}</p>}
      {importDiagnostics && (
        <p className="muted">
          Server diagnostics: season {importDiagnostics.targetSeasonName ?? 'unknown'} ({importDiagnostics.targetSeasonId ?? 'none'}), mode {importDiagnostics.mode ?? mode}, available teams {(importDiagnostics.availableTeams ?? []).join(', ') || 'none'}.
        </p>
      )}
      {serverDetails && (
        <div className="list-card compact">
          <p><strong>Server error detail</strong></p>
          <p className="muted">Action: {serverDetails.action ?? 'unknown'} - Target season: {(serverDetails.targetSeasonId ?? targetSeason) || 'none'}</p>
          <p className="muted">Message: {serverDetails.message ?? 'none'}</p>
          <p className="muted">Supabase code: {serverDetails.code ?? 'none'} - Classification: {serverDetails.classification ?? 'none'}</p>
          <p className="muted">Hint: {serverDetails.hint ?? 'none'}</p>
          <p className="muted">Details: {serverDetails.details ?? 'none'}</p>
          <p className="muted">Mapped fields: {(serverDetails.mappedFieldList ?? mappedFieldList) || 'none'}</p>
        </div>
      )}
      {serverMappedFields && <p className="muted">Server received field mapping: {Object.entries(serverMappedFields).map(([field, header]) => `${field}=${header}`).join(', ')}</p>}
      {warnings.length ? (
        <ul>
          {warnings.slice(0, 20).map((warning: string, index: number) => <li key={`${warning}-${index}`}>{warning}</li>)}
        </ul>
      ) : null}
      {rowErrors.length ? (
        <ul>
          {rowErrors.slice(0, 30).map((error: unknown, index: number) => <li key={`${rowErrorText(error)}-${index}`}>{rowErrorText(error)}</li>)}
        </ul>
      ) : null}
      {counts && <p>Inserted {counts.inserted} - Updated {counts.updated} - Skipped {counts.skipped} - Errors {counts.errors}</p>}
      {serverMappedRows.length ? (
        <>
          <h4>Server Dry Run Preview</h4>
          <div className="responsive-table">
            <table className="table">
              <thead><tr><th>Row</th><th>Name / Matchup</th><th>Scheduled At</th><th>Team</th></tr></thead>
              <tbody>
                {serverMappedRows.slice(0, 10).map((row: any, index: number) => (
                  <tr key={`${row.sourceRow ?? index}-${row.id ?? row.name ?? row.scheduled_at}`}>
                    <td>{row.sourceRow ?? index + 1}</td>
                    <td>{row.name ?? `${row.away_team ?? 'Away'} @ ${row.home_team ?? 'Home'}`}</td>
                    <td>{row.scheduled_at ?? '-'}</td>
                    <td>{row.team_id ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="button-row">
        <button type="button" disabled={pending} onClick={() => submit(true)}>{pending ? 'Working...' : 'Dry Run'}</button>
        <button type="button" disabled={pending} onClick={() => submit(false)}>{pending ? 'Working...' : 'Import'}</button>
      </div>
    </div>
  );
}
