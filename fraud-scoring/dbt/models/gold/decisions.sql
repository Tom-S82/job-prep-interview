{#
  gold.decisions: one row per application, re-scored in batch with the same rules as the Lambda.

  Why re-score in batch?
    * Audit: an independent, reproducible decision for every application.
    * Reconciliation: compare against what the Lambda actually decided (decision_reconciliation).
    * Analysis and calibration: every rule's inputs and outputs, ready for back-testing.

  Point-in-time: every feature is computed AS AT the application's own timestamp (only rows
  strictly before applied_at are used), so the batch never "knows" anything the Lambda couldn't.

  Refresh: hourly, after the CDC merge into Silver. Incremental runs reprocess the last
  `lookback_days` so late-arriving CDC rows and corrections are re-scored.
#}
{{
    config(
        materialized='incremental',
        unique_key='application_id',
        incremental_strategy='delete+insert',
        on_schema_change='append_new_columns'
    )
}}

with applications as (
    select *
    from {{ source('silver', 'applications') }}
    {% if is_incremental() %}
    where applied_at >= (
        select {{ dbt.dateadd('day', -var('lookback_days'), 'max(applied_at)') }} from {{ this }}
    )
    {% endif %}
),

all_applications as (
    select application_id, customer_id, applied_at from {{ source('silver', 'applications') }}
),

-- Velocity: other applications by the same customer in the window up to this one
velocity as (
    select
        a.application_id,
        count(p.application_id) as prior_applications_7d
    from applications as a
    left join all_applications as p
        on p.customer_id = a.customer_id
        and p.application_id <> a.application_id
        and p.applied_at <= a.applied_at
        and p.applied_at >= {{ dbt.dateadd('day', -var('velocity_window_days'), 'a.applied_at') }}
    group by a.application_id
),

-- Activity and income: transactions strictly before the application
activity as (
    select
        a.application_id,
        max(t.txn_at) as last_activity_at,
        sum(
            case
                when t.direction = 'credit'
                    and t.txn_at >= {{ dbt.dateadd('day', -var('income_window_days'), 'a.applied_at') }}
                    then t.amount
            end
        ) as credits_in_window
    from applications as a
    left join {{ source('silver', 'transactions') }} as t
        on t.customer_id = a.customer_id
        and t.txn_at < a.applied_at
    group by a.application_id
),

-- Devices and locations: sightings strictly before the application
devices as (
    select
        a.application_id,
        max(case when ds.device_id = a.device_id then 1 else 0 end) as device_seen_before,
        count(
            case when ds.seen_at >= {{ dbt.dateadd('day', -var('location_window_days'), 'a.applied_at') }} then 1 end
        ) as sightings_in_location_window,
        max(
            case
                when ds.location = a.device_location
                    and ds.seen_at >= {{ dbt.dateadd('day', -var('location_window_days'), 'a.applied_at') }}
                    then 1 else 0
            end
        ) as location_seen_in_window
    from applications as a
    left join {{ source('silver', 'device_sightings') }} as ds
        on ds.customer_id = a.customer_id
        and ds.seen_at < a.applied_at
    group by a.application_id
),

features as (
    select
        a.application_id,
        a.customer_id,
        a.applied_at,
        cast(a.applied_at as date) as decision_date,
        a.amount,
        a.stated_monthly_income,
        a.device_id,
        a.device_location,
        a.sca_result,
        c.account_opened_at,
        -- A missing account record is treated as brand new (age 0), as in the Lambda
        coalesce({{ elapsed_days('c.account_opened_at', 'a.applied_at') }}, 0) as account_age_days,
        v.prior_applications_7d,
        act.last_activity_at,
        {{ elapsed_days('act.last_activity_at', 'a.applied_at') }} as days_inactive,
        coalesce(d.device_seen_before, 0) as device_seen_before,
        coalesce(d.sightings_in_location_window, 0) as sightings_in_location_window,
        coalesce(d.location_seen_in_window, 0) as location_seen_in_window,
        act.credits_in_window
    from applications as a
    left join {{ source('silver', 'customers') }} as c on c.customer_id = a.customer_id
    left join velocity as v on v.application_id = a.application_id
    left join activity as act on act.application_id = a.application_id
    left join devices as d on d.application_id = a.application_id
),

