import { describe, it, expect, vi, beforeEach } from "vitest";
import { Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendAccepted,
  sendMessage,
} from "@shared/utils/api-response";

function mockRes() {
  const res = {} as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("api-response helpers", () => {
  let res: ReturnType<typeof mockRes>;

  beforeEach(() => {
    res = mockRes();
  });

  it.each([
    ["sendSuccess", sendSuccess, 200],
    ["sendCreated", sendCreated, 201],
    ["sendAccepted", sendAccepted, 202],
  ] as const)("%s responds with %i and no message field", (_n, fn, status) => {
    fn(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
  });

  it.each([
    ["sendSuccess", sendSuccess, 200],
    ["sendCreated", sendCreated, 201],
    ["sendAccepted", sendAccepted, 202],
  ] as const)("%s includes the message when given", (_n, fn, status) => {
    fn(res, { id: 1 }, "OK nhé");
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 1 },
      message: "OK nhé",
    });
  });

  it("omits an empty-string message", () => {
    sendSuccess(res, null, "");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });

  it("sendMessage returns only success + message", () => {
    sendMessage(res, "Đã xoá");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Đã xoá",
    });
  });

  it("returns the response object for chaining", () => {
    expect(sendSuccess(res, 1)).toBe(res);
    expect(sendMessage(res, "x")).toBe(res);
  });

  it("passes arrays through untouched", () => {
    sendSuccess(res, [1, 2, 3]);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [1, 2, 3] });
  });
});
