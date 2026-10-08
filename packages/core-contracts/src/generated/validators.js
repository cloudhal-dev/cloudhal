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
const schema58 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/page.schema.json","title":"Page","description":"A routable page of a site: a path, editorial status and an ordered list of sections. Sections are embedded (not separate nodes) so a page is the unit of locking, snapshotting and diffing.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","path","title","locale","status","sections","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"path":{"type":"string","description":"Absolute URL path, starting with '/', no trailing slash except root.","pattern":"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$","maxLength":1024},"title":{"type":"string","minLength":1,"maxLength":300},"locale":{"$ref":"#/$defs/Locale"},"status":{"$ref":"#/$defs/PublishStatus"},"sections":{"type":"array","items":{"$ref":"#/$defs/Section"}},"seo":{"$ref":"#/$defs/Seo"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Link":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"PublishStatus":{"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Section":{"title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}]},"Seo":{"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema59 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema60 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema62 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema63 = {"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]};
const schema74 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema75 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema77 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern20 = new RegExp("^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$", "u");
const schema64 = {"title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}]};
const schema68 = {"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}};
const schema72 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema66 = {"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};

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
if(!((((key2 === "id") || (key2 === "kind")) || (key2 === "format")) || (key2 === "body"))){
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
const err37 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
const err39 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[1].properties.format.enum},message:"must be equal to one of the allowed values"};
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
}
else {
const err42 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
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
const _errs36 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err43 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data.kind === undefined){
const err44 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data.image === undefined){
const err45 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "image"},message:"must have required property '"+"image"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
for(const key3 in data){
if(!((((key3 === "id") || (key3 === "kind")) || (key3 === "image")) || (key3 === "caption"))){
const err46 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.id !== undefined){
let data13 = data.id;
if(typeof data13 === "string"){
if(func2(data13) > 48){
const err47 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(func2(data13) < 8){
const err48 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(!pattern4.test(data13)){
const err49 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err50 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.kind !== undefined){
let data14 = data.kind;
if(typeof data14 !== "string"){
const err51 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(!(data14 === "image")){
const err52 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
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
let data16 = data.caption;
if(typeof data16 === "string"){
if(func2(data16) > 1000){
const err53 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
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
const err54 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err55 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
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
const _errs47 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err56 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data.kind === undefined){
const err57 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data.collection === undefined){
const err58 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "collection"},message:"must have required property '"+"collection"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data.limit === undefined){
const err59 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "limit"},message:"must have required property '"+"limit"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(data.sort === undefined){
const err60 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "sort"},message:"must have required property '"+"sort"+"'"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
for(const key4 in data){
if(!((((((key4 === "id") || (key4 === "kind")) || (key4 === "collection")) || (key4 === "limit")) || (key4 === "sort")) || (key4 === "filter"))){
const err61 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.id !== undefined){
let data17 = data.id;
if(typeof data17 === "string"){
if(func2(data17) > 48){
const err62 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(func2(data17) < 8){
const err63 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(!pattern4.test(data17)){
const err64 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err65 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
if(data.kind !== undefined){
let data18 = data.kind;
if(typeof data18 !== "string"){
const err66 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
if(!(data18 === "contentList")){
const err67 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data.collection !== undefined){
let data19 = data.collection;
if(typeof data19 === "string"){
if(func2(data19) > 128){
const err68 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if(func2(data19) < 1){
const err69 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(!pattern5.test(data19)){
const err70 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err71 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data.limit !== undefined){
let data20 = data.limit;
if(!(((typeof data20 == "number") && (!(data20 % 1) && !isNaN(data20))) && (isFinite(data20)))){
const err72 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if((typeof data20 == "number") && (isFinite(data20))){
if(data20 > 100 || isNaN(data20)){
const err73 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(data20 < 1 || isNaN(data20)){
const err74 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data.sort !== undefined){
let data21 = data.sort;
if(typeof data21 !== "string"){
const err75 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(!(((data21 === "newest") || (data21 === "oldest")) || (data21 === "title"))){
const err76 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/enum",keyword:"enum",params:{allowedValues: schema64.oneOf[3].properties.sort.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data.filter !== undefined){
let data22 = data.filter;
if(typeof data22 === "string"){
if(func2(data22) > 512){
const err77 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if(func2(data22) < 1){
const err78 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err79 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
}
else {
const err80 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
var _valid0 = _errs47 === errors;
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
const err81 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
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
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


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
if(!(validate30(data.seo, {instancePath:instancePath+"/seo",parentData:data,parentDataProperty:"seo",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
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

export const validateSection = validate33;
const schema78 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/section.schema.json","title":"Section","description":"A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum.","oneOf":[{"type":"object","title":"HeroSection","additionalProperties":false,"required":["id","kind","heading"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["hero"]},"heading":{"type":"string","minLength":1,"maxLength":300},"subheading":{"type":"string","maxLength":1000},"image":{"$ref":"#/$defs/ImageRef"},"cta":{"$ref":"#/$defs/Link"}}},{"type":"object","title":"RichTextSection","additionalProperties":false,"required":["id","kind","format","body"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["richText"]},"format":{"type":"string","enum":["markdown","html"]},"body":{"type":"string","maxLength":200000}}},{"type":"object","title":"ImageSection","additionalProperties":false,"required":["id","kind","image"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["image"]},"image":{"$ref":"#/$defs/ImageRef"},"caption":{"type":"string","maxLength":1000}}},{"type":"object","title":"ContentListSection","description":"Renders the newest entries of a content collection (e.g. blog posts).","additionalProperties":false,"required":["id","kind","collection","limit","sort"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentList"]},"collection":{"$ref":"#/$defs/Slug"},"limit":{"type":"integer","minimum":1,"maximum":100},"sort":{"type":"string","enum":["newest","oldest","title"]},"filter":{"type":"string","description":"Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'.","minLength":1,"maxLength":512}}}],"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Link":{"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128}}};
const schema79 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema82 = {"type":"object","additionalProperties":false,"required":["label","href"],"properties":{"label":{"type":"string","minLength":1,"maxLength":200},"href":{"type":"string","minLength":1,"maxLength":2048},"external":{"type":"boolean"}}};
const schema86 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema80 = {"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};

function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate34.evaluated;
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
validate34.errors = vErrors;
return errors === 0;
}
validate34.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/section.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate33.evaluated;
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
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema78.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate34(data.image, {instancePath:instancePath+"/image",parentData:data,parentDataProperty:"image",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
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
if(!((((key2 === "id") || (key2 === "kind")) || (key2 === "format")) || (key2 === "body"))){
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
const err37 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema78.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
const err39 = {instancePath:instancePath+"/format",schemaPath:"#/oneOf/1/properties/format/enum",keyword:"enum",params:{allowedValues: schema78.oneOf[1].properties.format.enum},message:"must be equal to one of the allowed values"};
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
}
else {
const err42 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
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
const _errs36 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err43 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data.kind === undefined){
const err44 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data.image === undefined){
const err45 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "image"},message:"must have required property '"+"image"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
for(const key3 in data){
if(!((((key3 === "id") || (key3 === "kind")) || (key3 === "image")) || (key3 === "caption"))){
const err46 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data.id !== undefined){
let data13 = data.id;
if(typeof data13 === "string"){
if(func2(data13) > 48){
const err47 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(func2(data13) < 8){
const err48 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(!pattern4.test(data13)){
const err49 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err50 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.kind !== undefined){
let data14 = data.kind;
if(typeof data14 !== "string"){
const err51 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(!(data14 === "image")){
const err52 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema78.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
if(data.image !== undefined){
if(!(validate34(data.image, {instancePath:instancePath+"/image",parentData:data,parentDataProperty:"image",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
errors = vErrors.length;
}
}
if(data.caption !== undefined){
let data16 = data.caption;
if(typeof data16 === "string"){
if(func2(data16) > 1000){
const err53 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"};
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
const err54 = {instancePath:instancePath+"/caption",schemaPath:"#/oneOf/2/properties/caption/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err55 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
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
const _errs47 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err56 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data.kind === undefined){
const err57 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data.collection === undefined){
const err58 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "collection"},message:"must have required property '"+"collection"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data.limit === undefined){
const err59 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "limit"},message:"must have required property '"+"limit"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(data.sort === undefined){
const err60 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "sort"},message:"must have required property '"+"sort"+"'"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
for(const key4 in data){
if(!((((((key4 === "id") || (key4 === "kind")) || (key4 === "collection")) || (key4 === "limit")) || (key4 === "sort")) || (key4 === "filter"))){
const err61 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.id !== undefined){
let data17 = data.id;
if(typeof data17 === "string"){
if(func2(data17) > 48){
const err62 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/maxLength",keyword:"maxLength",params:{limit: 48},message:"must NOT have more than 48 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(func2(data17) < 8){
const err63 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(!pattern4.test(data17)){
const err64 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/pattern",keyword:"pattern",params:{pattern: "^[a-z]+_[A-Za-z0-9]{6,32}$"},message:"must match pattern \""+"^[a-z]+_[A-Za-z0-9]{6,32}$"+"\""};
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
const err65 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/Id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
if(data.kind !== undefined){
let data18 = data.kind;
if(typeof data18 !== "string"){
const err66 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
if(!(data18 === "contentList")){
const err67 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema78.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
if(data.collection !== undefined){
let data19 = data.collection;
if(typeof data19 === "string"){
if(func2(data19) > 128){
const err68 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if(func2(data19) < 1){
const err69 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(!pattern5.test(data19)){
const err70 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
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
const err71 = {instancePath:instancePath+"/collection",schemaPath:"#/$defs/Slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
}
if(data.limit !== undefined){
let data20 = data.limit;
if(!(((typeof data20 == "number") && (!(data20 % 1) && !isNaN(data20))) && (isFinite(data20)))){
const err72 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if((typeof data20 == "number") && (isFinite(data20))){
if(data20 > 100 || isNaN(data20)){
const err73 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/maximum",keyword:"maximum",params:{comparison: "<=", limit: 100},message:"must be <= 100"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(data20 < 1 || isNaN(data20)){
const err74 = {instancePath:instancePath+"/limit",schemaPath:"#/oneOf/3/properties/limit/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
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
if(data.sort !== undefined){
let data21 = data.sort;
if(typeof data21 !== "string"){
const err75 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(!(((data21 === "newest") || (data21 === "oldest")) || (data21 === "title"))){
const err76 = {instancePath:instancePath+"/sort",schemaPath:"#/oneOf/3/properties/sort/enum",keyword:"enum",params:{allowedValues: schema78.oneOf[3].properties.sort.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data.filter !== undefined){
let data22 = data.filter;
if(typeof data22 === "string"){
if(func2(data22) > 512){
const err77 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/maxLength",keyword:"maxLength",params:{limit: 512},message:"must NOT have more than 512 characters"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if(func2(data22) < 1){
const err78 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err79 = {instancePath:instancePath+"/filter",schemaPath:"#/oneOf/3/properties/filter/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
}
else {
const err80 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
var _valid0 = _errs47 === errors;
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
const err81 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
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
validate33.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate33.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateContentEntry = validate37;
const schema87 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/content-entry.schema.json","title":"ContentEntry","description":"A structured content item in a named collection (e.g. collection 'posts'). Core fields are typed; collection-specific fields live in `fields` and are validated by the collection's own schema in a later phase.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","collection","slug","locale","status","title","body","fields","tags","author","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"collection":{"$ref":"#/$defs/Slug"},"slug":{"$ref":"#/$defs/Slug"},"locale":{"$ref":"#/$defs/Locale"},"status":{"$ref":"#/$defs/PublishStatus"},"title":{"type":"string","minLength":1,"maxLength":300},"summary":{"type":"string","maxLength":2000},"body":{"$ref":"#/$defs/Body"},"fields":{"type":"object","description":"Collection-specific values; any JSON.","additionalProperties":true},"tags":{"type":"array","description":"Deprecated by RFC-0002: use `terms.tag`. Still accepted on input for one release and translated into terms; the store then writes []. Removed in schemaVersion 2.","deprecated":true,"items":{"$ref":"#/$defs/Slug"},"uniqueItems":true,"maxItems":50},"terms":{"type":"object","description":"Term assignments by taxonomy key (e.g. 'category', 'tag'). Terms are referenced by id, independent of locale. A taxonomy without terms is omitted, never an empty object.","propertyNames":{"$ref":"#/$defs/Slug"},"minProperties":1,"maxProperties":10,"additionalProperties":{"$ref":"#/$defs/TermAssignment"}},"author":{"$ref":"#/$defs/Actor"},"coverImage":{"$ref":"#/$defs/ImageRef"},"publishedAt":{"$ref":"#/$defs/Timestamp"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"Body":{"type":"object","additionalProperties":false,"required":["format","value"],"properties":{"format":{"type":"string","enum":["markdown","html"]},"value":{"type":"string","maxLength":1000000}}},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"PublishStatus":{"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"TermAssignment":{"type":"object","description":"Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.","additionalProperties":false,"required":["ids"],"properties":{"ids":{"type":"array","items":{"$ref":"#/$defs/Id"},"minItems":1,"maxItems":50,"uniqueItems":true},"primary":{"$ref":"#/$defs/Id","description":"The entry's main term in this taxonomy (breadcrumbs, articleSection, later permalinks). Must be one of `ids`."}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema88 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema89 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema91 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema93 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema94 = {"type":"string","description":"Editorial lifecycle of a page or content entry.","enum":["draft","review","published","archived"]};
const schema95 = {"type":"object","additionalProperties":false,"required":["format","value"],"properties":{"format":{"type":"string","enum":["markdown","html"]},"value":{"type":"string","maxLength":1000000}}};
const schema106 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema107 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema110 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema98 = {"type":"object","description":"Terms of one taxonomy on one entry, in display order. The primary term is explicit and never derived from the order.","additionalProperties":false,"required":["ids"],"properties":{"ids":{"type":"array","items":{"$ref":"#/$defs/Id"},"minItems":1,"maxItems":50,"uniqueItems":true},"primary":{"$ref":"#/$defs/Id","description":"The entry's main term in this taxonomy (breadcrumbs, articleSection, later permalinks). Must be one of `ids`."}}};

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
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema101 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema102 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
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
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema102.enum},message:"must be equal to one of the allowed values"};
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
validate40.errors = vErrors;
return errors === 0;
}
validate40.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema104 = {"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};

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


function validate37(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/content-entry.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate37.evaluated;
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
if(!(func1.call(schema87.properties, key0))){
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
const err17 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema88.enum},message:"must be equal to one of the allowed values"};
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
const err37 = {instancePath:instancePath+"/status",schemaPath:"#/$defs/PublishStatus/enum",keyword:"enum",params:{allowedValues: schema94.enum},message:"must be equal to one of the allowed values"};
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
const err47 = {instancePath:instancePath+"/body/format",schemaPath:"#/$defs/Body/properties/format/enum",keyword:"enum",params:{allowedValues: schema95.properties.format.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate38(data15[key3], {instancePath:instancePath+"/terms/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data15,parentDataProperty:key3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
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
if(!(validate40(data.author, {instancePath:instancePath+"/author",parentData:data,parentDataProperty:"author",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate40.errors : vErrors.concat(validate40.errors);
errors = vErrors.length;
}
}
if(data.coverImage !== undefined){
if(!(validate42(data.coverImage, {instancePath:instancePath+"/coverImage",parentData:data,parentDataProperty:"coverImage",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
errors = vErrors.length;
}
}
if(data.publishedAt !== undefined){
let data19 = data.publishedAt;
if(typeof data19 === "string"){
if(!(formats0.validate(data19))){
const err67 = {instancePath:instancePath+"/publishedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err68 = {instancePath:instancePath+"/publishedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data.rev !== undefined){
let data20 = data.rev;
if(!(((typeof data20 == "number") && (!(data20 % 1) && !isNaN(data20))) && (isFinite(data20)))){
const err69 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if((typeof data20 == "number") && (isFinite(data20))){
if(data20 < 0 || isNaN(data20)){
const err70 = {instancePath:instancePath+"/rev",schemaPath:"#/$defs/Revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
if(data.createdAt !== undefined){
let data21 = data.createdAt;
if(typeof data21 === "string"){
if(!(formats0.validate(data21))){
const err71 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err72 = {instancePath:instancePath+"/createdAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data22 = data.updatedAt;
if(typeof data22 === "string"){
if(!(formats0.validate(data22))){
const err73 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
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
const err74 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/$defs/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data.metadata !== undefined){
let data23 = data.metadata;
if(data23 && typeof data23 == "object" && !Array.isArray(data23)){
for(const key4 in data23){
if(typeof data23[key4] !== "string"){
const err75 = {instancePath:instancePath+"/metadata/" + key4.replace(/~/g, "~0").replace(/\//g, "~1"),schemaPath:"#/$defs/Metadata/additionalProperties/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err76 = {instancePath:instancePath+"/metadata",schemaPath:"#/$defs/Metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
else {
const err77 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
validate37.errors = vErrors;
return errors === 0;
}
validate37.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSnapshot = validate44;
const schema111 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/snapshot.schema.json","title":"Snapshot","description":"Immutable record of a site's node set at one instant: which nodes existed, at which revision, with which content hash. Every mutation by an agent produces one; publish and rollback point the site at one. Node bodies are stored by hash in the blob store, not here.","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","siteRev","reason","actor","nodes","summary","createdAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"parentId":{"$ref":"#/$defs/Id","description":"Previous snapshot in this site's history; absent for the first one."},"siteRev":{"$ref":"#/$defs/Revision"},"reason":{"type":"string","enum":["manual","agentMutation","publish","rollback","scheduled","import"]},"label":{"type":"string","maxLength":200},"actor":{"$ref":"#/$defs/Actor"},"nodes":{"type":"array","items":{"$ref":"#/$defs/NodeRef"}},"summary":{"$ref":"#/$defs/ChangeSummary"},"createdAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"ChangeSummary":{"type":"object","additionalProperties":false,"required":["added","changed","removed"],"properties":{"added":{"type":"integer","minimum":0},"changed":{"type":"integer","minimum":0},"removed":{"type":"integer","minimum":0}}},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"NodeRef":{"type":"object","additionalProperties":false,"required":["id","kind","rev","hash"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["site","page","contentEntry","taxonomy","term","redirect","menu","asset"]},"rev":{"$ref":"#/$defs/Revision"},"hash":{"type":"string","description":"Lower-case hex SHA-256 of the node's canonical JSON.","pattern":"^[0-9a-f]{64}$"}}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema112 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema113 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema116 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema123 = {"type":"object","additionalProperties":false,"required":["added","changed","removed"],"properties":{"added":{"type":"integer","minimum":0},"changed":{"type":"integer","minimum":0},"removed":{"type":"integer","minimum":0}}};
const schema124 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema125 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema117 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema118 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

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
validate45.errors = vErrors;
return errors === 0;
}
validate45.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema120 = {"type":"object","additionalProperties":false,"required":["id","kind","rev","hash"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["site","page","contentEntry","taxonomy","term","redirect","menu","asset"]},"rev":{"$ref":"#/$defs/Revision"},"hash":{"type":"string","description":"Lower-case hex SHA-256 of the node's canonical JSON.","pattern":"^[0-9a-f]{64}$"}}};
const pattern50 = new RegExp("^[0-9a-f]{64}$", "u");

function validate47(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate47.evaluated;
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
if(!pattern50.test(data3)){
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
validate47.errors = vErrors;
return errors === 0;
}
validate47.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/snapshot.schema.json" */;
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
if(!(validate45(data.actor, {instancePath:instancePath+"/actor",parentData:data,parentDataProperty:"actor",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
errors = vErrors.length;
}
}
if(data.nodes !== undefined){
let data8 = data.nodes;
if(Array.isArray(data8)){
const len0 = data8.length;
for(let i0=0; i0<len0; i0++){
if(!(validate47(data8[i0], {instancePath:instancePath+"/nodes/" + i0,parentData:data8,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate47.errors : vErrors.concat(validate47.errors);
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
validate44.errors = vErrors;
return errors === 0;
}
validate44.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSkillManifest = validate49;
const schema126 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/skill-manifest.schema.json","title":"SkillManifest","description":"YAML frontmatter of a SKILL.md, exactly the six fields of the Agent Skills specification (agentskills.io). Cloudhal-specific data goes under `metadata` as flat string keys prefixed `cloudhal.` (schemaVersion, requiresCapabilities, scopes, approval); nested vendor blocks are rejected by hosted skill uploaders.","type":"object","additionalProperties":false,"required":["name","description"],"properties":{"name":{"type":"string","description":"Lower-case kebab-case; must equal the skill directory name.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":64},"description":{"type":"string","minLength":1,"maxLength":1024},"license":{"type":"string","maxLength":200},"compatibility":{"type":"string","maxLength":500},"metadata":{"$ref":"#/$defs/Metadata"},"allowed-tools":{"type":"string","description":"Space-separated tool names the skill may call (experimental in the spec).","maxLength":2000}},"$defs":{"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}}}};
const schema127 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};

function validate49(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/skill-manifest.schema.json" */;
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
validate49.errors = vErrors;
return errors === 0;
}
validate49.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateTaxonomy = validate50;
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

function validate51(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
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
validate51.errors = vErrors;
return errors === 0;
}
validate51.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate50(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/taxonomy.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate50.evaluated;
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
if(!(validate51(data.archive, {instancePath:instancePath+"/archive",parentData:data,parentDataProperty:"archive",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate51.errors : vErrors.concat(validate51.errors);
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
validate50.errors = vErrors;
return errors === 0;
}
validate50.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateTerm = validate53;
const schema142 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/term.schema.json","title":"Term","description":"One concept in a taxonomy (a category, a tag, a series). Content refers to terms by id, independent of locale; names, synonyms, archive intro and SEO are per locale. Renames, merges and retirements keep the id and leave redirects behind; `proposedBy` records the actor that proposed it (RFC-0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","taxonomyId","slug","status","visibility","labels","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"taxonomyId":{"$ref":"#/$defs/Id"},"slug":{"$ref":"#/$defs/Slug","description":"URL segment of the term's archive; unique within its taxonomy, together with every slug in any term's slugHistory."},"status":{"type":"string","description":"active: usable and public (subject to visibility). proposed: created by an agent, waiting for a person; assignable but never public. retired: no new assignments, no archive.","enum":["active","proposed","retired"]},"visibility":{"type":"string","description":"internal terms have no archive, feed or sitemap entry and are not shown on entries; themes and filters may still use them.","enum":["public","internal"]},"labels":{"type":"object","description":"Names per locale. Must contain the site's default locale.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"$ref":"#/$defs/TermLabel"}},"parentId":{"$ref":"#/$defs/Id","description":"Parent term in the same taxonomy; only in hierarchical taxonomies. No cycles."},"position":{"type":"integer","description":"Order among sibling terms (same taxonomy and parent), lowest first, for menus and sidebars. Terms without a position follow, by name.","minimum":0,"maximum":100000},"image":{"$ref":"#/$defs/ImageRef"},"slugHistory":{"type":"array","description":"Earlier slugs, oldest first. Old slugs stay reserved in the taxonomy and still resolve when an agent assigns by slug.","items":{"$ref":"#/$defs/Slug"},"minItems":1,"maxItems":50,"uniqueItems":true},"mergedInto":{"$ref":"#/$defs/Id","description":"Set when this term was merged into another active term of the same taxonomy; status is then 'retired'."},"proposedBy":{"$ref":"#/$defs/Actor"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"ImageRef":{"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Seo":{"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"TermLabel":{"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":200},"altNames":{"type":"array","description":"Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":50,"uniqueItems":true},"description":{"type":"string","description":"Markdown introduction shown at the top of the archive.","maxLength":20000},"seo":{"$ref":"#/$defs/Seo"}}},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema143 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema144 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema147 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema148 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema159 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema160 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema162 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema149 = {"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"type":"string","minLength":1,"maxLength":200},"altNames":{"type":"array","description":"Synonyms (SKOS altLabel). Matched when an agent or editor assigns by name; never shown as separate terms.","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":50,"uniqueItems":true},"description":{"type":"string","description":"Markdown introduction shown at the top of the archive.","maxLength":20000},"seo":{"$ref":"#/$defs/Seo"}}};
const schema150 = {"type":"object","description":"Search and social metadata of a routable node (page, term archive).","additionalProperties":false,"properties":{"title":{"type":"string","maxLength":300},"description":{"type":"string","maxLength":500},"noindex":{"type":"boolean"},"canonical":{"type":"string","maxLength":2048},"ogImage":{"$ref":"#/$defs/ImageRef"}}};
const schema151 = {"type":"object","description":"Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before.","additionalProperties":false,"required":["src","alt"],"properties":{"assetId":{"$ref":"#/$defs/Id","description":"The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."},"src":{"type":"string","minLength":1,"maxLength":2048},"alt":{"type":"string","maxLength":500},"width":{"type":"integer","minimum":1},"height":{"type":"integer","minimum":1}}};

function validate56(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate56.evaluated;
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
validate56.errors = vErrors;
return errors === 0;
}
validate56.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


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
if(!(validate56(data.ogImage, {instancePath:instancePath+"/ogImage",parentData:data,parentDataProperty:"ogImage",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
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
if(!(validate55(data.seo, {instancePath:instancePath+"/seo",parentData:data,parentDataProperty:"seo",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
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
validate54.errors = vErrors;
return errors === 0;
}
validate54.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema156 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema157 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate61(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate61.evaluated;
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
validate61.errors = vErrors;
return errors === 0;
}
validate61.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate53(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/term.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate53.evaluated;
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
if(!(validate54(data7[key2], {instancePath:instancePath+"/labels/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),parentData:data7,parentDataProperty:key2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
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
if(!(validate56(data.image, {instancePath:instancePath+"/image",parentData:data,parentDataProperty:"image",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate56.errors : vErrors.concat(validate56.errors);
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
if(!(validate61(data.proposedBy, {instancePath:instancePath+"/proposedBy",parentData:data,parentDataProperty:"proposedBy",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate61.errors : vErrors.concat(validate61.errors);
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
validate53.errors = vErrors;
return errors === 0;
}
validate53.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateRedirect = validate63;
const schema163 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/redirect.schema.json","title":"Redirect","description":"An HTTP redirect from a path the site no longer serves. Created automatically when a published entry or a term changes slug, when terms are merged or retired, and by people. Snapshotted and published like every other node (RFC-0002).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","from","to","status","match","reason","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"from":{"type":"string","description":"Request path to redirect: starts with '/', no query, fragment, backslash or trailing slash (root excepted). Unique per site; never a path the site currently serves.","pattern":"^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$","maxLength":1024},"to":{"type":"string","description":"Target: a site path (may carry a query or fragment) or an absolute https URL. Protocol-relative ('//host') and backslash forms are rejected.","pattern":"^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$","maxLength":2048},"status":{"type":"integer","description":"301 (permanent) for slug changes, merges and retirements; 302 (temporary) only for manual redirects.","enum":[301,302]},"match":{"type":"string","description":"exact: only `from` itself. prefix: `from` and every path below it; the rest of the path is appended to `to` (archives: /tag/old/page/2 → /tag/new/page/2).","enum":["exact","prefix"]},"reason":{"type":"string","enum":["slug-change","merge","retire","manual"]},"source":{"$ref":"#/$defs/RedirectSource"},"note":{"type":"string","maxLength":500},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"RedirectSource":{"type":"object","description":"The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["page","contentEntry","term"]},"id":{"$ref":"#/$defs/Id"}}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema164 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema165 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema169 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema170 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema172 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern70 = new RegExp("^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$", "u");
const pattern71 = new RegExp("^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$", "u");
const schema167 = {"type":"object","description":"The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs.","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["page","contentEntry","term"]},"id":{"$ref":"#/$defs/Id"}}};

function validate64(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate64.evaluated;
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
validate64.errors = vErrors;
return errors === 0;
}
validate64.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate63(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/redirect.schema.json" */;
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
if(!pattern70.test(data3)){
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
if(!pattern71.test(data4)){
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
if(!(validate64(data.source, {instancePath:instancePath+"/source",parentData:data,parentDataProperty:"source",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate64.errors : vErrors.concat(validate64.errors);
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
validate63.errors = vErrors;
return errors === 0;
}
validate63.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAsset = validate66;
const schema173 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/asset.schema.json","title":"Asset","description":"A media file of a site (image, video, audio, document, data) as a graph node: its bytes are identified by SHA-256 and stored once per site in the blob store under a content-addressed key, or kept elsewhere (`storage.kind: external`, e.g. a Zenodo or Hugging Face file). Pages, entries and terms refer to it by id (`ImageRef.assetId`, markdown `asset:<id>`). Snapshotted like every node, so a deleted asset's bytes stay while any snapshot references it (RFC-0004).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","kind","mediaType","bytes","sha256","slug","storage","status","uploadedBy","source","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"kind":{"type":"string","description":"What the file is, derived from the sniffed media type (never chosen by the client). `other` is allowed for external storage only.","enum":["image","video","audio","document","data","other"]},"mediaType":{"type":"string","description":"MIME type of the stored bytes as sniffed by the server (RFC 6838, lower case, no parameters), e.g. image/webp, text/csv. Served as Content-Type.","pattern":"^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$","maxLength":255},"bytes":{"type":"integer","description":"Size of the stored bytes. For external files: the size the source reports or the uploader declares.","minimum":0},"sha256":{"$ref":"#/$defs/Sha256","description":"SHA-256 of the stored bytes (lower-case hex): the blob key, the public URL prefix, the ETag and the checksum shown with downloads. Unique per site. For external files see `storage.checksum`."},"originalSha256":{"$ref":"#/$defs/Sha256","description":"SHA-256 of the bytes as uploaded, present only when the server changed them (image metadata stripping)."},"slug":{"$ref":"#/$defs/Slug","description":"File name in the public URL, without extension: /media/<sha256[0..16]>/<slug>.<ext>. May change; the old URL then answers 301 to the new one."},"storage":{"$ref":"#/$defs/AssetStorage"},"image":{"$ref":"#/$defs/AssetImage"},"title":{"type":"object","description":"Display title per locale (download lists, library search).","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":300}},"alt":{"type":"object","description":"Alternative text per locale. An `ImageRef.alt` that is not empty overrides it for one use.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":500}},"decorative":{"type":"boolean","description":"The image carries no information and renders with alt=\"\". Absent means false; the store never writes false."},"caption":{"type":"object","description":"Caption per locale (plain text), the default for figures that show this asset.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":1000}},"credit":{"type":"string","description":"Who made it, as shown next to it (e.g. 'Photo: Ayşe Yılmaz').","minLength":1,"maxLength":300},"license":{"$ref":"#/$defs/AssetLicense"},"status":{"type":"string","description":"active: listed and pickable. retired: hidden from the library and pickers and cannot be newly referenced; existing references keep rendering.","enum":["active","retired"]},"uploadedBy":{"$ref":"#/$defs/Actor"},"source":{"$ref":"#/$defs/AssetSource"},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Actor":{"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}},"ActorKind":{"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]},"AssetImage":{"type":"object","description":"Intrinsic size and placeholders of an image. Present for every image stored as a blob.","additionalProperties":false,"required":["width","height"],"properties":{"width":{"type":"integer","minimum":1,"maximum":100000},"height":{"type":"integer","minimum":1,"maximum":100000},"animated":{"type":"boolean","description":"Animated GIF or WebP: never resized or re-encoded. Absent means false; the store never writes false."},"blurhash":{"type":"string","description":"BlurHash of the image for themes that decode it client-side.","pattern":"^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$"},"lqip":{"type":"string","description":"Low-quality placeholder: a raster data: URL of at most about 3 KB, shown while the image loads.","pattern":"^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$","maxLength":4096}}},"AssetLicense":{"description":"Terms the asset may be reused under: an SPDX license expression or a license URL.","oneOf":[{"type":"object","title":"SpdxLicense","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["spdx"]},"id":{"type":"string","description":"SPDX license identifier or simple expression, e.g. CC-BY-4.0, CC0-1.0, MIT OR Apache-2.0, LicenseRef-AllRightsReserved.","pattern":"^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$","maxLength":200}}},{"type":"object","title":"UrlLicense","additionalProperties":false,"required":["kind","url"],"properties":{"kind":{"type":"string","enum":["url"]},"url":{"$ref":"#/$defs/HttpsUrl"},"name":{"type":"string","minLength":1,"maxLength":200}}}]},"AssetSource":{"description":"How the asset came in. Immutable after create.","oneOf":[{"type":"object","title":"UploadSource","description":"Bytes uploaded by a person (REST) or an agent (MCP upload_asset).","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["upload"]},"filename":{"type":"string","description":"Original file name as sent (never used as a storage key or served).","pattern":"^[^/\\\\\\u0000-\\u001f\\u007f]+$","minLength":1,"maxLength":255}}},{"type":"object","title":"FetchSource","description":"Bytes the server fetched from an https URL (MCP fetch_asset_url, Studio 'From URL') under the SSRF rules.","additionalProperties":false,"required":["kind","url","fetchedAt"],"properties":{"kind":{"type":"string","enum":["fetch"]},"url":{"$ref":"#/$defs/HttpsUrl"},"fetchedAt":{"$ref":"#/$defs/Timestamp"}}},{"type":"object","title":"ImportSource","description":"Created by a migration or importer (e.g. `cloudhal media import-urls` from an ImageRef.src).","additionalProperties":false,"required":["kind","from"],"properties":{"kind":{"type":"string","enum":["import"]},"from":{"type":"string","description":"The reference it was imported from: a URL or a site path.","minLength":1,"maxLength":2048},"importer":{"$ref":"#/$defs/Slug"}}},{"type":"object","title":"LinkSource","description":"An external file registered by URL without copying its bytes (storage.kind external).","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["link"]}}}]},"AssetStorage":{"description":"Where the bytes live. `blob`: in this deployment's blob store (R2 or the filesystem) under the content-addressed key media/<siteId>/<sha256>, derived and never stored, so the node is portable between backends. `external`: elsewhere, linked rather than hosted (large research files on Zenodo or Hugging Face).","oneOf":[{"type":"object","title":"BlobStorage","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["blob"]}}},{"type":"object","title":"ExternalStorage","additionalProperties":false,"required":["kind","url","checksum"],"properties":{"kind":{"type":"string","enum":["external"]},"url":{"$ref":"#/$defs/HttpsUrl","description":"Direct download URL of the file."},"landingPage":{"$ref":"#/$defs/HttpsUrl","description":"Human page of the record the file belongs to (e.g. a Zenodo record or a Hugging Face dataset)."},"checksum":{"type":"string","description":"How `sha256` was obtained. computed: the server or `cloudhal media verify` streamed the URL and hashed it. declared: given by the person who linked it, not verified (shown as such).","enum":["computed","declared"]},"verifiedAt":{"$ref":"#/$defs/Timestamp","description":"When the URL last produced bytes with this SHA-256 (checksum `computed`)."}}}]},"HttpsUrl":{"type":"string","description":"Absolute https URL without credentials, whitespace or backslashes.","pattern":"^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$","maxLength":2048},"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Sha256":{"type":"string","description":"Lower-case hex SHA-256 digest.","pattern":"^[0-9a-f]{64}$"},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema174 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema175 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema177 = {"type":"string","description":"Lower-case hex SHA-256 digest.","pattern":"^[0-9a-f]{64}$"};
const schema179 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema184 = {"type":"object","description":"Intrinsic size and placeholders of an image. Present for every image stored as a blob.","additionalProperties":false,"required":["width","height"],"properties":{"width":{"type":"integer","minimum":1,"maximum":100000},"height":{"type":"integer","minimum":1,"maximum":100000},"animated":{"type":"boolean","description":"Animated GIF or WebP: never resized or re-encoded. Absent means false; the store never writes false."},"blurhash":{"type":"string","description":"BlurHash of the image for themes that decode it client-side.","pattern":"^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$"},"lqip":{"type":"string","description":"Low-quality placeholder: a raster data: URL of at most about 3 KB, shown while the image loads.","pattern":"^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$","maxLength":4096}}};
const schema185 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const schema197 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema183 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema200 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const pattern75 = new RegExp("^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$", "u");
const pattern81 = new RegExp("^[0-9A-Za-z#$%*+,.:;=?@^_{|}~\\[\\]-]{6,100}$", "u");
const pattern82 = new RegExp("^data:image/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$", "u");
const schema180 = {"description":"Where the bytes live. `blob`: in this deployment's blob store (R2 or the filesystem) under the content-addressed key media/<siteId>/<sha256>, derived and never stored, so the node is portable between backends. `external`: elsewhere, linked rather than hosted (large research files on Zenodo or Hugging Face).","oneOf":[{"type":"object","title":"BlobStorage","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["blob"]}}},{"type":"object","title":"ExternalStorage","additionalProperties":false,"required":["kind","url","checksum"],"properties":{"kind":{"type":"string","enum":["external"]},"url":{"$ref":"#/$defs/HttpsUrl","description":"Direct download URL of the file."},"landingPage":{"$ref":"#/$defs/HttpsUrl","description":"Human page of the record the file belongs to (e.g. a Zenodo record or a Hugging Face dataset)."},"checksum":{"type":"string","description":"How `sha256` was obtained. computed: the server or `cloudhal media verify` streamed the URL and hashed it. declared: given by the person who linked it, not verified (shown as such).","enum":["computed","declared"]},"verifiedAt":{"$ref":"#/$defs/Timestamp","description":"When the URL last produced bytes with this SHA-256 (checksum `computed`)."}}}]};
const schema181 = {"type":"string","description":"Absolute https URL without credentials, whitespace or backslashes.","pattern":"^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$","maxLength":2048};
const pattern79 = new RegExp("^https://[^\\s\\\\/?#@]+(?:[/?#][^\\s\\\\]*)?$", "u");

function validate67(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate67.evaluated;
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
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema180.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema180.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern79.test(data2)){
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
if(!pattern79.test(data3)){
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
const err18 = {instancePath:instancePath+"/checksum",schemaPath:"#/oneOf/1/properties/checksum/enum",keyword:"enum",params:{allowedValues: schema180.oneOf[1].properties.checksum.enum},message:"must be equal to one of the allowed values"};
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
validate67.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate67.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema188 = {"description":"Terms the asset may be reused under: an SPDX license expression or a license URL.","oneOf":[{"type":"object","title":"SpdxLicense","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"type":"string","enum":["spdx"]},"id":{"type":"string","description":"SPDX license identifier or simple expression, e.g. CC-BY-4.0, CC0-1.0, MIT OR Apache-2.0, LicenseRef-AllRightsReserved.","pattern":"^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$","maxLength":200}}},{"type":"object","title":"UrlLicense","additionalProperties":false,"required":["kind","url"],"properties":{"kind":{"type":"string","enum":["url"]},"url":{"$ref":"#/$defs/HttpsUrl"},"name":{"type":"string","minLength":1,"maxLength":200}}}]};
const pattern86 = new RegExp("^[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:AND|OR|WITH) [A-Za-z0-9][A-Za-z0-9.+-]*)*$", "u");

function validate69(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate69.evaluated;
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
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema188.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern86.test(data1)){
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
const err13 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema188.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern79.test(data3)){
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
validate69.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate69.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema190 = {"type":"object","additionalProperties":false,"required":["kind","id"],"properties":{"kind":{"$ref":"#/$defs/ActorKind"},"id":{"$ref":"#/$defs/Id"},"name":{"type":"string","maxLength":200}}};
const schema191 = {"type":"string","description":"Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly.","enum":["human","agent","system"]};

function validate71(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate71.evaluated;
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
const err4 = {instancePath:instancePath+"/kind",schemaPath:"#/$defs/ActorKind/enum",keyword:"enum",params:{allowedValues: schema191.enum},message:"must be equal to one of the allowed values"};
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
validate71.errors = vErrors;
return errors === 0;
}
validate71.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema193 = {"description":"How the asset came in. Immutable after create.","oneOf":[{"type":"object","title":"UploadSource","description":"Bytes uploaded by a person (REST) or an agent (MCP upload_asset).","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["upload"]},"filename":{"type":"string","description":"Original file name as sent (never used as a storage key or served).","pattern":"^[^/\\\\\\u0000-\\u001f\\u007f]+$","minLength":1,"maxLength":255}}},{"type":"object","title":"FetchSource","description":"Bytes the server fetched from an https URL (MCP fetch_asset_url, Studio 'From URL') under the SSRF rules.","additionalProperties":false,"required":["kind","url","fetchedAt"],"properties":{"kind":{"type":"string","enum":["fetch"]},"url":{"$ref":"#/$defs/HttpsUrl"},"fetchedAt":{"$ref":"#/$defs/Timestamp"}}},{"type":"object","title":"ImportSource","description":"Created by a migration or importer (e.g. `cloudhal media import-urls` from an ImageRef.src).","additionalProperties":false,"required":["kind","from"],"properties":{"kind":{"type":"string","enum":["import"]},"from":{"type":"string","description":"The reference it was imported from: a URL or a site path.","minLength":1,"maxLength":2048},"importer":{"$ref":"#/$defs/Slug"}}},{"type":"object","title":"LinkSource","description":"An external file registered by URL without copying its bytes (storage.kind external).","additionalProperties":false,"required":["kind"],"properties":{"kind":{"type":"string","enum":["link"]}}}]};
const pattern89 = new RegExp("^[^/\\\\\\u0000-\\u001f\\u007f]+$", "u");

function validate73(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate73.evaluated;
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
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema193.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern89.test(data1)){
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
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema193.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern79.test(data3)){
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
const err25 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema193.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
const err37 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema193.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
validate73.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate73.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate66(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/asset.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate66.evaluated;
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
if(!(func1.call(schema173.properties, key0))){
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
const err17 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema174.enum},message:"must be equal to one of the allowed values"};
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
const err27 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema173.properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern75.test(data4)){
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
if(!pattern50.test(data6)){
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
if(!pattern50.test(data7)){
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
if(!(validate67(data.storage, {instancePath:instancePath+"/storage",parentData:data,parentDataProperty:"storage",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate67.errors : vErrors.concat(validate67.errors);
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
if(!pattern81.test(data14)){
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
if(!pattern82.test(data15)){
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
if(!(validate69(data.license, {instancePath:instancePath+"/license",parentData:data,parentDataProperty:"license",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate69.errors : vErrors.concat(validate69.errors);
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
const err86 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema173.properties.status.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate71(data.uploadedBy, {instancePath:instancePath+"/uploadedBy",parentData:data,parentDataProperty:"uploadedBy",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate71.errors : vErrors.concat(validate71.errors);
errors = vErrors.length;
}
}
if(data.source !== undefined){
if(!(validate73(data.source, {instancePath:instancePath+"/source",parentData:data,parentDataProperty:"source",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate73.errors : vErrors.concat(validate73.errors);
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
validate66.errors = vErrors;
return errors === 0;
}
validate66.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateMenu = validate75;
const schema201 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cloudhal.dev/schemas/v1/menu.schema.json","title":"Menu","description":"A named navigation menu of a site (e.g. 'primary', 'footer', 'sidebar'): an ordered tree of items. Items point at pages, entries and terms by id, so renames and slug changes never break them; an item whose target is gone, retired or unpublished is hidden by the renderer, never rendered as a dead link (RFC-0003).","type":"object","additionalProperties":false,"required":["schemaVersion","id","siteId","key","maxDepth","items","rev","createdAt","updatedAt"],"properties":{"schemaVersion":{"$ref":"#/$defs/SchemaVersion"},"id":{"$ref":"#/$defs/Id"},"siteId":{"$ref":"#/$defs/Id"},"key":{"$ref":"#/$defs/Slug","description":"Where themes place the menu ('primary', 'footer', 'sidebar', …). Unique per site and immutable once created."},"maxDepth":{"type":"integer","description":"Deepest level an item may sit at; top-level items are level 1. The store refuses deeper trees.","minimum":1,"maximum":6},"items":{"type":"array","description":"Top-level items in display order. Empty means the site deliberately shows no items here (a missing menu means the theme's derived default).","items":{"$ref":"#/$defs/MenuItem"},"maxItems":100},"rev":{"$ref":"#/$defs/Revision"},"createdAt":{"$ref":"#/$defs/Timestamp"},"updatedAt":{"$ref":"#/$defs/Timestamp"},"metadata":{"$ref":"#/$defs/Metadata"}},"$defs":{"Id":{"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48},"Locale":{"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"},"MenuItem":{"description":"One item, discriminated by `kind` (what it links to). Children, in display order, form the tree; an item has exactly one parent by construction, so the tree has no cycles.","oneOf":[{"type":"object","title":"PageMenuItem","description":"Links to a page by id; the label falls back to the page title.","additionalProperties":false,"required":["id","kind","pageId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["page"]},"pageId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"EntryMenuItem","description":"Links to a content entry by id (at /<collection>/<slug>); the label falls back to the entry title.","additionalProperties":false,"required":["id","kind","entryId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentEntry"]},"entryId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"TermMenuItem","description":"Links to a term's archive by term id; the label falls back to the term name in the locale.","additionalProperties":false,"required":["id","kind","termId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["term"]},"termId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"CollectionMenuItem","description":"Links to the index of a content collection, wherever the theme serves it. Collections have no node and no title, so labels are required.","additionalProperties":false,"required":["id","kind","collection","labels"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["collection"]},"collection":{"$ref":"#/$defs/Slug"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"UrlMenuItem","description":"Links to an external https URL. The host is ASCII (internationalised names in punycode) and carries no user-info, so a label cannot hide where the link goes.","additionalProperties":false,"required":["id","kind","href","labels"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["url"]},"href":{"type":"string","pattern":"^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$","maxLength":2048},"newTab":{"type":"boolean","description":"Open in a new tab (rendered with rel=\"noopener noreferrer\")."},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"GroupMenuItem","description":"A label without a link that holds other items: a dropdown parent or a sidebar section heading. Hidden when none of its children is shown.","additionalProperties":false,"required":["id","kind","labels","children"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["group"]},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}}]},"MenuLabels":{"type":"object","description":"Item label per locale; plain text, no control characters or surrounding whitespace. A locale without a label falls back to the default locale's label, then to the target's own title or name.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":100,"pattern":"^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$"}},"Metadata":{"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}},"Revision":{"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0},"SchemaVersion":{"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]},"Slug":{"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128},"Timestamp":{"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"}}};
const schema202 = {"type":"integer","description":"Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time.","enum":[1]};
const schema203 = {"type":"string","description":"Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles.","pattern":"^[a-z]+_[A-Za-z0-9]{6,32}$","minLength":8,"maxLength":48};
const schema205 = {"type":"string","description":"Lower-case URL segment.","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$","minLength":1,"maxLength":128};
const schema219 = {"type":"integer","description":"Monotonic per-node revision used for optimistic locking (compare-and-swap on write).","minimum":0};
const schema220 = {"type":"string","description":"RFC 3339 / ISO 8601 instant in UTC.","format":"date-time"};
const schema222 = {"type":"object","description":"Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source).","additionalProperties":{"type":"string"}};
const schema206 = {"description":"One item, discriminated by `kind` (what it links to). Children, in display order, form the tree; an item has exactly one parent by construction, so the tree has no cycles.","oneOf":[{"type":"object","title":"PageMenuItem","description":"Links to a page by id; the label falls back to the page title.","additionalProperties":false,"required":["id","kind","pageId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["page"]},"pageId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"EntryMenuItem","description":"Links to a content entry by id (at /<collection>/<slug>); the label falls back to the entry title.","additionalProperties":false,"required":["id","kind","entryId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["contentEntry"]},"entryId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"TermMenuItem","description":"Links to a term's archive by term id; the label falls back to the term name in the locale.","additionalProperties":false,"required":["id","kind","termId"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["term"]},"termId":{"$ref":"#/$defs/Id"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"CollectionMenuItem","description":"Links to the index of a content collection, wherever the theme serves it. Collections have no node and no title, so labels are required.","additionalProperties":false,"required":["id","kind","collection","labels"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["collection"]},"collection":{"$ref":"#/$defs/Slug"},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"UrlMenuItem","description":"Links to an external https URL. The host is ASCII (internationalised names in punycode) and carries no user-info, so a label cannot hide where the link goes.","additionalProperties":false,"required":["id","kind","href","labels"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["url"]},"href":{"type":"string","pattern":"^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$","maxLength":2048},"newTab":{"type":"boolean","description":"Open in a new tab (rendered with rel=\"noopener noreferrer\")."},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}},{"type":"object","title":"GroupMenuItem","description":"A label without a link that holds other items: a dropdown parent or a sidebar section heading. Hidden when none of its children is shown.","additionalProperties":false,"required":["id","kind","labels","children"],"properties":{"id":{"$ref":"#/$defs/Id"},"kind":{"type":"string","enum":["group"]},"labels":{"$ref":"#/$defs/MenuLabels"},"children":{"type":"array","items":{"$ref":"#/$defs/MenuItem"},"minItems":1,"maxItems":100}}}]};
const pattern106 = new RegExp("^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\\s\\\\\\x00-\\x1F\\x7F]*)?$", "u");
const schema209 = {"type":"object","description":"Item label per locale; plain text, no control characters or surrounding whitespace. A locale without a label falls back to the default locale's label, then to the target's own title or name.","propertyNames":{"$ref":"#/$defs/Locale"},"minProperties":1,"additionalProperties":{"type":"string","minLength":1,"maxLength":100,"pattern":"^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$"}};
const schema210 = {"type":"string","description":"BCP 47 language tag, e.g. en, tr, en-US.","pattern":"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"};
const pattern98 = new RegExp("^[^\\s\\x00-\\x1F\\x7F](?:[^\\x00-\\x1F\\x7F]*[^\\s\\x00-\\x1F\\x7F])?$", "u");

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
if(!pattern98.test(data0)){
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
validate77.errors = vErrors;
return errors === 0;
}
validate77.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const wrapper0 = {validate: validate76};

function validate76(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate76.evaluated;
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
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/enum",keyword:"enum",params:{allowedValues: schema206.oneOf[0].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate77(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
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
const err27 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/enum",keyword:"enum",params:{allowedValues: schema206.oneOf[1].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate77(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
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
const err45 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/enum",keyword:"enum",params:{allowedValues: schema206.oneOf[2].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate77(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
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
const err64 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/3/properties/kind/enum",keyword:"enum",params:{allowedValues: schema206.oneOf[3].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate77(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
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
const err83 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/4/properties/kind/enum",keyword:"enum",params:{allowedValues: schema206.oneOf[4].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!pattern106.test(data26)){
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
if(!(validate77(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
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
const err102 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/5/properties/kind/enum",keyword:"enum",params:{allowedValues: schema206.oneOf[5].properties.kind.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate77(data.labels, {instancePath:instancePath+"/labels",parentData:data,parentDataProperty:"labels",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate77.errors : vErrors.concat(validate77.errors);
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
validate76.errors = vErrors;
evaluated0.props = props1;
return errors === 0;
}
validate76.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate75(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cloudhal.dev/schemas/v1/menu.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate75.evaluated;
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
if(!(func1.call(schema201.properties, key0))){
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
const err11 = {instancePath:instancePath+"/schemaVersion",schemaPath:"#/$defs/SchemaVersion/enum",keyword:"enum",params:{allowedValues: schema202.enum},message:"must be equal to one of the allowed values"};
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
if(!(validate76(data5[i0], {instancePath:instancePath+"/items/" + i0,parentData:data5,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate76.errors : vErrors.concat(validate76.errors);
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
validate75.errors = vErrors;
return errors === 0;
}
validate75.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

