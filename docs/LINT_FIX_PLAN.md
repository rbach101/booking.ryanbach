# ESLint Fix Plan – Gradual Cleanup

Rules were downgraded from `error` to `warn` to reduce noise. Fix issues gradually as you touch files.

## Rules to Fix

| Rule | Count | Priority | Notes |
|------|-------|----------|-------|
| `@typescript-eslint/no-explicit-any` | ~200 | Medium | Replace `any` with proper types |
| `react-hooks/exhaustive-deps` | ~32 | Low | Add deps or add eslint-disable with comment |
| `no-empty` | ~20 | Low | Add comment or minimal logic in empty blocks |
| `prefer-const` | ~5 | Low | Change `let` to `const` |
| `@typescript-eslint/no-require-imports` | 1 | Low | Use `import` in tailwind.config |

---

## Fix Order (by impact)

### Phase 1 – Core user flows (high traffic)
Fix when you next edit these files:

- [ ] `src/components/booking/NewBookingDialog.tsx` (~8 any)
- [ ] `src/components/dashboard/PendingApprovals.tsx` (~4 any, 2 deps)
- [ ] `src/components/calendar/BookingDetailsDialog.tsx` (~6 any, 3 deps)
- [ ] `src/components/email/ComposeEmail.tsx` (~7 any)
- [ ] `src/pages/BookingsPage.tsx`

### Phase 2 – Settings & admin
- [ ] `src/components/settings/NotificationSettings.tsx` (~15 any)
- [ ] `src/components/settings/CalendarSettings.tsx` (~1 any, 2 deps)
- [ ] `src/components/settings/BusinessRulesSettings.tsx` (~2 any)
- [ ] `src/components/practitioners/PractitionerCard.tsx` (~2 any)
- [ ] `src/components/practitioners/PractitionerCalendarConnect.tsx` (~1 any, 1 deps)

### Phase 3 – Calendar & dashboard
- [ ] `src/components/calendar/WeekCalendar.tsx` (~2 any, 2 deps)
- [ ] `src/components/calendar/MobileDayCalendar.tsx` (~2 any, 2 deps)
- [ ] `src/components/dashboard/PaymentTracker.tsx` (1 prefer-const, 1 any)
- [ ] `src/components/dashboard/RecentIntakeForms.tsx` (~1 any)
- [ ] `src/components/dashboard/StaffTutorial.tsx` (1 warn)

### Phase 4 – Other components
- [ ] `src/components/email/EmailTemplates.tsx`, `SentEmails.tsx`
- [ ] `src/components/practitioners/EditPractitionerDialog.tsx`, `ScheduleEditor.tsx`
- [ ] `src/components/booking/BookingWizard.tsx`
- [ ] `src/App.tsx` (1 any in lazyWithRetry)

### Phase 5 – Supabase functions (optional, lower priority)
- [ ] `supabase/functions/**` – ~50+ any, ~20 no-empty  
  Consider keeping `any` in edge functions or fixing only when you change them.

---

## Quick Fix Patterns

### Replace `any` with proper types
```ts
// Before
const data = response.data as any;

// After – use unknown + narrow
const data = response.data as unknown;
if (data && typeof data === 'object' && 'id' in data) {
  // use data.id
}

// Or define an interface
interface ApiResponse { id: string; name: string; }
const data = response.data as ApiResponse;
```

### Fix `react-hooks/exhaustive-deps`
```ts
// Option A: Add the dependency (preferred if safe)
useEffect(() => {
  fetchData();
}, [fetchData]);  // wrap fetchData in useCallback if needed

// Option B: Intentional omit – add comment
useEffect(() => {
  fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);  // run once on mount
```

### Fix `prefer-const`
```ts
// Before
let query = supabase.from('table').select();

// After
const query = supabase.from('table').select();
```

### Fix `no-empty`
```ts
// Before
try { } catch (e) { }

// After
try {
  // intentional no-op
} catch (e) {
  console.error(e);
}
```

---

## Check progress

```bash
npm run lint 2>&1 | grep -E "error|warning" | wc -l
```

Or fix all auto-fixable issues:
```bash
npm run lint -- --fix
```
