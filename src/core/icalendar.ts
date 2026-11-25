export type CalendarKind="school"|"homework"|"assessment"|"football_training"|"football_match"|"other";
export interface CalendarEvent{uid:string;summary:string;description:string;kind:CalendarKind;start:string;end:string;allDay:boolean;source:"pronote"|"football";timezone:string;recurrenceInstance:boolean;}
type Property={value:string;params:Record<string,string>};
const DEFAULT_TZ="Africa/Dakar";
function unfold(s:string){return s.replace(/\r\n[ \t]/g,"").replace(/\n[ \t]/g,"").split(/\r?\n/);}
function unescapeText(s:string){return s.replace(/\\n/gi,"\n").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\");}
function property(line:string):[string,Property]|null{const i=line.indexOf(":");if(i<1)return null;const left=line.slice(0,i).split(";"),key=left.shift()!.toUpperCase(),params:Record<string,string>={};for(const p of left){const x=p.indexOf("=");if(x>0)params[p.slice(0,x).toUpperCase()]=p.slice(x+1).replace(/^"|"$/g,"");}return[key,{value:line.slice(i+1),params}];}
function validZone(zone:string){try{new Intl.DateTimeFormat("en-US",{timeZone:zone}).format(0);return true;}catch{return false;}}
function zonedISO(raw:string,zone:string):string{
 const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(raw);if(!m)throw Error("Unsupported local date-time: "+raw);
 const [,y,mo,d,h,mi,se]=m;const target=Date.UTC(+y,+mo-1,+d,+h,+mi,+se);let guess=target;
 const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 for(let n=0;n<3;n++){const parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).map(p=>[p.type,p.value]));const represented=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);const delta=target-represented;if(!delta)break;guess+=delta;}
 return new Date(guess).toISOString();
}
function dateValue(p:Property,defaultZone=DEFAULT_TZ){const v=p.value;if(/^\d{8}$/.test(v)){const iso=v.slice(0,4)+"-"+v.slice(4,6)+"-"+v.slice(6,8)+"T00:00:00.000Z";if(Number.isNaN(Date.parse(iso)))throw Error("Invalid date");return{iso,allDay:true,timezone:"UTC"};}
 const zone=p.params.TZID??defaultZone;if(v.endsWith("Z")){const iso=v.slice(0,4)+"-"+v.slice(4,6)+"-"+v.slice(6,8)+"T"+v.slice(9,11)+":"+v.slice(11,13)+":"+v.slice(13,15)+".000Z";if(Number.isNaN(Date.parse(iso)))throw Error("Invalid UTC date");return{iso,allDay:false,timezone:"UTC"};}
 if(!validZone(zone))throw Error("Unsupported TZID: "+zone);return{iso:zonedISO(v,zone),allDay:false,timezone:zone};}
function classify(s:string,d:string,c:string,source:"pronote"|"football"):CalendarKind{const t=(s+" "+d+" "+c).toLocaleLowerCase("fr");if(source==="football")return /match|rencontre|compétition/.test(t)?"football_match":"football_training";if(/contrôle|evaluation|évaluation|exam(en)?|test/.test(t))return"assessment";if(/devoir|à faire|travail à rendre|homework/.test(t))return"homework";if(/cours|classe|leçon/.test(t))return"school";return"other";}
function parseRule(rule:string){const out:Record<string,string>={};for(const bit of rule.split(";")){const i=bit.indexOf("=");if(i>0)out[bit.slice(0,i).toUpperCase()]=bit.slice(i+1);}if(out.FREQ!=="WEEKLY")throw Error("Only weekly RRULE is supported");return out;}
const weekdays=["SU","MO","TU","WE","TH","FR","SA"];
export function parseICalendar(input:string,source:"pronote"|"football",options:{defaultTimezone?:string;rangeStart?:string;rangeEnd?:string;maxOccurrences?:number}={}):CalendarEvent[]{
 if(typeof input!=="string"||input.length>2_000_000)throw TypeError("ICS input must be text <= 2 MB");
 const lines=unfold(input);if(!lines.includes("BEGIN:VCALENDAR")||!lines.includes("END:VCALENDAR"))throw Error("Invalid iCalendar envelope");
 const raw:Record<string,Property>[]=[];let cur:Record<string,Property>|null=null;
 for(const line of lines){if(line==="BEGIN:VEVENT"){if(cur)throw Error("Nested VEVENT");cur={};continue;}if(line==="END:VEVENT"){if(!cur)throw Error("Unexpected VEVENT end");raw.push(cur);cur=null;continue;}if(!cur)continue;const parsed=property(line);if(parsed)cur[parsed[0]]=parsed[1];}
 if(cur)throw Error("Unclosed VEVENT");if(!raw.length)throw Error("Calendar contains no VEVENT");
 const rangeStart=Date.parse(options.rangeStart??"2000-01-01T00:00:00Z"),rangeEnd=Date.parse(options.rangeEnd??"2035-01-01T00:00:00Z"),max=Math.min(Math.max(options.maxOccurrences??500,1),2000),events:CalendarEvent[]=[];
 for(const e of raw){const startProp=e.DTSTART,endProp=e.DTEND,summaryProp=e.SUMMARY;if(!startProp||!endProp||!summaryProp)throw Error("VEVENT requires DTSTART, DTEND and SUMMARY");
 const a=dateValue(startProp,options.defaultTimezone??DEFAULT_TZ),b=dateValue(endProp,options.defaultTimezone??DEFAULT_TZ),duration=Date.parse(b.iso)-Date.parse(a.iso);if(duration<=0)throw Error("VEVENT end must be after start");
 const summary=unescapeText(summaryProp.value),description=unescapeText(e.DESCRIPTION?.value??""),uid=e.UID?.value??"generated-"+events.length,kind=classify(summary,description,e.CATEGORIES?.value??"",source);
 const base={uid,summary,description,kind,allDay:a.allDay,source,timezone:a.timezone};
 const rule=e.RRULE?.value;if(!rule){if(Date.parse(b.iso)>=rangeStart&&Date.parse(a.iso)<=rangeEnd)events.push({...base,start:a.iso,end:b.iso,recurrenceInstance:false});continue;}
 const r=parseRule(rule),interval=Math.max(1,Math.min(Number(r.INTERVAL??1),52)),count=Math.min(Number(r.COUNT??max),max),until=r.UNTIL?Date.parse(dateValue({value:r.UNTIL,params:{}},options.defaultTimezone??DEFAULT_TZ).iso):rangeEnd,byday=(r.BYDAY??weekdays[new Date(Date.parse(a.iso)).getUTCDay()]).split(",");
 let emitted=0,week=0;const seed=Date.parse(a.iso);
 while(emitted<count&&week<max){for(const day of byday){const idx=weekdays.indexOf(day);if(idx<0)throw Error("Unsupported RRULE BYDAY: "+day);const seedDay=new Date(seed).getUTCDay(),delta=week*7+(idx-seedDay);const startMs=seed+delta*86400000;if(startMs<seed||startMs>until||startMs>rangeEnd)continue;const endMs=startMs+duration;if(endMs>=rangeStart){events.push({...base,start:new Date(startMs).toISOString(),end:new Date(endMs).toISOString(),recurrenceInstance:true});}emitted++;if(emitted>=count)break;}week+=interval;if(seed+week*7*86400000>Math.min(until,rangeEnd)+7*86400000)break;}
 }
 return events.sort((x,y)=>x.start.localeCompare(y.start)||x.uid.localeCompare(y.uid));
}
