import { describe, it, expect, vi } from "vitest";
import { Container, createToken, Lifetime, Token } from "@core/di/container";

interface Service {
  id: number;
}

describe("createToken", () => {
  it("tạo Symbol duy nhất, hai token cùng mô tả vẫn khác nhau", () => {
    const a = createToken<Service>("Service");
    const b = createToken<Service>("Service");

    expect(typeof a).toBe("symbol");
    expect(a).not.toBe(b);
    expect(a.toString()).toContain("Service");
  });
});

describe("Container - lifetimes", () => {
  it("Singleton (mặc định): factory chỉ chạy một lần, luôn trả cùng instance", () => {
    const token = createToken<Service>("Singleton");
    const factory = vi.fn(() => ({ id: 1 }));
    const container = new Container();
    container.register(token, factory);

    const first = container.resolve(token);
    const second = container.resolve(token);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("Transient: mỗi lần resolve tạo instance mới", () => {
    const token = createToken<Service>("Transient");
    let counter = 0;
    const container = new Container();
    container.register(token, () => ({ id: ++counter }), Lifetime.Transient);

    expect(container.resolve(token)).not.toBe(container.resolve(token));
    expect(counter).toBe(2);
  });

  it("Scoped: dùng chung trong một scope, khác nhau giữa các scope", () => {
    const token = createToken<Service>("Scoped");
    let counter = 0;
    const root = new Container();
    root.register(token, () => ({ id: ++counter }), Lifetime.Scoped);

    const scopeA = root.createScope();
    const scopeB = root.createScope();

    expect(scopeA.resolve(token)).toBe(scopeA.resolve(token));
    expect(scopeA.resolve(token)).not.toBe(scopeB.resolve(token));
  });

  it("Singleton đăng ký ở root vẫn dùng chung khi resolve từ scope con", () => {
    const token = createToken<Service>("SharedSingleton");
    const root = new Container();
    root.register(token, () => ({ id: 1 }));

    const scope = root.createScope();

    expect(scope.resolve(token)).toBe(root.resolve(token));
  });
});

describe("Container - resolve và kế thừa", () => {
  it("ném lỗi có gợi ý khi token chưa được đăng ký", () => {
    const token = createToken<Service>("Missing");
    const container = new Container();

    expect(() => container.resolve(token)).toThrowError(
      /No registration found for token: Symbol\(Missing\)/,
    );
    expect(() => container.resolve(token)).toThrowError(/container\.ts/);
  });

  it("scope con tra ngược lên parent khi không tự đăng ký", () => {
    const token = createToken<string>("FromParent");
    const root = new Container();
    root.register(token, () => "parent-value");

    const grandchild = root.createScope().createScope();

    expect(grandchild.resolve(token)).toBe("parent-value");
  });

  it("scope con đăng ký cùng token sẽ che (shadow) registration của parent", () => {
    const token = createToken<string>("Shadowed");
    const root = new Container();
    root.register(token, () => "parent");
    const scope = root.createScope();
    scope.register(token, () => "child");

    expect(scope.resolve(token)).toBe("child");
    expect(root.resolve(token)).toBe("parent");
  });

  it("factory nhận chính container để resolve dependency lồng nhau", () => {
    const depToken = createToken<string>("Dep");
    const mainToken = createToken<{ dep: string }>("Main");
    const container = new Container();
    container.register(depToken, () => "dep-value");
    container.register(mainToken, (c) => ({ dep: c.resolve(depToken) }));

    expect(container.resolve(mainToken)).toEqual({ dep: "dep-value" });
  });

  it("register() trả về chính container để chain được", () => {
    const container = new Container();
    const token = createToken<number>("Chained");

    expect(container.register(token, () => 1)).toBe(container);
  });
});

describe("Container.override", () => {
  it("thay thế registration đã có — phục vụ mock trong test", () => {
    const token = createToken<string>("Overridable");
    const container = new Container();
    container.register(token, () => "real");

    container.override(token, () => "fake");

    expect(container.resolve(token)).toBe("fake");
  });

  it("override reset cache singleton cũ (instance mới được tạo lại)", () => {
    const token = createToken<string>("CachedSingleton");
    const container = new Container();
    container.register(token, () => "real");
    expect(container.resolve(token)).toBe("real");

    container.override(token, () => "fake");

    expect(container.resolve(token)).toBe("fake");
  });

  it("override có thể đổi luôn lifetime sang Transient", () => {
    const token = createToken<Service>("OverrideLifetime");
    let counter = 0;
    const container = new Container();
    container.register(token, () => ({ id: 0 }));

    container.override(token, () => ({ id: ++counter }), Lifetime.Transient);

    expect(container.resolve(token)).not.toBe(container.resolve(token));
  });

  it("override token chưa từng đăng ký cũng hoạt động như register", () => {
    const token: Token<string> = createToken<string>("NewViaOverride");
    const container = new Container();

    container.override(token, () => "value");

    expect(container.resolve(token)).toBe("value");
  });
});
