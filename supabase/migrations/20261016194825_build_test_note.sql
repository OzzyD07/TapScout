-- Test note (docs/07 C1): an optional short focus given at upload ("focus on editing notes").
-- Start Test prefills it and stores the run's own copy in test_runs.config.testNote; the planner
-- gets it as a goal, never as permission.
alter table public.app_builds
  add column test_note text check (test_note is null or char_length(test_note) <= 300);
