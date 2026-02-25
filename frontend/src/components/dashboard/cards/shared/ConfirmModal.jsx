// frontend/src/components/dashboard/cards/shared/ConfirmModal.jsx
import React from "react";
import Modal from "../../../common/Modal.jsx";

/**
 * ConfirmModal
 * Standard "Cancel + Primary" footer pattern for Modals.
 */
export default function ConfirmModal({
  open,
  title,
  onClose,
  busy = false,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  confirmDisabled = false,
  onConfirm,
  children,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="mBtn" type="button" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className="mBtn mBtnPrimary"
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}