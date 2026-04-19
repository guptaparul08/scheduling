const STORAGE_KEY = "ritual-flow-v1";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMPACT_DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const RitualFlowCore = window.RitualFlowCore || {};
const parseRitualCsv = RitualFlowCore.parseRitualCsv;
const escapeCsv = RitualFlowCore.escapeCsv;
const reorderItems = RitualFlowCore.reorderItems;

const state = loadState();

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
const themeMediaQuery =
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let ritualLibrarySortable = null;
let draftItemSortable = null;
let plansSortable = null;
let activeMenuRitualId = null;

initialize();

function initialize() {
  seedDemoRituals();
  syncDayState();
  applyTheme();
  renderDayPicker();
  bindEvents();
  renderApp();
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
  addPlanButton.addEventListener("click", addPlanItem);
  planInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addPlanItem();
    }
  });

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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }

    return {
      ...defaultState(),
      ...JSON.parse(raw),
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  const persisted = {
    screen: state.screen,
    rituals: state.rituals,
    plans: state.plans,
    completions: state.completions,
    todayView: state.todayView,
    plansView: state.plansView,
    themePreference: state.themePreference,
    lastViewedDate: state.lastViewedDate,
    expandedRitualIds: state.expandedRitualIds,
    isFormOpen: state.isFormOpen,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
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
