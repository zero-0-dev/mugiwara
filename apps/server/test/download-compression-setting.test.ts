import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { closeDatabase, db, initDatabase } from "../src/database";
import { createApp } from "../src/app";
import { AuthService } from "../src/auth/service";
import { defaultSettings } from "../src/services/settings-defaults";

let app: ReturnType<typeof createApp>;
let token: string;

beforeAll(async () => {
  initDatabase();
  const auth = new AuthService(db);
  token = (await auth.createToken("compression test", true)).token;
  app = createApp({ authService: auth, webDir: null, host: "127.0.0.1" });
});

afterAll(() => {
  closeDatabase();
});

describe("download compression setting", () => {
  it("defaults to enabled", async () => {
    expect(defaultSettings["download.compressImages"]).toBe("true");

    const response = await request(app)
      .get("/api/settings")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(response.body["download.compressImages"]).toBe("true");
  });

  it("persists through the settings API", async () => {
    await request(app)
      .put("/api/settings/download.compressImages")
      .set({ Authorization: `Bearer ${token}` })
      .send({ value: "false" })
      .expect(200);

    const response = await request(app)
      .get("/api/settings/download.compressImages")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(response.body).toEqual({
      key: "download.compressImages",
      value: "false",
    });
  });
});
