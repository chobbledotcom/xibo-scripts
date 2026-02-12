import { describe, expect, it } from "#test-compat";
import {
  authorize,
  isManagerOrAbove,
  isOwner,
  type AuthAction,
  type AuthResource,
} from "#lib/authorize.ts";

describe("authorize", () => {
  const owner = { adminLevel: "owner" as const, userId: 1 };
  const manager = { adminLevel: "manager" as const, userId: 2 };
  const user = { adminLevel: "user" as const, userId: 3 };

  describe("owner permissions", () => {
    const allActions: AuthAction[] = ["read", "create", "update", "delete", "manage"];
    const allResources: AuthResource[] = [
      "business",
      "screen",
      "user",
      "media",
      "shared_media",
      "menu_screen",
      "product",
      "settings",
      "sessions",
      "audit_log",
    ];

    it("allows all actions on all resources", () => {
      for (const action of allActions) {
        for (const resource of allResources) {
          expect(authorize(owner, action, resource)).toBe(true);
        }
      }
    });
  });

  describe("manager permissions", () => {
    it("cannot access settings", () => {
      expect(authorize(manager, "read", "settings")).toBe(false);
      expect(authorize(manager, "update", "settings")).toBe(false);
      expect(authorize(manager, "manage", "settings")).toBe(false);
    });

    it("cannot access sessions", () => {
      expect(authorize(manager, "read", "sessions")).toBe(false);
      expect(authorize(manager, "manage", "sessions")).toBe(false);
    });

    it("can read audit_log but not manage", () => {
      expect(authorize(manager, "read", "audit_log")).toBe(true);
      expect(authorize(manager, "manage", "audit_log")).toBe(false);
      expect(authorize(manager, "create", "audit_log")).toBe(false);
      expect(authorize(manager, "delete", "audit_log")).toBe(false);
    });

    it("can create, read, and update users but not delete", () => {
      expect(authorize(manager, "read", "user")).toBe(true);
      expect(authorize(manager, "create", "user")).toBe(true);
      expect(authorize(manager, "update", "user")).toBe(true);
      expect(authorize(manager, "delete", "user")).toBe(false);
    });

    it("can CRUD businesses", () => {
      expect(authorize(manager, "read", "business")).toBe(true);
      expect(authorize(manager, "create", "business")).toBe(true);
      expect(authorize(manager, "update", "business")).toBe(true);
      expect(authorize(manager, "delete", "business")).toBe(true);
    });

    it("can CRUD screens", () => {
      expect(authorize(manager, "read", "screen")).toBe(true);
      expect(authorize(manager, "create", "screen")).toBe(true);
      expect(authorize(manager, "update", "screen")).toBe(true);
      expect(authorize(manager, "delete", "screen")).toBe(true);
    });

    it("can CRUD media", () => {
      expect(authorize(manager, "read", "media")).toBe(true);
      expect(authorize(manager, "create", "media")).toBe(true);
      expect(authorize(manager, "update", "media")).toBe(true);
      expect(authorize(manager, "delete", "media")).toBe(true);
    });

    it("can CRUD shared_media", () => {
      expect(authorize(manager, "read", "shared_media")).toBe(true);
      expect(authorize(manager, "create", "shared_media")).toBe(true);
      expect(authorize(manager, "update", "shared_media")).toBe(true);
      expect(authorize(manager, "delete", "shared_media")).toBe(true);
    });

    it("can CRUD products", () => {
      expect(authorize(manager, "read", "product")).toBe(true);
      expect(authorize(manager, "create", "product")).toBe(true);
      expect(authorize(manager, "update", "product")).toBe(true);
      expect(authorize(manager, "delete", "product")).toBe(true);
    });

    it("can CRUD menu_screens", () => {
      expect(authorize(manager, "read", "menu_screen")).toBe(true);
      expect(authorize(manager, "create", "menu_screen")).toBe(true);
      expect(authorize(manager, "update", "menu_screen")).toBe(true);
      expect(authorize(manager, "delete", "menu_screen")).toBe(true);
    });
  });

  describe("user permissions", () => {
    it("can CRUD products (except manage)", () => {
      expect(authorize(user, "read", "product")).toBe(true);
      expect(authorize(user, "create", "product")).toBe(true);
      expect(authorize(user, "update", "product")).toBe(true);
      expect(authorize(user, "delete", "product")).toBe(true);
      expect(authorize(user, "manage", "product")).toBe(false);
    });

    it("can CRUD menu_screens (except manage)", () => {
      expect(authorize(user, "read", "menu_screen")).toBe(true);
      expect(authorize(user, "create", "menu_screen")).toBe(true);
      expect(authorize(user, "update", "menu_screen")).toBe(true);
      expect(authorize(user, "delete", "menu_screen")).toBe(true);
      expect(authorize(user, "manage", "menu_screen")).toBe(false);
    });

    it("can CRUD media (except manage)", () => {
      expect(authorize(user, "read", "media")).toBe(true);
      expect(authorize(user, "create", "media")).toBe(true);
      expect(authorize(user, "update", "media")).toBe(true);
      expect(authorize(user, "delete", "media")).toBe(true);
      expect(authorize(user, "manage", "media")).toBe(false);
    });

    it("can only read businesses", () => {
      expect(authorize(user, "read", "business")).toBe(true);
      expect(authorize(user, "create", "business")).toBe(false);
      expect(authorize(user, "update", "business")).toBe(false);
      expect(authorize(user, "delete", "business")).toBe(false);
    });

    it("can only read screens", () => {
      expect(authorize(user, "read", "screen")).toBe(true);
      expect(authorize(user, "create", "screen")).toBe(false);
      expect(authorize(user, "update", "screen")).toBe(false);
      expect(authorize(user, "delete", "screen")).toBe(false);
    });

    it("cannot access settings", () => {
      expect(authorize(user, "read", "settings")).toBe(false);
      expect(authorize(user, "manage", "settings")).toBe(false);
    });

    it("cannot access sessions", () => {
      expect(authorize(user, "read", "sessions")).toBe(false);
      expect(authorize(user, "manage", "sessions")).toBe(false);
    });

    it("cannot access audit_log", () => {
      expect(authorize(user, "read", "audit_log")).toBe(false);
      expect(authorize(user, "manage", "audit_log")).toBe(false);
    });

    it("cannot access shared_media", () => {
      expect(authorize(user, "read", "shared_media")).toBe(false);
      expect(authorize(user, "create", "shared_media")).toBe(false);
    });

    it("cannot access users", () => {
      expect(authorize(user, "read", "user")).toBe(false);
      expect(authorize(user, "create", "user")).toBe(false);
    });
  });

  describe("default deny", () => {
    it("denies unknown admin levels", () => {
      const unknown = { adminLevel: "guest" as "owner", userId: 99 };
      expect(authorize(unknown, "read", "business")).toBe(false);
      expect(authorize(unknown, "read", "settings")).toBe(false);
    });
  });
});

describe("isManagerOrAbove", () => {
  it("returns true for owner", () => {
    expect(isManagerOrAbove("owner")).toBe(true);
  });

  it("returns true for manager", () => {
    expect(isManagerOrAbove("manager")).toBe(true);
  });

  it("returns false for user", () => {
    expect(isManagerOrAbove("user")).toBe(false);
  });
});

describe("isOwner", () => {
  it("returns true for owner", () => {
    expect(isOwner("owner")).toBe(true);
  });

  it("returns false for manager", () => {
    expect(isOwner("manager")).toBe(false);
  });

  it("returns false for user", () => {
    expect(isOwner("user")).toBe(false);
  });
});
