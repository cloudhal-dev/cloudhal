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
#[doc = "`Announcement`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Announcement {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub dismissible: ::std::option::Option<bool>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub href: ::std::option::Option<AnnouncementHref>,
    #[doc = "Change it when the text changes, so readers who dismissed the old one see the new one."]
    pub id: AnnouncementId,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub label: ::std::option::Option<AnnouncementLabel>,
    pub text: AnnouncementText,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub tone: ::std::option::Option<AnnouncementTone>,
}
#[doc = "`AnnouncementHref`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnnouncementHref(::std::string::String);
impl ::std::ops::Deref for AnnouncementHref {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnnouncementHref> for ::std::string::String {
    fn from(value: AnnouncementHref) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnnouncementHref {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2048usize {
            return Err("longer than 2048 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnnouncementHref {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnnouncementHref {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnnouncementHref {
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
#[doc = "Change it when the text changes, so readers who dismissed the old one see the new one."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnnouncementId(::std::string::String);
impl ::std::ops::Deref for AnnouncementId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnnouncementId> for ::std::string::String {
    fn from(value: AnnouncementId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnnouncementId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z0-9][a-z0-9-]{0,40}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z0-9][a-z0-9-]{0,40}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnnouncementId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnnouncementId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnnouncementId {
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
#[doc = "`AnnouncementLabel`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnnouncementLabel(::std::string::String);
impl ::std::ops::Deref for AnnouncementLabel {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnnouncementLabel> for ::std::string::String {
    fn from(value: AnnouncementLabel) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnnouncementLabel {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 40usize {
            return Err("longer than 40 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnnouncementLabel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnnouncementLabel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnnouncementLabel {
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
#[doc = "`AnnouncementText`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnnouncementText(::std::string::String);
impl ::std::ops::Deref for AnnouncementText {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnnouncementText> for ::std::string::String {
    fn from(value: AnnouncementText) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnnouncementText {
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
impl ::std::convert::TryFrom<&str> for AnnouncementText {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnnouncementText {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnnouncementText {
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
#[doc = "`AnnouncementTone`"]
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
pub enum AnnouncementTone {
    #[serde(rename = "info")]
    Info,
    #[serde(rename = "brand")]
    Brand,
    #[serde(rename = "warning")]
    Warning,
}
impl ::std::fmt::Display for AnnouncementTone {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Info => f.write_str("info"),
            Self::Brand => f.write_str("brand"),
            Self::Warning => f.write_str("warning"),
        }
    }
}
impl ::std::str::FromStr for AnnouncementTone {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "info" => Ok(Self::Info),
            "brand" => Ok(Self::Brand),
            "warning" => Ok(Self::Warning),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AnnouncementTone {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnnouncementTone {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "One top-level block of a markdown body in the store's index (RFC-0014 §3). Written by the store only: a client's values are replaced on every write. `by`, `via` and `at` say who last changed the block's content, through which channel and when; they are absent for content written before the index existed."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BodyBlock {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub at: ::std::option::Option<Timestamp>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub by: ::std::option::Option<Actor>,
    #[doc = "SHA-256 (hex) of the block's markdown without trailing whitespace."]
    pub hash: BodyBlockHash,
    #[doc = "Stable across writes that keep the block's content or its place among unchanged blocks."]
    pub id: BodyBlockId,
    #[doc = "The channel of that change."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub via: ::std::option::Option<BodyBlockVia>,
}
#[doc = "SHA-256 (hex) of the block's markdown without trailing whitespace."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct BodyBlockHash(::std::string::String);
impl ::std::ops::Deref for BodyBlockHash {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BodyBlockHash> for ::std::string::String {
    fn from(value: BodyBlockHash) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for BodyBlockHash {
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
impl ::std::convert::TryFrom<&str> for BodyBlockHash {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BodyBlockHash {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for BodyBlockHash {
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
#[doc = "Stable across writes that keep the block's content or its place among unchanged blocks."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct BodyBlockId(::std::string::String);
impl ::std::ops::Deref for BodyBlockId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BodyBlockId> for ::std::string::String {
    fn from(value: BodyBlockId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for BodyBlockId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^blk_[0-9A-Za-z]{8,24}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^blk_[0-9A-Za-z]{8,24}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for BodyBlockId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BodyBlockId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for BodyBlockId {
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
#[doc = "The channel of that change."]
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
pub enum BodyBlockVia {
    #[serde(rename = "studio")]
    Studio,
    #[serde(rename = "mcp")]
    Mcp,
    #[serde(rename = "api")]
    Api,
    #[serde(rename = "import")]
    Import,
    #[serde(rename = "ai-command")]
    AiCommand,
    #[serde(rename = "proposal")]
    Proposal,
}
impl ::std::fmt::Display for BodyBlockVia {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Studio => f.write_str("studio"),
            Self::Mcp => f.write_str("mcp"),
            Self::Api => f.write_str("api"),
            Self::Import => f.write_str("import"),
            Self::AiCommand => f.write_str("ai-command"),
            Self::Proposal => f.write_str("proposal"),
        }
    }
}
impl ::std::str::FromStr for BodyBlockVia {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "studio" => Ok(Self::Studio),
            "mcp" => Ok(Self::Mcp),
            "api" => Ok(Self::Api),
            "import" => Ok(Self::Import),
            "ai-command" => Ok(Self::AiCommand),
            "proposal" => Ok(Self::Proposal),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BodyBlockVia {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BodyBlockVia {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "A markdown body's block index, in body order (RFC-0014 §3). Absent means not indexed (yet, or an HTML body), never empty."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct BodyBlocks(pub ::std::vec::Vec<BodyBlock>);
impl ::std::ops::Deref for BodyBlocks {
    type Target = ::std::vec::Vec<BodyBlock>;
    fn deref(&self) -> &::std::vec::Vec<BodyBlock> {
        &self.0
    }
}
impl ::std::convert::From<BodyBlocks> for ::std::vec::Vec<BodyBlock> {
    fn from(value: BodyBlocks) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::vec::Vec<BodyBlock>> for BodyBlocks {
    fn from(value: ::std::vec::Vec<BodyBlock>) -> Self {
        Self(value)
    }
}
#[doc = "The markdown dialect a body follows (RFC-0014 §1): 1 = Cloudhal Markdown v1 (CommonMark + GFM + `asset:` + directives; raw HTML escaped). Set by the store on markdown bodies."]
#[derive(:: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct BodyProfile(i64);
impl ::std::ops::Deref for BodyProfile {
    type Target = i64;
    fn deref(&self) -> &i64 {
        &self.0
    }
}
impl ::std::convert::From<BodyProfile> for i64 {
    fn from(value: BodyProfile) -> Self {
        value.0
    }
}
impl ::std::convert::TryFrom<i64> for BodyProfile {
    type Error = self::error::ConversionError;
    fn try_from(value: i64) -> ::std::result::Result<Self, self::error::ConversionError> {
        if ![1_i64].contains(&value) {
            Err("invalid value".into())
        } else {
            Ok(Self(value))
        }
    }
}
impl<'de> ::serde::Deserialize<'de> for BodyProfile {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        Self::try_from(<i64>::deserialize(deserializer)?)
            .map_err(|e| <D::Error as ::serde::de::Error>::custom(e.to_string()))
    }
}
#[doc = "The site's logo and social links (RFC-0025 §1), shared by the header, the footer and SEO."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Brand {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub logo: ::std::option::Option<ImageRef>,
    #[serde(
        rename = "logoDark",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub logo_dark: ::std::option::Option<ImageRef>,
    #[serde(
        rename = "logoHeight",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub logo_height: ::std::option::Option<BrandLogoHeight>,
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub social: ::std::vec::Vec<SocialLink>,
}
#[doc = "`BrandLogoHeight`"]
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
pub enum BrandLogoHeight {
    #[serde(rename = "s")]
    S,
    #[serde(rename = "m")]
    M,
    #[serde(rename = "l")]
    L,
}
impl ::std::fmt::Display for BrandLogoHeight {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::S => f.write_str("s"),
            Self::M => f.write_str("m"),
            Self::L => f.write_str("l"),
        }
    }
}
impl ::std::str::FromStr for BrandLogoHeight {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "s" => Ok(Self::S),
            "m" => Ok(Self::M),
            "l" => Ok(Self::L),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BrandLogoHeight {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BrandLogoHeight {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "The site's header, footer and bars as data (RFC-0025): enums, menu keys and short texts; the theme renders them with landmarks, focus and contrast guaranteed."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Chrome {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub announcement: ::std::option::Option<Announcement>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub consent: ::std::option::Option<Consent>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub footer: ::std::option::Option<ChromeFooter>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub header: ::std::option::Option<ChromeHeader>,
}
#[doc = "`ChromeFooter`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ChromeFooter {
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub columns: ::std::vec::Vec<FooterColumn>,
    #[doc = "The legal line; {year} and {site} are the only placeholders."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub copyright: ::std::option::Option<ChromeFooterCopyright>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub credit: ::std::option::Option<bool>,
    #[serde(
        rename = "ctaHeading",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub cta_heading: ::std::option::Option<ChromeFooterCtaHeading>,
    #[serde(
        rename = "ctaHref",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub cta_href: ::std::option::Option<ChromeFooterCtaHref>,
    #[serde(
        rename = "ctaLabel",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub cta_label: ::std::option::Option<ChromeFooterCtaLabel>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub extras: ::std::option::Option<::std::vec::Vec<ChromeFooterExtrasItem>>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub layout: ::std::option::Option<ChromeFooterLayout>,
    #[doc = "A menu key (RFC-0003)."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub legal: ::std::option::Option<Slug>,
    #[doc = "RFC-0025 §2: one optional surface (kind `surface`) above the footer's columns, built and checked like any surface; the store refuses other section kinds."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub region: ::std::option::Option<Section>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub social: ::std::option::Option<bool>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub surface: ::std::option::Option<ChromeFooterSurface>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub tagline: ::std::option::Option<ChromeFooterTagline>,
}
#[doc = "The legal line; {year} and {site} are the only placeholders."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ChromeFooterCopyright(::std::string::String);
impl ::std::ops::Deref for ChromeFooterCopyright {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ChromeFooterCopyright> for ::std::string::String {
    fn from(value: ChromeFooterCopyright) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ChromeFooterCopyright {
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
impl ::std::convert::TryFrom<&str> for ChromeFooterCopyright {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeFooterCopyright {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ChromeFooterCopyright {
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
#[doc = "`ChromeFooterCtaHeading`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ChromeFooterCtaHeading(::std::string::String);
impl ::std::ops::Deref for ChromeFooterCtaHeading {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ChromeFooterCtaHeading> for ::std::string::String {
    fn from(value: ChromeFooterCtaHeading) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ChromeFooterCtaHeading {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 120usize {
            return Err("longer than 120 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ChromeFooterCtaHeading {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeFooterCtaHeading {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ChromeFooterCtaHeading {
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
#[doc = "`ChromeFooterCtaHref`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ChromeFooterCtaHref(::std::string::String);
impl ::std::ops::Deref for ChromeFooterCtaHref {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ChromeFooterCtaHref> for ::std::string::String {
    fn from(value: ChromeFooterCtaHref) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ChromeFooterCtaHref {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2048usize {
            return Err("longer than 2048 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ChromeFooterCtaHref {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeFooterCtaHref {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ChromeFooterCtaHref {
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
#[doc = "`ChromeFooterCtaLabel`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ChromeFooterCtaLabel(::std::string::String);
impl ::std::ops::Deref for ChromeFooterCtaLabel {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ChromeFooterCtaLabel> for ::std::string::String {
    fn from(value: ChromeFooterCtaLabel) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ChromeFooterCtaLabel {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 40usize {
            return Err("longer than 40 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ChromeFooterCtaLabel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeFooterCtaLabel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ChromeFooterCtaLabel {
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
#[doc = "`ChromeFooterExtrasItem`"]
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
pub enum ChromeFooterExtrasItem {
    #[serde(rename = "locale")]
    Locale,
    #[serde(rename = "theme-toggle")]
    ThemeToggle,
    #[serde(rename = "motion-toggle")]
    MotionToggle,
}
impl ::std::fmt::Display for ChromeFooterExtrasItem {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Locale => f.write_str("locale"),
            Self::ThemeToggle => f.write_str("theme-toggle"),
            Self::MotionToggle => f.write_str("motion-toggle"),
        }
    }
}
impl ::std::str::FromStr for ChromeFooterExtrasItem {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "locale" => Ok(Self::Locale),
            "theme-toggle" => Ok(Self::ThemeToggle),
            "motion-toggle" => Ok(Self::MotionToggle),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeFooterExtrasItem {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeFooterExtrasItem {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeFooterLayout`"]
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
pub enum ChromeFooterLayout {
    #[serde(rename = "simple")]
    Simple,
    #[serde(rename = "columns")]
    Columns,
    #[serde(rename = "cta-band")]
    CtaBand,
    #[serde(rename = "minimal")]
    Minimal,
}
impl ::std::fmt::Display for ChromeFooterLayout {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Simple => f.write_str("simple"),
            Self::Columns => f.write_str("columns"),
            Self::CtaBand => f.write_str("cta-band"),
            Self::Minimal => f.write_str("minimal"),
        }
    }
}
impl ::std::str::FromStr for ChromeFooterLayout {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "simple" => Ok(Self::Simple),
            "columns" => Ok(Self::Columns),
            "cta-band" => Ok(Self::CtaBand),
            "minimal" => Ok(Self::Minimal),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeFooterLayout {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeFooterLayout {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeFooterSurface`"]
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
pub enum ChromeFooterSurface {
    #[serde(rename = "plain")]
    Plain,
    #[serde(rename = "muted")]
    Muted,
    #[serde(rename = "inverse")]
    Inverse,
}
impl ::std::fmt::Display for ChromeFooterSurface {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Plain => f.write_str("plain"),
            Self::Muted => f.write_str("muted"),
            Self::Inverse => f.write_str("inverse"),
        }
    }
}
impl ::std::str::FromStr for ChromeFooterSurface {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "plain" => Ok(Self::Plain),
            "muted" => Ok(Self::Muted),
            "inverse" => Ok(Self::Inverse),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeFooterSurface {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeFooterSurface {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeFooterTagline`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ChromeFooterTagline(::std::string::String);
impl ::std::ops::Deref for ChromeFooterTagline {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ChromeFooterTagline> for ::std::string::String {
    fn from(value: ChromeFooterTagline) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ChromeFooterTagline {
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
impl ::std::convert::TryFrom<&str> for ChromeFooterTagline {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeFooterTagline {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ChromeFooterTagline {
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
#[doc = "`ChromeHeader`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ChromeHeader {
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub actions: ::std::vec::Vec<HeaderAction>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub behavior: ::std::option::Option<ChromeHeaderBehavior>,
    #[serde(
        rename = "collapseAt",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub collapse_at: ::std::option::Option<ChromeHeaderCollapseAt>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub layout: ::std::option::Option<ChromeHeaderLayout>,
    #[serde(
        rename = "mobileStyle",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub mobile_style: ::std::option::Option<ChromeHeaderMobileStyle>,
    #[doc = "A menu key (RFC-0003)."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub nav: ::std::option::Option<Slug>,
    #[serde(
        rename = "overHero",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub over_hero: ::std::option::Option<ChromeHeaderOverHero>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub shrink: ::std::option::Option<bool>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub surface: ::std::option::Option<ChromeHeaderSurface>,
    #[doc = "A menu key (RFC-0003)."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub utility: ::std::option::Option<Slug>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub width: ::std::option::Option<ChromeHeaderWidth>,
}
#[doc = "`ChromeHeaderBehavior`"]
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
pub enum ChromeHeaderBehavior {
    #[serde(rename = "static")]
    Static,
    #[serde(rename = "sticky")]
    Sticky,
    #[serde(rename = "hide-on-scroll")]
    HideOnScroll,
    #[serde(rename = "fixed")]
    Fixed,
}
impl ::std::fmt::Display for ChromeHeaderBehavior {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Static => f.write_str("static"),
            Self::Sticky => f.write_str("sticky"),
            Self::HideOnScroll => f.write_str("hide-on-scroll"),
            Self::Fixed => f.write_str("fixed"),
        }
    }
}
impl ::std::str::FromStr for ChromeHeaderBehavior {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "static" => Ok(Self::Static),
            "sticky" => Ok(Self::Sticky),
            "hide-on-scroll" => Ok(Self::HideOnScroll),
            "fixed" => Ok(Self::Fixed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeHeaderBehavior {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeHeaderBehavior {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeHeaderCollapseAt`"]
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
pub enum ChromeHeaderCollapseAt {
    #[serde(rename = "sm")]
    Sm,
    #[serde(rename = "md")]
    Md,
    #[serde(rename = "lg")]
    Lg,
    #[serde(rename = "always")]
    Always,
}
impl ::std::fmt::Display for ChromeHeaderCollapseAt {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Sm => f.write_str("sm"),
            Self::Md => f.write_str("md"),
            Self::Lg => f.write_str("lg"),
            Self::Always => f.write_str("always"),
        }
    }
}
impl ::std::str::FromStr for ChromeHeaderCollapseAt {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "sm" => Ok(Self::Sm),
            "md" => Ok(Self::Md),
            "lg" => Ok(Self::Lg),
            "always" => Ok(Self::Always),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeHeaderCollapseAt {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeHeaderCollapseAt {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeHeaderLayout`"]
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
pub enum ChromeHeaderLayout {
    #[serde(rename = "logo-left")]
    LogoLeft,
    #[serde(rename = "logo-left-nav-center")]
    LogoLeftNavCenter,
    #[serde(rename = "centered")]
    Centered,
    #[serde(rename = "split")]
    Split,
    #[serde(rename = "minimal")]
    Minimal,
}
impl ::std::fmt::Display for ChromeHeaderLayout {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::LogoLeft => f.write_str("logo-left"),
            Self::LogoLeftNavCenter => f.write_str("logo-left-nav-center"),
            Self::Centered => f.write_str("centered"),
            Self::Split => f.write_str("split"),
            Self::Minimal => f.write_str("minimal"),
        }
    }
}
impl ::std::str::FromStr for ChromeHeaderLayout {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "logo-left" => Ok(Self::LogoLeft),
            "logo-left-nav-center" => Ok(Self::LogoLeftNavCenter),
            "centered" => Ok(Self::Centered),
            "split" => Ok(Self::Split),
            "minimal" => Ok(Self::Minimal),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeHeaderLayout {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeHeaderLayout {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeHeaderMobileStyle`"]
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
pub enum ChromeHeaderMobileStyle {
    #[serde(rename = "dropdown")]
    Dropdown,
    #[serde(rename = "drawer-start")]
    DrawerStart,
    #[serde(rename = "drawer-end")]
    DrawerEnd,
    #[serde(rename = "fullscreen")]
    Fullscreen,
}
impl ::std::fmt::Display for ChromeHeaderMobileStyle {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Dropdown => f.write_str("dropdown"),
            Self::DrawerStart => f.write_str("drawer-start"),
            Self::DrawerEnd => f.write_str("drawer-end"),
            Self::Fullscreen => f.write_str("fullscreen"),
        }
    }
}
impl ::std::str::FromStr for ChromeHeaderMobileStyle {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "dropdown" => Ok(Self::Dropdown),
            "drawer-start" => Ok(Self::DrawerStart),
            "drawer-end" => Ok(Self::DrawerEnd),
            "fullscreen" => Ok(Self::Fullscreen),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeHeaderMobileStyle {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeHeaderMobileStyle {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeHeaderOverHero`"]
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
pub enum ChromeHeaderOverHero {
    #[serde(rename = "solid")]
    Solid,
    #[serde(rename = "transparent")]
    Transparent,
}
impl ::std::fmt::Display for ChromeHeaderOverHero {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Solid => f.write_str("solid"),
            Self::Transparent => f.write_str("transparent"),
        }
    }
}
impl ::std::str::FromStr for ChromeHeaderOverHero {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "solid" => Ok(Self::Solid),
            "transparent" => Ok(Self::Transparent),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeHeaderOverHero {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeHeaderOverHero {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeHeaderSurface`"]
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
pub enum ChromeHeaderSurface {
    #[serde(rename = "plain")]
    Plain,
    #[serde(rename = "muted")]
    Muted,
    #[serde(rename = "raised")]
    Raised,
    #[serde(rename = "inverse")]
    Inverse,
    #[serde(rename = "brand")]
    Brand,
}
impl ::std::fmt::Display for ChromeHeaderSurface {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Plain => f.write_str("plain"),
            Self::Muted => f.write_str("muted"),
            Self::Raised => f.write_str("raised"),
            Self::Inverse => f.write_str("inverse"),
            Self::Brand => f.write_str("brand"),
        }
    }
}
impl ::std::str::FromStr for ChromeHeaderSurface {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "plain" => Ok(Self::Plain),
            "muted" => Ok(Self::Muted),
            "raised" => Ok(Self::Raised),
            "inverse" => Ok(Self::Inverse),
            "brand" => Ok(Self::Brand),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeHeaderSurface {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeHeaderSurface {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChromeHeaderWidth`"]
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
pub enum ChromeHeaderWidth {
    #[serde(rename = "content")]
    Content,
    #[serde(rename = "wide")]
    Wide,
    #[serde(rename = "full")]
    Full,
}
impl ::std::fmt::Display for ChromeHeaderWidth {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Content => f.write_str("content"),
            Self::Wide => f.write_str("wide"),
            Self::Full => f.write_str("full"),
        }
    }
}
impl ::std::str::FromStr for ChromeHeaderWidth {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "content" => Ok(Self::Content),
            "wide" => Ok(Self::Wide),
            "full" => Ok(Self::Full),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChromeHeaderWidth {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChromeHeaderWidth {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "RFC-0042: a time gate every entry derives from one of its date or datetime fields, checked at render time like Availability.until. A date ends at the start of the next day in the site's time zone."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CollectionExpiry {
    #[doc = "unlist: the page stays, the entry leaves listings, feeds, the sitemap and search. hide: every public route answers 404."]
    pub action: CollectionExpiryAction,
    #[doc = "Grace after the field's instant. Absent: 0."]
    #[serde(
        rename = "afterMinutes",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub after_minutes: ::std::option::Option<i64>,
    pub field: FieldKey,
}
#[doc = "unlist: the page stays, the entry leaves listings, feeds, the sitemap and search. hide: every public route answers 404."]
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
pub enum CollectionExpiryAction {
    #[serde(rename = "unlist")]
    Unlist,
    #[serde(rename = "hide")]
    Hide,
}
impl ::std::fmt::Display for CollectionExpiryAction {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Unlist => f.write_str("unlist"),
            Self::Hide => f.write_str("hide"),
        }
    }
}
impl ::std::str::FromStr for CollectionExpiryAction {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "unlist" => Ok(Self::Unlist),
            "hide" => Ok(Self::Hide),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CollectionExpiryAction {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CollectionExpiryAction {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CollectionLabel`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CollectionLabel {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub description: ::std::option::Option<CollectionLabelDescription>,
    pub plural: CollectionLabelPlural,
    pub singular: CollectionLabelSingular,
}
#[doc = "`CollectionLabelDescription`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CollectionLabelDescription(::std::string::String);
impl ::std::ops::Deref for CollectionLabelDescription {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CollectionLabelDescription> for ::std::string::String {
    fn from(value: CollectionLabelDescription) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CollectionLabelDescription {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 1000usize {
            return Err("longer than 1000 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CollectionLabelDescription {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CollectionLabelDescription {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CollectionLabelDescription {
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
#[doc = "`CollectionLabelPlural`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CollectionLabelPlural(::std::string::String);
impl ::std::ops::Deref for CollectionLabelPlural {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CollectionLabelPlural> for ::std::string::String {
    fn from(value: CollectionLabelPlural) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CollectionLabelPlural {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 100usize {
            return Err("longer than 100 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CollectionLabelPlural {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CollectionLabelPlural {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CollectionLabelPlural {
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
#[doc = "`CollectionLabelSingular`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CollectionLabelSingular(::std::string::String);
impl ::std::ops::Deref for CollectionLabelSingular {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CollectionLabelSingular> for ::std::string::String {
    fn from(value: CollectionLabelSingular) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CollectionLabelSingular {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 100usize {
            return Err("longer than 100 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CollectionLabelSingular {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CollectionLabelSingular {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CollectionLabelSingular {
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
#[doc = "`CollectionSettings`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CollectionSettings {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub expiry: ::std::option::Option<CollectionExpiry>,
    #[doc = "RFC-0040: entries appear in the site's RSS feeds. Absent: true."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub feed: ::std::option::Option<bool>,
    #[doc = "RFC-0041: the collection's typed custom fields, in form order. Values live in ContentEntry.fields under each key. At most 200 per site and unique keys (checked in code)."]
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub fields: ::std::vec::Vec<FieldDefinition>,
    #[doc = "RFC-0040: a name from Studio's closed icon set (e.g. calendar, briefcase, users). Unknown names show the default icon. Never a URL or markup."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub icon: ::std::option::Option<CollectionSettingsIcon>,
    #[doc = "RFC-0040: display names per locale (Studio, agents, themes). Absent or missing a locale: the default locale's, then the key."]
    #[serde(
        default,
        skip_serializing_if = ":: std :: collections :: HashMap::is_empty"
    )]
    pub labels: ::std::collections::HashMap<Locale, CollectionLabel>,
    #[doc = "RFC-0042: fields that listings, queries, Studio columns and MCP may filter and sort by, in column order. Keys of this collection's fields (checked in code)."]
    #[serde(
        rename = "listFields",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub list_fields: ::std::option::Option<::std::vec::Vec<FieldKey>>,
    #[doc = "RFC-0038: where the collection's entries live, as a template with a closed token set. Version 1: one or more fixed lower-case path segments followed by /{slug}, e.g. /blog/{slug}. Absent means /<collection>/{slug}."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub permalink: ::std::option::Option<CollectionSettingsPermalink>,
    #[doc = "RFC-0040: published entries appear in sitemap.xml. Absent: true."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub sitemap: ::std::option::Option<bool>,
    #[doc = "RFC-0040: default order where none is given (Studio's list, entry queries without sort, MCP list_entries). Absent: newest."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub sort: ::std::option::Option<CollectionSettingsSort>,
    #[serde(
        rename = "structuredData",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub structured_data: ::std::option::Option<StructuredDataPreset>,
}
#[doc = "RFC-0040: a name from Studio's closed icon set (e.g. calendar, briefcase, users). Unknown names show the default icon. Never a URL or markup."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CollectionSettingsIcon(::std::string::String);
impl ::std::ops::Deref for CollectionSettingsIcon {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CollectionSettingsIcon> for ::std::string::String {
    fn from(value: CollectionSettingsIcon) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CollectionSettingsIcon {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 40usize {
            return Err("longer than 40 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z0-9]+(-[a-z0-9]+)*$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z0-9]+(-[a-z0-9]+)*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CollectionSettingsIcon {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CollectionSettingsIcon {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CollectionSettingsIcon {
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
#[doc = "RFC-0038: where the collection's entries live, as a template with a closed token set. Version 1: one or more fixed lower-case path segments followed by /{slug}, e.g. /blog/{slug}. Absent means /<collection>/{slug}."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CollectionSettingsPermalink(::std::string::String);
impl ::std::ops::Deref for CollectionSettingsPermalink {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CollectionSettingsPermalink> for ::std::string::String {
    fn from(value: CollectionSettingsPermalink) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CollectionSettingsPermalink {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^(/[a-z0-9]+(-[a-z0-9]+)*)+/\\{slug\\}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^(/[a-z0-9]+(-[a-z0-9]+)*)+/\\{slug\\}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CollectionSettingsPermalink {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CollectionSettingsPermalink {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CollectionSettingsPermalink {
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
#[doc = "RFC-0040: default order where none is given (Studio's list, entry queries without sort, MCP list_entries). Absent: newest."]
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
pub enum CollectionSettingsSort {
    #[serde(rename = "newest")]
    Newest,
    #[serde(rename = "oldest")]
    Oldest,
    #[serde(rename = "title")]
    Title,
}
impl ::std::fmt::Display for CollectionSettingsSort {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Newest => f.write_str("newest"),
            Self::Oldest => f.write_str("oldest"),
            Self::Title => f.write_str("title"),
        }
    }
}
impl ::std::str::FromStr for CollectionSettingsSort {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "newest" => Ok(Self::Newest),
            "oldest" => Ok(Self::Oldest),
            "title" => Ok(Self::Title),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CollectionSettingsSort {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CollectionSettingsSort {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`Consent`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Consent {
    pub mode: ConsentMode,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub policy: ::std::option::Option<Path>,
}
#[doc = "`ConsentMode`"]
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
pub enum ConsentMode {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "notice")]
    Notice,
    #[serde(rename = "choices")]
    Choices,
}
impl ::std::fmt::Display for ConsentMode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::None => f.write_str("none"),
            Self::Notice => f.write_str("notice"),
            Self::Choices => f.write_str("choices"),
        }
    }
}
impl ::std::str::FromStr for ConsentMode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "none" => Ok(Self::None),
            "notice" => Ok(Self::Notice),
            "choices" => Ok(Self::Choices),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ConsentMode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ConsentMode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "The site's design rules for people and agents (RFC-0021): Markdown that agents read with the theme's DESIGN.md before they build. Guidance only: it changes neither rendering nor permissions."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Design {
    pub markdown: DesignMarkdown,
}
#[doc = "`DesignMarkdown`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct DesignMarkdown(::std::string::String);
impl ::std::ops::Deref for DesignMarkdown {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<DesignMarkdown> for ::std::string::String {
    fn from(value: DesignMarkdown) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for DesignMarkdown {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 24000usize {
            return Err("longer than 24000 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for DesignMarkdown {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DesignMarkdown {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for DesignMarkdown {
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
#[doc = "`Domain`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Domain {
    pub hostname: DomainHostname,
    pub primary: bool,
}
#[doc = "`DomainHostname`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct DomainHostname(::std::string::String);
impl ::std::ops::Deref for DomainHostname {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<DomainHostname> for ::std::string::String {
    fn from(value: DomainHostname) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for DomainHostname {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 253usize {
            return Err("longer than 253 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$")
                    .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for DomainHostname {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DomainHostname {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for DomainHostname {
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
#[doc = "RFC-0042: entry properties a structured-data property may read."]
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
pub enum EntryValueProperty {
    #[serde(rename = "title")]
    Title,
    #[serde(rename = "summary")]
    Summary,
    #[serde(rename = "body")]
    Body,
    #[serde(rename = "coverImage")]
    CoverImage,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "publishedAt")]
    PublishedAt,
    #[serde(rename = "updatedAt")]
    UpdatedAt,
}
impl ::std::fmt::Display for EntryValueProperty {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Title => f.write_str("title"),
            Self::Summary => f.write_str("summary"),
            Self::Body => f.write_str("body"),
            Self::CoverImage => f.write_str("coverImage"),
            Self::Url => f.write_str("url"),
            Self::PublishedAt => f.write_str("publishedAt"),
            Self::UpdatedAt => f.write_str("updatedAt"),
        }
    }
}
impl ::std::str::FromStr for EntryValueProperty {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "title" => Ok(Self::Title),
            "summary" => Ok(Self::Summary),
            "body" => Ok(Self::Body),
            "coverImage" => Ok(Self::CoverImage),
            "url" => Ok(Self::Url),
            "publishedAt" => Ok(Self::PublishedAt),
            "updatedAt" => Ok(Self::UpdatedAt),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for EntryValueProperty {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for EntryValueProperty {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "RFC-0042: one condition on a typed field of the listed collection. `value` is read by the field's type: a number, YYYY-MM-DD, an RFC 3339 instant, true/false, an option value, or `now`. `values` only with `in`."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FieldCondition {
    #[doc = "A field key (site.schema.json FieldKey's pattern, repeated)."]
    pub field: FieldConditionField,
    pub op: FieldConditionOp,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub value: ::std::option::Option<FieldConditionValue>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub values: ::std::option::Option<::std::vec::Vec<FieldConditionValuesItem>>,
}
#[doc = "A field key (site.schema.json FieldKey's pattern, repeated)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FieldConditionField(::std::string::String);
impl ::std::ops::Deref for FieldConditionField {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FieldConditionField> for ::std::string::String {
    fn from(value: FieldConditionField) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FieldConditionField {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z][A-Za-z0-9]{0,39}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z][A-Za-z0-9]{0,39}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FieldConditionField {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldConditionField {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FieldConditionField {
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
#[doc = "`FieldConditionOp`"]
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
pub enum FieldConditionOp {
    #[serde(rename = "eq")]
    Eq,
    #[serde(rename = "ne")]
    Ne,
    #[serde(rename = "lt")]
    Lt,
    #[serde(rename = "lte")]
    Lte,
    #[serde(rename = "gt")]
    Gt,
    #[serde(rename = "gte")]
    Gte,
    #[serde(rename = "in")]
    In,
    #[serde(rename = "set")]
    Set,
    #[serde(rename = "unset")]
    Unset,
}
impl ::std::fmt::Display for FieldConditionOp {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Eq => f.write_str("eq"),
            Self::Ne => f.write_str("ne"),
            Self::Lt => f.write_str("lt"),
            Self::Lte => f.write_str("lte"),
            Self::Gt => f.write_str("gt"),
            Self::Gte => f.write_str("gte"),
            Self::In => f.write_str("in"),
            Self::Set => f.write_str("set"),
            Self::Unset => f.write_str("unset"),
        }
    }
}
impl ::std::str::FromStr for FieldConditionOp {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "eq" => Ok(Self::Eq),
            "ne" => Ok(Self::Ne),
            "lt" => Ok(Self::Lt),
            "lte" => Ok(Self::Lte),
            "gt" => Ok(Self::Gt),
            "gte" => Ok(Self::Gte),
            "in" => Ok(Self::In),
            "set" => Ok(Self::Set),
            "unset" => Ok(Self::Unset),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FieldConditionOp {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldConditionOp {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`FieldConditionValue`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FieldConditionValue(::std::string::String);
impl ::std::ops::Deref for FieldConditionValue {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FieldConditionValue> for ::std::string::String {
    fn from(value: FieldConditionValue) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FieldConditionValue {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 100usize {
            return Err("longer than 100 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FieldConditionValue {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldConditionValue {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FieldConditionValue {
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
#[doc = "`FieldConditionValuesItem`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FieldConditionValuesItem(::std::string::String);
impl ::std::ops::Deref for FieldConditionValuesItem {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FieldConditionValuesItem> for ::std::string::String {
    fn from(value: FieldConditionValuesItem) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FieldConditionValuesItem {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 100usize {
            return Err("longer than 100 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FieldConditionValuesItem {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldConditionValuesItem {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FieldConditionValuesItem {
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
#[doc = "RFC-0041: one typed custom field of a collection, discriminated by `type`."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum FieldDefinition {
    #[doc = "TextField\n\nPlain text: a string of at most maxLength characters."]
    #[serde(rename = "text")]
    Text {
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[doc = "Absent: 5000."]
        #[serde(
            rename = "maxLength",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        max_length: ::std::option::Option<::std::num::NonZeroU64>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
        #[doc = "Line breaks allowed. Absent: false."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        multiline: ::std::option::Option<bool>,
        #[doc = "An entry in review or published needs a value. Absent: false."]
        #[serde(
            rename = "requiredToPublish",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        required_to_publish: ::std::option::Option<bool>,
        #[doc = "Its words go into site search. Absent: false."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        searchable: ::std::option::Option<bool>,
    },
    #[doc = "RichTextField\n\nCloudhal Markdown v1 (ADR-0028), at most 50 000 characters."]
    #[serde(rename = "richText")]
    RichText {
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
        #[doc = "An entry in review or published needs a value. Absent: false."]
        #[serde(
            rename = "requiredToPublish",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        required_to_publish: ::std::option::Option<bool>,
        #[doc = "Its words go into site search. Absent: false."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        searchable: ::std::option::Option<bool>,
    },
    #[doc = "NumberField\n\nA finite number."]
    #[serde(rename = "number")]
    Number {
        #[doc = "Whole numbers only. Absent: false."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        integer: ::std::option::Option<bool>,
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        maximum: ::std::option::Option<f64>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        minimum: ::std::option::Option<f64>,
        #[doc = "An entry in review or published needs a value. Absent: false."]
        #[serde(
            rename = "requiredToPublish",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        required_to_publish: ::std::option::Option<bool>,
    },
    #[doc = "BooleanField\n\ntrue or false; absent reads as false, so it cannot be required to publish."]
    #[serde(rename = "boolean")]
    Boolean {
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
    },
    #[doc = "DateField\n\nA calendar day without a zone (YYYY-MM-DD)."]
    #[serde(rename = "date")]
    Date {
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
        #[doc = "An entry in review or published needs a value. Absent: false."]
        #[serde(
            rename = "requiredToPublish",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        required_to_publish: ::std::option::Option<bool>,
    },
    #[doc = "DateTimeField\n\nAn instant with the zone it was entered in: {at, timeZone} (RFC-0008 §9.1)."]
    #[serde(rename = "datetime")]
    Datetime {
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
        #[doc = "An entry in review or published needs a value. Absent: false."]
        #[serde(
            rename = "requiredToPublish",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        required_to_publish: ::std::option::Option<bool>,
    },
    #[doc = "UrlField\n\nA link: https, http, mailto, tel, a site-relative path or a #fragment; at most 2048 characters."]
    #[serde(rename = "url")]
    Url {
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
        #[doc = "An entry in review or published needs a value. Absent: false."]
        #[serde(
            rename = "requiredToPublish",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        required_to_publish: ::std::option::Option<bool>,
    },
    #[doc = "ImageField\n\nAn image Asset of the same site, by id (asset_…)."]
    #[serde(rename = "image")]
    Image {
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
        #[doc = "An entry in review or published needs a value. Absent: false."]
        #[serde(
            rename = "requiredToPublish",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        required_to_publish: ::std::option::Option<bool>,
    },
    #[doc = "SelectField\n\nOne of a closed list of options, or several when multiple."]
    #[serde(rename = "select")]
    Select {
        key: FieldKey,
        labels: FieldLabels,
        #[doc = "true: each language version has its own value (missing reads the original's); false: only the translation group's original holds it."]
        localized: bool,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        migration: ::std::option::Option<FieldMigration>,
        #[doc = "The value is a list of option values. Absent: false."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        multiple: ::std::option::Option<bool>,
        options: ::std::vec::Vec<FieldOption>,
        #[doc = "An entry in review or published needs a value. Absent: false."]
        #[serde(
            rename = "requiredToPublish",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        required_to_publish: ::std::option::Option<bool>,
    },
}
#[doc = "The field's key in ContentEntry.fields: lower camelCase, a JavaScript identifier. Unique in its collection; built-in entry property names are reserved (checked in code)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FieldKey(::std::string::String);
impl ::std::ops::Deref for FieldKey {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FieldKey> for ::std::string::String {
    fn from(value: FieldKey) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FieldKey {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z][A-Za-z0-9]{0,39}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z][A-Za-z0-9]{0,39}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FieldKey {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldKey {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FieldKey {
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
#[doc = "`FieldLabel`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FieldLabel {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub help: ::std::option::Option<FieldLabelHelp>,
    pub label: FieldLabelLabel,
}
#[doc = "`FieldLabelHelp`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FieldLabelHelp(::std::string::String);
impl ::std::ops::Deref for FieldLabelHelp {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FieldLabelHelp> for ::std::string::String {
    fn from(value: FieldLabelHelp) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FieldLabelHelp {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 300usize {
            return Err("longer than 300 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FieldLabelHelp {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldLabelHelp {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FieldLabelHelp {
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
#[doc = "`FieldLabelLabel`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FieldLabelLabel(::std::string::String);
impl ::std::ops::Deref for FieldLabelLabel {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FieldLabelLabel> for ::std::string::String {
    fn from(value: FieldLabelLabel) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FieldLabelLabel {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 100usize {
            return Err("longer than 100 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FieldLabelLabel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldLabelLabel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FieldLabelLabel {
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
#[doc = "The field's label and help per locale. Missing a locale: the default locale's, then the key."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct FieldLabels(pub ::std::collections::HashMap<Locale, FieldLabel>);
impl ::std::ops::Deref for FieldLabels {
    type Target = ::std::collections::HashMap<Locale, FieldLabel>;
    fn deref(&self) -> &::std::collections::HashMap<Locale, FieldLabel> {
        &self.0
    }
}
impl ::std::convert::From<FieldLabels> for ::std::collections::HashMap<Locale, FieldLabel> {
    fn from(value: FieldLabels) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::collections::HashMap<Locale, FieldLabel>> for FieldLabels {
    fn from(value: ::std::collections::HashMap<Locale, FieldLabel>) -> Self {
        Self(value)
    }
}
#[doc = "RFC-0041 §6: present only while a field operation rewrites entries."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FieldMigration {
    #[serde(
        rename = "fromKey",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub from_key: ::std::option::Option<FieldKey>,
    #[serde(
        rename = "fromLocalized",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub from_localized: ::std::option::Option<bool>,
    #[serde(
        rename = "fromType",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub from_type: ::std::option::Option<FieldMigrationFromType>,
    #[doc = "The operation's \"before\" snapshot."]
    pub id: Id,
}
#[doc = "`FieldMigrationFromType`"]
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
pub enum FieldMigrationFromType {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "richText")]
    RichText,
    #[serde(rename = "number")]
    Number,
    #[serde(rename = "boolean")]
    Boolean,
    #[serde(rename = "date")]
    Date,
    #[serde(rename = "datetime")]
    Datetime,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "select")]
    Select,
}
impl ::std::fmt::Display for FieldMigrationFromType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Text => f.write_str("text"),
            Self::RichText => f.write_str("richText"),
            Self::Number => f.write_str("number"),
            Self::Boolean => f.write_str("boolean"),
            Self::Date => f.write_str("date"),
            Self::Datetime => f.write_str("datetime"),
            Self::Url => f.write_str("url"),
            Self::Image => f.write_str("image"),
            Self::Select => f.write_str("select"),
        }
    }
}
impl ::std::str::FromStr for FieldMigrationFromType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "text" => Ok(Self::Text),
            "richText" => Ok(Self::RichText),
            "number" => Ok(Self::Number),
            "boolean" => Ok(Self::Boolean),
            "date" => Ok(Self::Date),
            "datetime" => Ok(Self::Datetime),
            "url" => Ok(Self::Url),
            "image" => Ok(Self::Image),
            "select" => Ok(Self::Select),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FieldMigrationFromType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldMigrationFromType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "One option of a select field. Values are unique in the field (checked in code)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FieldOption {
    pub labels: ::std::collections::HashMap<Locale, FieldOptionLabelsValue>,
    #[doc = "Stored in entries, never shown."]
    pub value: Slug,
}
#[doc = "`FieldOptionLabelsValue`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FieldOptionLabelsValue(::std::string::String);
impl ::std::ops::Deref for FieldOptionLabelsValue {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FieldOptionLabelsValue> for ::std::string::String {
    fn from(value: FieldOptionLabelsValue) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FieldOptionLabelsValue {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 100usize {
            return Err("longer than 100 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FieldOptionLabelsValue {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldOptionLabelsValue {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FieldOptionLabelsValue {
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
#[doc = "RFC-0042: order a listing by a number, date or datetime field. Entries without a value sort last."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FieldOrder {
    pub direction: FieldOrderDirection,
    #[doc = "A field key (site.schema.json FieldKey's pattern, repeated)."]
    pub field: FieldOrderField,
}
#[doc = "`FieldOrderDirection`"]
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
pub enum FieldOrderDirection {
    #[serde(rename = "asc")]
    Asc,
    #[serde(rename = "desc")]
    Desc,
}
impl ::std::fmt::Display for FieldOrderDirection {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Asc => f.write_str("asc"),
            Self::Desc => f.write_str("desc"),
        }
    }
}
impl ::std::str::FromStr for FieldOrderDirection {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "asc" => Ok(Self::Asc),
            "desc" => Ok(Self::Desc),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FieldOrderDirection {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldOrderDirection {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "A field key (site.schema.json FieldKey's pattern, repeated)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FieldOrderField(::std::string::String);
impl ::std::ops::Deref for FieldOrderField {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FieldOrderField> for ::std::string::String {
    fn from(value: FieldOrderField) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FieldOrderField {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z][A-Za-z0-9]{0,39}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z][A-Za-z0-9]{0,39}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FieldOrderField {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FieldOrderField {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FieldOrderField {
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
#[doc = "`FooterColumn`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FooterColumn {
    pub heading: FooterColumnHeading,
    #[doc = "A menu key (RFC-0003)."]
    pub menu: Slug,
}
#[doc = "`FooterColumnHeading`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct FooterColumnHeading(::std::string::String);
impl ::std::ops::Deref for FooterColumnHeading {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<FooterColumnHeading> for ::std::string::String {
    fn from(value: FooterColumnHeading) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for FooterColumnHeading {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 60usize {
            return Err("longer than 60 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for FooterColumnHeading {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FooterColumnHeading {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for FooterColumnHeading {
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
#[doc = "`HeaderAction`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct HeaderAction {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub href: ::std::option::Option<HeaderActionHref>,
    pub kind: HeaderActionKind,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub label: ::std::option::Option<HeaderActionLabel>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub variant: ::std::option::Option<HeaderActionVariant>,
}
#[doc = "`HeaderActionHref`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct HeaderActionHref(::std::string::String);
impl ::std::ops::Deref for HeaderActionHref {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<HeaderActionHref> for ::std::string::String {
    fn from(value: HeaderActionHref) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for HeaderActionHref {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2048usize {
            return Err("longer than 2048 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for HeaderActionHref {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for HeaderActionHref {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for HeaderActionHref {
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
#[doc = "`HeaderActionKind`"]
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
pub enum HeaderActionKind {
    #[serde(rename = "button")]
    Button,
    #[serde(rename = "search")]
    Search,
    #[serde(rename = "locale")]
    Locale,
    #[serde(rename = "theme-toggle")]
    ThemeToggle,
    #[serde(rename = "motion-toggle")]
    MotionToggle,
}
impl ::std::fmt::Display for HeaderActionKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Button => f.write_str("button"),
            Self::Search => f.write_str("search"),
            Self::Locale => f.write_str("locale"),
            Self::ThemeToggle => f.write_str("theme-toggle"),
            Self::MotionToggle => f.write_str("motion-toggle"),
        }
    }
}
impl ::std::str::FromStr for HeaderActionKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "button" => Ok(Self::Button),
            "search" => Ok(Self::Search),
            "locale" => Ok(Self::Locale),
            "theme-toggle" => Ok(Self::ThemeToggle),
            "motion-toggle" => Ok(Self::MotionToggle),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for HeaderActionKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for HeaderActionKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`HeaderActionLabel`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct HeaderActionLabel(::std::string::String);
impl ::std::ops::Deref for HeaderActionLabel {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<HeaderActionLabel> for ::std::string::String {
    fn from(value: HeaderActionLabel) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for HeaderActionLabel {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 40usize {
            return Err("longer than 40 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for HeaderActionLabel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for HeaderActionLabel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for HeaderActionLabel {
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
#[doc = "`HeaderActionVariant`"]
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
pub enum HeaderActionVariant {
    #[serde(rename = "primary")]
    Primary,
    #[serde(rename = "secondary")]
    Secondary,
}
impl ::std::fmt::Display for HeaderActionVariant {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Primary => f.write_str("primary"),
            Self::Secondary => f.write_str("secondary"),
        }
    }
}
impl ::std::str::FromStr for HeaderActionVariant {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "primary" => Ok(Self::Primary),
            "secondary" => Ok(Self::Secondary),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for HeaderActionVariant {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for HeaderActionVariant {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
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
#[doc = "Reference to an image. With `assetId` the image is an Asset node (RFC-0004): the store writes its media URL into `src`, and its size into `width` and `height`, as a fallback for readers that do not resolve assets. Without it, `src` is a relative path or an absolute URL, as before."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ImageRef {
    pub alt: ImageRefAlt,
    #[doc = "The Asset node shown (RFC-0004). Renderers that know assets resolve it and ignore `src`."]
    #[serde(
        rename = "assetId",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub asset_id: ::std::option::Option<Id>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub height: ::std::option::Option<::std::num::NonZeroU64>,
    pub src: ImageRefSrc,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub width: ::std::option::Option<::std::num::NonZeroU64>,
}
#[doc = "`ImageRefAlt`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ImageRefAlt(::std::string::String);
impl ::std::ops::Deref for ImageRefAlt {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ImageRefAlt> for ::std::string::String {
    fn from(value: ImageRefAlt) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ImageRefAlt {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 500usize {
            return Err("longer than 500 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ImageRefAlt {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ImageRefAlt {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ImageRefAlt {
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
#[doc = "`ImageRefSrc`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ImageRefSrc(::std::string::String);
impl ::std::ops::Deref for ImageRefSrc {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ImageRefSrc> for ::std::string::String {
    fn from(value: ImageRefSrc) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ImageRefSrc {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2048usize {
            return Err("longer than 2048 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ImageRefSrc {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ImageRefSrc {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ImageRefSrc {
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
#[doc = "`Link`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Link {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub external: ::std::option::Option<bool>,
    pub href: LinkHref,
    pub label: LinkLabel,
}
#[doc = "`LinkHref`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct LinkHref(::std::string::String);
impl ::std::ops::Deref for LinkHref {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<LinkHref> for ::std::string::String {
    fn from(value: LinkHref) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for LinkHref {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2048usize {
            return Err("longer than 2048 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for LinkHref {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LinkHref {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for LinkHref {
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
#[doc = "`LinkLabel`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct LinkLabel(::std::string::String);
impl ::std::ops::Deref for LinkLabel {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<LinkLabel> for ::std::string::String {
    fn from(value: LinkLabel) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for LinkLabel {
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
impl ::std::convert::TryFrom<&str> for LinkLabel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LinkLabel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for LinkLabel {
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
#[doc = "How the site serves its locales (RFC-0033 §2). Absent fields mean: prefix-except-default routing, no fallback, no required review, the machine-translation notice until reviewed."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Localization {
    #[doc = "Optional hostname per locale; that locale is then served at the host's root."]
    #[serde(
        default,
        skip_serializing_if = ":: std :: collections :: HashMap::is_empty"
    )]
    pub domains: ::std::collections::HashMap<Locale, LocalizationDomainsValue>,
    #[doc = "none: a missing translation is not found. default-with-notice: the default locale's page is served with a notice and noindex."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub fallback: ::std::option::Option<LocalizationFallback>,
    #[doc = "When readers see the machine-translation notice: unreviewed (until a person reviews) or always."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub label: ::std::option::Option<LocalizationLabel>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub review: ::std::option::Option<LocalizationReview>,
    #[doc = "prefix-except-default: the default locale at the root, the others under /<locale>/. prefix-all: every locale prefixed, / is a language chooser (x-default)."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub routing: ::std::option::Option<LocalizationRouting>,
}
#[doc = "`LocalizationDomainsValue`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct LocalizationDomainsValue(::std::string::String);
impl ::std::ops::Deref for LocalizationDomainsValue {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<LocalizationDomainsValue> for ::std::string::String {
    fn from(value: LocalizationDomainsValue) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for LocalizationDomainsValue {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 253usize {
            return Err("longer than 253 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$")
                    .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for LocalizationDomainsValue {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LocalizationDomainsValue {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for LocalizationDomainsValue {
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
#[doc = "none: a missing translation is not found. default-with-notice: the default locale's page is served with a notice and noindex."]
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
pub enum LocalizationFallback {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "default-with-notice")]
    DefaultWithNotice,
}
impl ::std::fmt::Display for LocalizationFallback {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::None => f.write_str("none"),
            Self::DefaultWithNotice => f.write_str("default-with-notice"),
        }
    }
}
impl ::std::str::FromStr for LocalizationFallback {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "none" => Ok(Self::None),
            "default-with-notice" => Ok(Self::DefaultWithNotice),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for LocalizationFallback {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LocalizationFallback {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "When readers see the machine-translation notice: unreviewed (until a person reviews) or always."]
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
pub enum LocalizationLabel {
    #[serde(rename = "unreviewed")]
    Unreviewed,
    #[serde(rename = "always")]
    Always,
}
impl ::std::fmt::Display for LocalizationLabel {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Unreviewed => f.write_str("unreviewed"),
            Self::Always => f.write_str("always"),
        }
    }
}
impl ::std::str::FromStr for LocalizationLabel {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "unreviewed" => Ok(Self::Unreviewed),
            "always" => Ok(Self::Always),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for LocalizationLabel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LocalizationLabel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "Collections whose machine translations need a person's review before they publish ('pages' stands for pages)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct LocalizationReview {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub required: ::std::option::Option<::std::vec::Vec<LocalizationReviewRequiredItem>>,
}
#[doc = "`LocalizationReviewRequiredItem`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct LocalizationReviewRequiredItem(::std::string::String);
impl ::std::ops::Deref for LocalizationReviewRequiredItem {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<LocalizationReviewRequiredItem> for ::std::string::String {
    fn from(value: LocalizationReviewRequiredItem) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for LocalizationReviewRequiredItem {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 100usize {
            return Err("longer than 100 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for LocalizationReviewRequiredItem {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LocalizationReviewRequiredItem {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for LocalizationReviewRequiredItem {
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
#[doc = "prefix-except-default: the default locale at the root, the others under /<locale>/. prefix-all: every locale prefixed, / is a language chooser (x-default)."]
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
pub enum LocalizationRouting {
    #[serde(rename = "prefix-except-default")]
    PrefixExceptDefault,
    #[serde(rename = "prefix-all")]
    PrefixAll,
}
impl ::std::fmt::Display for LocalizationRouting {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PrefixExceptDefault => f.write_str("prefix-except-default"),
            Self::PrefixAll => f.write_str("prefix-all"),
        }
    }
}
impl ::std::str::FromStr for LocalizationRouting {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "prefix-except-default" => Ok(Self::PrefixExceptDefault),
            "prefix-all" => Ok(Self::PrefixAll),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for LocalizationRouting {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for LocalizationRouting {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
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
#[doc = "Absolute URL path of a route the site owns: starts with '/', lower-case slug segments, no trailing slash except root."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct Path(::std::string::String);
impl ::std::ops::Deref for Path {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<Path> for ::std::string::String {
    fn from(value: Path) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for Path {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 1024usize {
            return Err("longer than 1024 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new(
                    "^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$",
                )
                .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for Path {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for Path {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for Path {
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
#[doc = "A block inside a page, discriminated by `kind`. Variants are written inline (not via $ref) and `kind` is a single-value string enum so that TypeScript gets a literal union and Rust gets a serde internally-tagged enum."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum Section {
    #[doc = "HeroSection"]
    #[serde(rename = "hero")]
    Hero {
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        cta: ::std::option::Option<Link>,
        heading: SectionHeading,
        id: Id,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        image: ::std::option::Option<ImageRef>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        subheading: ::std::option::Option<SectionSubheading>,
    },
    #[doc = "RichTextSection"]
    #[serde(rename = "richText")]
    RichText {
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        blocks: ::std::option::Option<BodyBlocks>,
        body: SectionBody,
        format: SectionFormat,
        id: Id,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        profile: ::std::option::Option<BodyProfile>,
    },
    #[doc = "ImageSection"]
    #[serde(rename = "image")]
    Image {
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        caption: ::std::option::Option<SectionCaption>,
        id: Id,
        image: ImageRef,
    },
    #[doc = "ContentListSection\n\nRenders the newest entries of a content collection (e.g. blog posts)."]
    #[serde(rename = "contentList")]
    ContentList {
        collection: Slug,
        #[doc = "Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        filter: ::std::option::Option<SectionFilter>,
        id: Id,
        limit: ::std::num::NonZeroU64,
        #[serde(
            rename = "orderBy",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        order_by: ::std::option::Option<FieldOrder>,
        sort: SectionSort,
        #[doc = "RFC-0042: conditions on the collection's list fields, ANDed."]
        #[serde(
            rename = "where",
            default,
            skip_serializing_if = "::std::vec::Vec::is_empty"
        )]
        where_: ::std::vec::Vec<FieldCondition>,
    },
    #[doc = "ComponentSection\n\nA typed block from the block registry (RFC-0015): `type` names a registered block type (one global namespace of English names), `props` follow that type's props schema, which the store validates."]
    #[serde(rename = "component")]
    Component {
        id: Id,
        #[doc = "Validated against the type's props schema by the store, not by this contract."]
        props: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
        #[serde(rename = "type")]
        type_: SectionType,
    },
    #[doc = "SurfaceSection\n\nA generative UI surface (RFC-0020): a flat list of catalog components with a `root`, plus a data model their props may bind to. Written and streamed by agents as data, never code; the store checks the tree, the catalog and the limits."]
    #[serde(rename = "surface")]
    Surface {
        #[doc = "The catalog the surface was written for: `<theme>@<major>` (RFC-0018 manifest)."]
        catalog: SectionCatalog,
        components: ::std::vec::Vec<SurfaceComponent>,
        #[doc = "The surface's data model: JSON its components bind to with `{path}` (at most 64 KB serialized; the store enforces the size)."]
        #[serde(default, skip_serializing_if = "::serde_json::Map::is_empty")]
        data: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
        id: Id,
    },
}
#[doc = "`SectionBody`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SectionBody(::std::string::String);
impl ::std::ops::Deref for SectionBody {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SectionBody> for ::std::string::String {
    fn from(value: SectionBody) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SectionBody {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 200000usize {
            return Err("longer than 200000 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SectionBody {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionBody {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SectionBody {
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
#[doc = "`SectionCaption`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SectionCaption(::std::string::String);
impl ::std::ops::Deref for SectionCaption {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SectionCaption> for ::std::string::String {
    fn from(value: SectionCaption) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SectionCaption {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 1000usize {
            return Err("longer than 1000 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SectionCaption {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionCaption {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SectionCaption {
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
#[doc = "The catalog the surface was written for: `<theme>@<major>` (RFC-0018 manifest)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SectionCatalog(::std::string::String);
impl ::std::ops::Deref for SectionCatalog {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SectionCatalog> for ::std::string::String {
    fn from(value: SectionCatalog) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SectionCatalog {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z][a-z0-9-]{0,40}@[0-9]{1,4}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z][a-z0-9-]{0,40}@[0-9]{1,4}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SectionCatalog {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionCatalog {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SectionCatalog {
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
#[doc = "Filter expression over term assignments (RFC-0002), e.g. 'category:news+tag:ai' or 'category:news>*'."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SectionFilter(::std::string::String);
impl ::std::ops::Deref for SectionFilter {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SectionFilter> for ::std::string::String {
    fn from(value: SectionFilter) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SectionFilter {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 512usize {
            return Err("longer than 512 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SectionFilter {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionFilter {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SectionFilter {
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
#[doc = "`SectionFormat`"]
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
pub enum SectionFormat {
    #[serde(rename = "markdown")]
    Markdown,
    #[serde(rename = "html")]
    Html,
}
impl ::std::fmt::Display for SectionFormat {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Markdown => f.write_str("markdown"),
            Self::Html => f.write_str("html"),
        }
    }
}
impl ::std::str::FromStr for SectionFormat {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "markdown" => Ok(Self::Markdown),
            "html" => Ok(Self::Html),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SectionFormat {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionFormat {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SectionHeading`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SectionHeading(::std::string::String);
impl ::std::ops::Deref for SectionHeading {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SectionHeading> for ::std::string::String {
    fn from(value: SectionHeading) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SectionHeading {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 300usize {
            return Err("longer than 300 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SectionHeading {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionHeading {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SectionHeading {
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
#[doc = "`SectionSort`"]
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
pub enum SectionSort {
    #[serde(rename = "newest")]
    Newest,
    #[serde(rename = "oldest")]
    Oldest,
    #[serde(rename = "title")]
    Title,
}
impl ::std::fmt::Display for SectionSort {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Newest => f.write_str("newest"),
            Self::Oldest => f.write_str("oldest"),
            Self::Title => f.write_str("title"),
        }
    }
}
impl ::std::str::FromStr for SectionSort {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "newest" => Ok(Self::Newest),
            "oldest" => Ok(Self::Oldest),
            "title" => Ok(Self::Title),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SectionSort {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionSort {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SectionSubheading`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SectionSubheading(::std::string::String);
impl ::std::ops::Deref for SectionSubheading {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SectionSubheading> for ::std::string::String {
    fn from(value: SectionSubheading) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SectionSubheading {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 1000usize {
            return Err("longer than 1000 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SectionSubheading {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionSubheading {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SectionSubheading {
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
#[doc = "`SectionType`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SectionType(::std::string::String);
impl ::std::ops::Deref for SectionType {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SectionType> for ::std::string::String {
    fn from(value: SectionType) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SectionType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[a-z][a-z0-9-]{1,40}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z][a-z0-9-]{1,40}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SectionType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SectionType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SectionType {
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
#[doc = "Root node of a Site Graph: one deployable website with its locales, domains, theme and page index. Pages and content entries are separate nodes referenced by id so they can be versioned and locked independently."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Site {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub brand: ::std::option::Option<Brand>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub chrome: ::std::option::Option<Chrome>,
    #[doc = "RFC-0038, RFC-0040: the site's declared collections and their settings, keyed by collection (ContentEntry.collection). A key here declares the collection, even with no settings ({}). A collection with entries but no key is inferred and uses the defaults."]
    #[serde(
        default,
        skip_serializing_if = ":: std :: collections :: HashMap::is_empty"
    )]
    pub collections: ::std::collections::HashMap<Slug, CollectionSettings>,
    #[serde(rename = "createdAt")]
    pub created_at: Timestamp,
    #[serde(rename = "defaultLocale")]
    pub default_locale: Locale,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub design: ::std::option::Option<Design>,
    #[doc = "Hostnames serving this site. Exactly one should be primary: the address canonical links, feeds and previews use. Sites run on their own domains or their Cloudflare account's workers.dev address, never on a Cloudhal domain (ADR-0037)."]
    pub domains: ::std::vec::Vec<Domain>,
    #[serde(
        rename = "homePageId",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub home_page_id: ::std::option::Option<Id>,
    pub id: Id,
    pub locales: ::std::vec::Vec<Locale>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub localization: ::std::option::Option<Localization>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub metadata: ::std::option::Option<Metadata>,
    pub name: SiteName,
    #[serde(rename = "pageIds")]
    pub page_ids: ::std::vec::Vec<Id>,
    #[serde(rename = "projectId")]
    pub project_id: Id,
    #[doc = "Snapshot currently serving production. Rollback = pointing this at an older snapshot."]
    #[serde(
        rename = "publishedSnapshotId",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub published_snapshot_id: ::std::option::Option<Id>,
    pub rev: Revision,
    #[serde(rename = "schemaVersion")]
    pub schema_version: SchemaVersion,
    pub slug: Slug,
    pub theme: ThemeRef,
    #[doc = "The site's time zone (RFC-0008): Studio's calendar, schedules entered as wall-clock times and recurring automations use it. Absent means UTC."]
    #[serde(
        rename = "timeZone",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub time_zone: ::std::option::Option<TimeZone>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Timestamp,
}
#[doc = "`SiteName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SiteName(::std::string::String);
impl ::std::ops::Deref for SiteName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SiteName> for ::std::string::String {
    fn from(value: SiteName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SiteName {
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
impl ::std::convert::TryFrom<&str> for SiteName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SiteName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SiteName {
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
#[doc = "RFC-0042: site properties a structured-data property may read."]
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
pub enum SiteValueProperty {
    #[serde(rename = "name")]
    Name,
    #[serde(rename = "url")]
    Url,
    #[serde(rename = "logo")]
    Logo,
}
impl ::std::fmt::Display for SiteValueProperty {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Name => f.write_str("name"),
            Self::Url => f.write_str("url"),
            Self::Logo => f.write_str("logo"),
        }
    }
}
impl ::std::str::FromStr for SiteValueProperty {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "name" => Ok(Self::Name),
            "url" => Ok(Self::Url),
            "logo" => Ok(Self::Logo),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SiteValueProperty {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SiteValueProperty {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
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
#[doc = "`SocialLink`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SocialLink {
    pub href: SocialLinkHref,
    pub network: SocialLinkNetwork,
}
#[doc = "`SocialLinkHref`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SocialLinkHref(::std::string::String);
impl ::std::ops::Deref for SocialLinkHref {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SocialLinkHref> for ::std::string::String {
    fn from(value: SocialLinkHref) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SocialLinkHref {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2048usize {
            return Err("longer than 2048 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SocialLinkHref {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SocialLinkHref {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SocialLinkHref {
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
#[doc = "`SocialLinkNetwork`"]
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
pub enum SocialLinkNetwork {
    #[serde(rename = "x")]
    X,
    #[serde(rename = "bluesky")]
    Bluesky,
    #[serde(rename = "mastodon")]
    Mastodon,
    #[serde(rename = "github")]
    Github,
    #[serde(rename = "linkedin")]
    Linkedin,
    #[serde(rename = "instagram")]
    Instagram,
    #[serde(rename = "facebook")]
    Facebook,
    #[serde(rename = "youtube")]
    Youtube,
    #[serde(rename = "tiktok")]
    Tiktok,
    #[serde(rename = "threads")]
    Threads,
    #[serde(rename = "rss")]
    Rss,
    #[serde(rename = "email")]
    Email,
}
impl ::std::fmt::Display for SocialLinkNetwork {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::X => f.write_str("x"),
            Self::Bluesky => f.write_str("bluesky"),
            Self::Mastodon => f.write_str("mastodon"),
            Self::Github => f.write_str("github"),
            Self::Linkedin => f.write_str("linkedin"),
            Self::Instagram => f.write_str("instagram"),
            Self::Facebook => f.write_str("facebook"),
            Self::Youtube => f.write_str("youtube"),
            Self::Tiktok => f.write_str("tiktok"),
            Self::Threads => f.write_str("threads"),
            Self::Rss => f.write_str("rss"),
            Self::Email => f.write_str("email"),
        }
    }
}
impl ::std::str::FromStr for SocialLinkNetwork {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "x" => Ok(Self::X),
            "bluesky" => Ok(Self::Bluesky),
            "mastodon" => Ok(Self::Mastodon),
            "github" => Ok(Self::Github),
            "linkedin" => Ok(Self::Linkedin),
            "instagram" => Ok(Self::Instagram),
            "facebook" => Ok(Self::Facebook),
            "youtube" => Ok(Self::Youtube),
            "tiktok" => Ok(Self::Tiktok),
            "threads" => Ok(Self::Threads),
            "rss" => Ok(Self::Rss),
            "email" => Ok(Self::Email),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SocialLinkNetwork {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SocialLinkNetwork {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "RFC-0042: the JSON-LD type an entry page emits in place of BlogPosting, with its properties mapped to value sources. Paths, fitting field types and required properties are a closed table in code (@cloudhal/core-ts/structured-data)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct StructuredDataPreset {
    #[doc = "Keyed by property path, e.g. startDate or location.address.addressLocality."]
    pub properties:
        ::std::collections::HashMap<StructuredDataPresetPropertiesKey, StructuredDataSource>,
    #[serde(rename = "type")]
    pub type_: StructuredDataPresetType,
}
#[doc = "`StructuredDataPresetPropertiesKey`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct StructuredDataPresetPropertiesKey(::std::string::String);
impl ::std::ops::Deref for StructuredDataPresetPropertiesKey {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<StructuredDataPresetPropertiesKey> for ::std::string::String {
    fn from(value: StructuredDataPresetPropertiesKey) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for StructuredDataPresetPropertiesKey {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z][A-Za-z]{0,39}(\\.[a-z][A-Za-z]{0,39}){0,2}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err(
                "doesn't match pattern \"^[a-z][A-Za-z]{0,39}(\\.[a-z][A-Za-z]{0,39}){0,2}$\""
                    .into(),
            );
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for StructuredDataPresetPropertiesKey {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StructuredDataPresetPropertiesKey {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for StructuredDataPresetPropertiesKey {
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
#[doc = "`StructuredDataPresetType`"]
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
pub enum StructuredDataPresetType {
    Event,
    JobPosting,
    Product,
    Recipe,
}
impl ::std::fmt::Display for StructuredDataPresetType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Event => f.write_str("Event"),
            Self::JobPosting => f.write_str("JobPosting"),
            Self::Product => f.write_str("Product"),
            Self::Recipe => f.write_str("Recipe"),
        }
    }
}
impl ::std::str::FromStr for StructuredDataPresetType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "Event" => Ok(Self::Event),
            "JobPosting" => Ok(Self::JobPosting),
            "Product" => Ok(Self::Product),
            "Recipe" => Ok(Self::Recipe),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for StructuredDataPresetType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StructuredDataPresetType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "RFC-0042: where one JSON-LD property's value comes from, discriminated by `kind`."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum StructuredDataSource {
    #[doc = "FieldValueSource\n\nA typed field of this collection, converted by its type."]
    #[serde(rename = "field")]
    Field { field: FieldKey },
    #[doc = "EntryValueSource\n\nA built-in property of the entry."]
    #[serde(rename = "entry")]
    Entry { property: EntryValueProperty },
    #[doc = "SiteValueSource\n\nA property of the site."]
    #[serde(rename = "site")]
    Site { property: SiteValueProperty },
    #[doc = "TextValueSource\n\nA plain-text constant: no control characters, no markup meaning; vocabulary-checked on enum paths (in code)."]
    #[serde(rename = "text")]
    Text { value: StructuredDataSourceValue },
}
#[doc = "`StructuredDataSourceValue`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct StructuredDataSourceValue(::std::string::String);
impl ::std::ops::Deref for StructuredDataSourceValue {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<StructuredDataSourceValue> for ::std::string::String {
    fn from(value: StructuredDataSourceValue) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for StructuredDataSourceValue {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 200usize {
            return Err("longer than 200 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[^\\x00-\\x1F\\x7F]+$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[^\\x00-\\x1F\\x7F]+$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for StructuredDataSourceValue {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StructuredDataSourceValue {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for StructuredDataSourceValue {
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
#[doc = "One element of a generative UI surface (RFC-0020 §1), in a flat list: `component` names a catalog entry (a PascalCase built-in primitive such as `Stack`, or a registry block type such as `callout`), `children` refer to other ids of the same surface, and `props` follow the entry's schema, which the store checks. Field names follow A2UI v0.9."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SurfaceComponent {
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub children: ::std::vec::Vec<SurfaceComponentId>,
    pub component: SurfaceComponentComponent,
    pub id: SurfaceComponentId,
    #[doc = "Motion presets for this component (RFC-0024 §2): `reveal`, `hover`, `speed`, `delay`, `stagger`, `replay` and later `scroll`, `loop`; enums and clamped numbers only, validated by the store against the catalog. The renderer turns them into CSS; agents never write CSS."]
    #[serde(default, skip_serializing_if = "::serde_json::Map::is_empty")]
    pub motion: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
    #[doc = "Literal values, `{path}` bindings into the surface's data, or `{call}` named functions; validated by the store against the catalog, not by this contract."]
    #[serde(default, skip_serializing_if = "::serde_json::Map::is_empty")]
    pub props: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
    #[doc = "A visibility condition over the surface's data (`eq`, `ne`, `gt`, `lt`, `and`, `or`, `not`); validated by the store."]
    #[serde(default, skip_serializing_if = "::serde_json::Map::is_empty")]
    pub visible: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
}
#[doc = "`SurfaceComponentComponent`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SurfaceComponentComponent(::std::string::String);
impl ::std::ops::Deref for SurfaceComponentComponent {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SurfaceComponentComponent> for ::std::string::String {
    fn from(value: SurfaceComponentComponent) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SurfaceComponentComponent {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^(?:[A-Z][A-Za-z0-9]{1,40}|[a-z][a-z0-9-]{1,40})$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err(
                "doesn't match pattern \"^(?:[A-Z][A-Za-z0-9]{1,40}|[a-z][a-z0-9-]{1,40})$\""
                    .into(),
            );
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SurfaceComponentComponent {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SurfaceComponentComponent {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SurfaceComponentComponent {
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
#[doc = "A component's id, unique within its surface; `root` is the tree's root (RFC-0020 §1)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SurfaceComponentId(::std::string::String);
impl ::std::ops::Deref for SurfaceComponentId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SurfaceComponentId> for ::std::string::String {
    fn from(value: SurfaceComponentId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SurfaceComponentId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[a-z][a-z0-9-]{0,40}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z][a-z0-9-]{0,40}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SurfaceComponentId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SurfaceComponentId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SurfaceComponentId {
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
#[doc = "Theme (a.k.a. Experience) applied by the renderer. Config is theme-defined and validated by the theme's own schema, not here."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ThemeRef {
    #[serde(default, skip_serializing_if = "::serde_json::Map::is_empty")]
    pub config: ::serde_json::Map<::std::string::String, ::serde_json::Value>,
    pub name: Slug,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub version: ::std::option::Option<ThemeRefVersion>,
}
#[doc = "`ThemeRefVersion`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct ThemeRefVersion(::std::string::String);
impl ::std::ops::Deref for ThemeRefVersion {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<ThemeRefVersion> for ::std::string::String {
    fn from(value: ThemeRefVersion) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for ThemeRefVersion {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 64usize {
            return Err("longer than 64 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for ThemeRefVersion {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ThemeRefVersion {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for ThemeRefVersion {
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
