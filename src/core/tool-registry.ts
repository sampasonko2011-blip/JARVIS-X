import { EvidenceLedger } from "./ledger.js";
import type { LedgerEntry } from "./types.js";
export type ToolPermissionLevel = "L1" | "L2" | "L3" | "L4";
export interface JsonSchema { type:"object"|"string"|"number"|"integer"|"boolean"|"array"; properties?:Record<string,JsonSchema>; required?:string[]; additionalProperties?:boolean; items?:JsonSchema; enum?:readonly unknown[]; minLength?:number; maxLength?:number; minimum?:number; maximum?:number; }
export interface ToolDefinition<I=unknown,O=unknown> { id:string; description:string; permission:ToolPermissionLevel; inputSchema:JsonSchema; outputSchema:JsonSchema; estimatedCostEUR:0; execute(input:I):Promise<O>|O; }
export interface ToolContext { consent:boolean; approvedByUser?:boolean; }
function validate(value:unknown,s:JsonSchema,path="$"):void {
 const fail=(m:string):never=>{throw new TypeError("Invalid tool payload at "+path+": "+m);};
 if(s.enum&&!s.enum.some(x=>Object.is(x,value)))fail("not in enum");
 switch(s.type){
 case "object":{if(!value||typeof value!=="object"||Array.isArray(value))fail("expected object");const r=value as Record<string,unknown>;for(const k of s.required??[])if(!(k in r))fail("missing required property "+k);for(const [k,v] of Object.entries(r)){const child=s.properties?.[k];if(!child){if(s.additionalProperties===false)fail("unknown property "+k);continue;}validate(v,child,path+"."+k);}break;}
 case "array":{if(!Array.isArray(value))fail("expected array");const items=value as unknown[];if(s.items)items.forEach((v:unknown,i:number)=>validate(v,s.items!,path+"["+i+"]"));break;}
 case "string":{if(typeof value!=="string")fail("expected string");const text=value as string;if(s.minLength!==undefined&&text.length<s.minLength)fail("too short");if(s.maxLength!==undefined&&text.length>s.maxLength)fail("too long");break;}
 case "number":case "integer":{if(typeof value!=="number"||!Number.isFinite(value)||(s.type==="integer"&&!Number.isInteger(value)))fail("expected finite "+s.type);const number=value as number;if(s.minimum!==undefined&&number<s.minimum)fail("below minimum");if(s.maximum!==undefined&&number>s.maximum)fail("above maximum");break;}
 case "boolean":if(typeof value!=="boolean")fail("expected boolean");
 }
}
export class ToolRegistry {
 private readonly tools=new Map<string,ToolDefinition>();
 constructor(private readonly ledger=new EvidenceLedger()){}
 register(tool:ToolDefinition):void{
  const id=tool.id.trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(id))throw new TypeError("Invalid tool id");
  if(this.tools.has(id))throw new Error("Tool already registered: "+id);
  if(tool.estimatedCostEUR!==0)throw new Error("Non-zero-cost tools are forbidden by the P2 zero-spend policy");
  if(tool.permission==="L4")throw new Error("L4 tools are not permitted in this phase");
  if(tool.inputSchema.type!=="object"||!tool.outputSchema)throw new TypeError("Explicit input and output schemas are required");
  this.tools.set(id,{...tool,id});
 }
 list(){return [...this.tools.values()].map(({id,description,permission,estimatedCostEUR})=>({id,description,permission,estimatedCostEUR}));}
 async invoke<I,O>(id:string,input:I,context:ToolContext):Promise<{toolId:string;output:O;status:"VALIDATED"}>{
  const tool=this.tools.get(id.trim().toLowerCase()) as ToolDefinition<I,O>|undefined;
  if(!tool)throw new Error("Tool is not registered");
  const base:LedgerEntry={objective:"Tool invocation: "+tool.id,constraints:["cost=0 EUR","explicit consent","permission="+tool.permission],capabilitiesAvailable:this.list().map(x=>x.id),capabilitiesInvoked:[tool.id],capabilitiesExecuted:[],verification:"UNPROVEN",errors:[],decision:"UNPROVEN"};
  try{
   if(context?.consent!==true)throw new Error("Explicit user consent is required");
   if(tool.permission==="L3"&&context.approvedByUser!==true)throw new Error("L3 requires separate human approval");
   validate(input,tool.inputSchema);
   const output=await tool.execute(input);validate(output,tool.outputSchema);
   this.ledger.record({...base,capabilitiesExecuted:[tool.id],verification:"VALIDATED",decision:"VALIDATED",outcome:"Input/output schema passed; handler completed"});
   return {toolId:tool.id,output,status:"VALIDATED"};
  }catch(e){const message=e instanceof Error?e.message:String(e);this.ledger.record({...base,verification:"REJECTED",decision:"REJECTED",errors:[message]});throw e;}
 }
}
