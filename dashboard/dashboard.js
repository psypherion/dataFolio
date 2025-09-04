// dashboard.js

// ---------------- State ----------------
let state = {
  personalInfo: {
    name: "",
    title: "",
    mediumProfile: "",
    githubProfile: "",
    updatedLabel: "",
    defaultTheme: "light"
  },
  navigation: [],
  sidebar: {
    updates: [],
    skillsSections: [],
    quickLinks: []
  },
  projects: [],
  blog: {
    showOnHomepage: true,
    mode: "manual",
    cacheMinutes: 15,
    manualPosts: [],
    normalized: []
  }
};

let editIndex = null; // current project edit index

// ---------------- Utilities ----------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(text, type = "info") {
  const div = document.createElement("div");
  div.textContent = text;
  Object.assign(div.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    padding: "10px 14px",
    borderRadius: "6px",
    zIndex: 9999,
    color: "#fff",
    fontFamily: "Lora, serif",
    boxShadow: "0 2px 10px rgba(0,0,0,.2)",
    background:
      type === "success"
        ? "#28a745"
        : type === "warn"
        ? "#ffc107"
        : type === "error"
        ? "#dc3545"
        : "#2d2d2d",
  });
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2500);
} [6]

function sanitizeId(id) {
  return (id || "").toString().trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
} [6]

function linesToArray(textareaValue) {
  return (textareaValue || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
} [6]

function arrayToLines(arr) {
  return (arr || []).join("\n");
} [6]

function saveDraft() {
  localStorage.setItem("portfolioDataDraft", JSON.stringify(state));
  toast("Draft saved locally", "success");
} [6]

function loadDraft() {
  const raw = localStorage.getItem("portfolioDataDraft");
  if (!raw) return false;
  try {
    state = JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
} [6]

async function loadFromServer() {
  const res = await fetch("/api/config");
  if (!res.ok) {
    toast("Failed to load from server", "error");
    return;
  }
  state = await res.json();
  toast("Loaded from server", "success");
  renderAll();
} [6]

async function publishToServer() {
  const payload = { data: toJSON() };
  const res = await fetch("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    toast("Published to server", "success");
  } else {
    const detail = await res.json().catch(() => ({}));
    toast(`Publish failed: ${(detail && detail.detail) || res.statusText}`, "error");
  }
} [6]

function toJSON() {
  // Return a deep copy to avoid mutations
  return JSON.parse(JSON.stringify(state));
} [6]

function setTheme(theme) {
  if (theme === "dark") {
    document.body.setAttribute("data-theme", "dark");
  } else {
    document.body.removeAttribute("data-theme");
  }
} [6]

// ---------------- Tabs ----------------
function setupTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.dataset.tab;
      $$(".panel").forEach((p) => p.classList.remove("active"));
      $(`#panel-${key}`).classList.add("active");
    });
  });
} [6]

// ---------------- Personal Info ----------------
function bindPersonalInfo() {
  $("#btn-save-personal").addEventListener("click", () => {
    state.personalInfo.name = $("#pi-name").value.trim();
    state.personalInfo.title = $("#pi-title").value.trim();
    state.personalInfo.mediumProfile = $("#pi-medium").value.trim();
    state.personalInfo.githubProfile = $("#pi-github").value.trim();
    state.personalInfo.updatedLabel = $("#pi-updated").value.trim();
    state.personalInfo.defaultTheme = $("#pi-theme").value;
    setTheme(state.personalInfo.defaultTheme);
    toast("Personal info saved", "success");
    saveDraft();
  });

  $("#btn-dark").addEventListener("click", () => {
    const isDark = document.body.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    $("#pi-theme").value = newTheme;
    setTheme(newTheme);
  });
} [6]

function renderPersonalInfo() {
  $("#pi-name").value = state.personalInfo.name || "";
  $("#pi-title").value = state.personalInfo.title || "";
  $("#pi-medium").value = state.personalInfo.mediumProfile || "";
  $("#pi-github").value = state.personalInfo.githubProfile || "";
  $("#pi-updated").value = state.personalInfo.updatedLabel || "";
  $("#pi-theme").value = state.personalInfo.defaultTheme || "light";
  setTheme(state.personalInfo.defaultTheme || "light");
} [6]

