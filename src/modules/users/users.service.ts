import {
  ResourceNotFoundError,
  ValidationError,
} from "@shared/errors/application-error";
import type { IUsersRepository } from "@modules/users/application/ports/users.repository.port";
import {
  UpdateProfileData,
  UserProfile,
} from "@modules/users/application/ports/user-models";
import { hashPassword, comparePassword } from "@shared/utils/bcrypt";

export interface IUsersService {
  getProfile(userId: string): Promise<UserProfile>;
  updateProfile(userId: string, data: UpdateProfileData): Promise<UserProfile>;
  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }>;
}

export class UsersService implements IUsersService {
  constructor(private readonly repository: IUsersRepository) {}

  async getProfile(userId: string) {
    const user = await this.repository.findProfileById(userId);
    if (!user) {
      throw new ResourceNotFoundError("User not found");
    }
    return user;
  }

  async updateProfile(userId: string, data: UpdateProfileData) {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw new ResourceNotFoundError("User not found");
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
      throw new ResourceNotFoundError("User not found");
    }

    const isValid = await comparePassword(currentPassword, user.password || "");
    if (!isValid) {
      throw new ValidationError("Current password is incorrect");
    }

    const hashed = await hashPassword(newPassword);
    await this.repository.updatePassword(userId, hashed);

    return { success: true };
  }
}
