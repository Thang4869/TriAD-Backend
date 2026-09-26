export interface HealthCheckPort {
  checkDatabase(): Promise<void>;
  checkCache(): Promise<void>;
  checkQueues(): Promise<void>;
}
