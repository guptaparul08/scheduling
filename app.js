const STORAGE_KEY = "ritual-flow-v1";
const GOOGLE_CLIENT_ID = "654954244387-nin76cpo9g0t9adkmnnumn85ot8n3uq9.apps.googleusercontent.com";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMPACT_DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const RitualFlowCore = window.RitualFlowCore || {};
const parseRitualCsv = RitualFlowCore.parseRitualCsv;
const escapeCsv = RitualFlowCore.escapeCsv;
const buildSyncableState = RitualFlowCore.buildSyncableState;
const createPersistedSnapshot = RitualFlowCore.createPersistedSnapshot;
const hydratePersistedState = RitualFlowCore.hydratePersistedState;
const createSyncEnvelope = RitualFlowCore.createSyncEnvelope;
const applySyncEnvelope = RitualFlowCore.applySyncEnvelope;
const reorderItems = RitualFlowCore.reorderItems;
const RitualFlowSync = window.RitualFlowSync || {};
const persistedSnapshot = loadPersistedSnapshot();
const state = persistedSnapshot.state;
const cloudState = persistedSnapshot.cloud;
const driveSyncController =
  typeof RitualFlowSync.createDriveSyncController === "function"
    ? RitualFlowSync.createDriveSyncController()
    : null;

const todayDate = document.querySelector("#today-date");
const todaySummary = document.querySelector("#today-summary");
const todayRituals = document.querySelector("#today-rituals");
const dayPicker = document.querySelector("#day-picker");
const ritualForm = document.querySelector("#ritual-form");
const ritualIdInput = document.querySelector("#ritual-id");
const ritualNameInput = document.querySelector("#ritual-name");
const ritualNoteInput = document.querySelector("#ritual-note");
const ritualActiveInput = document.querySelector("#ritual-active");
const itemInput = document.querySelector("#item-input");
const itemList = document.querySelector("#item-list");
const ritualLibrary = document.querySelector("#ritual-library");
const cancelEditButton = document.querySelector("#cancel-edit");
const cancelEditTopButton = document.querySelector("#cancel-edit-top");
const exportCsvButton = document.querySelector("#export-csv-button");
const importCsvInput = document.querySelector("#import-csv-input");
const importStatus = document.querySelector("#import-status");
const devToolsCard = document.querySelector("#dev-tools-card");
const simulateNextDayButton = document.querySelector("#simulate-next-day-button");
const simulateNextDayStatus = document.querySelector("#simulate-next-day-status");
const editBanner = document.querySelector("#edit-banner");
const editTitle = document.querySelector("#edit-title");
const saveRitualButton = document.querySelector("#save-ritual-button");
const showRitualFormButton = document.querySelector("#show-ritual-form-button");
const plansTitle = document.querySelector("#plans-title");
const plansNote = document.querySelector("#plans-note");
const plansEmptyTitle = document.querySelector("#plans-empty-title");
const plansEmptyNote = document.querySelector("#plans-empty-note");
const plansList = document.querySelector("#plans-list");
const plansEmptyState = document.querySelector("#plans-empty-state");
const planInput = document.querySelector("#plan-input");
const addPlanButton = document.querySelector("#add-plan-button");
const googleSignInButton = document.querySelector("#google-sign-in-button");
const googleSyncNowButton = document.querySelector("#google-sync-now-button");
const googleSignOutButton = document.querySelector("#google-sign-out-button");
const googleSyncStatus = document.querySelector("#google-sync-status");
const googleSyncAccount = document.querySelector("#google-sync-account");
const googleSyncMeta = document.querySelector("#google-sync-meta");
const themeMediaQuery =
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let ritualLibrarySortable = null;
let draftItemSortable = null;
let plansSortable = null;
let activeMenuRitualId = null;
let lastSyncableSignature = getSyncableSignature(state);
let syncTimer = null;
let syncInFlight = false;
let syncStatusMessage = "";
let syncErrorMessage = "";
let isGoogleAuthReady = false;

initialize();

function initialize() {
  seedDemoRituals();
  cloudState.googleClientId = GOOGLE_CLIENT_ID;
  if (driveSyncController) {
    driveSyncController.setClientId(cloudState.googleClientId);
  }
  syncDayState();
  applyTheme();
  syncDevToolsVisibility();
  renderDayPicker();
  bindEvents();
  renderApp();
  initializeGoogleSync();
}

