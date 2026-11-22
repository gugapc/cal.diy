import { showToast } from "@calcom/ui/components/toast";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { CopyBookingSummaryButton } from "./CopyBookingSummaryButton";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

vi.mock("@calcom/ui/components/toast", () => ({
  showToast: vi.fn(),
}));

const SUMMARY = [
  "Title: 30 min meeting",
  "Date: Monday, November 23, 2026",
  "Time: 10:00 AM - 10:30 AM",
  "Timezone: Brasilia Standard Time (America/Sao_Paulo)",
  "Location: Av. Paulista, 1000",
].join("\n");

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function mockClipboard(clipboard: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
}

describe("CopyBookingSummaryButton", () => {
  let writeText: Mock<Clipboard["writeText"]>;

  beforeEach(() => {
    vi.mocked(showToast).mockClear();
    writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    mockClipboard({ writeText });
  });

  afterEach(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    } else {
      delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it("renders the copy summary button", () => {
    render(<CopyBookingSummaryButton summary={SUMMARY} />);

    const button = screen.getByTestId("copy-booking-summary");
    expect(button).toHaveTextContent("copy_summary");
    expect(button).toHaveAttribute("type", "button");
  });

  it("copies the summary to the clipboard and confirms with a success toast", async () => {
    render(<CopyBookingSummaryButton summary={SUMMARY} />);

    fireEvent.click(screen.getByTestId("copy-booking-summary"));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(SUMMARY);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("booking_summary_copied", "success"));
    expect(screen.getByTestId("copy-booking-summary")).toHaveTextContent("copied");
  });

  it("shows an error toast and keeps the label when the clipboard rejects the write", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    render(<CopyBookingSummaryButton summary={SUMMARY} />);

    fireEvent.click(screen.getByTestId("copy-booking-summary"));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith("error_copying_to_clipboard", "error"));
    expect(showToast).not.toHaveBeenCalledWith("booking_summary_copied", "success");
    expect(screen.getByTestId("copy-booking-summary")).toHaveTextContent("copy_summary");
    consoleError.mockRestore();
  });

  it("shows an error toast when the Clipboard API is unavailable", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockClipboard(undefined);
    render(<CopyBookingSummaryButton summary={SUMMARY} />);

    fireEvent.click(screen.getByTestId("copy-booking-summary"));

    expect(showToast).toHaveBeenCalledWith("error_copying_to_clipboard", "error");
    expect(screen.getByTestId("copy-booking-summary")).toHaveTextContent("copy_summary");
    consoleWarn.mockRestore();
  });
});
