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
#[doc = "A reader comment on a published content entry, as stored in D1 (outside the site graph), returned to people and agents, and exported (RFC-0007). It is not a graph node: it never enters a snapshot, a diff or a site bundle, and a content rollback never changes it. The record carries no personal data beyond the display name the commenter chose: an email address, an IP address or its hash, a user agent and a proof-of-work challenge live in separate columns and tables that this contract cannot express (additionalProperties: false), so no reader of the contract — Studio lists, MCP tools, exports — can leak them. Text is plain text; renderers escape it and turn only https links into anchors with rel=\"ugc nofollow noopener noreferrer\"."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Comment {
    pub author: CommentAuthor,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub body: ::std::option::Option<CommentBody>,
    #[serde(rename = "createdAt")]
    pub created_at: Timestamp,
    #[doc = "Set when the text changed after it was first stored (v1.1 edit window; staff replies edited in Studio)."]
    #[serde(
        rename = "editedAt",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub edited_at: ::std::option::Option<Timestamp>,
    pub id: CommentId,
    #[doc = "The comment this one answers when that is not `parentId` itself (a reply to a reply). Only with `parentId`, in the same thread."]
    #[serde(
        rename = "inReplyToId",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub in_reply_to_id: ::std::option::Option<CommentId>,
    #[doc = "Advisory labels from rules, classifiers, agents and people. Labels never change what readers see; only a status change does."]
    #[serde(default, skip_serializing_if = "::std::vec::Vec::is_empty")]
    pub labels: ::std::vec::Vec<CommentLabel>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub moderation: ::std::option::Option<CommentModeration>,
    #[doc = "The content entry the comment belongs to, by id, so threads survive slug changes (RFC-0002)."]
    #[serde(rename = "nodeId")]
    pub node_id: Id,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub origin: ::std::option::Option<CommentOrigin>,
    #[doc = "The comment this one is nested under for display. Absent for a top-level comment. In v1 the tree is two levels deep: a parent is always top-level, and a reply to a reply is nested under the same top-level comment with `inReplyToId` pointing at the comment it answers."]
    #[serde(
        rename = "parentId",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub parent_id: ::std::option::Option<CommentId>,
    pub rev: Revision,
    #[serde(rename = "schemaVersion")]
    pub schema_version: SchemaVersion,
    #[serde(rename = "siteId")]
    pub site_id: Id,
    #[doc = "Where the comment came from: `native` (the site's own form or Studio), `import` (an importer; see `origin`). `webmention` and `activitypub` are reserved for later RFCs and are refused by v1 writers."]
    pub source: CommentSource,
    pub status: CommentStatus,
}
#[doc = "Who wrote the comment, discriminated by `kind`. There is deliberately no email, address or account handle here."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum CommentAuthor {
    #[doc = "GuestCommentAuthor\n\nA guest: only the display name they typed. Guest comments are always held for moderation in v1."]
    #[serde(rename = "guest")]
    Guest { name: CommentDisplayName },
    #[doc = "ReaderCommentAuthor\n\nA verified reader (v1.1: email code or magic link on the site's own host). `readerId` is the site's reader account id, never the email."]
    #[serde(rename = "reader")]
    Reader {
        name: CommentDisplayName,
        #[serde(rename = "readerId")]
        reader_id: Id,
    },
    #[doc = "StaffCommentAuthor\n\nA reply on the site's behalf. It is always attributed to a person (`personId` is a staff actor id, `user_…`): an agent may draft the text (`draftedBy`), but a person approved it. `draftedBy` names the agent that drafted the text, when one did (shown in Studio and the audit, not on the public page)."]
    #[serde(rename = "staff")]
    Staff {
        #[doc = "What the public page shows next to the name: `author` when the person wrote the entry, otherwise `team`."]
        badge: CommentAuthorBadge,
        #[serde(
            rename = "draftedBy",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        drafted_by: ::std::option::Option<Actor>,
        name: CommentDisplayName,
        #[doc = "The person who wrote or approved the reply."]
        #[serde(rename = "personId")]
        person_id: CommentAuthorPersonId,
    },
    #[serde(rename = "erased")]
    Erased,
}
#[doc = "What the public page shows next to the name: `author` when the person wrote the entry, otherwise `team`."]
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
pub enum CommentAuthorBadge {
    #[serde(rename = "author")]
    Author,
    #[serde(rename = "team")]
    Team,
}
impl ::std::fmt::Display for CommentAuthorBadge {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Author => f.write_str("author"),
            Self::Team => f.write_str("team"),
        }
    }
}
impl ::std::str::FromStr for CommentAuthorBadge {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "author" => Ok(Self::Author),
            "team" => Ok(Self::Team),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentAuthorBadge {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentAuthorBadge {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "The person who wrote or approved the reply."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentAuthorPersonId(::std::string::String);
impl ::std::ops::Deref for CommentAuthorPersonId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentAuthorPersonId> for ::std::string::String {
    fn from(value: CommentAuthorPersonId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentAuthorPersonId {
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
impl ::std::convert::TryFrom<&str> for CommentAuthorPersonId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentAuthorPersonId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentAuthorPersonId {
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
#[doc = "The comment text. v1 has only `text`: plain text with line breaks, no markup. A later RFC may add a restricted Markdown format. Absent only when the text was deleted (status `deleted`, or an erasure that removed the text); the record then stays as a tombstone while approved replies hang under it."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CommentBody {
    pub format: CommentBodyFormat,
    #[doc = "NFC-normalised, CRLF turned into LF, trimmed: 1 to 5,000 characters. Tabs and line feeds are the only control characters allowed; bidirectional overrides are refused so a comment cannot disguise itself in Studio."]
    pub text: CommentBodyText,
}
#[doc = "`CommentBodyFormat`"]
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
pub enum CommentBodyFormat {
    #[serde(rename = "text")]
    Text,
}
impl ::std::fmt::Display for CommentBodyFormat {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Text => f.write_str("text"),
        }
    }
}
impl ::std::str::FromStr for CommentBodyFormat {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "text" => Ok(Self::Text),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentBodyFormat {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentBodyFormat {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "NFC-normalised, CRLF turned into LF, trimmed: 1 to 5,000 characters. Tabs and line feeds are the only control characters allowed; bidirectional overrides are refused so a comment cannot disguise itself in Studio."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentBodyText(::std::string::String);
impl ::std::ops::Deref for CommentBodyText {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentBodyText> for ::std::string::String {
    fn from(value: CommentBodyText) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentBodyText {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 5000usize {
            return Err("longer than 5000 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new(
                    "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$",
                )
                .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]+$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentBodyText {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentBodyText {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentBodyText {
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
#[doc = "Plain text chosen by the commenter (or the staff member's name), NFC-normalised and trimmed by the server: 1 to 80 characters, no control characters, no bidirectional overrides, no surrounding whitespace."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentDisplayName(::std::string::String);
impl ::std::ops::Deref for CommentDisplayName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentDisplayName> for ::std::string::String {
    fn from(value: CommentDisplayName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentDisplayName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 80usize {
            return Err("longer than 80 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(
            || {
                :: regress :: Regex :: new ("^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$") . unwrap ()
            },
        );
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069](?:[^\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*[^\\s\\x00-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069])?$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentDisplayName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentDisplayName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentDisplayName {
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
#[doc = "A comment id: `cmt_` and 6 to 32 letters or digits."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentId(::std::string::String);
impl ::std::ops::Deref for CommentId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentId> for ::std::string::String {
    fn from(value: CommentId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^cmt_[A-Za-z0-9]{6,32}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^cmt_[A-Za-z0-9]{6,32}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentId {
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
#[doc = "An advisory label. `rule` labels come from the submission pipeline (word lists, link count, instruction-like text); `classifier` from an opt-in classifier (Workers AI, Akismet); `agent` from `label_comments`; `person` from Studio. `by` is the agent or person that set it (absent for rules and classifiers)."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CommentLabel {
    pub at: Timestamp,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub by: ::std::option::Option<Actor>,
    #[doc = "0 to 100, when the source reports one."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub confidence: ::std::option::Option<i64>,
    pub label: CommentLabelLabel,
    pub source: CommentLabelSource,
}
#[doc = "`CommentLabelLabel`"]
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
pub enum CommentLabelLabel {
    #[serde(rename = "spam-suspect")]
    SpamSuspect,
    #[serde(rename = "toxic")]
    Toxic,
    #[serde(rename = "off-topic")]
    OffTopic,
    #[serde(rename = "question")]
    Question,
    #[serde(rename = "needs-reply")]
    NeedsReply,
    #[serde(rename = "praise")]
    Praise,
    #[serde(rename = "personal-data")]
    PersonalData,
    #[serde(rename = "links")]
    Links,
    #[serde(rename = "watch-word")]
    WatchWord,
    #[serde(rename = "instruction-like")]
    InstructionLike,
}
impl ::std::fmt::Display for CommentLabelLabel {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SpamSuspect => f.write_str("spam-suspect"),
            Self::Toxic => f.write_str("toxic"),
            Self::OffTopic => f.write_str("off-topic"),
            Self::Question => f.write_str("question"),
            Self::NeedsReply => f.write_str("needs-reply"),
            Self::Praise => f.write_str("praise"),
            Self::PersonalData => f.write_str("personal-data"),
            Self::Links => f.write_str("links"),
            Self::WatchWord => f.write_str("watch-word"),
            Self::InstructionLike => f.write_str("instruction-like"),
        }
    }
}
impl ::std::str::FromStr for CommentLabelLabel {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "spam-suspect" => Ok(Self::SpamSuspect),
            "toxic" => Ok(Self::Toxic),
            "off-topic" => Ok(Self::OffTopic),
            "question" => Ok(Self::Question),
            "needs-reply" => Ok(Self::NeedsReply),
            "praise" => Ok(Self::Praise),
            "personal-data" => Ok(Self::PersonalData),
            "links" => Ok(Self::Links),
            "watch-word" => Ok(Self::WatchWord),
            "instruction-like" => Ok(Self::InstructionLike),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentLabelLabel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentLabelLabel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CommentLabelSource`"]
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
pub enum CommentLabelSource {
    #[serde(rename = "rule")]
    Rule,
    #[serde(rename = "classifier")]
    Classifier,
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "person")]
    Person,
}
impl ::std::fmt::Display for CommentLabelSource {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Rule => f.write_str("rule"),
            Self::Classifier => f.write_str("classifier"),
            Self::Agent => f.write_str("agent"),
            Self::Person => f.write_str("person"),
        }
    }
}
impl ::std::str::FromStr for CommentLabelSource {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "rule" => Ok(Self::Rule),
            "classifier" => Ok(Self::Classifier),
            "agent" => Ok(Self::Agent),
            "person" => Ok(Self::Person),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentLabelSource {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentLabelSource {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "The latest moderation decision, kept as a statement of reasons (EU DSA Art. 17). The full history is in `comment_events`. Approvals are always a person's decision; agents may only hide, mark as spam or hold."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CommentModeration {
    pub action: CommentModerationAction,
    pub actor: Actor,
    pub at: Timestamp,
    #[doc = "True when the decision was taken without a person (an agent, a rule or a ban), as a statement of reasons must say."]
    pub automated: bool,
    #[doc = "Free text from the moderator, plain text, at most 500 characters."]
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub note: ::std::option::Option<CommentModerationNote>,
    #[doc = "Required by writers for hide, spam, delete and erase."]
    #[serde(
        rename = "reasonCode",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub reason_code: ::std::option::Option<CommentModerationReasonCode>,
}
#[doc = "`CommentModerationAction`"]
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
pub enum CommentModerationAction {
    #[serde(rename = "approve")]
    Approve,
    #[serde(rename = "hide")]
    Hide,
    #[serde(rename = "spam")]
    Spam,
    #[serde(rename = "hold")]
    Hold,
    #[serde(rename = "restore")]
    Restore,
    #[serde(rename = "delete")]
    Delete,
    #[serde(rename = "erase")]
    Erase,
}
impl ::std::fmt::Display for CommentModerationAction {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Approve => f.write_str("approve"),
            Self::Hide => f.write_str("hide"),
            Self::Spam => f.write_str("spam"),
            Self::Hold => f.write_str("hold"),
            Self::Restore => f.write_str("restore"),
            Self::Delete => f.write_str("delete"),
            Self::Erase => f.write_str("erase"),
        }
    }
}
impl ::std::str::FromStr for CommentModerationAction {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "approve" => Ok(Self::Approve),
            "hide" => Ok(Self::Hide),
            "spam" => Ok(Self::Spam),
            "hold" => Ok(Self::Hold),
            "restore" => Ok(Self::Restore),
            "delete" => Ok(Self::Delete),
            "erase" => Ok(Self::Erase),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentModerationAction {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentModerationAction {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "Free text from the moderator, plain text, at most 500 characters."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentModerationNote(::std::string::String);
impl ::std::ops::Deref for CommentModerationNote {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentModerationNote> for ::std::string::String {
    fn from(value: CommentModerationNote) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentModerationNote {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 500usize {
            return Err("longer than 500 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new(
                    "^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$",
                )
                .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^[^\\x00-\\x08\\x0B-\\x1F\\x7F\\u202A-\\u202E\\u2066-\\u2069]*$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentModerationNote {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentModerationNote {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentModerationNote {
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
#[doc = "Required by writers for hide, spam, delete and erase."]
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
pub enum CommentModerationReasonCode {
    #[serde(rename = "spam")]
    Spam,
    #[serde(rename = "abuse")]
    Abuse,
    #[serde(rename = "off-topic")]
    OffTopic,
    #[serde(rename = "personal-data")]
    PersonalData,
    #[serde(rename = "illegal-content")]
    IllegalContent,
    #[serde(rename = "legal-order")]
    LegalOrder,
    #[serde(rename = "author-request")]
    AuthorRequest,
    #[serde(rename = "erasure-request")]
    ErasureRequest,
    #[serde(rename = "duplicate")]
    Duplicate,
    #[serde(rename = "other")]
    Other,
}
impl ::std::fmt::Display for CommentModerationReasonCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Spam => f.write_str("spam"),
            Self::Abuse => f.write_str("abuse"),
            Self::OffTopic => f.write_str("off-topic"),
            Self::PersonalData => f.write_str("personal-data"),
            Self::IllegalContent => f.write_str("illegal-content"),
            Self::LegalOrder => f.write_str("legal-order"),
            Self::AuthorRequest => f.write_str("author-request"),
            Self::ErasureRequest => f.write_str("erasure-request"),
            Self::Duplicate => f.write_str("duplicate"),
            Self::Other => f.write_str("other"),
        }
    }
}
impl ::std::str::FromStr for CommentModerationReasonCode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "spam" => Ok(Self::Spam),
            "abuse" => Ok(Self::Abuse),
            "off-topic" => Ok(Self::OffTopic),
            "personal-data" => Ok(Self::PersonalData),
            "illegal-content" => Ok(Self::IllegalContent),
            "legal-order" => Ok(Self::LegalOrder),
            "author-request" => Ok(Self::AuthorRequest),
            "erasure-request" => Ok(Self::ErasureRequest),
            "duplicate" => Ok(Self::Duplicate),
            "other" => Ok(Self::Other),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentModerationReasonCode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentModerationReasonCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "For imported comments: the system and its id, so importers are idempotent."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CommentOrigin {
    #[doc = "The comment's id in that system: printable ASCII, at most 200 characters."]
    pub id: CommentOriginId,
    pub system: CommentOriginSystem,
}
#[doc = "The comment's id in that system: printable ASCII, at most 200 characters."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentOriginId(::std::string::String);
impl ::std::ops::Deref for CommentOriginId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentOriginId> for ::std::string::String {
    fn from(value: CommentOriginId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentOriginId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 200usize {
            return Err("longer than 200 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[!-~]+$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[!-~]+$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentOriginId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentOriginId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentOriginId {
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
#[doc = "`CommentOriginSystem`"]
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
pub enum CommentOriginSystem {
    #[serde(rename = "cloudhal")]
    Cloudhal,
    #[serde(rename = "disqus")]
    Disqus,
    #[serde(rename = "wordpress")]
    Wordpress,
}
impl ::std::fmt::Display for CommentOriginSystem {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Cloudhal => f.write_str("cloudhal"),
            Self::Disqus => f.write_str("disqus"),
            Self::Wordpress => f.write_str("wordpress"),
        }
    }
}
impl ::std::str::FromStr for CommentOriginSystem {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "cloudhal" => Ok(Self::Cloudhal),
            "disqus" => Ok(Self::Disqus),
            "wordpress" => Ok(Self::Wordpress),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentOriginSystem {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentOriginSystem {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "Where the comment came from: `native` (the site's own form or Studio), `import` (an importer; see `origin`). `webmention` and `activitypub` are reserved for later RFCs and are refused by v1 writers."]
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
pub enum CommentSource {
    #[serde(rename = "native")]
    Native,
    #[serde(rename = "import")]
    Import,
    #[serde(rename = "webmention")]
    Webmention,
    #[serde(rename = "activitypub")]
    Activitypub,
}
impl ::std::fmt::Display for CommentSource {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Native => f.write_str("native"),
            Self::Import => f.write_str("import"),
            Self::Webmention => f.write_str("webmention"),
            Self::Activitypub => f.write_str("activitypub"),
        }
    }
}
impl ::std::str::FromStr for CommentSource {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "native" => Ok(Self::Native),
            "import" => Ok(Self::Import),
            "webmention" => Ok(Self::Webmention),
            "activitypub" => Ok(Self::Activitypub),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentSource {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentSource {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "Lifecycle. `pending` waits for a person (every guest comment starts here); `approved` is public; `hidden` is withdrawn and reversible; `spam` is never shown and is deleted after the retention period; `deleted` is a soft delete, hard-deleted after the retention period unless approved replies keep it as a tombstone."]
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
pub enum CommentStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "approved")]
    Approved,
    #[serde(rename = "hidden")]
    Hidden,
    #[serde(rename = "spam")]
    Spam,
    #[serde(rename = "deleted")]
    Deleted,
}
impl ::std::fmt::Display for CommentStatus {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Pending => f.write_str("pending"),
            Self::Approved => f.write_str("approved"),
            Self::Hidden => f.write_str("hidden"),
            Self::Spam => f.write_str("spam"),
            Self::Deleted => f.write_str("deleted"),
        }
    }
}
impl ::std::str::FromStr for CommentStatus {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "pending" => Ok(Self::Pending),
            "approved" => Ok(Self::Approved),
            "hidden" => Ok(Self::Hidden),
            "spam" => Ok(Self::Spam),
            "deleted" => Ok(Self::Deleted),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentStatus {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentStatus {
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
