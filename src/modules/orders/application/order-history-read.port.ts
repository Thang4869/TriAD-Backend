import { IOrdersRepository } from "../orders.repository";

export type OrderHistoryReadPort = Pick<
  IOrdersRepository,
  "findByUser" | "countByUser" | "findByIdAndUser"
>;
