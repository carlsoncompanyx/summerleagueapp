import { getLeagueSnapshot } from '../../lib/league-data';

export default async function RegistrationPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Registration</h1>

      <section className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Account + Season Registration</h2>
        <p className="muted">Create your site account and register for the current season in one form.</p>

        {'unavailable' in data && data.unavailable ? (
          <p>{data.reason}</p>
        ) : (
          <form aria-label="Account and season registration form" style={{ display: 'grid', gap: 10 }}>
            <label htmlFor="reg-first-name">First Name</label>
            <input id="reg-first-name" name="first_name" placeholder="First name" required />

            <label htmlFor="reg-last-name">Last Name</label>
            <input id="reg-last-name" name="last_name" placeholder="Last name" required />

            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" name="email" type="email" placeholder="you@example.com" required />

            <label htmlFor="reg-phone">Phone</label>
            <input id="reg-phone" name="phone" placeholder="(555) 555-5555" />

            <label htmlFor="reg-position">Preferred Position</label>
            <select id="reg-position" name="position" defaultValue="">
              <option value="" disabled>Select a position</option>
              <option>Forward</option>
              <option>Defense</option>
              <option>Goalie</option>
            </select>

            <label htmlFor="reg-exp">Experience</label>
            <textarea id="reg-exp" name="experience" rows={4} placeholder="Leagues, years played, etc." />

            <p className="muted">Current season: <strong>{data.season?.name ?? 'No active season'}</strong></p>
            <button type="submit">Create Account + Register for Season</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Already a Member?</h2>
        <p className="muted">Your profile info is already saved. Just register for the newest season.</p>
        <button type="button">Already a member? Register for latest season</button>
      </section>
    </main>
  );
}
