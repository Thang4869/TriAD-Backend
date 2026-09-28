export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationData {
  userId: string;
  title: string;
  message: string;
  type: string;
  idempotencyKey?: string;
}
