// dashboard.js

// ---------------- State ----------------
let state = {
  personalInfo: {
    name: "",
    title: "",
    mediumProfile: "",
    githubProfile: "",
    updatedLabel: "",
    defaultTheme: "light",
  },
  about: {
    tagline: "",
    bio: "",
    photo: { src: "", alt: "" },
    cta: { label: "", url: "" },
    personJSONLD: true,
  },
  navigation: [],
  sidebar: {
    updates: [],
    skillsSections: [],
    quickLinks: [],
  },
  projects: [],
  openSource: [],
  academics: {
    education: [],
    exams: [],
    internships: [],
  },
  blog: {
    showOnHomepage: true,
    mode: "manual",
    cacheMinutes: 15,
    manualPosts: [],
    normalized: [],
    taxonomy: {
      categories: [],
      tagSuggestions: [],
      series: [] // [{id,title,items:[url,...]}]
    }
  },
  settings: {
    accessibility: {
      skipLinkLabel: "Skip to content",
      forceFocusVisible: true,
      minContrastAA: true,
      requireCaptions: false,
    },
    performance: {
      lazyLoadImagesDefault: true,
      responsiveImagesDefault: true,
      maxImageWidth: 2560,
      deferNonCriticalJS: true,
    }
  }
};

let editIndex = null; // current project edit index

// ========== PROJECT IMPORT VARIABLES (NEW) ==========
let importedProject = null;
let isImportMode = false;

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
}

function sanitizeId(id) {
  return (id || "").toString().trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

function linesToArray(textareaValue) {
  return (textareaValue || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function arrayToLines(arr) {
  return (arr || []).join("\n");
}

function saveDraft() {
  localStorage.setItem("portfolioDataDraft", JSON.stringify(state));
  toast("Draft saved locally", "success");
}

function loadDraft() {
  const raw = localStorage.getItem("portfolioDataDraft");
  if (!raw) return false;
  try {
    state = JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

async function loadFromServer() {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) {
    toast("Failed to load from server", "error");
    return;
  }
  state = await res.json();
  toast("Loaded from server", "success");
  renderAll();
}

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
}

function toJSON() {
  // Return a deep copy to avoid mutations
  return JSON.parse(JSON.stringify(state));
}

function setTheme(theme) {
  if (theme === "dark") {
    document.body.setAttribute("data-theme", "dark");
  } else {
    document.body.removeAttribute("data-theme");
  }
}

// ========== PROJECT IMPORT FUNCTIONALITY (NEW) ==========

function setupProjectImport() {
  const fileInput = $("#project-file-input");
  const uploadArea = $("#file-upload-area");
  const importStatus = $("#import-status");
  const importActions = $("#import-actions");
  const importPreview = $("#import-preview");
  
  if (!fileInput || !uploadArea) return;
  
  // File input change handler
  fileInput.addEventListener('change', handleFileSelect);
  
  // Drag and drop functionality
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && files[0].name.endsWith('.json')) {
      fileInput.files = e.dataTransfer.files;
      handleFileSelect();
    } else {
      toast("Please upload a JSON file", "error");
    }
  });
  
  // Import actions
  const importBtn = $("#btn-import-project");
  const cancelBtn = $("#btn-cancel-import");
  
  if (importBtn) importBtn.addEventListener('click', importProject);
  if (cancelBtn) cancelBtn.addEventListener('click', cancelImport);
}

async function handleFileSelect() {
  const fileInput = $("#project-file-input");
  const file = fileInput.files[0];
  
  if (!file) return;
  
  if (!file.name.endsWith('.json')) {
    toast("Please select a JSON file", "error");
    return;
  }
  
  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    toast("File size must be less than 10MB", "error");
    return;
  }
  
  showImportStatus("Uploading and parsing file...", 0);
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/projects/import', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Upload failed');
    }
    
    const result = await response.json();
    importedProject = result.project;
    
    showImportStatus("File processed successfully!", 100);
    displayImportPreview(result.project, result.filename);
    showImportActions();
    
  } catch (error) {
    console.error('Import error:', error);
    toast(`Import failed: ${error.message}`, "error");
    hideImportStatus();
  }
}

function showImportStatus(message, progress) {
  const status = $("#import-status");
  if (!status) return;
  
  const messageEl = status.querySelector('.status-message');
  const progressFill = status.querySelector('.progress-fill');
  
  if (messageEl) messageEl.textContent = message;
  if (progressFill) progressFill.style.width = `${progress}%`;
  status.classList.remove('hidden');
}

function hideImportStatus() {
  const status = $("#import-status");
  if (status) status.classList.add('hidden');
}

