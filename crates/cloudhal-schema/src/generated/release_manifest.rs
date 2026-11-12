//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = "`BindingName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct BindingName(::std::string::String);
impl ::std::ops::Deref for BindingName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BindingName> for ::std::string::String {
    fn from(value: BindingName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for BindingName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[A-Z][A-Z0-9_]*(_\\*)?$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[A-Z][A-Z0-9_]*(_\\*)?$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for BindingName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BindingName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for BindingName {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`BindingTemplate`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BindingTemplate {
    pub bindings: ::std::vec::Vec<BindingTemplateBindingsItem>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub cache: ::std::option::Option<bool>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub cron: ::std::option::Option<BindingTemplateCron>,
    pub secrets: ::std::vec::Vec<SecretName>,
    pub vars: ::std::vec::Vec<BindingName>,
}
#[doc = "`BindingTemplateBindingsItem`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BindingTemplateBindingsItem {
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub aliases: ::std::vec::Vec<BindingName>,
    pub name: BindingName,
    pub required: bool,
    #[serde(rename = "type")]
    pub type_: BindingTemplateBindingsItemType,
}
#[doc = "`BindingTemplateBindingsItemType`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BindingTemplateBindingsItemType {
    #[serde(rename = "d1")]
    D1,
    #[serde(rename = "r2_bucket")]
    R2Bucket,
    #[serde(rename = "assets")]
    Assets,
    #[serde(rename = "service")]
    Service,
    #[serde(rename = "durable_object_namespace")]
    DurableObjectNamespace,
    #[serde(rename = "analytics_engine")]
    AnalyticsEngine,
    #[serde(rename = "analytics_sql")]
    AnalyticsSql,
    #[serde(rename = "ratelimit")]
    Ratelimit,
    #[serde(rename = "ai_search")]
    AiSearch,
    #[serde(rename = "send_email")]
    SendEmail,
    #[serde(rename = "ai")]
    Ai,
    #[serde(rename = "browser")]
    Browser,
}
impl ::std::fmt::Display for BindingTemplateBindingsItemType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::D1 => f.write_str("d1"),
            Self::R2Bucket => f.write_str("r2_bucket"),
            Self::Assets => f.write_str("assets"),
            Self::Service => f.write_str("service"),
            Self::DurableObjectNamespace => f.write_str("durable_object_namespace"),
            Self::AnalyticsEngine => f.write_str("analytics_engine"),
            Self::AnalyticsSql => f.write_str("analytics_sql"),
            Self::Ratelimit => f.write_str("ratelimit"),
            Self::AiSearch => f.write_str("ai_search"),
            Self::SendEmail => f.write_str("send_email"),
            Self::Ai => f.write_str("ai"),
            Self::Browser => f.write_str("browser"),
        }
    }
}
impl ::std::str::FromStr for BindingTemplateBindingsItemType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "d1" => Ok(Self::D1),
            "r2_bucket" => Ok(Self::R2Bucket),
            "assets" => Ok(Self::Assets),
            "service" => Ok(Self::Service),
            "durable_object_namespace" => Ok(Self::DurableObjectNamespace),
            "analytics_engine" => Ok(Self::AnalyticsEngine),
            "analytics_sql" => Ok(Self::AnalyticsSql),
            "ratelimit" => Ok(Self::Ratelimit),
            "ai_search" => Ok(Self::AiSearch),
            "send_email" => Ok(Self::SendEmail),
            "ai" => Ok(Self::Ai),
            "browser" => Ok(Self::Browser),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BindingTemplateBindingsItemType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BindingTemplateBindingsItemType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`BindingTemplateCron`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct BindingTemplateCron(::std::string::String);
