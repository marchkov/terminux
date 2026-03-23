import path from "node:path";

const projectRoot = process.cwd();

export function getConfig() {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    appHost: process.env.APP_HOST || "127.0.0.1",
    appPort: Number(process.env.APP_PORT || 3000),
    appName: process.env.APP_NAME || "terminux",
    masterKey: process.env.APP_MASTER_KEY || "development-master-key",
    sessionSecret: process.env.SESSION_SECRET || "development-session-secret-32-chars-min",
    sqlitePath: path.resolve(projectRoot, process.env.SQLITE_PATH || "./storage/database.sqlite"),
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "admin123",
    projectRoot
  };
}
