import { createApp } from "./app.js";
import { ensureDefaultUsers } from "./bootstrap/default-users.js";
import { ensureOrderSchema } from "./bootstrap/ensure-order-schema.js";
import { env } from "./config/env.js";

const app = createApp();

Promise.all([ensureOrderSchema(), ensureDefaultUsers()])
  .then(() => {
    app.listen(env.PORT, () => {
      console.log(`GT Orders & Stocks backend running on http://localhost:${env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to bootstrap application", error);
    process.exit(1);
  });
