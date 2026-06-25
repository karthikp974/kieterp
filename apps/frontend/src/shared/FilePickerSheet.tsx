import { Camera, FolderOpen, Image, X } from "lucide-react";

import { useEffect, useId, useRef, useState } from "react";

import { createPortal } from "react-dom";

import { useToast } from "./toast-context";



export type FilePickerMode = "image" | "documents" | "pdf" | "any";



type Props = {

  open: boolean;

  onClose: () => void;

  onFile: (file: File) => void;

  mode?: FilePickerMode;

  /** Show Google Drive row (picker not integrated — shows info toast). */

  showGoogleDrive?: boolean;

};



function acceptForMode(mode: FilePickerMode): string {

  if (mode === "image") return "image/jpeg,image/png,image/webp,image/gif,image/*";

  if (mode === "pdf") return "application/pdf,.pdf";

  if (mode === "documents") {

    return ".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*";

  }

  return "*/*";

}



function GoogleDriveIcon() {

  return (

    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>

      <path fill="#4285F4" d="M8.4 2L2 13.2h6.4L15 2H8.4z" />

      <path fill="#FFBA00" d="M2 13.2l3.2 5.5h12.8l3.2-5.5H2z" />

      <path fill="#00AC47" d="M8.4 2l6.6 11.2h6.6L15 2H8.4z" />

    </svg>

  );

}



export function FilePickerSheet({ open, onClose, onFile, mode = "any", showGoogleDrive = false }: Props) {

  const { showToast } = useToast();

  const uid = useId();

  const galleryId = `${uid}-gallery`;

  const cameraId = `${uid}-camera`;

  const fileId = `${uid}-file`;

  const galleryRef = useRef<HTMLInputElement>(null);

  const cameraRef = useRef<HTMLInputElement>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const accept = acceptForMode(mode);



  useEffect(() => {

    if (!open) return;

    function onKey(event: KeyboardEvent) {

      if (event.key === "Escape") onClose();

    }

    document.addEventListener("keydown", onKey);

    const prev = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {

      document.removeEventListener("keydown", onKey);

      document.body.style.overflow = prev;

    };

  }, [open, onClose]);



  function pick(file: File | undefined, input: HTMLInputElement | null) {

    if (!file) return;

    onFile(file);

    onClose();

    if (input) input.value = "";

  }



  if (!open) return null;



  const showCamera = mode === "image" || mode === "any";

  const showGallery = mode === "image" || mode === "documents" || mode === "any";

  const showDrive = showGoogleDrive && mode !== "pdf";



  return createPortal(

    <>

      <div className="erp-file-picker-inputs-host" aria-hidden>

        {showGallery ? (

          <input

            id={galleryId}

            ref={galleryRef}

            type="file"

            accept={accept}

            className="erp-file-picker-native-input"

            onChange={(e) => pick(e.target.files?.[0], e.target)}

          />

        ) : null}

        {showCamera ? (

          <input

            id={cameraId}

            ref={cameraRef}

            type="file"

            accept="image/*"

            capture="user"

            className="erp-file-picker-native-input"

            onChange={(e) => pick(e.target.files?.[0], e.target)}

          />

        ) : null}

        <input

          id={fileId}

          ref={fileRef}

          type="file"

          accept={accept}

          className="erp-file-picker-native-input"

          onChange={(e) => pick(e.target.files?.[0], e.target)}

        />

      </div>



      <div className="erp-confirm-overlay erp-file-picker-overlay" role="presentation" onClick={onClose}>

        <section

          className="erp-export-dialog erp-file-picker-dialog"

          role="dialog"

          aria-modal="true"

          aria-labelledby="erp-file-picker-title"

          onClick={(e) => e.stopPropagation()}

        >

          <div className="erp-export-dialog-head">

            <h2 id="erp-file-picker-title">Choose source</h2>

            <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">

              <X size={18} aria-hidden />

            </button>

          </div>

          <p className="erp-export-dialog-lead">Use photo library, camera, or a file from your device.</p>

          <div className="erp-export-dialog-options">

            {showGallery ? (

              <label htmlFor={galleryId} className="erp-export-option erp-file-picker-option">

                <Image size={18} aria-hidden />

                Photo library

              </label>

            ) : null}

            {showCamera ? (

              <label htmlFor={cameraId} className="erp-export-option erp-file-picker-option">

                <Camera size={18} aria-hidden />

                Take photo

              </label>

            ) : null}

            <label htmlFor={fileId} className="erp-export-option erp-file-picker-option">

              <FolderOpen size={18} aria-hidden />

              Choose file

            </label>

            {showDrive ? (

              <button

                type="button"

                className="erp-export-option erp-export-option--muted erp-file-picker-option"

                onClick={() => {

                  showToast("Google Drive is not connected yet. Use Choose file.", "info");

                }}

              >

                <GoogleDriveIcon />

                Google Drive

              </button>

            ) : null}

            <button type="button" className="erp-file-picker-cancel-link" onClick={onClose}>

              Cancel

            </button>

          </div>

        </section>

      </div>

    </>,

    document.body

  );

}



/** Button + sheet — use instead of raw `<input type="file">`. */

export function FilePickerTrigger({

  label,

  hint,

  fileName,

  mode = "any",

  showGoogleDrive = false,

  disabled,

  onFile,

  className = "erp-file-picker-trigger"

}: {

  label: string;

  hint?: string;

  fileName?: string | null;

  mode?: FilePickerMode;

  showGoogleDrive?: boolean;

  disabled?: boolean;

  onFile: (file: File) => void;

  className?: string;

}) {

  const [open, setOpen] = useState(false);



  return (

    <>

      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>

        <span className="erp-file-picker-trigger-label">{fileName || label}</span>

        {hint && !fileName ? <span className="erp-file-picker-trigger-hint">{hint}</span> : null}

      </button>

      <FilePickerSheet

        open={open}

        onClose={() => setOpen(false)}

        mode={mode}

        showGoogleDrive={showGoogleDrive}

        onFile={(file) => {

          onFile(file);

          setOpen(false);

        }}

      />

    </>

  );

}


