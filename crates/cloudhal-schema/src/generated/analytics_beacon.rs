//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = "What a site's first-party analytics script sends to POST /__cloudhal/e (RFC-0006): JSON as text/plain, at most 2 KB. Everything in it is untrusted. The server keeps a beacon only after the same-origin, bot and rate checks, normalises the path and resolves it to a published route, reduces the referrer to a host, normalises UTM values, and derives everything else (node, country, device, visitor) itself. The script never sends an identifier, a cookie or a full URL."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum AnalyticsBeacon {
    #[doc = "AnalyticsPageviewBeacon\n\nSent once per page view, when the page is first visible (after prerendering, and again on a back/forward cache restore)."]
    #[serde(rename = "pageview")]
    Pageview {
        #[serde(
            rename = "navType",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        nav_type: ::std::option::Option<AnalyticsPageviewBeaconNavType>,
        path: BeaconPath,
        #[doc = "The host of document.referrer only (the script drops scheme, path and query); empty or absent for direct visits."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        referrer: ::std::option::Option<AnalyticsPageviewBeaconReferrer>,
        #[serde(rename = "schemaVersion")]
        schema_version: SchemaVersion,
        #[serde(
            rename = "utmCampaign",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        utm_campaign: ::std::option::Option<BeaconUtm>,
        #[serde(
            rename = "utmMedium",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        utm_medium: ::std::option::Option<BeaconUtm>,
        #[serde(
            rename = "utmSource",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        utm_source: ::std::option::Option<BeaconUtm>,
    },
    #[doc = "AnalyticsVitalsBeacon\n\nSent once, when a sampled page view is hidden, with the Core Web Vitals measured so far."]
    #[serde(rename = "vitals")]
    Vitals {
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        cls: ::std::option::Option<f64>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        fcp: ::std::option::Option<BeaconMillis>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        inp: ::std::option::Option<BeaconMillis>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        lcp: ::std::option::Option<BeaconMillis>,
        path: BeaconPath,
        #[doc = "The vitals sampling the script was served with (one page view in N); the server checks it against the site's setting."]
        #[serde(rename = "sampleOneIn")]
        sample_one_in: ::std::num::NonZeroU64,
        #[serde(rename = "schemaVersion")]
        schema_version: SchemaVersion,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        ttfb: ::std::option::Option<BeaconMillis>,
    },
}
#[doc = "`AnalyticsPageviewBeaconNavType`"]
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
pub enum AnalyticsPageviewBeaconNavType {
    #[serde(rename = "navigate")]
    Navigate,
    #[serde(rename = "reload")]
    Reload,
    #[serde(rename = "back_forward")]
    BackForward,
    #[serde(rename = "prerender")]
    Prerender,
    #[serde(rename = "restore")]
    Restore,
}
impl ::std::fmt::Display for AnalyticsPageviewBeaconNavType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Navigate => f.write_str("navigate"),
            Self::Reload => f.write_str("reload"),
            Self::BackForward => f.write_str("back_forward"),
            Self::Prerender => f.write_str("prerender"),
            Self::Restore => f.write_str("restore"),
        }
    }
}
impl ::std::str::FromStr for AnalyticsPageviewBeaconNavType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "navigate" => Ok(Self::Navigate),
            "reload" => Ok(Self::Reload),
            "back_forward" => Ok(Self::BackForward),
            "prerender" => Ok(Self::Prerender),
            "restore" => Ok(Self::Restore),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsPageviewBeaconNavType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsPageviewBeaconNavType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "The host of document.referrer only (the script drops scheme, path and query); empty or absent for direct visits."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnalyticsPageviewBeaconReferrer(::std::string::String);
impl ::std::ops::Deref for AnalyticsPageviewBeaconReferrer {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsPageviewBeaconReferrer> for ::std::string::String {
    fn from(value: AnalyticsPageviewBeaconReferrer) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnalyticsPageviewBeaconReferrer {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 253usize {
            return Err("longer than 253 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsPageviewBeaconReferrer {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsPageviewBeaconReferrer {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnalyticsPageviewBeaconReferrer {
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
#[doc = "`BeaconMillis`"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct BeaconMillis(pub f64);
impl ::std::ops::Deref for BeaconMillis {
    type Target = f64;
    fn deref(&self) -> &f64 {
        &self.0
    }
}
impl ::std::convert::From<BeaconMillis> for f64 {
    fn from(value: BeaconMillis) -> Self {
        value.0
    }
}
impl ::std::convert::From<f64> for BeaconMillis {
    fn from(value: f64) -> Self {
        Self(value)
    }
}
impl ::std::fmt::Display for BeaconMillis {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
impl ::std::str::FromStr for BeaconMillis {
    type Err = <f64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for BeaconMillis {
    type Error = <f64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for BeaconMillis {
    type Error = <f64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
#[doc = "location.pathname as the browser reports it (no query string, no fragment)."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct BeaconPath(::std::string::String);
impl ::std::ops::Deref for BeaconPath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BeaconPath> for ::std::string::String {
    fn from(value: BeaconPath) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for BeaconPath {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 1024usize {
            return Err("longer than 1024 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^/[^?#\\s]*$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^/[^?#\\s]*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for BeaconPath {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BeaconPath {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for BeaconPath {
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
#[doc = "A raw utm_* value from the page URL; the server lower-cases it and drops it unless it fits the stored alphabet."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct BeaconUtm(::std::string::String);
impl ::std::ops::Deref for BeaconUtm {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<BeaconUtm> for ::std::string::String {
    fn from(value: BeaconUtm) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for BeaconUtm {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 128usize {
            return Err("longer than 128 characters".into());
        }
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for BeaconUtm {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BeaconUtm {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for BeaconUtm {
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
