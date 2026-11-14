# FORGE — Handover Pack

Engineering SaaS Platform, Minimum Viable Product. 30-day assignment.
Prepared by Ahmed Elreef.

**Live application** — https://project-forge.up.railway.app
**Health endpoint** — https://project-forge.up.railway.app/api/v1/health
**Repository** — https://github.com/Darkdesert070/project-forge

> The platform was renamed from PROJECT FORGE to FORGE, and the public domain
> changed, after the documents below were written. Both are recorded in the
> Delivery Addendum. The former address no longer resolves to the application.

---

## Read in this order

| # | Document | Pages | What it is for |
|---|---|---|---|
| 0 | `Project_FORGE_Correction_Summary.docx` | 3 | **Read first.** What changed in response to the review: credentials removed and rotated, the public progress defect, the automated tests, and the corrected figures. |
| 0b | `Project_FORGE_Delivery_Addendum.docx` | 4 | **Read alongside document 1.** Everything delivered after the pack was first accepted: the rename, public projects, evidence file upload, and corrected figures. |
| 1 | `Project_FORGE_Requirements_Compliance_Statement.docx` | 9 | **Start here.** Every numbered clause of the assignment traced to the artefact that satisfies it. **46 of 46 met.** |
| 2 | `Project_FORGE_Completion_Report.docx` | 2 | The two-page report required by assignment section 6, item 8. Achievements, challenges, lessons, next phase. |
| 3 | `Project_FORGE_Final_Delivery_Report_revB.docx` | 24 | The full technical record: architecture, data model, security, verification, limitations, and all nine release faults across two phases (§12.2 and §12.4). |
| 4 | `Project_FORGE_Milestone1_Initiation_Report.docx` | 10 | Day 3 gate. Scope baseline, backlog, repository, 30-day plan. |
| 5 | `Project_FORGE_Milestone2_Architecture_Report.docx` | 9 | Day 8 gate. Decision matrices, data model, API contract, deployment design. |
| 6 | `Project_FORGE_Milestone3_Prototype_Report.docx` | 7 | Day 18 gate. Core journey, state machine, 15 scripted tests. |
| 7 | `Project_FORGE_Demonstration_Script.docx` | 5 | The rehearsed 19-minute walkthrough, with a timing sheet and likely questions. |
| 8 | `Project_FORGE_Diagrams_and_Screens.docx` | 11 | Four architecture diagrams drawn from the delivered code, plus six screens captured from the live deployment, including evidence file upload (Figure B6). |
| 9 | `Project_FORGE_Baseline_Workbook_revC.xlsx` | 15 sheets | Scope register, 55-item backlog, role matrix, decision matrices, data model, API contract, Gantt, risks, QA plan, change log — each with delivery outcome. |

---

## Position against the assignment

**All ten functions** required by section 2 are complete and demonstrable on the
live URL. Requirement 7, evidence, was recorded as partial at handover because
only the link path was delivered; file upload was added afterwards, so both
paths now exist and the requirement is met in full.

All eight acceptance criteria in section 8 are met. 52 of 55 backlog items were
delivered, worth 122 of 132 story points.

## Verified figures

Counted from the delivered source on 10 August 2026, not carried over from the
earlier documents:

- 13 database tables · 5 migrations
- 51 API endpoints, all under `/api/v1`
- 29 Angular components · 10 services
- 24 Zod validation schemas
- 25 permission rules, every one enforced server-side

The figures in documents 1 to 9 have been corrected to match. Section 4 of the
addendum lists each change and why it moved.

## Two design points a reviewer will ask about

**Inside a workspace, every member can read every project.** The Admin/Member
difference is in what may be *written*, not in what may be *seen* — creation,
editing, archiving and deletion are Admin-only and enforced by route middleware.

This is deliberate: a workspace is one engineering organisation, and the tenant
boundary is the workspace itself. A project in another workspace returns 404
rather than 403, so its existence is never disclosed. Per-project read scoping is
listed with multi-workspace membership in the next phase.

**Uploaded files live on a mounted volume, not in object storage.** The sponsor
asked for a limited feature demonstrating understanding rather than a production
service. The filesystem is touched in exactly one module, written against a
four-function interface, so moving to an S3-compatible store means replacing that
one file. The limitation is stated rather than hidden: files are lost with the
volume, and migrating them is item 4 of the next phase.

## Two decisions needed from the sponsor

1. **Hosting cost ownership.** The assignment states a reward, not a budget, and
   deployment is an acceptance criterion. Roughly USD 5 per month. Never
   confirmed in writing. Tracked as risk R-09. The deployment credit is limited
   and the application stops when it is exhausted, so this is time-bound.
2. **Repository visibility.** The repository is public; baseline assumption A-10
   said private. The assignment marks the project confidential.

## Security actions from the review

All three are done, and are confirmed in the Correction Summary:

1. Both demonstration passwords have been changed. No password appears in this
   pack or anywhere in the repository, and the git history has been replaced with
   a single commit so no earlier revision carries one.
2. The managed database credential has been rotated.
3. The public TCP proxy on the database has been removed.

## One operational note

The web container resolves the API service name once, at start. Redeploying the
API gives it a new address that the running web container does not learn, so the
web service must be restarted after any API deployment — otherwise every request
through it times out while both services report healthy. Resolving the name per
request is a next-phase item.

---

## A note on revisions

Where the delivered system differs from an earlier document, the earlier
document is **corrected rather than quietly amended**, so the drift stays
visible:

- The Delivery Addendum lists every claim the final week superseded, with the
  document that carried it and the correction applied.
- Final Delivery Report §16 lists all eleven figures that changed from
  revision A.
- Milestone reports are revision C, carrying the original baseline plus an
  outcome column.
- The workbook keeps its baseline columns untouched and adds outcome columns
  alongside.

Five things are recorded rather than smoothed over, because concealing them
would be worse than reporting them: the initial database migration had been
overwritten and no clean clone could have built the database until it was
reconstructed; the database credential was exposed during the release session
and needs rotating; the repository is public where the baseline said private;
uploaded files sit on a mounted volume rather than in a cloud object store; and
four further release faults were found after handover, recorded in section 12.4
of the Final Delivery Report alongside the original five.
