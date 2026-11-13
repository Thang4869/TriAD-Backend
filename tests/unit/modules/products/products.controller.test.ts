import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { ProductsController } from "@modules/products/products.controller";
import type { CatalogService } from "@modules/products/services/catalog.service";
import type { AdminProductService } from "@modules/products/services/admin-product.service";

function resMock() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}
function reqMock(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}
function controller(
  catalog: Record<string, ReturnType<typeof vi.fn>> = {},
  admin: Record<string, ReturnType<typeof vi.fn>> = {},
) {
  return new ProductsController(
    catalog as unknown as CatalogService,
    admin as unknown as AdminProductService,
  );
}
describe("ProductsController", () => {
  beforeEach(() => vi.clearAllMocks());
  it("forwards public catalogue query parameters", async () => {
    const findAll = vi.fn().mockResolvedValue({ products: [] });
    const res = resMock();
    await controller({ findAll }).getAll(
      reqMock({ query: { page: "2" } }),
      res,
      vi.fn(),
    );
    expect(findAll).toHaveBeenCalledWith({ page: "2" });
  });
  it("forwards product id and slug to their read methods", async () => {
    const findById = vi.fn().mockResolvedValue({ id: "p1" });
    const getBySlug = vi.fn().mockResolvedValue({ id: "p1" });
    const instance = controller({ findById, getBySlug });
    await instance.getById(
      reqMock({ params: { id: "p1" } }),
      resMock(),
      vi.fn(),
    );
    await instance.getBySlug(
      reqMock({ params: { slug: "product" } }),
      resMock(),
      vi.fn(),
    );
    expect(findById).toHaveBeenCalledWith("p1");
    expect(getBySlug).toHaveBeenCalledWith("product");
  });
  it("converts search pagination values to numbers", async () => {
    const search = vi.fn().mockResolvedValue({ products: [] });
    await controller({ search }).search(
      reqMock({ query: { q: "shirt", page: "2", limit: "5" } }),
      resMock(),
      vi.fn(),
    );
    expect(search).toHaveBeenCalledWith("shirt", 2, 5);
  });
  it("requires an uploaded image before enqueueing processing", async () => {
    const uploadImage = vi.fn();
    const next = vi.fn();
    await controller({}, { uploadImage }).adminUploadImage(
      reqMock({ params: { id: "p1" } }),
      resMock(),
      next,
    );
    expect(uploadImage).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Image file is required" }),
    );
  });
  it("queues an uploaded image and returns accepted response", async () => {
    const uploadImage = vi.fn().mockResolvedValue({ jobId: "job-1" });
    const res = resMock();
    await controller({}, { uploadImage }).adminUploadImage(
      reqMock({ params: { id: "p1" }, file: { buffer: Buffer.from("image") } }),
      res,
      vi.fn(),
    );
    expect(uploadImage).toHaveBeenCalledWith("p1", expect.any(Buffer));
    expect(res.status).toHaveBeenCalledWith(202);
  });
  it("delegates admin create, update, delete and restore", async () => {
    const create = vi.fn().mockResolvedValue({ id: "p1" });
    const update = vi.fn().mockResolvedValue({ id: "p1" });
    const remove = vi.fn().mockResolvedValue({ id: "p1" });
    const restore = vi.fn().mockResolvedValue({ id: "p1" });
    const instance = controller(
      {},
      { create, update, delete: remove, restore },
    );
    await instance.adminCreate(
      reqMock({ body: { name: "shirt" } }),
      resMock(),
      vi.fn(),
    );
    await instance.adminUpdate(
      reqMock({ params: { id: "p1" }, body: { name: "new" } }),
      resMock(),
      vi.fn(),
    );
    await instance.adminDelete(
      reqMock({ params: { id: "p1" } }),
      resMock(),
      vi.fn(),
    );
    await instance.adminRestore(
      reqMock({ params: { id: "p1" } }),
      resMock(),
      vi.fn(),
    );
    expect(create).toHaveBeenCalledWith({ name: "shirt" });
    expect(update).toHaveBeenCalledWith("p1", { name: "new" });
    expect(remove).toHaveBeenCalledWith("p1");
    expect(restore).toHaveBeenCalledWith("p1");
  });
});
