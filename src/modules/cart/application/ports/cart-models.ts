export interface CartRecord {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartProductSummary {
  id: string;
  name: string;
  price: number;
  images: string[];
  stock: number;
  slug: string;
}

export interface CartItemRecord {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartWithItems extends CartRecord {
  items: Array<
    CartItemRecord & {
      product: CartProductSummary;
    }
  >;
}

export interface CartProductRecord {
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

export interface CartItemWithProduct extends CartItemRecord {
  product: CartProductRecord;
}

export interface ProductStockInfo {
  id: string;
  stock: number;
  name: string;
}
