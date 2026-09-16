import React, { useEffect, useRef, useState } from "react";
import { reviewDraft } from "../shared/annotations.mjs";
export default function RevisionReview({
  record,
  request,
  onApplied,
  beforeApply,
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    dialog = useRef();
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  let proposal;
  try {
    proposal = reviewDraft(record.output || "", record.review.format);
  } catch (e) {
    proposal = null;
  }
  if (record.status !== "complete" || !proposal) return null;
  return (
    <>
      <button className="textButton" onClick={() => setOpen(true)}>
        Review proposed revision
      </button>
      {open && (
        <dialog
          className="revisionDialog"
          ref={dialog}
          onCancel={() => setOpen(false)}
        >
          <h2>Review proposed revision</h2>
          <div className="revisionColumns">
            <section>
              <h3>Current source at request</h3>
              <pre>{record.review.source}</pre>
            </section>
            <section>
              <h3>Proposed source</h3>
              <pre>{proposal}</pre>
            </section>
          </div>
          {error && <p role="alert">{error}</p>}
          <button onClick={() => setOpen(false)}>Keep current draft</button>
          <button
            className="newBtn"
            onClick={async () => {
              try {
                await beforeApply?.(record);
                await request("/api/annotations/apply", {
                  method: "POST",
                  headers: { "x-axiovela-project": record.projectRoot },
                  body: JSON.stringify({ id: record.id }),
                });
                setOpen(false);
                onApplied?.();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Apply revision
          </button>
        </dialog>
      )}
    </>
  );
}
