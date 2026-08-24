import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction([
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.review.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.product.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.create({
    data: {
      email: "admin@shop.vn",
      password: adminPassword,
      firstName: "Admin",
      lastName: "TriAD",
      role: "ADMIN",
      isVerified: true,
      cart: { create: {} },
    },
  });

  const userPassword = await bcrypt.hash("user123", 10);
  const user = await prisma.user.create({
    data: {
      email: "user@example.com",
      password: userPassword,
      firstName: "User",
      lastName: "Test",
      isVerified: true,
      cart: { create: {} },
    },
  });

  const products = [
    {
      name: "TriAD Storage Container (1000ml/37oz)",
      description: "Borosilicate glass container, leak-proof, microwave safe.",
      price: 150000,
      stock: 50,
      category: "glass",
      images: ["/images/21.jpg"],
      slug: "triad-storage-container-1000ml",
    },
    {
      name: "TriAD Storage Container (400ml/13.5oz)",
      description: "Small size, perfect for snacks and side dishes.",
      price: 110000,
      stock: 100,
      category: "glass",
      images: ["/images/22.jpg"],
      slug: "triad-storage-container-400ml",
    },
    {
      name: "TriAD Storage Container (800ml/27oz)",
      description: "Medium size, ideal for lunch portions.",
      price: 130000,
      stock: 80,
      category: "glass",
      images: ["/images/23.jpg"],
      slug: "triad-storage-container-800ml",
    },
    {
      name: "TriAD Storage Container (400ml/13.5oz) White",
      description: "Classic white, elegant design.",
      price: 110000,
      stock: 60,
      category: "glass",
      images: ["/images/24.jpg"],
      slug: "triad-storage-container-400ml-white",
    },
    {
      name: "TriAD Storage Container Combo",
      description: "Set of 3 containers with different sizes.",
      price: 350000,
      stock: 30,
      category: "glass",
      images: ["/images/25.jpg"],
      slug: "triad-storage-container-combo",
    },
  ];

  for (const p of products) {
    await prisma.product.create({
      data: p,
    });
  }

  console.log("Seed completed!");
  console.log(`Admin: admin@shop.vn / admin123`);
  console.log(`User: user@example.com / user123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
