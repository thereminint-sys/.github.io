#!/usr/bin/env node
// Generates the per-language static pages (root index.html = English, plus
// /ko/, /ja/, ... ) from i18n/template.html + i18n/translations.csv, and
// regenerates sitemap.xml. Run with `node build-i18n.js` after editing the
// template or the CSV. No dependencies — everything here is Node built-ins.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const BASE_URL = "https://theremin-int.com";

// Cloudflare's Cache Rule (set up separately, in the dashboard — see the
// project notes) pins /assets/*, /css/*, /js/* to a 1-year edge + browser
// TTL regardless of what origin sends, so a plain re-upload of a changed
// file wouldn't reach anyone with it already cached. Appending a content
// hash as a query string changes the URL whenever the file's bytes change,
// which busts that cache without needing a cache purge — unchanged files
// keep the same URL and stay cached for the full year. Applied as a
// post-processing pass over each rendered page's HTML, not the template,
// so it only ever touches real, resolvable local file references.
const CACHE_BUST_EXTENSIONS = /\.(css|js|png|webp|webm|jpg|jpeg|ico|json)$/i;

function isLocalAssetUrl(url) {
  return (
    CACHE_BUST_EXTENSIONS.test(url) &&
    !/^([a-z]+:)?\/\//i.test(url) &&
    !url.startsWith("data:")
  );
}

function hashOf(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").slice(0, 10);
}

function applyCacheBusting(html, outDir) {
  const attrPattern = /(src|href|poster|data-src|data-original|data-full)="([^"]+)"/g;
  html = html.replace(attrPattern, (match, attr, url) => {
    if (!isLocalAssetUrl(url)) return match;
    const filePath = path.join(outDir, url);
    if (!fs.existsSync(filePath)) return match; // don't break the build over a stray/missing reference
    return `${attr}="${url}?v=${hashOf(filePath)}"`;
  });
  // The one inline background-image:url('...') on #parallax-bg isn't
  // covered by the attribute pattern above.
  const inlineUrlPattern = /url\('([^']+)'\)/g;
  html = html.replace(inlineUrlPattern, (match, url) => {
    if (!isLocalAssetUrl(url)) return match;
    const filePath = path.join(outDir, url);
    if (!fs.existsSync(filePath)) return match;
    return `url('${url}?v=${hashOf(filePath)}')`;
  });
  return html;
}

// `steamLang` is the Steam Community language code appended to news-post
// links (?l=<code>) so the "Prologue" cards open the matching Steam-side
// localization of the post.
const LANGUAGES = [
  { key: "en", prefix: "", htmlLang: "en", ogLocale: "en_US", native: "English", short: "EN", steamLang: "english" },
  { key: "ko", prefix: "ko", htmlLang: "ko", ogLocale: "ko_KR", native: "한국어", short: "KO", steamLang: "koreana" },
  { key: "ja", prefix: "ja", htmlLang: "ja", ogLocale: "ja_JP", native: "日本語", short: "JA", steamLang: "japanese" },
  { key: "zh-cn", prefix: "zh-cn", htmlLang: "zh-CN", ogLocale: "zh_CN", native: "简体中文", short: "ZH-CN", steamLang: "schinese" },
  { key: "zh-tw", prefix: "zh-tw", htmlLang: "zh-TW", ogLocale: "zh_TW", native: "繁體中文", short: "ZH-TW", steamLang: "tchinese" },
  { key: "fr", prefix: "fr", htmlLang: "fr", ogLocale: "fr_FR", native: "Français", short: "FR", steamLang: "french" },
  { key: "de", prefix: "de", htmlLang: "de", ogLocale: "de_DE", native: "Deutsch", short: "DE", steamLang: "german" },
  { key: "es", prefix: "es", htmlLang: "es", ogLocale: "es_ES", native: "Español", short: "ES", steamLang: "spanish" },
  { key: "es-419", prefix: "es-419", htmlLang: "es-419", ogLocale: "es_LA", native: "Español (Latinoamérica)", short: "LATAM", steamLang: "latam" },
  { key: "pt-br", prefix: "pt-br", htmlLang: "pt-BR", ogLocale: "pt_BR", native: "Português (Brasil)", short: "PT-BR", steamLang: "brazilian" },
  { key: "ru", prefix: "ru", htmlLang: "ru", ogLocale: "ru_RU", native: "Русский", short: "RU", steamLang: "russian" },
];

// ---- Minimal RFC4180-ish CSV parser (quoted fields, "" escapes, commas/newlines inside quotes) ----
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function loadTranslations() {
  const csvPath = path.join(ROOT, "i18n", "translations.csv");
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows[0];
  const langCols = header.slice(1); // column headers after "key"
  const table = {}; // key -> { langKey: value }
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const key = row[0];
    if (!key) continue;
    table[key] = {};
    langCols.forEach((langKey, idx) => {
      table[key][langKey] = row[idx + 1] ?? "";
    });
  }
  return table;
}

