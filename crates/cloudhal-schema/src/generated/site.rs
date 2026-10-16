//! GENERATED FILE — DO NOT EDIT.
//! Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
#![allow(clippy::all, rustdoc::all, dead_code, unused_imports)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

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
#[doc = "Root node of a Site Graph: one deployable website with its locales, domains, theme and page index. Pages and content entries are separate nodes referenced by id so they can be versioned and locked independently."]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Site {
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub brand: ::std::option::Option<Brand>,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub chrome: ::std::option::Option<Chrome>,
    #[serde(rename = "createdAt")]
    pub created_at: Timestamp,
    #[serde(rename = "defaultLocale")]
    pub default_locale: Locale,
    #[serde(skip_serializing_if = "::std::option::Option::is_none")]
    pub design: ::std::option::Option<Design>,
    #[doc = "Hostnames serving this site. Exactly one should be primary; the *.cloudhal.app subdomain is always present in Cloud."]
    pub domains: ::std::vec::Vec<Domain>,
    #[serde(
        rename = "homePageId",
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub home_page_id: ::std::option::Option<Id>,
    pub id: Id,
    pub locales: ::std::vec::Vec<Locale>,
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
