(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const status = $("pronote-token-status");
  if (!status) return;

  const tokenValue = $("pronote-token-value");
  const createButton = $("pronote-token-create");
  const revokeButton = $("pronote-token-revoke");
  const copyButton = $("pronote-token-copy");
  const refreshButton = $("pronote-snapshot-refresh");
  let activeTokenId = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function sessionHeaders(session) {
    return {
      apikey: JX_SUPABASE_KEY,
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  async function authenticatedSession() {
    const session = await jxEnsureSession();
    if (!session?.access_token) throw new Error("Connexion JARVIS-X requise.");
    return session;
  }

  async function responseJson(response, fallback) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = typeof data.error === "string" ? data.error : fallback + " (HTTP " + response.status + ")";
      throw new Error(reason);
    }
    return data;
  }

  createButton?.addEventListener("click", async () => {
    if (!confirm("Créer ou renouveler le jeton d’ingestion PRONOTE ? L’ancien jeton actif sera révoqué.")) return;
    createButton.disabled = true;
    setStatus("Création du jeton sécurisé…");
    try {
      const session = await authenticatedSession();
      const response = await fetch(JX_SUPABASE_URL + "/functions/v1/pronote-ipad-bridge/token", {
        method: "POST", cache: "no-store", headers: sessionHeaders(session), body: "{}"
      });
      const result = await responseJson(response, "Création du jeton impossible");
      if (typeof result.token !== "string" || !/^[a-f0-9]{64}$/.test(result.token) ||
          typeof result.token_id !== "string" || !/^[0-9a-f-]{36}$/i.test(result.token_id)) {
        throw new Error("Réponse de création du jeton invalide.");
      }
      activeTokenId = result.token_id;
      tokenValue.value = result.token;
      tokenValue.type = "password";
      revokeButton.disabled = false;
      copyButton.disabled = false;
      setStatus("Token created · affiché une seule fois · expiration " + String(result.expires_at || "inconnue") +
        ". Enregistre-le dans Mots de passe Apple; ne le partage pas.");
    } catch (error) {
      setStatus("Création refusée : " + String(error?.message || error));
    } finally {
      createButton.disabled = false;
    }
  });

  revokeButton?.addEventListener("click", async () => {
    if (!activeTokenId) {
      setStatus("Aucun jeton actif créé dans cette session.");
      return;
    }
    if (!confirm("Révoquer le jeton d’ingestion PRONOTE actif ?")) return;
    revokeButton.disabled = true;
    setStatus("Révocation du jeton…");
    try {
      const session = await authenticatedSession();
      const response = await fetch(JX_SUPABASE_URL + "/functions/v1/pronote-ipad-bridge/token/revoke", {
        method: "POST", cache: "no-store", headers: sessionHeaders(session),
        body: JSON.stringify({ token_id: activeTokenId })
      });
      const result = await responseJson(response, "Révocation impossible");
      if (result.revoked !== true) throw new Error("Le serveur n’a pas confirmé la révocation.");
      activeTokenId = null;
      tokenValue.value = "";
      copyButton.disabled = true;
      setStatus("Token revoked · l’ancien jeton ne doit plus pouvoir ingérer de données.");
    } catch (error) {
      revokeButton.disabled = false;
      setStatus("Révocation non confirmée : " + String(error?.message || error));
    }
  });

  copyButton?.addEventListener("click", async () => {
    if (!tokenValue.value) return;
    try {
      await navigator.clipboard.writeText(tokenValue.value);
      setStatus("Jeton copié. Colle-le uniquement dans le gestionnaire de mots de passe Apple.");
    } catch {
      setStatus("Presse-papiers indisponible. Sélectionne le champ et copie manuellement.");
    }
  });

  refreshButton?.addEventListener("click", async () => {
    refreshButton.disabled = true;
    const snapshotStatus = $("pronote-snapshot-status");
    const eventsRoot = $("pronote-snapshot-events");
    snapshotStatus.textContent = "Lecture du snapshot PRONOTE sécurisé…";
    eventsRoot.replaceChildren();
    try {
      const session = await authenticatedSession();
      const query = new URLSearchParams({
        select: "schema_version,generated_at,received_at,snapshot_hash,event_count,snapshot",
        order: "received_at.desc",
        limit: "1"
      });
      const response = await fetch(JX_SUPABASE_URL + "/rest/v1/pronote_ipad_snapshots?" + query, {
        method: "GET", cache: "no-store",
        headers: { apikey: JX_SUPABASE_KEY, Authorization: "Bearer " + session.access_token, Accept: "application/json" }
      });
      const rows = await responseJson(response, "Lecture du snapshot impossible");
      if (!Array.isArray(rows) || !rows.length) {
        snapshotStatus.textContent = "Aucun snapshot PRONOTE enregistré pour ce compte.";
        return;
      }
      const row = rows[0];
      if (row.schema_version !== "pronote.snapshot.v1" || !row.snapshot ||
          !Array.isArray(row.snapshot.events) || !Number.isFinite(Date.parse(row.generated_at))) {
        throw new Error("Snapshot enregistré invalide ou incompatible.");
      }
      const age = Date.now() - Date.parse(row.generated_at);
      const freshness = row.snapshot.freshnessBasis === "ingestion_time_only" ? "UNKNOWN" : age < 0 ? "UNKNOWN" : age <= 24 * 60 * 60 * 1000 ? "FRESH" : "STALE";
      const count = row.snapshot.events.length;
      snapshotStatus.textContent = freshness + " · " + count + " events · reçu " + String(row.received_at || "inconnu") +
        " · source " + row.schema_version;
      for (const event of row.snapshot.events.slice(0, 250)) {
        const item = document.createElement("p");
        const title = document.createElement("strong");
        title.textContent = typeof event.summary === "string" ? event.summary : "Événement sans titre";
        item.append(title, document.createTextNode(" · " + String(event.kind || "other") +
          " · " + String(event.start || "")));
        eventsRoot.append(item);
      }
    } catch (error) {
      snapshotStatus.textContent = "Lecture refusée : " + String(error?.message || error);
    } finally {
      refreshButton.disabled = false;
    }
  });
})();
