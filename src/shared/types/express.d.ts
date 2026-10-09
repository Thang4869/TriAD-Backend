declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: import("./roles").Role;
      };
      requestId?: string;
    }
  }
}

export {};
