create or replace function try_jsonb(txt text)
returns jsonb
language plpgsql
stable
as $$
begin
  return txt::jsonb;
exception when others then
  return null;
end $$;

select
  m.contract_name,
  execution_key,
  is_error,
  lower(t.j #>> '{data,account,market}') as market,
   lower(t.j #>> '{data,step}') as step,

    case

    when t.raw like '%No route found for collateral%' then 'No route found for collateral'
when t.raw like '%execution reverted (unknown custom error)%' then  'unexplained revert'
        when t.raw like '%transaction execution reverted%' then  'transaction execution reverted'
        when t.raw like '%ZapCallError%' then  'ZapCallError'
        when t.is_error = false  THEN 'Success'
    else 'OTHER...'
  end as raw_or_tag,

count( *)


from (
  select
      is_error,
      execution_key,
    data::text as raw,
    try_jsonb(data::text) as j
  from global.liquidation_bot_log
  where  true
--     and is_error = true
    and action = 'liquidation_execution'
) t
left join events.usg_markets m
  on m.contract_address = lower(t.j #>> '{data,account,market}')
group by 1,2,3,4,5,6;

--
select action,execution_key,   is_error,count(*)
 from global.liquidation_bot_log
group by  1, 2,3
order by 1
;
--
select *  from global.liquidation_bot_log
where action ='liquidation_execution' and is_error  is true ;


SELECT
    min(date),
    max(date),
     CONCAT(
        FLOOR(EXTRACT(EPOCH FROM (max(date) - min(date))) / 60)::int,
        'm ',
        MOD(EXTRACT(EPOCH FROM (max(date) - min(date)))::int, 60),
        's'
    ) AS duration,
    count(*) FILTER (WHERE action = 'liquidation_execution' and is_error=false)  as countLiquidations,
count(*) FILTER (WHERE action = 'liquidation_bad_debt_execution' and is_error=false)  as countSeizing
FROM global.liquidation_bot_log;

