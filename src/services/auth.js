import bcrypt from "bcrypt";
import { findUserById, findUserByUsername } from "./users.js";

export async function attachCurrentUser(request) {
  const userId = request.session?.userId;
  if (!userId) {
    request.currentUser = null;
    return;
  }

  const user = findUserById(request.server.db, userId);
  request.currentUser = user && user.is_active ? user : null;

  if (!request.currentUser) {
    request.session.userId = null;
  }
}

export async function authenticateUser(db, { username, password }) {
  const user = findUserByUsername(db, username);
  if (!user || !user.is_active) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    is_active: user.is_active
  };
}

export async function requireAuth(request, reply) {
  if (request.currentUser) {
    return;
  }

  reply.redirect("/login");
}

export async function requireGuest(request, reply) {
  if (!request.currentUser) {
    return;
  }

  reply.redirect("/");
}

export async function requireAdmin(request, reply) {
  if (request.currentUser?.role === "admin") {
    return;
  }

  reply.code(403).type("text/html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>403 · terminux</title>
  </head>
  <body style="background:#0a0f14;color:#edf3f8;font-family:Segoe UI,sans-serif;padding:40px">
    <h1>403</h1>
    <p>This page is available to administrators only.</p>
    <p><a href="/" style="color:#68d2b3">Return to workspace</a></p>
  </body>
</html>`);
}
