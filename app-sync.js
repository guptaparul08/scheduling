(function createRitualFlowSync(globalScope) {
  const GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.appdata",
  ].join(" ");
  const DRIVE_FILE_NAME = "ritual-flow-state.json";

  let googleScriptPromise = null;

  function loadGoogleScript() {
    if (globalScope.google && globalScope.google.accounts && globalScope.google.accounts.oauth2) {
      return Promise.resolve();
    }

    if (googleScriptPromise) {
      return googleScriptPromise;
    }

    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the Google Identity Services client."));
      document.head.append(script);
    });

    return googleScriptPromise;
  }

  function createDriveSyncController() {
    let clientId = "";
    let tokenClient = null;
    let accessToken = "";
    let profile = null;
    let hasAttemptedSilentSignIn = false;
    let isReady = false;
    let preparePromise = null;

    function setClientId(nextClientId) {
      const normalized = String(nextClientId || "").trim();
      if (normalized === clientId) {
        return;
      }

      clientId = normalized;
      tokenClient = null;
      accessToken = "";
      profile = null;
      hasAttemptedSilentSignIn = false;
      isReady = false;
      preparePromise = null;
    }

    function getClientId() {
      return clientId;
    }

    function isConfigured() {
      return Boolean(clientId);
    }

    function isPrepared() {
      return isReady;
    }

    function isSignedIn() {
      return Boolean(accessToken);
    }

    function getProfile() {
      return profile ? { ...profile } : null;
    }

    async function prepare() {
      if (!clientId) {
        throw new Error("Google sign-in is not configured for this build.");
      }

      if (tokenClient && isReady) {
        return tokenClient;
      }

      if (preparePromise) {
        return preparePromise;
      }

      preparePromise = (async function initializeTokenClient() {
        await loadGoogleScript();

        tokenClient = globalScope.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_SCOPES,
          callback: () => {},
          error_callback: () => {},
        });
        isReady = true;
        return tokenClient;
      })();

      try {
        return await preparePromise;
      } finally {
        preparePromise = null;
      }
    }

    function ensureTokenClient() {
      if (!clientId) {
        throw new Error("Google sign-in is not configured for this build.");
      }

      if (!tokenClient || !isReady) {
        throw new Error("Google sign-in is still loading. Try again in a moment.");
      }

      return tokenClient;
    }

    function requestAccessToken(promptValue) {
      const nextTokenClient = ensureTokenClient();

      return new Promise((resolve, reject) => {
        nextTokenClient.callback = (response) => {
          if (!response || response.error) {
            reject(new Error(response && response.error ? response.error : "Google sign-in was cancelled."));
            return;
          }

          accessToken = response.access_token || "";
          resolve(response);
        };
        nextTokenClient.error_callback = (error) => {
          reject(new Error(error && error.type ? error.type : "Google sign-in failed."));
        };
        nextTokenClient.requestAccessToken({ prompt: promptValue });
      });
    }

    async function fetchUserProfile() {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(await readGoogleError(response));
      }

      profile = await response.json();
      return getProfile();
    }

    async function signIn() {
      await requestAccessToken("consent");
      return fetchUserProfile();
    }

    async function maybeRestoreSession() {
      if (hasAttemptedSilentSignIn || !clientId) {
        return null;
      }

      hasAttemptedSilentSignIn = true;

      try {
        await prepare();
        await requestAccessToken("");
        return await fetchUserProfile();
      } catch {
        accessToken = "";
        profile = null;
        return null;
      }
    }

    async function signOut() {
      if (accessToken && globalScope.google && globalScope.google.accounts && globalScope.google.accounts.oauth2) {
        globalScope.google.accounts.oauth2.revoke(accessToken, () => {});
      }

      accessToken = "";
      profile = null;
    }

    async function syncEnvelope(localEnvelope, existingFileId) {
      if (!accessToken) {
        throw new Error("Sign in with Google before syncing.");
      }

      const remoteFile = await findDriveFile(existingFileId);
      const remoteEnvelope = remoteFile ? await downloadFile(remoteFile.id) : null;
      const direction = globalScope.RitualFlowCore.decideSyncDirection(localEnvelope, remoteEnvelope);

      if (direction === "download" && remoteFile && remoteEnvelope) {
        return {
          action: "download",
          envelope: remoteEnvelope,
          fileId: remoteFile.id,
          remoteUpdatedAt: remoteFile.modifiedTime || remoteEnvelope.updatedAt || "",
          profile: getProfile(),
        };
      }

      if (direction === "upload") {
        const uploaded = await uploadFile(localEnvelope, remoteFile ? remoteFile.id : existingFileId);
        return {
          action: "upload",
          envelope: localEnvelope,
          fileId: uploaded.id,
          remoteUpdatedAt: uploaded.modifiedTime || localEnvelope.updatedAt || "",
          profile: getProfile(),
        };
      }

      return {
        action: "noop",
        envelope: remoteEnvelope || localEnvelope,
        fileId: remoteFile ? remoteFile.id : existingFileId || "",
        remoteUpdatedAt: remoteFile
          ? remoteFile.modifiedTime || (remoteEnvelope && remoteEnvelope.updatedAt) || ""
          : localEnvelope.updatedAt || "",
        profile: getProfile(),
      };
    }

    async function findDriveFile(existingFileId) {
      if (existingFileId) {
        const metadata = await fetchDriveMetadata(existingFileId);
        if (metadata) {
          return metadata;
        }
      }

      const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${query}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(await readGoogleError(response));
      }

      const payload = await response.json();
      return payload.files && payload.files.length ? payload.files[0] : null;
    }

    async function fetchDriveMetadata(fileId) {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(await readGoogleError(response));
      }

      return response.json();
    }

    async function downloadFile(fileId) {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(await readGoogleError(response));
      }

      return response.json();
    }

    async function uploadFile(envelope, fileId) {
      const metadata = fileId
        ? { name: DRIVE_FILE_NAME }
        : { name: DRIVE_FILE_NAME, parents: ["appDataFolder"] };
      const url = fileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,modifiedTime`
        : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime";
      const method = fileId ? "PATCH" : "POST";
      const boundary = `ritual-flow-${Date.now()}`;
      const multipartBody = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(envelope, null, 2),
        `--${boundary}--`,
      ].join("\r\n");
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      });

      if (!response.ok) {
        throw new Error(await readGoogleError(response));
      }

      return response.json();
    }

    return {
      DRIVE_FILE_NAME,
      GOOGLE_SCOPES,
      setClientId,
      getClientId,
      isConfigured,
      isPrepared,
      isSignedIn,
      getProfile,
      prepare,
      signIn,
      maybeRestoreSession,
      signOut,
      syncEnvelope,
    };
  }

  async function readGoogleError(response) {
    try {
      const payload = await response.json();
      if (payload && payload.error) {
        if (typeof payload.error === "string") {
          return payload.error;
        }

        if (payload.error.message) {
          return payload.error.message;
        }
      }
    } catch {
      return `Google request failed with status ${response.status}.`;
    }

    return `Google request failed with status ${response.status}.`;
  }

  globalScope.RitualFlowSync = {
    GOOGLE_SCOPES,
    DRIVE_FILE_NAME,
    createDriveSyncController,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
