//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = "Prefixed, URL-safe identifier, e.g. site_01HZX8K3Q9. The prefix names the entity kind; agents and the MCP server pass these as opaque handles."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct Id(::std::string::String);
impl ::std::ops::Deref for Id {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<Id> for ::std::string::String {
    fn from(value: Id) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for Id {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 48usize {
            return Err("longer than 48 characters".into());
        }
        if value.chars().count() < 8usize {
            return Err("shorter than 8 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z]+_[A-Za-z0-9]{6,32}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z]+_[A-Za-z0-9]{6,32}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for Id {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Id {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for Id {
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
#[doc = "BCP 47 language tag, e.g. en, tr, en-US."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct Locale(::std::string::String);
impl ::std::ops::Deref for Locale {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<Locale> for ::std::string::String {
    fn from(value: Locale) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for Locale {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for Locale {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Locale {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for Locale {
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
#[doc = "Free-form string-to-string map for extensions. Keys should be namespaced (e.g. cloudhal.source)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct Metadata(pub ::std::collections::HashMap<::std::string::String, ::std::string::String>);
impl ::std::ops::Deref for Metadata {
    type Target = ::std::collections::HashMap<::std::string::String, ::std::string::String>;
    fn deref(&self) -> &::std::collections::HashMap<::std::string::String, ::std::string::String> {
        &self.0
    }
}
impl ::std::convert::From<Metadata>
    for ::std::collections::HashMap<::std::string::String, ::std::string::String>
{
    fn from(value: Metadata) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::collections::HashMap<::std::string::String, ::std::string::String>>
    for Metadata
{
    fn from(
        value: ::std::collections::HashMap<::std::string::String, ::std::string::String>,
    ) -> Self {
        Self(value)
    }
}
#[doc = "An HTTP redirect from a path the site no longer serves. Created automatically when a published entry or a term changes slug, when terms are merged or retired, and by people. Snapshotted and published like every other node (RFC-0002)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Redirect {
    #[serde(rename = "createdAt")]
    pub created_at: Timestamp,
    #[doc = "Request path to redirect: starts with '/', no query, fragment, backslash or trailing slash (root excepted). Unique per site and locale; never a path the site currently serves."]
    pub from: RedirectFrom,
    pub id: Id,
    #[doc = "The locale whose URLs `from` belongs to (RFC-0033); absent means the site's default locale. `from` is the path inside that locale, without its prefix or domain. Unique per site and locale."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub locale: ::std::option::Option<Locale>,
    #[doc = "exact: only `from` itself. prefix: `from` and every path below it; the rest of the path is appended to `to` (archives: /tag/old/page/2 → /tag/new/page/2)."]
    #[serde(rename = "match")]
    pub match_: RedirectMatch,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub metadata: ::std::option::Option<Metadata>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub note: ::std::option::Option<RedirectNote>,
    pub reason: RedirectReason,
    pub rev: Revision,
    #[serde(rename = "schemaVersion")]
    pub schema_version: SchemaVersion,
    #[serde(rename = "siteId")]
    pub site_id: Id,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub source: ::std::option::Option<RedirectSource>,
    #[doc = "301 (permanent) for slug changes, merges and retirements; 302 (temporary) only for manual redirects."]
    pub status: RedirectStatus,
    #[doc = "Target: a site path (may carry a query or fragment) or an absolute https URL. Protocol-relative ('//host') and backslash forms are rejected."]
    pub to: RedirectTo,
    #[serde(rename = "updatedAt")]
    pub updated_at: Timestamp,
}
#[doc = "Request path to redirect: starts with '/', no query, fragment, backslash or trailing slash (root excepted). Unique per site and locale; never a path the site currently serves."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct RedirectFrom(::std::string::String);
impl ::std::ops::Deref for RedirectFrom {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<RedirectFrom> for ::std::string::String {
    fn from(value: RedirectFrom) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for RedirectFrom {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 1024usize {
            return Err("longer than 1024 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err(
                "doesn't match pattern \"^/(?:[^\\s?#/\\\\]+(?:/[^\\s?#/\\\\]+)*)?$\"".into(),
            );
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for RedirectFrom {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RedirectFrom {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for RedirectFrom {
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
#[doc = "exact: only `from` itself. prefix: `from` and every path below it; the rest of the path is appended to `to` (archives: /tag/old/page/2 → /tag/new/page/2)."]
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
pub enum RedirectMatch {
    #[serde(rename = "exact")]
    Exact,
    #[serde(rename = "prefix")]
    Prefix,
}
impl ::std::fmt::Display for RedirectMatch {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Exact => f.write_str("exact"),
            Self::Prefix => f.write_str("prefix"),
        }
    }
}
impl ::std::str::FromStr for RedirectMatch {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "exact" => Ok(Self::Exact),
            "prefix" => Ok(Self::Prefix),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RedirectMatch {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RedirectMatch {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RedirectNote`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct RedirectNote(::std::string::String);
impl ::std::ops::Deref for RedirectNote {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<RedirectNote> for ::std::string::String {
    fn from(value: RedirectNote) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for RedirectNote {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 500usize {
            return Err("longer than 500 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for RedirectNote {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RedirectNote {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for RedirectNote {
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
#[doc = "`RedirectReason`"]
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
pub enum RedirectReason {
    #[serde(rename = "slug-change")]
    SlugChange,
    #[serde(rename = "merge")]
    Merge,
    #[serde(rename = "retire")]
    Retire,
    #[serde(rename = "manual")]
    Manual,
}
impl ::std::fmt::Display for RedirectReason {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SlugChange => f.write_str("slug-change"),
            Self::Merge => f.write_str("merge"),
            Self::Retire => f.write_str("retire"),
            Self::Manual => f.write_str("manual"),
        }
    }
}
impl ::std::str::FromStr for RedirectReason {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "slug-change" => Ok(Self::SlugChange),
            "merge" => Ok(Self::Merge),
            "retire" => Ok(Self::Retire),
            "manual" => Ok(Self::Manual),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RedirectReason {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RedirectReason {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "The node whose earlier URL this redirect preserves (automatic redirects). Used to collapse chains on later renames and to list a node's old URLs."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RedirectSource {
    pub id: Id,
    pub kind: RedirectSourceKind,
}
#[doc = "`RedirectSourceKind`"]
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
pub enum RedirectSourceKind {
    #[serde(rename = "page")]
    Page,
    #[serde(rename = "contentEntry")]
    ContentEntry,
    #[serde(rename = "term")]
    Term,
}
impl ::std::fmt::Display for RedirectSourceKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Page => f.write_str("page"),
            Self::ContentEntry => f.write_str("contentEntry"),
            Self::Term => f.write_str("term"),
        }
    }
}
impl ::std::str::FromStr for RedirectSourceKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "page" => Ok(Self::Page),
            "contentEntry" => Ok(Self::ContentEntry),
            "term" => Ok(Self::Term),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RedirectSourceKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RedirectSourceKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "301 (permanent) for slug changes, merges and retirements; 302 (temporary) only for manual redirects."]
#[derive(:: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct RedirectStatus(i64);
impl ::std::ops::Deref for RedirectStatus {
    type Target = i64;
    fn deref(&self) -> &i64 {
        &self.0
    }
}
impl ::std::convert::From<RedirectStatus> for i64 {
    fn from(value: RedirectStatus) -> Self {
        value.0
    }
}
impl ::std::convert::TryFrom<i64> for RedirectStatus {
    type Error = self::error::ConversionError;
    fn try_from(value: i64) -> ::std::result::Result<Self, self::error::ConversionError> {
        if ![301_i64, 302_i64].contains(&value) {
            Err("invalid value".into())
        } else {
            Ok(Self(value))
        }
    }
}
impl<'de> ::serde::Deserialize<'de> for RedirectStatus {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        Self::try_from(<i64>::deserialize(deserializer)?)
            .map_err(|e| <D::Error as ::serde::de::Error>::custom(e.to_string()))
    }
}
#[doc = "Target: a site path (may carry a query or fragment) or an absolute https URL. Protocol-relative ('//host') and backslash forms are rejected."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct RedirectTo(::std::string::String);
impl ::std::ops::Deref for RedirectTo {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<RedirectTo> for ::std::string::String {
    fn from(value: RedirectTo) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for RedirectTo {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2048usize {
            return Err("longer than 2048 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new(
                    "^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$",
                )
                .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^(?:/(?![/\\\\])[^\\s\\\\]*|https://[^\\s\\\\/?#]+(?:[/?#][^\\s\\\\]*)?)$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for RedirectTo {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RedirectTo {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for RedirectTo {
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
#[doc = "Monotonic per-node revision used for optimistic locking (compare-and-swap on write)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct Revision(pub u64);
impl ::std::ops::Deref for Revision {
    type Target = u64;
    fn deref(&self) -> &u64 {
        &self.0
    }
}
impl ::std::convert::From<Revision> for u64 {
    fn from(value: Revision) -> Self {
        value.0
    }
}
impl ::std::convert::From<u64> for Revision {
    fn from(value: u64) -> Self {
        Self(value)
    }
}
impl ::std::fmt::Display for Revision {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
impl ::std::str::FromStr for Revision {
    type Err = <u64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for Revision {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for Revision {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
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
