import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requestScope } from "@shared/middlewares/request.scope.middleware";
import { Container, createToken, Lifetime } from "@core/di/container";

describe("requestScope middleware", () => {
  it("gắn một scope container mới vào req và gọi next()", () => {
    const root = new Container();
    const req = {} as Request;
    const next = vi.fn() as NextFunction;

    requestScope(root)(req, {} as Response, next);

    expect(req.container).toBeInstanceOf(Container);
    expect(req.container).not.toBe(root);
    expect(next).toHaveBeenCalledWith();
  });

  it("mỗi request nhận một scope riêng — instance Scoped không rò rỉ giữa các request", () => {
    const token = createToken<{ id: number }>("ScopedService");
    let counter = 0;
    const root = new Container();
    root.register(token, () => ({ id: ++counter }), Lifetime.Scoped);

    const middleware = requestScope(root);
    const reqA = {} as Request;
    const reqB = {} as Request;
    middleware(reqA, {} as Response, vi.fn());
    middleware(reqB, {} as Response, vi.fn());

    const fromA = reqA.container.resolve(token);
    const fromB = reqB.container.resolve(token);

    expect(fromA).not.toBe(fromB);
    expect(reqA.container.resolve(token)).toBe(fromA);
  });

  it("scope kế thừa registration của root container", () => {
    const token = createToken<string>("Config");
    const root = new Container();
    root.register(token, () => "value-from-root");

    const req = {} as Request;
    requestScope(root)(req, {} as Response, vi.fn());

    expect(req.container.resolve(token)).toBe("value-from-root");
  });
});
