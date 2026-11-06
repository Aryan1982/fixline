# Native arm64 Mattermost for Apple Silicon.
#
# Mattermost publishes its Docker image for amd64 only, so on an arm64 host the
# stock compose file runs it under emulation. Under Colima's QEMU emulation it
# crashes within minutes (runtime faults in compress/flate). Mattermost does
# publish a linux-arm64 server build; this wraps it the way the official image
# does, so it is a drop-in for the `mattermost` service.
FROM ubuntu:24.04

ARG MM_VERSION=11.9.0
ARG MM_EDITION=team

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl media-types tzdata \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /mattermost/data /mattermost/plugins /mattermost/client/plugins \
 && curl -fsSL "https://releases.mattermost.com/${MM_VERSION}/mattermost-${MM_EDITION}-${MM_VERSION}-linux-arm64.tar.gz" \
    | tar -xz -C / \
 && groupadd --gid 2000 mattermost \
 && useradd --uid 2000 --gid 2000 --home-dir /mattermost --no-create-home mattermost \
 && chown -R mattermost:mattermost /mattermost

USER mattermost
WORKDIR /mattermost
ENV PATH="/mattermost/bin:${PATH}"
EXPOSE 8065
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD curl -fsS http://localhost:8065/api/v4/system/ping || exit 1
CMD ["mattermost"]
