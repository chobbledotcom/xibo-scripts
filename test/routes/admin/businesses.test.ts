import { afterEach, beforeEach, describe, expect, it } from "#test-compat";
import { getAllActivityLog } from "#lib/db/activityLog.ts";
import {
  assignUserToBusiness,
  createBusiness,
  deleteBusiness,
  getAllBusinesses,
  getBusinessById,
  getBusinessesForUser,
  getBusinessUserIds,
  removeUserFromBusiness,
  toDisplayBusiness,
  updateBusiness,
  updateBusinessXiboIds,
} from "#lib/db/businesses.ts";
import { createScreen, getScreensForBusiness } from "#lib/db/screens.ts";
import { encrypt } from "#lib/crypto.ts";
import { getDb } from "#lib/db/client.ts";
import { updateXiboCredentials } from "#lib/db/settings.ts";
import { clearToken } from "#xibo/client.ts";
import { cacheInvalidateAll } from "#xibo/cache.ts";
import {
  awaitTestRequest,
  createActivateAndLogin,
  createMockFetch,
  createTestDbWithSetup,
  handle,
  jsonResponse,
  loginAsAdmin,
  mockFormRequest,
  mockRequest,
  resetDb,
  restoreFetch,
} from "#test-utils";

const XIBO_URL = "https://xibo.test";

