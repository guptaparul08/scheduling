(function createRitualFlowGoogleSyncUI(globalScope) {
  function createController(options) {
    const {
      googleClientId,
      driveSyncController,
      cloudState,
      elements,
      persistSnapshot,
      renderApp,
      getLocalSyncEnvelope,
      applyRemoteEnvelope,
      markLocalSyncState,
    } = options;

    let isGoogleAuthReady = false;
    let syncTimer = null;
    let syncInFlight = false;
    let syncStatusMessage = "";
    let syncErrorMessage = "";

    function bindEvents() {
      if (!elements.googleSignInButton || !elements.googleSyncNowButton || !elements.googleSignOutButton) {
        return;
      }

      elements.googleSignInButton.addEventListener("click", handleGoogleSignIn);
      elements.googleSyncNowButton.addEventListener("click", function onSyncNowClick() {
        synchronizeWithDrive({ manual: true });
      });
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
        syncStatusMessage = "Connected to Google. Checking Drive for newer data...";
        render();
        await synchronizeWithDrive({ manual: false });
      } catch (error) {
        isGoogleAuthReady = false;
        syncErrorMessage = getErrorMessage(error, "Could not initialize Google Drive sync.");
        syncStatusMessage = "Drive sync is available, but the Google session could not be restored.";
        render();
      }
    }

    function onSyncableStateChanged() {
      scheduleRemoteSync();
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
        syncStatusMessage = "Signed in. Syncing with Google Drive...";
        render();
        await synchronizeWithDrive({ manual: true });
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

      clearPendingSync();
      await driveSyncController.signOut();
      cloudState.googleAccountEmail = "";
      cloudState.googleAccountName = "";
      syncErrorMessage = "";
      syncStatusMessage = "Signed out of Google. Your local data is still available on this device.";
      persistSnapshot();
      render();
    }

    function scheduleRemoteSync() {
      if (!driveSyncController || !driveSyncController.isConfigured() || !driveSyncController.isSignedIn()) {
        render();
        return;
      }

      clearPendingSync();
      syncStatusMessage = "Changes saved locally. Google Drive sync is queued.";
      render();
      syncTimer = window.setTimeout(function onQueuedSync() {
        syncTimer = null;
        synchronizeWithDrive({ manual: false });
      }, 1200);
    }

    async function synchronizeWithDrive(options) {
      const syncOptions = options || {};

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
        if (syncOptions.manual) {
          syncStatusMessage = "A Google Drive sync is already in progress.";
          render();
        }
        return;
      }

      clearPendingSync();

      let shouldRenderApp = false;
      syncInFlight = true;
      syncErrorMessage = "";
      syncStatusMessage = "Syncing with Google Drive...";
      render();

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
          applyRemoteEnvelope(result.envelope, syncedAt);
          syncStatusMessage = "Loaded the newest data from Google Drive.";
          persistSnapshot();
          shouldRenderApp = true;
        } else if (result.action === "upload") {
          markLocalSyncState(result.envelope.updatedAt || cloudState.localUpdatedAt || syncedAt);
          syncStatusMessage = "Saved the latest changes to Google Drive.";
          persistSnapshot();
        } else {
          markLocalSyncState(result.envelope.updatedAt || cloudState.localUpdatedAt || syncedAt);
          syncStatusMessage = "Google Drive is already up to date.";
          persistSnapshot();
        }
      } catch (error) {
        syncErrorMessage = getErrorMessage(error, "Could not sync with Google Drive.");
        syncStatusMessage = syncOptions.manual
          ? "Google Drive sync failed."
          : "Automatic sync paused until the next successful connection.";
      } finally {
        syncInFlight = false;
        if (shouldRenderApp) {
          renderApp();
        } else {
          render();
        }
      }
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
      if (cloudState.lastSyncedAt) {
        metaParts.push(`Last synced ${formatSyncTimestamp(cloudState.lastSyncedAt)}.`);
      }
      if (cloudState.driveFileId) {
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

    function clearPendingSync() {
      if (syncTimer) {
        window.clearTimeout(syncTimer);
        syncTimer = null;
      }
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

    return {
      bindEvents,
      initialize,
      onSyncableStateChanged,
      render,
    };
  }

  globalScope.RitualFlowGoogleSyncUI = {
    createController: createController,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
