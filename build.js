import fs from "fs";
import path from "path";
import { marked } from "marked";
import sharp from "sharp";

const contentDir = "./content";
const distDir = "./dist";
const templatePath = "./template.html";
const homepageTemplatePath = "./homepage-template.html";

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const template = fs.readFileSync(templatePath, "utf-8");
const homepageTemplate = fs.existsSync(homepageTemplatePath)
  ? fs.readFileSync(homepageTemplatePath, "utf-8")
  : template;
const urls = [];
const siteUrl = "https://factpedia-mr.pages.dev";
// Keep legacy country-name URLs available through permanent redirects, not duplicate article pages.
const articleRedirects = new Map([["turkey", "turkiye"], ["uae", "united-arab-emirates"], ["hatkanangale-taluka", "hatkanangle-taluka"], ["khed-taluka", "khed-pune-taluka"], ["malkapur-taluka", "malkapur-buldhana-taluka"]]);

function cleanMetaDescription(value) {
  return String(value || "")
    .replace(/!\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/\[(.*?)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_~>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Keep exactly one H1 in the rendered page, even if source Markdown has more.
function addImageLoadingHints(html) {
  let imageIndex = 0;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const isFirstImage = imageIndex++ === 0;
    let output = tag;
    if (!/\bloading\s*=/i.test(output)) {
      output = output.replace(/<img\b/i, '<img loading="' + (isFirstImage ? 'eager' : 'lazy') + '"');
    }
    if (!/\bdecoding\s*=/i.test(output)) {
      output = output.replace(/<img\b/i, '<img decoding="async"');
    }
    if (isFirstImage && !/\bfetchpriority\s*=/i.test(output)) {
      output = output.replace(/<img\b/i, '<img fetchpriority="high"');
    }
    return output;
  });
}

function ensureSingleH1(html, title) {
  let h1Count = 0;
  const normalized = html.replace(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi, (match, attributes, content) => {
    h1Count += 1;
    return h1Count === 1 ? match : "<h2" + attributes + ">" + content + "</h2>";
  });

  return h1Count === 0
    ? "<h1>" + escapeHtml(title) + "</h1>\n" + normalized
    : normalized;
}

function createStructuredData({ title, description, pageUrl, isHomePage, wordCount = 0 }) {
  const organizationId = siteUrl + "/#organization";
  const websiteId = siteUrl + "/#website";
  const pageId = pageUrl + "#webpage";

  const graph = [
    {
      "@type": "Organization",
      "@id": organizationId,
      "name": "Factpedia",
      "url": siteUrl + "/"
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      "url": siteUrl + "/",
      "name": "Factpedia",
      "inLanguage": "mr",
      "publisher": { "@id": organizationId }
    },
    {
      "@type": "WebPage",
      "@id": pageId,
      "url": pageUrl,
      "name": title,
      "description": description,
      "inLanguage": "mr",
      "isPartOf": { "@id": websiteId }
    }
  ];

  if (!isHomePage) {
    graph.push(
      {
        "@type": "Article",
        "@id": pageUrl + "#article",
        "mainEntityOfPage": { "@id": pageId },
        "headline": title,
        "description": cleanMetaDescription(description),
        "inLanguage": "mr",
        "author": { "@id": organizationId },
        "publisher": { "@id": organizationId },
        "wordCount": wordCount,
        "isAccessibleForFree": true,
        "copyrightHolder": { "@id": organizationId }
      },
      {
        "@type": "BreadcrumbList",
        "@id": pageUrl + "#breadcrumb",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "मुख्यपृष्ठ",
            "item": siteUrl + "/"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": title,
            "item": pageUrl
          }
        ]
      }
    );
  }

  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph
  }).replace(/</g, "\\u003c");
}


