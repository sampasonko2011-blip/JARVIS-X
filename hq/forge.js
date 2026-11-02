const root = document.getElementById("capability-registry");
if (root) {
  const capabilities = [
    {
      name: "JARVIS-X executive reasoning",
      status: "SOURCE IMPLEMENTED · LIVE EXECUTION UNVERIFIED",
      detail: "One executive identity owns planning, challenge, synthesis, and the final response. The configured runtime is an implementation detail. Gateway source is not deployed."
    },
    {
      name: "Nano Banana image generation",
      status: "ADAPTER INTEGRATED · DISABLED BY DEFAULT",
      detail: "Separate image capability, not a reasoning assistant. Requires explicit confirmation, a server-side credential, and an atomic image budget. The migration is not applied and no live image call has been made."
    },
    {
      name: "XMemo memory",
      status: "MOCK CONTRACT TESTED · LIVE ROUNDTRIP UNVERIFIED",
      detail: "Per-request consent, bounded payloads, account-scoped paths, and fail-closed errors are source-tested. Live persistence, isolation, deletion, and cross-platform retrieval remain unverified."
    },
    {
      name: "Local capability broker",
      status: "READ-ONLY FOUNDATION · DEFAULT OFF",
      detail: "The registry includes a deterministic text-analysis capability. External connectors, browser actions, and write-capable tools are not connected to the gateway."
    },
    {
      name: "Encrypted portable export/import",
      status: "LOCAL FEATURE",
      detail: "Client-side encrypted export/import supports manual cross-platform transfer. It is not automatic cross-device synchronization."
    },
    {
      name: "External integrations",
      status: "NOT CONNECTED",
      detail: "GitHub, Notion, Canva, Airtable, and other services require their own explicit authorization, least-privilege scopes, server-side credentials, and verification."
    }
  ];
  root.replaceChildren(...capabilities.map((item) => {
    const card = document.createElement("div");
    card.className = "log";
    const title = document.createElement("strong");
    title.textContent = item.name;
    const status = document.createElement("span");
    status.className = "tag amber";
    status.textContent = item.status;
    const detail = document.createElement("small");
    detail.textContent = item.detail;
    card.append(title, status, detail);
    return card;
  }));
}
