import { createApp } from "./app.js";
import { ensureDefaultUsers } from "./bootstrap/default-users.js";
import { env } from "./config/env.js";

const app = createApp();

ensureDefaultUsers()
  .then(() => {
    app.listen(env.PORT, () => {
      console.log(`GT Orders & Stocks backend running on http://localhost:${env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to bootstrap default users", error);
    process.exit(1);
  });
