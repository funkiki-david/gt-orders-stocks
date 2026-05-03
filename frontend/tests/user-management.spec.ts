import { expect, test } from "@playwright/test";
import { loginAsAdmin, loginWithCredentials, uniqueText } from "./support";

test("admin can create a user, change role assignment, and reset password from user management", async ({
  page,
}) => {
  const email = `${uniqueText("user-mgmt")}@example.com`;
  const name = uniqueText("Playwright Managed User");

  await loginAsAdmin(page);
  await page.goto("/admin/users");

  await expect(page.getByRole("heading", { name: "User Management", exact: true })).toBeVisible();

  const createForm = page.locator("form").first();
  await createForm.getByLabel("Email").fill(email);
  await createForm.getByLabel("Name").fill(name);
  await createForm.getByLabel("Role").selectOption("WAREHOUSE");
  await createForm.getByRole("button", { name: "Create User" }).click();

  await expect(page.getByText(`Created ${email} with default password admin123.`)).toBeVisible();
  const userRow = page.locator("button", { hasText: email }).first();
  await expect(userRow).toBeVisible();

  await userRow.click();
  await page.getByLabel("Assigned Role").selectOption("MANAGER");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText(`Updated ${email}.`)).toBeVisible();

  await page.getByRole("button", { name: "Reset Password to admin123" }).click();
  await expect(page.getByText("Password reset to admin123.")).toBeVisible();

  await page.getByRole("button", { name: "Sign Out" }).click();
  await loginWithCredentials(page, email, "admin123");
  await expect(page.getByRole("heading", { name: "GT Orders & Stocks" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Customers", exact: true }).first()).toBeVisible();
});
