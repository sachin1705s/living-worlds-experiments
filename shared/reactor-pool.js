// Server only. Each experiment owns its ordered keys; no cross-demo borrowing.
export const MODEL_DEMOS = {
  'reactor/lingbot': 'drawing', 'reactor/helios': 'drawing',
  'reactor/visko-orbis-stable': 'einstein', 'reactor/sana-streaming': 'stylized',
  'reactor/vidu-s2-editing': 'drip', 'reactor/vidu-s2-avatar': 'roast',
  'fast-h3': 'news', 'reactor/happy-oyster-director': 'kahani',
};
export function demoKeys(demo, env = process.env) {
  if (!Object.values(MODEL_DEMOS).includes(demo)) return [];
  const value = env[`REACTOR_${demo.toUpperCase()}_KEYS`];
  // Legacy single-key installations remain supported until a pool is configured.
  const keys = value ? JSON.parse(value) : [env.REACTOR_API_KEY];
  return [...new Set(keys.filter(key => typeof key === 'string' && key.trim()).map(key => key.trim()))].slice(0, 3);
}
export function keyFor(demo, slot = 0) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) return undefined;
  return demoKeys(demo)[slot];
}
