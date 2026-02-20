import Link from 'next/link';

export default function AdminPage() {
  return (
    <main>
      <h1>Admin</h1>
      <p>This section is available as part of the ECRL MVP and is safe to expand iteratively.</p>
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
