import { describe, expect, it } from "#test-compat";

describe("router", () => {
  describe("createRouter with parameterized routes", () => {
    it("extracts :id params (digits only)", async () => {
      const { createRouter } = await import("#routes/router.ts");
      let captured: Record<string, string | undefined> = {};
      const router = createRouter({
        "GET /item/:id": (_req, params) => {
          captured = params;
          return new Response("ok");
        },
      });
      await router(new Request("http://localhost/item/42"), "/item/42", "GET");
      expect(captured.id).toBe("42");
    });

    it("extracts named Id params (digits only)", async () => {
      const { createRouter } = await import("#routes/router.ts");
      let captured: Record<string, string | undefined> = {};
      const router = createRouter({
        "GET /board/:boardId/category/:catId": (_req, params) => {
          captured = params;
          return new Response("ok");
        },
      });
      await router(
        new Request("http://localhost/board/5/category/10"),
        "/board/5/category/10",
        "GET",
      );
      expect(captured.boardId).toBe("5");
      expect(captured.catId).toBe("10");
    });

    it("extracts non-Id params (any non-slash chars)", async () => {
      const { createRouter } = await import("#routes/router.ts");
      let captured: Record<string, string | undefined> = {};
      const router = createRouter({
        "GET /user/:slug": (_req, params) => {
          captured = params;
          return new Response("ok");
        },
      });
      await router(
        new Request("http://localhost/user/john-doe"),
        "/user/john-doe",
        "GET",
      );
      expect(captured.slug).toBe("john-doe");
    });

    it("returns null for non-matching route", async () => {
      const { createRouter } = await import("#routes/router.ts");
      const router = createRouter({
        "GET /item/:id": () => new Response("ok"),
      });
      const result = await router(
        new Request("http://localhost/other"),
        "/other",
        "GET",
      );
      expect(result).toBeNull();
    });

    it("returns null for non-matching method", async () => {
      const { createRouter } = await import("#routes/router.ts");
      const router = createRouter({
        "GET /item/:id": () => new Response("ok"),
      });
      const result = await router(
        new Request("http://localhost/item/1", { method: "POST" }),
        "/item/1",
        "POST",
      );
      expect(result).toBeNull();
    });
  });
});
