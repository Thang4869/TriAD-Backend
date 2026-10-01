import type { OrderStatus } from "@modules/orders/domain/order-status";

export interface GrossOrderValueByDay {
  date: string;
  grossOrderValue: number;
  orderCount: number;
}

export interface DashboardOrderStatusCount {
  status: OrderStatus;
  count: number;
}

export interface DashboardTopSellingProduct {
  productId: string;
  name: string;
  totalQuantitySold: number;
  totalOrderValue: number;
}

export interface DashboardLowStockProduct {
  id: string;
  name: string;
  stock: number;
  slug: string;
}

export interface DashboardReadPort {
  getGrossOrderValue(sinceDate: Date): Promise<number>;
  getOrderStatusBreakdown(): Promise<DashboardOrderStatusCount[]>;
  getGrossOrderValueByDay(sinceDate: Date): Promise<GrossOrderValueByDay[]>;
  getTopSellingProducts(
    limit: number,
    sinceDate: Date,
  ): Promise<DashboardTopSellingProduct[]>;
  getLowStockProducts(threshold: number): Promise<DashboardLowStockProduct[]>;
  getNewUsersCount(sinceDate: Date): Promise<number>;
  getTotalUsersCount(): Promise<number>;
  getTotalProductsCount(): Promise<number>;
}
