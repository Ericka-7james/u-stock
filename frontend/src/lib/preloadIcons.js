// frontend/src/lib/preloadIcons.js

// Grab ALL icon urls (across subfolders too)
const iconModules = import.meta.glob(
  "../assets/icons/**/*.{png,svg,jpg,jpeg,webp,avif}",
  { eager: true, import: "default" }
);

function _preloadUrls(urls) {
  for (const url of urls) {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = url;
  }
  return urls.length;
}

// ✅ Tiered preload by folder name (recommended structure below)
export function preloadIconsFromFolder(folderName) {
  const urls = [];

  for (const [path, url] of Object.entries(iconModules)) {
    // path looks like "../assets/icons/public/foo.webp"
    if (path.includes(`/assets/icons/${folderName}/`)) {
      urls.push(url);
    }
  }

  return _preloadUrls(urls);
}

// ✅ Optional: preload by custom filter (for fine-grained control)
export function preloadIconsWhere(predicate) {
  const urls = [];

  for (const [path, url] of Object.entries(iconModules)) {
    if (predicate(path)) urls.push(url);
  }

  return _preloadUrls(urls);
}

// Backwards-compatible: preload everything (try not to use this now)
export function preloadAllIcons() {
  return _preloadUrls(Object.values(iconModules));
}