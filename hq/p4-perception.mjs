const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 120000;
const STORAGE_KEY = "jx-p4-perception-v1";
const MIME_TEXT = new Set(["text/plain","text/markdown","text/csv","application/json"]);
const MIME_IMAGE = new Set(["image/png","image/jpeg","image/webp"]);

export function validateImport(file) {
  if (!file || typeof file.size !== "number" || typeof file.type !== "string") return { valid:false, reason:"INVALID_FILE" };
  if (file.size < 1) return { valid:false, reason:"EMPTY_FILE" };
  if (file.size > MAX_FILE_BYTES) return { valid:false, reason:"FILE_TOO_LARGE", maxBytes:MAX_FILE_BYTES };
  if (!MIME_TEXT.has(file.type) && !MIME_IMAGE.has(file.type)) return { valid:false, reason:"UNSUPPORTED_TYPE" };
  return { valid:true, kind:MIME_TEXT.has(file.type) ? "text" : "image" };
}
export function normalizeText(text) {
  if (typeof text !== "string") throw new TypeError("TEXT_REQUIRED");
  const clean = text.replace(/\u0000/g,"").trim();
  if (!clean) throw new Error("EMPTY_TEXT");
  if (clean.length > MAX_TEXT_CHARS) throw new Error("TEXT_TOO_LARGE");
  return clean;
}
export function buildCoachPrompt(text, language="fr-FR", questionIndex=0) {
  const source = normalizeText(text).slice(0, 10000);
  const prompts = {
    "fr-FR": ["Résume le passage en trois idées, sans ajouter d'informations absentes du support.","Quelle est l'idée principale ? Réponds avec une preuve tirée du support.","Explique un terme important du passage et donne le contexte exact."],
    "en-US": ["Summarize the passage in three points without adding unsupported facts.","What is the main idea? Support your answer with evidence from the material.","Explain one important term using only the provided context."],
    "es-ES": ["Resume el texto en tres ideas sin añadir información que no aparezca en el material.","¿Cuál es la idea principal? Justifica tu respuesta con una prueba del texto.","Explica un término importante usando solo el contexto proporcionado."]
  };
  const list = prompts[language] || prompts["fr-FR"];
  return { language:prompts[language] ? language : "fr-FR", question:list[Math.abs(questionIndex)%list.length], source };
}
export function scoreBenchmark({reference="",raw="",pipeline="",mode="manual-unverified"}={}) {
  const words = value => new Set(String(value).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
  const target = words(reference);
  const score = answer => {
    const got = words(answer);
    if (!target.size) return { coverage:null, matched:0, referenceTerms:0 };
    const matched = [...target].filter(word=>got.has(word)).length;
    return { coverage:Number((matched/target.size).toFixed(4)), matched, referenceTerms:target.size };
  };
  return { schema:"jx.p4.benchmark.v1", mode, simulated:mode==="fixture-simulated", timestamp:new Date().toISOString(), raw:score(raw), pipeline:score(pipeline), note:"Lexical overlap only; not a correctness, safety, reasoning, or hallucination score. Run both answers on the same prompt and reference." };
}
function readSaved() {
  try { const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"); return data && typeof data==="object" ? data : {}; } catch { return {}; }
}
function saveSaved(data) {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); return true; } catch { return false; }
}
function init() {
  const root=document.querySelector("#p4-perception");
  if (!root || root.dataset.ready==="true") return;
  root.dataset.ready="true";
  const $=id=>root.querySelector("#"+id);
  const status=$("p4-status"), file=$("p4-file"), text=$("p4-text"), importBtn=$("p4-import"), coachOut=$("p4-coach-output");
  const canvas=$("p4-canvas"), ctx=canvas?.getContext("2d"), lang=$("p4-language");
  let supportText="", strokes=readSaved().strokes||[], drawing=false, current=[];
  const say=(message)=>{status.textContent=message;};
  const renderStrokes=()=>{ if(!ctx)return; ctx.clearRect(0,0,canvas.width,canvas.height); ctx.lineWidth=2.4; ctx.lineCap="round"; ctx.strokeStyle="#68e1e8"; for(const stroke of strokes){ctx.beginPath();stroke.forEach((p,i)=>{if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.stroke();} };
  const persist=()=>saveSaved({strokes,updatedAt:new Date().toISOString()});
  if(canvas && ctx){ renderStrokes(); const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height,p:Number.isFinite(e.pressure)?e.pressure:0.5};};
    canvas.addEventListener("pointerdown",e=>{drawing=true;current=[point(e)];canvas.setPointerCapture?.(e.pointerId);});
    canvas.addEventListener("pointermove",e=>{if(!drawing)return;const p=point(e);current.push(p);ctx.beginPath();const a=current[current.length-2];ctx.moveTo(a.x,a.y);ctx.lineTo(p.x,p.y);ctx.lineWidth=1.5+4*p.p;ctx.strokeStyle="#68e1e8";ctx.lineCap="round";ctx.stroke();});
    const end=()=>{if(!drawing)return;drawing=false;if(current.length)strokes.push(current);current=[];if(strokes.length>500)strokes=strokes.slice(-500);say(persist()?"Annotation enregistrée localement sur cet appareil.":"Stockage local indisponible ou saturé.");};
    canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);canvas.addEventListener("pointerleave",e=>{if(e.buttons===0)end();});
  }
  $("p4-clear-canvas")?.addEventListener("click",()=>{strokes=[];renderStrokes();say(persist()?"Annotations effacées localement.":"Impossible de mettre à jour le stockage.");});
  importBtn?.addEventListener("click",async()=>{
    const selected=file.files?.[0]; const check=validateImport(selected);
    if(!check.valid){say("Import refusé : "+check.reason+(check.maxBytes?" · maximum 8 Mio":""));return;}
    try{
      if(check.kind==="text"){supportText=normalizeText(await selected.text());text.value=supportText;say("Texte importé localement · "+supportText.length+" caractères · aucun envoi réseau.");}
      else {
        const url=URL.createObjectURL(selected); const preview=$("p4-image-preview"); preview.replaceChildren(); const img=document.createElement("img");img.onload=()=>URL.revokeObjectURL(url);img.onerror=()=>URL.revokeObjectURL(url);img.src=url;img.alt="Aperçu local du document image";preview.append(img);
        if(typeof img.decode==="function") await img.decode();
        const Detector=window.TextDetector;
        if(typeof Detector==="function"){try{const detector=new Detector();const blocks=await detector.detect(img);supportText=normalizeText(blocks.map(b=>b.rawValue||"").join("\n"));text.value=supportText;say("OCR navigateur disponible · texte extrait localement. Vérifie le résultat.");}catch{say("OCR disponible mais extraction échouée. Saisis ou colle le texte manuellement.");}}
        else say("Image importée pour annotation · OCR_UNAVAILABLE dans ce navigateur. Aucun texte n'a été inventé : saisis ou colle le contenu manuellement.");
        img.onload=()=>URL.revokeObjectURL(url);
      }
    }catch(error){say("Import non traité : "+String(error.message||error));}
  });
  window.addEventListener("jx:pronote-snapshot",event=>{const snapshot=event.detail?.snapshot;if(event.detail?.schema_version!=="pronote.snapshot.v1"||!Array.isArray(snapshot?.events))return;supportText=normalizeText(snapshot.events.slice(0,250).map(item=>[item.summary,item.kind,item.start,item.description].filter(v=>typeof v==="string").join(" · ")).join("\n"));text.value=supportText;say("Snapshot PRONOTE v1 chargé · "+snapshot.events.length+" événements · vérifie la fraîcheur et le contenu.");});
  lang?.addEventListener("change",()=>{$("p4-question-index").value="0";});
  $("p4-use-text")?.addEventListener("click",()=>{try{supportText=normalizeText(text.value);say("Support prêt pour le coach oral. Source conservée localement.");}catch(e){say("Support invalide : "+String(e.message||e));}});
  $("p4-use-pronote")?.addEventListener("click",()=>say("Rafraîchis d’abord le snapshot PRONOTE dans son panneau, puis réessaie."));
  $("p4-coach-next")?.addEventListener("click",()=>{try{if(!supportText)supportText=normalizeText(text.value);const n=Number($("p4-question-index").value||0);const prompt=buildCoachPrompt(supportText,lang.value,n);$("p4-question-index").value=String(n+1);coachOut.textContent=prompt.question+"\n\nSupport utilisé : "+prompt.source.slice(0,700)+(prompt.source.length>700?"…":"");}catch(e){coachOut.textContent="Ajoute d'abord un support textuel valide.";say(String(e.message||e));}});
  let coachRecognition = null;
  $("p4-listen")?.addEventListener("click", () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { say("Reconnaissance vocale indisponible dans ce navigateur."); return; }
    if (coachRecognition) return;
    try {
      coachRecognition = new Recognition();
      coachRecognition.lang = lang.value;
      coachRecognition.continuous = false;
      coachRecognition.interimResults = true;
      coachRecognition.onresult = (event) => {
        let finalText = "", interim = "";
        for (let i = event.resultIndex || 0; i < event.results.length; i += 1) {
          const value = event.results[i]?.[0]?.transcript || "";
          if (event.results[i].isFinal) finalText += value; else interim += value;
        }
        const answer = $("p4-answer");
        if (finalText.trim()) answer.value = (answer.value + " " + finalText.trim()).trim();
        say(interim ? "Transcription en cours · " + interim : "Transcription ajoutée au brouillon. Relis-la avant toute utilisation.");
      };
      coachRecognition.onerror = (event) => say("Reconnaissance vocale : " + String(event.error || "erreur") + " · aucune soumission automatique.");
      coachRecognition.onend = () => { coachRecognition = null; };
      coachRecognition.start();
      say("Microphone activé par ton clic. Le navigateur peut traiter l’audio via son service ; transcription modifiable, jamais envoyée automatiquement.");
    } catch (error) { coachRecognition = null; say("Microphone non activé : " + String(error.message || error)); }
  });
  $("p4-stop-listen")?.addEventListener("click", () => {
    if (coachRecognition) { try { coachRecognition.stop(); } catch {} coachRecognition = null; }
    say("Microphone coach arrêté.");
  });
  window.addEventListener("pagehide", () => {
    if (coachRecognition) { try { coachRecognition.stop(); } catch {} coachRecognition = null; }
    window.speechSynthesis?.cancel();
  });
  $("p4-speak")?.addEventListener("click",()=>{const speech=window.speechSynthesis;if(!speech||!window.SpeechSynthesisUtterance){say("Synthèse vocale indisponible.");return;}const u=new SpeechSynthesisUtterance(coachOut.textContent);u.lang=lang.value;speech.cancel();speech.speak(u);});
  $("p4-stop-speech")?.addEventListener("click",()=>window.speechSynthesis?.cancel());
  $("p4-benchmark")?.addEventListener("click",()=>{const result=scoreBenchmark({reference:$("p4-reference").value,raw:$("p4-raw").value,pipeline:$("p4-pipeline").value,mode:$("p4-benchmark-mode").value});$("p4-benchmark-result").textContent=JSON.stringify(result,null,2);say(result.simulated?"Résultat de fixture simulée · ne pas confondre avec une exécution de modèle.":"Comparaison saisie manuellement · sorties réelles non vérifiées par cette interface.");});
  $("p4-export")?.addEventListener("click",()=>{const payload={schema:"jx.p4.annotations.v1",exportedAt:new Date().toISOString(),strokes};const blob=new Blob([JSON.stringify(payload)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="jarvis-x-annotations.json";a.click();URL.revokeObjectURL(url);});
}
if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();}
