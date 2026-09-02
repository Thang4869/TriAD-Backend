import {
  IDashboardRepository,
  PrismaDashboardRepository,
} from "./dashboard.repository";

const DEFAULT_LOW_STOCK_THRESHOLD = 10;
const DEFAULT_TOP_PRODUCTS_LIMIT = 5;
const DEFAULT_REVENUE_WINDOW_DAYS = 30;

export interface DashboardStats {
  revenue: { total30Days: number; byDay: unknown };
  orders: { statusBreakdown: unknown };
  products: { total: number; lowStock: unknown; topSelling: unknown };
  users: { total: number; new30Days: number };
}

export interface IDashboardService {
  getStats(): Promise<DashboardStats>;
}

export class DashboardService implements IDashboardService {
  constructor(private readonly repository: IDashboardRepository) {}

  async getStats(): Promise<DashboardStats> {
    const since30Days = this.daysAgo(DEFAULT_REVENUE_WINDOW_DAYS);

    const [
      totalRevenue,
      statusBreakdown,
      revenueByDay,
      topSelling,
      lowStock,
      newUsers,
      totalUsers,
      totalProducts,
    ] = await Promise.all([
      this.repository.getTotalRevenue(since30Days),
      this.repository.getOrderStatusBreakdown(),
      this.repository.getRevenueByDay(DEFAULT_REVENUE_WINDOW_DAYS),
      this.repository.getTopSellingProducts(
        DEFAULT_TOP_PRODUCTS_LIMIT,
        since30Days,
      ),
      this.repository.getLowStockProducts(DEFAULT_LOW_STOCK_THRESHOLD),
      this.repository.getNewUsersCount(since30Days),
      this.repository.getTotalUsersCount(),
      this.repository.getTotalProductsCount(),
    ]);

    return {
      revenue: { total30Days: totalRevenue, byDay: revenueByDay },
      orders: { statusBreakdown },
      products: { total: totalProducts, lowStock, topSelling },
      users: { total: totalUsers, new30Days: newUsers },
    };
  }

  private daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }
}
