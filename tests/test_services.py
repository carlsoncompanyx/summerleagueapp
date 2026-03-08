from pathlib import Path


def test_sql_schema_has_required_tables_and_rls():
    schema = Path('sql/schema.sql').read_text()
    required_tables = [
        'profiles', 'seasons', 'registrations', 'teams', 'team_members', 'players',
        'games', 'game_events', 'wallet', 'wallet_transactions', 'beer_bucks_packages',
        'bets', 'trades', 'chat_messages'
    ]
    for name in required_tables:
        assert f'create table if not exists public.{name}' in schema

    for name in required_tables:
        assert f'alter table public.{name} enable row level security;' in schema


def test_sql_has_admin_only_score_and_stats_controls():
    schema = Path('sql/schema.sql').read_text()
    assert 'create policy games_admin_write' in schema
    assert 'create policy events_admin_write' in schema
    assert 'public.is_admin()' in schema


def test_sql_has_betting_and_wallet_functions():
    schema = Path('sql/schema.sql').read_text()
    assert 'function public.compute_odds' in schema
    assert 'function public.place_bet' in schema
    assert 'function public.settle_bets' in schema
    assert 'function public.credit_wallet' in schema


def test_docs_include_setup_and_env_vars():
    readme = Path('README.md').read_text()
    for key in ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'npm run dev', 'Vercel']:
        assert key in readme
