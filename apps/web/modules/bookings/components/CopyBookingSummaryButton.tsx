"use client";

import { useCopy } from "@calcom/lib/hooks/useCopy";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";

type CopyBookingSummaryButtonProps = {
  /** Plain-text summary that will be written to the clipboard. */
  summary: string;
  className?: string;
};

export function CopyBookingSummaryButton({ summary, className }: CopyBookingSummaryButtonProps) {
  const { t } = useLocale();
  const { isCopied, copyToClipboard } = useCopy();

  return (
    <Button
      type="button"
      color="secondary"
      className={className}
      data-testid="copy-booking-summary"
      StartIcon={isCopied ? "clipboard-check" : "clipboard"}
      onClick={() =>
        copyToClipboard(summary, {
          onSuccess: () => showToast(t("booking_summary_copied"), "success"),
          onFailure: () => showToast(t("error_copying_to_clipboard"), "error"),
        })
      }>
      {isCopied ? t("copied") : t("copy_summary")}
    </Button>
  );
}
