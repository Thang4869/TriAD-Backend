import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaCheckoutRepository } from "@modules/checkout/infrastructure/repositories/prisma-checkout.repository";

const mocks = vi.hoisted(() => ({
  order: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  user: { findUnique: vi.fn() },
}));

vi.mock("@core/database/prisma", () => ({
  default: { order: mocks.order, user: mocks.user },
}));

const date = new Date("2026-01-01T00:00:00.000Z");
const order = {
  id: "order-1",
  orderNumber: "ORD-1",
  userId: "user-1",
  status: "PENDING",
  paymentMethod: "COD",
  paymentStatus: "PENDING",
  subtotal: 100,
  tax: 5,
  shippingFee: 10,
  total: 115,
  discountAmount: 0,
  discountCode: null,
  customerName: "Test User",
  customerEmail: "test@example.com",
  customerPhone: "0123456789",
  customerAddress: "Test address",
  notes: null,
  idempotencyKey: "idem-1",
  createdAt: date,
  updatedAt: date,
  version: 1,
  items: [
    {
      id: "item-1",
      orderId: "order-1",
      productId: "product-1",
      quantity: 2,
      price: 50,
      total: 100,
      product: {
        id: "product-1",
        name: "Shirt",
        images: ["shirt.jpg"],
        slug: "shirt",
      },
    },
  ],
};
const user = {
  id: "user-1",
  email: "test@example.com",
  password: null,
  firstName: "Test",
  lastName: "User",
  phone: null,
  role: "USER",
  isVerified: true,
  is2FAEnabled: false,
  totpSecret: null,
  createdAt: date,
  updatedAt: date,
};

describe("PrismaCheckoutRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.findUnique.mockResolvedValue(null);
    mocks.order.findFirst.mockResolvedValue(null);
    mocks.order.findMany.mockResolvedValue([]);
    mocks.order.count.mockResolvedValue(0);
    mocks.user.findUnique.mockResolvedValue(null);
  });

  it("loads an order by id, includes product details, and maps monetary values", async () => {
    mocks.order.findUnique.mockResolvedValue(order);
    await expect(
      new PrismaCheckoutRepository().findOrderWithItems("order-1"),
    ).resolves.toMatchObject({
      id: "order-1",
      subtotal: 100,
      tax: 5,
      shippingFee: 10,
      total: 115,
      discountAmount: 0,
      items: [{ price: 50, total: 100, product: { slug: "shirt" } }],
    });
    expect(mocks.order.findUnique).toHaveBeenCalledWith({
      where: { id: "order-1" },
      include: { items: { include: { product: true } } },
    });
  });

  it("returns null when an order id is not found", async () => {
    await expect(
      new PrismaCheckoutRepository().findOrderWithItems("missing"),
    ).resolves.toBeNull();
  });

  it("finds an idempotent order for the matching user and key", async () => {
    mocks.order.findFirst.mockResolvedValue(order);
    await expect(
      new PrismaCheckoutRepository().findOrderByIdempotencyKey(
        "user-1",
        "idem-1",
      ),
    ).resolves.toMatchObject({
      id: "order-1",
      items: [{ productId: "product-1" }],
    });
    expect(mocks.order.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", idempotencyKey: "idem-1" },
      include: { items: { include: { product: true } } },
    });
  });

  it("returns null when an idempotency key has no matching order", async () => {
    await expect(
      new PrismaCheckoutRepository().findOrderByIdempotencyKey(
        "user-1",
        "missing",
      ),
    ).resolves.toBeNull();
  });

  it("loads a user's cart and safely maps product prices", async () => {
    mocks.user.findUnique.mockResolvedValue({
      ...user,
      cart: {
        id: "cart-1",
        userId: "user-1",
        createdAt: date,
        updatedAt: date,
        items: [
          {
            id: "cart-item-1",
            cartId: "cart-1",
            productId: "product-1",
            quantity: 2,
            createdAt: date,
            updatedAt: date,
            product: {
              id: "product-1",
              name: "Shirt",
              description: null,
              price: 50,
              stock: 4,
              version: 1,
              category: "clothing",
              images: ["shirt.jpg"],
              slug: "shirt",
              isActive: true,
              createdAt: date,
              updatedAt: date,
            },
          },
        ],
      },
    });
    await expect(
      new PrismaCheckoutRepository().findUserCartForCheckout("user-1"),
    ).resolves.toMatchObject({
      id: "user-1",
      cart: { items: [{ product: { id: "product-1", price: 50 } }] },
    });
    expect(mocks.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      include: { cart: { include: { items: { include: { product: true } } } } },
    });
  });

  it("returns null when the checkout user does not exist", async () => {
    await expect(
      new PrismaCheckoutRepository().findUserCartForCheckout("missing"),
    ).resolves.toBeNull();
  });

  it("preserves a user with no cart", async () => {
    mocks.user.findUnique.mockResolvedValue({ ...user, cart: null });
    await expect(
      new PrismaCheckoutRepository().findUserCartForCheckout("user-1"),
    ).resolves.toMatchObject({ id: "user-1", cart: null });
  });

  it("maps an empty cart without attempting to map product rows", async () => {
    mocks.user.findUnique.mockResolvedValue({
      ...user,
      cart: {
        id: "cart-1",
        userId: "user-1",
        createdAt: date,
        updatedAt: date,
        items: [],
      },
    });
    await expect(
      new PrismaCheckoutRepository().findUserCartForCheckout("user-1"),
    ).resolves.toMatchObject({ cart: { items: [] } });
  });

  it("lists a user's orders newest first with paginated product summaries", async () => {
    mocks.order.findMany.mockResolvedValue([order]);
    await expect(
      new PrismaCheckoutRepository().findOrdersByUser("user-1", 10, 5),
    ).resolves.toMatchObject([
      { id: "order-1", total: 115, items: [{ price: 50 }] },
    ]);
    expect(mocks.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        skip: 10,
        take: 5,
        include: expect.any(Object),
      }),
    );
  });

  it("returns an empty order list", async () => {
    await expect(
      new PrismaCheckoutRepository().findOrdersByUser("user-1", 0, 10),
    ).resolves.toEqual([]);
  });

  it("counts a user's orders", async () => {
    mocks.order.count.mockResolvedValue(8);
    await expect(
      new PrismaCheckoutRepository().countOrdersByUser("user-1"),
    ).resolves.toBe(8);
    expect(mocks.order.count).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("finds an order scoped to its owner and maps values", async () => {
    mocks.order.findFirst.mockResolvedValue(order);
    await expect(
      new PrismaCheckoutRepository().findOrderByUserAndId("order-1", "user-1"),
    ).resolves.toMatchObject({ id: "order-1", total: 115 });
    expect(mocks.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1", userId: "user-1" },
        include: expect.any(Object),
      }),
    );
  });

  it("returns null when the order is not owned by the user", async () => {
    await expect(
      new PrismaCheckoutRepository().findOrderByUserAndId(
        "order-1",
        "other-user",
      ),
    ).resolves.toBeNull();
  });
});