describe("admin businesses management", () => {
  let cookie: string;
  let csrfToken: string;

  beforeEach(async () => {
    Deno.env.set("ALLOWED_DOMAIN", "localhost");
    await createTestDbWithSetup();
    const login = await loginAsAdmin();
    cookie = login.cookie;
    csrfToken = login.csrfToken;
  });

  afterEach(() => {
    restoreFetch();
    clearToken();
    resetDb();
  });

  describe("businesses DB operations", () => {
    it("createBusiness creates a business with encrypted fields", async () => {
      const business = await createBusiness("Test Cafe");
      expect(business.id).toBe(1);
      expect(business.xibo_folder_id).toBeNull();
      expect(business.xibo_dataset_id).toBeNull();

      const display = await toDisplayBusiness(business);
      expect(display.name).toBe("Test Cafe");
      expect(display.created_at).toContain("T");
    });

    it("getBusinessById returns null for nonexistent", async () => {
      const result = await getBusinessById(999);
      expect(result).toBeNull();
    });

    it("getAllBusinesses returns all businesses", async () => {
      await createBusiness("Biz A");
      await createBusiness("Biz B");
      const all = await getAllBusinesses();
      expect(all.length).toBe(2);
    });

    it("updateBusiness changes the name", async () => {
      const biz = await createBusiness("Old Name");
      await updateBusiness(biz.id, "New Name");
      const updated = await getBusinessById(biz.id);
      const display = await toDisplayBusiness(updated!);
      expect(display.name).toBe("New Name");
    });

    it("updateBusinessXiboIds sets folder and dataset IDs", async () => {
      const biz = await createBusiness("With Xibo");
      await updateBusinessXiboIds(biz.id, 42, "folder-abc", 99);
      const updated = await getBusinessById(biz.id);
      expect(updated!.xibo_folder_id).toBe(42);
      expect(updated!.xibo_dataset_id).toBe(99);
      const display = await toDisplayBusiness(updated!);
      expect(display.folder_name).toBe("folder-abc");
    });

    it("deleteBusiness cascades to screens and business_users", async () => {
      const biz = await createBusiness("To Delete");
      // Create a screen
      await getDb().execute({
        sql: "INSERT INTO screens (name, business_id, created_at) VALUES (?, ?, ?)",
        args: [await encrypt("screen1"), biz.id, await encrypt(new Date().toISOString())],
      });
      // Assign a user
      await assignUserToBusiness(biz.id, 1);

      await deleteBusiness(biz.id);

      expect(await getBusinessById(biz.id)).toBeNull();
      expect((await getScreensForBusiness(biz.id)).length).toBe(0);
      expect((await getBusinessUserIds(biz.id)).length).toBe(0);
    });

    it("assignUserToBusiness and removeUserFromBusiness work", async () => {
      const biz = await createBusiness("User Biz");
      await assignUserToBusiness(biz.id, 1);

      let ids = await getBusinessUserIds(biz.id);
      expect(ids).toContain(1);

      await removeUserFromBusiness(biz.id, 1);
      ids = await getBusinessUserIds(biz.id);
      expect(ids.length).toBe(0);
    });

    it("assignUserToBusiness is idempotent (INSERT OR IGNORE)", async () => {
      const biz = await createBusiness("Idempotent Biz");
      await assignUserToBusiness(biz.id, 1);
      await assignUserToBusiness(biz.id, 1); // Should not throw
      const ids = await getBusinessUserIds(biz.id);
      expect(ids.length).toBe(1);
    });

    it("getBusinessesForUser returns businesses assigned to a user", async () => {
      const biz1 = await createBusiness("User Biz 1");
      const biz2 = await createBusiness("User Biz 2");
      await createBusiness("Other Biz");

      await assignUserToBusiness(biz1.id, 1);
      await assignUserToBusiness(biz2.id, 1);

      const businesses = await getBusinessesForUser(1);
      expect(businesses.length).toBe(2);

      const display1 = await toDisplayBusiness(businesses[0]!);
      const display2 = await toDisplayBusiness(businesses[1]!);
      expect(display1.name).toBe("User Biz 1");
      expect(display2.name).toBe("User Biz 2");
    });

    it("getBusinessesForUser returns empty for user with no businesses", async () => {
      await createBusiness("No Assign");
      const businesses = await getBusinessesForUser(999);
      expect(businesses.length).toBe(0);
    });
  });

  describe("GET /admin/businesses", () => {
    it("redirects to login when not authenticated", async () => {
      const response = await handle(mockRequest("/admin/businesses"));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    it("returns 403 for user-role session", async () => {
      const user = await createActivateAndLogin("basicuser", "user", "userpass123");
      const response = await awaitTestRequest("/admin/businesses", {
        cookie: user.cookie,
      });
      expect(response.status).toBe(403);
    });

    it("shows businesses list when authenticated as owner", async () => {
      await createBusiness("My Cafe");
      const response = await awaitTestRequest("/admin/businesses", { cookie });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Businesses");
      expect(html).toContain("My Cafe");
    });

    it("shows empty state when no businesses exist", async () => {
      const response = await awaitTestRequest("/admin/businesses", { cookie });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("No businesses yet");
    });

    it("shows success message from query param", async () => {
      const response = await awaitTestRequest(
        "/admin/businesses?success=Business+created+successfully",
        { cookie },
      );
      const html = await response.text();
      expect(html).toContain("Business created successfully");
    });

    it("manager can access businesses list", async () => {
      const mgr = await createActivateAndLogin("mgr1", "manager", "mgrpass123");
      const response = await awaitTestRequest("/admin/businesses", {
        cookie: mgr.cookie,
      });
      expect(response.status).toBe(200);
    });
  });

  describe("GET /admin/business/create", () => {
    it("shows create form", async () => {
      const response = await awaitTestRequest("/admin/business/create", {
        cookie,
      });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Create Business");
    });
  });

  describe("POST /admin/business/create", () => {
    it("redirects when not authenticated", async () => {
      const response = await handle(
        mockFormRequest("/admin/business/create", { name: "Test" }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/admin");
    });

    it("redirects to settings when Xibo is not configured", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/business/create",
          { name: "New Biz", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(location).toContain("/admin/settings");

      // Business should NOT be created without Xibo config
      const businesses = await getAllBusinesses();
      expect(businesses.length).toBe(0);
    });

    it("rejects missing name", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/business/create",
          { name: "", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });

    it("logs activity on business creation", async () => {
      await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
      clearToken();
      await cacheInvalidateAll();

      globalThis.fetch = createMockFetch({
        "/api/folder": () =>
          jsonResponse({ folderId: 10, text: "test-folder", parentId: null, children: [] }),
        "/api/dataset": (url) => {
          if (url.includes("/column")) {
            return jsonResponse({ dataSetColumnId: 1, heading: "col" });
          }
          return jsonResponse({ dataSetId: 20, dataSet: "test-ds", description: "", code: "", columnCount: 0 });
        },
      });

      await handle(
        mockFormRequest(
          "/admin/business/create",
          { name: "Audit Biz", csrf_token: csrfToken },
          cookie,
        ),
      );
      const logs = await getAllActivityLog();
      const createLog = logs.find((l) => l.message.includes("Created business"));
      expect(createLog).not.toBeNull();
      expect(createLog!.message).toContain("Audit Biz");
    });
  });

  describe("GET /admin/business/:id", () => {
    it("shows business detail page", async () => {
      const biz = await createBusiness("Detail Biz");
      const response = await awaitTestRequest(`/admin/business/${biz.id}`, {
        cookie,
      });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Detail Biz");
      expect(html).toContain("Screens");
      expect(html).toContain("Assigned Users");
    });

    it("returns 404 for nonexistent business", async () => {
      const response = await awaitTestRequest("/admin/business/999", {
        cookie,
      });
      expect(response.status).toBe(404);
    });

    it("shows success message from query param", async () => {
      const biz = await createBusiness("Success Biz");
      const response = await awaitTestRequest(
        `/admin/business/${biz.id}?success=Updated`,
        { cookie },
      );
      const html = await response.text();
      expect(html).toContain("Updated");
    });
  });

  describe("POST /admin/business/:id (update)", () => {
    it("updates business name", async () => {
      const biz = await createBusiness("Old Biz");
      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}`,
          { name: "Updated Biz", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const updated = await getBusinessById(biz.id);
      const display = await toDisplayBusiness(updated!);
      expect(display.name).toBe("Updated Biz");
    });

    it("returns 404 for nonexistent business", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/business/999",
          { name: "Test", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });

    it("returns 400 for invalid form data", async () => {
      const biz = await createBusiness("Valid Biz");
      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}`,
          { name: "", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("POST /admin/business/:id/delete", () => {
    it("deletes business and redirects", async () => {
      const biz = await createBusiness("Delete Me");
      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}/delete`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("deleted");

      expect(await getBusinessById(biz.id)).toBeNull();
    });

    it("returns 404 for nonexistent business", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/business/999/delete",
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });

    it("logs activity on deletion", async () => {
      const biz = await createBusiness("Log Delete");
      await handle(
        mockFormRequest(
          `/admin/business/${biz.id}/delete`,
          { csrf_token: csrfToken },
          cookie,
        ),
      );
      const logs = await getAllActivityLog();
      const deleteLog = logs.find((l) => l.message.includes("Deleted business"));
      expect(deleteLog).not.toBeNull();
    });
  });

  describe("POST /admin/business/:id/assign-user", () => {
    it("assigns a user-role user to a business", async () => {
      const biz = await createBusiness("Assign Biz");
      const user = await createActivateAndLogin("assignee", "user", "userpass123");

      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}/assign-user`,
          { user_id: String(user.userId), csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("User assigned");

      const ids = await getBusinessUserIds(biz.id);
      expect(ids).toContain(user.userId);
    });

    it("rejects non-user-role assignment", async () => {
      const biz = await createBusiness("Reject Biz");
      // User ID 1 is the owner
      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}/assign-user`,
          { user_id: "1", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("Only user-role");
    });

    it("rejects missing user_id", async () => {
      const biz = await createBusiness("No User Biz");
      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}/assign-user`,
          { user_id: "", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("Please select a user");
    });

    it("rejects nonexistent user", async () => {
      const biz = await createBusiness("Bad User Biz");
      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}/assign-user`,
          { user_id: "999", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("User not found");
    });

    it("returns 404 for nonexistent business", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/business/999/assign-user",
          { user_id: "1", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("POST /admin/business/:id/remove-user", () => {
    it("removes a user from a business", async () => {
      const biz = await createBusiness("Remove Biz");
      const user = await createActivateAndLogin("removee", "user", "userpass123");
      await assignUserToBusiness(biz.id, user.userId);

      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}/remove-user`,
          { user_id: String(user.userId), csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("User removed");

      const ids = await getBusinessUserIds(biz.id);
      expect(ids.length).toBe(0);
    });

    it("rejects missing user_id", async () => {
      const biz = await createBusiness("No Remove Biz");
      const response = await handle(
        mockFormRequest(
          `/admin/business/${biz.id}/remove-user`,
          { user_id: "", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("Invalid user");
    });

    it("returns 404 for nonexistent business", async () => {
      const response = await handle(
        mockFormRequest(
          "/admin/business/999/remove-user",
          { user_id: "1", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("business detail shows assigned users and available users", () => {
    it("shows assigned users in the detail page", async () => {
      const biz = await createBusiness("Users Biz");
      const user = await createActivateAndLogin("displayuser", "user", "userpass123");
      await assignUserToBusiness(biz.id, user.userId);

      const response = await awaitTestRequest(`/admin/business/${biz.id}`, {
        cookie,
      });
      const html = await response.text();
      expect(html).toContain("displayuser");
      expect(html).toContain("Remove");
    });

    it("shows available users for assignment", async () => {
      const biz = await createBusiness("Available Biz");
      await createActivateAndLogin("availuser", "user", "userpass123");

      const response = await awaitTestRequest(`/admin/business/${biz.id}`, {
        cookie,
      });
      const html = await response.text();
      expect(html).toContain("Assign User");
      expect(html).toContain("availuser");
    });
  });

  describe("business detail with screens", () => {
    it("shows screen table when screens exist", async () => {
      const biz = await createBusiness("Screen Biz");
      await createScreen("Screen Alpha", biz.id, 42);
      await createScreen("Screen Beta", biz.id, null);

      const response = await awaitTestRequest(`/admin/business/${biz.id}`, {
        cookie,
      });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Screen Alpha");
      expect(html).toContain("Screen Beta");
      expect(html).toContain("42");
      expect(html).toContain("Delete");
    });
  });

  describe("Xibo provisioning on business create", () => {
    it("provisions Xibo folder and dataset when config is available", async () => {
      await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
      clearToken();
      await cacheInvalidateAll();

      let folderCreated = false;
      let datasetCreated = false;
      let columnsCreated = 0;

      globalThis.fetch = createMockFetch({
        "/api/folder": () => {
          folderCreated = true;
          return jsonResponse({ folderId: 10, text: "test-folder", parentId: null, children: [] });
        },
        "/api/dataset": (url) => {
          if (url.includes("/column")) {
            columnsCreated++;
            return jsonResponse({ dataSetColumnId: columnsCreated, heading: "col" });
          }
          datasetCreated = true;
          return jsonResponse({ dataSetId: 20, dataSet: "test-ds", description: "", code: "", columnCount: 0 });
        },
      });

      const response = await handle(
        mockFormRequest(
          "/admin/business/create",
          { name: "Provisioned Biz", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("Business created successfully");
      expect(folderCreated).toBe(true);
      expect(datasetCreated).toBe(true);
      expect(columnsCreated).toBe(5);

      // Verify Xibo IDs were stored
      const businesses = await getAllBusinesses();
      expect(businesses[0]!.xibo_folder_id).toBe(10);
      expect(businesses[0]!.xibo_dataset_id).toBe(20);
    });

    it("does not create business when Xibo API fails", async () => {
      await updateXiboCredentials(XIBO_URL, "test-id", "test-secret");
      clearToken();
      await cacheInvalidateAll();

      globalThis.fetch = createMockFetch({
        "/api/folder": () =>
          new Response("Server Error", { status: 500 }),
      });

      const response = await handle(
        mockFormRequest(
          "/admin/business/create",
          { name: "Failed Provision", csrf_token: csrfToken },
          cookie,
        ),
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location")!;
      expect(decodeURIComponent(location)).toContain("Xibo provisioning failed");
      expect(location).toContain("error=");

      // Business should NOT be created when provisioning fails
      const businesses = await getAllBusinesses();
      expect(businesses.length).toBe(0);
    });
  });

  describe("businesses list shows error from query param", () => {
    it("shows error message from query param", async () => {
      const response = await awaitTestRequest(
        "/admin/businesses?error=Something+went+wrong",
        { cookie },
      );
      const html = await response.text();
      expect(html).toContain("Something went wrong");
    });
  });
});
