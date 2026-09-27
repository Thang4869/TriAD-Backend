import type { OrderStatus } from "@modules/orders/domain/order-status";

export interface RevenueByDay {
  date: string;
  revenue: number;
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
  totalRevenue: number;
}

export interface LowStockProduct {
  id: string;
  name: string;
  stock: number;
  slug: string;
}

export interface IDashboardRepository {
  getTotalRevenue(sinceDate: Date): Promise<number>;
  getOrderStatusBreakdown(): Promise<OrderStatusCount[]>;
  getRevenueByDay(days: number): Promise<RevenueByDay[]>;

  getTopSellingProducts(
    limit: number,
    sinceDate: Date,
  ): Promise<TopSellingProduct[]>;

  getLowStockProducts(threshold: number): Promise<LowStockProduct[]>;
  getNewUsersCount(sinceDate: Date): Promise<number>;
  getTotalUsersCount(): Promise<number>;
  getTotalProductsCount(): Promise<number>;
}
