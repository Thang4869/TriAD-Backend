export interface CheckoutProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  version: number;
  category: string;
  images: string[];
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckoutCartItem {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
  product: CheckoutProduct;
}

export interface CheckoutCart {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items: CheckoutCartItem[];
}

export interface UserCartForCheckout {
  id: string;
  email: string;
  password: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  isVerified: boolean;
  is2FAEnabled: boolean;
  totpSecret: string | null;
  createdAt: Date;
  updatedAt: Date;
  cart: CheckoutCart | null;
}

export interface CheckoutOrderProduct {
  id: string;
  name: string;
  images: string[];
  slug: string;
}

export interface CheckoutOrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
  total: number;
  product: CheckoutOrderProduct;
}

export interface OrderWithItems {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
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
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  items: CheckoutOrderItem[];
}
