export type Token<T> = symbol & { __type?: T };

export function createToken<T>(description: string): Token<T> {
  return Symbol(description) as Token<T>;
}

export enum Lifetime {
  Singleton = "singleton",
  Scoped = "scoped",
  Transient = "transient",
}

type Factory<T> = (container: Container) => T;

interface Registration<T> {
  factory: Factory<T>;
  lifetime: Lifetime;
  instance?: T;
}

export class Container {
  private registrations = new Map<Token<unknown>, Registration<unknown>>();
  private scopedInstances = new Map<Token<unknown>, unknown>();
  private readonly parent?: Container;

  constructor(parent?: Container) {
    this.parent = parent;
  }

  register<T>(
    token: Token<T>,
    factory: Factory<T>,
    lifetime: Lifetime = Lifetime.Singleton,
  ): this {
    this.registrations.set(token as Token<unknown>, {
      factory: factory as Factory<unknown>,
      lifetime,
    });
    return this;
  }

  resolve<T>(token: Token<T>): T {
    const registration = this.findRegistration(token);
    if (!registration) {
      throw new Error(
        `No registration found for token: ${token.toString()}. ` +
          `Did you forget to register it in container.ts?`,
      );
    }

    switch (registration.lifetime) {
      case Lifetime.Transient:
        return registration.factory(this) as T;

      case Lifetime.Scoped: {
        if (this.scopedInstances.has(token as Token<unknown>)) {
          return this.scopedInstances.get(token as Token<unknown>) as T;
        }
        const instance = registration.factory(this) as T;
        this.scopedInstances.set(token as Token<unknown>, instance);
        return instance;
      }

      case Lifetime.Singleton:
      default: {
        if (registration.instance === undefined) {
          registration.instance = registration.factory(this);
        }
        return registration.instance as T;
      }
    }
  }

  private findRegistration<T>(
    token: Token<T>,
  ): Registration<unknown> | undefined {
    return (
      this.registrations.get(token as Token<unknown>) ??
      this.parent?.findRegistration(token)
    );
  }

  createScope(): Container {
    return new Container(this);
  }

  override<T>(
    token: Token<T>,
    factory: Factory<T>,
    lifetime: Lifetime = Lifetime.Singleton,
  ): void {
    this.registrations.set(token as Token<unknown>, {
      factory: factory as Factory<unknown>,
      lifetime,
    });
  }
}