// ---------------- Projects List ----------------
function renderProjectsList() {
  $("#projects-count").textContent = (state.projects || []).length;
  const list = $("#projects-list");
  list.innerHTML = "";

  (state.projects || []).forEach((p, idx) => {
    const item = document.createElement("div");
    item.className = "card";
    item.innerHTML = `
      <div class="card-row">
        <div>
          <strong>${p.title}</strong> ${p.featured ? "<span class='badge'>FEATURED</span>" : ""}
          <div class="muted">${p.meta?.category || ""} • ${p.meta?.status || ""} • ${p.meta?.date || ""}</div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-act="edit">Edit</button>
          <button class="btn btn-ghost" data-act="duplicate">Duplicate</button>
          <button class="btn btn-danger" data-act="delete">Delete</button>
        </div>
      </div>
    `;
    item.querySelector("[data-act='edit']").addEventListener("click", () => editProject(idx));
    item.querySelector("[data-act='duplicate']").addEventListener("click", () => duplicateProject(idx));
    item.querySelector("[data-act='delete']").addEventListener("click", () => deleteProject(idx));
    list.appendChild(item);
  });

  $("#btn-new-project").onclick = () => {
    editIndex = null;
    clearProjectForm();
    $(".tab-btn[data-tab='project-editor']").click();
  };
} [6]

// ---------------- Project Editor ----------------
function clearProjectForm() {
  $("#pe-title").textContent = "Add New Project";
  $("#pr-id").value = "";
  $("#pr-title").value = "";
  $("#pr-category").value = "";
  $("#pr-status").value = "";
  $("#pr-date").value = "";
  $("#pr-summary").value = "";
  $("#pr-featured").value = "false";
  $("#media-list").innerHTML = "";
  $("#media-count").textContent = "0";
  $("#pr-tech-title").value = "";
  $("#pr-tech-items").value = "";
  $("#pr-content").value = "";
  $("#pr-link-github").value = "";
  $("#pr-link-demo").value = "";
  $("#pr-link-paper").value = "";
} [6]

function editProject(idx) {
  editIndex = idx;
  const p = state.projects[idx];
  $(".tab-btn[data-tab='project-editor']").click();
  $("#pe-title").textContent = "Edit Project";

  $("#pr-id").value = p.id || "";
  $("#pr-title").value = p.title || "";
  $("#pr-category").value = p.meta?.category || "";
  $("#pr-status").value = p.meta?.status || "";
  $("#pr-date").value = p.meta?.date || "";
  $("#pr-summary").value = p.summary || "";
  $("#pr-featured").value = p.featured ? "true" : "false";

  // Media
  $("#media-list").innerHTML = "";
  (p.media?.tabs || []).forEach(addMediaFormFromData);
  $("#media-count").textContent = (p.media?.tabs || []).length;

  // Tech
  $("#pr-tech-title").value = p.techSpecs?.title || "";
  $("#pr-tech-items").value = arrayToLines(p.techSpecs?.items || []);

  // Content
  $("#pr-content").value = arrayToLines(p.content || []);

  // Links
  $("#pr-link-github").value = p.links?.github || "";
  $("#pr-link-demo").value = p.links?.demo || "";
  $("#pr-link-paper").value = p.links?.paper || "";
} [6]

function duplicateProject(idx) {
  const p = JSON.parse(JSON.stringify(state.projects[idx]));
  p.id = sanitizeId(p.id + "-copy");
  p.title = p.title + " (Copy)";
  state.projects.push(p);
  renderProjectsList();
  saveDraft();
  toast("Project duplicated", "success");
} [6]

function deleteProject(idx) {
  if (!confirm("Delete this project?")) return;
  state.projects.splice(idx, 1);
  renderProjectsList();
  saveDraft();
  toast("Project deleted", "success");
} [6]

