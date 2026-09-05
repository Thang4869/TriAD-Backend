import { Product as PrismaProduct } from "@prisma/client";
import { Product } from "./domain/product.entity";

export class ProductMapper {
  static toDomain(prismaProduct: PrismaProduct): Product {
    return Product.hydrate({
      id: prismaProduct.id,
      name: prismaProduct.name,
      description: prismaProduct.description,
      price: prismaProduct.price,
      stock: prismaProduct.stock,
      category: prismaProduct.category,
      images: prismaProduct.images,
      slug: prismaProduct.slug,
      isActive: prismaProduct.isActive,
      version: prismaProduct.version,
    });
  }

  static toPersistence(product: Product): Partial<PrismaProduct> {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price.getValue(),
      stock: product.stock,
      category: product.category,
      images: product.images,
      slug: product.slug,
      isActive: product.isActive,
      version: product.version,
    };
  }
}
