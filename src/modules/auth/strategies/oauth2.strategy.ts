import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import prisma from "@core/database/prisma";
import { AuthService } from "../auth.service";

export function registerOAuthStrategies(authService: AuthService): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email provided by Google"), undefined);
          }

          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            user = await prisma.user.create({
              data: {
                email,
                firstName: profile.name?.givenName || "Google",
                lastName: profile.name?.familyName || "User",
                isVerified: true,
                cart: { create: {} },
              },
            });
          }

          const tokens = await authService.generateTokens(user);
          return done(null, { user, tokens });
        } catch (error) {
          return done(error as Error, undefined);
        }
      },
    ),
  );

  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID!,
        clientSecret: process.env.FACEBOOK_APP_SECRET!,
        callbackURL:
          process.env.FACEBOOK_CALLBACK_URL || "/api/auth/facebook/callback",
        profileFields: ["id", "emails", "name"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email provided by Facebook"), undefined);
          }

          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            user = await prisma.user.create({
              data: {
                email,
                firstName: profile.name?.givenName || "Facebook",
                lastName: profile.name?.familyName || "User",
                isVerified: true,
                cart: { create: {} },
              },
            });
          }

          const tokens = await authService.generateTokens(user);
          return done(null, { user, tokens });
        } catch (error) {
          return done(error as Error, undefined);
        }
      },
    ),
  );
}

export default passport;
