import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ALLOWED_ORIGINS: z.string().optional(),
  SEED_DEFAULT_USERS: z.enum(["true", "false"]).default("false"),
  DEFAULT_USER_PASSWORD: z.string().min(8).default("admin123"),
});

export const env = envSchema.parse(process.env);
