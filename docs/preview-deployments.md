# Preview and production deployments

Any branch, tag, commit or pull request can be published at its own address:

```
https://<first 8 characters of the commit SHA>.<PREVIEW_DOMAIN>
```

Every commit gets its own address, so an older preview keeps working after new pushes. The live site is not touched.

## Deploying a preview

- **Any branch, tag, commit or PR:** GitHub → Actions → *Preview deploy* → *Run workflow*. Type a branch name, tag, SHA, or a PR number such as `27`, and press *Run workflow*. The address is shown on the run's summary page and as the *preview* environment link.
- **A pull request, automatically:** add the `preview` label to the PR. It deploys straight away and again on every push while the label is on, and posts (then keeps updating) a comment on the PR with the latest address.

The label trigger only works for PRs whose branch already contains `.github/workflows/preview.yml`; for older branches use *Run workflow*, which works for anything.

## Deploying to production

GitHub → Actions → *Production deploy* → *Run workflow*, with `master` or any branch, tag or commit. It runs the tests, builds, uploads the build to its own release folder and then switches the live site to it. To roll back, run it again with the previous commit.

The job uses the `production` environment, so it can be gated with required reviewers in the repository settings, and its deploy key only exists there.

## How it works

```
Browser ──https──▶ reverse proxy  (*.<PREVIEW_DOMAIN>, wildcard certificate)
                         │ http, original Host header
                         ▼
                  preview nginx  (deploy/preview/nginx.conf)
                         │ <sha>.<PREVIEW_DOMAIN> → /srv/previews/<sha>/
                         ▼
                  /srv/previews/<sha>/   ◀── rsync over SSH from GitHub Actions
```

Everything that routes a subdomain is a wildcard set up once, so a deploy is only a file upload: no DNS records, proxy hosts or certificates are created per deploy.

Each preview is its own origin, so its service worker, cache and saved progress (localStorage) are separate from the live site and from other previews. A preview starts with empty progress.

## Server requirements

The server needs, once:

- A wildcard DNS record for `*.<PREVIEW_DOMAIN>` pointing at the server.
- A wildcard TLS certificate for `*.<PREVIEW_DOMAIN>` (needs a DNS challenge) on the reverse proxy, and a proxy host forwarding `*.<PREVIEW_DOMAIN>` to the preview nginx container.
- The preview nginx container from `deploy/preview/` running with `/srv/previews` mounted read-only. Set `server_name` in `nginx.conf` to match `PREVIEW_DOMAIN`.
- A dedicated SSH user whose key is restricted to rsync into `/srv/previews`, for example with `command="/usr/bin/rrsync /srv/previews",restrict` in `authorized_keys`. SSH must be reachable from GitHub's hosted runners.
- Optionally, a cron job that removes old preview folders.

For production, additionally:

- A `/srv/lingo-prod` folder, mounted read-only into the same nginx container. Releases go to `releases/<sha>/` and `current` is a link to the live one.
- A separate SSH user for production, whose key is restricted to rsync into `/srv/lingo-prod` (for example `command="/usr/bin/rrsync /srv/lingo-prod",restrict`). A separate user rather than a second key on the preview user, because rrsync allows one run per user at a time, so preview and production deploys would block each other.
- A proxy host for the live address (`lingo.bololoo.com`) forwarding to the nginx container. Set its `server_name` in `nginx.conf` if you use another address.
- The `/content/` location from `deploy/preview/nginx.conf` in the live site's server block, so word bank changes published to the [lingo-wordbase](https://github.com/amahlaka/lingo-wordbase) repository reach visitors without a release. The **Content publish** workflow (`.github/workflows/content.yml`) checks that repository every 10 minutes, uses the same production user and secrets, and uploads to `content/` in the production folder.

The optional backend (`server/`) is deployed by the same workflow; see [backend.md](backend.md).

## Config deploys

*Production deploy* also puts `deploy/preview/nginx.conf` live. The deploy key can only rsync, so the workflow uploads the file to `nginx/nginx.conf` in the production folder, and a root timer on the server picks it up:

1. `apply-nginx-conf.sh` reads the upload as the deploy user (so it can't point at a root-only file), refuses any config that could reach beyond the static folders (`*_pass`, `include`, `upstream`, `resolver`, `mirror`, modules, or `root`/`alias` outside `/srv/`), then checks it with `nginx -t` in a throwaway container with the same image and mounts. The deploy key can already change the site's files; this keeps it from doing more, such as exposing other containers on the proxy network.
2. If it passes, the script backs up the live config (`nginx.conf.auto-<date>`, newest ten kept), writes the new one over it and reloads nginx. If it fails, nothing changes.
3. The outcome goes to `nginx-status/result.txt`, written as the deploy user: the folder is inside one that user owns, so a root write there could be redirected to any file. The workflow waits for it and fails the run, before switching the release, if the config was rejected.

Rolling back a release with an older commit rolls the config back too. Settings that differ per server belong in the repo copy, so check `diff` against the live file before the first deploy.

Install once, as root:

```bash
install -m 755 deploy/preview/apply-nginx-conf.sh /usr/local/sbin/lingo-apply-nginx-conf
install -m 644 deploy/preview/lingo-nginx-conf.service deploy/preview/lingo-nginx-conf.timer /etc/systemd/system/
install -d -o prod-deploy -g prod-deploy -m 755 /srv/lingo-prod/nginx   # the deploy user's upload folder
install -d -o prod-deploy -g prod-deploy -m 755 /srv/lingo-prod/nginx-status   # results
systemctl daemon-reload && systemctl enable --now lingo-nginx-conf.timer
```

The paths, container name and image are variables at the top of the script; override them in a drop-in (`systemctl edit lingo-nginx-conf.service`, `Environment=LIVE=...`) if yours differ.

## GitHub settings

Repository → Settings → Secrets and variables → Actions (or the `preview` environment):

| Secret | Value |
| --- | --- |
| `PREVIEW_SSH_PORT` | Only if SSH is not on port 22 |
| `PREVIEW_SSH_USER` | The deploy user |
| `PREVIEW_SSH_KEY` | The deploy user's private key |
| `PREVIEW_SSH_KNOWN_HOSTS` | Output of `ssh-keyscan <host>` |

Variables:

| Variable | Value |
| --- | --- |
| `PREVIEW_SSH_HOST` | Server host name. A variable rather than a secret, because a secret equal to the domain makes GitHub mask the preview address in logs and on the environment link. |
| `PREVIEW_DOMAIN` | Optional, default `preview.bololoo.com` |

In the `production` environment:

| Name | Kind | Value |
| --- | --- | --- |
| `PROD_SSH_HOST` | Variable | Server host name |
| `PROD_SSH_PORT` | Variable | Only if SSH is not on port 22 |
| `PROD_SSH_USER` | Secret | The production deploy user |
| `PROD_SSH_KEY` | Secret | Its private key |
| `PROD_SSH_KNOWN_HOSTS` | Secret | Output of `ssh-keyscan <host>` |
| `PRODUCTION_URL` | Variable | Optional, default `https://lingo.bololoo.com` |

Create a label named `preview` for the PR trigger. The workflow creates the `preview` environment on its first run.
