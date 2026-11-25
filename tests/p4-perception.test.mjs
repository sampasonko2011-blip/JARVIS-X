import test from "node:test";
import assert from "node:assert/strict";
import { validateImport, normalizeText, buildCoachPrompt, scoreBenchmark } from "../hq/p4-perception.mjs";

test("P4 import accepts supported text and image types within limit",()=>{
 assert.deepEqual(validateImport({size:10,type:"text/plain"}),{valid:true,kind:"text"});
 assert.deepEqual(validateImport({size:10,type:"image/png"}),{valid:true,kind:"image"});
 assert.deepEqual(validateImport({size:10,type:"application/pdf"}),{valid:true,kind:"pdf"});
});
test("P4 import rejects oversized and unsupported files",()=>{
 assert.equal(validateImport({size:8*1024*1024+1,type:"text/plain"}).reason,"FILE_TOO_LARGE");
 assert.equal(validateImport({size:10,type:"application/x-msdownload"}).reason,"UNSUPPORTED_TYPE");
});
test("P4 text normalization rejects empty input and strips NUL",()=>{
 assert.equal(normalizeText("  A\u0000B  "),"AB");
 assert.throws(()=>normalizeText("  "),/EMPTY_TEXT/);
});
test("P4 coach prompt is multilingual and grounded in supplied text",()=>{
 const result=buildCoachPrompt("La photosynthèse transforme la lumière.","fr-FR",0);
 assert.match(result.question,/Résume/);
 assert.equal(result.source,"La photosynthèse transforme la lumière.");
 assert.equal(buildCoachPrompt("hello","en-US",0).language,"en-US");
 assert.equal(buildCoachPrompt("hola","es-ES",0).language,"es-ES");
});
test("P4 benchmark distinguishes fixture simulation from manual comparison",()=>{
 const simulated=scoreBenchmark({reference:"alpha beta gamma",raw:"alpha",pipeline:"alpha beta",mode:"fixture-simulated"});
 assert.equal(simulated.simulated,true);
 assert.equal(simulated.raw.coverage,0.3333);
 const manual=scoreBenchmark({reference:"alpha beta",raw:"alpha",pipeline:"beta",mode:"manual-unverified"});
 assert.equal(manual.simulated,false);
 assert.equal(manual.note.includes("not a correctness"),true);
});
