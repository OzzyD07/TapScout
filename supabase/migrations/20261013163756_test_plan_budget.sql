-- App-level test plan (docs/07 B11-2): one model call per session once the first screens are known,
-- charged to its own budget so it never takes planner or review calls away. Configs without the
-- new fields get the defaults below.

alter table public.model_budgets drop constraint model_budgets_role_check;
alter table public.model_budgets
  add constraint model_budgets_role_check
  check (role in ('planner', 'vision', 'report', 'triage', 'test_plan'));

create or replace function public.create_test_run(
  p_owner uuid,
  p_android_build uuid,
  p_ios_build uuid,
  p_modes text[],
  p_config jsonb,
  p_version_stamp jsonb
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_run uuid;
  v_session uuid;
  v_platform text;
  v_build uuid;
  v_budget jsonb := p_config -> 'budget';
begin
  if p_android_build is null and p_ios_build is null then
    raise exception 'select at least one platform build' using errcode = 'AQ004';
  end if;
  if v_budget is null or v_budget ->> 'budgetVersion' is null then
    raise exception 'config.budget is required' using errcode = 'AQ004';
  end if;

  foreach v_platform in array array['android', 'ios'] loop
    v_build := case v_platform when 'android' then p_android_build else p_ios_build end;
    if v_build is not null and not exists (
      select 1 from public.app_builds b
      where b.id = v_build
        and b.platform = v_platform
        and (b.owner_id = p_owner or b.is_sample)
        and b.validation_status in ('uploaded', 'accepted')
        and b.object_key is not null
    ) then
      raise exception '% build is not usable', v_platform using errcode = 'AQ004';
    end if;
  end loop;

  insert into public.test_runs (owner_id, modes, android_build_id, ios_build_id, config, budget_version, version_stamp)
  values (p_owner, p_modes, p_android_build, p_ios_build, p_config, v_budget ->> 'budgetVersion', p_version_stamp)
  returning id into v_run;

  foreach v_platform in array array['android', 'ios'] loop
    v_build := case v_platform when 'android' then p_android_build else p_ios_build end;
    continue when v_build is null;

    insert into public.platform_sessions (run_id, platform, build_id)
    values (v_run, v_platform, v_build)
    returning id into v_session;

    insert into public.model_budgets (run_id, session_id, role, limit_input, limit_output, limit_requests)
    values
      (v_run, v_session, 'planner',
        (v_budget -> 'tokens' ->> 'plannerInput')::int,
        (v_budget -> 'tokens' ->> 'plannerOutput')::int,
        (v_budget ->> 'maxPlannerRequests')::int),
      (v_run, v_session, 'vision',
        (v_budget -> 'tokens' ->> 'visionInput')::int,
        (v_budget -> 'tokens' ->> 'visionOutput')::int,
        (v_budget ->> 'maxVisionRequests')::int),
      (v_run, v_session, 'triage',
        coalesce((v_budget -> 'tokens' ->> 'triageInput')::int, 24000),
        coalesce((v_budget -> 'tokens' ->> 'triageOutput')::int, 6000),
        coalesce((v_budget ->> 'maxTriageRequests')::int, 2)),
      (v_run, v_session, 'test_plan',
        coalesce((v_budget -> 'tokens' ->> 'testPlanInput')::int, 8000),
        coalesce((v_budget -> 'tokens' ->> 'testPlanOutput')::int, 2000),
        coalesce((v_budget ->> 'maxTestPlanRequests')::int, 1));
  end loop;

  insert into public.dispatch_outbox (kind, run_id, idempotency_key)
  values ('dispatch_run', v_run, 'dispatch_run:' || v_run);

  return v_run;
end;
$$;