function collectProjectFromForm() {
  const id = sanitizeId($("#pr-id").value);
  const title = $("#pr-title").value.trim();
  const meta = {
    category: $("#pr-category").value.trim(),
    status: $("#pr-status").value.trim(),
    date: $("#pr-date").value.trim(),
  };
  const summary = $("#pr-summary").value.trim();
  const featured = $("#pr-featured").value === "true";

  // Media
  const tabs = [];
  $$("#media-list .card").forEach((card) => {
    const type = card.querySelector(".media-type").value;
    const mId = sanitizeId(card.querySelector(".media-id").value);
    const label = card.querySelector(".media-label").value.trim();

    if (type === "video") {
      const videoId = card.querySelector(".media-video-id").value.trim();
      const placeholder = card.querySelector(".media-video-ph").value.trim();
      tabs.push({
        id: mId || "demo",
        label: label || "Demo Video",
        type,
        content: { videoId, placeholder },
      });
    } else if (type === "gallery") {
      const mainSrc = card.querySelector(".gallery-main-src").value.trim();
      const mainAlt = card.querySelector(".gallery-main-alt").value.trim();
      const thumbs = [];
      card.querySelectorAll(".thumb-row").forEach((row) => {
        const tSrc = row.querySelector(".thumb-src").value.trim();
        const tFull = row.querySelector(".thumb-full").value.trim();
        const tAlt = row.querySelector(".thumb-alt").value.trim();
        if (tSrc && tFull) thumbs.push({ src: tSrc, fullSrc: tFull, alt: tAlt });
      });
      tabs.push({
        id: mId || "gallery",
        label: label || "Screenshots",
        type,
        content: { mainImage: { src: mainSrc, alt: mainAlt }, thumbnails: thumbs },
      });
    } else if (type === "diagram") {
      const dSrc = card.querySelector(".diagram-src").value.trim();
      const dAlt = card.querySelector(".diagram-alt").value.trim();
      const dCap = card.querySelector(".diagram-cap").value.trim();
      tabs.push({
        id: mId || "architecture",
        label: label || "Architecture",
        type,
        content: { src: dSrc, alt: dAlt, caption: dCap },
      });
    }
  });

  const techSpecs = {
    title: $("#pr-tech-title").value.trim(),
    items: linesToArray($("#pr-tech-items").value),
  };

  const content = linesToArray($("#pr-content").value);

  const links = {};
  if ($("#pr-link-github").value.trim())
    links.github = $("#pr-link-github").value.trim();
  if ($("#pr-link-demo").value.trim())
    links.demo = $("#pr-link-demo").value.trim();
  if ($("#pr-link-paper").value.trim())
    links.paper = $("#pr-link-paper").value.trim();

  const project = { id, title, meta, summary, featured, content };
  if (tabs.length) project.media = { tabs };
  if (techSpecs.title || techSpecs.items?.length) project.techSpecs = techSpecs;
  if (Object.keys(links).length) project.links = links;

  return project;
} [6]

function bindProjectEditor() {
  $("#btn-clear-project").onclick = clearProjectForm;

  $("#btn-save-project").onclick = () => {
    const project = collectProjectFromForm();
    if (!project.id || !project.title) {
      toast("ID and Title are required", "error");
      return;
    }
    if (editIndex === null) {
      state.projects.unshift(project);
    } else {
      state.projects[editIndex] = project;
    }
    editIndex = null;
    clearProjectForm();
    renderProjectsList();
    saveDraft();
    toast("Project saved", "success");
  };

  $("#btn-add-media").onclick = () => {
    addMediaFormFromData({
      id: "",
      label: "",
      type: "video",
      content: { videoId: "", placeholder: "" },
    });
    updateMediaCount();
  };
} [6]

function updateMediaCount() {
  $("#media-count").textContent = $$("#media-list .card").length;
} [6]

