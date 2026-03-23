# terminux

`terminux` is a self-hosted SSH session manager with a built-in browser terminal.

## What ships in the image

The Docker image is designed to start clean:

- no local SQLite data is baked into the image
- the app creates its database automatically on first start
- the first run seeds one admin user from env
- persistent data lives in `/app/storage`

## Local run

1. Copy `.env.example` to `.env`
2. Set strong `APP_MASTER_KEY` and `SESSION_SECRET`
3. Install dependencies with `npm install`
4. Start the app with `npm run dev`

Then open `http://localhost:3000`.

## Docker Compose

Run locally with Docker:

```bash
docker compose up --build
```

Run in background:

```bash
docker compose up --build -d
```

Stop it:

```bash
docker compose down
```

The compose file uses a named volume, so the database survives container recreation.

## Docker Hub build and push

Build the image manually:

```bash
docker build -t marchkov/terminux:latest .
```

Login to Docker Hub:

```bash
docker login
```

Push the image:

```bash
docker push marchkov/terminux:latest
```

Run it from Docker Hub:

```bash
docker run -d \
  --name terminux \
  -p 3000:3000 \
  -e APP_MASTER_KEY=replace-with-a-long-random-secret \
  -e SESSION_SECRET=replace-with-another-long-random-secret \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin123 \
  -v terminux_data:/app/storage \
  marchkov/terminux:latest
```

Then open `http://localhost:3000`.

## GitHub Actions publish

This repository includes a workflow at `.github/workflows/docker-publish.yml`.

It publishes:

- `marchkov/terminux:latest` on every push to `main`
- `marchkov/terminux:vX.Y.Z` when you push a git tag like `v0.1.0`

Add these GitHub repository secrets before using the workflow:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

Example release flow:

```bash
git tag v0.1.0
git push origin main --tags
```

## Default admin

On first start, the app seeds one admin user from env.

Default image-friendly credentials are:

- username: `admin`
- password: `admin123`

Change them through env before production use.
