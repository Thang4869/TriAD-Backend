import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminProductService } from "@modules/products/services/admin-product.service";
import { ProductImageService } from "@modules/products/services/product-image.service";
import type { IProductsRepository } from "@modules/products/application/ports/products.repository.port";
import { BadRequestError, NotFoundError } from "@shared/utils/errors";
import { ProductAlreadyActiveError } from "@shared/domain/errors/domain-error";
import { ImageProcessingQueuePort } from "@modules/products/application/ports/image-processing-queue.port";
import { Product } from "@/modules/products/domain/product.entity";

vi.mock("@core/logger/winston", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
    createWithEvents: vi.fn().mockResolvedValue(PRODUCT),
    update: vi.fn().mockResolvedValue(PRODUCT),
    updateWithEvents: vi.fn().mockResolvedValue(PRODUCT),
    setActive: vi.fn().mockResolvedValue(PRODUCT),
    setActiveWithEvents: vi.fn().mockResolvedValue(PRODUCT),
    existsAndActive: vi.fn().mockResolvedValue(true),
    searchFullText: vi.fn().mockResolvedValue([]),
    countFullTextSearch: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as IProductsRepository;
}

function createService(repository: IProductsRepository) {
  const imageProcessingQueue: ImageProcessingQueuePort = {
    enqueueProductImage: vi.fn().mockResolvedValue(undefined),
  };

  const imageService = new ProductImageService(
    repository,
    imageProcessingQueue,
  );

  return {
    service: new AdminProductService(repository, imageService),
    imageService,
    imageProcessingQueue,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(repository.createWithEvents).toHaveBeenCalledWith(
      data,
      expect.objectContaining({ id: expect.any(String) }),
    );
    const aggregate = vi.mocked(repository.createWithEvents).mock.calls[0][1];
    expect(aggregate.domainEvents).toHaveLength(1);
    expect(aggregate.domainEvents[0]).toMatchObject({
      eventName: "ProductCreated",
      aggregateId: aggregate.id,
    });
  });

  it("từ chối khi slug đã tồn tại", async () => {
    const repository = createRepository({
      findBySlugId: vi.fn().mockResolvedValue({ id: "other" }),
    });

    await expect(
      createService(repository).service.create({ slug: "ao-thun" } as never),
    ).rejects.toThrow(new BadRequestError("Slug already exists"));
    expect(repository.createWithEvents).not.toHaveBeenCalled();
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
    expect(repository.updateWithEvents).toHaveBeenCalled();
  });

  it("giữ nguyên slug cũ thì không cần kiểm tra trùng", async () => {
    const repository = createRepository();

    await createService(repository).service.update("prod-1", {
      slug: "ao-thun",
    } as never);

    expect(repository.findBySlugId).not.toHaveBeenCalled();
    expect(repository.updateWithEvents).toHaveBeenCalled();
  });

  it("đổi giá thì lưu product và domain event qua atomic repository path", async () => {
    const repository = createRepository();

    await createService(repository).service.update("prod-1", {
      price: 200_000,
    } as never);

    expect(repository.updateWithEvents).toHaveBeenCalledTimes(1);

    expect(repository.updateWithEvents).toHaveBeenCalledWith(
      "prod-1",
      { price: 200_000 },
      expect.any(Object),
    );

    const aggregate = vi.mocked(repository.updateWithEvents).mock.calls[0][2];

    expect(aggregate.domainEvents).toHaveLength(1);
    expect(aggregate.domainEvents[0]).toMatchObject({
      eventName: "ProductPriceChanged",
      metadata: {
        oldPrice: 100_000,
        newPrice: 200_000,
      },
    });

    expect(repository.update).not.toHaveBeenCalled();
  });

  it("giá không đổi thì ghi ProductUpdated qua atomic path", async () => {
    const repository = createRepository();

    await createService(repository).service.update("prod-1", {
      price: 100_000,
    } as never);

    expect(repository.updateWithEvents).toHaveBeenCalledWith(
      "prod-1",
      { price: 100_000 },
      expect.any(Product),
    );
  });

  it("không truyền price thì ghi ProductUpdated qua atomic path", async () => {
    const repository = createRepository();

    await createService(repository).service.update("prod-1", {
      name: "Tên mới",
    } as never);

    expect(repository.updateWithEvents).toHaveBeenCalledWith(
      "prod-1",
      { name: "Tên mới" },
      expect.any(Product),
    );
  });

  it("lỗi atomic update với outbox thì update bị fail", async () => {
    const repository = createRepository({
      updateWithEvents: vi.fn().mockRejectedValue(new Error("outbox failed")),
    });

    await expect(
      createService(repository).service.update("prod-1", {
        price: 200_000,
      } as never),
    ).rejects.toThrow("outbox failed");

    expect(repository.updateWithEvents).toHaveBeenCalledTimes(1);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe("AdminProductService.delete (soft delete)", () => {
  it("đặt isActive = false và publish ProductDeactivated", async () => {
    const repository = createRepository();

    await createService(repository).service.delete("prod-1");

    expect(repository.setActiveWithEvents).toHaveBeenCalledWith(
      "prod-1",
      false,
      expect.any(Product),
    );
    const aggregate = vi.mocked(repository.setActiveWithEvents).mock
      .calls[0][2];

    expect(aggregate.pullEvents()).toEqual([
      expect.objectContaining({
        eventName: "ProductDeactivated",
        productId: "prod-1",
      }),
    ]);
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

    expect(repository.setActiveWithEvents).toHaveBeenCalledWith(
      "prod-1",
      true,
      expect.any(Product),
    );
    const aggregate = vi.mocked(repository.setActiveWithEvents).mock
      .calls[0][2];

    expect(aggregate.pullEvents()).toEqual([
      expect.objectContaining({
        eventName: "ProductActivated",
        productId: "prod-1",
      }),
    ]);
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
  it("đẩy job xử lý ảnh với buffer mã hoá base64", async () => {
    const repository = createRepository();
    const buffer = Buffer.from("fake-image");

    const { service, imageProcessingQueue } = createService(repository);

    const result = await service.uploadImage("prod-1", buffer);

    expect(imageProcessingQueue.enqueueProductImage).toHaveBeenCalledWith({
      productId: "prod-1",
      imageBuffer: buffer.toString("base64"),
    });

    expect(result).toEqual({ queued: true });
  });

  it("không đẩy job khi sản phẩm không tồn tại hoặc đã ẩn", async () => {
    const repository = createRepository({
      existsAndActive: vi.fn().mockResolvedValue(false),
    });

    const { service, imageProcessingQueue } = createService(repository);

    await expect(
      service.uploadImage("prod-1", Buffer.from("x")),
    ).rejects.toThrow(new NotFoundError("Product not found"));

    expect(imageProcessingQueue.enqueueProductImage).not.toHaveBeenCalled();
  });
});
