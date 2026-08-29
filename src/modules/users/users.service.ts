import { NotFoundError, BadRequestError } from "@shared/utils/errors";
import {
  IUsersRepository,
  PrismaUsersRepository,
  UpdateProfileData,
} from "@modules/users/users.repository";
import { hashPassword, comparePassword } from "@shared/utils/bcrypt";

export class UsersService {
  constructor(
    private readonly repository: IUsersRepository = new PrismaUsersRepository(),
  ) {}

  async getProfile(userId: string) {
    const user = await this.repository.findProfileById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  }

  async updateProfile(userId: string, data: UpdateProfileData) {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return this.repository.updateProfile(userId, data);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const isValid = await comparePassword(currentPassword, user.password || "");
    if (!isValid) {
      throw new BadRequestError("Current password is incorrect");
    }

    const hashed = await hashPassword(newPassword);
    await this.repository.updatePassword(userId, hashed);

    return { success: true };
  }
}
