const AVATAR_CACHE = 'tech-roast-avatar:tech-roast-png:v1';
const MAX_AGE = 89 * 24 * 60 * 60 * 1000;

export function chooseMaleVoice(catalog) {
  const voices = (Array.isArray(catalog?.system) ? catalog.system : []).filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const description = `${entry.gender || ''} ${entry.description || ''} ${(entry.voice || '').replace(/_/g, ' ')}`;
    return typeof entry.voice === 'string' && /\b(male|man|masculine)\b/i.test(description)
      && !/\b(female|woman|feminine)\b/i.test(description);
  });
  const voice = voices.find((entry) => /english|american|british/i.test(`${entry.accent} ${entry.description}`)) || voices[0];
  if (!voice) throw new Error('No male critic voice is available from the provider. Please retry.');
  return voice.voice;
}

export function rememberAvatar(id) {
  try { localStorage.setItem(AVATAR_CACHE, JSON.stringify({ id, saved: Date.now() })); } catch {}
}

function cachedAvatar() {
  try {
    const entry = JSON.parse(localStorage.getItem(AVATAR_CACHE));
    if (typeof entry?.id === 'string' && entry.id && Date.now() - entry.saved < MAX_AGE) return entry.id;
  } catch {}
  return null;
}

export async function prepareAvatar(session, portrait, { check, wait, resetError }) {
  const cached = cachedAvatar();
  if (cached) {
    try {
      await session.attachAvatar({ avatar_id: cached });
      check();
      await wait();
      return;
    } catch (error) {
      check();
      if (!/AVATAR_NOT_FOUND/.test(error.message)) throw error;
      try { localStorage.removeItem(AVATAR_CACHE); } catch {}
      resetError();
    }
  }
  const uploaded = await session.uploadFile(portrait);
  check();
  if (!uploaded) throw new Error('Portrait upload failed.');
  await session.createAvatar({ image: uploaded, name: 'Tech Roast critic' });
  check();
  await wait();
}
