import { Role } from "@shared/types/roles";
import { AggregateRoot } from "@shared/domain/aggregate-root";
import {
  UserRegisteredEvent,
  UserEmailVerifiedEvent,
  UserTwoFactorEnabledEvent,
  UserTwoFactorDisabledEvent,
} from "@shared/domain/events/user-events";

const MIN_PASSWORD_LENGTH = 6;

export class User extends AggregateRoot {
  private _password: string | null;
  private _isVerified: boolean;
  private _is2FAEnabled: boolean;
  private _totpSecret: string | null;
  private _phone: string | null;

  private constructor(
    id: string,
    public readonly email: string,
    public firstName: string,
    public lastName: string,
    password: string | null,
    public readonly role: Role,
    isVerified: boolean,
    is2FAEnabled: boolean,
    totpSecret: string | null,
    phone: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {
    super(id);
    this._password = password;
    this._isVerified = isVerified;
    this._is2FAEnabled = is2FAEnabled;
    this._totpSecret = totpSecret;
    this._phone = phone;
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isVerified(): boolean {
    return this._isVerified;
  }

  get is2FAEnabled(): boolean {
    return this._is2FAEnabled;
  }

  get phone(): string | null {
    return this._phone;
  }

  get passwordHash(): string | null {
    return this._password;
  }

  get totpSecret(): string | null {
    return this._totpSecret;
  }

  assertPasswordPolicy(plainPassword: string): void {
    if (plainPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
  }

  setHashedPassword(hashed: string): void {
    this._password = hashed;
  }

  verify(): void {
    if (this._isVerified) throw new Error("User already verified");
    this._isVerified = true;
    this.raise(new UserEmailVerifiedEvent(this.id));
  }

  startEnabling2FA(secret: string): void {
    if (this._is2FAEnabled) throw new Error("2FA already enabled");
    this._totpSecret = secret;
  }

  confirm2FA(): void {
    if (!this._totpSecret) throw new Error("2FA not set up");
    if (this._is2FAEnabled) throw new Error("2FA already enabled");
    this._is2FAEnabled = true;
    this.raise(new UserTwoFactorEnabledEvent(this.id));
  }

  disable2FA(): void {
    if (!this._is2FAEnabled) throw new Error("2FA is not enabled");
    this._is2FAEnabled = false;
    this._totpSecret = null;
    this.raise(new UserTwoFactorDisabledEvent(this.id));
  }

  updateProfile(firstName?: string, lastName?: string, phone?: string): void {
    if (firstName) this.firstName = firstName;
    if (lastName) this.lastName = lastName;
    if (phone !== undefined) this._phone = phone;
  }

  static hydrate(data: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string | null;
    role: Role;
    isVerified: boolean;
    is2FAEnabled: boolean;
    totpSecret: string | null;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return new User(
      data.id,
      data.email,
      data.firstName,
      data.lastName,
      data.password,
      data.role,
      data.isVerified,
      data.is2FAEnabled,
      data.totpSecret,
      data.phone,
      data.createdAt,
      data.updatedAt,
    );
  }

  static registered(data: Parameters<typeof User.hydrate>[0]): User {
    const user = User.hydrate(data);
    user.raise(new UserRegisteredEvent(user.id, user.email));
    return user;
  }
}