function addMediaFormFromData(tab) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <div class="row-3">
      <div class="form-group">
        <label class="label">Tab ID</label>
        <input class="input media-id" placeholder="demo" value="${tab.id || ""}">
      </div>
      <div class="form-group">
        <label class="label">Label</label>
        <input class="input media-label" placeholder="Demo Video" value="${tab.label || ""}">
      </div>
      <div class="form-group">
        <label class="label">Type</label>
        <select class="select media-type">
          <option value="video">video</option>
          <option value="gallery">gallery</option>
          <option value="diagram">diagram</option>
        </select>
      </div>
    </div>
    <div class="media-body"></div>
    <div class="actions" style="margin-top:8px;">
      <button class="btn btn-danger btn-remove-media" type="button">Remove Tab</button>
    </div>
  `;
  const body = wrap.querySelector(".media-body");
  const typeSel = wrap.querySelector(".media-type");
  typeSel.value = tab.type || "video";

  function renderType(t, data) {
    if (t === "video") {
      body.innerHTML = `
        <div class="row">
          <div class="form-group">
            <label class="label">YouTube Video ID</label>
            <input class="input media-video-id" placeholder="dQw4w9WgXcQ" value="${data?.content?.videoId || ""}">
          </div>
          <div class="form-group">
            <label class="label">Placeholder</label>
            <input class="input media-video-ph" placeholder="Click to load demo..." value="${data?.content?.placeholder || ""}">
          </div>
        </div>
      `;
    } else if (t === "gallery") {
      const thumbs = (data?.content?.thumbnails || [])
        .map(
          (th) => `
        <div class="row-auto thumb-row">
          <input class="input thumb-src" placeholder="Thumb URL" value="${th.src || ""}">
          <input class="input thumb-full" placeholder="Full URL" value="${th.fullSrc || ""}">
          <input class="input thumb-alt" placeholder="Alt" value="${th.alt || ""}">
          <button class="btn btn-warning btn-remove-thumb" type="button">Remove</button>
        </div>
      `
        )
        .join("");
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div class="form-group">
              <label class="label">Main Image URL</label>
              <input class="input gallery-main-src" value="${data?.content?.mainImage?.src || ""}">
            </div>
            <div class="form-group">
              <label class="label">Main Image Alt</label>
              <input class="input gallery-main-alt" value="${data?.content?.mainImage?.alt || ""}">
            </div>
          </div>
          <div class="divider"></div>
          <div><strong>Thumbnails</strong></div>
          <div class="thumbs">${thumbs}</div>
          <div class="actions" style="margin-top:8px;">
            <button class="btn btn-secondary btn-add-thumb" type="button">Add Thumbnail</button>
          </div>
        </div>
      `;
      body.querySelector(".btn-add-thumb").onclick = () => {
        const row = document.createElement("div");
        row.className = "row-auto thumb-row";
        row.innerHTML = `
          <input class="input thumb-src" placeholder="Thumb URL">
          <input class="input thumb-full" placeholder="Full URL">
          <input class="input thumb-alt" placeholder="Alt">
          <button class="btn btn-warning btn-remove-thumb" type="button">Remove</button>
        `;
        body.querySelector(".thumbs").appendChild(row);
        row.querySelector(".btn-remove-thumb").onclick = () => row.remove();
      };
      body.querySelectorAll(".btn-remove-thumb").forEach((btn) => {
        btn.onclick = () => btn.closest(".thumb-row").remove();
      });
    } else if (t === "diagram") {
      body.innerHTML = `
        <div class="row-3">
          <div class="form-group">
            <label class="label">Diagram URL</label>
            <input class="input diagram-src" value="${data?.content?.src || ""}">
          </div>
          <div class="form-group">
            <label class="label">Alt Text</label>
            <input class="input diagram-alt" value="${data?.content?.alt || ""}">
          </div>
          <div class="form-group">
            <label class="label">Caption</label>
            <input class="input diagram-cap" value="${data?.content?.caption || ""}">
          </div>
        </div>
      `;
    }
  }

  renderType(typeSel.value, tab);

  typeSel.addEventListener("change", () => renderType(typeSel.value, {}));
  wrap.querySelector(".btn-remove-media").onclick = () => {
    wrap.remove();
    updateMediaCount();
  };
  $("#media-list").appendChild(wrap);
} [6]

