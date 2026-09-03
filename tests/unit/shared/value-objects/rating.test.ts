import { describe, it, expect } from "vitest";
import { Rating } from "@shared/value-objects/rating";

describe("Rating", () => {
  it("should return 0 average and 0 count for empty reviews", () => {
    const rating = Rating.fromReviews([]);
    expect(rating.getAverage()).toBe(0);
    expect(rating.getCount()).toBe(0);
    expect(rating.toString()).toBe("Chưa có đánh giá");
  });

  it("should compute average correctly (round to 1 decimal)", () => {
    const reviews = [{ rating: 4 }, { rating: 5 }, { rating: 3 }];
    const rating = Rating.fromReviews(reviews);
    expect(rating.getAverage()).toBe(4);
    expect(rating.getCount()).toBe(3);
  });

  it("should round average to 1 decimal", () => {
    const reviews = [{ rating: 4 }, { rating: 5 }];
    const rating = Rating.fromReviews(reviews);
    expect(rating.getAverage()).toBe(4.5);
    expect(rating.getCount()).toBe(2);
  });

  it("should format toString with count", () => {
    const reviews = [{ rating: 4 }, { rating: 5 }];
    const rating = Rating.fromReviews(reviews);
    expect(rating.toString()).toBe("4.5 (2 đánh giá)");
  });
});
