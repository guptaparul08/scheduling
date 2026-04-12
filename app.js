const STORAGE_KEY = "ritual-flow-v1";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
const exportCsvButton = document.querySelector("#export-csv-button");

initialize();

function initialize() {
  seedDemoRituals();
  renderDayPicker();
  bindEvents();
  renderApp();
}

function bindEvents() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      state.screen = button.dataset.screen;
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

  document.querySelector("#add-item-button").addEventListener("click", addDraftItem);
  itemInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraftItem();
    }
  });

  ritualForm.addEventListener("submit", handleSubmit);
  cancelEditButton.addEventListener("click", resetForm);
  exportCsvButton.addEventListener("click", exportRitualsCsv);

  document.body.addEventListener("click", (event) => {
    const openScreen = event.target.closest("[data-open-screen]");
    if (openScreen) {
      state.screen = openScreen.dataset.openScreen;
      renderApp();
    }

    const removeDraftIndex = event.target.closest("[data-remove-draft-index]");
    if (removeDraftIndex) {
      const index = Number(removeDraftIndex.dataset.removeDraftIndex);
      state.draftItems.splice(index, 1);
      renderDraftItems();
    }

    const editButton = event.target.closest("[data-edit-ritual-id]");
    if (editButton) {
      populateForm(editButton.dataset.editRitualId);
    }

    const archiveButton = event.target.closest("[data-archive-ritual-id]");
    if (archiveButton) {
      toggleArchive(archiveButton.dataset.archiveRitualId);
    }

    const deleteButton = event.target.closest("[data-delete-ritual-id]");
    if (deleteButton) {
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
  });

  document.body.addEventListener("change", (event) => {
    if (event.target.matches("[data-item-checkbox]")) {
      const ritualId = event.target.dataset.ritualId;
      const itemId = event.target.dataset.itemId;
      setItemCompletion(ritualId, itemId, event.target.checked);
    }
  });
}

function renderApp() {
  document.querySelector("#today-screen").classList.toggle("is-hidden", state.screen !== "today");
  document.querySelector("#rituals-screen").classList.toggle("is-hidden", state.screen !== "rituals");
  document.querySelector("#settings-screen").classList.toggle("is-hidden", state.screen !== "settings");

  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === state.screen);
  });

  syncViewModeButtons();
  renderToday();
  renderDraftItems();
  renderLibrary();
}

function renderToday() {
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
    li.innerHTML = `
      <span>${escapeHtml(item.label)}</span>
      <button class="text-button is-danger" data-remove-draft-index="${index}" type="button">Remove</button>
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

  const sortedRituals = [...state.rituals].sort((a, b) => a.name.localeCompare(b.name));

  sortedRituals.forEach((ritual) => {
    const card = document.createElement("article");
    card.className = "library-card";
    card.innerHTML = `
      <div class="library-card-header">
        <div>
          <h3>${escapeHtml(ritual.name)}</h3>
          <p class="ritual-meta">
            ${escapeHtml(ritual.note || "No note")} · ${ritual.items.length} item${ritual.items.length === 1 ? "" : "s"}
          </p>
          <p class="ritual-meta">${ritual.days.map((day) => DAY_LABELS[day]).join(", ") || "No days selected"}</p>
          <p class="ritual-meta">${ritual.isActive ? "Active" : "Archived"}</p>
        </div>
        <div class="library-actions">
          <button class="ghost-button" data-edit-ritual-id="${ritual.id}" type="button">Edit</button>
          <button class="ghost-button" data-archive-ritual-id="${ritual.id}" type="button">
            ${ritual.isActive ? "Archive" : "Activate"}
          </button>
          <button class="text-button is-danger" data-delete-ritual-id="${ritual.id}" type="button">Delete</button>
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
  cancelEditButton.classList.remove("is-hidden");
  state.screen = "rituals";
  renderDayPicker();
  renderDraftItems();
  renderApp();
}

function resetForm() {
  ritualForm.reset();
  ritualIdInput.value = "";
  ritualActiveInput.checked = true;
  state.draftItems = [];
  state.draftDays = [];
  cancelEditButton.classList.add("is-hidden");
  renderDayPicker();
  renderDraftItems();
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

function currentDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    rituals: state.rituals,
    completions: state.completions,
    todayView: state.todayView,
    expandedRitualIds: state.expandedRitualIds,
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

function defaultState() {
  return {
    screen: "today",
    todayView: "checklist",
    rituals: [],
    completions: {},
    expandedRitualIds: {},
    draftItems: [],
    draftDays: [],
  };
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

function escapeCsv(value) {
  const stringValue = String(value == null ? "" : value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `ritual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
