export class ProjectionDependencyError extends Error {
  readonly retryable = true;

  constructor(orderId: string) {
    super(`Order history projection prerequisite is missing for ${orderId}`);
    this.name = "ProjectionDependencyError";
  }
}
