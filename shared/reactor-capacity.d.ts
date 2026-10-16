export function isSessionCapacityError(error: unknown): boolean;
export function connectWithPair<T>(options: {
  token: (slot: number) => Promise<T>;
  connect: (credential: T) => Promise<unknown>;
  cleanup: () => Promise<unknown>;
  signal?: AbortSignal;
  active?: () => boolean;
}): Promise<T>;
