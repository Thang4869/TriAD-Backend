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

describe("Container - scoped registration replacement", () => {
  it("replaces a cached scoped instance when register is called again", () => {
    const token = createToken<Service>("ScopedReregister");
    const scope = new Container();
    scope.register(token, () => ({ id: 1 }), Lifetime.Scoped);
    expect(scope.resolve(token).id).toBe(1);

    scope.register(token, () => ({ id: 2 }), Lifetime.Scoped);
    expect(scope.resolve(token).id).toBe(2);
  });

  it("replaces a cached scoped instance when override is called", () => {
    const token = createToken<Service>("ScopedOverride");
    const scope = new Container();
    scope.register(token, () => ({ id: 1 }), Lifetime.Scoped);
    expect(scope.resolve(token).id).toBe(1);

    scope.override(token, () => ({ id: 3 }), Lifetime.Scoped);
    expect(scope.resolve(token).id).toBe(3);
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

describe("Container - circular dependencies", () => {
  it.each(Object.values(Lifetime))(
    "rejects a direct cycle for %s registrations",
    (lifetime) => {
      const token = createToken<string>("Self");
      const container = new Container();
      const factory = vi.fn((c: Container): string => c.resolve(token));
      container.register(token, factory, lifetime);

      expect(() => container.resolve(token)).toThrow(
        "Circular dependency detected: Symbol(Self) -> Symbol(Self)",
      );
      expect(factory).toHaveBeenCalledTimes(1);
    },
  );

  it.each(Object.values(Lifetime))(
    "rejects an indirect cycle inherited by a child scope for %s registrations",
    (lifetime) => {
      const first = createToken<string>("First");
      const second = createToken<string>("Second");
      const root = new Container();
      root.register(first, (c) => c.resolve(second), lifetime);
      root.register(second, (c) => c.resolve(first), lifetime);

      expect(() => root.createScope().resolve(first)).toThrow(
        "Circular dependency detected: Symbol(First) -> Symbol(Second) -> Symbol(First)",
      );
    },
  );

  it.each(Object.values(Lifetime))(
    "allows retry after a factory throws for %s registrations",
    (lifetime) => {
      const token = createToken<string>("Retry");
      const container = new Container();
      const factory = vi
        .fn<() => string>()
        .mockImplementationOnce(() => {
          throw new Error("temporary factory failure");
        })
        .mockReturnValue("recovered");
      container.register(token, factory, lifetime);

      expect(() => container.resolve(token)).toThrow(
        "temporary factory failure",
      );
      expect(container.resolve(token)).toBe("recovered");
      expect(factory).toHaveBeenCalledTimes(2);
    },
  );

  it("preserves lifetimes while resolving dependencies", () => {
    const root = new Container();
    for (const lifetime of Object.values(Lifetime)) {
      const token = createToken<object>(lifetime);
      root.register(token, () => ({}), lifetime);
      const firstScope = root.createScope();
      const secondScope = root.createScope();
      const first = firstScope.resolve(token);
      const repeated = firstScope.resolve(token);
      const other = secondScope.resolve(token);

      if (lifetime === Lifetime.Transient) expect(first).not.toBe(repeated);
      else expect(first).toBe(repeated);
      if (lifetime === Lifetime.Singleton) expect(first).toBe(other);
      else expect(first).not.toBe(other);
    }
  });

  it("accepts shared dependencies and distinct tokens with the same description", () => {
    const container = new Container();
    const shared = createToken<object>("Service");
    const left = createToken<object>("Service");
    const right = createToken<object>("Service");
    const root = createToken<object[]>("Root");
    container.register(shared, () => ({}), Lifetime.Transient);
    container.register(left, (c) => c.resolve(shared));
    container.register(right, (c) => c.resolve(shared));
    container.register(root, (c) => [c.resolve(left), c.resolve(right)]);

    expect(container.resolve(root)).toHaveLength(2);
  });
});
