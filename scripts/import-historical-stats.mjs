#!/usr/bin/env node
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function normalizeName(name = '') {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => row[h] = cols[i] ?? '');
    return row;
  });
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
  const rows = parseCsv(csv);

  const { data: players } = await supabase.from('players').select('id,name');
  const playerByNorm = new Map((players ?? []).map((p) => [normalizeName(p.name), p]));

  const payload = rows.map((row) => {
    const rawName = row.player_name || row.player || row.name || '';
    const normalized = normalizeName(rawName);
    const matched = playerByNorm.get(normalized);
    const goals = Number(row.goals || 0);
    const assists = Number(row.assists || 0);

    return {
      player_id: matched?.id ?? null,
      player_name_raw: rawName,
      normalized_player_name: normalized,
      season_label: String(row.season || row.season_label || ''),
      goals,
      assists,
      source: row.source || 'csv_import',
      imported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('player_historical_season_stats')
    .upsert(payload, { onConflict: 'normalized_player_name,season_label,source' });

  if (error) {
    console.error('Import failed:', error.message);
    process.exit(1);
  }

  const matchedCount = payload.filter((r) => r.player_id).length;
  console.log(`Imported ${payload.length} historical rows (${matchedCount} matched to players).`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
