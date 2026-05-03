import { defineConfig, devices } from "@playwright/test";

const frontendUrl = "http://127.0.0.1:5173";
const backendUrl = "http://127.0.0.1:4010";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["github"]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: frontendUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1",
      cwd: ".",
      url: `${frontendUrl}/login`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        VITE_API_BASE_URL: `${backendUrl}/api`,
      },
    },
    {
      command: "npm run dev",
      cwd: "../backend",
      url: `${backendUrl}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
