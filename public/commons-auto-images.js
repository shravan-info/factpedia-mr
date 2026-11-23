/* Automatic Wikimedia Commons image enhancement for articles without an authored image.
   The original file page and the file's declared licence are always shown. */
(() => {
  const main = document.querySelector('#mainContent');
  if (!main || main.querySelector('.article-image, figure img, img')) return;
  const heading = main.querySelector('h1');
  if (!heading) return;
  const title = heading.textContent.trim();
  if (!title) return;
  const cacheKey = 'fp-commons-image-v1:' + location.pathname;
  const insertImage = (data) => {
    if (!data || !data.thumb || !data.filePage || !data.license) return;
    const figure = document.createElement('figure');
    figure.className = 'article-image fp-auto-image';
    const img = document.createElement('img');
    img.src = data.thumb;
    img.alt = title + ' — चित्र';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    const caption = document.createElement('figcaption');
    const author = document.createElement('span');
    author.textContent = 'चित्र स्रोत : ' + (data.artist || 'Wikimedia Commons योगदानकर्ता');
    const separator = document.createTextNode(' · ');
    const source = document.createElement('a');
    source.href = data.filePage;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'मूळ चित्र';
    const licenseText = document.createTextNode(' · परवाना : ');
    const license = document.createElement('a');
    license.href = data.licenseUrl || data.filePage;
    license.target = '_blank';
    license.rel = 'noopener noreferrer';
    license.textContent = data.license;
    caption.append(author, separator, source, licenseText, license);
    figure.append(img, caption);
    heading.insertAdjacentElement('afterend', figure);
  };
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { insertImage(JSON.parse(cached)); return; }
  } catch (_) {}
  const query = title + ' filetype:bitmap';
  const params = new URLSearchParams({
    action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query,
    gsrnamespace:'6',gsrlimit:'8',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1000'
  });
  fetch('https://commons.wikimedia.org/w/api.php?' + params.toString(), {headers:{Accept:'application/json'}})
    .then(response => { if (!response.ok) throw new Error('Commons unavailable'); return response.json(); })
    .then(payload => {
      const pages = Object.values(payload.query?.pages || {});
      const candidate = pages.map(page => {
        const info = page.imageinfo?.[0];
        const meta = info?.extmetadata || {};
        const license = meta.LicenseShortName?.value || meta.UsageTerms?.value || '';
        const artist = meta.Artist?.value || meta.Credit?.value || '';
        const licenseUrl = meta.LicenseUrl?.value || info?.descriptionurl || '';
        return {
          thumb: info?.thumburl || info?.url,
          filePage: info?.descriptionurl,
          license: license.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(),
          licenseUrl,
          artist: artist.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
        };
      }).find(item => item.thumb && item.filePage && item.license);
      if (!candidate) return;
      try { sessionStorage.setItem(cacheKey, JSON.stringify(candidate)); } catch (_) {}
      insertImage(candidate);
    }).catch(() => {});
})();
