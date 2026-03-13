LogEventCard.jsx// frontend/src/components/dashboard/cards/botControlCard/LogEventCard.jsx

import { fmtTime, safeStr } from "../../lib/format/botFormat.js";

/**
 * Renders a single log event block inside the log modal.
 *
 * Supports the new bot_logs shape while remaining tolerant of legacy fields.
 *
 * @param {{
 *   item: any,
 *   index: number,
 *   logSeverity: (item: any) => "info" | "warn" | "error",
 *   toneClass: (sev: "info" | "warn" | "error") => string,
 *   logMessageFor: (item: any) => string,
 *   safeJson: (value: any) => string
 * }} props
 * @returns {JSX.Element}
 */
export default function LogEventCard({
  item,
  index,
  logSeverity,
  toneClass,
  logMessageFor,
  safeJson,
}) {
  const sev = logSeverity(item);
  const headline = logMessageFor(item) || "Update";
  const action =
    safeStr(item?.action || item?.event_type, "").replaceAll("_", " ") || "Log";
  const source = safeStr(item?.source, "system");
  const eventKey =
    item?.request_id ||
    item?.event_id ||
    item?.id ||
    `${index}-${item?.ts || "0"}`;

  const details =
    item?.details && typeof item.details === "object" ? item.details : {};

  const rawPayload =
    item?.details && typeof item.details === "object"
      ? item.details
      : item?.payload && typeof item.payload === "object"
        ? item.payload
        : null;

  const technicalMessage = safeStr(item?.technical_message, "");
  const runnerId = safeStr(item?.runner_id, "");
  const desiredState = safeStr(item?.desired_state, "");
  const runtimeState = safeStr(item?.runtime_state, "");

  return (
    <div className={toneClass(sev)} key={eventKey}>
      <div className="blog-evtTop">
        <div className="blog-evtLeft">
          <div className="blog-evtTitle">{headline}</div>

          <div className="blog-evtSub">
            <span className="blog-evtChip">{source || "system"}</span>
            <span className="blog-evtDot">•</span>
            <span className="blog-evtChip blog-evtChip--soft">{action}</span>
            <span className="blog-evtDot">•</span>
            <span className="mMono">{item?.ts ? fmtTime(item.ts) : "—"}</span>
          </div>
        </div>

        <div className="blog-evtRight">
          <span className={`blog-level blog-level--${sev}`}>
            {sev === "info" ? "OK" : sev === "warn" ? "WARN" : "ERROR"}
          </span>
        </div>
      </div>

      <div className="blog-evtDetails">
        <details>
          <summary>Raw log</summary>

          <div className="blog-rawGrid">
            <div className="blog-rawLabel">Level</div>
            <div className="mMono">
              {safeStr(item?.level || item?.status, "info").toUpperCase()}
            </div>

            <div className="blog-rawLabel">Action</div>
            <div className="mMono">
              {safeStr(item?.action || item?.event_type, "—")}
            </div>

            <div className="blog-rawLabel">Source</div>
            <div className="mMono">{safeStr(item?.source, "—")}</div>

            <div className="blog-rawLabel">Message</div>
            <div>{headline}</div>

            {technicalMessage ? (
              <>
                <div className="blog-rawLabel">Technical</div>
                <div>{technicalMessage}</div>
              </>
            ) : null}

            {runnerId ? (
              <>
                <div className="blog-rawLabel">Runner</div>
                <div className="mMono">{runnerId}</div>
              </>
            ) : null}

            {desiredState ? (
              <>
                <div className="blog-rawLabel">Desired</div>
                <div className="mMono">{desiredState}</div>
              </>
            ) : null}

            {runtimeState ? (
              <>
                <div className="blog-rawLabel">Runtime</div>
                <div className="mMono">{runtimeState}</div>
              </>
            ) : null}

            <div className="blog-rawLabel">Details</div>
            <pre className="mMono blog-pre">
              {rawPayload
                ? safeJson(rawPayload)
                : Object.keys(details).length
                  ? safeJson(details)
                  : "—"}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}