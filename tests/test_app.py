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
