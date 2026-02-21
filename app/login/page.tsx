import Link from 'next/link';

export default function LoginPage() {
  return (
    <main>
      <h1>Login</h1>
      <p>Authentication UI will be connected to Supabase Auth.</p>
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
