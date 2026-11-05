import fs from "fs";
import path from "path";
import { marked } from "marked";

const contentDir = "./content";
const distDir = "./dist";
const templatePath = "./template.html";

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const template = fs.readFileSync(templatePath, "utf-8");
const urls = [];

function processDir(dir, currentSlug = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      processDir(fullPath, path.join(currentSlug, entry.name));
    } else if (entry.name.endsWith(".md")) {
      const rawText = fs.readFileSync(fullPath, "utf-8");
      const slugName = entry.name.replace(".md", "");

      let title = "Factpedia - मुक्त ज्ञानकोश";
      let description = "सत्य आणि पडताळणी केलेली माहिती देणारा मराठी ज्ञानकोश.";
      let markdownBody = rawText;

      if (rawText.startsWith("---")) {
        const parts = rawText.split("---");
        if (parts.length >= 3) {
          const meta = parts[1];
          markdownBody = parts.slice(2).join("---");

          const titleMatch = meta.match(/title:\s*(.*)/);
          if (titleMatch) title = titleMatch[1].trim();

          const descMatch = meta.match(/description:\s*(.*)/);
          if (descMatch) description = descMatch[1].trim();
        }
      }

      const htmlContent = marked.parse(markdownBody);

      const outputHtml = template
        .replaceAll("{{title}}", title)
        .replaceAll("{{description}}", description)
        .replaceAll("{{content}}", htmlContent);

      let targetDir;
      if (slugName === "index" && !currentSlug) {
        targetDir = distDir;
        urls.push("");
      } else {
        targetDir = path.join(distDir, currentSlug, slugName);
        fs.mkdirSync(targetDir, { recursive: true });
        urls.push(path.join(currentSlug, slugName).replace(/\\/g, "/"));
      }

      fs.writeFileSync(path.join(targetDir, "index.html"), outputHtml);
      console.log(`Generated: ${slugName}`);
    }
  }
}

if (fs.existsSync(contentDir)) {
  processDir(contentDir);
}

const siteUrl = "https://factpedia-mr.pages.dev";

const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${siteUrl}/${u}</loc></url>`).join("\n")}
</urlset>`;

fs.writeFileSync(path.join(distDir, "sitemap.xml"), sitemapContent);

const robotsContent = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
fs.writeFileSync(path.join(distDir, "robots.txt"), robotsContent);

const bingVerificationFile = "BingSiteAuth.xml";
if (fs.existsSync(bingVerificationFile)) {
  fs.copyFileSync(
    bingVerificationFile,
    path.join(distDir, bingVerificationFile)
  );
  console.log("Bing Webmaster Tools verification file copied to dist.");
} else {
  console.warn("Bing verification file not found in repository root.");
}

const googleVerificationFile = "googled18bb9aab34a4f6b.html";
if (fs.existsSync(googleVerificationFile)) {
  fs.copyFileSync(
    googleVerificationFile,
    path.join(distDir, googleVerificationFile)
  );
  console.log("Google Search Console verification file copied to dist.");
} else {
  console.warn("Google verification file not found in repository root.");
}

console.log("Static build completed successfully with sitemap.xml and robots.txt!");
