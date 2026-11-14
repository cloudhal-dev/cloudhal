/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/release-{manifest,statement}.schema.json
 * (run `pnpm gen`; packages/release-verify/scripts/gen-validators.ts)
 */
import __req0 from "ajv/dist/runtime/equal.js";
import __req1 from "ajv/dist/runtime/ucs2length.js";
import __req2 from "ajv-formats/dist/formats.js";
"use strict";
export const validateReleaseManifest = validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/release-manifest.schema.json","title":"ReleaseManifest","description":"cloudhal.release-manifest@1 (RFC-0046): the manifest of one Cloudhal release bundle, published as the release asset manifest.json next to the gzip tarball cloudhal-release-<version>.tar.gz. A project release is signed through release-statement.json, which pins this file's SHA-256 and size (signing.signature = release-statement.sig); the legacy form manifest.sig, a raw 64-byte Ed25519 signature over these exact bytes, is for development keys only. It describes every built Worker module and static asset by size and SHA-256, the binding templates, feature levels, migration range and rollback facts a remote deployer needs to install, update or refuse a version without running a build. Portable on purpose: it references common only for SchemaVersion and Timestamp; every other definition is local.","type":"object","additionalProperties":false,"required":["schemaVersion","format","version","channel","securityRelease","commit","createdAt","contracts","levels","migrations","durableObjects","runtime","toolchain","theme","skills","workers","bindingTemplates","requiredScopes","optionalScopes","requiredCapabilities","optionalCapabilities","starter","features","planVersion","signing"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"format":{"type":"string","enum":["cloudhal.release-manifest@1"]},"version":{"$ref":"#/$defs/CloudhalVersion"},"channel":{"type":"string","enum":["stable","next"]},"securityRelease":{"type":"boolean"},"commit":{"type":"string","pattern":"^[0-9a-f]{40}$"},"createdAt":{"$ref":"#/$defs/Timestamp"},"contracts":{"type":"object","additionalProperties":false,"required":["schemaVersion"],"properties":{"schemaVersion":{"type":"integer","enum":[1]}}},"levels":{"type":"object","additionalProperties":false,"required":["schedules","gates"],"properties":{"schedules":{"type":"integer","minimum":0},"gates":{"type":"integer","minimum":0}}},"migrations":{"type":"object","additionalProperties":false,"required":["first","last","count","names","compatibleWithPrevious"],"properties":{"first":{"$ref":"#/$defs/MigrationName"},"last":{"$ref":"#/$defs/MigrationName"},"count":{"type":"integer","minimum":1},"names":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/$defs/MigrationName"}},"compatibleWithPrevious":{"type":"boolean"}}},"durableObjects":{"type":"object","additionalProperties":false,"required":["bindings","lifecycleChange"],"properties":{"bindings":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","className","migration"],"properties":{"name":{"$ref":"#/$defs/BindingName"},"className":{"type":"string","pattern":"^[A-Z][A-Za-z0-9]*$"},"migration":{"type":"string","pattern":"^v[1-9][0-9]*$"}}}},"lifecycleChange":{"type":"boolean"}}},"runtime":{"type":"object","additionalProperties":false,"required":["compatibilityDate","compatibilityFlags"],"properties":{"compatibilityDate":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"compatibilityFlags":{"type":"array","uniqueItems":true,"items":{"type":"string","pattern":"^[a-z0-9_]+$"}}}},"toolchain":{"type":"object","additionalProperties":{"type":"string","maxLength":64}},"theme":{"type":"object","additionalProperties":false,"required":["name","version","blockTypes","settingsSha256","designSha256"],"properties":{"name":{"type":"string","pattern":"^[a-z][a-z0-9-]{0,63}$"},"version":{"type":"string","maxLength":64},"blockTypes":{"type":"array","uniqueItems":true,"items":{"type":"string"}},"settingsSha256":{"$ref":"#/$defs/Sha256Hex"},"designSha256":{"$ref":"#/$defs/Sha256Hex"}}},"skills":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","sha256"],"properties":{"name":{"type":"string","pattern":"^[a-z][a-z0-9-]{0,63}$"},"sha256":{"$ref":"#/$defs/Sha256Hex"}}}},"workers":{"type":"object","additionalProperties":false,"required":["site","admin"],"properties":{"site":{"$ref":"#/$defs/WorkerArtifact"},"admin":{"$ref":"#/$defs/WorkerArtifact"}}},"bindingTemplates":{"type":"object","additionalProperties":false,"required":["site","admin"],"properties":{"site":{"$ref":"#/$defs/BindingTemplate"},"admin":{"$ref":"#/$defs/BindingTemplate"}}},"requiredScopes":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/ScopeId"}},"optionalScopes":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/ScopeId"}},"requiredCapabilities":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/Capability"}},"optionalCapabilities":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/Capability"}},"starter":{"oneOf":[{"type":"object","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["admin-api"]}}},{"type":"object","additionalProperties":false,"required":["kind","path","bytes","sha256","siteId"],"properties":{"kind":{"type":"string","enum":["bundle"]},"path":{"type":"string","pattern":"^starter/[A-Za-z0-9._-]+$"},"bytes":{"type":"integer","minimum":1},"sha256":{"$ref":"#/$defs/Sha256Hex"},"siteId":{"$ref":"#/$defs/SiteId"}}}]},"features":{"type":"object","additionalProperties":{"type":"boolean"},"required":["adminSitesAcceptsSiteId","healthReportsVersion","mediaTransformVar"],"properties":{"adminSitesAcceptsSiteId":{"type":"boolean"},"healthReportsVersion":{"type":"boolean"},"mediaTransformVar":{"type":"boolean"}}},"planVersion":{"type":"integer","minimum":1},"signing":{"type":"object","additionalProperties":false,"required":["keyId","algorithm","signature"],"properties":{"keyId":{"type":"string","pattern":"^[a-z0-9][a-z0-9-]{2,63}$"},"algorithm":{"type":"string","enum":["Ed25519"]},"signature":{"type":"string","enum":["manifest.sig","release-statement.sig"]}}}},"$defs":{"BindingName":{"type":"string","pattern":"^[A-Z][A-Z0-9_]*(_\\*)?$"},"BindingTemplate":{"type":"object","additionalProperties":false,"required":["bindings","vars","secrets"],"properties":{"bindings":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","type","required"],"properties":{"name":{"$ref":"#/$defs/BindingName"},"type":{"type":"string","enum":["d1","r2_bucket","assets","service","durable_object_namespace","analytics_engine","analytics_sql","ratelimit","ai_search","send_email","ai","browser"]},"required":{"type":"boolean"},"aliases":{"type":"array","items":{"$ref":"#/$defs/BindingName"}}}}},"vars":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/BindingName"}},"secrets":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/SecretName"}},"cache":{"type":"boolean"},"cron":{"type":"string","pattern":"^[0-9*/,\\- ]+$"}}},"Capability":{"type":"string","enum":["account","workers","d1","r2","analytics","domains"]},"CloudhalVersion":{"type":"string","pattern":"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"},"MigrationName":{"type":"string","pattern":"^[0-9]{4}_[a-z0-9_]+$"},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"ScopeId":{"type":"string","pattern":"^[a-z0-9-]+(\\.[a-z0-9-]+)+$"},"SecretName":{"type":"string","enum":["BETTER_AUTH_SECRET","MCP_STATE_KEY","CLOUDHAL_PREVIEW_SECRET","CLOUDHAL_PURGE_TOKEN","CLOUDHAL_DEPLOY_TOKEN","CLOUDHAL_SETUP_TOKEN","CLOUDHAL_COMMENTS_KEY"]},"Sha256Hex":{"type":"string","pattern":"^[0-9a-f]{64}$"},"SiteId":{"type":"string","pattern":"^site_[A-Za-z0-9]{6,32}$"},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"},"WorkerArtifact":{"type":"object","additionalProperties":false,"required":["mainModule","modules","assets"],"properties":{"mainModule":{"type":"string","pattern":"^[A-Za-z0-9._/-]+$"},"modules":{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,"required":["path","type","bytes","sha256"],"properties":{"path":{"type":"string","pattern":"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$"},"type":{"type":"string","enum":["esm","cjs","wasm","text","data"]},"bytes":{"type":"integer","minimum":1},"sha256":{"$ref":"#/$defs/Sha256Hex"}}}},"assets":{"type":"object","additionalProperties":false,"required":["count","bytes","files","headers"],"properties":{"count":{"type":"integer","minimum":0,"maximum":20000},"bytes":{"type":"integer","minimum":0},"files":{"type":"array","maxItems":20000,"items":{"type":"object","additionalProperties":false,"required":["path","bytes","sha256","assetHash","contentType"],"properties":{"path":{"type":"string","pattern":"^/[^\\s]*$","maxLength":1024},"bytes":{"type":"integer","minimum":0,"maximum":26214400},"sha256":{"$ref":"#/$defs/Sha256Hex"},"assetHash":{"type":"string","pattern":"^[0-9a-f]{32}$"},"contentType":{"type":"string","maxLength":128}}}},"headers":{"type":"string","maxLength":100000},"config":{"type":"object","additionalProperties":false,"properties":{"not_found_handling":{"type":"string","enum":["none","404-page","single-page-application"]},"run_worker_first":{"type":"array","items":{"type":"string","pattern":"^/"}}}}}},"bindingTemplate":{"type":"string","enum":["site","admin"]}}}}};
const schema32 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema33 = {"type":"string","pattern":"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"};
const schema34 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema35 = {"type":"string","pattern":"^[0-9]{4}_[a-z0-9_]+$"};
const schema38 = {"type":"string","pattern":"^[A-Z][A-Z0-9_]*(_\\*)?$"};
const schema39 = {"type":"string","pattern":"^[0-9a-f]{64}$"};
const schema50 = {"type":"string","pattern":"^[a-z0-9-]+(\\.[a-z0-9-]+)+$"};
const schema52 = {"type":"string","enum":["account","workers","d1","r2","analytics","domains"]};
const schema55 = {"type":"string","pattern":"^site_[A-Za-z0-9]{6,32}$"};
const func1 = Object.prototype.hasOwnProperty;
const func0 = (__req0.default ?? __req0);
const func3 = (__req1.default ?? __req1);
const pattern4 = new RegExp("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$", "u");
const pattern5 = new RegExp("^[0-9a-f]{40}$", "u");
const pattern6 = new RegExp("^[0-9]{4}_[a-z0-9_]+$", "u");
const pattern9 = new RegExp("^[A-Z][A-Z0-9_]*(_\\*)?$", "u");
const pattern10 = new RegExp("^[A-Z][A-Za-z0-9]*$", "u");
const pattern11 = new RegExp("^v[1-9][0-9]*$", "u");
const pattern12 = new RegExp("^[0-9]{4}-[0-9]{2}-[0-9]{2}$", "u");
const pattern13 = new RegExp("^[a-z0-9_]+$", "u");
const pattern14 = new RegExp("^[a-z][a-z0-9-]{0,63}$", "u");
const pattern15 = new RegExp("^[0-9a-f]{64}$", "u");
const pattern30 = new RegExp("^[a-z0-9-]+(\\.[a-z0-9-]+)+$", "u");
const pattern32 = new RegExp("^starter/[A-Za-z0-9._-]+$", "u");
const pattern34 = new RegExp("^site_[A-Za-z0-9]{6,32}$", "u");
const pattern35 = new RegExp("^[a-z0-9][a-z0-9-]{2,63}$", "u");
const formats0 = __req2.fullFormats["date-time"];
const schema42 = {"type":"object","additionalProperties":false,"required":["mainModule","modules","assets"],"properties":{"mainModule":{"type":"string","pattern":"^[A-Za-z0-9._/-]+$"},"modules":{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,"required":["path","type","bytes","sha256"],"properties":{"path":{"type":"string","pattern":"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$"},"type":{"type":"string","enum":["esm","cjs","wasm","text","data"]},"bytes":{"type":"integer","minimum":1},"sha256":{"$ref":"#/$defs/Sha256Hex"}}}},"assets":{"type":"object","additionalProperties":false,"required":["count","bytes","files","headers"],"properties":{"count":{"type":"integer","minimum":0,"maximum":20000},"bytes":{"type":"integer","minimum":0},"files":{"type":"array","maxItems":20000,"items":{"type":"object","additionalProperties":false,"required":["path","bytes","sha256","assetHash","contentType"],"properties":{"path":{"type":"string","pattern":"^/[^\\s]*$","maxLength":1024},"bytes":{"type":"integer","minimum":0,"maximum":26214400},"sha256":{"$ref":"#/$defs/Sha256Hex"},"assetHash":{"type":"string","pattern":"^[0-9a-f]{32}$"},"contentType":{"type":"string","maxLength":128}}}},"headers":{"type":"string","maxLength":100000},"config":{"type":"object","additionalProperties":false,"properties":{"not_found_handling":{"type":"string","enum":["none","404-page","single-page-application"]},"run_worker_first":{"type":"array","items":{"type":"string","pattern":"^/"}}}}}},"bindingTemplate":{"type":"string","enum":["site","admin"]}}};
const pattern19 = new RegExp("^[A-Za-z0-9._/-]+$", "u");
const pattern20 = new RegExp("^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$", "u");
const pattern22 = new RegExp("^/[^\\s]*$", "u");
const pattern24 = new RegExp("^[0-9a-f]{32}$", "u");
const pattern25 = new RegExp("^/", "u");

