{#
  gold.decision_reconciliation: what the Lambda decided in real time vs the batch re-score.

  They should agree. When they don't, the usual reasons are:
    * feature freshness: the Lambda read nightly-refreshed features (e.g. typical income as of
      last night), the batch computes them exactly as at the application;
    * a ruleset change between the real-time decision and the re-score;
    * a fallback decision (feature store unavailable) in real time.
  A daily mismatch rate above `reconciliation_tolerance` fails the reconciliation test.
#}
{{ config(materialized='table') }}

select
    d.application_id,
    d.customer_id,
    d.decision_date,
    rt.decision as realtime_decision,
    d.decision as batch_decision,
    rt.score as realtime_score,
    d.score as batch_score,
    round(d.score - rt.score, 4) as score_difference,
    rt.ruleset_version as realtime_ruleset_version,
    d.ruleset_version as batch_ruleset_version,
    case when rt.decision = d.decision then 1 else 0 end as decisions_match,
    case
        when rt.decision = d.decision then null
        when rt.ruleset_version <> d.ruleset_version then 'ruleset_changed'
        when rt.fallback_reason is not null then 'realtime_fallback'
        else 'feature_freshness_or_data_difference'
    end as likely_mismatch_reason
from {{ ref('decisions') }} as d
inner join {{ source('silver', 'realtime_decisions') }} as rt
    on rt.application_id = d.application_id
