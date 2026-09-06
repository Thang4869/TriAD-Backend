import { BaseDomainEvent } from "./domain-event";

export class UserRegisteredEvent extends BaseDomainEvent {
  static readonly eventName = "UserRegistered";

  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {
    super(userId, "UserRegistered", { email });
  }
}

export class UserEmailVerifiedEvent extends BaseDomainEvent {
  static readonly eventName = "UserEmailVerified";

  constructor(public readonly userId: string) {
    super(userId, "UserEmailVerified");
  }
}

export class UserPasswordChangedEvent extends BaseDomainEvent {
  static readonly eventName = "UserPasswordChanged";

  constructor(public readonly userId: string) {
    super(userId, "UserPasswordChanged");
  }
}

export class UserTwoFactorEnabledEvent extends BaseDomainEvent {
  static readonly eventName = "UserTwoFactorEnabled";

  constructor(public readonly userId: string) {
    super(userId, "UserTwoFactorEnabled");
  }
}

export class UserTwoFactorDisabledEvent extends BaseDomainEvent {
  static readonly eventName = "UserTwoFactorDisabled";

  constructor(public readonly userId: string) {
    super(userId, "UserTwoFactorDisabled");
  }
}
