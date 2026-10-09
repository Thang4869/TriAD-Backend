import { Lifetime, type Container } from "@core/di/container";
import { TOKENS } from "@core/di/tokens";

import { PrismaUsersRepository } from "@modules/users/infrastructure/repositories/prisma-users.repository";
import { UsersService } from "@modules/users/users.service";
import { UsersController } from "@modules/users/users.controller";

export function registerUsersModule(container: Container): void {
  container.register(TOKENS.UsersRepository, () => new PrismaUsersRepository());

  container.register(
    TOKENS.UsersService,
    (c) => new UsersService(c.resolve(TOKENS.UsersRepository)),
  );

  container.register(
    TOKENS.UsersController,
    (c) => new UsersController(c.resolve(TOKENS.UsersService)),
    Lifetime.Transient,
  );
}
