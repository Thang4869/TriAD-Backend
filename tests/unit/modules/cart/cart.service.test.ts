import { describe, it, expect, vi, beforeEach } from "vitest";
import { CartService } from "@modules/cart/cart.service";
import { ICartRepository } from "@modules/cart/cart.repository";
import { BadRequestError, NotFoundError } from "@shared/utils/errors";

function createFakeRepository(
  overrides: Partial<ICartRepository> = {},
): ICartRepository {
  return {
    findCartWithItems: vi.fn().mockResolvedValue(null),
    createCartWithItems: vi.fn(),
    findCartByUserId: vi.fn().mockResolvedValue(null),
    createCart: vi.fn(),
    findProductStockInfo: vi.fn().mockResolvedValue(null),
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
    it("ném BadRequestError khi quantity <= 0", async () => {
      const repository = createFakeRepository();
      const service = new CartService(repository);

      await expect(
        service.addItem("user-1", "product-1", 0),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repository.findProductStockInfo).not.toHaveBeenCalled();
    });

    it("ném NotFoundError khi product không tồn tại", async () => {
      const repository = createFakeRepository({
        findProductStockInfo: vi.fn().mockResolvedValue(null),
      });
      const service = new CartService(repository);

      await expect(
        service.addItem("user-1", "product-x", 1),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("ném BadRequestError khi quantity yêu cầu vượt tồn kho hiện có", async () => {
      const repository = createFakeRepository({
        findProductStockInfo: vi
          .fn()
          .mockResolvedValue({ id: "product-1", stock: 3, name: "P" }),
      });
      const service = new CartService(repository);

      await expect(
        service.addItem("user-1", "product-1", 5),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("cộng dồn quantity nếu sản phẩm đã có sẵn trong giỏ, không tạo item trùng", async () => {
      const repository = createFakeRepository({
        findProductStockInfo: vi
          .fn()
          .mockResolvedValue({ id: "product-1", stock: 10, name: "P" }),
        findCartByUserId: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", userId: "user-1" }),
        findCartItem: vi.fn().mockResolvedValue({ id: "ci1", quantity: 2 }),
        updateCartItemQuantity: vi
          .fn()
          .mockResolvedValue({ id: "ci1", quantity: 5 }),
      });
      const service = new CartService(repository);

      await service.addItem("user-1", "product-1", 3);

      expect(repository.updateCartItemQuantity).toHaveBeenCalledWith("ci1", 5);
      expect(repository.createCartItem).not.toHaveBeenCalled();
    });

    it("ném BadRequestError khi tổng quantity sau khi cộng dồn vượt tồn kho", async () => {
      const repository = createFakeRepository({
        findProductStockInfo: vi
          .fn()
          .mockResolvedValue({ id: "product-1", stock: 5, name: "P" }),
        findCartByUserId: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", userId: "user-1" }),
        findCartItem: vi.fn().mockResolvedValue({ id: "ci1", quantity: 3 }),
      });
      const service = new CartService(repository);

      await expect(
        service.addItem("user-1", "product-1", 4),
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(repository.updateCartItemQuantity).not.toHaveBeenCalled();
    });

    it("tạo cart mới nếu user chưa có cart, rồi mới tạo cart item", async () => {
      const repository = createFakeRepository({
        findProductStockInfo: vi
          .fn()
          .mockResolvedValue({ id: "product-1", stock: 10, name: "P" }),
        findCartByUserId: vi.fn().mockResolvedValue(null),
        createCart: vi
          .fn()
          .mockResolvedValue({ id: "cart-new", userId: "user-1" }),
        findCartItem: vi.fn().mockResolvedValue(null),
        createCartItem: vi.fn().mockResolvedValue({ id: "ci-new" }),
      });
      const service = new CartService(repository);

      await service.addItem("user-1", "product-1", 2);

      expect(repository.createCart).toHaveBeenCalledWith("user-1");
      expect(repository.createCartItem).toHaveBeenCalledWith(
        "cart-new",
        "product-1",
        2,
      );
    });
  });

  describe("updateItem", () => {
    it("ném BadRequestError khi quantity âm", async () => {
      const repository = createFakeRepository();
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-1", -1),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("ném NotFoundError khi cart không tồn tại", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue(null),
      });
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-1", 2),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("ném NotFoundError khi item không có trong giỏ", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", items: [] }),
      });
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-x", 2),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("xoá item khi quantity = 0 thay vì gọi update", async () => {
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
      expect(result).toBeUndefined();
    });

    it("ném BadRequestError khi quantity mới vượt tồn kho", async () => {
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
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("ném BadRequestError với Available: 0 khi sản phẩm không còn tồn tại", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue({
          id: "cart-1",
          items: [{ id: "ci1", productId: "product-1" }],
        }),
        // findProductStockInfo mặc định trả về null trong createFakeRepository
      });
      const service = new CartService(repository);

      await expect(
        service.updateItem("user-1", "product-1", 5),
      ).rejects.toThrow("Not enough stock. Available: 0");
      expect(repository.updateCartItemQuantity).not.toHaveBeenCalled();
    });

    it("cập nhật thành công quantity mới khi còn đủ tồn kho", async () => {
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
    it("ném NotFoundError khi cart không tồn tại", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi.fn().mockResolvedValue(null),
      });
      const service = new CartService(repository);

      await expect(
        service.removeItem("user-1", "product-1"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("ném NotFoundError khi item không có trong giỏ", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", items: [] }),
      });
      const service = new CartService(repository);

      await expect(
        service.removeItem("user-1", "product-x"),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.deleteCartItem).not.toHaveBeenCalled();
    });

    it("xoá đúng item khỏi giỏ theo productId", async () => {
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
    it("ném NotFoundError khi cart không tồn tại", async () => {
      const repository = createFakeRepository({
        findCartByUserId: vi.fn().mockResolvedValue(null),
      });
      const service = new CartService(repository);

      await expect(service.clearCart("user-1")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("trả về số lượng item đã xoá", async () => {
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
    it("trả về cart hiện có nếu đã tồn tại, không tạo mới", async () => {
      const repository = createFakeRepository({
        findCartWithItems: vi
          .fn()
          .mockResolvedValue({ id: "cart-1", items: [] }),
      });
      const service = new CartService(repository);

      await service.getCart("user-1");

      expect(repository.createCartWithItems).not.toHaveBeenCalled();
    });

    it("tự động tạo cart mới nếu user chưa có (auto-provisioning)", async () => {
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
