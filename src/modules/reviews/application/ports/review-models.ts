export interface ReviewRecord {
  id: string;
  userId: string;
}

export interface ReviewUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ReviewProductSummary {
  id: string;
  name: string;
  images: string[];
}

export interface ReviewWithUser {
  id: string;
  userId: string;
  productId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: ReviewUserSummary;
}

export interface ReviewWithUserAndProduct extends ReviewWithUser {
  product: ReviewProductSummary;
}

export interface CreateReviewData {
  userId: string;
  productId: string;
  rating: number;
  comment: string;
}
