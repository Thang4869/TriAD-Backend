import { beforeEach, describe, expect, it, vi } from "vitest";
import { metricsMiddleware } from "@core/metrics/metrics.middleware";
import {
  httpRequestDuration,
  httpRequestsTotal,
} from "@core/metrics/metrics.registry";
import type { Request, Response } from "express";

vi.mock("@core/metrics/metrics.registry", () => ({
  httpRequestDuration: { observe: vi.fn() },
  httpRequestsTotal: { inc: vi.fn() },
}));

describe("metricsMiddleware", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a matched route with its base path when the response finishes", () => {
    const finish = vi.fn();
    const req = {
      method: "GET",
      baseUrl: "/api",
      route: { path: "/users/:id" },
    } as unknown as Request;
    const res = {
      statusCode: 200,
      on: vi.fn((event: string, callback: () => void) => {
        if (event === "finish") finish.mockImplementation(callback);
        return res;
      }),
    } as unknown as Response;
    const next = vi.fn();

    metricsMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    finish();

    expect(httpRequestDuration.observe).toHaveBeenCalledWith(
      { method: "GET", route: "/api/users/:id", status_code: "200" },
      expect.any(Number),
    );
    expect(httpRequestsTotal.inc).toHaveBeenCalledWith({
      method: "GET",
      route: "/api/users/:id",
      status_code: "200",
    });
  });

  it("falls back to the base URL when a route path is unavailable", () => {
    const finish = vi.fn();
    const req = {
      method: "POST",
      baseUrl: "/api/orders",
      route: {},
    } as unknown as Request;
    const res = {
      statusCode: 201,
      on: vi.fn((_event: string, callback: () => void) => {
        finish.mockImplementation(callback);
        return res;
      }),
    } as unknown as Response;

    metricsMiddleware(req, res, vi.fn());
    finish();

    expect(httpRequestsTotal.inc).toHaveBeenCalledWith({
      method: "POST",
      route: "/api/orders",
      status_code: "201",
    });
  });

  it("labels requests without a matched route or base URL as unmatched", () => {
    const finish = vi.fn();
    const req = { method: "GET" } as Request;
    const res = {
      statusCode: 404,
      on: vi.fn((_event: string, callback: () => void) => {
        finish.mockImplementation(callback);
        return res;
      }),
    } as unknown as Response;

    metricsMiddleware(req, res, vi.fn());
    finish();

    expect(httpRequestsTotal.inc).toHaveBeenCalledWith({
      method: "GET",
      route: "unmatched",
      status_code: "404",
    });
  });
});
