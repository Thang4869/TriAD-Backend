import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminProductService } from "@modules/products/services/admin-product.service";
import { ProductImageService } from "@modules/products/services/product-image.service";
import { IProductsRepository } from "@modules/products/products.repository";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { imageQueue } from "@core/queue/bull";
import { BadRequestError, NotFoundError } from "@shared/utils/errors";
import { ProductAlreadyActiveError } from "@shared/domain/errors/domain-error";

vi.mock("@core/logger/winston", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@core/queue/bull", () => ({
  imageQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

const PRODUCT = {
  id: "prod-1",
  name: "Áo thun",
  description: "Mô tả",
  price: 100_000,
  stock: 10,
  category: "ao",
  images: [],
  slug: "ao-thun",
  isActive: true,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createRepository(
  overrides: Partial<IProductsRepository> = {},
): IProductsRepository {
  return {
    findManyWithRatings: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findByIdWithReviews: vi.fn(),
    findBySlugWithReviews: vi.fn(),
    findBySlugId: vi.fn().mockResolvedValue(null),
    groupByCategory: vi.fn().mockResolvedValue([]),
    findManyAdmin: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(PRODUCT),
    create: vi.fn().mockResolvedValue(PRODUCT),
    update: vi.fn().mockResolvedValue(PRODUCT),
    setActive: vi.fn().mockResolvedValue(PRODUCT),
    existsAndActive: vi.fn().mockResolvedValue(true),
    searchFullText: vi.fn().mockResolvedValue([]),
    countFullTextSearch: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as IProductsRepository;
}

function createService(repository: IProductsRepository) {
  const imageService = new ProductImageService(repository);
  return {
    service: new AdminProductService(repository, imageService),
    imageService,
  };
}

let publishSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  publishSpy = vi
    .spyOn(EventBus.getInstance(), "publish")
    .mockResolvedValue({ success: true, failedHandlers: [] });
});

describe("AdminProductService.adminFindAll", () => {
  it("limit mặc định 20 cho trang admin", async () => {
    const repository = createRepository();

    const result = await createService(repository).service.adminFindAll({});

    expect(repository.findManyAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(result.limit).toBe(20);
  });

  it("áp trần limit 50", async () => {
    const repository = createRepository();

    await createService(repository).service.adminFindAll({ limit: 500 });

    expect(repository.findManyAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it("không truyền isActive thì xem được cả sản phẩm đã ẩn", async () => {
    const repository = createRepository();

    await createService(repository).service.adminFindAll({});

    const where = vi.mocked(repository.findManyAdmin).mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain("isActive");
  });

  it("isActive = false lọc riêng sản phẩm đã ẩn", async () => {
    const repository = createRepository();

    await createService(repository).service.adminFindAll({ isActive: false });

    const where = vi.mocked(repository.findManyAdmin).mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"isActive":false');
  });

  it("trả metadata phân trang", async () => {
    const repository = createRepository({
      count: vi.fn().mockResolvedValue(45),
    });

    const result = await createService(repository).service.adminFindAll({
      page: 2,
      limit: 20,
    });

    expect(result).toMatchObject({ total: 45, page: 2, totalPages: 3 });
  });
});

describe("AdminProductService.create", () => {
  it("tạo mới khi slug chưa tồn tại", async () => {
    const repository = createRepository();
    const data = { slug: "ao-moi", name: "Áo mới" } as never;

    await createService(repository).service.create(data);

    expect(repository.findBySlugId).toHaveBeenCalledWith("ao-moi");
    expect(repository.create).toHaveBeenCalledWith(data);
  });

  it("từ chối khi slug đã tồn tại", async () => {
    const repository = createRepository({
      findBySlugId: vi.fn().mockResolvedValue({ id: "other" }),
    });

    await expect(
      createService(repository).service.create({ slug: "ao-thun" } as never),
    ).rejects.toThrow(new BadRequestError("Slug already exists"));
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe("AdminProductService.update", () => {
  it("ném NotFoundError khi sản phẩm không tồn tại", async () => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createService(repository).service.update("missing", {} as never),
    ).rejects.toThrow(NotFoundError);
  });

  it("đổi sang slug đã bị chiếm thì bị chặn", async () => {
    const repository = createRepository({
      findBySlugId: vi.fn().mockResolvedValue({ id: "other" }),
    });

    await expect(
      createService(repository).service.update("prod-1", {
        slug: "slug-khac",
      } as never),
    ).rejects.toThrow(BadRequestError);
  });

  it("đổi sang slug mới còn trống thì cho phép update", async () => {
    const repository = createRepository({
      findBySlugId: vi.fn().mockResolvedValue(null),
    });

    await createService(repository).service.update("prod-1", {
      slug: "slug-moi-con-trong",
    } as never);

    expect(repository.findBySlugId).toHaveBeenCalledWith("slug-moi-con-trong");
    expect(repository.update).toHaveBeenCalled();
  });

  it("giữ nguyên slug cũ thì không cần kiểm tra trùng", async () => {
    const repository = createRepository();

    await createService(repository).service.update("prod-1", {
      slug: "ao-thun",
    } as never);

    expect(repository.findBySlugId).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalled();
  });

  it("đổi giá thì publish ProductPriceChanged", async () => {
    const repository = createRepository();

    await createService(repository).service.update("prod-1", {
      price: 200_000,
    } as never);

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy.mock.calls[0][0]).toMatchObject({
      eventName: "ProductPriceChanged",
      metadata: { oldPrice: 100_000, newPrice: 200_000 },
    });
  });

  it("giá không đổi thì không publish event", async () => {
    const repository = createRepository();

    await createService(repository).service.update("prod-1", {
      price: 100_000,
    } as never);

    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("không truyền price thì không publish event", async () => {
    const repository = createRepository();

    await createService(repository).service.update("prod-1", {
      name: "Tên mới",
    } as never);

    expect(publishSpy).not.toHaveBeenCalled();
  });

  it("lỗi khi publish event không làm hỏng thao tác update", async () => {
    publishSpy.mockRejectedValue(new Error("bus down"));
    const repository = createRepository();

    await expect(
      createService(repository).service.update("prod-1", {
        price: 200_000,
      } as never),
    ).resolves.toBeDefined();
    expect(repository.update).toHaveBeenCalled();
  });
});

describe("AdminProductService.delete (soft delete)", () => {
  it("đặt isActive = false và publish ProductDeactivated", async () => {
    const repository = createRepository();

    await createService(repository).service.delete("prod-1");

    expect(repository.setActive).toHaveBeenCalledWith("prod-1", false);
    expect(publishSpy.mock.calls[0][0]).toMatchObject({
      eventName: "ProductDeactivated",
    });
  });

  it("sản phẩm không tồn tại ném NotFoundError", async () => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createService(repository).service.delete("missing"),
    ).rejects.toThrow(NotFoundError);
  });

  it("xoá sản phẩm đã ẩn bị domain chặn trước khi chạm DB", async () => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue({ ...PRODUCT, isActive: false }),
    });

    await expect(
      createService(repository).service.delete("prod-1"),
    ).rejects.toThrow();
    expect(repository.setActive).not.toHaveBeenCalled();
  });
});

describe("AdminProductService.restore", () => {
  it("bật lại sản phẩm đã ẩn và publish ProductActivated", async () => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue({ ...PRODUCT, isActive: false }),
    });

    await createService(repository).service.restore("prod-1");

    expect(repository.setActive).toHaveBeenCalledWith("prod-1", true);
    expect(publishSpy.mock.calls[0][0]).toMatchObject({
      eventName: "ProductActivated",
    });
  });

  it("restore sản phẩm đang active bị chặn", async () => {
    const repository = createRepository();

    await expect(
      createService(repository).service.restore("prod-1"),
    ).rejects.toThrow(ProductAlreadyActiveError);
    expect(repository.setActive).not.toHaveBeenCalled();
  });

  it("sản phẩm không tồn tại ném NotFoundError", async () => {
    const repository = createRepository({
      findById: vi.fn().mockResolvedValue(null),
    });

    await expect(
      createService(repository).service.restore("missing"),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("ProductImageService (qua AdminProductService.uploadImage)", () => {
  it("đẩy job vào imageQueue với buffer mã hoá base64", async () => {
    const repository = createRepository();
    const buffer = Buffer.from("fake-image");

    const result = await createService(repository).service.uploadImage(
      "prod-1",
      buffer,
    );

    expect(imageQueue.add).toHaveBeenCalledWith("process-product-image", {
      productId: "prod-1",
      imageBuffer: buffer.toString("base64"),
    });
    expect(result).toEqual({ queued: true });
  });

  it("không đẩy job khi sản phẩm không tồn tại hoặc đã ẩn", async () => {
    const repository = createRepository({
      existsAndActive: vi.fn().mockResolvedValue(false),
    });

    await expect(
      createService(repository).service.uploadImage("prod-1", Buffer.from("x")),
    ).rejects.toThrow(new NotFoundError("Product not found"));
    expect(imageQueue.add).not.toHaveBeenCalled();
  });
});
