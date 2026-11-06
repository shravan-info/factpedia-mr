import fs from "fs";
import path from "path";
import { marked } from "marked";

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

function createStructuredData({ title, description, pageUrl, isHomePage }) {
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
        "description": description,
        "inLanguage": "mr",
        "publisher": { "@id": organizationId }
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
      if (heading) output.push({ title: heading[1].trim(), slug: path.join(currentSlug, entry.name.replace(/\.md$/, "")).split(path.sep).join("/") });
    }
  }
  return output;
}
function escapeRegExp(value) {
  return value.split("").map(ch => "\\^$.*+?()[]{}|".includes(ch) ? "\\" + ch : ch).join("");
}
const articleTitles = collectArticleTitles(contentDir).sort((a, b) => b.title.length - a.title.length);

const searchDocuments = [];
const englishAliases = {
  "bharat": ["india", "republic of india", "indian country", "south asia"],
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

      const isHomePage = slugName === "index" && !currentSlug;
      const pagePath = isHomePage
        ? ""
        : path.join(currentSlug, slugName).replace(/\\/g, "/");
      const pageUrl = pagePath ? siteUrl + "/" + pagePath + "/" : siteUrl + "/";
      if (!isHomePage) {
        const searchText = plainSearchText(markdownBody);
        searchDocuments.push({
          title,
          slug: pagePath,
          url: "/" + pagePath + "/",
          description,
          aliases: englishAliases[pagePath] || [],
          text: searchText.slice(0, 12000)
        });
      }
      const linkedMarkdown = isHomePage ? markdownBody : addContextualInternalLinks(markdownBody, pagePath);
      const htmlContent = ensureSingleH1(marked.parse(linkedMarkdown), title);
      const structuredData = createStructuredData({
        title,
        description,
        pageUrl,
        isHomePage
      });

      const selectedTemplate = isHomePage ? homepageTemplate : template;
      const outputHtml = selectedTemplate
        .replaceAll("{{title}}", title)
        .replaceAll("{{description}}", description)
        .replaceAll("{{canonical}}", pageUrl)
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

console.log("Static build completed successfully with sitemap.xml, robots.txt, and PWA assets!");
