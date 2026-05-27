-- Analyse liquidation - nouvelle structure Prisma
--
-- Tables principales:
-- - global.liquidation_execution : resultats normalises des executions
-- - global.liquidation_bot_log   : logs generiques du bot
-- - global.usg_markets           : metadata des marches

-- ============================================================
-- 1. Vue d'ensemble des executions
-- ============================================================
select
  le.type,
  le.success,
  count(*) as count,
  min(le.date) as first_execution,
  max(le.date) as last_execution
from global.liquidation_execution le
group by 1, 2
order by le.type, le.success desc;

-- ============================================================
-- 2. Synthese des executions par marche
-- ============================================================
select
  coalesce(m.contract_name, 'Unknown market') as market_name,
  lower(le.market) as market,
  count(*) filter (where le.type = 'liquidation' and le.success = true) as liquidation_success,
  count(*) filter (where le.type = 'liquidation' and le.success = false) as liquidation_error,
  count(*) filter (where le.type = 'seizing' and le.success = true) as seizing_success,
  count(*) filter (where le.type = 'seizing' and le.success = false) as seizing_error,
  count(*) as total
from global.liquidation_execution le
left join global.usg_markets m
  on lower(m.contract_address) = lower(le.market)
group by 1, 2
order by liquidation_error desc, seizing_error desc, total desc, market_name;

-- ============================================================
-- 3. Classification des erreurs par marche
-- ============================================================
select
  coalesce(m.contract_name, 'Unknown market') as market_name,
  lower(le.market) as market,
  le.type,
  case
    when le.error_message ilike '%No route found for collateral%' then 'No route found for collateral'
    when le.error_message ilike '%execution reverted (unknown custom error)%' then 'unexplained revert'
    when le.error_message ilike '%transaction execution reverted%' then 'transaction execution reverted'
    when le.error_message ilike '%ZapCallError%' then 'ZapCallError'
    when le.error_message is null or le.error_message = '' then 'No error message'
    else 'OTHER...'
  end as error_tag,
  count(*) as count
from global.liquidation_execution le
left join global.usg_markets m
  on lower(m.contract_address) = lower(le.market)
where le.success = false
group by 1, 2, 3, 4
order by count desc, market_name, le.type;

-- ============================================================
-- 4. Detail des erreurs de liquidation
-- ============================================================
select
  le.id,
  le.date,
  le.execution_key,
  coalesce(m.contract_name, 'Unknown market') as market_name,
  lower(le.market) as market,
  lower(le.borrower) as borrower,
  le.error_message,
  le.tx_hash
from global.liquidation_execution le
left join global.usg_markets m
  on lower(m.contract_address) = lower(le.market)
where le.type = 'liquidation'
  and le.success = false
order by le.date desc;

-- ============================================================
-- 5. Detail des erreurs de seizing
-- ============================================================
select
  le.id,
  le.date,
  le.execution_key,
  coalesce(m.contract_name, 'Unknown market') as market_name,
  lower(le.market) as market,
  lower(le.borrower) as borrower,
  le.error_message,
  le.tx_hash
from global.liquidation_execution le
left join global.usg_markets m
  on lower(m.contract_address) = lower(le.market)
where le.type = 'seizing'
  and le.success = false
order by le.date desc;

-- ============================================================
-- 6. Executions reussies avec tx_hash
-- ============================================================
select
  le.id,
  le.date,
  le.execution_key,
  coalesce(m.contract_name, 'Unknown market') as market_name,
  lower(le.market) as market,
  lower(le.borrower) as borrower,
  le.type,
  le.repaid_amount,
  le.fee,
  le.collateral_liquidated,
  le.profit,
  le.tx_hash
from global.liquidation_execution le
left join global.usg_markets m
  on lower(m.contract_address) = lower(le.market)
where le.success = true
order by le.date desc;

-- ============================================================
-- 7. Resume des logs generiques par action
-- ============================================================
select
  lbl.action,
  lbl.is_error,
  count(*) as count,
  min(lbl.date) as first_log,
  max(lbl.date) as last_log
from global.liquidation_bot_log lbl
group by 1, 2
order by lbl.action, lbl.is_error desc;

-- ============================================================
-- 8. Logs generiques rattaches a un marche
-- ============================================================
with logs as (
  select
    lbl.id,
    lbl.date,
    lbl.action,
    lbl.execution_key,
    lbl.is_error,
    lbl.data::jsonb as data,
    lower(lbl.data::jsonb #>> '{data,account,market}') as market
  from global.liquidation_bot_log lbl
)
select
  l.date,
  l.action,
  l.execution_key,
  l.is_error,
  coalesce(m.contract_name, 'No market') as market_name,
  l.market,
  l.data
from logs l
left join global.usg_markets m
  on lower(m.contract_address) = l.market
where l.market is not null
order by l.date desc;

-- ============================================================
-- 9. Duree d'une execution_key
-- Remplacer la valeur du where par l'execution_key a analyser.
-- ============================================================
select
  lbl.execution_key,
  min(lbl.date) as started_at,
  max(lbl.date) as finished_at,
  concat(
    floor(extract(epoch from (max(lbl.date) - min(lbl.date))) / 60)::int,
    'm ',
    mod(extract(epoch from (max(lbl.date) - min(lbl.date)))::int, 60),
    's'
  ) as duration,
  count(*) as log_count
from global.liquidation_bot_log lbl
-- where lbl.execution_key = '00000000-0000-0000-0000-000000000000'
group by 1
order by started_at desc;
