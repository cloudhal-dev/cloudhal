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
#[doc = "Top-level ownership boundary. A project belongs to one owner (human or organisation) and groups one or more sites. In Cloud it maps to a tenant."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Project {
    #[serde(rename = "createdAt")]
    pub created_at: Timestamp,
    pub id: Id,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub metadata: ::std::option::Option<Metadata>,
    pub name: ProjectName,
    #[serde(rename = "ownerId")]
    pub owner_id: Id,
    pub rev: Revision,
    #[serde(rename = "schemaVersion")]
    pub schema_version: SchemaVersion,
    #[serde(rename = "siteIds")]
    pub site_ids: ::std::vec::Vec<Id>,
    pub slug: Slug,
    #[serde(rename = "updatedAt")]
    pub updated_at: Timestamp,
}
#[doc = "`ProjectName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ProjectName(::std::string::String);
impl ::std::ops::Deref for ProjectName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ProjectName> for ::std::string::String {
    fn from(value: ProjectName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ProjectName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 200usize {
            return Err("longer than 200 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ProjectName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ProjectName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ProjectName {
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
#[doc = "Lower-case URL segment."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct Slug(::std::string::String);
impl ::std::ops::Deref for Slug {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<Slug> for ::std::string::String {
    fn from(value: Slug) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for Slug {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 128usize {
            return Err("longer than 128 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z0-9]+(?:-[a-z0-9]+)*$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z0-9]+(?:-[a-z0-9]+)*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for Slug {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Slug {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for Slug {
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
