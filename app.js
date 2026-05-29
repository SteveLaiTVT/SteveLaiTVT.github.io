const state = {
  data: null,
  current: Number(localStorage.getItem("novel.current") || 0),
  font: Number(localStorage.getItem("novel.font") || 20),
  theme: localStorage.getItem("novel.theme") || "light",
  view: "shelf",
  stats: null,
};

const chapterEl = document.getElementById("chapter");
const tocEl = document.getElementById("toc");
const siteTitleEl = document.getElementById("siteTitle");
const siteSubtitleEl = document.getElementById("siteSubtitle");
const shelfButton = document.getElementById("shelfButton");
const bookCoverEl = document.getElementById("bookCover");
const bookTitleEl = document.getElementById("bookTitle");
const bookAuthorEl = document.getElementById("bookAuthor");
const bookSubtitleEl = document.getElementById("bookSubtitle");
const bookTaglineEl = document.getElementById("bookTagline");
const currentTitleEl = document.getElementById("currentTitle");
const prevButton = document.getElementById("prevButton");
const nextButton = document.getElementById("nextButton");
const menuButton = document.getElementById("menuButton");
const themeButton = document.getElementById("themeButton");
const linkButton = document.getElementById("linkButton");
const infoButton = document.getElementById("infoButton");
const closeInfoButton = document.getElementById("closeInfoButton");
const infoPanel = document.getElementById("infoPanel");
const infoContent = document.getElementById("infoContent");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function paragraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function siteStatsText() {
  const site = state.stats?.site;
  if (!site) {
    return "浏览人数 --";
  }
  return `浏览人数 ${formatCount(site.visitors)} · 浏览 ${formatCount(site.views)} 次`;
}

function chapterStatsText(chapterId) {
  const stats = state.stats?.chapters?.[chapterId];
  if (!stats) {
    return "本章浏览人数 --";
  }
  return `本章浏览人数 ${formatCount(stats.visitors)} · 浏览 ${formatCount(stats.views)} 次`;
}

function updateStatsUi() {
  document.querySelectorAll("[data-site-stats]").forEach((node) => {
    node.textContent = siteStatsText();
  });

  const siteStatsEl = document.getElementById("siteStats");
  if (siteStatsEl) {
    siteStatsEl.textContent = siteStatsText();
  }

  const chapterStatsEl = document.getElementById("chapterStats");
  if (chapterStatsEl && state.view === "chapter") {
    const chapter = state.data?.chapters?.[state.current];
    chapterStatsEl.textContent = chapter ? chapterStatsText(chapter.id) : "本章浏览人数 --";
  }
}

async function fetchStats() {
  const response = await fetch("/api/stats", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`stats ${response.status}`);
  }
  state.stats = await response.json();
  updateStatsUi();
}

async function recordView(chapterId = null) {
  const key = `novel.view.${chapterId || "site"}`;
  const alreadySent = sessionStorage.getItem(key) === "1";
  const url = alreadySent ? "/api/stats" : "/api/view";
  const options = alreadySent
    ? { cache: "no-store" }
    : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chapterId ? { chapterId } : {}),
        cache: "no-store",
      };

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`view ${response.status}`);
  }
  if (!alreadySent) {
    sessionStorage.setItem(key, "1");
  }
  state.stats = await response.json();
  updateStatsUi();
}

function recordCurrentView() {
  const chapter = state.view === "chapter" ? state.data.chapters[state.current] : null;
  recordView(chapter?.id || null).catch(() => {
    fetchStats().catch(() => {});
  });
}

function chapterIndexFromHash() {
  if (!state.data) {
    return null;
  }
  if (!window.location.hash || window.location.hash === "#shelf") {
    return null;
  }
  const id = decodeURIComponent(window.location.hash.slice(1));
  const index = state.data.chapters.findIndex((chapter) => chapter.id === id);
  return index >= 0 ? index : null;
}

function shelfRequested() {
  return !window.location.hash || window.location.hash === "#shelf";
}

function updateHash(chapter) {
  const nextHash = `#${chapter.id}`;
  if (window.location.hash !== nextHash) {
    history.replaceState(null, "", nextHash);
  }
}

function currentChapterUrl() {
  if (state.view === "shelf") {
    return state.data.canonicalUrl || new URL("./", window.location.href).toString();
  }
  const chapter = state.data.chapters[state.current];
  return chapter.canonicalUrl || new URL(chapter.url || `#${chapter.id}`, window.location.href).toString();
}

