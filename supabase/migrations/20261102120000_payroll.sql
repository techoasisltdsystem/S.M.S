-- Payroll: salary profiles, allowances and deductions, salary advances, monthly payroll runs with a calculate ->
-- approve (by a second person) -> paid workflow, and payslips staff can read. Money is NUMERIC(12,2); bank details
-- are readable only by payroll managers (staff see their own, masked).

INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'payroll.manage'), ('finance_officer', 'payroll.manage'),
  ('school_admin', 'payroll.approve'), ('headteacher', 'payroll.approve')
ON CONFLICT DO NOTHING;

CREATE TABLE public.payroll_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL,
  basic_salary NUMERIC(12,2) NOT NULL CHECK (basic_salary >= 0 AND basic_salary <= 10000000),
  currency TEXT NOT NULL DEFAULT 'GHS',
  pay_grade TEXT CHECK (pay_grade IS NULL OR length(pay_grade) <= 40),
  bank_name TEXT CHECK (bank_name IS NULL OR length(bank_name) <= 80),
  account_name TEXT CHECK (account_name IS NULL OR length(account_name) <= 120),
  account_number TEXT CHECK (account_number IS NULL OR account_number ~ '^[0-9A-Za-z -]{4,34}$'),
  tax_id TEXT CHECK (tax_id IS NULL OR length(tax_id) <= 40),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (school_id, profile_id),
  FOREIGN KEY (school_id, profile_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.payroll_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  profile_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('allowance', 'deduction')),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  calc TEXT NOT NULL DEFAULT 'fixed' CHECK (calc IN ('fixed', 'percent')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (calc = 'fixed' OR amount <= 100)
);

CREATE TABLE public.salary_advances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  months INT NOT NULL CHECK (months BETWEEN 1 AND 24),
  monthly_deduction NUMERIC(12,2) NOT NULL,
  balance NUMERIC(12,2) NOT NULL CHECK (balance >= 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'repaid')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT
);

CREATE TABLE public.payroll_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  period TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'approved', 'paid', 'cancelled')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  calculated_by UUID,
  calculated_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  paid_by UUID,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT
);
CREATE UNIQUE INDEX payroll_runs_one_per_period ON public.payroll_runs (school_id, period) WHERE status <> 'cancelled';

CREATE TABLE public.payslips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.payroll_runs (id) ON DELETE CASCADE,
  school_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  number TEXT NOT NULL,
  currency TEXT NOT NULL,
  basic NUMERIC(12,2) NOT NULL,
  allowances NUMERIC(12,2) NOT NULL,
  deductions NUMERIC(12,2) NOT NULL,
  advance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross NUMERIC(12,2) NOT NULL,
  net NUMERIC(12,2) NOT NULL,
  lines JSONB NOT NULL DEFAULT '[]',
  bank TEXT,
  UNIQUE (run_id, profile_id)
);

