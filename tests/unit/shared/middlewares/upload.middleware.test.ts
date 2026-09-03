import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestError } from "@shared/utils/errors";

vi.mock("@core/queue/bull", () => ({
  emailQueue: { add: vi.fn() },
  imageQueue: { add: vi.fn() },
  emailWorker: { close: vi.fn() },
  imageWorker: { close: vi.fn() },
  queues: {},
}));

vi.mock("@core/redis/client", () => ({
  default: { ping: vi.fn() },
  redis: { ping: vi.fn() },
}));

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: { current: null as any },
}));

vi.mock("multer", () => {
  const memoryStorage = vi.fn().mockReturnValue({});
  const multerFn = vi.fn().mockImplementation((options) => {
    capturedOptions.current = options;
    return {
      single: vi
        .fn()
        .mockReturnValue((req: any, res: any, next: any) => next()),
    };
  });
  (multerFn as any).memoryStorage = memoryStorage;
  return { default: multerFn };
});

import { uploadProductImage } from "@shared/middlewares/upload.middleware";

describe("upload.middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should configure multer with memoryStorage, fileFilter, limits", () => {
    expect(uploadProductImage).toBeDefined();
    expect(capturedOptions.current).toBeDefined();
    const options = capturedOptions.current;
    expect(options).toMatchObject({
      storage: expect.anything(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    });
    expect(options.fileFilter).toBeInstanceOf(Function);
  });

  it("fileFilter should reject non-image mime types", () => {
    expect(capturedOptions.current).toBeDefined();
    const fileFilter = capturedOptions.current.fileFilter;
    const req = {} as any;
    const cb = vi.fn();
    fileFilter(req, { mimetype: "text/plain" } as any, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(BadRequestError));
  });

  it("fileFilter should accept allowed mime types", () => {
    expect(capturedOptions.current).toBeDefined();
    const fileFilter = capturedOptions.current.fileFilter;
    const req = {} as any;
    const cb = vi.fn();
    fileFilter(req, { mimetype: "image/jpeg" } as any, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });
});
