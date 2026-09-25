export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  isVerified: boolean;
  is2FAEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPasswordRecord {
  id: string;
  password: string | null;
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string;
}
