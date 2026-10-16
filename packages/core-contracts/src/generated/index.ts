/* eslint-disable */
/* biome-ignore-all lint: generated */
/**
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/core-contracts/schemas/*.schema.json  (run `pnpm gen`)
 */

export type { SchemaVersion, Id, Slug, Revision, Timestamp, Project, Metadata } from "./project.ts";
export type { Locale, TimeZone, Site, Domain, ThemeRef, Design } from "./site.ts";
export type { PublishStatus, Section, BodyProfile, ActorKind, BodyBlocks, SurfaceComponentId, MotionLevel, Page, HeroSection, ImageRef, Link, RichTextSection, BodyBlock, Actor, ImageSection, ContentListSection, ComponentSection, SurfaceSection, SurfaceComponent, Seo, Availability } from "./page.ts";
export type { ContentEntry, Body, TermAssignment, Correction } from "./content-entry.ts";
export type { Snapshot, NodeRef, ChangeSummary } from "./snapshot.ts";
export type { SkillManifest } from "./skill-manifest.ts";
export type { Path, Taxonomy, TaxonomyLabel, TaxonomyArchive } from "./taxonomy.ts";
export type { Term, TermLabel } from "./term.ts";
export type { Redirect, RedirectSource } from "./redirect.ts";
export type { AssetStorage, AssetLicense, HttpsUrl, AssetSource, Sha256, Asset, BlobStorage, ExternalStorage, AssetImage, SpdxLicense, UrlLicense, UploadSource, FetchSource, ImportSource, LinkSource } from "./asset.ts";
export type { MenuItem, Menu, PageMenuItem, MenuLabels, EntryMenuItem, TermMenuItem, CollectionMenuItem, UrlMenuItem, GroupMenuItem } from "./menu.ts";
export type { AnalyticsEvent, AnalyticsNodeKind, AnalyticsHostname, AnalyticsChannel, AnalyticsCountry, AnalyticsDevice, AnalyticsBrowser, AnalyticsOs, AnalyticsVisitorHash, AnalyticsNavType, AnalyticsSampleOneIn, AnalyticsRequestPath, AnalyticsCrawlerName, AnalyticsPageviewEvent, AnalyticsVitalsEvent, AnalyticsRenderEvent } from "./analytics-event.ts";
export type { AnalyticsBeacon, BeaconPath, BeaconUtm, BeaconMillis, AnalyticsPageviewBeacon, AnalyticsVitalsBeacon } from "./analytics-beacon.ts";
export type { CommentId, CommentAuthor, CommentDisplayName, CommentStatus, Comment, CommentOrigin, GuestCommentAuthor, ReaderCommentAuthor, StaffCommentAuthor, ErasedCommentAuthor, CommentBody, CommentLabel, CommentModeration } from "./comment.ts";
export type { CommentSubmission, SubmissionChallenge, SubmissionSolution, SubmissionTurnstileToken, SubmissionHoneypot, SubmissionCommentId, CommentPostSubmission, CommentReportSubmission } from "./comment-submission.ts";
export type { ReleaseId, ReleaseItem, ReleaseNodeKind, ReleaseWhen, LocalDateTime, ReleaseState, ReleaseHash, ReleaseApproval, ReleaseOutcome, Release, ReleaseSetItem, ReleaseNodeVersion, ReleaseRemoveItem, ReleaseAt, ReleaseOnApproval, ReleasePersonApproval, ReleasePerson, ReleaseAutoApproval, ReleasePublishedOutcome, ReleaseConflictOutcome, ReleaseConflict, ReleaseFailedOutcome, ReleaseMissedOutcome, ReleaseExpiredOutcome, ReleaseCanceledOutcome } from "./release.ts";
export type { AutomationId, AutomationJob, AutomationRule, AutomationState, Automation, BuiltinAutomationJob, AgentTaskAutomationJob, AutomationBudget, AutomationRecurrence, AutomationOwner } from "./automation.ts";
export type { ScheduleRunId, ScheduleRunSubject, ScheduleRunState, ScheduleRun, ReleaseRunSubject, AutomationRunSubject, ScheduleRunWindow, ScheduleRunUsage, ScheduleRunTaint, ScheduleRunError } from "./schedule-run.ts";
