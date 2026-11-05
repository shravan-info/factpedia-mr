import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // URL मधील स्लॅश काढणे आणि मराठी अक्षरे (उदा. /भारत) डीकोड करणे
  let path = decodeURIComponent(url.pathname).replace(/^\/|\/$/g, "");

  // होमपेज असल्यास 'index' फाईल दाखवणे
  if (!path) path = "index";

  // गुगलसाठी डायनॅमिक sitemap.xml
  if (path === "sitemap.xml") {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${url.origin}/</loc></url>
  <url><loc>${url.origin}/bharat</loc></url>
</urlset>`, { headers: { "Content-Type": "application/xml" } });
  }

  // GitHub वरून थेट Markdown (.md) फाईल आणणे
  const githubUser = "shravan-info";
  const repoName = "factpedia-mr";
  const mdUrl = `https://raw.githubusercontent.com/${githubUser}/${repoName}/main/content/${path}.md`;

  const mdRes = await fetch(mdUrl);
  if (!mdRes.ok) {
    return new Response(`
      <div style="text-align:center; padding: 60px 20px;">
        <h1 style="font-size: 3rem; margin-bottom: 10px;">४०४</h1>
        <h2>हा लेख अजून लिहिला गेला नाही</h2>
        <p style="margin: 20px 0;"><a href="/" style="color: #2563eb; text-decoration: underline;">होमपेजवर परत जा</a></p>
      </div>`, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  const rawText = await mdRes.text();

  // Frontmatter मधून Title आणि Description काढणे
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

  // Markdown चे रूपांतर HTML मध्ये करणे
  const htmlContent = marked.parse(markdownBody);

  // आपले template.html आणून त्यात डेटा बसवणे
  const templateRes = await context.env.ASSETS.fetch(new URL("/template.html", url.origin));
  let template = await templateRes.text();

  template = template.replaceAll("{{title}}", title);
  template = template.replaceAll("{{description}}", description);
  template = template.replaceAll("{{content}}", htmlContent);

  // २४ तास कॅश करणे (याने Worker चा कोटा वाचतो आणि स्पीड वाढतो)
  return new Response(template, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400"
    }
  });
}
