import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function readPackageVersion() {
  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return String(packageJson.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

export function getConfig() {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    appHost: process.env.APP_HOST || "0.0.0.0",
    appPort: Number(process.env.APP_PORT || 3000),
    appName: process.env.APP_NAME || "terminux",
    appVersion: process.env.APP_VERSION || readPackageVersion(),
    updateRepo: process.env.UPDATE_REPO || "marchkov/terminux",
    updateCheckIntervalMs: 24 * 60 * 60 * 1000,
    masterKey: process.env.APP_MASTER_KEY || "development-master-key",
    sessionSecret: process.env.SESSION_SECRET || "development-session-secret-32-chars-min",
    sqlitePath: path.resolve(projectRoot, process.env.SQLITE_PATH || "./storage/database.sqlite"),
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "admin123",
    projectRoot
  };
}
