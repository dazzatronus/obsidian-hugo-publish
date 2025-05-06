# Publish to Hugo

> An Obsidian Community Plugin to publish your notes as Hugo page bundles (with images), commit & push them back to your repo, and let your CI/CD deploy.

---

## 🔧 Features

- **One-click publish** from File Explorer context menu
- **Self-contained bundles**: Creates `content/posts/YYYY-MM-DD-slug/` with `index.md` + referenced images
- **Front-matter** preserved & enhanced (`title`, `slug`, `date`)
- **Git workflow**: clone → add → commit → push
- **Confirmation dialog** to edit Title & Slug before publishing
- **Private-repo support** via HTTPS + Personal Access Token

---

## ⚙️ Configuration

Open **Settings → Third-party plugin → Publish to Hugo → Options**:

| Setting               | Description                                                                         |
| --------------------- | ----------------------------------------------------------------------------------- |
| **Hugo Repo Git URL** | HTTPS URL of your Hugo site repo (e.g. `https://github.com/you/your-hugo-site.git`) |
| **Repo Branch**       | Branch to publish into (default: `master`)                                          |

### Private repos & tokens

If your Hugo site repo is **private**, you must authenticate via a GitHub Personal Access Token (PAT) with **repo** scope:

```text
https://<YOUR_TOKEN>@github.com/you/your-hugo-site.git
```

---

## 📖 Usage

1. In the **File Explorer**, right-click any Markdown (`.md`) file.
2. Select **Publish to Hugo**.
3. In the **Publish to Hugo** dialog:

   - Edit **Title** (front-matter `title`)
   - Edit **Slug** (URL-friendly, dashed)
   - Click **Publish**

4. Your commit will push to `origin/<branch>`, and your CI/CD (e.g. GitHub Actions) will deploy your site.

> **Errors** appear as Notices. To inspect detailed logs, open **View → Toggle developer tools → Console** before publishing.

---

## 🛠 CI/CD Integration

Since the plugin **pushes** your new bundle into your repo, you can let **GitHub Actions** handle the rest—build & deploy on every `push`:

```yaml
on:
  push:
    branches:
      - master
```

See this step-by-step tutorial for a complete example workflow using `actions-hugo` and `actions-gh-pages`:
“How to Deploy a Hugo Blog to GitHub Pages With Actions” (https://hackernoon.com/how-to-deploy-a-hugo-blog-to-github-pages-with-actions)

---

## 📜 License

MIT
