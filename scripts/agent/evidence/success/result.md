O fluxo de disponibilidade tem duas metades. A primeira é a **configuração**: o usuário define seus horários em schedules. A segunda é o **cálculo de slots**: quando alguém abre a página de agendamento (o Booker), o servidor cruza esses horários com o que já está ocupado e devolve os horários livres. O cálculo fica quase todo em `packages/features` e numa classe grande do tRPC. A web e a API v2 usam esse mesmo núcleo.

## 1. Configuração (schedules e date overrides)

O usuário edita seus horários semanais e as exceções por data (date overrides) nas telas abaixo, que gravam via tRPC.

- **Telas**
  - `apps/web/app/(use-page-wrapper)/(main-nav)/availability/page.tsx` → `apps/web/modules/availability/availability-view.tsx` (lista de schedules)
  - `apps/web/app/(use-page-wrapper)/availability/[schedule]/page.tsx` → `apps/web/modules/availability/[schedule]/schedule-view.tsx` (edição)
  - `apps/web/modules/availability/troubleshoot/troubleshoot-view.tsx` (troubleshooter)
  - `apps/web/modules/event-types/components/tabs/availability/EventAvailabilityTab.tsx` (escolher o schedule de um event type)
- **Componentes compartilhados**: `packages/features/schedules/components/ScheduleComponent.tsx`, `DateOverrideInputDialog.tsx`, `DateOverrideList.tsx`, `ScheduleListItem.tsx`, e `packages/platform/atoms/availability/AvailabilitySettings.tsx`
- **tRPC**: `packages/trpc/server/routers/viewer/availability/_router.tsx`, mais `schedule/_router.tsx` com os handlers `create`, `get`, `update`, `delete`, `duplicate`, `bulkUpdateDefaultAvailability` etc. A entrada HTTP é `apps/web/pages/api/trpc/availability/[trpc].ts`
- **Persistência e regras**: `packages/features/schedules/repositories/ScheduleRepository.ts`, `packages/features/schedules/services/ScheduleService.ts`, `packages/lib/availability.ts` (`DEFAULT_SCHEDULE`, `getAvailabilityFromSchedule`, `getWorkingHours`), `packages/lib/schedules/transformers/*`
- **Modelo**: tabelas `Schedule` e `Availability` no Prisma. As migrações estão em `packages/prisma/migrations/*schedule*` e `*availability*`

## 2. Cálculo de slots (o caminho principal)

Esta é a cadeia de chamadas, de cima para baixo:

```
Booker (cliente)
  apps/web/modules/bookings/components/Booker.tsx / DatePicker.tsx / AvailableTimeSlots.tsx
  └─ apps/web/modules/schedules/hooks/useSchedule.ts
       ├─ trpc.viewer.slots.getSchedule      (padrão)
       └─ useApiV2AvailableSlots.ts          (eventos de time com flag de API v2)

tRPC
  apps/web/pages/api/trpc/slots/[trpc].ts
  packages/trpc/server/routers/viewer/slots/_router.tsx
  packages/trpc/server/routers/viewer/slots/getSchedule.handler.ts
     └─ getAvailableSlotsService()  ← DI: packages/features/di/containers/AvailableSlots.ts
                                         packages/features/di/modules/AvailableSlots.ts

Orquestração
  packages/trpc/server/routers/viewer/slots/util.ts  → classe AvailableSlotsService
     _getAvailableSlots (≈l.897)
       ├─ calculateHostsAndAvailabilities (≈l.678) → userAvailabilityService.getUsersAvailability
       ├─ getAggregatedAvailability(...)            (combina hosts conforme schedulingType)
       ├─ getSlots(...)                             (fatia em slots pela duração/intervalo)
       ├─ limites de booking/duração, assentos, slots reservados (selectedSlotRepo)
       ├─ filterSlotsByRequestedDateRange
       └─ noSlotsNotificationService (aviso quando não há slots)

Disponibilidade por usuário
  packages/features/availability/lib/getUserAvailability.ts → UserAvailabilityService._getUserAvailability (l.361)
     1. detectEventTypeScheduleForUser   → qual schedule usar (do event type ou o padrão)
     2. resolve o fuso (calendário delegado → schedule.timeZone)
     3. OOO (oooRepo) + calculateHolidayBlockedDates (l.822)
     4. travel schedules (só no schedule padrão)
     5. buildDateRanges(...)              → faixas disponíveis no fuso do schedule
     6. getBusyTimesFromLimits / getBusyTimesFromTeamLimits
     7. BusyTimesService.getBusyTimes     → bookings + calendários externos
     8. subtract(dateRanges, busy)        → faixas livres
```