function showImportActions() {
  const actions = $("#import-actions");
  if (actions) actions.classList.remove('hidden');
}

function displayImportPreview(project, filename) {
  const preview = $("#import-preview");
  if (!preview) return;
  
  const content = preview.querySelector('.preview-content');
  if (!content) return;
  
  content.innerHTML = `
    <div class="preview-item">
      <strong>File:</strong> ${filename}
    </div>
    <div class="preview-item">
      <strong>Title:</strong> ${project.title || 'Untitled'}
    </div>
    <div class="preview-item">
      <strong>Category:</strong> ${project.meta?.category || 'N/A'}
    </div>
    <div class="preview-item">
      <strong>Status:</strong> ${project.meta?.status || 'N/A'}
    </div>
    <div class="preview-item">
      <strong>Summary:</strong> ${truncateText(project.summary || '', 150)}
    </div>
    <div class="preview-item">
      <strong>Tech Specs:</strong> ${project.techSpecs?.items?.length || 0} items
    </div>
    <div class="preview-item">
      <strong>Media Tabs:</strong> ${project.media?.tabs?.length || 0} tabs
    </div>
    <div class="preview-item">
      <strong>Content Sections:</strong> ${project.content?.length || 0} paragraphs
    </div>
  `;
  
  preview.classList.remove('hidden');
}

function truncateText(text, maxLength) {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function importProject() {
  if (!importedProject) {
    toast("No project data to import", "error");
    return;
  }
  
  try {
    // Populate the project form with imported data
    populateProjectForm(importedProject);
    
    // Set import mode
    isImportMode = true;
    editIndex = null; // New project
    
    // Switch to project editor tab
    const editorTab = $(".tab-btn[data-tab='project-editor']");
    if (editorTab) editorTab.click();
    
    // Update UI
    const formTitle = $("#pe-title");
    if (formTitle) formTitle.textContent = 'Imported Project (Edit & Save)';
    
    toast("Project imported successfully! Please review and save.", "success");
    
    // Clear import UI
    clearImportUI();
    
  } catch (error) {
    console.error('Error populating form:', error);
    toast("Error importing project data", "error");
  }
}

function populateProjectForm(project) {
  // Basic fields
  const fields = {
    'pr-id': project.id || '',
    'pr-title': project.title || '',
    'pr-category': project.meta?.category || '',
    'pr-status': project.meta?.status || '',
    'pr-date': project.meta?.date || '',
    'pr-summary': project.summary || '',
    'pr-role': project.caseStudy?.role || '',
    'pr-resp': arrayToLines(project.caseStudy?.responsibilities || []),
    'pr-featured': project.featured ? 'true' : 'false'
  };
  
  // Populate basic fields
  Object.entries(fields).forEach(([id, value]) => {
    const element = $(`#${id}`);
    if (element) element.value = value;
  });
  
  // Case study fields
  if (project.caseStudy) {
    const caseFields = {
      'pr-problem': project.caseStudy.problem || '',
      'pr-approach': project.caseStudy.approach || '',
      'pr-impact': project.caseStudy.impact || '',
      'pr-outcomes': arrayToLines(project.caseStudy.outcomes || [])
    };
    
    Object.entries(caseFields).forEach(([id, value]) => {
      const element = $(`#${id}`);
      if (element) element.value = value;
    });
  }
  
  // Tech specs
  if (project.techSpecs) {
    const techTitle = $("#pr-tech-title");
    const techItems = $("#pr-tech-items");
    if (techTitle) techTitle.value = project.techSpecs.title || '';
    if (techItems) techItems.value = arrayToLines(project.techSpecs.items || []);
  }
  
  // Content paragraphs
  if (project.content) {
    const contentEl = $("#pr-content");
    if (contentEl) contentEl.value = arrayToLines(project.content);
  }
  
  // Links
  if (project.links) {
    const linkFields = {
      'pr-link-github': project.links.github || '',
      'pr-link-demo': project.links.demo || '',
      'pr-link-paper': project.links.paper || ''
    };
    
    Object.entries(linkFields).forEach(([id, value]) => {
      const element = $(`#${id}`);
      if (element) element.value = value;
    });
  }
  
  // Media tabs (simplified - populate media list)
  if (project.media?.tabs) {
    const mediaList = $("#media-list");
    if (mediaList) {
      mediaList.innerHTML = "";
      project.media.tabs.forEach(addMediaFormFromData);
      updateMediaCount();
    }
  }
}

function cancelImport() {
  clearImportUI();
  importedProject = null;
  isImportMode = false;
}

function clearImportUI() {
  const fileInput = $("#project-file-input");
  const importStatus = $("#import-status");
  const importActions = $("#import-actions");
  const importPreview = $("#import-preview");
  
  if (fileInput) fileInput.value = '';
  if (importStatus) importStatus.classList.add('hidden');
  if (importActions) importActions.classList.add('hidden');
  if (importPreview) importPreview.classList.add('hidden');
}

// ---------------- Tabs ----------------
function setupTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.dataset.tab;
      $$(".panel").forEach((p) => p.classList.remove("active"));
      const panel = document.getElementById(`panel-${key}`);
      if (panel) panel.classList.add("active");
    });
  });
}

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
}

