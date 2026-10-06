-- No application or decision is dated in the future: a sign of clock or timezone errors upstream.
select application_id, applied_at, scored_at
from {{ ref('decisions') }}
where applied_at > {{ dbt.current_timestamp() }}
   or applied_at > scored_at
