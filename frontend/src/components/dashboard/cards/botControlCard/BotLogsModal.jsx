// frontend/src/components/dashboard/cards/botControlCard/BotLogsModal.jsx

import Modal from "../../common/Modal.jsx";
import ModalButton from "../../common/ModalButton.jsx";
import LogEventCard from "../../../common/LogEventCard.jsx";

/**
 * Log modal for recent bot events.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   busy: boolean,
 *   items: any[],
 *   logSeverity: (item: any) => "info" | "warn" | "error",
 *   toneClass: (sev: "info" | "warn" | "error") => string,
 *   logMessageFor: (item: any) => string,
 *   safeJson: (value: any) => string
 * }} props
 * @returns {JSX.Element}
 */
export default function BotLogsModal({
  open,
  onClose,
  busy,
  items,
  logSeverity,
  toneClass,
  logMessageFor,
  safeJson,
}) {
  const hasItems = Array.isArray(items) && items.length > 0;

  return (
    <Modal
      open={open}
      title="Recent bot events"
      onClose={onClose}
      footer={
        <ModalButton onClick={onClose} disabled={busy}>
          Close
        </ModalButton>
      }
    >
      {!hasItems && busy ? (
        <div className="botModalLoading">Loading events…</div>
      ) : !hasItems ? (
        <div className="botModalLoading">No events yet.</div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gap: 10,
              maxHeight: "62vh",
              overflow: "auto",
              paddingRight: 6,
            }}
          >
            {items.map((item, index) => (
              <LogEventCard
                key={
                  item?.request_id ||
                  item?.event_id ||
                  `${index}-${item?.ts || "0"}`
                }
                item={item}
                index={index}
                logSeverity={logSeverity}
                toneClass={toneClass}
                logMessageFor={logMessageFor}
                safeJson={safeJson}
              />
            ))}
          </div>

          {busy ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 0,
                paddingTop: 10,
                paddingLeft: 8,
                opacity: 0.75,
                fontWeight: 800,
                fontSize: 12,
              }}
              aria-live="polite"
            >
              <span
                className="botCardSoftSpinner"
                aria-label="Updating logs"
                title="Updating…"
                style={{
                  marginLeft: 0,
                  marginRight: 10,
                  flex: "0 0 auto",
                  position: "static",
                }}
              />
              Updating…
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}