function renderPersonalInfo() {
  $("#pi-name").value = state.personalInfo.name || "";
  $("#pi-title").value = state.personalInfo.title || "";
  $("#pi-medium").value = state.personalInfo.mediumProfile || "";
  $("#pi-github").value = state.personalInfo.githubProfile || "";
  $("#pi-updated").value = state.personalInfo.updatedLabel || "";
  $("#pi-theme").value = state.personalInfo.defaultTheme || "light";
  setTheme(state.personalInfo.defaultTheme || "light");
}

// ---------------- About ----------------
function bindAbout() {
  const btn = $("#btn-save-about");
  if (!btn) return;
  btn.onclick = () => {
    state.about.tagline = $("#about-tagline").value.trim();
    state.about.bio = $("#about-bio").value.trim();
    state.about.photo = {
      src: $("#about-photo-src").value.trim(),
      alt: $("#about-photo-alt").value.trim(),
    };
    state.about.cta = {
      label: $("#about-cta-label").value.trim(),
      url: $("#about-cta-url").value.trim(),
    };
    state.about.personJSONLD = $("#about-jsonld").value === "true";
    saveDraft();
    toast("About saved", "success");
  };
}

function renderAbout() {
  if (!$("#panel-about")) return;
  $("#about-tagline").value = state.about.tagline || "";
  $("#about-bio").value = state.about.bio || "";
  $("#about-photo-src").value = state.about.photo?.src || "";
  $("#about-photo-alt").value = state.about.photo?.alt || "";
  $("#about-cta-label").value = state.about.cta?.label || "";
  $("#about-cta-url").value = state.about.cta?.url || "";
  $("#about-jsonld").value = state.about.personJSONLD ? "true" : "false";
}

