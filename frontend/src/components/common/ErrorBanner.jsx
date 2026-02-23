// frontend/src/components/common/ErrorBanner.jsx

export default function ErrorBanner({ title, body }) {
  if (!title && !body) return null;

  return (
    <div className="errorBanner">
      {title ? <strong>{title}</strong> : null}
      {body ? <div style={{ marginTop: 6, whiteSpace: "pre-line" }}>{body}</div> : null}
    </div>
  );
}