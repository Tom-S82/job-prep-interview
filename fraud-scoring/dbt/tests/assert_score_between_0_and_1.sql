-- Every score is within 0–1, and capping only ever lowers the raw score.
-- Returns failing rows; the test passes when this returns nothing.
select application_id, raw_score, score
from {{ ref('decisions') }}
where score < 0
   or score > 1
   or score > raw_score
   or confidence < 0
   or confidence > 1
