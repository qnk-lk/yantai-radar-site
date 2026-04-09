# Deployment Notes

## Local development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
pnpm build
```

Static output is generated into `out/`.

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
- `SERVER_SSH_KEY`
- `SERVER_TARGET_DIR`

Example target directory:

```text
/var/www/radar
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
- The deployment user must have write access to the target directory.
- SSH key login must already work from GitHub Actions.

## Nginx example

An example config is provided at `deploy/nginx-radar-site.conf.example`.

If your server uses a new site definition, a minimal setup looks like:

```nginx
server {
  listen 80;
  server_name radar.example.com;

  root /var/www/radar;
  index index.html;

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

## Data feed

The page reads `/latest.json` from the deployed site root.

You can update that file by:

- generating a new JSON file locally and pushing it with the site
- or writing a server-side script that overwrites `latest.json` after OpenClaw completes the daily report
