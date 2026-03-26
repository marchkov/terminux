const UPDATE_CACHE_KEY = "update_check_status";
const UPDATE_TIMEOUT_MS = 8000;

let inFlightCheck = null;

function parseVersion(value) {
  const raw = String(value || "").trim().replace(/^v/i, "");
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    raw,
    parts: match.slice(1).map(Number)
  };
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] > right.parts[index]) return 1;
    if (left.parts[index] < right.parts[index]) return -1;
  }

  return 0;
}

function readCache(db) {
  const row = db.prepare(`
    SELECT value_json
    FROM app_meta
    WHERE key = ?
  `).get(UPDATE_CACHE_KEY);

  if (!row) return null;

  try {
    return JSON.parse(row.value_json);
  } catch {
    return null;
  }
}

function writeCache(db, payload) {
  db.prepare(`
    INSERT INTO app_meta (key, value_json, updated_at)
    VALUES (@key, @value_json, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    key: UPDATE_CACHE_KEY,
    value_json: JSON.stringify(payload)
  });
}
async function fetchLatestVersion(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${config.updateRepo}/tags?per_page=20`, {
      headers: {
        "User-Agent": `${config.appName}/${config.appVersion}`,
        Accept: "application/vnd.github+json"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`GitHub request timed out after ${UPDATE_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`GitHub responded with ${response.status}`);
  }

  const tags = await response.json();
  const versions = Array.isArray(tags)
    ? tags.map((tag) => parseVersion(tag?.name)).filter(Boolean).map((version) => version.raw)
    : [];

  if (!versions.length) {
    return null;
  }

  return versions.sort((left, right) => compareVersions(right, left))[0];
}

function buildStatus(config, latestVersion, error = "") {
  const currentVersion = config.appVersion;
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;

  return {
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    hasUpdate,
    checkedAt: new Date().toISOString(),
    error: error || "",
    source: config.updateRepo
  };
}

function hydrateCachedStatus(config, cached) {
  const currentVersion = config.appVersion;
  const latestVersion = cached?.latestVersion || currentVersion;

  return {
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    checkedAt: cached?.checkedAt || "",
    error: cached?.error || "",
    source: cached?.source || config.updateRepo
  };
}

export async function getUpdateStatus(db, config) {
  const cached = readCache(db);
  const now = Date.now();

  if (cached?.checkedAt) {
    const ageMs = now - new Date(cached.checkedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs < config.updateCheckIntervalMs) {
      return hydrateCachedStatus(config, cached);
    }
  }

  if (!inFlightCheck) {
    inFlightCheck = (async () => {
      try {
        const latestVersion = await fetchLatestVersion(config);
        const nextStatus = buildStatus(config, latestVersion, latestVersion ? "" : "No published tags found yet.");
        writeCache(db, nextStatus);
        return hydrateCachedStatus(config, nextStatus);
      } catch (error) {
        const fallback = buildStatus(config, cached?.latestVersion || config.appVersion, error.message);
        writeCache(db, fallback);
        return hydrateCachedStatus(config, fallback);
      } finally {
        inFlightCheck = null;
      }
    })();
  }

  return inFlightCheck;
}
