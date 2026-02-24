from pathlib import Path


def test_nextjs_app_shell_exists():
    page = Path('app/page.tsx').read_text()
    nav = Path('components/NavTabs.tsx').read_text()
    layout = Path('app/layout.tsx').read_text()
    assert 'Emerald Coast Roller League' in layout
    for tab in ['Home', 'Registration', 'Games', 'Standings', 'Statistics', 'Betting', 'Shit Talk', 'Wallet', 'Trades', 'Admin']:
        assert tab in nav


def test_pwa_assets_exist():
    manifest = Path('public/manifest.json').read_text()
    sw = Path('public/sw.js').read_text()
    assert 'standalone' in manifest
    assert 'beforeinstallprompt' in Path('components/InstallPrompt.tsx').read_text()
    assert 'caches.open' in sw


def test_stripe_routes_exist():
    checkout = Path('app/api/stripe/create-checkout-session/route.ts').read_text()
    webhook = Path('app/api/stripe/webhook/route.ts').read_text()
    assert 'checkout.sessions.create' in checkout
    assert 'constructEvent' in webhook
    assert 'idempotency_key' in webhook


def test_runtime_files_do_not_use_path_alias_imports():
    files = [
        'app/page.tsx',
        'app/api/stripe/create-checkout-session/route.ts',
        'app/api/stripe/webhook/route.ts',
        'components/NavTabs.tsx',
    ]
    for file in files:
        text = Path(file).read_text()
        assert '@/"' not in text
        assert "@/'" not in text
        assert '@/lib' not in text
        assert '@/components' not in text


def test_package_json_has_required_typescript_devdeps_for_next_build():
    pkg = Path('package.json').read_text()
    assert '"typescript"' in pkg
    assert '"@types/react"' in pkg
    assert '"@types/node"' in pkg


def test_supabase_and_stripe_clients_are_lazy_initialized():
    supabase_lib = Path('lib/supabase.ts').read_text()
    checkout = Path('app/api/stripe/create-checkout-session/route.ts').read_text()
    webhook = Path('app/api/stripe/webhook/route.ts').read_text()

    assert 'export const supabaseAdmin = createClient' not in supabase_lib
    assert 'export function getSupabaseAdmin()' in supabase_lib
    assert 'function getStripe()' in checkout
    assert 'function getStripe()' in webhook




def test_next_version_is_patched_for_cve_2025_66478():
    import json
    pkg = json.loads(Path('package.json').read_text())
    next_version = pkg['dependencies']['next'].lstrip('^~')
    major, minor, patch = [int(x) for x in next_version.split('.')[:3]]
    assert (major, minor, patch) >= (15, 5, 6)


def test_all_nav_routes_exist_to_prevent_preview_404s():
    routes = ['registration', 'register', 'schedule', 'standings', 'statistics', 'betting', 'wallet', 'trades', 'chat', 'admin']
    for route in routes:
        assert Path(f'app/{route}/page.tsx').exists()


def test_stripe_routes_are_feature_flagged():
    checkout = Path('app/api/stripe/create-checkout-session/route.ts').read_text()
    webhook = Path('app/api/stripe/webhook/route.ts').read_text()
    flags = Path('lib/flags.ts').read_text()

    assert 'isStripeEnabled' in checkout
    assert 'disabled for this environment' in checkout
    assert 'isStripeEnabled' in webhook
    assert 'disabled: true' in webhook
    assert 'STRIPE_ENABLED' in flags


def test_not_found_and_catch_all_routes_exist():
    assert Path('app/not-found.tsx').exists()
    catch_all = Path('app/[...slug]/page.tsx').read_text()
    assert 'prevents hard 404s' in catch_all


def test_vercel_config_uses_default_nextjs_routing():
    vercel = Path('vercel.json').read_text()
    assert '"framework": "nextjs"' in vercel
    assert '"routes"' not in vercel


def test_vercelignore_excludes_legacy_python_artifacts():
    ignore = Path('.vercelignore').read_text()
    assert 'app.py' in ignore
    assert 'league_app/' in ignore
    assert 'requirements.txt' in ignore


def test_playwright_e2e_files_and_scripts_exist():
    pkg = Path('package.json').read_text()
    assert '"test:e2e"' in pkg
    assert '"test:e2e:ci"' in pkg
    assert '"@playwright/test"' in pkg

    navtabs = Path('components/NavTabs.tsx').read_text()
    assert 'tab-schedule' in navtabs
    assert 'tab-standings' in navtabs
    assert 'tab-statistics' in navtabs
    assert 'tab-registration' in navtabs
    assert 'tab-chat' in navtabs
    assert 'tab-betting' in navtabs

    e2e = Path('e2e/navigation.spec.ts').read_text()
    assert 'Emerald Coast Roller League' in e2e
    assert 'tab-schedule' in e2e
    assert 'tab-standings' in e2e
    assert 'tab-chat' in e2e
    assert 'tab-betting' in e2e


