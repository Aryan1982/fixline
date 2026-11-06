#!/usr/bin/env bash
# Renders docs/BLOG.md into site/blog/index.html. The rest of site/ is static.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
repo="https://github.com/Aryan1982/fixline"
mkdir -p "$root/site/blog"
body="$(sed -e "s#(\.\./README\.md)#(${repo})#g" \
            -e "s#(\.\./deploy/#(${repo}/blob/main/deploy/#g" \
            "$root/docs/BLOG.md" | npx -y marked@15 --gfm)"
cat > "$root/site/blog/index.html" <<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Claude Code and Codex in a support channel, checking each other's work</title>
  <meta name="description" content="How Fixline was built on Switch's agent protocol: rooms, roles, approval cards, addressing policies, and six pitfalls for first-time Switch users.">
  <meta property="og:image" content="https://fixline-iota.vercel.app/img/og.png">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="nav wrap">
    <a class="brand" href="/">Fixline</a>
    <nav><a href="/#demo">Demo</a><a class="nav-cta" href="${repo}">GitHub</a></nav>
  </header>
  <main class="wrap post">
${body}
  </main>
  <footer class="wrap foot"><span>Fixline · built for Flip the Switch</span><a href="/">Home</a></footer>
</body>
</html>
HTML
echo "wrote site/blog/index.html"