impl ::std::ops::Deref for BindingTemplateCron {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BindingTemplateCron> for ::std::string::String {
    fn from(value: BindingTemplateCron) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for BindingTemplateCron {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[0-9*/,\\- ]+$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[0-9*/,\\- ]+$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for BindingTemplateCron {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BindingTemplateCron {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for BindingTemplateCron {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`Capability`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum Capability {
    #[serde(rename = "account")]
    Account,
    #[serde(rename = "workers")]
    Workers,
    #[serde(rename = "d1")]
    D1,
    #[serde(rename = "r2")]
    R2,
    #[serde(rename = "analytics")]
    Analytics,
    #[serde(rename = "domains")]
    Domains,
}
impl ::std::fmt::Display for Capability {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Account => f.write_str("account"),
            Self::Workers => f.write_str("workers"),
            Self::D1 => f.write_str("d1"),
            Self::R2 => f.write_str("r2"),
            Self::Analytics => f.write_str("analytics"),
            Self::Domains => f.write_str("domains"),
        }
    }
}
impl ::std::str::FromStr for Capability {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "account" => Ok(Self::Account),
            "workers" => Ok(Self::Workers),
            "d1" => Ok(Self::D1),
            "r2" => Ok(Self::R2),
            "analytics" => Ok(Self::Analytics),
            "domains" => Ok(Self::Domains),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for Capability {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Capability {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CloudhalVersion`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CloudhalVersion(::std::string::String);
impl ::std::ops::Deref for CloudhalVersion {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CloudhalVersion> for ::std::string::String {
    fn from(value: CloudhalVersion) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CloudhalVersion {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new(
                    "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$",
                )
                .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CloudhalVersion {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CloudhalVersion {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CloudhalVersion {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`MigrationName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct MigrationName(::std::string::String);
impl ::std::ops::Deref for MigrationName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<MigrationName> for ::std::string::String {
    fn from(value: MigrationName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for MigrationName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[0-9]{4}_[a-z0-9_]+$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[0-9]{4}_[a-z0-9_]+$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for MigrationName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for MigrationName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for MigrationName {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "cloudhal.release-manifest@1 (RFC-0046): the manifest of one Cloudhal release bundle, published as the release asset manifest.json next to the gzip tarball cloudhal-release-<version>.tar.gz. A project release is signed through release-statement.json, which pins this file's SHA-256 and size (signing.signature = release-statement.sig); the legacy form manifest.sig, a raw 64-byte Ed25519 signature over these exact bytes, is for development keys only. It describes every built Worker module and static asset by size and SHA-256, the binding templates, feature levels, migration range and rollback facts a remote deployer needs to install, update or refuse a version without running a build. Portable on purpose: it references common only for SchemaVersion and Timestamp; every other definition is local."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifest {
    #[serde(rename = "bindingTemplates")]
    pub binding_templates: ReleaseManifestBindingTemplates,
    pub channel: ReleaseManifestChannel,
    pub commit: ReleaseManifestCommit,
    pub contracts: ReleaseManifestContracts,
    #[serde(rename = "createdAt")]
    pub created_at: Timestamp,
    #[serde(rename = "durableObjects")]
    pub durable_objects: ReleaseManifestDurableObjects,
    pub features: ReleaseManifestFeatures,
    pub format: ReleaseManifestFormat,
    pub levels: ReleaseManifestLevels,
    pub migrations: ReleaseManifestMigrations,
    #[serde(rename = "optionalCapabilities")]
    pub optional_capabilities: ::std::vec::Vec<Capability>,
    #[serde(rename = "optionalScopes")]
    pub optional_scopes: ::std::vec::Vec<ScopeId>,
    #[serde(rename = "planVersion")]
    pub plan_version: ::std::num::NonZeroU64,
    #[serde(rename = "requiredCapabilities")]
    pub required_capabilities: ::std::vec::Vec<Capability>,
    #[serde(rename = "requiredScopes")]
    pub required_scopes: ::std::vec::Vec<ScopeId>,
    pub runtime: ReleaseManifestRuntime,
    #[serde(rename = "schemaVersion")]
    pub schema_version: SchemaVersion,
    #[serde(rename = "securityRelease")]
    pub security_release: bool,
    pub signing: ReleaseManifestSigning,
    pub skills: ::std::vec::Vec<ReleaseManifestSkillsItem>,
    pub starter: ReleaseManifestStarter,
    pub theme: ReleaseManifestTheme,
    pub toolchain:
        ::std::collections::HashMap<::std::string::String, ReleaseManifestToolchainValue>,
    pub version: CloudhalVersion,
    pub workers: ReleaseManifestWorkers,
}
#[doc = "`ReleaseManifestBindingTemplates`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestBindingTemplates {
    pub admin: BindingTemplate,
    pub site: BindingTemplate,
}
#[doc = "`ReleaseManifestChannel`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ReleaseManifestChannel {
    #[serde(rename = "stable")]
    Stable,
    #[serde(rename = "next")]
    Next,
}
impl ::std::fmt::Display for ReleaseManifestChannel {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Stable => f.write_str("stable"),
            Self::Next => f.write_str("next"),
        }
    }
}
impl ::std::str::FromStr for ReleaseManifestChannel {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "stable" => Ok(Self::Stable),
            "next" => Ok(Self::Next),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestChannel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestChannel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReleaseManifestCommit`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestCommit(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestCommit {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestCommit> for ::std::string::String {
    fn from(value: ReleaseManifestCommit) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestCommit {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[0-9a-f]{40}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[0-9a-f]{40}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestCommit {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestCommit {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestCommit {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestContracts`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestContracts {
    #[serde(rename = "schemaVersion")]
    pub schema_version: ReleaseManifestContractsSchemaVersion,
}
#[doc = "`ReleaseManifestContractsSchemaVersion`"]
#[derive(:: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct ReleaseManifestContractsSchemaVersion(i64);
impl ::std::ops::Deref for ReleaseManifestContractsSchemaVersion {
    type Target = i64;
    fn deref(&self) -> &i64 {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestContractsSchemaVersion> for i64 {
    fn from(value: ReleaseManifestContractsSchemaVersion) -> Self {
        value.0
    }
}
impl ::std::convert::TryFrom<i64> for ReleaseManifestContractsSchemaVersion {
    type Error = self::error::ConversionError;
    fn try_from(value: i64) -> ::std::result::Result<Self, self::error::ConversionError> {
        if ![1_i64].contains(&value) {
            Err("invalid value".into())
        } else {
            Ok(Self(value))
        }
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestContractsSchemaVersion {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        Self::try_from(<i64>::deserialize(deserializer)?)
            .map_err(|e| <D::Error as ::serde::de::Error>::custom(e.to_string()))
    }
}
#[doc = "`ReleaseManifestDurableObjects`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestDurableObjects {
    pub bindings: ::std::vec::Vec<ReleaseManifestDurableObjectsBindingsItem>,
    #[serde(rename = "lifecycleChange")]
    pub lifecycle_change: bool,
}
#[doc = "`ReleaseManifestDurableObjectsBindingsItem`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestDurableObjectsBindingsItem {
    #[serde(rename = "className")]
    pub class_name: ReleaseManifestDurableObjectsBindingsItemClassName,
    pub migration: ReleaseManifestDurableObjectsBindingsItemMigration,
    pub name: BindingName,
}
#[doc = "`ReleaseManifestDurableObjectsBindingsItemClassName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestDurableObjectsBindingsItemClassName(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestDurableObjectsBindingsItemClassName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestDurableObjectsBindingsItemClassName>
    for ::std::string::String
{
    fn from(value: ReleaseManifestDurableObjectsBindingsItemClassName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestDurableObjectsBindingsItemClassName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[A-Z][A-Za-z0-9]*$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[A-Z][A-Za-z0-9]*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestDurableObjectsBindingsItemClassName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for ReleaseManifestDurableObjectsBindingsItemClassName
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestDurableObjectsBindingsItemClassName {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestDurableObjectsBindingsItemMigration`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestDurableObjectsBindingsItemMigration(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestDurableObjectsBindingsItemMigration {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestDurableObjectsBindingsItemMigration>
    for ::std::string::String
{
    fn from(value: ReleaseManifestDurableObjectsBindingsItemMigration) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestDurableObjectsBindingsItemMigration {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^v[1-9][0-9]*$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^v[1-9][0-9]*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestDurableObjectsBindingsItemMigration {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for ReleaseManifestDurableObjectsBindingsItemMigration
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestDurableObjectsBindingsItemMigration {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestFeatures`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
pub struct ReleaseManifestFeatures {
    #[serde(rename = "adminSitesAcceptsSiteId")]
    pub admin_sites_accepts_site_id: bool,
    #[serde(rename = "healthReportsVersion")]
    pub health_reports_version: bool,
    #[serde(rename = "mediaTransformVar")]
    pub media_transform_var: bool,
    #[serde(flatten)]
    pub extra: ::std::collections::HashMap<::std::string::String, bool>,
}
#[doc = "`ReleaseManifestFormat`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ReleaseManifestFormat {
    #[serde(rename = "cloudhal.release-manifest@1")]
    CloudhalReleaseManifest1,
}
impl ::std::fmt::Display for ReleaseManifestFormat {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CloudhalReleaseManifest1 => f.write_str("cloudhal.release-manifest@1"),
        }
    }
}
impl ::std::str::FromStr for ReleaseManifestFormat {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "cloudhal.release-manifest@1" => Ok(Self::CloudhalReleaseManifest1),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestFormat {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestFormat {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReleaseManifestLevels`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestLevels {
    pub gates: u64,
    pub schedules: u64,
}
#[doc = "`ReleaseManifestMigrations`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestMigrations {
    #[serde(rename = "compatibleWithPrevious")]
    pub compatible_with_previous: bool,
    pub count: ::std::num::NonZeroU64,
    pub first: MigrationName,
    pub last: MigrationName,
    pub names: ::std::vec::Vec<MigrationName>,
}
#[doc = "`ReleaseManifestRuntime`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestRuntime {
    #[serde(rename = "compatibilityDate")]
    pub compatibility_date: ReleaseManifestRuntimeCompatibilityDate,
    #[serde(rename = "compatibilityFlags")]
    pub compatibility_flags: ::std::vec::Vec<ReleaseManifestRuntimeCompatibilityFlagsItem>,
}
#[doc = "`ReleaseManifestRuntimeCompatibilityDate`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestRuntimeCompatibilityDate(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestRuntimeCompatibilityDate {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestRuntimeCompatibilityDate> for ::std::string::String {
    fn from(value: ReleaseManifestRuntimeCompatibilityDate) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestRuntimeCompatibilityDate {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[0-9]{4}-[0-9]{2}-[0-9]{2}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[0-9]{4}-[0-9]{2}-[0-9]{2}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestRuntimeCompatibilityDate {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestRuntimeCompatibilityDate {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestRuntimeCompatibilityDate {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestRuntimeCompatibilityFlagsItem`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestRuntimeCompatibilityFlagsItem(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestRuntimeCompatibilityFlagsItem {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestRuntimeCompatibilityFlagsItem> for ::std::string::String {
    fn from(value: ReleaseManifestRuntimeCompatibilityFlagsItem) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestRuntimeCompatibilityFlagsItem {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[a-z0-9_]+$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z0-9_]+$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestRuntimeCompatibilityFlagsItem {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for ReleaseManifestRuntimeCompatibilityFlagsItem
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestRuntimeCompatibilityFlagsItem {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestSigning`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestSigning {
    pub algorithm: ReleaseManifestSigningAlgorithm,
    #[serde(rename = "keyId")]
    pub key_id: ReleaseManifestSigningKeyId,
    pub signature: ReleaseManifestSigningSignature,
}
#[doc = "`ReleaseManifestSigningAlgorithm`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ReleaseManifestSigningAlgorithm {
    Ed25519,
}
impl ::std::fmt::Display for ReleaseManifestSigningAlgorithm {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Ed25519 => f.write_str("Ed25519"),
        }
    }
}
impl ::std::str::FromStr for ReleaseManifestSigningAlgorithm {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "Ed25519" => Ok(Self::Ed25519),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestSigningAlgorithm {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestSigningAlgorithm {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReleaseManifestSigningKeyId`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestSigningKeyId(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestSigningKeyId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestSigningKeyId> for ::std::string::String {
    fn from(value: ReleaseManifestSigningKeyId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestSigningKeyId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z0-9][a-z0-9-]{2,63}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z0-9][a-z0-9-]{2,63}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestSigningKeyId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestSigningKeyId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestSigningKeyId {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestSigningSignature`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ReleaseManifestSigningSignature {
    #[serde(rename = "manifest.sig")]
    ManifestSig,
    #[serde(rename = "release-statement.sig")]
    ReleaseStatementSig,
}
impl ::std::fmt::Display for ReleaseManifestSigningSignature {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ManifestSig => f.write_str("manifest.sig"),
            Self::ReleaseStatementSig => f.write_str("release-statement.sig"),
        }
    }
}
impl ::std::str::FromStr for ReleaseManifestSigningSignature {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "manifest.sig" => Ok(Self::ManifestSig),
            "release-statement.sig" => Ok(Self::ReleaseStatementSig),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestSigningSignature {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestSigningSignature {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReleaseManifestSkillsItem`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestSkillsItem {
    pub name: ReleaseManifestSkillsItemName,
    pub sha256: Sha256Hex,
}
#[doc = "`ReleaseManifestSkillsItemName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestSkillsItemName(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestSkillsItemName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestSkillsItemName> for ::std::string::String {
    fn from(value: ReleaseManifestSkillsItemName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestSkillsItemName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[a-z][a-z0-9-]{0,63}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z][a-z0-9-]{0,63}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestSkillsItemName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestSkillsItemName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestSkillsItemName {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestStarter`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum ReleaseManifestStarter {
    #[serde(rename = "admin-api")]
    AdminApi,
    #[serde(rename = "bundle")]
    Bundle {
        bytes: ::std::num::NonZeroU64,
        path: ReleaseManifestStarterPath,
        sha256: Sha256Hex,
        #[serde(rename = "siteId")]
        site_id: SiteId,
    },
}
#[doc = "`ReleaseManifestStarterPath`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestStarterPath(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestStarterPath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestStarterPath> for ::std::string::String {
    fn from(value: ReleaseManifestStarterPath) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestStarterPath {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^starter/[A-Za-z0-9._-]+$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^starter/[A-Za-z0-9._-]+$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestStarterPath {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestStarterPath {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestStarterPath {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestTheme`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestTheme {
    #[serde(rename = "blockTypes")]
    pub block_types: ::std::vec::Vec<::std::string::String>,
    #[serde(rename = "designSha256")]
    pub design_sha256: Sha256Hex,
    pub name: ReleaseManifestThemeName,
    #[serde(rename = "settingsSha256")]
    pub settings_sha256: Sha256Hex,
    pub version: ReleaseManifestThemeVersion,
}
#[doc = "`ReleaseManifestThemeName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestThemeName(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestThemeName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestThemeName> for ::std::string::String {
    fn from(value: ReleaseManifestThemeName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestThemeName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[a-z][a-z0-9-]{0,63}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z][a-z0-9-]{0,63}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestThemeName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestThemeName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestThemeName {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestThemeVersion`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestThemeVersion(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestThemeVersion {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestThemeVersion> for ::std::string::String {
    fn from(value: ReleaseManifestThemeVersion) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestThemeVersion {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 64usize {
            return Err("longer than 64 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestThemeVersion {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestThemeVersion {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestThemeVersion {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestToolchainValue`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseManifestToolchainValue(::std::string::String);
impl ::std::ops::Deref for ReleaseManifestToolchainValue {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseManifestToolchainValue> for ::std::string::String {
    fn from(value: ReleaseManifestToolchainValue) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseManifestToolchainValue {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 64usize {
            return Err("longer than 64 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseManifestToolchainValue {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseManifestToolchainValue {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseManifestToolchainValue {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`ReleaseManifestWorkers`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseManifestWorkers {
    pub admin: WorkerArtifact,
    pub site: WorkerArtifact,
}
#[doc = "Version of this contract. Readers reject unknown versions; migrations move documents forward one version at a time."]
#[derive(:: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct SchemaVersion(i64);
impl ::std::ops::Deref for SchemaVersion {
    type Target = i64;
    fn deref(&self) -> &i64 {
        &self.0
    }
}
impl ::std::convert::From<SchemaVersion> for i64 {
    fn from(value: SchemaVersion) -> Self {
        value.0
    }
}
impl ::std::convert::TryFrom<i64> for SchemaVersion {
    type Error = self::error::ConversionError;
    fn try_from(value: i64) -> ::std::result::Result<Self, self::error::ConversionError> {
        if ![1_i64].contains(&value) {
            Err("invalid value".into())
        } else {
            Ok(Self(value))
        }
    }
}
impl<'de> ::serde::Deserialize<'de> for SchemaVersion {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        Self::try_from(<i64>::deserialize(deserializer)?)
            .map_err(|e| <D::Error as ::serde::de::Error>::custom(e.to_string()))
    }
}
#[doc = "`ScopeId`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ScopeId(::std::string::String);
impl ::std::ops::Deref for ScopeId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ScopeId> for ::std::string::String {
    fn from(value: ScopeId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ScopeId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z0-9-]+(\\.[a-z0-9-]+)+$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z0-9-]+(\\.[a-z0-9-]+)+$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ScopeId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ScopeId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ScopeId {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`SecretName`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SecretName {
    #[serde(rename = "BETTER_AUTH_SECRET")]
    BetterAuthSecret,
    #[serde(rename = "MCP_STATE_KEY")]
    McpStateKey,
    #[serde(rename = "CLOUDHAL_PREVIEW_SECRET")]
    CloudhalPreviewSecret,
    #[serde(rename = "CLOUDHAL_PURGE_TOKEN")]
    CloudhalPurgeToken,
    #[serde(rename = "CLOUDHAL_DEPLOY_TOKEN")]
    CloudhalDeployToken,
    #[serde(rename = "CLOUDHAL_SETUP_TOKEN")]
    CloudhalSetupToken,
    #[serde(rename = "CLOUDHAL_COMMENTS_KEY")]
    CloudhalCommentsKey,
}
impl ::std::fmt::Display for SecretName {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::BetterAuthSecret => f.write_str("BETTER_AUTH_SECRET"),
            Self::McpStateKey => f.write_str("MCP_STATE_KEY"),
            Self::CloudhalPreviewSecret => f.write_str("CLOUDHAL_PREVIEW_SECRET"),
            Self::CloudhalPurgeToken => f.write_str("CLOUDHAL_PURGE_TOKEN"),
            Self::CloudhalDeployToken => f.write_str("CLOUDHAL_DEPLOY_TOKEN"),
            Self::CloudhalSetupToken => f.write_str("CLOUDHAL_SETUP_TOKEN"),
            Self::CloudhalCommentsKey => f.write_str("CLOUDHAL_COMMENTS_KEY"),
        }
    }
}
impl ::std::str::FromStr for SecretName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "BETTER_AUTH_SECRET" => Ok(Self::BetterAuthSecret),
            "MCP_STATE_KEY" => Ok(Self::McpStateKey),
            "CLOUDHAL_PREVIEW_SECRET" => Ok(Self::CloudhalPreviewSecret),
            "CLOUDHAL_PURGE_TOKEN" => Ok(Self::CloudhalPurgeToken),
            "CLOUDHAL_DEPLOY_TOKEN" => Ok(Self::CloudhalDeployToken),
            "CLOUDHAL_SETUP_TOKEN" => Ok(Self::CloudhalSetupToken),
            "CLOUDHAL_COMMENTS_KEY" => Ok(Self::CloudhalCommentsKey),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SecretName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SecretName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`Sha256Hex`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct Sha256Hex(::std::string::String);
impl ::std::ops::Deref for Sha256Hex {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<Sha256Hex> for ::std::string::String {
    fn from(value: Sha256Hex) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for Sha256Hex {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[0-9a-f]{64}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[0-9a-f]{64}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for Sha256Hex {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Sha256Hex {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for Sha256Hex {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`SiteId`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SiteId(::std::string::String);
impl ::std::ops::Deref for SiteId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SiteId> for ::std::string::String {
    fn from(value: SiteId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SiteId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^site_[A-Za-z0-9]{6,32}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^site_[A-Za-z0-9]{6,32}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SiteId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SiteId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SiteId {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "RFC 3339 / ISO 8601 instant in UTC."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct Timestamp(pub ::chrono::DateTime<::chrono::offset::Utc>);
impl ::std::ops::Deref for Timestamp {
    type Target = ::chrono::DateTime<::chrono::offset::Utc>;
    fn deref(&self) -> &::chrono::DateTime<::chrono::offset::Utc> {
        &self.0
    }
}
impl ::std::convert::From<Timestamp> for ::chrono::DateTime<::chrono::offset::Utc> {
    fn from(value: Timestamp) -> Self {
        value.0
    }
}
impl ::std::convert::From<::chrono::DateTime<::chrono::offset::Utc>> for Timestamp {
    fn from(value: ::chrono::DateTime<::chrono::offset::Utc>) -> Self {
        Self(value)
    }
}
impl ::std::fmt::Display for Timestamp {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
impl ::std::str::FromStr for Timestamp {
    type Err = <::chrono::DateTime<::chrono::offset::Utc> as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for Timestamp {
    type Error = <::chrono::DateTime<::chrono::offset::Utc> as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for Timestamp {
    type Error = <::chrono::DateTime<::chrono::offset::Utc> as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
#[doc = "`WorkerArtifact`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct WorkerArtifact {
    pub assets: WorkerArtifactAssets,
    #[serde(
        rename = "bindingTemplate",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub binding_template: ::std::option::Option<WorkerArtifactBindingTemplate>,
    #[serde(rename = "mainModule")]
    pub main_module: WorkerArtifactMainModule,
    pub modules: ::std::vec::Vec<WorkerArtifactModulesItem>,
}
#[doc = "`WorkerArtifactAssets`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct WorkerArtifactAssets {
    pub bytes: u64,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub config: ::std::option::Option<WorkerArtifactAssetsConfig>,
    pub count: i64,
    pub files: ::std::vec::Vec<WorkerArtifactAssetsFilesItem>,
    pub headers: WorkerArtifactAssetsHeaders,
}
#[doc = "`WorkerArtifactAssetsConfig`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct WorkerArtifactAssetsConfig {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub not_found_handling: ::std::option::Option<WorkerArtifactAssetsConfigNotFoundHandling>,
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub run_worker_first: ::std::vec::Vec<WorkerArtifactAssetsConfigRunWorkerFirstItem>,
}
#[doc = "`WorkerArtifactAssetsConfigNotFoundHandling`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum WorkerArtifactAssetsConfigNotFoundHandling {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "404-page")]
    X404Page,
    #[serde(rename = "single-page-application")]
    SinglePageApplication,
}
impl ::std::fmt::Display for WorkerArtifactAssetsConfigNotFoundHandling {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::None => f.write_str("none"),
            Self::X404Page => f.write_str("404-page"),
            Self::SinglePageApplication => f.write_str("single-page-application"),
        }
    }
}
impl ::std::str::FromStr for WorkerArtifactAssetsConfigNotFoundHandling {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "none" => Ok(Self::None),
            "404-page" => Ok(Self::X404Page),
            "single-page-application" => Ok(Self::SinglePageApplication),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactAssetsConfigNotFoundHandling {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactAssetsConfigNotFoundHandling {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`WorkerArtifactAssetsConfigRunWorkerFirstItem`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct WorkerArtifactAssetsConfigRunWorkerFirstItem(::std::string::String);
impl ::std::ops::Deref for WorkerArtifactAssetsConfigRunWorkerFirstItem {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<WorkerArtifactAssetsConfigRunWorkerFirstItem> for ::std::string::String {
    fn from(value: WorkerArtifactAssetsConfigRunWorkerFirstItem) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for WorkerArtifactAssetsConfigRunWorkerFirstItem {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^/").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^/\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactAssetsConfigRunWorkerFirstItem {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for WorkerArtifactAssetsConfigRunWorkerFirstItem
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for WorkerArtifactAssetsConfigRunWorkerFirstItem {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`WorkerArtifactAssetsFilesItem`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct WorkerArtifactAssetsFilesItem {
    #[serde(rename = "assetHash")]
    pub asset_hash: WorkerArtifactAssetsFilesItemAssetHash,
    pub bytes: i64,
    #[serde(rename = "contentType")]
    pub content_type: WorkerArtifactAssetsFilesItemContentType,
    pub path: WorkerArtifactAssetsFilesItemPath,
    pub sha256: Sha256Hex,
}
#[doc = "`WorkerArtifactAssetsFilesItemAssetHash`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct WorkerArtifactAssetsFilesItemAssetHash(::std::string::String);
impl ::std::ops::Deref for WorkerArtifactAssetsFilesItemAssetHash {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<WorkerArtifactAssetsFilesItemAssetHash> for ::std::string::String {
    fn from(value: WorkerArtifactAssetsFilesItemAssetHash) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for WorkerArtifactAssetsFilesItemAssetHash {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[0-9a-f]{32}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[0-9a-f]{32}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactAssetsFilesItemAssetHash {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactAssetsFilesItemAssetHash {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for WorkerArtifactAssetsFilesItemAssetHash {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`WorkerArtifactAssetsFilesItemContentType`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct WorkerArtifactAssetsFilesItemContentType(::std::string::String);
impl ::std::ops::Deref for WorkerArtifactAssetsFilesItemContentType {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<WorkerArtifactAssetsFilesItemContentType> for ::std::string::String {
    fn from(value: WorkerArtifactAssetsFilesItemContentType) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for WorkerArtifactAssetsFilesItemContentType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 128usize {
            return Err("longer than 128 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactAssetsFilesItemContentType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactAssetsFilesItemContentType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for WorkerArtifactAssetsFilesItemContentType {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`WorkerArtifactAssetsFilesItemPath`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct WorkerArtifactAssetsFilesItemPath(::std::string::String);
impl ::std::ops::Deref for WorkerArtifactAssetsFilesItemPath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<WorkerArtifactAssetsFilesItemPath> for ::std::string::String {
    fn from(value: WorkerArtifactAssetsFilesItemPath) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for WorkerArtifactAssetsFilesItemPath {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 1024usize {
            return Err("longer than 1024 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^/[^\\s]*$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^/[^\\s]*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactAssetsFilesItemPath {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactAssetsFilesItemPath {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for WorkerArtifactAssetsFilesItemPath {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`WorkerArtifactAssetsHeaders`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct WorkerArtifactAssetsHeaders(::std::string::String);
impl ::std::ops::Deref for WorkerArtifactAssetsHeaders {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<WorkerArtifactAssetsHeaders> for ::std::string::String {
    fn from(value: WorkerArtifactAssetsHeaders) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for WorkerArtifactAssetsHeaders {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 100000usize {
            return Err("longer than 100000 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactAssetsHeaders {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactAssetsHeaders {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for WorkerArtifactAssetsHeaders {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`WorkerArtifactBindingTemplate`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum WorkerArtifactBindingTemplate {
    #[serde(rename = "site")]
    Site,
    #[serde(rename = "admin")]
    Admin,
}
impl ::std::fmt::Display for WorkerArtifactBindingTemplate {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Site => f.write_str("site"),
            Self::Admin => f.write_str("admin"),
        }
    }
}
impl ::std::str::FromStr for WorkerArtifactBindingTemplate {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "site" => Ok(Self::Site),
            "admin" => Ok(Self::Admin),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactBindingTemplate {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactBindingTemplate {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`WorkerArtifactMainModule`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct WorkerArtifactMainModule(::std::string::String);
impl ::std::ops::Deref for WorkerArtifactMainModule {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<WorkerArtifactMainModule> for ::std::string::String {
    fn from(value: WorkerArtifactMainModule) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for WorkerArtifactMainModule {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[A-Za-z0-9._/-]+$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[A-Za-z0-9._/-]+$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactMainModule {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactMainModule {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for WorkerArtifactMainModule {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`WorkerArtifactModulesItem`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct WorkerArtifactModulesItem {
    pub bytes: ::std::num::NonZeroU64,
    pub path: WorkerArtifactModulesItemPath,
    pub sha256: Sha256Hex,
    #[serde(rename = "type")]
    pub type_: WorkerArtifactModulesItemType,
}
#[doc = "`WorkerArtifactModulesItemPath`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct WorkerArtifactModulesItemPath(::std::string::String);
impl ::std::ops::Deref for WorkerArtifactModulesItemPath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<WorkerArtifactModulesItemPath> for ::std::string::String {
    fn from(value: WorkerArtifactModulesItemPath) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for WorkerArtifactModulesItemPath {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactModulesItemPath {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactModulesItemPath {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for WorkerArtifactModulesItemPath {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`WorkerArtifactModulesItemType`"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum WorkerArtifactModulesItemType {
    #[serde(rename = "esm")]
    Esm,
    #[serde(rename = "cjs")]
    Cjs,
    #[serde(rename = "wasm")]
    Wasm,
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "data")]
    Data,
}
impl ::std::fmt::Display for WorkerArtifactModulesItemType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Esm => f.write_str("esm"),
            Self::Cjs => f.write_str("cjs"),
            Self::Wasm => f.write_str("wasm"),
            Self::Text => f.write_str("text"),
            Self::Data => f.write_str("data"),
        }
    }
}
impl ::std::str::FromStr for WorkerArtifactModulesItemType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "esm" => Ok(Self::Esm),
            "cjs" => Ok(Self::Cjs),
            "wasm" => Ok(Self::Wasm),
            "text" => Ok(Self::Text),
            "data" => Ok(Self::Data),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for WorkerArtifactModulesItemType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkerArtifactModulesItemType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = " Error types."]
pub mod error {
    #[doc = r" Error from a `TryFrom` or `FromStr` implementation."]
    pub struct ConversionError(::std::borrow::Cow<'static, str>);
    impl ::std::error::Error for ConversionError {}
    impl ::std::fmt::Display for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Display::fmt(&self.0, f)
        }
    }
    impl ::std::fmt::Debug for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Debug::fmt(&self.0, f)
        }
    }
    impl From<&'static str> for ConversionError {
        fn from(value: &'static str) -> Self {
            Self(value.into())
        }
    }
    impl From<String> for ConversionError {
        fn from(value: String) -> Self {
            Self(value.into())
        }
    }
}
