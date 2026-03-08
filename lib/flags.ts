export function isStripeEnabled(): boolean {
  return process.env.STRIPE_ENABLED === 'true';
}
