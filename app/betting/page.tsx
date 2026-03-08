import Link from 'next/link';

export default function BettingPage() {
  return (
    <main>
      <h1>Betting</h1>
      <p>Login required to place bets.</p>
      <p><Link href="/login">Login</Link></p>
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
