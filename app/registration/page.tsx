import { getLeagueSnapshot } from '../../lib/league-data';

export default async function RegistrationPage() {
  const data = await getLeagueSnapshot();

  return (
    <main>
      <h1>Registration</h1>
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Account Access vs Season Registration</h2>
        <p className="muted">
          Site access is managed by Supabase Auth (one account per email). This form is for season signup only.
        </p>
        <p className="muted">
          We enforce one registration per season per user account via a unique constraint on registrations
          (<code>season_id + user_id</code>).
        </p>
      </div>

      {'unavailable' in data && data.unavailable ? (
        <div className="card">
          <p>{data.reason}</p>
        </div>
      ) : (
        <form className="card" aria-label="Season registration form">
          <h2 className="section-title">Season Registration Form</h2>
          <p className="muted">Current season: <strong>{data.season?.name ?? 'No active season'}</strong></p>

          <label htmlFor="reg-name">Full Name</label>
          <input id="reg-name" name="name" placeholder="Your full name" required />

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

          <button type="submit">Submit Season Registration</button>
        </form>
      )}
    </main>
  );
}
