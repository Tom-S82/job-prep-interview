{#
  Shared feature definitions. The batch decisions (gold.decisions) and the feature-store
  export (gold.customer_features) both use these, so the Lambda's precomputed features and
  the batch re-score are defined the same way.
#}

{# Whole days elapsed between two timestamps, matching Python's timedelta.days (floor of
   elapsed time), not a count of calendar-day boundaries. #}
{% macro elapsed_days(from_ts, to_ts) -%}
    floor({{ dbt.datediff(from_ts, to_ts, 'second') }} / 86400.0)
{%- endmacro %}

{# Typical monthly income: credits in the income window, divided by the months of history
   actually covered. Dividing by the full 3 months for a young account would understate
   income and unfairly inflate the income-consistency ratio for newer customers. Null (rule
   not evaluated) until there are income_min_history_days of history and at least one credit. #}
{% macro typical_monthly_income(credits_in_window, account_age_days) -%}
    case
        when {{ credits_in_window }} > 0 and {{ account_age_days }} >= {{ var('income_min_history_days') }}
            then {{ credits_in_window }}
                / (least({{ var('income_window_days') }}, {{ account_age_days }}) / 30.0)
    end
{%- endmacro %}
