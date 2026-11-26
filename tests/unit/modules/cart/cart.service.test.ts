import { describe, it, expect, vi, beforeEach } from "vitest";
import { CartService } from "@modules/cart/cart.service";
import type { CartItemWithProduct } from "@modules/cart/application/ports/cart-models";
import type { ICartRepository } from "@modules/cart/application/ports/cart.repository.port";
import {
  ValidationError,
  ResourceNotFoundError,
} from "@shared/errors/application-error";

function createFakeRepository(
  overrides: Partial<ICartRepository> = {},
): ICartRepository {
  return {
    findCartWithItems: vi.fn().mockResolvedValue(null),
    createCartWithItems: vi.fn(),
    findCartByUserId: vi.fn().mockResolvedValue(null),
    createCart: vi.fn(),
    findProductStockInfo: vi.fn().mockResolvedValue(null),
    addItemAtomically: vi
      .fn()
      .mockResolvedValue({ status: "product_not_found" }),
    findCartItem: vi.fn().mockResolvedValue(null),
    createCartItem: vi.fn(),
    updateCartItemQuantity: vi.fn(),
    deleteCartItem: vi.fn().mockResolvedValue(undefined),
    deleteCartItemsByCartId: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe("CartService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("addItem", () => {
    it("rejects invalid quantity before repository access", async () => {
      const repository = createFakeRepository();
      await expect(
        new CartService(repository).addItem("u", "p", 0),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repository.addItemAtomically).not.toHaveBeenCalled();
    });

    it("returns the item from the atomic repository operation", async () => {
      const item = { id: "ci1", quantity: 5 } as unknown as CartItemWithProduct;
      const repository = createFakeRepository({
        addItemAtomically: vi.fn().mockResolvedValue({ status: "added", item }),
      });
      await expect(
        new CartService(repository).addItem("u", "p", 3),
      ).resolves.toBe(item);
      expect(repository.addItemAtomically).toHaveBeenCalledWith("u", "p", 3);
    });

    it("maps missing products to ResourceNotFoundError", async () => {
      const repository = createFakeRepository({
        addItemAtomically: vi
          .fn()
          .mockResolvedValue({ status: "product_not_found" }),
      });
      await expect(
        new CartService(repository).addItem("u", "p", 1),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it("maps stock and safe-integer failures to ValidationError", async () => {
      const stockRepository = createFakeRepository({
        addItemAtomically: vi
          .fn()
          .mockResolvedValue({ status: "insufficient_stock", available: 2 }),
      });
      await expect(
        new CartService(stockRepository).addItem("u", "p", 3),
      ).rejects.toThrow("Available: 2");
      const overflowRepository = createFakeRepository({
        addItemAtomically: vi
          .fn()
          .mockResolvedValue({ status: "quantity_overflow" }),
      });
      await expect(
        new CartService(overflowRepository).addItem("u", "p", 1),
      ).rejects.toThrow("safe integer");
    });
  });

  describe("updateItem", () => {
    it("nĂ©m ValidationError khi quantity Ă¢m", async () => {
      const repository = createFakeRepository();
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-1", -1),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("nĂ©m ResourceNotFoundError khi cart khĂ´ng tá»“n táº¡i", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue(null),
      });
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-1", 2),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it("nĂ©m ResourceNotFoundError khi item khĂ´ng cĂ³ trong giá»", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", items: [] }),
      });
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-x", 2),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it("xoĂ¡ item khi quantity = 0 thay vĂ¬ gá»i update", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue({
          id: "cart-1",
          items: [{ id: "ci1", productId: "product-1" }],
        }),
      });
      const service = new CartService(repository);

      const result = await service.updateItem("user-1", "product-1", 0);

      expect(repository.deleteCartItem).toHaveBeenCalledWith("ci1");
      expect(repository.updateCartItemQuantity).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("nĂ©m ValidationError khi quantity má»›i vÆ°á»£t tá»“n kho", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue({
          id: "cart-1",
          items: [{ id: "ci1", productId: "product-1" }],
        }),
        findProductStockInfo: vi
          .fn()
          .mockResolvedValue({ id: "product-1", stock: 3, name: "P" }),
      });
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-1", 5),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("nĂ©m ValidationError vá»›i Available: 0 khi sáº£n pháº©m khĂ´ng cĂ²n tá»“n táº¡i", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue({
          id: "cart-1",
          items: [{ id: "ci1", productId: "product-1" }],
        }),
        // findProductStockInfo máº·c Ä‘á»‹nh tráº£ vá» null trong createFakeRepository
      });
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-1", 5),
      ).rejects.toThrow("Not enough stock. Available: 0");
      expect(repository.updateCartItemQuantity).not.toHaveBeenCalled();
    });

    it("cáº­p nháº­t thĂ nh cĂ´ng quantity má»›i khi cĂ²n Ä‘á»§ tá»“n kho", async () => {
      const updatedItem = { id: "ci1", productId: "product-1", quantity: 5 };
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue({
          id: "cart-1",
          items: [{ id: "ci1", productId: "product-1" }],
        }),
        findProductStockInfo: vi
          .fn()
          .mockResolvedValue({ id: "product-1", stock: 10, name: "P" }),
        updateCartItemQuantity: vi.fn().mockResolvedValue(updatedItem),
      });
      const service = new CartService(repository);

      const result = await service.updateItem("user-1", "product-1", 5);

      expect(repository.updateCartItemQuantity).toHaveBeenCalledWith("ci1", 5);
      expect(result).toEqual(updatedItem);
    });
  });

  describe("removeItem", () => {
    it("nĂ©m ResourceNotFoundError khi cart khĂ´ng tá»“n táº¡i", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue(null),
      });
      const service = new CartService(repository);

      await expect(
        service.removeItem("user-1", "product-1"),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
    });

    it("nĂ©m ResourceNotFoundError khi item khĂ´ng cĂ³ trong giá»", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", items: [] }),
      });
      const service = new CartService(repository);

      await expect(
        service.removeItem("user-1", "product-x"),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
      expect(repository.deleteCartItem).not.toHaveBeenCalled();
    });

    it("xoĂ¡ Ä‘Ăºng item khá»i giá» theo productId", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue({
          id: "cart-1",
          items: [{ id: "ci1", productId: "product-1" }],
        }),
      });
      const service = new CartService(repository);

      await service.removeItem("user-1", "product-1");

      expect(repository.deleteCartItem).toHaveBeenCalledWith("ci1");
    });
  });

  describe("clearCart", () => {
    it("nĂ©m ResourceNotFoundError khi cart khĂ´ng tá»“n táº¡i", async () => {
      const repository = createFakeRepository({
        findCartByUserId: vi.fn().mockResolvedValue(null),
      });
      const service = new CartService(repository);

      await expect(service.clearCart("user-1")).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
    });

    it("tráº£ vá» sá»‘ lÆ°á»£ng item Ä‘Ă£ xoĂ¡", async () => {
      const repository = createFakeRepository({
        findCartByUserId: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", userId: "user-1" }),
        deleteCartItemsByCartId: vi.fn().mockResolvedValue(4),
      });
      const service = new CartService(repository);

      const result = await service.clearCart("user-1");

      expect(result).toEqual({ count: 4 });
    });
  });

  describe("getCart", () => {
    it("tráº£ vá» cart hiá»‡n cĂ³ náº¿u Ä‘Ă£ tá»“n táº¡i, khĂ´ng táº¡o má»›i", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", items: [] }),
      });
      const service = new CartService(repository);

      await service.getCart("user-1");

      expect(repository.createCartWithItems).not.toHaveBeenCalled();
    });

    it("tá»± Ä‘á»™ng táº¡o cart má»›i náº¿u user chÆ°a cĂ³ (auto-provisioning)", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue(null),
        createCartWithItems: vi
          .fn()
          .mockResolvedValue({ id: "cart-new", items: [] }),
      });
      const service = new CartService(repository);

      await service.getCart("user-1");

      expect(repository.createCartWithItems).toHaveBeenCalledWith("user-1");
    });
  });
});

describe("CartService safe integer quantity boundaries", () => {
  const invalid = [
    0.5,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  it.each(invalid)(
    "rejects addItem quantity %s before any DB call",
    async (quantity) => {
      const repository = createFakeRepository();
      await expect(
        new CartService(repository).addItem("u", "p", quantity),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repository.findProductStockInfo).not.toHaveBeenCalled();
    },
  );

  it.each(invalid)(
    "rejects updateItem quantity %s before any DB call",
    async (quantity) => {
      const repository = createFakeRepository();
      await expect(
        new CartService(repository).updateItem("u", "p", quantity),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repository.findCartWithItems).not.toHaveBeenCalled();
    },
  );

  it("delegates merged quantity overflow validation to the atomic repository", async () => {
    const repository = createFakeRepository({
      addItemAtomically: vi
        .fn()
        .mockResolvedValue({ status: "quantity_overflow" }),
    });
    await expect(
      new CartService(repository).addItem("u", "p", 1),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repository.addItemAtomically).toHaveBeenCalledWith("u", "p", 1);
  });
});
