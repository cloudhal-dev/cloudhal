//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = "WAE blob13. Browser family, without version."]
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
pub enum AnalyticsBrowser {
    #[serde(rename = "chrome")]
    Chrome,
    #[serde(rename = "edge")]
    Edge,
    #[serde(rename = "firefox")]
    Firefox,
    #[serde(rename = "safari")]
    Safari,
    #[serde(rename = "samsung")]
    Samsung,
    #[serde(rename = "opera")]
    Opera,
    #[serde(rename = "other")]
    Other,
}
impl ::std::fmt::Display for AnalyticsBrowser {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Chrome => f.write_str("chrome"),
            Self::Edge => f.write_str("edge"),
            Self::Firefox => f.write_str("firefox"),
            Self::Safari => f.write_str("safari"),
            Self::Samsung => f.write_str("samsung"),
            Self::Opera => f.write_str("opera"),
            Self::Other => f.write_str("other"),
        }
    }
}
impl ::std::str::FromStr for AnalyticsBrowser {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "chrome" => Ok(Self::Chrome),
            "edge" => Ok(Self::Edge),
            "firefox" => Ok(Self::Firefox),
            "safari" => Ok(Self::Safari),
            "samsung" => Ok(Self::Samsung),
            "opera" => Ok(Self::Opera),
            "other" => Ok(Self::Other),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsBrowser {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsBrowser {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "WAE blob7. Where the view came from, classified by the server from the referrer host and utm_medium; internal = another page of this site."]
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
pub enum AnalyticsChannel {
    #[serde(rename = "direct")]
    Direct,
    #[serde(rename = "internal")]
    Internal,
    #[serde(rename = "search")]
    Search,
    #[serde(rename = "social")]
    Social,
    #[serde(rename = "ai")]
    Ai,
    #[serde(rename = "email")]
    Email,
    #[serde(rename = "paid")]
    Paid,
    #[serde(rename = "referral")]
    Referral,
}
impl ::std::fmt::Display for AnalyticsChannel {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Direct => f.write_str("direct"),
            Self::Internal => f.write_str("internal"),
            Self::Search => f.write_str("search"),
            Self::Social => f.write_str("social"),
            Self::Ai => f.write_str("ai"),
            Self::Email => f.write_str("email"),
            Self::Paid => f.write_str("paid"),
            Self::Referral => f.write_str("referral"),
        }
    }
}
impl ::std::str::FromStr for AnalyticsChannel {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "direct" => Ok(Self::Direct),
            "internal" => Ok(Self::Internal),
            "search" => Ok(Self::Search),
            "social" => Ok(Self::Social),
            "ai" => Ok(Self::Ai),
            "email" => Ok(Self::Email),
            "paid" => Ok(Self::Paid),
            "referral" => Ok(Self::Referral),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsChannel {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsChannel {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "WAE blob11. ISO 3166-1 alpha-2 country from Cloudflare's request.cf.country (XX unknown, T1 Tor). Never a city or region."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnalyticsCountry(::std::string::String);
impl ::std::ops::Deref for AnalyticsCountry {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsCountry> for ::std::string::String {
    fn from(value: AnalyticsCountry) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnalyticsCountry {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[A-Z][A-Z0-9]$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[A-Z][A-Z0-9]$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsCountry {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsCountry {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnalyticsCountry {
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
#[doc = "WAE blob18. A known crawler identified from the user agent (e.g. googlebot, gptbot, claudebot, perplexitybot). The list and each crawler's class (search, AI, social, monitor) live in code."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnalyticsCrawlerName(::std::string::String);
impl ::std::ops::Deref for AnalyticsCrawlerName {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsCrawlerName> for ::std::string::String {
    fn from(value: AnalyticsCrawlerName) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnalyticsCrawlerName {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z0-9][a-z0-9-]{0,31}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z0-9][a-z0-9-]{0,31}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsCrawlerName {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsCrawlerName {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnalyticsCrawlerName {
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
#[doc = "WAE blob12. Device class derived from the user agent and client hints, neither of which is stored."]
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
pub enum AnalyticsDevice {
    #[serde(rename = "desktop")]
    Desktop,
    #[serde(rename = "mobile")]
    Mobile,
    #[serde(rename = "tablet")]
    Tablet,
    #[serde(rename = "bot")]
    Bot,
    #[serde(rename = "unknown")]
    Unknown,
}
impl ::std::fmt::Display for AnalyticsDevice {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Desktop => f.write_str("desktop"),
            Self::Mobile => f.write_str("mobile"),
            Self::Tablet => f.write_str("tablet"),
            Self::Bot => f.write_str("bot"),
            Self::Unknown => f.write_str("unknown"),
        }
    }
}
impl ::std::str::FromStr for AnalyticsDevice {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "desktop" => Ok(Self::Desktop),
            "mobile" => Ok(Self::Mobile),
            "tablet" => Ok(Self::Tablet),
            "bot" => Ok(Self::Bot),
            "unknown" => Ok(Self::Unknown),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsDevice {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsDevice {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "One site analytics event as stored (RFC-0006): a page view or a Core Web Vitals sample reported by the site's first-party script, or a response the site Worker rendered itself (cache miss, redirect, 404, 410, 5xx). Written by the site Worker after it validated and enriched a beacon. The named fields are the columns of the local/self-host SQLite store; each one documents its fixed slot in a Workers Analytics Engine data point (index1 = siteId, blob1 = kind, blob2 = schemaVersion). Slots never move and new fields are only appended. Never carries an IP address, a user agent, a full referrer URL, a query string or a cookie."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum AnalyticsEvent {
    #[doc = "AnalyticsPageviewEvent\n\nA published page, article or archive was shown to a visitor (the site's script ran)."]
    #[serde(rename = "pageview")]
    Pageview {
        browser: AnalyticsBrowser,
        channel: AnalyticsChannel,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        country: ::std::option::Option<AnalyticsCountry>,
        device: AnalyticsDevice,
        #[doc = "WAE double1 (1 or 0). The view starts a visit: the referrer is empty or another site, and the navigation is not a reload, back/forward or restore."]
        entrance: bool,
        #[doc = "WAE blob17. Locale of the resolved node, not the visitor's Accept-Language."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        locale: ::std::option::Option<Locale>,
        #[serde(rename = "navType")]
        nav_type: AnalyticsNavType,
        #[doc = "WAE blob4. The page, entry or term the server resolved the path to, so stats survive slug changes."]
        #[serde(rename = "nodeId")]
        node_id: Id,
        #[serde(rename = "nodeKind")]
        node_kind: AnalyticsNodeKind,
        os: AnalyticsOs,
        #[doc = "WAE blob3. The published route the view resolved to; never a query string."]
        path: Path,
        #[doc = "WAE double10 (1 or 0). The beacon request carried Global Privacy Control (Sec-GPC: 1) or Do Not Track (DNT: 1), so no visitor hash was formed. Only this flag is kept, never which signal or any header. Absent means no signal (and on events written before the field existed)."]
        #[serde(
            rename = "privacySignal",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        privacy_signal: ::std::option::Option<bool>,
        #[serde(
            rename = "refHost",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        ref_host: ::std::option::Option<AnalyticsHostname>,
        #[serde(rename = "schemaVersion")]
        schema_version: SchemaVersion,
        #[doc = "WAE index1."]
        #[serde(rename = "siteId")]
        site_id: Id,
        timestamp: Timestamp,
        #[doc = "WAE blob10."]
        #[serde(
            rename = "utmCampaign",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        utm_campaign: ::std::option::Option<AnalyticsUtmValue>,
        #[doc = "WAE blob9."]
        #[serde(
            rename = "utmMedium",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        utm_medium: ::std::option::Option<AnalyticsUtmValue>,
        #[doc = "WAE blob8."]
        #[serde(
            rename = "utmSource",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        utm_source: ::std::option::Option<AnalyticsUtmValue>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        visitor: ::std::option::Option<AnalyticsVisitorHash>,
    },
    #[doc = "AnalyticsVitalsEvent\n\nCore Web Vitals of one sampled page view, measured by the site's own script and sent when the page is hidden. Code checks that at least one metric is present (the schema subset has no cross-property rules)."]
    #[serde(rename = "vitals")]
    Vitals {
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        browser: ::std::option::Option<AnalyticsBrowser>,
        #[doc = "WAE double5, stored multiplied by 1000. Cumulative Layout Shift (unitless)."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        cls: ::std::option::Option<f64>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        country: ::std::option::Option<AnalyticsCountry>,
        device: AnalyticsDevice,
        #[doc = "WAE double7. First Contentful Paint."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        fcp: ::std::option::Option<AnalyticsMillis>,
        #[doc = "WAE double4. Interaction to Next Paint."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        inp: ::std::option::Option<AnalyticsMillis>,
        #[doc = "WAE double3. Largest Contentful Paint."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        lcp: ::std::option::Option<AnalyticsMillis>,
        #[doc = "WAE blob4."]
        #[serde(rename = "nodeId")]
        node_id: Id,
        #[serde(rename = "nodeKind")]
        node_kind: AnalyticsNodeKind,
        #[doc = "WAE blob3."]
        path: Path,
        #[serde(rename = "sampleOneIn")]
        sample_one_in: AnalyticsSampleOneIn,
        #[serde(rename = "schemaVersion")]
        schema_version: SchemaVersion,
        #[doc = "WAE index1."]
        #[serde(rename = "siteId")]
        site_id: Id,
        timestamp: Timestamp,
        #[doc = "WAE double6. Time to First Byte."]
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        ttfb: ::std::option::Option<AnalyticsMillis>,
    },
    #[doc = "AnalyticsRenderEvent\n\nThe site Worker answered a request itself (a cache miss, redirect, 404, 410 or error). Cache hits never run the Worker, so these are not page views. The requested path is visitor-controlled text and is always shown as such."]
    #[serde(rename = "render")]
    Render {
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        country: ::std::option::Option<AnalyticsCountry>,
        #[serde(skip_serializing_if = "::std::option::Option::is_none")]
        crawler: ::std::option::Option<AnalyticsCrawlerName>,
        device: AnalyticsDevice,
        #[doc = "WAE blob4. The node rendered or redirected from, when the path resolved to one."]
        #[serde(
            rename = "nodeId",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        node_id: ::std::option::Option<Id>,
        #[serde(
            rename = "nodeKind",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        node_kind: ::std::option::Option<AnalyticsNodeKind>,
        path: AnalyticsRequestPath,
        #[doc = "WAE blob19. Target of a 301, 302 or 308: a site path or an https URL, without query string."]
        #[serde(
            rename = "redirectTo",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        redirect_to: ::std::option::Option<AnalyticsRenderEventRedirectTo>,
        #[serde(
            rename = "refHost",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        ref_host: ::std::option::Option<AnalyticsHostname>,
        #[doc = "WAE blob20. Same-site referrers only: the page that linked here, which finds broken internal links."]
        #[serde(
            rename = "refPath",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        ref_path: ::std::option::Option<Path>,
        #[doc = "WAE double8. Time the Worker spent answering."]
        #[serde(
            rename = "renderMs",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        render_ms: ::std::option::Option<AnalyticsMillis>,
        #[serde(
            rename = "sampleOneIn",
            skip_serializing_if = "::std::option::Option::is_none"
        )]
        sample_one_in: ::std::option::Option<AnalyticsSampleOneIn>,
        #[serde(rename = "schemaVersion")]
        schema_version: SchemaVersion,
        #[doc = "WAE index1."]
        #[serde(rename = "siteId")]
        site_id: Id,
        #[doc = "WAE double2. HTTP status the Worker answered with."]
        status: i64,
        timestamp: Timestamp,
    },
}
#[doc = "WAE blob6. Host of an external referrer: lower case, without www., port, path or query."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnalyticsHostname(::std::string::String);
impl ::std::ops::Deref for AnalyticsHostname {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsHostname> for ::std::string::String {
    fn from(value: AnalyticsHostname) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnalyticsHostname {
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
impl ::std::convert::TryFrom<&str> for AnalyticsHostname {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsHostname {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnalyticsHostname {
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
#[doc = "Whole milliseconds (the server rounds), capped at ten minutes."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct AnalyticsMillis(pub i64);
impl ::std::ops::Deref for AnalyticsMillis {
    type Target = i64;
    fn deref(&self) -> &i64 {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsMillis> for i64 {
    fn from(value: AnalyticsMillis) -> Self {
        value.0
    }
}
impl ::std::convert::From<i64> for AnalyticsMillis {
    fn from(value: i64) -> Self {
        Self(value)
    }
}
impl ::std::fmt::Display for AnalyticsMillis {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
impl ::std::str::FromStr for AnalyticsMillis {
    type Err = <i64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsMillis {
    type Error = <i64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for AnalyticsMillis {
    type Error = <i64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
#[doc = "WAE blob16. How the page was reached; restore = back/forward cache."]
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
pub enum AnalyticsNavType {
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
impl ::std::fmt::Display for AnalyticsNavType {
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
impl ::std::str::FromStr for AnalyticsNavType {
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
impl ::std::convert::TryFrom<&str> for AnalyticsNavType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsNavType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "WAE blob5. The kind of node the path resolved to."]
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
pub enum AnalyticsNodeKind {
    #[serde(rename = "page")]
    Page,
    #[serde(rename = "entry")]
    Entry,
    #[serde(rename = "archive")]
    Archive,
}
impl ::std::fmt::Display for AnalyticsNodeKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Page => f.write_str("page"),
            Self::Entry => f.write_str("entry"),
            Self::Archive => f.write_str("archive"),
        }
    }
}
impl ::std::str::FromStr for AnalyticsNodeKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "page" => Ok(Self::Page),
            "entry" => Ok(Self::Entry),
            "archive" => Ok(Self::Archive),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsNodeKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsNodeKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "WAE blob14. Operating system family, without version."]
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
pub enum AnalyticsOs {
    #[serde(rename = "windows")]
    Windows,
    #[serde(rename = "macos")]
    Macos,
    #[serde(rename = "ios")]
    Ios,
    #[serde(rename = "android")]
    Android,
    #[serde(rename = "linux")]
    Linux,
    #[serde(rename = "chromeos")]
    Chromeos,
    #[serde(rename = "other")]
    Other,
}
impl ::std::fmt::Display for AnalyticsOs {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Windows => f.write_str("windows"),
            Self::Macos => f.write_str("macos"),
            Self::Ios => f.write_str("ios"),
            Self::Android => f.write_str("android"),
            Self::Linux => f.write_str("linux"),
            Self::Chromeos => f.write_str("chromeos"),
            Self::Other => f.write_str("other"),
        }
    }
}
impl ::std::str::FromStr for AnalyticsOs {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "windows" => Ok(Self::Windows),
            "macos" => Ok(Self::Macos),
            "ios" => Ok(Self::Ios),
            "android" => Ok(Self::Android),
            "linux" => Ok(Self::Linux),
            "chromeos" => Ok(Self::Chromeos),
            "other" => Ok(Self::Other),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsOs {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsOs {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "WAE blob19. Target of a 301, 302 or 308: a site path or an https URL, without query string."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnalyticsRenderEventRedirectTo(::std::string::String);
impl ::std::ops::Deref for AnalyticsRenderEventRedirectTo {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsRenderEventRedirectTo> for ::std::string::String {
    fn from(value: AnalyticsRenderEventRedirectTo) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnalyticsRenderEventRedirectTo {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 512usize {
            return Err("longer than 512 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^(?:/|https://)[!-~]*$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^(?:/|https://)[!-~]*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsRenderEventRedirectTo {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsRenderEventRedirectTo {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnalyticsRenderEventRedirectTo {
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
#[doc = "WAE blob3. The requested path as received: percent-encoded printable ASCII, without query string or fragment, cut to 256 characters."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnalyticsRequestPath(::std::string::String);
impl ::std::ops::Deref for AnalyticsRequestPath {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsRequestPath> for ::std::string::String {
    fn from(value: AnalyticsRequestPath) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnalyticsRequestPath {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 256usize {
            return Err("longer than 256 characters".into());
        }
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^/[!-~]*$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^/[!-~]*$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsRequestPath {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsRequestPath {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnalyticsRequestPath {
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
#[doc = "WAE double9. One in this many events of this kind was recorded (vitals sampling; render events under a flood); 1 = every event. Counts weight each event by this number. An integer, so a rate never suffers rounding."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct AnalyticsSampleOneIn(pub ::std::num::NonZeroU64);
impl ::std::ops::Deref for AnalyticsSampleOneIn {
    type Target = ::std::num::NonZeroU64;
    fn deref(&self) -> &::std::num::NonZeroU64 {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsSampleOneIn> for ::std::num::NonZeroU64 {
    fn from(value: AnalyticsSampleOneIn) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::num::NonZeroU64> for AnalyticsSampleOneIn {
    fn from(value: ::std::num::NonZeroU64) -> Self {
        Self(value)
    }
}
impl ::std::fmt::Display for AnalyticsSampleOneIn {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
impl ::std::str::FromStr for AnalyticsSampleOneIn {
    type Err = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsSampleOneIn {
    type Error = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for AnalyticsSampleOneIn {
    type Error = <::std::num::NonZeroU64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
#[doc = "A normalised UTM value: lower case, a small alphabet, at most 64 characters. Values that do not fit are dropped, never stored as free text."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnalyticsUtmValue(::std::string::String);
impl ::std::ops::Deref for AnalyticsUtmValue {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsUtmValue> for ::std::string::String {
    fn from(value: AnalyticsUtmValue) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnalyticsUtmValue {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| {
                ::regress::Regex::new("^[a-z0-9][a-z0-9._+-]{0,63}$").unwrap()
            });
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[a-z0-9][a-z0-9._+-]{0,63}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsUtmValue {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsUtmValue {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnalyticsUtmValue {
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
#[doc = "WAE blob15. Present only when the site owner turned on unique visitors and the request carried no GPC or DNT signal: the first 64 bits of SHA-256(dailySalt ‖ siteId ‖ ip ‖ userAgent) in hex. The salt is random, lives for one UTC day and is then deleted, so the hash can neither be recomputed nor linked across days."]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct AnalyticsVisitorHash(::std::string::String);
impl ::std::ops::Deref for AnalyticsVisitorHash {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<AnalyticsVisitorHash> for ::std::string::String {
    fn from(value: AnalyticsVisitorHash) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for AnalyticsVisitorHash {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        static PATTERN: ::std::sync::LazyLock<::regress::Regex> =
            ::std::sync::LazyLock::new(|| ::regress::Regex::new("^[0-9a-f]{16}$").unwrap());
        if PATTERN.find(value).is_none() {
            return Err("doesn't match pattern \"^[0-9a-f]{16}$\"".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for AnalyticsVisitorHash {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AnalyticsVisitorHash {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for AnalyticsVisitorHash {
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