function bindEvents() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      state.screen = button.dataset.screen;
      saveState();
      renderApp();
    });
  });

  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.todayView = button.dataset.viewMode;
      saveState();
      renderToday();
      syncViewModeButtons();
    });
  });

  document.querySelectorAll("[data-plans-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.plansView = button.dataset.plansView;
      saveState();
      renderPlans();
      syncPlansViewButtons();
    });
  });

  document.querySelectorAll("[data-theme-preference]").forEach((button) => {
    button.addEventListener("click", () => {
      state.themePreference = button.dataset.themePreference;
      applyTheme();
      saveState();
      syncThemeButtons();
    });
  });

  if (themeMediaQuery) {
    const handleThemeChange = () => {
      if (state.themePreference === "system") {
        applyTheme();
      }
    };

    if (typeof themeMediaQuery.addEventListener === "function") {
      themeMediaQuery.addEventListener("change", handleThemeChange);
    } else if (typeof themeMediaQuery.addListener === "function") {
      themeMediaQuery.addListener(handleThemeChange);
    }
  }

  document.querySelector("#add-item-button").addEventListener("click", addDraftItem);
  itemInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraftItem();
    }
  });
  ritualNameInput.addEventListener("input", syncEditState);

  ritualForm.addEventListener("submit", handleSubmit);
  cancelEditButton.addEventListener("click", resetForm);
  cancelEditTopButton.addEventListener("click", resetForm);
  exportCsvButton.addEventListener("click", exportRitualsCsv);
  importCsvInput.addEventListener("change", handleImportCsv);
  showRitualFormButton.addEventListener("click", openNewRitualForm);
  simulateNextDayButton.addEventListener("click", simulateNextDay);
  addPlanButton.addEventListener("click", addPlanItem);
  planInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addPlanItem();
    }
  });
  googleSignInButton.addEventListener("click", handleGoogleSignIn);
  googleSyncNowButton.addEventListener("click", () => synchronizeWithDrive({ manual: true }));
  googleSignOutButton.addEventListener("click", handleGoogleSignOut);

  document.body.addEventListener("click", (event) => {
    const openScreen = event.target.closest("[data-open-screen]");
    if (openScreen) {
      state.screen = openScreen.dataset.openScreen;
      saveState();
      renderApp();
    }

    const menuToggle = event.target.closest("[data-menu-toggle-id]");
    if (menuToggle) {
      const ritualId = menuToggle.dataset.menuToggleId;
      activeMenuRitualId = activeMenuRitualId === ritualId ? null : ritualId;
      renderLibrary();
      initializeSortables();
      return;
    }

    const removeDraftIndex = event.target.closest("[data-remove-draft-index]");
    if (removeDraftIndex) {
      const index = Number(removeDraftIndex.dataset.removeDraftIndex);
      state.draftItems.splice(index, 1);
      renderDraftItems();
      syncEditState();
    }

    const editButton = event.target.closest("[data-edit-ritual-id]");
    if (editButton) {
      populateForm(editButton.dataset.editRitualId);
    }

    const archiveButton = event.target.closest("[data-archive-ritual-id]");
    if (archiveButton) {
      activeMenuRitualId = null;
      toggleArchive(archiveButton.dataset.archiveRitualId);
    }

    const deleteButton = event.target.closest("[data-delete-ritual-id]");
    if (deleteButton) {
      activeMenuRitualId = null;
      deleteRitual(deleteButton.dataset.deleteRitualId);
    }

    const toggleExpand = event.target.closest("[data-toggle-expand-id]");
    if (toggleExpand) {
      const ritualId = toggleExpand.dataset.toggleExpandId;
      state.expandedRitualIds[ritualId] = !state.expandedRitualIds[ritualId];
      saveState();
      renderToday();
    }

    const markAllDone = event.target.closest("[data-mark-all-id]");
    if (markAllDone) {
      markAllItems(markAllDone.dataset.markAllId, true);
    }

    const resetDay = event.target.closest("[data-reset-day-id]");
    if (resetDay) {
      markAllItems(resetDay.dataset.resetDayId, false);
    }

    const dayPill = event.target.closest("[data-day-index]");
    if (dayPill) {
      const dayIndex = Number(dayPill.dataset.dayIndex);
      toggleDraftDay(dayIndex);
    }

    const movePlanButton = event.target.closest("[data-move-plan-id]");
    if (movePlanButton) {
      movePlanToOtherBucket(movePlanButton.dataset.movePlanId);
    }

    const deletePlanButton = event.target.closest("[data-delete-plan-id]");
    if (deletePlanButton) {
      deletePlan(deletePlanButton.dataset.deletePlanId);
    }

    if (!event.target.closest(".menu-wrap") && activeMenuRitualId !== null) {
      activeMenuRitualId = null;
      renderLibrary();
      initializeSortables();
    }
  });

  document.body.addEventListener("change", (event) => {
    if (event.target.matches("[data-item-checkbox]")) {
      const ritualId = event.target.dataset.ritualId;
      const itemId = event.target.dataset.itemId;
      setItemCompletion(ritualId, itemId, event.target.checked);
    }

    if (event.target.matches("[data-plan-checkbox]")) {
      togglePlanCompletion(event.target.dataset.planId, event.target.checked);
    }
  });
}

function renderApp() {
  syncDayState();
  syncDevToolsVisibility();
  applyTheme();
  document.querySelector("#today-screen").classList.toggle("is-hidden", state.screen !== "today");
  document.querySelector("#rituals-screen").classList.toggle("is-hidden", state.screen !== "rituals");
  document.querySelector("#plans-screen").classList.toggle("is-hidden", state.screen !== "plans");
  document.querySelector("#settings-screen").classList.toggle("is-hidden", state.screen !== "settings");

  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === state.screen);
  });

  syncViewModeButtons();
  syncPlansViewButtons();
  syncThemeButtons();
  renderToday();
  renderDraftItems();
  renderLibrary();
  renderPlans();
  renderGoogleSync();
  syncEditState();
  initializeSortables();
}

