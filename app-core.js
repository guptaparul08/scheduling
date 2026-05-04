(function createRitualFlowCore(globalScope) {
  function parseRitualCsv(csvText, idFactory) {
    const rows = parseCsvRows(csvText);
    if (rows.length < 2) {
      return [];
    }

    const headers = rows[0].map(function normalizeHeader(header) {
      return String(header).trim().toLowerCase();
    });

    const nameIndex = headers.indexOf("name");
    const noteIndex = headers.indexOf("note");
    const activeIndex = headers.indexOf("active");
    const daysIndex = headers.indexOf("days");
    const itemsIndex = headers.indexOf("items");
    const itemDaysIndex = headers.indexOf("item_days");

    if (nameIndex === -1 || noteIndex === -1 || activeIndex === -1 || daysIndex === -1 || itemsIndex === -1) {
      throw new Error("Missing required headers");
    }

    const makeId = typeof idFactory === "function" ? idFactory : defaultIdFactory;

    return rows
      .slice(1)
      .map(function mapRow(row) {
        const name = String(row[nameIndex] || "").trim();
        if (!name) {
          return null;
        }

        const note = String(row[noteIndex] || "").trim();
        const activeValue = String(row[activeIndex] || "").trim().toLowerCase();
        const days = normalizeDayList(parseDays(String(row[daysIndex] || "")));
        const itemLabels = String(row[itemsIndex] || "")
          .split("|")
          .map(function trimItem(item) {
            return item.trim();
          })
          .filter(Boolean);
        const itemSchedules = parseItemDaySchedules(
          itemDaysIndex === -1 ? "" : String(row[itemDaysIndex] || ""),
          itemLabels.length,
        );
        const items = itemLabels.map(function toItem(label, index) {
          const item = { id: makeId(), label: label };
          const schedule = itemSchedules[index];
          if (schedule) {
            item.days = schedule;
          }
          return item;
        });

        if (!days.length || !items.length) {
          return null;
        }

        return {
          id: makeId(),
          name: name,
          note: note,
          isActive: activeValue !== "no",
          days: days,
          items: items,
        };
      })
      .filter(Boolean);
  }

  function parseCsvRows(csvText) {
    const rows = [];
    let row = [];
    let current = "";
    let inQuotes = false;
    let index = 0;

    while (index < csvText.length) {
      const character = csvText[index];
      const next = csvText[index + 1];

      if (character === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          index += 2;
          continue;
        }

        inQuotes = !inQuotes;
        index += 1;
        continue;
      }

      if (character === "," && !inQuotes) {
        row.push(current);
        current = "";
        index += 1;
        continue;
      }

      if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && next === "\n") {
          index += 1;
        }

        row.push(current);
        if (row.some(function hasContent(value) { return String(value).trim() !== ""; })) {
          rows.push(row);
        }
        row = [];
        current = "";
        index += 1;
        continue;
      }

      current += character;
      index += 1;
    }

    row.push(current);
    if (row.some(function hasContent(value) { return String(value).trim() !== ""; })) {
      rows.push(row);
    }

    return rows;
  }

  function parseDays(dayString) {
    return dayString
      .split(",")
      .map(function trimDay(day) {
        return day.trim().slice(0, 3).toLowerCase();
      })
      .map(function mapDay(day) {
        return dayToIndex(day);
      })
      .filter(function isNumber(day) {
        return day !== null;
      });
  }

  function parseItemDaySchedules(dayString, itemCount) {
    const emptySchedules = Array.from({ length: itemCount }, function toNull() {
      return null;
    });
    const rawValue = String(dayString || "").trim();

    if (!rawValue) {
      return emptySchedules;
    }

    const scheduleParts = rawValue.split("|").map(function trimSchedule(part) {
      return part.trim();
    });

    return emptySchedules.map(function mapSchedule(_, index) {
      return parseItemDaySchedule(scheduleParts[index] || "");
    });
  }

  function parseItemDaySchedule(dayString) {
    const normalized = String(dayString || "").trim().toLowerCase();
    if (!normalized || normalized === "inherit" || normalized === "same" || normalized === "default") {
      return null;
    }

    const parsedDays = normalizeDayList(parseDays(dayString));
    return parsedDays.length ? parsedDays : null;
  }

  function dayToIndex(day) {
    const dayMap = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };

    if (Object.prototype.hasOwnProperty.call(dayMap, day)) {
      return dayMap[day];
    }

    return null;
  }

  function escapeCsv(value) {
    const stringValue = String(value == null ? "" : value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  function normalizeDayList(days) {
    if (!Array.isArray(days)) {
      return [];
    }

    return Array.from(
      new Set(
        days.filter(function isValidDay(day) {
          return Number.isInteger(day) && day >= 0 && day <= 6;
        }),
      ),
    ).sort(function sortDays(a, b) {
      return a - b;
    });
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function reorderItems(items, fromIndex, toIndex) {
    const nextItems = items.slice();

    if (toIndex < 0 || toIndex >= nextItems.length || fromIndex === toIndex) {
      return nextItems;
    }

    const movedItem = nextItems.splice(fromIndex, 1)[0];
    nextItems.splice(toIndex, 0, movedItem);
    return nextItems;
  }

  function defaultIdFactory() {
    return `ritual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function buildSyncableState(state) {
    return cloneJson({
      ...buildStructureState(state),
      ...buildProgressState(state),
    });
  }

  function buildStructureState(state) {
    return cloneJson(projectStructureState(state || {}));
  }

  function buildProgressState(state) {
    return cloneJson(projectProgressState(state || {}));
  }

  function buildDeviceState(state) {
    return cloneJson({
      isFormOpen: state.isFormOpen,
      lastViewedDate: state.lastViewedDate,
      expandedRitualIds: state.expandedRitualIds,
      draftItems: state.draftItems,
      draftDays: state.draftDays,
    });
  }

  function createPersistedSnapshot(state, cloud) {
    return {
      syncable: buildSyncableState(state),
      device: buildDeviceState(state),
      cloud: cloneJson(cloud || {}),
    };
  }

  function hydratePersistedState(snapshot, baseState) {
    const seedState = cloneJson(baseState || {});
    if (!snapshot || typeof snapshot !== "object") {
      return normalizeHydratedState(seedState);
    }

    if (!snapshot.syncable && !snapshot.device) {
      return normalizeHydratedState({
        ...seedState,
        ...cloneJson(snapshot),
      });
    }

    return normalizeHydratedState({
      ...seedState,
      ...cloneJson(snapshot.syncable || {}),
      ...cloneJson(snapshot.device || {}),
    });
  }

  function createSyncEnvelope(state, updatedAt, version) {
    return {
      schemaVersion: 1,
      updatedAt: normalizeTimestamp(updatedAt) || new Date().toISOString(),
      version: normalizeEnvelopeVersion(version),
      state: buildSyncableState(state),
    };
  }

  function createStructureSyncEnvelope(state, updatedAt, version) {
    return {
      schemaVersion: 1,
      updatedAt: normalizeTimestamp(updatedAt) || new Date().toISOString(),
      version: normalizeEnvelopeVersion(version),
      state: buildStructureState(state),
    };
  }

  function createProgressSyncEnvelope(state, updatedAt, version) {
    return {
      schemaVersion: 1,
      updatedAt: normalizeTimestamp(updatedAt) || new Date().toISOString(),
      version: normalizeEnvelopeVersion(version),
      state: buildProgressState(state),
    };
  }

  function applySyncEnvelope(baseState, envelope) {
    const seedState = cloneJson(baseState || {});
    if (!envelope || typeof envelope !== "object" || !envelope.state || typeof envelope.state !== "object") {
      return normalizeHydratedState(seedState);
    }

    return normalizeHydratedState({
      ...seedState,
      ...cloneJson(envelope.state),
    });
  }

  function applyStructureSyncEnvelope(baseState, envelope) {
    const seedState = cloneJson(baseState || {});
    if (!envelope || typeof envelope !== "object" || !envelope.state || typeof envelope.state !== "object") {
      return normalizeHydratedState(seedState);
    }

    return normalizeHydratedState({
      ...seedState,
      ...projectStructureState(envelope.state),
    });
  }

  function applyProgressSyncEnvelope(baseState, envelope) {
    const seedState = cloneJson(baseState || {});
    if (!envelope || typeof envelope !== "object" || !envelope.state || typeof envelope.state !== "object") {
      return normalizeHydratedState(seedState);
    }

    return normalizeHydratedState({
      ...seedState,
      ...projectProgressState(envelope.state),
    });
  }

  function normalizeHydratedState(state) {
    const nextState = {
      ...state,
    };

    nextState.rituals = normalizeRituals(nextState.rituals);
    return nextState;
  }

  function projectStructureState(state) {
    const source = state || {};
    return {
      screen: source.screen,
      rituals: normalizeRituals(source.rituals),
      plans: cloneJson(source.plans || {}),
      todayView: source.todayView,
      plansView: source.plansView,
      themePreference: source.themePreference,
    };
  }

  function projectProgressState(state) {
    const source = state || {};
    return {
      completions: cloneJson(source.completions || {}),
    };
  }

  function normalizeRituals(rituals) {
    if (!Array.isArray(rituals)) {
      return [];
    }

    return rituals
      .map(function normalizeRitual(ritual) {
        if (!ritual || typeof ritual !== "object") {
          return null;
        }

        const nextRitual = cloneJson(ritual);
        nextRitual.id = nextRitual.id || defaultIdFactory();
        nextRitual.name = String(nextRitual.name || "").trim();
        nextRitual.note = String(nextRitual.note || "").trim();
        nextRitual.isActive = nextRitual.isActive !== false;
        nextRitual.days = normalizeDayList(nextRitual.days);
        nextRitual.items = normalizeRitualItems(nextRitual.items);
        return nextRitual;
      })
      .filter(Boolean);
  }

  function normalizeRitualItems(items) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map(function normalizeItem(item) {
        if (typeof item === "string") {
          const label = item.trim();
          if (!label) {
            return null;
          }

          return {
            id: defaultIdFactory(),
            label: label,
          };
        }

        if (!item || typeof item !== "object") {
          return null;
        }

        const nextItem = cloneJson(item);
        nextItem.id = nextItem.id || defaultIdFactory();
        nextItem.label = String(nextItem.label || "").trim();
        if (!nextItem.label) {
          return null;
        }

        const itemDays = normalizeDayList(nextItem.days);
        if (itemDays.length) {
          nextItem.days = itemDays;
        } else {
          delete nextItem.days;
        }

        return nextItem;
      })
      .filter(Boolean);
  }

  function getItemScheduledDays(item, ritualDays) {
    const itemDays = normalizeDayList(item && item.days);
    if (itemDays.length) {
      return itemDays;
    }

    return normalizeDayList(ritualDays);
  }

  function getRitualItemsForDay(ritual, dayIndex) {
    if (!ritual || !Array.isArray(ritual.items)) {
      return [];
    }

    return ritual.items.filter(function itemMatchesDay(item) {
      return getItemScheduledDays(item, ritual.days).includes(dayIndex);
    });
  }

  function decideSyncDirection(localEnvelope, remoteEnvelope) {
    const hasLocal = hasSyncState(localEnvelope);
    const hasRemote = hasSyncState(remoteEnvelope);

    if (hasLocal && !hasRemote) {
      return "upload";
    }

    if (!hasLocal && hasRemote) {
      return "download";
    }

    if (!hasLocal && !hasRemote) {
      return "noop";
    }

    const localVersion = getEnvelopeVersion(localEnvelope);
    const remoteVersion = getEnvelopeVersion(remoteEnvelope);

    if (localVersion > remoteVersion) {
      return "upload";
    }

    if (remoteVersion > localVersion) {
      return "download";
    }

    const localTimestamp = getEnvelopeTimestamp(localEnvelope);
    const remoteTimestamp = getEnvelopeTimestamp(remoteEnvelope);

    if (localTimestamp > remoteTimestamp) {
      return "upload";
    }

    if (remoteTimestamp > localTimestamp) {
      return "download";
    }

    return JSON.stringify(localEnvelope.state) === JSON.stringify(remoteEnvelope.state) ? "noop" : "upload";
  }

  function hasSyncState(envelope) {
    return Boolean(envelope && typeof envelope === "object" && envelope.state && typeof envelope.state === "object");
  }

  function getEnvelopeVersion(envelope) {
    return normalizeEnvelopeVersion(envelope && envelope.version);
  }

  function getEnvelopeTimestamp(envelope) {
    const normalized = normalizeTimestamp(envelope && envelope.updatedAt);
    if (!normalized) {
      return 0;
    }

    return new Date(normalized).getTime();
  }

  function normalizeEnvelopeVersion(value) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 0) {
      return 0;
    }

    return normalized;
  }

  function normalizeTimestamp(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toISOString();
  }

  globalScope.RitualFlowCore = {
    parseRitualCsv: parseRitualCsv,
    parseCsvRows: parseCsvRows,
    parseDays: parseDays,
    dayToIndex: dayToIndex,
    escapeCsv: escapeCsv,
    normalizeDayList: normalizeDayList,
    buildSyncableState: buildSyncableState,
    buildStructureState: buildStructureState,
    buildProgressState: buildProgressState,
    buildDeviceState: buildDeviceState,
    createPersistedSnapshot: createPersistedSnapshot,
    hydratePersistedState: hydratePersistedState,
    createSyncEnvelope: createSyncEnvelope,
    createStructureSyncEnvelope: createStructureSyncEnvelope,
    createProgressSyncEnvelope: createProgressSyncEnvelope,
    applySyncEnvelope: applySyncEnvelope,
    applyStructureSyncEnvelope: applyStructureSyncEnvelope,
    applyProgressSyncEnvelope: applyProgressSyncEnvelope,
    decideSyncDirection: decideSyncDirection,
    getEnvelopeVersion: getEnvelopeVersion,
    getItemScheduledDays: getItemScheduledDays,
    getRitualItemsForDay: getRitualItemsForDay,
    reorderItems: reorderItems,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
