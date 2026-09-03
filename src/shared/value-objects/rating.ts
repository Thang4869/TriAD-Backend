export class Rating {
  private readonly average: number;
  private readonly count: number;

  private constructor(average: number, count: number) {
    this.average = average;
    this.count = count;
  }

  static fromReviews(reviews: { rating: number }[]): Rating {
    if (reviews.length === 0) return new Rating(0, 0);
    const sum = reviews.reduce((total, review) => total + review.rating, 0);
    const average = Math.round((sum / reviews.length) * 10) / 10;
    return new Rating(average, reviews.length);
  }

  getAverage(): number {
    return this.average;
  }

  getCount(): number {
    return this.count;
  }

  toString(): string {
    return this.count === 0
      ? "Chưa có đánh giá"
      : `${this.average.toFixed(1)} (${this.count} đánh giá)`;
  }
}
