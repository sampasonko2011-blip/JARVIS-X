export function validateModelCandidates(registry) {
  const errors = [];
  const candidates = Array.isArray(registry?.candidates) ? registry.candidates : [];
  const allowedStatuses = new Set(registry?.selection_policy?.status_vocabulary ?? []);
  const ids = new Set();

  if (candidates.length === 0) errors.push("candidates must be a non-empty array");

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== "string" || candidate.id.length === 0) {
      errors.push("candidate has a missing or invalid id");
      continue;
    }
    if (ids.has(candidate.id)) errors.push(`duplicate candidate id: ${candidate.id}`);
    ids.add(candidate.id);
    if (!allowedStatuses.has(candidate.status)) errors.push(`invalid status for ${candidate.id}: ${String(candidate.status)}`);
  }

  const superseded = new Set(candidates.filter(candidate => candidate?.status === "SUPERSEDED").map(candidate => candidate.id));
  const activeRoles = [
    ["role_layers", registry?.role_layers ?? {}],
    ["evaluation_plan.roles", registry?.evaluation_plan?.roles ?? {}]
  ];

  for (const [path, roles] of activeRoles) {
    for (const [role, refs] of Object.entries(roles)) {
      if (!Array.isArray(refs)) {
        errors.push(`${path}.${role} must be an array`);
        continue;
      }
      for (const id of refs) {
        if (!ids.has(id)) errors.push(`unresolved ${path}.${role} reference: ${id}`);
        if (superseded.has(id)) errors.push(`superseded candidate assigned to ${path}.${role}: ${id}`);
      }
    }
  }
  return errors;
}
