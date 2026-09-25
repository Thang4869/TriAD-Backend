export interface ProductRecord {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  version: number;
  category: string;
  images: string[];
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRatingReview {
  rating: number;
}

export interface ProductReviewer {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ProductReviewerWithEmail extends ProductReviewer {
  email: string;
}

export interface ProductReview {
  id: string;
  rating: number;
  comment: string | null;
  userId: string;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductWithRatingReviews extends ProductRecord {
  reviews: ProductRatingReview[];
}

export interface ProductWithFullReviews extends ProductRecord {
  reviews: Array<
    ProductReview & {
      user: ProductReviewerWithEmail;
    }
  >;
}

export interface ProductWithShortReviews extends ProductRecord {
  reviews: Array<
    ProductReview & {
      user: ProductReviewer;
    }
  >;
}

export interface ProductIdRecord {
  id: string;
}
