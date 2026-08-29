import jwt from "jsonwebtoken";

export const signToken = (
  payload: object,
  secret: string,
  expiresIn: string | number,
): string => {
  return jwt.sign(payload, Buffer.from(secret, "utf-8"), {
    expiresIn,
  } as jwt.SignOptions);
};

export const verifyToken = <T>(token: string, secret: string): T => {
  return jwt.verify(token, Buffer.from(secret, "utf-8")) as T;
};

export const decodeToken = (token: string): any => {
  return jwt.decode(token);
};