function collectArticleTitles(dir, currentSlug = "", output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectArticleTitles(fullPath, path.join(currentSlug, entry.name), output);
    else if (entry.name.endsWith(".md") && entry.name !== "index.md") {
      const source = fs.readFileSync(fullPath, "utf-8");
      const heading = source.match(/^#\s+(.+)$/m);
      const metaTitle = source.match(/^title:\s*(.+)$/m);
      const title = heading?.[1]?.trim() || metaTitle?.[1]?.trim() || entry.name.replace(/\.md$/, "").replace(/[-_]+/g, " ");
      const slug = path.join(currentSlug, entry.name.replace(/\.md$/, "")).split(path.sep).join("/");
      if (!articleRedirects.has(slug)) output.push({ title, slug });
    }
  }
  return output;
}
function escapeRegExp(value) {
  return value.split("").map(ch => "\\^$.*+?()[]{}|".includes(ch) ? "\\" + ch : ch).join("");
}
const articleTitles = collectArticleTitles(contentDir).sort((a, b) => b.title.length - a.title.length);
function appendMissingHomepageArticles(markdown) {
  const intro = markdown.split(/^##\s+सर्व लेख\s*$/m)[0].replace(/\n+$/, "");
  const sorted = [...articleTitles].sort((a, b) => a.title.localeCompare(b.title, "mr"));
  const marathiCount = String(sorted.length).replace(/[0-9]/g, digit => "०१२३४५६७८९"[Number(digit)]);
  const count = `<div class="article-count" aria-label="Factpedia वरील एकूण प्रकाशित लेख"><span>एकूण लेख</span><strong>${marathiCount}</strong></div>`;
  const list = sorted.map((item, index) => `${index + 1}. [${item.title}](/${item.slug}/)`).join("\n");
  return `${intro}\n\n${count}\n\n## सर्व लेख\n\n${list}\n`;
}
const searchDocuments = [];
const englishAliases = {
  "bharat": ["india", "republic of india", "indian country", "south asia"],
  "bharatacha-bhugol": ["india geography", "geography of india", "indian geography", "physical geography of india", "bharat geography"],
  "maharashtra": ["maharashtra state", "western india", "marathi state"],
  "mumbai": ["mumbai city", "bombay", "maharashtra capital", "financial capital"],
  "chhatrapati-shivaji-maharaj": ["shivaji", "chhatrapati shivaji", "maratha king", "maratha empire"],
  "raigad": ["raigad fort", "shivaji coronation", "maratha capital"],
  "constitution-of-india": ["indian constitution", "constitution", "fundamental rights"],
  "dr-b-r-ambedkar": ["ambedkar", "babasaheb", "b r ambedkar"],
  "mahatma-gandhi": ["gandhi", "father of the nation", "nonviolence"],
  "apj-abdul-kalam": ["abdul kalam", "missile man", "former president of india"],
  "isro": ["indian space research organisation", "space agency india"],
  "chandrayaan-3": ["moon mission", "india moon landing", "lunar mission"],
  "aditya-l1": ["sun mission", "solar mission", "indian space mission"],
  "artificial-intelligence": ["ai", "machine learning", "generative ai"],
  "internet": ["world wide web", "computer network", "online"],
  "solar-system": ["planets", "sun", "solar system planets"],
  "earth": ["planet earth", "world", "geography"],
  "united-nations": ["un", "united nations organization"],
  "indian-parliament": ["parliament of india", "lok sabha", "rajya sabha"],
  "indian-railways": ["railways india", "train", "indian railway"],
  "indian-rupee": ["rupee", "inr", "indian currency"],
  "reserve-bank-india": ["rbi", "central bank india", "reserve bank of india"],
  "indian-independence-movement": ["indian freedom struggle", "freedom movement", "independence"],
  "indian-national-congress": ["congress party history", "inc", "indian congress"],
  "election-commission-india": ["eci", "indian elections", "election commission"],
  "supreme-court-india": ["supreme court", "indian judiciary", "highest court india"],
  "panchayati-raj-india": ["village government", "local self government", "panchayat"],
  "indian-postal-system": ["india post", "postal service", "post office"],
  "diwali": ["deepavali", "festival of lights", "indian festival"],
  "ganesh-chaturthi": ["ganesh festival", "ganpati", "vinayaka chaturthi"],
  "ajanta-caves": ["ajanta", "buddhist caves", "ancient indian paintings"],
  "ellora-caves": ["ellora", "kailasa temple", "cave temples"],
  "taj-mahal": ["agra monument", "mughal architecture"],
  "red-fort": ["lal qila", "delhi fort", "mughal monument"],
  "himalaya": ["himalayas", "mountain range", "mountains"],
  "ganga-river": ["ganges", "river ganga", "indian rivers"],
  "godavari-river": ["godavari", "dakshin ganga", "river"],
  "krishna-river": ["krishna river", "indian river"],
  "narmada-river": ["narmada", "river"],
  "western-ghats": ["sahyadri", "biodiversity hotspot", "mountains india"],
  "thar-desert": ["great indian desert", "rajasthan desert"],
  "deccan-plateau": ["deccan", "plateau india"],
  "goa": ["goa state", "western coast india"],
  "gujarat": ["gujarat state", "western india"],
  "rajasthan": ["rajasthan state", "thar"],
  "assam": ["assam state", "northeast india"],
  "kerala": ["kerala state", "malabar coast"],
  "himachal-pradesh": ["himachal", "indian himalayas"],
  "punjab": ["punjab state", "five rivers"],
  "uttarakhand": ["uttarakhand state", "devbhoomi"],
  "sikkim": ["sikkim state", "kanchenjunga"],
  "mizoram": ["mizoram state", "northeast india"],
  "tripura": ["tripura state", "northeast india"],
  "meghalaya": ["meghalaya state", "living root bridges"],
  "manipur": ["manipur state", "loktak lake"],
  "nagaland": ["nagaland state", "naga"],
  "arunachal-pradesh": ["arunachal", "eastern himalaya"],
  "tamil-nadu": ["tamil nadu state", "southern india"],
  "karnataka": ["karnataka state", "bengaluru"],
  "andhra-pradesh": ["andhra", "andhra pradesh state"],
  "telangana": ["telangana state", "hyderabad"],
  "madhya-pradesh": ["madhya pradesh state", "central india"],
  "chhattisgarh": ["chhattisgarh state", "central india"],
  "odisha": ["orissa", "odisha state", "eastern india"],
  "jharkhand": ["jharkhand state", "eastern india"],
  "bihar": ["bihar state", "magadha"],
  "uttar-pradesh": ["up", "uttar pradesh state"],
  "west-bengal": ["west bengal state", "bengal"],
  "delhi": ["new delhi", "national capital territory", "capital of india"],
  "jammu-kashmir": ["jammu and kashmir", "kashmir"],
  "ladakh": ["ladakh union territory", "cold desert"],
  "andaman-nicobar": ["andaman and nicobar islands", "islands india"],
  "puducherry": ["pondicherry", "union territory india"],
  "indian-premier-league": ["ipl", "cricket league"],
  "cricket-india": ["indian cricket", "team india"],
  "cv-raman": ["c v raman", "raman effect", "physicist"],
  "homi-bhabha": ["homi j bhabha", "nuclear science india"],
  "savitribai-phule": ["savitribai", "women education india"],
  "jyotirao-phule": ["jotiba phule", "social reformer"],
  "sardar-vallabhbhai-patel": ["sardar patel", "iron man of india"],
  "subhas-chandra-bose": ["netaji", "indian freedom fighter"],
  "rabindranath-tagore": ["tagore", "poet", "nobel prize india"],
  "hampi": ["vijayanagara empire", "vijayanagar ruins"],
  "kaziranga-national-park": ["kaziranga", "one horned rhinoceros"],
  "khajuraho-group-of-monuments": ["khajuraho temples", "temples india"],
  "sanchi-stupa": ["sanchi", "buddhist monument"],
  "konark-sun-temple": ["konark", "sun temple"],
  "qutb-minar": ["qutub minar", "delhi monument"],
  "gateway-of-india": ["gateway mumbai", "mumbai monument"]
};
function plainSearchText(markdown) {
  return markdown.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*---[\s\S]*?---\s*/m, " ")
    .replace(/[#>*_~`|]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function addContextualInternalLinks(markdown, currentSlug) {
  const linked = new Set();
  let inCodeBlock = false;
  return markdown.split("\n").map(line => {
    if (/^\s*```/.test(line)) { inCodeBlock = !inCodeBlock; return line; }
    if (inCodeBlock || /^\s{0,3}(#|>|[-*+]\s|\d+\.\s|\||\[)/.test(line) ||
        /https?:\/\//i.test(line) || /\[[^\]]*\]\([^)]*\)/.test(line) ||
        /<[^>]+>/.test(line) || !line.trim()) return line;
    let output = line;
    for (const item of articleTitles) {
      if (item.slug === currentSlug || linked.has(item.slug)) continue;
      const pattern = new RegExp("(?<![\\p{L}\\p{N}])(" + escapeRegExp(item.title) + ")(?![\\p{L}\\p{N}])", "u");
      if (pattern.test(output)) output = output.replace(pattern, match => {
        linked.add(item.slug);
        return "[" + match + "](/" + item.slug + "/)";
      });
    }
    return output;
  }).join("\n");
}

function processDir(dir, currentSlug = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      processDir(fullPath, path.join(currentSlug, entry.name));
    } else if (entry.name.endsWith(".md")) {
      let rawText = fs.readFileSync(fullPath, "utf-8");
      const slugName = entry.name.replace(".md", "");
      if (slugName.endsWith("-taluka")) {
        rawText = rawText.replace(/(?<!डॉ)([\u0900-\u097F])\.(?=\s|$)/g, "$1।");
      }

      let title = "";
      let description = "";
      let markdownBody = rawText;

      if (rawText.startsWith("---")) {
        const parts = rawText.split("---");
        if (parts.length >= 3) {
          const meta = parts[1];
          markdownBody = parts.slice(2).join("---");

          const titleMatch = meta.match(/^title:\s*(.*)$/m);
          if (titleMatch) title = titleMatch[1].trim();

          const descMatch = meta.match(/^description:\s*(.*)$/m);
          if (descMatch) description = descMatch[1].trim();
        }
      }

      const sourceHeading = markdownBody.match(/^#\s+(.+)$/m)?.[1]?.trim();
      const fallbackSlugTitle = slugName.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
      title = title || sourceHeading || (slugName === "index" ? "Factpedia - मुक्त ज्ञानकोश" : fallbackSlugTitle);

      if (!description) {
        const descriptionSource = plainSearchText(markdownBody)
          .replace(new RegExp("^" + escapeRegExp(title) + "\\s*", "i"), "")
          .trim();
        const firstSentences = descriptionSource.match(/^.{1,320}?(?:[।.!?](?:\s|$)|$)/u)?.[0] || descriptionSource;
        description = firstSentences || "Factpedia वर " + title + " या विषयाची मराठीत माहिती वाचा.";
      }
      description = Array.from(cleanMetaDescription(description)).slice(0, 160).join("");

      const isHomePage = slugName === "index" && !currentSlug;
      const pagePath = isHomePage
        ? ""
        : path.join(currentSlug, slugName).replace(/\\/g, "/");
      const pageUrl = pagePath ? siteUrl + "/" + pagePath + "/" : siteUrl + "/";
      if (articleRedirects.has(pagePath)) {
        console.log(`Skipping duplicate article route /${pagePath}/; redirecting to /${articleRedirects.get(pagePath)}/`);
        continue;
      }
      if (!isHomePage) {
        const searchText = plainSearchText(markdownBody);
        searchDocuments.push({
          title: title.replace(/\s*\|\s*Factpedia\s*$/i, "").trim(),
          slug: pagePath,
          url: "/" + pagePath + "/",
          description: cleanMetaDescription(description),
          aliases: [...new Set([...(englishAliases[pagePath] || []), pagePath.replace(/[\/-]+/g, " ")])],
          text: searchText.slice(0, 12000)
        });
      }
      const homepageMarkdown = isHomePage ? appendMissingHomepageArticles(markdownBody) : markdownBody;
      const linkedMarkdown = isHomePage ? homepageMarkdown : addContextualInternalLinks(markdownBody, pagePath);
      const htmlContent = addImageLoadingHints(ensureSingleH1(marked.parse(linkedMarkdown), title));
      const structuredData = createStructuredData({
        title,
        description: cleanMetaDescription(description),
        pageUrl,
        isHomePage,
        wordCount: isHomePage ? 0 : plainSearchText(markdownBody).split(/\s+/).filter(Boolean).length
      });

      const selectedTemplate = isHomePage ? homepageTemplate : template;
      const outputHtml = selectedTemplate
        .replaceAll("{{title}}", escapeHtml(title))
        .replaceAll("{{description}}", escapeHtml(cleanMetaDescription(description)))
        .replaceAll("{{canonical}}", pageUrl)
        .replaceAll("{{og_type}}", isHomePage ? "website" : "article")
        .replaceAll("{{twitter_card}}", "summary_large_image")
        .replaceAll("{{schema}}", structuredData)
        .replaceAll("{{content}}", htmlContent);

      let targetDir;
      if (isHomePage) {
        targetDir = distDir;
        urls.push("");
      } else {
        targetDir = path.join(distDir, currentSlug, slugName);
        fs.mkdirSync(targetDir, { recursive: true });
        urls.push(pagePath);
      }

      fs.writeFileSync(path.join(targetDir, "index.html"), outputHtml);
      console.log(`Generated: ${slugName}`);
    }
  }
}

if (fs.existsSync(contentDir)) {
  processDir(contentDir);
}

fs.writeFileSync(
  path.join(distDir, "search-index.json"),
  JSON.stringify(searchDocuments)
);
console.log(`Search index generated with ${searchDocuments.length} articles.`);


const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${siteUrl}/${u ? u + "/" : ""}</loc></url>`).join("\n")}
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

const indexNowKeyFile = "ef79319de7cd4d95aabfd1fdb1b2f01d.txt";
if (fs.existsSync(indexNowKeyFile)) {
  fs.copyFileSync(
    indexNowKeyFile,
    path.join(distDir, indexNowKeyFile)
  );
  console.log("IndexNow key file copied to dist.");
} else {
  console.warn("IndexNow key file not found in repository root.");
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

if (fs.existsSync("./public")) {
  fs.cpSync("./public", distDir, { recursive: true });
  console.log("PWA assets copied to dist.");
}

if (fs.existsSync("./public/og-image.svg")) {
  await sharp("./public/og-image.svg").resize(1200, 630, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(path.join(distDir, "og-image.png"));
  console.log("1200x630 social sharing image generated: og-image.png");
}

const redirectRules = [...articleRedirects].flatMap(([from, to]) => [
  `/${from} /${to}/ 301`,
  `/${from}/ /${to}/ 301`
]).join("\n") + "\n";
fs.writeFileSync(path.join(distDir, "_redirects"), redirectRules);

// Build-time SEO quality checks: surface issues without silently changing article facts.
const titleCounts = new Map();
const descriptionCounts = new Map();
const knownPagePaths = new Set(["/", ...urls.filter(Boolean).map(value => "/" + value.replace(/^\/+|\/+$/g, "") + "/"), ...[...articleRedirects.keys()].map(value => "/" + value + "/")]);
const brokenInternalLinks = [];
let articleCount = 0;
let missingH1Count = 0;
let missingAltCount = 0;
for (const pagePath of urls.filter(Boolean)) {
  articleCount += 1;
  const htmlPath = path.join(distDir, pagePath, "index.html");
  if (!fs.existsSync(htmlPath)) continue;
  const html = fs.readFileSync(htmlPath, "utf-8");
  const pageTitle = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const pageDescription = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]?.trim() || "";
  titleCounts.set(pageTitle, (titleCounts.get(pageTitle) || 0) + 1);
  descriptionCounts.set(pageDescription, (descriptionCounts.get(pageDescription) || 0) + 1);
  if (!/<h1\b/i.test(html)) missingH1Count += 1;
  for (const imageTag of html.match(/<img\b[^>]*>/gi) || []) {
    if (!/\balt\s*=/i.test(imageTag)) missingAltCount += 1;
  }
  for (const anchor of html.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi) || []) {
    const href = anchor.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href || !href.startsWith("/") || href.startsWith("//")) continue;
    const pathname = href.split(/[?#]/, 1)[0];
    if (!pathname || /\.[a-z0-9]{2,8}$/i.test(pathname)) continue;
    const normalizedPath = pathname.endsWith("/") ? pathname : pathname + "/";
    if (!knownPagePaths.has(normalizedPath)) brokenInternalLinks.push({ page: "/" + pagePath + "/", href });
  }
}
const duplicateTitles = [...titleCounts].filter(([, count]) => count > 1);
const duplicateDescriptions = [...descriptionCounts].filter(([value, count]) => value && count > 1);
console.log("SEO audit summary:");
console.log(`- Articles checked: ${articleCount}`);
console.log(`- Duplicate title groups: ${duplicateTitles.length}`);
console.log(`- Duplicate description groups: ${duplicateDescriptions.length}`);
console.log(`- Pages missing H1: ${missingH1Count}`);
console.log(`- Images missing alt attributes: ${missingAltCount}`);
console.log(`- Broken internal article links: ${brokenInternalLinks.length}`);
if (brokenInternalLinks.length) console.warn("Broken internal link examples:", brokenInternalLinks.slice(0, 20));
if (duplicateTitles.length) console.warn("Duplicate title examples:", duplicateTitles.slice(0, 10));
if (duplicateDescriptions.length) console.warn("Duplicate description examples:", duplicateDescriptions.slice(0, 10));
if (missingH1Count || missingAltCount) console.warn("Review the SEO audit warnings above.");

console.log("Static build completed successfully with sitemap.xml, robots.txt, redirects, and PWA assets!");
