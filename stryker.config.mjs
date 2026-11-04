export default {
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.unit.config.mts",
    related: false,
    pool: "threads",
  },
  mutate: [
    "src/shared/value-objects/*.ts",
    "src/modules/cart/domain/cart.entity.ts",
    "src/modules/orders/domain/order.entity.ts",
    "src/modules/orders/domain/order-status.ts",
    "src/modules/products/domain/product.entity.ts",
    "src/modules/products/domain/specifications/product-specification.ts",
    "src/modules/checkout/services/pricing.service.ts",
    "src/modules/checkout/services/stock-reservation.service.ts",
  ],
  testFiles: [
    "tests/unit/shared/value-objects.test.ts",
    "tests/unit/shared/value-objects/**/*.test.ts",
    "tests/unit/modules/cart/cart.entity.test.ts",
    "tests/unit/modules/orders/order.entity.test.ts",
    "tests/unit/modules/products/product.entity.test.ts",
    "tests/unit/modules/products/product-specification.test.ts",
    "tests/unit/modules/checkout/pricing.service.test.ts",
    "tests/unit/modules/checkout/stock-reservation.service.test.ts",
  ],
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: {
    fileName: "reports/mutation/mutation.html",
  },
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  thresholds: {
    high: 90,
    low: 85,
    break: 85,
  },
  coverageAnalysis: "perTest",
  cleanTempDir: true,
};
