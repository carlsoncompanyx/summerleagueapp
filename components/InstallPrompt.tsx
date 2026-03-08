'use client';
import { useEffect, useState } from 'react';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  if (!deferred) return null;
  return <button className="install-btn" onClick={() => deferred.prompt()}>Install App</button>;
}
