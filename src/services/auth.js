import bcrypt from "bcrypt";
import { findUserById, findUserByUsername } from "./users.js";
import { getUserSettings } from "./userSettings.js";

export async function attachCurrentUser(request) {
  const userId = request.session?.userId;
  if (!userId) {
    request.currentUser = null;
    return;
  }

  const user = findUserById(request.server.db, userId);
  if (user && user.is_active) {
    const settings = getUserSettings(request.server.db, user.id);
    request.currentUser = { ...user, theme: settings.theme };
  } else {
    request.currentUser = null;
  }

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

export async function requireAdmin(request, _reply) {
  if (request.currentUser?.role === "admin") {
    return;
  }

  const error = new Error("This page is available to administrators only.");
  error.statusCode = 403;
  throw error;
}

