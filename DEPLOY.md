# Deployment Notes

## Local development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

If you also want local `/api/*` requests to resolve against the Node backend, start the API in a second terminal:

```bash
pnpm api:start
pnpm dev
```

In development, `next.config.ts` rewrites `/api/:path*` to `http://127.0.0.1:3180/api/:path*` by default.
You can override that target with:

```bash
RADAR_API_PROXY_URL=http://127.0.0.1:3180
```

Use `http://localhost:3000` in the browser for local development.
On this machine, `http://127.0.0.1:3000` may be affected by the system proxy and break Next HMR / client data loading.

## Build

```bash
pnpm build
```

Static output is generated into `out/`.

## Backend API

This repo now includes a lightweight Node backend at `server/index.mjs`.

Local run:

```bash
pnpm api:start
```

Default bind:

```text
http://127.0.0.1:3180
```

Available endpoints:

- `/api/health`
- `/api/radar/latest`
- `/api/competitors`
- `/api/admin/divisions`

The backend reads JSON files from `RADAR_DATA_DIR`.
If unset, it defaults to the repo `public/` directory.

The backend now seeds a SQLite database on first start and serves API responses from that database.
Default DB path:

```text
/home/ubuntu/yantai-radar-site/server/data/radar.sqlite
```

Manual reseed:

```bash
cd /home/ubuntu/yantai-radar-site/server
npm run seed
sudo systemctl restart radar-api.service
```

## OpenClaw to SQLite

If you want OpenClaw outputs to write into the backend database directly, use these scripts:

- `scripts/sync-openclaw-latest-to-db.sh`
- `scripts/sync-openclaw-competitors-to-db.sh`

Daily radar summary into SQLite:

```bash
/home/ubuntu/yantai-radar-site/scripts/sync-openclaw-latest-to-db.sh
sudo systemctl restart radar-api.service
```

Competitor run result into SQLite:

```bash
INPUT_PATH=/path/to/openclaw-competitor-run.json \
ALLOWED_CITIES=烟台,青岛 \
/home/ubuntu/yantai-radar-site/scripts/sync-openclaw-competitors-to-db.sh

```

These scripts do not trigger OpenClaw by themselves.
They only convert existing OpenClaw outputs and import them into SQLite.

Recommended competitor auto-sync source:

```text
/tmp/openclaw-competitor-run.json
```

Recommended cron entry:

```bash
*/10 * * * * /home/ubuntu/yantai-radar-site/scripts/sync-openclaw-competitors-to-db.sh >> /home/ubuntu/openclaw-bridge/competitors-sync.log 2>&1
```

The competitor sync script is idempotent:

- it skips when the input file is missing
- it skips when the input file is empty
- it skips when the input file has not changed since the last import
- when a new valid result appears, it updates both `/var/www/qn-message.com/competitors.json` and the SQLite `competitors` document

## Preview static export locally

```bash
pnpm start
```

