import { z } from "zod";
import { APP_ROLES } from "../../shared/roles.js";

export const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(APP_ROLES).optional(),
});
