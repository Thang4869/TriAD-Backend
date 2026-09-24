import { IOrdersRepository } from "./ports/orders.repository.port";

export type OrderHistoryReadPort = Pick<
  IOrdersRepository,
  "findByUser" | "countByUser" | "findByIdAndUser"
>;
