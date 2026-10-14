/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */
import __req0 from "ajv/dist/runtime/ucs2length.js";
import __req1 from "ajv/dist/runtime/equal.js";
import __req2 from "ajv-formats/dist/formats.js";
"use strict";
export const validateProject = validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/project.schema.json","title":"Project","description":"Top-level ownership boundary. A project belongs to one owner (human or organisation) and groups one or more sites. In Cloud it maps to a tenant.","type":"object","additionalProperties":false,"required":["schemaVersion","id","name","slug","ownerId","siteIds","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","minLength":1,"maxLength":200},"slug":{"$ref":"#/$defs/Slug"},"ownerId":{"$ref":"#/$defs/Id"},"siteIds":{"type":"array","items":{"$ref":"#/$defs/Id"},"uniqueItems":true},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema32 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema33 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema34 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema37 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema38 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema40 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const func1 = Object.prototype.hasOwnProperty;
const func2 = (__req0.default ?? __req0);
const func0 = (__req1.default ?? __req1);
const pattern4 = new RegExp("^[a-z]+_[A-Za-z0-9]{6,32}$", "u");
const pattern5 = new RegExp("^[a-z0-9]+(?:-[a-z0-9]+)*$", "u");
const formats0 = __req2.fullFormats["date-time"];

function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/project.schema.json" */;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.name === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.slug === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.ownerId === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ownerId"},message:"must have required property '"+"ownerId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.siteIds === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteIds"},message:"must have required property '"+"siteIds"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.rev === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.createdAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.updatedAt === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema31.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err10 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!(data0 === 1)){
const err11 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema32.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(func2(data1) < 8){
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!pattern4.test(data1)){
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err16 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func2(data2) < 1){
const err17 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.slug !== undefined){
let data3 = data.slug;
if(typeof data3 === "string"){
if(func2(data3) > 128){
const err19 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(func2(data3) < 1){
const err20 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(!pattern5.test(data3)){
const err21 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.ownerId !== undefined){
let data4 = data.ownerId;
if(typeof data4 === "string"){
if(func2(data4) > 48){
const err23 = {instancePath:instancePath+"/ownerId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(func2(data4) < 8){
const err24 = {instancePath:instancePath+"/ownerId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(!pattern4.test(data4)){
const err25 = {instancePath:instancePath+"/ownerId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/ownerId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.siteIds !== undefined){
let data5 = data.siteIds;
if(Array.isArray(data5)){
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(func2(data6) > 48){
const err27 = {instancePath:instancePath+"/siteIds/" + i0,schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(func2(data6) < 8){
const err28 = {instancePath:instancePath+"/siteIds/" + i0,schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(!pattern4.test(data6)){
const err29 = {instancePath:instancePath+"/siteIds/" + i0,schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/siteIds/" + i0,schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data5[i1], data5[j0])){
const err31 = {instancePath:instancePath+"/siteIds",schemaPath:"#/properties/siteIds/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err32 = {instancePath:instancePath+"/siteIds",schemaPath:"#/properties/siteIds/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.rev !== undefined){
let data7 = data.rev;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err33 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 < 0 || isNaN(data7)){
const err34 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
if(data.createdAt !== undefined){
let data8 = data.createdAt;
if(typeof data8 === "string"){
if(!(formats0.validate(data8))){
const err35 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err36 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data9 = data.updatedAt;
if(typeof data9 === "string"){
if(!(formats0.validate(data9))){
const err37 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err38 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.metadata !== undefined){
let data10 = data.metadata;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
for(const key1 in data10){
if(typeof data10[key1] !== "string"){
const err39 = {instancePath:instancePath+"/metadata/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
}
else {
const err40 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
else {
const err41 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSite = validate21;
const schema41 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/site.schema.json","title":"Site","description":"Root node of a Site Graph: one deployable website with its locales, domains, theme and page index. Pages and content entries are separate nodes referenced by id so they can be versioned and locked independently.","type":"object","additionalProperties":false,"required":["schemaVersion","id","projectId","name","slug","defaultLocale","locales","domains","pageIds","theme","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"projectId":{"$ref":"#/$defs/Id"},"name":{"type":"string","minLength":1,"maxLength":200},"slug":{"$ref":"#/$defs/Slug"},"defaultLocale":{"$ref":"#/$defs/Locale"},"locales":{"type":"array","items":{"$ref":"#/$defs/Locale"},"minItems":1,"uniqueItems":true},"domains":{"type":"array","description":"Hostnames serving this site. Exactly one should be primary; the *.cloudhal.app subdomain is always present in Cloud.","items":{"$ref":"#/$defs/Domain"}},"pageIds":{"type":"array","items":{"$ref":"#/$defs/Id"},"uniqueItems":true},"homePageId":{"$ref":"#/$defs/Id"},"theme":{"$ref":"#/$defs/ThemeRef"},"timeZone":{"$ref":"#/$defs/TimeZone","description":"The site's time zone (RFC-0008): Studio's calendar, schedules entered as wall-clock times and recurring automations use it. Absent means UTC."},"publishedSnapshotId":{"$ref":"#/$defs/Id","description":"Snapshot currently serving production. Rollback = pointing this at an older snapshot."},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Domain":{"type":"object","additionalProperties":false,"required":["hostname","primary"],"properties":{"hostname":{"type":"string","pattern":"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$","maxLength":253},"primary":{"type":"boolean"}}},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"ThemeRef":{"type":"object","description":"Theme (a.k.a. Experience) applied by the renderer. Config is theme-defined and validated by the theme's own schema, not here.","additionalProperties":false,"required":["name"],"properties":{"name":{"$ref":"#/$defs/Slug"},"version":{"type":"string","maxLength":64},"config":{"type":"object","additionalProperties":true}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"},"TimeZone":{"type":"string","description":"IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.","pattern":"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$","maxLength":64}}};
const schema42 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema43 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema45 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema46 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema48 = {"type":"object","additionalProperties":false,"required":["hostname","primary"],"properties":{"hostname":{"type":"string","pattern":"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$","maxLength":253},"primary":{"type":"boolean"}}};
const schema53 = {"type":"string","description":"IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.","pattern":"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$","maxLength":64};
const schema55 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema56 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema58 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern11 = new RegExp("^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$", "u");
const pattern13 = new RegExp("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", "u");
const pattern17 = new RegExp("^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$", "u");
const schema51 = {"type":"object","description":"Theme (a.k.a. Experience) applied by the renderer. Config is theme-defined and validated by the theme's own schema, not here.","additionalProperties":false,"required":["name"],"properties":{"name":{"$ref":"#/$defs/Slug"},"version":{"type":"string","maxLength":64},"config":{"type":"object","additionalProperties":true}}};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
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
for(const key0 in data){
if(!(((key0 === "name") || (key0 === "version")) || (key0 === "config"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.name !== undefined){
let data0 = data.name;
if(typeof data0 === "string"){
if(func2(data0) > 128){
const err2 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(func2(data0) < 1){
const err3 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!pattern5.test(data0)){
const err4 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err5 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.version !== undefined){
let data1 = data.version;
if(typeof data1 === "string"){
if(func2(data1) > 64){
const err6 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
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
const err7 = {instancePath:instancePath+"/version",schemaPath:"#/properties/version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.config !== undefined){
let data2 = data.config;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
}
else {
const err8 = {instancePath:instancePath+"/config",schemaPath:"#/properties/config/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/site.schema.json" */;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.projectId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "projectId"},message:"must have required property '"+"projectId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.name === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.slug === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.defaultLocale === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "defaultLocale"},message:"must have required property '"+"defaultLocale"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.locales === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locales"},message:"must have required property '"+"locales"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.domains === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "domains"},message:"must have required property '"+"domains"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.pageIds === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "pageIds"},message:"must have required property '"+"pageIds"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.theme === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "theme"},message:"must have required property '"+"theme"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.rev === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.createdAt === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.updatedAt === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema41.properties, key0))){
const err13 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err14 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(data0 === 1)){
const err15 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema42.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err16 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func2(data1) < 8){
const err17 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!pattern4.test(data1)){
const err18 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err19 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.projectId !== undefined){
let data2 = data.projectId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err20 = {instancePath:instancePath+"/projectId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(func2(data2) < 8){
const err21 = {instancePath:instancePath+"/projectId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(!pattern4.test(data2)){
const err22 = {instancePath:instancePath+"/projectId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err23 = {instancePath:instancePath+"/projectId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.name !== undefined){
let data3 = data.name;
if(typeof data3 === "string"){
if(func2(data3) > 200){
const err24 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(func2(data3) < 1){
const err25 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.slug !== undefined){
let data4 = data.slug;
if(typeof data4 === "string"){
if(func2(data4) > 128){
const err27 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(func2(data4) < 1){
const err28 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(!pattern5.test(data4)){
const err29 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.defaultLocale !== undefined){
let data5 = data.defaultLocale;
if(typeof data5 === "string"){
if(!pattern11.test(data5)){
const err31 = {instancePath:instancePath+"/defaultLocale",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\""};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/defaultLocale",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.locales !== undefined){
let data6 = data.locales;
if(Array.isArray(data6)){
if(data6.length < 1){
const err33 = {instancePath:instancePath+"/locales",schemaPath:"#/properties/locales/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
let data7 = data6[i0];
if(typeof data7 === "string"){
if(!pattern11.test(data7)){
const err34 = {instancePath:instancePath+"/locales/" + i0,schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/locales/" + i0,schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
let i1 = data6.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data6[i1], data6[j0])){
const err36 = {instancePath:instancePath+"/locales",schemaPath:"#/properties/locales/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err37 = {instancePath:instancePath+"/locales",schemaPath:"#/properties/locales/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.domains !== undefined){
let data8 = data.domains;
if(Array.isArray(data8)){
const len1 = data8.length;
for(let i2=0; i2<len1; i2++){
let data9 = data8[i2];
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.hostname === undefined){
const err38 = {instancePath:instancePath+"/domains/" + i2,schemaPath:"#/$defs/Domain/required",keyword:"required",params:{missingProperty: "hostname"},message:"must have required property '"+"hostname"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data9.primary === undefined){
const err39 = {instancePath:instancePath+"/domains/" + i2,schemaPath:"#/$defs/Domain/required",keyword:"required",params:{missingProperty: "primary"},message:"must have required property '"+"primary"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
for(const key1 in data9){
if(!((key1 === "hostname") || (key1 === "primary"))){
const err40 = {instancePath:instancePath+"/domains/" + i2,schemaPath:"#/$defs/Domain/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data9.hostname !== undefined){
let data10 = data9.hostname;
if(typeof data10 === "string"){
if(func2(data10) > 253){
const err41 = {instancePath:instancePath+"/domains/" + i2+"/hostname",schemaPath:"#/$defs/Domain/properties/hostname/maxLength",keyword:"maxLength",params:{limit: 253},message:"must NOT have more than 253 characters"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(!pattern13.test(data10)){
const err42 = {instancePath:instancePath+"/domains/" + i2+"/hostname",schemaPath:"#/$defs/Domain/properties/hostname/pattern",keyword:"pattern",params:{pattern: "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},message:"must match pattern \""+"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"+"\""};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/domains/" + i2+"/hostname",schemaPath:"#/$defs/Domain/properties/hostname/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data9.primary !== undefined){
if(typeof data9.primary !== "boolean"){
const err44 = {instancePath:instancePath+"/domains/" + i2+"/primary",schemaPath:"#/$defs/Domain/properties/primary/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
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
else {
const err45 = {instancePath:instancePath+"/domains/" + i2,schemaPath:"#/$defs/Domain/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
else {
const err46 = {instancePath:instancePath+"/domains",schemaPath:"#/properties/domains/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.pageIds !== undefined){
let data12 = data.pageIds;
if(Array.isArray(data12)){
const len2 = data12.length;
for(let i3=0; i3<len2; i3++){
let data13 = data12[i3];
if(typeof data13 === "string"){
if(func2(data13) > 48){
const err47 = {instancePath:instancePath+"/pageIds/" + i3,schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(func2(data13) < 8){
const err48 = {instancePath:instancePath+"/pageIds/" + i3,schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(!pattern4.test(data13)){
const err49 = {instancePath:instancePath+"/pageIds/" + i3,schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err50 = {instancePath:instancePath+"/pageIds/" + i3,schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
let i4 = data12.length;
let j1;
if(i4 > 1){
outer1:
for(;i4--;){
for(j1 = i4; j1--;){
if(func0(data12[i4], data12[j1])){
const err51 = {instancePath:instancePath+"/pageIds",schemaPath:"#/properties/pageIds/uniqueItems",keyword:"uniqueItems",params:{i: i4, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i4+" are identical)"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err52 = {instancePath:instancePath+"/pageIds",schemaPath:"#/properties/pageIds/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data.homePageId !== undefined){
let data14 = data.homePageId;
if(typeof data14 === "string"){
if(func2(data14) > 48){
const err53 = {instancePath:instancePath+"/homePageId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(func2(data14) < 8){
const err54 = {instancePath:instancePath+"/homePageId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!pattern4.test(data14)){
const err55 = {instancePath:instancePath+"/homePageId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/homePageId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data.theme !== undefined){
if(!(validate22(data.theme, {instancePath:instancePath+"/theme",parentData:data,parentDataProperty:"theme",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
}
if(data.timeZone !== undefined){
let data16 = data.timeZone;
if(typeof data16 === "string"){
if(func2(data16) > 64){
const err57 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(!pattern17.test(data16)){
const err58 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/pattern",keyword:"pattern",params:{pattern: "^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$"},message:"must match pattern \""+"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$"+"\""};
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
const err59 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data.publishedSnapshotId !== undefined){
let data17 = data.publishedSnapshotId;
if(typeof data17 === "string"){
if(func2(data17) > 48){
const err60 = {instancePath:instancePath+"/publishedSnapshotId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(func2(data17) < 8){
const err61 = {instancePath:instancePath+"/publishedSnapshotId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(!pattern4.test(data17)){
const err62 = {instancePath:instancePath+"/publishedSnapshotId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
else {
const err63 = {instancePath:instancePath+"/publishedSnapshotId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.rev !== undefined){
let data18 = data.rev;
if(!(((typeof data18 == "number") && (!(data18 % 1) && !isNaN(data18))) && (isFinite(data18)))){
const err64 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if((typeof data18 == "number") && (isFinite(data18))){
if(data18 < 0 || isNaN(data18)){
const err65 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
}
if(data.createdAt !== undefined){
let data19 = data.createdAt;
if(typeof data19 === "string"){
if(!(formats0.validate(data19))){
const err66 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
else {
const err67 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data20 = data.updatedAt;
if(typeof data20 === "string"){
if(!(formats0.validate(data20))){
const err68 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
else {
const err69 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data.metadata !== undefined){
let data21 = data.metadata;
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
for(const key2 in data21){
if(typeof data21[key2] !== "string"){
const err70 = {instancePath:instancePath+"/metadata/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
}
else {
const err71 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
}
else {
const err72 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validatePage = validate24;
const schema59 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/page.schema.json","title":"Page","description":"A routable page of a site: a path, editorial status and an ordered list of sections. Sections are embedded (not separate nodes) so a page is the unit of locking, snapshotting and diffing.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","path","title","locale","status","sections","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"path":{"type":"string","description":"Absolute URL path, starting with '/', no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024},"title":{"type":"string","minLength":1,"maxLength":300},"locale":{"$ref":"#/$defs/Locale"},"status":{"$ref":"#/$defs/PublishStatus"},"sections":{"type":"array","items":{"$ref":"#/$defs/Section"}},"seo":{"$ref":"#/$defs/Seo"},"availability":{"$ref":"#/$defs/Availability"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"Availability":{"type":"object","description":"Time gates of a page or content entry (RFC-0008): the published site shows the node only from `from` (inclusive: an embargo) until `until` (exclusive: an expiry), checked at render time, so the gates hold even when no scheduler runs. Before `from` and from `until` on, the node is absent from every public route, list, feed, sitemap and search output; previews still show it. At least one gate; writers check that `from` is before `until`.","additionalProperties":false,"minProperties":1,"properties":{"from":{"$ref":"#/$defs/Timestamp"},"until":{"$ref":"#/$defs/Timestamp"}}},"BodyBlock":{"type":"object","description":"One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.","additionalProperties":false,"required":["id","hash"],"properties":{"id":{"type":"string","pattern":"^blk_[0-9A-Za-z]{8,24}$","description":"Stable across writes that keep the block's content or its place among unchanged blocks."},"hash":{"type":"string","pattern":"^[0-9a-f]{64}$","description":"SHA-256 (hex) of the block's markdown without trailing whitespace."},"by":{"$ref":"#/$defs/Actor"},"via":{"type":"string","enum":["studio","mcp","api","import","ai-command","proposal"],"description":"The channel of that change."},"at":{"$ref":"#/$defs/Timestamp"}}},"BodyBlocks":{"type":"array","description":"A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.","maxItems":5000,"items":{"$ref":"#/$defs/BodyBlock"}},"BodyProfile":{"type":"integer","enum":[1],"description":"The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Link":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"PublishStatus":{"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Section":{"title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000},"profile":{"$ref":"#/$defs/BodyProfile"},"blocks":{"$ref":"#/$defs/BodyBlocks"}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}]},"Seo":{"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema60 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema61 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema63 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema64 = {"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]};
const schema85 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema77 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema88 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern21 = new RegExp("^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$", "u");
const schema65 = {"title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000},"profile":{"$ref":"#/$defs/BodyProfile"},"blocks":{"$ref":"#/$defs/BodyBlocks"}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}]};
const schema69 = {"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}};
const schema71 = {"type":"integer","enum":[1],"description":"The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."};
const schema80 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema67 = {"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate26.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.src === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.alt === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "assetId") || (key0 === "src")) || (key0 === "alt")) || (key0 === "width")) || (key0 === "height"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.assetId !== undefined){
let data0 = data.assetId;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err3 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func2(data0) < 8){
const err4 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!pattern4.test(data0)){
const err5 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.src !== undefined){
let data1 = data.src;
if(typeof data1 === "string"){
if(func2(data1) > 2048){
const err7 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func2(data1) < 1){
const err8 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err9 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.alt !== undefined){
let data2 = data.alt;
if(typeof data2 === "string"){
if(func2(data2) > 500){
const err10 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.width !== undefined){
let data3 = data.width;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err12 = {instancePath:instancePath+"/width",schemaPath:"#/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 < 1 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/width",schemaPath:"#/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.height !== undefined){
let data4 = data.height;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err14 = {instancePath:instancePath+"/height",schemaPath:"#/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 1 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/height",schemaPath:"#/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate26.errors = vErrors;
return errors === 0;
}
validate26.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema72 = {"type":"array","description":"A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.","maxItems":5000,"items":{"$ref":"#/$defs/BodyBlock"}};
const schema73 = {"type":"object","description":"One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.","additionalProperties":false,"required":["id","hash"],"properties":{"id":{"type":"string","pattern":"^blk_[0-9A-Za-z]{8,24}$","description":"Stable across writes that keep the block's content or its place among unchanged blocks."},"hash":{"type":"string","pattern":"^[0-9a-f]{64}$","description":"SHA-256 (hex) of the block's markdown without trailing whitespace."},"by":{"$ref":"#/$defs/Actor"},"via":{"type":"string","enum":["studio","mcp","api","import","ai-command","proposal"],"description":"The channel of that change."},"at":{"$ref":"#/$defs/Timestamp"}}};
const pattern26 = new RegExp("^blk_[0-9A-Za-z]{8,24}$", "u");
const pattern27 = new RegExp("^[0-9a-f]{64}$", "u");
const schema74 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema75 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate30.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "id")) || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "human") || (data0 === "agent")) || (data0 === "system"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema75.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err9 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate29(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate29.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.hash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hash"},message:"must have required property '"+"hash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "hash")) || (key0 === "by")) || (key0 === "via")) || (key0 === "at"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern26.test(data0)){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/pattern",keyword:"pattern",params:{pattern: "^blk_[0-9A-Za-z]{8,24}$"},message:"must match pattern \""+"^blk_[0-9A-Za-z]{8,24}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.hash !== undefined){
let data1 = data.hash;
if(typeof data1 === "string"){
if(!pattern27.test(data1)){
const err5 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.by !== undefined){
if(!(validate30(data.by, {instancePath:instancePath+"/by",parentData:data,parentDataProperty:"by",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
if(data.via !== undefined){
let data3 = data.via;
if(typeof data3 !== "string"){
const err7 = {instancePath:instancePath+"/via",schemaPath:"#/properties/via/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!((((((data3 === "studio") || (data3 === "mcp")) || (data3 === "api")) || (data3 === "import")) || (data3 === "ai-command")) || (data3 === "proposal"))){
const err8 = {instancePath:instancePath+"/via",schemaPath:"#/properties/via/enum",keyword:"enum",params:{allowedValues: schema73.properties.via.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.at !== undefined){
let data4 = data.at;
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err9 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate29.errors = vErrors;
return errors === 0;
}
validate29.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


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
if(Array.isArray(data)){
if(data.length > 5000){
const err0 = {instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 5000},message:"must NOT have more than 5000 items"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
if(!(validate29(data[i0], {instancePath:instancePath+"/" + i0,parentData:data,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
errors = vErrors.length;
}
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate28.errors = vErrors;
return errors === 0;
}
validate28.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};


function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate25.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.heading === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "heading"},message:"must have required property '"+"heading"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "kind")) || (key0 === "heading")) || (key0 === "subheading")) || (key0 === "image")) || (key0 === "cta"))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func2(data0) < 8){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern4.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(data1 === "hero")){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema65.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.heading !== undefined){
let data2 = data.heading;
if(typeof data2 === "string"){
if(func2(data2) > 300){
const err10 = {instancePath:instancePath+"/heading",schemaPath:"#/oneOf/0/properties/heading/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func2(data2) < 1){
const err11 = {instancePath:instancePath+"/heading",schemaPath:"#/oneOf/0/properties/heading/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/heading",schemaPath:"#/oneOf/0/properties/heading/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.subheading !== undefined){
let data3 = data.subheading;
if(typeof data3 === "string"){
if(func2(data3) > 1000){
const err13 = {instancePath:instancePath+"/subheading",schemaPath:"#/oneOf/0/properties/subheading/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
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
const err14 = {instancePath:instancePath+"/subheading",schemaPath:"#/oneOf/0/properties/subheading/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.image !== undefined){
if(!(validate26(data.image, {instancePath:instancePath+"/image",parentData:data,parentDataProperty:"image",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
if(data.cta !== undefined){
let data5 = data.cta;
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.label === undefined){
const err15 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data5.href === undefined){
const err16 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/required",keyword:"required",params:{missingProperty: "href"},message:"must have required property '"+"href"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key1 in data5){
if(!(((key1 === "label") || (key1 === "href")) || (key1 === "external"))){
const err17 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data5.label !== undefined){
let data6 = data5.label;
if(typeof data6 === "string"){
if(func2(data6) > 200){
const err18 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data6) < 1){
const err19 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data5.href !== undefined){
let data7 = data5.href;
if(typeof data7 === "string"){
if(func2(data7) > 2048){
const err21 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(func2(data7) < 1){
const err22 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err23 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data5.external !== undefined){
if(typeof data5.external !== "boolean"){
const err24 = {instancePath:instancePath+"/cta/external",schemaPath:"#/$defs/Link/properties/external/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs24 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err27 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data.kind === undefined){
const err28 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data.format === undefined){
const err29 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(data.body === undefined){
const err30 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "body"},message:"must have required property '"+"body"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
for(const key2 in data){
if(!((((((key2 === "id") || (key2 === "kind")) || (key2 === "format")) || (key2 === "body")) || (key2 === "profile")) || (key2 === "blocks"))){
const err31 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.id !== undefined){
let data9 = data.id;
if(typeof data9 === "string"){
if(func2(data9) > 48){
const err32 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(func2(data9) < 8){
const err33 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(!pattern4.test(data9)){
const err34 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.kind !== undefined){
let data10 = data.kind;
if(typeof data10 !== "string"){
const err36 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(!(data10 === "richText")){
const err37 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema65.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.format !== undefined){
let data11 = data.format;
if(typeof data11 !== "string"){
const err38 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(!((data11 === "markdown") || (data11 === "html"))){
const err39 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/enum",keyword:"enum",params:{allowedValues: schema65.oneOf[1].properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.body !== undefined){
let data12 = data.body;
if(typeof data12 === "string"){
if(func2(data12) > 200000){
const err40 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/1/properties/body/maxLength",keyword:"maxLength",params:{limit: 200000},message:"must NOT have more than 200000 characters"};
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
const err41 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/1/properties/body/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.profile !== undefined){
let data13 = data.profile;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err42 = {instancePath:instancePath+"/profile",schemaPath:"#/$defs/BodyProfile/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(!(data13 === 1)){
const err43 = {instancePath:instancePath+"/profile",schemaPath:"#/$defs/BodyProfile/enum",keyword:"enum",params:{allowedValues: schema71.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.blocks !== undefined){
if(!(validate28(data.blocks, {instancePath:instancePath+"/blocks",parentData:data,parentDataProperty:"blocks",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
}
}
else {
const err44 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid0 = _errs24 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs40 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err45 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(data.kind === undefined){
const err46 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(data.image === undefined){
const err47 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "image"},message:"must have required property '"+"image"+"'"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
for(const key3 in data){
if(!((((key3 === "id") || (key3 === "kind")) || (key3 === "image")) || (key3 === "caption"))){
const err48 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data.id !== undefined){
let data15 = data.id;
if(typeof data15 === "string"){
if(func2(data15) > 48){
const err49 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(func2(data15) < 8){
const err50 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(!pattern4.test(data15)){
const err51 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
else {
const err52 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data.kind !== undefined){
let data16 = data.kind;
if(typeof data16 !== "string"){
const err53 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(!(data16 === "image")){
const err54 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema65.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data.image !== undefined){
if(!(validate26(data.image, {instancePath:instancePath+"/image",parentData:data,parentDataProperty:"image",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
if(data.caption !== undefined){
let data18 = data.caption;
if(typeof data18 === "string"){
if(func2(data18) > 1000){
const err55 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
}
else {
const err57 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var _valid0 = _errs40 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs51 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err58 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data.kind === undefined){
const err59 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(data.collection === undefined){
const err60 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "collection"},message:"must have required property '"+"collection"+"'"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(data.limit === undefined){
const err61 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "limit"},message:"must have required property '"+"limit"+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(data.sort === undefined){
const err62 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "sort"},message:"must have required property '"+"sort"+"'"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
for(const key4 in data){
if(!((((((key4 === "id") || (key4 === "kind")) || (key4 === "collection")) || (key4 === "limit")) || (key4 === "sort")) || (key4 === "filter"))){
const err63 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.id !== undefined){
let data19 = data.id;
if(typeof data19 === "string"){
if(func2(data19) > 48){
const err64 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(func2(data19) < 8){
const err65 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if(!pattern4.test(data19)){
const err66 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
else {
const err67 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data.kind !== undefined){
let data20 = data.kind;
if(typeof data20 !== "string"){
const err68 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if(!(data20 === "contentList")){
const err69 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema65.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data.collection !== undefined){
let data21 = data.collection;
if(typeof data21 === "string"){
if(func2(data21) > 128){
const err70 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(func2(data21) < 1){
const err71 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(!pattern5.test(data21)){
const err72 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
else {
const err73 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data.limit !== undefined){
let data22 = data.limit;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err74 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 > 100 || isNaN(data22)){
const err75 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(data22 < 1 || isNaN(data22)){
const err76 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
}
if(data.sort !== undefined){
let data23 = data.sort;
if(typeof data23 !== "string"){
const err77 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if(!(((data23 === "newest") || (data23 === "oldest")) || (data23 === "title"))){
const err78 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/enum",keyword:"enum",params:{allowedValues: schema65.oneOf[3].properties.sort.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.filter !== undefined){
let data24 = data.filter;
if(typeof data24 === "string"){
if(func2(data24) > 512){
const err79 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(func2(data24) < 1){
const err80 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err81 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
}
else {
const err82 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
var _valid0 = _errs51 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
}
}
}
if(!valid0){
const err83 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate25.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate25.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema81 = {"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}};

function validate36(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate36.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!(((((key0 === "title") || (key0 === "description")) || (key0 === "noindex")) || (key0 === "canonical")) || (key0 === "ogImage"))){
const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.title !== undefined){
let data0 = data.title;
if(typeof data0 === "string"){
if(func2(data0) > 300){
const err1 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
else {
const err2 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.description !== undefined){
let data1 = data.description;
if(typeof data1 === "string"){
if(func2(data1) > 500){
const err3 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.noindex !== undefined){
if(typeof data.noindex !== "boolean"){
const err5 = {instancePath:instancePath+"/noindex",schemaPath:"#/properties/noindex/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.canonical !== undefined){
let data3 = data.canonical;
if(typeof data3 === "string"){
if(func2(data3) > 2048){
const err6 = {instancePath:instancePath+"/canonical",schemaPath:"#/properties/canonical/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
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
const err7 = {instancePath:instancePath+"/canonical",schemaPath:"#/properties/canonical/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.ogImage !== undefined){
if(!(validate26(data.ogImage, {instancePath:instancePath+"/ogImage",parentData:data,parentDataProperty:"ogImage",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate36.errors = vErrors;
return errors === 0;
}
validate36.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema82 = {"type":"object","description":"Time gates of a page or content entry (RFC-0008): the published site shows the node only from `from` (inclusive: an embargo) until `until` (exclusive: an expiry), checked at render time, so the gates hold even when no scheduler runs. Before `from` and from `until` on, the node is absent from every public route, list, feed, sitemap and search output; previews still show it. At least one gate; writers check that `from` is before `until`.","additionalProperties":false,"minProperties":1,"properties":{"from":{"$ref":"#/$defs/Timestamp"},"until":{"$ref":"#/$defs/Timestamp"}}};

function validate39(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate39.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(Object.keys(data).length < 1){
const err0 = {instancePath,schemaPath:"#/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "from") || (key0 === "until"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.from !== undefined){
let data0 = data.from;
if(typeof data0 === "string"){
if(!(formats0.validate(data0))){
const err2 = {instancePath:instancePath+"/from",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/from",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.until !== undefined){
let data1 = data.until;
if(typeof data1 === "string"){
if(!(formats0.validate(data1))){
const err4 = {instancePath:instancePath+"/until",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err5 = {instancePath:instancePath+"/until",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate39.errors = vErrors;
return errors === 0;
}
validate39.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/page.schema.json" */;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.path === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.title === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.locale === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locale"},message:"must have required property '"+"locale"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.status === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.sections === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sections"},message:"must have required property '"+"sections"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.rev === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.createdAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.updatedAt === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema59.properties, key0))){
const err11 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(data0 === 1)){
const err13 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema60.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(func2(data1) < 8){
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!pattern4.test(data1)){
const err16 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data2) < 8){
const err19 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern4.test(data2)){
const err20 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err21 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.path !== undefined){
let data3 = data.path;
if(typeof data3 === "string"){
if(func2(data3) > 1024){
const err22 = {instancePath:instancePath+"/path",schemaPath:"#/properties/path/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!pattern21.test(data3)){
const err23 = {instancePath:instancePath+"/path",schemaPath:"#/properties/path/pattern",keyword:"pattern",params:{pattern: "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"},message:"must match pattern \""+"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/path",schemaPath:"#/properties/path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.title !== undefined){
let data4 = data.title;
if(typeof data4 === "string"){
if(func2(data4) > 300){
const err25 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(func2(data4) < 1){
const err26 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.locale !== undefined){
let data5 = data.locale;
if(typeof data5 === "string"){
if(!pattern11.test(data5)){
const err28 = {instancePath:instancePath+"/locale",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\""};
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
const err29 = {instancePath:instancePath+"/locale",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err30 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/PublishStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!((((data6 === "draft") || (data6 === "review")) || (data6 === "published")) || (data6 === "archived"))){
const err31 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/PublishStatus/enum",keyword:"enum",params:{allowedValues: schema64.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.sections !== undefined){
let data7 = data.sections;
if(Array.isArray(data7)){
const len0 = data7.length;
for(let i0=0; i0<len0; i0++){
if(!(validate25(data7[i0], {instancePath:instancePath+"/sections/" + i0,parentData:data7,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err32 = {instancePath:instancePath+"/sections",schemaPath:"#/properties/sections/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.seo !== undefined){
if(!(validate36(data.seo, {instancePath:instancePath+"/seo",parentData:data,parentDataProperty:"seo",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
}
if(data.availability !== undefined){
if(!(validate39(data.availability, {instancePath:instancePath+"/availability",parentData:data,parentDataProperty:"availability",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
errors = vErrors.length;
}
}
if(data.rev !== undefined){
let data11 = data.rev;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err33 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 < 0 || isNaN(data11)){
const err34 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
if(data.createdAt !== undefined){
let data12 = data.createdAt;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err35 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err36 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data13 = data.updatedAt;
if(typeof data13 === "string"){
if(!(formats0.validate(data13))){
const err37 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err38 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.metadata !== undefined){
let data14 = data.metadata;
if(data14 && typeof data14 == "object" && !Array.isArray(data14)){
for(const key1 in data14){
if(typeof data14[key1] !== "string"){
const err39 = {instancePath:instancePath+"/metadata/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
}
else {
const err40 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
else {
const err41 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSection = validate41;
const schema89 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/section.schema.json","title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000},"profile":{"$ref":"#/$defs/BodyProfile"},"blocks":{"$ref":"#/$defs/BodyBlocks"}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}],"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"BodyBlock":{"type":"object","description":"One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.","additionalProperties":false,"required":["id","hash"],"properties":{"id":{"type":"string","pattern":"^blk_[0-9A-Za-z]{8,24}$","description":"Stable across writes that keep the block's content or its place among unchanged blocks."},"hash":{"type":"string","pattern":"^[0-9a-f]{64}$","description":"SHA-256 (hex) of the block's markdown without trailing whitespace."},"by":{"$ref":"#/$defs/Actor"},"via":{"type":"string","enum":["studio","mcp","api","import","ai-command","proposal"],"description":"The channel of that change."},"at":{"$ref":"#/$defs/Timestamp"}}},"BodyBlocks":{"type":"array","description":"A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.","maxItems":5000,"items":{"$ref":"#/$defs/BodyBlock"}},"BodyProfile":{"type":"integer","enum":[1],"description":"The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Link":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema90 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema93 = {"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}};
const schema95 = {"type":"integer","enum":[1],"description":"The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."};
const schema104 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema91 = {"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};

function validate42(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate42.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.src === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.alt === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "assetId") || (key0 === "src")) || (key0 === "alt")) || (key0 === "width")) || (key0 === "height"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.assetId !== undefined){
let data0 = data.assetId;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err3 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func2(data0) < 8){
const err4 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!pattern4.test(data0)){
const err5 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.src !== undefined){
let data1 = data.src;
if(typeof data1 === "string"){
if(func2(data1) > 2048){
const err7 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func2(data1) < 1){
const err8 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err9 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.alt !== undefined){
let data2 = data.alt;
if(typeof data2 === "string"){
if(func2(data2) > 500){
const err10 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.width !== undefined){
let data3 = data.width;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err12 = {instancePath:instancePath+"/width",schemaPath:"#/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 < 1 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/width",schemaPath:"#/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.height !== undefined){
let data4 = data.height;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err14 = {instancePath:instancePath+"/height",schemaPath:"#/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 1 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/height",schemaPath:"#/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate42.errors = vErrors;
return errors === 0;
}
validate42.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema96 = {"type":"array","description":"A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.","maxItems":5000,"items":{"$ref":"#/$defs/BodyBlock"}};
const schema97 = {"type":"object","description":"One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.","additionalProperties":false,"required":["id","hash"],"properties":{"id":{"type":"string","pattern":"^blk_[0-9A-Za-z]{8,24}$","description":"Stable across writes that keep the block's content or its place among unchanged blocks."},"hash":{"type":"string","pattern":"^[0-9a-f]{64}$","description":"SHA-256 (hex) of the block's markdown without trailing whitespace."},"by":{"$ref":"#/$defs/Actor"},"via":{"type":"string","enum":["studio","mcp","api","import","ai-command","proposal"],"description":"The channel of that change."},"at":{"$ref":"#/$defs/Timestamp"}}};
const schema101 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema98 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema99 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate46(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate46.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "id")) || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "human") || (data0 === "agent")) || (data0 === "system"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema99.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err9 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate46.errors = vErrors;
return errors === 0;
}
validate46.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate45(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate45.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.hash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hash"},message:"must have required property '"+"hash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "hash")) || (key0 === "by")) || (key0 === "via")) || (key0 === "at"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern26.test(data0)){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/pattern",keyword:"pattern",params:{pattern: "^blk_[0-9A-Za-z]{8,24}$"},message:"must match pattern \""+"^blk_[0-9A-Za-z]{8,24}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.hash !== undefined){
let data1 = data.hash;
if(typeof data1 === "string"){
if(!pattern27.test(data1)){
const err5 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.by !== undefined){
if(!(validate46(data.by, {instancePath:instancePath+"/by",parentData:data,parentDataProperty:"by",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate46.errors : vErrors.concat(validate46.errors);
errors = vErrors.length;
}
}
if(data.via !== undefined){
let data3 = data.via;
if(typeof data3 !== "string"){
const err7 = {instancePath:instancePath+"/via",schemaPath:"#/properties/via/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!((((((data3 === "studio") || (data3 === "mcp")) || (data3 === "api")) || (data3 === "import")) || (data3 === "ai-command")) || (data3 === "proposal"))){
const err8 = {instancePath:instancePath+"/via",schemaPath:"#/properties/via/enum",keyword:"enum",params:{allowedValues: schema97.properties.via.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.at !== undefined){
let data4 = data.at;
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err9 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate45.errors = vErrors;
return errors === 0;
}
validate45.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate44.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(Array.isArray(data)){
if(data.length > 5000){
const err0 = {instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 5000},message:"must NOT have more than 5000 items"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
if(!(validate45(data[i0], {instancePath:instancePath+"/" + i0,parentData:data,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
errors = vErrors.length;
}
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate44.errors = vErrors;
return errors === 0;
}
validate44.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};


function validate41(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/section.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate41.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.heading === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "heading"},message:"must have required property '"+"heading"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "kind")) || (key0 === "heading")) || (key0 === "subheading")) || (key0 === "image")) || (key0 === "cta"))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func2(data0) < 8){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern4.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(data1 === "hero")){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema89.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.heading !== undefined){
let data2 = data.heading;
if(typeof data2 === "string"){
if(func2(data2) > 300){
const err10 = {instancePath:instancePath+"/heading",schemaPath:"#/oneOf/0/properties/heading/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func2(data2) < 1){
const err11 = {instancePath:instancePath+"/heading",schemaPath:"#/oneOf/0/properties/heading/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/heading",schemaPath:"#/oneOf/0/properties/heading/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.subheading !== undefined){
let data3 = data.subheading;
if(typeof data3 === "string"){
if(func2(data3) > 1000){
const err13 = {instancePath:instancePath+"/subheading",schemaPath:"#/oneOf/0/properties/subheading/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
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
const err14 = {instancePath:instancePath+"/subheading",schemaPath:"#/oneOf/0/properties/subheading/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.image !== undefined){
if(!(validate42(data.image, {instancePath:instancePath+"/image",parentData:data,parentDataProperty:"image",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
errors = vErrors.length;
}
}
if(data.cta !== undefined){
let data5 = data.cta;
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.label === undefined){
const err15 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data5.href === undefined){
const err16 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/required",keyword:"required",params:{missingProperty: "href"},message:"must have required property '"+"href"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key1 in data5){
if(!(((key1 === "label") || (key1 === "href")) || (key1 === "external"))){
const err17 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data5.label !== undefined){
let data6 = data5.label;
if(typeof data6 === "string"){
if(func2(data6) > 200){
const err18 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data6) < 1){
const err19 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data5.href !== undefined){
let data7 = data5.href;
if(typeof data7 === "string"){
if(func2(data7) > 2048){
const err21 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(func2(data7) < 1){
const err22 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err23 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data5.external !== undefined){
if(typeof data5.external !== "boolean"){
const err24 = {instancePath:instancePath+"/cta/external",schemaPath:"#/$defs/Link/properties/external/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs24 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err27 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data.kind === undefined){
const err28 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data.format === undefined){
const err29 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(data.body === undefined){
const err30 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "body"},message:"must have required property '"+"body"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
for(const key2 in data){
if(!((((((key2 === "id") || (key2 === "kind")) || (key2 === "format")) || (key2 === "body")) || (key2 === "profile")) || (key2 === "blocks"))){
const err31 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.id !== undefined){
let data9 = data.id;
if(typeof data9 === "string"){
if(func2(data9) > 48){
const err32 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(func2(data9) < 8){
const err33 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(!pattern4.test(data9)){
const err34 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.kind !== undefined){
let data10 = data.kind;
if(typeof data10 !== "string"){
const err36 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(!(data10 === "richText")){
const err37 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema89.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.format !== undefined){
let data11 = data.format;
if(typeof data11 !== "string"){
const err38 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(!((data11 === "markdown") || (data11 === "html"))){
const err39 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/enum",keyword:"enum",params:{allowedValues: schema89.oneOf[1].properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.body !== undefined){
let data12 = data.body;
if(typeof data12 === "string"){
if(func2(data12) > 200000){
const err40 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/1/properties/body/maxLength",keyword:"maxLength",params:{limit: 200000},message:"must NOT have more than 200000 characters"};
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
const err41 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/1/properties/body/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.profile !== undefined){
let data13 = data.profile;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err42 = {instancePath:instancePath+"/profile",schemaPath:"#/$defs/BodyProfile/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(!(data13 === 1)){
const err43 = {instancePath:instancePath+"/profile",schemaPath:"#/$defs/BodyProfile/enum",keyword:"enum",params:{allowedValues: schema95.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.blocks !== undefined){
if(!(validate44(data.blocks, {instancePath:instancePath+"/blocks",parentData:data,parentDataProperty:"blocks",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
errors = vErrors.length;
}
}
}
else {
const err44 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid0 = _errs24 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs40 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err45 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(data.kind === undefined){
const err46 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(data.image === undefined){
const err47 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "image"},message:"must have required property '"+"image"+"'"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
for(const key3 in data){
if(!((((key3 === "id") || (key3 === "kind")) || (key3 === "image")) || (key3 === "caption"))){
const err48 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data.id !== undefined){
let data15 = data.id;
if(typeof data15 === "string"){
if(func2(data15) > 48){
const err49 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(func2(data15) < 8){
const err50 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(!pattern4.test(data15)){
const err51 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
else {
const err52 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data.kind !== undefined){
let data16 = data.kind;
if(typeof data16 !== "string"){
const err53 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(!(data16 === "image")){
const err54 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema89.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data.image !== undefined){
if(!(validate42(data.image, {instancePath:instancePath+"/image",parentData:data,parentDataProperty:"image",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
errors = vErrors.length;
}
}
if(data.caption !== undefined){
let data18 = data.caption;
if(typeof data18 === "string"){
if(func2(data18) > 1000){
const err55 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
}
else {
const err57 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
var _valid0 = _errs40 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs51 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err58 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data.kind === undefined){
const err59 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(data.collection === undefined){
const err60 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "collection"},message:"must have required property '"+"collection"+"'"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(data.limit === undefined){
const err61 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "limit"},message:"must have required property '"+"limit"+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(data.sort === undefined){
const err62 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "sort"},message:"must have required property '"+"sort"+"'"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
for(const key4 in data){
if(!((((((key4 === "id") || (key4 === "kind")) || (key4 === "collection")) || (key4 === "limit")) || (key4 === "sort")) || (key4 === "filter"))){
const err63 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.id !== undefined){
let data19 = data.id;
if(typeof data19 === "string"){
if(func2(data19) > 48){
const err64 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(func2(data19) < 8){
const err65 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if(!pattern4.test(data19)){
const err66 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
else {
const err67 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data.kind !== undefined){
let data20 = data.kind;
if(typeof data20 !== "string"){
const err68 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if(!(data20 === "contentList")){
const err69 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema89.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data.collection !== undefined){
let data21 = data.collection;
if(typeof data21 === "string"){
if(func2(data21) > 128){
const err70 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(func2(data21) < 1){
const err71 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(!pattern5.test(data21)){
const err72 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
else {
const err73 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data.limit !== undefined){
let data22 = data.limit;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err74 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 > 100 || isNaN(data22)){
const err75 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(data22 < 1 || isNaN(data22)){
const err76 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
}
if(data.sort !== undefined){
let data23 = data.sort;
if(typeof data23 !== "string"){
const err77 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if(!(((data23 === "newest") || (data23 === "oldest")) || (data23 === "title"))){
const err78 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/enum",keyword:"enum",params:{allowedValues: schema89.oneOf[3].properties.sort.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.filter !== undefined){
let data24 = data.filter;
if(typeof data24 === "string"){
if(func2(data24) > 512){
const err79 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(func2(data24) < 1){
const err80 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err81 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
}
else {
const err82 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
var _valid0 = _errs51 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
}
}
}
if(!valid0){
const err83 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate41.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate41.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateContentEntry = validate51;
const schema105 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/content-entry.schema.json","title":"ContentEntry","description":"A structured content item in a named collection (e.g. collection 'posts'). Core fields are typed; collection-specific fields live in `fields` and are validated by the collection's own schema in a later phase.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","collection","slug","locale","status","title","body","fields","tags","author","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"collection":{"$ref":"#/$defs/Slug"},"slug":{"$ref":"#/$defs/Slug"},"locale":{"$ref":"#/$defs/Locale"},"status":{"$ref":"#/$defs/PublishStatus"},"title":{"type":"string","minLength":1,"maxLength":300},"summary":{"type":"string","maxLength":2000},"body":{"$ref":"#/$defs/Body"},"fields":{"type":"object","description":"Collection-specific values; any JSON.","additionalProperties":true},"tags":{"type":"array","description":"Deprecated by RFC-0002: use `terms.tag`. Still accepted on input for one release and translated into terms; the store then writes []. Removed in schemaVersion 2.","deprecated":true,"items":{"$ref":"#/$defs/Slug"},"uniqueItems":true,"maxItems":50},"terms":{"type":"object","description":"Term assignments by taxonomy key (e.g. 'category', 'tag'). Terms are referenced by id, independent of locale. A taxonomy without terms is omitted, never an empty object.","propertyNames":{"$ref":"#/$defs/Slug"},"minProperties":1,"maxProperties":10,"additionalProperties":{"$ref":"#/$defs/TermAssignment"}},"author":{"$ref":"#/$defs/Actor"},"coverImage":{"$ref":"#/$defs/ImageRef"},"publishedAt":{"$ref":"#/$defs/Timestamp"},"availability":{"$ref":"#/$defs/Availability"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"Availability":{"type":"object","description":"Time gates of a page or content entry (RFC-0008): the published site shows the node only from `from` (inclusive: an embargo) until `until` (exclusive: an expiry), checked at render time, so the gates hold even when no scheduler runs. Before `from` and from `until` on, the node is absent from every public route, list, feed, sitemap and search output; previews still show it. At least one gate; writers check that `from` is before `until`.","additionalProperties":false,"minProperties":1,"properties":{"from":{"$ref":"#/$defs/Timestamp"},"until":{"$ref":"#/$defs/Timestamp"}}},"Body":{"type":"object","additionalProperties":false,"required":["format","value"],"properties":{"format":{"type":"string","enum":["markdown","html"]},"value":{"type":"string","maxLength":1000000},"profile":{"$ref":"#/$defs/BodyProfile"},"blocks":{"$ref":"#/$defs/BodyBlocks"}}},"BodyBlock":{"type":"object","description":"One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.","additionalProperties":false,"required":["id","hash"],"properties":{"id":{"type":"string","pattern":"^blk_[0-9A-Za-z]{8,24}$","description":"Stable across writes that keep the block's content or its place among unchanged blocks."},"hash":{"type":"string","pattern":"^[0-9a-f]{64}$","description":"SHA-256 (hex) of the block's markdown without trailing whitespace."},"by":{"$ref":"#/$defs/Actor"},"via":{"type":"string","enum":["studio","mcp","api","import","ai-command","proposal"],"description":"The channel of that change."},"at":{"$ref":"#/$defs/Timestamp"}}},"BodyBlocks":{"type":"array","description":"A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.","maxItems":5000,"items":{"$ref":"#/$defs/BodyBlock"}},"BodyProfile":{"type":"integer","enum":[1],"description":"The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"PublishStatus":{"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"TermAssignment":{"type":"object","description":"Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.","additionalProperties":false,"required":["ids"],"properties":{"ids":{"type":"array","items":{"$ref":"#/$defs/Id"},"minItems":1,"maxItems":50,"uniqueItems":true},"primary":{"$ref":"#/$defs/Id","description":"The entry's main term in this taxonomy (breadcrumbs, articleSection, later permalinks). Must be one of `ids`."}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema106 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema107 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema109 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema111 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema112 = {"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]};
const schema120 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema132 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema135 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema113 = {"type":"object","additionalProperties":false,"required":["format","value"],"properties":{"format":{"type":"string","enum":["markdown","html"]},"value":{"type":"string","maxLength":1000000},"profile":{"$ref":"#/$defs/BodyProfile"},"blocks":{"$ref":"#/$defs/BodyBlocks"}}};
const schema114 = {"type":"integer","enum":[1],"description":"The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."};
const schema115 = {"type":"array","description":"A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty.","maxItems":5000,"items":{"$ref":"#/$defs/BodyBlock"}};
const schema116 = {"type":"object","description":"One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed.","additionalProperties":false,"required":["id","hash"],"properties":{"id":{"type":"string","pattern":"^blk_[0-9A-Za-z]{8,24}$","description":"Stable across writes that keep the block's content or its place among unchanged blocks."},"hash":{"type":"string","pattern":"^[0-9a-f]{64}$","description":"SHA-256 (hex) of the block's markdown without trailing whitespace."},"by":{"$ref":"#/$defs/Actor"},"via":{"type":"string","enum":["studio","mcp","api","import","ai-command","proposal"],"description":"The channel of that change."},"at":{"$ref":"#/$defs/Timestamp"}}};
const schema117 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema118 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate55(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate55.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "id")) || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "human") || (data0 === "agent")) || (data0 === "system"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema118.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err9 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate55.errors = vErrors;
return errors === 0;
}
validate55.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate54(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate54.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.hash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hash"},message:"must have required property '"+"hash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "hash")) || (key0 === "by")) || (key0 === "via")) || (key0 === "at"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(!pattern26.test(data0)){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/pattern",keyword:"pattern",params:{pattern: "^blk_[0-9A-Za-z]{8,24}$"},message:"must match pattern \""+"^blk_[0-9A-Za-z]{8,24}$"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.hash !== undefined){
let data1 = data.hash;
if(typeof data1 === "string"){
if(!pattern27.test(data1)){
const err5 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.by !== undefined){
if(!(validate55(data.by, {instancePath:instancePath+"/by",parentData:data,parentDataProperty:"by",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
errors = vErrors.length;
}
}
if(data.via !== undefined){
let data3 = data.via;
if(typeof data3 !== "string"){
const err7 = {instancePath:instancePath+"/via",schemaPath:"#/properties/via/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!((((((data3 === "studio") || (data3 === "mcp")) || (data3 === "api")) || (data3 === "import")) || (data3 === "ai-command")) || (data3 === "proposal"))){
const err8 = {instancePath:instancePath+"/via",schemaPath:"#/properties/via/enum",keyword:"enum",params:{allowedValues: schema116.properties.via.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.at !== undefined){
let data4 = data.at;
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err9 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate54.errors = vErrors;
return errors === 0;
}
validate54.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate53(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate53.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(Array.isArray(data)){
if(data.length > 5000){
const err0 = {instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 5000},message:"must NOT have more than 5000 items"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
if(!(validate54(data[i0], {instancePath:instancePath+"/" + i0,parentData:data,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
errors = vErrors.length;
}
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate53.errors = vErrors;
return errors === 0;
}
validate53.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};


function validate52(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate52.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.format === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.value === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "format") || (key0 === "value")) || (key0 === "profile")) || (key0 === "blocks"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.format !== undefined){
let data0 = data.format;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/format",schemaPath:"#/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!((data0 === "markdown") || (data0 === "html"))){
const err4 = {instancePath:instancePath+"/format",schemaPath:"#/properties/format/enum",keyword:"enum",params:{allowedValues: schema113.properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.value !== undefined){
let data1 = data.value;
if(typeof data1 === "string"){
if(func2(data1) > 1000000){
const err5 = {instancePath:instancePath+"/value",schemaPath:"#/properties/value/maxLength",keyword:"maxLength",params:{limit: 1000000},message:"must NOT have more than 1000000 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/value",schemaPath:"#/properties/value/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.profile !== undefined){
let data2 = data.profile;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err7 = {instancePath:instancePath+"/profile",schemaPath:"#/$defs/BodyProfile/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(!(data2 === 1)){
const err8 = {instancePath:instancePath+"/profile",schemaPath:"#/$defs/BodyProfile/enum",keyword:"enum",params:{allowedValues: schema114.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.blocks !== undefined){
if(!(validate53(data.blocks, {instancePath:instancePath+"/blocks",parentData:data,parentDataProperty:"blocks",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate53.errors : vErrors.concat(validate53.errors);
errors = vErrors.length;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate52.errors = vErrors;
return errors === 0;
}
validate52.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema123 = {"type":"object","description":"Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.","additionalProperties":false,"required":["ids"],"properties":{"ids":{"type":"array","items":{"$ref":"#/$defs/Id"},"minItems":1,"maxItems":50,"uniqueItems":true},"primary":{"$ref":"#/$defs/Id","description":"The entry's main term in this taxonomy (breadcrumbs, articleSection, later permalinks). Must be one of `ids`."}}};

function validate60(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate60.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.ids === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "ids"},message:"must have required property '"+"ids"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "ids") || (key0 === "primary"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.ids !== undefined){
let data0 = data.ids;
if(Array.isArray(data0)){
if(data0.length > 50){
const err2 = {instancePath:instancePath+"/ids",schemaPath:"#/properties/ids/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data0.length < 1){
const err3 = {instancePath:instancePath+"/ids",schemaPath:"#/properties/ids/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err4 = {instancePath:instancePath+"/ids/" + i0,schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func2(data1) < 8){
const err5 = {instancePath:instancePath+"/ids/" + i0,schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern4.test(data1)){
const err6 = {instancePath:instancePath+"/ids/" + i0,schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err7 = {instancePath:instancePath+"/ids/" + i0,schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
let i1 = data0.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data0[i1], data0[j0])){
const err8 = {instancePath:instancePath+"/ids",schemaPath:"#/properties/ids/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err9 = {instancePath:instancePath+"/ids",schemaPath:"#/properties/ids/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.primary !== undefined){
let data2 = data.primary;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err10 = {instancePath:instancePath+"/primary",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func2(data2) < 8){
const err11 = {instancePath:instancePath+"/primary",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!pattern4.test(data2)){
const err12 = {instancePath:instancePath+"/primary",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err13 = {instancePath:instancePath+"/primary",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate60.errors = vErrors;
return errors === 0;
}
validate60.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema126 = {"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};

function validate63(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate63.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.src === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.alt === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "assetId") || (key0 === "src")) || (key0 === "alt")) || (key0 === "width")) || (key0 === "height"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.assetId !== undefined){
let data0 = data.assetId;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err3 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func2(data0) < 8){
const err4 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!pattern4.test(data0)){
const err5 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.src !== undefined){
let data1 = data.src;
if(typeof data1 === "string"){
if(func2(data1) > 2048){
const err7 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func2(data1) < 1){
const err8 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err9 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.alt !== undefined){
let data2 = data.alt;
if(typeof data2 === "string"){
if(func2(data2) > 500){
const err10 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.width !== undefined){
let data3 = data.width;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err12 = {instancePath:instancePath+"/width",schemaPath:"#/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 < 1 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/width",schemaPath:"#/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.height !== undefined){
let data4 = data.height;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err14 = {instancePath:instancePath+"/height",schemaPath:"#/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 1 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/height",schemaPath:"#/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate63.errors = vErrors;
return errors === 0;
}
validate63.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema129 = {"type":"object","description":"Time gates of a page or content entry (RFC-0008): the published site shows the node only from `from` (inclusive: an embargo) until `until` (exclusive: an expiry), checked at render time, so the gates hold even when no scheduler runs. Before `from` and from `until` on, the node is absent from every public route, list, feed, sitemap and search output; previews still show it. At least one gate; writers check that `from` is before `until`.","additionalProperties":false,"minProperties":1,"properties":{"from":{"$ref":"#/$defs/Timestamp"},"until":{"$ref":"#/$defs/Timestamp"}}};

function validate65(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate65.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(Object.keys(data).length < 1){
const err0 = {instancePath,schemaPath:"#/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "from") || (key0 === "until"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.from !== undefined){
let data0 = data.from;
if(typeof data0 === "string"){
if(!(formats0.validate(data0))){
const err2 = {instancePath:instancePath+"/from",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/from",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.until !== undefined){
let data1 = data.until;
if(typeof data1 === "string"){
if(!(formats0.validate(data1))){
const err4 = {instancePath:instancePath+"/until",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err5 = {instancePath:instancePath+"/until",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate65.errors = vErrors;
return errors === 0;
}
validate65.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate51(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/content-entry.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate51.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.collection === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "collection"},message:"must have required property '"+"collection"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.slug === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.locale === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "locale"},message:"must have required property '"+"locale"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.status === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.title === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.body === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "body"},message:"must have required property '"+"body"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.fields === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "fields"},message:"must have required property '"+"fields"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.tags === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tags"},message:"must have required property '"+"tags"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.author === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "author"},message:"must have required property '"+"author"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.rev === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.createdAt === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.updatedAt === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema105.properties, key0))){
const err15 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err16 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(data0 === 1)){
const err17 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema106.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err18 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data1) < 8){
const err19 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern4.test(data1)){
const err20 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err21 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err22 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(func2(data2) < 8){
const err23 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(!pattern4.test(data2)){
const err24 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.collection !== undefined){
let data3 = data.collection;
if(typeof data3 === "string"){
if(func2(data3) > 128){
const err26 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(func2(data3) < 1){
const err27 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(!pattern5.test(data3)){
const err28 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err29 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.slug !== undefined){
let data4 = data.slug;
if(typeof data4 === "string"){
if(func2(data4) > 128){
const err30 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(func2(data4) < 1){
const err31 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(!pattern5.test(data4)){
const err32 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.locale !== undefined){
let data5 = data.locale;
if(typeof data5 === "string"){
if(!pattern11.test(data5)){
const err34 = {instancePath:instancePath+"/locale",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/locale",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err36 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/PublishStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(!((((data6 === "draft") || (data6 === "review")) || (data6 === "published")) || (data6 === "archived"))){
const err37 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/PublishStatus/enum",keyword:"enum",params:{allowedValues: schema112.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.title !== undefined){
let data7 = data.title;
if(typeof data7 === "string"){
if(func2(data7) > 300){
const err38 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(func2(data7) < 1){
const err39 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.summary !== undefined){
let data8 = data.summary;
if(typeof data8 === "string"){
if(func2(data8) > 2000){
const err41 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
else {
const err42 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.body !== undefined){
if(!(validate52(data.body, {instancePath:instancePath+"/body",parentData:data,parentDataProperty:"body",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
errors = vErrors.length;
}
}
if(data.fields !== undefined){
let data10 = data.fields;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
}
else {
const err43 = {instancePath:instancePath+"/fields",schemaPath:"#/properties/fields/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.tags !== undefined){
let data11 = data.tags;
if(Array.isArray(data11)){
if(data11.length > 50){
const err44 = {instancePath:instancePath+"/tags",schemaPath:"#/properties/tags/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
const len0 = data11.length;
for(let i0=0; i0<len0; i0++){
let data12 = data11[i0];
if(typeof data12 === "string"){
if(func2(data12) > 128){
const err45 = {instancePath:instancePath+"/tags/" + i0,schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(func2(data12) < 1){
const err46 = {instancePath:instancePath+"/tags/" + i0,schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(!pattern5.test(data12)){
const err47 = {instancePath:instancePath+"/tags/" + i0,schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err48 = {instancePath:instancePath+"/tags/" + i0,schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
let i1 = data11.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data11[i1], data11[j0])){
const err49 = {instancePath:instancePath+"/tags",schemaPath:"#/properties/tags/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err50 = {instancePath:instancePath+"/tags",schemaPath:"#/properties/tags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.terms !== undefined){
let data13 = data.terms;
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
if(Object.keys(data13).length > 10){
const err51 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/maxProperties",keyword:"maxProperties",params:{limit: 10},message:"must NOT have more than 10 properties"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(Object.keys(data13).length < 1){
const err52 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
for(const key1 in data13){
const _errs38 = errors;
if(typeof key1 === "string"){
if(func2(key1) > 128){
const err53 = {instancePath:instancePath+"/terms",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters",propertyName:key1};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(func2(key1) < 1){
const err54 = {instancePath:instancePath+"/terms",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters",propertyName:key1};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!pattern5.test(key1)){
const err55 = {instancePath:instancePath+"/terms",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\"",propertyName:key1};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/terms",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key1};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
var valid12 = _errs38 === errors;
if(!valid12){
const err57 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/propertyNames",keyword:"propertyNames",params:{propertyName: key1},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
for(const key2 in data13){
if(!(validate60(data13[key2], {instancePath:instancePath+"/terms/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data13,parentDataProperty:key2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
errors = vErrors.length;
}
}
}
else {
const err58 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data.author !== undefined){
if(!(validate55(data.author, {instancePath:instancePath+"/author",parentData:data,parentDataProperty:"author",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
errors = vErrors.length;
}
}
if(data.coverImage !== undefined){
if(!(validate63(data.coverImage, {instancePath:instancePath+"/coverImage",parentData:data,parentDataProperty:"coverImage",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate63.errors : vErrors.concat(validate63.errors);
errors = vErrors.length;
}
}
if(data.publishedAt !== undefined){
let data17 = data.publishedAt;
if(typeof data17 === "string"){
if(!(formats0.validate(data17))){
const err59 = {instancePath:instancePath+"/publishedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
else {
const err60 = {instancePath:instancePath+"/publishedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data.availability !== undefined){
if(!(validate65(data.availability, {instancePath:instancePath+"/availability",parentData:data,parentDataProperty:"availability",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate65.errors : vErrors.concat(validate65.errors);
errors = vErrors.length;
}
}
if(data.rev !== undefined){
let data19 = data.rev;
if(!(((typeof data19 == "number") && (!(data19 % 1) && !isNaN(data19))) && (isFinite(data19)))){
const err61 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if((typeof data19 == "number") && (isFinite(data19))){
if(data19 < 0 || isNaN(data19)){
const err62 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
}
if(data.createdAt !== undefined){
let data20 = data.createdAt;
if(typeof data20 === "string"){
if(!(formats0.validate(data20))){
const err63 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
else {
const err64 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data21 = data.updatedAt;
if(typeof data21 === "string"){
if(!(formats0.validate(data21))){
const err65 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err66 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data.metadata !== undefined){
let data22 = data.metadata;
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
for(const key3 in data22){
if(typeof data22[key3] !== "string"){
const err67 = {instancePath:instancePath+"/metadata/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
}
else {
const err68 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
}
else {
const err69 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
validate51.errors = vErrors;
return errors === 0;
}
validate51.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSnapshot = validate67;
const schema136 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/snapshot.schema.json","title":"Snapshot","description":"Immutable record of a site's node set at one instant: which nodes existed, at which revision, with which content hash. Every mutation by an agent produces one; publish and rollback point the site at one. Node bodies are stored by hash in the blob store, not here.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","siteRev","reason","actor","nodes","summary","createdAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"parentId":{"$ref":"#/$defs/Id","description":"Previous snapshot in this site's history; absent for the first one."},"siteRev":{"$ref":"#/$defs/Revision"},"reason":{"type":"string","enum":["manual","agentMutation","publish","rollback","scheduled","import"]},"label":{"type":"string","maxLength":200},"actor":{"$ref":"#/$defs/Actor"},"nodes":{"type":"array","items":{"$ref":"#/$defs/NodeRef"}},"summary":{"$ref":"#/$defs/ChangeSummary"},"createdAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"ChangeSummary":{"type":"object","additionalProperties":false,"required":["added","changed","removed"],"properties":{"added":{"type":"integer","minimum":0},"changed":{"type":"integer","minimum":0},"removed":{"type":"integer","minimum":0}}},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"NodeRef":{"type":"object","additionalProperties":false,"required":["id","kind","rev","hash"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["site","page","contentEntry","taxonomy","term","redirect","menu","asset"]},"rev":{"$ref":"#/$defs/Revision"},"hash":{"type":"string","description":"Lower-case hex SHA-256 of the node's canonical JSON.","pattern":"^[0-9a-f]{64}$"}}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema137 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema138 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema141 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema148 = {"type":"object","additionalProperties":false,"required":["added","changed","removed"],"properties":{"added":{"type":"integer","minimum":0},"changed":{"type":"integer","minimum":0},"removed":{"type":"integer","minimum":0}}};
const schema149 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema150 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema142 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema143 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate68(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate68.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "id")) || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "human") || (data0 === "agent")) || (data0 === "system"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema143.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err9 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate68.errors = vErrors;
return errors === 0;
}
validate68.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema145 = {"type":"object","additionalProperties":false,"required":["id","kind","rev","hash"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["site","page","contentEntry","taxonomy","term","redirect","menu","asset"]},"rev":{"$ref":"#/$defs/Revision"},"hash":{"type":"string","description":"Lower-case hex SHA-256 of the node's canonical JSON.","pattern":"^[0-9a-f]{64}$"}}};

function validate70(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate70.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.rev === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.hash === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hash"},message:"must have required property '"+"hash"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "id") || (key0 === "kind")) || (key0 === "rev")) || (key0 === "hash"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data0) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data0)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!((((((((data1 === "site") || (data1 === "page")) || (data1 === "contentEntry")) || (data1 === "taxonomy")) || (data1 === "term")) || (data1 === "redirect")) || (data1 === "menu")) || (data1 === "asset"))){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema145.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.rev !== undefined){
let data2 = data.rev;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err11 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err12 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
if(data.hash !== undefined){
let data3 = data.hash;
if(typeof data3 === "string"){
if(!pattern27.test(data3)){
const err13 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
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
const err14 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err15 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
validate70.errors = vErrors;
return errors === 0;
}
validate70.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate67(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/snapshot.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate67.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.siteRev === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteRev"},message:"must have required property '"+"siteRev"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.reason === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reason"},message:"must have required property '"+"reason"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.actor === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "actor"},message:"must have required property '"+"actor"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.nodes === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "nodes"},message:"must have required property '"+"nodes"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.summary === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "summary"},message:"must have required property '"+"summary"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.createdAt === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema136.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err10 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!(data0 === 1)){
const err11 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema137.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(func2(data1) < 8){
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!pattern4.test(data1)){
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err16 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func2(data2) < 8){
const err17 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!pattern4.test(data2)){
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err19 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.parentId !== undefined){
let data3 = data.parentId;
if(typeof data3 === "string"){
if(func2(data3) > 48){
const err20 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(func2(data3) < 8){
const err21 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(!pattern4.test(data3)){
const err22 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err23 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.siteRev !== undefined){
let data4 = data.siteRev;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err24 = {instancePath:instancePath+"/siteRev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 0 || isNaN(data4)){
const err25 = {instancePath:instancePath+"/siteRev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
if(data.reason !== undefined){
let data5 = data.reason;
if(typeof data5 !== "string"){
const err26 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!((((((data5 === "manual") || (data5 === "agentMutation")) || (data5 === "publish")) || (data5 === "rollback")) || (data5 === "scheduled")) || (data5 === "import"))){
const err27 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/enum",keyword:"enum",params:{allowedValues: schema136.properties.reason.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.label !== undefined){
let data6 = data.label;
if(typeof data6 === "string"){
if(func2(data6) > 200){
const err28 = {instancePath:instancePath+"/label",schemaPath:"#/properties/label/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
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
const err29 = {instancePath:instancePath+"/label",schemaPath:"#/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.actor !== undefined){
if(!(validate68(data.actor, {instancePath:instancePath+"/actor",parentData:data,parentDataProperty:"actor",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate68.errors : vErrors.concat(validate68.errors);
errors = vErrors.length;
}
}
if(data.nodes !== undefined){
let data8 = data.nodes;
if(Array.isArray(data8)){
const len0 = data8.length;
for(let i0=0; i0<len0; i0++){
if(!(validate70(data8[i0], {instancePath:instancePath+"/nodes/" + i0,parentData:data8,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate70.errors : vErrors.concat(validate70.errors);
errors = vErrors.length;
}
}
}
else {
const err30 = {instancePath:instancePath+"/nodes",schemaPath:"#/properties/nodes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.summary !== undefined){
let data10 = data.summary;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
if(data10.added === undefined){
const err31 = {instancePath:instancePath+"/summary",schemaPath:"#/$defs/ChangeSummary/required",keyword:"required",params:{missingProperty: "added"},message:"must have required property '"+"added"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(data10.changed === undefined){
const err32 = {instancePath:instancePath+"/summary",schemaPath:"#/$defs/ChangeSummary/required",keyword:"required",params:{missingProperty: "changed"},message:"must have required property '"+"changed"+"'"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(data10.removed === undefined){
const err33 = {instancePath:instancePath+"/summary",schemaPath:"#/$defs/ChangeSummary/required",keyword:"required",params:{missingProperty: "removed"},message:"must have required property '"+"removed"+"'"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
for(const key1 in data10){
if(!(((key1 === "added") || (key1 === "changed")) || (key1 === "removed"))){
const err34 = {instancePath:instancePath+"/summary",schemaPath:"#/$defs/ChangeSummary/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data10.added !== undefined){
let data11 = data10.added;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err35 = {instancePath:instancePath+"/summary/added",schemaPath:"#/$defs/ChangeSummary/properties/added/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 < 0 || isNaN(data11)){
const err36 = {instancePath:instancePath+"/summary/added",schemaPath:"#/$defs/ChangeSummary/properties/added/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
if(data10.changed !== undefined){
let data12 = data10.changed;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
const err37 = {instancePath:instancePath+"/summary/changed",schemaPath:"#/$defs/ChangeSummary/properties/changed/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 < 0 || isNaN(data12)){
const err38 = {instancePath:instancePath+"/summary/changed",schemaPath:"#/$defs/ChangeSummary/properties/changed/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
if(data10.removed !== undefined){
let data13 = data10.removed;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err39 = {instancePath:instancePath+"/summary/removed",schemaPath:"#/$defs/ChangeSummary/properties/removed/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 < 0 || isNaN(data13)){
const err40 = {instancePath:instancePath+"/summary/removed",schemaPath:"#/$defs/ChangeSummary/properties/removed/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
}
else {
const err41 = {instancePath:instancePath+"/summary",schemaPath:"#/$defs/ChangeSummary/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data14 = data.createdAt;
if(typeof data14 === "string"){
if(!(formats0.validate(data14))){
const err42 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.metadata !== undefined){
let data15 = data.metadata;
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
for(const key2 in data15){
if(typeof data15[key2] !== "string"){
const err44 = {instancePath:instancePath+"/metadata/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
else {
const err45 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
else {
const err46 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
validate67.errors = vErrors;
return errors === 0;
}
validate67.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSkillManifest = validate72;
const schema151 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/skill-manifest.schema.json","title":"SkillManifest","description":"YAML frontmatter of a SKILL.md, exactly the six fields of the Agent Skills specification (agentskills.io). Cloudhal-specific data goes under `metadata` as flat string keys prefixed `cloudhal.` (schemaVersion, requiresCapabilities, scopes, approval); nested vendor blocks are rejected by hosted skill uploaders.","type":"object","additionalProperties":false,"required":["name","description"],"properties":{"name":{"type":"string","description":"Lower-case kebab-case; must equal the skill directory name.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":64},"description":{"type":"string","minLength":1,"maxLength":1024},"license":{"type":"string","maxLength":200},"compatibility":{"type":"string","maxLength":500},"metadata":{"$ref":"#/$defs/Metadata"},"allowed-tools":{"type":"string","description":"Space-separated tool names the skill may call (experimental in the spec).","maxLength":2000}},"$defs":{"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}}}};
const schema152 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};

function validate72(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/skill-manifest.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate72.evaluated;
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
if(data.description === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "name") || (key0 === "description")) || (key0 === "license")) || (key0 === "compatibility")) || (key0 === "metadata")) || (key0 === "allowed-tools"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.name !== undefined){
let data0 = data.name;
if(typeof data0 === "string"){
if(func2(data0) > 64){
const err3 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func2(data0) < 1){
const err4 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!pattern5.test(data0)){
const err5 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.description !== undefined){
let data1 = data.description;
if(typeof data1 === "string"){
if(func2(data1) > 1024){
const err7 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func2(data1) < 1){
const err8 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err9 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.license !== undefined){
let data2 = data.license;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err10 = {instancePath:instancePath+"/license",schemaPath:"#/properties/license/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/license",schemaPath:"#/properties/license/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.compatibility !== undefined){
let data3 = data.compatibility;
if(typeof data3 === "string"){
if(func2(data3) > 500){
const err12 = {instancePath:instancePath+"/compatibility",schemaPath:"#/properties/compatibility/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
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
const err13 = {instancePath:instancePath+"/compatibility",schemaPath:"#/properties/compatibility/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.metadata !== undefined){
let data4 = data.metadata;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
for(const key1 in data4){
if(typeof data4[key1] !== "string"){
const err14 = {instancePath:instancePath+"/metadata/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err15 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data["allowed-tools"] !== undefined){
let data6 = data["allowed-tools"];
if(typeof data6 === "string"){
if(func2(data6) > 2000){
const err16 = {instancePath:instancePath+"/allowed-tools",schemaPath:"#/properties/allowed-tools/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/allowed-tools",schemaPath:"#/properties/allowed-tools/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
else {
const err18 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
validate72.errors = vErrors;
return errors === 0;
}
validate72.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateTaxonomy = validate73;
const schema153 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/taxonomy.schema.json","title":"Taxonomy","description":"A classification scheme of a site (e.g. 'category', 'tag', 'series') and its rules: hierarchy, who may create terms, how many terms an entry takes, and how its archives are published. Terms are separate nodes (term.schema.json) that point here by id (RFC-0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","key","labels","hierarchical","allowNewTerms","required","archive","feed","minEntriesToIndex","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"key":{"$ref":"#/$defs/Slug","description":"Stable name of the taxonomy, unique per site and immutable once created. ContentEntry.terms and filter expressions use it (e.g. 'category:news')."},"labels":{"type":"object","description":"Display names per locale. Must contain the site's default locale.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"$ref":"#/$defs/TaxonomyLabel"}},"hierarchical":{"type":"boolean","description":"Terms may have a parent term (categories). Flat when false (tags)."},"allowNewTerms":{"type":"string","description":"Who may add terms. none: people only. propose: agents may create terms with status 'proposed' that wait for a person. free: agents may create active terms.","enum":["none","propose","free"]},"required":{"type":"boolean","description":"An entry in review or published status must have at least one term of this taxonomy and an explicit primary term."},"maxPerEntry":{"type":"integer","description":"Most terms of this taxonomy one entry may carry. Absent: the contract limit of 50.","minimum":1,"maximum":50},"collections":{"type":"array","description":"Collections this taxonomy applies to. Absent: every collection.","items":{"$ref":"#/$defs/Slug"},"minItems":1,"maxItems":50,"uniqueItems":true},"archive":{"$ref":"#/$defs/TaxonomyArchive"},"feed":{"type":"boolean","description":"Publish an RSS feed per term at <archive.basePath>/<slug>/rss.xml. Requires archive.enabled."},"minEntriesToIndex":{"type":"integer","description":"Archives listing fewer published entries than this are served with robots 'noindex, follow' and left out of the sitemap.","minimum":0,"maximum":1000},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Path":{"type":"string","description":"Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"TaxonomyArchive":{"type":"object","description":"Public archive pages: <basePath>/<term-slug> and <basePath>/<term-slug>/page/<n>.","additionalProperties":false,"required":["enabled","basePath"],"properties":{"enabled":{"type":"boolean"},"basePath":{"$ref":"#/$defs/Path"}}},"TaxonomyLabel":{"type":"object","additionalProperties":false,"required":["singular","plural"],"properties":{"singular":{"type":"string","minLength":1,"maxLength":100},"plural":{"type":"string","minLength":1,"maxLength":100},"description":{"type":"string","maxLength":1000}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema154 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema155 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema157 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema158 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema159 = {"type":"object","additionalProperties":false,"required":["singular","plural"],"properties":{"singular":{"type":"string","minLength":1,"maxLength":100},"plural":{"type":"string","minLength":1,"maxLength":100},"description":{"type":"string","maxLength":1000}}};
const schema163 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema164 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema166 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema161 = {"type":"object","description":"Public archive pages: <basePath>/<term-slug> and <basePath>/<term-slug>/page/<n>.","additionalProperties":false,"required":["enabled","basePath"],"properties":{"enabled":{"type":"boolean"},"basePath":{"$ref":"#/$defs/Path"}}};
const schema162 = {"type":"string","description":"Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024};

function validate74(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate74.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.enabled === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "enabled"},message:"must have required property '"+"enabled"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.basePath === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "basePath"},message:"must have required property '"+"basePath"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "enabled") || (key0 === "basePath"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.enabled !== undefined){
if(typeof data.enabled !== "boolean"){
const err3 = {instancePath:instancePath+"/enabled",schemaPath:"#/properties/enabled/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.basePath !== undefined){
let data1 = data.basePath;
if(typeof data1 === "string"){
if(func2(data1) > 1024){
const err4 = {instancePath:instancePath+"/basePath",schemaPath:"#/$defs/Path/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!pattern21.test(data1)){
const err5 = {instancePath:instancePath+"/basePath",schemaPath:"#/$defs/Path/pattern",keyword:"pattern",params:{pattern: "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"},message:"must match pattern \""+"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/basePath",schemaPath:"#/$defs/Path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate74.errors = vErrors;
return errors === 0;
}
validate74.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate73(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/taxonomy.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate73.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.key === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "key"},message:"must have required property '"+"key"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.labels === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "labels"},message:"must have required property '"+"labels"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.hierarchical === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hierarchical"},message:"must have required property '"+"hierarchical"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.allowNewTerms === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "allowNewTerms"},message:"must have required property '"+"allowNewTerms"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.required === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "required"},message:"must have required property '"+"required"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.archive === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "archive"},message:"must have required property '"+"archive"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.feed === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "feed"},message:"must have required property '"+"feed"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.minEntriesToIndex === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "minEntriesToIndex"},message:"must have required property '"+"minEntriesToIndex"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.rev === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.createdAt === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.updatedAt === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema153.properties, key0))){
const err14 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err15 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!(data0 === 1)){
const err16 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema154.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err17 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(func2(data1) < 8){
const err18 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!pattern4.test(data1)){
const err19 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err21 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(func2(data2) < 8){
const err22 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!pattern4.test(data2)){
const err23 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.key !== undefined){
let data3 = data.key;
if(typeof data3 === "string"){
if(func2(data3) > 128){
const err25 = {instancePath:instancePath+"/key",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(func2(data3) < 1){
const err26 = {instancePath:instancePath+"/key",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!pattern5.test(data3)){
const err27 = {instancePath:instancePath+"/key",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err28 = {instancePath:instancePath+"/key",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.labels !== undefined){
let data4 = data.labels;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(Object.keys(data4).length < 1){
const err29 = {instancePath:instancePath+"/labels",schemaPath:"#/properties/labels/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
for(const key1 in data4){
const _errs16 = errors;
if(typeof key1 === "string"){
if(!pattern11.test(key1)){
const err30 = {instancePath:instancePath+"/labels",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\"",propertyName:key1};
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
const err31 = {instancePath:instancePath+"/labels",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key1};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
var valid5 = _errs16 === errors;
if(!valid5){
const err32 = {instancePath:instancePath+"/labels",schemaPath:"#/properties/labels/propertyNames",keyword:"propertyNames",params:{propertyName: key1},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
for(const key2 in data4){
let data5 = data4[key2];
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.singular === undefined){
const err33 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/TaxonomyLabel/required",keyword:"required",params:{missingProperty: "singular"},message:"must have required property '"+"singular"+"'"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(data5.plural === undefined){
const err34 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/TaxonomyLabel/required",keyword:"required",params:{missingProperty: "plural"},message:"must have required property '"+"plural"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
for(const key3 in data5){
if(!(((key3 === "singular") || (key3 === "plural")) || (key3 === "description"))){
const err35 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/TaxonomyLabel/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data5.singular !== undefined){
let data6 = data5.singular;
if(typeof data6 === "string"){
if(func2(data6) > 100){
const err36 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/singular",schemaPath:"#/$defs/TaxonomyLabel/properties/singular/maxLength",keyword:"maxLength",params:{limit: 100},message:"must NOT have more than 100 characters"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(func2(data6) < 1){
const err37 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/singular",schemaPath:"#/$defs/TaxonomyLabel/properties/singular/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err38 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/singular",schemaPath:"#/$defs/TaxonomyLabel/properties/singular/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data5.plural !== undefined){
let data7 = data5.plural;
if(typeof data7 === "string"){
if(func2(data7) > 100){
const err39 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/plural",schemaPath:"#/$defs/TaxonomyLabel/properties/plural/maxLength",keyword:"maxLength",params:{limit: 100},message:"must NOT have more than 100 characters"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(func2(data7) < 1){
const err40 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/plural",schemaPath:"#/$defs/TaxonomyLabel/properties/plural/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err41 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/plural",schemaPath:"#/$defs/TaxonomyLabel/properties/plural/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data5.description !== undefined){
let data8 = data5.description;
if(typeof data8 === "string"){
if(func2(data8) > 1000){
const err42 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/description",schemaPath:"#/$defs/TaxonomyLabel/properties/description/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1")+"/description",schemaPath:"#/$defs/TaxonomyLabel/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
else {
const err44 = {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/TaxonomyLabel/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err45 = {instancePath:instancePath+"/labels",schemaPath:"#/properties/labels/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data.hierarchical !== undefined){
if(typeof data.hierarchical !== "boolean"){
const err46 = {instancePath:instancePath+"/hierarchical",schemaPath:"#/properties/hierarchical/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.allowNewTerms !== undefined){
let data10 = data.allowNewTerms;
if(typeof data10 !== "string"){
const err47 = {instancePath:instancePath+"/allowNewTerms",schemaPath:"#/properties/allowNewTerms/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(!(((data10 === "none") || (data10 === "propose")) || (data10 === "free"))){
const err48 = {instancePath:instancePath+"/allowNewTerms",schemaPath:"#/properties/allowNewTerms/enum",keyword:"enum",params:{allowedValues: schema153.properties.allowNewTerms.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data.required !== undefined){
if(typeof data.required !== "boolean"){
const err49 = {instancePath:instancePath+"/required",schemaPath:"#/properties/required/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.maxPerEntry !== undefined){
let data12 = data.maxPerEntry;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
const err50 = {instancePath:instancePath+"/maxPerEntry",schemaPath:"#/properties/maxPerEntry/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 > 50 || isNaN(data12)){
const err51 = {instancePath:instancePath+"/maxPerEntry",schemaPath:"#/properties/maxPerEntry/maximum",keyword:"maximum",params:{comparison: "<=", limit: 50},message:"must be <= 50"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(data12 < 1 || isNaN(data12)){
const err52 = {instancePath:instancePath+"/maxPerEntry",schemaPath:"#/properties/maxPerEntry/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
}
if(data.collections !== undefined){
let data13 = data.collections;
if(Array.isArray(data13)){
if(data13.length > 50){
const err53 = {instancePath:instancePath+"/collections",schemaPath:"#/properties/collections/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(data13.length < 1){
const err54 = {instancePath:instancePath+"/collections",schemaPath:"#/properties/collections/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
const len0 = data13.length;
for(let i0=0; i0<len0; i0++){
let data14 = data13[i0];
if(typeof data14 === "string"){
if(func2(data14) > 128){
const err55 = {instancePath:instancePath+"/collections/" + i0,schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(func2(data14) < 1){
const err56 = {instancePath:instancePath+"/collections/" + i0,schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(!pattern5.test(data14)){
const err57 = {instancePath:instancePath+"/collections/" + i0,schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
else {
const err58 = {instancePath:instancePath+"/collections/" + i0,schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
let i1 = data13.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data13[i1], data13[j0])){
const err59 = {instancePath:instancePath+"/collections",schemaPath:"#/properties/collections/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err60 = {instancePath:instancePath+"/collections",schemaPath:"#/properties/collections/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data.archive !== undefined){
if(!(validate74(data.archive, {instancePath:instancePath+"/archive",parentData:data,parentDataProperty:"archive",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate74.errors : vErrors.concat(validate74.errors);
errors = vErrors.length;
}
}
if(data.feed !== undefined){
if(typeof data.feed !== "boolean"){
const err61 = {instancePath:instancePath+"/feed",schemaPath:"#/properties/feed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.minEntriesToIndex !== undefined){
let data17 = data.minEntriesToIndex;
if(!(((typeof data17 == "number") && (!(data17 % 1) && !isNaN(data17))) && (isFinite(data17)))){
const err62 = {instancePath:instancePath+"/minEntriesToIndex",schemaPath:"#/properties/minEntriesToIndex/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if((typeof data17 == "number") && (isFinite(data17))){
if(data17 > 1000 || isNaN(data17)){
const err63 = {instancePath:instancePath+"/minEntriesToIndex",schemaPath:"#/properties/minEntriesToIndex/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1000},message:"must be <= 1000"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(data17 < 0 || isNaN(data17)){
const err64 = {instancePath:instancePath+"/minEntriesToIndex",schemaPath:"#/properties/minEntriesToIndex/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
if(data.rev !== undefined){
let data18 = data.rev;
if(!(((typeof data18 == "number") && (!(data18 % 1) && !isNaN(data18))) && (isFinite(data18)))){
const err65 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if((typeof data18 == "number") && (isFinite(data18))){
if(data18 < 0 || isNaN(data18)){
const err66 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
}
if(data.createdAt !== undefined){
let data19 = data.createdAt;
if(typeof data19 === "string"){
if(!(formats0.validate(data19))){
const err67 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
else {
const err68 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data20 = data.updatedAt;
if(typeof data20 === "string"){
if(!(formats0.validate(data20))){
const err69 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
else {
const err70 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data.metadata !== undefined){
let data21 = data.metadata;
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
for(const key4 in data21){
if(typeof data21[key4] !== "string"){
const err71 = {instancePath:instancePath+"/metadata/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
}
else {
const err72 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
}
else {
const err73 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
validate73.errors = vErrors;
return errors === 0;
}
validate73.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateTerm = validate76;
const schema167 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/term.schema.json","title":"Term","description":"One concept in a taxonomy (a category, a tag, a series). Content refers to terms by id, independent of locale; names, synonyms, archive intro and SEO are per locale. Renames, merges and retirements keep the id and leave redirects behind; `proposedBy` records the actor that proposed it (RFC-0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","taxonomyId","slug","status","visibility","labels","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"taxonomyId":{"$ref":"#/$defs/Id"},"slug":{"$ref":"#/$defs/Slug","description":"URL segment of the term's archive; unique within its taxonomy, together with every slug in any term's slugHistory."},"status":{"type":"string","description":"active: usable and public (subject to visibility). proposed: created by an agent, waiting for a person; assignable but never public. retired: no new assignments, no archive.","enum":["active","proposed","retired"]},"visibility":{"type":"string","description":"internal terms have no archive, feed or sitemap entry and are not shown on entries; themes and filters may still use them.","enum":["public","internal"]},"labels":{"type":"object","description":"Names per locale. Must contain the site's default locale.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"$ref":"#/$defs/TermLabel"}},"parentId":{"$ref":"#/$defs/Id","description":"Parent term in the same taxonomy; only in hierarchical taxonomies. No cycles."},"position":{"type":"integer","description":"Order among sibling terms (same taxonomy and parent), lowest first, for menus and sidebars. Terms without a position follow, by name.","minimum":0,"maximum":100000},"image":{"$ref":"#/$defs/ImageRef"},"slugHistory":{"type":"array","description":"Earlier slugs, oldest first. Old slugs stay reserved in the taxonomy and still resolve when an agent assigns by slug.","items":{"$ref":"#/$defs/Slug"},"minItems":1,"maxItems":50,"uniqueItems":true},"mergedInto":{"$ref":"#/$defs/Id","description":"Set when this term was merged into another active term of the same taxonomy; status is then 'retired'."},"proposedBy":{"$ref":"#/$defs/Actor"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Seo":{"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"TermLabel":{"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":200},"altNames":{"type":"array","description":"Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":50,"uniqueItems":true},"description":{"type":"string","description":"Markdown introduction shown at the top of the archive.","maxLength":20000},"seo":{"$ref":"#/$defs/Seo"}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema168 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema169 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema172 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema173 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema184 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema185 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema187 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema174 = {"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":200},"altNames":{"type":"array","description":"Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":50,"uniqueItems":true},"description":{"type":"string","description":"Markdown introduction shown at the top of the archive.","maxLength":20000},"seo":{"$ref":"#/$defs/Seo"}}};
const schema175 = {"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}};
const schema176 = {"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};

function validate79(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate79.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.src === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.alt === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "assetId") || (key0 === "src")) || (key0 === "alt")) || (key0 === "width")) || (key0 === "height"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.assetId !== undefined){
let data0 = data.assetId;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err3 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func2(data0) < 8){
const err4 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!pattern4.test(data0)){
const err5 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/assetId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.src !== undefined){
let data1 = data.src;
if(typeof data1 === "string"){
if(func2(data1) > 2048){
const err7 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func2(data1) < 1){
const err8 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err9 = {instancePath:instancePath+"/src",schemaPath:"#/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.alt !== undefined){
let data2 = data.alt;
if(typeof data2 === "string"){
if(func2(data2) > 500){
const err10 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.width !== undefined){
let data3 = data.width;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err12 = {instancePath:instancePath+"/width",schemaPath:"#/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 < 1 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/width",schemaPath:"#/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.height !== undefined){
let data4 = data.height;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err14 = {instancePath:instancePath+"/height",schemaPath:"#/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 1 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/height",schemaPath:"#/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate79.errors = vErrors;
return errors === 0;
}
validate79.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate78(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate78.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!(((((key0 === "title") || (key0 === "description")) || (key0 === "noindex")) || (key0 === "canonical")) || (key0 === "ogImage"))){
const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.title !== undefined){
let data0 = data.title;
if(typeof data0 === "string"){
if(func2(data0) > 300){
const err1 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
else {
const err2 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.description !== undefined){
let data1 = data.description;
if(typeof data1 === "string"){
if(func2(data1) > 500){
const err3 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.noindex !== undefined){
if(typeof data.noindex !== "boolean"){
const err5 = {instancePath:instancePath+"/noindex",schemaPath:"#/properties/noindex/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.canonical !== undefined){
let data3 = data.canonical;
if(typeof data3 === "string"){
if(func2(data3) > 2048){
const err6 = {instancePath:instancePath+"/canonical",schemaPath:"#/properties/canonical/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
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
const err7 = {instancePath:instancePath+"/canonical",schemaPath:"#/properties/canonical/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.ogImage !== undefined){
if(!(validate79(data.ogImage, {instancePath:instancePath+"/ogImage",parentData:data,parentDataProperty:"ogImage",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate79.errors : vErrors.concat(validate79.errors);
errors = vErrors.length;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate78.errors = vErrors;
return errors === 0;
}
validate78.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate77(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate77.evaluated;
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
for(const key0 in data){
if(!((((key0 === "name") || (key0 === "altNames")) || (key0 === "description")) || (key0 === "seo"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.name !== undefined){
let data0 = data.name;
if(typeof data0 === "string"){
if(func2(data0) > 200){
const err2 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(func2(data0) < 1){
const err3 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.altNames !== undefined){
let data1 = data.altNames;
if(Array.isArray(data1)){
if(data1.length > 50){
const err5 = {instancePath:instancePath+"/altNames",schemaPath:"#/properties/altNames/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.length < 1){
const err6 = {instancePath:instancePath+"/altNames",schemaPath:"#/properties/altNames/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
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
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err7 = {instancePath:instancePath+"/altNames/" + i0,schemaPath:"#/properties/altNames/items/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func2(data2) < 1){
const err8 = {instancePath:instancePath+"/altNames/" + i0,schemaPath:"#/properties/altNames/items/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err9 = {instancePath:instancePath+"/altNames/" + i0,schemaPath:"#/properties/altNames/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
let i1 = data1.length;
let j0;
if(i1 > 1){
const indices0 = {};
for(;i1--;){
let item0 = data1[i1];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err10 = {instancePath:instancePath+"/altNames",schemaPath:"#/properties/altNames/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
break;
}
indices0[item0] = i1;
}
}
}
else {
const err11 = {instancePath:instancePath+"/altNames",schemaPath:"#/properties/altNames/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.description !== undefined){
let data3 = data.description;
if(typeof data3 === "string"){
if(func2(data3) > 20000){
const err12 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/maxLength",keyword:"maxLength",params:{limit: 20000},message:"must NOT have more than 20000 characters"};
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
const err13 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.seo !== undefined){
if(!(validate78(data.seo, {instancePath:instancePath+"/seo",parentData:data,parentDataProperty:"seo",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate78.errors : vErrors.concat(validate78.errors);
errors = vErrors.length;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate77.errors = vErrors;
return errors === 0;
}
validate77.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema181 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema182 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate84(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate84.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "id")) || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "human") || (data0 === "agent")) || (data0 === "system"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema182.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err9 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate84.errors = vErrors;
return errors === 0;
}
validate84.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate76(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/term.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate76.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.taxonomyId === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "taxonomyId"},message:"must have required property '"+"taxonomyId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.slug === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.visibility === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "visibility"},message:"must have required property '"+"visibility"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.labels === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "labels"},message:"must have required property '"+"labels"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.rev === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.createdAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.updatedAt === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema167.properties, key0))){
const err11 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(data0 === 1)){
const err13 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema168.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(func2(data1) < 8){
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!pattern4.test(data1)){
const err16 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data2) < 8){
const err19 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern4.test(data2)){
const err20 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err21 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.taxonomyId !== undefined){
let data3 = data.taxonomyId;
if(typeof data3 === "string"){
if(func2(data3) > 48){
const err22 = {instancePath:instancePath+"/taxonomyId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(func2(data3) < 8){
const err23 = {instancePath:instancePath+"/taxonomyId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(!pattern4.test(data3)){
const err24 = {instancePath:instancePath+"/taxonomyId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/taxonomyId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.slug !== undefined){
let data4 = data.slug;
if(typeof data4 === "string"){
if(func2(data4) > 128){
const err26 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(func2(data4) < 1){
const err27 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(!pattern5.test(data4)){
const err28 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err29 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.status !== undefined){
let data5 = data.status;
if(typeof data5 !== "string"){
const err30 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!(((data5 === "active") || (data5 === "proposed")) || (data5 === "retired"))){
const err31 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema167.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.visibility !== undefined){
let data6 = data.visibility;
if(typeof data6 !== "string"){
const err32 = {instancePath:instancePath+"/visibility",schemaPath:"#/properties/visibility/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(!((data6 === "public") || (data6 === "internal"))){
const err33 = {instancePath:instancePath+"/visibility",schemaPath:"#/properties/visibility/enum",keyword:"enum",params:{allowedValues: schema167.properties.visibility.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.labels !== undefined){
let data7 = data.labels;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(Object.keys(data7).length < 1){
const err34 = {instancePath:instancePath+"/labels",schemaPath:"#/properties/labels/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
for(const key1 in data7){
const _errs23 = errors;
if(typeof key1 === "string"){
if(!pattern11.test(key1)){
const err35 = {instancePath:instancePath+"/labels",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\"",propertyName:key1};
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
const err36 = {instancePath:instancePath+"/labels",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key1};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var valid6 = _errs23 === errors;
if(!valid6){
const err37 = {instancePath:instancePath+"/labels",schemaPath:"#/properties/labels/propertyNames",keyword:"propertyNames",params:{propertyName: key1},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
for(const key2 in data7){
if(!(validate77(data7[key2], {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data7,parentDataProperty:key2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
errors = vErrors.length;
}
}
}
else {
const err38 = {instancePath:instancePath+"/labels",schemaPath:"#/properties/labels/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.parentId !== undefined){
let data9 = data.parentId;
if(typeof data9 === "string"){
if(func2(data9) > 48){
const err39 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(func2(data9) < 8){
const err40 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(!pattern4.test(data9)){
const err41 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
else {
const err42 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.position !== undefined){
let data10 = data.position;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err43 = {instancePath:instancePath+"/position",schemaPath:"#/properties/position/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 > 100000 || isNaN(data10)){
const err44 = {instancePath:instancePath+"/position",schemaPath:"#/properties/position/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100000},message:"must be <= 100000"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data10 < 0 || isNaN(data10)){
const err45 = {instancePath:instancePath+"/position",schemaPath:"#/properties/position/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
if(data.image !== undefined){
if(!(validate79(data.image, {instancePath:instancePath+"/image",parentData:data,parentDataProperty:"image",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate79.errors : vErrors.concat(validate79.errors);
errors = vErrors.length;
}
}
if(data.slugHistory !== undefined){
let data12 = data.slugHistory;
if(Array.isArray(data12)){
if(data12.length > 50){
const err46 = {instancePath:instancePath+"/slugHistory",schemaPath:"#/properties/slugHistory/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(data12.length < 1){
const err47 = {instancePath:instancePath+"/slugHistory",schemaPath:"#/properties/slugHistory/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
const len0 = data12.length;
for(let i0=0; i0<len0; i0++){
let data13 = data12[i0];
if(typeof data13 === "string"){
if(func2(data13) > 128){
const err48 = {instancePath:instancePath+"/slugHistory/" + i0,schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(func2(data13) < 1){
const err49 = {instancePath:instancePath+"/slugHistory/" + i0,schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(!pattern5.test(data13)){
const err50 = {instancePath:instancePath+"/slugHistory/" + i0,schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
else {
const err51 = {instancePath:instancePath+"/slugHistory/" + i0,schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
let i1 = data12.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data12[i1], data12[j0])){
const err52 = {instancePath:instancePath+"/slugHistory",schemaPath:"#/properties/slugHistory/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err53 = {instancePath:instancePath+"/slugHistory",schemaPath:"#/properties/slugHistory/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data.mergedInto !== undefined){
let data14 = data.mergedInto;
if(typeof data14 === "string"){
if(func2(data14) > 48){
const err54 = {instancePath:instancePath+"/mergedInto",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(func2(data14) < 8){
const err55 = {instancePath:instancePath+"/mergedInto",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(!pattern4.test(data14)){
const err56 = {instancePath:instancePath+"/mergedInto",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
else {
const err57 = {instancePath:instancePath+"/mergedInto",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data.proposedBy !== undefined){
if(!(validate84(data.proposedBy, {instancePath:instancePath+"/proposedBy",parentData:data,parentDataProperty:"proposedBy",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate84.errors : vErrors.concat(validate84.errors);
errors = vErrors.length;
}
}
if(data.rev !== undefined){
let data16 = data.rev;
if(!(((typeof data16 == "number") && (!(data16 % 1) && !isNaN(data16))) && (isFinite(data16)))){
const err58 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if((typeof data16 == "number") && (isFinite(data16))){
if(data16 < 0 || isNaN(data16)){
const err59 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
if(data.createdAt !== undefined){
let data17 = data.createdAt;
if(typeof data17 === "string"){
if(!(formats0.validate(data17))){
const err60 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err61 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data18 = data.updatedAt;
if(typeof data18 === "string"){
if(!(formats0.validate(data18))){
const err62 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
else {
const err63 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.metadata !== undefined){
let data19 = data.metadata;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
for(const key3 in data19){
if(typeof data19[key3] !== "string"){
const err64 = {instancePath:instancePath+"/metadata/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err65 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
}
else {
const err66 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
validate76.errors = vErrors;
return errors === 0;
}
validate76.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateRedirect = validate86;
const schema188 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/redirect.schema.json","title":"Redirect","description":"An HTTP redirect from a path the site no longer serves. Created automatically when a published entry or a term changes slug, when terms are merged or retired, and by people. Snapshotted and published like every other node (RFC-0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","from","to","status","match","reason","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"from":{"type":"string","description":"Request path to redirect: starts with '/', no query, fragment, backslash or trailing slash (root excepted). Unique per site; never a path the site currently serves.","pattern":"^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$","maxLength":1024},"to":{"type":"string","description":"Target: a site path (may carry a query or fragment) or an absolute https URL. Protocol-relative ('//host') and backslash forms are rejected.","pattern":"^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$","maxLength":2048},"status":{"type":"integer","description":"301 (permanent) for slug changes, merges and retirements; 302 (temporary) only for manual redirects.","enum":[301,302]},"match":{"type":"string","description":"exact: only `from` itself. prefix: `from` and every path below it; the rest of the path is appended to `to` (archives: /tag/old/page/2 → /tag/new/page/2).","enum":["exact","prefix"]},"reason":{"type":"string","enum":["slug-change","merge","retire","manual"]},"source":{"$ref":"#/$defs/RedirectSource"},"note":{"type":"string","maxLength":500},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"RedirectSource":{"type":"object","description":"The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["page","contentEntry","term"]},"id":{"$ref":"#/$defs/Id"}}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema189 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema190 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema194 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema195 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema197 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern79 = new RegExp("^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$", "u");
const pattern80 = new RegExp("^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$", "u");
const schema192 = {"type":"object","description":"The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["page","contentEntry","term"]},"id":{"$ref":"#/$defs/Id"}}};

function validate87(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate87.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "id"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "page") || (data0 === "contentEntry")) || (data0 === "term"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema192.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate87.errors = vErrors;
return errors === 0;
}
validate87.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate86(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/redirect.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate86.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.from === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "from"},message:"must have required property '"+"from"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.to === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "to"},message:"must have required property '"+"to"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.match === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "match"},message:"must have required property '"+"match"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.reason === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reason"},message:"must have required property '"+"reason"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.rev === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.createdAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.updatedAt === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema188.properties, key0))){
const err11 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(data0 === 1)){
const err13 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema189.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(func2(data1) < 8){
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!pattern4.test(data1)){
const err16 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data2) < 8){
const err19 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern4.test(data2)){
const err20 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err21 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.from !== undefined){
let data3 = data.from;
if(typeof data3 === "string"){
if(func2(data3) > 1024){
const err22 = {instancePath:instancePath+"/from",schemaPath:"#/properties/from/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!pattern79.test(data3)){
const err23 = {instancePath:instancePath+"/from",schemaPath:"#/properties/from/pattern",keyword:"pattern",params:{pattern: "^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$"},message:"must match pattern \""+"^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/from",schemaPath:"#/properties/from/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.to !== undefined){
let data4 = data.to;
if(typeof data4 === "string"){
if(func2(data4) > 2048){
const err25 = {instancePath:instancePath+"/to",schemaPath:"#/properties/to/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!pattern80.test(data4)){
const err26 = {instancePath:instancePath+"/to",schemaPath:"#/properties/to/pattern",keyword:"pattern",params:{pattern: "^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$"},message:"must match pattern \""+"^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/to",schemaPath:"#/properties/to/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.status !== undefined){
let data5 = data.status;
if(!(((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5))) && (isFinite(data5)))){
const err28 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(!((data5 === 301) || (data5 === 302))){
const err29 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema188.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.match !== undefined){
let data6 = data.match;
if(typeof data6 !== "string"){
const err30 = {instancePath:instancePath+"/match",schemaPath:"#/properties/match/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!((data6 === "exact") || (data6 === "prefix"))){
const err31 = {instancePath:instancePath+"/match",schemaPath:"#/properties/match/enum",keyword:"enum",params:{allowedValues: schema188.properties.match.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.reason !== undefined){
let data7 = data.reason;
if(typeof data7 !== "string"){
const err32 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(!((((data7 === "slug-change") || (data7 === "merge")) || (data7 === "retire")) || (data7 === "manual"))){
const err33 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/enum",keyword:"enum",params:{allowedValues: schema188.properties.reason.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.source !== undefined){
if(!(validate87(data.source, {instancePath:instancePath+"/source",parentData:data,parentDataProperty:"source",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate87.errors : vErrors.concat(validate87.errors);
errors = vErrors.length;
}
}
if(data.note !== undefined){
let data9 = data.note;
if(typeof data9 === "string"){
if(func2(data9) > 500){
const err34 = {instancePath:instancePath+"/note",schemaPath:"#/properties/note/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/note",schemaPath:"#/properties/note/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.rev !== undefined){
let data10 = data.rev;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err36 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 < 0 || isNaN(data10)){
const err37 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
if(data.createdAt !== undefined){
let data11 = data.createdAt;
if(typeof data11 === "string"){
if(!(formats0.validate(data11))){
const err38 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data12 = data.updatedAt;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err40 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err41 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.metadata !== undefined){
let data13 = data.metadata;
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
for(const key1 in data13){
if(typeof data13[key1] !== "string"){
const err42 = {instancePath:instancePath+"/metadata/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err43 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
else {
const err44 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
validate86.errors = vErrors;
return errors === 0;
}
validate86.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAsset = validate89;
const schema198 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/asset.schema.json","title":"Asset","description":"A media file of a site (image, video, audio, document, data) as a graph node: its bytes are identified by SHA-256 and stored once per site in the blob store under a content-addressed key, or kept elsewhere (`storage.kind: external`, e.g. a Zenodo or Hugging Face file). Pages, entries and terms refer to it by id (`ImageRef.assetId`, markdown `asset:<id>`). Snapshotted like every node, so a deleted asset's bytes stay while any snapshot references it (RFC-0004).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","kind","mediaType","bytes","sha256","slug","storage","status","uploadedBy","source","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"kind":{"type":"string","description":"What the file is, derived from the sniffed media type (never chosen by the client). `other` is allowed for external storage only.","enum":["image","video","audio","document","data","other"]},"mediaType":{"type":"string","description":"MIME type of the stored bytes as sniffed by the server (RFC 6838, lower case, no parameters), e.g. image/webp, text/csv. Served as Content-Type.","pattern":"^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$","maxLength":255},"bytes":{"type":"integer","description":"Size of the stored bytes. For external files: the size the source reports or the uploader declares.","minimum":0},"sha256":{"$ref":"#/$defs/Sha256","description":"SHA-256 of the stored bytes (lower-case hex): the blob key, the public URL prefix, the ETag and the checksum shown with downloads. Unique per site. For external files see `storage.checksum`."},"originalSha256":{"$ref":"#/$defs/Sha256","description":"SHA-256 of the bytes as uploaded, present only when the server changed them (image metadata stripping)."},"slug":{"$ref":"#/$defs/Slug","description":"File name in the public URL, without extension: /media/<sha256[0..16]>/<slug>.<ext>. May change; the old URL then answers 301 to the new one."},"storage":{"$ref":"#/$defs/AssetStorage"},"image":{"$ref":"#/$defs/AssetImage"},"title":{"type":"object","description":"Display title per locale (download lists, library search).","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":300}},"alt":{"type":"object","description":"Alternative text per locale. An `ImageRef.alt` that is not empty overrides it for one use.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":500}},"decorative":{"type":"boolean","description":"The image carries no information and renders with alt=\"\". Absent means false; the store never writes false."},"caption":{"type":"object","description":"Caption per locale (plain text), the default for figures that show this asset.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":1000}},"credit":{"type":"string","description":"Who made it, as shown next to it (e.g. 'Photo: Ayşe Yılmaz').","minLength":1,"maxLength":300},"license":{"$ref":"#/$defs/AssetLicense"},"status":{"type":"string","description":"active: listed and pickable. retired: hidden from the library and pickers and cannot be newly referenced; existing references keep rendering.","enum":["active","retired"]},"uploadedBy":{"$ref":"#/$defs/Actor"},"source":{"$ref":"#/$defs/AssetSource"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"AssetImage":{"type":"object","description":"Intrinsic size and placeholders of an image. Present for every image stored as a blob.","additionalProperties":false,"required":["width","height"],"properties":{"width":{"type":"integer","minimum":1,"maximum":100000},"height":{"type":"integer","minimum":1,"maximum":100000},"animated":{"type":"boolean","description":"Animated GIF or WebP: never resized or re-encoded. Absent means false; the store never writes false."},"blurhash":{"type":"string","description":"BlurHash of the image for themes that decode it client-side.","pattern":"^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$"},"lqip":{"type":"string","description":"Low-quality placeholder: a raster data: URL of at most about 3 KB, shown while the image loads.","pattern":"^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$","maxLength":4096}}},"AssetLicense":{"description":"Terms the asset may be reused under: an SPDX license expression or a license URL.","oneOf":[{"type":"object","title":"SpdxLicense","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["spdx"]},"id":{"type":"string","description":"SPDX license identifier or simple expression, e.g. CC-BY-4.0, CC0-1.0, MIT OR Apache-2.0, LicenseRef-AllRightsReserved.","pattern":"^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$","maxLength":200}}},{"type":"object","title":"UrlLicense","additionalProperties":false,"required":["kind","url"],"properties":{"kind":{"type":"string","enum":["url"]},"url":{"$ref":"#/$defs/HttpsUrl"},"name":{"type":"string","minLength":1,"maxLength":200}}}]},"AssetSource":{"description":"How the asset came in. Immutable after create.","oneOf":[{"type":"object","title":"UploadSource","description":"Bytes uploaded by a person (REST) or an agent (MCP upload_asset).","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["upload"]},"filename":{"type":"string","description":"Original file name as sent (never used as a storage key or served).","pattern":"^[^/\\\\\\u0000-\\u001f\\u007f]+$","minLength":1,"maxLength":255}}},{"type":"object","title":"FetchSource","description":"Bytes the server fetched from an https URL (MCP fetch_asset_url, Studio 'From URL') under the SSRF rules.","additionalProperties":false,"required":["kind","url","fetchedAt"],"properties":{"kind":{"type":"string","enum":["fetch"]},"url":{"$ref":"#/$defs/HttpsUrl"},"fetchedAt":{"$ref":"#/$defs/Timestamp"}}},{"type":"object","title":"ImportSource","description":"Created by a migration or importer (e.g. `cloudhal media import-urls` from an ImageRef.src).","additionalProperties":false,"required":["kind","from"],"properties":{"kind":{"type":"string","enum":["import"]},"from":{"type":"string","description":"The reference it was imported from: a URL or a site path.","minLength":1,"maxLength":2048},"importer":{"$ref":"#/$defs/Slug"}}},{"type":"object","title":"LinkSource","description":"An external file registered by URL without copying its bytes (storage.kind external).","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["link"]}}}]},"AssetStorage":{"description":"Where the bytes live. `blob`: in this deployment's blob store (R2 or the filesystem) under the content-addressed key media/<siteId>/<sha256>, derived and never stored, so the node is portable between backends. `external`: elsewhere, linked rather than hosted (large research files on Zenodo or Hugging Face).","oneOf":[{"type":"object","title":"BlobStorage","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["blob"]}}},{"type":"object","title":"ExternalStorage","additionalProperties":false,"required":["kind","url","checksum"],"properties":{"kind":{"type":"string","enum":["external"]},"url":{"$ref":"#/$defs/HttpsUrl","description":"Direct download URL of the file."},"landingPage":{"$ref":"#/$defs/HttpsUrl","description":"Human page of the record the file belongs to (e.g. a Zenodo record or a Hugging Face dataset)."},"checksum":{"type":"string","description":"How `sha256` was obtained. computed: the server or `cloudhal media verify` streamed the URL and hashed it. declared: given by the person who linked it, not verified (shown as such).","enum":["computed","declared"]},"verifiedAt":{"$ref":"#/$defs/Timestamp","description":"When the URL last produced bytes with this SHA-256 (checksum `computed`)."}}}]},"HttpsUrl":{"type":"string","description":"Absolute https URL without credentials, whitespace or backslashes.","pattern":"^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$","maxLength":2048},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Sha256":{"type":"string","description":"Lower-case hex SHA-256 digest.","pattern":"^[0-9a-f]{64}$"},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema199 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema200 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema202 = {"type":"string","description":"Lower-case hex SHA-256 digest.","pattern":"^[0-9a-f]{64}$"};
const schema204 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema209 = {"type":"object","description":"Intrinsic size and placeholders of an image. Present for every image stored as a blob.","additionalProperties":false,"required":["width","height"],"properties":{"width":{"type":"integer","minimum":1,"maximum":100000},"height":{"type":"integer","minimum":1,"maximum":100000},"animated":{"type":"boolean","description":"Animated GIF or WebP: never resized or re-encoded. Absent means false; the store never writes false."},"blurhash":{"type":"string","description":"BlurHash of the image for themes that decode it client-side.","pattern":"^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$"},"lqip":{"type":"string","description":"Low-quality placeholder: a raster data: URL of at most about 3 KB, shown while the image loads.","pattern":"^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$","maxLength":4096}}};
const schema210 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema222 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema208 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema225 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern84 = new RegExp("^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$", "u");
const pattern90 = new RegExp("^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$", "u");
const pattern91 = new RegExp("^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$", "u");
const schema205 = {"description":"Where the bytes live. `blob`: in this deployment's blob store (R2 or the filesystem) under the content-addressed key media/<siteId>/<sha256>, derived and never stored, so the node is portable between backends. `external`: elsewhere, linked rather than hosted (large research files on Zenodo or Hugging Face).","oneOf":[{"type":"object","title":"BlobStorage","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["blob"]}}},{"type":"object","title":"ExternalStorage","additionalProperties":false,"required":["kind","url","checksum"],"properties":{"kind":{"type":"string","enum":["external"]},"url":{"$ref":"#/$defs/HttpsUrl","description":"Direct download URL of the file."},"landingPage":{"$ref":"#/$defs/HttpsUrl","description":"Human page of the record the file belongs to (e.g. a Zenodo record or a Hugging Face dataset)."},"checksum":{"type":"string","description":"How `sha256` was obtained. computed: the server or `cloudhal media verify` streamed the URL and hashed it. declared: given by the person who linked it, not verified (shown as such).","enum":["computed","declared"]},"verifiedAt":{"$ref":"#/$defs/Timestamp","description":"When the URL last produced bytes with this SHA-256 (checksum `computed`)."}}}]};
const schema206 = {"type":"string","description":"Absolute https URL without credentials, whitespace or backslashes.","pattern":"^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$","maxLength":2048};
const pattern88 = new RegExp("^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$", "u");

function validate90(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate90.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "kind")){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!(data0 === "blob")){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema205.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs6 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err5 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.url === undefined){
const err6 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "url"},message:"must have required property '"+"url"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.checksum === undefined){
const err7 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "checksum"},message:"must have required property '"+"checksum"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key1 in data){
if(!(((((key1 === "kind") || (key1 === "url")) || (key1 === "landingPage")) || (key1 === "checksum")) || (key1 === "verifiedAt"))){
const err8 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!(data1 === "external")){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema205.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.url !== undefined){
let data2 = data.url;
if(typeof data2 === "string"){
if(func2(data2) > 2048){
const err11 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!pattern88.test(data2)){
const err12 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/pattern",keyword:"pattern",params:{pattern: "^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$"},message:"must match pattern \""+"^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$"+"\""};
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
const err13 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.landingPage !== undefined){
let data3 = data.landingPage;
if(typeof data3 === "string"){
if(func2(data3) > 2048){
const err14 = {instancePath:instancePath+"/landingPage",schemaPath:"#/$defs/HttpsUrl/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!pattern88.test(data3)){
const err15 = {instancePath:instancePath+"/landingPage",schemaPath:"#/$defs/HttpsUrl/pattern",keyword:"pattern",params:{pattern: "^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$"},message:"must match pattern \""+"^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$"+"\""};
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
const err16 = {instancePath:instancePath+"/landingPage",schemaPath:"#/$defs/HttpsUrl/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.checksum !== undefined){
let data4 = data.checksum;
if(typeof data4 !== "string"){
const err17 = {instancePath:instancePath+"/checksum",schemaPath:"#/oneOf/1/properties/checksum/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!((data4 === "computed") || (data4 === "declared"))){
const err18 = {instancePath:instancePath+"/checksum",schemaPath:"#/oneOf/1/properties/checksum/enum",keyword:"enum",params:{allowedValues: schema205.oneOf[1].properties.checksum.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.verifiedAt !== undefined){
let data5 = data.verifiedAt;
if(typeof data5 === "string"){
if(!(formats0.validate(data5))){
const err19 = {instancePath:instancePath+"/verifiedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/verifiedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err21 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var _valid0 = _errs6 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err22 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate90.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate90.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema213 = {"description":"Terms the asset may be reused under: an SPDX license expression or a license URL.","oneOf":[{"type":"object","title":"SpdxLicense","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["spdx"]},"id":{"type":"string","description":"SPDX license identifier or simple expression, e.g. CC-BY-4.0, CC0-1.0, MIT OR Apache-2.0, LicenseRef-AllRightsReserved.","pattern":"^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$","maxLength":200}}},{"type":"object","title":"UrlLicense","additionalProperties":false,"required":["kind","url"],"properties":{"kind":{"type":"string","enum":["url"]},"url":{"$ref":"#/$defs/HttpsUrl"},"name":{"type":"string","minLength":1,"maxLength":200}}}]};
const pattern95 = new RegExp("^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$", "u");

function validate92(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate92.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "id"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(data0 === "spdx")){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema213.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 200){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/0/properties/id/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern95.test(data1)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/0/properties/id/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$"},message:"must match pattern \""+"^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$"+"\""};
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
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/oneOf/0/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs8 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.url === undefined){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "url"},message:"must have required property '"+"url"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
for(const key1 in data){
if(!(((key1 === "kind") || (key1 === "url")) || (key1 === "name"))){
const err11 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.kind !== undefined){
let data2 = data.kind;
if(typeof data2 !== "string"){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(data2 === "url")){
const err13 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema213.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.url !== undefined){
let data3 = data.url;
if(typeof data3 === "string"){
if(func2(data3) > 2048){
const err14 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!pattern88.test(data3)){
const err15 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/pattern",keyword:"pattern",params:{pattern: "^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$"},message:"must match pattern \""+"^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$"+"\""};
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
const err16 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.name !== undefined){
let data4 = data.name;
if(typeof data4 === "string"){
if(func2(data4) > 200){
const err17 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/1/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(func2(data4) < 1){
const err18 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/1/properties/name/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err19 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/1/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err20 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid0 = _errs8 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err21 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate92.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate92.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema215 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema216 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate94(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate94.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "id")) || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "human") || (data0 === "agent")) || (data0 === "system"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema216.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err9 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate94.errors = vErrors;
return errors === 0;
}
validate94.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema218 = {"description":"How the asset came in. Immutable after create.","oneOf":[{"type":"object","title":"UploadSource","description":"Bytes uploaded by a person (REST) or an agent (MCP upload_asset).","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["upload"]},"filename":{"type":"string","description":"Original file name as sent (never used as a storage key or served).","pattern":"^[^/\\\\\\u0000-\\u001f\\u007f]+$","minLength":1,"maxLength":255}}},{"type":"object","title":"FetchSource","description":"Bytes the server fetched from an https URL (MCP fetch_asset_url, Studio 'From URL') under the SSRF rules.","additionalProperties":false,"required":["kind","url","fetchedAt"],"properties":{"kind":{"type":"string","enum":["fetch"]},"url":{"$ref":"#/$defs/HttpsUrl"},"fetchedAt":{"$ref":"#/$defs/Timestamp"}}},{"type":"object","title":"ImportSource","description":"Created by a migration or importer (e.g. `cloudhal media import-urls` from an ImageRef.src).","additionalProperties":false,"required":["kind","from"],"properties":{"kind":{"type":"string","enum":["import"]},"from":{"type":"string","description":"The reference it was imported from: a URL or a site path.","minLength":1,"maxLength":2048},"importer":{"$ref":"#/$defs/Slug"}}},{"type":"object","title":"LinkSource","description":"An external file registered by URL without copying its bytes (storage.kind external).","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["link"]}}}]};
const pattern98 = new RegExp("^[^/\\\\\\u0000-\\u001f\\u007f]+$", "u");

function validate96(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate96.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "filename"))){
const err1 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!(data0 === "upload")){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema218.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.filename !== undefined){
let data1 = data.filename;
if(typeof data1 === "string"){
if(func2(data1) > 255){
const err4 = {instancePath:instancePath+"/filename",schemaPath:"#/oneOf/0/properties/filename/maxLength",keyword:"maxLength",params:{limit: 255},message:"must NOT have more than 255 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func2(data1) < 1){
const err5 = {instancePath:instancePath+"/filename",schemaPath:"#/oneOf/0/properties/filename/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern98.test(data1)){
const err6 = {instancePath:instancePath+"/filename",schemaPath:"#/oneOf/0/properties/filename/pattern",keyword:"pattern",params:{pattern: "^[^/\\\\\\u0000-\\u001f\\u007f]+$"},message:"must match pattern \""+"^[^/\\\\\\u0000-\\u001f\\u007f]+$"+"\""};
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
const err7 = {instancePath:instancePath+"/filename",schemaPath:"#/oneOf/0/properties/filename/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs8 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.url === undefined){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "url"},message:"must have required property '"+"url"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.fetchedAt === undefined){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "fetchedAt"},message:"must have required property '"+"fetchedAt"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key1 in data){
if(!(((key1 === "kind") || (key1 === "url")) || (key1 === "fetchedAt"))){
const err12 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.kind !== undefined){
let data2 = data.kind;
if(typeof data2 !== "string"){
const err13 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!(data2 === "fetch")){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema218.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.url !== undefined){
let data3 = data.url;
if(typeof data3 === "string"){
if(func2(data3) > 2048){
const err15 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!pattern88.test(data3)){
const err16 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/pattern",keyword:"pattern",params:{pattern: "^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$"},message:"must match pattern \""+"^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/url",schemaPath:"#/$defs/HttpsUrl/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.fetchedAt !== undefined){
let data4 = data.fetchedAt;
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err18 = {instancePath:instancePath+"/fetchedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err19 = {instancePath:instancePath+"/fetchedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err20 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid0 = _errs8 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs19 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err21 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data.from === undefined){
const err22 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "from"},message:"must have required property '"+"from"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
for(const key2 in data){
if(!(((key2 === "kind") || (key2 === "from")) || (key2 === "importer"))){
const err23 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.kind !== undefined){
let data5 = data.kind;
if(typeof data5 !== "string"){
const err24 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(!(data5 === "import")){
const err25 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema218.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.from !== undefined){
let data6 = data.from;
if(typeof data6 === "string"){
if(func2(data6) > 2048){
const err26 = {instancePath:instancePath+"/from",schemaPath:"#/oneOf/2/properties/from/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(func2(data6) < 1){
const err27 = {instancePath:instancePath+"/from",schemaPath:"#/oneOf/2/properties/from/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err28 = {instancePath:instancePath+"/from",schemaPath:"#/oneOf/2/properties/from/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.importer !== undefined){
let data7 = data.importer;
if(typeof data7 === "string"){
if(func2(data7) > 128){
const err29 = {instancePath:instancePath+"/importer",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(func2(data7) < 1){
const err30 = {instancePath:instancePath+"/importer",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!pattern5.test(data7)){
const err31 = {instancePath:instancePath+"/importer",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/importer",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
else {
const err33 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var _valid0 = _errs19 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs29 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err34 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
for(const key3 in data){
if(!(key3 === "kind")){
const err35 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.kind !== undefined){
let data8 = data.kind;
if(typeof data8 !== "string"){
const err36 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(!(data8 === "link")){
const err37 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema218.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
else {
const err38 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
var _valid0 = _errs29 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
}
}
}
if(!valid0){
const err39 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate96.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate96.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate89(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/asset.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate89.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.kind === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.mediaType === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mediaType"},message:"must have required property '"+"mediaType"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.bytes === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.sha256 === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sha256"},message:"must have required property '"+"sha256"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.slug === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.storage === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "storage"},message:"must have required property '"+"storage"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.status === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.uploadedBy === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "uploadedBy"},message:"must have required property '"+"uploadedBy"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.source === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.rev === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.createdAt === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.updatedAt === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema198.properties, key0))){
const err15 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err16 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(data0 === 1)){
const err17 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema199.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err18 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data1) < 8){
const err19 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern4.test(data1)){
const err20 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err21 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err22 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(func2(data2) < 8){
const err23 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(!pattern4.test(data2)){
const err24 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.kind !== undefined){
let data3 = data.kind;
if(typeof data3 !== "string"){
const err26 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!((((((data3 === "image") || (data3 === "video")) || (data3 === "audio")) || (data3 === "document")) || (data3 === "data")) || (data3 === "other"))){
const err27 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema198.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.mediaType !== undefined){
let data4 = data.mediaType;
if(typeof data4 === "string"){
if(func2(data4) > 255){
const err28 = {instancePath:instancePath+"/mediaType",schemaPath:"#/properties/mediaType/maxLength",keyword:"maxLength",params:{limit: 255},message:"must NOT have more than 255 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(!pattern84.test(data4)){
const err29 = {instancePath:instancePath+"/mediaType",schemaPath:"#/properties/mediaType/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$"+"\""};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/mediaType",schemaPath:"#/properties/mediaType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.bytes !== undefined){
let data5 = data.bytes;
if(!(((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5))) && (isFinite(data5)))){
const err31 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 < 0 || isNaN(data5)){
const err32 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
if(data.sha256 !== undefined){
let data6 = data.sha256;
if(typeof data6 === "string"){
if(!pattern27.test(data6)){
const err33 = {instancePath:instancePath+"/sha256",schemaPath:"#/$defs/Sha256/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/sha256",schemaPath:"#/$defs/Sha256/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.originalSha256 !== undefined){
let data7 = data.originalSha256;
if(typeof data7 === "string"){
if(!pattern27.test(data7)){
const err35 = {instancePath:instancePath+"/originalSha256",schemaPath:"#/$defs/Sha256/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
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
const err36 = {instancePath:instancePath+"/originalSha256",schemaPath:"#/$defs/Sha256/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data.slug !== undefined){
let data8 = data.slug;
if(typeof data8 === "string"){
if(func2(data8) > 128){
const err37 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(func2(data8) < 1){
const err38 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(!pattern5.test(data8)){
const err39 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/slug",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.storage !== undefined){
if(!(validate90(data.storage, {instancePath:instancePath+"/storage",parentData:data,parentDataProperty:"storage",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate90.errors : vErrors.concat(validate90.errors);
errors = vErrors.length;
}
}
if(data.image !== undefined){
let data10 = data.image;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
if(data10.width === undefined){
const err41 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/AssetImage/required",keyword:"required",params:{missingProperty: "width"},message:"must have required property '"+"width"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data10.height === undefined){
const err42 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/AssetImage/required",keyword:"required",params:{missingProperty: "height"},message:"must have required property '"+"height"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
for(const key1 in data10){
if(!(((((key1 === "width") || (key1 === "height")) || (key1 === "animated")) || (key1 === "blurhash")) || (key1 === "lqip"))){
const err43 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/AssetImage/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data10.width !== undefined){
let data11 = data10.width;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err44 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/AssetImage/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 > 100000 || isNaN(data11)){
const err45 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/AssetImage/properties/width/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100000},message:"must be <= 100000"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(data11 < 1 || isNaN(data11)){
const err46 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/AssetImage/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
if(data10.height !== undefined){
let data12 = data10.height;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
const err47 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/AssetImage/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 > 100000 || isNaN(data12)){
const err48 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/AssetImage/properties/height/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100000},message:"must be <= 100000"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(data12 < 1 || isNaN(data12)){
const err49 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/AssetImage/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
}
if(data10.animated !== undefined){
if(typeof data10.animated !== "boolean"){
const err50 = {instancePath:instancePath+"/image/animated",schemaPath:"#/$defs/AssetImage/properties/animated/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data10.blurhash !== undefined){
let data14 = data10.blurhash;
if(typeof data14 === "string"){
if(!pattern90.test(data14)){
const err51 = {instancePath:instancePath+"/image/blurhash",schemaPath:"#/$defs/AssetImage/properties/blurhash/pattern",keyword:"pattern",params:{pattern: "^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$"},message:"must match pattern \""+"^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$"+"\""};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
else {
const err52 = {instancePath:instancePath+"/image/blurhash",schemaPath:"#/$defs/AssetImage/properties/blurhash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data10.lqip !== undefined){
let data15 = data10.lqip;
if(typeof data15 === "string"){
if(func2(data15) > 4096){
const err53 = {instancePath:instancePath+"/image/lqip",schemaPath:"#/$defs/AssetImage/properties/lqip/maxLength",keyword:"maxLength",params:{limit: 4096},message:"must NOT have more than 4096 characters"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(!pattern91.test(data15)){
const err54 = {instancePath:instancePath+"/image/lqip",schemaPath:"#/$defs/AssetImage/properties/lqip/pattern",keyword:"pattern",params:{pattern: "^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$"},message:"must match pattern \""+"^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$"+"\""};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
else {
const err55 = {instancePath:instancePath+"/image/lqip",schemaPath:"#/$defs/AssetImage/properties/lqip/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
}
else {
const err56 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/AssetImage/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data.title !== undefined){
let data16 = data.title;
if(data16 && typeof data16 == "object" && !Array.isArray(data16)){
if(Object.keys(data16).length < 1){
const err57 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
for(const key2 in data16){
const _errs43 = errors;
if(typeof key2 === "string"){
if(!pattern11.test(key2)){
const err58 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\"",propertyName:key2};
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
const err59 = {instancePath:instancePath+"/title",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key2};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
var valid9 = _errs43 === errors;
if(!valid9){
const err60 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/propertyNames",keyword:"propertyNames",params:{propertyName: key2},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
for(const key3 in data16){
let data17 = data16[key3];
if(typeof data17 === "string"){
if(func2(data17) > 300){
const err61 = {instancePath:instancePath+"/title/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/title/additionalProperties/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(func2(data17) < 1){
const err62 = {instancePath:instancePath+"/title/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/title/additionalProperties/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
else {
const err63 = {instancePath:instancePath+"/title/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/title/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
else {
const err64 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data.alt !== undefined){
let data18 = data.alt;
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
if(Object.keys(data18).length < 1){
const err65 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
for(const key4 in data18){
const _errs51 = errors;
if(typeof key4 === "string"){
if(!pattern11.test(key4)){
const err66 = {instancePath:instancePath+"/alt",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\"",propertyName:key4};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
else {
const err67 = {instancePath:instancePath+"/alt",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key4};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
var valid12 = _errs51 === errors;
if(!valid12){
const err68 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/propertyNames",keyword:"propertyNames",params:{propertyName: key4},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
for(const key5 in data18){
let data19 = data18[key5];
if(typeof data19 === "string"){
if(func2(data19) > 500){
const err69 = {instancePath:instancePath+"/alt/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/alt/additionalProperties/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(func2(data19) < 1){
const err70 = {instancePath:instancePath+"/alt/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/alt/additionalProperties/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
else {
const err71 = {instancePath:instancePath+"/alt/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/alt/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
}
else {
const err72 = {instancePath:instancePath+"/alt",schemaPath:"#/properties/alt/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data.decorative !== undefined){
if(typeof data.decorative !== "boolean"){
const err73 = {instancePath:instancePath+"/decorative",schemaPath:"#/properties/decorative/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data.caption !== undefined){
let data21 = data.caption;
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
if(Object.keys(data21).length < 1){
const err74 = {instancePath:instancePath+"/caption",schemaPath:"#/properties/caption/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
for(const key6 in data21){
const _errs61 = errors;
if(typeof key6 === "string"){
if(!pattern11.test(key6)){
const err75 = {instancePath:instancePath+"/caption",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\"",propertyName:key6};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
else {
const err76 = {instancePath:instancePath+"/caption",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key6};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
var valid15 = _errs61 === errors;
if(!valid15){
const err77 = {instancePath:instancePath+"/caption",schemaPath:"#/properties/caption/propertyNames",keyword:"propertyNames",params:{propertyName: key6},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
for(const key7 in data21){
let data22 = data21[key7];
if(typeof data22 === "string"){
if(func2(data22) > 1000){
const err78 = {instancePath:instancePath+"/caption/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/caption/additionalProperties/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if(func2(data22) < 1){
const err79 = {instancePath:instancePath+"/caption/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/caption/additionalProperties/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
else {
const err80 = {instancePath:instancePath+"/caption/" + key7.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/caption/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
}
else {
const err81 = {instancePath:instancePath+"/caption",schemaPath:"#/properties/caption/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data.credit !== undefined){
let data23 = data.credit;
if(typeof data23 === "string"){
if(func2(data23) > 300){
const err82 = {instancePath:instancePath+"/credit",schemaPath:"#/properties/credit/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(func2(data23) < 1){
const err83 = {instancePath:instancePath+"/credit",schemaPath:"#/properties/credit/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
else {
const err84 = {instancePath:instancePath+"/credit",schemaPath:"#/properties/credit/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data.license !== undefined){
if(!(validate92(data.license, {instancePath:instancePath+"/license",parentData:data,parentDataProperty:"license",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate92.errors : vErrors.concat(validate92.errors);
errors = vErrors.length;
}
}
if(data.status !== undefined){
let data25 = data.status;
if(typeof data25 !== "string"){
const err85 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(!((data25 === "active") || (data25 === "retired"))){
const err86 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema198.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data.uploadedBy !== undefined){
if(!(validate94(data.uploadedBy, {instancePath:instancePath+"/uploadedBy",parentData:data,parentDataProperty:"uploadedBy",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate94.errors : vErrors.concat(validate94.errors);
errors = vErrors.length;
}
}
if(data.source !== undefined){
if(!(validate96(data.source, {instancePath:instancePath+"/source",parentData:data,parentDataProperty:"source",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate96.errors : vErrors.concat(validate96.errors);
errors = vErrors.length;
}
}
if(data.rev !== undefined){
let data28 = data.rev;
if(!(((typeof data28 == "number") && (!(data28 % 1) && !isNaN(data28))) && (isFinite(data28)))){
const err87 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
if((typeof data28 == "number") && (isFinite(data28))){
if(data28 < 0 || isNaN(data28)){
const err88 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
}
if(data.createdAt !== undefined){
let data29 = data.createdAt;
if(typeof data29 === "string"){
if(!(formats0.validate(data29))){
const err89 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
else {
const err90 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data30 = data.updatedAt;
if(typeof data30 === "string"){
if(!(formats0.validate(data30))){
const err91 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err92 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data.metadata !== undefined){
let data31 = data.metadata;
if(data31 && typeof data31 == "object" && !Array.isArray(data31)){
for(const key8 in data31){
if(typeof data31[key8] !== "string"){
const err93 = {instancePath:instancePath+"/metadata/" + key8.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
}
else {
const err94 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
}
}
else {
const err95 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
validate89.errors = vErrors;
return errors === 0;
}
validate89.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateMenu = validate98;
const schema226 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/menu.schema.json","title":"Menu","description":"A named navigation menu of a site (e.g. 'primary', 'footer', 'sidebar'): an ordered tree of items. Items point at pages, entries and terms by id, so renames and slug changes never break them; an item whose target is gone, retired or unpublished is hidden by the renderer, never rendered as a dead link (RFC-0003).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","key","maxDepth","items","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"key":{"$ref":"#/$defs/Slug","description":"Where themes place the menu ('primary', 'footer', 'sidebar', …). Unique per site and immutable once created."},"maxDepth":{"type":"integer","description":"Deepest level an item may sit at; top-level items are level 1. The store refuses deeper trees.","minimum":1,"maximum":6},"items":{"type":"array","description":"Top-level items in display order. Empty means the site deliberately shows no items here (a missing menu means the theme's derived default).","items":{"$ref":"#/$defs/MenuItem"},"maxItems":100},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"MenuItem":{"description":"One item, discriminated by `kind` (what it links to). Children, in display order, form the tree; an item has exactly one parent by construction, so the tree has no cycles.","oneOf":[{"type":"object","title":"PageMenuItem","description":"Links to a page by id; the label falls back to the page title.","additionalProperties":false,"required":["id","kind","pageId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["page"]},"pageId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"EntryMenuItem","description":"Links to a content entry by id (at /<collection>/<slug>); the label falls back to the entry title.","additionalProperties":false,"required":["id","kind","entryId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentEntry"]},"entryId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"TermMenuItem","description":"Links to a term's archive by term id; the label falls back to the term name in the locale.","additionalProperties":false,"required":["id","kind","termId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["term"]},"termId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"CollectionMenuItem","description":"Links to the index of a content collection, wherever the theme serves it. Collections have no node and no title, so labels are required.","additionalProperties":false,"required":["id","kind","collection","labels"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["collection"]},"collection":{"$ref":"#/$defs/Slug"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"UrlMenuItem","description":"Links to an external https URL. The host is ASCII (internationalised names in punycode) and carries no user-info, so a label cannot hide where the link goes.","additionalProperties":false,"required":["id","kind","href","labels"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["url"]},"href":{"type":"string","pattern":"^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$","maxLength":2048},"newTab":{"type":"boolean","description":"Open in a new tab (rendered with rel=\"noopener noreferrer\")."},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"GroupMenuItem","description":"A label without a link that holds other items: a dropdown parent or a sidebar section heading. Hidden when none of its children is shown.","additionalProperties":false,"required":["id","kind","labels","children"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["group"]},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}}]},"MenuLabels":{"type":"object","description":"Item label per locale; plain text, no control characters or surrounding whitespace. A locale without a label falls back to the default locale's label, then to the target's own title or name.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":100,"pattern":"^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$"}},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema227 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema228 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema230 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema244 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema245 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema247 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema231 = {"description":"One item, discriminated by `kind` (what it links to). Children, in display order, form the tree; an item has exactly one parent by construction, so the tree has no cycles.","oneOf":[{"type":"object","title":"PageMenuItem","description":"Links to a page by id; the label falls back to the page title.","additionalProperties":false,"required":["id","kind","pageId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["page"]},"pageId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"EntryMenuItem","description":"Links to a content entry by id (at /<collection>/<slug>); the label falls back to the entry title.","additionalProperties":false,"required":["id","kind","entryId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentEntry"]},"entryId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"TermMenuItem","description":"Links to a term's archive by term id; the label falls back to the term name in the locale.","additionalProperties":false,"required":["id","kind","termId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["term"]},"termId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"CollectionMenuItem","description":"Links to the index of a content collection, wherever the theme serves it. Collections have no node and no title, so labels are required.","additionalProperties":false,"required":["id","kind","collection","labels"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["collection"]},"collection":{"$ref":"#/$defs/Slug"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"UrlMenuItem","description":"Links to an external https URL. The host is ASCII (internationalised names in punycode) and carries no user-info, so a label cannot hide where the link goes.","additionalProperties":false,"required":["id","kind","href","labels"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["url"]},"href":{"type":"string","pattern":"^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$","maxLength":2048},"newTab":{"type":"boolean","description":"Open in a new tab (rendered with rel=\"noopener noreferrer\")."},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"GroupMenuItem","description":"A label without a link that holds other items: a dropdown parent or a sidebar section heading. Hidden when none of its children is shown.","additionalProperties":false,"required":["id","kind","labels","children"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["group"]},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}}]};
const pattern115 = new RegExp("^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$", "u");
const schema234 = {"type":"object","description":"Item label per locale; plain text, no control characters or surrounding whitespace. A locale without a label falls back to the default locale's label, then to the target's own title or name.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":100,"pattern":"^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$"}};
const schema235 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const pattern107 = new RegExp("^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$", "u");

function validate100(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate100.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(Object.keys(data).length < 1){
const err0 = {instancePath,schemaPath:"#/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
const _errs1 = errors;
if(typeof key0 === "string"){
if(!pattern11.test(key0)){
const err1 = {instancePath,schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\"",propertyName:key0};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
else {
const err2 = {instancePath,schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key0};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
var valid0 = _errs1 === errors;
if(!valid0){
const err3 = {instancePath,schemaPath:"#/propertyNames",keyword:"propertyNames",params:{propertyName: key0},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
for(const key1 in data){
let data0 = data[key1];
if(typeof data0 === "string"){
if(func2(data0) > 100){
const err4 = {instancePath:instancePath+"/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/additionalProperties/maxLength",keyword:"maxLength",params:{limit: 100},message:"must NOT have more than 100 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func2(data0) < 1){
const err5 = {instancePath:instancePath+"/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/additionalProperties/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern107.test(data0)){
const err6 = {instancePath:instancePath+"/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/additionalProperties/pattern",keyword:"pattern",params:{pattern: "^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$"},message:"must match pattern \""+"^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$"+"\""};
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
const err7 = {instancePath:instancePath+"/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate100.errors = vErrors;
return errors === 0;
}
validate100.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const wrapper0 = {validate: validate99};

function validate99(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate99.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.pageId === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "pageId"},message:"must have required property '"+"pageId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "kind")) || (key0 === "pageId")) || (key0 === "labels")) || (key0 === "children"))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err4 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func2(data0) < 8){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!pattern4.test(data0)){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(data1 === "page")){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema231.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.pageId !== undefined){
let data2 = data.pageId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err10 = {instancePath:instancePath+"/pageId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func2(data2) < 8){
const err11 = {instancePath:instancePath+"/pageId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!pattern4.test(data2)){
const err12 = {instancePath:instancePath+"/pageId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err13 = {instancePath:instancePath+"/pageId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.labels !== undefined){
if(!(validate100(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
errors = vErrors.length;
}
}
if(data.children !== undefined){
let data4 = data.children;
if(Array.isArray(data4)){
if(data4.length > 100){
const err14 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/0/properties/children/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data4.length < 1){
const err15 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/0/properties/children/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
if(!(wrapper0.validate(data4[i0], {instancePath:instancePath+"/children/" + i0,parentData:data4,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err16 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/0/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
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
const err17 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props1 = true;
}
const _errs16 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err18 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data.kind === undefined){
const err19 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data.entryId === undefined){
const err20 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "entryId"},message:"must have required property '"+"entryId"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
for(const key1 in data){
if(!(((((key1 === "id") || (key1 === "kind")) || (key1 === "entryId")) || (key1 === "labels")) || (key1 === "children"))){
const err21 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.id !== undefined){
let data6 = data.id;
if(typeof data6 === "string"){
if(func2(data6) > 48){
const err22 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(func2(data6) < 8){
const err23 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(!pattern4.test(data6)){
const err24 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.kind !== undefined){
let data7 = data.kind;
if(typeof data7 !== "string"){
const err26 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!(data7 === "contentEntry")){
const err27 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema231.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.entryId !== undefined){
let data8 = data.entryId;
if(typeof data8 === "string"){
if(func2(data8) > 48){
const err28 = {instancePath:instancePath+"/entryId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(func2(data8) < 8){
const err29 = {instancePath:instancePath+"/entryId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(!pattern4.test(data8)){
const err30 = {instancePath:instancePath+"/entryId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err31 = {instancePath:instancePath+"/entryId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.labels !== undefined){
if(!(validate100(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
errors = vErrors.length;
}
}
if(data.children !== undefined){
let data10 = data.children;
if(Array.isArray(data10)){
if(data10.length > 100){
const err32 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/1/properties/children/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(data10.length < 1){
const err33 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/1/properties/children/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len1 = data10.length;
for(let i1=0; i1<len1; i1++){
if(!(wrapper0.validate(data10[i1], {instancePath:instancePath+"/children/" + i1,parentData:data10,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err34 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/1/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
else {
const err35 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var _valid0 = _errs16 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props1 !== true){
props1 = true;
}
}
const _errs31 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err36 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data.kind === undefined){
const err37 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(data.termId === undefined){
const err38 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "termId"},message:"must have required property '"+"termId"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
for(const key2 in data){
if(!(((((key2 === "id") || (key2 === "kind")) || (key2 === "termId")) || (key2 === "labels")) || (key2 === "children"))){
const err39 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.id !== undefined){
let data12 = data.id;
if(typeof data12 === "string"){
if(func2(data12) > 48){
const err40 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(func2(data12) < 8){
const err41 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(!pattern4.test(data12)){
const err42 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.kind !== undefined){
let data13 = data.kind;
if(typeof data13 !== "string"){
const err44 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(!(data13 === "term")){
const err45 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema231.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data.termId !== undefined){
let data14 = data.termId;
if(typeof data14 === "string"){
if(func2(data14) > 48){
const err46 = {instancePath:instancePath+"/termId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(func2(data14) < 8){
const err47 = {instancePath:instancePath+"/termId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(!pattern4.test(data14)){
const err48 = {instancePath:instancePath+"/termId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
else {
const err49 = {instancePath:instancePath+"/termId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.labels !== undefined){
if(!(validate100(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
errors = vErrors.length;
}
}
if(data.children !== undefined){
let data16 = data.children;
if(Array.isArray(data16)){
if(data16.length > 100){
const err50 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/2/properties/children/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(data16.length < 1){
const err51 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/2/properties/children/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
const len2 = data16.length;
for(let i2=0; i2<len2; i2++){
if(!(wrapper0.validate(data16[i2], {instancePath:instancePath+"/children/" + i2,parentData:data16,parentDataProperty:i2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err52 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/2/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
}
else {
const err53 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
var _valid0 = _errs31 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props1 !== true){
props1 = true;
}
}
const _errs46 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err54 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(data.kind === undefined){
const err55 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(data.collection === undefined){
const err56 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "collection"},message:"must have required property '"+"collection"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data.labels === undefined){
const err57 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "labels"},message:"must have required property '"+"labels"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
for(const key3 in data){
if(!(((((key3 === "id") || (key3 === "kind")) || (key3 === "collection")) || (key3 === "labels")) || (key3 === "children"))){
const err58 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data.id !== undefined){
let data18 = data.id;
if(typeof data18 === "string"){
if(func2(data18) > 48){
const err59 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(func2(data18) < 8){
const err60 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(!pattern4.test(data18)){
const err61 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
else {
const err62 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
if(data.kind !== undefined){
let data19 = data.kind;
if(typeof data19 !== "string"){
const err63 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(!(data19 === "collection")){
const err64 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema231.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data.collection !== undefined){
let data20 = data.collection;
if(typeof data20 === "string"){
if(func2(data20) > 128){
const err65 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if(func2(data20) < 1){
const err66 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
if(!pattern5.test(data20)){
const err67 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
else {
const err68 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data.labels !== undefined){
if(!(validate100(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
errors = vErrors.length;
}
}
if(data.children !== undefined){
let data22 = data.children;
if(Array.isArray(data22)){
if(data22.length > 100){
const err69 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/3/properties/children/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(data22.length < 1){
const err70 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/3/properties/children/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
const len3 = data22.length;
for(let i3=0; i3<len3; i3++){
if(!(wrapper0.validate(data22[i3], {instancePath:instancePath+"/children/" + i3,parentData:data22,parentDataProperty:i3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err71 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/3/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
}
else {
const err72 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
var _valid0 = _errs46 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props1 !== true){
props1 = true;
}
}
const _errs61 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err73 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(data.kind === undefined){
const err74 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if(data.href === undefined){
const err75 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "href"},message:"must have required property '"+"href"+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(data.labels === undefined){
const err76 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "labels"},message:"must have required property '"+"labels"+"'"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
for(const key4 in data){
if(!((((((key4 === "id") || (key4 === "kind")) || (key4 === "href")) || (key4 === "newTab")) || (key4 === "labels")) || (key4 === "children"))){
const err77 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data.id !== undefined){
let data24 = data.id;
if(typeof data24 === "string"){
if(func2(data24) > 48){
const err78 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if(func2(data24) < 8){
const err79 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(!pattern4.test(data24)){
const err80 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err81 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data.kind !== undefined){
let data25 = data.kind;
if(typeof data25 !== "string"){
const err82 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(!(data25 === "url")){
const err83 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/enum",keyword:"enum",params:{allowedValues: schema231.oneOf[4].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
if(data.href !== undefined){
let data26 = data.href;
if(typeof data26 === "string"){
if(func2(data26) > 2048){
const err84 = {instancePath:instancePath+"/href",schemaPath:"#/oneOf/4/properties/href/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(!pattern115.test(data26)){
const err85 = {instancePath:instancePath+"/href",schemaPath:"#/oneOf/4/properties/href/pattern",keyword:"pattern",params:{pattern: "^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$"},message:"must match pattern \""+"^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$"+"\""};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
else {
const err86 = {instancePath:instancePath+"/href",schemaPath:"#/oneOf/4/properties/href/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data.newTab !== undefined){
if(typeof data.newTab !== "boolean"){
const err87 = {instancePath:instancePath+"/newTab",schemaPath:"#/oneOf/4/properties/newTab/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data.labels !== undefined){
if(!(validate100(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
errors = vErrors.length;
}
}
if(data.children !== undefined){
let data29 = data.children;
if(Array.isArray(data29)){
if(data29.length > 100){
const err88 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/4/properties/children/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if(data29.length < 1){
const err89 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/4/properties/children/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
const len4 = data29.length;
for(let i4=0; i4<len4; i4++){
if(!(wrapper0.validate(data29[i4], {instancePath:instancePath+"/children/" + i4,parentData:data29,parentDataProperty:i4,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err90 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/4/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
}
else {
const err91 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
var _valid0 = _errs61 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
if(props1 !== true){
props1 = true;
}
}
const _errs77 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err92 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
if(data.kind === undefined){
const err93 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
if(data.labels === undefined){
const err94 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "labels"},message:"must have required property '"+"labels"+"'"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(data.children === undefined){
const err95 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "children"},message:"must have required property '"+"children"+"'"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
for(const key5 in data){
if(!((((key5 === "id") || (key5 === "kind")) || (key5 === "labels")) || (key5 === "children"))){
const err96 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
if(data.id !== undefined){
let data31 = data.id;
if(typeof data31 === "string"){
if(func2(data31) > 48){
const err97 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
if(func2(data31) < 8){
const err98 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
if(!pattern4.test(data31)){
const err99 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
else {
const err100 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
if(data.kind !== undefined){
let data32 = data.kind;
if(typeof data32 !== "string"){
const err101 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/5/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if(!(data32 === "group")){
const err102 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/5/properties/kind/enum",keyword:"enum",params:{allowedValues: schema231.oneOf[5].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
if(data.labels !== undefined){
if(!(validate100(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
errors = vErrors.length;
}
}
if(data.children !== undefined){
let data34 = data.children;
if(Array.isArray(data34)){
if(data34.length > 100){
const err103 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/5/properties/children/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
if(data34.length < 1){
const err104 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/5/properties/children/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
const len5 = data34.length;
for(let i5=0; i5<len5; i5++){
if(!(wrapper0.validate(data34[i5], {instancePath:instancePath+"/children/" + i5,parentData:data34,parentDataProperty:i5,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
errors = vErrors.length;
}
}
}
else {
const err105 = {instancePath:instancePath+"/children",schemaPath:"#/oneOf/5/properties/children/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
}
else {
const err106 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
var _valid0 = _errs77 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
if(props1 !== true){
props1 = true;
}
}
}
}
}
}
}
if(!valid0){
const err107 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate99.errors = vErrors;
evaluated0.props = props1;
return errors === 0;
}
validate99.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate98(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/menu.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate98.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.key === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "key"},message:"must have required property '"+"key"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.maxDepth === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "maxDepth"},message:"must have required property '"+"maxDepth"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.items === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "items"},message:"must have required property '"+"items"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.rev === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.createdAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.updatedAt === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema226.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err10 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!(data0 === 1)){
const err11 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema227.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(func2(data1) < 8){
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!pattern4.test(data1)){
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err16 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func2(data2) < 8){
const err17 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!pattern4.test(data2)){
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err19 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.key !== undefined){
let data3 = data.key;
if(typeof data3 === "string"){
if(func2(data3) > 128){
const err20 = {instancePath:instancePath+"/key",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(func2(data3) < 1){
const err21 = {instancePath:instancePath+"/key",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(!pattern5.test(data3)){
const err22 = {instancePath:instancePath+"/key",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err23 = {instancePath:instancePath+"/key",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.maxDepth !== undefined){
let data4 = data.maxDepth;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err24 = {instancePath:instancePath+"/maxDepth",schemaPath:"#/properties/maxDepth/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 > 6 || isNaN(data4)){
const err25 = {instancePath:instancePath+"/maxDepth",schemaPath:"#/properties/maxDepth/maximum",keyword:"maximum",params:{comparison: "<=", limit: 6},message:"must be <= 6"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data4 < 1 || isNaN(data4)){
const err26 = {instancePath:instancePath+"/maxDepth",schemaPath:"#/properties/maxDepth/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
if(data.items !== undefined){
let data5 = data.items;
if(Array.isArray(data5)){
if(data5.length > 100){
const err27 = {instancePath:instancePath+"/items",schemaPath:"#/properties/items/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
if(!(validate99(data5[i0], {instancePath:instancePath+"/items/" + i0,parentData:data5,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate99.errors : vErrors.concat(validate99.errors);
errors = vErrors.length;
}
}
}
else {
const err28 = {instancePath:instancePath+"/items",schemaPath:"#/properties/items/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.rev !== undefined){
let data7 = data.rev;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err29 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 < 0 || isNaN(data7)){
const err30 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
if(data.createdAt !== undefined){
let data8 = data.createdAt;
if(typeof data8 === "string"){
if(!(formats0.validate(data8))){
const err31 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data9 = data.updatedAt;
if(typeof data9 === "string"){
if(!(formats0.validate(data9))){
const err33 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.metadata !== undefined){
let data10 = data.metadata;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
for(const key1 in data10){
if(typeof data10[key1] !== "string"){
const err35 = {instancePath:instancePath+"/metadata/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
else {
const err36 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
validate98.errors = vErrors;
return errors === 0;
}
validate98.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAnalyticsEvent = validate108;
const schema248 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/analytics-event.schema.json","title":"AnalyticsEvent","description":"One site analytics event as stored (RFC-0006): a page view or a Core Web Vitals sample reported by the site's first-party script, or a response the site Worker rendered itself (cache miss, redirect, 404, 410, 5xx). Written by the site Worker after it validated and enriched a beacon. The named fields are the columns of the local/self-host SQLite store; each one documents its fixed slot in a Workers Analytics Engine data point (index1 = siteId, blob1 = kind, blob2 = schemaVersion). Slots never move and new fields are only appended. Never carries an IP address, a user agent, a full referrer URL, a query string or a cookie.","oneOf":[{"type":"object","title":"AnalyticsPageviewEvent","description":"A published page, article or archive was shown to a visitor (the site's script ran).","additionalProperties":false,"required":["schemaVersion","kind","siteId","timestamp","path","nodeId","nodeKind","channel","entrance","device","browser","os","navType"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"kind":{"type":"string","enum":["pageview"]},"siteId":{"$ref":"#/$defs/Id","description":"WAE index1."},"timestamp":{"$ref":"#/$defs/Timestamp"},"path":{"$ref":"#/$defs/Path","description":"WAE blob3. The published route the view resolved to; never a query string."},"nodeId":{"$ref":"#/$defs/Id","description":"WAE blob4. The page, entry or term the server resolved the path to, so stats survive slug changes."},"nodeKind":{"$ref":"#/$defs/AnalyticsNodeKind"},"refHost":{"$ref":"#/$defs/AnalyticsHostname"},"channel":{"$ref":"#/$defs/AnalyticsChannel"},"utmSource":{"$ref":"#/$defs/AnalyticsUtmValue","description":"WAE blob8."},"utmMedium":{"$ref":"#/$defs/AnalyticsUtmValue","description":"WAE blob9."},"utmCampaign":{"$ref":"#/$defs/AnalyticsUtmValue","description":"WAE blob10."},"country":{"$ref":"#/$defs/AnalyticsCountry"},"device":{"$ref":"#/$defs/AnalyticsDevice"},"browser":{"$ref":"#/$defs/AnalyticsBrowser"},"os":{"$ref":"#/$defs/AnalyticsOs"},"visitor":{"$ref":"#/$defs/AnalyticsVisitorHash"},"navType":{"$ref":"#/$defs/AnalyticsNavType"},"locale":{"$ref":"#/$defs/Locale","description":"WAE blob17. Locale of the resolved node, not the visitor's Accept-Language."},"entrance":{"type":"boolean","description":"WAE double1 (1 or 0). The view starts a visit: the referrer is empty or another site, and the navigation is not a reload, back/forward or restore."},"privacySignal":{"type":"boolean","description":"WAE double10 (1 or 0). The beacon request carried Global Privacy Control (Sec-GPC: 1) or Do Not Track (DNT: 1), so no visitor hash was formed. Only this flag is kept, never which signal or any header. Absent means no signal (and on events written before the field existed)."}}},{"type":"object","title":"AnalyticsVitalsEvent","description":"Core Web Vitals of one sampled page view, measured by the site's own script and sent when the page is hidden. Code checks that at least one metric is present (the schema subset has no cross-property rules).","additionalProperties":false,"required":["schemaVersion","kind","siteId","timestamp","path","nodeId","nodeKind","device","sampleOneIn"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"kind":{"type":"string","enum":["vitals"]},"siteId":{"$ref":"#/$defs/Id","description":"WAE index1."},"timestamp":{"$ref":"#/$defs/Timestamp"},"path":{"$ref":"#/$defs/Path","description":"WAE blob3."},"nodeId":{"$ref":"#/$defs/Id","description":"WAE blob4."},"nodeKind":{"$ref":"#/$defs/AnalyticsNodeKind"},"country":{"$ref":"#/$defs/AnalyticsCountry"},"device":{"$ref":"#/$defs/AnalyticsDevice"},"browser":{"$ref":"#/$defs/AnalyticsBrowser"},"lcp":{"$ref":"#/$defs/AnalyticsMillis","description":"WAE double3. Largest Contentful Paint."},"inp":{"$ref":"#/$defs/AnalyticsMillis","description":"WAE double4. Interaction to Next Paint."},"cls":{"type":"number","description":"WAE double5, stored multiplied by 1000. Cumulative Layout Shift (unitless).","minimum":0,"maximum":100},"ttfb":{"$ref":"#/$defs/AnalyticsMillis","description":"WAE double6. Time to First Byte."},"fcp":{"$ref":"#/$defs/AnalyticsMillis","description":"WAE double7. First Contentful Paint."},"sampleOneIn":{"$ref":"#/$defs/AnalyticsSampleOneIn"}}},{"type":"object","title":"AnalyticsRenderEvent","description":"The site Worker answered a request itself (a cache miss, redirect, 404, 410 or error). Cache hits never run the Worker, so these are not page views. The requested path is visitor-controlled text and is always shown as such.","additionalProperties":false,"required":["schemaVersion","kind","siteId","timestamp","path","status","device"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"kind":{"type":"string","enum":["render"]},"siteId":{"$ref":"#/$defs/Id","description":"WAE index1."},"timestamp":{"$ref":"#/$defs/Timestamp"},"path":{"$ref":"#/$defs/AnalyticsRequestPath"},"status":{"type":"integer","description":"WAE double2. HTTP status the Worker answered with.","minimum":100,"maximum":599},"nodeId":{"$ref":"#/$defs/Id","description":"WAE blob4. The node rendered or redirected from, when the path resolved to one."},"nodeKind":{"$ref":"#/$defs/AnalyticsNodeKind"},"redirectTo":{"type":"string","description":"WAE blob19. Target of a 301, 302 or 308: a site path or an https URL, without query string.","pattern":"^(?:/|https://)[!-~]*$","maxLength":512},"refHost":{"$ref":"#/$defs/AnalyticsHostname"},"refPath":{"$ref":"#/$defs/Path","description":"WAE blob20. Same-site referrers only: the page that linked here, which finds broken internal links."},"country":{"$ref":"#/$defs/AnalyticsCountry"},"device":{"$ref":"#/$defs/AnalyticsDevice"},"crawler":{"$ref":"#/$defs/AnalyticsCrawlerName"},"renderMs":{"$ref":"#/$defs/AnalyticsMillis","description":"WAE double8. Time the Worker spent answering."},"sampleOneIn":{"$ref":"#/$defs/AnalyticsSampleOneIn"}}}],"$defs":{"AnalyticsBrowser":{"type":"string","description":"WAE blob13. Browser family, without version.","enum":["chrome","edge","firefox","safari","samsung","opera","other"]},"AnalyticsChannel":{"type":"string","description":"WAE blob7. Where the view came from, classified by the server from the referrer host and utm_medium; internal = another page of this site.","enum":["direct","internal","search","social","ai","email","paid","referral"]},"AnalyticsCountry":{"type":"string","description":"WAE blob11. ISO 3166-1 alpha-2 country from Cloudflare's request.cf.country (XX unknown, T1 Tor). Never a city or region.","pattern":"^[A-Z][A-Z0-9]$"},"AnalyticsCrawlerName":{"type":"string","description":"WAE blob18. A known crawler identified from the user agent (e.g. googlebot, gptbot, claudebot, perplexitybot). The list and each crawler's class (search, AI, social, monitor) live in code.","pattern":"^[a-z0-9][a-z0-9-]{0,31}$"},"AnalyticsDevice":{"type":"string","description":"WAE blob12. Device class derived from the user agent and client hints, neither of which is stored.","enum":["desktop","mobile","tablet","bot","unknown"]},"AnalyticsHostname":{"type":"string","description":"WAE blob6. Host of an external referrer: lower case, without www., port, path or query.","pattern":"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$","maxLength":253},"AnalyticsMillis":{"type":"integer","description":"Whole milliseconds (the server rounds), capped at ten minutes.","minimum":0,"maximum":600000},"AnalyticsNavType":{"type":"string","description":"WAE blob16. How the page was reached; restore = back/forward cache.","enum":["navigate","reload","back_forward","prerender","restore"]},"AnalyticsNodeKind":{"type":"string","description":"WAE blob5. The kind of node the path resolved to.","enum":["page","entry","archive"]},"AnalyticsOs":{"type":"string","description":"WAE blob14. Operating system family, without version.","enum":["windows","macos","ios","android","linux","chromeos","other"]},"AnalyticsRequestPath":{"type":"string","description":"WAE blob3. The requested path as received: percent-encoded printable ASCII, without query string or fragment, cut to 256 characters.","pattern":"^/[!-~]*$","maxLength":256},"AnalyticsSampleOneIn":{"type":"integer","description":"WAE double9. One in this many events of this kind was recorded (vitals sampling; render events under a flood); 1 = every event. Counts weight each event by this number. An integer, so a rate never suffers rounding.","minimum":1,"maximum":1000},"AnalyticsUtmValue":{"type":"string","description":"A normalised UTM value: lower case, a small alphabet, at most 64 characters. Values that do not fit are dropped, never stored as free text.","pattern":"^[a-z0-9][a-z0-9._+-]{0,63}$"},"AnalyticsVisitorHash":{"type":"string","description":"WAE blob15. Present only when the site owner turned on unique visitors and the request carried no GPC or DNT signal: the first 64 bits of SHA-256(dailySalt ‖ siteId ‖ ip ‖ userAgent) in hex. The salt is random, lives for one UTC day and is then deleted, so the hash can neither be recomputed nor linked across days.","pattern":"^[0-9a-f]{16}$"},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Path":{"type":"string","description":"Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema249 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema250 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema251 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema252 = {"type":"string","description":"Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024};
const schema254 = {"type":"string","description":"WAE blob5. The kind of node the path resolved to.","enum":["page","entry","archive"]};
const schema255 = {"type":"string","description":"WAE blob6. Host of an external referrer: lower case, without www., port, path or query.","pattern":"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$","maxLength":253};
const schema256 = {"type":"string","description":"WAE blob7. Where the view came from, classified by the server from the referrer host and utm_medium; internal = another page of this site.","enum":["direct","internal","search","social","ai","email","paid","referral"]};
const schema257 = {"type":"string","description":"A normalised UTM value: lower case, a small alphabet, at most 64 characters. Values that do not fit are dropped, never stored as free text.","pattern":"^[a-z0-9][a-z0-9._+-]{0,63}$"};
const schema260 = {"type":"string","description":"WAE blob11. ISO 3166-1 alpha-2 country from Cloudflare's request.cf.country (XX unknown, T1 Tor). Never a city or region.","pattern":"^[A-Z][A-Z0-9]$"};
const schema261 = {"type":"string","description":"WAE blob12. Device class derived from the user agent and client hints, neither of which is stored.","enum":["desktop","mobile","tablet","bot","unknown"]};
const schema262 = {"type":"string","description":"WAE blob13. Browser family, without version.","enum":["chrome","edge","firefox","safari","samsung","opera","other"]};
const schema263 = {"type":"string","description":"WAE blob14. Operating system family, without version.","enum":["windows","macos","ios","android","linux","chromeos","other"]};
const schema264 = {"type":"string","description":"WAE blob15. Present only when the site owner turned on unique visitors and the request carried no GPC or DNT signal: the first 64 bits of SHA-256(dailySalt ‖ siteId ‖ ip ‖ userAgent) in hex. The salt is random, lives for one UTC day and is then deleted, so the hash can neither be recomputed nor linked across days.","pattern":"^[0-9a-f]{16}$"};
const schema265 = {"type":"string","description":"WAE blob16. How the page was reached; restore = back/forward cache.","enum":["navigate","reload","back_forward","prerender","restore"]};
const schema266 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema276 = {"type":"integer","description":"Whole milliseconds (the server rounds), capped at ten minutes.","minimum":0,"maximum":600000};
const schema280 = {"type":"integer","description":"WAE double9. One in this many events of this kind was recorded (vitals sampling; render events under a flood); 1 = every event. Counts weight each event by this number. An integer, so a rate never suffers rounding.","minimum":1,"maximum":1000};
const schema284 = {"type":"string","description":"WAE blob3. The requested path as received: percent-encoded printable ASCII, without query string or fragment, cut to 256 characters.","pattern":"^/[!-~]*$","maxLength":256};
const schema291 = {"type":"string","description":"WAE blob18. A known crawler identified from the user agent (e.g. googlebot, gptbot, claudebot, perplexitybot). The list and each crawler's class (search, AI, social, monitor) live in code.","pattern":"^[a-z0-9][a-z0-9-]{0,31}$"};
const pattern121 = new RegExp("^[a-z0-9][a-z0-9._+-]{0,63}$", "u");
const pattern124 = new RegExp("^[A-Z][A-Z0-9]$", "u");
const pattern125 = new RegExp("^[0-9a-f]{16}$", "u");
const pattern132 = new RegExp("^/[!-~]*$", "u");
const pattern134 = new RegExp("^(?:/|https://)[!-~]*$", "u");
const pattern138 = new RegExp("^[a-z0-9][a-z0-9-]{0,31}$", "u");

function validate108(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/analytics-event.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate108.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.timestamp === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "timestamp"},message:"must have required property '"+"timestamp"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.path === undefined){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.nodeId === undefined){
const err5 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.nodeKind === undefined){
const err6 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "nodeKind"},message:"must have required property '"+"nodeKind"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.channel === undefined){
const err7 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "channel"},message:"must have required property '"+"channel"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.entrance === undefined){
const err8 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "entrance"},message:"must have required property '"+"entrance"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.device === undefined){
const err9 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "device"},message:"must have required property '"+"device"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.browser === undefined){
const err10 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "browser"},message:"must have required property '"+"browser"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.os === undefined){
const err11 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "os"},message:"must have required property '"+"os"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.navType === undefined){
const err12 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "navType"},message:"must have required property '"+"navType"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema248.oneOf[0].properties, key0))){
const err13 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err14 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(data0 === 1)){
const err15 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema249.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err16 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(data1 === "pageview")){
const err17 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema248.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data2) < 8){
const err19 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern4.test(data2)){
const err20 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err21 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.timestamp !== undefined){
let data3 = data.timestamp;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err22 = {instancePath:instancePath+"/timestamp",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err23 = {instancePath:instancePath+"/timestamp",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.path !== undefined){
let data4 = data.path;
if(typeof data4 === "string"){
if(func2(data4) > 1024){
const err24 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/Path/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(!pattern21.test(data4)){
const err25 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/Path/pattern",keyword:"pattern",params:{pattern: "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"},message:"must match pattern \""+"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/Path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.nodeId !== undefined){
let data5 = data.nodeId;
if(typeof data5 === "string"){
if(func2(data5) > 48){
const err27 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(func2(data5) < 8){
const err28 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(!pattern4.test(data5)){
const err29 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.nodeKind !== undefined){
let data6 = data.nodeKind;
if(typeof data6 !== "string"){
const err31 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/AnalyticsNodeKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(!(((data6 === "page") || (data6 === "entry")) || (data6 === "archive"))){
const err32 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/AnalyticsNodeKind/enum",keyword:"enum",params:{allowedValues: schema254.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.refHost !== undefined){
let data7 = data.refHost;
if(typeof data7 === "string"){
if(func2(data7) > 253){
const err33 = {instancePath:instancePath+"/refHost",schemaPath:"#/$defs/AnalyticsHostname/maxLength",keyword:"maxLength",params:{limit: 253},message:"must NOT have more than 253 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(!pattern13.test(data7)){
const err34 = {instancePath:instancePath+"/refHost",schemaPath:"#/$defs/AnalyticsHostname/pattern",keyword:"pattern",params:{pattern: "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},message:"must match pattern \""+"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/refHost",schemaPath:"#/$defs/AnalyticsHostname/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data.channel !== undefined){
let data8 = data.channel;
if(typeof data8 !== "string"){
const err36 = {instancePath:instancePath+"/channel",schemaPath:"#/$defs/AnalyticsChannel/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(!((((((((data8 === "direct") || (data8 === "internal")) || (data8 === "search")) || (data8 === "social")) || (data8 === "ai")) || (data8 === "email")) || (data8 === "paid")) || (data8 === "referral"))){
const err37 = {instancePath:instancePath+"/channel",schemaPath:"#/$defs/AnalyticsChannel/enum",keyword:"enum",params:{allowedValues: schema256.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.utmSource !== undefined){
let data9 = data.utmSource;
if(typeof data9 === "string"){
if(!pattern121.test(data9)){
const err38 = {instancePath:instancePath+"/utmSource",schemaPath:"#/$defs/AnalyticsUtmValue/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9._+-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9._+-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/utmSource",schemaPath:"#/$defs/AnalyticsUtmValue/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.utmMedium !== undefined){
let data10 = data.utmMedium;
if(typeof data10 === "string"){
if(!pattern121.test(data10)){
const err40 = {instancePath:instancePath+"/utmMedium",schemaPath:"#/$defs/AnalyticsUtmValue/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9._+-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9._+-]{0,63}$"+"\""};
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
const err41 = {instancePath:instancePath+"/utmMedium",schemaPath:"#/$defs/AnalyticsUtmValue/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.utmCampaign !== undefined){
let data11 = data.utmCampaign;
if(typeof data11 === "string"){
if(!pattern121.test(data11)){
const err42 = {instancePath:instancePath+"/utmCampaign",schemaPath:"#/$defs/AnalyticsUtmValue/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9._+-]{0,63}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9._+-]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/utmCampaign",schemaPath:"#/$defs/AnalyticsUtmValue/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.country !== undefined){
let data12 = data.country;
if(typeof data12 === "string"){
if(!pattern124.test(data12)){
const err44 = {instancePath:instancePath+"/country",schemaPath:"#/$defs/AnalyticsCountry/pattern",keyword:"pattern",params:{pattern: "^[A-Z][A-Z0-9]$"},message:"must match pattern \""+"^[A-Z][A-Z0-9]$"+"\""};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
else {
const err45 = {instancePath:instancePath+"/country",schemaPath:"#/$defs/AnalyticsCountry/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data.device !== undefined){
let data13 = data.device;
if(typeof data13 !== "string"){
const err46 = {instancePath:instancePath+"/device",schemaPath:"#/$defs/AnalyticsDevice/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(!(((((data13 === "desktop") || (data13 === "mobile")) || (data13 === "tablet")) || (data13 === "bot")) || (data13 === "unknown"))){
const err47 = {instancePath:instancePath+"/device",schemaPath:"#/$defs/AnalyticsDevice/enum",keyword:"enum",params:{allowedValues: schema261.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data.browser !== undefined){
let data14 = data.browser;
if(typeof data14 !== "string"){
const err48 = {instancePath:instancePath+"/browser",schemaPath:"#/$defs/AnalyticsBrowser/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(!(((((((data14 === "chrome") || (data14 === "edge")) || (data14 === "firefox")) || (data14 === "safari")) || (data14 === "samsung")) || (data14 === "opera")) || (data14 === "other"))){
const err49 = {instancePath:instancePath+"/browser",schemaPath:"#/$defs/AnalyticsBrowser/enum",keyword:"enum",params:{allowedValues: schema262.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.os !== undefined){
let data15 = data.os;
if(typeof data15 !== "string"){
const err50 = {instancePath:instancePath+"/os",schemaPath:"#/$defs/AnalyticsOs/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(!(((((((data15 === "windows") || (data15 === "macos")) || (data15 === "ios")) || (data15 === "android")) || (data15 === "linux")) || (data15 === "chromeos")) || (data15 === "other"))){
const err51 = {instancePath:instancePath+"/os",schemaPath:"#/$defs/AnalyticsOs/enum",keyword:"enum",params:{allowedValues: schema263.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.visitor !== undefined){
let data16 = data.visitor;
if(typeof data16 === "string"){
if(!pattern125.test(data16)){
const err52 = {instancePath:instancePath+"/visitor",schemaPath:"#/$defs/AnalyticsVisitorHash/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{16}$"},message:"must match pattern \""+"^[0-9a-f]{16}$"+"\""};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
else {
const err53 = {instancePath:instancePath+"/visitor",schemaPath:"#/$defs/AnalyticsVisitorHash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data.navType !== undefined){
let data17 = data.navType;
if(typeof data17 !== "string"){
const err54 = {instancePath:instancePath+"/navType",schemaPath:"#/$defs/AnalyticsNavType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!(((((data17 === "navigate") || (data17 === "reload")) || (data17 === "back_forward")) || (data17 === "prerender")) || (data17 === "restore"))){
const err55 = {instancePath:instancePath+"/navType",schemaPath:"#/$defs/AnalyticsNavType/enum",keyword:"enum",params:{allowedValues: schema265.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data.locale !== undefined){
let data18 = data.locale;
if(typeof data18 === "string"){
if(!pattern11.test(data18)){
const err56 = {instancePath:instancePath+"/locale",schemaPath:"#/$defs/Locale/pattern",keyword:"pattern",params:{pattern: "^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},message:"must match pattern \""+"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"+"\""};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
else {
const err57 = {instancePath:instancePath+"/locale",schemaPath:"#/$defs/Locale/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data.entrance !== undefined){
if(typeof data.entrance !== "boolean"){
const err58 = {instancePath:instancePath+"/entrance",schemaPath:"#/oneOf/0/properties/entrance/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data.privacySignal !== undefined){
if(typeof data.privacySignal !== "boolean"){
const err59 = {instancePath:instancePath+"/privacySignal",schemaPath:"#/oneOf/0/properties/privacySignal/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
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
const err60 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs64 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err61 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(data.kind === undefined){
const err62 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(data.siteId === undefined){
const err63 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(data.timestamp === undefined){
const err64 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "timestamp"},message:"must have required property '"+"timestamp"+"'"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(data.path === undefined){
const err65 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if(data.nodeId === undefined){
const err66 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
if(data.nodeKind === undefined){
const err67 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "nodeKind"},message:"must have required property '"+"nodeKind"+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
if(data.device === undefined){
const err68 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "device"},message:"must have required property '"+"device"+"'"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if(data.sampleOneIn === undefined){
const err69 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "sampleOneIn"},message:"must have required property '"+"sampleOneIn"+"'"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
for(const key1 in data){
if(!(func1.call(schema248.oneOf[1].properties, key1))){
const err70 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data21 = data.schemaVersion;
if(!(((typeof data21 == "number") && (!(data21 % 1) && !isNaN(data21))) && (isFinite(data21)))){
const err71 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(!(data21 === 1)){
const err72 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema249.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data.kind !== undefined){
let data22 = data.kind;
if(typeof data22 !== "string"){
const err73 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(!(data22 === "vitals")){
const err74 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema248.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data.siteId !== undefined){
let data23 = data.siteId;
if(typeof data23 === "string"){
if(func2(data23) > 48){
const err75 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(func2(data23) < 8){
const err76 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
if(!pattern4.test(data23)){
const err77 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
else {
const err78 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.timestamp !== undefined){
let data24 = data.timestamp;
if(typeof data24 === "string"){
if(!(formats0.validate(data24))){
const err79 = {instancePath:instancePath+"/timestamp",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
else {
const err80 = {instancePath:instancePath+"/timestamp",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
if(data.path !== undefined){
let data25 = data.path;
if(typeof data25 === "string"){
if(func2(data25) > 1024){
const err81 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/Path/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
if(!pattern21.test(data25)){
const err82 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/Path/pattern",keyword:"pattern",params:{pattern: "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"},message:"must match pattern \""+"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"+"\""};
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
const err83 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/Path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
if(data.nodeId !== undefined){
let data26 = data.nodeId;
if(typeof data26 === "string"){
if(func2(data26) > 48){
const err84 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(func2(data26) < 8){
const err85 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(!pattern4.test(data26)){
const err86 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
else {
const err87 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data.nodeKind !== undefined){
let data27 = data.nodeKind;
if(typeof data27 !== "string"){
const err88 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/AnalyticsNodeKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if(!(((data27 === "page") || (data27 === "entry")) || (data27 === "archive"))){
const err89 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/AnalyticsNodeKind/enum",keyword:"enum",params:{allowedValues: schema254.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data.country !== undefined){
let data28 = data.country;
if(typeof data28 === "string"){
if(!pattern124.test(data28)){
const err90 = {instancePath:instancePath+"/country",schemaPath:"#/$defs/AnalyticsCountry/pattern",keyword:"pattern",params:{pattern: "^[A-Z][A-Z0-9]$"},message:"must match pattern \""+"^[A-Z][A-Z0-9]$"+"\""};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
else {
const err91 = {instancePath:instancePath+"/country",schemaPath:"#/$defs/AnalyticsCountry/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
if(data.device !== undefined){
let data29 = data.device;
if(typeof data29 !== "string"){
const err92 = {instancePath:instancePath+"/device",schemaPath:"#/$defs/AnalyticsDevice/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
if(!(((((data29 === "desktop") || (data29 === "mobile")) || (data29 === "tablet")) || (data29 === "bot")) || (data29 === "unknown"))){
const err93 = {instancePath:instancePath+"/device",schemaPath:"#/$defs/AnalyticsDevice/enum",keyword:"enum",params:{allowedValues: schema261.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
if(data.browser !== undefined){
let data30 = data.browser;
if(typeof data30 !== "string"){
const err94 = {instancePath:instancePath+"/browser",schemaPath:"#/$defs/AnalyticsBrowser/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(!(((((((data30 === "chrome") || (data30 === "edge")) || (data30 === "firefox")) || (data30 === "safari")) || (data30 === "samsung")) || (data30 === "opera")) || (data30 === "other"))){
const err95 = {instancePath:instancePath+"/browser",schemaPath:"#/$defs/AnalyticsBrowser/enum",keyword:"enum",params:{allowedValues: schema262.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
if(data.lcp !== undefined){
let data31 = data.lcp;
if(!(((typeof data31 == "number") && (!(data31 % 1) && !isNaN(data31))) && (isFinite(data31)))){
const err96 = {instancePath:instancePath+"/lcp",schemaPath:"#/$defs/AnalyticsMillis/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
if((typeof data31 == "number") && (isFinite(data31))){
if(data31 > 600000 || isNaN(data31)){
const err97 = {instancePath:instancePath+"/lcp",schemaPath:"#/$defs/AnalyticsMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
if(data31 < 0 || isNaN(data31)){
const err98 = {instancePath:instancePath+"/lcp",schemaPath:"#/$defs/AnalyticsMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
}
if(data.inp !== undefined){
let data32 = data.inp;
if(!(((typeof data32 == "number") && (!(data32 % 1) && !isNaN(data32))) && (isFinite(data32)))){
const err99 = {instancePath:instancePath+"/inp",schemaPath:"#/$defs/AnalyticsMillis/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if((typeof data32 == "number") && (isFinite(data32))){
if(data32 > 600000 || isNaN(data32)){
const err100 = {instancePath:instancePath+"/inp",schemaPath:"#/$defs/AnalyticsMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
if(data32 < 0 || isNaN(data32)){
const err101 = {instancePath:instancePath+"/inp",schemaPath:"#/$defs/AnalyticsMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
}
if(data.cls !== undefined){
let data33 = data.cls;
if((typeof data33 == "number") && (isFinite(data33))){
if(data33 > 100 || isNaN(data33)){
const err102 = {instancePath:instancePath+"/cls",schemaPath:"#/oneOf/1/properties/cls/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
if(data33 < 0 || isNaN(data33)){
const err103 = {instancePath:instancePath+"/cls",schemaPath:"#/oneOf/1/properties/cls/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
else {
const err104 = {instancePath:instancePath+"/cls",schemaPath:"#/oneOf/1/properties/cls/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
if(data.ttfb !== undefined){
let data34 = data.ttfb;
if(!(((typeof data34 == "number") && (!(data34 % 1) && !isNaN(data34))) && (isFinite(data34)))){
const err105 = {instancePath:instancePath+"/ttfb",schemaPath:"#/$defs/AnalyticsMillis/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
if((typeof data34 == "number") && (isFinite(data34))){
if(data34 > 600000 || isNaN(data34)){
const err106 = {instancePath:instancePath+"/ttfb",schemaPath:"#/$defs/AnalyticsMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
if(data34 < 0 || isNaN(data34)){
const err107 = {instancePath:instancePath+"/ttfb",schemaPath:"#/$defs/AnalyticsMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
}
}
if(data.fcp !== undefined){
let data35 = data.fcp;
if(!(((typeof data35 == "number") && (!(data35 % 1) && !isNaN(data35))) && (isFinite(data35)))){
const err108 = {instancePath:instancePath+"/fcp",schemaPath:"#/$defs/AnalyticsMillis/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
if((typeof data35 == "number") && (isFinite(data35))){
if(data35 > 600000 || isNaN(data35)){
const err109 = {instancePath:instancePath+"/fcp",schemaPath:"#/$defs/AnalyticsMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
if(data35 < 0 || isNaN(data35)){
const err110 = {instancePath:instancePath+"/fcp",schemaPath:"#/$defs/AnalyticsMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
}
if(data.sampleOneIn !== undefined){
let data36 = data.sampleOneIn;
if(!(((typeof data36 == "number") && (!(data36 % 1) && !isNaN(data36))) && (isFinite(data36)))){
const err111 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/$defs/AnalyticsSampleOneIn/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
if((typeof data36 == "number") && (isFinite(data36))){
if(data36 > 1000 || isNaN(data36)){
const err112 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/$defs/AnalyticsSampleOneIn/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1000},message:"must be <= 1000"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if(data36 < 1 || isNaN(data36)){
const err113 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/$defs/AnalyticsSampleOneIn/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
}
}
}
else {
const err114 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
var _valid0 = _errs64 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs113 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err115 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
if(data.kind === undefined){
const err116 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
if(data.siteId === undefined){
const err117 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
if(data.timestamp === undefined){
const err118 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "timestamp"},message:"must have required property '"+"timestamp"+"'"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
if(data.path === undefined){
const err119 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
if(data.status === undefined){
const err120 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
if(data.device === undefined){
const err121 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "device"},message:"must have required property '"+"device"+"'"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
for(const key2 in data){
if(!(func1.call(schema248.oneOf[2].properties, key2))){
const err122 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data37 = data.schemaVersion;
if(!(((typeof data37 == "number") && (!(data37 % 1) && !isNaN(data37))) && (isFinite(data37)))){
const err123 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
if(!(data37 === 1)){
const err124 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema249.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
}
if(data.kind !== undefined){
let data38 = data.kind;
if(typeof data38 !== "string"){
const err125 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
if(!(data38 === "render")){
const err126 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema248.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
if(data.siteId !== undefined){
let data39 = data.siteId;
if(typeof data39 === "string"){
if(func2(data39) > 48){
const err127 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
if(func2(data39) < 8){
const err128 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
if(!pattern4.test(data39)){
const err129 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
}
else {
const err130 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
}
if(data.timestamp !== undefined){
let data40 = data.timestamp;
if(typeof data40 === "string"){
if(!(formats0.validate(data40))){
const err131 = {instancePath:instancePath+"/timestamp",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
}
else {
const err132 = {instancePath:instancePath+"/timestamp",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
}
if(data.path !== undefined){
let data41 = data.path;
if(typeof data41 === "string"){
if(func2(data41) > 256){
const err133 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/AnalyticsRequestPath/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if(!pattern132.test(data41)){
const err134 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/AnalyticsRequestPath/pattern",keyword:"pattern",params:{pattern: "^/[!-~]*$"},message:"must match pattern \""+"^/[!-~]*$"+"\""};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
}
else {
const err135 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/AnalyticsRequestPath/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
}
if(data.status !== undefined){
let data42 = data.status;
if(!(((typeof data42 == "number") && (!(data42 % 1) && !isNaN(data42))) && (isFinite(data42)))){
const err136 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
if((typeof data42 == "number") && (isFinite(data42))){
if(data42 > 599 || isNaN(data42)){
const err137 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/maximum",keyword:"maximum",params:{comparison: "<=", limit: 599},message:"must be <= 599"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
if(data42 < 100 || isNaN(data42)){
const err138 = {instancePath:instancePath+"/status",schemaPath:"#/oneOf/2/properties/status/minimum",keyword:"minimum",params:{comparison: ">=", limit: 100},message:"must be >= 100"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
}
if(data.nodeId !== undefined){
let data43 = data.nodeId;
if(typeof data43 === "string"){
if(func2(data43) > 48){
const err139 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
if(func2(data43) < 8){
const err140 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
if(!pattern4.test(data43)){
const err141 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
}
else {
const err142 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
}
if(data.nodeKind !== undefined){
let data44 = data.nodeKind;
if(typeof data44 !== "string"){
const err143 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/AnalyticsNodeKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
if(!(((data44 === "page") || (data44 === "entry")) || (data44 === "archive"))){
const err144 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/AnalyticsNodeKind/enum",keyword:"enum",params:{allowedValues: schema254.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
}
if(data.redirectTo !== undefined){
let data45 = data.redirectTo;
if(typeof data45 === "string"){
if(func2(data45) > 512){
const err145 = {instancePath:instancePath+"/redirectTo",schemaPath:"#/oneOf/2/properties/redirectTo/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
if(!pattern134.test(data45)){
const err146 = {instancePath:instancePath+"/redirectTo",schemaPath:"#/oneOf/2/properties/redirectTo/pattern",keyword:"pattern",params:{pattern: "^(?:/|https://)[!-~]*$"},message:"must match pattern \""+"^(?:/|https://)[!-~]*$"+"\""};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
}
else {
const err147 = {instancePath:instancePath+"/redirectTo",schemaPath:"#/oneOf/2/properties/redirectTo/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
}
if(data.refHost !== undefined){
let data46 = data.refHost;
if(typeof data46 === "string"){
if(func2(data46) > 253){
const err148 = {instancePath:instancePath+"/refHost",schemaPath:"#/$defs/AnalyticsHostname/maxLength",keyword:"maxLength",params:{limit: 253},message:"must NOT have more than 253 characters"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
if(!pattern13.test(data46)){
const err149 = {instancePath:instancePath+"/refHost",schemaPath:"#/$defs/AnalyticsHostname/pattern",keyword:"pattern",params:{pattern: "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"},message:"must match pattern \""+"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$"+"\""};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
}
else {
const err150 = {instancePath:instancePath+"/refHost",schemaPath:"#/$defs/AnalyticsHostname/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
}
if(data.refPath !== undefined){
let data47 = data.refPath;
if(typeof data47 === "string"){
if(func2(data47) > 1024){
const err151 = {instancePath:instancePath+"/refPath",schemaPath:"#/$defs/Path/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
if(!pattern21.test(data47)){
const err152 = {instancePath:instancePath+"/refPath",schemaPath:"#/$defs/Path/pattern",keyword:"pattern",params:{pattern: "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"},message:"must match pattern \""+"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$"+"\""};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
}
else {
const err153 = {instancePath:instancePath+"/refPath",schemaPath:"#/$defs/Path/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
}
if(data.country !== undefined){
let data48 = data.country;
if(typeof data48 === "string"){
if(!pattern124.test(data48)){
const err154 = {instancePath:instancePath+"/country",schemaPath:"#/$defs/AnalyticsCountry/pattern",keyword:"pattern",params:{pattern: "^[A-Z][A-Z0-9]$"},message:"must match pattern \""+"^[A-Z][A-Z0-9]$"+"\""};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
}
else {
const err155 = {instancePath:instancePath+"/country",schemaPath:"#/$defs/AnalyticsCountry/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
}
if(data.device !== undefined){
let data49 = data.device;
if(typeof data49 !== "string"){
const err156 = {instancePath:instancePath+"/device",schemaPath:"#/$defs/AnalyticsDevice/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
if(!(((((data49 === "desktop") || (data49 === "mobile")) || (data49 === "tablet")) || (data49 === "bot")) || (data49 === "unknown"))){
const err157 = {instancePath:instancePath+"/device",schemaPath:"#/$defs/AnalyticsDevice/enum",keyword:"enum",params:{allowedValues: schema261.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
}
if(data.crawler !== undefined){
let data50 = data.crawler;
if(typeof data50 === "string"){
if(!pattern138.test(data50)){
const err158 = {instancePath:instancePath+"/crawler",schemaPath:"#/$defs/AnalyticsCrawlerName/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9][a-z0-9-]{0,31}$"},message:"must match pattern \""+"^[a-z0-9][a-z0-9-]{0,31}$"+"\""};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
}
else {
const err159 = {instancePath:instancePath+"/crawler",schemaPath:"#/$defs/AnalyticsCrawlerName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
}
if(data.renderMs !== undefined){
let data51 = data.renderMs;
if(!(((typeof data51 == "number") && (!(data51 % 1) && !isNaN(data51))) && (isFinite(data51)))){
const err160 = {instancePath:instancePath+"/renderMs",schemaPath:"#/$defs/AnalyticsMillis/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
if((typeof data51 == "number") && (isFinite(data51))){
if(data51 > 600000 || isNaN(data51)){
const err161 = {instancePath:instancePath+"/renderMs",schemaPath:"#/$defs/AnalyticsMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
if(data51 < 0 || isNaN(data51)){
const err162 = {instancePath:instancePath+"/renderMs",schemaPath:"#/$defs/AnalyticsMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
}
}
if(data.sampleOneIn !== undefined){
let data52 = data.sampleOneIn;
if(!(((typeof data52 == "number") && (!(data52 % 1) && !isNaN(data52))) && (isFinite(data52)))){
const err163 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/$defs/AnalyticsSampleOneIn/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
if((typeof data52 == "number") && (isFinite(data52))){
if(data52 > 1000 || isNaN(data52)){
const err164 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/$defs/AnalyticsSampleOneIn/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1000},message:"must be <= 1000"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
if(data52 < 1 || isNaN(data52)){
const err165 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/$defs/AnalyticsSampleOneIn/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
}
}
}
else {
const err166 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
var _valid0 = _errs113 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
}
}
if(!valid0){
const err167 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate108.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate108.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateAnalyticsBeacon = validate109;
const schema294 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/analytics-beacon.schema.json","title":"AnalyticsBeacon","description":"What a site's first-party analytics script sends to POST /__cloudhal/e (RFC-0006): JSON as text/plain, at most 2 KB. Everything in it is untrusted. The server keeps a beacon only after the same-origin, bot and rate checks, normalises the path and resolves it to a published route, reduces the referrer to a host, normalises UTM values, and derives everything else (node, country, device, visitor) itself. The script never sends an identifier, a cookie or a full URL.","oneOf":[{"type":"object","title":"AnalyticsPageviewBeacon","description":"Sent once per page view, when the page is first visible (after prerendering, and again on a back/forward cache restore).","additionalProperties":false,"required":["schemaVersion","kind","path"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"kind":{"type":"string","enum":["pageview"]},"path":{"$ref":"#/$defs/BeaconPath"},"referrer":{"type":"string","description":"The host of document.referrer only (the script drops scheme, path and query); empty or absent for direct visits.","maxLength":253},"utmSource":{"$ref":"#/$defs/BeaconUtm"},"utmMedium":{"$ref":"#/$defs/BeaconUtm"},"utmCampaign":{"$ref":"#/$defs/BeaconUtm"},"navType":{"type":"string","enum":["navigate","reload","back_forward","prerender","restore"]}}},{"type":"object","title":"AnalyticsVitalsBeacon","description":"Sent once, when a sampled page view is hidden, with the Core Web Vitals measured so far.","additionalProperties":false,"required":["schemaVersion","kind","path","sampleOneIn"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"kind":{"type":"string","enum":["vitals"]},"path":{"$ref":"#/$defs/BeaconPath"},"lcp":{"$ref":"#/$defs/BeaconMillis"},"inp":{"$ref":"#/$defs/BeaconMillis"},"cls":{"type":"number","minimum":0,"maximum":100},"ttfb":{"$ref":"#/$defs/BeaconMillis"},"fcp":{"$ref":"#/$defs/BeaconMillis"},"sampleOneIn":{"type":"integer","description":"The vitals sampling the script was served with (one page view in N); the server checks it against the site's setting.","minimum":1,"maximum":1000}}}],"$defs":{"BeaconMillis":{"type":"number","minimum":0,"maximum":600000},"BeaconPath":{"type":"string","description":"location.pathname as the browser reports it (no query string, no fragment).","pattern":"^/[^?#\\s]*$","maxLength":1024},"BeaconUtm":{"type":"string","description":"A raw utm_* value from the page URL; the server lower-cases it and drops it unless it fits the stored alphabet.","minLength":1,"maxLength":128},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]}}};
const schema295 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema296 = {"type":"string","description":"location.pathname as the browser reports it (no query string, no fragment).","pattern":"^/[^?#\\s]*$","maxLength":1024};
const schema297 = {"type":"string","description":"A raw utm_* value from the page URL; the server lower-cases it and drops it unless it fits the stored alphabet.","minLength":1,"maxLength":128};
const schema302 = {"type":"number","minimum":0,"maximum":600000};
const pattern139 = new RegExp("^/[^?#\\s]*$", "u");

function validate109(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/analytics-beacon.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate109.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.path === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "schemaVersion") || (key0 === "kind")) || (key0 === "path")) || (key0 === "referrer")) || (key0 === "utmSource")) || (key0 === "utmMedium")) || (key0 === "utmCampaign")) || (key0 === "navType"))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err4 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!(data0 === 1)){
const err5 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema295.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err6 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!(data1 === "pageview")){
const err7 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema294.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.path !== undefined){
let data2 = data.path;
if(typeof data2 === "string"){
if(func2(data2) > 1024){
const err8 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/BeaconPath/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!pattern139.test(data2)){
const err9 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/BeaconPath/pattern",keyword:"pattern",params:{pattern: "^/[^?#\\s]*$"},message:"must match pattern \""+"^/[^?#\\s]*$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/BeaconPath/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.referrer !== undefined){
let data3 = data.referrer;
if(typeof data3 === "string"){
if(func2(data3) > 253){
const err11 = {instancePath:instancePath+"/referrer",schemaPath:"#/oneOf/0/properties/referrer/maxLength",keyword:"maxLength",params:{limit: 253},message:"must NOT have more than 253 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/referrer",schemaPath:"#/oneOf/0/properties/referrer/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.utmSource !== undefined){
let data4 = data.utmSource;
if(typeof data4 === "string"){
if(func2(data4) > 128){
const err13 = {instancePath:instancePath+"/utmSource",schemaPath:"#/$defs/BeaconUtm/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func2(data4) < 1){
const err14 = {instancePath:instancePath+"/utmSource",schemaPath:"#/$defs/BeaconUtm/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/utmSource",schemaPath:"#/$defs/BeaconUtm/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.utmMedium !== undefined){
let data5 = data.utmMedium;
if(typeof data5 === "string"){
if(func2(data5) > 128){
const err16 = {instancePath:instancePath+"/utmMedium",schemaPath:"#/$defs/BeaconUtm/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func2(data5) < 1){
const err17 = {instancePath:instancePath+"/utmMedium",schemaPath:"#/$defs/BeaconUtm/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/utmMedium",schemaPath:"#/$defs/BeaconUtm/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.utmCampaign !== undefined){
let data6 = data.utmCampaign;
if(typeof data6 === "string"){
if(func2(data6) > 128){
const err19 = {instancePath:instancePath+"/utmCampaign",schemaPath:"#/$defs/BeaconUtm/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(func2(data6) < 1){
const err20 = {instancePath:instancePath+"/utmCampaign",schemaPath:"#/$defs/BeaconUtm/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err21 = {instancePath:instancePath+"/utmCampaign",schemaPath:"#/$defs/BeaconUtm/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.navType !== undefined){
let data7 = data.navType;
if(typeof data7 !== "string"){
const err22 = {instancePath:instancePath+"/navType",schemaPath:"#/oneOf/0/properties/navType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!(((((data7 === "navigate") || (data7 === "reload")) || (data7 === "back_forward")) || (data7 === "prerender")) || (data7 === "restore"))){
const err23 = {instancePath:instancePath+"/navType",schemaPath:"#/oneOf/0/properties/navType/enum",keyword:"enum",params:{allowedValues: schema294.oneOf[0].properties.navType.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs25 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.kind === undefined){
const err26 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data.path === undefined){
const err27 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "path"},message:"must have required property '"+"path"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data.sampleOneIn === undefined){
const err28 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "sampleOneIn"},message:"must have required property '"+"sampleOneIn"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
for(const key1 in data){
if(!(func1.call(schema294.oneOf[1].properties, key1))){
const err29 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data8 = data.schemaVersion;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err30 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!(data8 === 1)){
const err31 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema295.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.kind !== undefined){
let data9 = data.kind;
if(typeof data9 !== "string"){
const err32 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(!(data9 === "vitals")){
const err33 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema294.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.path !== undefined){
let data10 = data.path;
if(typeof data10 === "string"){
if(func2(data10) > 1024){
const err34 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/BeaconPath/maxLength",keyword:"maxLength",params:{limit: 1024},message:"must NOT have more than 1024 characters"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(!pattern139.test(data10)){
const err35 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/BeaconPath/pattern",keyword:"pattern",params:{pattern: "^/[^?#\\s]*$"},message:"must match pattern \""+"^/[^?#\\s]*$"+"\""};
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
const err36 = {instancePath:instancePath+"/path",schemaPath:"#/$defs/BeaconPath/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data.lcp !== undefined){
let data11 = data.lcp;
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 > 600000 || isNaN(data11)){
const err37 = {instancePath:instancePath+"/lcp",schemaPath:"#/$defs/BeaconMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(data11 < 0 || isNaN(data11)){
const err38 = {instancePath:instancePath+"/lcp",schemaPath:"#/$defs/BeaconMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/lcp",schemaPath:"#/$defs/BeaconMillis/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.inp !== undefined){
let data12 = data.inp;
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 > 600000 || isNaN(data12)){
const err40 = {instancePath:instancePath+"/inp",schemaPath:"#/$defs/BeaconMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(data12 < 0 || isNaN(data12)){
const err41 = {instancePath:instancePath+"/inp",schemaPath:"#/$defs/BeaconMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
else {
const err42 = {instancePath:instancePath+"/inp",schemaPath:"#/$defs/BeaconMillis/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.cls !== undefined){
let data13 = data.cls;
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 > 100 || isNaN(data13)){
const err43 = {instancePath:instancePath+"/cls",schemaPath:"#/oneOf/1/properties/cls/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data13 < 0 || isNaN(data13)){
const err44 = {instancePath:instancePath+"/cls",schemaPath:"#/oneOf/1/properties/cls/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
else {
const err45 = {instancePath:instancePath+"/cls",schemaPath:"#/oneOf/1/properties/cls/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data.ttfb !== undefined){
let data14 = data.ttfb;
if((typeof data14 == "number") && (isFinite(data14))){
if(data14 > 600000 || isNaN(data14)){
const err46 = {instancePath:instancePath+"/ttfb",schemaPath:"#/$defs/BeaconMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(data14 < 0 || isNaN(data14)){
const err47 = {instancePath:instancePath+"/ttfb",schemaPath:"#/$defs/BeaconMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
const err48 = {instancePath:instancePath+"/ttfb",schemaPath:"#/$defs/BeaconMillis/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data.fcp !== undefined){
let data15 = data.fcp;
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 > 600000 || isNaN(data15)){
const err49 = {instancePath:instancePath+"/fcp",schemaPath:"#/$defs/BeaconMillis/maximum",keyword:"maximum",params:{comparison: "<=", limit: 600000},message:"must be <= 600000"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(data15 < 0 || isNaN(data15)){
const err50 = {instancePath:instancePath+"/fcp",schemaPath:"#/$defs/BeaconMillis/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
else {
const err51 = {instancePath:instancePath+"/fcp",schemaPath:"#/$defs/BeaconMillis/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.sampleOneIn !== undefined){
let data16 = data.sampleOneIn;
if(!(((typeof data16 == "number") && (!(data16 % 1) && !isNaN(data16))) && (isFinite(data16)))){
const err52 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/oneOf/1/properties/sampleOneIn/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if((typeof data16 == "number") && (isFinite(data16))){
if(data16 > 1000 || isNaN(data16)){
const err53 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/oneOf/1/properties/sampleOneIn/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1000},message:"must be <= 1000"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(data16 < 1 || isNaN(data16)){
const err54 = {instancePath:instancePath+"/sampleOneIn",schemaPath:"#/oneOf/1/properties/sampleOneIn/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
}
}
else {
const err55 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
var _valid0 = _errs25 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err56 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate109.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate109.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateComment = validate110;
const schema306 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/comment.schema.json","title":"Comment","description":"A reader comment on a published content entry, as stored in D1 (outside the site graph), returned to people and agents, and exported (RFC-0007). It is not a graph node: it never enters a snapshot, a diff or a site bundle, and a content rollback never changes it. The record carries no personal data beyond the display name the commenter chose: an email address, an IP address or its hash, a user agent and a proof-of-work challenge live in separate columns and tables that this contract cannot express (additionalProperties: false), so no reader of the contract — Studio lists, MCP tools, exports — can leak them. Text is plain text; renderers escape it and turn only https links into anchors with rel=\"ugc nofollow noopener noreferrer\".","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","nodeId","source","author","status","createdAt","rev"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/CommentId"},"siteId":{"$ref":"#/$defs/Id"},"nodeId":{"$ref":"#/$defs/Id","description":"The content entry the comment belongs to, by id, so threads survive slug changes (RFC-0002)."},"parentId":{"$ref":"#/$defs/CommentId","description":"The comment this one is nested under for display. Absent for a top-level comment. In v1 the tree is two levels deep: a parent is always top-level, and a reply to a reply is nested under the same top-level comment with `inReplyToId` pointing at the comment it answers."},"inReplyToId":{"$ref":"#/$defs/CommentId","description":"The comment this one answers when that is not `parentId` itself (a reply to a reply). Only with `parentId`, in the same thread."},"source":{"type":"string","description":"Where the comment came from: `native` (the site's own form or Studio), `import` (an importer; see `origin`). `webmention` and `activitypub` are reserved for later RFCs and are refused by v1 writers.","enum":["native","import","webmention","activitypub"]},"origin":{"$ref":"#/$defs/CommentOrigin"},"author":{"$ref":"#/$defs/CommentAuthor"},"body":{"$ref":"#/$defs/CommentBody"},"status":{"$ref":"#/$defs/CommentStatus"},"labels":{"type":"array","description":"Advisory labels from rules, classifiers, agents and people. Labels never change what readers see; only a status change does.","items":{"$ref":"#/$defs/CommentLabel"},"maxItems":32},"moderation":{"$ref":"#/$defs/CommentModeration"},"createdAt":{"$ref":"#/$defs/Timestamp"},"editedAt":{"$ref":"#/$defs/Timestamp","description":"Set when the text changed after it was first stored (v1.1 edit window; staff replies edited in Studio)."},"rev":{"$ref":"#/$defs/Revision"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"CommentAuthor":{"description":"Who wrote the comment, discriminated by `kind`. There is deliberately no email, address or account handle here.","oneOf":[{"type":"object","title":"GuestCommentAuthor","description":"A guest: only the display name they typed. Guest comments are always held for moderation in v1.","additionalProperties":false,"required":["kind","name"],"properties":{"kind":{"type":"string","enum":["guest"]},"name":{"$ref":"#/$defs/CommentDisplayName"}}},{"type":"object","title":"ReaderCommentAuthor","description":"A verified reader (v1.1: email code or magic link on the site's own host). `readerId` is the site's reader account id, never the email.","additionalProperties":false,"required":["kind","readerId","name"],"properties":{"kind":{"type":"string","enum":["reader"]},"readerId":{"$ref":"#/$defs/Id"},"name":{"$ref":"#/$defs/CommentDisplayName"}}},{"type":"object","title":"StaffCommentAuthor","description":"A reply on the site's behalf. It is always attributed to a person (`personId` is a staff actor id, `user_…`): an agent may draft the text (`draftedBy`), but a person approved it. `draftedBy` names the agent that drafted the text, when one did (shown in Studio and the audit, not on the public page).","additionalProperties":false,"required":["kind","personId","name","badge"],"properties":{"kind":{"type":"string","enum":["staff"]},"personId":{"type":"string","description":"The person who wrote or approved the reply.","pattern":"^user_[A-Za-z0-9]{6,32}$"},"name":{"$ref":"#/$defs/CommentDisplayName"},"badge":{"type":"string","description":"What the public page shows next to the name: `author` when the person wrote the entry, otherwise `team`.","enum":["author","team"]},"draftedBy":{"$ref":"#/$defs/Actor"}}},{"type":"object","title":"ErasedCommentAuthor","description":"The commenter's identity was erased on request (RFC-0007 privacy model). Pages show a localised \"Anonymous\".","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["erased"]}}}]},"CommentBody":{"type":"object","description":"The comment text. v1 has only `text`: plain text with line breaks, no markup. A later RFC may add a restricted Markdown format. Absent only when the text was deleted (status `deleted`, or an erasure that removed the text); the record then stays as a tombstone while approved replies hang under it.","additionalProperties":false,"required":["format","text"],"properties":{"format":{"type":"string","enum":["text"]},"text":{"type":"string","description":"NFC-normalised, CRLF turned into LF, trimmed: 1 to 5,000 characters. Tabs and line feeds are the only control characters allowed; bidirectional overrides are refused so a comment cannot disguise itself in Studio.","minLength":1,"maxLength":5000,"pattern":"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"}}},"CommentDisplayName":{"type":"string","description":"Plain text chosen by the commenter (or the staff member's name), NFC-normalised and trimmed by the server: 1 to 80 characters, no control characters, no bidirectional overrides, no surrounding whitespace.","minLength":1,"maxLength":80,"pattern":"^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"},"CommentId":{"type":"string","description":"A comment id: `cmt_` and 6 to 32 letters or digits.","pattern":"^cmt_[A-Za-z0-9]{6,32}$"},"CommentLabel":{"type":"object","description":"An advisory label. `rule` labels come from the submission pipeline (word lists, link count, instruction-like text); `classifier` from an opt-in classifier (Workers AI, Akismet); `agent` from `label_comments`; `person` from Studio. `by` is the agent or person that set it (absent for rules and classifiers).","additionalProperties":false,"required":["label","source","at"],"properties":{"label":{"type":"string","enum":["spam-suspect","toxic","off-topic","question","needs-reply","praise","personal-data","links","watch-word","instruction-like"]},"source":{"type":"string","enum":["rule","classifier","agent","person"]},"by":{"$ref":"#/$defs/Actor"},"confidence":{"type":"integer","description":"0 to 100, when the source reports one.","minimum":0,"maximum":100},"at":{"$ref":"#/$defs/Timestamp"}}},"CommentModeration":{"type":"object","description":"The latest moderation decision, kept as a statement of reasons (EU DSA Art. 17). The full history is in `comment_events`. Approvals are always a person's decision; agents may only hide, mark as spam or hold.","additionalProperties":false,"required":["action","actor","at","automated"],"properties":{"action":{"type":"string","enum":["approve","hide","spam","hold","restore","delete","erase"]},"actor":{"$ref":"#/$defs/Actor"},"at":{"$ref":"#/$defs/Timestamp"},"reasonCode":{"type":"string","description":"Required by writers for hide, spam, delete and erase.","enum":["spam","abuse","off-topic","personal-data","illegal-content","legal-order","author-request","erasure-request","duplicate","other"]},"note":{"type":"string","description":"Free text from the moderator, plain text, at most 500 characters.","maxLength":500,"pattern":"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"},"automated":{"type":"boolean","description":"True when the decision was taken without a person (an agent, a rule or a ban), as a statement of reasons must say."}}},"CommentOrigin":{"type":"object","description":"For imported comments: the system and its id, so importers are idempotent.","additionalProperties":false,"required":["system","id"],"properties":{"system":{"type":"string","enum":["cloudhal","disqus","wordpress"]},"id":{"type":"string","description":"The comment's id in that system: printable ASCII, at most 200 characters.","minLength":1,"maxLength":200,"pattern":"^[!-~]+$"}}},"CommentStatus":{"type":"string","description":"Lifecycle. `pending` waits for a person (every guest comment starts here); `approved` is public; `hidden` is withdrawn and reversible; `spam` is never shown and is deleted after the retention period; `deleted` is a soft delete, hard-deleted after the retention period unless approved replies keep it as a tombstone.","enum":["pending","approved","hidden","spam","deleted"]},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema307 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema308 = {"type":"string","description":"A comment id: `cmt_` and 6 to 32 letters or digits.","pattern":"^cmt_[A-Za-z0-9]{6,32}$"};
const schema309 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema313 = {"type":"object","description":"For imported comments: the system and its id, so importers are idempotent.","additionalProperties":false,"required":["system","id"],"properties":{"system":{"type":"string","enum":["cloudhal","disqus","wordpress"]},"id":{"type":"string","description":"The comment's id in that system: printable ASCII, at most 200 characters.","minLength":1,"maxLength":200,"pattern":"^[!-~]+$"}}};
const schema322 = {"type":"object","description":"The comment text. v1 has only `text`: plain text with line breaks, no markup. A later RFC may add a restricted Markdown format. Absent only when the text was deleted (status `deleted`, or an erasure that removed the text); the record then stays as a tombstone while approved replies hang under it.","additionalProperties":false,"required":["format","text"],"properties":{"format":{"type":"string","enum":["text"]},"text":{"type":"string","description":"NFC-normalised, CRLF turned into LF, trimmed: 1 to 5,000 characters. Tabs and line feeds are the only control characters allowed; bidirectional overrides are refused so a comment cannot disguise itself in Studio.","minLength":1,"maxLength":5000,"pattern":"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"}}};
const schema323 = {"type":"string","description":"Lifecycle. `pending` waits for a person (every guest comment starts here); `approved` is public; `hidden` is withdrawn and reversible; `spam` is never shown and is deleted after the retention period; `deleted` is a soft delete, hard-deleted after the retention period unless approved replies keep it as a tombstone.","enum":["pending","approved","hidden","spam","deleted"]};
const schema325 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema330 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const pattern141 = new RegExp("^cmt_[A-Za-z0-9]{6,32}$", "u");
const pattern146 = new RegExp("^[!-~]+$", "u");
const pattern153 = new RegExp("^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$", "u");
const schema314 = {"description":"Who wrote the comment, discriminated by `kind`. There is deliberately no email, address or account handle here.","oneOf":[{"type":"object","title":"GuestCommentAuthor","description":"A guest: only the display name they typed. Guest comments are always held for moderation in v1.","additionalProperties":false,"required":["kind","name"],"properties":{"kind":{"type":"string","enum":["guest"]},"name":{"$ref":"#/$defs/CommentDisplayName"}}},{"type":"object","title":"ReaderCommentAuthor","description":"A verified reader (v1.1: email code or magic link on the site's own host). `readerId` is the site's reader account id, never the email.","additionalProperties":false,"required":["kind","readerId","name"],"properties":{"kind":{"type":"string","enum":["reader"]},"readerId":{"$ref":"#/$defs/Id"},"name":{"$ref":"#/$defs/CommentDisplayName"}}},{"type":"object","title":"StaffCommentAuthor","description":"A reply on the site's behalf. It is always attributed to a person (`personId` is a staff actor id, `user_…`): an agent may draft the text (`draftedBy`), but a person approved it. `draftedBy` names the agent that drafted the text, when one did (shown in Studio and the audit, not on the public page).","additionalProperties":false,"required":["kind","personId","name","badge"],"properties":{"kind":{"type":"string","enum":["staff"]},"personId":{"type":"string","description":"The person who wrote or approved the reply.","pattern":"^user_[A-Za-z0-9]{6,32}$"},"name":{"$ref":"#/$defs/CommentDisplayName"},"badge":{"type":"string","description":"What the public page shows next to the name: `author` when the person wrote the entry, otherwise `team`.","enum":["author","team"]},"draftedBy":{"$ref":"#/$defs/Actor"}}},{"type":"object","title":"ErasedCommentAuthor","description":"The commenter's identity was erased on request (RFC-0007 privacy model). Pages show a localised \"Anonymous\".","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["erased"]}}}]};
const schema315 = {"type":"string","description":"Plain text chosen by the commenter (or the staff member's name), NFC-normalised and trimmed by the server: 1 to 80 characters, no control characters, no bidirectional overrides, no surrounding whitespace.","minLength":1,"maxLength":80,"pattern":"^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"};
const pattern147 = new RegExp("^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$", "u");
const pattern150 = new RegExp("^user_[A-Za-z0-9]{6,32}$", "u");
const schema319 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema320 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate112(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate112.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "id")) || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "human") || (data0 === "agent")) || (data0 === "system"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema320.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err9 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate112.errors = vErrors;
return errors === 0;
}
validate112.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate111(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate111.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.name === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(data0 === "guest")){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema314.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.name !== undefined){
let data1 = data.name;
if(typeof data1 === "string"){
if(func2(data1) > 80){
const err5 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 1){
const err6 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern147.test(data1)){
const err7 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/pattern",keyword:"pattern",params:{pattern: "^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"},message:"must match pattern \""+"^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs9 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.readerId === undefined){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "readerId"},message:"must have required property '"+"readerId"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.name === undefined){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
for(const key1 in data){
if(!(((key1 === "kind") || (key1 === "readerId")) || (key1 === "name"))){
const err13 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined){
let data2 = data.kind;
if(typeof data2 !== "string"){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(data2 === "reader")){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema314.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.readerId !== undefined){
let data3 = data.readerId;
if(typeof data3 === "string"){
if(func2(data3) > 48){
const err16 = {instancePath:instancePath+"/readerId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func2(data3) < 8){
const err17 = {instancePath:instancePath+"/readerId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!pattern4.test(data3)){
const err18 = {instancePath:instancePath+"/readerId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err19 = {instancePath:instancePath+"/readerId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.name !== undefined){
let data4 = data.name;
if(typeof data4 === "string"){
if(func2(data4) > 80){
const err20 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(func2(data4) < 1){
const err21 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(!pattern147.test(data4)){
const err22 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/pattern",keyword:"pattern",params:{pattern: "^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"},message:"must match pattern \""+"^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"+"\""};
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
const err23 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid0 = _errs9 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs20 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err25 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.personId === undefined){
const err26 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "personId"},message:"must have required property '"+"personId"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data.name === undefined){
const err27 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data.badge === undefined){
const err28 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "badge"},message:"must have required property '"+"badge"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
for(const key2 in data){
if(!(((((key2 === "kind") || (key2 === "personId")) || (key2 === "name")) || (key2 === "badge")) || (key2 === "draftedBy"))){
const err29 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.kind !== undefined){
let data5 = data.kind;
if(typeof data5 !== "string"){
const err30 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!(data5 === "staff")){
const err31 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema314.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.personId !== undefined){
let data6 = data.personId;
if(typeof data6 === "string"){
if(!pattern150.test(data6)){
const err32 = {instancePath:instancePath+"/personId",schemaPath:"#/oneOf/2/properties/personId/pattern",keyword:"pattern",params:{pattern: "^user_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^user_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/personId",schemaPath:"#/oneOf/2/properties/personId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.name !== undefined){
let data7 = data.name;
if(typeof data7 === "string"){
if(func2(data7) > 80){
const err34 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(func2(data7) < 1){
const err35 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!pattern147.test(data7)){
const err36 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/pattern",keyword:"pattern",params:{pattern: "^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"},message:"must match pattern \""+"^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$"+"\""};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
else {
const err37 = {instancePath:instancePath+"/name",schemaPath:"#/$defs/CommentDisplayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.badge !== undefined){
let data8 = data.badge;
if(typeof data8 !== "string"){
const err38 = {instancePath:instancePath+"/badge",schemaPath:"#/oneOf/2/properties/badge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(!((data8 === "author") || (data8 === "team"))){
const err39 = {instancePath:instancePath+"/badge",schemaPath:"#/oneOf/2/properties/badge/enum",keyword:"enum",params:{allowedValues: schema314.oneOf[2].properties.badge.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.draftedBy !== undefined){
if(!(validate112(data.draftedBy, {instancePath:instancePath+"/draftedBy",parentData:data,parentDataProperty:"draftedBy",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate112.errors : vErrors.concat(validate112.errors);
errors = vErrors.length;
}
}
}
else {
const err40 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
var _valid0 = _errs20 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs33 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err41 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
for(const key3 in data){
if(!(key3 === "kind")){
const err42 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.kind !== undefined){
let data10 = data.kind;
if(typeof data10 !== "string"){
const err43 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(!(data10 === "erased")){
const err44 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema314.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
else {
const err45 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
}
}
}
if(!valid0){
const err46 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate111.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate111.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema324 = {"type":"object","description":"An advisory label. `rule` labels come from the submission pipeline (word lists, link count, instruction-like text); `classifier` from an opt-in classifier (Workers AI, Akismet); `agent` from `label_comments`; `person` from Studio. `by` is the agent or person that set it (absent for rules and classifiers).","additionalProperties":false,"required":["label","source","at"],"properties":{"label":{"type":"string","enum":["spam-suspect","toxic","off-topic","question","needs-reply","praise","personal-data","links","watch-word","instruction-like"]},"source":{"type":"string","enum":["rule","classifier","agent","person"]},"by":{"$ref":"#/$defs/Actor"},"confidence":{"type":"integer","description":"0 to 100, when the source reports one.","minimum":0,"maximum":100},"at":{"$ref":"#/$defs/Timestamp"}}};

function validate115(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate115.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.label === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.source === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.at === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "label") || (key0 === "source")) || (key0 === "by")) || (key0 === "confidence")) || (key0 === "at"))){
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
if(data.label !== undefined){
let data0 = data.label;
if(typeof data0 !== "string"){
const err4 = {instancePath:instancePath+"/label",schemaPath:"#/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!((((((((((data0 === "spam-suspect") || (data0 === "toxic")) || (data0 === "off-topic")) || (data0 === "question")) || (data0 === "needs-reply")) || (data0 === "praise")) || (data0 === "personal-data")) || (data0 === "links")) || (data0 === "watch-word")) || (data0 === "instruction-like"))){
const err5 = {instancePath:instancePath+"/label",schemaPath:"#/properties/label/enum",keyword:"enum",params:{allowedValues: schema324.properties.label.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.source !== undefined){
let data1 = data.source;
if(typeof data1 !== "string"){
const err6 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!((((data1 === "rule") || (data1 === "classifier")) || (data1 === "agent")) || (data1 === "person"))){
const err7 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema324.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.by !== undefined){
if(!(validate112(data.by, {instancePath:instancePath+"/by",parentData:data,parentDataProperty:"by",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate112.errors : vErrors.concat(validate112.errors);
errors = vErrors.length;
}
}
if(data.confidence !== undefined){
let data3 = data.confidence;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err8 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 > 100 || isNaN(data3)){
const err9 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data3 < 0 || isNaN(data3)){
const err10 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
if(data.at !== undefined){
let data4 = data.at;
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err11 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate115.errors = vErrors;
return errors === 0;
}
validate115.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema326 = {"type":"object","description":"The latest moderation decision, kept as a statement of reasons (EU DSA Art. 17). The full history is in `comment_events`. Approvals are always a person's decision; agents may only hide, mark as spam or hold.","additionalProperties":false,"required":["action","actor","at","automated"],"properties":{"action":{"type":"string","enum":["approve","hide","spam","hold","restore","delete","erase"]},"actor":{"$ref":"#/$defs/Actor"},"at":{"$ref":"#/$defs/Timestamp"},"reasonCode":{"type":"string","description":"Required by writers for hide, spam, delete and erase.","enum":["spam","abuse","off-topic","personal-data","illegal-content","legal-order","author-request","erasure-request","duplicate","other"]},"note":{"type":"string","description":"Free text from the moderator, plain text, at most 500 characters.","maxLength":500,"pattern":"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"},"automated":{"type":"boolean","description":"True when the decision was taken without a person (an agent, a rule or a ban), as a statement of reasons must say."}}};
const pattern154 = new RegExp("^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$", "u");

function validate118(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate118.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.action === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.actor === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "actor"},message:"must have required property '"+"actor"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.at === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.automated === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "automated"},message:"must have required property '"+"automated"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "action") || (key0 === "actor")) || (key0 === "at")) || (key0 === "reasonCode")) || (key0 === "note")) || (key0 === "automated"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.action !== undefined){
let data0 = data.action;
if(typeof data0 !== "string"){
const err5 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!(((((((data0 === "approve") || (data0 === "hide")) || (data0 === "spam")) || (data0 === "hold")) || (data0 === "restore")) || (data0 === "delete")) || (data0 === "erase"))){
const err6 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/enum",keyword:"enum",params:{allowedValues: schema326.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.actor !== undefined){
if(!(validate112(data.actor, {instancePath:instancePath+"/actor",parentData:data,parentDataProperty:"actor",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate112.errors : vErrors.concat(validate112.errors);
errors = vErrors.length;
}
}
if(data.at !== undefined){
let data2 = data.at;
if(typeof data2 === "string"){
if(!(formats0.validate(data2))){
const err7 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.reasonCode !== undefined){
let data3 = data.reasonCode;
if(typeof data3 !== "string"){
const err9 = {instancePath:instancePath+"/reasonCode",schemaPath:"#/properties/reasonCode/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!((((((((((data3 === "spam") || (data3 === "abuse")) || (data3 === "off-topic")) || (data3 === "personal-data")) || (data3 === "illegal-content")) || (data3 === "legal-order")) || (data3 === "author-request")) || (data3 === "erasure-request")) || (data3 === "duplicate")) || (data3 === "other"))){
const err10 = {instancePath:instancePath+"/reasonCode",schemaPath:"#/properties/reasonCode/enum",keyword:"enum",params:{allowedValues: schema326.properties.reasonCode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.note !== undefined){
let data4 = data.note;
if(typeof data4 === "string"){
if(func2(data4) > 500){
const err11 = {instancePath:instancePath+"/note",schemaPath:"#/properties/note/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!pattern154.test(data4)){
const err12 = {instancePath:instancePath+"/note",schemaPath:"#/properties/note/pattern",keyword:"pattern",params:{pattern: "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"},message:"must match pattern \""+"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"+"\""};
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
const err13 = {instancePath:instancePath+"/note",schemaPath:"#/properties/note/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.automated !== undefined){
if(typeof data.automated !== "boolean"){
const err14 = {instancePath:instancePath+"/automated",schemaPath:"#/properties/automated/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
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
const err15 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
validate118.errors = vErrors;
return errors === 0;
}
validate118.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate110(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/comment.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate110.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.nodeId === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.source === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.author === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "author"},message:"must have required property '"+"author"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.status === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.createdAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.rev === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema306.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err10 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!(data0 === 1)){
const err11 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema307.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(!pattern141.test(data1)){
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/CommentId/pattern",keyword:"pattern",params:{pattern: "^cmt_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^cmt_[A-Za-z0-9]{6,32}$"+"\""};
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
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/CommentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err14 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(func2(data2) < 8){
const err15 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!pattern4.test(data2)){
const err16 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.nodeId !== undefined){
let data3 = data.nodeId;
if(typeof data3 === "string"){
if(func2(data3) > 48){
const err18 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data3) < 8){
const err19 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern4.test(data3)){
const err20 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err21 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.parentId !== undefined){
let data4 = data.parentId;
if(typeof data4 === "string"){
if(!pattern141.test(data4)){
const err22 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/CommentId/pattern",keyword:"pattern",params:{pattern: "^cmt_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^cmt_[A-Za-z0-9]{6,32}$"+"\""};
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
const err23 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/CommentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.inReplyToId !== undefined){
let data5 = data.inReplyToId;
if(typeof data5 === "string"){
if(!pattern141.test(data5)){
const err24 = {instancePath:instancePath+"/inReplyToId",schemaPath:"#/$defs/CommentId/pattern",keyword:"pattern",params:{pattern: "^cmt_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^cmt_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/inReplyToId",schemaPath:"#/$defs/CommentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.source !== undefined){
let data6 = data.source;
if(typeof data6 !== "string"){
const err26 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!((((data6 === "native") || (data6 === "import")) || (data6 === "webmention")) || (data6 === "activitypub"))){
const err27 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema306.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.origin !== undefined){
let data7 = data.origin;
if(data7 && typeof data7 == "object" && !Array.isArray(data7)){
if(data7.system === undefined){
const err28 = {instancePath:instancePath+"/origin",schemaPath:"#/$defs/CommentOrigin/required",keyword:"required",params:{missingProperty: "system"},message:"must have required property '"+"system"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data7.id === undefined){
const err29 = {instancePath:instancePath+"/origin",schemaPath:"#/$defs/CommentOrigin/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
for(const key1 in data7){
if(!((key1 === "system") || (key1 === "id"))){
const err30 = {instancePath:instancePath+"/origin",schemaPath:"#/$defs/CommentOrigin/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data7.system !== undefined){
let data8 = data7.system;
if(typeof data8 !== "string"){
const err31 = {instancePath:instancePath+"/origin/system",schemaPath:"#/$defs/CommentOrigin/properties/system/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(!(((data8 === "cloudhal") || (data8 === "disqus")) || (data8 === "wordpress"))){
const err32 = {instancePath:instancePath+"/origin/system",schemaPath:"#/$defs/CommentOrigin/properties/system/enum",keyword:"enum",params:{allowedValues: schema313.properties.system.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data7.id !== undefined){
let data9 = data7.id;
if(typeof data9 === "string"){
if(func2(data9) > 200){
const err33 = {instancePath:instancePath+"/origin/id",schemaPath:"#/$defs/CommentOrigin/properties/id/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(func2(data9) < 1){
const err34 = {instancePath:instancePath+"/origin/id",schemaPath:"#/$defs/CommentOrigin/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(!pattern146.test(data9)){
const err35 = {instancePath:instancePath+"/origin/id",schemaPath:"#/$defs/CommentOrigin/properties/id/pattern",keyword:"pattern",params:{pattern: "^[!-~]+$"},message:"must match pattern \""+"^[!-~]+$"+"\""};
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
const err36 = {instancePath:instancePath+"/origin/id",schemaPath:"#/$defs/CommentOrigin/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/origin",schemaPath:"#/$defs/CommentOrigin/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.author !== undefined){
if(!(validate111(data.author, {instancePath:instancePath+"/author",parentData:data,parentDataProperty:"author",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate111.errors : vErrors.concat(validate111.errors);
errors = vErrors.length;
}
}
if(data.body !== undefined){
let data11 = data.body;
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
if(data11.format === undefined){
const err38 = {instancePath:instancePath+"/body",schemaPath:"#/$defs/CommentBody/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data11.text === undefined){
const err39 = {instancePath:instancePath+"/body",schemaPath:"#/$defs/CommentBody/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
for(const key2 in data11){
if(!((key2 === "format") || (key2 === "text"))){
const err40 = {instancePath:instancePath+"/body",schemaPath:"#/$defs/CommentBody/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data11.format !== undefined){
let data12 = data11.format;
if(typeof data12 !== "string"){
const err41 = {instancePath:instancePath+"/body/format",schemaPath:"#/$defs/CommentBody/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(!(data12 === "text")){
const err42 = {instancePath:instancePath+"/body/format",schemaPath:"#/$defs/CommentBody/properties/format/enum",keyword:"enum",params:{allowedValues: schema322.properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data11.text !== undefined){
let data13 = data11.text;
if(typeof data13 === "string"){
if(func2(data13) > 5000){
const err43 = {instancePath:instancePath+"/body/text",schemaPath:"#/$defs/CommentBody/properties/text/maxLength",keyword:"maxLength",params:{limit: 5000},message:"must NOT have more than 5000 characters"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(func2(data13) < 1){
const err44 = {instancePath:instancePath+"/body/text",schemaPath:"#/$defs/CommentBody/properties/text/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(!pattern153.test(data13)){
const err45 = {instancePath:instancePath+"/body/text",schemaPath:"#/$defs/CommentBody/properties/text/pattern",keyword:"pattern",params:{pattern: "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"},message:"must match pattern \""+"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"+"\""};
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
const err46 = {instancePath:instancePath+"/body/text",schemaPath:"#/$defs/CommentBody/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
else {
const err47 = {instancePath:instancePath+"/body",schemaPath:"#/$defs/CommentBody/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data.status !== undefined){
let data14 = data.status;
if(typeof data14 !== "string"){
const err48 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/CommentStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(!(((((data14 === "pending") || (data14 === "approved")) || (data14 === "hidden")) || (data14 === "spam")) || (data14 === "deleted"))){
const err49 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/CommentStatus/enum",keyword:"enum",params:{allowedValues: schema323.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.labels !== undefined){
let data15 = data.labels;
if(Array.isArray(data15)){
if(data15.length > 32){
const err50 = {instancePath:instancePath+"/labels",schemaPath:"#/properties/labels/maxItems",keyword:"maxItems",params:{limit: 32},message:"must NOT have more than 32 items"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
const len0 = data15.length;
for(let i0=0; i0<len0; i0++){
if(!(validate115(data15[i0], {instancePath:instancePath+"/labels/" + i0,parentData:data15,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate115.errors : vErrors.concat(validate115.errors);
errors = vErrors.length;
}
}
}
else {
const err51 = {instancePath:instancePath+"/labels",schemaPath:"#/properties/labels/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.moderation !== undefined){
if(!(validate118(data.moderation, {instancePath:instancePath+"/moderation",parentData:data,parentDataProperty:"moderation",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate118.errors : vErrors.concat(validate118.errors);
errors = vErrors.length;
}
}
if(data.createdAt !== undefined){
let data18 = data.createdAt;
if(typeof data18 === "string"){
if(!(formats0.validate(data18))){
const err52 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
else {
const err53 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data.editedAt !== undefined){
let data19 = data.editedAt;
if(typeof data19 === "string"){
if(!(formats0.validate(data19))){
const err54 = {instancePath:instancePath+"/editedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
else {
const err55 = {instancePath:instancePath+"/editedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data.rev !== undefined){
let data20 = data.rev;
if(!(((typeof data20 == "number") && (!(data20 % 1) && !isNaN(data20))) && (isFinite(data20)))){
const err56 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if((typeof data20 == "number") && (isFinite(data20))){
if(data20 < 0 || isNaN(data20)){
const err57 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
}
}
else {
const err58 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
validate110.errors = vErrors;
return errors === 0;
}
validate110.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateCommentSubmission = validate121;
const schema331 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/comment-submission.schema.json","title":"CommentSubmission","description":"What a browser may send to the site Worker's comment endpoints (RFC-0007): `POST /__cloudhal/comments` (a comment) and `POST /__cloudhal/comments/report` (a report). Forms post application/x-www-form-urlencoded and the comments module posts JSON; the server builds this object from either (the endpoint sets `kind`, the server sets `schemaVersion`) and checks it with the precompiled validator before anything else reads it. Everything in it is untrusted. It is loose where the server normalises (it trims, NFC-normalises and re-checks text against the stored Comment contract) and strict where a browser has no business sending something: there is no field for a status, a site, an author kind, a label, an IP address or anything the server derives itself.","oneOf":[{"type":"object","title":"CommentPostSubmission","description":"A new comment or a reply.","additionalProperties":false,"required":["schemaVersion","kind","nodeId","name","body"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"kind":{"type":"string","enum":["comment"]},"nodeId":{"$ref":"#/$defs/Id","description":"The entry commented on. The server accepts it only for a published entry with an open thread, and works out the page to return to itself."},"parentId":{"$ref":"#/$defs/SubmissionCommentId","description":"The comment replied to; it must be approved and in the same thread. The server decides `parentId`/`inReplyToId` of the stored comment."},"name":{"type":"string","description":"The display name as typed (the form says it is shown publicly).","minLength":1,"maxLength":200},"email":{"type":"string","description":"Optional and never shown. Kept only for moderation, erasure and export requests (v1.1: reply notifications after double opt-in).","maxLength":254,"pattern":"^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$"},"body":{"type":"string","description":"The comment as typed; the server trims and normalises it, then requires 2 to 5,000 characters.","minLength":1,"maxLength":20000},"challenge":{"$ref":"#/$defs/SubmissionChallenge"},"solution":{"$ref":"#/$defs/SubmissionSolution"},"turnstileToken":{"$ref":"#/$defs/SubmissionTurnstileToken"},"website":{"$ref":"#/$defs/SubmissionHoneypot"}}},{"type":"object","title":"CommentReportSubmission","description":"A reader's notice that a comment breaks the site's rules or the law (EU DSA Art. 16). A report never hides anything by itself: it puts the comment in front of a person.","additionalProperties":false,"required":["schemaVersion","kind","commentId","reason"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"kind":{"type":"string","enum":["report"]},"commentId":{"$ref":"#/$defs/SubmissionCommentId"},"reason":{"type":"string","enum":["spam","abuse","personal-data","illegal-content","other"]},"details":{"type":"string","description":"Why, as typed; at most 1,000 characters after normalising.","maxLength":4000},"email":{"type":"string","description":"Optional, never shown: where the site may answer the notice.","maxLength":254,"pattern":"^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$"},"challenge":{"$ref":"#/$defs/SubmissionChallenge"},"solution":{"$ref":"#/$defs/SubmissionSolution"},"turnstileToken":{"$ref":"#/$defs/SubmissionTurnstileToken"},"website":{"$ref":"#/$defs/SubmissionHoneypot"}}}],"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"SubmissionChallenge":{"type":"string","description":"The signed proof-of-work challenge from `GET /__cloudhal/comments/challenge`, as issued (base64url segments joined by dots).","minLength":16,"maxLength":512,"pattern":"^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$"},"SubmissionCommentId":{"type":"string","pattern":"^cmt_[A-Za-z0-9]{6,32}$"},"SubmissionHoneypot":{"type":"string","description":"A field people never see. The schema accepts any short value so that a filled honeypot gets the same answer as a real submission (\"held for moderation\") and nothing is stored.","maxLength":2048},"SubmissionSolution":{"type":"string","description":"The counter that solves the challenge, in decimal.","pattern":"^(?:0|[1-9][0-9]{0,15})$"},"SubmissionTurnstileToken":{"type":"string","description":"Cloudflare Turnstile's response token, when the site turned Turnstile on.","minLength":1,"maxLength":2048}}};
const schema332 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema333 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema334 = {"type":"string","pattern":"^cmt_[A-Za-z0-9]{6,32}$"};
const schema335 = {"type":"string","description":"The signed proof-of-work challenge from `GET /__cloudhal/comments/challenge`, as issued (base64url segments joined by dots).","minLength":16,"maxLength":512,"pattern":"^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$"};
const schema336 = {"type":"string","description":"The counter that solves the challenge, in decimal.","pattern":"^(?:0|[1-9][0-9]{0,15})$"};
const schema337 = {"type":"string","description":"Cloudflare Turnstile's response token, when the site turned Turnstile on.","minLength":1,"maxLength":2048};
const schema338 = {"type":"string","description":"A field people never see. The schema accepts any short value so that a filled honeypot gets the same answer as a real submission (\"held for moderation\") and nothing is stored.","maxLength":2048};
const pattern157 = new RegExp("^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$", "u");
const pattern158 = new RegExp("^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$", "u");
const pattern159 = new RegExp("^(?:0|[1-9][0-9]{0,15})$", "u");

function validate121(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/comment-submission.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate121.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.nodeId === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.name === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.body === undefined){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "body"},message:"must have required property '"+"body"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema331.oneOf[0].properties, key0))){
const err5 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err6 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!(data0 === 1)){
const err7 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema332.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(data1 === "comment")){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema331.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.nodeId !== undefined){
let data2 = data.nodeId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err10 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func2(data2) < 8){
const err11 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!pattern4.test(data2)){
const err12 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err13 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.parentId !== undefined){
let data3 = data.parentId;
if(typeof data3 === "string"){
if(!pattern141.test(data3)){
const err14 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/SubmissionCommentId/pattern",keyword:"pattern",params:{pattern: "^cmt_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^cmt_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/parentId",schemaPath:"#/$defs/SubmissionCommentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.name !== undefined){
let data4 = data.name;
if(typeof data4 === "string"){
if(func2(data4) > 200){
const err16 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/0/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func2(data4) < 1){
const err17 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/0/properties/name/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/name",schemaPath:"#/oneOf/0/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.email !== undefined){
let data5 = data.email;
if(typeof data5 === "string"){
if(func2(data5) > 254){
const err19 = {instancePath:instancePath+"/email",schemaPath:"#/oneOf/0/properties/email/maxLength",keyword:"maxLength",params:{limit: 254},message:"must NOT have more than 254 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!pattern157.test(data5)){
const err20 = {instancePath:instancePath+"/email",schemaPath:"#/oneOf/0/properties/email/pattern",keyword:"pattern",params:{pattern: "^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$"},message:"must match pattern \""+"^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$"+"\""};
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
const err21 = {instancePath:instancePath+"/email",schemaPath:"#/oneOf/0/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.body !== undefined){
let data6 = data.body;
if(typeof data6 === "string"){
if(func2(data6) > 20000){
const err22 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/0/properties/body/maxLength",keyword:"maxLength",params:{limit: 20000},message:"must NOT have more than 20000 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(func2(data6) < 1){
const err23 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/0/properties/body/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/0/properties/body/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.challenge !== undefined){
let data7 = data.challenge;
if(typeof data7 === "string"){
if(func2(data7) > 512){
const err25 = {instancePath:instancePath+"/challenge",schemaPath:"#/$defs/SubmissionChallenge/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(func2(data7) < 16){
const err26 = {instancePath:instancePath+"/challenge",schemaPath:"#/$defs/SubmissionChallenge/minLength",keyword:"minLength",params:{limit: 16},message:"must NOT have fewer than 16 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!pattern158.test(data7)){
const err27 = {instancePath:instancePath+"/challenge",schemaPath:"#/$defs/SubmissionChallenge/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$"},message:"must match pattern \""+"^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$"+"\""};
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
const err28 = {instancePath:instancePath+"/challenge",schemaPath:"#/$defs/SubmissionChallenge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.solution !== undefined){
let data8 = data.solution;
if(typeof data8 === "string"){
if(!pattern159.test(data8)){
const err29 = {instancePath:instancePath+"/solution",schemaPath:"#/$defs/SubmissionSolution/pattern",keyword:"pattern",params:{pattern: "^(?:0|[1-9][0-9]{0,15})$"},message:"must match pattern \""+"^(?:0|[1-9][0-9]{0,15})$"+"\""};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/solution",schemaPath:"#/$defs/SubmissionSolution/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.turnstileToken !== undefined){
let data9 = data.turnstileToken;
if(typeof data9 === "string"){
if(func2(data9) > 2048){
const err31 = {instancePath:instancePath+"/turnstileToken",schemaPath:"#/$defs/SubmissionTurnstileToken/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(func2(data9) < 1){
const err32 = {instancePath:instancePath+"/turnstileToken",schemaPath:"#/$defs/SubmissionTurnstileToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/turnstileToken",schemaPath:"#/$defs/SubmissionTurnstileToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.website !== undefined){
let data10 = data.website;
if(typeof data10 === "string"){
if(func2(data10) > 2048){
const err34 = {instancePath:instancePath+"/website",schemaPath:"#/$defs/SubmissionHoneypot/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/website",schemaPath:"#/$defs/SubmissionHoneypot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
else {
const err36 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs33 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schemaVersion === undefined){
const err37 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "schemaVersion"},message:"must have required property '"+"schemaVersion"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(data.kind === undefined){
const err38 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data.commentId === undefined){
const err39 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "commentId"},message:"must have required property '"+"commentId"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(data.reason === undefined){
const err40 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "reason"},message:"must have required property '"+"reason"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
for(const key1 in data){
if(!(func1.call(schema331.oneOf[1].properties, key1))){
const err41 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data11 = data.schemaVersion;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err42 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(!(data11 === 1)){
const err43 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema332.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.kind !== undefined){
let data12 = data.kind;
if(typeof data12 !== "string"){
const err44 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(!(data12 === "report")){
const err45 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema331.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data.commentId !== undefined){
let data13 = data.commentId;
if(typeof data13 === "string"){
if(!pattern141.test(data13)){
const err46 = {instancePath:instancePath+"/commentId",schemaPath:"#/$defs/SubmissionCommentId/pattern",keyword:"pattern",params:{pattern: "^cmt_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^cmt_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
else {
const err47 = {instancePath:instancePath+"/commentId",schemaPath:"#/$defs/SubmissionCommentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data.reason !== undefined){
let data14 = data.reason;
if(typeof data14 !== "string"){
const err48 = {instancePath:instancePath+"/reason",schemaPath:"#/oneOf/1/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(!(((((data14 === "spam") || (data14 === "abuse")) || (data14 === "personal-data")) || (data14 === "illegal-content")) || (data14 === "other"))){
const err49 = {instancePath:instancePath+"/reason",schemaPath:"#/oneOf/1/properties/reason/enum",keyword:"enum",params:{allowedValues: schema331.oneOf[1].properties.reason.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data.details !== undefined){
let data15 = data.details;
if(typeof data15 === "string"){
if(func2(data15) > 4000){
const err50 = {instancePath:instancePath+"/details",schemaPath:"#/oneOf/1/properties/details/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
else {
const err51 = {instancePath:instancePath+"/details",schemaPath:"#/oneOf/1/properties/details/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.email !== undefined){
let data16 = data.email;
if(typeof data16 === "string"){
if(func2(data16) > 254){
const err52 = {instancePath:instancePath+"/email",schemaPath:"#/oneOf/1/properties/email/maxLength",keyword:"maxLength",params:{limit: 254},message:"must NOT have more than 254 characters"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(!pattern157.test(data16)){
const err53 = {instancePath:instancePath+"/email",schemaPath:"#/oneOf/1/properties/email/pattern",keyword:"pattern",params:{pattern: "^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$"},message:"must match pattern \""+"^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$"+"\""};
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
const err54 = {instancePath:instancePath+"/email",schemaPath:"#/oneOf/1/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data.challenge !== undefined){
let data17 = data.challenge;
if(typeof data17 === "string"){
if(func2(data17) > 512){
const err55 = {instancePath:instancePath+"/challenge",schemaPath:"#/$defs/SubmissionChallenge/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(func2(data17) < 16){
const err56 = {instancePath:instancePath+"/challenge",schemaPath:"#/$defs/SubmissionChallenge/minLength",keyword:"minLength",params:{limit: 16},message:"must NOT have fewer than 16 characters"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(!pattern158.test(data17)){
const err57 = {instancePath:instancePath+"/challenge",schemaPath:"#/$defs/SubmissionChallenge/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$"},message:"must match pattern \""+"^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$"+"\""};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
else {
const err58 = {instancePath:instancePath+"/challenge",schemaPath:"#/$defs/SubmissionChallenge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data.solution !== undefined){
let data18 = data.solution;
if(typeof data18 === "string"){
if(!pattern159.test(data18)){
const err59 = {instancePath:instancePath+"/solution",schemaPath:"#/$defs/SubmissionSolution/pattern",keyword:"pattern",params:{pattern: "^(?:0|[1-9][0-9]{0,15})$"},message:"must match pattern \""+"^(?:0|[1-9][0-9]{0,15})$"+"\""};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
else {
const err60 = {instancePath:instancePath+"/solution",schemaPath:"#/$defs/SubmissionSolution/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data.turnstileToken !== undefined){
let data19 = data.turnstileToken;
if(typeof data19 === "string"){
if(func2(data19) > 2048){
const err61 = {instancePath:instancePath+"/turnstileToken",schemaPath:"#/$defs/SubmissionTurnstileToken/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(func2(data19) < 1){
const err62 = {instancePath:instancePath+"/turnstileToken",schemaPath:"#/$defs/SubmissionTurnstileToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
else {
const err63 = {instancePath:instancePath+"/turnstileToken",schemaPath:"#/$defs/SubmissionTurnstileToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.website !== undefined){
let data20 = data.website;
if(typeof data20 === "string"){
if(func2(data20) > 2048){
const err64 = {instancePath:instancePath+"/website",schemaPath:"#/$defs/SubmissionHoneypot/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
else {
const err65 = {instancePath:instancePath+"/website",schemaPath:"#/$defs/SubmissionHoneypot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
}
else {
const err66 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
var _valid0 = _errs33 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err67 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate121.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate121.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateRelease = validate122;
const schema345 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/release.schema.json","title":"Release","description":"A scheduled content change set (RFC-0008): node versions pinned by id, rev and content hash, applied on top of whatever is live at the release's time. A single scheduled publish is a one-item release. Each item records the version that was live when the release was pinned (`base`); if a pinned node or its live base changed before the release runs, the release is held as a conflict instead of overwriting anything. A person's approval is bound to `hash` (`rl1:`), which digests the items only, so a person may move an approved release without re-approving it while an agent's move or any content change voids the approval. Releases live in D1 next to the graph; they are not graph nodes, never enter a snapshot and are not part of site bundles.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","items","state","hash","createdBy","createdAt","updatedAt","rev"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/ReleaseId"},"siteId":{"$ref":"#/$defs/Id"},"title":{"type":"string","description":"Optional name shown in Studio (\"Election night\"). A one-item release without a title is shown under its entry's or page's title.","minLength":1,"maxLength":200,"pattern":"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"},"items":{"type":"array","description":"The pinned changes, at most one per node. A release never contains the site node: site settings, domains and structure are published the ordinary way.","items":{"$ref":"#/$defs/ReleaseItem"},"minItems":1,"maxItems":100},"when":{"$ref":"#/$defs/ReleaseWhen"},"state":{"$ref":"#/$defs/ReleaseState"},"hash":{"$ref":"#/$defs/ReleaseHash"},"approval":{"$ref":"#/$defs/ReleaseApproval"},"outcome":{"$ref":"#/$defs/ReleaseOutcome"},"createdBy":{"$ref":"#/$defs/Actor"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"rev":{"$ref":"#/$defs/Revision"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"LocalDateTime":{"type":"string","description":"A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008).","pattern":"^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"ReleaseApproval":{"description":"Why the release may run, discriminated by `kind`.","oneOf":[{"type":"object","title":"ReleasePersonApproval","description":"A person approved these items (bound to `hash`) for `executeAt`, either by deciding an agent's request (`approvalId`) or by scheduling it themselves. The person's rights are checked again when the release runs.","additionalProperties":false,"required":["kind","by","at"],"properties":{"kind":{"type":"string","enum":["person"]},"by":{"$ref":"#/$defs/ReleasePerson"},"at":{"$ref":"#/$defs/Timestamp"},"executeAt":{"$ref":"#/$defs/Timestamp"},"approvalId":{"$ref":"#/$defs/Id"}}},{"type":"object","title":"ReleaseAutoApproval","description":"An agent key in `auto` mode scheduled a low-risk release without a person (ADR-0015). Valid only while the release runs before `windowEnds`: the end of the key's elevation, or 24 hours after scheduling, whichever comes first.","additionalProperties":false,"required":["kind","by","keyId","at","windowEnds"],"properties":{"kind":{"type":"string","enum":["auto"]},"by":{"$ref":"#/$defs/Actor"},"keyId":{"type":"string","pattern":"^[A-Za-z0-9_-]{6,64}$"},"at":{"$ref":"#/$defs/Timestamp"},"windowEnds":{"$ref":"#/$defs/Timestamp"}}}]},"ReleaseConflict":{"type":"object","description":"A node whose live version was not the pinned base when the release ran. `expected` absent: the node was not expected to be live; `found` absent: it was not live.","additionalProperties":false,"required":["nodeId"],"properties":{"nodeId":{"$ref":"#/$defs/Id"},"expected":{"$ref":"#/$defs/ReleaseNodeVersion"},"found":{"$ref":"#/$defs/ReleaseNodeVersion"}}},"ReleaseHash":{"type":"string","description":"`rl1:` and the lower-case hex SHA-256 of the release's canonical item lines (site id, then one line per item sorted by node id: kind, node id, target and base versions). The prefix keeps it apart from the graph state hash and from comment bindings (`cm1:`); approvals store it as their state.","pattern":"^rl1:[0-9a-f]{64}$"},"ReleaseId":{"type":"string","description":"A release id: `rel_` and 6 to 32 letters or digits.","pattern":"^rel_[A-Za-z0-9]{6,32}$"},"ReleaseItem":{"description":"One pinned change, discriminated by `kind`.","oneOf":[{"type":"object","title":"ReleaseSetItem","description":"Make `target` the live version of the node. `base` is the version that was live when the item was pinned; absent when the node was not live (a new entry or page).","additionalProperties":false,"required":["kind","nodeId","nodeKind","target"],"properties":{"kind":{"type":"string","enum":["set"]},"nodeId":{"$ref":"#/$defs/Id"},"nodeKind":{"$ref":"#/$defs/ReleaseNodeKind"},"target":{"$ref":"#/$defs/ReleaseNodeVersion"},"base":{"$ref":"#/$defs/ReleaseNodeVersion"}}},{"type":"object","title":"ReleaseRemoveItem","description":"Take the node out of the live snapshot. `base` is the live version that is removed.","additionalProperties":false,"required":["kind","nodeId","nodeKind","base"],"properties":{"kind":{"type":"string","enum":["remove"]},"nodeId":{"$ref":"#/$defs/Id"},"nodeKind":{"$ref":"#/$defs/ReleaseNodeKind"},"base":{"$ref":"#/$defs/ReleaseNodeVersion"}}}]},"ReleaseNodeKind":{"type":"string","description":"Kinds of graph node a release may carry. The site node is never one of them.","enum":["page","contentEntry","taxonomy","term","redirect","menu","asset"]},"ReleaseNodeVersion":{"type":"object","description":"One version of a node: its revision and the SHA-256 of its canonical JSON, whose body the blob store keeps under `nodes/<hash>.json`.","additionalProperties":false,"required":["rev","hash"],"properties":{"rev":{"$ref":"#/$defs/Revision"},"hash":{"type":"string","pattern":"^[0-9a-f]{64}$"}}},"ReleaseOutcome":{"description":"What happened when the release was due, discriminated by `kind` (it matches the terminal `state`).","oneOf":[{"type":"object","title":"ReleasePublishedOutcome","description":"Applied: `snapshotId` is the new live snapshot (reason `scheduled`), composed from `baseSnapshotId` and the items. `purge` says how the edge cache followed.","additionalProperties":false,"required":["kind","runId","at","snapshotId","baseSnapshotId","latenessSeconds","purge"],"properties":{"kind":{"type":"string","enum":["published"]},"runId":{"$ref":"#/$defs/Id"},"at":{"$ref":"#/$defs/Timestamp"},"snapshotId":{"$ref":"#/$defs/Id"},"baseSnapshotId":{"$ref":"#/$defs/Id"},"latenessSeconds":{"type":"integer","minimum":0},"purge":{"type":"string","enum":["tags","everything","deferred","failed","none"]}}},{"type":"object","title":"ReleaseConflictOutcome","description":"Held: these nodes changed since the release was pinned. Nothing was published.","additionalProperties":false,"required":["kind","at","conflicts"],"properties":{"kind":{"type":"string","enum":["conflict"]},"runId":{"$ref":"#/$defs/Id"},"at":{"$ref":"#/$defs/Timestamp"},"conflicts":{"type":"array","items":{"$ref":"#/$defs/ReleaseConflict"},"minItems":1,"maxItems":100}}},{"type":"object","title":"ReleaseFailedOutcome","description":"Refused at run time; nothing was published.","additionalProperties":false,"required":["kind","at","code"],"properties":{"kind":{"type":"string","enum":["failed"]},"runId":{"$ref":"#/$defs/Id"},"at":{"$ref":"#/$defs/Timestamp"},"code":{"type":"string","enum":["dependency_missing","invalid_snapshot","site_missing","node_body_missing","store_error"]},"message":{"type":"string","maxLength":500,"pattern":"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"}}},{"type":"object","title":"ReleaseMissedOutcome","description":"The scheduler reached the release more than an hour after its time; nothing was published. A person may publish it now.","additionalProperties":false,"required":["kind","at","latenessSeconds"],"properties":{"kind":{"type":"string","enum":["missed"]},"at":{"$ref":"#/$defs/Timestamp"},"latenessSeconds":{"type":"integer","minimum":0}}},{"type":"object","title":"ReleaseExpiredOutcome","description":"No valid approval when the release was due: never approved, the approver can no longer publish it, the agent's `auto` window ended, or its creator left.","additionalProperties":false,"required":["kind","at","reason"],"properties":{"kind":{"type":"string","enum":["expired"]},"at":{"$ref":"#/$defs/Timestamp"},"reason":{"type":"string","enum":["unapproved","approval_lost","auto_window_ended","creator_removed"]}}},{"type":"object","title":"ReleaseCanceledOutcome","description":"Withdrawn by a person or an agent; its nodes are unlocked.","additionalProperties":false,"required":["kind","at","by"],"properties":{"kind":{"type":"string","enum":["canceled"]},"at":{"$ref":"#/$defs/Timestamp"},"by":{"$ref":"#/$defs/Actor"}}}]},"ReleasePerson":{"type":"object","description":"A staff person (`user_…`). Agents never appear here.","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"string","pattern":"^user_[A-Za-z0-9]{6,32}$"},"name":{"type":"string","maxLength":200}}},"ReleaseState":{"type":"string","description":"Lifecycle. `draft`: proposed or being assembled, nothing locked. `awaiting_approval`: waiting for a person; its nodes are locked. `scheduled`: approved (or allowed by `auto` mode) and locked until it runs. `running`: claimed by the scheduler. `published`: applied; `outcome` names the snapshot. `conflict`: a pinned node or its live base changed; held, nothing published. `missed`: the scheduler reached it more than an hour late; nothing published. `expired`: no valid approval at its time. `failed`: refused at run time (e.g. a dependency is missing). `canceled`: withdrawn.","enum":["draft","awaiting_approval","scheduled","running","published","conflict","missed","expired","failed","canceled"]},"ReleaseWhen":{"description":"When the release runs, discriminated by `kind`. Absent while a draft has no time yet.","oneOf":[{"type":"object","title":"ReleaseAt","description":"At an instant. `at` is what the scheduler compares with the clock; when a person entered a wall-clock time, `localTime` keeps it and `at` is recomputed from it and `timeZone` before the release runs, never earlier than the wall-clock time.","additionalProperties":false,"required":["kind","at","timeZone"],"properties":{"kind":{"type":"string","enum":["at"]},"at":{"$ref":"#/$defs/Timestamp"},"timeZone":{"$ref":"#/$defs/TimeZone"},"localTime":{"$ref":"#/$defs/LocalDateTime"}}},{"type":"object","title":"ReleaseOnApproval","description":"As soon as it is approved (a gate-only change such as setting an expiry on live content, or \"publish when approved\").","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["on-approval"]}}}]},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"},"TimeZone":{"type":"string","description":"IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.","pattern":"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$","maxLength":64}}};
const schema346 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema347 = {"type":"string","description":"A release id: `rel_` and 6 to 32 letters or digits.","pattern":"^rel_[A-Za-z0-9]{6,32}$"};
const schema348 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema360 = {"type":"string","description":"Lifecycle. `draft`: proposed or being assembled, nothing locked. `awaiting_approval`: waiting for a person; its nodes are locked. `scheduled`: approved (or allowed by `auto` mode) and locked until it runs. `running`: claimed by the scheduler. `published`: applied; `outcome` names the snapshot. `conflict`: a pinned node or its live base changed; held, nothing published. `missed`: the scheduler reached it more than an hour late; nothing published. `expired`: no valid approval at its time. `failed`: refused at run time (e.g. a dependency is missing). `canceled`: withdrawn.","enum":["draft","awaiting_approval","scheduled","running","published","conflict","missed","expired","failed","canceled"]};
const schema361 = {"type":"string","description":"`rl1:` and the lower-case hex SHA-256 of the release's canonical item lines (site id, then one line per item sorted by node id: kind, node id, target and base versions). The prefix keeps it apart from the graph state hash and from comment bindings (`cm1:`); approvals store it as their state.","pattern":"^rl1:[0-9a-f]{64}$"};
const schema357 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema353 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema389 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern164 = new RegExp("^rel_[A-Za-z0-9]{6,32}$", "u");
const pattern166 = new RegExp("^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$", "u");
const pattern172 = new RegExp("^rl1:[0-9a-f]{64}$", "u");
const schema349 = {"description":"One pinned change, discriminated by `kind`.","oneOf":[{"type":"object","title":"ReleaseSetItem","description":"Make `target` the live version of the node. `base` is the version that was live when the item was pinned; absent when the node was not live (a new entry or page).","additionalProperties":false,"required":["kind","nodeId","nodeKind","target"],"properties":{"kind":{"type":"string","enum":["set"]},"nodeId":{"$ref":"#/$defs/Id"},"nodeKind":{"$ref":"#/$defs/ReleaseNodeKind"},"target":{"$ref":"#/$defs/ReleaseNodeVersion"},"base":{"$ref":"#/$defs/ReleaseNodeVersion"}}},{"type":"object","title":"ReleaseRemoveItem","description":"Take the node out of the live snapshot. `base` is the live version that is removed.","additionalProperties":false,"required":["kind","nodeId","nodeKind","base"],"properties":{"kind":{"type":"string","enum":["remove"]},"nodeId":{"$ref":"#/$defs/Id"},"nodeKind":{"$ref":"#/$defs/ReleaseNodeKind"},"base":{"$ref":"#/$defs/ReleaseNodeVersion"}}}]};
const schema351 = {"type":"string","description":"Kinds of graph node a release may carry. The site node is never one of them.","enum":["page","contentEntry","taxonomy","term","redirect","menu","asset"]};
const schema352 = {"type":"object","description":"One version of a node: its revision and the SHA-256 of its canonical JSON, whose body the blob store keeps under `nodes/<hash>.json`.","additionalProperties":false,"required":["rev","hash"],"properties":{"rev":{"$ref":"#/$defs/Revision"},"hash":{"type":"string","pattern":"^[0-9a-f]{64}$"}}};

function validate124(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate124.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.rev === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.hash === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hash"},message:"must have required property '"+"hash"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "rev") || (key0 === "hash"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.rev !== undefined){
let data0 = data.rev;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err3 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if((typeof data0 == "number") && (isFinite(data0))){
if(data0 < 0 || isNaN(data0)){
const err4 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
if(data.hash !== undefined){
let data1 = data.hash;
if(typeof data1 === "string"){
if(!pattern27.test(data1)){
const err5 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/pattern",keyword:"pattern",params:{pattern: "^[0-9a-f]{64}$"},message:"must match pattern \""+"^[0-9a-f]{64}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/hash",schemaPath:"#/properties/hash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate124.errors = vErrors;
return errors === 0;
}
validate124.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate123(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate123.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.nodeId === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.nodeKind === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "nodeKind"},message:"must have required property '"+"nodeKind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.target === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "target"},message:"must have required property '"+"target"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "kind") || (key0 === "nodeId")) || (key0 === "nodeKind")) || (key0 === "target")) || (key0 === "base"))){
const err4 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err5 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!(data0 === "set")){
const err6 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema349.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.nodeId !== undefined){
let data1 = data.nodeId;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err7 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func2(data1) < 8){
const err8 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!pattern4.test(data1)){
const err9 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.nodeKind !== undefined){
let data2 = data.nodeKind;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/ReleaseNodeKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!(((((((data2 === "page") || (data2 === "contentEntry")) || (data2 === "taxonomy")) || (data2 === "term")) || (data2 === "redirect")) || (data2 === "menu")) || (data2 === "asset"))){
const err12 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/ReleaseNodeKind/enum",keyword:"enum",params:{allowedValues: schema351.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.target !== undefined){
if(!(validate124(data.target, {instancePath:instancePath+"/target",parentData:data,parentDataProperty:"target",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate124.errors : vErrors.concat(validate124.errors);
errors = vErrors.length;
}
}
if(data.base !== undefined){
if(!(validate124(data.base, {instancePath:instancePath+"/base",parentData:data,parentDataProperty:"base",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate124.errors : vErrors.concat(validate124.errors);
errors = vErrors.length;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs14 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err14 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.nodeId === undefined){
const err15 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.nodeKind === undefined){
const err16 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "nodeKind"},message:"must have required property '"+"nodeKind"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.base === undefined){
const err17 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "base"},message:"must have required property '"+"base"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
for(const key1 in data){
if(!((((key1 === "kind") || (key1 === "nodeId")) || (key1 === "nodeKind")) || (key1 === "base"))){
const err18 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.kind !== undefined){
let data5 = data.kind;
if(typeof data5 !== "string"){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!(data5 === "remove")){
const err20 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema349.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.nodeId !== undefined){
let data6 = data.nodeId;
if(typeof data6 === "string"){
if(func2(data6) > 48){
const err21 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(func2(data6) < 8){
const err22 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!pattern4.test(data6)){
const err23 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.nodeKind !== undefined){
let data7 = data.nodeKind;
if(typeof data7 !== "string"){
const err25 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/ReleaseNodeKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!(((((((data7 === "page") || (data7 === "contentEntry")) || (data7 === "taxonomy")) || (data7 === "term")) || (data7 === "redirect")) || (data7 === "menu")) || (data7 === "asset"))){
const err26 = {instancePath:instancePath+"/nodeKind",schemaPath:"#/$defs/ReleaseNodeKind/enum",keyword:"enum",params:{allowedValues: schema351.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.base !== undefined){
if(!(validate124(data.base, {instancePath:instancePath+"/base",parentData:data,parentDataProperty:"base",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate124.errors : vErrors.concat(validate124.errors);
errors = vErrors.length;
}
}
}
else {
const err27 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var _valid0 = _errs14 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err28 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate123.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate123.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema356 = {"description":"When the release runs, discriminated by `kind`. Absent while a draft has no time yet.","oneOf":[{"type":"object","title":"ReleaseAt","description":"At an instant. `at` is what the scheduler compares with the clock; when a person entered a wall-clock time, `localTime` keeps it and `at` is recomputed from it and `timeZone` before the release runs, never earlier than the wall-clock time.","additionalProperties":false,"required":["kind","at","timeZone"],"properties":{"kind":{"type":"string","enum":["at"]},"at":{"$ref":"#/$defs/Timestamp"},"timeZone":{"$ref":"#/$defs/TimeZone"},"localTime":{"$ref":"#/$defs/LocalDateTime"}}},{"type":"object","title":"ReleaseOnApproval","description":"As soon as it is approved (a gate-only change such as setting an expiry on live content, or \"publish when approved\").","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["on-approval"]}}}]};
const schema358 = {"type":"string","description":"IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.","pattern":"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$","maxLength":64};
const schema359 = {"type":"string","description":"A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008).","pattern":"^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"};
const pattern171 = new RegExp("^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$", "u");

function validate129(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate129.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.at === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.timeZone === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "timeZone"},message:"must have required property '"+"timeZone"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "kind") || (key0 === "at")) || (key0 === "timeZone")) || (key0 === "localTime"))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!(data0 === "at")){
const err5 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema356.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.at !== undefined){
let data1 = data.at;
if(typeof data1 === "string"){
if(!(formats0.validate(data1))){
const err6 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err7 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.timeZone !== undefined){
let data2 = data.timeZone;
if(typeof data2 === "string"){
if(func2(data2) > 64){
const err8 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!pattern17.test(data2)){
const err9 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/pattern",keyword:"pattern",params:{pattern: "^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$"},message:"must match pattern \""+"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.localTime !== undefined){
let data3 = data.localTime;
if(typeof data3 === "string"){
if(!pattern171.test(data3)){
const err11 = {instancePath:instancePath+"/localTime",schemaPath:"#/$defs/LocalDateTime/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},message:"must match pattern \""+"^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/localTime",schemaPath:"#/$defs/LocalDateTime/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs15 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err14 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
for(const key1 in data){
if(!(key1 === "kind")){
const err15 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.kind !== undefined){
let data4 = data.kind;
if(typeof data4 !== "string"){
const err16 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(data4 === "on-approval")){
const err17 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema356.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
else {
const err18 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var _valid0 = _errs15 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err19 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate129.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate129.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema362 = {"description":"Why the release may run, discriminated by `kind`.","oneOf":[{"type":"object","title":"ReleasePersonApproval","description":"A person approved these items (bound to `hash`) for `executeAt`, either by deciding an agent's request (`approvalId`) or by scheduling it themselves. The person's rights are checked again when the release runs.","additionalProperties":false,"required":["kind","by","at"],"properties":{"kind":{"type":"string","enum":["person"]},"by":{"$ref":"#/$defs/ReleasePerson"},"at":{"$ref":"#/$defs/Timestamp"},"executeAt":{"$ref":"#/$defs/Timestamp"},"approvalId":{"$ref":"#/$defs/Id"}}},{"type":"object","title":"ReleaseAutoApproval","description":"An agent key in `auto` mode scheduled a low-risk release without a person (ADR-0015). Valid only while the release runs before `windowEnds`: the end of the key's elevation, or 24 hours after scheduling, whichever comes first.","additionalProperties":false,"required":["kind","by","keyId","at","windowEnds"],"properties":{"kind":{"type":"string","enum":["auto"]},"by":{"$ref":"#/$defs/Actor"},"keyId":{"type":"string","pattern":"^[A-Za-z0-9_-]{6,64}$"},"at":{"$ref":"#/$defs/Timestamp"},"windowEnds":{"$ref":"#/$defs/Timestamp"}}}]};
const schema363 = {"type":"object","description":"A staff person (`user_…`). Agents never appear here.","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"string","pattern":"^user_[A-Za-z0-9]{6,32}$"},"name":{"type":"string","maxLength":200}}};
const pattern176 = new RegExp("^[A-Za-z0-9_-]{6,64}$", "u");
const schema367 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema368 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate132(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate132.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "id")) || (key0 === "name"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(((data0 === "human") || (data0 === "agent")) || (data0 === "system"))){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema368.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err5 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func2(data1) < 8){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data1)){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.name !== undefined){
let data2 = data.name;
if(typeof data2 === "string"){
if(func2(data2) > 200){
const err9 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate132.errors = vErrors;
return errors === 0;
}
validate132.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate131(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate131.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.by === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "by"},message:"must have required property '"+"by"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.at === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "kind") || (key0 === "by")) || (key0 === "at")) || (key0 === "executeAt")) || (key0 === "approvalId"))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!(data0 === "person")){
const err5 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema362.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.by !== undefined){
let data1 = data.by;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err6 = {instancePath:instancePath+"/by",schemaPath:"#/$defs/ReleasePerson/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "id") || (key1 === "name"))){
const err7 = {instancePath:instancePath+"/by",schemaPath:"#/$defs/ReleasePerson/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.id !== undefined){
let data2 = data1.id;
if(typeof data2 === "string"){
if(!pattern150.test(data2)){
const err8 = {instancePath:instancePath+"/by/id",schemaPath:"#/$defs/ReleasePerson/properties/id/pattern",keyword:"pattern",params:{pattern: "^user_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^user_[A-Za-z0-9]{6,32}$"+"\""};
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
const err9 = {instancePath:instancePath+"/by/id",schemaPath:"#/$defs/ReleasePerson/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.name !== undefined){
let data3 = data1.name;
if(typeof data3 === "string"){
if(func2(data3) > 200){
const err10 = {instancePath:instancePath+"/by/name",schemaPath:"#/$defs/ReleasePerson/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/by/name",schemaPath:"#/$defs/ReleasePerson/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath:instancePath+"/by",schemaPath:"#/$defs/ReleasePerson/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.at !== undefined){
let data4 = data.at;
if(typeof data4 === "string"){
if(!(formats0.validate(data4))){
const err13 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err14 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.executeAt !== undefined){
let data5 = data.executeAt;
if(typeof data5 === "string"){
if(!(formats0.validate(data5))){
const err15 = {instancePath:instancePath+"/executeAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err16 = {instancePath:instancePath+"/executeAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.approvalId !== undefined){
let data6 = data.approvalId;
if(typeof data6 === "string"){
if(func2(data6) > 48){
const err17 = {instancePath:instancePath+"/approvalId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(func2(data6) < 8){
const err18 = {instancePath:instancePath+"/approvalId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!pattern4.test(data6)){
const err19 = {instancePath:instancePath+"/approvalId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/approvalId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err21 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs23 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err22 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data.by === undefined){
const err23 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "by"},message:"must have required property '"+"by"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.keyId === undefined){
const err24 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "keyId"},message:"must have required property '"+"keyId"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data.at === undefined){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.windowEnds === undefined){
const err26 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "windowEnds"},message:"must have required property '"+"windowEnds"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key2 in data){
if(!(((((key2 === "kind") || (key2 === "by")) || (key2 === "keyId")) || (key2 === "at")) || (key2 === "windowEnds"))){
const err27 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.kind !== undefined){
let data7 = data.kind;
if(typeof data7 !== "string"){
const err28 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(!(data7 === "auto")){
const err29 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema362.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.by !== undefined){
if(!(validate132(data.by, {instancePath:instancePath+"/by",parentData:data,parentDataProperty:"by",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate132.errors : vErrors.concat(validate132.errors);
errors = vErrors.length;
}
}
if(data.keyId !== undefined){
let data9 = data.keyId;
if(typeof data9 === "string"){
if(!pattern176.test(data9)){
const err30 = {instancePath:instancePath+"/keyId",schemaPath:"#/oneOf/1/properties/keyId/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9_-]{6,64}$"},message:"must match pattern \""+"^[A-Za-z0-9_-]{6,64}$"+"\""};
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
const err31 = {instancePath:instancePath+"/keyId",schemaPath:"#/oneOf/1/properties/keyId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.at !== undefined){
let data10 = data.at;
if(typeof data10 === "string"){
if(!(formats0.validate(data10))){
const err32 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.windowEnds !== undefined){
let data11 = data.windowEnds;
if(typeof data11 === "string"){
if(!(formats0.validate(data11))){
const err34 = {instancePath:instancePath+"/windowEnds",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/windowEnds",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
else {
const err36 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var _valid0 = _errs23 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err37 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate131.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate131.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema372 = {"description":"What happened when the release was due, discriminated by `kind` (it matches the terminal `state`).","oneOf":[{"type":"object","title":"ReleasePublishedOutcome","description":"Applied: `snapshotId` is the new live snapshot (reason `scheduled`), composed from `baseSnapshotId` and the items. `purge` says how the edge cache followed.","additionalProperties":false,"required":["kind","runId","at","snapshotId","baseSnapshotId","latenessSeconds","purge"],"properties":{"kind":{"type":"string","enum":["published"]},"runId":{"$ref":"#/$defs/Id"},"at":{"$ref":"#/$defs/Timestamp"},"snapshotId":{"$ref":"#/$defs/Id"},"baseSnapshotId":{"$ref":"#/$defs/Id"},"latenessSeconds":{"type":"integer","minimum":0},"purge":{"type":"string","enum":["tags","everything","deferred","failed","none"]}}},{"type":"object","title":"ReleaseConflictOutcome","description":"Held: these nodes changed since the release was pinned. Nothing was published.","additionalProperties":false,"required":["kind","at","conflicts"],"properties":{"kind":{"type":"string","enum":["conflict"]},"runId":{"$ref":"#/$defs/Id"},"at":{"$ref":"#/$defs/Timestamp"},"conflicts":{"type":"array","items":{"$ref":"#/$defs/ReleaseConflict"},"minItems":1,"maxItems":100}}},{"type":"object","title":"ReleaseFailedOutcome","description":"Refused at run time; nothing was published.","additionalProperties":false,"required":["kind","at","code"],"properties":{"kind":{"type":"string","enum":["failed"]},"runId":{"$ref":"#/$defs/Id"},"at":{"$ref":"#/$defs/Timestamp"},"code":{"type":"string","enum":["dependency_missing","invalid_snapshot","site_missing","node_body_missing","store_error"]},"message":{"type":"string","maxLength":500,"pattern":"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"}}},{"type":"object","title":"ReleaseMissedOutcome","description":"The scheduler reached the release more than an hour after its time; nothing was published. A person may publish it now.","additionalProperties":false,"required":["kind","at","latenessSeconds"],"properties":{"kind":{"type":"string","enum":["missed"]},"at":{"$ref":"#/$defs/Timestamp"},"latenessSeconds":{"type":"integer","minimum":0}}},{"type":"object","title":"ReleaseExpiredOutcome","description":"No valid approval when the release was due: never approved, the approver can no longer publish it, the agent's `auto` window ended, or its creator left.","additionalProperties":false,"required":["kind","at","reason"],"properties":{"kind":{"type":"string","enum":["expired"]},"at":{"$ref":"#/$defs/Timestamp"},"reason":{"type":"string","enum":["unapproved","approval_lost","auto_window_ended","creator_removed"]}}},{"type":"object","title":"ReleaseCanceledOutcome","description":"Withdrawn by a person or an agent; its nodes are unlocked.","additionalProperties":false,"required":["kind","at","by"],"properties":{"kind":{"type":"string","enum":["canceled"]},"at":{"$ref":"#/$defs/Timestamp"},"by":{"$ref":"#/$defs/Actor"}}}]};
const pattern183 = new RegExp("^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$", "u");
const schema379 = {"type":"object","description":"A node whose live version was not the pinned base when the release ran. `expected` absent: the node was not expected to be live; `found` absent: it was not live.","additionalProperties":false,"required":["nodeId"],"properties":{"nodeId":{"$ref":"#/$defs/Id"},"expected":{"$ref":"#/$defs/ReleaseNodeVersion"},"found":{"$ref":"#/$defs/ReleaseNodeVersion"}}};

function validate136(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate136.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.nodeId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "nodeId"},message:"must have required property '"+"nodeId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "nodeId") || (key0 === "expected")) || (key0 === "found"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.nodeId !== undefined){
let data0 = data.nodeId;
if(typeof data0 === "string"){
if(func2(data0) > 48){
const err2 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(func2(data0) < 8){
const err3 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!pattern4.test(data0)){
const err4 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err5 = {instancePath:instancePath+"/nodeId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.expected !== undefined){
if(!(validate124(data.expected, {instancePath:instancePath+"/expected",parentData:data,parentDataProperty:"expected",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate124.errors : vErrors.concat(validate124.errors);
errors = vErrors.length;
}
}
if(data.found !== undefined){
if(!(validate124(data.found, {instancePath:instancePath+"/found",parentData:data,parentDataProperty:"found",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate124.errors : vErrors.concat(validate124.errors);
errors = vErrors.length;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate136.errors = vErrors;
return errors === 0;
}
validate136.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate135(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate135.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.runId === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "runId"},message:"must have required property '"+"runId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.at === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.snapshotId === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "snapshotId"},message:"must have required property '"+"snapshotId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.baseSnapshotId === undefined){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "baseSnapshotId"},message:"must have required property '"+"baseSnapshotId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.latenessSeconds === undefined){
const err5 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "latenessSeconds"},message:"must have required property '"+"latenessSeconds"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.purge === undefined){
const err6 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "purge"},message:"must have required property '"+"purge"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "kind") || (key0 === "runId")) || (key0 === "at")) || (key0 === "snapshotId")) || (key0 === "baseSnapshotId")) || (key0 === "latenessSeconds")) || (key0 === "purge"))){
const err7 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err8 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(data0 === "published")){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.runId !== undefined){
let data1 = data.runId;
if(typeof data1 === "string"){
if(func2(data1) > 48){
const err10 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func2(data1) < 8){
const err11 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!pattern4.test(data1)){
const err12 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err13 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.at !== undefined){
let data2 = data.at;
if(typeof data2 === "string"){
if(!(formats0.validate(data2))){
const err14 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.snapshotId !== undefined){
let data3 = data.snapshotId;
if(typeof data3 === "string"){
if(func2(data3) > 48){
const err16 = {instancePath:instancePath+"/snapshotId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func2(data3) < 8){
const err17 = {instancePath:instancePath+"/snapshotId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!pattern4.test(data3)){
const err18 = {instancePath:instancePath+"/snapshotId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err19 = {instancePath:instancePath+"/snapshotId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.baseSnapshotId !== undefined){
let data4 = data.baseSnapshotId;
if(typeof data4 === "string"){
if(func2(data4) > 48){
const err20 = {instancePath:instancePath+"/baseSnapshotId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(func2(data4) < 8){
const err21 = {instancePath:instancePath+"/baseSnapshotId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(!pattern4.test(data4)){
const err22 = {instancePath:instancePath+"/baseSnapshotId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err23 = {instancePath:instancePath+"/baseSnapshotId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.latenessSeconds !== undefined){
let data5 = data.latenessSeconds;
if(!(((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5))) && (isFinite(data5)))){
const err24 = {instancePath:instancePath+"/latenessSeconds",schemaPath:"#/oneOf/0/properties/latenessSeconds/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 < 0 || isNaN(data5)){
const err25 = {instancePath:instancePath+"/latenessSeconds",schemaPath:"#/oneOf/0/properties/latenessSeconds/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
if(data.purge !== undefined){
let data6 = data.purge;
if(typeof data6 !== "string"){
const err26 = {instancePath:instancePath+"/purge",schemaPath:"#/oneOf/0/properties/purge/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!(((((data6 === "tags") || (data6 === "everything")) || (data6 === "deferred")) || (data6 === "failed")) || (data6 === "none"))){
const err27 = {instancePath:instancePath+"/purge",schemaPath:"#/oneOf/0/properties/purge/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[0].properties.purge.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs22 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err29 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(data.at === undefined){
const err30 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data.conflicts === undefined){
const err31 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "conflicts"},message:"must have required property '"+"conflicts"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key1 in data){
if(!((((key1 === "kind") || (key1 === "runId")) || (key1 === "at")) || (key1 === "conflicts"))){
const err32 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.kind !== undefined){
let data7 = data.kind;
if(typeof data7 !== "string"){
const err33 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(!(data7 === "conflict")){
const err34 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.runId !== undefined){
let data8 = data.runId;
if(typeof data8 === "string"){
if(func2(data8) > 48){
const err35 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(func2(data8) < 8){
const err36 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(!pattern4.test(data8)){
const err37 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err38 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.at !== undefined){
let data9 = data.at;
if(typeof data9 === "string"){
if(!(formats0.validate(data9))){
const err39 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.conflicts !== undefined){
let data10 = data.conflicts;
if(Array.isArray(data10)){
if(data10.length > 100){
const err41 = {instancePath:instancePath+"/conflicts",schemaPath:"#/oneOf/1/properties/conflicts/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data10.length < 1){
const err42 = {instancePath:instancePath+"/conflicts",schemaPath:"#/oneOf/1/properties/conflicts/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
const len0 = data10.length;
for(let i0=0; i0<len0; i0++){
if(!(validate136(data10[i0], {instancePath:instancePath+"/conflicts/" + i0,parentData:data10,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate136.errors : vErrors.concat(validate136.errors);
errors = vErrors.length;
}
}
}
else {
const err43 = {instancePath:instancePath+"/conflicts",schemaPath:"#/oneOf/1/properties/conflicts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
else {
const err44 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid0 = _errs22 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs36 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err45 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(data.at === undefined){
const err46 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(data.code === undefined){
const err47 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
for(const key2 in data){
if(!(((((key2 === "kind") || (key2 === "runId")) || (key2 === "at")) || (key2 === "code")) || (key2 === "message"))){
const err48 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data.kind !== undefined){
let data12 = data.kind;
if(typeof data12 !== "string"){
const err49 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(!(data12 === "failed")){
const err50 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.runId !== undefined){
let data13 = data.runId;
if(typeof data13 === "string"){
if(func2(data13) > 48){
const err51 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(func2(data13) < 8){
const err52 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(!pattern4.test(data13)){
const err53 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err54 = {instancePath:instancePath+"/runId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data.at !== undefined){
let data14 = data.at;
if(typeof data14 === "string"){
if(!(formats0.validate(data14))){
const err55 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data.code !== undefined){
let data15 = data.code;
if(typeof data15 !== "string"){
const err57 = {instancePath:instancePath+"/code",schemaPath:"#/oneOf/2/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(!(((((data15 === "dependency_missing") || (data15 === "invalid_snapshot")) || (data15 === "site_missing")) || (data15 === "node_body_missing")) || (data15 === "store_error"))){
const err58 = {instancePath:instancePath+"/code",schemaPath:"#/oneOf/2/properties/code/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[2].properties.code.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data.message !== undefined){
let data16 = data.message;
if(typeof data16 === "string"){
if(func2(data16) > 500){
const err59 = {instancePath:instancePath+"/message",schemaPath:"#/oneOf/2/properties/message/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(!pattern183.test(data16)){
const err60 = {instancePath:instancePath+"/message",schemaPath:"#/oneOf/2/properties/message/pattern",keyword:"pattern",params:{pattern: "^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"},message:"must match pattern \""+"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"+"\""};
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
const err61 = {instancePath:instancePath+"/message",schemaPath:"#/oneOf/2/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err62 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
var _valid0 = _errs36 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs51 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err63 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(data.at === undefined){
const err64 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(data.latenessSeconds === undefined){
const err65 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "latenessSeconds"},message:"must have required property '"+"latenessSeconds"+"'"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
for(const key3 in data){
if(!(((key3 === "kind") || (key3 === "at")) || (key3 === "latenessSeconds"))){
const err66 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data.kind !== undefined){
let data17 = data.kind;
if(typeof data17 !== "string"){
const err67 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
if(!(data17 === "missed")){
const err68 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data.at !== undefined){
let data18 = data.at;
if(typeof data18 === "string"){
if(!(formats0.validate(data18))){
const err69 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
else {
const err70 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data.latenessSeconds !== undefined){
let data19 = data.latenessSeconds;
if(!(((typeof data19 == "number") && (!(data19 % 1) && !isNaN(data19))) && (isFinite(data19)))){
const err71 = {instancePath:instancePath+"/latenessSeconds",schemaPath:"#/oneOf/3/properties/latenessSeconds/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if((typeof data19 == "number") && (isFinite(data19))){
if(data19 < 0 || isNaN(data19)){
const err72 = {instancePath:instancePath+"/latenessSeconds",schemaPath:"#/oneOf/3/properties/latenessSeconds/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
}
}
else {
const err73 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var _valid0 = _errs51 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
const _errs61 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err74 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if(data.at === undefined){
const err75 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(data.reason === undefined){
const err76 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "reason"},message:"must have required property '"+"reason"+"'"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
for(const key4 in data){
if(!(((key4 === "kind") || (key4 === "at")) || (key4 === "reason"))){
const err77 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data.kind !== undefined){
let data20 = data.kind;
if(typeof data20 !== "string"){
const err78 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
if(!(data20 === "expired")){
const err79 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[4].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data.at !== undefined){
let data21 = data.at;
if(typeof data21 === "string"){
if(!(formats0.validate(data21))){
const err80 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err81 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data.reason !== undefined){
let data22 = data.reason;
if(typeof data22 !== "string"){
const err82 = {instancePath:instancePath+"/reason",schemaPath:"#/oneOf/4/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(!((((data22 === "unapproved") || (data22 === "approval_lost")) || (data22 === "auto_window_ended")) || (data22 === "creator_removed"))){
const err83 = {instancePath:instancePath+"/reason",schemaPath:"#/oneOf/4/properties/reason/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[4].properties.reason.enum},message:"must be equal to one of the allowed values"};
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
const err84 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
var _valid0 = _errs61 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
if(props0 !== true){
props0 = true;
}
}
const _errs71 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err85 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(data.at === undefined){
const err86 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
if(data.by === undefined){
const err87 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "by"},message:"must have required property '"+"by"+"'"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
for(const key5 in data){
if(!(((key5 === "kind") || (key5 === "at")) || (key5 === "by"))){
const err88 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
if(data.kind !== undefined){
let data23 = data.kind;
if(typeof data23 !== "string"){
const err89 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/5/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
if(!(data23 === "canceled")){
const err90 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/5/properties/kind/enum",keyword:"enum",params:{allowedValues: schema372.oneOf[5].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
if(data.at !== undefined){
let data24 = data.at;
if(typeof data24 === "string"){
if(!(formats0.validate(data24))){
const err91 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err92 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data.by !== undefined){
if(!(validate132(data.by, {instancePath:instancePath+"/by",parentData:data,parentDataProperty:"by",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate132.errors : vErrors.concat(validate132.errors);
errors = vErrors.length;
}
}
}
else {
const err93 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
var _valid0 = _errs71 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
if(props0 !== true){
props0 = true;
}
}
}
}
}
}
}
if(!valid0){
const err94 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate135.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate135.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate122(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/release.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate122.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.items === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "items"},message:"must have required property '"+"items"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.state === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "state"},message:"must have required property '"+"state"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.hash === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hash"},message:"must have required property '"+"hash"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.createdBy === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdBy"},message:"must have required property '"+"createdBy"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.createdAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.updatedAt === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.rev === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema345.properties, key0))){
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
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema346.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(!pattern164.test(data1)){
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/ReleaseId/pattern",keyword:"pattern",params:{pattern: "^rel_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^rel_[A-Za-z0-9]{6,32}$"+"\""};
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
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/ReleaseId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err15 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(func2(data2) < 8){
const err16 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!pattern4.test(data2)){
const err17 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.title !== undefined){
let data3 = data.title;
if(typeof data3 === "string"){
if(func2(data3) > 200){
const err19 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(func2(data3) < 1){
const err20 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(!pattern166.test(data3)){
const err21 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/pattern",keyword:"pattern",params:{pattern: "^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"},message:"must match pattern \""+"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.items !== undefined){
let data4 = data.items;
if(Array.isArray(data4)){
if(data4.length > 100){
const err23 = {instancePath:instancePath+"/items",schemaPath:"#/properties/items/maxItems",keyword:"maxItems",params:{limit: 100},message:"must NOT have more than 100 items"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data4.length < 1){
const err24 = {instancePath:instancePath+"/items",schemaPath:"#/properties/items/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
if(!(validate123(data4[i0], {instancePath:instancePath+"/items/" + i0,parentData:data4,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate123.errors : vErrors.concat(validate123.errors);
errors = vErrors.length;
}
}
}
else {
const err25 = {instancePath:instancePath+"/items",schemaPath:"#/properties/items/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.when !== undefined){
if(!(validate129(data.when, {instancePath:instancePath+"/when",parentData:data,parentDataProperty:"when",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate129.errors : vErrors.concat(validate129.errors);
errors = vErrors.length;
}
}
if(data.state !== undefined){
let data7 = data.state;
if(typeof data7 !== "string"){
const err26 = {instancePath:instancePath+"/state",schemaPath:"#/$defs/ReleaseState/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(!((((((((((data7 === "draft") || (data7 === "awaiting_approval")) || (data7 === "scheduled")) || (data7 === "running")) || (data7 === "published")) || (data7 === "conflict")) || (data7 === "missed")) || (data7 === "expired")) || (data7 === "failed")) || (data7 === "canceled"))){
const err27 = {instancePath:instancePath+"/state",schemaPath:"#/$defs/ReleaseState/enum",keyword:"enum",params:{allowedValues: schema360.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.hash !== undefined){
let data8 = data.hash;
if(typeof data8 === "string"){
if(!pattern172.test(data8)){
const err28 = {instancePath:instancePath+"/hash",schemaPath:"#/$defs/ReleaseHash/pattern",keyword:"pattern",params:{pattern: "^rl1:[0-9a-f]{64}$"},message:"must match pattern \""+"^rl1:[0-9a-f]{64}$"+"\""};
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
const err29 = {instancePath:instancePath+"/hash",schemaPath:"#/$defs/ReleaseHash/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.approval !== undefined){
if(!(validate131(data.approval, {instancePath:instancePath+"/approval",parentData:data,parentDataProperty:"approval",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate131.errors : vErrors.concat(validate131.errors);
errors = vErrors.length;
}
}
if(data.outcome !== undefined){
if(!(validate135(data.outcome, {instancePath:instancePath+"/outcome",parentData:data,parentDataProperty:"outcome",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate135.errors : vErrors.concat(validate135.errors);
errors = vErrors.length;
}
}
if(data.createdBy !== undefined){
if(!(validate132(data.createdBy, {instancePath:instancePath+"/createdBy",parentData:data,parentDataProperty:"createdBy",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate132.errors : vErrors.concat(validate132.errors);
errors = vErrors.length;
}
}
if(data.createdAt !== undefined){
let data12 = data.createdAt;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err30 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err31 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data13 = data.updatedAt;
if(typeof data13 === "string"){
if(!(formats0.validate(data13))){
const err32 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
else {
const err33 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data.rev !== undefined){
let data14 = data.rev;
if(!(((typeof data14 == "number") && (!(data14 % 1) && !isNaN(data14))) && (isFinite(data14)))){
const err34 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if((typeof data14 == "number") && (isFinite(data14))){
if(data14 < 0 || isNaN(data14)){
const err35 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
if(data.metadata !== undefined){
let data15 = data.metadata;
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
for(const key1 in data15){
if(typeof data15[key1] !== "string"){
const err36 = {instancePath:instancePath+"/metadata/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
else {
const err38 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
validate122.errors = vErrors;
return errors === 0;
}
validate122.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAutomation = validate143;
const schema390 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/automation.schema.json","title":"Automation","description":"A recurring job on a site (RFC-0008), created by a person in Studio: either a built-in deterministic job that Cloudhal runs itself (reports, findings and notifications; it never publishes), or a scheduled agent task that an external agent picks up over MCP with the automation's own key, inside a run window, under a mode cap and budgets. No language model runs inside Cloudhal. Scheduling never grants rights: every call of a task runs with the key's scopes narrowed to its owner's current role. Automations live in D1 next to the graph; they are not graph nodes and are not part of site bundles.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","name","job","recurrence","state","consecutiveFailures","owner","createdAt","updatedAt","rev"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/AutomationId"},"siteId":{"$ref":"#/$defs/Id"},"name":{"type":"string","minLength":1,"maxLength":120,"pattern":"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"},"job":{"$ref":"#/$defs/AutomationJob"},"recurrence":{"$ref":"#/$defs/AutomationRecurrence"},"state":{"$ref":"#/$defs/AutomationState"},"pausedReason":{"type":"string","description":"Why the automation is not `active`: a person paused it; its agent paused it; three consecutive failures; a run exceeded its budget; the site's kill switch; its key was revoked; its owner left or no longer holds the scopes it needs.","enum":["person","agent","failures","budget","kill-switch","key-revoked","owner-removed","role-changed"]},"consecutiveFailures":{"type":"integer","minimum":0},"owner":{"$ref":"#/$defs/AutomationOwner"},"nextRunAt":{"$ref":"#/$defs/Timestamp"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"rev":{"$ref":"#/$defs/Revision"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"AutomationBudget":{"type":"object","description":"Per-run limits Cloudhal counts and enforces for an agent task: tool calls, mutations, approval requests filed and minutes since the run began. Exceeding one ends the run (`budget-exceeded`) and pauses the automation.","additionalProperties":false,"required":["maxToolCalls","maxWrites","maxApprovalRequests","maxMinutes"],"properties":{"maxToolCalls":{"type":"integer","minimum":1,"maximum":500},"maxWrites":{"type":"integer","minimum":0,"maximum":200},"maxApprovalRequests":{"type":"integer","minimum":0,"maximum":20},"maxMinutes":{"type":"integer","minimum":1,"maximum":240}}},"AutomationId":{"type":"string","description":"An automation id: `aut_` and 6 to 32 letters or digits.","pattern":"^aut_[A-Za-z0-9]{6,32}$"},"AutomationJob":{"description":"What runs, discriminated by `kind`.","oneOf":[{"type":"object","title":"BuiltinAutomationJob","description":"A deterministic job Cloudhal runs itself, in bounded steps. Its outputs are findings, reports and Studio notifications; it never changes or publishes content.","additionalProperties":false,"required":["kind","builtin"],"properties":{"kind":{"type":"string","enum":["builtin"]},"builtin":{"type":"string","enum":["broken-links","stale-content","feed-check","weekly-digest","cleanup"]},"staleAfterDays":{"type":"integer","description":"`stale-content` only: entries not updated for this many days are listed for review.","minimum":30,"maximum":1095}}},{"type":"object","title":"AgentTaskAutomationJob","description":"A task an external agent performs over MCP. At each occurrence a run window opens for `windowMinutes`; the automation's key (`keyId`, owned by the automation's owner) is valid only inside an open run, which the agent starts with `begin_run` and ends with `end_run`. The run's mode is the key's effective mode capped by `modeCap`; it never waits for a person: calls that need one leave an approval request and the run ends. `readsUntrustedText` declares that the task reads visitor-supplied text (comments, 404 paths, fetched pages); such an automation's key cannot hold write scopes, and any run that reads such text is limited to reading, labelling and hiding from then on.","additionalProperties":false,"required":["kind","keyId","instructions","modeCap","readsUntrustedText","windowMinutes","budget"],"properties":{"kind":{"type":"string","enum":["agent-task"]},"keyId":{"type":"string","pattern":"^[A-Za-z0-9_-]{6,64}$"},"instructions":{"type":"string","description":"What the owner asks the agent to do, shown to the agent by `begin_run`. Plain text.","minLength":1,"maxLength":2000,"pattern":"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"},"skill":{"type":"string","description":"A skill the run declares (its scopes and approval list narrow the run further).","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","maxLength":64},"modeCap":{"type":"string","description":"The most autonomous mode a run may use; never `bypass`.","enum":["plan","manual","edits","auto"]},"readsUntrustedText":{"type":"boolean"},"windowMinutes":{"type":"integer","minimum":5,"maximum":240},"budget":{"$ref":"#/$defs/AutomationBudget"}}}]},"AutomationOwner":{"type":"object","description":"The person who created the automation and owns its key (`user_…`). Agents never own automations.","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"string","pattern":"^user_[A-Za-z0-9]{6,32}$"},"name":{"type":"string","maxLength":200}}},"AutomationRecurrence":{"type":"object","description":"When the automation runs: the first occurrence as a wall-clock time in `timeZone`, repeated by `rule` (absent: once). Occurrences are computed in the zone, so \"Mondays 09:07\" stays 09:07 across daylight-saving changes; a time that does not exist on a given day (a spring-forward gap) runs at the next valid minute, and a time that occurs twice runs once, at the first (a documented deviation from RFC 5545 §3.3.10, which drops such occurrences). `preset` records which Studio choice produced the rule.","additionalProperties":false,"required":["start","timeZone","preset"],"properties":{"start":{"$ref":"#/$defs/LocalDateTime"},"timeZone":{"$ref":"#/$defs/TimeZone"},"rule":{"$ref":"#/$defs/AutomationRule"},"preset":{"type":"string","enum":["once","hourly","daily","weekdays","weekly","monthly","custom"]}}},"AutomationRule":{"type":"string","description":"The recurrence as an RFC 5545 RRULE value in Cloudhal's subset, without the `RRULE:` prefix: FREQ DAILY, WEEKLY or MONTHLY; INTERVAL; BYDAY (ordinals such as 2TU or -1FR only with MONTHLY); BYMONTHDAY (1–31 or -1); BYHOUR; BYMINUTE; COUNT or UNTIL. The pattern bounds the vocabulary; the parser refuses repeated parts, COUNT with UNTIL, ordinals outside MONTHLY and runs closer than the job's minimum interval.","maxLength":300,"pattern":"^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=[1-9][0-9]{0,2}|BYDAY=(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)){0,6}|BYMONTHDAY=(?:-1|[1-9]|[12][0-9]|3[01])(?:,(?:-1|[1-9]|[12][0-9]|3[01])){0,30}|BYHOUR=(?:[01]?[0-9]|2[0-3])(?:,(?:[01]?[0-9]|2[0-3])){0,23}|BYMINUTE=[0-5]?[0-9](?:,[0-5]?[0-9]){0,3}|COUNT=[1-9][0-9]{0,3}|UNTIL=[0-9]{8}T[0-9]{6}Z))*$"},"AutomationState":{"type":"string","description":"`active` runs on its recurrence; `paused` and `auto-paused` (by failures or a budget) wait for a person to resume; `broken` needs a person to repair it (key revoked, owner gone); `ended` reached its COUNT or UNTIL.","enum":["active","paused","auto-paused","broken","ended"]},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"LocalDateTime":{"type":"string","description":"A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008).","pattern":"^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"},"TimeZone":{"type":"string","description":"IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.","pattern":"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$","maxLength":64}}};
const schema391 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema392 = {"type":"string","description":"An automation id: `aut_` and 6 to 32 letters or digits.","pattern":"^aut_[A-Za-z0-9]{6,32}$"};
const schema393 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema400 = {"type":"string","description":"`active` runs on its recurrence; `paused` and `auto-paused` (by failures or a budget) wait for a person to resume; `broken` needs a person to repair it (key revoked, owner gone); `ended` reached its COUNT or UNTIL.","enum":["active","paused","auto-paused","broken","ended"]};
const schema401 = {"type":"object","description":"The person who created the automation and owns its key (`user_…`). Agents never own automations.","additionalProperties":false,"required":["id"],"properties":{"id":{"type":"string","pattern":"^user_[A-Za-z0-9]{6,32}$"},"name":{"type":"string","maxLength":200}}};
const schema402 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema405 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema406 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern184 = new RegExp("^aut_[A-Za-z0-9]{6,32}$", "u");
const schema394 = {"description":"What runs, discriminated by `kind`.","oneOf":[{"type":"object","title":"BuiltinAutomationJob","description":"A deterministic job Cloudhal runs itself, in bounded steps. Its outputs are findings, reports and Studio notifications; it never changes or publishes content.","additionalProperties":false,"required":["kind","builtin"],"properties":{"kind":{"type":"string","enum":["builtin"]},"builtin":{"type":"string","enum":["broken-links","stale-content","feed-check","weekly-digest","cleanup"]},"staleAfterDays":{"type":"integer","description":"`stale-content` only: entries not updated for this many days are listed for review.","minimum":30,"maximum":1095}}},{"type":"object","title":"AgentTaskAutomationJob","description":"A task an external agent performs over MCP. At each occurrence a run window opens for `windowMinutes`; the automation's key (`keyId`, owned by the automation's owner) is valid only inside an open run, which the agent starts with `begin_run` and ends with `end_run`. The run's mode is the key's effective mode capped by `modeCap`; it never waits for a person: calls that need one leave an approval request and the run ends. `readsUntrustedText` declares that the task reads visitor-supplied text (comments, 404 paths, fetched pages); such an automation's key cannot hold write scopes, and any run that reads such text is limited to reading, labelling and hiding from then on.","additionalProperties":false,"required":["kind","keyId","instructions","modeCap","readsUntrustedText","windowMinutes","budget"],"properties":{"kind":{"type":"string","enum":["agent-task"]},"keyId":{"type":"string","pattern":"^[A-Za-z0-9_-]{6,64}$"},"instructions":{"type":"string","description":"What the owner asks the agent to do, shown to the agent by `begin_run`. Plain text.","minLength":1,"maxLength":2000,"pattern":"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"},"skill":{"type":"string","description":"A skill the run declares (its scopes and approval list narrow the run further).","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","maxLength":64},"modeCap":{"type":"string","description":"The most autonomous mode a run may use; never `bypass`.","enum":["plan","manual","edits","auto"]},"readsUntrustedText":{"type":"boolean"},"windowMinutes":{"type":"integer","minimum":5,"maximum":240},"budget":{"$ref":"#/$defs/AutomationBudget"}}}]};
const schema395 = {"type":"object","description":"Per-run limits Cloudhal counts and enforces for an agent task: tool calls, mutations, approval requests filed and minutes since the run began. Exceeding one ends the run (`budget-exceeded`) and pauses the automation.","additionalProperties":false,"required":["maxToolCalls","maxWrites","maxApprovalRequests","maxMinutes"],"properties":{"maxToolCalls":{"type":"integer","minimum":1,"maximum":500},"maxWrites":{"type":"integer","minimum":0,"maximum":200},"maxApprovalRequests":{"type":"integer","minimum":0,"maximum":20},"maxMinutes":{"type":"integer","minimum":1,"maximum":240}}};

function validate144(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate144.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.builtin === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "builtin"},message:"must have required property '"+"builtin"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "kind") || (key0 === "builtin")) || (key0 === "staleAfterDays"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
let data0 = data.kind;
if(typeof data0 !== "string"){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(!(data0 === "builtin")){
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema394.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.builtin !== undefined){
let data1 = data.builtin;
if(typeof data1 !== "string"){
const err5 = {instancePath:instancePath+"/builtin",schemaPath:"#/oneOf/0/properties/builtin/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!(((((data1 === "broken-links") || (data1 === "stale-content")) || (data1 === "feed-check")) || (data1 === "weekly-digest")) || (data1 === "cleanup"))){
const err6 = {instancePath:instancePath+"/builtin",schemaPath:"#/oneOf/0/properties/builtin/enum",keyword:"enum",params:{allowedValues: schema394.oneOf[0].properties.builtin.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.staleAfterDays !== undefined){
let data2 = data.staleAfterDays;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err7 = {instancePath:instancePath+"/staleAfterDays",schemaPath:"#/oneOf/0/properties/staleAfterDays/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 1095 || isNaN(data2)){
const err8 = {instancePath:instancePath+"/staleAfterDays",schemaPath:"#/oneOf/0/properties/staleAfterDays/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1095},message:"must be <= 1095"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data2 < 30 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/staleAfterDays",schemaPath:"#/oneOf/0/properties/staleAfterDays/minimum",keyword:"minimum",params:{comparison: ">=", limit: 30},message:"must be >= 30"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs10 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.keyId === undefined){
const err12 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "keyId"},message:"must have required property '"+"keyId"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.instructions === undefined){
const err13 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "instructions"},message:"must have required property '"+"instructions"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.modeCap === undefined){
const err14 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "modeCap"},message:"must have required property '"+"modeCap"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.readsUntrustedText === undefined){
const err15 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "readsUntrustedText"},message:"must have required property '"+"readsUntrustedText"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.windowMinutes === undefined){
const err16 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "windowMinutes"},message:"must have required property '"+"windowMinutes"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.budget === undefined){
const err17 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "budget"},message:"must have required property '"+"budget"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
for(const key1 in data){
if(!((((((((key1 === "kind") || (key1 === "keyId")) || (key1 === "instructions")) || (key1 === "skill")) || (key1 === "modeCap")) || (key1 === "readsUntrustedText")) || (key1 === "windowMinutes")) || (key1 === "budget"))){
const err18 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.kind !== undefined){
let data3 = data.kind;
if(typeof data3 !== "string"){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(!(data3 === "agent-task")){
const err20 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema394.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.keyId !== undefined){
let data4 = data.keyId;
if(typeof data4 === "string"){
if(!pattern176.test(data4)){
const err21 = {instancePath:instancePath+"/keyId",schemaPath:"#/oneOf/1/properties/keyId/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9_-]{6,64}$"},message:"must match pattern \""+"^[A-Za-z0-9_-]{6,64}$"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/keyId",schemaPath:"#/oneOf/1/properties/keyId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.instructions !== undefined){
let data5 = data.instructions;
if(typeof data5 === "string"){
if(func2(data5) > 2000){
const err23 = {instancePath:instancePath+"/instructions",schemaPath:"#/oneOf/1/properties/instructions/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(func2(data5) < 1){
const err24 = {instancePath:instancePath+"/instructions",schemaPath:"#/oneOf/1/properties/instructions/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(!pattern153.test(data5)){
const err25 = {instancePath:instancePath+"/instructions",schemaPath:"#/oneOf/1/properties/instructions/pattern",keyword:"pattern",params:{pattern: "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"},message:"must match pattern \""+"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"+"\""};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
else {
const err26 = {instancePath:instancePath+"/instructions",schemaPath:"#/oneOf/1/properties/instructions/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.skill !== undefined){
let data6 = data.skill;
if(typeof data6 === "string"){
if(func2(data6) > 64){
const err27 = {instancePath:instancePath+"/skill",schemaPath:"#/oneOf/1/properties/skill/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(!pattern5.test(data6)){
const err28 = {instancePath:instancePath+"/skill",schemaPath:"#/oneOf/1/properties/skill/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err29 = {instancePath:instancePath+"/skill",schemaPath:"#/oneOf/1/properties/skill/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.modeCap !== undefined){
let data7 = data.modeCap;
if(typeof data7 !== "string"){
const err30 = {instancePath:instancePath+"/modeCap",schemaPath:"#/oneOf/1/properties/modeCap/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(!((((data7 === "plan") || (data7 === "manual")) || (data7 === "edits")) || (data7 === "auto"))){
const err31 = {instancePath:instancePath+"/modeCap",schemaPath:"#/oneOf/1/properties/modeCap/enum",keyword:"enum",params:{allowedValues: schema394.oneOf[1].properties.modeCap.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.readsUntrustedText !== undefined){
if(typeof data.readsUntrustedText !== "boolean"){
const err32 = {instancePath:instancePath+"/readsUntrustedText",schemaPath:"#/oneOf/1/properties/readsUntrustedText/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.windowMinutes !== undefined){
let data9 = data.windowMinutes;
if(!(((typeof data9 == "number") && (!(data9 % 1) && !isNaN(data9))) && (isFinite(data9)))){
const err33 = {instancePath:instancePath+"/windowMinutes",schemaPath:"#/oneOf/1/properties/windowMinutes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if((typeof data9 == "number") && (isFinite(data9))){
if(data9 > 240 || isNaN(data9)){
const err34 = {instancePath:instancePath+"/windowMinutes",schemaPath:"#/oneOf/1/properties/windowMinutes/maximum",keyword:"maximum",params:{comparison: "<=", limit: 240},message:"must be <= 240"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(data9 < 5 || isNaN(data9)){
const err35 = {instancePath:instancePath+"/windowMinutes",schemaPath:"#/oneOf/1/properties/windowMinutes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 5},message:"must be >= 5"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
if(data.budget !== undefined){
let data10 = data.budget;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
if(data10.maxToolCalls === undefined){
const err36 = {instancePath:instancePath+"/budget",schemaPath:"#/$defs/AutomationBudget/required",keyword:"required",params:{missingProperty: "maxToolCalls"},message:"must have required property '"+"maxToolCalls"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data10.maxWrites === undefined){
const err37 = {instancePath:instancePath+"/budget",schemaPath:"#/$defs/AutomationBudget/required",keyword:"required",params:{missingProperty: "maxWrites"},message:"must have required property '"+"maxWrites"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(data10.maxApprovalRequests === undefined){
const err38 = {instancePath:instancePath+"/budget",schemaPath:"#/$defs/AutomationBudget/required",keyword:"required",params:{missingProperty: "maxApprovalRequests"},message:"must have required property '"+"maxApprovalRequests"+"'"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data10.maxMinutes === undefined){
const err39 = {instancePath:instancePath+"/budget",schemaPath:"#/$defs/AutomationBudget/required",keyword:"required",params:{missingProperty: "maxMinutes"},message:"must have required property '"+"maxMinutes"+"'"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
for(const key2 in data10){
if(!((((key2 === "maxToolCalls") || (key2 === "maxWrites")) || (key2 === "maxApprovalRequests")) || (key2 === "maxMinutes"))){
const err40 = {instancePath:instancePath+"/budget",schemaPath:"#/$defs/AutomationBudget/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data10.maxToolCalls !== undefined){
let data11 = data10.maxToolCalls;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err41 = {instancePath:instancePath+"/budget/maxToolCalls",schemaPath:"#/$defs/AutomationBudget/properties/maxToolCalls/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 > 500 || isNaN(data11)){
const err42 = {instancePath:instancePath+"/budget/maxToolCalls",schemaPath:"#/$defs/AutomationBudget/properties/maxToolCalls/maximum",keyword:"maximum",params:{comparison: "<=", limit: 500},message:"must be <= 500"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data11 < 1 || isNaN(data11)){
const err43 = {instancePath:instancePath+"/budget/maxToolCalls",schemaPath:"#/$defs/AutomationBudget/properties/maxToolCalls/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
}
if(data10.maxWrites !== undefined){
let data12 = data10.maxWrites;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
const err44 = {instancePath:instancePath+"/budget/maxWrites",schemaPath:"#/$defs/AutomationBudget/properties/maxWrites/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 > 200 || isNaN(data12)){
const err45 = {instancePath:instancePath+"/budget/maxWrites",schemaPath:"#/$defs/AutomationBudget/properties/maxWrites/maximum",keyword:"maximum",params:{comparison: "<=", limit: 200},message:"must be <= 200"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(data12 < 0 || isNaN(data12)){
const err46 = {instancePath:instancePath+"/budget/maxWrites",schemaPath:"#/$defs/AutomationBudget/properties/maxWrites/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
if(data10.maxApprovalRequests !== undefined){
let data13 = data10.maxApprovalRequests;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err47 = {instancePath:instancePath+"/budget/maxApprovalRequests",schemaPath:"#/$defs/AutomationBudget/properties/maxApprovalRequests/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 > 20 || isNaN(data13)){
const err48 = {instancePath:instancePath+"/budget/maxApprovalRequests",schemaPath:"#/$defs/AutomationBudget/properties/maxApprovalRequests/maximum",keyword:"maximum",params:{comparison: "<=", limit: 20},message:"must be <= 20"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(data13 < 0 || isNaN(data13)){
const err49 = {instancePath:instancePath+"/budget/maxApprovalRequests",schemaPath:"#/$defs/AutomationBudget/properties/maxApprovalRequests/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
}
if(data10.maxMinutes !== undefined){
let data14 = data10.maxMinutes;
if(!(((typeof data14 == "number") && (!(data14 % 1) && !isNaN(data14))) && (isFinite(data14)))){
const err50 = {instancePath:instancePath+"/budget/maxMinutes",schemaPath:"#/$defs/AutomationBudget/properties/maxMinutes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if((typeof data14 == "number") && (isFinite(data14))){
if(data14 > 240 || isNaN(data14)){
const err51 = {instancePath:instancePath+"/budget/maxMinutes",schemaPath:"#/$defs/AutomationBudget/properties/maxMinutes/maximum",keyword:"maximum",params:{comparison: "<=", limit: 240},message:"must be <= 240"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(data14 < 1 || isNaN(data14)){
const err52 = {instancePath:instancePath+"/budget/maxMinutes",schemaPath:"#/$defs/AutomationBudget/properties/maxMinutes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
}
}
else {
const err53 = {instancePath:instancePath+"/budget",schemaPath:"#/$defs/AutomationBudget/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
}
else {
const err54 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
var _valid0 = _errs10 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err55 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate144.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate144.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema396 = {"type":"object","description":"When the automation runs: the first occurrence as a wall-clock time in `timeZone`, repeated by `rule` (absent: once). Occurrences are computed in the zone, so \"Mondays 09:07\" stays 09:07 across daylight-saving changes; a time that does not exist on a given day (a spring-forward gap) runs at the next valid minute, and a time that occurs twice runs once, at the first (a documented deviation from RFC 5545 §3.3.10, which drops such occurrences). `preset` records which Studio choice produced the rule.","additionalProperties":false,"required":["start","timeZone","preset"],"properties":{"start":{"$ref":"#/$defs/LocalDateTime"},"timeZone":{"$ref":"#/$defs/TimeZone"},"rule":{"$ref":"#/$defs/AutomationRule"},"preset":{"type":"string","enum":["once","hourly","daily","weekdays","weekly","monthly","custom"]}}};
const schema397 = {"type":"string","description":"A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008).","pattern":"^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"};
const schema398 = {"type":"string","description":"IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list.","pattern":"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$","maxLength":64};
const schema399 = {"type":"string","description":"The recurrence as an RFC 5545 RRULE value in Cloudhal's subset, without the `RRULE:` prefix: FREQ DAILY, WEEKLY or MONTHLY; INTERVAL; BYDAY (ordinals such as 2TU or -1FR only with MONTHLY); BYMONTHDAY (1–31 or -1); BYHOUR; BYMINUTE; COUNT or UNTIL. The pattern bounds the vocabulary; the parser refuses repeated parts, COUNT with UNTIL, ordinals outside MONTHLY and runs closer than the job's minimum interval.","maxLength":300,"pattern":"^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=[1-9][0-9]{0,2}|BYDAY=(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)){0,6}|BYMONTHDAY=(?:-1|[1-9]|[12][0-9]|3[01])(?:,(?:-1|[1-9]|[12][0-9]|3[01])){0,30}|BYHOUR=(?:[01]?[0-9]|2[0-3])(?:,(?:[01]?[0-9]|2[0-3])){0,23}|BYMINUTE=[0-5]?[0-9](?:,[0-5]?[0-9]){0,3}|COUNT=[1-9][0-9]{0,3}|UNTIL=[0-9]{8}T[0-9]{6}Z))*$"};
const pattern192 = new RegExp("^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=[1-9][0-9]{0,2}|BYDAY=(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)){0,6}|BYMONTHDAY=(?:-1|[1-9]|[12][0-9]|3[01])(?:,(?:-1|[1-9]|[12][0-9]|3[01])){0,30}|BYHOUR=(?:[01]?[0-9]|2[0-3])(?:,(?:[01]?[0-9]|2[0-3])){0,23}|BYMINUTE=[0-5]?[0-9](?:,[0-5]?[0-9]){0,3}|COUNT=[1-9][0-9]{0,3}|UNTIL=[0-9]{8}T[0-9]{6}Z))*$", "u");

function validate146(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate146.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.start === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.timeZone === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "timeZone"},message:"must have required property '"+"timeZone"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.preset === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "preset"},message:"must have required property '"+"preset"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "start") || (key0 === "timeZone")) || (key0 === "rule")) || (key0 === "preset"))){
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
if(data.start !== undefined){
let data0 = data.start;
if(typeof data0 === "string"){
if(!pattern171.test(data0)){
const err4 = {instancePath:instancePath+"/start",schemaPath:"#/$defs/LocalDateTime/pattern",keyword:"pattern",params:{pattern: "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"},message:"must match pattern \""+"^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$"+"\""};
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
const err5 = {instancePath:instancePath+"/start",schemaPath:"#/$defs/LocalDateTime/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.timeZone !== undefined){
let data1 = data.timeZone;
if(typeof data1 === "string"){
if(func2(data1) > 64){
const err6 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern17.test(data1)){
const err7 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/pattern",keyword:"pattern",params:{pattern: "^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$"},message:"must match pattern \""+"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/timeZone",schemaPath:"#/$defs/TimeZone/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.rule !== undefined){
let data2 = data.rule;
if(typeof data2 === "string"){
if(func2(data2) > 300){
const err9 = {instancePath:instancePath+"/rule",schemaPath:"#/$defs/AutomationRule/maxLength",keyword:"maxLength",params:{limit: 300},message:"must NOT have more than 300 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!pattern192.test(data2)){
const err10 = {instancePath:instancePath+"/rule",schemaPath:"#/$defs/AutomationRule/pattern",keyword:"pattern",params:{pattern: "^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=[1-9][0-9]{0,2}|BYDAY=(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)){0,6}|BYMONTHDAY=(?:-1|[1-9]|[12][0-9]|3[01])(?:,(?:-1|[1-9]|[12][0-9]|3[01])){0,30}|BYHOUR=(?:[01]?[0-9]|2[0-3])(?:,(?:[01]?[0-9]|2[0-3])){0,23}|BYMINUTE=[0-5]?[0-9](?:,[0-5]?[0-9]){0,3}|COUNT=[1-9][0-9]{0,3}|UNTIL=[0-9]{8}T[0-9]{6}Z))*$"},message:"must match pattern \""+"^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=[1-9][0-9]{0,2}|BYDAY=(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)){0,6}|BYMONTHDAY=(?:-1|[1-9]|[12][0-9]|3[01])(?:,(?:-1|[1-9]|[12][0-9]|3[01])){0,30}|BYHOUR=(?:[01]?[0-9]|2[0-3])(?:,(?:[01]?[0-9]|2[0-3])){0,23}|BYMINUTE=[0-5]?[0-9](?:,[0-5]?[0-9]){0,3}|COUNT=[1-9][0-9]{0,3}|UNTIL=[0-9]{8}T[0-9]{6}Z))*$"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/rule",schemaPath:"#/$defs/AutomationRule/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.preset !== undefined){
let data3 = data.preset;
if(typeof data3 !== "string"){
const err12 = {instancePath:instancePath+"/preset",schemaPath:"#/properties/preset/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!(((((((data3 === "once") || (data3 === "hourly")) || (data3 === "daily")) || (data3 === "weekdays")) || (data3 === "weekly")) || (data3 === "monthly")) || (data3 === "custom"))){
const err13 = {instancePath:instancePath+"/preset",schemaPath:"#/properties/preset/enum",keyword:"enum",params:{allowedValues: schema396.properties.preset.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate146.errors = vErrors;
return errors === 0;
}
validate146.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate143(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/automation.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate143.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.name === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.job === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "job"},message:"must have required property '"+"job"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.recurrence === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "recurrence"},message:"must have required property '"+"recurrence"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.state === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "state"},message:"must have required property '"+"state"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.consecutiveFailures === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "consecutiveFailures"},message:"must have required property '"+"consecutiveFailures"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.owner === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "owner"},message:"must have required property '"+"owner"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.createdAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.updatedAt === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.rev === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema390.properties, key0))){
const err12 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.schemaVersion !== undefined){
let data0 = data.schemaVersion;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err13 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(!(data0 === 1)){
const err14 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema391.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(!pattern184.test(data1)){
const err15 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/AutomationId/pattern",keyword:"pattern",params:{pattern: "^aut_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^aut_[A-Za-z0-9]{6,32}$"+"\""};
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
const err16 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/AutomationId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err17 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(func2(data2) < 8){
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!pattern4.test(data2)){
const err19 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.name !== undefined){
let data3 = data.name;
if(typeof data3 === "string"){
if(func2(data3) > 120){
const err21 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(func2(data3) < 1){
const err22 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!pattern166.test(data3)){
const err23 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/pattern",keyword:"pattern",params:{pattern: "^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"},message:"must match pattern \""+"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$"+"\""};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.job !== undefined){
if(!(validate144(data.job, {instancePath:instancePath+"/job",parentData:data,parentDataProperty:"job",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate144.errors : vErrors.concat(validate144.errors);
errors = vErrors.length;
}
}
if(data.recurrence !== undefined){
if(!(validate146(data.recurrence, {instancePath:instancePath+"/recurrence",parentData:data,parentDataProperty:"recurrence",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate146.errors : vErrors.concat(validate146.errors);
errors = vErrors.length;
}
}
if(data.state !== undefined){
let data6 = data.state;
if(typeof data6 !== "string"){
const err25 = {instancePath:instancePath+"/state",schemaPath:"#/$defs/AutomationState/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(!(((((data6 === "active") || (data6 === "paused")) || (data6 === "auto-paused")) || (data6 === "broken")) || (data6 === "ended"))){
const err26 = {instancePath:instancePath+"/state",schemaPath:"#/$defs/AutomationState/enum",keyword:"enum",params:{allowedValues: schema400.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.pausedReason !== undefined){
let data7 = data.pausedReason;
if(typeof data7 !== "string"){
const err27 = {instancePath:instancePath+"/pausedReason",schemaPath:"#/properties/pausedReason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(!((((((((data7 === "person") || (data7 === "agent")) || (data7 === "failures")) || (data7 === "budget")) || (data7 === "kill-switch")) || (data7 === "key-revoked")) || (data7 === "owner-removed")) || (data7 === "role-changed"))){
const err28 = {instancePath:instancePath+"/pausedReason",schemaPath:"#/properties/pausedReason/enum",keyword:"enum",params:{allowedValues: schema390.properties.pausedReason.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.consecutiveFailures !== undefined){
let data8 = data.consecutiveFailures;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err29 = {instancePath:instancePath+"/consecutiveFailures",schemaPath:"#/properties/consecutiveFailures/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 < 0 || isNaN(data8)){
const err30 = {instancePath:instancePath+"/consecutiveFailures",schemaPath:"#/properties/consecutiveFailures/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
if(data.owner !== undefined){
let data9 = data.owner;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.id === undefined){
const err31 = {instancePath:instancePath+"/owner",schemaPath:"#/$defs/AutomationOwner/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key1 in data9){
if(!((key1 === "id") || (key1 === "name"))){
const err32 = {instancePath:instancePath+"/owner",schemaPath:"#/$defs/AutomationOwner/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data9.id !== undefined){
let data10 = data9.id;
if(typeof data10 === "string"){
if(!pattern150.test(data10)){
const err33 = {instancePath:instancePath+"/owner/id",schemaPath:"#/$defs/AutomationOwner/properties/id/pattern",keyword:"pattern",params:{pattern: "^user_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^user_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/owner/id",schemaPath:"#/$defs/AutomationOwner/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data9.name !== undefined){
let data11 = data9.name;
if(typeof data11 === "string"){
if(func2(data11) > 200){
const err35 = {instancePath:instancePath+"/owner/name",schemaPath:"#/$defs/AutomationOwner/properties/name/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
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
const err36 = {instancePath:instancePath+"/owner/name",schemaPath:"#/$defs/AutomationOwner/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/owner",schemaPath:"#/$defs/AutomationOwner/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.nextRunAt !== undefined){
let data12 = data.nextRunAt;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err38 = {instancePath:instancePath+"/nextRunAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/nextRunAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data13 = data.createdAt;
if(typeof data13 === "string"){
if(!(formats0.validate(data13))){
const err40 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err41 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data14 = data.updatedAt;
if(typeof data14 === "string"){
if(!(formats0.validate(data14))){
const err42 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
else {
const err43 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.rev !== undefined){
let data15 = data.rev;
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err44 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if((typeof data15 == "number") && (isFinite(data15))){
if(data15 < 0 || isNaN(data15)){
const err45 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
if(data.metadata !== undefined){
let data16 = data.metadata;
if(data16 && typeof data16 == "object" && !Array.isArray(data16)){
for(const key2 in data16){
if(typeof data16[key2] !== "string"){
const err46 = {instancePath:instancePath+"/metadata/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
else {
const err47 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
}
else {
const err48 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
validate143.errors = vErrors;
return errors === 0;
}
validate143.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateScheduleRun = validate148;
const schema407 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/schedule-run.schema.json","title":"ScheduleRun","description":"One occurrence of something scheduled (RFC-0008): a release's execution or an automation's run. Its id is derived from the subject and `occurrenceAt`, so a second scheduler tick that reaches the same occurrence finds the same row and the effect happens at most once. `state` says whether the run itself completed; `outcome` says whether it did any work, because a run that ended cleanly may still have done nothing. Runs live in D1 and are kept 90 days; the audit log keeps what each call did.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","subject","occurrenceAt","state","attempt","createdAt","updatedAt","rev"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/ScheduleRunId"},"siteId":{"$ref":"#/$defs/Id"},"subject":{"$ref":"#/$defs/ScheduleRunSubject"},"occurrenceAt":{"$ref":"#/$defs/Timestamp"},"state":{"$ref":"#/$defs/ScheduleRunState"},"outcome":{"type":"string","description":"What the run achieved, separately from whether it completed: `did-work` changed something or produced findings; `nothing-to-do`; `proposed` left drafts or proposals for people; `waiting-approval` filed requests a person must decide.","enum":["did-work","nothing-to-do","proposed","waiting-approval"]},"trigger":{"type":"string","description":"What woke the scheduler: the every-minute cron trigger, the Durable Object clock's alarm, an admin request (backstop), the Node timer, or a person (\"Run now\", \"Publish now\").","enum":["cron","alarm","request","node","manual"]},"attempt":{"type":"integer","minimum":1},"startedAt":{"$ref":"#/$defs/Timestamp"},"endedAt":{"$ref":"#/$defs/Timestamp"},"latenessSeconds":{"type":"integer","minimum":0},"adjusted":{"type":"string","description":"The occurrence was moved: `dst-gap` (the wall-clock time did not exist that day, so it ran at the next valid minute) or `tzdata` (the zone's rules changed after it was planned).","enum":["dst-gap","tzdata"]},"window":{"$ref":"#/$defs/ScheduleRunWindow"},"usage":{"$ref":"#/$defs/ScheduleRunUsage"},"taint":{"$ref":"#/$defs/ScheduleRunTaint"},"summary":{"type":"string","description":"The agent's own account of the run (`end_run`) or the built-in job's report line. Plain text written by an agent: Studio renders it as text and never as an instruction.","maxLength":2000,"pattern":"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"},"counts":{"type":"object","description":"Findings by name (e.g. `broken-links`, `stale-entries`, `proposals`).","propertyNames":{"type":"string","pattern":"^[a-z][a-z0-9-]{0,40}$"},"maxProperties":20,"additionalProperties":{"type":"integer","minimum":0}},"approvalIds":{"type":"array","description":"Approval requests the run filed.","items":{"$ref":"#/$defs/Id"},"uniqueItems":true,"maxItems":50},"error":{"$ref":"#/$defs/ScheduleRunError"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"rev":{"$ref":"#/$defs/Revision"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"ScheduleRunError":{"type":"object","additionalProperties":false,"required":["code"],"properties":{"code":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"message":{"type":"string","maxLength":500,"pattern":"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"}}},"ScheduleRunId":{"type":"string","description":"A run id: `run_` and 6 to 32 letters or digits, derived from the subject id and `occurrenceAt` (the occurrence's idempotency key).","pattern":"^run_[A-Za-z0-9]{6,32}$"},"ScheduleRunState":{"type":"string","description":"`due`: claimed occurrence not started yet; `ready`: an agent task's window is open and waits for `begin_run`; `running`; `succeeded`; `failed`; `missed`: the window closed or the scheduler came too late; `skipped`: a missed occurrence coalesced into a later one; `budget-exceeded`; `killed`: stopped by a pause or a kill switch.","enum":["due","ready","running","succeeded","failed","missed","skipped","budget-exceeded","killed"]},"ScheduleRunSubject":{"description":"What ran, discriminated by `kind`.","oneOf":[{"type":"object","title":"ReleaseRunSubject","additionalProperties":false,"required":["kind","releaseId"],"properties":{"kind":{"type":"string","enum":["release"]},"releaseId":{"type":"string","pattern":"^rel_[A-Za-z0-9]{6,32}$"}}},{"type":"object","title":"AutomationRunSubject","additionalProperties":false,"required":["kind","automationId","job"],"properties":{"kind":{"type":"string","enum":["automation"]},"automationId":{"type":"string","pattern":"^aut_[A-Za-z0-9]{6,32}$"},"job":{"type":"string","enum":["builtin","agent-task"]}}}]},"ScheduleRunTaint":{"type":"object","description":"The run read visitor-supplied text at `at` through `tool`; from then on it may only read, label, hide and pause.","additionalProperties":false,"required":["at","tool"],"properties":{"at":{"$ref":"#/$defs/Timestamp"},"tool":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"}}},"ScheduleRunUsage":{"type":"object","description":"What the run used against its budget, counted by the server.","additionalProperties":false,"required":["toolCalls","writes","approvalRequests"],"properties":{"toolCalls":{"type":"integer","minimum":0},"writes":{"type":"integer","minimum":0},"approvalRequests":{"type":"integer","minimum":0}}},"ScheduleRunWindow":{"type":"object","description":"An agent task's run window: the automation's key is valid only between `opensAt` and `closesAt`, and only inside a run it began.","additionalProperties":false,"required":["opensAt","closesAt"],"properties":{"opensAt":{"$ref":"#/$defs/Timestamp"},"closesAt":{"$ref":"#/$defs/Timestamp"}}},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema408 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema409 = {"type":"string","description":"A run id: `run_` and 6 to 32 letters or digits, derived from the subject id and `occurrenceAt` (the occurrence's idempotency key).","pattern":"^run_[A-Za-z0-9]{6,32}$"};
const schema410 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema411 = {"description":"What ran, discriminated by `kind`.","oneOf":[{"type":"object","title":"ReleaseRunSubject","additionalProperties":false,"required":["kind","releaseId"],"properties":{"kind":{"type":"string","enum":["release"]},"releaseId":{"type":"string","pattern":"^rel_[A-Za-z0-9]{6,32}$"}}},{"type":"object","title":"AutomationRunSubject","additionalProperties":false,"required":["kind","automationId","job"],"properties":{"kind":{"type":"string","enum":["automation"]},"automationId":{"type":"string","pattern":"^aut_[A-Za-z0-9]{6,32}$"},"job":{"type":"string","enum":["builtin","agent-task"]}}}]};
const schema412 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema413 = {"type":"string","description":"`due`: claimed occurrence not started yet; `ready`: an agent task's window is open and waits for `begin_run`; `running`; `succeeded`; `failed`; `missed`: the window closed or the scheduler came too late; `skipped`: a missed occurrence coalesced into a later one; `budget-exceeded`; `killed`: stopped by a pause or a kill switch.","enum":["due","ready","running","succeeded","failed","missed","skipped","budget-exceeded","killed"]};
const schema419 = {"type":"object","description":"What the run used against its budget, counted by the server.","additionalProperties":false,"required":["toolCalls","writes","approvalRequests"],"properties":{"toolCalls":{"type":"integer","minimum":0},"writes":{"type":"integer","minimum":0},"approvalRequests":{"type":"integer","minimum":0}}};
const schema423 = {"type":"object","additionalProperties":false,"required":["code"],"properties":{"code":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"message":{"type":"string","maxLength":500,"pattern":"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"}}};
const schema426 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const pattern194 = new RegExp("^run_[A-Za-z0-9]{6,32}$", "u");
const pattern200 = new RegExp("^[a-z][a-z0-9-]{0,40}$", "u");
const pattern198 = new RegExp("^[a-z][a-z0-9_]{0,63}$", "u");
const schema416 = {"type":"object","description":"An agent task's run window: the automation's key is valid only between `opensAt` and `closesAt`, and only inside a run it began.","additionalProperties":false,"required":["opensAt","closesAt"],"properties":{"opensAt":{"$ref":"#/$defs/Timestamp"},"closesAt":{"$ref":"#/$defs/Timestamp"}}};

function validate149(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate149.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.opensAt === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "opensAt"},message:"must have required property '"+"opensAt"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.closesAt === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "closesAt"},message:"must have required property '"+"closesAt"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "opensAt") || (key0 === "closesAt"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.opensAt !== undefined){
let data0 = data.opensAt;
if(typeof data0 === "string"){
if(!(formats0.validate(data0))){
const err3 = {instancePath:instancePath+"/opensAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/opensAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.closesAt !== undefined){
let data1 = data.closesAt;
if(typeof data1 === "string"){
if(!(formats0.validate(data1))){
const err5 = {instancePath:instancePath+"/closesAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/closesAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate149.errors = vErrors;
return errors === 0;
}
validate149.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema420 = {"type":"object","description":"The run read visitor-supplied text at `at` through `tool`; from then on it may only read, label, hide and pause.","additionalProperties":false,"required":["at","tool"],"properties":{"at":{"$ref":"#/$defs/Timestamp"},"tool":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"}}};

function validate151(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate151.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.at === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "at"},message:"must have required property '"+"at"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.tool === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tool"},message:"must have required property '"+"tool"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "at") || (key0 === "tool"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.at !== undefined){
let data0 = data.at;
if(typeof data0 === "string"){
if(!(formats0.validate(data0))){
const err3 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/at",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.tool !== undefined){
let data1 = data.tool;
if(typeof data1 === "string"){
if(!pattern198.test(data1)){
const err5 = {instancePath:instancePath+"/tool",schemaPath:"#/properties/tool/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/tool",schemaPath:"#/properties/tool/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate151.errors = vErrors;
return errors === 0;
}
validate151.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate148(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/schedule-run.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate148.evaluated;
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
if(data.id === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.siteId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "siteId"},message:"must have required property '"+"siteId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.subject === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subject"},message:"must have required property '"+"subject"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.occurrenceAt === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "occurrenceAt"},message:"must have required property '"+"occurrenceAt"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.state === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "state"},message:"must have required property '"+"state"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.attempt === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "attempt"},message:"must have required property '"+"attempt"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.createdAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.updatedAt === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.rev === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rev"},message:"must have required property '"+"rev"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func1.call(schema407.properties, key0))){
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
const err12 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema408.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.id !== undefined){
let data1 = data.id;
if(typeof data1 === "string"){
if(!pattern194.test(data1)){
const err13 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/ScheduleRunId/pattern",keyword:"pattern",params:{pattern: "^run_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^run_[A-Za-z0-9]{6,32}$"+"\""};
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
const err14 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/ScheduleRunId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.siteId !== undefined){
let data2 = data.siteId;
if(typeof data2 === "string"){
if(func2(data2) > 48){
const err15 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(func2(data2) < 8){
const err16 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!pattern4.test(data2)){
const err17 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/siteId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.subject !== undefined){
let data3 = data.subject;
const _errs13 = errors;
let valid5 = false;
let passing0 = null;
const _errs14 = errors;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.kind === undefined){
const err19 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data3.releaseId === undefined){
const err20 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/0/required",keyword:"required",params:{missingProperty: "releaseId"},message:"must have required property '"+"releaseId"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
for(const key1 in data3){
if(!((key1 === "kind") || (key1 === "releaseId"))){
const err21 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data3.kind !== undefined){
let data4 = data3.kind;
if(typeof data4 !== "string"){
const err22 = {instancePath:instancePath+"/subject/kind",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/0/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(!(data4 === "release")){
const err23 = {instancePath:instancePath+"/subject/kind",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema411.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data3.releaseId !== undefined){
let data5 = data3.releaseId;
if(typeof data5 === "string"){
if(!pattern164.test(data5)){
const err24 = {instancePath:instancePath+"/subject/releaseId",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/0/properties/releaseId/pattern",keyword:"pattern",params:{pattern: "^rel_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^rel_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/subject/releaseId",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/0/properties/releaseId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var _valid0 = _errs14 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
var props0 = true;
}
const _errs21 = errors;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.kind === undefined){
const err27 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data3.automationId === undefined){
const err28 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/required",keyword:"required",params:{missingProperty: "automationId"},message:"must have required property '"+"automationId"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data3.job === undefined){
const err29 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/required",keyword:"required",params:{missingProperty: "job"},message:"must have required property '"+"job"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
for(const key2 in data3){
if(!(((key2 === "kind") || (key2 === "automationId")) || (key2 === "job"))){
const err30 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data3.kind !== undefined){
let data6 = data3.kind;
if(typeof data6 !== "string"){
const err31 = {instancePath:instancePath+"/subject/kind",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(!(data6 === "automation")){
const err32 = {instancePath:instancePath+"/subject/kind",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema411.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data3.automationId !== undefined){
let data7 = data3.automationId;
if(typeof data7 === "string"){
if(!pattern184.test(data7)){
const err33 = {instancePath:instancePath+"/subject/automationId",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/properties/automationId/pattern",keyword:"pattern",params:{pattern: "^aut_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^aut_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/subject/automationId",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/properties/automationId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data3.job !== undefined){
let data8 = data3.job;
if(typeof data8 !== "string"){
const err35 = {instancePath:instancePath+"/subject/job",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/properties/job/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!((data8 === "builtin") || (data8 === "agent-task"))){
const err36 = {instancePath:instancePath+"/subject/job",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/properties/job/enum",keyword:"enum",params:{allowedValues: schema411.oneOf[1].properties.job.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid0 = _errs21 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid5){
const err38 = {instancePath:instancePath+"/subject",schemaPath:"#/$defs/ScheduleRunSubject/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
else {
errors = _errs13;
if(vErrors !== null){
if(_errs13){
vErrors.length = _errs13;
}
else {
vErrors = null;
}
}
}
}
if(data.occurrenceAt !== undefined){
let data9 = data.occurrenceAt;
if(typeof data9 === "string"){
if(!(formats0.validate(data9))){
const err39 = {instancePath:instancePath+"/occurrenceAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/occurrenceAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.state !== undefined){
let data10 = data.state;
if(typeof data10 !== "string"){
const err41 = {instancePath:instancePath+"/state",schemaPath:"#/$defs/ScheduleRunState/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(!(((((((((data10 === "due") || (data10 === "ready")) || (data10 === "running")) || (data10 === "succeeded")) || (data10 === "failed")) || (data10 === "missed")) || (data10 === "skipped")) || (data10 === "budget-exceeded")) || (data10 === "killed"))){
const err42 = {instancePath:instancePath+"/state",schemaPath:"#/$defs/ScheduleRunState/enum",keyword:"enum",params:{allowedValues: schema413.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.outcome !== undefined){
let data11 = data.outcome;
if(typeof data11 !== "string"){
const err43 = {instancePath:instancePath+"/outcome",schemaPath:"#/properties/outcome/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(!((((data11 === "did-work") || (data11 === "nothing-to-do")) || (data11 === "proposed")) || (data11 === "waiting-approval"))){
const err44 = {instancePath:instancePath+"/outcome",schemaPath:"#/properties/outcome/enum",keyword:"enum",params:{allowedValues: schema407.properties.outcome.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data.trigger !== undefined){
let data12 = data.trigger;
if(typeof data12 !== "string"){
const err45 = {instancePath:instancePath+"/trigger",schemaPath:"#/properties/trigger/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(!(((((data12 === "cron") || (data12 === "alarm")) || (data12 === "request")) || (data12 === "node")) || (data12 === "manual"))){
const err46 = {instancePath:instancePath+"/trigger",schemaPath:"#/properties/trigger/enum",keyword:"enum",params:{allowedValues: schema407.properties.trigger.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.attempt !== undefined){
let data13 = data.attempt;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err47 = {instancePath:instancePath+"/attempt",schemaPath:"#/properties/attempt/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 < 1 || isNaN(data13)){
const err48 = {instancePath:instancePath+"/attempt",schemaPath:"#/properties/attempt/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data.startedAt !== undefined){
let data14 = data.startedAt;
if(typeof data14 === "string"){
if(!(formats0.validate(data14))){
const err49 = {instancePath:instancePath+"/startedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err50 = {instancePath:instancePath+"/startedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.endedAt !== undefined){
let data15 = data.endedAt;
if(typeof data15 === "string"){
if(!(formats0.validate(data15))){
const err51 = {instancePath:instancePath+"/endedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
else {
const err52 = {instancePath:instancePath+"/endedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data.latenessSeconds !== undefined){
let data16 = data.latenessSeconds;
if(!(((typeof data16 == "number") && (!(data16 % 1) && !isNaN(data16))) && (isFinite(data16)))){
const err53 = {instancePath:instancePath+"/latenessSeconds",schemaPath:"#/properties/latenessSeconds/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if((typeof data16 == "number") && (isFinite(data16))){
if(data16 < 0 || isNaN(data16)){
const err54 = {instancePath:instancePath+"/latenessSeconds",schemaPath:"#/properties/latenessSeconds/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
}
if(data.adjusted !== undefined){
let data17 = data.adjusted;
if(typeof data17 !== "string"){
const err55 = {instancePath:instancePath+"/adjusted",schemaPath:"#/properties/adjusted/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(!((data17 === "dst-gap") || (data17 === "tzdata"))){
const err56 = {instancePath:instancePath+"/adjusted",schemaPath:"#/properties/adjusted/enum",keyword:"enum",params:{allowedValues: schema407.properties.adjusted.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data.window !== undefined){
if(!(validate149(data.window, {instancePath:instancePath+"/window",parentData:data,parentDataProperty:"window",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate149.errors : vErrors.concat(validate149.errors);
errors = vErrors.length;
}
}
if(data.usage !== undefined){
let data19 = data.usage;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.toolCalls === undefined){
const err57 = {instancePath:instancePath+"/usage",schemaPath:"#/$defs/ScheduleRunUsage/required",keyword:"required",params:{missingProperty: "toolCalls"},message:"must have required property '"+"toolCalls"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data19.writes === undefined){
const err58 = {instancePath:instancePath+"/usage",schemaPath:"#/$defs/ScheduleRunUsage/required",keyword:"required",params:{missingProperty: "writes"},message:"must have required property '"+"writes"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data19.approvalRequests === undefined){
const err59 = {instancePath:instancePath+"/usage",schemaPath:"#/$defs/ScheduleRunUsage/required",keyword:"required",params:{missingProperty: "approvalRequests"},message:"must have required property '"+"approvalRequests"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
for(const key3 in data19){
if(!(((key3 === "toolCalls") || (key3 === "writes")) || (key3 === "approvalRequests"))){
const err60 = {instancePath:instancePath+"/usage",schemaPath:"#/$defs/ScheduleRunUsage/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data19.toolCalls !== undefined){
let data20 = data19.toolCalls;
if(!(((typeof data20 == "number") && (!(data20 % 1) && !isNaN(data20))) && (isFinite(data20)))){
const err61 = {instancePath:instancePath+"/usage/toolCalls",schemaPath:"#/$defs/ScheduleRunUsage/properties/toolCalls/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if((typeof data20 == "number") && (isFinite(data20))){
if(data20 < 0 || isNaN(data20)){
const err62 = {instancePath:instancePath+"/usage/toolCalls",schemaPath:"#/$defs/ScheduleRunUsage/properties/toolCalls/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
}
if(data19.writes !== undefined){
let data21 = data19.writes;
if(!(((typeof data21 == "number") && (!(data21 % 1) && !isNaN(data21))) && (isFinite(data21)))){
const err63 = {instancePath:instancePath+"/usage/writes",schemaPath:"#/$defs/ScheduleRunUsage/properties/writes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if((typeof data21 == "number") && (isFinite(data21))){
if(data21 < 0 || isNaN(data21)){
const err64 = {instancePath:instancePath+"/usage/writes",schemaPath:"#/$defs/ScheduleRunUsage/properties/writes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
if(data19.approvalRequests !== undefined){
let data22 = data19.approvalRequests;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err65 = {instancePath:instancePath+"/usage/approvalRequests",schemaPath:"#/$defs/ScheduleRunUsage/properties/approvalRequests/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 < 0 || isNaN(data22)){
const err66 = {instancePath:instancePath+"/usage/approvalRequests",schemaPath:"#/$defs/ScheduleRunUsage/properties/approvalRequests/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
}
}
else {
const err67 = {instancePath:instancePath+"/usage",schemaPath:"#/$defs/ScheduleRunUsage/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data.taint !== undefined){
if(!(validate151(data.taint, {instancePath:instancePath+"/taint",parentData:data,parentDataProperty:"taint",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate151.errors : vErrors.concat(validate151.errors);
errors = vErrors.length;
}
}
if(data.summary !== undefined){
let data24 = data.summary;
if(typeof data24 === "string"){
if(func2(data24) > 2000){
const err68 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if(!pattern154.test(data24)){
const err69 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/pattern",keyword:"pattern",params:{pattern: "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"},message:"must match pattern \""+"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"+"\""};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
else {
const err70 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data.counts !== undefined){
let data25 = data.counts;
if(data25 && typeof data25 == "object" && !Array.isArray(data25)){
if(Object.keys(data25).length > 20){
const err71 = {instancePath:instancePath+"/counts",schemaPath:"#/properties/counts/maxProperties",keyword:"maxProperties",params:{limit: 20},message:"must NOT have more than 20 properties"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
for(const key4 in data25){
const _errs68 = errors;
if(typeof key4 === "string"){
if(!pattern200.test(key4)){
const err72 = {instancePath:instancePath+"/counts",schemaPath:"#/properties/counts/propertyNames/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9-]{0,40}$"},message:"must match pattern \""+"^[a-z][a-z0-9-]{0,40}$"+"\"",propertyName:key4};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
else {
const err73 = {instancePath:instancePath+"/counts",schemaPath:"#/properties/counts/propertyNames/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key4};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
var valid14 = _errs68 === errors;
if(!valid14){
const err74 = {instancePath:instancePath+"/counts",schemaPath:"#/properties/counts/propertyNames",keyword:"propertyNames",params:{propertyName: key4},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
for(const key5 in data25){
let data26 = data25[key5];
if(!(((typeof data26 == "number") && (!(data26 % 1) && !isNaN(data26))) && (isFinite(data26)))){
const err75 = {instancePath:instancePath+"/counts/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/counts/additionalProperties/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if((typeof data26 == "number") && (isFinite(data26))){
if(data26 < 0 || isNaN(data26)){
const err76 = {instancePath:instancePath+"/counts/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/properties/counts/additionalProperties/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
}
}
else {
const err77 = {instancePath:instancePath+"/counts",schemaPath:"#/properties/counts/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data.approvalIds !== undefined){
let data27 = data.approvalIds;
if(Array.isArray(data27)){
if(data27.length > 50){
const err78 = {instancePath:instancePath+"/approvalIds",schemaPath:"#/properties/approvalIds/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
const len0 = data27.length;
for(let i0=0; i0<len0; i0++){
let data28 = data27[i0];
if(typeof data28 === "string"){
if(func2(data28) > 48){
const err79 = {instancePath:instancePath+"/approvalIds/" + i0,schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(func2(data28) < 8){
const err80 = {instancePath:instancePath+"/approvalIds/" + i0,schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
if(!pattern4.test(data28)){
const err81 = {instancePath:instancePath+"/approvalIds/" + i0,schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
else {
const err82 = {instancePath:instancePath+"/approvalIds/" + i0,schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
let i1 = data27.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data27[i1], data27[j0])){
const err83 = {instancePath:instancePath+"/approvalIds",schemaPath:"#/properties/approvalIds/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err84 = {instancePath:instancePath+"/approvalIds",schemaPath:"#/properties/approvalIds/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data.error !== undefined){
let data29 = data.error;
if(data29 && typeof data29 == "object" && !Array.isArray(data29)){
if(data29.code === undefined){
const err85 = {instancePath:instancePath+"/error",schemaPath:"#/$defs/ScheduleRunError/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
for(const key6 in data29){
if(!((key6 === "code") || (key6 === "message"))){
const err86 = {instancePath:instancePath+"/error",schemaPath:"#/$defs/ScheduleRunError/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data29.code !== undefined){
let data30 = data29.code;
if(typeof data30 === "string"){
if(!pattern198.test(data30)){
const err87 = {instancePath:instancePath+"/error/code",schemaPath:"#/$defs/ScheduleRunError/properties/code/pattern",keyword:"pattern",params:{pattern: "^[a-z][a-z0-9_]{0,63}$"},message:"must match pattern \""+"^[a-z][a-z0-9_]{0,63}$"+"\""};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
else {
const err88 = {instancePath:instancePath+"/error/code",schemaPath:"#/$defs/ScheduleRunError/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
if(data29.message !== undefined){
let data31 = data29.message;
if(typeof data31 === "string"){
if(func2(data31) > 500){
const err89 = {instancePath:instancePath+"/error/message",schemaPath:"#/$defs/ScheduleRunError/properties/message/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
if(!pattern183.test(data31)){
const err90 = {instancePath:instancePath+"/error/message",schemaPath:"#/$defs/ScheduleRunError/properties/message/pattern",keyword:"pattern",params:{pattern: "^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"},message:"must match pattern \""+"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$"+"\""};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
else {
const err91 = {instancePath:instancePath+"/error/message",schemaPath:"#/$defs/ScheduleRunError/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
}
else {
const err92 = {instancePath:instancePath+"/error",schemaPath:"#/$defs/ScheduleRunError/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data32 = data.createdAt;
if(typeof data32 === "string"){
if(!(formats0.validate(data32))){
const err93 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err94 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data33 = data.updatedAt;
if(typeof data33 === "string"){
if(!(formats0.validate(data33))){
const err95 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
else {
const err96 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
if(data.rev !== undefined){
let data34 = data.rev;
if(!(((typeof data34 == "number") && (!(data34 % 1) && !isNaN(data34))) && (isFinite(data34)))){
const err97 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
if((typeof data34 == "number") && (isFinite(data34))){
if(data34 < 0 || isNaN(data34)){
const err98 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
}
}
else {
const err99 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
validate148.errors = vErrors;
return errors === 0;
}
validate148.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

