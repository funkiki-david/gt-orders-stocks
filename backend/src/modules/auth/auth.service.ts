import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { db } from "../../config/db.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import type { AppRole } from "../../shared/roles.js";

type UserTokenPayload = {
  id: string;
  email: string;
  role: AppRole;
};

const roleLoginEmails: Record<AppRole, string> = {
  ADMIN: "admin@gt.usa",
  MANAGER: "manager@gt.local",
  WAREHOUSE: "warehouse@gt.local",
};

function normalizeLoginIdentifier(identifier: string) {
  const normalized = identifier.trim().toUpperCase();

  if (normalized in roleLoginEmails) {
    return roleLoginEmails[normalized as AppRole];
  }

  return identifier.trim().toLowerCase();
}

export const authService = {
  issueToken(payload: UserTokenPayload) {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1d" });
  },

  async register(input: {
    email: string;
    password: string;
    name: string;
    role?: AppRole;
  }) {
    const existing = await db.query(
      `select id from users where email = $1 limit 1`,
      [input.email.toLowerCase()],
    );

    if (existing.rowCount) {
      throw new AppError("Email already in use", 409);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const userId = randomUUID();

    const result = await db.query(
      `
        insert into users ("id", "email", "password", "name", "role", "updatedAt")
        values ($1, $2, $3, $4, $5, now())
        returning "id", "email", "name", "role"
      `,
      [userId, input.email.toLowerCase(), passwordHash, input.name, input.role ?? "MANAGER"],
    );

    return result.rows[0];
  },

  async login(input: { email: string; password: string }) {
    const loginEmail = normalizeLoginIdentifier(input.email);
    const result = await db.query(
      `
        select "id", "email", "password", "name", "role", "active"
        from users
        where email = $1
        limit 1
      `,
      [loginEmail],
    );
    const user = result.rows[0];

    if (!user || !user.active) {
      throw new AppError("Invalid email or password", 401);
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password);

    if (!passwordMatches) {
      throw new AppError("Invalid email or password", 401);
    }

    return user;
  },
};
