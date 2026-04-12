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

  globalScope.RitualFlowCore = {
    parseRitualCsv: parseRitualCsv,
    parseCsvRows: parseCsvRows,
    parseDays: parseDays,
    dayToIndex: dayToIndex,
    escapeCsv: escapeCsv,
    reorderItems: reorderItems,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