function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.mainModule === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mainModule"},message:"must have required property '"+"mainModule"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.modules === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "modules"},message:"must have required property '"+"modules"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.assets === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "assets"},message:"must have required property '"+"assets"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "mainModule") || (key0 === "modules")) || (key0 === "assets")) || (key0 === "bindingTemplate"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.mainModule !== undefined){
let data0 = data.mainModule;
if(typeof data0 === "string"){
if(!pattern19.test(data0)){
const err4 = {instancePath:instancePath+"/mainModule",schemaPath:"#/properties/mainModule/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9._/-]+$"},message:"must match pattern \""+"^[A-Za-z0-9._/-]+$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/mainModule",schemaPath:"#/properties/mainModule/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.modules !== undefined){
let data1 = data.modules;
if(Array.isArray(data1)){
if(data1.length < 1){
const err6 = {instancePath:instancePath+"/modules",schemaPath:"#/properties/modules/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
let data2 = data1[i0];
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.path === undefined){
const err7 = {instancePath:instancePath+"/modules/" + i0,schemaPath:"#/properties/modules/items/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data2.type === undefined){
const err8 = {instancePath:instancePath+"/modules/" + i0,schemaPath:"#/properties/modules/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data2.bytes === undefined){
const err9 = {instancePath:instancePath+"/modules/" + i0,schemaPath:"#/properties/modules/items/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data2.sha256 === undefined){
const err10 = {instancePath:instancePath+"/modules/" + i0,schemaPath:"#/properties/modules/items/required",keyword:"required",params:{missingProperty: "sha256"},message:"must have required property '"+"sha256"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key1 in data2){
if(!((((key1 === "path") || (key1 === "type")) || (key1 === "bytes")) || (key1 === "sha256"))){
const err11 = {instancePath:instancePath+"/modules/" + i0,schemaPath:"#/properties/modules/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data2.path !== undefined){
let data3 = data2.path;
if(typeof data3 === "string"){
if(!pattern20.test(data3)){
const err12 = {instancePath:instancePath+"/modules/" + i0+"/path",schemaPath:"#/properties/modules/items/properties/path/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$"},message:"must match pattern \""+"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/modules/" + i0+"/path",schemaPath:"#/properties/modules/items/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data2.type !== undefined){
let data4 = data2.type;
if(typeof data4 !== "string"){
const err14 = {instancePath:instancePath+"/modules/" + i0+"/type",schemaPath:"#/properties/modules/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(((((data4 === "esm") || (data4 === "cjs")) || (data4 === "wasm")) || (data4 === "text")) || (data4 === "data"))){
const err15 = {instancePath:instancePath+"/modules/" + i0+"/type",schemaPath:"#/properties/modules/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema42.properties.modules.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data2.bytes !== undefined){
let data5 = data2.bytes;
if(!(((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5))) && (isFinite(data5)))){
const err16 = {instancePath:instancePath+"/modules/" + i0+"/bytes",schemaPath:"#/properties/modules/items/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 < 1 || isNaN(data5)){
const err17 = {instancePath:instancePath+"/modules/" + i0+"/bytes",schemaPath:"#/properties/modules/items/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
if(data2.sha256 !== undefined){
let data6 = data2.sha256;
if(typeof data6 === "string"){
if(!pattern15.test(data6)){
const err18 = {instancePath:instancePath+"/modules/" + i0+"/sha256",schemaPath:"#/$defs/Sha256Hex/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/modules/" + i0+"/sha256",schemaPath:"#/$defs/Sha256Hex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath:instancePath+"/modules/" + i0,schemaPath:"#/properties/modules/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath:instancePath+"/modules",schemaPath:"#/properties/modules/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.assets !== undefined){
let data7 = data.assets;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(data7.count === undefined){
const err22 = {instancePath:instancePath+"/assets",schemaPath:"#/properties/assets/required",keyword:"required",params:{missingProperty: "count"},message:"must have required property '"+"count"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data7.bytes === undefined){
const err23 = {instancePath:instancePath+"/assets",schemaPath:"#/properties/assets/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data7.files === undefined){
const err24 = {instancePath:instancePath+"/assets",schemaPath:"#/properties/assets/required",keyword:"required",params:{missingProperty: "files"},message:"must have required property '"+"files"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data7.headers === undefined){
const err25 = {instancePath:instancePath+"/assets",schemaPath:"#/properties/assets/required",keyword:"required",params:{missingProperty: "headers"},message:"must have required property '"+"headers"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
for(const key2 in data7){
if(!(((((key2 === "count") || (key2 === "bytes")) || (key2 === "files")) || (key2 === "headers")) || (key2 === "config"))){
const err26 = {instancePath:instancePath+"/assets",schemaPath:"#/properties/assets/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data7.count !== undefined){
let data8 = data7.count;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err27 = {instancePath:instancePath+"/assets/count",schemaPath:"#/properties/assets/properties/count/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 > 20000 || isNaN(data8)){
const err28 = {instancePath:instancePath+"/assets/count",schemaPath:"#/properties/assets/properties/count/maximum",keyword:"maximum",params:{comparison: "<=", limit: 20000},message:"must be <= 20000"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data8 < 0 || isNaN(data8)){
const err29 = {instancePath:instancePath+"/assets/count",schemaPath:"#/properties/assets/properties/count/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
if(data7.bytes !== undefined){
let data9 = data7.bytes;
if(!(((typeof data9 == "number") && (!(data9 % 1) && !isNaN(data9))) && (isFinite(data9)))){
const err30 = {instancePath:instancePath+"/assets/bytes",schemaPath:"#/properties/assets/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if((typeof data9 == "number") && (isFinite(data9))){
if(data9 < 0 || isNaN(data9)){
const err31 = {instancePath:instancePath+"/assets/bytes",schemaPath:"#/properties/assets/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
if(data7.files !== undefined){
let data10 = data7.files;
if(Array.isArray(data10)){
if(data10.length > 20000){
const err32 = {instancePath:instancePath+"/assets/files",schemaPath:"#/properties/assets/properties/files/maxItems",keyword:"maxItems",params:{limit: 20000},message:"must NOT have more than 20000 items"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
const len1 = data10.length;
for(let i1=0; i1<len1; i1++){
let data11 = data10[i1];
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
if(data11.path === undefined){
const err33 = {instancePath:instancePath+"/assets/files/" + i1,schemaPath:"#/properties/assets/properties/files/items/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(data11.bytes === undefined){
const err34 = {instancePath:instancePath+"/assets/files/" + i1,schemaPath:"#/properties/assets/properties/files/items/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(data11.sha256 === undefined){
const err35 = {instancePath:instancePath+"/assets/files/" + i1,schemaPath:"#/properties/assets/properties/files/items/required",keyword:"required",params:{missingProperty: "sha256"},message:"must have required property '"+"sha256"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(data11.assetHash === undefined){
const err36 = {instancePath:instancePath+"/assets/files/" + i1,schemaPath:"#/properties/assets/properties/files/items/required",keyword:"required",params:{missingProperty: "assetHash"},message:"must have required property '"+"assetHash"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data11.contentType === undefined){
const err37 = {instancePath:instancePath+"/assets/files/" + i1,schemaPath:"#/properties/assets/properties/files/items/required",keyword:"required",params:{missingProperty: "contentType"},message:"must have required property '"+"contentType"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
for(const key3 in data11){
if(!(((((key3 === "path") || (key3 === "bytes")) || (key3 === "sha256")) || (key3 === "assetHash")) || (key3 === "contentType"))){
const err38 = {instancePath:instancePath+"/assets/files/" + i1,schemaPath:"#/properties/assets/properties/files/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data11.path !== undefined){
let data12 = data11.path;
if(typeof data12 === "string"){
if(func3(data12) > 1024){
const err39 = {instancePath:instancePath+"/assets/files/" + i1+"/path",schemaPath:"#/properties/assets/properties/files/items/properties/path/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(!pattern22.test(data12)){
const err40 = {instancePath:instancePath+"/assets/files/" + i1+"/path",schemaPath:"#/properties/assets/properties/files/items/properties/path/pattern",keyword:"pattern",params:{pattern: "^/[^\\s]*$"},message:"must match pattern \""+"^/[^\\s]*$"+"\""};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
else {
const err41 = {instancePath:instancePath+"/assets/files/" + i1+"/path",schemaPath:"#/properties/assets/properties/files/items/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data11.bytes !== undefined){
let data13 = data11.bytes;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err42 = {instancePath:instancePath+"/assets/files/" + i1+"/bytes",schemaPath:"#/properties/assets/properties/files/items/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 > 26214400 || isNaN(data13)){
const err43 = {instancePath:instancePath+"/assets/files/" + i1+"/bytes",schemaPath:"#/properties/assets/properties/files/items/properties/bytes/maximum",keyword:"maximum",params:{comparison: "<=", limit: 26214400},message:"must be <= 26214400"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data13 < 0 || isNaN(data13)){
const err44 = {instancePath:instancePath+"/assets/files/" + i1+"/bytes",schemaPath:"#/properties/assets/properties/files/items/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
}
if(data11.sha256 !== undefined){
let data14 = data11.sha256;
if(typeof data14 === "string"){
if(!pattern15.test(data14)){
const err45 = {instancePath:instancePath+"/assets/files/" + i1+"/sha256",schemaPath:"#/$defs/Sha256Hex/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
else {
const err46 = {instancePath:instancePath+"/assets/files/" + i1+"/sha256",schemaPath:"#/$defs/Sha256Hex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data11.assetHash !== undefined){
let data15 = data11.assetHash;
if(typeof data15 === "string"){
if(!pattern24.test(data15)){
const err47 = {instancePath:instancePath+"/assets/files/" + i1+"/assetHash",schemaPath:"#/properties/assets/properties/files/items/properties/assetHash/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{32}$"},message:"must match pattern \""+"^[0-9a-f]{32}$"+"\""};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
else {
const err48 = {instancePath:instancePath+"/assets/files/" + i1+"/assetHash",schemaPath:"#/properties/assets/properties/files/items/properties/assetHash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data11.contentType !== undefined){
let data16 = data11.contentType;
if(typeof data16 === "string"){
if(func3(data16) > 128){
const err49 = {instancePath:instancePath+"/assets/files/" + i1+"/contentType",schemaPath:"#/properties/assets/properties/files/items/properties/contentType/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
else {
const err50 = {instancePath:instancePath+"/assets/files/" + i1+"/contentType",schemaPath:"#/properties/assets/properties/files/items/properties/contentType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
}
else {
const err51 = {instancePath:instancePath+"/assets/files/" + i1,schemaPath:"#/properties/assets/properties/files/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
}
else {
const err52 = {instancePath:instancePath+"/assets/files",schemaPath:"#/properties/assets/properties/files/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data7.headers !== undefined){
let data17 = data7.headers;
if(typeof data17 === "string"){
if(func3(data17) > 100000){
const err53 = {instancePath:instancePath+"/assets/headers",schemaPath:"#/properties/assets/properties/headers/maxLength",keyword:"maxLength",params:{limit: 100000},message:"must NOT have more than 100000 characters"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
else {
const err54 = {instancePath:instancePath+"/assets/headers",schemaPath:"#/properties/assets/properties/headers/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data7.config !== undefined){
let data18 = data7.config;
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
for(const key4 in data18){
if(!((key4 === "not_found_handling") || (key4 === "run_worker_first"))){
const err55 = {instancePath:instancePath+"/assets/config",schemaPath:"#/properties/assets/properties/config/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data18.not_found_handling !== undefined){
let data19 = data18.not_found_handling;
if(typeof data19 !== "string"){
const err56 = {instancePath:instancePath+"/assets/config/not_found_handling",schemaPath:"#/properties/assets/properties/config/properties/not_found_handling/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(!(((data19 === "none") || (data19 === "404-page")) || (data19 === "single-page-application"))){
const err57 = {instancePath:instancePath+"/assets/config/not_found_handling",schemaPath:"#/properties/assets/properties/config/properties/not_found_handling/enum",keyword:"enum",params:{allowedValues: schema42.properties.assets.properties.config.properties.not_found_handling.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data18.run_worker_first !== undefined){
let data20 = data18.run_worker_first;
if(Array.isArray(data20)){
const len2 = data20.length;
for(let i2=0; i2<len2; i2++){
let data21 = data20[i2];
if(typeof data21 === "string"){
if(!pattern25.test(data21)){
const err58 = {instancePath:instancePath+"/assets/config/run_worker_first/" + i2,schemaPath:"#/properties/assets/properties/config/properties/run_worker_first/items/pattern",keyword:"pattern",params:{pattern: "^/"},message:"must match pattern \""+"^/"+"\""};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
else {
const err59 = {instancePath:instancePath+"/assets/config/run_worker_first/" + i2,schemaPath:"#/properties/assets/properties/config/properties/run_worker_first/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
}
else {
const err60 = {instancePath:instancePath+"/assets/config/run_worker_first",schemaPath:"#/properties/assets/properties/config/properties/run_worker_first/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
}
else {
const err61 = {instancePath:instancePath+"/assets/config",schemaPath:"#/properties/assets/properties/config/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
}
else {
const err62 = {instancePath:instancePath+"/assets",schemaPath:"#/properties/assets/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data.bindingTemplate !== undefined){
let data22 = data.bindingTemplate;
if(typeof data22 !== "string"){
const err63 = {instancePath:instancePath+"/bindingTemplate",schemaPath:"#/properties/bindingTemplate/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(!((data22 === "site") || (data22 === "admin"))){
const err64 = {instancePath:instancePath+"/bindingTemplate",schemaPath:"#/properties/bindingTemplate/enum",keyword:"enum",params:{allowedValues: schema42.properties.bindingTemplate.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
else {
const err65 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema45 = {"type":"object","additionalProperties":false,"required":["bindings","vars","secrets"],"properties":{"bindings":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","type","required"],"properties":{"name":{"$ref":"#/$defs/BindingName"},"type":{"type":"string","enum":["d1","r2_bucket","assets","service","durable_object_namespace","analytics_engine","analytics_sql","ratelimit","ai_search","send_email","ai","browser"]},"required":{"type":"boolean"},"aliases":{"type":"array","items":{"$ref":"#/$defs/BindingName"}}}}},"vars":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/BindingName"}},"secrets":{"type":"array","uniqueItems":true,"items":{"$ref":"#/$defs/SecretName"}},"cache":{"type":"boolean"},"cron":{"type":"string","pattern":"^[0-9*/,\\- ]+$"}}};
const schema49 = {"type":"string","enum":["BETTER_AUTH_SECRET","MCP_STATE_KEY","CLOUDHAL_PREVIEW_SECRET","CLOUDHAL_PURGE_TOKEN","CLOUDHAL_DEPLOY_TOKEN","CLOUDHAL_SETUP_TOKEN","CLOUDHAL_COMMENTS_KEY"]};
const pattern29 = new RegExp("^[0-9*/,\\- ]+$", "u");

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.bindings === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bindings"},message:"must have required property '"+"bindings"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.vars === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "vars"},message:"must have required property '"+"vars"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.secrets === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "secrets"},message:"must have required property '"+"secrets"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "bindings") || (key0 === "vars")) || (key0 === "secrets")) || (key0 === "cache")) || (key0 === "cron"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.bindings !== undefined){
let data0 = data.bindings;
if(Array.isArray(data0)){
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.name === undefined){
const err4 = {instancePath:instancePath+"/bindings/" + i0,schemaPath:"#/properties/bindings/items/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.type === undefined){
const err5 = {instancePath:instancePath+"/bindings/" + i0,schemaPath:"#/properties/bindings/items/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.required === undefined){
const err6 = {instancePath:instancePath+"/bindings/" + i0,schemaPath:"#/properties/bindings/items/required",keyword:"required",params:{missingProperty: "required"},message:"must have required property '"+"required"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!((((key1 === "name") || (key1 === "type")) || (key1 === "required")) || (key1 === "aliases"))){
const err7 = {instancePath:instancePath+"/bindings/" + i0,schemaPath:"#/properties/bindings/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.name !== undefined){
let data2 = data1.name;
if(typeof data2 === "string"){
if(!pattern9.test(data2)){
const err8 = {instancePath:instancePath+"/bindings/" + i0+"/name",schemaPath:"#/$defs/BindingName/pattern",keyword:"pattern",params:{pattern: "^[A-Z][A-Z0-9_]*(_\\*)?$"},message:"must match pattern \""+"^[A-Z][A-Z0-9_]*(_\\*)?$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/bindings/" + i0+"/name",schemaPath:"#/$defs/BindingName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.type !== undefined){
let data3 = data1.type;
if(typeof data3 !== "string"){
const err10 = {instancePath:instancePath+"/bindings/" + i0+"/type",schemaPath:"#/properties/bindings/items/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!((((((((((((data3 === "d1") || (data3 === "r2_bucket")) || (data3 === "assets")) || (data3 === "service")) || (data3 === "durable_object_namespace")) || (data3 === "analytics_engine")) || (data3 === "analytics_sql")) || (data3 === "ratelimit")) || (data3 === "ai_search")) || (data3 === "send_email")) || (data3 === "ai")) || (data3 === "browser"))){
const err11 = {instancePath:instancePath+"/bindings/" + i0+"/type",schemaPath:"#/properties/bindings/items/properties/type/enum",keyword:"enum",params:{allowedValues: schema45.properties.bindings.items.properties.type.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.required !== undefined){
if(typeof data1.required !== "boolean"){
const err12 = {instancePath:instancePath+"/bindings/" + i0+"/required",schemaPath:"#/properties/bindings/items/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data1.aliases !== undefined){
let data5 = data1.aliases;
if(Array.isArray(data5)){
const len1 = data5.length;
for(let i1=0; i1<len1; i1++){
let data6 = data5[i1];
if(typeof data6 === "string"){
if(!pattern9.test(data6)){
const err13 = {instancePath:instancePath+"/bindings/" + i0+"/aliases/" + i1,schemaPath:"#/$defs/BindingName/pattern",keyword:"pattern",params:{pattern: "^[A-Z][A-Z0-9_]*(_\\*)?$"},message:"must match pattern \""+"^[A-Z][A-Z0-9_]*(_\\*)?$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/bindings/" + i0+"/aliases/" + i1,schemaPath:"#/$defs/BindingName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath:instancePath+"/bindings/" + i0+"/aliases",schemaPath:"#/properties/bindings/items/properties/aliases/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/bindings/" + i0,schemaPath:"#/properties/bindings/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath:instancePath+"/bindings",schemaPath:"#/properties/bindings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.vars !== undefined){
let data7 = data.vars;
if(Array.isArray(data7)){
const len2 = data7.length;
for(let i2=0; i2<len2; i2++){
let data8 = data7[i2];
if(typeof data8 === "string"){
if(!pattern9.test(data8)){
const err18 = {instancePath:instancePath+"/vars/" + i2,schemaPath:"#/$defs/BindingName/pattern",keyword:"pattern",params:{pattern: "^[A-Z][A-Z0-9_]*(_\\*)?$"},message:"must match pattern \""+"^[A-Z][A-Z0-9_]*(_\\*)?$"+"\""};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/vars/" + i2,schemaPath:"#/$defs/BindingName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
let i3 = data7.length;
let j0;
if(i3 > 1){
outer0:
for(;i3--;){
for(j0 = i3; j0--;){
if(func0(data7[i3], data7[j0])){
const err20 = {instancePath:instancePath+"/vars",schemaPath:"#/properties/vars/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err21 = {instancePath:instancePath+"/vars",schemaPath:"#/properties/vars/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.secrets !== undefined){
let data9 = data.secrets;
if(Array.isArray(data9)){
const len3 = data9.length;
for(let i4=0; i4<len3; i4++){
let data10 = data9[i4];
if(typeof data10 !== "string"){
const err22 = {instancePath:instancePath+"/secrets/" + i4,schemaPath:"#/$defs/SecretName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!(((((((data10 === "BETTER_AUTH_SECRET") || (data10 === "MCP_STATE_KEY")) || (data10 === "CLOUDHAL_PREVIEW_SECRET")) || (data10 === "CLOUDHAL_PURGE_TOKEN")) || (data10 === "CLOUDHAL_DEPLOY_TOKEN")) || (data10 === "CLOUDHAL_SETUP_TOKEN")) || (data10 === "CLOUDHAL_COMMENTS_KEY"))){
const err23 = {instancePath:instancePath+"/secrets/" + i4,schemaPath:"#/$defs/SecretName/enum",keyword:"enum",params:{allowedValues: schema49.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
let i5 = data9.length;
let j1;
if(i5 > 1){
outer1:
for(;i5--;){
for(j1 = i5; j1--;){
if(func0(data9[i5], data9[j1])){
const err24 = {instancePath:instancePath+"/secrets",schemaPath:"#/properties/secrets/uniqueItems",keyword:"uniqueItems",params:{i: i5, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i5+" are identical)"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err25 = {instancePath:instancePath+"/secrets",schemaPath:"#/properties/secrets/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.cache !== undefined){
if(typeof data.cache !== "boolean"){
const err26 = {instancePath:instancePath+"/cache",schemaPath:"#/properties/cache/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.cron !== undefined){
let data12 = data.cron;
if(typeof data12 === "string"){
if(!pattern29.test(data12)){
const err27 = {instancePath:instancePath+"/cron",schemaPath:"#/properties/cron/pattern",keyword:"pattern",params:{pattern: "^[0-9*/,\\- ]+$"},message:"must match pattern \""+"^[0-9*/,\\- ]+$"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/cron",schemaPath:"#/properties/cron/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
else {
const err29 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/release-manifest.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.format === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.version === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.channel === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "channel"},message:"must have required property '"+"channel"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.securityRelease === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "securityRelease"},message:"must have required property '"+"securityRelease"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.commit === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commit"},message:"must have required property '"+"commit"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.createdAt === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.contracts === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contracts"},message:"must have required property '"+"contracts"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.levels === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "levels"},message:"must have required property '"+"levels"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.migrations === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "migrations"},message:"must have required property '"+"migrations"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.durableObjects === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "durableObjects"},message:"must have required property '"+"durableObjects"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.runtime === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "runtime"},message:"must have required property '"+"runtime"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.toolchain === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "toolchain"},message:"must have required property '"+"toolchain"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.theme === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "theme"},message:"must have required property '"+"theme"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.skills === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "skills"},message:"must have required property '"+"skills"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.workers === undefined){
const err15 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "workers"},message:"must have required property '"+"workers"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.bindingTemplates === undefined){
const err16 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bindingTemplates"},message:"must have required property '"+"bindingTemplates"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.requiredScopes === undefined){
const err17 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requiredScopes"},message:"must have required property '"+"requiredScopes"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data.optionalScopes === undefined){
const err18 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "optionalScopes"},message:"must have required property '"+"optionalScopes"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data.requiredCapabilities === undefined){
const err19 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requiredCapabilities"},message:"must have required property '"+"requiredCapabilities"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data.optionalCapabilities === undefined){
const err20 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "optionalCapabilities"},message:"must have required property '"+"optionalCapabilities"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data.starter === undefined){
const err21 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "starter"},message:"must have required property '"+"starter"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data.features === undefined){
const err22 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "features"},message:"must have required property '"+"features"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data.planVersion === undefined){
const err23 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "planVersion"},message:"must have required property '"+"planVersion"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.signing === undefined){
const err24 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "signing"},message:"must have required property '"+"signing"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema31.properties, key0))){
const err25 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err26 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!(data0 === 1)){
const err27 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema32.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.format !== undefined){
let data1 = data.format;
if(typeof data1 !== "string"){
const err28 = {instancePath:instancePath+"/format",schemaPath:"#/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(!(data1 === "cloudhal.release-manifest@1")){
const err29 = {instancePath:instancePath+"/format",schemaPath:"#/properties/format/enum",keyword:"enum",params:{allowedValues: schema31.properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.version !== undefined){
let data2 = data.version;
if(typeof data2 === "string"){
if(!pattern4.test(data2)){
const err30 = {instancePath:instancePath+"/version",schemaPath:"#/$defs/CloudhalVersion/pattern",keyword:"pattern",params:{pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"},message:"must match pattern \""+"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/version",schemaPath:"#/$defs/CloudhalVersion/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.channel !== undefined){
let data3 = data.channel;
if(typeof data3 !== "string"){
const err32 = {instancePath:instancePath+"/channel",schemaPath:"#/properties/channel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(!((data3 === "stable") || (data3 === "next"))){
const err33 = {instancePath:instancePath+"/channel",schemaPath:"#/properties/channel/enum",keyword:"enum",params:{allowedValues: schema31.properties.channel.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.securityRelease !== undefined){
if(typeof data.securityRelease !== "boolean"){
const err34 = {instancePath:instancePath+"/securityRelease",schemaPath:"#/properties/securityRelease/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.commit !== undefined){
let data5 = data.commit;
if(typeof data5 === "string"){
if(!pattern5.test(data5)){
const err35 = {instancePath:instancePath+"/commit",schemaPath:"#/properties/commit/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{40}$"},message:"must match pattern \""+"^[0-9a-f]{40}$"+"\""};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
else {
const err36 = {instancePath:instancePath+"/commit",schemaPath:"#/properties/commit/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data6 = data.createdAt;
if(typeof data6 === "string"){
if(!(formats0.validate(data6))){
const err37 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
else {
const err38 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.contracts !== undefined){
let data7 = data.contracts;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(data7.schemaVersion === undefined){
const err39 = {instancePath:instancePath+"/contracts",schemaPath:"#/properties/contracts/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
for(const key1 in data7){
if(!(key1 === "schemaVersion")){
const err40 = {instancePath:instancePath+"/contracts",schemaPath:"#/properties/contracts/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data7.schemaVersion !== undefined){
let data8 = data7.schemaVersion;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err41 = {instancePath:instancePath+"/contracts/schemaVersion",schemaPath:"#/properties/contracts/properties/schemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(!(data8 === 1)){
const err42 = {instancePath:instancePath+"/contracts/schemaVersion",schemaPath:"#/properties/contracts/properties/schemaVersion/enum",keyword:"enum",params:{allowedValues: schema31.properties.contracts.properties.schemaVersion.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
else {
const err43 = {instancePath:instancePath+"/contracts",schemaPath:"#/properties/contracts/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.levels !== undefined){
let data9 = data.levels;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.schedules === undefined){
const err44 = {instancePath:instancePath+"/levels",schemaPath:"#/properties/levels/required",keyword:"required",params:{missingProperty: "schedules"},message:"must have required property '"+"schedules"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data9.gates === undefined){
const err45 = {instancePath:instancePath+"/levels",schemaPath:"#/properties/levels/required",keyword:"required",params:{missingProperty: "gates"},message:"must have required property '"+"gates"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
for(const key2 in data9){
if(!((key2 === "schedules") || (key2 === "gates"))){
const err46 = {instancePath:instancePath+"/levels",schemaPath:"#/properties/levels/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data9.schedules !== undefined){
let data10 = data9.schedules;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err47 = {instancePath:instancePath+"/levels/schedules",schemaPath:"#/properties/levels/properties/schedules/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 < 0 || isNaN(data10)){
const err48 = {instancePath:instancePath+"/levels/schedules",schemaPath:"#/properties/levels/properties/schedules/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
}
if(data9.gates !== undefined){
let data11 = data9.gates;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err49 = {instancePath:instancePath+"/levels/gates",schemaPath:"#/properties/levels/properties/gates/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 < 0 || isNaN(data11)){
const err50 = {instancePath:instancePath+"/levels/gates",schemaPath:"#/properties/levels/properties/gates/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
}
}
else {
const err51 = {instancePath:instancePath+"/levels",schemaPath:"#/properties/levels/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.migrations !== undefined){
let data12 = data.migrations;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
if(data12.first === undefined){
const err52 = {instancePath:instancePath+"/migrations",schemaPath:"#/properties/migrations/required",keyword:"required",params:{missingProperty: "first"},message:"must have required property '"+"first"+"'"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(data12.last === undefined){
const err53 = {instancePath:instancePath+"/migrations",schemaPath:"#/properties/migrations/required",keyword:"required",params:{missingProperty: "last"},message:"must have required property '"+"last"+"'"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(data12.count === undefined){
const err54 = {instancePath:instancePath+"/migrations",schemaPath:"#/properties/migrations/required",keyword:"required",params:{missingProperty: "count"},message:"must have required property '"+"count"+"'"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(data12.names === undefined){
const err55 = {instancePath:instancePath+"/migrations",schemaPath:"#/properties/migrations/required",keyword:"required",params:{missingProperty: "names"},message:"must have required property '"+"names"+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(data12.compatibleWithPrevious === undefined){
const err56 = {instancePath:instancePath+"/migrations",schemaPath:"#/properties/migrations/required",keyword:"required",params:{missingProperty: "compatibleWithPrevious"},message:"must have required property '"+"compatibleWithPrevious"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
for(const key3 in data12){
if(!(((((key3 === "first") || (key3 === "last")) || (key3 === "count")) || (key3 === "names")) || (key3 === "compatibleWithPrevious"))){
const err57 = {instancePath:instancePath+"/migrations",schemaPath:"#/properties/migrations/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data12.first !== undefined){
let data13 = data12.first;
if(typeof data13 === "string"){
if(!pattern6.test(data13)){
const err58 = {instancePath:instancePath+"/migrations/first",schemaPath:"#/$defs/MigrationName/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}_[a-z0-9_]+$"},message:"must match pattern \""+"^[0-9]{4}_[a-z0-9_]+$"+"\""};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
else {
const err59 = {instancePath:instancePath+"/migrations/first",schemaPath:"#/$defs/MigrationName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data12.last !== undefined){
let data14 = data12.last;
if(typeof data14 === "string"){
if(!pattern6.test(data14)){
const err60 = {instancePath:instancePath+"/migrations/last",schemaPath:"#/$defs/MigrationName/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}_[a-z0-9_]+$"},message:"must match pattern \""+"^[0-9]{4}_[a-z0-9_]+$"+"\""};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
else {
const err61 = {instancePath:instancePath+"/migrations/last",schemaPath:"#/$defs/MigrationName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data12.count !== undefined){
let data15 = data12.count;
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err62 = {instancePath:instancePath+"/migrations/count",schemaPath:"#/properties/migrations/properties/count/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 < 1 || isNaN(data15)){
const err63 = {instancePath:instancePath+"/migrations/count",schemaPath:"#/properties/migrations/properties/count/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
}
if(data12.names !== undefined){
let data16 = data12.names;
if(Array.isArray(data16)){
if(data16.length < 1){
const err64 = {instancePath:instancePath+"/migrations/names",schemaPath:"#/properties/migrations/properties/names/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
const len0 = data16.length;
for(let i0=0; i0<len0; i0++){
let data17 = data16[i0];
if(typeof data17 === "string"){
if(!pattern6.test(data17)){
const err65 = {instancePath:instancePath+"/migrations/names/" + i0,schemaPath:"#/$defs/MigrationName/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}_[a-z0-9_]+$"},message:"must match pattern \""+"^[0-9]{4}_[a-z0-9_]+$"+"\""};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
else {
const err66 = {instancePath:instancePath+"/migrations/names/" + i0,schemaPath:"#/$defs/MigrationName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
let i1 = data16.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data16[i1], data16[j0])){
const err67 = {instancePath:instancePath+"/migrations/names",schemaPath:"#/properties/migrations/properties/names/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err68 = {instancePath:instancePath+"/migrations/names",schemaPath:"#/properties/migrations/properties/names/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data12.compatibleWithPrevious !== undefined){
if(typeof data12.compatibleWithPrevious !== "boolean"){
const err69 = {instancePath:instancePath+"/migrations/compatibleWithPrevious",schemaPath:"#/properties/migrations/properties/compatibleWithPrevious/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
}
else {
const err70 = {instancePath:instancePath+"/migrations",schemaPath:"#/properties/migrations/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data.durableObjects !== undefined){
let data19 = data.durableObjects;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.bindings === undefined){
const err71 = {instancePath:instancePath+"/durableObjects",schemaPath:"#/properties/durableObjects/required",keyword:"required",params:{missingProperty: "bindings"},message:"must have required property '"+"bindings"+"'"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(data19.lifecycleChange === undefined){
const err72 = {instancePath:instancePath+"/durableObjects",schemaPath:"#/properties/durableObjects/required",keyword:"required",params:{missingProperty: "lifecycleChange"},message:"must have required property '"+"lifecycleChange"+"'"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
for(const key4 in data19){
if(!((key4 === "bindings") || (key4 === "lifecycleChange"))){
const err73 = {instancePath:instancePath+"/durableObjects",schemaPath:"#/properties/durableObjects/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data19.bindings !== undefined){
let data20 = data19.bindings;
if(Array.isArray(data20)){
const len1 = data20.length;
for(let i2=0; i2<len1; i2++){
let data21 = data20[i2];
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
if(data21.name === undefined){
const err74 = {instancePath:instancePath+"/durableObjects/bindings/" + i2,schemaPath:"#/properties/durableObjects/properties/bindings/items/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if(data21.className === undefined){
const err75 = {instancePath:instancePath+"/durableObjects/bindings/" + i2,schemaPath:"#/properties/durableObjects/properties/bindings/items/required",keyword:"required",params:{missingProperty: "className"},message:"must have required property '"+"className"+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(data21.migration === undefined){
const err76 = {instancePath:instancePath+"/durableObjects/bindings/" + i2,schemaPath:"#/properties/durableObjects/properties/bindings/items/required",keyword:"required",params:{missingProperty: "migration"},message:"must have required property '"+"migration"+"'"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
for(const key5 in data21){
if(!(((key5 === "name") || (key5 === "className")) || (key5 === "migration"))){
const err77 = {instancePath:instancePath+"/durableObjects/bindings/" + i2,schemaPath:"#/properties/durableObjects/properties/bindings/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data21.name !== undefined){
let data22 = data21.name;
if(typeof data22 === "string"){
if(!pattern9.test(data22)){
const err78 = {instancePath:instancePath+"/durableObjects/bindings/" + i2+"/name",schemaPath:"#/$defs/BindingName/pattern",keyword:"pattern",params:{pattern: "^[A-Z][A-Z0-9_]*(_\\*)?$"},message:"must match pattern \""+"^[A-Z][A-Z0-9_]*(_\\*)?$"+"\""};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
else {
const err79 = {instancePath:instancePath+"/durableObjects/bindings/" + i2+"/name",schemaPath:"#/$defs/BindingName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data21.className !== undefined){
let data23 = data21.className;
if(typeof data23 === "string"){
if(!pattern10.test(data23)){
const err80 = {instancePath:instancePath+"/durableObjects/bindings/" + i2+"/className",schemaPath:"#/properties/durableObjects/properties/bindings/items/properties/className/pattern",keyword:"pattern",params:{pattern: "^[A-Z][A-Za-z0-9]*$"},message:"must match pattern \""+"^[A-Z][A-Za-z0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
else {
const err81 = {instancePath:instancePath+"/durableObjects/bindings/" + i2+"/className",schemaPath:"#/properties/durableObjects/properties/bindings/items/properties/className/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data21.migration !== undefined){
let data24 = data21.migration;
if(typeof data24 === "string"){
if(!pattern11.test(data24)){
const err82 = {instancePath:instancePath+"/durableObjects/bindings/" + i2+"/migration",schemaPath:"#/properties/durableObjects/properties/bindings/items/properties/migration/pattern",keyword:"pattern",params:{pattern: "^v[1-9][0-9]*$"},message:"must match pattern \""+"^v[1-9][0-9]*$"+"\""};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
else {
const err83 = {instancePath:instancePath+"/durableObjects/bindings/" + i2+"/migration",schemaPath:"#/properties/durableObjects/properties/bindings/items/properties/migration/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
}
else {
const err84 = {instancePath:instancePath+"/durableObjects/bindings/" + i2,schemaPath:"#/properties/durableObjects/properties/bindings/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
}
else {
const err85 = {instancePath:instancePath+"/durableObjects/bindings",schemaPath:"#/properties/durableObjects/properties/bindings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data19.lifecycleChange !== undefined){
if(typeof data19.lifecycleChange !== "boolean"){
const err86 = {instancePath:instancePath+"/durableObjects/lifecycleChange",schemaPath:"#/properties/durableObjects/properties/lifecycleChange/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
}
else {
const err87 = {instancePath:instancePath+"/durableObjects",schemaPath:"#/properties/durableObjects/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data.runtime !== undefined){
let data26 = data.runtime;
if(data26 && typeof data26 == "object" && !Array.isArray(data26)){
if(data26.compatibilityDate === undefined){
const err88 = {instancePath:instancePath+"/runtime",schemaPath:"#/properties/runtime/required",keyword:"required",params:{missingProperty: "compatibilityDate"},message:"must have required property '"+"compatibilityDate"+"'"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if(data26.compatibilityFlags === undefined){
const err89 = {instancePath:instancePath+"/runtime",schemaPath:"#/properties/runtime/required",keyword:"required",params:{missingProperty: "compatibilityFlags"},message:"must have required property '"+"compatibilityFlags"+"'"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
for(const key6 in data26){
if(!((key6 === "compatibilityDate") || (key6 === "compatibilityFlags"))){
const err90 = {instancePath:instancePath+"/runtime",schemaPath:"#/properties/runtime/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
if(data26.compatibilityDate !== undefined){
let data27 = data26.compatibilityDate;
if(typeof data27 === "string"){
if(!pattern12.test(data27)){
const err91 = {instancePath:instancePath+"/runtime/compatibilityDate",schemaPath:"#/properties/runtime/properties/compatibilityDate/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},message:"must match pattern \""+"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"+"\""};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
else {
const err92 = {instancePath:instancePath+"/runtime/compatibilityDate",schemaPath:"#/properties/runtime/properties/compatibilityDate/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data26.compatibilityFlags !== undefined){
let data28 = data26.compatibilityFlags;
if(Array.isArray(data28)){
const len2 = data28.length;
for(let i3=0; i3<len2; i3++){
let data29 = data28[i3];
if(typeof data29 === "string"){
if(!pattern13.test(data29)){
const err93 = {instancePath:instancePath+"/runtime/compatibilityFlags/" + i3,schemaPath:"#/properties/runtime/properties/compatibilityFlags/items/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9_]+$"},message:"must match pattern \""+"^[a-z0-9_]+$"+"\""};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
else {
const err94 = {instancePath:instancePath+"/runtime/compatibilityFlags/" + i3,schemaPath:"#/properties/runtime/properties/compatibilityFlags/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
}
let i4 = data28.length;
let j1;
if(i4 > 1){
const indices0 = {};
for(;i4--;){
let item0 = data28[i4];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j1 = indices0[item0];
const err95 = {instancePath:instancePath+"/runtime/compatibilityFlags",schemaPath:"#/properties/runtime/properties/compatibilityFlags/uniqueItems",keyword:"uniqueItems",params:{i: i4, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i4+" are identical)"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
break;
}
indices0[item0] = i4;
}
}
}
else {
const err96 = {instancePath:instancePath+"/runtime/compatibilityFlags",schemaPath:"#/properties/runtime/properties/compatibilityFlags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
}
else {
const err97 = {instancePath:instancePath+"/runtime",schemaPath:"#/properties/runtime/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data.toolchain !== undefined){
let data30 = data.toolchain;
if(data30 && typeof data30 == "object" && !Array.isArray(data30)){
for(const key7 in data30){
let data31 = data30[key7];
if(typeof data31 === "string"){
if(func3(data31) > 64){
const err98 = {instancePath:instancePath+"/toolchain/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/toolchain/additionalProperties/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
else {
const err99 = {instancePath:instancePath+"/toolchain/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/toolchain/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
}
else {
const err100 = {instancePath:instancePath+"/toolchain",schemaPath:"#/properties/toolchain/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
if(data.theme !== undefined){
let data32 = data.theme;
if(data32 && typeof data32 == "object" && !Array.isArray(data32)){
if(data32.name === undefined){
const err101 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if(data32.version === undefined){
const err102 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
if(data32.blockTypes === undefined){
const err103 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/required",keyword:"required",params:{missingProperty: "blockTypes"},message:"must have required property '"+"blockTypes"+"'"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
if(data32.settingsSha256 === undefined){
const err104 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/required",keyword:"required",params:{missingProperty: "settingsSha256"},message:"must have required property '"+"settingsSha256"+"'"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
if(data32.designSha256 === undefined){
const err105 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/required",keyword:"required",params:{missingProperty: "designSha256"},message:"must have required property '"+"designSha256"+"'"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
for(const key8 in data32){
if(!(((((key8 === "name") || (key8 === "version")) || (key8 === "blockTypes")) || (key8 === "settingsSha256")) || (key8 === "designSha256"))){
const err106 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
}
if(data32.name !== undefined){
let data33 = data32.name;
if(typeof data33 === "string"){
if(!pattern14.test(data33)){
const err107 = {instancePath:instancePath+"/theme/name",schemaPath:"#/properties/theme/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9-]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
else {
const err108 = {instancePath:instancePath+"/theme/name",schemaPath:"#/properties/theme/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data32.version !== undefined){
let data34 = data32.version;
if(typeof data34 === "string"){
if(func3(data34) > 64){
const err109 = {instancePath:instancePath+"/theme/version",schemaPath:"#/properties/theme/properties/version/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
}
else {
const err110 = {instancePath:instancePath+"/theme/version",schemaPath:"#/properties/theme/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
if(data32.blockTypes !== undefined){
let data35 = data32.blockTypes;
if(Array.isArray(data35)){
const len3 = data35.length;
for(let i5=0; i5<len3; i5++){
if(typeof data35[i5] !== "string"){
const err111 = {instancePath:instancePath+"/theme/blockTypes/" + i5,schemaPath:"#/properties/theme/properties/blockTypes/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
let i6 = data35.length;
let j2;
if(i6 > 1){
const indices1 = {};
for(;i6--;){
let item1 = data35[i6];
if(typeof item1 !== "string"){
continue;
}
if(typeof indices1[item1] == "number"){
j2 = indices1[item1];
const err112 = {instancePath:instancePath+"/theme/blockTypes",schemaPath:"#/properties/theme/properties/blockTypes/uniqueItems",keyword:"uniqueItems",params:{i: i6, j: j2},message:"must NOT have duplicate items (items ## "+j2+" and "+i6+" are identical)"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
break;
}
indices1[item1] = i6;
}
}
}
else {
const err113 = {instancePath:instancePath+"/theme/blockTypes",schemaPath:"#/properties/theme/properties/blockTypes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
}
if(data32.settingsSha256 !== undefined){
let data37 = data32.settingsSha256;
if(typeof data37 === "string"){
if(!pattern15.test(data37)){
const err114 = {instancePath:instancePath+"/theme/settingsSha256",schemaPath:"#/$defs/Sha256Hex/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
else {
const err115 = {instancePath:instancePath+"/theme/settingsSha256",schemaPath:"#/$defs/Sha256Hex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
}
if(data32.designSha256 !== undefined){
let data38 = data32.designSha256;
if(typeof data38 === "string"){
if(!pattern15.test(data38)){
const err116 = {instancePath:instancePath+"/theme/designSha256",schemaPath:"#/$defs/Sha256Hex/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
else {
const err117 = {instancePath:instancePath+"/theme/designSha256",schemaPath:"#/$defs/Sha256Hex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
}
else {
const err118 = {instancePath:instancePath+"/theme",schemaPath:"#/properties/theme/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
if(data.skills !== undefined){
let data39 = data.skills;
if(Array.isArray(data39)){
const len4 = data39.length;
for(let i7=0; i7<len4; i7++){
let data40 = data39[i7];
if(data40 && typeof data40 == "object" && !Array.isArray(data40)){
if(data40.name === undefined){
const err119 = {instancePath:instancePath+"/skills/" + i7,schemaPath:"#/properties/skills/items/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
if(data40.sha256 === undefined){
const err120 = {instancePath:instancePath+"/skills/" + i7,schemaPath:"#/properties/skills/items/required",keyword:"required",params:{missingProperty: "sha256"},message:"must have required property '"+"sha256"+"'"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
for(const key9 in data40){
if(!((key9 === "name") || (key9 === "sha256"))){
const err121 = {instancePath:instancePath+"/skills/" + i7,schemaPath:"#/properties/skills/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
}
if(data40.name !== undefined){
let data41 = data40.name;
if(typeof data41 === "string"){
if(!pattern14.test(data41)){
const err122 = {instancePath:instancePath+"/skills/" + i7+"/name",schemaPath:"#/properties/skills/items/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9-]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
else {
const err123 = {instancePath:instancePath+"/skills/" + i7+"/name",schemaPath:"#/properties/skills/items/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
if(data40.sha256 !== undefined){
let data42 = data40.sha256;
if(typeof data42 === "string"){
if(!pattern15.test(data42)){
const err124 = {instancePath:instancePath+"/skills/" + i7+"/sha256",schemaPath:"#/$defs/Sha256Hex/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
}
else {
const err125 = {instancePath:instancePath+"/skills/" + i7+"/sha256",schemaPath:"#/$defs/Sha256Hex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
}
}
else {
const err126 = {instancePath:instancePath+"/skills/" + i7,schemaPath:"#/properties/skills/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
}
else {
const err127 = {instancePath:instancePath+"/skills",schemaPath:"#/properties/skills/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
if(data.workers !== undefined){
let data43 = data.workers;
if(data43 && typeof data43 == "object" && !Array.isArray(data43)){
if(data43.site === undefined){
const err128 = {instancePath:instancePath+"/workers",schemaPath:"#/properties/workers/required",keyword:"required",params:{missingProperty: "site"},message:"must have required property '"+"site"+"'"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
if(data43.admin === undefined){
const err129 = {instancePath:instancePath+"/workers",schemaPath:"#/properties/workers/required",keyword:"required",params:{missingProperty: "admin"},message:"must have required property '"+"admin"+"'"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
for(const key10 in data43){
if(!((key10 === "site") || (key10 === "admin"))){
const err130 = {instancePath:instancePath+"/workers",schemaPath:"#/properties/workers/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
if(data43.site !== undefined){
if(!(validate21(data43.site, {instancePath:instancePath+"/workers/site",parentData:data43,parentDataProperty:"site",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
if(data43.admin !== undefined){
if(!(validate21(data43.admin, {instancePath:instancePath+"/workers/admin",parentData:data43,parentDataProperty:"admin",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
}
else {
const err131 = {instancePath:instancePath+"/workers",schemaPath:"#/properties/workers/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
}
if(data.bindingTemplates !== undefined){
let data46 = data.bindingTemplates;
if(data46 && typeof data46 == "object" && !Array.isArray(data46)){
if(data46.site === undefined){
const err132 = {instancePath:instancePath+"/bindingTemplates",schemaPath:"#/properties/bindingTemplates/required",keyword:"required",params:{missingProperty: "site"},message:"must have required property '"+"site"+"'"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
if(data46.admin === undefined){
const err133 = {instancePath:instancePath+"/bindingTemplates",schemaPath:"#/properties/bindingTemplates/required",keyword:"required",params:{missingProperty: "admin"},message:"must have required property '"+"admin"+"'"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
for(const key11 in data46){
if(!((key11 === "site") || (key11 === "admin"))){
const err134 = {instancePath:instancePath+"/bindingTemplates",schemaPath:"#/properties/bindingTemplates/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
if(data46.site !== undefined){
if(!(validate24(data46.site, {instancePath:instancePath+"/bindingTemplates/site",parentData:data46,parentDataProperty:"site",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
if(data46.admin !== undefined){
if(!(validate24(data46.admin, {instancePath:instancePath+"/bindingTemplates/admin",parentData:data46,parentDataProperty:"admin",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
}
}
else {
const err135 = {instancePath:instancePath+"/bindingTemplates",schemaPath:"#/properties/bindingTemplates/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
}
if(data.requiredScopes !== undefined){
let data49 = data.requiredScopes;
if(Array.isArray(data49)){
const len5 = data49.length;
for(let i8=0; i8<len5; i8++){
let data50 = data49[i8];
if(typeof data50 === "string"){
if(!pattern30.test(data50)){
const err136 = {instancePath:instancePath+"/requiredScopes/" + i8,schemaPath:"#/$defs/ScopeId/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9-]+(\\.[a-z0-9-]+)+$"},message:"must match pattern \""+"^[a-z0-9-]+(\\.[a-z0-9-]+)+$"+"\""};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
else {
const err137 = {instancePath:instancePath+"/requiredScopes/" + i8,schemaPath:"#/$defs/ScopeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
let i9 = data49.length;
let j3;
if(i9 > 1){
outer1:
for(;i9--;){
for(j3 = i9; j3--;){
if(func0(data49[i9], data49[j3])){
const err138 = {instancePath:instancePath+"/requiredScopes",schemaPath:"#/properties/requiredScopes/uniqueItems",keyword:"uniqueItems",params:{i: i9, j: j3},message:"must NOT have duplicate items (items ## "+j3+" and "+i9+" are identical)"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err139 = {instancePath:instancePath+"/requiredScopes",schemaPath:"#/properties/requiredScopes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
if(data.optionalScopes !== undefined){
let data51 = data.optionalScopes;
if(Array.isArray(data51)){
const len6 = data51.length;
for(let i10=0; i10<len6; i10++){
let data52 = data51[i10];
if(typeof data52 === "string"){
if(!pattern30.test(data52)){
const err140 = {instancePath:instancePath+"/optionalScopes/" + i10,schemaPath:"#/$defs/ScopeId/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9-]+(\\.[a-z0-9-]+)+$"},message:"must match pattern \""+"^[a-z0-9-]+(\\.[a-z0-9-]+)+$"+"\""};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
}
else {
const err141 = {instancePath:instancePath+"/optionalScopes/" + i10,schemaPath:"#/$defs/ScopeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
}
let i11 = data51.length;
let j4;
if(i11 > 1){
outer2:
for(;i11--;){
for(j4 = i11; j4--;){
if(func0(data51[i11], data51[j4])){
const err142 = {instancePath:instancePath+"/optionalScopes",schemaPath:"#/properties/optionalScopes/uniqueItems",keyword:"uniqueItems",params:{i: i11, j: j4},message:"must NOT have duplicate items (items ## "+j4+" and "+i11+" are identical)"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
break outer2;
}
}
}
}
}
else {
const err143 = {instancePath:instancePath+"/optionalScopes",schemaPath:"#/properties/optionalScopes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
}
if(data.requiredCapabilities !== undefined){
let data53 = data.requiredCapabilities;
if(Array.isArray(data53)){
const len7 = data53.length;
for(let i12=0; i12<len7; i12++){
let data54 = data53[i12];
if(typeof data54 !== "string"){
const err144 = {instancePath:instancePath+"/requiredCapabilities/" + i12,schemaPath:"#/$defs/Capability/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
if(!((((((data54 === "account") || (data54 === "workers")) || (data54 === "d1")) || (data54 === "r2")) || (data54 === "analytics")) || (data54 === "domains"))){
const err145 = {instancePath:instancePath+"/requiredCapabilities/" + i12,schemaPath:"#/$defs/Capability/enum",keyword:"enum",params:{allowedValues: schema52.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
}
let i13 = data53.length;
let j5;
if(i13 > 1){
outer3:
for(;i13--;){
for(j5 = i13; j5--;){
if(func0(data53[i13], data53[j5])){
const err146 = {instancePath:instancePath+"/requiredCapabilities",schemaPath:"#/properties/requiredCapabilities/uniqueItems",keyword:"uniqueItems",params:{i: i13, j: j5},message:"must NOT have duplicate items (items ## "+j5+" and "+i13+" are identical)"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
break outer3;
}
}
}
}
}
else {
const err147 = {instancePath:instancePath+"/requiredCapabilities",schemaPath:"#/properties/requiredCapabilities/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
}
if(data.optionalCapabilities !== undefined){
let data55 = data.optionalCapabilities;
if(Array.isArray(data55)){
const len8 = data55.length;
for(let i14=0; i14<len8; i14++){
let data56 = data55[i14];
if(typeof data56 !== "string"){
const err148 = {instancePath:instancePath+"/optionalCapabilities/" + i14,schemaPath:"#/$defs/Capability/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
if(!((((((data56 === "account") || (data56 === "workers")) || (data56 === "d1")) || (data56 === "r2")) || (data56 === "analytics")) || (data56 === "domains"))){
const err149 = {instancePath:instancePath+"/optionalCapabilities/" + i14,schemaPath:"#/$defs/Capability/enum",keyword:"enum",params:{allowedValues: schema52.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
}
let i15 = data55.length;
let j6;
if(i15 > 1){
outer4:
for(;i15--;){
for(j6 = i15; j6--;){
if(func0(data55[i15], data55[j6])){
const err150 = {instancePath:instancePath+"/optionalCapabilities",schemaPath:"#/properties/optionalCapabilities/uniqueItems",keyword:"uniqueItems",params:{i: i15, j: j6},message:"must NOT have duplicate items (items ## "+j6+" and "+i15+" are identical)"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
break outer4;
}
}
}
}
}
else {
const err151 = {instancePath:instancePath+"/optionalCapabilities",schemaPath:"#/properties/optionalCapabilities/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
}
if(data.starter !== undefined){
let data57 = data.starter;
const _errs138 = errors;
let valid51 = false;
let passing0 = null;
const _errs139 = errors;
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
if(data57.kind === undefined){
const err152 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
for(const key12 in data57){
if(!(key12 === "kind")){
const err153 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
}
if(data57.kind !== undefined){
let data58 = data57.kind;
if(typeof data58 !== "string"){
const err154 = {instancePath:instancePath+"/starter/kind",schemaPath:"#/properties/starter/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
if(!(data58 === "admin-api")){
const err155 = {instancePath:instancePath+"/starter/kind",schemaPath:"#/properties/starter/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema31.properties.starter.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
}
}
else {
const err156 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
var _valid0 = _errs139 === errors;
if(_valid0){
valid51 = true;
passing0 = 0;
var props0 = true;
}
const _errs144 = errors;
if(data57 && typeof data57 == "object" && !Array.isArray(data57)){
if(data57.kind === undefined){
const err157 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
if(data57.path === undefined){
const err158 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/1/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
if(data57.bytes === undefined){
const err159 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/1/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
if(data57.sha256 === undefined){
const err160 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/1/required",keyword:"required",params:{missingProperty: "sha256"},message:"must have required property '"+"sha256"+"'"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
if(data57.siteId === undefined){
const err161 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/1/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
for(const key13 in data57){
if(!(((((key13 === "kind") || (key13 === "path")) || (key13 === "bytes")) || (key13 === "sha256")) || (key13 === "siteId"))){
const err162 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
}
if(data57.kind !== undefined){
let data59 = data57.kind;
if(typeof data59 !== "string"){
const err163 = {instancePath:instancePath+"/starter/kind",schemaPath:"#/properties/starter/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
if(!(data59 === "bundle")){
const err164 = {instancePath:instancePath+"/starter/kind",schemaPath:"#/properties/starter/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema31.properties.starter.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
if(data57.path !== undefined){
let data60 = data57.path;
if(typeof data60 === "string"){
if(!pattern32.test(data60)){
const err165 = {instancePath:instancePath+"/starter/path",schemaPath:"#/properties/starter/oneOf/1/properties/path/pattern",keyword:"pattern",params:{pattern: "^starter/[A-Za-z0-9._-]+$"},message:"must match pattern \""+"^starter/[A-Za-z0-9._-]+$"+"\""};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
}
else {
const err166 = {instancePath:instancePath+"/starter/path",schemaPath:"#/properties/starter/oneOf/1/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
}
if(data57.bytes !== undefined){
let data61 = data57.bytes;
if(!(((typeof data61 == "number") && (!(data61 % 1) && !isNaN(data61))) && (isFinite(data61)))){
const err167 = {instancePath:instancePath+"/starter/bytes",schemaPath:"#/properties/starter/oneOf/1/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
if((typeof data61 == "number") && (isFinite(data61))){
if(data61 < 1 || isNaN(data61)){
const err168 = {instancePath:instancePath+"/starter/bytes",schemaPath:"#/properties/starter/oneOf/1/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
}
}
if(data57.sha256 !== undefined){
let data62 = data57.sha256;
if(typeof data62 === "string"){
if(!pattern15.test(data62)){
const err169 = {instancePath:instancePath+"/starter/sha256",schemaPath:"#/$defs/Sha256Hex/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
}
else {
const err170 = {instancePath:instancePath+"/starter/sha256",schemaPath:"#/$defs/Sha256Hex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
if(data57.siteId !== undefined){
let data63 = data57.siteId;
if(typeof data63 === "string"){
if(!pattern34.test(data63)){
const err171 = {instancePath:instancePath+"/starter/siteId",schemaPath:"#/$defs/SiteId/pattern",keyword:"pattern",params:{pattern: "^site_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^site_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
}
else {
const err172 = {instancePath:instancePath+"/starter/siteId",schemaPath:"#/$defs/SiteId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
}
}
}
else {
const err173 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
var _valid0 = _errs144 === errors;
if(_valid0 && valid51){
valid51 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid51 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid51){
const err174 = {instancePath:instancePath+"/starter",schemaPath:"#/properties/starter/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
else {
errors = _errs138;
if(vErrors !== null){
if(_errs138){
vErrors.length = _errs138;
}
else {
vErrors = null;
}
}
}
}
if(data.features !== undefined){
let data64 = data.features;
if(data64 && typeof data64 == "object" && !Array.isArray(data64)){
if(data64.adminSitesAcceptsSiteId === undefined){
const err175 = {instancePath:instancePath+"/features",schemaPath:"#/properties/features/required",keyword:"required",params:{missingProperty: "adminSitesAcceptsSiteId"},message:"must have required property '"+"adminSitesAcceptsSiteId"+"'"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
if(data64.healthReportsVersion === undefined){
const err176 = {instancePath:instancePath+"/features",schemaPath:"#/properties/features/required",keyword:"required",params:{missingProperty: "healthReportsVersion"},message:"must have required property '"+"healthReportsVersion"+"'"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
if(data64.mediaTransformVar === undefined){
const err177 = {instancePath:instancePath+"/features",schemaPath:"#/properties/features/required",keyword:"required",params:{missingProperty: "mediaTransformVar"},message:"must have required property '"+"mediaTransformVar"+"'"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
for(const key14 in data64){
if(!(((key14 === "adminSitesAcceptsSiteId") || (key14 === "healthReportsVersion")) || (key14 === "mediaTransformVar"))){
if(typeof data64[key14] !== "boolean"){
const err178 = {instancePath:instancePath+"/features/" + key14.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/features/additionalProperties/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
}
}
if(data64.adminSitesAcceptsSiteId !== undefined){
if(typeof data64.adminSitesAcceptsSiteId !== "boolean"){
const err179 = {instancePath:instancePath+"/features/adminSitesAcceptsSiteId",schemaPath:"#/properties/features/properties/adminSitesAcceptsSiteId/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
}
if(data64.healthReportsVersion !== undefined){
if(typeof data64.healthReportsVersion !== "boolean"){
const err180 = {instancePath:instancePath+"/features/healthReportsVersion",schemaPath:"#/properties/features/properties/healthReportsVersion/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
}
if(data64.mediaTransformVar !== undefined){
if(typeof data64.mediaTransformVar !== "boolean"){
const err181 = {instancePath:instancePath+"/features/mediaTransformVar",schemaPath:"#/properties/features/properties/mediaTransformVar/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
}
}
else {
const err182 = {instancePath:instancePath+"/features",schemaPath:"#/properties/features/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
}
if(data.planVersion !== undefined){
let data69 = data.planVersion;
if(!(((typeof data69 == "number") && (!(data69 % 1) && !isNaN(data69))) && (isFinite(data69)))){
const err183 = {instancePath:instancePath+"/planVersion",schemaPath:"#/properties/planVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
if((typeof data69 == "number") && (isFinite(data69))){
if(data69 < 1 || isNaN(data69)){
const err184 = {instancePath:instancePath+"/planVersion",schemaPath:"#/properties/planVersion/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
}
}
if(data.signing !== undefined){
let data70 = data.signing;
if(data70 && typeof data70 == "object" && !Array.isArray(data70)){
if(data70.keyId === undefined){
const err185 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/required",keyword:"required",params:{missingProperty: "keyId"},message:"must have required property '"+"keyId"+"'"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
}
if(data70.algorithm === undefined){
const err186 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/required",keyword:"required",params:{missingProperty: "algorithm"},message:"must have required property '"+"algorithm"+"'"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
if(data70.signature === undefined){
const err187 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/required",keyword:"required",params:{missingProperty: "signature"},message:"must have required property '"+"signature"+"'"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
for(const key15 in data70){
if(!(((key15 === "keyId") || (key15 === "algorithm")) || (key15 === "signature"))){
const err188 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
}
if(data70.keyId !== undefined){
let data71 = data70.keyId;
if(typeof data71 === "string"){
if(!pattern35.test(data71)){
const err189 = {instancePath:instancePath+"/signing/keyId",schemaPath:"#/properties/signing/properties/keyId/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9-]{2,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9-]{2,63}$"+"\""};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
}
else {
const err190 = {instancePath:instancePath+"/signing/keyId",schemaPath:"#/properties/signing/properties/keyId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
}
if(data70.algorithm !== undefined){
let data72 = data70.algorithm;
if(typeof data72 !== "string"){
const err191 = {instancePath:instancePath+"/signing/algorithm",schemaPath:"#/properties/signing/properties/algorithm/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
}
if(!(data72 === "Ed25519")){
const err192 = {instancePath:instancePath+"/signing/algorithm",schemaPath:"#/properties/signing/properties/algorithm/enum",keyword:"enum",params:{allowedValues: schema31.properties.signing.properties.algorithm.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
}
if(data70.signature !== undefined){
let data73 = data70.signature;
if(typeof data73 !== "string"){
const err193 = {instancePath:instancePath+"/signing/signature",schemaPath:"#/properties/signing/properties/signature/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
if(!((data73 === "manifest.sig") || (data73 === "release-statement.sig"))){
const err194 = {instancePath:instancePath+"/signing/signature",schemaPath:"#/properties/signing/properties/signature/enum",keyword:"enum",params:{allowedValues: schema31.properties.signing.properties.signature.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
}
}
else {
const err195 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
}
}
else {
const err196 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateReleaseStatement = validate27;
const schema56 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/release-statement.schema.json","title":"ReleaseStatement","description":"cloudhal.release-statement@1 (RFC-0046): the small canonical document a Cloudhal release signs, published as the release asset release-statement.json next to release-statement.sig (a raw 64-byte Ed25519 signature over the exact bytes, at most 4096 of them). It names the version, channel, commit and key id and pins the SHA-256 and size of manifest.json and of the tarball, so a remote deployer verifies one small file and then checks every other asset by digest. Canonical bytes: keys sorted recursively, 2-space indent, a trailing newline; a consumer verifies the bytes it downloaded and never re-serialises them. Portable on purpose: it references common only for SchemaVersion and Timestamp.","type":"object","additionalProperties":false,"required":["schemaVersion","format","version","channel","securityRelease","commit","createdAt","signing","manifest","tarball"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"format":{"type":"string","enum":["cloudhal.release-statement@1"]},"version":{"$ref":"#/$defs/CloudhalVersion"},"channel":{"type":"string","enum":["stable","next"]},"securityRelease":{"type":"boolean"},"commit":{"type":"string","pattern":"^[0-9a-f]{40}$"},"createdAt":{"$ref":"#/$defs/Timestamp"},"signing":{"type":"object","additionalProperties":false,"required":["keyId","algorithm","signature"],"properties":{"keyId":{"type":"string","pattern":"^[a-z0-9][a-z0-9-]{2,63}$"},"algorithm":{"type":"string","enum":["Ed25519"]},"signature":{"type":"string","enum":["release-statement.sig"]}}},"manifest":{"$ref":"#/$defs/StatementAsset"},"tarball":{"$ref":"#/$defs/StatementAsset"}},"$defs":{"CloudhalVersion":{"type":"string","pattern":"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Sha256Hex":{"type":"string","pattern":"^[0-9a-f]{64}$"},"StatementAsset":{"type":"object","additionalProperties":false,"required":["name","sha256","bytes"],"properties":{"name":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"},"sha256":{"$ref":"#/$defs/Sha256Hex"},"bytes":{"type":"integer","minimum":1,"maximum":104857600}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema57 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema58 = {"type":"string","pattern":"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"};
const schema59 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema60 = {"type":"object","additionalProperties":false,"required":["name","sha256","bytes"],"properties":{"name":{"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"},"sha256":{"$ref":"#/$defs/Sha256Hex"},"bytes":{"type":"integer","minimum":1,"maximum":104857600}}};
const schema61 = {"type":"string","pattern":"^[0-9a-f]{64}$"};
const pattern39 = new RegExp("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", "u");

function validate28(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate28.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.name === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.sha256 === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sha256"},message:"must have required property '"+"sha256"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.bytes === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "name") || (key0 === "sha256")) || (key0 === "bytes"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.name !== undefined){
let data0 = data.name;
if(typeof data0 === "string"){
if(!pattern39.test(data0)){
const err4 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.sha256 !== undefined){
let data1 = data.sha256;
if(typeof data1 === "string"){
if(!pattern15.test(data1)){
const err6 = {instancePath:instancePath+"/sha256",schemaPath:"#/$defs/Sha256Hex/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/sha256",schemaPath:"#/$defs/Sha256Hex/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.bytes !== undefined){
let data2 = data.bytes;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err8 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 104857600 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/maximum",keyword:"maximum",params:{comparison: "<=", limit: 104857600},message:"must be <= 104857600"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data2 < 1 || isNaN(data2)){
const err10 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
validate28.errors = vErrors;
return errors === 0;
}
validate28.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate27(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/release-statement.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate27.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.format === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.version === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.channel === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "channel"},message:"must have required property '"+"channel"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.securityRelease === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "securityRelease"},message:"must have required property '"+"securityRelease"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.commit === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commit"},message:"must have required property '"+"commit"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.createdAt === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.signing === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "signing"},message:"must have required property '"+"signing"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.manifest === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "manifest"},message:"must have required property '"+"manifest"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.tarball === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tarball"},message:"must have required property '"+"tarball"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema56.properties, key0))){
const err10 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err11 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!(data0 === 1)){
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema57.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.format !== undefined){
let data1 = data.format;
if(typeof data1 !== "string"){
const err13 = {instancePath:instancePath+"/format",schemaPath:"#/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!(data1 === "cloudhal.release-statement@1")){
const err14 = {instancePath:instancePath+"/format",schemaPath:"#/properties/format/enum",keyword:"enum",params:{allowedValues: schema56.properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.version !== undefined){
let data2 = data.version;
if(typeof data2 === "string"){
if(!pattern4.test(data2)){
const err15 = {instancePath:instancePath+"/version",schemaPath:"#/$defs/CloudhalVersion/pattern",keyword:"pattern",params:{pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"},message:"must match pattern \""+"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$"+"\""};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/version",schemaPath:"#/$defs/CloudhalVersion/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.channel !== undefined){
let data3 = data.channel;
if(typeof data3 !== "string"){
const err17 = {instancePath:instancePath+"/channel",schemaPath:"#/properties/channel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!((data3 === "stable") || (data3 === "next"))){
const err18 = {instancePath:instancePath+"/channel",schemaPath:"#/properties/channel/enum",keyword:"enum",params:{allowedValues: schema56.properties.channel.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.securityRelease !== undefined){
if(typeof data.securityRelease !== "boolean"){
const err19 = {instancePath:instancePath+"/securityRelease",schemaPath:"#/properties/securityRelease/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.commit !== undefined){
let data5 = data.commit;
if(typeof data5 === "string"){
if(!pattern5.test(data5)){
const err20 = {instancePath:instancePath+"/commit",schemaPath:"#/properties/commit/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{40}$"},message:"must match pattern \""+"^[0-9a-f]{40}$"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/commit",schemaPath:"#/properties/commit/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data6 = data.createdAt;
if(typeof data6 === "string"){
if(!(formats0.validate(data6))){
const err22 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.signing !== undefined){
let data7 = data.signing;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(data7.keyId === undefined){
const err24 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/required",keyword:"required",params:{missingProperty: "keyId"},message:"must have required property '"+"keyId"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data7.algorithm === undefined){
const err25 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/required",keyword:"required",params:{missingProperty: "algorithm"},message:"must have required property '"+"algorithm"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data7.signature === undefined){
const err26 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/required",keyword:"required",params:{missingProperty: "signature"},message:"must have required property '"+"signature"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key1 in data7){
if(!(((key1 === "keyId") || (key1 === "algorithm")) || (key1 === "signature"))){
const err27 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data7.keyId !== undefined){
let data8 = data7.keyId;
if(typeof data8 === "string"){
if(!pattern35.test(data8)){
const err28 = {instancePath:instancePath+"/signing/keyId",schemaPath:"#/properties/signing/properties/keyId/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9-]{2,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9-]{2,63}$"+"\""};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/signing/keyId",schemaPath:"#/properties/signing/properties/keyId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data7.algorithm !== undefined){
let data9 = data7.algorithm;
if(typeof data9 !== "string"){
const err30 = {instancePath:instancePath+"/signing/algorithm",schemaPath:"#/properties/signing/properties/algorithm/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!(data9 === "Ed25519")){
const err31 = {instancePath:instancePath+"/signing/algorithm",schemaPath:"#/properties/signing/properties/algorithm/enum",keyword:"enum",params:{allowedValues: schema56.properties.signing.properties.algorithm.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data7.signature !== undefined){
let data10 = data7.signature;
if(typeof data10 !== "string"){
const err32 = {instancePath:instancePath+"/signing/signature",schemaPath:"#/properties/signing/properties/signature/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(!(data10 === "release-statement.sig")){
const err33 = {instancePath:instancePath+"/signing/signature",schemaPath:"#/properties/signing/properties/signature/enum",keyword:"enum",params:{allowedValues: schema56.properties.signing.properties.signature.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
else {
const err34 = {instancePath:instancePath+"/signing",schemaPath:"#/properties/signing/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.manifest !== undefined){
if(!(validate28(data.manifest, {instancePath:instancePath+"/manifest",parentData:data,parentDataProperty:"manifest",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
}
if(data.tarball !== undefined){
if(!(validate28(data.tarball, {instancePath:instancePath+"/tarball",parentData:data,parentDataProperty:"tarball",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
}
}
else {
const err35 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
validate27.errors = vErrors;
return errors === 0;
}
validate27.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

