import { connectWithPool } from '../../shared/reactor-capacity.js';
import { trackSession, stopReactor, trackConnect } from './vidu-session.js';
export async function connectPooled(session, model, signal, active = () => true) {
  return connectWithPool({
    signal, active,
    token: async (keySlot) => {
      const response = await fetch('/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, keySlot }), signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Token request failed (${response.status})`);
      return data;
    },
    connect: async ({ jwt }) => { trackSession(session, jwt); await trackConnect(session, session.connect(jwt)); },
    cleanup: () => stopReactor(session),
  });
}