Open [http://localhost:4173](http://localhost:4173).

## GitHub Actions secrets

Configure these repository secrets before enabling deployment:

- `SERVER_HOST`
- `SERVER_PORT`
- `SERVER_USER`
- `SERVER_SSH_KEY_B64`
- `SERVER_TARGET_DIR`

This project should use these values:

```text
SERVER_HOST=129.226.217.104
SERVER_PORT=22
SERVER_USER=ubuntu
SERVER_TARGET_DIR=/var/www/qn-message.com
```

`SERVER_SSH_KEY_B64` should be the base64-encoded content of the private key whose public key has been added to `/home/ubuntu/.ssh/authorized_keys` on the server.

On Windows PowerShell you can generate that value with:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content $HOME\.ssh\yantai_radar_deploy -Raw)))
```

## GitHub setup

1. Create a new GitHub repository.
2. Add the remote locally:

   ```bash
   git remote add origin <your-github-repo-url>
   ```

3. Push your current branch:

   ```bash
   git push -u origin master
   ```

4. In GitHub repository settings, add the deployment secrets listed above.
5. The workflow in `.github/workflows/deploy-radar-site.yml` will deploy on pushes to `master` or `main`.

## Server requirements

- Nginx should serve the deployment directory.
- Nginx should also reverse-proxy `/api/` to the backend service.
- The deployment user must have write access to the target directory.
- SSH key login must already work from GitHub Actions.
- `qn-message.com` and `www.qn-message.com` should both have DNS A records pointing to `129.226.217.104`.
- Port `80` should be reachable from the public internet.

## Nginx example

An example config is provided at `deploy/nginx-radar-site.conf.example`.

If your server uses a new site definition, a minimal setup looks like:

```nginx
server {
  listen 80;
  server_name qn-message.com www.qn-message.com;

  root /var/www/qn-message.com;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:3180/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri.html $uri/ =404;
  }

  location = /404.html {
    internal;
  }

  error_page 404 /404.html;
}
```

After uploading the file, enable the site and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Manual server bootstrap

Once SSH key login works for `ubuntu@129.226.217.104`, prepare the deployment directory:

```bash
sudo mkdir -p /var/www/qn-message.com
sudo chown -R ubuntu:ubuntu /var/www/qn-message.com
```

Copy the Nginx config into place:

```bash
sudo cp deploy/nginx-radar-site.conf.example /etc/nginx/sites-available/qn-message.com.conf
sudo ln -sf /etc/nginx/sites-available/qn-message.com.conf /etc/nginx/sites-enabled/qn-message.com.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Manual deploy

After building locally, you can publish the static export with:

```bash
pnpm build
rsync -avz --delete --exclude latest.json -e "ssh -p 22" out/ ubuntu@129.226.217.104:/var/www/qn-message.com/
```

Also sync the static JSON files that the backend will read:

```bash
rsync -avz -e "ssh -p 22" public/competitors.json public/china-admin-divisions.json ubuntu@129.226.217.104:/var/www/qn-message.com/
```

## Backend service on server

Copy the backend code to the server, install dependencies, then register the `systemd` unit:

```bash
rsync -avz -e "ssh -p 22" server/ ubuntu@129.226.217.104:/home/ubuntu/yantai-radar-site/server/
rsync -avz -e "ssh -p 22" deploy/radar-api.service.example ubuntu@129.226.217.104:/home/ubuntu/yantai-radar-site/deploy/
ssh -p 22 ubuntu@129.226.217.104
cd /home/ubuntu/yantai-radar-site/server
npm install --omit=dev
sudo cp /home/ubuntu/yantai-radar-site/deploy/radar-api.service.example /etc/systemd/system/radar-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now radar-api.service
```

The example `systemd` file is provided at `deploy/radar-api.service.example`.

## HTTPS

After DNS is pointing correctly and Nginx is serving the site, issue a certificate:

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d qn-message.com -d www.qn-message.com
```

## Data feed

The page reads `/latest.json` from the deployed site root.

You can update that file by:

- generating a new JSON file locally and pushing it with the site
- or writing a server-side script that overwrites `latest.json` after OpenClaw completes the daily report

## OpenClaw bridge

This repo includes a bridge script that converts the latest OpenClaw cron summary into the site JSON format:

- [scripts/openclaw_summary_to_latest_json.py](/C:/Users/62404/Desktop/yantai-radar-site/scripts/openclaw_summary_to_latest_json.py)
- [scripts/sync-openclaw-latest.sh](/C:/Users/62404/Desktop/yantai-radar-site/scripts/sync-openclaw-latest.sh)

Recommended server-side setup:

```bash
mkdir -p /home/ubuntu/openclaw-bridge
```

Copy the scripts to the server, then run:

```bash
chmod +x /home/ubuntu/openclaw-bridge/sync-openclaw-latest.sh
/home/ubuntu/openclaw-bridge/sync-openclaw-latest.sh
```

Recommended cron entry:

```bash
*/10 * * * * /home/ubuntu/openclaw-bridge/sync-openclaw-latest.sh >> /home/ubuntu/openclaw-bridge/sync.log 2>&1
```

The script reads the newest finished file from `/home/ubuntu/.openclaw/cron/runs/` and rewrites:

```text
/var/www/qn-message.com/latest.json
```

The deploy workflow intentionally excludes `latest.json`, so site code updates will not overwrite the newest OpenClaw-generated data on the server.
