// frontend/src/common/ModalButton.jsx

/**
 * Shared modal footer button.
 *
 * @param {{
 *   children: React.ReactNode,
 *   onClick?: () => void,
 *   disabled?: boolean,
 *   primary?: boolean,
 *   type?: "button" | "submit" | "reset"
 * }} props
 * @returns {JSX.Element}
 */
export default function ModalButton({
  children,
  onClick,
  disabled = false,
  primary = false,
  type = "button",
}) {
  return (
    <button
      className={`mBtn ${primary ? "mBtnPrimary" : ""}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}