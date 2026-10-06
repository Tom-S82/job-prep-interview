-- Reconciliation: on any day, real-time (Lambda) and batch decisions may disagree for at most
-- `reconciliation_tolerance` of applications. Small differences are expected (the Lambda reads
-- nightly-refreshed features); a higher rate means the two paths have drifted apart.
-- Inspect gold.decision_reconciliation (likely_mismatch_reason) when this fails.
select
    decision_date,
    count(*) as reconciled,
    sum(1 - decisions_match) as mismatches,
    round(sum(1 - decisions_match) * 1.0 / count(*), 4) as mismatch_rate
from {{ ref('decision_reconciliation') }}
group by decision_date
having sum(1 - decisions_match) * 1.0 / count(*) > {{ var('reconciliation_tolerance') }}
