function parseToken(request) {
  const url = new URL(request.raw.url, "http://localhost");
  return url.searchParams.get("token");
}

export async function registerTerminalRoutes(app) {
  app.get("/terminal/ws", { websocket: true }, (socket, request) => {
    const token = parseToken(request);
    const tokenPayload = app.terminalTokens.read(token);

    if (!tokenPayload) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: "status",
          status: "error",
          message: "Terminal token is missing or expired."
        }));
      }
      socket.close();
      return;
    }

    const currentUser = {
      id: tokenPayload.userId,
      role: tokenPayload.role
    };

    const entry = app.terminalManager.ensureSession(currentUser, tokenPayload.sessionId);
    if (!entry) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({
          type: "status",
          status: "error",
          message: "Session is not available."
        }));
      }
      socket.close();
      return;
    }

    app.terminalManager.attachClient(entry, socket);
  });
}
