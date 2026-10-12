//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = "`Actor`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Actor {
    pub id: Id,
    pub kind: ActorKind,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub name: ::std::option::Option<ActorName>,
}
#[doc = "Who performed an action. Humans and agents share one actor model so the policy engine treats them uniformly."]
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
pub enum ActorKind {
    #[serde(rename = "human")]
    Human,
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "system")]
    System,
}
impl ::std::fmt::Display for ActorKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Human => f.write_str("human"),
            Self::Agent => f.write_str("agent"),
            Self::System => f.write_str("system"),
        }
    }
}
impl ::std::str::FromStr for ActorKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "human" => Ok(Self::Human),
            "agent" => Ok(Self::Agent),
            "system" => Ok(Self::System),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ActorKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ActorKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ActorName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ActorName(::std::string::String);
impl ::std::ops::Deref for ActorName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ActorName> for ::std::string::String {
    fn from(value: ActorName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ActorName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 200usize {
            return Err("longer than 200 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ActorName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ActorName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ActorName {
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
#[doc = "A wall-clock date and time without an offset, to the minute (YYYY-MM-DDTHH:mm), as a person entered it; always paired with a TimeZone (RFC-0008)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct LocalDateTime(::std::string::String);
impl ::std::ops::Deref for LocalDateTime {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<LocalDateTime> for ::std::string::String {
    fn from(value: LocalDateTime) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for LocalDateTime {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(
            || {
                :: regress :: Regex :: new ("^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$") . unwrap ()
            },
        );
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for LocalDateTime {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LocalDateTime {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for LocalDateTime {
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
#[doc = "A scheduled content change set (RFC-0008): node versions pinned by id, rev and content hash, applied on top of whatever is live at the release's time. A single scheduled publish is a one-item release. Each item records the version that was live when the release was pinned (`base`); if a pinned node or its live base changed before the release runs, the release is held as a conflict instead of overwriting anything. A person's approval is bound to `hash` (`rl1:`), which digests the items only, so a person may move an approved release without re-approving it while an agent's move or any content change voids the approval. Releases live in D1 next to the graph; they are not graph nodes, never enter a snapshot and are not part of site bundles."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Release {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub approval: ::std::option::Option<ReleaseApproval>,
    #[serde(rename = "createdAt")]
    pub created_at: Timestamp,
    #[serde(rename = "createdBy")]
    pub created_by: Actor,
    pub hash: ReleaseHash,
    pub id: ReleaseId,
    #[doc = "The pinned changes, at most one per node. A release never contains the site node: site settings, domains and structure are published the ordinary way."]
    pub items: ::std::vec::Vec<ReleaseItem>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub metadata: ::std::option::Option<Metadata>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub outcome: ::std::option::Option<ReleaseOutcome>,
    pub rev: Revision,
    #[serde(rename = "schemaVersion")]
    pub schema_version: SchemaVersion,
    #[serde(rename = "siteId")]
    pub site_id: Id,
    pub state: ReleaseState,
    #[doc = "Optional name shown in Studio (\"Election night\"). A one-item release without a title is shown under its entry's or page's title."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub title: ::std::option::Option<ReleaseTitle>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Timestamp,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub when: ::std::option::Option<ReleaseWhen>,
}
#[doc = "Why the release may run, discriminated by `kind`."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum ReleaseApproval {
    #[doc = "ReleasePersonApproval\n\nA person approved these items (bound to `hash`) for `executeAt`, either by deciding an agent's request (`approvalId`) or by scheduling it themselves. The person's rights are checked again when the release runs."]
    #[serde(rename = "person")]
    Person {
        #[serde(
            rename = "approvalId",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        approval_id: ::std::option::Option<Id>,
        at: Timestamp,
        by: ReleasePerson,
        #[serde(
            rename = "executeAt",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        execute_at: ::std::option::Option<Timestamp>,
    },
    #[doc = "ReleaseAutoApproval\n\nAn agent key in `auto` mode scheduled a low-risk release without a person (ADR-0015). Valid only while the release runs before `windowEnds`: the end of the key's elevation, or 24 hours after scheduling, whichever comes first."]
    #[serde(rename = "auto")]
    Auto {
        at: Timestamp,
        by: Actor,
        #[serde(rename = "keyId")]
        key_id: ReleaseApprovalKeyId,
        #[serde(rename = "windowEnds")]
        window_ends: Timestamp,
    },
}
#[doc = "`ReleaseApprovalKeyId`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseApprovalKeyId(::std::string::String);
impl ::std::ops::Deref for ReleaseApprovalKeyId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseApprovalKeyId> for ::std::string::String {
    fn from(value: ReleaseApprovalKeyId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseApprovalKeyId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[A-Za-z0-9_-]{6,64}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[A-Za-z0-9_-]{6,64}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseApprovalKeyId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseApprovalKeyId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseApprovalKeyId {
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
#[doc = "A node whose live version was not the pinned base when the release ran. `expected` absent: the node was not expected to be live; `found` absent: it was not live."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseConflict {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub expected: ::std::option::Option<ReleaseNodeVersion>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub found: ::std::option::Option<ReleaseNodeVersion>,
    #[serde(rename = "nodeId")]
    pub node_id: Id,
}
#[doc = "`rl1:` and the lower-case hex SHA-256 of the release's canonical item lines (site id, then one line per item sorted by node id: kind, node id, target and base versions). The prefix keeps it apart from the graph state hash and from comment bindings (`cm1:`); approvals store it as their state."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseHash(::std::string::String);
impl ::std::ops::Deref for ReleaseHash {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseHash> for ::std::string::String {
    fn from(value: ReleaseHash) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseHash {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^rl1:[0-9a-f]{64}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^rl1:[0-9a-f]{64}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseHash {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseHash {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseHash {
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
#[doc = "A release id: `rel_` and 6 to 32 letters or digits."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseId(::std::string::String);
impl ::std::ops::Deref for ReleaseId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseId> for ::std::string::String {
    fn from(value: ReleaseId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^rel_[A-Za-z0-9]{6,32}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^rel_[A-Za-z0-9]{6,32}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseId {
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
#[doc = "One pinned change, discriminated by `kind`."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum ReleaseItem {
    #[doc = "ReleaseSetItem\n\nMake `target` the live version of the node. `base` is the version that was live when the item was pinned; absent when the node was not live (a new entry or page)."]
    #[serde(rename = "set")]
    Set {
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        base: ::std::option::Option<ReleaseNodeVersion>,
        #[serde(rename = "nodeId")]
        node_id: Id,
        #[serde(rename = "nodeKind")]
        node_kind: ReleaseNodeKind,
        target: ReleaseNodeVersion,
    },
    #[doc = "ReleaseRemoveItem\n\nTake the node out of the live snapshot. `base` is the live version that is removed."]
    #[serde(rename = "remove")]
    Remove {
        base: ReleaseNodeVersion,
        #[serde(rename = "nodeId")]
        node_id: Id,
        #[serde(rename = "nodeKind")]
        node_kind: ReleaseNodeKind,
    },
}
#[doc = "Kinds of graph node a release may carry. The site node is never one of them."]
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
pub enum ReleaseNodeKind {
    #[serde(rename = "page")]
    Page,
    #[serde(rename = "contentEntry")]
    ContentEntry,
    #[serde(rename = "taxonomy")]
    Taxonomy,
    #[serde(rename = "term")]
    Term,
    #[serde(rename = "redirect")]
    Redirect,
    #[serde(rename = "menu")]
    Menu,
    #[serde(rename = "asset")]
    Asset,
}
impl ::std::fmt::Display for ReleaseNodeKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Page => f.write_str("page"),
            Self::ContentEntry => f.write_str("contentEntry"),
            Self::Taxonomy => f.write_str("taxonomy"),
            Self::Term => f.write_str("term"),
            Self::Redirect => f.write_str("redirect"),
            Self::Menu => f.write_str("menu"),
            Self::Asset => f.write_str("asset"),
        }
    }
}
impl ::std::str::FromStr for ReleaseNodeKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "page" => Ok(Self::Page),
            "contentEntry" => Ok(Self::ContentEntry),
            "taxonomy" => Ok(Self::Taxonomy),
            "term" => Ok(Self::Term),
            "redirect" => Ok(Self::Redirect),
            "menu" => Ok(Self::Menu),
            "asset" => Ok(Self::Asset),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseNodeKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseNodeKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "One version of a node: its revision and the SHA-256 of its canonical JSON, whose body the blob store keeps under `nodes/<hash>.json`."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseNodeVersion {
    pub hash: ReleaseNodeVersionHash,
    pub rev: Revision,
}
#[doc = "`ReleaseNodeVersionHash`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseNodeVersionHash(::std::string::String);
impl ::std::ops::Deref for ReleaseNodeVersionHash {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseNodeVersionHash> for ::std::string::String {
    fn from(value: ReleaseNodeVersionHash) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseNodeVersionHash {
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
impl ::std::convert::TryFrom<&str> for ReleaseNodeVersionHash {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseNodeVersionHash {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseNodeVersionHash {
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
#[doc = "What happened when the release was due, discriminated by `kind` (it matches the terminal `state`)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum ReleaseOutcome {
    #[doc = "ReleasePublishedOutcome\n\nApplied: `snapshotId` is the new live snapshot (reason `scheduled`), composed from `baseSnapshotId` and the items. `purge` says how the edge cache followed."]
    #[serde(rename = "published")]
    Published {
        at: Timestamp,
        #[serde(rename = "baseSnapshotId")]
        base_snapshot_id: Id,
        #[serde(rename = "latenessSeconds")]
        lateness_seconds: u64,
        purge: ReleaseOutcomePurge,
        #[serde(rename = "runId")]
        run_id: Id,
        #[serde(rename = "snapshotId")]
        snapshot_id: Id,
    },
    #[doc = "ReleaseConflictOutcome\n\nHeld: these nodes changed since the release was pinned. Nothing was published."]
    #[serde(rename = "conflict")]
    Conflict {
        at: Timestamp,
        conflicts: ::std::vec::Vec<ReleaseConflict>,
        #[serde(
            rename = "runId",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        run_id: ::std::option::Option<Id>,
    },
    #[doc = "ReleaseFailedOutcome\n\nRefused at run time; nothing was published."]
    #[serde(rename = "failed")]
    Failed {
        at: Timestamp,
        code: ReleaseOutcomeCode,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        message: ::std::option::Option<ReleaseOutcomeMessage>,
        #[serde(
            rename = "runId",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        run_id: ::std::option::Option<Id>,
    },
    #[doc = "ReleaseMissedOutcome\n\nThe scheduler reached the release more than an hour after its time; nothing was published. A person may publish it now."]
    #[serde(rename = "missed")]
    Missed {
        at: Timestamp,
        #[serde(rename = "latenessSeconds")]
        lateness_seconds: u64,
    },
    #[doc = "ReleaseExpiredOutcome\n\nNo valid approval when the release was due: never approved, the approver can no longer publish it, the agent's `auto` window ended, or its creator left."]
    #[serde(rename = "expired")]
    Expired {
        at: Timestamp,
        reason: ReleaseOutcomeReason,
    },
    #[doc = "ReleaseCanceledOutcome\n\nWithdrawn by a person or an agent; its nodes are unlocked."]
    #[serde(rename = "canceled")]
    Canceled { at: Timestamp, by: Actor },
}
#[doc = "`ReleaseOutcomeCode`"]
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
pub enum ReleaseOutcomeCode {
    #[serde(rename = "dependency_missing")]
    DependencyMissing,
    #[serde(rename = "invalid_snapshot")]
    InvalidSnapshot,
    #[serde(rename = "site_missing")]
    SiteMissing,
    #[serde(rename = "node_body_missing")]
    NodeBodyMissing,
    #[serde(rename = "store_error")]
    StoreError,
}
impl ::std::fmt::Display for ReleaseOutcomeCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::DependencyMissing => f.write_str("dependency_missing"),
            Self::InvalidSnapshot => f.write_str("invalid_snapshot"),
            Self::SiteMissing => f.write_str("site_missing"),
            Self::NodeBodyMissing => f.write_str("node_body_missing"),
            Self::StoreError => f.write_str("store_error"),
        }
    }
}
impl ::std::str::FromStr for ReleaseOutcomeCode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "dependency_missing" => Ok(Self::DependencyMissing),
            "invalid_snapshot" => Ok(Self::InvalidSnapshot),
            "site_missing" => Ok(Self::SiteMissing),
            "node_body_missing" => Ok(Self::NodeBodyMissing),
            "store_error" => Ok(Self::StoreError),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseOutcomeCode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseOutcomeCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReleaseOutcomeMessage`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseOutcomeMessage(::std::string::String);
impl ::std::ops::Deref for ReleaseOutcomeMessage {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseOutcomeMessage> for ::std::string::String {
    fn from(value: ReleaseOutcomeMessage) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseOutcomeMessage {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 500usize {
            return Err("longer than 500 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$")
                    .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err(
                "doesn't match pattern \"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$\""
                    .into(),
            );
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseOutcomeMessage {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseOutcomeMessage {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseOutcomeMessage {
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
#[doc = "`ReleaseOutcomePurge`"]
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
pub enum ReleaseOutcomePurge {
    #[serde(rename = "tags")]
    Tags,
    #[serde(rename = "everything")]
    Everything,
    #[serde(rename = "deferred")]
    Deferred,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "none")]
    None,
}
impl ::std::fmt::Display for ReleaseOutcomePurge {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Tags => f.write_str("tags"),
            Self::Everything => f.write_str("everything"),
            Self::Deferred => f.write_str("deferred"),
            Self::Failed => f.write_str("failed"),
            Self::None => f.write_str("none"),
        }
    }
}
impl ::std::str::FromStr for ReleaseOutcomePurge {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "tags" => Ok(Self::Tags),
            "everything" => Ok(Self::Everything),
            "deferred" => Ok(Self::Deferred),
            "failed" => Ok(Self::Failed),
            "none" => Ok(Self::None),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseOutcomePurge {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseOutcomePurge {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReleaseOutcomeReason`"]
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
pub enum ReleaseOutcomeReason {
    #[serde(rename = "unapproved")]
    Unapproved,
    #[serde(rename = "approval_lost")]
    ApprovalLost,
    #[serde(rename = "auto_window_ended")]
    AutoWindowEnded,
    #[serde(rename = "creator_removed")]
    CreatorRemoved,
}
impl ::std::fmt::Display for ReleaseOutcomeReason {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Unapproved => f.write_str("unapproved"),
            Self::ApprovalLost => f.write_str("approval_lost"),
            Self::AutoWindowEnded => f.write_str("auto_window_ended"),
            Self::CreatorRemoved => f.write_str("creator_removed"),
        }
    }
}
impl ::std::str::FromStr for ReleaseOutcomeReason {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "unapproved" => Ok(Self::Unapproved),
            "approval_lost" => Ok(Self::ApprovalLost),
            "auto_window_ended" => Ok(Self::AutoWindowEnded),
            "creator_removed" => Ok(Self::CreatorRemoved),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseOutcomeReason {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseOutcomeReason {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "A staff person (`user_…`). Agents never appear here."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleasePerson {
    pub id: ReleasePersonId,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub name: ::std::option::Option<ReleasePersonName>,
}
#[doc = "`ReleasePersonId`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleasePersonId(::std::string::String);
impl ::std::ops::Deref for ReleasePersonId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleasePersonId> for ::std::string::String {
    fn from(value: ReleasePersonId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleasePersonId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^user_[A-Za-z0-9]{6,32}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^user_[A-Za-z0-9]{6,32}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleasePersonId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleasePersonId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleasePersonId {
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
#[doc = "`ReleasePersonName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleasePersonName(::std::string::String);
impl ::std::ops::Deref for ReleasePersonName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleasePersonName> for ::std::string::String {
    fn from(value: ReleasePersonName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleasePersonName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 200usize {
            return Err("longer than 200 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleasePersonName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleasePersonName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleasePersonName {
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
#[doc = "Lifecycle. `draft`: proposed or being assembled, nothing locked. `awaiting_approval`: waiting for a person; its nodes are locked. `scheduled`: approved (or allowed by `auto` mode) and locked until it runs. `running`: claimed by the scheduler. `published`: applied; `outcome` names the snapshot. `conflict`: a pinned node or its live base changed; held, nothing published. `missed`: the scheduler reached it more than an hour late; nothing published. `expired`: no valid approval at its time. `failed`: refused at run time (e.g. a dependency is missing). `canceled`: withdrawn."]
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
pub enum ReleaseState {
    #[serde(rename = "draft")]
    Draft,
    #[serde(rename = "awaiting_approval")]
    AwaitingApproval,
    #[serde(rename = "scheduled")]
    Scheduled,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "published")]
    Published,
    #[serde(rename = "conflict")]
    Conflict,
    #[serde(rename = "missed")]
    Missed,
    #[serde(rename = "expired")]
    Expired,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "canceled")]
    Canceled,
}
impl ::std::fmt::Display for ReleaseState {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Draft => f.write_str("draft"),
            Self::AwaitingApproval => f.write_str("awaiting_approval"),
            Self::Scheduled => f.write_str("scheduled"),
            Self::Running => f.write_str("running"),
            Self::Published => f.write_str("published"),
            Self::Conflict => f.write_str("conflict"),
            Self::Missed => f.write_str("missed"),
            Self::Expired => f.write_str("expired"),
            Self::Failed => f.write_str("failed"),
            Self::Canceled => f.write_str("canceled"),
        }
    }
}
impl ::std::str::FromStr for ReleaseState {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "draft" => Ok(Self::Draft),
            "awaiting_approval" => Ok(Self::AwaitingApproval),
            "scheduled" => Ok(Self::Scheduled),
            "running" => Ok(Self::Running),
            "published" => Ok(Self::Published),
            "conflict" => Ok(Self::Conflict),
            "missed" => Ok(Self::Missed),
            "expired" => Ok(Self::Expired),
            "failed" => Ok(Self::Failed),
            "canceled" => Ok(Self::Canceled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseState {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseState {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "Optional name shown in Studio (\"Election night\"). A one-item release without a title is shown under its entry's or page's title."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ReleaseTitle(::std::string::String);
impl ::std::ops::Deref for ReleaseTitle {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ReleaseTitle> for ::std::string::String {
    fn from(value: ReleaseTitle) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ReleaseTitle {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 200usize {
            return Err("longer than 200 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$")
                    .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err(
                "doesn't match pattern \"^[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$\""
                    .into(),
            );
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseTitle {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseTitle {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ReleaseTitle {
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
#[doc = "When the release runs, discriminated by `kind`. Absent while a draft has no time yet."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum ReleaseWhen {
    #[doc = "ReleaseAt\n\nAt an instant. `at` is what the scheduler compares with the clock; when a person entered a wall-clock time, `localTime` keeps it and `at` is recomputed from it and `timeZone` before the release runs, never earlier than the wall-clock time."]
    #[serde(rename = "at")]
    At {
        at: Timestamp,
        #[serde(
            rename = "localTime",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        local_time: ::std::option::Option<LocalDateTime>,
        #[serde(rename = "timeZone")]
        time_zone: TimeZone,
    },
    #[serde(rename = "on-approval")]
    OnApproval,
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
#[doc = "IANA time zone name from the tz database (RFC-0008), e.g. Europe/Istanbul, America/Argentina/Buenos_Aires, Etc/GMT+3 or UTC. Wall-clock times a person enters are kept with their zone, so the instant is recomputed when governments change the rules. The pattern bounds the shape only; writers also check the name against the runtime's Intl zone list."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct TimeZone(::std::string::String);
impl ::std::ops::Deref for TimeZone {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<TimeZone> for ::std::string::String {
    fn from(value: TimeZone) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for TimeZone {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 64usize {
            return Err("longer than 64 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$")
                    .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err(
                "doesn't match pattern \"^(?:UTC|[A-Z][A-Za-z_-]+(?:/[A-Za-z0-9_+-]+){1,2})$\""
                    .into(),
            );
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for TimeZone {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for TimeZone {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for TimeZone {
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
