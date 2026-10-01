import type { OrderStatus } from "@modules/orders/domain/order-status";

export interface GrossOrderValueByDay {
  date: string;
  grossOrderValue: number;
  orderCount: number;
}

export interface OrderStatusCount {
  status: OrderStatus;
  count: number;
}

export interface TopSellingProduct {
  productId: string;
  name: string;
  totalQuantitySold: number;
  totalOrderValue: number;
}

export interface LowStockProduct {
  id: string;
  name: string;
  stock: number;
  slug: string;
}

export interface IDashboardRepository {
  getGrossOrderValue(sinceDate: Date): Promise<number>;
  getOrderStatusBreakdown(): Promise<OrderStatusCount[]>;
  getGrossOrderValueByDay(sinceDate: Date): Promise<GrossOrderValueByDay[]>;

  getTopSellingProducts(
    limit: number,
    sinceDate: Date,
  ): Promise<TopSellingProduct[]>;

  getLowStockProducts(threshold: number): Promise<LowStockProduct[]>;
  getNewUsersCount(sinceDate: Date): Promise<number>;
  getTotalUsersCount(): Promise<number>;
  getTotalProductsCount(): Promise<number>;
}
