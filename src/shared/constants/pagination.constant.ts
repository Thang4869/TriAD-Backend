export const PAGINATION_DEFAULTS = {
  DEFAULT_PAGE: 1,
  PUBLIC_PRODUCT_LIMIT: 12,
  ADMIN_PRODUCT_LIMIT: 20,
  STANDARD_LIMIT: 10,
  MAX_LIMIT: 50,
} as const;

export function resolvePagination(
  page: number | undefined,
  limit: number | undefined,
  defaultLimit: number = PAGINATION_DEFAULTS.STANDARD_LIMIT,
  cap: number = PAGINATION_DEFAULTS.MAX_LIMIT,
): { page: number; safeLimit: number; skip: number } {
  const safePage = Math.max(page ?? PAGINATION_DEFAULTS.DEFAULT_PAGE, 1);
  const safeLimit = Math.min(limit ?? defaultLimit, cap);
  const skip = (safePage - 1) * safeLimit;
  return { page: safePage, safeLimit, skip };
}
