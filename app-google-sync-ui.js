(function createRitualFlowGoogleSyncUI(globalScope) {
  function createController(options) {
    const {
      googleClientId,
      driveSyncController,
      cloudState,
      elements,
      persistSnapshot,
      renderApp,
      getLocalStructureEnvelope,
      getLocalProgressEnvelope,
      applyRemoteStructureEnvelope,
      applyRemoteProgressEnvelope,
      markLocalStructureSyncState,
      markLocalProgressSyncState,
    } = options;

    let isGoogleAuthReady = false;
    let syncInFlight = false;
    let progressSyncTimer = null;
    let syncStatusMessage = "";
    let syncErrorMessage = "";

    function bindEvents() {
      if (!elements.googleSignInButton || !elements.googleSyncNowButton || !elements.googleSignOutButton) {
        return;
      }

      elements.googleSignInButton.addEventListener("click", handleGoogleSignIn);
      elements.googleSyncNowButton.addEventListener("click", synchronizeAllWithDrive);
      elements.googleSignOutButton.addEventListener("click", handleGoogleSignOut);
    }

    async function initialize() {
      const previousClientId = cloudState.googleClientId;
      cloudState.googleClientId = googleClientId || cloudState.googleClientId || "";

      if (driveSyncController && cloudState.googleClientId) {
        driveSyncController.setClientId(cloudState.googleClientId);
      }

      if (cloudState.googleClientId !== previousClientId) {
        persistSnapshot();
      }

      render();

      if (!driveSyncController || !cloudState.googleClientId) {
        return;
      }

      try {
        syncErrorMessage = "";
        syncStatusMessage = "Loading Google sign-in...";
        render();

        if (canPrepareGoogleAuth()) {
          await driveSyncController.prepare();
        }

        isGoogleAuthReady = true;
        syncStatusMessage = "Checking for an existing Google session...";
        render();

        const profile = await driveSyncController.maybeRestoreSession();
        if (!profile) {
          syncStatusMessage = cloudState.googleAccountEmail
            ? "Reconnect to Google to resume Drive sync."
            : "Sign in with Google to sync this device.";
          render();
          return;
        }

        cloudState.googleAccountEmail = profile.email || cloudState.googleAccountEmail;
        cloudState.googleAccountName = profile.name || cloudState.googleAccountName;
        persistSnapshot();
        syncStatusMessage = "Connected to Google. Refreshing daily progress...";
        render();
        await synchronizeProgressWithDrive({ manual: false });
      } catch (error) {
        isGoogleAuthReady = false;
        syncErrorMessage = getErrorMessage(error, "Could not initialize Google Drive sync.");
        syncStatusMessage = "Drive sync is available, but the Google session could not be restored.";
        render();
      }
    }

    function onStructureStateChanged() {
      cloudState.hasPendingStructureSync = true;

      if (driveSyncController && driveSyncController.isConfigured() && driveSyncController.isSignedIn()) {
        syncStatusMessage = "Ritual changes are saved locally. Use Sync now to back them up.";
      }

      persistSnapshot();
      render();
    }

    function onProgressStateChanged() {
      cloudState.hasPendingProgressSync = true;
      persistSnapshot();

      if (!driveSyncController || !driveSyncController.isConfigured() || !driveSyncController.isSignedIn()) {
        render();
        return;
      }

      syncStatusMessage = cloudState.hasPendingStructureSync
        ? "Today's progress will sync automatically. Ritual changes still need Sync now."
        : "Today's progress will sync automatically.";
      scheduleProgressSync();
      render();
    }

    async function handleGoogleSignIn() {
      if (!driveSyncController) {
        syncErrorMessage = "Google Drive sync is not available in this build.";
        render();
        return;
      }

      if (!cloudState.googleClientId) {
        syncStatusMessage = "Google sign-in is not configured for this build yet.";
        render();
        return;
      }

      if (!isGoogleAuthReady || !isGoogleAuthPrepared()) {
        syncStatusMessage = "Google sign-in is still loading. Try again in a moment.";
        render();
        return;
      }

      try {
        syncErrorMessage = "";
        syncStatusMessage = "Opening Google sign-in...";
        render();
        const profile = await driveSyncController.signIn();
        cloudState.googleAccountEmail = profile.email || "";
        cloudState.googleAccountName = profile.name || "";
        persistSnapshot();
        syncStatusMessage = "Signed in. Refreshing daily progress...";
        render();
        await synchronizeProgressWithDrive({ manual: false });
      } catch (error) {
        syncErrorMessage = getErrorMessage(error, "Google sign-in failed.");
        syncStatusMessage = "Could not complete Google sign-in.";
        render();
      }
    }

    async function handleGoogleSignOut() {
      if (!driveSyncController) {
        return;
      }

      clearPendingProgressSync();
      await driveSyncController.signOut();
      cloudState.googleAccountEmail = "";
      cloudState.googleAccountName = "";
      syncErrorMessage = "";
      syncStatusMessage = "Signed out of Google. Your local data is still available on this device.";
      persistSnapshot();
      render();
    }

    function scheduleProgressSync() {
      clearPendingProgressSync();
      progressSyncTimer = window.setTimeout(function flushProgressSync() {
        progressSyncTimer = null;
        synchronizeProgressWithDrive({ manual: false });
      }, 1200);
    }

    async function synchronizeAllWithDrive() {
      if (!driveSyncController) {
        syncErrorMessage = "Google Drive sync is not available in this build.";
        render();
        return;
      }

      if (!driveSyncController.isConfigured()) {
        syncStatusMessage = "Google sign-in is not configured for this build yet.";
        render();
        return;
      }

      if (!driveSyncController.isSignedIn()) {
        syncStatusMessage = "Sign in with Google to sync this device with Drive.";
        render();
        return;
      }

      if (syncInFlight) {
        syncStatusMessage = "A Google Drive sync is already in progress.";
        render();
        return;
      }

      clearPendingProgressSync();

      let shouldRenderApp = false;
      syncInFlight = true;
      syncErrorMessage = "";
      render();

      try {
        syncStatusMessage = "Syncing rituals and plans...";
        render();
        const structureResult = await syncStructureFile();
        shouldRenderApp = shouldRenderApp || structureResult.shouldRenderApp;

        syncStatusMessage = "Syncing daily progress...";
        render();
        const progressResult = await syncProgressFile();
        shouldRenderApp = shouldRenderApp || progressResult.shouldRenderApp;

        syncStatusMessage = getCombinedSuccessMessage(structureResult.action, progressResult.action);
      } catch (error) {
        syncErrorMessage = getErrorMessage(error, "Could not sync with Google Drive.");
        syncStatusMessage = "Google Drive sync failed.";
      } finally {
        syncInFlight = false;
        if (shouldRenderApp) {
          renderApp();
        } else {
          render();
        }
      }
    }

    async function synchronizeProgressWithDrive(options) {
      if (!driveSyncController || !driveSyncController.isConfigured() || !driveSyncController.isSignedIn()) {
        render();
        return;
      }

      if (syncInFlight) {
        if (!progressSyncTimer) {
          scheduleProgressSync();
        }
        return;
      }

      let shouldRenderApp = false;
      syncInFlight = true;
      syncErrorMessage = "";
      syncStatusMessage = "Syncing today's progress...";
      render();

      try {
        const result = await syncProgressFile();
        shouldRenderApp = result.shouldRenderApp;
        syncStatusMessage = getProgressSuccessMessage(result.action);
      } catch (error) {
        syncErrorMessage = getErrorMessage(error, "Could not sync today's progress.");
        syncStatusMessage = (options && options.manual)
          ? "Google Drive sync failed."
          : "Could not sync today's progress right now.";
      } finally {
        syncInFlight = false;
        if (shouldRenderApp) {
          renderApp();
        } else {
          render();
        }
      }
    }

    async function syncStructureFile() {
      const result = await driveSyncController.syncFileEnvelope(getLocalStructureEnvelope(), {
        existingFileId: cloudState.structureFileId,
        fileName: getStructureFileName(),
      });
      const syncedAt = new Date().toISOString();

      syncAccountState(result.profile);

      if (result.fileId) {
        cloudState.structureFileId = result.fileId;
      }

      cloudState.lastStructureSyncedAt = syncedAt;
      cloudState.lastStructureRemoteUpdatedAt = result.remoteUpdatedAt || cloudState.lastStructureRemoteUpdatedAt;

      if (result.action === "download") {
        applyRemoteStructureEnvelope(result.envelope, syncedAt);
        persistSnapshot();
        return { action: "download", shouldRenderApp: true };
      }

      markLocalStructureSyncState(result.envelope.updatedAt || cloudState.structureLocalUpdatedAt || syncedAt);
      persistSnapshot();
      return { action: result.action, shouldRenderApp: false };
    }

    async function syncProgressFile() {
      const result = await driveSyncController.syncFileEnvelope(getLocalProgressEnvelope(), {
        existingFileId: cloudState.progressFileId,
        fileName: getProgressFileName(),
        fallbackFileNames: [getStructureFileName()],
      });
      const syncedAt = new Date().toISOString();

      syncAccountState(result.profile);

      if (result.fileId) {
        cloudState.progressFileId = result.fileId;
      }

      cloudState.lastProgressSyncedAt = syncedAt;
      cloudState.lastProgressRemoteUpdatedAt = result.remoteUpdatedAt || cloudState.lastProgressRemoteUpdatedAt;

      if (result.action === "download") {
        applyRemoteProgressEnvelope(result.envelope, syncedAt);
        persistSnapshot();
        return { action: "download", shouldRenderApp: true };
      }

      markLocalProgressSyncState(result.envelope.updatedAt || cloudState.progressLocalUpdatedAt || syncedAt);
      persistSnapshot();
      return { action: result.action, shouldRenderApp: false };
    }

    function render() {
      if (!elements.googleSignInButton) {
        return;
      }

      const hasClientId = Boolean(cloudState.googleClientId);
      const canStartGoogleSignIn = Boolean(
        hasClientId && driveSyncController && isGoogleAuthReady && isGoogleAuthPrepared()
      );
      const isSignedIn = Boolean(driveSyncController && driveSyncController.isSignedIn());
      const accountLabel = cloudState.googleAccountEmail || cloudState.googleAccountName;
      const statusText = syncErrorMessage || getStatusMessage(hasClientId, isSignedIn);

      elements.googleSignInButton.disabled = !canStartGoogleSignIn || syncInFlight;
      elements.googleSyncNowButton.disabled = !isSignedIn || syncInFlight;
      elements.googleSignOutButton.disabled = !isSignedIn || syncInFlight;
      elements.googleSyncNowButton.classList.toggle("is-hidden", !hasClientId);
      elements.googleSignOutButton.classList.toggle("is-hidden", !hasClientId);

      elements.googleSyncStatus.textContent = statusText;
      elements.googleSyncStatus.classList.toggle("is-danger-text", Boolean(syncErrorMessage));
      elements.googleSyncAccount.textContent = accountLabel ? `Signed in as ${accountLabel}.` : "";
      elements.googleSyncAccount.classList.toggle("is-hidden", !accountLabel);

      const metaParts = [];
      if (cloudState.lastStructureSyncedAt) {
        metaParts.push(`Rituals backed up ${formatSyncTimestamp(cloudState.lastStructureSyncedAt)}.`);
      }
      if (cloudState.lastProgressSyncedAt) {
        metaParts.push(`Progress synced ${formatSyncTimestamp(cloudState.lastProgressSyncedAt)}.`);
      }
      if (cloudState.hasPendingStructureSync) {
        metaParts.push("Ritual changes are waiting for manual sync.");
      }
      if (cloudState.hasPendingProgressSync) {
        metaParts.push("Local progress changes are waiting to sync.");
      }
      if (cloudState.structureFileId || cloudState.progressFileId) {
        metaParts.push("Stored in your Google Drive app data.");
      }
      elements.googleSyncMeta.textContent = metaParts.join(" ");
      elements.googleSyncMeta.classList.toggle("is-hidden", !metaParts.length);
    }

    function canPrepareGoogleAuth() {
      return Boolean(driveSyncController && typeof driveSyncController.prepare === "function");
    }

    function isGoogleAuthPrepared() {
      if (!driveSyncController) {
        return false;
      }

      if (typeof driveSyncController.isPrepared === "function") {
        return driveSyncController.isPrepared();
      }

      return true;
    }

    function clearPendingProgressSync() {
      if (progressSyncTimer) {
        window.clearTimeout(progressSyncTimer);
        progressSyncTimer = null;
      }
    }

    function syncAccountState(profile) {
      if (!profile) {
        return;
      }

      cloudState.googleAccountEmail = profile.email || cloudState.googleAccountEmail;
      cloudState.googleAccountName = profile.name || cloudState.googleAccountName;
    }

    function getStructureFileName() {
      return driveSyncController && driveSyncController.STRUCTURE_FILE_NAME
        ? driveSyncController.STRUCTURE_FILE_NAME
        : "ritual-flow-state.json";
    }

    function getProgressFileName() {
      return driveSyncController && driveSyncController.PROGRESS_FILE_NAME
        ? driveSyncController.PROGRESS_FILE_NAME
        : "ritual-flow-progress.json";
    }

    function getCombinedSuccessMessage(structureAction, progressAction) {
      if (structureAction === "download" || progressAction === "download") {
        return "Loaded the latest Google Drive data for this device.";
      }

      if (structureAction === "upload" || progressAction === "upload") {
        return "Google Drive now has your latest ritual changes and progress.";
      }

      return cloudState.hasPendingStructureSync
        ? "Today's progress is up to date. Ritual changes still need Sync now."
        : "Google Drive is already up to date.";
    }

    function getProgressSuccessMessage(action) {
      if (action === "download") {
        return cloudState.hasPendingStructureSync
          ? "Today's progress was refreshed. Ritual changes still need Sync now."
          : "Today's progress was refreshed from Google Drive.";
      }

      if (action === "upload") {
        return cloudState.hasPendingStructureSync
          ? "Today's progress is synced. Ritual changes still need Sync now."
          : "Today's progress is synced with Google Drive.";
      }

      return cloudState.hasPendingStructureSync
        ? "Today's progress is up to date. Ritual changes still need Sync now."
        : "Daily progress sync is up to date.";
    }

    function getStatusMessage(hasClientId, isSignedIn) {
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

      if (cloudState.hasPendingStructureSync) {
        return "Ritual changes are saved locally. Use Sync now to back them up.";
      }

      if (cloudState.hasPendingProgressSync) {
        return "Today's progress will sync automatically.";
      }

      return "Daily progress sync is active. Use Sync now when you change rituals or plans.";
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

    return {
      bindEvents,
      initialize,
      onStructureStateChanged,
      onProgressStateChanged,
      render,
    };
  }

  globalScope.RitualFlowGoogleSyncUI = {
    createController: createController,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
