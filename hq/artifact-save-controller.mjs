import { OfflineSyncQueue } from "./offline-sync-queue.mjs";
import { LwwElementSet } from "./crdt-lww-set.mjs";
import { createEvolutionProposal, approveEvolutionProposal, activateApprovedProposal } from "./l3-evolution-gate.mjs";

const SUITE_ID = "jx-artifact-save-policy-v1";
const MAX_BYTES = 150_000;
const digest = async value => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};
let approvalDialog = null;
let pending = false;

function status(message) {
  const node = document.querySelector("#rcs-artifact-status");
  if (node) node.textContent = message;
}
function closeDialog() {
  approvalDialog?.remove();
  approvalDialog = null;
}
function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function showApproval(proposal, artifact, sha256, cases) {
  closeDialog();
  const dialog = makeElement("section", "jx-artifact-approval");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "jx-artifact-approval-title");
  const title = makeElement("h3", "", "Approbation L3 · sauvegarde locale");
  title.id = "jx-artifact-approval-title";
  const intro = makeElement("p", "", "Vérifie les contrôles, puis approuve explicitement l’ajout à la file locale chiffrée. Aucun envoi réseau ne sera effectué.");
  const list = makeElement("ul", "jx-artifact-checks");
  for (const item of cases) list.append(makeElement("li", item.status === "PASS" ? "is-pass" : "is-fail", item.id + " · " + item.status));
  const checkboxLabel = makeElement("label", "jx-artifact-consent");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "jx-artifact-approve";
  checkboxLabel.append(checkbox, makeElement("span", "", "J’ai examiné cet artefact et j’autorise sa sauvegarde locale."));
  const actions = makeElement("div", "jx-artifact-actions");
  const approve = makeElement("button", "btn primary", "Approuver et enregistrer");
  approve.type = "button";
  approve.disabled = true;
  const cancel = makeElement("button", "btn ghost", "Annuler");
  cancel.type = "button";
  checkbox.addEventListener("change", () => { approve.disabled = !checkbox.checked || pending; });
  cancel.addEventListener("click", () => { closeDialog(); status("Sauvegarde annulée · aucun artefact enregistré"); });
  approve.addEventListener("click", async () => {
    if (!checkbox.checked || pending) return;
    pending = true;
    approve.disabled = true;
    status("Approbation L3 confirmée · chiffrement et inscription locale en cours…");
    try {
      const approved = approveEvolutionProposal(proposal, {
        approvedBy: "local-session-user",
        approvalNote: "Explicit confirmation in the HQ artifact-save dialog.",
        expectedSuiteId: SUITE_ID
      });
      const result = await activateApprovedProposal(approved, {
        confirmId: proposal.id,
        activate: async ({ id, approval }) => {
          const crdt = new LwwElementSet({ actor: "hq-local-artifact" });
          crdt.add({ id, title: artifact.title, sha256, status: "pending", createdAt: new Date().toISOString() });
          const queue = new OfflineSyncQueue();
          const record = await queue.enqueue({
            type: "artifact.save",
            idempotencyKey: "artifact:" + sha256,
            metadata: { approval: "L3-human-confirmed", suiteId: SUITE_ID },
            payload: {
              artifactId: id,
              title: artifact.title,
              html: artifact.html,
              sha256,
              approval,
              crdtState: crdt.export()
            }
          });
          if (!record.encrypted) throw new Error("ENCRYPTED_OUTBOX_NOT_CONFIRMED");
          return { status: "SAVED_TO_ENCRYPTED_OUTBOX", queueId: record.id, duplicate: record.duplicate === true };
        }
      });
      closeDialog();
      status(result.duplicate
        ? "Artefact déjà présent dans la file locale chiffrée · aucune copie supplémentaire"
        : "Artefact enregistré dans la file locale AES-GCM · CRDT inclus · aucun envoi réseau");
      window.dispatchEvent(new CustomEvent("jx:artifact-save-result", { detail: { status: result.status, queueId: result.queueId, encrypted: true } }));
    } catch (error) {
      status("Sauvegarde refusée · " + String(error?.message || error));
    } finally {
      pending = false;
    }
  });
  actions.append(cancel, approve);
  dialog.append(title, intro, list, checkboxLabel, actions);
  document.body.append(dialog);
  approvalDialog = dialog;
  checkbox.focus();
}

window.addEventListener("jx:artifact-save-request", async event => {
  if (pending || approvalDialog) return;
  const artifact = event.detail;
  if (!artifact || artifact.requiresL3 !== true || typeof artifact.html !== "string") {
    status("Demande de sauvegarde invalide · refusée");
    return;
  }
  try {
    const bytes = new TextEncoder().encode(artifact.html).byteLength;
    const frame = document.querySelector("#rcs-artifact-frame");
    const sandboxResponse = await fetch("./artifact-sandbox.html", { cache: "no-store", credentials: "same-origin" });
    if (!sandboxResponse.ok) throw new Error("SANDBOX_POLICY_UNAVAILABLE");
    const sandboxHtml = await sandboxResponse.text();
    const cases = [
      { id: "payload-under-150-KB", status: bytes <= MAX_BYTES ? "PASS" : "FAIL" },
      { id: "no-external-or-module-scripts", status: !/<script\b[^>]*\bsrc\s*=|<script\b[^>]*\btype\s*=\s*["']module["']/i.test(artifact.html) ? "PASS" : "FAIL" },
      { id: "opaque-origin-iframe", status: frame?.getAttribute("sandbox") === "allow-scripts" && !frame.getAttribute("sandbox").includes("allow-same-origin") ? "PASS" : "FAIL" },
      { id: "sandbox-network-CSP", status: sandboxHtml.includes("default-src 'none'") && sandboxHtml.includes("connect-src 'none'") && sandboxHtml.includes("worker-src 'none'") ? "PASS" : "FAIL" }
    ];
    if (cases.some(item => item.status !== "PASS")) throw new Error("ARTIFACT_POLICY_CHECK_FAILED");
    const sha256 = await digest(artifact.html);
    const cspMatch = sandboxHtml.match(/Content-Security-Policy" content="([^"]+)"/);
    if (!cspMatch) throw new Error("SANDBOX_CSP_NOT_FOUND");
    const baselineId = await digest("JX_ARTIFACT_SANDBOX_POLICY_V1\n" + cspMatch[1]);
    const proposal = createEvolutionProposal({
      id: "artifact-" + sha256.slice(0, 24),
      title: String(artifact.title || "Generated artifact").slice(0, 80),
      artifact: artifact.html,
      baselineId,
      testReport: { suiteId: SUITE_ID, cases, evidenceRefs: ["sha256:" + sha256, "sandbox-policy:" + baselineId] }
    });
    showApproval(proposal, { ...artifact, title: String(artifact.title || "Generated artifact").slice(0, 80) }, sha256, cases);
    status("Contrôles locaux réussis · approbation humaine L3 requise avant toute persistance");
  } catch (error) {
    status("Sauvegarde bloquée · " + String(error?.message || error));
  }
});
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && approvalDialog && !pending) closeDialog();
});
