import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import type { AppRole } from "../shared/roles.js";

const defaultUsers: Array<{ email: string; name: string; role: AppRole }> = [
  { email: "admin@gt.local", name: "Admin User", role: "ADMIN" },
  { email: "manager@gt.local", name: "Manager User", role: "MANAGER" },
  { email: "warehouse@gt.local", name: "Warehouse User", role: "WAREHOUSE" },
];

export async function ensureDefaultUsers() {
  if (env.SEED_DEFAULT_USERS !== "true") {
    return;
  }

  const passwordHash = await bcrypt.hash(env.DEFAULT_USER_PASSWORD, 10);

  for (const user of defaultUsers) {
    const existing = await db.query(`select id from users where email = $1 limit 1`, [user.email]);

    if (existing.rowCount) {
      await db.query(
        `
          update users
          set "name" = $2, "role" = $3, "password" = $4, "active" = true, "updatedAt" = now()
          where email = $1
        `,
        [user.email, user.name, user.role, passwordHash],
      );
      continue;
    }

    await db.query(
      `
        insert into users ("id", "email", "password", "name", "role", "active", "updatedAt")
        values ($1, $2, $3, $4, $5, true, now())
      `,
      [randomUUID(), user.email, passwordHash, user.name, user.role],
    );
  }
}
