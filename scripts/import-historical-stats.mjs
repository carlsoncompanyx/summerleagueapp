#!/usr/bin/env node
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseCsvAsObjects } from './csv-utils.mjs';

function normalizeName(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function run() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/import-historical-stats.mjs <path-to-csv>');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const csv = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsvAsObjects(csv);

  const { data: players } = await supabase.from('players').select('id,name');
  const playerByNorm = new Map((players ?? []).map((p) => [normalizeName(p.name), p]));

  const rowErrors = [];

  const payload = rows.map((row, index) => {
    const rawName = row.player_name || row.player || row.name || '';
    const seasonLabel = String(row.season || row.season_label || '').trim();
    if (!rawName || !seasonLabel) {
      rowErrors.push(`Row ${index + 2}: player_name and season are required.`);
      return null;
    }
    const normalized = normalizeName(rawName);
    const matched = playerByNorm.get(normalized);
    const goals = Number(row.goals || 0);
    const assists = Number(row.assists || 0);

    return {
      player_id: matched?.id ?? null,
      player_name_raw: rawName,
      normalized_player_name: normalized,
      season_label: seasonLabel,
      goals,
      assists,
      source: row.source || 'csv_import',
      imported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  const validPayload = payload.filter(Boolean);

  if (rowErrors.length) {
    console.error('Validation errors:');
    rowErrors.slice(0, 25).forEach((e) => console.error(`- ${e}`));
    if (rowErrors.length > 25) console.error(`...and ${rowErrors.length - 25} more.`);
    process.exit(1);
  }

  const { error } = await supabase
    .from('player_historical_season_stats')
    .upsert(validPayload, { onConflict: 'normalized_player_name,season_label,source' });

  if (error) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }

  const matchedCount = validPayload.filter((r) => r.player_id).length;
  console.log(`Imported ${validPayload.length} historical rows (${matchedCount} matched to players).`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
