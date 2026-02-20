import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '../../../../lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(req: NextRequest) {
  const { packageId, userId } = await req.json();
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
