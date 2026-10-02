import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { AuthService } from "../auth.service";
import type { Profile as GoogleProfile } from "passport-google-oauth20";
import type { Profile as FacebookProfile } from "passport-facebook";
import type { OAuthStateStorePort } from "../application/ports/oauth-state-store.port";
import type {
  OAuthIdentity,
  OAuthProvider,
} from "../application/ports/oauth-identity";
import type { StateStore } from "passport-oauth2";

export function mapGoogleProfile(profile: GoogleProfile): OAuthIdentity {
  const email = profile.emails?.[0];
  if (!profile.id || !email?.value)
    throw new Error("OAuth identity is incomplete");
  return {
    provider: "GOOGLE",
    subject: profile.id,
    email: email.value.trim().toLowerCase(),
    emailVerified: email.verified === true,
    firstName: profile.name?.givenName || "Google",
    lastName: profile.name?.familyName || "User",
  };
}

export function mapFacebookProfile(profile: FacebookProfile): OAuthIdentity {
  const email = profile.emails?.[0]?.value;
  if (!profile.id || !email) throw new Error("OAuth identity is incomplete");
  return {
    provider: "FACEBOOK",
    subject: profile.id,
    email: email.trim().toLowerCase(),
    emailVerified: false,
    firstName: profile.name?.givenName || "Facebook",
    lastName: profile.name?.familyName || "User",
  };
}

function passportStateStore(
  stateStore: OAuthStateStorePort,
  provider: OAuthProvider,
): StateStore {
  return {
    store: (...args: unknown[]) => {
      const callback = args[args.length - 1] as (
        error: Error | null,
        state?: string,
      ) => void;
      callback(null);
    },
    verify: async (...args: unknown[]) => {
      const state = args[1] as string;
      const callback = args[args.length - 1] as (
        error: Error | null,
        ok: boolean,
        state?: string,
      ) => void;
      try {
        const valid = await stateStore.consume(provider, state);
        callback(null, valid, valid ? undefined : "oauth_state_invalid");
      } catch (error) {
        callback(error as Error, false);
      }
    },
  } as StateStore;
}

export function registerOAuthStrategies(
  authService: AuthService,
  stateStore: OAuthStateStorePort,
): void {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL:
            process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
          store: passportStateStore(stateStore, "GOOGLE"),
        },

        async (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done,
        ) => {
          try {
            const user = await authService.resolveOAuthIdentity(
              mapGoogleProfile(profile),
            );

            const tokens = await authService.generateTokens(user);
            return done(null, { user, tokens });
          } catch (error) {
            return done(error as Error, undefined);
          }
        },
      ),
    );
  }

  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID,
          clientSecret: process.env.FACEBOOK_APP_SECRET,
          callbackURL:
            process.env.FACEBOOK_CALLBACK_URL || "/api/auth/facebook/callback",
          profileFields: ["id", "emails", "name"],
          store: passportStateStore(stateStore, "FACEBOOK"),
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: FacebookProfile,
          done,
        ) => {
          try {
            const user = await authService.resolveOAuthIdentity(
              mapFacebookProfile(profile),
            );

            const tokens = await authService.generateTokens(user);
            return done(null, { user, tokens });
          } catch (error) {
            return done(error as Error, undefined);
          }
        },
      ),
    );
  }
}

export default passport;
