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

-- ---------------------------------------------------- --

select
  m.contract_name,
    case

    when t.raw like '%No route found for collateral%' then 'No route found for collateral'
when t.raw like '%execution reverted (unknown custom error)%' then  'unexplained revert'
        when t.raw like '%transaction execution reverted%' then  'transaction execution reverted'
    else 'OTHER...'
  end as raw_or_tag,
count( *)
from (
  select
      is_error,
    data::text as raw,
    try_jsonb(data::text) as j
  from global.liquidation_bot_log
  where is_error = true
    and action = 'liquidation_execution'
) t
left join events.usg_markets m
  on m.contract_address = lower(t.j #>> '{data,account,market}')
group by 1,2;


