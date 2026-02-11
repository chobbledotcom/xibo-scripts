import { describe, expect, it } from "#test-compat";
import { escapeHtml, Layout } from "#templates/layout.tsx";
import { adminDashboardPage } from "#templates/admin/dashboard.tsx";
import { adminLoginPage } from "#templates/admin/login.tsx";
import { setupPage, setupCompletePage } from "#templates/setup.tsx";
import { AdminNav, Breadcrumb } from "#templates/admin/nav.tsx";
import {
  menuBoardListPage,
  menuBoardDetailPage,
  menuBoardFormPage,
  categoryFormPage,
  productFormPage,
} from "#templates/admin/menuboards.tsx";
import {
  mediaListPage,
  mediaUploadPage,
  mediaDetailPage,
} from "#templates/admin/media.tsx";
import type { AdminSession } from "#lib/types.ts";
import type {
  DashboardStatus,
  XiboMenuBoard,
  XiboCategory,
  XiboProduct,
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

  it("always shows Dashboard, Menu Boards, Media, Layouts, Datasets, Logout", () => {
    const html = String(AdminNav({ session: managerSession }));
    expect(html).toContain("/admin/");
    expect(html).toContain("/admin/menuboards");
    expect(html).toContain("/admin/media");
    expect(html).toContain("/admin/layouts");
    expect(html).toContain("/admin/datasets");
    expect(html).toContain("/admin/logout");
  });
});

