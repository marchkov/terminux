import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyFormbody from "@fastify/formbody";
import fastifySession from "@fastify/session";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import path from "node:path";
import { getConfig } from "./config.js";
import { createDatabase } from "./db/index.js";
import { registerTerminalRoutes } from "./routes/terminal.js";
import { registerWebRoutes } from "./routes/web.js";
import { attachCurrentUser } from "./services/auth.js";
import { createTerminalManager } from "./services/terminalManager.js";
import { createTerminalTokenStore } from "./services/terminalTokens.js";
import { ensureAdminUser } from "./services/users.js";

const config = getConfig();
const app = Fastify({
  logger: {
    transport: config.nodeEnv === "development"
      ? {
          target: "pino-pretty"
        }
      : undefined
  }
});

const db = createDatabase(config);
ensureAdminUser(db, config);

app.decorate("config", config);
app.decorate("db", db);
app.decorate("terminalTokens", createTerminalTokenStore());
app.decorate("terminalManager", createTerminalManager({ db, config }));
app.decorateRequest("currentUser", null);

await app.register(fastifyCookie);
await app.register(fastifyFormbody);
await app.register(fastifySession, {
  secret: config.sessionSecret,
  cookie: {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false
  },
  saveUninitialized: false
});
await app.register(fastifyWebsocket);

await app.register(fastifyStatic, {
  root: path.join(config.projectRoot, "src", "public"),
  prefix: "/public/"
});

await app.register(fastifyStatic, {
  root: path.join(config.projectRoot, "node_modules"),
  prefix: "/vendor/",
  decorateReply: false
});

app.addHook("onRequest", attachCurrentUser);

await registerTerminalRoutes(app);
await registerWebRoutes(app, { config });

app.get("/health", async () => ({
  status: "ok",
  app: config.appName
}));

const closeSignals = ["SIGINT", "SIGTERM"];
for (const signal of closeSignals) {
  process.on(signal, async () => {
    try {
      await app.close();
      db.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  });
}

try {
  await app.listen({
    host: config.appHost,
    port: config.appPort
  });
} catch (error) {
  app.log.error(error);
  db.close();
  process.exit(1);
}
