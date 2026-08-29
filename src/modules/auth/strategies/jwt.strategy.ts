import { Strategy, ExtractJwt, StrategyOptions } from "passport-jwt";
import passport from "passport";
import { PrismaAuthRepository } from "../auth.repository";
import { UnauthorizedError } from "@shared/utils/errors";

const authRepository = new PrismaAuthRepository();

const options: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_ACCESS_SECRET!,
};

passport.use(
  new Strategy(options, async (payload, done) => {
    try {
      const user = await authRepository.findUserById(payload.sub);

      if (!user || !user.isVerified) {
        return done(
          new UnauthorizedError("User not found or not verified"),
          false,
        );
      }

      return done(null, user);
    } catch (error) {
      return done(error, false);
    }
  }),
);

export default passport;
