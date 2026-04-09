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

This project should use these values:

```text
SERVER_HOST=129.226.217.104
SERVER_PORT=22
SERVER_USER=ubuntu
SERVER_TARGET_DIR=/var/www/qn-message.com
```

`SERVER_SSH_KEY` should be the private key whose public key has been added to `/home/ubuntu/.ssh/authorized_keys` on the server.

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
rsync -avz --delete -e "ssh -p 22" out/ ubuntu@129.226.217.104:/var/www/qn-message.com/
```

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
