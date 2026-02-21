from pathlib import Path


def test_nextjs_app_shell_exists():
    page = Path('app/page.tsx').read_text()
    assert 'Emerald Coast Roller League (ECRL)' in page
    for tab in ['Home', 'Schedule', 'Standings', 'Leaders', 'Betting', 'Wallet', 'Trades', 'Shit Talk', 'Admin']:
        assert tab in page


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
    routes = ['schedule', 'standings', 'leaders', 'betting', 'wallet', 'trades', 'chat', 'admin']
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


def test_vercel_routes_fallback_to_catch_all():
    vercel = Path('vercel.json').read_text()
    assert '"dest": "/[...slug]"' in vercel
    assert '"handle": "filesystem"' in vercel


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
