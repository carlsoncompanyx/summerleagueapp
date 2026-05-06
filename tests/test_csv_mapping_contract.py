from pathlib import Path


def test_csv_mapping_accepts_common_player_headers():
    mapping = Path('lib/csv/mapping.ts').read_text()
    assert "'player name'" in mapping
    assert "'full name'" in mapping
    assert "'first name'" in mapping
    assert "'last name'" in mapping
    assert "'no.'" in mapping
    assert "'#'" in mapping
    assert "'jersey number'" in mapping
    assert "key: 'jersey'" in mapping


def test_csv_mapping_accepts_common_schedule_headers():
    mapping = Path('lib/csv/mapping.ts').read_text()
    assert "'game date'" in mapping
    assert "'start time'" in mapping
    assert "'home team'" in mapping
    assert "'away team'" in mapping
    assert "key: 'home_team'" in mapping
    assert "key: 'away_team'" in mapping


def test_admin_import_payload_uses_target_season_before_row_season():
    route = Path('app/api/admin/dashboard/route.ts').read_text()
    assert "payload.target_season_id" in route
    assert "targetSeasonId" in route
    assert "season_id: targetSeasonId" in route
    assert "CSV validation failed." in route


def test_import_modal_sends_canonical_mapped_rows_and_keeps_modal_open():
    modal = Path('components/admin/CsvImportModal.tsx').read_text()
    shell = Path('components/admin/AdminDashboardShell.tsx').read_text()
    assert 'applyCsvFieldMap(rawRows, mapping, kind)' in modal
    assert 'onSubmit(kind, mappedRows, targetSeason, dryRun, mode)' in modal
    assert 'target_season_id: target' in shell
    assert 'closeOnSuccess: false' in shell
