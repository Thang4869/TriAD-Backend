import CircuitBreaker from "opossum";
import retry from "async-retry";
import { logger } from "@core/logger/winston";

export function withCircuitBreaker<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: {
    name: string;
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
  },
): (...args: TArgs) => Promise<TResult> {
  const breaker = new CircuitBreaker<TArgs, TResult>(fn, {
    timeout: options.timeout ?? 5000,
    errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
    resetTimeout: options.resetTimeout ?? 30000,
  });

  breaker.on("open", () =>
    logger.warn(`Circuit breaker opened for ${options.name}`),
  );
  breaker.on("halfOpen", () =>
    logger.warn(`Circuit breaker half-open for ${options.name}`),
  );
  breaker.on("close", () =>
    logger.info(`Circuit breaker closed for ${options.name}`),
  );
  breaker.on("fallback", () =>
    logger.warn(`Circuit breaker fallback for ${options.name}`),
  );

  return (...args: TArgs) => breaker.fire(...args);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; minTimeout?: number; maxTimeout?: number } = {},
): Promise<T> {
  return retry(fn, {
    retries: options.retries ?? 3,
    minTimeout: options.minTimeout ?? 100,
    maxTimeout: options.maxTimeout ?? 1000,
    onRetry: (error: Error, attempt: number) => {
      logger.warn(`Retry attempt ${attempt} due to error: ${error.message}`);
    },
  });
}
