import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { isStripeEnabled } from '../../../../lib/flags';
import { getSupabaseAdmin } from '../../../../lib/supabase';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required.');
  return new Stripe(key);
}

export async function POST(req: NextRequest) {
  if (!isStripeEnabled()) {
    return NextResponse.json(
      { error: 'Stripe payments are disabled for this environment.' },
      { status: 503 }
    );
  }

  const stripe = getStripe();
  const { packageId, userId } = await req.json();
  const supabaseAdmin = getSupabaseAdmin();
  const { data: pkg } = await supabaseAdmin
    .from('beer_bucks_packages')
    .select('*')
    .eq('id', packageId)
    .eq('active', true)
    .single();

  if (!pkg) return NextResponse.json({ error: 'Invalid package' }, { status: 400 });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: `${process.env.APP_BASE_URL}/wallet?success=1`,
    cancel_url: `${process.env.APP_BASE_URL}/wallet?canceled=1`,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        product_data: { name: pkg.name },
        unit_amount: pkg.price_usd_cents
      }
    }],
    metadata: { packageId: String(pkg.id), userId }
  });

  return NextResponse.json({ url: session.url });
}
