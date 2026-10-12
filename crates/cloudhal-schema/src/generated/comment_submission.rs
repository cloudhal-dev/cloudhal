//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = "The comment as typed; the server trims and normalises it, then requires 2 to 5,000 characters."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentPostSubmissionBody(::std::string::String);
impl ::std::ops::Deref for CommentPostSubmissionBody {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentPostSubmissionBody> for ::std::string::String {
    fn from(value: CommentPostSubmissionBody) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentPostSubmissionBody {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 20000usize {
            return Err("longer than 20000 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentPostSubmissionBody {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentPostSubmissionBody {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentPostSubmissionBody {
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
#[doc = "Optional and never shown. Kept only for moderation, erasure and export requests (v1.1: reply notifications after double opt-in)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentPostSubmissionEmail(::std::string::String);
impl ::std::ops::Deref for CommentPostSubmissionEmail {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentPostSubmissionEmail> for ::std::string::String {
    fn from(value: CommentPostSubmissionEmail) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentPostSubmissionEmail {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 254usize {
            return Err("longer than 254 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new(
                    "^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$",
                )
                .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentPostSubmissionEmail {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentPostSubmissionEmail {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentPostSubmissionEmail {
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
#[doc = "The display name as typed (the form says it is shown publicly)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentPostSubmissionName(::std::string::String);
impl ::std::ops::Deref for CommentPostSubmissionName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentPostSubmissionName> for ::std::string::String {
    fn from(value: CommentPostSubmissionName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentPostSubmissionName {
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
impl ::std::convert::TryFrom<&str> for CommentPostSubmissionName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentPostSubmissionName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentPostSubmissionName {
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
#[doc = "Why, as typed; at most 1,000 characters after normalising."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentReportSubmissionDetails(::std::string::String);
impl ::std::ops::Deref for CommentReportSubmissionDetails {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentReportSubmissionDetails> for ::std::string::String {
    fn from(value: CommentReportSubmissionDetails) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentReportSubmissionDetails {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 4000usize {
            return Err("longer than 4000 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentReportSubmissionDetails {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentReportSubmissionDetails {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentReportSubmissionDetails {
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
#[doc = "Optional, never shown: where the site may answer the notice."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CommentReportSubmissionEmail(::std::string::String);
impl ::std::ops::Deref for CommentReportSubmissionEmail {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CommentReportSubmissionEmail> for ::std::string::String {
    fn from(value: CommentReportSubmissionEmail) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for CommentReportSubmissionEmail {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 254usize {
            return Err("longer than 254 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new(
                    "^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$",
                )
                .unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^[^\\s@\\x00-\\x1F\\x7F]{1,64}@[^\\s@\\x00-\\x1F\\x7F]{1,189}$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CommentReportSubmissionEmail {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentReportSubmissionEmail {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CommentReportSubmissionEmail {
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
#[doc = "`CommentReportSubmissionReason`"]
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
pub enum CommentReportSubmissionReason {
    #[serde(rename = "spam")]
    Spam,
    #[serde(rename = "abuse")]
    Abuse,
    #[serde(rename = "personal-data")]
    PersonalData,
    #[serde(rename = "illegal-content")]
    IllegalContent,
    #[serde(rename = "other")]
    Other,
}
impl ::std::fmt::Display for CommentReportSubmissionReason {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Spam => f.write_str("spam"),
            Self::Abuse => f.write_str("abuse"),
            Self::PersonalData => f.write_str("personal-data"),
            Self::IllegalContent => f.write_str("illegal-content"),
            Self::Other => f.write_str("other"),
        }
    }
}
impl ::std::str::FromStr for CommentReportSubmissionReason {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "spam" => Ok(Self::Spam),
            "abuse" => Ok(Self::Abuse),
            "personal-data" => Ok(Self::PersonalData),
            "illegal-content" => Ok(Self::IllegalContent),
            "other" => Ok(Self::Other),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommentReportSubmissionReason {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommentReportSubmissionReason {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "What a browser may send to the site Worker's comment endpoints (RFC-0007): `POST /__cloudhal/comments` (a comment) and `POST /__cloudhal/comments/report` (a report). Forms post application/x-www-form-urlencoded and the comments module posts JSON; the server builds this object from either (the endpoint sets `kind`, the server sets `schemaVersion`) and checks it with the precompiled validator before anything else reads it. Everything in it is untrusted. It is loose where the server normalises (it trims, NFC-normalises and re-checks text against the stored Comment contract) and strict where a browser has no business sending something: there is no field for a status, a site, an author kind, a label, an IP address or anything the server derives itself."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum CommentSubmission {
    #[doc = "CommentPostSubmission\n\nA new comment or a reply."]
    #[serde(rename = "comment")]
    Comment {
        #[doc = "The comment as typed; the server trims and normalises it, then requires 2 to 5,000 characters."]
        body: CommentPostSubmissionBody,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        challenge: ::std::option::Option<SubmissionChallenge>,
        #[doc = "Optional and never shown. Kept only for moderation, erasure and export requests (v1.1: reply notifications after double opt-in)."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        email: ::std::option::Option<CommentPostSubmissionEmail>,
        #[doc = "The display name as typed (the form says it is shown publicly)."]
        name: CommentPostSubmissionName,
        #[doc = "The entry commented on. The server accepts it only for a published entry with an open thread, and works out the page to return to itself."]
        #[serde(rename = "nodeId")]
        node_id: Id,
        #[doc = "The comment replied to; it must be approved and in the same thread. The server decides `parentId`/`inReplyToId` of the stored comment."]
        #[serde(
            rename = "parentId",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        parent_id: ::std::option::Option<SubmissionCommentId>,
        #[serde(rename = "schemaVersion")]
        schema_version: SchemaVersion,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        solution: ::std::option::Option<SubmissionSolution>,
        #[serde(
            rename = "turnstileToken",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        turnstile_token: ::std::option::Option<SubmissionTurnstileToken>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        website: ::std::option::Option<SubmissionHoneypot>,
    },
    #[doc = "CommentReportSubmission\n\nA reader's notice that a comment breaks the site's rules or the law (EU DSA Art. 16). A report never hides anything by itself: it puts the comment in front of a person."]
    #[serde(rename = "report")]
    Report {
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        challenge: ::std::option::Option<SubmissionChallenge>,
        #[serde(rename = "commentId")]
        comment_id: SubmissionCommentId,
        #[doc = "Why, as typed; at most 1,000 characters after normalising."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        details: ::std::option::Option<CommentReportSubmissionDetails>,
        #[doc = "Optional, never shown: where the site may answer the notice."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        email: ::std::option::Option<CommentReportSubmissionEmail>,
        reason: CommentReportSubmissionReason,
        #[serde(rename = "schemaVersion")]
        schema_version: SchemaVersion,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        solution: ::std::option::Option<SubmissionSolution>,
        #[serde(
            rename = "turnstileToken",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        turnstile_token: ::std::option::Option<SubmissionTurnstileToken>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        website: ::std::option::Option<SubmissionHoneypot>,
    },
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
#[doc = "The signed proof-of-work challenge from `GET /__cloudhal/comments/challenge`, as issued (base64url segments joined by dots)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SubmissionChallenge(::std::string::String);
impl ::std::ops::Deref for SubmissionChallenge {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SubmissionChallenge> for ::std::string::String {
    fn from(value: SubmissionChallenge) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SubmissionChallenge {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 512usize {
            return Err("longer than 512 characters".into());
        }
        if value.chars().count() < 16usize {
            return Err("shorter than 16 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9_-]+)*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SubmissionChallenge {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmissionChallenge {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SubmissionChallenge {
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
#[doc = "`SubmissionCommentId`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SubmissionCommentId(::std::string::String);
impl ::std::ops::Deref for SubmissionCommentId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SubmissionCommentId> for ::std::string::String {
    fn from(value: SubmissionCommentId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SubmissionCommentId {
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
impl ::std::convert::TryFrom<&str> for SubmissionCommentId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmissionCommentId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SubmissionCommentId {
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
#[doc = "A field people never see. The schema accepts any short value so that a filled honeypot gets the same answer as a real submission (\"held for moderation\") and nothing is stored."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SubmissionHoneypot(::std::string::String);
impl ::std::ops::Deref for SubmissionHoneypot {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SubmissionHoneypot> for ::std::string::String {
    fn from(value: SubmissionHoneypot) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SubmissionHoneypot {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2048usize {
            return Err("longer than 2048 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SubmissionHoneypot {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmissionHoneypot {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SubmissionHoneypot {
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
#[doc = "The counter that solves the challenge, in decimal."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SubmissionSolution(::std::string::String);
impl ::std::ops::Deref for SubmissionSolution {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SubmissionSolution> for ::std::string::String {
    fn from(value: SubmissionSolution) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SubmissionSolution {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^(?:0|[1-9][0-9]{0,15})$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^(?:0|[1-9][0-9]{0,15})$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for SubmissionSolution {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmissionSolution {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SubmissionSolution {
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
#[doc = "Cloudflare Turnstile's response token, when the site turned Turnstile on."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct SubmissionTurnstileToken(::std::string::String);
impl ::std::ops::Deref for SubmissionTurnstileToken {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<SubmissionTurnstileToken> for ::std::string::String {
    fn from(value: SubmissionTurnstileToken) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for SubmissionTurnstileToken {
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
impl ::std::convert::TryFrom<&str> for SubmissionTurnstileToken {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmissionTurnstileToken {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for SubmissionTurnstileToken {
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
