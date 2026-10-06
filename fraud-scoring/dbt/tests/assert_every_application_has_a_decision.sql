-- Completeness: every application in Silver has a decision. Together with the unique test on
-- decisions.application_id, this means exactly one decision per application.
select a.application_id
from {{ source('silver', 'applications') }} as a
left join {{ ref('decisions') }} as d on d.application_id = a.application_id
where d.application_id is null