describe("Breadcrumb", () => {
  it("renders link with href and label", () => {
    const html = String(Breadcrumb({ href: "/admin/menuboards", label: "Back to Menu Boards" }));
    expect(html).toContain('href="/admin/menuboards"');
    expect(html).toContain("Back to Menu Boards");
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
    menuBoardCount: null,
    mediaCount: null,
    layoutCount: null,
    datasetCount: null,
  };

  const connected: DashboardStatus = {
    connected: true,
    version: "3.1.0",
    menuBoardCount: 5,
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
    expect(html).toContain("5");
    expect(html).toContain("12");
    expect(html).toContain("3");
  });

  it("shows Quick Links", () => {
    const html = adminDashboardPage(ownerSession, disconnected);
    expect(html).toContain("Quick Links");
    expect(html).toContain("/admin/menuboards");
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

describe("menuBoardListPage", () => {
  it("renders empty list with 'No menu boards'", () => {
    const html = menuBoardListPage(ownerSession, []);
    expect(html).toContain("No menu boards");
    expect(html).toContain("Menu Boards");
  });

  it("renders board list with board names", () => {
    const boards: XiboMenuBoard[] = [
      { menuBoardId: 1, name: "Lunch Menu", code: "LM", description: "Lunch items", modifiedDt: "2024-01-01" },
      { menuBoardId: 2, name: "Dinner Menu", code: "DM", description: "Dinner items", modifiedDt: "2024-01-02" },
    ];
    const html = menuBoardListPage(ownerSession, boards);
    expect(html).toContain("Lunch Menu");
    expect(html).toContain("Dinner Menu");
    expect(html).toContain("/admin/menuboard/1");
    expect(html).toContain("/admin/menuboard/2");
    expect(html).toContain("LM");
    expect(html).toContain("DM");
  });

  it("shows success message", () => {
    const html = menuBoardListPage(ownerSession, [], "Board created!");
    expect(html).toContain("Board created!");
    expect(html).toContain('class="success"');
  });

  it("shows error message", () => {
    const html = menuBoardListPage(ownerSession, [], undefined, "Something went wrong");
    expect(html).toContain("Something went wrong");
    expect(html).toContain('class="error"');
  });
});

describe("menuBoardDetailPage", () => {
  it("renders board detail with categories and products", () => {
    const board: XiboMenuBoard = {
      menuBoardId: 10,
      name: "Brunch Board",
      code: "BB",
      description: "Weekend brunch",
      modifiedDt: "2024-03-15",
    };
    const categories: XiboCategory[] = [
      { menuCategoryId: 100, menuId: 10, name: "Beverages", code: "BEV", mediaId: null },
      { menuCategoryId: 101, menuId: 10, name: "Entrees", code: "ENT", mediaId: null },
    ];
    const productsByCategory: Record<number, XiboProduct[]> = {
      100: [
        {
          menuProductId: 1000,
          menuCategoryId: 100,
          name: "Coffee",
          price: "3.50",
          calories: "5",
          allergyInfo: "",
          availability: 1,
          description: "Fresh brewed",
          mediaId: null,
        },
      ],
      101: [],
    };
    const html = menuBoardDetailPage(ownerSession, board, categories, productsByCategory);
    expect(html).toContain("Brunch Board");
    expect(html).toContain("BB");
    expect(html).toContain("Weekend brunch");
    expect(html).toContain("Beverages");
    expect(html).toContain("Entrees");
    expect(html).toContain("Coffee");
    expect(html).toContain("3.50");
    expect(html).toContain("Edit Board");
    expect(html).toContain("Delete Board");
    expect(html).toContain("Add Category");
    expect(html).toContain("Add Product");
    expect(html).toContain("/admin/menuboard/10/edit");
    expect(html).toContain("/admin/menuboard/10/category/100/edit");
  });
});

describe("menuBoardFormPage", () => {
  it("renders new form", () => {
    const html = menuBoardFormPage(ownerSession);
    expect(html).toContain("New Menu Board");
    expect(html).toContain('action="/admin/menuboard"');
    expect(html).toContain("Create");
    expect(html).toContain('name="csrf_token"');
    expect(html).toContain('value="csrf-123"');
  });

  it("renders edit form with board data", () => {
    const board: XiboMenuBoard = {
      menuBoardId: 5,
      name: "Test Board",
      code: "TB",
      description: "A test",
      modifiedDt: "2024-01-01",
    };
    const html = menuBoardFormPage(ownerSession, board);
    expect(html).toContain("Edit Test Board");
    expect(html).toContain('action="/admin/menuboard/5"');
    expect(html).toContain("Save Changes");
    expect(html).toContain('value="csrf-123"');
  });
});

describe("categoryFormPage", () => {
  it("renders new category form", () => {
    const html = categoryFormPage(ownerSession, 10, "My Board");
    expect(html).toContain("New Category");
    expect(html).toContain('action="/admin/menuboard/10/category"');
    expect(html).toContain("Create");
    expect(html).toContain("My Board");
  });

  it("renders edit category form", () => {
    const category: XiboCategory = {
      menuCategoryId: 20,
      menuId: 10,
      name: "Drinks",
      code: "DRK",
      mediaId: null,
    };
    const html = categoryFormPage(ownerSession, 10, "My Board", category);
    expect(html).toContain("Edit Drinks");
    expect(html).toContain('action="/admin/menuboard/10/category/20"');
    expect(html).toContain("Save Changes");
  });
});

describe("productFormPage", () => {
  it("renders new product form", () => {
    const html = productFormPage(ownerSession, 10, "My Board", 20, "Drinks");
    expect(html).toContain("New Product");
    expect(html).toContain('action="/admin/menuboard/10/category/20/product"');
    expect(html).toContain("Create");
    expect(html).toContain("in Drinks");
  });

  it("renders edit product form", () => {
    const product: XiboProduct = {
      menuProductId: 30,
      menuCategoryId: 20,
      name: "Latte",
      price: "4.50",
      calories: "200",
      allergyInfo: "milk",
      availability: 1,
      description: "Creamy latte",
      mediaId: null,
    };
    const html = productFormPage(ownerSession, 10, "My Board", 20, "Drinks", product);
    expect(html).toContain("Edit Latte");
    expect(html).toContain('action="/admin/menuboard/10/category/20/product/30"');
    expect(html).toContain("Save Changes");
    expect(html).toContain("in Drinks");
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
