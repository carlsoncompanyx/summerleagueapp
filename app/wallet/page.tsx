import Link from 'next/link';

import { isStripeEnabled } from '../../lib/flags';

export default function WalletPage() {
  const stripeEnabled = isStripeEnabled();

  return (
    <main>
      <h1>Wallet</h1>
      <p>Beer Bucks balance and transaction history appear here.</p>
      <p>
        Stripe checkout is currently: <strong>{stripeEnabled ? 'ENABLED' : 'DISABLED'}</strong>
      </p>
      {!stripeEnabled && (
        <p>
          To enable purchases later, set <code>STRIPE_ENABLED=true</code> and configure Stripe + Supabase env vars.
        </p>
      )}
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