// ---------------- Blog (Manual URLs) ----------------
function renderBlog() {
  $("#blog-count").textContent = (state.blog.manualPosts || []).length;
  $("#blog-show").value = state.blog.showOnHomepage ? "true" : "false";
  $("#blog-ttl").value = state.blog.cacheMinutes || 15;

  const list = $("#blog-list");
  list.innerHTML = "";

  (state.blog.manualPosts || []).forEach((b, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row">
        <div class="form-group">
          <label class="label">URL</label>
          <input class="input blog-url" value="${b.url || ""}" placeholder="https://psypherion.medium.com/...">
        </div>
        <div class="form-group">
          <label class="label">Category</label>
          <input class="input blog-cat" value="${b.category || ""}" placeholder="philosophy / tutorials / reviews / thoughts">
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label class="label">Pinned</label>
          <select class="select blog-pinned">
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        </div>
        <div class="form-group">
          <label class="label">Overrides: Title</label>
          <input class="input ov-title" value="${b.overrides?.title || ""}">
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label class="label">Overrides: Summary</label>
          <textarea class="textarea ov-summary">${b.overrides?.summary || ""}</textarea>
        </div>
        <div class="form-group">
          <label class="label">Overrides: Image URL</label>
          <input class="input ov-image" value="${b.overrides?.image || ""}">
        </div>
      </div>
      <div class="row">
        <div class="form-group">
          <label class="label">Overrides: Date</label>
          <input class="input ov-date" value="${b.overrides?.date || ""}" placeholder="YYYY-MM-DD or ISO">
        </div>
        <div class="form-group">
          <label class="label">Actions</label>
          <div class="actions">
            <button class="btn btn-ghost btn-blog-save">Save</button>
            <button class="btn btn-primary btn-blog-fetch">Fetch metadata</button>
            <button class="btn btn-danger btn-blog-del">Delete</button>
          </div>
        </div>
      </div>
      <div class="preview muted"></div>
    `;
    card.querySelector(".blog-pinned").value = b.pinned ? "true" : "false";

    card.querySelector(".btn-blog-save").onclick = () => {
      const url = card.querySelector(".blog-url").value.trim();
      const category = card.querySelector(".blog-cat").value.trim();
      const pinned = card.querySelector(".blog-pinned").value === "true";
      const overrides = {
        title: card.querySelector(".ov-title").value.trim(),
        summary: card.querySelector(".ov-summary").value.trim(),
        image: card.querySelector(".ov-image").value.trim(),
        date: card.querySelector(".ov-date").value.trim(),
      };
      state.blog.manualPosts[idx] = { url, category, pinned, overrides };
      saveDraft();
      toast("Blog row saved", "success");
    };

    card.querySelector(".btn-blog-del").onclick = () => {
      state.blog.manualPosts.splice(idx, 1);
      renderBlog();
      saveDraft();
      toast("Blog row deleted", "success");
    };

    card.querySelector(".btn-blog-fetch").onclick = async () => {
      const url = card.querySelector(".blog-url").value.trim();
      if (!url) {
        toast("Enter a URL first", "error");
        return;
      }
      try {
        const res = await fetch(`/api/blog/preview?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error("Preview failed");
        const data = await res.json();
        const prev = card.querySelector(".preview");
        prev.innerHTML = `
          ${data.image ? `<img src="${data.image}" alt="">` : ""}
          <div>
            <div><strong>${data.title || ""}</strong></div>
            <div class="muted">${data.date || ""} • ${data.readMinutes || 1} min</div>
            <div>${(data.summary || "").slice(0, 220)}${(data.summary || "").length > 220 ? "..." : ""}</div>
            <div class="muted">${(data.tags || []).map((t) => `<span class="pill">${t}</span>`).join(" ")}</div>
          </div>
        `;
        toast("Fetched preview", "success");
      } catch (e) {
        toast("Failed to fetch preview", "error");
      }
    };

    list.appendChild(card);
  });

  $("#btn-add-blog").onclick = () => {
    state.blog.manualPosts.push({ url: "", category: "", pinned: false, overrides: {} });
    renderBlog();
    saveDraft();
  };

  $("#blog-show").onchange = () => {
    state.blog.showOnHomepage = $("#blog-show").value === "true";
    saveDraft();
  };
} [1]

function renderNormalized() {
  const list = $("#blog-normalized");
  list.innerHTML = "";
  (state.blog.normalized || []).forEach((n) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="preview">
        ${n.image ? `<img src="${n.image}" alt="">` : ""}
        <div>
          <div><strong>${n.title}</strong> ${n.pinned ? `<span class="badge">PINNED</span>` : ""}</div>
          <div class="muted">${n.date || ""} • ${n.readMinutes || 1} min • ${n.category || ""}</div>
          <div>${(n.summary || "").slice(0, 240)}${(n.summary || "").length > 240 ? "..." : ""}</div>
          <div class="muted">${(n.tags || []).map((t) => `<span class="pill">${t}</span>`).join(" ")}</div>
          <div class="muted">${n.url}</div>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  $("#btn-clear-normalized").onclick = () => {
    state.blog.normalized = [];
    renderNormalized();
    saveDraft();
  };
} [1]

function bindBlog() {
  $("#btn-fetch-all").onclick = async () => {
    const urls = (state.blog.manualPosts || []).map((p) => p.url).filter(Boolean);
    if (!urls.length) {
      toast("No URLs to fetch", "warn");
      return;
    }
    const overrides = {};
    const categories = {};
    const pinned = {};
    (state.blog.manualPosts || []).forEach((p) => {
      if (p.overrides) overrides[p.url] = p.overrides;
      if (p.category) categories[p.url] = p.category;
      if (p.pinned) pinned[p.url] = true;
    });
    const ttl = parseInt($("#blog-ttl").value || "15", 10);
    state.blog.cacheMinutes = ttl;

    try {
      const res = await fetch("/api/blog/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, overrides, categories, pinned, ttl }),
      });
      if (!res.ok) throw new Error("Normalize failed");
      const data = await res.json();
      state.blog.normalized = data.normalized || [];
      renderNormalized();
      saveDraft();
      toast("Fetched all & normalized", "success");
    } catch (e) {
      toast("Failed to normalize", "error");
    }
  };
} [1]

