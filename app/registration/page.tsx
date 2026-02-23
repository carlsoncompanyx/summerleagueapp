import Link from 'next/link';

export default function RegistrationPage() {
  return (
    <main>
      <h1>Registration</h1>
      <p>Season registration and waiver acceptance will appear here.</p>
      <div className="card">
        <p><strong>Status:</strong> MVP intake form placeholder</p>
        <p className="muted">Next step: bind this page to the `registrations` table and profile/team assignment workflow.</p>
      </div>
      <p><Link href="/">Back to Home</Link></p>
    </main>
  );
}