function renderToday() {
  syncDayState();
  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const dayIndex = today.getDay();
  const ritualsForToday = state.rituals.filter((ritual) => ritual.isActive && ritual.days.includes(dayIndex));

  todayDate.textContent = todayLabel;
  todaySummary.textContent = `${ritualsForToday.length} ritual${ritualsForToday.length === 1 ? "" : "s"} scheduled`;
  todayRituals.innerHTML = "";

  if (!ritualsForToday.length) {
    const emptyState = document.querySelector("#empty-state-template").content.cloneNode(true);
    todayRituals.append(emptyState);
    return;
  }

  ritualsForToday.forEach((ritual) => {
    const completedCount = ritual.items.filter((item) => isItemComplete(ritual.id, item.id)).length;
    const isExpanded = Object.prototype.hasOwnProperty.call(state.expandedRitualIds, ritual.id)
      ? state.expandedRitualIds[ritual.id]
      : true;

    const card = document.createElement("article");
    card.className = "ritual-card";
    card.innerHTML = `
      <div class="ritual-card-header">
        <div>
          <h3>${escapeHtml(ritual.name)}</h3>
          <p class="ritual-meta">
            ${escapeHtml(ritual.note || "No note")} · ${completedCount}/${ritual.items.length} done
          </p>
        </div>
        <div class="ritual-actions">
          <button class="ghost-button" data-toggle-expand-id="${ritual.id}" type="button">
            ${isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      ${renderRitualBody(ritual, isExpanded)}
    `;
    todayRituals.append(card);
  });
}

function renderRitualBody(ritual, isExpanded) {
  if (!isExpanded) {
    return "";
  }

  const footer = `
    <div class="ritual-actions" style="margin-top: 18px;">
      <button class="secondary-button" data-mark-all-id="${ritual.id}" type="button">Mark all done</button>
      <button class="secondary-button" data-reset-day-id="${ritual.id}" type="button">Reset for today</button>
    </div>
  `;

  if (state.todayView === "simple") {
    return `
      <div class="simple-items">${ritual.items
        .map((item) => `<div>${escapeHtml(item.label)}</div>`)
        .join("")}</div>
      ${footer}
    `;
  }

  const checklist = ritual.items
    .map((item) => {
      const isComplete = isItemComplete(ritual.id, item.id);
      return `
        <label class="checkbox-row">
          <input
            data-item-checkbox
            data-ritual-id="${ritual.id}"
            data-item-id="${item.id}"
            type="checkbox"
            ${isComplete ? "checked" : ""}
          />
          <span class="${isComplete ? "is-complete" : ""}">${escapeHtml(item.label)}</span>
        </label>
      `;
    })
    .join("");

  return `<div class="checklist">${checklist}</div>${footer}`;
}

function renderDayPicker() {
  dayPicker.innerHTML = "";

  DAY_LABELS.forEach((label, index) => {
    const selected = state.draftDays.includes(index);
    const button = document.createElement("button");
    button.className = `day-pill${selected ? " is-selected" : ""}`;
    button.dataset.dayIndex = String(index);
    button.type = "button";
    button.textContent = label;
    dayPicker.append(button);
  });
}

function renderDraftItems() {
  itemList.innerHTML = "";

  if (!state.draftItems.length) {
    const placeholder = document.createElement("li");
    placeholder.innerHTML = `<span>No items yet</span>`;
    itemList.append(placeholder);
    return;
  }

  state.draftItems.forEach((item, index) => {
    const li = document.createElement("li");
    li.dataset.itemId = item.id;
    li.innerHTML = `
      <div class="drag-row">
        <span class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">::</span>
        <span class="item-text">${escapeHtml(item.label)}</span>
      </div>
      <div class="inline-actions">
        <button class="text-button is-danger" data-remove-draft-index="${index}" type="button">Remove</button>
      </div>
    `;
    itemList.append(li);
  });
}

function renderLibrary() {
  ritualLibrary.innerHTML = "";

  if (!state.rituals.length) {
    ritualLibrary.innerHTML = `
      <div class="empty-state">
        <h3>No rituals yet</h3>
        <p>Start with one recurring ritual and build from there.</p>
      </div>
    `;
    return;
  }

  const activeRituals = state.rituals.filter((ritual) => ritual.isActive);
  const archivedRituals = state.rituals.filter((ritual) => !ritual.isActive);

  renderRitualSection(activeRituals, "Active");

  if (archivedRituals.length) {
    renderRitualSection(archivedRituals, "Archived");
  }
}