with_income as (
    select
        *,
        {{ typical_monthly_income('credits_in_window', 'account_age_days') }} as typical_monthly_income
    from features
),

rules as (
    select
        *,
        round(stated_monthly_income / nullif(typical_monthly_income, 0), 2) as income_ratio,

        -- 1 = rule fired; each rule mirrors lambda/scoring.py
        case when account_age_days < {{ var('new_account_days') }} then 1 else 0 end as rule_new_account,
        case when prior_applications_7d > {{ var('velocity_max_prior_applications') }} then 1 else 0 end as rule_velocity_spike,
        1 - device_seen_before as rule_device_new,
        case
            when typical_monthly_income is not null
                and stated_monthly_income / typical_monthly_income > {{ var('income_ratio_limit') }}
                then 1 else 0
        end as rule_income_consistency,
        case when days_inactive > {{ var('dormant_days') }} then 1 else 0 end as rule_dormant_reactivation,
        case when sca_result = 'failed' then 1 else 0 end as rule_sca_fail,
        case when sightings_in_location_window > 0 and location_seen_in_window = 0 then 1 else 0 end as rule_location_unusual,

        -- 1 = rule had the data it needed (feeds confidence)
        case when typical_monthly_income is not null then 1 else 0 end as evaluated_income_consistency,
        case when last_activity_at is not null then 1 else 0 end as evaluated_dormant_reactivation,
        case when sca_result <> 'not_attempted' then 1 else 0 end as evaluated_sca_fail,
        case when sightings_in_location_window > 0 then 1 else 0 end as evaluated_location_unusual
    from with_income
),

scored as (
    select
        *,
        round(
            rule_new_account * {{ var('weight_new_account') }}
            + rule_velocity_spike * {{ var('weight_velocity_spike') }}
            + rule_device_new * {{ var('weight_device_new') }}
            + rule_income_consistency * {{ var('weight_income_consistency') }}
            + rule_dormant_reactivation * {{ var('weight_dormant_reactivation') }}
            + rule_sca_fail * {{ var('weight_sca_fail') }}
            + rule_location_unusual * {{ var('weight_location_unusual') }},
            4
        ) as raw_score,
        -- new_account, velocity and device rules can always be evaluated
        round((3 + evaluated_income_consistency + evaluated_dormant_reactivation + evaluated_sca_fail + evaluated_location_unusual) / 7.0, 2)
            as confidence
    from rules
)

select
    application_id,
    customer_id,
    applied_at,
    decision_date,
    amount,
    stated_monthly_income,
    device_id,
    device_location,
    sca_result,

    -- Features (as at the application)
    account_age_days,
    prior_applications_7d,
    days_inactive,
    typical_monthly_income,
    income_ratio,

    -- Rules
    rule_new_account,
    rule_velocity_spike,
    rule_device_new,
    rule_income_consistency,
    rule_dormant_reactivation,
    rule_sca_fail,
    rule_location_unusual,

    -- Score and decision
    raw_score,
    least(raw_score, 1.0) as score,
    confidence,
    case
        when least(raw_score, 1.0) > {{ var('decline_above') }} then 'decline'
        when least(raw_score, 1.0) >= {{ var('review_from') }} then 'manual_review'
        else 'approve'
    end as decision,

    -- Human-readable reasoning: fired rules, largest weight first
    rtrim(
        case when rule_velocity_spike = 1 then 'velocity_spike ' else '' end
        || case when rule_sca_fail = 1 then 'sca_fail ' else '' end
        || case when rule_new_account = 1 then 'new_account ' else '' end
        || case when rule_income_consistency = 1 then 'income_consistency ' else '' end
        || case when rule_dormant_reactivation = 1 then 'dormant_reactivation ' else '' end
        || case when rule_device_new = 1 then 'device_new ' else '' end
        || case when rule_location_unusual = 1 then 'location_unusual ' else '' end
    ) as fired_rules,

    '{{ var("ruleset_version") }}' as ruleset_version,
    {{ dbt.current_timestamp() }} as scored_at
from scored
