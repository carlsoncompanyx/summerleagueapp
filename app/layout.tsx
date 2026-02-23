import './globals.css';
import InstallPrompt from '../components/InstallPrompt';
import NavTabs from '../components/NavTabs';
import { Role } from '../lib/types';

export const metadata = {
  title: 'Emerald Coast Roller League',
  description: 'ECRL PWA MVP'
};

const role: Role = 'ADMIN';
const logoSrc =
  'https://fsmbogksjimrmfjzxrlx.supabase.co/storage/v1/object/public/images/ecrl%20logo.PNG';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <div className="brand-block">
              <img className="logo-mark" src={logoSrc} alt="Emerald Coast Roller League logo" />
              <div>
                <p className="kicker">Beach Roller Hockey</p>
                <h1>Emerald Coast Roller League</h1>
              </div>
            </div>
            <InstallPrompt />
          </div>
          <NavTabs role={role} />
        </header>
        {children}
      </body>
    </html>
  );
}
