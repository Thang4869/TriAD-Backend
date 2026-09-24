export interface TokenStorePort {
  get(key: string): Promise<string | null>;

  set(key: string, value: string, expiresInSeconds: number): Promise<void>;

  delete(key: string): Promise<void>;

  getAndDelete(key: string): Promise<string | null>;

  setIfAbsent(
    key: string,
    value: string,
    expiresInSeconds: number,
  ): Promise<boolean>;
}
