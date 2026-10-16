export function isSessionCapacityError(error: unknown): boolean;
export function connectWithPool<T>(options: {
  token: (slot: number) => Promise<T>;
  connect: (credential: T) => Promise<unknown>;
  cleanup: () => Promise<unknown>;
  signal?: AbortSignal;
  active?: () => boolean;
}): Promise<T>;
