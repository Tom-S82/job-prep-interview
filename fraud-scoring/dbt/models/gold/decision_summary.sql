{#
  gold.decision_summary: one row per day, for monitoring and trend analysis.

  "Decision" here is what the customer actually received: the real-time (Lambda) decision
  where it was captured, otherwise the batch decision.
#}
{{ config(materialized='table') }}

with decided as (
    select
        d.application_id,
        d.decision_date,
        coalesce(rt.decision, d.decision) as decision,
        case when rt.decision is null then 'batch' else 'realtime' end as decision_source,
        d.score,
        d.confidence
    from {{ ref('decisions') }} as d
    left join {{ source('silver', 'realtime_decisions') }} as rt
        on rt.application_id = d.application_id
),

reviews as (
    select
        application_id,
        outcome,
        case when resolved_at is not null then 1 else 0 end as resolved,
        case
            when resolved_at is not null
                and {{ dbt.datediff('opened_at', 'resolved_at', 'second') }} <= 86400
                then 1 else 0
        end as resolved_within_a_day
    from {{ source('silver', 'manual_reviews') }}
),

daily as (
    select
        decided.decision_date,
        count(*) as applications,
        sum(case when decision = 'approve' then 1 else 0 end) as approvals,
        sum(case when decision = 'manual_review' then 1 else 0 end) as manual_reviews,
        sum(case when decision = 'decline' then 1 else 0 end) as declines,
        round(avg(score), 4) as avg_score,
        round(avg(case when decision = 'approve' then score end), 4) as avg_score_approved,
        round(avg(case when decision = 'manual_review' then score end), 4) as avg_score_manual_review,
        round(avg(case when decision = 'decline' then score end), 4) as avg_score_declined,
        round(avg(confidence), 2) as avg_confidence,
        sum(case when decision_source = 'batch' then 1 else 0 end) as decisions_without_realtime_record,
        -- Manual review outcomes for that day's reviews
        sum(case when decision = 'manual_review' then coalesce(r.resolved, 0) else 0 end) as reviews_resolved,
        sum(case when decision = 'manual_review' then coalesce(r.resolved_within_a_day, 0) else 0 end) as reviews_resolved_within_a_day,
        sum(case when decision = 'manual_review' and r.outcome = 'approved' then 1 else 0 end) as reviews_approved
    from decided
    left join reviews as r on r.application_id = decided.application_id
    group by decided.decision_date
)

select
    decision_date,
    applications,
    approvals,
    manual_reviews,
    declines,
    round(declines * 1.0 / applications, 4) as decline_rate,
    round(manual_reviews * 1.0 / applications, 4) as review_rate,
    -- 7-day rolling decline rate: smooths daily noise so trends are visible
    round(
        sum(declines) over (order by decision_date rows between 6 preceding and current row) * 1.0
        / sum(applications) over (order by decision_date rows between 6 preceding and current row),
        4
    ) as decline_rate_7d,
    avg_score,
    avg_score_approved,
    avg_score_manual_review,
    avg_score_declined,
    avg_confidence,
    reviews_resolved,
    round(reviews_resolved * 1.0 / nullif(manual_reviews, 0), 4) as review_resolution_rate,
    round(reviews_resolved_within_a_day * 1.0 / nullif(manual_reviews, 0), 4) as review_same_day_rate,
    -- Share of reviewed applications the team approved: a high rate suggests the
    -- review band is too wide (rules too strict for these customers)
    round(reviews_approved * 1.0 / nullif(reviews_resolved, 0), 4) as review_overturn_rate,
    decisions_without_realtime_record
from daily
