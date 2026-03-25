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

function wantsHtml(request) {
  const accept = String(request.headers.accept || "").toLowerCase();
  return accept.includes("text/html") || accept.includes("application/xhtml+xml");
}

function renderErrorPage({ appName, title, code, message, hint }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} - ${appName}</title>
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />
    <link rel="stylesheet" href="/public/styles.css" />
  </head>
  <body>
    <div class="auth-shell">
      <section class="auth-card narrow-card">
        <div class="auth-header">
          <div class="brand-block">
            <span class="brand-mark">T</span>
            <div>
              <div class="eyebrow">System</div>
              <div class="brand-name">${appName}</div>
            </div>
          </div>
          <h1>${code}</h1>
          <p>${message}</p>
        </div>
        <div class="info-card">
          <div class="eyebrow">What Now</div>
          <p>${hint}</p>
          <div class="hero-actions dashboard-actions">
            <a class="primary-button" href="/">Return to workspace</a>
            <a class="ghost-button" href="/settings">Open settings</a>
          </div>
        </div>
      </section>
    </div>
  </body>
</html>`;
}

app.setNotFoundHandler((request, reply) => {
  if (!wantsHtml(request)) {
    reply.code(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "Route not found"
    });
    return;
  }

  reply
    .code(404)
    .type("text/html")
    .send(renderErrorPage({
      appName: config.appName,
      title: "404",
      code: "404",
      message: "This page does not exist in your workspace.",
      hint: "The link may be outdated, or the page may have been removed while the rest of the project kept moving."
    }));
});

app.setErrorHandler((error, request, reply) => {
  app.log.error(error);

  const statusCode = Number(error.statusCode || error.status || 500);
  if (!wantsHtml(request) || reply.sent) {
    reply.code(statusCode).send({
      statusCode,
      error: statusCode >= 500 ? "Internal Server Error" : "Request Error",
      message: error.message || "Unexpected error"
    });
    return;
  }

  reply
    .code(statusCode)
    .type("text/html")
    .send(renderErrorPage({
      appName: config.appName,
      title: String(statusCode),
      code: String(statusCode),
      message: statusCode === 404
        ? "This page does not exist in your workspace."
        : statusCode === 403
          ? "This page is available to administrators only."
          : "Something went wrong while rendering the page.",
      hint: statusCode === 404
        ? "Check the address and try again, or head back to the main workspace."
        : statusCode === 403
          ? "Sign in with an admin account or go back to a section that belongs to your current role."
          : "Try refreshing the page. If it happens again, check the server logs for the failing route."
    }));
});

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