function renderRitualSection(rituals, label) {
  const heading = document.createElement("p");
  heading.className = "panel-label section-label";
  heading.textContent = label;
  ritualLibrary.append(heading);

  rituals.forEach((ritual) => {
    const compactDays = ritual.days.map((day) => COMPACT_DAY_LABELS[day]).join(" ");
    const card = document.createElement("article");
    card.className = "library-card";
    card.dataset.ritualId = ritual.id;
    card.innerHTML = `
      <div class="library-card-header">
        <div>
          <h3>${escapeHtml(ritual.name)}</h3>
          <p class="ritual-meta">
            ${escapeHtml(ritual.note || "No note")} · ${ritual.items.length} item${ritual.items.length === 1 ? "" : "s"}
          </p>
          <p class="ritual-meta ritual-days">${compactDays || "No days selected"}</p>
          <p class="ritual-meta">${ritual.isActive ? "Active" : "Archived"}</p>
        </div>
        <div class="library-actions">
          <span class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">::</span>
          <button class="ghost-button" data-edit-ritual-id="${ritual.id}" type="button">Edit</button>
          <div class="menu-wrap">
            <button class="ghost-button more-button" data-menu-toggle-id="${ritual.id}" type="button">...</button>
            <div class="overflow-menu ${activeMenuRitualId === ritual.id ? "" : "is-hidden"}">
              <button class="ghost-button" data-archive-ritual-id="${ritual.id}" type="button">
                ${ritual.isActive ? "Archive" : "Activate"}
              </button>
              <button class="text-button is-danger" data-delete-ritual-id="${ritual.id}" type="button">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
    ritualLibrary.append(card);
  });
}

function addDraftItem() {
  const label = itemInput.value.trim();

  if (!label) {
    return;
  }

  state.draftItems.push({ id: generateId(), label });
  itemInput.value = "";
  renderDraftItems();
}

function toggleDraftDay(dayIndex) {
  if (state.draftDays.includes(dayIndex)) {
    state.draftDays = state.draftDays.filter((day) => day !== dayIndex);
  } else {
    state.draftDays = [...state.draftDays, dayIndex].sort((a, b) => a - b);
  }

  renderDayPicker();
}

function handleSubmit(event) {
  event.preventDefault();

  const ritual = {
    id: ritualIdInput.value || generateId(),
    name: ritualNameInput.value.trim(),
    note: ritualNoteInput.value.trim(),
    days: [...state.draftDays],
    items: [...state.draftItems],
    isActive: ritualActiveInput.checked,
  };

  if (!ritual.name || !ritual.items.length || !ritual.days.length) {
    window.alert("Add a name, at least one checklist item, and at least one day.");
    return;
  }

  const existingIndex = state.rituals.findIndex((entry) => entry.id === ritual.id);
  if (existingIndex >= 0) {
    state.rituals[existingIndex] = ritual;
  } else {
    state.rituals.push(ritual);
  }

  saveState();
  resetForm();
  renderApp();
}

function populateForm(ritualId) {
  const ritual = state.rituals.find((entry) => entry.id === ritualId);
  if (!ritual) {
    return;
  }

  ritualIdInput.value = ritual.id;
  ritualNameInput.value = ritual.name;
  ritualNoteInput.value = ritual.note;
  ritualActiveInput.checked = ritual.isActive;
  state.draftItems = ritual.items.map((item) => ({ ...item }));
  state.draftDays = [...ritual.days];
  state.isFormOpen = true;
  state.screen = "rituals";
  saveState();
  renderDayPicker();
  renderDraftItems();
  renderApp();
  ritualForm.scrollIntoView({ behavior: "smooth", block: "start" });
  ritualNameInput.focus();
}

function resetForm() {
  ritualForm.reset();
  ritualIdInput.value = "";
  ritualActiveInput.checked = true;
  state.draftItems = [];
  state.draftDays = [];
  state.isFormOpen = false;
  renderDayPicker();
  renderDraftItems();
  saveState();
  syncEditState();
  renderApp();
}

function toggleArchive(ritualId) {
  const ritual = state.rituals.find((entry) => entry.id === ritualId);
  if (!ritual) {
    return;
  }

  ritual.isActive = !ritual.isActive;
  saveState();
  renderApp();
}

function deleteRitual(ritualId) {
  const confirmed = window.confirm("Delete this ritual?");
  if (!confirmed) {
    return;
  }

  state.rituals = state.rituals.filter((entry) => entry.id !== ritualId);
  delete state.expandedRitualIds[ritualId];
  const dailyCompletions = state.completions[currentDateKey()];
  if (dailyCompletions && dailyCompletions[ritualId]) {
    delete dailyCompletions[ritualId];
  }
  saveState();
  renderApp();
}

function setItemCompletion(ritualId, itemId, completed) {
  const dateKey = currentDateKey();
  if (!state.completions[dateKey]) {
    state.completions[dateKey] = {};
  }
  if (!state.completions[dateKey][ritualId]) {
    state.completions[dateKey][ritualId] = {};
  }
  state.completions[dateKey][ritualId][itemId] = completed;
  saveState();
  renderToday();
}

function markAllItems(ritualId, completed) {
  const ritual = state.rituals.find((entry) => entry.id === ritualId);
  if (!ritual) {
    return;
  }

  const dateKey = currentDateKey();
  if (!state.completions[dateKey]) {
    state.completions[dateKey] = {};
  }
  if (!state.completions[dateKey][ritualId]) {
    state.completions[dateKey][ritualId] = {};
  }

  ritual.items.forEach((item) => {
    state.completions[dateKey][ritualId][item.id] = completed;
  });

  saveState();
  renderToday();
}

function isItemComplete(ritualId, itemId) {
  const dailyCompletions = state.completions[currentDateKey()];
  if (!dailyCompletions || !dailyCompletions[ritualId]) {
    return false;
  }

  return Boolean(dailyCompletions[ritualId][itemId]);
}

function syncViewModeButtons() {
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewMode === state.todayView);
  });
}

function syncPlansViewButtons() {
  document.querySelectorAll("[data-plans-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.plansView === state.plansView);
  });
}

function renderPlans() {
  const bucketKey = state.plansView === "this-week" ? "thisWeek" : "backlog";
  const bucketItems = state.plans[bucketKey];

  if (state.plansView === "this-week") {
    plansTitle.textContent = "This Week";
    plansNote.textContent = "This view will hold the smaller set of items you want in focus this week.";
    plansEmptyTitle.textContent = "Nothing in This Week yet";
    plansEmptyNote.textContent = "Move a few items over from Backlog when you want them in focus.";
  } else {
    plansTitle.textContent = "Backlog";
    plansNote.textContent = "This is where loose ideas, errands, and non-recurring tasks will live.";
    plansEmptyTitle.textContent = "Your backlog is empty";
    plansEmptyNote.textContent = "Add ideas here, then move the important ones into This Week.";
  }

  plansList.innerHTML = "";

  if (!bucketItems.length) {
    plansEmptyState.classList.remove("is-hidden");
    return;
  }

  plansEmptyState.classList.add("is-hidden");

  bucketItems.forEach((plan) => {
    const item = document.createElement("article");
    item.className = "plan-item";
    item.dataset.planId = plan.id;
    item.innerHTML = `
      <div class="plan-item-main">
        <span class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">::</span>
        <input data-plan-checkbox data-plan-id="${plan.id}" type="checkbox" ${plan.completed ? "checked" : ""} />
        <div class="plan-text ${plan.completed ? "is-complete" : ""}">
          <span>${escapeHtml(plan.title)}</span>
        </div>
      </div>
      <div class="plan-actions">
        <button class="ghost-button" data-move-plan-id="${plan.id}" type="button">
          ${bucketKey === "backlog" ? "Move to This Week" : "Move to Backlog"}
        </button>
        <button class="text-button is-danger" data-delete-plan-id="${plan.id}" type="button">Delete</button>
      </div>
    `;
    plansList.append(item);
  });
}

function currentDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function syncDayState() {
  const todayKey = currentDateKey();
  if (state.lastViewedDate === todayKey) {
    return;
  }

  state.lastViewedDate = todayKey;
  state.expandedRitualIds = {};
  saveState();
}

function applyTheme() {
  const theme = getResolvedTheme();
  document.documentElement.dataset.theme = theme;
}

function getResolvedTheme() {
  if (state.themePreference === "dark") {
    return "dark";
  }

  if (state.themePreference === "light") {
    return "light";
  }

  return themeMediaQuery && themeMediaQuery.matches ? "dark" : "light";
}

function syncThemeButtons() {
  document.querySelectorAll("[data-theme-preference]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.themePreference === state.themePreference);
  });
}

function syncDevToolsVisibility() {
  devToolsCard.classList.toggle("is-hidden", !isLocalPreview());
}

function isLocalPreview() {
  const hostname = window.location.hostname;
  return window.location.protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1";
}

function simulateNextDay() {
  state.lastViewedDate = "1900-01-01";
  syncDayState();
  renderApp();
  simulateNextDayStatus.textContent = "Simulated a new day. Today's rituals should now be expanded again.";
}

function loadPersistedSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        state: defaultState(),
        cloud: defaultCloudState(),
      };
    }

    const parsed = JSON.parse(raw);
    return {
      state: hydratePersistedState(parsed, defaultState()),
      cloud: {
        ...defaultCloudState(),
        ...(parsed.cloud || {}),
      },
    };
  } catch {
    return {
      state: defaultState(),
      cloud: defaultCloudState(),
    };
  }
}

function saveState(options = {}) {
  const nextSyncableSignature = getSyncableSignature(state);
  const syncableChanged = nextSyncableSignature !== lastSyncableSignature;

  if (syncableChanged) {
    lastSyncableSignature = nextSyncableSignature;
    if (!options.preserveLocalUpdatedAt) {
      cloudState.localUpdatedAt = new Date().toISOString();
    }
  }

  persistSnapshot();

  if (!options.skipRemoteSync && syncableChanged) {
    scheduleRemoteSync();
  }
}

function persistSnapshot() {
  const persisted = createPersistedSnapshot(state, cloudState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

function getSyncableSignature(sourceState) {
  return JSON.stringify(buildSyncableState(sourceState));
}

function getLocalSyncEnvelope() {
  return createSyncEnvelope(state, cloudState.localUpdatedAt || "1970-01-01T00:00:00.000Z");
}

function defaultCloudState() {
  return {
    googleClientId: GOOGLE_CLIENT_ID,
    googleAccountEmail: "",
    googleAccountName: "",
    driveFileId: "",
    lastSyncedAt: "",
    lastRemoteUpdatedAt: "",
    localUpdatedAt: "",
  };
}

async function initializeGoogleSync() {
  renderGoogleSync();

  if (!driveSyncController || !cloudState.googleClientId) {
    return;
  }

  try {
    syncErrorMessage = "";
    syncStatusMessage = "Loading Google sign-in...";
    renderGoogleSync();
    await driveSyncController.prepare();
    isGoogleAuthReady = true;
    syncStatusMessage = "Checking for an existing Google session...";
    renderGoogleSync();
    const profile = await driveSyncController.maybeRestoreSession();

    if (!profile) {
      syncStatusMessage = cloudState.googleAccountEmail
        ? "Reconnect to Google to resume Drive sync."
        : "Sign in with Google to sync this device.";
      renderGoogleSync();
      return;
    }

    cloudState.googleAccountEmail = profile.email || cloudState.googleAccountEmail;
    cloudState.googleAccountName = profile.name || cloudState.googleAccountName;
    persistSnapshot();
    syncStatusMessage = "Connected to Google. Checking Drive for newer data...";
    renderGoogleSync();
    await synchronizeWithDrive({ manual: false });
  } catch (error) {
    isGoogleAuthReady = false;
    syncErrorMessage = getErrorMessage(error, "Could not initialize Google Drive sync.");
    syncStatusMessage = "Drive sync is available, but the Google session could not be restored.";
    renderGoogleSync();
  }
}

async function handleGoogleSignIn() {
  if (!driveSyncController) {
    syncErrorMessage = "Google Drive sync is not available in this build.";
    renderGoogleSync();
    return;
  }

  if (!cloudState.googleClientId) {
    syncStatusMessage = "Google sign-in is not configured for this build yet.";
    renderGoogleSync();
    return;
  }

  if (!isGoogleAuthReady || !driveSyncController.isPrepared()) {
    syncStatusMessage = "Google sign-in is still loading. Try again in a moment.";
    renderGoogleSync();
    return;
  }

  try {
    syncErrorMessage = "";
    syncStatusMessage = "Opening Google sign-in...";
    renderGoogleSync();
    const profile = await driveSyncController.signIn();
    cloudState.googleAccountEmail = profile.email || "";
    cloudState.googleAccountName = profile.name || "";
    persistSnapshot();
    syncStatusMessage = "Signed in. Syncing with Google Drive...";
    renderGoogleSync();
    await synchronizeWithDrive({ manual: true });
  } catch (error) {
    syncErrorMessage = getErrorMessage(error, "Google sign-in failed.");
    syncStatusMessage = "Could not complete Google sign-in.";
    renderGoogleSync();
  }
}

async function handleGoogleSignOut() {
  if (!driveSyncController) {
    return;
  }

  if (syncTimer) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }

  await driveSyncController.signOut();
  cloudState.googleAccountEmail = "";
  cloudState.googleAccountName = "";
  syncErrorMessage = "";
  syncStatusMessage = "Signed out of Google. Your local data is still available on this device.";
  persistSnapshot();
  renderGoogleSync();
}

function scheduleRemoteSync() {
  if (!driveSyncController || !driveSyncController.isConfigured() || !driveSyncController.isSignedIn()) {
    renderGoogleSync();
    return;
  }

  if (syncTimer) {
    window.clearTimeout(syncTimer);
  }

  syncStatusMessage = "Changes saved locally. Google Drive sync is queued.";
  renderGoogleSync();
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    synchronizeWithDrive({ manual: false });
  }, 1200);
}

async function synchronizeWithDrive(options = {}) {
  if (!driveSyncController) {
    syncErrorMessage = "Google Drive sync is not available in this build.";
    renderGoogleSync();
    return;
  }

  if (!driveSyncController.isConfigured()) {
    syncStatusMessage = "Google sign-in is not configured for this build yet.";
    renderGoogleSync();
    return;
  }

  if (!driveSyncController.isSignedIn()) {
    syncStatusMessage = "Sign in with Google to sync this device with Drive.";
    renderGoogleSync();
    return;
  }

  if (syncInFlight) {
    if (options.manual) {
      syncStatusMessage = "A Google Drive sync is already in progress.";
      renderGoogleSync();
    }
    return;
  }

  if (syncTimer) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }

  let shouldRenderApp = false;

  syncInFlight = true;
  syncErrorMessage = "";
  syncStatusMessage = "Syncing with Google Drive...";
  renderGoogleSync();

  try {
    const result = await driveSyncController.syncEnvelope(getLocalSyncEnvelope(), cloudState.driveFileId);
    const syncedAt = new Date().toISOString();

    if (result.profile) {
      cloudState.googleAccountEmail = result.profile.email || cloudState.googleAccountEmail;
      cloudState.googleAccountName = result.profile.name || cloudState.googleAccountName;
    }

    if (result.fileId) {
      cloudState.driveFileId = result.fileId;
    }

    cloudState.lastSyncedAt = syncedAt;
    cloudState.lastRemoteUpdatedAt = result.remoteUpdatedAt || cloudState.lastRemoteUpdatedAt;

    if (result.action === "download") {
      const nextState = applySyncEnvelope(state, result.envelope);
      Object.assign(state, nextState);
      cloudState.localUpdatedAt = result.envelope.updatedAt || syncedAt;
      lastSyncableSignature = getSyncableSignature(state);
      syncStatusMessage = "Loaded the newest data from Google Drive.";
      persistSnapshot();
      shouldRenderApp = true;
    } else if (result.action === "upload") {
      cloudState.localUpdatedAt = result.envelope.updatedAt || cloudState.localUpdatedAt || syncedAt;
      lastSyncableSignature = getSyncableSignature(state);
      syncStatusMessage = "Saved the latest changes to Google Drive.";
      persistSnapshot();
    } else {
      cloudState.localUpdatedAt = result.envelope.updatedAt || cloudState.localUpdatedAt || syncedAt;
      lastSyncableSignature = getSyncableSignature(state);
      syncStatusMessage = "Google Drive is already up to date.";
      persistSnapshot();
    }
  } catch (error) {
    syncErrorMessage = getErrorMessage(error, "Could not sync with Google Drive.");
    syncStatusMessage = options.manual
      ? "Google Drive sync failed."
      : "Automatic sync paused until the next successful connection.";
  } finally {
    syncInFlight = false;
    if (shouldRenderApp) {
      renderApp();
    } else {
      renderGoogleSync();
    }
  }
}

function renderGoogleSync() {
  const hasClientId = Boolean(cloudState.googleClientId);
  const canStartGoogleSignIn = Boolean(
    hasClientId && driveSyncController && isGoogleAuthReady && driveSyncController.isPrepared()
  );
  const isSignedIn = Boolean(driveSyncController && driveSyncController.isSignedIn());
  const accountLabel = cloudState.googleAccountEmail || cloudState.googleAccountName;
  const statusText = syncErrorMessage || getGoogleSyncStatusMessage(hasClientId, isSignedIn);

  googleSignInButton.disabled = !canStartGoogleSignIn || syncInFlight;
  googleSyncNowButton.disabled = !isSignedIn || syncInFlight;
  googleSignOutButton.disabled = !isSignedIn || syncInFlight;
  googleSyncNowButton.classList.toggle("is-hidden", !hasClientId);
  googleSignOutButton.classList.toggle("is-hidden", !hasClientId);

  googleSyncStatus.textContent = statusText;
  googleSyncStatus.classList.toggle("is-danger-text", Boolean(syncErrorMessage));
  googleSyncAccount.textContent = accountLabel ? `Signed in as ${accountLabel}.` : "";
  googleSyncAccount.classList.toggle("is-hidden", !accountLabel);

  const metaParts = [];
  if (cloudState.lastSyncedAt) {
    metaParts.push(`Last synced ${formatSyncTimestamp(cloudState.lastSyncedAt)}.`);
  }
  if (cloudState.driveFileId) {
    metaParts.push("Stored in your Google Drive app data.");
  }
  googleSyncMeta.textContent = metaParts.join(" ");
  googleSyncMeta.classList.toggle("is-hidden", !metaParts.length);
}

function getGoogleSyncStatusMessage(hasClientId, isSignedIn) {
  if (syncStatusMessage) {
    return syncStatusMessage;
  }

  if (!hasClientId) {
    return "Google sign-in is not configured for this build yet.";
  }

  if (!isGoogleAuthReady) {
    return "Loading Google sign-in...";
  }

  if (!isSignedIn) {
    return "Sign in with Google to sync this device.";
  }

  return "Google Drive sync is ready.";
}

function formatSyncTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function exportRitualsCsv() {
  const rows = [
    ["name", "note", "active", "days", "items"],
    ...state.rituals.map((ritual) => [
      ritual.name,
      ritual.note || "",
      ritual.isActive ? "yes" : "no",
      ritual.days.map((day) => DAY_LABELS[day]).join(", "),
      ritual.items.map((item) => item.label).join(" | "),
    ]),
  ];

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = currentDateKey();

  link.href = url;
  link.download = `rituals-${stamp}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function handleImportCsv(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = function onLoad(loadEvent) {
    try {
      const csvText = String(loadEvent.target.result || "");
      const importedRituals = parseRitualCsv(csvText, generateId);

      if (!importedRituals.length) {
        importStatus.textContent = "No valid rituals found in the CSV.";
        return;
      }

      state.rituals = importedRituals;
      state.completions = {};
      state.expandedRitualIds = {};
      saveState();
      renderApp();
      importStatus.textContent = `Imported ${importedRituals.length} ritual${importedRituals.length === 1 ? "" : "s"}.`;
    } catch (error) {
      importStatus.textContent = "Could not import that CSV. Please check the format.";
    }
  };

  reader.readAsText(file);
  event.target.value = "";
}

function defaultState() {
  return {
    screen: "today",
    isFormOpen: false,
    todayView: "checklist",
    plansView: "backlog",
    themePreference: "system",
    lastViewedDate: "",
    rituals: [],
    plans: {
      backlog: [],
      thisWeek: [],
    },
    completions: {},
    expandedRitualIds: {},
    draftItems: [],
    draftDays: [],
  };
}

function syncEditState() {
  const isEditing = Boolean(ritualIdInput.value);
  const shouldShowForm = Boolean(state.isFormOpen || isEditing);

  ritualForm.classList.toggle("is-hidden", !shouldShowForm);
  showRitualFormButton.classList.toggle("is-hidden", shouldShowForm);
  editBanner.classList.toggle("is-hidden", !isEditing);
  cancelEditButton.classList.toggle("is-hidden", !isEditing);
  ritualForm.classList.toggle("is-editing", isEditing);
  saveRitualButton.textContent = isEditing ? "Update ritual" : "Save ritual";
  editTitle.textContent = isEditing ? ritualNameInput.value || "Ritual" : "New Ritual";
}

function openNewRitualForm() {
  resetForm();
  state.screen = "rituals";
  state.isFormOpen = true;
  saveState();
  renderApp();
  ritualForm.scrollIntoView({ behavior: "smooth", block: "start" });
  ritualNameInput.focus();
}

function addPlanItem() {
  const title = planInput.value.trim();
  if (!title) {
    return;
  }

  const bucketKey = state.plansView === "this-week" ? "thisWeek" : "backlog";
  state.plans[bucketKey].push({
    id: generateId(),
    title: title,
    completed: false,
  });
  planInput.value = "";
  saveState();
  renderPlans();
  initializeSortables();
}

function togglePlanCompletion(planId, completed) {
  const location = findPlanLocation(planId);
  if (!location) {
    return;
  }

  location.plan.completed = completed;
  saveState();
  renderPlans();
}

function movePlanToOtherBucket(planId) {
  const location = findPlanLocation(planId);
  if (!location) {
    return;
  }

  state.plans[location.bucket] = state.plans[location.bucket].filter((plan) => plan.id !== planId);
  const targetBucket = location.bucket === "backlog" ? "thisWeek" : "backlog";
  state.plans[targetBucket].push(location.plan);
  saveState();
  renderPlans();
  initializeSortables();
}

function deletePlan(planId) {
  const location = findPlanLocation(planId);
  if (!location) {
    return;
  }

  state.plans[location.bucket] = state.plans[location.bucket].filter((plan) => plan.id !== planId);
  saveState();
  renderPlans();
  initializeSortables();
}

function findPlanLocation(planId) {
  const backlogPlan = state.plans.backlog.find((plan) => plan.id === planId);
  if (backlogPlan) {
    return { bucket: "backlog", plan: backlogPlan };
  }

  const thisWeekPlan = state.plans.thisWeek.find((plan) => plan.id === planId);
  if (thisWeekPlan) {
    return { bucket: "thisWeek", plan: thisWeekPlan };
  }

  return null;
}

function initializeSortables() {
  if (typeof Sortable === "undefined") {
    return;
  }

  if (ritualLibrarySortable) {
    ritualLibrarySortable.destroy();
  }

  if (draftItemSortable) {
    draftItemSortable.destroy();
  }

  if (plansSortable) {
    plansSortable.destroy();
  }

  ritualLibrarySortable = new Sortable(ritualLibrary, {
    animation: 180,
    handle: ".drag-handle",
    delay: 180,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    fallbackTolerance: 6,
    forceFallback: true,
    ghostClass: "sortable-ghost",
    dragClass: "sortable-drag",
    onEnd: function onRitualSort(event) {
      if (event.oldIndex == null || event.newIndex == null || event.oldIndex === event.newIndex) {
        return;
      }

      state.rituals = reorderItems(state.rituals, event.oldIndex, event.newIndex);
      saveState();
      renderApp();
    },
  });

  draftItemSortable = new Sortable(itemList, {
    animation: 180,
    handle: ".drag-handle",
    delay: 180,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    fallbackTolerance: 6,
    forceFallback: true,
    ghostClass: "sortable-ghost",
    dragClass: "sortable-drag",
    onEnd: function onItemSort(event) {
      if (event.oldIndex == null || event.newIndex == null || event.oldIndex === event.newIndex) {
        return;
      }

      state.draftItems = reorderItems(state.draftItems, event.oldIndex, event.newIndex);
      renderDraftItems();
      syncEditState();
      initializeSortables();
    },
  });

  plansSortable = new Sortable(plansList, {
    animation: 180,
    handle: ".drag-handle",
    delay: 180,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    fallbackTolerance: 6,
    forceFallback: true,
    ghostClass: "sortable-ghost",
    dragClass: "sortable-drag",
    onEnd: function onPlanSort(event) {
      const bucketKey = state.plansView === "this-week" ? "thisWeek" : "backlog";
      if (event.oldIndex == null || event.newIndex == null || event.oldIndex === event.newIndex) {
        return;
      }

      state.plans[bucketKey] = reorderItems(state.plans[bucketKey], event.oldIndex, event.newIndex);
      saveState();
      renderPlans();
      initializeSortables();
    },
  });
}

function seedDemoRituals() {
  if (state.rituals.length) {
    return;
  }

  if (cloudState.googleClientId || cloudState.googleAccountEmail || cloudState.lastSyncedAt) {
    return;
  }

  state.rituals = [
    {
      id: generateId(),
      name: "Wake-up ritual",
      note: "Morning",
      days: [1, 2, 3, 4, 5],
      isActive: true,
      items: [
        { id: generateId(), label: "Drink water" },
        { id: generateId(), label: "Open the curtains" },
        { id: generateId(), label: "Five-minute stretch" },
      ],
    },
    {
      id: generateId(),
      name: "Evening reset",
      note: "Night",
      days: [0, 1, 2, 3, 4, 5, 6],
      isActive: true,
      items: [
        { id: generateId(), label: "Tidy desk" },
        { id: generateId(), label: "Prep for tomorrow" },
        { id: generateId(), label: "Skincare" },
      ],
    },
  ];
  saveState();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `ritual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
