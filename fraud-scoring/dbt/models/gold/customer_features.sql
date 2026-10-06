{#
  gold.customer_features: the feature-store snapshot exported nightly to DynamoDB.

  One row per customer, computed as at the run time, with the SAME definitions the batch
  re-score uses (macros/features.sql). The Lambda reads these fields; it appends real-time
  application timestamps itself between exports.

  Export: an orchestrated job (e.g. Step Functions → Glue/Lambda) writes this table to the
  DynamoDB feature table, keyed by customer_id, and converts the counts below into the
  device/location sets and application-timestamp list the Lambda expects.
#}
{{ config(materialized='table') }}

with as_at as (
    select {{ dbt.current_timestamp() }} as ts
),

activity as (
    select
        t.customer_id,
        max(t.txn_at) as last_activity_at,
        sum(
            case
                when t.direction = 'credit'
                    and t.txn_at >= {{ dbt.dateadd('day', -var('income_window_days'), 'as_at.ts') }}
                    then t.amount
            end
        ) as credits_in_window
    from {{ source('silver', 'transactions') }} as t
    cross join as_at
    group by t.customer_id
),

devices as (
    select
        ds.customer_id,
        count(distinct ds.device_id) as known_device_count,
        count(
            distinct case
                when ds.seen_at >= {{ dbt.dateadd('day', -var('location_window_days'), 'as_at.ts') }}
                    then ds.location
            end
        ) as usual_location_count
    from {{ source('silver', 'device_sightings') }} as ds
    cross join as_at
    group by ds.customer_id
),

recent_applications as (
    select ap.customer_id, count(*) as applications_last_30d
    from {{ source('silver', 'applications') }} as ap
    cross join as_at
    where ap.applied_at >= {{ dbt.dateadd('day', -30, 'as_at.ts') }}
    group by ap.customer_id
),

customers as (
    select
        c.customer_id,
        c.account_opened_at,
        {{ elapsed_days('c.account_opened_at', 'as_at.ts') }} as account_age_days,
        as_at.ts as features_as_at
    from {{ source('silver', 'customers') }} as c
    cross join as_at
)

select
    c.customer_id,
    c.account_opened_at,
    a.last_activity_at,
    {{ typical_monthly_income('a.credits_in_window', 'c.account_age_days') }} as typical_monthly_income,
    coalesce(d.known_device_count, 0) as known_device_count,
    coalesce(d.usual_location_count, 0) as usual_location_count,
    coalesce(r.applications_last_30d, 0) as applications_last_30d,
    c.features_as_at,
    '{{ var("ruleset_version") }}' as ruleset_version
from customers as c
left join activity as a on a.customer_id = c.customer_id
left join devices as d on d.customer_id = c.customer_id
left join recent_applications as r on r.customer_id = c.customer_id
