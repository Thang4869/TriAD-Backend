import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var -- TS yêu cầu bắt buộc dùng "var" cho global declaration merging
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
