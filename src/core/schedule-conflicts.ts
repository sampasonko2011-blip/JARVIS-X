import type {CalendarEvent} from "./icalendar.js";
export interface ScheduleConflict{type:"overlap"|"assessment_after_late_training";severity:"high"|"medium";eventIds:string[];message:string;suggestedAction:string;}
const stamp=(s:string)=>Date.parse(s.endsWith("Z")?s:s+"Z");
export function detectScheduleConflicts(events:CalendarEvent[],lateTrainingAfterHour=20):ScheduleConflict[]{
 const out:ScheduleConflict[]=[];const sorted=[...events].sort((a,b)=>stamp(a.start)-stamp(b.start));
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){if(stamp(sorted[j].start)>=stamp(sorted[i].end))break;if(stamp(sorted[i].start)<stamp(sorted[j].end)&&stamp(sorted[j].start)<stamp(sorted[i].end))out.push({type:"overlap",severity:"high",eventIds:[sorted[i].uid,sorted[j].uid],message:"Chevauchement : "+sorted[i].summary+" / "+sorted[j].summary,suggestedAction:"Examiner et arbitrer manuellement le conflit"});}
 const work=sorted.filter(e=>e.kind==="assessment"||e.kind==="homework"),sport=sorted.filter(e=>e.kind==="football_training"||e.kind==="football_match");
 for(const a of work)for(const f of sport){const nextDay=new Date(stamp(a.start)).toISOString().slice(0,10),sportDay=new Date(stamp(f.start)).toISOString().slice(0,10),hour=new Date(stamp(f.end)).getUTCHours();if(sportDay===new Date(Date.parse(nextDay+"T00:00:00Z")-86400000).toISOString().slice(0,10)&&hour>=lateTrainingAfterHour)out.push({type:"assessment_after_late_training",severity:"medium",eventIds:[f.uid,a.uid],message:"Évaluation/devoir le lendemain d'un créneau football tardif : "+a.summary,suggestedAction:"Proposer une révision plus tôt; aucun agenda n'est modifié"});}
 return out;
}
