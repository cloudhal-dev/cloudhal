//! Cloudhal domain contracts for Rust.
//!
//! Everything under [`generated`] is produced by `pnpm gen` from the JSON Schemas in
//! `packages/core-contracts/schemas/` and must not be edited by hand. This crate is the Rust
//! face of `@cloudhal/core-contracts`; both are checked for drift in CI.

pub mod generated;

pub use generated::content_entry::ContentEntry;
pub use generated::page::Page;
pub use generated::project::Project;
pub use generated::section::Section;
pub use generated::site::Site;
pub use generated::skill_manifest::SkillManifest;
pub use generated::snapshot::Snapshot;

/// Current contract version. Every root document carries `schemaVersion` equal to this.
pub const CONTRACT_SCHEMA_VERSION: u64 = 1;
