import { getSuccessPageLocationMessage, guessEventLocationType } from "@calcom/app-store/locations";
import { getEventName } from "@calcom/features/eventtypes/lib/eventNaming";
import { useRouterQuery } from "@calcom/lib/hooks/useRouterQuery";
import { BookingStatus, SchedulingType } from "@calcom/prisma/enums";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import Success from "./bookings-single-view";
import type { PageProps } from "./bookings-single-view.getServerSideProps";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/booking/booking-uid",
}));

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

vi.mock("@calcom/lib/hooks/useRouterQuery", () => ({ useRouterQuery: vi.fn() }));
vi.mock("@calcom/lib/hooks/useCompatSearchParams", () => ({
  useCompatSearchParams: () => new URLSearchParams(),
}));
vi.mock("@calcom/lib/hooks/useTheme", () => ({ default: vi.fn() }));
vi.mock("@calcom/lib/getBrandColours", () => ({ default: vi.fn() }));
vi.mock("@calcom/ui/styles", () => ({ useCalcomTheme: vi.fn() }));

vi.mock("@calcom/embed-core/embed-iframe", () => ({
  useIsEmbed: () => false,
  useIsBackgroundTransparent: () => false,
  useEmbedNonStylesConfig: () => undefined,
}));

vi.mock("@calcom/app-store/locations", () => ({
  getSuccessPageLocationMessage: vi.fn(),
  guessEventLocationType: vi.fn(),
}));
vi.mock("@calcom/app-store/BookingPageTagManager", () => ({ default: () => null }));
vi.mock("@calcom/app-store/utils", () => ({ getEventTypeAppData: () => null }));
vi.mock("@calcom/features/eventtypes/lib/eventNaming", () => ({ getEventName: vi.fn() }));
vi.mock("@calcom/features/bookings/lib/getCalendarLinks", () => ({
  getCalendarLinks: () => [],
  CalendarLinkType: {},
}));
vi.mock("@calcom/features/bookings/components/event-meta/Price", () => ({ Price: () => null }));

vi.mock("@calcom/trpc/react", () => {
  const useMutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    trpc: { viewer: { public: { submitRating: { useMutation }, markHostAsNoShow: { useMutation } } } },
  };
});

vi.mock("@calcom/web/components/booking/CancelBooking", () => ({ default: () => null }));
vi.mock("@calcom/web/components/schemas/EventReservationSchema", () => ({ default: () => null }));
vi.mock("@calcom/web/lib/clock", () => ({ timeZone: () => "UTC" }));
vi.mock("@calcom/ui/components/toast", () => ({ showToast: vi.fn() }));

const EVENT_NAME = "30 min meeting between Jane Doe and John Smith";

function buildProps({
  bookingInfo,
  eventType,
}: {
  bookingInfo?: Record<string, unknown>;
  eventType?: Record<string, unknown>;
} = {}): PageProps {
  return {
    eventType: {
      id: 1,
      title: "30 min",
      eventName: null,
      isDynamic: false,
      schedulingType: null,
      requiresConfirmation: false,
      recurringEvent: null,
      metadata: null,
      bookingFields: [],
      hosts: [],
      users: [],
      owner: null,
      team: null,
      ...eventType,
    },
    profile: {
      name: "Jane Doe",
      theme: null,
      brandColor: null,
      darkBrandColor: null,
      slug: null,
    },
    bookingInfo: {
      id: 1,
      uid: "booking-uid",
      title: "Booking title from DB",
      description: null,
      startTime: "2026-11-23T13:00:00.000Z",
      endTime: "2026-11-23T13:30:00.000Z",
      status: BookingStatus.ACCEPTED,
      location: "Av. Paulista, 1000 - São Paulo",
      metadata: null,
      responses: { name: "John Smith", email: "john@example.com" },
      attendees: [{ name: "John Smith", email: "john@example.com", timeZone: "America/Sao_Paulo" }],
      user: { name: "Jane Doe", email: "jane@example.com", avatarUrl: null, timeZone: "America/Sao_Paulo" },
      userPrimaryEmail: "jane@example.com",
      eventType: null,
      seatsReferences: [],
      cancellationReason: null,
      rejectionReason: null,
      rescheduled: false,
      fromReschedule: null,
      tracking: null,
      assignmentReason: [],
      ...bookingInfo,
    },
    tz: "America/Sao_Paulo",
    userTimeFormat: 24,
    hideBranding: true,
    requiresLoginToUpdate: false,
    recurringBookings: null,
    previousBooking: null,
    paymentStatus: null,
    rescheduledToUid: null,
    isLoggedInUserHost: false,
    canViewHiddenData: false,
    internalNotePresets: [],
  } as unknown as PageProps;
}

let writeText: Mock<Clipboard["writeText"]>;

async function copySummary() {
  fireEvent.click(screen.getByTestId("copy-booking-summary"));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  // Newer ICU versions may use narrow no-break spaces in formatted dates
  return writeText.mock.calls[0][0].replace(/[\u202f\u00a0]/g, " ");
}

describe("Booking confirmation page - copy summary", () => {
  beforeEach(() => {
    writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    vi.mocked(useRouterQuery).mockReturnValue({ uid: "booking-uid", isSuccessBookingPage: "true" });
    vi.mocked(useSession).mockReturnValue({ data: null, status: "unauthenticated", update: vi.fn() });
    vi.mocked(getEventName).mockReturnValue(EVENT_NAME);
    vi.mocked(getSuccessPageLocationMessage).mockImplementation((location) => location);
    vi.mocked(guessEventLocationType).mockReturnValue(undefined);
  });

  it("copies the title, date, time, time zone and location of the booking", async () => {
    render(<Success {...buildProps()} />);

    expect(await copySummary()).toBe(
      [
        `title: ${EVENT_NAME}`,
        "date: Monday, November 23, 2026",
        "time: 10:00 - 10:30",
        "timezone: Brasilia Standard Time (America/Sao_Paulo)",
        "location: Av. Paulista, 1000 - São Paulo",
      ].join("\n")
    );
  });

  it("copies the new location when the booking was rescheduled to a different one", async () => {
    render(
      <Success
        {...buildProps({
          bookingInfo: {
            location: "Old office",
            responses: {
              name: "John Smith",
              location: { value: "attendeeInPerson", optionValue: "New office" },
            },
          },
        })}
      />
    );

    const summary = await copySummary();
    expect(summary).toContain("location: New office");
    expect(summary).not.toContain("Old office");
  });

  it("uses the booking title for round-robin events, as shown in the 'What' section", async () => {
    render(<Success {...buildProps({ eventType: { schedulingType: SchedulingType.ROUND_ROBIN } })} />);

    expect(screen.getByTestId("booking-title")).toHaveTextContent("Booking title from DB");
    expect(await copySummary()).toContain("title: Booking title from DB");
  });

  it("does not show the button for cancelled bookings", () => {
    render(<Success {...buildProps({ bookingInfo: { status: BookingStatus.CANCELLED } })} />);

    expect(screen.getByTestId("cancelled-headline")).toBeInTheDocument();
    expect(screen.queryByTestId("copy-booking-summary")).not.toBeInTheDocument();
  });
});
