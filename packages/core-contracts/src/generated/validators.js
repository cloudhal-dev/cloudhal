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
const schema41 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/site.schema.json","title":"Site","description":"Root node of a Site Graph: one deployable website with its locales, domains, theme and page index. Pages and content entries are separate nodes referenced by id so they can be versioned and locked independently.","type":"object","additionalProperties":false,"required":["schemaVersion","id","projectId","name","slug","defaultLocale","locales","domains","pageIds","theme","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"projectId":{"$ref":"#/$defs/Id"},"name":{"type":"string","minLength":1,"maxLength":200},"slug":{"$ref":"#/$defs/Slug"},"defaultLocale":{"$ref":"#/$defs/Locale"},"locales":{"type":"array","items":{"$ref":"#/$defs/Locale"},"minItems":1,"uniqueItems":true},"domains":{"type":"array","description":"Hostnames serving this site. Exactly one should be primary; the *.cloudhal.app subdomain is always present in Cloud.","items":{"$ref":"#/$defs/Domain"}},"pageIds":{"type":"array","items":{"$ref":"#/$defs/Id"},"uniqueItems":true},"homePageId":{"$ref":"#/$defs/Id"},"theme":{"$ref":"#/$defs/ThemeRef"},"publishedSnapshotId":{"$ref":"#/$defs/Id","description":"Snapshot currently serving production. Rollback = pointing this at an older snapshot."},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Domain":{"type":"object","additionalProperties":false,"required":["hostname","primary"],"properties":{"hostname":{"type":"string","pattern":"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$","maxLength":253},"primary":{"type":"boolean"}}},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"ThemeRef":{"type":"object","description":"Theme (a.k.a. Experience) applied by the renderer. Config is theme-defined and validated by the theme's own schema, not here.","additionalProperties":false,"required":["name"],"properties":{"name":{"$ref":"#/$defs/Slug"},"version":{"type":"string","maxLength":64},"config":{"type":"object","additionalProperties":true}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema42 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema43 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema45 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema46 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema48 = {"type":"object","additionalProperties":false,"required":["hostname","primary"],"properties":{"hostname":{"type":"string","pattern":"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$","maxLength":253},"primary":{"type":"boolean"}}};
const schema54 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema55 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema57 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern11 = new RegExp("^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$", "u");
const pattern13 = new RegExp("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$", "u");
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
if(data.publishedSnapshotId !== undefined){
let data16 = data.publishedSnapshotId;
if(typeof data16 === "string"){
if(func2(data16) > 48){
const err57 = {instancePath:instancePath+"/publishedSnapshotId",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(func2(data16) < 8){
const err58 = {instancePath:instancePath+"/publishedSnapshotId",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(!pattern4.test(data16)){
const err59 = {instancePath:instancePath+"/publishedSnapshotId",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err60 = {instancePath:instancePath+"/publishedSnapshotId",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data.rev !== undefined){
let data17 = data.rev;
if(!(((typeof data17 == "number") && (!(data17 % 1) && !isNaN(data17))) && (isFinite(data17)))){
const err61 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if((typeof data17 == "number") && (isFinite(data17))){
if(data17 < 0 || isNaN(data17)){
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
let data18 = data.createdAt;
if(typeof data18 === "string"){
if(!(formats0.validate(data18))){
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
let data19 = data.updatedAt;
if(typeof data19 === "string"){
if(!(formats0.validate(data19))){
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
let data20 = data.metadata;
if(data20 && typeof data20 == "object" && !Array.isArray(data20)){
for(const key2 in data20){
if(typeof data20[key2] !== "string"){
const err67 = {instancePath:instancePath+"/metadata/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validatePage = validate24;
const schema58 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/page.schema.json","title":"Page","description":"A routable page of a site: a path, editorial status and an ordered list of sections. Sections are embedded (not separate nodes) so a page is the unit of locking, snapshotting and diffing.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","path","title","locale","status","sections","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"path":{"type":"string","description":"Absolute URL path, starting with '/', no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024},"title":{"type":"string","minLength":1,"maxLength":300},"locale":{"$ref":"#/$defs/Locale"},"status":{"$ref":"#/$defs/PublishStatus"},"sections":{"type":"array","items":{"$ref":"#/$defs/Section"}},"seo":{"$ref":"#/$defs/Seo"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to a media asset. src may be a relative asset path or an absolute URL.","additionalProperties":false,"required":["src","alt"],"properties":{"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Link":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"PublishStatus":{"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Section":{"title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}]},"Seo":{"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema59 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema60 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema62 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema63 = {"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]};
const schema75 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema76 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema78 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern20 = new RegExp("^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$", "u");
const schema64 = {"title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}]};
const schema66 = {"type":"object","description":"Reference to a media asset. src may be a relative asset path or an absolute URL.","additionalProperties":false,"required":["src","alt"],"properties":{"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};
const schema67 = {"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}};
const schema72 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};

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
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
let data4 = data.image;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.src === undefined){
const err15 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data4.alt === undefined){
const err16 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key1 in data4){
if(!((((key1 === "src") || (key1 === "alt")) || (key1 === "width")) || (key1 === "height"))){
const err17 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data4.src !== undefined){
let data5 = data4.src;
if(typeof data5 === "string"){
if(func2(data5) > 2048){
const err18 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data5) < 1){
const err19 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err20 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data4.alt !== undefined){
let data6 = data4.alt;
if(typeof data6 === "string"){
if(func2(data6) > 500){
const err21 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
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
const err22 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data4.width !== undefined){
let data7 = data4.width;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err23 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 < 1 || isNaN(data7)){
const err24 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data4.height !== undefined){
let data8 = data4.height;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err25 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 < 1 || isNaN(data8)){
const err26 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
}
else {
const err27 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.cta !== undefined){
let data9 = data.cta;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.label === undefined){
const err28 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data9.href === undefined){
const err29 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/required",keyword:"required",params:{missingProperty: "href"},message:"must have required property '"+"href"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
for(const key2 in data9){
if(!(((key2 === "label") || (key2 === "href")) || (key2 === "external"))){
const err30 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data9.label !== undefined){
let data10 = data9.label;
if(typeof data10 === "string"){
if(func2(data10) > 200){
const err31 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(func2(data10) < 1){
const err32 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err33 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data9.href !== undefined){
let data11 = data9.href;
if(typeof data11 === "string"){
if(func2(data11) > 2048){
const err34 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(func2(data11) < 1){
const err35 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err36 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data9.external !== undefined){
if(typeof data9.external !== "boolean"){
const err37 = {instancePath:instancePath+"/cta/external",schemaPath:"#/$defs/Link/properties/external/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
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
const err38 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err39 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs35 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err40 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(data.kind === undefined){
const err41 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data.format === undefined){
const err42 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data.body === undefined){
const err43 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "body"},message:"must have required property '"+"body"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
for(const key3 in data){
if(!((((key3 === "id") || (key3 === "kind")) || (key3 === "format")) || (key3 === "body"))){
const err44 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data.id !== undefined){
let data13 = data.id;
if(typeof data13 === "string"){
if(func2(data13) > 48){
const err45 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(func2(data13) < 8){
const err46 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(!pattern4.test(data13)){
const err47 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err48 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
let data14 = data.kind;
if(typeof data14 !== "string"){
const err49 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(!(data14 === "richText")){
const err50 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.format !== undefined){
let data15 = data.format;
if(typeof data15 !== "string"){
const err51 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(!((data15 === "markdown") || (data15 === "html"))){
const err52 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[1].properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data.body !== undefined){
let data16 = data.body;
if(typeof data16 === "string"){
if(func2(data16) > 200000){
const err53 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/1/properties/body/maxLength",keyword:"maxLength",params:{limit: 200000},message:"must NOT have more than 200000 characters"};
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
const err54 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/1/properties/body/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
var _valid0 = _errs35 === errors;
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
const _errs47 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err56 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data.kind === undefined){
const err57 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data.image === undefined){
const err58 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "image"},message:"must have required property '"+"image"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
for(const key4 in data){
if(!((((key4 === "id") || (key4 === "kind")) || (key4 === "image")) || (key4 === "caption"))){
const err59 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data.id !== undefined){
let data17 = data.id;
if(typeof data17 === "string"){
if(func2(data17) > 48){
const err60 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(func2(data17) < 8){
const err61 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(!pattern4.test(data17)){
const err62 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err63 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.kind !== undefined){
let data18 = data.kind;
if(typeof data18 !== "string"){
const err64 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(!(data18 === "image")){
const err65 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
if(data.image !== undefined){
let data19 = data.image;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.src === undefined){
const err66 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
if(data19.alt === undefined){
const err67 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
for(const key5 in data19){
if(!((((key5 === "src") || (key5 === "alt")) || (key5 === "width")) || (key5 === "height"))){
const err68 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data19.src !== undefined){
let data20 = data19.src;
if(typeof data20 === "string"){
if(func2(data20) > 2048){
const err69 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(func2(data20) < 1){
const err70 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err71 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data19.alt !== undefined){
let data21 = data19.alt;
if(typeof data21 === "string"){
if(func2(data21) > 500){
const err72 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
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
const err73 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data19.width !== undefined){
let data22 = data19.width;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err74 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 < 1 || isNaN(data22)){
const err75 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
}
if(data19.height !== undefined){
let data23 = data19.height;
if(!(((typeof data23 == "number") && (!(data23 % 1) && !isNaN(data23))) && (isFinite(data23)))){
const err76 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
if((typeof data23 == "number") && (isFinite(data23))){
if(data23 < 1 || isNaN(data23)){
const err77 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
}
}
else {
const err78 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.caption !== undefined){
let data24 = data.caption;
if(typeof data24 === "string"){
if(func2(data24) > 1000){
const err79 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
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
const err80 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err81 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
var _valid0 = _errs47 === errors;
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
const _errs69 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err82 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(data.kind === undefined){
const err83 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if(data.collection === undefined){
const err84 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "collection"},message:"must have required property '"+"collection"+"'"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(data.limit === undefined){
const err85 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "limit"},message:"must have required property '"+"limit"+"'"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(data.sort === undefined){
const err86 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "sort"},message:"must have required property '"+"sort"+"'"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
for(const key6 in data){
if(!((((((key6 === "id") || (key6 === "kind")) || (key6 === "collection")) || (key6 === "limit")) || (key6 === "sort")) || (key6 === "filter"))){
const err87 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data.id !== undefined){
let data25 = data.id;
if(typeof data25 === "string"){
if(func2(data25) > 48){
const err88 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if(func2(data25) < 8){
const err89 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
if(!pattern4.test(data25)){
const err90 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err91 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
if(data.kind !== undefined){
let data26 = data.kind;
if(typeof data26 !== "string"){
const err92 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
if(!(data26 === "contentList")){
const err93 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
if(data.collection !== undefined){
let data27 = data.collection;
if(typeof data27 === "string"){
if(func2(data27) > 128){
const err94 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(func2(data27) < 1){
const err95 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
if(!pattern5.test(data27)){
const err96 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
else {
const err97 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data.limit !== undefined){
let data28 = data.limit;
if(!(((typeof data28 == "number") && (!(data28 % 1) && !isNaN(data28))) && (isFinite(data28)))){
const err98 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
if((typeof data28 == "number") && (isFinite(data28))){
if(data28 > 100 || isNaN(data28)){
const err99 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if(data28 < 1 || isNaN(data28)){
const err100 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
}
if(data.sort !== undefined){
let data29 = data.sort;
if(typeof data29 !== "string"){
const err101 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if(!(((data29 === "newest") || (data29 === "oldest")) || (data29 === "title"))){
const err102 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[3].properties.sort.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
if(data.filter !== undefined){
let data30 = data.filter;
if(typeof data30 === "string"){
if(func2(data30) > 512){
const err103 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
if(func2(data30) < 1){
const err104 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
else {
const err105 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err106 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
var _valid0 = _errs69 === errors;
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
validate25.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate25.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema73 = {"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}};

function validate27(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
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
let data4 = data.ogImage;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.src === undefined){
const err8 = {instancePath:instancePath+"/ogImage",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data4.alt === undefined){
const err9 = {instancePath:instancePath+"/ogImage",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key1 in data4){
if(!((((key1 === "src") || (key1 === "alt")) || (key1 === "width")) || (key1 === "height"))){
const err10 = {instancePath:instancePath+"/ogImage",schemaPath:"#/$defs/ImageRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data4.src !== undefined){
let data5 = data4.src;
if(typeof data5 === "string"){
if(func2(data5) > 2048){
const err11 = {instancePath:instancePath+"/ogImage/src",schemaPath:"#/$defs/ImageRef/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(func2(data5) < 1){
const err12 = {instancePath:instancePath+"/ogImage/src",schemaPath:"#/$defs/ImageRef/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err13 = {instancePath:instancePath+"/ogImage/src",schemaPath:"#/$defs/ImageRef/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data4.alt !== undefined){
let data6 = data4.alt;
if(typeof data6 === "string"){
if(func2(data6) > 500){
const err14 = {instancePath:instancePath+"/ogImage/alt",schemaPath:"#/$defs/ImageRef/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
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
const err15 = {instancePath:instancePath+"/ogImage/alt",schemaPath:"#/$defs/ImageRef/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data4.width !== undefined){
let data7 = data4.width;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err16 = {instancePath:instancePath+"/ogImage/width",schemaPath:"#/$defs/ImageRef/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 < 1 || isNaN(data7)){
const err17 = {instancePath:instancePath+"/ogImage/width",schemaPath:"#/$defs/ImageRef/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data4.height !== undefined){
let data8 = data4.height;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err18 = {instancePath:instancePath+"/ogImage/height",schemaPath:"#/$defs/ImageRef/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 < 1 || isNaN(data8)){
const err19 = {instancePath:instancePath+"/ogImage/height",schemaPath:"#/$defs/ImageRef/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
}
else {
const err20 = {instancePath:instancePath+"/ogImage",schemaPath:"#/$defs/ImageRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate27.errors = vErrors;
return errors === 0;
}
validate27.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


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
if(!(func1.call(schema58.properties, key0))){
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
const err13 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern20.test(data3)){
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
const err31 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/PublishStatus/enum",keyword:"enum",params:{allowedValues: schema63.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate27(data.seo, {instancePath:instancePath+"/seo",parentData:data,parentDataProperty:"seo",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
errors = vErrors.length;
}
}
if(data.rev !== undefined){
let data10 = data.rev;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err33 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 < 0 || isNaN(data10)){
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
let data11 = data.createdAt;
if(typeof data11 === "string"){
if(!(formats0.validate(data11))){
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
let data12 = data.updatedAt;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
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
let data13 = data.metadata;
if(data13 && typeof data13 == "object" && !Array.isArray(data13)){
for(const key1 in data13){
if(typeof data13[key1] !== "string"){
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

export const validateSection = validate29;
const schema79 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/section.schema.json","title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}],"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to a media asset. src may be a relative asset path or an absolute URL.","additionalProperties":false,"required":["src","alt"],"properties":{"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Link":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128}}};
const schema80 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema81 = {"type":"object","description":"Reference to a media asset. src may be a relative asset path or an absolute URL.","additionalProperties":false,"required":["src","alt"],"properties":{"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};
const schema82 = {"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}};
const schema87 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};

function validate29(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/section.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate29.evaluated;
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
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema79.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
let data4 = data.image;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.src === undefined){
const err15 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data4.alt === undefined){
const err16 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key1 in data4){
if(!((((key1 === "src") || (key1 === "alt")) || (key1 === "width")) || (key1 === "height"))){
const err17 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data4.src !== undefined){
let data5 = data4.src;
if(typeof data5 === "string"){
if(func2(data5) > 2048){
const err18 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func2(data5) < 1){
const err19 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err20 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data4.alt !== undefined){
let data6 = data4.alt;
if(typeof data6 === "string"){
if(func2(data6) > 500){
const err21 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
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
const err22 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data4.width !== undefined){
let data7 = data4.width;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err23 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 < 1 || isNaN(data7)){
const err24 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data4.height !== undefined){
let data8 = data4.height;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err25 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 < 1 || isNaN(data8)){
const err26 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
}
else {
const err27 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.cta !== undefined){
let data9 = data.cta;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.label === undefined){
const err28 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data9.href === undefined){
const err29 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/required",keyword:"required",params:{missingProperty: "href"},message:"must have required property '"+"href"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
for(const key2 in data9){
if(!(((key2 === "label") || (key2 === "href")) || (key2 === "external"))){
const err30 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data9.label !== undefined){
let data10 = data9.label;
if(typeof data10 === "string"){
if(func2(data10) > 200){
const err31 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(func2(data10) < 1){
const err32 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err33 = {instancePath:instancePath+"/cta/label",schemaPath:"#/$defs/Link/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data9.href !== undefined){
let data11 = data9.href;
if(typeof data11 === "string"){
if(func2(data11) > 2048){
const err34 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(func2(data11) < 1){
const err35 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err36 = {instancePath:instancePath+"/cta/href",schemaPath:"#/$defs/Link/properties/href/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data9.external !== undefined){
if(typeof data9.external !== "boolean"){
const err37 = {instancePath:instancePath+"/cta/external",schemaPath:"#/$defs/Link/properties/external/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
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
const err38 = {instancePath:instancePath+"/cta",schemaPath:"#/$defs/Link/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err39 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs35 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err40 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if(data.kind === undefined){
const err41 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data.format === undefined){
const err42 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data.body === undefined){
const err43 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "body"},message:"must have required property '"+"body"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
for(const key3 in data){
if(!((((key3 === "id") || (key3 === "kind")) || (key3 === "format")) || (key3 === "body"))){
const err44 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
if(data.id !== undefined){
let data13 = data.id;
if(typeof data13 === "string"){
if(func2(data13) > 48){
const err45 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
if(func2(data13) < 8){
const err46 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(!pattern4.test(data13)){
const err47 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err48 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
let data14 = data.kind;
if(typeof data14 !== "string"){
const err49 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(!(data14 === "richText")){
const err50 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema79.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.format !== undefined){
let data15 = data.format;
if(typeof data15 !== "string"){
const err51 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(!((data15 === "markdown") || (data15 === "html"))){
const err52 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/enum",keyword:"enum",params:{allowedValues: schema79.oneOf[1].properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data.body !== undefined){
let data16 = data.body;
if(typeof data16 === "string"){
if(func2(data16) > 200000){
const err53 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/1/properties/body/maxLength",keyword:"maxLength",params:{limit: 200000},message:"must NOT have more than 200000 characters"};
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
const err54 = {instancePath:instancePath+"/body",schemaPath:"#/oneOf/1/properties/body/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
var _valid0 = _errs35 === errors;
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
const _errs47 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err56 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data.kind === undefined){
const err57 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data.image === undefined){
const err58 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "image"},message:"must have required property '"+"image"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
for(const key4 in data){
if(!((((key4 === "id") || (key4 === "kind")) || (key4 === "image")) || (key4 === "caption"))){
const err59 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data.id !== undefined){
let data17 = data.id;
if(typeof data17 === "string"){
if(func2(data17) > 48){
const err60 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if(func2(data17) < 8){
const err61 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(!pattern4.test(data17)){
const err62 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err63 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.kind !== undefined){
let data18 = data.kind;
if(typeof data18 !== "string"){
const err64 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(!(data18 === "image")){
const err65 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema79.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
if(data.image !== undefined){
let data19 = data.image;
if(data19 && typeof data19 == "object" && !Array.isArray(data19)){
if(data19.src === undefined){
const err66 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
if(data19.alt === undefined){
const err67 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
for(const key5 in data19){
if(!((((key5 === "src") || (key5 === "alt")) || (key5 === "width")) || (key5 === "height"))){
const err68 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data19.src !== undefined){
let data20 = data19.src;
if(typeof data20 === "string"){
if(func2(data20) > 2048){
const err69 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(func2(data20) < 1){
const err70 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err71 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data19.alt !== undefined){
let data21 = data19.alt;
if(typeof data21 === "string"){
if(func2(data21) > 500){
const err72 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
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
const err73 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data19.width !== undefined){
let data22 = data19.width;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err74 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 < 1 || isNaN(data22)){
const err75 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
}
if(data19.height !== undefined){
let data23 = data19.height;
if(!(((typeof data23 == "number") && (!(data23 % 1) && !isNaN(data23))) && (isFinite(data23)))){
const err76 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
if((typeof data23 == "number") && (isFinite(data23))){
if(data23 < 1 || isNaN(data23)){
const err77 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
}
}
else {
const err78 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.caption !== undefined){
let data24 = data.caption;
if(typeof data24 === "string"){
if(func2(data24) > 1000){
const err79 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
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
const err80 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err81 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
var _valid0 = _errs47 === errors;
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
const _errs69 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err82 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(data.kind === undefined){
const err83 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if(data.collection === undefined){
const err84 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "collection"},message:"must have required property '"+"collection"+"'"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
if(data.limit === undefined){
const err85 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "limit"},message:"must have required property '"+"limit"+"'"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
if(data.sort === undefined){
const err86 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "sort"},message:"must have required property '"+"sort"+"'"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
for(const key6 in data){
if(!((((((key6 === "id") || (key6 === "kind")) || (key6 === "collection")) || (key6 === "limit")) || (key6 === "sort")) || (key6 === "filter"))){
const err87 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data.id !== undefined){
let data25 = data.id;
if(typeof data25 === "string"){
if(func2(data25) > 48){
const err88 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
if(func2(data25) < 8){
const err89 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
if(!pattern4.test(data25)){
const err90 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err91 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
if(data.kind !== undefined){
let data26 = data.kind;
if(typeof data26 !== "string"){
const err92 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
if(!(data26 === "contentList")){
const err93 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema79.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
if(data.collection !== undefined){
let data27 = data.collection;
if(typeof data27 === "string"){
if(func2(data27) > 128){
const err94 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(func2(data27) < 1){
const err95 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
if(!pattern5.test(data27)){
const err96 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
else {
const err97 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
if(data.limit !== undefined){
let data28 = data.limit;
if(!(((typeof data28 == "number") && (!(data28 % 1) && !isNaN(data28))) && (isFinite(data28)))){
const err98 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
if((typeof data28 == "number") && (isFinite(data28))){
if(data28 > 100 || isNaN(data28)){
const err99 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if(data28 < 1 || isNaN(data28)){
const err100 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
}
if(data.sort !== undefined){
let data29 = data.sort;
if(typeof data29 !== "string"){
const err101 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
if(!(((data29 === "newest") || (data29 === "oldest")) || (data29 === "title"))){
const err102 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/enum",keyword:"enum",params:{allowedValues: schema79.oneOf[3].properties.sort.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
if(data.filter !== undefined){
let data30 = data.filter;
if(typeof data30 === "string"){
if(func2(data30) > 512){
const err103 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
if(func2(data30) < 1){
const err104 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
else {
const err105 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err106 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
var _valid0 = _errs69 === errors;
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
validate29.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate29.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateContentEntry = validate30;
const schema88 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/content-entry.schema.json","title":"ContentEntry","description":"A structured content item in a named collection (e.g. collection 'posts'). Core fields are typed; collection-specific fields live in `fields` and are validated by the collection's own schema in a later phase.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","collection","slug","locale","status","title","body","fields","tags","author","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"collection":{"$ref":"#/$defs/Slug"},"slug":{"$ref":"#/$defs/Slug"},"locale":{"$ref":"#/$defs/Locale"},"status":{"$ref":"#/$defs/PublishStatus"},"title":{"type":"string","minLength":1,"maxLength":300},"summary":{"type":"string","maxLength":2000},"body":{"$ref":"#/$defs/Body"},"fields":{"type":"object","description":"Collection-specific values; any JSON.","additionalProperties":true},"tags":{"type":"array","description":"Deprecated by RFC-0002: use `terms.tag`. Still accepted on input for one release and translated into terms; the store then writes []. Removed in schemaVersion 2.","deprecated":true,"items":{"$ref":"#/$defs/Slug"},"uniqueItems":true,"maxItems":50},"terms":{"type":"object","description":"Term assignments by taxonomy key (e.g. 'category', 'tag'). Terms are referenced by id, independent of locale. A taxonomy without terms is omitted, never an empty object.","propertyNames":{"$ref":"#/$defs/Slug"},"minProperties":1,"maxProperties":10,"additionalProperties":{"$ref":"#/$defs/TermAssignment"}},"author":{"$ref":"#/$defs/Actor"},"coverImage":{"$ref":"#/$defs/ImageRef"},"publishedAt":{"$ref":"#/$defs/Timestamp"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"Body":{"type":"object","additionalProperties":false,"required":["format","value"],"properties":{"format":{"type":"string","enum":["markdown","html"]},"value":{"type":"string","maxLength":1000000}}},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to a media asset. src may be a relative asset path or an absolute URL.","additionalProperties":false,"required":["src","alt"],"properties":{"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"PublishStatus":{"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"TermAssignment":{"type":"object","description":"Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.","additionalProperties":false,"required":["ids"],"properties":{"ids":{"type":"array","items":{"$ref":"#/$defs/Id"},"minItems":1,"maxItems":50,"uniqueItems":true},"primary":{"$ref":"#/$defs/Id","description":"The entry's main term in this taxonomy (breadcrumbs, articleSection, later permalinks). Must be one of `ids`."}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema89 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema90 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema92 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema94 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema95 = {"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]};
const schema96 = {"type":"object","additionalProperties":false,"required":["format","value"],"properties":{"format":{"type":"string","enum":["markdown","html"]},"value":{"type":"string","maxLength":1000000}}};
const schema105 = {"type":"object","description":"Reference to a media asset. src may be a relative asset path or an absolute URL.","additionalProperties":false,"required":["src","alt"],"properties":{"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};
const schema106 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema107 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema110 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema99 = {"type":"object","description":"Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.","additionalProperties":false,"required":["ids"],"properties":{"ids":{"type":"array","items":{"$ref":"#/$defs/Id"},"minItems":1,"maxItems":50,"uniqueItems":true},"primary":{"$ref":"#/$defs/Id","description":"The entry's main term in this taxonomy (breadcrumbs, articleSection, later permalinks). Must be one of `ids`."}}};

function validate31(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate31.evaluated;
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
validate31.errors = vErrors;
return errors === 0;
}
validate31.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema102 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema103 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate33.evaluated;
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
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema103.enum},message:"must be equal to one of the allowed values"};
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
validate33.errors = vErrors;
return errors === 0;
}
validate33.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/content-entry.schema.json" */;
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
if(!(func1.call(schema88.properties, key0))){
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
const err17 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema89.enum},message:"must be equal to one of the allowed values"};
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
const err37 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/PublishStatus/enum",keyword:"enum",params:{allowedValues: schema95.enum},message:"must be equal to one of the allowed values"};
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
let data9 = data.body;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.format === undefined){
const err43 = {instancePath:instancePath+"/body",schemaPath:"#/$defs/Body/required",keyword:"required",params:{missingProperty: "format"},message:"must have required property '"+"format"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data9.value === undefined){
const err44 = {instancePath:instancePath+"/body",schemaPath:"#/$defs/Body/required",keyword:"required",params:{missingProperty: "value"},message:"must have required property '"+"value"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
for(const key1 in data9){
if(!((key1 === "format") || (key1 === "value"))){
const err45 = {instancePath:instancePath+"/body",schemaPath:"#/$defs/Body/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data9.format !== undefined){
let data10 = data9.format;
if(typeof data10 !== "string"){
const err46 = {instancePath:instancePath+"/body/format",schemaPath:"#/$defs/Body/properties/format/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(!((data10 === "markdown") || (data10 === "html"))){
const err47 = {instancePath:instancePath+"/body/format",schemaPath:"#/$defs/Body/properties/format/enum",keyword:"enum",params:{allowedValues: schema96.properties.format.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data9.value !== undefined){
let data11 = data9.value;
if(typeof data11 === "string"){
if(func2(data11) > 1000000){
const err48 = {instancePath:instancePath+"/body/value",schemaPath:"#/$defs/Body/properties/value/maxLength",keyword:"maxLength",params:{limit: 1000000},message:"must NOT have more than 1000000 characters"};
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
const err49 = {instancePath:instancePath+"/body/value",schemaPath:"#/$defs/Body/properties/value/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
else {
const err50 = {instancePath:instancePath+"/body",schemaPath:"#/$defs/Body/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.fields !== undefined){
let data12 = data.fields;
if(data12 && typeof data12 == "object" && !Array.isArray(data12)){
}
else {
const err51 = {instancePath:instancePath+"/fields",schemaPath:"#/properties/fields/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.tags !== undefined){
let data13 = data.tags;
if(Array.isArray(data13)){
if(data13.length > 50){
const err52 = {instancePath:instancePath+"/tags",schemaPath:"#/properties/tags/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
const len0 = data13.length;
for(let i0=0; i0<len0; i0++){
let data14 = data13[i0];
if(typeof data14 === "string"){
if(func2(data14) > 128){
const err53 = {instancePath:instancePath+"/tags/" + i0,schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if(func2(data14) < 1){
const err54 = {instancePath:instancePath+"/tags/" + i0,schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(!pattern5.test(data14)){
const err55 = {instancePath:instancePath+"/tags/" + i0,schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err56 = {instancePath:instancePath+"/tags/" + i0,schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
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
const err57 = {instancePath:instancePath+"/tags",schemaPath:"#/properties/tags/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err58 = {instancePath:instancePath+"/tags",schemaPath:"#/properties/tags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
if(data.terms !== undefined){
let data15 = data.terms;
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
if(Object.keys(data15).length > 10){
const err59 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/maxProperties",keyword:"maxProperties",params:{limit: 10},message:"must NOT have more than 10 properties"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(Object.keys(data15).length < 1){
const err60 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/minProperties",keyword:"minProperties",params:{limit: 1},message:"must NOT have fewer than 1 properties"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
for(const key2 in data15){
const _errs45 = errors;
if(typeof key2 === "string"){
if(func2(key2) > 128){
const err61 = {instancePath:instancePath+"/terms",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters",propertyName:key2};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(func2(key2) < 1){
const err62 = {instancePath:instancePath+"/terms",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters",propertyName:key2};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(!pattern5.test(key2)){
const err63 = {instancePath:instancePath+"/terms",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\"",propertyName:key2};
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
const err64 = {instancePath:instancePath+"/terms",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string",propertyName:key2};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
var valid14 = _errs45 === errors;
if(!valid14){
const err65 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/propertyNames",keyword:"propertyNames",params:{propertyName: key2},message:"property name must be valid"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
for(const key3 in data15){
if(!(validate31(data15[key3], {instancePath:instancePath+"/terms/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data15,parentDataProperty:key3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate31.errors : vErrors.concat(validate31.errors);
errors = vErrors.length;
}
}
}
else {
const err66 = {instancePath:instancePath+"/terms",schemaPath:"#/properties/terms/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data.author !== undefined){
if(!(validate33(data.author, {instancePath:instancePath+"/author",parentData:data,parentDataProperty:"author",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
errors = vErrors.length;
}
}
if(data.coverImage !== undefined){
let data18 = data.coverImage;
if(data18 && typeof data18 == "object" && !Array.isArray(data18)){
if(data18.src === undefined){
const err67 = {instancePath:instancePath+"/coverImage",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
if(data18.alt === undefined){
const err68 = {instancePath:instancePath+"/coverImage",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
for(const key4 in data18){
if(!((((key4 === "src") || (key4 === "alt")) || (key4 === "width")) || (key4 === "height"))){
const err69 = {instancePath:instancePath+"/coverImage",schemaPath:"#/$defs/ImageRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data18.src !== undefined){
let data19 = data18.src;
if(typeof data19 === "string"){
if(func2(data19) > 2048){
const err70 = {instancePath:instancePath+"/coverImage/src",schemaPath:"#/$defs/ImageRef/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(func2(data19) < 1){
const err71 = {instancePath:instancePath+"/coverImage/src",schemaPath:"#/$defs/ImageRef/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
else {
const err72 = {instancePath:instancePath+"/coverImage/src",schemaPath:"#/$defs/ImageRef/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data18.alt !== undefined){
let data20 = data18.alt;
if(typeof data20 === "string"){
if(func2(data20) > 500){
const err73 = {instancePath:instancePath+"/coverImage/alt",schemaPath:"#/$defs/ImageRef/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
else {
const err74 = {instancePath:instancePath+"/coverImage/alt",schemaPath:"#/$defs/ImageRef/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data18.width !== undefined){
let data21 = data18.width;
if(!(((typeof data21 == "number") && (!(data21 % 1) && !isNaN(data21))) && (isFinite(data21)))){
const err75 = {instancePath:instancePath+"/coverImage/width",schemaPath:"#/$defs/ImageRef/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if((typeof data21 == "number") && (isFinite(data21))){
if(data21 < 1 || isNaN(data21)){
const err76 = {instancePath:instancePath+"/coverImage/width",schemaPath:"#/$defs/ImageRef/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data18.height !== undefined){
let data22 = data18.height;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err77 = {instancePath:instancePath+"/coverImage/height",schemaPath:"#/$defs/ImageRef/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 < 1 || isNaN(data22)){
const err78 = {instancePath:instancePath+"/coverImage/height",schemaPath:"#/$defs/ImageRef/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
}
}
else {
const err79 = {instancePath:instancePath+"/coverImage",schemaPath:"#/$defs/ImageRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data.publishedAt !== undefined){
let data23 = data.publishedAt;
if(typeof data23 === "string"){
if(!(formats0.validate(data23))){
const err80 = {instancePath:instancePath+"/publishedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err81 = {instancePath:instancePath+"/publishedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data.rev !== undefined){
let data24 = data.rev;
if(!(((typeof data24 == "number") && (!(data24 % 1) && !isNaN(data24))) && (isFinite(data24)))){
const err82 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if((typeof data24 == "number") && (isFinite(data24))){
if(data24 < 0 || isNaN(data24)){
const err83 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
if(data.createdAt !== undefined){
let data25 = data.createdAt;
if(typeof data25 === "string"){
if(!(formats0.validate(data25))){
const err84 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
else {
const err85 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data26 = data.updatedAt;
if(typeof data26 === "string"){
if(!(formats0.validate(data26))){
const err86 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err87 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
if(data.metadata !== undefined){
let data27 = data.metadata;
if(data27 && typeof data27 == "object" && !Array.isArray(data27)){
for(const key5 in data27){
if(typeof data27[key5] !== "string"){
const err88 = {instancePath:instancePath+"/metadata/" + key5.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
else {
const err89 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
}
else {
const err90 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSnapshot = validate35;
const schema111 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/snapshot.schema.json","title":"Snapshot","description":"Immutable record of a site's node set at one instant: which nodes existed, at which revision, with which content hash. Every mutation by an agent produces one; publish and rollback point the site at one. Node bodies are stored by hash in the blob store, not here.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","siteRev","reason","actor","nodes","summary","createdAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"parentId":{"$ref":"#/$defs/Id","description":"Previous snapshot in this site's history; absent for the first one."},"siteRev":{"$ref":"#/$defs/Revision"},"reason":{"type":"string","enum":["manual","agentMutation","publish","rollback","scheduled","import"]},"label":{"type":"string","maxLength":200},"actor":{"$ref":"#/$defs/Actor"},"nodes":{"type":"array","items":{"$ref":"#/$defs/NodeRef"}},"summary":{"$ref":"#/$defs/ChangeSummary"},"createdAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"ChangeSummary":{"type":"object","additionalProperties":false,"required":["added","changed","removed"],"properties":{"added":{"type":"integer","minimum":0},"changed":{"type":"integer","minimum":0},"removed":{"type":"integer","minimum":0}}},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"NodeRef":{"type":"object","additionalProperties":false,"required":["id","kind","rev","hash"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["site","page","contentEntry"]},"rev":{"$ref":"#/$defs/Revision"},"hash":{"type":"string","description":"Lower-case hex SHA-256 of the node's canonical JSON.","pattern":"^[0-9a-f]{64}$"}}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema112 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema113 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema116 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema123 = {"type":"object","additionalProperties":false,"required":["added","changed","removed"],"properties":{"added":{"type":"integer","minimum":0},"changed":{"type":"integer","minimum":0},"removed":{"type":"integer","minimum":0}}};
const schema124 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema125 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema117 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema118 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

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
validate36.errors = vErrors;
return errors === 0;
}
validate36.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema120 = {"type":"object","additionalProperties":false,"required":["id","kind","rev","hash"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["site","page","contentEntry"]},"rev":{"$ref":"#/$defs/Revision"},"hash":{"type":"string","description":"Lower-case hex SHA-256 of the node's canonical JSON.","pattern":"^[0-9a-f]{64}$"}}};
const pattern47 = new RegExp("^[0-9a-f]{64}$", "u");

function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
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
if(!(((data1 === "site") || (data1 === "page")) || (data1 === "contentEntry"))){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema120.properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern47.test(data3)){
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
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate35(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/snapshot.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate35.evaluated;
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
if(!(func1.call(schema111.properties, key0))){
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
const err11 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema112.enum},message:"must be equal to one of the allowed values"};
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
const err27 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/enum",keyword:"enum",params:{allowedValues: schema111.properties.reason.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate36(data.actor, {instancePath:instancePath+"/actor",parentData:data,parentDataProperty:"actor",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
}
if(data.nodes !== undefined){
let data8 = data.nodes;
if(Array.isArray(data8)){
const len0 = data8.length;
for(let i0=0; i0<len0; i0++){
if(!(validate38(data8[i0], {instancePath:instancePath+"/nodes/" + i0,parentData:data8,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
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
validate35.errors = vErrors;
return errors === 0;
}
validate35.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSkillManifest = validate40;
const schema126 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/skill-manifest.schema.json","title":"SkillManifest","description":"YAML frontmatter of a SKILL.md, exactly the six fields of the Agent Skills specification (agentskills.io). Cloudhal-specific data goes under `metadata` as flat string keys prefixed `cloudhal.` (schemaVersion, requiresCapabilities, scopes, approval); nested vendor blocks are rejected by hosted skill uploaders.","type":"object","additionalProperties":false,"required":["name","description"],"properties":{"name":{"type":"string","description":"Lower-case kebab-case; must equal the skill directory name.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":64},"description":{"type":"string","minLength":1,"maxLength":1024},"license":{"type":"string","maxLength":200},"compatibility":{"type":"string","maxLength":500},"metadata":{"$ref":"#/$defs/Metadata"},"allowed-tools":{"type":"string","description":"Space-separated tool names the skill may call (experimental in the spec).","maxLength":2000}},"$defs":{"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}}}};
const schema127 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/skill-manifest.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate40.evaluated;
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
validate40.errors = vErrors;
return errors === 0;
}
validate40.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateTaxonomy = validate41;
const schema128 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/taxonomy.schema.json","title":"Taxonomy","description":"A classification scheme of a site (e.g. 'category', 'tag', 'series') and its rules: hierarchy, who may create terms, how many terms an entry takes, and how its archives are published. Terms are separate nodes (term.schema.json) that point here by id (RFC-0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","key","labels","hierarchical","allowNewTerms","required","archive","feed","minEntriesToIndex","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"key":{"$ref":"#/$defs/Slug","description":"Stable name of the taxonomy, unique per site and immutable once created. ContentEntry.terms and filter expressions use it (e.g. 'category:news')."},"labels":{"type":"object","description":"Display names per locale. Must contain the site's default locale.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"$ref":"#/$defs/TaxonomyLabel"}},"hierarchical":{"type":"boolean","description":"Terms may have a parent term (categories). Flat when false (tags)."},"allowNewTerms":{"type":"string","description":"Who may add terms. none: people only. propose: agents may create terms with status 'proposed' that wait for a person. free: agents may create active terms.","enum":["none","propose","free"]},"required":{"type":"boolean","description":"An entry in review or published status must have at least one term of this taxonomy and an explicit primary term."},"maxPerEntry":{"type":"integer","description":"Most terms of this taxonomy one entry may carry. Absent: the contract limit of 50.","minimum":1,"maximum":50},"collections":{"type":"array","description":"Collections this taxonomy applies to. Absent: every collection.","items":{"$ref":"#/$defs/Slug"},"minItems":1,"maxItems":50,"uniqueItems":true},"archive":{"$ref":"#/$defs/TaxonomyArchive"},"feed":{"type":"boolean","description":"Publish an RSS feed per term at <archive.basePath>/<slug>/rss.xml. Requires archive.enabled."},"minEntriesToIndex":{"type":"integer","description":"Archives listing fewer published entries than this are served with robots 'noindex, follow' and left out of the sitemap.","minimum":0,"maximum":1000},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Path":{"type":"string","description":"Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"TaxonomyArchive":{"type":"object","description":"Public archive pages: <basePath>/<term-slug> and <basePath>/<term-slug>/page/<n>.","additionalProperties":false,"required":["enabled","basePath"],"properties":{"enabled":{"type":"boolean"},"basePath":{"$ref":"#/$defs/Path"}}},"TaxonomyLabel":{"type":"object","additionalProperties":false,"required":["singular","plural"],"properties":{"singular":{"type":"string","minLength":1,"maxLength":100},"plural":{"type":"string","minLength":1,"maxLength":100},"description":{"type":"string","maxLength":1000}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema129 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema130 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema132 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema133 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema134 = {"type":"object","additionalProperties":false,"required":["singular","plural"],"properties":{"singular":{"type":"string","minLength":1,"maxLength":100},"plural":{"type":"string","minLength":1,"maxLength":100},"description":{"type":"string","maxLength":1000}}};
const schema138 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema139 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema141 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema136 = {"type":"object","description":"Public archive pages: <basePath>/<term-slug> and <basePath>/<term-slug>/page/<n>.","additionalProperties":false,"required":["enabled","basePath"],"properties":{"enabled":{"type":"boolean"},"basePath":{"$ref":"#/$defs/Path"}}};
const schema137 = {"type":"string","description":"Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024};

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
if(!pattern20.test(data1)){
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
validate42.errors = vErrors;
return errors === 0;
}
validate42.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate41(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/taxonomy.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate41.evaluated;
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
if(!(func1.call(schema128.properties, key0))){
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
const err16 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema129.enum},message:"must be equal to one of the allowed values"};
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
const err48 = {instancePath:instancePath+"/allowNewTerms",schemaPath:"#/properties/allowNewTerms/enum",keyword:"enum",params:{allowedValues: schema128.properties.allowNewTerms.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate42(data.archive, {instancePath:instancePath+"/archive",parentData:data,parentDataProperty:"archive",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
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
validate41.errors = vErrors;
return errors === 0;
}
validate41.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateTerm = validate44;
const schema142 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/term.schema.json","title":"Term","description":"One concept in a taxonomy (a category, a tag, a series). Content refers to terms by id, independent of locale; names, synonyms, archive intro and SEO are per locale. Renames, merges and retirements keep the id and leave redirects behind; `proposedBy` records the actor that proposed it (RFC-0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","taxonomyId","slug","status","visibility","labels","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"taxonomyId":{"$ref":"#/$defs/Id"},"slug":{"$ref":"#/$defs/Slug","description":"URL segment of the term's archive; unique within its taxonomy, together with every slug in any term's slugHistory."},"status":{"type":"string","description":"active: usable and public (subject to visibility). proposed: created by an agent, waiting for a person; assignable but never public. retired: no new assignments, no archive.","enum":["active","proposed","retired"]},"visibility":{"type":"string","description":"internal terms have no archive, feed or sitemap entry and are not shown on entries; themes and filters may still use them.","enum":["public","internal"]},"labels":{"type":"object","description":"Names per locale. Must contain the site's default locale.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"$ref":"#/$defs/TermLabel"}},"parentId":{"$ref":"#/$defs/Id","description":"Parent term in the same taxonomy; only in hierarchical taxonomies. No cycles."},"image":{"$ref":"#/$defs/ImageRef"},"slugHistory":{"type":"array","description":"Earlier slugs, oldest first. Old slugs stay reserved in the taxonomy and still resolve when an agent assigns by slug.","items":{"$ref":"#/$defs/Slug"},"minItems":1,"maxItems":50,"uniqueItems":true},"mergedInto":{"$ref":"#/$defs/Id","description":"Set when this term was merged into another active term of the same taxonomy; status is then 'retired'."},"proposedBy":{"$ref":"#/$defs/Actor"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to a media asset. src may be a relative asset path or an absolute URL.","additionalProperties":false,"required":["src","alt"],"properties":{"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Seo":{"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"TermLabel":{"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":200},"altNames":{"type":"array","description":"Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":50,"uniqueItems":true},"description":{"type":"string","description":"Markdown introduction shown at the top of the archive.","maxLength":20000},"seo":{"$ref":"#/$defs/Seo"}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema143 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema144 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema147 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema148 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema151 = {"type":"object","description":"Reference to a media asset. src may be a relative asset path or an absolute URL.","additionalProperties":false,"required":["src","alt"],"properties":{"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};
const schema159 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema160 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema162 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema149 = {"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":200},"altNames":{"type":"array","description":"Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":50,"uniqueItems":true},"description":{"type":"string","description":"Markdown introduction shown at the top of the archive.","maxLength":20000},"seo":{"$ref":"#/$defs/Seo"}}};
const schema150 = {"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}};

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
let data4 = data.ogImage;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.src === undefined){
const err8 = {instancePath:instancePath+"/ogImage",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data4.alt === undefined){
const err9 = {instancePath:instancePath+"/ogImage",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key1 in data4){
if(!((((key1 === "src") || (key1 === "alt")) || (key1 === "width")) || (key1 === "height"))){
const err10 = {instancePath:instancePath+"/ogImage",schemaPath:"#/$defs/ImageRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data4.src !== undefined){
let data5 = data4.src;
if(typeof data5 === "string"){
if(func2(data5) > 2048){
const err11 = {instancePath:instancePath+"/ogImage/src",schemaPath:"#/$defs/ImageRef/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(func2(data5) < 1){
const err12 = {instancePath:instancePath+"/ogImage/src",schemaPath:"#/$defs/ImageRef/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err13 = {instancePath:instancePath+"/ogImage/src",schemaPath:"#/$defs/ImageRef/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data4.alt !== undefined){
let data6 = data4.alt;
if(typeof data6 === "string"){
if(func2(data6) > 500){
const err14 = {instancePath:instancePath+"/ogImage/alt",schemaPath:"#/$defs/ImageRef/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
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
const err15 = {instancePath:instancePath+"/ogImage/alt",schemaPath:"#/$defs/ImageRef/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data4.width !== undefined){
let data7 = data4.width;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err16 = {instancePath:instancePath+"/ogImage/width",schemaPath:"#/$defs/ImageRef/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 < 1 || isNaN(data7)){
const err17 = {instancePath:instancePath+"/ogImage/width",schemaPath:"#/$defs/ImageRef/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data4.height !== undefined){
let data8 = data4.height;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err18 = {instancePath:instancePath+"/ogImage/height",schemaPath:"#/$defs/ImageRef/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 < 1 || isNaN(data8)){
const err19 = {instancePath:instancePath+"/ogImage/height",schemaPath:"#/$defs/ImageRef/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
}
else {
const err20 = {instancePath:instancePath+"/ogImage",schemaPath:"#/$defs/ImageRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
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
if(!(validate46(data.seo, {instancePath:instancePath+"/seo",parentData:data,parentDataProperty:"seo",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate46.errors : vErrors.concat(validate46.errors);
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
validate45.errors = vErrors;
return errors === 0;
}
validate45.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema156 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema157 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate49(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate49.evaluated;
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
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema157.enum},message:"must be equal to one of the allowed values"};
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
validate49.errors = vErrors;
return errors === 0;
}
validate49.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/term.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate44.evaluated;
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
if(!(func1.call(schema142.properties, key0))){
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
const err13 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema143.enum},message:"must be equal to one of the allowed values"};
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
const err31 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema142.properties.status.enum},message:"must be equal to one of the allowed values"};
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
const err33 = {instancePath:instancePath+"/visibility",schemaPath:"#/properties/visibility/enum",keyword:"enum",params:{allowedValues: schema142.properties.visibility.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate45(data7[key2], {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data7,parentDataProperty:key2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
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
if(data.image !== undefined){
let data10 = data.image;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
if(data10.src === undefined){
const err43 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "src"},message:"must have required property '"+"src"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data10.alt === undefined){
const err44 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/required",keyword:"required",params:{missingProperty: "alt"},message:"must have required property '"+"alt"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
for(const key3 in data10){
if(!((((key3 === "src") || (key3 === "alt")) || (key3 === "width")) || (key3 === "height"))){
const err45 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
if(data10.src !== undefined){
let data11 = data10.src;
if(typeof data11 === "string"){
if(func2(data11) > 2048){
const err46 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if(func2(data11) < 1){
const err47 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err48 = {instancePath:instancePath+"/image/src",schemaPath:"#/$defs/ImageRef/properties/src/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
if(data10.alt !== undefined){
let data12 = data10.alt;
if(typeof data12 === "string"){
if(func2(data12) > 500){
const err49 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
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
const err50 = {instancePath:instancePath+"/image/alt",schemaPath:"#/$defs/ImageRef/properties/alt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data10.width !== undefined){
let data13 = data10.width;
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err51 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 < 1 || isNaN(data13)){
const err52 = {instancePath:instancePath+"/image/width",schemaPath:"#/$defs/ImageRef/properties/width/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data10.height !== undefined){
let data14 = data10.height;
if(!(((typeof data14 == "number") && (!(data14 % 1) && !isNaN(data14))) && (isFinite(data14)))){
const err53 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
if((typeof data14 == "number") && (isFinite(data14))){
if(data14 < 1 || isNaN(data14)){
const err54 = {instancePath:instancePath+"/image/height",schemaPath:"#/$defs/ImageRef/properties/height/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
const err55 = {instancePath:instancePath+"/image",schemaPath:"#/$defs/ImageRef/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data.slugHistory !== undefined){
let data15 = data.slugHistory;
if(Array.isArray(data15)){
if(data15.length > 50){
const err56 = {instancePath:instancePath+"/slugHistory",schemaPath:"#/properties/slugHistory/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data15.length < 1){
const err57 = {instancePath:instancePath+"/slugHistory",schemaPath:"#/properties/slugHistory/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
const len0 = data15.length;
for(let i0=0; i0<len0; i0++){
let data16 = data15[i0];
if(typeof data16 === "string"){
if(func2(data16) > 128){
const err58 = {instancePath:instancePath+"/slugHistory/" + i0,schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(func2(data16) < 1){
const err59 = {instancePath:instancePath+"/slugHistory/" + i0,schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(!pattern5.test(data16)){
const err60 = {instancePath:instancePath+"/slugHistory/" + i0,schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err61 = {instancePath:instancePath+"/slugHistory/" + i0,schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
let i1 = data15.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data15[i1], data15[j0])){
const err62 = {instancePath:instancePath+"/slugHistory",schemaPath:"#/properties/slugHistory/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err63 = {instancePath:instancePath+"/slugHistory",schemaPath:"#/properties/slugHistory/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data.mergedInto !== undefined){
let data17 = data.mergedInto;
if(typeof data17 === "string"){
if(func2(data17) > 48){
const err64 = {instancePath:instancePath+"/mergedInto",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(func2(data17) < 8){
const err65 = {instancePath:instancePath+"/mergedInto",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
if(!pattern4.test(data17)){
const err66 = {instancePath:instancePath+"/mergedInto",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err67 = {instancePath:instancePath+"/mergedInto",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data.proposedBy !== undefined){
if(!(validate49(data.proposedBy, {instancePath:instancePath+"/proposedBy",parentData:data,parentDataProperty:"proposedBy",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate49.errors : vErrors.concat(validate49.errors);
errors = vErrors.length;
}
}
if(data.rev !== undefined){
let data19 = data.rev;
if(!(((typeof data19 == "number") && (!(data19 % 1) && !isNaN(data19))) && (isFinite(data19)))){
const err68 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if((typeof data19 == "number") && (isFinite(data19))){
if(data19 < 0 || isNaN(data19)){
const err69 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
if(data.createdAt !== undefined){
let data20 = data.createdAt;
if(typeof data20 === "string"){
if(!(formats0.validate(data20))){
const err70 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err71 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data21 = data.updatedAt;
if(typeof data21 === "string"){
if(!(formats0.validate(data21))){
const err72 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err73 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data.metadata !== undefined){
let data22 = data.metadata;
if(data22 && typeof data22 == "object" && !Array.isArray(data22)){
for(const key4 in data22){
if(typeof data22[key4] !== "string"){
const err74 = {instancePath:instancePath+"/metadata/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
}
else {
const err75 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
}
else {
const err76 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
validate44.errors = vErrors;
return errors === 0;
}
validate44.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateRedirect = validate51;
const schema163 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/redirect.schema.json","title":"Redirect","description":"An HTTP redirect from a path the site no longer serves. Created automatically when a published entry or a term changes slug, when terms are merged or retired, and by people. Snapshotted and published like every other node (RFC-0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","from","to","status","match","reason","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"from":{"type":"string","description":"Request path to redirect: starts with '/', no query, fragment, backslash or trailing slash (root excepted). Unique per site; never a path the site currently serves.","pattern":"^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$","maxLength":1024},"to":{"type":"string","description":"Target: a site path (may carry a query or fragment) or an absolute https URL. Protocol-relative ('//host') and backslash forms are rejected.","pattern":"^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$","maxLength":2048},"status":{"type":"integer","description":"301 (permanent) for slug changes, merges and retirements; 302 (temporary) only for manual redirects.","enum":[301,302]},"match":{"type":"string","description":"exact: only `from` itself. prefix: `from` and every path below it; the rest of the path is appended to `to` (archives: /tag/old/page/2 → /tag/new/page/2).","enum":["exact","prefix"]},"reason":{"type":"string","enum":["slug-change","merge","retire","manual"]},"source":{"$ref":"#/$defs/RedirectSource"},"note":{"type":"string","maxLength":500},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"RedirectSource":{"type":"object","description":"The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["page","contentEntry","term"]},"id":{"$ref":"#/$defs/Id"}}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema164 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema165 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema169 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema170 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema172 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern66 = new RegExp("^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$", "u");
const pattern67 = new RegExp("^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$", "u");
const schema167 = {"type":"object","description":"The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["page","contentEntry","term"]},"id":{"$ref":"#/$defs/Id"}}};

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
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema167.properties.kind.enum},message:"must be equal to one of the allowed values"};
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
validate52.errors = vErrors;
return errors === 0;
}
validate52.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate51(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/redirect.schema.json" */;
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
if(!(func1.call(schema163.properties, key0))){
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
const err13 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema164.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern66.test(data3)){
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
if(!pattern67.test(data4)){
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
const err29 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema163.properties.status.enum},message:"must be equal to one of the allowed values"};
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
const err31 = {instancePath:instancePath+"/match",schemaPath:"#/properties/match/enum",keyword:"enum",params:{allowedValues: schema163.properties.match.enum},message:"must be equal to one of the allowed values"};
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
const err33 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/enum",keyword:"enum",params:{allowedValues: schema163.properties.reason.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate52(data.source, {instancePath:instancePath+"/source",parentData:data,parentDataProperty:"source",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate52.errors : vErrors.concat(validate52.errors);
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
validate51.errors = vErrors;
return errors === 0;
}
validate51.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

