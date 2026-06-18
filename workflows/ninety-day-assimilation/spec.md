# 90-Day Assimilation Pipeline + Champion Next Steps — spec (DRAFT)

**Status:** Design draft — not built. Captures Pastor Stephen's direction (2026-06-18).
**Owner:** Stephen (vision/voice) · Engineering (build)

---

## Purpose

After the 21-day landing phase (`workflows/guest-follow-up`), a new person enters a
90-day assimilation pipeline. Its job is to reconnect *past* Day 21 and answer one
question: **is this person happily assimilated and integrated into Champion Church?**

It checks whether they need anything, whether they want to talk to a human, and walks
them through **Champion Next Steps**. As always: the system observes, prompts, and flags;
**humans do the relational reaching-out.** Consistent with the system purpose
(observe-and-flag, humans decide and act) and the no-crisis-intervention rule.

## Where it sits in the lifecycle

- **Day 0–21** — guest follow-up, 8-touch journey *(built)*.
- **Day ~21–90** — this pipeline: assimilation check-ins + Champion Next Steps.
- **After Day 90** — passive monitoring; periodic re-prompts if still incomplete.

## The reconnect check-ins (across the window)

A series of touches, spaced through the post-21-day window, that surface:

- Are they happily assimilated / integrated?
- Do they need anything, or want to talk to someone?
- Have they started — and completed — Champion Next Steps?

## Champion Next Steps (the online class — content TBD, to be designed)

A **sequenced, gated** video-study path. Each module unlocks the next on completion.

1. **New-Christian fork** — "Are you a new Christian?"
   - **Yes** → New Christians video study. Space to ask questions; routed to further
     study as needed. (Designed to catch new-believer questions and support them.)
   - **No** → skip ahead to step 2.
2. **Our Beliefs** (Basic Beliefs module) — core doctrine video study. Questions
   welcomed; ability to route to further study.
3. **What Champion Church Offers** — video tour of ministries and services: growing in
   faith, overcoming habits, finding their people / group.
4. **How to Get Involved → Embracing the Champion Culture** — serving, teams,
   connecting. "Embracing the Champion Culture" is a **prerequisite to serve**.
5. **Made In His Image** — discovering God-given gifts; how God shaped them to fit the
   body of Christ. A study of **8 attributes of God** a believer may carry, with where
   and how to apply each.
6. **Branching** — further studies as needed beyond the basics. (Step 5 is the end of
   "the basics.")

## On completion

When a person finishes the basics, the system flags them **ready** and a **human reaches
out** to encourage involvement and coach them into the right serving lane. Human action,
approval-gated per system norms.

## Incomplete handling

If — after **both** the 21-day and 90-day pipelines end — a person is still **not
connected** OR has **not done the video studies**, flag them **incomplete**. The system
then **periodically prompts** them over time to take the studies and get involved.

## Open questions (need Stephen / ELT before build)

- **Trigger + cadence:** what day does the pipeline start, and how many touches / what
  spacing across Day ~21–90?
- **Channel mix:** SMS, email, or both, for the prompts?
- **Where do the studies live** (Subsplash? a course tool? PCO?), and how does the system
  learn a module is "completed" — manual staff mark, or an integration?
- **Who reaches out** on completion (which role/owner), and the approval gate.
- **"Connected" definition** for the incomplete flag — what concretely counts (in a
  group? serving? regular attendance?).
- **Re-prompt cadence** for incomplete people (every few weeks? a cap so it never nags?).

## Dependencies

- **Champion Next Steps content** — videos + the 8-attributes study. Not yet created
  (Stephen: "can be done quickly").
- A **study-completion signal** source (manual or integrated).
- Builds on `guest-follow-up` (21-day) and the existing pastoral-flag / observe-and-flag
  machinery.
