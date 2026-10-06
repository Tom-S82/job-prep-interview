{#
  Use custom schema names exactly as configured (gold, silver) instead of dbt's default
  "<target_schema>_<custom_schema>", so models read and write the real medallion schemas.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
