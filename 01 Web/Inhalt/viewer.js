(() => {
  const PER_PAGE = 10;
  const state = {
    entries: [],
    visible: PER_PAGE,
    section: "",
    root: null,
  };

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("hashchange", () => renderRoute());

  async function init() {
    state.section = document.body.dataset.section || "";
    state.root = document.querySelector("[data-entry-root]");

    if (!state.section || !state.root) {
      return;
    }

    state.root.innerHTML = '<div class="status">Einträge werden geladen.</div>';

    try {
      const files = await loadIndex(state.section);
      const entries = await Promise.all(files.map((file) => loadEntry(state.section, file)));
      state.entries = entries
        .filter(Boolean)
        .sort((a, b) => b.sortKey.localeCompare(a.sortKey) || b.file.localeCompare(a.file));
      renderRoute();
    } catch (error) {
      state.root.innerHTML = '<div class="status">Einträge konnten nicht geladen werden.</div>';
      console.error(error);
    }
  }

  async function loadIndex(section) {
    const response = await fetch(`content/${section}/index.json`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Index fehlt: ${section}`);
    }
    const files = await response.json();
    if (!Array.isArray(files)) {
      throw new Error(`Index ist keine Liste: ${section}`);
    }
    return files.filter((file) => typeof file === "string" && file.endsWith(".md"));
  }

  async function loadEntry(section, file) {
    const response = await fetch(`content/${section}/${file}`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    return parseEntry(section, file, text);
  }

  function parseEntry(section, file, text) {
    const parts = splitFrontmatter(text);
    const meta = parseMeta(parts.meta);
    const fileTitle = file.replace(/^\d{8}_?/, "").replace(/\.md$/, "").replace(/[-_]+/g, " ").trim();
    const sortKey = (file.match(/^(\d{8})/) || ["", "00000000"])[1];
    const images = (meta.images || []).slice(0, 5).map((image) => resolvePath(section, image));
    const title = meta.title || titleCase(fileTitle) || "Eintrag";

    return {
      file,
      slug: file.replace(/\.md$/, ""),
      sortKey,
      date: formatDate(sortKey),
      originalDate: meta.original_date || meta.originalDate || "",
      title,
      preview: meta.preview || firstParagraph(parts.body) || "",
      images,
      body: stripDuplicateTitle(parts.body.trim(), title),
    };
  }

  function splitFrontmatter(text) {
    if (!text.startsWith("---")) {
      return { meta: "", body: text };
    }

    const end = text.indexOf("\n---", 3);
    if (end === -1) {
      return { meta: "", body: text };
    }

    return {
      meta: text.slice(3, end).trim(),
      body: text.slice(end + 4).trim(),
    };
  }

  function parseMeta(metaText) {
    const meta = {};
    let currentList = null;

    for (const rawLine of metaText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (currentList && line.startsWith("- ")) {
        meta[currentList].push(cleanValue(line.slice(2)));
        continue;
      }

      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!match) {
        continue;
      }

      const key = match[1];
      const value = cleanValue(match[2]);

      if (key === "images") {
        meta.images = value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
        currentList = "images";
      } else {
        meta[key] = value;
        currentList = null;
      }
    }

    return meta;
  }

  function cleanValue(value) {
    return value.replace(/^['"]|['"]$/g, "").trim();
  }

  function resolvePath(section, path) {
    if (/^(https?:|\/|data:)/i.test(path)) {
      return path;
    }
    return `content/${section}/${path}`;
  }

  function stripDuplicateTitle(body, title) {
    const lines = body.split(/\r?\n/);
    const firstLine = lines[0] || "";

    if (normalizeHeading(firstLine) !== normalizeHeading(title)) {
      return body;
    }

    lines.shift();

    while (lines[0] === "") {
      lines.shift();
    }

    return lines.join("\n").trim();
  }

  function normalizeHeading(value) {
    return String(value)
      .replace(/^#+\s*/, "")
      .trim()
      .toLowerCase();
  }

  function firstParagraph(body) {
    return body
      .replace(/^#+\s+/gm, "")
      .split(/\n\s*\n/)
      .map((part) => part.replace(/\s+/g, " ").trim())
      .find(Boolean) || "";
  }

  function titleCase(text) {
    return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatDate(value) {
    if (!/^\d{8}$/.test(value)) {
      return "";
    }
    return `${value.slice(6, 8)}.${value.slice(4, 6)}.${value.slice(0, 4)}`;
  }

  function renderRoute() {
    if (!state.root) {
      return;
    }

    const slug = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    const entry = state.entries.find((item) => item.slug === slug);

    if (slug && entry) {
      document.body.classList.add("entry-open");
      renderDetail(entry);
    } else {
      document.body.classList.remove("entry-open");
      renderList();
    }
  }

  function renderList() {
    if (!state.entries.length) {
      state.root.innerHTML = '<div class="status">Noch keine Einträge vorhanden.</div>';
      return;
    }

    const entries = state.entries.slice(0, state.visible);
    const cards = entries.map(renderPreview).join("");
    const hasMore = state.visible < state.entries.length;

    state.root.innerHTML = `
      <div class="entry-list">${cards}</div>
      ${hasMore ? '<button class="load-more" type="button">Mehr laden</button>' : ""}
    `;

    const button = state.root.querySelector(".load-more");
    if (button) {
      button.addEventListener("click", () => {
        state.visible += PER_PAGE;
        renderList();
      });
    }
  }

  function renderPreview(entry) {
    const image = entry.images[0];
    return `
      <a class="entry-preview${image ? "" : " no-image"}" href="#${encodeURIComponent(entry.slug)}">
        <div>
          ${entry.date ? `<time class="entry-date" datetime="${escapeAttribute(entry.sortKey)}">${escapeHtml(entry.date)}</time>` : ""}
          <h3 class="entry-title">${escapeHtml(entry.title)}</h3>
          <p class="entry-intro">${escapeHtml(entry.preview)}</p>
        </div>
        ${image ? `<img class="entry-preview-image" src="${escapeAttribute(image)}" alt="">` : ""}
      </a>
    `;
  }

  function renderDetail(entry) {
    const gallery = entry.images.length
      ? `<div class="gallery">${entry.images.map((image) => `<img src="${escapeAttribute(image)}" alt="">`).join("")}</div>`
      : "";

    state.root.innerHTML = `
      <a class="back-link" href="#">Zur Übersicht</a>
      <article class="entry-detail">
        <div class="detail-head">
          ${entry.date ? `<time class="entry-date" datetime="${escapeAttribute(entry.sortKey)}">${escapeHtml(entry.date)}</time>` : ""}
          <h2>${escapeHtml(entry.title)}</h2>
          ${entry.preview ? `<p>${escapeHtml(entry.preview)}</p>` : ""}
        </div>
        ${gallery}
        <div class="markdown">${renderMarkdown(entry.body)}</div>
      </article>
    `;
  }

  function renderMarkdown(markdown) {
    const blocks = markdown.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
    return blocks.map(renderBlock).join("");
  }

  function renderBlock(block) {
    if (/^###\s+/.test(block)) {
      return `<h3>${inlineMarkdown(block.replace(/^###\s+/, ""))}</h3>`;
    }
    if (/^##\s+/.test(block)) {
      return `<h2>${inlineMarkdown(block.replace(/^##\s+/, ""))}</h2>`;
    }
    if (/^#\s+/.test(block)) {
      return `<h1>${inlineMarkdown(block.replace(/^#\s+/, ""))}</h1>`;
    }
    if (/^[-*]\s+/m.test(block)) {
      const items = block.split(/\r?\n/)
        .filter((line) => /^[-*]\s+/.test(line.trim()))
        .map((line) => `<li>${inlineMarkdown(line.trim().replace(/^[-*]\s+/, ""))}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${inlineMarkdown(block.replace(/\n/g, " "))}</p>`;
  }

  function inlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return html;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
