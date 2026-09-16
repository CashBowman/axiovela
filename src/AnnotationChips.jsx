import React from "react";
import { X } from "lucide-react";
export default function AnnotationChips({
  notes,
  onEdit,
  onRemove,
  sent = false,
}) {
  if (!notes.length) return null;
  return (
    <div
      className={"annotationChips " + (sent ? "sentAnnotations" : "")}
      aria-label={sent ? "Sent annotations" : "Unsent annotations"}
    >
      {notes.map((note, i) => (
        <div className="annotationChip" key={note.id}>
          <button
            className="annotationChipBody"
            onClick={() => onEdit?.(note)}
            disabled={sent}
            title={
              (note.title ? note.title + "\n" : "") +
              (note.anchor.quote || "Selected passage") +
              "\n\n" +
              note.comment
            }
          >
            <span className="chipNumber">{i + 1}</span>
            <span>{note.comment}</span>
          </button>
          {!sent && (
            <button
              className="chipRemove"
              aria-label={"Remove annotation " + (i + 1) + " from message"}
              onClick={() => onRemove(note.id)}
            >
              <X size={12} />
            </button>
          )}
          {sent && (
            <details>
              <summary>
                {note.title || "Passage"}
                {note.anchor.page ? " · page " + note.anchor.page : ""}
              </summary>
              <blockquote>{note.anchor.quote}</blockquote>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
