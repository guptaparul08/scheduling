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
        const days = parseDays(String(row[daysIndex] || ""));
        const items = String(row[itemsIndex] || "")
          .split("|")
          .map(function trimItem(item) {
            return item.trim();
          })
          .filter(Boolean)
          .map(function toItem(label) {
            return { id: makeId(), label: label };
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
      screen: state.screen,
      rituals: state.rituals,
      plans: state.plans,
      completions: state.completions,
      todayView: state.todayView,
      plansView: state.plansView,
      themePreference: state.themePreference,
    });
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
      return seedState;
    }

    if (!snapshot.syncable && !snapshot.device) {
      return {
        ...seedState,
        ...cloneJson(snapshot),
      };
    }

    return {
      ...seedState,
      ...cloneJson(snapshot.syncable || {}),
      ...cloneJson(snapshot.device || {}),
    };
  }

  function createSyncEnvelope(state, updatedAt) {
    return {
      schemaVersion: 1,
      updatedAt: normalizeTimestamp(updatedAt) || new Date().toISOString(),
      state: buildSyncableState(state),
    };
  }

  function applySyncEnvelope(baseState, envelope) {
    const seedState = cloneJson(baseState || {});
    if (!envelope || typeof envelope !== "object" || !envelope.state || typeof envelope.state !== "object") {
      return seedState;
    }

    return {
      ...seedState,
      ...cloneJson(envelope.state),
    };
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

  function getEnvelopeTimestamp(envelope) {
    const normalized = normalizeTimestamp(envelope && envelope.updatedAt);
    if (!normalized) {
      return 0;
    }

    return new Date(normalized).getTime();
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
    buildSyncableState: buildSyncableState,
    buildDeviceState: buildDeviceState,
    createPersistedSnapshot: createPersistedSnapshot,
    hydratePersistedState: hydratePersistedState,
    createSyncEnvelope: createSyncEnvelope,
    applySyncEnvelope: applySyncEnvelope,
    decideSyncDirection: decideSyncDirection,
    reorderItems: reorderItems,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
