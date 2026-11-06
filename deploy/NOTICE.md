# Third-party files in this folder

`docker-compose.yml`, `generate-env-secrets.sh` and `.env.example` are copied
from [sandbox-quantum/switch](https://github.com/sandbox-quantum/switch)
(`deploy/local/standalone-docker-compose.yml`, `deploy/local/generate-env-secrets.sh`
and `.env.example`, main branch as of 2026-11-06). They are © SB Technology,
Inc. dba SandboxAQ, licensed under Apache 2.0 with the Commons Clause; see
that repository's LICENSE.

Changes made for Fixline, all in `.env.example`:

- `SWITCH_VERSION=0.31.0` (pinned release instead of `latest`)
- Host ports moved off common defaults: API `8700`, gateway `3700`, Postgres `5544`
- `FEATURE_FLAGS_ENABLED=follow_the_conversation`, so `!assign-agent` works
- `MATTERMOST_USER=priya`, the seeded account for the demo's engineering lead

`docker-compose.fixline.yml`, `docker-compose.arm64.yml` and `mattermost-arm64/` are Fixline's own.
