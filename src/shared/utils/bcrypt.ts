import bcrypt from "bcrypt";
import { SECURITY } from "@shared/constants/security.constant";

export const hashPassword = async (plain: string): Promise<string> => {
  return bcrypt.hash(plain, SECURITY.BCRYPT_SALT_ROUNDS);
};

export const comparePassword = async (
  plain: string,
  hash: string,
): Promise<boolean> => {
  return bcrypt.compare(plain, hash);
};