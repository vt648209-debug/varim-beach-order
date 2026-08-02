import { z } from "zod";

export const OrderCreateSchema = z.object({
  zoneId: z.enum(["vyshka", "pier", "left", "other"]),
  landmark: z.string().max(300).optional().default(""),
  customer: z.object({
    name: z.string().min(1).max(120),
            phone: z.string().min(5).max(20).transform(function(v){var d=(v||"").replace(/[^\d+]/g,"");if(d.indexOf("+")===0){d=d.slice(1);}else if((d[0]==="8"||d[0]==="7")&&d.length===11){d=d.slice(1);}if(d.length===10){return "+7"+d;}return "+"+d;}).refine(function(v){return /^\+7\d{10}$/.test(v);},{message:"Invalid phone number format"}),
  }),
  payment: z.enum(["card", "cash"]),
  comment: z.string().max(500).optional().default(""),
  items: z.array(z.object({
    id: z.string(),
    qty: z.number().int().min(1).max(50),
  })).min(1),
});
