const request = require("supertest");
const { connect, closeDatabase, clearDatabase } = require("./setup");

jest.setTimeout(30000);

let app;

beforeAll(async () => {
  await connect();
  // app.js only requires ./sockets lazily inside request handlers that
  // need it (ride/payment controllers) — none of which these auth-only
  // tests touch, so it's safe to load the app without initSocket().
  app = require("../../src/app");
});
afterAll(async () => closeDatabase());
afterEach(async () => clearDatabase());

describe("POST /api/auth/refresh", () => {
  async function registerPassenger(agent) {
    return agent.post("/api/auth/register").send({
      name: "Refresh Test",
      email: `refresh-${Date.now()}@test.com`,
      phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      password: "Password123",
    });
  }

  it("issues a new access token given a valid refresh token cookie", async () => {
    const agent = request.agent(app);
    const registerRes = await registerPassenger(agent);
    expect(registerRes.status).toBe(201);

    const refreshRes = await agent.post("/api/auth/refresh");
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();
  });

  it("rejects a missing refresh token", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects a garbage/invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", ["refreshToken=not.a.valid.jwt"]);
    expect(res.status).toBe(401);
  });

  it("rejects a refresh token after logout (session invalidated)", async () => {
    const agent = request.agent(app);
    await registerPassenger(agent);
    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);

    const refreshRes = await agent.post("/api/auth/refresh");
    expect(refreshRes.status).toBe(401);
  });

  it("rotates the refresh token so the previous one cannot be reused", async () => {
    const agent = request.agent(app);
    const registerRes = await registerPassenger(agent);
    const originalRefreshToken = registerRes.body.data.refreshToken;

    // First refresh should succeed and rotate the cookie.
    const firstRefresh = await agent.post("/api/auth/refresh");
    expect(firstRefresh.status).toBe(200);

    // Replaying the ORIGINAL (now-superseded) refresh token should fail.
    const replay = await request(app).post("/api/auth/refresh").send({ refreshToken: originalRefreshToken });
    expect(replay.status).toBe(401);
  });


});
