import crypto from "crypto";
import { OrderNumberGenerator } from "../application/ports/order-number-generator.port";

export class CryptoOrderNumberGenerator implements OrderNumberGenerator {
  generate(): string {
    const uniquePart = crypto.randomUUID().replace(/-/g, "").toUpperCase();

    return `ORD-${uniquePart}`;
  }
}
