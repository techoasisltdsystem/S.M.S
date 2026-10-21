-- platform_report writes an event-log row, so it cannot be declared STABLE.
ALTER FUNCTION public.platform_report(DATE, DATE) VOLATILE;
