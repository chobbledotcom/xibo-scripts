import { describe, expect, it } from "#test-compat";
import { escapeHtml, Layout } from "#templates/layout.tsx";
import { adminDashboardPage } from "#templates/admin/dashboard.tsx";
import { adminLoginPage } from "#templates/admin/login.tsx";
import { setupPage, setupCompletePage } from "#templates/setup.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";
import {
  mediaListPage,
  mediaUploadPage,
  mediaDetailPage,
} from "#templates/admin/media.tsx";
import type { AdminSession } from "#lib/types.ts";
import type {
  DashboardStatus,
  XiboMedia,
  XiboFolder,
} from "#xibo/types.ts";
import {
  loginFields,
  setupFields,
  changePasswordFields,
  xiboCredentialsFields,
  validateUsername,
} from "#templates/fields.ts";

const ownerSession: AdminSession = { csrfToken: "csrf-123", adminLevel: "owner" };
const managerSession: AdminSession = { csrfToken: "csrf-456", adminLevel: "manager" };

describe("Layout", () => {
  it("includes DOCTYPE", () => {
    const html = String(Layout({ title: "Test" }));
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("includes title with ' - Xibo Scripts' suffix", () => {
    const html = String(Layout({ title: "Test" }));
    expect(html).toContain("<title>Test - Xibo Scripts</title>");
  });

  it("includes CSS and JS asset paths", () => {
    const html = String(Layout({ title: "X" }));
    expect(html).toContain("mvp.css");
    expect(html).toContain("admin.js");
  });

  it("applies bodyClass when provided", () => {
    const html = String(Layout({ title: "X", bodyClass: "dark-mode" }));
    expect(html).toContain('class="dark-mode"');
  });

  it("renders headExtra when provided", () => {
    const html = String(
      Layout({ title: "X", headExtra: '<meta name="test" content="val">' }),
    );
    expect(html).toContain('name="test"');
  });
});

describe("AdminNav", () => {
  it("shows Settings/Sessions/Users links for owner", () => {
    const html = String(AdminNav({ session: ownerSession }));
    expect(html).toContain("/admin/settings");
    expect(html).toContain("/admin/sessions");
    expect(html).toContain("/admin/users");
  });

  it("hides Settings/Sessions/Users links for manager", () => {
    const html = String(AdminNav({ session: managerSession }));
    expect(html).not.toContain("/admin/settings");
    expect(html).not.toContain("/admin/sessions");
    expect(html).not.toContain("/admin/users");
  });

  it("always shows Dashboard, Media, Layouts, Datasets, Logout", () => {
    const html = String(AdminNav({ session: managerSession }));
    expect(html).toContain("/admin/");
    expect(html).toContain("/admin/media");
    expect(html).toContain("/admin/layouts");
    expect(html).toContain("/admin/datasets");
    expect(html).toContain("/admin/logout");
  });
});

describe("Breadcrumb", () => {
  it("renders link with href and label", () => {
    const html = String(Breadcrumb({ href: "/admin/layouts", label: "Back to Layouts" }));
    expect(html).toContain('href="/admin/layouts"');
    expect(html).toContain("Back to Layouts");
  });
});

describe("adminLoginPage", () => {
  it("renders login form with username and password fields", () => {
    const html = adminLoginPage();
    expect(html).toContain('name="username"');
    expect(html).toContain('name="password"');
    expect(html).toContain('action="/admin/login"');
  });

  it("shows error message when provided", () => {
    const html = adminLoginPage("Bad credentials");
    expect(html).toContain("Bad credentials");
    expect(html).toContain('class="error"');
  });

  it("shows no error div when no error", () => {
    const html = adminLoginPage();
    expect(html).not.toContain('class="error"');
  });
});

describe("adminDashboardPage", () => {
  const disconnected: DashboardStatus = {
    connected: false,
    version: null,
    mediaCount: null,
    layoutCount: null,
    datasetCount: null,
  };

  const connected: DashboardStatus = {
    connected: true,
    version: "3.1.0",
    mediaCount: 12,
    layoutCount: 3,
    datasetCount: 2,
  };

  it("shows 'Not connected' with link to settings when disconnected", () => {
    const html = adminDashboardPage(ownerSession, disconnected);
    expect(html).toContain("Not connected");
    expect(html).toContain("/admin/settings");
  });

  it("shows 'Connected' with CMS version when connected", () => {
    const html = adminDashboardPage(ownerSession, connected);
    expect(html).toContain("Connected");
    expect(html).toContain("3.1.0");
  });

  it("shows resource counts table when connected", () => {
    const html = adminDashboardPage(ownerSession, connected);
    expect(html).toContain("12");
    expect(html).toContain("3");
  });

  it("shows Quick Links", () => {
    const html = adminDashboardPage(ownerSession, disconnected);
    expect(html).toContain("Quick Links");
    expect(html).toContain("/admin/media");
  });
});

describe("setupPage", () => {
  it("renders setup form with admin fields", () => {
    const html = setupPage();
    expect(html).toContain("Initial Setup");
    expect(html).toContain("admin_username");
    expect(html).toContain("admin_password");
  });

  it("shows error message when provided", () => {
    const html = setupPage("Something failed");
    expect(html).toContain("Something failed");
  });

  it("includes CSRF hidden field when csrfToken provided", () => {
    const html = setupPage(undefined, "tok-123");
    expect(html).toContain('name="csrf_token"');
    expect(html).toContain('value="tok-123"');
  });
});

describe("setupCompletePage", () => {
  it("shows success message and link to admin", () => {
    const html = setupCompletePage();
    expect(html).toContain("Setup Complete");
    expect(html).toContain("/admin/");
  });
});

describe("field definitions", () => {
  it("loginFields has username and password", () => {
    const names = loginFields.map((f) => f.name);
    expect(names).toContain("username");
    expect(names).toContain("password");
  });

  it("setupFields has all required fields", () => {
    const names = setupFields.map((f) => f.name);
    expect(names).toContain("admin_username");
    expect(names).toContain("admin_password");
    expect(names).toContain("admin_password_confirm");
    expect(names).toContain("xibo_api_url");
  });

  it("changePasswordFields has current, new, confirm", () => {
    const names = changePasswordFields.map((f) => f.name);
    expect(names).toContain("current_password");
    expect(names).toContain("new_password");
    expect(names).toContain("new_password_confirm");
  });

  it("xiboCredentialsFields has url, client_id, client_secret", () => {
    const names = xiboCredentialsFields.map((f) => f.name);
    expect(names).toContain("xibo_api_url");
    expect(names).toContain("xibo_client_id");
    expect(names).toContain("xibo_client_secret");
  });

  describe("validateUsername", () => {
    it("rejects username shorter than 2 chars", () => {
      expect(validateUsername("a")).toContain("at least 2");
    });

    it("rejects username longer than 32 chars", () => {
      expect(validateUsername("a".repeat(33))).toContain("32 characters");
    });

    it("rejects special characters", () => {
      expect(validateUsername("user@name")).toContain("letters, numbers");
    });

    it("accepts valid usernames", () => {
      expect(validateUsername("admin")).toBeNull();
      expect(validateUsername("user-name_123")).toBeNull();
    });
  });
});

describe("escapeHtml", () => {
  it("escapes &, <, >, and \"", () => {
    const input = 'Tom & Jerry <script>"alert"</script>';
    const result = escapeHtml(input);
    expect(result).toContain("&amp;");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
    expect(result).toContain("&quot;");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("&amp;amp;");
  });

  it("returns unchanged string with no special chars", () => {
    const input = "Hello World 123";
    const result = escapeHtml(input);
    expect(result).toBe("Hello World 123");
  });
});

describe("mediaListPage", () => {
  const emptyFolders: XiboFolder[] = [];

  it("renders empty list", () => {
    const html = mediaListPage(ownerSession, [], emptyFolders);
    expect(html).toContain("No media found");
    expect(html).toContain("Media Library");
  });

  it("renders media items with names and sizes", () => {
    const media: XiboMedia[] = [
      {
        mediaId: 1,
        name: "logo.png",
        mediaType: "image",
        storedAs: "1_logo.png",
        fileSize: 2048,
        duration: 10,
        tags: "",
        folderId: 1,
      },
      {
        mediaId: 2,
        name: "intro.mp4",
        mediaType: "video",
        storedAs: "2_intro.mp4",
        fileSize: 5242880,
        duration: 30,
        tags: "promo",
        folderId: 1,
      },
    ];
    const html = mediaListPage(ownerSession, media, emptyFolders);
    expect(html).toContain("logo.png");
    expect(html).toContain("intro.mp4");
    expect(html).toContain("2.0 KB");
    expect(html).toContain("5.0 MB");
    expect(html).toContain("Image");
    expect(html).toContain("Video");
    expect(html).toContain("/admin/media/1");
    expect(html).toContain("/admin/media/2");
  });

  it("shows success message", () => {
    const html = mediaListPage(ownerSession, [], emptyFolders, undefined, undefined, "Upload complete");
    expect(html).toContain("Upload complete");
    expect(html).toContain('class="success"');
  });

  it("shows error message", () => {
    const html = mediaListPage(ownerSession, [], emptyFolders, undefined, undefined, undefined, "Upload failed");
    expect(html).toContain("Upload failed");
    expect(html).toContain('class="error"');
  });
});

describe("mediaUploadPage", () => {
  it("renders upload form", () => {
    const folders: XiboFolder[] = [
      { folderId: 1, text: "Images", parentId: null, children: [] },
    ];
    const html = mediaUploadPage(ownerSession, folders);
    expect(html).toContain("Upload Media");
    expect(html).toContain('action="/admin/media/upload"');
    expect(html).toContain('enctype="multipart/form-data"');
    expect(html).toContain('type="file"');
    expect(html).toContain('name="file"');
    expect(html).toContain("Images");
    expect(html).toContain("Upload from URL");
    expect(html).toContain('action="/admin/media/upload-url"');
    expect(html).toContain('value="csrf-123"');
  });
});

describe("mediaDetailPage", () => {
  it("renders media detail with properties", () => {
    const media: XiboMedia = {
      mediaId: 42,
      name: "banner.png",
      mediaType: "image",
      storedAs: "42_banner.png",
      fileSize: 102400,
      duration: 15,
      tags: "promo,banner",
      folderId: 3,
    };
    const html = mediaDetailPage(ownerSession, media);
    expect(html).toContain("banner.png");
    expect(html).toContain("Image");
    expect(html).toContain("100.0 KB");
    expect(html).toContain("15s");
    expect(html).toContain("42_banner.png");
    expect(html).toContain("promo,banner");
    expect(html).toContain("42");
    expect(html).toContain("/admin/media/42/preview");
    expect(html).toContain("/admin/media/42/delete");
    expect(html).toContain("Delete Media");
  });
});
