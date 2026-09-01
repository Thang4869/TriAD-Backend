import { describe, it, expect } from "vitest";
import {
  resolvePagination,
  PAGINATION_DEFAULTS,
} from "@shared/constants/pagination.constant";

describe("resolvePagination", () => {
  it("should use defaults when page and limit are undefined", () => {
    const result = resolvePagination(undefined, undefined);
    expect(result.page).toBe(PAGINATION_DEFAULTS.DEFAULT_PAGE);
    expect(result.safeLimit).toBe(PAGINATION_DEFAULTS.STANDARD_LIMIT);
    expect(result.skip).toBe(0);
  });

  it("should use provided page and limit", () => {
    const result = resolvePagination(2, 15);
    expect(result.page).toBe(2);
    expect(result.safeLimit).toBe(15);
    expect(result.skip).toBe(15);
  });

  it("should cap limit at MAX_LIMIT", () => {
    const result = resolvePagination(1, 100);
    expect(result.safeLimit).toBe(PAGINATION_DEFAULTS.MAX_LIMIT);
  });

  it("should ensure page is at least 1", () => {
    const result = resolvePagination(0, 10);
    expect(result.page).toBe(1);
  });

  it("should handle limit = 0", () => {
    const result = resolvePagination(1, 0);
    expect(result.safeLimit).toBe(0);
    expect(result.skip).toBe(0);
  });

  it("should use custom defaultLimit and cap", () => {
    const result = resolvePagination(undefined, undefined, 5, 20);
    expect(result.safeLimit).toBe(5);
    const resultWithCap = resolvePagination(1, 30, 5, 20);
    expect(resultWithCap.safeLimit).toBe(20);
  });

  it("should convert negative page to 1", () => {
    const result = resolvePagination(-5, 10);
    expect(result.page).toBe(1);
  });
});