Arquivos de cada etapa:

- **Escolha do schedule e dos usuários**: `packages/features/availability/lib/detectEventTypeScheduleForUser.ts`, `findUsersForAvailabilityCheck.ts`
- **Montagem das faixas de data**: `packages/features/schedules/lib/date-ranges.ts` (`processWorkingHours`, `processDateOverride`, `buildDateRanges`, `intersect`, `subtract`, `mergeOverlappingRanges`)
- **Horários ocupados**: `packages/features/busyTimes/services/getBusyTimes.ts`, `packages/features/busyTimes/lib/getBusyTimesFromLimits.ts`. Os containers de DI estão em `packages/features/di/{containers,modules}/BusyTimes.ts` e `GetUserAvailability.ts`
- **Agregação entre hosts**: `packages/features/availability/lib/getAggregatedAvailability/getAggregatedAvailability.ts`, mais `date-range-utils/mergeOverlappingDateRanges.ts` e `filterRedundantDateRanges.ts`
- **Geração dos slots**: `packages/features/schedules/lib/slots.ts`
- **Feriados, OOO e viagens**: `packages/lib/holidays/HolidayService.ts` (e o resto da pasta), `packages/features/travelSchedule/repositories/TravelScheduleRepository.ts`
- **Slots reservados**: `packages/features/selectedSlots/repositories/PrismaSelectedSlotRepository.ts`, `packages/trpc/server/routers/viewer/slots/reserveSlot.handler.ts`
- **Aviso de "sem slots"**: `packages/features/slots/handleNotificationWhenNoSlots.ts`
- **Tipos**: `packages/trpc/server/routers/viewer/slots/types.ts`, `packages/types/schedule.d.ts`, `packages/types/BufferedBusyTime.d.ts`

## 3. Exibição no Booker

- **Hooks**: `apps/web/modules/schedules/hooks/useSlotsForDate.ts`, `useNonEmptyScheduleDays.ts`, `packages/features/bookings/Booker/hooks/useAvailableTimeSlots.ts`, `packages/features/schedules/hooks/useTimesForSchedule.ts`
- **Componentes**: `apps/web/modules/bookings/components/AvailableTimeSlots.tsx`, `AvailableTimes.tsx`, `OutOfOfficeInSlots.tsx`, `packages/features/calendars/lib/getAvailableDatesInMonth.ts`
- **Aviso de horário comercial**: `packages/features/bookings/Booker/utils/businessHours.ts` (exibido em `BookEventForm.tsx`). Ele só avisa e não bloqueia nem filtra slots. Fica fora do cálculo de disponibilidade.

## 4. Revalidação no momento de reservar

- `packages/trpc/server/routers/viewer/slots/isAvailable.handler.ts`
- `packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts`, que roda `getUserAvailability` de novo antes de criar o booking
- `packages/features/bookings/Booker/utils/isTimeslotAvailable.ts` (verificação no cliente)

## 5. API v2 (Platform e Atoms)

A API v2 reaproveita o mesmo `AvailableSlotsService`, exportado por `packages/platform/libraries/slots.ts`:

- `apps/api/v2/src/lib/services/available-slots.service.ts`, `user-availability.service.ts`
- `apps/api/v2/src/modules/slots/slots-2024-09-04/` (controller, `services/slots.service.ts`, input/output services). Também existe a versão `slots-2024-04-15/`
- Schedules: `apps/api/v2/src/platform/schedules/schedules_2024_06_11/` e `schedules_2024_04_15/`
- Atoms: `packages/platform/atoms/hooks/useAvailableSlots.ts`, `useSlots.ts`, `hooks/schedules/*`

## Divergências com o CLAUDE.md

- **Feriados:** `getUserAvailability.ts:476` e `:822` bloqueiam feriados automaticamente quando o usuário tem um `countryCode` configurado. Sem essa configuração, nada é bloqueado, o que respeita "nada bloqueado por padrão". Ainda assim, isso vai contra a regra "sem calendário automático de feriados".
- **Fuso:** o servidor usa o fuso do calendário delegado ou `schedule.timeZone` (`:422-434`). Isso não segue a cadeia definida no CLAUDE.md (perfil → fuso do navegador → UTC). Só o `businessHours.ts` aplica explicitamente o fallback para UTC.