function updateProgress() {
  if (!state.data) {
    return;
  }
  if (state.view === "shelf") {
    progressFill.style.width = "0%";
    progressText.textContent = `书架 · ${(state.data.books || []).length || 1}本`;
    return;
  }
  const chapter = state.data.chapters[state.current];
  const book = bookForChapter(chapter);
  const bookChapters = chaptersForBook(book, bookIndex(book));
  const localIndex = Math.max(0, bookChapters.findIndex((item) => item.id === chapter.id));
  const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const chapterScroll = Math.max(0, Math.min(1, window.scrollY / scrollable));
  const ratio = Math.max(0, Math.min(1, (localIndex + chapterScroll) / Math.max(1, bookChapters.length)));
  const percent = Math.round(ratio * 100);
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${book.title} · ${localIndex + 1}/${bookChapters.length} · ${percent}%`;
}

function renderChapter(index, options = {}) {
  const chapters = state.data.chapters;
  state.view = "chapter";
  document.body.classList.remove("shelf-mode");
  state.current = Math.max(0, Math.min(index, chapters.length - 1));
  localStorage.setItem("novel.current", String(state.current));

  const chapter = chapters[state.current];
  const book = bookForChapter(chapter);
  const bookChapters = chaptersForBook(book, bookIndex(book));
  const localIndex = bookChapters.findIndex((item) => item.id === chapter.id);
  if (!options.skipHash) {
    updateHash(chapter);
  }
  currentTitleEl.textContent = chapter.title;
  document.title = `${chapter.title} - ${book.title}`;
  renderBrand(book);
  renderSupport(book);

  const parts = paragraphs(chapter.body);
  let inNote = false;
  const body = parts.map((part) => {
    const normalized = part.replace(/\*\*/g, "").trim();
    if (/^史实依据/.test(normalized)) {
      inNote = true;
      return `<p class="note-title">${escapeHtml(normalized)}</p>`;
    }
    const cls = inNote ? "note" : "";
    return `<p class="${cls}">${escapeHtml(normalized).replaceAll("\n", "<br>")}</p>`;
  }).join("");

  chapterEl.innerHTML = `
    <h1>${escapeHtml(chapter.title)}</h1>
    <div class="chapter-meta">${escapeHtml(book.title)} · ${escapeHtml(book.author || "")}</div>
    <div class="chapter-stats" id="chapterStats">${chapterStatsText(chapter.id)}</div>
    ${body}
  `;

  markToc();
  prevButton.disabled = localIndex <= 0;
  nextButton.disabled = localIndex < 0 || localIndex === bookChapters.length - 1;
  window.scrollTo({ top: 0, behavior: "instant" });
  requestAnimationFrame(updateProgress);
  updateStatsUi();
  recordCurrentView();
}

function bookRecord() {
  return (state.data.books && state.data.books[0]) || {
    id: "shuiguan-wei-kai",
    title: state.data.title,
    subtitle: state.data.subtitle,
    author: state.data.author,
    cover: state.data.cover,
    intro: state.data.intro,
    status: "连载中",
    chapterCount: state.data.chapters.length,
  };
}

function bookIndex(book) {
  return Math.max(0, (state.data.books || []).findIndex((item) => item.id === book?.id));
}

function bookForChapter(chapter) {
  const books = state.data.books?.length ? state.data.books : [bookRecord()];
  return books.find((book) => book.id === chapter?.bookId) || books[0];
}

function chaptersForBook(book, index) {
  if (Array.isArray(book.chapterIds) && book.chapterIds.length) {
    const wanted = new Set(book.chapterIds);
    return state.data.chapters.filter((chapter) => wanted.has(chapter.id));
  }
  if (book.id) {
    const byBookId = state.data.chapters.filter((chapter) => chapter.bookId === book.id);
    if (byBookId.length) {
      return byBookId;
    }
  }
  return index === 0 ? state.data.chapters : [];
}

function renderShelf(options = {}) {
  const books = state.data.books?.length ? state.data.books : [bookRecord()];
  state.view = "shelf";
  document.body.classList.add("shelf-mode");
  renderBrand(books[0]);
  renderSupport(books[0]);
  if (!options.skipHash && window.location.hash !== "#shelf") {
    history.replaceState(null, "", "#shelf");
  }
  currentTitleEl.textContent = state.data.siteTitle || "书架";
  document.title = state.data.siteTitle || "观流夫书架";
  chapterEl.innerHTML = `
    <section class="library">
      <div class="library-header">
        <p class="library-kicker">${escapeHtml(state.data.siteSubtitle || "")}</p>
        <h1>${escapeHtml(state.data.siteTitle || "观流夫书架")}</h1>
      </div>
      <div class="book-shelf">
        ${books.map((book, index) => {
          const intro = book.intro || {};
          const bookChapters = chaptersForBook(book, index);
          const chapterCount = book.chapterCount || bookChapters.length;
          const disabled = bookChapters.length ? "" : "disabled";
          return `
            <article class="shelf-book">
              <img src="${escapeHtml(book.cover?.url || "")}" alt="${escapeHtml(book.cover?.alt || `${book.title}封面`)}">
              <div class="shelf-book-body">
                <div class="book-status">${escapeHtml(book.status || "连载中")} · ${escapeHtml(chapterCount)}章 · <span data-site-stats>${siteStatsText()}</span></div>
                <h2>${escapeHtml(book.title)}</h2>
                <div class="shelf-book-author">${escapeHtml(book.author || "")}</div>
                <p class="shelf-book-tagline">${escapeHtml(intro.tagline || "")}</p>
                <p class="shelf-book-summary">${escapeHtml((intro.summary || "").split(/\n{2,}/)[0] || "")}</p>
                <div class="book-actions">
                  <a class="chapter-nav-button secondary" href="${escapeHtml(book.url || "#shelf")}">作品页</a>
                  <button class="chapter-nav-button" data-open-book="continue" data-book-index="${index}" ${disabled}>继续阅读</button>
                  <button class="chapter-nav-button secondary" data-open-book="first" data-book-index="${index}" ${disabled}>从第一章</button>
                </div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
  chapterEl.querySelectorAll("[data-open-book]").forEach((button) => {
    button.addEventListener("click", () => {
      const bookIndex = Number(button.dataset.bookIndex);
      const book = books[bookIndex] || books[0];
      const bookChapters = chaptersForBook(book, bookIndex);
      const firstIndex = state.data.chapters.findIndex((chapter) => chapter.id === bookChapters[0]?.id);
      if (firstIndex < 0) {
        return;
      }
      const currentBook = state.data.chapters[state.current]?.bookId;
      const currentInBook = currentBook ? currentBook === book.id : bookIndex === 0;
      renderChapter(button.dataset.openBook === "first" || !currentInBook ? firstIndex : state.current);
    });
  });
  prevButton.disabled = true;
  nextButton.disabled = true;
  markToc();
  window.scrollTo({ top: 0, behavior: "instant" });
  requestAnimationFrame(updateProgress);
  updateStatsUi();
  recordCurrentView();
}

function markToc() {
  shelfButton.classList.toggle("active", state.view === "shelf");
  tocEl.querySelectorAll("button[data-nav]").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === state.view);
  });
  tocEl.querySelectorAll("button[data-chapter-index]").forEach((button) => {
    button.classList.toggle(
      "active",
      state.view === "chapter" && Number(button.dataset.chapterIndex) === state.current,
    );
  });
}

function renderToc() {
  tocEl.innerHTML = "";
  const shelf = document.createElement("button");
  shelf.textContent = "书架";
  shelf.dataset.nav = "shelf";
  shelf.addEventListener("click", () => {
    document.body.classList.remove("sidebar-open");
    renderShelf();
  });
  tocEl.appendChild(shelf);

  const books = state.data.books?.length ? state.data.books : [bookRecord()];
  books.forEach((book, index) => {
    const label = document.createElement("div");
    label.className = "toc-label";
    label.textContent = book.title || state.data.title;
    tocEl.appendChild(label);

    chaptersForBook(book, index).forEach((chapter) => {
      const chapterIndex = state.data.chapters.findIndex((item) => item.id === chapter.id);
      const button = document.createElement("button");
      button.textContent = chapter.title;
      button.dataset.chapterIndex = String(chapterIndex);
      button.addEventListener("click", () => {
        document.body.classList.remove("sidebar-open");
        renderChapter(chapterIndex);
      });
      tocEl.appendChild(button);
    });
  });
}

function applyPrefs() {
  document.documentElement.style.setProperty("--font-size", `${state.font}px`);
  document.documentElement.dataset.theme = state.theme;
  themeButton.textContent = state.theme === "dark" ? "昼" : "夜";
}

function renderBrand(book = bookRecord()) {
  siteTitleEl.textContent = state.data.siteTitle || "观流夫书架";
  siteSubtitleEl.textContent = state.data.siteSubtitle || "";
  bookTitleEl.textContent = book.title || state.data.title;
  bookAuthorEl.textContent = book.author || state.data.author || "";
  bookSubtitleEl.textContent = book.subtitle || state.data.subtitle || "";
  bookTaglineEl.textContent = book.intro?.tagline || state.data.intro?.tagline || "";
  if (book.cover?.url) {
    bookCoverEl.src = book.cover.url;
    bookCoverEl.alt = book.cover.alt || `${book.title}封面`;
  }
}

function renderSupport(book = bookRecord()) {
  const support = book.support || state.data.support || {};
  const intro = book.intro || state.data.intro || {};
  if (!book.support && !state.data.support && !intro.summary) {
    infoContent.innerHTML = "";
    return;
  }
  const introHtml = intro.summary ? `
    <section class="info-section intro-section">
      <h2>作品简介</h2>
      <p class="intro-author">${escapeHtml(book.author || state.data.author || "")} 著</p>
      ${paragraphs(intro.summary).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
      ${intro.recommendation ? `<p class="recommendation">${escapeHtml(intro.recommendation)}</p>` : ""}
    </section>
  ` : "";
  const notes = (support.note || [])
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("");
  const characters = (support.characters || [])
    .map((item) => `
      <li>
        <span>${escapeHtml(item.name)}</span>
        <p>${escapeHtml(item.role)}</p>
      </li>
    `)
    .join("");
  const map = (support.map || [])
    .map((item) => `
      <li>
        <span>${escapeHtml(item.name)}</span>
        <p>${escapeHtml(item.desc)}</p>
      </li>
    `)
    .join("");

  infoContent.innerHTML = `
    ${introHtml}
    <section class="info-section">
      <h2>史实说明</h2>
      ${notes}
    </section>
    <section class="info-section">
      <h2>人物表</h2>
      <ul class="info-list">${characters}</ul>
    </section>
    <section class="info-section">
      <h2>地理图</h2>
      <ul class="info-list">${map}</ul>
    </section>
  `;
}

function setInfoOpen(open) {
  document.body.classList.toggle("info-open", open);
  infoPanel.setAttribute("aria-hidden", open ? "false" : "true");
}

async function boot() {
  applyPrefs();
  const response = await fetch("./data/novel.json", { cache: "no-store" });
  state.data = await response.json();
  renderBrand();
  renderToc();
  renderSupport();
  fetchStats().catch(() => {});
  const hashIndex = chapterIndexFromHash();
  if (hashIndex === null && shelfRequested()) {
    renderShelf({ skipHash: true });
  } else {
    renderChapter(hashIndex ?? state.current);
  }
}

document.querySelectorAll("[data-font]").forEach((button) => {
  button.addEventListener("click", () => {
    state.font = Math.max(16, Math.min(28, state.font + Number(button.dataset.font)));
    localStorage.setItem("novel.font", String(state.font));
    applyPrefs();
  });
});

themeButton.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("novel.theme", state.theme);
  applyPrefs();
});

menuButton.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-open");
});

shelfButton.addEventListener("click", () => {
  document.body.classList.remove("sidebar-open");
  renderShelf();
});

linkButton.addEventListener("click", async () => {
  const label = linkButton.textContent;
  try {
    await navigator.clipboard.writeText(currentChapterUrl());
    linkButton.textContent = "已复制";
    linkButton.classList.add("copied");
    setTimeout(() => {
      linkButton.textContent = label;
      linkButton.classList.remove("copied");
    }, 1200);
  } catch {
    window.prompt("章节链接", currentChapterUrl());
  }
});

infoButton.addEventListener("click", () => setInfoOpen(true));
closeInfoButton.addEventListener("click", () => setInfoOpen(false));
infoPanel.addEventListener("click", (event) => {
  if (event.target === infoPanel) {
    setInfoOpen(false);
  }
});

function adjacentChapterIndex(offset) {
  const chapter = state.data?.chapters?.[state.current];
  if (!chapter) {
    return null;
  }
  const book = bookForChapter(chapter);
  const bookChapters = chaptersForBook(book, bookIndex(book));
  const localIndex = bookChapters.findIndex((item) => item.id === chapter.id);
  const target = bookChapters[localIndex + offset];
  if (!target) {
    return null;
  }
  const nextIndex = state.data.chapters.findIndex((item) => item.id === target.id);
  return nextIndex >= 0 ? nextIndex : null;
}

prevButton.addEventListener("click", () => {
  const index = adjacentChapterIndex(-1);
  if (index !== null) {
    renderChapter(index);
  }
});
nextButton.addEventListener("click", () => {
  const index = adjacentChapterIndex(1);
  if (index !== null) {
    renderChapter(index);
  }
});
window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress);
window.addEventListener("hashchange", () => {
  if (shelfRequested()) {
    renderShelf({ skipHash: true });
    return;
  }
  const index = chapterIndexFromHash();
  if (index !== null && index !== state.current) {
    renderChapter(index, { skipHash: true });
  }
});

boot().catch((error) => {
  chapterEl.innerHTML = `<p>加载失败：${escapeHtml(String(error))}</p>`;
});
