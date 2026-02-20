import Link from 'next/link';

export default function NotFound() {
  return (
    <main>
      <h1>Page Not Found</h1>
      <p>The page you requested does not exist in this preview.</p>
      <p><Link href="/">Go to Home</Link></p>
    </main>
  );
}
