import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import config from "@config";
import app from "@/app";
import prisma from "@core/database/prisma";
import { signToken } from "@shared/utils/jwt";

type UserRole = "USER" | "ADMIN";

const adminReadEndpoints = [
  "/api/admin/dashboard/stats",
  "/api/admin/audit-logs",
  "/api/products/admin/all",
  "/api/orders/admin/all",
  "/api/reviews/admin/all",
] as const;

const mutationTargetId = randomUUID();

const adminMutationEndpoints = [
  {
    method: "post",
    path: "/api/products/admin",
    action: "PRODUCT_CREATE",
    targetId: undefined,
  },
  {
    method: "put",
    path: "/api/products/admin/" + mutationTargetId,
    action: "PRODUCT_UPDATE",
    targetId: mutationTargetId,
  },
  {
    method: "delete",
    path: "/api/products/admin/" + mutationTargetId,
    action: "PRODUCT_DEACTIVATE",
    targetId: mutationTargetId,
  },
  {
    method: "patch",
    path: "/api/products/admin/" + mutationTargetId + "/restore",
    action: "PRODUCT_RESTORE",
    targetId: mutationTargetId,
  },
  {
    method: "post",
    path: "/api/products/admin/" + mutationTargetId + "/images",
    action: "PRODUCT_IMAGE_UPLOAD_REQUESTED",
    targetId: mutationTargetId,
  },
  {
    method: "patch",
    path: "/api/orders/admin/" + mutationTargetId + "/status",
    action: "ORDER_STATUS_UPDATE",
    targetId: mutationTargetId,
  },
] as const;

async function createUser(role: UserRole) {
  return prisma.user.create({
    data: {
      email:
        "admin-auth-" + role.toLowerCase() + "-" + randomUUID() + "@test.local",
      password: "integration-test-hash",
      firstName: "Integration",
      lastName: role,
      role,
      isVerified: true,
    },
  });
}

function createAccessToken(
  user: { id: string; email: string },
  tokenRole: UserRole,
) {
  return signToken(
    {
      sub: user.id,
      email: user.email,
      role: tokenRole,
      sessionId: randomUUID(),
      jti: randomUUID(),
      iss: config.JWT_ISSUER,
      aud: config.JWT_ACCESS_AUDIENCE,
      tokenType: "access",
    },
    config.JWT_ACCESS_SECRET,
    "5m",
  );
}

const productPayload = () => ({
  name: "Authorization Integration Product",
  description: "Created by the admin authorization integration test.",
  price: 125000,
  stock: 4,
  category: "Integration",
  images: ["https://example.com/integration-product.png"],
  slug: "authorization-integration-" + randomUUID(),
});

function buildMutationRequest(
  endpoint: (typeof adminMutationEndpoints)[number],
  token?: string,
) {
  const client = request(app);
  const authorization = token ? { Authorization: "Bearer " + token } : {};
  const req =
    endpoint.method === "post"
      ? client.post(endpoint.path)
      : endpoint.method === "put"
        ? client.put(endpoint.path)
        : endpoint.method === "delete"
          ? client.delete(endpoint.path)
          : client.patch(endpoint.path);

  req.set(authorization);

  if (endpoint.action === "PRODUCT_CREATE") {
    return req.send(productPayload());
  }
  if (endpoint.action === "PRODUCT_UPDATE") {
    return req.send({ name: "Unauthorized update" });
  }
  if (endpoint.action === "ORDER_STATUS_UPDATE") {
    return req.send({ status: "PROCESSING" });
  }
  return req;
}

async function expectDeniedAudit(
  userId: string,
  endpoint: (typeof adminMutationEndpoints)[number],
  response: PromiseLike<{ status: number }>,
) {
  const result = await response;
  expect(result.status).toBe(403);

  await expect(
    prisma.adminAuditLog.findFirst({
      where: {
        actorId: userId,
        action: "ADMIN_ACTION_DENIED",
        targetType: endpoint.action,
        targetId: endpoint.targetId,
        outcome: "DENIED",
      },
    }),
  ).resolves.not.toBeNull();
}

describe("Admin HTTP authorization (integration)", () => {
  beforeEach(async () => {
    await prisma.adminAuditLog.deleteMany();
  });

  it.each(adminReadEndpoints)(
    "rejects unauthenticated requests to %s",
    async (endpoint) => {
      const response = await request(app).get(endpoint);

      expect(response.status).toBe(401);
    },
  );

  it.each(adminReadEndpoints)(
    "rejects USER database accounts on %s even when the JWT claims ADMIN",
    async (endpoint) => {
      const user = await createUser("USER");
      const token = createAccessToken(user, "ADMIN");

      const response = await request(app)
        .get(endpoint)
        .set("Authorization", "Bearer " + token);

      expect(response.status).toBe(403);
    },
  );

  it.each(adminReadEndpoints)(
    "allows ADMIN database accounts on %s even when the JWT claims USER",
    async (endpoint) => {
      const admin = await createUser("ADMIN");
      const token = createAccessToken(admin, "USER");

      const response = await request(app)
        .get(endpoint)
        .set("Authorization", "Bearer " + token);

      expect(response.status).toBe(200);
    },
  );

  it.each(adminMutationEndpoints)(
    "rejects unauthenticated $method $path",
    async (endpoint) => {
      const response = await buildMutationRequest(endpoint);

      expect(response.status).toBe(401);
    },
  );

  it.each(adminMutationEndpoints)(
    "rejects USER mutations on $method $path and records denial",
    async (endpoint) => {
      const user = await createUser("USER");
      const token = createAccessToken(user, "ADMIN");

      await expectDeniedAudit(
        user.id,
        endpoint,
        buildMutationRequest(endpoint, token),
      );

      if (endpoint.targetId) {
        expect(
          await prisma.product.findUnique({
            where: { id: endpoint.targetId },
          }),
        ).toBeNull();
      }
    },
  );

  it("does not mutate products when a USER attempts an admin create", async () => {
    const user = await createUser("USER");
    const token = createAccessToken(user, "ADMIN");
    const payload = productPayload();

    const response = await request(app)
      .post("/api/products/admin")
      .set("Authorization", "Bearer " + token)
      .send(payload);

    expect(response.status).toBe(403);
    expect(await prisma.product.count({ where: { slug: payload.slug } })).toBe(
      0,
    );
    await expect(
      prisma.adminAuditLog.findFirst({
        where: {
          actorId: user.id,
          action: "ADMIN_ACTION_DENIED",
          targetType: "PRODUCT_CREATE",
          outcome: "DENIED",
        },
      }),
    ).resolves.not.toBeNull();
  });

  it("allows an ADMIN database account to create a product", async () => {
    const admin = await createUser("ADMIN");
    const token = createAccessToken(admin, "USER");
    const payload = productPayload();

    const response = await request(app)
      .post("/api/products/admin")
      .set("Authorization", "Bearer " + token)
      .send(payload);

    expect(response.status).toBe(201);
    expect(
      await prisma.product.findUnique({ where: { slug: payload.slug } }),
    ).toMatchObject({
      name: payload.name,
      category: payload.category,
    });
  });
});
