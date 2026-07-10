import { z } from "zod";

export const OrderCreateSchema = z.object({
  zoneId: z.enum(["vyshka", "pier", "left", "other"]),
  landmark: z.string().max(300).optional().default(""),
  customer: z.object({
    name: z.string().min(1).max(120),
    phone: z.string().min(5).max(20),
  }),
  payment: z.enum(["card", "cash"]),
  comment: z.string().max(500).optional().default(""),
  items: z.array(z.object({
    id: z.string(),
    qty: z.number().int().min(1).max(50),
  })).min(1),
});
