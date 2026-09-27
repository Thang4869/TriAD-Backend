import type {
  UpdateProfileData,
  UserPasswordRecord,
  UserProfile,
} from "./user-models";

export interface IUsersRepository {
  findProfileById(userId: string): Promise<UserProfile | null>;
  findById(userId: string): Promise<UserPasswordRecord | null>;
  updateProfile(userId: string, data: UpdateProfileData): Promise<UserProfile>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
}
