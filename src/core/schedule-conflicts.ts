import type {CalendarEvent} from "./icalendar.js";
export interface ScheduleConflict{type:"overlap"|"assessment_after_late_training";severity:"high"|"medium";eventIds:string[];message:string;suggestedAction:string;}
const stamp=(s:string)=>Date.parse(s);
function localParts(ms:number,zone="Africa/Dakar"){const p=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ms));return Object.fromEntries(p.map(x=>[x.type,x.value]));}
function localDay(ms:number,zone:string){const p=localParts(ms,zone);return p.year+"-"+p.month+"-"+p.day;}
export function detectScheduleConflicts(events:CalendarEvent[],lateTrainingAfterHour=20,timezone="Africa/Dakar"):ScheduleConflict[]{
 const out:ScheduleConflict[]=[],seen=new Set<string>(),sorted=[...events].sort((a,b)=>stamp(a.start)-stamp(b.start));
 const add=(c:ScheduleConflict)=>{const key=c.type+":"+[...c.eventIds].sort().join("|");if(!seen.has(key)){seen.add(key);out.push(c);}};
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){const a=sorted[i],b=sorted[j];if(stamp(b.start)>=stamp(a.end))break;if(stamp(a.start)<stamp(b.end)&&stamp(b.start)<stamp(a.end))add({type:"overlap",severity:"high",eventIds:[a.uid,b.uid],message:"Chevauchement : "+a.summary+" / "+b.summary,suggestedAction:"Examiner et arbitrer manuellement le conflit"});}
 const work=sorted.filter(e=>e.kind==="assessment"||e.kind==="homework"),sport=sorted.filter(e=>e.kind==="football_training"||e.kind==="football_match");
 for(const a of work)for(const f of sport){const assessmentDay=localDay(stamp(a.start),timezone),trainingDay=localDay(stamp(f.start),timezone),endHour=Number(localParts(stamp(f.end),timezone).hour);const prev=new Date(Date.parse(assessmentDay+"T12:00:00Z")-86400000).toISOString().slice(0,10);if(trainingDay===prev&&endHour>=lateTrainingAfterHour)add({type:"assessment_after_late_training",severity:"medium",eventIds:[f.uid,a.uid],message:"Évaluation/devoir le lendemain d'un créneau football tardif : "+a.summary,suggestedAction:"Proposer une révision plus tôt; aucun agenda n'est modifié"});}
 return out;
}