// ---------------- Projects List ----------------
function renderProjectsList() {
  $("#projects-count").textContent = (state.projects || []).length;
  const list = $("#projects-list");
  if (!list) return;
  list.innerHTML = "";

  (state.projects || []).forEach((p, idx) => {
    const item = document.createElement("div");
    item.className = "card";
    item.innerHTML = `
      <div class="card-row">
        <div>
          <strong>${p.title || ""}</strong> ${p.featured ? "<span class='badge'>FEATURED</span>" : ""}
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

  const newBtn = $("#btn-new-project");
  if (newBtn) {
    newBtn.onclick = () => {
      editIndex = null;
      clearProjectForm();
      $(".tab-btn[data-tab='project-editor']").click();
    };
  }
}

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

  // Case study fields
  $("#pr-role").value = "";
  $("#pr-resp").value = "";
  $("#pr-problem").value = "";
  $("#pr-approach").value = "";
  $("#pr-impact").value = "";
  $("#pr-outcomes").value = "";
}

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

  // Case study
  $("#pr-role").value = p.caseStudy?.role || "";
  $("#pr-resp").value = (p.caseStudy?.responsibilities || []).join(", ");
  $("#pr-problem").value = p.caseStudy?.problem || "";
  $("#pr-approach").value = p.caseStudy?.approach || "";
  $("#pr-impact").value = p.caseStudy?.impact || "";
  $("#pr-outcomes").value = arrayToLines(p.caseStudy?.outcomes || []);
}

function duplicateProject(idx) {
  const p = JSON.parse(JSON.stringify(state.projects[idx]));
  p.id = sanitizeId((p.id || "project") + "-copy");
  p.title = (p.title || "Untitled") + " (Copy)";
  state.projects.push(p);
  renderProjectsList();
  saveDraft();
  toast("Project duplicated", "success");
}

function deleteProject(idx) {
  if (!confirm("Delete this project?")) return;
  state.projects.splice(idx, 1);
  renderProjectsList();
  saveDraft();
  toast("Project deleted", "success");
}

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

  // Case study
  const caseStudy = {
    role: $("#pr-role").value.trim(),
    responsibilities: ($("#pr-resp").value || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    problem: $("#pr-problem").value.trim(),
    approach: $("#pr-approach").value.trim(),
    impact: $("#pr-impact").value.trim(),
    outcomes: linesToArray($("#pr-outcomes").value),
  };

  const project = { id, title, meta, summary, featured, content };
  if (tabs.length) project.media = { tabs };
  if (techSpecs.title || (techSpecs.items && techSpecs.items.length)) project.techSpecs = techSpecs;
  if (Object.keys(links).length) project.links = links;
  if (
    caseStudy.role ||
    caseStudy.problem ||
    caseStudy.approach ||
    caseStudy.impact ||
    (caseStudy.outcomes && caseStudy.outcomes.length) ||
    (caseStudy.responsibilities && caseStudy.responsibilities.length)
  ) {
    project.caseStudy = caseStudy;
  }

  return project;
}

function bindProjectEditor() {
  const clearBtn = $("#btn-clear-project");
  if (clearBtn) clearBtn.onclick = clearProjectForm;

  const saveBtn = $("#btn-save-project");
  if (saveBtn) {
    saveBtn.onclick = () => {
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
  }

  const addMediaBtn = $("#btn-add-media");
  if (addMediaBtn) {
    addMediaBtn.onclick = () => {
      addMediaFormFromData({
        id: "",
        label: "",
        type: "video",
        content: { videoId: "", placeholder: "" },
      });
      updateMediaCount();
    };
  }
}

function updateMediaCount() {
  const count = $$("#media-list .card").length;
  const badge = $("#media-count");
  if (badge) badge.textContent = count.toString();
}

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
}

// ---------------- Blog (Manual URLs + Taxonomy) ----------------
function renderBlog() {
  if (!$("#panel-blog")) return;

  $("#blog-count").textContent = (state.blog.manualPosts || []).length;
  $("#blog-show").value = state.blog.showOnHomepage ? "true" : "false";
  $("#blog-ttl").value = state.blog.cacheMinutes || 15;

  // Taxonomy textareas
  if ($("#blog-categories")) {
    $("#blog-categories").value = arrayToLines(state.blog.taxonomy?.categories || []);
  }
  if ($("#blog-tag-suggestions")) {
    $("#blog-tag-suggestions").value = arrayToLines(state.blog.taxonomy?.tagSuggestions || []);
  }
  if ($("#blog-series-json")) {
    try {
      $("#blog-series-json").value = JSON.stringify(state.blog.taxonomy?.series || [], null, 2);
    } catch {
      $("#blog-series-json").value = "[]";
    }
  }

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
          <input class="input blog-cat" value="${b.category || ""}" placeholder="philosophy / reviews / psychology / general">
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

  // Taxonomy bindings
  if ($("#blog-categories")) {
    $("#blog-categories").oninput = () => {
      state.blog.taxonomy.categories = linesToArray($("#blog-categories").value);
      saveDraft();
    };
  }
  if ($("#blog-tag-suggestions")) {
    $("#blog-tag-suggestions").oninput = () => {
      state.blog.taxonomy.tagSuggestions = linesToArray($("#blog-tag-suggestions").value);
      saveDraft();
    };
  }
  if ($("#blog-series-json")) {
    $("#blog-series-json").oninput = () => {
      try {
        const val = JSON.parse($("#blog-series-json").value || "[]");
        if (Array.isArray(val)) {
          state.blog.taxonomy.series = val;
          saveDraft();
        }
      } catch {
        // ignore invalid JSON until corrected
      }
    };
  }
}

function renderNormalized() {
  const list = $("#blog-normalized");
  if (!list) return;
  list.innerHTML = "";
  (state.blog.normalized || []).forEach((n) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="preview">
        ${n.image ? `<img src="${n.image}" alt="">` : ""}
        <div>
          <div><strong>${n.title || ""}</strong> ${n.pinned ? `<span class="badge">PINNED</span>` : ""}</div>
          <div class="muted">${n.date || ""} • ${n.readMinutes || 1} min • ${n.category || ""}</div>
          <div>${(n.summary || "").slice(0, 240)}${(n.summary || "").length > 240 ? "..." : ""}</div>
          <div class="muted">${(n.tags || []).map((t) => `<span class="pill">${t}</span>`).join(" ")}</div>
          <div class="muted">${n.url || ""}</div>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  const clearBtn = $("#btn-clear-normalized");
  if (clearBtn) {
    clearBtn.onclick = () => {
      state.blog.normalized = [];
      renderNormalized();
      saveDraft();
    };
  }
}

function collectBlogRowsIntoState() {
  const cards = Array.from(document.querySelectorAll("#blog-list .card"));
  state.blog.manualPosts = cards.map((card) => {
    const url = card.querySelector(".blog-url")?.value.trim() || "";
    const category = card.querySelector(".blog-cat")?.value.trim() || "";
    const pinned = (card.querySelector(".blog-pinned")?.value || "false") === "true";
    const overrides = {
      title: card.querySelector(".ov-title")?.value.trim() || "",
      summary: card.querySelector(".ov-summary")?.value.trim() || "",
      image: card.querySelector(".ov-image")?.value.trim() || "",
      date: card.querySelector(".ov-date")?.value.trim() || "",
    };
    return { url, category, pinned, overrides };
  });
}

function bindBlog() {
  const fetchAllBtn = $("#btn-fetch-all");
  if (!fetchAllBtn) return;
  fetchAllBtn.onclick = async () => {
    // Ensure typed values are captured even if row "Save" wasn't clicked
    collectBlogRowsIntoState();

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
}

// ---------------- Sidebar: Updates, Skills, Quick Links ----------------
function renderUpdates() {
  $("#upd-count").textContent = (state.sidebar.updates || []).length;
  const list = $("#updates-list");
  if (!list) return;
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

  const addBtn = $("#btn-add-update");
  if (addBtn) {
    addBtn.onclick = () => {
      state.sidebar.updates.unshift({ date: "", text: "" });
      renderUpdates();
      saveDraft();
    };
  }
}

function renderSkills() {
  $("#skills-count").textContent = (state.sidebar.skillsSections || []).length;
  const list = $("#skills-list");
  if (!list) return;
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

  const addBtn = $("#btn-add-skill-section");
  if (addBtn) {
    addBtn.onclick = () => {
      state.sidebar.skillsSections.push({ title: "", items: [] });
      renderSkills();
      saveDraft();
    };
  }
}

function renderQuickLinks() {
  $("#ql-count").textContent = (state.sidebar.quickLinks || []).length;
  const list = $("#ql-list");
  if (!list) return;
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

  const addBtn = $("#btn-add-ql");
  if (addBtn) {
    addBtn.onclick = () => {
      state.sidebar.quickLinks.push({ label: "", url: "" });
      renderQuickLinks();
      saveDraft();
    };
  }
}

// ---------------- Navigation ----------------
function renderNavigation() {
  $("#nav-count").textContent = (state.navigation || []).length;
  const list = $("#nav-list");
  if (!list) return;
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

  const addBtn = $("#btn-add-nav");
  if (addBtn) {
    addBtn.onclick = () => {
      state.navigation.push({ label: "", href: "#" });
      renderNavigation();
      saveDraft();
    };
  }
}

// ---------------- Open Source ----------------
function renderOpenSource() {
  const list = $("#oss-list");
  if (!list) return;
  $("#oss-count").textContent = (state.openSource || []).length;
  list.innerHTML = "";
  (state.openSource || []).forEach((o, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row-4">
        <div class="form-group"><label class="label">Name</label><input class="input oss-name" value="${o.name || ""}"></div>
        <div class="form-group"><label class="label">Repo URL</label><input class="input oss-repo" value="${o.repoUrl || ""}"></div>
        <div class="form-group"><label class="label">Demo URL</label><input class="input oss-demo" value="${o.demoUrl || ""}"></div>
        <div class="form-group"><label class="label">License</label><input class="input oss-license" value="${o.license || ""}"></div>
      </div>
      <div class="row">
        <div class="form-group"><label class="label">Blurb</label><textarea class="textarea oss-blurb">${o.blurb || ""}</textarea></div>
        <div class="form-group"><label class="label">Good First Issues URL</label><input class="input oss-gfi" value="${o.goodFirstIssuesUrl || ""}"></div>
      </div>
      <div class="form-group">
        <label class="label">Tags (one per line)</label>
        <textarea class="textarea oss-tags">${arrayToLines(o.tags || [])}</textarea>
      </div>
      <div class="actions">
        <button class="btn btn-ghost oss-save">Save</button>
        <button class="btn btn-danger oss-del">Delete</button>
      </div>
    `;
    card.querySelector(".oss-save").onclick = () => {
      const name = card.querySelector(".oss-name").value.trim();
      const repoUrl = card.querySelector(".oss-repo").value.trim();
      const demoUrl = card.querySelector(".oss-demo").value.trim();
      const license = card.querySelector(".oss-license").value.trim();
      const blurb = card.querySelector(".oss-blurb").value.trim();
      const goodFirstIssuesUrl = card.querySelector(".oss-gfi").value.trim();
      const tags = linesToArray(card.querySelector(".oss-tags").value);
      state.openSource[idx] = { name, repoUrl, demoUrl, license, blurb, goodFirstIssuesUrl, tags };
      saveDraft();
      toast("Open source saved", "success");
    };
    card.querySelector(".oss-del").onclick = () => {
      state.openSource.splice(idx, 1);
      renderOpenSource();
      saveDraft();
      toast("Open source deleted", "success");
    };
    list.appendChild(card);
  });

  const addBtn = $("#btn-add-oss");
  if (addBtn) {
    addBtn.onclick = () => {
      state.openSource.unshift({ name: "", repoUrl: "", demoUrl: "", license: "", blurb: "", goodFirstIssuesUrl: "", tags: [] });
      renderOpenSource();
      saveDraft();
    };
  }
}

