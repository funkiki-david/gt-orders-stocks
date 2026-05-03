import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { db } from "../../config/db.js";
import { AppError } from "../../shared/errors.js";
import type { AppRole } from "../../shared/roles.js";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toUserResponse(row: UserRow) {
  return row;
}

export const usersService = {
  async list() {
    const result = await db.query(
      `
        select "id", "email", "name", "role", "active", "createdAt", "updatedAt"
        from users
        order by
          case "role"
            when 'ADMIN' then 1
            when 'MANAGER' then 2
            when 'WAREHOUSE' then 3
            else 10
          end,
          email asc
      `,
    );

    return {
      items: result.rows.map((row) => toUserResponse(row as UserRow)),
    };
  },

  async create(input: { email: string; name: string; role: AppRole; password: string }) {
    const existing = await db.query(`select id from users where email = $1 limit 1`, [input.email.toLowerCase()]);

    if (existing.rowCount) {
      throw new AppError("Email already in use", 409);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const result = await db.query(
      `
        insert into users ("id", "email", "password", "name", "role", "active", "updatedAt")
        values ($1, $2, $3, $4, $5, true, now())
        returning "id", "email", "name", "role", "active", "createdAt", "updatedAt"
      `,
      [randomUUID(), input.email.toLowerCase(), passwordHash, input.name, input.role],
    );

    return toUserResponse(result.rows[0] as UserRow);
  },

  async update(id: string, input: { name?: string; role?: AppRole; active?: boolean }) {
    const existingResult = await db.query(
      `select "id", "email", "name", "role", "active", "createdAt", "updatedAt" from users where id = $1 limit 1`,
      [id],
    );
    const existing = existingResult.rows[0] as UserRow | undefined;

    if (!existing) {
      throw new AppError("User not found", 404);
    }

    const result = await db.query(
      `
        update users
        set
          "name" = $2,
          "role" = $3,
          "active" = $4,
          "updatedAt" = now()
        where id = $1
        returning "id", "email", "name", "role", "active", "createdAt", "updatedAt"
      `,
      [id, input.name ?? existing.name, input.role ?? existing.role, input.active ?? existing.active],
    );

    return toUserResponse(result.rows[0] as UserRow);
  },

  async resetPassword(id: string, password: string) {
    const existing = await db.query(`select id from users where id = $1 limit 1`, [id]);

    if (!existing.rowCount) {
      throw new AppError("User not found", 404);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.query(`update users set password = $2, "updatedAt" = now() where id = $1`, [id, passwordHash]);

    return { ok: true };
  },
};
