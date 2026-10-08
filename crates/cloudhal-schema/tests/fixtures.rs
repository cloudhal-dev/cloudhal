//! Golden-fixture tests shared with the TypeScript package:
//! every valid fixture must validate against the bundled schema AND round-trip through the
//! generated serde type without loss; every invalid fixture must be rejected by the schema.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;

fn contracts_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/core-contracts")
}

fn bundled_schema(name: &str) -> Value {
    let p = contracts_dir().join(format!("schemas/.bundled/{name}.schema.json"));
    let raw = fs::read_to_string(&p).unwrap_or_else(|e| {
        panic!(
            "missing bundled schema {} ({e}); run `pnpm gen` first",
            p.display()
        )
    });
    serde_json::from_str(&raw).expect("bundled schema is JSON")
}

fn fixtures(kind: &str, name: &str) -> Vec<(String, Value)> {
    let dir = contracts_dir().join(format!("fixtures/{kind}/{name}"));
    let mut entries: Vec<_> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("fixture dir {} ({e})", dir.display()))
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    entries.sort();
    entries
        .into_iter()
        .map(|p| {
            let raw = fs::read_to_string(&p).unwrap();
            (
                p.file_name().unwrap().to_string_lossy().into_owned(),
                serde_json::from_str(&raw).unwrap(),
            )
        })
        .collect()
}

fn check<T: DeserializeOwned + Serialize + PartialEq + std::fmt::Debug>(name: &str) {
    let schema = bundled_schema(name);
    let validator = jsonschema::draft202012::new(&schema)
        .unwrap_or_else(|e| panic!("{name}: schema does not compile: {e}"));

    let valid = fixtures("valid", name);
    assert!(!valid.is_empty(), "{name}: no valid fixtures");
    for (file, doc) in valid {
        let errors: Vec<String> = validator.iter_errors(&doc).map(|e| e.to_string()).collect();
        assert!(
            errors.is_empty(),
            "{name}/valid/{file} failed schema validation: {errors:?}"
        );
        let typed: T = serde_json::from_value(doc.clone()).unwrap_or_else(|e| {
            panic!("{name}/valid/{file} does not deserialize into generated type: {e}")
        });
        let back = serde_json::to_value(&typed).unwrap();
        assert_eq!(
            back, doc,
            "{name}/valid/{file} did not round-trip through the generated type"
        );
    }

    let invalid = fixtures("invalid", name);
    assert!(!invalid.is_empty(), "{name}: no invalid fixtures");
    for (file, wrapper) in invalid {
        assert!(
            wrapper.get("reason").and_then(Value::as_str).is_some(),
            "{name}/invalid/{file}: missing reason"
        );
        let data = wrapper.get("data").expect("invalid fixture has data");
        assert!(
            !validator.is_valid(data),
            "{name}/invalid/{file} unexpectedly passed schema validation"
        );
    }
}

#[test]
fn project() {
    check::<cloudhal_schema::Project>("project");
}
#[test]
fn site() {
    check::<cloudhal_schema::Site>("site");
}
#[test]
fn page() {
    check::<cloudhal_schema::Page>("page");
}
#[test]
fn section() {
    check::<cloudhal_schema::Section>("section");
}
#[test]
fn content_entry() {
    check::<cloudhal_schema::ContentEntry>("content-entry");
}
#[test]
fn snapshot() {
    check::<cloudhal_schema::Snapshot>("snapshot");
}
#[test]
fn skill_manifest() {
    check::<cloudhal_schema::SkillManifest>("skill-manifest");
}
#[test]
fn taxonomy() {
    check::<cloudhal_schema::Taxonomy>("taxonomy");
}
#[test]
fn term() {
    check::<cloudhal_schema::Term>("term");
}
#[test]
fn redirect() {
    check::<cloudhal_schema::Redirect>("redirect");
}
#[test]
fn asset() {
    check::<cloudhal_schema::Asset>("asset");
}
#[test]
fn menu() {
    check::<cloudhal_schema::Menu>("menu");
}
#[test]
fn analytics_event() {
    check::<cloudhal_schema::AnalyticsEvent>("analytics-event");
}
#[test]
fn analytics_beacon() {
    check::<cloudhal_schema::AnalyticsBeacon>("analytics-beacon");
}
