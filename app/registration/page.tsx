import { redirect } from 'next/navigation';

export default function RegistrationPage() {
  // Legacy route kept for compatibility; player-based join flow now lives on /register.
  redirect('/register');
}