def test_chat_and_betting_headings_match_e2e_expectations():
    chat = Path('app/chat/page.tsx').read_text()
    betting = Path('app/betting/page.tsx').read_text()
    assert 'Shit Talk' in chat
    assert 'Login' in betting


def test_pages_use_supabase_data_snapshot():
    home = Path('app/page.tsx').read_text()
    schedule = Path('app/schedule/page.tsx').read_text()
    standings = Path('app/standings/page.tsx').read_text()
    leaders = Path('app/leaders/page.tsx').read_text()
    chat = Path('app/chat/page.tsx').read_text()
    data_lib = Path('lib/league-data.ts').read_text()

    assert 'getLeagueSnapshot' in home
    assert 'getLeagueSnapshot' in schedule
    assert 'getLeagueSnapshot' in standings
    assert 'getLeagueSnapshot' in leaders
    assert 'getLeagueSnapshot' in chat
    assert "from('games')" in data_lib
    assert "from('teams')" in data_lib
    assert "from('players')" in data_lib
    assert "from('chat_messages')" in data_lib


def test_home_has_required_banner_sections():
    home = Path('app/page.tsx').read_text()
    assert 'Upcoming Games' in home
    assert 'Recent Scores' in home
    assert 'Stat Leaders' in home
    assert 'League News' in home


def test_chat_has_message_board_and_chatroom_sections():
    chat = Path('components/ChatClient.tsx').read_text()
    assert 'Message Board' in chat
    assert 'Live Chatroom' in chat


def test_registration_page_explains_access_vs_season_rules():
    registration = Path('app/registration/page.tsx').read_text()
    assert 'Create your site account and register for the current season in one form.' in registration
    assert 'Already a member? Register for latest season' in registration
    assert 'first_name' in registration
    assert 'last_name' in registration


def test_games_page_has_upcoming_and_completed_sections():
    schedule = Path('app/schedule/page.tsx').read_text()
    assert '<h1>Games</h1>' in schedule
    assert 'Upcoming Games' in schedule
    assert 'Completed Games' in schedule
    assert 'Home Team' in schedule
    assert 'Away Team' in schedule
    assert 'Home Score' in schedule
    assert 'Away Score' in schedule
    assert 'Status' not in schedule


def test_statistics_page_has_leaderboard_and_team_filter():
    stats_page = Path('app/statistics/page.tsx').read_text()
    stats_client = Path('components/StatisticsClient.tsx').read_text()
    assert 'StatisticsClient' in stats_page
    assert 'Leaderboard' in stats_client
    assert 'All Stats' in stats_client
    assert 'team-filter' in stats_client
    assert 'Skaters' in stats_client
    assert 'Goalies' in stats_client
    assert '<th>G</th>' in stats_client
    assert '<th>A</th>' in stats_client
    assert '<th>P</th>' in stats_client
    assert '<th>G/GP</th>' in stats_client
    assert '<th>P/GP</th>' in stats_client
    assert '<th>Wins</th>' in stats_client
    assert '<th>GAA</th>' in stats_client


def test_chat_page_has_chatroom_first_and_message_board_actions():
    chat = Path('components/ChatClient.tsx').read_text()
    assert chat.index('Live Chatroom') < chat.index('Message Board')
    assert 'New Post' in chat
    assert 'Refresh' in chat
    assert 'onClick={sendChat}' in chat


def test_trades_and_admin_have_requested_management_sections():
    trades = Path('app/trades/page.tsx').read_text()
    admin = Path('components/AdminClient.tsx').read_text()
    assert 'My Roster' in trades
    assert 'Players Available for Trade' in trades
    assert 'All Players' in trades
    assert 'On the trade block' in trades
    assert 'Open to trade' in trades
    assert 'Untradeable' in trades
    assert 'Player Information & Registration' in admin
    assert 'Schedule Management' in admin
    assert 'Import Schedule CSV' in admin
    assert 'Game Scores' in admin
    assert 'Update Game Score' in admin



def test_register_flow_page_and_header_links_exist():
    layout = Path('app/layout.tsx').read_text()
    register_page = Path('app/register/page.tsx').read_text()
    schema = Path('sql/schema.sql').read_text()

    assert 'href="/register"' in layout
    assert 'href="/login"' in layout
    assert 'Step 1: Profile Creation' in register_page
    assert 'Step 2: Season Registration' in register_page
    assert 'Step 3: Payment' in register_page
    assert 'supabase.auth.signUp' in register_page
    assert 'getSupabaseSafe' in register_page
    assert ".from('profiles')" in register_page
    assert ".from('registrations')" in register_page
    assert 'already registered for this season' in register_page
    assert 'add column if not exists preferred_positions text[]' in schema
    assert 'add column if not exists experience text' in schema



def test_login_page_has_supabase_auth_sign_in():
    login = Path('app/login/page.tsx').read_text()
    assert 'signInWithPassword' in login
    assert 'Supabase client is not configured' in login
