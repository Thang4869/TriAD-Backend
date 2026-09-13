import { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
): Response {
  return res.status(200).json({
    success: true,
    data,
    ...(message && { message }),
  });
}

export function sendCreated<T>(
  res: Response,
  data: T,
  message?: string,
): Response {
  return res.status(201).json({
    success: true,
    data,
    ...(message && { message }),
  });
}

export function sendAccepted<T>(
  res: Response,
  data: T,
  message?: string,
): Response {
  return res.status(202).json({
    success: true,
    data,
    ...(message && { message }),
  });
}

export function sendMessage(res: Response, message: string): Response {
  return res.status(200).json({ success: true, message });
}
