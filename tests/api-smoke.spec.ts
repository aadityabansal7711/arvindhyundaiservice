import { expect, test } from "@playwright/test";

test.describe("production API smoke", () => {
  test("protected pages and diagnostics do not leak to anonymous users", async ({ request }) => {
    const bodyshop = await request.get("/bodyshop", { maxRedirects: 0 });
    expect(bodyshop.status()).toBe(307);
    expect(bodyshop.headers()["location"]).toBe("/login");

    for (const path of ["/api/bodyshop-jobs", "/api/dashboard", "/api/supabase-verify"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    }
  });

  test("security headers and request correlation headers are present", async ({ request }) => {
    const response = await request.get("/login");
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["x-request-id"]).toBeTruthy();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=(self)");
  });

  test("mutations reject cross-site and unsupported JSON requests before touching data", async ({ request }) => {
    const crossSite = await request.post("/api/bodyshop-jobs", {
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      data: { id: "SMOKE-NO-WRITE" },
    });
    expect(crossSite.status()).toBe(403);
    expect(await crossSite.json()).toEqual({ error: "Forbidden origin" });

    const unsupported = await request.post("/api/bodyshop-jobs", {
      headers: { "content-type": "text/plain" },
      data: "not-json",
    });
    expect(unsupported.status()).toBe(415);
    expect(await unsupported.json()).toEqual({ error: "Content-Type must be application/json" });
  });
});
