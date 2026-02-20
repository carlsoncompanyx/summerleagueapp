import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { isStripeEnabled } from '../../../../lib/flags';
import { getSupabaseAdmin } from '../../../../lib/supabase';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required.');
  return new Stripe(key);
}

export async function POST(req: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ received: true, disabled: true });
  }

  const stripe = getStripe();
  const body = await req.text();
  const sig = (await headers()).get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const packageId = Number(session.metadata?.packageId);
    const userId = String(session.metadata?.userId);
    const idem = `stripe:${event.id}`;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id')
      .eq('idempotency_key', idem)
      .maybeSingle();

    if (!existing) {
      const { data: pkg } = await supabaseAdmin
        .from('beer_bucks_packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (pkg) {
        await supabaseAdmin.rpc('credit_wallet', {
          p_user_id: userId,
          p_amount: pkg.beer_bucks_amount,
          p_ref_type: 'purchase',
          p_ref_id: String(session.id),
          p_idempotency_key: idem
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
