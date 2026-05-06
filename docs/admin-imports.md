# Admin Imports

The in-app CSV importer is the primary workflow. Use the Supabase table editor only as an emergency workaround when the app importer is blocked and the target IDs have been verified.

## Player CSV Headers

Recommended headers:

```csv
Player Name,Team,No.,Position,Email,Grade,Notes
```

Supported name fields include `Player Name`, `Full Name`, or `First Name` plus `Last Name`. Supported jersey fields include `No.`, `#`, `Number`, `Jersey`, and `Jersey Number`.

The importer uses the selected admin working season. Do not add a season column when the UI already has the target season selected. A blank Team imports the player as unassigned in that season.

## Schedule CSV Headers

Recommended headers:

```csv
Game Date,Start Time,Home Team,Away Team,Location,Status
```

`games.scheduled_at` is one required timestamp column in Supabase. The app importer accepts either:

- `Scheduled At`: one combined date/time value.
- `Game Date` or `Date` plus `Start Time` or `Time`: the server combines these into `scheduled_at`.

Date/time examples supported by the app importer:

- `2026-05-16` plus `3:30 PM`
- `5/16/2026` plus `3:30 PM`
- Excel serial date plus Excel serial time

The league timezone assumption for separate Date + Time imports is `America/Chicago`.

## Emergency Supabase Fallback

Use direct Supabase import only when the app importer is unavailable and the import cannot wait. Prefer a dry run in the app first whenever possible.

For direct player imports, verify:

- `season_id` is the correct UUID for the working season.
- `team_id` is either blank/null or a team UUID from the same season.
- `user_id` is blank/null or an existing Supabase auth user UUID.
- `jersey` is blank/null or a whole number.

For direct schedule imports, verify:

- `season_id`, `home_team`, and `away_team` are UUIDs from the same season.
- `scheduled_at` is a valid timestamp with time zone.
- `status` is one of the supported game statuses, currently `SCHEDULED`, `LIVE`, `FINAL`, or `CANCELED`.

Do not replace or delete real season data directly in Supabase after games have stats, DFS entries, slate rows, trades, bets, wallet records, or historical records. Use cancel/correction workflows instead.