// Press coverage cards: loaded from i18n/press.csv (id,outlet,url,en,ko,...)
// rather than translations.csv, since this list is expected to grow to a
// large, ever-changing number of rows — keeping it in its own CSV with
// outlet/url columns means adding a new mention is "append a row," not
// "hand-edit the template and 11 language files." A blank title cell falls
// back to the English title so a new row doesn't need every language
// translated before it can go live.
function loadPress() {
  const csvPath = path.join(ROOT, "i18n", "press.csv");
  if (!fs.existsSync(csvPath)) return [];
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows[0];
  const langCols = header.slice(3); // columns after id,outlet,url
  return rows.slice(1)
    .filter((row) => row[0])
    .map((row) => {
      const titles = {};
      langCols.forEach((langKey, idx) => {
        titles[langKey] = row[idx + 3] || "";
      });
      return { id: row[0], outlet: row[1], url: row[2], titles };
    });
}

function buildPressCards(pressItems, lang) {
  if (!pressItems.length) return "";
  return pressItems.map((item) => {
    const title = item.titles[lang.key] || item.titles.en || "";
    return `      <a class="press-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener" aria-label="${escapeHtml(title)} — ${escapeHtml(item.outlet)}">
        <span class="press-outlet">${escapeHtml(item.outlet)}</span>
        <span class="press-title">${escapeHtml(title)}</span>
        <span class="press-link-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M9 7h8v8"/></svg></span>
      </a>`;
  }).join("\n");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function canonicalUrl(lang) {
  return lang.prefix ? `${BASE_URL}/${lang.prefix}/` : `${BASE_URL}/`;
}

function buildHreflangLinks() {
  const enLang = LANGUAGES.find((l) => l.key === "en");
  const lines = LANGUAGES.map(
    (l) => `<link rel="alternate" hreflang="${l.htmlLang}" href="${canonicalUrl(l)}" />`
  );
  lines.push(`<link rel="alternate" hreflang="x-default" href="${canonicalUrl(enLang)}" />`);
  return lines.join("\n");
}

// Relative path from `from`'s page to `to`'s page, so the switcher works
// both on file:// (double-clicking index.html) and once actually deployed —
// an absolute production URL would only work after deployment.
function relativeLangUrl(from, to) {
  if (!to.prefix) return from.prefix ? "../index.html" : "./index.html";
  return from.prefix ? `../${to.prefix}/index.html` : `${to.prefix}/index.html`;
}

function buildLangSwitchList(currentLang) {
  return LANGUAGES.map((l) => {
    if (l.key === currentLang.key) {
      return `<li class="lang-switch-current" aria-current="true">${escapeHtml(l.native)}</li>`;
    }
    return `<li><a href="${relativeLangUrl(currentLang, l)}" hreflang="${l.htmlLang}" lang="${l.htmlLang}">${escapeHtml(l.native)}</a></li>`;
  }).join("\n        ");
}

function renderPage(template, translations, lang, pressItems) {
  let html = template;

  html = html.replaceAll("__HTML_LANG__", lang.htmlLang);
  html = html.replaceAll("__ASSET_PREFIX__", lang.prefix ? "../" : "");
  html = html.replaceAll("__CANONICAL_URL__", canonicalUrl(lang));
  html = html.replaceAll("__OG_LOCALE__", lang.ogLocale);
  html = html.replaceAll("__HREFLANG_LINKS__", buildHreflangLinks());
  html = html.replaceAll("__LANG_CURRENT_LABEL__", lang.short);
  html = html.replaceAll("__LANG_SWITCH_LIST__", buildLangSwitchList(lang));
  html = html.replaceAll("__STEAM_LANG__", lang.steamLang);
  html = html.replaceAll("__PRESS_CARDS__", buildPressCards(pressItems, lang));

  html = html.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key) => {
    const row = translations[key];
    if (!row) {
      throw new Error(`Missing translation key in CSV: ${key}`);
    }
    const value = row[lang.key];
    if (value === undefined || value === "") {
      throw new Error(`Missing "${lang.key}" translation for key: ${key}`);
    }
    return escapeHtml(value);
  });

  return html;
}

function buildSitemap() {
  const urls = LANGUAGES.map((l) => {
    return `  <url>\n    <loc>${canonicalUrl(l)}</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${l.key === "en" ? "1.0" : "0.8"}</priority>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function main() {
  const template = fs.readFileSync(path.join(ROOT, "i18n", "template.html"), "utf8");
  const translations = loadTranslations();
  const pressItems = loadPress();

  for (const lang of LANGUAGES) {
    let html = renderPage(template, translations, lang, pressItems);
    const outDir = lang.prefix ? path.join(ROOT, lang.prefix) : ROOT;
    fs.mkdirSync(outDir, { recursive: true });
    html = applyCacheBusting(html, outDir);
    const outPath = path.join(outDir, "index.html");
    fs.writeFileSync(outPath, html, "utf8");
    console.log(`Wrote ${path.relative(ROOT, outPath)}`);
  }

  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), buildSitemap(), "utf8");
  console.log("Wrote sitemap.xml");
}

main();
