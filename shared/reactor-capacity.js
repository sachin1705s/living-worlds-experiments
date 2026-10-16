// Only retry a refused session creation, never arbitrary connection failures.
export function isSessionCapacityError(error) {
  const text = [error?.code, error?.message, error?.error, error?.detail].filter(Boolean).join(' ');
  return /(?:concurrent|concurrency|session)[_\s-]*(?:sessions?[_\s-]*)?(?:limit|quota)|(?:limit|max(?:imum)?|too many)[_\s-]*(?:concurrent[_\s-]*)?sessions|\b429\b|resource_exhausted/i.test(text);
}

// One primary attempt and one fallback; nothing polls or returns to primary.
export async function connectWithPair({ token, connect, cleanup, signal, active = () => true }) {
  for (let slot = 0; slot < 2; slot++) {
    if (signal?.aborted || !active()) throw new Error('Session stopped');
    try {
      const credential = await token(slot);
      if (signal?.aborted || !active()) throw new Error('Session stopped');
      await connect(credential);
      if (signal?.aborted || !active()) {
        await cleanup();
        throw new Error('Session stopped');
      }
      return credential;
    } catch (error) {
      // Cleanup must complete before another session can be attempted.
      await cleanup();
      if (slot || signal?.aborted || !active() || !isSessionCapacityError(error)) throw error;
    }
  }
}