// ---------------- Sidebar: Updates, Skills, Quick Links ----------------
function renderUpdates() {
  $("#upd-count").textContent = (state.sidebar.updates || []).length;
  const list = $("#updates-list");
  list.innerHTML = "";
  (state.sidebar.updates || []).forEach((u, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row-3">
        <div class="form-group">
          <label class="label">Date Label</label>
          <input class="input upd-date" value="${u.date || ""}">
        </div>
        <div class="form-group">
          <label class="label">Text</label>
          <input class="input upd-text" value="${u.text || ""}">
        </div>
        <div class="form-group">
          <label class="label">Actions</label>
          <div class="actions">
            <button class="btn btn-ghost btn-upd-save">Save</button>
            <button class="btn btn-danger btn-upd-del">Delete</button>
          </div>
        </div>
      </div>
    `;
    card.querySelector(".btn-upd-save").onclick = () => {
      const date = card.querySelector(".upd-date").value.trim();
      const text = card.querySelector(".upd-text").value.trim();
      state.sidebar.updates[idx] = { date, text };
      saveDraft();
      toast("Update saved", "success");
    };
    card.querySelector(".btn-upd-del").onclick = () => {
      state.sidebar.updates.splice(idx, 1);
      renderUpdates();
      saveDraft();
      toast("Update deleted", "success");
    };
    list.appendChild(card);
  });

  $("#btn-add-update").onclick = () => {
    state.sidebar.updates.unshift({ date: "", text: "" });
    renderUpdates();
    saveDraft();
  };
} [6]

function renderSkills() {
  $("#skills-count").textContent = (state.sidebar.skillsSections || []).length;
  const list = $("#skills-list");
  list.innerHTML = "";
  (state.sidebar.skillsSections || []).forEach((s, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row">
        <div class="form-group">
          <label class="label">Section Title</label>
          <input class="input sk-title" value="${s.title || ""}">
        </div>
        <div class="form-group">
          <label class="label">Items (one per line)</label>
          <textarea class="textarea sk-items">${arrayToLines(s.items || [])}</textarea>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sk-save">Save</button>
        <button class="btn btn-danger btn-sk-del">Delete</button>
      </div>
    `;
    card.querySelector(".btn-sk-save").onclick = () => {
      const title = card.querySelector(".sk-title").value.trim();
      const items = linesToArray(card.querySelector(".sk-items").value);
      state.sidebar.skillsSections[idx] = { title, items };
      saveDraft();
      toast("Skills section saved", "success");
    };
    card.querySelector(".btn-sk-del").onclick = () => {
      state.sidebar.skillsSections.splice(idx, 1);
      renderSkills();
      saveDraft();
      toast("Skills section deleted", "success");
    };
    list.appendChild(card);
  });

  $("#btn-add-skill-section").onclick = () => {
    state.sidebar.skillsSections.push({ title: "", items: [] });
    renderSkills();
    saveDraft();
  };
} [6]

