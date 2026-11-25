import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { ProductsController } from "@modules/products/products.controller";
import type { CatalogService } from "@modules/products/services/catalog.service";
import type { AdminProductService } from "@modules/products/services/admin-product.service";
import type { AuditService } from "@modules/admin/audit/application/audit.service";

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
  audit?: Record<string, ReturnType<typeof vi.fn>>,
) {
  return new ProductsController(
    catalog as unknown as CatalogService,
    admin as unknown as AdminProductService,
    audit as unknown as AuditService,
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

describe("ProductsController remaining routes and audit integration", () => {
  it("returns categories and delegates the admin product listing", async () => {
    const getCategories = vi.fn().mockResolvedValue(["clothing"]);
    const adminFindAll = vi.fn().mockResolvedValue({ products: ["p1"] });
    const instance = controller({ getCategories }, { adminFindAll });

    await instance.getCategories(reqMock(), resMock(), vi.fn());
    await instance.adminGetAll(
      reqMock({ query: { page: "2" } }),
      resMock(),
      vi.fn(),
    );

    expect(getCategories).toHaveBeenCalledOnce();
    expect(adminFindAll).toHaveBeenCalledWith({ page: "2" });
  });

  it("records create, update, deactivate and restore mutations through audit service", async () => {
    const create = vi.fn().mockResolvedValue({ id: "created-product" });
    const update = vi.fn().mockResolvedValue({ id: "updated-product" });
    const remove = vi.fn().mockResolvedValue({ id: "deleted-product" });
    const restore = vi.fn().mockResolvedValue({ id: "restored-product" });
    const recordMutation = vi.fn(
      async (
        _req: unknown,
        _input: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
    );
    const instance = controller(
      {},
      { create, update, delete: remove, restore },
      { recordMutation },
    );

    await instance.adminCreate(
      reqMock({ body: { name: "shirt", price: 10 } }),
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

    expect(recordMutation).toHaveBeenCalledTimes(4);
    expect(create).toHaveBeenCalledWith({ name: "shirt", price: 10 });
    expect(update).toHaveBeenCalledWith("p1", { name: "new" });
    expect(remove).toHaveBeenCalledWith("p1");
    expect(restore).toHaveBeenCalledWith("p1");
    const createAuditInput = recordMutation.mock.calls[0][1] as {
      targetId: (result: { id: string }) => string;
    };
    expect(createAuditInput.targetId({ id: "created-product" })).toBe(
      "created-product",
    );
  });

  it("passes actor and request context when an audited image upload is queued", async () => {
    const uploadImage = vi.fn().mockResolvedValue({ jobId: "job-1" });
    const recordMutation = vi.fn(
      async (
        _req: unknown,
        _input: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
    );
    const instance = controller({}, { uploadImage }, { recordMutation });
    const buffer = Buffer.from("image");

    await instance.adminUploadImage(
      reqMock({
        params: { id: "p1" },
        file: { buffer },
        user: { id: "admin-1", role: "ADMIN" },
        requestId: "request-1",
      }),
      resMock(),
      vi.fn(),
    );

    expect(recordMutation).toHaveBeenCalledOnce();
    expect(uploadImage).toHaveBeenCalledWith("p1", buffer, {
      actorId: "admin-1",
      actorRole: "ADMIN",
      requestId: "request-1",
    });
  });
});
