# terminux

`terminux` is a self-hosted SSH session manager with a built-in browser terminal.

## What ships in the image

The Docker image is designed to start clean:

- no local SQLite data is baked into the image
- the app creates its database automatically on first start
- the first run seeds one admin user from env
- persistent data lives in `/app/storage`
- the image includes a built-in Docker `HEALTHCHECK` against `/health`

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

Check status and health:

```bash
docker compose ps
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
  --restart unless-stopped \
  -p 3000:3000 \
  -e APP_HOST=0.0.0.0 \
  -e APP_MASTER_KEY=replace-with-a-long-random-secret \
  -e SESSION_SECRET=replace-with-another-long-random-secret \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin123 \
  -v terminux_data:/app/storage \
  marchkov/terminux:latest
```

Then open `http://localhost:3000`.

Check container health:

```bash
docker ps
```

Inspect the health probe directly:

```bash
docker inspect --format='{{json .State.Health}}' terminux
```

## Safe upgrade without data loss

If you already have real users, groups and SSH sessions in production, update the container with the same named volume so SQLite stays in place.

1. Confirm the volume exists:

```bash
docker volume ls
```

You should see `terminux_data` in the list.

2. Optional but recommended: make a backup of the SQLite file before upgrading:

```bash
docker run --rm -v terminux_data:/data -v $(pwd):/backup alpine sh -c "cp /data/database.sqlite /backup/database.sqlite.backup"
```

3. Pull the fresh image:

```bash
docker pull marchkov/terminux:latest
```

4. Remove the old container only, not the volume:

```bash
docker rm -f terminux
```

5. Start the new container with the same volume name and the same `APP_MASTER_KEY` you used before:

```bash
docker run -d \
  --name terminux \
  --restart unless-stopped \
  -p 3000:3000 \
  -e APP_HOST=0.0.0.0 \
  -e APP_MASTER_KEY=your-existing-master-key \
  -e SESSION_SECRET=your-new-or-existing-session-secret-32-plus \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin123 \
  -v terminux_data:/app/storage \
  marchkov/terminux:latest
```

6. Verify the container is healthy:

```bash
docker ps
docker logs terminux
docker inspect --format='{{json .State.Health}}' terminux
```

Important notes:

- keep using the same volume name: `terminux_data`
- do not run the new container without `-v terminux_data:/app/storage`
- do not delete the volume unless you really want to wipe the database
- keep `APP_MASTER_KEY` stable across upgrades, otherwise saved SSH passwords and keys may stop decrypting
- `SESSION_SECRET` must be at least 32 characters long
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

## Production notes

Before exposing the app publicly, make sure you:

- replace `APP_MASTER_KEY` with a long random secret
- replace `SESSION_SECRET` with a different long random secret
- change the default admin password
- mount `/app/storage` to persistent disk or a named volume
- publish only the external port you actually need