function renderQuickLinks() {
  $("#ql-count").textContent = (state.sidebar.quickLinks || []).length;
  const list = $("#ql-list");
  list.innerHTML = "";
  (state.sidebar.quickLinks || []).forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row-3">
        <div class="form-group">
          <label class="label">Label</label>
          <input class="input ql-label" value="${q.label || ""}">
        </div>
        <div class="form-group">
          <label class="label">URL</label>
          <input class="input ql-url" value="${q.url || ""}">
        </div>
        <div class="form-group">
          <label class="label">Actions</label>
          <div class="actions">
            <button class="btn btn-ghost btn-ql-save">Save</button>
            <button class="btn btn-danger btn-ql-del">Delete</button>
          </div>
        </div>
      </div>
    `;
    card.querySelector(".btn-ql-save").onclick = () => {
      const label = card.querySelector(".ql-label").value.trim();
      const url = card.querySelector(".ql-url").value.trim();
      state.sidebar.quickLinks[idx] = { label, url };
      saveDraft();
      toast("Quick link saved", "success");
    };
    card.querySelector(".btn-ql-del").onclick = () => {
      state.sidebar.quickLinks.splice(idx, 1);
      renderQuickLinks();
      saveDraft();
      toast("Quick link deleted", "success");
    };
    list.appendChild(card);
  });

  $("#btn-add-ql").onclick = () => {
    state.sidebar.quickLinks.push({ label: "", url: "" });
    renderQuickLinks();
    saveDraft();
  };
} [6]

// ---------------- Navigation ----------------
function renderNavigation() {
  $("#nav-count").textContent = (state.navigation || []).length;
  const list = $("#nav-list");
  list.innerHTML = "";
  (state.navigation || []).forEach((n, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row-3">
        <div class="form-group">
          <label class="label">Label</label>
          <input class="input nav-label" value="${n.label || ""}">
        </div>
        <div class="form-group">
          <label class="label">Href</label>
          <input class="input nav-href" value="${n.href || "#"}">
        </div>
        <div class="form-group">
          <label class="label">Actions</label>
          <div class="actions">
            <button class="btn btn-ghost btn-nav-save">Save</button>
            <button class="btn btn-danger btn-nav-del">Delete</button>
          </div>
        </div>
      </div>
    `;
    card.querySelector(".btn-nav-save").onclick = () => {
      const label = card.querySelector(".nav-label").value.trim();
      const href = card.querySelector(".nav-href").value.trim() || "#";
      state.navigation[idx] = { label, href };
      saveDraft();
      toast("Navigation item saved", "success");
    };
    card.querySelector(".btn-nav-del").onclick = () => {
      state.navigation.splice(idx, 1);
      renderNavigation();
      saveDraft();
      toast("Navigation item deleted", "success");
    };
    list.appendChild(card);
  });

  $("#btn-add-nav").onclick = () => {
    state.navigation.push({ label: "", href: "#" });
    renderNavigation();
    saveDraft();
  };
} [6]

// ---------------- JSON Manager ----------------
function bindJSONManager() {
  $("#btn-generate-json").onclick = () => {
    $("#json-preview").textContent = JSON.stringify(toJSON(), null, 2);
    $("#json-status").textContent = "Generated from current form state.";
  };

  $("#btn-download-json").onclick = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(toJSON(), null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = "projects-config.json";
    a.click();
  };

  $("#btn-upload-json").onclick = () => $("#file-json").click();
  $("#file-json").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files;
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      state = data;
      renderAll();
      $("#json-preview").textContent = JSON.stringify(toJSON(), null, 2);
      $("#json-status").textContent = "Imported JSON applied to forms.";
      saveDraft();
      toast("Imported JSON", "success");
    } catch (err) {
      toast("Invalid JSON file", "error");
    } finally {
      e.target.value = "";
    }
  });

  $("#btn-validate-json").onclick = async () => {
    try {
      const res = await fetch("/dashboard/schema.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Schema not found");
      // Client-side smoke check; server PUT /api/config is the authority
      if (!toJSON().personalInfo || !Array.isArray(toJSON().projects)) {
        throw new Error("Missing personalInfo or projects");
      }
      $("#json-status").textContent =
        "Client checks passed. Server-side validation will enforce full schema.";
      toast("Client checks passed", "success");
    } catch (e) {
      $("#json-status").textContent = "Client check failed: " + e.message;
      toast("Client check failed", "error");
    }
  };

  $("#btn-load-server").onclick = loadFromServer;
  $("#btn-save-draft").onclick = saveDraft;
  $("#btn-publish").onclick = publishToServer;
} [6]

// ---------------- Render All ----------------
function renderAll() {
  renderPersonalInfo();
  renderProjectsList();
  renderBlog();
  renderNormalized();
  renderUpdates();
  renderSkills();
  renderQuickLinks();
  renderNavigation();
  $("#json-preview").textContent = JSON.stringify(toJSON(), null, 2);
} [6]

// ---------------- Init ----------------
function init() {
  setupTabs();
  bindPersonalInfo();
  bindProjectEditor();
  bindJSONManager();
  bindBlog();

  // Try draft first; optionally load from server if no draft
  if (!loadDraft()) {
    // loadFromServer(); // optional auto-pull
  }
  renderAll();

  // Wire "New Project" from Projects tab
  $("#btn-new-project").onclick = () => {
    editIndex = null;
    clearProjectForm();
    $(".tab-btn[data-tab='project-editor']").click();
  };
} [6]

document.addEventListener("DOMContentLoaded", init);
