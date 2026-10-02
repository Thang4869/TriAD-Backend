export type OAuthProvider = "GOOGLE" | "FACEBOOK";

export interface OAuthIdentity {
  provider: OAuthProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

export interface OAuthResolution {
  user: import("./auth-user").AuthUser;
  created: boolean;
}