// ---------------- Academics ----------------
function renderAcademics() {
  // Education
  const eduList = $("#edu-list");
  if (eduList) {
    $("#edu-count").textContent = (state.academics.education || []).length;
    eduList.innerHTML = "";
    (state.academics.education || []).forEach((e, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="row-4">
          <div class="form-group"><label class="label">Level</label><input class="input edu-level" value="${e.level || ""}" placeholder="secondary/higherSecondary/bachelors/masters"></div>
          <div class="form-group"><label class="label">Institution</label><input class="input edu-inst" value="${e.institution || ""}"></div>
          <div class="form-group"><label class="label">Board/University</label><input class="input edu-board" value="${e.board || ""}"></div>
          <div class="form-group"><label class="label">Location</label><input class="input edu-loc" value="${e.location || ""}"></div>
        </div>
        <div class="row-4">
          <div class="form-group"><label class="label">Start</label><input class="input edu-start" value="${e.start || ""}" placeholder="YYYY or YYYY-MM"></div>
          <div class="form-group"><label class="label">End</label><input class="input edu-end" value="${e.end || ""}"></div>
          <div class="form-group"><label class="label">GPA/Percentage</label><input class="input edu-grade" value="${e.grade || ""}"></div>
          <div class="form-group"><label class="label">Honors</label><input class="input edu-honors" value="${e.honors || ""}"></div>
        </div>
        <div class="form-group">
          <label class="label">Key Coursework (one per line)</label>
          <textarea class="textarea edu-courses">${arrayToLines(e.coursework || [])}</textarea>
        </div>
        <div class="actions">
          <button class="btn btn-ghost edu-save">Save</button>
          <button class="btn btn-danger edu-del">Delete</button>
        </div>
      `;
      card.querySelector(".edu-save").onclick = () => {
        const level = card.querySelector(".edu-level").value.trim();
        const institution = card.querySelector(".edu-inst").value.trim();
        const board = card.querySelector(".edu-board").value.trim();
        const location = card.querySelector(".edu-loc").value.trim();
        const start = card.querySelector(".edu-start").value.trim();
        const end = card.querySelector(".edu-end").value.trim();
        const grade = card.querySelector(".edu-grade").value.trim();
        const honors = card.querySelector(".edu-honors").value.trim();
        const coursework = linesToArray(card.querySelector(".edu-courses").value);
        state.academics.education[idx] = { level, institution, board, location, start, end, grade, honors, coursework };
        saveDraft();
        toast("Education saved", "success");
      };
      card.querySelector(".edu-del").onclick = () => {
        state.academics.education.splice(idx, 1);
        renderAcademics();
        saveDraft();
        toast("Education deleted", "success");
      };
      eduList.appendChild(card);
    });

    const addEdu = $("#btn-add-edu");
    if (addEdu) {
      addEdu.onclick = () => {
        state.academics.education.unshift({ level: "", institution: "", board: "", location: "", start: "", end: "", grade: "", honors: "", coursework: [] });
        renderAcademics();
        saveDraft();
      };
    }
  }

  // Exams
  const examList = $("#exam-list");
  if (examList) {
    $("#exam-count").textContent = (state.academics.exams || []).length;
    examList.innerHTML = "";
    (state.academics.exams || []).forEach((x, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="row-4">
          <div class="form-group"><label class="label">Name</label><input class="input ex-name" value="${x.name || ""}" placeholder="UGC-NET"></div>
          <div class="form-group"><label class="label">Subject</label><input class="input ex-sub" value="${x.subject || ""}"></div>
          <div class="form-group"><label class="label">Authority</label><input class="input ex-auth" value="${x.authority || ""}"></div>
          <div class="form-group"><label class="label">Year</label><input class="input ex-year" value="${x.year || ""}"></div>
        </div>
        <div class="row-4">
          <div class="form-group"><label class="label">Score</label><input class="input ex-score" value="${x.score || ""}"></div>
          <div class="form-group"><label class="label">Percentile</label><input class="input ex-perc" value="${x.percentile || ""}"></div>
          <div class="form-group"><label class="label">Rank</label><input class="input ex-rank" value="${x.rank || ""}"></div>
          <div class="form-group"><label class="label">Certificate URL</label><input class="input ex-cert" value="${x.certificateUrl || ""}"></div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost ex-save">Save</button>
          <button class="btn btn-danger ex-del">Delete</button>
        </div>
      `;
      card.querySelector(".ex-save").onclick = () => {
        const name = card.querySelector(".ex-name").value.trim();
        const subject = card.querySelector(".ex-sub").value.trim();
        const authority = card.querySelector(".ex-auth").value.trim();
        const year = card.querySelector(".ex-year").value.trim();
        const score = card.querySelector(".ex-score").value.trim();
        const percentile = card.querySelector(".ex-perc").value.trim();
        const rank = card.querySelector(".ex-rank").value.trim();
        const certificateUrl = card.querySelector(".ex-cert").value.trim();
        state.academics.exams[idx] = { name, subject, authority, year, score, percentile, rank, certificateUrl };
        saveDraft();
        toast("Exam saved", "success");
      };
      card.querySelector(".ex-del").onclick = () => {
        state.academics.exams.splice(idx, 1);
        renderAcademics();
        saveDraft();
        toast("Exam deleted", "success");
      };
      examList.appendChild(card);
    });

    const addExam = $("#btn-add-exam");
    if (addExam) {
      addExam.onclick = () => {
        state.academics.exams.unshift({
          name: "", subject: "", authority: "", year: "",
          score: "", percentile: "", rank: "", certificateUrl: ""
        });
        renderAcademics();
        saveDraft();
      };
    }
  }

  // Internships
  const intList = $("#int-list");
  if (intList) {
    $("#int-count").textContent = (state.academics.internships || []).length;
    intList.innerHTML = "";
    (state.academics.internships || []).forEach((it, idx) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="row-4">
          <div class="form-group"><label class="label">Organization</label><input class="input in-org" value="${it.org || ""}"></div>
          <div class="form-group"><label class="label">Title</label><input class="input in-title" value="${it.title || ""}"></div>
          <div class="form-group"><label class="label">Team</label><input class="input in-team" value="${it.team || ""}"></div>
          <div class="form-group"><label class="label">Location</label><input class="input in-loc" value="${it.location || ""}"></div>
        </div>
        <div class="row-4">
          <div class="form-group"><label class="label">Start</label><input class="input in-start" value="${it.start || ""}" placeholder="YYYY or YYYY-MM"></div>
          <div class="form-group"><label class="label">End</label><input class="input in-end" value="${it.end || ""}"></div>
          <div class="form-group"><label class="label">Proof URL</label><input class="input in-proof" value="${it.proofUrl || ""}"></div>
          <div class="form-group"><label class="label">Contact (optional)</label><input class="input in-contact" value="${it.contact || ""}" placeholder="supervisor@email"></div>
        </div>
        <div class="row">
          <div class="form-group"><label class="label">Impact Bullets (one per line)</label><textarea class="textarea in-bullets">${arrayToLines(it.bullets || [])}</textarea></div>
          <div class="form-group"><label class="label">Tech (one per line)</label><textarea class="textarea in-tech">${arrayToLines(it.tech || [])}</textarea></div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost in-save">Save</button>
          <button class="btn btn-danger in-del">Delete</button>
        </div>
      `;
      card.querySelector(".in-save").onclick = () => {
        const org = card.querySelector(".in-org").value.trim();
        const title = card.querySelector(".in-title").value.trim();
        const team = card.querySelector(".in-team").value.trim();
        const location = card.querySelector(".in-loc").value.trim();
        const start = card.querySelector(".in-start").value.trim();
        const end = card.querySelector(".in-end").value.trim();
        const proofUrl = card.querySelector(".in-proof").value.trim();
        const contact = card.querySelector(".in-contact").value.trim();
        const bullets = linesToArray(card.querySelector(".in-bullets").value);
        const tech = linesToArray(card.querySelector(".in-tech").value);
        state.academics.internships[idx] = { org, title, team, location, start, end, proofUrl, contact, bullets, tech };
        saveDraft();
        toast("Internship saved", "success");
      };
      card.querySelector(".in-del").onclick = () => {
        state.academics.internships.splice(idx, 1);
        renderAcademics();
        saveDraft();
        toast("Internship deleted", "success");
      };
      intList.appendChild(card);
    });

    const addInt = $("#btn-add-int");
    if (addInt) {
      addInt.onclick = () => {
        state.academics.internships.unshift({
          org: "", title: "", team: "", location: "",
          start: "", end: "", proofUrl: "", contact: "",
          bullets: [], tech: []
        });
        renderAcademics();
        saveDraft();
      };
    }
  }
}

// ---------------- Settings (Accessibility & Performance) ----------------
function renderSettings() {
  if ($("#a11y-skip-label")) $("#a11y-skip-label").value = state.settings.accessibility.skipLinkLabel || "Skip to content";
  if ($("#a11y-focus-visible")) $("#a11y-focus-visible").value = state.settings.accessibility.forceFocusVisible ? "true" : "false";
  if ($("#a11y-contrast-aa")) $("#a11y-contrast-aa").value = state.settings.accessibility.minContrastAA ? "true" : "false";
  if ($("#a11y-require-captions")) $("#a11y-require-captions").value = state.settings.accessibility.requireCaptions ? "true" : "false";

  if ($("#perf-lazy")) $("#perf-lazy").value = state.settings.performance.lazyLoadImagesDefault ? "true" : "false";
  if ($("#perf-responsive")) $("#perf-responsive").value = state.settings.performance.responsiveImagesDefault ? "true" : "false";
  if ($("#perf-maxw")) $("#perf-maxw").value = state.settings.performance.maxImageWidth || 2560;
  if ($("#perf-defer")) $("#perf-defer").value = state.settings.performance.deferNonCriticalJS ? "true" : "false";
}

function bindSettings() {
  if ($("#a11y-skip-label")) $("#a11y-skip-label").oninput = () => { state.settings.accessibility.skipLinkLabel = $("#a11y-skip-label").value.trim(); saveDraft(); };
  if ($("#a11y-focus-visible")) $("#a11y-focus-visible").onchange = () => { state.settings.accessibility.forceFocusVisible = $("#a11y-focus-visible").value === "true"; saveDraft(); };
  if ($("#a11y-contrast-aa")) $("#a11y-contrast-aa").onchange = () => { state.settings.accessibility.minContrastAA = $("#a11y-contrast-aa").value === "true"; saveDraft(); };
  if ($("#a11y-require-captions")) $("#a11y-require-captions").onchange = () => { state.settings.accessibility.requireCaptions = $("#a11y-require-captions").value === "true"; saveDraft(); };

  if ($("#perf-lazy")) $("#perf-lazy").onchange = () => { state.settings.performance.lazyLoadImagesDefault = $("#perf-lazy").value === "true"; saveDraft(); };
  if ($("#perf-responsive")) $("#perf-responsive").onchange = () => { state.settings.performance.responsiveImagesDefault = $("#perf-responsive").value === "true"; saveDraft(); };
  if ($("#perf-maxw")) $("#perf-maxw").oninput = () => { state.settings.performance.maxImageWidth = parseInt($("#perf-maxw").value || "2560", 10); saveDraft(); };
  if ($("#perf-defer")) $("#perf-defer").onchange = () => { state.settings.performance.deferNonCriticalJS = $("#perf-defer").value === "true"; saveDraft(); };
}

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
  
  // File input handler - use files[0] to get the first File object
  $("#file-json").addEventListener("change", async (e) => {
    const input = e.target;
    const file = input && input.files && input.files[0];
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
      $("#json-status").textContent = "Client check failed: " + (err && err.message || err);
      toast("Invalid JSON file", "error");
    } finally {
      input.value = "";
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
}

// ---------------- Render All (extended) ----------------
function renderAll() {
  renderPersonalInfo();
  renderAbout();
  renderProjectsList();
  renderBlog();
  renderNormalized();
  renderUpdates();
  renderSkills();
  renderQuickLinks();
  renderNavigation();
  renderOpenSource();
  renderAcademics();
  renderSettings();
  $("#json-preview").textContent = JSON.stringify(toJSON(), null, 2);
}

// ========== INIT WITH PROJECT IMPORT (ENHANCED) ==========
function init() {
  setupTabs();
  bindPersonalInfo();
  bindAbout();
  bindProjectEditor();
  bindJSONManager();
  bindBlog();
  bindSettings();
  
  // ========== SETUP PROJECT IMPORT (NEW) ==========
  setupProjectImport();

  // Try draft first; optionally load from server if no draft
  if (!loadDraft()) {
    // loadFromServer(); // optional auto-pull
  }
  renderAll();

  // Wire "New Project" from Projects tab
  const newBtn = $("#btn-new-project");
  if (newBtn) {
    newBtn.onclick = () => {
      editIndex = null;
      clearProjectForm();
      $(".tab-btn[data-tab='project-editor']").click();
    };
  }
}
document.addEventListener("DOMContentLoaded", init);

// for missed commit msg