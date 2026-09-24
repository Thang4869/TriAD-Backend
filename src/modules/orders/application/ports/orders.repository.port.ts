import { OrderStatus } from "../../domain/order-status";

export interface OrderProductView {
  id: string;
  name: string;
  images: string[];
  slug?: string;
}

export interface OrderItemView {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
  product: OrderProductView;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  tax: number;
  shippingFee: number;
  total: number;
  discountAmount: number;
  discountCode: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemView[];
}

export interface AdminOrderUserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AdminOrderView extends OrderView {
  user: AdminOrderUserView;
}

export interface AdminOrderFilters {
  status?: OrderStatus;
  userId?: string;
}

export interface IOrdersRepository {
  findByUser(userId: string, skip: number, take: number): Promise<OrderView[]>;

  countByUser(userId: string): Promise<number>;

  findByIdAndUser(orderId: string, userId: string): Promise<OrderView | null>;

  findManyAdmin(
    filters: AdminOrderFilters,
    skip: number,
    take: number,
  ): Promise<AdminOrderView[]>;

  countAdmin(filters: AdminOrderFilters): Promise<number>;

  findById(orderId: string): Promise<OrderView | null>;

  updateStatus(orderId: string, status: OrderStatus): Promise<OrderView>;
}