ALTER TABLE public.payroll_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_profiles, public.payroll_items, public.salary_advances, public.payroll_runs, public.payslips FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payroll_mask(_acct TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _acct IS NULL THEN NULL ELSE repeat('•', greatest(length(_acct) - 4, 0)) || right(_acct, 4) END
$$;

-- ---------------------------------------------------------------------------------------------
-- Salary profiles and pay items
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_profile_save(_school UUID, _profile UUID, _basic NUMERIC, _currency TEXT, _grade TEXT, _bank TEXT, _account_name TEXT, _account_number TEXT, _tax_id TEXT, _active BOOLEAN)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID;
BEGIN
  IF NOT public.has_permission(_school, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot manage payroll' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_memberships m WHERE m.school_id = _school AND m.profile_id = _profile AND m.role NOT IN ('student', 'parent')) THEN
    RAISE EXCEPTION 'salary profiles are for staff of this school' USING ERRCODE = '22023';
  END IF;
  IF _basic IS NULL OR _basic < 0 THEN RAISE EXCEPTION 'enter the basic salary' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.payroll_profiles (school_id, profile_id, basic_salary, currency, pay_grade, bank_name, account_name, account_number, tax_id, active)
  VALUES (_school, _profile, round(_basic, 2), COALESCE(NULLIF(btrim(_currency), ''), 'GHS'), NULLIF(btrim(COALESCE(_grade, '')), ''), NULLIF(btrim(COALESCE(_bank, '')), ''),
          NULLIF(btrim(COALESCE(_account_name, '')), ''), NULLIF(btrim(COALESCE(_account_number, '')), ''), NULLIF(btrim(COALESCE(_tax_id, '')), ''), COALESCE(_active, TRUE))
  ON CONFLICT (school_id, profile_id) DO UPDATE SET basic_salary = EXCLUDED.basic_salary, currency = EXCLUDED.currency, pay_grade = EXCLUDED.pay_grade, bank_name = EXCLUDED.bank_name,
    account_name = EXCLUDED.account_name, account_number = EXCLUDED.account_number, tax_id = EXCLUDED.tax_id, active = EXCLUDED.active, updated_at = clock_timestamp()
  RETURNING id INTO rid;
  PERFORM public.write_audit(_school, 'payroll_profile_saved', 'payroll_profile', rid, (SELECT full_name FROM public.profiles WHERE id = _profile), jsonb_build_object('basic', round(_basic, 2), 'active', _active));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_profiles_list(_school UUID)
RETURNS TABLE (profile_id UUID, name TEXT, role TEXT, email TEXT, has_profile BOOLEAN, basic_salary NUMERIC, currency TEXT, pay_grade TEXT, bank_name TEXT,
               account_name TEXT, account_number TEXT, tax_id TEXT, active BOOLEAN, allowances NUMERIC, deductions NUMERIC, advance_balance NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot see payroll' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, (SELECT string_agg(DISTINCT m2.role::text, ', ') FROM public.school_memberships m2 WHERE m2.profile_id = p.id AND m2.school_id = _school),
      p.email::text, pp.id IS NOT NULL, pp.basic_salary, pp.currency, pp.pay_grade, pp.bank_name, pp.account_name, pp.account_number, pp.tax_id, COALESCE(pp.active, FALSE),
      (SELECT COALESCE(sum(CASE WHEN i.calc = 'percent' THEN round(pp.basic_salary * i.amount / 100, 2) ELSE i.amount END), 0) FROM public.payroll_items i
        WHERE i.school_id = _school AND i.active AND i.kind = 'allowance' AND (i.profile_id IS NULL OR i.profile_id = p.id)),
      (SELECT COALESCE(sum(CASE WHEN i.calc = 'percent' THEN round(pp.basic_salary * i.amount / 100, 2) ELSE i.amount END), 0) FROM public.payroll_items i
        WHERE i.school_id = _school AND i.active AND i.kind = 'deduction' AND (i.profile_id IS NULL OR i.profile_id = p.id)),
      (SELECT COALESCE(sum(a.balance), 0) FROM public.salary_advances a WHERE a.school_id = _school AND a.profile_id = p.id AND a.status = 'approved')
    FROM public.profiles p LEFT JOIN public.payroll_profiles pp ON pp.school_id = _school AND pp.profile_id = p.id
    WHERE p.school_id = _school AND EXISTS (SELECT 1 FROM public.school_memberships m WHERE m.profile_id = p.id AND m.school_id = _school AND m.role NOT IN ('student', 'parent') AND m.status = 'active')
    ORDER BY p.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_item_save(_school UUID, _id UUID, _profile UUID, _kind TEXT, _name TEXT, _calc TEXT, _amount NUMERIC, _active BOOLEAN)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID;
BEGIN
  IF NOT public.has_permission(_school, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot manage payroll' USING ERRCODE = '42501'; END IF;
  IF _calc = 'percent' AND (_amount IS NULL OR _amount <= 0 OR _amount > 100) THEN RAISE EXCEPTION 'a percentage must be between 0 and 100' USING ERRCODE = '22023'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'enter an amount above zero' USING ERRCODE = '22023'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.payroll_items (school_id, profile_id, kind, name, calc, amount, active, created_by)
    VALUES (_school, _profile, _kind, btrim(_name), COALESCE(_calc, 'fixed'), round(_amount, 2), COALESCE(_active, TRUE), public.my_profile_id(_school)) RETURNING id INTO rid;
  ELSE
    UPDATE public.payroll_items SET profile_id = _profile, kind = _kind, name = btrim(_name), calc = COALESCE(_calc, 'fixed'), amount = round(_amount, 2), active = COALESCE(_active, TRUE)
    WHERE id = _id AND school_id = _school RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'no such item' USING ERRCODE = 'P0002'; END IF;
  END IF;
  PERFORM public.write_audit(_school, 'payroll_profile_saved', 'payroll_item', rid, left(btrim(_name), 80), jsonb_build_object('kind', _kind, 'calc', _calc, 'amount', _amount, 'active', _active));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_items_list(_school UUID)
RETURNS TABLE (id UUID, profile_id UUID, staff TEXT, kind TEXT, name TEXT, calc TEXT, amount NUMERIC, active BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot see payroll' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT i.id, i.profile_id, p.full_name, i.kind, i.name, i.calc, i.amount, i.active FROM public.payroll_items i LEFT JOIN public.profiles p ON p.id = i.profile_id
    WHERE i.school_id = _school ORDER BY i.kind, i.name;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Salary advances (staff ask; a payroll approver who is not the asker decides; repaid through payroll)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_request(_school UUID, _amount NUMERIC, _months INT, _reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school); pp public.payroll_profiles; rid UUID;
BEGIN
  IF me IS NULL OR NOT public.is_staff(_school) THEN RAISE EXCEPTION 'advances are for staff' USING ERRCODE = '42501'; END IF;
  SELECT * INTO pp FROM public.payroll_profiles WHERE school_id = _school AND profile_id = me AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'you have no salary profile yet; ask the finance office' USING ERRCODE = '22023'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > pp.basic_salary * 3 THEN RAISE EXCEPTION 'an advance can be up to three months of basic salary (%)', pp.basic_salary * 3 USING ERRCODE = '22023'; END IF;
  IF _months IS NULL OR _months < 1 OR _months > 24 THEN RAISE EXCEPTION 'repay over 1 to 24 months' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.salary_advances WHERE school_id = _school AND profile_id = me AND status IN ('requested', 'approved')) THEN
    RAISE EXCEPTION 'you already have an advance open' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.salary_advances (school_id, profile_id, amount, months, monthly_deduction, balance, reason)
  VALUES (_school, me, round(_amount, 2), _months, round(_amount / _months, 2), round(_amount, 2), btrim(_reason)) RETURNING id INTO rid;
  PERFORM public.write_audit(_school, 'payroll_advance', 'salary_advance', rid, 'requested', jsonb_build_object('amount', _amount, 'months', _months));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT _school, m.profile_id, 'payroll_advance', 'A salary advance was requested', format('%s: %s', (SELECT full_name FROM public.profiles WHERE id = me), to_char(_amount, 'FM999,999,990.00')), '/payroll'
  FROM public.school_memberships m WHERE m.school_id = _school AND m.status = 'active' AND m.role IN ('school_admin', 'headteacher');
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.advance_decide(_id UUID, _approve BOOLEAN, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.salary_advances;
BEGIN
  SELECT * INTO a FROM public.salary_advances WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(a.school_id, 'payroll.approve') THEN RAISE EXCEPTION 'you cannot decide advances' USING ERRCODE = '42501'; END IF;
  IF a.profile_id = public.my_profile_id(a.school_id) THEN RAISE EXCEPTION 'someone else must decide your own advance' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'requested' THEN RAISE EXCEPTION 'this advance has already been decided' USING ERRCODE = '22023'; END IF;
  UPDATE public.salary_advances SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, decided_by = public.my_profile_id(a.school_id), decided_at = clock_timestamp(),
    decision_note = NULLIF(btrim(COALESCE(_note, '')), '') WHERE id = a.id;
  PERFORM public.write_audit(a.school_id, 'payroll_advance', 'salary_advance', a.id, CASE WHEN _approve THEN 'approved' ELSE 'rejected' END, jsonb_build_object('amount', a.amount));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  VALUES (a.school_id, a.profile_id, 'payroll_advance', CASE WHEN _approve THEN 'Your salary advance was approved' ELSE 'Your salary advance was declined' END,
          format('%s, repaid over %s month(s).', to_char(a.amount, 'FM999,999,990.00'), a.months), '/payroll');
END $$;

CREATE OR REPLACE FUNCTION public.advances_list(_school UUID)
RETURNS TABLE (id UUID, staff TEXT, amount NUMERIC, months INT, monthly_deduction NUMERIC, balance NUMERIC, reason TEXT, status TEXT, requested_at TIMESTAMPTZ, decided_by TEXT, decision_note TEXT, mine BOOLEAN, can_decide BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school); mgr BOOLEAN := public.has_permission(_school, 'payroll.manage') OR public.has_permission(_school, 'payroll.approve');
BEGIN
  IF NOT public.is_staff(_school) THEN RAISE EXCEPTION 'advances are for staff' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT a.id, p.full_name, a.amount, a.months, a.monthly_deduction, a.balance, a.reason, a.status, a.requested_at, d.full_name, a.decision_note, a.profile_id = me,
      a.status = 'requested' AND a.profile_id <> me AND public.has_permission(_school, 'payroll.approve')
    FROM public.salary_advances a JOIN public.profiles p ON p.id = a.profile_id LEFT JOIN public.profiles d ON d.id = a.decided_by
    WHERE a.school_id = _school AND (mgr OR a.profile_id = me) ORDER BY a.requested_at DESC LIMIT 200;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Payroll runs
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_run_create(_school UUID, _period TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID;
BEGIN
  IF NOT public.has_permission(_school, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot run payroll' USING ERRCODE = '42501'; END IF;
  IF _period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'choose a month' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.payroll_runs WHERE school_id = _school AND period = _period AND status <> 'cancelled') THEN RAISE EXCEPTION 'there is already a payroll for %', _period USING ERRCODE = '23505'; END IF;
  INSERT INTO public.payroll_runs (school_id, period, created_by) VALUES (_school, _period, public.my_profile_id(_school)) RETURNING id INTO rid;
  PERFORM public.write_audit(_school, 'payroll_run', 'payroll_run', rid, _period, jsonb_build_object('step', 'created'));
  RETURN rid;
END $$;

-- Work out every payslip from the current salary profiles, pay items and approved advances. Can be repeated until approved.
CREATE OR REPLACE FUNCTION public.payroll_run_calculate(_run UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payroll_runs; pp RECORD; it RECORD; lines JSONB; allw NUMERIC; ded NUMERIC; adv NUMERIC; amt NUMERIC; n INT := 0; warnings JSONB := '[]'; seq INT := 0;
BEGIN
  SELECT * INTO r FROM public.payroll_runs WHERE id = _run FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(r.school_id, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot run payroll' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('draft', 'calculated') THEN RAISE EXCEPTION 'an approved or paid payroll cannot be recalculated' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.payslips WHERE run_id = r.id;
  FOR pp IN SELECT x.*, p.full_name FROM public.payroll_profiles x JOIN public.profiles p ON p.id = x.profile_id
            WHERE x.school_id = r.school_id AND x.active AND EXISTS (SELECT 1 FROM public.school_memberships m WHERE m.profile_id = x.profile_id AND m.school_id = r.school_id AND m.status = 'active') ORDER BY p.full_name LOOP
    lines := jsonb_build_array(jsonb_build_object('kind', 'basic', 'name', 'Basic salary', 'amount', pp.basic_salary));
    allw := 0; ded := 0; adv := 0;
    FOR it IN SELECT * FROM public.payroll_items i WHERE i.school_id = r.school_id AND i.active AND (i.profile_id IS NULL OR i.profile_id = pp.profile_id) ORDER BY i.kind, i.name LOOP
      amt := CASE WHEN it.calc = 'percent' THEN round(pp.basic_salary * it.amount / 100, 2) ELSE it.amount END;
      IF it.kind = 'allowance' THEN allw := allw + amt; ELSE ded := ded + amt; END IF;
      lines := lines || jsonb_build_object('kind', it.kind, 'name', it.name || CASE WHEN it.calc = 'percent' THEN ' (' || it.amount || '%)' ELSE '' END, 'amount', amt);
    END LOOP;
    SELECT COALESCE(sum(LEAST(a.monthly_deduction, a.balance)), 0) INTO adv FROM public.salary_advances a WHERE a.school_id = r.school_id AND a.profile_id = pp.profile_id AND a.status = 'approved';
    IF adv > 0 THEN lines := lines || jsonb_build_object('kind', 'advance', 'name', 'Salary advance repayment', 'amount', adv); END IF;
    IF pp.basic_salary + allw - ded - adv < 0 THEN
      warnings := warnings || jsonb_build_object('staff', pp.full_name, 'issue', 'deductions exceed pay; net set to zero');
    END IF;
    IF pp.account_number IS NULL THEN warnings := warnings || jsonb_build_object('staff', pp.full_name, 'issue', 'no bank account on file'); END IF;
    seq := seq + 1;
    INSERT INTO public.payslips (run_id, school_id, profile_id, number, currency, basic, allowances, deductions, advance_deduction, gross, net, lines, bank)
    VALUES (r.id, r.school_id, pp.profile_id, 'PS-' || replace(r.period, '-', '') || '-' || lpad(seq::text, 4, '0'), pp.currency, pp.basic_salary, allw, ded, adv,
            pp.basic_salary + allw, GREATEST(pp.basic_salary + allw - ded - adv, 0), lines,
            CASE WHEN pp.bank_name IS NOT NULL THEN pp.bank_name || ' ' || public.payroll_mask(pp.account_number) END);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'no active salary profiles to pay; add salary profiles first' USING ERRCODE = '22023'; END IF;
  UPDATE public.payroll_runs SET status = 'calculated', calculated_by = public.my_profile_id(r.school_id), calculated_at = clock_timestamp() WHERE id = r.id;
  PERFORM public.write_audit(r.school_id, 'payroll_run', 'payroll_run', r.id, r.period, jsonb_build_object('step', 'calculated', 'payslips', n, 'warnings', jsonb_array_length(warnings)));
  RETURN jsonb_build_object('payslips', n, 'warnings', warnings);
END $$;

-- A second person approves. Whoever created or calculated the run cannot approve it.
CREATE OR REPLACE FUNCTION public.payroll_run_approve(_run UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payroll_runs; me UUID;
BEGIN
  SELECT * INTO r FROM public.payroll_runs WHERE id = _run FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(r.school_id, 'payroll.approve') THEN RAISE EXCEPTION 'you cannot approve payroll' USING ERRCODE = '42501'; END IF;
  me := public.my_profile_id(r.school_id);
  IF r.status <> 'calculated' THEN RAISE EXCEPTION 'only a calculated payroll can be approved' USING ERRCODE = '22023'; END IF;
  IF me IN (r.created_by, r.calculated_by) THEN RAISE EXCEPTION 'someone other than the person who prepared it must approve' USING ERRCODE = '42501'; END IF;
  UPDATE public.payroll_runs SET status = 'approved', approved_by = me, approved_at = clock_timestamp() WHERE id = r.id;
  PERFORM public.write_audit(r.school_id, 'payroll_run', 'payroll_run', r.id, r.period, jsonb_build_object('step', 'approved'));
END $$;

-- Recorded once the bank transfer is done. Advances are reduced by what was taken, and staff are told their payslip is ready.
CREATE OR REPLACE FUNCTION public.payroll_run_mark_paid(_run UUID, _reference TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payroll_runs; s RECORD; take NUMERIC; a RECORD;
BEGIN
  SELECT * INTO r FROM public.payroll_runs WHERE id = _run FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(r.school_id, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot run payroll' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'only an approved payroll can be marked paid' USING ERRCODE = '22023'; END IF;
  UPDATE public.payroll_runs SET status = 'paid', paid_by = public.my_profile_id(r.school_id), paid_at = clock_timestamp(), payment_reference = NULLIF(btrim(COALESCE(_reference, '')), '') WHERE id = r.id;
  FOR s IN SELECT * FROM public.payslips WHERE run_id = r.id AND advance_deduction > 0 LOOP
    take := s.advance_deduction;
    FOR a IN SELECT * FROM public.salary_advances WHERE school_id = r.school_id AND profile_id = s.profile_id AND status = 'approved' ORDER BY requested_at FOR UPDATE LOOP
      EXIT WHEN take <= 0;
      UPDATE public.salary_advances SET balance = balance - LEAST(take, balance), status = CASE WHEN balance - LEAST(take, balance) <= 0 THEN 'repaid' ELSE status END WHERE id = a.id;
      take := take - LEAST(take, a.balance);
    END LOOP;
  END LOOP;
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT r.school_id, p.profile_id, 'payslip_ready', 'Your payslip is ready', format('%s: net %s %s', r.period, p.currency, to_char(p.net, 'FM999,999,990.00')), '/payroll'
  FROM public.payslips p WHERE p.run_id = r.id;
  PERFORM public.write_audit(r.school_id, 'payroll_run', 'payroll_run', r.id, r.period, jsonb_build_object('step', 'paid', 'reference', _reference));
END $$;

CREATE OR REPLACE FUNCTION public.payroll_run_cancel(_run UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payroll_runs;
BEGIN
  SELECT * INTO r FROM public.payroll_runs WHERE id = _run FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(r.school_id, 'payroll.manage') THEN RAISE EXCEPTION 'you cannot run payroll' USING ERRCODE = '42501'; END IF;
  IF r.status NOT IN ('draft', 'calculated') THEN RAISE EXCEPTION 'an approved or paid payroll cannot be cancelled' USING ERRCODE = '22023'; END IF;
  UPDATE public.payroll_runs SET status = 'cancelled' WHERE id = r.id;
  PERFORM public.write_audit(r.school_id, 'payroll_run', 'payroll_run', r.id, r.period, jsonb_build_object('step', 'cancelled'));
END $$;

CREATE OR REPLACE FUNCTION public.payroll_runs_list(_school UUID)
RETURNS TABLE (id UUID, period TEXT, status TEXT, staff BIGINT, gross NUMERIC, deductions NUMERIC, net NUMERIC, created_by TEXT, calculated_at TIMESTAMPTZ,
               approved_by TEXT, approved_at TIMESTAMPTZ, paid_at TIMESTAMPTZ, payment_reference TEXT, can_approve BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school);
BEGIN
  IF NOT (public.has_permission(_school, 'payroll.manage') OR public.has_permission(_school, 'payroll.approve')) THEN RAISE EXCEPTION 'you cannot see payroll' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT r.id, r.period, r.status, (SELECT count(*) FROM public.payslips p WHERE p.run_id = r.id),
      (SELECT COALESCE(sum(p.gross), 0) FROM public.payslips p WHERE p.run_id = r.id), (SELECT COALESCE(sum(p.deductions + p.advance_deduction), 0) FROM public.payslips p WHERE p.run_id = r.id),
      (SELECT COALESCE(sum(p.net), 0) FROM public.payslips p WHERE p.run_id = r.id), c.full_name, r.calculated_at, a.full_name, r.approved_at, r.paid_at, r.payment_reference,
      r.status = 'calculated' AND public.has_permission(_school, 'payroll.approve') AND me IS DISTINCT FROM r.created_by AND me IS DISTINCT FROM r.calculated_by
    FROM public.payroll_runs r LEFT JOIN public.profiles c ON c.id = r.created_by LEFT JOIN public.profiles a ON a.id = r.approved_by
    WHERE r.school_id = _school ORDER BY r.period DESC, r.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.payslips_for_run(_run UUID)
RETURNS TABLE (id UUID, number TEXT, staff TEXT, currency TEXT, basic NUMERIC, allowances NUMERIC, deductions NUMERIC, advance_deduction NUMERIC, gross NUMERIC, net NUMERIC, lines JSONB, bank TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.payroll_runs;
BEGIN
  SELECT * INTO r FROM public.payroll_runs WHERE id = _run;
  IF NOT FOUND OR NOT (public.has_permission(r.school_id, 'payroll.manage') OR public.has_permission(r.school_id, 'payroll.approve')) THEN RAISE EXCEPTION 'you cannot see payroll' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT p.id, p.number, pr.full_name, p.currency, p.basic, p.allowances, p.deductions, p.advance_deduction, p.gross, p.net, p.lines, p.bank
    FROM public.payslips p JOIN public.profiles pr ON pr.id = p.profile_id WHERE p.run_id = r.id ORDER BY pr.full_name;
END $$;

-- A staff member's own payslips, once the payroll is paid.
CREATE OR REPLACE FUNCTION public.my_payslips(_school UUID)
RETURNS TABLE (id UUID, number TEXT, period TEXT, currency TEXT, basic NUMERIC, allowances NUMERIC, deductions NUMERIC, advance_deduction NUMERIC, gross NUMERIC, net NUMERIC, lines JSONB, bank TEXT, paid_at TIMESTAMPTZ, staff TEXT, school TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(_school) THEN RAISE EXCEPTION 'payslips are for staff' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT p.id, p.number, r.period, p.currency, p.basic, p.allowances, p.deductions, p.advance_deduction, p.gross, p.net, p.lines, p.bank, r.paid_at,
      (SELECT full_name FROM public.profiles WHERE id = p.profile_id), (SELECT name FROM public.schools WHERE id = _school)
    FROM public.payslips p JOIN public.payroll_runs r ON r.id = p.run_id
    WHERE p.school_id = _school AND p.profile_id = public.my_profile_id(_school) AND r.status = 'paid' ORDER BY r.period DESC;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_dashboard(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cur public.payroll_runs; last_paid public.payroll_runs; profiles_n BIGINT;
BEGIN
  IF NOT (public.has_permission(_school, 'payroll.manage') OR public.has_permission(_school, 'payroll.approve')) THEN RAISE EXCEPTION 'you cannot see payroll' USING ERRCODE = '42501'; END IF;
  SELECT * INTO cur FROM public.payroll_runs WHERE school_id = _school AND status <> 'cancelled' ORDER BY period DESC, created_at DESC LIMIT 1;
  SELECT * INTO last_paid FROM public.payroll_runs WHERE school_id = _school AND status = 'paid' ORDER BY period DESC LIMIT 1;
  SELECT count(*) INTO profiles_n FROM public.payroll_profiles WHERE school_id = _school AND active;
  RETURN jsonb_build_object(
    'current', CASE WHEN cur.id IS NULL THEN NULL ELSE jsonb_build_object('id', cur.id, 'period', cur.period, 'status', cur.status,
      'gross', (SELECT COALESCE(sum(gross), 0) FROM public.payslips WHERE run_id = cur.id), 'net', (SELECT COALESCE(sum(net), 0) FROM public.payslips WHERE run_id = cur.id),
      'deductions', (SELECT COALESCE(sum(deductions + advance_deduction), 0) FROM public.payslips WHERE run_id = cur.id),
      'staff', (SELECT count(*) FROM public.payslips WHERE run_id = cur.id),
      'created_at', cur.created_at, 'created_by', (SELECT full_name FROM public.profiles WHERE id = cur.created_by), 'calculated_at', cur.calculated_at,
      'approved_at', cur.approved_at, 'approved_by', (SELECT full_name FROM public.profiles WHERE id = cur.approved_by), 'paid_at', cur.paid_at) END,
    'staff_paid', CASE WHEN last_paid.id IS NULL THEN 0 ELSE (SELECT count(*) FROM public.payslips WHERE run_id = last_paid.id) END,
    'staff_on_payroll', profiles_n,
    'staff_total', (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = _school AND m.status = 'active' AND m.role NOT IN ('student', 'parent')),
    'pending_runs', (SELECT count(*) FROM public.payroll_runs WHERE school_id = _school AND status IN ('calculated', 'approved')),
    'advances_outstanding', (SELECT COALESCE(sum(balance), 0) FROM public.salary_advances WHERE school_id = _school AND status = 'approved'),
    'advances_requested', (SELECT count(*) FROM public.salary_advances WHERE school_id = _school AND status = 'requested'),
    'by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('period', r.period, 'net', (SELECT COALESCE(sum(net), 0) FROM public.payslips WHERE run_id = r.id)) ORDER BY r.period)
                          FROM (SELECT * FROM public.payroll_runs WHERE school_id = _school AND status = 'paid' ORDER BY period DESC LIMIT 6) r), '[]'));
END $$;

CREATE OR REPLACE FUNCTION public.payroll_activity(_school UUID)
RETURNS TABLE (id UUID, at TIMESTAMPTZ, actor TEXT, action TEXT, target TEXT, details JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_permission(_school, 'payroll.manage') OR public.has_permission(_school, 'payroll.approve')) THEN RAISE EXCEPTION 'you cannot see payroll' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT l.id, l.created_at, l.actor_name, l.action::text, l.target_name, l.details FROM public.audit_logs l
    WHERE l.school_id = _school AND l.action::text IN ('payroll_profile_saved', 'payroll_run', 'payroll_advance') ORDER BY l.created_at DESC LIMIT 50;
END $$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY['payroll_profile_save(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN)', 'payroll_profiles_list(UUID)',
    'payroll_item_save(UUID, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, BOOLEAN)', 'payroll_items_list(UUID)', 'advance_request(UUID, NUMERIC, INT, TEXT)', 'advance_decide(UUID, BOOLEAN, TEXT)',
    'advances_list(UUID)', 'payroll_run_create(UUID, TEXT)', 'payroll_run_calculate(UUID)', 'payroll_run_approve(UUID)', 'payroll_run_mark_paid(UUID, TEXT)', 'payroll_run_cancel(UUID)',
    'payroll_runs_list(UUID)', 'payslips_for_run(UUID)', 'my_payslips(UUID)', 'payroll_dashboard(UUID)', 'payroll_activity(UUID)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;
