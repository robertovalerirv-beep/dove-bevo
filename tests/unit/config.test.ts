import { describe, expect, it } from "vitest";
import { APP_DOMAIN, APP_NAME } from "../../src/shared/config";

describe("shared config (SPEC 1)", () => {
  it("defines the app name and placeholder domain", () => {
    expect(APP_NAME).toBe("Dove bevo");
    expect(APP_DOMAIN).toBe("dovebevo.example");
  });
});
