import { BadRequestError, NotFoundError } from "@shared/utils/errors";
import { Money } from "@shared/value-objects/money";
import {
  IProductsRepository,
  CreateProductData,
  UpdateProductData,
} from "../products.repository";
import { Product } from "../domain/product.entity";
import { ProductImageService } from "./product-image.service";
import { EventBus } from "@shared/domain/event-bus/event-bus";
import { logger } from "@core/logger/winston";
import { ProductSpecificationBuilder } from "../domain/specifications/product-specification";
import { Prisma } from "@prisma/client";

const DEFAULT_ADMIN_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;

export class AdminProductService {
  constructor(
    private readonly repository: IProductsRepository,
    private readonly imageService: ProductImageService,
  ) {}

  async adminFindAll(params: {
    page?: number;
    limit?: number;
    category?: string;
    keyword?: string;
    isActive?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const {
      page = 1,
      limit = DEFAULT_ADMIN_LIMIT,
      category,
      keyword,
      isActive,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params;
    const safeLimit = Math.min(limit, MAX_PAGE_LIMIT);
    const skip = (page - 1) * safeLimit;

    const where = new ProductSpecificationBuilder()
      .withIsActive(isActive)
      .withCategory(category)
      .withKeyword(keyword)
      .build()
      .toPrismaWhere();

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [products, total] = await Promise.all([
      this.repository.findManyAdmin({ where, orderBy, skip, take: safeLimit }),
      this.repository.count(where),
    ]);

    return {
      products,
      total,
      page,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async create(data: CreateProductData) {
    const existing = await this.repository.findBySlugId(data.slug);
    if (existing) throw new BadRequestError("Slug already exists");
    return this.repository.create(data);
  }

  async update(id: string, data: UpdateProductData) {
    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundError("Product not found");

    if (data.slug && data.slug !== product.slug) {
      const existing = await this.repository.findBySlugId(data.slug);
      if (existing) throw new BadRequestError("Slug already exists");
    }

    if (data.price !== undefined && data.price !== product.price) {
      const entity = Product.hydrate(product);
      entity.changePrice(new Money(data.price));
      await this.publishEvents(entity);
    }

    return this.repository.update(id, data);
  }

  async delete(id: string) {
    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundError("Product not found");
    const entity = Product.hydrate(product);
    entity.deactivate();
    await this.publishEvents(entity);
    return this.repository.setActive(id, false);
  }

  async restore(id: string) {
    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundError("Product not found");
    const entity = Product.hydrate(product);
    entity.activate();
    await this.publishEvents(entity);
    return this.repository.setActive(id, true);
  }

  async uploadImage(productId: string, buffer: Buffer) {
    return this.imageService.upload(productId, buffer);
  }

  private async publishEvents(entity: Product) {
    const events = entity.pullEvents();
    for (const event of events) {
      try {
        await EventBus.getInstance().publish(event);
      } catch (error) {
        logger.error(`Failed to publish ${event.eventName}`, { error });
      }
    }
  }
}
