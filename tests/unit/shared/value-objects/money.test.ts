import { describe, it, expect } from "vitest";
import { Money } from "@shared/value-objects/money";

describe("Money", () => {
  it("should create with default currency VND", () => {
    const money = new Money(1000);
    expect(money.getValue()).toBe(1000);
    expect(money.getCurrency()).toBe("VND");
  });

  it("should create with custom currency", () => {
    const money = new Money(1000, "USD");
    expect(money.getCurrency()).toBe("USD");
  });

  it("should throw if amount is negative", () => {
    expect(() => new Money(-1)).toThrow("Amount cannot be negative");
  });

  it("should round amount to integer", () => {
    const money = new Money(1000.9);
    expect(money.getValue()).toBe(1001);
  });

  it("should add two monies with same currency", () => {
    const a = new Money(100);
    const b = new Money(200);
    const result = a.add(b);
    expect(result.getValue()).toBe(300);
    expect(result.getCurrency()).toBe("VND");
  });

  it("should throw when adding different currencies", () => {
    const a = new Money(100, "VND");
    const b = new Money(200, "USD");
    expect(() => a.add(b)).toThrow("Currency mismatch");
  });

  it("should subtract two monies with same currency", () => {
    const a = new Money(300);
    const b = new Money(100);
    const result = a.subtract(b);
    expect(result.getValue()).toBe(200);
  });

  it("should throw when subtracting different currencies", () => {
    const a = new Money(300, "VND");
    const b = new Money(100, "USD");
    expect(() => a.subtract(b)).toThrow("Currency mismatch");
  });

  it("should multiply by factor", () => {
    const money = new Money(100);
    const result = money.multiply(2.5);
    expect(result.getValue()).toBe(250);
  });

  it("should format to string", () => {
    const money = new Money(1234567);
    expect(money.toString()).toMatch(/1[.,]234[.,]567 VND/);
  });

  it("should compare lessThan correctly", () => {
    const a = new Money(100);
    const b = new Money(200);
    expect(a.lessThan(b)).toBe(true);
    expect(b.lessThan(a)).toBe(false);
  });

  it("should throw when comparing different currencies", () => {
    const a = new Money(100, "VND");
    const b = new Money(200, "USD");
    expect(() => a.lessThan(b)).toThrow("Currency mismatch");
  });
});
