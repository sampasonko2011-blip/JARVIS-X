export function selectSampling(message) {
  const text = String(message || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const precision = /\b(code|bug|error|erreur|debug|debogage|git|server|serveur|architecture|script|math|maths|calculate|calcul|prove|preuve|verify|verifier|audit|security|securite|test|tester|validate|validation)\b/.test(text);
  const creative = /\b(idea|idee|story|histoire|brainstorm|design|concevoir|imagine|imaginer|creative|creatif|write|ecrire|rediger|name|nom|concept|invent|invente)\b/.test(text);

  // Precision wins when a request mixes implementation and creative wording.
  if (precision) {
    return { mode: "precision", temperature: 0.2, top_p: 0.85, frequency_penalty: 0.1, presence_penalty: 0 };
  }
  if (creative) {
    return { mode: "creative", temperature: 0.85, top_p: 0.95, frequency_penalty: 0.15, presence_penalty: 0.1 };
  }
  return { mode: "balanced", temperature: 0.6, top_p: 0.92, frequency_penalty: 0.1, presence_penalty: 0 };
}
