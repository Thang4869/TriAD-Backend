import { Role as PrismaRole } from "@prisma/client";

export type Role = PrismaRole;

export const ROLES = {
  USER: PrismaRole.USER,
  ADMIN: PrismaRole.ADMIN,
} as const satisfies Record<string, Role>;

export const ALL_ROLES: Role[] = Object.values(ROLES);
