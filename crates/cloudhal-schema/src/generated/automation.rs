//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = "A recurring job on a site (RFC-0008), created by a person in Studio: either a built-in deterministic job that Cloudhal runs itself (reports, findings and notifications; it never publishes), or a scheduled agent task that an external agent picks up over MCP with the automation's own key, inside a run window, under a mode cap and budgets. No language model runs inside Cloudhal. Scheduling never grants rights: every call of a task runs with the key's scopes narrowed to its owner's current role. Automations live in D1 next to the graph; they are not graph nodes and are not part of site bundles."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Automation {
    #[serde(rename = "consecutiveFailures")]
    pub consecutive_failures: u64,
    #[serde(rename = "createdAt")]
    pub created_at: Timestamp,
    pub id: AutomationId,
    pub job: AutomationJob,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub metadata: ::std::option::Option<Metadata>,
    pub name: AutomationName,
    #[serde(
        rename = "nextRunAt",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub next_run_at: ::std::option::Option<Timestamp>,
    pub owner: AutomationOwner,
    #[doc = "Why the automation is not `active`: a person paused it; its agent paused it; three consecutive failures; a run exceeded its budget; the site's kill switch; its key was revoked; its owner left or no longer holds the scopes it needs."]
    #[serde(
        rename = "pausedReason",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub paused_reason: ::std::option::Option<AutomationPausedReason>,
    pub recurrence: AutomationRecurrence,
    pub rev: Revision,
    #[serde(rename = "schemaVersion")]
    pub schema_version: SchemaVersion,
    #[serde(rename = "siteId")]
    pub site_id: Id,
    pub state: AutomationState,
    #[serde(rename = "updatedAt")]
    pub updated_at: Timestamp,
}
#[doc = "Per-run limits Cloudhal counts and enforces for an agent task: tool calls, mutations, approval requests filed and minutes since the run began. Exceeding one ends the run (`budget-exceeded`) and pauses the automation."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AutomationBudget {
    #[serde(rename = "maxApprovalRequests")]
    pub max_approval_requests: i64,
    #[serde(rename = "maxMinutes")]
    pub max_minutes: ::std::num::NonZeroU64,
    #[serde(rename = "maxToolCalls")]
    pub max_tool_calls: ::std::num::NonZeroU64,
    #[serde(rename = "maxWrites")]
    pub max_writes: i64,
}
#[doc = "An automation id: `aut_` and 6 to 32 letters or digits."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AutomationId(::std::string::String);
impl ::std::ops::Deref for AutomationId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AutomationId> for ::std::string::String {
    fn from(value: AutomationId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AutomationId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^aut_[A-Za-z0-9]{6,32}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^aut_[A-Za-z0-9]{6,32}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AutomationId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AutomationId {
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
#[doc = "What runs, discriminated by `kind`."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum AutomationJob {
    #[doc = "BuiltinAutomationJob\n\nA deterministic job Cloudhal runs itself, in bounded steps. Its outputs are findings, reports and Studio notifications; it never changes or publishes content."]
    #[serde(rename = "builtin")]
    Builtin {
        builtin: AutomationJobBuiltin,
        #[doc = "`stale-content` only: entries not updated for this many days are listed for review."]
        #[serde(
            rename = "staleAfterDays",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        stale_after_days: ::std::option::Option<i64>,
    },
    #[doc = "AgentTaskAutomationJob\n\nA task an external agent performs over MCP. At each occurrence a run window opens for `windowMinutes`; the automation's key (`keyId`, owned by the automation's owner) is valid only inside an open run, which the agent starts with `begin_run` and ends with `end_run`. The run's mode is the key's effective mode capped by `modeCap`; it never waits for a person: calls that need one leave an approval request and the run ends. `readsUntrustedText` declares that the task reads visitor-supplied text (comments, 404 paths, fetched pages); such an automation's key cannot hold write scopes, and any run that reads such text is limited to reading, labelling and hiding from then on."]
    #[serde(rename = "agent-task")]
    AgentTask {
        budget: AutomationBudget,
        #[doc = "What the owner asks the agent to do, shown to the agent by `begin_run`. Plain text."]
        instructions: AutomationJobInstructions,
        #[serde(rename = "keyId")]
        key_id: AutomationJobKeyId,
        #[doc = "The most autonomous mode a run may use; never `bypass`."]
        #[serde(rename = "modeCap")]
        mode_cap: AutomationJobModeCap,
        #[serde(rename = "readsUntrustedText")]
        reads_untrusted_text: bool,
        #[doc = "A skill the run declares (its scopes and approval list narrow the run further)."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        skill: ::std::option::Option<AutomationJobSkill>,
        #[serde(rename = "windowMinutes")]
        window_minutes: i64,
    },
}
#[doc = "`AutomationJobBuiltin`"]
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
pub enum AutomationJobBuiltin {
    #[serde(rename = "broken-links")]
    BrokenLinks,
    #[serde(rename = "stale-content")]
    StaleContent,
    #[serde(rename = "feed-check")]
    FeedCheck,
    #[serde(rename = "weekly-digest")]
    WeeklyDigest,
    #[serde(rename = "cleanup")]
    Cleanup,
}
impl ::std::fmt::Display for AutomationJobBuiltin {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::BrokenLinks => f.write_str("broken-links"),
            Self::StaleContent => f.write_str("stale-content"),
            Self::FeedCheck => f.write_str("feed-check"),
            Self::WeeklyDigest => f.write_str("weekly-digest"),
            Self::Cleanup => f.write_str("cleanup"),
        }
    }
}
impl ::std::str::FromStr for AutomationJobBuiltin {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "broken-links" => Ok(Self::BrokenLinks),
            "stale-content" => Ok(Self::StaleContent),
            "feed-check" => Ok(Self::FeedCheck),
            "weekly-digest" => Ok(Self::WeeklyDigest),
            "cleanup" => Ok(Self::Cleanup),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AutomationJobBuiltin {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationJobBuiltin {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "What the owner asks the agent to do, shown to the agent by `begin_run`. Plain text."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AutomationJobInstructions(::std::string::String);
impl ::std::ops::Deref for AutomationJobInstructions {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AutomationJobInstructions> for ::std::string::String {
    fn from(value: AutomationJobInstructions) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AutomationJobInstructions {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 2000usize {
            return Err("longer than 2000 characters".into());
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
impl ::std::convert::TryFrom<&str> for AutomationJobInstructions {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationJobInstructions {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AutomationJobInstructions {
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
#[doc = "`AutomationJobKeyId`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AutomationJobKeyId(::std::string::String);
impl ::std::ops::Deref for AutomationJobKeyId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AutomationJobKeyId> for ::std::string::String {
    fn from(value: AutomationJobKeyId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AutomationJobKeyId {
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
impl ::std::convert::TryFrom<&str> for AutomationJobKeyId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationJobKeyId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AutomationJobKeyId {
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
#[doc = "The most autonomous mode a run may use; never `bypass`."]
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
pub enum AutomationJobModeCap {
    #[serde(rename = "plan")]
    Plan,
    #[serde(rename = "manual")]
    Manual,
    #[serde(rename = "edits")]
    Edits,
    #[serde(rename = "auto")]
    Auto,
}
impl ::std::fmt::Display for AutomationJobModeCap {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Plan => f.write_str("plan"),
            Self::Manual => f.write_str("manual"),
            Self::Edits => f.write_str("edits"),
            Self::Auto => f.write_str("auto"),
        }
    }
}
impl ::std::str::FromStr for AutomationJobModeCap {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "plan" => Ok(Self::Plan),
            "manual" => Ok(Self::Manual),
            "edits" => Ok(Self::Edits),
            "auto" => Ok(Self::Auto),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AutomationJobModeCap {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationJobModeCap {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "A skill the run declares (its scopes and approval list narrow the run further)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AutomationJobSkill(::std::string::String);
impl ::std::ops::Deref for AutomationJobSkill {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AutomationJobSkill> for ::std::string::String {
    fn from(value: AutomationJobSkill) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AutomationJobSkill {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 64usize {
            return Err("longer than 64 characters".into());
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
impl ::std::convert::TryFrom<&str> for AutomationJobSkill {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationJobSkill {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AutomationJobSkill {
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
#[doc = "`AutomationName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AutomationName(::std::string::String);
impl ::std::ops::Deref for AutomationName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AutomationName> for ::std::string::String {
    fn from(value: AutomationName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AutomationName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 120usize {
            return Err("longer than 120 characters".into());
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
impl ::std::convert::TryFrom<&str> for AutomationName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AutomationName {
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
#[doc = "The person who created the automation and owns its key (`user_…`). Agents never own automations."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AutomationOwner {
    pub id: AutomationOwnerId,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub name: ::std::option::Option<AutomationOwnerName>,
}
#[doc = "`AutomationOwnerId`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AutomationOwnerId(::std::string::String);
impl ::std::ops::Deref for AutomationOwnerId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AutomationOwnerId> for ::std::string::String {
    fn from(value: AutomationOwnerId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AutomationOwnerId {
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
impl ::std::convert::TryFrom<&str> for AutomationOwnerId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationOwnerId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AutomationOwnerId {
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
#[doc = "`AutomationOwnerName`"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AutomationOwnerName(::std::string::String);
impl ::std::ops::Deref for AutomationOwnerName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AutomationOwnerName> for ::std::string::String {
    fn from(value: AutomationOwnerName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AutomationOwnerName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 200usize {
            return Err("longer than 200 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AutomationOwnerName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationOwnerName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AutomationOwnerName {
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
#[doc = "Why the automation is not `active`: a person paused it; its agent paused it; three consecutive failures; a run exceeded its budget; the site's kill switch; its key was revoked; its owner left or no longer holds the scopes it needs."]
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
pub enum AutomationPausedReason {
    #[serde(rename = "person")]
    Person,
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "failures")]
    Failures,
    #[serde(rename = "budget")]
    Budget,
    #[serde(rename = "kill-switch")]
    KillSwitch,
    #[serde(rename = "key-revoked")]
    KeyRevoked,
    #[serde(rename = "owner-removed")]
    OwnerRemoved,
    #[serde(rename = "role-changed")]
    RoleChanged,
}
impl ::std::fmt::Display for AutomationPausedReason {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Person => f.write_str("person"),
            Self::Agent => f.write_str("agent"),
            Self::Failures => f.write_str("failures"),
            Self::Budget => f.write_str("budget"),
            Self::KillSwitch => f.write_str("kill-switch"),
            Self::KeyRevoked => f.write_str("key-revoked"),
            Self::OwnerRemoved => f.write_str("owner-removed"),
            Self::RoleChanged => f.write_str("role-changed"),
        }
    }
}
impl ::std::str::FromStr for AutomationPausedReason {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "person" => Ok(Self::Person),
            "agent" => Ok(Self::Agent),
            "failures" => Ok(Self::Failures),
            "budget" => Ok(Self::Budget),
            "kill-switch" => Ok(Self::KillSwitch),
            "key-revoked" => Ok(Self::KeyRevoked),
            "owner-removed" => Ok(Self::OwnerRemoved),
            "role-changed" => Ok(Self::RoleChanged),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AutomationPausedReason {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationPausedReason {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "When the automation runs: the first occurrence as a wall-clock time in `timeZone`, repeated by `rule` (absent: once). Occurrences are computed in the zone, so \"Mondays 09:07\" stays 09:07 across daylight-saving changes; a time that does not exist on a given day (a spring-forward gap) runs at the next valid minute, and a time that occurs twice runs once, at the first (a documented deviation from RFC 5545 §3.3.10, which drops such occurrences). `preset` records which Studio choice produced the rule."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct AutomationRecurrence {
    pub preset: AutomationRecurrencePreset,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub rule: ::std::option::Option<AutomationRule>,
    pub start: LocalDateTime,
    #[serde(rename = "timeZone")]
    pub time_zone: TimeZone,
}
#[doc = "`AutomationRecurrencePreset`"]
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
pub enum AutomationRecurrencePreset {
    #[serde(rename = "once")]
    Once,
    #[serde(rename = "hourly")]
    Hourly,
    #[serde(rename = "daily")]
    Daily,
    #[serde(rename = "weekdays")]
    Weekdays,
    #[serde(rename = "weekly")]
    Weekly,
    #[serde(rename = "monthly")]
    Monthly,
    #[serde(rename = "custom")]
    Custom,
}
impl ::std::fmt::Display for AutomationRecurrencePreset {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Once => f.write_str("once"),
            Self::Hourly => f.write_str("hourly"),
            Self::Daily => f.write_str("daily"),
            Self::Weekdays => f.write_str("weekdays"),
            Self::Weekly => f.write_str("weekly"),
            Self::Monthly => f.write_str("monthly"),
            Self::Custom => f.write_str("custom"),
        }
    }
}
impl ::std::str::FromStr for AutomationRecurrencePreset {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "once" => Ok(Self::Once),
            "hourly" => Ok(Self::Hourly),
            "daily" => Ok(Self::Daily),
            "weekdays" => Ok(Self::Weekdays),
            "weekly" => Ok(Self::Weekly),
            "monthly" => Ok(Self::Monthly),
            "custom" => Ok(Self::Custom),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AutomationRecurrencePreset {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationRecurrencePreset {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "The recurrence as an RFC 5545 RRULE value in Cloudhal's subset, without the `RRULE:` prefix: FREQ DAILY, WEEKLY or MONTHLY; INTERVAL; BYDAY (ordinals such as 2TU or -1FR only with MONTHLY); BYMONTHDAY (1–31 or -1); BYHOUR; BYMINUTE; COUNT or UNTIL. The pattern bounds the vocabulary; the parser refuses repeated parts, COUNT with UNTIL, ordinals outside MONTHLY and runs closer than the job's minimum interval."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AutomationRule(::std::string::String);
impl ::std::ops::Deref for AutomationRule {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AutomationRule> for ::std::string::String {
    fn from(value: AutomationRule) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AutomationRule {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 300usize {
            return Err("longer than 300 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> = ::std::sync::LazyLock::new(
            || {
                :: regress :: Regex :: new ("^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=[1-9][0-9]{0,2}|BYDAY=(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)){0,6}|BYMONTHDAY=(?:-1|[1-9]|[12][0-9]|3[01])(?:,(?:-1|[1-9]|[12][0-9]|3[01])){0,30}|BYHOUR=(?:[01]?[0-9]|2[0-3])(?:,(?:[01]?[0-9]|2[0-3])){0,23}|BYMINUTE=[0-5]?[0-9](?:,[0-5]?[0-9]){0,3}|COUNT=[1-9][0-9]{0,3}|UNTIL=[0-9]{8}T[0-9]{6}Z))*$") . unwrap ()
            },
        );
        if PATTERN.find(value).is_none() {
            return Err ("doesn't match pattern \"^FREQ=(?:DAILY|WEEKLY|MONTHLY)(?:;(?:INTERVAL=[1-9][0-9]{0,2}|BYDAY=(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)){0,6}|BYMONTHDAY=(?:-1|[1-9]|[12][0-9]|3[01])(?:,(?:-1|[1-9]|[12][0-9]|3[01])){0,30}|BYHOUR=(?:[01]?[0-9]|2[0-3])(?:,(?:[01]?[0-9]|2[0-3])){0,23}|BYMINUTE=[0-5]?[0-9](?:,[0-5]?[0-9]){0,3}|COUNT=[1-9][0-9]{0,3}|UNTIL=[0-9]{8}T[0-9]{6}Z))*$\"" . into ()) ;
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AutomationRule {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationRule {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AutomationRule {
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
#[doc = "`active` runs on its recurrence; `paused` and `auto-paused` (by failures or a budget) wait for a person to resume; `broken` needs a person to repair it (key revoked, owner gone); `ended` reached its COUNT or UNTIL."]
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
pub enum AutomationState {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "paused")]
    Paused,
    #[serde(rename = "auto-paused")]
    AutoPaused,
    #[serde(rename = "broken")]
    Broken,
    #[serde(rename = "ended")]
    Ended,
}
impl ::std::fmt::Display for AutomationState {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Active => f.write_str("active"),
            Self::Paused => f.write_str("paused"),
            Self::AutoPaused => f.write_str("auto-paused"),
            Self::Broken => f.write_str("broken"),
            Self::Ended => f.write_str("ended"),
        }
    }
}
impl ::std::str::FromStr for AutomationState {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "active" => Ok(Self::Active),
            "paused" => Ok(Self::Paused),
            "auto-paused" => Ok(Self::AutoPaused),
            "broken" => Ok(Self::Broken),
            "ended" => Ok(Self::Ended),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AutomationState {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AutomationState {
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
